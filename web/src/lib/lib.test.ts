import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { answerArgs, decodeBoard, encodeBoard, newBoard, revealArgs, rootHex } from "./board";
import { isLegalFleet, placeFleet, seededRng, ships } from "./fleet";
import { buildTree, rootFromProof, toHex } from "./merkle";
import { extractContent, parseReply, sanitizeLine, signedText, verifyMove } from "./nauarch";

const LEGAL_A = [0, 1, 2, 3, 20, 21, 22, 26, 27, 28, 40, 41, 44, 45, 48, 49, 60, 62, 64, 66];
const cellsOf = (list: number[]): number[] => Array.from({ length: 100 }, (_, i) => (list.includes(i) ? 1 : 0));
const vectorSalts = Array.from({ length: 100 }, (_, i) => sha256(Uint8Array.of(1, i)));

describe("merkle", () => {
  it("matches the root pinned by the contract and server tests", () => {
    expect(toHex(buildTree(cellsOf(LEGAL_A), vectorSalts).root)).toBe("8ab7b3f47076706dafea77fdc8f17be3a0d5c88ea848b3c3849b9c1d3ff7df48");
  });

  it("proves every cell back to the root", () => {
    const cells = cellsOf(LEGAL_A);
    const tree = buildTree(cells, vectorSalts);
    for (const i of [0, 37, 99]) {
      expect(toHex(rootFromProof(i, cells[i] as number, vectorSalts[i] as Uint8Array, tree.proof(i)))).toBe(toHex(tree.root));
    }
  });

  it("rejects boards of the wrong size and out of range proofs", () => {
    expect(() => buildTree([1, 0], vectorSalts)).toThrow();
    expect(() => buildTree(cellsOf(LEGAL_A), vectorSalts).proof(100)).toThrow();
  });
});

describe("fleet", () => {
  it("places legal fleets for many seeds", () => {
    for (let seed = 1; seed < 40; seed++) {
      const cells = placeFleet(seededRng(seed));
      expect(isLegalFleet(cells)).toBe(true);
      expect(ships(cells).map((s) => s.length).sort()).toEqual([1, 1, 1, 1, 2, 2, 2, 3, 3, 4]);
    }
  });

  it("rejects touching and bent ships", () => {
    expect(isLegalFleet(cellsOf(LEGAL_A))).toBe(true);
    expect(isLegalFleet(cellsOf([...LEGAL_A.slice(0, 19), 11]))).toBe(false);
    expect(isLegalFleet(cellsOf(LEGAL_A.slice(1)))).toBe(false);
  });
});

describe("board", () => {
  it("builds contract arguments for answer and reveal", () => {
    const board = newBoard(cellsOf(LEGAL_A), vectorSalts);
    expect(rootHex(board)).toBe("8ab7b3f47076706dafea77fdc8f17be3a0d5c88ea848b3c3849b9c1d3ff7df48");
    const a = answerArgs(board, 7, 20);
    expect(a).toMatchObject({ game_id: 7, index: 20, cell: 1, salt: toHex(vectorSalts[20] as Uint8Array) });
    expect(a.proof).toHaveLength(7);
    const r = revealArgs(board, 7);
    expect(r.cells).toHaveLength(100);
    expect(r.salts).toHaveLength(100);
  });

  it("round-trips through storage and refuses tampered data", () => {
    const board = newBoard(placeFleet(seededRng(3)));
    const back = decodeBoard(encodeBoard(board));
    expect(back && rootHex(back)).toBe(rootHex(board));
    expect(decodeBoard("{}")).toBeNull();
    expect(decodeBoard("not json")).toBeNull();
    const bad = JSON.parse(encodeBoard(board)) as { cells: number[] };
    bad.cells[0] = 7;
    expect(decodeBoard(JSON.stringify(bad))).toBeNull();
  });

  it("uses fresh random salts", () => {
    const cells = placeFleet(seededRng(5));
    expect(rootHex(newBoard(cells))).not.toBe(rootHex(newBoard(cells)));
  });
});

describe("nauarch replies", () => {
  const body = (content: string): string => JSON.stringify({ choices: [{ message: { content } }] });

  it("extracts the line and shot like the contract", () => {
    const content = extractContent(body('Sure!\n```json\n{"shot":"C3","line":"Steady."}\n```'));
    expect(content && parseReply(content)).toEqual({ shot: "C3", line: "Steady." });
    expect(extractContent("nope")).toBeNull();
    expect(parseReply("no json")).toEqual({ shot: null, line: null });
  });

  it("cleans and caps the line", () => {
    expect(sanitizeLine("  a\nb\u0007c ")).toBe("a bc");
    expect(sanitizeLine("   ")).toBeNull();
    expect([...(sanitizeLine("x".repeat(500)) ?? "")]).toHaveLength(140);
  });

  it("verifies the model signature over the signed text", () => {
    const secret = ed25519.utils.randomSecretKey();
    const pub = bytesToHex(ed25519.getPublicKey(secret));
    const request = '{"model":"m"}';
    const response = body('{"shot":"A1","line":"Hello."}');
    const text = signedText("m", request, response);
    expect(text).toBe(`m:${bytesToHex(sha256(utf8ToBytes(request)))}:${bytesToHex(sha256(utf8ToBytes(response)))}`);
    const sig = bytesToHex(ed25519.sign(utf8ToBytes(text), secret));
    expect(verifyMove({ model: "m", publicKeyHex: pub, request, response, signatureHex: sig })).toBe(true);
    expect(verifyMove({ model: "m", publicKeyHex: pub, request, response: response + " ", signatureHex: sig })).toBe(false);
    expect(verifyMove({ model: "m", publicKeyHex: pub, request, response, signatureHex: "zz" })).toBe(false);
  });
});
