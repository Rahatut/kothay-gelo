import type {
  Transaction,
  TransactionDirection,
  TransactionStatus,
  TransactionProvenance,
  CategoryAssignmentSource,
} from '../../src/types';
import { UNCATEGORIZED_CATEGORY_ID } from '../categories';
import type { TransactionRow } from '../db/repositories/transactions';
import { asBoolean } from '../db/repositories/base';

/**
 * Repository row to domain object.
 *
 * The financial engine is pure and works on `Transaction[]`, so every row must
 * be lifted into that shape before it can be aggregated. This is the only place
 * that translation happens.
 *
 * The load-bearing detail is the provenance union. `extraction_confidence`
 * exists only on the EXTRACTED arm, so the type system makes it impossible to
 * read a confidence off a hand-entered row and render it as if extraction had
 * been certain of something the user simply asserted.
 */

const DIRECTIONS = new Set<TransactionDirection>([
  'EXPENSE',
  'INCOME',
  'TRANSFER',
  'REFUND',
  'UNKNOWN',
]);

const STATUSES = new Set<TransactionStatus>([
  'EXTRACTED',
  'NORMALIZED',
  'CLASSIFIED',
  'ACCEPTED',
  'CONFIRMED',
  'NEEDS_REVIEW',
  'USER_EDITED',
  'USER_ENTERED',
]);

const CATEGORY_SOURCES = new Set<CategoryAssignmentSource>([
  'MERCHANT_RULE',
  'USER_CORRECTION',
  'UNCATEGORIZED',
]);

/**
 * Which rule produced the category on this row.
 *
 * A row the user corrected is attributed to the user, not to a merchant rule,
 * so a later correction does not look like a system determination.
 */
function categorySourceOf(row: TransactionRow): CategoryAssignmentSource {
  if (row.status === 'USER_EDITED') return 'USER_CORRECTION';
  if (!row.category_id) return 'UNCATEGORIZED';
  return CATEGORY_SOURCES.has('MERCHANT_RULE') ? 'MERCHANT_RULE' : 'UNCATEGORIZED';
}

function directionOf(raw: string): TransactionDirection {
  return DIRECTIONS.has(raw as TransactionDirection) ? (raw as TransactionDirection) : 'UNKNOWN';
}

function statusOf(raw: string): TransactionStatus {
  return STATUSES.has(raw as TransactionStatus) ? (raw as TransactionStatus) : 'EXTRACTED';
}

/**
 * Builds provenance from the extraction method.
 *
 * A manual row asserts a fact and therefore carries an assertion record, not an
 * extraction record. An extracted row must have a real confidence: if the
 * extractor did not establish one, the value is absent and the caller narrows
 * on it rather than reading a fabricated default.
 */
function provenanceOf(row: TransactionRow): TransactionProvenance {
  if (row.extraction_method === 'MANUAL') {
    return {
      source: 'USER_ASSERTED',
      asserted_at: row.created_at,
      assertion_method: 'MANUAL_ENTRY',
    };
  }

  if (row.extraction_method === 'MODEL' && row.confidence !== null) {
    return {
      source: 'EXTRACTED',
      extraction_model: 'gemini',
      extraction_version: 'pipeline-v1',
      extraction_confidence: row.confidence,
    };
  }

  return {
    source: 'ENGINE_DERIVED',
    calculation_version: 'engine-1.1.0',
    derivation: row.extraction_method === 'DETERMINISTIC' ? 'deterministic_parser' : 'unknown',
  };
}

/** Lifts one row. `evidenceIds` comes from a separate lookup, never invented. */
export function toTransaction(row: TransactionRow, evidenceIds: string[] = []): Transaction {
  return {
    id: row.id,
    user_id: row.account_id,
    ...(row.document_id ? { document_id: row.document_id } : {}),
    transaction_date: row.transaction_date,
    amount: row.amount,
    currency: 'BDT',
    direction: directionOf(row.direction),
    merchant_name: row.merchant_name,
    raw_text_snippet: row.raw_text_snippet,
    description: row.raw_text_snippet,
    // An absent category becomes the explicit uncategorised sentinel rather than
    // a null or an invented one, so the breakdown still sums to the total.
    category_id: row.category_id ?? UNCATEGORIZED_CATEGORY_ID,
    category_source: categorySourceOf(row),
    status: statusOf(row.status),
    provenance: provenanceOf(row),
    // A user-asserted row has no document and therefore no evidence. The array
    // stays empty rather than carrying a fabricated link.
    evidence_ids: evidenceIds,
    is_duplicate_candidate: asBoolean(row.is_duplicate_candidate),
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}

/** Lifts a batch, using a pre-fetched evidence map so this stays one query, not N. */
export function toTransactions(
  rows: TransactionRow[],
  evidenceByTransaction: Map<string, string[]> = new Map(),
): Transaction[] {
  return rows.map((row) => toTransaction(row, evidenceByTransaction.get(row.id) ?? []));
}

export { CATEGORY_SOURCES };