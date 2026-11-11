import { describe, expect, it, vi } from "vitest";
import { fetchEvidence, parseEvidence } from "./proofs";

const good = {
  game: { id: 3 },
  nauarch: {
    root: "ab",
    answers: [{ idx: 1, cell: 0, salt: "00", proof: ["11"], tx: "t" }],
    reveal: { cells: "0".repeat(100), salts: [], tx: null },
    moves: [{ kind: "Shot", source: "model", chat_id: null, request: "r", response: "s", signature: "g", signed_text: null, error: null, tx: "t", at: 5 }],
  },
};

describe("evidence from the harbour", () => {
  it("accepts the expected shape for the asked game", () => {
    const ev = parseEvidence(good, 3);
    expect(ev?.answers[0]?.idx).toBe(1);
    expect(ev?.moves[0]?.kind).toBe("Shot");
    expect(ev?.reveal?.cells).toHaveLength(100);
  });

  it("rejects another game, broken shapes and oversized lists", () => {
    expect(parseEvidence(good, 4)).toBeNull();
    expect(parseEvidence({ game: { id: 3 }, nauarch: { answers: "x", moves: [] } }, 3)).toBeNull();
    expect(parseEvidence({ game: { id: 3 }, nauarch: { answers: [{ idx: -1 }], moves: [] } }, 3)).toBeNull();
    expect(parseEvidence({ game: { id: 3 }, nauarch: { answers: [], moves: Array(401).fill(good.nauarch.moves[0]) } }, 3)).toBeNull();
    expect(parseEvidence(null, 3)).toBeNull();
  });

  it("fetches with a timeout signal and returns null on errors", async () => {
    const ok = vi.fn(async (_u: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify(good));
    });
    expect(await fetchEvidence("", 3, ok as unknown as typeof fetch)).not.toBeNull();
    const bad = vi.fn(async () => new Response("{}", { status: 500 }));
    expect(await fetchEvidence("", 3, bad as unknown as typeof fetch)).toBeNull();
  });
});
