import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

function findBinary(): string {
  const env = process.env.NEAR_SANDBOX_BIN;
  if (env) return env;
  const build = join(ROOT, "contracts/sandbox/target/debug/build");
  for (const dir of existsSync(build) ? readdirSync(build) : []) {
    if (!dir.startsWith("near-sandbox-")) continue;
    const base = join(build, dir, "out/.near");
    if (!existsSync(base)) continue;
    for (const v of readdirSync(base)) {
      const bin = join(base, v, "near-sandbox");
      if (existsSync(bin)) return bin;
    }
  }
  throw new Error("near-sandbox binary not found: run scripts/gas.sh once or set NEAR_SANDBOX_BIN");
}

function needsDocker(bin: string): boolean {
  const out = spawnSync("ldd", [bin], { encoding: "utf8" });
  return `${out.stdout}${out.stderr}`.includes("not found");
}

export interface Sandbox {
  readonly rpcUrl: string;
  readonly rootId: string;
  readonly rootKey: string;
  stop(): void;
}

export async function startSandbox(): Promise<Sandbox> {
  const bin = findBinary();
  const docker = needsDocker(bin);
  const wrapper = join(ROOT, "scripts/near-sandbox-docker.sh");
  const cmd = docker ? wrapper : bin;
  const env = docker ? { ...process.env, NEAR_SANDBOX_REAL_BIN: bin } : process.env;
  const home = mkdtempSync(join(tmpdir(), "brinewar-sandbox-"));
  execFileSync(cmd, ["--home", home, "init"], { env, stdio: "ignore" });
  const port = 33000 + Math.floor(Math.random() * 2000);
  const configPath = join(home, "config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as { rpc: { addr: string }; network: { addr: string } };
  config.rpc.addr = `127.0.0.1:${port}`;
  config.network.addr = `127.0.0.1:${port + 1}`;
  writeFileSync(configPath, JSON.stringify(config));
  const child: ChildProcess = spawn(cmd, ["--home", home, "run"], { env, stdio: "ignore", detached: false });
  const rpcUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${rpcUrl}/status`);
      if (r.ok) break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const key = JSON.parse(readFileSync(join(home, "validator_key.json"), "utf8")) as { account_id: string; secret_key: string };
  return {
    rpcUrl,
    rootId: key.account_id,
    rootKey: key.secret_key,
    stop() {
      child.kill("SIGKILL");
      if (docker) spawnSync("sh", ["-c", "docker ps -q --filter label=brinewar-sandbox=1 | xargs -r docker rm -f"], { stdio: "ignore" });
    },
  };
}

export const WASM = join(ROOT, "contracts/game/target/near/brinewar_game.wasm");
