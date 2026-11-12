use ed25519_dalek::{Signer, SigningKey};
use near_workspaces::types::{Gas, KeyType, NearToken, SecretKey};
use near_workspaces::{Account, Contract};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

const WASM: &str = "../game/target/near/brinewar_game.wasm";
const A_SHIPS: [usize; 20] = [
    0, 1, 2, 3, 20, 21, 22, 26, 27, 28, 40, 41, 44, 45, 48, 49, 60, 62, 64, 66,
];
const B_SHIPS: [usize; 20] = [
    0, 10, 20, 30, 2, 12, 22, 4, 14, 24, 6, 16, 8, 18, 52, 62, 90, 92, 94, 99,
];

type Hash = [u8; 32];

fn sha(parts: &[&[u8]]) -> Hash {
    let mut h = Sha256::new();
    for p in parts {
        h.update(p);
    }
    h.finalize().into()
}

struct Board {
    cells: [u8; 100],
    salts: Vec<Hash>,
    levels: Vec<Vec<Hash>>,
}

impl Board {
    fn new(ships: &[usize], seed: u8) -> Self {
        let mut cells = [0u8; 100];
        for &i in ships {
            cells[i] = 1;
        }
        let salts: Vec<Hash> = (0..100u8).map(|i| sha(&[&[seed, i]])).collect();
        let leaves: Vec<Hash> = (0..128usize)
            .map(|i| {
                if i < 100 {
                    sha(&[&[i as u8, cells[i]], &salts[i]])
                } else {
                    [0u8; 32]
                }
            })
            .collect();
        let mut levels = vec![leaves];
        while levels.last().unwrap().len() > 1 {
            let next = levels
                .last()
                .unwrap()
                .chunks_exact(2)
                .map(|p| sha(&[&p[0], &p[1]]))
                .collect();
            levels.push(next);
        }
        Board {
            cells,
            salts,
            levels,
        }
    }

    fn root(&self) -> String {
        hex::encode(self.levels.last().unwrap()[0])
    }

    fn proof(&self, index: usize) -> Vec<String> {
        let mut pos = index;
        (0..7)
            .map(|d| {
                let s = hex::encode(self.levels[d][pos ^ 1]);
                pos >>= 1;
                s
            })
            .collect()
    }

    fn answer_args(&self, game_id: u64, index: usize) -> serde_json::Value {
        json!({
            "game_id": game_id, "index": index, "cell": self.cells[index],
            "salt": hex::encode(self.salts[index]), "proof": self.proof(index),
        })
    }

    fn reveal_args(&self, game_id: u64) -> serde_json::Value {
        let cells: String = self.cells.iter().map(|c| c.to_string()).collect();
        let salts: Vec<String> = self.salts.iter().map(hex::encode).collect();
        json!({"game_id": game_id, "cells": cells, "salts": salts})
    }
}

#[derive(Default)]
struct Meter {
    gas: BTreeMap<&'static str, Vec<u64>>,
}

impl Meter {
    async fn call(
        &mut self,
        who: &Account,
        c: &Contract,
        method: &'static str,
        args: serde_json::Value,
    ) -> anyhow::Result<()> {
        let out = who
            .call(c.id(), method)
            .args_json(args)
            .gas(Gas::from_tgas(if method == "create_guest" { 100 } else { GAME_GAS_TGAS }))
            .transact()
            .await?;
        anyhow::ensure!(out.is_success(), "{method} failed: {:?}", out.failures());
        let burnt = out.outcomes().iter().map(|o| o.gas_burnt.as_gas()).sum();
        self.gas.entry(method).or_default().push(burnt);
        Ok(())
    }

    fn report(&self) -> String {
        let mut s = String::from("| method | calls | min TGas | max TGas |\n|---|---|---|---|\n");
        for (m, v) in &self.gas {
            let tg = |g: u64| g as f64 / 1e12;
            s += &format!(
                "| {m} | {} | {:.2} | {:.2} |\n",
                v.len(),
                tg(*v.iter().min().unwrap()),
                tg(*v.iter().max().unwrap())
            );
        }
        s
    }
}


const MODEL: &str = "Qwen/Qwen3.8-27B";
const GAME_GAS_TGAS: u64 = 30;

fn model_key() -> SigningKey {
    SigningKey::from_bytes(&[42u8; 32])
}

fn response_with(content: &str) -> String {
    let content = serde_json::to_string(content).unwrap();
    format!(
        r#"{{"id":"chatcmpl-1","object":"chat.completion","model":"{MODEL}","choices":[{{"index":0,"message":{{"role":"assistant","content":{content}}},"finish_reason":"stop"}}]}}"#
    )
}

