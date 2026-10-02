import React from 'react';

export const ProblemSection: React.FC = () => {
  return (
    <section className="relative band bg-canvas-soft border-b border-hairline overflow-hidden">
      <div className="orb orb-rose w-[460px] h-[460px] -top-32 right-0 opacity-50" aria-hidden="true" />

      <div className="shell relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
          <div className="lg:col-span-3">
            <p className="type-caption-uppercase text-muted">The problem</p>
          </div>

          <div className="lg:col-span-9">
            <h2 className="type-display-lg text-ink mb-16 max-w-2xl">
              Your bank statement tells you what happened.
              <span className="block text-muted mt-2">
                It doesn&rsquo;t tell you why it keeps happening.
              </span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 pt-8 border-t border-hairline">
              <div className="space-y-1">
                <p className="font-figure type-display-sm text-ink">৳4,820</p>
                <p className="type-caption text-muted">Food delivery</p>
              </div>

              <div className="space-y-1">
                <p className="font-figure type-display-sm text-ink">৳2,190</p>
                <p className="type-caption text-muted">Subscriptions</p>
              </div>

              <div className="space-y-1">
                <p className="font-figure type-display-sm text-ink">৳3,450</p>
                <p className="type-caption text-muted">Impulse purchases</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
