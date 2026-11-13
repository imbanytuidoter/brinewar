import { clusters, confirmedSunk } from "./sunk";
export interface HotCell {
  readonly cell: number;
  readonly share: number;
}

export function hottest(heat: readonly number[], boards: number): HotCell | null {
  if (boards <= 0 || heat.length === 0) return null;
  let cell = 0;
  for (let i = 1; i < heat.length; i++) if ((heat[i] ?? 0) > (heat[cell] ?? 0)) cell = i;
  const top = heat[cell] ?? 0;
  if (top <= 0) return null;
  return { cell, share: Math.min(1, top / boards) };
}

export type Risk = "low" | "medium" | "high";

export interface FleetHeat {
  readonly ratio: number;
  readonly risk: Risk;
}

const LOW = 0.85;
const HIGH = 1.15;

export function fleetHeat(cells: readonly number[], heat: readonly number[]): FleetHeat | null {
  const total = heat.reduce((s, h) => s + h, 0);
  const shipCells = cells.flatMap((c, i) => (c === 1 ? [i] : []));
  if (total <= 0 || shipCells.length === 0) return null;
  const mean = total / heat.length;
  const mine = shipCells.reduce((s, i) => s + (heat[i] ?? 0), 0) / shipCells.length;
  const ratio = mine / mean;
  return { ratio, risk: ratio < LOW ? "low" : ratio > HIGH ? "high" : "medium" };
}

export function heatAlpha(heat: readonly number[], index: number): number {
  const max = Math.max(...heat, 0);
  if (max <= 0) return 0;
  return (heat[index] ?? 0) / max;
}

export const FIRST_LOOK = 30;

export interface Exposure {
  readonly looked: number;
  readonly exposed: number;
  readonly ships: number;
}

export function exposure(cells: readonly number[], heat: readonly number[], firstLook = FIRST_LOOK): Exposure | null {
  const ranked = heat
    .map((h, i) => ({ h, i }))
    .filter((c) => c.h > 0)
    .sort((a, b) => b.h - a.h || a.i - b.i)
    .slice(0, firstLook)
    .map((c) => c.i);
  if (ranked.length === 0) return null;
  const first = new Set(ranked);
  const ships = cells.flatMap((c, i) => (c === 1 ? [i] : []));
  return { looked: ranked.length, exposed: ships.filter((i) => first.has(i)).length, ships: ships.length };
}

const CHART_CHOICES = 6;
const HUNT_SHOWN = 8;
const SIZE = 10;

function around(cell: number): number[] {
  const x = cell % SIZE;
  return [cell - SIZE, x < SIZE - 1 ? cell + 1 : -1, cell + SIZE, x > 0 ? cell - 1 : -1].filter((c) => c >= 0 && c < SIZE * SIZE);
}

function touching(a: number, b: number): boolean {
  return Math.abs((a % SIZE) - (b % SIZE)) <= 1 && Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) <= 1;
}

function diagonal(a: number, b: number): boolean {
  return Math.abs((a % SIZE) - (b % SIZE)) === 1 && Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) === 1;
}

function lineEnds(ship: readonly number[], hits: ReadonlySet<number>): number[] {
  if (ship.length === 1) return around(ship[0] as number);
  const first = ship[0] as number;
  const last = ship[ship.length - 1] as number;
  const across = Math.floor(first / SIZE) === Math.floor(last / SIZE);
  const out: number[] = [];
  if (across) {
    if (first % SIZE > 0) out.push(first - 1);
    if (last % SIZE < SIZE - 1) out.push(last + 1);
  } else {
    if (first >= SIZE) out.push(first - SIZE);
    if (last < SIZE * (SIZE - 1)) out.push(last + SIZE);
  }
  return out.filter((c) => !hits.has(c));
}

export function lookout(fired: ReadonlyMap<number, "hit" | "miss">, heat: readonly number[] | null): number[] {
  const hits = new Set([...fired].filter(([, m]) => m === "hit").map(([c]) => c));
  const sunk = confirmedSunk(fired);
  const sunkCells = sunk.flat();
  const open = (c: number): boolean => !fired.has(c) && ![...hits].some((h) => diagonal(h, c)) && !sunkCells.some((s) => touching(s, c));
  const sunkKeys = new Set(sunk.map((s) => s.join()));
  const afloat = clusters(hits).filter((s) => !sunkKeys.has(s.join()));
  for (const ship of afloat) {
    const finish = lineEnds(ship, hits).filter(open);
    if (finish.length > 0) return finish;
  }
  if (heat && heat.some((h) => h > 0))
    return heat
      .map((h, i) => ({ h, i }))
      .filter((c) => c.h > 0 && open(c.i))
      .sort((a, b) => b.h - a.h || a.i - b.i)
      .slice(0, CHART_CHOICES)
      .map((c) => c.i);
  return Array.from({ length: SIZE * SIZE }, (_, i) => i)
    .filter((c) => ((c % SIZE) + Math.floor(c / SIZE)) % 2 === 0 && open(c))
    .slice(0, HUNT_SHOWN);
}
