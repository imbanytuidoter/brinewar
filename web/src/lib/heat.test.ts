import { describe, expect, it } from "vitest";
import { exposure } from "./heat";

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
