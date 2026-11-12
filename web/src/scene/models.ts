import { useGLTF } from "@react-three/drei";
import type * as THREE from "three";
import type { Hullset } from "./types";

const BASE = "/models/";
const BALL = "cannon-ball";
const WRECK = "ship-wreck";

export const HULLSETS: Readonly<Record<Hullset, Readonly<Record<number, string>>>> = {
  brine: { 4: "ship-large", 3: "ship-medium", 2: "ship-small", 1: "boat-row-large" },
  pirate: { 4: "ship-pirate-large", 3: "ship-pirate-medium", 2: "ship-pirate-small", 1: "boat-row-small" },
};

const SHIP_MODELS = [...new Set(Object.values(HULLSETS).flatMap((set) => Object.values(set)))];

export const url = (name: string): string => `${BASE}${name}.glb`;

export function preloadModels(): void {
  for (const n of [...SHIP_MODELS, BALL, WRECK]) useGLTF.preload(url(n), false, false);
}

export function useShipProtos(set: Hullset = "brine"): ReadonlyMap<number, THREE.Object3D> {
  const scenes = useGLTF(SHIP_MODELS.map(url), false, false);
  const byName = new Map(SHIP_MODELS.map((n, i) => [n, scenes[i]?.scene] as const));
  const out = new Map<number, THREE.Object3D>();
  for (const [len, name] of Object.entries(HULLSETS[set])) {
    const scene = byName.get(name);
    if (scene) out.set(Number(len), scene);
  }
  return out;
}

export function useBallProto(): THREE.Object3D {
  return useGLTF(url(BALL), false, false).scene;
}

export function useWreckProto(): THREE.Object3D {
  return useGLTF(url(WRECK), false, false).scene;
}
