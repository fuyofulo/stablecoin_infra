import { Router } from 'express';
import { z } from 'zod';
import {
  attachPaymentRunSignature,
  cancelPaymentRun,
  closePaymentRun,
  deletePaymentRun,
  getPaymentRunDetail,
  importPaymentRunFromCsv,
  listPaymentRuns,
  preparePaymentRunExecution,
  previewPaymentRunCsv,
} from '../payment-runs.js';
import { buildPaymentRunProofPacket } from '../payment-run-proof.js';
import { renderPaymentRunProofMarkdown } from '../payment-proof-markdown.js';
import { isSolanaSignatureLike } from '../solana.js';
import { assertWorkspaceAccess, assertWorkspaceAdmin } from '../workspace-access.js';
import { asyncRoute, sendCreated, sendJson, sendList, unwrapItems } from '../route-helpers.js';

export const paymentRunsRouter = Router();

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const paymentRunParamsSchema = workspaceParamsSchema.extend({
  paymentRunId: z.string().uuid(),
});

const paymentRunProofQuerySchema = z.object({
  detail: z.enum(['summary', 'compact', 'full']).default('summary'),
  format: z.enum(['json', 'markdown']).default('json'),
});

const importPaymentRunCsvSchema = z.object({
  csv: z.string().min(1),
  runName: z.string().trim().max(200).optional(),
  sourceTreasuryWalletId: z.string().uuid().optional(),
  submitOrderNow: z.boolean().default(false),
  importKey: z.string().trim().max(200).optional(),
});

const preparePaymentRunExecutionSchema = z.object({
  sourceTreasuryWalletId: z.string().uuid().optional(),
});

const attachPaymentRunSignatureSchema = z.object({
  submittedSignature: z.string().trim().refine(isSolanaSignatureLike, 'Invalid Solana signature'),
  submittedAt: z.string().datetime().optional(),
});

paymentRunsRouter.get('/workspaces/:workspaceId/payment-runs', asyncRoute(async (req, res) => {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    await assertWorkspaceAccess(workspaceId, req.auth!);
    sendList(res, unwrapItems(await listPaymentRuns(workspaceId)), { limit: 100 });
}));

paymentRunsRouter.post('/workspaces/:workspaceId/payment-runs/import-csv', asyncRoute(async (req, res) => {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    const input = importPaymentRunCsvSchema.parse(req.body);
    sendCreated(res, await importPaymentRunFromCsv({
      workspaceId,
      actorUserId: req.auth!.userId,
      csv: input.csv,
      runName: input.runName,
      sourceTreasuryWalletId: input.sourceTreasuryWalletId,
      submitOrderNow: input.submitOrderNow,
      importKey: input.importKey,
    }));
}));

paymentRunsRouter.post('/workspaces/:workspaceId/payment-runs/import-csv/preview', asyncRoute(async (req, res) => {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    await assertWorkspaceAccess(workspaceId, req.auth!);
    const input = z.object({ csv: z.string().min(1) }).parse(req.body);
    sendJson(res, await previewPaymentRunCsv({
      workspaceId,
      csv: input.csv,
    }));
}));

paymentRunsRouter.get('/workspaces/:workspaceId/payment-runs/:paymentRunId', asyncRoute(async (req, res) => {
    const { workspaceId, paymentRunId } = paymentRunParamsSchema.parse(req.params);
    await assertWorkspaceAccess(workspaceId, req.auth!);
    sendJson(res, await getPaymentRunDetail(workspaceId, paymentRunId));
}));

paymentRunsRouter.delete('/workspaces/:workspaceId/payment-runs/:paymentRunId', asyncRoute(async (req, res) => {
    const { workspaceId, paymentRunId } = paymentRunParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    sendJson(res, await deletePaymentRun(workspaceId, paymentRunId));
}));

paymentRunsRouter.post('/workspaces/:workspaceId/payment-runs/:paymentRunId/cancel', asyncRoute(async (req, res) => {
    const { workspaceId, paymentRunId } = paymentRunParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    sendJson(res, await cancelPaymentRun({
      workspaceId,
      paymentRunId,
      actorUserId: req.auth!.userId,
    }));
}));

paymentRunsRouter.post('/workspaces/:workspaceId/payment-runs/:paymentRunId/close', asyncRoute(async (req, res) => {
    const { workspaceId, paymentRunId } = paymentRunParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    sendJson(res, await closePaymentRun({
      workspaceId,
      paymentRunId,
      actorUserId: req.auth!.userId,
    }));
}));

paymentRunsRouter.post('/workspaces/:workspaceId/payment-runs/:paymentRunId/prepare-execution', asyncRoute(async (req, res) => {
    const { workspaceId, paymentRunId } = paymentRunParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    const input = preparePaymentRunExecutionSchema.parse(req.body);
    sendCreated(res, await preparePaymentRunExecution({
      workspaceId,
      paymentRunId,
      actorUserId: req.auth!.userId,
      sourceTreasuryWalletId: input.sourceTreasuryWalletId,
    }));
}));

paymentRunsRouter.post('/workspaces/:workspaceId/payment-runs/:paymentRunId/attach-signature', asyncRoute(async (req, res) => {
    const { workspaceId, paymentRunId } = paymentRunParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    const input = attachPaymentRunSignatureSchema.parse(req.body);
    sendCreated(res, await attachPaymentRunSignature({
      workspaceId,
      paymentRunId,
      actorUserId: req.auth!.userId,
      submittedSignature: input.submittedSignature,
      submittedAt: input.submittedAt ? new Date(input.submittedAt) : null,
    }));
}));

paymentRunsRouter.get('/workspaces/:workspaceId/payment-runs/:paymentRunId/proof', asyncRoute(async (req, res) => {
    const { workspaceId, paymentRunId } = paymentRunParamsSchema.parse(req.params);
    const query = paymentRunProofQuerySchema.parse(req.query);
    await assertWorkspaceAccess(workspaceId, req.auth!);
    const proof = await buildPaymentRunProofPacket(workspaceId, paymentRunId, { detail: query.detail });
    if (query.format === 'markdown') {
      res.setHeader('content-type', 'text/markdown; charset=utf-8');
      res.setHeader('content-disposition', `attachment; filename="payment-run-${paymentRunId}-proof.md"`);
      res.send(renderPaymentRunProofMarkdown(proof));
      return;
    }
    sendJson(res, proof);
}));
