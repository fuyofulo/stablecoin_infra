# 02 Repository And Runtime Map

This repository contains one product split across several runtime processes.

## Top-Level Layout

```text
.
├── api/                 TypeScript Express control-plane API
├── frontend/            React/Vite SPA
├── yellowstone/         Rust Solana Yellowstone ingestion + matching worker
├── postgres/            Postgres init scripts
├── clickhouse/          ClickHouse init scripts
├── config/              Non-secret public/runtime config
├── scripts/             Operational scripts
├── system_explained/    Engineer onboarding docs
├── outputs/             Research, handoffs, generated artifacts
├── problems/            Incident writeups
├── backups/             Local database backups, gitignored
├── Makefile             Developer workflows
└── docker-compose.yml   Local Postgres and ClickHouse
```

## Runtime Processes

Local development normally runs:

```text
Frontend
  Vite app on http://localhost:5174.

API
  Express app on http://127.0.0.1:3100.

Postgres
  Control-plane database in Docker.

ClickHouse
  Observed chain/matching database in Docker.

Yellowstone worker
  Rust worker that consumes Solana Yellowstone gRPC and writes ClickHouse.
```

Production/demo deployment has been lightweight:

```text
Frontend
  Static Vercel deployment at decimal.finance.

API + worker + databases
  Often run locally on the laptop and exposed through Cloudflare Tunnel.
```

This is intentionally lean. It is not a hardened production topology.

## Main Commands

```bash
make dev             # full local dev stack
make dev devnet      # local dev targeting devnet mode when configured
make dev mainnet     # local dev targeting mainnet mode when configured
make infra-up        # Postgres + ClickHouse
make test-api        # API tests
make test-worker     # Rust worker tests
make test            # broader test target
```

The exact Makefile targets are the source of truth.

## Data Ownership

Postgres owns control-plane truth:

- users
- sessions
- organizations
- invites
- memberships
- personal wallets
- treasury wallets
- Squads treasury metadata
- wallet authorizations
- destinations
- collection sources
- payment requests/runs/orders
- collection requests/runs
- transfer requests
- approvals
- execution records
- audit events
- exception metadata
- idempotency records

ClickHouse owns observed and derived chain facts:

- observed transactions
- USDC transfers
- reconstructed payments
- matcher events
- settlement matches
- worker-generated exceptions

Do not move high-volume observed chain facts into Postgres without a specific reason.

## Service Flow

```text
Browser
  -> API
  -> Postgres control-plane records
  -> matching-index invalidation
  -> Yellowstone worker refreshes matching index through SSE
  -> Yellowstone stream produces transaction updates
  -> worker reconstructs relevant USDC movement
  -> worker writes ClickHouse
  -> API reads Postgres + ClickHouse
  -> frontend shows reconciliation/proof state
```

## Internal Matching Index

The worker uses:

```text
GET /internal/matching-index
GET /internal/matching-index/events
GET /internal/organizations/:organizationId/matching-context
```

The index is organization-scoped. It contains active treasury wallets, transfer requests, destination/source constraints, and submitted signatures needed by the worker.

## Why No Redis/Kafka Yet

The system currently uses:

- Postgres for durable control state.
- ClickHouse for observed events and matching facts.
- In-process SSE for matching-index invalidation.
- Yellowstone gRPC as the external real-time stream.

Redis/Kafka would be useful later for multi-replica API instances, durable background jobs, worker partitioning, or proof-generation queues. Right now it would add operational weight before the product needs it.

## Deployment Reality

Decimal is still an MVP. The code should be written with production discipline, but the deployment is not yet enterprise-grade.

Main current production gaps:

- API and worker are not on managed always-on infrastructure.
- Database backup/restore needs stronger automation.
- Secrets management is still environment-file based.
- Worker scaling is not solved.
- Squads payment execution is not implemented yet.
