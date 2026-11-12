import { ShieldCheck } from "lucide-react";
import { SHIP_CELLS } from "@/lib/contract";
import { Nav } from "./Nav";

interface TopBarProps {
  readonly myHits: number;
  readonly enemyHits: number;
  readonly showScore: boolean;
  readonly verifyHref: string | null;
  readonly enemyLabel?: string;
}

export function TopBar({ myHits, enemyHits, showScore, verifyHref, enemyLabel = "Nauarch" }: TopBarProps) {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-[max(16px,env(safe-area-inset-right))] pt-[calc(10px+env(safe-area-inset-top))] pb-2.5">
      <a href="/" className="pointer-events-auto font-display text-[22px] leading-none font-bold tracking-[0.01em] [text-shadow:0_2px_12px_rgb(0_0_0/0.35)]">
        Brinewar
        <small className="mt-1 block font-sans text-[11px] font-medium tracking-[0.14em] text-muted uppercase max-sm:hidden">naval battle · every shot proven</small>
      </a>
      <Nav compact className="pointer-events-auto" />
      <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2 max-sm:w-full">
        {showScore && (
          <>
            <Chip label="Your fleet" value={SHIP_CELLS - myHits} />
            <Chip label={enemyLabel} value={SHIP_CELLS - enemyHits} />
          </>
        )}
        {verifyHref && (
          <a href={verifyHref} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-glass px-3 py-1.5 text-xs font-semibold backdrop-blur-md hover:border-brass">
            <ShieldCheck className="size-3.5 text-ok" aria-hidden />
            Verify
          </a>
        )}
      </div>
    </header>
  );
}

function Chip({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="max-w-[46vw] truncate rounded-full border border-line bg-glass px-3 py-1.5 text-xs font-semibold whitespace-nowrap backdrop-blur-md" aria-label={`${label}: ${value} of ${SHIP_CELLS} cells afloat`}>
      {label} <b className="text-brass tabular-nums">{value}</b>/{SHIP_CELLS}
    </div>
  );
}
