import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { AuthenticatedSession, PaymentOrder, PaymentRun } from '../types';
import {
  formatRawUsdcCompact,
  formatRelativeTime,
  orbTransactionUrl,
  shortenAddress,
} from '../domain';
import { displayRunStatus, statusToneForPayment } from '../status-labels';

type Filter = 'all' | 'matched' | 'pending' | 'exception';

type SettlementGroup =
  | { kind: 'run'; key: string; run: PaymentRun; orders: PaymentOrder[] }
  | { kind: 'single'; key: string; order: PaymentOrder };

type MatchBand = 'matched' | 'partial' | 'exception' | 'pending';

function assetSymbol(asset: string | undefined): string {
  return (asset ?? 'usdc').toUpperCase();
}

function orderBand(order: PaymentOrder): MatchBand {
  const s = order.derivedState;
  if (s === 'settled' || s === 'closed') return 'matched';
  if (s === 'partially_settled') return 'partial';
  if (s === 'exception') return 'exception';
  return 'pending';
}

function bandPillTone(band: MatchBand): 'success' | 'warning' | 'danger' | 'info' {
  if (band === 'matched') return 'success';
  if (band === 'partial') return 'warning';
  if (band === 'exception') return 'danger';
  return 'info';
}

function bandLabel(band: MatchBand): string {
  if (band === 'matched') return 'Matched';
  if (band === 'partial') return 'Partial';
  if (band === 'exception') return 'Exception';
  return 'Pending';
}

function runBand(run: PaymentRun): MatchBand {
  const s = run.derivedState;
  if (s === 'settled' || s === 'closed') return 'matched';
  if (s === 'partially_settled') return 'partial';
  if (s === 'exception') return 'exception';
  return 'pending';
}

function orderInFilter(order: PaymentOrder, filter: Filter): boolean {
  const b = orderBand(order);
  if (filter === 'all') return true;
  if (filter === 'matched') return b === 'matched';
  if (filter === 'pending') return b === 'pending';
  if (filter === 'exception') return b === 'exception' || b === 'partial';
  return false;
}

function runInFilter(run: PaymentRun, filter: Filter): boolean {
  const b = runBand(run);
  if (filter === 'all') return true;
  if (filter === 'matched') return b === 'matched';
  if (filter === 'pending') return b === 'pending';
  if (filter === 'exception') return b === 'exception' || b === 'partial';
  return false;
}

