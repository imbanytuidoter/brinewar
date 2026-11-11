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
  | { readonly kind: "done" };

export function nextStep(g: GameView, me: string, hasBoard: boolean): Step {
  if (g.status === "Finished" && (g.revealed_a || !hasBoard)) return { kind: "done" };
  if (!hasBoard) return { kind: "lost-board" };
  if (g.status === "Placing") return g.root_a === null ? { kind: "commit" } : { kind: "wait" };
  if (g.status === "Revealing" || g.status === "Finished") {
    if (g.root_a === null) return g.status === "Finished" ? { kind: "done" } : { kind: "wait" };
    return g.revealed_a ? { kind: "wait" } : { kind: "reveal" };
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
  [/NotEnoughBalance|LackBalanceForState|allowance/i, "Your ship ran out of fuel for transactions. Ask for a refill."],
  [/timed out|fetch|network/i, "The sea is rough: the network did not answer. Retrying."],
];

export function friendlyError(raw: string | undefined): string {
  if (!raw) return "Something went wrong at sea.";
  const hit = FRIENDLY.find(([re]) => re.test(raw));
  return hit ? hit[1] : "The contract refused that move.";
}
