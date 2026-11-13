import { useEffect, useRef, useState } from "react";

export const LOCK_MS = 1700;

export function useLockOn(gameId: number | null, shotN: number | null, cell: number | null, enabled: boolean): number | null {
  const seen = useRef<{ readonly gameId: number | null; readonly shotN: number | null } | null>(null);
  const [lock, setLock] = useState<number | null>(null);
  useEffect(() => {
    const before = seen.current;
    seen.current = { gameId, shotN };
    if (before === null || before.gameId !== gameId || shotN === null || shotN === before.shotN) return;
    if (enabled && cell !== null) setLock(cell);
  }, [gameId, shotN, cell, enabled]);
  useEffect(() => {
    if (lock === null) return;
    const t = setTimeout(() => setLock(null), LOCK_MS);
    return () => clearTimeout(t);
  }, [lock]);
  return lock;
}
