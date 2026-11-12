import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ShipLook } from "./types";

export const MODEL_FOR_RANK: Readonly<Record<string, string>> = {
  Ensign: "ship-small",
  Lieutenant: "ship-medium",
  Captain: "ship-large",
  Commodore: "ship-large",
  Admiral: "ship-large",
};
const SAIL = /sail/;
const FLAG = /flag/;
const DEFAULT_FLAG = "#3fb6c9";
const SPIN = 0.25;

export interface FlagshipViewerProps {
  readonly rank: string;
  readonly look: ShipLook | null;
  readonly reducedMotion: boolean;
}

function Ship({ rank, look, reducedMotion }: FlagshipViewerProps) {
  const name = MODEL_FOR_RANK[rank] ?? "ship-small";
  const { scene } = useGLTF(`/models/${name}.glb`, false, false);
  const group = useRef<THREE.Group>(null);
  const { model, sails, flags, hulls, sailBase, hullBase } = useMemo(() => {
    const m = scene.clone(true);
    const s: THREE.MeshStandardMaterial[] = [];
    const f: THREE.MeshStandardMaterial[] = [];
    const h: THREE.MeshStandardMaterial[] = [];
    let base = new THREE.Color("#ffffff");
    let hullTone = new THREE.Color("#ffffff");
    m.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
      const mat = (o.material as THREE.Material).clone();
      o.material = mat;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;
      if (FLAG.test(o.name)) f.push(mat);
      else if (SAIL.test(o.name)) {
        base = mat.color.clone();
        s.push(mat);
      } else {
        hullTone = mat.color.clone();
        h.push(mat);
      }
    });
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const scale = 2.6 / Math.max(size.x, size.y, size.z);
    m.scale.setScalar(scale);
    const c = box.getCenter(new THREE.Vector3());
    m.position.set(-c.x * scale, -box.min.y * scale - 0.25, -c.z * scale);
    return { model: m, sails: s, flags: f, hulls: h, sailBase: base, hullBase: hullTone };
  }, [scene]);

  useEffect(() => {
    for (const m of sails) m.color.copy(look ? new THREE.Color(look.sail) : sailBase);
    for (const m of flags) m.color.set(look ? look.flag : DEFAULT_FLAG);
    for (const m of hulls) m.color.copy(look?.hull ? new THREE.Color(look.hull) : hullBase);
  }, [sails, flags, hulls, sailBase, hullBase, look]);

  useEffect(
    () => () => {
      model.traverse((o) => {
        if (o instanceof THREE.Mesh && !Array.isArray(o.material)) (o.material as THREE.Material).dispose();
      });
    },
    [model],
  );

  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (!g || reducedMotion) return;
    g.rotation.y += dt * SPIN;
    const t = clock.elapsedTime;
    g.position.y = Math.sin(t * 1.3) * 0.06;
    g.rotation.z = Math.sin(t * 0.9) * 0.04;
  });

  return (
    <group ref={group} rotation-y={-0.6}>
      <primitive object={model} />
    </group>
  );
}

function Water() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.08}>
      <circleGeometry args={[2.6, 64]} />
      <meshStandardMaterial color="#1f6f8f" roughness={0.35} metalness={0.1} transparent opacity={0.9} />
    </mesh>
  );
}

export default function FlagshipViewer(props: FlagshipViewerProps) {
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 30, position: [6.4, 3.4, 6.4] }} style={{ position: "absolute", inset: 0 }} onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)}>
      <hemisphereLight args={[0xdff4ff, 0x2b6b80, 1.4]} />
      <directionalLight color={0xfff1d6} intensity={2.4} position={[-6, 9, 5]} />
      <Suspense fallback={null}>
        <Ship {...props} />
      </Suspense>
      <Water />
    </Canvas>
  );
}
