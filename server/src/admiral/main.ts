import { bindLineageSoon } from "../lib/lineage.js";
import pino from "pino";
import { admiralConfig } from "../lib/config.js";
import { Store } from "../lib/db.js";
import { blockHeight, CallerPool, NearCaller, NearViewer, provider } from "../lib/near.js";
import { NearAiClient } from "../lib/nearai.js";
import { Vault } from "../lib/vault.js";
import { Admiral } from "./admiral.js";

const CALL_TIMEOUT_MS = 20_000;

const log = pino({ name: "brinewar-admiral" });
const config = admiralConfig(process.env);
const rpc = provider(config.rpcUrl);
const reads = rpc;
const store = new Store(config.dbPath);
const model = config.nearAiKey
  ? new NearAiClient({
      baseUrl: config.nearAiUrl,
      apiKey: config.nearAiKey,
      fetch,
      timeoutMs: config.modelTimeoutMs,
      signatureRetries: 30,
      signatureDelayMs: 250,
      now: Date.now,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    })
  : null;
if (!model) log.warn("NEAR_AI_API_KEY is empty: the Nauarch plays deterministic moves only");

const admiral = new Admiral({
  viewer: new NearViewer(reads, config.contract, 15_000),
  caller: new CallerPool(config.admiralKeys.map((key) => new NearCaller(config.admiral, rpc, key, config.contract, CALL_TIMEOUT_MS))),
  store,
  vault: new Vault(config.encKey),
  model,
  log,
  height: () => blockHeight(reads, 15_000),
  modelTimeoutMs: config.modelTimeoutMs,
  shotBudgetMs: config.shotBudgetMs,
  maxFarewellTries: 3,
  cooldownMs: 1500,
});

let running = true;
const stop = (): void => {
  running = false;
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

await bindLineageSoon(store, new NearViewer(reads, config.contract, 15_000), config.contract, log);
log.info({ contract: config.contract, admiral: config.admiral, model: model !== null }, "the Nauarch takes the helm");
const SLOW_TICK_MS = 2000;
const IDLE_TICK_MS = 1000;
const ACTIVE_TICK_MS = 100;
while (running) {
  const started = Date.now();
  let active = true;
  try {
    active = await admiral.tick();
  } catch (err) {
    active = false;
    log.warn({ err: err instanceof Error ? err.message : String(err), ms: Date.now() - started }, "tick failed");
  }
  const took = Date.now() - started;
  if (took > SLOW_TICK_MS) log.warn({ ms: took }, "slow tick");
  await new Promise((r) => setTimeout(r, active ? Math.min(config.tickMs, ACTIVE_TICK_MS) : Math.max(config.tickMs, IDLE_TICK_MS)));
}
store.close();
