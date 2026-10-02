import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Upload to ledger, end to end, against a real database.
 *
 * The pipeline and the repositories are exercised directly rather than over HTTP.
 * HTTP framing, cookies, and origin checks are covered in isolation.test.ts; what
 * this file exists to prove is that extraction and the ledger agree, which is a
 * property of the two halves, not of the transport between them.
 *
 * This exists because of a defect that made the product silently return nothing.
 * The pipeline built its rows into the in-memory maps while every read path --
 * the transactions list, the dashboard, each capability -- queried
 * `transaction_candidates`. An upload completed, reported 200, and showed zero
 * transactions. Nothing failed. Nothing logged. The only symptom was an empty
 * ledger that looked like a statement with no spending in it.
 *
 * Unit tests did not catch it because both halves were individually correct.
 * The bug was that they were different stores, which is only observable with
 * both wired up.
 */

const dir = mkdtempSync(path.join(tmpdir(), 'kothay-ledger-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'ledger.db')}`;
process.env.APP_URL = 'http://localhost:3199';
process.env.DISABLE_HMR = 'true';

const { execute, query } = await import('./db/client');
const { migrate } = await import('./db/migrate');
const { ProcessingPipeline } = await import('./pipeline');
const { insertExtractedRows } = await import('./db/repositories/transactions');
const { listTransactions, monthsWithData } = await import('./db/repositories/transactions');

before(async () => {
  await migrate();
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function createAccount(email: string): Promise<string> {
  const { createAccount: create } = await import('./db/repositories/accounts');
  const row = await create(email, 'hash-not-used-here');
  return row.id;
}

const STATEMENT = [
  '01/09/2026 Credit Salary 85,000.00',
  '01/09/2026 250.00 Foodpanda',
  '02/09/2026 1,250.50 Chaldal',
  '03/09/2026 89.00 Uber',
  '04/09/2026 4,500.00 Shwapno',
  '05/09/2026 1,200.00 Daraz',
  '05/09/2026 450.00 Pathao',
  '06/09/2026 320.00 Bikroy',
  '07/09/2026 2,100.00 Apex',
  '08/09/2026 640.00 DESCO',
  '09/09/2026 780.00 Grameenphone',
  '10/09/2026 1,500.00 Airport Express',
  '11/09/2026 3,200.00 Danish Gas',
  '12/09/2026 950.00 Chaldal',
  '13/09/2026 260.00 Foodpanda',
  '14/09/2026 5,600.00 Shwapno',
  '15/09/2026 1,750.00 Daraz',
  '16/09/2026 120.00 Pathao',
  '17/09/2026 480.00 Uber',
  '18/09/2026 2,300.00 Apex',
  '19/09/2026 1,100.00 Chaldal',
  '20/09/2026 340.00 Foodpanda',
  '21/09/2026 900.00 Internet Bill',
  '22/09/2026 1,450.00 Shwapno',
  '23/09/2026 520.00 Bikroy',
  '24/09/2026 6,000.00 Rent',
  '25/09/2026 300.00 Uber',
  '26/09/2026 1,650.00 Daraz',
  '27/09/2026 610.00 DESCO',
  '28/09/2026 275.00 Foodpanda',
  '29/09/2026 4,100.00 Shwapno',
  '30/09/2026 430.00 Pathao',
  '30/09/2026 1,900.00 Chaldal',
  'Total Debit: 52,000.00',
].join('\n');

describe('an upload reaches the ledger', () => {
  test('the document, its rows, and its evidence are all persisted', async () => {
    const accountId = await createAccount('ledger@example.com');
    const documentId = 'doc_ledger_test';

    await execute(
      `INSERT INTO source_documents
         (id, account_id, source_kind, provider, original_filename, detected_mime,
          byte_size, content_fingerprint, period_start, period_end, row_count,
          stage, is_sample_data, created_at)
       VALUES (?, ?, 'DELIMITED', NULL, 'month.csv', 'text/plain', ?, 'fp', NULL, NULL, NULL, 'VALIDATING', 0, ?)`,
      [documentId, accountId, Buffer.byteLength(STATEMENT), new Date().toISOString()],
    );

    const { db } = await import('./db');
    db.documents.set(documentId, {
      id: documentId,
      upload_id: 'upl_ledger_test',
      user_id: accountId,
      filename: 'month.csv',
      document_type: 'TRANSACTION_HISTORY',
      source_type: 'General',
      language: 'mixed',
      page_count: 1,
      status: 'PROCESSING',
      stage: 'VALIDATING',
      file_size: Buffer.byteLength(STATEMENT),
      mime_type: 'text/csv',
      created_at: new Date().toISOString(),
    } as never);

    const job = await ProcessingPipeline.processDocumentAsync(documentId, STATEMENT);
    // processDocumentAsync returns as soon as the job is queued; the stages run
    // afterwards. Polling mirrors what the client does, and a job stuck short of
    // COMPLETED is a failure rather than something to wait longer for.
    const deadline = Date.now() + 10_000;
    while (job.stage !== 'COMPLETED' && job.stage !== 'FAILED' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(job.stage, 'COMPLETED', `job failed: ${job.error_message ?? ''}`);

    // The defect: the job completed and the ledger was empty.
    const stored = await query<{ c: number }>(
      'SELECT COUNT(*) AS c FROM transaction_candidates WHERE account_id = ?',
      [accountId],
    );
    assert.equal(stored[0].c, 33, 'every extracted row must reach the relational ledger');

    const listed = await listTransactions(accountId, { limit: 100, offset: 0 });
    assert.equal(listed.length, 33, 'and be readable back through the repository');

    // Totals, hand-summed from the 32 expense lines above. A count alone would
    // pass even if every amount were wrong, which is the failure this whole file
    // exists to prevent.
    const expenses = listed
      .filter((r) => r.direction === 'EXPENSE')
      .reduce((sum, r) => sum + r.amount, 0);
    const income = listed
      .filter((r) => r.direction === 'INCOME')
      .reduce((sum, r) => sum + r.amount, 0);

    assert.equal(Math.round(expenses * 100) / 100, 47314.5, 'expense total must match the hand sum');
    assert.equal(income, 85000, 'the salary line is the only income');

    // The footer total is not a transaction. Filing it would have added a
    // phantom 52,000 expense to every figure on the page.
    const footers = listed.filter((r) => r.amount === 52000);
    assert.deepEqual(footers, [], 'a statement total must never be filed as a transaction');

    // Evidence is mandatory, not optional.
    const ev = await query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM evidence WHERE account_id = ?`,
      [accountId],
    );
    assert.equal(ev[0].c, 33, 'every row must carry evidence');

    const links = await query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM transaction_evidence te
         JOIN transaction_candidates t ON t.id = te.transaction_id
        WHERE t.account_id = ?`,
      [accountId],
    );
    assert.equal(links[0].c, 33, 'and be linked, which the schema trigger enforces');
  });

  test('the month is discoverable, so the dashboard has a period to infer', async () => {
    const accountId = await createAccount('months@example.com');
    const { insertDocument } = await import('./db/repositories/documents');
    const doc = await insertDocument({
      accountId,
      sourceKind: 'DELIMITED',
      provider: null,
      originalFilename: 'month.csv',
      detectedMime: 'text/plain',
      byteSize: STATEMENT.length,
      contentFingerprint: 'fp2',
      stage: 'COMPLETED',
    });
    assert.ok(doc.id);

    await insertExtractedRows(
      [
        {
          id: 'txn_month_probe',
          accountId,
          documentId: doc.id,
          date: '2026-09-01',
          amount: 100,
          direction: 'EXPENSE',
          merchantName: 'Foodpanda',
          rawTextSnippet: '01/09/2026 100.00 Foodpanda',
          categoryId: null,
          confidence: 0.9,
          extractionMethod: 'DETERMINISTIC',
          status: 'ACCEPTED',
        },
      ],
      [
        {
          id: 'ev_month_probe',
          accountId,
          documentId: doc.id,
          evidenceType: 'MERCHANT',
          rawText: '01/09/2026 100.00 Foodpanda',
          rawTextSnippet: '01/09/2026 100.00 Foodpanda',
          normalizedText: 'Foodpanda',
          confidence: 0.9,
        },
      ],
      [{ transactionId: 'txn_month_probe', evidenceId: 'ev_month_probe' }],
    );

    const months = await monthsWithData(accountId);
    assert.deepEqual(months, ['2026-09']);
  });

  test('a row with no evidence aborts the whole write', async () => {
    // The schema makes evidence mandatory, so a partial write cannot commit. This
    // is what stops an uncited row from reaching a user-facing ledger.
    const accountId = await createAccount('noevidence@example.com');
    const { insertDocument } = await import('./db/repositories/documents');
    const doc = await insertDocument({
      accountId,
      sourceKind: 'DELIMITED',
      provider: null,
      originalFilename: 'x.csv',
      detectedMime: 'text/plain',
      byteSize: 10,
      contentFingerprint: 'fp3',
      stage: 'COMPLETED',
    });

    await assert.rejects(
      () =>
        insertExtractedRows(
          [
            {
              id: 'txn_uncited',
              accountId,
              documentId: doc.id,
              date: '2026-09-01',
              amount: 100,
              direction: 'EXPENSE',
              merchantName: 'Foodpanda',
              rawTextSnippet: 'row',
              categoryId: null,
              confidence: 0.9,
              extractionMethod: 'DETERMINISTIC',
              status: 'ACCEPTED',
            },
          ],
          [],
          [],
        ),
      /evidence/,
      'an uncited row must not commit',
    );

    const left = await query<{ c: number }>(
      'SELECT COUNT(*) AS c FROM transaction_candidates WHERE id = ?',
      ['txn_uncited'],
    );
    assert.equal(left[0].c, 0, 'the row must be rolled back with the evidence');
  });

  test('a manual row with extraction confidence is rejected by the schema', async () => {
    const accountId = await createAccount('manual@example.com');
    const { insertDocument } = await import('./db/repositories/documents');
    const doc = await insertDocument({
      accountId,
      sourceKind: 'DELIMITED',
      provider: null,
      originalFilename: 'x.csv',
      detectedMime: 'text/plain',
      byteSize: 10,
      contentFingerprint: 'fp4',
      stage: 'COMPLETED',
    });

    await assert.rejects(() =>
      execute(
        `INSERT INTO transaction_candidates
           (id, account_id, document_id, transaction_date, amount, direction,
            merchant_name, raw_text_snippet, category_id, confidence,
            extraction_method, status, is_duplicate_candidate, created_at)
         VALUES ('txn_manual_bad', ?, ?, '2026-09-01', 100, 'EXPENSE', 'X', 'row',
                 NULL, 0.9, 'MANUAL', 'USER_ENTERED', 0, ?)`,
        [accountId, doc.id, new Date().toISOString()],
      ),
    );
  });
});
