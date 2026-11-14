import * as THREE from "three";
import { seaHeight, type Wave } from "./gerstner";
import { cellCenter } from "./grid";
import { ParticlePool } from "./particles";
import type { Side } from "./types";

const MAX_PARTICLES = 4000;
const FLIGHT_SECONDS = 1.15;
const LOB_FROM = 0.55;
const LOB_PACE = 0.4;
const FUSE_COLOR = "#ffb347";
const FUSE_RATE = 0.8;
const REST_HEIGHT = 0.18;
const REST_BOB = 0.05;
const HOLD_MAX_SECONDS = 9;
const BURN_STEP = 0.03;
const BUOY_COLOR = "#f4fbff";
const BALL_DIAMETER = 0.42;
const SMOKE_CHANCE = 0.45;
const SMOKE_BUDGET = 6;
const MUZZLE_HEIGHT = 1.6;
const CLEAR_COLOR = "#dbe7ec";
const TRAIL_COLOR = "#c9d2d6";

interface Afloat {
  readonly y: number;
  readonly visible: boolean;
  readonly gone: boolean;
}

type ShipLookup = (side: Side, cell: number) => Afloat | null;

interface Ring {
  readonly m: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  t: number;
  readonly max: number;
  readonly scale: number;
}

interface Buoy {
  readonly m: THREE.Mesh;
  readonly x: number;
  readonly z: number;
}

interface Burn {
  readonly side: Side;
  readonly cell: number;
  readonly x: number;
  readonly z: number;
  acc: number;
}

interface Flight {
  readonly side: Side;
  readonly m: THREE.Object3D;
  readonly from: THREE.Vector3;
  readonly to: THREE.Vector3;
  t: number;
  readonly max: number;
  readonly done: () => void;
  readonly trail: string;
  readonly hold: (() => boolean) | null;
  held: number;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

export class EffectsEngine {
  readonly group = new THREE.Group();
  readonly #pool = new ParticlePool(MAX_PARTICLES);
  readonly #waves: readonly Wave[];
  #trail = TRAIL_COLOR;
  readonly #origins: Record<Side, THREE.Vector3 | null> = { mine: null, enemy: null };
  readonly #reduced: boolean;
  readonly #rings: Ring[] = [];
  readonly #buoys = new Map<string, Buoy>();
  readonly #burns = new Map<string, Burn>();
  readonly #flights: Flight[] = [];
  readonly #ringGeo = new THREE.RingGeometry(0.3, 0.42, 48);
  readonly #buoyGeo = new THREE.TorusGeometry(0.22, 0.05, 8, 24);
  readonly #clearGeo = new THREE.CircleGeometry(0.1, 16);
  readonly #clearMat = new THREE.MeshBasicMaterial({ color: CLEAR_COLOR, transparent: true, opacity: 0.75, depthTest: false });
  readonly #clear: Record<Side, Map<number, THREE.Mesh>> = { mine: new Map(), enemy: new Map() };
  readonly #buoyMat = new THREE.MeshStandardMaterial({ color: BUOY_COLOR, roughness: 0.6, depthTest: false });
  readonly #tmp = new THREE.Vector3();
  #ball: THREE.Object3D | null = null;
  #ballScale = 1;
  #lookup: ShipLookup = () => null;
  #time = 0;

  constructor(waves: readonly Wave[], reduced: boolean) {
    this.#waves = waves;
    this.#reduced = reduced;
    this.group.add(this.#pool.points);
  }

  setBall(ball: THREE.Object3D): void {
    this.#ball = ball;
    const size = new THREE.Box3().setFromObject(ball).getSize(new THREE.Vector3());
    const largest = Math.max(size.x, size.y, size.z);
    this.#ballScale = largest > 0 ? BALL_DIAMETER / largest : 1;
  }

  setLookup(lookup: ShipLookup): void {
    this.#lookup = lookup;
  }

  setViewportHeight(h: number): void {
    this.#pool.setViewportHeight(h);
  }

  emitGlint(x: number, y: number, z: number, color: string): void {
    this.#pool.emit({ x, y, z, vx: rnd(-0.12, 0.12), vy: rnd(0.25, 0.6), vz: rnd(-0.12, 0.12), color, size: rnd(0.08, 0.16), life: rnd(0.9, 1.6), gravity: -0.15 });
  }

  emitBubble(x: number, z: number): void {
    this.#pool.emit({ x, y: 0.05, z, vx: rnd(-0.3, 0.3), vy: rnd(0.6, 1.4), vz: rnd(-0.3, 0.3), color: "#e6fbff", size: rnd(0.1, 0.22), life: rnd(0.6, 1.2), gravity: 0.5 });
  }

  #water(x: number, z: number): number {
    return seaHeight(this.#waves, x, z, this.#time);
  }

  #ring(x: number, z: number, color: string, scale: number): void {
    const m = new THREE.Mesh(this.#ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 3;
    m.position.set(x, 0.3, z);
    this.group.add(m);
    this.#rings.push({ m, t: 0, max: 1.4, scale });
  }

  #splash(x: number, z: number): void {
    const y = this.#water(x, z) + 0.1;
    for (let i = 0; i < 70; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(0.6, 2.2);
      this.#pool.emit({ x, y, z, vx: Math.cos(a) * s, vy: rnd(3.5, 7.5), vz: Math.sin(a) * s, color: "#f4fbff", size: rnd(0.12, 0.28), life: rnd(0.8, 1.4), gravity: -11 });
    }
    this.#ring(x, z, "#ffffff", 1.6);
  }

