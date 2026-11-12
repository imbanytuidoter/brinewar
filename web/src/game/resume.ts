import type { GameView, ShotView } from "@/lib/contract";
import { storedAccount } from "@/lib/guest";
import type { KeyValue } from "@/lib/storage";

export interface SavedBattle {
  readonly game: GameView;
  readonly history: readonly ShotView[];
}

export function battleKey(accountId: string): string {
  return `brinewar.battle.${accountId}`;
}

export function saveBattle(store: KeyValue, accountId: string, game: GameView, history: readonly ShotView[]): void {
  try {
    store.set(battleKey(accountId), JSON.stringify({ game, history }));
  } catch {
    return;
  }
}

export function clearBattle(store: KeyValue, accountId: string): void {
  store.remove(battleKey(accountId));
}

function isBattle(v: unknown): v is SavedBattle {
  if (typeof v !== "object" || v === null) return false;
  const { game, history } = v as { game?: unknown; history?: unknown };
  if (typeof game !== "object" || game === null || !Array.isArray(history)) return false;
  const g = game as Partial<GameView>;
  return typeof g.id === "number" && Number.isInteger(g.id) && g.id >= 0 && typeof g.status === "string" && typeof g.a === "string";
}

export function loadBattle(store: KeyValue, accountId: string): SavedBattle | null {
  try {
    const v: unknown = JSON.parse(store.get(battleKey(accountId)) ?? "null");
    if (!isBattle(v) || v.game.status === "Finished") return null;
    if (v.game.a !== accountId && v.game.b !== accountId) return null;
    return v;
  } catch {
    return null;
  }
}

export function openBattle(store: KeyValue): number | null {
  const me = storedAccount(store);
  return me === null ? null : (loadBattle(store, me)?.game.id ?? null);
}
