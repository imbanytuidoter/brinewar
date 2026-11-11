import { useEffect, useState } from "react";
import { cn, short } from "@/lib/utils";

interface RevealSealProps {
  readonly show: boolean;
  readonly txHref: string | null;
  readonly tx: string | null;
  readonly reducedMotion: boolean;
}

const SEAL_DELAY_MS = 2200;
const SEAL_HOLD_MS = 7000;

export function RevealSeal({ show, txHref, tx, reducedMotion }: RevealSealProps) {
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
  const body = (
    <>
      Fleet
      <span className="block text-[44px] leading-none tracking-normal">✓</span>
      verified
      {tx && <small className="mt-1 block font-mono text-[10px] tracking-normal normal-case opacity-85">reveal · tx {short(tx, 4, 3)}</small>}
    </>
  );
  const cls = cn(
    "fixed top-[40%] left-1/2 z-20 grid size-[168px] -translate-x-1/2 -translate-y-1/2 animate-stamp place-items-center content-center rounded-full bg-wax text-center text-[15px] leading-tight font-bold tracking-[0.1em] text-white uppercase shadow-[inset_0_0_0_6px_rgb(255_255_255/0.85),0_20px_60px_rgb(0_0_0/0.45)] max-sm:top-[32%] max-sm:size-[136px]",
  );
  return txHref ? (
    <a href={txHref} target="_blank" rel="noopener noreferrer" className={cls} aria-label="Fleet verified: open the reveal transaction">
      {body}
    </a>
  ) : (
    <div className={cls} role="status">
      {body}
    </div>
  );
}
