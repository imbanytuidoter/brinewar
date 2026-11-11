import { playEnv, playOne, rngFor } from "./play.js";

const env = playEnv(process.env);
const r = await playOne({ ...env, nickname: process.env.NICKNAME ?? "Script_Bot", style: "random", rng: rngFor(env.seed, 1), log: console.log });
console.log(JSON.stringify(r));
