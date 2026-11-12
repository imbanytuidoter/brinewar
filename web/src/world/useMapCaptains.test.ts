import { describe, expect, it } from "vitest";
import type { CaptainEntry } from "@/lib/api";
import { captainsAtSea } from "./useMapCaptains";

const entry = (account: string, seed = false): CaptainEntry => ({ account, name: account, rank: "Ensign", class: "c", xp: 0, wins: 0, losses: 0, sunk: 0, gold: "0", seed });

describe("captainsAtSea", () => {
  it("puts live captains first, ranked among live captains, and never shows the viewer", () => {
    const board = [entry("seed-a", true), entry("me"), entry("seed-b", true), entry("you"), entry("them")];
    const sea = captainsAtSea(board, "me");
    expect(sea.map((r) => r.captain.account)).toEqual(["you", "them", "seed-a", "seed-b"]);
    expect(sea.map((r) => r.rank)).toEqual([2, 3, null, null]);
  });

  it("puts every live captain to sea and only tops up with bots", () => {
    const live = Array.from({ length: 40 }, (_, i) => entry(`c${i}`));
    const bots = Array.from({ length: 30 }, (_, i) => entry(`s${i}`, true));
    expect(captainsAtSea([...bots, ...live], null)).toHaveLength(40);
    expect(captainsAtSea([...bots, ...live.slice(0, 5)], null)).toHaveLength(24);
  });
});
