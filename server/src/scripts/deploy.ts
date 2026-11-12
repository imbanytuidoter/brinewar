import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Account, actions, KeyPairSigner, teraToGas, type KeyPairString } from "near-api-js";
import { resultFromResponse, provider } from "../lib/near.js";

interface DeployConfig {
  contract: string;
  init: Record<string, unknown>;
  model: { name: string; attestation_url: string };
}

const INIT_GAS_TGAS = 30;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const cfg = JSON.parse(readFileSync(need("DEPLOY_CONFIG"), "utf8")) as DeployConfig;
const rpc = provider(need("NEAR_RPC_URL"));
const secret = readFileSync(need("DEPLOYER_KEY_FILE"), "utf8").trim() as KeyPairString;
const owner = new Account(cfg.contract, rpc, KeyPairSigner.fromSecretKey(secret));

async function send(label: string, acts: ReturnType<typeof actions.functionCall>[]): Promise<void> {
  const resp = await owner.signAndSendTransaction({ receiverId: cfg.contract, actions: acts, waitUntil: "FINAL", throwOnFailure: false });
  const r = resultFromResponse(resp);
  console.log(JSON.stringify({ step: label, ok: r.ok, tx: r.txHash, error: r.error ?? null }));
  if (!r.ok) process.exit(1);
}

async function attestedKey(): Promise<string> {
  const nonce = randomBytes(32).toString("hex");
  const url = `${cfg.model.attestation_url}?model=${encodeURIComponent(cfg.model.name)}&signing_algo=ed25519&nonce=${nonce}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`attestation answered ${res.status}`);
  const body = (await res.json()) as { model_attestations?: Array<{ model_name?: string; signing_public_key?: string; request_nonce?: string; intel_quote?: string; nvidia_payload?: unknown }> };
  const a = body.model_attestations?.find((m) => m.model_name === cfg.model.name);
  if (!a?.signing_public_key || !/^[0-9a-f]{64}$/.test(a.signing_public_key)) throw new Error("no ed25519 key for the model in the attestation");
  if (a.request_nonce !== nonce) throw new Error("attestation is not fresh: nonce mismatch");
  if (!a.intel_quote || !a.nvidia_payload) throw new Error("attestation lacks the TDX quote or the GPU evidence");
  return a.signing_public_key;
}

const step = process.argv[2];
if (step === "deploy") {
  const wasm = readFileSync(need("WASM_PATH"));
  await send("deploy+new", [actions.deployContract(wasm), actions.functionCall("new", cfg.init, teraToGas(INIT_GAS_TGAS), 0n)]);
} else if (step === "set-model") {
  const key = await attestedKey();
  console.log(JSON.stringify({ step: "attestation", model: cfg.model.name, key }));
  await send("set_model", [actions.functionCall("set_model", { model: cfg.model.name, public_key_hex: key }, teraToGas(INIT_GAS_TGAS), 0n)]);
} else {
  throw new Error("usage: deploy.ts deploy | set-model");
}
