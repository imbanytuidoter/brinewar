use near_sdk::json_types::U128;
use near_sdk::store::{Lazy, LookupMap, Vector};
use near_sdk::{env, near, require, AccountId, PanicOnDefault};
use serde_json::json;

pub mod admiralty;
pub mod codec;
mod events;
pub mod fleet;
pub mod game;
pub mod merkle;
pub mod nauarch;
pub mod players;
pub mod settings;
pub mod tokens;
pub mod treasury;

use admiralty::AdmiraltyMap;
use codec::{cells_to_string, parse_cells, parse_hash, parse_proof, parse_salts};
use events::emit;
use fleet::{ships, validate_fleet, CELLS, SHIP_CELLS};
use game::{
    FinishReason, Game, GameView, Mode, Shot, ShotResult, ShotSource, ShotView, Side, Status,
};
use merkle::{board_root, root_from_proof};
use nauarch::ModelKey;
use players::{display_name, fav_zone, rank_of, Player, ShipStats, XP_HIT, XP_SUNK, XP_WIN, ZONES};
use settings::Settings;
use tokens::{GOLD, RANK_SKINS};

pub const MAX_PAGE: u32 = 100;
pub const MAX_MISSES: u8 = (CELLS - SHIP_CELLS) as u8;
pub const PVP_JOIN_WINDOW: u64 = 15;
const INVITE_PREFIX: &[u8] = b"i";

fn invite_key(game_id: u64) -> Vec<u8> {
    [INVITE_PREFIX, &game_id.to_le_bytes()].concat()
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Brinewar {
    owner: AccountId,
    nauarch: AccountId,
    registrar: AccountId,
    settings: Settings,
    games: LookupMap<u64, Game>,
    next_game_id: u64,
    active_game: LookupMap<AccountId, u64>,
    open_games: u32,
    players: LookupMap<AccountId, Player>,
    ships: LookupMap<u64, ShipStats>,
    next_ship_id: u64,
    balances: LookupMap<(String, AccountId), u128>,
    supply: LookupMap<String, u128>,
    map: Lazy<AdmiraltyMap>,
    heat_day: LookupMap<AccountId, u64>,
    model: Option<ModelKey>,
    guests_day: u64,
    guests_today: u32,
    skins: Vector<String>,
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub owner: AccountId,
    pub nauarch: AccountId,
    pub registrar: AccountId,
    pub settings: Settings,
    pub games: u64,
    pub open_games: u32,
    pub players: u64,
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
        registrar: AccountId,
        settings: Settings,
        initial_treasury: U128,
    ) -> Self {
        settings.check();
        let mut c = Self {
            owner,
            nauarch: nauarch.clone(),
            registrar,
            settings,
            games: LookupMap::new(b"g"),
            next_game_id: 0,
            active_game: LookupMap::new(b"a"),
            open_games: 0,
            players: LookupMap::new(b"p"),
            ships: LookupMap::new(b"s"),
            next_ship_id: 0,
            balances: LookupMap::new(b"b"),
            supply: LookupMap::new(b"t"),
            map: Lazy::new(b"m", AdmiraltyMap::default()),
            heat_day: LookupMap::new(b"h"),
            model: None,
            guests_day: 0,
            guests_today: 0,
            skins: Vector::new(b"k"),
        };
        c.supply.insert(GOLD.to_string(), 0);
        if initial_treasury.0 > 0 {
            c.mint(GOLD, &nauarch, initial_treasury.0, Some("treasury"));
        }
        c
    }

    pub fn new_game_vs_nauarch(&mut self, invite_hash: Option<String>) -> u64 {
        if let Some(hash) = invite_hash {
            return self.open_duel(&hash);
        }
        let player = env::predecessor_account_id();
        require!(player != self.nauarch, "the Nauarch cannot play itself");
        require!(
            self.players.contains_key(&player),
            "not a registered player"
        );
        require!(
            !self.active_game.contains_key(&player),
            "finish your current game first"
        );
        require!(
            self.open_games < self.settings.max_open_games,
            "the Nauarch is busy, try again soon"
        );
        self.count_game_today(&player);
        self.open_games += 1;
        let id = self.next_game_id;
        self.next_game_id += 1;
        let now = env::block_height();
        let stake = self.take_stake(&player);
        let dossier = self.dossier(&player);
        let map = self.map.get();
        let hot = map.hot_cells(self.settings.min_heat_boards);
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
            deadline_block: now + self.settings.move_timeout_blocks,
            status: Status::Placing,
            winner: None,
            finish_reason: None,
            revealed_a: false,
            revealed_b: false,
            created_block: now,
            stake,
            dossier,
            hot,
            farewell_said: false,
        };
        self.active_game.insert(player.clone(), id);
        self.games.insert(id, game);
        emit(
            "game_created",
            json!({"game_id": id, "mode": "VsNauarch", "a": player, "b": self.nauarch, "stake": U128(stake)}),
        );
        id
    }

    pub fn new_game_pvp(&mut self, invite_hash: String) -> u64 {
        self.open_duel(&invite_hash)
    }

    pub fn join_game(&mut self, game_id: u64, secret: String) {
        self.join_duel(game_id, &secret);
    }
}

