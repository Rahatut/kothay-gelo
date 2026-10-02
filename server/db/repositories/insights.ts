import { query, transaction } from '../client';
import type { Insight, Recommendation } from '../../../src/types';
import { stableInsightId, stableRecommendationId } from '../../ids';
import { nowIso } from './base';

export interface InsightRow {
  id: string;
  account_id: string;
  type: string;
  title: string;
  title_bn: string | null;
  description: string;
  description_bn: string | null;
  confidence: number;
  calculation_version: string;
  supporting_transaction_ids: string;
  period_start: string;
  period_end: string;
  created_at: string;
  math_formula: string | null;
  metric_value: string | null;
}

export interface InsightWithEvidence extends Omit<InsightRow, 'supporting_transaction_ids'> {
  supportingTransactionIds: string[];
}

/**
 * Tolerant decode of a JSON id-array column.
 *
 * A malformed column must not take down the list: it yields no evidence links, and
 * the write path refuses to create such a row in the first place.
 */
function parseIds(column: string): string[] {
  try {
    const value = JSON.parse(column);
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  } catch {
    // fall through to the empty result
  }
  return [];
}

function decode(row: InsightRow): InsightWithEvidence {
  const { supporting_transaction_ids, ...rest } = row;
  return { ...rest, supportingTransactionIds: parseIds(supporting_transaction_ids) };
}

export async function listInsights(accountId: string): Promise<InsightWithEvidence[]> {
  const rows = await query<InsightRow>(
    `SELECT * FROM insights WHERE account_id = ? ORDER BY created_at DESC, id DESC`,
    [accountId],
  );
  return rows.map(decode);
}

export async function getInsight(
  accountId: string,
  insightId: string,
): Promise<InsightWithEvidence | null> {
  const rows = await query<InsightRow>(
    `SELECT * FROM insights WHERE account_id = ? AND id = ?`,
    [accountId, insightId],
  );
  return rows[0] ? decode(rows[0]) : null;
}

/**
 * The engine's insight output, in the shape the repository stores.
 *
 * Field names are the engine's rather than the schema's so nothing has to be
 * translated on the way in: a new detector emitting a new type is a CHECK
 * migration and nothing else.
 */
export interface InsightWrite {
  type: string;
  title: string;
  title_bn?: string | null;
  description: string;
  description_bn?: string | null;
  confidence: number;
  calculationVersion: string;
  supportingTransactionIds: string[];
  periodStart: string;
  periodEnd: string;
  // Stated by the engine, not derived here. Null when the engine produced none.
  mathFormula?: string | null;
  metricValue?: string | null;
  recommendations: RecommendationWrite[];
}

export interface RecommendationWrite {
  action_type: string;
  title: string;
  title_bn?: string | null;
  description: string;
  description_bn?: string | null;
  potential_savings_min: number;
  potential_savings_max: number;
  calculation_method: string;
  calculationVersion: string;
  supportingTransactionIds: string[];
}

/** A stored insight together with its recommendations, keyed by stored ids. */
export interface PersistedInsights {
  insightIds: string[];
  recommendationIds: string[];
}

/**
 * Replaces an account's insights and recommendations in one transaction.
 *
 * Recomputation replaces rather than accumulates: a stale insight left behind
 * would keep claiming a pattern the data no longer shows.
 *
 * Both tables are written together because `recommendations.insight_id` has
 * `ON DELETE CASCADE`. Writing insights and recommendations separately leaves a
 * window where recommendations reference an insight that no longer exists, or
 * vice versa, and a reader that arrived in that window would see a saving with no
 * finding behind it.
 *
 * Ids are derived from the record's own content, not generated randomly. The engine's
 * ids are regenerated on every recompute and are not stable, and a random id here
 * would be no better: the user marked a recommendation "acted on", a later ledger
 * write replaced the rows, and the mark silently vanished because the id it was
 * stored against no longer existed. A content-seeded id survives any recompute that
 * produces the same finding, so feedback outlives a recompute the way it is expected
 * to. The occurrences counter disambiguates two records with identical content.
 *
 * An insight with no supporting rows is dropped, and its recommendations with it.
 * An insight with no evidence is not a finding (constitutional principle VI), and a
 * recommendation pointing at a dropped insight would be a saving with nothing behind
 * it.
 */
