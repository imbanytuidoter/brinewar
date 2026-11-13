use super::*;
use crate::merkle::testing::{proof, salts};
use crate::merkle::{Hash, DEPTH};
use crate::nauarch::{cell_name, signed_text, MoveKind};
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::testing_env;

pub const TIMEOUT: u64 = 10;
pub const MAX_OPEN: u32 = 3;
pub const DAY: u64 = 1_000;
pub const TREASURY: u128 = 1_000;
pub const MODEL: &str = "Qwen/Qwen3.8-27B";

pub fn settings() -> Settings {
    Settings {
        move_timeout_blocks: TIMEOUT,
        max_open_games: MAX_OPEN,
        blocks_per_day: DAY,
        min_heat_shots: 10,
        start_gold: U128(100),
        base_entry: U128(10),
        entry_threshold: U128(500),
        bounty_bps: 500,
        bounty_cap: U128(25),
        guest_fund: U128(100_000_000_000_000_000_000_000),
        guest_allowance: U128(250_000_000_000_000_000_000_000),
        guests_per_day: 2,
        games_per_day: 3,
        bounties_per_day: 1,
        min_heat_boards: 1,
    }
}

pub fn model_key() -> SigningKey {
    let mut secret = [0u8; 32];
    for (i, b) in secret.iter_mut().enumerate() {
        *b = (i as u8).wrapping_mul(11).wrapping_add(5);
    }
    SigningKey::from_bytes(&secret)
}

pub fn response_with(content: &str) -> String {
    let content = serde_json::to_string(content).unwrap();
    format!(
        r#"{{"id":"chatcmpl-1","object":"chat.completion","model":"{MODEL}","choices":[{{"index":0,"message":{{"role":"assistant","content":{content}}},"finish_reason":"stop"}}]}}"#
    )
}

pub fn sign(request: &str, response: &str) -> String {
    let text = signed_text(MODEL, request, response);
    hex::encode(model_key().sign(text.as_bytes()).to_bytes())
}

pub fn registrar() -> AccountId {
    acc("sponsor.brinewar.testnet")
}

pub fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

pub fn player() -> AccountId {
    acc("p-1.brinewar.testnet")
}

pub fn nauarch() -> AccountId {
    acc("admiral.brinewar.testnet")
}

pub struct Chain {
    pub height: u64,
}

impl Chain {
    pub fn act(&mut self, who: &AccountId) {
        testing_env!(VMContextBuilder::new()
            .current_account_id(acc("brinewar.testnet"))
            .predecessor_account_id(who.clone())
            .block_height(self.height)
            .build());
    }

    pub fn skip(&mut self, blocks: u64) {
        self.height += blocks;
    }
}

pub struct Board {
    pub cells: [u8; CELLS],
    pub salts: [Hash; CELLS],
}

impl Board {
    pub fn new(ships: &[usize], seed: u8) -> Self {
        let mut cells = [0u8; CELLS];
        for &i in ships {
            cells[i] = 1;
        }
        Board {
            cells,
            salts: salts(seed),
        }
    }

    fn root_hex(&self) -> String {
        hex::encode(board_root(&self.cells, &self.salts))
    }

    fn salt_hex(&self, i: u8) -> String {
        hex::encode(self.salts[i as usize])
    }

    fn proof_hex(&self, i: u8) -> Vec<String> {
        proof(&self.cells, &self.salts, i)
            .iter()
            .map(hex::encode)
            .collect()
    }

    fn cells_str(&self) -> String {
        cells_to_string(&self.cells)
    }

    fn salts_hex(&self) -> Vec<String> {
        self.salts.iter().map(hex::encode).collect()
    }

    fn ship_cells(&self) -> Vec<u8> {
        (0..CELLS as u8)
            .filter(|&i| self.cells[i as usize] == 1)
            .collect()
    }

    fn water_cells(&self) -> Vec<u8> {
        (0..CELLS as u8)
            .filter(|&i| self.cells[i as usize] == 0)
            .collect()
    }
}

