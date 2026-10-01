import React from 'react';

export const BangladeshMessySection: React.FC = () => {
  const financialChannels = [
    'Bank accounts.',
    'bKash.',
    'Nagad.',
    'Cards.',
    'Cash.',
    'Monthly bills.',
    'Family expenses.',
    'Everyday spending.',
  ];

  return (
    <section className="py-20 md:py-28 border-b border-[#171717] bg-[#F6F1E8]">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-12 md:px-16">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          
          {/* Left Column (4 cols): Label & Context */}
          <div className="lg:col-span-4">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-[#171717]/60 mb-4">
              BANGLADESH CONTEXT
            </div>
            <h2 className="font-display font-medium text-2xl sm:text-3xl text-[#171717] leading-snug">
              MADE FOR HOW MONEY MOVES HERE.
            </h2>
          </div>

          {/* Right Column (8 cols): Typographic List & Core Proposition */}
          <div className="lg:col-span-8">
            
            {/* The financial channels list */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-8 mb-12 pb-12 border-b border-[#171717]/20">
              {financialChannels.map((item, idx) => (
                <div 
                  key={idx}
                  className="font-display font-medium text-2xl sm:text-3xl text-[#171717]"
                >
                  {item}
                </div>
              ))}
            </div>

            {/* Core statement */}
            <blockquote className="font-display text-2xl sm:text-3xl md:text-4xl text-[#171717] font-normal leading-snug max-w-2xl">
              “Your financial life doesn't fit neatly into one app.”
            </blockquote>

            <p className="font-display text-sm sm:text-base text-[#171717]/70 mt-4 max-w-xl leading-relaxed">
              Between mobile financial services, multiple bank cards, cash withdrawals at ATMs, and utility meters, spending is scattered across multiple channels. Kothay Gelo? unifies them into a single, cohesive audit without demanding your passwords.
            </p>

          </div>

        </div>

      </div>
    </section>
  );
};
