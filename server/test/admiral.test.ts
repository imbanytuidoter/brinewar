import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Admiral } from "../src/admiral/admiral.js";
import type { GameView } from "../src/lib/contract.js";
import { Store } from "../src/lib/db.js";
import { isLegalFleet, seededRng } from "../src/lib/fleet.js";
import { fromHex, rootFromProof, toHex } from "../src/lib/merkle.js";
import { Vault } from "../src/lib/vault.js";
import { FakeCaller, FakeModel, FakeViewer, silent } from "./fakes.js";

const ADM = "admiral.brinewar.testnet";
const KEY = "22".repeat(32);

function game(over: Partial<GameView> = {}): GameView {
  return {
    id: 0, mode: "VsNauarch", a: "p-1.brinewar.testnet", b: ADM, root_a: "aa", root_b: null, status: "Placing", turn: "p-1.brinewar.testnet",
    deadline_block: 1000, winner: null, finish_reason: null, hits_on_a: 0, hits_on_b: 0, shots: 0,
    pending_index: null, revealed_a: false, revealed_b: false, created_block: 1, stake: "10", farewell_said: false,
    ...over,
  };
}

function setup(opts: { model?: FakeModel | null; reject?: (m: string) => boolean; timeoutMs?: number; answerPassesTurn?: boolean } = {}) {
  const store = new Store(join(mkdtempSync(join(tmpdir(), "bw-")), "db.sqlite"));
  let current = game();
  const viewer = new FakeViewer((method) => {
    if (method === "config") return { games: 1 };
    if (method === "games_since") return [current];
    if (method === "nauarch_request") return `{"model":"m","req":${current.shots}}`;
    if (method === "get_game") return current;
    throw new Error(method);
  });
  const caller = new FakeCaller(ADM, (method) => {
    if (opts.reject?.(method)) return { txHash: "bad", ok: false, error: "Smart contract panicked: no" };
    if (method === "answer" && opts.answerPassesTurn) current = { ...current, pending_index: null, turn: ADM };
    return { txHash: `tx-${method}`, ok: true };
  });
  const admiral = new Admiral({
    viewer, caller, store, vault: new Vault(KEY), model: opts.model === undefined ? null : opts.model, log: silent,
    height: async () => 10, modelTimeoutMs: opts.timeoutMs ?? 2000, maxFarewellTries: 2, cooldownMs: 0, rng: seededRng(3),
  });
  const settle = async () => {
    await admiral.tick();
    for (let i = 0; i < 50 && admiral.busyGames > 0; i++) await new Promise((r) => setTimeout(r, 5));
  };
  return { store, caller, viewer, admiral, settle, set: (g: Partial<GameView>) => (current = { ...current, ...g }) };
}

