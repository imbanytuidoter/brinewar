import { RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Outcome } from "@/game/engine";

interface EndCardProps {
  readonly outcome: Outcome;
  readonly reason: string | null;
  readonly verifyHref: string;
  readonly done: boolean;
  readonly onAgain: () => void;
}

const REASONS: Record<string, string> = {
  FleetSunk: "fleet sunk",
  Timeout: "out of time",
  Resigned: "colours struck",
  RevealTimeout: "the winner did not reveal in time",
  IllegalFleet: "illegal fleet on reveal",
  Cancelled: "battle cancelled",
};

export function EndCard({ outcome, reason, verifyHref, done, onAgain }: EndCardProps) {
  const won = outcome === "won";
  return (
    <div className="grid animate-rise gap-2 rounded-2xl border border-line bg-glass p-3 backdrop-blur-md sm:w-[320px]">
      <p className="m-0 font-display text-2xl leading-tight font-bold">{won ? "Victory, Captain." : "The Nauarch prevails."}</p>
      {reason && <p className="m-0 text-xs text-muted">{REASONS[reason] ?? reason}</p>}
      {!done && <p className="m-0 text-xs text-muted">Both fleets are being revealed and checked on chain…</p>}
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
