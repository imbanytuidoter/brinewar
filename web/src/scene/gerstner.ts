export interface Wave {
  readonly dx: number;
  readonly dz: number;
  readonly k: number;
  readonly c: number;
  readonly a: number;
}

const GRAVITY = 9.8;
const REDUCED_AMPLITUDE = 0.4;

const SPEC: ReadonlyArray<{ readonly dir: readonly [number, number]; readonly steep: number; readonly len: number }> = [
  { dir: [1.0, 0.35], steep: 0.075, len: 14 },
  { dir: [-0.45, 1.0], steep: 0.05, len: 8.5 },
  { dir: [0.7, -0.6], steep: 0.03, len: 4.6 },
];

export function makeWaves(reduced: boolean): Wave[] {
  return SPEC.map((w) => {
    const l = Math.hypot(w.dir[0], w.dir[1]);
    const k = (2 * Math.PI) / w.len;
    return { dx: w.dir[0] / l, dz: w.dir[1] / l, k, c: Math.sqrt(GRAVITY / k), a: ((reduced ? REDUCED_AMPLITUDE : 1) * w.steep) / k };
  });
}

export const CALM = 0.3;
export const CALM_HALF_X = 11.5;
export const CALM_HALF_Z = 5.5;
export const CALM_FADE = 6;

export function calm(x: number, z: number): number {
  const dx = Math.max(Math.abs(x) - CALM_HALF_X, 0);
  const dz = Math.max(Math.abs(z) - CALM_HALF_Z, 0);
  const s = Math.min(1, Math.hypot(dx, dz) / CALM_FADE);
  return CALM + (1 - CALM) * s * s * (3 - 2 * s);
}

export function seaHeight(waves: readonly Wave[], x: number, z: number, t: number): number {
  let y = 0;
  for (const w of waves) y += w.a * Math.sin(w.k * (w.dx * x + w.dz * z - w.c * t));
  return y * calm(x, z);
}

export interface Tilt {
  readonly pitch: number;
  readonly roll: number;
}

export function seaTilt(waves: readonly Wave[], x: number, z: number, t: number, e = 0.35): Tilt {
  return {
    pitch: Math.atan2(seaHeight(waves, x + e, z, t) - seaHeight(waves, x - e, z, t), 2 * e),
    roll: Math.atan2(seaHeight(waves, x, z + e, t) - seaHeight(waves, x, z - e, t), 2 * e),
  };
}
