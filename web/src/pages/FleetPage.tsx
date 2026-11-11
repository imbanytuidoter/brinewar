import { Check, Loader2, Pencil, Snowflake } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { rankProgress } from "@/game/economy";
import type { GameSession } from "@/game/session";
import { useBoot, useReducedMotion, useSession } from "@/game/useGame";
import { makeViewer } from "@/lib/chain";
import type { AppConfig } from "@/lib/config";
import { equippedSkin, equipSkin, ownedSkins, skinLook } from "@/lib/skins";
import { browserStorage } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { PageShell, Panel, Stat } from "@/ui/PageShell";

const NICKNAME = /^[A-Za-z0-9_-]{3,16}$/;
const FlagshipViewer = lazy(() => import("@/scene/FlagshipViewer"));

export function FleetPage({ cfg }: { readonly cfg: AppConfig }) {
  const { boot, retry } = useBoot(cfg);
  return (
    <PageShell
      kicker="Your fleet"
      title="A flagship that grows in battle"
      lede={
        <p className="m-0">
          Your flagship is a NEP-245 token with its own record. Rank and abilities are earned only in battle and never sold. Skins are cosmetic tokens: they change how your sails
          look and nothing else.
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
      setSkins({ all, owned });
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
  return (
    <>
      <Panel className="sm:grid-cols-[minmax(0,1.1fr)_1fr] sm:items-center">
        <div className="relative aspect-[8/5] overflow-hidden rounded-xl border border-line bg-[radial-gradient(circle_at_50%_30%,#3d8fd0,#0e2a3b_75%)]">
          <Suspense fallback={null}>
            <FlagshipViewer rank={progress.rank} look={equipped ? skinLook(equipped) : null} reducedMotion={reducedMotion} />
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
          <h2 className="m-0 font-display text-2xl font-bold">Skins</h2>
          <p className="m-0 text-xs text-muted">Equipped skins colour your sails in battle. Stored in this browser; ownership is read from the chain.</p>
        </div>
        {!skins ? (
          <Loader2 className="size-4 animate-spin text-muted" aria-label="Loading skins" />
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
            {skins.all.map((name) => {
              const look = skinLook(name);
              const owned = skins.owned.includes(name);
              const on = equipped === name;
              return (
                <li key={name}>
                  <button
                    type="button"
                    disabled={!owned}
                    onClick={() => equip(on ? null : name)}
                    aria-pressed={on}
                    className={cn("grid w-full gap-2 rounded-xl border border-line bg-white/5 p-3 text-left transition-colors hover:border-brass disabled:cursor-not-allowed disabled:opacity-45", on && "border-brass bg-brass/10")}
                  >
                    <svg viewBox="0 0 80 48" className="w-full" aria-hidden>
                      <rect width="80" height="48" rx="6" fill="#123a4d" />
                      <path d="M40 6 V36 M40 8 L60 30 H40 Z" fill={look.sail} stroke="#3a2a1d" strokeWidth="1.5" />
                      <path d="M40 8 L22 30 H40 Z" fill={look.sail} opacity="0.85" />
                      <path d="M40 6 l10 3 l-10 3 Z" fill={look.flag} />
                      <path d="M14 34 H66 L58 42 H22 Z" fill="#6b4a2d" />
                    </svg>
                    <span className="flex items-center justify-between text-xs font-semibold">
                      {look.title}
                      {on ? <Check className="size-3.5 text-brass" aria-label="equipped" /> : <span className="font-normal text-muted">{owned ? "owned" : "not owned"}</span>}
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
