import { cn } from "@/lib/utils";

const UNIT = 20;

interface ShipGlyphProps {
  readonly length: number;
  readonly vertical?: boolean;
  readonly sail?: string;
  readonly hull?: string;
  readonly hits?: readonly boolean[];
  readonly sunk?: boolean;
  readonly ghost?: boolean;
  readonly className?: string;
}

function hullPath(len: number): string {
  const w = len * UNIT;
  return `M1.5 9 H${w - 6} Q${w - 1} 9 ${w - 0.5} 11.5 L${w - 5} 17.5 H4.5 Q1.5 17 1.5 13.5 Z`;
}

export function ShipGlyph({ length, vertical = false, sail = "#e8f3f2", hull = "#8a5a36", hits = [], sunk = false, ghost = false, className }: ShipGlyphProps) {
  const len = Math.max(1, length);
  const w = len * UNIT;
  const masts = len === 1 ? [w / 2] : Array.from({ length: len - 1 }, (_, i) => (i + 1) * UNIT);
  const body = (
    <g>
      {ghost ? (
        <path d={hullPath(len)} fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2" />
      ) : (
        <>
          <path d={hullPath(len)} fill={hull} stroke="#2b1a10" strokeWidth="0.9" />
          <path d={`M3 12 H${w - 4}`} stroke="#f2d9a6" strokeWidth="0.8" opacity="0.7" />
          {masts.map((x) => (
            <g key={x}>
              <path d={`M${x} 9 V1.5`} stroke="#3a2a1d" strokeWidth="1.1" />
              <path d={`M${x + 0.6} 2.5 Q${x + 7} 5 ${x + 0.6} 8.2 Z`} fill={sail} stroke="#3a2a1d" strokeWidth="0.5" />
            </g>
          ))}
          {hits.map((hit, i) =>
            hit ? (
              <g key={i}>
                <circle cx={i * UNIT + UNIT / 2} cy="13" r="3.4" fill="#ff6a3d" />
                <circle cx={i * UNIT + UNIT / 2} cy="13" r="1.5" fill="#ffd36b" />
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
