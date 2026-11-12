import { Anchor, Swords, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HarbourStats } from "@/game/useHarbour";
import type { Encounter } from "./WorldMap";

interface EncounterCardProps {
  readonly encounter: Encounter;
  readonly stats: HarbourStats;
  readonly busy: boolean;
  readonly onBattle: (mode: BattleMode) => void;
  readonly onClose: () => void;
}

export type BattleMode = "nauarch" | "friend";

interface Act {
  readonly label: string;
  readonly href?: string;
  readonly battle?: BattleMode;
}

interface Copy {
  readonly title: string;
  readonly body: string;
  readonly note?: string;
  readonly primary: Act;
  readonly secondary?: Act;
}

function copyFor(e: Encounter, s: HarbourStats): Copy {
  const boards = s.admiralty?.boards_counted ?? 0;
  if (e.kind === "patrol")
    return {
      title: "A Nauarch patrol",
      body: `One of his frigates crosses your bow. He has studied ${boards.toLocaleString("en-US")} boards and fires first where captains hide.`,
      note: s.treasury ? `Entry ${s.treasury.entry} gold · sink his fleet for ${s.treasury.bounty}` : undefined,
      primary: { label: "Engage", battle: "nauarch" },
    };
  if (e.kind === "captain") {
    const c = e.captain;
    return {
      title: `#${e.rank} ${c.name}`,
      body: `${c.rank} · ${c.class}. ${c.wins} won and ${c.losses} lost against the Nauarch, ${c.sunk} of his ships sunk, ${c.xp.toLocaleString("en-US")} XP. Read from the contract.`,
      note: "Captains do not wait at sea: invite someone you know with a duel link.",
      primary: { label: "Invite a friend", battle: "friend" },
      secondary: { label: "Captains' board", href: "/captains" },
    };
  }
  switch (e.place.kind) {
    case "port":
      return { title: e.place.name, body: "Shipwright and sailmaker: your flagship, its rank, and the skins you own on NEAR.", primary: { label: "Battle the Nauarch", battle: "nauarch" }, secondary: { label: "Fleet and skins", href: "/fleet" } };
    case "admiralty":
      return { title: e.place.name, body: "The chart of where captains hide their ships, built only from boards the contract verified. The Nauarch hunts from it.", primary: { label: "Open the Admiralty map", href: "/admiralty" } };
    case "treasury":
      return { title: e.place.name, body: `His treasury${s.treasury ? ` holds ${Number(s.treasury.balance).toLocaleString("en-US")} gold` : ""}. Bounties shrink and entry fees rise as he grows poor.`, primary: { label: "Open the treasury", href: "/treasury" } };
    case "tavern":
      return { title: e.place.name, body: "Every captain ranked by flagship XP, and the Nauarch's record against all of them.", primary: { label: "Open the captains' board", href: "/captains" } };
    case "wreck":
      return { title: e.place.name, body: "A battle the Nauarch won, replayed from the chain with his signed lines and his fleet rising at the end.", primary: { label: "Watch the last battle", href: "/replay" } };
  }
}

function Action({ a, busy, onBattle, primary }: { readonly a: Act; readonly busy: boolean; readonly onBattle: (mode: BattleMode) => void; readonly primary: boolean }) {
  if (a.href)
    return (
      <Button asChild variant={primary ? "brass" : "glass"} size="sm">
        <a href={a.href}>{a.label}</a>
      </Button>
    );
  return (
    <Button variant={primary ? "brass" : "glass"} size="sm" onClick={() => onBattle(a.battle ?? "nauarch")} disabled={busy}>
      {primary ? <Swords aria-hidden /> : <Anchor aria-hidden />}
      {a.label}
    </Button>
  );
}

export function EncounterCard({ encounter, stats, busy, onBattle, onClose }: EncounterCardProps) {
  const c = copyFor(encounter, stats);
  const enemy = encounter.kind === "patrol";
  return (
    <section aria-label={c.title} className="grid w-[min(380px,calc(100vw-32px))] animate-rise gap-2 rounded-2xl border border-line bg-glass p-3.5 backdrop-blur-md">
      <div className="flex items-start justify-between gap-2">
        <p className={`m-0 font-display text-xl leading-tight font-bold ${enemy ? "text-hit" : ""}`}>{c.title}</p>
        <button type="button" onClick={onClose} aria-label="Sail on" className="text-muted hover:text-ink">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <p className="m-0 text-[13px] text-muted">{c.body}</p>
      {c.note && <p className="m-0 text-xs font-semibold text-brass">{c.note}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Action a={c.primary} busy={busy} onBattle={onBattle} primary />
        {c.secondary && <Action a={c.secondary} busy={busy} onBattle={onBattle} primary={false} />}
      </div>
    </section>
  );
}
