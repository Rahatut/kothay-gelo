import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface TrustSectionProps {
  onOpenPrivacySettings?: () => void;
}

const PRINCIPLES = [
  {
    title: 'Your data belongs to you.',
    description:
      'You own your uploaded statements, your transaction history, and your insights. We never monetize or sell personal financial data to advertisers, lenders, or third parties.',
  },
  {
    title: "We explain what we're analyzing.",
    description:
      'Every insight and calculation shows its supporting transactions, exact mathematical formula, and reasoning. No black-box guesses.',
  },
  {
    title: "We don't hide important decisions behind AI.",
    description:
      'Extracted records clearly indicate confidence ratings, source snippets, and category tags so you remain in control of the final ledger.',
  },
  {
    title: 'You control your uploaded data.',
    description:
      'Delete your session documents, purge extracted transactions, or export your reconciled ledger at any time with a single click.',
  },
];

export const TrustSection: React.FC<TrustSectionProps> = ({ onOpenPrivacySettings }) => {
  return (
    <section id="privacy-section" className="band bg-canvas border-b border-hairline">
      <div className="shell">
        <div className="max-w-2xl mb-16">
          <p className="type-caption-uppercase text-muted mb-3">Privacy &amp; principles</p>
          <h2 className="type-display-lg text-ink">Your money is personal.</h2>
          <p className="type-body-md text-body mt-3">
            Built from day one around user sovereignty, transparent math, and zero third-party
            monetization.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 pt-8 border-t border-hairline">
          {PRINCIPLES.map((item, idx) => (
            <div key={idx} className="space-y-2">
              <p className="type-caption-uppercase text-muted-soft mb-1">0{idx + 1}</p>
              <h3 className="type-title-md text-ink">{item.title}</h3>
              <p className="type-body-sm text-body">{item.description}</p>
            </div>
          ))}
        </div>

        {onOpenPrivacySettings && (
          <div className="mt-14 pt-8 border-t border-hairline flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <span className="type-caption text-muted">
              Session data can be purged instantly in privacy settings.
            </span>
            <button type="button" onClick={onOpenPrivacySettings} className="btn-text">
              <span>Manage data controls</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
