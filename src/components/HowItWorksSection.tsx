import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface HowItWorksSectionProps {
  onOpenUpload: () => void;
  onLoadGolden?: () => void;
  isLoadingGolden?: boolean;
}

const STEPS = [
  {
    index: '01',
    title: 'Upload',
    body: 'Your bank or mobile-money statement.',
    note: 'bKash, Nagad, City Bank, BRAC, EBL, or CSV',
  },
  {
    index: '02',
    title: 'Understand',
    body: 'Transactions become organized spending patterns.',
    note: 'Categorized with evidence and math formulas',
  },
  {
    index: '03',
    title: 'Act',
    body: 'See realistic opportunities to save.',
    note: 'Calculate the recovery of small leaks',
  },
];

export const HowItWorksSection: React.FC<HowItWorksSectionProps> = ({
  onOpenUpload,
}) => {
  return (
    <section id="how-it-works" className="band bg-canvas border-b border-hairline">
      <div className="shell">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-16 gap-4">
          <div>
            <p className="type-caption-uppercase text-muted mb-2">How it works</p>
            <h2 className="type-display-md text-ink">Three simple steps.</h2>
          </div>
          <button type="button" onClick={onOpenUpload} className="btn-text self-start">
            <span>Start with your statement</span>
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 border-t border-hairline">
          {STEPS.map((step, idx) => (
            <div
              key={step.index}
              className={`py-10 md:py-12 ${idx > 0 ? 'border-t md:border-t-0 md:border-l border-hairline' : ''} ${
                idx === 0 ? '' : 'md:pl-10 lg:pl-12'
              } ${idx < STEPS.length - 1 ? 'md:pr-10 lg:pr-12' : ''}`}
            >
              <p className="font-figure type-display-lg text-muted-soft mb-6 select-none">
                {step.index}
              </p>
              <h3 className="type-title-md text-ink mb-3">{step.title}</h3>
              <p className="type-body-md text-body max-w-xs">{step.body}</p>
              <p className="type-caption text-muted-soft mt-6">{step.note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
