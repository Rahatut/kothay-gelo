import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  roundMoney,
  sumExpenses,
  calculatePeriodMetrics,
  calculateCategoryBreakdown,
  calculateMerchantConcentration,
  groupTransactionsByPeriod,
  latestPeriodKey,
  previousPeriodKey,
  periodKeyOf,
  goalProgress,
  generateDeterministicInsights,
} from './financialEngine';
import type { Transaction } from '../src/types';

/**
 * Engine behaviour that User Story 2 depends on: one authoritative path, and
 * figures that do not change depending on who asked or how big the input is.
 */

function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    user_id: 'acct_test',
    transaction_date: '2026-09-15',
    amount: 100,
    currency: 'BDT',
    direction: 'EXPENSE',
    merchant_name: 'Merchant',
    description: '',
    category_id: 'cat_food',
    category_source: 'MERCHANT_RULE',
    status: 'ACCEPTED',
    provenance: { source: 'ENGINE_DERIVED', calculation_version: 'v1', derivation: 'test' },
    evidence_ids: [],
    created_at: '2026-09-15',
    updated_at: '2026-09-15',
    ...overrides,
  } as Transaction;
}

/** Builds n rows spread across months, merchants, and categories. */
function bulk(n: number): Transaction[] {
  const categories = ['cat_food', 'cat_transport', 'cat_bills', 'cat_mobile'];
  const rows: Transaction[] = [];
  for (let i = 0; i < n; i++) {
    const month = String((i % 12) + 1).padStart(2, '0');
    const day = String((i % 28) + 1).padStart(2, '0');
    rows.push(
      tx(`txn_${i}`, {
        transaction_date: `2026-${month}-${day}`,
        amount: (i % 997) + 13.5,
        category_id: categories[i % categories.length],
        merchant_name: `Merchant ${i % 50}`,
      }),
    );
  }
  return rows;
}

describe('aggregation performance', () => {
  test('aggregates 10,000 rows well inside the budget', () => {
    const rows = bulk(10_000);

    const started = Date.now();
    calculatePeriodMetrics(rows);
    calculateCategoryBreakdown(rows);
    calculateMerchantConcentration(rows);
    const elapsed = Date.now() - started;

    // The budget is 100 ms. Recorded rather than assumed: if this ever starts
    // failing, the cause is a new O(n^2) pass rather than machine speed.
    assert.ok(elapsed < 100, `aggregation took ${elapsed}ms, budget is 100ms`);
  });

  test('grouping 10,000 rows stays linear', () => {
    const rows = bulk(10_000);
    const started = Date.now();
    const grouped = groupTransactionsByPeriod(rows);
    const elapsed = Date.now() - started;

    assert.equal(grouped.size, 12, 'expected one bucket per calendar month');
    assert.ok(elapsed < 100, `grouping took ${elapsed}ms, budget is 100ms`);
  });
});

describe('reproducibility', () => {
  test('the same input always yields the same figures', () => {
    const current = bulk(200);
    const previous = bulk(150);

    const first = generateDeterministicInsights(current, previous, 'acct_test');
    const second = generateDeterministicInsights(current, previous, 'acct_test');

    assert.deepEqual(
      first.insights.map((i) => [i.type, i.title, i.supporting_transaction_ids]),
      second.insights.map((i) => [i.type, i.title, i.supporting_transaction_ids]),
    );
  });

  test('input order does not change a total', () => {
    const rows = bulk(100);
    const forward = sumExpenses(rows);
    const reversed = sumExpenses([...rows].reverse());
    assert.equal(forward, reversed);
  });
});

