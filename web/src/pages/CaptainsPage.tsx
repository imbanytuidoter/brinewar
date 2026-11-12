import { Crown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchAdmiralty, fetchLeaderboard, fetchTreasury, type Leaderboard } from "@/lib/api";
import type { AppConfig } from "@/lib/config";
import { storedAccount } from "@/lib/guest";
import { browserStorage } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { NauarchPortrait } from "@/ui/NauarchPortrait";
import { PageShell, Panel, Stat } from "@/ui/PageShell";

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ok"; board: Leaderboard; treasury: string | null; boards: number | null };

const n = (v: number | string): string => Number(v).toLocaleString("en-US");

export function CaptainsPage({ cfg }: { readonly cfg: AppConfig }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const me = useMemo(() => storedAccount(browserStorage()), []);
  useEffect(() => {
    let alive = true;
    Promise.all([fetchLeaderboard(cfg.apiUrl), fetchTreasury(cfg.apiUrl).catch(() => null), fetchAdmiralty(cfg.apiUrl).catch(() => null)])
      .then(([board, t, a]) => alive && setLoad({ kind: "ok", board, treasury: t?.current?.balance ?? null, boards: a?.current?.boards_counted ?? null }))
      .catch(() => alive && setLoad({ kind: "error" }));
    return () => {
      alive = false;
    };
  }, [cfg]);

  return (
    <PageShell
      title="Captains"
      lede="Ranked by flagship XP. Wins, ships sunk and gold are read from the contract. The Nauarch's record adds up every battle fought against him."
    >
      {load.kind === "loading" && <Loader2 className="size-5 animate-spin text-muted" aria-label="Loading the leaderboard" />}
      {load.kind === "error" && <p className="m-0 text-muted">Could not read the leaderboard. Try again in a moment.</p>}
      {load.kind === "ok" && <Board {...load} me={me} />}
    </PageShell>
  );
}

function Board({ board, treasury, boards, me }: { readonly board: Leaderboard; readonly treasury: string | null; readonly boards: number | null; readonly me: string | null }) {
  const { nauarch } = board;
  const [tests, setTests] = useState(false);
  const seeds = board.captains.filter((c) => c.seed).length;
  const shown = board.captains.filter((c) => tests || !c.seed);
  const winRate = nauarch.battles > 0 ? Math.round((nauarch.wins / nauarch.battles) * 100) : null;
  const myPlace = me ? shown.findIndex((c) => c.account === me) : -1;
  return (
    <>
      <Panel className="sm:grid-cols-[auto_1fr] sm:items-center">
        <NauarchPortrait mood={winRate !== null && winRate >= 50 ? "smug" : "vexed"} className="size-24 justify-self-center" />
        <div className="grid gap-3">
          <p className="m-0 font-display text-2xl font-bold">The Nauarch</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Battles" value={n(nauarch.battles)} />
            <Stat label="He won" value={n(nauarch.wins)} sub={winRate !== null ? `${winRate}% of battles` : undefined} />
            <Stat label="Captains won" value={n(nauarch.losses)} sub="each paid a bounty" />
            <Stat label="Treasury" value={treasury ? n(treasury) : "·"} sub={boards !== null ? `${n(boards)} boards studied` : "gold"} />
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 font-display text-2xl font-bold">Top captains</h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>{myPlace >= 0 ? `You are #${myPlace + 1}` : `${board.total} captains signed on`}</span>
            {seeds > 0 && (
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={tests} onChange={(e) => setTests(e.target.checked)} className="accent-brass" />
                Show {seeds} test captains from the seeded map
              </label>
            )}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="m-0 text-muted">No captain has earned XP yet. Be the first.</p>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
              <thead className="text-xs tracking-[0.08em] text-muted uppercase">
                <tr>
                  <th className="px-2 py-2 font-semibold">#</th>
                  <th className="px-2 py-2 font-semibold">Captain</th>
                  <th className="px-2 py-2 font-semibold">Flagship</th>
                  <th className="px-2 py-2 text-right font-semibold">XP</th>
                  <th className="px-2 py-2 text-right font-semibold">Won / lost</th>
                  <th className="px-2 py-2 text-right font-semibold">Sunk</th>
                  <th className="px-2 py-2 text-right font-semibold">Gold</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c, i) => (
                  <tr key={c.account} className={cn("border-t border-line", c.account === me && "bg-brass/10")}>
                    <td className="px-2 py-2 tabular-nums">{i === 0 ? <Crown className="size-4 text-brass" aria-label="first" /> : i + 1}</td>
                    <td className="px-2 py-2 font-semibold">
                      {c.name}
                      {c.account === me && <span className="ml-1.5 text-xs font-normal text-brass">you</span>}
                      {c.seed && <span className="ml-1.5 text-xs font-normal text-muted">test</span>}
                    </td>
                    <td className="px-2 py-2 text-muted">
                      {c.rank} · {c.class}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{n(c.xp)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {c.wins} / {c.losses}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{c.sunk}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{n(c.gold)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
