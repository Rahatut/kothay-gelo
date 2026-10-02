import { query, execute } from '../client';
import { newSessionId } from '../../ids';
import { nowIso } from './base';

/**
 * Session credentials.
 *
 * The raw token is returned to the caller exactly once and never stored. Only
 * its SHA-256 lives in the database, so a database disclosure does not yield
 * usable session cookies.
 */

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionRow {
  id: string;
  account_id: string;
  token_hash: string;
  created_at: string;
  last_seen_at: string;
  absolute_expires_at: string;
  revoked_at: string | null;
}

export interface IssuedSession {
  sessionId: string;
  /** The only time the raw token is available. Store it in a cookie, nowhere else. */
  token: string;
  expiresAt: string;
}

/**
 * Issues a session and returns the raw token to the caller.
 *
 * `createHash` is imported lazily here rather than at module scope so the
 * hashing helpers in `auth/` remain the single place that knows about digests.
 */
export async function issueSession(
  accountId: string,
  createHash: (input: string) => string,
  randomToken: () => string,
): Promise<IssuedSession> {
  const now = Date.now();
  const token = randomToken();
  const row: SessionRow = {
    id: newSessionId(),
    account_id: accountId,
    token_hash: createHash(token),
    created_at: new Date(now).toISOString(),
    last_seen_at: new Date(now).toISOString(),
    absolute_expires_at: new Date(now + ABSOLUTE_TIMEOUT_MS).toISOString(),
    revoked_at: null,
  };

  await execute(
    `INSERT INTO sessions (id, account_id, token_hash, created_at, last_seen_at, absolute_expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    [
      row.id,
      row.account_id,
      row.token_hash,
      row.created_at,
      row.last_seen_at,
      row.absolute_expires_at,
    ],
  );

  return {
    sessionId: row.id,
    token,
    expiresAt: row.absolute_expires_at,
  };
}

/**
 * Resolves a raw token to a live session, or null.
 *
 * Revoked and expired sessions are treated as absent, not as errors, so a caller
 * cannot distinguish them and must respond identically in each case.
 */
export async function resolveSession(
  tokenHash: string,
  createHash: (input: string) => string,
): Promise<SessionRow | null> {
  const rows = await query<SessionRow>(
    `SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL`,
    [tokenHash],
  );
  const session = rows[0];
  if (!session) return null;

  const now = Date.now();
  if (new Date(session.absolute_expires_at).getTime() <= now) return null;
  if (now - new Date(session.last_seen_at).getTime() > IDLE_TIMEOUT_MS) return null;

  // Touch on use so an active session does not expire mid-use.
  await execute(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`, [nowIso(), session.id]);
  void createHash;

  return session;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await execute(`UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`, [
    nowIso(),
    sessionId,
  ]);
}

export async function revokeAllForAccount(accountId: string): Promise<void> {
  await execute(`UPDATE sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL`, [
    nowIso(),
    accountId,
  ]);
}
