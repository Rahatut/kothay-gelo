import React from 'react';

interface FooterProps {
  onNavigateTab?: (tab: string) => void;
  onNavigateLanding?: () => void;
  onNavigateDashboard?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ 
  onNavigateTab, 
  onNavigateLanding, 
  onNavigateDashboard 
}) => {
  const scrollTo = (id: string) => {
    if (onNavigateLanding) {
      onNavigateLanding();
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="bg-[#F6F1E8] border-t border-[#171717] py-14 sm:py-16 text-[#171717]">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-12 md:px-16">
        
        {/* Top: Logo & Navigation */}
        <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-8 pb-12 border-b border-[#171717]/15">
          
          <div>
            <div className="font-display font-bold text-xl tracking-tight text-[#171717]">
              Kothay Gelo?
            </div>
            <div className="font-bangla text-xs text-[#171717]/60 mt-0.5">
              টাকার হিসাব, এবার একটু সহজ।
            </div>
          </div>

          <nav className="flex flex-wrap gap-x-8 gap-y-3 font-display text-sm font-medium text-[#171717]/80">
            <button 
              onClick={() => {
                if (onNavigateLanding) onNavigateLanding();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-[#171717] transition-colors cursor-pointer text-left"
            >
              Home / Landing
            </button>
            <button 
              onClick={() => {
                if (onNavigateDashboard) onNavigateDashboard();
                else if (onNavigateTab) onNavigateTab('dashboard');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-[#171717] transition-colors cursor-pointer text-left font-bold"
            >
              Financial Dashboard
            </button>
            <button 
              onClick={() => {
                if (onNavigateTab) onNavigateTab('transactions');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-[#171717] transition-colors cursor-pointer text-left"
            >
              Ledger
            </button>
            <button 
              onClick={() => scrollTo('how-it-works')}
              className="hover:text-[#171717] transition-colors cursor-pointer text-left"
            >
              How it works
            </button>
            <button 
              onClick={() => scrollTo('privacy-section')}
              className="hover:text-[#171717] transition-colors cursor-pointer text-left"
            >
              Privacy
            </button>
            <button 
              onClick={() => {
                if (onNavigateTab) onNavigateTab('upload');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-[#171717] transition-colors cursor-pointer text-left"
            >
              Upload Statements
            </button>
          </nav>

        </div>

        {/* Bottom: Small footer statement */}
        <div className="pt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-mono text-[#171717]/60">
          <div>
            Personal finance intelligence built for Bangladesh.
          </div>
          <div>
            © 2026 Kothay Gelo? · Dhaka, Bangladesh
          </div>
        </div>

      </div>
    </footer>
  );
};
