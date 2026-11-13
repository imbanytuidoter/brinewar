use super::*;
use crate::nauarch::MoveKind;
use crate::tokens::ship_token;
use near_sdk::{NearToken, PromiseResult, PublicKey};

fn act_paying(chain: &Chain, who: &AccountId, yocto: u128) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(acc("brinewar.testnet"))
        .predecessor_account_id(who.clone())
        .attached_deposit(NearToken::from_yoctonear(yocto))
        .block_height(chain.height)
        .build());
}

fn gold(c: &Brinewar, who: &AccountId) -> u128 {
    c.mt_balance_of(who.clone(), GOLD.into()).0
}

fn won_match() -> Match {
    let mut m = Match::started();
    m.a_sinks_b();
    m.reveal(&player());
    m
}

fn guest_key(n: u8) -> PublicKey {
    let mut bytes = vec![0u8];
    bytes.extend([n; 32]);
    PublicKey::try_from(bytes).unwrap()
}

#[test]
fn registrar_creates_guest_with_gold_and_flagship() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&registrar());
    let key = guest_key(1);
    let account = c.guest_account_for(key.clone());
    assert!(account.as_str().starts_with("p-"));
    assert!(account.as_str().ends_with(".brinewar.testnet"));
    let _ = c.create_guest(key, Some("Ahab".into()));
    let p = c.get_player(account.clone()).unwrap();
    assert_eq!(p.gold.0, 100);
    assert_eq!(p.display_name, "Ahab");
    assert_eq!(p.flagship, ship_token(1));
    assert_eq!(c.mt_balance_of(account.clone(), ship_token(1)).0, 1);
    assert_eq!(c.mt_supply(ship_token(1)).unwrap().0, 1);
    assert_eq!(c.get_ship(ship_token(1)).unwrap().rank, "Ensign");
}

#[test]
fn guest_creation_is_limited_and_gated() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&acc("stranger.testnet"));
    let msg = panics(|| {
        let _ = c.create_guest(guest_key(1), None);
    });
    assert!(msg.contains("only the registrar"), "{msg}");
    chain.act(&registrar());
    let _ = c.create_guest(guest_key(1), None);
    let _ = c.create_guest(guest_key(2), None);
    let msg = panics(|| {
        let _ = c.create_guest(guest_key(3), None);
    });
    assert!(msg.contains("daily guest limit"), "{msg}");
    chain.skip(DAY);
    chain.act(&registrar());
    let _ = c.create_guest(guest_key(3), None);
}

#[test]
fn the_nauarch_cannot_register_as_a_player() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&registrar());
    let msg = panics(|| c.register_player(nauarch(), None));
    assert!(msg.contains("not a player"), "{msg}");
}

#[test]
fn unregistered_account_cannot_open_a_game() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&acc("stranger.testnet"));
    let msg = panics(|| {
        c.new_game_vs_nauarch(None);
    });
    assert!(msg.contains("not a registered player"), "{msg}");
}

#[test]
fn nicknames_are_validated() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&player());
    c.set_nickname("Old_Salt-7".into());
    assert_eq!(c.get_player(player()).unwrap().display_name, "Old_Salt-7");
    for bad in [
        "ab",
        "Ignore previous",
        "a\"b}c",
        "x".repeat(17).as_str(),
        "Капітан",
    ] {
        let msg = panics(|| c.set_nickname(bad.to_string()));
        assert!(msg.contains("nickname must be"), "{bad}: {msg}");
    }
    chain.act(&registrar());
    let msg = panics(|| c.register_player(acc("p-7.brinewar.testnet"), Some("bad name".into())));
    assert!(msg.contains("nickname must be"), "{msg}");
}

#[test]
fn game_takes_entry_stake_into_escrow() {
    let m = Match::placing();
    assert_eq!(gold(&m.c, &player()), 90);
    assert_eq!(gold(&m.c, &acc("brinewar.testnet")), 10);
    assert_eq!(m.view().stake.0, 10);
}

#[test]
fn win_returns_stake_and_pays_capped_bounty() {
    let m = won_match();
    assert_eq!(gold(&m.c, &player()), 125);
    assert_eq!(gold(&m.c, &nauarch()), TREASURY - 25);
    assert_eq!(gold(&m.c, &acc("brinewar.testnet")), 0);
    let ev = events("treasury_changed");
    assert_eq!(ev[0]["data"][0]["bounty"], "25");
    assert_eq!(ev[0]["data"][0]["after"], (TREASURY - 25).to_string());
}

#[test]
fn loss_moves_stake_into_treasury() {
    let mut m = Match::started();
    m.exchange(9, 9);
    m.chain.act(&player());
    m.c.resign(m.id);
    assert_eq!(gold(&m.c, &player()), 90);
    assert_eq!(gold(&m.c, &nauarch()), TREASURY + 10);
}

#[test]
fn cancelled_game_refunds_stake() {
    let mut m = Match::placing();
    m.chain.act(&player());
    m.c.resign(m.id);
    assert_eq!(gold(&m.c, &player()), 100);
    assert_eq!(gold(&m.c, &nauarch()), TREASURY);
}

