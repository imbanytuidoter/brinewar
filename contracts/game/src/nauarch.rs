use crate::events::emit;
use crate::fleet::{BOARD_SIZE, CELLS, FLEET, SHIP_CELLS};
use crate::game::{Game, Mode, ShotResult, ShotSource, Side, Status};
use crate::{settle_answer, Brinewar, BrinewarExt};
use near_sdk::serde_json::{json, Value};
use near_sdk::{env, near, require};
use serde::Serialize;

pub const ROLE: &str = "You are the Nauarch, an old admiral of a sea battle fleet: sarcastic but always polite. You speak one line of at most 25 words in English. You mention only game facts about the captain: shots, hits, past battles and where they hide ships. No insults, no politics, no real people. Never reveal where your own ships are.";
pub const FIXED_SEED: u64 = 7;
pub const MAX_TOKENS: u32 = 80;
pub const MAX_LINE_CHARS: usize = 140;
pub const PROMPT_HOT_CELLS: usize = 15;
pub const HUNT_CHOICES: usize = 6;
const LONGEST_SHIP: usize = 4;

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MoveKind {
    Shot,
    Farewell,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct ModelKey {
    pub model: String,
    pub public_key: [u8; 32],
}

#[near(serializers = [json])]
pub struct ModelView {
    pub model: String,
    pub public_key: String,
}

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: String,
}

#[derive(Serialize)]
struct ChatTemplateKwargs {
    enable_thinking: bool,
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage<'a>>,
    temperature: u32,
    seed: u64,
    max_tokens: u32,
    stream: bool,
    chat_template_kwargs: ChatTemplateKwargs,
}

pub fn cell_name(index: u8) -> String {
    let col = (b'A' + index % BOARD_SIZE as u8) as char;
    format!("{col}{}", index / BOARD_SIZE as u8 + 1)
}

pub fn parse_cell(s: &str) -> Option<u8> {
    let s = s.trim();
    let mut chars = s.chars();
    let col = chars.next()?.to_ascii_uppercase();
    if !('A'..='J').contains(&col) {
        return None;
    }
    let row: u8 = chars.as_str().parse().ok()?;
    if !(1..=10).contains(&row) {
        return None;
    }
    Some((row - 1) * BOARD_SIZE as u8 + (col as u8 - b'A'))
}

pub fn sanitize_line(raw: &str) -> Option<String> {
    let line: String = raw
        .chars()
        .map(|c| if c.is_whitespace() { ' ' } else { c })
        .filter(|c| !c.is_control())
        .take(MAX_LINE_CHARS)
        .collect();
    let line = line.trim().to_string();
    (!line.is_empty()).then_some(line)
}

pub fn extract_content(response_body: &str) -> Option<String> {
    let v: Value = serde_json::from_str(response_body).ok()?;
    v.get("choices")?
        .get(0)?
        .get("message")?
        .get("content")?
        .as_str()
        .map(str::to_string)
}

pub fn parse_reply(content: &str) -> (Option<String>, Option<String>) {
    let (Some(start), Some(end)) = (content.find('{'), content.rfind('}')) else {
        return (None, None);
    };
    if end < start {
        return (None, None);
    }
    let Ok(v) = serde_json::from_str::<Value>(&content[start..=end]) else {
        return (None, None);
    };
    let field = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);
    (field("shot"), field("line"))
}

fn neighbours4(i: u8) -> Vec<u8> {
    let (x, y) = (i % 10, i / 10);
    let mut out = Vec::with_capacity(4);
    if y > 0 {
        out.push(i - 10);
    }
    if x < 9 {
        out.push(i + 1);
    }
    if y < 9 {
        out.push(i + 10);
    }
    if x > 0 {
        out.push(i - 1);
    }
    out
}

fn diagonal_of(i: u8, j: u8) -> bool {
    let (xi, yi, xj, yj) = (i % 10, i / 10, j % 10, j / 10);
    xi.abs_diff(xj) == 1 && yi.abs_diff(yj) == 1
}

