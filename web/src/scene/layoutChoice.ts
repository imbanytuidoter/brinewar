import { LAYOUTS } from "./layouts";

export function randomLayout(rng: () => number = Math.random): number {
  return Math.floor(rng() * LAYOUTS.length) % LAYOUTS.length;
}

export function layoutForBattle(gameId: number | null, pick: number): number {
  if (gameId === null) return pick;
  return ((gameId % LAYOUTS.length) + LAYOUTS.length) % LAYOUTS.length;
}
