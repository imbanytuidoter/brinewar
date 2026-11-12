import { describe, expect, it } from "vitest";
import type { GameView, ShotView } from "@/lib/contract";
import { buildReplay, candidates, isShowcase } from "./replay";

const game = (over: Partial<GameView> = {}): GameView => ({
  id: 7, mode: "VsNauarch", a: "p-1.brinewar.testnet", b: "admiral.brinewar.testnet", root_a: "aa", root_b: "bb", status: "Finished", turn: "p-1.brinewar.testnet",
  deadline_block: 0, winner: "admiral.brinewar.testnet", finish_reason: "FleetSunk", hits_on_a: 20, hits_on_b: 3, shots: 4, pending_index: null,
  revealed_a: true, revealed_b: true, created_block: 1, stake: "10", farewell_said: true, ...over,
});

const shot = (n: number, by: string, index: number, result: ShotView["result"]): ShotView => ({ n, by, index, result, block: n, source: by.startsWith("admiral") ? "Model" : "Player" });

describe("replay", () => {
  it("shows only battles the Nauarch won by sinking the fleet, with his board revealed", () => {
    expect(isShowcase(game())).toBe(true);
    expect(isShowcase(game({ winner: "p-1.brinewar.testnet" }))).toBe(false);
    expect(isShowcase(game({ finish_reason: "Resigned" }))).toBe(false);
    expect(isShowcase(game({ revealed_b: false }))).toBe(false);
    expect(isShowcase(game({ mode: "PvP" }))).toBe(false);
  });

  it("rebuilds the captain's ships from his hits and rushes the captain's misses", () => {
    const g = game();
    const r = buildReplay(g, [shot(2, g.b, 1, "Hit"), shot(1, g.a, 50, "Miss"), shot(3, g.b, 0, "Hit"), shot(4, g.a, 51, "Hit")], null, null);
    expect(r.history.map((s) => s.n)).toEqual([1, 2, 3, 4]);
    expect(r.captainShips).toEqual([[0, 1]]);
    expect(r.delays[0]).toBeLessThan(r.delays[1] as number);
    expect(r.delays[3]).toBe(r.delays[1]);
    expect(r.nauarchShips).toBeNull();
  });

  it("scans the latest games first", () => {
    expect(candidates(3)).toEqual([3, 2, 1, 0]);
    expect(candidates(100)).toHaveLength(40);
  });
});
