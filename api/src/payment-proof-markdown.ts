import { formatIsoDateTime, formatUsdcAmount, shortenAddress } from './api-format.js';
import type { buildPaymentOrderProofPacket } from './payment-order-proof.js';
import type { buildPaymentRunProofPacket } from './payment-run-proof.js';

type PaymentOrderProofPacket = Awaited<ReturnType<typeof buildPaymentOrderProofPacket>>;
type PaymentRunProofPacket = Awaited<ReturnType<typeof buildPaymentRunProofPacket>>;

export function renderPaymentOrderProofMarkdown(proof: PaymentOrderProofPacket) {
  const lines = [
    `# Payment Proof`,
    ``,
    `Proof ID: ${proof.proofId}`,
    `Digest: ${proof.canonicalDigest}`,
    `Generated: ${formatIsoDateTime(proof.generatedAt)}`,
    `Status: ${proof.status}`,
    `Recommended action: ${proof.agentSummary.recommendedAction}`,
    ``,
    `## Intent`,
    `Payee: ${proof.intent.payee?.name ?? 'Unassigned'}`,
    `Reference: ${proof.intent.reference ?? 'None'}`,
    `Reason: ${proof.intent.reason ?? 'None'}`,
    `Amount: ${formatUsdcAmount(proof.intent.amountRaw) ?? proof.intent.amountRaw}`,
    `Due: ${formatIsoDateTime(proof.intent.dueAt) ?? 'None'}`,
    ``,
    `## Parties`,
    `Source: ${formatParty(proof.parties.source)}`,
    `Destination: ${formatParty(proof.parties.destination)}`,
    `Counterparty: ${proof.parties.counterparty?.displayName ?? 'Unassigned'}`,
    ``,
    `## Approval`,
    `State: ${proof.approval.state}`,
    `Decision count: ${proof.approval.decisions.length}`,
    ...proof.approval.decisions.map((decision) =>
      `- ${decision.action} by ${decision.actorEmail ?? decision.actorType} at ${formatIsoDateTime(decision.createdAt) ?? 'unknown time'}${decision.comment ? `: ${decision.comment}` : ''}`,
    ),
    ``,
    `## Execution`,
    `State: ${proof.execution.state ?? 'None'}`,
    `Source: ${proof.execution.executionSource ?? 'None'}`,
    `Submitted signature: ${proof.execution.submittedSignature ?? 'None'}`,
    `Submitted at: ${formatIsoDateTime(proof.execution.submittedAt) ?? 'None'}`,
    `External reference: ${proof.execution.externalExecutionReference ?? 'None'}`,
    ``,
    `## Settlement`,
    `State: ${proof.settlement.state ?? 'None'}`,
    `Match status: ${proof.settlement.matchStatus ?? 'None'}`,
    `Match rule: ${proof.settlement.matchRule ?? 'None'}`,
    `Matched amount: ${formatUsdcAmount(proof.settlement.matchedAmountRaw) ?? 'None'}`,
    `Variance: ${formatUsdcAmount(proof.settlement.amountVarianceRaw) ?? 'None'}`,
    `Signature: ${proof.settlement.signature ?? 'None'}`,
    `Observed at: ${formatIsoDateTime(proof.settlement.observedEventTime) ?? 'None'}`,
    `Matched at: ${formatIsoDateTime(proof.settlement.matchedAt) ?? 'None'}`,
    `Summary: ${proof.settlement.reconciliationSummary ?? 'No final reconciliation summary yet.'}`,
    ``,
    `## Exceptions`,
    proof.exceptions.length ? proof.exceptions.map((exception) =>
      `- ${exception.severity} ${exception.reasonCode} (${exception.status}): ${exception.explanation}`,
    ).join('\n') : `None`,
    ``,
    `## Readiness Checks`,
    ...proof.readiness.checks.map((check) => `- [${check.status}] ${check.label}: ${check.detail}`),
    ``,
    `## Audit Trail`,
    proof.auditTrail.length ? proof.auditTrail.map((event) =>
      `- ${formatIsoDateTime(getRecordValue(event, 'createdAt')) ?? 'unknown time'} ${getEventLabel(event)}`,
    ).join('\n') : `No timeline events included.`,
    ``,
  ];

  return `${lines.join('\n')}\n`;
}

export function renderPaymentRunProofMarkdown(proof: PaymentRunProofPacket) {
  const lines = [
    `# Payment Run Proof`,
    ``,
    `Proof ID: ${proof.proofId}`,
    `Digest: ${proof.canonicalDigest}`,
    `Generated: ${formatIsoDateTime(proof.generatedAt)}`,
    `Run: ${proof.runName}`,
    `Status: ${proof.status}`,
    `Readiness: ${proof.readiness.status}`,
    `Recommended action: ${proof.agentSummary.recommendedAction}`,
    ``,
    `## Totals`,
    `Orders: ${proof.totals.orderCount}`,
    `Actionable orders: ${proof.totals.actionableCount}`,
    `Total amount: ${formatUsdcAmount(proof.totals.totalAmountRaw) ?? proof.totals.totalAmountRaw}`,
    `Settled count: ${proof.totals.settledCount}`,
    `Exception count: ${proof.totals.exceptionCount}`,
    ``,
    `## Reconciliation`,
    `Requested: ${formatUsdcAmount(proof.reconciliationSummary.requestedAmountRaw)}`,
    `Matched: ${formatUsdcAmount(proof.reconciliationSummary.matchedAmountRaw)}`,
    `Variance: ${formatUsdcAmount(proof.reconciliationSummary.varianceAmountRaw)}`,
    `Completion ratio: ${Math.round(proof.reconciliationSummary.completionRatio * 100)}%`,
    `Needs review: ${proof.reconciliationSummary.needsReview ? 'yes' : 'no'}`,
    ``,
    `## Orders`,
    ...proof.orders.map((order) => [
      `### ${order.reference ?? order.paymentOrderId}`,
      `Payee: ${order.payee?.name ?? 'Unassigned'}`,
      `Destination: ${order.destination.label} (${shortenAddress(order.destination.walletAddress)})`,
      `Amount: ${formatUsdcAmount(order.amountRaw) ?? order.amountRaw}`,
      `State: ${order.state}`,
      `Approval: ${order.approvalState ?? 'None'}`,
      `Execution: ${order.executionState ?? 'None'}`,
      `Settlement: ${order.settlementState ?? 'None'}`,
      `Signature: ${order.submittedSignature ?? 'None'}`,
      `Proof: ${order.proofId ?? 'None'}`,
      ``,
    ].join('\n')),
  ];

  return `${lines.join('\n')}\n`;
}

function formatParty(party: {
  label?: string | null;
  walletAddress?: string | null;
  tokenAccountAddress?: string | null;
  usdcAtaAddress?: string | null;
  trustState?: string | null;
} | null) {
  if (!party) {
    return 'None';
  }
  const tokenAddress = party.tokenAccountAddress ?? party.usdcAtaAddress ?? null;
  return [
    party.label ?? 'Unlabeled',
    party.walletAddress ? shortenAddress(party.walletAddress) : null,
    tokenAddress ? `ATA ${shortenAddress(tokenAddress)}` : null,
    party.trustState ? `trust ${party.trustState}` : null,
  ].filter(Boolean).join(' / ');
}

function getRecordValue(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' || candidate instanceof Date ? candidate : null;
}

function getEventLabel(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'event';
  }
  const record = value as Record<string, unknown>;
  return String(record.eventType ?? record.timelineType ?? record.action ?? record.state ?? 'event');
}
