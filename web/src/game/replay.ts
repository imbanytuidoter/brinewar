import type { GameView, ModelView, ShotView } from "@/lib/contract";
import { ships } from "@/lib/fleet";
import { bindMoves, type Check } from "@/lib/nauarch";
import type { NauarchEvidence } from "@/lib/proofs";
import { verifiedFleet } from "./session";

const STEP_MS = 420;
const QUICK_MS = 90;
const SCAN = 40;

export interface SpokenLine {
  readonly text: string;
  readonly check: Check;
  readonly tx: string | null;
}

export interface Replay {
  readonly game: GameView;
  readonly history: readonly ShotView[];
  readonly captainShips: readonly (readonly number[])[];
  readonly nauarchShips: readonly (readonly number[])[] | null;
  readonly lines: ReadonlyMap<number, SpokenLine>;
  readonly delays: readonly number[];
}

export function isShowcase(g: GameView): boolean {
  return g.mode === "VsNauarch" && g.status === "Finished" && g.winner === g.b && g.finish_reason === "FleetSunk" && g.revealed_b;
}

export function buildReplay(game: GameView, history: readonly ShotView[], ev: NauarchEvidence | null, model: ModelView | null): Replay {
  const ordered = [...history].sort((x, y) => x.n - y.n);
  const hitOnCaptain = new Array<number>(100).fill(0);
  for (const s of ordered) if (s.by === game.b && s.result === "Hit") hitOnCaptain[s.index] = 1;
  const nauarchShots = ordered.filter((s) => s.by === game.b);
  const modelShots = nauarchShots.filter((s) => s.source === "Model" || s.source === "ModelFallback");
  const lines = new Map<number, SpokenLine>();
  let k = 0;
  for (const b of bindMoves(ev?.moves ?? [], nauarchShots, game.id, model)) {
    if (b.move.kind !== "Shot" || !b.move.request || !b.move.response) continue;
    const shot = modelShots[k++];
    if (shot && b.line) lines.set(shot.n, { text: b.line, check: b.check, tx: b.move.tx });
  }
  const reveal = ev?.reveal ?? null;
  const nauarchShips = reveal && game.root_b ? verifiedFleet(reveal.cells, reveal.salts, game.root_b) : null;
  const delays = ordered.map((s) => (s.by !== game.b && s.result !== "Hit" ? QUICK_MS : STEP_MS));
  return { game, history: ordered, captainShips: ships(hitOnCaptain), nauarchShips, lines, delays };
}

export function candidates(total: number): number[] {
  return Array.from({ length: Math.min(SCAN, total + 1) }, (_, i) => total - i).filter((id) => id >= 0);
}
