use crate::events::emit;
use crate::fleet::{BOARD_SIZE, CELLS, SHIP_CELLS};
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

pub fn deterministic_shot(game: &Game) -> u8 {
    let hits: Vec<u8> = game
        .shots
        .iter()
        .filter(|s| s.by == Side::B && s.result == ShotResult::Hit)
        .map(|s| s.index)
        .collect();
    let open = |c: u8| !game.has_fired(Side::B, c) && !hits.iter().any(|&h| diagonal_of(h, c));
    for &h in hits.iter().rev() {
        if let Some(c) = line_ends(h, &hits).into_iter().find(|&c| open(c)) {
            return c;
        }
    }
    let parity = |c: u8| (c % 10 + c / 10).is_multiple_of(2);
    let hunt: Vec<u8> = game
        .hot
        .iter()
        .map(|(c, _)| *c)
        .chain(0..CELLS as u8)
        .collect();
    hunt.iter()
        .copied()
        .find(|&c| parity(c) && open(c))
        .or_else(|| hunt.iter().copied().find(|&c| open(c)))
        .or_else(|| (0..CELLS as u8).find(|&c| !game.has_fired(Side::B, c)))
        .unwrap_or_else(|| env::panic_str("no cell left to fire at"))
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
            format!(
                "Battle #{}. Sea battle on a 10x10 grid, columns A-J, rows 1-10. You fire at the captain's hidden fleet: {fleet}.\nYour shots so far: {}.\nYour hits: {} of {SHIP_CELLS} ship cells.\nThe captain's shots at your fleet: {}.\nAdmiralty map, where captains usually hide ships (share of past boards): {hot}.\nDossier: {}\nChoose your next shot at a cell you have not fired at. Reply with JSON only: {{\"shot\":\"<cell such as B7>\",\"line\":\"<one remark in character>\"}}",
                game.id,
                shots_summary(game, Side::B),
                game.hits_on_a,
                shots_summary(game, Side::A),
                game.dossier,
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
                    .filter(|&c| !game.has_fired(Side::B, c));
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
