import { describe, expect, it } from "vitest";
import { layoutForBattle, randomLayout } from "./layoutChoice";
import { LAYOUTS } from "./layouts";

describe("battle setting", () => {
  it("gives both captains of a battle the same setting, taken from the battle number", () => {
    expect(layoutForBattle(41, 0)).toBe(layoutForBattle(41, 3));
    expect(layoutForBattle(41, 0)).toBe(41 % LAYOUTS.length);
    expect(layoutForBattle(null, 2)).toBe(2);
  });

  it("cycles through every setting", () => {
    const seen = new Set(Array.from({ length: LAYOUTS.length }, (_, i) => layoutForBattle(100 + i, 0)));
    expect(seen.size).toBe(LAYOUTS.length);
  });

  it("picks a valid setting at random before a battle has a number", () => {
    expect(randomLayout(() => 0)).toBe(0);
    expect(randomLayout(() => 0.999)).toBe(LAYOUTS.length - 1);
  });
});
