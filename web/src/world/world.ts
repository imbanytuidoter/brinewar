export const WORLD_W = 1800;
export const WORLD_H = 1200;
export const SHIP_SPEED = 170;
export const TURN_RATE = 3.2;
export const ARRIVE = 8;
export const ENCOUNTER = 95;
export const PATROL_SPEED = 0.22;

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export type Sprite = "isle-green" | "isle-sand" | "palm-a" | "palm-b" | "palm-c" | "rock-a" | "rock-b" | "rock-d" | "rock-e" | "tower" | "tower-b" | "wall-h" | "dock-h";

export interface Decor {
  readonly sprite: Sprite;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly angle?: number;
}

export interface Island {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly sprite: "isle-green" | "isle-sand";
  readonly size: number;
}

export type PlaceKind = "port" | "admiralty" | "treasury" | "tavern" | "wreck";

export interface Place {
  readonly kind: PlaceKind;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly reach: number;
}

export interface Patrol {
  readonly id: number;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly phase: number;
}

export const ISLANDS: readonly Island[] = [
  { x: 380, y: 820, radius: 150, sprite: "isle-green", size: 340 },
  { x: 1390, y: 300, radius: 110, sprite: "isle-sand", size: 250 },
  { x: 1480, y: 930, radius: 125, sprite: "isle-green", size: 290 },
  { x: 760, y: 250, radius: 95, sprite: "isle-sand", size: 215 },
  { x: 1080, y: 760, radius: 55, sprite: "isle-sand", size: 125 },
  { x: 220, y: 300, radius: 60, sprite: "isle-green", size: 140 },
];

export const DECOR: readonly Decor[] = [
  { sprite: "tower", x: 300, y: 740, size: 60 },
  { sprite: "tower", x: 460, y: 740, size: 60 },
  { sprite: "wall-h", x: 380, y: 740, size: 100 },
  { sprite: "dock-h", x: 545, y: 800, size: 70 },
  { sprite: "palm-b", x: 330, y: 880, size: 70 },
  { sprite: "palm-a", x: 430, y: 900, size: 55 },
  { sprite: "palm-c", x: 380, y: 820, size: 45 },
  { sprite: "tower-b", x: 1350, y: 280, size: 70 },
  { sprite: "tower", x: 1440, y: 320, size: 52 },
  { sprite: "wall-h", x: 1395, y: 300, size: 60 },
  { sprite: "rock-e", x: 1470, y: 900, size: 70 },
  { sprite: "rock-b", x: 1420, y: 980, size: 60 },
  { sprite: "palm-b", x: 1540, y: 960, size: 65 },
  { sprite: "palm-a", x: 730, y: 230, size: 60 },
  { sprite: "palm-c", x: 795, y: 275, size: 48 },
  { sprite: "palm-b", x: 1080, y: 750, size: 50 },
  { sprite: "palm-a", x: 210, y: 290, size: 55 },
  { sprite: "rock-a", x: 960, y: 600, size: 42 },
  { sprite: "rock-d", x: 1010, y: 640, size: 36 },
  { sprite: "rock-b", x: 620, y: 560, size: 46 },
  { sprite: "rock-a", x: 1700, y: 560, size: 40 },
  { sprite: "rock-d", x: 120, y: 1080, size: 44 },
];

export const PLACES: readonly Place[] = [
  { kind: "port", name: "Port Brine", x: 560, y: 760, reach: 70 },
  { kind: "admiralty", name: "The Admiralty", x: 1260, y: 360, reach: 80 },
  { kind: "treasury", name: "The Nauarch's Keep", x: 1330, y: 1010, reach: 80 },
  { kind: "tavern", name: "Captains' Cay", x: 880, y: 300, reach: 75 },
  { kind: "wreck", name: "Wreck Shoals", x: 985, y: 570, reach: 70 },
];

export const PATROLS: readonly Patrol[] = [
  { id: 1, cx: 1100, cy: 420, r: 150, phase: 0 },
  { id: 2, cx: 720, cy: 980, r: 130, phase: 2.1 },
  { id: 3, cx: 1560, cy: 620, r: 110, phase: 4.2 },
];

export const CAPTAIN_SLOTS: readonly Vec[] = [
  { x: 640, y: 380 },
  { x: 960, y: 210 },
  { x: 560, y: 470 },
  { x: 1180, y: 560 },
  { x: 860, y: 860 },
  { x: 1640, y: 360 },
  { x: 1640, y: 1050 },
  { x: 270, y: 1040 },
  { x: 160, y: 150 },
  { x: 160, y: 610 },
  { x: 1180, y: 1050 },
  { x: 520, y: 1050 },
];

export const START: Vec = { x: 600, y: 700 };

export function patrolAt(p: Patrol, t: number): { pos: Vec; heading: number } {
  const a = p.phase + t * PATROL_SPEED;
  return { pos: { x: p.cx + Math.cos(a) * p.r, y: p.cy + Math.sin(a) * p.r }, heading: a + Math.PI / 2 };
}

export function clampToWorld(v: Vec, margin = 30): Vec {
  return { x: Math.min(WORLD_W - margin, Math.max(margin, v.x)), y: Math.min(WORLD_H - margin, Math.max(margin, v.y)) };
}

export function outOfIslands(v: Vec, islands: readonly Island[] = ISLANDS): Vec {
  for (const i of islands) {
    const dx = v.x - i.x;
    const dy = v.y - i.y;
    const d = Math.hypot(dx, dy);
    if (d < i.radius) {
      if (d === 0) return { x: i.x + i.radius, y: i.y };
      return { x: i.x + (dx / d) * i.radius, y: i.y + (dy / d) * i.radius };
    }
  }
  return v;
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export interface Helm {
  readonly pos: Vec;
  readonly heading: number;
  readonly target: Vec | null;
}

export function steer(h: Helm, dt: number): Helm {
  if (!h.target) return h;
  const dx = h.target.x - h.pos.x;
  const dy = h.target.y - h.pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= ARRIVE) return { pos: h.pos, heading: h.heading, target: null };
  const want = Math.atan2(dy, dx);
  const turn = wrapAngle(want - h.heading);
  const maxTurn = TURN_RATE * dt;
  const heading = h.heading + Math.max(-maxTurn, Math.min(maxTurn, turn));
  const throttle = Math.max(0.25, Math.cos(Math.min(Math.abs(turn), Math.PI / 2)));
  const step = Math.min(dist, SHIP_SPEED * dt * throttle);
  const next = outOfIslands(clampToWorld({ x: h.pos.x + Math.cos(heading) * step, y: h.pos.y + Math.sin(heading) * step }));
  const blocked = Math.hypot(next.x - h.pos.x, next.y - h.pos.y) < step * 0.2;
  return { pos: next, heading, target: blocked ? null : h.target };
}

export function nearest<T extends Vec>(items: readonly T[], at: Vec, within: (item: T) => number): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const it of items) {
    const d = Math.hypot(it.x - at.x, it.y - at.y);
    if (d <= within(it) && d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}
