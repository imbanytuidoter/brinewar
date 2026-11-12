import { readFileSync } from "node:fs";
import { Account, actions, KeyPairSigner, teraToGas, type KeyPairString } from "near-api-js";
import { NearViewer, provider, resultFromResponse } from "../lib/near.js";

const STARTERS = ["coral", "ghost"];
const PER_TX = 20;
const MINT_GAS_TGAS = 10;
const VIEW_TIMEOUT_MS = 15_000;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

interface ShipView {
  readonly captain: string;
}

const contract = need("GAME_CONTRACT");
const rpc = provider(need("NEAR_RPC_URL"));
const viewer = new NearViewer(rpc, contract, VIEW_TIMEOUT_MS);
const owner = new Account(contract, rpc, KeyPairSigner.fromSecretKey(readFileSync(need("DEPLOYER_KEY_FILE"), "utf8").trim() as KeyPairString));
const dryRun = process.env.DRY_RUN === "1";
const RETRIES = 6;
const PAUSE_MS = 1500;

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function view<T>(method: string, args: object = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await viewer.view<T>(method, args);
    } catch (err) {
      if (attempt >= RETRIES) throw err;
      await pause(PAUSE_MS * attempt);
    }
  }
}

const { players } = await view<{ players: number }>("config");
const captains = new Set<string>();
for (let id = 1; id <= players; id++) {
  const ship = await view<ShipView | null>("get_ship", { token_id: `ship:${id}` });
  if (ship) captains.add(ship.captain);
}

const grants: Array<{ name: string; receiver: string }> = [];
for (const account of captains) {
  if (!(await view<unknown>("get_player", { account_id: account }))) continue;
  const balances = await view<string[]>("mt_batch_balance_of", { account_id: account, token_ids: STARTERS.map((s) => `skin:${s}`) });
  STARTERS.forEach((name, i) => {
    if (balances[i] === "0") grants.push({ name, receiver: account });
  });
}
console.log(JSON.stringify({ captains: captains.size, grants: grants.length, dryRun }));

for (let i = 0; i < grants.length && !dryRun; i += PER_TX) {
  const batch = grants.slice(i, i + PER_TX);
  const resp = await owner.signAndSendTransaction({
    receiverId: contract,
    actions: batch.map((g) => actions.functionCall("mint_skin", { name: g.name, receiver_id: g.receiver, amount: "1" }, teraToGas(MINT_GAS_TGAS), 0n)),
    waitUntil: "FINAL",
    throwOnFailure: false,
  });
  const r = resultFromResponse(resp);
  console.log(JSON.stringify({ from: i, count: batch.length, ok: r.ok, tx: r.txHash, error: r.error ?? null }));
  if (!r.ok) process.exitCode = 1;
}
