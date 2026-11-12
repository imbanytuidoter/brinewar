export const WORLD_W = 3600;
export const WORLD_H = 2400;
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

const OUTER_ISLANDS: readonly Island[] = [
  { x: 420, y: 400, radius: 140, sprite: "isle-green", size: 320 },
  { x: 1000, y: 230, radius: 70, sprite: "isle-sand", size: 160 },
  { x: 1750, y: 260, radius: 90, sprite: "isle-sand", size: 210 },
  { x: 2700, y: 330, radius: 120, sprite: "isle-green", size: 280 },
  { x: 3250, y: 560, radius: 130, sprite: "isle-sand", size: 300 },
  { x: 300, y: 1250, radius: 110, sprite: "isle-sand", size: 250 },
  { x: 560, y: 2000, radius: 85, sprite: "isle-green", size: 200 },
  { x: 1350, y: 2150, radius: 125, sprite: "isle-green", size: 290 },
  { x: 2150, y: 2080, radius: 80, sprite: "isle-sand", size: 190 },
  { x: 3020, y: 2000, radius: 145, sprite: "isle-green", size: 330 },
  { x: 3360, y: 1250, radius: 90, sprite: "isle-sand", size: 210 },
  { x: 2950, y: 960, radius: 60, sprite: "isle-green", size: 140 },
];

const OUTER_DECOR: readonly Decor[] = [
  { sprite: "palm-b", x: 380, y: 380, size: 70 },
  { sprite: "palm-a", x: 470, y: 440, size: 55 },
  { sprite: "tower-b", x: 430, y: 330, size: 64 },
  { sprite: "palm-c", x: 1000, y: 225, size: 46 },
  { sprite: "palm-a", x: 1730, y: 250, size: 58 },
  { sprite: "rock-e", x: 1790, y: 290, size: 40 },
  { sprite: "palm-b", x: 2660, y: 310, size: 66 },
  { sprite: "tower", x: 2750, y: 360, size: 56 },
  { sprite: "palm-c", x: 3220, y: 540, size: 50 },
  { sprite: "palm-a", x: 3290, y: 590, size: 60 },
  { sprite: "rock-b", x: 290, y: 1240, size: 56 },
  { sprite: "palm-b", x: 560, y: 1990, size: 58 },
  { sprite: "tower", x: 1310, y: 2100, size: 62 },
  { sprite: "palm-a", x: 1400, y: 2180, size: 64 },
  { sprite: "palm-c", x: 2150, y: 2070, size: 46 },
  { sprite: "palm-b", x: 2970, y: 1970, size: 72 },
  { sprite: "rock-e", x: 3070, y: 2050, size: 62 },
  { sprite: "tower-b", x: 3040, y: 1930, size: 66 },
  { sprite: "palm-a", x: 3360, y: 1240, size: 56 },
  { sprite: "palm-c", x: 2950, y: 955, size: 40 },
  { sprite: "rock-a", x: 160, y: 760, size: 44 },
  { sprite: "rock-d", x: 2420, y: 620, size: 40 },
  { sprite: "rock-b", x: 3480, y: 1820, size: 50 },
  { sprite: "rock-a", x: 1880, y: 2300, size: 42 },
  { sprite: "rock-d", x: 120, y: 2280, size: 44 },
  { sprite: "rock-a", x: 3500, y: 120, size: 46 },
];

export const ISLANDS: readonly Island[] = [
  { x: 1280, y: 1420, radius: 150, sprite: "isle-green", size: 340 },
  { x: 2290, y: 900, radius: 110, sprite: "isle-sand", size: 250 },
  { x: 2380, y: 1530, radius: 125, sprite: "isle-green", size: 290 },
  { x: 1660, y: 850, radius: 95, sprite: "isle-sand", size: 215 },
  { x: 1980, y: 1360, radius: 55, sprite: "isle-sand", size: 125 },
  { x: 1120, y: 900, radius: 60, sprite: "isle-green", size: 140 },
  ...OUTER_ISLANDS,
];

