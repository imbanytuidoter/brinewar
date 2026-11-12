import { Account, actions, JsonRpcProvider, KeyPairSigner, teraToGas, type KeyPairString } from "near-api-js";

export const PLAYER_GAS_TGAS = 10;
export const PLAYER_REVEAL_GAS_TGAS = 30;

export function playerGas(method: string): number {
  return method === "reveal" ? PLAYER_REVEAL_GAS_TGAS : PLAYER_GAS_TGAS;
}
const VIEW_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 60_000;

export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function field(obj: unknown, key: string): unknown {
  return typeof obj === "object" && obj !== null ? (obj as Record<string, unknown>)[key] : undefined;
}

export interface CallResult {
  readonly txHash: string | null;
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: string;
}

export function failureText(failure: unknown): string {
  const kind = field(field(failure, "ActionError"), "kind");
  const exec = field(field(kind, "FunctionCallError"), "ExecutionError");
  return typeof exec === "string" ? exec : JSON.stringify(failure);
}

function decodeBase64Json(b64: string): unknown {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function resultFromResponse(resp: unknown): CallResult {
  const hash = field(field(resp, "transaction"), "hash");
  const txHash = typeof hash === "string" ? hash : null;
  const status = field(resp, "status");
  const failure = field(status, "Failure");
  if (failure !== undefined) return { txHash, ok: false, error: failureText(failure) };
  const success = field(status, "SuccessValue");
  if (typeof success !== "string") return { txHash, ok: false, error: "transaction outcome is not final" };
  if (success === "") return { txHash, ok: true };
  try {
    return { txHash, ok: true, value: decodeBase64Json(success) };
  } catch {
    return { txHash, ok: true };
  }
}

export interface Viewer {
  view<T>(method: string, args?: object): Promise<T>;
}

export interface Caller {
  readonly accountId: string;
  call(method: string, args: object): Promise<CallResult>;
}

export function makeViewer(rpcUrl: string, contractId: string): Viewer {
  const provider = new JsonRpcProvider({ url: rpcUrl });
  return {
    async view<T>(method: string, args: object = {}): Promise<T> {
      const out = await withTimeout(
        provider.callFunction({ contractId, method, args: { ...args }, blockQuery: { finality: "optimistic" } }),
        VIEW_TIMEOUT_MS,
        `view ${method}`,
      );
      return out as T;
    },
  };
}

export function makeCaller(rpcUrl: string, contractId: string, accountId: string, secretKey: string): Caller {
  const provider = new JsonRpcProvider({ url: rpcUrl });
  const account = new Account(accountId, provider, KeyPairSigner.fromSecretKey(secretKey as KeyPairString));
  let queue: Promise<unknown> = Promise.resolve();
  return {
    accountId,
    call(method: string, args: object): Promise<CallResult> {
      const run = async (): Promise<CallResult> => {
        try {
          const resp = await withTimeout(
            account.signAndSendTransaction({
              receiverId: contractId,
              actions: [actions.functionCall(method, { ...args }, teraToGas(playerGas(method)), 0n)],
              waitUntil: "EXECUTED_OPTIMISTIC",
              throwOnFailure: false,
            }),
            CALL_TIMEOUT_MS,
            method,
          );
          return resultFromResponse(resp);
        } catch (err) {
          return { txHash: null, ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
  };
}
