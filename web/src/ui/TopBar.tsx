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
        </>
      }
    />
  );
}

function Chip({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="max-w-[46vw] truncate rounded-full border border-line bg-glass px-3 py-1.5 text-xs font-semibold whitespace-nowrap backdrop-blur-md" aria-label={`${label}: ${value} of ${SHIP_CELLS} cells afloat`}>
      {label} <b className="text-brass tabular-nums">{value}</b>/{SHIP_CELLS}
    </div>
  );
}