pub const LEGAL_A: [usize; 20] = [
    0, 1, 2, 3, 20, 21, 22, 26, 27, 28, 40, 41, 44, 45, 48, 49, 60, 62, 64, 66,
];
pub const MIRROR_A: [usize; 20] = [
    90, 91, 92, 93, 70, 71, 72, 76, 77, 78, 50, 51, 54, 55, 58, 59, 30, 32, 34, 36,
];
pub const LEGAL_B: [usize; 20] = [
    0, 10, 20, 30, 2, 12, 22, 4, 14, 24, 6, 16, 8, 18, 52, 62, 90, 92, 94, 99,
];
pub const BENT: [usize; 20] = [
    0, 1, 2, 3, 20, 21, 22, 26, 27, 37, 40, 41, 44, 45, 48, 49, 60, 62, 64, 66,
];

pub struct Match {
    pub chain: Chain,
    pub c: Brinewar,
    pub id: u64,
    pub a: Board,
    pub b: Board,
}

pub fn contract(chain: &mut Chain) -> Brinewar {
    chain.act(&acc("brinewar.testnet"));
    let mut c = Brinewar::new(
        acc("brinewar.testnet"),
        nauarch(),
        registrar(),
        settings(),
        U128(TREASURY),
    );
    c.set_model(
        MODEL.to_string(),
        hex::encode(model_key().verifying_key().as_bytes()),
    );
    chain.act(&registrar());
    c.register_player(player(), None);
    c
}

impl Match {
    pub fn placing() -> Self {
        Self::placing_with(Board::new(&LEGAL_A, 1), Board::new(&LEGAL_B, 2))
    }

    fn placing_with(a: Board, b: Board) -> Self {
        let mut chain = Chain { height: 100 };
        let c = contract(&mut chain);
        Self::open(chain, c, a, b)
    }

    pub fn open(mut chain: Chain, mut c: Brinewar, a: Board, b: Board) -> Self {
        chain.act(&player());
        let id = c.new_game_vs_nauarch(None);
        Match { chain, c, id, a, b }
    }

    pub fn next_game(self, a: Board, b: Board) -> Self {
        let Match { chain, c, .. } = self;
        Self::open(chain, c, a, b)
    }

    pub fn started() -> Self {
        Self::started_with(Board::new(&LEGAL_A, 1), Board::new(&LEGAL_B, 2))
    }

    pub fn started_with(a: Board, b: Board) -> Self {
        let mut m = Self::placing_with(a, b);
        m.commit_both();
        m
    }

    pub fn commit_both(&mut self) {
        self.chain.act(&player());
        self.c.commit_board(self.id, self.a.root_hex(), None);
        self.chain.act(&nauarch());
        self.c.commit_board(self.id, self.b.root_hex(), None);
    }

    pub fn fire(&mut self, who: &AccountId, index: u8) {
        if *who == nauarch() {
            let reply = format!(
                r#"{{"shot":"{}","line":"Steady, Captain."}}"#,
                cell_name(index)
            );
            self.ai(MoveKind::Shot, &reply);
            return;
        }
        self.chain.skip(1);
        self.chain.act(who);
        self.c.fire(self.id, index);
    }

    pub fn ai(&mut self, kind: MoveKind, reply: &str) {
        self.chain.skip(1);
        self.chain.act(&nauarch());
        let request = self.c.nauarch_request(self.id, kind);
        let response = response_with(reply);
        let sig = sign(&request, &response);
        self.c.submit_ai_move(self.id, kind, response, sig);
    }

    pub fn answer_truthfully(&mut self, who: &AccountId, index: u8) {
        let board = if *who == player() { &self.a } else { &self.b };
        let cell = board.cells[index as usize];
        let salt = board.salt_hex(index);
        let pf = board.proof_hex(index);
        self.chain.skip(1);
        self.chain.act(who);
        self.c
            .answer(self.id, index, cell, salt, pf, None, None, None);
    }