describe('period arithmetic', () => {
  test('rejects an impossible date rather than bucketing it somewhere', () => {
    assert.equal(periodKeyOf('2026-02-30'), null);
    assert.equal(periodKeyOf('2026-13-01'), null);
    assert.equal(periodKeyOf('not-a-date'), null);
    assert.equal(periodKeyOf('2026-09-01'), '2026-09');
  });

  test('steps back across a year boundary', () => {
    assert.equal(previousPeriodKey('2026-01'), '2025-12');
    assert.equal(previousPeriodKey('2026-09'), '2026-08');
  });

  test('omits unplaceable rows instead of guessing a bucket', () => {
    const rows = [
      tx('a', { transaction_date: '2026-09-01' }),
      tx('b', { transaction_date: '2026-13-45' }),
    ];
    const grouped = groupTransactionsByPeriod(rows);
    assert.equal(grouped.get('2026-09')?.length, 1);
    assert.equal(grouped.size, 1, 'the unplaceable row must not create a bucket');
  });

  test('picks the latest period present rather than a hardcoded one', () => {
    const rows = [
      tx('a', { transaction_date: '2026-07-01' }),
      tx('b', { transaction_date: '2026-11-30' }),
      tx('c', { transaction_date: '2026-09-15' }),
    ];
    assert.equal(latestPeriodKey(rows), '2026-11');
  });
});

describe('goal progress', () => {
  test('computes a percentage', () => {
    assert.equal(goalProgress(62000, 150000), 41.33);
  });

  test('clamps over-target progress to 100', () => {
    assert.equal(goalProgress(200000, 150000), 100);
  });

  test('returns null rather than Infinity for a zero or negative target', () => {
    assert.equal(goalProgress(100, 0), null);
    assert.equal(goalProgress(100, -50), null);
    assert.equal(goalProgress(NaN, 100), null);
    assert.equal(goalProgress(100, NaN), null);
  });

  test('clamps a negative balance to zero', () => {
    assert.equal(goalProgress(-500, 1000), 0);
  });
});

describe('insight evidence points at the rows that moved', () => {
  test('excludes rows that are unchanged between periods', () => {
    const current = [
      tx('rent_now', { amount: 18000, merchant_name: 'Landlord' }),
      tx('new_spend', { amount: 250, merchant_name: 'NewMerchant' }),
    ];
    const previous = [tx('rent_before', { amount: 18000, merchant_name: 'Landlord' })];

    const { insights } = generateDeterministicInsights(current, previous, 'acct_test');
    const comparison = insights.find((i) => i.type === 'PERIOD_COMPARISON');

    assert.ok(comparison, 'expected a period comparison');
    assert.deepEqual(
      comparison!.supporting_transaction_ids,
      ['new_spend'],
      'the unchanged rent row must not be cited as a mover',
    );
  });

  test('every insight cites at least one row', () => {
    const current = bulk(300);
    const previous = bulk(300);
    for (const insight of generateDeterministicInsights(current, previous, 'acct_test').insights) {
      assert.ok(
        (insight.supporting_transaction_ids ?? []).length > 0,
        `"${insight.title}" cites nothing`,
      );
    }
  });
});

describe('engine independence', () => {
  test('imports nothing that could reach the network, a store, or a model', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(here, 'financialEngine.ts'), 'utf8');
    const imports = source.match(/^import .*$/gm) ?? [];
    const forbidden = ['libsql', '@libsql', 'gemini', 'express', 'capabilities', 'db/', 'auth/', 'node:fs'];
    for (const line of imports) {
      for (const needle of forbidden) {
        assert.ok(
          !line.includes(needle),
          `financialEngine.ts imports "${needle}", which breaks engine independence: ${line}`,
        );
      }
    }
  });

  test('runs with no model key and no database configured', () => {
    // Deleting the variables is the assertion: if the engine reached for either,
    // it would throw here rather than in a module-level read.
    const savedKey = process.env.GEMINI_API_KEY;
    const savedDb = process.env.DATABASE_URL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DATABASE_URL;
    try {
      const rows = bulk(50);
      assert.ok(Number.isFinite(calculatePeriodMetrics(rows).total_expenses));
      assert.ok(Array.isArray(calculateCategoryBreakdown(rows)));
      assert.ok(generateDeterministicInsights(rows, [], 'acct_test').insights !== undefined);
    } finally {
      if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
      if (savedDb !== undefined) process.env.DATABASE_URL = savedDb;
    }
  });

  test('rounding is symmetric on both signs', () => {
    assert.equal(roundMoney(1.005), 1.01);
    assert.equal(roundMoney(-1.005), -1.01);
    assert.equal(roundMoney(2.345), 2.35);
    assert.equal(roundMoney(-2.345), -2.35);
  });
});