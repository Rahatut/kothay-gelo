import React from 'react';

interface FooterProps {
  onNavigateTab?: (tab: string) => void;
  onNavigateLanding?: () => void;
  onNavigateDashboard?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onNavigateTab,
  onNavigateLanding,
  onNavigateDashboard,
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

  const links = [
    {
      label: 'Home',
      onClick: () => {
        if (onNavigateLanding) onNavigateLanding();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    },
    {
      label: 'Financial dashboard',
      onClick: () => {
        if (onNavigateDashboard) onNavigateDashboard();
        else if (onNavigateTab) onNavigateTab('dashboard');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    },
    {
      label: 'Ledger',
      onClick: () => {
        if (onNavigateTab) onNavigateTab('transactions');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    },
    { label: 'How it works', onClick: () => scrollTo('how-it-works') },
    { label: 'Privacy', onClick: () => scrollTo('privacy-section') },
    {
      label: 'Upload statements',
      onClick: () => {
        if (onNavigateTab) onNavigateTab('upload');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    },
  ];

  return (
    <footer className="bg-canvas border-t border-hairline py-14 sm:py-16 text-body">
      <div className="shell">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-12 border-b border-hairline">
          <div className="md:col-span-4">
            <p className="type-title-md text-ink">Kothay Gelo?</p>
            <p className="font-bangla type-caption text-muted mt-1">টাকার হিসাব, এবার একটু সহজ।</p>
          </div>

          <nav className="md:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3" aria-label="Footer">
            {links.map((link) => (
              <button
                key={link.label}
                type="button"
                onClick={link.onClick}
                className="type-body-sm text-body hover:text-ink transition-colors text-left"
              >
                {link.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="type-caption text-muted">
            Personal finance intelligence built for Bangladesh.
          </p>
          <p className="type-caption text-muted-soft">
            © 2026 Kothay Gelo? · Dhaka, Bangladesh
          </p>
        </div>
      </div>
    </footer>
  );
};
