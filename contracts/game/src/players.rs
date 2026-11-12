use crate::events::emit;
use crate::fleet::{BOARD_SIZE, CELLS};
use crate::tokens::{ship_id, ship_token, GOLD, STARTER_SKINS};
use crate::{Brinewar, BrinewarExt};
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{
    env, near, require, AccountId, Allowance, Gas, NearToken, Promise, PromiseError, PublicKey,
};

pub const GUEST_METHODS: &str =
    "new_game_vs_nauarch,new_game_pvp,join_game,commit_board,fire,answer,reveal,resign,claim_timeout,set_nickname";
pub const ZONES: [&str; 9] = [
    "north-west",
    "north",
    "north-east",
    "west",
    "centre",
    "east",
    "south-west",
    "south",
    "south-east",
];
pub const RANKS: [(&str, u64, &str); 5] = [
    ("Ensign", 0, "Cutter"),
    ("Lieutenant", 100, "Sloop"),
    ("Captain", 300, "Frigate"),
    ("Commodore", 700, "Ship of the line"),
    ("Admiral", 1500, "Flagship"),
];
pub const GUEST_CALLBACK_GAS: Gas = Gas::from_tgas(10);
pub const XP_HIT: u64 = 10;
pub const XP_SUNK: u64 = 30;
pub const XP_WIN: u64 = 100;

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Player {
    pub nickname: Option<String>,
    pub games: u32,
    pub wins: u32,
    pub losses: u32,
    pub last_won: Option<bool>,
    pub last_game_block: u64,
    pub zones: [u32; 9],
    pub flagship: u64,
    pub day: u64,
    pub games_today: u32,
    pub bounties_today: u32,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct ShipStats {
    pub owner: AccountId,
    pub captain: AccountId,
    pub xp: u64,
    pub wins: u32,
    pub losses: u32,
    pub sunk: u32,
}

#[near(serializers = [json])]
pub struct PlayerView {
    pub account_id: AccountId,
    pub nickname: Option<String>,
    pub display_name: String,
    pub games_vs_nauarch: u32,
    pub wins: u32,
    pub losses: u32,
    pub last_result: Option<String>,
    pub last_game_block: u64,
    pub fav_zone: Option<String>,
    pub flagship: String,
    pub gold: U128,
}

#[near(serializers = [json])]
pub struct ShipView {
    pub token_id: String,
    pub owner_id: AccountId,
    pub captain: AccountId,
    pub class: String,
    pub rank: String,
    pub xp: u64,
    pub next_rank_xp: Option<u64>,
    pub wins: u32,
    pub losses: u32,
    pub sunk: u32,
    pub frozen: bool,
}

pub fn validate_nickname(name: &str) -> Result<(), String> {
    let ok_len = (3..=16).contains(&name.len());
    let ok_chars = name
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    if ok_len && ok_chars {
        Ok(())
    } else {
        Err("nickname must be 3-16 characters of A-Z a-z 0-9 _ -".into())
    }
}

pub fn display_name(account: &AccountId, nickname: &Option<String>) -> String {
    if let Some(n) = nickname {
        return n.clone();
    }
    let base = account.as_str();
    let base = base.strip_prefix("p-").unwrap_or(base);
    let short: String = base
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(4)
        .collect();
    format!("Captain {short}")
}

pub fn zone_of(index: usize) -> usize {
    let band = |v: usize| match v {
        0..=2 => 0,
        3..=6 => 1,
        _ => 2,
    };
    band(index / BOARD_SIZE) * 3 + band(index % BOARD_SIZE)
}

pub fn fav_zone(zones: &[u32; 9]) -> Option<usize> {
    let max = *zones.iter().max()?;
    if max == 0 {
        return None;
    }
    zones.iter().position(|&z| z == max)
}

pub fn rank_of(xp: u64) -> usize {
    RANKS
        .iter()
        .rposition(|&(_, min, _)| xp >= min)
        .unwrap_or(0)
}

pub fn guest_account_id(public_key: &PublicKey, parent: &AccountId) -> AccountId {
    let hash = hex::encode(env::sha256_array(public_key.as_bytes()));
    format!("p-{}.{}", &hash[..16], parent)
        .parse()
        .unwrap_or_else(|_| env::panic_str("cannot derive guest account id"))
}

fn ship_svg_markup(rank: usize, frozen: bool) -> String {
    let palette = ["#7aa6c2", "#5b8fb0", "#c9a227", "#b5532f", "#e8d8a8"];
    let sail = palette[rank];
    let masts: String = (0..=rank.min(3))
        .map(|m| {
            let x = 70 + m * 40;
            let h = 70 + (m % 2) * 14;
            format!(
                r##"<line x1="{x}" y1="{top}" x2="{x}" y2="130" stroke="#2b2b2b" stroke-width="3"/><path d="M{x} {top} L{x} {bot} L{sx} {bot} Z" fill="{sail}"/>"##,
                top = 130 - h,
                bot = 125,
                sx = x + 30
            )
        })
        .collect();
    let flag = if rank == RANKS.len() - 1 {
        r##"<path d="M70 52 L95 58 L70 64 Z" fill="#c0392b"/>"##
    } else {
        ""
    };
    let frost = if frozen {
        r##"<rect width="320" height="200" fill="#ffffff" opacity="0.35"/>"##
    } else {
        ""
    };
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#0e2a3b"/><path d="M0 150 Q40 140 80 150 T160 150 T240 150 T320 150 V200 H0 Z" fill="#14435e"/>{masts}{flag}<path d="M40 130 H280 L250 160 H70 Z" fill="#4a2f1d"/>{frost}</svg>"##
    )
}

