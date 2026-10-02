import { query, execute } from '../client';
import { newGoalId } from '../../ids';
import { nowIso } from './base';

export interface GoalRow {
  id: string;
  account_id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  target_date: string;
  created_at: string;
}

/**
 * Savings targets.
 *
 * No defaults for target_amount or target_date. The previous code wrote a
 * hardcoded future date and a default amount onto whatever the user omitted,
 * which turned an omission into a real financial commitment.
 */

export async function listGoals(accountId: string): Promise<GoalRow[]> {
  return query<GoalRow>(
    `SELECT * FROM goals WHERE account_id = ? ORDER BY created_at DESC, id DESC`,
    [accountId],
  );
}

export async function getGoal(accountId: string, goalId: string): Promise<GoalRow | null> {
  const rows = await query<GoalRow>(`SELECT * FROM goals WHERE account_id = ? AND id = ?`, [
    accountId,
    goalId,
  ]);
  return rows[0] ?? null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createGoal(input: {
  accountId: string;
  title: string;
  targetAmount: number;
  targetDate: string;
}): Promise<GoalRow> {
  const title = input.title.trim();
  if (!title) throw new RangeError('title is required');
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
    throw new RangeError('target amount must be greater than zero');
  }
  if (!ISO_DATE.test(input.targetDate)) {
    throw new RangeError('target date must be YYYY-MM-DD');
  }

  const row: GoalRow = {
    id: newGoalId(),
    account_id: input.accountId,
    title,
    // Rounded here so a stored target and a displayed target agree; the engine
    // remains the authority for every figure derived from them.
    target_amount: Math.round(input.targetAmount * 100) / 100,
    current_amount: 0,
    target_date: input.targetDate,
    created_at: nowIso(),
  };

  await execute(
    `INSERT INTO goals (id, account_id, title, target_amount, current_amount, target_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.account_id,
      row.title,
      row.target_amount,
      row.current_amount,
      row.target_date,
      row.created_at,
    ],
  );

  return row;
}

export async function deleteGoal(accountId: string, goalId: string): Promise<boolean> {
  // The account_id predicate means a cross-account delete matches no row and
  // reports nothing changed, rather than reporting that the goal exists.
  const result = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM goals WHERE account_id = ? AND id = ?`,
    [accountId, goalId],
  );
  if ((result[0]?.n ?? 0) === 0) return false;
  await execute(`DELETE FROM goals WHERE account_id = ? AND id = ?`, [accountId, goalId]);
  return true;
}
