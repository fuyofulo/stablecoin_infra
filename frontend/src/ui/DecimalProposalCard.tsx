import { useMemo } from 'react';
import { Link } from 'react-router';
import { orbAccountUrl, shortenAddress } from '../domain';
import type {
  DecimalProposal,
  ProposalSemanticType,
  SquadsProposalDecision,
  SquadsProposalPendingVoter,
  SquadsProposalStatus,
  UserWallet,
} from '../types';

const SEMANTIC_LABEL: Record<string, string> = {
  add_member: 'Add member',
  remove_member: 'Remove member',
  change_threshold: 'Change threshold',
  send_payment: 'Payment',
};

const PROPOSAL_TYPE_FALLBACK: Record<string, string> = {
  config_transaction: 'Treasury config',
  vault_transaction: 'Treasury execution',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  prepared: 'Prepared',
  submitted: 'Submitted',
  active: 'Active',
  approved: 'Approved · ready to execute',
  executed: 'Executed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

const STATUS_TONE: Record<string, 'ok' | 'info' | 'warn' | 'danger'> = {
  draft: 'info',
  prepared: 'info',
  submitted: 'info',
  active: 'info',
  approved: 'ok',
  executed: 'ok',
  cancelled: 'warn',
  rejected: 'danger',
};

export function proposalTypeLabel(proposal: Pick<DecimalProposal, 'semanticType' | 'proposalType'>) {
  if (proposal.semanticType && SEMANTIC_LABEL[proposal.semanticType]) {
    return SEMANTIC_LABEL[proposal.semanticType];
  }
  return PROPOSAL_TYPE_FALLBACK[proposal.proposalType] ?? proposal.proposalType;
}

export function summarizeProposal(proposal: DecimalProposal): string {
  const semantic = proposal.semanticType ?? '';
  if (semantic === 'add_member') {
    const payload = proposal.semanticPayloadJson as { walletAddress?: string };
    if (payload?.walletAddress) {
      return `Add member ${shortenAddress(payload.walletAddress, 4, 4)}`;
    }
    return 'Add member';
  }
  if (semantic === 'remove_member') {
    const payload = proposal.semanticPayloadJson as { walletAddress?: string };
    if (payload?.walletAddress) {
      return `Remove member ${shortenAddress(payload.walletAddress, 4, 4)}`;
    }
    return 'Remove member';
  }
  if (semantic === 'change_threshold') {
    const payload = proposal.semanticPayloadJson as { newThreshold?: number };
    if (payload?.newThreshold !== undefined) {
      return `Change threshold to ${payload.newThreshold}`;
    }
    return 'Change threshold';
  }
  if (semantic === 'send_payment') {
    const payload = proposal.semanticPayloadJson as {
      asset?: string;
      amountRaw?: string;
      destinationWalletAddress?: string;
      token?: { decimals?: number; symbol?: string };
    };
    const symbol = payload?.token?.symbol ?? payload?.asset?.toUpperCase() ?? 'tokens';
    const decimals = payload?.token?.decimals ?? 6;
    const amount = formatRawAmount(payload?.amountRaw ?? null, decimals);
    const dest = payload?.destinationWalletAddress
      ? shortenAddress(payload.destinationWalletAddress, 4, 4)
      : null;
    return dest
      ? `Send ${amount} ${symbol} → ${dest}`
      : `Send ${amount} ${symbol}`;
  }
  return proposalTypeLabel(proposal);
}

function formatRawAmount(amountRaw: string | null, decimals: number): string {
  if (!amountRaw) return '?';
  try {
    const value = BigInt(amountRaw);
    if (decimals === 0) return value.toString();
    const scale = 10n ** BigInt(decimals);
    const whole = value / scale;
    const frac = value % scale;
    const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
    return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  } catch {
    return amountRaw;
  }
}

export function DecimalProposalCard({
  proposal,
  ownPersonalWallets,
  currentUserId,
  busy,
  onApprove,
  onExecute,
  detailLinkTo,
  treasuryLinkTo,
  showTreasuryLabel,
}: {
  proposal: DecimalProposal;
  ownPersonalWallets: UserWallet[];
  currentUserId: string;
  busy: 'approve' | 'execute' | null;
  onApprove: (signerWalletId: string) => void;
  onExecute: (signerWalletId: string) => void;
  detailLinkTo?: string | null;
  treasuryLinkTo?: string | null;
  showTreasuryLabel?: boolean;
}) {
  const voting = proposal.voting;
  const treasuryName = proposal.treasuryWallet?.displayName ?? 'Untitled treasury';
  const status = proposal.status;
  const localStatus = proposal.localStatus;

  const pendingVoterWallet = useMemo(() => {
    if (!voting) return null;
    const ownAddresses = new Set(ownPersonalWallets.map((w) => w.walletAddress));
    const match = voting.pendingVoters.find(
      (v) =>
        v.personalWallet?.userId === currentUserId
        && ownAddresses.has(v.walletAddress),
    );
    if (!match) return null;
    return ownPersonalWallets.find((w) => w.walletAddress === match.walletAddress) ?? null;
  }, [voting, ownPersonalWallets, currentUserId]);

  const executeWallet = useMemo(() => {
    if (!voting) return null;
    const executable = new Set(voting.canExecuteWalletAddresses);
    return ownPersonalWallets.find((w) => executable.has(w.walletAddress)) ?? null;
  }, [voting, ownPersonalWallets]);

  const isReadyToExecute = status === 'approved';
  const isClosed = status === 'executed' || status === 'cancelled' || status === 'rejected';
  const approvalCount = voting?.approvals.length ?? 0;
  const threshold = voting?.threshold ?? 0;

  const titleNode = (
    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
      {summarizeProposal(proposal)}
    </h2>
  );

  return (
    <article
      style={{
        border: '1px solid var(--ax-border)',
        borderRadius: 12,
        padding: 16,
        background: 'var(--ax-surface-1)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <TypePill label={proposalTypeLabel(proposal)} />
            {showTreasuryLabel && proposal.treasuryWallet ? (
              treasuryLinkTo ? (
                <Link
                  to={treasuryLinkTo}
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--ax-text-muted)',
                    textDecoration: 'none',
                  }}
                >
                  {treasuryName}
                </Link>
              ) : (
                <span
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--ax-text-muted)',
                  }}
                >
                  {treasuryName}
                </span>
              )
            ) : null}
          </div>
          {detailLinkTo ? (
            <Link to={detailLinkTo} style={{ color: 'inherit', textDecoration: 'none' }}>
              {titleNode}
            </Link>
          ) : (
            titleNode
          )}
          <div style={{ fontSize: 12, color: 'var(--ax-text-muted)', marginTop: 4 }}>
            {proposal.squads.transactionIndex ? (
              <>Tx index #{proposal.squads.transactionIndex} · </>
            ) : null}
            {proposal.squads.proposalPda ? (
              <a
                href={orbAccountUrl(proposal.squads.proposalPda)}
                target="_blank"
                rel="noreferrer"
                className="rd-addr-link"
                title={proposal.squads.proposalPda}
              >
                proposal {shortenAddress(proposal.squads.proposalPda, 4, 4)}
              </a>
            ) : (
              <span>{localStatus}</span>
            )}
            {detailLinkTo ? (
              <>
                {' · '}
                <Link to={detailLinkTo} style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.25)' }}>
                  Open detail
                </Link>
              </>
            ) : null}
          </div>
        </div>
        <StatusPill status={status} />
      </header>

      {voting ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--ax-text-muted)', marginBottom: 6 }}>
            Approvals: <strong>{approvalCount}</strong> of <strong>{threshold}</strong> required
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {voting.approvals.map((decision) => (
              <DecisionPill key={decision.walletAddress} kind="approval" decision={decision} />
            ))}
            {voting.pendingVoters.map((voter) => (
              <PendingVoterPill key={voter.walletAddress} voter={voter} />
            ))}
            {voting.rejections.map((decision) => (
              <DecisionPill key={`rej-${decision.walletAddress}`} kind="rejection" decision={decision} />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ax-text-muted)' }}>
          Voting state not yet available — proposal may still be propagating on chain.
        </div>
      )}

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

export function StatusPill({ status }: { status: SquadsProposalStatus | string }) {
  const tone = STATUS_TONE[status] ?? 'info';
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
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function TypePill({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: '2px 8px',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        borderRadius: 4,
        background: 'rgba(140, 200, 255, 0.12)',
        color: 'rgb(170, 215, 255)',
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

export function DecisionPill({
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

export function PendingVoterPill({ voter }: { voter: SquadsProposalPendingVoter }) {
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

// Re-export for the new detail page; semantic type passes through unchanged.
export type DecimalProposalSemantic = ProposalSemanticType;