export function SettlementPage({ session: _session }: { session: AuthenticatedSession }) {
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

  const matchedCount = orders.filter((o) => orderBand(o) === 'matched').length;
  const pendingCount = orders.filter((o) => orderBand(o) === 'pending').length;
  const exceptionCount = orders.filter((o) => orderBand(o) === 'exception' || orderBand(o) === 'partial').length;

  const visibleRuns = runs.filter((r) => runInFilter(r, filter));
  const visibleStandalone = standaloneOrders.filter((o) => orderInFilter(o, filter));

  const groups: SettlementGroup[] = [
    ...visibleRuns.map<SettlementGroup>((r) => ({
      kind: 'run' as const,
      key: `run:${r.paymentRunId}`,
      run: r,
      orders: ordersByRun.get(r.paymentRunId) ?? [],
    })),
    ...visibleStandalone.map<SettlementGroup>((o) => ({
      kind: 'single' as const,
      key: `single:${o.paymentOrderId}`,
      order: o,
    })),
  ];

  const isLoading = ordersQuery.isLoading || runsQuery.isLoading;

  return (
    <main className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">Settlement</p>
          <h1>Settlement and reconciliation</h1>
          <p>
            What matched on-chain, what didn't. Every intent gets an observed match or surfaces as an
            exception. Batches expand to reveal the payments inside.
          </p>
        </div>
      </header>

      <div className="rd-metrics">
        <div className="rd-metric">
          <span className="rd-metric-label">Tracked</span>
          <span className="rd-metric-value">{orders.length}</span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Matched</span>
          <span className="rd-metric-value" data-tone="success">
            {matchedCount}
          </span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Pending</span>
          <span className="rd-metric-value" data-tone={pendingCount > 0 ? 'warning' : undefined}>
            {pendingCount}
          </span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Exceptions</span>
          <span className="rd-metric-value" data-tone={exceptionCount > 0 ? 'danger' : undefined}>
            {exceptionCount}
          </span>
        </div>
      </div>

      <div className="rd-filter-bar">
        <div className="rd-tabs" role="tablist" aria-label="Settlement filter">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'matched', label: `Matched (${matchedCount})` },
              { key: 'pending', label: `Pending (${pendingCount})` },
              { key: 'exception', label: `Exceptions (${exceptionCount})` },
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
              <strong>No settlement activity yet</strong>
              <p style={{ margin: 0 }}>
                Once a payment is submitted and observed on-chain, its match shows up here.
              </p>
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
                  <th style={{ width: '14%' }}>Match</th>
                  <th style={{ width: '18%' }}>Signature</th>
                  <th style={{ width: '18%' }}>Updated</th>
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
                  const band = orderBand(order);
                  const sig = order.reconciliationDetail?.match?.signature
                    ?? order.reconciliationDetail?.latestExecution?.submittedSignature
                    ?? null;
                  const updatedAt =
                    order.reconciliationDetail?.match?.matchedAt
                    ?? order.reconciliationDetail?.latestExecution?.submittedAt
                    ?? order.updatedAt;
                  return (
                    <tr key={group.key}>
                      <td>
                        <div className="rd-recipient-main">
                          <Link
                            to={`/organizations/${organizationId}/payments/${order.paymentOrderId}`}
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
                        <span className="rd-pill" data-tone={bandPillTone(band)}>
                          <span className="rd-pill-dot" aria-hidden />
                          {bandLabel(band)}
                        </span>
                      </td>
                      <td>
                        <SignatureCell signature={sig} />
                      </td>
                      <td>
                        <span style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
                          {formatRelativeTime(updatedAt)}
                        </span>
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
  group: Extract<SettlementGroup, { kind: 'run' }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { run, orders } = group;
  const band = runBand(run);
  const runSignatures = Array.from(
    new Set(
      orders
        .map(
          (o) =>
            o.reconciliationDetail?.match?.signature
            ?? o.reconciliationDetail?.latestExecution?.submittedSignature,
        )
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
              <Link
                to={`/organizations/${organizationId}/runs/${run.paymentRunId}`}
                onClick={(e) => e.stopPropagation()}
                style={{ color: 'var(--ax-text)', textDecoration: 'none', fontWeight: 500 }}
              >
                {run.runName}
              </Link>
              <span className="rd-recipient-ref">
                Batch · {shortenAddress(run.paymentRunId, 6, 4)} · {run.totals.settledCount}/{run.totals.actionableCount} matched
              </span>
            </div>
          </div>
        </td>
        <td>
          <span style={{ fontSize: 13, color: 'var(--ax-text-secondary)' }}>{run.totals.orderCount}</span>
        </td>
        <td className="rd-num">{formatRawUsdcCompact(run.totals.totalAmountRaw)} USDC</td>
        <td>
          <span className="rd-pill" data-tone={bandPillTone(band)}>
            <span className="rd-pill-dot" aria-hidden />
            {bandLabel(band)}
          </span>
        </td>
        <td>
          <SignatureCell
            signature={primarySig}
            extraCount={Math.max(runSignatures.length - 1, 0)}
          />
        </td>
        <td>
          <span style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
            {formatRelativeTime(run.updatedAt)}
          </span>
        </td>
      </tr>
      {expanded
        ? orders.map((order) => {
            const childBand = orderBand(order);
            const sig = order.reconciliationDetail?.match?.signature
              ?? order.reconciliationDetail?.latestExecution?.submittedSignature
              ?? null;
            const updatedAt =
              order.reconciliationDetail?.match?.matchedAt
              ?? order.reconciliationDetail?.latestExecution?.submittedAt
              ?? order.updatedAt;
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
                        to={`/organizations/${organizationId}/payments/${order.paymentOrderId}`}
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
                  <span className="rd-pill" data-tone={bandPillTone(childBand)}>
                    <span className="rd-pill-dot" aria-hidden />
                    {bandLabel(childBand)}
                  </span>
                </td>
                <td>
                  <SignatureCell signature={sig} />
                </td>
                <td>
                  <span style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
                    {formatRelativeTime(updatedAt)}
                  </span>
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
