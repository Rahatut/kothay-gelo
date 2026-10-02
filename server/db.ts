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
import { DEFAULT_CATEGORIES, MERCHANT_RULES, UNCATEGORIZED_CATEGORY_ID } from './categories';
import { newAuditId } from './ids';
import {
  calculatePeriodMetrics,
  calculateCategoryBreakdown,
  calculateMerchantConcentration,
  generateDeterministicInsights,
  mostActivePeriodKey,
  previousPeriodKey,
  periodLabelOf,
} from './financialEngine';

/**
 * Splits a user's rows into the current period and the one before it.
 *
 * "Current" is the latest period actually present in the data, so a row entered
 * today lands in a total instead of vanishing. This replaces a hardcoded
 * '2026-09' prefix that silently excluded every other date. With no usable rows
 * at all the UTC calendar month supplies the label, so an empty dashboard still
 * names the period it is reporting on.
 */
function splitCurrentAndPreviousPeriod(allTxns: Transaction[]): {
  currentKey: string;
  currentTxns: Transaction[];
  previousTxns: Transaction[];
} {
  const fromData = mostActivePeriodKey(allTxns);
  const currentKey =
    fromData ??
    `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
  const previousKey = previousPeriodKey(currentKey);
  return {
    currentKey,
    currentTxns: allTxns.filter(t => t.transaction_date.startsWith(currentKey)),
    previousTxns: previousKey
      ? allTxns.filter(t => t.transaction_date.startsWith(previousKey))
      : [],
  };
}

export class MemoryDatabase {
  public users: Map<string, UserProfile> = new Map();
  public consents: Map<string, ConsentRecord[]> = new Map();
  public documents: Map<string, DocumentRecord> = new Map();
  public processingJobs: Map<string, ProcessingJob> = new Map();
  public evidence: Map<string, Evidence> = new Map();
  public transactions: Map<string, Transaction> = new Map();
  public categories: Category[] = [...DEFAULT_CATEGORIES];
  public insights: Map<string, Insight> = new Map();
  public recommendations: Map<string, Recommendation> = new Map();
  public goals: Map<string, Goal> = new Map();
  public feedback: any[] = [];
  public auditEvents: AuditEvent[] = [];

  public logAudit(userId: string, event_type: string, object_type: string, object_id: string, action: string, metadata?: Record<string, any>) {
    const event: AuditEvent = {
      id: newAuditId(),
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
    return { canonicalName: rawName.trim() || 'Unknown Merchant', categoryId: UNCATEGORIZED_CATEGORY_ID };
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
    const { currentTxns, previousTxns } = splitCurrentAndPreviousPeriod(allTxns);

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
