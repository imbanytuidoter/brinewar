import { useEffect, useRef, useState } from "react";
import { addedMarks } from "./grid";
import { useRuntime } from "./runtime";
import type { Mark, Side } from "./types";

const SHAKE_TAKEN = 1;
const SHAKE_GIVEN = 0.55;
const SHOT_SLOT_MS = 1400;
const FLIGHT_MS = 1150;

type Early = "flying" | "waiting";

function isSubset(prev: ReadonlyMap<number, Mark>, next: ReadonlyMap<number, Mark>): boolean {
  for (const [cell, mark] of prev) if (next.get(cell) !== mark) return false;
  return true;
}

export function useMarkFlights(side: Side, marks: ReadonlyMap<number, Mark>, aiming: number | null = null, aimDelayMs = 0): ReadonlyMap<number, Mark> {
  const runtime = useRuntime();
  const { effects } = runtime;
  const seen = useRef<ReadonlyMap<number, Mark> | null>(null);
  const generation = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout>[]>([]);
  const early = useRef(new Map<number, Early>());
  const [landed, setLanded] = useState<ReadonlyMap<number, Mark>>(() => new Map());

  const settle = (cell: number, mark: Mark): void => {
    const hit = mark === "hit";
    effects.land(side, cell, hit);
    if (hit && !runtime.reduced) runtime.shake.energy = Math.max(runtime.shake.energy, side === "mine" ? SHAKE_TAKEN : SHAKE_GIVEN);
    runtime.hooks.land?.(side, cell, hit);
    setLanded((l) => new Map(l).set(cell, mark));
  };

  useEffect(() => {
    if (side !== "enemy" || aiming === null || early.current.has(aiming) || seen.current?.has(aiming)) return;
    const gen = generation.current;
    const cell = aiming;
    early.current.set(cell, "flying");
    const now = performance.now();
    runtime.volley.busyUntil = Math.max(runtime.volley.busyUntil, now + (runtime.reduced ? 0 : SHOT_SLOT_MS));
    runtime.hooks.launch?.(side, cell, false);
    effects.fly(
      side,
      cell,
      () => {
        if (generation.current !== gen) return;
        const mark = seen.current?.get(cell);
        if (mark) {
          early.current.delete(cell);
          settle(cell, mark);
        } else early.current.set(cell, "waiting");
      },
      () => generation.current === gen && !seen.current?.has(cell),
    );
  });

  useEffect(() => {
    const prev = seen.current;
    seen.current = new Map(marks);
    if (prev === null || !isSubset(prev, marks)) {
      generation.current += 1;
      early.current.clear();
      if (prev !== null) effects.reset(side);
      for (const [cell, mark] of marks) effects.place(side, cell, mark === "hit");
      setLanded(new Map(marks));
      return;
    }
    const gen = generation.current;
    const timers = pending.current;
    const launch = (cell: number, mark: Mark): void => {
      if (generation.current !== gen) return;
      runtime.hooks.launch?.(side, cell, mark === "hit");
      effects.fly(side, cell, () => {
        if (generation.current !== gen) return;
        settle(cell, mark);
      });
    };
    const queue = (): void => {
      for (const [cell, mark] of addedMarks(prev, marks)) {
        const now = performance.now();
        const state = early.current.get(cell);
        if (state === "flying") continue;
        if (state === "waiting") {
          early.current.delete(cell);
          runtime.volley.busyUntil = Math.max(runtime.volley.busyUntil, now + (runtime.reduced ? 0 : SHOT_SLOT_MS - FLIGHT_MS));
          settle(cell, mark);
          continue;
        }
        const start = Math.max(now, runtime.volley.busyUntil);
        runtime.volley.busyUntil = start + (runtime.reduced ? 0 : SHOT_SLOT_MS);
        runtime.hooks.queued?.(start + (runtime.reduced ? 0 : FLIGHT_MS));
        if (start <= now) launch(cell, mark);
        else timers.push(setTimeout(() => launch(cell, mark), start - now));
      }
    };
    if (side === "enemy") queue();
    else timers.push(setTimeout(queue, runtime.reduced ? 0 : aimDelayMs));
  }, [marks, side, effects, runtime, aimDelayMs]);

  useEffect(() => {
    const timers = pending.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
    };
  }, []);

  return landed;
}
