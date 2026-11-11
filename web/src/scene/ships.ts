import * as THREE from "three";
import { seaHeight, seaTilt, type Wave } from "./gerstner";
import { BOARD_ORIGIN, cellCenter, isHorizontal, revealRise, shipCenter, type Point2 } from "./grid";
import type { ShipLook, Side } from "./types";

const SAIL = /sail|flag/;
const FLAG = /flag/;
const ENEMY_SAIL = "#7a1f3d";
const ENEMY_FLAG = "#ffcf5a";
const MY_FLAG = "#3fb6c9";
const SINK_RATE = 0.35;
const WRECK_DEPTH = 0.55;

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

  constructor(proto: THREE.Object3D, cells: readonly number[], side: Side, risen: boolean) {
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
      }
    });
    const n = cells.length;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const alongZ = size.z >= size.x;
    const len = alongZ ? size.z : size.x;
    const scale = (n === 1 ? 0.95 : n * 0.92) / len;
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
  }

  get gone(): boolean {
    return this.side === "mine" && this.sink >= 1;
  }

  update(f: ShipFrame): void {
    const { x, z } = this.base;
    const y = seaHeight(f.waves, x, z, f.t);
    const tilt = seaTilt(f.waves, x, z, f.t);
    if (this.side === "enemy") this.rise = Math.max(this.rise, revealRise(f.reveal, x - BOARD_ORIGIN.enemy.x));
    const depth = this.side === "enemy" ? WRECK_DEPTH : 1;
    if (this.sunk && this.rise >= 1) this.sink = Math.min(depth, this.sink + f.dt * SINK_RATE);
    this.root.visible = this.rise > 0 && !this.gone;
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
