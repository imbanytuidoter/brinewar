import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { short } from "@/lib/utils";

interface RevealSealProps {
  readonly show: boolean;
  readonly txHref: string | null;
  readonly tx: string | null;
  readonly reducedMotion: boolean;
  readonly opponent: string;
}

const SEAL_DELAY_MS = 2200;
const SEAL_HOLD_MS = 7000;

export function RevealSeal({ show, txHref, tx, reducedMotion, opponent }: RevealSealProps) {
  const [phase, setPhase] = useState<"hidden" | "on" | "gone">("hidden");
  useEffect(() => {
    if (!show) {
      setPhase("hidden");
      return;
    }
    const delay = reducedMotion ? 0 : SEAL_DELAY_MS;
    const on = setTimeout(() => setPhase("on"), delay);
    const off = setTimeout(() => setPhase("gone"), delay + SEAL_HOLD_MS);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [show, reducedMotion]);
  if (phase !== "on") return null;
  const their = opponent === "The Nauarch" ? "The Nauarch's" : `${opponent}'s`;
  const seal = (
    <span className="grid size-[150px] animate-stamp place-items-center content-center rounded-full bg-wax text-center text-[14px] leading-tight font-bold tracking-[0.1em] text-white uppercase shadow-[inset_0_0_0_6px_rgb(255_255_255/0.85),0_20px_60px_rgb(0_0_0/0.45)] max-sm:size-[120px]">
      Played
      <Check className="size-11 max-sm:size-9" strokeWidth={3} aria-hidden />
      fair
    </span>
  );
  return (
    <div role="status" className="pointer-events-none fixed top-[38%] left-1/2 z-20 grid w-[min(340px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 justify-items-center gap-3 max-sm:top-[34%]">
      {seal}
      <p className="pointer-events-auto m-0 rounded-xl bg-deep/85 px-3.5 py-2.5 text-center text-[13px] leading-snug text-ink backdrop-blur-md">
        {their} fleet matches the board sealed on chain before the first shot, so every “miss” was true.
        {txHref && tx && (
          <a href={txHref} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs font-semibold text-brass underline-offset-4 hover:underline">
            See the reveal on chain · {short(tx, 4, 3)}
          </a>
        )}
      </p>
    </div>
  );
}
