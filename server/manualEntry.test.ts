/**
 * Suite 003 Wave A: manual entry, verified in isolation.
 *
 * No database, no model, no clock. Every timestamp in this file is a literal, so
 * the assertions are reproducible byte for byte.
 */

// Runner shim. The repo gate is `node --import tsx --test` (package.json) while
// the review harness runs vitest, which is not a dependency here. Vitest sets
// process.env.VITEST, so the suite registers with whichever runner hosts it
// instead of silently collecting zero tests under one of them. The specifier is
// held in a variable so `tsc --noEmit` needs no types for the absent runner.
const RUNNER = process.env.VITEST === 'true' ? 'vitest' : 'node:test';
const runner = (await import(RUNNER)) as {
  describe: (name: string, fn: () => void) => void;
  test: (name: string, fn: () => void) => void;
};
const { describe, test } = runner;

import assert from 'node:assert/strict';

import {
  MAX_MANUAL_ENTRY_AMOUNT_BDT,
  MAX_DESCRIPTION_LENGTH,
  normalizeBanglaNumerals,
  normalizeEntryText,
  parseManualAmount,
  parseManualDate,
  validateManualEntry,
  proposeCategory,
  detectDuplicateFlag,
  buildManualTransaction,
  applyManualCorrection,
  removalRecord,
  type ManualEntryErrorCode,
  type ManualEntryInput,
  type ManualCorrectionResult,
  type NormalizedManualEntry,
} from './manualEntry';
import { DEFAULT_CATEGORIES, UNCATEGORIZED_CATEGORY_ID } from './categories';
import {
  calculateCategoryBreakdown,
  calculatePeriodMetrics,
} from './financialEngine';
import { evidenceFor, extractionConfidenceOf, isUserAsserted } from '../src/provenance';
import type { CorrectionRecord, Transaction } from '../src/types';

const TODAY = '2026-09-30';

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn_base',
    user_id: 'acct_test',
    transaction_date: '2026-09-15',
    amount: 1250.5,
    currency: 'BDT',
    direction: 'EXPENSE',
    merchant_name: 'Foodpanda',
    description: 'Lunch order',
    category_id: 'cat_food',
    category_source: 'MERCHANT_RULE',
    status: 'USER_ENTERED',
    provenance: {
      source: 'USER_ASSERTED',
      asserted_at: '2026-09-15T10:00:00.000Z',
      assertion_method: 'MANUAL_ENTRY',
    },
    evidence_ids: [],
    created_at: '2026-09-15T10:00:00.000Z',
    updated_at: '2026-09-15T10:00:00.000Z',
    ...overrides,
  };
}

function entry(overrides: Partial<ManualEntryInput> = {}): ManualEntryInput {
  return {
    transaction_date: '2026-09-15',
    amount: '1250.50',
    direction: 'EXPENSE',
    description: 'Lunch order',
    merchant_name: 'Foodpanda',
    ...overrides,
  };
}

function codesOf(errors: { code: string }[]): string[] {
  return errors.map(error => error.code);
}

function expectCode(input: ManualEntryInput, code: ManualEntryErrorCode): void {
  const result = validateManualEntry(input, { today: TODAY });
  assert.equal(result.ok, false, `expected ${code} to reject`);
  assert.ok(codesOf(result.errors).includes(code), `expected ${code}, got ${codesOf(result.errors).join(',')}`);
}

/** Applies a patch that must be accepted, so tests read as one call. */
function applied(
  row: Transaction,
  patch: Partial<NormalizedManualEntry> & { category_id?: string },
  meta: { userId: string; correctionId: string; now: string },
): { transaction: Transaction; corrections: CorrectionRecord[] } {
  const result = applyManualCorrection(row, patch, meta);
  if (!result.ok) throw new Error(`expected the patch to apply, got ${result.code}`);
  return result;
}

/** Applies a patch that must be rejected, so tests read as one call. */
function rejected(
  row: Transaction,
  patch: Partial<NormalizedManualEntry> & { category_id?: string },
): Extract<ManualCorrectionResult, { ok: false }> {
  const result = applyManualCorrection(row, patch, {
    userId: 'acct_test',
    correctionId: 'cor_x',
    now: '2026-09-30T13:00:00.000Z',
  });
  if (result.ok) throw new Error('expected the patch to be rejected');
  return result;
}

describe('normalizeBanglaNumerals', () => {
  test('folds the Bangla digit block and nothing else', () => {
    assert.equal(normalizeBanglaNumerals('৳১,২৫০.৫০'), '৳1,250.50');
    assert.equal(normalizeBanglaNumerals('১২৩৪৫৬৭৮৯০'), '1234567890');
    assert.equal(normalizeBanglaNumerals('no digits here'), 'no digits here');
  });

  test('is total: empty and non-Bangla inputs keep their shape', () => {
    assert.equal(normalizeBanglaNumerals(''), '');
    assert.equal(normalizeBanglaNumerals('   '), '   ');
    assert.equal(normalizeBanglaNumerals('ABC'), 'ABC');
  });

  test('leaves digits outside U+09E6..U+09EF alone', () => {
    assert.equal(normalizeBanglaNumerals('0123456789'), '0123456789');
    assert.equal(normalizeBanglaNumerals('৳'), '৳');
  });
});

describe('normalizeEntryText', () => {
  test('trims, collapses whitespace, lowercases, and folds numerals', () => {
    assert.equal(normalizeEntryText('  Foodpanda   ORDER  '), 'foodpanda order');
    assert.equal(normalizeEntryText(' ৳১২৫০ '), '৳1250');
    assert.equal(normalizeEntryText(''), '');
  });
});

