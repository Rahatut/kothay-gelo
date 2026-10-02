import { query, execute } from '../client';
import { newAuditId } from '../../ids';
import { nowIso } from './base';

/**
 * Audit trail.
 *
 * Records that an action happened, never what it contained. Amounts, merchant
 * names, and statement text are prohibited here and are not accepted by the
 * function signature, so a caller cannot leak them by passing them in.
 *
 * OWNERSHIP_REFUSED is written when the capability guard rejects a cross-account
 * access, which is what makes adversarial probing visible after the fact.
 */

export type AuditAction =
  | 'SIGNED_UP'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'READ'
  | 'MUTATED'
  | 'OWNERSHIP_REFUSED'
  | 'EXPORTED'
  | 'DELETED';

export interface AuditRow {
  id: string;
  account_id: string | null;
  action: AuditAction;
  resource_type: string;
  resource_id: string | null;
  occurred_at: string;
}

export async function recordAudit(input: {
  accountId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
}): Promise<void> {
  await execute(
    `INSERT INTO audit_events (id, account_id, action, resource_type, resource_id, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      newAuditId(),
      input.accountId,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      nowIso(),
    ],
  );
}

export async function listAudit(accountId: string, limit = 100): Promise<AuditRow[]> {
  return query<AuditRow>(
    `SELECT * FROM audit_events WHERE account_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?`,
    [accountId, limit],
  );
}

/** Refusals only. Used by the isolation test to confirm probing was recorded. */
export async function listOwnershipRefusals(accountId: string): Promise<AuditRow[]> {
  return query<AuditRow>(
    `SELECT * FROM audit_events
      WHERE account_id = ? AND action = 'OWNERSHIP_REFUSED'
      ORDER BY occurred_at DESC`,
    [accountId],
  );
}
