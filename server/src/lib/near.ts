import { Account, actions, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, teraToGas, type KeyPairString, type Provider } from "near-api-js";

export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
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

export interface Viewer {
  view<T>(method: string, args?: object): Promise<T>;
}

export interface Caller {
  readonly accountId: string;
  call(method: string, args: object, gasTera?: number, lane?: number): Promise<CallResult>;
}

export class CallerPool implements Caller {
  readonly accountId: string;
  constructor(private readonly callers: readonly Caller[]) {
    const first = callers[0];
    if (!first) throw new Error("a caller pool needs at least one key");
    if (callers.some((c) => c.accountId !== first.accountId)) throw new Error("all keys in a pool must belong to one account");
    this.accountId = first.accountId;
  }

  get size(): number {
    return this.callers.length;
  }

  call(method: string, args: object, gasTera = 30, lane = 0): Promise<CallResult> {
    const i = ((Math.trunc(lane) % this.callers.length) + this.callers.length) % this.callers.length;
    return (this.callers[i] as Caller).call(method, args, gasTera);
  }
}

export function failureText(failure: unknown): string {
  const kind = field(field(failure, "ActionError"), "kind");
  const exec = field(field(kind, "FunctionCallError"), "ExecutionError");
  return typeof exec === "string" ? exec : JSON.stringify(failure);
}

export function resultFromResponse(resp: unknown): CallResult {
  const hash = field(field(resp, "transaction"), "hash");
  const txHash = typeof hash === "string" ? hash : null;
  const status = field(resp, "status");
  const failure = field(status, "Failure");
  if (failure !== undefined) return { txHash, ok: false, error: failureText(failure) };
  const success = field(status, "SuccessValue");
  if (typeof success === "string") {
    if (success === "") return { txHash, ok: true };
    try {
      return { txHash, ok: true, value: JSON.parse(Buffer.from(success, "base64").toString("utf8")) };
    } catch {
      return { txHash, ok: true };
    }
  }
  return { txHash, ok: false, error: "transaction outcome is not final" };
}

export class NearViewer implements Viewer {
  constructor(
    private readonly provider: Provider,
    private readonly contractId: string,
    private readonly timeoutMs: number,
  ) {}

  async view<T>(method: string, args: object = {}): Promise<T> {
    const out = await withTimeout(
      this.provider.callFunction({ contractId: this.contractId, method, args: { ...args }, blockQuery: { finality: "optimistic" } }),
      this.timeoutMs,
      `view ${method}`,
    );
    return out as T;
  }
}

export class NearCaller implements Caller {
  readonly #account: Account;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly accountId: string,
    provider: Provider,
    secretKey: string,
    private readonly contractId: string,
    private readonly timeoutMs: number,
  ) {
    this.#account = new Account(accountId, provider, KeyPairSigner.fromSecretKey(secretKey as KeyPairString));
  }

  call(method: string, args: object, gasTera = 30): Promise<CallResult> {
    const run = async (): Promise<CallResult> => {
      try {
        const resp = await withTimeout(
          this.#account.signAndSendTransaction({
            receiverId: this.contractId,
            actions: [actions.functionCall(method, { ...args }, teraToGas(gasTera), 0n)],
            waitUntil: "EXECUTED_OPTIMISTIC",
            throwOnFailure: false,
          }),
          this.timeoutMs,
          `call ${method}`,
        );
        return resultFromResponse(resp);
      } catch (err) {
        return { txHash: null, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => undefined);
    return next;
  }
}

const RPC_RETRY = { retries: 2, wait: 200, backoff: 1.5 } as const;

const endpoint = (url: string): JsonRpcProvider => new JsonRpcProvider({ url }, RPC_RETRY);

export function provider(urls: string): Provider {
  const list = urls.split(",").map((u) => u.trim()).filter(Boolean);
  if (list.length === 0) throw new Error("no RPC URL");
  const providers = list.map(endpoint);
  return providers.length === 1 ? (providers[0] as JsonRpcProvider) : new FailoverRpcProvider(providers);
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

export function readProvider(urls: string): Provider {
  const list = urls.split(",").map((u) => u.trim()).filter(Boolean);
  if (list.length === 0) throw new Error("no RPC URL");
  const providers = list.map(endpoint);
  if (providers.length === 1) return providers[0] as JsonRpcProvider;
  return rotate(providers.map((_, i) => new FailoverRpcProvider([...providers.slice(i), ...providers.slice(0, i)])));
}

export async function blockHeight(p: Provider, timeoutMs: number): Promise<number> {
  const block = await withTimeout(p.viewBlock({ finality: "optimistic" }), timeoutMs, "block");
  return Number(block.header.height);
}
