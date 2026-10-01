import React, { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

interface WhatIfCalculatorProps {
  onCommitSavings?: (monthlyAmount: number) => void;
}

interface SpendingCategory {
  id: string;
  name: string;
  monthlySpend: number;
}

const CATEGORIES: SpendingCategory[] = [
  { id: 'food', name: 'Food delivery', monthlySpend: 3600 },
  { id: 'rides', name: 'Ride hailing & transit', monthlySpend: 4200 },
  { id: 'snacks', name: 'Convenience & snacks', monthlySpend: 2400 },
  { id: 'subs', name: 'Digital subscriptions', monthlySpend: 1800 },
];

export const WhatIfCalculator: React.FC<WhatIfCalculatorProps> = ({ onCommitSavings }) => {
  const [selectedCatId, setSelectedCatId] = useState<string>('food');
  const [reductionPct, setReductionPct] = useState<number>(25);

  const currentCategory = CATEGORIES.find(c => c.id === selectedCatId) || CATEGORIES[0];
  
  const monthlySaving = Math.round((currentCategory.monthlySpend * reductionPct) / 100);
  const yearlySaving = monthlySaving * 12;

  return (
    <section id="what-if-section" className="py-20 md:py-28 border-b border-[#171717] bg-[#F6F1E8]">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-12 md:px-16">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-16">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-[#171717]/60 mb-3">
            WHAT-IF SIMULATION
          </div>
          <h2 className="font-display font-medium text-3xl sm:text-4xl md:text-5xl text-[#171717] tracking-tight leading-[1.15]">
            What if you changed just one thing?
          </h2>
          <p className="font-display text-base sm:text-lg text-[#171717]/70 mt-3">
            Small adjustments add up without drastic lifestyle changes.
          </p>
        </div>

        {/* Calculator Frame: Restrained Neobrutalist Interface */}
        <div className="bg-[#FFFFFF] border border-[#171717] p-8 sm:p-12 max-w-3xl">
          
          {/* Category Selector Tabs */}
          <div className="flex flex-wrap gap-2 mb-8 pb-6 border-b border-[#171717]/15">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCatId(cat.id)}
                className={`text-xs font-mono px-3.5 py-1.5 transition-colors cursor-pointer border ${
                  selectedCatId === cat.id
                    ? 'bg-[#171717] text-[#F6F1E8] border-[#171717]'
                    : 'bg-transparent text-[#171717]/70 border-transparent hover:border-[#171717]/30'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Prompt Format Display */}
          <div className="mb-10">
            <div className="font-mono text-xs uppercase tracking-wider text-[#171717]/60 mb-2">
              You spend around
            </div>
            <div className="font-display font-bold text-4xl sm:text-5xl text-[#171717] tracking-tight mb-2">
              ৳{currentCategory.monthlySpend.toLocaleString()}
            </div>
            <div className="font-display text-base text-[#171717]/80">
              on {currentCategory.name.toLowerCase()} every month.
            </div>
          </div>

          {/* Slider Control */}
          <div className="mb-10 pb-8 border-b border-[#171717]/15">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs uppercase tracking-wider text-[#171717]/70">
                Adjustment Target
              </span>
              <span className="font-mono text-sm font-bold bg-[#171717] text-[#F6F1E8] px-2.5 py-0.5">
                Reduce by {reductionPct}%
              </span>
            </div>

            <input
              type="range"
              min="10"
              max="60"
              step="5"
              value={reductionPct}
              onChange={(e) => setReductionPct(Number(e.target.value))}
              className="w-full accent-[#171717] cursor-pointer h-2 bg-[#F6F1E8] border border-[#171717]"
            />

            <div className="flex justify-between text-[11px] font-mono text-[#171717]/50 mt-2">
              <span>10% (slight trim)</span>
              <span>25% (recommended)</span>
              <span>50% (major shift)</span>
            </div>
          </div>

          {/* Savings Result (Green strictly for savings number) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-baseline">
            <div>
              <div className="font-mono text-xs uppercase tracking-wider text-[#171717]/60 mb-1">
                Potential monthly saving
              </div>
              <div className="font-display font-bold text-3xl sm:text-4xl text-[#171717]">
                <span className="bg-[#B7F34A] px-2 py-0.5 border border-[#171717]">
                  ৳{monthlySaving.toLocaleString()}
                </span>
              </div>
            </div>

            <div>
              <div className="font-mono text-xs uppercase tracking-wider text-[#171717]/60 mb-1">
                Potential yearly saving
              </div>
              <div className="font-display font-bold text-3xl sm:text-4xl text-[#171717]">
                <span className="bg-[#B7F34A] px-2 py-0.5 border border-[#171717]">
                  ৳{yearlySaving.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {onCommitSavings && (
            <div className="mt-8 pt-6 border-t border-[#171717]/15 flex items-center justify-between">
              <span className="text-xs font-mono text-[#171717]/60">
                Keep this target in your financial ledger.
              </span>
              <button
                onClick={() => onCommitSavings(monthlySaving)}
                className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
              >
                <span>Commit to target</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          )}

        </div>

      </div>
    </section>
  );
};
