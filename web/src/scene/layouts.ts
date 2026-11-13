import type { CalmIsle } from "./gerstner";
import type { MoodName } from "./moods";

export type Motion =
  | { readonly kind: "bob" }
  | { readonly kind: "patrol"; readonly from: number; readonly to: number; readonly speed: number }
  | { readonly kind: "sail"; readonly from: number; readonly to: number; readonly speed: number; readonly phase?: number };

export interface Prop {
  readonly model: string;
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  readonly turn?: number;
  readonly y?: number;
  readonly motion?: Motion;
}

export interface Layout {
  readonly name: string;
  readonly mood?: MoodName;
  readonly props: readonly Prop[];
  readonly isles: readonly CalmIsle[];
}

const ON_SAND = 0.2;
const BOB: Motion = { kind: "bob" };
const TOP_LANE = -7.3;
const BOTTOM_LANE = 8.2;

const life = (patrol: string, passer: string): Prop[] => [
  { model: patrol, x: -8, z: TOP_LANE, scale: 0.26, motion: { kind: "patrol", from: -8, to: 8, speed: 0.9 } },
  { model: passer, x: 13.8, z: BOTTOM_LANE, scale: 0.18, motion: { kind: "sail", from: 13.8, to: -13.8, speed: 0.75 } },
  { model: "barrel", x: -4.6, z: 6.4, scale: 0.26, y: -0.05, motion: BOB },
  { model: "barrel", x: -3.9, z: 6.7, scale: 0.22, y: -0.05, motion: BOB },
  { model: "boat-row-small", x: 0, z: 6.5, scale: 0.3, turn: 0.6, motion: BOB },
];

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
      { model: "ship-wreck", x: -7, z: -12.5, scale: 0.3, turn: 0.7, y: -0.2, motion: BOB },
      ...life("ship-pirate-medium", "ship-small"),
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
    mood: "golden",
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
      ...life("ship-medium", "ship-pirate-small"),
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
    mood: "dusk",
    props: [
      { model: "rocks-a", x: -15, z: -10.5, scale: 0.6, turn: 0.3 },
      { model: "rocks-sand-b", x: -18, z: -6, scale: 0.5, turn: 1.2 },
      { model: "rocks-c", x: -12.5, z: -13, scale: 0.45, turn: 2 },
      { model: "rocks-b", x: 14.5, z: -11, scale: 0.6, turn: 0.8 },
      { model: "rocks-sand-c", x: 18, z: -6.5, scale: 0.5, turn: 2.8 },
      { model: "rocks-a", x: 19, z: 1.5, scale: 0.45, turn: 1.6 },
      { model: "rocks-c", x: 0, z: -11, scale: 0.42, turn: 1 },
      { model: "grass-plant", x: 0.2, z: -11.1, scale: 0.6, y: 0.95 },
      { model: "ship-wreck", x: -6, z: -12.2, scale: 0.32, turn: 0.9, y: -0.2, motion: BOB },
      { model: "ship-wreck", x: 8, z: -13, scale: 0.28, turn: -0.6, y: -0.25, motion: BOB },
      { model: "mast-ropes", x: 4, z: -11.2, scale: 0.3, turn: 0.4, y: -0.4, motion: BOB },
      { model: "patch-sand-foliage", x: 16, z: 9, scale: 0.5, turn: 1 },
      { model: "palm-detailed-bend", x: 16.2, z: 9.2, scale: 0.45, y: ON_SAND },
      { model: "rocks-sand-a", x: -16.5, z: 8.5, scale: 0.4, turn: 0.2 },
      ...life("ship-pirate-small", "ship-medium"),
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
    mood: "dusk",
    props: [
      { model: "patch-sand-foliage", x: -15.5, z: -11.5, scale: 1 },
      { model: "structure", x: -14.6, z: -11.6, scale: 0.5, turn: 0.3, y: ON_SAND },
      { model: "structure-roof", x: -17.2, z: -12.2, scale: 0.45, turn: -0.4, y: ON_SAND },
      { model: "flag-pirate-high", x: -13.2, z: -10.6, scale: 0.55, y: ON_SAND },
      { model: "crate", x: -16.2, z: -10.2, scale: 0.3, y: ON_SAND },
      { model: "barrel", x: -15.5, z: -9.9, scale: 0.3, y: ON_SAND },
      { model: "structure-platform-dock", x: -13.4, z: -10.4, scale: 0.55 },
      { model: "platform-planks", x: -12.3, z: -10.4, scale: 0.55, turn: 1.57 },
      { model: "boat-row-small", x: -11.6, z: -9.4, scale: 0.35, turn: 0.4, motion: BOB },
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
      ...life("ship-pirate-large", "ship-small"),
    ],
    isles: [
      { x: -15.5, z: -11.5, r: 3.8 },
      { x: -12.8, z: -10.1, r: 1.6 },
      { x: 15, z: -11.5, r: 3 },
      { x: 0, z: -10.8, r: 1.6 },
      { x: 19, z: -1, r: 1.6 },
      { x: -17, z: 8.8, r: 2 },
      { x: 16.5, z: 9, r: 1.3 },
    ],
  },
  {
    name: "Smugglers' dock",
    mood: "dawn",
    props: [
      { model: "structure-platform-dock", x: -3, z: -11.6, scale: 0.7 },
      { model: "structure-platform-dock", x: 3, z: -11.6, scale: 0.7, turn: 3.14 },
      { model: "platform-planks", x: 0, z: -11.4, scale: 0.7, turn: 1.57 },
      { model: "crate", x: -3.4, z: -11.9, scale: 0.32, y: 0.85 },
      { model: "crate-bottles", x: -2.6, z: -11.3, scale: 0.32, y: 0.85 },
      { model: "barrel", x: 2.6, z: -11.8, scale: 0.3, y: 0.85 },
      { model: "chest", x: 3.4, z: -11.3, scale: 0.3, y: 0.85, turn: 0.4 },
      { model: "ship-large", x: -8.5, z: -11.8, scale: 0.34, turn: 1.57, y: -0.05, motion: BOB },
      { model: "ship-pirate-large", x: 8.5, z: -11.8, scale: 0.34, turn: -1.57, y: -0.05, motion: BOB },
      { model: "patch-sand", x: -16, z: -11.5, scale: 0.8 },
      { model: "structure-roof", x: -16.6, z: -12, scale: 0.45, y: ON_SAND, turn: 0.3 },
      { model: "flag-pennant", x: -14.8, z: -10.6, scale: 0.5, y: ON_SAND },
      { model: "patch-sand", x: 16, z: -11.5, scale: 0.8, turn: 2.6 },
      { model: "tower-complete-small", x: 16.4, z: -12, scale: 0.42, y: ON_SAND },
      { model: "cannon", x: 14.9, z: -10.7, scale: 0.35, y: ON_SAND, turn: 0.6 },
      { model: "rocks-sand-c", x: -19, z: -1, scale: 0.5, turn: 1.4 },
      { model: "rocks-b", x: 19, z: 2, scale: 0.48, turn: 0.4 },
      { model: "patch-sand-foliage", x: -16.4, z: 9.2, scale: 0.55, turn: 0.6 },
      { model: "palm-bend", x: -16.2, z: 9.4, scale: 0.45, y: ON_SAND, turn: 3.6 },
      { model: "rocks-sand-a", x: 16.6, z: 9.2, scale: 0.42, turn: 2.2 },
      ...life("ship-pirate-small", "ship-medium"),
    ],
    isles: [
      { x: -3, z: -11.6, r: 2.2 },
      { x: 3, z: -11.6, r: 2.2 },
      { x: -8.5, z: -11.8, r: 1.8 },
      { x: 8.5, z: -11.8, r: 1.8 },
      { x: -16, z: -11.5, r: 3.2 },
      { x: 16, z: -11.5, r: 3.2 },
      { x: -19, z: -1, r: 1.6 },
      { x: 19, z: 2, r: 1.6 },
      { x: -16.4, z: 9.2, r: 2 },
      { x: 16.6, z: 9.2, r: 1.4 },
    ],
  },
  {
    name: "Watchtower shoals",
    mood: "day",
    props: [
      { model: "rocks-a", x: 0, z: -11.4, scale: 0.62, turn: 0.4 },
      { model: "tower-complete-large", x: 0.1, z: -11.6, scale: 0.4, y: 1.1 },
      { model: "flag-high-pennant", x: 1.2, z: -10.6, scale: 0.45, y: 0.9 },
      { model: "rocks-c", x: -5.5, z: -12.4, scale: 0.4, turn: 2.1 },
      { model: "rocks-b", x: 6, z: -12.6, scale: 0.42, turn: 1.1 },
      { model: "ship-wreck", x: -10, z: -12.8, scale: 0.3, turn: 2.2, y: -0.25, motion: BOB },
      { model: "patch-grass-foliage", x: 16, z: -11.6, scale: 1 },
      { model: "palm-detailed-straight", x: 15.2, z: -11.2, scale: 0.55, y: ON_SAND },
      { model: "palm-detailed-bend", x: 16.9, z: -12.1, scale: 0.55, y: ON_SAND, turn: 2.2 },
      { model: "tower-watch", x: 16.2, z: -10.4, scale: 0.4, y: ON_SAND },
      { model: "patch-sand-foliage", x: -16, z: -11.4, scale: 0.9, turn: 1.1 },
      { model: "palm-straight", x: -16.4, z: -11.9, scale: 0.55, y: ON_SAND },
      { model: "chest", x: -15.2, z: -10.8, scale: 0.32, y: ON_SAND, turn: 0.8 },
      { model: "rocks-sand-b", x: -19, z: -4, scale: 0.5, turn: 0.5 },
      { model: "rocks-sand-c", x: 19, z: -3.5, scale: 0.5, turn: 2.5 },
      { model: "rocks-a", x: -16.5, z: 9, scale: 0.42, turn: 1.9 },
      { model: "patch-sand", x: 16.4, z: 9.2, scale: 0.5, turn: 1.2 },
      { model: "barrel", x: 16.1, z: 9, scale: 0.3, y: ON_SAND },
      ...life("ship-medium", "ship-pirate-medium"),
    ],
    isles: [
      { x: 0, z: -11.4, r: 2 },
      { x: -5.5, z: -12.4, r: 1.4 },
      { x: 6, z: -12.6, r: 1.4 },
      { x: -10, z: -12.8, r: 1.6 },
      { x: 16, z: -11.6, r: 3 },
      { x: -16, z: -11.4, r: 3 },
      { x: -19, z: -4, r: 1.7 },
      { x: 19, z: -3.5, r: 1.7 },
      { x: -16.5, z: 9, r: 1.4 },
      { x: 16.4, z: 9.2, r: 1.8 },
    ],
  },
  {
    name: "Royal harbour",
    mood: "golden",
    props: [
      ...walls(-12.6, -4.2, -12.8, 1.2),
      ...walls(4.2, 12.6, -12.8, 1.2),
      { model: "castle-gate", x: -3, z: -12.8, scale: 0.6 },
      { model: "castle-gate", x: 3, z: -12.8, scale: 0.6 },
      { model: "tower-complete-large", x: -14.4, z: -13, scale: 0.46, y: 0.15 },
      { model: "tower-complete-large", x: 14.4, z: -13, scale: 0.46, y: 0.15 },
      { model: "flag-high-pennant", x: -13.2, z: -11.6, scale: 0.55, y: 0.2 },
      { model: "flag-high-pennant", x: 13.2, z: -11.6, scale: 0.55, y: 0.2 },
      { model: "ship-large", x: -7.5, z: -10.6, scale: 0.36, turn: 1.57, y: -0.05, motion: BOB },
      { model: "ship-large", x: 7.5, z: -10.6, scale: 0.36, turn: -1.57, y: -0.05, motion: BOB },
      { model: "boat-row-large", x: 0, z: -10.2, scale: 0.34, turn: 0.2, motion: BOB },
      { model: "rocks-sand-a", x: -19, z: -3, scale: 0.5, turn: 1.1 },
      { model: "tower-watch", x: -19.1, z: -3.2, scale: 0.36, y: 0.6 },
      { model: "rocks-sand-c", x: 19, z: -2.5, scale: 0.5, turn: 2.3 },
      { model: "cannon", x: 18.6, z: -2.2, scale: 0.34, y: 0.55, turn: -1.2 },
      { model: "patch-sand", x: -16.4, z: 9.2, scale: 0.55, turn: 0.4 },
      { model: "crate", x: -16.6, z: 9, scale: 0.3, y: ON_SAND },
      { model: "barrel", x: -16, z: 9.5, scale: 0.28, y: ON_SAND },
      { model: "rocks-c", x: 16.6, z: 9, scale: 0.42, turn: 1.4 },
      ...life("ship-medium", "ship-small"),
    ],
    isles: [
      { x: -8.4, z: -12.8, r: 2.6 },
      { x: 8.4, z: -12.8, r: 2.6 },
      { x: -3, z: -12.8, r: 1.8 },
      { x: 3, z: -12.8, r: 1.8 },
      { x: -14.4, z: -13, r: 2 },
      { x: 14.4, z: -13, r: 2 },
      { x: -19, z: -3, r: 1.7 },
      { x: 19, z: -2.5, r: 1.7 },
      { x: -16.4, z: 9.2, r: 2 },
      { x: 16.6, z: 9, r: 1.4 },
    ],
  },
  {
    name: "Palm atolls",
    mood: "dawn",
    props: [
      { model: "patch-grass-foliage", x: -14, z: -12, scale: 0.85, turn: 0.4 },
      { model: "palm-detailed-straight", x: -14.4, z: -12.4, scale: 0.55, y: ON_SAND },
      { model: "palm-bend", x: -13.2, z: -11.6, scale: 0.5, y: ON_SAND, turn: 1.9 },
      { model: "patch-sand-foliage", x: -6, z: -13, scale: 0.6, turn: 1.6 },
      { model: "palm-straight", x: -6.2, z: -13.2, scale: 0.5, y: ON_SAND },
      { model: "patch-grass-foliage", x: 0, z: -12.4, scale: 0.7, turn: 2.5 },
      { model: "palm-detailed-bend", x: 0.4, z: -12.6, scale: 0.55, y: ON_SAND, turn: 0.6 },
      { model: "chest", x: -0.5, z: -12, scale: 0.3, y: ON_SAND, turn: 0.9 },
      { model: "patch-sand-foliage", x: 6.4, z: -13, scale: 0.6, turn: 0.2 },
      { model: "palm-straight", x: 6.6, z: -13.3, scale: 0.5, y: ON_SAND },
      { model: "patch-grass-foliage", x: 14, z: -12, scale: 0.85, turn: 3.6 },
      { model: "palm-detailed-straight", x: 14.3, z: -12.5, scale: 0.55, y: ON_SAND },
      { model: "structure-roof", x: 13.1, z: -11.6, scale: 0.4, y: ON_SAND, turn: -0.5 },
      { model: "patch-sand-foliage", x: -19, z: -3, scale: 0.55, turn: 2.4 },
      { model: "palm-bend", x: -19.1, z: -3.3, scale: 0.45, y: ON_SAND, turn: 4.2 },
      { model: "patch-sand-foliage", x: 19, z: -2, scale: 0.55, turn: 0.8 },
      { model: "palm-straight", x: 19.2, z: -2.2, scale: 0.45, y: ON_SAND },
      { model: "patch-grass-foliage", x: -16.6, z: 9.2, scale: 0.6, turn: 1.2 },
      { model: "palm-detailed-bend", x: -16.5, z: 9.3, scale: 0.45, y: ON_SAND, turn: 3 },
      { model: "patch-sand", x: 16.6, z: 9.2, scale: 0.5, turn: 2.6 },
      { model: "palm-straight", x: 16.8, z: 9.3, scale: 0.4, y: ON_SAND },
      ...life("ship-pirate-small", "ship-pirate-medium"),
    ],
    isles: [
      { x: -14, z: -12, r: 2.8 },
      { x: -6, z: -13, r: 2 },
      { x: 0, z: -12.4, r: 2.2 },
      { x: 6.4, z: -13, r: 2 },
      { x: 14, z: -12, r: 2.8 },
      { x: -19, z: -3, r: 1.8 },
      { x: 19, z: -2, r: 1.8 },
      { x: -16.6, z: 9.2, r: 2 },
      { x: 16.6, z: 9.2, r: 1.8 },
    ],
  },
];

export function layoutFor(gameId: number | null): Layout {
  const i = gameId === null ? 0 : Math.abs(Math.trunc(gameId)) % LAYOUTS.length;
  return LAYOUTS[i] as Layout;
}
