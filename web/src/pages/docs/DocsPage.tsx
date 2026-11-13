import { useEffect, useMemo, useState } from "react";
import { makeViewer } from "@/lib/chain";
import type { AppConfig } from "@/lib/config";
import type { ConfigView, ModelView } from "@/lib/contract";
import { PageShell } from "@/ui/PageShell";
import { sections, type Live } from "./content";

interface TreasuryNow {
  readonly balance: string;
  readonly entry: string;
  readonly bounty: string;
}

const PROSE =
  "grid max-w-[72ch] gap-3 text-base leading-[1.65] text-ink/90 [&_b]:text-ink [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_li]:pl-1 [&_ol]:grid [&_ol]:list-decimal [&_ol]:gap-2 [&_ol]:pl-5 [&_p]:m-0 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-5 [&_ol]:m-0 [&_ul]:m-0";

function useLive(cfg: AppConfig): Live {
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [model, setModel] = useState<ModelView | null>(null);
  const [treasury, setTreasury] = useState<TreasuryNow | null>(null);
  const [duelTimeout, setDuelTimeout] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const viewer = makeViewer(cfg.rpcUrl, cfg.contractId);
    viewer.view<ConfigView>("config").then((c) => alive && setConfig(c)).catch(() => undefined);
    viewer.view<ModelView | null>("model").then((m) => alive && setModel(m)).catch(() => undefined);
    viewer.view<TreasuryNow>("treasury").then((t) => alive && setTreasury(t)).catch(() => undefined);
    viewer.view<number>("duel_timeout").then((d) => alive && setDuelTimeout(d)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cfg]);
  return useMemo(() => {
    const s = config?.settings;
    const num = (k: string): number | null => (typeof s?.[k] === "number" ? (s[k] as number) : null);
    const str = (k: string): string | null => (typeof s?.[k] === "string" ? (s[k] as string) : null);
    return {
      contract: cfg.contractId,
      nauarch: config?.nauarch ?? "",
      model: model?.model ?? null,
      players: config?.players ?? null,
      games: config?.games ?? null,
      startGold: str("start_gold"),
      baseEntry: s?.base_entry ?? null,
      threshold: s?.entry_threshold ?? null,
      bountyPct: s ? String(s.bounty_bps / 100) : null,
      bountyCap: s?.bounty_cap ?? null,
      bountiesPerDay: s?.bounties_per_day ?? null,
      gamesPerDay: num("games_per_day"),
      timeoutBlocks: num("move_timeout_blocks"),
      duelTimeoutBlocks: duelTimeout,
      minHeatShots: num("min_heat_shots"),
      treasury: treasury?.balance ?? null,
      entryNow: treasury?.entry ?? null,
      bountyNow: treasury?.bounty ?? null,
    };
  }, [cfg, config, model, treasury, duelTimeout]);
}

function useActive(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = ids.find((id) => seen.get(id));
        if (first) setActive(first);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [ids]);
  return active;
}

export function DocsPage({ cfg }: { readonly cfg: AppConfig }) {
  const live = useLive(cfg);
  const list = useMemo(() => sections(live), [live]);
  const ids = useMemo(() => list.map((s) => s.id), [list]);
  const active = useActive(ids);
  return (
    <PageShell
      title="How Brinewar works"
      lede="Rules, proofs, the Nauarch, gold and tokens. Prices, limits, the model name and the counts on this page come from the contract when it loads."
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Docs sections" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <ol className="m-0 flex list-none gap-1 overflow-x-auto p-0 pb-1 lg:grid lg:overflow-visible">
            {list.map((s) => (
              <li key={s.id} className="shrink-0">
                <a
                  href={`#${s.id}`}
                  aria-current={active === s.id ? "location" : undefined}
                  className="block rounded-lg border border-transparent px-3 py-1.5 text-sm whitespace-nowrap text-muted lg:whitespace-normal transition-colors hover:text-ink aria-[current=location]:border-line aria-[current=location]:bg-white/10 aria-[current=location]:text-ink"
                >
                  {s.short}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="grid min-w-0 gap-10">
          {list.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="grid scroll-mt-6 gap-3">
              <h2 id={`${s.id}-h`} className="m-0 font-display text-[28px] leading-tight font-bold tracking-[0.01em] sm:text-[32px]">
                <a href={`#${s.id}`} className="hover:text-brass">{s.title}</a>
              </h2>
              <div className={PROSE}>{s.body}</div>
            </section>
          ))}
          <p className="m-0 text-xs text-muted">
            Live values come from <code>{live.contract}</code> on NEAR testnet. Anything else here describes the contract code.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
