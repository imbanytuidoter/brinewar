import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyError } from "fastify";
import { PublicKey } from "near-api-js";
import type { Logger } from "pino";
import type { AdmiraltyView, GameView, PlayerView, ShotView, TreasuryView } from "../lib/contract.js";
import { GUEST_GAS_TGAS } from "../lib/contract.js";
import type { Store } from "../lib/db.js";
import { freshCaptain, LiveLeaderboard, type Leaderboard } from "../lib/leaderboard.js";
import { registerChat } from "./chat.js";
import type { Caller, Viewer } from "../lib/near.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NICKNAME = /^[A-Za-z0-9_-]{3,16}$/;
const CACHE_MS = 5000;
const LEADERBOARD_MS = 600_000;
const ACCOUNT_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const CACHE_CAP = 5000;
const LEADERBOARD_SEEDS = 50;
const LEADERBOARD_BATCH = 3;

export function limitKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v4) return v4[1] as string;
  const groups = ip.split("::")[0]?.split(":") ?? [];
  return `${groups.slice(0, 4).join(":")}::/64`;
}

export interface PublicMove {
  kind: string;
  source: string;
  chat_id: string | null;
  request: string | null;
  response: string | null;
  signature: string | null;
  signed_text: string | null;
  error: string | null;
  tx: string | null;
  at: number;
}

export interface AppOptions {
  readonly viewer: Viewer;
  readonly sponsor: Caller;
  readonly store: Store;
  readonly log: Logger;
  readonly guestsPerIpHour: number;
  readonly guestsPerDay: number;
  readonly trustProxy: number;
  readonly balanceOf?: (accountId: string) => Promise<bigint>;
  readonly refuelBelow?: bigint;
  readonly now?: () => number;
  readonly sampledAt?: () => number | null;
  readonly sampleMs?: number;
  readonly liveMs?: number;
}

function isEd25519(key: unknown): key is string {
  if (typeof key !== "string" || !key.startsWith("ed25519:") || key.length > 100) return false;
  try {
    return PublicKey.fromString(key).toString() === key;
  } catch {
    return false;
  }
}

