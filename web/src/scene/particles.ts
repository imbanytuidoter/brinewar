import * as THREE from "three";

export interface Emission {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly color: string;
  readonly size: number;
  readonly life: number;
  readonly gravity?: number;
  readonly grow?: number;
  readonly fade?: number;
}

const VERTEX = `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
uniform float uScale; void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*uScale/-mv.z; gl_Position=projectionMatrix*mv; }`;
const FRAGMENT = `uniform sampler2D uTex; varying vec3 vC; varying float vA; void main(){ vec4 t=texture2D(uTex,gl_PointCoord); gl_FragColor=vec4(vC, t.a*vA); }`;

function dotTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.4, "rgba(255,255,255,.7)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

export class ParticlePool {
  readonly points: THREE.Points;
  readonly #max: number;
  readonly #geo = new THREE.BufferGeometry();
  readonly #mat: THREE.ShaderMaterial;
  readonly #tex = dotTexture();
  readonly #pos: Float32Array;
  readonly #col: Float32Array;
  readonly #size: Float32Array;
  readonly #alpha: Float32Array;
  readonly #vel: Float32Array;
  readonly #life: Float32Array;
  readonly #maxLife: Float32Array;
  readonly #gravity: Float32Array;
  readonly #grow: Float32Array;
  readonly #fade: Float32Array;
  readonly #colors = new Map<string, THREE.Color>();
  #count = 0;
  #next = 0;

  constructor(max: number) {
    this.#max = max;
    this.#pos = new Float32Array(max * 3);
    this.#col = new Float32Array(max * 3);
    this.#vel = new Float32Array(max * 3);
    this.#size = new Float32Array(max);
    this.#alpha = new Float32Array(max);
    this.#life = new Float32Array(max);
    this.#maxLife = new Float32Array(max);
    this.#gravity = new Float32Array(max);
    this.#grow = new Float32Array(max);
    this.#fade = new Float32Array(max);
    this.#geo.setAttribute("position", new THREE.BufferAttribute(this.#pos, 3));
    this.#geo.setAttribute("color", new THREE.BufferAttribute(this.#col, 3));
    this.#geo.setAttribute("size", new THREE.BufferAttribute(this.#size, 1));
    this.#geo.setAttribute("alpha", new THREE.BufferAttribute(this.#alpha, 1));
    this.#mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.#tex }, uScale: { value: 300 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.#geo, this.#mat);
    this.points.frustumCulled = false;
    this.#geo.setDrawRange(0, 0);
  }

  setViewportHeight(h: number): void {
    const u = this.#mat.uniforms.uScale;
    if (u) u.value = h * 0.9;
  }

  #color(hex: string): THREE.Color {
    let c = this.#colors.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      this.#colors.set(hex, c);
    }
    return c;
  }

  emit(e: Emission): void {
    let i: number;
    if (this.#count < this.#max) {
      i = this.#count++;
    } else {
      i = this.#next;
      this.#next = (this.#next + 1) % this.#max;
    }
    const c = this.#color(e.color);
    this.#pos.set([e.x, e.y, e.z], i * 3);
    this.#vel.set([e.vx, e.vy, e.vz], i * 3);
    this.#col.set([c.r, c.g, c.b], i * 3);
    this.#size[i] = e.size;
    this.#life[i] = e.life;
    this.#maxLife[i] = e.life;
    this.#gravity[i] = e.gravity ?? -9.8;
    this.#grow[i] = e.grow ?? 0;
    this.#fade[i] = e.fade ?? 1;
  }

  #move(from: number, to: number): void {
    this.#pos.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.#vel.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.#col.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.#size[to] = this.#size[from] ?? 0;
    this.#life[to] = this.#life[from] ?? 0;
    this.#maxLife[to] = this.#maxLife[from] ?? 1;
    this.#gravity[to] = this.#gravity[from] ?? 0;
    this.#grow[to] = this.#grow[from] ?? 0;
    this.#fade[to] = this.#fade[from] ?? 1;
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.#count) {
      const life = (this.#life[i] ?? 0) - dt;
      this.#life[i] = life;
      const y = this.#pos[i * 3 + 1] ?? 0;
      if (life <= 0 || y < -0.3) {
        this.#count--;
        if (i !== this.#count) this.#move(this.#count, i);
        if (this.#next >= this.#count) this.#next = 0;
        continue;
      }
      const vy = (this.#vel[i * 3 + 1] ?? 0) + (this.#gravity[i] ?? 0) * dt;
      this.#vel[i * 3 + 1] = vy;
      this.#pos[i * 3] = (this.#pos[i * 3] ?? 0) + (this.#vel[i * 3] ?? 0) * dt;
      this.#pos[i * 3 + 1] = y + vy * dt;
      this.#pos[i * 3 + 2] = (this.#pos[i * 3 + 2] ?? 0) + (this.#vel[i * 3 + 2] ?? 0) * dt;
      this.#size[i] = (this.#size[i] ?? 0) + (this.#grow[i] ?? 0) * dt;
      this.#alpha[i] = Math.min(1, (life / (this.#maxLife[i] ?? 1)) * 1.6) * (this.#fade[i] ?? 1);
      i++;
    }
    this.#geo.setDrawRange(0, this.#count);
    for (const k of ["position", "color", "size", "alpha"]) {
      const attr = this.#geo.getAttribute(k);
      attr.needsUpdate = true;
    }
  }

  clear(): void {
    this.#count = 0;
    this.#next = 0;
    this.#geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.#geo.dispose();
    this.#mat.dispose();
    this.#tex.dispose();
  }
}
