import type { ReactNode } from "react";
import { Nav } from "./Nav";

interface PageShellProps {
  readonly title: string;
  readonly lede: ReactNode;
  readonly children: ReactNode;
}

export function PageShell({ title, lede, children }: PageShellProps) {
  return (
    <main className="min-h-full bg-[radial-gradient(120%_80%_at_50%_0%,#174b61,#0b2230_60%)] px-4 pt-[calc(16px+env(safe-area-inset-top))] pb-16">
      <div className="mx-auto grid max-w-5xl gap-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <a href="/" className="font-display text-[22px] leading-none font-bold">
            Brinewar
          </a>
          <Nav />
        </header>
        <section className="grid gap-3 pt-4">
          <h1 className="m-0 font-display text-[clamp(36px,6vw,64px)] leading-[0.95] font-bold tracking-[0.01em] uppercase">{title}</h1>
          <div className="max-w-[62ch] text-base leading-relaxed text-muted">{lede}</div>
        </section>
        {children}
      </div>
    </main>
  );
}

export function Panel({ children, className = "" }: { readonly children: ReactNode; readonly className?: string }) {
  return <section className={`grid gap-4 rounded-2xl border border-line bg-glass p-4 backdrop-blur-md sm:p-5 ${className}`}>{children}</section>;
}

export function Stat({ label, value, sub }: { readonly label: string; readonly value: ReactNode; readonly sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-glass p-4 backdrop-blur-md">
      <p className="m-0 text-xs tracking-[0.12em] text-muted uppercase">{label}</p>
      <p className="m-0 font-display text-3xl font-bold tabular-nums">{value}</p>
      {sub && <p className="m-0 text-xs text-muted">{sub}</p>}
    </div>
  );
}
