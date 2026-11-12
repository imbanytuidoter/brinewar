import type { CalmIsle } from "./gerstner";

export interface Prop {
  readonly model: string;
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  readonly turn?: number;
  readonly y?: number;
}

export interface Layout {
  readonly name: string;
  readonly props: readonly Prop[];
  readonly isles: readonly CalmIsle[];
}

const ON_SAND = 0.2;

const walls = (from: number, to: number, z: number, step: number): Prop[] => {
  const out: Prop[] = [];
  for (let x = from; x <= to + 0.001; x += step) if (Math.abs(x) > 1.2) out.push({ model: "castle-wall", x, z, scale: 0.6 });
  return out;
};

export const LAYOUTS: readonly Layout[] = [
  {
    name: "Tropical cove",
    props: [
      { model: "patch-sand", x: -16.5, z: -11, scale: 0.85 },
      { model: "tower-complete-large", x: -17.5, z: -11.8, scale: 0.42, y: ON_SAND },
      { model: "palm-straight", x: -15, z: -10.2, scale: 0.55, y: ON_SAND },
      { model: "rocks-sand-a", x: -14.2, z: -12.4, scale: 0.42, y: 0.1 },
      { model: "patch-grass-foliage", x: 15.5, z: -11.5, scale: 1 },
      { model: "palm-bend", x: 14.6, z: -11.2, scale: 0.6, turn: 1.2, y: ON_SAND },
      { model: "palm-detailed-straight", x: 16.4, z: -12.2, scale: 0.55, y: ON_SAND },
      { model: "structure", x: 15.8, z: -10.4, scale: 0.45, turn: 0.4, y: ON_SAND },
      { model: "flag-pirate-high", x: 17.2, z: -11, scale: 0.5, y: ON_SAND },
      { model: "rocks-a", x: 0, z: -10.5, scale: 0.45, turn: 0.6 },
      { model: "tower-watch", x: 0.3, z: -10.8, scale: 0.42, y: 0.9 },
      { model: "rocks-b", x: 19, z: -2, scale: 0.5, turn: 2.1 },
      { model: "rocks-c", x: 18, z: 3.5, scale: 0.45, turn: 0.9 },
      { model: "rocks-sand-b", x: -18.5, z: 1.5, scale: 0.5, turn: 1.7 },
      { model: "patch-sand-foliage", x: -19, z: -4.5, scale: 0.55, turn: 0.8 },
      { model: "palm-straight", x: -19.2, z: -4.8, scale: 0.5, y: ON_SAND },
      { model: "barrel", x: -18.4, z: -3.9, scale: 0.35, y: ON_SAND },
      { model: "rocks-c", x: -15.5, z: 9, scale: 0.4, turn: 2.6 },
      { model: "patch-sand", x: 16, z: 9.5, scale: 0.5, turn: 2.2 },
      { model: "chest", x: 15.6, z: 9.3, scale: 0.35, turn: 0.5, y: ON_SAND },
      { model: "palm-bend", x: 16.6, z: 9.8, scale: 0.45, turn: 4, y: ON_SAND },
      { model: "ship-wreck", x: -7, z: -12.5, scale: 0.3, turn: 0.7, y: -0.2 },
    ],
    isles: [
      { x: -16.5, z: -11, r: 3.4 },
      { x: 15.5, z: -11.5, r: 2.8 },
      { x: 0, z: -10.6, r: 1.6 },
      { x: 19, z: -2, r: 1.6 },
      { x: 18, z: 3.5, r: 1.4 },
      { x: -18.5, z: 1.5, r: 1.5 },
      { x: -19, z: -4.5, r: 2.2 },
      { x: -15.5, z: 9, r: 1.3 },
      { x: 16, z: 9.5, r: 2 },
      { x: -7, z: -12.5, r: 1.6 },
    ],
  },
  {
    name: "Fortress strait",
    props: [
      ...walls(-9.6, 9.6, -12.6, 1.2),
      { model: "castle-gate", x: 0, z: -12.6, scale: 0.6 },
      { model: "cannon", x: -6, z: -12.3, scale: 0.35, y: 2.6, turn: 0 },
      { model: "cannon", x: -2.4, z: -12.3, scale: 0.35, y: 2.6, turn: 0 },
      { model: "cannon", x: 3.6, z: -12.3, scale: 0.35, y: 2.6, turn: 0 },
      { model: "cannon", x: 7.2, z: -12.3, scale: 0.35, y: 2.6, turn: 0 },
      { model: "patch-sand", x: -14, z: -12, scale: 0.75 },
      { model: "tower-complete-large", x: -13.6, z: -12.6, scale: 0.45, y: ON_SAND },
      { model: "patch-sand", x: 14, z: -12, scale: 0.75, turn: 3.1 },
      { model: "tower-complete-large", x: 13.6, z: -12.6, scale: 0.45, y: ON_SAND },
      { model: "flag-high-pennant", x: 15.4, z: -11.2, scale: 0.55, y: ON_SAND },
      { model: "rocks-b", x: 19, z: -2, scale: 0.5, turn: 1.1 },
      { model: "rocks-sand-c", x: -19, z: 2, scale: 0.5, turn: 2.4 },
      { model: "structure-platform-dock", x: 16, z: 9, scale: 0.6 },
      { model: "crate-bottles", x: 16.3, z: 8.7, scale: 0.35, y: 0.8 },
      { model: "barrel", x: 15.6, z: 9.4, scale: 0.32, y: 0.8 },
      { model: "rocks-c", x: -16, z: 9.5, scale: 0.4, turn: 0.4 },
    ],
    isles: [
      { x: -14, z: -12, r: 3.2 },
      { x: 14, z: -12, r: 3.2 },
      { x: -6, z: -12.6, r: 2.6 },
      { x: 0, z: -12.6, r: 2.6 },
      { x: 6, z: -12.6, r: 2.6 },
      { x: 19, z: -2, r: 1.6 },
      { x: -19, z: 2, r: 1.6 },
      { x: 16, z: 9, r: 1.6 },
      { x: -16, z: 9.5, r: 1.3 },
    ],
  },
  {
    name: "Rocky reef",
    props: [
      { model: "rocks-a", x: -15, z: -10.5, scale: 0.6, turn: 0.3 },
      { model: "rocks-sand-b", x: -18, z: -6, scale: 0.5, turn: 1.2 },
      { model: "rocks-c", x: -12.5, z: -13, scale: 0.45, turn: 2 },
      { model: "rocks-b", x: 14.5, z: -11, scale: 0.6, turn: 0.8 },
      { model: "rocks-sand-c", x: 18, z: -6.5, scale: 0.5, turn: 2.8 },
      { model: "rocks-a", x: 19, z: 1.5, scale: 0.45, turn: 1.6 },
      { model: "rocks-c", x: 0, z: -11, scale: 0.42, turn: 1 },
      { model: "grass-plant", x: 0.2, z: -11.1, scale: 0.6, y: 0.95 },
      { model: "ship-wreck", x: -6, z: -12.2, scale: 0.32, turn: 0.9, y: -0.2 },
      { model: "ship-wreck", x: 8, z: -13, scale: 0.28, turn: -0.6, y: -0.25 },
      { model: "mast-ropes", x: 4, z: -11.2, scale: 0.3, turn: 0.4, y: -0.4 },
      { model: "patch-sand-foliage", x: 16, z: 9, scale: 0.5, turn: 1 },
      { model: "palm-detailed-bend", x: 16.2, z: 9.2, scale: 0.45, y: ON_SAND },
      { model: "rocks-sand-a", x: -16.5, z: 8.5, scale: 0.4, turn: 0.2 },
    ],
    isles: [
      { x: -15, z: -10.5, r: 2.4 },
      { x: -18, z: -6, r: 1.8 },
      { x: -12.5, z: -13, r: 1.4 },
      { x: 14.5, z: -11, r: 2.2 },
      { x: 18, z: -6.5, r: 1.6 },
      { x: 19, z: 1.5, r: 1.5 },
      { x: 0, z: -11, r: 1.4 },
      { x: -6, z: -12.2, r: 1.8 },
      { x: 8, z: -13, r: 1.6 },
      { x: 16, z: 9, r: 2 },
    ],
  },
  {
    name: "Pirate haven",
    props: [
      { model: "patch-sand-foliage", x: -15.5, z: -11.5, scale: 1 },
      { model: "structure", x: -14.6, z: -11.6, scale: 0.5, turn: 0.3, y: ON_SAND },
      { model: "structure-roof", x: -17.2, z: -12.2, scale: 0.45, turn: -0.4, y: ON_SAND },
      { model: "flag-pirate-high", x: -13.2, z: -10.6, scale: 0.55, y: ON_SAND },
      { model: "crate", x: -16.2, z: -10.2, scale: 0.3, y: ON_SAND },
      { model: "barrel", x: -15.5, z: -9.9, scale: 0.3, y: ON_SAND },
      { model: "structure-platform-dock", x: -12.3, z: -9.3, scale: 0.55 },
      { model: "platform-planks", x: -11.2, z: -9.3, scale: 0.55, turn: 1.57 },
      { model: "boat-row-small", x: -10.6, z: -8.2, scale: 0.35, turn: 0.4 },
      { model: "patch-grass-foliage", x: 15, z: -11.5, scale: 1.05 },
      { model: "palm-detailed-straight", x: 14, z: -11, scale: 0.6, y: ON_SAND },
      { model: "palm-bend", x: 16.2, z: -12, scale: 0.55, turn: 2.4, y: ON_SAND },
      { model: "chest", x: 15.2, z: -10.4, scale: 0.35, turn: 0.6, y: ON_SAND },
      { model: "flag-pirate-pennant", x: 17, z: -10.6, scale: 0.5, y: ON_SAND },
      { model: "rocks-a", x: 0, z: -10.8, scale: 0.42, turn: 1.3 },
      { model: "tower-complete-small", x: 0.2, z: -11, scale: 0.4, y: 0.9 },
      { model: "rocks-sand-b", x: 19, z: -1, scale: 0.5, turn: 0.6 },
      { model: "patch-sand", x: -17, z: 8.8, scale: 0.55, turn: 2 },
      { model: "palm-straight", x: -17.2, z: 9, scale: 0.45, y: ON_SAND },
      { model: "rocks-c", x: 16.5, z: 9, scale: 0.4, turn: 2.2 },
    ],
    isles: [
      { x: -15.5, z: -11.5, r: 3.8 },
      { x: -11.8, z: -9, r: 1.6 },
      { x: 15, z: -11.5, r: 3 },
      { x: 0, z: -10.8, r: 1.6 },
      { x: 19, z: -1, r: 1.6 },
      { x: -17, z: 8.8, r: 2 },
      { x: 16.5, z: 9, r: 1.3 },
    ],
  },
];

export function layoutFor(gameId: number | null): Layout {
  const i = gameId === null ? 0 : Math.abs(Math.trunc(gameId)) % LAYOUTS.length;
  return LAYOUTS[i] as Layout;
}
