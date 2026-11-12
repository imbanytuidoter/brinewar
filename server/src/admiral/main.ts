import pino from "pino";
import { admiralConfig } from "../lib/config.js";
import { Store } from "../lib/db.js";
import { blockHeight, CallerPool, NearCaller, NearViewer, provider } from "../lib/near.js";
import { NearAiClient } from "../lib/nearai.js";
import { Vault } from "../lib/vault.js";
import { Admiral } from "./admiral.js";

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
  caller: new CallerPool(config.admiralKeys.map((key) => new NearCaller(config.admiral, rpc, key, config.contract, 60_000))),
  store,
  vault: new Vault(config.encKey),
  model,
  log,
  height: () => blockHeight(reads, 15_000),
  modelTimeoutMs: config.modelTimeoutMs,
  maxFarewellTries: 3,
  cooldownMs: 1500,
});

let running = true;
const stop = (): void => {
  running = false;
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

log.info({ contract: config.contract, admiral: config.admiral, model: model !== null }, "the Nauarch takes the helm");
while (running) {
  try {
    await admiral.tick();
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "tick failed");
  }
  await new Promise((r) => setTimeout(r, config.tickMs));
}
store.close();
