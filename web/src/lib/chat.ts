import { KeyPair, type KeyPairString } from "near-api-js";

export interface ChatMessage {
  readonly n: number;
  readonly account: string;
  readonly text: string;
  readonly at: number;
}

export const CHAT_MAX = 200;

const enc = new TextEncoder();
const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export function chatPayload(kind: "say" | "read", gameId: number, account: string, signedAt: number, text = ""): Uint8Array {
  return enc.encode(kind === "say" ? `brinewar-chat\n${gameId}\n${account}\n${signedAt}\n${text}` : `brinewar-chat-read\n${gameId}\n${account}\n${signedAt}`);
}

export interface ChatClient {
  send(gameId: number, text: string): Promise<boolean>;
  read(gameId: number, after: number): Promise<ChatMessage[]>;
}

function isMessage(v: unknown): v is ChatMessage {
  const m = v as Partial<ChatMessage> | null;
  return !!m && typeof m.n === "number" && typeof m.account === "string" && typeof m.text === "string" && typeof m.at === "number";
}

export function chatClient(apiUrl: string, account: string, secretKey: string, fetchFn: typeof fetch = fetch, now: () => number = Date.now): ChatClient {
  const kp = KeyPair.fromString(secretKey as KeyPairString);
  const publicKey = kp.getPublicKey().toString();
  const sign = (bytes: Uint8Array): string => hex(kp.sign(bytes).signature);
  return {
    async send(gameId, text) {
      const signedAt = now();
      const res = await fetchFn(`${apiUrl}/api/duel/${gameId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account, publicKey, signedAt, text, signature: sign(chatPayload("say", gameId, account, signedAt, text)) }),
      }).catch(() => null);
      return res?.ok ?? false;
    },
    async read(gameId, after) {
      const signedAt = now();
      const q = new URLSearchParams({ account, publicKey, signedAt: String(signedAt), signature: sign(chatPayload("read", gameId, account, signedAt)), after: String(after) });
      const res = await fetchFn(`${apiUrl}/api/duel/${gameId}/chat?${q}`).catch(() => null);
      if (!res?.ok) return [];
      const body = (await res.json().catch(() => null)) as { messages?: unknown } | null;
      return Array.isArray(body?.messages) ? body.messages.filter(isMessage) : [];
    },
  };
}
