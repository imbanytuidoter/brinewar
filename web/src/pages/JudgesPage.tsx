import { Clapperboard, Anchor, BadgeCheck, Coins, ExternalLink, Map as MapIcon, ShieldCheck, Swords } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { findShowcases } from "@/game/replay";
import { makeViewer } from "@/lib/chain";
import { accountLink, networkOf, type AppConfig } from "@/lib/config";
import type { ConfigView } from "@/lib/contract";
import { cn } from "@/lib/utils";
import { PageShell, Panel } from "@/ui/PageShell";

interface Chapter {
  readonly at: number;
  readonly title: string;
  readonly line: string;
}

const VIDEO = "/demo/brinewar.mp4";
const CHAPTERS = "/demo/chapters.json";

const STACK = ["near-sdk 5.30.1", "near-api-js 7.4.0", "NEP-245", "NEP-297", "NEAR AI Cloud · TEE", "ed25519_verify", "React Three Fiber 9"];

const DOORS = [
  { href: "/replay", icon: Clapperboard, title: "Watch a finished battle", line: "A finished battle the Nauarch won by sinking a whole fleet, replayed from the chain in about a minute, with his signed lines and his fleet rising at the end." },
  { href: "/", icon: Anchor, title: "Play the Nauarch", line: "Open it in a fresh browser. No wallet, no seed phrase, no popup: a guest account and 100 gold appear in a few seconds." },
  { href: "/", icon: Swords, title: "Duel a friend", line: "Press Take command, then Duel a friend instead, then Create the duel link, and send it. They play from their own browser, no wallet either, with the same proofs on every answer." },
  { href: "/admiralty", icon: MapIcon, title: "Admiralty map", line: "Where captains hide ships, built only from boards the contract verified. The Nauarch hunts the hot cells first." },
  { href: "/treasury", icon: Coins, title: "Treasury", line: "Bounties shrink and entry fees rise as he grows poor. Fast-forward 50 battles with the contract's own formulas." },
] as const;

const PROOFS = [
  ["Hidden boards", "Each board is a Merkle root of 100 salted cells, committed before the first shot. Every answer carries a proof that the contract checks; at the end both fleets are revealed and checked for shape."],
  ["The Nauarch's moves", "The contract builds the model request from public game state. NEAR AI Cloud answers inside a TEE and signs model:sha256(request):sha256(response); the contract verifies that ed25519 signature before it accepts the shot and the line. If the model is late or wrong, the contract plays a deterministic shot, labelled as such."],
  ["Why a language model", "His aim comes from statistics: the contract lists the sensible cells (finish a wounded ship, then the hottest cells of the Admiralty map) and the model picks among them. The model adds what statistics cannot: a voice that reads your record and taunts you about it, and a choice among equally good cells that you cannot predict from the code. Because the request, the reply and the signature are all checked on chain, this is an AI opponent a skill-game operator could put in front of players who do not trust the house."],
  ["The economy", "Entry fees and bounties come from a formula in the contract, driven only by the treasury balance. Nobody tunes it by hand."],
  ["The map", "Only boards that pass the final check count: one per captain per day, from battles against the Nauarch that end with a fleet sunk, where the captain answered at least ten shots."],
] as const;

const LIMITS = [
  "An illegal fleet is caught only at the final reveal: the cheat loses the battle and the stake, but plays until then. ZK at commit time is future work.",
  "Our server keeps the Nauarch's board and salts. It cannot change them after the commit, but it can see them. Moving that into a TEE is future work.",
  "The admin pins the model key after checking its attestation; the contract does not verify a TDX quote itself.",
  "The game contract funds guest accounts and their gas; a sponsor account signs the sign-ups.",
  "The Admiralty map was seeded with scripted battles by Seed_NN captains so it was not empty on day one, and most of its boards so far come from them; the live count is shown on the landing and the Admiralty page.",
  "The replay shows only battles the Nauarch won by sinking the whole fleet, because it rebuilds the captain's fleet from his hits.",
] as const;

