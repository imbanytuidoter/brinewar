import { Check, Loader2, Lock, Pencil, Snowflake } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { rankProgress } from "@/game/economy";
import type { GameSession } from "@/game/session";
import { useBoot, useReducedMotion, useSession } from "@/game/useGame";
import { makeViewer } from "@/lib/chain";
import type { AppConfig } from "@/lib/config";
import { catalogSkins, equippedSkin, equipSkin, ownedSkins, skinLook, skinSource } from "@/lib/skins";
import { browserStorage } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { PageShell, Panel, Stat } from "@/ui/PageShell";
import { SpriteShip } from "@/ui/SpriteShip";

const NICKNAME = /^[A-Za-z0-9_-]{3,16}$/;
const FlagshipViewer = lazy(() => import("@/scene/FlagshipViewer"));

export function FleetPage({ cfg }: { readonly cfg: AppConfig }) {
  const { boot, retry } = useBoot(cfg);
  return (
    <PageShell
      title="Your fleet"
      lede={
        <p className="m-0">
          Your flagship is a NEP-245 token with its own battle record, and it ranks up only by fighting. Skins are tokens too. They change sails, flag, hull and the colour of
          your cannon trail, and nothing about how the ship plays.
        </p>
      }
    >
      {boot.kind === "boarding" && (
        <p className="inline-flex items-center gap-2 text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Signing you on…
        </p>
      )}
      {boot.kind === "error" && (
        <p className="text-hit">
          {boot.message}{" "}
          {boot.retryable && (
            <button type="button" className="underline" onClick={retry}>
              Try again
            </button>
          )}
        </p>
      )}
      {boot.kind === "ready" && <FleetView cfg={cfg} session={boot.session} />}
    </PageShell>
  );
}

const DEFAULT_SKIN = "brine";
const RANK_SHIPS: ReadonlyArray<readonly [rank: string, length: number, cls: string]> = [
  ["Ensign", 2, "Cutter"],
  ["Lieutenant", 3, "Sloop"],
  ["Captain", 4, "Frigate"],
  ["Commodore", 4, "Ship of the line"],
  ["Admiral", 4, "Flagship"],
];

interface Skins {
  readonly all: readonly string[];
  readonly owned: readonly string[];
}

