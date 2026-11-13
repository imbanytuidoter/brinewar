import { Anchor } from "lucide-react";
import { lazy, Suspense, useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Shipwreck } from "@/ui/Shipwreck";
import { Shell } from "@/ui/Shell";
import "@/lib/musicBox";
import { captureLinks, currentRoute, pageKey, subscribeRoute } from "@/lib/router";
import { readConfig, type AppConfig } from "@/lib/config";

const AdmiraltyPage = lazy(() => import("@/pages/AdmiraltyPage").then((m) => ({ default: m.AdmiraltyPage })));
const FleetPage = lazy(() => import("@/pages/FleetPage").then((m) => ({ default: m.FleetPage })));
const CaptainsPage = lazy(() => import("@/pages/CaptainsPage").then((m) => ({ default: m.CaptainsPage })));
const DocsPage = lazy(() => import("@/pages/docs/DocsPage").then((m) => ({ default: m.DocsPage })));
const JudgesPage = lazy(() => import("@/pages/JudgesPage").then((m) => ({ default: m.JudgesPage })));
const ReplayPage = lazy(() => import("@/pages/ReplayPage").then((m) => ({ default: m.ReplayPage })));
const TreasuryPage = lazy(() => import("@/pages/TreasuryPage").then((m) => ({ default: m.TreasuryPage })));
const PlayRoute = lazy(() => import("@/pages/PlayRoute").then((m) => ({ default: m.Play })));
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
  return <PlayRoute cfg={cfg} />;
}

