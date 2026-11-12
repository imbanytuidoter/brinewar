import { Loader2 } from "lucide-react";
import { cellName, cn } from "@/lib/utils";
import { TurnClock } from "./TurnClock";

export type Side = "you" | "them" | "none";

export interface Turn {
  readonly side: Side;
  readonly title: string;
  readonly sub: string | null;
}

export interface TurnInput {
  readonly step: string | null;
  readonly busy: string | null;
  readonly aiming: number | null;
  readonly incoming: number | null;
  readonly rival: string | null;
  readonly phase: string | null;
}

export function turnOf({ step, busy, aiming, incoming, rival, phase }: TurnInput): Turn | null {
  const them = rival ?? "The Nauarch";
  const proof = rival ? `${rival} answers with a proof` : "He answers with a proof";
  switch (step) {
    case "fire":
      if (busy && aiming !== null) return { side: "you", title: `Your shot · ${cellName(aiming)}`, sub: "Firing…" };
      return { side: "you", title: "Your shot", sub: "Tap a cell in his sea. A hit fires again." };
    case "wait":
      if (aiming !== null) return { side: "you", title: `Your shot · ${cellName(aiming)}`, sub: `${proof}…` };
      if (phase === "Placing") return { side: "none", title: rival ? `${rival} is placing ships` : "He is sealing his fleet", sub: null };
      if (phase === "Revealing" || phase === "Finished") return { side: "none", title: "Battle over", sub: "Both fleets are revealed for the final check…" };
      return { side: "them", title: `${them} is answering`, sub: null };
    case "thinking":
      return { side: "them", title: `${them} is aiming`, sub: rival ? null : "The model picks his next cell." };
    case "answer":
      return { side: "them", title: incoming !== null ? `${them} fired · ${cellName(incoming)}` : `${them} fired`, sub: "Your browser answers with a proof…" };
    case "commit":
      return { side: "none", title: "Sealing your board", sub: busy ? `${busy}…` : null };
    case "reveal":
      return { side: "none", title: "Revealing your fleet", sub: "For the final check" };
    default:
      return null;
  }
}

const TONE: Readonly<Record<Side, string>> = {
  you: "border-brass/70 bg-[linear-gradient(180deg,#ffd56e,#e9a72a)] text-[#241a05]",
  them: "border-hit/70 bg-[linear-gradient(180deg,#b9442a,#7c2416)] text-ink",
  none: "border-line bg-glass text-ink backdrop-blur-md",
};

export function TurnBanner({ turn, busy, deadlineAt }: { readonly turn: Turn; readonly busy: boolean; readonly deadlineAt: number | null }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed top-[calc(64px+env(safe-area-inset-top))] left-1/2 z-10 grid -translate-x-1/2 justify-items-center gap-1 max-sm:top-[calc(124px+env(safe-area-inset-top))]">
      <p key={turn.title} className={cn("m-0 inline-flex max-w-[calc(100vw-32px)] animate-rise items-center gap-2 rounded-xl border px-4 py-1.5 shadow-[0_8px_24px_rgb(0_0_0/0.25)]", TONE[turn.side])}>
        {busy && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />}
        <span className="truncate font-display text-[clamp(18px,2.4vw,24px)] leading-none font-bold tracking-[0.02em] uppercase">{turn.title}</span>
        {deadlineAt !== null && <TurnClock deadlineAt={deadlineAt} className="rounded-md bg-black/25 px-1.5 py-0.5 text-sm text-white" />}
      </p>
      {turn.sub && <p className="m-0 max-w-[calc(100vw-32px)] truncate rounded-full bg-deep/70 px-3 py-0.5 text-xs text-ink/90 backdrop-blur-md">{turn.sub}</p>}
    </div>
  );
}
