import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type {
  AuthenticatedSession,
  CreateSquadsTreasuryIntentResponse,
  UserWallet,
} from '../types';
import {
  computeWalletUsdValue,
  formatRawUsdcCompact,
  formatUsd,
  shortenAddress,
  orbAccountUrl,
} from '../domain';
import { useToast } from '../ui/Toast';

const LAMPORTS_PER_SOL = 1_000_000_000n;

function formatSolFromLamports(lamports: string): string {
  let value: bigint;
  try {
    value = BigInt(lamports);
  } catch {
    return '0.0000';
  }
  const whole = value / LAMPORTS_PER_SOL;
  const fractional = value % LAMPORTS_PER_SOL;
  const fractionalPadded = fractional.toString().padStart(9, '0');
  const fourDecimal = fractionalPadded.slice(0, 4);
  return `${whole.toString()}.${fourDecimal}`;
}

function sumUsdc(values: Array<string | null>): string {
  let total = 0n;
  for (const v of values) {
    if (v === null) continue;
    try {
      total += BigInt(v);
    } catch {
      // skip
    }
  }
  return total.toString();
}

function sumSol(values: string[]): string {
  let total = 0n;
  for (const v of values) {
    try {
      total += BigInt(v);
    } catch {
      // skip
    }
  }
  return formatSolFromLamports(total.toString());
}

