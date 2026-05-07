# 13 API Route Catalog

Routes are defined in `api/src/routes/*.ts` and mounted in `api/src/app.ts`.

The machine-readable contract lives in `api/src/api-contract.ts` and is served at:

```text
GET /openapi.json
```

Authenticated routes use:

```text
Authorization: Bearer <session-token>
```

The active route shape is organization-scoped:

```text
/organizations/:organizationId/...
```

The old `/workspaces/:workspaceId/...` shape is stale.

## Public And Auth Routes

- `GET /health`
- `GET /capabilities`
- `GET /openapi.json`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/session`
- `POST /auth/verify-email`
- `POST /auth/resend-verification`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /invites/:inviteToken`
- `POST /invites/:inviteToken/accept`

## Organizations And Members

- `GET /organizations`
- `POST /organizations`
- `GET /organizations/:organizationId/summary`
- `POST /organizations/:organizationId/join` — intentionally blocked; org joining is invite-only.
- `GET /organizations/:organizationId/members`
- `GET /organizations/:organizationId/invites`
- `POST /organizations/:organizationId/invites`
- `POST /organizations/:organizationId/invites/:organizationInviteId/revoke`

## Personal Wallets

User-scoped:

- `GET /personal-wallets`
- `POST /personal-wallets/challenges`
- `POST /personal-wallets/verify`
- `POST /personal-wallets/embedded`
- `DELETE /personal-wallets/:userWalletId`
- `POST /personal-wallets/:userWalletId/sign-versioned-transaction`

Organization-scoped personal wallet listing:

- `GET /organizations/:organizationId/personal-wallets`

The org-scoped listing is used for Squads treasury creation and add-member proposals.

## Treasury Wallets

- `GET /organizations/:organizationId/treasury-wallets`
- `GET /organizations/:organizationId/treasury-wallets/balances`
- `POST /organizations/:organizationId/treasury-wallets`
- `PATCH /organizations/:organizationId/treasury-wallets/:treasuryWalletId`

Manual treasury wallets are plain organization-controlled addresses. Squads treasury wallets use the Squads-specific routes below.

## Squads Treasury Routes

Creation:

- `POST /organizations/:organizationId/treasury-wallets/squads/create-intent`
- `POST /organizations/:organizationId/treasury-wallets/squads/confirm`

Read:

- `GET /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/detail`
- `GET /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/status`
- `GET /organizations/:organizationId/squads/proposals`
- `GET /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals`
- `GET /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals/:transactionIndex`

Config proposal creation:

- `POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals/add-member-intent`
- `POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals/change-threshold-intent`

Config proposal participation:

- `POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals/:transactionIndex/approve-intent`
- `POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals/:transactionIndex/execute-intent`

Sync:

- `POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/sync-members`

Access rules:

- Creating a Squads treasury: organization admin.
- Creating add-member/change-threshold proposals: organization admin and on-chain initiator wallet.
- Listing proposal pages: organization access plus current user must own a personal wallet on that Squads multisig.
- Approving/executing: organization access plus actor must own the personal wallet and that wallet must have the needed on-chain Squads permission.

## Wallet Authorizations

- `GET /organizations/:organizationId/wallet-authorizations`
- `POST /organizations/:organizationId/wallet-authorizations`
- `POST /organizations/:organizationId/wallet-authorizations/:walletAuthorizationId/revoke`

For Squads treasuries, local `squads_member` authorizations are usually created/updated through Squads confirmation or `sync-members`.

## Counterparties And Destinations

- `GET /organizations/:organizationId/counterparties`
- `POST /organizations/:organizationId/counterparties`
- `PATCH /organizations/:organizationId/counterparties/:counterpartyId`
- `GET /organizations/:organizationId/destinations`
- `POST /organizations/:organizationId/destinations`
- `PATCH /organizations/:organizationId/destinations/:destinationId`

## Collection Sources

- `GET /organizations/:organizationId/collection-sources`
- `POST /organizations/:organizationId/collection-sources`
- `PATCH /organizations/:organizationId/collection-sources/:collectionSourceId`

## Collections

Single collection requests:

- `GET /organizations/:organizationId/collections`
- `POST /organizations/:organizationId/collections`
- `POST /organizations/:organizationId/collections/import-csv/preview`
- `GET /organizations/:organizationId/collections/:collectionRequestId`
- `GET /organizations/:organizationId/collections/:collectionRequestId/proof`
- `POST /organizations/:organizationId/collections/:collectionRequestId/cancel`

