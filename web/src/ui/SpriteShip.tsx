import { cn } from "@/lib/utils";

const SEG = 100;
const HULL_W = 62;
const HULL_SRC_W = 100;
const HULL_SRC_H = 216;
const BOW_SRC = 68;
const STERN_SRC = 60;
const SAIL_W = 88;
const SAIL_H = 63;
const FLAG_W = 9;
const FLAG_H = 33;

export type ShipState = "intact" | "damaged" | "sunk";

interface SpriteShipProps {
  readonly length: number;
  readonly vertical?: boolean;
  readonly sail?: number;
  readonly flag?: number;
  readonly state?: ShipState;
  readonly hits?: readonly boolean[];
  readonly className?: string;
}

function Slice({ y, h, srcY, srcH, href }: { readonly y: number; readonly h: number; readonly srcY: number; readonly srcH: number; readonly href: string }) {
  return (
    <svg x={(SEG - HULL_W) / 2} y={y} width={HULL_W} height={h} viewBox={`0 ${srcY} ${HULL_SRC_W} ${srcH}`} preserveAspectRatio="none" overflow="hidden">
      <image href={href} width={HULL_SRC_W} height={HULL_SRC_H} />
    </svg>
  );
}

function Hull({ len, href }: { readonly len: number; readonly href: string }) {
  const total = len * SEG - 8;
  const bow = (HULL_W * BOW_SRC) / HULL_SRC_W;
  const stern = (HULL_W * STERN_SRC) / HULL_SRC_W;
  const top = 4;
  if (total < bow + stern + 4) {
    const w = (total * HULL_SRC_W) / HULL_SRC_H;
    return <image href={href} x={(SEG - w) / 2} y={top} width={w} height={total} preserveAspectRatio="none" />;
  }
  const mid = total - bow - stern;
  return (
    <g>
      <Slice y={top} h={bow + 0.5} srcY={0} srcH={BOW_SRC} href={href} />
      <Slice y={top + bow} h={mid + 0.5} srcY={BOW_SRC} srcH={HULL_SRC_H - BOW_SRC - STERN_SRC} href={href} />
      <Slice y={top + bow + mid} h={stern} srcY={HULL_SRC_H - STERN_SRC} srcH={STERN_SRC} href={href} />
    </g>
  );
}

export function SpriteShip({ length, vertical = true, sail = 1, flag = 5, state = "intact", hits = [], className }: SpriteShipProps) {
  const len = Math.max(1, Math.min(4, length));
  const hull = state === "sunk" ? "/sprites/hull-wreck.png" : state === "damaged" ? "/sprites/hull-dmg.png" : "/sprites/hull.png";
  const sailHref = state === "sunk" ? "/sprites/sail-wreck.png" : `/sprites/sail-${sail}${state === "damaged" ? "-dmg" : ""}.png`;
  const masts = len === 1 ? [SEG / 2] : Array.from({ length: len - 1 }, (_, i) => (i + 1) * SEG);
  const scale = len === 1 ? 0.62 : 1;
  const body = (
    <g>
      <Hull len={len} href={hull} />
      {masts.map((y) => (
        <image key={y} href={sailHref} x={(SEG - SAIL_W * scale) / 2} y={y - (SAIL_H * scale) / 2} width={SAIL_W * scale} height={SAIL_H * scale} />
      ))}
      {state !== "sunk" && <image href={`/sprites/flag-${flag}.png`} x={(SEG - FLAG_W) / 2} y={len === 1 ? 2 : 14} width={FLAG_W} height={FLAG_H * (len === 1 ? 0.6 : 1)} />}
      {hits.map((hit, i) => (hit && state !== "sunk" ? <image key={i} href={`/sprites/fire${(i % 2) + 1}.png`} x={SEG / 2 - 14} y={i * SEG + SEG / 2 - 22} width={28} height={36} /> : null))}
    </g>
  );
  return (
    <svg viewBox={vertical ? `0 0 ${SEG} ${len * SEG}` : `0 0 ${len * SEG} ${SEG}`} className={cn("block overflow-visible", className)} aria-hidden>
      {vertical ? body : <g transform={`translate(${len * SEG} 0) rotate(90)`}>{body}</g>}
    </svg>
  );
}
