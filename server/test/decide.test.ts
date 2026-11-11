import { describe, expect, it } from "vitest";
import { decide, type DecideContext } from "../src/admiral/decide.js";
import type { GameView } from "../src/lib/contract.js";

const ADM = "admiral.brinewar.testnet";
const P = "p-1.brinewar.testnet";

function game(over: Partial<GameView> = {}): GameView {
  return {
    id: 1, mode: "VsNauarch", a: P, b: ADM, root_a: "aa", root_b: "bb", status: "Playing", turn: ADM,
    deadline_block: 100, winner: null, finish_reason: null, hits_on_a: 0, hits_on_b: 0, shots: 1,
    pending_index: null, revealed_a: false, revealed_b: false, created_block: 1, stake: "10", farewell_said: false,
    ...over,
  };
}

const ctx = (over: Partial<DecideContext> = {}): DecideContext => ({ admiral: ADM, height: 50, hasBoard: true, farewellEnabled: true, farewellGaveUp: false, ...over });

describe("decide", () => {
  it("commits a board in placement once", () => {
    expect(decide(game({ status: "Placing", root_b: null }), ctx()).kind).toBe("commit");
    expect(decide(game({ status: "Placing", root_b: "bb" }), ctx()).kind).toBe("wait");
  });

  it("cancels a placement the player abandoned", () => {
    expect(decide(game({ status: "Placing", root_b: "bb" }), ctx({ height: 101 })).kind).toBe("claim");
    expect(decide(game({ status: "Placing", root_b: null }), ctx({ height: 101 })).kind).toBe("wait");
  });

  it("answers a pending shot and moves when the shot is answered", () => {
    expect(decide(game({ pending_index: 42 }), ctx())).toEqual({ kind: "answer", index: 42 });
    expect(decide(game(), ctx()).kind).toBe("move");
    expect(decide(game({ turn: P }), ctx()).kind).toBe("wait");
  });

  it("claims a timeout only when the player is late", () => {
    expect(decide(game({ turn: P }), ctx({ height: 101 })).kind).toBe("claim");
    expect(decide(game({ turn: ADM }), ctx({ height: 101 })).kind).toBe("wait");
  });

  it("reveals as winner and claims when the winning player never reveals", () => {
    expect(decide(game({ status: "Revealing", winner: ADM }), ctx()).kind).toBe("reveal");
    expect(decide(game({ status: "Revealing", winner: P }), ctx()).kind).toBe("wait");
    expect(decide(game({ status: "Revealing", winner: P }), ctx({ height: 101 })).kind).toBe("claim");
  });

  it("always reveals after the game, then says farewell, then is done", () => {
    const fin = { status: "Finished" as const, winner: P };
    expect(decide(game(fin), ctx()).kind).toBe("reveal");
    expect(decide(game({ ...fin, revealed_b: true }), ctx()).kind).toBe("farewell");
    expect(decide(game({ ...fin, revealed_b: true }), ctx({ farewellEnabled: false })).kind).toBe("done");
    expect(decide(game({ ...fin, revealed_b: true }), ctx({ farewellGaveUp: true })).kind).toBe("done");
    expect(decide(game({ ...fin, revealed_b: true, farewell_said: true }), ctx()).kind).toBe("done");
  });

  it("ignores games of another admiral", () => {
    expect(decide(game({ b: "other.testnet" }), ctx()).kind).toBe("done");
  });
});
