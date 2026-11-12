import { describe, expect, it } from "vitest";
import { makeWaves, seaHeight, seaTilt } from "./gerstner";
import { addedMarks, BOARD_ORIGIN, cellCenter, isHorizontal, revealRise, REVEAL_END, shipCenter, shipIndexOf, sunkShips, worldToCell } from "./grid";
import type { Mark } from "./types";

describe("gerstner waves", () => {
  it("returns zero height at the origin at time zero", () => {
    const waves = makeWaves(false);
    expect(seaHeight(waves, 0, 0, 0)).toBeCloseTo(0, 10);
  });

  it("keeps reduced-motion waves at 40 percent of the full amplitude", () => {
    const full = makeWaves(false);
    const calm = makeWaves(true);
    full.forEach((w, i) => expect(calm[i]?.a).toBeCloseTo(w.a * 0.4, 10));
  });

  it("stays within the summed amplitude everywhere", () => {
    const waves = makeWaves(false);
    const max = waves.reduce((s, w) => s + w.a, 0);
    for (let i = 0; i < 200; i++) {
      const h = seaHeight(waves, i * 0.37 - 30, i * 0.71 - 40, i * 0.13);
      expect(Math.abs(h)).toBeLessThanOrEqual(max + 1e-9);
    }
  });

  it("uses unit wave directions and deep-water speeds", () => {
    for (const w of makeWaves(false)) {
      expect(Math.hypot(w.dx, w.dz)).toBeCloseTo(1, 10);
      expect(w.c).toBeCloseTo(Math.sqrt(9.8 / w.k), 10);
    }
  });

  it("reports a small tilt on gentle seas", () => {
    const tilt = seaTilt(makeWaves(false), 3, -2, 1.5);
    expect(Math.abs(tilt.pitch)).toBeLessThan(0.5);
    expect(Math.abs(tilt.roll)).toBeLessThan(0.5);
  });
});

describe("board geometry", () => {
  it("centres cell A1 and J10 on both boards", () => {
    expect(cellCenter("mine", 0)).toEqual({ x: -10.5, z: -4.5 });
    expect(cellCenter("mine", 99)).toEqual({ x: -1.5, z: 4.5 });
    expect(cellCenter("enemy", 0)).toEqual({ x: 1.5, z: -4.5 });
    expect(cellCenter("enemy", 37)).toEqual({ x: 8.5, z: -1.5 });
  });

  it("maps world points back to cells and rejects points off the board", () => {
    for (const side of ["mine", "enemy"] as const)
      for (let i = 0; i < 100; i++) {
        const c = cellCenter(side, i);
        expect(worldToCell(side, c.x, c.z)).toBe(i);
      }
    const o = BOARD_ORIGIN.enemy;
    expect(worldToCell("enemy", o.x - 0.01, o.z + 1)).toBeNull();
    expect(worldToCell("enemy", o.x + 10, o.z + 1)).toBeNull();
    expect(worldToCell("enemy", o.x + 1, o.z + 10)).toBeNull();
    expect(worldToCell("enemy", Number.NaN, 0)).toBeNull();
  });

  it("finds ship centres and orientation", () => {
    expect(shipCenter("mine", [20, 21, 22])).toEqual({ x: -9.5, z: -2.5 });
    expect(shipCenter("enemy", [0, 10, 20, 30])).toEqual({ x: 1.5, z: -3 });
    expect(isHorizontal([4, 5])).toBe(true);
    expect(isHorizontal([4, 14])).toBe(false);
    expect(isHorizontal([7])).toBe(true);
  });
});

describe("marks", () => {
  const m = (entries: Array<[number, Mark]>) => new Map<number, Mark>(entries);

  it("marks a ship sunk only when every cell is hit", () => {
    const ships = [[0, 1], [5], [40, 50, 60]];
    expect(sunkShips(ships, m([[0, "hit"], [1, "hit"], [5, "miss"], [40, "hit"], [50, "hit"]]))).toEqual([true, false, false]);
    expect(sunkShips([[]], m([]))).toEqual([false]);
  });

  it("lists only new or changed marks", () => {
    const prev = m([[1, "miss"], [2, "hit"]]);
    const next = m([[1, "miss"], [2, "hit"], [3, "hit"], [4, "miss"]]);
    expect(addedMarks(prev, next)).toEqual([[3, "hit"], [4, "miss"]]);
    expect(addedMarks(next, next)).toEqual([]);
  });

  it("finds which ship holds a cell", () => {
    expect(shipIndexOf([[0, 1], [33]], 33)).toBe(1);
    expect(shipIndexOf([[0, 1], [33]], 34)).toBe(-1);
  });
});

describe("reveal wave", () => {
  it("raises ships from left to right and finishes the whole board", () => {
    expect(revealRise(-1, 0)).toBe(0);
    expect(revealRise(0, 0)).toBe(0);
    expect(revealRise(0.2, 0.5)).toBeGreaterThan(revealRise(0.2, 6));
    expect(revealRise(REVEAL_END, 10)).toBe(1);
  });
});

describe("calm water over the boards", () => {
  it("keeps waves low on both boards and full far away", async () => {
    const { calm, CALM, makeWaves, seaHeight } = await import("./gerstner");
    expect(calm(-6, 0)).toBeCloseTo(CALM);
    expect(calm(6, 4)).toBeCloseTo(CALM);
    expect(calm(40, 30)).toBe(1);
    const waves = makeWaves(false);
    const peak = Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(seaHeight(waves, -6, 0, i * 0.37))));
    expect(peak).toBeLessThan(0.1);
  });
});