#[test]
fn poor_treasury_raises_entry_and_shrinks_bounty() {
    let mut chain = Chain { height: 100 };
    chain.act(&acc("brinewar.testnet"));
    let mut c = Brinewar::new(
        acc("brinewar.testnet"),
        nauarch(),
        registrar(),
        settings(),
        U128(250),
    );
    let t = c.treasury();
    assert_eq!(t.entry.0, 15);
    assert_eq!(t.bounty.0, 12);
    chain.act(&registrar());
    c.register_player(player(), None);
    chain.act(&player());
    c.new_game_vs_nauarch(None);
    assert_eq!(gold(&c, &player()), 85);
}

#[test]
fn broke_player_still_plays_for_what_is_left() {
    let mut chain = Chain { height: 100 };
    chain.act(&acc("brinewar.testnet"));
    let mut s = settings();
    s.start_gold = U128(4);
    let mut c = Brinewar::new(
        acc("brinewar.testnet"),
        nauarch(),
        registrar(),
        s,
        U128(TREASURY),
    );
    chain.act(&registrar());
    c.register_player(player(), None);
    chain.act(&player());
    let id = c.new_game_vs_nauarch(None);
    assert_eq!(c.get_game(id).unwrap().stake.0, 4);
    assert_eq!(gold(&c, &player()), 0);
}

#[test]
fn win_grows_the_flagship_and_reveal_adds_sunk_ships() {
    let mut m = won_match();
    let ship = m.c.get_ship(ship_token(0)).unwrap();
    assert_eq!(ship.xp, 20 * XP_HIT + XP_WIN);
    assert_eq!(ship.rank, "Captain");
    assert_eq!(ship.class, "Frigate");
    assert_eq!(ship.wins, 1);
    m.reveal(&nauarch());
    let ship = m.c.get_ship(ship_token(0)).unwrap();
    assert_eq!(ship.sunk, 10);
    assert_eq!(ship.xp, 20 * XP_HIT + XP_WIN + 10 * XP_SUNK);
    assert_eq!(ship.rank, "Captain");
    let svg = m.c.ship_svg(ship_token(0), None).unwrap();
    assert!(svg.contains("<svg"));
    let owned = m.c.ship_svg(ship_token(0), Some("coral".into())).unwrap();
    assert_ne!(owned, svg);
    assert!(owned.contains("#f2a58e"));
    assert_eq!(
        m.c.ship_svg(ship_token(0), Some("admiral".into())).unwrap(),
        svg
    );
    assert_eq!(
        m.c.ship_svg(ship_token(0), Some("no-such-skin".into()))
            .unwrap(),
        svg
    );
}

#[test]
fn loss_counts_hits_only() {
    let mut m = Match::started();
    m.exchange(0, 9);
    m.exchange(10, 19);
    m.chain.act(&player());
    m.c.resign(m.id);
    let ship = m.c.get_ship(ship_token(0)).unwrap();
    assert_eq!(ship.xp, 2 * XP_HIT);
    assert_eq!(ship.losses, 1);
    let p = m.c.get_player(player()).unwrap();
    assert_eq!((p.games_vs_nauarch, p.wins, p.losses), (1, 0, 1));
    assert_eq!(p.last_result.as_deref(), Some("lost"));
}

#[test]
fn transferred_flagship_is_frozen() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    let buyer = acc("buyer.testnet");
    chain.act(&registrar());
    c.register_player(buyer.clone(), None);
    act_paying(&chain, &player(), 1);
    c.mt_transfer(buyer.clone(), ship_token(0), U128(1), None, None);
    assert_eq!(c.mt_balance_of(buyer.clone(), ship_token(0)).0, 1);
    let t = c.mt_token(vec![ship_token(0), GOLD.into(), "nope".into()]);
    assert_eq!(t[0].as_ref().unwrap().owner_id, Some(buyer.clone()));
    assert_eq!(t[1].as_ref().unwrap().owner_id, None);
    assert!(t[2].is_none());
    let mut m = Match::open(chain, c, Board::new(&LEGAL_A, 1), Board::new(&LEGAL_B, 2));
    m.commit_both();
    m.a_sinks_b();
    m.reveal(&player());
    let ship = m.c.get_ship(ship_token(0)).unwrap();
    assert!(ship.frozen);
    assert_eq!(ship.xp, 0);
    assert_eq!(m.c.get_player(player()).unwrap().wins, 1);
}

#[test]
fn mt_transfer_moves_gold_and_logs_nep245() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    let friend = acc("friend.testnet");
    chain.act(&registrar());
    c.register_player(friend.clone(), None);
    act_paying(&chain, &player(), 1);
    c.mt_transfer(
        friend.clone(),
        GOLD.into(),
        U128(30),
        None,
        Some("gift".into()),
    );
    assert_eq!(gold(&c, &player()), 70);
    assert_eq!(gold(&c, &friend), 130);
    let logs = get_logs();
    let ev: serde_json::Value =
        serde_json::from_str(logs[0].strip_prefix("EVENT_JSON:").unwrap()).unwrap();
    assert_eq!(ev["standard"], "nep245");
    assert_eq!(ev["event"], "mt_transfer");
    assert_eq!(ev["data"][0]["amounts"][0], "30");
    assert_eq!(
        c.mt_batch_balance_of(player(), vec![GOLD.into(), ship_token(0)]),
        vec![U128(70), U128(1)]
    );
    assert_eq!(c.mt_supply(GOLD.into()).unwrap().0, TREASURY + 200);
}

