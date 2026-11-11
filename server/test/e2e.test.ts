import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Account, actions, KeyPair, KeyPairSigner, nearToYocto, teraToGas, type KeyPairString } from "near-api-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Admiral } from "../src/admiral/admiral.js";
import { buildApp } from "../src/api/app.js";
import type { GameView, ShotView } from "../src/lib/contract.js";
import { Bot } from "../src/lib/bot.js";
import { Store } from "../src/lib/db.js";
import { seededRng } from "../src/lib/fleet.js";
import { blockHeight, NearCaller, NearViewer, provider } from "../src/lib/near.js";
import { Vault } from "../src/lib/vault.js";
import pino from "pino";
import { FakeModel, silent } from "./fakes.js";
import { startSandbox, WASM, type Sandbox } from "./sandbox.js";

const MODEL = "Qwen/Qwen3.8-27B";
let sb: Sandbox;

async function createAccount(root: Account, id: string, near: `${number}`, extra: ReturnType<typeof actions.functionCall>[] = []): Promise<string> {
  const kp = KeyPair.fromRandom("ed25519");
  await root.signAndSendTransaction({
    receiverId: id,
    actions: [actions.createAccount(), actions.transfer(nearToYocto(near)), actions.addFullAccessKey(kp.getPublicKey()), ...extra],
  });
  return kp.toString();
}

beforeAll(async () => {
  sb = await startSandbox();
}, 120_000);

afterAll(() => sb?.stop());

describe("full game on a local sandbox", () => {
  it("a guest with only a function-call key plays the Nauarch to the end", async () => {
    const rpc = provider(sb.rpcUrl);
    const root = new Account(sb.rootId, rpc, KeyPairSigner.fromSecretKey(sb.rootKey as KeyPairString));
    const contractId = `brinewar.${sb.rootId}`;
    const admiralId = `admiral.${sb.rootId}`;
    const sponsorId = `sponsor.${sb.rootId}`;
    const contractKey = await createAccount(root, contractId, "60");
    const admiralKey = await createAccount(root, admiralId, "20");
    const sponsorKey = await createAccount(root, sponsorId, "20");
    const owner = new Account(contractId, rpc, KeyPairSigner.fromSecretKey(contractKey as KeyPairString));
    const model = new FakeModel({
      model: MODEL,
      reply: (req) => {
        const m = /Battle #(\d+)/.exec(req);
        return `{"shot":"Z9","line":"Battle ${m?.[1]}: the left edge again, Captain?"}`;
      },
    });
    const settings = {
      move_timeout_blocks: 400, max_open_games: 50, blocks_per_day: 100000, min_heat_shots: 10,
      start_gold: "100", base_entry: "10", entry_threshold: "500", bounty_bps: 500, bounty_cap: "25",
      guest_fund: nearToYocto("0.1").toString(), guest_allowance: nearToYocto("0.25").toString(),
      guests_per_day: 100, games_per_day: 20, bounties_per_day: 3, min_heat_boards: 1,
    };
    await owner.signAndSendTransaction({
      receiverId: contractId,
      actions: [
        actions.deployContract(readFileSync(WASM)),
        actions.functionCall("new", { owner: contractId, nauarch: admiralId, registrar: sponsorId, settings, initial_treasury: "1000" }, teraToGas(30), 0n),
        actions.functionCall("set_model", { model: MODEL, public_key_hex: model.publicKeyHex }, teraToGas(30), 0n),
      ],
    });

    const store = new Store(join(mkdtempSync(join(tmpdir(), "bw-e2e-")), "db.sqlite"));
    const viewer = new NearViewer(rpc, contractId, 15_000);
    const admiral = new Admiral({
      viewer, caller: new NearCaller(admiralId, rpc, admiralKey, contractId, 60_000), store,
      vault: new Vault("33".repeat(32)), model, log: process.env.E2E_LOG ? pino({ level: "info" }) : silent, height: () => blockHeight(rpc, 15_000),
      modelTimeoutMs: 10_000, maxFarewellTries: 2, cooldownMs: 800,
    });
    let running = true;
    const loop = (async () => {
      while (running) {
        await admiral.tick().catch((e: unknown) => console.log("TICK", e instanceof Error ? e.stack : String(e)));
        await new Promise((r) => setTimeout(r, 400));
      }
    })();

    const app = await buildApp({ viewer, sponsor: new NearCaller(sponsorId, rpc, sponsorKey, contractId, 60_000), store, log: silent, guestsPerIpHour: 5, guestsPerDay: 50, trustProxy: 0 });
    const guestKey = KeyPair.fromRandom("ed25519");
    const res = await app.inject({ method: "POST", url: "/api/guest", payload: { publicKey: guestKey.getPublicKey().toString(), nickname: "Ahab" } });
    expect(res.statusCode).toBe(200);
    const { accountId } = res.json() as { accountId: string };
    const keys = await rpc.viewAccessKeyList({ accountId });
    expect(keys.keys).toHaveLength(1);
    expect(JSON.stringify(keys.keys[0]?.access_key.permission)).toContain("FunctionCall");

    const bot = new Bot({ accountId, secretKey: guestKey.toString(), provider: rpc, contractId, viewer, rng: seededRng(11), pollMs: 400, maxMinutes: Number(process.env.E2E_MINUTES ?? 12) });
    const watch = setInterval(() => {
      void viewer.view<GameView>("get_game", { game_id: 0 }).then((g) => console.log("STATE", JSON.stringify(g)), (e: unknown) => console.log("STATE error", String(e)));
    }, 20_000);
    const final = await bot.play().finally(() => clearInterval(watch));
    for (let i = 0; i < 60; i++) {
      const g = await viewer.view<GameView>("get_game", { game_id: final.id });
      if (g.revealed_b && g.farewell_said) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    running = false;
    await loop;

    const g = await viewer.view<GameView>("get_game", { game_id: final.id });
    expect(g.status).toBe("Finished");
    expect(g.revealed_a && g.revealed_b && g.farewell_said).toBe(true);
    const history = await viewer.view<ShotView[]>("get_history", { game_id: final.id });
    const nauarchShots = history.filter((s) => s.by === admiralId);
    expect(nauarchShots.length).toBeGreaterThan(10);
    expect(nauarchShots.every((s) => s.source === "ModelFallback")).toBe(true);
    const moves = store.aiMoves(final.id);
    expect(moves.filter((m) => m.source === "model" && m.error === null).length).toBe(nauarchShots.length + 1);
    expect(model.requests.every((r) => r.includes(`Battle #${final.id}.`))).toBe(true);
    expect(model.requests.some((r) => r.includes("Captain") || r.includes("Ahab"))).toBe(true);
    expect(store.answers(final.id).length).toBe(history.filter((s) => s.by === accountId).length);
    const proofs = await app.inject({ url: `/api/game/${final.id}/proofs` });
    expect(proofs.json().nauarch.reveal.cells).toHaveLength(100);
    const player = await viewer.view<{ games_vs_nauarch: number }>("get_player", { account_id: accountId });
    expect(player.games_vs_nauarch).toBe(1);
    await app.close();
    store.close();
  }, 900_000);
});
