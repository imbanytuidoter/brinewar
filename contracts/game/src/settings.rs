use near_sdk::json_types::U128;
use near_sdk::{near, require};

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Settings {
    pub move_timeout_blocks: u64,
    pub max_open_games: u32,
    pub blocks_per_day: u64,
    pub min_heat_shots: u32,
    pub start_gold: U128,
    pub base_entry: U128,
    pub entry_threshold: U128,
    pub bounty_bps: u32,
    pub bounty_cap: U128,
    pub guest_fund: U128,
    pub guest_allowance: U128,
    pub guests_per_day: u32,
    pub games_per_day: u32,
    pub bounties_per_day: u32,
    pub min_heat_boards: u32,
}

impl Settings {
    pub fn check(&self) {
        require!(
            self.move_timeout_blocks > 0,
            "move_timeout_blocks must be positive"
        );
        require!(self.blocks_per_day > 0, "blocks_per_day must be positive");
        require!(
            self.entry_threshold.0 > 0,
            "entry_threshold must be positive"
        );
        require!(
            self.bounty_bps <= 10_000,
            "bounty_bps must be at most 10000"
        );
        require!(
            self.guest_allowance.0 > 0,
            "guest_allowance must be positive"
        );
    }
}
