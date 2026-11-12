use super::*;
use near_sdk::PublicKey;

fn guest_key(n: u8) -> PublicKey {
    let mut bytes = vec![0u8];
    bytes.extend([n; 32]);
    PublicKey::try_from(bytes).unwrap()
}

#[test]
fn new_captain_gets_the_starter_skin_and_it_is_listed() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&registrar());
    let account = c.guest_account_for(guest_key(1));
    let _ = c.create_guest(guest_key(1), None);
    assert_eq!(c.mt_balance_of(account, "skin:brine".into()).0, 1);
    assert_eq!(c.skins().iter().filter(|s| *s == "brine").count(), 1);
}

#[test]
fn minted_skins_are_listed_once_in_mint_order() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&acc("brinewar.testnet"));
    c.mint_skin("gilded".into(), player(), U128(1));
    c.mint_skin("storm".into(), player(), U128(1));
    c.mint_skin("gilded".into(), nauarch(), U128(3));
    let listed = c.skins();
    let tail: Vec<&str> = listed
        .iter()
        .map(String::as_str)
        .filter(|s| !["brine", "coral", "ghost"].contains(s))
        .collect();
    assert_eq!(tail, vec!["gilded", "storm"]);
}

#[test]
fn rollback_burns_the_starter_skin() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&registrar());
    let account = c.guest_account_for(guest_key(2));
    let _ = c.create_guest(guest_key(2), None);
    let supply = c.mt_supply("skin:brine".into()).unwrap().0;
    chain.act(&acc("brinewar.testnet"));
    assert!(!c.on_guest_created(account.clone(), Err(near_sdk::PromiseError::Failed)));
    assert_eq!(c.mt_balance_of(account, "skin:brine".into()).0, 0);
    assert_eq!(c.mt_supply("skin:brine".into()).unwrap().0, supply - 1);
}

#[test]
fn a_failed_first_guest_does_not_list_the_starter_skin_twice() {
    let mut chain = Chain { height: 100 };
    chain.act(&acc("brinewar.testnet"));
    let mut c = Brinewar::new(
        acc("brinewar.testnet"),
        nauarch(),
        registrar(),
        settings(),
        U128(1000),
    );
    for n in 3..6u8 {
        chain.act(&registrar());
        let account = c.guest_account_for(guest_key(n));
        let _ = c.create_guest(guest_key(n), None);
        chain.act(&acc("brinewar.testnet"));
        assert!(!c.on_guest_created(account, Err(near_sdk::PromiseError::Failed)));
    }
    chain.act(&registrar());
    let _ = c.create_guest(guest_key(9), None);
    assert_eq!(c.skins().iter().filter(|s| *s == "brine").count(), 1);
}

#[test]
fn a_second_create_guest_refuels_the_same_captain_and_counts_against_the_day() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&registrar());
    let account = c.guest_account_for(guest_key(7));
    let _ = c.create_guest(guest_key(7), Some("Ahab".into()));
    let before = c.get_player(account.clone()).unwrap();
    let ships_before = c.mt_supply(before.flagship.clone()).unwrap().0;
    let _ = c.create_guest(guest_key(7), Some("Other".into()));
    let after = c.get_player(account.clone()).unwrap();
    assert_eq!(after.display_name, "Ahab");
    assert_eq!(after.gold, before.gold);
    assert_eq!(after.flagship, before.flagship);
    assert_eq!(c.mt_supply(after.flagship).unwrap().0, ships_before);
    let refuels = events("guest_refueled");
    assert_eq!(refuels.len(), 1);
    assert_eq!(refuels[0]["data"][0]["account"], account.to_string());
    assert!(c.on_guest_refueled(account.clone(), Ok(())));
    assert!(!c.on_guest_refueled(account, Err(near_sdk::PromiseError::Failed)));
}

#[test]
fn refuels_stop_at_the_daily_guest_limit() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&registrar());
    let _ = c.create_guest(guest_key(8), None);
    let limit = settings().guests_per_day;
    for _ in 1..limit {
        let _ = c.create_guest(guest_key(8), None);
    }
    let msg = panics(|| {
        let _ = c.create_guest(guest_key(8), None);
    });
    assert!(msg.contains("daily guest limit"), "{msg}");
}