export const DECOR: readonly Decor[] = [
  { sprite: "tower", x: 1200, y: 1340, size: 60 },
  { sprite: "tower", x: 1360, y: 1340, size: 60 },
  { sprite: "wall-h", x: 1280, y: 1340, size: 100 },
  { sprite: "dock-h", x: 1445, y: 1400, size: 70 },
  { sprite: "palm-b", x: 1230, y: 1480, size: 70 },
  { sprite: "palm-a", x: 1330, y: 1500, size: 55 },
  { sprite: "palm-c", x: 1280, y: 1420, size: 45 },
  { sprite: "tower-b", x: 2250, y: 880, size: 70 },
  { sprite: "tower", x: 2340, y: 920, size: 52 },
  { sprite: "wall-h", x: 2295, y: 900, size: 60 },
  { sprite: "rock-e", x: 2370, y: 1500, size: 70 },
  { sprite: "rock-b", x: 2320, y: 1580, size: 60 },
  { sprite: "palm-b", x: 2440, y: 1560, size: 65 },
  { sprite: "palm-a", x: 1630, y: 830, size: 60 },
  { sprite: "palm-c", x: 1695, y: 875, size: 48 },
  { sprite: "palm-b", x: 1980, y: 1350, size: 50 },
  { sprite: "palm-a", x: 1110, y: 890, size: 55 },
  { sprite: "rock-a", x: 1860, y: 1200, size: 42 },
  { sprite: "rock-d", x: 1910, y: 1240, size: 36 },
  { sprite: "rock-b", x: 1520, y: 1160, size: 46 },
  { sprite: "rock-a", x: 2600, y: 1160, size: 40 },
  { sprite: "rock-d", x: 1020, y: 1680, size: 44 },
  ...OUTER_DECOR,
];

export const PLACES: readonly Place[] = [
  { kind: "port", name: "Port Brine", x: 1460, y: 1360, reach: 70 },
  { kind: "admiralty", name: "The Admiralty", x: 2160, y: 960, reach: 80 },
  { kind: "treasury", name: "The Nauarch's Keep", x: 2230, y: 1610, reach: 80 },
  { kind: "tavern", name: "Captains' Cay", x: 1780, y: 900, reach: 75 },
  { kind: "wreck", name: "Wreck Shoals", x: 1885, y: 1170, reach: 70 },
];

export const PATROLS: readonly Patrol[] = [
  { id: 1, cx: 2000, cy: 1020, r: 150, phase: 0 },
  { id: 2, cx: 1620, cy: 1580, r: 130, phase: 2.1 },
  { id: 3, cx: 2460, cy: 1220, r: 110, phase: 4.2 },
  { id: 4, cx: 760, cy: 760, r: 150, phase: 1.0 },
  { id: 5, cx: 2980, cy: 1560, r: 140, phase: 3.1 },
  { id: 6, cx: 900, cy: 1950, r: 120, phase: 5.2 },
];


export const START: Vec = { x: 1500, y: 1300 };

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

const SLOT_SPACINGS = [200, 160, 130, 105] as const;
const SLOT_MARGIN = 120;
const SLOT_CLEAR = 70;
const SLOT_START_CLEAR = 170;
const SLOT_PATROL_BAND = 80;

function slotFree(p: Vec): boolean {
  if (ISLANDS.some((i) => Math.hypot(p.x - i.x, p.y - i.y) < i.radius + SLOT_CLEAR)) return false;
  if (PLACES.some((pl) => Math.hypot(p.x - pl.x, p.y - pl.y) < pl.reach + SLOT_CLEAR)) return false;
  if (PATROLS.some((pa) => Math.abs(Math.hypot(p.x - pa.cx, p.y - pa.cy) - pa.r) < SLOT_PATROL_BAND)) return false;
  if (DECOR.some((d) => Math.hypot(p.x - d.x, p.y - d.y) < d.size / 2 + SLOT_CLEAR / 2)) return false;
  return Math.hypot(p.x - START.x, p.y - START.y) >= SLOT_START_CLEAR;
}

function slotsAt(spacing: number): Vec[] {
  const out: Vec[] = [];
  const rowH = spacing * 0.866;
  for (let row = 0, y = SLOT_MARGIN; y <= WORLD_H - SLOT_MARGIN; row++, y += rowH)
    for (let x = SLOT_MARGIN + (row % 2) * (spacing / 2); x <= WORLD_W - SLOT_MARGIN; x += spacing) {
      const p = { x: Math.round(x), y: Math.round(y) };
      if (slotFree(p)) out.push(p);
    }
  return out.sort((a, b) => Math.hypot(a.x - START.x, a.y - START.y) - Math.hypot(b.x - START.x, b.y - START.y));
}

const slotCache = new Map<number, Vec[]>();

export function captainSlots(n: number): Vec[] {
  for (const spacing of SLOT_SPACINGS) {
    const slots = slotCache.get(spacing) ?? slotsAt(spacing);
    slotCache.set(spacing, slots);
    if (slots.length >= n) return slots.slice(0, n);
  }
  return slotCache.get(SLOT_SPACINGS.at(-1) ?? 0) ?? [];
}