#[test]
fn mt_transfer_rules() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    let friend = acc("friend.testnet");
    act_paying(&chain, &player(), 1);
    let msg = panics(|| c.mt_transfer(friend.clone(), GOLD.into(), U128(1), None, None));
    assert!(msg.contains("registered player"), "{msg}");
    chain.act(&registrar());
    c.register_player(friend.clone(), None);
    act_paying(&chain, &player(), 0);
    let msg = panics(|| c.mt_transfer(friend.clone(), GOLD.into(), U128(1), None, None));
    assert!(msg.contains("1 yoctoNEAR"), "{msg}");
    act_paying(&chain, &player(), 1);
    let msg = panics(|| c.mt_transfer(friend.clone(), GOLD.into(), U128(101), None, None));
    assert!(msg.contains("not enough"), "{msg}");
    let msg = panics(|| c.mt_transfer(friend.clone(), "skin:none".into(), U128(1), None, None));
    assert!(msg.contains("unknown token"), "{msg}");
    let msg = panics(|| c.mt_transfer(player(), GOLD.into(), U128(1), None, None));
    assert!(msg.contains("must differ"), "{msg}");
    let msg = panics(|| c.mt_batch_transfer(friend.clone(), vec![GOLD.into()], vec![], None, None));
    assert!(msg.contains("same non-zero length"), "{msg}");
}

#[test]
fn resolve_refunds_what_the_receiver_returns() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    let dex = acc("dex.testnet");
    chain.act(&registrar());
    c.register_player(dex.clone(), None);
    act_paying(&chain, &player(), 1);
    let _ = c.mt_transfer_call(dex.clone(), GOLD.into(), U128(50), None, None, "buy".into());
    assert_eq!(gold(&c, &dex), 150);
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(acc("brinewar.testnet"))
            .predecessor_account_id(acc("brinewar.testnet"))
            .build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(b"[\"20\"]".to_vec())],
    );
    let used = c.mt_resolve_transfer(
        vec![player()],
        dex.clone(),
        vec![GOLD.into()],
        vec![U128(50)],
        None,
        Ok(vec![U128(20)]),
    );
    assert_eq!(used, vec![U128(30)]);
    assert_eq!(gold(&c, &player()), 70);
    assert_eq!(gold(&c, &dex), 130);
    let used = c.mt_resolve_transfer(
        vec![player()],
        dex.clone(),
        vec![GOLD.into()],
        vec![U128(30)],
        None,
        Err(near_sdk::PromiseError::Failed),
    );
    assert_eq!(used, vec![U128(0)]);
    assert_eq!(gold(&c, &dex), 100);
}

#[test]
fn only_owner_mints_skins() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&player());
    let msg = panics(|| c.mint_skin("coral".into(), player(), U128(1)));
    assert!(msg.contains("only the owner"), "{msg}");
    chain.act(&acc("brinewar.testnet"));
    c.mint_skin("coral-reef".into(), player(), U128(2));
    assert_eq!(c.mt_balance_of(player(), "skin:coral-reef".into()).0, 2);
    let msg = panics(|| c.mint_skin("Bad Name".into(), player(), U128(1)));
    assert!(msg.contains("skin name"), "{msg}");
}

#[test]
fn valid_long_game_board_heats_the_map_once_a_day() {
    let m = won_match();
    let map = m.c.admiralty_map();
    assert_eq!(map.boards_counted, 1);
    for &i in LEGAL_A.iter() {
        assert_eq!(map.heat[i], 1);
    }
    assert_eq!(map.heat.iter().sum::<u32>(), 20);
    assert_eq!(events("heat_updated").len(), 1);

    let mut m = m.next_game(Board::new(&MIRROR_A, 3), Board::new(&LEGAL_B, 4));
    m.commit_both();
    m.a_sinks_b();
    m.reveal(&player());
    assert_eq!(m.c.admiralty_map().boards_counted, 1);

    m.chain.skip(DAY);
    let mut m = m.next_game(Board::new(&MIRROR_A, 5), Board::new(&LEGAL_B, 6));
    m.commit_both();
    m.a_sinks_b();
    m.reveal(&player());
    assert_eq!(m.c.admiralty_map().boards_counted, 2);
}

#[test]
fn short_game_board_does_not_count() {
    let mut m = Match::started();
    m.exchange(9, 9);
    m.exchange(19, 19);
    m.chain.act(&player());
    m.c.resign(m.id);
    m.reveal(&player());
    assert_eq!(m.c.admiralty_map().boards_counted, 0);
    assert_eq!(
        m.c.get_player(player()).unwrap().fav_zone.as_deref(),
        Some("north-west")
    );
}

#[test]
fn illegal_board_does_not_count() {
    let mut m = Match::started_with(Board::new(&BENT, 1), Board::new(&LEGAL_B, 2));
    m.a_sinks_b();
    m.reveal(&player());
    assert_eq!(m.c.admiralty_map().boards_counted, 0);
    assert_eq!(m.c.get_player(player()).unwrap().fav_zone, None);
}

