import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { decodeBoard } from "@/lib/board";
import type { Caller, CallResult, Viewer } from "@/lib/chain";
import type { GameView, PublicMove, ShotView } from "@/lib/contract";
import type { NauarchEvidence } from "@/lib/proofs";
import { cellName } from "@/lib/utils";
import { placeFleet, seededRng } from "@/lib/fleet";
import { boardKey } from "@/lib/guest";
import { fromHex, rootFromProof, toHex } from "@/lib/merkle";
import { signedText } from "@/lib/nauarch";
import { memoryStorage } from "@/lib/storage";
import { GameSession, rewardsBetween, verifiedFleet } from "./session";
import { newBoard, revealArgs } from "@/lib/board";

const ME = "p-0011223344556677.brinewar.testnet";
const NAU = "admiral.brinewar.testnet";
const MODEL = "Qwen/Qwen3.8-27B";

class FakeContract implements Viewer, Caller {
  readonly accountId = ME;
  readonly calls: string[] = [];
  readonly secret = ed25519.utils.randomSecretKey();
  game: GameView | null = null;
  history: ShotView[] = [];
  moves: PublicMove[] = [];
  enemy = placeFleet(seededRng(99));
  failNext: string | null = null;
  gold = "100";
  xp = 0;
  claims = 0;

