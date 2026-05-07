# 09 Frontend Application

The frontend lives in `frontend/`. It is a Vite + React + TypeScript app using React Router and TanStack Query.

It talks to the API only. It does not access Postgres or ClickHouse directly.

## Current Shape

Important files:

- `frontend/src/App.tsx` — route table, auth gate, setup flow, shared layout.
- `frontend/src/Sidebar.tsx` — organization switcher, nav groups, theme toggle.
- `frontend/src/api.ts` — typed HTTP client.
- `frontend/src/types.ts` — frontend domain/API types.
- `frontend/src/public-config.ts` — browser-safe config.
- `frontend/src/domain.ts` — formatting, explorer URLs, wallet helpers.
- `frontend/src/lib/squads-pipeline.ts` — sign/submit helper for Squads transaction intents.
- `frontend/src/ui/Toast.tsx` — toast provider.
- `frontend/src/ui/SquadsProposalCard.tsx` — reusable proposal card for treasury and org proposal pages.
- `frontend/src/pages/*.tsx` — top-level pages.

## Current Route Shape

Active routes are organization-scoped:

```text
/organizations/:organizationId/...
```

The old `/workspaces/:workspaceId/...` frontend route shape is stale.

## Main Pages

### Landing

Files:

- `frontend/src/pages/Landing.tsx`
- `frontend/src/pages/landing/*`

Public marketing page.

### Auth / Setup / Profile

Files:

- `frontend/src/App.tsx`
- profile/setup components inside the current route shell

Supports:

- login
- Google OAuth redirect flow
- organization creation
- profile
- personal wallet creation/management

### Wallets

File: `frontend/src/pages/Wallets.tsx`

Purpose:

- list organization treasury wallets
- add existing/manual treasury address
- create Squads treasury

Squads treasury creation supports:

- choosing creator personal wallet
- choosing multiple org member personal wallets
- toggling member permissions
- selecting threshold
- preparing a Squads create transaction
- signing/submitting through Privy
- confirming/persisting the treasury in Decimal

### Treasury Wallet Detail

File: `frontend/src/pages/TreasuryWalletDetail.tsx`

Purpose:

- view manual treasury details
- view Squads treasury configuration
- view Squads members
- sync Squads members from chain
- create add-member config proposals
- create change-threshold config proposals
- navigate to proposal pages

For Squads treasuries, this page shows:

- vault PDA
- multisig PDA
- vault index
- threshold
- time lock
- authority
- transaction index
- program id
- member table
- member link status
- member permissions

### Squads Proposals

Files:

- `frontend/src/pages/SquadsProposals.tsx`
- `frontend/src/pages/SquadsProposalDetail.tsx`
- `frontend/src/pages/OrganizationProposals.tsx`
- `frontend/src/ui/SquadsProposalCard.tsx`

Routes:

```text
/organizations/:organizationId/wallets/:treasuryWalletId/proposals
/organizations/:organizationId/wallets/:treasuryWalletId/proposals/:transactionIndex
/organizations/:organizationId/proposals
```

Purpose:

- list pending/all/closed Squads config proposals
- show proposal actions
- show approval progress
- show pending voters
- approve proposal if current user owns a pending voter wallet
- execute proposal if threshold is met and current user owns an execute-capable wallet
- sync members after execution

### Payments

Files:

- `frontend/src/pages/Payments.tsx`
- `frontend/src/pages/PaymentDetail.tsx`
- `frontend/src/pages/PaymentRunDetail.tsx`

Purpose:

- single payments
- CSV payment imports
- payment runs
- payment lifecycle
- signing prepared payment transactions
- proof export

### Collections

Files:

- `frontend/src/pages/Collections.tsx`
- `frontend/src/pages/CollectionDetail.tsx`
- `frontend/src/pages/CollectionRunDetail.tsx`
- `frontend/src/pages/CollectionSources.tsx`

Purpose:

- expected inbound payments
- collection source registry
- collection run CSV imports
- collection proof export

### Registry / Policy / Exceptions / Proofs / Execution / Settlement

Files vary across extracted pages and legacy inline sections in `App.tsx`.

Purpose:

- manage counterparties/destinations
- view approval policy
- approve/reject work
- track execution
- track settlement/reconciliation
- resolve exceptions
- export proof packets

## Squads Frontend Pipeline

Most Squads action buttons follow this pattern:

```text
1. Call backend intent endpoint.
2. Backend returns serialized versioned transaction.
3. Frontend calls personal wallet signing endpoint.
4. Frontend sends raw transaction.
5. Frontend refreshes proposal/detail queries.
6. If execution changed membership, call sync-members.
```

Shared helper:

```text
frontend/src/lib/squads-pipeline.ts
```

Do not duplicate sign/submit logic in every page.

## State Management

The frontend uses TanStack Query.

Rules:

- GETs use `useQuery`.
- Mutations use `useMutation`.
- On success, invalidate exact query families.
- Avoid optimistic updates for treasury/money flows.
- Let the backend and chain be the source of truth.

Important query families:

- `['treasury-wallets', organizationId]`
- `['treasury-wallet-detail', organizationId, treasuryWalletId]`
- `['squads-config-proposals', organizationId, treasuryWalletId]`
- `['organization-squads-proposals', organizationId]`
- `['personal-wallets']`
- `['organization-personal-wallets', organizationId]`

## Design System

The frontend uses an institutional dual-theme design system.

Important style files:

- `frontend/src/styles/design-tokens.css`
- `frontend/src/styles/canonical.css`
- `frontend/src/styles/run-detail.css`
- `frontend/src/styles/sidebar.css`
- `frontend/src/styles/app-dark.css`
- `frontend/src/styles.css`

Brand source of truth:

- `brand.md`

Rules:

- Use `--ax-*` tokens.
- Avoid hard-coded colors.
- Prefer reusable patterns over one-off inline UI.
- Keep tables dense and scannable.
- Money/status/proposal pages should prioritize clarity over visual novelty.

## Current UI Debt

- Some legacy page code still lives inside `App.tsx`.
- Some screens still use older `.panel` / `.data-table` classes.
- Squads flows are functional but need UX polish after backend features stabilize.
- Payments are not yet executed through Squads proposals.

## Safe Frontend Change Rule

Before changing a flow involving funds or treasury authority, identify:

- backend endpoint called
- signer wallet used
- transaction intent returned
- chain signature submitted
- query invalidations after success
- what happens on partial failure

If the UI hides any of these, it is too magical.
