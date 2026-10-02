import { query, transaction, execute } from '../client';

/** The handle a libSQL transaction exposes. Named so the casts are in one place. */
type Tx = { execute: (sql: string, params?: unknown[]) => Promise<unknown> };
import { UNCATEGORIZED_CATEGORY_ID } from '../../categories';
import type {
  CorrectionRecord,
  Transaction,
  TransactionProvenance,
  TransactionStatus,
} from '../../../src/types';
import type { InValue } from '@libsql/client';
import { boundedLimit, validOffset, type ScopedPage } from './base';

/**
 * Ledger rows.
 *
 * Every method takes `accountId` as its first argument and puts it in the WHERE
 * clause before any other predicate. There is no unscoped read: a caller that
 * wants a row must state whose rows it wants.
 *
 * No aggregation happens here. Totals, shares, and comparisons come from
 * financialEngine.ts over the rows these functions return.
 */

export interface TransactionRow {
  id: string;
  account_id: string;
  document_id: string | null;
  transaction_date: string;
  amount: number;
  direction: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'REFUND' | 'UNKNOWN';
  merchant_name: string;
  raw_text_snippet: string;
  category_id: string | null;
  confidence: number | null;
  extraction_method: 'MODEL' | 'DETERMINISTIC' | 'MANUAL';
  status: string;
  is_duplicate_candidate: number;
  created_at: string;
  /**
   * 1 when this row came from the sample dataset rather than an upload.
   *
   * Derived from its document rather than stored on the row, because that is where
   * the fact lives and duplicating it would let the two disagree.
   */
  is_sample_data: number;
}

