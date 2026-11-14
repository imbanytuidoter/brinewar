import type { Island, Vec } from "./world";

interface Bounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

const CREST_CELL = 95;
const CLOUD_COUNT = 6;
const GULL_ISLES = 4;
const RIPPLE_PERIOD = 2.6;

function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function drawCrests(c: CanvasRenderingContext2D, b: Bounds, t: number): void {
  c.lineCap = "round";
  c.lineWidth = 2.2;
  const gx0 = Math.floor(b.x0 / CREST_CELL);
  const gy0 = Math.floor(b.y0 / CREST_CELL);
  const gx1 = Math.ceil(b.x1 / CREST_CELL);
  const gy1 = Math.ceil(b.y1 / CREST_CELL);
  for (let gx = gx0; gx <= gx1; gx++)
    for (let gy = gy0; gy <= gy1; gy++) {
      const h = hash(gx, gy);
      const glow = Math.sin(t * (0.6 + h * 0.5) + h * 40);
      if (glow < 0.35) continue;
      const a = ((glow - 0.35) / 0.65) ** 2 * 0.5;
      const x = (gx + hash(gy, gx)) * CREST_CELL + Math.sin(t * 0.4 + h * 9) * 6;
      const y = (gy + h) * CREST_CELL;
      const len = 9 + h * 10;
      c.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      c.beginPath();
      c.moveTo(x - len, y + 2);
      c.quadraticCurveTo(x, y - 4, x + len, y + 2);
      c.stroke();
    }
}

export function drawShallows(c: CanvasRenderingContext2D, isles: readonly Island[], t: number, seen: (p: Vec) => boolean): void {
  for (const [i, isle] of isles.entries()) {
    if (!seen(isle)) continue;
    const r = isle.radius;
    const halo = c.createRadialGradient(isle.x, isle.y, r * 0.6, isle.x, isle.y, r * 1.55);
    halo.addColorStop(0, "rgba(120,236,226,0.55)");
    halo.addColorStop(0.55, "rgba(90,214,220,0.28)");
    halo.addColorStop(1, "rgba(90,214,220,0)");
    c.fillStyle = halo;
    c.beginPath();
    c.arc(isle.x, isle.y, r * 1.55, 0, Math.PI * 2);
    c.fill();
    for (let k = 0; k < 2; k++) {
      const pulse = (t * 0.35 + i * 0.37 + k * 0.5) % 1;
      c.strokeStyle = `rgba(255,255,255,${(0.45 * (1 - pulse)).toFixed(3)})`;
      c.lineWidth = 2.5;
      c.beginPath();
      c.ellipse(isle.x, isle.y, r * (0.98 + pulse * 0.32), r * (0.9 + pulse * 0.3), 0, 0, Math.PI * 2);
      c.stroke();
    }
  }
}

export function drawRipples(c: CanvasRenderingContext2D, at: Vec, t: number, seed: number): void {
  for (let k = 0; k < 2; k++) {
    const p = ((t + seed * 1.7 + k * RIPPLE_PERIOD * 0.5) % RIPPLE_PERIOD) / RIPPLE_PERIOD;
    c.strokeStyle = `rgba(255,255,255,${(0.4 * (1 - p)).toFixed(3)})`;
    c.lineWidth = 1.6;
    c.beginPath();
    c.ellipse(at.x, at.y, 22 + p * 26, 30 + p * 30, 0, 0, Math.PI * 2);
    c.stroke();
  }
}

export function drawWakeV(c: CanvasRenderingContext2D, at: Vec, heading: number, t: number): void {
  const back = { x: at.x - Math.cos(heading) * 24, y: at.y - Math.sin(heading) * 24 };
  const spread = 0.42 + Math.sin(t * 3) * 0.04;
  c.lineWidth = 2.4;
  for (const side of [-1, 1]) {
    const a = heading + Math.PI + side * spread;
    const grad = c.createLinearGradient(back.x, back.y, back.x + Math.cos(a) * 70, back.y + Math.sin(a) * 70);
    grad.addColorStop(0, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    c.strokeStyle = grad;
    c.beginPath();
    c.moveTo(back.x, back.y);
    c.lineTo(back.x + Math.cos(a) * 70, back.y + Math.sin(a) * 70);
    c.stroke();
  }
}

export function drawClouds(c: CanvasRenderingContext2D, worldW: number, worldH: number, t: number, seen: (p: Vec) => boolean): void {
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const w = 260 + hash(i, 1) * 260;
    const span = worldW + w * 2;
    const x = ((hash(i, 2) * span + t * (10 + hash(i, 3) * 8)) % span) - w;
    const y = hash(i, 4) * worldH;
    if (!seen({ x, y })) continue;
    const shadow = c.createRadialGradient(x + 60, y + 90, 0, x + 60, y + 90, w * 0.6);
    shadow.addColorStop(0, "rgba(8,40,60,0.16)");
    shadow.addColorStop(1, "rgba(8,40,60,0)");
    c.fillStyle = shadow;
    c.beginPath();
    c.ellipse(x + 60, y + 90, w * 0.6, w * 0.36, 0, 0, Math.PI * 2);
    c.fill();
    const puff = c.createRadialGradient(x, y, 0, x, y, w * 0.55);
    puff.addColorStop(0, "rgba(255,255,255,0.32)");
    puff.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = puff;
    c.beginPath();
    c.ellipse(x, y, w * 0.55, w * 0.32, 0, 0, Math.PI * 2);
    c.fill();
  }
}

export function drawGulls(c: CanvasRenderingContext2D, isles: readonly Island[], t: number, seen: (p: Vec) => boolean): void {
  const big = [...isles].sort((a, b) => b.radius - a.radius).slice(0, GULL_ISLES);
  for (const [i, isle] of big.entries()) {
    for (let j = 0; j < 2; j++) {
      const dir = j === 0 ? 1 : -1;
      const r = isle.radius * (1.25 + j * 0.35);
      const a = i * 2 + j * 3 + t * (0.28 + j * 0.07) * dir;
      const x = isle.x + Math.cos(a) * r;
      const y = isle.y + Math.sin(a) * r * 0.75;
      if (!seen({ x, y })) continue;
      const flap = Math.sin(t * 9 + i * 3 + j) * 5;
      const heading = Math.atan2(Math.cos(a) * 0.75 * dir, -Math.sin(a) * dir);
      c.save();
      c.fillStyle = "rgba(8,40,60,0.18)";
      c.beginPath();
      c.ellipse(x + 18, y + 26, 7, 3, 0, 0, Math.PI * 2);
      c.fill();
      c.translate(x, y);
      c.rotate(heading);
      c.strokeStyle = "rgba(255,255,255,0.95)";
      c.lineWidth = 2.6;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(-11, -flap);
      c.quadraticCurveTo(-5, -4, 0, 0);
      c.quadraticCurveTo(5, -4, 11, -flap);
      c.stroke();
      c.restore();
    }
  }
}
