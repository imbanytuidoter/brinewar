import { describe, expect, it, vi } from "vitest";
import { ensureGuest, GuestError, loadOrCreateKey, refuelGuest, validGuestAccount } from "./guest";
import { memoryStorage } from "./storage";
import { accountLink, checkUrl, networkOf, readConfig, txLink } from "./config";
import { playerGas, resultFromResponse } from "./chain";

const CONTRACT = "brinewar.testnet";
const ACC = "p-0123456789abcdef.brinewar.testnet";
const chain = (account: string | null = ACC) => ({ view: async <T,>() => account as T });
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("guest", () => {
  it("keeps one key per browser", () => {
    const store = memoryStorage();
    const a = loadOrCreateKey(store);
    expect(a.publicKey).toMatch(/^ed25519:/);
    expect(loadOrCreateKey(store)).toEqual(a);
  });

  it("replaces a corrupted key", () => {
    const store = memoryStorage({ "brinewar.signer.v1": "garbage" });
    expect(loadOrCreateKey(store).secretKey).toMatch(/^ed25519:/);
  });

  it("signs on once and then uses the cached account", async () => {
    const store = memoryStorage();
    const f = vi.fn(async () => json(200, { accountId: ACC, created: true }));
    const g = await ensureGuest(store, "http://localhost:8787", CONTRACT, chain(), f);
    expect(g.accountId).toBe(ACC);
    await ensureGuest(store, "http://localhost:8787", CONTRACT, chain(), f);
    expect(f).toHaveBeenCalledTimes(1);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ publicKey: g.publicKey });
  });

  it("refuses an account outside the game contract", async () => {
    const f = vi.fn(async () => json(200, { accountId: "evil.testnet" }));
    await expect(ensureGuest(memoryStorage(), "", CONTRACT, chain(), f)).rejects.toBeInstanceOf(GuestError);
    expect(validGuestAccount("p-0123456789abcdef.brinewarXtestnet", CONTRACT)).toBe(false);
  });

  it("refuses a well-formed account that the contract does not derive from this key", async () => {
    const f = vi.fn(async () => json(200, { accountId: ACC }));
    await expect(ensureGuest(memoryStorage(), "", CONTRACT, chain("p-ffffffffffffffff.brinewar.testnet"), f)).rejects.toMatchObject({ retryable: false, message: /not yours/ });
  });

  it("passes the server message on limits and marks it retryable", async () => {
    const f = vi.fn(async () => json(429, { error: "too many new captains from this address, try again later" }));
    await expect(ensureGuest(memoryStorage(), "", CONTRACT, chain(), f)).rejects.toMatchObject({ retryable: true, message: /too many new captains/ });
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(ensureGuest(memoryStorage(), "", CONTRACT, chain(), down)).rejects.toMatchObject({ retryable: true });
  });
});

describe("config", () => {
  it("requires https except on localhost", () => {
    expect(checkUrl("X", "https://rpc.testnet.near.org/", false)).toBe("https://rpc.testnet.near.org");
    expect(checkUrl("X", "http://127.0.0.1:3030", false)).toBe("http://127.0.0.1:3030");
    expect(() => checkUrl("X", "http://evil.example", false)).toThrow(/https/);
    expect(() => checkUrl("X", "", false)).toThrow(/not set/);
    expect(checkUrl("X", undefined, true)).toBe("");
    expect(() => checkUrl("X", "https://user:pw@rpc.example.org", false)).toThrow(/credentials/);
  });

  it("validates the contract id and builds explorer links", () => {
    expect(() => readConfig({ VITE_NEAR_RPC_URL: "https://x.org", VITE_GAME_CONTRACT: "Bad Id" })).toThrow();
    const cfg = readConfig({ VITE_NEAR_RPC_URL: "https://x.org", VITE_GAME_CONTRACT: CONTRACT, VITE_EXPLORER_TX_URL: "https://testnet.nearblocks.io/txns" });
    expect(txLink(cfg, "7Hq3kDxTmJ9vQ2pYbZr1sNcEwF5uLgA8oKiR4tVh6Mn")).toBe("https://testnet.nearblocks.io/txns/7Hq3kDxTmJ9vQ2pYbZr1sNcEwF5uLgA8oKiR4tVh6Mn");
    expect(txLink(cfg, "javascript:alert(1)")).toBeNull();
    expect(txLink(cfg, null)).toBeNull();
    expect(accountLink({ ...cfg, explorerAccountUrl: "https://testnet.nearblocks.io/address" }, CONTRACT)).toBe("https://testnet.nearblocks.io/address/brinewar.testnet");
    expect(accountLink(cfg, CONTRACT)).toBeNull();
    expect(networkOf("brinewar.testnet")).toBe("NEAR testnet");
    expect(networkOf("brinewar.test.near")).toBe("local sandbox");
  });
});

describe("chain results", () => {
  it("decodes success values and failures", () => {
    expect(resultFromResponse({ transaction: { hash: "h" }, status: { SuccessValue: btoa("42") } })).toEqual({ txHash: "h", ok: true, value: 42 });
    expect(resultFromResponse({ transaction: { hash: "h" }, status: { SuccessValue: "" } })).toEqual({ txHash: "h", ok: true });
    const failed = resultFromResponse({ transaction: { hash: "h" }, status: { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: not your turn" } } } } } });
    expect(failed).toMatchObject({ ok: false, error: /not your turn/ });
    expect(resultFromResponse({ status: {} })).toMatchObject({ ok: false });
  });
});

describe("fuel and gas", () => {
  it("reports a refuel only when the harbour did one", async () => {
    expect(await refuelGuest("", "ed25519:x", vi.fn(async () => json(200, { refueled: true })))).toBe(true);
    expect(await refuelGuest("", "ed25519:x", vi.fn(async () => json(200, { created: false })))).toBe(false);
    expect(await refuelGuest("", "ed25519:x", vi.fn(async () => { throw new Error("down"); }))).toBe(false);
  });

  it("prepays little gas for moves and more for the reveal", () => {
    expect(playerGas("fire")).toBe(10);
    expect(playerGas("answer")).toBe(10);
    expect(playerGas("reveal")).toBe(30);
  });
});
