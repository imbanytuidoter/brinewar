import { isLegalFleet } from "./fleet";
import { buildTree, CELLS, fromHex, toHex, type Hash, type Tree } from "./merkle";

export interface Board {
  readonly cells: readonly number[];
  readonly salts: readonly Hash[];
  readonly tree: Tree;
}

export function freshSalts(): Hash[] {
  return Array.from({ length: CELLS }, () => crypto.getRandomValues(new Uint8Array(32)));
}

export function newBoard(cells: readonly number[], salts: readonly Hash[] = freshSalts()): Board {
  return { cells: [...cells], salts: [...salts], tree: buildTree(cells, salts) };
}

export function rootHex(board: Board): string {
  return toHex(board.tree.root);
}

export interface AnswerArgs {
  readonly game_id: number;
  readonly index: number;
  readonly cell: number;
  readonly salt: string;
  readonly proof: string[];
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

export function encodeBoard(board: Board): string {
  return JSON.stringify({ cells: board.cells, salts: board.salts.map(toHex) });
}

export function decodeBoard(raw: string): Board | null {
  try {
    const v = JSON.parse(raw) as { cells?: unknown; salts?: unknown };
    if (!Array.isArray(v.cells) || !Array.isArray(v.salts) || v.salts.length !== CELLS) return null;
    const cells = v.cells as unknown[];
    if (!cells.every((c): c is number => c === 0 || c === 1) || !isLegalFleet(cells)) return null;
    const salts = (v.salts as unknown[]).map((s) => (typeof s === "string" && s.length === 64 ? fromHex(s) : null));
    if (salts.some((s) => s === null)) return null;
    return newBoard(cells, salts as Hash[]);
  } catch {
    return null;
  }
}
