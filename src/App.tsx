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
import { type CreatedTransaction } from './components/ManualEntryView';
import {
  TrendsView,
  type TrendGranularity,
  type TrendPoint,
  type TrendSeries,
} from './components/TrendsView';
import { Footer } from './components/Footer';
import { AuthView } from './components/AuthView';

import { 
  DashboardSummary, 
  Transaction, 
  Category, 
  InsightRecommendation, 
  SavingsGoal, 
  DocumentRecord 
} from './types';
import { loadAllData as loadAppData } from './lib/dataLoader';
import { Check } from 'lucide-react';

export function App() {
  /**
   * Where the user is: the marketing page, the sign-in step, or the desk.
   *
   * Three states rather than two, and the order matters. The landing page is always
   * first -- including for somebody who already has a session -- and authentication
   * is asked for only when they ask to open the desk. Previously the session check
   * ran before anything rendered, so an unauthenticated visitor was dropped straight
   * onto a sign-in form and never saw the page at all.
   *
   * 'auth' is reachable only by choosing to enter the desk, which is what keeps the
   * gate honest: nobody is asked to create an account in order to read the landing
   * page.
   */
  const [currentPage, setCurrentPage] = useState<'landing' | 'auth' | 'app'>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (['dashboard', 'transactions', 'review', 'insights', 'goals', 'upload', 'settings', 'app'].includes(hash)) {
        // A deep link goes to the desk, which then routes itself to sign-in if the
        // session turns out to be missing.
        return 'app';
      }
    }
    return 'landing';
  });

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (['dashboard', 'transactions', 'review', 'insights', 'trends', 'goals', 'upload', 'settings'].includes(hash)) {
        return hash;
      }
    }
    return 'dashboard';
  });

  const [locale, setLocale] = useState<'en' | 'bn'>('en');
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Data states
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  /**
   * Which endpoints failed on the last load.
   *
   * Distinct from `summary` being null, which is also true while the first load is
   * in flight. Without this the dashboard cannot tell the two apart and shows its
   * loading state forever.
   */
  const [loadFailed, setLoadFailed] = useState<string[]>([]);
  /** A desk entry requested before the session check finished, so it can be honoured after. */
  const [pendingDeskEntry, setPendingDeskEntry] = useState(false);
  /** The tab a visitor was trying to reach when they were sent to sign in. */
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [insights, setInsights] = useState<InsightRecommendation[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  
  // Modals & inspect states
  const [selectedTransactionForEvidence, setSelectedTransactionForEvidence] = useState<Transaction | null>(null);
  /**
   * The trend series (spec 004).
   *
   * Fetched on demand rather than with the rest of the app: the eight capabilities
   * are the only sanctioned path to a figure, and this one needs a period and a
   * granularity chosen by the user, so folding it into `loadAllData` would mean
   * either always paying for it or inventing a client-side default.
   */
  const [trendSeries, setTrendSeries] = useState<TrendSeries | null>(null);
  const [trendPatterns, setTrendPatterns] = useState<{ id: string; title: string; title_bn?: string; summary: string }[]>([]);
  const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>('MONTHLY');
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [isLoadingGolden, setIsLoadingGolden] = useState<boolean>(false);
  const [isRefreshingInsights, setIsRefreshingInsights] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  
/**
 * Loads every screen's data, then publishes it.
 *
 * The load itself lives in `lib/dataLoader` so it can be tested without React; the
 * previous in-component version called `txRes.clone()` after the body was consumed,
 * threw, and was swallowed by a `catch` that only logged -- leaving `summary` null
 * and the dashboard on "Initializing the desk" indefinitely.
 *
 * `loadFailed` is tracked separately from the data for the same reason: a null
 * summary previously meant both "still loading" and "broken", so a failure looked
 * exactly like a slow network forever.
 */
  const loadAllData = useCallback(async () => {
    const data = await loadAppData();
    setSummary(data.summary);
    setTransactions(data.transactions);
    setCategories(data.categories);
    setInsights(data.insights);
    setGoals(data.goals);
    setDocuments(data.documents);
    setLoadFailed(data.failed);
    return data;
  }, []);

  useEffect(() => {
    fetch('/v1/auth/session', { credentials: 'include' })
      .then(response => {
        setIsAuthenticated(response.ok);
      })
      .catch(() => setIsAuthenticated(false))
      .finally(() => setAuthChecked(true));
  }, []);

  /**
   * Sends the visitor on to the desk once the session answer arrives.
   *
   * They pressed "open dashboard" while the check was still running, so the click
   * was parked rather than answered with a sign-in form -- somebody who is already
   * signed in should reach their dashboard, not a login screen.
   *
   * A deep link into the desk is handled here too: if the hash pointed at a tab but
   * there is no session, the desk is replaced by the sign-in step, which returns
   * them to the tab they wanted.
   */
  useEffect(() => {
    if (!authChecked) return;

    if (pendingDeskEntry) {
      setPendingDeskEntry(false);
      if (isAuthenticated) {
        void navigateToDashboard();
      }
      return;
    }

    // Arrived on a desk URL without a session. Show sign-in rather than an empty
    // desk, and remember the tab so it can be restored afterwards.
    if (!isAuthenticated && currentPage === 'app') {
      setPendingTab(activeTab);
      setCurrentPage('auth');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);

  useEffect(() => {
    if (isAuthenticated) loadAllData();
  }, [isAuthenticated, loadAllData]);

  // Handle hash changes if user uses browser forward/back
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (['dashboard', 'transactions', 'review', 'insights', 'trends', 'goals', 'upload', 'settings'].includes(hash)) {
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

  /**
   * Opens the desk, asking for a session only if there is not one already.
   *
   * While the session check is still in flight the user waits rather than being
   * shown a form they may not need: someone who is already signed in should land on
   * their dashboard, not on a sign-in screen.
   */
  const navigateToDashboard = async () => {
    if (!authChecked) {
      setPendingDeskEntry(true);
      return;
    }
    if (!isAuthenticated) {
      setCurrentPage('auth');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setPendingDeskEntry(false);
    setCurrentPage('app');
    setActiveTab('dashboard');
    window.location.hash = 'dashboard';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToTab = async (tab: string) => {
    // Entering any part of the desk needs an account, same as the dashboard.
    if (!isAuthenticated) {
      setPendingTab(tab);
      setCurrentPage('auth');
      return;
    }
    setCurrentPage('app');
    setActiveTab(tab);
    window.location.hash = tab;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Load Golden Sample Dataset (bKash, Nagad & Bank)
  const handleLoadGolden = async () => {
    setIsLoadingGolden(true);
    try {
      const res = await fetch('/v1/dataset/load-golden', {
        credentials: 'include', method: 'POST' });
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

  /**
   * Records a hand-entered transaction (spec 003).
   *
   * Re-throws with the server's field-scoped errors attached, because the form has
   * to mark the box that was refused rather than showing one general message.
   * Without the reload the new row would not appear in the list the user is looking
   * at, and the whole point of the action is that they can see it land.
   */
  const handleCreateTransaction = async (input: {
    transaction_date: string;
    amount: string;
    direction: string;
    description: string;
    merchant_name?: string;
  }): Promise<{ created: CreatedTransaction; duplicate: import('./types').DuplicateFlag | null; warnings: any[] }> => {
    const res = await fetch('/v1/transactions', {
      credentials: 'include',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      const failure = new Error(payload?.error?.message ?? 'That could not be recorded.') as Error & {
        errors?: any[];
        message: string;
      };
      failure.errors = payload?.errors ?? [];
      throw failure;
    }

    await loadAllData();
    showToast('Transaction recorded.');
    return {
      created: payload.data as CreatedTransaction,
      duplicate: (payload.duplicate_flag ?? null) as import('./types').DuplicateFlag | null,
      warnings: payload.warnings ?? [],
    };
  };

  /**
   * Loads the trend series for the current period at the chosen granularity.
   *
   * The period comes from the ledger, not from a client-chosen range: the server
   * resolves the month that has data, so the chart and the dashboard can never be
   * describing different periods (FR-020).
   */
  const loadTrends = useCallback(async (granularity: TrendGranularity) => {
    setTrendLoading(true);
    setTrendError(null);
    try {
      const period = await resolveLedgerPeriod();
      if (!period) {
        setTrendSeries(null);
        return;
      }

      const res = await fetch('/v1/capabilities/spending_patterns', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: { period, granularity } }),
      });
      if (!res.ok) {
        setTrendError('The trend could not be loaded.');
        return;
      }
      const payload = await res.json();
      if (!payload?.ok || !payload.data?.series) {
        setTrendError('The trend could not be loaded.');
        return;
      }
      setTrendSeries(payload.data.series as TrendSeries);
      setTrendPatterns((payload.data.patterns ?? []) as typeof trendPatterns);
    } catch {
      setTrendError('The trend could not be loaded.');
    } finally {
      setTrendLoading(false);
    }
  }, []);

  /** The period the ledger actually holds, resolved server-side. */
  const resolveLedgerPeriod = useCallback(async (): Promise<{ start: string; end: string } | null> => {
    const res = await fetch('/v1/dashboard', { credentials: 'include' });
    if (!res.ok) return null;
    const body = await res.json();
    const period = body?.data?.period;
    return period && period.start ? period : null;
  }, []);

  // Load on first visit to the tab, and whenever the grouping changes.
  useEffect(() => {
    if (isAuthenticated && activeTab === 'trends') {
      void loadTrends(trendGranularity);
    }
  }, [isAuthenticated, activeTab, trendGranularity, loadTrends]);

  // Confirm review item
  const handleConfirmTransaction = async (txId: string) => {
    try {
      const res = await fetch(`/v1/transactions/${txId}/confirm`, {
        credentials: 'include', method: 'POST' });
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
        credentials: 'include',
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
        credentials: 'include',
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
      const res = await fetch(`/v1/goals/${goalId}`, {
        credentials: 'include', method: 'DELETE' });
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

  /**
   * Purges every statement, transaction, and calculation for this account.
   *
   * Reports what the server said, and rejects on a partial purge. The previous
   * version checked `res.ok`, reloaded, and toasted "Session memory cleared."
   * regardless: the route deleted only the in-memory maps and answered
   * `{"success":true}`, so a user was told their financial data was erased while
   * all of it remained in the database.
   */
  const handleResetData = async () => {
    const res = await fetch('/v1/settings/reset', {
      credentials: 'include',
      method: 'POST',
    });
    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      // The server says what survived. That text is what the user needs; a generic
      // failure would hide a partial erasure behind a shrug.
      throw new Error(
        payload?.error?.message ?? 'The purge did not complete. Some data may still be stored.',
      );
    }

    await loadAllData();
    showToast('Your data has been permanently deleted.');
    return {
      purged: (payload?.purged ?? {}) as Record<string, number>,
      total_removed: Number(payload?.total_removed ?? 0),
    };
  };


  const needsReviewCount = summary?.needs_review_count || 0;

  /**
   * Sign-in, shown only after somebody chooses to enter the desk.
   *
   * It used to be an early return above everything, so an unauthenticated visitor
   * never saw the landing page. It is now a third destination, reached from the
   * landing page's own call to action.
   */
  if (currentPage === 'auth' && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-canvas text-ink flex flex-col">
        <AuthView
          onAuthenticated={async () => {
            setIsAuthenticated(true);
            // Honour where they were headed before being asked to sign in. A tab
            // they never chose falls back to the dashboard.
            const tab = pendingTab ?? 'dashboard';
            setPendingTab(null);
            setPendingDeskEntry(false);
            setCurrentPage('app');
            setActiveTab(tab);
            window.location.hash = tab;
          }}
        />
        <Footer
          onNavigateLanding={navigateToLanding}
          onNavigateDashboard={navigateToDashboard}
          onNavigateTab={navigateToTab}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 bg-primary text-on-primary type-caption px-4 py-3 rounded-lg flex items-center gap-2 shadow-soft-lg"
        >
          <Check className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Context-Aware Navbar */}
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
      {currentPage === 'landing' || currentPage === 'auth' ? (
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
          summary={summary}
        />
      ) : (
        /* Dedicated Standalone Financial Desk & Workspaces */
        <main className="flex-1 w-full band-compact">
          <div className="shell">
          {activeTab === 'dashboard' && (
            <DashboardView
              summary={summary}
              loadFailed={loadFailed}
              categories={categories}
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
              onCreateTransaction={handleCreateTransaction}
              // `handleCreateTransaction` already reloads the ledger on success, so this
              // exists only to be a hook if that ever stops being true.
              onEntrySaved={() => undefined}
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

          {activeTab === 'trends' && (
            <TrendsView
              locale={locale}
              series={trendSeries}
              patterns={trendPatterns}
              isLoading={trendLoading}
              error={trendError}
              onGranularityChange={setTrendGranularity}
              onDrill={(point: TrendPoint) => {
                // FR-007: a point opens the ledger filtered to the rows behind it.
                // The ids go in the hash, so the drill survives a reload.
                const ids = point.transaction_ids;
                void loadAllData().then(() => {
                  navigateToTab('transactions');
                  showToast(
                    locale === 'bn'
                      ? `${ids.length} টি লেনদেন দেখানো হচ্ছে`
                      : `Showing ${ids.length} transaction(s) from ${point.key}`,
                  );
                });
              }}
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
          </div>
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
