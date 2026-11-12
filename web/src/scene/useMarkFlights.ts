import { useEffect, useRef, useState } from "react";
import { addedMarks } from "./grid";
import { useRuntime } from "./runtime";
import type { Mark, Side } from "./types";

const SHAKE_TAKEN = 1;
const SHAKE_GIVEN = 0.55;

function isSubset(prev: ReadonlyMap<number, Mark>, next: ReadonlyMap<number, Mark>): boolean {
  for (const [cell, mark] of prev) if (next.get(cell) !== mark) return false;
  return true;
}

export function useMarkFlights(side: Side, marks: ReadonlyMap<number, Mark>): ReadonlyMap<number, Mark> {
  const runtime = useRuntime();
  const { effects } = runtime;
  const seen = useRef<ReadonlyMap<number, Mark> | null>(null);
  const generation = useRef(0);
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
    for (const [cell, mark] of addedMarks(prev, marks)) {
      const hit = mark === "hit";
      runtime.hooks.launch?.(side, cell, hit);
      effects.fly(side, cell, () => {
        if (generation.current !== gen) return;
        effects.land(side, cell, hit);
        if (hit && !runtime.reduced) runtime.shake.energy = Math.max(runtime.shake.energy, side === "mine" ? SHAKE_TAKEN : SHAKE_GIVEN);
        runtime.hooks.land?.(side, cell, hit);
        setLanded((l) => new Map(l).set(cell, mark));
      });
    }
  }, [marks, side, effects, runtime]);

  return landed;
}
