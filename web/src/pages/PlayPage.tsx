import { Anchor, Flag, Loader2, Swords, WifiOff } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DuelInvite, duelFromLocation, JoinDuel, type DuelInviteRef } from "@/ui/DuelCards";
import { Button } from "@/components/ui/button";
import { hitsOnMe, hitsOnThem, opponentOf, outcome, sideOf } from "@/game/engine";
import type { GameSession } from "@/game/session";
import { useReducedMotion, useSession } from "@/game/useGame";
import { useBattleFeed, type CalloutTone } from "@/game/useBattleFeed";
import type { Mood } from "@/ui/NauarchPortrait";
import { useSkins, type HarbourStats } from "@/game/useHarbour";
import { sound } from "@/lib/sound";
import { CalloutBanner } from "@/ui/CalloutBanner";
import { EncounterCard, type BattleMode } from "@/world/EncounterCard";
import { useMapCaptains } from "@/world/useMapCaptains";
import { WorldMap, type Encounter } from "@/world/WorldMap";
import { layoutForBattle, randomLayout } from "@/scene/layoutChoice";
import { browserStorage } from "@/lib/storage";
import { FleetTray } from "@/ui/FleetTray";
import { clearWater, confirmedSunk, mergeSunk } from "@/lib/sunk";
import type { AppConfig } from "@/lib/config";
import { txLink } from "@/lib/config";
import { cryptoRng, placeFleet, ships } from "@/lib/fleet";
import { cellName, cn } from "@/lib/utils";
import { EndCard } from "@/ui/EndCard";
import { FireByName } from "@/ui/FireByName";
import { Landing } from "@/ui/Landing";
import { Setup } from "@/ui/Setup";
import { NauarchBubble } from "@/ui/NauarchBubble";
import { RevealSeal } from "@/ui/RevealSeal";
import { TopBar } from "@/ui/TopBar";
import { TurnClock } from "@/ui/TurnClock";

const SeaScene = lazy(() => import("@/scene/SeaScene").then((m) => ({ default: m.SeaScene })));

const GREETING = "The sea is calm, Captain. It will not stay that way.";

interface PlayPageProps {
  readonly cfg: AppConfig;
  readonly session: GameSession;
  readonly stats: HarbourStats;
  readonly landing: boolean;
  readonly onEnter: () => void;
}