describe('parseManualAmount', () => {
  test('Bangla numerals and Latin digits reach the same value', () => {
    // Parity is the assertion: every Bangla form equals its Latin twin. The
    // two forms carrying '.50' are 1250.5; the two integer forms are 1250.
    const pairs: [string, string, number][] = [
      ['৳১,২৫০.৫০', '1250.50', 1250.5],
      ['১২৫০', '1250', 1250],
      [' ৳১২৫০ ', ' 1250 ', 1250],
    ];
    for (const [bangla, latin, expected] of pairs) {
      const fromBangla = parseManualAmount(bangla);
      const fromLatin = parseManualAmount(latin);
      assert.ok(fromBangla.ok, `${bangla} should parse`);
      assert.ok(fromLatin.ok, `${latin} should parse`);
      assert.equal(fromBangla.value, expected, `${bangla} should be ${expected}`);
      assert.equal(fromBangla.value, fromLatin.value, `${bangla} and ${latin} must agree`);
    }
  });

  test('accepts a number input', () => {
    const result = parseManualAmount(1250.5);
    assert.ok(result.ok);
    assert.equal(result.value, 1250.5);
  });

  test('rejects each documented amount failure with code and Bengali text', () => {
    const cases: [string | number, ManualEntryErrorCode][] = [
      ['', 'AMOUNT_REQUIRED'],
      ['   ', 'AMOUNT_REQUIRED'],
      ['abc', 'AMOUNT_NOT_A_NUMBER'],
      ['12abc', 'AMOUNT_NOT_A_NUMBER'],
      ['৳১২৫০.৫০১২', 'AMOUNT_TOO_PRECISE'],
      ['১২,৩৪৫,৬৭৮', 'AMOUNT_ABOVE_MAXIMUM'],
      ['0', 'AMOUNT_ZERO'],
      ['0.00', 'AMOUNT_ZERO'],
      ['-125', 'AMOUNT_NEGATIVE'],
      ['-৳৫০', 'AMOUNT_NEGATIVE'],
      ['1250.505', 'AMOUNT_TOO_PRECISE'],
      ['1250.1234', 'AMOUNT_TOO_PRECISE'],
      [MAX_MANUAL_ENTRY_AMOUNT_BDT + 1, 'AMOUNT_ABOVE_MAXIMUM'],
    ];

    for (const [raw, code] of cases) {
      const result = parseManualAmount(raw);
      assert.equal(result.ok, false, `${String(raw)} should fail`);
      if (result.ok) continue;
      assert.equal(result.code, code, `${String(raw)} should be ${code}`);
      assert.ok(result.reason.length > 0, `${code} needs plain English text`);
      assert.ok(/[\u0980-\u09FF]/.test(result.reason_bn), `${code} needs Bengali text`);
    }
  });

  test('rejects over-precision rather than rounding it away', () => {
    const result = parseManualAmount('1250.505');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'AMOUNT_TOO_PRECISE');
  });

  test('accepts the ceiling itself', () => {
    const result = parseManualAmount(MAX_MANUAL_ENTRY_AMOUNT_BDT);
    assert.ok(result.ok);
    assert.equal(result.value, MAX_MANUAL_ENTRY_AMOUNT_BDT);
  });

  test('carries no sign: a leading plus reads as positive', () => {
    const result = parseManualAmount('+1250');
    assert.ok(result.ok);
    assert.equal(result.value, 1250);
  });
});

describe('parseManualDate', () => {
  test('accepts the three documented date forms', () => {
    for (const form of ['2026-09-01', '01/09/2026', '1 Sep 2026', '01 september 2026']) {
      const result = parseManualDate(form, TODAY);
      assert.ok(result.ok, `${form} should parse`);
      assert.equal(result.value, '2026-09-01', `${form} should reassemble to ISO`);
    }
  });

  test('accepts Bangla numerals in a date', () => {
    const result = parseManualDate('০১/০৯/২০২৬', TODAY);
    assert.ok(result.ok);
    assert.equal(result.value, '2026-09-01');
  });

  test('today itself is accepted, the day after is not', () => {
    const sameDay = parseManualDate('2026-09-30', TODAY);
    assert.ok(sameDay.ok);
    const nextDay = parseManualDate('2026-10-01', TODAY);
    assert.equal(nextDay.ok, false);
    if (!nextDay.ok) assert.equal(nextDay.code, 'DATE_IN_FUTURE');
  });

  test('rejects 2026-02-30 and 2026-02-31 without rolling into March', () => {
    for (const form of ['2026-02-30', '2026-02-31', '30/02/2026']) {
      const result = parseManualDate(form, TODAY);
      assert.equal(result.ok, false, `${form} should fail`);
      if (!result.ok) assert.equal(result.code, 'DATE_NOT_RECOGNISED');
    }
  });

  test('accepts 29 February in a leap year', () => {
    const result = parseManualDate('2024-02-29', '2026-09-30');
    assert.ok(result.ok);
    assert.equal(result.value, '2024-02-29');
  });

  test('rejects absent, unknown, and malformed dates with Bengali text', () => {
    const cases: [string, ManualEntryErrorCode][] = [
      ['', 'DATE_REQUIRED'],
      ['   ', 'DATE_REQUIRED'],
      ['not a date', 'DATE_NOT_RECOGNISED'],
      ['2026-13-01', 'DATE_NOT_RECOGNISED'],
      ['2026-09-01-01', 'DATE_NOT_RECOGNISED'],
      ['01 Smarch 2026', 'DATE_NOT_RECOGNISED'],
    ];
    for (const [raw, code] of cases) {
      const result = parseManualDate(raw, TODAY);
      assert.equal(result.ok, false, `${raw} should fail`);
      if (result.ok) continue;
      assert.equal(result.code, code, `${raw} should be ${code}`);
      assert.ok(/[\u0980-\u09FF]/.test(result.reason_bn), `${code} needs Bengali text`);
    }
  });
});

