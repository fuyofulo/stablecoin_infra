import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api';
import type {
  AuthenticatedSession,
  SquadsConfigAction,
  SquadsConfigProposal,
  SquadsProposalDecision,
  SquadsProposalListStatusFilter,
  SquadsProposalPendingVoter,
  SquadsProposalStatus,
  TreasuryWallet,
  UserWallet,
} from '../types';
import { orbAccountUrl, shortenAddress } from '../domain';
import { signAndSubmitIntent } from '../lib/squads-pipeline';
import { useToast } from '../ui/Toast';

const STATUS_LABEL: Record<SquadsProposalStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  approved: 'Approved · ready to execute',
  executed: 'Executed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

const STATUS_TONE: Record<SquadsProposalStatus, 'ok' | 'info' | 'warn' | 'danger'> = {
  draft: 'info',
  active: 'info',
  approved: 'ok',
  executed: 'ok',
  cancelled: 'warn',
  rejected: 'danger',
};

export function SquadsProposalsPage({ session }: { session: AuthenticatedSession }) {
  const { organizationId, treasuryWalletId } = useParams<{
    organizationId: string;
    treasuryWalletId: string;
  }>();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();

  const [statusFilter, setStatusFilter] = useState<SquadsProposalListStatusFilter>('pending');
  const [busyTransactionIndex, setBusyTransactionIndex] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'execute' | null>(null);

  const treasuryListQuery = useQuery({
    queryKey: ['treasury-wallets', organizationId] as const,
    queryFn: () => api.listTreasuryWallets(organizationId!),
    enabled: Boolean(organizationId),
  });

  const wallet: TreasuryWallet | undefined = useMemo(
    () => treasuryListQuery.data?.items.find((w) => w.treasuryWalletId === treasuryWalletId),
    [treasuryListQuery.data, treasuryWalletId],
  );

  const ownPersonalWalletsQuery = useQuery({
    queryKey: ['personal-wallets'] as const,
    queryFn: () => api.listPersonalWallets(),
    enabled: Boolean(organizationId && treasuryWalletId),
  });
  const ownPersonalWallets = useMemo(
    () =>
      (ownPersonalWalletsQuery.data?.items ?? []).filter(
        (w) => w.status === 'active' && w.chain === 'solana',
      ),
    [ownPersonalWalletsQuery.data],
  );

  const proposalsQuery = useQuery({
    queryKey: ['squads-config-proposals', organizationId, treasuryWalletId, statusFilter] as const,
    queryFn: () =>
      api.listSquadsConfigProposals(organizationId!, treasuryWalletId!, { status: statusFilter }),
    enabled: Boolean(organizationId && treasuryWalletId),
    refetchInterval: 20_000,
  });

  async function refreshProposals() {
    await queryClient.invalidateQueries({
      queryKey: ['squads-config-proposals', organizationId, treasuryWalletId],
    });
    await queryClient.invalidateQueries({
      queryKey: ['treasury-wallet-detail', organizationId, treasuryWalletId],
    });
  }

  const approveMutation = useMutation({
    mutationFn: async (input: { proposal: SquadsConfigProposal; signerWalletId: string }) => {
      const intent = await api.createSquadsConfigProposalApprovalIntent(
        organizationId!,
        treasuryWalletId!,
        input.proposal.transactionIndex,
        { memberPersonalWalletId: input.signerWalletId },
      );
      return signAndSubmitIntent({ intent, signerPersonalWalletId: input.signerWalletId });
    },
    onSuccess: async () => {
      success('Approval submitted.');
      await refreshProposals();
    },
    onError: (err) => {
      toastError(err instanceof ApiError || err instanceof Error ? err.message : 'Approve failed.');
    },
    onSettled: () => {
      setBusyTransactionIndex(null);
      setBusyAction(null);
    },
  });

  const executeMutation = useMutation({
    mutationFn: async (input: { proposal: SquadsConfigProposal; signerWalletId: string }) => {
      const intent = await api.createSquadsConfigProposalExecuteIntent(
        organizationId!,
        treasuryWalletId!,
        input.proposal.transactionIndex,
        { memberPersonalWalletId: input.signerWalletId },
      );
      const sig = await signAndSubmitIntent({
        intent,
        signerPersonalWalletId: input.signerWalletId,
      });
      // Sync local Decimal state to mirror the on-chain change.
      try {
        await api.syncSquadsTreasuryMembers(organizationId!, treasuryWalletId!);
      } catch {
        // sync failure shouldn't block the success path; the user can re-sync
        // manually from the detail page.
      }
      return sig;
    },
    onSuccess: async () => {
      success('Proposal executed and synced.');
      await refreshProposals();
    },
    onError: (err) => {
      toastError(err instanceof ApiError || err instanceof Error ? err.message : 'Execute failed.');
    },
    onSettled: () => {
      setBusyTransactionIndex(null);
      setBusyAction(null);
    },
  });

  if (!organizationId || !treasuryWalletId) {
    return (
      <main className="page-frame">
        <div className="rd-state">
          <h2 className="rd-state-title">Treasury wallet unavailable</h2>
          <p className="rd-state-body">Pick a treasury wallet from the list.</p>
        </div>
      </main>
    );
  }

  const items = proposalsQuery.data?.items ?? [];
  const proposalsError = proposalsQuery.error;
  const isForbidden =
    proposalsError instanceof ApiError && proposalsError.code === 'not_squads_member';

  return (
    <main className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link
              to={`/organizations/${organizationId}/wallets/${treasuryWalletId}`}
            >
              ← {wallet?.displayName || 'Treasury wallet'}
            </Link>
          </p>
          <h1>Squads proposals</h1>
          <p>
            Pending and historical Squads config proposals for this treasury. Each
            proposal is its own on-chain transaction. Members sign approvals
            independently — no shared blockhash required.
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => proposalsQuery.refetch()}
            disabled={proposalsQuery.isFetching}
            aria-busy={proposalsQuery.isFetching}
          >
            {proposalsQuery.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['pending', 'all', 'closed'] as SquadsProposalListStatusFilter[]).map((filter) => {
          const active = statusFilter === filter;
          return (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                borderRadius: 999,
                border: '1px solid var(--ax-border)',
                background: active ? 'var(--ax-accent-dim)' : 'transparent',
                color: active ? 'var(--ax-accent)' : 'var(--ax-text-muted)',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {filter}
            </button>
          );
        })}
      </div>

      {isForbidden ? (
        <section className="rd-section">
          <div className="rd-empty-cell" style={{ padding: '48px 24px' }}>
            <strong>Not a Squads member</strong>
            <p style={{ margin: 0 }}>
              You're not currently a signer on this Squads treasury, so its
              proposals aren't visible to you.
            </p>
          </div>
        </section>
      ) : proposalsQuery.isLoading ? (
        <section className="rd-section">
          <div className="rd-skeleton rd-skeleton-block" style={{ height: 140, marginBottom: 8 }} />
          <div className="rd-skeleton rd-skeleton-block" style={{ height: 140 }} />
        </section>
      ) : proposalsError ? (
        <section className="rd-section">
          <div className="rd-empty-cell" style={{ padding: '48px 24px' }}>
            <strong>Couldn't load proposals</strong>
            <p style={{ margin: 0 }}>
              {proposalsError instanceof Error
                ? proposalsError.message
                : 'Unknown error.'}
            </p>
          </div>
        </section>
      ) : items.length === 0 ? (
        <section className="rd-section">
          <div className="rd-empty-cell" style={{ padding: '48px 24px' }}>
            <strong>No {statusFilter === 'all' ? '' : statusFilter} proposals</strong>
            <p style={{ margin: 0 }}>
              {statusFilter === 'pending'
                ? 'Open proposals will show up here as they need your approval.'
                : 'Nothing matches this filter.'}
            </p>
          </div>
        </section>
      ) : (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((proposal) => (
            <ProposalCard
              key={proposal.transactionIndex}
              proposal={proposal}
              ownPersonalWallets={ownPersonalWallets}
              currentUserId={session.user.userId}
              busy={busyTransactionIndex === proposal.transactionIndex ? busyAction : null}
              onApprove={(signerWalletId) => {
                setBusyTransactionIndex(proposal.transactionIndex);
                setBusyAction('approve');
                approveMutation.mutate({ proposal, signerWalletId });
              }}
              onExecute={(signerWalletId) => {
                setBusyTransactionIndex(proposal.transactionIndex);
                setBusyAction('execute');
                executeMutation.mutate({ proposal, signerWalletId });
              }}
            />
          ))}
        </section>
      )}
    </main>
  );
}