const SECRET: &str = "5ec2e75ec2e75ec2e75ec2e75ec2e75ec2e75ec2e75ec2e75ec2e75ec2e75ec2";

fn invite_hash() -> String {
    hex::encode(env::sha256(hex::decode(SECRET).unwrap()))
}

fn friend() -> AccountId {
    acc("friend.testnet")
}

fn gold_of(c: &Brinewar, who: &AccountId) -> u128 {
    c.mt_balance_of(who.clone(), GOLD.into()).0
}

struct Duel {
    chain: Chain,
    c: Brinewar,
    id: u64,
    a: Board,
    b: Board,
}

impl Duel {
    fn joined() -> Self {
        let mut chain = Chain { height: 100 };
        let mut c = contract(&mut chain);
        chain.act(&registrar());
        c.register_player(friend(), Some("Ishmael".into()));
        chain.act(&player());
        let id = c.new_game_pvp(invite_hash());
        chain.act(&friend());
        c.join_game(id, SECRET.into());
        Duel {
            chain,
            c,
            id,
            a: Board::new(&LEGAL_A, 1),
            b: Board::new(&LEGAL_B, 2),
        }
    }

    fn commit(&mut self) {
        self.chain.act(&player());
        self.c.commit_board(self.id, self.a.root_hex(), None);
        self.chain.act(&friend());
        self.c.commit_board(self.id, self.b.root_hex(), None);
    }

    fn shot(&mut self, who: &AccountId, index: u8) {
        let (target, board) = if *who == player() {
            (friend(), &self.b)
        } else {
            (player(), &self.a)
        };
        let (cell, salt, pf) = (
            board.cells[index as usize],
            board.salt_hex(index),
            board.proof_hex(index),
        );
        self.chain.skip(1);
        self.chain.act(who);
        self.c.fire(self.id, index);
        self.chain.skip(1);
        self.chain.act(&target);
        self.c.answer(self.id, index, cell, salt, pf);
    }

    fn reveal(&mut self, who: &AccountId) {
        let board = if *who == player() { &self.a } else { &self.b };
        let (cells, s) = (board.cells_str(), board.salts_hex());
        self.chain.skip(1);
        self.chain.act(who);
        self.c.reveal(self.id, cells, s);
    }
}

#[test]
fn a_friend_joins_an_open_duel_by_its_number() {
    let mut d = Duel::joined();
    let g = d.c.get_game(d.id).unwrap();
    assert_eq!(g.mode, Mode::PvP);
    assert_eq!(g.status, Status::Placing);
    assert_eq!(g.b, friend());
    assert_eq!(g.stake.0, 0);
    assert_eq!(d.c.active_game_of(friend()), Some(d.id));
    assert_eq!(d.c.active_game_of(player()), Some(d.id));
    d.commit();
    assert_eq!(d.c.get_game(d.id).unwrap().status, Status::Playing);
}

#[test]
fn only_a_free_registered_captain_can_join_a_waiting_duel() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&registrar());
    c.register_player(friend(), None);
    chain.act(&player());
    let id = c.new_game_pvp(invite_hash());
    assert_eq!(c.get_game(id).unwrap().status, Status::Waiting);
    let msg = panics(|| c.join_game(id, SECRET.into()));
    assert!(msg.contains("your own"), "{msg}");
    chain.act(&acc("stranger.testnet"));
    let msg = panics(|| c.join_game(id, SECRET.into()));
    assert!(msg.contains("not a registered player"), "{msg}");
    chain.act(&nauarch());
    let msg = panics(|| c.join_game(id, SECRET.into()));
    assert!(
        msg.contains("not a registered player") || msg.contains("Nauarch"),
        "{msg}"
    );
    chain.act(&friend());
    let msg = panics(|| c.join_game(id, "00".repeat(32)));
    assert!(msg.contains("invite link is not valid"), "{msg}");
    let msg = panics(|| c.join_game(id, "zz".into()));
    assert!(msg.contains("invite secret"), "{msg}");
    c.join_game(id, SECRET.into());
    chain.act(&acc("third.testnet"));
    let msg = panics(|| c.join_game(id, SECRET.into()));
    assert!(msg.contains("not waiting"), "{msg}");
}

