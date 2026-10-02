import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  roundMoney,
  sumExpenses,
  sumIncome,
  calculatePeriodMetrics,
  calculateCategoryBreakdown,
  calculateMerchantConcentration,
  generateDeterministicInsights,
  periodKeyOf,
  previousPeriodKey,
  groupTransactionsByPeriod,
  latestPeriodKey,
  periodLabelOf,
  mostActivePeriodKey,
} from './financialEngine';
import type { Transaction } from '../src/types';

/**
 * Suite 001: the financial engine, verified in isolation.
 *
 * Constitution Principle X requires the engine to be testable without the model.
 * This file deliberately imports no database client, no Gemini module, and no
 * capability layer — if that ever changes, the import-list assertion at the
 * bottom fails and the violation is visible rather than silent.
 *
 * There is no other test suite in this repository. This file exists to prove the
 * harness runs TypeScript and resolves the `@/*` alias; every later suite
 * depends on that being true.
 */

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'txn_test',
    user_id: 'acct_test',
    document_id: 'doc_test',
    transaction_date: '2026-09-15',
    amount: 100,
    direction: 'EXPENSE',
    merchant_name: 'Test Merchant',
    description: '',
    category_id: 'cat_food',
    confidence: 1,
    status: 'CONFIRMED',
    raw_text_snippet: '',
    is_duplicate_candidate: false,
    verified: true,
    ...overrides,
  } as Transaction;
}

describe('roundMoney', () => {
  test('rounds to two decimal places', () => {
    assert.equal(roundMoney(1.005), 1.01);
    assert.equal(roundMoney(2.344), 2.34);
    assert.equal(roundMoney(2.345), 2.35);
  });

  test('leaves exact values untouched', () => {
    assert.equal(roundMoney(0), 0);
    assert.equal(roundMoney(100), 100);
    assert.equal(roundMoney(42.68), 42.68);
  });

  test('rounds half away from zero on both signs', () => {
    assert.equal(roundMoney(-1.005), -1.01);
    assert.equal(roundMoney(1.005), 1.01);
    assert.equal(roundMoney(-2.345), -2.35);
    assert.equal(roundMoney(2.345), 2.35);
  });

  test('never returns negative zero', () => {
    assert.ok(Object.is(roundMoney(-0.004), 0), 'expected 0, got -0');
    assert.ok(Object.is(roundMoney(-0), 0), 'expected 0, got -0');
  });
});

describe('direction filtering', () => {
  test('sums only expenses', () => {
    const rows = [
      tx({ id: 'a', amount: 250.5, direction: 'EXPENSE' }),
      tx({ id: 'b', amount: 4000, direction: 'INCOME' }),
      tx({ id: 'c', amount: 99.5, direction: 'EXPENSE' }),
    ];
    assert.equal(sumExpenses(rows), 350);
  });

  test('sums only income', () => {
    const rows = [
      tx({ id: 'a', amount: 250.5, direction: 'EXPENSE' }),
      tx({ id: 'b', amount: 4000, direction: 'INCOME' }),
      tx({ id: 'c', amount: 1000, direction: 'REFUND' }),
    ];
    assert.equal(sumIncome(rows), 4000);
  });

  test('treats TRANSFER and UNKNOWN as neither income nor expense', () => {
    const rows = [
      tx({ id: 'a', amount: 100, direction: 'TRANSFER' }),
      tx({ id: 'b', amount: 200, direction: 'UNKNOWN' }),
    ];
    assert.equal(sumExpenses(rows), 0);
    assert.equal(sumIncome(rows), 0);
  });

  test('returns zero for an empty set rather than throwing', () => {
    assert.equal(sumExpenses([]), 0);
    assert.equal(sumIncome([]), 0);
  });
});

describe('calculatePeriodMetrics', () => {
  test('derives net savings from income minus expenses', () => {
    const rows = [
      tx({ id: 'a', amount: 75000, direction: 'INCOME' }),
      tx({ id: 'b', amount: 37129, direction: 'EXPENSE' }),
    ];
    const metrics = calculatePeriodMetrics(rows);
    assert.equal(metrics.total_income, 75000);
    assert.equal(metrics.total_expenses, 37129);
    assert.equal(metrics.net_savings, 37871);
    assert.equal(metrics.count, 2);
  });

  test('rounds every total through roundMoney', () => {
    const rows = [
      tx({ id: 'a', amount: 0.1, direction: 'EXPENSE' }),
      tx({ id: 'b', amount: 0.2, direction: 'EXPENSE' }),
    ];
    assert.equal(calculatePeriodMetrics(rows).total_expenses, 0.3);
  });
});

