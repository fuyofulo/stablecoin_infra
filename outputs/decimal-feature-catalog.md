# Decimal — Feature Catalog

A catalog of product features Decimal could plausibly build, drawn from research on Brex, Ramp, Monk, BVNK, Bridge, Kast, Credible, and other AI-powered fintech products. Organized by domain, not by milestone or priority. Used to think about what's possible before deciding what to build.

Each feature notes:
- What it is
- The user pain it removes
- Source / inspiration (which incumbent ships a version of this)
- Decimal-specific angle when relevant

---

## 1. Invoice & AP intake

**PDF / image invoice extraction**
Vision model pulls vendor, amount, line items, due date, bank or wallet details from an uploaded invoice.
Removes manual data entry. Already partially built in Decimal.
*Brex Expense AI, Ramp Receipts, Monk contracts.*

**Email-first invoice inbox**
A dedicated address (`invoices@yourorg.decimal.finance`) that auto-parses incoming attachments into draft proposals.
Vendors can email invoices directly. Nobody on the ops team has to upload anything.
*Brex / Ramp standard.*

**Bulk CSV payout normalization**
Upload 100 vendor rows. AI dedupes against existing counterparties, fills missing fields, batches into multisig proposals.
Massive ergonomic win for monthly contractor or grant-payout runs.

**Contract extraction (SaaS, MSAs, retainers)**
Parse signed contracts into structured terms: pricing, renewal date, SKUs, payment cadence.
Feeds the recurring-payment system in section 6.
*Monk's core product, Ramp Intelligence.*

**Document attachment / supporting-doc linking**
Each payment auto-linked to its invoice, PO, or contract.
Makes audit trivial. The auditor opens one record and sees everything.

---

## 2. Counterparty / vendor intelligence

**Vendor auto-creation from invoice**
AI extracts vendor identity from a one-off PDF and creates a `Counterparty` record with chain address, bank info, contact details.
No more manual vendor setup before paying someone for the first time.

**Counterparty deduplication**
Fuzzy match "Acme Inc," "Acme, Inc.," "ACME" into one entity.
Stops counterparty sprawl that breaks reporting and history.
*Standard in Ramp / Brex.*

**Vendor profile enrichment**
Pull website, registration data, beneficial-owner info from public sources.
Useful for new-payee due diligence without leaving Decimal.

**Payment history per counterparty**
How much, how often, who approved it, dispute history.
Sets up the benchmarks that anomaly detection in section 3 needs.

**Vendor risk scoring**
AI rates each vendor on signals: how long known, payment volume, address reputation, sanctions lists.
Surfaced at proposal creation time so signers see risk before approving.

---

## 3. Risk / anomaly / fraud

**Pre-execution anomaly checks at the multisig gate**
Before any Squads tx executes, AI checks: is this a new payee? Is the amount 10x historical average? Did the payee bank account change mid-flight? Is the destination address never seen before?
Highest-leverage feature in the catalog. Multisig is the perfect choke point. No other fintech has this gate as cleanly as Decimal does.
*Brex Audit Agent, Ramp anomaly detection.*

**BEC (business-email-compromise) detection**
Flag when a vendor's wire instructions change mid-conversation, or when an "urgent" email tries to redirect a payment to a new address.
Catches the single most expensive fraud pattern in B2B payments.

**Duplicate invoice detection**
Same vendor, same amount, same window. Flag before paying twice.

**Spend-vs-budget breach alerts**
Real-time, not month-end. The CFO learns about overspend the day it happens.

**Activity-feed audit trail**
Every action timestamped, with who, what, why.
Combined with on-chain settlement, makes Decimal natively audit-ready.

---

## 4. Reconciliation / matching

**Outbound matcher**
Each Squads payout matched to its source invoice or proposal.
Generates a settled-payments ledger that finance can hand to accounting.

**Inbound matcher**
Incoming USDC matched to expected collections via memo, amount, date, sender.
Drives cash application. The matcher contract already exists in Decimal's data model.
*Monk's exact core feature.*

**Bank ↔ on-chain ↔ ledger triple-matching**
For customers who hold both fiat and stablecoin balances, reconcile across all three.
Not in scope until Decimal touches fiat rails.

**Exception routing**
Unmatched payments queued for human review with the AI's best-guess match shown.
The human just confirms or corrects. Closes the loop without manual searching.

---

## 5. Spend governance

**Programmable spend rules engine**
A small DSL: "auto-approve under $X," "vendor caps," "category budgets," "two signers required over $Y," "Tuesday-only payments to vendor Z."
Rules enforced at proposal creation, not just at signing.

**Approval chains / role-based routing**
Beyond raw multisig threshold: department head approves first, then CFO, then chain executes.
Maps to how mid-size companies actually approve money.

