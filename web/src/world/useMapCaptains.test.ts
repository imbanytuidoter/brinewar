import { describe, expect, it } from "vitest";
import type { CaptainEntry } from "@/lib/api";
import { captainsAtSea } from "./useMapCaptains";

const entry = (account: string, seed = false): CaptainEntry => ({ account, name: account, rank: "Ensign", class: "c", xp: 0, wins: 0, losses: 0, sunk: 0, gold: "0", seed });

describe("captainsAtSea", () => {
  it("never puts the viewer on their own chart and keeps board ranks", () => {
    const board = [entry("me"), entry("seed-a", true), entry("you"), entry("them")];
    const sea = captainsAtSea(board, "me");
    expect(sea.map((r) => r.captain.account)).toEqual(["you", "them", "seed-a"]);
    expect(sea.map((r) => r.rank)).toEqual([3, 4, 2]);
  });
});
