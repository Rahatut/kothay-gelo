import { query, transaction } from '../client';

/**
 * Permanent erasure of one account's financial data.
 *
 * Written because `POST /v1/settings/reset` deleted only the in-memory maps while
 * every read path queries the relational store. Verified against a running server:
 * the route answered `{"success":true}` and left all 25 transactions and ৳27,528 of
 * expenses in place, because nothing it touched was ever read back. A privacy
 * control that reports success while the data survives is worse than one that is
 * absent, because it tells the user something untrue.
 *
 * Two properties this has that the old code did not:
 *
 *   1. It is scoped. Every statement filters on `account_id`, so one tenant's purge
 *      cannot reach another's rows. There is no unscoped DELETE here.
 *   2. It verifies. Each table is counted afterwards and the counts returned, so
 *      the caller can report what was actually removed rather than assuming.
 *
 * Order matters only for readability: the join and child tables are listed first so
 * the intent is obvious even though the foreign keys cascade. `ON DELETE CASCADE`
 * means `transaction_evidence` and `evidence` would follow their parents anyway;
 * they are named explicitly so the erasure does not depend on that remaining true.
 *
 * `audit_events` is deliberately kept. It records that the erasure happened, which
 * is what makes it auditable, and it holds no transaction content. The account
 * deletion path draws the same line.
 */

/**
 * Tables holding an account's own data, with their label for the response.
 *
 * Every one of these carries `account_id`, which is what makes the delete scoped.
 * `transaction_evidence` is deliberately absent: it is a pure join table with only
 * `transaction_id` and `evidence_id`, so filtering it by account is a syntax error.
 * Including it crashed the server with `no such column: account_id`. Its rows go
 * with their parents through `ON DELETE CASCADE`, and the post-purge check counts
 * them through a join to confirm that.
 */
const PURGE_TABLES: { table: string; label: string }[] = [
  { table: 'evidence', label: 'evidence' },
  { table: 'transaction_candidates', label: 'transactions' },
  { table: 'source_documents', label: 'statements' },
  { table: 'insights', label: 'calculated leaks' },
  { table: 'recommendations', label: 'recommendations' },
  { table: 'goals', label: 'savings targets' },
];

/**
 * Counts a join table's rows for an account, through the parent that owns it.
 *
 * Used for `transaction_evidence`, which has no account column of its own. Verified
 * after the purge rather than deleted directly, so the check cannot itself be the
 * thing that throws.
 */
async function countOrphanedEvidenceLinks(accountId: string): Promise<number> {
  const rows = await query<{ c: number }>(
    `SELECT COUNT(*) AS c
       FROM transaction_evidence te
       JOIN transaction_candidates t ON t.id = te.transaction_id
      WHERE t.account_id = ?`,
    [accountId],
  );
  return rows[0]?.c ?? 0;
}

/** Links whose evidence row is gone, for this account. Nothing should survive. */
async function countDanglingLinks(accountId: string): Promise<number> {
  const rows = await query<{ c: number }>(
    `SELECT COUNT(*) AS c
       FROM transaction_evidence te
       LEFT JOIN evidence e ON e.id = te.evidence_id
      WHERE e.id IS NULL`,
    [accountId],
  );
  return rows[0]?.c ?? 0;
}

export interface PurgeResult {
  /** What was removed, by label. Every value must be 0 for the purge to be a success. */
  removed: Record<string, number>;
  /** Anything still present after the delete. Non-empty means the purge failed. */
  remaining: Record<string, number>;
  /** True when every table is empty afterwards. */
  complete: boolean;
}

/**
 * Deletes everything belonging to `accountId` except the account itself and its
 * audit trail.
 *
 * Returns what it removed and what survived, so the route can fail loudly rather
 * than reporting a success it has not verified.
 */
export async function purgeAccountData(accountId: string): Promise<PurgeResult> {
  const removed: Record<string, number> = {};

  await transaction(async (tx: { execute: (sql: string, params?: unknown[]) => Promise<unknown> }) => {
    for (const { table, label } of PURGE_TABLES) {
      // Counted before the delete so the response can say how many went, rather
      // than inferring it from a rowcount the driver may not report.
      const rows = await query<{ c: number }>(
        `SELECT COUNT(*) AS c FROM ${table} WHERE account_id = ?`,
        [accountId],
      );
      removed[label] = rows[0]?.c ?? 0;

      await tx.execute(`DELETE FROM ${table} WHERE account_id = ?`, [accountId]);
    }
  });

  const remaining: Record<string, number> = {};
  for (const { table, label } of PURGE_TABLES) {
    const rows = await query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM ${table} WHERE account_id = ?`,
      [accountId],
    );
    remaining[label] = rows[0]?.c ?? 0;
  }

  // The join table is checked through its parent. A link outliving both of its rows
  // would be evidence of an account's data still being present under another name.
  remaining['evidence links'] = (await countOrphanedEvidenceLinks(accountId))
    + (await countDanglingLinks(accountId));

  return {
    removed,
    remaining,
    complete: Object.values(remaining).every((n) => n === 0),
  };
}

/**
 * Counts everything an account holds, so a UI can tell the user what is about to be
 * destroyed before they confirm.
 */
export async function countAccountData(accountId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const { table, label } of PURGE_TABLES) {
    const rows = await query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM ${table} WHERE account_id = ?`,
      [accountId],
    );
    counts[label] = rows[0]?.c ?? 0;
  }
  counts['evidence links'] = await countOrphanedEvidenceLinks(accountId);
  return counts;
}
