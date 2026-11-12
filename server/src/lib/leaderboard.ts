import type { Viewer } from "./near.js";

interface ShipRow {
  readonly captain: string;
  readonly rank: string;
  readonly class: string;
  readonly xp: number;
  readonly sunk: number;
}

interface PlayerRow {
  readonly display_name: string;
  readonly gold: string;
  readonly games_vs_nauarch: number;
  readonly wins: number;
  readonly losses: number;
}

export interface CaptainEntry {
  readonly account: string;
  readonly name: string;
  readonly rank: string;
  readonly class: string;
  readonly xp: number;
  readonly wins: number;
  readonly losses: number;
  readonly sunk: number;
  readonly gold: string;
  readonly seed: boolean;
}

export interface Leaderboard {
  readonly captains: readonly CaptainEntry[];
  readonly nauarch: { readonly wins: number; readonly losses: number; readonly battles: number };
  readonly total: number;
}

const SEED_NAME = /^Seed_\d+$/;
const ATTEMPTS = 4;
const RETRY_MS = 1200;

async function patient<T>(viewer: Viewer, method: string, args: object): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await viewer.view<T>(method, args);
    } catch (err) {
      if (attempt >= ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, RETRY_MS * attempt));
    }
  }
}

async function inBatches<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

export async function buildLeaderboard(viewer: Viewer, topSeeds: number, batch: number): Promise<Leaderboard> {
  const { players } = await patient<{ players: number }>(viewer, "config", {});
  const ids = Array.from({ length: players }, (_, i) => i + 1);
  const ships = (await inBatches(ids, batch, (id) => patient<ShipRow | null>(viewer, "get_ship", { token_id: `ship:${id}` }))).filter((s): s is ShipRow => s !== null);
  const rows = await inBatches(ships, batch, async (ship) => ({ ship, player: await patient<PlayerRow | null>(viewer, "get_player", { account_id: ship.captain }) }));
  const entries = rows.flatMap(({ ship, player }): CaptainEntry[] =>
    player ? [{ account: ship.captain, name: player.display_name, rank: ship.rank, class: ship.class, xp: ship.xp, wins: player.wins, losses: player.losses, sunk: ship.sunk, gold: player.gold, seed: SEED_NAME.test(player.display_name) }] : [],
  );
  const nauarch = entries.reduce((acc, e) => ({ wins: acc.wins + e.losses, losses: acc.losses + e.wins, battles: acc.battles + e.wins + e.losses }), { wins: 0, losses: 0, battles: 0 });
  const played = entries.filter((e) => e.wins + e.losses > 0 || e.xp > 0);
  const ranked = [...played].sort((a, b) => b.xp - a.xp || b.wins - a.wins || b.sunk - a.sunk);
  const seeds = new Set(ranked.filter((e) => e.seed).slice(0, topSeeds));
  const captains = ranked.filter((e) => !e.seed || seeds.has(e));
  return { captains, nauarch, total: entries.length };
}

export class Snapshots<T> {
  #value: T | undefined;
  #at = -Infinity;
  #running: Promise<T> | null = null;

  constructor(
    private readonly load: () => Promise<T>,
    private readonly maxAgeMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  #refresh(): Promise<T> {
    if (!this.#running) {
      this.#running = this.load()
        .then((v) => {
          this.#value = v;
          this.#at = this.now();
          return v;
        })
        .finally(() => {
          this.#running = null;
        });
    }
    return this.#running;
  }

  async get(): Promise<T> {
    if (this.#value === undefined) return this.#refresh();
    if (this.now() - this.#at > this.maxAgeMs) this.#refresh().catch(() => undefined);
    return this.#value;
  }
}
