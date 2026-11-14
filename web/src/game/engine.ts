import type { GameView, ShotView } from "@/lib/contract";
import type { Mark } from "@/scene/types";

export type Step =
  | { readonly kind: "commit" }
  | { readonly kind: "answer"; readonly index: number }
  | { readonly kind: "reveal" }
  | { readonly kind: "fire" }
  | { readonly kind: "thinking" }
  | { readonly kind: "wait" }
  | { readonly kind: "lost-board" }
  | { readonly kind: "invite" }
  | { readonly kind: "done" };

type SideName = "a" | "b";

export function sideOf(g: GameView, me: string): SideName {
  return g.a === me ? "a" : "b";
}

export function opponentOf(g: GameView, me: string): string {
  return g.a === me ? g.b : g.a;
}

export function hitsOnMe(g: GameView, me: string): number {
  return sideOf(g, me) === "a" ? g.hits_on_a : g.hits_on_b;
}

export function hitsOnThem(g: GameView, me: string): number {
  return sideOf(g, me) === "a" ? g.hits_on_b : g.hits_on_a;
}

function mine(g: GameView, me: string): { root: string | null; revealed: boolean } {
  return sideOf(g, me) === "a" ? { root: g.root_a, revealed: g.revealed_a } : { root: g.root_b, revealed: g.revealed_b };
}

export function nextStep(g: GameView, me: string, hasBoard: boolean): Step {
  const my = mine(g, me);
  if (g.status === "Waiting") return { kind: "invite" };
  if (g.status === "Finished" && (my.revealed || !hasBoard)) return { kind: "done" };
  if (!hasBoard) return { kind: "lost-board" };
  if (g.status === "Placing") return my.root === null ? { kind: "commit" } : { kind: "wait" };
  if (g.status === "Revealing" || g.status === "Finished") {
    if (my.root === null) return g.status === "Finished" ? { kind: "done" } : { kind: "wait" };
    return my.revealed ? { kind: "wait" } : { kind: "reveal" };
  }
  if (g.turn !== me) return g.pending_index === null ? { kind: "thinking" } : { kind: "wait" };
  return g.pending_index === null ? { kind: "fire" } : { kind: "answer", index: g.pending_index };
}

export interface Marks {
  readonly mine: ReadonlyMap<number, Mark>;
  readonly enemy: ReadonlyMap<number, Mark>;
  readonly aiming: number | null;
}

const markOf = (s: ShotView): Mark | null => (s.result === "Hit" ? "hit" : s.result === "Miss" ? "miss" : null);

export function marksFrom(history: readonly ShotView[], me: string): Marks {
  const mine = new Map<number, Mark>();
  const enemy = new Map<number, Mark>();
  let aiming: number | null = null;
  for (const s of history) {
    const m = markOf(s);
    if (s.by === me) {
      if (m) enemy.set(s.index, m);
      else aiming = s.index;
    } else if (m) mine.set(s.index, m);
  }
  return { mine, enemy, aiming };
}

export function canTarget(index: number, marks: Marks): boolean {
  return Number.isInteger(index) && index >= 0 && index < 100 && !marks.enemy.has(index) && marks.aiming !== index;
}

export type Outcome = "won" | "lost" | null;

export function outcome(g: GameView, me: string): Outcome {
  if (g.status !== "Finished" && g.status !== "Revealing") return null;
  if (g.winner === null) return null;
  return g.winner === me ? "won" : "lost";
}

const FRIENDLY: ReadonlyArray<readonly [RegExp, string]> = [
  [/finish your current game first/, "You already have a battle at sea."],
  [/the Nauarch is busy/, "The Nauarch is busy with other captains. Try again in a minute."],
  [/not a registered player/, "Your captain is not registered yet. Reload the page."],
  [/daily game limit/, "You have fought enough battles today. Come back tomorrow."],
  [/cell already fired at/, "You already fired at that cell."],
  [/not your turn|no shot to answer|index does not match/, "Hold fire, it is not your turn."],
  [/move deadline passed/, "The move deadline passed."],
  [/invite link is not valid/, "This invite link is not valid. Ask your friend for a fresh one."],
  [/not waiting for a captain/, "Someone has already taken this duel, or it was cancelled."],
  [/cannot join your own duel/, "This is your own invite: send it to a friend."],
  [/MethodNameMismatch|method name/i, "This browser's key cannot make that move. Reload the page."],
  [/NotEnoughBalance|LackBalanceForState|not enough balance|allowance/i, "Your ship is low on fuel. Taking on more, then the move is retried."],
  [/invalid nonce|InvalidNonce/i, "This captain just moved from another tab or device. This tab has caught up; try again."],
  [/timed out|fetch|network/i, "The sea is rough: the network did not answer. Retrying."],
];

export function friendlyError(raw: string | undefined): string {
  if (!raw) return "Something went wrong at sea.";
  const hit = FRIENDLY.find(([re]) => re.test(raw));
  return hit ? hit[1] : "The contract refused that move.";
}
