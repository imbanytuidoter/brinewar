use crate::{Brinewar, BrinewarExt};
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{
    assert_one_yocto, env, ext_contract, near, require, AccountId, Gas, PromiseError,
    PromiseOrValue,
};

pub const GOLD: &str = "gold";
pub const SHIP_PREFIX: &str = "ship:";
pub const SKIN_PREFIX: &str = "skin:";
pub const STARTER_SKIN: &str = "skin:brine";
const MAX_SKINS_LISTED: usize = 100;
const GAS_FOR_RESOLVE: Gas = Gas::from_tgas(15);
const GAS_FOR_ON_TRANSFER: Gas = Gas::from_tgas(30);
const MAX_BATCH: usize = 16;

pub type Approval = Option<(AccountId, u64)>;
pub type ResolveApprovals = Option<Vec<Option<Vec<(AccountId, u64, U128)>>>>;

#[near(serializers = [json])]
pub struct Token {
    pub token_id: String,
    pub owner_id: Option<AccountId>,
}

#[ext_contract(ext_mt_receiver)]
pub trait MultiTokenReceiver {
    fn mt_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_ids: Vec<AccountId>,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>>;
}

pub fn ship_token(id: u64) -> String {
    format!("{SHIP_PREFIX}{id}")
}

pub fn ship_id(token_id: &str) -> Option<u64> {
    token_id.strip_prefix(SHIP_PREFIX)?.parse().ok()
}

pub fn valid_skin_name(name: &str) -> bool {
    (1..=32).contains(&name.len())
        && name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn mt_event(event: &str, data: serde_json::Value) {
    let payload = json!({"standard": "nep245", "version": "1.0.0", "event": event, "data": [data]});
    env::log_str(&format!("EVENT_JSON:{payload}"));
}

fn amounts_json(amounts: &[u128]) -> Vec<String> {
    amounts.iter().map(|a| a.to_string()).collect()
}

#[near]
impl Brinewar {
    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Approval,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        require!(approval.is_none(), "approvals are not supported");
        let sender = env::predecessor_account_id();
        self.batch_move(
            &sender,
            &receiver_id,
            &[token_id],
            &[amount.0],
            memo.as_deref(),
        );
    }

    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Approval>>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        require!(
            approvals.is_none_or(|a| a.iter().all(Option::is_none)),
            "approvals are not supported"
        );
        let sender = env::predecessor_account_id();
        let amounts: Vec<u128> = amounts.iter().map(|a| a.0).collect();
        self.batch_move(&sender, &receiver_id, &token_ids, &amounts, memo.as_deref());
    }

    #[payable]
    pub fn mt_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Approval,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>> {
        assert_one_yocto();
        require!(approval.is_none(), "approvals are not supported");
        self.transfer_call(receiver_id, vec![token_id], vec![amount], memo, msg)
    }

    #[payable]
    pub fn mt_batch_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Approval>>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>> {
        assert_one_yocto();
        require!(
            approvals.is_none_or(|a| a.iter().all(Option::is_none)),
            "approvals are not supported"
        );
        self.transfer_call(receiver_id, token_ids, amounts, memo, msg)
    }

    #[private]
    pub fn mt_resolve_transfer(
        &mut self,
        previous_owner_ids: Vec<AccountId>,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        #[allow(unused_variables)] approvals: ResolveApprovals,
        #[callback_result] unused: Result<Vec<U128>, PromiseError>,
    ) -> Vec<U128> {
        let unused: Vec<u128> = match unused {
            Ok(v) if v.len() == amounts.len() => {
                v.iter().zip(&amounts).map(|(u, a)| u.0.min(a.0)).collect()
            }
            _ => amounts.iter().map(|a| a.0).collect(),
        };
        let mut used = Vec::with_capacity(amounts.len());
        for (i, token_id) in token_ids.iter().enumerate() {
            let refund = unused[i].min(self.balance(token_id, &receiver_id));
            if refund > 0 {
                self.move_tokens(
                    &receiver_id,
                    &previous_owner_ids[i],
                    token_id,
                    refund,
                    Some("refund"),
                );
            }
            used.push(U128(amounts[i].0 - refund));
        }
        used
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(self.balance(&token_id, &account_id))
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids
            .iter()
            .map(|t| U128(self.balance(t, &account_id)))
            .collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        self.supply.get(&token_id).map(|s| U128(*s))
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids
            .iter()
            .map(|t| self.supply.get(t).map(|s| U128(*s)))
            .collect()
    }

    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<Token>> {
        token_ids
            .into_iter()
            .map(|token_id| {
                self.supply.get(&token_id)?;
                let owner_id = ship_id(&token_id)
                    .and_then(|id| self.ships.get(&id))
                    .map(|s| s.owner.clone());
                Some(Token { token_id, owner_id })
            })
            .collect()
    }

    pub fn skins(&self) -> Vec<String> {
        self.skins.iter().take(MAX_SKINS_LISTED).cloned().collect()
    }

    pub fn mint_skin(&mut self, name: String, receiver_id: AccountId, amount: U128) {
        require!(
            env::predecessor_account_id() == self.owner,
            "only the owner mints skins"
        );
        require!(
            valid_skin_name(&name),
            "skin name must be [a-z0-9-], 1-32 chars"
        );
        require!(amount.0 > 0, "amount must be positive");
        self.mint(
            &format!("{SKIN_PREFIX}{name}"),
            &receiver_id,
            amount.0,
            None,
        );
    }
}

