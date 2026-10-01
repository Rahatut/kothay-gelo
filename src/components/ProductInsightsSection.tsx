import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface ProductInsightsSectionProps {
  onExploreClue?: () => void;
}

export const ProductInsightsSection: React.FC<ProductInsightsSectionProps> = ({ onExploreClue }) => {
  const insights = [
    {
      tag: 'PATTERN',
      title: 'Your Friday spending is consistently higher.',
      detail: 'Recreational dining and ride-hailing peak significantly after 6:00 PM on Thursdays and Fridays.',
      tagColor: 'text-[#171717]',
    },
    {
      tag: 'LEAK',
      title: 'Small food orders added up to ৳3,240.',
      detail: '14 micro-orders under ৳350, each carrying an extra ৳35–৳60 in delivery and platform surcharges.',
      tagColor: 'text-[#FF725E]',
    },
    {
      tag: 'CHANGE',
      title: 'Reducing two orders a week could save ~৳1,800/month.',
      detail: 'A simple adjustment that preserves convenience while recapturing unnecessary fee overhead.',
      tagColor: 'text-[#171717]',
      highlight: true,
    },
    {
      tag: 'TREND',
      title: 'Transport spending increased 18% this month.',
      detail: 'Higher proportion of car rides during peak rain and commute hours compared to last month.',
      tagColor: 'text-[#171717]',
    },
  ];

  return (
    <section id="insights-section" className="py-20 md:py-28 border-b border-[#171717] bg-[#F6F1E8]">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-12 md:px-16">
        
        {/* Section Title & Subtitle */}
        <div className="max-w-2xl mb-16">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-[#171717]/60 mb-3">
            PRODUCT INSIGHTS
          </div>
          <h2 className="font-display font-medium text-3xl sm:text-4xl md:text-5xl text-[#171717] tracking-tight leading-[1.15] mb-4">
            Your money leaves clues.
          </h2>
          <p className="font-display text-base sm:text-lg text-[#171717]/70 leading-relaxed">
            Kothay Gelo? turns transaction history into understandable patterns.
          </p>
        </div>

        {/* 3-4 Insights Maximum as Small Editorial Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {insights.map((item, idx) => (
            <div 
              key={idx}
              className="bg-[#FFFFFF] border border-[#171717] p-6 sm:p-7 flex flex-col justify-between hover:border-[#171717] transition-all"
            >
              <div>
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#171717]/15">
                  <span className={`font-mono text-[11px] font-bold tracking-widest uppercase ${item.tagColor}`}>
                    {item.tag}
                  </span>
                  <span className="font-mono text-[10px] text-[#171717]/40">
                    0{idx + 1}
                  </span>
                </div>

                <h3 className="font-display font-semibold text-lg text-[#171717] leading-snug mb-3">
                  {item.title}
                </h3>

                <p className="font-display text-xs sm:text-sm text-[#171717]/70 leading-relaxed">
                  {item.detail}
                </p>
              </div>

              {item.highlight && (
                <div className="mt-6 pt-4 border-t border-[#171717]/15">
                  <span className="inline-block bg-[#B7F34A] text-[#171717] text-xs font-mono font-bold px-2 py-0.5 border border-[#171717]">
                    Actionable recovery
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {onExploreClue && (
          <div className="mt-10 text-right">
            <button
              onClick={onExploreClue}
              className="text-xs font-mono font-bold text-[#171717] inline-flex items-center gap-1 underline underline-offset-4 hover:no-underline"
            >
              <span>Explore all patterns in desk</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      </div>
    </section>
  );
};

export const LeaksMasonrySection = ProductInsightsSection;
