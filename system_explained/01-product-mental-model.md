# 01 Product Mental Model

Decimal exists because crypto treasury operations have a gap between intent and on-chain reality.

A team says:

```text
Pay Fuyo LLC 100 USDC from the operations treasury.
```

Solana shows:

```text
A token account transferred raw USDC units in transaction X.
```

Decimal connects those worlds. It records the business intent, applies policy, prepares execution, observes settlement, reconciles what happened, and exports proof.

## The Current Product

Decimal is currently an organization-scoped Solana USDC operations product.

It can:

- Create users through email/password and Google OAuth.
- Create organizations.
- Invite members into organizations.
- Create user-owned personal wallets through Privy.
- Create organization treasury wallets.
- Create Squads v4 multisig treasury wallets.
- Add Squads members through on-chain config proposals.
- Change Squads threshold through on-chain config proposals.
- List, approve, and execute Squads config proposals.
- Sync Decimal's local member authorization state from the live Squads multisig.
- Create outgoing payments manually or through CSV.
- Create payment runs for batches.
- Prepare signer-ready Solana transactions.
- Record submitted signatures.
- Create inbound expected collections.
- Observe Solana USDC transfers through Yellowstone.
- Match observed transfers to expected payments or collections.
- Generate exceptions for mismatches.
- Export JSON proof packets.

The old workspace layer has been removed. The product now scopes operational state directly under `Organization`.

## Product Layers

### 1. Identity

Identity answers: **who is operating Decimal?**

Objects:

- `User`
- `AuthSession`
- `Organization`
- `OrganizationMembership`
- `OrganizationInvite`
- `PersonalWallet`

Important rule: a personal wallet belongs to an individual user, not to the organization.

### 2. Treasury Control

Treasury control answers: **who can control organization funds?**

Objects:

- `TreasuryWallet`
- `OrganizationWalletAuthorization`
- Squads v4 multisig account
- Squads v4 vault PDA
- Squads config proposals

Manual treasury wallets are organization-owned addresses registered in Decimal.

Squads treasury wallets are on-chain multisigs. Decimal stores the vault as a `TreasuryWallet`, but authority lives on-chain in the Squads program.

### 3. Business Intent

Business intent answers: **what did the organization intend to do?**

Objects:

- `Destination`
- `CollectionSource`
- `Counterparty`
- `PaymentRequest`
- `PaymentRun`
- `PaymentOrder`
- `CollectionRequest`
- `CollectionRun`

This layer should stay business-facing. Users should see names, reasons, references, destinations, sources, amounts, and due dates. They should not have to think about token accounts unless they explicitly inspect technical details.

### 4. Execution

Execution answers: **how does money move?**

Current execution model:

- Decimal prepares transactions.
- A personal wallet signs.
- The signed transaction is submitted.
- Decimal records submitted signatures.
- Yellowstone later observes chain reality.

Decimal does not custody private keys.

For normal payments, execution currently uses direct prepared USDC transfer transactions.

For Squads treasury management, execution uses Squads v4 instructions:

- create multisig
- create config transaction
- create proposal
- approve proposal
- execute config transaction

The next major product step is Squads-backed payment proposals: approved Decimal payment order -> Squads vault transaction -> voter approvals -> execute -> reconcile -> proof.

### 5. Verification And Proof

Verification answers: **did reality match intent?**

The worker observes USDC transfers and the reconciliation engine matches them to `TransferRequest`s.

Proof answers: **can we show what happened without trusting the UI?**

The proof packet is deterministic JSON. It includes the business intent, approval and execution evidence, settlement result, exceptions, and a SHA-256 digest over a canonical representation.

## What Decimal Is Not

Decimal is not currently:

- A bank.
- A fiat on/off-ramp.
- A payroll compliance system.
- A custody provider.
- A full ERP/AP suite.
- A generic wallet explorer.
- A protocol.

Decimal is currently closest to:

```text
Stablecoin operations control plane + reconciliation + proof layer,
with Squads-backed treasury control.
```

## What Feels Real Now

The strongest current product story is:

```text
Create org -> create personal wallet -> create Squads treasury ->
invite members -> add members / set threshold through Squads ->
create payment/collection intent -> reconcile settlement -> export proof.
```

The weakest current product story is payment execution through Squads. Membership and config governance exist, but outgoing payments are not yet routed through Squads vault proposals.

## Product Direction

The most important near-term direction is:

```text
Approved Decimal payment order
  -> Squads vault transaction proposal
  -> Squads approvals
  -> Squads execution
  -> Yellowstone observation
  -> signature-aware reconciliation
  -> proof packet with governance evidence
```

This path makes Decimal feel like it actually runs treasury operations rather than only observing them.

## Feature Test

Before adding any feature, ask:

- Does this make treasury control safer?
- Does this make execution more trustworthy?
- Does this make reconciliation more deterministic?
- Does this make proof more valuable?
- Does this reduce ambiguity for a human or future agent?

If not, it is probably not priority work.
