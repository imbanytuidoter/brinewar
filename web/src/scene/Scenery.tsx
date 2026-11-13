import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { isHorizontal, shipCenter } from "./grid";
import { url, useWreckProto } from "./models";
import { setCalmIsles } from "./gerstner";
import type { Layout, Prop } from "./layouts";
import { useRuntime } from "./runtime";
import { setIsleUniforms } from "./seaMaterial";

const GROUND = 0.05;

const BOB_HEIGHT = 0.06;
const BOB_ROLL = 0.05;
const TURN_SECONDS = 2.4;
const BOW = 0;

interface Mover {
  readonly o: THREE.Object3D;
  readonly prop: Prop;
  readonly baseY: number;
  readonly phase: number;
}

function heading(dir: number): number {
  return BOW + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
}

function patrolAt(t: number, from: number, to: number, speed: number): { x: number; turn: number } {
  const span = Math.abs(to - from);
  const leg = span / speed;
  const cycle = 2 * (leg + TURN_SECONDS);
  const k = ((t % cycle) + cycle) % cycle;
  const ease = (u: number): number => u * u * (3 - 2 * u);
  const dir = Math.sign(to - from) || 1;
  if (k < leg) return { x: from + dir * span * ease(k / leg), turn: heading(dir) };
  if (k < leg + TURN_SECONDS) return { x: to, turn: heading(dir) + Math.PI * ease((k - leg) / TURN_SECONDS) };
  if (k < 2 * leg + TURN_SECONDS) return { x: to - dir * span * ease((k - leg - TURN_SECONDS) / leg), turn: heading(-dir) };
  return { x: from, turn: heading(-dir) + Math.PI * ease((k - 2 * leg - TURN_SECONDS) / TURN_SECONDS) };
}

function sailAt(t: number, from: number, to: number, speed: number, phase: number): { x: number; turn: number } {
  const span = to - from;
  const along = (((t * speed + phase) % Math.abs(span)) + Math.abs(span)) % Math.abs(span);
  return { x: from + Math.sign(span) * along, turn: heading(Math.sign(span)) };
}

export function Scenery({ layout }: { readonly layout: Layout }) {
  const { uniforms, reduced } = useRuntime();
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
  const { group, movers } = useMemo(() => {
    const byName = new Map(models.map((m, i) => [m, scenes[i]?.scene] as const));
    const g = new THREE.Group();
    const moving: Mover[] = [];
    layout.props.forEach((p, i) => {
      const src = byName.get(p.model);
      if (!src) return;
      const o = src.clone(true);
      o.scale.setScalar(p.scale);
      o.position.set(p.x, p.y ?? GROUND, p.z);
      o.rotation.y = p.turn ?? 0;
      g.add(o);
      if (p.motion) moving.push({ o, prop: p, baseY: p.y ?? GROUND, phase: i * 1.7 });
    });
    return { group: g, movers: moving };
  }, [scenes, models, layout]);
  useFrame(({ clock }) => {
    if (reduced) return;
    const t = clock.elapsedTime;
    for (const m of movers) {
      const motion = m.prop.motion;
      if (!motion) continue;
      m.o.position.y = m.baseY + Math.sin(t * 0.9 + m.phase) * BOB_HEIGHT;
      m.o.rotation.z = Math.sin(t * 0.7 + m.phase) * BOB_ROLL;
      m.o.rotation.x = Math.sin(t * 0.55 + m.phase * 0.5) * BOB_ROLL * 0.6;
      if (motion.kind === "bob") continue;
      const at = motion.kind === "patrol" ? patrolAt(t + m.phase, motion.from, motion.to, motion.speed) : sailAt(t, motion.from, motion.to, motion.speed, motion.phase ?? 0);
      m.o.position.x = at.x;
      m.o.rotation.y = at.turn + (m.prop.turn ?? 0);
    }
  });
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
