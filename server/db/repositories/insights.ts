import { query, execute } from '../client';
import { newInsightId } from '../../ids';
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
}

export interface InsightWithEvidence extends Omit<InsightRow, 'supporting_transaction_ids'> {
  supportingTransactionIds: string[];
}

function decode(row: InsightRow): InsightWithEvidence {
  const { supporting_transaction_ids, ...rest } = row;
  let parsed: string[] = [];
  try {
    const value = JSON.parse(supporting_transaction_ids);
    if (Array.isArray(value)) parsed = value.filter((v): v is string => typeof v === 'string');
  } catch {
    // A malformed column must not take down the list. It yields no evidence
    // links, and the repository test asserts such rows are not created.
    parsed = [];
  }
  return { ...rest, supportingTransactionIds: parsed };
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
 * Replaces an account's insights in one transaction.
 *
 * Recomputation replaces rather than accumulates: a stale insight left behind
 * would keep claiming a pattern the data no longer shows.
 */
export async function replaceInsights(
  accountId: string,
  insights: {
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
  }[],
): Promise<number> {
  // An insight with no supporting rows is not a finding (constitution VI), so
  // it is dropped rather than stored and later rendered as a bare claim.
  const usable = insights.filter((i) => i.supportingTransactionIds.length > 0);

  await execute(`DELETE FROM insights WHERE account_id = ?`, [accountId]);

  for (const insight of usable) {
    await execute(
      `INSERT INTO insights
         (id, account_id, type, title, title_bn, description, description_bn, confidence,
          calculation_version, supporting_transaction_ids, period_start, period_end, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newInsightId(),
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
      ],
    );
  }

  return usable.length;
}
