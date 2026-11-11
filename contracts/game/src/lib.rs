use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, PanicOnDefault};
use serde_json::json;

pub mod codec;
mod events;
pub mod fleet;
pub mod game;
pub mod merkle;

use codec::{cells_to_string, parse_cells, parse_hash, parse_proof, parse_salts};
use events::emit;
use fleet::{validate_fleet, CELLS, SHIP_CELLS};
use game::{FinishReason, Game, GameView, Mode, Shot, ShotResult, ShotView, Side, Status};
use merkle::{board_root, root_from_proof};

pub const MAX_MISSES: u8 = (CELLS - SHIP_CELLS) as u8;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Brinewar {
    owner: AccountId,
    nauarch: AccountId,
    move_timeout_blocks: u64,
    games: LookupMap<u64, Game>,
    next_game_id: u64,
    active_game: LookupMap<AccountId, u64>,
    max_open_games: u32,
    open_games: u32,
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub owner: AccountId,
    pub nauarch: AccountId,
    pub move_timeout_blocks: u64,
    pub games: u64,
    pub max_open_games: u32,
    pub open_games: u32,
}

fn fail(msg: &str) -> ! {
    env::panic_str(msg)
}

fn ok_or_fail<T>(r: Result<T, String>) -> T {
    r.unwrap_or_else(|e| fail(&e))
}

#[near]
impl Brinewar {
    #[init]
    #[private]
    pub fn new(
        owner: AccountId,
        nauarch: AccountId,
        move_timeout_blocks: u64,
        max_open_games: u32,
    ) -> Self {
        require!(
            move_timeout_blocks > 0,
            "move_timeout_blocks must be positive"
        );
        Self {
            owner,
            nauarch,
            move_timeout_blocks,
            games: LookupMap::new(b"g"),
            next_game_id: 0,
            active_game: LookupMap::new(b"a"),
            max_open_games,
            open_games: 0,
        }
    }

    pub fn new_game_vs_nauarch(&mut self) -> u64 {
        let player = env::predecessor_account_id();
        require!(player != self.nauarch, "the Nauarch cannot play itself");
        require!(
            !self.active_game.contains_key(&player),
            "finish your current game first"
        );
        require!(
            self.open_games < self.max_open_games,
            "the Nauarch is busy, try again soon"
        );
        self.open_games += 1;
        let id = self.next_game_id;
        self.next_game_id += 1;
        let now = env::block_height();
        let game = Game {
            id,
            mode: Mode::VsNauarch,
            a: player.clone(),
            b: self.nauarch.clone(),
            root_a: None,
            root_b: None,
            shots: Vec::new(),
            fired_a: 0,
            fired_b: 0,
            hits_on_a: 0,
            hits_on_b: 0,
            misses_on_a: 0,
            misses_on_b: 0,
            turn: Side::A,
            deadline_block: now + self.move_timeout_blocks,
            status: Status::Placing,
            winner: None,
            finish_reason: None,
            revealed_a: false,
            revealed_b: false,
            created_block: now,
            stake: 0,
        };
        self.active_game.insert(player.clone(), id);
        self.games.insert(id, game);
        emit(
            "game_created",
            json!({"game_id": id, "mode": "VsNauarch", "a": player, "b": self.nauarch}),
        );
        id
    }

    pub fn commit_board(&mut self, game_id: u64, root: String) {
        let root = ok_or_fail(parse_hash(&root, "root"));
        let mut game = self.load(game_id);
        require!(game.status == Status::Placing, "game is not in placement");
        self.require_before_deadline(&game);
        let side = self.caller_side(&game);
        require!(game.root(side).is_none(), "board already committed");
        game.set_root(side, root);
        emit(
            "board_committed",
            json!({"game_id": game_id, "account": game.account(side), "root": hex::encode(root)}),
        );
        if game.root_a.is_some() && game.root_b.is_some() {
            game.status = Status::Playing;
            game.turn = Side::A;
            game.deadline_block = env::block_height() + self.move_timeout_blocks;
            emit(
                "game_started",
                json!({"game_id": game_id, "first": game.a, "deadline_block": game.deadline_block}),
            );
        }
        self.games.insert(game_id, game);
    }

    pub fn fire(&mut self, game_id: u64, index: u8) {
        let mut game = self.load(game_id);
        let side = self.caller_side(&game);
        self.record_shot(&mut game, side, index);
        self.games.insert(game_id, game);
    }

