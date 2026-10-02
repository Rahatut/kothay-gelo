import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseRow } from './rowParse';
import { measureAll } from './extractionAccuracy';

/**
 * A delimited statement whose amounts carry no currency mark, no two decimal
 * places and no thousands separator.
 *
 * `findBareInteger` — the last-resort fallback in `extractAmount` — matches
 * `([+-]?)(?<![\w.:#\/-])(\d{1,7})(?![\w.,:\/-])`, and that pattern has two
 * independent ways to find nothing in a delimited row:
 *
 *   (a) the trailing lookahead rejects any number followed by a comma, and in a
 *       delimited row every field except the last is followed by one;
 *   (b) the lookbehind sits *after* the `([+-]?)` group, so it inspects the
 *       sign character itself rather than what precedes the sign. Any signed
 *       integer is therefore rejected under every delimiter, comma or not.
 *
 * The consequence is silent. The pipeline completes, `extracted_count` is 0, and
 * the ledger stays empty while the upload looks successful.
 *
 * The same comma carries the second half of the defect, and it is the more
 * damaging half: a comma that separates fields is read as a thousands
 * separator, so `2026-09-02,Foodpanda FP9382,580,DEBIT` files 382580 rather than
 * 580. That is a false record in a money ledger, produced at full confidence
 * with `weak: false`, which is the exact outcome the module header exists to
 * prevent.
 *
 * The negative half of this file matters as much as the positive half. The
 * lookbehind and lookahead were not a quirk; they are what keeps a date, a
 * TrxID and a row number out of the amount column. Every guard below is one the
 * fix must not spend to gain the field-aware path.
 */

describe('delimited rows: a bare integer in its own field is money', () => {
  /**
   * The reported defect, one row per amount shape.
   *
   * Each line is a `date,description,amount,direction` row with a bare integer
   * amount, which is how a statement exported without a currency mark or a
   * decimal column is written.
   */
  const rows: [label: string, line: string, amount: number][] = [
    ['amount with a direction column', '2026-09-02,FOODPANDA ORDER,580,DEBIT', 580],
    ['amount as the last field', '2026-09-02,FOODPANDA ORDER,580', 580],
    ['amount with no description field', '2026-09-02,580,DEBIT', 580],
    ['day-first date', '02/09/2026,580,DEBIT', 580],
    ['digits inside the description, own amount field', '2026-09-02,FOODPANDA ORDER 580,580,DEBIT', 580],
    ['space-padded fields', '2026-09-02, Foodpanda , 580 , DEBIT', 580],
    ['quoted description containing a comma', '2026-09-02,"Foodpanda, Dhaka",580,DEBIT', 580],
    ['four-digit amount', '2026-09-02,SHWAPNO SUPERMARKET,18000,DEBIT', 18000],
  ];

  for (const [label, line, amount] of rows) {
    test(`${label}: ${line}`, () => {
      const row = parseRow(line);
      assert.ok(row !== null, `${line} produced no row at all`);
      assert.equal(row!.amount, amount, `${line} -> amount ${row!.amount}, wanted ${amount}`);
    });
  }

  test('the date of a delimited row is still read, not spent on the amount', () => {
    const row = parseRow('2026-09-02,FOODPANDA ORDER,580,DEBIT');
    assert.equal(row?.date, '2026-09-02');
  });

  test('a delimited statement yields one row per line, none dropped', () => {
    // The user-visible symptom is a statement that parses to nothing at all, so
    // the count is asserted rather than only the fields of a single row.
    const statement = [
      'date,description,amount,direction',
      '2026-09-02,FOODPANDA ORDER,580,DEBIT',
      '2026-09-03,CHALDAL LIMITED,1250,DEBIT',
      '2026-09-04,UBER BD TRIP,340,DEBIT',
      '2026-09-05,SALARY SEPTEMBER,85000,CREDIT',
    ];
    const parsed = statement.map((l) => parseRow(l)).filter((r) => r?.amount != null);

    assert.equal(parsed.length, 4, 'every transaction row must come back');
    assert.deepEqual(
      parsed.map((r) => r!.amount),
      [580, 1250, 340, 85000],
    );
  });
});

