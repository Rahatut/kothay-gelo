import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTrendSeries,
  bucketFor,
  bucketRange,
  describeGrouping,
  TREND_GRANULARITIES,
  type TrendGranularity,
} from './financialEngine';
import type { Transaction } from '../src/types';

/**
 * Spec 004 — the trend engine.
 *
 * These are the guarantees the chart depends on and cannot check for itself. A
 * miscounted bar is a wrong number about somebody's money wearing a picture, which
 * is harder for a user to catch than a wrong number in a table.
 *
 * The two that matter most:
 *
 *   FR-003  Bucketing partitions the range exactly. Every transaction lands in one
 *           bucket, none is counted twice, and none is silently dropped. Derived by
 *           summing the points and comparing to the input, which is the only way to
 *           notice a bucket that swallowed two dates' worth of rows.
 *   FR-005  A partial bucket is excluded from period-over-period comparison. A part
 *           week compared against a whole one reports a false collapse in spending,
 *           which is the specific mistake the rule exists to prevent.
 */

function tx(
  date: string,
  amount: number,
  direction: Transaction['direction'] = 'EXPENSE',
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id: `txn_${date}_${amount}_${direction}`,
    user_id: 'acct_test',
    transaction_date: date,
    amount,
    currency: 'BDT',
    direction,
    merchant_name: 'Foodpanda',
    raw_text_snippet: `${date} ${amount}`,
    description: `${date} ${amount}`,
    category_id: 'cat_food',
    category_source: 'MERCHANT_RULE',
    status: 'ACCEPTED',
    // Deliberately varied: a figure that excluded a hand-entered row would be wrong,
    // and FR-012 requires them on equal footing.
    provenance:
      direction === 'INCOME'
        ? { source: 'ENGINE_DERIVED', calculation_version: 'engine-1.1.0', derivation: 'x' }
        : { source: 'USER_ASSERTED', asserted_at: date, assertion_method: 'MANUAL_ENTRY' },
    evidence_ids: [],
    created_at: date,
    updated_at: date,
    ...overrides,
  } as Transaction;
}

const PERIOD = { start: '2026-09-01', end: '2026-09-30' };
const TODAY = '2026-10-05';

describe('bucketing rules', () => {
  test('daily buckets are the date itself', () => {
    assert.deepEqual(bucketFor('2026-09-14', 'DAILY'), {
      key: '2026-09-14',
      start: '2026-09-14',
      end: '2026-09-14',
    });
  });

  test('weekly buckets run Monday to Sunday and are keyed by the Monday', () => {
    // 2026-09-14 is a Monday; 2026-09-20 the Sunday closing the same week.
    assert.deepEqual(bucketFor('2026-09-14', 'WEEKLY'), {
      key: '2026-09-14',
      start: '2026-09-14',
      end: '2026-09-20',
    });
    assert.equal(bucketFor('2026-09-20', 'WEEKLY')!.key, '2026-09-14');
    // Sunday starts the week before, not a new one.
    assert.equal(bucketFor('2026-09-13', 'WEEKLY')!.key, '2026-09-07');
  });

  test('monthly buckets span the whole month, including 30-day and leap months', () => {
    assert.deepEqual(bucketFor('2026-09-14', 'MONTHLY'), {
      key: '2026-09',
      start: '2026-09-01',
      end: '2026-09-30',
    });
    assert.equal(bucketFor('2026-02-10', 'MONTHLY')!.end, '2026-02-28');
    assert.equal(bucketFor('2028-02-10', 'MONTHLY')!.end, '2028-02-29', 'a leap February is not clamped');
  });

  test('an invalid date yields no bucket rather than a guess', () => {
    assert.equal(bucketFor('not-a-date', 'DAILY'), null);
  });

  test('the grouping rule is stated as a sentence, for the interface to display', () => {
    // FR-004: the rule must be visible, not implied by the chart's shape.
    for (const granularity of TREND_GRANULARITIES) {
      const rule = describeGrouping(granularity as TrendGranularity);
      assert.ok(rule.length > 10, `${granularity} has no stated rule`);
      assert.match(rule, /[.!]$/, 'a rule reads as a sentence');
    }
  });
});

describe('FR-003 — the buckets partition the range exactly', () => {
  const transactions = [
    tx('2026-09-01', 100),
    tx('2026-09-01', 150),
    tx('2026-09-14', 250),
    tx('2026-09-15', 400, 'INCOME'),
    tx('2026-09-28', 75),
    tx('2026-09-30', 25),
  ];

  for (const granularity of TREND_GRANULARITIES) {
    test(`${granularity}: every row is counted exactly once`, () => {
      const series = buildTrendSeries(transactions, { ...PERIOD, granularity, today: TODAY });

      const expenseSum = Math.round(
        series.points.reduce((sum, p) => sum + p.total_expenses, 0) * 100,
      ) / 100;
      const inputExpenses = Math.round(
        transactions.filter((t) => t.direction !== 'INCOME').reduce((s, t) => s + t.amount, 0) * 100,
      ) / 100;

      assert.equal(expenseSum, inputExpenses, 'the points do not sum to the input');

      const ids = series.points.flatMap((p) => p.transaction_ids);
      assert.equal(new Set(ids).size, ids.length, 'a row was counted in two buckets');
      assert.equal(ids.length, transactions.length, 'a row was dropped without being counted');

      const count = series.points.reduce((sum, p) => sum + p.count, 0);
      assert.equal(count, transactions.length);
    });
  }

  test('a row outside the range is omitted and reported, never folded in', () => {
    const series = buildTrendSeries([...transactions, tx('2026-08-15', 999)], {
      ...PERIOD,
      granularity: 'DAILY',
      today: TODAY,
    });

    assert.equal(series.omitted_outside_range, 1, 'an out-of-range row must be counted');
    const ids = series.points.flatMap((p) => p.transaction_ids);
    assert.equal(
      ids.some((id) => id.includes('2026-08-15')),
      false,
      'an August row leaked into September',
    );
  });
});

