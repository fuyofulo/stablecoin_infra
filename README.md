# Decimal

Decimal is a Solana USDC treasury operations product.

It helps teams create payment requests, route them into Squads multisig proposals, verify execution through Solana RPC, and export deterministic JSON proof packets.

## What Works

- Email/password and Google OAuth auth.
- Invite-only organizations.
- User-owned personal wallets, including Privy-managed embedded wallets.
- Organization treasury accounts, including Squads v4 vaults.
- Squads treasury creation with selected members and threshold.
- Squads config proposals for member and threshold changes.
- Single payment orders and CSV payment runs.
- Squads payment proposals for single payments and payment runs.
- RPC confirmation for proposal submission and execution.
- RPC settlement verification for app-originated USDC payments.
- JSON proof packets for payment orders and payment runs.
- Audit log and API/OpenAPI surfaces.

## Current Architecture

```text
frontend/  React + Vite operator UI
api/       Express + Prisma API
postgres/  local bootstrap SQL
config/    committed non-secret runtime config
outputs/   handoffs, research notes, scorecards
```

Runtime dependencies:

- PostgreSQL stores durable product state.
- Solana RPC verifies Squads transactions and USDC settlement deltas.
- Privy creates and signs with embedded personal wallets.
- Squads v4 is the on-chain multisig treasury layer.

The old Yellowstone/ClickHouse indexer stack has been removed from the active product. Decimal now verifies app-originated payments by RPC instead of storing the global USDC stream.

## Local Development

```bash
cd api && npm install
cd ../frontend && npm install
make dev devnet
```

Useful commands:

```bash
make dev mainnet
make test-api
make test-frontend
make infra-up
make reset-data
make help
```

## API

Useful public endpoints:

- `GET /health`
- `GET /capabilities`
- `GET /openapi.json`

Main authenticated groups:

- `/organizations`
- `/organizations/:organizationId/invites`
- `/personal-wallets`
- `/organizations/:organizationId/treasury-wallets`
- `/organizations/:organizationId/squads/proposals`
- `/organizations/:organizationId/proposals`
- `/organizations/:organizationId/payment-requests`
- `/organizations/:organizationId/payment-runs`
- `/organizations/:organizationId/payment-orders`
- `/organizations/:organizationId/approval-policy`
- `/organizations/:organizationId/approval-inbox`
- `/organizations/:organizationId/audit-log`

## Proof Packets

Proof packets are canonical JSON documents with a SHA-256 digest over stable JSON. They capture:

- intent
- parties
- approval state
- Squads execution evidence
- RPC settlement verification
- source artifacts
- audit trail

They are meant to be verifiable operational records, not a private ledger and not custody.

## Configuration

Committed non-secret config:

- `config/api.config.json`
- `config/frontend.public.json`

Local secrets:

- `api/.env`
- frontend deploy env vars

Secrets never belong in committed config files.

## Status

Decimal is currently a non-custodial Squads treasury workflow and proof layer.

Not built:

- fiat rails
- custody
- card issuing
- accounting sync
- private transactions
- automatic inbound collection watching

See [system_explained/README.md](system_explained/README.md) for the current engineering map.
