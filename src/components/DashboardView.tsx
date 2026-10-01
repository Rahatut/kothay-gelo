import React from 'react';
import { 
  ArrowUpRight, 
  ArrowLeft, 
  AlertTriangle, 
  Search, 
  FileText, 
  TrendingUp, 
  TrendingDown, 
  ShieldCheck, 
  Target, 
  Lightbulb, 
  Upload, 
  CheckCircle2, 
  RefreshCw 
} from 'lucide-react';
import { DashboardSummary, Transaction, InsightRecommendation, SavingsGoal } from '../types';

interface DashboardViewProps {
  summary: DashboardSummary | null;
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

export const DashboardView: React.FC<DashboardViewProps> = ({
  summary,
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
  const t = {
    en: {
      backToHome: 'Back to Landing Page',
      deskTitle: 'Financial Investigation Desk',
      deskSubtitle: 'Unified multi-account intelligence across bKash, Nagad, and Bangladeshi bank accounts',
      cycle: 'SEPTEMBER 2026 CYCLE',
      activeInstitutions: '3 ACCOUNTS CONNECTED: bKash · Nagad · City Bank',
      totalSpent: 'TOTAL EXPENSES',
      totalIncome: 'VERIFIED INFLOW',
      netSavings: 'NET SURPLUS',
      leakDetected: 'DETECTED MICRO-LEAKS',
      potentialSaving: 'EST. MONTHLY SAVINGS',
      breakdownTitle: 'Spending Concentration',
      breakdownSubtitle: 'Categorized expenditure with share of total outflow',
      merchantTitle: 'Top Vendors & Counterparties',
      merchantSubtitle: 'Ranked by outflow frequency and transaction volume',
      reviewAlert: 'transactions require verification',
      reviewAction: 'Verify pending items →',
      recentTransactionsTitle: 'Recent Canonical Entries',
      recentTransactionsSubtitle: 'Real-time verified ledger line items with evidence provenance',
      viewAllLedger: 'View full canonical ledger →',
      activeLeaksTitle: 'Detected Money Leaks & Anomalies',
      activeLeaksSubtitle: 'Deterministic patterns identified across your spending logs',
      savingsGoalsTitle: 'Active Savings Targets',
      savingsGoalsSubtitle: 'Tracking leak recovery and long-term financial targets',
      newTarget: '+ Set New Target',
      addStatement: '+ Upload statement',
      reloadDemo: 'Load sample data',
      quickNav: 'QUICK DESK NAVIGATION',
      provenanceReady: 'PROVENANCE VERIFIED',
    },
    bn: {
      backToHome: 'মূল পেজে ফিরে যান',
      deskTitle: 'আর্থিক পর্যালোচনা ডেক্স',
      deskSubtitle: 'বিকাশ, নগদ ও ব্যাংক অ্যাকাউন্টের সমন্বিত খরচের হিসাব ও বিশ্লেষণ',
      cycle: 'সেপ্টেম্বর ২০২৬ চক্র',
      activeInstitutions: 'সংযুক্ত ৩টি অ্যাকাউন্ট: বিকাশ · নগদ · সিটি ব্যাংক',
      totalSpent: 'মোট ব্যয়',
      totalIncome: 'মোট জমা / আয়',
      netSavings: 'অবশিষ্ট উদ্বৃত্ত',
      leakDetected: 'শনাক্তকৃত অপ্রয়োজনীয় খরচ',
      potentialSaving: 'সম্ভাব্য মাসিক সাশ্রয়',
      breakdownTitle: 'খরচের খাতসমূহ',
      breakdownSubtitle: 'মোট ব্যয়ের শতকরা হার ও ক্যাটাগরিভিত্তিক বিভাজন',
      merchantTitle: 'শীর্ষ বিক্রেতা ও লেনদেন',
      merchantSubtitle: 'লেনদেনের সংখ্যা ও ব্যয়ের ভিত্তিতে ক্রমানুযায়ী',
      reviewAlert: 'টি লেনদেন যাচাই বাকি',
      reviewAction: 'এখনই যাচাই করুন →',
      recentTransactionsTitle: 'সাম্প্রতিক লেনদেন খতিয়ান',
      recentTransactionsSubtitle: 'তথ্যপ্রমাণযুক্ত সংরক্ষিত লেনদেন তালিকা',
      viewAllLedger: 'সম্পূর্ণ খতিয়ান দেখুন →',
      activeLeaksTitle: 'শনাক্তকৃত লিক ও প্যাটার্ন',
      activeLeaksSubtitle: 'আপনার খরচের মধ্যে খুঁজে পাওয়া অভ্যাস ও অতিরিক্ত ব্যয়',
      savingsGoalsTitle: 'সঞ্চয় লক্ষ্যমাত্রা',
      savingsGoalsSubtitle: 'সাশ্রয়কৃত অর্থ নির্দিষ্ট লক্ষ্যে জমা করার হিসাব',
      newTarget: '+ নতুন লক্ষ্য',
      addStatement: '+ স্টেটমেন্ট যোগ করুন',
      reloadDemo: 'নমুনা ডাটা লোড',
      quickNav: 'ডেক্স শর্টকাট',
      provenanceReady: 'প্রমাণপত্র সংরক্ষিত',
    },
  }[locale];

  if (!summary) {
    return (
      <div className="py-24 text-center">
        <div className="font-mono text-xs uppercase tracking-widest text-[#171717]/60 mb-3">
          INITIALIZING FINANCIAL INVESTIGATION DESK...
        </div>
        <div className="w-12 h-0.5 bg-[#171717] mx-auto animate-pulse"></div>
      </div>
    );
  }

  // Calculate potential leak savings from insights or fallback
  const calculatedLeakSavings = insights.length > 0 
    ? insights.reduce((acc, i) => acc + (i.potential_savings_bdt || 0), 0)
    : (summary.potential_savings?.min || 4200);

  const recentTxList = transactions.slice(0, 6);

  return (
    <div className="space-y-10">
      
      {/* Top Breadcrumb & Return Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#171717]/15">
        <div className="flex items-center gap-3">
          {onBackToLanding && (
            <button
              onClick={onBackToLanding}
              className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-[#171717]/80 hover:text-[#171717] px-3 py-1.5 border border-[#171717]/30 hover:border-[#171717] bg-[#FFFFFF] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t.backToHome}</span>
            </button>
          )}
          <span className="font-mono text-xs text-[#171717]/40 hidden sm:inline">/</span>
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#171717]">
            {t.deskTitle}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-[#171717]/60">
          <span className="w-2 h-2 rounded-full bg-[#B7F34A] inline-block"></span>
          <span>{t.activeInstitutions}</span>
        </div>
      </div>

      {/* Main Desk Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2">
        <div>
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="font-mono text-xs uppercase tracking-[0.2em] bg-[#171717] text-[#F6F1E8] px-2.5 py-0.5 font-bold">
              {t.cycle}
            </span>
            <span className="font-mono text-xs text-[#171717]/60">
              {transactions.length} verified logs
            </span>
          </div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-[#171717] tracking-tight">
            {t.deskTitle}
          </h1>
          <p className="font-display text-sm text-[#171717]/70 mt-1 max-w-2xl">
            {t.deskSubtitle}
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {onLoadGolden && (
            <button
              onClick={onLoadGolden}
              disabled={isLoadingGolden}
              className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 bg-[#FFFFFF]"
              title="Refresh ledger with canonical bKash, Nagad and bank logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingGolden ? 'animate-spin' : ''}`} />
              <span>{isLoadingGolden ? 'Loading...' : t.reloadDemo}</span>
            </button>
          )}
          <button
            onClick={() => onNavigateTab('upload')}
            className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{t.addStatement}</span>
          </button>
        </div>
      </div>

      {/* Quick Navigation Strip to Internal Desks */}
      <div className="bg-[#FFFFFF] border border-[#171717] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-xs uppercase font-bold text-[#171717]/70 flex items-center gap-2">
          <span>{t.quickNav}:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigateTab('transactions')}
            className="text-xs font-mono px-3 py-1.5 border border-[#171717]/30 hover:border-[#171717] hover:bg-[#F6F1E8] transition-colors flex items-center gap-1.5"
          >
            <FileText className="w-3 h-3 text-[#171717]/70" />
            <span>Ledger ({transactions.length})</span>
          </button>

          <button
            onClick={() => onNavigateTab('review')}
            className={`text-xs font-mono px-3 py-1.5 border transition-colors flex items-center gap-1.5 ${
              summary.needs_review_count > 0 
                ? 'border-[#FF725E] bg-[#FF725E]/10 font-bold text-[#171717]' 
                : 'border-[#171717]/30 hover:border-[#171717] hover:bg-[#F6F1E8]'
            }`}
          >
            <AlertTriangle className={`w-3 h-3 ${summary.needs_review_count > 0 ? 'text-[#FF725E]' : 'text-[#171717]/70'}`} />
            <span>Review Queue ({summary.needs_review_count})</span>
          </button>

          <button
            onClick={() => onNavigateTab('insights')}
            className="text-xs font-mono px-3 py-1.5 border border-[#171717]/30 hover:border-[#171717] hover:bg-[#F6F1E8] transition-colors flex items-center gap-1.5"
          >
            <Lightbulb className="w-3 h-3 text-[#171717]/70" />
            <span>Money Leaks ({insights.length})</span>
          </button>

          <button
            onClick={() => onNavigateTab('goals')}
            className="text-xs font-mono px-3 py-1.5 border border-[#171717]/30 hover:border-[#171717] hover:bg-[#F6F1E8] transition-colors flex items-center gap-1.5"
          >
            <Target className="w-3 h-3 text-[#171717]/70" />
            <span>Targets ({goals.length})</span>
          </button>
        </div>
      </div>

      {/* Review Alert Banner if needed */}
      {summary.needs_review_count > 0 && (
        <div className="bg-[#FFFFFF] border-2 border-[#171717] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[3px_3px_0px_#171717]">
          <div className="flex items-center gap-3.5">
            <span className="w-3 h-3 bg-[#FF725E] inline-block shrink-0"></span>
            <div>
              <div className="font-display font-bold text-sm text-[#171717] flex items-center gap-2">
                <span>{summary.needs_review_count} {t.reviewAlert}</span>
                <span className="text-[10px] font-mono bg-[#FF725E]/20 text-[#171717] px-2 py-0.5 uppercase">
                  Action required
                </span>
              </div>
              <p className="font-display text-xs text-[#171717]/75 mt-0.5">
                Audit ambiguous merchants or split personal vs business transfers to guarantee 100% deterministic numbers.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('review')}
            className="btn-primary text-xs py-2 px-4 shrink-0 flex items-center gap-1"
          >
            <span>{t.reviewAction}</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Primary Financial Numbers Matrix (4 Columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Total Spent */}
        <div className="bg-[#FFFFFF] border border-[#171717] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#171717]/15">
              <span className="font-mono text-xs uppercase tracking-wider text-[#171717]/60">
                {t.totalSpent}
              </span>
              <span className="font-mono text-[10px] bg-[#171717]/5 px-2 py-0.5 text-[#171717]/70">
                OUTFLOW
              </span>
            </div>
            <div className="text-3xl font-display font-bold text-[#171717] tracking-tight">
              ৳{summary.total_expenses.toLocaleString()}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#171717]/10 flex items-center gap-1.5 text-xs font-display text-[#171717]/70">
            {summary.expense_change_pct >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-[#FF725E]" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-[#B7F34A]" />
            )}
            <span>
              {summary.expense_change_pct >= 0 ? '+' : ''}{summary.expense_change_pct}% vs prior cycle
            </span>
          </div>
        </div>

        {/* Verified Inflow */}
        <div className="bg-[#FFFFFF] border border-[#171717] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#171717]/15">
              <span className="font-mono text-xs uppercase tracking-wider text-[#171717]/60">
                {t.totalIncome}
              </span>
              <span className="font-mono text-[10px] bg-[#B7F34A]/30 px-2 py-0.5 text-[#171717] font-bold">
                INFLOW
              </span>
            </div>
            <div className="text-3xl font-display font-bold text-[#171717] tracking-tight">
              ৳{summary.total_income.toLocaleString()}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#171717]/10 text-xs font-display text-[#171717]/70">
            Salary, client fees & bank deposits
          </div>
        </div>

        {/* Net Retained */}
        <div className="bg-[#FFFFFF] border border-[#171717] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#171717]/15">
              <span className="font-mono text-xs uppercase tracking-wider text-[#171717]/60">
                {t.netSavings}
              </span>
              <span className={`font-mono text-[10px] px-2 py-0.5 font-bold ${
                summary.net_savings >= 0 ? 'bg-[#B7F34A] text-[#171717]' : 'bg-[#FF725E] text-white'
              }`}>
                {summary.net_savings >= 0 ? 'SURPLUS' : 'DEFICIT'}
              </span>
            </div>
            <div className="text-3xl font-display font-bold text-[#171717] tracking-tight">
              ৳{summary.net_savings.toLocaleString()}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#171717]/10 text-xs font-display text-[#171717]/70">
            {summary.net_savings >= 0 ? 'Available for emergency & savings' : 'Outflows exceeded monthly deposits'}
          </div>
        </div>

        {/* Recoverable Leaks */}
        <div className="bg-[#FFFFFF] border border-[#171717] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#171717]/15">
              <span className="font-mono text-xs uppercase tracking-wider text-[#171717]/60">
                {t.leakDetected}
              </span>
              <span className="font-mono text-[10px] bg-[#FFD84D] px-2 py-0.5 text-[#171717] font-bold">
                LEAK RADAR
              </span>
            </div>
            <div className="text-3xl font-display font-bold text-[#171717] tracking-tight">
              ৳{calculatedLeakSavings.toLocaleString()}
              <span className="text-xs font-normal text-[#171717]/60 ml-1">/mo</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#171717]/10 flex items-center justify-between">
            <span className="text-xs font-display text-[#171717]/70">
              {insights.length} active clues detected
            </span>
            <button
              onClick={() => onNavigateTab('insights')}
              className="text-xs font-mono font-bold text-[#171717] underline hover:no-underline"
            >
              Examine →
            </button>
          </div>
        </div>

      </div>

      {/* Two-Column Breakdown: Spending Concentration & Vendor Frequency */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left: Category Concentration */}
        <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#171717] p-6 sm:p-8">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#171717]/15">
            <div>
              <h2 className="font-display font-semibold text-base text-[#171717]">
                {t.breakdownTitle}
              </h2>
              <p className="font-display text-xs text-[#171717]/60 mt-0.5">
                {t.breakdownSubtitle}
              </p>
            </div>
            <span className="font-mono text-xs text-[#171717]/50">
              BREAKDOWN
            </span>
          </div>

          <div className="space-y-4">
            {(summary.top_categories || summary.category_breakdown || []).map((cat: any, i: number) => {
              const catAmount = cat.amount || 0;
              const pct = summary.total_expenses > 0 
                ? Math.round((catAmount / summary.total_expenses) * 100) 
                : (cat.pct || 0);
              const name = locale === 'bn' ? cat.category_name_bn || cat.category_name : cat.category_name;
              return (
                <div key={i} className="pb-3 border-b border-[#171717]/10 last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between text-xs font-display font-medium mb-1.5">
                    <span className="text-[#171717] font-semibold">
                      {name || 'Uncategorized'}
                    </span>
                    <span className="font-mono font-bold text-[#171717]">
                      ৳{catAmount.toLocaleString()} <span className="font-normal text-[#171717]/60">({pct}%)</span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#F6F1E8] border border-[#171717]/20 overflow-hidden">
                    <div 
                      className="h-full bg-[#171717]" 
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-[#171717]/10 flex items-center justify-between text-xs font-mono text-[#171717]/60">
            <span>Deterministic classification across statements</span>
            <button
              onClick={() => onNavigateTab('transactions')}
              className="text-[#171717] font-bold underline hover:no-underline cursor-pointer"
            >
              Filter by category in ledger →
            </button>
          </div>
        </div>

        {/* Right: Vendor Concentration */}
        <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#171717] p-6 sm:p-8">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#171717]/15">
            <div>
              <h2 className="font-display font-semibold text-base text-[#171717]">
                {t.merchantTitle}
              </h2>
              <p className="font-display text-xs text-[#171717]/60 mt-0.5">
                {t.merchantSubtitle}
              </p>
            </div>
            <span className="font-mono text-xs text-[#171717]/50">
              RECIPIENTS
            </span>
          </div>

          <div className="space-y-3">
            {(summary.top_merchants || (summary.merchant_concentration ? summary.merchant_concentration.map(m => ({ merchant: m.merchant_name, amount: m.amount, count: m.count })) : [])).map((m: any, i: number) => (
              <div 
                key={i} 
                className="py-2.5 flex items-center justify-between border-b border-[#171717]/10 last:border-b-0"
              >
                <div>
                  <div className="font-display font-medium text-sm text-[#171717]">
                    {m.merchant || m.merchant_name}
                  </div>
                  <div className="font-mono text-[11px] text-[#171717]/50">
                    {m.count} transactions logged
                  </div>
                </div>
                <div className="font-mono font-bold text-sm text-[#171717]">
                  ৳{m.amount.toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => onNavigateTab('transactions')}
            className="mt-6 w-full btn-secondary text-xs py-2.5 flex items-center justify-center gap-1.5"
          >
            <span>View all vendors in canonical ledger</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>

      {/* Active Money Leaks Radar Section */}
      {insights.length > 0 && (
        <div className="bg-[#FFFFFF] border border-[#171717] p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between pb-4 mb-6 border-b border-[#171717]/15 gap-2">
            <div>
              <div className="font-mono text-xs uppercase tracking-wider text-[#171717]/60 mb-1">
                RADAR INTELLIGENCE
              </div>
              <h2 className="font-display font-bold text-xl text-[#171717]">
                {t.activeLeaksTitle}
              </h2>
              <p className="font-display text-xs text-[#171717]/70 mt-0.5">
                {t.activeLeaksSubtitle}
              </p>
            </div>

            <button
              onClick={() => onNavigateTab('insights')}
              className="text-xs font-mono font-bold text-[#171717] underline hover:no-underline self-start sm:self-auto"
            >
              Open all leak dossiers →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {insights.slice(0, 3).map((insight, idx) => (
              <div 
                key={insight.id || idx}
                className="p-5 border border-[#171717] bg-[#F6F1E8]/40 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] uppercase font-bold bg-[#FFD84D] px-2 py-0.5 border border-[#171717]/30">
                      {insight.type?.replace('_', ' ') || 'LEAK'}
                    </span>
                    {insight.potential_savings_bdt ? (
                      <span className="font-mono text-xs font-bold bg-[#B7F34A] px-1.5 py-0.5 border border-[#171717]/30">
                        +৳{insight.potential_savings_bdt}/mo
                      </span>
                    ) : null}
                  </div>

                  <h3 className="font-display font-bold text-sm text-[#171717] mb-1.5">
                    {locale === 'bn' ? insight.title_bn || insight.title : insight.title}
                  </h3>

                  <p className="font-display text-xs text-[#171717]/70 line-clamp-2 leading-relaxed mb-3">
                    {locale === 'bn' ? insight.summary_bn || insight.summary : insight.summary}
                  </p>
                </div>

                <div className="pt-3 border-t border-[#171717]/15 flex items-center justify-between text-xs font-mono">
                  <span className="text-[#171717]/60">
                    Math verified
                  </span>
                  <button
                    onClick={() => onNavigateTab('insights')}
                    className="font-bold text-[#171717] underline hover:no-underline cursor-pointer"
                  >
                    Examine proof →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Ledger Transactions Feed */}
      {recentTxList.length > 0 && (
        <div className="bg-[#FFFFFF] border border-[#171717] p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between pb-4 mb-6 border-b border-[#171717]/15 gap-2">
            <div>
              <div className="font-mono text-xs uppercase tracking-wider text-[#171717]/60 mb-1">
                PROVENANCE AUDIT
              </div>
              <h2 className="font-display font-bold text-xl text-[#171717]">
                {t.recentTransactionsTitle}
              </h2>
              <p className="font-display text-xs text-[#171717]/70 mt-0.5">
                {t.recentTransactionsSubtitle}
              </p>
            </div>

            <button
              onClick={() => onNavigateTab('transactions')}
              className="text-xs font-mono font-bold text-[#171717] underline hover:no-underline"
            >
              {t.viewAllLedger}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-[#171717] font-mono text-[11px] text-[#171717]/60 uppercase">
                  <th className="py-2.5 pr-4">Date</th>
                  <th className="py-2.5 px-4">Merchant / Counterparty</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4">Direction</th>
                  <th className="py-2.5 px-4 text-right">Amount (৳)</th>
                  <th className="py-2.5 pl-4 text-right">Proof</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#171717]/10 font-display">
                {recentTxList.map((tx) => {
                  const isIncome = tx.direction === 'INCOME';
                  return (
                    <tr key={tx.id} className="hover:bg-[#F6F1E8]/50 transition-colors">
                      <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap text-[#171717]/70">
                        {tx.transaction_date}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-sm text-[#171717]">
                          {tx.merchant_name}
                        </div>
                        {tx.raw_text_snippet && (
                          <div className="font-mono text-[10px] text-[#171717]/50 truncate max-w-xs">
                            {tx.raw_text_snippet}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono text-[11px] px-2 py-0.5 border border-[#171717]/20 bg-[#F6F1E8]">
                          {tx.category_id}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`font-mono text-[10px] uppercase font-bold px-2 py-0.5 ${
                          isIncome ? 'bg-[#B7F34A] text-[#171717]' : 'bg-[#171717]/10 text-[#171717]'
                        }`}>
                          {tx.direction}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm whitespace-nowrap">
                        <span className={isIncome ? 'text-[#171717]' : 'text-[#171717]'}>
                          {isIncome ? '+' : '-'}৳{tx.amount.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 pl-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => onSelectTransaction(tx)}
                          className="font-mono text-[11px] text-[#171717] underline hover:no-underline font-bold cursor-pointer"
                        >
                          Evidence →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active Savings Targets Snapshot */}
      <div className="bg-[#FFFFFF] border border-[#171717] p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between pb-4 mb-6 border-b border-[#171717]/15 gap-2">
          <div>
            <div className="font-mono text-xs uppercase tracking-wider text-[#171717]/60 mb-1">
              FINANCIAL DISCIPLINE
            </div>
            <h2 className="font-display font-bold text-xl text-[#171717]">
              {t.savingsGoalsTitle}
            </h2>
            <p className="font-display text-xs text-[#171717]/70 mt-0.5">
              {t.savingsGoalsSubtitle}
            </p>
          </div>

          <button
            onClick={() => onNavigateTab('goals')}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1 self-start sm:self-auto"
          >
            <span>{t.newTarget}</span>
          </button>
        </div>

        {goals.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-[#171717]/30 bg-[#F6F1E8]/30">
            <p className="font-display text-sm text-[#171717]/70 mb-3">
              No active targets set yet. Direct recovered leak money towards your goals.
            </p>
            <button
              onClick={() => onNavigateTab('goals')}
              className="btn-primary text-xs py-2 px-4"
            >
              Register your first target →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {goals.map((g) => {
              const current = g.current_amount || 0;
              const target = g.target_amount || 1;
              const pct = Math.min(Math.round((current / target) * 100), 100);
              return (
                <div key={g.id} className="p-5 border border-[#171717] bg-[#F6F1E8]/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-display font-bold text-sm text-[#171717]">
                      {g.title || g.name}
                    </span>
                    <span className="font-mono text-xs font-bold text-[#171717]">
                      {pct}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#FFFFFF] border border-[#171717]/30 mb-3 overflow-hidden">
                    <div 
                      className="h-full bg-[#B7F34A]" 
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono text-[#171717]/60">
                    <span>৳{current.toLocaleString()} saved</span>
                    <span>Target: ৳{target.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
