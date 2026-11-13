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
  it("watches the water around a wounded ship first", () => {
    const fired = new Map<number, "hit" | "miss">([[44, "hit"], [43, "miss"]]);
    expect(lookout(fired, new Set(), null).sort((a, b) => a - b)).toEqual([34, 45, 54]);
  });

  it("then the hottest cells he has not fired at, then a spread", () => {
    const heat = Array.from({ length: 100 }, (_, i) => (i === 7 ? 9 : i === 3 ? 5 : 0));
    expect(lookout(new Map([[7, "miss"]]), new Set(), heat)).toEqual([3]);
    expect(lookout(new Map(), new Set(), null)).toHaveLength(8);
    expect(lookout(new Map([[44, "hit"]]), new Set([44]), null)).not.toContain(45);
  });
});
