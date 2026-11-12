import { useEffect, useState } from "react";
import { fetchLeaderboard, type CaptainEntry } from "@/lib/api";
import type { AppConfig } from "@/lib/config";

const AT_SEA = 6;

export function captainsAtSea(all: readonly CaptainEntry[]): CaptainEntry[] {
  const real = all.filter((c) => !c.seed);
  return [...real, ...all.filter((c) => c.seed)].slice(0, AT_SEA);
}

export function useMapCaptains(cfg: AppConfig): readonly CaptainEntry[] {
  const [captains, setCaptains] = useState<readonly CaptainEntry[]>([]);
  useEffect(() => {
    let alive = true;
    fetchLeaderboard(cfg.apiUrl)
      .then((b) => alive && setCaptains(captainsAtSea(b.captains)))
      .catch(() => alive && setCaptains([]));
    return () => {
      alive = false;
    };
  }, [cfg]);
  return captains;
}