**Rule suggestions from history**
AI watches 90 days of approvals, suggests rules that match observed behavior.
"You always approve Vercel — should this become auto?"

**Policy-violation explanations**
When a rule blocks a tx, AI explains what would unblock it.
Reduces back-and-forth between submitter and approver.

---

## 6. Recurring / subscription intelligence

**Subscription detection from history**
AI clusters past payouts by vendor, cadence, and amount. Surfaces "this looks like a $200/mo subscription you forgot about."
*Ramp's contract review + spend insights.*

**Renewal calendar**
Auto-extracted renewal dates from contracts. Alerts before the auto-renew fires.
Stops the "we got billed for another year of a tool we don't use" loss.

**Unused-license / dormant-vendor detection**
Vendor hasn't been engaged in 90 days but you're still paying.
Direct cost savings.

**Subscription consolidation suggestions**
"You're paying for two overlapping CRMs."
The kind of insight that pays for the product.

---

## 7. Cash flow / treasury insight

**Runway forecast**
Treasury balance + projected outflows (recurring + queued proposals) → weeks or months of runway.
AI flags when burn changes meaningfully.

**Spend categorization**
Auto-tag every payout to a GL or cost-center via AI.
*Brex / Ramp standard.*

**Cohort / vendor / category breakdowns**
Sliceable spend reports without needing to drop into a spreadsheet.

**Anomaly explanations**
"You spent 2x on contractors this month — here are the 3 invoices that drove it."
Not just "you spent more"; the AI explains why.

**What-if simulations**
"If we hire 3 engineers, runway goes from 14 → 9 months."
Lightweight planning tool baked into the treasury view.

---

## 8. Conversational / copilot layer

**Natural-language treasury Q&A (read-only)**
"How much did we spend on contractors last month?" "Show me payments to Acme over $10k." "Which subscriptions haven't been used in 60 days?"
Read-only over org data. Visceral demo. Single biggest "wow" feature in the catalog.
*Brex Assistant, Ramp copilot.*

**Action-oriented copilot (write, gated)**
"Pay these 12 invoices" → AI drafts proposals → user reviews and signs.
Same chat surface, but with write actions. All actions still pass through Squads multisig.

**Slack / Telegram interface**
The same copilot, but inside the channel where ops already lives.
Lower switching cost than opening the Decimal app.

**Approval-routing bot**
Approval requests land in Slack DM with sign / reject buttons. Signing flows back through Privy and Squads.
The CFO can approve from her phone in the airport.

---

## 9. Collections / receivables (A/R, not just A/P)

**Invoice generation from contract**
Auto-bill from extracted contract terms.
*Monk billing engine.*

**Multi-channel dunning agent**
AI sends context-aware reminders to overdue accounts via email, Slack, AP-portal. Escalates tone over time.
*Monk collections agent.*

**Cash application**
Inbound matcher (also listed in section 4) closes the loop on A/R.
Same machinery, different direction.

---

## 10. Onboarding / setup

**AI setup wizard**
Chat-based: "Tell me your team, payment patterns, who approves what" → suggests Squads config, signers, threshold, approval chains, spend rules.
Reduces first-session friction from a 30-minute config to a 5-minute conversation.

**Migration helper**
Import vendor list or past payments from CSV / QuickBooks export. Auto-create counterparties.
Lowers the cost of switching to Decimal from another tool.

---

## 11. Output / integrations

**Accounting export**
Sync to QuickBooks / Xero with AI-mapped GL categories.
Closes the loop for the bookkeeper.

**Audit packet export**
One-click bundle of invoices + approvals + on-chain settlement proofs for an external auditor.
Decimal-specific advantage: on-chain proofs don't exist in traditional fintech.

**Webhook / API surface**
Customers pipe Decimal events (proposal created, payment settled) into their own stacks.
Turns Decimal into infrastructure, not just an app.

---

## Framing notes

**Some features compound on each other.**
Vendor intelligence (§2) feeds anomaly detection (§3) feeds the copilot (§8). Subscription detection (§6) needs the recurring-payment data the matcher (§4) generates. Picking features in isolation under-rates the ones that unlock other features.

**Some features are uniquely Decimal-flavored.**
Pre-execution anomaly checks at the multisig gate is the standout — no traditional fintech has that gate. Audit packets with on-chain settlement proofs is another. Both leverage Squads multisig + USDC settlement in ways Brex / Ramp structurally cannot.

**Some are table-stakes that you'd ship even without an AI angle.**
Spend rules, approval chains, accounting export. Useful, but not the "AI features" the grant emphasizes.

**Read-only copilot vs action-taking copilot is a meaningful split.**
Read-only is safer and faster to ship. Action-taking is the "wow" version but adds safety surface (you don't want a hallucinated $50k payout queued, even pending approval). Worth treating as separate features.
