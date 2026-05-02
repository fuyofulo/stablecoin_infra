# 13 API Route Catalog

This file lists the HTTP routes the Decimal API currently exposes, grouped by responsibility. Routes are defined in `api/src/routes/*.ts` and mounted in `api/src/app.ts`. The machine-readable contract lives in `api/src/api-contract.ts` and is served at `/openapi.json`.

All workspace-scoped routes require a user session: `Authorization: Bearer <session-token>`.

## Public Routes (No Auth)

- `GET /health` — liveness ping. Runs `SELECT 1` against Postgres.
- `GET /capabilities` — advertised feature set and versions.
- `GET /openapi.json` — OpenAPI 3 spec generated from `api-contract.ts`.
- `POST /auth/register` — create a new user (email + password).
- `POST /auth/login` — email + password session creation.
- `GET /auth/session` — returns the authenticated session (requires auth).
- `POST /auth/logout` — invalidates the current session (requires auth).

## Organizations And Workspaces

- `GET  /organizations` — orgs the authenticated user belongs to.
- `POST /organizations` — create an organization.
- `POST /organizations/:organizationId/join` — join an existing org (by invite code or similar).
- `GET  /organizations/:organizationId/workspaces` — list workspaces in an org.
- `POST /organizations/:organizationId/workspaces` — create a workspace.

## Treasury Wallets

Replaces the old `/addresses` routes.

- `GET   /workspaces/:workspaceId/treasury-wallets` — list wallets the workspace owns.
- `GET   /workspaces/:workspaceId/treasury-wallets/balances` — live Solana balances for every wallet: lamports, USDC raw, plus the workspace's current SOL/USD price from `pricing.ts` (Binance SOLUSDT, 60s cache, stale fallback). This is what the Overview and Wallets pages render.
- `POST  /workspaces/:workspaceId/treasury-wallets` — register a wallet. Body: `{ address, chain?, source?, assetScope?, displayName?, notes?, usdcAtaAddress?, propertiesJson? }`. The USDC ATA is derived automatically if not supplied.
- `PATCH /workspaces/:workspaceId/treasury-wallets/:treasuryWalletId` — update display name / notes / active flag.

Treasury wallets are the **only** addresses the Yellowstone worker watches as "ours." Do not store counterparty wallets here — use `Destination` for those.

## Counterparties And Destinations

Destinations are what you pay; counterparties are an optional org-scoped entity tag on top.

- `GET   /workspaces/:workspaceId/counterparties` — list counterparties.
- `POST  /workspaces/:workspaceId/counterparties` — create. Body: `{ displayName, category, externalReference?, status?, metadataJson? }` (category is required).
- `PATCH /workspaces/:workspaceId/counterparties/:counterpartyId` — update.
- `GET   /workspaces/:workspaceId/destinations` — list destinations.
- `POST  /workspaces/:workspaceId/destinations` — create. Body: `{ counterpartyId?, chain?, asset?, walletAddress, tokenAccountAddress?, destinationType?, trustState?, label, notes?, isInternal?, isActive?, metadataJson? }`. `trustState` defaults to `unreviewed`; `isInternal` defaults to `false`.
- `PATCH /workspaces/:workspaceId/destinations/:destinationId` — update any editable field (label, trust state, counterparty tag, notes, active flag). Unique `(workspaceId, walletAddress)` is enforced.

There are **no `/payees` routes**. Payees were removed — use a destination + optional counterparty.

## Collection Sources

