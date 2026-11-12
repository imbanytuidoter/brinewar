import type { ShipLook } from "@/scene/types";
import type { Viewer } from "./chain";
import type { KeyValue } from "./storage";

const LOOKS: Readonly<Record<string, ShipLook & { readonly title: string }>> = {
  brine: { title: "Brine", sail: "#e8f3f2", flag: "#3fb6c9", trail: "#cfe9ee" },
  coral: { title: "Coral", sail: "#f2a58e", flag: "#ff6a3d", hull: "#ffc2ae", trail: "#ff9a7a" },
  ghost: { title: "Ghost", sail: "#c9d6dc", flag: "#f4f7f8", hull: "#9fb0b8", trail: "#e6f2f7" },
  gilded: { title: "Gilded", sail: "#f3d27a", flag: "#b02a6b", hull: "#ffd98a", trail: "#ffd36b" },
  "night-watch": { title: "Night watch", sail: "#2c3e57", flag: "#ffcf5a", hull: "#5b6f8f", trail: "#8fb6ff" },
  storm: { title: "Storm", sail: "#5d6f7d", flag: "#7fe0b5", hull: "#7d8f99", trail: "#9ff0d0" },
  admiral: { title: "Admiral", sail: "#7a1630", flag: "#ffcf5a", hull: "#c98a6a", trail: "#ffcf5a" },
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

export function skinLook(name: string): ShipLook & { readonly title: string } {
  const known = LOOKS[name];
  if (known) return known;
  const h = hueOf(name);
  return { title: name.replace(/-/g, " "), sail: `hsl(${h} 45% 78%)`, flag: `hsl(${(h + 180) % 360} 70% 55%)` };
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