function ProposalCard({
  proposal,
  ownPersonalWallets,
  currentUserId,
  busy,
  onApprove,
  onExecute,
}: {
  proposal: SquadsConfigProposal;
  ownPersonalWallets: UserWallet[];
  currentUserId: string;
  busy: 'approve' | 'execute' | null;
  onApprove: (signerWalletId: string) => void;
  onExecute: (signerWalletId: string) => void;
}) {
  // Find the user's wallet that's a pending voter on this proposal (if any).
  const pendingVoterWallet = useMemo(() => {
    const ownAddresses = new Set(ownPersonalWallets.map((w) => w.walletAddress));
    const match = proposal.pendingVoters.find(
      (v) =>
        v.personalWallet?.userId === currentUserId
        && ownAddresses.has(v.walletAddress),
    );
    if (!match) return null;
    return ownPersonalWallets.find((w) => w.walletAddress === match.walletAddress) ?? null;
  }, [proposal.pendingVoters, ownPersonalWallets, currentUserId]);

  // Find the user's wallet that has execute permission on this proposal.
  const executeWallet = useMemo(() => {
    const executable = new Set(proposal.canExecuteWalletAddresses);
    return ownPersonalWallets.find((w) => executable.has(w.walletAddress)) ?? null;
  }, [proposal.canExecuteWalletAddresses, ownPersonalWallets]);

  const approvalCount = proposal.approvals.length;
  const isReadyToExecute = proposal.status === 'approved';
  const isClosed =
    proposal.status === 'executed'
    || proposal.status === 'cancelled'
    || proposal.status === 'rejected';

  return (
    <article
      style={{
        border: '1px solid var(--ax-border)',
        borderRadius: 12,
        padding: 16,
        background: 'var(--ax-surface-1)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
            {summarizeActions(proposal.actions)}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--ax-text-muted)', marginTop: 4 }}>
            Tx index #{proposal.transactionIndex} ·{' '}
            <a
              href={orbAccountUrl(proposal.proposalPda)}
              target="_blank"
              rel="noreferrer"
              className="rd-addr-link"
              title={proposal.proposalPda}
            >
              proposal {shortenAddress(proposal.proposalPda, 4, 4)}
            </a>
          </div>
        </div>
        <StatusPill status={proposal.status} />
      </header>

      <ActionsSummary actions={proposal.actions} />

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--ax-text-muted)', marginBottom: 6 }}>
          Approvals: <strong>{approvalCount}</strong> of <strong>{proposal.threshold}</strong> required
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {proposal.approvals.map((decision) => (
            <DecisionPill key={decision.walletAddress} kind="approval" decision={decision} />
          ))}
          {proposal.pendingVoters.map((voter) => (
            <PendingVoterPill key={voter.walletAddress} voter={voter} />
          ))}
          {proposal.rejections.map((decision) => (
            <DecisionPill key={`rej-${decision.walletAddress}`} kind="rejection" decision={decision} />
          ))}
        </div>
      </div>

      {!isClosed ? (
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            marginTop: 16,
            flexWrap: 'wrap',
          }}
        >
          {pendingVoterWallet ? (
            <button
              type="button"
              className="button button-primary"
              onClick={() => onApprove(pendingVoterWallet.userWalletId)}
              disabled={busy !== null}
              aria-busy={busy === 'approve'}
              title={`Approve as ${shortenAddress(pendingVoterWallet.walletAddress, 4, 4)}`}
            >
              {busy === 'approve' ? 'Approving…' : 'Approve'}
            </button>
          ) : null}
          {isReadyToExecute && executeWallet ? (
            <button
              type="button"
              className="button button-primary"
              onClick={() => onExecute(executeWallet.userWalletId)}
              disabled={busy !== null}
              aria-busy={busy === 'execute'}
              title={`Execute as ${shortenAddress(executeWallet.walletAddress, 4, 4)}`}
            >
              {busy === 'execute' ? 'Executing…' : 'Execute proposal'}
            </button>
          ) : null}
          {!pendingVoterWallet && !isReadyToExecute ? (
            <span style={{ fontSize: 12, color: 'var(--ax-text-muted)', alignSelf: 'center' }}>
              Awaiting other signers
            </span>
          ) : null}
          {isReadyToExecute && !executeWallet ? (
            <span style={{ fontSize: 12, color: 'var(--ax-text-muted)', alignSelf: 'center' }}>
              Threshold met. Awaiting execute from a member with execute permission.
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ActionsSummary({ actions }: { actions: SquadsConfigAction[] }) {
  if (actions.length === 0) return null;
  return (
    <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {actions.map((action, idx) => (
        <li
          key={idx}
          style={{
            fontSize: 13,
            padding: '6px 10px',
            border: '1px solid var(--ax-border)',
            borderRadius: 6,
            background: 'var(--ax-surface-2)',
          }}
        >
          {describeAction(action)}
        </li>
      ))}
    </ul>
  );
}

function summarizeActions(actions: SquadsConfigAction[]): string {
  if (actions.length === 0) return 'Empty proposal';
  if (actions.length === 1) return describeAction(actions[0]!);
  return `${describeAction(actions[0]!)} (+ ${actions.length - 1} more)`;
}

function describeAction(action: SquadsConfigAction): string {
  if (action.kind === 'add_member' && 'walletAddress' in action) {
    const perms = (action.permissions ?? []).join('/') || 'no permissions';
    return `Add member ${shortenAddress(action.walletAddress, 4, 4)} with ${perms}`;
  }
  if (action.kind === 'remove_member' && 'walletAddress' in action) {
    return `Remove member ${shortenAddress(action.walletAddress, 4, 4)}`;
  }
  if (action.kind === 'change_threshold' && 'newThreshold' in action) {
    return `Change threshold to ${action.newThreshold}`;
  }
  return action.kind;
}

function StatusPill({ status }: { status: SquadsProposalStatus }) {
  const tone = STATUS_TONE[status];
  const palette = {
    ok: { bg: 'rgba(60, 180, 110, 0.18)', fg: 'rgb(120, 220, 160)' },
    info: { bg: 'rgba(255, 255, 255, 0.06)', fg: 'var(--ax-text-muted)' },
    warn: { bg: 'rgba(220, 170, 60, 0.18)', fg: 'rgb(240, 200, 100)' },
    danger: { bg: 'rgba(220, 80, 80, 0.18)', fg: 'rgb(240, 130, 130)' },
  }[tone];
  return (
    <span
      className="rd-pill"
      style={{
        padding: '4px 10px',
        fontSize: 12,
        background: palette.bg,
        color: palette.fg,
        border: '1px solid transparent',
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function DecisionPill({
  kind,
  decision,
}: {
  kind: 'approval' | 'rejection' | 'cancellation';
  decision: SquadsProposalDecision;
}) {
  const palette = kind === 'approval'
    ? { bg: 'rgba(60, 180, 110, 0.18)', fg: 'rgb(120, 220, 160)', icon: '✓' }
    : kind === 'rejection'
      ? { bg: 'rgba(220, 80, 80, 0.18)', fg: 'rgb(240, 130, 130)', icon: '✗' }
      : { bg: 'rgba(220, 170, 60, 0.18)', fg: 'rgb(240, 200, 100)', icon: '⊘' };
  const name = decision.organizationMembership?.user.displayName
    ?? decision.organizationMembership?.user.email
    ?? shortenAddress(decision.walletAddress, 4, 4);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        fontSize: 12,
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
      }}
      title={decision.walletAddress}
    >
      <span aria-hidden>{palette.icon}</span>
      {name}
    </span>
  );
}

function PendingVoterPill({ voter }: { voter: SquadsProposalPendingVoter }) {
  const name = voter.organizationMembership?.user.displayName
    ?? voter.organizationMembership?.user.email
    ?? shortenAddress(voter.walletAddress, 4, 4);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        fontSize: 12,
        borderRadius: 999,
        background: 'transparent',
        color: 'var(--ax-text-muted)',
        border: '1px dashed var(--ax-border)',
      }}
      title={voter.walletAddress}
    >
      <span aria-hidden>○</span>
      {name}
    </span>
  );
}
