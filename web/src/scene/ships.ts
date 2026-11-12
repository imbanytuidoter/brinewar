import * as THREE from "three";
import { seaHeight, seaTilt, type Wave } from "./gerstner";
import { BOARD_ORIGIN, cellCenter, isHorizontal, revealRise, shipCenter, type Point2 } from "./grid";
import type { Rig, ShipLook, ShipParts, Side } from "./types";

const SAIL = /sail|flag/;
const FLAG = /flag/;
const ENEMY_SAIL = "#7a1f3d";
const ENEMY_FLAG = "#ffcf5a";
const MY_FLAG = "#3fb6c9";
const SINK_RATE = 0.35;
const WRECK_DEPTH = 0.3;

interface Sail {
  readonly o: THREE.Object3D;
  readonly base: THREE.Vector3;
  readonly phase: number;
}

export interface ShipFrame {
  readonly t: number;
  readonly dt: number;
  readonly waves: readonly Wave[];
  readonly reduced: boolean;
  readonly reveal: number;
  readonly bubble: (x: number, z: number) => void;
}

const GHOST_TINT = "#d7e8ee";
const GHOST_GLOW = "#6fa3b5";
const GHOST_OPACITY = 0.78;

export function haunt(materials: readonly THREE.Material[]): void {
  for (const m of materials) {
    if (!(m instanceof THREE.MeshStandardMaterial)) continue;
    m.transparent = true;
    m.opacity = GHOST_OPACITY;
    m.emissive.set(GHOST_GLOW);
    m.emissiveIntensity = 0.45;
    m.color.lerp(new THREE.Color(GHOST_TINT), 0.6);
  }
}

export const RIG_FLAG = "flag-rig";

function place(model: THREE.Object3D, proto: THREE.Object3D, at: THREE.Vector3, scale: number, turn: number, materials: THREE.Material[], flag = false): void {
  const o = proto.clone(true);
  o.traverse((m) => {
    if (flag) m.name = RIG_FLAG;
    if (m instanceof THREE.Mesh && !Array.isArray(m.material)) {
      m.material = (m.material as THREE.Material).clone();
      materials.push(m.material as THREE.Material);
    }
  });
  o.scale.setScalar(scale);
  o.position.copy(at);
  o.rotation.y = turn;
  model.add(o);
}

export function rigUp(model: THREE.Object3D, box: THREE.Box3, size: THREE.Vector3, alongZ: boolean, n: number, rig: Rig, parts: ShipParts, materials: THREE.Material[]): void {
  const deck = box.min.y + size.y * 0.24;
  const c = box.getCenter(new THREE.Vector3());
  const long = alongZ ? size.z : size.x;
  const wide = alongZ ? size.x : size.z;
  const at = (along: number, across: number, y: number): THREE.Vector3 =>
    alongZ ? new THREE.Vector3(c.x + across, y, c.z + along) : new THREE.Vector3(c.x + along, y, c.z + across);
  const turn = (side: number): number => (alongZ ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? 0 : Math.PI);
  const cannons = rig === "cannons" || rig === "warship";
  const pennants = rig === "pennants" || rig === "warship";
  const banners = rig === "banners" || rig === "warship";
  if (cannons) {
    const count = Math.max(1, n - 1);
    for (let k = 0; k < count; k++) {
      const along = (count === 1 ? 0 : -0.22 + (0.44 * k) / (count - 1)) * long;
      for (const side of [-1, 1]) place(model, parts.cannon, at(along, side * wide * 0.4, deck), 1.05, turn(side), materials);
    }
  }
  if (pennants) {
    for (const end of [-1, 1]) place(model, parts.pennant, at(end * long * 0.4, 0, deck), 1.9, alongZ ? 0 : Math.PI / 2, materials, true);
  }
  if (banners) {
    place(model, parts.banner, at(-long * 0.36, wide * 0.25, deck), 2.2, alongZ ? 0 : Math.PI / 2, materials, true);
    place(model, parts.banner, at(-long * 0.36, -wide * 0.25, deck), 2.2, alongZ ? 0 : Math.PI / 2, materials, true);
  }
}

export class ShipActor {
  readonly root = new THREE.Group();
  readonly pivot = new THREE.Group();
  readonly cells: readonly number[];
  readonly side: Side;
  readonly base: Point2;
  sunk = false;
  sink = 0;
  rise: number;
  readonly #sails: Sail[] = [];
  readonly #materials: THREE.Material[] = [];
  readonly #sailMats: THREE.MeshStandardMaterial[] = [];
  readonly #flagMats: THREE.MeshStandardMaterial[] = [];
  readonly #sailBase = new THREE.Color();
  readonly #hullMats: THREE.MeshStandardMaterial[] = [];
  readonly #hullBase = new THREE.Color();

