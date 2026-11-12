import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { sound } from "@/lib/sound";
import { confirmedSunk, shipAt, sunkOwn } from "@/lib/sunk";
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
  readonly heat: readonly number[] | null;
  readonly boards: number;
  readonly rival: string | null;
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

export function useBattleFeed(ctx: FeedContext): {
  readonly callout: Callout | null;
  readonly last: CalloutTone | null;
  readonly onLaunch: (side: Side, cell: number, hit: boolean) => void;
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
    if (!callout) return;
    const t = setTimeout(() => setCallout((c) => (c?.id === callout.id ? null : c)), HOLD_MS);
    return () => clearTimeout(t);
  }, [callout]);

  const show = useCallback((title: string, sub: string | null, tone: CalloutTone) => {
    seq.current += 1;
    setCallout({ id: seq.current, title, sub, tone });
    setLast(tone);
  }, []);

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
          show("Miss", cellName(cell), "miss");
          return;
        }
        streak.current += 1;
        const sunk = confirmedSunk(c.enemyMarks).find((s) => s.includes(cell));
        if (sunk) {
          sound.sunk();
          show("Sunk!", `${shipName(sunk.length)} down · ${cellName(cell)}`, "sunk");
          return;
        }
        sound.hit();
        show(streak.current > 1 ? `Hit ×${streak.current}` : "Hit", cellName(cell), "hit");
        return;
      }
      const note = c.rival ? cellName(cell) : (huntNote(c.heat, c.boards, cell) ?? cellName(cell));
      const who = c.rival ?? "He";
      if (!hit) {
        sound.splash();
        show(c.rival ? `${who} misses` : "He misses", note, "spared");
        return;
      }
      const lost = sunkOwn(c.myShips, c.myMarks).some((s) => s.includes(cell));
      if (lost) {
        sound.sunk();
        show("Ship lost", `${shipName(shipAt(c.myShips, cell)?.length ?? 0)} · ${note}`, "lost");
        return;
      }
      sound.hit();
      show(c.rival ? `${who} hits` : "He hits", note, "taken");
    },
    [show],
  );

  return { callout, last, onLaunch, onLand };
}
