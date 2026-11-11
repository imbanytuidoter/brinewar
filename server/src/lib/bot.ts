import { Account, actions, KeyPairSigner, teraToGas, type JsonRpcProvider, type KeyPairString } from "near-api-js";
import { answerArgs, newBoard, revealArgs, rootHex, type Board } from "./board.js";
import type { GameView, ShotView } from "./contract.js";
import { GAME_GAS_TGAS } from "./contract.js";
import { placeFleet, type Rng } from "./fleet.js";
import { resultFromResponse, withTimeout, type CallResult, type Viewer } from "./near.js";

export interface BotOptions {
  readonly accountId: string;
  readonly secretKey: string;
  readonly provider: JsonRpcProvider;
  readonly contractId: string;
  readonly viewer: Viewer;
  readonly rng: Rng;
  readonly weight?: (cell: number) => number;
  readonly pollMs?: number;
  readonly maxMinutes?: number;
  readonly log?: (msg: string) => void;
}

function neighbours4(i: number): number[] {
  const out: number[] = [];
  if (i >= 10) out.push(i - 10);
  if (i % 10 < 9) out.push(i + 1);
  if (i < 90) out.push(i + 10);
  if (i % 10 > 0) out.push(i - 1);
  return out;
}

export function nextTarget(mine: readonly ShotView[], rng: Rng): number {
  const fired = new Set(mine.map((s) => s.index));
  const hits = mine.filter((s) => s.result === "Hit").map((s) => s.index);
  const diag = (a: number, b: number) => Math.abs((a % 10) - (b % 10)) === 1 && Math.abs(Math.floor(a / 10) - Math.floor(b / 10)) === 1;
  const open = (c: number) => !fired.has(c) && !hits.some((h) => diag(h, c));
  for (const h of [...hits].reverse()) {
    const c = neighbours4(h).find(open);
    if (c !== undefined) return c;
  }
  const pool = Array.from({ length: 100 }, (_, i) => i).filter((c) => open(c) && ((c % 10) + Math.floor(c / 10)) % 2 === 0);
  const rest = pool.length ? pool : Array.from({ length: 100 }, (_, i) => i).filter((c) => !fired.has(c));
  return rest[Math.floor(rng() * rest.length)] as number;
}

export class Bot {
  readonly #o: BotOptions;
  readonly #account: Account;
  readonly board: Board;
  gameId: number | null = null;

  constructor(o: BotOptions) {
    this.#o = o;
    this.#account = new Account(o.accountId, o.provider, KeyPairSigner.fromSecretKey(o.secretKey as KeyPairString));
    this.board = newBoard(placeFleet(o.rng, o.weight));
  }

  async #call(method: string, args: object): Promise<CallResult> {
    try {
      const resp = await withTimeout(
        this.#account.signAndSendTransaction({
          receiverId: this.#o.contractId,
          actions: [actions.functionCall(method, { ...args }, teraToGas(GAME_GAS_TGAS), 0n)],
          waitUntil: "EXECUTED_OPTIMISTIC",
          throwOnFailure: false,
        }),
        60_000,
        method,
      );
      return resultFromResponse(resp);
    } catch (err) {
      return { txHash: null, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async play(): Promise<GameView> {
    const created = await this.#call("new_game_vs_nauarch", {});
    if (!created.ok || typeof created.value !== "number") throw new Error(`new game failed: ${created.error}`);
    const id = created.value;
    this.gameId = id;
    const commit = await this.#call("commit_board", { game_id: id, root: rootHex(this.board) });
    if (!commit.ok) throw new Error(`commit failed: ${commit.error}`);
    const deadline = Date.now() + (this.#o.maxMinutes ?? 30) * 60_000;
    while (Date.now() < deadline) {
      const g = await this.#o.viewer.view<GameView>("get_game", { game_id: id });
      if (g.status === "Finished" && g.revealed_a) return g;
      if ((g.status === "Finished" || g.status === "Revealing") && !g.revealed_a) {
        const r = await this.#call("reveal", revealArgs(this.board, id));
        if (!r.ok && g.status === "Finished") return g;
        continue;
      }
      if (g.status === "Playing" && g.turn === this.#o.accountId) {
        if (g.pending_index !== null) {
          await this.#call("answer", answerArgs(this.board, id, g.pending_index));
        } else {
          const history = await this.#o.viewer.view<ShotView[]>("get_history", { game_id: id });
          const target = nextTarget(history.filter((s) => s.by === this.#o.accountId), this.#o.rng);
          await this.#call("fire", { game_id: id, index: target });
        }
        continue;
      }
      await new Promise((r) => setTimeout(r, this.#o.pollMs ?? 800));
    }
    throw new Error(`game ${id} did not finish in time`);
  }
}