describe('validateManualEntry', () => {
  test('accepts a well-formed row and normalizes it', () => {
    const result = validateManualEntry(entry({ amount: '৳১,২৫০.৫০', transaction_date: '১৫/০৯/২০২৬' }), {
      today: TODAY,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.normalized_input, {
      transaction_date: '2026-09-15',
      amount: 1250.5,
      direction: 'EXPENSE',
      description: 'Lunch order',
      merchant_name: 'Foodpanda',
    });
  });

  test('collects every field error rather than stopping at the first', () => {
    const result = validateManualEntry(
      { transaction_date: '', amount: '0', direction: 'sideways', description: '' },
      { today: TODAY },
    );
    assert.equal(result.ok, false);
    assert.equal(result.normalized_input, null);
    assert.deepEqual(codesOf(result.errors).sort(), [
      'AMOUNT_ZERO',
      'DATE_REQUIRED',
      'DESCRIPTION_REQUIRED',
      'DIRECTION_NOT_RECOGNISED',
    ]);
  });

  test('every rejection carries plain English and Bengali text', () => {
    const result = validateManualEntry(
      { transaction_date: '', amount: '', direction: '', description: '' },
      { today: TODAY },
    );
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 4);
    for (const error of result.errors) {
      assert.ok(error.reason.length > 0, `${error.code} needs English text`);
      assert.ok(/[\u0980-\u09FF]/.test(error.reason_bn), `${error.code} needs Bengali text`);
      assert.ok(
        ['amount', 'transaction_date', 'direction', 'description'].includes(error.field),
        `${error.code} must name a validation field`,
      );
    }
  });

  test('rejects every row of the contract validation table', () => {
    expectCode(entry({ amount: '0' }), 'AMOUNT_ZERO');
    expectCode(entry({ amount: '-500' }), 'AMOUNT_NEGATIVE');
    expectCode(entry({ amount: '10.005' }), 'AMOUNT_TOO_PRECISE');
    expectCode(entry({ transaction_date: '2026-10-05' }), 'DATE_IN_FUTURE');
    expectCode(entry({ amount: '' }), 'AMOUNT_REQUIRED');
    expectCode(entry({ amount: 'twelve' }), 'AMOUNT_NOT_A_NUMBER');
    expectCode(entry({ amount: String(MAX_MANUAL_ENTRY_AMOUNT_BDT + 1) }), 'AMOUNT_ABOVE_MAXIMUM');
    expectCode(entry({ transaction_date: '' }), 'DATE_REQUIRED');
    expectCode(entry({ transaction_date: '2026-02-31' }), 'DATE_NOT_RECOGNISED');
    expectCode(entry({ direction: '' }), 'DIRECTION_NOT_RECOGNISED');
    expectCode(entry({ direction: 'TRANSFER' }), 'DIRECTION_NOT_RECOGNISED');
    expectCode(entry({ description: '' }), 'DESCRIPTION_REQUIRED');
    expectCode(entry({ description: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1) }), 'DESCRIPTION_TOO_LONG');
  });

  test('accepts a description at exactly the limit and Bangla numerals per SC-009', () => {
    const atLimit = validateManualEntry(entry({ description: 'x'.repeat(MAX_DESCRIPTION_LENGTH) }), {
      today: TODAY,
    });
    assert.equal(atLimit.ok, true);

    const bangla = validateManualEntry(
      entry({ amount: '৳১,২৫০.৫০', transaction_date: '১৫/০৯/২০২৬', description: 'দুপুরের খাবার' }),
      { today: TODAY },
    );
    assert.equal(bangla.ok, true);
    assert.equal(bangla.normalized_input?.description, 'দুপুরের খাবার');
  });

  test('accepts only EXPENSE and INCOME, with a leading sign stripped', () => {
    for (const raw of ['EXPENSE', 'expense', '-EXPENSE', '+INCOME', 'Income']) {
      const result = validateManualEntry(entry({ direction: raw }), { today: TODAY });
      assert.equal(result.ok, true, `${raw} should read as a direction`);
    }
    const income = validateManualEntry(entry({ direction: '-INCOME' }), { today: TODAY });
    assert.equal(income.normalized_input?.direction, 'INCOME');
  });

  test('warns without rejecting on a date before the statement period', () => {
    const result = validateManualEntry(entry({ transaction_date: '2026-09-01' }), {
      today: TODAY,
      statement_period: { start: '2026-09-10', end: '2026-09-30' },
    });
    assert.equal(result.ok, true);
    assert.notEqual(result.normalized_input, null);
    assert.deepEqual(codesOf(result.warnings), ['DATE_OUTSIDE_STATEMENT_PERIOD']);
    const warning = result.warnings[0];
    assert.ok(/[\u0980-\u09FF]/.test(warning.reason_bn));
  });

  test('warns without rejecting on a date after the statement period end', () => {
    // The other half of the window: `entered > end` must warn exactly as
    // `entered < start` does, or a late row silently escapes the warning.
    const result = validateManualEntry(entry({ transaction_date: '2026-09-25' }), {
      today: TODAY,
      statement_period: { start: '2026-09-10', end: '2026-09-20' },
    });
    assert.equal(result.ok, true);
    assert.notEqual(result.normalized_input, null);
    assert.deepEqual(codesOf(result.warnings), ['DATE_OUTSIDE_STATEMENT_PERIOD']);
    assert.ok(/[\u0980-\u09FF]/.test(result.warnings[0].reason_bn));
  });

  test('treats the statement period edges as inside, not outside', () => {
    for (const date of ['2026-09-10', '2026-09-15', '2026-09-20']) {
      const result = validateManualEntry(entry({ transaction_date: date }), {
        today: TODAY,
        statement_period: { start: '2026-09-10', end: '2026-09-20' },
      });
      assert.deepEqual(result.warnings, [], `${date} sits on an edge and must stay silent`);
    }
  });

  test('does not mutate its input', () => {
    const raw = entry({ amount: ' ৳১,২৫০.৫০ ', description: '  Lunch   order  ' });
    const snapshot = JSON.stringify(raw);
    validateManualEntry(raw, { today: TODAY });
    assert.equal(JSON.stringify(raw), snapshot);
  });
});