    pub fn answer(&mut self, game_id: u64, index: u8, cell: u8, salt: String, proof: Vec<String>) {
        let salt = ok_or_fail(parse_hash(&salt, "salt"));
        let proof = ok_or_fail(parse_proof(&proof));
        require!(cell <= 1, "cell must be 0 or 1");
        let mut game = self.load(game_id);
        require!(game.status == Status::Playing, "game is not in play");
        self.require_before_deadline(&game);
        let side = self.caller_side(&game);
        require!(game.turn == side, "not your turn");
        let shot = game
            .pending_shot()
            .cloned()
            .unwrap_or_else(|| fail("no shot to answer"));
        require!(shot.by != side, "cannot answer your own shot");
        require!(shot.index == index, "index does not match the pending shot");
        let root = game
            .root(side)
            .unwrap_or_else(|| fail("board not committed"));
        require!(
            root_from_proof(index, cell, &salt, &proof) == root,
            "proof does not match the committed board"
        );
        let hit = cell == 1;
        let n = game.shots.len() - 1;
        game.shots[n].result = if hit {
            ShotResult::Hit
        } else {
            ShotResult::Miss
        };
        game.record_answer(side, hit);
        emit(
            "shot_answered",
            json!({
                "game_id": game_id, "n": n, "by": game.account(side), "index": index,
                "hit": hit, "salt": hex::encode(salt),
            }),
        );
        if game.hits_on(side) as usize == SHIP_CELLS {
            game.status = Status::Revealing;
            game.winner = Some(shot.by);
            game.finish_reason = Some(FinishReason::FleetSunk);
            game.turn = shot.by;
            game.deadline_block = env::block_height() + self.move_timeout_blocks;
            emit(
                "reveal_started",
                json!({"game_id": game_id, "winner": game.account(shot.by), "deadline_block": game.deadline_block}),
            );
        } else if game.misses_on(side) > MAX_MISSES {
            game.status = Status::Revealing;
            game.winner = Some(shot.by);
            game.finish_reason = Some(FinishReason::IllegalFleet);
            game.turn = shot.by;
            game.deadline_block = env::block_height() + self.move_timeout_blocks;
            emit(
                "reveal_started",
                json!({"game_id": game_id, "winner": game.account(shot.by), "deadline_block": game.deadline_block}),
            );
        } else {
            game.deadline_block = env::block_height() + self.move_timeout_blocks;
        }
        self.games.insert(game_id, game);
    }

    pub fn reveal(&mut self, game_id: u64, cells: String, salts: Vec<String>) {
        let cells = ok_or_fail(parse_cells(&cells));
        let salts = ok_or_fail(parse_salts(&salts));
        let mut game = self.load(game_id);
        require!(
            matches!(game.status, Status::Revealing | Status::Finished),
            "game is not over"
        );
        let side = self.caller_side(&game);
        require!(!game.revealed(side), "board already revealed");
        let decides = game.status == Status::Revealing && game.winner == Some(side);
        if decides {
            self.require_before_deadline(&game);
        }
        let root = game
            .root(side)
            .unwrap_or_else(|| fail("board not committed"));
        require!(
            board_root(&cells, &salts) == root,
            "revealed board does not match the committed root"
        );
        let consistent = game
            .shots
            .iter()
            .filter(|s| s.by != side)
            .all(|s| match s.result {
                ShotResult::Hit => cells[s.index as usize] == 1,
                ShotResult::Miss => cells[s.index as usize] == 0,
                ShotResult::Pending => true,
            });
        let fleet = if consistent {
            validate_fleet(&cells).map_err(|e| e.as_str())
        } else {
            Err("revealed board contradicts earlier answers")
        };
        game.set_revealed(side);
        emit(
            "board_revealed",
            json!({
                "game_id": game_id, "account": game.account(side),
                "cells": cells_to_string(&cells),
                "valid": fleet.is_ok(), "error": fleet.err(),
            }),
        );
        if decides {
            let reason = game.finish_reason.unwrap_or(FinishReason::FleetSunk);
            match fleet {
                Ok(()) => self.finish(&mut game, Some(side), reason),
                Err(_) => self.finish(&mut game, Some(side.other()), FinishReason::IllegalFleet),
            }
        }
        self.games.insert(game_id, game);
    }

