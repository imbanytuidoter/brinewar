import * as THREE from "three";
import { seaHeight, seaTilt, type Wave } from "./gerstner";
import { BOARD_ORIGIN, cellCenter, isHorizontal, revealRise, shipCenter, type Point2 } from "./grid";
import type { LightSpot, Rig, ShipFinish, ShipLights, ShipLook, ShipParts, Side } from "./types";

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

interface ShipFrame {
  readonly t: number;
  readonly dt: number;
  readonly waves: readonly Wave[];
  readonly reduced: boolean;
  readonly reveal: number;
  readonly bubble: (x: number, z: number) => void;
  readonly glint?: (x: number, y: number, z: number, color: string) => void;
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
  const cannons = rig === "cannons" || rig === "warship" || rig === "broadside" || rig === "flagship";
  const pennants = rig === "pennants" || rig === "warship" || rig === "flagship";
  const banners = rig === "banners" || rig === "warship" || rig === "broadside" || rig === "flagship";
  const decks = rig === "flagship" ? [deck, deck + size.y * 0.11] : [deck];
  if (cannons) {
    const count = rig === "flagship" ? Math.max(2, n) : Math.max(1, n - 1);
    for (const [row, y] of decks.entries()) {
      const spread = row === 0 ? 0.44 : 0.3;
      for (let k = 0; k < count; k++) {
        const along = (count === 1 ? 0 : -spread / 2 + (spread * k) / (count - 1)) * long;
        for (const side of [-1, 1]) place(model, parts.cannon, at(along, side * wide * (row === 0 ? 0.4 : 0.36), y), row === 0 ? 1.05 : 0.9, turn(side), materials);
      }
    }
  }
  if (rig === "flagship") {
    for (const end of [-1, 1]) place(model, parts.banner, at(end * long * 0.42, 0, deck), 2.6, alongZ ? 0 : Math.PI / 2, materials, true);
  }
  if (pennants) {
    for (const end of [-1, 1]) place(model, parts.pennant, at(end * long * 0.4, 0, deck), 1.9, alongZ ? 0 : Math.PI / 2, materials, true);
  }
  if (banners) {
    place(model, parts.banner, at(-long * 0.36, wide * 0.25, deck), 2.2, alongZ ? 0 : Math.PI / 2, materials, true);
    place(model, parts.banner, at(-long * 0.36, -wide * 0.25, deck), 2.2, alongZ ? 0 : Math.PI / 2, materials, true);
  }
}

const LIGHT_WORLD_SIZE = 0.6;
let glowTexture: THREE.Texture | null = null;

function glowMap(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.65)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

export interface Lamp {
  readonly sprite: THREE.Sprite;
  readonly mat: THREE.SpriteMaterial;
  readonly phase: number;
}

