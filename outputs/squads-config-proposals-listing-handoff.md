# Backend Handoff: Squads Config-Proposal Listing + Voter-Scoped Gates

Owner: codex / backend
Frontend status: blocked until this lands
Scope: enable a "Pending proposals" page so non-admin Squads voters can find proposals that need their signature, then approve/execute.

## Context

We've already shipped:

- `POST .../squads/config-proposals/add-member-intent`
- `POST .../squads/config-proposals/change-threshold-intent`
- `POST .../squads/config-proposals/:transactionIndex/approve-intent`
- `POST .../squads/config-proposals/:transactionIndex/execute-intent`
- `POST .../squads/sync-members`
- `GET  .../squads/detail`

A user creating a 2-of-2 add-member proposal hits "awaiting more approvals" and the dialog stops. The other Squads voter has nowhere in the UI to find that proposal. `/squads/detail` only surfaces the latest `transactionIndex` — it doesn't enumerate pending proposals or expose the proposal's approval state.

## Changes Needed

### 1. New endpoint: list config proposals

```http
GET /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals
```

Optional query params:

- `status`: `pending` (default — `Active` or `Approved` proposals that haven't been `Executed` or `Cancelled`), `all`, `closed` (Executed / Cancelled / Rejected).
- `limit`: cap, default 50.

Response shape:

```ts
type SquadsConfigProposal = {
  transactionIndex: string;            // bigint as string
  configTransactionPda: string;
  proposalPda: string;
  status:
    | 'active'
    | 'approved'
    | 'executed'
    | 'cancelled'
    | 'rejected'
    | 'draft';                         // mirror Squads SDK ProposalStatus
  threshold: number;                   // current multisig threshold (snapshot)
  staleTransactionIndex: string;       // current multisig staleTransactionIndex
  actions: Array<                      // same serialization we already use
    | { kind: 'add_member'; walletAddress: string; permissionsMask: number; permissions: SquadsPermission[] }
    | { kind: 'remove_member'; walletAddress: string }
    | { kind: 'change_threshold'; newThreshold: number }
    | { kind: string }
  >;
  approvals: Array<{
    walletAddress: string;
    decidedAtSlot?: number | null;     // if cheaply available; else null
    personalWallet: { userWalletId: string; userId: string; label: string | null } | null;
    organizationMembership: {
      membershipId: string;
      role: string;
      user: { userId: string; email: string; displayName: string; avatarUrl: string | null };
    } | null;
  }>;
  rejections: Array<{ walletAddress: string; ...same linkage }>;
  cancellations: Array<{ walletAddress: string; ...same linkage }>;
  pendingVoters: Array<{               // voters who haven't approved/rejected
    walletAddress: string;
    permissions: SquadsPermission[];
    personalWallet: { ... } | null;
    organizationMembership: { ... } | null;
  }>;
  canExecuteWalletAddresses: string[]; // members with execute permission
  createdAtSlot: number | null;        // slot when ConfigTransaction was created
  // The frontend will derive thresholdMet = approvals.length >= threshold
  // and isStale = BigInt(transactionIndex) <= BigInt(staleTransactionIndex).
};

type Response = { items: SquadsConfigProposal[] };
```

Implementation sketch:

1. Load multisig (use existing `loadSquadsTreasury` helper).
2. Walk `index` from `staleTransactionIndex + 1n` through `transactionIndex` (descending preferred so newest first).
3. For each `index`:
   - Derive `proposalPda` and `configTransactionPda`.
   - Try `multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda)` — if account doesn't exist (e.g., proposal never created or already cleaned up), skip silently.
   - Try `multisig.accounts.ConfigTransaction.fromAccountAddress(...)` to read the actions.
   - Map `Proposal.status.__kind` to lowercase (`active` / `approved` / `executed` / `cancelled` / `rejected` / `draft`).
   - Approvals/rejections/cancellations come straight off the Proposal account.
4. Filter by `status` query param.
5. Compute `pendingVoters` by diffing the current multisig members (with `vote` permission) minus addresses that appear in `approvals`/`rejections`.
6. Reuse the existing `loadDetailedMembersByWalletAddresses` helper to attach Decimal linkage to each address.

Performance note: walking up to `(transactionIndex - staleTransactionIndex)` chain reads is fine for our scale (proposals get cancelled/cleaned up regularly). If this ever grows large, cap with a `limit` param walking from newest backward.

### 2. Visibility gate

The user's product call: **a proposal is only visible to users whose personal wallet is one of the on-chain Squads members of that treasury**. This is stricter than `assertOrganizationAccess`.

Helper to add (or inline in the route):

```ts
// Resolve the actor's active personal wallets. Cross-reference with the
// current multisig members. Throw 403 if there's no overlap.
async function assertSquadsMembership(
  organizationId: string,
  treasuryWalletId: string,
  actor: AuthContext,
): Promise<{ memberAddresses: string[] }>;
```

Apply this gate to:

- `GET .../squads/config-proposals` (the new listing endpoint).
- Optionally also a new single-proposal detail endpoint (see §4).

If the actor isn't a Squads member, return `403 forbidden` with code `not_squads_member` and message `"You're not a member of this Squads treasury."`. The frontend will hide the page in that case.

### 3. Relax approve / execute gates

Currently:

```ts
treasuryWalletsRouter.post(
  '.../squads/config-proposals/:transactionIndex/approve-intent',
  asyncRoute(async (req, res) => {
    ...
    await assertOrganizationAdmin(organizationId, req.auth!);
    ...
```

A 2-of-N where one voter is a regular org `member` literally cannot approve — they hit 403 before the handler even checks Squads membership. Change to `assertOrganizationAccess` so the existing in-handler `assertOnchainMemberPermission` can do the real gate (membership in the on-chain multisig + correct permission).

Same change for `execute-intent`.

This is **safe** because:

- The handler already loads the actor's personal wallet via `loadActorPersonalWallet`, which validates ownership.
- `assertOnchainMemberPermission` rejects unless the wallet has the required Squads permission (`vote` for approve, `execute` for execute). A non-admin who isn't an on-chain voter still can't approve.
- Non-org-members already can't reach the route (`requireAuth` + `assertOrganizationAccess` ensures the actor is in the org).

`add-member-intent`, `change-threshold-intent`, and `sync-members` should stay admin-only. Initiating a config change is still an admin action.

### 4. (Nice to have) Single-proposal detail endpoint

```http
GET /organizations/:organizationId/treasury-wallets/:treasuryWalletId/squads/config-proposals/:transactionIndex
```

Returns one `SquadsConfigProposal` from §1. Same Squads-member gate. Frontend will use this for a deep-link `/proposals/:transactionIndex` view, but it's optional — the listing endpoint plus a frontend filter would also work.

### 5. Tests

Extend `api/tests/control-plane.test.ts`:

- After creating an add-member proposal in a 2-of-2 multisig, listing returns one `active` proposal with both voters — one in `approvals` (the creator), one in `pendingVoters`.
- A regular `member` user whose personal wallet is on the multisig can call approve-intent (no admin role needed).
- A user with no personal wallet on the multisig calling the listing endpoint gets `403 not_squads_member`.
- After all approvals + execute land and we re-stub the on-chain state, listing the same `transactionIndex` returns `executed`.

## Frontend Plan (after backend lands)

For your awareness — the frontend will:

- Add route `/organizations/:organizationId/wallets/:treasuryWalletId/proposals`.
- Add a "Proposals" link in the detail-page header (only when the current user is a Squads member, derived from `/squads/detail.members[*].personalWallet.userId === session.user.userId`).
- The page lists pending proposals with: actions summary, approvals progress (`X of Y` plus per-voter avatars/state), and an "Approve" button when the current user is a `pendingVoter`, or "Execute" when threshold is met and the current user has `execute` permission.
- Approve / execute reuse the existing intent → sign → submit pipeline.
- After execute lands, auto-trigger `sync-members`.

## Out of Scope

- Local DB persistence of proposals. We can add it later if chain reads get slow; for now read live.
- Cancel-proposal flow. Defer.
- Proposal expiry / cleanup. Squads handles this via `staleTransactionIndex`; the listing endpoint reads it.
