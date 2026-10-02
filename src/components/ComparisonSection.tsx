import React from 'react';

interface ComparisonSectionProps {
  onInvestigate?: () => void;
}

const TYPICAL_APP_ROWS = [
  { label: 'Income', value: '৳85,000' },
  { label: 'Expenses', value: '৳68,400' },
  { label: 'Balance', value: '৳16,600' },
  { label: 'Transactions', value: '64 items logged' },
];

export const ComparisonSection: React.FC<ComparisonSectionProps> = ({ onInvestigate }) => {
  return (
    <section className="band bg-canvas border-b border-hairline">
      <div className="shell">
        <div className="max-w-3xl mb-16">
          <p className="type-caption-uppercase text-muted mb-3">The difference</p>
          <h2 className="type-display-lg text-ink">
            Don&rsquo;t just show the numbers.
            <span className="block text-muted mt-1">Explain them.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          <div className="feature-card p-8 sm:p-10 flex flex-col justify-between">
            <div>
              <p className="type-caption-uppercase text-muted-soft mb-8 pb-3 border-b border-hairline">
                Typical finance app
              </p>

              <dl className="space-y-6">
                {TYPICAL_APP_ROWS.map((row) => (
                  <div key={row.label}>
                    <dt className="type-caption text-muted mb-1">{row.label}</dt>
                    <dd className="font-figure type-title-sm text-ink">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <p className="type-caption text-muted-soft pt-8 mt-8 border-t border-hairline">
              Raw data without context or next steps.
            </p>
          </div>

          <div className="feature-card p-8 sm:p-10 flex flex-col justify-between">
            <div>
              <p className="type-caption-uppercase text-ink mb-8 pb-3 border-b border-hairline flex items-center justify-between">
                <span>Kothay Gelo?</span>
                <span className="type-caption text-muted-soft font-normal">Explained spending</span>
              </p>

              <div className="space-y-6">
                <p className="type-body-md text-ink pb-4 border-b border-hairline-soft">
                  You spent <span className="font-medium">28% more</span> on food delivery than
                  last month.
                </p>

                <p className="type-body-md text-ink pb-4 border-b border-hairline-soft">
                  Your small purchases added up to <span className="font-figure font-medium">৳3,240</span>.
                </p>

                <div>
                  <p className="type-caption-uppercase text-muted mb-2">Actionable recovery</p>
                  <p className="type-body-md text-ink">
                    You could realistically save{' '}
                    <span className="font-figure font-medium text-success">৳4,200 next month</span>.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-8 mt-8 border-t border-hairline flex items-center justify-between gap-4">
              <span className="type-caption text-muted">
                Pattern recognition applied to every transaction.
              </span>
              {onInvestigate && (
                <button type="button" onClick={onInvestigate} className="btn-text">
                  View ledger
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