Saved expected payer wallets (the inbound side's equivalent of a destination). A collection that references a `collectionSourceId` becomes match-restricted to that wallet via the worker's `request_matches_observed_source` guard.

- `GET   /workspaces/:workspaceId/collection-sources` — list active sources.
- `POST  /workspaces/:workspaceId/collection-sources` — create. Body: `{ label, walletAddress, tokenAccountAddress?, sourceType?, trustState?, counterpartyId?, notes? }`. `trustState` defaults to `unreviewed`.
- `PATCH /workspaces/:workspaceId/collection-sources/:collectionSourceId` — update label, trust state, counterparty tag, notes, active flag.

The new-collection dialog supports inline source creation in its "Known source" tab — same backing endpoint.

## Collections (single requests)

Inbound expected payments. One per `CollectionRequest` row.

- `GET  /workspaces/:workspaceId/collections` — list standalone collection requests.
- `POST /workspaces/:workspaceId/collections` — create. Body: `{ receivingTreasuryWalletId, counterpartyId?, collectionSourceId? | payerWalletAddress?, payerTokenAccountAddress?, amountRaw, reason, externalReference? }`. Either `collectionSourceId` (preferred) or raw `payerWalletAddress` constrains the matcher to a specific payer; omit both for "any payer."
- `POST /workspaces/:workspaceId/collections/import-csv/preview` — parse and validate a CSV without writing.
- `GET  /workspaces/:workspaceId/collections/:collectionRequestId` — detail.
- `GET  /workspaces/:workspaceId/collections/:collectionRequestId/proof` — JSON proof packet.
- `POST /workspaces/:workspaceId/collections/:collectionRequestId/cancel` — cancel.

## Collection Runs

Batches of collection requests, usually from CSV.

- `GET    /workspaces/:workspaceId/collection-runs` — list.
- `POST   /workspaces/:workspaceId/collection-runs/import-csv` — create a run from CSV.
- `POST   /workspaces/:workspaceId/collection-runs/import-csv/preview` — preview without writing.
- `GET    /workspaces/:workspaceId/collection-runs/:collectionRunId` — detail with child requests.
- `GET    /workspaces/:workspaceId/collection-runs/:collectionRunId/proof` — JSON proof packet for the run.

## Payment Requests

Input-layer objects. These are what a human or agent creates before a payment order exists.

- `GET  /workspaces/:workspaceId/payment-requests` — list.
- `POST /workspaces/:workspaceId/payment-requests` — create a single request. Accepts flags `createOrderNow` and `submitOrderNow` to collapse the request → order → submit steps.
- `POST /workspaces/:workspaceId/payment-requests/import-csv` — bulk import without wrapping into a `PaymentRun`.
- `POST /workspaces/:workspaceId/payment-requests/import-csv/preview` — parse and validate a CSV without writing anything.
- `GET  /workspaces/:workspaceId/payment-requests/:paymentRequestId` — detail.
- `POST /workspaces/:workspaceId/payment-requests/:paymentRequestId/cancel` — mark a request cancelled.
- `POST /workspaces/:workspaceId/payment-requests/:paymentRequestId/promote` — materialize the request into a `PaymentOrder`.

## Payment Runs

Batches, usually from CSV.

- `GET  /workspaces/:workspaceId/payment-runs` — list.
- `POST /workspaces/:workspaceId/payment-runs/import-csv` — create a run from CSV. Idempotent by CSV fingerprint: re-importing the same file returns the existing run with `importResult.imported: 0` and `idempotentReplay: true`.
- `POST /workspaces/:workspaceId/payment-runs/import-csv/preview` — preview without writing.
- `GET  /workspaces/:workspaceId/payment-runs/:paymentRunId` — detail, including child orders and aggregate totals.
- `DELETE /workspaces/:workspaceId/payment-runs/:paymentRunId` — delete the run (orders keep their history, lose the grouping).
- `POST /workspaces/:workspaceId/payment-runs/:paymentRunId/cancel` — cancel the run and its pending orders.
- `POST /workspaces/:workspaceId/payment-runs/:paymentRunId/close` — close a settled run.
- `POST /workspaces/:workspaceId/payment-runs/:paymentRunId/prepare-execution` — prepare a single Solana transaction for the whole batch.
- `POST /workspaces/:workspaceId/payment-runs/:paymentRunId/attach-signature` — attach the submitted signature after the wallet signs.
- `GET  /workspaces/:workspaceId/payment-runs/:paymentRunId/proof` — deterministic proof packet for the entire run.

## Payment Orders

The control-plane object for a single intended payment.

- `GET   /workspaces/:workspaceId/payment-orders` — list (supports `state` filter).
- `POST  /workspaces/:workspaceId/payment-orders` — create (usually from a request, but can be created directly).
- `GET   /workspaces/:workspaceId/payment-orders/:paymentOrderId` — detail, with events, approvals, and matching state.
- `PATCH /workspaces/:workspaceId/payment-orders/:paymentOrderId` — limited updates (e.g. `sourceTreasuryWalletId`, `metadata`).
- `POST  /workspaces/:workspaceId/payment-orders/:paymentOrderId/submit` — submit a draft for approval.
- `POST  /workspaces/:workspaceId/payment-orders/:paymentOrderId/cancel` — cancel.
- `POST  /workspaces/:workspaceId/payment-orders/:paymentOrderId/prepare-execution` — prepare a single-order execution packet.
- `POST  /workspaces/:workspaceId/payment-orders/:paymentOrderId/attach-signature` — attach the submitted signature after signing.
- `POST  /workspaces/:workspaceId/payment-orders/:paymentOrderId/create-execution` — create an `ExecutionRecord` ahead of signing.
- `GET   /workspaces/:workspaceId/payment-orders/:paymentOrderId/proof` — deterministic proof packet for one payment.

## Approvals

- `GET   /workspaces/:workspaceId/approval-policy` — fetch the workspace's policy row (always one per workspace).
- `PATCH /workspaces/:workspaceId/approval-policy` — update `policyName`, `isActive`, or keys under `ruleJson` (trust requirement, internal/external thresholds, etc.).
- `GET   /workspaces/:workspaceId/approval-inbox` — pending approvals (used by the Approvals page).
- `POST  /workspaces/:workspaceId/transfer-requests/:transferRequestId/approval-decisions` — record an `approve` / `reject` / `escalate` decision.

Transfer requests are still the internal reconciliation row behind a payment order, but there is no public transfer-request CRUD route. The only public transfer-request route left is the approval-decision route because approval decisions target the underlying request id.

## Observed Data And Reconciliation

- `GET  /workspaces/:workspaceId/transfers` — observed USDC transfers touching the workspace.
- `GET  /workspaces/:workspaceId/reconciliation` — reconciliation rows joining transfer requests ↔ observed transfers.
- `GET  /workspaces/:workspaceId/reconciliation-queue` — items needing operator attention.
- `GET  /workspaces/:workspaceId/reconciliation/:transferRequestId` — detail timeline for one request.
- `GET  /workspaces/:workspaceId/reconciliation/:transferRequestId/timeline` — the same, with event-log semantics.
- `POST /workspaces/:workspaceId/reconciliation/:transferRequestId/notes` — add a note.
- `GET  /workspaces/:workspaceId/exceptions` — list open + historical exceptions.
- `GET  /workspaces/:workspaceId/exceptions/:exceptionId` — detail.
- `PATCH /workspaces/:workspaceId/exceptions/:exceptionId` — update status / assignee.
- `POST /workspaces/:workspaceId/exceptions/:exceptionId/actions` — applies an action (`reviewed` | `expected` | `dismissed` | `reopen`).
- `POST /workspaces/:workspaceId/exceptions/:exceptionId/notes` — add an operator note.

## Ops, Members, Proofs

- `GET /workspaces/:workspaceId/members` — workspace members.
- `GET /workspaces/:workspaceId/audit-log` — workspace-wide audit view across event tables.
- `GET /workspaces/:workspaceId/ops-health` — combined Postgres + ClickHouse health signal used by ops surfaces.

## Internal (Worker ↔ API)

Used by the Yellowstone worker via the `x-service-token` header (`CONTROL_PLANE_SERVICE_TOKEN`), not exposed to end users.

- `GET /internal/workspaces` — list workspaces the worker should watch.
- `GET /internal/workspaces/:workspaceId/matching-context` — matcher context for one workspace.
- `GET /internal/matching-index` — global matching index. Returns `{version, workspaces: [{workspace, treasury_wallets, matches, addresses, transferRequests}]}` where `matches` is the list of open transfer requests (both `payment_order` and `collection_request`) with their expected source, destination, and any submitted signature.
- `GET /internal/matching-index/events` — SSE stream of matching-index invalidations so the worker can refresh without polling.

## Route Change Checklist

When you add, remove, or reshape a route:

1. Update the handler under `api/src/routes/`.
2. Update `api/src/api-contract.ts` so `/openapi.json` reflects the change.
3. If it affects the matching index (treasury wallets, destinations, transfer requests, approvals, signatures) make sure the mutation triggers `matching-index-events` invalidation.
4. Update the frontend `api.ts` client.
5. Update this file.
6. Add or adjust a test in `api/tests/`.