#[test]
fn nauarch_board_never_heats_the_map() {
    let mut m = won_match();
    m.reveal(&nauarch());
    assert_eq!(m.c.admiralty_map().boards_counted, 1);
    assert_eq!(m.c.admiralty_map().heat[90], 0);
}

#[test]
fn request_is_byte_identical_for_identical_public_state() {
    let mut x = Match::started();
    let mut y = Match::started_with(Board::new(&LEGAL_A, 8), Board::new(&LEGAL_B, 9));
    for m in [&mut x, &mut y] {
        m.fire(&player(), 0);
        m.answer_truthfully(&nauarch(), 0);
    }
    x.chain.act(&nauarch());
    let rx = x.c.nauarch_request(x.id, MoveKind::Shot);
    y.chain.act(&nauarch());
    let ry = y.c.nauarch_request(y.id, MoveKind::Shot);
    assert_eq!(rx, ry);
    assert_eq!(rx, x.c.nauarch_request(x.id, MoveKind::Shot));
    let v: serde_json::Value = serde_json::from_str(&rx).unwrap();
    assert_eq!(v["model"], MODEL);
    assert_eq!(v["temperature"], 0);
    assert_eq!(v["chat_template_kwargs"]["enable_thinking"], false);
    let user = v["messages"][1]["content"].as_str().unwrap();
    assert!(user.contains("A1 hit"), "{user}");
    assert!(user.contains("first battle against you"), "{user}");
    assert!(!user.contains(&x.a.cells_str()));
}

#[test]
fn signature_over_an_older_history_is_rejected() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    m.answer_truthfully(&nauarch(), 1);
    m.chain.act(&nauarch());
    let stale = m.c.nauarch_request(m.id, MoveKind::Shot);
    let response = response_with(r#"{"shot":"J10","line":"Hm."}"#);
    let sig = sign(&stale, &response);
    m.c.submit_ai_move(m.id, MoveKind::Shot, response.clone(), sig.clone());
    m.answer_truthfully(&player(), 99);
    m.fire(&player(), 3);
    m.answer_truthfully(&nauarch(), 3);
    m.chain.act(&nauarch());
    let msg = panics(|| {
        m.c.submit_ai_move(m.id, MoveKind::Shot, response.clone(), sig.clone())
    });
    assert!(msg.contains("model signature does not match"), "{msg}");
}

#[test]
fn tampered_response_or_foreign_key_is_rejected() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    m.answer_truthfully(&nauarch(), 1);
    m.chain.act(&nauarch());
    let request = m.c.nauarch_request(m.id, MoveKind::Shot);
    let honest = response_with(r#"{"shot":"J10","line":"Hm."}"#);
    let sig = sign(&request, &honest);
    let forged = response_with(r#"{"shot":"A2","line":"Hm."}"#);
    let msg = panics(|| {
        m.c.submit_ai_move(m.id, MoveKind::Shot, forged.clone(), sig.clone())
    });
    assert!(msg.contains("model signature does not match"), "{msg}");
    let other = SigningKey::from_bytes(&[9u8; 32]);
    let text = signed_text(MODEL, &request, &honest);
    let foreign = hex::encode(other.sign(text.as_bytes()).to_bytes());
    let msg = panics(|| {
        m.c.submit_ai_move(m.id, MoveKind::Shot, honest.clone(), foreign.clone())
    });
    assert!(msg.contains("model signature does not match"), "{msg}");
    let msg = panics(|| {
        m.c.submit_ai_move(m.id, MoveKind::Shot, honest.clone(), "00".into())
    });
    assert!(msg.contains("64 bytes"), "{msg}");
}

#[test]
fn only_the_nauarch_submits_ai_moves() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    m.answer_truthfully(&nauarch(), 1);
    m.chain.act(&player());
    let request = m.c.nauarch_request(m.id, MoveKind::Shot);
    let response = response_with(r#"{"shot":"J10","line":"Hm."}"#);
    let sig = sign(&request, &response);
    let msg = panics(|| {
        m.c.submit_ai_move(m.id, MoveKind::Shot, response.clone(), sig.clone())
    });
    assert!(msg.contains("only the Nauarch"), "{msg}");
    let msg = panics(|| m.c.nauarch_fallback(m.id));
    assert!(msg.contains("only the Nauarch"), "{msg}");
}

#[test]
fn ai_move_records_shot_and_signed_line() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    m.answer_truthfully(&nauarch(), 1);
    m.ai(
        MoveKind::Shot,
        r#"{"shot":"C4","line":"The left edge again, Captain?\nPredictable."}"#,
    );
    let h = m.c.get_history(m.id);
    assert_eq!(h[1].index, 32);
    assert_eq!(h[1].source, ShotSource::Model);
    let said = events("nauarch_said");
    assert_eq!(
        said[0]["data"][0]["line"],
        "The left edge again, Captain? Predictable."
    );
    assert_eq!(said[0]["data"][0]["shot"], "C4");
}

