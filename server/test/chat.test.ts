import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KeyPair } from "near-api-js";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/api/app.js";
import { chatPayload, cleanText } from "../src/api/chat.js";
import { Store } from "../src/lib/db.js";
import { FakeCaller, FakeViewer, silent } from "./fakes.js";

const NOW = 1_800_000_000_000;
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

function captain() {
  const kp = KeyPair.fromRandom("ed25519");
  const publicKey = kp.getPublicKey().toString();
  const account = `p-${publicKey.slice(8, 24).toLowerCase()}.brinewar.testnet`;
  return { kp, publicKey, account };
}

async function setup() {
  const host = captain();
  const guest = captain();
  const stranger = captain();
  const store = new Store(join(mkdtempSync(join(tmpdir(), "bw-")), "db.sqlite"), () => NOW);
  const viewer = new FakeViewer((method, args) => {
    if (method === "guest_account_for") return `p-${String(args.public_key).slice(8, 24).toLowerCase()}.brinewar.testnet`;
    if (method === "get_game") return args.game_id === 7 ? { id: 7, mode: "PvP", a: host.account, b: guest.account } : args.game_id === 8 ? { id: 8, mode: "VsNauarch", a: host.account, b: "admiral.brinewar.testnet" } : null;
    throw new Error(method);
  });
  const app = await buildApp({ viewer, sponsor: new FakeCaller("sponsor.brinewar.testnet"), store, log: silent, guestsPerIpHour: 2, guestsPerDay: 10, trustProxy: 0, now: () => NOW });
  return { app, host, guest, stranger };
}

const say = (c: ReturnType<typeof captain>, game: number, text: string, signedAt = NOW) => ({
  account: c.account,
  publicKey: c.publicKey,
  signedAt,
  text,
  signature: hex(c.kp.sign(chatPayload("say", game, c.account, signedAt, text)).signature),
});

const read = (c: ReturnType<typeof captain>, game: number, after = 0) => {
  const sig = hex(c.kp.sign(chatPayload("read", game, c.account, NOW)).signature);
  return `/api/duel/${game}/chat?account=${c.account}&publicKey=${encodeURIComponent(c.publicKey)}&signedAt=${NOW}&signature=${sig}&after=${after}`;
};

describe("duel chat", () => {
  it("lets the two captains talk and read each other", async () => {
    const t = await setup();
    expect((await t.app.inject({ method: "POST", url: "/api/duel/7/chat", payload: say(t.host, 7, "Good luck!") })).statusCode).toBe(200);
    expect((await t.app.inject({ method: "POST", url: "/api/duel/7/chat", payload: say(t.guest, 7, "  you  too ") })).statusCode).toBe(200);
    const res = await t.app.inject({ method: "GET", url: read(t.guest, 7) });
    expect(res.json().messages.map((m: { account: string; text: string }) => [m.account, m.text])).toEqual([
      [t.host.account, "Good luck!"],
      [t.guest.account, "you too"],
    ]);
    const later = await t.app.inject({ method: "GET", url: read(t.host, 7, 1) });
    expect(later.json().messages).toHaveLength(1);
  });

  it("refuses strangers, forged signatures, replays and games that are not duels", async () => {
    const t = await setup();
    expect((await t.app.inject({ method: "POST", url: "/api/duel/7/chat", payload: say(t.stranger, 7, "hi") })).statusCode).toBe(403);
    expect((await t.app.inject({ method: "GET", url: read(t.stranger, 7) })).statusCode).toBe(403);
    const forged = { ...say(t.host, 7, "hi"), text: "something else" };
    expect((await t.app.inject({ method: "POST", url: "/api/duel/7/chat", payload: forged })).statusCode).toBe(403);
    const impostor = { ...say(t.stranger, 7, "hi"), account: t.host.account };
    expect((await t.app.inject({ method: "POST", url: "/api/duel/7/chat", payload: impostor })).statusCode).toBe(403);
    expect((await t.app.inject({ method: "POST", url: "/api/duel/7/chat", payload: say(t.host, 7, "old", NOW - 10 * 60_000) })).statusCode).toBe(403);
    const once = say(t.host, 7, "once");
    expect((await t.app.inject({ method: "POST", url: "/api/duel/7/chat", payload: once })).statusCode).toBe(200);
    expect((await t.app.inject({ method: "POST", url: "/api/duel/7/chat", payload: once })).statusCode).toBe(409);
    expect((await t.app.inject({ method: "POST", url: "/api/duel/8/chat", payload: say(t.host, 8, "hi") })).statusCode).toBe(403);
    expect((await t.app.inject({ method: "POST", url: "/api/duel/7/chat", payload: say(t.host, 7, "x".repeat(201)) })).statusCode).toBe(400);
  });

  it("cleans control and direction characters out of messages", () => {
    expect(cleanText("a‮b\n\tc")).toBe("a b c");
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(5)).toBeNull();
  });
});
