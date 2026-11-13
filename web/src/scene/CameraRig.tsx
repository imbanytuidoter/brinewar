import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";

const TARGET = new THREE.Vector3(0, 0, 0.5);
const PORTRAIT_TARGET = new THREE.Vector3(-3.5, 0, 0.5);
const UP = new THREE.Vector3(0, 1, 0);
const PORTRAIT_RATIO = 0.9;
const INTRO_SECONDS = 2.6;
const INTRO_SWING = 0.9;
const INTRO_PULL = 0.35;
const FOCUS_SECONDS = 0.9;
const FOCUS_OFFSET = new THREE.Vector3(-13, 20, 0);
const BOARD_CENTRE: Readonly<Record<CameraFocus, THREE.Vector3>> = {
  mine: new THREE.Vector3(-7.2, 0, 0),
  enemy: new THREE.Vector3(4.8, 0, 0),
};

export type CameraFocus = "mine" | "enemy";

interface CameraRigProps {
  readonly reduced: boolean;
  readonly focus?: CameraFocus | null;
}

interface Glide {
  readonly fromPos: THREE.Vector3;
  readonly fromTarget: THREE.Vector3;
  readonly toPos: THREE.Vector3;
  readonly toTarget: THREE.Vector3;
  start: number | null;
}

export function focusView(focus: CameraFocus): { readonly target: THREE.Vector3; readonly position: THREE.Vector3 } {
  const target = BOARD_CENTRE[focus].clone();
  return { target, position: target.clone().add(FOCUS_OFFSET) };
}

export function targetFor(portrait: boolean): THREE.Vector3 {
  return portrait ? PORTRAIT_TARGET : TARGET;
}

export function homeFor(portrait: boolean): THREE.Vector3 {
  return portrait ? new THREE.Vector3(-23.5, 24, 0.5) : new THREE.Vector3(0, 17, 19);
}

export function CameraRig({ reduced, focus = null }: CameraRigProps) {
  const portrait = useThree((s) => s.size.height > 0 && s.size.width / s.size.height < PORTRAIT_RATIO);
  return <FramedRig key={portrait ? "portrait" : "landscape"} reduced={reduced} focus={portrait ? focus : null} />;
}

function FramedRig({ reduced, focus = null }: CameraRigProps) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const home = useRef<THREE.Vector3 | null>(null);
  const started = useRef<number | null>(null);
  const done = useRef(reduced);
  const offset = useRef(new THREE.Vector3());
  const [target] = useState(() => targetFor(height > 0 && width / height < PORTRAIT_RATIO));
  const controls = useRef<OrbitControlsImpl | null>(null);
  const glide = useRef<Glide | null>(null);

  const lastFocus = useRef<CameraFocus | null>(null);

  useEffect(() => {
    if (!home.current || focus === lastFocus.current) return;
    lastFocus.current = focus;
    const goal = focus ? focusView(focus) : { target, position: home.current.clone() };
    const orbit = controls.current;
    glide.current = {
      fromPos: camera.position.clone(),
      fromTarget: orbit ? orbit.target.clone() : target.clone(),
      toPos: goal.position,
      toTarget: goal.target,
      start: null,
    };
    done.current = true;
  }, [focus, camera, target]);

  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || height === 0) return;
    const portrait = width / height < PORTRAIT_RATIO;
    camera.fov = portrait ? 58 : 42;
    camera.updateProjectionMatrix();
    if (!home.current) {
      home.current = homeFor(portrait);
      camera.position.copy(home.current);
      camera.lookAt(target);
    }
  }, [camera, width, height, target]);

  useFrame(({ clock }) => {
    const g = glide.current;
    const orbit = controls.current;
    if (g && orbit) {
      if (g.start === null) g.start = clock.elapsedTime;
      const p = reduced ? 1 : Math.min(1, (clock.elapsedTime - g.start) / FOCUS_SECONDS);
      const k = 1 - Math.pow(1 - p, 3);
      camera.position.lerpVectors(g.fromPos, g.toPos, k);
      orbit.target.lerpVectors(g.fromTarget, g.toTarget, k);
      orbit.update();
      if (p >= 1) glide.current = null;
      return;
    }
    if (done.current || !home.current) return;
    if (started.current === null) started.current = clock.elapsedTime;
    const p = Math.min(1, (clock.elapsedTime - started.current) / INTRO_SECONDS);
    const k = 1 - Math.pow(1 - p, 3);
    offset.current.copy(home.current).sub(target).applyAxisAngle(UP, (1 - k) * INTRO_SWING).multiplyScalar(1 + (1 - k) * INTRO_PULL);
    camera.position.copy(target).add(offset.current);
    if (p >= 1) done.current = true;
  });

  return <OrbitControls ref={controls} makeDefault enableDamping target={target} minDistance={10} maxDistance={48} maxPolarAngle={1.32} />;
}
