import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'kg-erase-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'erase.db')}`;
process.env.APP_URL = 'http://localhost:3000';

const { db } = await import('./db');
const { clearMemory } = await import('./erase');
type Transaction = import('../src/types').Transaction;

const ALICE = 'acct_alice';
const BOB = 'acct_bob';

function tx(id: string, userId: string, documentId: string): Transaction {
  return {
    id,
    user_id: userId,
    document_id: documentId,
    transaction_date: '2026-09-01',
    amount: 100,
    currency: 'BDT',
    direction: 'EXPENSE',
    merchant_name: 'Chaldal',
    raw_text_snippet: '01/09/2026 100.00 Chaldal',
    description: '01/09/2026 100.00 Chaldal',
    category_id: 'cat_food',
    category_source: 'MERCHANT_RULE',
    status: 'ACCEPTED',
    provenance: { source: 'EXTRACTED', extraction_model: 'm', extraction_version: '1', extraction_confidence: 0.9 },
    evidence_ids: [],
    is_duplicate_candidate: false,
    is_sample_data: false,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  } as unknown as Transaction;
}

/**
 * These maps are the second store.
 *
 * `POST /v1/settings/delete-account` purged the relational rows and left every map
 * below untouched, so "your data erased" was answered while the user's statements and
 * quoted transaction text stayed resident in the process. `clearMemory` is the half
 * that was missing, and it is the half a relational purge test can never see.
 */
describe('clearing the in-memory store', () => {
  before(() => {
    db.transactions.set('t_alice', tx('t_alice', ALICE, 'doc_alice'));
    db.transactions.set('t_bob', tx('t_bob', BOB, 'doc_bob'));

    db.documents.set('doc_alice', { id: 'doc_alice', user_id: ALICE, filename: 'a.csv' } as never);
    db.documents.set('doc_bob', { id: 'doc_bob', user_id: BOB, filename: 'b.csv' } as never);

    // Evidence carries no account id: it is reachable only through its document, so a
    // purge that deletes documents first and evidence after would strand these rows.
    db.evidence.set('e_alice', { id: 'e_alice', document_id: 'doc_alice', raw_text: '01/09/2026 100.00 Chaldal' } as never);
    db.evidence.set('e_bob', { id: 'e_bob', document_id: 'doc_bob', raw_text: 'bob row' } as never);

    db.processingJobs.set('j_alice', { id: 'j_alice', user_id: ALICE, document_id: 'doc_alice' } as never);
    db.processingJobs.set('j_bob', { id: 'j_bob', user_id: BOB, document_id: 'doc_bob' } as never);

    db.insights.set('i_alice', { id: 'i_alice', user_id: ALICE } as never);
    db.recommendations.set('r_alice', { id: 'r_alice', user_id: ALICE } as never);
    db.goals.set('g_alice', { id: 'g_alice', user_id: ALICE } as never);
    db.consents.set(ALICE, [{ id: 'c_alice', user_id: ALICE, consent_type: 'PRIVACY_POLICY' } as never]);
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  test('removes every kind of account-owned row', () => {
    clearMemory(ALICE);

    assert.equal(db.transactions.has('t_alice'), false, 'transactions must be gone');
    assert.equal(db.documents.has('doc_alice'), false, 'documents must be gone');
    assert.equal(db.evidence.has('e_alice'), false, 'evidence must be reached through its document before it goes');
    assert.equal(db.processingJobs.has('j_alice'), false, 'processing jobs must be gone');
    assert.equal(db.insights.has('i_alice'), false, 'insights must be gone');
    assert.equal(db.recommendations.has('r_alice'), false, 'recommendations must be gone');
    assert.equal(db.goals.has('g_alice'), false, 'goals must be gone');
    assert.equal(db.consents.has(ALICE), false, 'consents must be gone');
  });

  test('leaves another account entirely alone', () => {
    assert.equal(db.transactions.has('t_bob'), true);
    assert.equal(db.documents.has('doc_bob'), true);
    assert.equal(db.evidence.has('e_bob'), true);
    assert.equal(db.processingJobs.has('j_bob'), true);
  });
});