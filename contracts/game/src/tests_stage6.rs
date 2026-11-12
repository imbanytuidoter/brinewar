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
    c.mint_skin("coral".into(), player(), U128(1));
    c.mint_skin("gilded".into(), player(), U128(1));
    c.mint_skin("coral".into(), nauarch(), U128(3));
    let listed = c.skins();
    let tail: Vec<&str> = listed
        .iter()
        .map(String::as_str)
        .filter(|s| *s != "brine")
        .collect();
    assert_eq!(tail, vec!["coral", "gilded"]);
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
