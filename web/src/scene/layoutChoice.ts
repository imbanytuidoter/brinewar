import type { KeyValue } from "@/lib/storage";
import { LAYOUTS } from "./layouts";

const slot = (gameId: number): string => `brinewar.layout.${gameId}`;

export function randomLayout(rng: () => number = Math.random): number {
  return Math.floor(rng() * LAYOUTS.length) % LAYOUTS.length;
}

export function layoutForBattle(store: KeyValue, gameId: number | null, pick: number): number {
  if (gameId === null) return pick;
  const raw = store.get(slot(gameId));
  const saved = raw === null ? Number.NaN : Number(raw);
  if (Number.isInteger(saved) && saved >= 0 && saved < LAYOUTS.length) return saved;
  try {
    store.set(slot(gameId), String(pick));
  } catch {
    return pick;
  }
  return pick;
}
