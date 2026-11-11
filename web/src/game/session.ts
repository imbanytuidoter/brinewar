import { answerArgs, decodeBoard, encodeBoard, newBoard, revealArgs, rootHex, type Board } from "@/lib/board";
import type { Caller, CallResult, Viewer } from "@/lib/chain";
import type { GameView, ModelView, PlayerView, ShipStatsView, ShotView } from "@/lib/contract";
import { isLegalFleet, ships } from "@/lib/fleet";
import { boardKey } from "@/lib/guest";
import { buildTree, fromHex, toHex } from "@/lib/merkle";
import { bindMoves } from "@/lib/nauarch";
import type { NauarchEvidence } from "@/lib/proofs";
import type { KeyValue } from "@/lib/storage";
import { canTarget, friendlyError, marksFrom, nextStep, type Marks, type Step } from "./engine";

export interface NauarchLine {
  readonly text: string;
  readonly kind: string;
  readonly signed: boolean;
  readonly tx: string | null;
  readonly at: number;
}

export interface Snapshot {
  readonly accountId: string;
  readonly gameId: number | null;
  readonly game: GameView | null;
  readonly history: readonly ShotView[];
  readonly marks: Marks;
  readonly step: Step | null;
  readonly board: Board | null;
  readonly lines: readonly NauarchLine[];
  readonly busy: string | null;
  readonly error: string | null;
  readonly lastTx: string | null;
  readonly offline: boolean;
  readonly enemyFleet: readonly (readonly number[])[] | null;
  readonly enemyRevealTx: string | null;
  readonly captain: Captain | null;
  readonly rewards: Rewards | null;
}

export interface Captain {
  readonly player: PlayerView;
  readonly ship: ShipStatsView | null;
}

export interface Rewards {
  readonly gold: bigint;
  readonly xp: number;
  readonly rankFrom: string | null;
  readonly rankTo: string | null;
}

export function rewardsBetween(before: Captain, after: Captain): Rewards {
  const from = before.ship?.rank ?? null;
  const to = after.ship?.rank ?? null;
  return {
    gold: BigInt(after.player.gold) - BigInt(before.player.gold),
    xp: (after.ship?.xp ?? 0) - (before.ship?.xp ?? 0),
    rankFrom: from !== to ? from : null,
    rankTo: from !== to ? to : null,
  };
}

export interface SessionDeps {
  readonly accountId: string;
  readonly viewer: Viewer;
  readonly caller: Caller;
  readonly store: KeyValue;
  readonly evidence: (gameId: number) => Promise<NauarchEvidence | null>;
  readonly now?: () => number;
}

const EMPTY_MARKS: Marks = { mine: new Map(), enemy: new Map(), aiming: null };
const BACKOFF_BASE_MS = 1500;
const BACKOFF_MAX_MS = 60_000;
const REVEAL_TRIES = 6;
const EVIDENCE_TRIES = 8;
const FINAL = /board already committed|board already revealed|board not committed|index does not match|no shot to answer|game is not/;

interface Attempt {
  n: number;
  nextAt: number;
}

export class GameSession {
  readonly #d: SessionDeps;
  readonly #now: () => number;
  #snap: Snapshot;
  #listeners = new Set<(s: Snapshot) => void>();
  #inflight = new Set<string>();
  #attempts = new Map<string, Attempt>();
  #given = new Set<string>();
  #boards = new Map<number, Board>();
  #model: ModelView | null | undefined;
  #nauarchShots = -1;
  #evidenceTries = 0;
  #settled: number | null = null;

