# 10 API First Surface

Axoria should be usable without the frontend, but the current lean build does **not** include workspace API keys or an autonomous agent runtime.

The present goal is simpler:

```text
Every important human workflow should have a clean HTTP path, documented in OpenAPI, with idempotent mutations where retries are likely.
```

## Current API-First Building Blocks

### OpenAPI

The API exposes:

```text
GET /openapi.json
```

The spec is generated from `api/src/api-contract.ts`, so route additions and removals should be reflected there first.

### Capabilities

The API exposes:

```text
GET /capabilities
```

This is a compact product map for clients. It describes the main workflows:

- single payment
- CSV/payment-run import
- exception operations

### User Sessions

Auth is currently session-token based:

```text
POST /auth/login
Authorization: Bearer <session-token>
```

Machine authentication was intentionally removed during cleanup until a real agent/customer workflow justifies it.

### Idempotency Keys

Mutation clients can safely retry with:

```text
Idempotency-Key: stable-client-generated-key
```

Use this on:

- payment request creation
- CSV import
- payment order creation
- execution preparation
- signature attachment
- exception actions

## Current API Workflow Examples

### Single Payment

```text
POST /workspaces/:workspaceId/payment-requests
POST /workspaces/:workspaceId/payment-requests/:paymentRequestId/promote
POST /workspaces/:workspaceId/payment-orders/:paymentOrderId/submit
POST /workspaces/:workspaceId/payment-orders/:paymentOrderId/prepare-execution
POST /workspaces/:workspaceId/payment-orders/:paymentOrderId/attach-signature
GET  /workspaces/:workspaceId/payment-orders/:paymentOrderId/proof?format=markdown
```

### Batch Payment Run

```text
POST /workspaces/:workspaceId/payment-runs/import-csv/preview
POST /workspaces/:workspaceId/payment-runs/import-csv
POST /workspaces/:workspaceId/payment-runs/:paymentRunId/prepare-execution
POST /workspaces/:workspaceId/payment-runs/:paymentRunId/attach-signature
POST /workspaces/:workspaceId/payment-runs/:paymentRunId/close
GET  /workspaces/:workspaceId/payment-runs/:paymentRunId/proof?format=markdown
```

### Reconciliation Review

```text
GET  /workspaces/:workspaceId/reconciliation
GET  /workspaces/:workspaceId/reconciliation-queue/:transferRequestId
GET  /workspaces/:workspaceId/reconciliation-queue/:transferRequestId/explain
POST /workspaces/:workspaceId/reconciliation-queue/:transferRequestId/refresh
```

### Exception Handling

```text
GET   /workspaces/:workspaceId/exceptions
GET   /workspaces/:workspaceId/exceptions/:exceptionId
PATCH /workspaces/:workspaceId/exceptions/:exceptionId
POST  /workspaces/:workspaceId/exceptions/:exceptionId/notes
POST  /workspaces/:workspaceId/exceptions/:exceptionId/actions
```

## What Was Removed

The following surfaces were removed because they were adding complexity before real usage:

- workspace API keys
- agent task queue
- agent task SSE stream
- API-key scope enforcement

This does not mean Axoria can never support agents. It means agent support should return only after we validate a concrete workflow and threat model.

## What Agents Would Need Later

If agent support becomes real, add it deliberately:

- machine auth with scoped credentials
- durable task queue or explicit worklist endpoints
- route-level permission model
- integration tests with an actual agent client
- event subscription that works across multiple API replicas
- audit events for every machine action

Until then, keep the backend API-first for humans and scripts, not agent-shaped in theory.