impl Brinewar {
    pub(crate) fn balance(&self, token_id: &str, account: &AccountId) -> u128 {
        self.balances
            .get(&(token_id.to_string(), account.clone()))
            .copied()
            .unwrap_or(0)
    }

    fn set_balance(&mut self, token_id: &str, account: &AccountId, amount: u128) {
        let key = (token_id.to_string(), account.clone());
        if amount == 0 {
            self.balances.remove(&key);
        } else {
            self.balances.insert(key, amount);
        }
    }

    pub(crate) fn mint(
        &mut self,
        token_id: &str,
        to: &AccountId,
        amount: u128,
        memo: Option<&str>,
    ) {
        let known = self.supply.get(token_id).copied();
        if let (None, Some(name)) = (known, token_id.strip_prefix(SKIN_PREFIX)) {
            self.skins.push(name.to_string());
        }
        let supply = known.unwrap_or(0);
        self.supply.insert(token_id.to_string(), supply + amount);
        let bal = self.balance(token_id, to);
        self.set_balance(token_id, to, bal + amount);
        mt_event(
            "mt_mint",
            json!({"owner_id": to, "token_ids": [token_id], "amounts": [amount.to_string()], "memo": memo}),
        );
    }

    pub(crate) fn burn(
        &mut self,
        token_id: &str,
        from: &AccountId,
        amount: u128,
        memo: Option<&str>,
    ) {
        let bal = self.balance(token_id, from);
        let amount = amount.min(bal);
        self.set_balance(token_id, from, bal - amount);
        let supply = self.supply.get(token_id).copied().unwrap_or(0);
        if supply <= amount && token_id != GOLD && !token_id.starts_with(SKIN_PREFIX) {
            self.supply.remove(token_id);
        } else {
            self.supply
                .insert(token_id.to_string(), supply.saturating_sub(amount));
        }
        mt_event(
            "mt_burn",
            json!({"owner_id": from, "token_ids": [token_id], "amounts": [amount.to_string()], "memo": memo}),
        );
    }

    fn debit_credit(&mut self, from: &AccountId, to: &AccountId, token_id: &str, amount: u128) {
        require!(amount > 0, "amount must be positive");
        require!(self.supply.contains_key(token_id), "unknown token");
        let from_bal = self.balance(token_id, from);
        require!(from_bal >= amount, "not enough tokens");
        self.set_balance(token_id, from, from_bal - amount);
        let to_bal = self.balance(token_id, to);
        self.set_balance(token_id, to, to_bal + amount);
        if let Some(id) = ship_id(token_id) {
            if let Some(ship) = self.ships.get_mut(&id) {
                ship.owner = to.clone();
            }
        }
    }

    pub(crate) fn move_tokens(
        &mut self,
        from: &AccountId,
        to: &AccountId,
        token_id: &str,
        amount: u128,
        memo: Option<&str>,
    ) {
        self.debit_credit(from, to, token_id, amount);
        mt_event(
            "mt_transfer",
            json!({
                "old_owner_id": from, "new_owner_id": to,
                "token_ids": [token_id], "amounts": [amount.to_string()], "memo": memo,
            }),
        );
    }

    fn batch_move(
        &mut self,
        from: &AccountId,
        to: &AccountId,
        token_ids: &[String],
        amounts: &[u128],
        memo: Option<&str>,
    ) {
        require!(from != to, "sender and receiver must differ");
        require!(self.is_known(to), "receiver must be a registered player");
        require!(
            !token_ids.is_empty() && token_ids.len() == amounts.len(),
            "token_ids and amounts must have the same non-zero length"
        );
        require!(token_ids.len() <= MAX_BATCH, "batch too large");
        for (t, a) in token_ids.iter().zip(amounts) {
            self.debit_credit(from, to, t, *a);
        }
        mt_event(
            "mt_transfer",
            json!({
                "old_owner_id": from, "new_owner_id": to,
                "token_ids": token_ids, "amounts": amounts_json(amounts), "memo": memo,
            }),
        );
    }

    fn transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<Vec<U128>> {
        let sender = env::predecessor_account_id();
        let raw: Vec<u128> = amounts.iter().map(|a| a.0).collect();
        self.batch_move(&sender, &receiver_id, &token_ids, &raw, memo.as_deref());
        let previous = vec![sender.clone(); token_ids.len()];
        ext_mt_receiver::ext(receiver_id.clone())
            .with_static_gas(GAS_FOR_ON_TRANSFER)
            .mt_on_transfer(
                sender,
                previous.clone(),
                token_ids.clone(),
                amounts.clone(),
                msg,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_RESOLVE)
                    .mt_resolve_transfer(previous, receiver_id, token_ids, amounts, None),
            )
            .into()
    }
}
