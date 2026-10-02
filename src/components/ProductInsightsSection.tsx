import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface ProductInsightsSectionProps {
  onExploreClue?: () => void;
}

const INSIGHTS = [
  {
    tag: 'Pattern',
    title: 'Your Friday spending is consistently higher.',
    detail:
      'Recreational dining and ride-hailing peak significantly after 6:00 PM on Thursdays and Fridays.',
  },
  {
    tag: 'Leak',
    title: 'Small food orders added up to ৳3,240.',
    detail:
      '14 micro-orders under ৳350, each carrying an extra ৳35–৳60 in delivery and platform surcharges.',
  },
  {
    tag: 'Change',
    title: 'Reducing two orders a week could save ~৳1,800/month.',
    detail:
      'A simple adjustment that preserves convenience while recapturing unnecessary fee overhead.',
    highlight: true,
  },
  {
    tag: 'Trend',
    title: 'Transport spending increased 18% this month.',
    detail:
      'Higher proportion of car rides during peak rain and commute hours compared to last month.',
  },
];

export const ProductInsightsSection: React.FC<ProductInsightsSectionProps> = ({
  onExploreClue,
}) => {
  return (
    <section id="insights-section" className="relative band bg-canvas-soft border-b border-hairline overflow-hidden">
      <div className="orb orb-lavender w-[480px] h-[480px] -bottom-32 -left-24 opacity-50" aria-hidden="true" />

      <div className="shell relative z-10">
        <div className="max-w-2xl mb-16">
          <p className="type-caption-uppercase text-muted mb-3">Product insights</p>
          <h2 className="type-display-lg text-ink mb-4">Your money leaves clues.</h2>
          <p className="type-body-md text-body">
            Kothay Gelo? turns transaction history into understandable patterns.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {INSIGHTS.map((item, idx) => (
            <article key={idx} className="feature-card feature-card-interactive flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-hairline">
                  <span className="type-caption-uppercase text-muted">{item.tag}</span>
                  <span className="type-caption text-muted-soft">0{idx + 1}</span>
                </div>

                <h3 className="type-title-sm text-ink mb-3">{item.title}</h3>
                <p className="type-caption text-body">{item.detail}</p>
              </div>

              {item.highlight && (
                <div className="mt-6 pt-4 border-t border-hairline">
                  <span className="badge-pill">Actionable recovery</span>
                </div>
              )}
            </article>
          ))}
        </div>

        {onExploreClue && (
          <div className="mt-10 flex justify-end">
            <button type="button" onClick={onExploreClue} className="btn-text">
              <span>Explore all patterns in the desk</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export const LeaksMasonrySection = ProductInsightsSection;
