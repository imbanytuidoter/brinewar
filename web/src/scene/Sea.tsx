import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { cellCenter } from "./grid";
import { useRuntime } from "./runtime";
import { createSeaMaterial, OFF_BOARD } from "./seaMaterial";

const SEA_SIZE = 220;
const SEA_SEGMENTS = 260;

interface SeaProps {
  readonly aiming: number | null;
}

export function Sea({ aiming }: SeaProps) {
  const { uniforms, reveal } = useRuntime();
  const geometry = useMemo(() => new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEGMENTS, SEA_SEGMENTS), []);
  const material = useMemo(() => createSeaMaterial(uniforms), [uniforms]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useEffect(() => {
    if (aiming === null) {
      uniforms.uAim.value.set(OFF_BOARD, OFF_BOARD);
      return;
    }
    const c = cellCenter("enemy", aiming);
    uniforms.uAim.value.set(c.x, c.z);
  }, [aiming, uniforms]);

  useFrame(({ clock, camera }) => {
    uniforms.uTime.value = clock.elapsedTime;
    uniforms.uCam.value.copy(camera.position);
    uniforms.uFogReveal.value = reveal.progress < 0 ? -0.2 : reveal.progress;
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