describe('validateManualEntry free-text bounds', () => {
  test('refuses an oversized description on the raw string, before normalization', () => {
    // The cap must be read off the cheap UTF-16 length: a body far past the
    // limit is refused without walking its codepoints, which is what turns a
    // 12 MB body into hundreds of megabytes of allocation.
    const result = validateManualEntry(entry({ description: 'x'.repeat(5_000_000) }), { today: TODAY });
    assert.equal(result.ok, false);
    assert.deepEqual(codesOf(result.errors), ['DESCRIPTION_TOO_LONG']);
    assert.ok(
      result.errors[0].reason.includes(String(MAX_DESCRIPTION_LENGTH)),
      'the reason must name the cap it broke',
    );
  });

  test('refuses an oversized Bangla description, which is the expensive shape', () => {
    const result = validateManualEntry(entry({ description: 'দুপুর'.repeat(500_000) }), { today: TODAY });
    assert.equal(result.ok, false);
    assert.deepEqual(codesOf(result.errors), ['DESCRIPTION_TOO_LONG']);
  });

  test('rejects a merchant name that is present but blank', () => {
    expectCode(entry({ merchant_name: '' }), 'MERCHANT_REQUIRED');
    expectCode(entry({ merchant_name: '   ' }), 'MERCHANT_REQUIRED');
  });

  test('rejects a merchant name past the free-text cap and accepts it at the cap', () => {
    expectCode(entry({ merchant_name: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1) }), 'MERCHANT_TOO_LONG');
    const atCap = validateManualEntry(entry({ merchant_name: 'x'.repeat(MAX_DESCRIPTION_LENGTH) }), {
      today: TODAY,
    });
    assert.equal(atCap.ok, true);
    assert.equal(atCap.normalized_input?.merchant_name.length, MAX_DESCRIPTION_LENGTH);
  });

  test('treats an omitted merchant field as absence, not as an error', () => {
    const result = validateManualEntry(
      { transaction_date: '2026-09-15', amount: '1250.50', direction: 'EXPENSE', description: 'Lunch order' },
      { today: TODAY },
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.normalized_input?.merchant_name, '');
  });

  test('every free-text rejection is written in both languages and blames nobody', () => {
    const results = [
      validateManualEntry(entry({ description: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1) }), { today: TODAY }),
      validateManualEntry(entry({ merchant_name: '' }), { today: TODAY }),
      validateManualEntry(entry({ merchant_name: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1) }), { today: TODAY }),
    ];
    for (const result of results) {
      for (const error of result.errors) {
        assert.ok(error.reason.length > 0, `${error.code} needs English text`);
        assert.ok(/[\u0980-\u09FF]/.test(error.reason_bn), `${error.code} needs Bengali text`);
        assert.ok(!/\b(you|your|invalid|wrong)\b/i.test(error.reason), `${error.code} must not accuse anyone`);
      }
    }
  });
});

describe('proposeCategory', () => {
  test('matches a Latin merchant rule', () => {
    const proposal = proposeCategory('Foodpanda order 4321');
    assert.equal(proposal.category_id, 'cat_food');
    assert.equal(proposal.canonical_merchant, 'Foodpanda');
    assert.equal(proposal.source, 'MERCHANT_RULE');
    assert.equal(proposal.justification, 'RULE_MATCH');
    assert.equal(typeof proposal.matched_rule_index, 'number');
    assert.ok(proposal.basis.length > 0);
  });

  test('matches a Bengali merchant through the same rule index', () => {
    const proposal = proposeCategory('ফুডপান্ডা');
    assert.equal(proposal.category_id, 'cat_food');
    assert.equal(proposal.canonical_merchant, 'Foodpanda');
    assert.equal(proposal.justification, 'RULE_MATCH');
  });

  test('returns the sentinel on a miss, never cat_other', () => {
    const proposal = proposeCategory('কোনো অচেনা দোকান');
    assert.equal(proposal.category_id, UNCATEGORIZED_CATEGORY_ID);
    assert.equal(proposal.canonical_merchant, '');
    assert.equal(proposal.source, 'UNCATEGORIZED');
    assert.equal(proposal.matched_rule_index, null);
    assert.equal(proposal.justification, 'NO_RULE_MATCH');
    assert.notEqual(proposal.category_id, 'cat_other');
  });

  test('first match wins and honours an injected rule list', () => {
    const rules = [
      { pattern: /ACME/i, canonicalName: 'Acme', categoryId: 'cat_shopping' },
      { pattern: /ACME/i, canonicalName: 'Acme Two', categoryId: 'cat_other' },
    ];
    const proposal = proposeCategory('acme', rules);
    assert.equal(proposal.matched_rule_index, 0);
    assert.equal(proposal.category_id, 'cat_shopping');
  });
});