function FleetView({ cfg, session }: { readonly cfg: AppConfig; readonly session: GameSession }) {
  const snap = useSession(session);
  const reducedMotion = useReducedMotion();
  const viewer = useMemo(() => makeViewer(cfg.rpcUrl, cfg.contractId), [cfg]);
  const store = useMemo(() => browserStorage(), []);
  const [svg, setSvg] = useState<string | null>(null);
  const [skins, setSkins] = useState<Skins | null>(null);
  const [equipped, setEquipped] = useState<string | null>(null);
  const captain = snap.captain;
  const flagship = captain?.player.flagship ?? null;

  useEffect(() => {
    if (!flagship) return;
    let alive = true;
    viewer.view<string | null>("ship_svg", { token_id: flagship }).then((s) => alive && setSvg(s)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [viewer, flagship, captain?.ship?.xp]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { all, owned } = await ownedSkins(viewer, session.snapshot.accountId);
      if (!alive) return;
      setSkins({ all: [...new Set([...all, ...catalogSkins()])], owned });
      setEquipped(equippedSkin(store, session.snapshot.accountId, owned));
    })().catch(() => alive && setSkins({ all: [], owned: [] }));
    return () => {
      alive = false;
    };
  }, [viewer, session, store]);

  const equip = useCallback(
    (name: string | null) => {
      equipSkin(store, session.snapshot.accountId, name);
      setEquipped(name);
    },
    [store, session],
  );

  if (!captain) {
    return (
      <p className="inline-flex items-center gap-2 text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Reading your logbook from the chain…
      </p>
    );
  }
  const ship = captain.ship;
  const progress = rankProgress(ship?.xp ?? 0);
  const look = skinLook(equipped ?? DEFAULT_SKIN);
  return (
    <>
      <Panel className="sm:grid-cols-[minmax(0,1.1fr)_1fr] sm:items-center">
        <div className="relative aspect-[8/5] overflow-hidden rounded-xl border border-line bg-[radial-gradient(circle_at_50%_30%,#3d8fd0,#0e2a3b_75%)]">
          <Suspense fallback={null}>
            <FlagshipViewer rank={progress.rank} look={look} reducedMotion={reducedMotion} />
          </Suspense>
          {svg && (
            <figure className="absolute right-2 bottom-2 m-0 grid w-16 gap-0.5 sm:w-24 rounded-md border border-line bg-black/40 p-1 backdrop-blur-sm">
              <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={`On-chain image of ${flagship}`} className="block w-full rounded-sm" />
              <figcaption className="text-center text-[9px] text-muted">token image</figcaption>
            </figure>
          )}
        </div>
        <div className="grid gap-4">
          <div>
            <p className="m-0 text-xs tracking-[0.12em] text-muted uppercase">{flagship}</p>
            <Nickname name={captain.player.display_name} busy={snap.busy !== null} onSave={(n) => session.rename(n)} error={snap.error} />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between">
              <p className="m-0 font-display text-2xl font-bold">{progress.rank}</p>
              <p className="m-0 text-xs text-muted tabular-nums">
                {ship?.xp ?? 0} XP{progress.next ? ` · next: ${progress.next} at ${ship?.next_rank_xp}` : " · top rank"}
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.share * 100)} aria-label="Progress to the next rank">
              <div className="h-full rounded-full bg-brass" style={{ width: `${progress.share * 100}%` }} />
            </div>
            <p className="m-0 text-xs text-muted">+10 XP per hit, +30 per ship of his you sink, +100 for sinking his whole fleet.</p>
          </div>
          {ship?.frozen && (
            <p className="m-0 inline-flex items-center gap-1.5 text-xs text-muted">
              <Snowflake className="size-3.5" aria-hidden />
              This flagship changed hands, so its rank is frozen.
            </p>
          )}
        </div>
      </Panel>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Gold" value={Number(captain.player.gold).toLocaleString("en-US")} />
        <Stat label="Battles" value={captain.player.games_vs_nauarch} sub={captain.player.last_result ? `last one ${captain.player.last_result}` : undefined} />
        <Stat label="Won / lost" value={`${captain.player.wins} / ${captain.player.losses}`} />
        <Stat label="His ships sunk" value={ship?.sunk ?? 0} sub={captain.player.fav_zone ? `you like to hide ${captain.player.fav_zone}` : undefined} />
      </section>

      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 font-display text-2xl font-bold">Your flagship by rank</h2>
          <p className="m-0 text-xs text-muted">Each rank refits the flagship as a bigger ship, in battle and in the viewer above.</p>
        </div>
        <ol className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-5">
          {RANK_SHIPS.map(([rank, length, cls]) => {
            const here = rank === progress.rank;
            return (
              <li key={rank} className={cn("grid gap-2 rounded-xl border p-3", here ? "border-brass bg-brass/10" : "border-line bg-white/5")}>
                <div className="grid h-16 place-items-center rounded-lg bg-[url(/sprites/map/water.png)] bg-[length:64px_64px] px-2">
                  <SpriteShip vertical={false} length={length} sail={look?.sprite ?? 1} flag={look?.pennant ?? 5} className="h-9 w-auto max-w-full" />
                </div>
                <span className="text-xs font-semibold">{rank}</span>
                <span className="text-[11px] text-muted">{cls}{here ? " · now" : ""}</span>
              </li>
            );
          })}
        </ol>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 font-display text-2xl font-bold">Skins</h2>
          <p className="m-0 text-xs text-muted">Every captain starts with three skins; each new rank mints one more on NEAR. Tap one to equip it: sails, flag and hull change here and in battle.</p>
        </div>
        {!skins ? (
          <Loader2 className="size-4 animate-spin text-muted" aria-label="Loading skins" />
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
            {skins.all.map((name) => {
              const l = skinLook(name);
              const owned = skins.owned.includes(name);
              const on = (equipped ?? DEFAULT_SKIN) === name && owned;
              const source = skinSource(name);
              return (
                <li key={name}>
                  <button
                    type="button"
                    disabled={!owned}
                    onClick={() => equip(name)}
                    aria-pressed={on}
                    className={cn("grid w-full gap-2 rounded-xl border border-line bg-white/5 p-3 text-left transition-colors hover:border-brass disabled:cursor-not-allowed", on && "border-brass bg-brass/10")}
                  >
                    <div className="relative grid h-24 place-items-center overflow-hidden rounded-lg bg-[url(/sprites/map/water.png)] bg-[length:72px_72px]">
                      <SpriteShip vertical={false} length={3} sail={l.sprite} flag={l.pennant} className={cn("h-14 w-auto", !owned && "opacity-55 saturate-50")} />
                      <span className="absolute top-1.5 left-1.5 size-3 rounded-full border border-white/40" style={{ background: l.hull ?? "#c98a5a" }} title="hull tone" aria-hidden />
                      {!owned && <Lock className="absolute top-1.5 right-1.5 size-4 text-ink/80" aria-hidden />}
                    </div>
                    <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                      {l.title}
                      {on ? (
                        <span className="inline-flex items-center gap-1 text-brass">
                          <Check className="size-3.5" aria-hidden />
                          Equipped
                        </span>
                      ) : (
                        <span className="font-normal text-muted">{owned ? "Tap to equip" : source && source !== "starter" ? `Reach ${source}` : "Not owned"}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}

interface NicknameProps {
  readonly name: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSave: (name: string) => Promise<boolean>;
}

function Nickname({ name, busy, error, onSave }: NicknameProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const valid = NICKNAME.test(value);
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!valid || busy) return;
    if (await onSave(value)) setEditing(false);
  };
  if (!editing)
    return (
      <div className="flex items-center gap-2">
        <p className="m-0 font-display text-4xl leading-tight font-bold break-all">{name}</p>
        <button type="button" onClick={() => setEditing(true)} className="rounded-md p-1 text-muted hover:text-ink" aria-label="Rename your captain">
          <Pencil className="size-4" aria-hidden />
        </button>
      </div>
    );
  return (
    <form onSubmit={submit} className="grid gap-1.5">
      <label className="text-xs text-muted" htmlFor="nickname">
        Captain's name, 3 to 16 of A-Z a-z 0-9 _ -
      </label>
      <div className="flex gap-2">
        <input id="nickname" value={value} maxLength={16} autoComplete="off" onChange={(e) => setValue(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-black/20 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brass" />
        <Button type="submit" variant="brass" disabled={!valid || busy}>
          Save
        </Button>
      </div>
      {!valid && value.length > 0 && <p className="m-0 text-xs text-hit">Only letters, digits, _ and -, 3 to 16 long.</p>}
      {error && <p className="m-0 text-xs text-hit">{error}</p>}
    </form>
  );
}