#[test]
fn bad_or_repeated_model_shot_falls_back_to_deterministic() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    m.answer_truthfully(&nauarch(), 1);
    m.ai(MoveKind::Shot, r#"{"shot":"Z99","line":"Hm."}"#);
    let h = m.c.get_history(m.id);
    assert_eq!(h[1].source, ShotSource::ModelFallback);
    let first = h[1].index;
    m.answer_truthfully(&player(), first);
    if m.view().turn == player() {
        m.fire(&player(), 3);
        m.answer_truthfully(&nauarch(), 3);
    }
    m.ai(
        MoveKind::Shot,
        &format!(
            r#"{{"shot":"{}","line":"{}"}}"#,
            cell_name(first),
            "y".repeat(400)
        ),
    );
    let h = m.c.get_history(m.id);
    let last = h.last().unwrap();
    assert_eq!(last.source, ShotSource::ModelFallback);
    assert_ne!(last.index, first);
    let said = events("nauarch_said");
    assert_eq!(said[0]["data"][0]["line"].as_str().unwrap().len(), 140);
}

#[test]
fn reply_without_json_still_moves() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    m.answer_truthfully(&nauarch(), 1);
    m.ai(MoveKind::Shot, "I refuse to answer in JSON.");
    let h = m.c.get_history(m.id);
    assert_eq!(h[1].source, ShotSource::ModelFallback);
    assert_eq!(
        events("nauarch_said")[0]["data"][0]["line"],
        serde_json::Value::Null
    );
}

#[test]
fn fallback_targets_around_hits_and_skips_diagonals() {
    let mut m = Match::started();
    m.fire(&player(), 50);
    m.answer_truthfully(&nauarch(), 50);
    m.fire(&nauarch(), 0);
    m.answer_truthfully(&player(), 0);
    m.chain.act(&nauarch());
    m.c.nauarch_fallback(m.id);
    let h = m.c.get_history(m.id);
    assert_eq!(h[2].index, 1);
    assert_eq!(h[2].source, ShotSource::Deterministic);
    m.answer_truthfully(&player(), 1);
    m.chain.act(&nauarch());
    m.c.nauarch_fallback(m.id);
    assert_eq!(m.c.get_history(m.id)[3].index, 2);
}

#[test]
fn hunt_follows_the_admiralty_map() {
    let m = won_match();
    let mut m = m.next_game(Board::new(&LEGAL_A, 3), Board::new(&LEGAL_B, 4));
    m.commit_both();
    m.fire(&player(), 95);
    m.answer_truthfully(&nauarch(), 95);
    m.chain.act(&nauarch());
    let request = m.c.nauarch_request(m.id, MoveKind::Shot);
    assert!(request.contains("A1 100%"), "{request}");
    assert!(
        request.contains("1 games vs you, 1 wins, last game won today"),
        "{request}"
    );
    assert!(
        request.contains("usually hides ships in the north-west"),
        "{request}"
    );
    m.c.nauarch_fallback(m.id);
    let shot = m.c.get_history(m.id)[1].index as usize;
    assert!(LEGAL_A.contains(&shot), "fallback fired at {shot}");
}

#[test]
fn farewell_only_once_and_only_after_the_game() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    m.answer_truthfully(&nauarch(), 1);
    m.chain.act(&nauarch());
    let request = m.c.nauarch_request(m.id, MoveKind::Farewell);
    let response = response_with(r#"{"line":"Fair winds."}"#);
    let sig = sign(&request, &response);
    let msg = panics(|| {
        m.c.submit_ai_move(m.id, MoveKind::Farewell, response.clone(), sig.clone())
    });
    assert!(msg.contains("not finished"), "{msg}");
    m.chain.act(&player());
    m.c.resign(m.id);
    m.ai(MoveKind::Farewell, r#"{"line":"Fair winds, Captain."}"#);
    assert!(m.view().farewell_said);
    let said = events("nauarch_said");
    assert_eq!(said[0]["data"][0]["kind"], "Farewell");
    assert_eq!(said[0]["data"][0]["line"], "Fair winds, Captain.");
    m.chain.act(&nauarch());
    let request = m.c.nauarch_request(m.id, MoveKind::Farewell);
    let response = response_with(r#"{"line":"Again."}"#);
    let sig = sign(&request, &response);
    let msg = panics(|| {
        m.c.submit_ai_move(m.id, MoveKind::Farewell, response.clone(), sig.clone())
    });
    assert!(msg.contains("already said"), "{msg}");
}

#[test]
fn ai_move_needs_a_model() {
    let mut chain = Chain { height: 100 };
    chain.act(&acc("brinewar.testnet"));
    let mut c = Brinewar::new(
        acc("brinewar.testnet"),
        nauarch(),
        registrar(),
        settings(),
        U128(TREASURY),
    );
    chain.act(&acc("stranger.testnet"));
    let msg = panics(|| c.set_model(MODEL.into(), "00".repeat(32)));
    assert!(msg.contains("only the owner"), "{msg}");
    assert!(c.model().is_none());
}

#[test]
fn timeout_win_refunds_but_pays_no_bounty_or_win_xp() {
    let mut m = Match::started();
    m.fire(&player(), 0);
    m.answer_truthfully(&nauarch(), 0);
    m.fire(&player(), 1);
    m.answer_truthfully(&nauarch(), 1);
    m.chain.skip(TIMEOUT + 1);
    m.chain.act(&player());
    m.c.claim_timeout(m.id);
    assert_eq!(m.view().winner, Some(player()));
    assert_eq!(gold(&m.c, &player()), 100);
    assert_eq!(gold(&m.c, &nauarch()), TREASURY);
    let ship = m.c.get_ship(ship_token(0)).unwrap();
    assert_eq!(ship.xp, XP_HIT);
    assert_eq!(ship.wins, 1);
}

#[test]
fn bounty_is_paid_once_per_day() {
    let m = won_match();
    assert_eq!(gold(&m.c, &player()), 125);
    let mut m = m.next_game(Board::new(&MIRROR_A, 3), Board::new(&LEGAL_B, 4));
    m.commit_both();
    m.a_sinks_b();
    m.reveal(&player());
    assert_eq!(gold(&m.c, &player()), 125);
    m.chain.skip(DAY);
    let mut m = m.next_game(Board::new(&MIRROR_A, 5), Board::new(&LEGAL_B, 6));
    m.commit_both();
    m.a_sinks_b();
    m.reveal(&player());
    assert_eq!(gold(&m.c, &player()), 150);
}

#[test]
fn daily_game_limit_holds_until_tomorrow() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    for _ in 0..3 {
        chain.act(&player());
        let id = c.new_game_vs_nauarch(None);
        c.resign(id);
    }
    chain.act(&player());
    let msg = panics(|| {
        c.new_game_vs_nauarch(None);
    });
    assert!(msg.contains("daily game limit"), "{msg}");
    chain.skip(DAY);
    chain.act(&player());
    c.new_game_vs_nauarch(None);
}

#[test]
fn cancelled_games_leave_no_record() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&player());
    let id = c.new_game_vs_nauarch(None);
    c.resign(id);
    assert!(c.get_game(id).is_none());
    assert!(c.get_history(id).is_empty());
}