describe("admiral", () => {
  it("commits a sealed legal board and reuses it", async () => {
    const t = setup();
    await t.settle();
    const commit = t.caller.calls.find((c) => c.method === "commit_board");
    expect(commit?.args.root).toMatch(/^[0-9a-f]{64}$/);
    const row = t.store.board(0);
    expect(row?.root).toBe(commit?.args.root);
    expect(row?.sealed).not.toContain("salts");
    const plain = JSON.parse(new Vault(KEY).open(row?.sealed as string, "game:0")) as { cells: number[] };
    expect(isLegalFleet(plain.cells)).toBe(true);
    await t.settle();
    const commits = t.caller.calls.filter((c) => c.method === "commit_board");
    expect(new Set(commits.map((c) => c.args.root)).size).toBe(1);
  });

  it("answers with a proof that matches its committed root and records it", async () => {
    const t = setup();
    await t.settle();
    const root = t.store.board(0)?.root as string;
    t.set({ status: "Playing", root_b: root, turn: ADM, pending_index: 37, shots: 1 });
    await t.settle();
    const ans = t.caller.calls.find((c) => c.method === "answer");
    const a = ans?.args as { index: number; cell: number; salt: string; proof: string[] };
    expect(a.index).toBe(37);
    expect(toHex(rootFromProof(37, a.cell, fromHex(a.salt), a.proof.map(fromHex)))).toBe(root);
    expect(t.store.answers(0)).toHaveLength(1);
  });

  it("fires right after answering, without waiting for the next tick", async () => {
    const t = setup({ answerPassesTurn: true });
    await t.settle();
    t.set({ status: "Playing", root_b: t.store.board(0)?.root as string, turn: ADM, pending_index: 12, shots: 1 });
    await t.settle();
    const methods = t.caller.calls.map((c) => c.method);
    expect(methods.indexOf("answer")).toBeGreaterThan(-1);
    expect(methods.indexOf("nauarch_fallback")).toBeGreaterThan(methods.indexOf("answer"));
  });

  it("moves through the signed model reply", async () => {
    const model = new FakeModel({ model: "m", reply: () => '{"shot":"B7","line":"Steady."}' });
    const t = setup({ model });
    await t.settle();
    t.set({ status: "Playing", root_b: t.store.board(0)?.root as string, turn: ADM, pending_index: null, shots: 2 });
    await t.settle();
    const sub = t.caller.calls.find((c) => c.method === "submit_ai_move");
    expect(sub?.args.kind).toBe("Shot");
    expect(model.requests).toEqual(['{"model":"m","req":2}']);
    expect(sub?.args.signature_hex).toMatch(/^[0-9a-f]{128}$/);
    expect(t.caller.calls.some((c) => c.method === "nauarch_fallback")).toBe(false);
    const moves = t.store.aiMoves(0);
    expect(moves[0]?.source).toBe("model");
    expect(moves[0]?.signed_text).toMatch(/^m:[0-9a-f]{64}:[0-9a-f]{64}$/);
  });

  it("falls back when the model fails, stalls or is rejected", async () => {
    for (const opts of [
      { model: new FakeModel({ model: "m", reply: () => "{}", failComplete: true }) },
      { model: new FakeModel({ model: "m", reply: () => "{}", delayMs: 300 }), timeoutMs: 50 },
      { model: new FakeModel({ model: "m", reply: () => "{}" }), reject: (m: string) => m === "submit_ai_move" },
      { model: null },
    ]) {
      const t = setup(opts);
      await t.settle();
      t.set({ status: "Playing", root_b: t.store.board(0)?.root as string, turn: ADM, shots: 2 });
      await t.settle();
      expect(t.caller.calls.filter((c) => c.method === "nauarch_fallback")).toHaveLength(1);
    }
  });

  it("reveals after the game, then says farewell, and gives up after repeated failures", async () => {
    const model = new FakeModel({ model: "m", reply: () => '{"line":"Fair winds."}' });
    const t = setup({ model, reject: (m) => m === "submit_ai_move" });
    await t.settle();
    t.set({ status: "Finished", root_b: t.store.board(0)?.root as string, winner: "p-1.brinewar.testnet" });
    await t.settle();
    const reveal = t.caller.calls.find((c) => c.method === "reveal");
    expect((reveal?.args.cells as string).length).toBe(100);
    expect(t.store.reveal(0)?.tx).toBe("tx-reveal");
    t.set({ revealed_b: true });
    await t.settle();
    await t.settle();
    await t.settle();
    expect(t.caller.calls.filter((c) => c.method === "submit_ai_move")).toHaveLength(2);
  });

  it("falls back when the signed text covers something else", async () => {
    const model = new FakeModel({ model: "other-model", reply: () => '{"shot":"B7"}' });
    const t = setup({ model });
    await t.settle();
    t.set({ status: "Playing", root_b: t.store.board(0)?.root as string, turn: ADM, shots: 2 });
    await t.settle();
    expect(t.caller.calls.some((c) => c.method === "submit_ai_move")).toBe(false);
    expect(t.caller.calls.filter((c) => c.method === "nauarch_fallback")).toHaveLength(1);
    expect(t.store.aiMoves(0)[0]?.error).toBe("signature_mismatch");
  });

  it("refuses a stored board that does not match its root", async () => {
    const t = setup();
    await t.settle();
    const row = t.store.board(0) as { root: string; sealed: string };
    t.store.db.prepare("UPDATE boards SET root = ? WHERE game_id = 0").run("00".repeat(32));
    t.set({ status: "Playing", root_b: row.root, turn: ADM, pending_index: 5 });
    const restarted = new Admiral({
      viewer: t.viewer, caller: t.caller, store: t.store, vault: new Vault(KEY), model: null, log: silent,
      height: async () => 10, modelTimeoutMs: 100, maxFarewellTries: 1, cooldownMs: 0,
    });
    await restarted.tick();
    await new Promise((r) => setTimeout(r, 30));
    expect(t.caller.calls.some((c) => c.method === "answer")).toBe(false);
  });
});