#[test]
fn an_unjoined_duel_is_cancelled_by_its_creator_or_by_time() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&player());
    let id = c.new_game_pvp(invite_hash());
    c.resign(id);
    assert!(c.get_game(id).is_none());
    assert_eq!(c.active_game_of(player()), None);
    let msg = panics(|| {
        c.new_game_pvp("abc".into());
    });
    assert!(msg.contains("invite"), "{msg}");
    let id = c.new_game_pvp(invite_hash());
    chain.skip(settings().move_timeout_blocks * 20);
    chain.act(&acc("anyone.testnet"));
    c.claim_timeout(id);
    assert!(c.get_game(id).is_none());
    assert_eq!(c.active_game_of(player()), None);
}

#[test]
fn a_full_duel_moves_no_gold_and_grows_both_flagships() {
    let mut d = Duel::joined();
    let gold_a = gold_of(&d.c, &player());
    let gold_b = gold_of(&d.c, &friend());
    let treasury = d.c.treasury().balance.0;
    d.commit();
    let targets = d.b.ship_cells();
    let water = d.b.water_cells();
    let misses = d.a.water_cells();
    for (k, &t) in targets.iter().enumerate() {
        d.shot(&player(), water[k]);
        d.shot(&friend(), misses[k]);
        d.shot(&player(), t);
    }
    let g = d.c.get_game(d.id).unwrap();
    assert_eq!(g.status, Status::Revealing);
    assert_eq!(g.winner, Some(player()));
    d.reveal(&player());
    d.reveal(&friend());
    let g = d.c.get_game(d.id).unwrap();
    assert_eq!(g.status, Status::Finished);
    assert!(g.revealed_a && g.revealed_b);
    assert_eq!(gold_of(&d.c, &player()), gold_a);
    assert_eq!(gold_of(&d.c, &friend()), gold_b);
    assert_eq!(d.c.treasury().balance.0, treasury);
    let pa = d.c.get_player(player()).unwrap();
    let pb = d.c.get_player(friend()).unwrap();
    let sa = d.c.get_ship(pa.flagship).unwrap();
    let sb = d.c.get_ship(pb.flagship).unwrap();
    assert_eq!(sa.wins, 1);
    assert_eq!(sb.losses, 1);
    assert_eq!(sa.sunk, 10);
    assert!(sa.xp >= 200 + 100 + 300, "{}", sa.xp);
    assert_eq!(pa.games_vs_nauarch, 0);
    assert_eq!(d.c.admiralty_map().boards_counted, 0);
    assert_eq!(d.c.active_game_of(player()), None);
    assert_eq!(d.c.active_game_of(friend()), None);
}

#[test]
fn the_second_captain_fires_and_answers_in_a_duel() {
    let mut d = Duel::joined();
    d.commit();
    d.shot(&player(), 5);
    d.shot(&friend(), 7);
    let h = d.c.get_history(d.id);
    assert_eq!(h.len(), 2);
    assert_eq!(h[1].by, friend());
    assert_ne!(h[1].result, ShotResult::Pending);
}

#[test]
fn a_resigned_or_short_duel_gives_no_xp() {
    let mut d = Duel::joined();
    d.commit();
    let targets = d.b.ship_cells();
    let water = d.b.water_cells();
    let misses = d.a.water_cells();
    for k in 0..3 {
        d.shot(&player(), targets[k]);
        d.shot(&player(), water[k]);
        d.shot(&friend(), misses[k]);
    }
    d.chain.act(&friend());
    d.c.resign(d.id);
    let pa = d.c.get_player(player()).unwrap();
    let sa = d.c.get_ship(pa.flagship).unwrap();
    assert_eq!(sa.xp, 0);
    assert_eq!(sa.wins, 1);
}

#[test]
fn the_nauarch_methods_refuse_a_duel() {
    let mut d = Duel::joined();
    d.commit();
    d.chain.act(&nauarch());
    let msg = panics(|| d.c.nauarch_fallback(d.id));
    assert!(
        msg.contains("not a player") || msg.contains("Nauarch battle"),
        "{msg}"
    );
}

