import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { huntOrder } from "@/game/economy";
import { fetchAdmiralty, type AdmiraltyHistory } from "@/lib/api";
import type { AppConfig } from "@/lib/config";
import type { AdmiraltyView } from "@/lib/contract";
import { cellName } from "@/lib/utils";
import { Heatmap } from "@/ui/charts/Heatmap";
import { PageShell, Panel, Stat } from "@/ui/PageShell";

const FIRST_VOLLEY = 10;

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ok"; frames: readonly AdmiraltyView[] };

export function framesOf(h: AdmiraltyHistory): AdmiraltyView[] {
  const byDay = new Map<number, AdmiraltyView>();
  for (const d of h.days) byDay.set(d.data.day, d.data);
  if (h.current) byDay.set(h.current.day, h.current);
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

export function AdmiraltyPage({ cfg }: { readonly cfg: AppConfig }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [pick, setPick] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchAdmiralty(cfg.apiUrl)
      .then((h) => alive && setLoad({ kind: "ok", frames: framesOf(h) }))
      .catch(() => alive && setLoad({ kind: "error" }));
    return () => {
      alive = false;
    };
  }, [cfg]);

  const frames = load.kind === "ok" ? load.frames : [];
  const index = pick ?? frames.length - 1;
  const frame = frames[index] ?? null;
  const hunted = useMemo(() => {
    if (!frame || frame.boards_counted === 0) return [];
    return huntOrder(frame.heat).filter((i) => (frame.heat[i] ?? 0) > 0).slice(0, FIRST_VOLLEY);
  }, [frame]);
  const huntedSet = useMemo(() => new Set(hunted), [hunted]);
  const first = frames[0];

  return (
    <PageShell
      title="Admiralty map"
      lede={
        <p className="m-0">
          Each board that passes the final check on chain adds to this map, one per captain per day, and only from battles of ten moves or more. The Nauarch opens fire on the
          hottest cells. If you hide where most captains hide, expect him there early. The counts are kept by the contract itself.
        </p>
      }
    >
      {load.kind === "loading" && (
        <p className="inline-flex items-center gap-2 text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Unrolling the chart…
        </p>
      )}
      {load.kind === "error" && <p className="text-hit">Could not reach the harbour. Try again in a moment.</p>}
      {load.kind === "ok" && !frame && <p className="text-muted">No boards revealed yet. Play a battle of ten moves or more to put the first marks on the chart.</p>}
      {frame && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Stat label="Boards counted" value={frame.boards_counted} sub={first && first !== frame ? `${frame.boards_counted - first.boards_counted} more than on day ${first.day}` : undefined} />
            <Stat label="Hottest cell" value={hunted[0] !== undefined ? cellName(hunted[0]) : "none"} sub={hunted[0] !== undefined ? `${Math.round(((frame.heat[hunted[0]] ?? 0) / frame.boards_counted) * 100)}% of boards` : undefined} />
            <Stat label="Chain day" value={frame.day} sub={index === frames.length - 1 ? "today" : "history"} />
          </section>
          <Panel className="sm:grid-cols-[minmax(0,460px)_1fr] sm:items-start">
            <Heatmap heat={frame.heat} boards={frame.boards_counted} hunted={huntedSet} />
            <div className="grid gap-4">
              {frames.length > 1 && (
                <label className="grid gap-2 text-sm">
                  <span className="flex justify-between text-muted">
                    <span>Day {frame.day}</span>
                    <span>
                      {index + 1} of {frames.length}
                    </span>
                  </span>
                  <input type="range" min={0} max={frames.length - 1} value={index} onChange={(e) => setPick(Number(e.target.value))} className="accent-brass" aria-label="Day" />
                </label>
              )}
              <div className="grid gap-2">
                <p className="m-0 text-xs font-semibold tracking-[0.12em] text-muted uppercase">His first volley</p>
                <p className="m-0 font-mono text-sm leading-relaxed">{hunted.length ? hunted.map(cellName).join(" · ") : "nothing to aim at yet"}</p>
              </div>
              <button type="button" onClick={() => setTable((t) => !t)} className="justify-self-start text-xs text-brass underline-offset-2 hover:underline">
                {table ? "Hide the table" : "Show as a table"}
              </button>
              {table && (
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-1 font-medium">Cell</th>
                      <th className="py-1 font-medium">Boards with a ship there</th>
                    </tr>
                  </thead>
                  <tbody>
                    {huntOrder(frame.heat)
                      .filter((i) => (frame.heat[i] ?? 0) > 0)
                      .map((i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="py-1 font-mono">{cellName(i)}</td>
                          <td className="py-1 tabular-nums">
                            {frame.heat[i]} of {frame.boards_counted}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </Panel>
        </>
      )}
    </PageShell>
  );
}