describe('buildManualTransaction', () => {
  const proposal = proposeCategory('Foodpanda');
  const built = buildManualTransaction({
    entry: {
      transaction_date: '2026-09-15',
      amount: 1250.5,
      direction: 'EXPENSE',
      description: 'Lunch order',
      merchant_name: 'Foodpanda',
    },
    proposal,
    userId: 'acct_test',
    id: 'txn_manual_1',
    now: '2026-09-30T12:00:00.000Z',
  });

  test('records the row as user-asserted with no confidence', () => {
    assert.equal(built.provenance.source, 'USER_ASSERTED');
    assert.equal(built.provenance.source === 'USER_ASSERTED' && built.provenance.assertion_method, 'MANUAL_ENTRY');
    // The runtime enforcement of FR-005/SC-004, not the type: these selectors
    // are the only sanctioned way the UI may read confidence and evidence.
    assert.equal(isUserAsserted(built), true);
    assert.equal(extractionConfidenceOf(built), null);
    assert.deepEqual(evidenceFor(built), []);
  });

  test('carries no evidence rows to cite (FR-018)', () => {
    assert.deepEqual(built.evidence_ids, []);
    assert.deepEqual(evidenceFor(built), []);
  });

  test('is USER_ENTERED, not NEEDS_REVIEW', () => {
    assert.equal(built.status, 'USER_ENTERED');
    assert.equal(built.is_duplicate_candidate, undefined);
  });

  test('takes its category from the proposal', () => {
    assert.equal(built.category_id, 'cat_food');
    assert.equal(built.category_source, 'MERCHANT_RULE');
    assert.equal(built.currency, 'BDT');
    assert.equal(built.user_id, 'acct_test');
    assert.equal(built.updated_at, '2026-09-30T12:00:00.000Z');
  });

  test('a rule match stores the canonical merchant, not the typed alias', () => {
    // `category_source: 'MERCHANT_RULE'` claims the system named the merchant,
    // so the row must hold the name the rule matched, or the claim is false.
    const typed = entry({ merchant_name: 'ফুডপান্ডা' });
    const normalized = validateManualEntry(typed, { today: TODAY });
    assert.equal(normalized.ok, true);
    const row = buildManualTransaction({
      entry: normalized.normalized_input!,
      proposal: proposeCategory('ফুডপান্ডা'),
      userId: 'acct_test',
      id: 'txn_manual_bangla',
      now: '2026-09-30T12:00:00.000Z',
    });
    assert.equal(row.category_source, 'MERCHANT_RULE');
    assert.equal(row.merchant_name, 'Foodpanda');
    assert.notEqual(row.merchant_name, 'ফুডপান্ডা');
  });

  test('without a rule match the typed merchant survives, then the description', () => {
    const miss = proposeCategory('কোনো অচেনা দোকান');
    assert.equal(miss.canonical_merchant, '');

    const withMerchant = buildManualTransaction({
      entry: {
        transaction_date: '2026-09-15',
        amount: 1250.5,
        direction: 'EXPENSE',
        description: 'Lunch order',
        merchant_name: 'Corner Store',
      },
      proposal: miss,
      userId: 'acct_test',
      id: 'txn_manual_corner',
      now: '2026-09-30T12:00:00.000Z',
    });
    assert.equal(withMerchant.merchant_name, 'Corner Store');
    assert.equal(withMerchant.category_source, 'UNCATEGORIZED');

    const withoutMerchant = buildManualTransaction({
      entry: {
        transaction_date: '2026-09-15',
        amount: 1250.5,
        direction: 'EXPENSE',
        description: 'Lunch order',
        merchant_name: '',
      },
      proposal: miss,
      userId: 'acct_test',
      id: 'txn_manual_bare',
      now: '2026-09-30T12:00:00.000Z',
    });
    assert.equal(withoutMerchant.merchant_name, 'Lunch order');
  });
});

describe('engine round-trip (V7)', () => {
  // An entered row is not a second class of figure: it must move the engine
  // totals exactly like an extracted row of the same amount (FR-004, FR-005).
  const manualRow = buildManualTransaction({
    entry: {
      transaction_date: '2026-09-15',
      amount: 1250.5,
      direction: 'EXPENSE',
      description: 'দুপুরের খাবার',
      merchant_name: 'ফুডপান্ডা',
    },
    proposal: proposeCategory('কোনো অচেনা দোকান'),
    userId: 'acct_test',
    id: 'txn_manual_engine',
    now: '2026-09-30T12:00:00.000Z',
  });

  const extractedRow = tx({
    id: 'txn_extracted_engine',
    category_id: 'cat_food',
    status: 'CONFIRMED',
    provenance: {
      source: 'EXTRACTED',
      extraction_model: 'gemini-test',
      extraction_version: 'v1',
      extraction_confidence: 0.93,
    },
    evidence_ids: ['ev_1'],
  });

  test('an entered row moves total_expenses identically to an extracted row', () => {
    assert.equal(manualRow.category_id, UNCATEGORIZED_CATEGORY_ID);
    const manualMetrics = calculatePeriodMetrics([manualRow]);
    const extractedMetrics = calculatePeriodMetrics([extractedRow]);
    assert.equal(manualMetrics.total_expenses, 1250.5);
    assert.equal(manualMetrics.total_expenses, extractedMetrics.total_expenses);
    assert.equal(manualMetrics.count, extractedMetrics.count);
    assert.equal(manualMetrics.net_savings, extractedMetrics.net_savings);
  });

  test('an entered row appears in the breakdown under the uncategorized sentinel', () => {
    const breakdown = calculateCategoryBreakdown([manualRow]);
    assert.deepEqual(breakdown, [
      { category_id: UNCATEGORIZED_CATEGORY_ID, amount: 1250.5, count: 1, pct: 100 },
    ]);
    assert.equal(
      breakdown.some(bucket => bucket.category_id === 'cat_food'),
      false,
      'an entered row must not borrow the category an extracted row would carry',
    );
  });

  test('the two rows in one set still sum to the headline total', () => {
    const breakdown = calculateCategoryBreakdown([manualRow, extractedRow]);
    const total = calculatePeriodMetrics([manualRow, extractedRow]).total_expenses;
    const summed = breakdown.reduce((acc, bucket) => acc + bucket.amount, 0);
    assert.equal(summed, total);
    assert.equal(total, 2501);
  });
});

