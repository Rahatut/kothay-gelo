import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface HowItWorksSectionProps {
  onOpenUpload: () => void;
  onLoadGolden?: () => void;
  isLoadingGolden?: boolean;
}

export const HowItWorksSection: React.FC<HowItWorksSectionProps> = ({
  onOpenUpload,
}) => {
  return (
    <section id="how-it-works" className="py-20 md:py-28 border-b border-[#171717] bg-[#F6F1E8]">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-12 md:px-16">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-16 gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-[#171717]/60 mb-2">
              HOW IT WORKS
            </div>
            <h2 className="font-display font-medium text-3xl sm:text-4xl text-[#171717] tracking-tight">
              Three simple steps.
            </h2>
          </div>
          <button
            onClick={onOpenUpload}
            className="text-xs font-mono font-bold text-[#171717] flex items-center gap-1 underline underline-offset-4 hover:no-underline"
          >
            <span>Start with your statement</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        {/* Horizontal Editorial Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#171717]/20 border-t border-b border-[#171717]">
          
          {/* 01: Upload */}
          <div className="py-10 md:py-12 md:pr-10 lg:pr-12">
            <div className="font-mono text-5xl sm:text-6xl font-light text-[#171717]/30 mb-6 select-none">
              01
            </div>
            <h3 className="font-display font-bold text-xl text-[#171717] mb-3">
              Upload
            </h3>
            <p className="font-display text-base text-[#171717]/80 leading-relaxed max-w-xs">
              Your bank or mobile-money statement.
            </p>
            <div className="mt-6 text-xs font-mono text-[#171717]/50">
              bKash, Nagad, City Bank, BRAC, EBL, or CSV
            </div>
          </div>

          {/* 02: Understand */}
          <div className="py-10 md:py-12 md:px-10 lg:px-12">
            <div className="font-mono text-5xl sm:text-6xl font-light text-[#171717]/30 mb-6 select-none">
              02
            </div>
            <h3 className="font-display font-bold text-xl text-[#171717] mb-3">
              Understand
            </h3>
            <p className="font-display text-base text-[#171717]/80 leading-relaxed max-w-xs">
              Transactions become organized spending patterns.
            </p>
            <div className="mt-6 text-xs font-mono text-[#171717]/50">
              Categorized with evidence & math formulas
            </div>
          </div>

          {/* 03: Act */}
          <div className="py-10 md:py-12 md:pl-10 lg:pl-12">
            <div className="font-mono text-5xl sm:text-6xl font-light text-[#171717]/30 mb-6 select-none">
              03
            </div>
            <h3 className="font-display font-bold text-xl text-[#171717] mb-3">
              Act
            </h3>
            <p className="font-display text-base text-[#171717]/80 leading-relaxed max-w-xs">
              See realistic opportunities to save.
            </p>
            <div className="mt-6 text-xs font-mono text-[#171717]/50">
              Calculate the recovery of small leaks
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
