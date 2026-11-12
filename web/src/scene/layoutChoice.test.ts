import { describe, expect, it } from "vitest";
import { memoryStorage } from "@/lib/storage";
import { layoutForBattle, randomLayout } from "./layoutChoice";

describe("battle setting", () => {
  it("keeps the setting chosen at setup once the battle has a number, also after a reload", () => {
    const store = memoryStorage();
    expect(layoutForBattle(store, null, 2)).toBe(2);
    expect(layoutForBattle(store, 41, 2)).toBe(2);
    expect(layoutForBattle(store, 41, 3)).toBe(2);
    expect(layoutForBattle(store, 42, 3)).toBe(3);
  });

  it("picks a valid setting at random", () => {
    expect(randomLayout(() => 0)).toBe(0);
    expect(randomLayout(() => 0.999)).toBeGreaterThan(0);
  });
});
