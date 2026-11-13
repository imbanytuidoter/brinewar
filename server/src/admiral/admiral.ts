import type { Logger } from "pino";
import { answerArgs, newBoard, revealArgs, rootHex, type Board, freshSalts } from "../lib/board.js";
import type { ConfigView, GameView, MoveKind } from "../lib/contract.js";
import { GAME_GAS_TGAS, PAGE } from "../lib/contract.js";
import type { Store } from "../lib/db.js";
import { cryptoRng, placeFleet, ships, type Rng } from "../lib/fleet.js";
import { fromHex, sha256, toHex } from "../lib/merkle.js";
import type { Caller, Viewer } from "../lib/near.js";
import { withTimeout } from "../lib/near.js";
import type { ModelProviderPort } from "../lib/nearai.js";
import { ModelProviderError } from "../lib/nearai.js";
import type { Vault } from "../lib/vault.js";
import { decide, type Action } from "./decide.js";

export interface AdmiralOptions {
  readonly viewer: Viewer;
  readonly caller: Caller;
  readonly store: Store;
  readonly vault: Vault;
  readonly model: ModelProviderPort | null;
  readonly log: Logger;
  readonly height: () => Promise<number>;
  readonly modelTimeoutMs: number;
  readonly shotBudgetMs?: number;
  readonly maxFarewellTries: number;
  readonly cooldownMs: number;
  readonly rng?: Rng;
}

const MAX_BACKOFF_MS = 60_000;

export function errorCode(message: string): string {
  if (/timed out/i.test(message)) return "timeout";
  if (/signature does not match|signed text/i.test(message)) return "signature_mismatch";
  if (/panicked|ExecutionError|rejected/i.test(message)) return "rejected";
  if (/HTTP (\d{3})/.test(message)) return `model_http_${/HTTP (\d{3})/.exec(message)?.[1]}`;
  if (/not available after/i.test(message)) return "signature_unavailable";
  return "error";
}

function hexSha(s: string): string {
  return toHex(sha256(new TextEncoder().encode(s)));
}

interface SealedBoard {
  cells: number[];
  salts: string[];
}

interface SignedMove {
  readonly request: string;
  readonly response: string;
  readonly chatId: string;
  readonly signature: string;
  readonly text: string;
}

function isTimeout(error: string | undefined): boolean {
  return /timed out/i.test(error ?? "");
}

function stateOf(g: GameView): string {
  return `${g.status}:${g.shots}:${g.pending_index}:${g.turn}:${g.root_b !== null}:${g.revealed_b}:${g.farewell_said}`;
}

export class Admiral {
  readonly #o: AdmiralOptions;
  readonly #busy = new Set<number>();
  readonly #boards = new Map<number, Board>();
  readonly #failures = new Map<number, number>();
  readonly #acted = new Map<number, Set<string>>();
  #cursor = 0;

  constructor(o: AdmiralOptions) {
    this.#o = o;
  }

  get busyGames(): number {
    return this.#busy.size;
  }

