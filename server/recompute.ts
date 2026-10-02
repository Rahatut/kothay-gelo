import { listTransactions, toClientTransaction, type TransactionRow } from './db/repositories/transactions';
import { replaceInsights } from './db/repositories/insights';
import {
  generateDeterministicInsights,
  mostActivePeriodKey,
  previousPeriodKey,
} from './financialEngine';
import type { Recommendation, Transaction } from '../src/types';

/**
 * The one place insights and recommendations are computed and stored.
 *
 * There were two recompute implementations. `MemoryDatabase.recalculateUserInsights`
 * was called by the upload pipeline and read `db.transactions`, writing only to
 * `db.insights`; a second copy in `server.ts` was called by manual entry, edit,
 * confirm, and delete, read the relational ledger, and — before this module
 * existed — wrote only to the same memory maps. Two implementations of one rule is
 * how the upload path ended up producing clues no read path could see.
 *
 * Both now go through here, which reads the relational store and writes the
 * relational store, so the two agree by construction rather than by inspection.
 *
 * The period split is the engine's business (Principle I). This module decides only
 * *which* rows are current and which are the comparison window, using the same rule
 * the engine exports: the most active period present in the data, so a statement
 * uploaded today lands in a total instead of vanishing.
 */

const PAGE = 1000;

/**
 * Every row for an account, paged.
 *
 * `listTransactions` bounds a page at 1000 and orders newest first, so a caller that
 * wanted "everything" and read `page[0]` as the earliest row was taking the newest
 * date as the period start. The range below is computed from the rows rather than
 * from the ends of this list.
 */
async function readAllTransactions(accountId: string): Promise<TransactionRow[]> {
  const all: TransactionRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await listTransactions(accountId, { limit: PAGE, offset });
    all.push(...page);
    if (page.length < PAGE) return all;
  }
}

/** Oldest and newest ISO date across the rows, or null when there are none. */
function dateRange(rows: TransactionRow[]): { start: string; end: string } | null {
  if (rows.length === 0) return null;
  let start = rows[0].transaction_date;
  let end = rows[0].transaction_date;
  for (const row of rows) {
    if (row.transaction_date < start) start = row.transaction_date;
    if (row.transaction_date > end) end = row.transaction_date;
  }
  return { start, end };
}

export function splitCurrentAndPrevious(rows: Transaction[]): {
  currentTxns: Transaction[];
  previousTxns: Transaction[];
} {
  const fromData = mostActivePeriodKey(rows);
  const currentKey =
    fromData ?? `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
  const previousKey = previousPeriodKey(currentKey);
  return {
    currentTxns: rows.filter((t) => t.transaction_date.startsWith(currentKey)),
    previousTxns: previousKey
      ? rows.filter((t) => t.transaction_date.startsWith(previousKey))
      : [],
  };
}

/**
 * Recomputes and persists one account's insights and recommendations.
 *
 * Never throws. A ledger is already correct when this runs, and only the derived
 * view depends on it: a failure here must not fail the upload or the edit that
 * triggered it. The error is logged so it is not silent.
 */
export async function recomputeInsightsForAccount(userId: string): Promise<void> {
  try {
    const stored = await readAllTransactions(userId);
    const rows = stored.map((row) => toClientTransaction(row));
    const { currentTxns, previousTxns } = splitCurrentAndPrevious(rows);
    const { insights, recommendations } = generateDeterministicInsights(
      currentTxns,
      previousTxns,
      userId,
    );

    // The range the findings were measured over. Taken from every row, not from the
    // comparison window: a period-comparison insight is about both windows.
    const range = dateRange(stored);

    // Recommendations are keyed to the engine's insight id, which is regenerated on
    // every run. They are grouped here and the repository assigns the durable ids.
    const byInsightId = new Map<string, Recommendation[]>();
    for (const rec of recommendations) {
      const existing = byInsightId.get(rec.insight_id);
      if (existing) existing.push(rec);
      else byInsightId.set(rec.insight_id, [rec]);
    }

    await replaceInsights(
      userId,
      insights.map((insight) => ({
        type: insight.type,
        title: insight.title,
        title_bn: insight.title_bn ?? null,
        // The engine's `summary` is the prose the user reads; the column is called
        // `description`. Same text, and the views read `summary`.
        description: insight.summary ?? insight.description ?? '',
        description_bn: insight.summary_bn ?? insight.description_bn ?? null,
        confidence: insight.confidence,
        calculationVersion: insight.calculation_version ?? 'v1.0-deterministic',
        supportingTransactionIds: insight.supporting_transaction_ids ?? [],
        periodStart: range?.start ?? '',
        periodEnd: range?.end ?? '',
        // Carried through so the narration path can state the calculation rather
        // than phrase a total it cannot show the work for.
        mathFormula: insight.math_formula ?? null,
        metricValue: insight.metric_value ?? null,
        recommendations: (byInsightId.get(insight.id) ?? []).map((rec) => ({
          action_type: rec.action_type,
          title: rec.title,
          title_bn: rec.title_bn ?? null,
          description: rec.description,
          description_bn: rec.description_bn ?? null,
          potential_savings_min: rec.potential_savings_min,
          potential_savings_max: rec.potential_savings_max,
          calculation_method: rec.calculation_method,
          calculationVersion: rec.calculation_version,
          supportingTransactionIds: rec.supporting_transaction_ids ?? [],
        })),
      })),
    );
  } catch (err) {
    console.error('[insights] recompute failed:', err);
  }
}