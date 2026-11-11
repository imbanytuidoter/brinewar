import { Anchor, Coins, Gavel, Map as MapIcon, Ship } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Play", icon: Anchor },
  { href: "/admiralty", label: "Admiralty", icon: MapIcon },
  { href: "/fleet", label: "Fleet", icon: Ship },
  { href: "/treasury", label: "Treasury", icon: Coins },
  { href: "/judges", label: "For judges", icon: Gavel },
] as const;

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
    </nav>
  );
}