#[test]
fn old_guest_keys_open_and_join_duels_through_their_allowed_methods() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&registrar());
    c.register_player(friend(), None);
    chain.act(&player());
    let id = c.new_game_vs_nauarch(Some(invite_hash()));
    let g = c.get_game(id).unwrap();
    assert_eq!(g.mode, Mode::PvP);
    assert_eq!(g.status, Status::Waiting);
    assert_eq!(g.stake.0, 0);
    let b = Board::new(&LEGAL_B, 2);
    chain.act(&friend());
    let msg = panics(|| c.commit_board(id, b.root_hex(), Some("00".repeat(32))));
    assert!(msg.contains("invite link is not valid"), "{msg}");
    let msg = panics(|| c.commit_board(id, b.root_hex(), None));
    assert!(msg.contains("not in placement"), "{msg}");
    c.commit_board(id, b.root_hex(), Some(SECRET.into()));
    let g = c.get_game(id).unwrap();
    assert_eq!(g.b, friend());
    assert_eq!(g.status, Status::Placing);
    assert!(g.root_b.is_some());
    chain.act(&player());
    c.commit_board(id, Board::new(&LEGAL_A, 1).root_hex(), None);
    assert_eq!(c.get_game(id).unwrap().status, Status::Playing);
}

#[test]
fn new_captain_gets_three_starter_skins() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&registrar());
    let account = c.guest_account_for(guest_key(3));
    let _ = c.create_guest(guest_key(3), None);
    for skin in ["skin:brine", "skin:coral", "skin:ghost"] {
        assert_eq!(c.mt_balance_of(account.clone(), skin.into()).0, 1, "{skin}");
    }
    chain.act(&acc("brinewar.testnet"));
    assert!(!c.on_guest_created(account.clone(), Err(near_sdk::PromiseError::Failed)));
    for skin in ["skin:brine", "skin:coral", "skin:ghost"] {
        assert_eq!(c.mt_balance_of(account.clone(), skin.into()).0, 0, "{skin}");
    }
}

#[test]
fn each_new_rank_mints_its_skin_once() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    c.grant_rank_skins(&player(), 90, 310);
    assert_eq!(c.mt_balance_of(player(), "skin:night-watch".into()).0, 1);
    assert_eq!(c.mt_balance_of(player(), "skin:gilded".into()).0, 1);
    assert_eq!(c.mt_balance_of(player(), "skin:storm".into()).0, 0);
    c.grant_rank_skins(&player(), 0, 320);
    assert_eq!(c.mt_balance_of(player(), "skin:night-watch".into()).0, 1);
    c.grant_rank_skins(&player(), 310, 320);
    assert_eq!(c.mt_balance_of(player(), "skin:storm".into()).0, 0);
    c.grant_rank_skins(&player(), 690, 1600);
    assert_eq!(c.mt_balance_of(player(), "skin:storm".into()).0, 1);
    assert_eq!(c.mt_balance_of(player(), "skin:admiral".into()).0, 1);
    assert!(c.skins().iter().any(|s| s == "admiral"));
}

#[test]
fn owner_sets_the_move_timeout_within_bounds() {
    let mut chain = Chain { height: 100 };
    let mut c = contract(&mut chain);
    chain.act(&acc("brinewar.testnet"));
    c.set_move_timeout(600);
    assert_eq!(c.config().settings.move_timeout_blocks, 600);
    let low = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.set_move_timeout(5)));
    assert!(low.is_err());
    let high =
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.set_move_timeout(100_000)));
    assert!(high.is_err());
    chain.act(&player());
    let stranger =
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.set_move_timeout(300)));
    assert!(stranger.is_err());
    assert_eq!(c.config().settings.move_timeout_blocks, 600);
}

#[test]
fn duels_run_on_their_own_shorter_clock() {
    let mut d = Duel::joined();
    assert_eq!(d.c.duel_timeout(), TIMEOUT);
    d.chain.act(&player());
    let msg = panics(|| d.c.set_duel_timeout(40));
    assert!(msg.contains("only the owner"), "{msg}");
    d.chain.act(&acc("brinewar.testnet"));
    d.c.set_duel_timeout(25);
    assert_eq!(d.c.duel_timeout(), 25);
    d.commit();
    let g = d.c.get_game(d.id).unwrap();
    assert_eq!(g.deadline_block, d.chain.height + 25);
    d.chain.skip(26);
    d.chain.act(&friend());
    d.c.claim_timeout(d.id);
    assert_eq!(d.c.get_game(d.id).unwrap().winner, Some(friend()));
}
