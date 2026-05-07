# 03 Backend Control Plane

The backend is the product source of truth. The frontend is one client.

The backend lives in `api/`.

## Main Entrypoints

```text
api/src/server.ts
  Starts the HTTP server.

api/src/app.ts
  Creates the Express app, middleware, route mounting, and error handling.

api/prisma/schema.prisma
  Defines the Postgres schema.

api/src/prisma.ts
  Exports the Prisma client.

api/src/api-contract.ts
  Defines the API contract used to generate OpenAPI.
```

## Express App Composition

`api/src/app.ts` builds the app in this order:

1. Request ID middleware.
2. CORS.
3. Public rate limit.
4. JSON body parser.
5. Matching-index invalidation middleware.
6. Public routes.
7. Internal/public auth-adjacent routes.
8. `requireAuth()`.
9. Idempotency middleware.
10. Protected route groups.
11. Error handler.

Public routes must be mounted before `requireAuth()`.

Protected product routes are organization-scoped.

## Auth

Current auth supports:

- email/password registration
- email/password login
- email verification
- Google OAuth
- bearer sessions
- logout/session invalidation

Sessions are stored in `AuthSession`.

The frontend stores the session token in browser storage and sends it as:

```text
Authorization: Bearer <session-token>
```

Google OAuth is implemented in `api/src/routes/auth.ts`.

## Organization Access

Access helpers live in `api/src/organization-access.ts`.

Important checks:

- `assertOrganizationAccess` — user must be an active member.
- `assertOrganizationAdmin` — user must be `owner` or `admin`.

Squads approval/execution routes intentionally use `assertOrganizationAccess`, then check the user's personal wallet against live on-chain Squads permissions. This allows a regular org `member` who is a Squads voter to approve proposals.

## Personal Wallets And Privy

Personal wallet routes live in `api/src/routes/user-wallets.ts`.

Privy integration lives in `api/src/privy-wallets.ts`.

Supported backend operations:

- list user's personal wallets
- list org members' active personal wallets
- register embedded Privy wallet
- delete user's own Privy wallet
- sign a versioned transaction through Privy

The backend never treats a personal wallet as org treasury funds. It is only a signer.

## Idempotency

Mutation requests can include:

```text
Idempotency-Key: client-generated-key
```

The idempotency middleware applies to `POST`, `PATCH`, and `DELETE`.

It stores:

- actor
- method
- path
- key
- stable request body hash
- response body

Same key + same body returns cached response. Same key + different body returns conflict.

## Matching-Index Invalidation

After relevant mutations succeed, the API notifies matching-index subscribers.

The worker listens to:

```text
GET /internal/matching-index/events
```

This avoids polling. The worker refreshes its in-memory index when the API emits an invalidation.

## Core Route Groups

Protected route groups:

- organizations and invites
- members and ops
- personal wallets
- treasury wallets
- Squads treasury routes
- wallet authorizations
- counterparties and destinations
- collection sources
- payment requests/runs/orders
- collections/runs
- approvals
- reconciliation/events/exceptions

See [13 API Route Catalog](./13-api-route-catalog.md) for exact routes.

## Important Service Modules

### `auth.ts` / `routes/auth.ts`

Session auth, password auth, Google OAuth, email verification.

### `organization-access.ts`

Organization access and admin checks.

### `user-wallets.ts` / `privy-wallets.ts`

Personal wallet registration, deletion, and signing.

### `treasury-wallets.ts`

Manual organization treasury wallet CRUD, balances, ATA derivation, serialization.

### `squads-treasury.ts`

Squads v4 integration:

- create multisig treasury intent
- confirm treasury
- detail/status reads
- config proposal creation
- proposal listing/detail
- approve/execute intents
- sync local member authorizations from chain

### `destinations.ts`

Counterparties and destination wallets.

### `collection-sources.ts`

Expected inbound payer wallets.

### `payment-requests.ts`

Manual and CSV-created input payment requests.

### `payment-runs.ts`

Batch payment imports, execution preparation, signature attachment, close/cancel.

### `payment-orders.ts`

Single payment lifecycle: create, submit, approve, prepare execution, attach signature, proof.

### `collections.ts`

Inbound collection requests and collection runs.

### `approval-policy.ts`

Approval policy evaluation against destinations, internal/external classification, and thresholds.

### `execution-records.ts`

Execution evidence and submitted signatures.

### `reconciliation.ts`

Reads ClickHouse facts, overlays Postgres metadata, classifies settlement state, and handles exceptions.

### `proof-packet.ts`, `payment-order-proof.ts`, `payment-run-proof.ts`

Deterministic JSON proof generation and digest helpers.

## Error Handling

The app maps:

- Zod errors -> `400 validation_error`
- `ApiError` -> configured HTTP status and code
- known Prisma errors -> typed API errors
- generic `Error` -> `400`
- unknown -> `500`

Some legacy routes still throw generic `Error`. Prefer `ApiError`, `badRequest`, `forbidden`, `notFound`, and `conflict` for new code.

## API-First Principle

For every frontend workflow, a script should be able to perform the same sequence through documented HTTP calls.

If critical sequencing exists only in React state, move it into:

- explicit backend endpoints
- API contract documentation
- tests
- proof/audit events
