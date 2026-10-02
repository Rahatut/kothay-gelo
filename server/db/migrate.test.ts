import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

const dir = mkdtempSync(path.join(tmpdir(), 'kg-migrate-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'test.db')}`;
process.env.APP_URL = 'http://localhost:3000';

const { migrate } = await import('./migrate');
const { query, execute, closeClient, hasAnyAccount } = await import('./client');

before(async () => {
  await migrate();
});

after(() => {
  closeClient();
  rmSync(dir, { recursive: true, force: true });
});

describe('migration runner', () => {
  test('applies every migration on a fresh database', async () => {
    const tables = await query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    );
    const names = tables.map((t) => t.name);
    for (const expected of [
      'accounts',
      'audit_events',
      'categories',
      'evidence',
      'goals',
      'insights',
      'recommendations',
      'sessions',
      'source_documents',
      'transaction_candidates',
    ]) {
      assert.ok(names.includes(expected), `missing table ${expected}`);
    }
  });

  test('is idempotent: a second run applies nothing', async () => {
    const result = await migrate();
    assert.deepEqual(result.applied, [], 'second run must apply no migrations');
  });

  test('records the version so re-runs are skipped', async () => {
    const rows = await query<{ user_version: number }>('PRAGMA user_version');
    // Derived from the migration files rather than hardcoded. A literal count here
    // made every new migration a test failure that had to be bumped by hand, which is
    // a reason to write a test nobody reads carefully.
    const expected = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .length;
    assert.equal(rows[0].user_version, expected);
  });

  test('seeds the category taxonomy with Bengali parity', async () => {
    const rows = await query<{ id: string; name_bn: string | null }>(
      `SELECT id, name_bn FROM categories ORDER BY id`,
    );
    assert.equal(rows.length, 15);
    for (const row of rows) {
      assert.ok(row.name_bn && row.name_bn.length > 0, `${row.id} has no Bengali name`);
    }
    assert.ok(rows.some((r) => r.id === 'cat_uncategorized'));
  });
});

describe('schema invariants', () => {
  test('every financial table requires an account', async () => {
    for (const table of [
      'source_documents',
      'transaction_candidates',
      'insights',
      'recommendations',
      'goals',
    ]) {
      await assert.rejects(
        () => execute(`INSERT INTO ${table} (id) VALUES ('x')`),
        `${table} accepted a row with no account`,
      );
    }
  });

  test('evidence cannot exist without a transaction', async () => {
    await assert.rejects(() =>
      execute(
        `INSERT INTO evidence (id, account_id, transaction_id, document_id, evidence_type, raw_text_snippet, created_at)
         VALUES ('evd_x','acct_x','txn_missing','doc_x','RAW_TEXT','text','2026-01-01')`,
      ),
    );
  });

  test('rejects a non-positive amount', async () => {
    await assert.rejects(() =>
      execute(
        `INSERT INTO accounts (id,email,password_hash,created_at,updated_at,status)
         VALUES ('acct_1','a@b.c','x','2026-01-01','2026-01-01','ACTIVE')`,
      ).then(() =>
        execute(
          `INSERT INTO transaction_candidates
             (id,account_id,transaction_date,amount,direction,extraction_method,created_at)
           VALUES ('txn_1','acct_1','2026-09-01',-5,'EXPENSE','MANUAL','2026-09-01')`,
        ),
      ),
    );
    await execute(`DELETE FROM accounts WHERE id = 'acct_1'`);
  });

  test('rejects a goal with a zero target', async () => {
    await assert.rejects(() =>
      execute(
        `INSERT INTO accounts (id,email,password_hash,created_at,updated_at,status)
         VALUES ('acct_2','c@d.e','x','2026-01-01','2026-01-01','ACTIVE')`,
      ).then(() =>
        execute(
          `INSERT INTO goals (id,account_id,title,target_amount,target_date,created_at)
           VALUES ('goal_1','acct_2','Zero',0,'2026-12-31','2026-01-01')`,
        ),
      ),
    );
    await execute(`DELETE FROM accounts WHERE id = 'acct_2'`);
  });

  test('rejects a manual row carrying a document or confidence', async () => {
    await execute(
      `INSERT INTO accounts (id,email,password_hash,created_at,updated_at,status)
       VALUES ('acct_3','f@g.h','x','2026-01-01','2026-01-01','ACTIVE')`,
    );
    await assert.rejects(() =>
      execute(
        `INSERT INTO transaction_candidates
           (id,account_id,transaction_date,amount,direction,extraction_method,confidence,created_at)
         VALUES ('txn_2','acct_3','2026-09-01',100,'EXPENSE','MANUAL',0.95,'2026-09-01')`,
      ),
    );
    await assert.rejects(() =>
      execute(
        `INSERT INTO transaction_candidates
           (id,account_id,transaction_date,amount,direction,extraction_method,created_at)
         VALUES ('txn_3','acct_3','2026-09-01',100,'EXPENSE','MANUAL','2026-09-01')`,
      ).then(() =>
        execute(
          `INSERT INTO transaction_candidates
             (id,account_id,transaction_date,amount,direction,extraction_method,created_at)
           VALUES ('txn_4','acct_3','2026-09-01',50,'EXPENSE','MODEL',0.8,'2026-09-01')`,
        ),
      ),
    );
    await execute(`DELETE FROM accounts WHERE id = 'acct_3'`);
  });

  test('rejects a recommendation whose max is below its min', async () => {
    await assert.rejects(() =>
      execute(
        `INSERT INTO accounts (id,email,password_hash,created_at,updated_at,status)
         VALUES ('acct_4','i@j.k','x','2026-01-01','2026-01-01','ACTIVE')`,
      ).then(() =>
        execute(
          `INSERT INTO insights
             (id,account_id,type,title,description,confidence,calculation_version,supporting_transaction_ids,period_start,period_end,created_at)
           VALUES ('ins_1','acct_4','MICRO_SPEND','t','d',0.9,'v1','["txn_x"]','2026-09-01','2026-09-30','2026-01-01')`,
        ).then(() =>
          execute(
            `INSERT INTO recommendations
               (id,account_id,insight_id,action_type,title,description,potential_savings_min,potential_savings_max,calculation_method,calculation_version,supporting_transaction_ids,created_at)
             VALUES ('rec_1','acct_4','ins_1','REDUCE_FREQUENCY','t','d',500,100,'m','v1','["txn_x"]','2026-01-01')`,
          ),
        ),
      ),
    );
    await execute(`DELETE FROM accounts WHERE id = 'acct_4'`);
  });

  test('rejects an insight whose supporting ids are not valid JSON', async () => {
    await execute(
      `INSERT INTO accounts (id,email,password_hash,created_at,updated_at,status)
       VALUES ('acct_5','l@m.n','x','2026-01-01','2026-01-01','ACTIVE')`,
    );
    await assert.rejects(() =>
      execute(
        `INSERT INTO insights
           (id,account_id,type,title,description,confidence,calculation_version,supporting_transaction_ids,period_start,period_end,created_at)
         VALUES ('ins_2','acct_5','MICRO_SPEND','t','d',0.9,'v1','not-json','2026-09-01','2026-09-30','2026-01-01')`,
      ),
    );
    await execute(`DELETE FROM accounts WHERE id = 'acct_5'`);
  });

  test('rejects an audit event naming an unknown action', async () => {
    await assert.rejects(() =>
      execute(
        `INSERT INTO audit_events (id,account_id,action,resource_type,occurred_at)
         VALUES ('aud_1','acct_x','MADE_UP','Thing','2026-01-01')`,
      ),
    );
  });
});

describe('account presence', () => {
  test('reports no account on a fresh database', async () => {
    assert.equal(await hasAnyAccount(), false);
  });

  test('reports an account once one is created', async () => {
    await execute(
      `INSERT INTO accounts (id,email,password_hash,created_at,updated_at,status)
       VALUES ('acct_6','p@q.r','x','2026-01-01','2026-01-01','ACTIVE')`,
    );
    assert.equal(await hasAnyAccount(), true);
    await execute(`DELETE FROM accounts WHERE id = 'acct_6'`);
    assert.equal(await hasAnyAccount(), false);
  });
});
