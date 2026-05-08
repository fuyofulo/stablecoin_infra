# 04 Data Model

Important tables:

- `users`: human accounts.
- `auth_sessions`: API sessions.
- `organizations`: tenants.
- `organization_memberships`: roles inside organizations.
- `organization_invites`: email-bound invites.
- `user_wallets`: personal signing wallets.
- `treasury_wallets`: organization treasury accounts, including Squads vaults.
- `organization_wallet_authorizations`: local link between personal wallets and treasury permissions.
- `counterparties`: business labels.
- `destinations`: outbound payees.
- `collection_sources`: inbound payer records.
- `payment_requests`: input-layer payment requests.
- `payment_runs`: CSV/batch payment parent.
- `payment_orders`: one outbound payment intent.
- `transfer_requests`: approval/settlement intent row behind a payment order or collection.
- `approval_policies`: policy config.
- `approval_decisions`: policy decisions.
- `decimal_proposals`: local mirror of Squads proposals.
- `execution_records`: submitted/executed signature evidence.
- `payment_order_events`: payment audit trail.
- `transfer_request_events`: approval/settlement audit trail.

`TransferRequest` remains in the schema because it is still the shared approval/settlement intent primitive. It may eventually be renamed, but it is not dead code.

## Identity And Access

`users` are global human accounts. `organizations` are tenants. A user receives access through `organization_memberships`; joining an organization should happen through `organization_invites`.

`user_wallets` are personal signing wallets. They are not treasury wallets and should not be treated as organization funds. A personal wallet can be linked to organization permissions through `organization_wallet_authorizations`.

## Treasury State

`treasury_wallets` stores organization-owned treasury accounts. For Squads accounts, `source = "squads_v4"` and the Squads PDA/vault metadata is stored in `properties_json`.

`decimal_proposals` stores Decimal's local mirror of Squads proposal lifecycle:

- local proposal identity
- treasury wallet link
- proposal type
- transaction index
- submitted/executed signatures
- local status
- verification metadata

The chain remains authoritative. Decimal stores enough data to render the product, retry confirmations, and generate proofs.

## Payment State

`payment_requests` are input-layer requests. `payment_orders` are executable outbound payment intents. `payment_runs` group many orders into one batch flow.

For compatibility with earlier code, each payment order can still link to a `transfer_request`. That row carries approval and settlement state used by the proof builders.

## Removed Tables

The following old tables are no longer part of the active model:

- ClickHouse observed-transfer tables.
- `exception_notes`.
- `exception_states`.
- workspace tables.

RPC settlement mismatches are represented in read models and proposal metadata, not persisted into a separate exception workflow.

## Proof State

Proofs are generated on demand from current database state. They are not stored as separate rows.

The canonical digest is computed over stable JSON and returned with each proof packet.
