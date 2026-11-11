import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Account, actions, KeyPair, KeyPairSigner, nearToYocto, teraToGas, type KeyPairString } from "near-api-js";
import { it } from "vitest";
import { Admiral } from "../src/admiral/admiral.js";
import { buildApp } from "../src/api/app.js";
import { Store } from "../src/lib/db.js";
import { blockHeight, NearCaller, NearViewer, provider } from "../src/lib/near.js";
import { Vault } from "../src/lib/vault.js";
import pino from "pino";
import { FakeModel, silent } from "./fakes.js";
import { startSandbox, WASM } from "./sandbox.js";

const MODEL = "Qwen/Qwen3.8-27B";
const LINES = [
  "The left edge again, Captain? Predictable.",
  "You fire like a merchant. I fire like an admiral.",
  "Steady now. The sea remembers every miss.",
  "A fine guess. Guesses do not sink fleets.",
  "I have charted your habits, Captain.",
];

async function createAccount(root: Account, id: string, near: `${number}`): Promise<string> {
  const kp = KeyPair.fromRandom("ed25519");
  await root.signAndSendTransaction({ receiverId: id, actions: [actions.createAccount(), actions.transfer(nearToYocto(near)), actions.addFullAccessKey(kp.getPublicKey())] });
  return kp.toString();
}

it("runs a local stack for the web app until killed", async () => {
  const sb = await startSandbox();
  process.on("SIGTERM", () => sb.stop());
  process.on("SIGINT", () => sb.stop());
  const rpc = provider(sb.rpcUrl);
  const root = new Account(sb.rootId, rpc, KeyPairSigner.fromSecretKey(sb.rootKey as KeyPairString));
  const contractId = `brinewar.${sb.rootId}`;
  const admiralId = `admiral.${sb.rootId}`;
  const sponsorId = `sponsor.${sb.rootId}`;
  const contractKey = await createAccount(root, contractId, "60");
  const admiralKey = await createAccount(root, admiralId, "20");
  const sponsorKey = await createAccount(root, sponsorId, "20");
  let n = 0;
  const model = new FakeModel({
    model: MODEL,
    reply: () => {
      n += 1;
      const cell = `${"ABCDEFGHIJ"[(n * 7) % 10]}${((n * 3) % 10) + 1}`;
      return JSON.stringify({ shot: cell, line: LINES[n % LINES.length] });
    },
    delayMs: Number(process.env.DEV_MODEL_DELAY_MS ?? 1500),
  });
  const settings = {
    move_timeout_blocks: 600, max_open_games: 50, blocks_per_day: 100000, min_heat_shots: 10,
    start_gold: "100", base_entry: "10", entry_threshold: "500", bounty_bps: 500, bounty_cap: "25",
    guest_fund: nearToYocto("0.1").toString(), guest_allowance: nearToYocto("0.25").toString(),
    guests_per_day: 100, games_per_day: 20, bounties_per_day: 3, min_heat_boards: 1,
  };
  const owner = new Account(contractId, rpc, KeyPairSigner.fromSecretKey(contractKey as KeyPairString));
  await owner.signAndSendTransaction({
    receiverId: contractId,
    actions: [
      actions.deployContract(readFileSync(WASM)),
      actions.functionCall("new", { owner: contractId, nauarch: admiralId, registrar: sponsorId, settings, initial_treasury: "1000" }, teraToGas(30), 0n),
      actions.functionCall("set_model", { model: MODEL, public_key_hex: model.publicKeyHex }, teraToGas(30), 0n),
    ],
  });
  const dir = mkdtempSync(join(tmpdir(), "bw-dev-"));
  const store = new Store(join(dir, "db.sqlite"));
  const viewer = new NearViewer(rpc, contractId, 15_000);
  const log = process.env.DEV_LOG ? pino({ level: "info" }) : silent;
  const admiral = new Admiral({
    viewer, caller: new NearCaller(admiralId, rpc, admiralKey, contractId, 60_000), store, vault: new Vault(randomBytes(32).toString("hex")), model, log,
    height: () => blockHeight(rpc, 15_000), modelTimeoutMs: 10_000, maxFarewellTries: 2, cooldownMs: 800,
  });
  const app = await buildApp({ viewer, sponsor: new NearCaller(sponsorId, rpc, sponsorKey, contractId, 60_000), store, log, guestsPerIpHour: 100, guestsPerDay: 100, trustProxy: 0 });
  const port = Number(process.env.DEV_API_PORT ?? 8787);
  await app.listen({ host: "127.0.0.1", port });
  const out = process.env.DEV_STACK_FILE ?? join(dir, "devstack.json");
  writeFileSync(out, JSON.stringify({ rpcUrl: sb.rpcUrl, contractId, apiUrl: `http://127.0.0.1:${port}` }), { mode: 0o600 });
  console.log(`DEVSTACK READY ${out}`);
  for (;;) {
    await admiral.tick().catch((e: unknown) => console.log("TICK", e instanceof Error ? e.message : String(e)));
    await new Promise((r) => setTimeout(r, 400));
  }
}, 24 * 3600_000);