impl Brinewar {
    fn open_duel(&mut self, invite_hash: &str) -> u64 {
        let invite = ok_or_fail(parse_hash(invite_hash, "invite"));
        let player = env::predecessor_account_id();
        require!(player != self.nauarch, "the Nauarch cannot play itself");
        require!(
            self.players.contains_key(&player),
            "not a registered player"
        );
        require!(
            !self.active_game.contains_key(&player),
            "finish your current game first"
        );
        self.count_game_today(&player);
        let id = self.next_game_id;
        self.next_game_id += 1;
        let now = env::block_height();
        let game = Game {
            id,
            mode: Mode::PvP,
            a: player.clone(),
            b: player.clone(),
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
            deadline_block: now + self.settings.move_timeout_blocks * PVP_JOIN_WINDOW,
            status: Status::Waiting,
            winner: None,
            finish_reason: None,
            revealed_a: false,
            revealed_b: false,
            created_block: now,
            stake: 0,
            dossier: String::new(),
            hot: Vec::new(),
            farewell_said: false,
        };
        self.active_game.insert(player.clone(), id);
        self.games.insert(id, game);
        env::storage_write(&invite_key(id), &invite);
        emit(
            "game_created",
            json!({"game_id": id, "mode": "PvP", "a": player, "stake": U128(0)}),
        );
        id
    }

    fn join_duel(&mut self, game_id: u64, secret: &str) {
        let joiner = env::predecessor_account_id();
        let mut game = self.load(game_id);
        require!(
            game.status == Status::Waiting,
            "this duel is not waiting for a captain"
        );
        let secret = ok_or_fail(parse_hash(secret, "invite secret"));
        let expected = env::storage_read(&invite_key(game_id)).unwrap_or_default();
        require!(
            env::sha256(secret) == expected,
            "this invite link is not valid for the duel"
        );
        require!(joiner != game.a, "you cannot join your own duel");
        require!(
            joiner != self.nauarch,
            "the Nauarch only plays its own battles"
        );
        require!(
            self.players.contains_key(&joiner),
            "not a registered player"
        );
        require!(
            !self.active_game.contains_key(&joiner),
            "finish your current game first"
        );
        self.require_before_deadline(&game);
        self.count_game_today(&joiner);
        env::storage_remove(&invite_key(game_id));
        game.b = joiner.clone();
        game.status = Status::Placing;
        game.deadline_block = env::block_height() + self.settings.move_timeout_blocks;
        self.active_game.insert(joiner.clone(), game_id);
        emit(
            "game_joined",
            json!({"game_id": game_id, "a": game.a, "b": joiner, "deadline_block": game.deadline_block}),
        );
        self.store(game);
    }
}