export function PlayPage({ cfg, session, stats, landing, onEnter }: PlayPageProps) {
  const snap = useSession(session);
  const reducedMotion = useReducedMotion();
  const skins = useSkins(cfg, snap.accountId);
  const myLook = skins.look;
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

  const sunkTheirs = useMemo(() => mergeSunk(confirmedSunk(snap.marks.enemy), snap.announcedSunk), [snap.marks.enemy, snap.announcedSunk]);
  const clearCells = useMemo(() => clearWater(sunkTheirs, snap.marks.enemy), [sunkTheirs, snap.marks.enemy]);
  const heat = stats.admiralty && stats.admiralty.boards_counted > 0 ? stats.admiralty.heat : null;
  const feed = useBattleFeed({ myShips, myMarks: snap.marks.mine, enemyMarks: snap.marks.enemy, sunkTheirs, heat, boards: stats.admiralty?.boards_counted ?? 0, rival: duel ? (rival ?? "Your friend") : null });
  const firedSound = feed.fired;
  const onFire = useCallback(
    (index: number) => {
      sound.unlock();
      if (clearCells.has(index)) return;
      firedSound(index);
      void session.fire(index);
    },
    [session, firedSound, clearCells],
  );
  const sail = useCallback(() => {
    sound.unlock();
    void session.start(draft);
  }, [session, draft]);
  const challenge = useCallback(() => {
    sound.unlock();
    void session.startDuel(draft);
  }, [session, draft]);
  const forgetInvite = useCallback(() => {
    setJoinRef(null);
    window.history.replaceState(null, "", "/");
  }, []);
  const accept = useCallback(() => {
    if (joinRef === null) return;
    void session.join(joinRef.gameId, joinRef.secret, draft).then((ok) => ok && forgetInvite());
  }, [session, draft, joinRef, forgetInvite]);
  const [view, setView] = useState<"chart" | "setup">("chart");
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const captains = useMapCaptains(cfg, snap.accountId);
  const [layoutPick, setLayoutPick] = useState(() => randomLayout());
  const layout = useMemo(() => layoutForBattle(browserStorage(), snap.gameId, layoutPick), [snap.gameId, layoutPick]);
  const again = useCallback(() => {
    session.leave();
    setDraft(placeFleet(cryptoRng()));
    setLayoutPick(randomLayout());
    setView("chart");
  }, [session]);
  const [mode, setMode] = useState<BattleMode>("nauarch");
  const toSetup = useCallback((next: BattleMode) => {
    sound.unlock();
    setEncounter(null);
    setMode(next);
    setView("setup");
  }, []);

  const status = statusText(step, snap.busy, snap.marks.aiming, rival, g?.status ?? null);
  const showLanding = landing && !inBattle && joinId === null;
  const onChart = !inBattle && joinId === null && !landing && view === "chart";
  useEffect(() => {
    if (landing && snap.gameId !== null) onEnter();
  }, [landing, snap.gameId, onEnter]);
  const announceSunk = feed.announce;
  useEffect(() => {
    for (const ship of snap.announcedSunk) announceSunk(ship);
  }, [snap.announcedSunk, announceSunk]);
  const heard = useRef(result);
  useEffect(() => {
    if (result === heard.current) return;
    heard.current = result;
    if (result === "won") sound.victory();
    else if (result === "lost") sound.defeat();
  }, [result]);
  const rename = useCallback((name: string) => session.rename(name), [session]);
  const shuffle = useCallback(() => setDraft(placeFleet(cryptoRng())), []);
  const player = snap.captain?.player ?? null;
  const gold = player && /^\d+$/.test(player.gold) ? BigInt(player.gold) : null;
  const stakes = inBattle && g && !duel && !result && step !== "lost-board" ? `Sink all 10 ships: ${stats.treasury ? `+${stats.treasury.bounty} gold bounty` : "a bounty from his treasury"}. Lose: your ${g.stake} gold entry stays in his treasury.` : null;

  return (
    <main className="fixed inset-0">
      {onChart && <WorldMap captains={captains} mySail={myLook?.sprite ?? 1} myFlag={myLook?.pennant ?? 5} reducedMotion={reducedMotion} paused={snap.busy !== null} onEncounter={setEncounter} />}
      {!onChart && (
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
          enemyHulls={duel ? "brine" : "pirate"}
          layout={layout}
          enemyWrecks={sunkTheirs}
          enemyClear={clearCells}
          onLaunch={feed.onLaunch}
          onLand={feed.onLand}
        />
      </Suspense>
      )}

      <CalloutBanner callout={feed.callout} />

      {inBattle && step !== "invite" && step !== "lost-board" && (
        <div className="fixed top-[calc(76px+env(safe-area-inset-top))] left-[max(16px,env(safe-area-inset-left))] z-10 w-[268px] max-md:hidden">
          <FleetTray look={myLook} enemyMarks={snap.marks.enemy} myShips={myShips} myMarks={snap.marks.mine} sunkTheirs={sunkTheirs} enemyLabel={duel ? (rival ?? "Your friend") : "The Nauarch"} />
        </div>
      )}

      <RevealSeal show={inBattle && result !== null && (duel ? theyRevealed : snap.enemyFleet !== null)} tx={duel ? null : snap.enemyRevealTx} txHref={duel ? null : txLink(cfg, snap.enemyRevealTx)} reducedMotion={reducedMotion} />

      <TopBar myHits={g ? hitsOnMe(g, snap.accountId) : 0} enemyHits={g ? hitsOnThem(g, snap.accountId) : 0} showScore={inBattle && step !== "invite"} verifyHref={step === "invite" ? null : verifyHref} enemyLabel={duel ? (rival ?? "Friend") : "Nauarch"} />

      {status && (
        <div role="status" className="pointer-events-none fixed top-[calc(68px+env(safe-area-inset-top))] max-sm:top-[calc(106px+env(safe-area-inset-top))] left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-glass px-3.5 py-1.5 text-xs whitespace-nowrap text-muted backdrop-blur-md">
          {snap.busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {status}
          {snap.deadlineAt !== null && inBattle && !result && <TurnClock deadlineAt={snap.deadlineAt} />}
        </div>
      )}

      <div className={cn("fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-[max(16px,env(safe-area-inset-left))] z-10 max-sm:bottom-[calc(140px+env(safe-area-inset-bottom))]", (showLanding || onChart) && "hidden")}>
        <NauarchBubble mood={moodOf(feed.last)} line={line} thinking={step === "thinking"} fallback={GREETING} txHref={txHref} note={note} opponent={duel ? (rival ?? "Your friend") : null} inviting={step === "invite"} />
      </div>

      <div className="fixed right-[max(16px,env(safe-area-inset-right))] bottom-[calc(16px+env(safe-area-inset-bottom))] z-10 grid justify-items-end gap-2 max-sm:left-[max(16px,env(safe-area-inset-left))]">
        {(snap.error || snap.offline) && (
          <p role="alert" className="m-0 inline-flex max-w-[280px] items-center gap-1.5 rounded-xl border border-hit/50 bg-glass px-3 py-2 text-xs backdrop-blur-md">
            {snap.offline && <WifiOff className="size-3.5 shrink-0 text-hit" aria-hidden />}
            {snap.offline ? "Lost contact with the chain. Retrying…" : snap.error}
          </p>
        )}
        {!inBattle && joinId !== null && (
          <JoinDuel cfg={cfg} gameId={joinId} me={snap.accountId} busy={snap.busy !== null} onShuffle={shuffle} onAccept={accept} onDecline={forgetInvite} />
        )}
        {onChart && encounter && <EncounterCard encounter={encounter} stats={stats} busy={snap.busy !== null} onBattle={toSetup} onClose={() => setEncounter(null)} />}
        {onChart && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="glass" onClick={() => toSetup("friend")} disabled={snap.busy !== null}>
              <Swords aria-hidden />
              Invite a friend
            </Button>
            <Button variant="brass" onClick={() => toSetup("nauarch")} disabled={snap.busy !== null}>
              <Anchor aria-hidden />
              Prepare for battle
            </Button>
          </div>
        )}
        {!inBattle && joinId === null && !landing && view === "setup" && (
          <Setup
            onBack={() => setView("chart")}
            mode={mode}
            cells={draft}
            onCells={setDraft}
            onShuffle={shuffle}
            heat={heat}
            treasury={stats.treasury}
            gold={gold}
            name={player?.display_name ?? null}
            onRename={rename}
            skins={skins.owned}
            allSkins={skins.all}
            skin={skins.equipped}
            skinsFailed={skins.failed}
            onSkin={skins.equip}
            busy={snap.busy !== null}
            onSail={sail}
            onDuel={challenge}
          />
        )}
        {stakes && <p className="m-0 max-w-[300px] rounded-xl border border-line bg-glass px-3 py-2 text-[11px] text-muted backdrop-blur-md">{stakes}</p>}
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
      {showLanding && <Landing stats={stats} ready onEnter={onEnter} />}
    </main>
  );
}

export function statusText(step: string | null, busy: string | null, aiming: number | null, rival: string | null, phase: string | null = null): string | null {
  if (busy) return aiming !== null && busy === "Firing" ? `Firing at ${cellName(aiming)}…` : `${busy}…`;
  switch (step) {
    case "fire":
      return "Your turn: tap a cell in the fog to fire. A hit fires again.";
    case "thinking":
      return rival ? `${rival} is choosing a cell…` : "The Nauarch is choosing his shot…";
    case "invite":
      return "Waiting for your friend to accept the duel…";
    case "wait":
      if (aiming !== null) return rival ? `Shot at ${cellName(aiming)} is flying. ${rival} answers with a proof…` : `Shot at ${cellName(aiming)} is flying. He answers with a proof…`;
      if (phase === "Placing") return rival ? `${rival} is placing their fleet…` : "The Nauarch is sealing his fleet…";
      if (phase === "Revealing" || phase === "Finished") return "The fleets are being revealed for the final check…";
      return rival ? `${rival} is answering…` : "The Nauarch is answering…";
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

function moodOf(tone: CalloutTone | null): Mood {
  if (tone === "taken" || tone === "lost") return "smug";
  if (tone === "hit" || tone === "sunk") return "vexed";
  return "calm";
}
