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

struct ShipStyle {
    name: &'static str,
    sky: (&'static str, &'static str),
    sea: (&'static str, &'static str),
    hull: &'static str,
    trim: &'static str,
    sail: &'static str,
    shade: &'static str,
    flag: &'static str,
    lantern: Option<&'static str>,
    masthead: Option<&'static str>,
    sparks: Option<&'static str>,
    banners: bool,
    night: bool,
    bolt: bool,
    ghost: bool,
}

const SKIN_STYLES: [ShipStyle; 7] = [
    ShipStyle {
        name: "brine",
        sky: ("#3d8fd0", "#bfe6ff"),
        sea: ("#2f9cc4", "#0f5f86"),
        hull: "#b07a4c",
        trim: "#e8d2a6",
        sail: "#f4f7f8",
        shade: "#c9d6dc",
        flag: "#3fb6c9",
        lantern: None,
        masthead: None,
        sparks: None,
        banners: false,
        night: false,
        bolt: false,
        ghost: false,
    },
    ShipStyle {
        name: "coral",
        sky: ("#ff9a7a", "#ffe0c8"),
        sea: ("#3fa7b8", "#14607a"),
        hull: "#d9785a",
        trim: "#ffc2ae",
        sail: "#f2a58e",
        shade: "#d9826b",
        flag: "#ff6a3d",
        lantern: None,
        masthead: None,
        sparks: None,
        banners: true,
        night: false,
        bolt: false,
        ghost: false,
    },
    ShipStyle {
        name: "ghost",
        sky: ("#4b5d66", "#b9c9cf"),
        sea: ("#56707a", "#1f3038"),
        hull: "#9fb0b8",
        trim: "#e6f2f7",
        sail: "#dbe7ec",
        shade: "#9fb0b8",
        flag: "#f4f7f8",
        lantern: None,
        masthead: Some("#c8f0ff"),
        sparks: Some("#e6f7ff"),
        banners: false,
        night: false,
        bolt: false,
        ghost: true,
    },
    ShipStyle {
        name: "night-watch",
        sky: ("#0b1630", "#2a3f6e"),
        sea: ("#173a5c", "#08182b"),
        hull: "#8a5a3c",
        trim: "#c9a227",
        sail: "#2d4673",
        shade: "#1d2f52",
        flag: "#ffb347",
        lantern: Some("#ffb347"),
        masthead: None,
        sparks: None,
        banners: false,
        night: true,
        bolt: false,
        ghost: false,
    },
    ShipStyle {
        name: "gilded",
        sky: ("#3c5a9c", "#ffcf8a"),
        sea: ("#3e8fa0", "#164a6a"),
        hull: "#e9bf4f",
        trim: "#fff1b8",
        sail: "#fff4d8",
        shade: "#e6d3a8",
        flag: "#b3123f",
        lantern: None,
        masthead: None,
        sparks: Some("#ffe08a"),
        banners: true,
        night: false,
        bolt: false,
        ghost: false,
    },
    ShipStyle {
        name: "storm",
        sky: ("#1c2a38", "#4e6474"),
        sea: ("#2a4c5c", "#0e2230"),
        hull: "#6f8592",
        trim: "#b9cad4",
        sail: "#3e5566",
        shade: "#2b3c49",
        flag: "#7fe0d0",
        lantern: None,
        masthead: Some("#7ff6e6"),
        sparks: Some("#c6fbff"),
        banners: false,
        night: false,
        bolt: true,
        ghost: false,
    },
    ShipStyle {
        name: "admiral",
        sky: ("#2a1846", "#f0a060"),
        sea: ("#5a3a5a", "#1a1a38"),
        hull: "#7a3e2a",
        trim: "#ffcf5a",
        sail: "#9b1636",
        shade: "#6e0f27",
        flag: "#ffcf5a",
        lantern: Some("#ffd36b"),
        masthead: Some("#ffd36b"),
        sparks: Some("#ffd36b"),
        banners: true,
        night: false,
        bolt: false,
        ghost: false,
    },
];

const RANK_STYLE: [usize; 5] = [0, 3, 4, 5, 6];
const RANK_FRAMES: [(usize, usize, usize); 5] =
    [(1, 0, 1), (2, 3, 1), (2, 4, 1), (3, 5, 1), (3, 6, 2)];

const SPARK_SPOTS: [(u32, u32); 9] = [
    (96, 62),
    (132, 40),
    (176, 54),
    (214, 36),
    (246, 70),
    (118, 92),
    (232, 98),
    (72, 84),
    (268, 50),
];
const STAR_SPOTS: [(u32, u32); 10] = [
    (30, 22),
    (64, 40),
    (96, 16),
    (150, 28),
    (188, 12),
    (226, 34),
    (262, 18),
    (294, 42),
    (120, 50),
    (300, 12),
];

