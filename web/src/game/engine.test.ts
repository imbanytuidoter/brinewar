import { describe, expect, it } from "vitest";
import type { GameView, ShotView } from "@/lib/contract";
import { canTarget, friendlyError, hitsOnMe, hitsOnThem, marksFrom, nextStep, opponentOf, outcome, sideOf } from "./engine";

const ME = "p-0011223344556677.brinewar.testnet";
const NAU = "admiral.brinewar.testnet";

const game = (over: Partial<GameView> = {}): GameView => ({
  id: 1, mode: "VsNauarch", a: ME, b: NAU, root_a: "aa", root_b: "bb", status: "Playing", turn: ME, deadline_block: 100,
  winner: null, finish_reason: null, hits_on_a: 0, hits_on_b: 0, shots: 0, pending_index: null, revealed_a: false,
  revealed_b: false, created_block: 1, stake: "10", farewell_said: false, ...over,
});

const shot = (by: string, index: number, result: ShotView["result"], n = 0): ShotView => ({ n, by, index, result, block: 1, source: "Player" });

describe("nextStep", () => {
  it("commits a board in placement once", () => {
    expect(nextStep(game({ status: "Placing", root_a: null }), ME, true)).toEqual({ kind: "commit" });
    expect(nextStep(game({ status: "Placing" }), ME, true)).toEqual({ kind: "wait" });
  });

  it("answers the Nauarch before firing", () => {
    expect(nextStep(game({ pending_index: 42 }), ME, true)).toEqual({ kind: "answer", index: 42 });
    expect(nextStep(game(), ME, true)).toEqual({ kind: "fire" });
  });

  it("shows the Nauarch thinking on his turn and waits on his answer", () => {
    expect(nextStep(game({ turn: NAU }), ME, true)).toEqual({ kind: "thinking" });
    expect(nextStep(game({ turn: NAU, pending_index: 3 }), ME, true)).toEqual({ kind: "wait" });
  });

  it("reveals at the end and then is done", () => {
    expect(nextStep(game({ status: "Revealing", winner: ME }), ME, true)).toEqual({ kind: "reveal" });
    expect(nextStep(game({ status: "Finished", winner: NAU }), ME, true)).toEqual({ kind: "reveal" });
    expect(nextStep(game({ status: "Revealing", revealed_a: true }), ME, true)).toEqual({ kind: "wait" });
    expect(nextStep(game({ status: "Finished", revealed_a: true }), ME, true)).toEqual({ kind: "done" });
  });

  it("never tries to reveal a board that was never committed", () => {
    expect(nextStep(game({ status: "Revealing", root_a: null, winner: NAU }), ME, true)).toEqual({ kind: "wait" });
    expect(nextStep(game({ status: "Finished", root_a: null, winner: NAU }), ME, true)).toEqual({ kind: "done" });
  });

  it("flags a lost local board unless the game is finished", () => {
    expect(nextStep(game(), ME, false)).toEqual({ kind: "lost-board" });
    expect(nextStep(game({ status: "Finished" }), ME, false)).toEqual({ kind: "done" });
  });
});

describe("duels", () => {
  const FRIEND = "p-8899aabbccddeeff.brinewar.testnet";
  const duel = (over: Partial<GameView> = {}): GameView => game({ mode: "PvP", a: FRIEND, b: ME, stake: "0", ...over });

  it("waits for a friend, then plays as the second captain with my own root and reveal", () => {
    expect(nextStep(game({ mode: "PvP", b: ME, status: "Waiting", root_a: null, root_b: null }), ME, true)).toEqual({ kind: "invite" });
    expect(nextStep(duel({ status: "Placing", root_a: "aa", root_b: null }), ME, true)).toEqual({ kind: "commit" });
    expect(nextStep(duel({ status: "Placing", root_a: null, root_b: "bb" }), ME, true)).toEqual({ kind: "wait" });
    expect(nextStep(duel({ turn: FRIEND }), ME, true)).toEqual({ kind: "thinking" });
    expect(nextStep(duel({ turn: ME, pending_index: 9 }), ME, true)).toEqual({ kind: "answer", index: 9 });
    expect(nextStep(duel({ status: "Revealing", winner: FRIEND, revealed_a: true }), ME, true)).toEqual({ kind: "reveal" });
    expect(nextStep(duel({ status: "Finished", winner: FRIEND, revealed_b: true }), ME, true)).toEqual({ kind: "done" });
  });

  it("knows my side and the hits on my fleet", () => {
    const d = duel({ hits_on_a: 3, hits_on_b: 5 });
    expect(sideOf(d, ME)).toBe("b");
    expect(hitsOnMe(d, ME)).toBe(5);
    expect(hitsOnThem(d, ME)).toBe(3);
    expect(opponentOf(d, ME)).toBe(FRIEND);
  });
});

describe("marks", () => {
  const history = [shot(ME, 5, "Hit"), shot(NAU, 9, "Miss"), shot(ME, 6, "Miss"), shot(NAU, 11, "Hit"), shot(ME, 7, "Pending")];

  it("splits shots between the boards and finds the shot in flight", () => {
    const m = marksFrom(history, ME);
    expect([...m.enemy]).toEqual([[5, "hit"], [6, "miss"]]);
    expect([...m.mine]).toEqual([[9, "miss"], [11, "hit"]]);
    expect(m.aiming).toBe(7);
  });

  it("only allows fresh cells on the board", () => {
    const m = marksFrom(history, ME);
    expect(canTarget(8, m)).toBe(true);
    expect(canTarget(5, m)).toBe(false);
    expect(canTarget(7, m)).toBe(false);
    expect(canTarget(100, m)).toBe(false);
    expect(canTarget(1.5, m)).toBe(false);
  });
});

describe("outcome and errors", () => {
  it("names the winner from my side", () => {
    expect(outcome(game(), ME)).toBeNull();
    expect(outcome(game({ status: "Finished", winner: ME }), ME)).toBe("won");
    expect(outcome(game({ status: "Revealing", winner: NAU }), ME)).toBe("lost");
  });

  it("maps contract panics to captain-friendly text", () => {
    expect(friendlyError("Smart contract panicked: finish your current game first")).toMatch(/already have a battle/);
    expect(friendlyError("Smart contract panicked: daily game limit reached, come back tomorrow")).toMatch(/tomorrow/);
    expect(friendlyError("weird")).toBe("The contract refused that move.");
    expect(friendlyError("Smart contract panicked: this invite link is not valid for the duel")).toMatch(/not valid/);
    expect(friendlyError(undefined)).toMatch(/wrong/);
  });
});
