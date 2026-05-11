import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type {
  AuthenticatedSession,
  CounterpartyWallet,
  CounterpartyWalletTrustState,
} from '../types';
import { useToast } from '../ui/Toast';
import { ChainLink, EmptyIcon, RdEmptyState, RdFilterBar } from '../ui-primitives';

type TrustFilter = 'all' | CounterpartyWalletTrustState;

function trustTone(
  t: CounterpartyWalletTrustState,
): 'success' | 'warning' | 'danger' | 'info' {
  if (t === 'trusted') return 'success';
  if (t === 'blocked' || t === 'restricted') return 'danger';
  if (t === 'unreviewed') return 'warning';
  return 'info';
}

export function CounterpartiesPage({ session: _session }: { session: AuthenticatedSession }) {
  const { organizationId } = useParams<{ organizationId: string }>();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<CounterpartyWallet | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TrustFilter>('all');

  const walletsQuery = useQuery({
    queryKey: ['counterparty-wallets', organizationId] as const,
    queryFn: () => api.listCounterpartyWallets(organizationId!),
    enabled: Boolean(organizationId),
  });

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['counterparty-wallets', organizationId] });
  }

  const createMutation = useMutation({
    mutationFn: (input: {
      label: string;
      walletAddress: string;
      trustState: CounterpartyWalletTrustState;
      notes?: string;
    }) =>
      api.createCounterpartyWallet(organizationId!, {
        label: input.label,
        walletAddress: input.walletAddress,
        trustState: input.trustState,
        notes: input.notes,
      }),
    onSuccess: async () => {
      success('Wallet saved.');
      setAddOpen(false);
      await invalidate();
    },
    onError: (err) => toastError(err instanceof Error ? err.message : 'Unable to save wallet.'),
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      counterpartyWalletId: string;
      label: string;
      trustState: CounterpartyWalletTrustState;
      notes: string | null;
    }) =>
      api.updateCounterpartyWallet(organizationId!, input.counterpartyWalletId, {
        label: input.label,
        trustState: input.trustState,
        notes: input.notes,
      }),
    onSuccess: async () => {
      success('Wallet updated.');
      setEditing(null);
      await invalidate();
    },
    onError: (err) => toastError(err instanceof Error ? err.message : 'Unable to update wallet.'),
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

  const wallets = (walletsQuery.data?.items ?? []).filter((w) => w.isActive);

  const filteredWallets = useMemo(() => {
    let out = wallets;
    if (filter !== 'all') out = out.filter((w) => w.trustState === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (w) =>
          w.label.toLowerCase().includes(q) || w.walletAddress.toLowerCase().includes(q),
      );
    }
    return out
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [wallets, search, filter]);

  const trusted = wallets.filter((w) => w.trustState === 'trusted').length;
  const unreviewed = wallets.filter((w) => w.trustState === 'unreviewed').length;
  const restrictedOrBlocked = wallets.filter(
    (w) => w.trustState === 'blocked' || w.trustState === 'restricted',
  ).length;

  const isLoading = walletsQuery.isLoading;

  return (
    <main className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">Address book</p>
          <h1>Wallet addresses</h1>
          <p>
            Solana wallets you transact with — vendors, contractors, customers, your own. Trust
            state gates whether transfers can execute against an entry.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-primary" onClick={() => setAddOpen(true)}>
            + Add wallet
          </button>
        </div>
      </header>

      <div className="rd-metrics">
        <div className="rd-metric">
          <span className="rd-metric-label">Total</span>
          <span className="rd-metric-value">{wallets.length}</span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Unreviewed</span>
          <span className="rd-metric-value" data-tone={unreviewed > 0 ? 'warning' : undefined}>
            {unreviewed}
          </span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Trusted</span>
          <span className="rd-metric-value" data-tone="success">
            {trusted}
          </span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Restricted / blocked</span>
          <span
            className="rd-metric-value"
            data-tone={restrictedOrBlocked > 0 ? 'danger' : undefined}
          >
            {restrictedOrBlocked}
          </span>
        </div>
      </div>

      <RdFilterBar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Search label or wallet address',
          ariaLabel: 'Search wallets',
        }}
        tabs={(['all', 'unreviewed', 'trusted', 'restricted', 'blocked'] as const).map((key) => ({
          id: key,
          label: key === 'all' ? 'All' : key.charAt(0).toUpperCase() + key.slice(1),
          active: filter === key,
          onClick: () => setFilter(key),
        }))}
        rightMeta={`${filteredWallets.length} of ${wallets.length}`}
      />

      <section className="rd-section" style={{ marginTop: 0 }}>
        <div className="rd-table-shell">
          {isLoading ? (
            <div style={{ padding: 16 }}>
              <div className="rd-skeleton rd-skeleton-block" style={{ height: 56, marginBottom: 8 }} />
              <div className="rd-skeleton rd-skeleton-block" style={{ height: 56, marginBottom: 8 }} />
              <div className="rd-skeleton rd-skeleton-block" style={{ height: 56 }} />
            </div>
          ) : filteredWallets.length === 0 ? (
            wallets.length === 0 ? (
              <RdEmptyState
                icon={<EmptyIcon kind="address-book" />}
                title="No wallets yet"
                description="Save the wallets you pay or get paid by. Once trusted, they're available for one-click selection on every payment and collection."
                primary={{ label: 'Add wallet', onClick: () => setAddOpen(true) }}
              />
            ) : (
              <RdEmptyState
                title="Nothing matches"
                description="Clear the search or change the filter to see more."
              />
            )
          ) : (
            <table className="rd-table">
              <thead>
                <tr>
                  <th style={{ width: '34%' }}>Label</th>
                  <th style={{ width: '38%' }}>Wallet</th>
                  <th style={{ width: '14%' }}>Trust</th>
                  <th aria-label="Actions" style={{ width: '14%' }} />
                </tr>
              </thead>
              <tbody>
                {filteredWallets.map((w) => (
                  <tr key={w.counterpartyWalletId}>
                    <td>
                      <div className="rd-recipient-main">
                        <span className="rd-recipient-name">{w.label}</span>
                        {w.notes ? (
                          <span className="rd-recipient-ref">{w.notes}</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <ChainLink address={w.walletAddress} />
                    </td>
                    <td>
                      <span className="rd-pill" data-tone={trustTone(w.trustState)}>
                        <span className="rd-pill-dot" aria-hidden />
                        {w.trustState}
                      </span>
                    </td>
                    <td>
                      <div className="rd-row-actions">
                        <button
                          type="button"
                          className="rd-btn rd-btn-sm rd-btn-ghost"
                          onClick={() => setEditing(w)}
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {addOpen ? (
        <WalletDialog
          mode="create"
          pending={createMutation.isPending}
          onClose={() => setAddOpen(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
        />
      ) : null}

      {editing ? (
        <WalletDialog
          mode="edit"
          initial={editing}
          pending={updateMutation.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(payload) =>
            updateMutation.mutate({
              counterpartyWalletId: editing.counterpartyWalletId,
              label: payload.label,
              trustState: payload.trustState,
              notes: payload.notes ?? null,
            })
          }
        />
      ) : null}
    </main>
  );
}

function WalletDialog(
  props:
    | {
        mode: 'create';
        initial?: undefined;
        pending: boolean;
        onClose: () => void;
        onSubmit: (payload: {
          label: string;
          walletAddress: string;
          trustState: CounterpartyWalletTrustState;
          notes?: string;
        }) => void;
      }
    | {
        mode: 'edit';
        initial: CounterpartyWallet;
        pending: boolean;
        onClose: () => void;
        onSubmit: (payload: {
          label: string;
          walletAddress: string;
          trustState: CounterpartyWalletTrustState;
          notes?: string;
        }) => void;
      },
): ReactNode {
  const { mode, pending, onClose, onSubmit } = props;
  const initial = props.mode === 'edit' ? props.initial : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = mode === 'create' ? 'Add wallet' : 'Edit wallet';
  const submitLabel = mode === 'create' ? 'Save wallet' : 'Save changes';

  return (
    <div className="rd-dialog-backdrop" role="dialog" aria-modal="true">
      <div className="rd-dialog" style={{ maxWidth: 540 }}>
        <h2 className="rd-dialog-title">{title}</h2>
        <p className="rd-dialog-body">
          {mode === 'create'
            ? 'Add a Solana wallet to your address book. Mark it trusted now or review and approve later.'
            : 'Update the label, trust state, or notes. The wallet address itself can\'t be changed.'}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            onSubmit({
              label: String(form.get('label') ?? '').trim(),
              walletAddress:
                mode === 'create'
                  ? String(form.get('walletAddress') ?? '').trim()
                  : initial!.walletAddress,
              trustState: String(
                form.get('trustState') ?? 'unreviewed',
              ) as CounterpartyWalletTrustState,
              notes: String(form.get('notes') ?? '').trim() || undefined,
            });
          }}
        >
          <div className="rd-form-grid">
            <label className="rd-field" style={{ gridColumn: '1 / -1' }}>
              <span className="rd-field-label">Label</span>
              <input
                name="label"
                required
                placeholder="Acme Corp — ops wallet"
                className="rd-input"
                autoComplete="off"
                defaultValue={initial?.label ?? ''}
              />
            </label>
            {mode === 'create' ? (
              <label className="rd-field" style={{ gridColumn: '1 / -1' }}>
                <span className="rd-field-label">Solana wallet address</span>
                <input
                  name="walletAddress"
                  required
                  placeholder="Solana address"
                  className="rd-input"
                  autoComplete="off"
                />
              </label>
            ) : (
              <div className="rd-field" style={{ gridColumn: '1 / -1' }}>
                <span className="rd-field-label">Wallet address</span>
                <div className="rd-mono" style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
                  {initial!.walletAddress}
                </div>
              </div>
            )}
            <label className="rd-field" style={{ gridColumn: '1 / -1' }}>
              <span className="rd-field-label">Trust state</span>
              <select
                name="trustState"
                className="rd-select"
                defaultValue={initial?.trustState ?? 'unreviewed'}
              >
                <option value="unreviewed">Unreviewed</option>
                <option value="trusted">Trusted</option>
                <option value="restricted">Restricted</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
            <label className="rd-field" style={{ gridColumn: '1 / -1' }}>
              <span className="rd-field-label">Notes (optional)</span>
              <input
                name="notes"
                placeholder="Verified via signed contract on 2026-04-22"
                className="rd-input"
                autoComplete="off"
                defaultValue={initial?.notes ?? ''}
              />
            </label>
          </div>
          <div className="rd-dialog-actions" style={{ marginTop: 24 }}>
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
