# 15 Squads Treasury Architecture

This file explains how Decimal integrates with Squads v4.

## Why Squads Exists In Decimal

Decimal needs organization treasury control. A single embedded wallet is not enough for a serious treasury product because teams need:

- multiple signers
- approval thresholds
- auditable membership
- permissioned proposal flow
- separation between personal signers and organization funds

Squads v4 provides the on-chain multisig program. Decimal provides the product/control-plane layer around it.

## Important Distinction

There are two different wallet concepts:

```text
PersonalWallet
  belongs to one user
  signs transactions
  currently created through Privy
  does not hold organization funds by default

TreasuryWallet
  belongs to an organization
  represents organization funds
  can be a manual address or a Squads vault PDA
```

For Squads:

```text
PersonalWallet -> on-chain Squads member
Squads multisig PDA -> governance account
Squads vault PDA -> treasury address stored as TreasuryWallet.address
```

## Stored Representation

A Squads treasury is stored as a `TreasuryWallet`.

Key fields:

- `source = squads_v4`
- `sourceRef = multisig PDA`
- `address = vault PDA`
- `propertiesJson.squads.programId`
- `propertiesJson.squads.multisigPda`
- `propertiesJson.squads.vaultPda`
- `propertiesJson.squads.vaultIndex`
- `propertiesJson.squads.threshold`
- `propertiesJson.squads.members`
- `propertiesJson.squads.transactionIndex`
- `propertiesJson.squads.staleTransactionIndex`

Decimal also stores local authorization rows:

- table: `OrganizationWalletAuthorization`
- role: `squads_member`
- scope: `treasury_wallet`
- metadata includes Squads permissions and PDAs

These rows are local product state. The Squads program remains authoritative.

## Current Squads Capabilities

Decimal currently supports:

- creating a Squads v4 treasury
- selecting members at creation
- selecting member permissions at creation
- selecting threshold at creation
- reading live Squads treasury detail
- reading live Squads treasury status
- creating add-member config proposals
- creating change-threshold config proposals
- listing config proposals per treasury
- listing config proposals across an organization for the current user's Squads memberships
- reading one config proposal by transaction index
- approving config proposals
- executing config proposals
- syncing local Decimal authorizations from on-chain Squads state

Decimal does not yet support:

- Squads vault payment proposals
- Squads batch payment proposals
- remove-member proposals
- change-member-permissions proposals
- cancel proposal flow
- payment proof packets containing Squads governance evidence

## Squads Creation Flow

Frontend flow:

```text
Wallets page
  -> Create Squads treasury
  -> choose name
  -> choose member personal wallets
  -> choose permissions
  -> choose threshold
  -> prepare transaction
  -> sign with creator personal wallet
  -> submit transaction
  -> confirm in Decimal
```

Backend routes:

```text
POST /organizations/:organizationId/treasury-wallets/squads/create-intent
POST /organizations/:organizationId/treasury-wallets/squads/confirm
```

Implementation:

- `api/src/squads-treasury.ts#createSquadsTreasuryIntent`
- `api/src/squads-treasury.ts#confirmSquadsTreasuryCreation`

The create intent builds a Squads `multisigCreateV2` transaction. Decimal partially signs with the generated `createKey`. The user's personal wallet signs as creator/payer.

Confirmation verifies the on-chain multisig and stores the vault as a `TreasuryWallet`.

## Member And Threshold Management

Adding members and changing threshold are Squads config proposals.

Backend routes:

```text
POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals/add-member-intent
POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals/change-threshold-intent
POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals/:transactionIndex/approve-intent
POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals/:transactionIndex/execute-intent
POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/sync-members
```

Implementation:

- `createSquadsAddMemberProposalIntent`
- `createSquadsChangeThresholdProposalIntent`
- `createSquadsConfigProposalApprovalIntent`
- `createSquadsConfigProposalExecuteIntent`
- `syncSquadsTreasuryMembers`

The config proposal creation flow builds:

- `configTransactionCreate`
- `proposalCreate`
- optional `proposalApprove`

The approve flow builds:

- `proposalApprove`

The execute flow builds:

- `configTransactionExecute`

## Proposal Listing

Decimal reads Squads proposals live from chain instead of storing proposal rows locally.

Routes:

```text
GET /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals
GET /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals/:transactionIndex
GET /organizations/:organizationId/squads/proposals
```

Implementation:

- `listSquadsConfigProposals`
- `getSquadsConfigProposal`
- `listOrganizationSquadsConfigProposals`

How listing works:

1. Load the live Squads multisig account.
2. Walk transaction indexes from newest to stale boundary.
3. Derive proposal PDA and config transaction PDA.
4. Load `Proposal` and `ConfigTransaction` accounts.
5. Serialize status, actions, approvals, rejections, cancellations, pending voters, execute-capable wallets.
6. Join addresses back to Decimal `PersonalWallet` and `OrganizationMembership` when possible.

Status filters:

- `pending` — active/approved proposals that still need approval or execution.
- `closed` — executed/cancelled/rejected.
- `all` — everything returned by the chain walk.

## Visibility And Authorization Rules

There are two layers of authorization:

### Organization Access

This checks whether the user belongs to the organization.

Used broadly for reads and base route access.

### Squads On-Chain Permission

This checks whether the user's personal wallet is an on-chain Squads member with the required permission.

Examples:

- Listing proposals requires the current user to own at least one personal wallet that is an on-chain member of the Squads treasury.
- Approving requires the personal wallet to have `vote`.
- Executing requires the personal wallet to have `execute`.
- Creating config proposals requires the creator personal wallet to have `initiate`.

This is why approve/execute routes allow normal org `member` users through the route-level gate. The real safety check is the on-chain permission check.

## Frontend Surfaces

Main files:

- `frontend/src/pages/Wallets.tsx`
- `frontend/src/pages/TreasuryWalletDetail.tsx`
- `frontend/src/pages/SquadsProposals.tsx`
- `frontend/src/pages/SquadsProposalDetail.tsx`
- `frontend/src/pages/OrganizationProposals.tsx`
- `frontend/src/ui/SquadsProposalCard.tsx`
- `frontend/src/lib/squads-pipeline.ts`

Important UI routes:

```text
/organizations/:organizationId/wallets
/organizations/:organizationId/wallets/:treasuryWalletId
/organizations/:organizationId/wallets/:treasuryWalletId/proposals
/organizations/:organizationId/wallets/:treasuryWalletId/proposals/:transactionIndex
/organizations/:organizationId/proposals
```

`signAndSubmitIntent` handles the repeated client-side pattern:

```text
backend intent -> Privy signing endpoint -> send raw transaction -> return signature
```

## Current End-To-End Testable Flow

```text
1. User A signs in.
2. User A creates org.
3. User A creates personal Privy wallet.
4. User A invites User B.
5. User B accepts invite.
6. User B creates personal Privy wallet.
7. User A creates Squads treasury with A/B as members, threshold 2.
8. User A opens treasury detail.
9. User A creates add-member proposal or threshold-change proposal.
10. User B sees proposal under Proposals.
11. User B approves.
12. Eligible executor executes.
13. Decimal syncs members from chain.
14. Treasury detail shows updated members/threshold.
```

## Next Multisig Work

The next major work is payment execution through Squads:

```text
Approved PaymentOrder
  -> create Squads vault transaction
  -> list payment proposals
  -> approve payment proposal
  -> execute payment proposal
  -> record execution signature
  -> Yellowstone observes transfer
  -> reconciliation matches by signature/order
  -> proof packet includes Squads governance evidence
```

This is the step that turns Squads from treasury setup into the actual payment rail.
