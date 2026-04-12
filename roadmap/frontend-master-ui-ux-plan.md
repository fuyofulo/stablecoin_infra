# Frontend Master UI/UX Plan

Date: 2026-04-13

## Purpose

This document is the frontend redesign contract before implementation.

The goal is not to "make the app prettier." The goal is to redesign the product journey so the UI feels like institutional finance operations software:

- clear entry point
- clear workflow
- one place per job
- separate pages for durable business objects
- fewer modals for core work
- consistent visual language
- proof-first payment operations

Implementation should not start until this document is treated as the source of truth for the next frontend pass.

## Product UI Thesis

The product should feel like:

> A stablecoin payment control room where an operator starts from real payment requests, controls execution, watches settlement, resolves exceptions, and exports proof.

It should not feel like:

- a terminal skin
- a crypto explorer
- a developer admin panel
- a pile of tables and modals
- an expected-transfer CRUD app

## Visual Reference

Primary reference:

- `https://altitude.xyz/`

Altitude is useful because it sits close to the category we care about: stablecoin-native finance operations. The reference should guide the mood and visual system, not the exact marketing-page structure.

Observed direction from Altitude:

- typography: `Geist`
- base surface: white
- text: black with opacity-based hierarchy
- action accent: orange, approximately `#ff7300`
- border system: very low opacity black, approximately `#0000000d`
- buttons: pill-shaped, compact, 12px medium text
- content surfaces: rounded, calm, low-chrome
- copy style: direct finance operations language
- motion: subtle reveal/progress behavior, not decorative animation

Important constraint:

- Do not copy Altitude assets, logo, imagery, or page sections.
- Use the design language as reference for our app UI.
- Product surfaces should be denser and more operational than a landing page.

## Core User

Primary user:

- finance, treasury, or operations operator at a crypto-native team already moving stablecoins

They are trying to answer:

- what needs my attention right now?
- what payments are waiting for approval?
- what payments are ready to execute?
- what payment runs are in flight?
- did settlement match what we intended?
- what exceptions need review?
- can I export proof for this payment or batch?

They should not need to understand:

- internal transfer request lifecycle jargon
- matcher internals
- ClickHouse / worker internals
- every low-level status at once
- where an expected transfer lives relative to a payment order

## Product Journey

The redesigned UI should organize the app around this sequence:

1. Intake
2. Review
3. Approval
4. Execution
5. Settlement
6. Reconciliation
7. Exception resolution
8. Proof export

User-facing language:

- `Payment request`: the business input.
- `Payment run`: a batch of payment requests, usually from CSV.
- `Payment`: the controlled individual order that goes through approval, execution, settlement, and proof.
- `Approval`: policy and human decision.
- `Execution`: transaction preparation, signing, submitted signature, external proposal, or handoff evidence.
- `Settlement`: what the chain observed.
- `Exception`: what needs review.
- `Proof`: exportable packet showing the full story.

Internal terms that should be hidden or heavily de-emphasized:

- `expected transfer`
- `transfer request`
- `matcher event`
- `FIFO allocator`
- `workspace address id`
- `payment_order_id`
- raw lifecycle states unless presented as operator-readable status

## Current UX Problems

Current problems to fix:

- Core work happens through large modals instead of durable pages.
- Payment requests, payment orders, payment runs, expected transfers, reconciliation rows, and exceptions are too close together visually.
- The user sees multiple status dimensions at once without a clear primary progress path.
- Payment runs do not yet feel like a guided batch workflow.
- Detail views show too much raw backend truth in one vertical dump.
- Navigation is workspace-feature based, not job based.
- Dashboard does not strongly answer "what should I do next?"
- Proof export exists, but does not feel like a first-class product outcome.
- Address book is improved, but it still belongs under settings/supporting data, not the main payment workflow.

## Information Architecture

The app should use this top-level structure inside a workspace:

- `Command Center`
- `Payment Runs`
- `Payments`
- `Approvals`
- `Execution`
- `Settlement`
- `Exceptions`
- `Proofs`
- `Address Book`
- `Policy`
- `Ops Health`

### Command Center

Purpose:

- Give the operator a daily working surface.

Primary action:

- Start a new payment run or payment request.

Must show:

- approvals waiting
- payments ready to execute
- submitted but unsettled payments
- open exceptions
- recent completed payments
- worker/settlement health only if degraded

Must not show:

- all raw observed transfers by default
- all destination registry details
- long timeline logs

