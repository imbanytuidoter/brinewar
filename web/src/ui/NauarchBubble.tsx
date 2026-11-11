import { BadgeCheck, CircleAlert } from "lucide-react";
import type { NauarchLine } from "@/game/session";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, short } from "@/lib/utils";

interface NauarchBubbleProps {
  readonly line: NauarchLine | null;
  readonly thinking: boolean;
  readonly fallback: string;
  readonly txHref: (hash: string | null) => string | null;
}

export function NauarchBubble({ line, thinking, fallback, txHref }: NauarchBubbleProps) {
  const href = line ? txHref(line.tx) : null;
  return (
    <section aria-live="polite" aria-label="The Nauarch" className="grid max-w-[min(420px,calc(100vw-32px))] grid-cols-[52px_minmax(0,1fr)] items-end gap-2.5">
      <div
        aria-hidden
        className={cn(
          "grid size-[52px] place-items-center rounded-full border-2 border-brass bg-[radial-gradient(circle_at_40%_35%,#2b4a5c,#0b2230_75%)] font-display text-2xl font-bold",
          thinking && "animate-think",
        )}
      >
        N
      </div>
      <div key={line?.at ?? "idle"} className="grid min-w-0 animate-rise gap-1 rounded-[14px_14px_14px_4px] border border-line bg-glass px-3 py-2.5 backdrop-blur-md">
        <p className="m-0 break-words">{thinking ? "The Nauarch is studying the sea…" : line ? line.text : fallback}</p>
        {line && !thinking && (
          <Popover>
            <PopoverTrigger className="justify-self-start font-mono text-[11px] text-muted hover:text-ink">
              {line.signed ? (
                <span className="inline-flex items-center gap-1">
                  <BadgeCheck className="size-3.5 text-ok" aria-hidden />
                  <b className="font-semibold text-ok">signed</b> · NEAR AI · TEE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <CircleAlert className="size-3.5 text-hit" aria-hidden />
                  signature not checked here
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent>
              <p className="mb-2 text-ink">
                {line.signed
                  ? "The NEAR AI model signed this reply inside a TEE. The contract checked the signature on chain, and your browser just checked it again, together with this battle number and the exact cell he fired at."
                  : "Your browser could not match this line to this shot. The contract accepted the move on chain; open Verify for the details."}
              </p>
              {href && (
                <a className="font-mono text-brass underline-offset-2 hover:underline" href={href} target="_blank" rel="noreferrer">
                  tx {short(line.tx ?? "")}
                </a>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </section>
  );
}
