import { createHash, generateKeyPairSync, sign } from "node:crypto";
import pino from "pino";
import type { CallResult, Caller, Viewer } from "../src/lib/near.js";
import type { ModelProviderPort, ModelReply, ModelSignature } from "../src/lib/nearai.js";

export const silent = pino({ level: "silent" });

export class FakeViewer implements Viewer {
  readonly calls: Array<{ method: string; args: object }> = [];
  constructor(private readonly handler: (method: string, args: Record<string, unknown>) => unknown) {}
  async view<T>(method: string, args: object = {}): Promise<T> {
    this.calls.push({ method, args });
    return this.handler(method, args as Record<string, unknown>) as T;
  }
}

export class FakeCaller implements Caller {
  readonly calls: Array<{ method: string; args: Record<string, unknown>; gas: number }> = [];
  constructor(
    readonly accountId: string,
    private readonly handler: (method: string, args: Record<string, unknown>) => CallResult = () => ({ txHash: "tx", ok: true }),
    private readonly delayMs = 0,
  ) {}
  async call(method: string, args: object, gasTera = 30): Promise<CallResult> {
    this.calls.push({ method, args: args as Record<string, unknown>, gas: gasTera });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    return this.handler(method, args as Record<string, unknown>);
  }
}

export interface FakeModelOptions {
  readonly model: string;
  readonly reply: (request: string) => string;
  readonly failComplete?: boolean;
  readonly delayMs?: number;
}

export class FakeModel implements ModelProviderPort {
  readonly #keys = generateKeyPairSync("ed25519");
  readonly #replies = new Map<string, { request: string; response: string }>();
  readonly requests: string[] = [];
  onComplete: (() => void) | null = null;
  #n = 0;
  constructor(private readonly o: FakeModelOptions) {}

  get publicKeyHex(): string {
    const jwk = this.#keys.publicKey.export({ format: "jwk" }) as { x: string };
    return Buffer.from(jwk.x, "base64url").toString("hex");
  }

  async complete(request: string): Promise<ModelReply> {
    if (this.o.delayMs) await new Promise((r) => setTimeout(r, this.o.delayMs));
    if (this.o.failComplete) throw new Error("model unavailable");
    this.onComplete?.();
    this.requests.push(request);
    const chatId = `chatcmpl-${++this.#n}`;
    const content = this.o.reply(request);
    const response = JSON.stringify({ id: chatId, object: "chat.completion", model: this.o.model, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] });
    this.#replies.set(chatId, { request, response });
    return { chatId, responseBody: response, latencyMs: 1 };
  }

  async signature(chatId: string): Promise<ModelSignature> {
    const r = this.#replies.get(chatId);
    if (!r) throw new Error("unknown chat");
    const h = (s: string) => createHash("sha256").update(s).digest("hex");
    const text = `${this.o.model}:${h(r.request)}:${h(r.response)}`;
    return { text, signatureHex: sign(null, Buffer.from(text), this.#keys.privateKey).toString("hex"), signingAddress: this.publicKeyHex };
  }
}