  async view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    const out: Record<string, unknown> = {
      active_game_of: this.game && this.game.status !== "Finished" ? this.game.id : null,
      get_game: this.game && args.game_id === this.game.id ? { ...this.game } : null,
      get_history: this.history.map((s) => ({ ...s })),
      model: { model: MODEL, public_key: bytesToHex(ed25519.getPublicKey(this.secret)) },
      get_player: { account_id: args.account_id, nickname: null, display_name: args.account_id === ME ? "Captain" : "Ishmael", gold: this.gold, games_vs_nauarch: 0, wins: 0, losses: 0, last_result: null, fav_zone: null, flagship: "ship:1" },
      get_ship: { token_id: "ship:1", owner_id: ME, captain: ME, class: "c", rank: this.xp >= 100 ? "Lieutenant" : "Ensign", xp: this.xp, next_rank_xp: 100, wins: 0, losses: 0, sunk: 0, frozen: false },
    };
    return out[method] as T;
  }

  async call(method: string, args: Record<string, unknown>): Promise<CallResult> {
    this.calls.push(method);
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      return { txHash: null, ok: false, error };
    }
    const tx = `tx${this.calls.length}`;
    const g = this.game;
    switch (method) {
      case "new_game_vs_nauarch":
        this.game = {
          id: 4, mode: "VsNauarch", a: ME, b: NAU, root_a: null, root_b: "bb", status: "Placing", turn: ME, deadline_block: 1,
          winner: null, finish_reason: null, hits_on_a: 0, hits_on_b: 0, shots: 0, pending_index: null, revealed_a: false,
          revealed_b: false, created_block: 1, stake: "10", farewell_said: false,
        };
        return { txHash: tx, ok: true, value: 4 };
      case "new_game_pvp":
        this.game = {
          id: 4, mode: "PvP", a: ME, b: ME, root_a: null, root_b: null, status: "Waiting", turn: ME, deadline_block: 1,
          winner: null, finish_reason: null, hits_on_a: 0, hits_on_b: 0, shots: 0, pending_index: null, revealed_a: false,
          revealed_b: false, created_block: 1, stake: "0", farewell_said: false,
        };
        return { txHash: tx, ok: true, value: 4 };
      case "join_game":
        if (!g || g.status !== "Waiting" || g.a === ME) return { txHash: tx, ok: false, error: "this duel is not waiting for a captain" };
        g.b = ME;
        g.status = "Placing";
        return { txHash: tx, ok: true };
      case "claim_timeout":
        this.claims += 1;
        return { txHash: tx, ok: false, error: "deadline has not passed" };
      case "commit_board": {
        if (!g) return { txHash: tx, ok: false, error: "unknown game" };
        const mineA = g.a === ME;
        if (mineA ? g.root_a : g.root_b) return { txHash: tx, ok: false, error: "board already committed" };
        if (mineA) g.root_a = String(args.root);
        else g.root_b = String(args.root);
        if (g.mode === "VsNauarch" || (g.root_a && g.root_b)) g.status = "Playing";
        return { txHash: tx, ok: true };
      }
      case "fire": {
        if (!g || g.turn !== ME || g.pending_index !== null) return { txHash: tx, ok: false, error: "not your turn" };
        const index = Number(args.index);
        const hit = this.enemy[index] === 1;
        this.history.push({ n: g.shots++, by: ME, index, result: hit ? "Hit" : "Miss", block: 2, source: "Player" });
        if (hit) g.hits_on_b++;
        g.turn = NAU;
        return { txHash: tx, ok: true };
      }
      case "answer": {
        if (!g || g.pending_index !== Number(args.index)) return { txHash: tx, ok: false, error: "index does not match the pending shot" };
        const root = rootFromProof(Number(args.index), Number(args.cell), fromHex(String(args.salt)), (args.proof as string[]).map(fromHex));
        if (toHex(root) !== g.root_a) return { txHash: tx, ok: false, error: "proof does not match" };
        const last = this.history[this.history.length - 1] as ShotView;
        last.result = Number(args.cell) === 1 ? "Hit" : "Miss";
        g.pending_index = null;
        return { txHash: tx, ok: true };
      }
      case "reveal":
        if (!g) return { txHash: tx, ok: false, error: "unknown game" };
        g.revealed_a = true;
        g.status = "Finished";
        return { txHash: tx, ok: true };
      case "resign":
        if (!g) return { txHash: tx, ok: false, error: "unknown game" };
        g.status = "Revealing";
        g.winner = NAU;
        return { txHash: tx, ok: true };
      default:
        return { txHash: tx, ok: false, error: `unknown ${method}` };
    }
  }

  nauarchFires(index: number, line: string, sign = true): void {
    const g = this.game as GameView;
    this.history.push({ n: g.shots++, by: NAU, index, result: "Pending", block: 3, source: "Model" });
    g.pending_index = index;
    g.turn = ME;
    const request = JSON.stringify({ messages: [{ role: "user", content: `Battle #${g.id}. Shot ${g.shots}.` }] });
    const response = JSON.stringify({ choices: [{ message: { content: JSON.stringify({ shot: cellName(index), line }) } }] });
    const signature = bytesToHex(ed25519.sign(utf8ToBytes(signedText(MODEL, request, response)), this.secret));
    this.moves.push({
      kind: "Shot", source: "model", chat_id: "c", request, response, signature: sign ? signature : "00".repeat(64),
      signed_text: null, error: null, tx: `ai${this.moves.length}`, at: Date.now(),
    });
  }

  reveal: NauarchEvidence["reveal"] = null;
  hang = false;

  evidence = async (id: number): Promise<NauarchEvidence | null> => {
    if (this.hang) throw new Error("timeout");
    return this.game && this.game.id === id ? { root: this.game.root_b, answers: [], reveal: this.reveal, moves: this.moves } : null;
  };
}

function setup() {
  const chain = new FakeContract();
  const store = memoryStorage();
  const session = new GameSession({ accountId: ME, viewer: chain, caller: chain, store, evidence: chain.evidence });
  return { chain, store, session };
}

