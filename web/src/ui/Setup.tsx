import { Anchor, ArrowLeft, Check, Flame, Palette, Ship, Shuffle, Swords } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { TreasuryView } from "@/lib/contract";
import { fleetHeat, type Risk } from "@/lib/heat";
import { skinLook, skinSource } from "@/lib/skins";
import { cn } from "@/lib/utils";
import { PlacementGrid } from "./PlacementGrid";

const NICKNAME = /^[A-Za-z0-9_-]{3,16}$/;
const DEFAULT_SKIN = "brine";

const RISK_TEXT: Readonly<Record<Risk, string>> = {
  low: "Cool water: he rarely looks here first.",
  medium: "Ordinary water: he will reach it in time.",
  high: "Hot water: this is where he hunts first.",
};

interface SetupProps {
  readonly cells: readonly number[];
  readonly onCells: (cells: number[]) => void;
  readonly onShuffle: () => void;
  readonly heat: readonly number[] | null;
  readonly treasury: TreasuryView | null;
  readonly gold: bigint | null;
  readonly name: string | null;
  readonly onRename: (name: string) => Promise<boolean>;
  readonly skins: readonly string[];
  readonly allSkins: readonly string[];
  readonly skin: string | null;
  readonly skinsFailed: boolean;
  readonly onSkin: (name: string) => void;
  readonly busy: boolean;
  readonly onSail: () => void;
  readonly onDuel: () => void;
  readonly onBack?: () => void;
}

type Tab = "fleet" | "colours";

