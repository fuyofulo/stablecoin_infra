import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import {
  addExceptionNote,
  applyExceptionAction,
  getExceptionDetail,
  getReconciliationDetail,
  getReconciliationExplanation,
  getReconciliationRefreshPreview,
  listReconciliationQueue,
  listWorkspaceExceptions,
  updateExceptionMetadata,
} from '../reconciliation.js';
import {
  REQUEST_STATUSES,
} from '../transfer-request-lifecycle.js';
import { assertWorkspaceAccess } from '../workspace-access.js';
import { listObservedTransfersForWorkspace } from '../observed-transfers.js';
import { asyncRoute, sendCreated, sendJson, sendList } from '../route-helpers.js';

export const eventsRouter = Router();

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const transferRequestParamsSchema = workspaceParamsSchema.extend({
  transferRequestId: z.string().uuid(),
});

const exceptionParamsSchema = workspaceParamsSchema.extend({
  exceptionId: z.string().uuid(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const reconciliationQueueQuerySchema = listQuerySchema.extend({
  displayState: z.enum(['pending', 'matched', 'partial', 'exception']).optional(),
  requestStatus: z.enum(REQUEST_STATUSES).optional(),
});

const exceptionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  status: z.enum(['open', 'reviewed', 'expected', 'dismissed', 'reopened']).optional(),
  severity: z.string().optional(),
  assigneeUserId: z.string().uuid().optional(),
  reasonCode: z.string().trim().min(1).optional(),
});

const exceptionActionSchema = z.object({
  action: z.enum(['reviewed', 'expected', 'dismissed', 'reopen']),
  note: z.string().trim().min(1).max(5000).optional(),
});

const exceptionNoteSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

const exceptionMetadataSchema = z.object({
  assignedToUserId: z.string().uuid().nullable().optional(),
  resolutionCode: z.string().trim().min(1).max(200).nullable().optional(),
  severity: z.enum(['info', 'warning', 'critical']).nullable().optional(),
  note: z.string().trim().min(1).max(5000).optional(),
});

eventsRouter.get('/workspaces/:workspaceId/transfers', asyncRoute(async (req, res) => {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    const query = listQuerySchema.parse(req.query);
    await assertWorkspaceAccess(workspaceId, req.auth!);
    sendList(res, await listObservedTransfersForWorkspace(workspaceId, { limit: query.limit }), { limit: query.limit });
}));

eventsRouter.get('/workspaces/:workspaceId/reconciliation', async (req, res, next) => {
  try {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    const query = reconciliationQueueQuerySchema.parse(req.query);
    await assertWorkspaceAccess(workspaceId, req.auth!);

    const items = await listReconciliationQueue(workspaceId, {
      limit: query.limit,
      displayState: query.displayState,
      requestStatus: query.requestStatus,
    });

    sendList(res, items, { limit: query.limit, displayState: query.displayState ?? null, requestStatus: query.requestStatus ?? null });
  } catch (error) {
    next(error);
  }
});

eventsRouter.get('/workspaces/:workspaceId/reconciliation-queue', async (req, res, next) => {
  try {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    const query = reconciliationQueueQuerySchema.parse(req.query);
    await assertWorkspaceAccess(workspaceId, req.auth!);

    const items = await listReconciliationQueue(workspaceId, {
      limit: query.limit,
      displayState: query.displayState,
      requestStatus: query.requestStatus,
    });

    sendList(res, items, { limit: query.limit, displayState: query.displayState ?? null, requestStatus: query.requestStatus ?? null });
  } catch (error) {
    next(error);
  }
});

eventsRouter.get(
  '/workspaces/:workspaceId/reconciliation-queue/:transferRequestId',
  async (req, res, next) => {
    try {
      const { workspaceId, transferRequestId } = transferRequestParamsSchema.parse(req.params);
      await assertWorkspaceAccess(workspaceId, req.auth!);
      const detail = await getReconciliationDetail(workspaceId, transferRequestId);
      sendJson(res, detail);
    } catch (error) {
      next(error);
    }
  },
);

eventsRouter.get(
  '/workspaces/:workspaceId/reconciliation-queue/:transferRequestId/explain',
  async (req, res, next) => {
    try {
      const { workspaceId, transferRequestId } = transferRequestParamsSchema.parse(req.params);
      await assertWorkspaceAccess(workspaceId, req.auth!);
      const explanation = await getReconciliationExplanation(workspaceId, transferRequestId);
      sendJson(res, explanation);
    } catch (error) {
      next(error);
    }
  },
);

eventsRouter.post(
  '/workspaces/:workspaceId/reconciliation-queue/:transferRequestId/refresh',
  async (req, res, next) => {
    try {
      const { workspaceId, transferRequestId } = transferRequestParamsSchema.parse(req.params);
      await assertWorkspaceAccess(workspaceId, req.auth!);
      const explanation = await getReconciliationRefreshPreview(workspaceId, transferRequestId);
      sendJson(res, explanation);
    } catch (error) {
      next(error);
    }
  },
);

eventsRouter.get('/workspaces/:workspaceId/exceptions', async (req, res, next) => {
  try {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    const query = exceptionsQuerySchema.parse(req.query);
    await assertWorkspaceAccess(workspaceId, req.auth!);

    const items = await listWorkspaceExceptions({
      workspaceId,
      limit: query.limit,
      status: query.status,
      severity: query.severity,
      assigneeUserId: query.assigneeUserId,
      reasonCode: query.reasonCode,
    });

    sendList(res, items, { limit: query.limit, status: query.status ?? null, severity: query.severity ?? null });
  } catch (error) {
    next(error);
  }
});

eventsRouter.patch('/workspaces/:workspaceId/exceptions/:exceptionId', async (req, res, next) => {
  try {
    const { workspaceId, exceptionId } = exceptionParamsSchema.parse(req.params);
    const input = exceptionMetadataSchema.parse(req.body);
    const access = await assertWorkspaceAccess(workspaceId, req.auth!);

    if (input.assignedToUserId) {
      const membership = await prisma.organizationMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: access.workspace.organizationId,
            userId: input.assignedToUserId,
          },
        },
        select: {
          membershipId: true,
          status: true,
        },
      });

      if (!membership || membership.status !== 'active') {
        throw new Error('Assignee must be an active member of this organization');
      }
    }

    const updated = await updateExceptionMetadata({
      workspaceId,
      exceptionId,
      actorUserId: req.auth!.userId,
      assignedToUserId: input.assignedToUserId,
      resolutionCode: input.resolutionCode,
      severity: input.severity,
      note: input.note,
    });

    sendJson(res, updated);
  } catch (error) {
    next(error);
  }
});