#[near]
impl Brinewar {
    pub fn create_guest(&mut self, public_key: PublicKey, nickname: Option<String>) -> Promise {
        self.require_registrar();
        let parent = env::current_account_id();
        let account_id = guest_account_id(&public_key, &parent);
        self.count_guest();
        if self.players.contains_key(&account_id) {
            let fund = self.settings.guest_fund;
            emit(
                "guest_refueled",
                json!({"account": account_id, "amount": fund}),
            );
            return Promise::new(account_id.clone())
                .transfer(NearToken::from_yoctonear(fund.0))
                .then(
                    Self::ext(parent)
                        .with_static_gas(GUEST_CALLBACK_GAS)
                        .on_guest_refueled(account_id),
                );
        }
        self.register(&account_id, nickname);
        let allowance =
            Allowance::limited(NearToken::from_yoctonear(self.settings.guest_allowance.0))
                .unwrap_or_else(|| env::panic_str("guest_allowance must be positive"));
        Promise::new(account_id.clone())
            .create_account()
            .transfer(NearToken::from_yoctonear(self.settings.guest_fund.0))
            .add_access_key_allowance(
                public_key,
                allowance,
                parent.clone(),
                GUEST_METHODS.to_string(),
            )
            .then(
                Self::ext(parent)
                    .with_static_gas(GUEST_CALLBACK_GAS)
                    .on_guest_created(account_id),
            )
    }

    #[private]
    pub fn on_guest_created(
        &mut self,
        account_id: AccountId,
        #[callback_result] created: Result<(), PromiseError>,
    ) -> bool {
        if created.is_ok() {
            return true;
        }
        self.unregister(&account_id);
        self.guests_today = self.guests_today.saturating_sub(1);
        emit("guest_failed", json!({"account": account_id}));
        false
    }

    #[private]
    pub fn on_guest_refueled(
        &mut self,
        account_id: AccountId,
        #[callback_result] sent: Result<(), PromiseError>,
    ) -> bool {
        if sent.is_ok() {
            return true;
        }
        self.guests_today = self.guests_today.saturating_sub(1);
        emit("guest_refuel_failed", json!({"account": account_id}));
        false
    }

    pub fn register_player(&mut self, account_id: AccountId, nickname: Option<String>) {
        self.require_registrar();
        self.register(&account_id, nickname);
    }

