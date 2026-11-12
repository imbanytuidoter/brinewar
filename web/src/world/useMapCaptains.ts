import { useEffect, useState } from "react";
import { fetchLeaderboard, type CaptainEntry } from "@/lib/api";
import type { AppConfig } from "@/lib/config";

const AT_SEA = 6;

export interface RankedCaptain {
  readonly captain: CaptainEntry;
  readonly rank: number;
}

export function captainsAtSea(all: readonly CaptainEntry[], me: string | null): RankedCaptain[] {
  const ranked = all.map((captain, i) => ({ captain, rank: i + 1 })).filter((r) => r.captain.account !== me);
  const real = ranked.filter((r) => !r.captain.seed);
  return [...real, ...ranked.filter((r) => r.captain.seed)].slice(0, AT_SEA);
}

export function useMapCaptains(cfg: AppConfig, me: string | null): readonly RankedCaptain[] {
  const [captains, setCaptains] = useState<readonly RankedCaptain[]>([]);
  useEffect(() => {
    let alive = true;
    fetchLeaderboard(cfg.apiUrl)
      .then((b) => alive && setCaptains(captainsAtSea(b.captains, me)))
      .catch(() => alive && setCaptains([]));
    return () => {
      alive = false;
    };
  }, [cfg, me]);
  return captains;
}
