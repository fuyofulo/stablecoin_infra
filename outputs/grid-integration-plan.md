# Grid Integration Plan

## Why Grid

Decimal can already operate Squads v4 directly, but that means we own every detail: transaction construction, proposal lifecycle, policy updates, signing handoff, retries, and future banking rails. Grid is Squads' managed platform surface. Integrating it lets us test whether we should outsource the low-level treasury account operations and keep Decimal focused on workflows, AI, payment runs, policy UX, and proof.

## Integration Principle

Do not replace the direct Squads implementation immediately. Add Grid as a second treasury-account provider behind the same Decimal treasury wallet model.

The local table remains the source of truth for organization ownership, display name, lifecycle visibility, and links to payment workflows. Grid remains the provider of account creation, account reads, balances, KYC/virtual accounts, spending limits, standing orders, and managed proposal primitives.

## Phase 1: Provider Foundation

1. Add Grid dependency and runtime config.
2. Add a small Grid client wrapper that centralizes API key, environment, base URL, app ID, timeout, retry, and RPC configuration.
3. Store Grid accounts in `treasury_wallets` with `source = "grid"`.
4. Persist Grid metadata inside `properties_json.grid`.
5. Add backend routes to create a Grid signers account and read Grid account status/balances.
6. Advertise the new routes through `/capabilities` and `/openapi.json`.

This phase proves the API key, free-tier account creation, and Decimal persistence model without touching payment execution yet.

## Phase 2: Managed Account Operations

1. Add Grid-backed account policy updates.
2. Add Grid-backed spending limits.
3. Add Grid-backed standing orders.
4. Add Grid-backed KYC/virtual account request routes only if the free tier and geography make them available.
5. Keep direct Squads routes available for low-level fallback and testing.

## Phase 3: Payment Execution Through Grid

1. Prepare payment proposals through Grid where possible.
2. Normalize Grid proposal states into Decimal proposal states.
3. Keep RPC signature verification as Decimal's truth layer for executed payments.
4. Continue emitting Decimal proof packets from local state plus onchain verification.

## Phase 4: Decision Point

After testing Grid for account creation and at least one payment path:

1. If Grid removes meaningful complexity and is reliable on the free tier, make it the default treasury provider.
2. If Grid blocks required flows, keep it optional and continue direct Squads for production-critical paths.
3. If Grid pricing or availability becomes a blocker, retain only the provider abstraction and remove the Grid UI path.

## Current Backend Slice

This implementation adds only:

1. Grid config and dependency.
2. Grid client wrapper.
3. Create Grid treasury account endpoint.
4. Grid account status endpoint.
5. Grid account balances endpoint.
6. Capability/OpenAPI entries.

No frontend changes are required in this slice.
