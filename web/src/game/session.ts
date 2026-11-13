import { answerArgs, decodeBoard, encodeBoard, newBoard, revealArgs, rootHex, type Board } from "@/lib/board";
import type { Caller, CallResult, Viewer } from "@/lib/chain";
import type { GameView, PlayerView, ShipStatsView, ShotView } from "@/lib/contract";
import { isLegalFleet, ships } from "@/lib/fleet";
import { boardKey } from "@/lib/guest";
import { buildTree, fromHex, rootFromProof, sha256, toHex } from "@/lib/merkle";
import { bindMoves, loadModelKeys, modelOfRequest } from "@/lib/nauarch";
import type { NauarchEvidence } from "@/lib/proofs";
import type { KeyValue } from "@/lib/storage";
import { canTarget, friendlyError, marksFrom, nextStep, opponentOf, type Marks, type Step } from "./engine";
import { clearBattle, loadBattle, saveBattle } from "./resume";

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
  readonly opponentName: string | null;
  readonly invite: string | null;
  readonly deadlineAt: number | null;
  readonly announcedSunk: readonly (readonly number[])[];
  readonly canQueue: boolean;
  readonly queued: number | null;
}

const STATUS_ORDER: Readonly<Record<string, number>> = { Waiting: 0, Placing: 1, Playing: 2, Revealing: 3, Finished: 4 };

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const text = err instanceof Error ? err.message : String(err);
  return /timed out|fetch|network|rpc|http|econn|enotfound|socket|load failed|unavailable|429|50\d/i.test(text);
}

export function isStale(next: GameView, prev: GameView | null): boolean {
  if (!prev || prev.id !== next.id) return false;
  const rank = (g: GameView): number[] => [STATUS_ORDER[g.status] ?? 0, g.shots, g.pending_index === null ? 1 : 0, Number(g.revealed_a) + Number(g.revealed_b) + (g.root_a ? 1 : 0) + (g.root_b ? 1 : 0)];
  const a = rank(next);
  const b = rank(prev);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (a[i] as number) < (b[i] as number);
  return false;
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
  readonly quickAnswer?: (gameId: number, index: number, root: string | null) => Promise<QuickAnswer | null>;
  readonly shareAnswer?: (gameId: number, answer: QuickAnswer) => Promise<boolean>;
  readonly refuel?: () => Promise<boolean>;
  readonly height?: () => Promise<number>;
  readonly now?: () => number;
}

export interface QuickAnswer {
  readonly idx: number;
  readonly cell: number;
  readonly salt: string;
  readonly proof: readonly string[];
  readonly sunk?: readonly number[] | null;
}

function shipKey(ship: readonly number[]): string {
  return [...ship].sort((a, b) => a - b).join();
}

function unionShips(...lists: ReadonlyArray<readonly (readonly number[])[]>): (readonly number[])[] {
  const seen = new Map<string, readonly number[]>();
  for (const list of lists) for (const ship of list) seen.set(shipKey(ship), ship);
  return [...seen.values()];
}

export const BLOCK_MS = 587;
const QUICK_POLL_MS = 60;
const QUICK_TRIES = 40;

export function provenResult(a: QuickAnswer, index: number, root: string | null): "Hit" | "Miss" | null {
  if (!root || a.idx !== index || (a.cell !== 0 && a.cell !== 1)) return null;
  try {
    const computed = toHex(rootFromProof(index, a.cell, fromHex(a.salt), a.proof.map(fromHex)));
    if (computed !== root.replace(/^0x/, "").toLowerCase()) return null;
  } catch {
    return null;
  }
  return a.cell === 1 ? "Hit" : "Miss";
}
const SUNK_RETRIES = 2;

export function inviteKey(accountId: string, gameId: number): string {
  return `brinewar.invite.${accountId}.${gameId}`;
}

