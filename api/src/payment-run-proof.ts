import { getPaymentRunDetail } from './payment-runs.js';

export async function buildPaymentRunProofPacket(workspaceId: string, paymentRunId: string) {
  const detail = await getPaymentRunDetail(workspaceId, paymentRunId);
  return {
    packetType: 'stablecoin_payment_run_proof',
    version: 1,
    generatedAt: new Date().toISOString(),
    workspaceId,
    paymentRunId,
    runName: detail.runName,
    status: detail.derivedState,
    totals: detail.totals,
    orders: detail.paymentOrders.map((order) => ({
      paymentOrderId: order.paymentOrderId,
      paymentRequestId: order.paymentRequestId,
      transferRequestId: order.transferRequestId,
      payee: order.payee,
      destination: order.destination,
      amountRaw: order.amountRaw,
      asset: order.asset,
      reference: order.externalReference ?? order.invoiceNumber,
      state: order.derivedState,
      latestExecution: order.reconciliationDetail?.latestExecution ?? null,
      match: order.reconciliationDetail?.match ?? null,
      exceptions: order.reconciliationDetail?.exceptions ?? [],
    })),
  };
}
