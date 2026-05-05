import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { AuthenticatedSession, PaymentOrder, PaymentRun } from '../types';
import { formatRawUsdcCompact, orbTransactionUrl, shortenAddress } from '../domain';
import { displayPaymentStatus, displayRunStatus, statusToneForPayment } from '../status-labels';

type Filter = 'all' | 'ready_to_sign' | 'in_flight' | 'executed';

type ExecutionGroup =
  | { kind: 'run'; key: string; run: PaymentRun; orders: PaymentOrder[] }
  | { kind: 'single'; key: string; order: PaymentOrder };

function assetSymbol(asset: string | undefined): string {
  return (asset ?? 'usdc').toUpperCase();
}

function toneToPill(tone: 'success' | 'warning' | 'danger' | 'neutral'): 'success' | 'warning' | 'danger' | 'info' {
  return tone === 'success' ? 'success' : tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'info';
}

function hasExecutionRecorded(order: PaymentOrder): boolean {
  if (order.reconciliationDetail?.latestExecution?.submittedSignature) return true;
  if (order.reconciliationDetail?.latestExecution?.submittedAt) return true;
  return (
    order.derivedState === 'execution_recorded'
    || order.derivedState === 'partially_settled'
    || order.derivedState === 'settled'
    || order.derivedState === 'closed'
  );
}

function executionActionLabel(order: PaymentOrder): string {
  if (order.derivedState === 'ready_for_execution') return 'Open signer';
  if (order.derivedState === 'execution_recorded') return 'Track settlement';
  if (order.derivedState === 'exception' || order.derivedState === 'partially_settled') return 'Resolve';
  return 'Open';
}

const IN_SCOPE_STATES = [
  'approved',
  'ready_for_execution',
  'execution_recorded',
  'partially_settled',
  'exception',
  'settled',
  'closed',
] as const;

function orderInFilter(order: PaymentOrder, filter: Filter): boolean {
  const s = order.derivedState;
  if (filter === 'all') return (IN_SCOPE_STATES as readonly string[]).includes(s);
  if (filter === 'ready_to_sign') return ['approved', 'ready_for_execution'].includes(s);
  if (filter === 'in_flight') return s === 'execution_recorded';
  if (filter === 'executed') return ['settled', 'closed'].includes(s);
  return false;
}

function runInFilter(run: PaymentRun, filter: Filter): boolean {
  const s = run.derivedState;
  if (filter === 'all') return (IN_SCOPE_STATES as readonly string[]).includes(s);
  if (filter === 'ready_to_sign') return ['approved', 'ready_for_execution'].includes(s);
  if (filter === 'in_flight') return s === 'execution_recorded';
  if (filter === 'executed') return ['settled', 'closed'].includes(s);
  return false;
}