    pub fn exchange(&mut self, a_shot: u8, b_shot: u8) {
        self.fire(&player(), a_shot);
        self.answer_truthfully(&nauarch(), a_shot);
        if self.view().status != Status::Playing || self.view().turn != nauarch() {
            return;
        }
        self.fire(&nauarch(), b_shot);
        let fired = self.view().pending_index.unwrap_or(b_shot);
        self.answer_truthfully(&player(), fired);
    }

    pub fn a_sinks_b(&mut self) {
        let targets = self.b.ship_cells();
        let water = self.b.water_cells();
        let misses = self.a.water_cells();
        for (k, &t) in targets.iter().enumerate() {
            self.exchange(water[k], misses[k]);
            self.fire(&player(), t);
            self.answer_truthfully(&nauarch(), t);
        }
    }

    pub fn reveal(&mut self, who: &AccountId) {
        let board = if *who == player() { &self.a } else { &self.b };
        let (cells, s) = (board.cells_str(), board.salts_hex());
        self.chain.skip(1);
        self.chain.act(who);
        self.c.reveal(self.id, cells, s);
    }

    pub fn view(&self) -> GameView {
        self.c.get_game(self.id).unwrap()
    }
}

pub fn panics<F: FnOnce()>(f: F) -> String {
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f));
    match r {
        Ok(()) => panic!("expected a panic"),
        Err(e) => e
            .downcast_ref::<String>()
            .cloned()
            .or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string()))
            .unwrap_or_default(),
    }
}

pub fn events(name: &str) -> Vec<serde_json::Value> {
    get_logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .map(|l| serde_json::from_str::<serde_json::Value>(l).unwrap())
        .filter(|v| v["event"] == name)
        .collect()
}

#[test]
fn new_game_starts_in_placement_and_blocks_second_game() {
    let mut m = Match::placing();
    let v = m.view();
    assert_eq!(v.status, Status::Placing);
    assert_eq!(v.a, player());
    assert_eq!(v.b, nauarch());
    assert_eq!(m.c.active_game_of(player()), Some(m.id));
    assert_eq!(events("game_created").len(), 1);
    m.chain.act(&player());
    let msg = panics(|| {
        m.c.new_game_vs_nauarch(None);
    });
    assert!(msg.contains("finish your current game"), "{msg}");
}

#[test]
fn nauarch_cannot_open_a_game() {
    let mut m = Match::placing();
    m.chain.act(&nauarch());
    let msg = panics(|| {
        m.c.new_game_vs_nauarch(None);
    });
    assert!(msg.contains("cannot play itself"), "{msg}");
}

#[test]
fn both_commits_start_play_with_player_first() {
    let mut m = Match::placing();
    m.chain.act(&player());
    m.c.commit_board(m.id, m.a.root_hex(), None);
    assert_eq!(m.view().status, Status::Placing);
    m.chain.act(&nauarch());
    m.c.commit_board(m.id, m.b.root_hex(), None);
    let v = m.view();
    assert_eq!(v.status, Status::Playing);
    assert_eq!(v.turn, player());
    assert_eq!(v.root_a, Some(m.a.root_hex()));
}

#[test]
fn commit_twice_or_by_stranger_fails() {
    let mut m = Match::placing();
    m.chain.act(&player());
    m.c.commit_board(m.id, m.a.root_hex(), None);
    let root = m.a.root_hex();
    let msg = panics(|| m.c.commit_board(m.id, root.clone(), None));
    assert!(msg.contains("already committed"), "{msg}");
    m.chain.act(&acc("stranger.testnet"));
    let msg = panics(|| m.c.commit_board(m.id, root.clone(), None));
    assert!(msg.contains("not a player"), "{msg}");
}

#[test]
fn commit_rejects_malformed_root() {
    let mut m = Match::placing();
    m.chain.act(&player());
    let msg = panics(|| m.c.commit_board(m.id, "abcd".into(), None));
    assert!(msg.contains("32 bytes"), "{msg}");
}

#[test]
fn fire_out_of_turn_fails() {
    let mut m = Match::started();
    m.fire(&player(), 5);
    m.answer_truthfully(&nauarch(), 5);
    m.chain.act(&player());
    let msg = panics(|| m.c.fire(m.id, 6));
    assert!(msg.contains("not your turn"), "{msg}");
}

