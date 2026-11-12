import { useEffect, useState } from "react";
import type { Outcome } from "@/game/engine";
import { cn } from "@/lib/utils";

const HOLD_MS = 4200;
const SPARKS = 28;

export function resultLine(outcome: "won" | "lost", reason: string | null, opponent: string): string {
  const their = opponent === "The Nauarch" ? "the Nauarch's" : `${opponent}'s`;
  if (outcome === "won") {
    switch (reason) {
      case "Timeout":
        return `${opponent} ran out of time`;
      case "Resigned":
        return `${opponent} struck colours`;
      case "IllegalFleet":
        return `${their} fleet failed the check`;
      case "RevealTimeout":
        return `${opponent} did not reveal in time`;
      default:
        return `You sank ${their} fleet`;
    }
  }
  switch (reason) {
    case "Timeout":
      return "You ran out of time";
    case "Resigned":
      return "You struck colours";
    case "IllegalFleet":
      return "Your fleet failed the check";
    case "RevealTimeout":
      return "You did not reveal in time";
    default:
      return `${opponent} sank your fleet`;
  }
}

function seenKey(gameId: number): string {
  return `brinewar.splash.${gameId}`;
}

function alreadyShown(gameId: number): boolean {
  try {
    return window.sessionStorage.getItem(seenKey(gameId)) === "1";
  } catch {
    return false;
  }
}

function markShown(gameId: number): void {
  try {
    window.sessionStorage.setItem(seenKey(gameId), "1");
  } catch {
    return;
  }
}

interface ResultSplashProps {
  readonly gameId: number | null;
  readonly outcome: Outcome;
  readonly reason: string | null;
  readonly opponent: string;
  readonly reducedMotion: boolean;
}

export function ResultSplash({ gameId, outcome, reason, opponent, reducedMotion }: ResultSplashProps) {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (gameId === null || outcome === null || alreadyShown(gameId)) return;
    markShown(gameId);
    setOpen(gameId);
    const t = setTimeout(() => setOpen(null), HOLD_MS);
    return () => clearTimeout(t);
  }, [gameId, outcome]);
  if (open === null || outcome === null) return null;
  const won = outcome === "won";
  return (
    <div
      role="alert"
      onClick={() => setOpen(null)}
      className={cn(
        "fixed inset-0 z-30 grid cursor-pointer place-items-center overflow-hidden px-4 text-center",
        won ? "bg-[radial-gradient(circle_at_50%_45%,rgb(255_207_90/0.28),rgb(7_24_34/0.82)_62%)]" : "bg-[radial-gradient(circle_at_50%_45%,rgb(124_36_22/0.4),rgb(4_10_16/0.9)_62%)]",
        !reducedMotion && "animate-[splash-fade_4.2s_cubic-bezier(0.16,1,0.3,1)_both]",
      )}
    >
      {won && !reducedMotion && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {Array.from({ length: SPARKS }, (_, i) => (
            <span
              key={i}
              className="absolute top-[-4%] block h-3 w-1.5 rounded-[2px] bg-brass animate-[spark-fall_2.6s_cubic-bezier(0.3,0.1,0.6,1)_both]"
              style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.11}s`, rotate: `${(i * 53) % 180}deg`, opacity: 0.6 + ((i * 13) % 40) / 100 }}
            />
          ))}
        </div>
      )}
      <div className="relative grid justify-items-center gap-3">
        <p
          className={cn(
            "m-0 font-display text-[clamp(64px,15vw,190px)] leading-[0.85] font-bold tracking-[0.02em] uppercase",
            won ? "text-brass [text-shadow:0_6px_60px_rgb(255_207_90/0.55)]" : "text-hit [text-shadow:0_6px_60px_rgb(255_106_61/0.45)]",
            !reducedMotion && "animate-[splash-title_0.9s_cubic-bezier(0.16,1,0.3,1)_both]",
          )}
        >
          {won ? "Victory" : "Defeat"}
        </p>
        <p className={cn("m-0 rounded-full bg-deep/70 px-4 py-1.5 text-[clamp(16px,2.2vw,22px)] font-semibold text-ink backdrop-blur-md", !reducedMotion && "animate-[splash-sub_1.2s_cubic-bezier(0.16,1,0.3,1)_both]")}>
          {resultLine(outcome, reason, opponent)}
        </p>
        <p className="m-0 text-xs text-ink/70">Tap to see the battle</p>
      </div>
    </div>
  );
}
