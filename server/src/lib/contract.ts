export type Status = "Placing" | "Playing" | "Revealing" | "Finished";
export type ShotResult = "Pending" | "Hit" | "Miss";
export type ShotSource = "Player" | "Model" | "ModelFallback" | "Deterministic";
export type MoveKind = "Shot" | "Farewell";

export interface GameView {
  id: number;
  mode: "VsNauarch" | "PvP";
  a: string;
  b: string;
  root_a: string | null;
  root_b: string | null;
  status: Status;
  turn: string;
  deadline_block: number;
  winner: string | null;
  finish_reason: string | null;
  hits_on_a: number;
  hits_on_b: number;
  shots: number;
  pending_index: number | null;
  revealed_a: boolean;
  revealed_b: boolean;
  created_block: number;
  stake: string;
  farewell_said: boolean;
}

export interface ShotView {
  n: number;
  by: string;
  index: number;
  result: ShotResult;
  block: number;
  source: ShotSource;
}

export interface ConfigView {
  owner: string;
  nauarch: string;
  registrar: string;
  games: number;
  open_games: number;
  players: number;
  settings: Record<string, unknown>;
}

export interface TreasuryView {
  account: string;
  balance: string;
  entry: string;
  bounty: string;
  threshold: string;
}

export interface AdmiraltyView {
  heat: number[];
  boards_counted: number;
  day: number;
}

export interface PlayerView {
  account_id: string;
  display_name: string;
  gold: string;
  games_vs_nauarch: number;
  wins: number;
  losses: number;
  flagship: string;
}

export const GAME_GAS_TGAS = 30;
export const PLAYER_GAS_TGAS = 10;
export const PLAYER_REVEAL_GAS_TGAS = 30;

export function playerGas(method: string): number {
  return method === "reveal" ? PLAYER_REVEAL_GAS_TGAS : PLAYER_GAS_TGAS;
}
export const GUEST_GAS_TGAS = 100;
export const PAGE = 100;
