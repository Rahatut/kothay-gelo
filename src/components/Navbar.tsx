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
  TrendingUp,
} from 'lucide-react';

interface NavbarProps {
  /** 'auth' is treated as a landing surface: the sign-in step still shows the nav. */
  currentPage: 'landing' | 'app' | 'auth';
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

const LANDING_LINKS = [
  { id: 'how-it-works', label: 'How it works' },
  { id: 'insights-section', label: 'Insights' },
  { id: 'privacy-section', label: 'Privacy' },
];

export const Navbar: React.FC<NavbarProps> = ({
  currentPage,
  activeTab,
  setActiveTab,
  onNavigateLanding,
  onNavigateDashboard,
  needsReviewCount = 0,
  locale,
  setLocale,
  onOpenUpload,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToLandingSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    if (currentPage === 'app') {
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

  const openUpload = () => {
    if (onOpenUpload) {
      onOpenUpload();
    } else {
      setActiveTab('upload');
      onNavigateDashboard();
    }
  };

  const appTabs = [
    {
      id: 'dashboard',
      label: locale === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard',
      icon: LayoutDashboard,
    },
    { id: 'transactions', label: locale === 'bn' ? 'খতিয়ান' : 'Ledger', icon: FileText },
    {
      id: 'review',
      label: locale === 'bn' ? 'যাচাই ডেক্স' : 'Review Queue',
      icon: AlertTriangle,
      badge: needsReviewCount > 0 ? needsReviewCount : undefined,
    },
    { id: 'insights', label: locale === 'bn' ? 'লিক ও প্যাটার্ন' : 'Money Leaks', icon: Lightbulb },
    // The trends desk is a spec 004 surface and needs a nav entry to be reachable.
    // The rule that keeps the *entry trigger* out of the nav does not apply to a
    // whole desk.
    { id: 'trends', label: locale === 'bn' ? 'প্যাটার্ন' : 'Trends', icon: TrendingUp },
    { id: 'goals', label: locale === 'bn' ? 'টার্গেট' : 'Targets', icon: Target },
    { id: 'upload', label: locale === 'bn' ? 'আপলোড' : 'Upload', icon: Upload },
    { id: 'settings', label: locale === 'bn' ? 'সেটিংস' : 'Settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 bg-canvas/95 backdrop-blur-xs border-b border-hairline w-full">
      <div className="shell h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (currentPage === 'landing') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              } else {
                onNavigateLanding();
              }
            }}
            className="text-left cursor-pointer"
            title="Go to homepage"
          >
            <span className="type-title-md text-ink">Kothay Gelo?</span>
            <span className="font-bangla text-[11px] text-muted block leading-none mt-0.5">
              টাকাটা গেল কোথায়?
            </span>
          </button>

          {currentPage === 'app' && (
            <button
              type="button"
              onClick={onNavigateLanding}
              className="hidden lg:flex items-center gap-1 type-caption text-muted hover:text-ink pl-3 border-l border-hairline transition-colors"
            >
              <ArrowLeft className="w-3 h-3" aria-hidden="true" />
              <span>Landing</span>
            </button>
          )}
        </div>

        {currentPage === 'landing' ? (
          <nav className="hidden md:flex items-center gap-7" aria-label="Primary">
            {LANDING_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => scrollToLandingSection(link.id)}
                className="type-body-sm font-medium text-body hover:text-ink transition-colors"
              >
                {link.label}
              </button>
            ))}
          </nav>
        ) : (
          <nav className="hidden md:flex items-center gap-1" aria-label="Workspace">
            {appTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-3 py-2 rounded-md transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-surface-strong text-ink'
                      : 'text-body hover:text-ink hover:bg-surface-strong/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="type-body-sm font-medium whitespace-nowrap">{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className="ml-0.5 font-figure text-[10px] font-semibold text-error tabular-nums">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        )}

        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setLocale(locale === 'en' ? 'bn' : 'en')}
            className="btn-outline btn-sm"
            title="Toggle English / Bangla"
          >
            {locale === 'en' ? 'বাং' : 'EN'}
          </button>

          {currentPage === 'landing' ? (
            <button type="button" onClick={onNavigateDashboard} className="btn-primary btn-sm">
              <span>Open dashboard</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          ) : (
            <button type="button" onClick={openUpload} className="btn-primary btn-sm">
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden lg:inline">Add statement</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setLocale(locale === 'en' ? 'bn' : 'en')}
            className="btn-outline btn-sm"
            title="Toggle English / Bangla"
          >
            {locale === 'en' ? 'বাং' : 'EN'}
          </button>
          <button type="button" onClick={onNavigateLanding} className="btn-outline btn-sm">
            Home
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="btn-outline btn-sm"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Menu className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-hairline bg-canvas px-6 py-6">
          {currentPage === 'landing' ? (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigateDashboard();
                }}
                className="type-body-md font-medium text-ink text-left py-3 flex items-center justify-between border-b border-hairline mb-2"
              >
                <span>Launch financial dashboard</span>
                <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
              </button>

              {LANDING_LINKS.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => scrollToLandingSection(link.id)}
                  className="type-body-md text-body text-left py-3"
                >
                  {link.label}
                </button>
              ))}

              <div className="pt-4">
                <button type="button" onClick={openUpload} className="btn-primary w-full">
                  Upload transactions
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="type-caption-uppercase text-muted mb-3 pb-3 border-b border-hairline">
                Workspace desk
              </p>

              {appTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`type-body-md text-left py-3 px-3 rounded-md flex items-center justify-between ${
                      isActive ? 'bg-surface-strong text-ink' : 'text-body'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="w-4 h-4" aria-hidden="true" />
                      {tab.label}
                    </span>
                    {tab.badge !== undefined && (
                      <span className="font-figure text-[10px] font-semibold text-error tabular-nums">
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
