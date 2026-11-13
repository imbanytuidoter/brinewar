import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CameraRig } from "./CameraRig";
import { Effects } from "./Effects";
import { Fleet } from "./Fleet";
import { clearWater } from "@/lib/sunk";
import { Spyglass } from "./Spyglass";
import { REVEAL_END, sunkShips } from "./grid";
import { Labels } from "./Labels";
import { preloadModels } from "./models";
import { Picker } from "./Picker";
import { createRuntime, RuntimeContext, useRuntime, type SceneRuntime } from "./runtime";
import { Sea } from "./Sea";
import { layoutFor } from "./layouts";
import { Scenery, Wrecks } from "./Scenery";
import { Gulls } from "./Gulls";
import { MOODS, type Mood } from "./moods";
import { FOG_FAR, FOG_NEAR } from "./seaMaterial";
import type { Hullset, Mark, SeaSceneProps, ShipLook, Side } from "./types";
import { useMarkFlights } from "./useMarkFlights";
import { useReveal } from "./useReveal";

preloadModels();

const EXPOSURE = 1.05;
const NO_SHIPS: readonly (readonly number[])[] = [];
const NO_CELLS: ReadonlySet<number> = new Set();

function skyTexture(colors: readonly [string, string, string]): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 256;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(0.55, colors[1]);
    grad.addColorStop(1, colors[2]);
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Sky({ mood }: { readonly mood: Mood }) {
  const scene = useThree((s) => s.scene);
  const { uniforms } = useRuntime();
  useEffect(() => {
    const tex = skyTexture(mood.sky);
    scene.background = tex;
    uniforms.uDeep.value.set(mood.deep);
    uniforms.uShallow.value.set(mood.shallow);
    uniforms.uFoam.value.set(mood.foam);
    uniforms.uFogColor.value.set(mood.fog);
    return () => {
      scene.background = null;
      tex.dispose();
    };
  }, [scene, mood, uniforms]);
  return <fog attach="fog" args={[mood.fog, FOG_NEAR, FOG_FAR]} />;
}

interface BoardProps {
  readonly side: Side;
  readonly ships: readonly (readonly number[])[];
  readonly marks: ReadonlyMap<number, Mark>;
  readonly look?: ShipLook | null;
  readonly hulls?: Hullset;
  readonly wrecks?: readonly (readonly number[])[] | null;
  readonly aiming?: number | null;
  readonly aimDelayMs?: number;
}

function Board({ side, ships, marks, look = null, hulls = "brine", wrecks = null, aiming = null, aimDelayMs = 0 }: BoardProps) {
  const { effects } = useRuntime();
  const landed = useMarkFlights(side, marks, aiming, aimDelayMs);
  useEffect(() => {
    const flagship = ships.reduce<readonly number[] | null>((best, s) => (!best || s.length > best.length ? s : best), null);
    effects.setOrigin(side, flagship);
  }, [effects, side, ships]);
  useEffect(() => {
    if (side === "mine") effects.setTrail(look?.trail ?? null);
  }, [effects, side, look]);
  const sunk = useMemo(() => sunkShips(ships, landed), [ships, landed]);
  const struck = useMemo(() => (wrecks ?? []).filter((w) => w.every((c) => landed.get(c) === "hit")), [wrecks, landed]);
  const drowned = useMemo(() => (wrecks ? struck : ships.filter((_, i) => sunk[i])), [wrecks, struck, ships, sunk]);
  useEffect(() => {
    effects.setClear(side, clearWater(drowned, landed));
  }, [effects, side, drowned, landed]);
  useEffect(() => () => effects.setClear(side, NO_CELLS), [effects, side]);
  return (
    <>
      <Fleet side={side} ships={ships} sunk={sunk} look={look} hulls={hulls} />
      {struck.length > 0 && <Wrecks ships={struck} />}
    </>
  );
}

const SHAKE_DECAY = 5;
const SHAKE_AMPLITUDE = 0.28;

function Shaker({ children }: { readonly children: React.ReactNode }) {
  const { shake } = useRuntime();
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }, delta) => {
    const g = ref.current;
    if (!g) return;
    shake.energy = Math.max(0, shake.energy - delta * SHAKE_DECAY * Math.max(shake.energy, 0.2));
    const e = shake.energy * shake.energy * SHAKE_AMPLITUDE;
    const t = clock.elapsedTime * 60;
    g.position.set(Math.sin(t * 1.3) * e, Math.sin(t * 1.9 + 1) * e * 0.6, Math.cos(t * 1.1) * e);
  });
  return <group ref={ref}>{children}</group>;
}

function World(props: SeaSceneProps) {
  const runtime = useRuntime();
  useReveal(props.enemyShips !== null);
  const { onLaunch, onLand, onQueued } = props;
  const layout = layoutFor(props.layout ?? null);
  const mood = MOODS[layout.mood ?? "day"];
  useEffect(() => {
    runtime.hooks.launch = onLaunch ?? null;
    runtime.hooks.land = onLand ?? null;
    runtime.hooks.queued = onQueued ?? null;
    return () => {
      runtime.hooks.launch = null;
      runtime.hooks.land = null;
      runtime.hooks.queued = null;
    };
  }, [runtime, onLaunch, onLand, onQueued]);
  return (
    <>
      <Sky mood={mood} />
      <hemisphereLight args={[mood.hemiSky, mood.hemiGround, mood.hemi]} />
      <directionalLight color={mood.sun} intensity={mood.sunPower} position={[...mood.sunAt]} />
      <CameraRig reduced={runtime.reduced} />
      <Shaker>
        <Sea aiming={props.aiming} />
        <Gulls isles={layout.isles} reduced={runtime.reduced} />
        <Labels enemy={props.enemyLabel ?? "The Nauarch"} />
        {props.spyglass && props.spyglass.length > 0 && <Spyglass cells={props.spyglass} locked={props.spyglassLocked ?? false} active={props.spyglassOn ?? true} reducedMotion={runtime.reduced} />}
        <Picker marks={props.enemyMarks} aiming={props.aiming} canFire={props.canFire} onFire={props.onFire} blocked={props.enemyClear ?? NO_CELLS} />
        <Suspense fallback={null}>
          <Effects />
          <Scenery layout={layout} />
          <Board side="mine" ships={props.myShips} marks={props.myMarks} look={props.myLook ?? null} hulls={props.myLook?.hulls ?? "brine"} aimDelayMs={props.aimDelayMs ?? 0} />
          <Board side="enemy" ships={props.enemyShips ?? NO_SHIPS} marks={props.enemyMarks} hulls={props.enemyHulls ?? "pirate"} wrecks={props.enemyShips === null ? props.enemyWrecks : null} aiming={props.aiming ?? null} />
        </Suspense>
      </Shaker>
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
