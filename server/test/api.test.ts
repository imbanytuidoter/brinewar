import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KeyPair } from "near-api-js";
import { describe, expect, it } from "vitest";
import { buildApp, limitKey } from "../src/api/app.js";
import { sample } from "../src/api/sampler.js";
import { Store } from "../src/lib/db.js";
import { FakeCaller, FakeViewer, silent } from "./fakes.js";

const key = () => KeyPair.fromRandom("ed25519").getPublicKey().toString();

async function setup(over: { players?: Set<string>; createOk?: boolean; perIp?: number; perDay?: number } = {}) {
  const store = new Store(join(mkdtempSync(join(tmpdir(), "bw-")), "db.sqlite"));
  const players = over.players ?? new Set<string>();
  const viewer = new FakeViewer((method, args) => {
    if (method === "guest_account_for") return `p-${String(args.public_key).slice(8, 24).toLowerCase()}.brinewar.testnet`;
    if (method === "get_player") return players.has(String(args.account_id)) ? { account_id: args.account_id } : null;
    if (method === "get_game") return args.game_id === 3 ? { id: 3, root_b: "bb" } : null;
    if (method === "get_history") return [];
    if (method === "treasury") return { balance: "975", entry: "10", bounty: "25" };
    if (method === "admiralty_map") return { heat: [], boards_counted: 1, day: 7 };
    throw new Error(method);
  });
  const sponsor = new FakeCaller(
    "sponsor.brinewar.testnet",
    (_m, args) => {
      if (over.createOk === false) return { txHash: "t", ok: false, error: "boom" };
      players.add(`p-${String(args.public_key).slice(8, 24).toLowerCase()}.brinewar.testnet`);
      return { txHash: "t1", ok: true, value: true };
    },
    20,
  );
  const app = await buildApp({ viewer, sponsor, store, log: silent, guestsPerIpHour: over.perIp ?? 2, guestsPerDay: over.perDay ?? 10, trustProxy: 0 });
  return { app, store, sponsor, viewer };
}

describe("POST /api/guest", () => {
  it("creates a guest through the contract with enough gas", async () => {
    const t = await setup();
    const pk = key();
    const res = await t.app.inject({ method: "POST", url: "/api/guest", payload: { publicKey: pk, nickname: "Ahab" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ created: true, txHash: "t1" });
    expect(t.sponsor.calls[0]).toMatchObject({ method: "create_guest", args: { public_key: pk, nickname: "Ahab" }, gas: 100 });
  });

  it("rejects bad keys and nicknames before any transaction", async () => {
    const t = await setup();
    for (const payload of [{}, { publicKey: "ed25519:abc" }, { publicKey: "secp256k1:xyz" }, { publicKey: key(), nickname: "bad name" }, { publicKey: key(), nickname: 7 }]) {
      const res = await t.app.inject({ method: "POST", url: "/api/guest", payload });
      expect(res.statusCode).toBe(400);
    }
    expect(t.sponsor.calls).toHaveLength(0);
  });

  it("returns an existing player without a new transaction", async () => {
    const pk = key();
    const t0 = await setup();
    const id = (await t0.viewer.view<string>("guest_account_for", { public_key: pk }));
    const t = await setup({ players: new Set([id]) });
    const res = await t.app.inject({ method: "POST", url: "/api/guest", payload: { publicKey: pk } });
    expect(res.json()).toEqual({ accountId: id, created: false });
    expect(t.sponsor.calls).toHaveLength(0);
  });

  it("limits guests per address and per day", async () => {
    const t = await setup({ perIp: 2, perDay: 3 });
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await t.app.inject({ method: "POST", url: "/api/guest", payload: { publicKey: key() } })).statusCode);
    expect(codes).toEqual([200, 200, 429]);
    t.store.recordGuest("10.0.0.9", "x", null);
    const day = await t.app.inject({ method: "POST", url: "/api/guest", payload: { publicKey: key() }, remoteAddress: "10.0.0.8" });
    expect(day.statusCode).toBe(429);
  });

  it("hides contract errors behind a generic message", async () => {
    const t = await setup({ createOk: false });
    const res = await t.app.inject({ method: "POST", url: "/api/guest", payload: { publicKey: key() } });
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain("boom");
    expect(t.store.guestsSince(0)).toBe(1);
  });
});

describe("guest races and addresses", () => {
  it("creates one account for concurrent requests with the same key", async () => {
    const t = await setup();
    const pk = key();
    const all = await Promise.all([0, 1, 2].map(() => t.app.inject({ method: "POST", url: "/api/guest", payload: { publicKey: pk } })));
    expect(all.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(t.sponsor.calls).toHaveLength(1);
  });

  it("never lets parallel requests pass the per-address limit", async () => {
    const t = await setup({ perIp: 2, perDay: 50 });
    const all = await Promise.all([0, 1, 2, 3, 4].map(() => t.app.inject({ method: "POST", url: "/api/guest", payload: { publicKey: key() } })));
    expect(all.filter((r) => r.statusCode === 200)).toHaveLength(2);
    expect(t.sponsor.calls).toHaveLength(2);
  });

  it("groups IPv6 clients by /64", () => {
    expect(limitKey("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(limitKey("2001:db8:1:2:bbbb::9")).toBe("2001:db8:1:2::/64");
    expect(limitKey("::ffff:10.0.0.1")).toBe("10.0.0.1");
    expect(limitKey("10.0.0.1")).toBe("10.0.0.1");
  });
});

describe("read endpoints", () => {
  it("serves proofs only for real games", async () => {
    const t = await setup();
    t.store.saveAnswer(3, { idx: 5, cell: 0, salt: "aa", proof: ["bb"], tx: "t" });
    expect((await t.app.inject({ url: "/api/game/abc/proofs" })).statusCode).toBe(400);
    expect((await t.app.inject({ url: "/api/game/9/proofs" })).statusCode).toBe(404);
    const ok = await t.app.inject({ url: "/api/game/3/proofs" });
    expect(ok.json().nauarch).toMatchObject({ root: "bb", reveal: null, answers: [{ idx: 5 }] });
  });

  it("samples treasury and map only when they change", async () => {
    const t = await setup();
    expect(await sample(t.viewer, t.store, async () => 100)).toEqual({ treasury: true, admiralty: true });
    expect(await sample(t.viewer, t.store, async () => 101)).toEqual({ treasury: false, admiralty: false });
    const tr = await t.app.inject({ url: "/api/treasury" });
    expect(tr.json().history).toHaveLength(1);
    const ad = await t.app.inject({ url: "/api/admiralty" });
    expect(ad.json().days).toHaveLength(1);
    const health = await t.app.inject({ url: "/health" });
    expect(health.json().ok).toBe(true);
  });
});
