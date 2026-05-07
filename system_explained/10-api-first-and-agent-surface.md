# 10 API First Surface

Decimal should be usable without the frontend.

The current lean build does **not** include API keys, machine auth, or an autonomous agent runtime. That was intentional. The immediate goal is:

```text
Every important human workflow should have a clean HTTP path,
documented in OpenAPI, with idempotent mutations where retries are likely.
```

## Current API-First Building Blocks

### OpenAPI

```text
GET /openapi.json
```

Generated from `api/src/api-contract.ts`.

### Capabilities

```text
GET /capabilities
```

Compact workflow map for clients and future agent tooling.

### User Sessions

```text
POST /auth/login
GET  /auth/google/start
Authorization: Bearer <session-token>
```

All protected product routes use user sessions.

### Idempotency

Mutation clients can retry safely with:

```text
Idempotency-Key: stable-client-generated-key
```

Use this on creation/import/signature/action endpoints.

## Current API Workflow Examples

### Organization Setup

```text
POST /auth/register
POST /auth/verify-email
POST /organizations
POST /personal-wallets/embedded
POST /organizations/:organizationId/invites
POST /invites/:inviteToken/accept
```

### Squads Treasury Setup

```text
GET  /organizations/:organizationId/personal-wallets
POST /organizations/:organizationId/treasury-wallets/squads/create-intent
POST /personal-wallets/:userWalletId/sign-versioned-transaction
POST /organizations/:organizationId/treasury-wallets/squads/confirm
```

### Squads Config Proposal

```text
POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals/add-member-intent
POST /personal-wallets/:userWalletId/sign-versioned-transaction
GET  /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals
POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals/:transactionIndex/approve-intent
POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals/:transactionIndex/execute-intent
POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/sync-members
```

### Single Payment

```text
POST /organizations/:organizationId/payment-requests
POST /organizations/:organizationId/payment-requests/:paymentRequestId/promote
POST /organizations/:organizationId/payment-orders/:paymentOrderId/submit
POST /organizations/:organizationId/payment-orders/:paymentOrderId/prepare-execution
POST /organizations/:organizationId/payment-orders/:paymentOrderId/attach-signature
GET  /organizations/:organizationId/payment-orders/:paymentOrderId/proof
```

### Batch Payment Run

```text
POST /organizations/:organizationId/payment-runs/import-csv/preview
POST /organizations/:organizationId/payment-runs/import-csv
POST /organizations/:organizationId/payment-runs/:paymentRunId/prepare-execution
POST /organizations/:organizationId/payment-runs/:paymentRunId/attach-signature
POST /organizations/:organizationId/payment-runs/:paymentRunId/close
GET  /organizations/:organizationId/payment-runs/:paymentRunId/proof
```

### Single Collection

```text
POST /organizations/:organizationId/collection-sources
POST /organizations/:organizationId/collections
GET  /organizations/:organizationId/collections/:collectionRequestId
GET  /organizations/:organizationId/collections/:collectionRequestId/proof
```

### Batch Collection Run

```text
POST /organizations/:organizationId/collection-runs/import-csv/preview
POST /organizations/:organizationId/collection-runs/import-csv
GET  /organizations/:organizationId/collection-runs/:collectionRunId
GET  /organizations/:organizationId/collection-runs/:collectionRunId/proof
```

### Reconciliation Review

```text
GET  /organizations/:organizationId/reconciliation
GET  /organizations/:organizationId/reconciliation-queue/:transferRequestId
GET  /organizations/:organizationId/reconciliation-queue/:transferRequestId/explain
POST /organizations/:organizationId/reconciliation-queue/:transferRequestId/refresh
```

### Exception Handling

```text
GET   /organizations/:organizationId/exceptions
GET   /organizations/:organizationId/exceptions/:exceptionId
PATCH /organizations/:organizationId/exceptions/:exceptionId
POST  /organizations/:organizationId/exceptions/:exceptionId/notes
POST  /organizations/:organizationId/exceptions/:exceptionId/actions
```

## What Was Removed

Removed during lean cleanup:

- workspace API keys
- agent task queue
- agent task SSE stream
- API-key scope enforcement

This does not mean Decimal cannot support agents. It means agent support should return only after a real workflow and threat model are clear.

## What Agents Would Need Later

If agent support becomes real, add:

- machine auth with scoped credentials
- explicit organization permission model
- durable worklist endpoints
- action preview / dry-run endpoints
- idempotency requirements on every mutation
- signed audit logs
- integration tests with an actual agent client
- event subscription that works across multiple API replicas

Until then, keep the backend API-first for humans and scripts, not agent-shaped in theory.
