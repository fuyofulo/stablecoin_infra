import '../styles/landing-editorial.css';

export function LandingEditorialPage({
  onLogin,
}: {
  onLogin: () => void;
}) {
  return (
    <div className="editorial-page">
      <header className="editorial-topbar">
        <div className="editorial-brand">
          <span className="editorial-kicker">[project name]</span>
          <strong>Stablecoin operations infrastructure.</strong>
        </div>

        <div className="editorial-topbar-actions">
          <button className="editorial-link" onClick={onLogin} type="button">
            Operator login
          </button>
        </div>
      </header>

      <main className="editorial-main">
        <section className="editorial-hero">
          <div className="editorial-hero-copy">
            <p className="editorial-kicker">stablecoin ops control surface</p>
            <h1>The operating layer for teams already moving stablecoins.</h1>
            <p className="editorial-intro">
              Create transfer requests, run approvals, track settlement, and keep an auditable record of what actually happened after the transaction.
            </p>
            <div className="editorial-actions">
              <button className="editorial-button" onClick={onLogin} type="button">
                Operator login
              </button>
            </div>
            <div className="editorial-mini-proof">
              <div className="editorial-mini-proof-row">
                <span className="editorial-kicker">Requests</span>
                <strong>One place for transfer intent and operating context</strong>
              </div>
              <div className="editorial-mini-proof-row">
                <span className="editorial-kicker">Settlement</span>
                <strong>Know whether money was submitted, settled, or needs review</strong>
              </div>
              <div className="editorial-mini-proof-row">
                <span className="editorial-kicker">Assurance</span>
                <strong>Reconcile payouts and treasury transfers without explorer tabs and spreadsheets</strong>
              </div>
            </div>
          </div>

          <div className="editorial-visual" aria-hidden="true">
            <div className="editorial-visual-frame">
              <div className="editorial-visual-header">
                <span className="editorial-kicker">operations view</span>
                <span className="editorial-badge">live control</span>
              </div>

              <div className="editorial-visual-body">
                <div className="editorial-chart">
                  <div className="editorial-chart-column">
                    <span>Request</span>
                    <strong>Transfer created</strong>
                    <em>Amount, counterparty, reason</em>
                  </div>
                  <div className="editorial-chart-column editorial-chart-column-mid">
                    <span>Approval</span>
                    <strong>Policy and review</strong>
                    <em>Destination checks and sign-off</em>
                  </div>
                  <div className="editorial-chart-column">
                    <span>Settlement</span>
                    <strong>Observed on-chain</strong>
                    <em>Status, matching, evidence</em>
                  </div>
                </div>

                <div className="editorial-chart editorial-chart-secondary">
                  <div className="editorial-chart-column editorial-chart-column-wide">
                    <span>Exception queue</span>
                    <strong>Operators work only the cases that need attention</strong>
                    <em>Wrong amount, missing settlement, unexpected movement, unresolved payout</em>
                  </div>
                </div>

                <div className="editorial-visual-lines">
                  <span />
                  <span />
                  <span />
                </div>

                <div className="editorial-visual-meta">
                  <div>
                    <span>Use case</span>
                    <strong>Payouts and treasury transfers</strong>
                  </div>
                  <div>
                    <span>Scope</span>
                    <strong>Above wallets, custody, and chain data</strong>
                  </div>
                  <div>
                    <span>Result</span>
                    <strong>Finance-ready settlement records</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
