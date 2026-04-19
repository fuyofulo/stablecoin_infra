import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  attachPaymentOrderSignature,
  cancelPaymentOrder,
  createPaymentOrder,
  createPaymentOrderExecution,
  getPaymentOrderDetail,
  listPaymentOrders,
  preparePaymentOrderExecution,
  updatePaymentOrder,
  submitPaymentOrder,
} from '../payment-orders.js';
import { buildPaymentOrderAuditRows, buildPaymentOrderProofPacket } from '../payment-order-proof.js';
import { renderPaymentOrderProofMarkdown } from '../payment-proof-markdown.js';
import { isPaymentOrderState } from '../payment-order-state.js';
import { isSolanaSignatureLike } from '../solana.js';
import { assertWorkspaceAccess, assertWorkspaceAdmin } from '../workspace-access.js';
import { actorFromAuth } from '../actor.js';
import { asyncRoute, sendCreated, sendJson, sendList, unwrapItems } from '../route-helpers.js';

export const paymentOrdersRouter = Router();

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const paymentOrderParamsSchema = workspaceParamsSchema.extend({
  paymentOrderId: z.string().uuid(),
});

const amountRawSchema = z.union([
  z.string().regex(/^\d+$/),
  z.number().int().nonnegative().transform((value) => value.toString()),
]);

const createPaymentOrderSchema = z.object({
  destinationId: z.string().uuid(),
  sourceTreasuryWalletId: z.string().uuid().optional(),
  amountRaw: amountRawSchema,
  asset: z.string().trim().min(1).max(20).default('usdc'),
  memo: z.string().trim().max(1000).optional(),
  externalReference: z.string().trim().max(200).optional(),
  invoiceNumber: z.string().trim().max(200).optional(),
  attachmentUrl: z.string().trim().max(2000).optional(),
  dueAt: z.string().datetime().optional(),
  sourceBalanceSnapshotJson: z.record(z.any()).default({ status: 'unknown' }),
  metadataJson: z.record(z.any()).default({}),
  submitNow: z.boolean().default(false),
});

const updatePaymentOrderSchema = z.object({
  sourceTreasuryWalletId: z.string().uuid().nullable().optional(),
  memo: z.string().trim().max(1000).nullable().optional(),
  externalReference: z.string().trim().max(200).nullable().optional(),
  invoiceNumber: z.string().trim().max(200).nullable().optional(),
  attachmentUrl: z.string().trim().max(2000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  sourceBalanceSnapshotJson: z.record(z.any()).optional(),
  metadataJson: z.record(z.any()).optional(),
});

const listPaymentOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(250).default(100),
  state: z.string().refine((value) => isPaymentOrderState(value), 'Invalid payment order state').optional(),
  paymentRunId: z.string().uuid().optional(),
});

const createExecutionSchema = z.object({
  executionSource: z.string().trim().min(1).max(100).default('manual_signature'),
  externalReference: z.string().trim().max(500).optional(),
  metadataJson: z.record(z.any()).default({}),
});

const prepareExecutionSchema = z.object({
  sourceTreasuryWalletId: z.string().uuid().optional(),
});

const attachSignatureSchema = z.object({
  submittedSignature: z.string().trim().refine(isSolanaSignatureLike, 'Invalid Solana signature').optional(),
  externalReference: z.string().trim().max(500).optional(),
  submittedAt: z.string().datetime().optional(),
  metadataJson: z.record(z.any()).default({}),
}).refine(
  (value) => Boolean(value.submittedSignature || value.externalReference || Object.keys(value.metadataJson).length),
  'A submitted signature, external execution reference, or metadata is required',
);

const proofQuerySchema = z.object({
  format: z.enum(['json', 'markdown']).default('json'),
});

const auditExportQuerySchema = z.object({
  format: z.enum(['csv', 'json']).default('csv'),
});

paymentOrdersRouter.get('/workspaces/:workspaceId/payment-orders', asyncRoute(async (req, res) => {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    const query = listPaymentOrdersQuerySchema.parse(req.query);
    await assertWorkspaceAccess(workspaceId, req.auth!);

    const result = await listPaymentOrders(workspaceId, {
      limit: query.limit,
      state: query.state,
      paymentRunId: query.paymentRunId,
    });
    sendList(res, unwrapItems(result), {
      limit: query.limit,
      state: query.state ?? null,
      paymentRunId: query.paymentRunId ?? null,
    });
}));

paymentOrdersRouter.post('/workspaces/:workspaceId/payment-orders', asyncRoute(async (req, res) => {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    const input = createPaymentOrderSchema.parse(req.body);
    const actor = actorFromAuth(req.auth!);

    const detail = await createPaymentOrder({
      workspaceId,
      ...actor,
      destinationId: input.destinationId,
      sourceTreasuryWalletId: input.sourceTreasuryWalletId,
      amountRaw: input.amountRaw,
      asset: input.asset,
      memo: input.memo,
      externalReference: input.externalReference,
      invoiceNumber: input.invoiceNumber,
      attachmentUrl: input.attachmentUrl,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      sourceBalanceSnapshotJson: input.sourceBalanceSnapshotJson,
      metadataJson: input.metadataJson,
      submitNow: input.submitNow,
    });

    sendCreated(res, detail);
}));

paymentOrdersRouter.get('/workspaces/:workspaceId/payment-orders/:paymentOrderId', asyncRoute(async (req, res) => {
    const { workspaceId, paymentOrderId } = paymentOrderParamsSchema.parse(req.params);
    await assertWorkspaceAccess(workspaceId, req.auth!);
    sendJson(res, await getPaymentOrderDetail(workspaceId, paymentOrderId));
}));

