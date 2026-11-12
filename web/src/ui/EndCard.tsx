import { RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Outcome } from "@/game/engine";
import type { Rewards } from "@/game/session";

interface EndCardProps {
  readonly outcome: Outcome;
  readonly reason: string | null;
  readonly verifyHref: string;
  readonly done: boolean;
  readonly onAgain: () => void;
  readonly rewards: Rewards | null;
  readonly opponent?: string | null;
}

const REASONS: Record<string, string> = {
  FleetSunk: "fleet sunk",
  Timeout: "out of time",
  Resigned: "colours struck",
  RevealTimeout: "the winner did not reveal in time",
  IllegalFleet: "illegal fleet on reveal",
  Cancelled: "battle cancelled",
};

export function EndCard({ outcome, reason, verifyHref, done, onAgain, rewards, opponent = null }: EndCardProps) {
  const won = outcome === "won";
  return (
    <div className="grid animate-rise gap-2 rounded-2xl border border-line bg-glass p-3 backdrop-blur-md sm:w-[320px]">
      <p className={`m-0 font-display text-2xl leading-tight font-bold uppercase ${won ? "text-brass" : "text-hit"}`}>{won ? "Victory, Captain." : opponent ? `${opponent} wins the duel.` : "The Nauarch prevails."}</p>
      {reason && <p className="m-0 text-xs text-muted">{REASONS[reason] ?? reason}</p>}
      {!done && <p className="m-0 text-xs text-muted">Both fleets are being revealed and checked on chain…</p>}
      {rewards && (
        <p className="m-0 text-sm font-semibold">
          {opponent && rewards.gold === 0n ? (
            <span className="text-muted">Friendly duel, no gold</span>
          ) : (
            <span className={rewards.gold >= 0n ? "text-brass" : "text-hit"}>
              {rewards.gold >= 0n ? "+" : "−"}
              {(rewards.gold < 0n ? -rewards.gold : rewards.gold).toString()} gold
            </span>
          )}
          {rewards.xp > 0 && <span className="text-ink"> · +{rewards.xp} XP</span>}
          {rewards.rankTo && (
            <span className="text-ok">
              {" "}
              · {rewards.rankFrom} → {rewards.rankTo}
            </span>
          )}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button asChild>
          <a href={verifyHref}>
            <ShieldCheck aria-hidden />
            Verify
          </a>
        </Button>
        <Button variant="brass" onClick={onAgain} disabled={!done}>
          <RotateCcw aria-hidden />
          New battle
        </Button>
      </div>
    </div>
  );
}
