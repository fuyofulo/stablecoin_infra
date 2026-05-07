# Frontend Handoff: Generic Proposals + Squads Payment Proposals

Backend work is implemented for a generic Decimal proposal surface and Squads vault-payment proposal creation.

## New Concept

Decimal now has a persisted proposal record:

```ts
DecimalProposal {
  decimalProposalId: string
  provider: 'squads_v4'
  proposalType: 'config_transaction' | 'vault_transaction' | string
  proposalCategory: 'configuration' | 'execution' | string
  semanticType: 'add_member' | 'change_threshold' | 'send_payment' | string | null
  status: string              // live Squads status when available
  localStatus: string         // local DB status: prepared/submitted/executed/etc.
  squads: {
    programId: string | null
    multisigPda: string | null
    proposalPda: string | null
    transactionPda: string | null
    batchPda: string | null
    transactionIndex: string | null
    vaultIndex: number | null
  }
  voting: {
    threshold: number
    approvals: ProposalDecision[]
    rejections: ProposalDecision[]
    cancellations: ProposalDecision[]
    pendingVoters: ProposalPendingVoter[]
    canExecuteWalletAddresses: string[]
  } | null
  treasuryWallet: {...} | null
  paymentOrder: {...} | null
  semanticPayloadJson: object
  intentJson: object
}
```

Existing add-member/change-threshold flows now also return `decimalProposal`.

## New Endpoints

### List proposals

```http
GET /organizations/:organizationId/proposals
```

Query:

```ts
{
  status?: 'pending' | 'all' | 'closed'
  proposalType?: string
  treasuryWalletId?: string
  limit?: number
}
```

Use this for the main organization proposals page.

### Get one proposal

```http
GET /organizations/:organizationId/proposals/:decimalProposalId
```

Use this for a generic proposal detail page.

### Create a Squads payment proposal

```http
POST /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/vault-proposals/payment-intent
```

Body:

```ts
{
  paymentOrderId: string
  creatorPersonalWalletId: string
  memo?: string | null
  autoApprove?: boolean
}
```

Response:

```ts
{
  intent: {
    provider: 'squads_v4'
    kind: 'vault_payment_proposal_create'
    proposalType: 'vault_transaction'
    proposalCategory: 'execution'
    semanticType: 'send_payment'
    treasuryWalletId: string
    organizationId: string
    multisigPda: string
    transactionIndex: string
    squadsTransactionPda: string
    vaultTransactionPda: string
    proposalPda: string
    actions: Array<{ type: 'send_payment', ... }>
  }
  transaction: {
    encoding: 'base64'
    serializedTransaction: string
    requiredSigner: string
    recentBlockhash: string
    lastValidBlockHeight: number
  }
  decimalProposal: DecimalProposal
}
```

Frontend should:

1. Call this endpoint from a payment order detail page or payment proposal modal.
2. Sign `transaction.serializedTransaction` with `transaction.requiredSigner`.
3. Submit the signed transaction to Solana.
4. Call confirm-submission below with the submitted signature.
5. Refresh proposals and payment order detail.

### Confirm proposal creation submission

```http
POST /organizations/:organizationId/proposals/:decimalProposalId/confirm-submission
```

Body:

```ts
{ signature: string }
```

This records the creation transaction signature and changes local status to `submitted`.

### Approve any Decimal proposal

```http
POST /organizations/:organizationId/proposals/:decimalProposalId/approve-intent
```

Body:

```ts
{
  memberPersonalWalletId: string
  memo?: string | null
}
```

Response is the same signable transaction shape. Use the existing `signAndSubmitIntent` helper.

### Execute any Decimal proposal

```http
POST /organizations/:organizationId/proposals/:decimalProposalId/execute-intent
```

Body:

```ts
{ memberPersonalWalletId: string }
```

Works for:

- `config_transaction`
- `vault_transaction`

For vault transactions, backend builds the Squads `vaultTransactionExecute` instruction with lookup tables when needed.

After successful submission, call:

```http
POST /organizations/:organizationId/proposals/:decimalProposalId/confirm-execution
```

Body:

```ts
{ signature: string }
```

## Suggested UI Changes

### Payment order page

Add primary action when:

- payment order has `sourceTreasuryWallet.source === 'squads_v4'`
- payment order is approved/ready enough for execution
- current user owns a Squads member wallet with `initiate`

CTA:

```text
Create Squads proposal
```

This replaces the old mental model of “prepare execution packet” for Squads-sourced payments.

### Proposal pages

Use the new generic endpoints for:

- `/organizations/:organizationId/proposals`
- `/organizations/:organizationId/proposals/:decimalProposalId`

Show proposal type labels:

- `send_payment` -> Payment
- `add_member` -> Add member
- `change_threshold` -> Change threshold
- `config_transaction` fallback -> Treasury config
- `vault_transaction` fallback -> Treasury execution

### Proposal lifecycle display

Recommended linear states:

```text
Prepared -> Submitted -> Active/Approved -> Executed
```

Notes:

- `status` is live Squads status when backend can read on-chain proposal state.
- `localStatus` is Decimal's own record state.
- Prefer showing live `status` as the main badge and `localStatus` only in debug/metadata.

## Compatibility

Existing config proposal pages still work:

- `/squads/config-proposals`
- `/squads/config-proposals/:transactionIndex`

But new UI should gradually move to the generic `/proposals` endpoints.

