import { int } from "../lib/config.js";
import { playEnv, playOne, rngFor, type Style } from "./play.js";

const env = playEnv(process.env);
const count = int(process.env, "SEED_GAMES", 30, 1);
const parallel = int(process.env, "SEED_PARALLEL", 3, 1);
const first = int(process.env, "SEED_FIRST", 1, 1);
const styles: Style[] = ["north-west", "north-west", "edges", "edges", "random", "centre"];

let next = 0;
const results: Array<{ nickname: string; style: Style; gameId?: number; error?: string }> = [];
async function worker(): Promise<void> {
  while (next < count) {
    const k = next++;
    const style = styles[k % styles.length] as Style;
    const n = first + k;
    const nickname = `Seed_${String(n).padStart(2, "0")}`;
    try {
      const r = await playOne({ ...env, nickname, style, rng: rngFor(env.seed, n), log: console.log });
      results.push({ nickname, style, gameId: r.gameId });
    } catch (err) {
      results.push({ nickname, style, error: err instanceof Error ? err.message : String(err) });
      console.error(`${nickname} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
await Promise.all(Array.from({ length: parallel }, worker));
console.log(JSON.stringify({ played: results.filter((r) => r.gameId !== undefined).length, failed: results.filter((r) => r.error).length, results }, null, 2));
