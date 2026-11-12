import { ArrowLeft, Loader2, Pause, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { marksFrom } from "@/game/engine";
import { buildReplay, candidates, isShowcase, type Replay } from "@/game/replay";
import { useBattleFeed } from "@/game/useBattleFeed";
import { useReducedMotion } from "@/game/useGame";
import { makeViewer } from "@/lib/chain";
import type { AppConfig } from "@/lib/config";
import type { ConfigView, GameView, ModelView, ShotView } from "@/lib/contract";
import { fetchEvidence } from "@/lib/proofs";
import { sound } from "@/lib/sound";
import { confirmedSunk } from "@/lib/sunk";
import { CalloutBanner } from "@/ui/CalloutBanner";
import { MuteToggle } from "@/ui/MuteToggle";
import { NauarchBubble } from "@/ui/NauarchBubble";
import type { Mood } from "@/ui/NauarchPortrait";

const SeaScene = lazy(() => import("@/scene/SeaScene").then((m) => ({ default: m.SeaScene })));

const SCAN_BATCH = 8;

type Load = { kind: "loading" } | { kind: "none" } | { kind: "error" } | { kind: "ok"; replay: Replay };

async function loadReplay(cfg: AppConfig, wanted: number | null): Promise<Replay | null> {
  const viewer = makeViewer(cfg.rpcUrl, cfg.contractId);
  const model = await viewer.view<ModelView | null>("model").catch(() => null);
  const ids = wanted !== null ? [wanted] : candidates((await viewer.view<ConfigView>("config")).games);
  const games: GameView[] = [];
  for (let i = 0; i < ids.length; i += SCAN_BATCH) {
    const batch = await Promise.all(ids.slice(i, i + SCAN_BATCH).map((id) => viewer.view<GameView | null>("get_game", { game_id: id }).catch(() => null)));
    games.push(...batch.filter((g): g is GameView => g !== null && isShowcase(g)));
  }
  for (const game of [...games].sort((x, y) => x.shots - y.shots)) {
    const id = game.id;
    const [history, ev] = await Promise.all([viewer.view<ShotView[]>("get_history", { game_id: id }), fetchEvidence(cfg.apiUrl, id).catch(() => null)]);
    const replay = buildReplay(game, history, ev, model);
    if (replay.nauarchShips && replay.lines.size > 0) return replay;
  }
  return null;
}

export function ReplayPage({ cfg, gameId }: { readonly cfg: AppConfig; readonly gameId: number | null }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    loadReplay(cfg, gameId)
      .then((replay) => alive && setLoad(replay ? { kind: "ok", replay } : { kind: "none" }))
      .catch(() => alive && setLoad({ kind: "error" }));
    return () => {
      alive = false;
    };
  }, [cfg, gameId]);
  if (load.kind === "ok") return <Theatre replay={load.replay} />;
  const text = load.kind === "loading" ? "Finding a finished battle on the chain…" : load.kind === "none" ? "No finished battle with a full Nauarch record yet." : "Could not read the chain. Try again in a moment.";
  return (
    <main className="grid h-full place-items-center bg-[radial-gradient(120%_80%_at_50%_0%,#2a8db6,#0b2230_70%)] px-4 text-center">
      <div className="grid justify-items-center gap-3">
        {load.kind === "loading" && <Loader2 className="size-5 animate-spin text-brass" aria-hidden />}
        <p className="m-0 max-w-sm text-muted">{text}</p>
        <a href="/judges" className="text-xs text-brass underline-offset-2 hover:underline">
          Back to the judges' page
        </a>
      </div>
    </main>
  );
}

function moodOf(tone: string | null): Mood {
  if (tone === "taken" || tone === "lost") return "smug";
  if (tone === "hit" || tone === "sunk") return "vexed";
  return "calm";
}