### Payment Runs

Purpose:

- Manage batch imports and batch execution.

Primary action:

- Import CSV batch.

List columns:

- run name
- total amount
- item count
- ready / blocked / completed counts
- approval state
- execution state
- settlement state
- created at

Row click:

- navigates to the run page, not a modal.

### Payment Run Page

Route target:

- `/workspaces/:workspaceId/runs/:paymentRunId`

Purpose:

- Make a batch feel like a coherent workflow.

Header:

- run name
- total amount
- item count
- primary state
- created by / created at
- actions: prepare batch, sign and submit, export proof

Main layout:

- top workflow rail: `Imported -> Reviewed -> Approved -> Prepared -> Submitted -> Settled -> Proven`
- left/main: payment item table
- right/sidebar: run summary and blockers

Payment item table columns:

- payee
- destination
- amount
- reference
- approval
- execution
- settlement
- proof

Row click:

- navigates to the individual payment page.

Do not open a nested modal for a payment inside a run.

### Payments

Purpose:

- Manage all individual payments, whether created manually or from a run.

Primary action:

- New payment request.

Secondary action:

- Import CSV batch.

List columns:

- payee
- amount
- source wallet
- destination
- reference
- due date
- primary state
- next action

Row click:

- navigates to payment page.

### Payment Page

Route target:

- `/workspaces/:workspaceId/payments/:paymentOrderId`

Purpose:

- One durable page for one payment.

This replaces the oversized payment detail modal.

Header:

- payee or destination label
- amount
- reference / memo
- primary state
- actions: submit for approval, approve/reject, prepare transaction, sign/submit, export proof

Top visual summary:

- amount
- source wallet
- destination wallet
- submitted signature if present
- relative time with absolute tooltip

Use compact address formatting:

- `PGm4dk...BVcFMW`
- click copies address
- secondary icon opens explorer
- full address in tooltip

Main workflow rail:

- `Request -> Approval -> Execution -> Settlement -> Proof`

The rail should show one primary current state, not four competing statuses.

Sections:

- `Request`: payee, memo, reference, due date, source, destination
- `Approval`: policy decision, approver, reasons only if review was required
- `Execution`: prepared packet, signer, submitted signature, external proposal, wallet-adapter status
- `Settlement`: observed signature(s), observed amount, match result
- `Exceptions`: only if present
- `Timeline`: compact audit events
- `Notes`: below timeline
- `Proof`: export packet status and download action

Section behavior:

- Critical sections are expanded by default.
- Low-frequency detail sections can be collapsible.
- Collapsible sections must have a clear right-aligned chevron.
- Content should have top and bottom padding; no content should touch the header border.

### Approvals

Purpose:

- Queue for human approval decisions.

Primary action:

- approve or reject selected request/payment.

List columns:

- payee
- amount
- source
- destination trust
- reason approval is required
- requested by
- age

Row click:

- navigates to the payment page with the approval section anchored.

### Execution

Purpose:

- Queue for payments that can move money but are not settled yet.

Primary action:

- prepare, sign, submit, or attach evidence.

List groupings:

- needs source wallet
- approved and ready to prepare
- prepared and waiting for signature
- submitted and waiting for settlement
- failed or needs execution review

This page makes execution feel real without turning the app into a custody product.

### Settlement

Purpose:

- Show chain truth and reconciliation state.

Primary action:

- inspect unmatched or delayed settlement.

Default view:

- payment-centric, not raw transfer-centric.

Secondary tab:

- observed USDC movement for debugging.

Raw observed transfers should not dominate the primary workspace.

### Exceptions

Purpose:

- Resolve operational problems.

List columns:

- severity
- payment/payee
- exception type
- amount
- observed signature
- owner
- age
- status

Row click:

- navigate to exception page or open a focused drawer.

Resolution actions:

- mark reviewed
- dismiss expected
- reopen
- add note
- export proof after resolution

### Proofs

Purpose:

- Make verification a first-class user-facing artifact.

Primary views:

- recent proof packets
- payment proof
- run proof
- exception export

Proof packet sections:

- intent
- approval
- execution
- settlement
- reconciliation
- exception resolution
- timeline

The proof page should be readable by someone who never used the product.

### Address Book

Purpose:

- Manage support data: wallets, destinations, counterparties/payees.

This page should remain separate from the main payment workflow.

Primary objects:

- destinations
- wallets
- payees/counterparties

Table behavior:

