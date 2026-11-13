import { describe, expect, it } from "vitest";
import { exposure, lookout } from "./heat";

describe("exposure", () => {
  it("counts the ship cells that sit in the cells he searches first", () => {
    const heat = Array.from({ length: 100 }, (_, i) => (i < 10 ? 10 - i : 0));
    const cells = Array.from({ length: 100 }, (_, i) => (i === 0 || i === 1 || i === 50 ? 1 : 0));
    expect(exposure(cells, heat, 3)).toEqual({ looked: 3, exposed: 2, ships: 3 });
  });

  it("knows nothing before any board is counted", () => {
    expect(exposure([1, 0], [0, 0])).toBeNull();
  });
});

describe("lookout", () => {
  it("follows a wounded ship along its line, as the contract does", () => {
    const fired = new Map<number, "hit" | "miss">([[44, "hit"], [45, "hit"], [43, "miss"]]);
    expect(lookout(fired, null)).toEqual([46]);
    expect(lookout(new Map([[44, "hit"]]), null).sort((a, b) => a - b)).toEqual([34, 43, 45, 54]);
  });

  it("then the six hottest open cells, never next to a sunk ship or diagonal to a hit", () => {
    const heat = Array.from({ length: 100 }, (_, i) => 100 - i);
    const sunkPair = new Map<number, "hit" | "miss">([[0, "hit"], [1, "hit"], [2, "miss"]]);
    const cells = lookout(sunkPair, heat);
    expect(cells).toHaveLength(6);
    expect(cells).not.toContain(10);
    expect(cells).not.toContain(11);
    expect(cells).not.toContain(12);
    expect(cells[0]).toBe(3);
  });

  it("hunts a checkerboard when there is no map", () => {
    const cells = lookout(new Map(), null);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => ((c % 10) + Math.floor(c / 10)) % 2 === 0)).toBe(true);
  });
});