describe('delimited rows: a signed amount is read as an amount', () => {
  /**
   * `-580` is a normal amount in a delimited export, and the sign is the only
   * direction evidence on some rows. `extractAmount` already reports the sign
   * separately from the value and always returns a positive figure, so the
   * amount and the sign have to survive together.
   */
  const rows: [label: string, line: string, amount: number, signed: boolean][] = [
    ['comma-delimited', '2026-09-02,FOODPANDA ORDER,-580,DEBIT', 580, true],
    ['comma-delimited, digits in the description', '2026-09-02,FOODPANDA ORDER 580,-580,DEBIT', 580, true],
    ['comma-delimited, amount before the direction', '2026-09-02,FOODPANDA ORDER,580,-580,DEBIT', 580, true],
    ['tab-delimited', '2026-09-02\tFOODPANDA ORDER\t-580\tDEBIT', 580, true],
  ];

  for (const [label, line, amount, signed] of rows) {
    test(`${label}: ${JSON.stringify(line)}`, () => {
      const row = parseRow(line);
      assert.ok(row !== null, `${line} produced no row at all`);
      // Positive. The sign expresses direction through `signals.amountSigned`;
      // a negative amount here would be double-counted against the schema's
      // amount > 0 and is how `-৳250.00` was once filed as 250 with the sign
      // thrown away.
      assert.equal(row!.amount, amount, `${line} -> amount ${row!.amount}, wanted ${amount}`);
      assert.equal(row!.signals.amountSigned, signed, 'the sign must be reported, not consumed');
    });
  }

  test('a positive sign is reported too', () => {
    const row = parseRow('2026-09-02,REFUND FROM FOODPANDA,+250,DEBIT');
    assert.equal(row?.amount, 250);
    assert.equal(row?.signals.amountSigned, true);
  });

  test('an unsigned amount in the same shape is not reported as signed', () => {
    const row = parseRow('2026-09-02,FOODPANDA ORDER,580,DEBIT');
    assert.equal(row?.amount, 580);
    assert.equal(row?.signals.amountSigned, false);
  });

  test('an explicit direction word is still the direction', () => {
    const row = parseRow('2026-09-02,REFUND FROM FOODPANDA,250,CREDIT');
    assert.equal(row?.direction, 'INCOME');
    assert.equal(row?.directionInferred, false);
  });
});

describe('a comma that separates fields is not a thousands separator', () => {
  /**
   * The second half of the defect, and the more damaging half.
   *
   * `\d{1,3}(?:,\d{3})+` runs over the whole line, so when a description field
   * ends in digits and the amount field follows, the field separator is read as
   * a digit group and the two are merged. Each line below is currently parsed
   * into a confidently wrong figure with `weak: false`, which is worse than
   * parsing to nothing: the number is filed, and because the engine trusts
   * extracted rows (constitution Principle I) nothing downstream gets a second
   * look. The pre-fix figures are noted in each label so a failure states which
   * side of the comma the parser crossed.
   */
  const rows: [label: string, line: string, amount: number, mergedToday: number][] = [
    ['order id before the amount, merged to 382580', '2026-09-02,Foodpanda FP9382,580,DEBIT', 580, 382580],
    ['longer order id, merged to 382150', '2026-09-02,Order FP9382,1500,DEBIT', 1500, 382150],
    ['a year inside the description, merged to 26180', '2026-09-02,Rent Sep 2026,18000,DEBIT', 18000, 26180],
    ['two amounts, merged to 580580', '2026-09-02,FOODPANDA ORDER 580,580,DEBIT', 580, 580580],
  ];

  for (const [label, line, amount, mergedToday] of rows) {
    test(`${label}: ${line}`, () => {
      assert.equal(
        parseRow(line)?.amount,
        amount,
        `${line} read across the field boundary; the field separator was taken for a thousands separator (today: ${mergedToday})`,
      );
    });
  }
});

