import type { AnswerRow, GameView, ModelView, ShotView } from "@/lib/contract";
import { fromHex, rootFromProof, toHex } from "@/lib/merkle";
import { bindMoves, type Check } from "@/lib/nauarch";
import type { NauarchEvidence } from "@/lib/proofs";
import { verifiedFleet } from "./session";

export type { Check };

export interface ShotRow {
  readonly n: number;
  readonly byNauarch: boolean;
  readonly index: number;
  readonly result: ShotView["result"];
  readonly source: ShotView["source"];
  readonly proof: Check;
  readonly tx: string | null;
}

export interface MoveRow {
  readonly kind: string;
  readonly source: string;
  readonly line: string | null;
  readonly signed: Check;
  readonly tx: string | null;
}

export interface Report {
  readonly shots: readonly ShotRow[];
  readonly moves: readonly MoveRow[];
  readonly nauarchFleet: readonly (readonly number[])[] | null;
  readonly revealCheck: Check | null;
  readonly proofsOk: number;
  readonly proofsBad: number;
  readonly signedOk: number;
}

export function answerCheck(a: AnswerRow | undefined, root: string | null, result: ShotView["result"]): Check {
  if (!a || !root || result === "Pending") return "chain";
  try {
    const computed = toHex(rootFromProof(a.idx, a.cell, fromHex(a.salt), a.proof.map(fromHex)));
    const consistent = (a.cell === 1) === (result === "Hit");
    return computed === root.replace(/^0x/, "").toLowerCase() && consistent ? "ok" : "bad";
  } catch {
    return "bad";
  }
}

export function buildReport(game: GameView, history: readonly ShotView[], ev: NauarchEvidence | null, model: ModelView | null): Report {
  const answers = new Map((ev?.answers ?? []).map((a) => [a.idx, a]));
  const shots = history.map((s): ShotRow => {
    const byNauarch = s.by === game.b;
    const answer = byNauarch ? undefined : answers.get(s.index);
    return {
      n: s.n, byNauarch, index: s.index, result: s.result, source: s.source,
      proof: byNauarch ? "chain" : answerCheck(answer, game.root_b, s.result),
      tx: answer?.tx ?? null,
    };
  });
  const moves = bindMoves(ev?.moves ?? [], history.filter((s) => s.by === game.b), game.id, model).map(
    (b): MoveRow => ({ kind: b.move.kind, source: b.move.source, line: b.line, signed: b.check, tx: b.move.tx }),
  );
  const reveal = ev?.reveal ?? null;
  const nauarchFleet = reveal && game.root_b ? verifiedFleet(reveal.cells, reveal.salts, game.root_b) : null;
  return {
    shots, moves, nauarchFleet,
    revealCheck: reveal ? (nauarchFleet ? "ok" : "bad") : null,
    proofsOk: shots.filter((s) => s.proof === "ok").length,
    proofsBad: shots.filter((s) => s.proof === "bad").length,
    signedOk: moves.filter((m) => m.signed === "ok").length,
  };
}
