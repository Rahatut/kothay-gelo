import React from 'react';

interface SampleTransactionsSectionProps {
  onOpenLedger?: () => void;
}

const TRANSACTIONS = [
  { date: '09 Sep', source: 'bKash', merchant: 'Foodpanda', amount: '৳580', category: 'Food delivery' },
  { date: '08 Sep', source: 'BRAC Bank', merchant: 'Uber', amount: '৳420', category: 'Transport' },
  { date: '07 Sep', source: 'Nagad', merchant: 'Grocery', amount: '৳1,280', category: 'Groceries' },
  { date: '05 Sep', source: 'Card', merchant: 'Netflix', amount: '৳650', category: 'Subscriptions' },
];

export const SampleTransactionsSection: React.FC<SampleTransactionsSectionProps> = ({
  onOpenLedger,
}) => {
  return (
    <section className="band bg-canvas border-b border-hairline">
      <div className="shell">
        <div className="max-w-2xl mb-16">
          <p className="type-caption-uppercase text-muted mb-3">Transaction interpretation</p>
          <h2 className="type-display-md text-ink">How raw logs turn into meaning.</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-7 feature-card p-6 sm:p-8">
            <p className="type-caption-uppercase text-muted pb-4 mb-6 border-b border-hairline">
              Raw transaction feed
            </p>

            <div className="divide-y divide-hairline-soft">
              {TRANSACTIONS.map((tx, idx) => (
                <div key={idx} className="py-4 flex items-center justify-between gap-4">
                  <div className="flex items-baseline gap-4 sm:gap-6 min-w-0">
                    <span className="font-figure type-caption text-muted-soft w-16 shrink-0">
                      {tx.date}
                    </span>
                    <div className="min-w-0">
                      <p className="type-body-sm text-ink">{tx.merchant}</p>
                      <p className="type-caption text-muted-soft">
                        {tx.source} · {tx.category}
                      </p>
                    </div>
                  </div>

                  <span className="font-figure type-body-sm text-body-strong shrink-0">
                    {tx.amount}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-hairline flex flex-wrap items-center justify-between gap-3">
              <span className="type-caption text-muted-soft">Standard transaction history records</span>
              {onOpenLedger && (
                <button type="button" onClick={onOpenLedger} className="btn-text">
                  Inspect full ledger
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 feature-card p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 mb-6 border-b border-hairline">
                <span className="type-caption-uppercase text-ink">We found something</span>
                <span className="w-2 h-2 rounded-full bg-error inline-block" aria-hidden="true" />
              </div>

              <div className="space-y-4 mb-8">
                <p className="type-display-sm text-ink">4 food-related transactions in 6 days.</p>
                <p className="type-caption text-body">
                  Food delivery and small meal orders accounted for repeated micro-spends, adding
                  service fees and platform markups.
                </p>
              </div>

              <div className="pt-6 border-t border-hairline">
                <p className="type-caption-uppercase text-muted mb-1">Estimated total</p>
                <p className="font-figure type-display-md text-ink">৳2,840</p>
              </div>
            </div>

            <p className="type-caption text-muted-soft mt-8 pt-6 border-t border-hairline">
              Pattern identified automatically without manual spreadsheets.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
