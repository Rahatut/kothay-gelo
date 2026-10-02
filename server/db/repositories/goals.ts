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

/**
 * Applies a progress update, scoped to the owning account.
 *
 * This exists because `PATCH /v1/goals/:id` read and wrote `db.goals`, a map that
 * nothing writes to: `POST /v1/goals` has always gone through `createGoal` and the
 * relational store. The route therefore answered 404 for every goal the user could
 * see listed, so a savings target could be created and then never updated.
 *
 * The `account_id` predicate is what makes this safe as well as correct. An id
 * belonging to another account matches no row, which is reported as "not found"
 * rather than "changed", so the endpoint does not confirm the existence of another
 * account's goal.
 */
export async function updateGoal(
  accountId: string,
  goalId: string,
  changes: { currentAmount?: number; targetAmount?: number; title?: string; targetDate?: string },
): Promise<GoalRow | null> {
  const sets: string[] = [];
  const params: Array<string | number> = [];

  if (changes.currentAmount !== undefined) {
    if (!Number.isFinite(changes.currentAmount) || changes.currentAmount < 0) {
      throw new RangeError('current amount must be zero or more');
    }
    sets.push('current_amount = ?');
    // Rounded for the same reason `createGoal` rounds the target: a stored figure
    // and a displayed figure must agree.
    params.push(Math.round(changes.currentAmount * 100) / 100);
  }
  if (changes.targetAmount !== undefined) {
    if (!Number.isFinite(changes.targetAmount) || changes.targetAmount <= 0) {
      throw new RangeError('target amount must be greater than zero');
    }
    sets.push('target_amount = ?');
    params.push(Math.round(changes.targetAmount * 100) / 100);
  }
  if (changes.title !== undefined) {
    const title = changes.title.trim();
    if (!title) throw new RangeError('title cannot be empty');
    sets.push('title = ?');
    params.push(title);
  }
  if (changes.targetDate !== undefined) {
    if (!ISO_DATE.test(changes.targetDate)) {
      throw new RangeError('target date must be YYYY-MM-DD');
    }
    sets.push('target_date = ?');
    params.push(changes.targetDate);
  }

  if (sets.length === 0) {
    // Nothing to change. Returning the existing row keeps the route from
    // reporting a successful update it did not perform.
    return getGoal(accountId, goalId);
  }

  const updated = await query<GoalRow>(
    `UPDATE goals SET ${sets.join(', ')} WHERE account_id = ? AND id = ? RETURNING *`,
    [...params, accountId, goalId],
  );
  return updated[0] ?? null;
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
