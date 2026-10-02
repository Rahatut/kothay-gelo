import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), 'kothay-ev-')), 'ev.db')}`;

const { migrate } = await import('../migrate');
const { execute, query } = await import('../client');
const { createAccount } = await import('./accounts');
const { seedSampleData } = await import('../seed');
const {
  insertExtractedRows,
  listTransactions,
  toClientTransaction,
  evidenceIdsFor,
} = await import('./transactions');
const { listEvidenceForAccount, evidenceForTransaction, hasEvidence } = await import('./evidence');

/**
 * Evidence is mandatory, and the schema cannot enforce it on its own.
 *
 * Constitution Principle VI makes a material claim trace as
 * `claim -> calculation -> evidence -> view transactions`, and
 * `trg_extracted_row_requires_evidence` exists to enforce it. That trigger fires
 * `AFTER INSERT ON transaction_evidence` and raises when the two sides disagree on
 * the account -- which is a genuine check, but it is not the one people assume.
 *
 * It cannot fire for a row with *no* links at all: nothing is inserted, nothing
 * raises, and the uncited row commits. That is not hypothetical. 13 of the 18
 * golden transactions declared `evidence_ids: []`, so the sample dataset was an
 * uncited ledger that passed every test.
 *
 * So the guarantee has two parts and both are asserted here: the database refuses
 * a mismatched link, and the code refuses to write an uncited extracted row at all.
 */

const dir = path.dirname(process.env.DATABASE_URL!.replace('file:', ''));

describe('evidence is mandatory', () => {
  before(async () => {
    await migrate();
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('the schema rejects a link whose evidence belongs to another account', async () => {
    const alice = await createAccount('ev-alice@example.com', 'h');
    const bob = await createAccount('ev-bob@example.com', 'h');

    await execute(
      `INSERT INTO source_documents (id, account_id, source_kind, original_filename,
         detected_mime, byte_size, content_fingerprint, stage, is_sample_data, created_at)
       VALUES ('doc_a', ?, 'DELIMITED', 'a.csv', 'text/plain', 1, 'f', 'COMPLETED', 0, ?)`,
      [alice.id, new Date().toISOString()],
    );
    await execute(
      `INSERT INTO source_documents (id, account_id, source_kind, original_filename,
         detected_mime, byte_size, content_fingerprint, stage, is_sample_data, created_at)
       VALUES ('doc_b', ?, 'DELIMITED', 'b.csv', 'text/plain', 1, 'f', 'COMPLETED', 0, ?)`,
      [bob.id, new Date().toISOString()],
    );

    await execute(
      `INSERT INTO transaction_candidates (id, account_id, document_id, transaction_date,
         amount, direction, merchant_name, raw_text_snippet, extraction_method, status,
         is_duplicate_candidate, created_at)
       VALUES ('txn_a', ?, 'doc_a', '2026-09-01', 100, 'EXPENSE', 'X', 'row', 'DETERMINISTIC', 'EXTRACTED', 0, ?)`,
      [alice.id, new Date().toISOString()],
    );

    // Evidence that belongs to Bob, attached to Alice's transaction.
    await execute(
      `INSERT INTO evidence (id, account_id, document_id, evidence_type, raw_text, created_at)
       VALUES ('ev_b', ?, 'doc_b', 'MERCHANT', 'row', ?)`,
      [bob.id, new Date().toISOString()],
    );

    await assert.rejects(
      () =>
        execute(
          `INSERT INTO transaction_evidence (transaction_id, evidence_id) VALUES ('txn_a', 'ev_b')`,
        ),
      /evidence/,
      'a cross-account evidence link must be refused by the schema',
    );
  });

  test('the repository refuses to write an extracted row with no evidence', async () => {
    const account = await createAccount('ev-nocite@example.com', 'h');
    await execute(
      `INSERT INTO source_documents (id, account_id, source_kind, original_filename,
         detected_mime, byte_size, content_fingerprint, stage, is_sample_data, created_at)
       VALUES ('doc_nc', ?, 'DELIMITED', 'x.csv', 'text/plain', 1, 'f', 'COMPLETED', 0, ?)`,
      [account.id, new Date().toISOString()],
    );

    await assert.rejects(
      () =>
        insertExtractedRows(
          [
            {
              id: 'txn_uncited',
              accountId: account.id,
              documentId: 'doc_nc',
              date: '2026-09-01',
              amount: 100,
              direction: 'EXPENSE',
              merchantName: 'Foodpanda',
              rawTextSnippet: '01/09/2026 100.00 Foodpanda',
              categoryId: null,
              confidence: 0.9,
              extractionMethod: 'DETERMINISTIC',
              status: 'EXTRACTED',
            },
          ],
          [],
          [],
        ),
      /no evidence/i,
      'an uncited extracted row must not be written',
    );

    const left = await query('SELECT COUNT(*) AS c FROM transaction_candidates WHERE id = ?', [
      'txn_uncited',
    ]);
    assert.equal(left[0].c, 0, 'the row must be rolled back');
  });

  test('every golden transaction carries evidence', async () => {
    const account = await createAccount('ev-golden@example.com', 'h');
    const seeded = await seedSampleData(account.id, account.email);
    assert.ok(seeded > 0, 'the sample dataset seeded nothing');

    const stored = await listTransactions(account.id, { limit: 10_000 });
    assert.ok(stored.length > 0, 'no rows to check');

    const ids = await evidenceIdsFor(account.id, stored.map((r) => r.id));
    const uncited = stored.filter((r) => (ids.get(r.id) ?? []).length === 0);
    assert.deepEqual(
      uncited.map((r) => r.id),
      [],
      `${uncited.length} golden transaction(s) reached the ledger with no evidence`,
    );

    // And the evidence resolves to real records, not just ids.
    for (const row of stored.slice(0, 5)) {
      assert.ok(
        await hasEvidence(account.id, row.id),
        `${row.id} reports no evidence through hasEvidence`,
      );
      const records = await evidenceForTransaction(account.id, row.id);
      assert.ok(records.length > 0, `${row.id} has an evidence id but no evidence record`);
      assert.ok(records[0].raw_text.length > 0, `${row.id} evidence quotes nothing`);
    }
  });

  test('the sample dataset is labelled, so its figures cannot be read as the user own', async () => {
    const account = await createAccount('ev-sample@example.com', 'h');
    await seedSampleData(account.id, account.email);

    const stored = await listTransactions(account.id, { limit: 10_000 });
    assert.ok(stored.length > 0);
    assert.ok(
      stored.every((r) => r.is_sample_data === 1),
      'every sample row must carry the sample flag',
    );

    // And it reaches the client, which is what the dashboard notice depends on.
    const client = toClientTransaction(stored[0], []);
    assert.equal(client.is_sample_data, true);
  });

  test('evidence for one account is invisible to another', async () => {
    const alice = await createAccount('ev-scope-a@example.com', 'h');
    const bob = await createAccount('ev-scope-b@example.com', 'h');
    await seedSampleData(alice.id, alice.email);

    const bobsEvidence = await listEvidenceForAccount(bob.id);
    assert.deepEqual(bobsEvidence, [], 'bob has no evidence of his own to see');

    const aliceRows = await listTransactions(alice.id, { limit: 100 });
    assert.ok(!(await hasEvidence(bob.id, aliceRows[0].id)), 'bob must not see alice citation');
    assert.deepEqual(
      await evidenceForTransaction(bob.id, aliceRows[0].id),
      [],
      "alice's evidence must not resolve for bob",
    );
  });
});
