import { cn } from "@/lib/utils";

const UNIT = 20;

interface ShipGlyphProps {
  readonly length: number;
  readonly vertical?: boolean;
  readonly sail?: string;
  readonly hull?: string;
  readonly flag?: string;
  readonly hits?: readonly boolean[];
  readonly sunk?: boolean;
  readonly ghost?: boolean;
  readonly top?: boolean;
  readonly className?: string;
}

function deckPath(len: number): string {
  const w = len * UNIT;
  return `M2.5 3.5 H${w - 8} Q${w - 0.8} 10 ${w - 8} 16.5 H2.5 Q1 10 2.5 3.5 Z`;
}

function TopView({ len, sail, hull, flag, hits }: { readonly len: number; readonly sail: string; readonly hull: string; readonly flag: string; readonly hits: readonly boolean[] }) {
  const w = len * UNIT;
  const masts = len === 1 ? [w / 2 - 1] : Array.from({ length: len - 1 }, (_, i) => (i + 1) * UNIT - 2);
  return (
    <g>
      <path d={deckPath(len)} fill={hull} stroke="#2b1a10" strokeWidth="0.9" />
      <path d={`M4 7.5 H${w - 9} M4 12.5 H${w - 9}`} stroke="#f2d9a6" strokeWidth="0.6" opacity="0.45" />
      {masts.map((x) => (
        <g key={x}>
          <rect x={x - 3.4} y="0.6" width="6.8" height="18.8" rx="2.6" fill={sail} stroke="#3a2a1d" strokeWidth="0.6" />
          <circle cx={x} cy="10" r="1.3" fill="#3a2a1d" />
        </g>
      ))}
      <path d="M3 10 l-2.6 -2 v4 Z" fill={flag} />
      {hits.map((hit, i) => (hit ? <circle key={i} cx={i * UNIT + UNIT / 2} cy="10" r="4" fill="#ff6a3d" stroke="#ffd36b" strokeWidth="1.2" /> : null))}
    </g>
  );
}

function hullPath(len: number): string {
  const w = len * UNIT;
  return `M1 11 H${w - 5} L${w - 0.5} 11 L${w - 4} 18.5 H4.5 L1 14.5 Z`;
}

export function ShipGlyph({ length, vertical = false, sail = "#e8f3f2", hull = "#8a5a36", flag = "#3fb6c9", hits = [], sunk = false, ghost = false, top = false, className }: ShipGlyphProps) {
  const len = Math.max(1, length);
  const w = len * UNIT;
  const masts = len === 1 ? [w / 2] : Array.from({ length: len - 1 }, (_, i) => (i + 1) * UNIT);
  const body = top ? (
    <TopView len={len} sail={sail} hull={hull} flag={flag} hits={hits} />
  ) : (
    <g>
      {ghost ? (
        <path d={hullPath(len)} fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2" />
      ) : (
        <>
          <path d={hullPath(len)} fill={hull} stroke="#2b1a10" strokeWidth="0.9" />
          <path d={`M2.5 13.2 H${w - 4.5}`} stroke="#f2d9a6" strokeWidth="0.9" opacity="0.75" />
          {masts.map((x, i) => (
            <g key={x}>
              <path d={`M${x} 11 V0.8`} stroke="#3a2a1d" strokeWidth="1.2" />
              <path d={`M${x - 6.5} 2.4 Q${x} 1.4 ${x + 6.5} 2.4 L${x + 6} 9.4 Q${x} 10.6 ${x - 6} 9.4 Z`} fill={sail} stroke="#3a2a1d" strokeWidth="0.6" />
              {i === 0 && <path d={`M${x} 0.8 l4 1.2 l-4 1.2 Z`} fill={flag} />}
            </g>
          ))}
          {hits.map((hit, i) =>
            hit ? (
              <g key={i}>
                <circle cx={i * UNIT + UNIT / 2} cy="14.6" r="3.2" fill="#ff6a3d" />
                <circle cx={i * UNIT + UNIT / 2} cy="14.6" r="1.4" fill="#ffd36b" />
              </g>
            ) : null,
          )}
        </>
      )}
    </g>
  );
  return (
    <svg
      viewBox={vertical ? `0 0 ${UNIT} ${w}` : `0 0 ${w} ${UNIT}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn("block overflow-visible", sunk && "opacity-35 grayscale", className)}
      aria-hidden
    >
      {vertical ? <g transform={`translate(${UNIT} 0) rotate(90)`}>{body}</g> : body}
    </svg>
  );
}
