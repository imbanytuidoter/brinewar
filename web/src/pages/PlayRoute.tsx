import { Anchor, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useBoot } from "@/game/useGame";
import { useHarbourStats } from "@/game/useHarbour";
import type { AppConfig } from "@/lib/config";
import { sound } from "@/lib/sound";
import { PlayPage } from "@/pages/PlayPage";
import { duelFromLocation } from "@/ui/DuelCards";
import { Landing } from "@/ui/Landing";
import { Shell } from "@/ui/Shell";

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

export function Play({ cfg }: { readonly cfg: AppConfig }) {
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
