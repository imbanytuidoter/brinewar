export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const v = env[key]?.trim();
  if (!v) throw new ConfigError(`${key} is required`);
  return v;
}

function optional(env: Env, key: string): string | undefined {
  const v = env[key]?.trim();
  return v ? v : undefined;
}

export function int(env: Env, key: string, fallback: number, min = 0): number {
  const raw = optional(env, key);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new ConfigError(`${key} must be an integer >= ${min}`);
  return n;
}

export function accountId(env: Env, key: string): string {
  const v = required(env, key);
  if (!/^(?=.{2,64}$)([a-z\d]+[-_])*[a-z\d]+(\.([a-z\d]+[-_])*[a-z\d]+)*$/.test(v)) throw new ConfigError(`${key} is not a NEAR account id`);
  return v;
}

function secretKey(env: Env, key: string): string {
  const v = required(env, key);
  if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(v)) throw new ConfigError(`${key} must be an ed25519 secret key`);
  return v;
}

export function url(env: Env, key: string, fallback: string): string {
  const v = optional(env, key) ?? fallback;
  try {
    const u = new URL(v);
    const local = u.hostname === "127.0.0.1" || u.hostname === "localhost";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) throw new Error();
  } catch {
    throw new ConfigError(`${key} must be an https URL (http only for localhost)`);
  }
  return v.replace(/\/$/, "");
}

export function urls(env: Env, key: string, fallback: string): string {
  const list = (optional(env, key) ?? fallback).split(",").map((u) => u.trim()).filter(Boolean);
  if (list.length === 0) throw new ConfigError(`${key} must list at least one URL`);
  return list.map((u) => url({ [key]: u }, key, fallback)).join(",");
}

const TESTNET_SPARES = ["https://test.rpc.fastnear.com", "https://near-testnet.drpc.org"];
const RETIRED_RPC = ["rpc.testnet.near.org", "rpc.mainnet.near.org"];

const retired = (u: string): boolean => RETIRED_RPC.includes(new URL(u).hostname);

export function rpcUrls(env: Env): string {
  const configured = urls(env, "NEAR_RPC_URL", "https://rpc.testnet.fastnear.com").split(",");
  const kept = configured.filter((u) => !retired(u));
  const listed = kept.length > 0 ? kept : configured;
  const testnet = (optional(env, "GAME_CONTRACT") ?? "").endsWith(".testnet");
  const spares = testnet ? TESTNET_SPARES.filter((u) => !listed.includes(u)) : [];
  return [...listed, ...spares].join(",");
}

interface AdmiralConfig {
  rpcUrl: string;
  contract: string;
  admiral: string;
  admiralKeys: string[];
  encKey: string;
  dbPath: string;
  nearAiUrl: string;
  nearAiKey: string | undefined;
  tickMs: number;
  modelTimeoutMs: number;
  shotBudgetMs: number;
}

export function admiralConfig(env: Env): AdmiralConfig {
  return {
    rpcUrl: rpcUrls(env),
    contract: accountId(env, "GAME_CONTRACT"),
    admiral: accountId(env, "ADMIRAL_ACCOUNT"),
    admiralKeys: required(env, "ADMIRAL_KEY").split(",").map((k) => secretKey({ ADMIRAL_KEY: k.trim() }, "ADMIRAL_KEY")),
    encKey: required(env, "BOARD_ENC_KEY"),
    dbPath: required(env, "DB_PATH"),
    nearAiUrl: url(env, "NEAR_AI_URL", "https://cloud-api.near.ai"),
    nearAiKey: optional(env, "NEAR_AI_API_KEY"),
    tickMs: int(env, "TICK_MS", 250, 100),
    modelTimeoutMs: int(env, "MODEL_TIMEOUT_MS", 20_000, 1000),
    shotBudgetMs: int(env, "MODEL_SHOT_BUDGET_MS", 3_500, 500),
  };
}

interface ApiConfig {
  rpcUrl: string;
  contract: string;
  sponsor: string;
  sponsorKey: string;
  dbPath: string;
  host: string;
  port: number;
  guestsPerIpHour: number;
  guestsPerIpDay: number;
  guestsPerDay: number;
  trustProxy: number;
  sampleMs: number;
  refuelBelowYocto: bigint;
}

export function nearAmount(env: Env, key: string, fallback: string): bigint {
  const raw = optional(env, key) ?? fallback;
  const m = /^(\d{1,6})(?:\.(\d{1,24}))?$/.exec(raw);
  if (!m) throw new ConfigError(`${key} must be an amount of NEAR such as 0.08`);
  return BigInt(m[1] as string) * 10n ** 24n + BigInt((m[2] ?? "").padEnd(24, "0"));
}

export function apiConfig(env: Env): ApiConfig {
  return {
    rpcUrl: rpcUrls(env),
    contract: accountId(env, "GAME_CONTRACT"),
    sponsor: accountId(env, "SPONSOR_ACCOUNT"),
    sponsorKey: secretKey(env, "SPONSOR_KEY"),
    dbPath: required(env, "DB_PATH"),
    host: optional(env, "API_HOST") ?? "127.0.0.1",
    port: int(env, "API_PORT", 8791, 1),
    guestsPerIpHour: int(env, "GUESTS_PER_IP_HOUR", 6, 0),
    guestsPerIpDay: int(env, "GUESTS_PER_IP_DAY", 12, 0),
    guestsPerDay: int(env, "GUESTS_PER_DAY", 300, 1),
    trustProxy: int(env, "TRUST_PROXY", 0),
    sampleMs: int(env, "SAMPLE_MS", 15_000, 1000),
    refuelBelowYocto: nearAmount(env, "REFUEL_BELOW_NEAR", "0.08"),
  };
}