paymentOrdersRouter.patch('/workspaces/:workspaceId/payment-orders/:paymentOrderId', async (req, res, next) => {
  try {
    const { workspaceId, paymentOrderId } = paymentOrderParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    const input = updatePaymentOrderSchema.parse(req.body);
    const actor = actorFromAuth(req.auth!);

    res.json(await updatePaymentOrder({
      workspaceId,
      paymentOrderId,
      ...actor,
      input: {
        ...input,
        dueAt: input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null,
      },
    }));
  } catch (error) {
    next(error);
  }
});

paymentOrdersRouter.post('/workspaces/:workspaceId/payment-orders/:paymentOrderId/submit', async (req, res, next) => {
  try {
    const { workspaceId, paymentOrderId } = paymentOrderParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    const actor = actorFromAuth(req.auth!);

    res.json(await submitPaymentOrder({
      workspaceId,
      paymentOrderId,
      ...actor,
    }));
  } catch (error) {
    next(error);
  }
});

paymentOrdersRouter.post('/workspaces/:workspaceId/payment-orders/:paymentOrderId/cancel', async (req, res, next) => {
  try {
    const { workspaceId, paymentOrderId } = paymentOrderParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    const actor = actorFromAuth(req.auth!);

    res.json(await cancelPaymentOrder({
      workspaceId,
      paymentOrderId,
      ...actor,
    }));
  } catch (error) {
    next(error);
  }
});

paymentOrdersRouter.post(
  '/workspaces/:workspaceId/payment-orders/:paymentOrderId/prepare-execution',
  async (req, res, next) => {
    try {
      const { workspaceId, paymentOrderId } = paymentOrderParamsSchema.parse(req.params);
      await assertWorkspaceAdmin(workspaceId, req.auth!);
      const input = prepareExecutionSchema.parse(req.body);
      const actor = actorFromAuth(req.auth!);

      const prepared = await preparePaymentOrderExecution({
        workspaceId,
        paymentOrderId,
        ...actor,
        sourceTreasuryWalletId: input.sourceTreasuryWalletId,
      });

      res.status(201).json(prepared);
    } catch (error) {
      next(error);
    }
  },
);

paymentOrdersRouter.post(
  '/workspaces/:workspaceId/payment-orders/:paymentOrderId/create-execution',
  async (req, res, next) => {
    try {
      const { workspaceId, paymentOrderId } = paymentOrderParamsSchema.parse(req.params);
      await assertWorkspaceAdmin(workspaceId, req.auth!);
      const input = createExecutionSchema.parse(req.body);
      const actor = actorFromAuth(req.auth!);

      const executionRecord = await createPaymentOrderExecution({
        workspaceId,
        paymentOrderId,
        ...actor,
        executionSource: input.executionSource,
        externalReference: input.externalReference,
        metadataJson: input.metadataJson,
      });

      res.status(201).json(executionRecord);
    } catch (error) {
      next(error);
    }
  },
);

paymentOrdersRouter.post(
  '/workspaces/:workspaceId/payment-orders/:paymentOrderId/attach-signature',
  async (req, res, next) => {
    try {
      const { workspaceId, paymentOrderId } = paymentOrderParamsSchema.parse(req.params);
      await assertWorkspaceAdmin(workspaceId, req.auth!);
      const input = attachSignatureSchema.parse(req.body);
      const actor = actorFromAuth(req.auth!);

      const executionRecord = await attachPaymentOrderSignature({
        workspaceId,
        paymentOrderId,
        ...actor,
        submittedSignature: input.submittedSignature,
        externalReference: input.externalReference,
        submittedAt: input.submittedAt ? new Date(input.submittedAt) : null,
        metadataJson: input.metadataJson,
      });

      res.json(executionRecord);
    } catch (error) {
      next(error);
    }
  },
);

paymentOrdersRouter.get(
  '/workspaces/:workspaceId/payment-orders/:paymentOrderId/proof',
  async (req, res, next) => {
    try {
      const { workspaceId, paymentOrderId } = paymentOrderParamsSchema.parse(req.params);
      const query = proofQuerySchema.parse(req.query);
      await assertWorkspaceAccess(workspaceId, req.auth!);
      const proof = await buildPaymentOrderProofPacket(workspaceId, paymentOrderId);
      if (query.format === 'markdown') {
        res.setHeader('content-type', 'text/markdown; charset=utf-8');
        res.setHeader('content-disposition', `attachment; filename="payment-order-${paymentOrderId}-proof.md"`);
        res.send(renderPaymentOrderProofMarkdown(proof));
        return;
      }

      sendJson(res, proof);
    } catch (error) {
      next(error);
    }
  },
);

paymentOrdersRouter.get(
  '/workspaces/:workspaceId/payment-orders/:paymentOrderId/audit-export',
  async (req, res, next) => {
    try {
      const { workspaceId, paymentOrderId } = paymentOrderParamsSchema.parse(req.params);
      const query = auditExportQuerySchema.parse(req.query);
      await assertWorkspaceAccess(workspaceId, req.auth!);
      const rows = await buildPaymentOrderAuditRows(workspaceId, paymentOrderId);

      if (query.format === 'json') {
        sendList(res, rows);
        return;
      }

      respondWithCsv(res, `payment-order-${paymentOrderId}.csv`, rows);
    } catch (error) {
      next(error);
    }
  },
);

function respondWithCsv(res: Response, fileName: string, rows: Array<Record<string, string>>) {
  const headers = rows[0] ? Object.keys(rows[0]) : ['section', 'key', 'value'];
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header] ?? '')).join(',')),
  ].join('\n');

  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${fileName}"`);
  res.send(csv);
}

function escapeCsv(value: string) {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}
