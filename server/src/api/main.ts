import pino from "pino";
import { apiConfig } from "../lib/config.js";
import { Store } from "../lib/db.js";
import { blockHeight, NearCaller, NearViewer, provider, readProvider } from "../lib/near.js";
import { buildApp } from "./app.js";
import { sample } from "./sampler.js";

const log = pino({ name: "brinewar-api" });
const config = apiConfig(process.env);
const rpc = provider(config.rpcUrl);
const reads = readProvider(config.rpcUrl);
const store = new Store(config.dbPath);
const viewer = new NearViewer(reads, config.contract, 15_000);
const sponsor = new NearCaller(config.sponsor, rpc, config.sponsorKey, config.contract, 60_000);
const balanceOf = async (accountId: string): Promise<bigint> => BigInt((await reads.viewAccount({ accountId, blockQuery: { finality: "optimistic" } })).amount);
const app = await buildApp({ viewer, sponsor, store, log, guestsPerIpHour: config.guestsPerIpHour, guestsPerDay: config.guestsPerDay, trustProxy: config.trustProxy, balanceOf, refuelBelow: config.refuelBelowYocto });

const loop = async (): Promise<void> => {
  try {
    await sample(viewer, store, () => blockHeight(reads, 15_000));
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "sample failed");
  }
};
await loop();
const timer = setInterval(() => void loop(), config.sampleMs);

const stop = async (): Promise<void> => {
  clearInterval(timer);
  await app.close();
  store.close();
  process.exit(0);
};
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());

await app.listen({ host: config.host, port: config.port });