fn line_ends(hit: u8, hits: &[u8]) -> Vec<u8> {
    let is_hit = |c: u8| hits.contains(&c);
    let (x, y) = (hit % 10, hit / 10);
    let horizontal = (x > 0 && is_hit(hit - 1)) || (x < 9 && is_hit(hit + 1));
    let vertical = (y > 0 && is_hit(hit - 10)) || (y < 9 && is_hit(hit + 10));
    let mut out = Vec::new();
    if horizontal {
        let mut l = hit;
        while !l.is_multiple_of(10) && is_hit(l - 1) {
            l -= 1;
        }
        let mut r = hit;
        while r % 10 < 9 && is_hit(r + 1) {
            r += 1;
        }
        if !l.is_multiple_of(10) {
            out.push(l - 1);
        }
        if r % 10 < 9 {
            out.push(r + 1);
        }
    } else if vertical {
        let mut u = hit;
        while u >= 10 && is_hit(u - 10) {
            u -= 10;
        }
        let mut d = hit;
        while d < 90 && is_hit(d + 10) {
            d += 10;
        }
        if u >= 10 {
            out.push(u - 10);
        }
        if d < 90 {
            out.push(d + 10);
        }
    } else {
        out = neighbours4(hit);
    }
    out
}

fn cluster_of(start: u8, hits: &[u8], seen: &mut Vec<u8>) -> Vec<u8> {
    let mut out = Vec::new();
    let mut stack = vec![start];
    seen.push(start);
    while let Some(c) = stack.pop() {
        out.push(c);
        for n in neighbours4(c) {
            if hits.contains(&n) && !seen.contains(&n) {
                seen.push(n);
                stack.push(n);
            }
        }
    }
    out.sort_unstable();
    out
}

fn closed_end(game: &Game, x: i16, y: i16) -> bool {
    let size = BOARD_SIZE as i16;
    if x < 0 || y < 0 || x >= size || y >= size {
        return true;
    }
    let cell = (y * size + x) as u8;
    game.shots
        .iter()
        .any(|s| s.by == Side::B && s.index == cell && s.result == ShotResult::Miss)
}

fn is_sunk(game: &Game, ship: &[u8]) -> bool {
    if ship.len() >= LONGEST_SHIP {
        return true;
    }
    let xs = ship.iter().map(|&c| (c % 10) as i16);
    let ys = ship.iter().map(|&c| (c / 10) as i16);
    let (x0, x1) = (xs.clone().min().unwrap_or(0), xs.max().unwrap_or(0));
    let (y0, y1) = (ys.clone().min().unwrap_or(0), ys.max().unwrap_or(0));
    let across = closed_end(game, x0 - 1, y0) && closed_end(game, x1 + 1, y0);
    let down = closed_end(game, x0, y0 - 1) && closed_end(game, x0, y1 + 1);
    match ship.len() {
        1 => across && down,
        _ if y0 == y1 => across,
        _ => down,
    }
}

struct Sight {
    hits: Vec<u8>,
    afloat: Vec<Vec<u8>>,
    sunk: Vec<Vec<u8>>,
}

fn sight(game: &Game) -> Sight {
    let hits: Vec<u8> = game
        .shots
        .iter()
        .filter(|s| s.by == Side::B && s.result == ShotResult::Hit)
        .map(|s| s.index)
        .collect();
    let mut seen = Vec::new();
    let mut afloat = Vec::new();
    let mut sunk = Vec::new();
    for &h in hits.iter().rev() {
        if seen.contains(&h) {
            continue;
        }
        let ship = cluster_of(h, &hits, &mut seen);
        if is_sunk(game, &ship) {
            sunk.push(ship);
        } else {
            afloat.push(ship);
        }
    }
    sink_by_fleet(&mut afloat, &mut sunk);
    Sight { hits, afloat, sunk }
}

fn sink_by_fleet(afloat: &mut Vec<Vec<u8>>, sunk: &mut Vec<Vec<u8>>) {
    let mut left: Vec<usize> = FLEET
        .iter()
        .flat_map(|&(len, count)| std::iter::repeat_n(len, count))
        .collect();
    for ship in sunk.iter() {
        if let Some(i) = left.iter().position(|&l| l == ship.len()) {
            left.swap_remove(i);
        }
    }
    while let Some(longest) = left.iter().copied().max() {
        let Some(i) = afloat.iter().position(|s| s.len() >= longest) else {
            break;
        };
        let ship = afloat.remove(i);
        if let Some(j) = left.iter().position(|&l| l == ship.len()) {
            left.swap_remove(j);
        }
        sunk.push(ship);
    }
}

pub fn aim_cells(game: &Game) -> Vec<u8> {
    match aim(game) {
        Aim::Finish(c) | Aim::Chart(c) | Aim::Hunt(c) => c,
    }
}