  async tick(): Promise<boolean> {
    const start = this.#cursor;
    const [config, height, firstPage] = await Promise.all([
      this.#o.viewer.view<ConfigView>("config"),
      this.#o.height(),
      this.#o.viewer.view<GameView[]>("games_since", { from_id: start, limit: PAGE }),
    ]);
    let lowestOpen: number | null = null;
    let watching = false;
    for (let from = start; from < config.games; from += PAGE) {
      const games = from === start ? firstPage : await this.#o.viewer.view<GameView[]>("games_since", { from_id: from, limit: PAGE });
      for (const g of games) {
        const action = this.#decide(g, height);
        if (action.kind === "done") this.#forget(g);
        if (action.kind !== "done" && lowestOpen === null) lowestOpen = g.id;
        if (g.mode === "VsNauarch" && g.status === "Playing") watching = true;
        if (action.kind === "done" || action.kind === "wait" || this.#busy.has(g.id)) continue;
        const state = stateOf(g);
        if (this.#acted.get(g.id)?.has(state)) continue;
        this.#busy.add(g.id);
        void this.#run(g, action).finally(() => {
          const streak = this.#failures.get(g.id) ?? 0;
          if (streak === 0) {
            const after = action.kind === "answer" ? [stateOf({ ...g, pending_index: null, turn: this.#o.caller.accountId })] : [];
            this.#acted.set(g.id, new Set([state, ...after]));
            this.#busy.delete(g.id);
            return;
          }
          const delay = Math.min(this.#o.cooldownMs * 2 ** streak, MAX_BACKOFF_MS);
          setTimeout(() => this.#busy.delete(g.id), delay);
        });
      }
    }
    this.#cursor = lowestOpen ?? config.games;
    return watching || this.#busy.size > 0;
  }

  #forget(g: GameView): void {
    const board = this.#boards.get(g.id);
    if (board && g.revealed_b && !this.#o.store.reveal(g.id)) {
      const args = revealArgs(board, g.id);
      this.#o.store.saveReveal(g.id, args.cells, args.salts, null);
    }
    this.#boards.delete(g.id);
    this.#failures.delete(g.id);
    this.#acted.delete(g.id);
  }

  #decide(g: GameView, height: number): Action {
    return decide(g, {
      admiral: this.#o.caller.accountId,
      height,
      hasBoard: this.#o.store.board(g.id) !== undefined,
      farewellEnabled: this.#o.model !== null,
      farewellGaveUp: this.#o.store.failures(g.id, "farewell") >= this.#o.maxFarewellTries,
    });
  }

  async #run(g: GameView, action: Action): Promise<void> {
    try {
      switch (action.kind) {
        case "commit":
          return await this.#commit(g);
        case "answer":
          return await this.#answerAndMove(g, action.index);
        case "move":
          return await this.#move(g);
        case "reveal":
          return await this.#reveal(g);
        case "farewell":
          return await this.#farewell(g);
        case "claim":
          await this.#send(g.id, "claim_timeout", { game_id: g.id });
          return;
        case "resign":
          this.#o.log.warn({ game: g.id, status: g.status, deadline: g.deadline_block }, "missed own deadline, striking colours");
          await this.#send(g.id, "resign", { game_id: g.id });
          return;
        case "wait":
        case "done":
          return;
      }
    } catch (err) {
      this.#failures.set(g.id, (this.#failures.get(g.id) ?? 0) + 1);
      this.#o.log.error({ game: g.id, action: action.kind, err: err instanceof Error ? err.message : String(err) }, "action failed");
    }
  }

  async #send(gameId: number, method: string, args: object): Promise<{ ok: boolean; tx: string | null; error?: string }> {
    const r = await this.#o.caller.call(method, args, GAME_GAS_TGAS, gameId);
    this.#o.store.logAction(gameId, method === "submit_ai_move" ? "ai_move" : method, r.ok, r.txHash, r.error ?? null);
    if (r.ok) this.#failures.delete(gameId);
    else this.#failures.set(gameId, (this.#failures.get(gameId) ?? 0) + 1);
    if (r.ok) this.#o.log.info({ game: gameId, method, tx: r.txHash }, "sent");
    else this.#o.log.warn({ game: gameId, method, tx: r.txHash, error: r.error }, "rejected");
    return r.error === undefined ? { ok: r.ok, tx: r.txHash } : { ok: r.ok, tx: r.txHash, error: r.error };
  }

  #board(gameId: number): Board | undefined {
    const cached = this.#boards.get(gameId);
    if (cached) return cached;
    const row = this.#o.store.board(gameId);
    if (!row) return undefined;
    const plain = JSON.parse(this.#o.vault.open(row.sealed, `game:${gameId}`)) as SealedBoard;
    const board = newBoard(plain.cells, plain.salts.map(fromHex));
    if (rootHex(board) !== row.root) throw new Error(`stored board for game ${gameId} does not match its root`);
    this.#boards.set(gameId, board);
    return board;
  }

  async #commit(g: GameView): Promise<void> {
    let board = this.#board(g.id);
    if (!board) {
      board = newBoard(placeFleet(this.#o.rng ?? cryptoRng()), freshSalts());
      const sealed = this.#o.vault.seal(JSON.stringify({ cells: board.cells, salts: board.salts.map(toHex) }), `game:${g.id}`);
      this.#o.store.saveBoard(g.id, rootHex(board), sealed);
      board = this.#board(g.id);
      if (!board) throw new Error(`board for game ${g.id} was not stored`);
    }
    await this.#send(g.id, "commit_board", { game_id: g.id, root: rootHex(board) });
  }

  async #answer(g: GameView, index: number): Promise<boolean> {
    const board = this.#board(g.id);
    if (!board) throw new Error(`no board for game ${g.id}`);
    const args = answerArgs(board, g.id, index);
    const r = await this.#send(g.id, "answer", args);
    if (!r.ok && isTimeout(r.error)) this.#o.store.saveAnswer(g.id, { idx: index, cell: args.cell, salt: args.salt, proof: args.proof, tx: null });
    if (!r.ok) return false;
    this.#o.store.saveAnswer(g.id, { idx: index, cell: args.cell, salt: args.salt, proof: args.proof, tx: r.tx });
    if (args.cell === 1) this.#announceSunk(g.id, board, index);
    return true;
  }

  async #answerAndMove(g: GameView, index: number): Promise<void> {
    const board = this.#board(g.id);
    if (!board) throw new Error(`no board for game ${g.id}`);
    const early = answerArgs(board, g.id, index);
    if (!this.#o.store.answers(g.id).some((a) => a.idx === index)) {
      this.#o.store.saveAnswer(g.id, { idx: index, cell: early.cell, salt: early.salt, proof: early.proof, tx: null });
      if (early.cell === 1) this.#announceSunk(g.id, board, index);
    }
    if (board.cells[index] !== 0 || g.mode !== "VsNauarch") {
      if (await this.#answer(g, index)) await this.#followUp(g, index);
      return;
    }
    let signed: SignedMove | null = null;
    if (this.#o.model) {
      try {
        signed = await this.#signed(g, "Shot", index);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.#o.store.saveAiMove({ gameId: g.id, kind: "Shot", source: "model", error: errorCode(message) });
        this.#o.log.warn({ game: g.id, err: message }, "model move failed, answering with the contract's shot");
      }
    }
    const args = answerArgs(board, g.id, index);
    const follow = signed ? { then_ai: { response_body: signed.response, signature_hex: signed.signature } } : { then_fallback: true };
    const r = await this.#send(g.id, "answer", { ...args, ...follow });
    const unknown = !r.ok && isTimeout(r.error);
    if (!r.ok && !unknown) {
      if (await this.#answer(g, index)) await this.#followUp(g, index);
      return;
    }
    this.#o.store.saveAnswer(g.id, { idx: index, cell: args.cell, salt: args.salt, proof: args.proof, tx: r.tx });
    if (signed) this.#o.store.saveAiMove({ gameId: g.id, kind: "Shot", source: "model", chatId: signed.chatId, request: signed.request, response: signed.response, signature: signed.signature, signedText: signed.text, error: null, tx: r.tx });
    else this.#o.store.saveAiMove({ gameId: g.id, kind: "Shot", source: "deterministic", error: null, tx: r.tx });
  }

  #announceSunk(gameId: number, board: Board, index: number): void {
    const ship = ships(board.cells).find((s) => s.includes(index));
    if (!ship) return;
    const hits = new Set(this.#o.store.answers(gameId).filter((a) => a.cell === 1).map((a) => a.idx));
    if (ship.every((c) => hits.has(c))) this.#o.store.saveSunk(gameId, ship);
  }

  async #followUp(g: GameView, index: number): Promise<void> {
    const board = this.#board(g.id);
    if (board && board.cells[index] === 0) return this.#move({ ...g, pending_index: null, turn: this.#o.caller.accountId });
    const [next, height] = await Promise.all([this.#o.viewer.view<GameView | null>("get_game", { game_id: g.id }), this.#o.height()]);
    if (next && this.#decide(next, height).kind === "move") await this.#move(next);
  }

  async #reveal(g: GameView): Promise<void> {
    const board = this.#board(g.id);
    if (!board) {
      this.#failures.set(g.id, (this.#failures.get(g.id) ?? 0) + 1);
      this.#o.log.error({ game: g.id }, "cannot reveal: no stored board for this game");
      return;
    }
    const args = revealArgs(board, g.id);
    const r = await this.#send(g.id, "reveal", args);
    if (r.ok) this.#o.store.saveReveal(g.id, args.cells, args.salts, r.tx);
  }

  async #signed(g: GameView, kind: MoveKind, afterMiss: number | null = null): Promise<SignedMove> {
    const model = this.#o.model;
    if (!model) throw new Error("no model configured");
    const request =
      afterMiss === null
        ? await this.#o.viewer.view<string>("nauarch_request", { game_id: g.id, kind })
        : await this.#o.viewer.view<string>("nauarch_request_after", { game_id: g.id, index: afterMiss, cell: 0 });
    const work = (async () => {
      const started = Date.now();
      const reply = await model.complete(request);
      const completed = Date.now();
      const sig = await model.signature(reply.chatId);
      this.#o.log.info({ game: g.id, kind, completeMs: completed - started, signatureMs: Date.now() - completed }, "model timing");
      const modelName = (JSON.parse(request) as { model?: unknown }).model;
      const expected = `${String(modelName)}:${hexSha(request)}:${hexSha(reply.responseBody)}`;
      if (sig.text !== expected) throw new Error("signed text does not cover this request and response");
      return { request, response: reply.responseBody, chatId: reply.chatId, signature: sig.signatureHex, text: sig.text };
    })();
    const budget = kind === "Shot" ? Math.min(this.#o.shotBudgetMs ?? this.#o.modelTimeoutMs, this.#o.modelTimeoutMs) : this.#o.modelTimeoutMs;
    return withTimeout(work, budget, "model reply");
  }

  async #move(g: GameView): Promise<void> {
    if (this.#o.model) {
      try {
        const s = await this.#signed(g, "Shot");
        const r = await this.#send(g.id, "submit_ai_move", { game_id: g.id, kind: "Shot", response_body: s.response, signature_hex: s.signature });
        this.#o.store.saveAiMove({ gameId: g.id, kind: "Shot", source: "model", chatId: s.chatId, request: s.request, response: s.response, signature: s.signature, signedText: s.text, error: r.error ? errorCode(r.error) : null, tx: r.tx });
        if (r.ok) return;
      } catch (err) {
        this.#o.store.saveAiMove({ gameId: g.id, kind: "Shot", source: "model", error: errorCode(err instanceof Error ? err.message : String(err)) });
        const entry = { game: g.id, err: err instanceof Error ? err.message : String(err) };
        if (err instanceof ModelProviderError && err.kind === "auth") this.#o.log.error(entry, "the NEAR AI key is refused, every move falls back");
        else this.#o.log.warn(entry, "model move failed, falling back");
      }
    }
    const r = await this.#send(g.id, "nauarch_fallback", { game_id: g.id });
    this.#o.store.saveAiMove({ gameId: g.id, kind: "Shot", source: "deterministic", error: r.error ? errorCode(r.error) : null, tx: r.tx });
  }

  async #farewell(g: GameView): Promise<void> {
    try {
      const s = await this.#signed(g, "Farewell");
      const r = await this.#send(g.id, "submit_ai_move", { game_id: g.id, kind: "Farewell", response_body: s.response, signature_hex: s.signature });
      this.#o.store.saveAiMove({ gameId: g.id, kind: "Farewell", source: "model", chatId: s.chatId, request: s.request, response: s.response, signature: s.signature, signedText: s.text, error: r.error ? errorCode(r.error) : null, tx: r.tx });
      if (!r.ok) this.#o.store.logAction(g.id, "farewell", false, r.tx, r.error ?? null);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.#failures.set(g.id, (this.#failures.get(g.id) ?? 0) + 1);
      this.#o.log.warn({ game: g.id, err: error }, "farewell failed");
      this.#o.store.logAction(g.id, "farewell", false, null, error);
      this.#o.store.saveAiMove({ gameId: g.id, kind: "Farewell", source: "model", error: errorCode(error) });
    }
  }
}