function fmt(t: number): string {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

function useChapters(): readonly Chapter[] | null {
  const [chapters, setChapters] = useState<readonly Chapter[] | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([fetch(VIDEO, { method: "HEAD" }), fetch(CHAPTERS)])
      .then(async ([video, ch]) => {
        if (!video.ok || !ch.ok || !(video.headers.get("content-type") ?? "").startsWith("video/")) return;
        const raw = (await ch.json()) as unknown;
        if (!Array.isArray(raw)) return;
        const list = raw.filter((c): c is Chapter => typeof c?.at === "number" && typeof c?.title === "string" && typeof c?.line === "string");
        if (alive && list.length) setChapters(list);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return chapters;
}

function DemoVideo({ chapters }: { readonly chapters: readonly Chapter[] }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(0);
  const active = chapters.reduce((k, c, i) => (now >= c.at ? i : k), 0);
  return (
    <Panel className="lg:grid-cols-[1.6fr_1fr]">
      <div className="grid gap-2">
        <video ref={ref} src={VIDEO} controls preload="metadata" playsInline className="w-full rounded-xl border border-line bg-black" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
        <a href={VIDEO} download className="justify-self-start text-xs text-brass underline-offset-2 hover:underline">
          Download the mp4
        </a>
      </div>
      <div className="grid content-start gap-2">
        <p className="m-0 flex justify-between text-xs font-semibold tracking-[0.12em] text-muted uppercase">
          <span>Chapters</span>
          <span>{chapters.length}</span>
        </p>
        <ol className="m-0 grid list-none gap-1 p-0">
          {chapters.map((c, i) => (
            <li key={c.at}>
              <button
                type="button"
                onClick={() => {
                  const v = ref.current;
                  if (!v) return;
                  v.currentTime = c.at;
                  void v.play();
                }}
                className={cn("grid w-full grid-cols-[3rem_1fr] gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5", i === active && "bg-white/10")}
              >
                <span className="font-mono text-xs text-brass">{fmt(c.at)}</span>
                <span>
                  <span className="block text-sm font-semibold">{c.title}</span>
                  <span className="block text-xs text-muted">{c.line}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

function useProvenBattle(cfg: AppConfig): number | null {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const viewer = makeViewer(cfg.rpcUrl, cfg.contractId);
    viewer
      .view<ConfigView>("config")
      .then((c) => findShowcases(viewer, c.games, 1))
      .then((found) => {
        if (alive && found[0]) setId(found[0].id);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cfg]);
  return id;
}

function ProvenBattle({ id }: { readonly id: number }) {
  return (
    <a href={`/verify/${id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ok/50 bg-ok/10 p-4 transition-colors hover:border-ok">
      <span className="grid gap-1">
        <span className="inline-flex items-center gap-2 font-display text-xl font-bold">
          <ShieldCheck className="size-5 text-ok" aria-hidden />
          Battle #{id}, proven in your browser
        </span>
        <span className="text-sm text-muted">Your browser re-checks every answer the Nauarch gave against the board he sealed before the first shot, and every model move against the TEE key in the contract. Takes a few seconds.</span>
      </span>
      <span className="text-sm font-semibold text-ok">Open the proof →</span>
    </a>
  );
}

export function JudgesPage({ cfg }: { readonly cfg: AppConfig }) {
  const proven = useProvenBattle(cfg);
  const chapters = useChapters();
  const contractHref = accountLink(cfg, cfg.contractId);
  return (
    <PageShell
      title="Brinewar for judges"
      lede={
        <div className="grid gap-3">
          <p className="m-0 inline-flex items-center gap-2 justify-self-start rounded-full border border-ok/40 bg-ok/10 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-ok uppercase">
            <span className="size-2 rounded-full bg-ok" aria-hidden />
            Live on {networkOf(cfg.contractId)}
          </p>
          <p className="m-0 font-semibold text-ink">Built for skill-game operators whose players say "the bot cheats": here the house bot proves every move.</p>
          <p className="m-0">
            A naval battle you play from a fresh browser without a wallet. Each shot is a NEAR transaction and each answer carries a Merkle proof. Your opponent, the Nauarch,
            is an AI admiral: every move his model makes is signed inside a TEE on NEAR AI and checked by the contract before it counts.
          </p>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {STACK.map((s) => (
              <li key={s} className="rounded-md border border-line bg-white/5 px-2 py-0.5 font-mono text-[11px] tracking-wide text-ink uppercase">
                {s}
              </li>
            ))}
          </ul>
        </div>
      }
    >
      {chapters && <DemoVideo chapters={chapters} />}

      {proven !== null && <ProvenBattle id={proven} />}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DOORS.map(({ href, icon: Icon, title, line }, i) => (
          <a key={title} href={href} className={cn("grid gap-2 rounded-2xl border border-line bg-glass p-4 backdrop-blur-md transition-colors hover:border-brass", i === 0 && "border-brass/60 bg-brass/10 sm:col-span-2")}>
            <Icon className="size-5 text-brass" aria-hidden />
            <span className="font-display text-xl font-bold">{title}</span>
            <span className="text-sm text-muted">{line}</span>
          </a>
        ))}
      </section>

      <Panel>
        <h2 className="m-0 inline-flex items-center gap-2 font-display text-2xl font-bold">
          <ShieldCheck className="size-5 text-ok" aria-hidden />
          What is proven, and where
        </h2>
        <dl className="m-0 grid gap-3 sm:grid-cols-2">
          {PROOFS.map(([t, d]) => (
            <div key={t} className="grid gap-1">
              <dt className="text-sm font-semibold">{t}</dt>
              <dd className="m-0 text-sm text-muted">{d}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0 inline-flex flex-wrap items-center gap-2 text-sm">
          <BadgeCheck className="size-4 text-ok" aria-hidden />
          After any battle, press Verify: your browser re-checks every answer the Nauarch gave, his reveal and every model signature against the contract, without trusting our server.
        </p>
        <p className="m-0 text-sm">
          Contract{" "}
          {contractHref ? (
            <a href={contractHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-brass hover:underline">
              {cfg.contractId}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            <span className="font-mono">{cfg.contractId}</span>
          )}
          {cfg.repoUrl && (
            <>
              {" · "}
              <a href={cfg.repoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brass hover:underline">
                Source code
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </>
          )}
        </p>
      </Panel>

      <Panel>
        <h2 className="m-0 font-display text-2xl font-bold">Honest limits</h2>
        <ul className="m-0 grid list-disc gap-2 pl-5 text-sm text-muted">
          {LIMITS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Panel>
    </PageShell>
  );
}
