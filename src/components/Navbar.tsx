import React, { useState } from 'react';
import { 
  Menu, 
  X, 
  ArrowUpRight, 
  ArrowLeft, 
  LayoutDashboard, 
  FileText, 
  AlertTriangle, 
  Lightbulb, 
  Target, 
  Upload, 
  Settings,
  Sparkles
} from 'lucide-react';

interface NavbarProps {
  currentPage: 'landing' | 'app';
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onNavigateLanding: () => void;
  onNavigateDashboard: () => void;
  needsReviewCount?: number;
  locale: 'en' | 'bn';
  setLocale: (l: 'en' | 'bn') => void;
  onLoadGolden?: () => void;
  isLoadingGolden?: boolean;
  onOpenUpload?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPage,
  activeTab,
  setActiveTab,
  onNavigateLanding,
  onNavigateDashboard,
  needsReviewCount = 0,
  locale,
  setLocale,
  onLoadGolden,
  isLoadingGolden = false,
  onOpenUpload,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToLandingSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    if (currentPage !== 'landing') {
      onNavigateLanding();
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const appTabs = [
    { id: 'dashboard', label: locale === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard', icon: LayoutDashboard },
    { id: 'transactions', label: locale === 'bn' ? 'খতিয়ান' : 'Ledger', icon: FileText },
    { 
      id: 'review', 
      label: locale === 'bn' ? 'যাচাই ডেক্স' : 'Review Queue', 
      icon: AlertTriangle, 
      badge: needsReviewCount > 0 ? needsReviewCount : undefined 
    },
    { id: 'insights', label: locale === 'bn' ? 'লিক ও প্যাটার্ন' : 'Money Leaks', icon: Lightbulb },
    { id: 'goals', label: locale === 'bn' ? 'টার্গেট' : 'Targets', icon: Target },
    { id: 'upload', label: locale === 'bn' ? 'আপলোড' : 'Upload', icon: Upload },
    { id: 'settings', label: locale === 'bn' ? 'সেটিংস' : 'Settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#F6F1E8]/95 backdrop-blur-xs border-b border-[#171717] w-full transition-colors">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 md:px-12 h-18 flex items-center justify-between gap-4">
        
        {/* Left: Brand / Editorial Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => {
              if (currentPage === 'landing') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              } else {
                onNavigateLanding();
              }
            }}
            className="text-left group cursor-pointer"
            title="Go to Homepage"
          >
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-lg md:text-xl tracking-tight text-[#171717]">
                Kothay Gelo?
              </span>
              {currentPage === 'app' ? (
                <span className="font-mono text-[10px] bg-[#171717] text-[#F6F1E8] px-2 py-0.5 font-bold uppercase tracking-wider hidden sm:inline-block">
                  DESK
                </span>
              ) : null}
            </div>
            <div className="font-bangla text-[11px] text-[#171717]/60 -mt-0.5 tracking-normal">
              টাকাটা গেল কোথায়?
            </div>
          </button>

          {/* If in App workspace: Quick Back to Landing Link */}
          {currentPage === 'app' && (
            <button
              onClick={onNavigateLanding}
              className="hidden lg:flex items-center gap-1 text-xs font-mono text-[#171717]/70 hover:text-[#171717] pl-3 border-l border-[#171717]/20 py-1 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Landing</span>
            </button>
          )}
        </div>

        {/* Center Navigation: Context-aware (Landing vs App) */}
        {currentPage === 'landing' ? (
          /* Landing Page Navigation Links */
          <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-display font-medium text-[#171717]">
            <button
              onClick={() => scrollToLandingSection('how-it-works')}
              className="text-[#171717]/80 hover:text-[#171717] transition-colors cursor-pointer"
            >
              How it works
            </button>
            
            <button
              onClick={() => scrollToLandingSection('insights-section')}
              className="text-[#171717]/80 hover:text-[#171717] transition-colors cursor-pointer"
            >
              Insights
            </button>

            <button
              onClick={() => scrollToLandingSection('what-if-section')}
              className="text-[#171717]/80 hover:text-[#171717] transition-colors cursor-pointer"
            >
              What-if
            </button>

            <button
              onClick={() => scrollToLandingSection('privacy-section')}
              className="text-[#171717]/80 hover:text-[#171717] transition-colors cursor-pointer"
            >
              Privacy
            </button>
          </nav>
        ) : (
          /* App / Dashboard Tab Navigation Bar */
          <nav className="hidden md:flex items-center gap-1 text-xs font-display font-medium">
            {appTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-2.5 py-1.5 transition-colors cursor-pointer flex items-center gap-1.5 border relative ${
                    isActive
                      ? 'bg-[#171717] text-[#F6F1E8] border-[#171717] font-semibold'
                      : 'bg-transparent text-[#171717]/80 border-transparent hover:border-[#171717]/30 hover:bg-[#171717]/5'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#B7F34A]' : 'text-[#171717]/60'}`} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className="ml-0.5 bg-[#FF725E] text-white text-[9px] font-mono px-1 py-0 font-bold">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        )}

        {/* Right Actions */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          {/* Language Switcher */}
          <button
            onClick={() => setLocale(locale === 'en' ? 'bn' : 'en')}
            className="text-xs font-mono font-medium px-2.5 py-1 border border-[#171717]/30 hover:border-[#171717] transition-colors cursor-pointer"
            title="Toggle English / Bangla"
          >
            {locale === 'en' ? 'বাং' : 'EN'}
          </button>

          {currentPage === 'landing' ? (
            /* Landing Page Actions: Open Dashboard + Upload */
            <div className="flex items-center gap-2">
              <button
                onClick={onNavigateDashboard}
                className="btn-accent-green text-xs py-2 px-3.5 flex items-center gap-1.5"
              >
                <span>Open Dashboard</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  if (onOpenUpload) onOpenUpload();
                  else {
                    setActiveTab('upload');
                    onNavigateDashboard();
                  }
                }}
                className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5"
              >
                <span>Upload</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            /* App Workspace Actions: Upload / Add Statement */
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('upload')}
                className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">+ Statement</span>
              </button>
            </div>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            onClick={() => setLocale(locale === 'en' ? 'bn' : 'en')}
            className="text-xs font-mono px-2 py-1 border border-[#171717]/40"
          >
            {locale === 'en' ? 'বাং' : 'EN'}
          </button>

          {currentPage === 'landing' ? (
            <button
              onClick={onNavigateDashboard}
              className="text-xs font-mono font-bold bg-[#B7F34A] border border-[#171717] px-2.5 py-1"
            >
              Dashboard
            </button>
          ) : (
            <button
              onClick={onNavigateLanding}
              className="text-xs font-mono border border-[#171717] px-2 py-1"
            >
              Home
            </button>
          )}

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-[#171717] border border-[#171717] hover:bg-[#171717]/5"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[#171717] bg-[#F6F1E8] px-6 py-6 space-y-4">
          
          {currentPage === 'landing' ? (
            /* Mobile Landing Links */
            <div className="flex flex-col space-y-3 font-display font-medium text-base">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigateDashboard();
                }}
                className="text-left py-2 font-bold text-[#171717] flex items-center justify-between border-b border-[#171717]/20"
              >
                <span>Launch Financial Dashboard</span>
                <span className="bg-[#B7F34A] text-xs font-mono px-2 py-0.5 border border-[#171717]">OPEN</span>
              </button>
              
              <button
                onClick={() => scrollToLandingSection('how-it-works')}
                className="text-left py-1 text-[#171717]/80"
              >
                How it works
              </button>
              <button
                onClick={() => scrollToLandingSection('insights-section')}
                className="text-left py-1 text-[#171717]/80"
              >
                Insights
              </button>
              <button
                onClick={() => scrollToLandingSection('what-if-section')}
                className="text-left py-1 text-[#171717]/80"
              >
                What if calculator
              </button>
              <button
                onClick={() => scrollToLandingSection('privacy-section')}
                className="text-left py-1 text-[#171717]/80"
              >
                Privacy
              </button>
              
              <div className="pt-2">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (onOpenUpload) onOpenUpload();
                    else {
                      setActiveTab('upload');
                      onNavigateDashboard();
                    }
                  }}
                  className="btn-primary w-full justify-center"
                >
                  Upload transactions →
                </button>
              </div>
            </div>
          ) : (
            /* Mobile App Navigation Tabs */
            <div className="flex flex-col space-y-2">
              <div className="pb-2 mb-2 border-b border-[#171717]/20 flex items-center justify-between">
                <span className="font-mono text-xs uppercase font-bold text-[#171717]/70">
                  WORKSPACE DESK
                </span>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigateLanding();
                  }}
                  className="font-mono text-xs text-[#171717] underline"
                >
                  ← Back to Home
                </button>
              </div>

              {appTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`text-left py-2 px-3 flex items-center justify-between border ${
                      isActive
                        ? 'bg-[#171717] text-[#F6F1E8] border-[#171717] font-bold'
                        : 'border-[#171717]/20 text-[#171717]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <span className="font-display text-sm">{tab.label}</span>
                    </div>
                    {tab.badge !== undefined && (
                      <span className="bg-[#FF725E] text-white text-[10px] font-mono px-1.5 py-0.5 font-bold">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

        </div>
      )}
    </header>
  );
};