#[near]
impl Brinewar {
    pub fn commit_board(&mut self, game_id: u64, root: String, invite_secret: Option<String>) {
        let root = ok_or_fail(parse_hash(&root, "root"));
        if let Some(secret) = invite_secret {
            if self.load(game_id).status == Status::Waiting {
                self.join_duel(game_id, &secret);
            }
        }
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
            game.deadline_block = env::block_height() + self.settings.move_timeout_blocks;
            emit(
                "game_started",
                json!({"game_id": game_id, "first": game.a, "deadline_block": game.deadline_block}),
            );
        }
        self.store(game);
    }

    pub fn fire(&mut self, game_id: u64, index: u8) {
        let mut game = self.load(game_id);
        let side = self.caller_side(&game);
        require!(
            !(game.mode == Mode::VsNauarch && side == Side::B),
            "the Nauarch fires through submit_ai_move or nauarch_fallback"
        );
        self.record_shot(&mut game, side, index, ShotSource::Player);
        self.store(game);
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
            game.deadline_block = env::block_height() + self.settings.move_timeout_blocks;
            emit(
                "reveal_started",
                json!({"game_id": game_id, "winner": game.account(shot.by), "deadline_block": game.deadline_block}),
            );
        } else if game.misses_on(side) > MAX_MISSES {
            game.status = Status::Revealing;
            game.winner = Some(shot.by);
            game.finish_reason = Some(FinishReason::IllegalFleet);
            game.turn = shot.by;
            game.deadline_block = env::block_height() + self.settings.move_timeout_blocks;
            emit(
                "reveal_started",
                json!({"game_id": game_id, "winner": game.account(shot.by), "deadline_block": game.deadline_block}),
            );
        } else {
            game.deadline_block = env::block_height() + self.settings.move_timeout_blocks;
        }
        self.store(game);
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
        let mut counted = false;
        if fleet.is_ok() {
            if game.mode == Mode::VsNauarch {
                match side {
                    Side::A => {
                        let account = game.a.clone();
                        self.add_zones(&account, &cells);
                        counted = self.count_board(&game, Side::A, &cells);
                    }
                    Side::B => self.award_sunk(&game, Side::A, &cells),
                }
            } else if self.full_duel(&game) {
                self.award_sunk(&game, side.other(), &cells);
            }
        }
        emit(
            "board_revealed",
            json!({
                "game_id": game_id, "account": game.account(side),
                "cells": cells_to_string(&cells),
                "valid": fleet.is_ok(), "error": fleet.err(), "heat_counted": counted,
            }),
        );
        if decides {
            let reason = game.finish_reason.unwrap_or(FinishReason::FleetSunk);
            match fleet {
                Ok(()) => self.finish(&mut game, Some(side), reason),
                Err(_) => self.finish(&mut game, Some(side.other()), FinishReason::IllegalFleet),
            }
        }
        self.store(game);
    }

    pub fn claim_timeout(&mut self, game_id: u64) {
        let mut game = self.load(game_id);
        require!(
            env::block_height() > game.deadline_block,
            "deadline has not passed"
        );
        match game.status {
            Status::Placing | Status::Waiting => {
                self.finish(&mut game, None, FinishReason::Cancelled)
            }
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
        self.store(game);
    }

    pub fn resign(&mut self, game_id: u64) {
        let mut game = self.load(game_id);
        let side = self.caller_side(&game);
        match game.status {
            Status::Placing | Status::Waiting => {
                self.finish(&mut game, None, FinishReason::Cancelled)
            }
            Status::Playing => self.finish(&mut game, Some(side.other()), FinishReason::Resigned),
            Status::Revealing | Status::Finished => fail("game is already decided"),
        }
        self.store(game);
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
                source: s.source,
            })
            .collect()
    }

    pub fn games_since(&self, from_id: u64, limit: u32) -> Vec<GameView> {
        (from_id..self.next_game_id)
            .take(limit.min(MAX_PAGE) as usize)
            .filter_map(|id| self.games.get(&id).map(GameView::from))
            .collect()
    }

    pub fn active_game_of(&self, account_id: AccountId) -> Option<u64> {
        self.active_game.get(&account_id).copied()
    }

    pub fn config(&self) -> ConfigView {
        ConfigView {
            owner: self.owner.clone(),
            nauarch: self.nauarch.clone(),
            registrar: self.registrar.clone(),
            settings: self.settings.clone(),
            games: self.next_game_id,
            open_games: self.open_games,
            players: self.next_ship_id,
        }
    }
}

impl Brinewar {
    pub(crate) fn store(&mut self, game: Game) {
        if game.finish_reason == Some(FinishReason::Cancelled) {
            self.games.remove(&game.id);
        } else {
            self.games.insert(game.id, game);
        }
    }