  constructor(proto: THREE.Object3D, cells: readonly number[], side: Side, risen: boolean, rig: Rig = "plain", parts: ShipParts | null = null) {
    this.cells = cells;
    this.side = side;
    this.rise = side === "enemy" && !risen ? 0 : 1;
    const enemy = side === "enemy";
    const model = proto.clone(true);
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const src = o.material as THREE.Material | THREE.Material[];
      if (Array.isArray(src)) return;
      const mat = src.clone();
      this.#materials.push(mat);
      o.material = mat;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;
      if (enemy && SAIL.test(o.name)) mat.color.set(FLAG.test(o.name) ? ENEMY_FLAG : ENEMY_SAIL);
      if (!enemy && FLAG.test(o.name)) {
        mat.color.set(MY_FLAG);
        this.#flagMats.push(mat);
      } else if (!enemy && SAIL.test(o.name)) {
        this.#sailBase.copy(mat.color);
        this.#sailMats.push(mat);
      } else if (!enemy) {
        this.#hullBase.copy(mat.color);
        this.#hullMats.push(mat);
      }
    });
    const n = cells.length;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const alongZ = size.z >= size.x;
    const len = alongZ ? size.z : size.x;
    const scale = (n === 1 ? 0.95 : n * 0.92) / len;
    if (!enemy && parts && n > 1) {
      rigUp(model, box, size, alongZ, n, rig, parts, this.#materials);
      model.traverse((o) => {
        if (o.name === RIG_FLAG && o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) this.#flagMats.push(o.material);
      });
    }
    if (!enemy && rig === "ghost") haunt(this.#materials);
    model.scale.setScalar(scale);
    const c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x * scale, -box.min.y * scale - 0.18 * scale * size.y, -c.z * scale);
    const inner = new THREE.Group();
    inner.add(model);
    if (alongZ) inner.rotation.y = Math.PI / 2;
    this.pivot.add(inner);
    this.root.add(this.pivot);
    if (!isHorizontal(cells)) this.root.rotation.y = Math.PI / 2;
    if (enemy) this.root.rotation.y += Math.PI;
    this.base = shipCenter(side, cells);
    this.root.position.set(this.base.x, 0, this.base.z);
    model.traverse((o) => {
      if (SAIL.test(o.name)) this.#sails.push({ o, base: o.scale.clone(), phase: Math.random() * 6 });
    });
  }

  setLook(look: ShipLook | null): void {
    for (const m of this.#sailMats) m.color.copy(look ? new THREE.Color(look.sail) : this.#sailBase);
    for (const m of this.#flagMats) m.color.set(look ? look.flag : MY_FLAG);
    for (const m of this.#hullMats) m.color.copy(look?.hull ? new THREE.Color(look.hull) : this.#hullBase);
  }

  get gone(): boolean {
    return false;
  }

  update(f: ShipFrame): void {
    const { x, z } = this.base;
    const y = seaHeight(f.waves, x, z, f.t);
    const tilt = seaTilt(f.waves, x, z, f.t);
    if (this.side === "enemy") this.rise = Math.max(this.rise, revealRise(f.reveal, x - BOARD_ORIGIN.enemy.x));
    const depth = WRECK_DEPTH;
    if (this.sunk && this.rise >= 1) this.sink = Math.min(depth, this.sink + f.dt * SINK_RATE);
    this.root.visible = this.rise > 0;
    this.root.position.set(x, y - this.sink * 1.4 + (1 - this.rise) * -1.6, z);
    const lean = this.side === "enemy" ? -1 : 1;
    this.pivot.rotation.x = -tilt.roll * 0.8 - this.sink * 0.5;
    this.pivot.rotation.z = tilt.pitch * 0.8 + this.sink * 0.35 * lean;
    for (const s of this.#sails) {
      const k = f.reduced ? 0 : 0.06 * Math.sin(f.t * 2.4 + s.phase);
      s.o.scale.set(s.base.x * (1 + k), s.base.y, s.base.z * (1 + k * 0.6));
    }
    if (this.sunk && this.sink < depth && this.rise >= 1 && Math.random() < 0.5) {
      const cell = this.cells[Math.floor(Math.random() * this.cells.length)] ?? 0;
      const c = cellCenter(this.side, cell);
      f.bubble(c.x, c.z);
    }
  }

  dispose(): void {
    for (const m of this.#materials) m.dispose();
    this.#materials.length = 0;
  }
}
