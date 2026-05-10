// Address book got unified into Counterparties — the dedicated /payers page
// is gone. Only the AddCollectionSourceDialog survives because Collections.tsx
// still needs a "create an inbound counterparty wallet" affordance from
// inside the new-collection flow. The dialog is direction='inbound' under
// the hood; rest of the address-book UX lives on the Counterparties page.

import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api';
import type { Counterparty, CounterpartyWalletTrustState } from '../types';

export function AddCollectionSourceDialog(props: {
  organizationId: string;
  counterparties: Counterparty[];
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const { organizationId, counterparties, onClose, onSuccess, onError } = props;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: (form: FormData) =>
      api.createCounterpartyWallet(organizationId, {
        label: String(form.get('label') ?? '').trim(),
        walletAddress: String(form.get('walletAddress') ?? '').trim(),
        trustState: String(form.get('trustState') ?? 'unreviewed') as CounterpartyWalletTrustState,
        counterpartyId: String(form.get('counterpartyId') ?? '').trim() || undefined,
        notes: String(form.get('notes') ?? '').trim() || undefined,
      }),
    onSuccess: () => onSuccess(),
    onError: (err) => onError(err instanceof Error ? err.message : 'Unable to save payer source.'),
  });

  return (
    <div
      className="rd-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rd-add-source-title"
    >
      <div className="rd-dialog" style={{ maxWidth: 520 }}>
        <h2 id="rd-add-source-title" className="rd-dialog-title">
          New payer source
        </h2>
        <p className="rd-dialog-body">A wallet address you receive USDC from.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(new FormData(e.currentTarget));
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
              />
            </label>
            <label className="rd-field" style={{ gridColumn: '1 / -1' }}>
              <span className="rd-field-label">Wallet address</span>
              <input
                name="walletAddress"
                required
                placeholder="Solana address"
                className="rd-input"
                autoComplete="off"
              />
            </label>
            <label className="rd-field">
              <span className="rd-field-label">Trust state</span>
              <select name="trustState" className="rd-select" defaultValue="unreviewed">
                <option value="unreviewed">Unreviewed</option>
                <option value="trusted">Trusted</option>
                <option value="restricted">Restricted</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
            <label className="rd-field">
              <span className="rd-field-label">Counterparty (optional)</span>
              <select name="counterpartyId" className="rd-select" defaultValue="">
                <option value="">—</option>
                {counterparties.map((c) => (
                  <option key={c.counterpartyId} value={c.counterpartyId}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="rd-field" style={{ gridColumn: '1 / -1' }}>
              <span className="rd-field-label">Notes (optional)</span>
              <input
                name="notes"
                placeholder="Verified via signed email on 2026-04-22"
                className="rd-input"
                autoComplete="off"
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
              disabled={mutation.isPending}
              aria-busy={mutation.isPending}
            >
              {mutation.isPending ? 'Saving…' : 'Save payer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