#[test]
fn nauarch_cannot_use_plain_fire() {
    let mut m = Match::started();
    m.exchange(5, 5);
    m.fire(&player(), 6);
    m.answer_truthfully(&nauarch(), 6);
    m.chain.act(&nauarch());
    let msg = panics(|| m.c.fire(m.id, 7));
    assert!(msg.contains("submit_ai_move"), "{msg}");
}

#[test]
fn second_shot_before_answer_fails() {
    let mut m = Match::started();
    m.fire(&player(), 5);
    m.chain.act(&player());
    let msg = panics(|| m.c.fire(m.id, 6));
    assert!(msg.contains("not your turn"), "{msg}");
}

#[test]
fn repeated_or_off_board_cell_fails() {
    let mut m = Match::started();
    m.exchange(5, 5);
    m.chain.act(&player());
    let msg = panics(|| m.c.fire(m.id, 5));
    assert!(msg.contains("already fired"), "{msg}");
    let msg = panics(|| m.c.fire(m.id, 100));
    assert!(msg.contains("out of board"), "{msg}");
}

#[test]
fn honest_answers_record_hit_and_miss() {
    let mut m = Match::started();
    let water = m.b.water_cells()[0];
    m.fire(&player(), 0);
    m.answer_truthfully(&nauarch(), 0);
    m.fire(&player(), water);
    m.answer_truthfully(&nauarch(), water);
    m.fire(&nauarch(), 9);
    m.answer_truthfully(&player(), 9);
    let h = m.c.get_history(m.id);
    assert_eq!(h.len(), 3);
    assert_eq!(h[0].result, ShotResult::Hit);
    assert_eq!(h[0].by, player());
    assert_eq!(h[1].result, ShotResult::Miss);
    assert_eq!(h[2].result, ShotResult::Miss);
    assert_eq!(h[2].by, nauarch());
    let v = m.view();
    assert_eq!(v.hits_on_b, 1);
    assert_eq!(v.hits_on_a, 0);
    assert_eq!(v.turn, player());
    assert_eq!(events("shot_answered").len(), 1);
}

#[test]
fn a_hit_earns_another_shot_and_a_miss_passes_the_turn() {
    let mut m = Match::started();
    let ship = m.b.ship_cells()[0];
    let water = m.b.water_cells()[0];
    m.fire(&player(), ship);
    m.answer_truthfully(&nauarch(), ship);
    assert_eq!(m.view().turn, player());
    let msg = panics(|| {
        m.chain.act(&nauarch());
        m.c.nauarch_fallback(m.id);
    });
    assert!(
        msg.contains("not your turn") || msg.contains("turn"),
        "{msg}"
    );
    m.fire(&player(), water);
    m.answer_truthfully(&nauarch(), water);
    assert_eq!(m.view().turn, nauarch());
    let mine = m.a.ship_cells()[0];
    m.fire(&nauarch(), mine);
    m.answer_truthfully(&player(), mine);
    assert_eq!(m.view().turn, nauarch());
}

#[test]
fn lying_miss_is_rejected() {
    let mut m = Match::started();
    m.fire(&player(), 0);
    let (salt, pf) = (m.b.salt_hex(0), m.b.proof_hex(0));
    m.chain.act(&nauarch());
    let msg = panics(|| {
        m.c.answer(m.id, 0, 0, salt.clone(), pf.clone(), None, None, None)
    });
    assert!(msg.contains("proof does not match"), "{msg}");
}

#[test]
fn swapped_salt_is_rejected() {
    let mut m = Match::started();
    m.fire(&player(), 0);
    let (salt, pf) = (m.b.salt_hex(1), m.b.proof_hex(0));
    m.chain.act(&nauarch());
    let msg = panics(|| {
        m.c.answer(m.id, 0, 1, salt.clone(), pf.clone(), None, None, None)
    });
    assert!(msg.contains("proof does not match"), "{msg}");
}

