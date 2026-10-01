import {
  UserProfile,
  ConsentRecord,
  DocumentRecord,
  ProcessingJob,
  Evidence,
  Transaction,
  Merchant,
  Category,
  Insight,
  Recommendation,
  Goal,
  AuditEvent,
  DashboardSummary,
} from '../src/types';
import { DEFAULT_CATEGORIES, MERCHANT_RULES } from './categories';
import { GOLDEN_SAMPLES, PREVIOUS_MONTH_SAMPLE_TRANSACTIONS } from './goldenDataset';
import {
  calculatePeriodMetrics,
  calculateCategoryBreakdown,
  calculateMerchantConcentration,
  generateDeterministicInsights,
} from './financialEngine';

export class MemoryDatabase {
  public users: Map<string, UserProfile> = new Map();
  public consents: Map<string, ConsentRecord[]> = new Map();
  public documents: Map<string, DocumentRecord> = new Map();
  public processingJobs: Map<string, ProcessingJob> = new Map();
  public evidence: Map<string, Evidence> = new Map();
  public transactions: Map<string, Transaction> = new Map();
  public merchants: Map<string, Merchant> = new Map();
  public categories: Category[] = [...DEFAULT_CATEGORIES];
  public insights: Map<string, Insight> = new Map();
  public recommendations: Map<string, Recommendation> = new Map();
  public goals: Map<string, Goal> = new Map();
  public feedback: any[] = [];
  public auditEvents: AuditEvent[] = [];

  constructor() {
    this.seedInitialData();
  }

  public seedInitialData() {
    // 1. Initial User
    const primaryUser: UserProfile = {
      id: 'usr_bangladesh_consumer_01',
      email: 'rahatut.tahrim.mounota@gmail.com',
      phone: '+880 1711-998822',
      locale: 'en',
      timezone: 'Asia/Dhaka',
      currency: 'BDT',
      status: 'ACTIVE',
      created_at: new Date('2026-08-01T08:00:00Z').toISOString(),
    };
    this.users.set(primaryUser.id, primaryUser);

    // 2. Initial Consents
    const initialConsents: ConsentRecord[] = [
      {
        id: 'cst_01',
        user_id: primaryUser.id,
        consent_type: 'PRIVACY_POLICY',
        policy_version: 'v1.0-bd',
        accepted_at: new Date('2026-08-01T08:05:00Z').toISOString(),
        ip_hash: 'sha256:d8a9f2bc...',
      },
      {
        id: 'cst_02',
        user_id: primaryUser.id,
        consent_type: 'FINANCIAL_DATA_PROCESSING',
        policy_version: 'v1.0-bd',
        accepted_at: new Date('2026-08-01T08:05:00Z').toISOString(),
        ip_hash: 'sha256:d8a9f2bc...',
      },
      {
        id: 'cst_03',
        user_id: primaryUser.id,
        consent_type: 'DOCUMENT_PROCESSING',
        policy_version: 'v1.0-bd',
        accepted_at: new Date('2026-08-01T08:05:00Z').toISOString(),
        ip_hash: 'sha256:d8a9f2bc...',
      },
      {
        id: 'cst_04',
        user_id: primaryUser.id,
        consent_type: 'OPTIONAL_AI_PROCESSING',
        policy_version: 'v1.0-bd',
        accepted_at: new Date('2026-08-01T08:05:00Z').toISOString(),
        ip_hash: 'sha256:d8a9f2bc...',
      },
    ];
    this.consents.set(primaryUser.id, initialConsents);

    // 3. Populate Golden Sample Document & Evidence
    const sample = GOLDEN_SAMPLES.sample_bkash;
    this.documents.set(sample.document.id, sample.document);

    sample.evidence.forEach(ev => this.evidence.set(ev.id, ev));
    sample.transactions.forEach(tx => this.transactions.set(tx.id, tx));

    // Also store previous month transactions
    PREVIOUS_MONTH_SAMPLE_TRANSACTIONS.forEach(tx => this.transactions.set(tx.id, tx));

    // 4. Initial Goals
    const initialGoal: Goal = {
      id: 'goal_emergency_fund',
      user_id: primaryUser.id,
      title: 'Emergency Buffer (3 Months Expenses)',
      name: 'Emergency Buffer (3 Months Expenses)',
      name_bn: 'জরুরি তহবিল (৩ মাসের খরচ)',
      target_amount: 150000,
      current_amount: 62000,
      target_date: '2027-03-31',
      category_id: 'cat_financial',
      status: 'IN_PROGRESS',
      monthly_required_savings: 14666,
      created_at: new Date('2026-08-15T10:00:00Z').toISOString(),
    };
    this.goals.set(initialGoal.id, initialGoal);

    // 5. Initial Audit Log
    this.logAudit(primaryUser.id, 'LOGIN', 'User', primaryUser.id, 'Successful OTP login');
    this.logAudit(primaryUser.id, 'CONSENT_ACCEPTED', 'ConsentRecord', 'cst_01', 'Accepted financial data processing');
    this.logAudit(primaryUser.id, 'UPLOAD_CREATED', 'Document', sample.document.id, `Uploaded ${sample.document.filename}`);

    // 6. Generate Initial Deterministic Insights
    this.recalculateUserInsights(primaryUser.id);
  }

