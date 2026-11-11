export type Status = "Placing" | "Playing" | "Revealing" | "Finished";
export type ShotResult = "Pending" | "Hit" | "Miss";
export type ShotSource = "Player" | "Model" | "ModelFallback" | "Deterministic";

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

export interface PlayerView {
  account_id: string;
  nickname: string | null;
  display_name: string;
  gold: string;
  games_vs_nauarch: number;
  wins: number;
  losses: number;
  last_result: string | null;
  fav_zone: string | null;
  flagship: string;
}

export interface ModelView {
  model: string;
  public_key: string;
}

export interface PublicMove {
  kind: string;
  source: string;
  chat_id: string | null;
  request: string | null;
  response: string | null;
  signature: string | null;
  signed_text: string | null;
  error: string | null;
  tx: string | null;
  at: number;
}

export interface AnswerRow {
  idx: number;
  cell: number;
  salt: string;
  proof: string[];
  tx: string | null;
}

export interface ProofsView {
  game: GameView;
  history: ShotView[];
  nauarch: {
    root: string | null;
    answers: AnswerRow[];
    reveal: { cells: string; salts: string[]; tx: string | null } | null;
    moves: PublicMove[];
  };
}

export const SHIP_CELLS = 20;

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

export interface ShipStatsView {
  token_id: string;
  owner_id: string;
  captain: string;
  class: string;
  rank: string;
  xp: number;
  next_rank_xp: number | null;
  wins: number;
  losses: number;
  sunk: number;
  frozen: boolean;
}

export interface EconomySettings {
  base_entry: string;
  entry_threshold: string;
  bounty_bps: number;
  bounty_cap: string;
  bounties_per_day: number;
}

export interface ConfigView {
  owner: string;
  nauarch: string;
  games: number;
  players: number;
  settings: EconomySettings & Record<string, unknown>;
}
