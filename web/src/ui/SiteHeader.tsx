import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MuteToggle } from "./MuteToggle";
import { Nav } from "./Nav";

interface SiteHeaderProps {
  readonly tools?: ReactNode;
  readonly overlay?: boolean;
}

export function SiteHeader({ tools = null, overlay = false }: SiteHeaderProps) {
  return (
    <header
      className={cn(
        "z-20 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-[max(16px,env(safe-area-inset-left))] pt-[calc(10px+env(safe-area-inset-top))] pb-2.5 md:grid-cols-[auto_1fr_auto_auto] lg:grid-cols-[1fr_auto_1fr]",
        overlay ? "pointer-events-none fixed inset-x-0 top-0" : "relative",
      )}
    >
      <a href="/" className="pointer-events-auto col-start-1 row-start-1 justify-self-start font-display text-[22px] leading-none font-bold tracking-[0.01em] [text-shadow:0_2px_12px_rgb(0_0_0/0.35)]">
        Brinewar
      </a>
      <Nav compact className="pointer-events-auto col-span-2 row-start-2 justify-self-center md:col-span-1 md:col-start-2 md:row-start-1" />
      <div className="contents lg:col-start-3 lg:row-start-1 lg:flex lg:items-center lg:justify-end lg:gap-2">
        {tools && (
          <div className="pointer-events-auto col-span-2 row-start-3 flex flex-wrap items-center justify-center gap-2 md:col-span-1 md:col-start-3 md:row-start-1 md:justify-end">{tools}</div>
        )}
        <div className="pointer-events-auto col-start-2 row-start-1 justify-self-end md:col-start-4">
          <MuteToggle />
        </div>
      </div>
    </header>
  );
}
