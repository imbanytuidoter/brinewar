use near_workspaces::types::Gas;
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
            .gas(Gas::from_tgas(300))
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

#[tokio::test]
#[ignore = "needs near-sandbox and a built wasm"]
async fn full_game_gas() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = std::fs::read(WASM)?;
    let contract = worker.dev_deploy(&wasm).await?;
    let nauarch = worker.dev_create_account().await?;
    let player = worker.dev_create_account().await?;
    let hijack = player
        .call(contract.id(), "new")
        .args_json(json!({"owner": player.id(), "nauarch": player.id(), "move_timeout_blocks": 1, "max_open_games": 1}))
        .transact()
        .await?;
    anyhow::ensure!(hijack.is_failure(), "init must be private");
    let init = contract
        .call("new")
        .args_json(json!({"owner": contract.id(), "nauarch": nauarch.id(), "move_timeout_blocks": 200, "max_open_games": 50}))
        .transact()
        .await?;
    anyhow::ensure!(init.is_success(), "init failed: {:?}", init.failures());

    let a = Board::new(&A_SHIPS, 1);
    let b = Board::new(&B_SHIPS, 2);
    let mut m = Meter::default();
    m.call(&player, &contract, "new_game_vs_nauarch", json!({}))
        .await?;
    let id = 0u64;
    m.call(&player, &contract, "commit_board", json!({"game_id": id, "root": a.root()}))
        .await?;
    m.call(&nauarch, &contract, "commit_board", json!({"game_id": id, "root": b.root()}))
        .await?;

    let a_water: Vec<usize> = (0..100).filter(|&i| a.cells[i] == 0).collect();
    for (k, &t) in B_SHIPS.iter().enumerate() {
        m.call(&player, &contract, "fire", json!({"game_id": id, "index": t}))
            .await?;
        m.call(&nauarch, &contract, "answer", b.answer_args(id, t))
            .await?;
        if k + 1 == B_SHIPS.len() {
            break;
        }
        let s = a_water[k];
        m.call(&nauarch, &contract, "fire", json!({"game_id": id, "index": s}))
            .await?;
        m.call(&player, &contract, "answer", a.answer_args(id, s))
            .await?;
    }
    m.call(&player, &contract, "reveal", a.reveal_args(id))
        .await?;
    m.call(&nauarch, &contract, "reveal", b.reveal_args(id))
        .await?;

    let game: serde_json::Value = contract
        .view("get_game")
        .args_json(json!({"game_id": id}))
        .await?
        .json()?;
    assert_eq!(game["status"], "Finished");
    assert_eq!(game["winner"], player.id().to_string());

    let report = m.report();
    println!("{report}");
    std::fs::write("target/gas-report.md", report)?;
    Ok(())
}