#[test]
fn answer_for_other_index_is_rejected() {
    let mut m = Match::started();
    m.fire(&player(), 0);
    let (salt, pf) = (m.b.salt_hex(1), m.b.proof_hex(1));
    m.chain.act(&nauarch());
    let msg = panics(|| {
        m.c.answer(m.id, 1, 0, salt.clone(), pf.clone(), None, None, None)
    });
    assert!(msg.contains("does not match the pending shot"), "{msg}");
}

#[test]
fn proof_from_other_board_is_rejected() {
    let mut m = Match::started();
    m.fire(&player(), 0);
    let other = Board::new(&LEGAL_B, 9);
    let (salt, pf) = (other.salt_hex(0), other.proof_hex(0));
    m.chain.act(&nauarch());
    let msg = panics(|| {
        m.c.answer(m.id, 0, 1, salt.clone(), pf.clone(), None, None, None)
    });
    assert!(msg.contains("proof does not match"), "{msg}");
}

#[test]
fn shooter_cannot_answer_own_shot() {
    let mut m = Match::started();
    m.fire(&player(), 0);
    let (salt, pf) = (m.a.salt_hex(0), m.a.proof_hex(0));
    m.chain.act(&player());
    let msg = panics(|| {
        m.c.answer(m.id, 0, 1, salt.clone(), pf.clone(), None, None, None)
    });
    assert!(msg.contains("not your turn"), "{msg}");
}

#[test]
fn short_proof_is_rejected() {
    let mut m = Match::started();
    m.fire(&player(), 0);
    let salt = m.b.salt_hex(0);
    let pf: Vec<String> = m.b.proof_hex(0).into_iter().take(DEPTH - 1).collect();
    m.chain.act(&nauarch());
    let msg = panics(|| {
        m.c.answer(m.id, 0, 1, salt.clone(), pf.clone(), None, None, None)
    });
    assert!(msg.contains("proof must have 7"), "{msg}");
}

#[test]
fn sinking_the_fleet_then_valid_reveal_finishes_the_game() {
    let mut m = Match::started();
    m.a_sinks_b();
    let v = m.view();
    assert_eq!(v.status, Status::Revealing);
    assert_eq!(v.hits_on_b, 20);
    assert_eq!(m.c.active_game_of(player()), Some(m.id));
    m.reveal(&player());
    let v = m.view();
    assert_eq!(v.status, Status::Finished);
    assert_eq!(v.winner, Some(player()));
    assert_eq!(v.finish_reason, Some(FinishReason::FleetSunk));
    assert_eq!(m.c.active_game_of(player()), None);
    let revealed = events("board_revealed");
    assert_eq!(revealed[0]["data"][0]["valid"], true);
    assert_eq!(revealed[0]["data"][0]["cells"], m.a.cells_str());
    m.reveal(&nauarch());
    assert!(m.view().revealed_b);
    assert_eq!(m.view().winner, Some(player()));
}

#[test]
fn illegal_fleet_of_the_winner_hands_the_win_to_the_opponent() {
    let mut m = Match::started_with(Board::new(&BENT, 1), Board::new(&LEGAL_B, 2));
    m.a_sinks_b();
    m.reveal(&player());
    let v = m.view();
    assert_eq!(v.status, Status::Finished);
    assert_eq!(v.winner, Some(nauarch()));
    assert_eq!(v.finish_reason, Some(FinishReason::IllegalFleet));
    let revealed = events("board_revealed");
    assert_eq!(revealed[0]["data"][0]["valid"], false);
}

#[test]
fn reveal_that_does_not_match_root_is_rejected() {
    let mut m = Match::started();
    m.a_sinks_b();
    let wrong = Board::new(&LEGAL_A, 7);
    let (cells, s) = (wrong.cells_str(), wrong.salts_hex());
    m.chain.act(&player());
    let msg = panics(|| m.c.reveal(m.id, cells.clone(), s.clone()));
    assert!(msg.contains("does not match the committed root"), "{msg}");
    assert_eq!(m.view().status, Status::Revealing);
}

