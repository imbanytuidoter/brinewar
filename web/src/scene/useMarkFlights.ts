import { useEffect, useRef, useState } from "react";
import { addedMarks } from "./grid";
import { useRuntime } from "./runtime";
import type { Mark, Side } from "./types";

const SHAKE_TAKEN = 1;
const SHAKE_GIVEN = 0.55;
const SHOT_SLOT_MS = 1400;
const FLIGHT_MS = 1150;

function isSubset(prev: ReadonlyMap<number, Mark>, next: ReadonlyMap<number, Mark>): boolean {
  for (const [cell, mark] of prev) if (next.get(cell) !== mark) return false;
  return true;
}

export function useMarkFlights(side: Side, marks: ReadonlyMap<number, Mark>): ReadonlyMap<number, Mark> {
  const runtime = useRuntime();
  const { effects } = runtime;
  const seen = useRef<ReadonlyMap<number, Mark> | null>(null);
  const generation = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [landed, setLanded] = useState<ReadonlyMap<number, Mark>>(() => new Map());

  useEffect(() => {
    const prev = seen.current;
    seen.current = new Map(marks);
    if (prev === null || !isSubset(prev, marks)) {
      generation.current += 1;
      if (prev !== null) effects.reset(side);
      for (const [cell, mark] of marks) effects.place(side, cell, mark === "hit");
      setLanded(new Map(marks));
      return;
    }
    const gen = generation.current;
    const timers = pending.current;
    const launch = (cell: number, mark: Mark): void => {
      if (generation.current !== gen) return;
      const hit = mark === "hit";
      runtime.hooks.launch?.(side, cell, hit);
      effects.fly(side, cell, () => {
        if (generation.current !== gen) return;
        effects.land(side, cell, hit);
        if (hit && !runtime.reduced) runtime.shake.energy = Math.max(runtime.shake.energy, side === "mine" ? SHAKE_TAKEN : SHAKE_GIVEN);
        runtime.hooks.land?.(side, cell, hit);
        setLanded((l) => new Map(l).set(cell, mark));
      });
    };
    const queue = (): void => {
      for (const [cell, mark] of addedMarks(prev, marks)) {
        const now = performance.now();
        const start = Math.max(now, runtime.volley.busyUntil);
        runtime.volley.busyUntil = start + (runtime.reduced ? 0 : SHOT_SLOT_MS);
        runtime.hooks.queued?.(start + (runtime.reduced ? 0 : FLIGHT_MS));
        if (start <= now) launch(cell, mark);
        else timers.push(setTimeout(() => launch(cell, mark), start - now));
      }
    };
    if (side === "enemy") queue();
    else timers.push(setTimeout(queue, 0));
  }, [marks, side, effects, runtime]);

  useEffect(() => {
    const timers = pending.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
    };
  }, []);

  return landed;
}
