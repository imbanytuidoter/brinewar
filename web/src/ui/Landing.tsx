import { Anchor, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HarbourStats } from "@/game/useHarbour";
import { hottest } from "@/lib/heat";
import { cellName } from "@/lib/utils";

interface LandingProps {
  readonly stats: HarbourStats;
  readonly ready: boolean;
  readonly onEnter: () => void;
}

const STEPS: ReadonlyArray<readonly [title: string, text: string]> = [
  ["Hide ten ships", "Your board never leaves this browser. The chain keeps a sealed Merkle root of it."],
  ["Trade shots", "Every answer comes with a proof against that root, so nobody can move a ship mid-battle."],
  ["Take his gold", "Sink his fleet and the contract pays you a bounty from his treasury. Duels with friends are free."],
];

export function Landing({ stats, ready, onEnter }: LandingProps) {
  const a = stats.admiralty;
  const hot = a ? hottest(a.heat, a.boards_counted) : null;
  return (
    <section aria-labelledby="landing-title" className="fixed inset-0 z-[5] overflow-y-auto bg-[linear-gradient(90deg,rgb(11_34_48/0.94)_0%,rgb(11_34_48/0.78)_45%,rgb(11_34_48/0.1)_100%)] max-md:bg-[linear-gradient(180deg,rgb(11_34_48/0.55)_0%,rgb(11_34_48/0.95)_55%)]">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col justify-center gap-7 px-4 pt-[calc(96px+env(safe-area-inset-top))] pb-[calc(28px+env(safe-area-inset-bottom))] sm:px-8 max-md:justify-end">
        <div className="grid max-w-[620px] gap-4">
          <h1 id="landing-title" className="m-0 font-display text-[clamp(34px,6vw,64px)] leading-[1.02] font-bold text-balance">
            Hide your fleet from an admiral who has studied every captain.
          </h1>
          <p className="m-0 max-w-[52ch] text-[15px] text-muted">
            The Nauarch is an AI on NEAR AI Cloud. He learns where captains hide their ships, and the contract proves he never sees yours. No wallet and no popups: every shot is a NEAR transaction, and the game pays the gas.
          </p>
        </div>
        <ul aria-label="Live from the chain" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {a && a.boards_counted > 0 && <Chip value={a.boards_counted.toLocaleString("en-US")} label="boards studied" />}
          {stats.treasury && <Chip value={Number(stats.treasury.balance).toLocaleString("en-US")} label="gold in his treasury" />}
          {hot && <Chip value={cellName(hot.cell)} label={`his first guess · ${Math.round(hot.share * 100)}% of fleets sat there`} />}
        </ul>
        <ol className="m-0 grid max-w-[760px] list-none gap-3 p-0 max-sm:order-last max-sm:gap-2 sm:grid-cols-3">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="grid gap-1 rounded-2xl border border-line bg-glass p-3 backdrop-blur-md max-sm:py-2">
              <span className="font-mono text-[11px] text-brass">0{i + 1}</span>
              <span className="font-semibold">{title}</span>
              <span className="text-[13px] text-muted">{text}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="brass" size="lg" onClick={onEnter} disabled={!ready} className="min-w-[200px]">
            {ready ? <Anchor aria-hidden /> : <Loader2 className="animate-spin" aria-hidden />}
            {ready ? "Take command" : "Signing you on…"}
          </Button>
          <a href="/judges" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted underline-offset-4 hover:text-ink hover:underline">
            <ShieldCheck className="size-4 text-ok" aria-hidden />
            How to check it is fair
          </a>
        </div>
      </div>
    </section>
  );
}

function Chip({ value, label }: { readonly value: string; readonly label: string }) {
  return (
    <li className="inline-flex items-baseline gap-1.5 rounded-full border border-line bg-glass px-3 py-1.5 text-[13px] backdrop-blur-md">
      <strong className="text-[15px] font-bold text-brass tabular-nums">{value}</strong>
      <span className="text-muted">{label}</span>
    </li>
  );
}