fn touches(a: u8, b: u8) -> bool {
    (a % 10).abs_diff(b % 10) <= 1 && (a / 10).abs_diff(b / 10) <= 1
}

fn open_cell(game: &Game, view: &Sight, c: u8) -> bool {
    !game.has_fired(Side::B, c)
        && !view.hits.iter().any(|&h| diagonal_of(h, c))
        && !view.sunk.iter().flatten().any(|&s| touches(s, c))
}

fn scatter(game: &Game, cells: Vec<u8>) -> Vec<u8> {
    let mut keyed: Vec<([u8; 32], u8)> = cells
        .into_iter()
        .map(|c| {
            let mut seed = game.id.to_le_bytes().to_vec();
            seed.extend((game.shots.len() as u32).to_le_bytes());
            seed.push(c);
            (env::sha256_array(&seed), c)
        })
        .collect();
    keyed.sort_unstable();
    keyed
        .into_iter()
        .map(|(_, c)| c)
        .take(HUNT_CHOICES)
        .collect()
}

pub enum Aim {
    Finish(Vec<u8>),
    Chart(Vec<u8>),
    Hunt(Vec<u8>),
}

pub fn aim(game: &Game) -> Aim {
    let view = sight(game);
    let open = |c: u8| open_cell(game, &view, c);
    for ship in &view.afloat {
        let mut finish: Vec<u8> = Vec::new();
        for &h in ship {
            for c in line_ends(h, &view.hits) {
                if open(c) && !finish.contains(&c) {
                    finish.push(c);
                }
            }
        }
        if !finish.is_empty() {
            return Aim::Finish(finish);
        }
    }
    let hot: Vec<u8> = game
        .hot
        .iter()
        .map(|(c, _)| *c)
        .filter(|&c| open(c))
        .take(HUNT_CHOICES)
        .collect();
    if !hot.is_empty() {
        return Aim::Chart(hot);
    }
    let parity = |c: u8| (c % 10 + c / 10).is_multiple_of(2);
    let even: Vec<u8> = (0..CELLS as u8).filter(|&c| parity(c) && open(c)).collect();
    if !even.is_empty() {
        return Aim::Hunt(scatter(game, even));
    }
    let any: Vec<u8> = (0..CELLS as u8).filter(|&c| open(c)).collect();
    if !any.is_empty() {
        return Aim::Hunt(scatter(game, any));
    }
    Aim::Hunt(
        (0..CELLS as u8)
            .filter(|&c| !game.has_fired(Side::B, c))
            .collect(),
    )
}

pub fn allowed(game: &Game, cell: u8) -> bool {
    if game.has_fired(Side::B, cell) {
        return false;
    }
    match aim(game) {
        Aim::Finish(cells) | Aim::Chart(cells) => cells.contains(&cell),
        Aim::Hunt(cells) => cells.contains(&cell) || open_cell(game, &sight(game), cell),
    }
}

pub fn deterministic_shot(game: &Game) -> u8 {
    aim_cells(game)
        .first()
        .copied()
        .unwrap_or_else(|| env::panic_str("no cell left to fire at"))
}

fn names(cells: &[u8]) -> String {
    if cells.is_empty() {
        return "none yet".into();
    }
    cells
        .iter()
        .map(|&c| cell_name(c))
        .collect::<Vec<_>>()
        .join(", ")
}

fn shots_summary(game: &Game, by: Side) -> String {
    let list: Vec<String> = game
        .shots
        .iter()
        .filter(|s| s.by == by && s.result != ShotResult::Pending)
        .map(|s| {
            let r = if s.result == ShotResult::Hit {
                "hit"
            } else {
                "miss"
            };
            format!("{} {r}", cell_name(s.index))
        })
        .collect();
    if list.is_empty() {
        "none yet".into()
    } else {
        list.join(", ")
    }
}