#[test]
fn reveal_during_play_is_rejected() {
    let mut m = Match::started();
    let (cells, s) = (m.a.cells_str(), m.a.salts_hex());
    m.chain.act(&player());
    let msg = panics(|| m.c.reveal(m.id, cells.clone(), s.clone()));
    assert!(msg.contains("not over"), "{msg}");
}

#[test]
fn missed_reveal_deadline_gives_the_win_to_the_loser() {
    let mut m = Match::started();
    m.a_sinks_b();
    m.chain.skip(TIMEOUT + 1);
    m.chain.act(&acc("anyone.testnet"));
    m.c.claim_timeout(m.id);
    let v = m.view();
    assert_eq!(v.winner, Some(nauarch()));
    assert_eq!(v.finish_reason, Some(FinishReason::RevealTimeout));
}

#[test]
fn missed_move_deadline_gives_the_win_to_the_other_side() {
    let mut m = Match::started();
    m.fire(&player(), 0);
    m.chain.skip(TIMEOUT + 1);
    let (salt, pf) = (m.b.salt_hex(0), m.b.proof_hex(0));
    m.chain.act(&nauarch());
    let msg = panics(|| {
        m.c.answer(m.id, 0, 1, salt.clone(), pf.clone(), None, None, None)
    });
    assert!(msg.contains("deadline passed"), "{msg}");
    m.chain.act(&acc("anyone.testnet"));
    m.c.claim_timeout(m.id);
    let v = m.view();
    assert_eq!(v.winner, Some(player()));
    assert_eq!(v.finish_reason, Some(FinishReason::Timeout));
    assert_eq!(m.c.active_game_of(player()), None);
}

#[test]
fn early_timeout_claim_fails() {
    let mut m = Match::started();
    m.chain.act(&acc("anyone.testnet"));
    let msg = panics(|| m.c.claim_timeout(m.id));
    assert!(msg.contains("deadline has not passed"), "{msg}");
}

#[test]
fn placement_timeout_cancels_without_winner() {
    let mut m = Match::placing();
    m.chain.act(&player());
    m.c.commit_board(m.id, m.a.root_hex(), None);
    m.chain.skip(TIMEOUT + 1);
    m.chain.act(&acc("anyone.testnet"));
    m.c.claim_timeout(m.id);
    assert!(m.c.get_game(m.id).is_none());
    let fin = events("game_finished");
    assert_eq!(fin[0]["data"][0]["reason"], "Cancelled");
    assert_eq!(fin[0]["data"][0]["winner"], serde_json::Value::Null);
    m.chain.act(&player());
    let id2 = m.c.new_game_vs_nauarch(None);
    assert_eq!(id2, m.id + 1);
}

#[test]
fn resign_in_play_gives_the_win_to_the_opponent() {
    let mut m = Match::started();
    m.exchange(9, 9);
    m.chain.act(&player());
    m.c.resign(m.id);
    let v = m.view();
    assert_eq!(v.winner, Some(nauarch()));
    assert_eq!(v.finish_reason, Some(FinishReason::Resigned));
    assert_eq!(events("game_finished").len(), 1);
}

#[test]
fn resign_after_the_fleet_is_sunk_fails() {
    let mut m = Match::started();
    m.a_sinks_b();
    m.chain.act(&nauarch());
    let msg = panics(|| m.c.resign(m.id));
    assert!(msg.contains("already decided"), "{msg}");
}

#[test]
fn board_with_too_few_ships_loses_once_all_water_is_found() {
    let mut m = Match::started_with(Board::new(&LEGAL_A, 1), Board::new(&[0, 1, 2], 2));
    let b_water = m.b.water_cells();
    let a_water = m.a.water_cells();
    for k in 0..=MAX_MISSES as usize {
        m.fire(&player(), b_water[k]);
        m.answer_truthfully(&nauarch(), b_water[k]);
        if m.view().status != Status::Playing {
            break;
        }
        m.fire(&nauarch(), a_water[k]);
        m.answer_truthfully(&player(), a_water[k]);
    }
    let v = m.view();
    assert_eq!(v.status, Status::Revealing);
    assert_eq!(v.winner, Some(player()));
    m.reveal(&player());
    let v = m.view();
    assert_eq!(v.status, Status::Finished);
    assert_eq!(v.winner, Some(player()));
    assert_eq!(v.finish_reason, Some(FinishReason::IllegalFleet));
}

