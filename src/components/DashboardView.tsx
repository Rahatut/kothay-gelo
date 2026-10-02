import React from 'react';
import { goalProgress } from '../../server/financialEngine';
import {
  ArrowUpRight,
  AlertTriangle,
  FileText,
  TrendingUp,
  TrendingDown,
  Target,
  Lightbulb,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { Category, DashboardSummary, Transaction, InsightRecommendation, SavingsGoal } from '../types';

interface DashboardViewProps {
  summary: DashboardSummary | null;
  /**
   * Which endpoints failed on the last load.
   *
   * Required, because a null summary means both "still loading" and "the load
   * broke", and this view used to render the loading state for both. A failure
   * showed an indefinite "Initializing the desk" pulse with nothing in the console
   * the user could see.
   */
  loadFailed?: string[];
  /**
   * Category id to display name. The engine's shares carry ids and amounts but no
   * names, so resolving a label requires the category list the app already loads.
   */
  categories: Category[];
  locale: 'en' | 'bn';
  onNavigateTab: (tab: string) => void;
  onSelectTransaction: (tx: Transaction) => void;
  transactions?: Transaction[];
  insights?: InsightRecommendation[];
  goals?: SavingsGoal[];
  onLoadGolden?: () => void;
  isLoadingGolden?: boolean;
  onBackToLanding?: () => void;
}

const COPY = {
  en: {
    deskTitle: 'Financial investigation desk',
    deskSubtitle:
      'Unified multi-account intelligence across bKash, Nagad, and Bangladeshi bank accounts.',
    cycle: 'September 2026 cycle',
    verifiedLogs: 'verified logs',
    totalSpent: 'Total expenses',
    totalIncome: 'Verified inflow',
    netSavings: 'Net surplus',
    leakDetected: 'Detected micro-leaks',
    breakdownTitle: 'Spending concentration',
    breakdownSubtitle: 'Categorized expenditure with share of total outflow',
    merchantTitle: 'Top vendors and counterparties',
    merchantSubtitle: 'Ranked by outflow frequency and transaction volume',
    reviewAlert: 'transactions require verification',
    reviewAction: 'Verify pending items',
    recentTransactionsTitle: 'Recent canonical entries',
    recentTransactionsSubtitle: 'Verified ledger line items with evidence provenance',
    viewAllLedger: 'View full ledger',
    activeLeaksTitle: 'Detected money leaks and anomalies',
    activeLeaksSubtitle: 'Deterministic patterns identified across your spending logs',
    savingsGoalsTitle: 'Active savings targets',
    savingsGoalsSubtitle: 'Tracking leak recovery and long-term financial targets',
    newTarget: 'Set new target',
    addStatement: 'Upload statement',
    reloadDemo: 'Load sample data',
    quickNav: 'Quick desk navigation',
    loading: 'Loading',
    noTransactions: 'No transactions in this session yet.',
    initializing: 'Initializing the desk',
    emptyDeskTitle: 'Your desk is empty',
    emptyDeskSubtitle: 'Upload a bKash, Nagad, or bank statement and your spending will be read here. Nothing is shown until there is something real to show.',
    uploadStatement: 'Upload a statement',
    reload: 'Reload',
  },
  bn: {
    deskTitle: 'আর্থিক পর্যালোচনা ডেক্স',
    deskSubtitle:
      'বিকাশ, নগদ ও ব্যাংক অ্যাকাউন্টের সমন্বিত খরচের হিসাব ও বিশ্লেষণ।',
    cycle: 'সেপ্টেম্বর ২০২৬ চক্র',
    verifiedLogs: 'টি যাচাইকৃত লেনদেন',
    totalSpent: 'মোট ব্যয়',
    totalIncome: 'মোট জমা',
    netSavings: 'অবশিষ্ট',
    leakDetected: 'শনাক্তকৃত অপ্রয়োজনীয় খরচ',
    breakdownTitle: 'খরচের খাতসমূহ',
    breakdownSubtitle: 'মোট ব্যয়ের শতকরা হার ও ক্যাটাগরিভিত্তিক বিভাজন',
    merchantTitle: 'শীর্ষ বিক্রেতা ও প্রাপক',
    merchantSubtitle: 'লেনদেনের সংখ্যা ও ব্যয়ের ভিত্তিতে ক্রমানুযায়ী',
    reviewAlert: 'টি লেনদেন যাচাই বাকি',
    reviewAction: 'এখনই যাচাই করুন',
    recentTransactionsTitle: 'সাম্প্রতিক লেনদেন খতিয়ান',
    recentTransactionsSubtitle: 'তথ্যপ্রমাণযুক্ত সংরক্ষিত লেনদেন তালিকা',
    viewAllLedger: 'সম্পূর্ণ খতিয়ান দেখুন',
    activeLeaksTitle: 'শনাক্তকৃত লিক ও প্যাটার্ন',
    activeLeaksSubtitle: 'আপনার খরচের মধ্যে খুঁজে পাওয়া অভ্যাস ও অতিরিক্ত ব্যয়',
    savingsGoalsTitle: 'সঞ্চয় লক্ষ্যমাত্রা',
    savingsGoalsSubtitle: 'সাশ্রয়কৃত অর্থ নির্দিষ্ট লক্ষ্যে জমা করার হিসাব',
    newTarget: 'নতুন লক্ষ্য নির্ধারণ',
    addStatement: 'স্টেটমেন্ট যোগ করুন',
    reloadDemo: 'নমুনা ডাটা লোড',
    quickNav: 'ডেক্স শর্টকাট',
    loading: 'লোড হচ্ছে',
    noTransactions: 'এই সাইশনে এখনো কোনো লেনদেন নেই।',
  },
} as const;

export const DashboardView: React.FC<DashboardViewProps> = ({
  summary,
  loadFailed,
  categories,
  locale,
  onNavigateTab,
  onSelectTransaction,
  transactions = [],
  insights = [],
  goals = [],
  onLoadGolden,
  isLoadingGolden = false,
  onBackToLanding,
}) => {
  const t = COPY[locale];

  // Failed, not loading. Checked first: a failed load also leaves the summary
  // null, and showing a spinner for it left the user on "Initializing the desk"
  // forever with no way to tell that anything was wrong.
  if (!summary && loadFailed && loadFailed.length > 0) {
    return (
      <div className="py-16">
        <div className="feature-card p-7 max-w-xl">
          <span className="badge-pill">Could not load</span>
          <h2 className="type-title-md text-ink mt-3">Your desk did not come up</h2>
          <p className="type-body-md text-body mt-2">
            Nothing has been deleted, and nothing you uploaded is affected. The parts
            of the desk that did load are still usable from the navigation.
          </p>
          <p className="type-caption text-muted mt-4">
            Failed to load: <span className="font-figure text-ink">{loadFailed.join(', ')}</span>
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary mt-5"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="py-24 text-center" role="status" aria-live="polite">
        <p className="type-caption-uppercase text-muted mb-3">Initializing the desk</p>
        <div className="w-12 h-0.5 bg-hairline-strong mx-auto animate-pulse" />
      </div>
    );
  }

  // Nothing uploaded yet.
  //
  // The endpoint answers `insufficient_data` for an empty account, which used to
  // arrive as a null summary and leave this view on "Initializing the desk"
  // indefinitely. A loading state is a claim that work is happening, and none was.
  if (!summary.has_data) {
    return (
      <div className="py-12">
        <div className="feature-card p-7 sm:p-8 max-w-xl">
          <span className="badge-pill">Nothing to read yet</span>
          <h2 className="type-title-md text-ink mt-3">Your desk is empty</h2>
          <p className="type-body-md text-body mt-2">
            Upload a bKash, Nagad, or bank statement and your spending will be read
            here. Nothing is shown until there is something real to show.
          </p>
          <button
            type="button"
            onClick={() => onNavigateTab('upload')}
            className="btn-primary mt-5"
          >
            Upload a statement
          </button>
        </div>
      </div>
    );
  }

  /**
   * Whether the figures below came from the sample dataset.
   *
   * A total built from rows the user never uploaded is not their spending, and
   * presenting it as such is the exact defect PRODUCT.md ledger #10 records. The
   * flag is read from the rows rather than the summary, because the summary does not
   * carry it.
   */
  const showsSampleData = transactions.length > 0 && transactions.every((t) => t.is_sample_data);

  /**
   * Recoverable savings comes from the engine's own savings estimate.
   *
   * This used to sum `potential_savings_bdt` across insights in the browser. That
   * is a second implementation of the same calculation, running in a different
   * place with different rounding, and it disagreed with the engine whenever the
   * two iterated differently. The engine's figure is now the only one displayed.
   */
  const calculatedLeakSavings = summary.potential_savings?.min ?? null;

  const recentTxList = transactions.slice(0, 6);

  // The breakdown is expense-only, so an inflow's category id never appears in it
  // and would resolve to nothing. Those rows fall back to the id's own words
  // rather than to the uncategorized label, which would be a false claim about a
  // categorised row.
  const categoryNames = new Map(categories.map((c) => [c.id, locale === 'bn' ? c.name_bn : c.name]));
  const readableCategory = (categoryId: string): string => {
    const name = categoryNames.get(categoryId);
    if (name) {
      return name;
    }
    return categoryId
      .replace(/^cat_/, '')
      .replace(/_/g, ' ')
      .replace(/^./, (ch) => ch.toUpperCase());
  };

  return (
    <div className="space-y-10">
      {showsSampleData && (
        <p role="status" className="feature-card p-4 type-caption text-body">
          <span className="badge-pill mr-2">Sample data</span>
          These figures come from the bundled sample dataset, not from your own
          statements. Upload a statement to replace them.
        </p>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div className="flex items-center gap-3">
          {onBackToLanding && (
            <button type="button" onClick={onBackToLanding} className="btn-outline btn-sm">
              <span>{t.deskTitle}</span>
            </button>
          )}
          <span className="badge-pill">{t.cycle}</span>
        </div>

        <p className="type-caption text-muted">
          <span className="font-figure">{transactions.length}</span> {t.verifiedLogs}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h1 className="type-display-md text-ink">{t.deskTitle}</h1>
          <p className="type-body-md text-body mt-2 max-w-2xl">{t.deskSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onLoadGolden && (
            <button
              type="button"
              onClick={onLoadGolden}
              disabled={isLoadingGolden}
              className="btn-outline btn-sm"
              title="Refresh the ledger with canonical bKash, Nagad, and bank logs"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoadingGolden ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{isLoadingGolden ? t.loading : t.reloadDemo}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigateTab('upload')}
            className="btn-primary btn-sm"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.addStatement}</span>
          </button>
        </div>
      </div>

      <nav
        className="bg-surface-card border border-hairline rounded-lg p-3 flex flex-wrap items-center justify-between gap-3"
        aria-label={t.quickNav}
      >
        <span className="type-caption-uppercase text-muted">{t.quickNav}</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateTab('transactions')}
            className="btn-outline btn-sm"
          >
            <FileText className="w-3 h-3" aria-hidden="true" />
            <span>Ledger ({transactions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('review')}
            className={`btn-outline btn-sm ${summary.needs_review_count > 0 ? 'border-error text-error' : ''}`}
          >
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            <span>Review ({summary.needs_review_count})</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('insights')}
            className="btn-outline btn-sm"
          >
            <Lightbulb className="w-3 h-3" aria-hidden="true" />
            <span>Leaks ({insights.length})</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('goals')}
            className="btn-outline btn-sm"
          >
            <Target className="w-3 h-3" aria-hidden="true" />
            <span>Targets ({goals.length})</span>
          </button>
        </div>
      </nav>

      {summary.needs_review_count > 0 && (
        <div className="feature-card border-error p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="w-2 h-2 rounded-full bg-error mt-2 shrink-0" aria-hidden="true" />
            <div>
              <p className="type-body-strong text-ink">
                <span className="font-figure">{summary.needs_review_count}</span> {t.reviewAlert}
              </p>
              <p className="type-caption text-body mt-1">
                Audit ambiguous merchants or split personal vs business transfers to guarantee
                deterministic numbers.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('review')}
            className="btn-primary btn-sm shrink-0"
          >
            {t.reviewAction}
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="feature-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-hairline">
              <span className="type-caption-uppercase text-muted">{t.totalSpent}</span>
            </div>
            <p className="font-figure type-display-sm text-ink">
              ৳{summary.total_expenses.toLocaleString()}
            </p>
          </div>
          {/*
            Rendered only when there is a preceding period. The previous version
            printed "0% vs prior cycle" whenever the figure was absent, which
            claimed spending had not changed — a fact about the user's money that
            a first upload has no data to support.
          */}
          {summary.expense_change_pct !== null && (
            <p className="mt-4 pt-3 border-t border-hairline flex items-center gap-1.5 type-caption text-muted">
              {summary.expense_change_pct >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-error" aria-hidden="true" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-success" aria-hidden="true" />
              )}
              <span className="font-figure">
                {summary.expense_change_pct >= 0 ? '+' : ''}
                {summary.expense_change_pct}%
              </span>{' '}
              vs prior cycle
            </p>
          )}
        </div>

        <div className="feature-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-hairline">
              <span className="type-caption-uppercase text-muted">{t.totalIncome}</span>
            </div>
            <p className="font-figure type-display-sm text-ink">
              ৳{summary.total_income.toLocaleString()}
            </p>
          </div>
          <p className="mt-4 pt-3 border-t border-hairline type-caption text-muted">
            Salary, client fees, and bank deposits
          </p>
        </div>

        <div className="feature-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-hairline">
              <span className="type-caption-uppercase text-muted">{t.netSavings}</span>
            </div>
            <p className="font-figure type-display-sm text-ink">
              ৳{summary.net_savings.toLocaleString()}
            </p>
          </div>
          <p className="mt-4 pt-3 border-t border-hairline type-caption text-muted">
            {summary.net_savings >= 0
              ? 'Available for emergency and savings'
              : 'Outflows exceeded monthly deposits'}
          </p>
        </div>

        <div className="feature-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-hairline">
              <span className="type-caption-uppercase text-muted">{t.leakDetected}</span>
            </div>
            {/* Absence is rendered as absence. The engine returning null means it
                could not establish a recoverable figure, and showing ৳0 would
                read as a claim that there is nothing to recover. */}
            <p className="font-figure type-display-sm text-success">
              {calculatedLeakSavings === null ? (
                <span className="text-muted-soft">Not established</span>
              ) : (
                <>
                  ৳{calculatedLeakSavings.toLocaleString()}
                  <span className="type-caption text-muted font-normal"> /mo</span>
                </>
              )}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between gap-2">
            <span className="type-caption text-muted">
              {insights.length} active clues
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('insights')}
              className="btn-text"
            >
              Examine
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 feature-card p-6 sm:p-8">
          <div className="pb-4 mb-6 border-b border-hairline">
            <h2 className="type-title-md text-ink">{t.breakdownTitle}</h2>
            <p className="type-caption text-muted mt-1">{t.breakdownSubtitle}</p>
          </div>

          <div className="space-y-4">
            {summary.categoryShares.map(
              (cat: { category_id: string; amount: number; pct: number }, i: number) => {
                const catAmount = cat.amount || 0;
                // The engine already computed the share. Recomputing it here
                // created a second denominator, which drifted the moment the
                // summary total and the breakdown total disagreed.
                const pct = cat.pct ?? null;
                const name = readableCategory(cat.category_id);
                return (
                  <div key={i} className="pb-3 border-b border-hairline-soft last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3 type-caption mb-2">
                      <span className="type-body-sm text-ink">{name || 'Uncategorized'}</span>
                      <span className="font-figure text-body shrink-0">
                        ৳{catAmount.toLocaleString()}{' '}
                        {pct !== null && (
                          <span className="text-muted-soft">({pct}%)</span>
                        )}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-pill bg-surface-strong overflow-hidden">
                      {pct !== null && (
                        <div
                          className="h-full rounded-pill bg-primary"
                          // Clamping a bar to the track width is layout, not finance.
                          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              },
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-hairline flex flex-wrap items-center justify-between gap-3">
            <span className="type-caption text-muted">
              Deterministic classification across statements
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('transactions')}
              className="btn-text"
            >
              Filter by category
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 feature-card p-6 sm:p-8">
          <div className="pb-4 mb-6 border-b border-hairline">
            <h2 className="type-title-md text-ink">{t.merchantTitle}</h2>
            <p className="type-caption text-muted mt-1">{t.merchantSubtitle}</p>
          </div>

          <div className="space-y-0">
            {/* Always an array: the ranking comes from a capability call that can
                fail independently of the dashboard, so an absent ranking must
                render as an empty list rather than as a crash or a fake row. */}
            {summary.top_merchants.map((m, i: number) => (
              <div
                key={i}
                className="py-3 flex items-center justify-between gap-3 border-b border-hairline-soft last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="type-body-sm text-ink truncate">
                    {m.merchant_name}
                  </p>
                  <p className="type-caption text-muted-soft font-figure">
                    {m.count} transactions
                  </p>
                </div>
                <span className="font-figure type-body-sm text-body-strong shrink-0">
                  ৳{m.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('transactions')}
            className="btn-outline btn-sm w-full mt-6"
          >
            <span>View all vendors in the ledger</span>
            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {insights.length > 0 && (
        <section className="feature-card p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between pb-4 mb-6 border-b border-hairline gap-3">
            <div>
              <h2 className="type-title-md text-ink">{t.activeLeaksTitle}</h2>
              <p className="type-caption text-muted mt-1">{t.activeLeaksSubtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('insights')}
              className="btn-text self-start sm:self-auto"
            >
              Open all leak dossiers
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {insights.slice(0, 3).map((insight, idx) => (
              <article key={insight.id || idx} className="bg-canvas rounded-lg p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <span className="badge-pill">
                      {insight.type?.replace('_', ' ') || 'Leak'}
                    </span>
                    {insight.potential_savings_bdt ? (
                      <span className="font-figure type-caption text-success shrink-0">
                        +৳{insight.potential_savings_bdt}/mo
                      </span>
                    ) : null}
                  </div>

                  <h3 className="type-title-sm text-ink mb-2">
                    {locale === 'bn' ? insight.title_bn || insight.title : insight.title}
                  </h3>

                  <p className="type-caption text-body line-clamp-2">
                    {locale === 'bn' ? insight.summary_bn || insight.summary : insight.summary}
                  </p>
                </div>

                <div className="pt-3 mt-4 border-t border-hairline">
                  <button
                    type="button"
                    onClick={() => onNavigateTab('insights')}
                    className="btn-text"
                  >
                    Examine proof
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {recentTxList.length > 0 && (
        <section className="feature-card p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between pb-4 mb-6 border-b border-hairline gap-3">
            <div>
              <h2 className="type-title-md text-ink">{t.recentTransactionsTitle}</h2>
              <p className="type-caption text-muted mt-1">{t.recentTransactionsSubtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('transactions')}
              className="btn-text self-start sm:self-auto"
            >
              {t.viewAllLedger}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className="py-2.5 pr-4 type-caption-uppercase text-muted">
                    Date
                  </th>
                  <th scope="col" className="py-2.5 px-4 type-caption-uppercase text-muted">
                    Merchant
                  </th>
                  <th scope="col" className="py-2.5 px-4 type-caption-uppercase text-muted">
                    Category
                  </th>
                  <th scope="col" className="py-2.5 px-4 type-caption-uppercase text-muted">
                    Direction
                  </th>
                  <th
                    scope="col"
                    className="py-2.5 px-4 type-caption-uppercase text-muted text-right"
                  >
                    Amount (৳)
                  </th>
                  <th
                    scope="col"
                    className="py-2.5 pl-4 type-caption-uppercase text-muted text-right"
                  >
                    Proof
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {recentTxList.map((tx) => {
                  const isIncome = tx.direction === 'INCOME';
                  return (
                    <tr key={tx.id} className="hover:bg-canvas-soft transition-colors">
                      <td className="py-3 pr-4 font-figure type-caption text-muted whitespace-nowrap">
                        {tx.transaction_date}
                      </td>
                      <td className="py-3 px-4">
                        <p className="type-body-sm text-ink">{tx.merchant_name}</p>
                        {tx.raw_text_snippet && (
                          <p className="font-figure type-caption text-muted-soft truncate max-w-xs">
                            {tx.raw_text_snippet}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`badge-pill ${
                            /[ঀ-৿]/.test(readableCategory(tx.category_id))
                              ? 'font-bangla tracking-normal'
                              : ''
                          }`}
                        >
                          {readableCategory(tx.category_id)}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`type-caption-uppercase ${
                            isIncome ? 'text-success' : 'text-muted'
                          }`}
                        >
                          {tx.direction}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-figure type-body-sm whitespace-nowrap ${
                          isIncome ? 'text-success' : 'text-ink'
                        }`}
                      >
                        {isIncome ? '+' : '-'}৳{tx.amount.toLocaleString()}
                      </td>
                      <td className="py-3 pl-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectTransaction(tx)}
                          className="btn-text"
                        >
                          Evidence
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="feature-card p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between pb-4 mb-6 border-b border-hairline gap-3">
          <div>
            <h2 className="type-title-md text-ink">{t.savingsGoalsTitle}</h2>
            <p className="type-caption text-muted mt-1">{t.savingsGoalsSubtitle}</p>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('goals')}
            className="btn-outline btn-sm self-start sm:self-auto"
          >
            {t.newTarget}
          </button>
        </div>

        {goals.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-hairline rounded-lg">
            <p className="type-body-md text-muted mb-4">
              No active targets set yet. Direct recovered leak money toward your goals.
            </p>
            <button
              type="button"
              onClick={() => onNavigateTab('goals')}
              className="btn-primary btn-sm"
            >
              Register your first target
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {goals.map((g) => {
              const current = g.current_amount || 0;
              const target = g.target_amount || 1;
              const pct = goalProgress(current, target);
              return (
                <div key={g.id} className="bg-canvas rounded-lg p-5">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="type-body-sm text-ink truncate">{g.title || g.name}</span>
                    <span className="font-figure type-caption text-muted shrink-0">
                      {pct !== null ? `${pct}%` : '—'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-pill bg-surface-card overflow-hidden mb-3">
                    {pct !== null && (
                      <div
                        className="h-full rounded-pill bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 type-caption text-muted font-figure">
                    <span>৳{current.toLocaleString()} saved</span>
                    <span>of ৳{target.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
