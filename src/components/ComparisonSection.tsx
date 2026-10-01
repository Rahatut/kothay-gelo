import React from 'react';

interface ComparisonSectionProps {
  onInvestigate?: () => void;
}

export const ComparisonSection: React.FC<ComparisonSectionProps> = ({ onInvestigate }) => {
  return (
    <section className="py-20 md:py-28 border-b border-[#171717] bg-[#F6F1E8]">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-12 md:px-16">
        
        {/* Section Header: Editorial statement */}
        <div className="max-w-3xl mb-16">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-[#171717]/60 mb-3">
            THE DIFFERENCE
          </div>
          <h2 className="font-display font-medium text-3xl sm:text-4xl md:text-5xl text-[#171717] tracking-tight leading-[1.15]">
            Don't just show the numbers.
            <span className="block text-[#171717]/50 mt-1">
              Explain them.
            </span>
          </h2>
        </div>

        {/* Restrained Side-by-Side Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          
          {/* Typical App: Passive list of numbers */}
          <div className="bg-[#FFFFFF] border border-[#171717] p-8 sm:p-10 flex flex-col justify-between">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-[#171717]/40 mb-8 pb-3 border-b border-[#171717]/15">
                TYPICAL FINANCE APP
              </div>

              <div className="space-y-6">
                <div>
                  <div className="font-mono text-xs uppercase text-[#171717]/50 mb-1">Income</div>
                  <div className="font-display font-medium text-xl text-[#171717]">৳85,000</div>
                </div>

                <div>
                  <div className="font-mono text-xs uppercase text-[#171717]/50 mb-1">Expenses</div>
                  <div className="font-display font-medium text-xl text-[#171717]">৳68,400</div>
                </div>

                <div>
                  <div className="font-mono text-xs uppercase text-[#171717]/50 mb-1">Balance</div>
                  <div className="font-display font-medium text-xl text-[#171717]">৳16,600</div>
                </div>

                <div>
                  <div className="font-mono text-xs uppercase text-[#171717]/50 mb-1">Transactions</div>
                  <div className="font-display font-medium text-xl text-[#171717]">64 items logged</div>
                </div>
              </div>
            </div>

            <div className="pt-8 mt-8 border-t border-[#171717]/15 text-xs font-mono text-[#171717]/50">
              Raw data without context or next steps.
            </div>
          </div>

          {/* Kothay Gelo?: Explanatory insights, green only for final savings number */}
          <div className="bg-[#FFFFFF] border border-[#171717] p-8 sm:p-10 flex flex-col justify-between relative">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-[#171717] font-bold mb-8 pb-3 border-b border-[#171717]/15 flex items-center justify-between">
                <span>KOTHAY GELO?</span>
                <span className="text-[11px] font-mono text-[#171717]/50 font-normal">EXPLAINED SPENDING</span>
              </div>

              <div className="space-y-6">
                <div className="pb-4 border-b border-[#171717]/10">
                  <p className="font-display text-base sm:text-lg text-[#171717] leading-snug">
                    You spent <span className="font-bold">28% more</span> on food delivery than last month.
                  </p>
                </div>

                <div className="pb-4 border-b border-[#171717]/10">
                  <p className="font-display text-base sm:text-lg text-[#171717] leading-snug">
                    Your small purchases added up to <span className="font-bold">৳3,240</span>.
                  </p>
                </div>

                <div>
                  <div className="font-mono text-xs uppercase tracking-wider text-[#171717]/60 mb-2">
                    Actionable recovery
                  </div>
                  <p className="font-display text-base sm:text-lg text-[#171717] leading-snug">
                    You could realistically save{' '}
                    <span className="font-bold bg-[#B7F34A] px-2 py-0.5 border border-[#171717] inline-block mt-1 sm:mt-0">
                      ৳4,200 next month.
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-8 mt-8 border-t border-[#171717]/15 flex items-center justify-between">
              <span className="text-xs font-mono text-[#171717]/70">
                Pattern recognition applied to every transaction.
              </span>
              {onInvestigate && (
                <button
                  onClick={onInvestigate}
                  className="text-xs font-mono font-bold text-[#171717] underline hover:no-underline cursor-pointer"
                >
                  View ledger →
                </button>
              )}
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