#[test]
fn failed_guest_creation_rolls_back_registration() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&registrar());
    let key = guest_key(5);
    let account = c.guest_account_for(key.clone());
    let _ = c.create_guest(key.clone(), None);
    let supply = c.mt_supply(GOLD.into()).unwrap().0;
    chain.act(&acc("brinewar.testnet"));
    assert!(!c.on_guest_created(account.clone(), Err(near_sdk::PromiseError::Failed)));
    assert!(c.get_player(account.clone()).is_none());
    assert_eq!(gold(&c, &account), 0);
    assert_eq!(c.mt_supply(GOLD.into()).unwrap().0, supply - 100);
    assert!(c.mt_supply(ship_token(1)).is_none());
    assert_eq!(events("mt_burn").len(), 5);
    chain.act(&registrar());
    let _ = c.create_guest(key, None);
    assert!(c.get_player(account).is_some());
}

#[test]
fn hot_cells_wait_for_enough_boards() {
    let mut chain = Chain { height: 100 };
    chain.act(&acc("brinewar.testnet"));
    let mut s = settings();
    s.min_heat_boards = 2;
    let mut c = Brinewar::new(
        acc("brinewar.testnet"),
        nauarch(),
        registrar(),
        s,
        U128(TREASURY),
    );
    c.set_model(
        MODEL.to_string(),
        hex::encode(model_key().verifying_key().as_bytes()),
    );
    chain.act(&registrar());
    c.register_player(player(), None);
    let mut m = Match::open(chain, c, Board::new(&LEGAL_A, 1), Board::new(&LEGAL_B, 2));
    m.commit_both();
    m.a_sinks_b();
    m.reveal(&player());
    assert_eq!(m.c.admiralty_map().boards_counted, 1);
    let mut m = m.next_game(Board::new(&LEGAL_A, 3), Board::new(&LEGAL_B, 4));
    m.commit_both();
    m.fire(&player(), 95);
    m.answer_truthfully(&nauarch(), 95);
    m.chain.act(&nauarch());
    let request = m.c.nauarch_request(m.id, MoveKind::Shot);
    assert!(request.contains("no data yet"), "{request}");
    assert!(request.contains("Battle #1."), "{request}");
}

#[test]
fn games_since_pages_and_skips_cancelled() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&registrar());
    c.register_player(acc("p-2.brinewar.testnet"), None);
    chain.act(&player());
    let first = c.new_game_vs_nauarch(None);
    c.resign(first);
    let second = c.new_game_vs_nauarch(None);
    chain.act(&acc("p-2.brinewar.testnet"));
    let third = c.new_game_vs_nauarch(None);
    let page = c.games_since(0, 10);
    assert_eq!(
        page.iter().map(|g| g.id).collect::<Vec<_>>(),
        vec![second, third]
    );
    assert_eq!(c.games_since(third, 10).len(), 1);
    assert_eq!(c.games_since(0, 1).len(), 0);
}

#[test]
fn a_new_model_keeps_the_old_key_for_past_signatures() {
    let mut m = Match::started();
    let old = hex::encode(model_key().verifying_key().as_bytes());
    assert_eq!(m.c.model_key_of(MODEL.into()), Some(old.clone()));
    m.chain.act(&acc("brinewar.testnet"));
    m.c.set_model("Qwen/Faster".into(), "ab".repeat(32));
    assert_eq!(m.c.model().unwrap().model, "Qwen/Faster");
    assert_eq!(m.c.model_key_of(MODEL.into()), Some(old));
    assert_eq!(
        m.c.model_key_of("Qwen/Faster".into()),
        Some("ab".repeat(32))
    );
    assert_eq!(m.c.model_key_of("never/seen".into()), None);
}

