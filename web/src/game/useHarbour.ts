import { useCallback, useEffect, useState } from "react";
import { fetchAdmiralty, fetchTreasury } from "@/lib/api";
import { makeViewer } from "@/lib/chain";
import type { AppConfig } from "@/lib/config";
import type { AdmiraltyView, TreasuryView } from "@/lib/contract";
import { catalogSkins, equippedSkin, equipSkin, ownedSkins, skinLook, type SkinLook } from "@/lib/skins";
import { browserStorage } from "@/lib/storage";

const STATS_REFRESH_MS = 30_000;

export interface HarbourStats {
  readonly admiralty: AdmiraltyView | null;
  readonly treasury: TreasuryView | null;
}

export function useHarbourStats(cfg: AppConfig): HarbourStats {
  const [stats, setStats] = useState<HarbourStats>({ admiralty: null, treasury: null });
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (): Promise<void> => {
      const [a, t] = await Promise.allSettled([fetchAdmiralty(cfg.apiUrl), fetchTreasury(cfg.apiUrl)]);
      if (!alive) return;
      setStats((prev) => ({
        admiralty: a.status === "fulfilled" ? (a.value.current ?? prev.admiralty) : prev.admiralty,
        treasury: t.status === "fulfilled" ? (t.value.current ?? prev.treasury) : prev.treasury,
      }));
      timer = setTimeout(() => void load(), STATS_REFRESH_MS);
    };
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [cfg]);
  return stats;
}

export interface Skins {
  readonly all: readonly string[];
  readonly owned: readonly string[];
  readonly equipped: string | null;
  readonly look: SkinLook | null;
  readonly failed: boolean;
  readonly equip: (name: string | null) => void;
}

export function useSkins(cfg: AppConfig, accountId: string): Skins {
  const [all, setAll] = useState<readonly string[]>([]);
  const [owned, setOwned] = useState<readonly string[]>([]);
  const [equipped, setEquipped] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const viewer = makeViewer(cfg.rpcUrl, cfg.contractId);
    ownedSkins(viewer, accountId)
      .then(({ all: every, owned: list }) => {
        if (!alive) return;
        setAll([...new Set([...every, ...catalogSkins()])]);
        setOwned(list);
        setEquipped(equippedSkin(browserStorage(), accountId, list) ?? list[0] ?? null);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [cfg, accountId]);
  const equip = useCallback(
    (name: string | null) => {
      equipSkin(browserStorage(), accountId, name);
      setEquipped(name);
    },
    [accountId],
  );
  return { all, owned, equipped, look: equipped ? skinLook(equipped) : null, failed, equip };
}
