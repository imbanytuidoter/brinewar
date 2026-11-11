import { Flag, Loader2, WifiOff } from "lucide-react";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { outcome } from "@/game/engine";
import type { GameSession } from "@/game/session";
import { useReducedMotion, useSession } from "@/game/useGame";
import type { AppConfig } from "@/lib/config";
import { txLink } from "@/lib/config";
import { cryptoRng, placeFleet, ships } from "@/lib/fleet";
import { cellName } from "@/lib/utils";
import { EndCard } from "@/ui/EndCard";
import { FireByName } from "@/ui/FireByName";
import { Harbour } from "@/ui/Harbour";
import { NauarchBubble } from "@/ui/NauarchBubble";
import { TopBar } from "@/ui/TopBar";

const SeaScene = lazy(() => import("@/scene/SeaScene").then((m) => ({ default: m.SeaScene })));

const GREETING = "The sea is calm, Captain. It will not stay that way.";

interface PlayPageProps {
  readonly cfg: AppConfig;
  readonly session: GameSession;
}

export function PlayPage({ cfg, session }: PlayPageProps) {
  const snap = useSession(session);
  const reducedMotion = useReducedMotion();
  const [draft, setDraft] = useState<number[]>(() => placeFleet(cryptoRng()));
  const inBattle = snap.gameId !== null;
  const cells = inBattle ? snap.board?.cells ?? null : draft;
  const myShips = useMemo(() => (cells ? ships(cells) : []), [cells]);
  const step = snap.step?.kind ?? null;
  const g = snap.game;
  const result = g ? outcome(g, snap.accountId) : null;
  const line = snap.lines.at(-1) ?? null;
  const verifyHref = snap.gameId !== null ? `/verify/${snap.gameId}` : null;
  const txHref = useCallback((h: string | null) => txLink(cfg, h), [cfg]);

  const onFire = useCallback((index: number) => void session.fire(index), [session]);
  const sail = useCallback(() => void session.start(draft), [session, draft]);
  const again = useCallback(() => {
    session.leave();
    setDraft(placeFleet(cryptoRng()));
  }, [session]);

  const status = statusText(step, snap.busy, snap.marks.aiming);

  return (
    <main className="fixed inset-0">
      <Suspense fallback={<div className="grid h-full place-items-center bg-gradient-to-b from-[#8fd3ff] to-[#2a8db6] font-semibold text-deep">Raising the fleets…</div>}>
        <SeaScene
          myShips={myShips}
          myMarks={snap.marks.mine}
          enemyMarks={snap.marks.enemy}
          enemyShips={snap.enemyFleet}
          aiming={snap.marks.aiming}
          canFire={step === "fire" && snap.busy === null}
          reducedMotion={reducedMotion}
          onFire={onFire}
        />
      </Suspense>

      <TopBar myHits={g?.hits_on_a ?? 0} enemyHits={g?.hits_on_b ?? 0} showScore={inBattle} verifyHref={verifyHref} />

      {status && (
        <div role="status" className="pointer-events-none fixed top-[calc(68px+env(safe-area-inset-top))] left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-glass px-3.5 py-1.5 text-xs whitespace-nowrap text-muted backdrop-blur-md">
          {snap.busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {status}
        </div>
      )}

      <div className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-[max(16px,env(safe-area-inset-left))] z-10 max-sm:bottom-[calc(140px+env(safe-area-inset-bottom))]">
        <NauarchBubble line={line} thinking={step === "thinking"} fallback={GREETING} txHref={txHref} />
      </div>

      <div className="fixed right-[max(16px,env(safe-area-inset-right))] bottom-[calc(16px+env(safe-area-inset-bottom))] z-10 grid justify-items-end gap-2 max-sm:left-[max(16px,env(safe-area-inset-left))]">
        {(snap.error || snap.offline) && (
          <p role="alert" className="m-0 inline-flex max-w-[280px] items-center gap-1.5 rounded-xl border border-hit/50 bg-glass px-3 py-2 text-xs backdrop-blur-md">
            {snap.offline && <WifiOff className="size-3.5 shrink-0 text-hit" aria-hidden />}
            {snap.offline ? "Lost contact with the chain. Retrying…" : snap.error}
          </p>
        )}
        {!inBattle && <Harbour busy={snap.busy !== null} onShuffle={() => setDraft(placeFleet(cryptoRng()))} onSail={sail} />}
        {inBattle && result && verifyHref && <EndCard outcome={result} reason={g?.finish_reason ?? null} verifyHref={verifyHref} done={step === "done"} onAgain={again} />}
        {inBattle && step === "lost-board" && (
          <div className="grid max-w-[280px] gap-2 rounded-2xl border border-line bg-glass p-3 text-[13px] backdrop-blur-md">
            <p className="m-0">This browser lost the board of your open battle, so it cannot answer the Nauarch with proofs.</p>
            <Button onClick={() => void session.resign()} disabled={snap.busy !== null}>
              <Flag aria-hidden />
              Strike colours and start over
            </Button>
          </div>
        )}
        {inBattle && !result && step !== "lost-board" && <FireByName disabled={step !== "fire" || snap.busy !== null} onFire={onFire} />}
        {inBattle && !result && step !== "lost-board" && (
          <Button size="sm" variant="ghost" onClick={() => void session.resign()} disabled={snap.busy !== null}>
            <Flag aria-hidden />
            Strike colours
          </Button>
        )}
      </div>
    </main>
  );
}

function statusText(step: string | null, busy: string | null, aiming: number | null): string | null {
  if (busy) return aiming !== null && busy === "Firing" ? `Firing at ${cellName(aiming)}…` : `${busy}…`;
  switch (step) {
    case "fire":
      return "Your turn: tap a cell in the fog to fire.";
    case "thinking":
      return "The Nauarch is choosing his shot…";
    case "wait":
      return aiming !== null ? `Shot at ${cellName(aiming)} is on its way…` : "Waiting for the chain…";
    case "commit":
      return "Sealing your board…";
    case "answer":
      return "Answering his shot with a proof…";
    case "reveal":
      return "Revealing your fleet for the final check…";
    default:
      return null;
  }
}
