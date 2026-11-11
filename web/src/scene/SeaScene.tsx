import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CameraRig } from "./CameraRig";
import { Effects } from "./Effects";
import { Fleet } from "./Fleet";
import { REVEAL_END, sunkShips } from "./grid";
import { Labels } from "./Labels";
import { preloadModels } from "./models";
import { Picker } from "./Picker";
import { createRuntime, RuntimeContext, useRuntime, type SceneRuntime } from "./runtime";
import { Sea } from "./Sea";
import { FOG_FAR, FOG_NEAR, SEA_FOG } from "./seaMaterial";
import type { Mark, SeaSceneProps, Side } from "./types";
import { useMarkFlights } from "./useMarkFlights";
import { useReveal } from "./useReveal";

preloadModels();

const EXPOSURE = 1.05;
const NO_SHIPS: readonly (readonly number[])[] = [];

function skyTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 256;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#3d8fd0");
    grad.addColorStop(0.55, "#9ad6ff");
    grad.addColorStop(1, "#e9f6ff");
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Sky() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const tex = skyTexture();
    scene.background = tex;
    return () => {
      scene.background = null;
      tex.dispose();
    };
  }, [scene]);
  return <fog attach="fog" args={[SEA_FOG, FOG_NEAR, FOG_FAR]} />;
}

interface BoardProps {
  readonly side: Side;
  readonly ships: readonly (readonly number[])[];
  readonly marks: ReadonlyMap<number, Mark>;
}

function Board({ side, ships, marks }: BoardProps) {
  const landed = useMarkFlights(side, marks);
  const sunk = useMemo(() => sunkShips(ships, landed), [ships, landed]);
  return <Fleet side={side} ships={ships} sunk={sunk} />;
}

function World(props: SeaSceneProps) {
  const runtime = useRuntime();
  useReveal(props.enemyShips !== null);
  return (
    <>
      <Sky />
      <hemisphereLight args={[0xdff4ff, 0x2b6b80, 1.35]} />
      <directionalLight color={0xfff1d6} intensity={2.4} position={[-14, 22, 12]} />
      <Sea aiming={props.aiming} />
      <Labels />
      <CameraRig reduced={runtime.reduced} />
      <Picker marks={props.enemyMarks} aiming={props.aiming} canFire={props.canFire} onFire={props.onFire} />
      <Suspense fallback={null}>
        <Effects />
        <Board side="mine" ships={props.myShips} marks={props.myMarks} />
        <Board side="enemy" ships={props.enemyShips ?? NO_SHIPS} marks={props.enemyMarks} />
      </Suspense>
    </>
  );
}

export function SeaScene(props: SeaSceneProps) {
  const reducedAtMount = useRef(props.reducedMotion);
  const revealedAtMount = useRef(props.enemyShips !== null);
  const [runtime, setRuntime] = useState<SceneRuntime | null>(null);

  useEffect(() => {
    const r = createRuntime(reducedAtMount.current);
    if (revealedAtMount.current) r.reveal.progress = REVEAL_END;
    setRuntime(r);
    return () => r.effects.dispose();
  }, []);

  if (!runtime) return null;

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 42, near: 0.1, far: 300, position: [0, 17, 19] }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = EXPOSURE;
      }}
      style={{ position: "absolute", inset: 0, touchAction: "none" }}
    >
      <RuntimeContext.Provider value={runtime}>
        <World {...props} />
      </RuntimeContext.Provider>
    </Canvas>
  );
}
