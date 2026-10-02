import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'kg-seed-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'test.db')}`;
process.env.APP_URL = 'http://localhost:3000';

const { migrate } = await import('./migrate');
const { query, closeClient } = await import('./client');
const { seedDemoData, SAMPLE_ACCOUNT_ID } = await import('./seed');

before(async () => {
  await migrate();
});

after(() => {
  closeClient();
  rmSync(dir, { recursive: true, force: true });
});

describe('demo seeding', () => {
  test('loads without error', async () => {
    await seedDemoData();
    const rows = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transaction_candidates WHERE account_id = ?`,
      [SAMPLE_ACCOUNT_ID],
    );
    assert.ok((rows[0]?.n ?? 0) > 0, 'expected demo transactions');
  });

  test('is idempotent: a second load adds nothing', async () => {
    const before = await countRows();
    await seedDemoData();
    await seedDemoData();
    assert.equal(await countRows(), before);
  });

  test('marks every demo row as sample data', async () => {
    const rows = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM source_documents WHERE account_id = ? AND is_sample_data = 0`,
      [SAMPLE_ACCOUNT_ID],
    );
    assert.equal(rows[0]?.n, 0, 'every demo document must be flagged as sample data');
  });

  test('never leaves an extracted transaction without evidence', async () => {
    const orphans = await query<{ n: number }>(
      `SELECT COUNT(*) AS n
         FROM transaction_candidates t
        WHERE t.account_id = ?
          AND t.extraction_method <> 'MANUAL'
          AND NOT EXISTS (
            SELECT 1 FROM transaction_evidence te WHERE te.transaction_id = t.id)`,
      [SAMPLE_ACCOUNT_ID],
    );
    // Constitution principle VI: evidence is mandatory. This asserts the seed
    // itself is honest, which is exactly what the previous seed was not.
    assert.equal(
      orphans[0]?.n,
      0,
      `${orphans[0]?.n} demo transactions have no evidence`,
    );
  });

  test('leaves an absent category absent rather than guessing', async () => {
    const guessed = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transaction_candidates WHERE account_id = ? AND category_id = 'cat_other'`,
      [SAMPLE_ACCOUNT_ID],
    );
    assert.equal(guessed[0]?.n, 0, 'demo data must not relabel absence as cat_other');
  });

  test('uses real previous-month rows, not a fabricated aggregate', async () => {
    const rows = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transaction_candidates
        WHERE account_id = ? AND transaction_date LIKE '2026-08%'`,
      [SAMPLE_ACCOUNT_ID],
    );
    assert.ok(
      (rows[0]?.n ?? 0) >= 2,
      'expected multiple real August rows so period comparison has a baseline',
    );
  });

  test('the demo account holds no usable credential', async () => {
    const rows = await query<{ password_hash: string }>(
      `SELECT password_hash FROM accounts WHERE id = ?`,
      [SAMPLE_ACCOUNT_ID],
    );
    assert.equal(rows[0]?.password_hash, '', 'demo account must not carry a password');
  });
});

async function countRows(): Promise<number> {
  const rows = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transaction_candidates WHERE account_id = ?`,
    [SAMPLE_ACCOUNT_ID],
  );
  return rows[0]?.n ?? 0;
}
