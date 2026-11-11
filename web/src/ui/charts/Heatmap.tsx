import { useState } from "react";
import { cellName } from "@/lib/utils";
import { CHART_SURFACE, HEAT_RAMP, heatColor } from "./palette";

interface HeatmapProps {
  readonly heat: readonly number[];
  readonly boards: number;
  readonly hunted: ReadonlySet<number>;
}

const C = 34;
const M = 22;

export function Heatmap({ heat, boards, hunted }: HeatmapProps) {
  const [hover, setHover] = useState<number | null>(null);
  const share = (i: number): number => (boards > 0 ? (heat[i] ?? 0) / boards : 0);
  const size = M + C * 10;
  return (
    <figure className="m-0 grid gap-3">
      <div className="relative">
        <svg viewBox={`0 0 ${size + 4} ${size + 4}`} className="w-full max-w-[460px]" role="img" aria-label={`Admiralty map from ${boards} revealed boards`}>
          <rect width={size + 4} height={size + 4} rx={10} fill={CHART_SURFACE} />
          {Array.from({ length: 10 }, (_, k) => (
            <g key={k} className="fill-muted text-[11px]">
              <text x={M + k * C + C / 2} y={15} textAnchor="middle">
                {"ABCDEFGHIJ"[k]}
              </text>
              <text x={M / 2} y={M + k * C + C / 2 + 4} textAnchor="middle">
                {k + 1}
              </text>
            </g>
          ))}
          {heat.map((_, i) => {
            const x = M + (i % 10) * C;
            const y = M + Math.floor(i / 10) * C;
            return (
              <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={x + 1} y={y + 1} width={C - 2} height={C - 2} rx={4} fill={heatColor(share(i))} />
                {hunted.has(i) && <circle cx={x + C / 2} cy={y + C / 2} r={4} fill="none" stroke="#f4f7f8" strokeWidth={1.5} />}
                {hover === i && <rect x={x + 1} y={y + 1} width={C - 2} height={C - 2} rx={4} fill="none" stroke="#f4f7f8" strokeWidth={2} />}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="m-0 min-h-5 text-xs text-muted" aria-live="polite">
        {hover === null ? (
          "Hover a cell to see how often captains hide a ship there."
        ) : (
          <>
            <b className="font-mono text-ink">{cellName(hover)}</b>: a ship here on <b className="text-ink tabular-nums">{Math.round(share(hover) * 100)}%</b> of boards
            {hunted.has(hover) && <span className="text-brass"> · in the Nauarch's first volley</span>}
          </>
        )}
      </p>
      <figcaption className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>fewer ships</span>
        <span className="flex">
          {HEAT_RAMP.map((c) => (
            <span key={c} className="inline-block h-2.5 w-6 first:rounded-l last:rounded-r" style={{ background: c }} />
          ))}
        </span>
        <span>more ships</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full border-[1.5px] border-ink" aria-hidden />
          hunted first
        </span>
      </figcaption>
    </figure>
  );
}
