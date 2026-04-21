# Axoria Implementation Checklist

## API-First Surface

- [x] Removed premature API-key and agent-task surfaces from lean MVP.
- [x] Idempotency keys for all mutating endpoints.
- [x] Audit identity cleanup so events/notes/approvals clearly show user, system, or worker.
- [x] OpenAPI spec for the full backend.
- [ ] Machine auth only after a real external-client workflow is validated.
- [x] Rate limiting and abuse protection for public routes.
- [x] Request correlation IDs and structured error codes.
- [ ] Stronger permission model: owner/admin/operator/viewer roles.
- [ ] Production auth upgrade: real user auth, passwordless/OAuth, organization invites, session hardening.
- [ ] Secrets/config hardening for production deployment.

## Reconciliation And Matching

- [ ] Reconciliation confidence scoring cleanup.
- [x] Signature-first reconciliation made the default for app-originated payments.
- [x] Better handling for unmatched but relevant transfers.
- [ ] Better handling for overpayment, underpayment, duplicate payment, wrong source, wrong destination, late settlement, and split settlement.
- [ ] Clear reconciliation state machine with explicit terminal states.
- [x] Reconciliation re-run/recompute endpoint for a request, payment order, or workspace.
- [x] Matching explainability endpoint that shows why a transfer matched or did not match.
- [ ] Historical backfill controls for watched wallets.
- [ ] Data retention policy for observed transfers, matches, exceptions, and proof/audit artifacts.
- [x] Removed Grafana-specific metrics and dashboards from lean MVP.

## Payment Runs And Input Layer

- [x] Payment run workflow hardening.
- [ ] Batch transaction signing UX improvement.
- [ ] Batch payment partial failure handling.
- [x] Payment run proof packet.
- [x] Payment run reconciliation summary.
- [x] Compact/default payment run proof mode with optional full embedded order proofs.
- [x] Payment run cancellation/close lifecycle.
- [x] Payment run idempotent CSV import.
- [x] CSV validation preview before committing rows.
- [x] CSV import error report with row numbers and reasons.
- [x] Duplicate payee/destination/reference detection during import.
- [ ] Payee merge/edit/archive flows.
- [ ] Destination trust review workflow.

## Execution Layer

- [ ] Execution layer cleanup.
- [ ] Wallet adapter UX hardening.
- [ ] Better connected-wallet/source-wallet validation.
- [ ] Recent blockhash and transaction expiry handling.
- [ ] Submitted signature tracking tied directly to prepared packet IDs.
- [ ] Retry/replacement transaction handling.
- [ ] Manual external execution evidence flow cleanup.
- [ ] Squads proposal generation.
- [ ] Optional multisig execution integration.
- [x] Source wallet balance snapshots before execution.
- [x] Insufficient balance warnings before preparing packets.

## Proof And Audit

- [x] Proof and audit improvements.
- [x] Human-readable payment proof packet.
- [x] JSON proof packet for API clients.
- [x] Removed generic CSV export/history surface in favor of proof packets.
- [x] Cryptographic proof bundle or signed audit manifest.
- [x] Full timeline export across payment request, order, execution, settlement, exception, and proof.
- [x] Workspace-level audit log endpoint.
- [x] Export history cleanup.

## Frontend Product Flow

- [ ] Frontend product flow revamp.
- [x] Payment request detail page.
- [x] Payment run detail page.
- [x] Payment order detail page cleanup.
- [x] Exception detail page cleanup.
- [x] Approval inbox page.
- [x] Execution queue page.
- [x] Reconciliation queue page.
- [x] Proof packet viewer.
- [x] Better onboarding: org, workspace, wallets, destinations, policy, first payment run.
- [ ] Institutional-grade UI pass after backend flows stabilize.

## Observability And Operations

- [x] Removed Grafana dashboard and overbuilt metrics from lean MVP.
- [ ] Minimal production health/alerting plan after user feedback.
- [ ] Dead-letter/error table for failed processing.
- [ ] Alerting rules for worker disconnect, stale stream, high exception rate, API failures.
- [x] Structured logs with request IDs.
- [ ] Production deployment checklist.
- [ ] Backup and restore plan for Postgres and ClickHouse.

## Backend Architecture Cleanup

- [ ] Split route handlers from service logic consistently. Remaining direct-DB route modules: auth, organizations, approvals, ops/internal.
- [x] Normalize actor handling across all services.
- [x] Normalize state transitions into explicit service modules.
- [x] Add domain-level tests separate from route tests.
- [x] Add contract tests for API clients.
- [x] Add OpenAPI-generated client or typed SDK.
- [x] Remove remaining frontend-shaped response assumptions.
- [x] Standardize pagination, filters, sorting, and error responses.
- [x] Standardize date/time and amount formatting at API boundaries.

## Security Hardening

- [ ] CSRF/session hardening for human auth.
- [x] Audit all sensitive mutations.
- [ ] Input validation review across all endpoints.
- [ ] Dependency/security audit.
- [ ] Threat model for execution and proof exports.

## Product Expansion Candidates

- [ ] Payroll-style batch flow prototype.
- [ ] Vendor payout workflow.
- [ ] Contractor payout workflow.
- [ ] DAO grant payout workflow.
- [ ] Recurring payment requests.
- [x] Payment request approvals by policy threshold.
- [ ] Webhook/API ingestion from external systems.
- [x] Email/CSV input layer beyond manual forms.
- [ ] Accounting export formats.
- [ ] Design partner feedback loop before deeper AP/payroll work.
