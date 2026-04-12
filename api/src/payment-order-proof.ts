import { getPaymentOrderDetail, type PaymentOrderState } from './payment-orders.js';

export async function buildPaymentOrderAuditRows(workspaceId: string, paymentOrderId: string) {
  const detail = await getPaymentOrderDetail(workspaceId, paymentOrderId);
  const rows = [
    {
      section: 'payment_request',
      key: 'payment_request_id',
      value: detail.paymentRequestId ?? '',
    },
    {
      section: 'payment_request',
      key: 'reason',
      value: detail.paymentRequest?.reason ?? '',
    },
    {
      section: 'payment_order',
      key: 'payment_order_id',
      value: detail.paymentOrderId,
    },
    {
      section: 'payment_order',
      key: 'reference',
      value: detail.externalReference ?? detail.invoiceNumber ?? '',
    },
    {
      section: 'payment_order',
      key: 'memo',
      value: detail.memo ?? '',
    },
    {
      section: 'payment_order',
      key: 'amount_raw',
      value: detail.amountRaw,
    },
    {
      section: 'payment_order',
      key: 'asset',
      value: detail.asset,
    },
    {
      section: 'source',
      key: 'source_wallet',
      value: detail.sourceWorkspaceAddress?.address ?? '',
    },
    {
      section: 'destination',
      key: 'destination_wallet',
      value: detail.destination.walletAddress,
    },
    {
      section: 'approval',
      key: 'approval_state',
      value: detail.reconciliationDetail?.approvalState ?? detail.derivedState,
    },
    {
      section: 'execution',
      key: 'submitted_signature',
      value: detail.reconciliationDetail?.latestExecution?.submittedSignature ?? '',
    },
    {
      section: 'settlement',
      key: 'match_status',
      value: detail.reconciliationDetail?.match?.matchStatus ?? '',
    },
    {
      section: 'settlement',
      key: 'matched_amount_raw',
      value: detail.reconciliationDetail?.match?.matchedAmountRaw ?? '',
    },
    {
      section: 'exceptions',
      key: 'exception_count',
      value: String(detail.reconciliationDetail?.exceptions.length ?? 0),
    },
  ];

  for (const item of detail.reconciliationDetail?.timeline ?? []) {
    rows.push({
      section: 'timeline',
      key: item.timelineType,
      value: JSON.stringify(item),
    });
  }

  return rows;
}

export async function buildPaymentOrderProofPacket(workspaceId: string, paymentOrderId: string) {
  const detail = await getPaymentOrderDetail(workspaceId, paymentOrderId);
  const reconciliation = detail.reconciliationDetail;
  const match = reconciliation?.match ?? null;
  const latestExecution = reconciliation?.latestExecution ?? null;

  return {
    packetType: 'stablecoin_payment_proof',
    version: 1,
    generatedAt: new Date().toISOString(),
    workspaceId,
    status: deriveProofStatus(detail.derivedState, reconciliation?.requestDisplayState ?? null),
    intent: {
      paymentRequestId: detail.paymentRequestId,
      paymentOrderId: detail.paymentOrderId,
      transferRequestId: detail.transferRequestId,
      payee: detail.payee ? {
        payeeId: detail.payee.payeeId,
        name: detail.payee.name,
      } : null,
      reference: detail.externalReference ?? detail.invoiceNumber ?? null,
      reason: detail.paymentRequest?.reason ?? detail.memo ?? null,
      amountRaw: detail.amountRaw,
      asset: detail.asset,
      dueAt: detail.dueAt,
      createdAt: detail.createdAt,
    },
    parties: {
      source: detail.sourceWorkspaceAddress ? {
        workspaceAddressId: detail.sourceWorkspaceAddress.workspaceAddressId,
        label: detail.sourceWorkspaceAddress.displayName,
        walletAddress: detail.sourceWorkspaceAddress.address,
        usdcAtaAddress: detail.sourceWorkspaceAddress.usdcAtaAddress,
      } : null,
      destination: {
        destinationId: detail.destination.destinationId,
        label: detail.destination.label,
        walletAddress: detail.destination.walletAddress,
        tokenAccountAddress: detail.destination.tokenAccountAddress,
        trustState: detail.destination.trustState,
        isInternal: detail.destination.isInternal,
      },
      counterparty: detail.counterparty ? {
        counterpartyId: detail.counterparty.counterpartyId,
        displayName: detail.counterparty.displayName,
      } : null,
    },
    approval: {
      state: reconciliation?.approvalState ?? detail.derivedState,
      decisions: reconciliation?.approvalDecisions.map((decision) => ({
        action: decision.action,
        actorType: decision.actorType,
        actorEmail: decision.actorUser?.email ?? null,
        comment: decision.comment,
        createdAt: decision.createdAt,
      })) ?? [],
    },
    execution: {
      state: latestExecution?.state ?? null,
      executionSource: latestExecution?.executionSource ?? null,
      submittedSignature: latestExecution?.submittedSignature ?? null,
      submittedAt: latestExecution?.submittedAt ?? null,
      metadataJson: latestExecution?.metadataJson ?? null,
    },
    settlement: {
      state: reconciliation?.requestDisplayState ?? null,
      matchStatus: match?.matchStatus ?? null,
      matchRule: match?.matchRule ?? null,
      matchedAmountRaw: match?.matchedAmountRaw ?? null,
      amountVarianceRaw: match?.amountVarianceRaw ?? null,
      signature: match?.signature ?? latestExecution?.submittedSignature ?? null,
      observedEventTime: match?.observedEventTime ?? null,
      matchedAt: match?.matchedAt ?? null,
      confidenceBand: match?.confidenceBand ?? null,
    },
    exceptions: reconciliation?.exceptions.map((exception) => ({
      exceptionId: exception.exceptionId,
      type: exception.exceptionType,
      reasonCode: exception.reasonCode,
      status: exception.status,
      severity: exception.severity,
      explanation: exception.explanation,
      signature: exception.signature,
    })) ?? [],
    auditTrail: reconciliation?.timeline ?? [],
  };
}

function deriveProofStatus(derivedState: PaymentOrderState, requestDisplayState: string | null) {
  if (derivedState === 'closed') {
    return 'closed';
  }
  if (requestDisplayState === 'matched' || derivedState === 'settled') {
    return 'complete';
  }
  if (requestDisplayState === 'partial' || derivedState === 'partially_settled') {
    return 'partial';
  }
  if (requestDisplayState === 'exception' || derivedState === 'exception') {
    return 'exception';
  }
  return 'in_progress';
}
