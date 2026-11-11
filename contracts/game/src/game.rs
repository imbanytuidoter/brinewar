use crate::merkle::Hash;
use near_sdk::{near, AccountId};

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    VsNauarch,
    PvP,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Placing,
    Playing,
    Revealing,
    Finished,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    A,
    B,
}

impl Side {
    pub fn other(self) -> Side {
        match self {
            Side::A => Side::B,
            Side::B => Side::A,
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShotResult {
    Pending,
    Hit,
    Miss,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FinishReason {
    FleetSunk,
    Timeout,
    RevealTimeout,
    IllegalFleet,
    Resigned,
    Cancelled,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Shot {
    pub by: Side,
    pub index: u8,
    pub result: ShotResult,
    pub block: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Game {
    pub id: u64,
    pub mode: Mode,
    pub a: AccountId,
    pub b: AccountId,
    pub root_a: Option<Hash>,
    pub root_b: Option<Hash>,
    pub shots: Vec<Shot>,
    pub fired_a: u128,
    pub fired_b: u128,
    pub hits_on_a: u8,
    pub hits_on_b: u8,
    pub misses_on_a: u8,
    pub misses_on_b: u8,
    pub turn: Side,
    pub deadline_block: u64,
    pub status: Status,
    pub winner: Option<Side>,
    pub finish_reason: Option<FinishReason>,
    pub revealed_a: bool,
    pub revealed_b: bool,
    pub created_block: u64,
    pub stake: u128,
}

impl Game {
    pub fn side_of(&self, account: &AccountId) -> Option<Side> {
        if *account == self.a {
            Some(Side::A)
        } else if *account == self.b {
            Some(Side::B)
        } else {
            None
        }
    }

    pub fn account(&self, side: Side) -> &AccountId {
        match side {
            Side::A => &self.a,
            Side::B => &self.b,
        }
    }

    pub fn root(&self, side: Side) -> Option<Hash> {
        match side {
            Side::A => self.root_a,
            Side::B => self.root_b,
        }
    }

    pub fn set_root(&mut self, side: Side, root: Hash) {
        match side {
            Side::A => self.root_a = Some(root),
            Side::B => self.root_b = Some(root),
        }
    }

    pub fn has_fired(&self, side: Side, index: u8) -> bool {
        let mask = 1u128 << index;
        match side {
            Side::A => self.fired_a & mask != 0,
            Side::B => self.fired_b & mask != 0,
        }
    }

    pub fn mark_fired(&mut self, side: Side, index: u8) {
        let mask = 1u128 << index;
        match side {
            Side::A => self.fired_a |= mask,
            Side::B => self.fired_b |= mask,
        }
    }

    pub fn hits_on(&self, side: Side) -> u8 {
        match side {
            Side::A => self.hits_on_a,
            Side::B => self.hits_on_b,
        }
    }

    pub fn misses_on(&self, side: Side) -> u8 {
        match side {
            Side::A => self.misses_on_a,
            Side::B => self.misses_on_b,
        }
    }

    pub fn record_answer(&mut self, defender: Side, hit: bool) {
        match (defender, hit) {
            (Side::A, true) => self.hits_on_a += 1,
            (Side::B, true) => self.hits_on_b += 1,
            (Side::A, false) => self.misses_on_a += 1,
            (Side::B, false) => self.misses_on_b += 1,
        }
    }

    pub fn revealed(&self, side: Side) -> bool {
        match side {
            Side::A => self.revealed_a,
            Side::B => self.revealed_b,
        }
    }

    pub fn set_revealed(&mut self, side: Side) {
        match side {
            Side::A => self.revealed_a = true,
            Side::B => self.revealed_b = true,
        }
    }

    pub fn pending_shot(&self) -> Option<&Shot> {
        self.shots
            .last()
            .filter(|s| s.result == ShotResult::Pending)
    }
}

#[near(serializers = [json])]
pub struct GameView {
    pub id: u64,
    pub mode: Mode,
    pub a: AccountId,
    pub b: AccountId,
    pub root_a: Option<String>,
    pub root_b: Option<String>,
    pub status: Status,
    pub turn: AccountId,
    pub deadline_block: u64,
    pub winner: Option<AccountId>,
    pub finish_reason: Option<FinishReason>,
    pub hits_on_a: u8,
    pub hits_on_b: u8,
    pub shots: u32,
    pub pending_index: Option<u8>,
    pub revealed_a: bool,
    pub revealed_b: bool,
    pub created_block: u64,
}

#[near(serializers = [json])]
pub struct ShotView {
    pub n: u32,
    pub by: AccountId,
    pub index: u8,
    pub result: ShotResult,
    pub block: u64,
}

impl From<&Game> for GameView {
    fn from(g: &Game) -> Self {
        GameView {
            id: g.id,
            mode: g.mode,
            a: g.a.clone(),
            b: g.b.clone(),
            root_a: g.root_a.map(hex::encode),
            root_b: g.root_b.map(hex::encode),
            status: g.status,
            turn: g.account(g.turn).clone(),
            deadline_block: g.deadline_block,
            winner: g.winner.map(|s| g.account(s).clone()),
            finish_reason: g.finish_reason,
            hits_on_a: g.hits_on_a,
            hits_on_b: g.hits_on_b,
            shots: g.shots.len() as u32,
            pending_index: g.pending_shot().map(|s| s.index),
            revealed_a: g.revealed_a,
            revealed_b: g.revealed_b,
            created_block: g.created_block,
        }
    }
}
