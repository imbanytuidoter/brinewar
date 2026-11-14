import type { Store } from "./db.js";
import type { Viewer } from "./near.js";

const LINEAGE_KEY = "chain_lineage";

export class LineageError extends Error {}

export async function bindLineage(store: Store, viewer: Viewer, contract: string): Promise<void> {
  const first = await viewer.view<{ created_block: number } | null>("get_game", { game_id: 0 });
  if (!first) return;
  const lineage = `${contract}:${first.created_block}`;
  const known = store.get(LINEAGE_KEY);
  if (known === undefined) {
    store.set(LINEAGE_KEY, lineage);
    return;
  }
  if (known !== lineage) throw new LineageError(`this database belongs to ${known}, not ${lineage}; boards and answers would leak into new games`);
}

interface LineageLog {
  warn(obj: object, msg: string): void;
}

const LINEAGE_TRIES = 5;
const LINEAGE_PAUSE_MS = 2000;

export async function bindLineageSoon(store: Store, viewer: Viewer, contract: string, log: LineageLog, pauseMs = LINEAGE_PAUSE_MS): Promise<boolean> {
  for (let i = 1; i <= LINEAGE_TRIES; i++) {
    try {
      await bindLineage(store, viewer, contract);
      return true;
    } catch (err) {
      if (err instanceof LineageError) throw err;
      log.warn({ err: err instanceof Error ? err.message : String(err), attempt: i }, "could not read the chain to check the database lineage");
      if (i < LINEAGE_TRIES) await new Promise((r) => setTimeout(r, pauseMs));
    }
  }
  return false;
}