pub fn prompt(game: &Game, kind: MoveKind) -> String {
    let fleet = "one 4-cell ship, two 3-cell, three 2-cell and four 1-cell; ships are straight and never touch, not even at corners";
    match kind {
        MoveKind::Shot => {
            let hot: Vec<String> = game
                .hot
                .iter()
                .filter(|(i, _)| !game.has_fired(Side::B, *i))
                .take(PROMPT_HOT_CELLS)
                .map(|(i, p)| format!("{} {p}%", cell_name(*i)))
                .collect();
            let hot = if hot.is_empty() {
                "no data yet".to_string()
            } else {
                hot.join(", ")
            };
            let view = sight(game);
            let sunk: Vec<String> = view.sunk.iter().map(|s| names(s)).collect();
            let sunk = if sunk.is_empty() {
                "none yet".to_string()
            } else {
                sunk.join("; ")
            };
            let (plan, choices) = match aim(game) {
                Aim::Finish(c) => ("A wounded ship of the captain is still afloat. Finish it: fire at one of these cells only", c),
                Aim::Chart(c) => ("No wounded ship to finish, so you hunt from the Admiralty map: fire at one of these cells only", c),
                Aim::Hunt(c) => ("No wounded ship to finish, so you hunt. Best cells by your own reckoning", c),
            };
            format!(
                "Battle #{}. Sea battle on a 10x10 grid, columns A-J, rows 1-10. You fire at the captain's hidden fleet: {fleet}.\nYour shots so far: {}.\nYour hits: {} of {SHIP_CELLS} ship cells.\nShips you sank: {sunk}. The water around a sunk ship is empty.\nThe captain's shots at your fleet: {}.\nAdmiralty map, where captains usually hide ships (share of past boards): {hot}.\nDossier: {}\n{plan}: {}.\nReply with JSON only: {{\"shot\":\"<one of those cells>\",\"line\":\"<one remark in character>\"}}",
                game.id,
                shots_summary(game, Side::B),
                game.hits_on_a,
                shots_summary(game, Side::A),
                game.dossier,
                names(&choices),
            )
        }
        MoveKind::Farewell => {
            let outcome = match game.winner {
                Some(Side::B) => "You won",
                Some(Side::A) => "You lost",
                None => "The battle was called off",
            };
            let reason = game
                .finish_reason
                .map(|r| format!("{r:?}"))
                .unwrap_or_default();
            format!(
                "Battle #{}. The sea battle is over. {outcome} ({reason}). You hit {} of the captain's {SHIP_CELLS} ship cells; the captain hit {} of yours.\nDossier: {}\nSay farewell to the captain. Reply with JSON only: {{\"line\":\"<one farewell remark in character>\"}}",
                game.id, game.hits_on_a, game.hits_on_b, game.dossier,
            )
        }
    }
}

pub fn request_body(model: &str, game: &Game, kind: MoveKind) -> String {
    let body = ChatRequest {
        model,
        messages: vec![
            ChatMessage {
                role: "system",
                content: ROLE.to_string(),
            },
            ChatMessage {
                role: "user",
                content: prompt(game, kind),
            },
        ],
        temperature: 0,
        seed: FIXED_SEED,
        max_tokens: MAX_TOKENS,
        stream: false,
        chat_template_kwargs: ChatTemplateKwargs {
            enable_thinking: false,
        },
    };
    serde_json::to_string(&body).unwrap_or_else(|_| env::panic_str("cannot encode request"))
}

pub fn signed_text(model: &str, request: &str, response: &str) -> String {
    let req = hex::encode(env::sha256_array(request.as_bytes()));
    let resp = hex::encode(env::sha256_array(response.as_bytes()));
    format!("{model}:{req}:{resp}")
}

const MIN_MOVE_TIMEOUT: u64 = 20;
const MAX_MOVE_TIMEOUT: u64 = 6000;
const DUEL_TIMEOUT_KEY: &[u8] = b"duel_timeout";
const MODEL_KEY_PREFIX: &[u8] = b"model_key:";

fn model_key_slot(model: &str) -> Vec<u8> {
    [MODEL_KEY_PREFIX, model.as_bytes()].concat()
}

#[near]
impl Brinewar {
    pub fn set_move_timeout(&mut self, blocks: u64) {
        require!(
            env::predecessor_account_id() == self.owner,
            "only the owner sets the move timeout"
        );
        require!(
            (MIN_MOVE_TIMEOUT..=MAX_MOVE_TIMEOUT).contains(&blocks),
            "move timeout must be 20 to 6000 blocks"
        );
        self.settings.move_timeout_blocks = blocks;
        emit("move_timeout_set", json!({ "blocks": blocks }));
    }

