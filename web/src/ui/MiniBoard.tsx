import type { ShotRow } from "@/game/verify";
import { cellName } from "@/lib/utils";

interface MiniBoardProps {
  readonly title: string;
  readonly shots: readonly ShotRow[];
  readonly fleet: readonly (readonly number[])[] | null;
}

const SIZE = 22;

export function MiniBoard({ title, shots, fleet }: MiniBoardProps) {
  const ship = new Set(fleet?.flat() ?? []);
  const marks = new Map(shots.map((s) => [s.index, s.result]));
  return (
    <figure className="m-0 grid gap-2">
      <figcaption className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">{title}</figcaption>
      <svg viewBox={`0 0 ${SIZE * 10} ${SIZE * 10}`} className="w-full max-w-[260px] rounded-lg bg-[#123a4d]" role="img" aria-label={`${title}: ${shots.length} shots`}>
        {Array.from({ length: 100 }, (_, i) => {
          const x = (i % 10) * SIZE;
          const y = Math.floor(i / 10) * SIZE;
          const m = marks.get(i);
          return (
            <g key={i}>
              <title>{`${cellName(i)}${m ? ` · ${m}` : ""}`}</title>
              <rect x={x + 1} y={y + 1} width={SIZE - 2} height={SIZE - 2} rx={3} fill={ship.has(i) ? "#8a6a43" : "#1b4d63"} />
              {m === "Hit" && <circle cx={x + SIZE / 2} cy={y + SIZE / 2} r={6} fill="#ff6a3d" />}
              {m === "Miss" && <circle cx={x + SIZE / 2} cy={y + SIZE / 2} r={3} fill="#f4fbff" opacity={0.85} />}
              {m === "Pending" && <circle cx={x + SIZE / 2} cy={y + SIZE / 2} r={6} fill="none" stroke="#ffcf5a" strokeWidth={2} />}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
