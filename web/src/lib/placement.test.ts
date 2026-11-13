import { describe, expect, it } from "vitest";
import { isLegalFleet } from "./fleet";
import { fleetHeat, heatAlpha, hottest } from "./heat";
import { bowFor, hullOf, moveHull, nudgeHull, previewBody, rotateHull } from "./placement";

const LEGAL_A = [0, 1, 2, 3, 20, 21, 22, 26, 27, 28, 40, 41, 44, 45, 48, 49, 60, 62, 64, 66];
const cellsOf = (list: number[]): number[] => Array.from({ length: 100 }, (_, i) => (list.includes(i) ? 1 : 0));
const on = (cells: readonly number[]): number[] => cells.flatMap((c, i) => (c === 1 ? [i] : []));

describe("placement", () => {
  const fleet = cellsOf(LEGAL_A);

  it("finds the hull under a cell and its orientation", () => {
    expect(hullOf(fleet, 2)).toEqual({ cells: [0, 1, 2, 3], horizontal: true });
    expect(hullOf(fleet, 60)).toEqual({ cells: [60], horizontal: true });
    expect(hullOf(fleet, 5)).toBeNull();
  });

  it("moves a ship to open water and keeps the fleet legal", () => {
    const hull = hullOf(fleet, 0);
    const moved = moveHull(fleet, hull!, 86);
    expect(moved).not.toBeNull();
    expect(isLegalFleet(moved!)).toBe(true);
    expect(on(moved!)).toEqual(expect.arrayContaining([86, 87, 88, 89]));
    expect(moved![0]).toBe(0);
  });

  it("refuses moves that touch another ship or leave the sea", () => {
    const hull = hullOf(fleet, 0)!;
    expect(moveHull(fleet, hull, 7)).toBeNull();
    expect(moveHull(fleet, hull, 30)).toBeNull();
    expect(moveHull(fleet, hull, 100)).toBeNull();
  });

  it("rotates a ship in place, backs it off the edge, or refuses", () => {
    const pair = hullOf(fleet, 48)!;
    expect(on(rotateHull(fleet, pair)!)).toEqual(expect.arrayContaining([48, 58]));
    const edge = cellsOf([96, 97, 98, 99, 20, 21, 22, 26, 27, 28, 40, 41, 44, 45, 48, 49, 60, 62, 64, 7]);
    const turned = rotateHull(edge, hullOf(edge, 96)!);
    expect(turned).not.toBeNull();
    expect(on(turned!)).toEqual(expect.arrayContaining([66, 76, 86, 96]));
    expect(hullOf(turned!, 66)?.horizontal).toBe(false);
    const boxed = cellsOf([90, 91, 92, 93, 20, 21, 22, 26, 27, 28, 40, 41, 44, 45, 48, 49, 60, 62, 64, 66]);
    expect(rotateHull(boxed, hullOf(boxed, 90)!)).toBeNull();
  });

  it("turns a ship around whichever of its cells has room, not only the bow", () => {
    const crowded = cellsOf([0, 1, 2, 3, 20, 21, 22, 26, 27, 28, 40, 41, 48, 49, 55, 56, 34, 74, 90, 99]);
    expect(isLegalFleet(crowded)).toBe(true);
    const pair = hullOf(crowded, 55)!;
    const turned = rotateHull(crowded, pair);
    expect(turned).not.toBeNull();
    expect(hullOf(turned!, on(turned!).find((c) => !on(crowded).includes(c))!)?.horizontal).toBe(false);
  });

  it("nudges by one cell and stops at the edge", () => {
    const single = hullOf(fleet, 66)!;
    expect(on(nudgeHull(fleet, single, 2, 2)!)).toContain(88);
    expect(nudgeHull(fleet, hullOf(fleet, 0)!, 0, -1)).toBeNull();
  });

  it("keeps the grabbed cell under the pointer", () => {
    const hull = hullOf(fleet, 21)!;
    expect(bowFor(hull, 22, 85)).toBe(83);
    expect(previewBody(hull, 83)).toEqual([83, 84, 85]);
    expect(previewBody(hull, 98)).toBeNull();
  });
});

describe("heat", () => {
  const heat = Array.from({ length: 100 }, (_, i) => (i === 0 ? 7 : i < 10 ? 5 : 1));

  it("names the hottest cell and the share of boards that hid a ship there", () => {
    expect(hottest(heat, 10)).toEqual({ cell: 0, share: 0.7 });
    expect(hottest(heat, 0)).toBeNull();
    expect(hottest(new Array(100).fill(0), 5)).toBeNull();
  });

  it("rates a fleet by the heat under its ships", () => {
    expect(fleetHeat(cellsOf([0, 1, 2, 3]), heat)?.risk).toBe("high");
    expect(fleetHeat(cellsOf([90, 91]), heat)?.risk).toBe("low");
    expect(fleetHeat(cellsOf([1]), new Array(100).fill(0))).toBeNull();
    expect(heatAlpha(heat, 0)).toBe(1);
  });
});
