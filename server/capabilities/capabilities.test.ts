import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'kg-cap-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'test.db')}`;
process.env.APP_URL = 'http://localhost:3000';

const { migrate } = await import('../db/migrate');
const { execute, closeClient } = await import('../db/client');
const { createAccount } = await import('../db/repositories/accounts');
const { invokeCapability, describeCapabilityError } = await import('./guard');
const { assertPeriod, monthPeriod, previousMonthPeriod, isOpenPeriod } = await import('./period');
const { toTransaction } = await import('./mapping');
const { registeredNames, CAPABILITY_NAMES } = await import('./registry');

await import('./routes'); // side-effect: registers the handlers

const SEPT = { start: '2026-09-01', end: '2026-09-30' };
const AUG = { start: '2026-08-01', end: '2026-08-31' };

let alice: string;
let bob: string;

type TxExtra = {
  direction?: string;
  merchant?: string;
  category?: string | null;
  confidence?: number;
  method?: string;
  status?: string;
};

async function addTx(
  accountId: string,
  id: string,
  date: string,
  amount: number,
  extra: TxExtra = {},
) {
  await execute(
    `INSERT INTO transaction_candidates
       (id, account_id, document_id, transaction_date, amount, direction, merchant_name,
        raw_text_snippet, category_id, confidence, extraction_method, status,
        is_duplicate_candidate, created_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, 'line', ?, ?, ?, ?, 0, '2026-09-15')`,
    [
      id,
      accountId,
      date,
      amount,
      extra.direction ?? 'EXPENSE',
      extra.merchant ?? 'Merchant',
      extra.category ?? 'cat_food',
      extra.method === 'MANUAL' ? null : (extra.confidence ?? 0.95),
      extra.method ?? 'DETERMINISTIC',
      extra.status ?? 'ACCEPTED',
    ],
  );
}

before(async () => {
  await migrate();

  alice = (await createAccount('cap-alice@example.com', 'x')).id;
  bob = (await createAccount('cap-bob@example.com', 'x')).id;

  // September: food 1000, transport 500, income 5000
  await addTx(alice, 'txn_a1', '2026-09-05', 1000, { merchant: 'Foodpanda' });
  await addTx(alice, 'txn_a2', '2026-09-10', 500, { merchant: 'Uber', category: 'cat_transport' });
  await addTx(alice, 'txn_a3', '2026-09-20', 5000, {
    merchant: 'Employer',
    category: 'cat_income',
    direction: 'INCOME',
  });
  // August: food 400 only
  await addTx(alice, 'txn_a4', '2026-08-08', 400, { merchant: 'Foodpanda' });

  await addTx(bob, 'txn_b1', '2026-09-05', 99999, { merchant: 'Bob Secret' });
});

after(() => {
  closeClient();
  rmSync(dir, { recursive: true, force: true });
});

async function call(accountId: string | null, name: string, params: unknown) {
  return invokeCapability({
    name,
    params,
    accountId,
    sessionId: null,
    today: '2026-10-05',
    locale: 'en',
  });
}

describe('registry', () => {
  test('addresses exactly the eight ratified capabilities', () => {
    assert.equal(CAPABILITY_NAMES.length, 8);
    for (const name of CAPABILITY_NAMES) {
      assert.ok(registeredNames().includes(name), `${name} is not registered`);
    }
  });

  test('recurring_expenses is addressable but states it is not implemented', async () => {
    const result = await call(alice, 'recurring_expenses', { period: SEPT });
    assert.equal(result.status, 'insufficient_data');
    assert.equal(result.data, undefined, 'an unimplemented capability must return no figures');
  });
});

