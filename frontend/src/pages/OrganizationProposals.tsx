import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api';
import type {
  AuthenticatedSession,
  DecimalProposal,
  SquadsProposalListStatusFilter,
} from '../types';
import { signAndSubmitIntent } from '../lib/squads-pipeline';
import { useToast } from '../ui/Toast';
import { DecimalProposalCard } from '../ui/DecimalProposalCard';

function CreateOption({
  title,
  body,
  to,
  cta,
}: {
  title: string;
  body: string;
  to: string;
  cta: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <strong style={{ fontSize: 13 }}>{title}</strong>
      <span style={{ fontSize: 12, color: 'var(--ax-text-muted)', lineHeight: 1.5 }}>{body}</span>
      <Link
        to={to}
        style={{
          fontSize: 12,
          color: 'var(--ax-accent)',
          textDecoration: 'none',
          marginTop: 'auto',
        }}
      >
        {cta} →
      </Link>
    </div>
  );
}

type BusyKey = string;

export function OrganizationProposalsPage({ session }: { session: AuthenticatedSession }) {
  const { organizationId } = useParams<{ organizationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();

  const [statusFilter, setStatusFilter] = useState<SquadsProposalListStatusFilter>('pending');
  const [busyKey, setBusyKey] = useState<BusyKey | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'execute' | null>(null);

  const treasuryWalletFilter = searchParams.get('treasuryWalletId') ?? undefined;

  const ownPersonalWalletsQuery = useQuery({
    queryKey: ['personal-wallets'] as const,
    queryFn: () => api.listPersonalWallets(),
    enabled: Boolean(organizationId),
  });
  const ownPersonalWallets = useMemo(
    () =>
      (ownPersonalWalletsQuery.data?.items ?? []).filter(
        (w) => w.status === 'active' && w.chain === 'solana',
      ),
    [ownPersonalWalletsQuery.data],
  );

  const proposalsQuery = useQuery({
    queryKey: [
      'organization-proposals',
      organizationId,
      statusFilter,
      treasuryWalletFilter,
    ] as const,
    queryFn: () =>
      api.listOrganizationProposals(organizationId!, {
        status: statusFilter,
        treasuryWalletId: treasuryWalletFilter,
      }),
    enabled: Boolean(organizationId),
    refetchInterval: 20_000,
  });

  async function refreshProposals(decimalProposalId?: string) {
    await queryClient.invalidateQueries({ queryKey: ['organization-proposals', organizationId] });
    if (decimalProposalId) {
      await queryClient.invalidateQueries({
        queryKey: ['organization-proposal', organizationId, decimalProposalId],
      });
    }
  }

  const approveMutation = useMutation({
    mutationFn: async (input: { proposal: DecimalProposal; signerWalletId: string }) => {
      const intent = await api.createProposalApprovalIntent(
        organizationId!,
        input.proposal.decimalProposalId,
        { memberPersonalWalletId: input.signerWalletId },
      );
      const sig = await signAndSubmitIntent({
        intent,
        signerPersonalWalletId: input.signerWalletId,
      });
      // Approval doesn't have a confirm-step yet on the backend; the next
      // refresh will pull live status from chain.
      return { decimalProposalId: input.proposal.decimalProposalId, signature: sig };
    },
    onSuccess: async (result) => {
      success('Approval submitted.');
      await refreshProposals(result.decimalProposalId);
    },
    onError: (err) => {
      toastError(err instanceof ApiError || err instanceof Error ? err.message : 'Approve failed.');
    },
    onSettled: () => {
      setBusyKey(null);
      setBusyAction(null);
    },
  });

  const executeMutation = useMutation({
    mutationFn: async (input: { proposal: DecimalProposal; signerWalletId: string }) => {
      const decimalProposalId = input.proposal.decimalProposalId;
      const intent = await api.createProposalExecuteIntent(
        organizationId!,
        decimalProposalId,
        { memberPersonalWalletId: input.signerWalletId },
      );
      const sig = await signAndSubmitIntent({
        intent,
        signerPersonalWalletId: input.signerWalletId,
      });
      try {
        await api.confirmProposalExecution(organizationId!, decimalProposalId, { signature: sig });
      } catch {
        // Confirm failure is recoverable — local status will catch up via the
        // 20s refetch or next approve/execute cycle.
      }
      // Sync Squads members for config_transactions so the local Decimal
      // authorization table reflects the new on-chain config.
      if (input.proposal.proposalType === 'config_transaction' && input.proposal.treasuryWalletId) {
        try {
          await api.syncSquadsTreasuryMembers(organizationId!, input.proposal.treasuryWalletId);
        } catch {
          // ignore
        }
      }
      return { decimalProposalId, signature: sig };
    },
    onSuccess: async (result) => {
      success('Proposal executed.');
      await refreshProposals(result.decimalProposalId);
      await queryClient.invalidateQueries({
        queryKey: ['treasury-wallet-detail', organizationId],
      });
    },
    onError: (err) => {
      toastError(err instanceof ApiError || err instanceof Error ? err.message : 'Execute failed.');
    },
    onSettled: () => {
      setBusyKey(null);
      setBusyAction(null);
    },
  });

  if (!organizationId) {
    return (
      <main className="page-frame">
        <div className="rd-state">
          <h2 className="rd-state-title">Organization unavailable</h2>
          <p className="rd-state-body">Pick an organization from the sidebar.</p>
        </div>
      </main>
    );
  }

  const items = proposalsQuery.data?.items ?? [];
  const treasuryFilterApplied = Boolean(treasuryWalletFilter);

  return (
    <main className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Proposals</h1>
          <p>
            Squads config and payment proposals across every treasury you sign for in this organization. Each proposal is its own on-chain transaction; sign approvals independently.
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

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginBottom: 16,
          padding: 14,
          border: '1px dashed var(--ax-border)',
          borderRadius: 12,
          background: 'rgba(140, 200, 255, 0.04)',
        }}
      >
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--ax-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          Create a proposal
        </div>
        <CreateOption
          title="Send a Squads payment"
          body="Open a payment order whose source is a Squads treasury, then click 'Create Squads proposal'."
          to={`/organizations/${organizationId}/payments`}
          cta="Go to payments"
        />
        <CreateOption
          title="Add a member"
          body="From a Squads treasury's detail page, use '+ Add member'."
          to={`/organizations/${organizationId}/wallets`}
          cta="Go to treasury accounts"
        />
        <CreateOption
          title="Change threshold"
          body="From a Squads treasury's detail page, use 'Change threshold'."
          to={`/organizations/${organizationId}/wallets`}
          cta="Go to treasury accounts"
        />
      </section>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
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
        {treasuryFilterApplied ? (
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('treasuryWalletId');
              setSearchParams(next, { replace: true });
            }}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              borderRadius: 999,
              border: '1px dashed var(--ax-border)',
              background: 'rgba(140, 200, 255, 0.08)',
              color: 'var(--ax-text-muted)',
              cursor: 'pointer',
            }}
            title="Clear treasury filter"
          >
            ✕ Treasury filter
          </button>
        ) : null}
      </div>

      {proposalsQuery.isLoading ? (
        <section className="rd-section">
          <div className="rd-skeleton rd-skeleton-block" style={{ height: 140, marginBottom: 8 }} />
          <div className="rd-skeleton rd-skeleton-block" style={{ height: 140 }} />
        </section>
      ) : proposalsQuery.error ? (
        <section className="rd-section">
          <div className="rd-empty-cell" style={{ padding: '48px 24px' }}>
            <strong>Couldn't load proposals</strong>
            <p style={{ margin: 0 }}>
              {proposalsQuery.error instanceof Error
                ? proposalsQuery.error.message
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
                ? "When a proposal needs your signature, it'll show up here."
                : 'Nothing matches this filter.'}
            </p>
          </div>
        </section>
      ) : (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((proposal) => {
            const key: BusyKey = proposal.decimalProposalId;
            const treasuryLink = proposal.treasuryWalletId
              ? `/organizations/${organizationId}/wallets/${proposal.treasuryWalletId}`
              : null;
            return (
              <DecimalProposalCard
                key={key}
                proposal={proposal}
                ownPersonalWallets={ownPersonalWallets}
                currentUserId={session.user.userId}
                busy={busyKey === key ? busyAction : null}
                detailLinkTo={`/organizations/${organizationId}/proposals/${proposal.decimalProposalId}`}
                treasuryLinkTo={treasuryLink}
                showTreasuryLabel={!treasuryFilterApplied}
                onApprove={(signerWalletId) => {
                  setBusyKey(key);
                  setBusyAction('approve');
                  approveMutation.mutate({ proposal, signerWalletId });
                }}
                onExecute={(signerWalletId) => {
                  setBusyKey(key);
                  setBusyAction('execute');
                  executeMutation.mutate({ proposal, signerWalletId });
                }}
              />
            );
          })}
        </section>
      )}
    </main>
  );
}