/** An inclusive `YYYY-MM-DD` range. Resolved server-side so client and server agree. */
export interface Period {
  start: string;
  end: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates a period rather than trusting it.
 *
 * A reversed or malformed range silently dropped would produce a summary of
 * nothing, which reads as "you spent ৳0" rather than as an error.
 */
export function assertPeriod(period: Period): Period {
  if (!ISO_DATE.test(period.start) || !ISO_DATE.test(period.end)) {
    throw new RangeError('period start and end must be YYYY-MM-DD');
  }
  if (period.start > period.end) {
    throw new RangeError('period start must not be after period end');
  }
  const days = (Date.parse(period.end) - Date.parse(period.start)) / 86_400_000;
  if (days > 365 * 5) {
    throw new RangeError('period must not exceed five years');
  }
  return period;
}

/**
 * The period predicate, table-qualified for callers that join.
 *
 * String comparison is correct for zero-padded ISO dates and avoids timezone
 * arithmetic entirely, which is where date bugs come from.
 */
function periodClause(period?: Period, alias = ''): { sql: string; args: string[] } {
  if (!period) return { sql: '', args: [] };
  assertPeriod(period);
  const p = alias ? `${alias}.` : '';
  return {
    sql: `${p}transaction_date >= ? AND ${p}transaction_date <= ?`,
    args: [period.start, period.end],
  };
}

/**
 * Builds the WHERE list and the args, in the same order, for one read.
 *
 * This exists because the two were assembled independently in `listTransactions`:
 * the period predicate was spliced onto the end of the SQL string while its two
 * arguments were pushed into `args` second. Any caller combining a period with a
 * category, direction, or search shifted every later argument by two places, so the
 * query matched nothing -- and because `LIMIT ? OFFSET ?` sat last, the page size
 * was bound to a filter column.
 *
 * `GET /v1/transactions` always supplies a period, so **every filtered ledger
 * request in the product** was affected: a category filter, a direction filter, and
 * a search term each returned an empty list on a non-empty ledger.
 *
 * Assembling both together makes that class of mistake impossible rather than
 * merely absent today.
 */
export interface ReadFilter {
  sql: string[];
  args: (string | number)[];
}

function buildReadFilter(
  accountId: string,
  options: { period?: Period; categoryId?: string; direction?: string; search?: string },
  alias = '',
): ReadFilter {
  const a = alias ? `${alias}.` : '';
  const sql: string[] = [`${a}account_id = ?`];
  const args: (string | number)[] = [accountId];

  const period = periodClause(options.period, alias);
  if (period.sql) {
    sql.push(period.sql);
    args.push(...period.args);
  }

  if (options.categoryId) {
    sql.push(`${a}category_id = ?`);
    args.push(options.categoryId);
  }

  if (options.direction) {
    const direction = parseDirection(options.direction);
    if (!direction) throw new RangeError(`"${options.direction}" is not a valid direction`);
    sql.push(`${a}direction = ?`);
    args.push(direction);
  }

  if (options.search) {
    sql.push(`(${a}merchant_name LIKE ? OR ${a}raw_text_snippet LIKE ?)`);
    const like = likeTerm(options.search);
    args.push(like, like);
  }

  return { sql, args };
}

/**
 * A LIKE term with the user's wildcards escaped.
 *
 * Without this a search for `%` matches every row, and for `_` matches any single
 * character -- so a user typing an underscore silently filtered the whole ledger.
 */
function likeTerm(search: string): string {
  return `%${search.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const DIRECTIONS = new Set<TransactionRow['direction']>([
  'EXPENSE',
  'INCOME',
  'TRANSFER',
  'REFUND',
  'UNKNOWN',
]);

/** Narrows a caller-supplied direction, rejecting anything unrecognised. */
export function parseDirection(value: string): TransactionRow['direction'] | null {
  return DIRECTIONS.has(value as TransactionRow['direction'])
    ? (value as TransactionRow['direction'])
    : null;
}

export async function listTransactions(
  accountId: string,
  options: ScopedPage & {
    period?: Period;
    categoryId?: string;
    direction?: string;
    search?: string;
  } = {},
): Promise<TransactionRow[]> {
  // Every predicate is qualified against the transaction alias, because
  // `document_id` exists on both joined tables and the sample-data join is what
  // makes `is_sample_data` available at all.
  const filter = buildReadFilter(accountId, options, 't');
  const args = [...filter.args, boundedLimit(options.limit), validOffset(options.offset)];

  return query<TransactionRow>(
    `SELECT t.*, COALESCE(d.is_sample_data, 0) AS is_sample_data
       FROM transaction_candidates t
       LEFT JOIN source_documents d ON d.id = t.document_id
      WHERE ${filter.sql.join(' AND ')}
      ORDER BY t.transaction_date ASC, t.id ASC
      LIMIT ? OFFSET ?`,
    args,
  );
}


/** Fetches one row scoped to the account. Null when absent or not owned — never an error. */
/**
 * Counts a caller's rows, subject to the same filters as `listTransactions`.
 *
 * Kept as a scoped count rather than a `COUNT(*)` shortcut so tenant isolation is
 * enforced in one place. Note that it counts what the filters match, which is not
 * necessarily what the caller received: a caller that filters rows after reading
 * them must derive its own total from the rows it kept, or the two numbers
 * describe different sets.
 */
export async function countTransactions(
  accountId: string,
  options: {
    period?: Period;
    categoryId?: string;
    direction?: string;
    search?: string;
  } = {},
): Promise<number> {
  // The same builder `listTransactions` uses, so the two cannot disagree about what
  // a filter means. They previously lowercased the search term differently, which
  // would have made a "showing N of M" figure mismatch its own list.
  const filter = buildReadFilter(accountId, options);
  const rows = await query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM transaction_candidates
      WHERE ${filter.sql.join(' AND ')}`,
    filter.args,
  );
  return rows[0]?.c ?? 0;
}

/**
 * One row, scoped to its owner. Null when absent or owned by someone else.
 *
 * Null rather than an error for both cases, so the caller cannot distinguish a
 * missing record from a foreign one -- otherwise this endpoint enumerates ids
 * across tenants.
 */
export async function getTransaction(
  accountId: string,
  transactionId: string,
): Promise<TransactionRow | null> {
  const rows = await query<TransactionRow>(
    `SELECT t.*, COALESCE(d.is_sample_data, 0) AS is_sample_data
       FROM transaction_candidates t
       LEFT JOIN source_documents d ON d.id = t.document_id
      WHERE t.account_id = ? AND t.id = ?`,
    [accountId, transactionId],
  );
  return rows[0] ?? null;
}

