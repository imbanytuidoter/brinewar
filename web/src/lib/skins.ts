import type { ShipLook } from "@/scene/types";
import type { Viewer } from "./chain";
import type { KeyValue } from "./storage";

export interface SkinLook extends ShipLook {
  readonly title: string;
  readonly sprite: number;
  readonly pennant: number;
  readonly perks?: readonly string[];
}

const LOOKS: Readonly<Record<string, SkinLook>> = {
  brine: { title: "Brine", sail: "#e8f3f2", flag: "#3fb6c9", trail: "#cfe9ee", sprite: 1, pennant: 5 },
  coral: { title: "Coral", perks: ["Pennants"], rig: "pennants", sail: "#f2a58e", flag: "#ff6a3d", hull: "#ffc2ae", trail: "#ff9a7a", sprite: 3, pennant: 3 },
  ghost: { title: "Ghost", perks: ["Spectral glow"], rig: "ghost", sail: "#c9d6dc", flag: "#f4f7f8", hull: "#9fb0b8", trail: "#e6f2f7", sprite: 2, pennant: 2 },
  "night-watch": {
    title: "Night watch",
    perks: ["Pirate hull", "Cannons", "Lanterns"],
    hulls: "pirate",
    rig: "cannons",
    sail: "#2d4673",
    flag: "#ffb347",
    hull: "#9a6a48",
    trail: "#ffc46b",
    lights: { color: "#ffb347", at: ["lanterns"] },
    sprite: 5,
    pennant: 6,
  },
  gilded: {
    title: "Gilded",
    perks: ["Gold finish", "Cannons", "Banners", "Gold glints"],
    rig: "broadside",
    sail: "#fff4d8",
    flag: "#b3123f",
    hull: "#f4d77a",
    trail: "#ffe08a",
    finish: { metal: 0.6, rough: 0.24, glow: "#6b5512", glowPower: 0.4, sailGlow: 0.1 },
    aura: { color: "#ffe08a", rate: 0.9 },
    sprite: 6,
    pennant: 6,
  },
  storm: {
    title: "Storm",
    perks: ["Steel finish", "Cannons", "St Elmo's fire"],
    rig: "cannons",
    sail: "#3e5566",
    flag: "#7fe0d0",
    hull: "#8aa0ad",
    trail: "#9ff0e0",
    finish: { metal: 0.45, rough: 0.35, glow: "#0d3a40", glowPower: 0.35 },
    lights: { color: "#7ff6e6", at: ["mastheads"], flicker: true },
    aura: { color: "#c6fbff", rate: 0.6 },
    sprite: 4,
    pennant: 4,
  },
  admiral: {
    title: "Admiral",
    perks: ["Two gun decks", "Pennants & banners", "Lanterns", "Masthead lights", "Gold glow"],
    rig: "flagship",
    sail: "#9b1636",
    flag: "#ffcf5a",
    hull: "#8a4630",
    trail: "#ffcf5a",
    finish: { metal: 0.35, rough: 0.4, glow: "#7a4a00", glowPower: 0.4, sailGlow: 0.18 },
    lights: { color: "#ffd36b", at: ["lanterns", "mastheads"] },
    aura: { color: "#ffd36b", rate: 2.2 },
    sprite: 3,
    pennant: 6,
  },
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

const BALANCE_BATCH = 16;

export async function ownedSkins(viewer: Viewer, accountId: string): Promise<{ readonly all: string[]; readonly owned: string[] }> {
  const all = [...new Set(await viewer.view<string[]>("skins"))];
  const chunks: string[][] = [];
  for (let i = 0; i < all.length; i += BALANCE_BATCH) chunks.push(all.slice(i, i + BALANCE_BATCH));
  const balances = (await Promise.all(chunks.map((c) => viewer.view<string[]>("mt_batch_balance_of", { account_id: accountId, token_ids: c.map((n) => `skin:${n}`) })))).flat();
  const owned = all.filter((_, i) => /^\d+$/.test(balances[i] ?? "") && BigInt(balances[i] as string) > 0n);
  return { all, owned };
}
