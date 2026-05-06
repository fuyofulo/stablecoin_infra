import { useMemo, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../api';
import type {
  AuthenticatedSession,
  SquadsDetailMember,
  SquadsMemberLinkStatus,
  SquadsPermission,
  SquadsTreasuryDetail,
  TreasuryWallet,
} from '../types';
import { orbAccountUrl, shortenAddress } from '../domain';

type LinkStatusDescriptor = {
  label: string;
  tone: 'ok' | 'info' | 'warn' | 'danger';
  hint: string;
};

const LINK_STATUS: Record<SquadsMemberLinkStatus, LinkStatusDescriptor> = {
  linked: {
    label: 'Linked',
    tone: 'ok',
    hint: 'Active personal wallet, active org member, active wallet authorization.',
  },
  unlinked: {
    label: 'Unlinked',
    tone: 'info',
    hint: 'No personal wallet on Decimal matches this address.',
  },
  wallet_inactive: {
    label: 'Wallet inactive',
    tone: 'warn',
    hint: 'A matching personal wallet exists but is no longer active.',
  },
  not_org_member: {
    label: 'Not in org',
    tone: 'warn',
    hint: 'Personal wallet matches but the user is not an active member of this organization.',
  },
  authorization_missing: {
    label: 'Authorization missing',
    tone: 'warn',
    hint: 'Linked but the local Squads-member wallet authorization is not active.',
  },
};

const PERMISSION_LABEL: Record<SquadsPermission, string> = {
  initiate: 'Initiate',
  vote: 'Vote',
  execute: 'Execute',
};

export function TreasuryWalletDetailPage({ session: _session }: { session: AuthenticatedSession }) {
  const { organizationId, treasuryWalletId } = useParams<{
    organizationId: string;
    treasuryWalletId: string;
  }>();

  const treasuryListQuery = useQuery({
    queryKey: ['treasury-wallets', organizationId] as const,
    queryFn: () => api.listTreasuryWallets(organizationId!),
    enabled: Boolean(organizationId),
  });

  const wallet: TreasuryWallet | undefined = useMemo(
    () =>
      treasuryListQuery.data?.items.find((w) => w.treasuryWalletId === treasuryWalletId),
    [treasuryListQuery.data, treasuryWalletId],
  );

  const isSquads = wallet?.source === 'squads_v4';

  const detailQuery = useQuery({
    queryKey: ['treasury-wallet-detail', organizationId, treasuryWalletId] as const,
    queryFn: () => api.getSquadsTreasuryDetail(organizationId!, treasuryWalletId!),
    enabled: Boolean(organizationId && treasuryWalletId && isSquads),
    refetchInterval: 30_000,
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

  if (treasuryListQuery.isLoading) {
    return (
      <main className="page-frame">
        <div className="rd-skeleton rd-skeleton-block" style={{ height: 56, marginBottom: 8 }} />
        <div className="rd-skeleton rd-skeleton-block" style={{ height: 240 }} />
      </main>
    );
  }

  if (!wallet) {
    return (
      <main className="page-frame">
        <header className="page-header">
          <div>
            <p className="eyebrow">
              <Link to={`/organizations/${organizationId}/wallets`}>← Treasury accounts</Link>
            </p>
            <h1>Treasury wallet not found</h1>
            <p>This wallet doesn't exist in this organization.</p>
          </div>
        </header>
      </main>
    );
  }

  const detail = detailQuery.data;
  const detailError = detailQuery.error;

  return (
    <main className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to={`/organizations/${organizationId}/wallets`}>← Treasury accounts</Link>
          </p>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {wallet.displayName || 'Untitled wallet'}
            {isSquads ? <span className="rd-pill rd-pill-info">Squads</span> : null}
            {!wallet.isActive ? <span className="rd-pill rd-pill-info">Inactive</span> : null}
          </h1>
          <p>
            <a
              href={orbAccountUrl(wallet.address)}
              target="_blank"
              rel="noreferrer"
              className="rd-addr-link"
            >
              {shortenAddress(wallet.address, 6, 6)}
            </a>
            {wallet.notes ? <> · {wallet.notes}</> : null}
          </p>
        </div>
      </header>

      {!isSquads ? (
        <section className="rd-section" style={{ marginTop: 8 }}>
          <div className="rd-empty-cell" style={{ padding: '32px 24px' }}>
            <strong>Externally registered wallet</strong>
            <p style={{ margin: 0 }}>
              This treasury wallet was added by address. Squads-specific detail isn't available.
            </p>
          </div>
        </section>
      ) : detailQuery.isLoading ? (
        <section className="rd-section" style={{ marginTop: 8 }}>
          <div className="rd-skeleton rd-skeleton-block" style={{ height: 180, marginBottom: 8 }} />
          <div className="rd-skeleton rd-skeleton-block" style={{ height: 240 }} />
        </section>
      ) : detailError ? (
        <section className="rd-section" style={{ marginTop: 8 }}>
          <div className="rd-empty-cell" style={{ padding: '32px 24px' }}>
            <strong>Couldn't load Squads detail</strong>
            <p style={{ margin: 0 }}>
              {detailError instanceof ApiError || detailError instanceof Error
                ? detailError.message
                : 'Unknown error.'}
            </p>
          </div>
        </section>
      ) : detail ? (
        <SquadsDetailContent detail={detail} wallet={wallet} />
      ) : null}
    </main>
  );
}

function SquadsDetailContent({
  detail,
  wallet,
}: {
  detail: SquadsTreasuryDetail;
  wallet: TreasuryWallet;
}) {
  const { squads } = detail;

  return (
    <>
      {!squads.localStateMatchesChain ? (
        <section
          className="rd-section"
          style={{
            marginTop: 8,
            border: '1px solid rgba(220, 170, 60, 0.45)',
            borderRadius: 12,
            padding: 16,
            background: 'rgba(220, 170, 60, 0.08)',
          }}
        >
          <strong>Local cache differs from on-chain state.</strong>
          <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.85 }}>
            Some fields on this page were read live from chain. The treasury wallet record will be reconciled the next time the wallet is updated.
          </p>
        </section>
      ) : null}

      <section className="rd-section" style={{ marginTop: 16 }}>
        <header style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Multisig configuration</h2>
        </header>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px 24px',
          }}
        >
          <InfoRow label="Vault PDA">
            <ExplorerAddress value={squads.vaultPda} />
          </InfoRow>
          <InfoRow label="Multisig PDA">
            <ExplorerAddress value={squads.multisigPda} />
          </InfoRow>
          <InfoRow label="Vault index">{squads.vaultIndex}</InfoRow>
          <InfoRow label="Threshold">
            {squads.threshold} of {squads.members.length}
          </InfoRow>
          <InfoRow label="Time lock">
            {squads.timeLockSeconds === 0 ? 'None' : `${squads.timeLockSeconds}s`}
          </InfoRow>
          <InfoRow label="Authority">
            {squads.isAutonomous ? (
              <span title="Multisig governs itself — no external config authority.">Autonomous</span>
            ) : squads.configAuthority ? (
              <ExplorerAddress value={squads.configAuthority} />
            ) : (
              '—'
            )}
          </InfoRow>
          <InfoRow label="Transaction index">
            {squads.transactionIndex}
            {squads.staleTransactionIndex !== '0' ? (
              <span style={{ marginLeft: 8, opacity: 0.7, fontSize: 12 }}>
                (stale ≤ {squads.staleTransactionIndex})
              </span>
            ) : null}
          </InfoRow>
          <InfoRow label="Program">
            <ExplorerAddress value={squads.programId} />
          </InfoRow>
        </div>
      </section>

      <section className="rd-section" style={{ marginTop: 24 }}>
        <header style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Capabilities</h2>
        </header>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <CapabilityPill ok={squads.capabilities.canInitiate} label="Initiate" />
          <CapabilityPill ok={squads.capabilities.canVote} label="Vote" />
          <CapabilityPill ok={squads.capabilities.canExecute} label="Execute" />
        </div>
      </section>

      <section className="rd-section" style={{ marginTop: 24 }}>
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Members</h2>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
            {squads.members.length} on-chain · {squads.members.filter((m) => m.linkStatus === 'linked').length} linked
          </p>
        </header>
        <div className="rd-table-shell">
          <table className="rd-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Address</th>
                <th>Permissions</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {squads.members.map((member) => (
                <MemberRow key={member.walletAddress} member={member} />
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>
          Wallet record last updated {new Date(wallet.updatedAt).toLocaleString()}.
        </p>
      </section>
    </>
  );
}

function MemberRow({ member }: { member: SquadsDetailMember }) {
  const linked = member.organizationMembership;
  const status = LINK_STATUS[member.linkStatus];

  return (
    <tr>
      <td>
        {linked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar
              avatarUrl={linked.user.avatarUrl}
              fallback={linked.user.displayName || linked.user.email}
            />
            <div>
              <div style={{ fontWeight: 500 }}>
                {linked.user.displayName || linked.user.email}
              </div>
              {linked.user.displayName ? (
                <div style={{ fontSize: 12, opacity: 0.7 }}>{linked.user.email}</div>
              ) : null}
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                Org role: {linked.role}
              </div>
            </div>
          </div>
        ) : (
          <span style={{ opacity: 0.7, fontStyle: 'italic' }}>External signer</span>
        )}
      </td>
      <td>
        <a
          href={orbAccountUrl(member.walletAddress)}
          target="_blank"
          rel="noreferrer"
          className="rd-addr-link"
          title={member.walletAddress}
        >
          {shortenAddress(member.walletAddress, 4, 4)}
        </a>
      </td>
      <td>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {member.permissions.length === 0 ? (
            <span style={{ opacity: 0.6 }}>None</span>
          ) : (
            member.permissions.map((p) => (
              <span key={p} className="rd-pill rd-pill-info" style={{ fontSize: 11 }}>
                {PERMISSION_LABEL[p]}
              </span>
            ))
          )}
        </div>
      </td>
      <td>
        <span
          className="rd-pill rd-pill-info"
          title={status.hint}
          style={{
            fontSize: 11,
            background:
              status.tone === 'warn'
                ? 'rgba(220, 170, 60, 0.18)'
                : status.tone === 'danger'
                  ? 'rgba(220, 80, 80, 0.18)'
                  : undefined,
          }}
        >
          {status.label}
        </span>
      </td>
    </tr>
  );
}

function CapabilityPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="rd-pill rd-pill-info"
      style={{
        fontSize: 12,
        opacity: ok ? 1 : 0.45,
      }}
      title={ok ? `At least one member can ${label.toLowerCase()}.` : `No member has ${label.toLowerCase()} permission.`}
    >
      <span className="rd-pill-dot" />
      {label}: {ok ? 'yes' : 'no'}
    </span>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.6 }}>
        {label}
      </span>
      <span style={{ fontSize: 14 }}>{children}</span>
    </div>
  );
}

function ExplorerAddress({ value }: { value: string }) {
  return (
    <a
      href={orbAccountUrl(value)}
      target="_blank"
      rel="noreferrer"
      className="rd-addr-link"
      title={value}
      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
    >
      {shortenAddress(value, 6, 6)}
    </a>
  );
}

function Avatar({ avatarUrl, fallback }: { avatarUrl: string | null; fallback: string }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
      />
    );
  }
  const initials = fallback
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 600,
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
      }}
    >
      {initials || '?'}
    </span>
  );
}
