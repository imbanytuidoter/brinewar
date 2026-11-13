import { Check, Loader2, Lock, Pencil, Snowflake } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { RANKS, rankProgress } from "@/game/economy";
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
          Your flagship is a NEP-245 token with its own battle record, and it ranks up only by fighting. Skins are tokens too. Each rank unlocks a grander one: lanterns, a gold finish, St Elmo's fire on the masts, and for an Admiral all of it. They change how the ship looks and nothing about how it plays.
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

const rankIndex = (name: string): number => RANKS.findIndex(([r]) => r === name);
const shipClass = (rank: string): string => RANK_SHIPS.find(([r]) => r === rank)?.[2] ?? "";

function FleetView({ cfg, session }: { readonly cfg: AppConfig; readonly session: GameSession }) {
  const snap = useSession(session);
  const reducedMotion = useReducedMotion();
  const viewer = useMemo(() => makeViewer(cfg.rpcUrl, cfg.contractId), [cfg]);
  const store = useMemo(() => browserStorage(), []);
  const [svg, setSvg] = useState<string | null>(null);
  const [skins, setSkins] = useState<Skins | null>(null);
  const [equipped, setEquipped] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const captain = snap.captain;
  const flagship = captain?.player.flagship ?? null;

  useEffect(() => {
    if (!flagship) return;
    let alive = true;
    viewer.view<string | null>("ship_svg", { token_id: flagship, skin: equipped }).then((s) => alive && setSvg(s)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [viewer, flagship, captain?.ship?.xp, equipped]);

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
  const look = skinLook(preview ?? equipped ?? DEFAULT_SKIN);
  const previewSource = preview ? skinSource(preview) : null;
  const viewRank = preview && previewSource && previewSource !== "starter" && rankIndex(previewSource) > rankIndex(progress.rank) ? previewSource : progress.rank;
  return (
    <>
      <Panel className="sm:grid-cols-[minmax(0,1.1fr)_1fr] sm:items-center">
        <div className="relative aspect-[8/5] overflow-hidden rounded-xl border border-line bg-[radial-gradient(circle_at_50%_30%,#3d8fd0,#0e2a3b_75%)]">
          <Suspense fallback={null}>
            <FlagshipViewer rank={viewRank} look={look} reducedMotion={reducedMotion} />
          </Suspense>
          {preview && (
            <div className="absolute inset-x-2 top-2 flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-ink backdrop-blur-sm">
                Preview · {look.title}
                {previewSource && previewSource !== "starter" ? ` · reach ${previewSource} to own it` : ""}
              </span>
              <button type="button" onClick={() => setPreview(null)} className="rounded-full border border-line bg-black/55 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm hover:border-brass">
                Back to my ship
              </button>
            </div>
          )}
          {svg && (
            <figure className="absolute right-2 bottom-2 m-0 grid w-24 gap-0.5 sm:w-40 rounded-md border border-line bg-black/40 p-1 backdrop-blur-sm">
              <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={`On-chain image of ${flagship}`} className="block w-full rounded-sm" />
              <figcaption className="text-center text-[9px] text-muted">token image · {skinLook(equipped ?? DEFAULT_SKIN).title}</figcaption>
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
              <p className="m-0 font-display text-2xl font-bold">
                {progress.rank}
                <span className="ml-2 font-sans text-sm font-semibold text-muted">{shipClass(progress.rank)}</span>
              </p>
              <p className="m-0 text-xs text-muted tabular-nums">
                {ship?.xp ?? 0} XP{progress.next ? ` · next: ${progress.next}, a ${shipClass(progress.next).toLowerCase()}, at ${ship?.next_rank_xp}` : " · top rank"}
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
          <h2 className="m-0 font-display text-2xl font-bold">Skins</h2>
          <p className="m-0 text-xs text-muted">Every captain starts with three skins; each new rank mints a grander one on NEAR. Tap one you own to equip it, or a locked one to preview it on your flagship.</p>
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
              const glow = l.lights?.color ?? l.aura?.color ?? null;
              return (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => {
                      if (owned) {
                        equip(name);
                        setPreview(null);
                      } else setPreview(name);
                    }}
                    aria-pressed={on}
                    className={cn("grid w-full gap-2 rounded-xl border border-line bg-white/5 p-3 text-left transition-colors hover:border-brass", on && "border-brass bg-brass/10", preview === name && "border-ink/60")}
                  >
                    <div
                      className="relative grid aspect-[40/33] place-items-center overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_35%,#2f7fb8,#0e2a3b_78%)]"
                      style={glow ? { boxShadow: `inset 0 0 32px ${glow}66` } : undefined}
                    >
                      {skinSource(name) !== null ? (
                        <img src={`/ships/skin-${name}.png`} alt={`${l.title} skin`} loading="lazy" className={cn("size-full object-contain", !owned && "opacity-80 saturate-75")} />
                      ) : (
                        <SpriteShip vertical={false} length={3} sail={l.sprite} flag={l.pennant} className={cn("h-14 w-auto", !owned && "opacity-55 saturate-50")} />
                      )}
                      <span className="absolute top-1.5 left-1.5 flex gap-0.5" aria-hidden>
                        {[l.hull ?? "#c98a5a", l.sail, l.flag].map((c) => (
                          <span key={c} className="size-3 rounded-full border border-white/40" style={{ background: c }} />
                        ))}
                      </span>
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
                        <span className="font-normal text-muted">{owned ? "Tap to equip" : source && source !== "starter" ? `Reach ${source} · preview` : "Not owned"}</span>
                      )}
                    </span>
                    {l.perks && l.perks.length > 0 && (
                      <span className="flex flex-wrap gap-1">
                        {l.perks.map((p) => (
                          <span key={p} className="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-muted">
                            {p}
                          </span>
                        ))}
                      </span>
                    )}
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