Collection runs:

- `GET /organizations/:organizationId/collection-runs`
- `POST /organizations/:organizationId/collection-runs/import-csv`
- `POST /organizations/:organizationId/collection-runs/import-csv/preview`
- `GET /organizations/:organizationId/collection-runs/:collectionRunId`
- `GET /organizations/:organizationId/collection-runs/:collectionRunId/proof`

## Payment Requests

- `GET /organizations/:organizationId/payment-requests`
- `POST /organizations/:organizationId/payment-requests`
- `POST /organizations/:organizationId/payment-requests/import-csv`
- `POST /organizations/:organizationId/payment-requests/import-csv/preview`
- `GET /organizations/:organizationId/payment-requests/:paymentRequestId`
- `POST /organizations/:organizationId/payment-requests/:paymentRequestId/promote`
- `POST /organizations/:organizationId/payment-requests/:paymentRequestId/cancel`

## Payment Runs

- `GET /organizations/:organizationId/payment-runs`
- `POST /organizations/:organizationId/payment-runs/import-csv`
- `POST /organizations/:organizationId/payment-runs/import-csv/preview`
- `GET /organizations/:organizationId/payment-runs/:paymentRunId`
- `DELETE /organizations/:organizationId/payment-runs/:paymentRunId`
- `POST /organizations/:organizationId/payment-runs/:paymentRunId/cancel`
- `POST /organizations/:organizationId/payment-runs/:paymentRunId/close`
- `POST /organizations/:organizationId/payment-runs/:paymentRunId/prepare-execution`
- `POST /organizations/:organizationId/payment-runs/:paymentRunId/attach-signature`
- `GET /organizations/:organizationId/payment-runs/:paymentRunId/proof`

## Payment Orders

- `GET /organizations/:organizationId/payment-orders`
- `POST /organizations/:organizationId/payment-orders`
- `GET /organizations/:organizationId/payment-orders/:paymentOrderId`
- `PATCH /organizations/:organizationId/payment-orders/:paymentOrderId`
- `POST /organizations/:organizationId/payment-orders/:paymentOrderId/submit`
- `POST /organizations/:organizationId/payment-orders/:paymentOrderId/cancel`
- `POST /organizations/:organizationId/payment-orders/:paymentOrderId/prepare-execution`
- `POST /organizations/:organizationId/payment-orders/:paymentOrderId/create-execution`
- `POST /organizations/:organizationId/payment-orders/:paymentOrderId/attach-signature`
- `GET /organizations/:organizationId/payment-orders/:paymentOrderId/proof`

## Approvals

- `GET /organizations/:organizationId/approval-policy`
- `PATCH /organizations/:organizationId/approval-policy`
- `GET /organizations/:organizationId/approval-inbox`
- `POST /organizations/:organizationId/transfer-requests/:transferRequestId/approval-decisions`

## Observed Data, Reconciliation, Exceptions

- `GET /organizations/:organizationId/transfers`
- `GET /organizations/:organizationId/reconciliation`
- `GET /organizations/:organizationId/reconciliation-queue`
- `GET /organizations/:organizationId/reconciliation-queue/:transferRequestId`
- `GET /organizations/:organizationId/reconciliation-queue/:transferRequestId/explain`
- `POST /organizations/:organizationId/reconciliation-queue/:transferRequestId/refresh`
- `GET /organizations/:organizationId/exceptions`
- `GET /organizations/:organizationId/exceptions/:exceptionId`
- `PATCH /organizations/:organizationId/exceptions/:exceptionId`
- `POST /organizations/:organizationId/exceptions/:exceptionId/actions`
- `POST /organizations/:organizationId/exceptions/:exceptionId/notes`

## Ops And Audit

- `GET /organizations/:organizationId/audit-log`
- `GET /organizations/:organizationId/ops-health`

## Internal Worker Routes

Used by the Yellowstone worker with `x-service-token`.

- `GET /internal/matching-index`
- `GET /internal/matching-index/events`
- `GET /internal/organizations/:organizationId/matching-context`

The worker no longer uses a workspace registry. It consumes an organization-scoped matching index.

## Route Change Checklist

When adding or changing a route:

1. Update the route handler under `api/src/routes/`.
2. Update `api/src/api-contract.ts`.
3. Update `/capabilities` if the feature should be advertised.
4. Update frontend `api.ts` types/client if needed.
5. Add or adjust API tests.
6. Update this file.
7. If the mutation affects matching, ensure matching-index invalidation fires.
