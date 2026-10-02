import { query, execute } from '../client';
import { newConsentId } from '../../ids';
import { nowIso } from './base';
import type { ConsentRecord } from '../../../src/types';

export interface ConsentRow {
  id: string;
  account_id: string;
  consent_type: ConsentRecord['consent_type'];
  policy_version: string;
  accepted_at: string;
  revoked_at: string | null;
  ip_hash: string | null;
}

/**
 * The consent types the product recognises.
 *
 * Held as a value rather than only as the table's CHECK so the route can refuse an
 * unknown type with a 422 and a readable message. The CHECK is the backstop; this is
 * what stops the request reaching it in the first place.
 */
export const CONSENT_TYPES = [
  'PRIVACY_POLICY',
  'FINANCIAL_DATA_PROCESSING',
  'DOCUMENT_PROCESSING',
  'OPTIONAL_ANALYTICS',
  'OPTIONAL_AI_PROCESSING',
] as const;

export function isConsentType(value: unknown): value is ConsentRecord['consent_type'] {
  return typeof value === 'string' && (CONSENT_TYPES as readonly string[]).includes(value);
}

export async function listConsents(accountId: string): Promise<ConsentRow[]> {
  return query<ConsentRow>(
    `SELECT * FROM consents WHERE account_id = ? ORDER BY consent_type ASC`,
    [accountId],
  );
}

export async function getConsent(
  accountId: string,
  consentType: ConsentRecord['consent_type'],
): Promise<ConsentRow | null> {
  const rows = await query<ConsentRow>(
    `SELECT * FROM consents WHERE account_id = ? AND consent_type = ?`,
    [accountId, consentType],
  );
  return rows[0] ?? null;
}

/**
 * Records acceptance, or clears a previous revocation.
 *
 * An update rather than an insert, because the table holds one current row per type
 * and accepting after revoking must revive that row rather than leave a second one
 * behind. `accepted_at` moves forward because it dates the current acceptance, and
 * an audit event carries the history.
 */
export async function acceptConsent(input: {
  accountId: string;
  consentType: ConsentRecord['consent_type'];
  policyVersion: string;
  ipHash?: string;
}): Promise<ConsentRow> {
  const acceptedAt = nowIso();
  await execute(
    `INSERT INTO consents
       (id, account_id, consent_type, policy_version, accepted_at, revoked_at, ip_hash)
     VALUES (?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT (account_id, consent_type) DO UPDATE SET
       accepted_at = excluded.accepted_at,
       revoked_at = NULL,
       policy_version = excluded.policy_version,
       ip_hash = excluded.ip_hash`,
    [
      newConsentId(),
      input.accountId,
      input.consentType,
      input.policyVersion,
      acceptedAt,
      input.ipHash ?? null,
    ],
  );

  const row = await getConsent(input.accountId, input.consentType);
  if (!row) throw new Error(`consent ${input.consentType} was not written`);
  return row;
}

/**
 * Records revocation.
 *
 * Returns false when there was nothing to revoke, so the route can avoid writing an
 * audit event for a no-op. Revoking consent that was never granted is not a state
 * change, and an audit trail full of entries that changed nothing is not a trail.
 */
export async function revokeConsent(
  accountId: string,
  consentType: ConsentRecord['consent_type'],
): Promise<boolean> {
  const existing = await getConsent(accountId, consentType);
  if (!existing || existing.revoked_at !== null) return false;

  await execute(
    `UPDATE consents SET revoked_at = ? WHERE account_id = ? AND consent_type = ?`,
    [nowIso(), accountId, consentType],
  );
  return true;
}

export function toClientConsent(row: ConsentRow): ConsentRecord {
  return {
    id: row.id,
    user_id: row.account_id,
    consent_type: row.consent_type,
    policy_version: row.policy_version,
    accepted_at: row.accepted_at,
    ...(row.revoked_at ? { revoked_at: row.revoked_at } : {}),
    ...(row.ip_hash ? { ip_hash: row.ip_hash } : {}),
  };
}