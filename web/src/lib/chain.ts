import { Account, actions, baseDecode, createTransaction, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, teraToGas, type KeyPairString, type Provider } from "near-api-js";

export const PLAYER_GAS_TGAS = 10;
export const PLAYER_REVEAL_GAS_TGAS = 30;

export function playerGas(method: string): number {
  return method === "reveal" ? PLAYER_REVEAL_GAS_TGAS : PLAYER_GAS_TGAS;
}
const VIEW_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 60_000;
const BLOCK_HASH_TTL_MS = 10 * 60_000;
const STALE_KEY = /nonce|expired|InvalidTransaction|InvalidAccessKey/i;

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

export function rotate<T extends object>(items: readonly T[]): T {
  const first = items[0];
  if (!first) throw new Error("nothing to rotate");
  let turn = 0;
  return new Proxy(first, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const item = items[turn % items.length] as T;
        turn += 1;
        const fn = Reflect.get(item, prop, item) as (...a: unknown[]) => unknown;
        return fn.apply(item, args);
      };
    },
  });
}

function endpoints(rpcUrl: string): JsonRpcProvider[] {
  return rpcUrl.split(",").map((u) => u.trim()).filter(Boolean).map((url) => new JsonRpcProvider({ url }));
}

export function readRpc(rpcUrl: string): Provider {
  return writeRpc(rpcUrl);
}

export function makeHeight(rpcUrl: string): () => Promise<number> {
  const provider = readRpc(rpcUrl);
  return async () => Number((await withTimeout(provider.viewBlock({ finality: "optimistic" }), VIEW_TIMEOUT_MS, "block")).header.height);
}

export function writeRpc(rpcUrl: string): Provider {
  const list = endpoints(rpcUrl);
  if (list.length <= 1) return list[0] ?? new JsonRpcProvider({ url: rpcUrl });
  return new FailoverRpcProvider(list);
}

export function makeViewer(rpcUrl: string, contractId: string): Viewer {
  const provider = readRpc(rpcUrl);
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

interface Prepared {
  nonce: bigint;
  blockHash: Uint8Array;
  at: number;
}

export function makeCaller(rpcUrl: string, contractId: string, accountId: string, secretKey: string): Caller {
  const provider = writeRpc(rpcUrl);
  const signer = KeyPairSigner.fromSecretKey(secretKey as KeyPairString);
  const account = new Account(accountId, provider, signer);
  let prepared: Promise<Prepared | null> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  const prepare = (): Promise<Prepared | null> => {
    prepared ??= (async () => {
      const publicKey = await signer.getPublicKey();
      const [key, block] = await Promise.all([
        withTimeout(provider.viewAccessKey({ accountId, publicKey }), VIEW_TIMEOUT_MS, "access key"),
        withTimeout(provider.viewBlock({ finality: "final" }), VIEW_TIMEOUT_MS, "block"),
      ]);
      return { nonce: BigInt(key.nonce), blockHash: baseDecode(block.header.hash), at: Date.now() };
    })().catch(() => {
      prepared = null;
      return null;
    });
    return prepared;
  };
  void prepare();

  const slow = (method: string, args: object) =>
    account.signAndSendTransaction({
      receiverId: contractId,
      actions: [actions.functionCall(method, { ...args }, teraToGas(playerGas(method)), 0n)],
      waitUntil: "EXECUTED_OPTIMISTIC",
      throwOnFailure: false,
    });

  const fast = async (method: string, args: object): Promise<unknown> => {
    const p = await prepare();
    if (!p || Date.now() - p.at > BLOCK_HASH_TTL_MS) {
      prepared = null;
      return slow(method, args);
    }
    p.nonce += 1n;
    const tx = createTransaction(accountId, await signer.getPublicKey(), contractId, p.nonce, [actions.functionCall(method, { ...args }, teraToGas(playerGas(method)), 0n)], p.blockHash);
    const { signedTransaction } = await signer.signTransaction(tx);
    try {
      return await provider.sendTransactionUntil(signedTransaction, "EXECUTED_OPTIMISTIC");
    } catch (err) {
      prepared = null;
      if (err instanceof Error && STALE_KEY.test(err.message)) return slow(method, args);
      throw err;
    }
  };

  return {
    accountId,
    call(method: string, args: object): Promise<CallResult> {
      const run = async (): Promise<CallResult> => {
        try {
          return resultFromResponse(await withTimeout(fast(method, args), CALL_TIMEOUT_MS, method));
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
