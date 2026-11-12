import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { isHorizontal, shipCenter } from "./grid";
import { url, useWreckProto } from "./models";
import { useRuntime } from "./runtime";

interface Prop {
  readonly model: string;
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  readonly turn?: number;
  readonly y?: number;
}

const PROPS: readonly Prop[] = [
  { model: "patch-sand", x: -16.5, z: -11, scale: 0.85 },
  { model: "tower-complete-large", x: -17.5, z: -11.8, scale: 0.42, y: 0.1 },
  { model: "palm-straight", x: -15, z: -10.2, scale: 0.55, y: 0.1 },
  { model: "rocks-sand-a", x: -14.2, z: -12.4, scale: 0.42 },
  { model: "patch-grass", x: 15.5, z: -11.5, scale: 1 },
  { model: "palm-bend", x: 14.6, z: -11.2, scale: 0.6, turn: 1.2, y: 0.12 },
  { model: "palm-detailed-straight", x: 16.4, z: -12.2, scale: 0.55, y: 0.12 },
  { model: "structure", x: 15.8, z: -10.4, scale: 0.45, turn: 0.4, y: 0.1 },
  { model: "flag-pirate-high", x: 17.2, z: -11, scale: 0.5, y: 0.1 },
  { model: "rocks-a", x: 0, z: -10.5, scale: 0.45, turn: 0.6 },
  { model: "tower-watch", x: 0.3, z: -10.8, scale: 0.42, y: 0.55 },
  { model: "rocks-b", x: 19, z: -2, scale: 0.5, turn: 2.1 },
  { model: "rocks-c", x: 18, z: 3.5, scale: 0.45, turn: 0.9 },
  { model: "rocks-sand-b", x: -18.5, z: 1.5, scale: 0.5, turn: 1.7 },
  { model: "patch-sand", x: -19, z: -4.5, scale: 0.55, turn: 0.8 },
  { model: "palm-straight", x: -19.2, z: -4.8, scale: 0.5, y: 0.1 },
  { model: "barrel", x: -18.4, z: -3.9, scale: 0.35, y: 0.1 },
  { model: "rocks-c", x: -15.5, z: 9, scale: 0.4, turn: 2.6 },
  { model: "patch-sand", x: 16, z: 9.5, scale: 0.5, turn: 2.2 },
  { model: "chest", x: 15.6, z: 9.3, scale: 0.35, turn: 0.5, y: 0.12 },
  { model: "palm-bend", x: 16.6, z: 9.8, scale: 0.45, turn: 4, y: 0.1 },
  { model: "ship-wreck", x: -7, z: -12.5, scale: 0.3, turn: 0.7, y: -0.35 },
];

const MODELS = [...new Set(PROPS.map((p) => p.model))];

export function Scenery() {
  const scenes = useGLTF(MODELS.map(url), false, false);
  const group = useMemo(() => {
    const byName = new Map(MODELS.map((m, i) => [m, scenes[i]?.scene] as const));
    const g = new THREE.Group();
    for (const p of PROPS) {
      const src = byName.get(p.model);
      if (!src) continue;
      const o = src.clone(true);
      o.scale.setScalar(p.scale);
      o.position.set(p.x, p.y ?? 0, p.z);
      o.rotation.y = p.turn ?? 0;
      g.add(o);
    }
    return g;
  }, [scenes]);
  return <primitive object={group} />;
}

const WRECK_FILL = 1.05;
const WRECK_SINK = 0.16;

function wreckFor(proto: THREE.Object3D, cells: readonly number[]): THREE.Object3D {
  const model = proto.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const alongZ = size.z >= size.x;
  const len = alongZ ? size.z : size.x;
  const scale = (Math.max(1, cells.length) * WRECK_FILL) / len;
  model.scale.setScalar(scale);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x * scale, -box.min.y * scale - WRECK_SINK * scale * size.y, -c.z * scale);
  const inner = new THREE.Group();
  inner.add(model);
  if (alongZ) inner.rotation.y = Math.PI / 2;
  const root = new THREE.Group();
  root.add(inner);
  if (!isHorizontal(cells)) root.rotation.y = Math.PI / 2;
  const at = shipCenter("enemy", cells);
  root.position.set(at.x, 0, at.z);
  root.rotation.z = 0.08;
  return root;
}

export function Wrecks({ ships }: { readonly ships: readonly (readonly number[])[] }) {
  const proto = useWreckProto();
  const { reduced } = useRuntime();
  const shape = JSON.stringify(ships);
  const group = useMemo(() => {
    const g = new THREE.Group();
    for (const cells of JSON.parse(shape) as number[][]) g.add(wreckFor(proto, cells));
    return g;
  }, [proto, shape]);
  useFrame(({ clock }) => {
    if (reduced) return;
    group.children.forEach((c, i) => {
      c.position.y = Math.sin(clock.elapsedTime * 0.8 + i) * 0.04;
    });
  });
  return <primitive object={group} />;
}
