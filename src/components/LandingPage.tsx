import React from 'react';
import { HeroSection } from './HeroSection';
import { ProblemSection } from './ProblemSection';
import { ComparisonSection } from './ComparisonSection';
import { HowItWorksSection } from './HowItWorksSection';
import { ProductInsightsSection } from './ProductInsightsSection';
import { BangladeshMessySection } from './BangladeshMessySection';
import { SampleTransactionsSection } from './SampleTransactionsSection';
import { TrustSection } from './TrustSection';
import { FinalCTASection } from './FinalCTASection';
import { DashboardSummary } from '../types';

interface LandingPageProps {
  locale: 'en' | 'bn';
  onOpenDashboard: () => void;
  onOpenUpload: () => void;
  onLoadGolden: () => void;
  isLoadingGolden: boolean;
  onOpenTransactions: () => void;
  onOpenInsights: () => void;
  onOpenSettings: () => void;
  summary: DashboardSummary | null;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  locale,
  onOpenDashboard,
  onOpenUpload,
  onLoadGolden,
  isLoadingGolden,
  onOpenTransactions,
  onOpenInsights,
  onOpenSettings,
}) => {
  return (
    <main className="flex-1 w-full">
      {/* 1. Hero Section */}
      <HeroSection
        locale={locale}
        onOpenUpload={onOpenUpload}
        onOpenDashboard={onOpenDashboard}
        onLoadGolden={onLoadGolden}
        isLoadingGolden={isLoadingGolden}
      />

      {/* 2. Problem Section */}
      <ProblemSection />

      {/* 3. "Typical Finance App" vs "Kothay Gelo?" */}
      <ComparisonSection onInvestigate={onOpenDashboard} />

      {/* 4. How It Works (01, 02, 03 timeline) */}
      <HowItWorksSection
        onOpenUpload={onOpenUpload}
        onLoadGolden={onLoadGolden}
        isLoadingGolden={isLoadingGolden}
      />

      {/* 5. Product Insights Section (Your money leaves clues) */}
      <ProductInsightsSection onExploreClue={onOpenInsights} />

      {/* 6. What-If Section (Slider + green result) */}

      {/* 7. Bangladesh Section (Made for how money moves here) */}
      <BangladeshMessySection />

      {/* 8. Sample Transaction Section (Raw logs + We found something) */}
      <SampleTransactionsSection onOpenLedger={onOpenTransactions} />

      {/* 9. Privacy Section (Your money is personal) */}
      <TrustSection onOpenPrivacySettings={onOpenSettings} />

      {/* 10. Final CTA */}
      <FinalCTASection
        onOpenUpload={onOpenUpload}
        onOpenDashboard={onOpenDashboard}
        onLoadGolden={onLoadGolden}
        isLoadingGolden={isLoadingGolden}
      />
    </main>
  );
};
