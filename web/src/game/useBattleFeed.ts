import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { sound } from "@/lib/sound";
import { shipAt, sunkOwn } from "@/lib/sunk";
import { cellName } from "@/lib/utils";
import type { Mark, Side } from "@/scene/types";

const HOLD_MS = 1600;
const HUNT_RANK = 15;

export type CalloutTone = "hit" | "sunk" | "miss" | "taken" | "lost" | "spared";

export interface Callout {
  readonly id: number;
  readonly title: string;
  readonly sub: string | null;
  readonly tone: CalloutTone;
}

export interface FeedContext {
  readonly myShips: readonly (readonly number[])[];
  readonly myMarks: ReadonlyMap<number, Mark>;
  readonly enemyMarks: ReadonlyMap<number, Mark>;
  readonly sunkTheirs: readonly (readonly number[])[];
  readonly heat: readonly number[] | null;
  readonly boards: number;
  readonly rival: string | null;
  readonly gameId?: number | null;
}

const SHIP_NAMES: Readonly<Record<number, string>> = { 4: "Man-of-war", 3: "Frigate", 2: "Brig", 1: "Sloop" };

export function shipName(length: number): string {
  return SHIP_NAMES[length] ?? "Ship";
}

export function huntNote(heat: readonly number[] | null, boards: number, cell: number): string | null {
  if (!heat || boards <= 0) return null;
  const mine = heat[cell] ?? 0;
  if (mine <= 0) return `${cellName(cell)} · a probe off his map`;
  const rank = heat.filter((h) => h > mine).length;
  const pct = Math.round(Math.min(1, mine / boards) * 100);
  return rank < HUNT_RANK ? `Hunting from the Admiralty map · ${cellName(cell)} · ${pct}% of fleets sat here` : `${cellName(cell)} · ${pct}% of fleets sat here`;
}

function sankTitle(rival: string | null): string {
  return rival ? "You sank a ship" : "You sank his ship";
}

export function useBattleFeed(ctx: FeedContext): {
  readonly callout: Callout | null;
  readonly last: CalloutTone | null;
  readonly onLaunch: (side: Side, cell: number, hit: boolean) => void;
  readonly announce: (ship: readonly number[]) => void;
  readonly onLand: (side: Side, cell: number, hit: boolean) => void;
} {
  const ref = useRef(ctx);
  const streak = useRef(0);
  const seq = useRef(0);
  const [callout, setCallout] = useState<Callout | null>(null);
  const [last, setLast] = useState<CalloutTone | null>(null);

  useLayoutEffect(() => {
    ref.current = ctx;
  });

  useEffect(() => {
    streak.current = 0;
    landedHits.current = new Set();
    shownSunk.current = new Set();
  }, [ctx.gameId]);

  useEffect(() => {
    if (!callout) return;
    const t = setTimeout(() => setCallout((c) => (c?.id === callout.id ? null : c)), HOLD_MS);
    return () => clearTimeout(t);
  }, [callout]);

  const show = useCallback((title: string, sub: string | null, tone: CalloutTone) => {
    seq.current += 1;
    setCallout({ id: seq.current, title, sub, tone });
    setLast(tone);
  }, []);

  const shownSunk = useRef(new Set<string>());
  const landedHits = useRef(new Set<number>());
  const announce = useCallback(
    (ship: readonly number[]) => {
      const key = [...ship].sort((a, b) => a - b).join();
      if (shownSunk.current.has(key) || !ship.every((c) => landedHits.current.has(c))) return;
      shownSunk.current.add(key);
      sound.sunk();
      show(sankTitle(ref.current.rival), `${shipName(ship.length)} · ${cellName(ship[ship.length - 1] ?? 0)}`, "sunk");
    },
    [show],
  );
  const onLaunch = useCallback((side: Side) => {
    if (side === "enemy") sound.cannon();
    else sound.incoming();
  }, []);

  const onLand = useCallback(
    (side: Side, cell: number, hit: boolean) => {
      const c = ref.current;
      if (side === "enemy") {
        if (!hit) {
          streak.current = 0;
          sound.splash();
          show("You missed", cellName(cell), "miss");
          return;
        }
        streak.current += 1;
        landedHits.current.add(cell);
        const sunk = c.sunkTheirs.find((s) => s.includes(cell));
        const sunkKey = sunk ? [...sunk].sort((a, b) => a - b).join() : null;
        if (sunk && sunkKey && !shownSunk.current.has(sunkKey)) {
          shownSunk.current.add(sunkKey);
          sound.sunk();
          show(sankTitle(c.rival), `${shipName(sunk.length)} · ${cellName(cell)}`, "sunk");
          return;
        }
        sound.hit();
        show(streak.current > 1 ? `You hit ×${streak.current}` : "You hit", `${cellName(cell)} · fire again`, "hit");
        return;
      }
      const note = c.rival ? cellName(cell) : (huntNote(c.heat, c.boards, cell) ?? cellName(cell));
      const who = c.rival ?? "Nauarch";
      if (!hit) {
        sound.splash();
        show(`${who} missed`, note, "spared");
        return;
      }
      const lost = sunkOwn(c.myShips, c.myMarks).some((s) => s.includes(cell));
      if (lost) {
        sound.sunk();
        show("You lost a ship", `${shipName(shipAt(c.myShips, cell)?.length ?? 0)} · ${note}`, "lost");
        return;
      }
      sound.hit();
      show(`${who} hits you`, note, "taken");
    },
    [show],
  );

  return { callout, last, onLaunch, announce, onLand };
}
