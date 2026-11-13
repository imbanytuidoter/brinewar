import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { cellCenter } from "./grid";

const STEP_S = 0.55;
const GLIDE = 9;
const HEIGHT = 0.16;
const COLOR = 0xff6a3d;

interface SpyglassProps {
  readonly cells: readonly number[];
  readonly reducedMotion: boolean;
}

export function Spyglass({ cells, reducedMotion }: SpyglassProps) {
  const group = useRef<THREE.Group>(null);
  const started = useRef<number | null>(null);
  const ring = useMemo(() => new THREE.RingGeometry(0.34, 0.46, 40), []);
  const lens = useMemo(() => new THREE.CircleGeometry(0.34, 40), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.9, depthTest: false }), []);
  const lensMat = useMemo(() => new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.18, depthTest: false }), []);

  useEffect(
    () => () => {
      ring.dispose();
      lens.dispose();
      ringMat.dispose();
      lensMat.dispose();
    },
    [ring, lens, ringMat, lensMat],
  );

  useEffect(() => {
    started.current = null;
    const first = cells[0];
    if (first === undefined || !group.current) return;
    const c = cellCenter("mine", first);
    group.current.position.set(c.x, HEIGHT, c.z);
  }, [cells]);

  useFrame(({ clock }, delta) => {
    const g = group.current;
    if (!g || cells.length === 0) return;
    if (started.current === null) started.current = clock.elapsedTime;
    const step = reducedMotion ? 0 : Math.floor((clock.elapsedTime - started.current) / STEP_S) % cells.length;
    const c = cellCenter("mine", cells[step] as number);
    const k = reducedMotion ? 1 : 1 - Math.exp(-GLIDE * delta);
    g.position.x += (c.x - g.position.x) * k;
    g.position.z += (c.z - g.position.z) * k;
    const pulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 6) * 0.06;
    g.scale.setScalar(pulse);
  });

  if (cells.length === 0) return null;
  return (
    <group ref={group} renderOrder={3}>
      <mesh geometry={ring} material={ringMat} rotation-x={-Math.PI / 2} renderOrder={3} />
      <mesh geometry={lens} material={lensMat} rotation-x={-Math.PI / 2} renderOrder={3} />
    </group>
  );
}
