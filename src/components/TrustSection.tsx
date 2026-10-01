import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface TrustSectionProps {
  onOpenPrivacySettings?: () => void;
}

export const TrustSection: React.FC<TrustSectionProps> = ({ onOpenPrivacySettings }) => {
  const principles = [
    {
      title: 'Your data belongs to you.',
      description: 'You own your uploaded statements, your transaction history, and your insights. We never monetize or sell personal financial data to advertisers, lenders, or third parties.',
    },
    {
      title: 'We explain what we\'re analyzing.',
      description: 'Every insight and calculation shows its supporting transactions, exact mathematical formula, and reasoning. No black-box guesses.',
    },
    {
      title: 'We don\'t hide important decisions behind AI.',
      description: 'Extracted records clearly indicate confidence ratings, source snippets, and category tags so you remain in control of the final ledger.',
    },
    {
      title: 'You control your uploaded data.',
      description: 'Delete your session documents, purge extracted transactions, or export your reconciled ledger at any time with a single click.',
    },
  ];

  return (
    <section id="privacy-section" className="py-20 md:py-28 border-b border-[#171717] bg-[#F6F1E8]">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-12 md:px-16">
        
        {/* Section Header */}
        <div className="max-w-2xl mb-16">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-[#171717]/60 mb-3">
            PRIVACY & PRINCIPLES
          </div>
          <h2 className="font-display font-medium text-3xl sm:text-4xl md:text-5xl text-[#171717] tracking-tight leading-[1.15]">
            Your money is personal.
          </h2>
          <p className="font-display text-base sm:text-lg text-[#171717]/70 mt-3">
            Built from day one around user sovereignty, transparent math, and zero third-party monetization.
          </p>
        </div>

        {/* 4 Quiet Principles in an Editorial Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 pt-8 border-t border-[#171717]/20">
          {principles.map((item, idx) => (
            <div key={idx} className="space-y-2">
              <div className="font-mono text-xs text-[#171717]/40 mb-1">
                0{idx + 1}
              </div>
              <h3 className="font-display font-semibold text-xl text-[#171717]">
                {item.title}
              </h3>
              <p className="font-display text-sm sm:text-base text-[#171717]/70 leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        {onOpenPrivacySettings && (
          <div className="mt-14 pt-8 border-t border-[#171717]/20 flex items-center justify-between">
            <span className="text-xs font-mono text-[#171717]/60">
              Session data can be purged instantly in privacy settings.
            </span>
            <button
              onClick={onOpenPrivacySettings}
              className="text-xs font-mono font-bold text-[#171717] inline-flex items-center gap-1 underline underline-offset-4 hover:no-underline cursor-pointer"
            >
              <span>Manage data controls</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      </div>
    </section>
  );
};
