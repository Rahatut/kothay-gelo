import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { detectRecurringPatterns } from './financialEngine';
import type { Transaction } from '../src/types';

/** Spec 007 â€” recurring expense detection. */

function tx(date: string, amount: number, merchant: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `txn_${merchant}_${date}`,
    user_id: 'acct_test',
    transaction_date: date,
    amount,
    currency: 'BDT',
    direction: 'EXPENSE',
    merchant_name: merchant,
    raw_text_snippet: `${date} ${merchant} ${amount}`,
    description: `${date} ${merchant}`,
    category_id: 'cat_bills',
    category_source: 'MERCHANT_RULE',
    status: 'ACCEPTED',
    provenance: { source: 'USER_ASSERTED', asserted_at: date, assertion_method: 'MANUAL_ENTRY' },
    evidence_ids: [],
    created_at: date,
    updated_at: date,
    ...overrides,
  };
}

describe('detectRecurringPatterns', () => {
  test('detects a monthly rent payment missed by the old detector', () => {
    const rows = [
      tx('2026-08-01', 18000, 'Rent'),
      tx('2026-09-01', 18000, 'Rent'),
      tx('2026-10-01', 18000, 'Rent'),
    ];
    const patterns = detectRecurringPatterns(rows, { today: '2026-10-02' });
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].frequency, 'MONTHLY');
    assert.equal(patterns[0].amount_min, 18000);
    assert.equal(patterns[0].monthly_cost, 18000);
    assert.equal(patterns[0].annual_cost, 216000);
    assert.equal(patterns[0].confidence, 'confirmed');
    assert.equal(patterns[0].state, 'active');
  });

  test('exactly two occurrences is provisional, not confirmed', () => {
    const rows = [tx('2026-09-03', 450, 'Netflix'), tx('2026-10-03', 450, 'Netflix')];
    const patterns = detectRecurringPatterns(rows, { today: '2026-10-04' });
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].confidence, 'provisional');
  });

  test('a weekly payment is detected at the weekly frequency', () => {
    const rows = [
      tx('2026-09-07', 120, 'Wifi'),
      tx('2026-09-14', 120, 'Wifi'),
      tx('2026-09-21', 120, 'Wifi'),
    ];
    const patterns = detectRecurringPatterns(rows, { today: '2026-09-22' });
    assert.equal(patterns[0]?.frequency, 'WEEKLY');
    assert.equal(patterns[0]?.monthly_cost, 520);
  });

  test('a one-off purchase is not reported as recurring', () => {
    const rows = [tx('2026-09-15', 9500, 'Electronics Shop')];
    assert.equal(detectRecurringPatterns(rows, { today: '2026-10-01' }).length, 0);
  });

  test('two same-merchant different-interval rows are not recurring', () => {
    const rows = [tx('2026-09-01', 100, 'Cafe'), tx('2026-09-25', 100, 'Cafe')];
    assert.equal(detectRecurringPatterns(rows, { today: '2026-10-01' }).length, 0);
  });

  test('a stopped recurrence is marked stopped, not active', () => {
    const rows = [tx('2026-06-05', 800, 'Gym'), tx('2026-07-05', 800, 'Gym')];
    const patterns = detectRecurringPatterns(rows, { today: '2026-10-02' });
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].state, 'stopped');
  });

  test('amount variation is reported rather than hidden', () => {
    const rows = [
      tx('2026-08-10', 900, 'Power Bill'),
      tx('2026-09-10', 1100, 'Power Bill'),
      tx('2026-10-10', 800, 'Power Bill'),
    ];
    const patterns = detectRecurringPatterns(rows, { today: '2026-10-11' });
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].amount_min, 800);
    assert.equal(patterns[0].amount_max, 1100);
    assert.equal(patterns[0].amount_variation, 300);
  });

  test('merchant names that differ only by case and whitespace group together', () => {
    const rows = [
      tx('2026-09-02', 300, '  Spotify'),
      tx('2026-10-02', 300, 'spotify '),
    ];
    const patterns = detectRecurringPatterns(rows, { today: '2026-10-03' });
    assert.equal(patterns.length, 1);
  });

  test('income rows are not standing expenses', () => {
    const rows = [
      tx('2026-09-01', 5000, 'Salary', { direction: 'INCOME' }),
      tx('2026-10-01', 5000, 'Salary', { direction: 'INCOME' }),
    ];
    assert.equal(detectRecurringPatterns(rows, { today: '2026-10-02' }).length, 0);
  });
});
