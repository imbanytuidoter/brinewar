import type { AdmiraltyView, TreasuryView } from "../lib/contract.js";
import type { Store } from "../lib/db.js";
import type { Viewer } from "../lib/near.js";

export async function sample(viewer: Viewer, store: Store, height: () => Promise<number>): Promise<{ treasury: boolean; admiralty: boolean }> {
  const [treasury, map, block] = await Promise.all([
    viewer.view<TreasuryView>("treasury"),
    viewer.view<AdmiraltyView>("admiralty_map"),
    height(),
  ]);
  const t = { balance: treasury.balance, entry: treasury.entry, bounty: treasury.bounty };
  const lastT = store.lastSample("treasury")?.data;
  const changedT = JSON.stringify(lastT) !== JSON.stringify(t);
  if (changedT) store.addSample("treasury", block, t);
  const lastA = store.lastSample("admiralty")?.data as AdmiraltyView | undefined;
  const changedA = !lastA || lastA.boards_counted !== map.boards_counted || lastA.day !== map.day;
  if (changedA) store.addSample("admiralty", block, map);
  return { treasury: changedT, admiralty: changedA };
}
