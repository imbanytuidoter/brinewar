import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { REVEAL_END } from "./grid";
import { useShipProtos } from "./models";
import { shipKey, useRuntime } from "./runtime";
import { ShipActor } from "./ships";
import type { Hullset, ShipLook, Side } from "./types";

interface FleetProps {
  readonly side: Side;
  readonly ships: readonly (readonly number[])[];
  readonly sunk: readonly boolean[];
  readonly look?: ShipLook | null;
  readonly hulls?: Hullset;
}

export function Fleet({ side, ships, sunk, look = null, hulls = "brine" }: FleetProps) {
  const runtime = useRuntime();
  const protos = useShipProtos(hulls);
  const shape = JSON.stringify(ships);

  const actors = useMemo(() => {
    const risen = runtime.reveal.progress >= REVEAL_END;
    const fleet = JSON.parse(shape) as number[][];
    return fleet.flatMap((cells) => {
      const proto = protos.get(cells.length);
      return proto ? [new ShipActor(proto, cells, side, risen)] : [];
    });
  }, [shape, protos, side, runtime]);

  useEffect(() => {
    for (const a of actors) for (const c of a.cells) runtime.ships.set(shipKey(side, c), a);
    return () => {
      for (const a of actors) {
        for (const c of a.cells) if (runtime.ships.get(shipKey(side, c)) === a) runtime.ships.delete(shipKey(side, c));
        a.dispose();
      }
    };
  }, [actors, runtime, side]);

  useEffect(() => {
    if (side === "mine") for (const a of actors) a.setLook(look);
  }, [actors, side, look]);

  useEffect(() => {
    actors.forEach((a, i) => {
      a.sunk = sunk[i] ?? false;
    });
  }, [actors, sunk]);

  useFrame(({ clock }, delta) => {
    const frame = {
      t: clock.elapsedTime,
      dt: Math.min(delta, 0.05),
      waves: runtime.waves,
      reduced: runtime.reduced,
      reveal: runtime.reveal.progress,
      bubble: (x: number, z: number) => runtime.effects.emitBubble(x, z),
    };
    for (const a of actors) a.update(frame);
  });

  return (
    <>
      {actors.map((a, i) => (
        <primitive key={i} object={a.root} />
      ))}
    </>
  );
}