- all tables use the same density, row height, hover treatment, and action pattern.
- clicking a row opens a detail page or drawer.
- add actions live in each section header.

### Policy

Purpose:

- Define approval rules.

Structure:

- external payments
- internal payments
- destination trust rules
- threshold rules

Do not show a giant policy form by default.

Default:

- read-only strategy summary cards
- edit via focused panel/modal

### Ops Health

Purpose:

- Keep infrastructure visible without distracting operators.

Default:

- healthy state is quiet.
- degraded state appears on Command Center and Ops Health.

Show:

- worker status
- latest slot
- ingestion freshness
- chain-to-match latency
- open exceptions

Do not make ops health part of the daily payment flow unless there is a problem.

## Route Model

Target routes:

- `/dashboard`
- `/organizations`
- `/organizations/:organizationId`
- `/workspaces/:workspaceId`
- `/workspaces/:workspaceId/runs`
- `/workspaces/:workspaceId/runs/:paymentRunId`
- `/workspaces/:workspaceId/payments`
- `/workspaces/:workspaceId/payments/:paymentOrderId`
- `/workspaces/:workspaceId/approvals`
- `/workspaces/:workspaceId/execution`
- `/workspaces/:workspaceId/settlement`
- `/workspaces/:workspaceId/exceptions`
- `/workspaces/:workspaceId/exceptions/:exceptionId`
- `/workspaces/:workspaceId/proofs`
- `/workspaces/:workspaceId/registry`
- `/workspaces/:workspaceId/policy`
- `/workspaces/:workspaceId/ops`

Migration rule:

- Existing modal detail flows should be converted into durable detail routes.
- Modals should remain for short creation/edit flows only.
- Batch and payment detail must not live inside modals.

## Visual System

### Visual Thesis

Institutional, sparse, calm, and high-trust.

The product should use a white-first finance UI with black text, muted gray hierarchy, orange action accents, and carefully controlled density. Dark mode can exist later, but the primary design direction should be light-mode first.

### Font

Use:

- `Geist`

Fallback:

- `Inter`, `ui-sans-serif`, `system-ui`, `sans-serif`

Implementation note:

- Use a local or package-based Geist import if licensing and dependency setup are acceptable.
- Do not depend on Altitude-hosted font files.

### Color Tokens

Light mode:

```css
:root {
  --bg: #ffffff;
  --bg-subtle: #fafafa;
  --surface: #ffffff;
  --surface-muted: #f7f7f5;
  --text: #000000;
  --text-muted: rgba(0, 0, 0, 0.5);
  --text-soft: rgba(0, 0, 0, 0.7);
  --border: rgba(0, 0, 0, 0.05);
  --border-strong: rgba(0, 0, 0, 0.1);
  --accent: #ff7300;
  --accent-hover: #e86700;
  --success: #167a4a;
  --warning: #b86b00;
  --danger: #b14a47;
  --info: #3564a8;
}
```

Dark mode, if kept:

```css
[data-theme='dark'] {
  --bg: #070707;
  --bg-subtle: #0d0d0d;
  --surface: #101010;
  --surface-muted: #161616;
  --text: #ffffff;
  --text-muted: rgba(255, 255, 255, 0.52);
  --text-soft: rgba(255, 255, 255, 0.72);
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.14);
  --accent: #ff7300;
  --accent-hover: #ff8b2a;
  --success: #42b883;
  --warning: #d89614;
  --danger: #df6b66;
  --info: #79a7ff;
}
```

### Typography Scale

Use fewer sizes.

- page title: 32px / 38px, weight 500
- section title: 24px / 29px, weight 500
- panel title: 20px / 24px, weight 500
- table header: 12px / 14px, weight 500, uppercase optional only for small labels
- body: 14px / 18px, weight 400
- dense body: 13px / 16px, weight 400
- small/meta: 12px / 14px, weight 500
- number emphasis: 28px / 34px, weight 500

Avoid:

- monospaced font for general UI
- all-caps labels everywhere
- huge detail-page titles that push useful content below the fold

