use crate::events::emit;
use crate::game::{FinishReason, Game, Side};
use crate::settings::Settings;
use crate::tokens::GOLD;
use crate::{Brinewar, BrinewarExt};
use near_sdk::json_types::U128;
use near_sdk::{env, near};
use serde_json::json;

pub fn entry_fee(s: &Settings, treasury: u128) -> u128 {
    let t = s.entry_threshold.0;
    if treasury >= t {
        s.base_entry.0
    } else {
        s.base_entry.0 * (2 * t - treasury) / t
    }
}

pub fn bounty(s: &Settings, treasury: u128) -> u128 {
    (treasury * s.bounty_bps as u128 / 10_000).min(s.bounty_cap.0)
}

#[near(serializers = [json])]
pub struct TreasuryView {
    pub account: near_sdk::AccountId,
    pub balance: U128,
    pub entry: U128,
    pub bounty: U128,
    pub threshold: U128,
}

#[near]
impl Brinewar {
    pub fn treasury(&self) -> TreasuryView {
        let balance = self.treasury_balance();
        TreasuryView {
            account: self.nauarch.clone(),
            balance: U128(balance),
            entry: U128(entry_fee(&self.settings, balance)),
            bounty: U128(bounty(&self.settings, balance)),
            threshold: self.settings.entry_threshold,
        }
    }
}

impl Brinewar {
    pub(crate) fn treasury_balance(&self) -> u128 {
        self.balance(GOLD, &self.nauarch)
    }

    pub(crate) fn take_stake(&mut self, player: &near_sdk::AccountId) -> u128 {
        let entry = entry_fee(&self.settings, self.treasury_balance());
        let stake = entry.min(self.balance(GOLD, player));
        if stake > 0 {
            let escrow = env::current_account_id();
            self.move_tokens(player, &escrow, GOLD, stake, Some("stake"));
        }
        stake
    }

    pub(crate) fn settle(&mut self, game: &Game, winner: Option<Side>, reason: FinishReason) {
        let escrow = env::current_account_id();
        let player = game.a.clone();
        let nauarch = self.nauarch.clone();
        let before = self.treasury_balance();
        let mut won = 0u128;
        match winner {
            Some(Side::A) => {
                if game.stake > 0 {
                    self.move_tokens(&escrow, &player, GOLD, game.stake, Some("stake refund"));
                }
                if game.sank_fleet() && self.claim_bounty_slot(&player) {
                    won = bounty(&self.settings, before);
                }
                if won > 0 {
                    self.move_tokens(&nauarch, &player, GOLD, won, Some("bounty"));
                }
            }
            Some(Side::B) => {
                if game.stake > 0 {
                    self.move_tokens(&escrow, &nauarch, GOLD, game.stake, Some("entry"));
                }
            }
            None => {
                if game.stake > 0 {
                    self.move_tokens(&escrow, &player, GOLD, game.stake, Some("stake refund"));
                }
            }
        }
        let after = self.treasury_balance();
        emit(
            "treasury_changed",
            json!({
                "game_id": game.id,
                "player": player,
                "reason": reason,
                "winner": winner.map(|s| game.account(s).clone()),
                "stake": U128(game.stake),
                "bounty": U128(won),
                "before": U128(before),
                "after": U128(after),
                "next_entry": U128(entry_fee(&self.settings, after)),
                "next_bounty": U128(bounty(&self.settings, after)),
                "block": env::block_height(),
            }),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s() -> Settings {
        Settings {
            move_timeout_blocks: 10,
            max_open_games: 10,
            blocks_per_day: 100,
            min_heat_shots: 10,
            start_gold: U128(100),
            base_entry: U128(10),
            entry_threshold: U128(500),
            bounty_bps: 500,
            bounty_cap: U128(25),
            guest_fund: U128(1),
            guest_allowance: U128(1),
            guests_per_day: 10,
            games_per_day: 10,
            bounties_per_day: 1,
            min_heat_boards: 1,
        }
    }

    #[test]
    fn entry_is_base_above_threshold_and_doubles_when_empty() {
        assert_eq!(entry_fee(&s(), 2_000), 10);
        assert_eq!(entry_fee(&s(), 500), 10);
        assert_eq!(entry_fee(&s(), 250), 15);
        assert_eq!(entry_fee(&s(), 0), 20);
    }

    #[test]
    fn bounty_is_five_percent_capped() {
        assert_eq!(bounty(&s(), 2_000), 25);
        assert_eq!(bounty(&s(), 400), 20);
        assert_eq!(bounty(&s(), 10), 0);
    }
}