export function glowSprite(color: string): { readonly sprite: THREE.Sprite; readonly mat: THREE.SpriteMaterial } {
  const mat = new THREE.SpriteMaterial({ map: glowMap(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  return { sprite: new THREE.Sprite(mat), mat };
}

export function placeLamps(model: THREE.Object3D, box: THREE.Box3, size: THREE.Vector3, alongZ: boolean, scale: number, n: number, lights: ShipLights): Lamp[] {
  const c = box.getCenter(new THREE.Vector3());
  const long = alongZ ? size.z : size.x;
  const deck = box.min.y + size.y * 0.32;
  const top = box.max.y * 0.94;
  const at = (along: number, y: number): THREE.Vector3 => (alongZ ? new THREE.Vector3(c.x, y, c.z + along) : new THREE.Vector3(c.x + along, y, c.z));
  const spots: THREE.Vector3[] = [];
  for (const spot of lights.at as readonly LightSpot[]) {
    if (spot === "lanterns") spots.push(at(long * 0.46, deck), at(-long * 0.46, deck));
    else if (n >= 3) spots.push(at(-long * 0.16, top), at(long * 0.14, top));
    else spots.push(at(0, top));
  }
  return spots.map((p, i) => {
    const { sprite, mat } = glowSprite(lights.color);
    sprite.position.copy(p);
    sprite.scale.setScalar(LIGHT_WORLD_SIZE / scale);
    sprite.renderOrder = 4;
    model.add(sprite);
    return { sprite, mat, phase: i * 1.3 + Math.random() };
  });
}

export function lampBeat(t: number, phase: number, flicker: boolean): number {
  return flicker ? 0.55 + 0.45 * Math.abs(Math.sin(t * 7.3 + phase) * Math.sin(t * 3.1 + phase * 2)) : 0.82 + 0.18 * Math.sin(t * 2.4 + phase);
}

export function applyFinish(hulls: readonly THREE.MeshStandardMaterial[], sails: readonly THREE.MeshStandardMaterial[], finish: ShipFinish | null, base: Map<THREE.MeshStandardMaterial, { metal: number; rough: number }>): void {
  for (const m of hulls) {
    if (!base.has(m)) base.set(m, { metal: m.metalness, rough: m.roughness });
    const b = base.get(m) as { metal: number; rough: number };
    m.metalness = finish ? finish.metal : b.metal;
    m.roughness = finish ? finish.rough : b.rough;
    m.emissive.set(finish ? finish.glow : "#000000");
    m.emissiveIntensity = finish ? finish.glowPower : 1;
  }
  for (const m of sails) {
    m.emissive.set(finish?.sailGlow ? finish.glow : "#000000");
    m.emissiveIntensity = finish?.sailGlow ?? 1;
  }
}

interface Hull3 {
  readonly model: THREE.Object3D;
  readonly box: THREE.Box3;
  readonly size: THREE.Vector3;
  readonly alongZ: boolean;
  readonly scale: number;
}

const FOAM_OPACITY = 0.42;
const FOAM_PULSE = 0.12;
const YAW_SWAY = 0.03;
let foamTexture: THREE.Texture | null = null;

function foamMap(): THREE.Texture {
  if (foamTexture) return foamTexture;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,255,255,0.05)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.35)");
    grad.addColorStop(0.78, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  foamTexture = new THREE.CanvasTexture(c);
  return foamTexture;
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
  readonly #foam: THREE.Mesh;
  #hull3: Hull3 | null = null;
  #lamps: Lamp[] = [];
  #flicker = false;
  #aura: { readonly color: string; readonly rate: number } | null = null;
  readonly #finishBase = new Map<THREE.MeshStandardMaterial, { metal: number; rough: number }>();
  readonly #foamMat: THREE.MeshBasicMaterial;
  readonly #phase = Math.random() * Math.PI * 2;

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
    this.#hull3 = { model, box, size, alongZ, scale };
    this.#foamMat = new THREE.MeshBasicMaterial({ map: foamMap(), transparent: true, opacity: FOAM_OPACITY, depthWrite: false });
    this.#materials.push(this.#foamMat);
    this.#foam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.#foamMat);
    this.#foam.rotation.x = -Math.PI / 2;
    this.#foam.scale.set(n * 1.08 + 0.35, 0.95, 1);
    this.#foam.position.y = 0.04;
    this.#foam.renderOrder = 1;
    this.root.add(this.#foam);
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
    this.#applyFinish(look);
    this.#placeLamps(look);
    this.#aura = look?.aura ?? null;
  }

  #applyFinish(look: ShipLook | null): void {
    applyFinish(this.#hullMats, this.#sailMats, look?.finish ?? null, this.#finishBase);
  }

  #placeLamps(look: ShipLook | null): void {
    for (const l of this.#lamps) {
      l.sprite.removeFromParent();
      l.mat.dispose();
    }
    this.#lamps = [];
    const lights = look?.lights;
    const h = this.#hull3;
    if (!lights || !h) return;
    this.#flicker = lights.flicker ?? false;
    this.#lamps = placeLamps(h.model, h.box, h.size, h.alongZ, h.scale, this.cells.length, lights);
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
    this.pivot.rotation.y = f.reduced ? 0 : Math.sin(f.t * 0.33 + this.#phase) * YAW_SWAY;
    this.#foam.visible = this.sink < 0.25;
    for (const l of this.#lamps) {
      l.sprite.visible = this.sink < 0.25;
      l.mat.opacity = f.reduced ? 0.9 : lampBeat(f.t, l.phase, this.#flicker);
    }
    const aura = this.#aura;
    if (aura && f.glint && !f.reduced && this.root.visible && this.sink < 0.25 && Math.random() < aura.rate * f.dt * this.cells.length) {
      const cell = this.cells[Math.floor(Math.random() * this.cells.length)] ?? 0;
      const p = cellCenter(this.side, cell);
      f.glint(p.x + (Math.random() - 0.5) * 0.7, y + 0.25 + Math.random() * 0.6, p.z + (Math.random() - 0.5) * 0.7, aura.color);
    }
    if (!f.reduced) {
      const k = Math.sin(f.t * 1.6 + this.#phase);
      this.#foamMat.opacity = FOAM_OPACITY + FOAM_PULSE * k;
      this.#foam.scale.y = 0.95 + 0.06 * k;
    }
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
    for (const l of this.#lamps) l.mat.dispose();
    for (const m of this.#materials) m.dispose();
    this.#materials.length = 0;
    this.#foam.geometry.dispose();
  }
}
