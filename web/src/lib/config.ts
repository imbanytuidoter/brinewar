export interface AppConfig {
  readonly apiUrl: string;
  readonly rpcUrl: string;
  readonly contractId: string;
  readonly explorerTxUrl: string;
  readonly explorerAccountUrl: string;
  readonly repoUrl: string;
}

const ACCOUNT = /^(?=.{2,64}$)([a-z\d]+[-_])*[a-z\d]+(\.([a-z\d]+[-_])*[a-z\d]+)*$/;

function isLocal(u: URL): boolean {
  return u.hostname === "localhost" || u.hostname === "127.0.0.1";
}

export function checkUrl(name: string, raw: string | undefined, allowEmpty: boolean): string {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  if (!value) {
    if (allowEmpty) return "";
    throw new Error(`${name} is not set`);
  }
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new Error(`${name} is not a URL`);
  }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && isLocal(u))) throw new Error(`${name} must use https`);
  if (u.username || u.password) throw new Error(`${name} must not carry credentials`);
  return value;
}

export function checkUrls(name: string, raw: string | undefined): string {
  const list = (raw ?? "").split(",").map((u) => u.trim()).filter(Boolean);
  if (list.length === 0) throw new Error(`${name} is not set`);
  return list.map((u) => checkUrl(name, u, false)).join(",");
}

export function readConfig(env: Record<string, string | undefined>): AppConfig {
  const contractId = (env.VITE_GAME_CONTRACT ?? "").trim();
  if (!ACCOUNT.test(contractId)) throw new Error("VITE_GAME_CONTRACT is not a NEAR account id");
  return {
    apiUrl: checkUrl("VITE_API_URL", env.VITE_API_URL, true),
    rpcUrl: checkUrls("VITE_NEAR_RPC_URL", env.VITE_NEAR_RPC_URL),
    contractId,
    explorerTxUrl: checkUrl("VITE_EXPLORER_TX_URL", env.VITE_EXPLORER_TX_URL, true),
    explorerAccountUrl: checkUrl("VITE_EXPLORER_ACCOUNT_URL", env.VITE_EXPLORER_ACCOUNT_URL, true),
    repoUrl: checkUrl("VITE_REPO_URL", env.VITE_REPO_URL, true),
  };
}

export function txLink(cfg: AppConfig, hash: string | null | undefined): string | null {
  if (!hash || !cfg.explorerTxUrl || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(hash)) return null;
  return `${cfg.explorerTxUrl}/${hash}`;
}

export function accountLink(cfg: AppConfig, account: string): string | null {
  if (!cfg.explorerAccountUrl || !ACCOUNT.test(account)) return null;
  return `${cfg.explorerAccountUrl}/${account}`;
}

export function networkOf(contractId: string): string {
  if (contractId.endsWith(".testnet")) return "NEAR testnet";
  if (contractId.endsWith(".near") && !contractId.endsWith(".test.near")) return "NEAR mainnet";
  return "local sandbox";
}
