import { Flag, Loader2, WifiOff } from "lucide-react";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { DuelInvite, duelFromLocation, JoinDuel, type DuelInviteRef } from "@/ui/DuelCards";
import { Button } from "@/components/ui/button";
import { hitsOnMe, hitsOnThem, opponentOf, outcome, sideOf } from "@/game/engine";
import type { GameSession } from "@/game/session";
import { useEquippedLook, useReducedMotion, useSession } from "@/game/useGame";
import type { AppConfig } from "@/lib/config";
import { txLink } from "@/lib/config";
import { cryptoRng, placeFleet, ships } from "@/lib/fleet";
import { cellName } from "@/lib/utils";
import { EndCard } from "@/ui/EndCard";
import { FireByName } from "@/ui/FireByName";
import { Harbour } from "@/ui/Harbour";
import { NauarchBubble } from "@/ui/NauarchBubble";
import { RevealSeal } from "@/ui/RevealSeal";
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
  const myLook = useEquippedLook(cfg, snap.accountId);
  const [draft, setDraft] = useState<number[]>(() => placeFleet(cryptoRng()));
  const inBattle = snap.gameId !== null;
  const cells = inBattle ? snap.board?.cells ?? null : draft;
  const myShips = useMemo(() => (cells ? ships(cells) : []), [cells]);
  const step = snap.step?.kind ?? null;
  const g = snap.game;
  const result = g ? outcome(g, snap.accountId) : null;
  const duel = g?.mode === "PvP";
  const rival = duel ? (snap.opponentName ?? (g && opponentOf(g, snap.accountId) !== snap.accountId ? "Your friend" : null)) : null;
  const enemyLabel = duel ? (rival ?? "Your friend") : "The Nauarch";
  const theyRevealed = g ? (sideOf(g, snap.accountId) === "a" ? g.revealed_b : g.revealed_a) : false;
  const [joinRef, setJoinRef] = useState<DuelInviteRef | null>(() => duelFromLocation(window.location.search, window.location.hash));
  const joinId = joinRef?.gameId ?? null;
  const line = snap.lines.at(-1) ?? null;
  const lastHis = g && !duel ? snap.history.filter((s) => s.by === g.b).at(-1) : undefined;
  const note = lastHis?.source === "Deterministic" ? "Last shot without the model: deterministic fallback by the contract." : lastHis?.source === "ModelFallback" ? "The model's cell was invalid, so the contract chose this shot." : null;
  const verifyHref = snap.gameId !== null ? `/verify/${snap.gameId}` : null;
  const txHref = useCallback((h: string | null) => txLink(cfg, h), [cfg]);

  const onFire = useCallback((index: number) => void session.fire(index), [session]);
  const sail = useCallback(() => void session.start(draft), [session, draft]);
  const challenge = useCallback(() => void session.startDuel(draft), [session, draft]);
  const forgetInvite = useCallback(() => {
    setJoinRef(null);
    window.history.replaceState(null, "", "/");
  }, []);
  const accept = useCallback(() => {
    if (joinRef === null) return;
    void session.join(joinRef.gameId, joinRef.secret, draft).then((ok) => ok && forgetInvite());
  }, [session, draft, joinRef, forgetInvite]);
  const again = useCallback(() => {
    session.leave();
    setDraft(placeFleet(cryptoRng()));
  }, [session]);

  const status = statusText(step, snap.busy, snap.marks.aiming, rival);

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
          myLook={myLook}
          enemyLabel={enemyLabel}
        />
      </Suspense>

      <RevealSeal show={inBattle && result !== null && (duel ? theyRevealed : snap.enemyFleet !== null)} tx={duel ? null : snap.enemyRevealTx} txHref={duel ? null : txLink(cfg, snap.enemyRevealTx)} reducedMotion={reducedMotion} />

      <TopBar myHits={g ? hitsOnMe(g, snap.accountId) : 0} enemyHits={g ? hitsOnThem(g, snap.accountId) : 0} showScore={inBattle && step !== "invite"} verifyHref={step === "invite" ? null : verifyHref} enemyLabel={duel ? (rival ?? "Friend") : "Nauarch"} />

      {status && (
        <div role="status" className="pointer-events-none fixed top-[calc(68px+env(safe-area-inset-top))] max-sm:top-[calc(106px+env(safe-area-inset-top))] left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-glass px-3.5 py-1.5 text-xs whitespace-nowrap text-muted backdrop-blur-md">
          {snap.busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {status}
        </div>
      )}

      <div className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-[max(16px,env(safe-area-inset-left))] z-10 max-sm:bottom-[calc(140px+env(safe-area-inset-bottom))]">
        <NauarchBubble line={line} thinking={step === "thinking"} fallback={GREETING} txHref={txHref} note={note} opponent={duel ? (rival ?? "Your friend") : null} inviting={step === "invite"} />
      </div>

      <div className="fixed right-[max(16px,env(safe-area-inset-right))] bottom-[calc(16px+env(safe-area-inset-bottom))] z-10 grid justify-items-end gap-2 max-sm:left-[max(16px,env(safe-area-inset-left))]">
        {(snap.error || snap.offline) && (
          <p role="alert" className="m-0 inline-flex max-w-[280px] items-center gap-1.5 rounded-xl border border-hit/50 bg-glass px-3 py-2 text-xs backdrop-blur-md">
            {snap.offline && <WifiOff className="size-3.5 shrink-0 text-hit" aria-hidden />}
            {snap.offline ? "Lost contact with the chain. Retrying…" : snap.error}
          </p>
        )}
        {!inBattle && joinId !== null && (
          <JoinDuel cfg={cfg} gameId={joinId} me={snap.accountId} busy={snap.busy !== null} onShuffle={() => setDraft(placeFleet(cryptoRng()))} onAccept={accept} onDecline={forgetInvite} />
        )}
        {!inBattle && joinId === null && <Harbour busy={snap.busy !== null} onShuffle={() => setDraft(placeFleet(cryptoRng()))} onSail={sail} onDuel={challenge} />}
        {inBattle && step === "invite" && snap.gameId !== null && <DuelInvite gameId={snap.gameId} secret={snap.invite} busy={snap.busy !== null} onCancel={() => void session.resign()} />}
        {inBattle && joinId !== null && step !== "done" && <p className="m-0 max-w-[280px] rounded-xl border border-line bg-glass px-3 py-2 text-xs backdrop-blur-md">Finish this battle first, then open the duel link again.</p>}
        {inBattle && result && verifyHref && <EndCard outcome={result} reason={g?.finish_reason ?? null} verifyHref={verifyHref} done={step === "done"} onAgain={again} rewards={snap.rewards} opponent={duel ? rival : null} />}
        {inBattle && step === "lost-board" && (
          <div className="grid max-w-[280px] gap-2 rounded-2xl border border-line bg-glass p-3 text-[13px] backdrop-blur-md">
            <p className="m-0">This browser lost the board of your open battle, so it cannot answer with proofs.</p>
            <Button onClick={() => void session.resign()} disabled={snap.busy !== null}>
              <Flag aria-hidden />
              Strike colours and start over
            </Button>
          </div>
        )}
        {inBattle && !result && step !== "lost-board" && step !== "invite" && <FireByName disabled={step !== "fire" || snap.busy !== null} onFire={onFire} />}
        {inBattle && !result && step !== "lost-board" && step !== "invite" && (
          <Button size="sm" variant="ghost" onClick={() => void session.resign()} disabled={snap.busy !== null}>
            <Flag aria-hidden />
            Strike colours
          </Button>
        )}
      </div>
    </main>
  );
}

function statusText(step: string | null, busy: string | null, aiming: number | null, rival: string | null): string | null {
  if (busy) return aiming !== null && busy === "Firing" ? `Firing at ${cellName(aiming)}…` : `${busy}…`;
  switch (step) {
    case "fire":
      return "Your turn: tap a cell in the fog to fire.";
    case "thinking":
      return rival ? `${rival} is choosing a cell…` : "The Nauarch is choosing his shot…";
    case "invite":
      return "Waiting for your friend to accept the duel…";
    case "wait":
      return aiming !== null ? `Shot at ${cellName(aiming)} is on its way…` : "Waiting for the chain…";
    case "commit":
      return "Sealing your board…";
    case "answer":
      return rival ? "Answering their shot with a proof…" : "Answering his shot with a proof…";
    case "reveal":
      return "Revealing your fleet for the final check…";
    default:
      return null;
  }
}