describe('src/provenance selectors (FR-005, SC-004)', () => {
  test('a USER_ASSERTED row has no confidence and no evidence', () => {
    const row = tx();
    assert.equal(isUserAsserted(row), true);
    assert.equal(extractionConfidenceOf(row), null);
    assert.deepEqual(evidenceFor(row), []);
  });

  test('an ENGINE_DERIVED row has no extraction confidence and no evidence', () => {
    const row = tx({
      provenance: { source: 'ENGINE_DERIVED', calculation_version: 'v7', derivation: 'recurring' },
    });
    assert.equal(isUserAsserted(row), false);
    assert.equal(extractionConfidenceOf(row), null);
    assert.deepEqual(evidenceFor(row), []);
  });

  test('an EXTRACTED row reads its own confidence even with no evidence ids', () => {
    const row = tx({
      provenance: {
        source: 'EXTRACTED',
        extraction_model: 'gemini-test',
        extraction_version: 'v1',
        extraction_confidence: 0.87,
      },
      evidence_ids: [],
    });
    assert.equal(isUserAsserted(row), false);
    assert.equal(extractionConfidenceOf(row), 0.87);
    assert.deepEqual(evidenceFor(row), [], 'no evidence ids means no evidence rows to cite');
  });

  test('an EXTRACTED row with evidence returns exactly those ids', () => {
    const row = tx({
      provenance: {
        source: 'EXTRACTED',
        extraction_model: 'gemini-test',
        extraction_version: 'v1',
        extraction_confidence: 1,
      },
      evidence_ids: ['ev_1', 'ev_2'],
    });
    assert.deepEqual(evidenceFor(row), ['ev_1', 'ev_2']);
  });

  test('a zero confidence is a real value, not an absent one', () => {
    // null means "the row has no extraction confidence at all"; 0 means the
    // extractor reported nothing usable. Collapsing the two would print a
    // fabricated figure.
    const row = tx({
      provenance: {
        source: 'EXTRACTED',
        extraction_model: 'gemini-test',
        extraction_version: 'v1',
        extraction_confidence: 0,
      },
    });
    assert.equal(extractionConfidenceOf(row), 0);
    assert.notEqual(extractionConfidenceOf(row), null);
  });
});

describe('applyManualCorrection', () => {
  const META = { userId: 'acct_test', correctionId: 'cor_1', now: '2026-09-30T13:00:00.000Z' };

  test('retains the prior value verbatim', () => {
    const { transaction, corrections } = applied(tx(), { amount: 999.25 }, META);
    assert.equal(corrections.length, 1);
    const [record] = corrections;
    assert.equal(record.previous_value, '1250.5');
    assert.equal(record.current_value, '999.25');
    assert.equal(record.field, 'amount');
    assert.equal(record.kind, 'USER_CORRECTION');
    assert.equal(record.corrected_at, '2026-09-30T13:00:00.000Z');
    assert.equal(record.transaction_id, 'txn_base');
    assert.equal(record.user_id, 'acct_test');
    assert.equal(transaction.amount, 999.25);
    assert.equal(transaction.updated_at, '2026-09-30T13:00:00.000Z');
  });

  test('does not mutate the original row', () => {
    const original = tx();
    const snapshot = JSON.stringify(original);
    applied(original, { description: 'Dinner order' }, { ...META, correctionId: 'cor_2' });
    assert.equal(JSON.stringify(original), snapshot);
  });

  test('a category change is a category correction and moves the source', () => {
    const { transaction, corrections } = applied(tx(), { category_id: 'cat_groceries' }, {
      ...META,
      correctionId: 'cor_3',
    });
    assert.equal(corrections.length, 1);
    assert.equal(corrections[0].kind, 'USER_CATEGORY_CORRECTION');
    assert.equal(corrections[0].field, 'category_id');
    assert.equal(corrections[0].previous_value, 'cat_food');
    assert.equal(corrections[0].current_value, 'cat_groceries');
    assert.equal(transaction.category_source, 'USER_CORRECTION');
  });

  test('records every changed field, in CORRECTION_ORDER, so no prior value is lost', () => {
    const { transaction, corrections } = applied(
      tx(),
      { description: 'Dinner order', amount: 900.25, transaction_date: '2026-09-16' },
      META,
    );

    assert.deepEqual(
      corrections.map(record => record.field),
      ['transaction_date', 'amount', 'description'],
      'CORRECTION_ORDER is the ordering authority',
    );
    assert.deepEqual(
      corrections.map(record => [record.previous_value, record.current_value]),
      [
        ['2026-09-15', '2026-09-16'],
        ['1250.5', '900.25'],
        ['Lunch order', 'Dinner order'],
      ],
    );
    assert.equal(new Set(corrections.map(record => record.id)).size, 3, 'ids must be distinct');
    for (const record of corrections) {
      assert.equal(record.transaction_id, 'txn_base');
      assert.equal(record.user_id, 'acct_test');
      assert.equal(record.corrected_at, META.now);
      assert.equal(record.kind, 'USER_CORRECTION');
    }

    // The row and the audit trail must agree on every change, or one of them
    // is telling the user something the other denies.
    assert.equal(transaction.transaction_date, '2026-09-16');
    assert.equal(transaction.amount, 900.25);
    assert.equal(transaction.description, 'Dinner order');
  });

  test('a mixed patch records the category change as a category correction', () => {
    const { corrections } = applied(
      tx(),
      { category_id: 'cat_transport', merchant_name: 'Uber BD' },
      { ...META, correctionId: 'cor_mixed' },
    );
    assert.deepEqual(corrections.map(record => record.field), ['merchant_name', 'category_id']);
    assert.deepEqual(corrections.map(record => record.kind), [
      'USER_CORRECTION',
      'USER_CATEGORY_CORRECTION',
    ]);
  });

  test('an empty patch records nothing and leaves updated_at alone', () => {
    const original = tx();
    const { transaction, corrections } = applied(original, {}, { ...META, correctionId: 'cor_empty' });
    assert.deepEqual(corrections, [], 'nothing changed, so nothing is recorded');
    assert.equal(
      transaction.updated_at,
      original.updated_at,
      'stamping updated_at would assert a change that did not happen',
    );
    assert.equal(transaction.amount, original.amount);
    assert.equal(transaction.category_source, original.category_source);
  });

  test('a patch that writes the value already stored records nothing', () => {
    const original = tx();
    const { transaction, corrections } = applied(original, { amount: 1250.5, description: 'Lunch order' }, {
      ...META,
      correctionId: 'cor_same',
    });
    assert.deepEqual(corrections, []);
    assert.equal(transaction.updated_at, original.updated_at);
  });

  test('rounds a corrected amount through the engine authority', () => {
    // A patch amount is a bare number, so over-precision can arrive where the
    // parse path would have rejected it. roundMoney is the only rounding rule.
    const { transaction, corrections } = applied(tx(), { amount: 12.3456 }, {
      ...META,
      correctionId: 'cor_round',
    });
    assert.equal(transaction.amount, 12.35);
    assert.equal(corrections[0].current_value, '12.35');
    assert.equal(corrections[0].previous_value, '1250.5');
  });

  test('rejects NaN and both infinities instead of storing them', () => {
    assert.equal(rejected(tx(), { amount: Number.NaN }).code, 'AMOUNT_NOT_A_NUMBER');
    assert.equal(rejected(tx(), { amount: Number.POSITIVE_INFINITY }).code, 'AMOUNT_ABOVE_MAXIMUM');
    assert.equal(rejected(tx(), { amount: Number.NEGATIVE_INFINITY }).code, 'AMOUNT_NEGATIVE');
  });

  test('rejects a category id outside the categories this product holds', () => {
    for (const categoryId of ['cat_not_a_thing', '__proto__', 'constructor', 'toString', 'CATEGORY_ID']) {
      const rejection = rejected(tx(), { category_id: categoryId });
      assert.equal(rejection.code, 'CATEGORY_NOT_RECOGNISED', `${categoryId} must not be storable`);
      assert.equal(rejection.field, 'category_id');
    }
    assert.ok(/[\u0980-\u09FF]/.test(rejected(tx(), { category_id: '__proto__' }).reason_bn));
  });

  test('accepts every real category id, the sentinel included', () => {
    for (const category of DEFAULT_CATEGORIES) {
      const { corrections } = applied(tx({ category_id: category.id }), { category_id: category.id }, {
        ...META,
        correctionId: `cor_${category.id}`,
      });
      assert.deepEqual(corrections, [], `${category.id} is the same value, so nothing changed`);
    }
    const moved = applied(tx(), { category_id: UNCATEGORIZED_CATEGORY_ID }, {
      ...META,
      correctionId: 'cor_sentinel',
    });
    assert.equal(moved.corrections.length, 1);
    assert.equal(moved.transaction.category_id, UNCATEGORIZED_CATEGORY_ID);
  });

  test('rejects a blank or oversized merchant name in a patch', () => {
    assert.equal(rejected(tx(), { merchant_name: '' }).code, 'MERCHANT_REQUIRED');
    assert.equal(rejected(tx(), { merchant_name: '   ' }).code, 'MERCHANT_REQUIRED');
    assert.equal(
      rejected(tx(), { merchant_name: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1) }).code,
      'MERCHANT_TOO_LONG',
    );
    assert.equal(rejected(tx(), { merchant_name: '' }).field, 'merchant_name');
  });

  test('accepts a merchant name at the free-text cap', () => {
    const merchant = 'x'.repeat(MAX_DESCRIPTION_LENGTH);
    const { transaction, corrections } = applied(tx(), { merchant_name: merchant }, {
      ...META,
      correctionId: 'cor_merchant_cap',
    });
    assert.equal(transaction.merchant_name, merchant);
    assert.equal(corrections.length, 1);
    assert.equal(corrections[0].field, 'merchant_name');
  });

  test('a rejected patch changes neither the row nor the history', () => {
    const original = tx();
    const snapshot = JSON.stringify(original);
    rejected(original, { amount: Number.NaN });
    rejected(original, { category_id: '__proto__' });
    assert.equal(JSON.stringify(original), snapshot);
  });
});

