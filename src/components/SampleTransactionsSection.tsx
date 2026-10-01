import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface SampleTransactionsSectionProps {
  onOpenLedger?: () => void;
}

export const SampleTransactionsSection: React.FC<SampleTransactionsSectionProps> = ({ onOpenLedger }) => {
  const transactions = [
    {
      date: '09 SEP',
      source: 'bKash',
      merchant: 'Foodpanda',
      amount: '৳580',
      category: 'Food delivery',
    },
    {
      date: '08 SEP',
      source: 'BRAC BANK',
      merchant: 'Uber',
      amount: '৳420',
      category: 'Transport',
    },
    {
      date: '07 SEP',
      source: 'Nagad',
      merchant: 'Grocery',
      amount: '৳1,280',
      category: 'Groceries',
    },
    {
      date: '05 SEP',
      source: 'CARD',
      merchant: 'Netflix',
      amount: '৳650',
      category: 'Subscriptions',
    },
  ];

  return (
    <section className="py-20 md:py-28 border-b border-[#171717] bg-[#F6F1E8]">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-12 md:px-16">
        
        {/* Section Header */}
        <div className="max-w-2xl mb-16">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-[#171717]/60 mb-3">
            TRANSACTION INTERPRETATION
          </div>
          <h2 className="font-display font-medium text-3xl sm:text-4xl text-[#171717] tracking-tight">
            How raw logs turn into meaning.
          </h2>
        </div>

        {/* Two-Column Demonstration: Transactions List -> Interpretation */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Left Column (7 cols): Realistic Transaction List */}
          <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#171717] p-6 sm:p-8">
            <div className="font-mono text-xs uppercase tracking-widest text-[#171717]/60 pb-4 mb-6 border-b border-[#171717]/15">
              RAW TRANSACTION FEED
            </div>

            <div className="divide-y divide-[#171717]/10">
              {transactions.map((tx, idx) => (
                <div key={idx} className="py-4 flex items-center justify-between">
                  <div className="flex items-baseline gap-4 sm:gap-6">
                    <span className="font-mono text-xs text-[#171717]/50 w-16">
                      {tx.date}
                    </span>
                    <div>
                      <div className="font-display font-medium text-base text-[#171717]">
                        {tx.merchant}
                      </div>
                      <div className="font-mono text-[11px] text-[#171717]/60">
                        {tx.source} · {tx.category}
                      </div>
                    </div>
                  </div>

                  <div className="font-mono font-bold text-sm text-[#171717]">
                    {tx.amount}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-[#171717]/15 flex items-center justify-between text-xs font-mono text-[#171717]/50">
              <span>Standard transaction history records</span>
              {onOpenLedger && (
                <button
                  onClick={onOpenLedger}
                  className="text-[#171717] underline font-medium hover:no-underline cursor-pointer"
                >
                  Inspect full ledger →
                </button>
              )}
            </div>
          </div>

          {/* Right Column (5 cols): How Kothay Gelo? Interprets It */}
          <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#171717] p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#171717]/15">
                <span className="font-mono text-xs uppercase tracking-widest text-[#171717] font-bold">
                  WE FOUND SOMETHING
                </span>
                <span className="w-2 h-2 bg-[#FF725E] inline-block"></span>
              </div>

              <div className="space-y-4 mb-8">
                <div className="font-display text-xl sm:text-2xl text-[#171717] leading-snug">
                  4 food-related transactions in 6 days.
                </div>
                
                <p className="font-display text-sm text-[#171717]/70 leading-relaxed">
                  Food delivery and small meal orders accounted for repeated micro-spends, adding service fees and platform markups.
                </p>
              </div>

              <div className="pt-6 border-t border-[#171717]/15">
                <div className="font-mono text-xs uppercase text-[#171717]/60 mb-1">
                  Estimated total
                </div>
                <div className="font-display font-bold text-3xl text-[#171717]">
                  ৳2,840
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-[#171717]/15 text-xs font-mono text-[#171717]/60">
              Pattern identified automatically without manual spreadsheets.
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
