import { bindLineageSoon } from "../lib/lineage.js";
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
await bindLineageSoon(store, viewer, config.contract, log);
const sponsor = new NearCaller(config.sponsor, rpc, config.sponsorKey, config.contract, 60_000);
const balanceOf = async (accountId: string): Promise<bigint> => BigInt((await reads.viewAccount({ accountId, blockQuery: { finality: "optimistic" } })).amount);
const LIVE_MS = 4000;
const app = await buildApp({ viewer, sponsor, store, log, guestsPerIpHour: config.guestsPerIpHour, guestsPerIpDay: config.guestsPerIpDay, guestsPerDay: config.guestsPerDay, trustProxy: config.trustProxy, balanceOf, refuelBelow: config.refuelBelowYocto, sampledAt: () => sampledAt, sampleMs: config.sampleMs, liveMs: LIVE_MS });

let sampledAt: number | null = null;
let sampleFailures = 0;
const loop = async (): Promise<void> => {
  try {
    await sample(viewer, store, () => blockHeight(reads, 15_000));
    sampledAt = Date.now();
    sampleFailures = 0;
  } catch (err) {
    sampleFailures += 1;
    const entry = { err: err instanceof Error ? err.message : String(err), failures: sampleFailures };
    if (sampleFailures >= 3) log.error(entry, "sampler keeps failing");
    else log.warn(entry, "sample failed");
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
