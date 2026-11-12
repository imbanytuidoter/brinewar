import { KeyPair } from "near-api-js";
import { describe, expect, it, vi } from "vitest";
import { chatClient, chatPayload } from "./chat";

describe("duel chat client", () => {
  it("signs what it sends with the guest key and keeps only well-formed messages", async () => {
    const kp = KeyPair.fromRandom("ed25519");
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ n: 1, messages: [{ n: 1, account: "a", text: "hi", at: 1 }, { bogus: true }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = chatClient("", "p-1.brinewar.testnet", kp.toString(), fetchFn, () => 42);
    expect(await c.send(7, "Good luck!")).toBe(true);
    const body = JSON.parse(String(calls[0]?.init?.body)) as { signature: string; signedAt: number; publicKey: string };
    const sig = Uint8Array.from(body.signature.match(/../g) ?? [], (b) => parseInt(b, 16));
    expect(kp.getPublicKey().verify(chatPayload("say", 7, "p-1.brinewar.testnet", 42, "Good luck!"), sig)).toBe(true);
    expect(body.publicKey).toBe(kp.getPublicKey().toString());
    expect(await c.read(7, 0)).toEqual([{ n: 1, account: "a", text: "hi", at: 1 }]);
    expect(calls[1]?.url).toMatch(/^\/api\/duel\/7\/chat\?account=p-1\.brinewar\.testnet&publicKey=/);
  });
});
