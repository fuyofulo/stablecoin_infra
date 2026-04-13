import { Router } from 'express';
import { z } from 'zod';
import {
  attachPaymentRunSignature,
  deletePaymentRun,
  getPaymentRunDetail,
  importPaymentRunFromCsv,
  listPaymentRuns,
  preparePaymentRunExecution,
} from '../payment-runs.js';
import { buildPaymentRunProofPacket } from '../payment-run-proof.js';
import { isSolanaSignatureLike } from '../solana.js';
import { assertWorkspaceAccess, assertWorkspaceAdmin } from '../workspace-access.js';

export const paymentRunsRouter = Router();

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const paymentRunParamsSchema = workspaceParamsSchema.extend({
  paymentRunId: z.string().uuid(),
});

const importPaymentRunCsvSchema = z.object({
  csv: z.string().min(1),
  runName: z.string().trim().max(200).optional(),
  sourceWorkspaceAddressId: z.string().uuid().optional(),
  submitOrderNow: z.boolean().default(false),
});

const preparePaymentRunExecutionSchema = z.object({
  sourceWorkspaceAddressId: z.string().uuid().optional(),
});

const attachPaymentRunSignatureSchema = z.object({
  submittedSignature: z.string().trim().refine(isSolanaSignatureLike, 'Invalid Solana signature'),
  submittedAt: z.string().datetime().optional(),
});

paymentRunsRouter.get('/workspaces/:workspaceId/payment-runs', async (req, res, next) => {
  try {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    await assertWorkspaceAccess(workspaceId, req.auth!.userId);
    res.json({ servedAt: new Date().toISOString(), ...(await listPaymentRuns(workspaceId)) });
  } catch (error) {
    next(error);
  }
});

paymentRunsRouter.post('/workspaces/:workspaceId/payment-runs/import-csv', async (req, res, next) => {
  try {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!.userId);
    const input = importPaymentRunCsvSchema.parse(req.body);
    res.status(201).json(await importPaymentRunFromCsv({
      workspaceId,
      actorUserId: req.auth!.userId,
      csv: input.csv,
      runName: input.runName,
      sourceWorkspaceAddressId: input.sourceWorkspaceAddressId,
      submitOrderNow: input.submitOrderNow,
    }));
  } catch (error) {
    next(error);
  }
});

paymentRunsRouter.get('/workspaces/:workspaceId/payment-runs/:paymentRunId', async (req, res, next) => {
  try {
    const { workspaceId, paymentRunId } = paymentRunParamsSchema.parse(req.params);
    await assertWorkspaceAccess(workspaceId, req.auth!.userId);
    res.json(await getPaymentRunDetail(workspaceId, paymentRunId));
  } catch (error) {
    next(error);
  }
});

paymentRunsRouter.delete('/workspaces/:workspaceId/payment-runs/:paymentRunId', async (req, res, next) => {
  try {
    const { workspaceId, paymentRunId } = paymentRunParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!.userId);
    res.json(await deletePaymentRun(workspaceId, paymentRunId));
  } catch (error) {
    next(error);
  }
});

paymentRunsRouter.post('/workspaces/:workspaceId/payment-runs/:paymentRunId/prepare-execution', async (req, res, next) => {
  try {
    const { workspaceId, paymentRunId } = paymentRunParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!.userId);
    const input = preparePaymentRunExecutionSchema.parse(req.body);
    res.status(201).json(await preparePaymentRunExecution({
      workspaceId,
      paymentRunId,
      actorUserId: req.auth!.userId,
      sourceWorkspaceAddressId: input.sourceWorkspaceAddressId,
    }));
  } catch (error) {
    next(error);
  }
});

paymentRunsRouter.post('/workspaces/:workspaceId/payment-runs/:paymentRunId/attach-signature', async (req, res, next) => {
  try {
    const { workspaceId, paymentRunId } = paymentRunParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!.userId);
    const input = attachPaymentRunSignatureSchema.parse(req.body);
    res.status(201).json(await attachPaymentRunSignature({
      workspaceId,
      paymentRunId,
      actorUserId: req.auth!.userId,
      submittedSignature: input.submittedSignature,
      submittedAt: input.submittedAt ? new Date(input.submittedAt) : null,
    }));
  } catch (error) {
    next(error);
  }
});

paymentRunsRouter.get('/workspaces/:workspaceId/payment-runs/:paymentRunId/proof', async (req, res, next) => {
  try {
    const { workspaceId, paymentRunId } = paymentRunParamsSchema.parse(req.params);
    await assertWorkspaceAccess(workspaceId, req.auth!.userId);
    res.json(await buildPaymentRunProofPacket(workspaceId, paymentRunId));
  } catch (error) {
    next(error);
  }
});