eventsRouter.get('/workspaces/:workspaceId/exceptions/:exceptionId', async (req, res, next) => {
  try {
    const { workspaceId, exceptionId } = exceptionParamsSchema.parse(req.params);
    await assertWorkspaceAccess(workspaceId, req.auth!);
    const detail = await getExceptionDetail(workspaceId, exceptionId);
    sendJson(res, detail);
  } catch (error) {
    next(error);
  }
});

eventsRouter.post('/workspaces/:workspaceId/exceptions/:exceptionId/actions', async (req, res, next) => {
  try {
    const { workspaceId, exceptionId } = exceptionParamsSchema.parse(req.params);
    await assertWorkspaceAccess(workspaceId, req.auth!);
    const input = exceptionActionSchema.parse(req.body);

    const updated = await applyExceptionAction({
      workspaceId,
      exceptionId,
      action: input.action,
      actorUserId: req.auth!.userId,
      note: input.note,
    });

    sendJson(res, updated);
  } catch (error) {
    next(error);
  }
});

eventsRouter.post('/workspaces/:workspaceId/exceptions/:exceptionId/notes', async (req, res, next) => {
  try {
    const { workspaceId, exceptionId } = exceptionParamsSchema.parse(req.params);
    await assertWorkspaceAccess(workspaceId, req.auth!);
    const input = exceptionNoteSchema.parse(req.body);

    const note = await addExceptionNote({
      workspaceId,
      exceptionId,
      actorUserId: req.auth!.userId,
      body: input.body,
    });

    sendCreated(res, note);
  } catch (error) {
    next(error);
  }
});
