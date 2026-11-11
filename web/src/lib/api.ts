import type { AdmiraltyView, TreasuryView } from "./contract";

const API_TIMEOUT_MS = 8000;

export interface Sample<T> {
  readonly at: number;
  readonly block: number;
  readonly data: T;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isAmount = (v: unknown): v is string => typeof v === "string" && /^\d{1,40}$/.test(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

export function asAdmiralty(v: unknown): AdmiraltyView | null {
  if (!isObj(v) || !Array.isArray(v.heat) || v.heat.length !== 100 || !v.heat.every(isCount) || !isCount(v.boards_counted) || !isCount(v.day)) return null;
  return { heat: v.heat as number[], boards_counted: v.boards_counted, day: v.day };
}

export interface TreasuryPoint {
  readonly balance: string;
  readonly entry: string;
  readonly bounty: string;
}

export function asTreasuryPoint(v: unknown): TreasuryPoint | null {
  if (!isObj(v) || !isAmount(v.balance) || !isAmount(v.entry) || !isAmount(v.bounty)) return null;
  return { balance: v.balance, entry: v.entry, bounty: v.bounty };
}

function samples<T>(raw: unknown, parse: (v: unknown) => T | null): Sample<T>[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s): Sample<T>[] => {
    if (!isObj(s) || !isCount(s.at) || !isCount(s.block)) return [];
    const data = parse(s.data);
    return data ? [{ at: s.at, block: s.block, data }] : [];
  });
}

async function getJson(url: string, fetchFn: typeof fetch): Promise<unknown> {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`harbour answered ${res.status}`);
  return res.json();
}

export interface AdmiraltyHistory {
  readonly current: AdmiraltyView | null;
  readonly days: readonly Sample<AdmiraltyView>[];
}

export async function fetchAdmiralty(apiUrl: string, fetchFn: typeof fetch = fetch): Promise<AdmiraltyHistory> {
  const raw = await getJson(`${apiUrl}/api/admiralty`, fetchFn);
  if (!isObj(raw)) return { current: null, days: [] };
  return { current: asAdmiralty(raw.current), days: samples(raw.days, asAdmiralty) };
}

export interface TreasuryHistory {
  readonly current: TreasuryView | null;
  readonly history: readonly Sample<TreasuryPoint>[];
}

export async function fetchTreasury(apiUrl: string, fetchFn: typeof fetch = fetch): Promise<TreasuryHistory> {
  const raw = await getJson(`${apiUrl}/api/treasury`, fetchFn);
  if (!isObj(raw)) return { current: null, history: [] };
  const c = isObj(raw.current) ? raw.current : null;
  const point = asTreasuryPoint(c);
  const current = c && point && typeof c.account === "string" && isAmount(c.threshold) ? { ...point, account: c.account, threshold: c.threshold } : null;
  return { current, history: samples(raw.history, asTreasuryPoint) };
}
