import type { Callout, CalloutTone } from "@/game/useBattleFeed";
import { cn } from "@/lib/utils";

const TONE: Readonly<Record<CalloutTone, string>> = {
  hit: "text-hit [text-shadow:0_4px_30px_rgb(255_106_61/0.55)]",
  sunk: "text-brass [text-shadow:0_4px_36px_rgb(255_207_90/0.7)]",
  miss: "text-ink/80 text-[clamp(30px,6vw,56px)]",
  taken: "text-hit [text-shadow:0_4px_30px_rgb(255_106_61/0.45)]",
  lost: "text-hit [text-shadow:0_4px_36px_rgb(255_106_61/0.7)]",
  spared: "text-ok [text-shadow:0_4px_24px_rgb(127_224_181/0.45)] text-[clamp(30px,6vw,56px)]",
};

export function CalloutBanner({ callout }: { readonly callout: Callout | null }) {
  return (
    <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 top-[24%] z-[15] grid justify-items-center px-4 text-center">
      {callout && (
        <div key={callout.id} className="grid animate-callout justify-items-center gap-1 [filter:drop-shadow(0_2px_1px_rgb(11_34_48/0.7))_drop-shadow(0_6px_18px_rgb(11_34_48/0.45))]">
          <p className={cn("m-0 font-display text-[clamp(40px,9vw,92px)] leading-none font-bold tracking-tight uppercase", TONE[callout.tone])}>{callout.title}</p>
          {callout.sub && <p className="m-0 rounded-full border border-line bg-glass px-3 py-1 text-[13px] font-semibold text-ink backdrop-blur-md">{callout.sub}</p>}
        </div>
      )}
    </div>
  );
}
