import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CalmIsle } from "./gerstner";

const PER_ISLE = 2;
const SPAN = 0.55;
const CHORD = 0.13;
const FLAP_SPEED = 8.5;

interface Gull {
  readonly cx: number;
  readonly cz: number;
  readonly r: number;
  readonly h: number;
  readonly speed: number;
  readonly phase: number;
  readonly dir: 1 | -1;
}

function wing(side: 1 | -1): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, CHORD, 0, 0, -CHORD, side * SPAN, 0.04, -CHORD * 0.6], 3));
  g.computeVertexNormals();
  return g;
}

export function Gulls({ isles, reduced }: { readonly isles: readonly CalmIsle[]; readonly reduced: boolean }) {
  const flock = useMemo<Gull[]>(
    () =>
      [...isles]
        .sort((a, b) => b.r - a.r)
        .slice(0, 3)
        .flatMap((isle, i) =>
          Array.from({ length: PER_ISLE }, (_, j): Gull => ({
            cx: isle.x,
            cz: isle.z,
            r: isle.r + 1.2 + j * 1.1,
            h: 3.4 + j * 0.7 + (i % 2) * 0.5,
            speed: 0.32 + j * 0.09,
            phase: i * 2.1 + j * 3.3,
            dir: j % 2 === 0 ? 1 : -1,
          })),
        ),
    [isles],
  );
  const left = useMemo(() => wing(-1), []);
  const right = useMemo(() => wing(1), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#f5f8fb", side: THREE.DoubleSide }), []);
  useEffect(
    () => () => {
      left.dispose();
      right.dispose();
      mat.dispose();
    },
    [left, right, mat],
  );
  const groups = useRef<(THREE.Group | null)[]>([]);
  const wings = useRef<{ l: THREE.Mesh | null; r: THREE.Mesh | null }[]>([]);

  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime;
    flock.forEach((b, i) => {
      const g = groups.current[i];
      const w = wings.current[i];
      if (!g || !w) return;
      const a = b.phase + t * b.speed * b.dir;
      g.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 1.3 + b.phase) * 0.18, b.cz + Math.sin(a) * b.r);
      g.rotation.y = Math.atan2(-Math.sin(a) * b.dir, Math.cos(a) * b.dir);
      g.rotation.z = -0.25 * b.dir;
      const flap = 0.35 + 0.5 * Math.sin(t * FLAP_SPEED + b.phase);
      if (w.l) w.l.rotation.z = -flap;
      if (w.r) w.r.rotation.z = flap;
    });
  });

  return (
    <>
      {flock.map((b, i) => (
        <group key={`${b.cx}:${b.cz}:${i}`} ref={(el) => void (groups.current[i] = el)}>
          <mesh geometry={left} material={mat} ref={(el) => void ((wings.current[i] ??= { l: null, r: null }).l = el)} />
          <mesh geometry={right} material={mat} ref={(el) => void ((wings.current[i] ??= { l: null, r: null }).r = el)} />
        </group>
      ))}
    </>
  );
}