    pub fn set_nickname(&mut self, nickname: String) {
        validate_nickname(&nickname).unwrap_or_else(|e| env::panic_str(&e));
        let account = env::predecessor_account_id();
        let mut p = self
            .players
            .get(&account)
            .cloned()
            .unwrap_or_else(|| env::panic_str("not a registered player"));
        p.nickname = Some(nickname.clone());
        self.players.insert(account.clone(), p);
        emit(
            "nickname_set",
            json!({"account": account, "nickname": nickname}),
        );
    }

    pub fn get_player(&self, account_id: AccountId) -> Option<PlayerView> {
        let p = self.players.get(&account_id)?;
        Some(PlayerView {
            display_name: display_name(&account_id, &p.nickname),
            nickname: p.nickname.clone(),
            games_vs_nauarch: p.games,
            wins: p.wins,
            losses: p.losses,
            last_result: p
                .last_won
                .map(|w| if w { "won" } else { "lost" }.to_string()),
            last_game_block: p.last_game_block,
            fav_zone: fav_zone(&p.zones).map(|z| ZONES[z].to_string()),
            flagship: ship_token(p.flagship),
            gold: U128(self.balance(GOLD, &account_id)),
            account_id,
        })
    }

    pub fn guest_account_for(&self, public_key: PublicKey) -> AccountId {
        guest_account_id(&public_key, &env::current_account_id())
    }

    pub fn get_ship(&self, token_id: String) -> Option<ShipView> {
        let id = ship_id(&token_id)?;
        let s = self.ships.get(&id)?;
        let r = rank_of(s.xp);
        Some(ShipView {
            token_id,
            owner_id: s.owner.clone(),
            captain: s.captain.clone(),
            class: RANKS[r].2.to_string(),
            rank: RANKS[r].0.to_string(),
            xp: s.xp,
            next_rank_xp: RANKS.get(r + 1).map(|x| x.1),
            wins: s.wins,
            losses: s.losses,
            sunk: s.sunk,
            frozen: s.owner != s.captain,
        })
    }

    pub fn ship_svg(&self, token_id: String) -> Option<String> {
        let s = self.ships.get(&ship_id(&token_id)?)?;
        Some(ship_svg_markup(rank_of(s.xp), s.owner != s.captain))
    }
}

