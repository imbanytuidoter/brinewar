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
