import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { answerArgs, newBoard, revealArgs } from "@/lib/board";
import type { GameView, ShotView } from "@/lib/contract";
import type { NauarchEvidence } from "@/lib/proofs";
import { cellName } from "@/lib/utils";
import { placeFleet, seededRng } from "@/lib/fleet";
import { toHex } from "@/lib/merkle";
import { signedText } from "@/lib/nauarch";
import { buildReport } from "./verify";

const ME = "p-0011223344556677.brinewar.testnet";
const NAU = "admiral.brinewar.testnet";

describe("verify report", () => {
  const his = newBoard(placeFleet(seededRng(11)));
  const ship = his.cells.indexOf(1);
  const water = his.cells.indexOf(0);
  const secret = ed25519.utils.randomSecretKey();
  const model = { model: "m", public_key: bytesToHex(ed25519.getPublicKey(secret)) };
  const request = "Battle #1. Fire.";
  const response = JSON.stringify({ choices: [{ message: { content: JSON.stringify({ shot: cellName(5), line: "Aye." }) } }] });
  const sig = bytesToHex(ed25519.sign(utf8ToBytes(signedText("m", request, response)), secret));
  const answer = (i: number) => {
    const a = answerArgs(his, 1, i);
    return { idx: a.index, cell: a.cell, salt: a.salt, proof: a.proof, tx: `tx${i}` };
  };
  const game = { id: 1, a: ME, b: NAU, root_b: toHex(his.tree.root) } as GameView;
  const history: ShotView[] = [
    { n: 0, by: ME, index: ship, result: "Hit", block: 1, source: "Player" },
    { n: 1, by: NAU, index: 5, result: "Miss", block: 2, source: "Model" },
    { n: 2, by: ME, index: water, result: "Miss", block: 3, source: "Player" },
  ];
  const ev = (over: Partial<NauarchEvidence> = {}): NauarchEvidence => ({
    root: game.root_b, answers: [answer(ship), answer(water)], reveal: null,
    moves: [{ kind: "Shot", source: "model", chat_id: "c", request, response, signature: sig, signed_text: null, error: null, tx: "ai", at: 1 }],
    ...over,
  });

  it("checks every Nauarch answer against his committed root and every signature", () => {
    const r = buildReport(game, history, ev(), model);
    expect(r.shots.map((s) => s.proof)).toEqual(["ok", "chain", "ok"]);
    expect(r.proofsOk).toBe(2);
    expect(r.moves).toEqual([{ kind: "Shot", source: "model", line: "Aye.", signed: "ok", tx: "ai" }]);
    expect(r.revealCheck).toBeNull();
  });

  it("flags a lying answer, a forged signature and a reveal that does not match", () => {
    const lie = { ...answer(ship), cell: 0 };
    const other = revealArgs(newBoard(placeFleet(seededRng(12))), 1);
    const r = buildReport(game, history, ev({ answers: [lie], reveal: { cells: other.cells, salts: other.salts, tx: "rv" }, moves: [{ ...ev().moves[0]!, signature: "00".repeat(64) }] }), model);
    expect(r.shots[0]?.proof).toBe("bad");
    expect(r.moves[0]?.signed).toBe("bad");
    expect(r.revealCheck).toBe("bad");
  });

  it("ignores a server root and checks against the contract root", () => {
    const r = buildReport({ ...game, root_b: "00".repeat(32) }, history, ev({ root: game.root_b }), model);
    expect(r.shots[0]?.proof).toBe("bad");
    expect(buildReport(game, history, null, model).shots[0]?.proof).toBe("chain");
  });

  it("accepts the real reveal", () => {
    const rv = revealArgs(his, 1);
    const r = buildReport(game, history, ev({ reveal: { cells: rv.cells, salts: rv.salts, tx: "rv" } }), null);
    expect(r.revealCheck).toBe("ok");
    expect(r.nauarchFleet?.length).toBe(10);
    expect(r.moves[0]?.signed).toBe("chain");
  });
});
