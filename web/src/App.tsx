import { Anchor, Loader2 } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useBoot } from "@/game/useGame";
import { useHarbourStats } from "@/game/useHarbour";
import { duelFromLocation } from "@/ui/DuelCards";
import { Landing } from "@/ui/Landing";
import { Shipwreck } from "@/ui/Shipwreck";
import "@/lib/musicBox";
import { captureLinks, currentRoute, pageKey, subscribeRoute } from "@/lib/router";
import { sound } from "@/lib/sound";
import { readConfig, type AppConfig } from "@/lib/config";
import { PlayPage } from "@/pages/PlayPage";

const AdmiraltyPage = lazy(() => import("@/pages/AdmiraltyPage").then((m) => ({ default: m.AdmiraltyPage })));
const FleetPage = lazy(() => import("@/pages/FleetPage").then((m) => ({ default: m.FleetPage })));
const CaptainsPage = lazy(() => import("@/pages/CaptainsPage").then((m) => ({ default: m.CaptainsPage })));
const DocsPage = lazy(() => import("@/pages/docs/DocsPage").then((m) => ({ default: m.DocsPage })));
const JudgesPage = lazy(() => import("@/pages/JudgesPage").then((m) => ({ default: m.JudgesPage })));
const ReplayPage = lazy(() => import("@/pages/ReplayPage").then((m) => ({ default: m.ReplayPage })));
const TreasuryPage = lazy(() => import("@/pages/TreasuryPage").then((m) => ({ default: m.TreasuryPage })));
const VerifyPage = lazy(() => import("@/pages/VerifyPage").then((m) => ({ default: m.VerifyPage })));

export function App() {
  const route = useSyncExternalStore(subscribeRoute, currentRoute, currentRoute);
  useEffect(() => captureLinks(), []);
  return (
    <Shipwreck
      key={pageKey(route)}
      fallback={(reload) => (
        <Shell title="Lost at sea" text="This page hit a reef. Your battle is kept on chain, so a reload brings you back to it.">
          <Button variant="brass" onClick={reload}>
            <Anchor aria-hidden />
            Reload
          </Button>
        </Shell>
      )}
    >
      <Suspense fallback={<Shell title="Brinewar" text="Raising the charts…" />}>
        <Routes />
      </Suspense>
    </Shipwreck>
  );
}

function loadConfig(): AppConfig | Error {
  try {
    return readConfig(import.meta.env as Record<string, string | undefined>);
  } catch (err) {
    return err instanceof Error ? err : new Error("bad configuration");
  }
}

const CONFIG = loadConfig();

function Routes() {
  const cfg = CONFIG;
  if (cfg instanceof Error) return <Shell title="Harbour closed" text={`Configuration error: ${cfg.message}`} />;
  const verify = /^\/verify\/(\d{1,15})\/?$/.exec(window.location.pathname);
  if (verify) return <VerifyPage cfg={cfg} gameId={Number(verify[1])} />;
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/admiralty") return <AdmiraltyPage cfg={cfg} />;
  if (path === "/treasury") return <TreasuryPage cfg={cfg} />;
  if (path === "/fleet") return <FleetPage cfg={cfg} />;
  if (path === "/judges") return <JudgesPage cfg={cfg} />;
  if (path === "/captains") return <CaptainsPage cfg={cfg} />;
  if (path === "/docs") return <DocsPage cfg={cfg} />;
  const replay = /^\/replay(?:\/(\d{1,15}))?$/.exec(path);
  if (replay) return <ReplayPage cfg={cfg} gameId={replay[1] ? Number(replay[1]) : null} />;
  return <Play cfg={cfg} />;
}

const LANDED = "brinewar.landed";

function landedBefore(): boolean {
  try {
    return window.sessionStorage.getItem(LANDED) === "1";
  } catch {
    return false;
  }
}

function markLanded(): void {
  try {
    window.sessionStorage.setItem(LANDED, "1");
  } catch {
    return;
  }
}

function Play({ cfg }: { readonly cfg: AppConfig }) {
  const { boot, retry } = useBoot(cfg);
  const stats = useHarbourStats(cfg);
  const [landing, setLanding] = useState(() => duelFromLocation(window.location.search, window.location.hash, window.location.pathname) === null && !landedBefore());
  const enter = useCallback(() => {
    markLanded();
    sound.unlock();
    setLanding(false);
  }, []);
  if (boot.kind === "ready") return <PlayPage cfg={cfg} session={boot.session} stats={stats} landing={landing} onEnter={enter} />;
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
  if (landing)
    return (
      <main className="fixed inset-0 bg-[radial-gradient(120%_80%_at_70%_0%,#2a8db6,#0b2230_70%)]">
        <Landing stats={stats} ready={false} onEnter={enter} />
      </main>
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
