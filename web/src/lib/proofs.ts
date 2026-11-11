import type { AnswerRow, ProofsView, PublicMove } from "./contract";

const PROOFS_TIMEOUT_MS = 6000;
const MAX_ITEMS = 400;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

function answer(v: unknown): AnswerRow | null {
  if (!isObj(v)) return null;
  const idx = int(v.idx);
  const cell = int(v.cell);
  const salt = str(v.salt);
  if (idx === null || cell === null || salt === null || !Array.isArray(v.proof) || !v.proof.every((p) => typeof p === "string")) return null;
  return { idx, cell, salt, proof: v.proof as string[], tx: str(v.tx) };
}

function move(v: unknown): PublicMove | null {
  if (!isObj(v) || typeof v.kind !== "string" || typeof v.source !== "string") return null;
  return {
    kind: v.kind, source: v.source, chat_id: str(v.chat_id), request: str(v.request), response: str(v.response),
    signature: str(v.signature), signed_text: str(v.signed_text), error: str(v.error), tx: str(v.tx), at: int(v.at) ?? 0,
  };
}

export type NauarchEvidence = ProofsView["nauarch"];

export function parseEvidence(raw: unknown, gameId: number): NauarchEvidence | null {
  if (!isObj(raw) || !isObj(raw.nauarch) || !isObj(raw.game) || raw.game.id !== gameId) return null;
  const n = raw.nauarch;
  if (!Array.isArray(n.answers) || !Array.isArray(n.moves) || n.answers.length > MAX_ITEMS || n.moves.length > MAX_ITEMS) return null;
  const answers = n.answers.map(answer);
  const moves = n.moves.map(move);
  if (answers.some((a) => a === null) || moves.some((m) => m === null)) return null;
  let reveal: NauarchEvidence["reveal"] = null;
  if (isObj(n.reveal)) {
    const cells = str(n.reveal.cells);
    const salts = n.reveal.salts;
    if (cells !== null && Array.isArray(salts) && salts.every((s) => typeof s === "string")) reveal = { cells, salts: salts as string[], tx: str(n.reveal.tx) };
  }
  return { root: str(n.root), answers: answers as AnswerRow[], moves: moves as PublicMove[], reveal };
}

export async function fetchEvidence(apiUrl: string, gameId: number, fetchFn: typeof fetch = fetch): Promise<NauarchEvidence | null> {
  const res = await fetchFn(`${apiUrl}/api/game/${gameId}/proofs`, { signal: AbortSignal.timeout(PROOFS_TIMEOUT_MS) });
  if (!res.ok) return null;
  return parseEvidence(await res.json(), gameId);
}