export async function buildApp(o: AppOptions) {
  const now = o.now ?? Date.now;
  const app = Fastify({ loggerInstance: o.log, trustProxy: o.trustProxy > 0 ? (_addr: string, hop: number) => hop < o.trustProxy : false, bodyLimit: 4096 });
  await app.register(rateLimit, { max: 240, timeWindow: "1 minute", keyGenerator: (req) => limitKey(req.ip) });
  app.setErrorHandler((err: FastifyError, req, reply) => {
    req.log.error({ err: err.message }, "request failed");
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    void reply.code(status).send({ error: status === 429 ? "slow down" : status < 500 ? err.message : "internal error" });
  });

  const inflight = new Map<string, Promise<{ status: number; body: unknown }>>();
  const cache = new Map<string, { at: number; body: unknown }>();
  const cached = async (key: string, load: () => Promise<unknown>): Promise<unknown> => {
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) return hit.body;
    const body = await load();
    if (cache.size >= CACHE_CAP) cache.clear();
    cache.set(key, { at: now(), body });
    return body;
  };

  app.get("/health", async (_req, reply) => {
    const last = o.store.lastSample("treasury");
    const ran = o.sampledAt?.() ?? null;
    const stale = o.sampledAt !== undefined && o.sampleMs !== undefined && (ran === null || now() - ran > 3 * o.sampleMs);
    return reply.code(stale ? 503 : 200).send({ ok: !stale, lastSampleAgeMs: last ? now() - last.at : null, lastSampleRunAgeMs: ran === null ? null : now() - ran });
  });

  app.post("/api/guest", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = (req.body ?? {}) as { publicKey?: unknown; nickname?: unknown };
    if (!isEd25519(body.publicKey)) return reply.code(400).send({ error: "publicKey must be an ed25519 public key" });
    const nickname = body.nickname === undefined || body.nickname === null ? null : body.nickname;
    if (nickname !== null && (typeof nickname !== "string" || !NICKNAME.test(nickname))) {
      return reply.code(400).send({ error: "nickname must be 3-16 characters of A-Z a-z 0-9 _ -" });
    }
    const publicKey = body.publicKey;
    const running = inflight.get(publicKey);
    const job =
      running ??
      (async (): Promise<{ status: number; body: unknown }> => {
        const accountId = await o.viewer.view<string>("guest_account_for", { public_key: publicKey });
        const existing = await o.viewer.view<PlayerView | null>("get_player", { account_id: accountId });
        if (existing) {
          const low =
            o.balanceOf && o.refuelBelow !== undefined
              ? await o.balanceOf(accountId).catch((err: unknown) => {
                  req.log.warn({ accountId, err: err instanceof Error ? err.message : String(err) }, "could not read the guest balance, refuel skipped");
                  return null;
                })
              : null;
          if (low === null || o.refuelBelow === undefined || low >= o.refuelBelow) return { status: 200, body: { accountId, created: false } };
          const slot = o.store.reserveGuest(limitKey(req.ip), accountId, o.guestsPerIpHour, o.guestsPerDay, now() - HOUR, now() - DAY);
          if (typeof slot !== "number") {
            req.log.warn({ accountId, limit: slot }, "refuel refused by the guest limit");
            return { status: 200, body: { accountId, created: false, refueled: false } };
          }
          const r = await o.sponsor.call("create_guest", { public_key: publicKey, nickname: null }, GUEST_GAS_TGAS);
          const refueled = r.ok && r.value === true;
          o.store.finishGuest(slot, r.txHash, refueled);
          if (!refueled) req.log.warn({ accountId, tx: r.txHash, error: r.error }, "refuel failed");
          return { status: 200, body: { accountId, created: false, refueled, txHash: r.txHash } };
        }
        const slot = o.store.reserveGuest(limitKey(req.ip), accountId, o.guestsPerIpHour, o.guestsPerDay, now() - HOUR, now() - DAY);
        if (slot === "ip") return { status: 429, body: { error: "too many new captains from this address, try again later" } };
        if (slot === "day") return { status: 429, body: { error: "the harbour is full today, try again tomorrow" } };
        const r = await o.sponsor.call("create_guest", { public_key: publicKey, nickname }, GUEST_GAS_TGAS);
        const ok = r.ok ? r.value === true : (await o.viewer.view<PlayerView | null>("get_player", { account_id: accountId }).catch(() => null)) !== null;
        if (!r.ok && ok) req.log.warn({ accountId, error: r.error }, "create_guest outcome was late but the captain is registered");
        o.store.finishGuest(slot, r.txHash, ok);
        if (!ok) {
          req.log.error({ accountId, tx: r.txHash, error: r.error, value: r.value }, "create_guest failed");
          return { status: 502, body: { error: "could not create the account, try again" } };
        }
        return { status: 200, body: { accountId, created: true, txHash: r.txHash } };
      })().finally(() => inflight.delete(publicKey));
    if (!running) inflight.set(publicKey, job);
    const out = await job;
    return reply.code(out.status).send(out.body);
  });

  app.get("/api/game/:id/answer/:index", { config: { rateLimit: { max: 400, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { id, index } = req.params as { id: string; index: string };
    if (!/^\d{1,15}$/.test(id) || !/^\d{1,2}$/.test(index)) return reply.code(400).send({ error: "bad game or cell" });
    const idx = Number(index);
    const row = o.store.answers(Number(id)).find((a) => a.idx === idx);
    if (!row) return reply.code(404).send({ error: "not answered yet" });
    return { idx: row.idx, cell: row.cell, salt: row.salt, proof: row.proof };
  });

  app.get("/api/game/:id/proofs", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const raw = (req.params as { id: string }).id;
    if (!/^\d{1,15}$/.test(raw)) return reply.code(400).send({ error: "bad game id" });
    const id = Number(raw);
    const game = await o.viewer.view<GameView | null>("get_game", { game_id: id });
    if (!game) return reply.code(404).send({ error: "no such game" });
    const history = await o.viewer.view<ShotView[]>("get_history", { game_id: id });
    return {
      game,
      history,
      nauarch: {
        root: game.root_b,
        answers: o.store.answers(id),
        reveal: o.store.reveal(id) ?? null,
        moves: o.store.aiMoves(id) as PublicMove[],
        sunk: o.store.sunk(id),
      },
    };
  });

  const leaderboard = new LiveLeaderboard(o.viewer, LEADERBOARD_SEEDS, LEADERBOARD_BATCH);
  if (o.liveMs) {
    const warn = (what: string) => (err: unknown) => o.log.warn({ err: err instanceof Error ? err.message : String(err) }, what);
    void leaderboard.get().catch(warn("leaderboard load failed, will retry on the next request"));
    const live = setInterval(() => void leaderboard.tick().catch(warn("leaderboard live update failed")), o.liveMs);
    const resync = setInterval(() => void leaderboard.resync().catch(warn("leaderboard resync failed, keeping the live one")), LEADERBOARD_MS);
    app.addHook("onClose", async () => {
      clearInterval(live);
      clearInterval(resync);
    });
  }
  app.get<{ Querystring: { me?: string } }>("/api/leaderboard", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req): Promise<Leaderboard> => {
    const me = req.query.me;
    if (typeof me === "string" && ACCOUNT_RE.test(me)) {
      const fresh = (await cached(`captain:${me}`, () => freshCaptain(o.viewer, me)).catch((err: unknown) => {
        req.log.warn({ me, err: err instanceof Error ? err.message : String(err) }, "could not read the captain fresh, serving the live row");
        return null;
      })) as Awaited<ReturnType<typeof freshCaptain>>;
      if (fresh) leaderboard.patch(fresh);
    }
    return leaderboard.get();
  });

  app.get("/api/treasury", async () =>
    cached("treasury", async () => ({
      current: await o.viewer.view<TreasuryView>("treasury"),
      history: o.store.samples("treasury", 1000),
    })),
  );

  app.get("/api/admiralty", async () =>
    cached("admiralty", async () => {
      const byDay = new Map<number, { at: number; block: number; data: unknown }>();
      for (const s of o.store.samples("admiralty", 5000)) byDay.set((s.data as AdmiraltyView).day, s);
      return {
        current: await o.viewer.view<AdmiraltyView>("admiralty_map"),
        days: [...byDay.values()],
      };
    }),
  );

  await app.register(async (scope) => registerChat(scope, o.viewer, o.store, now));


  return app;
}
