import { Anchor, BookOpen, Coins, Gavel, Map as MapIcon, Ship, Swords, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { openBattle } from "@/game/resume";
import { browserStorage } from "@/lib/storage";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Play", icon: Anchor },
  { href: "/admiralty", label: "Admiralty", icon: MapIcon },
  { href: "/fleet", label: "Fleet", icon: Ship },
  { href: "/captains", label: "Captains", icon: Trophy },
  { href: "/treasury", label: "Treasury", icon: Coins },
  { href: "/docs", label: "Docs", icon: BookOpen },
  { href: "/judges", label: "For judges", icon: Gavel },
] as const;

const warmBattle = (): void => {
  void import("@/scene/SeaScene").catch(() => undefined);
};

export function BattleReturn() {
  const here = window.location.pathname.replace(/\/+$/, "") || "/";
  const [id] = useState(() => (here === "/" ? null : openBattle(browserStorage())));
  useEffect(() => {
    if (id === null) return;
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 600));
    idle(warmBattle);
  }, [id]);
  if (id === null) return null;
  return (
    <a
      href="/"
      onPointerEnter={warmBattle}
      className="inline-flex animate-rise items-center gap-1.5 rounded-full bg-gradient-to-b from-[#ffd56e] to-brass-deep px-3 py-1.5 text-xs font-bold whitespace-nowrap text-[#241a05] shadow-[0_6px_20px_rgb(242_182_50/0.35)] transition-transform hover:-translate-y-px"
    >
      <Swords className="size-3.5" aria-hidden />
      Back to battle #{id}
    </a>
  );
}

export function Nav({ className, compact = false }: { readonly className?: string; readonly compact?: boolean }) {
  const here = window.location.pathname.replace(/\/+$/, "") || "/";
  return (
    <nav aria-label="Main" className={cn("flex items-center gap-1 rounded-full border border-line bg-glass p-1 backdrop-blur-md", className)}>
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = here === href;
        return (
          <a
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink", active && "bg-white/10 text-ink")}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className={compact ? "sr-only xl:not-sr-only" : "max-sm:sr-only"}>{label}</span>
          </a>
        );
      })}
      <BattleReturn />
    </nav>
  );
}
