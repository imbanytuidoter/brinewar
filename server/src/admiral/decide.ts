import type { GameView } from "../lib/contract.js";

export type Action =
  | { kind: "commit" }
  | { kind: "answer"; index: number }
  | { kind: "move" }
  | { kind: "reveal" }
  | { kind: "farewell" }
  | { kind: "claim" }
  | { kind: "wait" }
  | { kind: "done" };

export interface DecideContext {
  readonly admiral: string;
  readonly height: number;
  readonly hasBoard: boolean;
  readonly farewellEnabled: boolean;
  readonly farewellGaveUp: boolean;
}

export function decide(g: GameView, ctx: DecideContext): Action {
  if (g.b !== ctx.admiral) return { kind: "done" };
  const late = ctx.height > g.deadline_block;
  switch (g.status) {
    case "Placing":
      if (g.root_b === null) return late ? { kind: "wait" } : { kind: "commit" };
      return late ? { kind: "claim" } : { kind: "wait" };
    case "Playing": {
      const ours = g.turn === ctx.admiral;
      if (late) return ours ? { kind: "wait" } : { kind: "claim" };
      if (!ours) return { kind: "wait" };
      return g.pending_index !== null ? { kind: "answer", index: g.pending_index } : { kind: "move" };
    }
    case "Revealing":
      if (g.winner === ctx.admiral) {
        if (g.revealed_b || !ctx.hasBoard) return { kind: "wait" };
        return late ? { kind: "wait" } : { kind: "reveal" };
      }
      return late ? { kind: "claim" } : { kind: "wait" };
    case "Finished":
      if (!g.revealed_b && ctx.hasBoard && g.root_b !== null) return { kind: "reveal" };
      if (!g.farewell_said && ctx.farewellEnabled && !ctx.farewellGaveUp) return { kind: "farewell" };
      return { kind: "done" };
  }
}
