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
    <section className="py-24 md:py-36 border-b border-[#171717] bg-[#F6F1E8]">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-12 md:px-16">
        <div className="max-w-3xl">
          
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-[#171717]/60 mb-6">
            SO...
          </div>

          <h2 className="font-display font-medium text-4xl sm:text-5xl md:text-6xl text-[#171717] tracking-tight leading-[1.05] mb-6">
            WHERE DID YOUR MONEY GO?
          </h2>

          <p className="font-display text-lg sm:text-xl text-[#171717]/70 leading-relaxed mb-10">
            Open the investigation desk or upload your transactions to detect hidden micro-leaks.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            {onOpenDashboard && (
              <button
                onClick={onOpenDashboard}
                className="btn-accent-green inline-flex items-center gap-2.5 text-base sm:text-lg"
              >
                <span>Open Financial Dashboard</span>
                <ArrowUpRight className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={onOpenUpload}
              className="btn-primary inline-flex items-center gap-2.5 text-base sm:text-lg"
            >
              <span>Upload statements</span>
              <ArrowUpRight className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-8 text-xs font-mono text-[#171717]/50">
            Free to use · No bank credentials requested · Export or delete anytime
          </div>

        </div>
      </div>
    </section>
  );
};
