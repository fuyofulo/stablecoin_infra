import { Router } from 'express';
import { z } from 'zod';
import { queryClickHouse } from '../clickhouse.js';
import { config } from '../config.js';
import { listWorkspaceExceptions } from '../reconciliation.js';
import { prisma } from '../prisma.js';
import { assertWorkspaceAccess } from '../workspace-access.js';
import { listWorkspaceAuditLog } from '../workspace-audit-log.js';

export const opsRouter = Router();

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(250).default(100),
  entityType: z.enum(['payment_order', 'transfer_request', 'approval', 'execution', 'exception']).optional(),
});

type TxHealthRow = {
  observed_count: string | number;
  latest_slot: string | number | null;
  latest_event_time: string | null;
  latest_worker_received_at: string | null;
  latest_tx_write_at: string | null;
  p50_yellowstone_to_worker_ms: string | number | null;
  p95_yellowstone_to_worker_ms: string | number | null;
  p50_event_to_write_ms: string | number | null;
  p95_event_to_write_ms: string | number | null;
};

type MatchHealthRow = {
  match_count: string | number;
  latest_match_at: string | null;
  p50_chain_to_match_ms: string | number | null;
  p95_chain_to_match_ms: string | number | null;
};

opsRouter.get('/workspaces/:workspaceId/members', async (req, res, next) => {
  try {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    const access = await assertWorkspaceAccess(workspaceId, req.auth!);

    const items = await prisma.organizationMembership.findMany({
      where: {
        organizationId: access.workspace.organizationId,
        status: 'active',
      },
      include: {
        user: {
          select: {
            userId: true,
            email: true,
            displayName: true,
          },
        },
      },
      orderBy: [
        { role: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    res.json({
      items: items.map((membership) => ({
        membershipId: membership.membershipId,
        role: membership.role,
        status: membership.status,
        user: membership.user,
      })),
    });
  } catch (error) {
    next(error);
  }
});

opsRouter.get('/workspaces/:workspaceId/audit-log', async (req, res, next) => {
  try {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    const query = auditLogQuerySchema.parse(req.query);
    await assertWorkspaceAccess(workspaceId, req.auth!);

    res.json(await listWorkspaceAuditLog({
      workspaceId,
      limit: query.limit,
      entityType: query.entityType,
    }));
  } catch (error) {
    next(error);
  }
});

opsRouter.get('/workspaces/:workspaceId/ops-health', async (req, res, next) => {
  try {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    await assertWorkspaceAccess(workspaceId, req.auth!);

    await prisma.$queryRaw`SELECT 1`;

    const [txRows, matchRows, exceptionRows] = await Promise.all([
      queryClickHouse<TxHealthRow>(`
        WITH recent AS (
          SELECT slot, event_time, worker_received_at, yellowstone_created_at, created_at
          FROM ${config.clickhouseDatabase}.observed_transactions
          ORDER BY created_at DESC
          LIMIT 200
        )
        SELECT
          count() AS observed_count,
          max(slot) AS latest_slot,
          max(event_time) AS latest_event_time,
          max(worker_received_at) AS latest_worker_received_at,
          max(created_at) AS latest_tx_write_at,
          quantileTDigestIf(0.5)(
            dateDiff('millisecond', yellowstone_created_at, worker_received_at),
            NOT isNull(yellowstone_created_at) AND NOT isNull(worker_received_at)
          ) AS p50_yellowstone_to_worker_ms,
          quantileTDigestIf(0.95)(
            dateDiff('millisecond', yellowstone_created_at, worker_received_at),
            NOT isNull(yellowstone_created_at) AND NOT isNull(worker_received_at)
          ) AS p95_yellowstone_to_worker_ms,
          quantileTDigestIf(0.5)(
            dateDiff('millisecond', event_time, created_at),
            NOT isNull(event_time) AND NOT isNull(created_at)
          ) AS p50_event_to_write_ms,
          quantileTDigestIf(0.95)(
            dateDiff('millisecond', event_time, created_at),
            NOT isNull(event_time) AND NOT isNull(created_at)
          ) AS p95_event_to_write_ms
        FROM recent
        FORMAT JSONEachRow
      `),
      queryClickHouse<MatchHealthRow>(`
        WITH recent AS (
          SELECT observed_event_time, matched_at, updated_at
          FROM ${config.clickhouseDatabase}.settlement_matches
          WHERE workspace_id = toUUID('${workspaceId}')
          ORDER BY updated_at DESC
          LIMIT 200
        )
        SELECT
          count() AS match_count,
          max(updated_at) AS latest_match_at,
          quantileTDigestIf(0.5)(
            dateDiff('millisecond', observed_event_time, matched_at),
            NOT isNull(observed_event_time) AND NOT isNull(matched_at)
          ) AS p50_chain_to_match_ms,
          quantileTDigestIf(0.95)(
            dateDiff('millisecond', observed_event_time, matched_at),
            NOT isNull(observed_event_time) AND NOT isNull(matched_at)
          ) AS p95_chain_to_match_ms
        FROM recent
        FORMAT JSONEachRow
      `),
      listWorkspaceExceptions({ workspaceId, limit: 5000 }),
    ]);

    const tx = txRows[0] ?? null;
    const match = matchRows[0] ?? null;
    const latestWorkerReceivedAt = normalizeClickHouseDateTime(tx?.latest_worker_received_at ?? null);
    const workerFreshnessMs = latestWorkerReceivedAt
      ? Date.now() - new Date(latestWorkerReceivedAt).getTime()
      : null;

    res.json({
      postgres: 'ok',
      workerStatus: deriveWorkerStatus(workerFreshnessMs),
      latestSlot: tx?.latest_slot === null || tx?.latest_slot === undefined ? null : Number(tx.latest_slot),
      latestEventTime: normalizeClickHouseDateTime(tx?.latest_event_time ?? null),
      latestWorkerReceivedAt,
      latestTxWriteAt: normalizeClickHouseDateTime(tx?.latest_tx_write_at ?? null),
      latestMatchAt: normalizeClickHouseDateTime(match?.latest_match_at ?? null),
      workerFreshnessMs,
      observedTransactionCount: Number(tx?.observed_count ?? 0),
      matchCount: Number(match?.match_count ?? 0),
      openExceptionCount: exceptionRows.filter((item) => item.status !== 'dismissed').length,
      latencies: {
        yellowstoneToWorkerMs: {
          p50: numberOrNull(tx?.p50_yellowstone_to_worker_ms),
          p95: numberOrNull(tx?.p95_yellowstone_to_worker_ms),
        },
        chainToWriteMs: {
          p50: numberOrNull(tx?.p50_event_to_write_ms),
          p95: numberOrNull(tx?.p95_event_to_write_ms),
        },
        chainToMatchMs: {
          p50: numberOrNull(match?.p50_chain_to_match_ms),
          p95: numberOrNull(match?.p95_chain_to_match_ms),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

function normalizeClickHouseDateTime(value: string | null) {
  return value ? `${value.replace(' ', 'T')}Z` : null;
}

function numberOrNull(value: string | number | null | undefined) {
  return value === null || value === undefined ? null : Number(value);
}

function deriveWorkerStatus(workerFreshnessMs: number | null) {
  if (workerFreshnessMs === null) {
    return 'offline';
  }
  if (workerFreshnessMs < 30_000) {
    return 'healthy';
  }
  if (workerFreshnessMs < 120_000) {
    return 'degraded';
  }
  return 'stale';
}
