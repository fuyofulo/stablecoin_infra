import { Router } from 'express';
import { z } from 'zod';
import {
  cancelPaymentRequest,
  createPaymentRequest,
  getPaymentRequestDetail,
  importPaymentRequestsFromCsv,
  isPaymentRequestState,
  listPaymentRequests,
  previewPaymentRequestsCsv,
  promotePaymentRequestToOrder,
} from '../payment-requests.js';
import { assertWorkspaceAccess, assertWorkspaceAdmin } from '../workspace-access.js';
import { asyncRoute, sendCreated, sendJson, sendList, unwrapItems } from '../route-helpers.js';

export const paymentRequestsRouter = Router();

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const paymentRequestParamsSchema = workspaceParamsSchema.extend({
  paymentRequestId: z.string().uuid(),
});

const amountRawSchema = z.union([
  z.string().regex(/^\d+$/),
  z.number().int().nonnegative().transform((value) => value.toString()),
]);

const listPaymentRequestsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(250).default(100),
  state: z.string().refine((value) => isPaymentRequestState(value), 'Invalid payment request state').optional(),
});

const createPaymentRequestSchema = z.object({
  destinationId: z.string().uuid(),
  amountRaw: amountRawSchema,
  asset: z.string().trim().min(1).max(20).default('usdc'),
  reason: z.string().trim().min(1).max(1000),
  externalReference: z.string().trim().max(200).optional(),
  dueAt: z.string().datetime().optional(),
  metadataJson: z.record(z.any()).default({}),
  createOrderNow: z.boolean().default(false),
  sourceTreasuryWalletId: z.string().uuid().optional(),
  submitOrderNow: z.boolean().default(false),
});

const importPaymentRequestsCsvSchema = z.object({
  csv: z.string().min(1),
  createOrderNow: z.boolean().default(true),
  sourceTreasuryWalletId: z.string().uuid().optional(),
  submitOrderNow: z.boolean().default(false),
});

const promotePaymentRequestSchema = z.object({
  sourceTreasuryWalletId: z.string().uuid().optional(),
  submitNow: z.boolean().default(false),
});

paymentRequestsRouter.get('/workspaces/:workspaceId/payment-requests', asyncRoute(async (req, res) => {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    const query = listPaymentRequestsQuerySchema.parse(req.query);
    await assertWorkspaceAccess(workspaceId, req.auth!);

    const result = await listPaymentRequests(workspaceId, {
      limit: query.limit,
      state: query.state,
    });
    sendList(res, unwrapItems(result), { limit: query.limit, state: query.state ?? null });
}));

paymentRequestsRouter.post('/workspaces/:workspaceId/payment-requests', asyncRoute(async (req, res) => {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    const input = createPaymentRequestSchema.parse(req.body);

    const detail = await createPaymentRequest({
      workspaceId,
      actorUserId: req.auth!.userId,
      destinationId: input.destinationId,
      amountRaw: input.amountRaw,
      asset: input.asset,
      reason: input.reason,
      externalReference: input.externalReference,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      metadataJson: input.metadataJson,
      createOrderNow: input.createOrderNow,
      sourceTreasuryWalletId: input.sourceTreasuryWalletId,
      submitOrderNow: input.submitOrderNow,
    });

    sendCreated(res, detail);
}));

paymentRequestsRouter.post('/workspaces/:workspaceId/payment-requests/import-csv', asyncRoute(async (req, res) => {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    const input = importPaymentRequestsCsvSchema.parse(req.body);

    sendCreated(res, await importPaymentRequestsFromCsv({
      workspaceId,
      actorUserId: req.auth!.userId,
      csv: input.csv,
      createOrderNow: input.createOrderNow,
      sourceTreasuryWalletId: input.sourceTreasuryWalletId,
      submitOrderNow: input.submitOrderNow,
    }));
}));

paymentRequestsRouter.post('/workspaces/:workspaceId/payment-requests/import-csv/preview', asyncRoute(async (req, res) => {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    await assertWorkspaceAccess(workspaceId, req.auth!);
    const input = z.object({ csv: z.string().min(1) }).parse(req.body);

    sendJson(res, await previewPaymentRequestsCsv({
      workspaceId,
      csv: input.csv,
    }));
}));

paymentRequestsRouter.get('/workspaces/:workspaceId/payment-requests/:paymentRequestId', asyncRoute(async (req, res) => {
    const { workspaceId, paymentRequestId } = paymentRequestParamsSchema.parse(req.params);
    await assertWorkspaceAccess(workspaceId, req.auth!);

    sendJson(res, await getPaymentRequestDetail(workspaceId, paymentRequestId));
}));

paymentRequestsRouter.post(
  '/workspaces/:workspaceId/payment-requests/:paymentRequestId/promote',
  asyncRoute(async (req, res) => {
      const { workspaceId, paymentRequestId } = paymentRequestParamsSchema.parse(req.params);
      await assertWorkspaceAdmin(workspaceId, req.auth!);
      const input = promotePaymentRequestSchema.parse(req.body);

      sendCreated(res, await promotePaymentRequestToOrder({
        workspaceId,
        paymentRequestId,
        actorUserId: req.auth!.userId,
        sourceTreasuryWalletId: input.sourceTreasuryWalletId,
        submitNow: input.submitNow,
      }));
  }),
);

paymentRequestsRouter.post(
  '/workspaces/:workspaceId/payment-requests/:paymentRequestId/cancel',
  asyncRoute(async (req, res) => {
      const { workspaceId, paymentRequestId } = paymentRequestParamsSchema.parse(req.params);
      await assertWorkspaceAdmin(workspaceId, req.auth!);

      sendJson(res, await cancelPaymentRequest({
        workspaceId,
        paymentRequestId,
      }));
  }),
);
