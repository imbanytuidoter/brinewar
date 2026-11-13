import { ShieldCheck } from "lucide-react";
import { SHIP_CELLS } from "@/lib/contract";
import { SiteHeader } from "./SiteHeader";

interface TopBarProps {
  readonly myHits: number;
  readonly enemyHits: number;
  readonly showScore: boolean;
  readonly verifyHref: string | null;
  readonly enemyLabel?: string;
}

export function TopBar({ myHits, enemyHits, showScore, verifyHref, enemyLabel = "Nauarch" }: TopBarProps) {
  return (
    <SiteHeader
      overlay
      tools={
        <>
          {showScore && (
            <span className="flex items-center justify-center gap-2 md:hidden max-sm:gap-1.5">
              <Chip label="Your fleet" value={SHIP_CELLS - myHits} />
              <Chip label={enemyLabel} value={SHIP_CELLS - enemyHits} />
            </span>
          )}
          {verifyHref && (
            <a href={verifyHref} aria-label="Verify this battle" className="inline-flex items-center gap-1.5 rounded-full border border-line bg-glass px-3 py-1.5 text-xs font-semibold backdrop-blur-md hover:border-brass max-sm:px-2">
              <ShieldCheck className="size-3.5 text-ok" aria-hidden />
              <span className="max-sm:sr-only">Verify</span>
            </a>
          )}
        </>
      }
    />
  );
}

function Chip({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="max-w-[46vw] truncate rounded-full border max-sm:max-w-[38vw] max-sm:px-2.5 border-line bg-glass px-3 py-1.5 text-xs font-semibold whitespace-nowrap backdrop-blur-md" aria-label={`${label}: ${value} of ${SHIP_CELLS} cells afloat`}>
      {label} <b className="text-brass tabular-nums">{value}</b>/{SHIP_CELLS}
    </div>
  );
}
