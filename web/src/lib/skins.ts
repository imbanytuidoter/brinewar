import type { ShipLook } from "@/scene/types";
import type { Viewer } from "./chain";
import type { KeyValue } from "./storage";

export interface SkinLook extends ShipLook {
  readonly title: string;
  readonly sprite: number;
  readonly pennant: number;
}

const LOOKS: Readonly<Record<string, SkinLook>> = {
  brine: { title: "Brine", sail: "#e8f3f2", flag: "#3fb6c9", trail: "#cfe9ee", sprite: 1, pennant: 5 },
  coral: { title: "Coral", rig: "pennants", sail: "#f2a58e", flag: "#ff6a3d", hull: "#ffc2ae", trail: "#ff9a7a", sprite: 3, pennant: 3 },
  ghost: { title: "Ghost", rig: "ghost", sail: "#c9d6dc", flag: "#f4f7f8", hull: "#9fb0b8", trail: "#e6f2f7", sprite: 2, pennant: 2 },
  gilded: { title: "Gilded", rig: "banners", sail: "#f3d27a", flag: "#b02a6b", hull: "#ffd98a", trail: "#ffd36b", sprite: 6, pennant: 6 },
  "night-watch": { title: "Night watch", rig: "cannons", sail: "#2c3e57", flag: "#ffcf5a", hull: "#5b6f8f", trail: "#8fb6ff", sprite: 5, pennant: 6 },
  storm: { title: "Storm", rig: "cannons", sail: "#5d6f7d", flag: "#7fe0b5", hull: "#7d8f99", trail: "#9ff0d0", sprite: 4, pennant: 4 },
  admiral: { title: "Admiral", rig: "warship", sail: "#7a1630", flag: "#ffcf5a", hull: "#c98a6a", trail: "#ffcf5a", sprite: 3, pennant: 6 },
};

const SOURCES: Readonly<Record<string, string>> = {
  brine: "starter",
  coral: "starter",
  ghost: "starter",
  "night-watch": "Lieutenant",
  gilded: "Captain",
  storm: "Commodore",
  admiral: "Admiral",
};

export function catalogSkins(): readonly string[] {
  return Object.keys(SOURCES);
}

export function skinSource(name: string): string | null {
  return SOURCES[name] ?? null;
}

function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function skinLook(name: string): SkinLook {
  const known = LOOKS[name];
  if (known) return known;
  const h = hueOf(name);
  return { title: name.replace(/-/g, " "), sail: `hsl(${h} 45% 78%)`, flag: `hsl(${(h + 180) % 360} 70% 55%)`, sprite: (h % 6) + 1, pennant: ((h >> 2) % 6) + 1 };
}

const slot = (accountId: string): string => `brinewar.skin.${accountId}`;

export function equippedSkin(store: KeyValue, accountId: string, owned: readonly string[]): string | null {
  const name = store.get(slot(accountId));
  return name && owned.includes(name) ? name : null;
}

export function equipSkin(store: KeyValue, accountId: string, name: string | null): void {
  try {
    if (name) store.set(slot(accountId), name);
    else store.remove(slot(accountId));
  } catch {
    return;
  }
}

export const BALANCE_BATCH = 16;

export async function ownedSkins(viewer: Viewer, accountId: string): Promise<{ readonly all: string[]; readonly owned: string[] }> {
  const all = [...new Set(await viewer.view<string[]>("skins"))];
  const chunks: string[][] = [];
  for (let i = 0; i < all.length; i += BALANCE_BATCH) chunks.push(all.slice(i, i + BALANCE_BATCH));
  const balances = (await Promise.all(chunks.map((c) => viewer.view<string[]>("mt_batch_balance_of", { account_id: accountId, token_ids: c.map((n) => `skin:${n}`) })))).flat();
  const owned = all.filter((_, i) => /^\d+$/.test(balances[i] ?? "") && BigInt(balances[i] as string) > 0n);
  return { all, owned };
}
