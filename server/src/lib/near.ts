import { Account, actions, JsonRpcProvider, KeyPairSigner, teraToGas, type KeyPairString } from "near-api-js";

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
  call(method: string, args: object, gasTera?: number): Promise<CallResult>;
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
    private readonly provider: JsonRpcProvider,
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
    provider: JsonRpcProvider,
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

export function provider(url: string): JsonRpcProvider {
  return new JsonRpcProvider({ url });
}

export async function blockHeight(p: JsonRpcProvider, timeoutMs: number): Promise<number> {
  const block = await withTimeout(p.viewBlock({ finality: "optimistic" }), timeoutMs, "block");
  return Number(block.header.height);
}
