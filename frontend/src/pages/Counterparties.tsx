import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { AuthenticatedSession, Counterparty, Destination } from '../types';
import { shortenAddress, solanaAccountUrl } from '../domain';
import { useToast } from '../ui/Toast';

type TrustFilter = 'all' | 'trusted' | 'unreviewed' | 'blocked';

function trustTone(trust: Destination['trustState']): 'success' | 'warning' | 'danger' | 'info' {
  if (trust === 'trusted') return 'success';
  if (trust === 'blocked' || trust === 'restricted') return 'danger';
  return 'warning';
}

function destinationCountFor(counterpartyId: string, destinations: Destination[]): number {
  return destinations.filter((d) => d.counterpartyId === counterpartyId && d.isActive).length;
}

export function CounterpartiesPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();

  const [addCounterpartyOpen, setAddCounterpartyOpen] = useState(false);
  const [addDestinationOpen, setAddDestinationOpen] = useState(false);
  const [editDestination, setEditDestination] = useState<Destination | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TrustFilter>('all');

  const destinationsQuery = useQuery({
    queryKey: ['destinations', workspaceId] as const,
    queryFn: () => api.listDestinations(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const counterpartiesQuery = useQuery({
    queryKey: ['counterparties', workspaceId] as const,
    queryFn: () => api.listCounterparties(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['destinations', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['counterparties', workspaceId] }),
    ]);
  }

  const createCounterpartyMutation = useMutation({
    mutationFn: (form: FormData) =>
      api.createCounterparty(workspaceId!, {
        displayName: String(form.get('displayName') ?? '').trim(),
        category: String(form.get('category') ?? '').trim() || undefined,
      }),
    onSuccess: async () => {
      success('Counterparty saved.');
      setAddCounterpartyOpen(false);
      await invalidate();
    },
    onError: (err) => toastError(err instanceof Error ? err.message : 'Unable to save counterparty.'),
  });

  const createDestinationMutation = useMutation({
    mutationFn: (form: FormData) =>
      api.createDestination(workspaceId!, {
        walletAddress: String(form.get('walletAddress') ?? '').trim(),
        label: String(form.get('label') ?? '').trim(),
        counterpartyId: String(form.get('counterpartyId') ?? '').trim() || undefined,
        trustState: (String(form.get('trustState') ?? 'unreviewed') as Destination['trustState']),
        notes: String(form.get('notes') ?? '').trim() || undefined,
      }),
    onSuccess: async () => {
      success('Destination saved.');
      setAddDestinationOpen(false);
      await invalidate();
    },
    onError: (err) => toastError(err instanceof Error ? err.message : 'Unable to save destination.'),
  });

  const updateDestinationMutation = useMutation({
    mutationFn: ({ destinationId, input }: {
      destinationId: string;
      input: {
        label: string;
        trustState: Destination['trustState'];
        counterpartyId: string | null;
        notes?: string;
        isActive?: boolean;
      };
    }) => api.updateDestination(workspaceId!, destinationId, input),
    onSuccess: async () => {
      success('Destination updated.');
      setEditDestination(null);
      await invalidate();
    },
    onError: (err) => toastError(err instanceof Error ? err.message : 'Unable to update destination.'),
  });

  const destinations = destinationsQuery.data?.items ?? [];
  const counterparties = counterpartiesQuery.data?.items ?? [];

  const filteredDestinations = useMemo(() => {
    let out = destinations;
    if (filter === 'trusted') out = out.filter((d) => d.trustState === 'trusted');
    else if (filter === 'unreviewed') out = out.filter((d) => d.trustState === 'unreviewed');
    else if (filter === 'blocked') out = out.filter((d) => d.trustState === 'blocked' || d.trustState === 'restricted');
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (d) =>
          d.label.toLowerCase().includes(q)
          || d.walletAddress.toLowerCase().includes(q)
          || (d.counterparty?.displayName ?? '').toLowerCase().includes(q),
      );
    }
    return out;
  }, [destinations, filter, search]);

  const trustedCount = destinations.filter((d) => d.trustState === 'trusted').length;
  const unreviewedCount = destinations.filter((d) => d.trustState === 'unreviewed').length;
  const blockedCount = destinations.filter((d) => d.trustState === 'blocked' || d.trustState === 'restricted').length;

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

  return (
    <main className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">Counterparties</p>
          <h1>Who you pay</h1>
          <p>
            Destinations are Solana wallets you pay. Counterparties are the business entities behind them —
            optional but useful for grouping and reporting.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-secondary" onClick={() => setAddCounterpartyOpen(true)}>
            + Add counterparty
          </button>
          <button type="button" className="button button-primary" onClick={() => setAddDestinationOpen(true)}>
            + Add destination
          </button>
        </div>
      </header>

      <div className="rd-metrics">
        <div className="rd-metric">
          <span className="rd-metric-label">Destinations</span>
          <span className="rd-metric-value">{destinations.length}</span>
          <span className="rd-metric-sub">Active payout endpoints</span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Counterparties</span>
          <span className="rd-metric-value">{counterparties.length}</span>
          <span className="rd-metric-sub">Business entities tracked</span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Trusted</span>
          <span className="rd-metric-value" data-tone="success">
            {trustedCount}
          </span>
          <span className="rd-metric-sub">Auto-approvable per policy</span>
        </div>
        <div className="rd-metric">
          <span className="rd-metric-label">Needs review</span>
          <span className="rd-metric-value" data-tone={unreviewedCount + blockedCount > 0 ? 'warning' : undefined}>
            {unreviewedCount + blockedCount}
          </span>
          <span className="rd-metric-sub">Unreviewed, restricted, or blocked</span>
        </div>
      </div>

      <div className="rd-filter-bar">
        <div className="rd-search">
          <svg className="rd-search-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="m14 14-3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Search labels, counterparties, addresses"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search destinations"
          />
        </div>
        <div className="rd-tabs" role="tablist" aria-label="Trust filter">
          {(['all', 'trusted', 'unreviewed', 'blocked'] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              className="rd-tab"
              onClick={() => setFilter(key)}
              type="button"
            >
              {key === 'all' ? 'All' : key.charAt(0).toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>
        <div className="rd-toolbar-right">
          <span className="rd-section-meta">
            {filteredDestinations.length} of {destinations.length}
          </span>
        </div>
      </div>

      <section className="rd-section" style={{ marginTop: 0 }}>
        <div className="rd-table-shell">
          {destinationsQuery.isLoading ? (
            <div style={{ padding: 16 }}>
              <div className="rd-skeleton rd-skeleton-block" style={{ height: 56, marginBottom: 8 }} />
              <div className="rd-skeleton rd-skeleton-block" style={{ height: 56, marginBottom: 8 }} />
              <div className="rd-skeleton rd-skeleton-block" style={{ height: 56 }} />
            </div>
          ) : filteredDestinations.length === 0 ? (
            <div className="rd-empty-cell" style={{ padding: '64px 24px' }}>
              <strong>{destinations.length === 0 ? 'No destinations yet' : 'Nothing matches'}</strong>
              <p style={{ margin: '0 0 16px' }}>
                {destinations.length === 0
                  ? "Add a destination to start paying someone."
                  : 'Clear the search or change the filter to see more.'}
              </p>
              {destinations.length === 0 ? (
                <button type="button" className="button button-primary" onClick={() => setAddDestinationOpen(true)}>
                  + Add destination
                </button>
              ) : null}
            </div>
          ) : (
            <table className="rd-table">
              <thead>
                <tr>
                  <th style={{ width: '24%' }}>Label</th>
                  <th style={{ width: '18%' }}>Counterparty</th>
                  <th style={{ width: '22%' }}>Wallet</th>
                  <th style={{ width: '12%' }}>Trust</th>
                  <th style={{ width: '12%' }}>Type</th>
                  <th style={{ width: '12%' }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredDestinations.map((d) => (
                  <tr key={d.destinationId}>
                    <td>
                      <span style={{ color: 'var(--ax-text)', fontWeight: 500 }}>{d.label}</span>
                    </td>
                    <td>
                      {d.counterparty ? (
                        <span className="rd-origin" data-kind="run">
                          {d.counterparty.displayName}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ax-text-faint)', fontSize: 12 }}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      <a
                        href={solanaAccountUrl(d.walletAddress)}
                        target="_blank"
                        rel="noreferrer"
                        className="rd-addr-link"
                        title={d.walletAddress}
                      >
                        <span>{shortenAddress(d.walletAddress, 4, 4)}</span>
                        <ExternalIcon />
                      </a>
                    </td>
                    <td>
                      <span className="rd-pill" data-tone={trustTone(d.trustState)}>
                        <span className="rd-pill-dot" aria-hidden />
                        {d.trustState}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--ax-text-secondary)' }}>
                        {d.isInternal ? 'Internal' : 'External'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="rd-btn rd-btn-ghost"
                        style={{ minHeight: 32, padding: '6px 10px', fontSize: 12 }}
                        onClick={() => setEditDestination(d)}
                        aria-label={`Edit ${d.label}`}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="rd-section">
        <div className="rd-section-head">
          <div>
            <h2 className="rd-section-title">Counterparties ({counterparties.length})</h2>
            <p className="rd-section-sub">Business entities you've tagged. Optional — destinations work without them.</p>
          </div>
        </div>
        {counterparties.length === 0 ? (
          <div className="rd-card">
            <div className="rd-empty-cell" style={{ padding: '32px 16px' }}>
              <strong>No counterparties yet</strong>
              <p style={{ margin: 0 }}>Tag destinations with a counterparty to track who you're paying.</p>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            {counterparties.map((c) => {
              const count = destinationCountFor(c.counterpartyId, destinations);
              return (
                <div className="rd-card" key={c.counterpartyId} style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong style={{ color: 'var(--ax-text)' }}>{c.displayName}</strong>
                    <span style={{ fontSize: 12, color: 'var(--ax-text-muted)' }}>
                      {count} destination{count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ax-text-muted)', marginTop: 4 }}>
                    {c.category || 'Uncategorised'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {addCounterpartyOpen ? (
        <Dialog
          title="Add counterparty"
          body="A counterparty is an optional business entity you can tag destinations with."
          pending={createCounterpartyMutation.isPending}
          onClose={() => setAddCounterpartyOpen(false)}
          onSubmit={(form) => createCounterpartyMutation.mutate(form)}
          submitLabel="Save counterparty"
        >
          <label className="field">
            Name
            <input name="displayName" required placeholder="Acme Corp" autoComplete="organization" />
          </label>
          <label className="field">
            Category
            <input name="category" placeholder="vendor, contractor, internal" autoComplete="off" />
          </label>
        </Dialog>
      ) : null}

      {editDestination ? (
        <EditDestinationDialog
          destination={editDestination}
          counterparties={counterparties}
          pending={updateDestinationMutation.isPending}
          onClose={() => setEditDestination(null)}
          onSubmit={(input) =>
            updateDestinationMutation.mutate({ destinationId: editDestination.destinationId, input })
          }
        />
      ) : null}

      {addDestinationOpen ? (
        <Dialog
          title="Add destination"
          body="A destination is a Solana wallet you want to pay. You do not need to own it."
          pending={createDestinationMutation.isPending}
          onClose={() => setAddDestinationOpen(false)}
          onSubmit={(form) => createDestinationMutation.mutate(form)}
          submitLabel="Save destination"
        >
          <label className="field">
            Label
            <input name="label" required placeholder="Acme payout wallet" autoComplete="off" />
          </label>
          <label className="field">
            Solana address
            <input name="walletAddress" required placeholder="Counterparty wallet address" autoComplete="off" />
          </label>
          <label className="field">
            Counterparty (optional)
            <select name="counterpartyId" defaultValue="">
              <option value="">Unassigned</option>
              {counterparties.map((c) => (
                <option key={c.counterpartyId} value={c.counterpartyId}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Trust state
            <select name="trustState" defaultValue="unreviewed">
              <option value="unreviewed">Unreviewed</option>
              <option value="trusted">Trusted</option>
              <option value="restricted">Restricted</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <label className="field">
            Notes
            <input name="notes" placeholder="Optional context" autoComplete="off" />
          </label>
        </Dialog>
      ) : null}
    </main>
  );
}

function Dialog(props: {
  title: string;
  body: string;
  submitLabel: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
  children: ReactNode;
}) {
  const { title, body, submitLabel, pending, onClose, onSubmit, children } = props;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="rd-dialog-backdrop" role="dialog" aria-modal="true">
      <div className="rd-dialog" style={{ maxWidth: 520 }}>
        <h2 className="rd-dialog-title">{title}</h2>
        <p className="rd-dialog-body">{body}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(new FormData(e.currentTarget));
          }}
        >
          {children}
          <div className="rd-dialog-actions" style={{ marginTop: 20 }}>
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={pending} aria-busy={pending}>
              {pending ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditDestinationDialog(props: {
  destination: Destination;
  counterparties: Counterparty[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: {
    label: string;
    trustState: Destination['trustState'];
    counterpartyId: string | null;
    notes?: string;
    isActive?: boolean;
  }) => void;
}) {
  const { destination, counterparties, pending, onClose, onSubmit } = props;
  const [label, setLabel] = useState(destination.label);
  const [trustState, setTrustState] = useState<Destination['trustState']>(destination.trustState);
  const [counterpartyId, setCounterpartyId] = useState(destination.counterpartyId ?? '');
  const [notes, setNotes] = useState(destination.notes ?? '');
  const [isActive, setIsActive] = useState(destination.isActive);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="rd-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="rd-edit-destination-title">
      <div className="rd-dialog" style={{ maxWidth: 560 }}>
        <h2 id="rd-edit-destination-title" className="rd-dialog-title">
          Edit destination
        </h2>
        <p className="rd-dialog-body">
          Change how this destination is labelled, classified, and trusted.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              label: label.trim(),
              trustState,
              counterpartyId: counterpartyId || null,
              notes: notes.trim() ? notes.trim() : undefined,
              isActive,
            });
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--ax-surface-2)',
              border: '1px solid var(--ax-border)',
              marginBottom: 4,
            }}
          >
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ax-text-muted)' }}>
              Wallet
            </div>
            <div style={{ fontFamily: 'var(--ax-font-mono)', fontSize: 12, color: 'var(--ax-text)', wordBreak: 'break-all' }}>
              {destination.walletAddress}
            </div>
          </div>

          <label className="field">
            Label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              autoComplete="off"
            />
          </label>

          <label className="field">
            Trust state
            <select value={trustState} onChange={(e) => setTrustState(e.target.value as Destination['trustState'])}>
              <option value="unreviewed">Unreviewed</option>
              <option value="trusted">Trusted</option>
              <option value="restricted">Restricted</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>

          <label className="field">
            Counterparty
            <select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)}>
              <option value="">Unassigned</option>
              {counterparties.map((c) => (
                <option key={c.counterpartyId} value={c.counterpartyId}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Notes / origin
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Where this wallet came from, why you trust it, etc."
              autoComplete="off"
            />
          </label>

          <label
            className="field"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span style={{ fontSize: 13, color: 'var(--ax-text-secondary)' }}>
              Active (show in payment destination pickers)
            </span>
          </label>

          <div className="rd-dialog-actions" style={{ marginTop: 20 }}>
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={pending} aria-busy={pending}>
              {pending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 3h7v7M13 3 6 10M3 5v8h8" />
    </svg>
  );
}