  public logAudit(userId: string, event_type: string, object_type: string, object_id: string, action: string, metadata?: Record<string, any>) {
    const event: AuditEvent = {
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user_id: userId,
      event_type,
      object_type,
      object_id,
      action,
      metadata,
      created_at: new Date().toISOString(),
    };
    this.auditEvents.unshift(event);
    if (this.auditEvents.length > 500) {
      this.auditEvents.pop();
    }
  }

  public normalizeMerchant(rawName: string): { canonicalName: string; categoryId: string } {
    for (const rule of MERCHANT_RULES) {
      if (rule.pattern.test(rawName)) {
        return { canonicalName: rule.canonicalName, categoryId: rule.categoryId };
      }
    }
    return { canonicalName: rawName.trim() || 'Unknown Merchant', categoryId: 'cat_other' };
  }

  public detectDuplicateCandidate(newTx: Partial<Transaction>, userId: string): Transaction | null {
    for (const existing of this.transactions.values()) {
      if (existing.user_id !== userId) continue;
      if (
        existing.transaction_date === newTx.transaction_date &&
        Math.abs(existing.amount - (newTx.amount || 0)) < 0.01 &&
        existing.direction === newTx.direction &&
        (existing.merchant_name.toLowerCase() === (newTx.merchant_name || '').toLowerCase() ||
          existing.description.toLowerCase() === (newTx.description || '').toLowerCase())
      ) {
        return existing;
      }
    }
    return null;
  }

  public recalculateUserInsights(userId: string) {
    const allTxns = Array.from(this.transactions.values()).filter(t => t.user_id === userId);
    const currentTxns = allTxns.filter(t => t.transaction_date.startsWith('2026-09'));
    const previousTxns = allTxns.filter(t => t.transaction_date.startsWith('2026-08'));

    const { insights, recommendations } = generateDeterministicInsights(currentTxns, previousTxns, userId);

    // Replace existing active insights
    Array.from(this.insights.values())
      .filter(i => i.user_id === userId)
      .forEach(i => this.insights.delete(i.id));

    Array.from(this.recommendations.values())
      .filter(r => r.user_id === userId)
      .forEach(r => this.recommendations.delete(r.id));

    insights.forEach(ins => this.insights.set(ins.id, ins));
    recommendations.forEach(rec => this.recommendations.set(rec.id, rec));
  }

