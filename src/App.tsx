import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { DashboardView } from './components/DashboardView';
import { UploadView } from './components/UploadView';
import { ReviewView } from './components/ReviewView';
import { TransactionsView } from './components/TransactionsView';
import { InsightsView } from './components/InsightsView';
import { GoalsView } from './components/GoalsView';
import { SettingsView } from './components/SettingsView';
import { EvidenceModal } from './components/EvidenceModal';
import { Footer } from './components/Footer';

import { 
  DashboardSummary, 
  Transaction, 
  Category, 
  InsightRecommendation, 
  SavingsGoal, 
  DocumentRecord 
} from './types';
import { Check } from 'lucide-react';

export function App() {
  // Navigation: currentPage separates the Landing Page from the App / Financial Desk
  const [currentPage, setCurrentPage] = useState<'landing' | 'app'>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (['dashboard', 'transactions', 'review', 'insights', 'goals', 'upload', 'settings', 'app'].includes(hash)) {
        return 'app';
      }
    }
    return 'landing';
  });

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (['dashboard', 'transactions', 'review', 'insights', 'goals', 'upload', 'settings'].includes(hash)) {
        return hash;
      }
    }
    return 'dashboard';
  });

  const [locale, setLocale] = useState<'en' | 'bn'>('en');
  
  // Data states
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [insights, setInsights] = useState<InsightRecommendation[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  
  // Modals & inspect states
  const [selectedTransactionForEvidence, setSelectedTransactionForEvidence] = useState<Transaction | null>(null);
  const [isLoadingGolden, setIsLoadingGolden] = useState<boolean>(false);
  const [isRefreshingInsights, setIsRefreshingInsights] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Primary data loader
  const loadAllData = useCallback(async () => {
    try {
      const [dashRes, txRes, catRes, insRes, goalsRes, docsRes] = await Promise.all([
        fetch('/v1/dashboard'),
        fetch('/v1/transactions'),
        fetch('/v1/categories'),
        fetch('/v1/insights'),
        fetch('/v1/goals'),
        fetch('/v1/uploads'),
      ]);

      if (dashRes.ok) {
        const d = await dashRes.json();
        setSummary(d.data);
      }
      if (txRes.ok) {
        const t = await txRes.json();
        setTransactions(t.data || []);
      }
      if (catRes.ok) {
        const c = await catRes.json();
        setCategories(c.data || []);
      }
      if (insRes.ok) {
        const i = await insRes.json();
        setInsights(i.data || []);
      }
      if (goalsRes.ok) {
        const g = await goalsRes.json();
        setGoals(g.data || []);
      }
      if (docsRes.ok) {
        const doc = await docsRes.json();
        setDocuments(doc.data || []);
      }
    } catch (err) {
      console.error('Failed to load application data:', err);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Handle hash changes if user uses browser forward/back
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (['dashboard', 'transactions', 'review', 'insights', 'goals', 'upload', 'settings'].includes(hash)) {
        setCurrentPage('app');
        setActiveTab(hash);
      } else if (hash === '' || hash === 'landing') {
        setCurrentPage('landing');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Navigation helpers
  const navigateToLanding = () => {
    setCurrentPage('landing');
    window.location.hash = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToDashboard = () => {
    setCurrentPage('app');
    setActiveTab('dashboard');
    window.location.hash = 'dashboard';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToTab = (tab: string) => {
    setCurrentPage('app');
    setActiveTab(tab);
    window.location.hash = tab;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Load Golden Sample Dataset (bKash, Nagad & Bank)
  const handleLoadGolden = async () => {
    setIsLoadingGolden(true);
    try {
      const res = await fetch('/v1/dataset/load-golden', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await loadAllData();
        showToast('Sample dataset loaded into ledger.');
      }
    } catch (err) {
      console.error('Failed to load golden dataset:', err);
    } finally {
      setIsLoadingGolden(false);
    }
  };

  // Confirm review item
  const handleConfirmTransaction = async (txId: string) => {
    try {
      const res = await fetch(`/v1/transactions/${txId}/confirm`, { method: 'POST' });
      if (res.ok) {
        await loadAllData();
        showToast('Transaction confirmed.');
      }
    } catch (err) {
      console.error('Confirmation error:', err);
    }
  };

  // Update / In-line edit transaction
  const handleUpdateTransaction = async (txId: string, updates: Partial<Transaction>) => {
    try {
      const res = await fetch(`/v1/transactions/${txId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await loadAllData();
        showToast('Transaction updated.');
      }
    } catch (err) {
      console.error('Transaction update error:', err);
    }
  };

  // Goal operations
  const handleCreateGoal = async (goalData: Omit<SavingsGoal, 'id' | 'current_amount'>) => {
    try {
      const res = await fetch('/v1/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goalData),
      });
      if (res.ok) {
        await loadAllData();
        showToast('Target registered.');
      }
    } catch (err) {
      console.error('Goal creation failed:', err);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    try {
      const res = await fetch(`/v1/goals/${goalId}`, { method: 'DELETE' });
      if (res.ok) {
        await loadAllData();
        showToast('Target removed.');
      }
    } catch (err) {
      console.error('Failed to delete goal:', err);
    }
  };

  const handleRefreshInsights = async () => {
    setIsRefreshingInsights(true);
    try {
      await loadAllData();
      showToast('Insights refreshed.');
    } finally {
      setIsRefreshingInsights(false);
    }
  };

  const handleResetData = async () => {
    const res = await fetch('/v1/settings/reset', { method: 'POST' });
    if (res.ok) {
      await loadAllData();
      showToast('Session memory cleared.');
    }
  };

  const handleCommitCalculatorSavings = async (amount: number) => {
    await handleCreateGoal({
      title: 'Leak Recovery Plan',
      target_amount: amount * 3,
      target_date: '2026-12-31',
    });
    navigateToTab('goals');
    showToast(`৳${amount.toLocaleString()}/mo plan saved to targets.`);
  };

  const needsReviewCount = summary?.needs_review_count || 0;

  return (
    <div className="min-h-screen bg-[#F6F1E8] text-[#171717] flex flex-col font-sans selection:bg-[#B7F34A] selection:text-[#171717]">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#171717] text-[#F6F1E8] text-xs font-mono px-4 py-3 border border-[#171717] shadow-[2px_2px_0px_#171717] flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Check className="w-3.5 h-3.5 text-[#B7F34A]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Restrained Context-Aware Navbar */}
      <Navbar
        currentPage={currentPage}
        activeTab={activeTab}
        setActiveTab={navigateToTab}
        onNavigateLanding={navigateToLanding}
        onNavigateDashboard={navigateToDashboard}
        needsReviewCount={needsReviewCount}
        locale={locale}
        setLocale={setLocale}
        onLoadGolden={handleLoadGolden}
        isLoadingGolden={isLoadingGolden}
        onOpenUpload={() => navigateToTab('upload')}
      />

      {/* Conditional Rendering: Separate Landing Page vs Dedicated App / Dashboard Page */}
      {currentPage === 'landing' ? (
        /* Dedicated Standalone Landing Page */
        <LandingPage
          locale={locale}
          onOpenDashboard={navigateToDashboard}
          onOpenUpload={() => navigateToTab('upload')}
          onLoadGolden={async () => {
            await handleLoadGolden();
            navigateToDashboard();
          }}
          isLoadingGolden={isLoadingGolden}
          onOpenTransactions={() => navigateToTab('transactions')}
          onOpenInsights={() => navigateToTab('insights')}
          onOpenSettings={() => navigateToTab('settings')}
          onCommitCalculatorSavings={handleCommitCalculatorSavings}
          summary={summary}
        />
      ) : (
        /* Dedicated Standalone Financial Desk & Workspaces */
        <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-8 md:px-12 py-8 sm:py-12">
          {activeTab === 'dashboard' && (
            <DashboardView
              summary={summary}
              locale={locale}
              onNavigateTab={navigateToTab}
              onSelectTransaction={tx => setSelectedTransactionForEvidence(tx)}
              transactions={transactions}
              insights={insights}
              goals={goals}
              onLoadGolden={handleLoadGolden}
              isLoadingGolden={isLoadingGolden}
              onBackToLanding={navigateToLanding}
            />
          )}

          {activeTab === 'upload' && (
            <UploadView
              locale={locale}
              onUploadComplete={async () => {
                await loadAllData();
                navigateToTab('review');
                showToast('Statements processed.');
              }}
              onLoadGolden={handleLoadGolden}
              isLoadingGolden={isLoadingGolden}
              documents={documents}
            />
          )}

          {activeTab === 'review' && (
            <ReviewView
              transactions={transactions}
              categories={categories}
              locale={locale}
              onConfirmTransaction={handleConfirmTransaction}
              onUpdateTransaction={handleUpdateTransaction}
              onInspectEvidence={tx => setSelectedTransactionForEvidence(tx)}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionsView
              transactions={transactions}
              categories={categories}
              locale={locale}
              onInspectEvidence={tx => setSelectedTransactionForEvidence(tx)}
            />
          )}

          {activeTab === 'insights' && (
            <InsightsView
              insights={insights}
              locale={locale}
              onInspectEvidence={txId => {
                const tx = transactions.find(t => t.id === txId);
                if (tx) setSelectedTransactionForEvidence(tx);
              }}
              onRefreshInsights={handleRefreshInsights}
              isRefreshing={isRefreshingInsights}
            />
          )}

          {activeTab === 'goals' && (
            <GoalsView
              goals={goals}
              locale={locale}
              onCreateGoal={handleCreateGoal}
              onDeleteGoal={handleDeleteGoal}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              locale={locale}
              onResetData={handleResetData}
            />
          )}
        </main>
      )}

      {/* Document Evidence Inspector Modal */}
      {selectedTransactionForEvidence && (
        <EvidenceModal
          transaction={selectedTransactionForEvidence}
          onClose={() => setSelectedTransactionForEvidence(null)}
          locale={locale}
        />
      )}

      {/* Minimal Footer */}
      <Footer 
        onNavigateLanding={navigateToLanding}
        onNavigateDashboard={navigateToDashboard}
        onNavigateTab={navigateToTab}
      />

    </div>
  );
}

export default App;
