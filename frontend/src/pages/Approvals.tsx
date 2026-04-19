import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { AuthenticatedSession, PaymentOrder, PaymentRun } from '../types';
import { formatRawUsdcCompact, formatRelativeTime, shortenAddress } from '../domain';
import { useToast } from '../ui/Toast';
import { approvalReasonLine } from '../status-labels';

type PendingGroup =
  | { kind: 'run'; key: string; run: PaymentRun; orders: PaymentOrder[] }
  | { kind: 'single'; key: string; order: PaymentOrder };

type DecisionEntry = {
  order: PaymentOrder;
  decision: NonNullable<PaymentOrder['reconciliationDetail']>['approvalDecisions'][number];
};

type HistoryGroup =
  | { kind: 'run'; key: string; run: PaymentRun; entries: DecisionEntry[] }
  | { kind: 'single'; key: string; entry: DecisionEntry };

function assetSymbol(asset: string | undefined): string {
  return (asset ?? 'usdc').toUpperCase();
}

function sumRaw(orders: PaymentOrder[]): string {
  let total = 0n;
  for (const o of orders) {
    try {
      total += BigInt(o.amountRaw);
    } catch {
      // ignore
    }
  }
  return total.toString();
}

export function ApprovalsPage({ session: _session }: { session: AuthenticatedSession }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [expandedHistoryRunId, setExpandedHistoryRunId] = useState<string | null>(null);

  const runIdFilter = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('runId');
  }, [location.search]);

  const ordersQuery = useQuery({
    queryKey: ['payment-orders', workspaceId] as const,
    queryFn: () => api.listPaymentOrders(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 5_000,
  });
  const runsQuery = useQuery({
    queryKey: ['payment-runs', workspaceId] as const,
    queryFn: () => api.listPaymentRuns(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 5_000,
  });
  const batchRunQuery = useQuery({
    queryKey: ['payment-run', workspaceId, runIdFilter] as const,
    queryFn: () => api.getPaymentRunDetail(workspaceId!, runIdFilter!),
    enabled: Boolean(workspaceId && runIdFilter),
  });

  const singleDecisionMutation = useMutation({
    mutationFn: ({ order, action }: { order: PaymentOrder; action: 'approve' | 'reject' }) => {
      if (!order.transferRequestId) {
        throw new Error('This payment has no linked approval request yet.');
      }
      return api.createApprovalDecision(workspaceId!, order.transferRequestId, { action });
    },
    onSuccess: async (_result, vars) => {
      success(`Marked ${shortenAddress(vars.order.paymentOrderId, 4, 4)} as ${vars.action === 'approve' ? 'approved' : 'rejected'}.`);
      await queryClient.invalidateQueries({ queryKey: ['payment-orders', workspaceId] });
    },
    onError: (err) => toastError(err instanceof Error ? err.message : 'Could not record decision.'),
  });

  const batchDecisionMutation = useMutation({
    mutationFn: async ({ orders, action }: { orders: PaymentOrder[]; action: 'approve' | 'reject' }) => {
      const pending = orders.filter((o) => o.derivedState === 'pending_approval' && o.transferRequestId);
      const results = await Promise.allSettled(
        pending.map((o) =>
          api.createApprovalDecision(workspaceId!, o.transferRequestId!, { action }),
        ),
      );
      const done = results.filter((r) => r.status === 'fulfilled').length;
      const failed = pending.length - done;
      return { done, failed, action };
    },
    onSuccess: async ({ done, failed, action }) => {
      if (failed) {
        toastError(
          `${action === 'approve' ? 'Approved' : 'Rejected'} ${done}. ${failed} failed — retry below.`,
        );
      } else {
        success(`${action === 'approve' ? 'Approved' : 'Rejected'} ${done} payment${done === 1 ? '' : 's'}.`);
      }
      await queryClient.invalidateQueries({ queryKey: ['payment-orders', workspaceId] });
    },
    onError: (err) => toastError(err instanceof Error ? err.message : 'Could not record decisions.'),
  });

  if (!workspaceId) {
    return (
      <main className="page-frame">
        <div className="rd-state">
          <h2 className="rd-state-title">Workspace unavailable</h2>
          <p className="rd-state-body">Pick a workspace from the sidebar.</p>
        </div>
      </main>
    );
  }

  const allOrders = ordersQuery.data?.items ?? [];
  const runs = runsQuery.data?.items ?? [];
  const scopedOrders = runIdFilter
    ? allOrders.filter((o) => o.paymentRunId === runIdFilter)
    : allOrders;
  const pending = scopedOrders.filter((o) => o.derivedState === 'pending_approval');
  const history = scopedOrders.filter((o) => {
    const decisions = o.reconciliationDetail?.approvalDecisions ?? [];
    return decisions.some((d) => ['approve', 'reject', 'escalate'].includes(d.action));
  });

  const latestDecisions = history
    .map((o) => {
      const decisions = (o.reconciliationDetail?.approvalDecisions ?? [])
        .filter((d) => ['approve', 'reject', 'escalate'].includes(d.action))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const latest = decisions[0];
      return latest ? { order: o, decision: latest } : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => new Date(b.decision.createdAt).getTime() - new Date(a.decision.createdAt).getTime());

  const approvedCount = latestDecisions.filter((x) => x.decision.action === 'approve').length;
  const rejectedCount = latestDecisions.filter((x) => x.decision.action === 'reject').length;
  const escalatedCount = latestDecisions.filter((x) => x.decision.action === 'escalate').length;

  const pendingStandalone = pending.filter((o) => !o.paymentRunId);
  const pendingByRun = new Map<string, PaymentOrder[]>();
  for (const o of pending) {
    if (!o.paymentRunId) continue;
    const list = pendingByRun.get(o.paymentRunId) ?? [];
    list.push(o);
    pendingByRun.set(o.paymentRunId, list);
  }
  const pendingRuns = runs.filter((r) => pendingByRun.has(r.paymentRunId));

  const historyStandalone = latestDecisions.filter((x) => !x.order.paymentRunId);
  const historyByRun = new Map<string, DecisionEntry[]>();
  for (const entry of latestDecisions) {
    const runId = entry.order.paymentRunId;
    if (!runId) continue;
    const list = historyByRun.get(runId) ?? [];
    list.push(entry);
    historyByRun.set(runId, list);
  }
  const historyRuns = runs.filter((r) => historyByRun.has(r.paymentRunId));

  const historyGroups: HistoryGroup[] = [
    ...historyRuns.map<HistoryGroup>((r) => ({
      kind: 'run' as const,
      key: `hrun:${r.paymentRunId}`,
      run: r,
      entries: (historyByRun.get(r.paymentRunId) ?? []).sort(
        (a, b) => new Date(b.decision.createdAt).getTime() - new Date(a.decision.createdAt).getTime(),
      ),
    })),
    ...historyStandalone.map<HistoryGroup>((entry) => ({
      kind: 'single' as const,
      key: `hsingle:${entry.order.paymentOrderId}`,
      entry,
    })),
  ].sort((a, b) => {
    const aTime = a.kind === 'run'
      ? Math.max(...a.entries.map((e) => new Date(e.decision.createdAt).getTime()))
      : new Date(a.entry.decision.createdAt).getTime();
    const bTime = b.kind === 'run'
      ? Math.max(...b.entries.map((e) => new Date(e.decision.createdAt).getTime()))
      : new Date(b.entry.decision.createdAt).getTime();
    return bTime - aTime;
  });

  const pendingGroups: PendingGroup[] = [
    ...pendingRuns.map<PendingGroup>((r) => ({
      kind: 'run' as const,
      key: `run:${r.paymentRunId}`,
      run: r,
      orders: pendingByRun.get(r.paymentRunId) ?? [],
    })),
    ...pendingStandalone.map<PendingGroup>((o) => ({
      kind: 'single' as const,
      key: `single:${o.paymentOrderId}`,
      order: o,
    })),
  ];

  const batchRun = batchRunQuery.data;
  const busy = singleDecisionMutation.isPending || batchDecisionMutation.isPending;
  const isLoading = ordersQuery.isLoading;

  return (
    <main className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">Approvals</p>
          <h1>Approval queue</h1>
          <p>
            Every payment that policy routed for human review. Approve a whole batch at once or expand it to
            decide payment-by-payment. Full decision history below.
          </p>
        </div>
      </header>

      {runIdFilter ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid var(--ax-border)',
            background: 'var(--ax-surface-2)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--ax-text-muted)',
              }}
            >
              Reviewing batch
            </span>
            <strong style={{ color: 'var(--ax-text)' }}>
              {batchRun?.runName ?? 'Loading batch…'}
            </strong>
            <span style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
              {batchRun
                ? `${pending.length} of ${batchRun.totals.orderCount} awaiting individual review`
                : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              to={`/workspaces/${workspaceId}/runs/${runIdFilter}`}
              className="rd-btn rd-btn-secondary"
              style={{ textDecoration: 'none' }}
            >
              ← Back to run
            </Link>
            <Link
              to={`/workspaces/${workspaceId}/approvals`}
              className="rd-btn rd-btn-ghost"
              style={{ textDecoration: 'none' }}
            >
              Clear filter
            </Link>
          </div>
        </div>
      ) : null}

      <div className="rd-metrics">
        <div className="rd-metric">
          <span className="rd-metric-label">Pending</span>
          <span className="rd-metric-value" data-tone={pending.length > 0 ? 'warning' : undefined}>
            {pending.length}
          </span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Approved</span>
          <span className="rd-metric-value" data-tone="success">
            {approvedCount}
          </span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Rejected</span>
          <span className="rd-metric-value" data-tone={rejectedCount > 0 ? 'danger' : undefined}>
            {rejectedCount}
          </span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Escalated</span>
          <span className="rd-metric-value">{escalatedCount}</span>
        </div>
      </div>

      <section className="rd-section" style={{ marginTop: 0 }}>
        <div className="rd-section-head">
          <div>
            <h2 className="rd-section-title">Pending approvals</h2>
            <p className="rd-section-sub">
              Payments blocked by policy or destination trust until a human decision is recorded.
            </p>
          </div>
          <span className="rd-section-meta">
            {pendingGroups.length} group{pendingGroups.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="rd-table-shell">
          {isLoading ? (
            <div style={{ padding: 16 }}>
              <div className="rd-skeleton rd-skeleton-block" style={{ height: 56, marginBottom: 8 }} />
              <div className="rd-skeleton rd-skeleton-block" style={{ height: 56 }} />
            </div>
          ) : pendingGroups.length === 0 ? (
            <div className="rd-empty-cell" style={{ padding: '64px 24px' }}>
              <strong>No approvals waiting</strong>
              <p style={{ margin: 0 }}>Payments requiring approval will appear here.</p>
            </div>
          ) : (
            <table className="rd-table">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Recipient / Batch</th>
                  <th style={{ width: '8%' }}>Items</th>
                  <th className="rd-num" style={{ width: '14%' }}>
                    Amount
                  </th>
                  <th style={{ width: '22%' }}>Reason</th>
                  <th style={{ width: '10%' }}>Age</th>
                  <th style={{ width: '18%' }} aria-label="Decision" />
                </tr>
              </thead>
              <tbody>
                {pendingGroups.map((group) => {
                  if (group.kind === 'run') {
                    const expanded = expandedRunId === group.run.paymentRunId;
                    return (
                      <PendingRunRows
                        key={group.key}
                        workspaceId={workspaceId}
                        group={group}
                        expanded={expanded}
                        busy={busy}
                        onToggle={() =>
                          setExpandedRunId((curr) =>
                            curr === group.run.paymentRunId ? null : group.run.paymentRunId,
                          )
                        }
                        onApproveBatch={() =>
                          batchDecisionMutation.mutate({ orders: group.orders, action: 'approve' })
                        }
                        onRejectBatch={() =>
                          batchDecisionMutation.mutate({ orders: group.orders, action: 'reject' })
                        }
                        onApproveOne={(order) =>
                          singleDecisionMutation.mutate({ order, action: 'approve' })
                        }
                        onRejectOne={(order) =>
                          singleDecisionMutation.mutate({ order, action: 'reject' })
                        }
                      />
                    );
                  }
                  const order = group.order;
                  return (
                    <tr key={group.key}>
                      <td>
                        <div className="rd-recipient-main">
                          <Link
                            to={`/workspaces/${workspaceId}/payments/${order.paymentOrderId}#approval`}
                            style={{
                              color: 'var(--ax-text)',
                              textDecoration: 'none',
                              fontWeight: 500,
                            }}
                          >
                            {order.counterparty?.displayName ?? order.destination.label}
                          </Link>
                          <span className="rd-recipient-ref">
                            Single · {shortenAddress(order.paymentOrderId, 6, 4)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span style={{ color: 'var(--ax-text-faint)', fontSize: 12 }}>1</span>
                      </td>
                      <td className="rd-num">
                        {formatRawUsdcCompact(order.amountRaw)} {assetSymbol(order.asset)}
                      </td>
                      <td>
                        <span style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
                          {approvalReasonLine(order)}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
                          {formatRelativeTime(order.createdAt)}
                        </span>
                      </td>
                      <td>
                        <DecisionButtons
                          busy={busy}
                          onApprove={() => singleDecisionMutation.mutate({ order, action: 'approve' })}
                          onReject={() => singleDecisionMutation.mutate({ order, action: 'reject' })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="rd-section">
        <div className="rd-section-head">
          <div>
            <h2 className="rd-section-title">Decision history</h2>
            <p className="rd-section-sub">Resolved approval decisions only. Batches expand to reveal each payment's decision.</p>
          </div>
          <span className="rd-section-meta">
            {historyGroups.length} group{historyGroups.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="rd-table-shell">
          {historyGroups.length === 0 ? (
            <div className="rd-empty-cell" style={{ padding: '48px 24px' }}>
              <strong>No decisions yet</strong>
              <p style={{ margin: 0 }}>Decisions appear here once approvals are routed or recorded.</p>
            </div>
          ) : (
            <table className="rd-table">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Recipient / Batch</th>
                  <th style={{ width: '8%' }}>Items</th>
                  <th className="rd-num" style={{ width: '14%' }}>
                    Amount
                  </th>
                  <th style={{ width: '16%' }}>Decision</th>
                  <th style={{ width: '18%' }}>Actor</th>
                  <th style={{ width: '16%' }}>When</th>
                </tr>
              </thead>
              <tbody>
                {historyGroups.map((group) => {
                  if (group.kind === 'run') {
                    const expanded = expandedHistoryRunId === group.run.paymentRunId;
                    return (
                      <HistoryRunRows
                        key={group.key}
                        workspaceId={workspaceId}
                        group={group}
                        expanded={expanded}
                        onToggle={() =>
                          setExpandedHistoryRunId((curr) =>
                            curr === group.run.paymentRunId ? null : group.run.paymentRunId,
                          )
                        }
                      />
                    );
                  }
                  return (
                    <HistorySingleRow
                      key={group.key}
                      workspaceId={workspaceId}
                      entry={group.entry}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}

function PendingRunRows(props: {
  workspaceId: string;
  group: Extract<PendingGroup, { kind: 'run' }>;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onApproveBatch: () => void;
  onRejectBatch: () => void;
  onApproveOne: (order: PaymentOrder) => void;
  onRejectOne: (order: PaymentOrder) => void;
}) {
  const {
    workspaceId,
    group,
    expanded,
    busy,
    onToggle,
    onApproveBatch,
    onRejectBatch,
    onApproveOne,
    onRejectOne,
  } = props;
  const { run, orders } = group;
  const totalRaw = sumRaw(orders);
  return (
    <>
      <tr
        style={{ cursor: 'pointer', background: expanded ? 'var(--ax-surface-2)' : undefined }}
        onClick={onToggle}
      >
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Chevron expanded={expanded} />
            <div className="rd-recipient-main">
              <span className="rd-recipient-name">{run.runName}</span>
              <span className="rd-recipient-ref">
                Batch · {shortenAddress(run.paymentRunId, 6, 4)}
              </span>
            </div>
          </div>
        </td>
        <td>
          <span style={{ fontSize: 13, color: 'var(--ax-text-secondary)' }}>{orders.length}</span>
        </td>
        <td className="rd-num">{formatRawUsdcCompact(totalRaw)} USDC</td>
        <td>
          <span style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
            Policy routed this batch for review. Expand to decide one by one.
          </span>
        </td>
        <td>
          <span style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
            {formatRelativeTime(run.createdAt)}
          </span>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <DecisionButtons
            busy={busy}
            approveLabel={`Approve batch (${orders.length})`}
            rejectLabel="Reject batch"
            onApprove={onApproveBatch}
            onReject={onRejectBatch}
          />
        </td>
      </tr>
      {expanded
        ? orders.map((order) => (
            <tr key={`child:${order.paymentOrderId}`} style={{ background: 'var(--ax-surface)' }}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 28 }}>
                  <span
                    aria-hidden
                    style={{
                      color: 'var(--ax-text-faint)',
                      fontFamily: 'var(--ax-font-mono)',
                      fontSize: 11,
                    }}
                  >
                    ↳
                  </span>
                  <div className="rd-recipient-main">
                    <Link
                      to={`/workspaces/${workspaceId}/payments/${order.paymentOrderId}#approval`}
                      style={{
                        color: 'var(--ax-text)',
                        textDecoration: 'none',
                        fontWeight: 500,
                      }}
                    >
                      {order.counterparty?.displayName ?? order.destination.label}
                    </Link>
                    <span className="rd-recipient-ref">
                      {order.externalReference
                        ?? order.invoiceNumber
                        ?? shortenAddress(order.paymentOrderId, 6, 4)}
                    </span>
                  </div>
                </div>
              </td>
              <td>
                <span style={{ fontSize: 12, color: 'var(--ax-text-faint)' }}>—</span>
              </td>
              <td className="rd-num">
                {formatRawUsdcCompact(order.amountRaw)} {assetSymbol(order.asset)}
              </td>
              <td>
                <span style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
                  {approvalReasonLine(order)}
                </span>
              </td>
              <td>
                <span style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
                  {formatRelativeTime(order.createdAt)}
                </span>
              </td>
              <td>
                <DecisionButtons
                  busy={busy}
                  onApprove={() => onApproveOne(order)}
                  onReject={() => onRejectOne(order)}
                />
              </td>
            </tr>
          ))
        : null}
    </>
  );
}

function HistoryRunRows(props: {
  workspaceId: string;
  group: Extract<HistoryGroup, { kind: 'run' }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { workspaceId, group, expanded, onToggle } = props;
  const { run, entries } = group;
  const approved = entries.filter((e) => e.decision.action === 'approve').length;
  const rejected = entries.filter((e) => e.decision.action === 'reject').length;
  const escalated = entries.filter((e) => e.decision.action === 'escalate').length;
  const totalRaw = sumRaw(entries.map((e) => e.order));
  const actors = Array.from(
    new Set(entries.map((e) => e.decision.actorUser?.email ?? 'System')),
  );
  const latest = entries
    .map((e) => new Date(e.decision.createdAt).getTime())
    .reduce((a, b) => Math.max(a, b), 0);

  let badge: { tone: 'success' | 'danger' | 'warning' | 'info'; label: string };
  if (approved && !rejected && !escalated) {
    badge = { tone: 'success', label: `Approved (${approved})` };
  } else if (rejected && !approved && !escalated) {
    badge = { tone: 'danger', label: `Rejected (${rejected})` };
  } else if (escalated && !approved && !rejected) {
    badge = { tone: 'warning', label: `Escalated (${escalated})` };
  } else {
    const parts: string[] = [];
    if (approved) parts.push(`${approved} approved`);
    if (rejected) parts.push(`${rejected} rejected`);
    if (escalated) parts.push(`${escalated} escalated`);
    badge = { tone: 'info', label: `Mixed · ${parts.join(' · ')}` };
  }

  return (
    <>
      <tr
        style={{ cursor: 'pointer', background: expanded ? 'var(--ax-surface-2)' : undefined }}
        onClick={onToggle}
      >
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Chevron expanded={expanded} />
            <div className="rd-recipient-main">
              <Link
                to={`/workspaces/${workspaceId}/runs/${run.paymentRunId}`}
                onClick={(e) => e.stopPropagation()}
                style={{ color: 'var(--ax-text)', textDecoration: 'none', fontWeight: 500 }}
              >
                {run.runName}
              </Link>
              <span className="rd-recipient-ref">
                Batch · {shortenAddress(run.paymentRunId, 6, 4)}
              </span>
            </div>
          </div>
        </td>
        <td>
          <span style={{ fontSize: 13, color: 'var(--ax-text-secondary)' }}>{entries.length}</span>
        </td>
        <td className="rd-num">{formatRawUsdcCompact(totalRaw)} USDC</td>
        <td>
          <span className="rd-pill" data-tone={badge.tone}>
            <span className="rd-pill-dot" aria-hidden />
            {badge.label}
          </span>
        </td>
        <td>
          <span style={{ fontSize: 13, color: 'var(--ax-text-secondary)' }}>
            {actors.length === 1 ? actors[0] : `${actors.length} reviewers`}
          </span>
        </td>
        <td>
          <span style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
            {formatRelativeTime(new Date(latest).toISOString())}
          </span>
        </td>
      </tr>
      {expanded
        ? entries.map(({ order, decision }) => {
            const tone =
              decision.action === 'approve'
                ? 'success'
                : decision.action === 'reject'
                  ? 'danger'
                  : 'warning';
            return (
              <tr
                key={`hchild:${order.paymentOrderId}:${decision.approvalDecisionId ?? decision.createdAt}`}
                style={{ background: 'var(--ax-surface)' }}
              >
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 28 }}>
                    <span
                      aria-hidden
                      style={{
                        color: 'var(--ax-text-faint)',
                        fontFamily: 'var(--ax-font-mono)',
                        fontSize: 11,
                      }}
                    >
                      ↳
                    </span>
                    <div className="rd-recipient-main">
                      <Link
                        to={`/workspaces/${workspaceId}/payments/${order.paymentOrderId}#approval`}
                        style={{
                          color: 'var(--ax-text)',
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                      >
                        {order.counterparty?.displayName ?? order.destination.label}
                      </Link>
                      <span className="rd-recipient-ref">
                        {order.externalReference
                          ?? order.invoiceNumber
                          ?? shortenAddress(order.paymentOrderId, 6, 4)}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <span style={{ fontSize: 12, color: 'var(--ax-text-faint)' }}>—</span>
                </td>
                <td className="rd-num">
                  {formatRawUsdcCompact(order.amountRaw)} {assetSymbol(order.asset)}
                </td>
                <td>
                  <span className="rd-pill" data-tone={tone}>
                    <span className="rd-pill-dot" aria-hidden />
                    {decision.action}
                  </span>
                </td>
                <td>
                  <span style={{ fontSize: 13, color: 'var(--ax-text-secondary)' }}>
                    {decision.actorUser?.email ?? 'System'}
                  </span>
                </td>
                <td>
                  <span style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
                    {formatRelativeTime(decision.createdAt)}
                  </span>
                </td>
              </tr>
            );
          })
        : null}
    </>
  );
}

function HistorySingleRow({ workspaceId, entry }: { workspaceId: string; entry: DecisionEntry }) {
  const { order, decision } = entry;
  const tone =
    decision.action === 'approve'
      ? 'success'
      : decision.action === 'reject'
        ? 'danger'
        : 'warning';
  return (
    <tr>
      <td>
        <div className="rd-recipient-main">
          <Link
            to={`/workspaces/${workspaceId}/payments/${order.paymentOrderId}#approval`}
            style={{ color: 'var(--ax-text)', textDecoration: 'none', fontWeight: 500 }}
          >
            {order.counterparty?.displayName ?? order.destination.label}
          </Link>
          <span className="rd-recipient-ref">
            Single · {shortenAddress(order.paymentOrderId, 6, 4)}
          </span>
        </div>
      </td>
      <td>
        <span style={{ color: 'var(--ax-text-faint)', fontSize: 12 }}>1</span>
      </td>
      <td className="rd-num">
        {formatRawUsdcCompact(order.amountRaw)} {assetSymbol(order.asset)}
      </td>
      <td>
        <span className="rd-pill" data-tone={tone}>
          <span className="rd-pill-dot" aria-hidden />
          {decision.action}
        </span>
      </td>
      <td>
        <span style={{ fontSize: 13, color: 'var(--ax-text-secondary)' }}>
          {decision.actorUser?.email ?? 'System'}
        </span>
      </td>
      <td>
        <span style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
          {formatRelativeTime(decision.createdAt)}
        </span>
      </td>
    </tr>
  );
}

function DecisionButtons(props: {
  busy: boolean;
  approveLabel?: string;
  rejectLabel?: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { busy, approveLabel = 'Approve', rejectLabel = 'Reject', onApprove, onReject } = props;
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button
        type="button"
        className="rd-btn rd-btn-primary"
        style={{ minHeight: 28, padding: '4px 10px', fontSize: 12 }}
        onClick={onApprove}
        disabled={busy}
      >
        {approveLabel}
      </button>
      <button
        type="button"
        className="rd-btn rd-btn-danger"
        style={{ minHeight: 28, padding: '4px 10px', fontSize: 12 }}
        onClick={onReject}
        disabled={busy}
      >
        {rejectLabel}
      </button>
    </div>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        width: 16,
        height: 16,
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ax-text-muted)',
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 150ms ease',
      }}
    >
      <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3l5 5-5 5" />
      </svg>
    </span>
  );
}
