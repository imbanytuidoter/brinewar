export type Rgb = readonly [number, number, number];

export interface Pixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

const OPAQUE = 128;
const TRIM_SATURATION = 0.4;
const TRIM_LIGHT = 0.62;
const MARK_SPREAD = 40;
const MARK_LIGHT = 150;
const WOOD_SATURATION = 0.28;
const MIN_CONTRAST = 1.8;
const LIGHT_MARK: Rgb = [244, 247, 248];
const DARK_MARK: Rgb = [22, 34, 46];

export function parseHex(color: string): Rgb | null {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const lum = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

const saturation = (r: number, g: number, b: number): number => {
  const hi = Math.max(r, g, b);
  return hi === 0 ? 0 : (hi - Math.min(r, g, b)) / hi;
};

function relative(c: Rgb): number {
  const ch = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (ch[0] as number) + 0.7152 * (ch[1] as number) + 0.0722 * (ch[2] as number);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relative(a), relative(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function markColor(sail: Rgb, flag: Rgb): Rgb {
  if (contrast(sail, flag) >= MIN_CONTRAST) return flag;
  return contrast(sail, LIGHT_MARK) >= contrast(sail, DARK_MARK) ? LIGHT_MARK : DARK_MARK;
}

function dominant(px: Pixels, keep: (r: number, g: number, b: number) => boolean = () => true): Rgb {
  const counts = new Map<number, number>();
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    if ((d[i + 3] as number) < OPAQUE) continue;
    const r = d[i] as number;
    const g = d[i + 1] as number;
    const b = d[i + 2] as number;
    if (!keep(r, g, b)) continue;
    const key = (r << 16) | (g << 8) | b;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 0;
  let top = -1;
  for (const [key, n] of counts) if (n > top) [best, top] = [key, n];
  return [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}

const isTrim = (r: number, g: number, b: number): boolean => saturation(r, g, b) > TRIM_SATURATION && lum(r, g, b) < 255 * TRIM_LIGHT && r > b;

const isMark = (r: number, g: number, b: number): boolean => Math.max(r, g, b) - Math.min(r, g, b) < MARK_SPREAD && lum(r, g, b) > MARK_LIGHT;

const isWood = (r: number, g: number, b: number): boolean => r > g && g > b && saturation(r, g, b) > WOOD_SATURATION;

function shade(out: Uint8ClampedArray, i: number, color: Rgb, k: number): void {
  out[i] = Math.min(255, color[0] * k);
  out[i + 1] = Math.min(255, color[1] * k);
  out[i + 2] = Math.min(255, color[2] * k);
}

function recolor(base: Pixels, color: Rgb, pick: (r: number, g: number, b: number) => boolean): Uint8ClampedArray {
  const ref = dominant(base, pick);
  const refLum = Math.max(1, lum(...ref));
  const out = new Uint8ClampedArray(base.data);
  for (let i = 0; i < out.length; i += 4) {
    if ((out[i + 3] as number) === 0) continue;
    const r = out[i] as number;
    const g = out[i + 1] as number;
    const b = out[i + 2] as number;
    if (!pick(r, g, b)) continue;
    shade(out, i, color, lum(r, g, b) / refLum);
  }
  return out;
}

export function tintSail(base: Pixels, emblem: Pixels | null, sail: Rgb, mark: Rgb): Uint8ClampedArray {
  const out = recolor(base, sail, (r, g, b) => !isTrim(r, g, b));
  if (!emblem) return out;
  const e = emblem.data;
  const w = Math.min(base.width, emblem.width);
  const h = Math.min(base.height, emblem.height);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * emblem.width + x) * 4;
      const t = (y * base.width + x) * 4;
      if ((e[s + 3] as number) < OPAQUE || (out[t + 3] as number) < OPAQUE) continue;
      const r = e[s] as number;
      const g = e[s + 1] as number;
      const b = e[s + 2] as number;
      if (!isMark(r, g, b)) continue;
      shade(out, t, mark, lum(r, g, b) / 255);
    }
  }
  return out;
}

export function tintFlag(base: Pixels, color: Rgb): Uint8ClampedArray {
  return recolor(base, color, () => true);
}

export function tintHull(base: Pixels, color: Rgb): Uint8ClampedArray {
  return recolor(base, color, isWood);
}
