import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/fleet";
import { bounty, economyOf, entryFee, huntOrder, rankProgress, simulate } from "./economy";

const e = economyOf({ base_entry: "10", entry_threshold: "500", bounty_bps: 500, bounty_cap: "25", bounties_per_day: 3 });

describe("economy mirrors the contract formulas", () => {
  it("raises the entry as the treasury drains below the threshold", () => {
    expect(entryFee(e, 1000n)).toBe(10n);
    expect(entryFee(e, 500n)).toBe(10n);
    expect(entryFee(e, 250n)).toBe(15n);
    expect(entryFee(e, 0n)).toBe(20n);
  });

  it("pays a capped share of the treasury", () => {
    expect(bounty(e, 1000n)).toBe(25n);
    expect(bounty(e, 200n)).toBe(10n);
    expect(bounty(e, 0n)).toBe(0n);
  });

  it("simulates battles deterministically from a seed and never drives the treasury negative", () => {
    const a = simulate(e, 300n, 50, 0.9, seededRng(4));
    expect(a).toHaveLength(51);
    expect(a).toEqual(simulate(e, 300n, 50, 0.9, seededRng(4)));
    expect(a.every((s) => s.treasury >= 0n)).toBe(true);
    expect((a.at(-1) as (typeof a)[number]).treasury < 300n).toBe(true);
    const lose = simulate(e, 300n, 10, 0, seededRng(1));
    expect(lose.at(-1)?.treasury).toBeGreaterThan(300n);
  });
});

describe("ranks and hunting", () => {
  it("measures progress to the next rank", () => {
    expect(rankProgress(0)).toEqual({ rank: "Ensign", next: "Lieutenant", share: 0 });
    expect(rankProgress(200)).toEqual({ rank: "Lieutenant", next: "Captain", share: 0.5 });
    expect(rankProgress(5000)).toEqual({ rank: "Admiral", next: null, share: 1 });
  });

  it("hunts the hottest cells first and breaks ties by index like the contract", () => {
    const heat = Array.from({ length: 100 }, () => 0);
    heat[42] = 5;
    heat[7] = 5;
    heat[90] = 9;
    expect(huntOrder(heat).slice(0, 4)).toEqual([90, 7, 42, 0]);
  });
});
