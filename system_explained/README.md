# Decimal System Explained

This folder is the onboarding manual for Decimal. It explains the current product, runtime architecture, codebase, data model, reconciliation pipeline, API surface, frontend, Yellowstone worker, and Squads treasury integration.

The goal is to make a new engineer productive enough to change the system without accidentally breaking auth, org membership, treasury signing, Squads proposal flows, reconciliation, or proof generation.

## Current Product Shape

Decimal is an **organization-scoped stablecoin operations system** for Solana USDC.

It currently supports:

- Google OAuth and email/password user sessions.
- Organization creation and invite-only organization membership.
- User-owned personal wallets, currently focused on Privy embedded Solana wallets.
- Organization treasury wallets, including manual treasury addresses and Squads v4 multisig vaults.
- Squads v4 treasury creation with selected members and threshold.
- Squads v4 config proposals for adding members and changing threshold.
- Squads proposal listing, detail, approval, execution, and post-execution member sync.
- Payment requests, payment runs, payment orders, execution packets, submitted signatures, reconciliation, exceptions, and JSON proof packets.
- Collection requests and collection runs for expected inbound USDC.
- Yellowstone-based USDC observation and matching.

The old `Workspace` layer has been removed. The active product scope is:

```text
User -> Organization -> Treasury wallets / destinations / payments / collections / proofs
```

Any doc, branch, or commit that mentions `/workspaces/:workspaceId` as the active API shape is stale.

## Core Mental Model

Decimal has five layers:

```text
Identity
Users, sessions, organizations, invites, personal wallets.

Treasury control
Organization treasury wallets, Squads vaults, member permissions, proposal approvals.

Business intent
Payment requests, payment runs, payment orders, collection requests, collection runs.

Execution and observation
Prepared Solana transactions, Privy signing, submitted signatures, Yellowstone USDC observation.

Verification and proof
Matching, reconciliation, exceptions, deterministic JSON proof packets.
```

The frontend is one client. The backend is the source of truth and is intended to stay API-first so other clients can eventually drive the same workflows.

## How To Read These Docs

Read in this order if you are new:

1. [01 Product Mental Model](./01-product-mental-model.md)
2. [02 Repository And Runtime Map](./02-repository-and-runtime-map.md)
3. [03 Backend Control Plane](./03-backend-control-plane.md)
4. [04 Postgres Data Model](./04-postgres-data-model.md)
5. [05 Payment Workflows And States](./05-payment-workflows-and-states.md)
6. [06 Reconciliation And Matching](./06-reconciliation-and-matching.md)
7. [07 Yellowstone Worker](./07-yellowstone-worker.md)
8. [08 ClickHouse And Observability](./08-clickhouse-and-observability.md)
9. [09 Frontend Application](./09-frontend-application.md)
10. [10 API First And Agent Surface](./10-api-first-and-agent-surface.md)
11. [11 Operating Testing And Debugging](./11-operating-testing-and-debugging.md)
12. [12 Current Risks And Cleanup Map](./12-current-risks-and-cleanup-map.md)
13. [13 API Route Catalog](./13-api-route-catalog.md)
14. [14 Code Module Index](./14-code-module-index.md)
15. [15 Squads Treasury Architecture](./15-squads-treasury-architecture.md)

## Source Of Truth

The current source of truth is the code. These docs are maintained as an engineer-facing explanation layer.

Important entrypoints:

- `api/prisma/schema.prisma` — Postgres schema.
- `api/src/app.ts` — Express app composition and route mounting.
- `api/src/api-contract.ts` — canonical API contract used for OpenAPI.
- `api/src/auth.ts`, `api/src/routes/auth.ts` — sessions, password auth, Google OAuth.
- `api/src/routes/organization-invites.ts` — invite-only organization membership.
- `api/src/routes/user-wallets.ts`, `api/src/privy-wallets.ts` — personal wallets and Privy signing.
- `api/src/treasury-wallets.ts`, `api/src/routes/treasury-wallets.ts` — organization treasury wallets and Squads endpoints.
- `api/src/squads-treasury.ts` — Squads v4 transaction/proposal logic.
- `api/src/reconciliation.ts` — matching, settlement state, exceptions, proof-facing reconciliation data.
- `yellowstone/src/main.rs` — Yellowstone worker entrypoint.
- `yellowstone/src/yellowstone/mod.rs` — worker loop and matching pipeline.
- `frontend/src/App.tsx` — React routes.
- `frontend/src/pages/*.tsx` — top-level app pages.
- `frontend/src/lib/squads-pipeline.ts` — frontend sign/submit helper for Squads transactions.
- `Makefile` — local workflows.
- `docker-compose.yml` — local Postgres and ClickHouse.

## Vocabulary

- `Organization` — the top-level product tenant. Everything operational is organization-scoped.
- `User` — human account authenticated through email/password or Google OAuth.
- `OrganizationMembership` — user's role in an organization: `owner`, `admin`, `member`.
- `OrganizationInvite` — email-bound invite. Direct org joining is blocked.
- `PersonalWallet` — user-owned signing wallet. It is personal, not treasury-owned.
- `TreasuryWallet` — organization-owned wallet or vault. This is where organization funds live.
- `Squads treasury` — a `TreasuryWallet` with `source = squads_v4`, `sourceRef = multisig PDA`, and `address = vault PDA`.
- `OrganizationWalletAuthorization` — local bridge saying a personal wallet is authorized for a treasury wallet. For Squads, this mirrors on-chain multisig membership after sync.
- `Destination` — external wallet the organization pays.
- `CollectionSource` — external wallet the organization expects to receive from.
- `Counterparty` — optional business label attached to destinations or collection sources.
- `PaymentRequest` — input-layer "we need to pay X" object.
- `PaymentRun` — batch of payment requests/orders, usually from CSV.
- `PaymentOrder` — control-plane object for one intended outgoing payment.
- `CollectionRequest` — expected inbound USDC payment.
- `CollectionRun` — batch of collection requests.
- `TransferRequest` — matcher-level expected transfer row behind payments and collections.
- `ExecutionRecord` — evidence that execution was prepared/submitted/observed.
- `Exception` — reconciliation issue requiring operator review.
- `Proof packet` — deterministic JSON export describing intent, control, execution, settlement, and digest.

There is no active `Workspace` model and no `Payee` model. Treat those names as legacy.