describe("GameSession", () => {
  it("opens a battle, seals the board and keeps the board only in this browser", async () => {
    const { chain, store, session } = setup();
    const cells = placeFleet(seededRng(7));
    expect(await session.start(cells)).toBe(true);
    expect(chain.calls).toEqual(["new_game_vs_nauarch", "commit_board"]);
    expect(session.snapshot.step).toEqual({ kind: "fire" });
    expect(store.get(boardKey(ME, "next"))).toBeNull();
    const saved = decodeBoard(store.get(boardKey(ME, 4)) ?? "");
    expect(saved?.cells).toEqual(cells);
    expect(chain.game?.root_a).toBe(saved && toHex(saved.tree.root));
  });

  it("fires, then answers the Nauarch with a proof and shows his signed line", async () => {
    const { chain, session } = setup();
    const cells = placeFleet(seededRng(7));
    await session.start(cells);
    const target = chain.enemy.indexOf(1);
    expect(await session.fire(target)).toBe(true);
    expect(session.snapshot.marks.enemy.get(target)).toBe("hit");
    expect(session.snapshot.step).toEqual({ kind: "thinking" });
    const mine = cells.indexOf(1);
    chain.nauarchFires(mine, "The left edge again, Captain?");
    await session.tick();
    expect(chain.calls.at(-1)).toBe("answer");
    await session.tick();
    expect(session.snapshot.marks.mine.get(mine)).toBe("hit");
    expect(session.snapshot.lines).toEqual([expect.objectContaining({ text: "The left edge again, Captain?", signed: true, kind: "Shot" })]);
    expect(session.snapshot.step).toEqual({ kind: "fire" });
  });

  it("keeps answering the Nauarch when the harbour is down", async () => {
    const { chain, session } = setup();
    await session.start(placeFleet(seededRng(7)));
    await session.fire(0);
    chain.hang = true;
    chain.nauarchFires(55, "x");
    await session.tick();
    expect(chain.calls.at(-1)).toBe("answer");
  });

  it("does not trust a signed line from another shot", async () => {
    const { chain, session } = setup();
    await session.start(placeFleet(seededRng(7)));
    await session.fire(0);
    chain.nauarchFires(55, "Borrowed.");
    const m = chain.moves[0] as PublicMove;
    chain.moves[0] = { ...m, response: m.response?.replace("F6", "A1") ?? null };
    await session.tick();
    expect(session.snapshot.lines[0]?.signed).toBe(false);
  });

  it("backs off after a failed answer instead of resending every poll", async () => {
    let t = 0;
    const chain = new FakeContract();
    const session = new GameSession({ accountId: ME, viewer: chain, caller: chain, store: memoryStorage(), evidence: chain.evidence, now: () => t });
    await session.start(placeFleet(seededRng(7)));
    await session.fire(0);
    chain.nauarchFires(55, "x");
    chain.failNext = "network glitch";
    await session.tick();
    await session.tick();
    await session.tick();
    expect(chain.calls.filter((c) => c === "answer")).toHaveLength(1);
    t += 10_000;
    await session.tick();
    expect(chain.calls.filter((c) => c === "answer")).toHaveLength(2);
  });

  it("does not mark a line as signed when the signature is wrong", async () => {
    const { chain, session } = setup();
    await session.start(placeFleet(seededRng(7)));
    await session.fire(0);
    chain.nauarchFires(55, "Forged.", false);
    await session.tick();
    expect(session.snapshot.lines[0]?.signed).toBe(false);
  });

  it("refuses to fire out of turn or twice at a cell", async () => {
    const { chain, session } = setup();
    await session.start(placeFleet(seededRng(7)));
    await session.fire(0);
    expect(await session.fire(1)).toBe(false);
    chain.nauarchFires(55, "x");
    await session.tick();
    await session.tick();
    expect(await session.fire(0)).toBe(false);
    expect(chain.calls.filter((c) => c === "fire")).toHaveLength(1);
  });

  it("reveals after resigning and returns to the harbour", async () => {
    const { chain, session } = setup();
    await session.start(placeFleet(seededRng(7)));
    await session.resign();
    expect(chain.calls).toContain("reveal");
    await session.tick();
    expect(session.snapshot.step).toEqual({ kind: "done" });
    session.leave();
    expect(session.snapshot.gameId).toBeNull();
  });

  it("resumes an open battle after a reload and adopts a board saved before the id came back", async () => {
    const { chain, store, session } = setup();
    await session.start(placeFleet(seededRng(7)));
    const fresh = new GameSession({ accountId: ME, viewer: chain, caller: chain, store, evidence: chain.evidence });
    await fresh.tick();
    expect(fresh.snapshot.gameId).toBe(4);
    expect(fresh.snapshot.step).toEqual({ kind: "fire" });

    const other = setup();
    other.chain.calls.length = 0;
    await other.chain.call("new_game_vs_nauarch", {});
    other.store.set(boardKey(ME, "next"), store.get(boardKey(ME, 4)) ?? "");
    await other.session.tick();
    expect(other.chain.calls.at(-1)).toBe("commit_board");
    expect(other.store.get(boardKey(ME, 4))).not.toBeNull();
  });

  it("shows the Nauarch fleet only when his reveal matches the committed root", async () => {
    const { chain, session } = setup();
    await session.start(placeFleet(seededRng(7)));
    const his = newBoard(chain.enemy);
    const r = revealArgs(his, 4);
    const g = chain.game as GameView;
    g.root_b = toHex(his.tree.root);
    g.revealed_b = true;
    g.status = "Revealing";
    g.winner = ME;
    chain.reveal = { cells: r.cells, salts: r.salts, tx: "rv" };
    await session.tick();
    expect(session.snapshot.enemyFleet?.flat().sort((a, b) => a - b)).toEqual(chain.enemy.flatMap((c, i) => (c ? [i] : [])));
    expect(verifiedFleet(r.cells, r.salts, "00".repeat(32))).toBeNull();
    expect(verifiedFleet("1".repeat(100), r.salts, g.root_b)).toBeNull();
  });

  it("flags the network as down and recovers", async () => {
    const { chain, session } = setup();
    const view = chain.view.bind(chain);
    chain.view = async () => {
      throw new Error("fetch failed");
    };
    await session.poll();
    expect(session.snapshot.offline).toBe(true);
    chain.view = view;
    await session.poll();
    expect(session.snapshot.offline).toBe(false);
  });

  it("reports a lost board and friendly errors", async () => {
    const { chain, store, session } = setup();
    chain.failNext = "Smart contract panicked: the Nauarch is busy, try again soon";
    expect(await session.start(placeFleet(seededRng(7)))).toBe(false);
    expect(session.snapshot.error).toMatch(/busy/);
    await session.start(placeFleet(seededRng(7)));
    store.remove(boardKey(ME, 4));
    const fresh = new GameSession({ accountId: ME, viewer: chain, caller: chain, store, evidence: chain.evidence });
    await fresh.tick();
    expect(fresh.snapshot.step).toEqual({ kind: "lost-board" });
  });
});

