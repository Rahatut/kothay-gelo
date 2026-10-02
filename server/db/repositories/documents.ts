import { query, execute } from '../client';
import { newDocumentId } from '../../ids';
import { nowIso } from './base';

export interface DocumentRow {
  id: string;
  account_id: string;
  source_kind: 'MOBILE_WALLET' | 'BANK_STATEMENT' | 'DELIMITED';
  provider: string | null;
  original_filename: string;
  detected_mime: string;
  byte_size: number;
  content_fingerprint: string;
  period_start: string | null;
  period_end: string | null;
  row_count: number | null;
  stage: string;
  is_sample_data: number;
  created_at: string;
}

/** Documents newest first. `row_count` stays null when extraction failed. */
export async function listDocuments(accountId: string, limit = 50): Promise<DocumentRow[]> {
  return query<DocumentRow>(
    `SELECT * FROM source_documents WHERE account_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [accountId, limit],
  );
}

export async function getDocument(accountId: string, documentId: string): Promise<DocumentRow | null> {
  const rows = await query<DocumentRow>(
    `SELECT * FROM source_documents WHERE account_id = ? AND id = ?`,
    [accountId, documentId],
  );
  return rows[0] ?? null;
}

export async function insertDocument(input: {
  accountId: string;
  sourceKind: DocumentRow['source_kind'];
  provider: string | null;
  originalFilename: string;
  detectedMime: string;
  byteSize: number;
  contentFingerprint: string;
  stage: string;
  isSampleData?: boolean;
}): Promise<DocumentRow> {
  const row: DocumentRow = {
    id: newDocumentId(),
    account_id: input.accountId,
    source_kind: input.sourceKind,
    provider: input.provider,
    original_filename: input.originalFilename,
    detected_mime: input.detectedMime,
    byte_size: input.byteSize,
    content_fingerprint: input.contentFingerprint,
    period_start: null,
    period_end: null,
    row_count: null,
    stage: input.stage,
    is_sample_data: input.isSampleData ? 1 : 0,
    created_at: nowIso(),
  };

  await execute(
    `INSERT INTO source_documents
       (id, account_id, source_kind, provider, original_filename, detected_mime,
        byte_size, content_fingerprint, period_start, period_end, row_count,
        stage, is_sample_data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
    [
      row.id,
      row.account_id,
      row.source_kind,
      row.provider,
      row.original_filename,
      row.detected_mime,
      row.byte_size,
      row.content_fingerprint,
      row.stage,
      row.is_sample_data,
      row.created_at,
    ],
  );

  return row;
}

/** Records the outcome of processing. Row count is written only when known. */
export async function completeDocument(
  accountId: string,
  documentId: string,
  outcome: { stage: string; rowCount?: number; periodStart?: string; periodEnd?: string },
): Promise<void> {
  await execute(
    `UPDATE source_documents
        SET stage = ?,
            row_count = COALESCE(?, row_count),
            period_start = COALESCE(?, period_start),
            period_end = COALESCE(?, period_end)
      WHERE account_id = ? AND id = ?`,
    [
      outcome.stage,
      outcome.rowCount ?? null,
      outcome.periodStart ?? null,
      outcome.periodEnd ?? null,
      accountId,
      documentId,
    ],
  );
}
