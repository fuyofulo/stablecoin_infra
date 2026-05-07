# 14 Code Module Index

This file maps important source files to concerns.

## Removed / Legacy Names

Avoid these in new work:

- `Workspace`
- `workspaceId`
- `WorkspaceAddress`
- `Payee`
- old `/workspaces/:workspaceId/...` routes

Current scope is `Organization`.

## Backend Core

### App And Config

- `api/src/app.ts` — Express middleware and route mounting.
- `api/src/server.ts` — server bootstrap.
- `api/src/config.ts` — env/config parsing.
- `api/src/prisma.ts` — Prisma client.
- `api/src/api-contract.ts` — route contract for OpenAPI/capabilities.
- `api/src/openapi.ts` — OpenAPI generation.
- `api/src/api-errors.ts` — typed API errors.
- `api/src/route-helpers.ts` — async route wrapper, list helpers.
- `api/src/api-format.ts` — response envelopes.
- `api/src/rate-limit.ts` — public route rate limiting.

### Auth, Org Access, Invites

- `api/src/auth.ts` — session lookup and `requireAuth`.
- `api/src/routes/auth.ts` — email/password auth, email verification, Google OAuth.
- `api/src/organization-access.ts` — organization access/admin checks.
- `api/src/routes/organizations.ts` — org list/create/summary and blocked direct join.
- `api/src/routes/organization-invites.ts` — invite create/list/revoke/public preview/accept.
- `api/src/routes/ops.ts` — members, audit log, ops health.
- `api/src/idempotency.ts` — mutation replay protection.

### Personal Wallets

- `api/src/routes/user-wallets.ts` — personal wallet routes, org personal wallet listing, transaction signing endpoint.
- `api/src/privy-wallets.ts` — Privy API calls for wallet deletion/signing.

### Treasury And Squads

- `api/src/treasury-wallets.ts` — manual treasury wallet CRUD, balances, serialization.
- `api/src/routes/treasury-wallets.ts` — treasury wallet routes and Squads route wiring.
- `api/src/squads-treasury.ts` — Squads v4 integration: create treasury, confirm, detail/status, config proposals, approval, execution, sync.
- `api/src/routes/wallet-authorizations.ts` — local personal-wallet authorization routes.
- `api/src/solana.ts` — Solana connection, ATA derivation, balance fetch helpers.
- `api/src/pricing.ts` — SOL/USD price fetch/cache.

### Address Book

- `api/src/destinations.ts` — destinations and counterparties.
- `api/src/routes/destinations.ts` — destination/counterparty routes.
- `api/src/collection-sources.ts` — saved inbound payer wallets.
- `api/src/routes/collection-sources.ts` — collection source routes.

### Payments And Collections

- `api/src/payment-requests.ts` — manual/CSV input payment requests.
- `api/src/routes/payment-requests.ts` — request routes.
- `api/src/payment-runs.ts` — CSV payment runs, batch execution preparation/signature attach.
- `api/src/routes/payment-runs.ts` — payment run routes.
- `api/src/payment-orders.ts` — single payment order lifecycle.
- `api/src/routes/payment-orders.ts` — payment order routes.
- `api/src/payment-order-state.ts` — order derived state.
- `api/src/payment-run-state.ts` — run derived state.
- `api/src/collections.ts` — collection requests/runs.
- `api/src/routes/collections.ts` — collection routes.

### Approval / Execution / Proof

- `api/src/approval-policy.ts` — approval policy evaluation.
- `api/src/routes/approvals.ts` — approval policy, inbox, decisions.
- `api/src/execution-records.ts` — execution evidence records.
- `api/src/payment-order-proof.ts` — payment proof packet.
- `api/src/payment-run-proof.ts` — payment run proof packet.
- `api/src/collection-request-proof.ts` — collection proof packet.
- `api/src/collection-run-proof.ts` — collection run proof packet.
- `api/src/proof-packet.ts` — canonical digest helpers.

### Reconciliation / Events