  #flash(x: number, z: number): void {
    const y = this.#water(x, z) + 0.4;
    for (let i = 0; i < 40; i++) {
      this.#pool.emit({ x, y, z, vx: rnd(-2.5, 2.5), vy: rnd(1, 5), vz: rnd(-2.5, 2.5), color: i % 3 ? "#ffb347" : "#fff2b0", size: rnd(0.3, 0.6), life: rnd(0.3, 0.7), gravity: -2 });
    }
    this.#ring(x, z, "#ffcf5a", 2.2);
  }

  #buoy(side: Side, cell: number): void {
    const key = `${side}:${cell}`;
    if (this.#buoys.has(key)) return;
    const c = cellCenter(side, cell);
    const m = new THREE.Mesh(this.#buoyGeo, this.#buoyMat);
    m.renderOrder = 2;
    m.rotation.x = -Math.PI / 2;
    m.position.set(c.x, 0.05, c.z);
    this.group.add(m);
    this.#buoys.set(key, { m, x: c.x, z: c.z });
  }

  #burn(side: Side, cell: number): void {
    const key = `${side}:${cell}`;
    if (this.#burns.has(key)) return;
    const c = cellCenter(side, cell);
    this.#burns.set(key, { side, cell, x: c.x, z: c.z, acc: 0 });
  }

  setTrail(color: string | null): void {
    this.#trail = color ?? TRAIL_COLOR;
  }

  setOrigin(side: Side, cells: readonly number[] | null): void {
    if (!cells || cells.length === 0) {
      this.#origins[side] = null;
      return;
    }
    const sum = cells.reduce((acc, cell) => {
      const c = cellCenter(side, cell);
      return { x: acc.x + c.x, z: acc.z + c.z };
    }, { x: 0, z: 0 });
    this.#origins[side] = new THREE.Vector3(sum.x / cells.length, MUZZLE_HEIGHT, sum.z / cells.length);
  }

  place(side: Side, cell: number, hit: boolean): void {
    if (hit) this.#burn(side, cell);
    else this.#buoy(side, cell);
  }

  land(side: Side, cell: number, hit: boolean): void {
    const c = cellCenter(side, cell);
    if (hit) this.#flash(c.x, c.z);
    else this.#splash(c.x, c.z);
    this.place(side, cell, hit);
  }

  fly(side: Side, cell: number, done: () => void, hold: (() => boolean) | null = null): void {
    const c = cellCenter(side, cell);
    const origin = side === "enemy" ? this.#origins.mine : this.#origins.enemy;
    const from = origin ? origin.clone() : new THREE.Vector3(side === "enemy" ? -6 : 6, 1.4, 0);
    const to = new THREE.Vector3(c.x, 0, c.z);
    if (this.#reduced || !this.#ball) {
      done();
      return;
    }
    const m = this.#ball.clone(true);
    m.scale.setScalar(this.#ballScale);
    m.position.copy(from);
    this.group.add(m);
    this.#flights.push({ side, m, from, to, t: 0, max: FLIGHT_SECONDS, done, trail: side === "enemy" ? this.#trail : TRAIL_COLOR, hold, held: 0 });
  }

  #updateFlights(dt: number): void {
    for (let i = this.#flights.length - 1; i >= 0; i--) {
      const f = this.#flights[i];
      if (!f) continue;
      const waiting = f.hold !== null && f.held < HOLD_MAX_SECONDS && f.hold();
      if (f.t < f.max) {
        const lobbing = waiting && f.t / f.max >= LOB_FROM;
        f.t = Math.min(f.max, f.t + dt * (lobbing ? LOB_PACE : 1));
        const k = f.t / f.max;
        this.#tmp.lerpVectors(f.from, f.to, k);
        this.#tmp.y = THREE.MathUtils.lerp(f.from.y, REST_HEIGHT, k) + Math.sin(k * Math.PI) * 4.2;
        f.m.position.copy(this.#tmp);
        if (Math.random() < 0.7) {
          this.#pool.emit({ x: this.#tmp.x, y: this.#tmp.y, z: this.#tmp.z, vx: 0, vy: 0.3, vz: 0, color: f.trail, size: 0.22, grow: 0.6, life: 0.6, gravity: 0.4 });
        }
        continue;
      }
      if (waiting) {
        f.held += dt;
        const y = this.#water(f.to.x, f.to.z) + REST_HEIGHT + Math.sin(f.held * 6) * REST_BOB;
        f.m.position.set(f.to.x, y, f.to.z);
        if (Math.random() < FUSE_RATE) {
          this.#pool.emit({ x: f.to.x, y: y + 0.22, z: f.to.z, vx: rnd(-0.5, 0.5), vy: rnd(0.8, 1.6), vz: rnd(-0.5, 0.5), color: FUSE_COLOR, size: 0.1, grow: 0.2, life: 0.35, gravity: 2 });
        }
        continue;
      }
      this.group.remove(f.m);
      this.#flights.splice(i, 1);
      f.done();
    }
  }

  #updateRings(dt: number): void {
    for (let i = this.#rings.length - 1; i >= 0; i--) {
      const r = this.#rings[i];
      if (!r) continue;
      r.t += dt;
      const k = r.t / r.max;
      r.m.scale.setScalar(1 + k * r.scale * 2.4);
      r.m.material.opacity = 0.9 * (1 - k);
      if (k >= 1) {
        this.group.remove(r.m);
        r.m.material.dispose();
        this.#rings.splice(i, 1);
      }
    }
  }

  #updateBurns(dt: number): void {
    const smoke = SMOKE_CHANCE * Math.min(1, SMOKE_BUDGET / Math.max(1, this.#burns.size));
    for (const [key, b] of this.#burns) {
      const ship = this.#lookup(b.side, b.cell);
      if (ship?.gone) {
        this.#burns.delete(key);
        continue;
      }
      b.acc += dt;
      const y = ship && ship.visible ? ship.y + 0.35 : this.#water(b.x, b.z) + 0.1;
      while (b.acc > BURN_STEP) {
        b.acc -= BURN_STEP;
        this.#pool.emit({ x: b.x + rnd(-0.18, 0.18), y, z: b.z + rnd(-0.18, 0.18), vx: rnd(-0.2, 0.2), vy: rnd(0.8, 1.6), vz: rnd(-0.2, 0.2), color: Math.random() < 0.6 ? "#ff7a2f" : "#ffd36b", size: rnd(0.18, 0.34), life: rnd(0.3, 0.6), gravity: 1.2 });
        if (Math.random() < smoke) {
          this.#pool.emit({ x: b.x, y: y + 0.5, z: b.z, vx: rnd(-0.2, 0.3), vy: rnd(0.9, 1.5), vz: rnd(-0.2, 0.2), color: "#3b3f44", size: 0.35, grow: 1.4, life: rnd(1.4, 2.4), gravity: 0.25, fade: 0.55 });
        }
      }
    }
  }

  update(t: number, dt: number): void {
    this.#time = t;
    this.#updateFlights(dt);
    this.#updateRings(dt);
    for (const b of this.#buoys.values()) b.m.position.y = this.#water(b.x, b.z) + 0.05;
    this.#updateBurns(dt);
    this.#pool.update(dt);
  }

  setClear(side: Side, cells: ReadonlySet<number>): void {
    const shown = this.#clear[side];
    for (const [cell, m] of shown) {
      if (cells.has(cell)) continue;
      this.group.remove(m);
      shown.delete(cell);
    }
    for (const cell of cells) {
      if (shown.has(cell)) continue;
      const c = cellCenter(side, cell);
      const m = new THREE.Mesh(this.#clearGeo, this.#clearMat);
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      m.position.set(c.x, 0.12, c.z);
      this.group.add(m);
      shown.set(cell, m);
    }
  }

  reset(side: Side): void {
    for (let i = this.#flights.length - 1; i >= 0; i--) {
      const f = this.#flights[i];
      if (!f || f.side !== side) continue;
      this.group.remove(f.m);
      this.#flights.splice(i, 1);
    }
    const prefix = `${side}:`;
    for (const [key, b] of this.#buoys) {
      if (!key.startsWith(prefix)) continue;
      this.group.remove(b.m);
      this.#buoys.delete(key);
    }
    for (const key of this.#burns.keys()) if (key.startsWith(prefix)) this.#burns.delete(key);
  }

  dispose(): void {
    for (const r of this.#rings) r.m.material.dispose();
    this.#ringGeo.dispose();
    this.#buoyGeo.dispose();
    this.#clearGeo.dispose();
    this.#clearMat.dispose();
    this.#buoyMat.dispose();
    this.#pool.dispose();
    this.group.clear();
  }
}
