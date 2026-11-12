import { KeyPair, type KeyPairString } from "near-api-js";
import type { Viewer } from "./chain";
import type { KeyValue } from "./storage";

const SIGNER_SLOT = "brinewar.signer.v1";
const ACCOUNT = "brinewar.account.v1";

export interface Guest {
  readonly accountId: string;
  readonly secretKey: string;
  readonly publicKey: string;
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function loadOrCreateKey(store: KeyValue): { secretKey: string; publicKey: string } {
  const saved = store.get(SIGNER_SLOT);
  if (saved) {
    try {
      const kp = KeyPair.fromString(saved as KeyPairString);
      return { secretKey: saved, publicKey: kp.getPublicKey().toString() };
    } catch {
      store.remove(SIGNER_SLOT);
      store.remove(ACCOUNT);
    }
  }
  const kp = KeyPair.fromRandom("ed25519");
  const secretKey = kp.toString();
  store.set(SIGNER_SLOT, secretKey);
  return { secretKey, publicKey: kp.getPublicKey().toString() };
}

export function storedAccount(store: KeyValue): string | null {
  try {
    const v = JSON.parse(store.get(ACCOUNT) ?? "null") as { accountId?: unknown } | null;
    return typeof v?.accountId === "string" ? v.accountId : null;
  } catch {
    return null;
  }
}

export function validGuestAccount(accountId: unknown, contractId: string): accountId is string {
  return typeof accountId === "string" && new RegExp(`^p-[0-9a-f]{16}\\.${contractId.replace(/\./g, "\\.")}$`).test(accountId);
}

export class GuestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export async function ensureGuest(store: KeyValue, apiUrl: string, contractId: string, viewer: Viewer, fetchFn: Fetch = fetch): Promise<Guest> {
  const { secretKey, publicKey } = loadOrCreateKey(store);
  const cached = store.get(ACCOUNT);
  if (cached) {
    try {
      const v = JSON.parse(cached) as { publicKey?: unknown; accountId?: unknown };
      if (v.publicKey === publicKey && validGuestAccount(v.accountId, contractId)) return { accountId: v.accountId, secretKey, publicKey };
    } catch {
      store.remove(ACCOUNT);
    }
  }
  let res: Response;
  try {
    res = await fetchFn(`${apiUrl}/api/guest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publicKey }),
    });
  } catch {
    throw new GuestError("The harbour is unreachable. Check your connection and try again.", true);
  }
  const body = (await res.json().catch(() => ({}))) as { accountId?: unknown; error?: unknown };
  if (!res.ok) {
    const message = typeof body.error === "string" && body.error.length < 200 ? body.error : "Could not sign you on as a captain.";
    throw new GuestError(message, res.status >= 500 || res.status === 429);
  }
  if (!validGuestAccount(body.accountId, contractId)) throw new GuestError("The harbour answered with an unexpected account.", false);
  const expected = await viewer.view<string>("guest_account_for", { public_key: publicKey }).catch(() => null);
  if (expected === null) throw new GuestError("Could not reach the chain to check your account.", true);
  if (expected !== body.accountId) throw new GuestError("The harbour answered with an account that is not yours.", false);
  store.set(ACCOUNT, JSON.stringify({ publicKey, accountId: body.accountId }));
  return { accountId: body.accountId, secretKey, publicKey };
}

export function boardKey(accountId: string, gameId: number | "next"): string {
  return `brinewar.board.${accountId}.${gameId}`;
}

export async function refuelGuest(apiUrl: string, publicKey: string, fetchFn: Fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchFn(`${apiUrl}/api/guest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publicKey }),
      signal: AbortSignal.timeout(90_000),
    });
    const body = (await res.json().catch(() => ({}))) as { refueled?: unknown };
    return res.ok && body.refueled === true;
  } catch {
    return false;
  }
}