/**
 * Every row in a period, for the engine to aggregate. Unbounded by design.
 *
 * Named `transactionsInPeriod`, not `expensesInPeriod`, because it does not
 * filter by direction. Whether a row counts as an expense is the engine's call
 * (Principle I), and a helper that pre-filtered would put a second, untested
 * definition of "expense" in the data layer.
 */
export async function transactionsInPeriod(
  accountId: string,
  period: Period,
): Promise<TransactionRow[]> {
  assertPeriod(period);
  return query<TransactionRow>(
    `SELECT * FROM transaction_candidates
      WHERE account_id = ? AND transaction_date >= ? AND transaction_date <= ?
      ORDER BY transaction_date ASC, id ASC`,
    [accountId, period.start, period.end],
  );
}

/** Distinct calendar months that actually hold data, newest first. */
export async function monthsWithData(accountId: string): Promise<string[]> {
  const rows = await query<{ month: string }>(
    `SELECT DISTINCT substr(transaction_date, 1, 7) AS month
       FROM transaction_candidates
      WHERE account_id = ?
      ORDER BY month DESC`,
    [accountId],
  );
  return rows.map((r) => r.month);
}

/**
 * Persists extracted rows and their evidence.
 *
 * This is the write half of the ledger, and it did not exist. The pipeline built
 * `Transaction` objects into the in-memory maps while every read path queried
 * `transaction_candidates`, so a completed upload reported zero transactions --
 * a silent total failure that looked like an empty statement.
 *
 * Both halves are written in one transaction. A row without its evidence would
 * break the `claim -> calculation -> evidence` chain that constitution Principle
 * VI makes mandatory, so neither is committed without the other.
 */
export interface ExtractedRowInput {
  id: string;
  accountId: string;
  documentId: string;
  date: string;
  amount: number;
  direction: TransactionRow['direction'];
  merchantName: string;
  rawTextSnippet: string;
  categoryId: string | null;
  /** NULL when the extractor established no confidence. Never defaulted. */
  confidence: number | null;
  extractionMethod: TransactionRow['extraction_method'];
  status: string;
  isDuplicateCandidate?: boolean;
}

export interface EvidenceInput {
  id: string;
  accountId: string;
  documentId: string;
  evidenceType: 'TRANSACTION_DATE' | 'AMOUNT' | 'MERCHANT' | 'REFERENCE' | 'ACCOUNT' | 'BALANCE' | 'OTHER';
  rawText: string;
  rawTextSnippet: string;
  normalizedText: string;
  confidence: number | null;
}

