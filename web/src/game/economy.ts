import type { EconomySettings } from "@/lib/contract";
import type { Rng } from "@/lib/fleet";

export interface Economy {
  readonly baseEntry: bigint;
  readonly threshold: bigint;
  readonly bountyBps: bigint;
  readonly bountyCap: bigint;
}

export function economyOf(s: EconomySettings): Economy {
  return { baseEntry: BigInt(s.base_entry), threshold: BigInt(s.entry_threshold), bountyBps: BigInt(s.bounty_bps), bountyCap: BigInt(s.bounty_cap) };
}

export function entryFee(e: Economy, treasury: bigint): bigint {
  if (treasury >= e.threshold) return e.baseEntry;
  return (e.baseEntry * (2n * e.threshold - treasury)) / e.threshold;
}

export function bounty(e: Economy, treasury: bigint): bigint {
  const share = (treasury * e.bountyBps) / 10_000n;
  return share < e.bountyCap ? share : e.bountyCap;
}

export interface SimStep {
  readonly battle: number;
  readonly won: boolean;
  readonly treasury: bigint;
  readonly entry: bigint;
  readonly bounty: bigint;
}

export function simulate(e: Economy, start: bigint, battles: number, winRate: number, rng: Rng): SimStep[] {
  const out: SimStep[] = [{ battle: 0, won: false, treasury: start, entry: entryFee(e, start), bounty: bounty(e, start) }];
  let t = start;
  for (let i = 1; i <= battles; i++) {
    const won = rng() < winRate;
    if (won) t -= bounty(e, t);
    else t += entryFee(e, t);
    out.push({ battle: i, won, treasury: t, entry: entryFee(e, t), bounty: bounty(e, t) });
  }
  return out;
}

export const RANKS: ReadonlyArray<readonly [string, number]> = [
  ["Ensign", 0],
  ["Lieutenant", 100],
  ["Captain", 300],
  ["Commodore", 700],
  ["Admiral", 1500],
];

export function rankProgress(xp: number): { readonly rank: string; readonly next: string | null; readonly share: number } {
  const i = RANKS.reduce((acc, [, min], k) => (xp >= min ? k : acc), 0);
  const [rank, floor] = RANKS[i] as readonly [string, number];
  const nextRank = RANKS[i + 1];
  if (!nextRank) return { rank, next: null, share: 1 };
  return { rank, next: nextRank[0], share: Math.min(1, Math.max(0, (xp - floor) / (nextRank[1] - floor))) };
}

export function huntOrder(heat: readonly number[]): number[] {
  return heat.map((h, i) => [h, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);
}
