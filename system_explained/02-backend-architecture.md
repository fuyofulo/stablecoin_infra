# 02 Backend Architecture

## Runtime

```text
React frontend
  -> Express API
  -> PostgreSQL
  -> Solana RPC
  -> Squads v4 program
  -> Privy API
```

PostgreSQL is the durable product database. Solana RPC is used for live chain verification. Privy is used only for managed personal wallet operations.

## Main API Modules

- `auth.ts` and `routes/auth.ts` handle sessions and login.
- `organization-access.ts` gates organization access and admin actions.
- `routes/organization-invites.ts` handles invite-only membership.
- `routes/user-wallets.ts` handles personal wallet registration, creation, deletion, and signing.
- `treasury-wallets.ts` and `routes/treasury-wallets.ts` handle organization treasury records.
- `squads-treasury.ts` prepares and confirms Squads transactions.
- `payment-orders.ts` handles single-payment commands and read models.
- `payment-runs.ts` handles CSV batch imports and run state.
- `settlement-read-model.ts` replaces the old indexer-backed reconciliation reads with Postgres/RPC state.
- `payment-order-proof.ts` and `payment-run-proof.ts` emit canonical JSON proof packets.

## Request Flow

Most authenticated routes follow this shape:

```text
route schema validation
  -> requireAuth
  -> assertOrganizationAccess or assertOrganizationAdmin
  -> command/read-model module
  -> Prisma transaction when durable state changes
  -> JSON response
```

The frontend should not depend on implementation-specific tables. It should call the route-level API and treat `api/src/api-contract.ts` plus `/openapi.json` as the contract surface.

## Squads Flow

Squads routes produce signable Solana transactions. Decimal does not sign treasury transactions itself.

```text
prepare intent
  -> frontend/user wallet signs and submits
  -> confirm submission signature
  -> members approve/reject via signable vote txs
  -> execute approved proposal
  -> confirm execution signature
  -> verify USDC deltas through RPC
```

`decimal_proposals` is the local mirror. The on-chain Squads proposal remains the source of truth for member votes, status, threshold, and execution authority.

## Settlement Read Model

`settlement-read-model.ts` intentionally returns the old `reconciliationDetail` response shape because payment and proof code already consume that shape. Internally it no longer reads an observed-transfer warehouse.

It builds settlement truth from:

- `transfer_requests`
- `execution_records`
- `transfer_request_events`
- `approval_decisions`
- `metadataJson.rpcSettlementVerification`

This keeps API compatibility while removing the expensive global USDC indexing system.

## Removed Architecture

The previous architecture had:

- Rust streaming worker.
- Matching index SSE routes.
- ClickHouse observed transfer tables.
- Worker-facing internal API routes.
- Reconciliation queue and exception routes.

Those were removed because the current product verifies app-originated Squads payments by signature and token-account deltas. Storing the global USDC stream is unnecessary for this direction.
