interface HotCell {
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

interface FleetHeat {
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

const FIRST_LOOK = 30;

interface Exposure {
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
