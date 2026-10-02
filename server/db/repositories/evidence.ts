import { query } from '../client';

/**
 * Provenance lookup.
 *
 * Evidence is field-level and belongs to a document, so it is reached through
 * the join table. Every query is scoped by account_id: a link table is the one
 * place where an unscoped join would let one account's evidence be read through
 * another account's transaction id.
 */

export interface EvidenceRow {
  id: string;
  account_id: string;
  document_id: string;
  evidence_type: string | null;
  raw_text: string;
  raw_text_snippet: string | null;
  normalized_text: string | null;
  page_number: number | null;
  bbox_x: number | null;
  bbox_y: number | null;
  bbox_width: number | null;
  bbox_height: number | null;
  coordinate_space: string | null;
  created_at: string;
}

/** Evidence cited by one transaction. Empty array when there is none. */
export async function evidenceForTransaction(
  accountId: string,
  transactionId: string,
): Promise<EvidenceRow[]> {
  return query<EvidenceRow>(
    `SELECT e.* FROM evidence e
       JOIN transaction_evidence te ON te.evidence_id = e.id
      WHERE te.transaction_id = ? AND e.account_id = ?
      ORDER BY e.id ASC`,
    [transactionId, accountId],
  );
}

/** Evidence cited by many transactions, preserving input order. */
export async function evidenceForTransactions(
  accountId: string,
  transactionIds: string[],
): Promise<Map<string, EvidenceRow[]>> {
  const grouped = new Map<string, EvidenceRow[]>();
  if (transactionIds.length === 0) return grouped;

  // SQLite caps host parameters; chunk so a large insight cannot fail the query.
  const CHUNK = 500;
  for (let i = 0; i < transactionIds.length; i += CHUNK) {
    const chunk = transactionIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = await query<EvidenceRow & { transaction_id: string }>(
      `SELECT te.transaction_id, e.* FROM evidence e
         JOIN transaction_evidence te ON te.evidence_id = e.id
        WHERE e.account_id = ? AND te.transaction_id IN (${placeholders})`,
      [accountId, ...chunk],
    );
    for (const row of rows) {
      const { transaction_id, ...evidence } = row;
      const list = grouped.get(transaction_id) ?? [];
      list.push(evidence as EvidenceRow);
      grouped.set(transaction_id, list);
    }
  }

  return grouped;
}

/**
 * One evidence record, scoped to its owner.
 *
 * Scoped on the evidence table's own `account_id`, so a guessed id cannot read
 * another tenant's quoted statement line. The route that calls this previously read
 * the in-memory map, which is never repopulated on boot, so every evidence link in a
 * transaction still 404'd after a restart.
 */
export async function getEvidence(accountId: string, evidenceId: string): Promise<EvidenceRow | null> {
  const rows = await query<EvidenceRow>(
    `SELECT * FROM evidence WHERE account_id = ? AND id = ?`,
    [accountId, evidenceId],
  );
  return rows[0] ?? null;
}

/** True when the transaction cites at least one evidence record. */
export async function hasEvidence(accountId: string, transactionId: string): Promise<boolean> {
  const rows = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transaction_evidence te
       JOIN transaction_candidates t ON t.id = te.transaction_id
      WHERE te.transaction_id = ? AND t.account_id = ?`,
    [transactionId, accountId],
  );
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * Every evidence record belonging to an account.
 *
 * Scoped by `account_id` on the evidence table itself, so it cannot reach another
 * tenant's rows. Used by the data export, which must return the caller's evidence
 * and nothing else.
 */
export async function listEvidenceForAccount(accountId: string): Promise<EvidenceRow[]> {
  return query<EvidenceRow>(
    `SELECT * FROM evidence
      WHERE account_id = ?
      ORDER BY created_at ASC, id ASC`,
    [accountId],
  );
}
