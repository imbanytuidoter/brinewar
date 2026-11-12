import { describe, expect, it } from "vitest";
import type { Mark } from "@/scene/types";
import { confirmedSunk, shipAt, sunkOwn } from "./sunk";

const marks = (hits: number[], misses: number[]): Map<number, Mark> => new Map<number, Mark>([...hits.map((i): [number, Mark] => [i, "hit"]), ...misses.map((i): [number, Mark] => [i, "miss"])]);

describe("sunk ships", () => {
  it("confirms a ship once both ends are closed by misses or the edge", () => {
    expect(confirmedSunk(marks([0, 1], [2]))).toEqual([[0, 1]]);
    expect(confirmedSunk(marks([0, 1], []))).toEqual([]);
    expect(confirmedSunk(marks([44, 54], [34, 64]))).toEqual([[44, 54]]);
  });

  it("needs all four sides closed for a single hit", () => {
    expect(confirmedSunk(marks([55], [45, 65, 54]))).toEqual([]);
    expect(confirmedSunk(marks([55], [45, 65, 54, 56]))).toEqual([[55]]);
    expect(confirmedSunk(marks([0], [1, 10]))).toEqual([[0]]);
  });

  it("treats four hits in a row as sunk at once", () => {
    expect(confirmedSunk(marks([30, 31, 32, 33], []))).toEqual([[30, 31, 32, 33]]);
  });

  it("does not join hits across a row edge", () => {
    expect(confirmedSunk(marks([9, 10], [8, 11, 19, 0]))).toEqual([[9]]);
  });

  it("finds own ships that are fully hit", () => {
    const ships = [[0, 1], [5], [20, 30, 40]];
    expect(sunkOwn(ships, marks([0, 1, 20], []))).toEqual([[0, 1]]);
    expect(shipAt(ships, 30)).toEqual([20, 30, 40]);
    expect(shipAt(ships, 99)).toBeNull();
  });
});