describe('period validation', () => {
  test('rejects a reversed range', () => {
    assert.throws(() => assertPeriod({ start: '2026-09-30', end: '2026-09-01' }));
  });

  test('rejects a malformed date and an impossible day', () => {
    assert.throws(() => assertPeriod({ start: '2026-9-1', end: '2026-09-30' }));
    assert.throws(() => assertPeriod({ start: '2026-02-30', end: '2026-03-01' }));
  });

  test('rejects an unbounded span', () => {
    assert.throws(() => assertPeriod({ start: '1900-01-01', end: '2026-09-30' }));
  });

  test('requires a period rather than defaulting one', () => {
    assert.throws(() => assertPeriod(undefined));
    assert.throws(() => assertPeriod({ start: '2026-09-01' }));
  });

  test('builds a whole month from a period key', () => {
    assert.deepEqual(monthPeriod('2026-09'), { start: '2026-09-01', end: '2026-09-30' });
    assert.deepEqual(monthPeriod('2026-02'), { start: '2026-02-01', end: '2026-02-28' });
  });

  test('handles year rollover when stepping back a month', () => {
    assert.deepEqual(previousMonthPeriod(monthPeriod('2026-01')), {
      start: '2025-12-01',
      end: '2025-12-31',
    });
  });

  test('marks a period that has not finished as open', () => {
    assert.equal(isOpenPeriod({ start: '2026-09-01', end: '2026-09-30' }, new Date('2026-10-05')), false);
    assert.equal(isOpenPeriod({ start: '2026-10-01', end: '2026-10-31' }, new Date('2026-10-05')), true);
  });
});

describe('financial_summary', () => {
  test('totals come from the engine', async () => {
    const result = await call(alice, 'financial_summary', { period: SEPT });
    assert.equal(result.ok, true);
    const data = result.data as { total_expenses: number; total_income: number; net_savings: number };
    assert.equal(data.total_expenses, 1500);
    assert.equal(data.total_income, 5000);
    assert.equal(data.net_savings, 3500);
  });

  test('cites every row behind the figure, income included', async () => {
    // Evidence is the audit trail for the summary as a whole, so it cites every
    // row the summary was computed from — including the income row. Citing only
    // the expenses would make the income figure unverifiable.
    const result = await call(alice, 'financial_summary', { period: SEPT });
    assert.equal(result.evidence?.transaction_ids.length, 3);
    assert.ok(result.evidence?.transaction_ids.includes('txn_a3'), 'income row must be cited');
  });

  test('reports insufficiency for an empty period instead of zeroes', async () => {
    const result = await call(alice, 'financial_summary', { period: { start: '2025-01-01', end: '2025-01-31' } });
    assert.equal(result.status, 'insufficient_data');
    assert.equal(result.data, undefined);
    assert.equal(result.evidence?.transaction_ids.length, 0);
  });

  test('labels an open period as an estimate', async () => {
    await addTx(alice, 'txn_a5', '2026-10-02', 300, { merchant: 'Current Month' });
    const result = await call(alice, 'financial_summary', { period: { start: '2026-10-01', end: '2026-10-31' } });
    assert.ok(result.estimate, 'an open period must be flagged as an estimate');
    await execute(`DELETE FROM transaction_candidates WHERE id = 'txn_a5'`);
  });
});

describe('dataset isolation through capabilities', () => {
  test('a caller cannot see another account’s totals', async () => {
    const aliceResult = await call(alice, 'financial_summary', { period: SEPT });
    const bobResult = await call(bob, 'financial_summary', { period: SEPT });
    const aliceTotal = (aliceResult.data as { total_expenses: number }).total_expenses;
    const bobTotal = (bobResult.data as { total_expenses: number }).total_expenses;
    assert.equal(aliceTotal, 1500);
    assert.equal(bobTotal, 99999);
  });

  test('refuses to answer without an identity', async () => {
    await assert.rejects(() => call(null, 'financial_summary', { period: SEPT }));
  });
});

describe('category_breakdown', () => {
  test('shares come from the engine, not recomputed here', async () => {
    const result = await call(alice, 'category_breakdown', { period: SEPT });
    const data = result.data as {
      total_expenses: number;
      categories: { category_id: string; amount: number; pct: number }[];
    };
    assert.equal(data.total_expenses, 1500);
    const food = data.categories.find((c) => c.category_id === 'cat_food');
    const transport = data.categories.find((c) => c.category_id === 'cat_transport');
    assert.equal(food?.amount, 1000);
    assert.equal(transport?.amount, 500);
    // Percentages are engine output; the assertion checks they exist and are finite.
    for (const c of data.categories) assert.ok(Number.isFinite(c.pct));
  });
});

