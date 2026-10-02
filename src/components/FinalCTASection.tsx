import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface FinalCTASectionProps {
  onOpenUpload: () => void;
  onOpenDashboard?: () => void;
  onLoadGolden?: () => void;
  isLoadingGolden?: boolean;
}

export const FinalCTASection: React.FC<FinalCTASectionProps> = ({
  onOpenUpload,
  onOpenDashboard,
}) => {
  return (
    <section className="relative band bg-canvas border-b border-hairline overflow-hidden">
      <div className="orb orb-sky w-[560px] h-[560px] -top-24 left-1/2 -translate-x-1/2 opacity-60" aria-hidden="true" />

      <div className="shell relative z-10 text-center">
        <p className="type-caption-uppercase text-muted mb-6">So</p>

        <h2 className="type-display-lg text-ink mb-6">Where did your money go?</h2>

        <p className="type-body-md text-body mb-10 max-w-xl mx-auto">
          Open the investigation desk or upload your transactions to detect hidden micro-leaks.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {onOpenDashboard && (
            <button type="button" onClick={onOpenDashboard} className="btn-primary">
              <span>Open financial dashboard</span>
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )}

          <button type="button" onClick={onOpenUpload} className="btn-outline">
            <span>Upload statements</span>
            <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <p className="type-caption text-muted-soft mt-8">
          No bank credentials requested · Export or delete anytime
        </p>
      </div>
    </section>
  );
};