impl Brinewar {
    fn require_registrar(&self) {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.registrar || caller == self.owner,
            "only the registrar registers players"
        );
    }

    fn count_guest(&mut self) {
        let day = env::block_height() / self.settings.blocks_per_day;
        if self.guests_day != day {
            self.guests_day = day;
            self.guests_today = 0;
        }
        require!(
            self.guests_today < self.settings.guests_per_day,
            "daily guest limit reached"
        );
        self.guests_today += 1;
    }

    pub(crate) fn register(&mut self, account: &AccountId, nickname: Option<String>) {
        require!(*account != self.nauarch, "the Nauarch is not a player");
        require!(
            !self.players.contains_key(account),
            "player already registered"
        );
        if let Some(n) = &nickname {
            validate_nickname(n).unwrap_or_else(|e| env::panic_str(&e));
        }
        let ship = self.next_ship_id;
        self.next_ship_id += 1;
        self.ships.insert(
            ship,
            ShipStats {
                owner: account.clone(),
                captain: account.clone(),
                xp: 0,
                wins: 0,
                losses: 0,
                sunk: 0,
            },
        );
        self.players.insert(
            account.clone(),
            Player {
                nickname,
                games: 0,
                wins: 0,
                losses: 0,
                last_won: None,
                last_game_block: 0,
                zones: [0; 9],
                flagship: ship,
                day: 0,
                games_today: 0,
                bounties_today: 0,
            },
        );
        let start = self.settings.start_gold.0;
        if start > 0 {
            self.mint(GOLD, account, start, Some("welcome"));
        }
        self.mint(&ship_token(ship), account, 1, Some("flagship"));
        for skin in STARTER_SKINS {
            self.mint(skin, account, 1, Some("starter"));
        }
        emit(
            "player_registered",
            json!({"account": account, "flagship": ship_token(ship)}),
        );
    }

    fn unregister(&mut self, account: &AccountId) {
        let Some(p) = self.players.remove(account) else {
            return;
        };
        let gold = self.balance(GOLD, account);
        if gold > 0 {
            self.burn(GOLD, account, gold, Some("guest not created"));
        }
        let ship = ship_token(p.flagship);
        if self.balance(&ship, account) > 0 {
            self.burn(&ship, account, 1, Some("guest not created"));
        }
        for skin in STARTER_SKINS {
            if self.balance(skin, account) > 0 {
                self.burn(skin, account, 1, Some("guest not created"));
            }
        }
        self.ships.remove(&p.flagship);
    }

    fn roll_day(&mut self, account: &AccountId) -> Option<&mut Player> {
        let day = env::block_height() / self.settings.blocks_per_day;
        let p = self.players.get_mut(account)?;
        if p.day != day {
            p.day = day;
            p.games_today = 0;
            p.bounties_today = 0;
        }
        Some(p)
    }

    pub(crate) fn count_game_today(&mut self, account: &AccountId) {
        let cap = self.settings.games_per_day;
        let p = self
            .roll_day(account)
            .unwrap_or_else(|| env::panic_str("not a registered player"));
        require!(
            p.games_today < cap,
            "daily game limit reached, come back tomorrow"
        );
        p.games_today += 1;
    }

    pub(crate) fn claim_bounty_slot(&mut self, account: &AccountId) -> bool {
        let cap = self.settings.bounties_per_day;
        let Some(p) = self.roll_day(account) else {
            return false;
        };
        if p.bounties_today >= cap {
            return false;
        }
        p.bounties_today += 1;
        true
    }

    pub(crate) fn is_known(&self, account: &AccountId) -> bool {
        *account == self.nauarch || self.players.contains_key(account)
    }

    pub(crate) fn active_flagship(&self, account: &AccountId) -> Option<u64> {
        let p = self.players.get(account)?;
        let ship = self.ships.get(&p.flagship)?;
        (ship.owner == *account).then_some(p.flagship)
    }

    pub(crate) fn add_zones(&mut self, account: &AccountId, cells: &[u8; CELLS]) {
        if let Some(p) = self.players.get_mut(account) {
            for (i, &c) in cells.iter().enumerate() {
                if c == 1 {
                    p.zones[zone_of(i)] += 1;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nickname_rules() {
        assert!(validate_nickname("Ahab_1").is_ok());
        assert!(validate_nickname("ab").is_err());
        assert!(validate_nickname(&"a".repeat(17)).is_err());
        assert!(validate_nickname("Ahab Ignore all").is_err());
        assert!(validate_nickname("Ahab\"}").is_err());
        assert!(validate_nickname("Ахав").is_err());
    }

    #[test]
    fn default_name_uses_account_prefix() {
        let a: AccountId = "p-3f9e1a2b3c4d.brinewar.testnet".parse().unwrap();
        assert_eq!(display_name(&a, &None), "Captain 3f9e");
        assert_eq!(display_name(&a, &Some("Ahab".into())), "Ahab");
    }

    #[test]
    fn zones_split_the_board_three_by_three() {
        assert_eq!(zone_of(0), 0);
        assert_eq!(zone_of(9), 2);
        assert_eq!(zone_of(55), 4);
        assert_eq!(zone_of(99), 8);
        assert_eq!(fav_zone(&[0; 9]), None);
        assert_eq!(fav_zone(&[1, 5, 5, 0, 0, 0, 0, 0, 0]), Some(1));
    }

    #[test]
    fn ranks_follow_xp() {
        assert_eq!(rank_of(0), 0);
        assert_eq!(rank_of(99), 0);
        assert_eq!(rank_of(100), 1);
        assert_eq!(rank_of(1500), 4);
    }

    #[test]
    fn svg_has_no_external_references() {
        for r in 0..RANKS.len() {
            let svg = ship_svg_markup(r, r % 2 == 0);
            assert!(svg.starts_with("<svg"));
            assert!(!svg.contains("href"));
            assert!(!svg.contains("<script"));
        }
    }
}
