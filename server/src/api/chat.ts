import type { FastifyInstance } from "fastify";
import { PublicKey } from "near-api-js";
import type { GameView } from "../lib/contract.js";
import type { Store } from "../lib/db.js";
import type { Viewer } from "../lib/near.js";

const MAX_TEXT = 200;
const CLOCK_SKEW_MS = 120_000;
const PER_MINUTE = 20;
const PER_GAME = 500;
const READ_SKEW_MS = 30_000;
const CACHE_MAX = 5000;
const PAGE = 100;
const OWNER_TTL_MS = 600_000;
const GAME_TTL_MS = 15_000;
const SIGNATURE = /^[0-9a-f]{128}$/;
const ACCOUNT = /^[a-z0-9._-]{2,64}$/;

export function chatPayload(kind: "say" | "read", gameId: number, account: string, signedAt: number, text = ""): Uint8Array {
  const body = kind === "say" ? `brinewar-chat\n${gameId}\n${account}\n${signedAt}\n${text}` : `brinewar-chat-read\n${gameId}\n${account}\n${signedAt}`;
  return new TextEncoder().encode(body);
}

export function cleanText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 0 && text.length <= MAX_TEXT ? text : null;
}

interface Signed {
  readonly gameId: number;
  readonly account: string;
  readonly publicKey: string;
  readonly signedAt: number;
  readonly signature: string;
}

function hexBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));
}

const UNAVAILABLE = "unavailable";

async function guarded(run: () => Promise<string | null>): Promise<string | null> {
  try {
    return await run();
  } catch {
    return UNAVAILABLE;
  }
}

export function registerChat(app: FastifyInstance, viewer: Viewer, store: Store, now: () => number): void {
  const owners = new Map<string, { account: string; at: number }>();
  const games = new Map<number, { game: GameView | null; at: number }>();

  const remember = <K, V>(map: Map<K, V>, key: K, value: V): void => {
    if (map.size >= CACHE_MAX) map.delete(map.keys().next().value as K);
    map.set(key, value);
  };
  const ownerOf = async (publicKey: string): Promise<string> => {
    const hit = owners.get(publicKey);
    if (hit && now() - hit.at < OWNER_TTL_MS) return hit.account;
    return viewer.view<string>("guest_account_for", { public_key: publicKey });
  };
  const gameOf = async (id: number): Promise<GameView | null> => {
    const hit = games.get(id);
    if (hit && now() - hit.at < GAME_TTL_MS) return hit.game;
    const game = await viewer.view<GameView | null>("get_game", { game_id: id });
    if (game) remember(games, id, { game, at: now() });
    return game;
  };

  const check = async (s: Signed, payload: Uint8Array, skew: number): Promise<string | null> => {
    if (!ACCOUNT.test(s.account) || !SIGNATURE.test(s.signature) || !Number.isSafeInteger(s.signedAt)) return "bad request";
    if (Math.abs(now() - s.signedAt) > skew) return "stale signature";
    let key: PublicKey;
    try {
      key = PublicKey.fromString(s.publicKey);
    } catch {
      return "bad public key";
    }
    if (!key.verify(payload, hexBytes(s.signature))) return "bad signature";
    const game = await gameOf(s.gameId);
    if (!game || game.mode !== "PvP") return "no such duel";
    if (game.a !== s.account && game.b !== s.account) return "only the two captains can talk here";
    if ((await ownerOf(s.publicKey)) !== s.account) return "key does not belong to this captain";
    remember(owners, s.publicKey, { account: s.account, at: now() });
    return null;
  };

  const signedFrom = (id: string, src: Record<string, unknown>): Signed | null => {
    if (!/^\d{1,15}$/.test(id)) return null;
    const signedAt = Number(src.signedAt);
    const { account, publicKey, signature } = src;
    if (typeof account !== "string" || typeof publicKey !== "string" || typeof signature !== "string") return null;
    return { gameId: Number(id), account, publicKey, signedAt, signature };
  };

  app.post("/api/duel/:id/chat", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const s = signedFrom((req.params as { id: string }).id, body);
    const text = cleanText(body.text);
    if (!s || text === null) return reply.code(400).send({ error: `message must be 1-${MAX_TEXT} characters` });
    const problem = await guarded(() => check(s, chatPayload("say", s.gameId, s.account, s.signedAt, typeof body.text === "string" ? body.text : ""), CLOCK_SKEW_MS));
    if (problem === UNAVAILABLE) return reply.code(503).send({ error: "the chain is not answering, try again" });
    if (problem) return reply.code(403).send({ error: problem });
    if (store.chatCountSince(s.account, now() - 60_000) >= PER_MINUTE) return reply.code(429).send({ error: "slow down" });
    if (store.chatCount(s.gameId) >= PER_GAME) return reply.code(429).send({ error: "this duel's chat is full" });
    const n = store.addChat(s.gameId, s.account, text, s.signedAt);
    if (n === null) return reply.code(409).send({ error: "already sent" });
    return { n };
  });

  app.get("/api/duel/:id/chat", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, unknown>;
    const s = signedFrom((req.params as { id: string }).id, q);
    if (!s) return reply.code(400).send({ error: "bad request" });
    const problem = await guarded(() => check(s, chatPayload("read", s.gameId, s.account, s.signedAt), READ_SKEW_MS));
    if (problem === UNAVAILABLE) return reply.code(503).send({ error: "the chain is not answering, try again" });
    if (problem) return reply.code(403).send({ error: problem });
    const after = Math.max(0, Number(q.after) || 0);
    return { messages: store.chat(s.gameId, after, PAGE) };
  });
}
