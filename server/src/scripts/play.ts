import { KeyPair } from "near-api-js";
import { Bot } from "../lib/bot.js";
import { accountId, int, url } from "../lib/config.js";
import { cryptoRng, seededRng, type Rng } from "../lib/fleet.js";
import { NearViewer, provider } from "../lib/near.js";

export type Style = "random" | "north-west" | "edges" | "centre";

export function weightFor(style: Style): (cell: number) => number {
  const x = (c: number) => c % 10;
  const y = (c: number) => Math.floor(c / 10);
  switch (style) {
    case "north-west":
      return (c) => (x(c) < 5 && y(c) < 5 ? 12 : 1);
    case "edges":
      return (c) => (x(c) === 0 || x(c) === 9 || y(c) === 0 || y(c) === 9 ? 10 : 1);
    case "centre":
      return (c) => (x(c) >= 3 && x(c) <= 6 && y(c) >= 3 && y(c) <= 6 ? 10 : 1);
    case "random":
      return () => 1;
  }
}

export interface PlayOptions {
  apiUrl: string;
  rpcUrl: string;
  contract: string;
  nickname: string;
  style: Style;
  rng?: Rng;
  log: (msg: string) => void;
}

export async function playOne(o: PlayOptions): Promise<{ accountId: string; gameId: number; winner: string | null }> {
  const key = KeyPair.fromRandom("ed25519");
  const res = await fetch(`${o.apiUrl}/api/guest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ publicKey: key.getPublicKey().toString(), nickname: o.nickname }),
  });
  if (!res.ok) throw new Error(`guest failed: HTTP ${res.status} ${await res.text()}`);
  const { accountId: id } = (await res.json()) as { accountId: string };
  const rpc = provider(o.rpcUrl);
  const bot = new Bot({
    accountId: id,
    secretKey: key.toString(),
    provider: rpc,
    contractId: o.contract,
    viewer: new NearViewer(rpc, o.contract, 15_000),
    rng: o.rng ?? cryptoRng(),
    weight: weightFor(o.style),
  });
  const g = await bot.play();
  o.log(`${o.nickname} (${o.style}) game ${g.id}: winner ${g.winner ?? "none"}`);
  return { accountId: id, gameId: g.id, winner: g.winner };
}

export function playEnv(env: Record<string, string | undefined>) {
  return {
    apiUrl: url(env, "API_URL", "http://127.0.0.1:8791"),
    rpcUrl: url(env, "NEAR_RPC_URL", "https://rpc.testnet.fastnear.com"),
    contract: accountId(env, "GAME_CONTRACT"),
    seed: int(env, "SEED", 0),
  };
}

export function rngFor(seed: number, k: number): Rng {
  return seed ? seededRng(seed * 1000 + k) : cryptoRng();
}
