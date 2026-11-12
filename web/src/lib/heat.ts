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
