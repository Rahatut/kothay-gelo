import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface HeroSectionProps {
  locale: 'en' | 'bn';
  onOpenUpload: () => void;
  onLoadGolden: () => void;
  isLoadingGolden?: boolean;
  onNavigateToDesk?: () => void;
  onOpenDashboard?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  locale,
  onOpenUpload,
  onLoadGolden,
  isLoadingGolden = false,
  onNavigateToDesk,
  onOpenDashboard,
}) => {
  const handleDashboardClick = () => {
    if (onOpenDashboard) {
      onOpenDashboard();
    } else if (onNavigateToDesk) {
      onNavigateToDesk();
    }
  };

  return (
    <section className="relative band bg-canvas overflow-hidden">
      {/* Atmospheric gradient orbs — decoration only, never a surface */}
      <div className="orb orb-mint w-[520px] h-[520px] -top-40 -left-32 opacity-70" aria-hidden="true" />
      <div className="orb orb-lavender w-[600px] h-[600px] top-10 -right-40 opacity-60" aria-hidden="true" />
      <div className="orb orb-peach w-[420px] h-[420px] bottom-0 left-1/3 opacity-50" aria-hidden="true" />

      <div className="shell relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          <div className="lg:col-span-7">
            <p className="type-caption-uppercase text-muted mb-6">
              Personal finance, without the spreadsheet
            </p>

            {/* Display Bengali headline. Waldenburg has no Bengali coverage, so
                the display face falls back to Noto Sans Bengali at the same
                weight 300 that every other display line uses. */}
            <h1 className="font-bangla text-ink type-display-mega mb-6">
              টাকাটা গেল কোথায়?
            </h1>

            <div className="type-body-md text-body max-w-xl mb-10 space-y-1">
              <p>See where your money went.</p>
              <p>Understand the patterns. Find what you can change.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleDashboardClick} className="btn-primary">
                <span>Open dashboard</span>
                <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
              </button>

              <button type="button" onClick={onOpenUpload} className="btn-outline">
                <span>Upload transactions</span>
                <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={async () => {
                  await onLoadGolden();
                  handleDashboardClick();
                }}
                disabled={isLoadingGolden}
                className="btn-text"
              >
                <span>{isLoadingGolden ? 'Loading example' : 'Explore live demo'}</span>
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Featured insight card */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div
              onClick={handleDashboardClick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleDashboardClick();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Open the financial dashboard"
              className="w-full max-w-[420px] feature-card feature-card-interactive p-8 cursor-pointer select-none"
            >
              <div className="flex items-center justify-between border-b border-hairline pb-4 mb-6">
                <span className="type-caption-uppercase text-muted">Active financial desk</span>
                <span className="badge-pill">
                  Open dashboard
                  <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                </span>
              </div>

              <div className="mb-8">
                <p className="type-caption text-muted mb-1">You spent</p>
                <p className="font-figure type-display-md text-ink">৳42,680</p>
              </div>

              <div className="space-y-0 mb-8">
                <div className="flex items-center justify-between py-3 border-b border-hairline-soft">
                  <span className="type-body-sm text-ink">Food &amp; delivery</span>
                  <span className="font-figure type-body-sm text-body-strong">৳11,420</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-hairline-soft">
                  <span className="type-body-sm text-ink">Transport</span>
                  <span className="font-figure type-body-sm text-body-strong">৳6,850</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="type-body-sm text-ink">Subscriptions</span>
                  <span className="font-figure type-body-sm text-body-strong">৳2,340</span>
                </div>
              </div>

              <div className="border-t border-hairline pt-6">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="type-caption-uppercase text-muted mb-1">Possible saving</p>
                    <p className="font-figure type-display-sm text-ink">
                      ৳4,200
                      <span className="type-caption text-muted font-normal"> / month</span>
                    </p>
                  </div>
                  <span className="type-caption text-muted-soft">3 action points</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="type-caption-uppercase text-ink">Your finances stay yours</p>
          <p className="type-caption text-muted">
            Processed in-session. Nothing is stored.
          </p>
        </div>
      </div>
    </section>
  );
};
