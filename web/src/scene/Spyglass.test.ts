import { describe, expect, it } from "vitest";
import { sweepRoute } from "./Spyglass";

describe("sweepRoute", () => {
  it("visits every cell once, always stepping to the nearest one left", () => {
    expect(sweepRoute([0, 99, 1, 98, 2], null)).toEqual([0, 1, 2, 98, 99]);
    expect(sweepRoute([], null)).toEqual([]);
  });
});