const EMPTY_MARKS: Marks = { mine: new Map(), enemy: new Map(), aiming: null };
const BACKOFF_BASE_MS = 1500;
const BACKOFF_MAX_MS = 8_000;
const EVIDENCE_TRIES = 8;
const OUT_OF_FUEL = /NotEnoughBalance|LackBalance|not enough balance/i;
const REFUEL_GAP_MS = 60_000;
const CLAIM_AFTER_MS = 150_000;
const CLAIM_MARGIN_MS = 2_500;
const DEFER_ANSWER_MS = 20_000;
const TIMED_STEPS: ReadonlySet<string> = new Set(["fire", "answer", "commit", "reveal", "thinking", "wait"]);
const FINAL = /invite link is not valid|board already committed|board already revealed|board not committed|index does not match|no shot to answer|game is not/;

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
  #keys: Map<string, string> = new Map();
  #nauarchShots = -1;
  #evidenceTries = 0;
  #evidenceFails = 0;
  #evidenceNext = 0;
  #lastRefuel = -Infinity;
  #stall: { key: string; since: number } | null = null;
  #settled: number | null = null;
  #hitsSeen = 0;
  #hitRetries = 0;
  #chainHistory = 0;
  readonly #quick = new Map<string, "Hit" | "Miss">();
  readonly #shared = new Set<string>();
  #queued: { readonly gameId: number; readonly index: number } | null = null;
  #local = 0;
  #quickSunk: (readonly number[])[] = [];
  #firing = false;
  #deferred: { key: string; gameId: number; index: number; since: number } | null = null;

  constructor(d: SessionDeps) {
    this.#d = d;
    this.#now = d.now ?? Date.now;
    this.#snap = {
      accountId: d.accountId, gameId: null, game: null, history: [], marks: EMPTY_MARKS, step: null,
      board: null, lines: [], busy: null, error: null, lastTx: null, offline: false, enemyFleet: null, enemyRevealTx: null, captain: null, rewards: null, opponentName: null, invite: null, deadlineAt: null, announcedSunk: [], canQueue: false, queued: null,
    };
    this.#resume();
  }

  #resume(): void {
    const saved = loadBattle(this.#d.store, this.#d.accountId);
    if (!saved) return;
    const { game, history } = saved;
    const board = this.#boardFor(game.id);
    this.#chainHistory = history.length;
    this.#snap = { ...this.#snap, gameId: game.id, game, history: [...history], marks: marksFrom(history, this.#d.accountId), board, step: nextStep(game, this.#d.accountId, board !== null) };
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
    if (!r.ok && OUT_OF_FUEL.test(r.error ?? "")) await this.#refuel();
    return r;
  }

  async #refuel(): Promise<void> {
    if (!this.#d.refuel || this.#now() - this.#lastRefuel < REFUEL_GAP_MS) return;
    this.#lastRefuel = this.#now();
    this.#set({ busy: "Taking on fuel" });
    const ok = await this.#d.refuel().catch(() => false);
    this.#set({ busy: null, error: ok ? null : this.#snap.error });
  }

  async #once(key: string, label: string, method: string, args: () => object): Promise<boolean> {
    if (this.#inflight.has(key) || this.#given.has(key)) return false;
    const a = this.#attempts.get(key);
    if (a && this.#now() < a.nextAt) return false;
    this.#inflight.add(key);
    try {
      let payload: object;
      try {
        payload = args();
      } catch (err) {
        this.#attempts.set(key, { n: (a?.n ?? 0) + 1, nextAt: this.#now() + BACKOFF_MAX_MS });
        this.#set({ error: `This browser could not build the ${method} move (${err instanceof Error ? err.message : String(err)}).` });
        return false;
      }
      const r = await this.#send(label, method, payload);
      if (r.ok) {
        this.#attempts.delete(key);
        this.#given.add(key);
        return true;
      }
      const n = (a?.n ?? 0) + 1;
      this.#attempts.set(key, { n, nextAt: this.#now() + Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** n) });
      if (FINAL.test(r.error ?? "")) this.#given.add(key);
      return false;
    } finally {
      this.#inflight.delete(key);
    }
  }

  async start(cells: readonly number[]): Promise<boolean> {
    return this.#open(cells, "Opening a battle", "new_game_vs_nauarch", () => ({}), null);
  }

  async startDuel(cells: readonly number[]): Promise<boolean> {
    const secret = toHex(crypto.getRandomValues(new Uint8Array(32)));
    let kept = true;
    const keep = (id: number): void => {
      try {
        this.#d.store.set(inviteKey(this.#d.accountId, id), secret);
      } catch {
        kept = false;
      }
    };
    const ok = await this.#open(cells, "Opening a duel", "new_game_vs_nauarch", () => ({ invite_hash: toHex(sha256(fromHex(secret))) }), null, keep);
    if (ok) this.#set(kept ? { invite: secret } : { invite: secret, error: "This browser could not keep the invite; copy the link now." });
    return ok;
  }

  async join(gameId: number, secret: string, cells: readonly number[]): Promise<boolean> {
    if (!/^[0-9a-f]{64}$/.test(secret)) {
      this.#set({ error: "This invite link is incomplete. Ask your friend to send it again." });
      return false;
    }
    return this.#open(cells, "Joining the duel", "commit_board", (board) => ({ game_id: gameId, root: rootHex(board), invite_secret: secret }), gameId);
  }

  async #open(cells: readonly number[], label: string, method: string, args: (board: Board) => object, known: number | null, opened?: (id: number) => void): Promise<boolean> {
    if (this.#snap.gameId !== null && this.#snap.step?.kind !== "done") return false;
    const board = newBoard(cells);
    try {
      this.#d.store.set(boardKey(this.#d.accountId, "next"), encodeBoard(board));
    } catch {
      this.#set({ error: "This browser cannot store your board (private mode or full storage), so you could not answer with proofs." });
      return false;
    }
    const before = await this.#captain().catch(() => null);
    await this.#refuel();
    const r = await this.#send(label, method, args(board));
    const id = known ?? (typeof r.value === "number" ? r.value : null);
    if (!r.ok || id === null) return false;
    opened?.(id);
    this.#adoptPending(id);
    if (before) this.#saveBaseline(id, before);
    this.#resetGame(id, board);
    await this.tick();
    return true;
  }

  #resetGame(id: number | null, board: Board | null): void {
    this.#nauarchShots = -1;
    this.#evidenceTries = 0;
    this.#settled = null;
    this.#chainHistory = 0;
    clearBattle(this.#d.store, this.#d.accountId);
    this.#quickSunk = [];
    this.#set({ gameId: id, game: null, history: [], marks: EMPTY_MARKS, step: null, board, lines: [], error: null, enemyFleet: null, enemyRevealTx: null, rewards: null, opponentName: null, invite: null, deadlineAt: null, announcedSunk: [], canQueue: false, queued: null });
  }

  async #captain(): Promise<Captain | null> {
    const player = await this.#d.viewer.view<PlayerView | null>("get_player", { account_id: this.#d.accountId });
    if (!player) return null;
    const ship = await this.#d.viewer.view<ShipStatsView | null>("get_ship", { token_id: player.flagship }).catch(() => null);
    const captain = { player, ship };
    this.#set({ captain });
    return captain;
  }

  async nauarchAim(gameId: number): Promise<number[]> {
    const cells = await this.#d.viewer.view<number[]>("nauarch_aim", { game_id: gameId });
    return Array.isArray(cells) ? cells.filter((c) => Number.isInteger(c) && c >= 0 && c < 100) : [];
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
    if (!after) {
      this.#settled = null;
      return;
    }
    const before = this.#loadBaseline(gameId, after);
    if (after && before) this.#set({ rewards: rewardsBetween(before, after) });
    this.#d.store.remove(this.#baselineKey(gameId));
  }

  #queueable(g: GameView | null, step: Step | null, history: readonly ShotView[]): boolean {
    if (!g || g.status !== "Playing" || step?.kind !== "wait" || this.#queued !== null) return false;
    const last = history[history.length - 1];
    return last !== undefined && last.by === this.#d.accountId && this.#quick.get(`${g.id}:${last.index}`) === "Hit";
  }

  #withQueued(gameId: number, history: readonly ShotView[]): ShotView[] {
    const q = this.#queued;
    if (!q || q.gameId !== gameId || history.some((s) => s.by === this.#d.accountId && s.index === q.index)) return [...history];
    return [...history, { n: history.length, by: this.#d.accountId, index: q.index, result: "Pending" as const, block: 0, source: "Player" as const }];
  }

  async fire(index: number): Promise<boolean> {
    const g = this.#snap.game;
    if (g && this.#snap.busy === null && canTarget(index, this.#snap.marks) && this.#queueable(g, this.#snap.step, this.#snap.history)) {
      this.#queued = { gameId: g.id, index };
      this.#local += 1;
      const history = this.#withQueued(g.id, this.#snap.history);
      this.#set({ history, marks: marksFrom(history, this.#d.accountId), canQueue: false, queued: index });
      return true;
    }
    if (!g || this.#snap.step?.kind !== "fire" || this.#snap.busy !== null || !canTarget(index, this.#snap.marks)) return false;
    const before = { history: this.#snap.history, marks: this.#snap.marks, step: this.#snap.step };
    const history = [...this.#snap.history, { n: g.shots, by: this.#d.accountId, index, result: "Pending" as const, block: 0, source: "Player" as const }];
    this.#local += 1;
    this.#set({ history, marks: marksFrom(history, this.#d.accountId), step: { kind: "wait" } });
    this.#firing = true;
    const d = this.#deferred;
    const board = this.#snap.board;
    const together = d !== null && board !== null && d.gameId === g.id && g.pending_index === d.index;
    void this.#peek(g.id, index, g.a === this.#d.accountId ? g.root_b : g.root_a);
    const r = await (together
      ? this.#send("Firing", "answer", { ...answerArgs(board, g.id, d.index), then_fire: index })
      : this.#send("Firing", "fire", { game_id: g.id, index })
    ).finally(() => {
      this.#firing = false;
    });
    if (r.ok) this.#chainHistory = Math.max(this.#chainHistory, g.shots + 1);
    if (r.ok && together) {
      this.#given.add(`answer:${g.id}:${d.index}`);
      this.#deferred = null;
    }
    if (!r.ok && this.#snap.history === history) this.#set(before);
    await this.tick();
    return r.ok;
  }

  #share(gameId: number, index: number, board: Board): void {
    const send = this.#d.shareAnswer;
    const key = `${gameId}:${index}`;
    if (!send || this.#shared.has(key)) return;
    this.#shared.add(key);
    const a = answerArgs(board, gameId, index);
    const hitOnMe = new Set(this.#snap.history.filter((s) => s.by !== this.#d.accountId && s.result === "Hit").map((s) => s.index).concat(index));
    const ship = a.cell === 1 ? ships(board.cells).find((s) => s.includes(index)) : undefined;
    const sunk = ship && ship.every((c) => hitOnMe.has(c)) ? ship : null;
    void send(gameId, { idx: index, cell: a.cell, salt: a.salt, proof: a.proof, sunk }).catch(() => this.#shared.delete(key));
  }

  #withQuick(gameId: number, history: readonly ShotView[]): ShotView[] {
    const me = this.#d.accountId;
    return history.map((s) => {
      const known = s.by === me && s.result === "Pending" ? this.#quick.get(`${gameId}:${s.index}`) : undefined;
      return known ? { ...s, result: known } : s;
    });
  }

  async #peek(gameId: number, index: number, root: string | null): Promise<void> {
    const ask = this.#d.quickAnswer;
    if (!ask) return;
    for (let i = 0; i < QUICK_TRIES; i++) {
      if (this.#snap.gameId !== gameId) return;
      const shot = this.#snap.history.find((s) => s.by === this.#d.accountId && s.index === index);
      if (shot && shot.result !== "Pending") return;
      const answer = await ask(gameId, index, root).catch(() => null);
      const result = answer ? provenResult(answer, index, root) : null;
      if (result) {
        this.#quick.set(`${gameId}:${index}`, result);
        this.#local += 1;
        if (this.#snap.gameId !== gameId) return;
        const history = this.#withQuick(gameId, this.#snap.history);
        const marks = marksFrom(history, this.#d.accountId);
        const ship = result === "Hit" && answer?.sunk && answer.sunk.includes(index) && answer.sunk.length <= 4 && answer.sunk.every((c) => marks.enemy.get(c) === "hit") ? answer.sunk : null;
        if (ship) this.#quickSunk = unionShips(this.#quickSunk, [ship]);
        this.#set({ history, marks, canQueue: this.#queueable(this.#snap.game, this.#snap.step, history), announcedSunk: ship ? unionShips(this.#snap.announcedSunk, [ship]) : this.#snap.announcedSunk });
        return;
      }
      await new Promise((r) => setTimeout(r, QUICK_POLL_MS));
    }
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
    } catch (err) {
      if (isNetworkError(err)) this.#set({ offline: true });
      else this.#set({ offline: false, error: `Something went wrong in this browser (${err instanceof Error ? err.message : String(err)}). Reload the page; your battle is kept on chain.` });
    }
  }

  async tick(): Promise<void> {
    if (await this.#tickOnce()) await this.#tickOnce();
  }

  async #tickOnce(): Promise<boolean> {
    const me = this.#d.accountId;
    const captain = this.#snap.captain === null ? this.#captain().catch(() => null) : null;
    await this.#lookup(me);
    await captain;
    return this.#battle(me);
  }

  async #lookup(me: string): Promise<void> {
    if (this.#snap.gameId !== null) return;
    const id = await this.#d.viewer.view<number | null>("active_game_of", { account_id: me });
    if (id !== null) this.#set({ gameId: id });
  }

  async #battle(me: string): Promise<boolean> {
    const id = this.#snap.gameId;
    if (id === null || this.#firing) return false;
    const local = this.#local;
    const battle = await this.#d.viewer.view<{ readonly game: GameView; readonly history: ShotView[] } | null>("get_battle", { game_id: id });
    const game = battle?.game ?? null;
    const history = battle?.history ?? [];
    if (local !== this.#local || this.#firing || (game && history.length !== game.shots)) return false;
    if (!game) {
      clearBattle(this.#d.store, me);
      this.#set({ gameId: null, game: null, step: null });
      return false;
    }
    if (isStale(game, this.#snap.game) || (this.#snap.game?.id === game.id && history.length < this.#chainHistory)) return false;
    this.#chainHistory = history.length;
    const board = this.#boardFor(id) ?? (game.status === "Placing" ? this.#adoptPending(id) : null);
    const planned = nextStep(game, me, board !== null);
    const settledStep: Step = planned.kind === "reveal" && this.#given.has(`reveal:${id}`) ? { kind: "done" } : planned;
    if (game.mode === "PvP" && settledStep.kind === "answer" && board) this.#share(game.id, settledStep.index, board);
    const { step, shown } = this.#defer(game, settledStep, board, history);
    const invite = step.kind === "invite" ? (this.#snap.invite ?? this.#d.store.get(inviteKey(me, id))) : null;
    if (game.status === "Finished") clearBattle(this.#d.store, me);
    else saveBattle(this.#d.store, me, game, history);
    const q = this.#queued;
    if (q && (q.gameId !== id || game.status !== "Playing")) this.#queued = null;
    if (this.#queued && step.kind === "fire") {
      const index = this.#queued.index;
      this.#queued = null;
      const ready = this.#withQuick(id, shown);
      this.#set({ game, history: ready, marks: marksFrom(ready, me), step, board, invite, canQueue: false, queued: null });
      await this.fire(index);
      return true;
    }
    const deadlineAt = await this.#deadline(game, step);
    if (local !== this.#local || this.#firing) return false;
    const seen = this.#withQueued(id, this.#withQuick(id, shown));
    this.#set({ game, history: seen, marks: marksFrom(seen, me), step, board, invite, canQueue: this.#queueable(game, step, seen), queued: this.#queued?.index ?? null, deadlineAt });
    const acted = await this.#act(game, step, board);
    await this.#claimIfLate(game, step);
    if (game.mode === "VsNauarch") await this.#refreshEvidence(game, history).catch(() => undefined);
    else await this.#opponent(game).catch(() => undefined);
    const settled = game.mode === "VsNauarch" ? game.revealed_a && game.revealed_b : game.status === "Finished";
    if (step.kind === "done" && settled) await this.#settle(game.id);
    return acted;
  }

  #defer(game: GameView, step: Step, board: Board | null, history: ShotView[]): { step: Step; shown: ShotView[] } {
    if (step.kind !== "answer" || !board || board.cells[step.index] !== 0 || game.status !== "Playing") {
      this.#deferred = null;
      return { step, shown: history };
    }
    const key = `${game.id}:${step.index}:${game.shots}`;
    if (this.#deferred?.key !== key) this.#deferred = { key, gameId: game.id, index: step.index, since: this.#now() };
    if (this.#now() - this.#deferred.since >= DEFER_ANSWER_MS) return { step, shown: history };
    const last = history.length - 1;
    const theirs = (s: ShotView): boolean => s.by !== this.#d.accountId && s.index === step.index;
    const shown = history.map((s, i) => (i === last && s.result === "Pending" && theirs(s) ? { ...s, result: "Miss" as const } : s));
    return { step: { kind: "fire" }, shown };
  }

  async #deadline(g: GameView, step: Step): Promise<number | null> {
    const timed = TIMED_STEPS.has(step.kind) && g.status !== "Waiting" && g.status !== "Finished";
    if (!timed || !this.#d.height) return null;
    const known = this.#snap.deadlineAt;
    if (known !== null && this.#snap.game?.deadline_block === g.deadline_block) return known;
    const h = await this.#d.height().catch(() => null);
    return h === null ? null : this.#now() + Math.max(0, g.deadline_block - h) * BLOCK_MS;
  }

  async #opponent(g: GameView): Promise<void> {
    const other = opponentOf(g, this.#d.accountId);
    if (other === this.#d.accountId || this.#snap.opponentName !== null) return;
    const p = await this.#d.viewer.view<PlayerView | null>("get_player", { account_id: other });
    if (p) this.#set({ opponentName: p.display_name });
  }

  async #claimIfLate(g: GameView, step: Step): Promise<void> {
    const waitingOnThem = step.kind === "thinking" || step.kind === "wait" || step.kind === "invite";
    const key = `${g.id}:${g.status}:${g.shots}:${g.pending_index}:${g.root_a}:${g.root_b}:${g.revealed_a}:${g.revealed_b}`;
    if (!waitingOnThem || g.status === "Finished") {
      this.#stall = null;
      return;
    }
    if (this.#stall?.key !== key) {
      this.#stall = { key, since: this.#now() };
      return;
    }
    const due = this.#snap.deadlineAt;
    if (due !== null ? this.#now() < due + CLAIM_MARGIN_MS : this.#now() - this.#stall.since < CLAIM_AFTER_MS) return;
    await this.#once(`claim:${key}`, "Claiming the late move", "claim_timeout", () => ({ game_id: g.id }));
  }

  async #act(g: GameView, step: Step, board: Board | null): Promise<boolean> {
    if (!board) return false;
    if (step.kind === "commit") return this.#once(`commit:${g.id}`, "Sealing your board", "commit_board", () => ({ game_id: g.id, root: rootHex(board) }));
    if (step.kind === "answer") return this.#once(`answer:${g.id}:${step.index}`, "Answering with proof", "answer", () => answerArgs(board, g.id, step.index));
    if (step.kind === "reveal") return this.#once(`reveal:${g.id}`, "Revealing your fleet", "reveal", () => revealArgs(board, g.id));
    return false;
  }

  async #refreshEvidence(g: GameView, history: readonly ShotView[]): Promise<void> {
    const nauarchShots = history.filter((s) => s.by === g.b);
    const wantFarewell = g.farewell_said && !this.#snap.lines.some((l) => l.kind === "Farewell");
    const wantFleet = g.revealed_b && this.#snap.enemyFleet === null;
    const newShots = nauarchShots.length !== this.#nauarchShots;
    const myHits = history.filter((s) => s.by !== g.b && s.result === "Hit").length;
    const newHit = myHits !== this.#hitsSeen || this.#hitRetries > 0;
    if (!newShots && !newHit && !((wantFarewell || wantFleet) && this.#evidenceTries < EVIDENCE_TRIES)) return;
    if (this.#now() < this.#evidenceNext) return;
    if (myHits !== this.#hitsSeen) {
      this.#hitsSeen = myHits;
      this.#hitRetries = SUNK_RETRIES;
    } else if (this.#hitRetries > 0) this.#hitRetries -= 1;
    if (!newShots) this.#evidenceTries += 1;
    const ev = await this.#d.evidence(g.id).catch(() => null);
    if (!ev) {
      this.#evidenceFails += 1;
      this.#evidenceNext = this.#now() + Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.#evidenceFails);
      return;
    }
    this.#evidenceFails = 0;
    this.#nauarchShots = nauarchShots.length;
    const hit = new Set(history.filter((s) => s.by !== g.b && s.result === "Hit").map((s) => s.index));
    const announced = unionShips(ev.sunk.filter((ship) => ship.every((c) => hit.has(c))), this.#quickSunk);
    if (announced.length !== this.#snap.announcedSunk.length) this.#set({ announcedSunk: announced });
    if (wantFleet && ev.reveal && g.root_b) {
      const fleet = verifiedFleet(ev.reveal.cells, ev.reveal.salts, g.root_b);
      if (fleet) this.#set({ enemyFleet: fleet, enemyRevealTx: ev.reveal.tx });
    }
    if (ev.moves.some((m) => { const n = modelOfRequest(m.request); return n !== null && !this.#keys.has(n); })) this.#keys = await loadModelKeys(this.#d.viewer, ev.moves, this.#keys);
    const lines = bindMoves(ev.moves, nauarchShots, g.id, this.#keys).flatMap((b): NauarchLine[] =>
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