    pub fn set_duel_timeout(&mut self, blocks: u64) {
        require!(
            env::predecessor_account_id() == self.owner,
            "only the owner sets the duel timeout"
        );
        require!(
            (MIN_MOVE_TIMEOUT..=MAX_MOVE_TIMEOUT).contains(&blocks),
            "move timeout must be 20 to 6000 blocks"
        );
        env::storage_write(DUEL_TIMEOUT_KEY, &blocks.to_le_bytes());
        emit("duel_timeout_set", json!({ "blocks": blocks }));
    }

    pub fn duel_timeout(&self) -> u64 {
        env::storage_read(DUEL_TIMEOUT_KEY)
            .and_then(|b| <[u8; 8]>::try_from(b.as_slice()).ok())
            .map(u64::from_le_bytes)
            .unwrap_or(self.settings.move_timeout_blocks)
    }

    pub fn set_model(&mut self, model: String, public_key_hex: String) {
        require!(
            env::predecessor_account_id() == self.owner,
            "only the owner sets the model"
        );
        require!(!model.is_empty() && model.len() <= 128, "bad model name");
        let key = hex::decode(public_key_hex.trim_start_matches("0x"))
            .ok()
            .and_then(|k| <[u8; 32]>::try_from(k).ok())
            .unwrap_or_else(|| env::panic_str("public key must be 32 bytes hex"));
        if let Some(old) = &self.model {
            env::storage_write(&model_key_slot(&old.model), &old.public_key);
        }
        env::storage_write(&model_key_slot(&model), &key);
        self.model = Some(ModelKey {
            model: model.clone(),
            public_key: key,
        });
        emit(
            "model_set",
            json!({"model": model, "public_key": hex::encode(key)}),
        );
    }

    pub fn model(&self) -> Option<ModelView> {
        self.model.as_ref().map(|m| ModelView {
            model: m.model.clone(),
            public_key: hex::encode(m.public_key),
        })
    }

    pub fn model_key_of(&self, model: String) -> Option<String> {
        if let Some(m) = self.model.as_ref().filter(|m| m.model == model) {
            return Some(hex::encode(m.public_key));
        }
        env::storage_read(&model_key_slot(&model)).map(hex::encode)
    }

    pub fn nauarch_aim(&self, game_id: u64) -> Vec<u8> {
        let game = self.load(game_id);
        if game.mode != Mode::VsNauarch || game.status != Status::Playing {
            return Vec::new();
        }
        aim_cells(&game)
    }

    pub fn nauarch_request(&self, game_id: u64, kind: MoveKind) -> String {
        let game = self.load(game_id);
        let model = self
            .model
            .as_ref()
            .unwrap_or_else(|| env::panic_str("model is not set"));
        request_body(&model.model, &game, kind)
    }

    pub fn submit_ai_move(
        &mut self,
        game_id: u64,
        kind: MoveKind,
        response_body: String,
        signature_hex: String,
    ) {
        self.require_nauarch();
        let mut game = self.load(game_id);
        self.require_nauarch_can(&game, kind);
        self.ai_move_on(&mut game, kind, &response_body, &signature_hex);
        self.store(game);
    }

    pub fn nauarch_fallback(&mut self, game_id: u64) {
        self.require_nauarch();
        let mut game = self.load(game_id);
        self.require_nauarch_can(&game, MoveKind::Shot);
        self.fallback_on(&mut game);
        self.store(game);
    }

    pub fn nauarch_request_after(&self, game_id: u64, index: u8, cell: u8) -> String {
        let mut game = self.load(game_id);
        require!(cell <= 1, "cell must be 0 or 1");
        let pending = game
            .pending_shot()
            .cloned()
            .unwrap_or_else(|| env::panic_str("no shot to answer"));
        require!(
            pending.by == Side::A && pending.index == index,
            "index does not match the pending shot"
        );
        settle_answer(&mut game, Side::B, cell == 1);
        let model = self
            .model
            .as_ref()
            .unwrap_or_else(|| env::panic_str("model is not set"));
        request_body(&model.model, &game, MoveKind::Shot)
    }
}

