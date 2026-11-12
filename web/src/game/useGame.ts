import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { makeCaller, makeViewer } from "@/lib/chain";
import type { AppConfig } from "@/lib/config";
import { ensureGuest, GuestError, refuelGuest } from "@/lib/guest";
import { fetchEvidence } from "@/lib/proofs";
import { browserStorage } from "@/lib/storage";
import { GameSession, type Snapshot } from "./session";

const BATTLE_POLL_MS = 1500;
const HARBOUR_POLL_MS = 8000;
const OFFLINE_POLL_MS = 5000;

export type Boot =
  | { readonly kind: "boarding" }
  | { readonly kind: "error"; readonly message: string; readonly retryable: boolean }
  | { readonly kind: "ready"; readonly session: GameSession };

export function useBoot(cfg: AppConfig): { boot: Boot; retry: () => void } {
  const [boot, setBoot] = useState<Boot>({ kind: "boarding" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setBoot({ kind: "boarding" });
    const store = browserStorage();
    const viewer = makeViewer(cfg.rpcUrl, cfg.contractId);
    ensureGuest(store, cfg.apiUrl, cfg.contractId, viewer)
      .then((g) => {
        if (!alive) return;
        const session = new GameSession({
          accountId: g.accountId,
          viewer,
          caller: makeCaller(cfg.rpcUrl, cfg.contractId, g.accountId, g.secretKey),
          store,
          evidence: (id) => fetchEvidence(cfg.apiUrl, id),
          refuel: () => refuelGuest(cfg.apiUrl, g.publicKey),
        });
        setBoot({ kind: "ready", session });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const retryable = err instanceof GuestError ? err.retryable : true;
        setBoot({ kind: "error", message: err instanceof Error ? err.message : "Could not reach the harbour.", retryable });
      });
    return () => {
      alive = false;
    };
  }, [cfg, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { boot, retry };
}

export function useSession(session: GameSession): Snapshot {
  const subscribe = useCallback((fn: () => void) => session.subscribe(fn), [session]);
  const snap = useSyncExternalStore(subscribe, () => session.snapshot);
  const inBattle = snap.gameId !== null && snap.step?.kind !== "done";
  const delay = snap.offline ? OFFLINE_POLL_MS : inBattle ? BATTLE_POLL_MS : HARBOUR_POLL_MS;
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async (): Promise<void> => {
      if (!alive) return;
      if (!document.hidden) await session.poll();
      if (alive) timer = setTimeout(() => void loop(), delay);
    };
    void loop();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [session, delay]);
  return snap;
}

export function useReducedMotion(): boolean {
  const query = useMemo(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null), []);
  const [reduced, setReduced] = useState(() => query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const on = (e: MediaQueryListEvent): void => setReduced(e.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, [query]);
  return reduced;
}
