import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { cellCenter } from "./grid";

const CELLS_PER_SECOND = 2.6;
const DWELL_S = 0.45;
const LOCK_TRAVEL_S = 0.45;
const HEIGHT = 0.16;
const COLOR = 0xff6a3d;

interface SpyglassProps {
  readonly cells: readonly number[];
  readonly locked: boolean;
  readonly active: boolean;
  readonly reducedMotion: boolean;
}

const dist = (a: number, b: number): number => Math.hypot((a % 10) - (b % 10), Math.floor(a / 10) - Math.floor(b / 10));

export function sweepRoute(cells: readonly number[], from: number | null): number[] {
  const left = [...new Set(cells)];
  const route: number[] = [];
  let at = from ?? left[0] ?? null;
  while (left.length > 0 && at !== null) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (dist(at, left[i] as number) < dist(at, left[best] as number)) best = i;
    at = left.splice(best, 1)[0] as number;
    route.push(at);
  }
  return route;
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

interface Leg {
  from: THREE.Vector2;
  to: THREE.Vector2;
  start: number;
  travel: number;
  index: number;
}

export function Spyglass({ cells, locked, active, reducedMotion }: SpyglassProps) {
  const group = useRef<THREE.Group>(null);
  const leg = useRef<Leg | null>(null);
  const key = cells.join(",");
  const route = useMemo(() => sweepRoute(key ? key.split(",").map(Number) : [], null), [key]);
  const ring = useMemo(() => new THREE.RingGeometry(0.3, 0.5, 48), []);
  const lens = useMemo(() => new THREE.CircleGeometry(0.3, 48), []);
  const hair = useMemo(() => new THREE.PlaneGeometry(0.9, 0.05), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.9, depthTest: false }), []);
  const lensMat = useMemo(() => new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.3, depthTest: false }), []);

  useEffect(
    () => () => {
      ring.dispose();
      lens.dispose();
      hair.dispose();
      ringMat.dispose();
      lensMat.dispose();
    },
    [ring, lens, hair, ringMat, lensMat],
  );

  useEffect(() => {
    leg.current = null;
  }, [route, active]);

  useFrame(({ clock }) => {
    const g = group.current;
    const first = route[0];
    if (!g || first === undefined) return;
    if (!active) {
      g.visible = false;
      return;
    }
    const now = clock.elapsedTime;
    if (leg.current === null) {
      const c = cellCenter("mine", first);
      const here = g.position.lengthSq() > 0 ? new THREE.Vector2(g.position.x, g.position.z) : new THREE.Vector2(c.x, c.z);
      const span = here.distanceTo(new THREE.Vector2(c.x, c.z)) / CELLS_PER_SECOND;
      leg.current = { from: here, to: new THREE.Vector2(c.x, c.z), start: now, travel: reducedMotion ? 0 : locked ? Math.min(span, LOCK_TRAVEL_S) : span, index: 0 };
    }
    const l = leg.current;
    const p = l.travel <= 0 ? 1 : Math.min(1, (now - l.start) / l.travel);
    const e = ease(p);
    g.position.set(THREE.MathUtils.lerp(l.from.x, l.to.x, e), HEIGHT, THREE.MathUtils.lerp(l.from.y, l.to.y, e));
    g.visible = true;
    const arrived = now - l.start >= l.travel;
    g.scale.setScalar(reducedMotion ? 1 : locked && arrived ? 0.82 + Math.max(0, 0.3 - (now - l.start - l.travel)) : 1 + Math.sin(now * 5) * 0.05);
    if (reducedMotion || locked || now - l.start < l.travel + DWELL_S) return;
    const index = (l.index + 1) % route.length;
    const c = cellCenter("mine", route[index] as number);
    const to = new THREE.Vector2(c.x, c.z);
    leg.current = { from: l.to.clone(), to, start: now, travel: l.to.distanceTo(to) / CELLS_PER_SECOND, index };
  });

  if (route.length === 0) return null;
  return (
    <group ref={group} visible={false}>
      <mesh geometry={ring} material={ringMat} rotation-x={-Math.PI / 2} renderOrder={3} />
      <mesh geometry={lens} material={lensMat} rotation-x={-Math.PI / 2} renderOrder={3} />
      <mesh geometry={hair} material={ringMat} rotation-x={-Math.PI / 2} renderOrder={3} />
      <mesh geometry={hair} material={ringMat} rotation={[-Math.PI / 2, 0, Math.PI / 2]} renderOrder={3} />
    </group>
  );
}
