import React from 'react';

const FINANCIAL_CHANNELS = [
  'Bank accounts',
  'bKash',
  'Nagad',
  'Cards',
  'Cash',
  'Monthly bills',
  'Family expenses',
  'Everyday spending',
];

export const BangladeshMessySection: React.FC = () => {
  return (
    <section className="band bg-canvas-soft border-b border-hairline">
      <div className="shell">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          <div className="lg:col-span-4">
            <p className="type-caption-uppercase text-muted mb-4">Bangladesh context</p>
            <h2 className="type-display-sm text-ink">Made for how money moves here.</h2>
          </div>

          <div className="lg:col-span-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-8 mb-12 pb-12 border-b border-hairline">
              {FINANCIAL_CHANNELS.map((item, idx) => (
                <p key={idx} className="type-display-sm text-ink">
                  {item}
                </p>
              ))}
            </div>

            <blockquote className="type-display-md text-ink max-w-2xl">
              &ldquo;Your financial life doesn&rsquo;t fit neatly into one app.&rdquo;
            </blockquote>

            <p className="type-body-md text-body mt-4 max-w-xl">
              Between mobile financial services, multiple bank cards, cash withdrawals at ATMs, and
              utility meters, spending is scattered across multiple channels. Kothay Gelo? unifies
              them into a single, cohesive audit without demanding your passwords.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
