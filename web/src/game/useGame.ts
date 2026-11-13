import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { makeCaller, makeHeight, makeViewer } from "@/lib/chain";
import type { AppConfig } from "@/lib/config";
import { ensureGuest, GuestError, refuelGuest } from "@/lib/guest";
import { fetchEvidence, fetchQuickAnswer } from "@/lib/proofs";
import { browserStorage } from "@/lib/storage";
import { GameSession, type Snapshot } from "./session";

const BATTLE_POLL_MS = 1500;
const WATCH_POLL_MS = 700;
const HARBOUR_POLL_MS = 8000;
const OFFLINE_POLL_MS = 5000;
const HIDDEN_POLL_MS = 4000;

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
          quickAnswer: (id, index) => fetchQuickAnswer(cfg.apiUrl, id, index),
          refuel: () => refuelGuest(cfg.apiUrl, g.publicKey),
          height: makeHeight(cfg.rpcUrl),
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
  const theirMove = snap.step?.kind === "thinking" || snap.step?.kind === "wait" || snap.step?.kind === "answer";
  const delay = snap.offline ? OFFLINE_POLL_MS : inBattle ? (theirMove ? WATCH_POLL_MS : BATTLE_POLL_MS) : HARBOUR_POLL_MS;
  const delayRef = useRef(delay);
  useEffect(() => {
    delayRef.current = delay;
  }, [delay]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    const loop = async (): Promise<void> => {
      if (!alive || running) return;
      running = true;
      await session.poll();
      running = false;
      const wait = delayRef.current;
      if (alive) timer = setTimeout(() => void loop(), document.hidden ? Math.max(wait, HIDDEN_POLL_MS) : wait);
    };
    const wake = (): void => {
      if (document.hidden || !alive || running) return;
      clearTimeout(timer);
      void loop();
    };
    void loop();
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [session]);
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
