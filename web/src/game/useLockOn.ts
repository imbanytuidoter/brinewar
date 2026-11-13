import { useEffect, useRef, useState } from "react";

export const LOCK_MS = 1700;

export function useLockOn(gameId: number | null, shotN: number | null, cell: number | null, enabled: boolean): number | null {
  const seen = useRef<string | null>(null);
  const [lock, setLock] = useState<number | null>(null);
  useEffect(() => {
    const key = gameId === null || shotN === null ? null : `${gameId}:${shotN}`;
    const first = seen.current === null;
    if (key === null || key === seen.current) return;
    seen.current = key;
    if (first || !enabled || cell === null) return;
    setLock(cell);
  }, [gameId, shotN, cell, enabled]);
  useEffect(() => {
    if (lock === null) return;
    const t = setTimeout(() => setLock(null), LOCK_MS);
    return () => clearTimeout(t);
  }, [lock]);
  return lock;
}