export function WalletsPage({ session: _session }: { session: AuthenticatedSession }) {
  const { organizationId } = useParams<{ organizationId: string }>();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [createSquadsOpen, setCreateSquadsOpen] = useState(false);

  const balancesQuery = useQuery({
    queryKey: ['treasury-wallet-balances', organizationId] as const,
    queryFn: () => api.listTreasuryWalletBalances(organizationId!),
    enabled: Boolean(organizationId),
    refetchInterval: 15_000,
  });

  // Pulled separately so we can show source-specific UI (Squads badge,
  // multisig PDA secondary text). The balances endpoint omits source /
  // sourceRef / propertiesJson — push those into the balances response
  // backend-side later to drop this round-trip.
  const treasuryWalletsQuery = useQuery({
    queryKey: ['treasury-wallets', organizationId] as const,
    queryFn: () => api.listTreasuryWallets(organizationId!),
    enabled: Boolean(organizationId),
  });
  const treasuryWalletMetaById = useMemo(() => {
    const map = new Map<string, { source: string; sourceRef: string | null }>();
    for (const w of treasuryWalletsQuery.data?.items ?? []) {
      map.set(w.treasuryWalletId, { source: w.source, sourceRef: w.sourceRef });
    }
    return map;
  }, [treasuryWalletsQuery.data]);

  const personalWalletsQuery = useQuery({
    queryKey: ['personal-wallets'] as const,
    queryFn: () => api.listPersonalWallets(),
  });
  const personalWallets = useMemo(
    () =>
      (personalWalletsQuery.data?.items ?? []).filter(
        (w) => w.status === 'active' && w.chain === 'solana',
      ),
    [personalWalletsQuery.data],
  );

  const createMutation = useMutation({
    // Treasury accounts are organization-owned wallets. Their address can
    // be a Squads multisig, a personal wallet the user already has, or any
    // other Solana address the org controls. We do NOT auto-create a Privy
    // wallet here — personal wallets live on the Profile page, and the
    // user can later authorize one of them to act for this treasury via
    // the wallet authorization flow.
    mutationFn: (form: FormData) =>
      api.createTreasuryWallet(organizationId!, {
        address: String(form.get('address') ?? '').trim(),
        displayName: String(form.get('displayName') ?? '').trim() || undefined,
        notes: String(form.get('notes') ?? '').trim() || undefined,
      }),
    onSuccess: async () => {
      success('Treasury account added.');
      setAddOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['treasury-wallet-balances', organizationId] });
      await queryClient.invalidateQueries({ queryKey: ['addresses', organizationId] });
    },
    onError: (err) => toastError(err instanceof Error ? err.message : 'Unable to add treasury account.'),
  });

  const rows = balancesQuery.data?.items ?? [];
  const solUsdPrice = balancesQuery.data?.solUsdPrice ?? null;
  const totalUsdcRaw = useMemo(() => sumUsdc(rows.map((r) => r.usdcRaw)), [rows]);
  const totalSol = useMemo(() => sumSol(rows.map((r) => r.solLamports)), [rows]);
  const totalUsdValue = useMemo(
    () =>
      rows.reduce(
        (acc, row) =>
          acc
          + computeWalletUsdValue({
            usdcRaw: row.usdcRaw,
            solLamports: row.solLamports,
            solUsdPrice,
          }),
        0,
      ),
    [rows, solUsdPrice],
  );
  const fetchedAt = balancesQuery.data?.fetchedAt;
  const isInitialLoading = balancesQuery.isLoading && rows.length === 0;

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

  return (
    <main className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">Registry</p>
          <h1>Treasury accounts</h1>
          <p>
            {solUsdPrice === null
              ? 'Organization-owned Solana wallets that Decimal monitors and reconciles. Balances refresh every 15 seconds.'
              : `Organization-owned Solana wallets that Decimal monitors and reconciles · SOL @ $${formatUsd(solUsdPrice)} · refreshes every 15s.`}
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => balancesQuery.refetch()}
            disabled={balancesQuery.isFetching}
            aria-busy={balancesQuery.isFetching}
          >
            <RefreshIcon spinning={balancesQuery.isFetching} />
            {balancesQuery.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="button button-secondary" onClick={() => setAddOpen(true)}>
            + Add existing address
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setCreateSquadsOpen(true)}
          >
            + Create Squads treasury
          </button>
        </div>
      </header>

      <div className="rd-metrics">
        <div className="rd-metric">
          <span className="rd-metric-label">Total value</span>
          <span className="rd-metric-value">${formatUsd(totalUsdValue)}</span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Total USDC</span>
          <span className="rd-metric-value">{formatRawUsdcCompact(totalUsdcRaw)}</span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Total SOL</span>
          <span className="rd-metric-value">{totalSol}</span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Wallets</span>
          <span className="rd-metric-value">{rows.length}</span>
        </div>
      </div>

      <section className="rd-section" style={{ marginTop: 8 }}>
        <div className="rd-table-shell">
          {isInitialLoading ? (
            <div style={{ padding: 16 }}>
              <div className="rd-skeleton rd-skeleton-block" style={{ height: 56, marginBottom: 8 }} />
              <div className="rd-skeleton rd-skeleton-block" style={{ height: 56, marginBottom: 8 }} />
              <div className="rd-skeleton rd-skeleton-block" style={{ height: 56 }} />
            </div>
          ) : rows.length === 0 ? (
            <div className="rd-empty-cell" style={{ padding: '64px 24px' }}>
              <strong>Add an organization treasury account</strong>
              <p style={{ margin: '0 0 16px' }}>
                This is the wallet Decimal monitors and reconciles. Personal signing wallets live on your profile.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setCreateSquadsOpen(true)}
                >
                  + Create Squads treasury
                </button>
                <button type="button" className="button button-secondary" onClick={() => setAddOpen(true)}>
                  + Add existing address
                </button>
              </div>
            </div>
          ) : (
            <table className="rd-table">
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>Name</th>
                  <th style={{ width: '20%' }}>Address</th>
                  <th className="rd-num" style={{ width: '16%' }}>
                    USDC
                  </th>
                  <th className="rd-num" style={{ width: '14%' }}>
                    SOL
                  </th>
                  <th className="rd-num" style={{ width: '18%' }}>
                    Total value
                  </th>
                  <th style={{ width: '12%' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const meta = treasuryWalletMetaById.get(row.treasuryWalletId);
                  const isSquads = meta?.source === 'squads_v4';
                  const multisigPda = isSquads ? meta?.sourceRef : null;
                  return (
                  <tr key={row.treasuryWalletId}>
                    <td>
                      <div className="rd-payee-main">
                        <span className="rd-payee-name" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {row.displayName ?? 'Untitled wallet'}
                          {isSquads ? (
                            <span
                              className="rd-pill rd-pill-info"
                              style={{ fontSize: 10, padding: '2px 8px' }}
                              title="Backed by a Squads v4 multisig"
                            >
                              Squads
                            </span>
                          ) : null}
                        </span>
                        {row.rpcError ? (
                          <span className="rd-payee-ref" style={{ color: 'var(--ax-warning)' }}>
                            {row.rpcError}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <a
                        href={orbAccountUrl(row.address)}
                        target="_blank"
                        rel="noreferrer"
                        className="rd-addr-link"
                        title={row.address}
                      >
                        <span>{shortenAddress(row.address, 4, 4)}</span>
                        <ExternalIcon />
                      </a>
                      {multisigPda ? (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--ax-text-muted)',
                            marginTop: 2,
                            fontFamily: 'monospace',
                          }}
                          title={`Multisig PDA: ${multisigPda}`}
                        >
                          multisig {shortenAddress(multisigPda, 4, 4)}
                        </div>
                      ) : null}
                    </td>
                    <td className="rd-num">
                      {row.usdcRaw === null ? (
                        <span style={{ color: 'var(--ax-text-faint)' }}>—</span>
                      ) : (
                        <span>{formatRawUsdcCompact(row.usdcRaw)} USDC</span>
                      )}
                    </td>
                    <td className="rd-num">{formatSolFromLamports(row.solLamports)} SOL</td>
                    <td className="rd-num">
                      <span>
                        $
                        {formatUsd(
                          computeWalletUsdValue({
                            usdcRaw: row.usdcRaw,
                            solLamports: row.solLamports,
                            solUsdPrice,
                          }),
                        )}
                      </span>
                    </td>
                    <td>
                      <span className="rd-pill" data-tone={row.isActive ? 'success' : undefined}>
                        <span className="rd-pill-dot" aria-hidden />
                        {row.isActive ? 'Active' : 'Inactive'}
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

      {addOpen ? (
        <AddWalletDialog
          pending={createMutation.isPending}
          onClose={() => setAddOpen(false)}
          onSubmit={(form) => createMutation.mutate(form)}
        />
      ) : null}

      {createSquadsOpen ? (
        <CreateSquadsTreasuryDialog
          organizationId={organizationId!}
          personalWallets={personalWallets}
          personalWalletsLoading={personalWalletsQuery.isLoading}
          onClose={() => setCreateSquadsOpen(false)}
          onError={(message) => toastError(message)}
          onConfirmed={async () => {
            success('Squads treasury created.');
            setCreateSquadsOpen(false);
            await queryClient.invalidateQueries({ queryKey: ['treasury-wallet-balances', organizationId] });
            await queryClient.invalidateQueries({ queryKey: ['treasury-wallets', organizationId] });
          }}
        />
      ) : null}
    </main>
  );
}

function AddWalletDialog(props: {
  pending: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  const { pending, onClose, onSubmit } = props;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="rd-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rd-add-wallet-title"
    >
      <div className="rd-dialog" style={{ maxWidth: 480 }}>
        <h2 id="rd-add-wallet-title" className="rd-dialog-title">
          Add treasury account
        </h2>
        <p className="rd-dialog-body">
          Register an organization-owned Solana wallet. This can be a Squads multisig, an existing wallet, or any address the organization controls. Decimal will monitor balances and reconcile against it.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(new FormData(e.currentTarget));
          }}
        >
          <label className="field">
            Account name
            <input name="displayName" placeholder="Ops vault" autoComplete="off" autoFocus />
          </label>
          <label className="field">
            Solana address
            <input name="address" required placeholder="Wallet address" autoComplete="off" />
          </label>
          <label className="field">
            Notes
            <input name="notes" placeholder="Optional context" autoComplete="off" />
          </label>
          <div className="rd-dialog-actions" style={{ marginTop: 20 }}>
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={pending} aria-busy={pending}>
              {pending ? 'Adding…' : 'Add treasury account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// CreateSquadsTreasuryDialog
//
// MVP scope: 1-of-1 Squads treasury where the only signer is the current
// user's personal wallet. Multi-member, custom threshold, and custom
// permissions are deferred to a later tranche — see
// docs/frontend-squads-treasury-handoff.md.
//
// Flow:
//   no-personal-wallet -> empty-state CTA to /profile
//   config -> name + creator wallet (auto-selected if 1 personal wallet)
//   review -> backend create-intent fetched; show multisig PDA, vault PDA,
//             required signer, members
//   sign-confirm -> placeholder. Real signing requires a backend
//     "sign-with-Privy" endpoint that doesn't exist yet — frontend has no
//     Privy SDK. Once codex ships that endpoint, this step becomes:
//       1) POST to that endpoint with the serialized tx
//       2) submit signed bytes to chain
//       3) confirmSquadsTreasury(signature, ...intent identifiers)
//       4) onConfirmed() to close + invalidate queries
function CreateSquadsTreasuryDialog(props: {
  organizationId: string;
  personalWallets: UserWallet[];
  personalWalletsLoading: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onConfirmed: () => Promise<void> | void;
}) {
  const { organizationId, personalWallets, personalWalletsLoading, onClose, onError } = props;
  const navigate = useNavigate();
  const [step, setStep] = useState<'config' | 'review' | 'sign'>('config');
  const [name, setName] = useState('');
  const [creatorWalletId, setCreatorWalletId] = useState('');
  const [pendingIntent, setPendingIntent] = useState<CreateSquadsTreasuryIntentResponse | null>(null);

  // Auto-select the only wallet if exactly one exists.
  useEffect(() => {
    if (!creatorWalletId && personalWallets.length === 1) {
      setCreatorWalletId(personalWallets[0].userWalletId);
    }
  }, [personalWallets, creatorWalletId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const intentMutation = useMutation({
    mutationFn: () => {
      if (!creatorWalletId) {
        throw new Error('Pick a personal wallet to act as the Squads creator.');
      }
      return api.createSquadsTreasuryIntent(organizationId, {
        displayName: name.trim() || null,
        creatorPersonalWalletId: creatorWalletId,
        threshold: 1,
        members: [
          {
            personalWalletId: creatorWalletId,
            permissions: ['initiate', 'vote', 'execute'],
          },
        ],
      });
    },
    onSuccess: (response) => {
      setPendingIntent(response);
      setStep('review');
    },
    onError: (err) => onError(err instanceof Error ? err.message : 'Could not prepare Squads transaction.'),
  });

  // Empty state: user has no personal wallet -> can't create a Squads
  // treasury at all (need at least one signer).
  if (!personalWalletsLoading && personalWallets.length === 0) {
    return (
      <DialogShell labelledBy="rd-squads-empty-title" onClose={onClose}>
        <h2 id="rd-squads-empty-title" className="rd-dialog-title">
          Create your signing wallet first
        </h2>
        <p className="rd-dialog-body">
          A Squads treasury needs at least one personal wallet as a member. Create a Privy signing wallet on your profile, then come back here.
        </p>
        <div className="rd-dialog-actions" style={{ marginTop: 20 }}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              onClose();
              navigate('/profile');
            }}
          >
            Go to profile →
          </button>
        </div>
      </DialogShell>
    );
  }

  const intent = pendingIntent?.intent;
  const tx = pendingIntent?.transaction;
  const requiredSignerWallet =
    tx && personalWallets.find((w) => w.walletAddress === tx.requiredSigner);

  return (
    <DialogShell labelledBy="rd-squads-title" onClose={onClose}>
      {step === 'config' ? (
        <>
          <h2 id="rd-squads-title" className="rd-dialog-title">
            Create Squads treasury
          </h2>
          <p className="rd-dialog-body">
            Create an organization treasury controlled by selected member wallets. Decimal will monitor the Squads vault and use it as the source wallet for payments.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              intentMutation.mutate();
            }}
          >
            <label className="field">
              Treasury name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ops treasury"
                autoComplete="off"
                autoFocus
              />
            </label>
            <label className="field">
              Creator wallet
              <select
                value={creatorWalletId}
                onChange={(e) => setCreatorWalletId(e.target.value)}
                required
                disabled={personalWallets.length === 1}
              >
                {personalWallets.length === 0 ? (
                  <option value="">Loading…</option>
                ) : null}
                {personalWallets.map((w) => (
                  <option key={w.userWalletId} value={w.userWalletId}>
                    {(w.label ?? 'Untitled')} · {shortenAddress(w.walletAddress, 4, 4)}
                  </option>
                ))}
              </select>
            </label>
            <p style={{ fontSize: 12, color: 'var(--ax-text-muted)', margin: '4px 0 16px' }}>
              MVP default: 1-of-1 Squads multisig. The selected wallet is the only signer with all permissions (initiate, vote, execute). Multi-member treasuries land in a later tranche.
            </p>
            <div className="rd-dialog-actions" style={{ marginTop: 20 }}>
              <button type="button" className="button button-secondary" onClick={onClose} disabled={intentMutation.isPending}>
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={!creatorWalletId || intentMutation.isPending}
                aria-busy={intentMutation.isPending}
              >
                {intentMutation.isPending ? 'Preparing…' : 'Prepare transaction'}
              </button>
            </div>
          </form>
        </>
      ) : step === 'review' && intent && tx ? (
        <>
          <h2 id="rd-squads-title" className="rd-dialog-title">
            Review Squads treasury
          </h2>
          <p className="rd-dialog-body">
            Verify the prepared multisig before signing. Decimal will persist the vault PDA as the treasury address and the multisig PDA as the source reference.
          </p>
          <div className="rd-form-grid" style={{ gap: 12 }}>
            <SquadsReviewRow label="Treasury name" value={intent.displayName || '(unnamed)'} />
            <SquadsReviewRow
              label="Threshold"
              value={`${intent.threshold} of ${intent.members.length}`}
            />
            <SquadsReviewRow
              label="Required signer"
              value={
                <span style={{ fontFamily: 'monospace' }}>
                  {shortenAddress(tx.requiredSigner, 6, 6)}
                  {requiredSignerWallet ? (
                    <span style={{ color: 'var(--ax-text-muted)', marginLeft: 8 }}>
                      ({requiredSignerWallet.label ?? 'this wallet'})
                    </span>
                  ) : null}
                </span>
              }
            />
            <SquadsReviewRow
              label="Multisig address"
              value={<span style={{ fontFamily: 'monospace' }}>{shortenAddress(intent.multisigPda, 6, 6)}</span>}
            />
            <SquadsReviewRow
              label="Treasury vault"
              value={<span style={{ fontFamily: 'monospace' }}>{shortenAddress(intent.vaultPda, 6, 6)}</span>}
            />
            <SquadsReviewRow
              label="Members"
              value={
                <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.6 }}>
                  {intent.members.map((m) => (
                    <li key={m.personalWalletId} style={{ fontSize: 13 }}>
                      <span style={{ fontFamily: 'monospace' }}>{shortenAddress(m.walletAddress, 4, 4)}</span>
                      <span style={{ color: 'var(--ax-text-muted)', marginLeft: 8 }}>
                        {m.permissions.join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              }
            />
          </div>
          <div className="rd-dialog-actions" style={{ marginTop: 20 }}>
            <button type="button" className="button button-secondary" onClick={() => setStep('config')}>
              Back
            </button>
            <button type="button" className="button button-primary" onClick={() => setStep('sign')}>
              Sign and create
            </button>
          </div>
        </>
      ) : step === 'sign' && intent && tx ? (
        <>
          <h2 id="rd-squads-title" className="rd-dialog-title">
            Sign and confirm
          </h2>
          <p className="rd-dialog-body">
            The Squads transaction is prepared and partially signed by Decimal. Sign with the required personal wallet, submit to chain, and Decimal persists the new treasury.
          </p>
          <div
            style={{
              padding: 12,
              border: '1px dashed var(--ax-warning)',
              borderRadius: 6,
              background: 'var(--ax-surface-1)',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ display: 'block', marginBottom: 4 }}>Signing not yet wired</strong>
            <span style={{ color: 'var(--ax-text-muted)' }}>
              Personal wallets are Privy server-managed and the frontend has no Privy SDK. The next backend tranche should add an endpoint that signs a serialized VersionedTransaction with the user's Privy wallet — once it exists, this dialog calls it, submits the signed bytes, and finishes with{' '}
              <code>confirmSquadsTreasury</code>.
            </span>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ax-text-muted)', fontFamily: 'monospace' }}>
            createKey: {shortenAddress(intent.createKey, 6, 6)} · multisig:{' '}
            {shortenAddress(intent.multisigPda, 6, 6)} · vault: {shortenAddress(intent.vaultPda, 6, 6)}
          </div>
          <div className="rd-dialog-actions" style={{ marginTop: 20 }}>
            <button type="button" className="button button-secondary" onClick={() => setStep('review')}>
              Back
            </button>
            <button type="button" className="button button-primary" disabled aria-disabled>
              Sign and create (pending backend)
            </button>
          </div>
        </>
      ) : null}
    </DialogShell>
  );
}

function DialogShell(props: {
  labelledBy: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rd-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={props.labelledBy}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="rd-dialog" style={{ maxWidth: 560 }}>
        {props.children}
      </div>
    </div>
  );
}

function SquadsReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr',
        gap: 12,
        alignItems: 'start',
        paddingBottom: 8,
        borderBottom: '1px solid var(--ax-border)',
      }}
    >
      <span style={{ color: 'var(--ax-text-muted)', fontSize: 13 }}>{label}</span>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{
        display: 'inline-block',
        marginRight: 4,
        animation: spinning ? 'rd-spin 900ms linear infinite' : undefined,
      }}
    >
      <path d="M3 10a7 7 0 0 1 12-5l2.5 2.5" />
      <path d="M17 3v4.5h-4.5" />
      <path d="M17 10a7 7 0 0 1-12 5L2.5 12.5" />
      <path d="M3 17v-4.5h4.5" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 3h7v7M13 3 6 10M3 5v8h8" />
    </svg>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return new Date(iso).toLocaleTimeString();
}