describe('identifiers are still not amounts', () => {
  /**
   * The protection the lookbehind and lookahead exist to provide.
   *
   * Every line below has no amount field at all. Each one must still come back
   * with `amount: null`, because a TrxID, a serial number or a date filed as a
   * transaction is a fabricated record. A fix that makes bare integers readable
   * has to keep these empty.
   */
  const lines: [label: string, line: string][] = [
    ['alphanumeric TrxID column', '2026-09-02,9A2B7C,FOODPANDA ORDER,DEBIT'],
    ['labelled TrxID column', '2026-09-02,TrxID: 9A2B7C,FOODPANDA ORDER,DEBIT'],
    ['serial number column', '2026-09-02,Sl,2,FOODPANDA ORDER,DEBIT'],
    ['date and direction, no amount', '2026-09-02,FOODPANDA ORDER,DEBIT'],
    ['zero is not an amount', '2026-09-02,FOODPANDA ORDER,0,DEBIT'],
  ];

  for (const [label, line] of lines) {
    test(`${label}: ${line}`, () => {
      assert.equal(parseRow(line)?.amount ?? null, null, 'an identifier was filed as an amount');
    });
  }

  test('the date is never the amount, in a delimited row', () => {
    // The bug this module was written to fix: the first number on the line was
    // the amount, so every dated row took the year.
    const row = parseRow('2026-09-01,FOODPANDA ORDER,DEBIT');
    assert.equal(row?.date, '2026-09-01');
    assert.equal(row?.amount ?? null, null);
  });

  test('the date is never the amount, in a plain-text row', () => {
    const row = parseRow('2026-09-01 250.00 Foodpanda');
    assert.equal(row?.date, '2026-09-01');
    assert.equal(row?.amount, 250);
  });

  test('an identifier column is not preferred over the amount column', () => {
    // A row number and a numeric TrxID are both whole numbers in their own
    // field, so the field rule has to be "last money-shaped field wins", not
    // "first number found". Either identifier may appear, and the amount column
    // may come after or before the identifier column.
    const rows: [line: string, amount: number][] = [
      ['5,2026-09-02,FOODPANDA ORDER,580,DEBIT', 580],
      ['2026-09-02,938261,FOODPANDA ORDER,580,DEBIT', 580],
      ['2026-09-02,FOODPANDA ORDER,938261,DEBIT', 938261],
      ['2026-09-02\t938261\tFOODPANDA ORDER\t580\tDEBIT', 580],
    ];
    for (const [line, amount] of rows) {
      assert.equal(parseRow(line)?.amount, amount, `${line} took the wrong field`);
    }
  });

  test('a header line is not a transaction', () => {
    assert.equal(parseRow('date,description,amount,direction'), null);
    assert.equal(parseRow('Date,TrxID,Description,Amount (BDT),Type'), null);
  });

  test('a long delimited row inside the length bound still parses', () => {
    // The 2,000-character bound must not become a way to lose real rows, and the
    // field split adds work to a row that was already at the bound.
    const description = 'Panda'.repeat(100);
    const line = `2026-09-02,${description},580,DEBIT`;
    assert.ok(line.length < 2_000, 'the probe fits inside the bound');

    const started = process.hrtime.bigint();
    const row = parseRow(line);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    assert.equal(row?.amount, 580);
    assert.ok(elapsedMs < 100, `parsing took ${elapsedMs.toFixed(0)} ms`);
  });
});

describe('summary lines are still refused', () => {
  /**
   * `Total Debit: 46,376.00` became a 46,376 expense, which inflates every
   * downstream total. `SUMMARY_LABEL` is matched anywhere on the line, and a
   * field-aware amount search must not become a way around it.
   */
  const lines = [
    'Total Debit: 46,376.00',
    'Total Debit: 46376',
    'Total Debit: 46376',
    'Grand Total,46376',
    'Opening Balance: 46376',
    'Closing Balance,46376',
    'Statement Period,01/09/2026 to 30/09/2026,46376',
  ];

  for (const line of lines) {
    test(`refused: ${line}`, () => {
      assert.equal(parseRow(line), null);
    });
  }
});