function Theatre({ replay }: { readonly replay: Replay }) {
  const { game, history } = replay;
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const shown = useMemo(() => history.slice(0, step), [history, step]);
  const marks = useMemo(() => marksFrom(shown, game.a), [shown, game.a]);
  const done = step >= history.length;
  const wrecks = useMemo(() => confirmedSunk(marks.enemy), [marks.enemy]);
  const feed = useBattleFeed({ myShips: replay.captainShips, myMarks: marks.mine, enemyMarks: marks.enemy, heat: null, boards: 0, rival: null });
  const lastNauarch = [...shown].reverse().find((s) => s.by === game.b && replay.lines.has(s.n));
  const spoken = lastNauarch ? replay.lines.get(lastNauarch.n) : undefined;

  useEffect(() => {
    if (!playing || done) return;
    const t = setTimeout(() => setStep((s) => s + 1), replay.delays[step] ?? 0);
    return () => clearTimeout(t);
  }, [playing, done, step, replay.delays]);

  const start = useCallback(() => {
    sound.unlock();
    if (done) setStep(0);
    setPlaying((p) => !p || done);
  }, [done]);

  const restart = useCallback(() => {
    sound.unlock();
    setStep(0);
    setPlaying(true);
  }, []);

  const line = spoken ? { text: spoken.text, kind: "Shot", signed: spoken.check === "ok", tx: spoken.tx, at: lastNauarch?.n ?? 0 } : null;

  return (
    <main className="fixed inset-0">
      <Suspense fallback={<div className="grid h-full place-items-center bg-gradient-to-b from-[#8fd3ff] to-[#2a8db6] font-semibold text-deep">Raising the fleets…</div>}>
        <SeaScene
          myShips={replay.captainShips}
          myMarks={marks.mine}
          enemyMarks={marks.enemy}
          enemyShips={done ? replay.nauarchShips : null}
          aiming={null}
          canFire={false}
          reducedMotion={reduced}
          onFire={() => undefined}
          enemyLabel="The Nauarch"
          enemyWrecks={wrecks}
          onLaunch={feed.onLaunch}
          onLand={feed.onLand}
        />
      </Suspense>
      <CalloutBanner callout={feed.callout} />

      <header className="fixed inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-3 px-4 pt-[calc(12px+env(safe-area-inset-top))]">
        <a href="/judges" className="inline-flex items-center gap-1.5 rounded-full border border-line bg-glass px-3 py-1.5 text-xs font-semibold backdrop-blur-md hover:border-brass">
          <ArrowLeft className="size-3.5" aria-hidden />
          Judges
        </a>
        <p className="m-0 rounded-full border border-line bg-glass px-3 py-1.5 text-xs backdrop-blur-md">
          Replay of battle #{game.id} from the chain · shot {Math.min(step, history.length)} of {history.length}
        </p>
        <div className="flex items-center gap-2">
          <MuteToggle />
          <a href={`/verify/${game.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-glass px-3 py-1.5 text-xs font-semibold backdrop-blur-md hover:border-brass">
            <ShieldCheck className="size-3.5 text-ok" aria-hidden />
            Verify every proof
          </a>
        </div>
      </header>

      <div className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-4 z-10 max-sm:bottom-[calc(96px+env(safe-area-inset-bottom))]">
        <NauarchBubble mood={moodOf(feed.last)} line={line} thinking={false} fallback="Every line here was signed by the model on NEAR AI and checked by the contract." txHref={() => null} />
      </div>

      {done && (
        <div className="fixed top-[calc(72px+env(safe-area-inset-top))] left-1/2 z-10 grid w-[min(440px,calc(100vw-32px))] -translate-x-1/2 animate-rise gap-1.5 rounded-2xl border border-line bg-glass p-4 text-center backdrop-blur-md">
          <p className="m-0 font-display text-2xl font-bold">The Nauarch wins battle #{game.id}</p>
          <p className="m-0 text-[13px] text-muted">
            {history.length} shots, each answered with a Merkle proof against a sealed board. {replay.lines.size} of his lines were signed by the model on NEAR AI. His fleet above was rebuilt from the root he sealed before the first shot.
          </p>
          <a href={`/verify/${game.id}`} className="justify-self-center text-[13px] font-semibold text-brass underline-offset-2 hover:underline">
            Check every proof yourself
          </a>
        </div>
      )}

      <div className="fixed right-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-10 flex items-center gap-2 max-sm:left-4">
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/15 max-sm:flex-1" aria-hidden>
          <div className="h-full bg-brass transition-[width] duration-300" style={{ width: `${(Math.min(step, history.length) / Math.max(1, history.length)) * 100}%` }} />
        </div>
        <Button size="sm" onClick={restart} aria-label="Restart the replay">
          <RotateCcw aria-hidden />
        </Button>
        <Button variant="brass" onClick={start}>
          {playing && !done ? <Pause aria-hidden /> : <Play aria-hidden />}
          {playing && !done ? "Pause" : done ? "Watch again" : step === 0 ? `Watch battle #${game.id}` : "Resume"}
        </Button>
      </div>
    </main>
  );
}
