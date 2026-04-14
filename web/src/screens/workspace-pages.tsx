import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type {
  ApprovalPolicy,
  Counterparty,
  Destination,
  ExportJob,
  ExceptionItem,
  OpsHealth,
  ObservedTransfer,
  PaymentExecutionPacket,
  PaymentExecutionPreparation,
  PaymentOrder,
  Payee,
  PaymentRequest,
  PaymentRun,
  PaymentRunExecutionPreparation,
  ReconciliationDetail,
  ReconciliationRow,
  TransferRequest,
  Workspace,
  WorkspaceAddress,
  WorkspaceAddressLite,
  WorkspaceMember,
  PaymentOrderState,
} from '../types';
import { formatRawUsdc, formatRawUsdcCompact, formatRelativeTime, formatTimestamp, formatTimestampCompact, orbTransactionUrl, shortenAddress, solanaAccountUrl } from '../lib/app';
import { discoverSolanaWallets, subscribeSolanaWallets, type BrowserWalletOption } from '../lib/solana-wallet';
import { InfoLine, Metric } from '../components/ui';

function TableSurfaceHeader({
  actionDisabled = false,
  actionLabel,
  count,
  onAction,
  onSearchChange,
  searchPlaceholder,
  searchValue,
  title,
}: {
  actionDisabled?: boolean;
  actionLabel: string;
  count: number;
  onAction: () => void;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchValue: string;
  title: string;
}) {
  return (
    <div className="panel-header surface-panel-header">
      <div className="surface-panel-copy">
        <h2 className="registry-section-title">
          {title} <span className="registry-count-inline">[{count}]</span>
        </h2>
      </div>
      <div className="surface-toolbar">
        <label className="queue-select surface-search">
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
          />
        </label>
        <div className="surface-toolbar-actions">
          <button className="primary-button" disabled={actionDisabled} onClick={onAction} type="button">
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceHomePage({
  addresses,
  currentRole,
  currentWorkspace,
  isLoading,
  observedTransfers,
  onAddExceptionNote,
  onAddRequestNote,
  onApplyExceptionAction,
  onApplyApprovalDecision,
  onCreateExecutionRecord,
  onChangeReconciliationFilter,
  onDownloadAuditExport,
  onSelectObservedTransfer,
  onSelectReconciliation,
  onTransitionRequest,
  onUpdateExecutionRecord,
  reconciliationFilter,
  reconciliationRows,
  selectedObservedTransfer,
  selectedReconciliationDetail,
  transferRequests,
  isLoadingReconciliationDetail,
  surface = 'command',
  paymentOrders = [],
  paymentRuns = [],
  exceptions = [],
  onOpenApprovals,
  onOpenExecution,
  onOpenExceptions,
  onOpenPayments,
}: {
  addresses: WorkspaceAddress[];
  currentRole: string | null;
  currentWorkspace: Workspace;
  isLoading: boolean;
  observedTransfers: ObservedTransfer[];
  onAddExceptionNote: (exceptionId: string, body: string, transferRequestId?: string | null) => Promise<void>;
  onAddRequestNote: (transferRequestId: string, body: string) => Promise<void>;
  onApplyExceptionAction: (
    exceptionId: string,
    action: 'reviewed' | 'expected' | 'dismissed' | 'reopen',
    transferRequestId?: string | null,
    note?: string,
  ) => Promise<void>;
  onApplyApprovalDecision: (
    transferRequestId: string,
    action: 'approve' | 'reject' | 'escalate',
    comment?: string,
  ) => Promise<void>;
  onCreateExecutionRecord: (transferRequestId: string) => Promise<void>;
  onChangeReconciliationFilter: (filter: ReconciliationRow['requestDisplayState'] | 'all') => void;
  onDownloadAuditExport: (transferRequestId: string) => Promise<void>;
  onSelectObservedTransfer: (transfer: ObservedTransfer) => void;
  onSelectReconciliation: (row: ReconciliationRow) => void;
  onTransitionRequest: (transferRequestId: string, toStatus: string) => Promise<void>;
  onUpdateExecutionRecord: (
    executionRecordId: string,
    input: {
      submittedSignature?: string;
      state?: 'ready_for_execution' | 'submitted_onchain' | 'broadcast_failed';
    },
    transferRequestId: string,
  ) => Promise<void>;
  reconciliationFilter: ReconciliationRow['requestDisplayState'] | 'all';
  reconciliationRows: ReconciliationRow[];
  selectedObservedTransfer: ObservedTransfer | null;
  selectedReconciliationDetail: ReconciliationDetail | null;
  transferRequests: TransferRequest[];
  isLoadingReconciliationDetail: boolean;
  surface?: 'command' | 'settlement';
  paymentOrders?: PaymentOrder[];
  paymentRuns?: PaymentRun[];
  exceptions?: ExceptionItem[];
  onOpenApprovals?: () => void;
  onOpenExecution?: () => void;
  onOpenExceptions?: () => void;
  onOpenPayments?: () => void;
}) {
  const matchedCount = reconciliationRows.filter((row) => row.requestDisplayState === 'matched').length;
  const pendingCount = reconciliationRows.filter((row) => row.requestDisplayState === 'pending').length;
  const [approvalComment, setApprovalComment] = useState('');
  const [executionSignature, setExecutionSignature] = useState('');
  const [isRequestInspectorOpen, setIsRequestInspectorOpen] = useState(false);

  useEffect(() => {
    setApprovalComment('');
    setExecutionSignature('');
  }, [selectedReconciliationDetail?.transferRequestId]);

  useEffect(() => {
    if (selectedReconciliationDetail?.latestExecution?.submittedSignature) {
      setExecutionSignature('');
    }
  }, [selectedReconciliationDetail?.latestExecution?.submittedSignature]);

  useEffect(() => {
    if (selectedReconciliationDetail) {
      setIsRequestInspectorOpen(true);
    }
  }, [selectedReconciliationDetail?.transferRequestId]);

  const hasObservedSettlementWithoutExecution =
    selectedReconciliationDetail !== null
    && !selectedReconciliationDetail.latestExecution
    && Boolean(
      selectedReconciliationDetail.match
      || selectedReconciliationDetail.linkedSignature
      || selectedReconciliationDetail.observedExecutionTransaction,
    );

  const summarySignature = selectedReconciliationDetail
    ? getPrimarySettlementSignature(selectedReconciliationDetail)
    : null;
  const summarySourceAddress = selectedReconciliationDetail
    ? getPrimarySourceAddress(selectedReconciliationDetail)
    : null;
  const summaryDestinationAddress = selectedReconciliationDetail
    ? getPrimaryDestinationAddress(selectedReconciliationDetail)
    : null;
  const summaryTime = selectedReconciliationDetail
    ? getPrimarySettlementTime(selectedReconciliationDetail)
    : null;
  const sourceWalletHint = summarySourceAddress ? findWorkspaceAddressByChainValue(addresses, summarySourceAddress) : null;
  const destinationWalletHint = summaryDestinationAddress ? findWorkspaceAddressByChainValue(addresses, summaryDestinationAddress) : null;

  if (surface === 'command') {
    const needsApproval = paymentOrders.filter((order) => order.derivedState === 'pending_approval');
    const ready = paymentOrders.filter((order) => order.derivedState === 'ready_for_execution');
    const unsettled = paymentOrders.filter((order) => ['execution_recorded', 'approved', 'partially_settled'].includes(order.derivedState));
    const completed = paymentOrders.filter((order) => ['settled', 'closed'].includes(order.derivedState));
    const openExceptions = exceptions.filter((item) => item.status !== 'dismissed');
    const agingCritical = paymentOrders.filter((order) => {
      if (['settled', 'closed', 'cancelled'].includes(order.derivedState)) return false;
      return hoursSince(order.createdAt) >= 24;
    }).length;
    const priorityRows = [...paymentOrders]
      .filter((order) => ['pending_approval', 'approved', 'ready_for_execution', 'execution_recorded', 'partially_settled', 'exception'].includes(order.derivedState))
      .sort((a, b) => commandPriorityScore(b) - commandPriorityScore(a))
      .slice(0, 10);

    return (
      <div className="page-stack">
        <section className="section-headline section-headline-compact">
          <div className="section-headline-copy">
            <p className="eyebrow">Command center</p>
            <h1>{currentWorkspace.workspaceName}</h1>
            <p className="section-copy">
              Daily payment work across intake, approval, execution, settlement, exceptions, and proof.
            </p>
          </div>
          <div className="hero-actions">
            <button className="ghost-button" type="button" onClick={onOpenPayments}>New request</button>
            <button className="primary-button" type="button" onClick={onOpenPayments}>Import CSV batch</button>
          </div>
        </section>

        <section className="content-grid content-grid-single">
          <div className="workspace-pulse-strip workspace-pulse-strip-standalone">
            <div className="workspace-pulse-strip-grid">
              <Metric label="Approval queue" value={String(needsApproval.length).padStart(2, '0')} />
              <Metric label="Ready to execute" value={String(ready.length).padStart(2, '0')} />
              <Metric label="Settlement watch" value={String(unsettled.length).padStart(2, '0')} />
              <Metric label="Open exceptions" value={String(openExceptions.length).padStart(2, '0')} />
            </div>
            <span className="status-chip">{isLoading ? 'syncing' : currentRole ?? 'member'}</span>
          </div>
        </section>

        <section className="command-center-main">
          <div className="command-center-top-row">
            <div className="content-panel content-panel-strong">
              <div className="panel-header panel-header-stack">
                <div>
                  <p className="eyebrow">Today's focus</p>
                  <h2>Priority-ranked work</h2>
                  <p className="compact-copy">Priority ranked by state risk, amount, and age.</p>
                </div>
              </div>
              <div className="request-table ops-request-table">
                <div className="request-table-head">
                  <span>Payment</span>
                  <span>Status</span>
                  <span>Amount</span>
                  <span>Age</span>
                  <span>Why now</span>
                  <span>Do now</span>
                </div>
                {priorityRows.length ? priorityRows.map((order) => (
                  <div key={order.paymentOrderId} className="request-table-row">
                    <div className="request-row-button">
                      <span className="request-cell-primary"><strong>{order.payee?.name ?? order.destination.label}</strong></span>
                      <span className="request-cell-single"><span className={`tone-pill tone-pill-${getProgressTone(order.derivedState)}`}>{formatLabel(order.derivedState)}</span></span>
                      <span className="request-cell-single">{formatRawUsdcCompact(order.amountRaw)} USDC</span>
                      <span className="request-cell-single">{formatRelativeTime(order.createdAt)}</span>
                      <span className="request-cell-single">{commandPriorityReason(order)}</span>
                      <span className="request-cell-single">{executionAction(order)}</span>
                    </div>
                  </div>
                )) : <div className="empty-box compact">No priority work right now.</div>}
              </div>
            </div>

            <div className="content-panel content-panel-soft">
              <div className="panel-header panel-header-stack">
                <div>
                  <p className="eyebrow">Operational load</p>
                  <h2>Current queue distribution</h2>
                </div>
              </div>
              <div className="info-grid-tight">
                <InfoLine label="Approvals pending" value={String(needsApproval.length)} />
                <InfoLine label="Execution ready" value={String(ready.length)} />
                <InfoLine label="Settlement in-flight" value={String(unsettled.length)} />
                <InfoLine label="Aging over 24h" value={String(agingCritical)} />
                <InfoLine label="Proof-ready" value={String(completed.length)} />
                <InfoLine label="Open exceptions" value={String(openExceptions.length)} />
              </div>
              <div className="exception-actions">
                <button className="ghost-button compact-button" type="button" onClick={onOpenApprovals}>Open approvals</button>
                <button className="ghost-button compact-button" type="button" onClick={onOpenExecution}>Open execution</button>
                <button className="ghost-button compact-button" type="button" onClick={onOpenExceptions}>Open exceptions</button>
              </div>
            </div>
          </div>

          <div className="command-center-bottom-row">
            <div className="content-panel content-panel-soft">
              <div className="panel-header panel-header-stack">
                <div>
                  <p className="eyebrow">Recent payment runs</p>
                  <h2>Batch imports and execution packets</h2>
                </div>
              </div>
              <div className="request-table ops-request-table">
                <div className="request-table-head">
                  <span>Run</span>
                  <span>Status</span>
                  <span>Items</span>
                  <span>Total</span>
                  <span>Created</span>
                </div>
                {paymentRuns.slice(0, 8).map((run) => (
                  <div className="request-table-row" key={run.paymentRunId}>
                    <div className="request-row-button">
                      <span className="request-cell-primary"><strong>{run.runName}</strong></span>
                      <span className="request-cell-single"><span className={`tone-pill tone-pill-${getProgressTone(run.derivedState)}`}>{formatLabel(run.derivedState)}</span></span>
                      <span className="request-cell-single">{run.totals.orderCount}</span>
                      <span className="request-cell-single">{formatRawUsdcCompact(run.totals.totalAmountRaw)} USDC</span>
                      <span className="request-cell-single">{formatTimestampCompact(run.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="section-headline section-headline-compact">
        <div className="section-headline-copy">
          <p className="eyebrow">Workspace</p>
          <h1>{currentWorkspace.workspaceName}</h1>
          <p className="section-copy">
            {surface === 'settlement'
              ? 'Settlement and reconciliation view for observed movement and request matching.'
              : 'Command center for requests, execution, and settlement operations.'}
          </p>
        </div>
      </section>

      <section className="content-grid content-grid-single">
        <div className="workspace-pulse-strip workspace-pulse-strip-standalone">
          <div className="workspace-pulse-strip-grid">
            <Metric label="Wallets" value={String(addresses.length).padStart(2, '0')} />
            <Metric label="Planned" value={String(transferRequests.length).padStart(2, '0')} />
            <Metric label="Observed" value={String(observedTransfers.length).padStart(2, '0')} />
            <Metric label="Matched" value={String(matchedCount).padStart(2, '0')} />
            <Metric label="Pending" value={String(pendingCount).padStart(2, '0')} />
          </div>
          <span className="status-chip">{isLoading ? 'syncing' : currentRole ?? 'member'}</span>
        </div>
      </section>

      <section className="workspace-home-grid workspace-home-grid-single">
        <div className="workspace-home-primary">
          <div className="content-panel content-panel-strong">
            <div className="panel-header panel-header-stack">
              <div>
                <p className="eyebrow">Live queue</p>
                <h2>Requests in motion</h2>
                <p className="compact-copy">
                  This is the watch surface. Start with what is live, what needs attention, and what has already settled.
                </p>
              </div>
              <span className="status-chip">{reconciliationRows.length} live</span>
            </div>

            <div className="filter-row filter-row-compact">
              {(['all', 'pending', 'matched', 'partial', 'exception'] as const).map((filter) => (
                <button
                  key={filter}
                  className={reconciliationFilter === filter ? 'filter-chip is-active' : 'filter-chip'}
                  onClick={() => onChangeReconciliationFilter(filter)}
                  type="button"
                >
                  {filter}
                </button>
              ))}
            </div>

            <div className="request-table ops-request-table">
              <div className="request-table-head">
                <span>Request ID</span>
                <span>Source</span>
                <span>Destination</span>
                <span>Amount</span>
                <span>Approval</span>
                <span>Execution</span>
                <span>Settlement</span>
                <span>Requested</span>
              </div>
              {reconciliationRows.length ? (
                reconciliationRows.map((row) => (
                  <div
                    key={row.transferRequestId}
                    className={
                      selectedReconciliationDetail?.transferRequestId === row.transferRequestId
                        ? 'request-table-row is-active'
                        : 'request-table-row'
                    }
                  >
                    <button
                      className="request-row-button"
                      onClick={() => {
                        setIsRequestInspectorOpen(true);
                        onSelectReconciliation(row);
                      }}
                      type="button"
                    >
                      <span className="request-cell-primary">
                        <strong>{shortenAddress(row.transferRequestId, 8, 6)}</strong>
                      </span>
                      <span className="request-cell-single">
                        <strong>{row.sourceWorkspaceAddress ? getWalletNameLite(row.sourceWorkspaceAddress) : 'Not set'}</strong>
                      </span>
                      <span className="request-cell-single">
                        <strong>{getDestinationLabel(row.destination, row.destinationWorkspaceAddress)}</strong>
                      </span>
                      <span className="request-cell-amount request-cell-single">
                        <strong>{formatRawUsdc(row.amountRaw)}</strong>
                      </span>
                      <span className="request-cell-single">
                        <span className={`tone-pill tone-pill-${mapApprovalTone(row.approvalState)}`}>
                          {getApprovalStateLabel(row.approvalState)}
                        </span>
                      </span>
                      <span className="request-cell-single">
                        <span className={`tone-pill tone-pill-${mapExecutionTone(getExecutionStateForRow(row))}`}>
                          {getExecutionStateLabel(getExecutionStateForRow(row), row)}
                        </span>
                      </span>
                      <span className="request-cell-single">
                        <span className={`tone-pill tone-pill-${getSettlementTone(row)}`}>
                          {getDisplayStateLabel(row)}
                        </span>
                      </span>
                      <span className="request-cell-single">{formatTimestampCompact(row.requestedAt)}</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty-box compact">No planned transfers yet. Open setup and create the first one.</div>
              )}
            </div>
          </div>

          <div className="content-panel content-panel-soft">
            <div className="panel-header panel-header-stack">
              <div>
                <p className="eyebrow">Observed transfers</p>
                <h2>Real USDC movement</h2>
                <p className="compact-copy">Every observed USDC leg across the wallets saved in this workspace.</p>
              </div>
            </div>
            <div className="transfer-table">
              <div className="transfer-table-head">
                <span>Amount</span>
                <span>From</span>
                <span>To</span>
                <span>Route</span>
                <span>Type</span>
                <span>Actions</span>
              </div>
              {observedTransfers.length ? (
                observedTransfers.map((transfer) => (
                  <div
                    key={transfer.transferId}
                    className={
                      selectedObservedTransfer?.transferId === transfer.transferId
                        ? 'transfer-table-row is-active'
                        : 'transfer-table-row'
                    }
                  >
                    <a
                      className="transfer-table-link"
                      href={orbTransactionUrl(transfer.signature)}
                      rel="noreferrer"
                      target="_blank"
                      title={transfer.signature}
                    >
                      <span className="transfer-table-amount">{transfer.amountDecimal}</span>
                      <span className="transfer-table-mono" title={transfer.sourceWallet ?? transfer.sourceTokenAccount ?? 'Unknown'}>
                        {shortenAddress(transfer.sourceWallet ?? transfer.sourceTokenAccount, 8, 8)}
                      </span>
                      <span className="transfer-table-mono" title={transfer.destinationWallet ?? transfer.destinationTokenAccount}>
                        {shortenAddress(transfer.destinationWallet ?? transfer.destinationTokenAccount, 8, 8)}
                      </span>
                      <span className="transfer-table-meta" title={transfer.routeGroup}>
                        {getRouteLabel(transfer)}
                      </span>
                      <span className="transfer-table-meta">{getObservedTransferTypeLabel(transfer.legRole)}</span>
                    </a>
                    <div className="transfer-table-actions">
                      <button
                        className="ghost-button compact-button"
                        onClick={() => onSelectObservedTransfer(transfer)}
                        type="button"
                      >
                        inspect
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-box compact">No observed transfers yet for the saved wallets.</div>
              )}
            </div>

            {selectedObservedTransfer ? (
              <div className="transfer-inspector-drawer transfer-inspector-inline">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Observed transfer</p>
                    <h2>Transfer inspector</h2>
                  </div>
                </div>
                <div className="stack-list">
                  <div className="inspector-callout">
                    <div>
                      <p className="eyebrow">Explorer</p>
                      <strong>{shortenAddress(selectedObservedTransfer.signature, 10, 10)}</strong>
                    </div>
                    <a
                      className="ghost-button inline-link-button"
                      href={orbTransactionUrl(selectedObservedTransfer.signature)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      open on orb
                    </a>
                  </div>
                  <InfoLine label="Signature" value={selectedObservedTransfer.signature} />
                  <InfoLine label="Observed at" value={formatTimestamp(selectedObservedTransfer.eventTime)} />
                  <InfoLine label="Written at" value={formatTimestamp(selectedObservedTransfer.createdAt)} />
                  <InfoLine label="Chain to write" value={`${selectedObservedTransfer.chainToWriteMs} ms`} />
                  <InfoLine label="Route" value={getRouteLabel(selectedObservedTransfer)} />
                  <InfoLine label="Leg role" value={getObservedTransferTypeLabel(selectedObservedTransfer.legRole)} />
                  <InfoLine label="Source wallet" value={selectedObservedTransfer.sourceWallet ?? 'Unknown'} />
                  <InfoLine label="Source token account" value={selectedObservedTransfer.sourceTokenAccount ?? 'Unknown'} />
                  <InfoLine label="Destination wallet" value={selectedObservedTransfer.destinationWallet ?? 'Unknown'} />
                  <InfoLine label="Destination token account" value={selectedObservedTransfer.destinationTokenAccount} />
                  <InfoLine label="Amount" value={selectedObservedTransfer.amountDecimal} />
                </div>
              </div>
            ) : (
              <div className="empty-box compact transfer-empty-state">
                Select a transfer row to inspect its exact chain-facing fields.
              </div>
            )}
          </div>
        </div>
      </section>

      {isRequestInspectorOpen ? (
        <div className="registry-modal-backdrop" onClick={() => setIsRequestInspectorOpen(false)} role="presentation">
          <div
            className="registry-modal registry-modal-wide request-inspector-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {selectedReconciliationDetail ? (
              <div className="transfer-inspector-drawer transfer-inspector-sticky">
                <div className="registry-modal-hero request-modal-hero">
                  <div className="registry-modal-hero-copy">
                    <p className="eyebrow">Request inspector</p>
                    <h2>Request and match</h2>
                  </div>
                  <div className="exception-actions">
                    <button
                      className="ghost-button compact-button"
                      onClick={() => void onDownloadAuditExport(selectedReconciliationDetail.transferRequestId)}
                      type="button"
                    >
                      export audit
                    </button>
                    <button className="ghost-button danger-button" onClick={() => setIsRequestInspectorOpen(false)} type="button">
                      close
                    </button>
                  </div>
                </div>
                <div className="request-chain-summary">
                  <div className="request-chain-summary-amount">
                    <span className="eyebrow">Amount</span>
                    <div className="request-chain-summary-amount-value">
                      <strong>{formatRawUsdcCompact(selectedReconciliationDetail.amountRaw)} USDC</strong>
                      <span>{formatUsdcUsdBadge(selectedReconciliationDetail.amountRaw)}</span>
                    </div>
                    <p className="request-chain-summary-status">
                      <strong>{getCompletionHeadline(selectedReconciliationDetail)}</strong>
                      <span>{getCompletionSubtext(selectedReconciliationDetail)}</span>
                    </p>
                  </div>
                  <div className="request-chain-summary-row">
                    <ChainSummaryBlock
                      label="Signature"
                      title={summarySignature ?? undefined}
                      value={summarySignature ? shortenAddress(summarySignature, 6, 6) : 'No linked signature'}
                      onCopy={summarySignature ? () => void navigator.clipboard.writeText(summarySignature).catch(() => undefined) : undefined}
                      copyTitle="Copy signature"
                    />
                    <ChainSummaryBlock
                      label="From"
                      title={sourceWalletHint ? `${sourceWalletHint.displayName ?? sourceWalletHint.address} // ${summarySourceAddress}` : summarySourceAddress ?? undefined}
                      value={summarySourceAddress ? shortenAddress(summarySourceAddress, 6, 6) : 'Not set'}
                      onCopy={summarySourceAddress ? () => void navigator.clipboard.writeText(summarySourceAddress).catch(() => undefined) : undefined}
                      copyTitle="Copy source wallet"
                    />
                    <ChainSummaryBlock
                      label="To"
                      title={destinationWalletHint ? `${destinationWalletHint.displayName ?? destinationWalletHint.address} // ${summaryDestinationAddress}` : summaryDestinationAddress ?? undefined}
                      value={summaryDestinationAddress ? shortenAddress(summaryDestinationAddress, 6, 6) : 'Destination not resolved'}
                      onCopy={summaryDestinationAddress ? () => void navigator.clipboard.writeText(summaryDestinationAddress).catch(() => undefined) : undefined}
                      copyTitle="Copy destination wallet"
                    />
                    <ChainSummaryBlock
                      label="Time"
                      title={summaryTime ? formatTimestamp(summaryTime) : undefined}
                      value={summaryTime ? formatRelativeTime(summaryTime) : 'Pending'}
                    />
                    <div className="chain-summary-top-action">
                      {summarySignature ? (
                        <a
                          className="ghost-button compact-button chain-summary-icon chain-summary-icon-large"
                          href={orbTransactionUrl(summarySignature)}
                          rel="noreferrer"
                          target="_blank"
                          title="Open settlement on Orb"
                        >
                          ↗
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="request-inspector-layout">
                  <div className="request-inspector-side">
                    <div className="request-section-card request-inspector-facts">
                      <InfoLine
                        label="Counterparty"
                        value={selectedReconciliationDetail.destination?.counterparty?.displayName ?? 'Unassigned'}
                      />
                      <InfoLine
                        label="Destination trust"
                        value={selectedReconciliationDetail.destination?.trustState ?? 'unreviewed'}
                      />
                      <InfoLine
                        label="Destination scope"
                        value={selectedReconciliationDetail.destination?.isInternal ? 'internal' : 'external'}
                      />
                      <InfoLine
                        label="Receiving wallet"
                        value={
                          shortenAddress(
                            selectedReconciliationDetail.destination?.walletAddress
                            ?? selectedReconciliationDetail.destinationWorkspaceAddress?.address,
                            8,
                            6,
                          )
                        }
                      />
                      <InfoLine
                        label="Receiving USDC ATA"
                        value={
                          shortenAddress(
                            selectedReconciliationDetail.destination?.tokenAccountAddress
                            ?? selectedReconciliationDetail.destinationWorkspaceAddress?.usdcAtaAddress,
                            8,
                            6,
                          )
                        }
                      />
                      <InfoLine label="Requested at" value={formatTimestamp(selectedReconciliationDetail.requestedAt)} />
                    </div>

                    <div className="state-summary-grid request-state-grid request-state-grid-wide">
                      <div className="state-summary-card">
                        <span className="eyebrow">Approval</span>
                        <strong>{getApprovalStateLabel(selectedReconciliationDetail.approvalState)}</strong>
                      </div>
                      <div className="state-summary-card">
                        <span className="eyebrow">Execution</span>
                        <strong>{getExecutionStateLabel(selectedReconciliationDetail.executionState, selectedReconciliationDetail)}</strong>
                      </div>
                      <div className="state-summary-card">
                        <span className="eyebrow">Reconciliation</span>
                        <strong>{getDisplayStateLabel(selectedReconciliationDetail)}</strong>
                      </div>
                    </div>

                    <InspectorAccordion
                      defaultOpen
                      status={
                        selectedReconciliationDetail.latestExecution
                          ? 'tracked attempt'
                          : hasObservedSettlementWithoutExecution
                            ? 'observed without record'
                            : 'no attempt yet'
                      }
                      title="Execution tracking"
                    >
                        {selectedReconciliationDetail.latestExecution ? (
                          <div className="stack-list">
                          <InfoLine
                            label="Execution state"
                            value={getExecutionStateLabel(selectedReconciliationDetail.executionState, selectedReconciliationDetail)}
                          />
                          <InfoLine
                            label="Execution source"
                            value={selectedReconciliationDetail.latestExecution.executionSource.replaceAll('_', ' ')}
                          />
                          <InfoLine
                            label="Attempt created"
                            value={formatTimestamp(selectedReconciliationDetail.latestExecution.createdAt)}
                          />
                          <InfoLine
                            label="Submitted at"
                            value={
                              selectedReconciliationDetail.latestExecution.submittedAt
                                ? formatTimestamp(selectedReconciliationDetail.latestExecution.submittedAt)
                                : 'Not submitted yet'
                            }
                          />
                          <InfoLine
                            label="Submitted signature"
                            value={
                              selectedReconciliationDetail.latestExecution.submittedSignature
                                ? shortenAddress(selectedReconciliationDetail.latestExecution.submittedSignature, 10, 10)
                                : 'Not attached yet'
                            }
                          />
                          <InfoLine
                            label="Observed onchain"
                            value={
                              selectedReconciliationDetail.observedExecutionTransaction
                                ? formatTimestamp(selectedReconciliationDetail.observedExecutionTransaction.eventTime)
                                : 'No observed transaction yet'
                            }
                          />

                          {selectedReconciliationDetail.latestExecution.submittedSignature ? (
                            <div className="inspector-callout">
                              <div>
                                <p className="eyebrow">Submitted signature</p>
                                <strong>
                                  {shortenAddress(selectedReconciliationDetail.latestExecution.submittedSignature, 10, 10)}
                                </strong>
                              </div>
                              <a
                                className="ghost-button inline-link-button"
                                href={orbTransactionUrl(selectedReconciliationDetail.latestExecution.submittedSignature)}
                                rel="noreferrer"
                                target="_blank"
                              >
                                open on orb
                              </a>
                            </div>
                          ) : null}

                          {!selectedReconciliationDetail.latestExecution.submittedSignature ? (
                            <div className="detail-section request-subsection-card">
                              <label className="field">
                                <span>Attach submitted signature</span>
                                <input
                                  name="executionSignature"
                                  onChange={(event) => setExecutionSignature(event.target.value)}
                                  placeholder="Paste the submitted transaction signature"
                                  type="text"
                                  value={executionSignature}
                                />
                              </label>
                              <div className="exception-actions">
                                <button
                                  className="primary-button compact-button"
                                  onClick={() =>
                                    void onUpdateExecutionRecord(
                                      selectedReconciliationDetail.latestExecution!.executionRecordId,
                                      { submittedSignature: executionSignature.trim() || undefined },
                                      selectedReconciliationDetail.transferRequestId,
                                    )
                                  }
                                  type="button"
                                >
                                  attach signature
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {selectedReconciliationDetail.latestExecution.submittedSignature
                          && !selectedReconciliationDetail.observedExecutionTransaction
                          && selectedReconciliationDetail.executionState === 'submitted_onchain' ? (
                            <div className="exception-actions">
                              <button
                                className="ghost-button compact-button"
                                onClick={() =>
                                  void onUpdateExecutionRecord(
                                    selectedReconciliationDetail.latestExecution!.executionRecordId,
                                    { state: 'broadcast_failed' },
                                    selectedReconciliationDetail.transferRequestId,
                                  )
                                }
                                type="button"
                              >
                                mark broadcast failed
                              </button>
                            </div>
                          ) : null}

                          {selectedReconciliationDetail.executionRecords.length > 1 ? (
                            <div className="detail-section request-subsection-card">
                              <div className="detail-section-head">
                                <strong>Execution history</strong>
                                <span>{selectedReconciliationDetail.executionRecords.length}</span>
                              </div>
                              <div className="stack-list">
                                {selectedReconciliationDetail.executionRecords.map((execution) => (
                                  <div className="note-card" key={execution.executionRecordId}>
                                    <strong>{getExecutionStateLabel(execution.state)}</strong>
                                    <small>
                                      {formatTimestamp(execution.createdAt)} // {execution.executionSource.replaceAll('_', ' ')}
                                    </small>
                                    <p>
                                      {execution.submittedSignature
                                        ? `Submitted ${shortenAddress(execution.submittedSignature, 8, 8)}`
                                        : 'No signature attached yet.'}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          </div>
                        ) : hasObservedSettlementWithoutExecution ? (
                          <div className="stack-list">
                          <div className="empty-box compact">
                            Settlement was linked to this request, but no execution record was created in the product first.
                          </div>
                          <InfoLine
                            label="Observed settlement"
                            value={
                              selectedReconciliationDetail.match?.matchedAt
                                ? formatTimestamp(selectedReconciliationDetail.match.matchedAt)
                                : selectedReconciliationDetail.observedExecutionTransaction
                                  ? formatTimestamp(selectedReconciliationDetail.observedExecutionTransaction.eventTime)
                                  : 'Observed'
                            }
                          />
                          <InfoLine
                            label="Settlement signature"
                            value={
                              selectedReconciliationDetail.linkedSignature
                                ? selectedReconciliationDetail.linkedSignature
                                : 'Linked through observed settlement'
                            }
                          />
                          </div>
                        ) : (
                          <div className="stack-list">
                          <div className="empty-box compact">
                            No execution attempt is recorded yet. This request is approved, but that does not mean anything has been sent.
                          </div>
                          {selectedReconciliationDetail.approvalState === 'approved' ? (
                            <div className="exception-actions">
                              <button
                                className="primary-button compact-button"
                                onClick={() => void onCreateExecutionRecord(selectedReconciliationDetail.transferRequestId)}
                                type="button"
                              >
                              create execution record
                            </button>
                          </div>
                        ) : null}
                          </div>
                        )}
                    </InspectorAccordion>
                  </div>

                  <div className="request-inspector-main">
                    <InspectorAccordion
                      defaultOpen
                      status={getApprovalStateLabel(selectedReconciliationDetail.approvalState)}
                      title="Approval"
                    >
                        {selectedReconciliationDetail.approvalEvaluation.requiresApproval ? (
                          <div className="stack-list">
                            <div className="empty-box compact">
                              This request was routed into the approval inbox by{' '}
                              {selectedReconciliationDetail.approvalEvaluation.policyName}.
                            </div>
                            <div className="reason-list">
                              {selectedReconciliationDetail.approvalEvaluation.reasons.map((reason) => (
                                <div className="reason-card" key={reason.code}>
                                  <strong>{getApprovalReasonLabel(reason.code)}</strong>
                                  <p>{reason.message}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="empty-box compact">
                            Auto-approved by {selectedReconciliationDetail.approvalEvaluation.policyName}.
                          </div>
                        )}

                        {(selectedReconciliationDetail.approvalState === 'pending_approval'
                          || selectedReconciliationDetail.approvalState === 'escalated') ? (
                          <div className="detail-section request-subsection-card">
                            <div className="detail-section-head">
                              <strong>Approval actions</strong>
                              <span>
                                {selectedReconciliationDetail.approvalState === 'escalated'
                                  ? 'escalated review'
                                  : 'waiting for review'}
                              </span>
                            </div>
                            <label className="field">
                              <span>Comment</span>
                              <textarea
                                name="approvalComment"
                                onChange={(event) => setApprovalComment(event.target.value)}
                                placeholder="Optional approval context"
                                rows={3}
                                value={approvalComment}
                              />
                            </label>
                            <div className="exception-actions">
                              <button
                                className="primary-button compact-button"
                                onClick={() =>
                                  void onApplyApprovalDecision(
                                    selectedReconciliationDetail.transferRequestId,
                                    'approve',
                                    approvalComment,
                                  )
                                }
                                type="button"
                              >
                                approve
                              </button>
                              <button
                                className="ghost-button compact-button"
                                onClick={() =>
                                  void onApplyApprovalDecision(
                                    selectedReconciliationDetail.transferRequestId,
                                    'reject',
                                    approvalComment,
                                  )
                                }
                                type="button"
                              >
                                reject
                              </button>
                              {selectedReconciliationDetail.approvalState === 'pending_approval' ? (
                                <button
                                  className="ghost-button compact-button"
                                  onClick={() =>
                                    void onApplyApprovalDecision(
                                      selectedReconciliationDetail.transferRequestId,
                                      'escalate',
                                      approvalComment,
                                    )
                                  }
                                  type="button"
                                >
                                  escalate
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        {(selectedReconciliationDetail.approvalDecisions.length > 1
                          || selectedReconciliationDetail.approvalEvaluation.requiresApproval) ? (
                          <div className="stack-list">
                            {selectedReconciliationDetail.approvalDecisions.map((decision) => (
                              <div className="note-card" key={decision.approvalDecisionId}>
                                <strong>{getApprovalActionLabel(decision.action)}</strong>
                                <small>
                                  {decision.actorUser?.displayName ?? decision.actorUser?.email ?? decision.actorType} //{' '}
                                  {formatTimestamp(decision.createdAt)}
                                </small>
                                {decision.payloadJson
                                && 'reasons' in decision.payloadJson
                                && selectedReconciliationDetail.approvalEvaluation.requiresApproval ? (
                                  <p>{getApprovalDecisionSummary(decision.action)}</p>
                                ) : null}
                                {decision.comment ? <p>{decision.comment}</p> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                    </InspectorAccordion>

                  {selectedReconciliationDetail.availableTransitions.length ? (
                    <InspectorAccordion
                      status={String(selectedReconciliationDetail.availableTransitions.length)}
                      title="Request actions"
                    >
                        <div className="exception-actions">
                          {selectedReconciliationDetail.availableTransitions.map((status) => (
                            <button
                              className="ghost-button compact-button"
                              key={status}
                              onClick={() => void onTransitionRequest(selectedReconciliationDetail.transferRequestId, status)}
                              type="button"
                            >
                              move to {status.replaceAll('_', ' ')}
                            </button>
                          ))}
                        </div>
                    </InspectorAccordion>
                  ) : null}

                    <InspectorAccordion
                      defaultOpen
                      status={getDisplayStateLabel(selectedReconciliationDetail)}
                      title="Settlement"
                    >
                      {selectedReconciliationDetail.linkedSignature ? (
                        <div className="inspector-callout request-section-card">
                          <div>
                            <p className="eyebrow">Settlement signature</p>
                            <strong>{shortenAddress(selectedReconciliationDetail.linkedSignature, 10, 10)}</strong>
                          </div>
                          <a
                            className="ghost-button inline-link-button"
                            href={orbTransactionUrl(selectedReconciliationDetail.linkedSignature)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            open on orb
                          </a>
                        </div>
                      ) : null}

                      {selectedReconciliationDetail.match ? (
                        <div className="detail-section request-section-card">
                          <InfoLine label="Match rule" value={selectedReconciliationDetail.match.matchRule} />
                          <InfoLine
                            label="Match status"
                            value={selectedReconciliationDetail.match.matchStatus.replaceAll('_', ' ')}
                          />
                          <InfoLine
                            label="Matched amount"
                            value={formatRawUsdc(selectedReconciliationDetail.match.matchedAmountRaw)}
                          />
                          <InfoLine
                            label="Observed event"
                            value={
                              selectedReconciliationDetail.match.observedEventTime
                                ? formatTimestamp(selectedReconciliationDetail.match.observedEventTime)
                                : 'n/a'
                            }
                          />
                          <InfoLine
                            label="Matched at"
                            value={
                              selectedReconciliationDetail.match.matchedAt
                                ? formatTimestamp(selectedReconciliationDetail.match.matchedAt)
                                : 'n/a'
                            }
                          />
                          <InfoLine
                            label="Chain to match"
                            value={
                              selectedReconciliationDetail.match.chainToMatchMs === null
                                ? 'n/a'
                                : `${selectedReconciliationDetail.match.chainToMatchMs} ms`
                            }
                          />
                          <div className="empty-box compact">
                            {selectedReconciliationDetail.matchExplanation ?? 'No explanation yet.'}
                          </div>
                        </div>
                      ) : (
                        <div className="empty-box compact request-section-card">
                          No exact match yet. The request is still waiting for a compatible observed payment.
                        </div>
                      )}

                      {selectedReconciliationDetail.linkedObservedPayment ? (
                        <div className="empty-box compact request-section-card">
                          <strong>Observed payment</strong>
                          <div className="detail-grid">
                            <span>{getObservedPaymentKindLabel(selectedReconciliationDetail.linkedObservedPayment.paymentKind)}</span>
                            <span>{formatRawUsdc(selectedReconciliationDetail.linkedObservedPayment.netDestinationAmountRaw)}</span>
                            <span>{selectedReconciliationDetail.linkedObservedPayment.routeCount} route(s)</span>
                          </div>
                        </div>
                      ) : null}

                      {selectedReconciliationDetail.relatedObservedPayments.length > 1 ? (
                        <div className="detail-section request-section-card">
                          <div className="detail-section-head">
                            <strong>Settlement breakdown</strong>
                            <span>{selectedReconciliationDetail.relatedObservedPayments.length}</span>
                          </div>
                          <div className="stack-list">
                            {selectedReconciliationDetail.relatedObservedPayments.map((payment) => (
                              <div className="note-card" key={payment.paymentId}>
                                <strong>{payment.destinationLabel ?? payment.destinationWallet ?? 'Unknown destination'}</strong>
                                <small>
                                  {payment.recipientRole
                                    ? payment.recipientRole.replaceAll('_', ' ')
                                    : 'destination'}
                                </small>
                                <p>{formatRawUsdc(payment.netDestinationAmountRaw)} USDC</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                    </InspectorAccordion>

                    {selectedReconciliationDetail.exceptions.length ? (
                      <InspectorAccordion
                        defaultOpen
                        status={String(selectedReconciliationDetail.exceptions.length)}
                        title="Exceptions"
                      >
                          <div className="empty-box compact request-section-card">
                            {selectedReconciliationDetail.exceptionExplanation ??
                              'Exceptions are preventing this request from being treated as fully settled.'}
                          </div>
                          <div className="stack-list">
                            {selectedReconciliationDetail.exceptions.map((exception) => (
                              <ExceptionCard
                                exception={exception}
                                key={exception.exceptionId}
                                onAddNote={onAddExceptionNote}
                                onApplyAction={onApplyExceptionAction}
                              />
                            ))}
                          </div>
                      </InspectorAccordion>
                    ) : null}

                    <InspectorAccordion
                      status={String(selectedReconciliationDetail.timeline.length)}
                      title="Timeline"
                    >
                        <div className="detail-section request-section-card request-timeline-section">
                          <div className="timeline-list">
                            {selectedReconciliationDetail.timeline.map((item, index) => (
                              <div className="timeline-item" key={`${item.timelineType}-${index}-${item.createdAt}`}>
                                <div>
                                  <strong>{getTimelineTitle(item)}</strong>
                                  <small>{formatTimestamp(item.createdAt)}</small>
                                </div>
                                <p>{getTimelineBody(item)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                    </InspectorAccordion>

                    <InspectorAccordion
                      status={String(selectedReconciliationDetail.notes.length)}
                      title="Request notes"
                    >
                        <div className="detail-section request-section-card">
                          <div className="detail-section-head">
                            <strong>Notes</strong>
                          </div>
                          <div className="stack-list">
                            {selectedReconciliationDetail.notes.length ? (
                              selectedReconciliationDetail.notes.map((note) => (
                                <div key={note.transferRequestNoteId} className="note-card">
                                  <strong>{note.authorUser?.displayName ?? note.authorUser?.email ?? 'Operator'}</strong>
                                  <small>{formatTimestamp(note.createdAt)}</small>
                                  <p>{note.body}</p>
                                </div>
                              ))
                            ) : (
                              <div className="empty-box compact">No request notes yet.</div>
                            )}
                            <form
                              className="inline-note-form"
                              onSubmit={(event) =>
                                void handleNoteSubmit(event, (body) =>
                                  onAddRequestNote(selectedReconciliationDetail.transferRequestId, body),
                                )
                              }
                            >
                              <label className="field">
                                <span>Add request note</span>
                                <textarea name="body" placeholder="Capture context for the next operator." rows={3} />
                              </label>
                              <button className="ghost-button compact-button" type="submit">
                                save note
                              </button>
                            </form>
                          </div>
                        </div>
                    </InspectorAccordion>
                </div>
                </div>
              </div>
          ) : isLoadingReconciliationDetail ? (
            <div className="empty-box compact transfer-empty-state">Loading request detail…</div>
          ) : (
            <div className="empty-box compact transfer-empty-state">
              Select a request to inspect the settlement timeline, exceptions, and notes.
            </div>
          )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceRegistryPage({
  addresses,
  canManage,
  counterparties,
  currentWorkspace,
  destinations,
  payees,
  onCreateAddress,
  onCreateCounterparty,
  onCreateDestination,
  onCreatePayee,
  onUpdateAddress,
  onUpdateCounterparty,
  onUpdateDestination,
}: {
  addresses: WorkspaceAddress[];
  canManage: boolean;
  counterparties: Counterparty[];
  currentWorkspace: Workspace;
  destinations: Destination[];
  payees: Payee[];
  onCreateAddress: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCreateCounterparty: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCreateDestination: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCreatePayee: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onUpdateAddress: (workspaceAddressId: string, event: FormEvent<HTMLFormElement>) => Promise<void>;
  onUpdateCounterparty: (counterpartyId: string, event: FormEvent<HTMLFormElement>) => Promise<void>;
  onUpdateDestination: (destinationId: string, event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [trustFilter, setTrustFilter] = useState<'all' | Destination['trustState']>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'internal' | 'external'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [modalState, setModalState] = useState<
    | { type: 'create-wallet' }
    | { type: 'edit-wallet'; workspaceAddressId: string }
    | { type: 'create-counterparty' }
    | { type: 'create-payee' }
    | { type: 'edit-counterparty'; counterpartyId: string }
    | { type: 'create-destination'; linkedWorkspaceAddressId?: string }
    | { type: 'edit-destination'; destinationId: string }
    | { type: 'view-destination'; destinationId: string }
    | null
  >(null);

  const selectedDestination =
    modalState?.type === 'view-destination'
      ? destinations.find((item) => item.destinationId === modalState.destinationId) ?? null
      : null;
  const selectedDestinationWallet = selectedDestination?.linkedWorkspaceAddress ?? null;
  const selectedDestinationCounterparty = selectedDestination?.counterparty ?? null;

  const editingAddress =
    modalState?.type === 'edit-wallet'
      ? addresses.find((item) => item.workspaceAddressId === modalState.workspaceAddressId) ?? null
      : null;
  const editingCounterparty =
    modalState?.type === 'edit-counterparty'
      ? counterparties.find((item) => item.counterpartyId === modalState.counterpartyId) ?? null
      : null;
  const editingDestination =
    modalState?.type === 'edit-destination'
      ? destinations.find((item) => item.destinationId === modalState.destinationId) ?? null
      : null;

  useEffect(() => {
    if (modalState?.type === 'edit-wallet' && !editingAddress) {
      setModalState(null);
    }
    if (modalState?.type === 'edit-counterparty' && !editingCounterparty) {
      setModalState(null);
    }
    if (modalState?.type === 'edit-destination' && !editingDestination) {
      setModalState(null);
    }
  }, [editingAddress, editingCounterparty, editingDestination, modalState]);

  const filteredDestinations = destinations.filter((item) => {
    const matchesSearch = !searchQuery.trim()
      || [
        item.label,
        item.walletAddress,
        item.destinationType,
        item.counterparty?.displayName ?? '',
        item.linkedWorkspaceAddress?.displayName ?? '',
        item.linkedWorkspaceAddress?.address ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(searchQuery.trim().toLowerCase());
    const matchesTrust = trustFilter === 'all' || item.trustState === trustFilter;
    const matchesScope =
      scopeFilter === 'all'
      || (scopeFilter === 'internal' ? item.isInternal : !item.isInternal);
    const matchesStatus =
      statusFilter === 'all'
      || (statusFilter === 'active' ? item.isActive : !item.isActive);

    return matchesSearch && matchesTrust && matchesScope && matchesStatus;
  });

  const linkedWalletIds = new Set(destinations.map((item) => item.linkedWorkspaceAddressId).filter(Boolean));
  const destinationsByWalletId = new Map<string, Destination[]>();
  for (const destination of destinations) {
    if (!destination.linkedWorkspaceAddressId) {
      continue;
    }
    const existing = destinationsByWalletId.get(destination.linkedWorkspaceAddressId) ?? [];
    existing.push(destination);
    destinationsByWalletId.set(destination.linkedWorkspaceAddressId, existing);
  }
  const counterpartyWalletCount = new Map<string, number>();
  for (const counterparty of counterparties) {
    const walletIds = new Set(
      destinations
        .filter((item) => item.counterpartyId === counterparty.counterpartyId && item.linkedWorkspaceAddressId)
        .map((item) => item.linkedWorkspaceAddressId as string),
    );
    counterpartyWalletCount.set(counterparty.counterpartyId, walletIds.size);
  }

  async function handleAddressSubmit(event: FormEvent<HTMLFormElement>) {
    if (editingAddress) {
      await onUpdateAddress(editingAddress.workspaceAddressId, event);
    } else {
      await onCreateAddress(event);
    }
    setModalState(null);
  }

  async function handleCounterpartySubmit(event: FormEvent<HTMLFormElement>) {
    if (editingCounterparty) {
      await onUpdateCounterparty(editingCounterparty.counterpartyId, event);
    } else {
      await onCreateCounterparty(event);
    }
    setModalState(null);
  }

  async function handleDestinationSubmit(event: FormEvent<HTMLFormElement>) {
    if (editingDestination) {
      await onUpdateDestination(editingDestination.destinationId, event);
    } else {
      await onCreateDestination(event);
    }
    setModalState(null);
  }

  return (
    <div className="page-stack page-stack-tight">
      <section className="section-headline section-headline-compact">
        <div className="section-headline-copy">
          <p className="eyebrow">Support data</p>
          <h1>Address book</h1>
          <p className="section-copy">
            Manage wallets, destinations, and counterparties used by payment requests and run execution.
          </p>
        </div>
      </section>

      <section className="content-grid content-grid-single">
        <div className="workspace-pulse-strip workspace-pulse-strip-standalone">
          <div className="workspace-pulse-strip-grid">
            <Metric label="Wallets" value={String(addresses.length).padStart(2, '0')} />
            <Metric label="Destinations" value={String(destinations.length).padStart(2, '0')} />
            <Metric label="Counterparties" value={String(counterparties.length).padStart(2, '0')} />
            <Metric label="Trusted" value={String(destinations.filter((d) => d.trustState === 'trusted').length).padStart(2, '0')} />
            <Metric label="Internal" value={String(destinations.filter((d) => d.isInternal).length).padStart(2, '0')} />
          </div>
        </div>
      </section>

      {!canManage ? (
        <div className="notice-banner">
          <div>
            <strong>Read only.</strong>
            <p>Only organization admins can change wallets, destinations, and planned transfers in this workspace.</p>
          </div>
        </div>
      ) : null}

      <section className="content-grid content-grid-single">
        <div className="content-panel content-panel-strong">
          <div className="panel-header panel-header-stack">
            <div>
              <p className="eyebrow">Wallet registry</p>
              <h2>Wallets [{addresses.length}]</h2>
              <p className="compact-copy">Saved source wallets used for payment execution and destination linkage.</p>
            </div>
            {canManage ? (
              <button className="primary-button compact-button" onClick={() => setModalState({ type: 'create-wallet' })} type="button">
                + Add wallet
              </button>
            ) : null}
          </div>
          <div className="wallet-table">
            <div className="wallet-table-head">
              <span>Name</span>
              <span>Address</span>
              <span>Destination</span>
              <span>Status</span>
            </div>
            {addresses.length ? (
              addresses.map((item) => {
                const linkedDestinations = destinationsByWalletId.get(item.workspaceAddressId) ?? [];
                const primaryDestination = linkedDestinations[0] ?? null;
                return (
                  <div key={item.workspaceAddressId} className="wallet-table-row">
                    <span className="wallet-table-name">{getWalletName(item)}</span>
                    <span>
                      <a
                        className="wallet-link-button"
                        href={solanaAccountUrl(item.address)}
                        rel="noreferrer"
                        target="_blank"
                        title={item.address}
                      >
                        {shortenAddress(item.address, 8, 8)}
                      </a>
                    </span>
                    <span>
                      {primaryDestination ? (
                        <button
                          className="wallet-link-button"
                          onClick={() => setModalState({ type: 'view-destination', destinationId: primaryDestination.destinationId })}
                          type="button"
                        >
                          {primaryDestination.label}
                          {linkedDestinations.length > 1 ? ` +${linkedDestinations.length - 1}` : ''}
                        </button>
                      ) : (
                        'unlinked'
                      )}
                    </span>
                    <span>{item.isActive ? 'active' : 'inactive'}</span>
                  </div>
                );
              })
            ) : (
              <div className="empty-box compact">No wallets saved yet.</div>
            )}
          </div>
        </div>
      </section>

      <section className="content-grid content-grid-single">
        <div className="content-panel content-panel-strong">
          <div className="panel-header panel-header-stack surface-panel-header">
            <div className="surface-panel-copy">
              <p className="eyebrow">Destination registry</p>
              <h2>Destinations [{destinations.length}]</h2>
              <p className="compact-copy">Operator-facing payout endpoints derived from wallets.</p>
            </div>
            <div className="surface-toolbar">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search destination, wallet, or counterparty"
              />
              <div className="surface-toolbar-actions">
                <button
                  className="primary-button compact-button"
                  disabled={!canManage || addresses.length === 0}
                  onClick={() => setModalState({ type: 'create-destination' })}
                  type="button"
                >
                  + Add destination
                </button>
              </div>
            </div>
          </div>

          <div className="registry-table">
            <div className="registry-table-head">
              <span className="registry-head-cell">Destination</span>
              <span className="registry-head-cell">Wallet</span>
              <span className="registry-head-cell">Owner</span>
              <label className="registry-head-filter">
                <span>Trust</span>
                <select value={trustFilter} onChange={(event) => setTrustFilter(event.target.value as typeof trustFilter)}>
                  <option value="all">all</option>
                  <option value="trusted">trusted</option>
                  <option value="unreviewed">unreviewed</option>
                  <option value="restricted">restricted</option>
                  <option value="blocked">blocked</option>
                </select>
              </label>
              <label className="registry-head-filter">
                <span>Scope</span>
                <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as typeof scopeFilter)}>
                  <option value="all">all</option>
                  <option value="external">external</option>
                  <option value="internal">internal</option>
                </select>
              </label>
              <label className="registry-head-filter">
                <span>Status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                  <option value="all">all</option>
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </label>
            </div>
            {filteredDestinations.length ? (
              filteredDestinations.map((item) => (
                <div key={item.destinationId} className="registry-table-row">
                  <button
                    className="registry-row-button"
                    onClick={() => setModalState({ type: 'view-destination', destinationId: item.destinationId })}
                    type="button"
                  >
                    <span className="registry-cell-primary">
                      <strong>{item.label}</strong>
                    </span>
                    <span className="registry-cell-mono" title={item.linkedWorkspaceAddress?.address ?? item.walletAddress}>
                      {getWalletNameLite(item.linkedWorkspaceAddress)}
                    </span>
                    <span>{item.counterparty?.displayName ?? 'Unassigned'}</span>
                    <span><span className={`tone-pill tone-pill-${mapDestinationTone(item.trustState)}`}>{item.trustState}</span></span>
                    <span>{item.isInternal ? 'internal' : 'external'}</span>
                    <span>{item.isActive ? 'active' : 'inactive'}</span>
                  </button>
                </div>
              ))
            ) : destinations.length ? (
              <div className="empty-box compact">No destinations match the current search or filters.</div>
            ) : (
              <div className="empty-box compact">
                <strong>No destinations yet.</strong>
                <p>Start by turning one of the saved wallets into a named destination. That is the object operators use in requests.</p>
                {canManage && addresses.length ? (
                  <button className="primary-button" onClick={() => setModalState({ type: 'create-destination' })} type="button">
                    Create first destination
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="content-grid content-grid-single">
        <div className="content-panel content-panel-strong">
          <div className="panel-header panel-header-stack">
            <div>
              <p className="eyebrow">Recipient profiles</p>
              <h2>Payees [{payees.length}]</h2>
              <p className="compact-copy">Optional recipient profiles with default destination mappings.</p>
            </div>
            {canManage ? (
              <button className="primary-button compact-button" onClick={() => setModalState({ type: 'create-payee' })} type="button">
                + Add payee
              </button>
            ) : null}
          </div>
          <div className="payee-table">
            <div className="payee-table-head">
              <span>Name</span>
              <span>Default destination</span>
              <span>Status</span>
            </div>
            {payees.length ? (
              payees.map((item) => (
                <div key={item.payeeId} className="payee-table-row">
                  <span className="payee-table-name">{item.name}</span>
                  <span>{item.defaultDestination?.label ?? 'Unassigned'}</span>
                  <span>{item.status}</span>
                </div>
              ))
            ) : (
              <div className="empty-box compact">No payees saved yet.</div>
            )}
          </div>
        </div>
      </section>

      <section className="content-grid content-grid-single">
        <div className="content-panel content-panel-strong">
          <div className="panel-header panel-header-stack">
            <div>
              <p className="eyebrow">Business metadata</p>
              <h2>Counterparties [{counterparties.length}]</h2>
              <p className="compact-copy">Optional ownership metadata mapped to payout destinations.</p>
            </div>
            {canManage ? (
              <button className="primary-button compact-button" onClick={() => setModalState({ type: 'create-counterparty' })} type="button">
                + Add counterparty
              </button>
            ) : null}
          </div>
          <div className="counterparty-table">
            <div className="counterparty-table-head">
              <span>Name</span>
              <span>Wallets</span>
            </div>
            {counterparties.length ? (
              counterparties.map((item) => (
                <div key={item.counterpartyId} className="counterparty-table-row">
                  <span className="counterparty-table-name">{item.displayName}</span>
                  <span>{counterpartyWalletCount.get(item.counterpartyId) ?? 0}</span>
                </div>
              ))
            ) : (
              <div className="empty-box compact">No counterparties saved yet.</div>
            )}
          </div>
        </div>
      </section>

      {modalState ? (
        <div className="registry-modal-backdrop" onClick={() => setModalState(null)} role="presentation">
          <div
            className={
              modalState.type === 'create-destination' || modalState.type === 'edit-destination'
                ? 'registry-modal registry-modal-wide'
                : 'registry-modal'
            }
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {modalState.type === 'create-wallet' || modalState.type === 'edit-wallet' ? (
              <>
                <div className="panel-header panel-header-stack">
                  <div>
                    <p className="eyebrow">Wallet</p>
                    <h2>{editingAddress ? 'Edit wallet' : 'Add wallet'}</h2>
                    <p className="compact-copy">Save the raw onchain address first. Destinations can be created from it later.</p>
                  </div>
                  <button className="ghost-button compact-button danger-button" onClick={() => setModalState(null)} type="button">
                    close
                  </button>
                </div>
                <form key={`wallet-form-${editingAddress?.workspaceAddressId ?? 'new'}`} className="form-stack" onSubmit={(event) => void handleAddressSubmit(event)}>
                  <label className="field">
                    <span>Wallet address</span>
                    <input defaultValue={editingAddress?.address ?? ''} name="address" placeholder="Solana wallet address" required />
                  </label>
                  <label className="field">
                    <span>Wallet name</span>
                    <input defaultValue={editingAddress?.displayName ?? ''} name="displayName" placeholder="Treasury wallet, hot wallet, vendor wallet..." required />
                  </label>
                  <label className="field">
                    <span>Notes</span>
                    <input defaultValue={editingAddress?.notes ?? ''} name="notes" placeholder="Optional context" />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select defaultValue={editingAddress?.isActive === false ? 'false' : 'true'} name="isActive">
                      <option value="true">active</option>
                      <option value="false">inactive</option>
                    </select>
                  </label>
                  <div className="exception-actions">
                    <button className="primary-button" disabled={!canManage} type="submit">
                      {editingAddress ? 'Update wallet' : 'Save wallet'}
                    </button>
                  </div>
                </form>
              </>
            ) : null}

            {modalState.type === 'create-counterparty' || modalState.type === 'edit-counterparty' ? (
              <>
                <div className="panel-header panel-header-stack">
                  <div>
                    <p className="eyebrow">Counterparty</p>
                    <h2>{editingCounterparty ? 'Edit counterparty' : 'Add counterparty'}</h2>
                    <p className="compact-copy">Counterparties are optional business owners for one or more destinations.</p>
                  </div>
                  <button className="ghost-button compact-button danger-button" onClick={() => setModalState(null)} type="button">
                    close
                  </button>
                </div>
                <form key={`counterparty-form-${editingCounterparty?.counterpartyId ?? 'new'}`} className="form-stack" onSubmit={(event) => void handleCounterpartySubmit(event)}>
                  <label className="field">
                    <span>Business entity name</span>
                    <input defaultValue={editingCounterparty?.displayName ?? ''} name="displayName" placeholder="Acme Vendor, Coinbase Prime, Treasury Ops..." required />
                  </label>
                  <label className="field">
                    <span>Category</span>
                    <input defaultValue={editingCounterparty?.category ?? ''} name="category" placeholder="vendor" />
                  </label>
                  <label className="field">
                    <span>Reference</span>
                    <input defaultValue={editingCounterparty?.externalReference ?? ''} name="externalReference" placeholder="Optional external id" />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select defaultValue={editingCounterparty?.status ?? 'active'} name="status">
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </label>
                  <div className="exception-actions">
                    <button className="primary-button" disabled={!canManage} type="submit">
                      {editingCounterparty ? 'Update counterparty' : 'Create counterparty'}
                    </button>
                  </div>
                </form>
              </>
            ) : null}

            {modalState.type === 'create-payee' ? (
              <>
                <div className="panel-header panel-header-stack">
                  <div>
                    <p className="eyebrow">Payee</p>
                    <h2>Add payee</h2>
                    <p className="compact-copy">Named recipient profile with optional default destination.</p>
                  </div>
                  <button className="ghost-button compact-button danger-button" onClick={() => setModalState(null)} type="button">
                    close
                  </button>
                </div>
                <form className="form-stack" onSubmit={async (event) => {
                  await onCreatePayee(event);
                  setModalState(null);
                }}
                >
                  <label className="field">
                    <span>Payee name</span>
                    <input name="name" placeholder="Acme Corp" required />
                  </label>
                  <label className="field">
                    <span>Default destination</span>
                    <select name="defaultDestinationId" defaultValue="">
                      <option value="">Optional</option>
                      {destinations.map((destination) => (
                        <option key={destination.destinationId} value={destination.destinationId}>
                          {destination.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Reference</span>
                    <input name="externalReference" placeholder="Vendor ID" />
                  </label>
                  <label className="field">
                    <span>Notes</span>
                    <input name="notes" placeholder="Optional context" />
                  </label>
                  <div className="exception-actions">
                    <button className="primary-button" disabled={!canManage} type="submit">
                      Save payee
                    </button>
                  </div>
                </form>
              </>
            ) : null}

            {modalState.type === 'create-destination' || modalState.type === 'edit-destination' ? (
              <>
                <div className="panel-header panel-header-stack">
                  <div>
                    <p className="eyebrow">Destination</p>
                    <h2>{editingDestination ? 'Edit destination' : 'New destination'}</h2>
                    <p className="compact-copy">This is the operator-facing payment endpoint that will appear in expected transfers, approvals, and reconciliation.</p>
                  </div>
                  <button className="ghost-button compact-button danger-button" onClick={() => setModalState(null)} type="button">
                    close
                  </button>
                </div>
                <form
                  key={`destination-form-${editingDestination?.destinationId ?? 'new'}`}
                  className="form-stack modal-form-grid"
                  onSubmit={(event) => void handleDestinationSubmit(event)}
                >
                  <label className="field">
                    <span>Linked wallet</span>
                    <select defaultValue={editingDestination?.linkedWorkspaceAddressId ?? (modalState.type === 'create-destination' ? modalState.linkedWorkspaceAddressId ?? '' : '')} name="linkedWorkspaceAddressId" required>
                      <option value="" disabled>
                        Select wallet
                      </option>
                      {addresses.map((address) => (
                        <option key={address.workspaceAddressId} value={address.workspaceAddressId}>
                          {getWalletName(address)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Counterparty</span>
                    <select name="counterpartyId" defaultValue={editingDestination?.counterpartyId ?? ''}>
                      <option value="">Optional</option>
                      {counterparties.map((item) => (
                        <option key={item.counterpartyId} value={item.counterpartyId}>
                          {item.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Destination label</span>
                    <input defaultValue={editingDestination?.label ?? ''} name="label" placeholder="Acme payout wallet" required />
                  </label>
                  <label className="field">
                    <span>Destination type</span>
                    <input defaultValue={editingDestination?.destinationType ?? ''} name="destinationType" placeholder="vendor_wallet" />
                  </label>
                  <label className="field">
                    <span>Trust state</span>
                    <select name="trustState" defaultValue={editingDestination?.trustState ?? 'unreviewed'}>
                      <option value="unreviewed">unreviewed</option>
                      <option value="trusted">trusted</option>
                      <option value="restricted">restricted</option>
                      <option value="blocked">blocked</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Scope</span>
                    <select name="isInternal" defaultValue={editingDestination?.isInternal ? 'true' : 'false'}>
                      <option value="false">external</option>
                      <option value="true">internal</option>
                    </select>
                  </label>
                  <label className="field modal-span-full">
                    <span>Notes</span>
                    <input defaultValue={editingDestination?.notes ?? ''} name="notes" placeholder="Optional context" />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select defaultValue={editingDestination?.isActive === false ? 'false' : 'true'} name="isActive">
                      <option value="true">active</option>
                      <option value="false">inactive</option>
                    </select>
                  </label>
                  <div className="exception-actions modal-span-full">
                    <button className="primary-button" disabled={!canManage || addresses.length === 0} type="submit">
                      {editingDestination ? 'Update destination' : 'Create destination'}
                    </button>
                  </div>
                </form>
              </>
            ) : null}

            {modalState.type === 'view-destination' && selectedDestination ? (
              <>
                <div className="registry-modal-hero">
                  <div className="registry-modal-hero-copy">
                    <h2>{selectedDestination.label}</h2>
                    <span className={`tone-pill tone-pill-${mapDestinationTone(selectedDestination.trustState)}`}>
                      {selectedDestination.trustState}
                    </span>
                  </div>
                  <button className="ghost-button compact-button danger-button" onClick={() => setModalState(null)} type="button">
                    close
                  </button>
                </div>

                <div className="info-grid-tight">
                  <InfoLine label="Scope" value={selectedDestination.isInternal ? 'internal' : 'external'} />
                  <InfoLine label="Status" value={selectedDestination.isActive ? 'active' : 'inactive'} />
                  <InfoLine label="Destination type" value={selectedDestination.destinationType || 'destination'} />
                </div>

                <div className="registry-detail-group">
                  <div className="registry-detail-head">
                    <strong>Linked wallet</strong>
                    {selectedDestinationWallet && canManage ? (
                      <button className="ghost-button compact-button" onClick={() => setModalState({ type: 'edit-wallet', workspaceAddressId: selectedDestinationWallet.workspaceAddressId })} type="button">
                        Edit wallet
                      </button>
                    ) : null}
                  </div>
                  {selectedDestinationWallet ? (
                    <div className="registry-detail-box">
                      <strong>{getWalletNameLite(selectedDestinationWallet)}</strong>
                      <small>{selectedDestinationWallet.address}</small>
                      {selectedDestinationWallet.notes ? <p>{selectedDestinationWallet.notes}</p> : null}
                    </div>
                  ) : (
                    <div className="empty-box compact">No linked wallet found.</div>
                  )}
                </div>

                <div className="registry-detail-group">
                  <div className="registry-detail-head">
                    <strong>Counterparty</strong>
                    {selectedDestinationCounterparty && canManage ? (
                      <button className="ghost-button compact-button" onClick={() => setModalState({ type: 'edit-counterparty', counterpartyId: selectedDestinationCounterparty.counterpartyId })} type="button">
                        Edit counterparty
                      </button>
                    ) : null}
                  </div>
                  {selectedDestinationCounterparty ? (
                    <div className="registry-detail-box">
                      <strong>{selectedDestinationCounterparty.displayName}</strong>
                      <small>{selectedDestinationCounterparty.category || 'uncategorized'} // {selectedDestinationCounterparty.status}</small>
                    </div>
                  ) : (
                    <div className="empty-box compact">No counterparty linked. This is fine for purely operational or still-unclassified destinations.</div>
                  )}
                </div>

                {selectedDestination.notes ? (
                  <div className="registry-detail-group">
                    <div className="registry-detail-head">
                      <strong>Notes</strong>
                    </div>
                    <div className="registry-detail-box">
                      <p>{selectedDestination.notes}</p>
                    </div>
                  </div>
                ) : null}

                {canManage ? (
                  <div className="exception-actions">
                    <button className="primary-button" onClick={() => setModalState({ type: 'edit-destination', destinationId: selectedDestination.destinationId })} type="button">
                      Edit destination
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WorkspacePolicyPage({
  approvalPolicy,
  canManage,
  destinations,
  paymentOrders,
  onUpdateApprovalPolicy,
}: {
  approvalPolicy: ApprovalPolicy | null;
  canManage: boolean;
  destinations: Destination[];
  paymentOrders: PaymentOrder[];
  onUpdateApprovalPolicy: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const pendingApprovals = paymentOrders.filter((order) => order.derivedState === 'pending_approval').length;
  const trustedDestinationCoverage = destinations.length
    ? Math.round((destinations.filter((destination) => destination.trustState === 'trusted').length / destinations.length) * 100)
    : 0;
  const externalApprovalLoad = paymentOrders.filter(
    (order) => order.destination && !order.destination.isInternal && order.derivedState === 'pending_approval',
  ).length;
  const thresholdTriggered = approvalPolicy
    ? paymentOrders.filter((order) => {
      const raw = BigInt(order.amountRaw);
      return raw >= BigInt(approvalPolicy.ruleJson.externalApprovalThresholdRaw)
        || raw >= BigInt(approvalPolicy.ruleJson.internalApprovalThresholdRaw);
    }).length
    : 0;

  return (
    <div className="page-stack page-stack-tight">
      <section className="section-headline section-headline-compact">
        <div className="section-headline-copy">
          <p className="eyebrow">Policy</p>
          <h1>Approval policy</h1>
          <p className="section-copy">
            Configure approval routing, trust gates, and thresholds that shape payment flow.
          </p>
        </div>
        {canManage ? (
          <div className="hero-actions">
            <button className="primary-button compact-button" onClick={() => setEditOpen(true)} type="button">
              Edit policy
            </button>
          </div>
        ) : null}
      </section>

      {!canManage ? (
        <div className="notice-banner">
          <div>
            <strong>Read only.</strong>
            <p>Only organization admins can change approval policy for this workspace.</p>
          </div>
        </div>
      ) : null}

      <section className="content-grid content-grid-single">
        <div className="workspace-pulse-strip workspace-pulse-strip-standalone">
          <div className="workspace-pulse-strip-grid">
            <Metric label="Pending approvals" value={String(pendingApprovals)} />
            <Metric label="Threshold-triggered" value={String(thresholdTriggered)} />
            <Metric label="Trusted destinations" value={`${trustedDestinationCoverage}%`} />
            <Metric label="External approval load" value={String(externalApprovalLoad)} />
          </div>
        </div>
      </section>

      <section className="content-grid content-grid-single">
        <div className="content-panel content-panel-strong">
          <div className="panel-header panel-header-stack">
            <div>
              <p className="eyebrow">Policy</p>
              <h2>Active strategy</h2>
              <p className="compact-copy">Policy posture and live impact on current payment flow.</p>
            </div>
          </div>
          {approvalPolicy ? (
            <div className="policy-summary-grid">
              <dl className="policy-summary-card">
                <dt>Policy name</dt>
                <dd>{approvalPolicy.policyName}</dd>
              </dl>
              <dl className="policy-summary-card">
                <dt>Status</dt>
                <dd>{approvalPolicy.isActive ? 'Active' : 'Inactive'}</dd>
              </dl>
              <dl className="policy-summary-card">
                <dt>Trusted destination</dt>
                <dd>{approvalPolicy.ruleJson.requireTrustedDestination ? 'Yes' : 'No'}</dd>
              </dl>
              <dl className="policy-summary-card">
                <dt>External approval</dt>
                <dd>{approvalPolicy.ruleJson.requireApprovalForExternal ? 'Yes' : 'No'}</dd>
              </dl>
              <dl className="policy-summary-card">
                <dt>Internal approval</dt>
                <dd>{approvalPolicy.ruleJson.requireApprovalForInternal ? 'Yes' : 'No'}</dd>
              </dl>
              <dl className="policy-summary-card">
                <dt>External threshold</dt>
                <dd>{formatRawUsdcCompact(approvalPolicy.ruleJson.externalApprovalThresholdRaw)} USDC</dd>
              </dl>
              <dl className="policy-summary-card">
                <dt>Internal threshold</dt>
                <dd>{formatRawUsdcCompact(approvalPolicy.ruleJson.internalApprovalThresholdRaw)} USDC</dd>
              </dl>
              <dl className="policy-summary-card">
                <dt>Updated</dt>
                <dd>{formatTimestampCompact(approvalPolicy.updatedAt)}</dd>
              </dl>
            </div>
          ) : (
            <div className="empty-box compact">Approval policy unavailable.</div>
          )}
        </div>
      </section>

      {editOpen && approvalPolicy ? (
        <div className="registry-modal-backdrop" onClick={() => setEditOpen(false)} role="presentation">
          <div className="registry-modal registry-modal-wide" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="panel-header panel-header-stack">
              <div>
                <p className="eyebrow">Policy</p>
                <h2>Edit approval policy</h2>
              </div>
              <button className="ghost-button compact-button danger-button" onClick={() => setEditOpen(false)} type="button">
                close
              </button>
            </div>

            <form
              className="form-stack"
              onSubmit={async (event) => {
                await onUpdateApprovalPolicy(event);
                setEditOpen(false);
              }}
            >
              <section className="content-panel content-panel-soft policy-group-panel">
                <div className="panel-header panel-header-stack">
                  <div>
                    <p className="eyebrow">Policy identity</p>
                    <p className="compact-copy">Name and activation for this workspace policy.</p>
                  </div>
                </div>
                <label className="field">
                  <span>Policy name</span>
                  <input name="policyName" defaultValue={approvalPolicy.policyName} />
                </label>
                <label className="field checkbox-field">
                  <input name="isActive" defaultChecked={approvalPolicy.isActive} type="checkbox" />
                  Active policy for new payment checks
                </label>
              </section>

              <section className="content-panel content-panel-soft policy-group-panel">
                <div className="panel-header panel-header-stack">
                  <div>
                    <p className="eyebrow">Trust gates</p>
                    <p className="compact-copy">Destination trust controls before execution.</p>
                  </div>
                </div>
                <label className="field checkbox-field">
                  <input name="requireTrustedDestination" defaultChecked={approvalPolicy.ruleJson.requireTrustedDestination} type="checkbox" />
                  Require trusted destination before execution
                </label>
              </section>

              <section className="content-panel content-panel-soft policy-group-panel">
                <div className="panel-header panel-header-stack">
                  <div>
                    <p className="eyebrow">Approval routing</p>
                    <p className="compact-copy">Whether internal and external requests must go through approval.</p>
                  </div>
                </div>
                <label className="field checkbox-field">
                  <input name="requireApprovalForExternal" defaultChecked={approvalPolicy.ruleJson.requireApprovalForExternal} type="checkbox" />
                  Require approval for external payments
                </label>
                <label className="field checkbox-field">
                  <input name="requireApprovalForInternal" defaultChecked={approvalPolicy.ruleJson.requireApprovalForInternal} type="checkbox" />
                  Require approval for internal payments
                </label>
              </section>

              <section className="content-panel content-panel-soft policy-group-panel">
                <div className="panel-header panel-header-stack">
                  <div>
                    <p className="eyebrow">Thresholds</p>
                    <p className="compact-copy">Raw amount triggers for mandatory approval checks.</p>
                  </div>
                </div>
                <label className="field">
                  <span>External threshold (raw)</span>
                  <input name="externalApprovalThresholdRaw" defaultValue={approvalPolicy.ruleJson.externalApprovalThresholdRaw} required />
                </label>
                <label className="field">
                  <span>Internal threshold (raw)</span>
                  <input name="internalApprovalThresholdRaw" defaultValue={approvalPolicy.ruleJson.internalApprovalThresholdRaw} required />
                </label>
              </section>

              <div className="notice">Saving applies immediately. Review approval queue impact after changes.</div>

              <div className="exception-actions">
                <button className="ghost-button compact-button" type="button" onClick={() => setEditOpen(false)}>
                  Cancel
                </button>
                <button className="primary-button" disabled={!canManage} type="submit">
                  Save policy
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceRequestsPage({
  addresses,
  canManage,
  currentWorkspace,
  destinations,
  onAttachPaymentOrderSignature,
  onCancelPaymentOrder,
  onDeletePaymentRun,
  onCreatePaymentOrder,
  onCreatePaymentOrderExecution,
  onDownloadPaymentOrderAuditExport,
  onDownloadPaymentOrderProof,
  onDownloadPaymentRunProof,
  onImportPaymentRequestsCsv,
  onPreparePaymentOrderExecution,
  onPreparePaymentRunExecution,
  onSignPreparedPaymentOrder,
  onSignPreparedPaymentRun,
  onSubmitPaymentOrder,
  onOpenPaymentDetail,
  onOpenRunDetail,
  onExitDetail,
  focusedPaymentOrderId,
  focusedPaymentRunId,
  paymentOrders,
  paymentRequests,
  paymentRuns,
  reconciliationRows,
  mode = 'payments',
}: {
  addresses: WorkspaceAddress[];
  canManage: boolean;
  currentWorkspace: Workspace;
  destinations: Destination[];
  onAttachPaymentOrderSignature: (paymentOrderId: string, event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCancelPaymentOrder: (paymentOrderId: string) => Promise<void>;
  onDeletePaymentRun: (paymentRunId: string) => Promise<void>;
  onCreatePaymentOrder: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCreatePaymentOrderExecution: (paymentOrderId: string, event: FormEvent<HTMLFormElement>) => Promise<void>;
  onDownloadPaymentOrderAuditExport: (paymentOrderId: string) => Promise<void>;
  onDownloadPaymentOrderProof: (paymentOrderId: string) => Promise<void>;
  onDownloadPaymentRunProof: (paymentRunId: string) => Promise<void>;
  onImportPaymentRequestsCsv: (event: FormEvent<HTMLFormElement>) => Promise<{ ok: boolean; message?: string }>;
  onPreparePaymentOrderExecution: (
    paymentOrderId: string,
    input?: { sourceWorkspaceAddressId?: string },
  ) => Promise<PaymentExecutionPreparation | null>;
  onPreparePaymentRunExecution: (
    paymentRunId: string,
    input?: { sourceWorkspaceAddressId?: string },
  ) => Promise<PaymentRunExecutionPreparation | null>;
  onSignPreparedPaymentOrder: (paymentOrderId: string, packet: PaymentExecutionPacket, walletOptionId?: string) => Promise<string | null>;
  onSignPreparedPaymentRun: (paymentRunId: string, packet: PaymentExecutionPacket, walletOptionId?: string) => Promise<string | null>;
  onSubmitPaymentOrder: (paymentOrderId: string) => Promise<void>;
  onOpenPaymentDetail?: (paymentOrderId: string) => void;
  onOpenRunDetail?: (paymentRunId: string) => void;
  onExitDetail?: () => void;
  focusedPaymentOrderId?: string;
  focusedPaymentRunId?: string;
  paymentOrders: PaymentOrder[];
  paymentRequests: PaymentRequest[];
  paymentRuns: PaymentRun[];
  reconciliationRows: ReconciliationRow[];
  mode?: 'payments' | 'runs' | 'approvals' | 'execution';
}) {
  const [modalState, setModalState] = useState<
    | { type: 'create' }
    | { type: 'import-csv' }
    | { type: 'view-run'; paymentRunId: string }
    | { type: 'view'; paymentOrderId: string }
    | null
  >(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequestDestinationId, setSelectedRequestDestinationId] = useState('');
  const [submitNow, setSubmitNow] = useState(true);
  const [csvImportMessage, setCsvImportMessage] = useState<string | null>(null);
  const [executionSourceWalletId, setExecutionSourceWalletId] = useState('');
  const [preparedExecutionByOrderId, setPreparedExecutionByOrderId] = useState<Record<string, PaymentExecutionPacket>>({});
  const [preparedExecutionByRunId, setPreparedExecutionByRunId] = useState<Record<string, PaymentExecutionPacket>>({});
  const [browserWallets, setBrowserWallets] = useState<BrowserWalletOption[]>(() => discoverSolanaWallets());
  const [selectedBrowserWalletId, setSelectedBrowserWalletId] = useState('');
  const [walletSigningState, setWalletSigningState] = useState<{
    status: 'signing' | 'success' | 'error';
    message: string;
  } | null>(null);
  const [expandedRunLifecycleStages, setExpandedRunLifecycleStages] = useState<Record<'imported' | 'reviewed' | 'approved' | 'submitted' | 'settled' | 'proven', boolean>>({
    imported: false,
    reviewed: false,
    approved: false,
    submitted: false,
    settled: false,
    proven: false,
  });
  const [expandedTimelineStages, setExpandedTimelineStages] = useState<{ approval: boolean; settlement: boolean }>({
    approval: false,
    settlement: false,
  });
  const selectedRequestDestination =
    destinations.find((item) => item.destinationId === selectedRequestDestinationId) ?? null;
  const reconciliationByRequestId = new Map(reconciliationRows.map((row) => [row.transferRequestId, row] as const));
  const paymentOrderById = new Map(paymentOrders.map((order) => [order.paymentOrderId, order] as const));
  const linkedOrderIds = new Set(paymentRequests.map((request) => request.paymentOrder?.paymentOrderId).filter(Boolean));
  const paymentWorkItems = [
    ...paymentRequests.map((request) => ({
      kind: 'request' as const,
      id: request.paymentRequestId,
      createdAt: request.createdAt,
      request,
      order: request.paymentOrder ? paymentOrderById.get(request.paymentOrder.paymentOrderId) ?? null : null,
    })),
    ...paymentOrders
      .filter((order) => !order.paymentRequestId && !linkedOrderIds.has(order.paymentOrderId))
      .map((order) => ({
        kind: 'order' as const,
        id: order.paymentOrderId,
        createdAt: order.createdAt,
        request: null,
        order,
      })),
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .filter((item) => {
      if (!searchQuery.trim()) {
        return true;
      }
      const query = searchQuery.trim().toLowerCase();
      const order = item.order;
      const request = item.request;
      return [
        item.id,
        request?.reason ?? '',
        request?.payee?.name ?? '',
        request?.externalReference ?? '',
        request?.state ?? '',
        order?.paymentOrderId ?? '',
        order?.payee?.name ?? '',
        order?.sourceWorkspaceAddress ? getWalletName(order.sourceWorkspaceAddress) : '',
        order?.destination.label ?? request?.destination.label ?? '',
        order?.destination?.counterparty?.displayName ?? request?.counterparty?.displayName ?? '',
        order?.memo ?? '',
        order?.externalReference ?? '',
        order?.invoiceNumber ?? '',
        order?.state ?? '',
        order?.derivedState ?? '',
        order?.reconciliationDetail?.approvalState ?? '',
        order?.reconciliationDetail?.executionState ?? '',
        order?.reconciliationDetail?.requestDisplayState ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  const visibleWorkItems = paymentWorkItems.filter((item) => {
    const order = item.order;
    if (mode === 'approvals') return order?.derivedState === 'pending_approval';
    if (mode === 'execution') {
      return Boolean(order && ['approved', 'ready_for_execution', 'execution_recorded', 'partially_settled', 'exception'].includes(order.derivedState));
    }
    return true;
  });
  const visibleRuns = mode === 'runs' ? paymentRuns : paymentRuns;
  const canCreateRequest = mode === 'payments';
  const showCsvImport = mode === 'payments' || mode === 'runs';
  const actionLabel = canCreateRequest ? 'New payment request' : mode === 'runs' ? 'Open run' : 'Open queue';
  const pendingApprovalOrders = paymentOrders
    .filter((order) => order.derivedState === 'pending_approval')
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const approvalHistoryOrders = paymentOrders
    .filter((order) => (order.reconciliationDetail?.approvalDecisions ?? []).some((d) => ['approve', 'reject', 'escalate'].includes(d.action)))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  const executionQueueOrders = paymentOrders
    .filter((order) => ['approved', 'ready_for_execution', 'execution_recorded', 'partially_settled', 'exception'].includes(order.derivedState))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  const latestDecisions = approvalHistoryOrders
    .map((order) => {
      const decisions = (order.reconciliationDetail?.approvalDecisions ?? [])
        .filter((decision) => ['approve', 'reject', 'escalate'].includes(decision.action))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return decisions[0] ?? null;
    })
    .filter((decision): decision is NonNullable<typeof decision> => Boolean(decision));
  const approvedCount = latestDecisions.filter((decision) => decision.action === 'approve').length;
  const rejectedCount = latestDecisions.filter((decision) => decision.action === 'reject').length;
  const escalatedCount = latestDecisions.filter((decision) => decision.action === 'escalate').length;
  const readyToSignCount = executionQueueOrders.filter((order) => order.derivedState === 'ready_for_execution').length;
  const executedCount = paymentOrders.filter((order) => Boolean(order.reconciliationDetail?.latestExecution?.submittedSignature)).length;
  const executionNeedsReviewCount = executionQueueOrders.filter((order) => order.derivedState === 'exception' || order.derivedState === 'partially_settled').length;
  const executedHistoryOrders = paymentOrders
    .filter((order) => Boolean(order.reconciliationDetail?.latestExecution?.submittedSignature))
    .sort((a, b) => {
      const aTime = new Date(a.reconciliationDetail?.latestExecution?.submittedAt ?? a.updatedAt).getTime();
      const bTime = new Date(b.reconciliationDetail?.latestExecution?.submittedAt ?? b.updatedAt).getTime();
      return bTime - aTime;
    })
    .slice(0, 12);
  const standaloneOrders = paymentOrders.filter((order) => !order.paymentRunId);
  const standaloneNeedsAction = standaloneOrders.filter(isActionableOrder).length;
  const runNeedsAction = paymentRuns.filter((run) => ['draft', 'pending_approval', 'ready_for_execution', 'execution_recorded', 'partially_settled', 'exception'].includes(run.derivedState)).length;
  const standaloneReadyToSign = standaloneOrders.filter((order) => order.derivedState === 'ready_for_execution').length;
  const runReadyToSign = paymentRuns.filter((run) => run.derivedState === 'ready_for_execution').length;
  const standaloneCompleted = standaloneOrders.filter((order) => order.derivedState === 'settled' || order.derivedState === 'closed').length;
  const runCompleted = paymentRuns.filter((run) => run.derivedState === 'settled' || run.derivedState === 'closed').length;
  const unifiedRows = [
    ...standaloneOrders.map((order) => ({
      kind: 'payment' as const,
      id: order.paymentOrderId,
      name: order.payee?.name ?? order.destination.label,
      amountLabel: `${formatRawUsdcCompact(order.amountRaw)} ${(order.asset ?? 'USDC').toUpperCase()}`,
      sourceLabel: order.sourceWorkspaceAddress ? getWalletName(order.sourceWorkspaceAddress) : 'Not set',
      refLabel: order.externalReference ?? order.invoiceNumber ?? order.memo ?? 'N/A',
      stateLabel: formatLabel(order.derivedState),
      tone: getProgressTone(order.derivedState),
      createdAt: order.createdAt,
      order,
      run: null as PaymentRun | null,
    })),
    ...paymentRuns.map((run) => ({
      kind: 'run' as const,
      id: run.paymentRunId,
      name: run.runName,
      amountLabel: `${formatRawUsdcCompact(run.totals.totalAmountRaw)} USDC`,
      sourceLabel: run.sourceWorkspaceAddress ? getWalletName(run.sourceWorkspaceAddress) : 'Not set',
      refLabel: `${run.totals.orderCount} rows`,
      stateLabel: formatLabel(run.derivedState),
      tone: getProgressTone(run.derivedState),
      createdAt: run.createdAt,
      order: null as PaymentOrder | null,
      run,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const surfaceMeta = mode === 'runs'
    ? {
        eyebrow: 'Payment runs',
        title: 'Batch run operations',
        copy: 'Review imported runs, execute eligible rows, and export run-level proof packets.',
        tableTitle: 'Runs to proof',
      }
    : mode === 'approvals'
      ? {
          eyebrow: 'Approvals',
          title: 'Approval queue',
          copy: 'Payments waiting for decision before execution can begin.',
          tableTitle: 'Pending approvals',
        }
      : mode === 'execution'
        ? {
            eyebrow: 'Execution',
            title: 'Execution queue',
            copy: 'Prepare, sign, and submit approved payments with clear operational sequencing.',
            tableTitle: 'Execution work items',
          }
        : {
            eyebrow: 'Payments',
            title: 'Payment control',
            copy: 'Review payment intent, execution, settlement, exceptions, and proof from one queue.',
            tableTitle: 'Payments and batches',
          };
  const isPlainQueueSurface = mode === 'approvals' || mode === 'execution';
  const activeModalState = focusedPaymentOrderId
    ? { type: 'view' as const, paymentOrderId: focusedPaymentOrderId }
    : focusedPaymentRunId
      ? { type: 'view-run' as const, paymentRunId: focusedPaymentRunId }
      : modalState;
  const usingRouteDetail = Boolean(focusedPaymentOrderId || focusedPaymentRunId);
  const isPaymentsListSurface = !usingRouteDetail && mode === 'payments';
  const isQueueSurface = !usingRouteDetail && (mode === 'approvals' || mode === 'execution');
  const closeDetail = () => {
    if (usingRouteDetail) {
      onExitDetail?.();
      return;
    }
    setModalState(null);
  };
  const selectedOrder =
    activeModalState?.type === 'view'
      ? paymentOrders.find((item) => item.paymentOrderId === activeModalState.paymentOrderId) ?? null
      : null;
  const selectedRun =
    activeModalState?.type === 'view-run'
      ? paymentRuns.find((item) => item.paymentRunId === activeModalState.paymentRunId) ?? null
      : null;
  const selectedOrderDetail = selectedOrder?.reconciliationDetail ?? null;
  const selectedRequestRow = selectedOrder?.transferRequestId
    ? reconciliationByRequestId.get(selectedOrder.transferRequestId) ?? selectedOrderDetail
    : null;
  const selectedOrderPreparedExecution =
    selectedOrder
      ? preparedExecutionByOrderId[selectedOrder.paymentOrderId] ?? getLatestPreparedExecutionPacket(selectedOrder)
      : null;
  const selectedRunPreparedExecution =
    selectedRun
      ? preparedExecutionByRunId[selectedRun.paymentRunId] ?? null
      : null;
  const selectedOrderProgress =
    selectedOrder
      ? getPaymentProgress(selectedOrder, selectedRequestRow, selectedOrderPreparedExecution)
      : null;
  const runOrders = selectedRun
    ? paymentOrders.filter((order) => order.paymentRunId === selectedRun.paymentRunId)
    : [];
  const runWorkflowSteps = selectedRun ? buildRunWorkflow(selectedRun) : [];
  const resolvedApprovalEvents = runOrders
    .flatMap((order) => (order.reconciliationDetail?.approvalDecisions ?? []).map((decision) => ({ order, decision })))
    .filter(({ decision }) => ['approve', 'reject', 'escalate'].includes(decision.action))
    .sort((a, b) => new Date(b.decision.createdAt).getTime() - new Date(a.decision.createdAt).getTime());
  const submissionEvents = runOrders
    .flatMap((order) => {
      const latestExecution = order.reconciliationDetail?.latestExecution;
      if (!latestExecution?.submittedSignature) return [];
      return [{
        order,
        signature: latestExecution.submittedSignature,
        submittedAt: latestExecution.submittedAt ?? latestExecution.createdAt ?? order.updatedAt,
      }];
    })
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  const settlementEvents = runOrders
    .flatMap((order) => {
      const match = order.reconciliationDetail?.match;
      if (!match?.matchedAt) return [];
      return [{
        order,
        matchStatus: match.matchStatus,
        matchedAt: match.matchedAt,
      }];
    })
    .sort((a, b) => new Date(b.matchedAt).getTime() - new Date(a.matchedAt).getTime());
  const latestDecision = selectedOrder
    ? (selectedOrder.reconciliationDetail?.approvalDecisions ?? [])
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null
    : null;

  useEffect(() => {
    if (!selectedRequestDestination) {
      setSubmitNow(true);
      return;
    }

    if (
      !selectedRequestDestination.isActive
      || selectedRequestDestination.trustState === 'blocked'
      || selectedRequestDestination.trustState === 'restricted'
      || selectedRequestDestination.trustState === 'unreviewed'
    ) {
      setSubmitNow(false);
      return;
    }

    setSubmitNow(true);
  }, [selectedRequestDestination]);

  useEffect(() => {
    setExecutionSourceWalletId(selectedOrder?.sourceWorkspaceAddressId ?? '');
    setSelectedBrowserWalletId('');
    setWalletSigningState(null);
  }, [selectedOrder?.paymentOrderId, selectedOrder?.sourceWorkspaceAddressId]);

  useEffect(() => {
    return subscribeSolanaWallets(setBrowserWallets);
  }, []);

  useEffect(() => {
    const activePreparedExecution = selectedOrderPreparedExecution ?? selectedRunPreparedExecution;
    if (!activePreparedExecution) {
      return;
    }

    const selectedStillExists = selectedBrowserWalletId
      ? browserWallets.some((wallet) => wallet.id === selectedBrowserWalletId && wallet.ready)
      : false;
    if (selectedStillExists) {
      return;
    }

    const exactSignerWallet = browserWallets.find(
      (wallet) => wallet.ready && wallet.address === activePreparedExecution.signerWallet,
    );
    const connectableWallet = browserWallets.find((wallet) => wallet.ready && wallet.address === null);
    setSelectedBrowserWalletId(exactSignerWallet?.id ?? connectableWallet?.id ?? '');
  }, [browserWallets, selectedBrowserWalletId, selectedOrderPreparedExecution, selectedRunPreparedExecution]);

  return (
    <div className="page-stack page-stack-tight">
      {isPaymentsListSurface ? (
        <div className="request-detail-page">
          <div className="request-main-panel request-detail-surface">
            <section className="section-headline section-headline-compact">
              <div className="section-headline-copy">
                <p className="eyebrow">{surfaceMeta.eyebrow}</p>
                <h1>{surfaceMeta.title}</h1>
                <p className="section-copy">{surfaceMeta.copy}</p>
              </div>
              <div className="hero-actions">
                <button
                  className="ghost-button"
                  disabled={!canManage}
                  onClick={() => {
                    setCsvImportMessage(null);
                    setModalState({ type: 'import-csv' });
                  }}
                  type="button"
                >
                  Import CSV batch
                </button>
                <button
                  className="primary-button"
                  disabled={!canManage}
                  onClick={() => setModalState({ type: 'create' })}
                  type="button"
                >
                  New payment request
                </button>
              </div>
            </section>

            {!canManage ? (
              <div className="notice-banner">
                <div>
                  <strong>Read only.</strong>
                  <p>Only organization admins can create or change payment requests in this workspace.</p>
                </div>
              </div>
            ) : null}

            <section className="content-grid content-grid-single">
              <div className="workspace-pulse-strip workspace-pulse-strip-standalone">
                <div className="workspace-pulse-strip-grid">
                  <Metric label="Needs action" value={String(standaloneNeedsAction + runNeedsAction).padStart(2, '0')} />
                  <Metric label="Ready to sign" value={String(standaloneReadyToSign + runReadyToSign).padStart(2, '0')} />
                  <Metric label="Completed" value={String(standaloneCompleted + runCompleted).padStart(2, '0')} />
                </div>
              </div>
            </section>

            <div className="panel-header surface-panel-header">
              <div className="surface-panel-copy">
                <h2 className="registry-section-title">
                  Payments and batches <span className="registry-count-inline">[{unifiedRows.length}]</span>
                </h2>
              </div>
              <div className="surface-toolbar">
                <label className="queue-select surface-search">
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search payment, run, source, reference, or state"
                  />
                </label>
              </div>
            </div>

            <div className="request-table compact-request-table payment-order-table unified-payments-table">
              <div className="request-table-head">
                <span>Type</span>
                <span>Name</span>
                <span>Amount</span>
                <span>Source</span>
                <span>Reference</span>
                <span>Status</span>
                <span>Created</span>
              </div>
              {unifiedRows
                .filter((row) => {
                  if (!searchQuery.trim()) return true;
                  const q = searchQuery.trim().toLowerCase();
                  return [row.name, row.amountLabel, row.sourceLabel, row.refLabel, row.stateLabel].join(' ').toLowerCase().includes(q);
                })
                .map((row) => (
                  <div className="request-table-row" key={row.id}>
                    <button
                      className="request-row-button"
                      onClick={() => {
                        if (row.kind === 'run' && row.run) {
                          setExecutionSourceWalletId(row.run.sourceWorkspaceAddressId ?? '');
                          onOpenRunDetail?.(row.run.paymentRunId);
                          if (!onOpenRunDetail) setModalState({ type: 'view-run', paymentRunId: row.run.paymentRunId });
                          return;
                        }
                        if (row.order) {
                          onOpenPaymentDetail?.(row.order.paymentOrderId);
                          if (!onOpenPaymentDetail) setModalState({ type: 'view', paymentOrderId: row.order.paymentOrderId });
                        }
                      }}
                      type="button"
                    >
                      <span className="request-cell-single">{row.kind === 'run' ? 'Batch run' : 'Payment'}</span>
                      <span className="request-cell-primary"><strong>{row.name}</strong></span>
                      <span className="request-cell-single">{row.amountLabel}</span>
                      <span className="request-cell-single">{row.sourceLabel}</span>
                      <span className="request-cell-single">{row.refLabel}</span>
                      <span className="request-cell-single"><span className={`tone-pill tone-pill-${row.tone}`}>{row.stateLabel}</span></span>
                      <span className="request-cell-single">{formatTimestampCompact(row.createdAt)}</span>
                    </button>
                  </div>
                ))}
              {!unifiedRows.length ? (
                <div className="empty-box compact">No payments yet. Create a payment request or import a CSV batch.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {!usingRouteDetail && !isPaymentsListSurface && !isQueueSurface ? (
        <section className="section-headline section-headline-compact">
          <div className="section-headline-copy">
            <p className="eyebrow">{surfaceMeta.eyebrow}</p>
            <h1>{surfaceMeta.title}</h1>
            <p className="section-copy">
              {surfaceMeta.copy}
            </p>
          </div>
          {mode === 'payments' ? (
            <div className="hero-actions">
              <button
                className="ghost-button"
                disabled={!canManage}
                onClick={() => {
                  setCsvImportMessage(null);
                  setModalState({ type: 'import-csv' });
                }}
                type="button"
              >
                Import CSV batch
              </button>
              <button
                className="primary-button"
                disabled={!canManage}
                onClick={() => setModalState({ type: 'create' })}
                type="button"
              >
                New payment request
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {!canManage && !isPaymentsListSurface && !isQueueSurface ? (
        <div className="notice-banner">
          <div>
            <strong>Read only.</strong>
            <p>Only organization admins can create or change payment requests in this workspace.</p>
          </div>
        </div>
      ) : null}

      {mode === 'payments' && !usingRouteDetail && !isPaymentsListSurface ? (
        <section className="content-grid content-grid-single">
          <div className="workspace-pulse-strip workspace-pulse-strip-standalone">
            <div className="workspace-pulse-strip-grid">
              <Metric label="Needs action" value={String(standaloneNeedsAction + runNeedsAction).padStart(2, '0')} />
              <Metric label="Ready to sign" value={String(standaloneReadyToSign + runReadyToSign).padStart(2, '0')} />
              <Metric label="Completed" value={String(standaloneCompleted + runCompleted).padStart(2, '0')} />
            </div>
          </div>
        </section>
      ) : null}

      {!usingRouteDetail && !isPaymentsListSurface ? (
      <div className="request-detail-page">
      <section className="request-shell">
        <div
          className={
            isPlainQueueSurface
              ? 'request-main-panel request-detail-surface'
              : mode === 'payments'
                ? 'request-main-panel request-detail-surface'
                : 'content-panel content-panel-strong request-main-panel'
          }
        >
          {isQueueSurface ? (
            <>
              <section className="section-headline section-headline-compact">
                <div className="section-headline-copy">
                  <p className="eyebrow">{surfaceMeta.eyebrow}</p>
                  <h1>{surfaceMeta.title}</h1>
                  <p className="section-copy">{surfaceMeta.copy}</p>
                </div>
              </section>
              {!canManage ? (
                <div className="notice-banner">
                  <div>
                    <strong>Read only.</strong>
                    <p>Only organization admins can create or change payment requests in this workspace.</p>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {mode !== 'payments' ? (
            <>
              {mode !== 'approvals' && mode !== 'execution' ? (
                <TableSurfaceHeader
                  actionDisabled={!canManage || !canCreateRequest}
                  actionLabel={actionLabel}
                  count={mode === 'runs' ? visibleRuns.length : visibleWorkItems.length}
                  onAction={() => {
                    if (canCreateRequest) setModalState({ type: 'create' });
                  }}
                  onSearchChange={setSearchQuery}
                  searchPlaceholder="Search request, payee, destination, reference, or state"
                  searchValue={searchQuery}
                  title={surfaceMeta.tableTitle}
                />
              ) : null}
              {showCsvImport ? (
              <div className="inline-action-row">
                <button
                  className="ghost-button compact-button"
                  disabled={!canManage}
                  onClick={() => {
                    setCsvImportMessage(null);
                    setModalState({ type: 'import-csv' });
                  }}
                  type="button"
                >
                  Import CSV batch
                </button>
                <small>CSV columns: payee, destination, amount, reference, due_date.</small>
              </div>
              ) : null}
            </>
          ) : (
            <div className="panel-header surface-panel-header">
              <div className="surface-panel-copy">
                <h2 className="registry-section-title">
                  Payments and batches <span className="registry-count-inline">[{unifiedRows.length}]</span>
                </h2>
              </div>
              <div className="surface-toolbar">
                <label className="queue-select surface-search">
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search payment, run, source, reference, or state"
                  />
                </label>
              </div>
            </div>
          )}

          {mode === 'payments' ? (
            <div className="request-table compact-request-table payment-order-table unified-payments-table">
              <div className="request-table-head">
                <span>Type</span>
                <span>Name</span>
                <span>Amount</span>
                <span>Source</span>
                <span>Reference</span>
                <span>Status</span>
                <span>Created</span>
              </div>
              {unifiedRows
                .filter((row) => {
                  if (!searchQuery.trim()) return true;
                  const q = searchQuery.trim().toLowerCase();
                  return [row.name, row.amountLabel, row.sourceLabel, row.refLabel, row.stateLabel].join(' ').toLowerCase().includes(q);
                })
                .map((row) => (
                  <div className="request-table-row" key={row.id}>
                    <button
                      className="request-row-button"
                      onClick={() => {
                        if (row.kind === 'run' && row.run) {
                          setExecutionSourceWalletId(row.run.sourceWorkspaceAddressId ?? '');
                          onOpenRunDetail?.(row.run.paymentRunId);
                          if (!onOpenRunDetail) setModalState({ type: 'view-run', paymentRunId: row.run.paymentRunId });
                          return;
                        }
                        if (row.order) {
                          onOpenPaymentDetail?.(row.order.paymentOrderId);
                          if (!onOpenPaymentDetail) setModalState({ type: 'view', paymentOrderId: row.order.paymentOrderId });
                        }
                      }}
                      type="button"
                    >
                      <span className="request-cell-single">{row.kind === 'run' ? 'Batch run' : 'Payment'}</span>
                      <span className="request-cell-primary"><strong>{row.name}</strong></span>
                      <span className="request-cell-single">{row.amountLabel}</span>
                      <span className="request-cell-single">{row.sourceLabel}</span>
                      <span className="request-cell-single">{row.refLabel}</span>
                      <span className="request-cell-single"><span className={`tone-pill tone-pill-${row.tone}`}>{row.stateLabel}</span></span>
                      <span className="request-cell-single">{formatTimestampCompact(row.createdAt)}</span>
                    </button>
                  </div>
                ))}
              {!unifiedRows.length ? (
                <div className="empty-box compact">No payments yet. Create a payment request or import a CSV batch.</div>
              ) : null}
            </div>
          ) : null}

          {(mode === 'runs') && visibleRuns.length ? (
            <div className="request-table compact-request-table payment-order-table payment-run-table">
              <div className="request-table-head">
                <span>Run</span>
                <span>Rows</span>
                <span>Total</span>
                <span>Ready</span>
                <span>State</span>
                <span>Created</span>
              </div>
              {visibleRuns.map((run) => (
                <div key={run.paymentRunId} className="request-table-row">
                  <button
                    className="request-row-button"
                    onClick={() => {
                      setExecutionSourceWalletId(run.sourceWorkspaceAddressId ?? '');
                      onOpenRunDetail?.(run.paymentRunId);
                      if (!onOpenRunDetail) setModalState({ type: 'view-run', paymentRunId: run.paymentRunId });
                    }}
                    type="button"
                  >
                    <span className="request-cell-primary">
                      <strong>{run.runName}</strong>
                      <small>{shortenAddress(run.paymentRunId, 8, 6)}</small>
                    </span>
                    <span className="request-cell-single">{run.totals.orderCount}</span>
                    <span className="request-cell-single">
                      <strong>{formatRawUsdcCompact(run.totals.totalAmountRaw)} USDC</strong>
                    </span>
                    <span className="request-cell-single">
                      {run.totals.readyCount}/{run.totals.orderCount}
                    </span>
                    <span className="request-cell-single">
                      <span className={`tone-pill tone-pill-${getRunTone(run.derivedState)}`}>{formatLabel(run.derivedState)}</span>
                    </span>
                    <span className="request-cell-single">{formatTimestampCompact(run.createdAt)}</span>
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {mode === 'approvals' ? (
          <>
            <section className="content-grid content-grid-single">
              <div className="workspace-pulse-strip workspace-pulse-strip-standalone">
                <div className="workspace-pulse-strip-grid">
                  <Metric label="Pending" value={String(pendingApprovalOrders.length)} />
                  <Metric label="Approved" value={String(approvedCount)} />
                  <Metric label="Rejected" value={String(rejectedCount)} />
                  <Metric label="Escalated" value={String(escalatedCount)} />
                </div>
              </div>
            </section>
            <div className="panel-header surface-panel-header parity-section-gap">
              <div className="surface-panel-copy">
                <h2 className="registry-section-title">
                  Pending approvals <span className="registry-count-inline">[{pendingApprovalOrders.length}]</span>
                </h2>
              </div>
            </div>
            <div className="request-table compact-request-table payment-order-table parity-section-gap">
              <div className="request-table-head">
                <span>Payee</span>
                <span>Destination</span>
                <span>Amount</span>
                <span>Reason</span>
                <span>Age</span>
                <span>Status</span>
              </div>
              {pendingApprovalOrders.length ? pendingApprovalOrders.map((order) => (
                <div className="request-table-row" key={order.paymentOrderId}>
                  <button
                    className="request-row-button"
                    onClick={() => {
                      onOpenPaymentDetail?.(order.paymentOrderId);
                      if (!onOpenPaymentDetail) setModalState({ type: 'view', paymentOrderId: order.paymentOrderId });
                    }}
                    type="button"
                  >
                    <span className="request-cell-primary">
                      <strong>{order.payee?.name ?? order.destination.label}</strong>
                      <small>{shortenAddress(order.paymentOrderId, 8, 6)}</small>
                    </span>
                    <span className="request-cell-single">{order.destination.label}</span>
                    <span className="request-cell-single">{formatRawUsdcCompact(order.amountRaw)} {(order.asset ?? 'USDC').toUpperCase()}</span>
                    <span className="request-cell-single">{order.reconciliationDetail?.approvalEvaluation?.reasons?.[0]?.message ?? 'Policy approval required'}</span>
                    <span className="request-cell-single">{formatRelativeTime(order.createdAt)}</span>
                    <span className="request-cell-single"><span className="tone-pill tone-pill-pending">pending approval</span></span>
                  </button>
                </div>
              )) : <div className="empty-box compact">No approvals waiting.</div>}
            </div>

            <div className="panel-header surface-panel-header parity-section-gap-large">
              <div className="surface-panel-copy">
                <h2 className="registry-section-title">
                  Approval history <span className="registry-count-inline">[{approvalHistoryOrders.length}]</span>
                </h2>
              </div>
            </div>
            <div className="request-table compact-request-table payment-order-table parity-section-gap">
              <div className="request-table-head">
                <span>Payee</span>
                <span>Amount</span>
                <span>Decision</span>
                <span>Actor</span>
                <span>Decision time</span>
                <span>Payment status</span>
              </div>
              {approvalHistoryOrders.length ? approvalHistoryOrders.map((order) => {
                const decisions = (order.reconciliationDetail?.approvalDecisions ?? [])
                  .filter((decision) => ['approve', 'reject', 'escalate'].includes(decision.action))
                  .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
                const latest = decisions[0];
                if (!latest) return null;
                return (
                  <div className="request-table-row" key={order.paymentOrderId}>
                    <button
                      className="request-row-button"
                      onClick={() => {
                        onOpenPaymentDetail?.(order.paymentOrderId);
                        if (!onOpenPaymentDetail) setModalState({ type: 'view', paymentOrderId: order.paymentOrderId });
                      }}
                      type="button"
                    >
                      <span className="request-cell-primary">
                        <strong>{order.payee?.name ?? order.destination.label}</strong>
                        <small>{shortenAddress(order.paymentOrderId, 8, 6)}</small>
                      </span>
                      <span className="request-cell-single">{formatRawUsdcCompact(order.amountRaw)} {(order.asset ?? 'USDC').toUpperCase()}</span>
                      <span className="request-cell-single">{formatLabel(latest.action)}</span>
                      <span className="request-cell-single">{latest.actorUser?.displayName ?? latest.actorUser?.email ?? latest.actorType}</span>
                      <span className="request-cell-single">{formatTimestampCompact(latest.createdAt)}</span>
                      <span className="request-cell-single">{formatLabel(order.derivedState)}</span>
                    </button>
                  </div>
                );
              }) : <div className="empty-box compact">No approval decisions recorded yet.</div>}
            </div>
          </>
          ) : null}

          {mode === 'execution' ? (
          <>
            <section className="content-grid content-grid-single">
              <div className="workspace-pulse-strip workspace-pulse-strip-standalone">
                <div className="workspace-pulse-strip-grid">
                  <Metric label="In queue" value={String(executionQueueOrders.length)} />
                  <Metric label="Ready to sign" value={String(readyToSignCount)} />
                  <Metric label="Executed" value={String(executedCount)} />
                  <Metric label="Needs review" value={String(executionNeedsReviewCount)} />
                </div>
              </div>
            </section>
            <div className="panel-header surface-panel-header parity-section-gap">
              <div className="surface-panel-copy">
                <h2 className="registry-section-title">
                  Execution queue <span className="registry-count-inline">[{executionQueueOrders.length}]</span>
                </h2>
              </div>
            </div>
            <div className="request-table compact-request-table payment-order-table parity-section-gap">
              <div className="request-table-head">
                <span>Payee</span>
                <span>Destination</span>
                <span>Amount</span>
                <span>Why now</span>
                <span>Status</span>
                <span>Open</span>
              </div>
              {executionQueueOrders.length ? executionQueueOrders.map((order) => (
                <div className="request-table-row" key={order.paymentOrderId}>
                  <button
                    className="request-row-button"
                    onClick={() => {
                      onOpenPaymentDetail?.(order.paymentOrderId);
                      if (!onOpenPaymentDetail) setModalState({ type: 'view', paymentOrderId: order.paymentOrderId });
                    }}
                    type="button"
                  >
                    <span className="request-cell-primary">
                      <strong>{order.payee?.name ?? order.destination.label}</strong>
                      <small>{shortenAddress(order.paymentOrderId, 8, 6)}</small>
                    </span>
                    <span className="request-cell-single">{order.destination.label}</span>
                    <span className="request-cell-single">{formatRawUsdcCompact(order.amountRaw)} {(order.asset ?? 'USDC').toUpperCase()}</span>
                    <span className="request-cell-single">{executionReason(order)}</span>
                    <span className="request-cell-single"><span className={`tone-pill tone-pill-${getProgressTone(order.derivedState)}`}>{formatLabel(order.derivedState)}</span></span>
                    <span className="request-cell-single">{executionAction(order)}</span>
                  </button>
                </div>
              )) : <div className="empty-box compact">No payments in execution queue.</div>}
            </div>

            <div className="panel-header surface-panel-header parity-section-gap-large">
              <div className="surface-panel-copy">
                <h2 className="registry-section-title">
                  Recent executed <span className="registry-count-inline">[{executedHistoryOrders.length}]</span>
                </h2>
              </div>
            </div>
            <div className="request-table compact-request-table payment-order-table parity-section-gap">
              <div className="request-table-head">
                <span>Payee</span>
                <span>Destination</span>
                <span>Amount</span>
                <span>Execution signature</span>
                <span>Status</span>
                <span>Open</span>
              </div>
              {executedHistoryOrders.length ? executedHistoryOrders.map((order) => (
                <div className="request-table-row" key={order.paymentOrderId}>
                  <button
                    className="request-row-button"
                    onClick={() => {
                      onOpenPaymentDetail?.(order.paymentOrderId);
                      if (!onOpenPaymentDetail) setModalState({ type: 'view', paymentOrderId: order.paymentOrderId });
                    }}
                    type="button"
                  >
                    <span className="request-cell-primary">
                      <strong>{order.payee?.name ?? order.destination.label}</strong>
                      <small>{shortenAddress(order.paymentOrderId, 8, 6)}</small>
                    </span>
                    <span className="request-cell-single">{order.destination.label}</span>
                    <span className="request-cell-single">{formatRawUsdcCompact(order.amountRaw)} {(order.asset ?? 'USDC').toUpperCase()}</span>
                    <span className="request-cell-single">
                      {order.reconciliationDetail?.latestExecution?.submittedSignature
                        ? shortenAddress(order.reconciliationDetail.latestExecution.submittedSignature, 10, 8)
                        : 'N/A'}
                    </span>
                    <span className="request-cell-single"><span className={`tone-pill tone-pill-${getProgressTone(order.derivedState)}`}>{formatLabel(order.derivedState)}</span></span>
                    <span className="request-cell-single">Open payment</span>
                  </button>
                </div>
              )) : <div className="empty-box compact">No executed payments yet.</div>}
            </div>
          </>
          ) : null}

          {(mode !== 'runs' && mode !== 'approvals' && mode !== 'execution' && mode !== 'payments') ? (
          <div className="request-table compact-request-table payment-order-table">
            <div className="request-table-head">
              <span>Request</span>
              <span>Source</span>
              <span>Destination</span>
              <span>Amount</span>
              <span>Progress</span>
              <span>Created</span>
            </div>
            {visibleWorkItems.length ? (
              visibleWorkItems.map((item) => {
                const order = item.order;
                const request = item.request;
                const row = order?.transferRequestId
                  ? reconciliationByRequestId.get(order.transferRequestId) ?? order.reconciliationDetail
                  : order?.reconciliationDetail ?? null;
                const progress = order
                  ? getPaymentProgress(order, row, getLatestPreparedExecutionPacket(order))
                  : getInputProgress(request);

                return (
                  <div key={item.id} className="request-table-row">
                    <button
                      className="request-row-button"
                      disabled={!order}
                      onClick={() => {
                        if (!order) return;
                        onOpenPaymentDetail?.(order.paymentOrderId);
                        if (!onOpenPaymentDetail) setModalState({ type: 'view', paymentOrderId: order.paymentOrderId });
                      }}
                      title={order ? `${order.paymentOrderId} // ${order.sourceWorkspaceAddress ? getWalletName(order.sourceWorkspaceAddress) : 'source not set'} -> ${order.destination.label}` : request?.reason}
                      type="button"
                    >
                      <span className="request-cell-primary">
                        <strong>{request?.externalReference || request?.reason || (order ? shortenAddress(order.paymentOrderId, 8, 6) : 'request')}</strong>
                        {request ? <small>{shortenAddress(request.paymentRequestId, 8, 6)}</small> : <small>direct order</small>}
                      </span>
                      <span className="request-cell-single">
                        <strong>{order?.sourceWorkspaceAddress ? getWalletName(order.sourceWorkspaceAddress) : 'Not set'}</strong>
                      </span>
                      <span className="request-cell-single">
                        <strong>{order?.destination.label ?? request?.destination.label ?? 'No destination'}</strong>
                      </span>
                      <span className="request-cell-amount request-cell-single">
                        <strong>{formatRawUsdcCompact(order?.amountRaw ?? request?.amountRaw ?? '0')} {(order?.asset ?? request?.asset ?? 'USDC').toUpperCase()}</strong>
                      </span>
                      <span className="request-cell-single">
                        <span className="payment-progress-cell">
                          <span className={`tone-pill tone-pill-${progress.tone}`}>{progress.label}</span>
                          <small>{progress.description}</small>
                        </span>
                      </span>
                      <span className="request-cell-single">{formatTimestampCompact(item.createdAt)}</span>
                    </button>
                  </div>
                );
              })
            ) : paymentRequests.length || paymentOrders.length ? (
              <div className="empty-box compact">No payment requests match the current search.</div>
            ) : (
              <div className="empty-box compact">
                <strong>No payment requests yet.</strong>
                <p>Create the first request after you set up a destination in the address book. Requests become the input object for approval, execution, settlement, and proof.</p>
              </div>
            )}
          </div>
          ) : null}

        </div>
      </section>
      </div>
      ) : null}

      {activeModalState ? (
        <div className={usingRouteDetail ? 'request-detail-page' : 'registry-modal-backdrop'} onClick={usingRouteDetail ? undefined : () => setModalState(null)} role="presentation">
          <div
            className={usingRouteDetail ? 'request-main-panel request-detail-surface' : 'registry-modal request-modal'}
            onClick={(event) => event.stopPropagation()}
            role={usingRouteDetail ? undefined : 'dialog'}
            aria-modal={usingRouteDetail ? undefined : 'true'}
          >
            {activeModalState.type === 'create' ? (
              <>
                <div className="panel-header panel-header-stack">
                  <div>
                    <p className="eyebrow">Payment request</p>
                    <h2>New payment request</h2>
                    <p className="compact-copy">Start with the human reason for paying. The app will create the controlled payment order underneath it.</p>
                  </div>
                  <button className="ghost-button compact-button danger-button" onClick={() => setModalState(null)} type="button">
                    close
                  </button>
                </div>
                <form
                  className="form-stack modal-form-grid"
                  onSubmit={async (event) => {
                    await onCreatePaymentOrder(event);
                    setModalState(null);
                  }}
                >
                  <label className="field">
                    <span>From wallet</span>
                    <select name="sourceWorkspaceAddressId" defaultValue="">
                      <option value="">Optional</option>
                      {addresses.map((address) => (
                        <option key={address.workspaceAddressId} value={address.workspaceAddressId}>
                          {getWalletName(address)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Destination</span>
                    <select
                      name="destinationId"
                      onChange={(event) => setSelectedRequestDestinationId(event.target.value)}
                      value={selectedRequestDestinationId}
                      required
                    >
                      <option value="" disabled>
                        Select destination
                      </option>
                      {destinations.filter((item) => item.isActive).map((destination) => (
                        <option key={destination.destinationId} value={destination.destinationId}>
                          {destination.label} // {destination.trustState}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedRequestDestination ? (
                    <div className="setup-hint-card modal-span-full">
                      <strong>
                        {selectedRequestDestination.label} // {selectedRequestDestination.trustState} // {selectedRequestDestination.isInternal ? 'internal' : 'external'}
                      </strong>
                      <p>{getDestinationTrustCopy(selectedRequestDestination)}</p>
                    </div>
                  ) : (
                    <div className="setup-hint-card modal-span-full">
                      <strong>Before you create payment requests</strong>
                      <p>Use the Address book page to save the wallet and create the destination first.</p>
                    </div>
                  )}
                  <label className="field">
                    <span>Initial flow</span>
                    <select
                      name="submitNow"
                      onChange={(event) => setSubmitNow(event.target.value === 'true')}
                      value={submitNow ? 'true' : 'false'}
                    >
                      <option value="false">save as draft</option>
                      {selectedRequestDestination?.isActive !== false && selectedRequestDestination?.trustState === 'trusted' ? (
                        <option value="true">create and submit into approval</option>
                      ) : null}
                    </select>
                  </label>
                  <label className="field">
                    <span>Amount (raw units)</span>
                    <input name="amountRaw" placeholder="10000 for 0.01 USDC" required />
                    <small className="field-note">USDC uses 6 decimals. Example: 10000 = 0.01 USDC.</small>
                  </label>
                  <label className="field">
                    <span>Reason</span>
                    <input name="reason" placeholder="Pay Fuyo LLC for INV-102" required />
                  </label>
                  <label className="field">
                    <span>Reference</span>
                    <input name="externalReference" placeholder="INV-102, payout batch, grant round" />
                  </label>
                  <label className="field">
                    <span>Invoice number</span>
                    <input name="invoiceNumber" placeholder="Optional" />
                  </label>
                  <label className="field">
                    <span>Due at</span>
                    <input name="dueAt" type="datetime-local" />
                  </label>
                  <label className="field">
                    <span>Source balance snapshot (raw)</span>
                    <input name="sourceBalanceRaw" placeholder="Optional" />
                    <small className="field-note">Optional manual check. If present, the order warns when source funds are below the payment amount.</small>
                  </label>
                  <label className="field">
                    <span>Attachment URL</span>
                    <input name="attachmentUrl" placeholder="Optional invoice or evidence link" />
                  </label>
                  <label className="field modal-span-full">
                    <span>Memo</span>
                    <input name="memo" placeholder="Why this payment exists" />
                  </label>
                  <div className="exception-actions modal-span-full">
                    <button
                      className="primary-button"
                      disabled={
                        !canManage
                        || destinations.length === 0
                        || !selectedRequestDestination
                        || !selectedRequestDestination.isActive
                        || selectedRequestDestination.trustState === 'blocked'
                      }
                      type="submit"
                    >
                      Create payment request
                    </button>
                  </div>
                </form>
              </>
            ) : null}

            {activeModalState.type === 'import-csv' ? (
              <>
                <div className="panel-header panel-header-stack">
                  <div>
                    <p className="eyebrow">Batch input</p>
                    <h2>Import payment requests</h2>
                    <p className="compact-copy">Use CSV when the work starts from a payout sheet. Payees are created or reused by name.</p>
                  </div>
                  <button className="ghost-button compact-button danger-button" onClick={() => setModalState(null)} type="button">
                    close
                  </button>
                </div>
                <form
                  className="form-stack modal-form-grid"
                  onSubmit={async (event) => {
                    setCsvImportMessage(null);
                    const result = await onImportPaymentRequestsCsv(event);
                    if (result.ok) {
                      setModalState(null);
                    } else {
                      setCsvImportMessage(result.message ?? 'Import failed. Fix the CSV rows and retry.');
                    }
                  }}
                >
                  <label className="field">
                    <span>Source wallet</span>
                    <select name="sourceWorkspaceAddressId" defaultValue="">
                      <option value="">Optional</option>
                      {addresses.map((address) => (
                        <option key={address.workspaceAddressId} value={address.workspaceAddressId}>
                          {getWalletName(address)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Initial flow</span>
                    <select name="submitOrderNow" defaultValue="false">
                      <option value="false">import as drafts</option>
                      <option value="true">submit trusted rows immediately</option>
                    </select>
                  </label>
                  <label className="field modal-span-full">
                    <span>CSV</span>
                    <textarea
                      name="csv"
                      rows={10}
                      placeholder={[
                        'payee,destination,amount,reference,due_date',
                        'Fuyo LLC,fuyo wallet,0.01,INV-102,2026-04-15',
                      ].join('\n')}
                      required
                    />
                    <small className="field-note">Destination can be a destination label, destination id, wallet address, or token account.</small>
                  </label>
                  {csvImportMessage ? (
                    <div className="setup-hint-card modal-span-full">
                      <strong>Import needs attention</strong>
                      <p>{csvImportMessage}</p>
                    </div>
                  ) : null}
                  <div className="exception-actions modal-span-full">
                    <button className="primary-button" disabled={!canManage} type="submit">
                      Import payment requests
                    </button>
                  </div>
                </form>
              </>
            ) : null}

            {activeModalState.type === 'view-run' && selectedRun ? (
              <>
                <section className="section-headline section-headline-compact">
                  <div className="section-headline-copy">
                    <p className="eyebrow">Payment Run</p>
                    <h1>{selectedRun.runName}</h1>
                    <p className="section-copy">
                      {selectedRun.totals.orderCount} payment(s) / {formatRawUsdcCompact(selectedRun.totals.totalAmountRaw)} USDC / {formatLabel(selectedRun.derivedState)}
                    </p>
                  </div>
                  <div className="hero-actions">
                    <button className="ghost-button" onClick={() => void onDownloadPaymentRunProof(selectedRun.paymentRunId)} type="button">
                      Export run proof
                    </button>
                    <button className="ghost-button danger-button" disabled={!canManage} onClick={() => void onDeletePaymentRun(selectedRun.paymentRunId)} type="button">
                      Delete run
                    </button>
                    {!['settled', 'closed', 'cancelled', 'proven'].includes(selectedRun.derivedState) ? (
                      <button
                        className="primary-button compact-button"
                        onClick={() => {
                          document.getElementById('run-execution')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        type="button"
                      >
                        Execute payments
                      </button>
                    ) : null}
                    {!usingRouteDetail ? (
                      <button className="ghost-button compact-button danger-button" onClick={closeDetail} type="button">
                        close
                      </button>
                    ) : null}
                  </div>
                </section>

                <RunProgressTracker steps={runWorkflowSteps} />

                {!['settled', 'closed', 'cancelled', 'proven'].includes(selectedRun.derivedState) ? (
                  <div className="registry-detail-group" id="run-execution">
                    <div className="registry-detail-head">
                      <strong>Batch execution</strong>
                    </div>
                    <div className="execution-prepare-panel">
                      <div className="execution-prepare-copy">
                        <strong>{selectedRunPreparedExecution ? 'Batch packet prepared' : 'Prepare one transaction for this run'}</strong>
                        <p>
                          This builds one wallet-signed Solana transaction with multiple USDC transfers. Rows still reconcile independently after settlement.
                        </p>
                      </div>
                      <label className="field">
                        <span>Source wallet</span>
                        <select
                          onChange={(event) => setExecutionSourceWalletId(event.target.value)}
                          value={executionSourceWalletId}
                        >
                          <option value="">Select source wallet</option>
                          {addresses.filter((address) => address.isActive).map((address) => (
                            <option key={address.workspaceAddressId} value={address.workspaceAddressId}>
                              {getWalletName(address)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="primary-button compact-button"
                        disabled={!canManage || !executionSourceWalletId}
                        onClick={async () => {
                          const prepared = await onPreparePaymentRunExecution(selectedRun.paymentRunId, {
                            sourceWorkspaceAddressId: executionSourceWalletId,
                          });
                          if (prepared) {
                            setPreparedExecutionByRunId((current) => ({
                              ...current,
                              [selectedRun.paymentRunId]: prepared.executionPacket,
                            }));
                          }
                        }}
                        type="button"
                      >
                        prepare batch packet
                      </button>
                    </div>

                    {selectedRunPreparedExecution ? (
                      <div className="execution-packet-card">
                        <InfoLine label="From" value={`${shortenAddress(selectedRunPreparedExecution.source.walletAddress, 6, 6)} // ${shortenAddress(selectedRunPreparedExecution.source.tokenAccountAddress, 6, 6)}`} />
                        <InfoLine label="Transfers" value={String(selectedRunPreparedExecution.transfers?.length ?? 0)} />
                        <InfoLine label="Total" value={`${formatRawUsdcCompact(selectedRunPreparedExecution.amountRaw)} ${selectedRunPreparedExecution.token.symbol}`} />
                        <InfoLine label="Instructions" value={`${selectedRunPreparedExecution.instructions.length} Solana instruction(s)`} />
                        <InfoLine label="Required signer" value={shortenAddress(selectedRunPreparedExecution.signerWallet, 6, 6)} />
                        <label className="field modal-span-full">
                          <span>Browser wallet</span>
                          <select
                            onChange={(event) => {
                              setSelectedBrowserWalletId(event.target.value);
                              setWalletSigningState(null);
                            }}
                            value={selectedBrowserWalletId}
                          >
                            <option value="">Select wallet to sign</option>
                            {browserWallets.map((wallet) => (
                              <option key={wallet.id} value={wallet.id} disabled={!wallet.ready}>
                                {formatBrowserWalletOption(wallet)}
                              </option>
                            ))}
                          </select>
                          <small className="field-note">
                            Required signer: {shortenAddress(selectedRunPreparedExecution.signerWallet, 6, 6)}.
                          </small>
                        </label>
                        {walletSigningState ? (
                          <div className="registry-detail-box modal-span-full">
                            <strong>
                              {walletSigningState.status === 'signing'
                                ? 'Waiting for wallet'
                                : walletSigningState.status === 'success'
                                  ? 'Batch transaction submitted'
                                  : 'Wallet signing failed'}
                            </strong>
                            <small>{walletSigningState.message}</small>
                          </div>
                        ) : null}
                        <button
                          className="primary-button compact-button modal-span-full"
                          disabled={!canManage || !selectedBrowserWalletId || walletSigningState?.status === 'signing'}
                          onClick={async () => {
                            setWalletSigningState({
                              status: 'signing',
                              message: 'Approve the batch transaction in the selected browser wallet.',
                            });
                            try {
                              const signature = await onSignPreparedPaymentRun(
                                selectedRun.paymentRunId,
                                selectedRunPreparedExecution,
                                selectedBrowserWalletId,
                              );
                              if (!signature) {
                                setWalletSigningState({
                                  status: 'error',
                                  message: 'The wallet flow finished without returning a transaction signature.',
                                });
                                return;
                              }
                              setWalletSigningState({
                                status: 'success',
                                message: `Submitted ${shortenAddress(signature, 8, 8)}. Each row is now watching for settlement under the same signature.`,
                              });
                            } catch (error) {
                              setWalletSigningState({
                                status: 'error',
                                message: error instanceof Error ? error.message : 'Failed to sign and submit payment run.',
                              });
                            }
                          }}
                          type="button"
                        >
                          {walletSigningState?.status === 'signing' ? 'waiting for wallet...' : 'sign and submit batch'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="request-table compact-request-table payment-order-table">
                  <div className="request-table-head">
                    <span>Payee</span>
                    <span>Amount</span>
                    <span>Source</span>
                    <span>Destination</span>
                    <span>Reference</span>
                    <span>Due</span>
                    <span>Status</span>
                    <span>Export Proof</span>
                  </div>
                  {runOrders.map((order) => (
                    <div key={order.paymentOrderId} className="request-table-row">
                      <div
                        className="request-row-button"
                        onClick={() => {
                          onOpenPaymentDetail?.(order.paymentOrderId);
                          if (!onOpenPaymentDetail) setModalState({ type: 'view', paymentOrderId: order.paymentOrderId });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onOpenPaymentDetail?.(order.paymentOrderId);
                            if (!onOpenPaymentDetail) setModalState({ type: 'view', paymentOrderId: order.paymentOrderId });
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <span className="request-cell-primary">
                          <strong>{order.payee?.name ?? shortenAddress(order.paymentOrderId, 8, 6)}</strong>
                          <small>{shortenAddress(order.paymentOrderId, 8, 6)}</small>
                        </span>
                        <span className="request-cell-single">{formatRawUsdcCompact(order.amountRaw)} {order.asset.toUpperCase()}</span>
                        <span className="request-cell-single">
                          {order.sourceWorkspaceAddress ? getWalletName(order.sourceWorkspaceAddress) : 'N/A'}
                        </span>
                        <span className="request-cell-single">{order.destination.label}</span>
                        <span className="request-cell-single">{order.externalReference ?? order.invoiceNumber ?? '-'}</span>
                        <span className="request-cell-single">{order.dueAt ? formatTimestampCompact(order.dueAt) : '-'}</span>
                        <span className="request-cell-single">
                          <span className={`tone-pill tone-pill-${getProgressTone(order.derivedState)}`}>
                            {formatLabel(order.derivedState)}
                          </span>
                        </span>
                        <span className="request-cell-single">
                          <button
                            className="ghost-button compact-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void onDownloadPaymentOrderProof(order.paymentOrderId);
                            }}
                            type="button"
                          >
                            Export
                          </button>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="registry-detail-group">
                  <div className="registry-detail-head">
                    <strong>Lifecycle details</strong>
                  </div>
                  <div className="vertical-timeline">
                    {runWorkflowSteps.map((step) => {
                      const stageKey = step.label.startsWith('Import')
                        ? 'imported'
                        : step.label.startsWith('Review')
                          ? 'reviewed'
                          : step.label.startsWith('Approve')
                            ? 'approved'
                            : step.label.startsWith('Execute') || step.label.startsWith('Executed')
                              ? 'submitted'
                              : step.label.startsWith('Settle') || step.label.startsWith('Settled')
                                ? 'settled'
                                : 'proven';
                      return (
                        <article className={`vertical-timeline-item vertical-timeline-item-${step.state}`} key={step.label}>
                          <span className="vertical-timeline-marker" />
                          <div className="vertical-timeline-content">
                            <div className="vertical-timeline-title-row">
                              <strong>{step.label}</strong>
                              <button
                                className="timeline-inline-toggle"
                                onClick={() => {
                                  setExpandedRunLifecycleStages((s) => ({ ...s, [stageKey]: !s[stageKey] }));
                                }}
                                type="button"
                                aria-label={expandedRunLifecycleStages[stageKey] ? `Collapse ${step.label} details` : `Expand ${step.label} details`}
                              >
                                {expandedRunLifecycleStages[stageKey] ? '▾' : '▸'}
                              </button>
                            </div>
                            <p>{step.subtext}</p>
                            {step.label === 'Imported' && expandedRunLifecycleStages.imported ? (
                              <CompactStageEvents
                                items={[
                                  {
                                    title: 'Run created',
                                    body: `Imported ${selectedRun.totals.orderCount} row(s) into ${selectedRun.runName}.`,
                                    time: selectedRun.createdAt,
                                  },
                                ]}
                              />
                            ) : null}
                            {(step.label === 'Approved' || step.label === 'Approve') && expandedRunLifecycleStages.approved ? (
                              resolvedApprovalEvents.length ? (
                                <CompactStageEvents
                                  items={resolvedApprovalEvents.map(({ order, decision }) => ({
                                    title: `${decision.action.replaceAll('_', ' ')} · ${order.payee?.name ?? order.destination.label}`,
                                    body: `${decision.actorUser?.email ?? decision.actorType} · ${order.externalReference ?? order.invoiceNumber ?? 'No reference'}`,
                                    time: decision.createdAt,
                                  }))}
                                />
                              ) : <p>No resolved approval decisions yet.</p>
                            ) : null}
                            {(step.label === 'Execute' || step.label === 'Executed') && expandedRunLifecycleStages.submitted ? (
                              submissionEvents.length ? (
                                <CompactStageEvents
                                  items={submissionEvents.map((event) => ({
                                    title: `${event.order.payee?.name ?? event.order.destination.label}`,
                                    body: `Signature ${shortenAddress(event.signature, 10, 8)}`,
                                    time: event.submittedAt,
                                  }))}
                                />
                              ) : <p>No signatures executed yet.</p>
                            ) : null}
                            {(step.label === 'Settle' || step.label === 'Settled') && expandedRunLifecycleStages.settled ? (
                              settlementEvents.length ? (
                                <CompactStageEvents
                                  items={settlementEvents.map((event) => ({
                                    title: `${event.order.payee?.name ?? event.order.destination.label}`,
                                    body: event.matchStatus.replaceAll('_', ' '),
                                    time: event.matchedAt,
                                  }))}
                                />
                              ) : <p>No settlement matches yet.</p>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}

            {activeModalState.type === 'view' && selectedOrder ? (
              <>
                <section className="section-headline section-headline-compact">
                  <div className="section-headline-copy">
                    <p className="eyebrow">Payment</p>
                    <h1>{selectedOrder.payee?.name ?? selectedOrder.destination.label}</h1>
                    <p className="section-copy">
                      {formatRawUsdcCompact(selectedOrder.amountRaw)} {(selectedOrder.asset ?? 'USDC').toUpperCase()} / {selectedOrder.externalReference ?? selectedOrder.invoiceNumber ?? 'No reference'}
                    </p>
                  </div>
                  <div className="hero-actions">
                    <button className="ghost-button" onClick={() => void onDownloadPaymentOrderProof(selectedOrder.paymentOrderId)} type="button">
                      Export proof
                    </button>
                    <button className="ghost-button" onClick={() => void onDownloadPaymentOrderAuditExport(selectedOrder.paymentOrderId)} type="button">
                      Audit CSV
                    </button>
                    {selectedOrder.derivedState === 'draft' ? (
                      <button className="ghost-button" disabled={!canManage} onClick={() => void onSubmitPaymentOrder(selectedOrder.paymentOrderId)} type="button">
                        Submit for approval
                      </button>
                    ) : null}
                    {selectedOrder.derivedState !== 'settled' && selectedOrder.derivedState !== 'closed' && selectedOrder.derivedState !== 'cancelled' ? (
                      <button className="ghost-button danger-button" disabled={!canManage} onClick={() => void onCancelPaymentOrder(selectedOrder.paymentOrderId)} type="button">
                        Delete payment
                      </button>
                    ) : null}
                    {!usingRouteDetail ? (
                      <button className="primary-button" onClick={closeDetail} type="button">
                        close
                      </button>
                    ) : null}
                  </div>
                </section>

                <RunProgressTracker steps={buildWorkflow(selectedOrder)} />
                <div className="registry-detail-group">
                  <div className="registry-detail-head">
                    <strong>Payment snapshot</strong>
                  </div>
                  <div className="payment-snapshot-grid">
                    <div className="payment-snapshot-card">
                      <small>Amount</small>
                      <strong>{formatRawUsdcCompact(selectedOrder.amountRaw)} {(selectedOrder.asset ?? 'USDC').toUpperCase()}</strong>
                    </div>
                    <div className="payment-snapshot-card">
                      <small>From</small>
                      <strong>{selectedOrder.sourceWorkspaceAddress?.address ? shortenAddress(selectedOrder.sourceWorkspaceAddress.address, 6, 6) : 'Source not set'}</strong>
                    </div>
                    <div className="payment-snapshot-card">
                      <small>To</small>
                      <strong>{selectedOrder.destination?.walletAddress ? shortenAddress(selectedOrder.destination.walletAddress, 6, 6) : 'Destination unavailable'}</strong>
                    </div>
                    <div className="payment-snapshot-card">
                      <small>Signature</small>
                      <strong>{selectedRequestRow?.latestExecution?.submittedSignature ? shortenAddress(selectedRequestRow.latestExecution.submittedSignature, 6, 6) : 'Not executed'}</strong>
                    </div>
                    <div className="payment-snapshot-card">
                      <small>Time label</small>
                      <strong>{selectedRequestRow?.latestExecution?.submittedSignature ? 'Executed' : 'Created'}</strong>
                    </div>
                    <div className="payment-snapshot-card">
                      <small>Time</small>
                      <strong>{formatRelativeTime(selectedRequestRow?.latestExecution?.submittedAt ?? selectedOrder.createdAt)}</strong>
                    </div>
                  </div>
                </div>


                {!['settled', 'closed', 'cancelled', 'proven'].includes(selectedOrder.derivedState) ? (
                  <div className="registry-detail-group">
                    <div className="registry-detail-head">
                      <strong>Prepare payment</strong>
                    </div>
                    <div className="execution-prepare-panel">
                      <div className="execution-prepare-copy">
                        <strong>{selectedOrderPreparedExecution ? 'Payment packet prepared' : 'Generate the exact USDC transfer packet'}</strong>
                        <p>
                          This creates a non-custodial Solana instruction packet. Your browser wallet signs locally; the API never receives private keys.
                        </p>
                      </div>
                      <label className="field">
                        <span>Source wallet for execution</span>
                        <select
                          onChange={(event) => setExecutionSourceWalletId(event.target.value)}
                          value={executionSourceWalletId}
                        >
                          <option value="">Select source wallet</option>
                          {addresses.filter((address) => address.isActive).map((address) => (
                            <option key={address.workspaceAddressId} value={address.workspaceAddressId}>
                              {getWalletName(address)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="primary-button compact-button"
                        disabled={!canManage || !executionSourceWalletId}
                        onClick={async () => {
                          const prepared = await onPreparePaymentOrderExecution(selectedOrder.paymentOrderId, {
                            sourceWorkspaceAddressId: executionSourceWalletId,
                          });
                          if (prepared) {
                            setPreparedExecutionByOrderId((current) => ({
                              ...current,
                              [selectedOrder.paymentOrderId]: prepared.executionPacket,
                            }));
                          }
                        }}
                        type="button"
                      >
                        prepare payment packet
                      </button>
                    </div>

                    {selectedOrderPreparedExecution ? (
                      <div className="execution-packet-card">
                        <InfoLine label="From" value={`${shortenAddress(selectedOrderPreparedExecution.source.walletAddress, 6, 6)} // ${shortenAddress(selectedOrderPreparedExecution.source.tokenAccountAddress, 6, 6)}`} />
                        <InfoLine label="To" value={selectedOrderPreparedExecution.destination ? `${shortenAddress(selectedOrderPreparedExecution.destination.walletAddress, 6, 6)} // ${shortenAddress(selectedOrderPreparedExecution.destination.tokenAccountAddress, 6, 6)}` : 'Batch destinations'} />
                        <InfoLine label="Amount" value={`${formatRawUsdcCompact(selectedOrderPreparedExecution.amountRaw)} ${selectedOrderPreparedExecution.token.symbol}`} />
                        <InfoLine label="Instructions" value={`${selectedOrderPreparedExecution.instructions.length} Solana instruction(s)`} />
                        <InfoLine label="Required signer" value={shortenAddress(selectedOrderPreparedExecution.signerWallet, 6, 6)} />
                        <div className="registry-detail-box">
                          <strong>Execution packet</strong>
                          <small>{selectedOrderPreparedExecution.signing.note}</small>
                        </div>
                        <label className="field modal-span-full">
                          <span>Browser wallet</span>
                          <select
                            onChange={(event) => {
                              setSelectedBrowserWalletId(event.target.value);
                              setWalletSigningState(null);
                            }}
                            value={selectedBrowserWalletId}
                          >
                            <option value="">Select wallet to sign</option>
                            {browserWallets.map((wallet) => (
                              <option key={wallet.id} value={wallet.id} disabled={!wallet.ready}>
                                {formatBrowserWalletOption(wallet)}
                              </option>
                            ))}
                          </select>
                          <small className="field-note">
                            Required signer: {shortenAddress(selectedOrderPreparedExecution.signerWallet, 6, 6)}. The backend never receives private keys.
                          </small>
                        </label>
                        {!browserWallets.length ? (
                          <div className="registry-detail-box modal-span-full">
                            <strong>No browser wallets detected</strong>
                            <small>Unlock Phantom, Solflare, Backpack, or another Solana wallet, then refresh wallets.</small>
                          </div>
                        ) : null}
                        {walletSigningState ? (
                          <div className="registry-detail-box modal-span-full">
                            <strong>
                              {walletSigningState.status === 'signing'
                                ? 'Waiting for wallet'
                                : walletSigningState.status === 'success'
                                  ? 'Transaction submitted'
                                  : 'Wallet signing failed'}
                            </strong>
                            <small>{walletSigningState.message}</small>
                          </div>
                        ) : null}
                        <div className="exception-actions modal-span-full">
                          <button
                            className="ghost-button compact-button"
                            onClick={() => {
                              setBrowserWallets(discoverSolanaWallets());
                              setWalletSigningState(null);
                            }}
                            type="button"
                          >
                            refresh wallets
                          </button>
                        </div>
                        <button
                          className="primary-button compact-button modal-span-full"
                          disabled={!canManage || !selectedBrowserWalletId || walletSigningState?.status === 'signing'}
                          onClick={async () => {
                            setWalletSigningState({
                              status: 'signing',
                              message: 'Approve the transaction in the selected browser wallet.',
                            });
                            try {
                              const signature = await onSignPreparedPaymentOrder(
                                selectedOrder.paymentOrderId,
                                selectedOrderPreparedExecution,
                                selectedBrowserWalletId,
                              );
                              if (!signature) {
                                setWalletSigningState({
                                  status: 'error',
                                  message: 'The wallet flow finished without returning a transaction signature.',
                                });
                                return;
                              }
                              setWalletSigningState({
                                status: 'success',
                                message: `Submitted ${shortenAddress(signature, 8, 8)}. The system is now watching for settlement.`,
                              });
                            } catch (error) {
                              setWalletSigningState({
                                status: 'error',
                                message: error instanceof Error ? error.message : 'Failed to sign and submit payment.',
                              });
                            }
                          }}
                          type="button"
                        >
                          {walletSigningState?.status === 'signing' ? 'waiting for wallet...' : 'sign and submit with source wallet'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {selectedOrder.transferRequestId && selectedOrder.derivedState !== 'settled' ? (
                  <div className="registry-detail-group">
                    <div className="registry-detail-head">
                      <strong>External execution evidence</strong>
                    </div>
                    <div className="execution-handoff-grid">
                      <form className="form-stack" onSubmit={(event) => onCreatePaymentOrderExecution(selectedOrder.paymentOrderId, event)}>
                        <label className="field">
                          <span>Execution source</span>
                          <select name="executionSource" defaultValue="manual_signature">
                            <option value="manual_signature">manual signature</option>
                            <option value="squads_proposal">Squads proposal</option>
                            <option value="external_wallet">external wallet</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>External reference</span>
                          <input name="externalReference" placeholder="Optional proposal or send reference" />
                        </label>
                        <button className="primary-button compact-button" disabled={!canManage} type="submit">record execution handoff</button>
                      </form>
                      <form className="form-stack" onSubmit={(event) => onAttachPaymentOrderSignature(selectedOrder.paymentOrderId, event)}>
                        <label className="field">
                          <span>Submitted signature</span>
                          <input name="submittedSignature" placeholder="Solana transaction signature" />
                        </label>
                        <label className="field">
                          <span>External reference</span>
                          <input name="externalReference" placeholder="Optional if signature is not known yet" />
                        </label>
                        <button className="primary-button compact-button" disabled={!canManage} type="submit">attach execution evidence</button>
                      </form>
                    </div>
                  </div>
                ) : null}

                <div className="registry-detail-group">
                  <div className="registry-detail-head">
                    <strong>Lifecycle details</strong>
                  </div>
                  <div className="vertical-timeline">
                    {(() => {
                      const stageState = paymentTimelineStates(selectedOrder.derivedState);
                      const approvalDecisions = selectedOrder.reconciliationDetail?.approvalDecisions ?? [];
                      const exceptions = selectedOrder.reconciliationDetail?.exceptions ?? [];
                      const latestExecution = selectedOrder.reconciliationDetail?.latestExecution ?? null;
                      const match = selectedOrder.reconciliationDetail?.match ?? null;
                      const proofReady = selectedOrder.derivedState === 'settled' || selectedOrder.derivedState === 'closed';
                      return (
                        <>
                          <article className={`vertical-timeline-item vertical-timeline-item-${stageState.request}`}>
                            <span className="vertical-timeline-marker" />
                            <div className="vertical-timeline-content">
                              <strong>Request</strong>
                              <p>Created by {selectedOrder.createdByUser?.email ?? 'System'} at {formatTimestampCompact(selectedOrder.createdAt)}.</p>
                            </div>
                          </article>
                          <article className={`vertical-timeline-item vertical-timeline-item-${stageState.approval}`}>
                            <span className="vertical-timeline-marker" />
                            <div className="vertical-timeline-content">
                              <div className="vertical-timeline-title-row">
                                <strong>Approval</strong>
                                {approvalDecisions.length ? (
                                  <button
                                    className="timeline-inline-toggle"
                                    onClick={() => setExpandedTimelineStages((s) => ({ ...s, approval: !s.approval }))}
                                    type="button"
                                    aria-label={expandedTimelineStages.approval ? 'Collapse approval details' : 'Expand approval details'}
                                  >
                                    {expandedTimelineStages.approval ? '▾' : '▸'}
                                  </button>
                                ) : null}
                              </div>
                              <p>{latestDecision ? `${latestDecision.action.replaceAll('_', ' ')} by ${latestDecision.actorUser?.email ?? latestDecision.actorType}` : 'No approval decision recorded yet.'}</p>
                              {approvalDecisions.length && expandedTimelineStages.approval ? (
                                <CompactStageEvents
                                  items={approvalDecisions.map((decision) => ({
                                    title: decision.action.replaceAll('_', ' '),
                                    body: decision.comment ?? 'Policy decision recorded.',
                                    time: decision.createdAt,
                                  }))}
                                />
                              ) : null}
                            </div>
                          </article>
                          <article className={`vertical-timeline-item vertical-timeline-item-${stageState.execution}`}>
                            <span className="vertical-timeline-marker" />
                            <div className="vertical-timeline-content">
                              <strong>Execution</strong>
                              <p>{latestExecution?.submittedSignature ? `Executed on-chain with ${shortenAddress(latestExecution.submittedSignature)}.` : 'Not executed on-chain yet.'}</p>
                            </div>
                          </article>
                          <article className={`vertical-timeline-item vertical-timeline-item-${stageState.settlement}`}>
                            <span className="vertical-timeline-marker" />
                            <div className="vertical-timeline-content">
                              <div className="vertical-timeline-title-row">
                                <strong>Settlement</strong>
                                {exceptions.length ? (
                                  <button
                                    className="timeline-inline-toggle"
                                    onClick={() => setExpandedTimelineStages((s) => ({ ...s, settlement: !s.settlement }))}
                                    type="button"
                                    aria-label={expandedTimelineStages.settlement ? 'Collapse settlement details' : 'Expand settlement details'}
                                  >
                                    {expandedTimelineStages.settlement ? '▾' : '▸'}
                                  </button>
                                ) : null}
                              </div>
                              <p>{match ? `${match.matchStatus.replaceAll('_', ' ')} at ${formatTimestampCompact(match.matchedAt ?? selectedOrder.updatedAt)}.` : 'Waiting for chain match and reconciliation.'}</p>
                              {exceptions.length && expandedTimelineStages.settlement ? (
                                <CompactStageEvents
                                  items={exceptions.map((exception) => ({
                                    title: `${exception.severity} / ${exception.status}`,
                                    body: exception.explanation,
                                    time: exception.createdAt,
                                  }))}
                                />
                              ) : null}
                            </div>
                          </article>
                          <article className={`vertical-timeline-item vertical-timeline-item-${stageState.proof}`}>
                            <span className="vertical-timeline-marker" />
                            <div className="vertical-timeline-content">
                              <strong>Proof</strong>
                              <p>{proofReady ? 'Proof is ready for export.' : 'Proof becomes complete after settlement.'}</p>
                            </div>
                          </article>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceExceptionsPage({
  currentWorkspace,
  exceptions,
  members,
  reconciliationRows,
  onApplyExceptionAction,
  onAddExceptionNote,
  onUpdateExceptionMetadata,
  onDownloadExceptionsExport,
}: {
  currentWorkspace: Workspace;
  exceptions: ExceptionItem[];
  members: WorkspaceMember[];
  reconciliationRows: ReconciliationRow[];
  onApplyExceptionAction: (
    exceptionId: string,
    action: 'reviewed' | 'expected' | 'dismissed' | 'reopen',
    transferRequestId?: string | null,
    note?: string,
  ) => Promise<void>;
  onAddExceptionNote: (exceptionId: string, body: string, transferRequestId?: string | null) => Promise<void>;
  onUpdateExceptionMetadata: (
    exceptionId: string,
    input: {
      assignedToUserId?: string | null;
      resolutionCode?: string | null;
      severity?: 'info' | 'warning' | 'critical' | null;
      note?: string;
    },
    transferRequestId?: string | null,
  ) => Promise<void>;
  onDownloadExceptionsExport: () => Promise<void>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'reviewed' | 'expected' | 'dismissed' | 'reopened'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'info' | 'warning' | 'critical'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<'all' | 'unassigned' | string>('all');
  const [selectedExceptionId, setSelectedExceptionId] = useState<string | null>(null);

  const reconciliationById = new Map(reconciliationRows.map((row) => [row.transferRequestId, row] as const));
  const selectedException = exceptions.find((item) => item.exceptionId === selectedExceptionId) ?? null;
  const selectedLinkedRequest = selectedException?.transferRequestId
    ? reconciliationById.get(selectedException.transferRequestId) ?? null
    : null;

  const filteredExceptions = exceptions.filter((item) => {
    const linkedRequest = item.transferRequestId
      ? reconciliationById.get(item.transferRequestId) ?? null
      : null;
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (severityFilter !== 'all' && item.severity !== severityFilter) return false;
    if (assigneeFilter === 'unassigned' && item.assignedToUserId) return false;
    if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && item.assignedToUserId !== assigneeFilter) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.trim().toLowerCase();
    return [
      getExceptionReasonLabel(item.reasonCode),
      item.explanation,
      item.status,
      item.severity,
      item.assignedToUser?.displayName ?? '',
      item.assignedToUser?.email ?? '',
      linkedRequest?.destination?.label ?? '',
    ].join(' ').toLowerCase().includes(query);
  });

  return (
    <div className="page-stack page-stack-tight">
      <section className="section-headline section-headline-compact">
        <div className="section-headline-copy">
          <p className="eyebrow">Exceptions</p>
          <h1>{currentWorkspace.workspaceName}</h1>
          <p className="section-copy">Work the exception queue, assign ownership, capture resolution, and keep the reconciliation loop moving.</p>
        </div>
      </section>

      <section className="request-shell">
        <div className="content-panel content-panel-strong request-main-panel">
          <TableSurfaceHeader
            actionLabel="Export exceptions"
            count={exceptions.length}
            onAction={() => void onDownloadExceptionsExport()}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Search reason, assignee, explanation, or status"
            searchValue={searchQuery}
            title="Exception queue"
          />

          <div className="filter-row filter-row-compact">
            <label className="queue-select">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option value="all">all statuses</option>
                <option value="open">open</option>
                <option value="reviewed">reviewed</option>
                <option value="expected">expected</option>
                <option value="dismissed">dismissed</option>
                <option value="reopened">reopened</option>
              </select>
            </label>
            <label className="queue-select">
              <span>Severity</span>
              <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as typeof severityFilter)}>
                <option value="all">all severities</option>
                <option value="info">info</option>
                <option value="warning">warning</option>
                <option value="critical">critical</option>
              </select>
            </label>
            <label className="queue-select">
              <span>Assignee</span>
              <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
                <option value="all">all owners</option>
                <option value="unassigned">unassigned</option>
                {members.map((member) => (
                  <option key={member.user.userId} value={member.user.userId}>
                    {member.user.displayName || member.user.email}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="request-table compact-request-table exception-queue-table">
            <div className="request-table-head">
              <span>Reason</span>
              <span>Severity</span>
              <span>Status</span>
              <span>Assignee</span>
              <span>Request</span>
              <span>Updated</span>
            </div>
            {filteredExceptions.length ? (
              filteredExceptions.map((item) => {
                const linkedRequest = item.transferRequestId
                  ? reconciliationById.get(item.transferRequestId) ?? null
                  : null;
                return (
                  <div key={item.exceptionId} className="request-table-row">
                    <button
                      className="request-row-button"
                      onClick={() => setSelectedExceptionId(item.exceptionId)}
                      type="button"
                    >
                      <span className="request-cell-single"><strong>{getExceptionReasonLabel(item.reasonCode)}</strong></span>
                      <span className="request-cell-single"><span className={`tone-pill tone-pill-${mapExceptionSeverityTone(item.severity)}`}>{item.severity}</span></span>
                      <span className="request-cell-single"><span className={`tone-pill tone-pill-${mapExceptionStatusTone(item.status)}`}>{formatLabel(item.status)}</span></span>
                      <span className="request-cell-single">{item.assignedToUser?.displayName || item.assignedToUser?.email || 'unassigned'}</span>
                      <span className="request-cell-single">{linkedRequest ? shortenAddress(linkedRequest.transferRequestId, 8, 6) : 'unlinked'}</span>
                      <span className="request-cell-single">{formatTimestampCompact(item.updatedAt)}</span>
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="empty-box compact">No exceptions match the current filters.</div>
            )}
          </div>
        </div>
      </section>

      {selectedException ? (
        <div className="registry-modal-backdrop" onClick={() => setSelectedExceptionId(null)} role="presentation">
          <div className="registry-modal request-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="registry-modal-hero request-modal-hero">
              <div className="registry-modal-hero-copy">
                <h2>{getExceptionReasonLabel(selectedException.reasonCode)}</h2>
                <span className={`tone-pill tone-pill-${mapExceptionSeverityTone(selectedException.severity)}`}>{selectedException.severity}</span>
              </div>
              <button className="ghost-button compact-button danger-button" onClick={() => setSelectedExceptionId(null)} type="button">
                close
              </button>
            </div>

            <div className="info-grid-tight">
              <InfoLine label="Status" value={formatLabel(selectedException.status)} />
              <InfoLine label="Resolution" value={selectedException.resolutionCode ?? 'none'} />
              <InfoLine label="Assignee" value={selectedException.assignedToUser?.displayName || selectedException.assignedToUser?.email || 'unassigned'} />
              <InfoLine label="Updated" value={formatTimestamp(selectedException.updatedAt)} />
            </div>

            <div className="registry-detail-group">
              <div className="registry-detail-head">
                <strong>Exception detail</strong>
              </div>
              <div className="registry-detail-box">
                <p>{selectedException.explanation}</p>
              </div>
            </div>

            {selectedLinkedRequest ? (
              <div className="registry-detail-group">
                <div className="registry-detail-head">
                  <strong>Linked request</strong>
                </div>
                <div className="registry-detail-box">
                  <strong>{getDestinationLabel(selectedLinkedRequest.destination, selectedLinkedRequest.destinationWorkspaceAddress)}</strong>
                      <small>
                    {formatRawUsdc(selectedLinkedRequest.amountRaw)} USDC // {getApprovalStateLabel(selectedLinkedRequest.approvalState)} // {getDisplayStateLabel(selectedLinkedRequest)}
                      </small>
                </div>
              </div>
            ) : null}

            <form
              className="form-stack modal-form-grid"
              onSubmit={(event) =>
                void handleMetadataSubmit(event, async (input) => {
                  await onUpdateExceptionMetadata(
                    selectedException.exceptionId,
                    input,
                    selectedException.transferRequestId,
                  );
                  setSelectedExceptionId(null);
                })
              }
            >
              <label className="field">
                <span>Assignee</span>
                <select name="assignedToUserId" defaultValue={selectedException.assignedToUserId ?? ''}>
                  <option value="">unassigned</option>
                  {members.map((member) => (
                    <option key={member.user.userId} value={member.user.userId}>
                      {member.user.displayName || member.user.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Severity</span>
                <select name="severity" defaultValue={selectedException.severity}>
                  <option value="info">info</option>
                  <option value="warning">warning</option>
                  <option value="critical">critical</option>
                </select>
              </label>
              <label className="field">
                <span>Resolution code</span>
                <input defaultValue={selectedException.resolutionCode ?? ''} name="resolutionCode" placeholder="vendor_confirmed, false_positive..." />
              </label>
              <label className="field modal-span-full">
                <span>Operator note</span>
                <textarea name="note" placeholder="Capture what changed and why." rows={3} />
              </label>
              <div className="exception-actions modal-span-full">
                <button className="primary-button" type="submit">Save exception metadata</button>
              </div>
            </form>

            {selectedException.availableActions?.length ? (
              <div className="detail-section">
                <div className="detail-section-head">
                  <strong>Resolve or reopen</strong>
                </div>
                <div className="exception-actions">
                  {selectedException.availableActions.map((action) => (
                    <button
                      key={action}
                      className="ghost-button compact-button"
                      onClick={() => void onApplyExceptionAction(selectedException.exceptionId, action, selectedException.transferRequestId)}
                      type="button"
                    >
                      {getExceptionActionLabel(action)}
                    </button>
                  ))}
                </div>
                <p className="compact-copy">
                  Use <strong>Dismiss</strong> when the exception is resolved or no longer needs attention.
                  Use <strong>Expected</strong> when the condition is unusual but acceptable. Use <strong>Reviewed</strong> to mark triage without closing it.
                </p>
              </div>
            ) : null}

            <div className="detail-section">
              <div className="detail-section-head">
                <strong>Notes</strong>
                <span>{selectedException.notes?.length ?? 0}</span>
              </div>
              <div className="stack-list">
                {selectedException.notes?.length ? (
                  selectedException.notes.map((note) => (
                    <div key={note.exceptionNoteId} className="note-card">
                      <strong>{note.authorUser?.displayName || note.authorUser?.email || 'Operator'}</strong>
                      <small>{formatTimestamp(note.createdAt)}</small>
                      <p>{note.body}</p>
                    </div>
                  ))
                ) : (
                  <div className="empty-box compact">No notes yet.</div>
                )}
                <form
                  className="inline-note-form"
                  onSubmit={(event) =>
                    void handleNoteSubmit(event, (body) =>
                      onAddExceptionNote(selectedException.exceptionId, body, selectedException.transferRequestId),
                    )
                  }
                >
                  <label className="field">
                    <span>Add note</span>
                    <textarea name="body" placeholder="Explain the exception handling decision." rows={3} />
                  </label>
                  <button className="ghost-button compact-button" type="submit">save note</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceSettlementPage({
  currentWorkspace,
  reconciliationRows,
  observedTransfers,
  exceptions,
}: {
  currentWorkspace: Workspace;
  reconciliationRows: ReconciliationRow[];
  observedTransfers: ObservedTransfer[];
  exceptions: ExceptionItem[];
}) {
  const [tab, setTab] = useState<'reconciliation' | 'raw'>('reconciliation');
  const matchedCount = reconciliationRows.filter((row) => row.requestDisplayState === 'matched').length;
  const rejectedCount = reconciliationRows.filter((row) => row.approvalState === 'rejected' || row.executionState === 'rejected').length;
  const pendingCount = reconciliationRows.filter((row) => row.requestDisplayState === 'pending' && row.approvalState !== 'rejected' && row.executionState !== 'rejected').length;
  const openExceptions = exceptions.filter((item) => item.status !== 'dismissed').length;

  return (
    <div className="page-stack page-stack-tight">
      <section className="section-headline section-headline-compact">
        <div className="section-headline-copy">
          <p className="eyebrow">Settlement</p>
          <h1>Settlement and reconciliation</h1>
          <p className="section-copy">Payment-centric chain truth first; use observed movement for raw USDC debugging.</p>
        </div>
      </section>

      <section className="content-grid content-grid-single">
        <div className="workspace-pulse-strip workspace-pulse-strip-standalone">
          <div className="workspace-pulse-strip-grid">
            <Metric label="Rows tracked" value={String(reconciliationRows.length)} />
            <Metric label="Matched" value={String(matchedCount)} />
            <Metric label="Pending" value={String(pendingCount)} />
            <Metric label="Rejected" value={String(rejectedCount)} />
            <Metric label="Open exceptions" value={String(openExceptions)} />
          </div>
        </div>
      </section>

      <section className="request-shell">
        <div className="content-panel content-panel-strong request-main-panel">
          <div className="filter-row filter-row-compact">
            <button className={tab === 'reconciliation' ? 'filter-chip is-active' : 'filter-chip'} onClick={() => setTab('reconciliation')} type="button">
              Reconciliation ({reconciliationRows.length})
            </button>
            <button className={tab === 'raw' ? 'filter-chip is-active' : 'filter-chip'} onClick={() => setTab('raw')} type="button">
              Observed movement ({observedTransfers.length})
            </button>
          </div>

          {tab === 'reconciliation' ? (
            <div className="request-table compact-request-table payment-order-table">
              <div className="request-table-head">
                <span>Payment</span>
                <span>Amount</span>
                <span>Display state</span>
                <span>Match status</span>
                <span>Signature</span>
                <span>Updated</span>
              </div>
              {reconciliationRows.length ? reconciliationRows.map((row) => (
                <div className="request-table-row" key={row.transferRequestId}>
                  <div className="request-row-button">
                    <span className="request-cell-primary">
                      <strong>{row.destination?.label ?? getDestinationLabel(row.destination, row.destinationWorkspaceAddress)}</strong>
                      <small>{shortenAddress(row.transferRequestId, 8, 6)}</small>
                    </span>
                    <span className="request-cell-single">{formatRawUsdcCompact(row.amountRaw)} {(row.asset ?? 'USDC').toUpperCase()}</span>
                    <span className="request-cell-single">
                      <span className={`tone-pill tone-pill-${getSettlementTone(row)}`}>{getDisplayStateLabel(row)}</span>
                    </span>
                    <span className="request-cell-single">{row.match?.matchStatus ? formatLabel(row.match.matchStatus) : 'pending'}</span>
                    <span className="request-cell-single">{row.match?.signature ? shortenAddress(row.match.signature, 8, 8) : 'N/A'}</span>
                    <span className="request-cell-single">{formatTimestampCompact(row.match?.updatedAt ?? row.requestedAt)}</span>
                  </div>
                </div>
              )) : <div className="empty-box compact">No reconciliation rows yet.</div>}
            </div>
          ) : (
            <div className="request-table compact-request-table payment-order-table">
              <div className="request-table-head">
                <span>Source</span>
                <span>Destination</span>
                <span>Amount</span>
                <span>Signature</span>
                <span>Slot</span>
                <span>Observed</span>
                <span>Lag</span>
              </div>
              {observedTransfers.length ? observedTransfers.map((row) => (
                <div className="request-table-row" key={row.transferId}>
                  <div className="request-row-button">
                    <span className="request-cell-single">{row.sourceWallet ? shortenAddress(row.sourceWallet, 8, 8) : 'unknown'}</span>
                    <span className="request-cell-single">{row.destinationWallet ? shortenAddress(row.destinationWallet, 8, 8) : 'unknown'}</span>
                    <span className="request-cell-single">{formatRawUsdcCompact(row.amountRaw)} {(row.asset ?? 'USDC').toUpperCase()}</span>
                    <span className="request-cell-single">{shortenAddress(row.signature, 8, 8)}</span>
                    <span className="request-cell-single">{row.slot.toLocaleString()}</span>
                    <span className="request-cell-single">{formatTimestampCompact(row.eventTime)}</span>
                    <span className="request-cell-single">{row.chainToWriteMs.toLocaleString()} ms</span>
                  </div>
                </div>
              )) : <div className="empty-box compact">No observed transfers yet.</div>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function WorkspaceProofsPage({
  paymentOrders,
  paymentRuns,
  onDownloadPaymentOrderProof,
  onDownloadPaymentRunProof,
}: {
  paymentOrders: PaymentOrder[];
  paymentRuns: PaymentRun[];
  onDownloadPaymentOrderProof: (paymentOrderId: string) => Promise<void>;
  onDownloadPaymentRunProof: (paymentRunId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<'needs_review' | 'ready' | 'exported'>('needs_review');
  const proofNeedsReview = paymentOrders.filter((order) => ['partially_settled', 'exception', 'execution_recorded'].includes(order.derivedState));
  const proofReadyOrders = paymentOrders.filter((order) => ['settled', 'closed'].includes(order.derivedState));
  const exportedLikeOrders = paymentOrders.filter((order) => order.derivedState === 'closed');
  const runNeedsReview = paymentRuns.filter((run) => ['exception', 'partially_settled'].includes(run.derivedState));
  const runReady = paymentRuns.filter((run) => ['settled', 'closed'].includes(run.derivedState));
  const runExported = paymentRuns.filter((run) => run.derivedState === 'closed');

  const activeOrders = tab === 'needs_review' ? proofNeedsReview : tab === 'ready' ? proofReadyOrders : exportedLikeOrders;
  const activeRuns = tab === 'needs_review' ? runNeedsReview : tab === 'ready' ? runReady : runExported;

  return (
    <div className="page-stack page-stack-tight">
      <section className="section-headline section-headline-compact">
        <div className="section-headline-copy">
          <p className="eyebrow">Proofs</p>
          <h1>Proof packets</h1>
          <p className="section-copy">Preview structured proof or export JSON for finance review and audit handoff.</p>
        </div>
      </section>

      <section className="content-grid content-grid-single">
        <div className="workspace-pulse-strip workspace-pulse-strip-standalone">
          <div className="workspace-pulse-strip-grid">
            <Metric label="Needs review" value={String(proofNeedsReview.length + runNeedsReview.length)} />
            <Metric label="Ready to export" value={String(proofReadyOrders.length + runReady.length)} />
            <Metric label="Exported / closed" value={String(exportedLikeOrders.length + runExported.length)} />
            <Metric label="Total proof records" value={String(paymentOrders.length + paymentRuns.length)} />
          </div>
        </div>
      </section>

      <section className="request-shell">
        <div className="content-panel content-panel-strong request-main-panel">
          <div className="filter-row filter-row-compact">
            <button className={tab === 'needs_review' ? 'filter-chip is-active' : 'filter-chip'} onClick={() => setTab('needs_review')} type="button">
              Needs review ({proofNeedsReview.length + runNeedsReview.length})
            </button>
            <button className={tab === 'ready' ? 'filter-chip is-active' : 'filter-chip'} onClick={() => setTab('ready')} type="button">
              Ready to export ({proofReadyOrders.length + runReady.length})
            </button>
            <button className={tab === 'exported' ? 'filter-chip is-active' : 'filter-chip'} onClick={() => setTab('exported')} type="button">
              Exported ({exportedLikeOrders.length + runExported.length})
            </button>
          </div>

          <div className="panel-header surface-panel-header">
            <div className="surface-panel-copy">
              <h2 className="registry-section-title">Payment proofs <span className="registry-count-inline">[{activeOrders.length}]</span></h2>
            </div>
          </div>
          <div className="request-table compact-request-table payment-order-table">
            <div className="request-table-head">
              <span>Payee</span>
              <span>Destination</span>
              <span>Amount</span>
              <span>Readiness</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            {activeOrders.length ? activeOrders.map((order) => (
              <div className="request-table-row" key={order.paymentOrderId}>
                <div className="request-row-button">
                  <span className="request-cell-primary">
                    <strong>{order.payee?.name ?? order.destination.label}</strong>
                    <small>{shortenAddress(order.paymentOrderId, 8, 6)}</small>
                  </span>
                  <span className="request-cell-single">{order.destination.label}</span>
                  <span className="request-cell-single">{formatRawUsdcCompact(order.amountRaw)} {(order.asset ?? 'USDC').toUpperCase()}</span>
                  <span className="request-cell-single">{proofReadinessLine(order)}</span>
                  <span className="request-cell-single"><span className={`tone-pill tone-pill-${getProgressTone(order.derivedState)}`}>{formatLabel(order.derivedState)}</span></span>
                  <span className="request-cell-single">
                    <button className="ghost-button compact-button" onClick={() => void onDownloadPaymentOrderProof(order.paymentOrderId)} type="button">
                      Export
                    </button>
                  </span>
                </div>
              </div>
            )) : <div className="empty-box compact">No payment proofs in this tab.</div>}
          </div>

          <div className="panel-header surface-panel-header">
            <div className="surface-panel-copy">
              <h2 className="registry-section-title">Run proofs <span className="registry-count-inline">[{activeRuns.length}]</span></h2>
            </div>
          </div>
          <div className="request-table compact-request-table payment-order-table">
            <div className="request-table-head">
              <span>Run</span>
              <span>Rows</span>
              <span>Total</span>
              <span>Readiness</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            {activeRuns.length ? activeRuns.map((run) => (
              <div className="request-table-row" key={run.paymentRunId}>
                <div className="request-row-button">
                  <span className="request-cell-primary">
                    <strong>{run.runName}</strong>
                    <small>{shortenAddress(run.paymentRunId, 8, 6)}</small>
                  </span>
                  <span className="request-cell-single">{run.totals.orderCount}</span>
                  <span className="request-cell-single">{formatRawUsdcCompact(run.totals.totalAmountRaw)} USDC</span>
                  <span className="request-cell-single">{run.derivedState === 'settled' || run.derivedState === 'closed' ? 'Ready' : 'Needs review'}</span>
                  <span className="request-cell-single"><span className={`tone-pill tone-pill-${getRunTone(run.derivedState)}`}>{formatLabel(run.derivedState)}</span></span>
                  <span className="request-cell-single">
                    <button className="ghost-button compact-button" onClick={() => void onDownloadPaymentRunProof(run.paymentRunId)} type="button">
                      Export
                    </button>
                  </span>
                </div>
              </div>
            )) : <div className="empty-box compact">No run proofs in this tab.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

export function WorkspaceOpsPage({
  currentWorkspace,
  opsHealth,
  exportJobs,
  paymentOrders,
  paymentRuns,
  onDownloadReconciliationExport,
  onDownloadExceptionsExport,
  surface = 'ops',
}: {
  currentWorkspace: Workspace;
  opsHealth: OpsHealth | null;
  exportJobs: ExportJob[];
  paymentOrders: PaymentOrder[];
  paymentRuns: PaymentRun[];
  onDownloadReconciliationExport: () => Promise<void>;
  onDownloadExceptionsExport: () => Promise<void>;
  surface?: 'ops' | 'proofs';
}) {
  const proofNeedsReviewCount = paymentOrders.filter((order) => ['exception', 'partially_settled', 'execution_recorded'].includes(order.derivedState)).length;
  const proofReadyCount = paymentOrders.filter((order) => ['settled', 'closed'].includes(order.derivedState)).length;
  const runProofReadyCount = paymentRuns.filter((run) => ['settled', 'closed'].includes(run.derivedState)).length;
  return (
    <div className="page-stack page-stack-tight">
      <section className="section-headline section-headline-compact">
        <div className="section-headline-copy">
          <p className="eyebrow">{surface === 'proofs' ? 'Proofs' : 'Ops'}</p>
          <h1>{currentWorkspace.workspaceName}</h1>
          <p className="section-copy">
            {surface === 'proofs'
              ? 'Proof packet workflow and export center for audit-ready records.'
              : 'Check pipeline health, watch latency, and export records for operators and finance.'}
          </p>
        </div>
      </section>

      <section className="content-grid content-grid-two">
        {surface === 'ops' ? (
        <div className="content-panel content-panel-strong">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Health</p>
              <h2>Ingest and match status</h2>
            </div>
            <span className={`status-chip status-chip-${opsHealth?.workerStatus ?? 'offline'}`}>
              {opsHealth?.workerStatus ?? 'loading'}
            </span>
          </div>
          {opsHealth ? (
            <div className="health-grid">
              <div className="state-summary-card">
                <span>Latest slot</span>
                <strong>{opsHealth.latestSlot ?? 'n/a'}</strong>
              </div>
              <div className="state-summary-card">
                <span>Open exceptions</span>
                <strong>{opsHealth.openExceptionCount}</strong>
              </div>
              <div className="state-summary-card">
                <span>Observed txs</span>
                <strong>{opsHealth.observedTransactionCount}</strong>
              </div>
              <div className="state-summary-card">
                <span>Matches</span>
                <strong>{opsHealth.matchCount}</strong>
              </div>
              <div className="empty-box compact">
                <strong>Yellowstone to worker</strong>
                <div className="detail-grid">
                  <span>P50</span>
                  <span>{formatLatency(opsHealth.latencies.yellowstoneToWorkerMs.p50)}</span>
                  <span>P95</span>
                  <span>{formatLatency(opsHealth.latencies.yellowstoneToWorkerMs.p95)}</span>
                </div>
              </div>
              <div className="empty-box compact">
                <strong>Chain to write</strong>
                <div className="detail-grid">
                  <span>P50</span>
                  <span>{formatLatency(opsHealth.latencies.chainToWriteMs.p50)}</span>
                  <span>P95</span>
                  <span>{formatLatency(opsHealth.latencies.chainToWriteMs.p95)}</span>
                </div>
              </div>
              <div className="empty-box compact">
                <strong>Chain to match</strong>
                <div className="detail-grid">
                  <span>P50</span>
                  <span>{formatLatency(opsHealth.latencies.chainToMatchMs.p50)}</span>
                  <span>P95</span>
                  <span>{formatLatency(opsHealth.latencies.chainToMatchMs.p95)}</span>
                </div>
              </div>
              <div className="empty-box compact">
                <strong>Freshness</strong>
                <p>{opsHealth.workerFreshnessMs === null ? 'No recent worker signal.' : `${Math.round(opsHealth.workerFreshnessMs / 1000)}s since latest worker receive.`}</p>
              </div>
            </div>
          ) : (
            <div className="empty-box compact">Loading ops health…</div>
          )}
        </div>
        ) : (
        <div className="content-panel content-panel-strong">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Proof readiness</p>
              <h2>Proof packet state</h2>
            </div>
          </div>
          <div className="health-grid">
            <div className="state-summary-card">
              <span>Total exports</span>
              <strong>{exportJobs.length}</strong>
            </div>
            <div className="state-summary-card">
              <span>Completed</span>
              <strong>{exportJobs.filter((job) => job.status === 'completed').length}</strong>
            </div>
            <div className="state-summary-card">
              <span>Running</span>
              <strong>{exportJobs.filter((job) => job.status === 'running').length}</strong>
            </div>
            <div className="state-summary-card">
              <span>Failed</span>
              <strong>{exportJobs.filter((job) => job.status === 'failed').length}</strong>
            </div>
            <div className="state-summary-card">
              <span>Needs review</span>
              <strong>{proofNeedsReviewCount}</strong>
            </div>
            <div className="state-summary-card">
              <span>Ready (payments)</span>
              <strong>{proofReadyCount}</strong>
            </div>
            <div className="state-summary-card">
              <span>Ready (runs)</span>
              <strong>{runProofReadyCount}</strong>
            </div>
          </div>
        </div>
        )}

        <div className="content-panel content-panel-soft">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{surface === 'proofs' ? 'Proof exports' : 'Export'}</p>
              <h2>{surface === 'proofs' ? 'Proof packet center' : 'Record export center'}</h2>
            </div>
          </div>

          <div className="exception-actions">
            <button className="primary-button" onClick={() => void onDownloadReconciliationExport()} type="button">
              Export reconciliation
            </button>
            <button className="primary-button" onClick={() => void onDownloadExceptionsExport()} type="button">
              Export exceptions
            </button>
          </div>

          <div className="counterparty-table export-history-table">
            <div className="counterparty-table-head">
              <span>Kind</span>
              <span>Format</span>
              <span>Rows</span>
              <span>Requested</span>
            </div>
            {exportJobs.length ? (
              exportJobs.map((job) => (
                <div key={job.exportJobId} className="counterparty-table-row">
                  <span>{formatLabel(job.exportKind)}</span>
                  <span>{job.format}</span>
                  <span>{job.rowCount}</span>
                  <span>{formatTimestampCompact(job.createdAt)}</span>
                </div>
              ))
            ) : (
              <div className="empty-box compact">No exports recorded yet.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function getWalletName(address: WorkspaceAddress) {
  return address.displayName?.trim() || address.address;
}

function getWalletNameLite(address: WorkspaceAddressLite | null) {
  return address?.displayName?.trim() || address?.address || 'Not set';
}

function mapDestinationTone(trustState: Destination['trustState']) {
  switch (trustState) {
    case 'trusted':
      return 'matched';
    case 'restricted':
      return 'partial';
    case 'blocked':
      return 'exception';
    case 'unreviewed':
    default:
      return 'pending';
  }
}

function mapExceptionSeverityTone(severity: string) {
  switch (severity) {
    case 'critical':
      return 'exception';
    case 'warning':
      return 'partial';
    case 'info':
    default:
      return 'pending';
  }
}

function mapExceptionStatusTone(status: string) {
  switch (status) {
    case 'dismissed':
      return 'matched';
    case 'reviewed':
    case 'expected':
      return 'partial';
    case 'reopened':
    case 'open':
    default:
      return 'exception';
  }
}

function getExceptionReasonLabel(reasonCode: string) {
  return reasonCode.replaceAll('_', ' ');
}

function executionReason(order: PaymentOrder) {
  if (!order.sourceWorkspaceAddressId && order.derivedState === 'ready_for_execution') {
    return 'Source wallet missing before signing.';
  }
  if (order.derivedState === 'ready_for_execution') return 'Approved and waiting for signature.';
  if (order.derivedState === 'execution_recorded') return 'Signed and waiting for chain match.';
  if (order.derivedState === 'exception') return 'Exception needs operator review.';
  if (order.derivedState === 'partially_settled') return 'Partial match detected, verify settlement.';
  return 'Waiting for execution step.';
}

function proofReadinessLine(order: PaymentOrder) {
  if (order.derivedState === 'settled' || order.derivedState === 'closed') return 'Ready for export';
  if (order.derivedState === 'execution_recorded') return 'Executed, waiting for settlement proof';
  if (order.derivedState === 'partially_settled') return 'Partial settlement needs review';
  if (order.derivedState === 'exception') return 'Exception context required';
  return 'Not proof-ready yet';
}

function hoursSince(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
}

function commandPriorityScore(order: PaymentOrder) {
  const stateWeight = order.derivedState === 'exception'
    ? 8
    : order.derivedState === 'pending_approval'
      ? 7
      : order.derivedState === 'partially_settled'
        ? 6
        : order.derivedState === 'execution_recorded'
          ? 5
          : order.derivedState === 'ready_for_execution'
            ? 4
            : order.derivedState === 'approved'
              ? 3
              : 1;
  const amountWeight = Math.min(6, Math.floor(Number(order.amountRaw) / 1_000_000_000));
  const ageWeight = Math.min(6, Math.floor(hoursSince(order.createdAt) / 4));
  return stateWeight * 10 + amountWeight + ageWeight;
}

function commandPriorityReason(order: PaymentOrder) {
  if (order.derivedState === 'exception') return 'Exception needs operator review.';
  if (order.derivedState === 'pending_approval') return 'Waiting for approval decision.';
  if (order.derivedState === 'ready_for_execution') return 'Approved and waiting for signature.';
  if (order.derivedState === 'execution_recorded') return 'Signed and waiting for settlement.';
  if (order.derivedState === 'partially_settled') return 'Partial settlement detected.';
  if (hoursSince(order.createdAt) >= 24) return 'Aging over 24h.';
  return 'Active operational item.';
}

function isActionableOrder(order: PaymentOrder) {
  return !['settled', 'closed', 'cancelled'].includes(order.derivedState);
}

function executionAction(order: PaymentOrder) {
  if (order.derivedState === 'ready_for_execution') return 'Open signer';
  if (order.derivedState === 'execution_recorded') return 'Track settlement';
  if (order.derivedState === 'exception' || order.derivedState === 'partially_settled') return 'Resolve issue';
  return 'Open payment';
}

function getProgressTone(state: string) {
  if (state === 'settled' || state === 'closed') return 'matched';
  if (state === 'exception' || state === 'cancelled') return 'exception';
  if (state === 'partially_settled') return 'partial';
  return 'pending';
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function getApprovalActionLabel(action: string) {
  switch (action) {
    case 'routed_for_approval':
      return 'routed for approval';
    case 'auto_approved':
      return 'auto approved';
    default:
      return formatLabel(action);
  }
}

function getApprovalDecisionSummary(action: string) {
  switch (action) {
    case 'routed_for_approval':
      return 'System decision recorded before the request became active.';
    case 'auto_approved':
      return 'Policy allowed the request to become active without manual review.';
    case 'approve':
      return 'Operator approved the request and cleared it for execution.';
    case 'reject':
      return 'Operator rejected the request.';
    case 'escalate':
      return 'Operator escalated the request for higher-touch review.';
    default:
      return formatLabel(action);
  }
}

function getApprovalStateLabel(state: string) {
  switch (state) {
    case 'pending_approval':
      return 'waiting for approval';
    case 'escalated':
      return 'escalated';
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'closed':
      return 'closed';
    case 'draft':
      return 'draft';
    case 'submitted':
    default:
      return 'submitted';
  }
}

function RunProgressTracker({
  steps,
}: {
  steps: Array<{ label: string; subtext: string; state: 'pending' | 'current' | 'complete' | 'blocked' }>;
}) {
  return (
    <section className="run-progress" aria-label="Payment progress">
      {steps.map((step, index) => (
        <div className="run-progress-step-wrap" key={step.label}>
          <div className={`run-progress-step run-progress-step-${step.state}`}>
            <div className="run-progress-row">
              <span className={`run-progress-dot run-progress-dot-${step.state}`} aria-hidden />
              {index < steps.length - 1 ? <span className={`run-progress-line run-progress-line-${step.state}`} aria-hidden /> : null}
            </div>
            <div className="run-progress-copy">
              <strong>{step.label}</strong>
              <small>{step.subtext}</small>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

function CompactStageEvents({ items }: { items: Array<{ title: string; body: ReactNode; time: string }> }) {
  return (
    <div className="compact-stage-events">
      {items.map((item, index) => (
        <div key={`${item.title}-${item.time}-${index}`} className="compact-stage-event">
          <strong>{item.title}</strong>
          <time title={formatTimestamp(item.time)}>{formatRelativeTime(item.time)}</time>
          <p>{item.body}</p>
        </div>
      ))}
    </div>
  );
}

function buildWorkflow(order: PaymentOrder) {
  if (order.derivedState === 'cancelled') {
    return [
      { label: 'Imported', subtext: '1 row', state: 'complete' as const },
      { label: 'Review', subtext: 'Not started', state: 'pending' as const },
      { label: 'Approved', subtext: 'Rejected', state: 'blocked' as const },
      { label: 'Execute', subtext: 'Not started', state: 'pending' as const },
      { label: 'Settle', subtext: 'Waiting', state: 'pending' as const },
      { label: 'Prove', subtext: 'Pending', state: 'pending' as const },
    ];
  }

  const currentIndexMap: Record<PaymentOrderState, number> = {
    draft: 1,
    pending_approval: 2,
    approved: 3,
    ready_for_execution: 3,
    execution_recorded: 4,
    settled: 5,
    partially_settled: 4,
    exception: 4,
    cancelled: 4,
    closed: 5,
  };
  const currentIndex = currentIndexMap[order.derivedState] ?? 1;
  const blocked = order.derivedState === 'exception' || order.derivedState === 'partially_settled';
  const reviewState = stepState(1, currentIndex, blocked);
  const approveState = stepState(2, currentIndex, blocked);
  const executeState = stepState(3, currentIndex, blocked);
  const settleState = blocked ? ('blocked' as const) : stepState(4, currentIndex, false);
  const proveState = order.derivedState === 'settled' || order.derivedState === 'closed'
    ? ('complete' as const)
    : blocked
      ? ('blocked' as const)
      : ('pending' as const);
  const tenseLabel = (complete: boolean, past: string, present: string) => (complete ? past : present);
  return [
    { label: 'Imported', subtext: '1 row', state: 'complete' as const },
    { label: tenseLabel(reviewState === 'complete', 'Reviewed', 'Review'), subtext: reviewState === 'complete' ? 'Reviewed' : 'Review pending', state: reviewState },
    { label: tenseLabel(approveState === 'complete', 'Approved', 'Approve'), subtext: getApprovalLabel(order), state: approveState },
    { label: tenseLabel(executeState === 'complete', 'Executed', 'Execute'), subtext: getExecutionLabel(order), state: executeState },
    { label: tenseLabel(settleState === 'complete', 'Settled', 'Settle'), subtext: getSettlementLabel(order), state: settleState },
    { label: tenseLabel(proveState === 'complete', 'Proven', 'Prove'), subtext: proveState === 'complete' ? 'Ready' : 'Pending', state: proveState },
  ];
}

function buildRunWorkflow(run: PaymentRun) {
  const state = run.derivedState;
  const blocked = state === 'exception' || state === 'partially_settled';
  const settled = state === 'settled' || state === 'closed';
  const approvedDone = run.totals.approvedCount > 0 || settled || state === 'execution_recorded' || state === 'exception' || state === 'partially_settled';
  const submittedDone = ['execution_recorded', 'partially_settled', 'settled', 'closed', 'exception'].includes(state);
  const reviewedCurrent = !approvedDone && run.totals.pendingApprovalCount > 0;
  const submittedCurrent = approvedDone && !submittedDone && !blocked;
  const settledCurrent = !blocked && !settled && submittedDone;
  const reviewedState = reviewedCurrent ? ('current' as const) : ('complete' as const);
  const approvedState = approvedDone ? ('complete' as const) : ('pending' as const);
  const submittedState = blocked ? ('blocked' as const) : submittedDone ? ('complete' as const) : submittedCurrent ? ('current' as const) : ('pending' as const);
  const settledState = blocked ? ('blocked' as const) : settled ? ('complete' as const) : settledCurrent ? ('current' as const) : ('pending' as const);
  const provenState = settled ? ('complete' as const) : ('pending' as const);
  const tenseLabel = (complete: boolean, past: string, present: string) => (complete ? past : present);
  const approvedRows = run.totals.approvedCount;
  const rejectedRows = run.totals.cancelledCount;
  const approvalSummary = rejectedRows > 0
    ? `${approvedRows} approved / ${rejectedRows} rejected`
    : approvedDone
      ? 'Ready rows exist'
      : 'Waiting';
  return [
    { label: 'Imported', subtext: `${run.totals.orderCount} rows`, state: 'complete' as const },
    { label: tenseLabel(reviewedState === 'complete', 'Reviewed', 'Review'), subtext: run.totals.pendingApprovalCount ? `${run.totals.pendingApprovalCount} need approval` : 'Reviewed', state: reviewedState },
    { label: tenseLabel(approvedState === 'complete', 'Approved', 'Approve'), subtext: approvalSummary, state: approvedState },
    { label: tenseLabel(submittedState === 'complete', 'Executed', 'Execute'), subtext: blocked ? 'Needs review' : submittedDone ? 'On chain' : approvedDone ? 'Ready to sign and execute' : 'Pending', state: submittedState },
    { label: tenseLabel(settledState === 'complete', 'Settled', 'Settle'), subtext: `${run.totals.settledCount}/${Math.max(run.totals.actionableCount, 1)} matched`, state: settledState },
    { label: tenseLabel(provenState === 'complete', 'Proven', 'Prove'), subtext: settled ? 'Proof ready' : 'Pending', state: provenState },
  ];
}

function stepState(stepIndex: number, currentIndex: number, blocked: boolean) {
  if (blocked && stepIndex >= currentIndex) return 'blocked' as const;
  if (stepIndex < currentIndex) return 'complete' as const;
  if (stepIndex === currentIndex) return 'current' as const;
  return 'pending' as const;
}

function paymentTimelineStates(state: PaymentOrderState): Record<'request' | 'approval' | 'execution' | 'settlement' | 'proof', 'complete' | 'current' | 'pending' | 'blocked'> {
  if (state === 'cancelled') {
    return { request: 'complete', approval: 'blocked', execution: 'pending', settlement: 'pending', proof: 'pending' };
  }
  const blocked = state === 'exception' || state === 'partially_settled';
  const indexMap: Record<string, number> = {
    draft: 0,
    pending_approval: 1,
    approved: 2,
    ready_for_execution: 2,
    execution_recorded: 3,
    settled: 4,
    closed: 4,
  };
  const current = Math.max(indexMap[state] ?? 0, 0);
  const resolve = (idx: number) => stepState(idx, current, blocked);
  return {
    request: resolve(0),
    approval: resolve(1),
    execution: resolve(2),
    settlement: resolve(3),
    proof: state === 'settled' || state === 'closed' ? 'complete' : blocked ? 'blocked' : 'pending',
  };
}

function getApprovalLabel(order: PaymentOrder) {
  if (order.derivedState === 'pending_approval') return 'Needs approval';
  if (order.derivedState === 'draft') return 'Draft';
  if (order.derivedState === 'cancelled') return 'Rejected';
  return 'Approved';
}

function getExecutionLabel(order: PaymentOrder) {
  if (order.derivedState === 'ready_for_execution') return 'Ready to sign';
  if (order.derivedState === 'execution_recorded') return 'Executed';
  if (order.derivedState === 'settled' || order.derivedState === 'closed') return 'Completed';
  if (order.derivedState === 'exception' || order.derivedState === 'partially_settled') return 'Needs review';
  return 'Not started';
}

function getSettlementLabel(order: PaymentOrder) {
  if (order.derivedState === 'settled' || order.derivedState === 'closed') return 'Matched';
  if (order.derivedState === 'partially_settled') return 'Partial';
  if (order.derivedState === 'exception') return 'Needs review';
  return 'Waiting';
}

function getPaymentProgress(
  order: PaymentOrder,
  row: ReconciliationRow | null,
  preparedExecution: PaymentExecutionPacket | null,
): {
  step: number;
  label: string;
  description: string;
  tone: 'pending' | 'partial' | 'matched' | 'exception';
} {
  const hasOpenException = row?.exceptions.some((item) => item.status !== 'dismissed') ?? false;
  const hasSubmittedSignature = Boolean(row?.latestExecution?.submittedSignature);
  const hasPreparedExecution = Boolean(preparedExecution || row?.latestExecution);

  if (order.derivedState === 'cancelled') {
    return {
      step: 1,
      label: 'Cancelled',
      description: 'This payment order was stopped before completion.',
      tone: 'exception',
    };
  }

  if (order.derivedState === 'closed') {
    return {
      step: 5,
      label: 'Closed',
      description: 'This payment order is closed.',
      tone: 'matched',
    };
  }

  if (hasOpenException || order.derivedState === 'exception') {
    return {
      step: 5,
      label: 'Needs review',
      description: 'Settlement did not cleanly match the payment intent.',
      tone: 'exception',
    };
  }

  if (row?.requestDisplayState === 'partial' || order.derivedState === 'partially_settled') {
    return {
      step: 5,
      label: 'Partially paid',
      description: 'Some USDC arrived, but the payment is not fully settled.',
      tone: 'partial',
    };
  }

  if (row?.requestDisplayState === 'matched' || order.derivedState === 'settled') {
    return {
      step: 5,
      label: 'Completed',
      description: 'The expected USDC settlement was observed and matched.',
      tone: 'matched',
    };
  }

  if (hasSubmittedSignature || row?.executionState === 'submitted_onchain' || row?.executionState === 'observed') {
    return {
      step: 4,
      label: 'Submitted',
      description: 'A transaction signature is attached. The system is watching for settlement.',
      tone: 'partial',
    };
  }

  if (hasPreparedExecution || order.derivedState === 'execution_recorded') {
    return {
      step: 3,
      label: 'Prepared to sign',
      description: 'The payment packet exists, but no onchain transaction has been attached yet.',
      tone: 'partial',
    };
  }

  if (row?.approvalState === 'pending_approval' || row?.approvalState === 'escalated' || order.derivedState === 'pending_approval') {
    return {
      step: 2,
      label: 'Needs approval',
      description: 'Policy requires an operator approval before execution can be prepared.',
      tone: 'pending',
    };
  }

  if (order.derivedState === 'approved' || order.derivedState === 'ready_for_execution') {
    return {
      step: 2,
      label: 'Approved',
      description: 'Policy cleared this order. Prepare the payment packet next.',
      tone: 'pending',
    };
  }

  return {
    step: 1,
    label: 'Draft',
    description: 'This payment order has not entered the payment workflow yet.',
    tone: 'pending',
  };
}

function getInputProgress(request: PaymentRequest | null): {
  step: number;
  label: string;
  description: string;
  tone: 'pending' | 'partial' | 'matched' | 'exception';
} {
  if (request?.state === 'cancelled') {
    return {
      step: 1,
      label: 'Cancelled',
      description: 'This request was stopped before it became a payment order.',
      tone: 'exception',
    };
  }

  return {
    step: 1,
    label: 'Requested',
    description: 'The payment request exists. Create the controlled order next.',
    tone: 'pending',
  };
}

function getRunTone(state: string): 'pending' | 'partial' | 'matched' | 'exception' {
  if (state === 'settled' || state === 'closed') {
    return 'matched';
  }
  if (state === 'exception' || state === 'cancelled') {
    return 'exception';
  }
  if (state === 'execution_recorded' || state === 'submitted_onchain' || state === 'partially_settled') {
    return 'partial';
  }
  return 'pending';
}

function getLatestPreparedExecutionPacket(order: PaymentOrder): PaymentExecutionPacket | null {
  const candidate = order.reconciliationDetail?.latestExecution?.metadataJson?.preparedExecution;
  if (!isPaymentExecutionPacket(candidate)) {
    return null;
  }
  return candidate;
}

function isPaymentExecutionPacket(value: unknown): value is PaymentExecutionPacket {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<PaymentExecutionPacket>;
  return (
    candidate.kind === 'solana_spl_usdc_transfer'
    && typeof candidate.paymentOrderId === 'string'
    && typeof candidate.executionRecordId === 'string'
    && typeof candidate.amountRaw === 'string'
    && typeof candidate.source === 'object'
    && candidate.source !== null
    && typeof candidate.destination === 'object'
    && candidate.destination !== null
    && Array.isArray(candidate.instructions)
  );
}

function formatBrowserWalletOption(wallet: BrowserWalletOption) {
  const address = wallet.address ? ` // ${shortenAddress(wallet.address, 6, 6)}` : ' // connect to choose account';
  const source = wallet.source === 'wallet-standard' ? 'standard' : 'injected';
  const readiness = wallet.ready ? '' : ' // signing unavailable';
  return `${wallet.name}${address} // ${source}${readiness}`;
}

function inferApprovalStateFromRequestStatus(
  status: string,
): ReconciliationRow['approvalState'] {
  switch (status) {
    case 'draft':
      return 'draft';
    case 'pending_approval':
      return 'pending_approval';
    case 'escalated':
      return 'escalated';
    case 'rejected':
      return 'rejected';
    case 'closed':
      return 'closed';
    case 'approved':
    case 'ready_for_execution':
    case 'submitted_onchain':
    case 'observed':
    case 'matched':
    case 'partially_matched':
    case 'exception':
      return 'approved';
    case 'submitted':
    default:
      return 'submitted';
  }
}

function mapApprovalTone(state: ReconciliationRow['approvalState']) {
  switch (state) {
    case 'approved':
    case 'closed':
      return 'matched';
    case 'rejected':
      return 'exception';
    case 'pending_approval':
    case 'escalated':
      return 'partial';
    case 'draft':
    case 'submitted':
    default:
      return 'pending';
  }
}

function getExecutionStateForRow(row: ReconciliationRow) {
  if (row.requestDisplayState === 'exception' && row.exceptions.some((item) => item.reasonCode === 'partial_settlement')) {
    return 'settled';
  }

  return row.executionState;
}

function getExecutionStateLabel(state: string, row?: Pick<ReconciliationRow, 'requestDisplayState' | 'exceptions'>) {
  switch (state) {
    case 'not_started':
      return 'not started';
    case 'ready_for_execution':
      return 'ready to send';
    case 'submitted_onchain':
      return 'submitted onchain';
    case 'broadcast_failed':
      return 'broadcast failed';
    case 'observed':
      return 'observed onchain';
    case 'settled':
      if (row?.requestDisplayState === 'exception' && row.exceptions.some((item) => item.reasonCode === 'partial_settlement')) {
        return 'partially settled';
      }
      return 'settled';
    case 'execution_exception':
      return 'needs execution review';
    case 'closed':
      return 'closed';
    case 'rejected':
      return 'rejected';
    default:
      return formatLabel(state);
  }
}

function inferExecutionStateFromRequestStatus(
  status: string,
): ReconciliationRow['executionState'] {
  switch (status) {
    case 'rejected':
      return 'rejected';
    case 'closed':
      return 'closed';
    case 'submitted_onchain':
      return 'submitted_onchain';
    case 'observed':
      return 'observed';
    case 'matched':
    case 'partially_matched':
      return 'settled';
    case 'exception':
      return 'execution_exception';
    case 'approved':
    case 'ready_for_execution':
      return 'ready_for_execution';
    case 'draft':
    case 'submitted':
    case 'pending_approval':
    case 'escalated':
    default:
      return 'not_started';
  }
}

function mapExecutionTone(state: ReconciliationRow['executionState']) {
  switch (state) {
    case 'settled':
    case 'closed':
      return 'matched';
    case 'broadcast_failed':
    case 'execution_exception':
    case 'rejected':
      return 'exception';
    case 'submitted_onchain':
    case 'observed':
      return 'partial';
    case 'ready_for_execution':
      return 'pending';
    case 'not_started':
    default:
      return 'pending';
  }
}

function getSettlementTone(row: Pick<ReconciliationRow, 'requestDisplayState' | 'match' | 'exceptions'>) {
  if (row.exceptions.some((item) => item.reasonCode === 'partial_settlement' && item.status !== 'dismissed')) {
    return 'partial';
  }
  return row.requestDisplayState;
}

function getApprovalReasonLabel(code: string) {
  switch (code) {
    case 'destination_not_trusted':
      return 'destination not trusted';
    case 'external_transfer_requires_approval':
      return 'external transfer policy';
    case 'internal_transfer_requires_approval':
      return 'internal transfer policy';
    case 'external_amount_threshold_exceeded':
      return 'external threshold exceeded';
    case 'internal_amount_threshold_exceeded':
      return 'internal threshold exceeded';
    default:
      return formatLabel(code);
  }
}

function getDestinationTrustLabel(trustState: string) {
  switch (trustState) {
    case 'trusted':
      return 'trusted';
    case 'restricted':
      return 'restricted';
    case 'blocked':
      return 'blocked';
    case 'unreviewed':
    default:
      return 'unreviewed';
  }
}

function ExceptionCard({
  exception,
  onAddNote,
  onApplyAction,
}: {
  exception: ExceptionItem;
  onAddNote: (exceptionId: string, body: string, transferRequestId?: string | null) => Promise<void>;
  onApplyAction: (
    exceptionId: string,
    action: 'reviewed' | 'expected' | 'dismissed' | 'reopen',
    transferRequestId?: string | null,
    note?: string,
  ) => Promise<void>;
}) {
  return (
    <div className="exception-card">
      <div className="exception-card-head">
        <div>
          <strong>{getExceptionReasonLabel(exception.reasonCode)}</strong>
          <small>{exception.severity} // {exception.status}</small>
        </div>
      </div>
      <p className="exception-copy">{exception.explanation}</p>
      {exception.availableActions?.length ? (
        <div className="exception-actions">
          {exception.availableActions.map((action) => (
            <button
              className="ghost-button compact-button"
              key={action}
              onClick={() => void onApplyAction(exception.exceptionId, action, exception.transferRequestId)}
              type="button"
            >
              {getExceptionActionLabel(action)}
            </button>
          ))}
        </div>
      ) : null}
      {exception.notes?.length ? (
        <div className="stack-list">
          {exception.notes.map((note) => (
            <div className="note-card" key={note.exceptionNoteId}>
              <strong>{note.authorUser?.displayName ?? note.authorUser?.email ?? 'Operator'}</strong>
              <small>{formatTimestamp(note.createdAt)}</small>
              <p>{note.body}</p>
            </div>
          ))}
        </div>
      ) : null}
      <form
        className="inline-note-form"
        onSubmit={(event) =>
          void handleNoteSubmit(event, (body) => onAddNote(exception.exceptionId, body, exception.transferRequestId))
        }
      >
        <label className="field">
          <span>Add exception note</span>
          <textarea name="body" placeholder="Record operator context or resolution notes." rows={3} />
        </label>
        <button className="ghost-button compact-button" type="submit">
          save note
        </button>
      </form>
    </div>
  );
}

function ChainSummaryBlock({
  copyTitle,
  label,
  onCopy,
  title,
  value,
}: {
  copyTitle?: string;
  label: string;
  onCopy?: () => void;
  title?: string;
  value: string;
}) {
  return (
    <div className="chain-summary-field">
      <span className="chain-summary-label">{label}</span>
      <div className="chain-summary-value-row">
        <strong className="chain-summary-value" title={title}>
          {value}
        </strong>
        {onCopy ? (
          <div className="chain-summary-actions">
            <button
              className="ghost-button compact-button chain-summary-icon"
              onClick={onCopy}
              title={copyTitle ?? `Copy ${label.toLowerCase()}`}
              type="button"
            >
              ⧉
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function InspectorAccordion({
  children,
  defaultOpen = false,
  status,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  status?: string;
  title: string;
}) {
  return (
    <details className="inspector-accordion" open={defaultOpen}>
      <summary className="inspector-accordion-summary">
        <strong>{title}</strong>
        <span>{status ?? ''}</span>
      </summary>
      <div className="inspector-accordion-body">{children}</div>
    </details>
  );
}

function getTransferLabel(
  row:
    | Pick<ReconciliationRow, 'sourceWorkspaceAddress' | 'destinationWorkspaceAddress' | 'destination'>
    | Pick<TransferRequest, 'sourceWorkspaceAddress' | 'destinationWorkspaceAddress' | 'destination'>,
) {
  const source = row.sourceWorkspaceAddress?.address ?? row.sourceWorkspaceAddress?.displayName ?? 'Source not set';
  const destination = getDestinationLabel(row.destination, row.destinationWorkspaceAddress);
  return `${source} -> ${destination}`;
}

function getDestinationLabel(destination: Destination | null, fallback: WorkspaceAddressLite | null) {
  return destination?.label ?? fallback?.displayName?.trim() ?? fallback?.address ?? 'Unknown';
}

function getDestinationTrustCopy(destination: Destination) {
  if (!destination.isActive) {
    return 'This destination is inactive. New requests are blocked until it is reactivated.';
  }

  switch (destination.trustState) {
    case 'trusted':
      return 'Trusted destinations can be submitted directly. Workspace approval policy then decides whether the request auto-clears or enters the approval inbox.';
    case 'restricted':
      return 'Restricted destinations can still be modeled, but every new request must stay as a draft until someone changes the destination trust.';
    case 'blocked':
      return 'Blocked destinations cannot be used for new requests.';
    case 'unreviewed':
    default:
      return 'Unreviewed destinations can be recorded, but requests must stay as drafts until the destination is trusted.';
  }
}

function findWorkspaceAddressByChainValue(addresses: WorkspaceAddress[], value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return addresses.find((item) => item.address === value || item.usdcAtaAddress === value) ?? null;
}

function getPrimarySettlementSignature(detail: ReconciliationDetail) {
  return detail.linkedSignature
    ?? detail.match?.signature
    ?? detail.observedExecutionTransaction?.signature
    ?? detail.latestExecution?.submittedSignature
    ?? detail.linkedObservedTransfers[0]?.signature
    ?? null;
}

function getPrimarySourceAddress(detail: ReconciliationDetail) {
  return detail.linkedObservedPayment?.sourceWallet
    ?? detail.linkedObservedTransfers.find((item) => item.sourceWallet)?.sourceWallet
    ?? detail.sourceWorkspaceAddress?.address
    ?? null;
}

function getPrimaryDestinationAddress(detail: ReconciliationDetail) {
  return detail.linkedObservedPayment?.destinationWallet
    ?? detail.linkedObservedTransfers.find((item) => item.destinationWallet)?.destinationWallet
    ?? detail.destination?.walletAddress
    ?? detail.destinationWorkspaceAddress?.address
    ?? null;
}

function getPrimarySettlementTime(detail: ReconciliationDetail) {
  return detail.match?.matchedAt
    ?? detail.linkedObservedPayment?.eventTime
    ?? detail.observedExecutionTransaction?.eventTime
    ?? detail.linkedObservedTransfers[0]?.eventTime
    ?? detail.requestedAt;
}

function formatUsdcUsdBadge(amountRaw: string) {
  const decimal = Number(formatRawUsdc(amountRaw));
  if (!Number.isFinite(decimal)) {
    return '$0.00';
  }

  return `$${decimal.toFixed(2)}`;
}

function getCompletionHeadline(detail: ReconciliationDetail) {
  if (detail.exceptions.some((item) => item.reasonCode === 'partial_settlement' && item.status !== 'dismissed')) {
    return 'Partial settlement';
  }

  switch (detail.requestDisplayState) {
    case 'matched':
      return 'Completed';
    case 'exception':
      return 'Needs review';
    case 'partial':
      return 'Partial match';
    case 'pending':
    default:
      return 'Waiting for settlement';
  }
}

function getCompletionSubtext(detail: ReconciliationDetail) {
  const parts: string[] = [];

  if (detail.approvalState === 'approved') {
    parts.push('Auto-approved');
  } else {
    parts.push(getApprovalStateLabel(detail.approvalState));
  }

  if (detail.match?.chainToMatchMs !== null && detail.match?.chainToMatchMs !== undefined) {
    parts.push(`matched onchain in ${detail.match.chainToMatchMs} ms`);
  } else if (detail.match) {
    parts.push('matched onchain');
  } else if (detail.requestDisplayState === 'pending') {
    parts.push('not settled yet');
  } else if (detail.requestDisplayState === 'exception') {
    parts.push('operator review needed');
  }

  return parts.join(' // ');
}

function getRouteLabel(transfer: ObservedTransfer) {
  if (transfer.innerInstructionIndex !== null && transfer.instructionIndex !== null) {
    return `ix ${transfer.instructionIndex}.${transfer.innerInstructionIndex}`;
  }

  if (transfer.instructionIndex !== null) {
    return `ix ${transfer.instructionIndex}`;
  }

  return 'derived';
}

function getObservedTransferTypeLabel(legRole: string) {
  switch (legRole) {
    case 'direct_settlement':
      return 'direct settlement';
    case 'other_destination':
      return 'other route';
    case 'self_change':
      return 'self change';
    case 'unknown':
      return 'unclassified';
    default:
      return legRole.replaceAll('_', ' ');
  }
}

function getObservedPaymentKindLabel(paymentKind: string) {
  switch (paymentKind) {
    case 'direct':
      return 'direct';
    case 'multi_leg_settlement':
      return 'multi-leg settlement';
    case 'multi_destination_route':
      return 'multi-destination route';
    case 'routed_with_fee':
      return 'multi-destination route';
    default:
      return paymentKind.replaceAll('_', ' ');
  }
}

function getDisplayStateLabel(
  row: Pick<ReconciliationRow, 'requestDisplayState' | 'match' | 'exceptions'>,
) {
  if (row.exceptions.some((item) => item.reasonCode === 'partial_settlement' && item.status !== 'dismissed')) {
    return 'partial settlement';
  }

  switch (row.requestDisplayState) {
    case 'matched':
      return 'matched';
    case 'partial':
      return 'partial match';
    case 'exception':
      return 'needs review';
    case 'pending':
    default:
      return 'waiting for settlement';
  }
}

function getDisplayStateLabelFromState(state: ReconciliationRow['requestDisplayState']) {
  switch (state) {
    case 'matched':
      return 'matched';
    case 'partial':
      return 'partial match';
    case 'exception':
      return 'needs review';
    case 'pending':
    default:
      return 'waiting for settlement';
  }
}

function getExceptionActionLabel(action: string) {
  switch (action) {
    case 'dismissed':
      return 'dismiss exception';
    case 'expected':
      return 'mark expected';
    case 'reviewed':
      return 'mark reviewed';
    case 'reopen':
      return 'reopen exception';
    default:
      return formatLabel(action);
  }
}

function getTimelineTitle(item: ReconciliationDetail['timeline'][number]) {
  switch (item.timelineType) {
    case 'request_event':
      if (item.eventType === 'execution_created') {
        return 'execution created';
      }
      if (item.eventType === 'execution_signature_attached') {
        return 'signature attached';
      }
      if (item.eventType === 'execution_state_changed') {
        return 'execution state changed';
      }
      return formatLabel(item.eventType);
    case 'request_note':
      return 'request note';
    case 'approval_decision':
      return getApprovalActionLabel(item.action);
    case 'execution_record':
      return getExecutionStateLabel(item.state);
    case 'observed_execution':
      return 'observed execution';
    case 'match_result':
      return formatLabel(item.matchStatus);
    case 'exception':
      return getExceptionReasonLabel(item.reasonCode);
  }
}

function getTimelineBody(item: ReconciliationDetail['timeline'][number]) {
  switch (item.timelineType) {
    case 'request_event':
      if (item.eventType === 'execution_signature_attached') {
        return item.linkedSignature
          ? `Attached submitted signature ${shortenAddress(item.linkedSignature, 8, 8)}`
          : 'Attached a submitted signature.';
      }
      if (item.eventType === 'execution_created' || item.eventType === 'execution_state_changed') {
        return item.beforeState && item.afterState
          ? `${formatLabel(item.beforeState)} -> ${formatLabel(item.afterState)}`
          : formatLabel(item.eventType);
      }
      return item.beforeState && item.afterState
        ? `${formatLabel(item.beforeState)} -> ${formatLabel(item.afterState)}`
        : item.eventSource;
    case 'request_note':
      return item.body;
    case 'approval_decision':
      return item.comment ?? getApprovalDecisionSummary(item.action);
    case 'execution_record':
      return item.submittedSignature
        ? `${getExecutionStateLabel(item.state)} // ${shortenAddress(item.submittedSignature, 8, 8)}`
        : `${getExecutionStateLabel(item.state)} // ${formatLabel(item.executionSource)}`;
    case 'observed_execution':
      return `${shortenAddress(item.signature, 8, 8)} // slot ${item.slot} // ${formatLabel(item.status)}`;
    case 'match_result':
      return item.explanation;
    case 'exception':
      return item.explanation;
  }
}

function formatLatency(value: number | null) {
  return value === null ? 'n/a' : `${Math.round(value)} ms`;
}

async function handleMetadataSubmit(
  event: FormEvent<HTMLFormElement>,
  onSubmit: (input: {
    assignedToUserId?: string | null;
    resolutionCode?: string | null;
    severity?: 'info' | 'warning' | 'critical' | null;
    note?: string;
  }) => Promise<void>,
) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const assignedToUserId = String(formData.get('assignedToUserId') ?? '').trim();
  const resolutionCode = String(formData.get('resolutionCode') ?? '').trim();
  const severity = String(formData.get('severity') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  await onSubmit({
    assignedToUserId: assignedToUserId || null,
    resolutionCode: resolutionCode || null,
    severity: (severity || null) as 'info' | 'warning' | 'critical' | null,
    note: note || undefined,
  });
}

async function handleNoteSubmit(
  event: FormEvent<HTMLFormElement>,
  onSubmit: (body: string) => Promise<void>,
) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const body = String(formData.get('body') ?? '').trim();
  if (!body) {
    return;
  }

  await onSubmit(body);
  form.reset();
}
