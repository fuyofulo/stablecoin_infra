# 01 Current Product

Decimal is a non-custodial Solana USDC treasury operations product.

The active wedge is:

```text
Organization intent
  -> Squads treasury proposal
  -> member approval/rejection
  -> on-chain execution
  -> RPC settlement verification
  -> JSON proof packet
```

## Built

- Users sign in with email/password or Google OAuth.
- Users create or join organizations through invite links.
- Users create personal signing wallets through Privy embedded wallets.
- Organizations create Squads v4 treasury vaults.
- Organizations manage Squads members and thresholds through config proposals.
- Operators create single payments or import payment runs from CSV.
- Payment orders/runs become Squads vault proposals.
- Proposal submission and execution signatures are confirmed by Solana RPC.
- Executed USDC payments are verified by parsed transaction token-account deltas.
- Payment proof packets are deterministic JSON.

## Intentionally Not Active

- The product no longer indexes the global USDC stream.
- The product no longer runs a Yellowstone worker.
- The product no longer uses ClickHouse.
- Inbound collections do not auto-settle unless a future collection verifier is built.
- Decimal does not custody private keys.
- Decimal does not provide fiat rails.

