import type { Viewer } from "@/lib/chain";
import type { GameView, ShotView } from "@/lib/contract";
import { ships } from "@/lib/fleet";
import { bindMoves, type Check, type ModelKeys } from "@/lib/nauarch";
import type { NauarchEvidence } from "@/lib/proofs";
import { verifiedFleet } from "./session";

const STEP_MS = 420;
const QUICK_MS = 90;
const PAGE = 100;

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

export function buildReplay(game: GameView, history: readonly ShotView[], ev: NauarchEvidence | null, keys: ModelKeys | null): Replay {
  const ordered = [...history].sort((x, y) => x.n - y.n);
  const hitOnCaptain = new Array<number>(100).fill(0);
  for (const s of ordered) if (s.by === game.b && s.result === "Hit") hitOnCaptain[s.index] = 1;
  const nauarchShots = ordered.filter((s) => s.by === game.b);
  const modelShots = nauarchShots.filter((s) => s.source === "Model" || s.source === "ModelFallback");
  const lines = new Map<number, SpokenLine>();
  let k = 0;
  for (const b of bindMoves(ev?.moves ?? [], nauarchShots, game.id, keys)) {
    if (b.move.kind !== "Shot" || !b.move.request || !b.move.response) continue;
    const shot = modelShots[k++];
    if (shot && b.line) lines.set(shot.n, { text: b.line, check: b.check, tx: b.move.tx });
  }
  const reveal = ev?.reveal ?? null;
  const nauarchShips = reveal && game.root_b ? verifiedFleet(reveal.cells, reveal.salts, game.root_b) : null;
  const delays = ordered.map((s) => (s.by !== game.b && s.result !== "Hit" ? QUICK_MS : STEP_MS));
  return { game, history: ordered, captainShips: ships(hitOnCaptain), nauarchShips, lines, delays };
}

export function pageStarts(total: number): number[] {
  const starts: number[] = [];
  for (let from = Math.max(0, total - PAGE); ; from = Math.max(0, from - PAGE)) {
    starts.push(from);
    if (from === 0) return starts;
  }
}

export async function findShowcases(viewer: Viewer, total: number, want: number): Promise<GameView[]> {
  const found: GameView[] = [];
  for (const from of pageStarts(total)) {
    const page = await viewer.view<GameView[]>("games_since", { from_id: from, limit: PAGE });
    found.push(...page.filter(isShowcase).sort((x, y) => y.id - x.id));
    if (found.length >= want) break;
  }
  return found.slice(0, want);
}
