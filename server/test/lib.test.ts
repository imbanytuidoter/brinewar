import { describe, expect, it } from "vitest";
import { answerArgs, newBoard, revealArgs, rootHex } from "../src/lib/board.js";
import { isLegalFleet, placeFleet, seededRng, ships } from "../src/lib/fleet.js";
import { buildTree, fromHex, rootFromProof, sha256, toHex } from "../src/lib/merkle.js";
import { Vault } from "../src/lib/vault.js";

const LEGAL_A = [0, 1, 2, 3, 20, 21, 22, 26, 27, 28, 40, 41, 44, 45, 48, 49, 60, 62, 64, 66];

function cellsOf(list: number[]): number[] {
  return Array.from({ length: 100 }, (_, i) => (list.includes(i) ? 1 : 0));
}

const vectorSalts = Array.from({ length: 100 }, (_, i) => sha256(Uint8Array.of(1, i)));

describe("merkle", () => {
  it("matches the root the contract tests pin", () => {
    const tree = buildTree(cellsOf(LEGAL_A), vectorSalts);
    expect(toHex(tree.root)).toBe("8ab7b3f47076706dafea77fdc8f17be3a0d5c88ea848b3c3849b9c1d3ff7df48");
  });

  it("proves every cell and rejects a flipped one", () => {
    const cells = cellsOf(LEGAL_A);
    const tree = buildTree(cells, vectorSalts);
    for (let i = 0; i < 100; i++) {
      const root = rootFromProof(i, cells[i] as number, vectorSalts[i] as Uint8Array, tree.proof(i));
      expect(toHex(root)).toBe(toHex(tree.root));
    }
    const forged = rootFromProof(0, 0, vectorSalts[0] as Uint8Array, tree.proof(0));
    expect(toHex(forged)).not.toBe(toHex(tree.root));
  });

  it("rejects bad input", () => {
    expect(() => buildTree([1], vectorSalts)).toThrow();
    expect(() => buildTree(cellsOf(LEGAL_A), vectorSalts).proof(100)).toThrow();
    expect(() => fromHex("zz")).toThrow();
  });
});

describe("fleet", () => {
  it("accepts the reference fleet and rejects touching ships", () => {
    expect(isLegalFleet(cellsOf(LEGAL_A))).toBe(true);
    const touching = cellsOf([...LEGAL_A.filter((c) => c !== 66), 73]);
    expect(isLegalFleet(touching)).toBe(false);
    expect(ships(cellsOf(LEGAL_A))).toHaveLength(10);
  });

  it("places a legal random fleet for many seeds", () => {
    for (let seed = 1; seed <= 200; seed++) expect(isLegalFleet(placeFleet(seededRng(seed)))).toBe(true);
  });

  it("follows a placement weight", () => {
    const west = (c: number) => (c % 10 < 3 ? 50 : 1);
    let westCells = 0;
    for (let seed = 1; seed <= 30; seed++) westCells += placeFleet(seededRng(seed), west).filter((v, i) => v === 1 && i % 10 < 3).length;
    expect(westCells / 30).toBeGreaterThan(9);
  });
});

describe("board args", () => {
  it("builds answer and reveal args the contract expects", () => {
    const board = newBoard(cellsOf(LEGAL_A), vectorSalts);
    const a = answerArgs(board, 7, 3);
    expect(a).toMatchObject({ game_id: 7, index: 3, cell: 1 });
    expect(a.proof).toHaveLength(7);
    expect(a.salt).toMatch(/^[0-9a-f]{64}$/);
    const r = revealArgs(board, 7);
    expect(r.cells).toHaveLength(100);
    expect(r.salts).toHaveLength(100);
    expect(rootHex(board)).toHaveLength(64);
  });
});

describe("vault", () => {
  const key = "11".repeat(32);

  it("round-trips and binds to the game", () => {
    const v = new Vault(key);
    const sealed = v.seal("secret board", "game:1");
    expect(v.open(sealed, "game:1")).toBe("secret board");
    expect(() => v.open(sealed, "game:2")).toThrow();
    expect(() => new Vault(key).open(sealed.slice(0, -4) + "AAAA", "game:1")).toThrow();
  });

  it("rejects a weak key", () => {
    expect(() => new Vault("abcd")).toThrow(/32 bytes/);
  });
});
