# Decimal API

The API is the backend source of truth for Decimal.

It is an Express + Prisma service backed by PostgreSQL. It does not store private keys and it no longer depends on Yellowstone or ClickHouse.

## Responsibilities

- User sessions, Google OAuth, and email/password auth.
- Organization creation and invite-only membership.
- Personal signing wallets and Privy embedded wallet operations.
- Organization treasury wallets and Squads v4 treasury records.
- Squads proposal intents, confirmations, approvals, rejections, and executions.
- Payment requests, payment orders, and payment runs.
- Approval policy and approval inbox.
- RPC verification of app-originated payment settlement.
- JSON proof packet generation.
- Audit log and API contract generation.

## Local Commands

```bash
npm install
npm run prisma:generate
npm run dev
npm run build
npm test
```

From the repo root, prefer:

```bash
make dev devnet
make test-api
```

## Environment

See [.env.example](.env.example).

Secrets live in `api/.env`. Non-secret runtime config lives in `config/api.config.json`.

## API Contract

- `GET /capabilities` returns a compact workflow map.
- `GET /openapi.json` returns the generated OpenAPI 3.1 contract.
- `api/src/api-contract.ts` is the source of truth for the generated contract.

## Settlement Verification

App-originated Squads payments are verified through Solana RPC:

1. The frontend signs/submits a Squads proposal transaction.
2. The API confirms the submitted signature with RPC.
3. The frontend signs/submits the Squads execution transaction.
4. The API confirms the execution signature with RPC.
5. The API reads the parsed transaction and checks expected USDC token-account deltas.
6. Payment orders/runs move to `settled` only when those deltas match.

Inbound collections are currently intent records only. Automatic inbound matching is intentionally detached from the lean MVP.