describe('removalRecord', () => {
  test('records a removal without deleting anything', () => {
    const original = tx();
    const snapshot = JSON.stringify(original);
    const record = removalRecord(original, {
      userId: 'acct_test',
      correctionId: 'cor_4',
      now: '2026-09-30T14:00:00.000Z',
    });
    assert.equal(record.kind, 'USER_DELETION');
    assert.equal(record.current_value, '');
    assert.equal(record.previous_value, 'Lunch order');
    assert.equal(record.transaction_id, 'txn_base');
    assert.equal(record.user_id, 'acct_test');
    assert.equal(JSON.stringify(original), snapshot);
  });
});

describe('detectDuplicateFlag', () => {
  const candidate = tx({ id: 'txn_new', updated_at: '2026-09-30T12:00:00.000Z' });

  test('flags EXACT_TEXT on identical text, amount, direction, and day', () => {
    const flag = detectDuplicateFlag(candidate, [tx({ id: 'txn_old' })]);
    assert.ok(flag);
    assert.equal(flag.existing_transaction_id, 'txn_old');
    assert.equal(flag.transaction_id, 'txn_new');
    assert.equal(flag.tier, 'EXACT_TEXT');
    assert.equal(flag.day_delta, 0);
    assert.equal(flag.amount_delta_bdt, 0);
    assert.ok(flag.matched_fields.includes('description'));
    assert.ok(flag.matched_fields.includes('merchant_name'));
    assert.equal(flag.flagged_at, '2026-09-30T12:00:00.000Z');
  });

  test('flags SAME_MERCHANT_SAME_TICKET when only the merchant matches', () => {
    const flag = detectDuplicateFlag(candidate, [
      tx({ id: 'txn_old', description: 'A completely different note' }),
    ]);
    assert.ok(flag);
    assert.equal(flag.tier, 'SAME_MERCHANT_SAME_TICKET');
    assert.ok(flag.matched_fields.includes('merchant_name'));
    assert.equal(flag.matched_fields.includes('description'), false);
  });

  test('anchors on the lowest created_at, tie-broken by lexicographic id', () => {
    const flag = detectDuplicateFlag(candidate, [
      tx({ id: 'txn_zzz', created_at: '2026-09-20T00:00:00.000Z' }),
      tx({ id: 'txn_bbb', created_at: '2026-09-10T00:00:00.000Z' }),
      tx({ id: 'txn_aaa', created_at: '2026-09-10T00:00:00.000Z' }),
    ]);
    assert.ok(flag);
    assert.equal(flag.existing_transaction_id, 'txn_aaa');
  });

  test('a row already flagged is still an anchor, so a chain resolves to the original', () => {
    const flag = detectDuplicateFlag(candidate, [
      tx({ id: 'txn_chained', is_duplicate_candidate: true, duplicate_of_id: 'txn_older' }),
    ]);
    assert.ok(flag);
    assert.equal(flag.existing_transaction_id, 'txn_chained');
  });

  test('stays silent on a different amount', () => {
    assert.equal(detectDuplicateFlag(candidate, [tx({ id: 'txn_old', amount: 1250.75 })]), null);
  });

  test('stays silent on a different direction', () => {
    assert.equal(detectDuplicateFlag(candidate, [tx({ id: 'txn_old', direction: 'INCOME' })]), null);
  });

  test('stays silent on a date two days out', () => {
    assert.equal(detectDuplicateFlag(candidate, [tx({ id: 'txn_old', transaction_date: '2026-09-13' })]), null);
  });

  test('tolerates one poisha of amount and one calendar day of drift', () => {
    const onePoisha = detectDuplicateFlag(candidate, [tx({ id: 'txn_old', amount: 1250.51 })]);
    assert.ok(onePoisha);
    assert.equal(onePoisha.amount_delta_bdt, 0.01);

    const oneDay = detectDuplicateFlag(candidate, [tx({ id: 'txn_old', transaction_date: '2026-09-16' })]);
    assert.ok(oneDay);
    assert.equal(oneDay.day_delta, 1);
  });

  test('the day window crosses a month boundary without a month of drift', () => {
    const candidateEndOfAugust = tx({ id: 'txn_new', transaction_date: '2026-09-01' });
    const acrossMonth = detectDuplicateFlag(candidateEndOfAugust, [
      tx({ id: 'txn_old', transaction_date: '2026-08-31' }),
    ]);
    assert.ok(acrossMonth, '2026-08-31 and 2026-09-01 are one day apart');
    assert.equal(acrossMonth.day_delta, 1);

    const twoDays = detectDuplicateFlag(candidateEndOfAugust, [
      tx({ id: 'txn_older', transaction_date: '2026-08-30' }),
    ]);
    assert.equal(twoDays, null, '2026-08-30 is two days before 2026-09-01');
  });

  test('the day window crosses a year boundary without a year of drift', () => {
    const candidateNewYear = tx({ id: 'txn_new', transaction_date: '2026-01-01' });
    const acrossYear = detectDuplicateFlag(candidateNewYear, [
      tx({ id: 'txn_old', transaction_date: '2025-12-31' }),
    ]);
    assert.ok(acrossYear, '2025-12-31 and 2026-01-01 are one day apart');
    assert.equal(acrossYear.day_delta, 1);

    const twoDays = detectDuplicateFlag(candidateNewYear, [
      tx({ id: 'txn_older', transaction_date: '2025-12-30' }),
    ]);
    assert.equal(twoDays, null, '2025-12-30 is two days before 2026-01-01');
  });

  test('never matches the candidate against itself', () => {
    assert.equal(detectDuplicateFlag(candidate, [candidate]), null);
  });

  test('stays silent when only a substring of the description matches', () => {
    // Whole-string equality only: containment would call this the same row.
    assert.equal(
      detectDuplicateFlag(
        candidate,
        [tx({ id: 'txn_old', description: 'Lunch order extra rice', merchant_name: 'Alo Alo' })],
      ),
      null,
    );
  });

  test('matches EXACT_TEXT through normalization, not byte equality', () => {
    // Case, doubled whitespace, and Bangla numerals must all normalize away
    // before comparison, or a re-typed row reads as a different purchase.
    const flag = detectDuplicateFlag(
      tx({ id: 'txn_new', description: 'foodpanda order 4321', merchant_name: 'foodpanda' }),
      [tx({ id: 'txn_old', description: '  FOODPANDA   ORDER 4321 ' })],
    );
    assert.ok(flag);
    assert.equal(flag.tier, 'EXACT_TEXT');
    assert.equal(flag.existing_transaction_id, 'txn_old');
    assert.ok(flag.matched_fields.includes('description'));
  });

  test('folds Bangla numerals before comparing descriptions', () => {
    const flag = detectDuplicateFlag(
      tx({ id: 'txn_new', description: 'lunch 4321', merchant_name: 'Alo Alo' }),
      [tx({ id: 'txn_old', description: 'Lunch ৪৩২১' })],
    );
    assert.ok(flag, 'Bangla and Latin digits describe the same ticket');
    assert.equal(flag.tier, 'EXACT_TEXT');
  });

  test('normalizes the merchant too, so a re-typed name still matches', () => {
    const flag = detectDuplicateFlag(
      tx({ id: 'txn_new', description: 'Ride to Banani', merchant_name: 'fp*dhaka' }),
      [tx({ id: 'txn_old', description: 'Ride to Banani 2', merchant_name: '  FP*DHAKA  ' })],
    );
    assert.ok(flag);
    assert.equal(flag.tier, 'SAME_MERCHANT_SAME_TICKET');
    assert.equal(flag.matched_fields.includes('description'), false);
  });

  test('keeps text that only differs by internal spacing apart', () => {
    // 'FP*  DHAKA' and 'FP*dhaka' are not the same name: whitespace collapses,
    // it does not vanish, so containment must not decide this one.
    assert.equal(
      detectDuplicateFlag(
        tx({ id: 'txn_new', description: 'Ride to Banani', merchant_name: 'fp*dhaka' }),
        [tx({ id: 'txn_old', description: 'Ride to Banani 2', merchant_name: 'FP*  DHAKA' })],
      ),
      null,
    );
  });

  test('does not mutate the candidate or the existing rows', () => {
    const existing = [tx({ id: 'txn_old' })];
    const candidateSnapshot = JSON.stringify(candidate);
    const existingSnapshot = JSON.stringify(existing);
    detectDuplicateFlag(candidate, existing);
    assert.equal(JSON.stringify(candidate), candidateSnapshot);
    assert.equal(JSON.stringify(existing), existingSnapshot);
  });
});
