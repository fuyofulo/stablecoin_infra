# 03 Payment Lifecycle

The current payment lifecycle is intentionally shorter than the old expected-transfer lifecycle.

```text
draft
  -> approval required or ready
  -> Squads proposal created
  -> proposal submitted
  -> approved or rejected on Squads
  -> executed on Squads
  -> RPC settlement verified
  -> proof exported
```

## Single Payment

1. Create a `PaymentRequest` or direct `PaymentOrder`.
2. Approval policy may route the linked `TransferRequest` to `pending_approval`.
3. Once approved, create a Squads vault proposal.
4. Confirm proposal submission signature.
5. Squads members approve or reject.
6. Once approved on-chain, execute the proposal.
7. Confirm execution signature.
8. RPC verification checks expected USDC token-account deltas.
9. The payment order becomes `settled` only when the deltas match.

## Payment Run

A payment run is a batch wrapper around multiple payment orders.

One Squads vault proposal can contain multiple USDC transfers. Execution verification aggregates expected destination token-account deltas by token account.

## Local State Names

There are three state layers:

- `payment_orders.state`: product-facing payment state.
- `transfer_requests.status`: approval and settlement intent state.
- `decimal_proposals.localStatus`: local mirror of the Squads proposal lifecycle.

The product should present the Squads proposal lifecycle as the main payment execution story. The transfer-request state exists because older approval/proof code still relies on it.

## Why RPC Verification Is Enough For The Current Product

Decimal creates the transaction that moves money from a known Squads vault to known destination token accounts. Because the execution signature is known, verification does not need a global stream.

The API fetches the parsed transaction by signature and checks:

- the transaction exists and is confirmed/finalized enough for the configured commitment
- expected destination USDC token accounts changed by the expected amounts
- the deltas aggregate correctly for batch payments

This is narrower than a full reconciliation engine, but it is the correct primitive for app-originated payments.

## Failure Modes

- RPC cannot find parsed transaction yet: proposal remains executed with verification pending, and the client can retry confirmation.
- RPC deltas do not match: payment state becomes review-worthy through `rpcSettlementVerification.status = "mismatch"`.
- Different execution signature submitted later: API returns conflict.