export async function replaceInsights(
  accountId: string,
  insights: InsightWrite[],
): Promise<PersistedInsights> {
  const usable = insights.filter((i) => i.supportingTransactionIds.length > 0);

  return transaction(async (tx) => {
    // Recommendations first: they reference insights, and deleting the insights
    // the old recommendations point at is what makes the set replaceable.
    await tx.execute({ sql: `DELETE FROM recommendations WHERE account_id = ?`, args: [accountId] });
    await tx.execute({ sql: `DELETE FROM insights WHERE account_id = ?`, args: [accountId] });

    const insightIds: string[] = [];
    const recommendationIds: string[] = [];
    const insightOccurrences = new Map<string, number>();

    for (const insight of usable) {
      // Seeded on the finding's content — its type and the rows it cites — and
      // deliberately NOT on `periodStart`/`periodEnd`. Those are the account-wide
      // min/max dates from the ledger, so a single new or backdated row shifts the
      // range for every finding and re-keys all of them, which orphans exactly the
      // feedback this scheme exists to preserve. The supporting set changes only when
      // the finding itself changes.
      const insightSeed = [
        accountId,
        insight.type,
        [...insight.supportingTransactionIds].sort().join(','),
      ].join('|');
      const occurrence = insightOccurrences.get(insightSeed) ?? 0;
      insightOccurrences.set(insightSeed, occurrence + 1);
      const insightId = stableInsightId(`${insightSeed}#${occurrence}`);
      insightIds.push(insightId);

      await tx.execute({
        sql:
          `INSERT INTO insights
             (id, account_id, type, title, title_bn, description, description_bn, confidence,
              calculation_version, supporting_transaction_ids, period_start, period_end, created_at,
              math_formula, metric_value)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          insightId,
          accountId,
          insight.type,
          insight.title,
          insight.title_bn ?? null,
          insight.description,
          insight.description_bn ?? null,
          insight.confidence,
          insight.calculationVersion,
          JSON.stringify(insight.supportingTransactionIds),
          insight.periodStart,
          insight.periodEnd,
          nowIso(),
          insight.mathFormula ?? null,
          insight.metricValue ?? null,
        ],
      });

      const recOccurrences = new Map<string, number>();

      for (const rec of insight.recommendations) {
        const recSeed = [
          insightId,
          rec.action_type,
          rec.calculation_method,
          rec.potential_savings_min,
          rec.potential_savings_max,
          [...rec.supportingTransactionIds].sort().join(','),
        ].join('|');
        const recOccurrence = recOccurrences.get(recSeed) ?? 0;
        recOccurrences.set(recSeed, recOccurrence + 1);
        const recId = stableRecommendationId(`${recSeed}#${recOccurrence}`);
        recommendationIds.push(recId);
        await tx.execute({
          sql:
            `INSERT INTO recommendations
               (id, account_id, insight_id, action_type, title, title_bn, description,
                description_bn, potential_savings_min, potential_savings_max, calculation_method,
                calculation_version, supporting_transaction_ids, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            recId,
            accountId,
            insightId,
            rec.action_type,
            rec.title,
            rec.title_bn ?? null,
            rec.description,
            rec.description_bn ?? null,
            rec.potential_savings_min,
            rec.potential_savings_max,
            rec.calculation_method,
            rec.calculationVersion,
            JSON.stringify(rec.supportingTransactionIds),
            nowIso(),
          ],
        });
      }
    }

    return { insightIds, recommendationIds };
  });
}

/** A stored recommendation, with the JSON column decoded and its insight joined. */
export type RecommendationRow = {
  id: string;
  account_id: string;
  insight_id: string;
  action_type: string;
  title: string;
  title_bn: string | null;
  description: string;
  description_bn: string | null;
  potential_savings_min: number;
  potential_savings_max: number;
  calculation_method: string;
  calculation_version: string;
  supporting_transaction_ids: string[];
  created_at: string;
  insight_type: string;
  insight_title: string;
};

/**
 * One recommendation, scoped to the account.
 *
 * The feedback route looked this up in `db.recommendations`, the in-memory map. Now
 * that recommendations are stored relationally, that map is empty, so the route
 * would answer 404 for a recommendation that plainly exists. The join is the same as
 * the list, so the two cannot report different fields for the same row.
 */
export async function getRecommendation(
  accountId: string,
  recommendationId: string,
): Promise<RecommendationRow | null> {
  const rows = await query<RecommendationRow & { supporting_transaction_ids: string }>(
    `SELECT r.*, i.type AS insight_type, i.title AS insight_title
       FROM recommendations r
       JOIN insights i ON i.id = r.insight_id
      WHERE r.account_id = ? AND r.id = ?`,
    [accountId, recommendationId],
  );
  const row = rows[0];
  return row ? { ...row, supporting_transaction_ids: parseIds(row.supporting_transaction_ids) } : null;
}

export async function listRecommendations(
  accountId: string,
): Promise<RecommendationRow[]> {
  const rows = await query<RecommendationRow & { supporting_transaction_ids: string }>(
    `SELECT r.*, i.type AS insight_type, i.title AS insight_title
       FROM recommendations r
       JOIN insights i ON i.id = r.insight_id
      WHERE r.account_id = ?
      ORDER BY r.created_at DESC, r.id DESC`,
    [accountId],
  );
  return rows.map((row) => ({ ...row, supporting_transaction_ids: parseIds(row.supporting_transaction_ids) }));
}

/**
 * Recommendations grouped by their insight id.
 *
 * `GET /v1/insights` needs the savings figure and the action text that the UI
 * renders on each card. Those live on the recommendation, not on the insight, so
 * the list has to carry them across. Grouped in one pass here rather than by the
 * caller so both insights routes cannot disagree about which recommendation
 * supplies the figure.
 */
export async function recommendationsByInsight(
  accountId: string,
): Promise<Map<string, RecommendationRow[]>> {
  const rows = await listRecommendations(accountId);
  const grouped = new Map<string, RecommendationRow[]>();
  for (const row of rows) {
    const existing = grouped.get(row.insight_id);
    if (existing) existing.push(row);
    else grouped.set(row.insight_id, [row]);
  }
  return grouped;
}

/**
 * Maps a stored insight to the `Insight` the views are written against.
 *
 * The store is narrower than the contract, in three ways that each broke a view when
 * a row was sent straight through:
 *
 *   - The prose column is `description`; the views read `summary`. Omitting it left
 *     a card with a title and no sentence.
 *   - `potential_savings_bdt` and the action text are not columns on this table at
 *     all. They are the parent's recommendation, and `InsightsView` and
 *     `DashboardView` both render them on the card. Sending the row alone deleted
 *     the saving figure from every clue.
 *   - `evidence_ids` is not stored. The insights table keeps transaction ids, and
 *     evidence is reached through them, so the field is omitted rather than faked.
 *     `supporting_transaction_ids` is the real evidence link and is populated.
 *
 * The savings figure is the largest upper bound among the insight's
 * recommendations, and the action text is the first recommendation's title. Both are
 * engine-computed amounts passed through unchanged; nothing here does arithmetic on
 * money (constitutional principle I). With no recommendation, both fields are
 * omitted, which is what the views check for before showing a saving.
 */
export function toClientInsight(
  row: InsightWithEvidence,
  recommendations: RecommendationRow[] = [],
): Insight {
  const savings = recommendations.reduce(
    (max, rec) => (rec.potential_savings_max > max ? rec.potential_savings_max : max),
    0,
  );
  const lead = recommendations[0];

  return {
    id: row.id,
    user_id: row.account_id,
    type: row.type,
    title: row.title,
    title_bn: row.title_bn ?? undefined,
    summary: row.description,
    summary_bn: row.description_bn ?? undefined,
    description: row.description,
    description_bn: row.description_bn ?? undefined,
    confidence: row.confidence,
    calculation_version: row.calculation_version,
    supporting_transaction_ids: row.supportingTransactionIds,
    created_at: row.created_at,
    ...(row.math_formula ? { math_formula: row.math_formula } : {}),
    ...(row.metric_value ? { metric_value: row.metric_value } : {}),
    ...(savings > 0 ? { potential_savings_bdt: savings } : {}),
    ...(lead
      ? { action_text: lead.title, action_text_bn: lead.title_bn ?? undefined }
      : {}),
  } satisfies Insight;
}

/**
 * Maps a stored recommendation to the `Recommendation` the views are written against.
 *
 * The id columns are the account and insight references, renamed to the contract's
 * `user_id` and `insight_id`. The joined insight type and title are carried through
 * because a recommendation card shows what it is a response to.
 */
export function toClientRecommendation(row: RecommendationRow): Recommendation {
  return {
    id: row.id,
    user_id: row.account_id,
    insight_id: row.insight_id,
    action_type: row.action_type as Recommendation['action_type'],
    title: row.title,
    title_bn: row.title_bn ?? '',
    description: row.description,
    description_bn: row.description_bn ?? '',
    potential_savings_min: row.potential_savings_min,
    potential_savings_max: row.potential_savings_max,
    calculation_method: row.calculation_method,
    calculation_version: row.calculation_version,
    supporting_transaction_ids: row.supporting_transaction_ids,
    created_at: row.created_at,
  };
}