describe("duels with a friend", () => {
  const FRIEND = "p-8899aabbccddeeff.brinewar.testnet";

  it("opens a duel, waits for the friend and seals the board once they join", async () => {
    const { chain, session } = setup();
    expect(await session.startDuel(placeFleet(seededRng(7)))).toBe(true);
    expect(session.snapshot.step).toEqual({ kind: "invite" });
    expect(chain.calls).toEqual(["new_game_pvp"]);
    expect(session.snapshot.invite).toMatch(/^[0-9a-f]{64}$/);
    const g = chain.game as GameView;
    g.b = FRIEND;
    g.status = "Placing";
    g.root_b = "ff";
    await session.tick();
    expect(chain.calls.at(-1)).toBe("commit_board");
    expect(g.root_a).not.toBeNull();
    expect(session.snapshot.opponentName).toBe("Ishmael");
  });

  it("joins a friend's duel as the second captain and seals the board", async () => {
    const { chain, session, store } = setup();
    chain.game = {
      id: 9, mode: "PvP", a: FRIEND, b: FRIEND, root_a: "aa", root_b: null, status: "Waiting", turn: FRIEND, deadline_block: 1,
      winner: null, finish_reason: null, hits_on_a: 0, hits_on_b: 0, shots: 0, pending_index: null, revealed_a: false,
      revealed_b: false, created_block: 1, stake: "0", farewell_said: false,
    };
    expect(await session.join(9, "ab".repeat(32), placeFleet(seededRng(7)))).toBe(true);
    expect(chain.calls).toEqual(["join_game", "commit_board"]);
    expect(chain.game.root_b).not.toBeNull();
    expect(chain.game.status).toBe("Playing");
    expect(store.get(boardKey(ME, 9))).not.toBeNull();
    expect(session.snapshot.step).toEqual({ kind: "thinking" });
  });

  it("refuses a link without its secret before sending anything", async () => {
    const { chain, session } = setup();
    expect(await session.join(9, "", placeFleet(seededRng(7)))).toBe(false);
    expect(chain.calls).toEqual([]);
    expect(session.snapshot.error).toMatch(/incomplete/);
  });

  it("claims the win when the other captain goes quiet", async () => {
    let t = 0;
    const chain = new FakeContract();
    const session = new GameSession({ accountId: ME, viewer: chain, caller: chain, store: memoryStorage(), evidence: chain.evidence, now: () => t });
    await session.startDuel(placeFleet(seededRng(7)));
    await session.tick();
    expect(chain.claims).toBe(0);
    t += 151_000;
    await session.tick();
    expect(chain.claims).toBe(1);
  });
});