#[test]
fn shooter_with_illegal_board_cannot_win_by_misses() {
    let mut m = Match::started_with(Board::new(&BENT, 1), Board::new(&[0, 1, 2], 2));
    let b_water = m.b.water_cells();
    let a_water = m.a.water_cells();
    for k in 0..=MAX_MISSES as usize {
        m.fire(&player(), b_water[k]);
        m.answer_truthfully(&nauarch(), b_water[k]);
        if m.view().status != Status::Playing {
            break;
        }
        m.fire(&nauarch(), a_water[k]);
        m.answer_truthfully(&player(), a_water[k]);
    }
    m.reveal(&player());
    let v = m.view();
    assert_eq!(v.winner, Some(nauarch()));
    assert_eq!(v.finish_reason, Some(FinishReason::IllegalFleet));
}

#[test]
fn eighty_misses_on_an_honest_board_keep_the_game_going() {
    let mut m = Match::started();
    let b_water = m.b.water_cells();
    let a_water = m.a.water_cells();
    for k in 0..b_water.len() {
        m.exchange(b_water[k], a_water[k]);
    }
    let v = m.view();
    assert_eq!(v.status, Status::Playing);
    assert_eq!(v.hits_on_b, 0);
    assert_eq!(m.c.get_history(m.id).len(), 160);
}

#[test]
fn late_winning_reveal_is_rejected_and_loser_can_claim() {
    let mut m = Match::started();
    m.a_sinks_b();
    m.chain.skip(TIMEOUT + 1);
    let (cells, s) = (m.a.cells_str(), m.a.salts_hex());
    m.chain.act(&player());
    let msg = panics(|| m.c.reveal(m.id, cells.clone(), s.clone()));
    assert!(msg.contains("deadline passed"), "{msg}");
    m.chain.act(&nauarch());
    m.c.claim_timeout(m.id);
    assert_eq!(m.view().winner, Some(nauarch()));
}

#[test]
fn loser_may_reveal_before_the_winner_without_changing_the_outcome() {
    let mut m = Match::started();
    m.a_sinks_b();
    m.reveal(&nauarch());
    let v = m.view();
    assert_eq!(v.status, Status::Revealing);
    assert!(v.revealed_b);
    m.reveal(&player());
    assert_eq!(m.view().winner, Some(player()));
}

#[test]
fn double_reveal_is_rejected() {
    let mut m = Match::started();
    m.a_sinks_b();
    m.reveal(&player());
    let (cells, s) = (m.a.cells_str(), m.a.salts_hex());
    m.chain.act(&player());
    let msg = panics(|| m.c.reveal(m.id, cells.clone(), s.clone()));
    assert!(msg.contains("already revealed"), "{msg}");
}

#[test]
fn open_games_are_capped_and_freed_on_finish() {
    let mut m = Match::placing();
    m.chain.act(&registrar());
    for i in [2, 3, 9] {
        m.c.register_player(acc(&format!("p-{i}.brinewar.testnet")), None);
    }
    for i in 2..=MAX_OPEN {
        m.chain.act(&acc(&format!("p-{i}.brinewar.testnet")));
        m.c.new_game_vs_nauarch(None);
    }
    m.chain.act(&acc("p-9.brinewar.testnet"));
    let msg = panics(|| {
        m.c.new_game_vs_nauarch(None);
    });
    assert!(msg.contains("busy"), "{msg}");
    m.chain.act(&player());
    m.c.resign(m.id);
    assert_eq!(m.c.config().open_games, MAX_OPEN - 1);
    m.chain.act(&acc("p-9.brinewar.testnet"));
    m.c.new_game_vs_nauarch(None);
}

#[path = "tests_stage3.rs"]
mod stage3;

#[path = "tests_stage6.rs"]
mod stage6;
