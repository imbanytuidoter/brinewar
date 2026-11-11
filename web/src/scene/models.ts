import { useGLTF } from "@react-three/drei";
import type * as THREE from "three";
import { MODEL_FOR_LENGTH } from "./grid";

const BASE = "/models/";
const SHIP_MODELS = ["ship-large", "ship-medium", "ship-small", "boat-row-large"] as const;
const BALL = "cannon-ball";

const url = (name: string): string => `${BASE}${name}.glb`;

export function preloadModels(): void {
  for (const n of [...SHIP_MODELS, BALL]) useGLTF.preload(url(n), false, false);
}

export function useShipProtos(): ReadonlyMap<number, THREE.Object3D> {
  const scenes = useGLTF(SHIP_MODELS.map(url), false, false);
  const byName = new Map(SHIP_MODELS.map((n, i) => [n, scenes[i]?.scene] as const));
  const out = new Map<number, THREE.Object3D>();
  for (const [len, name] of Object.entries(MODEL_FOR_LENGTH)) {
    const scene = byName.get(name as (typeof SHIP_MODELS)[number]);
    if (scene) out.set(Number(len), scene);
  }
  return out;
}

export function useBallProto(): THREE.Object3D {
  return useGLTF(url(BALL), false, false).scene;
}