- `api/src/reconciliation.ts` — reads ClickHouse matching facts, exceptions, reconciliation detail.
- `api/src/reconciliation-timeline.ts` — timeline read model.
- `api/src/observed-transfers.ts` — observed transfer reads.
- `api/src/routes/events.ts` — transfers, reconciliation, exceptions.
- `api/src/clickhouse.ts` — ClickHouse client/query helper.
- `api/src/matching-index-events.ts` — SSE invalidation fanout.
- `api/src/routes/internal.ts` — worker-facing matching index/context routes.

## API Tests

- `api/tests/control-plane.test.ts` — main integration suite: auth, orgs, invites, personal wallets, Squads, payments, collections.
- `api/tests/api-contract.test.ts` — API contract coverage.
- `api/tests/openapi.test.ts` — OpenAPI generation.
- `api/tests/decimal-client.test.ts` — typed client behavior.
- `api/tests/clickhouse.test.ts` — ClickHouse helper behavior.

## Frontend

### Shell

- `frontend/src/App.tsx` — route table and app shell.
- `frontend/src/Sidebar.tsx` — navigation/sidebar/theme.
- `frontend/src/main.tsx` — React entry.
- `frontend/src/api.ts` — typed API client.
- `frontend/src/types.ts` — frontend domain types.
- `frontend/src/public-config.ts` — browser-safe config.
- `frontend/src/domain.ts` — formatting/explorer/wallet helpers.

### Squads Frontend

- `frontend/src/pages/Wallets.tsx` — create Squads treasury dialog.
- `frontend/src/pages/TreasuryWalletDetail.tsx` — Squads member table, add member, change threshold.
- `frontend/src/pages/SquadsProposals.tsx` — treasury-specific proposal list.
- `frontend/src/pages/SquadsProposalDetail.tsx` — one proposal detail.
- `frontend/src/pages/OrganizationProposals.tsx` — aggregate proposals across org.
- `frontend/src/ui/SquadsProposalCard.tsx` — reusable proposal card.
- `frontend/src/lib/squads-pipeline.ts` — sign/submit Squads intents.

### Payments / Collections Frontend

- `frontend/src/pages/Payments.tsx`
- `frontend/src/pages/PaymentDetail.tsx`
- `frontend/src/pages/PaymentRunDetail.tsx`
- `frontend/src/pages/Collections.tsx`
- `frontend/src/pages/CollectionDetail.tsx`
- `frontend/src/pages/CollectionRunDetail.tsx`
- `frontend/src/pages/CollectionSources.tsx`

### Other Frontend

- `frontend/src/pages/Landing.tsx`
- `frontend/src/pages/landing/*`
- `frontend/src/pages/Counterparties.tsx`
- `frontend/src/pages/Approvals.tsx`
- `frontend/src/pages/Execution.tsx`
- `frontend/src/pages/Settlement.tsx`
- `frontend/src/pages/Proofs.tsx`
- `frontend/src/ui/Toast.tsx`

### Styles

- `frontend/src/styles/design-tokens.css`
- `frontend/src/styles/canonical.css`
- `frontend/src/styles/run-detail.css`
- `frontend/src/styles/sidebar.css`
- `frontend/src/styles/app-dark.css`
- `frontend/src/styles.css`

## Yellowstone Worker

- `yellowstone/src/main.rs` — binary entry.
- `yellowstone/src/config.rs` — worker config.
- `yellowstone/src/control_plane.rs` — API matching-index client and SSE refresh.
- `yellowstone/src/storage.rs` — ClickHouse writes.
- `yellowstone/src/yellowstone/mod.rs` — main stream/matching loop.

The worker should only store relevant observed USDC activity for Decimal organizations, not the whole world.

## Infrastructure

- `Makefile` — dev/test/runtime commands.
- `docker-compose.yml` — local Postgres and ClickHouse.
- `postgres/init/` — database init SQL.
- `clickhouse/init/` — ClickHouse table SQL.
- `config/frontend.public.json` — browser-safe config.
- `config/worker.config.json` — worker config.

## Feature Addition Checklist

1. Add or update schema if needed.
2. Add service logic under `api/src`.
3. Add route under `api/src/routes`.
4. Update `api/src/api-contract.ts`.
5. Update `/capabilities` if user/agent visible.
6. Add API tests.
7. Update frontend `api.ts` and `types.ts`.
8. Update docs in `system_explained`.
