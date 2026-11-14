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

function entryOf(ship: ShipRow, player: PlayerRow): CaptainEntry {
  return { account: ship.captain, name: player.display_name, rank: ship.rank, class: ship.class, xp: ship.xp, wins: player.wins, losses: player.losses, sunk: ship.sunk, gold: player.gold, seed: SEED_NAME.test(player.display_name) };
}

interface RankedBoard extends Leaderboard {
  readonly all: readonly CaptainEntry[];
  readonly topSeeds: number;
}

export async function freshCaptain(viewer: Viewer, account: string): Promise<CaptainEntry | null> {
  const player = await viewer.view<(PlayerRow & { readonly flagship: string }) | null>("get_player", { account_id: account });
  if (!player?.flagship) return null;
  const ship = await viewer.view<ShipRow | null>("get_ship", { token_id: player.flagship });
  return ship && ship.captain === account ? entryOf(ship, player) : null;
}

export async function buildLeaderboard(viewer: Viewer, topSeeds: number, batch: number): Promise<RankedBoard> {
  const { players } = await patient<{ players: number }>(viewer, "config", {});
  const ids = Array.from({ length: players }, (_, i) => i + 1);
  const ships = (await inBatches(ids, batch, (id) => patient<ShipRow | null>(viewer, "get_ship", { token_id: `ship:${id}` }))).filter((s): s is ShipRow => s !== null);
  const rows = await inBatches(ships, batch, async (ship) => ({ ship, player: await patient<PlayerRow | null>(viewer, "get_player", { account_id: ship.captain }) }));
  const entries = rows.flatMap(({ ship, player }): CaptainEntry[] => (player ? [entryOf(ship, player)] : []));
  return { ...rank(entries, topSeeds), all: entries, topSeeds };
}

function rank(entries: readonly CaptainEntry[], topSeeds: number): Leaderboard {
  const nauarch = entries.reduce((acc, e) => ({ wins: acc.wins + e.losses, losses: acc.losses + e.wins, battles: acc.battles + e.wins + e.losses }), { wins: 0, losses: 0, battles: 0 });
  const played = entries.filter((e) => e.wins + e.losses > 0 || e.xp > 0);
  const ranked = [...played].sort((a, b) => b.xp - a.xp || b.wins - a.wins || b.sunk - a.sunk);
  const seeds = new Set(ranked.filter((e) => e.seed).slice(0, topSeeds));
  const captains = ranked.filter((e) => !e.seed || seeds.has(e));
  return { captains, nauarch, total: entries.length };
}

interface GameRow {
  readonly a: string;
  readonly b: string;
  readonly status: string;
}

const WATCH_BACK = 100;
const FORGET_AFTER = 500;

export class LiveLeaderboard {
  #all = new Map<string, CaptainEntry>();
  #open = new Set<number>();
  #seen = 0;
  #ready: Promise<void> | null = null;
  #ticking = false;

  constructor(
    private readonly viewer: Viewer,
    private readonly topSeeds: number,
    private readonly batch: number,
  ) {}

  async #load(): Promise<void> {
    const { games } = await patient<{ games: number }>(this.viewer, "config", {});
    const board = await buildLeaderboard(this.viewer, this.topSeeds, this.batch);
    const recent = Array.from({ length: Math.min(games, WATCH_BACK) }, (_, i) => games - 1 - i);
    const rows = await inBatches(recent, this.batch, async (id) => ({ id, game: await patient<GameRow | null>(this.viewer, "get_game", { game_id: id }) }));
    this.#all = new Map(board.all.map((e) => [e.account, e]));
    this.#open = new Set(rows.filter((r) => r.game !== null && r.game.status !== "Finished").map((r) => r.id));
    this.#seen = games;
  }

  #loaded(): Promise<void> {
    this.#ready ??= this.#load().catch((err: unknown) => {
      this.#ready = null;
      throw err;
    });
    return this.#ready;
  }

  async get(): Promise<Leaderboard> {
    await this.#loaded();
    return rank([...this.#all.values()], this.topSeeds);
  }

  async resync(): Promise<void> {
    const board = await buildLeaderboard(this.viewer, this.topSeeds, this.batch);
    this.#all = new Map(board.all.map((e) => [e.account, e]));
  }

  async tick(): Promise<readonly string[]> {
    if (this.#ticking || this.#ready === null) return [];
    this.#ticking = true;
    try {
      await this.#ready;
      const { games } = await this.viewer.view<{ games: number }>("config", {});
      for (let id = this.#seen; id < games; id++) this.#open.add(id);
      this.#seen = Math.max(this.#seen, games);
      for (const id of this.#open) if (id < games - FORGET_AFTER) this.#open.delete(id);
      const finished = new Set<string>();
      const rows = await inBatches([...this.#open], this.batch, async (id) => ({ id, game: await this.viewer.view<GameRow | null>("get_game", { game_id: id }) }));
      for (const { id, game } of rows) {
        if (game === null || game.status !== "Finished") continue;
        this.#open.delete(id);
        finished.add(game.a);
        finished.add(game.b);
      }
      const fresh = await inBatches([...finished], this.batch, (account) => freshCaptain(this.viewer, account));
      for (const entry of fresh) if (entry) this.#all.set(entry.account, entry);
      return fresh.filter((e): e is CaptainEntry => e !== null).map((e) => e.account);
    } finally {
      this.#ticking = false;
    }
  }

  patch(entry: CaptainEntry): void {
    this.#all.set(entry.account, entry);
  }
}
