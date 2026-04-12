use std::collections::HashMap;
use yellowstone_grpc_proto::geyser::{
    CommitmentLevel, SubscribeRequest, SubscribeRequestFilterBlocksMeta,
    SubscribeRequestFilterTransactions,
};

const USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SPL_TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

pub fn create_subscription_request_from_slot(from_slot: Option<u64>) -> SubscribeRequest {
    let mut transactions = HashMap::new();
    let mut blocks_meta = HashMap::new();

    transactions.insert(
        "usdc_token_transactions".to_string(),
        SubscribeRequestFilterTransactions {
            vote: Some(false),
            failed: Some(false),
            signature: None,
            account_include: vec![],
            account_exclude: vec![],
            account_required: vec![USDC_MINT.to_string(), SPL_TOKEN_PROGRAM_ID.to_string()],
        },
    );
    blocks_meta.insert(
        "chain_progress".to_string(),
        SubscribeRequestFilterBlocksMeta {},
    );

    SubscribeRequest {
        accounts: HashMap::new(),
        slots: HashMap::new(),
        transactions,
        transactions_status: HashMap::new(),
        blocks: HashMap::new(),
        blocks_meta,
        entry: HashMap::new(),
        commitment: Some(CommitmentLevel::Confirmed as i32),
        accounts_data_slice: vec![],
        ping: None,
        from_slot,
    }
}

#[cfg(test)]
mod tests {
    use super::create_subscription_request_from_slot;

    #[test]
    fn subscription_request_uses_transactions_and_blocks_meta_only() {
        let request = create_subscription_request_from_slot(None);

        assert!(request.accounts.is_empty());
        assert_eq!(request.transactions.len(), 1);
        assert_eq!(request.blocks_meta.len(), 1);
        assert!(request.transactions.contains_key("usdc_token_transactions"));
        assert!(request.blocks_meta.contains_key("chain_progress"));
    }

    #[test]
    fn subscription_request_supports_replay_from_slot() {
        let request = create_subscription_request_from_slot(Some(123));

        assert_eq!(request.from_slot, Some(123));
    }
}
