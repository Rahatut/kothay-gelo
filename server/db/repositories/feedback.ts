import { query, execute } from '../client';
import { newFeedbackId } from '../../ids';
import { nowIso } from './base';

export type FeedbackType = 'helpful' | 'not_helpful' | 'acted_on';
export type FeedbackObjectType = 'Insight' | 'Recommendation';

export const FEEDBACK_TYPES: readonly FeedbackType[] = ['helpful', 'not_helpful', 'acted_on'];

export function isFeedbackType(value: unknown): value is FeedbackType {
  return typeof value === 'string' && (FEEDBACK_TYPES as readonly string[]).includes(value);
}

export interface FeedbackRow {
  id: string;
  account_id: string;
  object_type: FeedbackObjectType;
  object_id: string;
  feedback_type: FeedbackType;
  comment: string | null;
  created_at: string;
}

export async function recordFeedback(input: {
  accountId: string;
  objectType: FeedbackObjectType;
  objectId: string;
  feedbackType: FeedbackType;
  comment?: string | null;
}): Promise<FeedbackRow> {
  const id = newFeedbackId();
  await execute(
    `INSERT INTO feedback
       (id, account_id, object_type, object_id, feedback_type, comment, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.accountId,
      input.objectType,
      input.objectId,
      input.feedbackType,
      input.comment ?? null,
      nowIso(),
    ],
  );

  const rows = await query<FeedbackRow>(`SELECT * FROM feedback WHERE id = ?`, [id]);
  if (!rows[0]) throw new Error('feedback was not written');
  return rows[0];
}

/**
 * Ids among `objectIds` that have an `acted_on` feedback row.
 *
 * Returned as a set for the recommendations list, which marks each card `tracked`.
 * One query for the whole page rather than one per recommendation.
 */
export async function actedOnIds(
  accountId: string,
  objectType: FeedbackObjectType,
  objectIds: string[],
): Promise<Set<string>> {
  if (objectIds.length === 0) return new Set();

  const placeholders = objectIds.map(() => '?').join(', ');
  const rows = await query<{ object_id: string }>(
    `SELECT DISTINCT object_id FROM feedback
      WHERE account_id = ? AND object_type = ? AND feedback_type = 'acted_on'
        AND object_id IN (${placeholders})`,
    [accountId, objectType, ...objectIds],
  );
  return new Set(rows.map((r) => r.object_id));
}