impl Brinewar {
    pub(crate) fn ai_move_on(
        &mut self,
        game: &mut Game,
        kind: MoveKind,
        response_body: &str,
        signature_hex: &str,
    ) {
        let game_id = game.id;
        let model = self
            .model
            .clone()
            .unwrap_or_else(|| env::panic_str("model is not set"));
        let request = request_body(&model.model, game, kind);
        let signature: [u8; 64] = hex::decode(signature_hex.trim_start_matches("0x"))
            .ok()
            .and_then(|s| <[u8; 64]>::try_from(s).ok())
            .unwrap_or_else(|| env::panic_str("signature must be 64 bytes hex"));
        let text = signed_text(&model.model, &request, response_body);
        require!(
            env::ed25519_verify(&signature, text.as_bytes(), &model.public_key),
            "model signature does not match this game's request"
        );
        let (shot, line) = extract_content(response_body)
            .map(|c| parse_reply(&c))
            .unwrap_or((None, None));
        let line = line.as_deref().and_then(sanitize_line);
        match kind {
            MoveKind::Shot => {
                let chosen = shot
                    .as_deref()
                    .and_then(parse_cell)
                    .filter(|&c| allowed(game, c));
                let (index, source) = match chosen {
                    Some(c) => (c, ShotSource::Model),
                    None => (deterministic_shot(game), ShotSource::ModelFallback),
                };
                self.record_shot(game, Side::B, index, source);
                emit(
                    "nauarch_said",
                    json!({
                        "game_id": game_id, "kind": kind, "n": game.shots.len() - 1,
                        "shot": cell_name(index), "source": source, "line": line,
                        "model": model.model, "signed_text": text, "signature": signature_hex,
                    }),
                );
            }
            MoveKind::Farewell => {
                game.farewell_said = true;
                emit(
                    "nauarch_said",
                    json!({
                        "game_id": game_id, "kind": kind, "line": line,
                        "model": model.model, "signed_text": text, "signature": signature_hex,
                    }),
                );
            }
        }
    }

    pub(crate) fn fallback_on(&mut self, game: &mut Game) {
        let index = deterministic_shot(game);
        self.record_shot(game, Side::B, index, ShotSource::Deterministic);
        emit(
            "nauarch_said",
            json!({
                "game_id": game.id, "kind": MoveKind::Shot, "n": game.shots.len() - 1,
                "shot": cell_name(index), "source": ShotSource::Deterministic, "line": null,
            }),
        );
    }
}

impl Brinewar {
    pub(crate) fn require_nauarch(&self) {
        require!(
            env::predecessor_account_id() == self.nauarch,
            "only the Nauarch moves for the Nauarch"
        );
    }

    pub(crate) fn require_nauarch_can(&self, game: &Game, kind: MoveKind) {
        require!(game.mode == Mode::VsNauarch, "not a Nauarch battle");
        match kind {
            MoveKind::Shot => {
                require!(game.status == Status::Playing, "game is not in play");
                require!(game.turn == Side::B, "not the Nauarch's turn");
                require!(
                    game.pending_shot().is_none(),
                    "the Nauarch must answer first"
                );
            }
            MoveKind::Farewell => {
                require!(game.status == Status::Finished, "game is not finished");
                require!(!game.farewell_said, "farewell already said");
            }
        }
    }
}

impl Brinewar {
    pub(crate) fn timeout_for(&self, game: &Game) -> u64 {
        match game.mode {
            Mode::PvP => self.duel_timeout(),
            Mode::VsNauarch => self.settings.move_timeout_blocks,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cells_round_trip() {
        for i in 0..100u8 {
            assert_eq!(parse_cell(&cell_name(i)), Some(i));
        }
        assert_eq!(cell_name(0), "A1");
        assert_eq!(cell_name(99), "J10");
        assert_eq!(parse_cell("b7"), Some(61));
        assert_eq!(parse_cell("K1"), None);
        assert_eq!(parse_cell("A11"), None);
        assert_eq!(parse_cell("A0"), None);
        assert_eq!(parse_cell(""), None);
    }

    #[test]
    fn reply_is_found_inside_noise() {
        let (s, l) = parse_reply("Sure!\n```json\n{\"shot\":\"C3\",\"line\":\"Steady.\"}\n```");
        assert_eq!(s.as_deref(), Some("C3"));
        assert_eq!(l.as_deref(), Some("Steady."));
        assert_eq!(parse_reply("no json here"), (None, None));
        assert_eq!(parse_reply("} {"), (None, None));
    }

    #[test]
    fn line_is_cleaned_and_capped() {
        assert_eq!(sanitize_line("  a\nb\u{7}c "), Some("a bc".into()));
        assert_eq!(sanitize_line("   "), None);
        assert_eq!(
            sanitize_line(&"x".repeat(500)).unwrap().chars().count(),
            MAX_LINE_CHARS
        );
    }
}