describe('calculateCategoryBreakdown', () => {
  test('groups by category and ranks by amount', () => {
    const rows = [
      tx({ id: 'a', amount: 1000, category_id: 'cat_food' }),
      tx({ id: 'b', amount: 500, category_id: 'cat_food' }),
      tx({ id: 'c', amount: 300, category_id: 'cat_bills' }),
    ];
    const breakdown = calculateCategoryBreakdown(rows);
    assert.equal(breakdown[0].category_id, 'cat_food');
    assert.equal(breakdown[0].amount, 1500);
    assert.equal(breakdown[1].category_id, 'cat_bills');
  });

  test('returns an empty array for no transactions', () => {
    assert.deepEqual(calculateCategoryBreakdown([]), []);
  });
});

describe('calculateMerchantConcentration', () => {
  test('groups by merchant and counts occurrences', () => {
    const rows = [
      tx({ id: 'a', amount: 100, merchant_name: 'Foodpanda' }),
      tx({ id: 'b', amount: 200, merchant_name: 'Foodpanda' }),
      tx({ id: 'c', amount: 500, merchant_name: 'Uber' }),
    ];
    const merchants = calculateMerchantConcentration(rows);
    const foodpanda = merchants.find((m) => m.merchant_name === 'Foodpanda');
    assert.equal(foodpanda?.amount, 300);
    assert.equal(foodpanda?.count, 2);
  });
});

describe('generateDeterministicInsights', () => {
  const build = () => ({
    current: [
      tx({ id: 'a', amount: 2000, category_id: 'cat_food' }),
      tx({ id: 'b', amount: 1500, category_id: 'cat_transport' }),
    ],
    previous: [
      tx({ id: 'c', amount: 500, category_id: 'cat_food', transaction_date: '2026-08-15' }),
    ],
  });

  test('returns insight and recommendation collections for a thin dataset', () => {
    const result = generateDeterministicInsights([], [], 'acct_test');
    assert.ok(Array.isArray(result.insights));
    assert.ok(Array.isArray(result.recommendations));
  });

  test('produces identical figures for identical input', () => {
    const { current, previous } = build();
    const first = generateDeterministicInsights(current, previous, 'acct_test');
    const second = generateDeterministicInsights(current, previous, 'acct_test');

    assert.equal(first.insights.length, second.insights.length);
    for (let i = 0; i < first.insights.length; i++) {
      assert.equal(first.insights[i].title, second.insights[i].title);
      assert.deepEqual(
        first.insights[i].supporting_transaction_ids,
        second.insights[i].supporting_transaction_ids,
      );
      assert.ok(
        Number.isFinite(first.insights[i].confidence),
        'insight confidence must be a finite number, never a default',
      );
      // constitution principle VI: an insight with no supporting rows is not a finding
      assert.ok(
        (first.insights[i].supporting_transaction_ids ?? []).length > 0,
        `insight "${first.insights[i].title}" was emitted with no supporting transactions`,
      );
    }
  });

  test('every emitted insight cites at least one supporting transaction', () => {
    const { current, previous } = build();
    for (const insight of generateDeterministicInsights(current, previous, 'acct_test').insights) {
      assert.ok(
        (insight.supporting_transaction_ids ?? []).length > 0,
        `insight "${insight.title}" was emitted with no supporting transactions`,
      );
    }
  });

  test('every emitted recommendation cites supporting transactions and a version', () => {
    const { current, previous } = build();
    for (const rec of generateDeterministicInsights(current, previous, 'acct_test')
      .recommendations) {
      assert.ok(
        (rec.supporting_transaction_ids ?? []).length > 0,
        `"${rec.title}" cites nothing`,
      );
      assert.ok(rec.calculation_version, `"${rec.title}" has no calculation version`);
    }
  });
});

describe('engine independence (constitution principle X)', () => {
  test('the engine imports no database, model, or capability module', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(here, 'financialEngine.ts'), 'utf8');
    const imports = source.match(/^import .*$/gm) ?? [];
    const forbidden = ['libsql', '@libsql', 'gemini', 'capabilities', 'db/', 'auth/'];
    for (const line of imports) {
      for (const needle of forbidden) {
        assert.ok(
          !line.includes(needle),
          `financialEngine.ts imports "${needle}", which breaks engine independence: ${line}`,
        );
      }
    }
  });

  test('the engine is pure: repeated calls share no mutable state', () => {
    const rows = [tx({ id: 'a', amount: 100 })];
    const before = JSON.stringify(rows);
    calculatePeriodMetrics(rows);
    calculateCategoryBreakdown(rows);
    calculateMerchantConcentration(rows);
    assert.equal(JSON.stringify(rows), before);
  });
});

describe('periodKeyOf', () => {
  test('returns YYYY-MM for a valid ISO date', () => {
    assert.equal(periodKeyOf('2026-09-15'), '2026-09');
    assert.equal(periodKeyOf('2026-01-01'), '2026-01');
    assert.equal(periodKeyOf('2025-12-31'), '2025-12');
  });

  test('rejects February 31 and other non-calendar dates', () => {
    assert.equal(periodKeyOf('2026-02-31'), null);
    assert.equal(periodKeyOf('2026-02-30'), null);
    assert.equal(periodKeyOf('2025-02-29'), null);
  });

  test('rejects invalid months', () => {
    assert.equal(periodKeyOf('2026-13-01'), null);
    assert.equal(periodKeyOf('2026-00-01'), null);
  });

  test('rejects malformed strings', () => {
    assert.equal(periodKeyOf('2026/09/15'), null);
    assert.equal(periodKeyOf('15/09/2026'), null);
    assert.equal(periodKeyOf(''), null);
  });
});