    pub fn claim_timeout(&mut self, game_id: u64) {
        let mut game = self.load(game_id);
        require!(
            env::block_height() > game.deadline_block,
            "deadline has not passed"
        );
        match game.status {
            Status::Placing => self.finish(&mut game, None, FinishReason::Cancelled),
            Status::Playing => {
                let late = game.turn;
                self.finish(&mut game, Some(late.other()), FinishReason::Timeout)
            }
            Status::Revealing => {
                let winner = game.winner.map(Side::other);
                self.finish(&mut game, winner, FinishReason::RevealTimeout)
            }
            Status::Finished => fail("game already finished"),
        }
        self.games.insert(game_id, game);
    }

    pub fn resign(&mut self, game_id: u64) {
        let mut game = self.load(game_id);
        let side = self.caller_side(&game);
        match game.status {
            Status::Placing => self.finish(&mut game, None, FinishReason::Cancelled),
            Status::Playing => self.finish(&mut game, Some(side.other()), FinishReason::Resigned),
            Status::Revealing | Status::Finished => fail("game is already decided"),
        }
        self.games.insert(game_id, game);
    }

    pub fn get_game(&self, game_id: u64) -> Option<GameView> {
        self.games.get(&game_id).map(GameView::from)
    }

    pub fn get_history(&self, game_id: u64) -> Vec<ShotView> {
        let Some(game) = self.games.get(&game_id) else {
            return Vec::new();
        };
        game.shots
            .iter()
            .enumerate()
            .map(|(n, s)| ShotView {
                n: n as u32,
                by: game.account(s.by).clone(),
                index: s.index,
                result: s.result,
                block: s.block,
            })
            .collect()
    }

    pub fn active_game_of(&self, account_id: AccountId) -> Option<u64> {
        self.active_game.get(&account_id).copied()
    }

    pub fn config(&self) -> ConfigView {
        ConfigView {
            owner: self.owner.clone(),
            nauarch: self.nauarch.clone(),
            move_timeout_blocks: self.move_timeout_blocks,
            games: self.next_game_id,
            max_open_games: self.max_open_games,
            open_games: self.open_games,
        }
    }
}

impl Brinewar {
    fn load(&self, game_id: u64) -> Game {
        self.games
            .get(&game_id)
            .cloned()
            .unwrap_or_else(|| fail("unknown game"))
    }

    fn caller_side(&self, game: &Game) -> Side {
        game.side_of(&env::predecessor_account_id())
            .unwrap_or_else(|| fail("not a player in this game"))
    }

    fn require_before_deadline(&self, game: &Game) {
        require!(
            env::block_height() <= game.deadline_block,
            "move deadline passed"
        );
    }

    fn record_shot(&self, game: &mut Game, side: Side, index: u8) {
        require!(game.status == Status::Playing, "game is not in play");
        self.require_before_deadline(game);
        require!(game.turn == side, "not your turn");
        require!(
            game.pending_shot().is_none(),
            "previous shot is not answered"
        );
        require!((index as usize) < CELLS, "index out of board");
        require!(!game.has_fired(side, index), "cell already fired at");
        let block = env::block_height();
        game.mark_fired(side, index);
        game.shots.push(Shot {
            by: side,
            index,
            result: ShotResult::Pending,
            block,
        });
        game.turn = side.other();
        game.deadline_block = block + self.move_timeout_blocks;
        emit(
            "shot_fired",
            json!({
                "game_id": game.id, "n": game.shots.len() - 1,
                "by": game.account(side), "index": index,
            }),
        );
    }

    fn finish(&mut self, game: &mut Game, winner: Option<Side>, reason: FinishReason) {
        if game.mode == Mode::VsNauarch {
            self.open_games = self.open_games.saturating_sub(1);
        }
        game.status = Status::Finished;
        game.winner = winner;
        game.finish_reason = Some(reason);
        for side in [Side::A, Side::B] {
            let account = game.account(side).clone();
            if self.active_game.get(&account) == Some(&game.id) {
                self.active_game.remove(&account);
            }
        }
        emit(
            "game_finished",
            json!({
                "game_id": game.id,
                "winner": winner.map(|s| game.account(s).clone()),
                "reason": reason,
                "hits_on_a": game.hits_on_a, "hits_on_b": game.hits_on_b,
            }),
        );
    }
}

#[cfg(test)]
mod tests;
