import { describe, expect, it } from "vitest";
import { nextTarget } from "../src/lib/bot.js";
import type { ShotView } from "../src/lib/contract.js";
import { seededRng } from "../src/lib/fleet.js";
import { failureText, resultFromResponse, withTimeout } from "../src/lib/near.js";
import { errorCode } from "../src/admiral/admiral.js";

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64");

describe("transaction outcomes", () => {
  it("decodes a JSON success value and the hash", () => {
    expect(resultFromResponse({ transaction: { hash: "H" }, status: { SuccessValue: b64(7) } })).toEqual({ txHash: "H", ok: true, value: 7 });
    expect(resultFromResponse({ transaction: { hash: "H" }, status: { SuccessValue: "" } })).toEqual({ txHash: "H", ok: true });
  });

  it("surfaces the contract panic text", () => {
    const failure = { ActionError: { kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: not your turn" } } } };
    const r = resultFromResponse({ transaction: { hash: "H" }, status: { Failure: failure } });
    expect(r).toEqual({ txHash: "H", ok: false, error: "Smart contract panicked: not your turn" });
    expect(failureText({ other: 1 })).toBe('{"other":1}');
  });

  it("treats a non-final outcome as not ok", () => {
    expect(resultFromResponse({ status: "Started" }).ok).toBe(false);
  });

  it("times out slow promises", async () => {
    await expect(withTimeout(new Promise(() => undefined), 10, "slow")).rejects.toThrow(/slow timed out/);
  });
});

describe("public error codes", () => {
  it("never echoes raw messages", () => {
    expect(errorCode("call submit_ai_move timed out after 60000 ms")).toBe("timeout");
    expect(errorCode("Smart contract panicked: model signature does not match this game's request")).toBe("signature_mismatch");
    expect(errorCode("Smart contract panicked: not your turn")).toBe("rejected");
    expect(errorCode("completion HTTP 503: upstream https://x?key=abc")).toBe("model_http_503");
    expect(errorCode("fetch failed https://rpc?apikey=zzz")).toBe("error");
  });
});

describe("bot targeting", () => {
  const shot = (index: number, result: "Hit" | "Miss"): ShotView => ({ n: 0, by: "p", index, result, block: 0, source: "Player" });

  it("finishes a ship next to a hit and skips diagonals", () => {
    expect([1, 10]).toContain(nextTarget([shot(0, "Hit")], seededRng(1)));
    const t = nextTarget([shot(55, "Hit"), shot(45, "Miss"), shot(56, "Miss"), shot(65, "Miss")], seededRng(1));
    expect(t).toBe(54);
  });

  it("never repeats a cell", () => {
    const fired: ShotView[] = [];
    const rng = seededRng(5);
    for (let i = 0; i < 100; i++) fired.push(shot(nextTarget(fired, rng), "Miss"));
    expect(new Set(fired.map((s) => s.index)).size).toBe(100);
  });
});

describe("several RPC endpoints", () => {
  it("parses a comma list and refuses plain http outside localhost", async () => {
    const { urls, ConfigError } = await import("../src/lib/config.js");
    expect(urls({ NEAR_RPC_URL: "https://a.example/, https://b.example" }, "NEAR_RPC_URL", "https://x.example")).toBe("https://a.example,https://b.example");
    expect(urls({}, "NEAR_RPC_URL", "https://x.example")).toBe("https://x.example");
    expect(() => urls({ NEAR_RPC_URL: "https://a.example,http://evil.example" }, "NEAR_RPC_URL", "https://x.example")).toThrow(ConfigError);
  });

  it("fails over when the list has more than one endpoint", async () => {
    const { FailoverRpcProvider, JsonRpcProvider } = await import("near-api-js");
    const { provider } = await import("../src/lib/near.js");
    expect(provider("https://a.example")).toBeInstanceOf(JsonRpcProvider);
    expect(provider("https://a.example,https://b.example")).toBeInstanceOf(FailoverRpcProvider);
    expect(() => provider(" , ")).toThrow();
  });
});

describe("NEAR amounts in config", () => {
  it("reads decimal NEAR into yocto", async () => {
    const { nearAmount, ConfigError } = await import("../src/lib/config.js");
    expect(nearAmount({}, "X", "0.08")).toBe(8n * 10n ** 22n);
    expect(nearAmount({ X: "1" }, "X", "0")).toBe(10n ** 24n);
    expect(() => nearAmount({ X: "-1" }, "X", "0")).toThrow(ConfigError);
  });
});

describe("caller pool", () => {
  it("pins each game to one key and spreads games over the keys", async () => {
    const { CallerPool } = await import("../src/lib/near.js");
    const used: string[] = [];
    const caller = (name: string) => ({ accountId: "admiral.brinewar.testnet", call: async () => (used.push(name), { txHash: name, ok: true }) });
    const pool = new CallerPool([caller("k0"), caller("k1"), caller("k2")]);
    await pool.call("answer", {}, 30, 7);
    await pool.call("move", {}, 30, 7);
    await pool.call("answer", {}, 30, 8);
    await pool.call("answer", {}, 30, -1);
    expect(used).toEqual(["k1", "k1", "k2", "k2"]);
    expect(() => new CallerPool([])).toThrow();
    expect(() => new CallerPool([caller("a"), { accountId: "other.testnet", call: caller("b").call }])).toThrow();
  });
});
