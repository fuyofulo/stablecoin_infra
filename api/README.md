# API

## Purpose

This service is the TypeScript control-plane API built with `Express` and `Prisma`.

It owns the control plane in `Postgres`:

- users, organizations, and workspaces
- treasury wallets the workspace owns
- counterparties and payment destinations
- payment requests, payment runs, and payment orders
- approval policy, execution evidence, exceptions, and proof/audit state

It also exposes read-side endpoints backed by `ClickHouse` for:

- observed Solana USDC movement
- reconciliation rows
- settlement matches and exceptions

## Start

1. Install dependencies

```bash
cd api
npm install
```

2. Generate the Prisma client

```bash
npm run prisma:generate
```

3. Run the API

```bash
npm run dev
```

## Environment

See [.env.example](/Users/fuyofulo/code/stablecoin_intelligence/api/.env.example).

## Current Routes

Use `GET /openapi.json` for the machine-readable contract and `GET /capabilities` for the compact workflow map.

Main route groups:

- auth: `/auth/register`, `/auth/login`, `/auth/session`, `/auth/logout`
- org/workspace setup: `/organizations`, `/organizations/:organizationId/workspaces`
- address book: `/workspaces/:workspaceId/treasury-wallets`, `/counterparties`, `/destinations`
- inputs: `/workspaces/:workspaceId/payment-requests`
- batches: `/workspaces/:workspaceId/payment-runs`
- payments: `/workspaces/:workspaceId/payment-orders`
- approvals: `/workspaces/:workspaceId/approval-policy`, `/approval-inbox`
- reconciliation: `/workspaces/:workspaceId/reconciliation`, `/reconciliation-queue`, `/exceptions`
- proofs/audit: `/workspaces/:workspaceId/payment-orders/:paymentOrderId/proof`, `/payment-runs/:paymentRunId/proof`, `/audit-log`
- worker internals: `/internal/*`