fn sign(request: &str, response: &str) -> String {
    let text = format!(
        "{MODEL}:{}:{}",
        hex::encode(sha(&[request.as_bytes()])),
        hex::encode(sha(&[response.as_bytes()]))
    );
    hex::encode(model_key().sign(text.as_bytes()).to_bytes())
}

fn cell(i: usize) -> String {
    format!("{}{}", (b'A' + (i % 10) as u8) as char, i / 10 + 1)
}

async fn ai_shot(
    m: &mut Meter,
    nauarch: &Account,
    c: &Contract,
    id: u64,
    target: usize,
) -> anyhow::Result<()> {
    let request: String = c
        .view("nauarch_request")
        .args_json(json!({"game_id": id, "kind": "Shot"}))
        .await?
        .json()?;
    let response = response_with(&format!(
        r#"{{"shot":"{}","line":"The left edge again, Captain? Predictable."}}"#,
        cell(target)
    ));
    let sig = sign(&request, &response);
    m.call(
        nauarch,
        c,
        "submit_ai_move",
        json!({"game_id": id, "kind": "Shot", "response_body": response, "signature_hex": sig}),
    )
    .await
}

#[tokio::test]
#[ignore = "needs near-sandbox and a built wasm"]
async fn full_game_gas() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = std::fs::read(WASM)?;
    let contract = worker.dev_deploy(&wasm).await?;
    let nauarch = worker.dev_create_account().await?;
    let registrar = worker.dev_create_account().await?;
    let settings = json!({
        "move_timeout_blocks": 200, "max_open_games": 50, "blocks_per_day": 147000,
        "min_heat_shots": 10, "start_gold": "100", "base_entry": "10",
        "entry_threshold": "500", "bounty_bps": 500, "bounty_cap": "25",
        "guest_fund": NearToken::from_millinear(100).as_yoctonear().to_string(),
        "guest_allowance": NearToken::from_millinear(250).as_yoctonear().to_string(),
        "guests_per_day": 500, "games_per_day": 20, "bounties_per_day": 3,
        "min_heat_boards": 1,
    });
    let init_args = json!({"owner": contract.id(), "nauarch": nauarch.id(), "registrar": registrar.id(), "settings": settings, "initial_treasury": "1000"});
    let hijack = nauarch
        .call(contract.id(), "new")
        .args_json(init_args.clone())
        .transact()
        .await?;
    anyhow::ensure!(hijack.is_failure(), "init must be private");
    let init = contract.call("new").args_json(init_args).transact().await?;
    anyhow::ensure!(init.is_success(), "init failed: {:?}", init.failures());
    let set = contract
        .call("set_model")
        .args_json(json!({"model": MODEL, "public_key_hex": hex::encode(model_key().verifying_key().as_bytes())}))
        .transact()
        .await?;
    anyhow::ensure!(set.is_success(), "set_model failed: {:?}", set.failures());

    let mut m = Meter::default();
    let storage_start = contract.view_account().await?.storage_usage;
    let guest_sk = SecretKey::from_random(KeyType::ED25519);
    let guest_pk = guest_sk.public_key().to_string();
    m.call(&registrar, &contract, "create_guest", json!({"public_key": guest_pk, "nickname": "Ahab"}))
        .await?;
    let guest_id: String = contract
        .view("guest_account_for")
        .args_json(json!({"public_key": guest_pk}))
        .await?
        .json()?;
    let player = Account::from_secret_key(guest_id.parse()?, guest_sk, &worker);
    let keys = player.view_access_keys().await?;
    anyhow::ensure!(keys.len() == 1, "guest must have exactly the browser key");
    let transfer_attempt = player.transfer_near(contract.id(), NearToken::from_millinear(1)).await;
    anyhow::ensure!(
        transfer_attempt.map(|r| r.is_failure()).unwrap_or(true),
        "guest key must not move NEAR"
    );

    let storage_guest = contract.view_account().await?.storage_usage;
    let a = Board::new(&A_SHIPS, 1);
    let b = Board::new(&B_SHIPS, 2);
    m.call(&player, &contract, "new_game_vs_nauarch", json!({})).await?;
    let id = 0u64;
    m.call(&player, &contract, "commit_board", json!({"game_id": id, "root": a.root()}))
        .await?;
    m.call(&nauarch, &contract, "commit_board", json!({"game_id": id, "root": b.root()}))
        .await?;

    let a_water: Vec<usize> = (0..100).filter(|&i| a.cells[i] == 0).collect();
    let b_water: Vec<usize> = (0..100).filter(|&i| b.cells[i] == 0).collect();
    for (k, &t) in B_SHIPS.iter().enumerate() {
        m.call(&player, &contract, "fire", json!({"game_id": id, "index": b_water[k]}))
            .await?;
        m.call(&nauarch, &contract, "answer", b.answer_args(id, b_water[k]))
            .await?;
        let mut fallback = k % 5 == 4;
        loop {
            if fallback {
                m.call(&nauarch, &contract, "nauarch_fallback", json!({"game_id": id}))
                    .await?;
            } else {
                ai_shot(&mut m, &nauarch, &contract, id, a_water[k]).await?;
            }
            let history: serde_json::Value = contract
                .view("get_history")
                .args_json(json!({"game_id": id}))
                .await?
                .json()?;
            let fired = history.as_array().unwrap().last().unwrap()["index"].as_u64().unwrap() as usize;
            m.call(&player, &contract, "answer", a.answer_args(id, fired))
                .await?;
            if a.cells[fired] == 0 {
                break;
            }
            fallback = true;
        }
        m.call(&player, &contract, "fire", json!({"game_id": id, "index": t}))
            .await?;
        m.call(&nauarch, &contract, "answer", b.answer_args(id, t))
            .await?;
    }
    m.call(&player, &contract, "reveal", a.reveal_args(id))
        .await?;
    m.call(&nauarch, &contract, "reveal", b.reveal_args(id))
        .await?;
    let request: String = contract
        .view("nauarch_request")
        .args_json(json!({"game_id": id, "kind": "Farewell"}))
        .await?
        .json()?;
    let response = response_with(r#"{"line":"Fair winds, Captain. Next time the sea is mine."}"#);
    let sig = sign(&request, &response);
    m.call(
        &nauarch,
        &contract,
        "submit_ai_move",
        json!({"game_id": id, "kind": "Farewell", "response_body": response, "signature_hex": sig}),
    )
    .await?;

    let storage_game = contract.view_account().await?.storage_usage;
    let game: serde_json::Value = contract
        .view("get_game")
        .args_json(json!({"game_id": id}))
        .await?
        .json()?;
    assert_eq!(game["status"], "Finished");
    assert_eq!(game["winner"], player.id().to_string());
    let p: serde_json::Value = contract
        .view("get_player")
        .args_json(json!({"account_id": player.id()}))
        .await?
        .json()?;
    assert_eq!(p["gold"], "125");
    let ship: serde_json::Value = contract
        .view("get_ship")
        .args_json(json!({"token_id": "ship:0"}))
        .await?
        .json()?;
    assert_eq!(ship["sunk"], 10);
    let map: serde_json::Value = contract.view("admiralty_map").await?.json()?;
    assert_eq!(map["boards_counted"], 1);

    let rich = worker.dev_create_account().await?;
    let reg = registrar
        .call(contract.id(), "register_player")
        .args_json(json!({"account_id": rich.id(), "nickname": null}))
        .transact()
        .await?;
    anyhow::ensure!(reg.is_success(), "register failed: {:?}", reg.failures());
    let out = rich
        .call(contract.id(), "mt_transfer")
        .args_json(json!({"receiver_id": nauarch.id(), "token_id": "gold", "amount": "5", "approval": null, "memo": null}))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(30))
        .transact()
        .await?;
    anyhow::ensure!(out.is_success(), "mt_transfer failed: {:?}", out.failures());
    m.gas.entry("mt_transfer").or_default().push(out.outcomes().iter().map(|o| o.gas_burnt.as_gas()).sum());
    let sink = worker.dev_create_account().await?;
    let reg = registrar
        .call(contract.id(), "register_player")
        .args_json(json!({"account_id": sink.id(), "nickname": null}))
        .transact()
        .await?;
    anyhow::ensure!(reg.is_success(), "register failed: {:?}", reg.failures());
    let out = rich
        .call(contract.id(), "mt_transfer_call")
        .args_json(json!({"receiver_id": sink.id(), "token_id": "gold", "amount": "7", "approval": null, "memo": null, "msg": ""}))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;
    m.gas.entry("mt_transfer_call").or_default().push(out.outcomes().iter().map(|o| o.gas_burnt.as_gas()).sum());
    let bal: String = contract
        .view("mt_balance_of")
        .args_json(json!({"account_id": rich.id(), "token_id": "gold"}))
        .await?
        .json()?;
    assert_eq!(bal, "95", "transfer_call to a non-receiver must refund");

    let keys = player.view_access_keys().await?;
    let perm = format!("{:?}", keys[0].access_key.permission);
    let gas_price: serde_json::Value = worker.gas_price().await.map(|p| json!(p.as_yoctonear().to_string()))?;
    let balance = player.view_account().await?.balance;
    let note = format!(
        "\nguest key after one full game: {perm}\nguest balance: {} yocto\nsandbox gas price: {gas_price}\nstorage bytes: guest {} game {}\n",
        balance.as_yoctonear(),
        storage_guest - storage_start,
        storage_game - storage_guest
    );
    println!("{note}");
    let report = m.report() + &note;
    println!("{report}");
    std::fs::write("target/gas-report.md", report)?;
    Ok(())
}