describe('a bare integer in a plain-text row is still weak', () => {
  /**
   * The fallback is allowed to be wrong, so it must be visible. `amountWeak`
   * feeds `amountRecognised` in `pipeline.ts` and downgrades the row to
   * NEEDS_REVIEW; a bare integer reported as established would enter the ledger
   * unflagged, which is the failure the signal exists to prevent.
   */
  test('an unmarked bare integer is reported weak and ambiguous', () => {
    const row = parseRow('2026-09-02 580 Foodpanda');
    assert.equal(row?.amount, 580);
    assert.equal(row?.signals.amountWeak, true, 'a bare integer must reach the reviewer');
    assert.equal(row?.signals.amountAmbiguous, true);
  });

  test('a marked amount is still not weak', () => {
    for (const line of ['2026-09-02 580.00 Foodpanda', '2026-09-02 ৳580 Foodpanda', '2026-09-02,580.00,DEBIT']) {
      assert.equal(parseRow(line)?.signals.amountWeak, false, `${line} was downgraded`);
    }
  });
});

describe('a plain-text row is not a delimited row', () => {
  /**
   * The guard on the guard.
   *
   * `01/09/2026 4,500.00 Shwapno` contains a comma, but it separates nothing —
   * it groups digits. Reading it as a field separator splits the price in half
   * and reports 500. Treating a thousands separator as a delimiter is the
   * mirror image of the reported defect, and these three lines come from
   * `plain-text-september.csv`, one of the three fixtures the 95% gate is
   * measured on.
   */
  const rows: [line: string, amount: number][] = [
    ['01/09/2026 4,500.00 Shwapno', 4500],
    ['01/09/2026 1,250.50 Chaldal', 1250.5],
    ['13/09/2026 6,000.00 Rent', 6000],
    ['08/09/2026 5,600.00 Shwapno', 5600],
  ];

  for (const [line, amount] of rows) {
    test(`grouped digits are not a field boundary: ${line}`, () => {
      assert.equal(parseRow(line)?.amount, amount);
    });
  }

  test('a delimited row is recognised by its other delimiters too', () => {
    assert.equal(parseRow('2026-09-02\tFOODPANDA ORDER\t580\tDEBIT')?.amount, 580);
    assert.equal(parseRow('2026-09-02;FOODPANDA ORDER;580;DEBIT')?.amount, 580);
    assert.equal(parseRow('2026-09-02|FOODPANDA ORDER|580|DEBIT')?.amount, 580);
  });
});

describe('the 95% gate is not lowered by the fix', () => {
  /**
   * PRODUCT.md's headline acceptance metric, re-asserted here because this file
   * is the one that changes how a delimited row is read, and the bank fixture is
   * the only delimited one of the three.
   *
   * The threshold is the same 0.95 the gate already requires, not a number
   * chosen to accommodate the new tests. A fix that passes the positive cases
   * above by reading a date or an identifier as money shows up here first.
   */
  const ACCURACY_THRESHOLD = 0.95;

  test('all three fixtures still clear 95%', () => {
    const { fixtures, rows, correct, accuracy } = measureAll();

    assert.ok(fixtures.length >= 3, 'PRODUCT.md measures exactly three fixtures');
    for (const f of fixtures) {
      assert.ok(
        f.accuracy >= ACCURACY_THRESHOLD,
        `${f.file}: ${(f.accuracy * 100).toFixed(1)}% is below the gate\n${f.wrong.slice(0, 6).join('\n')}`,
      );
    }
    assert.ok(
      accuracy >= ACCURACY_THRESHOLD,
      `overall ${(accuracy * 100).toFixed(1)}% (${correct}/${rows}) is below the gate`,
    );
  });

  test('the delimited fixture is read exactly as its reference says', () => {
    // Stronger than the gate on purpose, and only on the fixture the change
    // touches: the bank statement is the one whose rows the field-aware search
    // could re-rank.
    const delimited = measureAll().fixtures.find((f) => f.file === 'bank-statement-september.csv');
    assert.ok(delimited !== undefined, 'the delimited fixture is still measured');
    assert.deepEqual(delimited!.wrong, [], 'no row of the delimited fixture may be wrong');
  });
});