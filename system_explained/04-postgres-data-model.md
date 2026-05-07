# 04 Postgres Data Model

Postgres is Decimal's control plane. It stores identity, organization membership, personal wallets, treasury wallets, business intent, approvals, execution records, exception state, and proof-facing audit history.

The schema lives in `api/prisma/schema.prisma`.

## Current Scoping Rule

Decimal is organization-scoped.

```text
Organization
  -> members
  -> personal wallet authorizations
  -> treasury wallets
  -> destinations
  -> collection sources
  -> payments
  -> collections
  -> approvals
  -> reconciliation state
```

There is no active `Workspace` table. Older docs that describe `workspaceId` as the primary scope are stale.

## Identity And Organization Tables

### `Organization`

The top-level tenant.

Important fields:

- `organizationId`
- `organizationName`
- `status`
- timestamps

Owns:

- memberships
- invites
- treasury wallets
- counterparties
- destinations
- collection sources
- payment and collection objects
- transfer requests
- approvals
- execution records
- exception state

### `User`

Human account.

Important fields:

- `userId`
- `email`
- `displayName`
- `passwordHash?`
- `googleSubject?`
- `avatarUrl?`
- email verification fields
- `status`

Users own personal wallets and participate in organizations through `OrganizationMembership`.

### `AuthSession`

Bearer session token table.

Important fields:

- `authSessionId`
- `sessionToken`
- `organizationId?`
- `userId`
- `expiresAt`
- `lastSeenAt`

Every authenticated API request uses `Authorization: Bearer <session-token>`.

### `OrganizationMembership`

Join table between users and organizations.

Important fields:

- `membershipId`
- `organizationId`
- `userId`
- `role`
- `status`

Roles currently used by product logic:

- `owner`
- `admin`
- `member`

`owner` and `admin` can perform org-admin mutations. Some Squads proposal actions intentionally allow plain `member` because on-chain Squads permissions are the true authority.

### `OrganizationInvite`

Email-bound invitation into an organization.

Important fields:

- `organizationInviteId`
- `organizationId`
- `invitedEmail`
- `role`
- `inviteTokenHash`
- `status`
- `invitedByUserId`
- `acceptedByUserId?`
- `expiresAt`

Direct joining is blocked. A user joins an existing org by accepting an invite whose email matches their account.

## Wallet And Treasury Tables

### `PersonalWallet`

User-owned signing wallet.

Important fields:

- `userWalletId`
- `userId`
- `chain`
- `walletAddress`
- `walletType`
- `provider`
- `providerWalletId`
- `label`
- `status`
- `verifiedAt`
- `lastUsedAt`
- `metadataJson`

Important rule: a personal wallet is not organization treasury. It is a user's signer.

Current provider support:

- Privy embedded wallets.

Browser wallets existed in earlier flows, but current product direction is personal embedded wallets for members.

### `TreasuryWallet`

Organization-owned wallet or vault.

Important fields:

- `treasuryWalletId`
- `organizationId`
- `chain`
- `address`
- `assetScope`
- `usdcAtaAddress?`
- `isActive`
- `source`
- `sourceRef?`
- `displayName?`
- `notes?`
- `propertiesJson`

Manual treasury:

- `source = manual`
- `address = wallet public key`

Squads treasury:

- `source = squads_v4`
- `address = vault PDA`
- `sourceRef = multisig PDA`
- `propertiesJson.squads` stores program id, vault index, threshold, members, transaction index, and related metadata.

The Yellowstone worker treats treasury wallets as the "ours" set.

### `OrganizationWalletAuthorization`

Local authorization bridge between a personal wallet and an organization treasury.

Important fields:

- `walletAuthorizationId`
- `organizationId`
- `treasuryWalletId?`
- `userWalletId`
- `membershipId`
- `role`
- `status`
- `scope`
- `revokedAt?`
- `metadataJson`

For Squads, rows with `role = squads_member` mirror live on-chain multisig membership after `syncSquadsTreasuryMembers`.

This table does not grant on-chain power by itself. On-chain Squads membership is authoritative.

## Address Book Tables

### `Counterparty`

Optional business entity label.

Important fields:

- `counterpartyId`
- `organizationId`
- `displayName`
- `category`
- `externalReference?`
- `status`
- `metadataJson`

Counterparties can be attached to destinations or collection sources.

### `Destination`

External wallet the organization pays.

Important fields:

- `destinationId`
- `organizationId`
- `counterpartyId?`
- `chain`
- `asset`
- `walletAddress`
- `tokenAccountAddress?`
- `destinationType`
- `trustState`
- `label`
- `notes?`
- `isInternal`
- `isActive`
- `metadataJson`

Destinations are not treasury wallets. They are "theirs."

### `CollectionSource`

Expected payer wallet for inbound collections.

Important fields:

