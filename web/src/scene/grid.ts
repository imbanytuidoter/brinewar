import type { Mark, Side } from "./types";

export const SIZE = 10;
export const REVEAL_END = 1.2;
export const REVEAL_SPAN = 12;

export interface Point2 {
  readonly x: number;
  readonly z: number;
}

export const BOARD_ORIGIN: Readonly<Record<Side, Point2>> = {
  mine: { x: -11, z: -5 },
  enemy: { x: 1, z: -5 },
};

export const MODEL_FOR_LENGTH: Readonly<Record<number, string>> = {
  4: "ship-large",
  3: "ship-medium",
  2: "ship-small",
  1: "boat-row-large",
};

export function cellCenter(side: Side, index: number): Point2 {
  const o = BOARD_ORIGIN[side];
  return { x: o.x + (index % SIZE) + 0.5, z: o.z + Math.floor(index / SIZE) + 0.5 };
}

export function worldToCell(side: Side, x: number, z: number): number | null {
  const o = BOARD_ORIGIN[side];
  const qx = x - o.x;
  const qz = z - o.z;
  if (!(qx >= 0 && qz >= 0 && qx < SIZE && qz < SIZE)) return null;
  return Math.floor(qz) * SIZE + Math.floor(qx);
}

export function shipCenter(side: Side, cells: readonly number[]): Point2 {
  const first = cellCenter(side, cells[0] ?? 0);
  const last = cellCenter(side, cells[cells.length - 1] ?? 0);
  return { x: (first.x + last.x) / 2, z: (first.z + last.z) / 2 };
}

export function isHorizontal(cells: readonly number[]): boolean {
  if (cells.length < 2) return true;
  return (cells[1] ?? 0) - (cells[0] ?? 0) === 1;
}

export function sunkShips(ships: readonly (readonly number[])[], marks: ReadonlyMap<number, Mark>): boolean[] {
  return ships.map((cells) => cells.length > 0 && cells.every((c) => marks.get(c) === "hit"));
}

export function addedMarks(prev: ReadonlyMap<number, Mark>, next: ReadonlyMap<number, Mark>): Array<[number, Mark]> {
  const out: Array<[number, Mark]> = [];
  for (const [cell, mark] of next) if (prev.get(cell) !== mark) out.push([cell, mark]);
  return out;
}

export function revealRise(progress: number, xFromBoardEdge: number): number {
  if (progress < 0) return 0;
  return Math.min(1, Math.max(0, (progress * REVEAL_SPAN - xFromBoardEdge) / 2));
}

export function shipIndexOf(ships: readonly (readonly number[])[], cell: number): number {
  return ships.findIndex((s) => s.includes(cell));
}