    pub(crate) fn load(&self, game_id: u64) -> Game {
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

    pub(crate) fn record_shot(&self, game: &mut Game, side: Side, index: u8, source: ShotSource) {
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
            source,
        });
        game.turn = side.other();
        game.deadline_block = block + self.settings.move_timeout_blocks;
        emit(
            "shot_fired",
            json!({
                "game_id": game.id, "n": game.shots.len() - 1,
                "by": game.account(side), "index": index, "source": source,
            }),
        );
    }

    fn finish(&mut self, game: &mut Game, winner: Option<Side>, reason: FinishReason) {
        game.finish_reason = Some(reason);
        if game.mode == Mode::VsNauarch {
            self.open_games = self.open_games.saturating_sub(1);
            self.settle(game, winner, reason);
            if winner.is_some() {
                self.record_result(game, Side::A, winner == Some(Side::A), true);
            }
        } else {
            env::storage_remove(&invite_key(game.id));
            if let Some(w) = winner {
                let full = self.full_duel(game);
                self.record_result(game, w, true, full);
                self.record_result(game, w.other(), false, full);
            }
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

impl Brinewar {
    fn dossier(&self, player: &AccountId) -> String {
        let Some(p) = self.players.get(player) else {
            return String::new();
        };
        let name = display_name(player, &p.nickname);
        if p.games == 0 {
            return format!("{name}: first battle against you.");
        }
        let days =
            (env::block_height().saturating_sub(p.last_game_block)) / self.settings.blocks_per_day;
        let when = match days {
            0 => "today".to_string(),
            1 => "yesterday".to_string(),
            d => format!("{d} days ago"),
        };
        let last = if p.last_won == Some(true) {
            "won"
        } else {
            "lost"
        };
        let zone = fav_zone(&p.zones)
            .map(|z| format!(", usually hides ships in the {}", ZONES[z]))
            .unwrap_or_default();
        format!(
            "{name}: {} games vs you, {} wins, last game {last} {when}{zone}.",
            p.games, p.wins
        )
    }

    fn full_duel(&self, game: &Game) -> bool {
        let min = self.settings.min_heat_shots as usize;
        game.sank_fleet() && game.answered_by(Side::A) >= min && game.answered_by(Side::B) >= min
    }

    fn record_result(&mut self, game: &Game, side: Side, player_won: bool, earns_xp: bool) {
        let now = env::block_height();
        let account = game.account(side).clone();
        if game.mode == Mode::VsNauarch {
            if let Some(p) = self.players.get_mut(&account) {
                p.games += 1;
                if player_won {
                    p.wins += 1;
                } else {
                    p.losses += 1;
                }
                p.last_won = Some(player_won);
                p.last_game_block = now;
            }
        }
        let Some(ship) = self.active_flagship(&account) else {
            return;
        };
        let win_xp = if player_won && game.sank_fleet() {
            XP_WIN
        } else {
            0
        };
        let xp = if earns_xp {
            game.hits_on(side.other()) as u64 * XP_HIT + win_xp
        } else {
            0
        };
        let before = self.ships.get(&ship).map(|s| s.xp).unwrap_or(0);
        if let Some(s) = self.ships.get_mut(&ship) {
            s.xp += xp;
            if player_won {
                s.wins += 1;
            } else {
                s.losses += 1;
            }
        }
        self.grant_rank_skins(&account, before, before + xp);
        emit(
            "ship_progress",
            json!({"game_id": game.id, "token_id": tokens::ship_token(ship), "xp_gained": xp}),
        );
    }

    fn grant_rank_skins(&mut self, account: &AccountId, xp_before: u64, xp_after: u64) {
        let (from, to) = (rank_of(xp_before), rank_of(xp_after));
        for (rank, skin) in RANK_SKINS {
            if rank > from && rank <= to && self.balance(skin, account) == 0 {
                self.mint(skin, account, 1, Some("rank"));
            }
        }
    }

    fn award_sunk(&mut self, game: &Game, shooter: Side, target_cells: &[u8; CELLS]) {
        let sunk = ships(target_cells)
            .iter()
            .filter(|ship| ship.iter().all(|&c| game.has_fired(shooter, c as u8)))
            .count() as u32;
        if sunk == 0 {
            return;
        }
        let Some(ship) = self.active_flagship(game.account(shooter)) else {
            return;
        };
        let before = self.ships.get(&ship).map(|s| s.xp).unwrap_or(0);
        let gained = sunk as u64 * XP_SUNK;
        if let Some(s) = self.ships.get_mut(&ship) {
            s.sunk += sunk;
            s.xp += gained;
        }
        let account = game.account(shooter).clone();
        self.grant_rank_skins(&account, before, before + gained);
        emit(
            "ship_progress",
            json!({"game_id": game.id, "token_id": tokens::ship_token(ship), "sunk": sunk, "xp_gained": sunk as u64 * XP_SUNK}),
        );
    }
}

#[cfg(test)]
mod tests;
