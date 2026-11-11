import { writeFileSync } from "node:fs";
import { KeyPair } from "near-api-js";

const out = process.argv[2];
if (!out) {
  console.error("usage: keygen <file for the secret key>");
  process.exit(1);
}
const kp = KeyPair.fromRandom("ed25519");
writeFileSync(out, `${kp.toString()}\n`, { mode: 0o600, flag: "wx" });
console.log(kp.getPublicKey().toString());