### Spacing Scale

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
--space-7: 48px;
--space-8: 64px;
```

Rules:

- page gutters: 32px desktop, 24px tablet, 16px mobile
- table cell x padding: 16px
- table row height: 56px to 68px
- panel padding: 24px or 32px
- modal/drawer padding: 32px desktop, 20px mobile
- section gap: 24px

### Radius

Use consistent rounded institutional surfaces:

- buttons: 42px
- input: 16px or 24px depending height
- panels: 24px
- tables: 20px outer shell, 0px internal cells
- badges: 999px

If the UI starts to feel too soft, reduce panels to 16px but keep the system consistent.

### Buttons

Primary:

- black background, white text
- hover orange
- height 36px to 40px

Secondary:

- white background
- low-opacity border
- black text
- hover subtle surface or orange border

Danger:

- muted red text/border
- filled red only for destructive confirmation

Button copy:

- use verbs: `Approve`, `Prepare`, `Sign and submit`, `Export proof`
- avoid vague labels: `Submit`, `Save metadata`, `Move state`

### Tables

Tables are core to the product.

Requirements:

- consistent row height
- clear header hierarchy
- low-opacity grid lines
- no heavy full-cell borders
- row hover with subtle background
- selected row state if using split view
- dense but readable status badges
- sticky header for long lists where useful
- empty state in the table body, not floating above the table

Table row click:

- open durable detail route for primary objects
- only use buttons for secondary row actions

### Status Badges

Status language should be outcome-oriented.

Preferred primary payment statuses:

- `Draft`
- `Needs approval`
- `Approved`
- `Ready to sign`
- `Submitted`
- `Settling`
- `Completed`
- `Partial`
- `Needs review`
- `Cancelled`

Avoid showing:

- `ready_for_execution`
- `submitted_onchain`
- `matched_split`
- `payment_book_fifo_allocator`

Low-level values can appear in technical detail sections only.

### Workflow Rail

Use a reusable workflow component:

```text
Request -> Approval -> Execution -> Settlement -> Proof
```

Each step needs:

- label
- state: pending, current, complete, blocked
- short subtext

For a batch:

```text
Imported -> Reviewed -> Approved -> Prepared -> Submitted -> Settled -> Proven
```

### Cards and Panels

Use panels only when they create real grouping.

Avoid:

- dashboard card mosaics
- boxes inside boxes
- one-card-per-field detail views

Prefer:

- plain page sections
- two-column detail grids
- quiet dividers
- large primary content with one supporting side panel

### Forms

Creation flow should feel guided.

New payment request form:

- payee
- destination
- amount
- source wallet
- reference
- due date
- memo

CSV import form:

- upload or paste
- preview rows
- validation results
- unresolved destinations
- create run

Do not immediately create everything from pasted CSV without a review step in the final UX.

### Empty States

Empty states should say:

- what is empty
- why it matters
- the next action

Example:

> No payment runs yet. Import a CSV to create a batch, review destinations, and prepare one execution packet.

Avoid:

- "No data"
- "No entries"

## Key Wireframes

### Command Center

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Command Center                                      New payment  Import CSV│
│ Today’s payment work across approvals, execution, settlement, and proof. │
├──────────────────────────────────────────────────────────────────────────┤
│ Needs approval   Ready to sign   Waiting settlement   Exceptions         │
│ 04               08              03                   02                 │
├───────────────────────────────┬──────────────────────────────────────────┤
│ Action queue                  │ Latest proof-ready payments              │
│ payee / amount / next action  │ payment / status / export                │
│ ...                           │ ...                                      │
├───────────────────────────────┴──────────────────────────────────────────┤
│ Recent payment runs                                                      │
│ run / count / amount / progress / next action                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### Payment Runs List

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Payment Runs [12]                         Search runs     Import CSV     │
├──────────────────────────────────────────────────────────────────────────┤
│ Run name        Items   Amount       Progress       Exceptions   Created  │
│ Payroll Apr 15  42      12,400 USDC  34/42 settled  2            Apr 15   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Payment Run Page

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Payroll Apr 15                     42 payments / 12,400 USDC / Partial   │
│ Imported -> Reviewed -> Approved -> Prepared -> Submitted -> Settled      │
│                                            Prepare batch   Export proof   │
├─────────────────────────────────────────────────┬────────────────────────┤
│ Payee        Amount      Reference   Status     │ Run summary            │
│ Fuyo LLC     100 USDC    INV-102     Completed  │ Source wallet          │
│ Beta Supply  250 USDC    INV-103     Needs sign │ Blockers               │
│ ...                                             │ Settlement stats       │
└─────────────────────────────────────────────────┴────────────────────────┘
```

