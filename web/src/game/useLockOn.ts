import { useEffect, useRef, useState } from "react";

export const LOCK_MS = 1700;
export const LOCK_AFTER_LAND_MS = 450;
export const LOCK_MAX_MS = 12_000;

export function useLockOn(gameId: number | null, shotN: number | null, cell: number | null, enabled: boolean, airborne = false): number | null {
  const lockedAt = useRef(0);
  const seen = useRef<{ readonly gameId: number | null; readonly shotN: number | null } | null>(null);
  const [lock, setLock] = useState<number | null>(null);
  useEffect(() => {
    const before = seen.current;
    seen.current = { gameId, shotN };
    if (before === null || before.gameId !== gameId || shotN === null || shotN === before.shotN) return;
    if (enabled && cell !== null) {
      lockedAt.current = performance.now();
      setLock(cell);
    }
  }, [gameId, shotN, cell, enabled]);
  useEffect(() => {
    if (lock === null) return;
    const held = performance.now() - lockedAt.current;
    const wait = airborne ? LOCK_MAX_MS - held : Math.max(LOCK_AFTER_LAND_MS, LOCK_MS - held);
    const t = setTimeout(() => setLock(null), Math.max(0, wait));
    return () => clearTimeout(t);
  }, [lock, airborne]);
  return lock;
}
