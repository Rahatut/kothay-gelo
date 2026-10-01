import React from 'react';

export const ProblemSection: React.FC = () => {
  return (
    <section className="py-20 md:py-28 border-b border-[#171717] bg-[#F6F1E8]">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-12 md:px-16">
        
        {/* Editorial Layout: Left small label, Right large statement + 3 simple typographic blocks */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
          
          {/* Left Column (3 cols): Small label */}
          <div className="lg:col-span-3">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[#171717]/60 block">
              THE PROBLEM
            </span>
          </div>

          {/* Right Column (9 cols): Large statement and 3 simple examples */}
          <div className="lg:col-span-9">
            
            <h2 className="font-display font-medium text-3xl sm:text-4xl md:text-5xl text-[#171717] leading-[1.15] tracking-tight mb-16 max-w-2xl">
              Your bank statement tells you what happened.
              <span className="block text-[#171717]/50 mt-2">
                It doesn't tell you why it keeps happening.
              </span>
            </h2>

            {/* Three Simple Examples: Simple Typographic Blocks */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 pt-8 border-t border-[#171717]/20">
              
              <div className="space-y-1">
                <div className="font-display font-bold text-2xl sm:text-3xl text-[#171717]">
                  ৳4,820
                </div>
                <div className="font-mono text-sm text-[#171717]/70">
                  Food delivery
                </div>
              </div>

              <div className="space-y-1">
                <div className="font-display font-bold text-2xl sm:text-3xl text-[#171717]">
                  ৳2,190
                </div>
                <div className="font-mono text-sm text-[#171717]/70">
                  Subscriptions
                </div>
              </div>

              <div className="space-y-1">
                <div className="font-display font-bold text-2xl sm:text-3xl text-[#171717]">
                  ৳3,450
                </div>
                <div className="font-mono text-sm text-[#171717]/70">
                  Impulse purchases
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
