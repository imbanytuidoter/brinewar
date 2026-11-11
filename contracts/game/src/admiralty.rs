use crate::events::emit;
use crate::fleet::CELLS;
use crate::{Brinewar, BrinewarExt};
use near_sdk::serde_json::json;
use near_sdk::{env, near};

pub const HOT_CELLS: usize = 30;

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct AdmiraltyMap {
    pub heat: Vec<u32>,
    pub boards: u32,
}

impl Default for AdmiraltyMap {
    fn default() -> Self {
        AdmiraltyMap {
            heat: vec![0; CELLS],
            boards: 0,
        }
    }
}

#[near(serializers = [json])]
pub struct AdmiraltyView {
    pub heat: Vec<u32>,
    pub boards_counted: u32,
    pub day: u64,
}

impl AdmiraltyMap {
    pub fn hunt_order(&self) -> Vec<u8> {
        let mut order: Vec<u8> = (0..CELLS as u8).collect();
        order.sort_by(|&x, &y| {
            self.heat[y as usize]
                .cmp(&self.heat[x as usize])
                .then(x.cmp(&y))
        });
        order
    }

    pub fn hot_cells(&self, min_boards: u32) -> Vec<(u8, u8)> {
        if self.boards == 0 || self.boards < min_boards {
            return Vec::new();
        }
        self.hunt_order()
            .into_iter()
            .filter(|&i| self.heat[i as usize] > 0)
            .take(HOT_CELLS)
            .map(|i| {
                let pct = (self.heat[i as usize] as u64 * 100 / self.boards as u64).min(100);
                (i, pct as u8)
            })
            .collect()
    }
}

#[near]
impl Brinewar {
    pub fn admiralty_map(&self) -> AdmiraltyView {
        let map = self.map.get();
        AdmiraltyView {
            heat: map.heat.clone(),
            boards_counted: map.boards,
            day: self.today(),
        }
    }
}

impl Brinewar {
    pub(crate) fn today(&self) -> u64 {
        env::block_height() / self.settings.blocks_per_day
    }

    pub(crate) fn count_board(&mut self, game: &crate::game::Game, cells: &[u8; CELLS]) -> bool {
        let game_id = game.id;
        let account = &game.a;
        if game.finish_reason != Some(crate::game::FinishReason::FleetSunk) {
            return false;
        }
        if game.answered_by(crate::game::Side::A) < self.settings.min_heat_shots as usize {
            return false;
        }
        let day = self.today();
        if self.heat_day.get(account) == Some(&day) {
            return false;
        }
        self.heat_day.insert(account.clone(), day);
        let map = self.map.get_mut();
        for (h, &c) in map.heat.iter_mut().zip(cells.iter()) {
            *h += c as u32;
        }
        map.boards += 1;
        let boards = map.boards;
        emit(
            "heat_updated",
            json!({"game_id": game_id, "day": day, "boards_counted": boards, "account": account}),
        );
        true
    }
}