describe('FR-006 — a period with no data is a gap, not a zero', () => {
  test('an empty bucket carries a reason', () => {
    const series = buildTrendSeries([tx('2026-09-02', 100)], {
      ...PERIOD,
      granularity: 'DAILY',
      today: TODAY,
    });

    const gaps = series.points.filter((p) => p.count === 0);
    assert.equal(gaps.length, 29, 'every day without rows should be present');
    for (const gap of gaps) {
      assert.ok(gap.note, `${gap.key} is a gap with no explanation`);
      assert.equal(gap.total_expenses, 0, 'a gap has no spending, which is different from a bucket of one');
    }
  });

  test('an entirely empty period still produces its buckets', () => {
    const series = buildTrendSeries([], { ...PERIOD, granularity: 'MONTHLY', today: TODAY });
    assert.equal(series.points.length, 1, 'September must appear even with nothing in it');
    assert.equal(series.points[0].count, 0);
    assert.ok(series.points[0].note);
    assert.equal(series.totals.count, 0);
  });
});

describe('FR-005 — a partial bucket cannot be compared', () => {
  test('a range that cuts into a week marks that week partial', () => {
    // The range starts on a Tuesday, so the first ISO week is only partly in view.
    const series = buildTrendSeries([tx('2026-09-02', 100)], {
      ...PERIOD,
      granularity: 'WEEKLY',
      today: TODAY,
    });

    assert.equal(series.points[0].partial, true, 'the first week is cut by the range start');
    assert.equal(series.points[0].comparable, false);
  });

  test('a whole completed week is comparable', () => {
    const series = buildTrendSeries([tx('2026-09-09', 100)], {
      ...PERIOD,
      granularity: 'WEEKLY',
      today: TODAY,
    });
    const week = series.points.find((p) => p.key === '2026-09-07');
    assert.equal(week?.comparable, true, 'a full week inside the range is comparable');
  });

  test('FR-018: a series with any partial bucket refuses a comparison', () => {
    const series = buildTrendSeries([tx('2026-09-09', 100)], {
      ...PERIOD,
      granularity: 'WEEKLY',
      today: TODAY,
    });
    assert.equal(
      series.comparison_allowed,
      false,
      'showing a comparison here would compare a part week against whole ones',
    );
  });

  test('a fully closed month is comparable', () => {
    const series = buildTrendSeries([tx('2026-09-09', 100)], {
      start: '2026-09-01',
      end: '2026-09-30',
      granularity: 'MONTHLY',
      today: TODAY,
    });
    assert.equal(series.comparison_allowed, true);
  });
});

describe('FR-011 — coverage is stated', () => {
  test('the report says how much of the range actually has rows', () => {
    const series = buildTrendSeries([tx('2026-09-01', 100), tx('2026-09-05', 200)], {
      ...PERIOD,
      granularity: 'DAILY',
      today: TODAY,
    });

    assert.equal(series.coverage.days_in_range, 30);
    assert.equal(series.coverage.days_with_rows, 2);
    assert.equal(series.coverage.first_transaction, '2026-09-01');
    assert.equal(series.coverage.last_transaction, '2026-09-05');
    assert.ok(
      series.coverage.days_with_rows_pct > 0 && series.coverage.days_with_rows_pct < 100,
      'coverage is a proportion and must read as one',
    );
  });
});

describe('FR-012 — manual entries count like any other row', () => {
  test('a hand-entered payment appears in the series', () => {
    const series = buildTrendSeries([tx('2026-09-09', 640)], {
      ...PERIOD,
      granularity: 'DAILY',
      today: TODAY,
    });

    const point = series.points.find((p) => p.key === '2026-09-09');
    assert.equal(point?.total_expenses, 640, 'a row the user typed in was excluded');
    assert.equal(point?.transaction_ids.length, 1);
  });

  test('income is kept out of expenses', () => {
    const series = buildTrendSeries([tx('2026-09-09', 500, 'INCOME'), tx('2026-09-09', 200)], {
      ...PERIOD,
      granularity: 'DAILY',
      today: TODAY,
    });

    const point = series.points.find((p) => p.key === '2026-09-09')!;
    assert.equal(point.total_expenses, 200);
    assert.equal(point.total_income, 500);
    assert.equal(point.net_savings, 300);
    assert.equal(point.count, 2, 'both rows belong to the same day');
  });
});

describe('FR-007 — every point can be drilled to', () => {
  test('each point names the rows behind it', () => {
    const rows = [tx('2026-09-01', 100), tx('2026-09-01', 200), tx('2026-09-20', 300)];
    const series = buildTrendSeries(rows, { ...PERIOD, granularity: 'MONTHLY', today: TODAY });

    assert.equal(series.points[0].transaction_ids.length, 3);
    for (const id of series.points[0].transaction_ids) {
      assert.ok(rows.some((r) => r.id === id), `${id} is not a real row`);
    }
  });

  test('bucket ranges do not overlap, so a row cannot appear in two buckets', () => {
    const buckets = bucketRange(PERIOD.start, PERIOD.end, 'WEEKLY');
    for (let i = 1; i < buckets.length; i++) {
      assert.ok(
        buckets[i].start > buckets[i - 1].end,
        `${buckets[i - 1].key} and ${buckets[i].key} overlap`,
      );
    }
  });
});