fn answer_args(b: &Board, i: u8) -> (u8, String, Vec<String>) {
    (b.cells[i as usize], b.salt_hex(i), b.proof_hex(i))
}

#[test]
fn an_answer_and_the_next_shot_travel_in_one_call() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    let request = m.c.nauarch_request_after(m.id, 1, 0);
    let response = response_with(r#"{"shot":"J10","line":"Steady."}"#);
    let sig = sign(&request, &response);
    let (cell, salt, pf) = answer_args(&m.b, 1);
    m.chain.skip(1);
    m.chain.act(&nauarch());
    m.c.answer(
        m.id,
        1,
        cell,
        salt,
        pf,
        None,
        Some(AiReply {
            response_body: response,
            signature_hex: sig,
        }),
        None,
    );
    let h = m.c.get_history(m.id);
    assert_eq!(h.len(), 2);
    assert_eq!(h[0].result, ShotResult::Miss);
    assert_eq!(
        (h[1].index, h[1].source, h[1].result),
        (99, ShotSource::Model, ShotResult::Pending)
    );
    let (cell, salt, pf) = answer_args(&m.a, 99);
    m.chain.skip(1);
    m.chain.act(&player());
    m.c.answer(m.id, 99, cell, salt, pf, Some(3), None, None);
    let h = m.c.get_history(m.id);
    assert_eq!(h.len(), 3);
    assert_eq!(h[1].result, ShotResult::Miss);
    assert_eq!((h[2].index, h[2].result), (3, ShotResult::Pending));
    assert_eq!(m.view().turn, nauarch());
}

#[test]
fn the_nauarch_can_answer_and_fall_back_in_one_call() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    let (cell, salt, pf) = answer_args(&m.b, 1);
    m.chain.skip(1);
    m.chain.act(&nauarch());
    m.c.answer(m.id, 1, cell, salt, pf, None, None, Some(true));
    let h = m.c.get_history(m.id);
    assert_eq!(h.len(), 2);
    assert_eq!(h[1].source, ShotSource::Deterministic);
    assert_eq!(m.view().pending_index, Some(h[1].index));
}

#[test]
fn nothing_may_follow_a_hit_and_nobody_fires_for_the_other_side() {
    let mut m = Match::started();
    m.fire(&player(), 0);
    let (cell, salt, pf) = answer_args(&m.b, 0);
    m.chain.skip(1);
    m.chain.act(&nauarch());
    let msg = panics(|| {
        m.c.answer(
            m.id,
            0,
            cell,
            salt.clone(),
            pf.clone(),
            None,
            None,
            Some(true),
        )
    });
    assert!(msg.contains("a hit keeps the turn"), "{msg}");
    assert_eq!(m.view().pending_index, Some(0));
    m.answer_truthfully(&nauarch(), 0);
    m.fire(&player(), 1);
    let (cell, salt, pf) = answer_args(&m.b, 1);
    m.chain.skip(1);
    m.chain.act(&nauarch());
    let msg = panics(|| {
        m.c.answer(m.id, 1, cell, salt.clone(), pf.clone(), Some(5), None, None)
    });
    assert!(msg.contains("the Nauarch fires through"), "{msg}");
    m.c.answer(m.id, 1, cell, salt, pf, None, None, Some(true));
    let fired = m.view().pending_index.unwrap();
    let (cell, salt, pf) = answer_args(&m.a, fired);
    m.chain.skip(1);
    m.chain.act(&player());
    let fake = AiReply {
        response_body: response_with(r#"{"shot":"A1","line":"x"}"#),
        signature_hex: "00".repeat(64),
    };
    let msg = panics(|| {
        m.c.answer(
            m.id,
            fired,
            cell,
            salt.clone(),
            pf.clone(),
            None,
            Some(fake),
            None,
        )
    });
    assert!(
        msg.contains("only the Nauarch") || msg.contains("a hit keeps the turn"),
        "{msg}"
    );
}

#[test]
fn the_request_after_an_answer_matches_the_request_the_contract_checks() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    let after = m.c.nauarch_request_after(m.id, 1, 0);
    m.answer_truthfully(&nauarch(), 1);
    m.chain.act(&nauarch());
    assert_eq!(after, m.c.nauarch_request(m.id, MoveKind::Shot));
    let msg = panics(|| {
        m.c.nauarch_request_after(m.id, 1, 0);
    });
    assert!(msg.contains("no shot to answer"), "{msg}");
}

#[test]
fn model_cannot_leave_a_wounded_ship_afloat() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    m.answer_truthfully(&nauarch(), 1);
    m.fire(&nauarch(), 21);
    m.answer_truthfully(&player(), 21);
    m.chain.act(&nauarch());
    let request = m.c.nauarch_request(m.id, MoveKind::Shot);
    assert!(request.contains("Finish it"), "{request}");
    assert!(request.contains("B2, C3, B4, A3"), "{request}");
    m.ai(MoveKind::Shot, r#"{"shot":"J10","line":"Elsewhere."}"#);
    let history = m.c.get_history(m.id);
    let last = history.last().unwrap();
    assert_eq!(last.source, ShotSource::ModelFallback);
    assert!(
        [11, 22, 31, 20].contains(&last.index),
        "fired at {}",
        last.index
    );
}

