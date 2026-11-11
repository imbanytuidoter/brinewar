import { Loader2, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { economyOf, simulate, type Economy, type SimStep } from "@/game/economy";
import { useReducedMotion } from "@/game/useGame";
import { fetchTreasury, type TreasuryHistory } from "@/lib/api";
import { makeViewer } from "@/lib/chain";
import type { AppConfig } from "@/lib/config";
import type { ConfigView } from "@/lib/contract";
import { seededRng } from "@/lib/fleet";
import { LineChart } from "@/ui/charts/LineChart";
import { SERIES } from "@/ui/charts/palette";
import { PageShell, Panel, Stat } from "@/ui/PageShell";

const BATTLES = 50;
const STEP_MS = 40;

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ok"; history: TreasuryHistory; economy: Economy; settings: ConfigView["settings"] };

const gold = (v: number): string => `${Math.round(v).toLocaleString("en-US")}`;
const dateOf = (at: number): string => new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function TreasuryPage({ cfg }: { readonly cfg: AppConfig }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    const viewer = makeViewer(cfg.rpcUrl, cfg.contractId);
    Promise.all([fetchTreasury(cfg.apiUrl), viewer.view<ConfigView>("config")])
      .then(([history, config]) => alive && setLoad({ kind: "ok", history, economy: economyOf(config.settings), settings: config.settings }))
      .catch(() => alive && setLoad({ kind: "error" }));
    return () => {
      alive = false;
    };
  }, [cfg]);

  return (
    <PageShell
      kicker="The Nauarch's treasury"
      title="An economy nobody tunes by hand"
      lede={
        <p className="m-0">
          Lose, and your stake fills his treasury. Sink his fleet, and he pays a bounty out of it. When the treasury runs low he grows poor: bounties shrink and entry fees rise until
          captains refill it. The formula lives in the contract, not on our server.
        </p>
      }
    >
      {load.kind === "loading" && (
        <p className="inline-flex items-center gap-2 text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Counting the gold…
        </p>
      )}
      {load.kind === "error" && <p className="text-hit">Could not reach the harbour. Try again in a moment.</p>}
      {load.kind === "ok" && <TreasuryView history={load.history} economy={load.economy} settings={load.settings} />}
    </PageShell>
  );
}

function TreasuryView({ history, economy, settings }: { readonly history: TreasuryHistory; readonly economy: Economy; readonly settings: ConfigView["settings"] }) {
  const cur = history.current;
  const points = history.history;
  const balance = useMemo(() => points.map((p) => Number(p.data.balance)), [points]);
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="In the treasury" value={cur ? gold(Number(cur.balance)) : "·"} sub="gold" />
        <Stat label="Entry fee now" value={cur ? gold(Number(cur.entry)) : "·"} sub={`base ${settings.base_entry}, rises below ${settings.entry_threshold}`} />
        <Stat label="Bounty now" value={cur ? gold(Number(cur.bounty)) : "·"} sub={`${settings.bounty_bps / 100}% of the treasury, at most ${settings.bounty_cap}`} />
      </section>
      <Panel>
        {balance.length > 1 ? (
          <LineChart title="Treasury on chain" series={[{ key: "balance", label: "Treasury", color: SERIES.treasury, values: balance }]} xLabel={(i) => dateOf(points[i]?.at ?? 0)} format={gold} />
        ) : (
          <p className="m-0 text-sm text-muted">The treasury has not moved yet. Each finished battle adds a point here.</p>
        )}
      </Panel>
      <Simulator economy={economy} start={cur ? BigInt(cur.balance) : economy.threshold * 2n} />
    </>
  );
}

function Simulator({ economy, start }: { readonly economy: Economy; readonly start: bigint }) {
  const reduced = useReducedMotion();
  const [winRate, setWinRate] = useState(0.7);
  const [run, setRun] = useState<{ steps: SimStep[]; shown: number } | null>(null);
  const seed = useRef(1);
  useEffect(() => {
    if (!run || run.shown >= run.steps.length) return;
    const t = setTimeout(() => setRun((r) => (r ? { ...r, shown: Math.min(r.steps.length, r.shown + 1) } : r)), STEP_MS);
    return () => clearTimeout(t);
  }, [run]);
  const go = (): void => {
    seed.current += 1;
    const steps = simulate(economy, start, BATTLES, winRate, seededRng(seed.current * 7919));
    setRun({ steps, shown: reduced ? steps.length : 1 });
  };
  const shown = run ? run.steps.slice(0, run.shown) : [];
  const last = shown.at(-1);
  const wins = shown.filter((s) => s.won).length;
  return (
    <Panel>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h2 className="m-0 font-display text-2xl font-bold">Fast-forward 50 battles</h2>
          <p className="m-0 max-w-xl text-sm text-muted">
            A simulation in your browser, clearly not on chain: the contract's own formulas and live parameters, starting from today's treasury, with random outcomes at the win
            rate you choose. Every win here sinks his fleet; the real contract also caps bounties per captain per day.
          </p>
        </div>
        <div className="grid gap-2">
          <label className="grid gap-1 text-xs text-muted">
            <span>
              Captains win <b className="text-ink tabular-nums">{Math.round(winRate * 100)}%</b>
            </span>
            <input type="range" min={0.05} max={0.95} step={0.05} value={winRate} onChange={(e) => setWinRate(Number(e.target.value))} className="w-48 accent-brass" aria-label="Win rate" />
          </label>
          <Button variant="brass" onClick={go}>
            <Play aria-hidden />
            Simulate 50 battles
          </Button>
        </div>
      </div>
      {last && (
        <>
          <p className="m-0 text-sm" aria-live="polite">
            After {last.battle} battles ({wins} won by captains): treasury <b className="tabular-nums">{gold(Number(last.treasury))}</b>, entry <b className="tabular-nums">{gold(Number(last.entry))}</b>, bounty{" "}
            <b className="tabular-nums">{gold(Number(last.bounty))}</b>.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <LineChart title="Treasury (simulation)" series={[{ key: "t", label: "Treasury", color: SERIES.treasury, values: shown.map((s) => Number(s.treasury)) }]} xLabel={(i) => `battle ${i}`} format={gold} height={200} />
            <LineChart
              title="What captains pay and win (simulation)"
              series={[
                { key: "entry", label: "Entry", color: SERIES.entry, values: shown.map((s) => Number(s.entry)) },
                { key: "bounty", label: "Bounty", color: SERIES.bounty, values: shown.map((s) => Number(s.bounty)) },
              ]}
              xLabel={(i) => `battle ${i}`}
              format={gold}
              height={200}
            />
          </div>
        </>
      )}
    </Panel>
  );
}
