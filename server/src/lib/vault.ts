import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

export class Vault {
  readonly #key: Buffer;

  constructor(hexKey: string) {
    if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) throw new Error("BOARD_ENC_KEY must be 32 bytes of hex");
    this.#key = Buffer.from(hexKey, "hex");
  }

  seal(plain: string, aad: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.#key, iv);
    cipher.setAAD(Buffer.from(aad));
    const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
  }

  open(sealed: string, aad: string): string {
    const raw = Buffer.from(sealed, "base64");
    const decipher = createDecipheriv(ALGO, this.#key, raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  }
}