### Payment Page

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Fuyo LLC                                  100 USDC        Completed       │
│ INV-102 / Contractor payout / Due Apr 15                                  │
│ Request -> Approval -> Execution -> Settlement -> Proof                   │
├──────────────────────────────────────────────────────────────────────────┤
│ Amount        Source             Destination            Time              │
│ 100 USDC      Ops Vault          Fuyo wallet            3 min ago         │
│ Signature     5EKmNe...UXuy      Copy / Explorer                          │
├──────────────────────────────────────────┬───────────────────────────────┤
│ Settlement                               │ Actions                       │
│ observed signature / matched amount      │ export proof                  │
│                                          │ open explorer                 │
├──────────────────────────────────────────┴───────────────────────────────┤
│ Approval                                                                  │
│ Execution                                                                 │
│ Exceptions                                                                │
│ Timeline                                                                  │
│ Notes                                                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Exceptions

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Exceptions [2]                          Severity  Owner  Status          │
├──────────────────────────────────────────────────────────────────────────┤
│ Severity   Payment       Type                Amount      Age     Owner    │
│ warning    Fuyo LLC      Partial settlement  50 USDC     12m     Unassigned│
└──────────────────────────────────────────────────────────────────────────┘
```

## Component System To Build First

Before rebuilding pages, create reusable components:

- `AppShell`
- `WorkspaceNav`
- `PageHeader`
- `ActionBar`
- `MetricStrip`
- `DataTable`
- `StatusBadge`
- `WorkflowRail`
- `AddressLink`
- `AmountText`
- `TimeText`
- `EmptyState`
- `InfoSection`
- `CollapsibleSection`
- `DetailHeader`
- `ProofSummary`
- `Modal`
- `Drawer`
- `FormField`
- `SelectField`
- `CSVPreviewTable`

Implementation rule:

- Build these once and reuse.
- Do not keep adding page-specific table markup.
- Do not create one-off status badge classes per page.

## Implementation Sequence

### Pass 1: Design Foundation

Build:

- CSS tokens
- typography reset
- button styles
- table styles
- status badges
- shell layout
- page header
- workflow rail
- address/time/amount primitives

No business page should be rewritten until these are ready.

### Pass 2: Routing And Object Pages

Add durable routes:

- payment run detail page
- payment detail page
- exception detail route if needed

Replace payment and run modals with pages.

### Pass 3: Command Center

Rebuild workspace home around action queues:

- approvals waiting
- execution ready
- settlement pending
- exceptions
- proof-ready payments

### Pass 4: Payment Runs

Rebuild batch workflow:

- list
- detail page
- CSV import with preview
- batch execution section
- proof export

### Pass 5: Payments

Rebuild individual workflow:

- list
- detail page
- payment progress rail
- execution packet area
- settlement area
- proof area

### Pass 6: Approvals, Execution, Settlement, Exceptions

Split current mixed surfaces into job-specific queues.

Do not add new backend behavior unless the frontend exposes a true missing API.

### Pass 7: Address Book, Policy, Ops

Make support pages consistent with the new visual system.

Address book should no longer define the visual language; it should inherit it.

## Acceptance Criteria

The redesign is acceptable when:

- an operator can start from Command Center and know what to do next in 10 seconds
- a batch payment run has its own page
- each payment has its own page
- payment detail no longer depends on a large modal
- status language is human-readable
- proof export is visible as a product outcome
- raw expected-transfer details are hidden unless inspecting technical detail
- all primary tables share one table system
- all primary status badges share one badge system
- light mode is the primary polished mode
- the UI no longer feels like a terminal

## Non-Goals For This Redesign Pass

Do not build:

- full accounting integration
- OCR invoice ingestion
- payroll compliance
- multisig proposal creation unless already available via backend
- a marketing landing page
- a full brand identity project

This pass is about product UI/UX, not brand marketing.

## Open Product Decisions

Need to decide before implementation:

- Should `Payee` and `Counterparty` merge in the UI language?
- Should the primary list be named `Payments` or `Payment Requests`?
- Should settlement live as a top-level page or as a tab under Payments?
- Should dark mode survive the redesign, or should we cut scope and perfect light mode first?
- Should CSV import create draft runs only, requiring a review screen before order creation?

Recommendation:

- Use `Payments` as the operator-facing term.
- Keep `Payment request` as the intake object only.
- Keep `Payment run` for batches.
- Keep `Settlement` as a top-level page because reconciliation is a core differentiator.
- Prioritize light mode first and keep dark mode only if it costs little.
- Move CSV import toward draft-run review before final creation.
