import { randomBytes } from "node:crypto";
import { buildTree, CELLS, toHex, type Hash, type Tree } from "./merkle.js";

export interface Board {
  readonly cells: number[];
  readonly salts: Hash[];
  readonly tree: Tree;
}

export function newBoard(cells: number[], salts: Hash[] = freshSalts()): Board {
  return { cells, salts, tree: buildTree(cells, salts) };
}

export function freshSalts(): Hash[] {
  return Array.from({ length: CELLS }, () => new Uint8Array(randomBytes(32)));
}

export function rootHex(board: Board): string {
  return toHex(board.tree.root);
}

export interface AnswerArgs {
  game_id: number;
  index: number;
  cell: number;
  salt: string;
  proof: string[];
}

export function answerArgs(board: Board, gameId: number, index: number): AnswerArgs {
  return {
    game_id: gameId,
    index,
    cell: board.cells[index] as number,
    salt: toHex(board.salts[index] as Hash),
    proof: board.tree.proof(index).map(toHex),
  };
}

export function revealArgs(board: Board, gameId: number): { game_id: number; cells: string; salts: string[] } {
  return { game_id: gameId, cells: board.cells.join(""), salts: board.salts.map(toHex) };
}