- `collectionSourceId`
- `organizationId`
- `counterpartyId?`
- `chain`
- `asset`
- `walletAddress`
- `tokenAccountAddress?`
- `sourceType`
- `trustState`
- `label`
- `notes?`
- `isActive`
- `metadataJson`

If a `CollectionRequest` references a `collectionSourceId`, matching is constrained to that payer.

## Business Intent Tables

### `PaymentRequest`

Input-layer object: "someone requested a payment."

Important fields:

- `paymentRequestId`
- `organizationId`
- `paymentRunId?`
- `destinationId`
- `counterpartyId?`
- `requestedByUserId?`
- `amountRaw`
- `asset`
- `reason`
- `externalReference?`
- `dueAt?`
- `state`
- `metadataJson`

Can be created manually, imported from CSV, or promoted into a `PaymentOrder`.

### `PaymentRun`

Batch container for payment requests and orders.

Important fields:

- `paymentRunId`
- `organizationId`
- `sourceTreasuryWalletId?`
- `runName`
- `inputSource`
- `state`
- `metadataJson`
- `createdByUserId?`

Used for payroll-like or vendor batch imports.

### `PaymentOrder`

Main outgoing payment control-plane object.

Important fields:

- `paymentOrderId`
- `organizationId`
- `paymentRequestId?`
- `paymentRunId?`
- `destinationId`
- `counterpartyId?`
- `sourceTreasuryWalletId?`
- `amountRaw`
- `asset`
- `memo?`
- `externalReference?`
- `invoiceNumber?`
- `attachmentUrl?`
- `dueAt?`
- `state`
- `sourceBalanceSnapshotJson`
- `metadataJson`
- `createdByUserId?`

Each submitted order projects into a `TransferRequest` for matching.

### `CollectionRequest`

Expected inbound payment.

Important fields:

- `collectionRequestId`
- `organizationId`
- `collectionRunId?`
- `transferRequestId`
- `receivingTreasuryWalletId`
- `collectionSourceId?`
- `payerWalletAddress?`
- `payerTokenAccountAddress?`
- `counterpartyId?`
- `amountRaw`
- `asset`
- `reason`
- `externalReference?`
- `dueAt?`
- `state`
- `createdByUserId?`
- `metadataJson`

Every collection creates a `TransferRequest` with `requestType = collection_request`.

### `CollectionRun`

Batch container for collection requests.

Important fields:

- `collectionRunId`
- `organizationId`
- `receivingTreasuryWalletId?`
- `runName`
- `inputSource`
- `state`
- `metadataJson`
- `createdByUserId?`

## Transfer, Approval, Execution, And Event Tables

### `TransferRequest`

Matcher-level expected transfer.

Important fields:

- `transferRequestId`
- `organizationId`
- `paymentOrderId?`
- `sourceTreasuryWalletId?`
- `destinationId?`
- `requestType`
- `asset`
- `amountRaw`
- `requestedByUserId?`
- `reason?`
- `externalReference?`
- `status`
- `requestedAt`
- `dueAt?`
- `propertiesJson`

For payments, destination side is expected.

For collections, receiving treasury wallet and optional payer fields are stored through `propertiesJson` and the related `CollectionRequest`.

### `ApprovalPolicy`

One policy per organization.

Important fields:

- `approvalPolicyId`
- `organizationId`
- `policyName`
- `isActive`
- `ruleJson`

Policy knobs live in `ruleJson`, including trusted-destination requirement and thresholds.

### `ApprovalDecision`

Append-only approval decision for a `TransferRequest`.

Important fields:

- `approvalDecisionId`
- `approvalPolicyId?`
- `transferRequestId`
- `organizationId`
- `actorUserId?`
- `actorType`
- `action`
- `comment?`
- `payloadJson`
- `createdAt`

### `ExecutionRecord`

Evidence that execution was prepared, submitted, observed, or failed.

Important fields:

- `executionRecordId`
- `transferRequestId`
- `organizationId`
- `submittedSignature?`
- `executionSource`
- `executorUserId?`
- `state`
- `submittedAt?`
- `metadataJson`

### Event And Note Tables

Append-only operational history:

- `TransferRequestEvent`
- `TransferRequestNote`
- `PaymentOrderEvent`
- `CollectionRequestEvent`
- `ExceptionState`
- `ExceptionNote`

Use these for timelines and audit views. Avoid rewriting history when a new event is more honest.

## Proof / Export Tables

`ExportJob` records proof/export activity where used.

Important fields:

- `exportJobId`
- `organizationId`
- `requestedByUserId?`
- `exportKind`
- `format`
- `status`
- `rowCount`
- `filterJson`

Proof packet contents are generated by services, not fully stored as one giant DB blob.

## Legacy Names To Avoid

- `Workspace`
- `workspaceId`
- `WorkspaceAddress`
- `Payee`

If these names appear in new code, stop and rename before continuing.