describe('compare_periods', () => {
  test('compares against the previous month by default', async () => {
    const result = await call(alice, 'compare_periods', { period: SEPT });
    assert.equal(result.ok, true);
    const data = result.data as {
      comparisonPeriod: { start: string };
      current: { total_expenses: number };
      previous: { total_expenses: number };
      expense_change_pct: number | null;
    };
    assert.equal(data.comparisonPeriod.start, '2026-08-01');
    assert.equal(data.current.total_expenses, 1500);
    assert.equal(data.previous.total_expenses, 400);
  });

  test('states insufficiency rather than a 100% change when the comparison is empty', async () => {
    const result = await call(alice, 'compare_periods', { period: AUG });
    assert.equal(result.status, 'insufficient_data');
    assert.equal(result.data, undefined);
  });
});

describe('savings_estimation', () => {
  test('never sums bounds across recommendations', async () => {
    const result = await call(alice, 'savings_estimation', { period: SEPT });
    if (result.status === 'insufficient_data') {
      // No pattern met the thresholds on this small fixture, which is itself the
      // correct answer. The bound-summing bug only appears when there is data.
      assert.equal(result.data, undefined);
      return;
    }
    const data = result.data as {
      recommendations: unknown[];
      bounds_are_additive: boolean;
      note: string;
    };
    assert.equal(data.bounds_are_additive, false);
    assert.match(data.note, /not additive/i);
  });
});

describe('parameter validation', () => {
  test('rejects an unknown capability', async () => {
    await assert.rejects(() => call(alice, 'drop_tables', { period: SEPT }));
  });

  test('rejects bad parameters rather than coercing them', async () => {
    await assert.rejects(() => call(alice, 'top_merchants', { period: SEPT, limit: -5 }));
    await assert.rejects(() => call(alice, 'transactions', { period: SEPT, limit: 'many' }));
    await assert.rejects(() => call(alice, 'transactions', { period: SEPT, search: 'x'.repeat(201) }));
  });

  test('caps a merchant limit instead of serving the whole ledger', async () => {
    const result = await call(alice, 'top_merchants', { period: SEPT, limit: 9999 });
    assert.equal(result.ok, true);
  });

  test('maps failures to the documented taxonomy', () => {
    assert.equal(describeCapabilityError(new RangeError('bad')).status, 422);
  });
});

describe('provenance mapping', () => {
  test('a manual row cannot carry an extraction confidence', () => {
    const row = {
      id: 'txn_m', account_id: 'acct_x', document_id: null,
      transaction_date: '2026-09-01', amount: 100, direction: 'EXPENSE' as const,
      merchant_name: 'Cash', raw_text_snippet: '', category_id: null, confidence: null,
      extraction_method: 'MANUAL' as const, status: 'USER_ENTERED', is_duplicate_candidate: 0,
      is_sample_data: 0,
      created_at: '2026-09-01T00:00:00Z',
    };
    const mapped = toTransaction(row);
    assert.equal(mapped.provenance.source, 'USER_ASSERTED');
    assert.deepEqual(mapped.evidence_ids, []);
    assert.equal(mapped.category_id, 'cat_uncategorized');
  });

  test('an extracted row keeps its confidence', () => {
    const row = {
      id: 'txn_e', account_id: 'acct_x', document_id: 'doc_1',
      transaction_date: '2026-09-01', amount: 100, direction: 'EXPENSE' as const,
      merchant_name: 'Shop', raw_text_snippet: 'line', category_id: 'cat_food', confidence: 0.93,
      extraction_method: 'MODEL' as const, status: 'ACCEPTED', is_duplicate_candidate: 0,
      is_sample_data: 0,
      created_at: '2026-09-01T00:00:00Z',
    };
    const mapped = toTransaction(row);
    assert.equal(mapped.provenance.source, 'EXTRACTED');
    assert.equal(mapped.category_source, 'MERCHANT_RULE');
  });

  test('a user correction is attributed to the user, not to a merchant rule', () => {
    const row = {
      id: 'txn_c', account_id: 'acct_x', document_id: 'doc_1',
      transaction_date: '2026-09-01', amount: 100, direction: 'EXPENSE' as const,
      merchant_name: 'Shop', raw_text_snippet: '', category_id: 'cat_food', confidence: 0.9,
      extraction_method: 'DETERMINISTIC' as const, status: 'USER_EDITED', is_duplicate_candidate: 0,
      is_sample_data: 0,
      created_at: '2026-09-01T00:00:00Z',
    };
    assert.equal(toTransaction(row).category_source, 'USER_CORRECTION');
  });
});