import { query, execute } from '../client';
import { newAccountId } from '../../ids';
import { nowIso } from './base';

/**
 * Account records.
 *
 * `getById` and friends take an accountId purely as a lookup key and are used
 * by the auth layer, which has already resolved identity from a session. No
 * method here decides authorisation; the capability guard does, once, before
 * calling in.
 */

export interface AccountRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
  status: 'ACTIVE' | 'DELETED';
}

/** Public projection. The password hash must never leave the auth layer. */
export interface AccountPublic {
  id: string;
  email: string;
  createdAt: string;
  locale: 'en' | 'bn';
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_BYTES = 200;

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Rejects an unusable email before it reaches storage.
 *
 * The pattern is deliberately permissive — the goal is to catch typos, not to
 * adjudicate RFC 5322. The only real test of an address is delivering to it.
 */
export function assertValidEmail(raw: string): string {
  const email = normaliseEmail(raw);
  if (!email) throw new RangeError('email is required');
  if (email.length > MAX_EMAIL_LENGTH) throw new RangeError('email is too long');
  if (!EMAIL_PATTERN.test(email)) throw new RangeError('email is not a valid address');
  return email;
}

/**
 * Validates password strength by length alone.
 *
 * Length is what actually resists guessing; composition rules push people
 * toward predictable substitutions. The byte ceiling bounds `scrypt` cost,
 * which is charged before the password is ever rejected.
 */
export function assertValidPassword(raw: string): string {
  const bytes = Buffer.byteLength(raw, 'utf8');
  if (raw.length < MIN_PASSWORD_LENGTH) {
    throw new RangeError(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (bytes > MAX_PASSWORD_BYTES) {
    throw new RangeError(`password must be at most ${MAX_PASSWORD_BYTES} bytes`);
  }
  return raw;
}

export async function createAccount(email: string, passwordHash: string): Promise<AccountRow> {
  const row: AccountRow = {
    id: newAccountId(),
    email: assertValidEmail(email),
    password_hash: passwordHash,
    created_at: nowIso(),
    updated_at: nowIso(),
    status: 'ACTIVE',
  };

  await execute(
    `INSERT INTO accounts (id, email, password_hash, created_at, updated_at, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [row.id, row.email, row.password_hash, row.created_at, row.updated_at, row.status],
  );

  return row;
}

export async function getAccountById(id: string): Promise<AccountRow | null> {
  const rows = await query<AccountRow>(`SELECT * FROM accounts WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function getAccountByEmail(email: string): Promise<AccountRow | null> {
  const rows = await query<AccountRow>(
    `SELECT * FROM accounts WHERE email = ? AND status = 'ACTIVE'`,
    [normaliseEmail(email)],
  );
  return rows[0] ?? null;
}

/**
 * Marks an account deleted and revokes its sessions.
 *
 * Soft rather than hard so audit events referencing the account stay valid and
 * the erasure remains auditable. A physical purge is a separate, deliberate
 * operation rather than a side effect of an account action.
 */
export async function markAccountDeleted(accountId: string): Promise<void> {
  const at = nowIso();
  await execute(`UPDATE accounts SET status = 'DELETED', updated_at = ? WHERE id = ?`, [
    at,
    accountId,
  ]);
  await execute(
    `UPDATE sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL`,
    [at, accountId],
  );
}

/**
 * Replaces a stored hash, used to upgrade a credential whose cost is below the
 * current default on next sign-in.
 */
export async function updatePasswordHash(
  accountId: string,
  passwordHash: string,
): Promise<void> {
  await execute(`UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?`, [
    passwordHash,
    nowIso(),
    accountId,
  ]);
}

export function toPublic(row: AccountRow, locale: 'en' | 'bn' = 'en'): AccountPublic {
  return { id: row.id, email: row.email, createdAt: row.created_at, locale };
}
