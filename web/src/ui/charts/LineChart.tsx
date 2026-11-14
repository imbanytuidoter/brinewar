import { useId, useMemo, useState, type PointerEvent } from "react";
import { CHART_SURFACE, GRID } from "./palette";

interface Series {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly values: readonly number[];
}

interface LineChartProps {
  readonly title: string;
  readonly series: readonly Series[];
  readonly xLabel: (i: number) => string;
  readonly format: (v: number) => string;
  readonly height?: number;
}

const W = 640;
const PAD = { l: 44, r: 64, t: 12, b: 26 };

export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function LineChart({ title, series, xLabel, format, height = 220 }: LineChartProps) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(0, ...series.map((s) => s.values.length));
  const max = useMemo(() => niceMax(Math.max(0, ...series.flatMap((s) => s.values))), [series]);
  const innerW = W - PAD.l - PAD.r;
  const innerH = height - PAD.t - PAD.b;
  const x = (i: number): number => PAD.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number): number => PAD.t + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const onMove = (e: PointerEvent<SVGRectElement>): void => {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setHover(n <= 1 ? 0 : Math.round(rel * (n - 1)));
  };
  return (
    <figure className="m-0 grid gap-2">
      <figcaption id={`${id}-t`} className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="font-semibold tracking-[0.12em] uppercase">{title}</span>
        {series.length > 1 && (
          <span className="flex gap-3">
            {series.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} aria-hidden />
                {s.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-labelledby={`${id}-t`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={GRID} />
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">
                {format(t)}
              </text>
            </g>
          ))}
          {n > 1 && (
            <>
              <text x={PAD.l} y={height - 6} className="fill-muted text-[11px]">
                {xLabel(0)}
              </text>
              <text x={W - PAD.r} y={height - 6} textAnchor="end" className="fill-muted text-[11px]">
                {xLabel(n - 1)}
              </text>
            </>
          )}
          {series.map((s) => (
            <g key={s.key}>
              <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
              {s.values.length > 0 && (
                <text x={x(s.values.length - 1) + 6} y={y(s.values.at(-1) ?? 0) + 4} className="fill-ink text-[11px] font-semibold">
                  {series.length > 1 ? s.label : format(s.values.at(-1) ?? 0)}
                </text>
              )}
            </g>
          ))}
          {hover !== null && n > 0 && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + innerH} stroke="rgb(255 255 255 / 0.35)" />
              {series.map((s) => {
                const v = s.values[hover];
                return v === undefined ? null : <circle key={s.key} cx={x(hover)} cy={y(v)} r={4.5} fill={s.color} stroke={CHART_SURFACE} strokeWidth={2} />;
              })}
            </g>
          )}
          <rect x={PAD.l - 10} y={0} width={innerW + 20} height={height} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hover !== null && n > 0 && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg border border-line bg-[#0d2633]/95 px-2.5 py-1.5 text-xs shadow-xl"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: x(hover) > W / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)" }}
          >
            <p className="m-0 text-muted">{xLabel(hover)}</p>
            {series.map((s) => (
              <p key={s.key} className="m-0 flex items-center gap-1.5 text-ink">
                <span className="inline-block size-2 rounded-full" style={{ background: s.color }} aria-hidden />
                {s.label} <b className="tabular-nums">{format(s.values[hover] ?? 0)}</b>
              </p>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
