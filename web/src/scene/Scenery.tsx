import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { isHorizontal, shipCenter } from "./grid";
import { url, useWreckProto } from "./models";
import { setCalmIsles } from "./gerstner";
import type { Layout } from "./layouts";
import { useRuntime } from "./runtime";
import { setIsleUniforms } from "./seaMaterial";

const GROUND = 0.05;

export function Scenery({ layout }: { readonly layout: Layout }) {
  const { uniforms } = useRuntime();
  const models = useMemo(() => [...new Set(layout.props.map((p) => p.model))], [layout]);
  const scenes = useGLTF(models.map(url), false, false);
  useEffect(() => {
    setCalmIsles(layout.isles);
    setIsleUniforms(uniforms, layout.isles);
    return () => {
      setCalmIsles([]);
      setIsleUniforms(uniforms, []);
    };
  }, [layout, uniforms]);
  const group = useMemo(() => {
    const byName = new Map(models.map((m, i) => [m, scenes[i]?.scene] as const));
    const g = new THREE.Group();
    for (const p of layout.props) {
      const src = byName.get(p.model);
      if (!src) continue;
      const o = src.clone(true);
      o.scale.setScalar(p.scale);
      o.position.set(p.x, p.y ?? GROUND, p.z);
      o.rotation.y = p.turn ?? 0;
      g.add(o);
    }
    return g;
  }, [scenes, models, layout]);
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