export function Setup(p: SetupProps) {
  const [tab, setTab] = useState<Tab>("fleet");
  const [showHeat, setShowHeat] = useState(false);
  const look = skinLook(p.skin ?? DEFAULT_SKIN);
  const risk = p.heat ? fleetHeat(p.cells, p.heat) : null;
  const entry = p.treasury && /^\d+$/.test(p.treasury.entry) ? BigInt(p.treasury.entry) : null;
  const short = entry !== null && p.gold !== null && p.gold < entry;
  return (
    <section aria-label="Prepare for battle" className="grid max-h-[calc(100dvh-140px)] w-full animate-rise gap-3 overflow-y-auto rounded-2xl border border-line bg-glass p-3 backdrop-blur-md sm:w-[360px]">
      {p.onBack && (
        <button type="button" onClick={p.onBack} className="inline-flex items-center gap-1 justify-self-start text-xs font-semibold text-muted hover:text-ink">
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to the chart
        </button>
      )}
      <div role="tablist" aria-label="Preparation" className="grid grid-cols-2 gap-1 rounded-xl bg-black/25 p-1">
        <TabButton active={tab === "fleet"} onClick={() => setTab("fleet")} icon={<Ship aria-hidden />} label="Fleet" />
        <TabButton active={tab === "colours"} onClick={() => setTab("colours")} icon={<Palette aria-hidden />} label="Captain" />
      </div>

      {tab === "fleet" ? (
        <div role="tabpanel" aria-label="Fleet" className="grid gap-2">
          <PlacementGrid cells={p.cells} heat={showHeat ? p.heat : null} sprite={look.sprite} pennant={look.pennant} disabled={p.busy} onChange={p.onCells} />
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={p.onShuffle} disabled={p.busy} aria-label="Shuffle your fleet">
              <Shuffle aria-hidden />
              Shuffle
            </Button>
            <Button size="sm" onClick={() => setShowHeat((v) => !v)} disabled={!p.heat} aria-pressed={showHeat} aria-label="Show where he hunts" className={cn(showHeat && "border-hit")}>
              <Flame aria-hidden className={cn(showHeat && "text-hit")} />
              Heat map
            </Button>
          </div>
          {risk && (
            <p className="m-0 text-[12px]">
              <span className={cn("font-semibold", risk.risk === "high" ? "text-hit" : risk.risk === "low" ? "text-ok" : "text-brass")}>{risk.risk === "high" ? "High risk" : risk.risk === "low" ? "Low risk" : "Medium risk"}</span>
              <span className="text-muted"> · {RISK_TEXT[risk.risk]}</span>
            </p>
          )}
        </div>
      ) : (
        <div role="tabpanel" aria-label="Captain" className="grid gap-3">
          <NameForm current={p.name} busy={p.busy} onRename={p.onRename} />
          <div className="grid gap-1.5">
            <span className="text-xs text-muted">Sails and flag (your skins on NEAR)</span>
            <div className="flex flex-wrap gap-1.5">
              {p.skins.length === 0 && <span className="text-xs text-muted">{p.skinsFailed ? "Could not read your skins from the chain." : "Reading your skins from the chain…"}</span>}
              {[...p.skins, ...p.allSkins.filter((s) => !p.skins.includes(s) && skinSource(s) !== null)].map((s) => {
                const look = skinLook(s);
                const on = s === p.skin;
                const owned = p.skins.includes(s);
                const source = skinSource(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => p.onSkin(s)}
                    disabled={!owned}
                    aria-pressed={on}
                    title={owned ? look.title : source === "starter" ? "Starter skin, reload to receive it" : `Unlocks at the rank of ${source ?? "a higher rank"}`}
                    className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45", on ? "border-brass bg-brass/15" : "border-line hover:border-brass")}
                  >
                    <span className="size-3 rounded-full border border-white/30" style={{ background: `linear-gradient(135deg, ${look.sail} 55%, ${look.flag} 55%)` }} aria-hidden />
                    {look.title}
                    {!owned && source && <span className="text-[10px] text-muted">· {source}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 -mx-3 -mb-3 grid gap-2 border-t border-line bg-[#0c2431]/95 p-3 backdrop-blur-md">
        <span className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">Choose your opponent</span>
        <div className="grid grid-cols-2 gap-2">
          <Opponent
            title="The Nauarch"
            text="AI admiral on NEAR AI Cloud. Every move signed."
            stakes={p.treasury ? `Entry ${p.treasury.entry} · win ${p.treasury.bounty} gold` : "Entry and bounty from his treasury"}
            foot={short ? "Not enough gold for the entry. Duels are free." : p.gold !== null ? `You hold ${p.gold.toString()} gold` : null}
            warn={short}
          >
            <Button variant="brass" size="sm" onClick={p.onSail} disabled={p.busy || short} aria-label="Set sail against the Nauarch" className="w-full">
              <Anchor aria-hidden />
              Set sail
            </Button>
          </Opponent>
          <Opponent title="A friend" text="Send a link. They play from any browser, no wallet." stakes="Free · no stakes" foot={null} warn={false}>
            <Button size="sm" onClick={p.onDuel} disabled={p.busy} aria-label="Challenge a friend" className="w-full">
              <Swords aria-hidden />
              <span className="max-sm:hidden">Challenge a friend</span>
              <span className="sm:hidden">Invite</span>
            </Button>
          </Opponent>
        </div>
      </div>
    </section>
  );
}

function TabButton({ active, onClick, icon, label }: { readonly active: boolean; readonly onClick: () => void; readonly icon: React.ReactNode; readonly label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn("inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors [&_svg]:size-3.5", active ? "bg-white/12 text-ink" : "text-muted hover:text-ink")}
    >
      {icon}
      {label}
    </button>
  );
}

interface OpponentProps {
  readonly title: string;
  readonly text: string;
  readonly stakes: string;
  readonly foot: string | null;
  readonly warn: boolean;
  readonly children: React.ReactNode;
}

function Opponent({ title, text, stakes, foot, warn, children }: OpponentProps) {
  return (
    <div className="grid content-between gap-2 rounded-xl border border-line bg-black/20 p-2.5">
      <div className="grid gap-1">
        <span className="font-display text-[17px] leading-tight font-bold max-sm:text-[15px]">{title}</span>
        <span className="text-[11px] leading-snug text-muted max-sm:hidden">{text}</span>
        <span className="text-[11px] font-semibold text-brass">{stakes}</span>
        {foot && <span className={cn("text-[10px]", warn ? "text-hit" : "text-muted max-sm:hidden")}>{foot}</span>}
      </div>
      {children}
    </div>
  );
}

function NameForm({ current, busy, onRename }: { readonly current: string | null; readonly busy: boolean; readonly onRename: (name: string) => Promise<boolean> }) {
  const id = useId();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const valid = NICKNAME.test(value);
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (!valid || busy) return;
    void onRename(value).then((ok) => {
      setSaved(ok);
      if (ok) setValue("");
    });
  };
  return (
    <form onSubmit={submit} className="grid gap-1.5">
      <label htmlFor={id} className="text-xs text-muted">
        Captain's name {current && <span className="text-ink">· now {current}</span>}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          maxLength={16}
          placeholder="3 to 16 letters, digits, _ or -"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-black/25 px-2.5 text-[13px] outline-none placeholder:text-muted/60 focus:border-brass"
        />
        <Button size="sm" type="submit" disabled={!valid || busy} className="h-9">
          {saved ? <Check aria-hidden /> : null}
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
    </form>
  );
}
