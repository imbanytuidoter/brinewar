import { createContext, useContext } from "react";
import { EffectsEngine } from "./effects";
import { makeWaves, type Wave } from "./gerstner";
import { createSeaUniforms, type SeaUniforms } from "./seaMaterial";
import type { ShipActor } from "./ships";
import type { Side } from "./types";

export interface RevealState {
  progress: number;
}

type ShotHook = (side: Side, cell: number, hit: boolean) => void;

export interface ShotHooks {
  launch: ShotHook | null;
  land: ShotHook | null;
  queued: ((settlesAt: number) => void) | null;
}

export interface Shake {
  energy: number;
}

export interface Volley {
  busyUntil: number;
}

export interface SceneRuntime {
  readonly waves: readonly Wave[];
  readonly reduced: boolean;
  readonly uniforms: SeaUniforms;
  readonly effects: EffectsEngine;
  readonly reveal: RevealState;
  readonly ships: Map<string, ShipActor>;
  readonly hooks: ShotHooks;
  readonly shake: Shake;
  readonly volley: Volley;
}

export const shipKey = (side: Side, cell: number): string => `${side}:${cell}`;

export function createRuntime(reduced: boolean): SceneRuntime {
  const waves = makeWaves(reduced);
  const ships = new Map<string, ShipActor>();
  const effects = new EffectsEngine(waves, reduced);
  effects.setLookup((side, cell) => {
    const s = ships.get(shipKey(side, cell));
    if (!s) return null;
    return { y: s.root.position.y, visible: s.root.visible, gone: s.gone };
  });
  return { waves, reduced, uniforms: createSeaUniforms(waves), effects, reveal: { progress: -1 }, ships, hooks: { launch: null, land: null, queued: null }, shake: { energy: 0 }, volley: { busyUntil: 0 } };
}

export const RuntimeContext = createContext<SceneRuntime | null>(null);

export function useRuntime(): SceneRuntime {
  const r = useContext(RuntimeContext);
  if (!r) throw new Error("SeaScene runtime is missing");
  return r;
}
