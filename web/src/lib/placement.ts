import { CELLS } from "./merkle";
import { isLegalFleet, ships } from "./fleet";

const SIZE = 10;

export interface Hull {
  readonly cells: readonly number[];
  readonly horizontal: boolean;
}

export function hullOf(cells: readonly number[], index: number): Hull | null {
  const ship = ships(cells).find((s) => s.includes(index));
  if (!ship) return null;
  const horizontal = ship.length === 1 || Math.floor((ship[0] as number) / SIZE) === Math.floor((ship[1] as number) / SIZE);
  return { cells: ship, horizontal };
}

function body(bow: number, length: number, horizontal: boolean): number[] | null {
  const x = bow % SIZE;
  const y = Math.floor(bow / SIZE);
  if (bow < 0 || bow >= CELLS) return null;
  if (horizontal ? x + length > SIZE : y + length > SIZE) return null;
  return Array.from({ length }, (_, j) => (horizontal ? bow + j : bow + j * SIZE));
}

function place(cells: readonly number[], hull: Hull, next: readonly number[] | null): number[] | null {
  if (!next) return null;
  const out = cells.map((c, i) => (hull.cells.includes(i) ? 0 : c));
  for (const i of next) out[i] = 1;
  return isLegalFleet(out) ? out : null;
}

export function moveHull(cells: readonly number[], hull: Hull, bow: number): number[] | null {
  return place(cells, hull, body(bow, hull.cells.length, hull.horizontal));
}

export function rotateHull(cells: readonly number[], hull: Hull): number[] | null {
  const len = hull.cells.length;
  const turned = !hull.horizontal;
  const tried = new Set<number>();
  for (const pivot of hull.cells) {
    for (let k = 0; k < len; k++) {
      const bow = turned ? pivot - k : pivot - k * SIZE;
      if (tried.has(bow) || (turned && Math.floor(bow / SIZE) !== Math.floor(pivot / SIZE))) continue;
      tried.add(bow);
      const next = place(cells, hull, body(bow, len, turned));
      if (next) return next;
    }
  }
  return null;
}

export function nudgeHull(cells: readonly number[], hull: Hull, dx: number, dy: number): number[] | null {
  const bow = hull.cells[0] as number;
  const x = (bow % SIZE) + dx;
  const y = Math.floor(bow / SIZE) + dy;
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return null;
  return moveHull(cells, hull, y * SIZE + x);
}

export function bowFor(hull: Hull, grabbed: number, target: number): number {
  const offset = hull.cells.indexOf(grabbed);
  const k = offset < 0 ? 0 : offset;
  return hull.horizontal ? target - k : target - k * SIZE;
}

export function previewBody(hull: Hull, bow: number): number[] | null {
  return body(bow, hull.cells.length, hull.horizontal);
}