export async function insertExtractedRows(
  rows: ExtractedRowInput[],
  evidence: EvidenceInput[],
  links: { transactionId: string; evidenceId: string }[],
): Promise<number> {
  if (rows.length === 0) return 0;

  // Evidence is mandatory (constitution Principle VI), and it is enforced here
  // rather than by the schema because SQLite has no deferred constraints: the
  // `trg_extracted_row_requires_evidence` trigger fires on INSERT into
  // transaction_evidence, so a write with *no* evidence links never fires it and
  // the uncited row commits cleanly. That check was verified by a test.
  //
  // Refusing before the transaction opens is the only place this can be caught.
  const linked = new Set(links.map((l) => l.transactionId));
  const orphans = rows.filter((r) => !linked.has(r.id)).map((r) => r.id);
  if (orphans.length > 0) {
    throw new Error(
      `refusing to write ${orphans.length} extracted row(s) with no evidence: ` +
        orphans.slice(0, 3).join(', ') + (orphans.length > 3 ? ', ...' : ''),
    );
  }
  // An evidence row nothing points at is equally a dead record.
  const known = new Set(rows.map((r) => r.id));
  const dangling = links.filter((l) => !known.has(l.transactionId));
  if (dangling.length > 0) {
    throw new Error(`evidence link references an unknown row: ${dangling[0].transactionId}`);
  }

  const now = new Date().toISOString();

  await transaction(async (tx: Tx) => {
    for (const row of rows) {
      await tx.execute(
        `INSERT INTO transaction_candidates
           (id, account_id, document_id, transaction_date, amount, direction,
            merchant_name, raw_text_snippet, category_id, confidence,
            extraction_method, status, is_duplicate_candidate, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.accountId,
          row.documentId,
          row.date,
          row.amount,
          row.direction,
          row.merchantName,
          row.rawTextSnippet,
          row.categoryId,
          row.confidence,
          row.extractionMethod,
          row.status,
          row.isDuplicateCandidate ? 1 : 0,
          now,
        ],
      );
    }

    for (const e of evidence) {
      // No coordinates and no field_name: the schema has a column for each, and
      // the column's comment says they are null when the location could not be
      // determined. Writing an invented page or box would put a highlight on the
      // wrong words while looking like a citation.
      await tx.execute(
        `INSERT INTO evidence
           (id, account_id, document_id, evidence_type, raw_text,
            raw_text_snippet, normalized_text, page_number, bbox_x, bbox_y,
            bbox_width, bbox_height, coordinate_space, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?)`,
        [
          e.id,
          e.accountId,
          e.documentId,
          e.evidenceType,
          e.rawText,
          e.rawTextSnippet,
          e.normalizedText,
          now,
        ],
      );
    }

    // The link rows are what the AFTER INSERT trigger on transaction_evidence
    // checks, so an extracted transaction without evidence aborts the whole
    // write rather than committing an uncited row.
    for (const link of links) {
      await tx.execute(
        `INSERT INTO transaction_evidence (transaction_id, evidence_id)
         VALUES (?, ?)`,
        [link.transactionId, link.evidenceId],
      );
    }
  });

  return rows.length;
}

/**
 * Maps a stored row to the `Transaction` the client contract requires.
 *
 * The relational store keeps a narrower record than the interface views are written
 * against: it has `confidence` and `extraction_method` where the contract wants a
 * `provenance` union, and it has no `posted_at`, `currency`, `description`,
 * `category_source`, or `evidence_ids` at all. Sending rows straight through left
 * `provenance` undefined, and two screens died on it --
 *
 *   ReviewView:   Cannot read properties of undefined (reading 'source')
 *   DashboardView: Cannot read properties of null (reading 'replace')
 *
 * -- so uploading a statement appeared to break most of the app.
 *
 * Every field below is either read from the row or absent. Nothing is invented:
 *
 *   - `posted_at` is left undefined because the store keeps no posting timestamp,
 *     and a midnight timestamp derived from the transaction date would be a
 *     fabricated precision that a view could sort on.
 *   - `description` falls back to the stored snippet, which is the text that was
 *     actually read, rather than to a synthesised sentence.
 *   - `provenance` is derived from the extraction method the store recorded. A row
 *     with no confidence becomes ENGINE_DERIVED, because the EXTRACTED arm requires
 *     a number and inventing one is the defect this whole change exists to undo.
 *
 * `category_source` is the one field reconstructed rather than read: the store
 * records which category a row has but not how it was assigned. A row with no
 * category is UNCATEGORIZED, which is a fact. A row with one is reported as
 * MERCHANT_RULE, which is what the extraction normalizer does; persisting the
 * method is a migration, tracked in adr-002-supabase.md.
 */
export function toClientTransaction(
  row: TransactionRow,
  evidenceIds: string[] = [],
): Transaction {
  const uncategorized = row.category_id === null || row.category_id === undefined;

  const provenance: TransactionProvenance =
    row.extraction_method === 'MANUAL'
      ? {
          // The store keeps no assertion timestamp for a hand-entered row. The row's
          // creation time is a real fact about when it was written, so it is used and
          // labelled for what it is.
          source: 'USER_ASSERTED',
          asserted_at: row.created_at,
          assertion_method: 'MANUAL_ENTRY',
        }
      : row.extraction_method === 'MODEL' && row.confidence !== null
        ? {
            source: 'EXTRACTED',
            // The store does not persist which model produced the row. Naming one
            // would be a claim the data cannot support.
            extraction_model: 'unrecorded',
            extraction_version: 'unrecorded',
            extraction_confidence: row.confidence,
          }
        : {
            source: 'ENGINE_DERIVED',
            calculation_version: 'engine-1.1.0',
            derivation: `${row.extraction_method.toLowerCase()} extraction`,
          };

  return {
    id: row.id,
    user_id: row.account_id,
    ...(row.document_id ? { document_id: row.document_id } : {}),
    transaction_date: row.transaction_date,
    amount: row.amount,
    // Every row in this ledger is BDT; the schema has no other currency.
    currency: 'BDT',
    direction: row.direction,
    merchant_name: row.merchant_name,
    raw_text_snippet: row.raw_text_snippet,
    description: row.raw_text_snippet,
    category_id: uncategorized ? UNCATEGORIZED_CATEGORY_ID : (row.category_id as string),
    category_source: uncategorized ? 'UNCATEGORIZED' : 'MERCHANT_RULE',
    status: row.status as TransactionStatus,
    provenance,
    evidence_ids: evidenceIds,
    is_duplicate_candidate: row.is_duplicate_candidate === 1,
    // Carried through so any view holding a row can say it is sample data. A
    // figure the user did not spend must never be presented as their spending.
    is_sample_data: row.is_sample_data === 1,
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}

/**
 * Evidence ids for a set of rows, fetched in one query.
 *
 * Per-row lookups would be one round trip per transaction; the dashboard alone
 * renders hundreds. Grouped here so the caller pays once.
 */
export async function evidenceIdsFor(
  accountId: string,
  transactionIds: string[],
): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>();
  if (transactionIds.length === 0) return grouped;

  const placeholders = transactionIds.map(() => '?').join(', ');
  const rows = await query<{ transaction_id: string; evidence_id: string }>(
    `SELECT te.transaction_id, te.evidence_id
       FROM transaction_evidence te
       JOIN transaction_candidates t ON t.id = te.transaction_id
      WHERE t.account_id = ? AND te.transaction_id IN (${placeholders})`,
    [accountId, ...transactionIds],
  );

  for (const r of rows) {
    const list = grouped.get(r.transaction_id);
    if (list) list.push(r.evidence_id);
    else grouped.set(r.transaction_id, [r.evidence_id]);
  }
  return grouped;
}

/**
 * Writes a hand-entered transaction and its correction history.
 *
 * FR-004 and FR-018: an entered row is a user assertion, so it carries no document,
 * no evidence, and no extraction confidence. The schema enforces the first two
 * (`trg_manual_row_has_no_document_provenance` aborts a manual row that has either),
 * and this function never supplies them.
 *
 * The row and its history are written together, in one transaction, because a row
 * whose correction trail was lost is exactly the record FR-010 exists to protect.
 */
export async function createManualTransaction(
  accountId: string,
  manual: Transaction,
  corrections: CorrectionRecord[],
): Promise<void> {
  await transaction(async (handle: Tx) => {
    await handle.execute(
      `INSERT INTO transaction_candidates
         (id, account_id, document_id, transaction_date, amount, direction,
          merchant_name, raw_text_snippet, category_id, confidence,
          extraction_method, status, is_duplicate_candidate, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, 'MANUAL', ?, ?, ?)`,
      [
        manual.id,
        accountId,
        manual.transaction_date,
        manual.amount,
        manual.direction,
        manual.merchant_name,
        // The user's own words, which is what there is. Not a parsed source line:
        // there is no source.
        manual.description,
        manual.category_id,
        manual.status,
        manual.is_duplicate_candidate ? 1 : 0,
        manual.created_at,
      ],
    );
    await writeCorrections(handle, corrections);
  });
}

/** Inserts correction records. Shared by entry and by later edits. */
async function writeCorrections(handle: Tx, corrections: CorrectionRecord[]): Promise<void> {
  for (const c of corrections) {
    await handle.execute(
      `INSERT INTO transaction_corrections
         (id, transaction_id, account_id, field, previous_value, current_value, kind, corrected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        c.transaction_id,
        c.user_id,
        c.field,
        c.previous_value,
        c.current_value,
        c.kind,
        c.corrected_at,
      ],
    );
  }
}

/** Correction history for a row, oldest first. Scoped to the owner. */
export async function listCorrections(
  accountId: string,
  transactionId: string,
): Promise<CorrectionRecord[]> {
  const rows = await query<{
    id: string;
    transaction_id: string;
    account_id: string;
    field: string;
    previous_value: string;
    current_value: string;
    kind: string;
    corrected_at: string;
  }>(
    `SELECT * FROM transaction_corrections
      WHERE account_id = ? AND transaction_id = ?
      ORDER BY corrected_at ASC, field ASC`,
    [accountId, transactionId],
  );

  return rows.map((r) => ({
    id: r.id,
    transaction_id: r.transaction_id,
    user_id: r.account_id,
    field: r.field as CorrectionRecord['field'],
    previous_value: r.previous_value,
    current_value: r.current_value,
    kind: r.kind as CorrectionRecord['kind'],
    corrected_at: r.corrected_at,
  }));
}

/**
 * Applies an edit to a stored row and records what it replaced.
 *
 * Only the named fields move. An `undefined` value means "not supplied" and leaves
 * the column alone, which is what lets a partial patch touch one field without
 * blanking the rest.
 */
export async function updateTransactionRow(
  accountId: string,
  transactionId: string,
  patch: {
    transaction_date?: string;
    amount?: number;
    direction?: TransactionRow['direction'];
    merchant_name?: string;
    /**
     * The user's description.
     *
     * Mapped onto `raw_text_snippet`, which is the only free-text column the table
     * has. Previously the field was accepted and then dropped: a correction record
     * stated `description: OLD -> NEW` while the row kept the old text, which is
     * exactly the disagreement migration 008 was written to prevent.
     */
    description?: string;
    category_id?: string | null;
    status?: string;
  },
  corrections: CorrectionRecord[],
  now: string,
): Promise<boolean> {
  const columns: Record<string, unknown> = {
    transaction_date: patch.transaction_date,
    amount: patch.amount,
    direction: patch.direction,
    merchant_name: patch.merchant_name,
    // Not a real column: the description is stored in the snippet column, and the
    // snippet is what every read returns as `description`.
    raw_text_snippet: patch.description,
    category_id: patch.category_id === undefined ? undefined : patch.category_id,
    status: patch.status,
  };

  const assignments: string[] = [];
  const args: (string | number | null)[] = [accountId, transactionId];
  for (const [column, value] of Object.entries(columns)) {
    if (value === undefined) continue;
    assignments.push(`${column} = ?`);
    args.push(value as string | number | null);
  }

  // The schema has no `updated_at` on this table, so the edit time is recorded in
  // the correction rows instead. `created_at` is the row's own history and is not
  // rewritten.
  if (assignments.length === 0 && corrections.length === 0) return true;

  return transaction(async (handle: Tx) => {
    if (assignments.length > 0) {
      await handle.execute(
        `UPDATE transaction_candidates SET ${assignments.join(', ')}
          WHERE account_id = ? AND id = ?`,
        [...args.slice(2), accountId, transactionId],
      );
    }
    await writeCorrections(handle, corrections);
    return true;
  });
}

/**
 * Deletes a row and, by cascade, its correction history.
 *
 * The history goes with it deliberately. A deletion record that outlives the row it
 * describes would keep the user's own description text in the database after they
 * asked for it to be gone, which is the opposite of what the purge promises.
 */
export async function deleteTransactionRow(
  accountId: string,
  transactionId: string,
): Promise<boolean> {
  // Existence checked *before* the delete. The previous version counted rows
  // afterwards and returned true when the count was zero -- which is equally true
  // when the row never existed, and equally true when it belonged to another
  // account. It reported success for both, and made the caller's 500 branch
  // unreachable dead code.
  const before = await query<{ c: number }>(
    'SELECT COUNT(*) AS c FROM transaction_candidates WHERE account_id = ? AND id = ?',
    [accountId, transactionId],
  );
  if ((before[0]?.c ?? 0) === 0) return false;

  await execute(`DELETE FROM transaction_candidates WHERE account_id = ? AND id = ?`, [
    accountId,
    transactionId,
  ]);

  const after = await query<{ c: number }>(
    'SELECT COUNT(*) AS c FROM transaction_candidates WHERE account_id = ? AND id = ?',
    [accountId, transactionId],
  );
  return (after[0]?.c ?? 0) === 0;
}

/**
 * Records corrections for a row without changing it.
 *
 * Used by deletion, which must record the removal before the row and its cascade
 * take the history with them. Writes in their own transaction so a caller can record
 * and delete independently.
 */
export async function recordCorrections(corrections: CorrectionRecord[]): Promise<void> {
  if (corrections.length === 0) return;
  await transaction(async (handle: Tx) => {
    await writeCorrections(handle, corrections);
  });
}
