import type * as THREE from "three";

export type Mark = "hit" | "miss";

export type Side = "mine" | "enemy";

export type Hullset = "brine" | "pirate";

export type Rig = "plain" | "pennants" | "cannons" | "banners" | "warship" | "ghost";

export interface ShipParts {
  readonly cannon: THREE.Object3D;
  readonly pennant: THREE.Object3D;
  readonly banner: THREE.Object3D;
}

export interface ShipFinish {
  readonly metal: number;
  readonly rough: number;
  readonly glow: string;
  readonly glowPower: number;
  readonly sailGlow?: number;
}

export type LightSpot = "lanterns" | "mastheads";

export interface ShipLights {
  readonly color: string;
  readonly at: readonly LightSpot[];
  readonly flicker?: boolean;
}

export interface ShipAura {
  readonly color: string;
  readonly rate: number;
}

export interface ShipLook {
  readonly hulls?: Hullset;
  readonly rig?: Rig;
  readonly sail: string;
  readonly flag: string;
  readonly hull?: string;
  readonly trail?: string;
  readonly finish?: ShipFinish;
  readonly lights?: ShipLights;
  readonly aura?: ShipAura;
}

export interface SeaSceneProps {
  readonly myShips: readonly (readonly number[])[];
  readonly myMarks: ReadonlyMap<number, Mark>;
  readonly enemyMarks: ReadonlyMap<number, Mark>;
  readonly enemyShips: readonly (readonly number[])[] | null;
  readonly aiming: number | null;
  readonly canFire: boolean;
  readonly reducedMotion: boolean;
  readonly onFire: (index: number) => void;
  readonly myLook?: ShipLook | null;
  readonly enemyLabel?: string;
  readonly enemyHulls?: Hullset;
  readonly layout?: number | null;
  readonly enemyWrecks?: readonly (readonly number[])[];
  readonly enemyClear?: ReadonlySet<number>;
  readonly spyglass?: readonly number[] | null;
  readonly spyglassLocked?: boolean;
  readonly spyglassOn?: boolean;
  readonly aimDelayMs?: number;
  readonly onLaunch?: (side: Side, cell: number, hit: boolean) => void;
  readonly onLand?: (side: Side, cell: number, hit: boolean) => void;
  readonly onQueued?: (settlesAt: number) => void;
}