  constructor(d: SessionDeps) {
    this.#d = d;
    this.#now = d.now ?? Date.now;
    this.#snap = {
      accountId: d.accountId, gameId: null, game: null, history: [], marks: EMPTY_MARKS, step: null,
      board: null, lines: [], busy: null, error: null, lastTx: null, offline: false, enemyFleet: null, enemyRevealTx: null, captain: null, rewards: null,
    };
  }

  get snapshot(): Snapshot {
    return this.#snap;
  }

  subscribe(fn: (s: Snapshot) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #set(patch: Partial<Snapshot>): void {
    this.#snap = { ...this.#snap, ...patch };
    for (const fn of this.#listeners) fn(this.#snap);
  }

  #boardFor(gameId: number): Board | null {
    const cached = this.#boards.get(gameId);
    if (cached) return cached;
    const raw = this.#d.store.get(boardKey(this.#d.accountId, gameId));
    const board = raw ? decodeBoard(raw) : null;
    if (board) this.#boards.set(gameId, board);
    return board;
  }

  #adoptPending(gameId: number): Board | null {
    const raw = this.#d.store.get(boardKey(this.#d.accountId, "next"));
    const board = raw ? decodeBoard(raw) : null;
    if (!board) return null;
    this.#boards.set(gameId, board);
    try {
      this.#d.store.set(boardKey(this.#d.accountId, gameId), encodeBoard(board));
      this.#d.store.remove(boardKey(this.#d.accountId, "next"));
    } catch {
      this.#set({ error: "This browser could not save your board. Keep this tab open until the battle ends." });
    }
    return board;
  }

  async #send(label: string, method: string, args: object): Promise<CallResult> {
    this.#set({ busy: label });
    const r = await this.#d.caller.call(method, args);
    this.#set({ busy: null, error: r.ok ? null : friendlyError(r.error), lastTx: r.txHash ?? this.#snap.lastTx });
    return r;
  }

  async #once(key: string, label: string, method: string, args: () => object): Promise<void> {
    if (this.#inflight.has(key) || this.#given.has(key)) return;
    const a = this.#attempts.get(key);
    if (a && this.#now() < a.nextAt) return;
    this.#inflight.add(key);
    try {
      const r = await this.#send(label, method, args());
      if (r.ok) {
        this.#attempts.delete(key);
        return;
      }
      const n = (a?.n ?? 0) + 1;
      this.#attempts.set(key, { n, nextAt: this.#now() + Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** n) });
      if (FINAL.test(r.error ?? "") || (key.startsWith("reveal:") && n >= REVEAL_TRIES)) this.#given.add(key);
    } finally {
      this.#inflight.delete(key);
    }
  }

  async start(cells: readonly number[]): Promise<boolean> {
    if (this.#snap.gameId !== null && this.#snap.step?.kind !== "done") return false;
    const board = newBoard(cells);
    try {
      this.#d.store.set(boardKey(this.#d.accountId, "next"), encodeBoard(board));
    } catch {
      this.#set({ error: "This browser cannot store your board (private mode or full storage), so you could not answer with proofs." });
      return false;
    }
    const before = await this.#captain().catch(() => null);
    const created = await this.#send("Opening a battle", "new_game_vs_nauarch", {});
    const id = typeof created.value === "number" ? created.value : null;
    if (!created.ok || id === null) return false;
    this.#adoptPending(id);
    if (before) this.#saveBaseline(id, before);
    this.#resetGame(id, board);
    await this.#once(`commit:${id}`, "Sealing your board", "commit_board", () => ({ game_id: id, root: rootHex(board) }));
    await this.tick();
    return true;
  }

  #resetGame(id: number | null, board: Board | null): void {
    this.#nauarchShots = -1;
    this.#evidenceTries = 0;
    this.#settled = null;
    this.#set({ gameId: id, game: null, history: [], marks: EMPTY_MARKS, step: null, board, lines: [], error: null, enemyFleet: null, enemyRevealTx: null, rewards: null });
  }

  async #captain(): Promise<Captain | null> {
    const player = await this.#d.viewer.view<PlayerView | null>("get_player", { account_id: this.#d.accountId });
    if (!player) return null;
    const ship = await this.#d.viewer.view<ShipStatsView | null>("get_ship", { token_id: player.flagship }).catch(() => null);
    const captain = { player, ship };
    this.#set({ captain });
    return captain;
  }

  async rename(nickname: string): Promise<boolean> {
    const r = await this.#send("Renaming your captain", "set_nickname", { nickname });
    if (r.ok) await this.#captain().catch(() => null);
    return r.ok;
  }

  #baselineKey(gameId: number): string {
    return `brinewar.baseline.${this.#d.accountId}.${gameId}`;
  }

  #saveBaseline(gameId: number, c: Captain): void {
    try {
      this.#d.store.set(this.#baselineKey(gameId), JSON.stringify({ gold: c.player.gold, xp: c.ship?.xp ?? 0, rank: c.ship?.rank ?? null }));
    } catch {
      return;
    }
  }

  #loadBaseline(gameId: number, now: Captain): Captain | null {
    try {
      const v = JSON.parse(this.#d.store.get(this.#baselineKey(gameId)) ?? "null") as { gold?: unknown; xp?: unknown; rank?: unknown } | null;
      if (!v || typeof v.gold !== "string" || !/^\d+$/.test(v.gold) || typeof v.xp !== "number") return null;
      const ship = now.ship ? { ...now.ship, xp: v.xp, rank: typeof v.rank === "string" ? v.rank : now.ship.rank } : null;
      return { player: { ...now.player, gold: v.gold }, ship };
    } catch {
      return null;
    }
  }

  async #settle(gameId: number): Promise<void> {
    if (this.#settled === gameId) return;
    this.#settled = gameId;
    const after = await this.#captain().catch(() => null);
    const before = after ? this.#loadBaseline(gameId, after) : null;
    if (after && before) this.#set({ rewards: rewardsBetween(before, after) });
    this.#d.store.remove(this.#baselineKey(gameId));
  }

  async fire(index: number): Promise<boolean> {
    const g = this.#snap.game;
    if (!g || this.#snap.step?.kind !== "fire" || this.#snap.busy !== null || !canTarget(index, this.#snap.marks)) return false;
    const history = [...this.#snap.history, { n: g.shots, by: this.#d.accountId, index, result: "Pending" as const, block: 0, source: "Player" as const }];
    this.#set({ history, marks: marksFrom(history, this.#d.accountId), step: { kind: "wait" } });
    const r = await this.#send("Firing", "fire", { game_id: g.id, index });
    await this.tick();
    return r.ok;
  }

  async resign(): Promise<void> {
    const id = this.#snap.gameId;
    if (id === null) return;
    await this.#send("Striking colours", "resign", { game_id: id });
    await this.tick();
  }

  leave(): void {
    if (this.#snap.step?.kind !== "done") return;
    this.#resetGame(null, null);
  }

  async poll(): Promise<void> {
    try {
      await this.tick();
      if (this.#snap.offline) this.#set({ offline: false });
    } catch {
      this.#set({ offline: true });
    }
  }

  async tick(): Promise<void> {
    const me = this.#d.accountId;
    if (this.#snap.captain === null) await this.#captain().catch(() => null);
    let id = this.#snap.gameId;
    if (id === null) {
      id = await this.#d.viewer.view<number | null>("active_game_of", { account_id: me });
      if (id === null) return;
      this.#set({ gameId: id });
    }
    const [game, history] = await Promise.all([
      this.#d.viewer.view<GameView | null>("get_game", { game_id: id }),
      this.#d.viewer.view<ShotView[]>("get_history", { game_id: id }),
    ]);
    if (!game) {
      this.#set({ gameId: null, game: null, step: null });
      return;
    }
    const board = this.#boardFor(id) ?? (game.status === "Placing" ? this.#adoptPending(id) : null);
    const planned = nextStep(game, me, board !== null);
    const step: Step = planned.kind === "reveal" && this.#given.has(`reveal:${id}`) ? { kind: "done" } : planned;
    this.#set({ game, history, marks: marksFrom(history, me), step, board });
    await this.#act(game, step, board);
    await this.#refreshEvidence(game, history).catch(() => undefined);
    if (step.kind === "done" && game.revealed_a && game.revealed_b) await this.#settle(game.id);
  }

  async #act(g: GameView, step: Step, board: Board | null): Promise<void> {
    if (!board) return;
    if (step.kind === "commit") {
      await this.#once(`commit:${g.id}`, "Sealing your board", "commit_board", () => ({ game_id: g.id, root: rootHex(board) }));
    } else if (step.kind === "answer") {
      await this.#once(`answer:${g.id}:${step.index}`, "Answering with proof", "answer", () => answerArgs(board, g.id, step.index));
    } else if (step.kind === "reveal") {
      await this.#once(`reveal:${g.id}`, "Revealing your fleet", "reveal", () => revealArgs(board, g.id));
    }
  }

  async #refreshEvidence(g: GameView, history: readonly ShotView[]): Promise<void> {
    const nauarchShots = history.filter((s) => s.by === g.b);
    const wantFarewell = g.farewell_said && !this.#snap.lines.some((l) => l.kind === "Farewell");
    const wantFleet = g.revealed_b && this.#snap.enemyFleet === null;
    const newShots = nauarchShots.length !== this.#nauarchShots;
    if (!newShots && !((wantFarewell || wantFleet) && this.#evidenceTries < EVIDENCE_TRIES)) return;
    if (!newShots) this.#evidenceTries += 1;
    const ev = await this.#d.evidence(g.id);
    if (!ev) return;
    this.#nauarchShots = nauarchShots.length;
    if (wantFleet && ev.reveal && g.root_b) {
      const fleet = verifiedFleet(ev.reveal.cells, ev.reveal.salts, g.root_b);
      if (fleet) this.#set({ enemyFleet: fleet, enemyRevealTx: ev.reveal.tx });
    }
    if (this.#model === undefined) this.#model = await this.#d.viewer.view<ModelView | null>("model").catch(() => undefined);
    const lines = bindMoves(ev.moves, nauarchShots, g.id, this.#model ?? null).flatMap((b): NauarchLine[] =>
      b.line ? [{ text: b.line, kind: b.move.kind, signed: b.check === "ok", tx: b.move.tx, at: b.move.at }] : [],
    );
    this.#set({ lines });
  }
}

export function verifiedFleet(cells: string, salts: readonly string[], root: string): number[][] | null {
  try {
    const bits = Array.from(cells, (c) => (c === "1" ? 1 : c === "0" ? 0 : -1));
    if (bits.length !== 100 || salts.length !== 100 || !isLegalFleet(bits)) return null;
    const tree = buildTree(bits, salts.map(fromHex));
    return toHex(tree.root) === root.replace(/^0x/, "").toLowerCase() ? ships(bits) : null;
  } catch {
    return null;
  }
}
