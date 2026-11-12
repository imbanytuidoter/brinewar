export type Mark = "hit" | "miss";

export type Side = "mine" | "enemy";

export interface ShipLook {
  readonly sail: string;
  readonly flag: string;
  readonly hull?: string;
  readonly trail?: string;
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
  readonly onLaunch?: (side: Side, cell: number, hit: boolean) => void;
  readonly onLand?: (side: Side, cell: number, hit: boolean) => void;
}
