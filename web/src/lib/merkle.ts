import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

export const CELLS = 100;
export const DEPTH = 7;
export const LEAVES = 1 << DEPTH;

export type Hash = Uint8Array;

const ZERO: Hash = new Uint8Array(32);

export function sha256(...parts: Uint8Array[]): Hash {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    buf.set(p, at);
    at += p.length;
  }
  return nobleSha256(buf);
}

export function leafHash(index: number, cell: number, salt: Hash): Hash {
  return sha256(Uint8Array.of(index, cell), salt);
}

export function toHex(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) throw new Error("invalid hex");
  return hexToBytes(clean);
}

export interface Tree {
  readonly root: Hash;
  proof(index: number): Hash[];
}

export function buildTree(cells: readonly number[], salts: readonly Hash[]): Tree {
  if (cells.length !== CELLS || salts.length !== CELLS) throw new Error("board must have 100 cells and salts");
  const levels: Hash[][] = [];
  let level: Hash[] = Array.from({ length: LEAVES }, (_, i) => (i < CELLS ? leafHash(i, cells[i] as number, salts[i] as Hash) : ZERO));
  levels.push(level);
  while (level.length > 1) {
    const next: Hash[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha256(level[i] as Hash, level[i + 1] as Hash));
    level = next;
    levels.push(level);
  }
  return {
    root: level[0] as Hash,
    proof(index: number): Hash[] {
      if (!Number.isInteger(index) || index < 0 || index >= CELLS) throw new Error("index out of board");
      let pos = index;
      return levels.slice(0, DEPTH).map((lv) => {
        const sibling = lv[pos ^ 1] as Hash;
        pos >>= 1;
        return sibling;
      });
    },
  };
}

export function rootFromProof(index: number, cell: number, salt: Hash, proof: readonly Hash[]): Hash {
  if (proof.length !== DEPTH) throw new Error("proof must have 7 hashes");
  let acc = leafHash(index, cell, salt);
  let pos = index;
  for (const sibling of proof) {
    acc = pos % 2 === 0 ? sha256(acc, sibling) : sha256(sibling, acc);
    pos >>= 1;
  }
  return acc;
}
