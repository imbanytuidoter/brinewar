import { ed25519 } from "@noble/curves/ed25519.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import type { ModelView, PublicMove, ShotView } from "./contract";
import { fromHex, sha256, toHex } from "./merkle";

const MAX_LINE_CHARS = 140;

export function extractContent(responseBody: string): string | null {
  try {
    const v = JSON.parse(responseBody) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = v.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}

interface Reply {
  readonly shot: string | null;
  readonly line: string | null;
}

export function parseReply(content: string): Reply {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) return { shot: null, line: null };
  try {
    const v = JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
    const field = (k: string): string | null => (typeof v[k] === "string" ? (v[k] as string) : null);
    return { shot: field("shot"), line: field("line") };
  } catch {
    return { shot: null, line: null };
  }
}

export function sanitizeLine(raw: string): string | null {
  const line = Array.from(raw)
    .map((c) => (/\s/u.test(c) ? " " : c))
    .filter((c) => !/\p{Cc}/u.test(c))
    .slice(0, MAX_LINE_CHARS)
    .join("")
    .trim();
  return line ? line : null;
}

function lineOf(responseBody: string | null): string | null {
  if (!responseBody) return null;
  const content = extractContent(responseBody);
  const raw = content ? parseReply(content).line : null;
  return raw ? sanitizeLine(raw) : null;
}

export function signedText(model: string, request: string, response: string): string {
  return `${model}:${toHex(sha256(utf8ToBytes(request)))}:${toHex(sha256(utf8ToBytes(response)))}`;
}

interface SignedMove {
  readonly model: string;
  readonly publicKeyHex: string;
  readonly request: string;
  readonly response: string;
  readonly signatureHex: string;
}

export function verifyMove(m: SignedMove): boolean {
  try {
    const sig = fromHex(m.signatureHex);
    const key = fromHex(m.publicKeyHex);
    if (sig.length !== 64 || key.length !== 32) return false;
    return ed25519.verify(sig, utf8ToBytes(signedText(m.model, m.request, m.response)), key);
  } catch {
    return false;
  }
}

export type Check = "ok" | "bad" | "chain";

interface BoundMove {
  readonly move: PublicMove;
  readonly line: string | null;
  readonly check: Check;
}

function shotOf(responseBody: string): number | null {
  const content = extractContent(responseBody);
  const shot = content ? parseReply(content).shot : null;
  const m = shot ? /^\s*([A-Ja-j])(10|[1-9])\s*$/.exec(shot) : null;
  return m ? (Number(m[2]) - 1) * 10 + ((m[1] as string).toUpperCase().charCodeAt(0) - 65) : null;
}

export type ModelKeys = ReadonlyMap<string, string>;

export function modelOfRequest(request: string | null): string | null {
  if (!request) return null;
  try {
    const m = (JSON.parse(request) as { model?: unknown }).model;
    return typeof m === "string" ? m : null;
  } catch {
    return null;
  }
}

interface KeyViewer {
  view<T>(method: string, args?: object): Promise<T>;
}

export async function loadModelKeys(viewer: KeyViewer, moves: readonly PublicMove[], known: ModelKeys = new Map()): Promise<Map<string, string>> {
  const keys = new Map(known);
  const current = await viewer.view<ModelView | null>("model").catch(() => null);
  if (current) keys.set(current.model, current.public_key);
  const missing = [...new Set(moves.map((m) => modelOfRequest(m.request)).filter((n): n is string => n !== null && !keys.has(n)))];
  for (const name of missing) {
    const key = await viewer.view<string | null>("model_key_of", { model: name }).catch(() => null);
    if (key) keys.set(name, key);
  }
  return keys;
}

export function bindMoves(
  moves: readonly PublicMove[],
  nauarchShots: readonly ShotView[],
  gameId: number,
  keys: ModelKeys | null,
): BoundMove[] {
  const modelShots = nauarchShots.filter((s) => s.source === "Model" || s.source === "ModelFallback");
  let k = 0;
  return moves
    .filter((m) => m.tx && !m.error)
    .map((m) => {
      const line = lineOf(m.response);
      const shot = m.kind === "Shot" && m.request && m.response ? modelShots[k++] : undefined;
      if (!m.request || !m.response || !m.signature || !keys) return { move: m, line, check: "chain" as const };
      const name = modelOfRequest(m.request);
      const key = name ? keys.get(name) : undefined;
      const sigOk = name !== null && key !== undefined && verifyMove({ model: name, publicKeyHex: key, request: m.request, response: m.response, signatureHex: m.signature });
      const sameGame = m.request.includes(`Battle #${gameId}.`);
      const sameShot = m.kind !== "Shot" || (shot !== undefined && (shot.source !== "Model" || shotOf(m.response) === shot.index));
      return { move: m, line, check: sigOk && sameGame && sameShot ? ("ok" as const) : ("bad" as const) };
    });
}