#[test]
fn water_around_a_sunk_ship_is_ruled_out() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    m.answer_truthfully(&nauarch(), 1);
    m.fire(&nauarch(), 40);
    m.answer_truthfully(&player(), 40);
    m.fire(&nauarch(), 41);
    m.answer_truthfully(&player(), 41);
    m.fire(&nauarch(), 42);
    m.answer_truthfully(&player(), 42);
    m.fire(&player(), 3);
    m.answer_truthfully(&nauarch(), 3);
    m.chain.act(&nauarch());
    let request = m.c.nauarch_request(m.id, MoveKind::Shot);
    assert!(request.contains("Ships you sank: A5, B5."), "{request}");
    assert!(request.contains("you hunt"), "{request}");
    m.ai(MoveKind::Shot, r#"{"shot":"A4","line":"Next door?"}"#);
    let history = m.c.get_history(m.id);
    let last = history.last().unwrap();
    assert_eq!(last.source, ShotSource::ModelFallback);
    assert!(
        ![30, 31, 32, 50, 51, 52].contains(&last.index),
        "fired at {}",
        last.index
    );
}

#[test]
fn hunt_without_a_map_does_not_sweep_a_line() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    m.answer_truthfully(&nauarch(), 1);
    m.chain.act(&nauarch());
    let request = m.c.nauarch_request(m.id, MoveKind::Shot);
    let cells = request
        .split("your own reckoning: ")
        .nth(1)
        .and_then(|r| r.split(".\n").next())
        .unwrap();
    let rows: std::collections::BTreeSet<u8> = cells
        .split(", ")
        .filter_map(crate::nauarch::parse_cell)
        .map(|c| c / 10)
        .collect();
    assert!(rows.len() >= 3, "{cells}");
}

#[test]
fn with_a_map_the_model_hunts_only_the_hot_cells() {
    let m = won_match();
    let mut m = m.next_game(Board::new(&MIRROR_A, 3), Board::new(&LEGAL_B, 4));
    m.commit_both();
    m.fire(&player(), 95);
    m.answer_truthfully(&nauarch(), 95);
    m.chain.act(&nauarch());
    let request = m.c.nauarch_request(m.id, MoveKind::Shot);
    assert!(request.contains("hunt from the Admiralty map"), "{request}");
    m.ai(MoveKind::Shot, r#"{"shot":"J10","line":"A hunch."}"#);
    let history = m.c.get_history(m.id);
    let last = history.last().unwrap();
    assert_eq!(last.source, ShotSource::ModelFallback);
    assert!(
        LEGAL_A.contains(&(last.index as usize)),
        "fired at {}",
        last.index
    );
}

#[test]
fn a_ship_as_long_as_the_longest_left_afloat_counts_as_sunk() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    m.answer_truthfully(&nauarch(), 1);
    for cell in [0, 1, 2, 3, 20, 21, 22] {
        m.fire(&nauarch(), cell);
        m.answer_truthfully(&player(), cell);
    }
    m.chain.act(&nauarch());
    let request = m.c.nauarch_request(m.id, MoveKind::Shot);
    assert!(request.contains("A3, B3, C3"), "{request}");
    let aim = m.c.nauarch_aim(m.id);
    assert!(!aim.is_empty());
    assert!(!aim.contains(&23), "{aim:?}");
    assert!(
        aim.iter()
            .all(|&c| c / 10 != 1 && c / 10 != 3 || c % 10 > 4),
        "{aim:?}"
    );
    m.ai(MoveKind::Shot, r#"{"shot":"D3","line":"One more."}"#);
    let history = m.c.get_history(m.id);
    let last = history.last().unwrap();
    assert_eq!(last.source, ShotSource::ModelFallback);
    assert!(aim.contains(&last.index), "{} not in {aim:?}", last.index);
}

#[test]
fn the_nauarch_aims_at_exactly_the_cells_his_prompt_offers() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    m.answer_truthfully(&nauarch(), 1);
    m.chain.act(&nauarch());
    let aim = m.c.nauarch_aim(m.id);
    let request = m.c.nauarch_request(m.id, MoveKind::Shot);
    let offered = request
        .split("your own reckoning: ")
        .nth(1)
        .and_then(|r| r.split('.').next())
        .unwrap();
    let named: Vec<String> = aim.iter().map(|&c| crate::nauarch::cell_name(c)).collect();
    assert_eq!(offered.split(", ").collect::<Vec<_>>(), named, "{request}");
}

#[test]
fn one_read_returns_the_game_and_its_history_together() {
    let mut m = Match::started();
    m.fire(&player(), 1);
    m.answer_truthfully(&nauarch(), 1);
    let battle = m.c.get_battle(m.id).unwrap();
    assert_eq!(battle.game.shots as usize, battle.history.len());
    assert_eq!(battle.history[0].index, 1);
    assert!(m.c.get_battle(9_999).is_none());
}
