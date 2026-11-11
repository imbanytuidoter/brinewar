import { Anchor, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useBoot } from "@/game/useGame";
import { readConfig, type AppConfig } from "@/lib/config";
import { PlayPage } from "@/pages/PlayPage";
import { AdmiraltyPage } from "@/pages/AdmiraltyPage";
import { FleetPage } from "@/pages/FleetPage";
import { JudgesPage } from "@/pages/JudgesPage";
import { TreasuryPage } from "@/pages/TreasuryPage";
import { VerifyPage } from "@/pages/VerifyPage";

export function App() {
  const cfg = useMemo((): AppConfig | Error => {
    try {
      return readConfig(import.meta.env as Record<string, string | undefined>);
    } catch (err) {
      return err instanceof Error ? err : new Error("bad configuration");
    }
  }, []);
  if (cfg instanceof Error) return <Shell title="Harbour closed" text={`Configuration error: ${cfg.message}`} />;
  const verify = /^\/verify\/(\d{1,15})\/?$/.exec(window.location.pathname);
  if (verify) return <VerifyPage cfg={cfg} gameId={Number(verify[1])} />;
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/admiralty") return <AdmiraltyPage cfg={cfg} />;
  if (path === "/treasury") return <TreasuryPage cfg={cfg} />;
  if (path === "/fleet") return <FleetPage cfg={cfg} />;
  if (path === "/judges") return <JudgesPage cfg={cfg} />;
  return <Play cfg={cfg} />;
}

function Play({ cfg }: { readonly cfg: AppConfig }) {
  const { boot, retry } = useBoot(cfg);
  if (boot.kind === "ready") return <PlayPage cfg={cfg} session={boot.session} />;
  if (boot.kind === "error")
    return (
      <Shell title="Could not board" text={boot.message}>
        {boot.retryable && (
          <Button variant="brass" onClick={retry}>
            <Anchor aria-hidden />
            Try again
          </Button>
        )}
      </Shell>
    );
  return (
    <Shell title="Brinewar" text="Signing you on as a captain. No wallet, no popups.">
      <Loader2 className="size-5 animate-spin text-brass" aria-label="Loading" />
    </Shell>
  );
}

function Shell({ title, text, children }: { readonly title: string; readonly text: string; readonly children?: React.ReactNode }) {
  return (
    <main className="grid h-full place-items-center bg-[radial-gradient(120%_80%_at_50%_0%,#2a8db6,#0b2230_70%)] px-4 text-center">
      <div className="grid justify-items-center gap-3">
        <h1 className="m-0 font-display text-5xl font-bold">{title}</h1>
        <p className="m-0 max-w-sm text-muted">{text}</p>
        {children}
      </div>
    </main>
  );
}