describe("fuel", () => {
  it("asks the harbour for fuel before a battle and after an out-of-fuel refusal, at most once a minute", async () => {
    let t = 0;
    const chain = new FakeContract();
    let refuels = 0;
    const session = new GameSession({ accountId: ME, viewer: chain, caller: chain, store: memoryStorage(), evidence: chain.evidence, refuel: async () => (refuels++, true), now: () => t });
    await session.start(placeFleet(seededRng(7)));
    expect(refuels).toBe(1);
    t += 61_000;
    chain.failNext = "InvalidTxError: NotEnoughBalance { signer_id: p }";
    await session.fire(0);
    expect(refuels).toBe(2);
    chain.failNext = "NotEnoughBalance";
    await session.fire(1);
    expect(refuels).toBe(2);
  });
});

describe("rewards after a battle", () => {
  it("survive a reload between the start and the end of the battle", async () => {
    const { chain, store, session } = setup();
    await session.start(placeFleet(seededRng(7)));
    const fresh = new GameSession({ accountId: ME, viewer: chain, caller: chain, store, evidence: chain.evidence });
    await fresh.tick();
    await fresh.resign();
    chain.gold = "90";
    chain.xp = 120;
    (chain.game as GameView).revealed_b = true;
    await fresh.tick();
    expect(fresh.snapshot.step).toEqual({ kind: "done" });
    expect(fresh.snapshot.rewards).toEqual({ gold: -10n, xp: 120, rankFrom: "Ensign", rankTo: "Lieutenant" });
    expect(store.get(`brinewar.baseline.${ME}.4`)).toBeNull();
  });
});

describe("rewards", () => {
  const cap = (gold: string, xp: number, rank: string) => ({
    player: { account_id: ME, nickname: null, display_name: "x", gold, games_vs_nauarch: 0, wins: 0, losses: 0, last_result: null, fav_zone: null, flagship: "ship:1" },
    ship: { token_id: "ship:1", owner_id: ME, captain: ME, class: "c", rank, xp, next_rank_xp: null, wins: 0, losses: 0, sunk: 0, frozen: false },
  });

  it("reports gold, xp and a promotion between two snapshots", () => {
    expect(rewardsBetween(cap("90", 40, "Ensign"), cap("115", 190, "Lieutenant"))).toEqual({ gold: 25n, xp: 150, rankFrom: "Ensign", rankTo: "Lieutenant" });
    expect(rewardsBetween(cap("100", 0, "Ensign"), cap("90", 30, "Ensign"))).toEqual({ gold: -10n, xp: 30, rankFrom: null, rankTo: null });
  });
});