fn skin_style(name: &str) -> Option<&'static ShipStyle> {
    SKIN_STYLES.iter().find(|st| st.name == name)
}

fn glow(x: u32, y: u32, r: u32, color: &str, class: &str, key: &str) -> String {
    format!(
        r##"<circle class="{class}" cx="{x}" cy="{y}" r="{r}" fill="url(#{key}{class})"/><circle cx="{x}" cy="{y}" r="{}" fill="{color}"/>"##,
        r / 5
    )
}

fn ship_svg_markup(rank: usize, frozen: bool) -> String {
    let rank = rank.min(RANK_FRAMES.len() - 1);
    ship_svg_styled(rank, frozen, &SKIN_STYLES[RANK_STYLE[rank]])
}

fn ship_svg_styled(rank: usize, frozen: bool, st: &ShipStyle) -> String {
    let rank = rank.min(RANK_FRAMES.len() - 1);
    let (masts, ports, rows) = RANK_FRAMES[rank];
    let key = format!("{}{rank}", st.name.replace('-', ""));
    let mut defs = format!(
        r##"<linearGradient id="{key}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{}"/><stop offset="1" stop-color="{}"/></linearGradient><linearGradient id="{key}sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{}"/><stop offset="1" stop-color="{}"/></linearGradient>"##,
        st.sky.0, st.sky.1, st.sea.0, st.sea.1
    );
    for (c, class) in [(st.lantern, "lantern"), (st.masthead, "masthead")] {
        if let Some(c) = c {
            defs.push_str(&format!(r##"<radialGradient id="{key}{class}"><stop offset="0" stop-color="{c}" stop-opacity="0.9"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>"##));
        }
    }
    let mut sky = format!(r##"<rect width="320" height="200" fill="url(#{key}sky)"/>"##);
    if st.night {
        for (x, y) in STAR_SPOTS {
            sky.push_str(&format!(
                r##"<circle cx="{x}" cy="{y}" r="1.2" fill="#fff" opacity="0.8"/>"##
            ));
        }
        sky.push_str(r##"<circle cx="272" cy="34" r="12" fill="#f4ecc8"/><circle cx="278" cy="30" r="11" fill="#0b1630"/>"##);
    }
    if st.bolt {
        sky.push_str(r##"<path class="bolt" d="M262 8 L248 40 L258 40 L242 76 L270 34 L259 34 L272 8 Z" fill="#e8fbff" opacity="0.85"/>"##);
    }
    let sea = format!(
        r##"<rect y="140" width="320" height="60" fill="url(#{key}sea)"/><path d="M0 150 Q40 144 80 150 T160 150 T240 150 T320 150" stroke="#ffffff" stroke-opacity="0.25" fill="none"/><path d="M0 172 Q50 166 100 172 T200 172 T300 172" stroke="#ffffff" stroke-opacity="0.15" fill="none"/>"##
    );
    let slots: &[u32] = match masts {
        1 => &[160],
        2 => &[128, 196],
        _ => &[104, 160, 216],
    };
    let sail_opacity = if st.ghost { "0.72" } else { "1" };
    let mut rig = String::new();
    for (i, &x) in slots.iter().enumerate() {
        let top = if masts == 3 && i == 1 { 22 } else { 34 };
        rig.push_str(&format!(
            r##"<line x1="{x}" y1="{top}" x2="{x}" y2="128" stroke="#3a2618" stroke-width="3"/>"##
        ));
        for (y1, y2, w) in [(top + 12, top + 42, 28), (top + 48, top + 84, 34)] {
            rig.push_str(&format!(
                r##"<path d="M{} {y1} Q{x} {} {} {y1} L{} {y2} Q{x} {} {} {y2} Z" fill="{}" fill-opacity="{sail_opacity}" stroke="{}" stroke-width="1"/>"##,
                x - w, y1 - 5, x + w, x + w - 3, y2 + 7, x - w + 3, st.sail, st.shade
            ));
        }
        if st.banners {
            rig.push_str(&format!(
                r##"<path class="banner" d="M{x} {top} L{} {} L{} {} L{} {} Z" fill="{}"/>"##,
                x + 30,
                top + 4,
                x + 22,
                top + 8,
                x + 30,
                top + 12,
                st.flag
            ));
        } else {
            rig.push_str(&format!(
                r##"<path d="M{x} {top} L{} {} L{x} {} Z" fill="{}"/>"##,
                x + 16,
                top + 5,
                top + 10,
                st.flag
            ));
        }
        if let Some(c) = st.masthead {
            rig.push_str(&glow(x, top - 2, 16, c, "masthead", &key));
        }
    }
    rig.push_str(
        r##"<line x1="276" y1="126" x2="306" y2="104" stroke="#3a2618" stroke-width="2.5"/>"##,
    );
    let fore = slots[slots.len() - 1] + 40;
    rig.push_str(&format!(r##"<path d="M{fore} 74 L302 106 L{fore} 118 Z" fill="{}" fill-opacity="{sail_opacity}" stroke="{}" stroke-width="1"/>"##, st.sail, st.shade));
    let hull_opacity = if st.ghost { "0.85" } else { "1" };
    let mut hull = format!(
        r##"<path d="M40 124 H280 Q276 146 254 162 H76 Q52 150 40 124 Z" fill="{}" fill-opacity="{hull_opacity}"/><path d="M40 124 H280 L278 131 H43 Z" fill="{}"/><path d="M76 162 H254" stroke="#000" stroke-opacity="0.25" stroke-width="2"/>"##,
        st.hull, st.trim
    );
    for row in 0..rows {
        let y = 140 + row as u32 * 11;
        for k in 0..ports {
            let x = if ports == 1 {
                160
            } else {
                88 + (k as u32 * 144) / (ports as u32 - 1)
            };
            hull.push_str(&format!(r##"<rect class="port" x="{}" y="{}" width="8" height="6" rx="1" fill="#1a1208" stroke="{}" stroke-width="1"/>"##, x - 4, y - 3, st.trim));
        }
    }
    let mut light = String::new();
    if let Some(c) = st.lantern {
        light.push_str(&glow(272, 116, 18, c, "lantern", &key));
        light.push_str(&glow(48, 114, 18, c, "lantern", &key));
    }
    if let Some(c) = st.sparks {
        for (x, y) in SPARK_SPOTS {
            light.push_str(&format!(
                r##"<circle cx="{x}" cy="{y}" r="1.8" fill="{c}" opacity="0.85"/>"##
            ));
        }
    }
    if st.ghost {
        light.push_str(r##"<rect class="mist" y="118" width="320" height="40" fill="#e6f2f7" opacity="0.22"/>"##);
    }
    let pips: String = (0..=rank)
        .map(|i| {
            format!(
                r##"<path class="pip" d="M{} 12 L{} 17 L{} 22 L{} 17 Z" fill="#ffcf5a"/>"##,
                16 + i * 12,
                21 + i * 12,
                16 + i * 12,
                11 + i * 12
            )
        })
        .collect();
    let frost = if frozen {
        r##"<rect class="frost" width="320" height="200" fill="#ffffff" opacity="0.35"/>"##
    } else {
        ""
    };
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><defs>{defs}</defs>{sky}{sea}{rig}{hull}{light}{pips}{frost}</svg>"##
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

    pub fn ship_svg(&self, token_id: String, skin: Option<String>) -> Option<String> {
        let s = self.ships.get(&ship_id(&token_id)?)?;
        let rank = rank_of(s.xp);
        let frozen = s.owner != s.captain;
        let owned = skin
            .as_deref()
            .and_then(skin_style)
            .filter(|st| self.balance(&format!("skin:{}", st.name), &s.owner) > 0);
        Some(match owned {
            Some(st) => ship_svg_styled(rank, frozen, st),
            None => ship_svg_markup(rank, frozen),
        })
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
    fn each_rank_draws_its_own_flagship() {
        let svgs: Vec<String> = (0..RANKS.len())
            .map(|r| ship_svg_markup(r, false))
            .collect();
        for (i, a) in svgs.iter().enumerate() {
            for b in svgs.iter().skip(i + 1) {
                assert_ne!(a, b);
            }
        }
        let ports = |svg: &str| svg.matches("class=\"port\"").count();
        for r in 1..RANKS.len() {
            assert!(
                ports(&svgs[r]) > ports(&svgs[r - 1]),
                "rank {r} should carry more guns"
            );
        }
        assert!(svgs[1].contains("class=\"lantern\""));
        assert!(svgs[3].contains("class=\"bolt\""));
        assert!(svgs[4].contains("class=\"lantern\"") && svgs[4].contains("class=\"banner\""));
        for (r, svg) in svgs.iter().enumerate() {
            assert_eq!(svg.matches("class=\"pip\"").count(), r + 1);
        }
        assert!(ship_svg_markup(2, true).contains("class=\"frost\""));
        let ghost = ship_svg_styled(4, false, skin_style("ghost").unwrap());
        assert!(ghost.contains("class=\"mist\""));
        assert_eq!(ghost.matches("class=\"port\"").count(), 12);
        for st in &SKIN_STYLES {
            let svg = ship_svg_styled(2, false, st);
            for part in svg.split("url(#").skip(1) {
                let id = part.split(')').next().unwrap_or_default();
                assert!(
                    svg.contains(&format!("id=\"{id}\"")),
                    "missing gradient {id} in {}",
                    st.name
                );
            }
        }
        for svg in &svgs {
            for part in svg.split("url(#").skip(1) {
                let id = part.split(')').next().unwrap_or_default();
                assert!(
                    svg.contains(&format!("id=\"{id}\"")),
                    "missing gradient {id}"
                );
            }
        }
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