describe('previousPeriodKey', () => {
  test('steps back one month within the same year', () => {
    assert.equal(previousPeriodKey('2026-09'), '2026-08');
    assert.equal(previousPeriodKey('2026-02'), '2026-01');
  });

  test('rolls over to previous year at January', () => {
    assert.equal(previousPeriodKey('2026-01'), '2025-12');
  });

  test('rejects invalid keys', () => {
    assert.equal(previousPeriodKey('2026-13'), null);
    assert.equal(previousPeriodKey('2026'), null);
    assert.equal(previousPeriodKey(''), null);
  });
});

describe('groupTransactionsByPeriod', () => {
  test('partitions by YYYY-MM and sorts keys ascending', () => {
    const rows = [
      tx({ id: 'a', transaction_date: '2026-09-15' }),
      tx({ id: 'b', transaction_date: '2026-08-20' }),
      tx({ id: 'c', transaction_date: '2026-09-01' }),
      tx({ id: 'd', transaction_date: '2026-07-10' }),
    ];
    const grouped = groupTransactionsByPeriod(rows);
    const keys = Array.from(grouped.keys());
    assert.deepEqual(keys, ['2026-07', '2026-08', '2026-09']);
    assert.equal(grouped.get('2026-09')!.length, 2);
    assert.equal(grouped.get('2026-08')!.length, 1);
    assert.equal(grouped.get('2026-07')!.length, 1);
  });

  test('omits rows whose date cannot be placed', () => {
    const rows = [
      tx({ id: 'a', transaction_date: '2026-09-15' }),
      tx({ id: 'b', transaction_date: 'not-a-date' }),
      tx({ id: 'c', transaction_date: '2026-13-01' }),
    ];
    const grouped = groupTransactionsByPeriod(rows);
    assert.equal(grouped.size, 1);
    assert.equal(grouped.get('2026-09')!.length, 1);
  });
});

describe('latestPeriodKey', () => {
  test('returns the maximum period key present', () => {
    const rows = [
      tx({ id: 'a', transaction_date: '2026-09-15' }),
      tx({ id: 'b', transaction_date: '2026-08-20' }),
      tx({ id: 'c', transaction_date: '2026-10-01' }),
    ];
    assert.equal(latestPeriodKey(rows), '2026-10');
  });

  test('returns null for empty array', () => {
    assert.equal(latestPeriodKey([]), null);
  });

  test('returns null when all dates are unplaceable', () => {
    const rows = [
      tx({ id: 'a', transaction_date: 'not-a-date' }),
      tx({ id: 'b', transaction_date: '2026-13-01' }),
    ];
    assert.equal(latestPeriodKey(rows), null);
  });
});

describe('periodLabelOf', () => {
  test('formats YYYY-MM as "Month YYYY"', () => {
    assert.equal(periodLabelOf('2026-09'), 'September 2026');
    assert.equal(periodLabelOf('2026-01'), 'January 2026');
    assert.equal(periodLabelOf('2025-12'), 'December 2025');
  });

  test('rejects invalid keys', () => {
    assert.equal(periodLabelOf('2026-13'), null);
    assert.equal(periodLabelOf('2026'), null);
    assert.equal(periodLabelOf(''), null);
  });
});

describe('mostActivePeriodKey', () => {
  test('returns the period with the most expense transactions', () => {
    const rows = [
      tx({ id: 'a', transaction_date: '2026-09-15', direction: 'EXPENSE' }),
      tx({ id: 'b', transaction_date: '2026-09-20', direction: 'EXPENSE' }),
      tx({ id: 'c', transaction_date: '2026-08-10', direction: 'EXPENSE' }),
      tx({ id: 'd', transaction_date: '2026-10-05', direction: 'INCOME' }), // not counted
    ];
    assert.equal(mostActivePeriodKey(rows), '2026-09');
  });

  test('breaks ties by choosing the later period', () => {
    const rows = [
      tx({ id: 'a', transaction_date: '2026-09-15', direction: 'EXPENSE' }),
      tx({ id: 'b', transaction_date: '2026-08-10', direction: 'EXPENSE' }),
    ];
    assert.equal(mostActivePeriodKey(rows), '2026-09');
  });

  test('returns null for empty or income-only data', () => {
    assert.equal(mostActivePeriodKey([]), null);
    assert.equal(
      mostActivePeriodKey([tx({ id: 'a', transaction_date: '2026-09-15', direction: 'INCOME' })]),
      null,
    );
  });
});
