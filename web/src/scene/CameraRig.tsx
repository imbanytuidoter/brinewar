import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";

const TARGET = new THREE.Vector3(0, 0, 0.5);
const PORTRAIT_TARGET = new THREE.Vector3(-3.5, 0, 0.5);
const UP = new THREE.Vector3(0, 1, 0);
const PORTRAIT_RATIO = 0.9;
const INTRO_SECONDS = 2.6;
const INTRO_SWING = 0.9;
const INTRO_PULL = 0.35;

interface CameraRigProps {
  readonly reduced: boolean;
}

export function targetFor(portrait: boolean): THREE.Vector3 {
  return portrait ? PORTRAIT_TARGET : TARGET;
}

export function homeFor(portrait: boolean): THREE.Vector3 {
  return portrait ? new THREE.Vector3(-23.5, 24, 0.5) : new THREE.Vector3(0, 17, 19);
}

export function CameraRig({ reduced }: CameraRigProps) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const home = useRef<THREE.Vector3 | null>(null);
  const started = useRef<number | null>(null);
  const done = useRef(reduced);
  const offset = useRef(new THREE.Vector3());
  const [target] = useState(() => targetFor(height > 0 && width / height < PORTRAIT_RATIO));

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
    if (done.current || !home.current) return;
    if (started.current === null) started.current = clock.elapsedTime;
    const p = Math.min(1, (clock.elapsedTime - started.current) / INTRO_SECONDS);
    const k = 1 - Math.pow(1 - p, 3);
    offset.current.copy(home.current).sub(target).applyAxisAngle(UP, (1 - k) * INTRO_SWING).multiplyScalar(1 + (1 - k) * INTRO_PULL);
    camera.position.copy(target).add(offset.current);
    if (p >= 1) done.current = true;
  });

  return <OrbitControls makeDefault enableDamping target={target} minDistance={10} maxDistance={48} maxPolarAngle={1.32} />;
}