export function ExecutionPage({ session: _session }: { session: AuthenticatedSession }) {
  const { organizationId } = useParams<{ organizationId: string }>();
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: ['payment-orders', organizationId] as const,
    queryFn: () => api.listPaymentOrders(organizationId!),
    enabled: Boolean(organizationId),
    refetchInterval: 5_000,
  });
  const runsQuery = useQuery({
    queryKey: ['payment-runs', organizationId] as const,
    queryFn: () => api.listPaymentRuns(organizationId!),
    enabled: Boolean(organizationId),
    refetchInterval: 5_000,
  });

  if (!organizationId) {
    return (
      <main className="page-frame">
        <div className="rd-state">
          <h2 className="rd-state-title">Organization unavailable</h2>
          <p className="rd-state-body">Pick a organization from the sidebar.</p>
        </div>
      </main>
    );
  }

  const orders = ordersQuery.data?.items ?? [];
  const runs = runsQuery.data?.items ?? [];
  const standaloneOrders = orders.filter((o) => !o.paymentRunId);

  const ordersByRun = useMemo(() => {
    const map = new Map<string, PaymentOrder[]>();
    for (const o of orders) {
      if (!o.paymentRunId) continue;
      const list = map.get(o.paymentRunId) ?? [];
      list.push(o);
      map.set(o.paymentRunId, list);
    }
    return map;
  }, [orders]);

  const visibleRuns = runs.filter((r) => runInFilter(r, filter));
  const visibleStandalone = standaloneOrders.filter((o) => orderInFilter(o, filter));

  const groups: ExecutionGroup[] = [
    ...visibleRuns.map<ExecutionGroup>((r) => ({
      kind: 'run' as const,
      key: `run:${r.paymentRunId}`,
      run: r,
      orders: ordersByRun.get(r.paymentRunId) ?? [],
    })),
    ...visibleStandalone.map<ExecutionGroup>((o) => ({
      kind: 'single' as const,
      key: `single:${o.paymentOrderId}`,
      order: o,
    })),
  ];

  const scopedOrders = orders.filter((o) => (IN_SCOPE_STATES as readonly string[]).includes(o.derivedState));
  const readyToSignCount = scopedOrders.filter((o) => ['approved', 'ready_for_execution'].includes(o.derivedState)).length;
  const inFlightCount = scopedOrders.filter((o) => o.derivedState === 'execution_recorded').length;
  const executedCount = orders.filter((o) => hasExecutionRecorded(o)).length;

  const isLoading = ordersQuery.isLoading || runsQuery.isLoading;

  return (
    <main className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">Execution</p>
          <h1>Execution queue</h1>
          <p>
            Approved payments waiting for signature, in-flight submissions, and anything that needs a human
            eye before moving on. Batches expand to reveal the payments inside.
          </p>
        </div>
      </header>

      <div className="rd-metrics">
        <div className="rd-metric">
          <span className="rd-metric-label">Total</span>
          <span className="rd-metric-value">{scopedOrders.length}</span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Ready to sign</span>
          <span className="rd-metric-value" data-tone={readyToSignCount > 0 ? 'warning' : undefined}>
            {readyToSignCount}
          </span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">In flight</span>
          <span className="rd-metric-value">{inFlightCount}</span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Executed</span>
          <span className="rd-metric-value" data-tone="success">
            {executedCount}
          </span>
        </div>
      </div>

      <div className="rd-filter-bar">
        <div className="rd-tabs" role="tablist" aria-label="Execution filter">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'ready_to_sign', label: `Ready to sign (${readyToSignCount})` },
              { key: 'in_flight', label: `In flight (${inFlightCount})` },
              { key: 'executed', label: `Executed (${executedCount})` },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              className="rd-tab"
              onClick={() => setFilter(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="rd-toolbar-right">
          <span className="rd-section-meta">
            {groups.length} group{groups.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <section className="rd-section" style={{ marginTop: 0 }}>
        <div className="rd-table-shell">
          {isLoading ? (
            <div style={{ padding: 16 }}>
              <div className="rd-skeleton rd-skeleton-block" style={{ height: 56, marginBottom: 8 }} />
              <div className="rd-skeleton rd-skeleton-block" style={{ height: 56, marginBottom: 8 }} />
              <div className="rd-skeleton rd-skeleton-block" style={{ height: 56 }} />
            </div>
          ) : groups.length === 0 ? (
            <div className="rd-empty-cell" style={{ padding: '64px 24px' }}>
              <strong>Nothing in the queue</strong>
              <p style={{ margin: 0 }}>
                Approved payments waiting for signature, in-flight submissions, and review items show up here.
              </p>
            </div>
          ) : (
            <table className="rd-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Recipient / Batch</th>
                  <th style={{ width: '10%' }}>Items</th>
                  <th className="rd-num" style={{ width: '14%' }}>
                    Amount
                  </th>
                  <th style={{ width: '18%' }}>Signature</th>
                  <th style={{ width: '14%' }}>Status</th>
                  <th style={{ width: '14%' }} aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  if (group.kind === 'run') {
                    const expanded = expandedRunId === group.run.paymentRunId;
                    return (
                      <RunRows
                        key={group.key}
                        organizationId={organizationId}
                        group={group}
                        expanded={expanded}
                        onToggle={() =>
                          setExpandedRunId((curr) =>
                            curr === group.run.paymentRunId ? null : group.run.paymentRunId,
                          )
                        }
                      />
                    );
                  }
                  const order = group.order;
                  const sig = order.reconciliationDetail?.latestExecution?.submittedSignature ?? null;
                  return (
                    <tr key={group.key}>
                      <td>
                        <div className="rd-recipient-main">
                          <span className="rd-recipient-name">
                            {order.counterparty?.displayName ?? order.destination.label}
                          </span>
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
                        <SignatureCell signature={sig} />
                      </td>
                      <td>
                        <span
                          className="rd-pill"
                          data-tone={toneToPill(statusToneForPayment(order.derivedState))}
                        >
                          <span className="rd-pill-dot" aria-hidden />
                          {displayPaymentStatus(order.derivedState)}
                        </span>
                      </td>
                      <td>
                        <Link
                          to={`/organizations/${organizationId}/payments/${order.paymentOrderId}#execution`}
                          className="rd-btn rd-btn-secondary"
                          style={{
                            minHeight: 28,
                            padding: '4px 10px',
                            fontSize: 12,
                            textDecoration: 'none',
                          }}
                        >
                          {executionActionLabel(order)}
                        </Link>
                      </td>
                    </tr>
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

function RunRows({
  organizationId,
  group,
  expanded,
  onToggle,
}: {
  organizationId: string;
  group: Extract<ExecutionGroup, { kind: 'run' }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { run, orders } = group;
  const runTone = toneToPill(statusToneForPayment(run.derivedState));
  const runSignatures = Array.from(
    new Set(
      orders
        .map((o) => o.reconciliationDetail?.latestExecution?.submittedSignature)
        .filter((s): s is string => Boolean(s)),
    ),
  );
  const primarySig = runSignatures[0] ?? null;
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
          <span style={{ fontSize: 13, color: 'var(--ax-text-secondary)' }}>{run.totals.orderCount}</span>
        </td>
        <td className="rd-num">{formatRawUsdcCompact(run.totals.totalAmountRaw)} USDC</td>
        <td>
          <SignatureCell signature={primarySig} extraCount={Math.max(runSignatures.length - 1, 0)} />
        </td>
        <td>
          <span className="rd-pill" data-tone={runTone}>
            <span className="rd-pill-dot" aria-hidden />
            {displayRunStatus(run.derivedState)}
          </span>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <Link
            to={`/organizations/${organizationId}/runs/${run.paymentRunId}`}
            className="rd-btn rd-btn-secondary"
            style={{ minHeight: 28, padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}
          >
            Open batch
          </Link>
        </td>
      </tr>
      {expanded
        ? orders.map((order) => {
            const sig = order.reconciliationDetail?.latestExecution?.submittedSignature ?? null;
            return (
              <tr key={`child:${order.paymentOrderId}`} style={{ background: 'var(--ax-surface)' }}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 28 }}>
                    <span
                      aria-hidden
                      style={{ color: 'var(--ax-text-faint)', fontFamily: 'var(--ax-font-mono)', fontSize: 11 }}
                    >
                      ↳
                    </span>
                    <div className="rd-recipient-main">
                      <Link
                        to={`/organizations/${organizationId}/payments/${order.paymentOrderId}#execution`}
                        style={{ color: 'var(--ax-text)', textDecoration: 'none', fontWeight: 500 }}
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
                  <SignatureCell signature={sig} />
                </td>
                <td>
                  <span
                    className="rd-pill"
                    data-tone={toneToPill(statusToneForPayment(order.derivedState))}
                  >
                    <span className="rd-pill-dot" aria-hidden />
                    {displayPaymentStatus(order.derivedState)}
                  </span>
                </td>
                <td>
                  <Link
                    to={`/organizations/${organizationId}/payments/${order.paymentOrderId}#execution`}
                    className="rd-btn rd-btn-ghost"
                    style={{
                      minHeight: 28,
                      padding: '4px 10px',
                      fontSize: 12,
                      textDecoration: 'none',
                    }}
                  >
                    {executionActionLabel(order)}
                  </Link>
                </td>
              </tr>
            );
          })
        : null}
    </>
  );
}

function SignatureCell({ signature, extraCount }: { signature: string | null; extraCount?: number }) {
  if (!signature) {
    return <span style={{ color: 'var(--ax-text-faint)', fontSize: 12 }}>—</span>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <a
        href={orbTransactionUrl(signature)}
        target="_blank"
        rel="noreferrer"
        className="rd-tx-link"
        title={signature}
      >
        {shortenAddress(signature, 6, 6)}
      </a>
      {extraCount && extraCount > 0 ? (
        <span style={{ fontSize: 11, color: 'var(--ax-text-muted)' }}>+{extraCount}</span>
      ) : null}
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
