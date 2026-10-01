import React, { useState } from 'react';
import { ArrowUpRight, ArrowDown } from 'lucide-react';

interface HeroSectionProps {
  locale: 'en' | 'bn';
  onOpenUpload: () => void;
  onLoadGolden: () => void;
  isLoadingGolden?: boolean;
  onNavigateToDesk?: () => void;
  onOpenDashboard?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  locale,
  onOpenUpload,
  onLoadGolden,
  isLoadingGolden = false,
  onNavigateToDesk,
  onOpenDashboard,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleDashboardClick = () => {
    if (onOpenDashboard) {
      onOpenDashboard();
    } else if (onNavigateToDesk) {
      onNavigateToDesk();
    }
  };

  return (
    <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 border-b border-[#171717] bg-[#F6F1E8]">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-12 md:px-16">
        
        {/* Editorial 12-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          
          {/* Left Column (7 columns): Large headline & concise explanation */}
          <div className="lg:col-span-7 flex flex-col justify-center pt-2">
            
            {/* Eyebrow */}
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-[#171717]/60 mb-6 select-none">
              PERSONAL FINANCE, WITHOUT THE SPREADSHEET.
            </div>

            {/* Main Headline in Bangla */}
            <h1 className="font-bangla font-black text-[#171717] text-5xl sm:text-6xl md:text-7xl lg:text-[80px] leading-[1.05] tracking-tight mb-6">
              টাকাটা গেল কোথায়?
            </h1>

            {/* English Supporting Line */}
            <div className="font-display text-lg sm:text-xl text-[#171717]/80 max-w-xl leading-relaxed mb-10 space-y-1">
              <p>See where your money went.</p>
              <p>Understand the patterns. Find what you can change.</p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={handleDashboardClick}
                className="btn-accent-green flex items-center gap-2"
              >
                <span>Open Dashboard</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>

              <button
                onClick={onOpenUpload}
                className="btn-primary flex items-center gap-2"
              >
                <span>Upload transactions</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>

              <button
                onClick={async () => {
                  await onLoadGolden();
                  handleDashboardClick();
                }}
                disabled={isLoadingGolden}
                className="btn-secondary flex items-center gap-2"
              >
                <span>{isLoadingGolden ? 'Loading example...' : 'Explore live demo'}</span>
                <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
              </button>
            </div>

          </div>

          {/* Right Column (5 columns): One beautifully designed financial insight card */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div 
              onClick={handleDashboardClick}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className="w-full max-w-[420px] bg-[#FFFFFF] border border-[#171717] p-8 transition-all duration-200 cursor-pointer select-none relative"
              style={{
                boxShadow: isHovered ? '4px 4px 0 #171717' : '2px 2px 0 #171717'
              }}
              title="Click to open financial dashboard"
            >
              
              {/* Header / Month indicator */}
              <div className="flex items-center justify-between border-b border-[#171717]/20 pb-4 mb-6">
                <span className="font-mono text-xs uppercase tracking-widest text-[#171717]/60">
                  ACTIVE FINANCIAL DESK
                </span>
                <span className="font-mono text-[11px] text-[#171717]/60 bg-[#F6F1E8] px-2 py-0.5 border border-[#171717]/20 flex items-center gap-1">
                  <span>OPEN DASHBOARD</span>
                  <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>

              {/* Primary Spend */}
              <div className="mb-8">
                <div className="font-mono text-xs text-[#171717]/70 uppercase tracking-wide mb-1">
                  You spent
                </div>
                <div className="font-display font-black text-4xl sm:text-5xl text-[#171717] tracking-tight">
                  ৳42,680
                </div>
              </div>

              {/* Itemized Categories */}
              <div className="space-y-4 mb-8">
                
                {/* Food & delivery with Pattern Micro-interaction */}
                <div 
                  className={`p-3 -mx-3 border transition-colors duration-200 relative ${
                    isHovered 
                      ? 'bg-[#FFD84D]/25 border-[#171717]' 
                      : 'border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-display font-medium text-sm text-[#171717]">
                      Food & delivery
                    </div>
                    <div className="font-mono font-bold text-sm text-[#171717]">
                      ৳11,420
                    </div>
                  </div>

                  {/* Micro-interaction annotation */}
                  {isHovered && (
                    <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] font-bold text-[#171717] tracking-wider uppercase">
                      <span className="w-1.5 h-1.5 bg-[#FF725E] inline-block"></span>
                      <span>FOUND A PATTERN — 14 orders in 30 days</span>
                    </div>
                  )}
                </div>

                {/* Transport */}
                <div className="flex items-center justify-between px-0 py-1">
                  <div className="font-display font-medium text-sm text-[#171717]/80">
                    Transport
                  </div>
                  <div className="font-mono font-medium text-sm text-[#171717]">
                    ৳6,850
                  </div>
                </div>

                {/* Subscriptions */}
                <div className="flex items-center justify-between px-0 py-1">
                  <div className="font-display font-medium text-sm text-[#171717]/80">
                    Subscriptions
                  </div>
                  <div className="font-mono font-medium text-sm text-[#171717]">
                    ৳2,340
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-[#171717] pt-6">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="font-mono text-xs uppercase tracking-wider text-[#171717]/60 mb-0.5">
                      Possible saving
                    </div>
                    <div className="font-display font-bold text-xl sm:text-2xl text-[#171717] flex items-baseline gap-1">
                      <span className="bg-[#B7F34A] px-1.5 py-0.5 border border-[#171717]">
                        ৳4,200
                      </span>
                      <span className="font-mono text-xs font-normal text-[#171717]/70">
                        / month
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[11px] text-[#171717]/50 block">
                      3 action points
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* 13. Trust Signal: Quiet, Understated immediately beneath hero */}
        <div className="mt-16 md:mt-24 pt-8 border-t border-[#171717]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-mono text-[#171717]/70">
          <div className="font-bold text-[#171717] tracking-wider uppercase">
            YOUR FINANCES STAY YOURS.
          </div>
          <div>
            Built around privacy, transparency and user control.
          </div>
        </div>

      </div>
    </section>
  );
};