  public getDashboardSummary(userId: string): DashboardSummary {
    const allTxns = Array.from(this.transactions.values()).filter(t => t.user_id === userId);
    const currentTxns = allTxns.filter(t => t.transaction_date.startsWith('2026-09'));
    const previousTxns = allTxns.filter(t => t.transaction_date.startsWith('2026-08'));

    const currentMetrics = calculatePeriodMetrics(currentTxns);
    const previousMetrics = calculatePeriodMetrics(previousTxns);

    const expenseChangePct =
      previousMetrics.total_expenses > 0
        ? Math.round(
            ((currentMetrics.total_expenses - previousMetrics.total_expenses) /
              previousMetrics.total_expenses) *
              100 *
              10
          ) / 10
        : 0;

    const rawCategorySummary = calculateCategoryBreakdown(currentTxns);
    const categoryBreakdown = rawCategorySummary.map(cs => {
      const cat = this.categories.find(c => c.id === cs.category_id) || {
        name: 'Other',
        name_bn: 'অন্যান্য',
        color: '#94A3B8',
      };
      return {
        category_id: cs.category_id,
        category_name: cat.name,
        category_name_bn: cat.name_bn,
        amount: cs.amount,
        pct: cs.pct,
        count: cs.count,
        color: cat.color,
      };
    });

    const merchantConcentration = calculateMerchantConcentration(currentTxns);

    const userRecs = Array.from(this.recommendations.values()).filter(r => r.user_id === userId);
    const minSavings = userRecs.reduce((acc, r) => acc + r.potential_savings_min, 0);
    const maxSavings = userRecs.reduce((acc, r) => acc + r.potential_savings_max, 0);

    const needsReviewCount = currentTxns.filter(t => t.status === 'NEEDS_REVIEW').length;
    const duplicateCount = currentTxns.filter(t => t.is_duplicate_candidate).length;

    const recentSorted = [...currentTxns].sort((a, b) => {
      const dateA = a.posted_at || a.transaction_date;
      const dateB = b.posted_at || b.transaction_date;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return {
      period: 'September 2026',
      total_expenses: currentMetrics.total_expenses,
      total_income: currentMetrics.total_income,
      net_savings: currentMetrics.net_savings,
      previous_period_expenses: previousMetrics.total_expenses,
      expense_change_pct: expenseChangePct,
      needs_review_count: needsReviewCount,
      duplicate_candidates_count: duplicateCount,
      total_transactions_count: currentTxns.length,
      category_breakdown: categoryBreakdown,
      merchant_concentration: merchantConcentration,
      potential_savings: {
        min: Math.round(minSavings),
        max: Math.round(maxSavings),
      },
      recent_transactions: recentSorted.slice(0, 10),
    };
  }

  public deleteUserAccount(userId: string) {
    this.logAudit(userId, 'ACCOUNT_DELETION_REQUESTED', 'User', userId, 'Requested full data erasure');
    // Scrub user's transactions
    for (const [id, tx] of this.transactions.entries()) {
      if (tx.user_id === userId) this.transactions.delete(id);
    }
    // Scrub documents
    for (const [id, doc] of this.documents.entries()) {
      if (doc.user_id === userId) this.documents.delete(id);
    }
    // Scrub insights & recs
    for (const [id, ins] of this.insights.entries()) {
      if (ins.user_id === userId) this.insights.delete(id);
    }
    for (const [id, rec] of this.recommendations.entries()) {
      if (rec.user_id === userId) this.recommendations.delete(id);
    }
    // Scrub goals
    for (const [id, goal] of this.goals.entries()) {
      if (goal.user_id === userId) this.goals.delete(id);
    }
    // Set user status to DELETED
    const user = this.users.get(userId);
    if (user) {
      user.status = 'DELETED';
      user.email = 'deleted@kothaygelo.local';
      user.phone = '0000000000';
    }
    this.logAudit(userId, 'ACCOUNT_DELETED', 'User', userId, 'All tenant financial records permanently scrubbed');
  }
}

export const db = new MemoryDatabase();
