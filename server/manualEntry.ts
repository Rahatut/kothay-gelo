import type {
  CategoryAssignmentSource,
  CategoryProposal,
  CorrectableTransactionField,
  CorrectionRecord,
  DuplicateFlag,
  DuplicateMatchedField,
  Transaction,
} from '../src/types';
import {
  DEFAULT_CATEGORIES,
  MERCHANT_RULES,
  UNCATEGORIZED_CATEGORY_ID,
  type MerchantRule,
} from './categories';
// Principle I names the engine the single authority for every money figure, so
// rounding lives there and nowhere else. `financialEngine.ts` imports only
// `node:crypto` and `../src/types`: no store, no model, no HTTP, and the one
// `new Date()` in it sits inside `generateDeterministicInsights`, so importing
// it adds no clock to this module's boundary.
import { roundMoney } from './financialEngine';

/**
 * Wave A of feature 003: manual transaction entry as a pure domain module.
 *
 * Every function returns a discriminated result and never throws. Nothing reads
 * the clock, the store, the network, or the environment: `today`, `id`, and `now`
 * are injected, so this module is byte-reproducible under test.
 * See specs/003-manual-transaction-entry/contracts/manual-entry.md.
 */

export type ManualEntryErrorCode =
  | 'AMOUNT_REQUIRED'
  | 'AMOUNT_NOT_A_NUMBER'
  | 'AMOUNT_ZERO'
  | 'AMOUNT_NEGATIVE'
  | 'AMOUNT_TOO_PRECISE'
  | 'AMOUNT_ABOVE_MAXIMUM'
  | 'AMOUNT_TOO_LONG'
  | 'DATE_REQUIRED'
  | 'DATE_NOT_RECOGNISED'
  | 'DATE_IN_FUTURE'
  | 'DATE_TOO_LONG'
  | 'DIRECTION_NOT_RECOGNISED'
  | 'DESCRIPTION_REQUIRED'
  | 'DESCRIPTION_TOO_LONG'
  | 'DESCRIPTION_EMPTY'
  | 'MERCHANT_REQUIRED'
  | 'MERCHANT_TOO_LONG'
  | 'CATEGORY_NOT_RECOGNISED';

export type ManualEntryWarningCode = 'DATE_OUTSIDE_STATEMENT_PERIOD';

export type ManualEntryField =
  | 'transaction_date'
  | 'amount'
  | 'direction'
  | 'description'
  | 'merchant_name';

export interface ManualEntryInput {
  transaction_date: string;
  amount: string | number;
  direction: string;
  description: string;
  merchant_name?: string;
}

export interface NormalizedManualEntry {
  transaction_date: string;
  amount: number;
  direction: 'EXPENSE' | 'INCOME';
  description: string;
  merchant_name: string;
}

export interface ManualEntryError {
  field: ManualEntryField;
  code: ManualEntryErrorCode;
  reason: string;
  reason_bn: string;
}

export interface ManualEntryWarning {
  field: ManualEntryField;
  code: ManualEntryWarningCode;
  reason: string;
  reason_bn: string;
}

export interface ManualEntryValidationResult {
  ok: boolean;
  normalized_input: NormalizedManualEntry | null;
  errors: ManualEntryError[];
  warnings: ManualEntryWarning[];
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ManualEntryErrorCode; reason: string; reason_bn: string };

// A sanity bound against float abuse and a typo becoming a total, not a business
// rule. Named so no call site repeats the literal.
export const MAX_MANUAL_ENTRY_AMOUNT_BDT = 10_000_000;

// One limit for every piece of user free text. The merchant name is a second
// free-text field that reaches insight copy and the model prompt, so it obeys
// the same cap rather than introducing a second, looser one nobody would police.
export const MAX_DESCRIPTION_LENGTH = 240;

// One poisha. A looser bound would collide two genuinely different purchases at
// the same price.
const AMOUNT_TOLERANCE_BDT = 0.01;

const DUPLICATE_DAY_WINDOW = 1;

const BANGLA_ZERO_CODE = 0x09e6;

const MS_PER_DAY = 86_400_000;

const MONTH_TOKENS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

interface Messages {
  reason: string;
  reason_bn: string;
}

// Every message is authored in both languages, plain and second-person-free:
// the zero-shaming gate in PRODUCT.md and Principle IX.
const MESSAGES: Record<ManualEntryErrorCode | ManualEntryWarningCode, Messages> = {
  AMOUNT_REQUIRED: {
    reason: 'An amount is needed for this row.',
    reason_bn: 'এই লেনদেনের জন্য একটি পরিমাণ প্রয়োজন।',
  },
  AMOUNT_NOT_A_NUMBER: {
    reason: 'This amount could not be read as a number.',
    reason_bn: 'এই পরিমাণটি সংখ্যা হিসেবে পড়া যায়নি।',
  },
  AMOUNT_ZERO: {
    reason: 'An amount of zero is not a transaction.',
    reason_bn: 'শূন্য পরিমাণ একটি লেনদেন নয়।',
  },
  AMOUNT_NEGATIVE: {
    reason: 'The sign is carried by direction, not by the amount.',
    reason_bn: 'চিহ্নটি পরিমাণে নয়, ধরনের মাধ্যমে ধারণ করা হয়।',
  },
  AMOUNT_TOO_PRECISE: {
    reason: `BDT carries two decimal places, so this amount is more precise than the currency allows.`,
    reason_bn: `বাংলাদেশি টাকায় দুটি দশমিক ঘর থাকে, তাই এই পরিমাণে টাকার চেয়ে বেশি যতিম্নতা আছে।`,
  },
  AMOUNT_ABOVE_MAXIMUM: {
    reason: 'This amount is above the maximum amount for manual entry.',
    reason_bn: 'এই পরিমাণটি প্রবেশের সর্বোচ্চ সীমার চেয়ে বেশি।',
  },
  AMOUNT_TOO_LONG: {
    reason: `An amount stays within ${MAX_DESCRIPTION_LENGTH} characters on purpose.`,
    reason_bn: `পরিমাণ ${MAX_DESCRIPTION_LENGTH} অক্ষরের মধ্যেই রাখা হয়।`,
  },
  DATE_REQUIRED: {
    reason: 'A date is needed for this row.',
    reason_bn: 'এই লেনদেনের জন্য একটি তারিখ প্রয়োজন।',
  },
  DATE_NOT_RECOGNISED: {
    reason: 'This date is not a date the calendar holds.',
    reason_bn: 'এই তারিখটি পুরোনো হিসাবে পাওয়া যায়নি।',
  },
  DATE_IN_FUTURE: {
    reason: 'A transaction cannot have a date later than today.',
    reason_bn: 'আজকের পরের তারিখে কোনো লেনদেন হতে পারে না।',
  },
  DATE_TOO_LONG: {
    reason: `A date stays within ${MAX_DESCRIPTION_LENGTH} characters on purpose.`,
    reason_bn: `তারিখ ${MAX_DESCRIPTION_LENGTH} অক্ষরের মধ্যেই রাখা হয়।`,
  },
  DIRECTION_NOT_RECOGNISED: {
    reason: 'Direction reads as Outgoing or Incoming only.',
    reason_bn: 'ধরন শুধু বহির্গামী অথবা আগমন হিসেবে পড়া যায়।',
  },
  DESCRIPTION_REQUIRED: {
    reason: 'A short description is needed so this row can be recognised later.',
    reason_bn: 'পরে চেনতে একটি ছোট বিবরণ প্রয়োজন।',
  },
  DESCRIPTION_TOO_LONG: {
    reason: `A description stays within ${MAX_DESCRIPTION_LENGTH} characters on purpose.`,
    reason_bn: `বিবরণ ${MAX_DESCRIPTION_LENGTH} অক্ষরের মধ্যেই রাখা হয়।`,
  },
  DESCRIPTION_EMPTY: {
    reason: 'A description cannot be blank.',
    reason_bn: 'বিবরণ খালি রাখা যাবে না।',
  },
  MERCHANT_REQUIRED: {
    reason: 'This merchant field needs a merchant name, or to be left out.',
    reason_bn: 'এই মার্চেন্ট ঘরে মার্চেন্টের নাম প্রয়োজন, অথবা ঘরটি খালি রাখা যেতে পারে।',
  },
  MERCHANT_TOO_LONG: {
    reason: `A merchant name stays within ${MAX_DESCRIPTION_LENGTH} characters on purpose.`,
    reason_bn: `মার্চেন্টের নাম ${MAX_DESCRIPTION_LENGTH} অক্ষরের মধ্যেই রাখা হয়।`,
  },
  CATEGORY_NOT_RECOGNISED: {
    reason: 'This category is not one of the categories available here, so the row keeps the category it already had.',
    reason_bn: 'এই খাতটি এখানে থাকা খাতগুলোর একটি নয়, তাই লেনদেনটির পূর্বের খাতই থাকে।',
  },
  DATE_OUTSIDE_STATEMENT_PERIOD: {
    reason: 'This date sits outside the statement period, so period comparison may not include it.',
    reason_bn: 'এই তারিখটি বিবরণীর সময়সীমার বাইরে, তাই সময়সীমার তুলনায় এটি নাও ধরা পড়তে পারে।',
  },
};

function fail(code: ManualEntryErrorCode): { ok: false; code: ManualEntryErrorCode } & Messages {
  return { ok: false, code, ...MESSAGES[code] };
}

/**
 * Absolute amount difference at whole poisha.
 *
 * Binary floats make `1250.51 - 1250.5` read 0.010000000000047, which would push
 * a genuine one-poisha repeat outside the tolerance the contract sets. Rounding
 * the *delta* to the currency's own precision is a comparison aid only; it never
 * touches a stored amount, and it goes through `roundMoney` like every other
 * figure so no second rounding rule can drift from the first.
 */
function amountDelta(a: number, b: number): number {
  return roundMoney(Math.abs(a - b));
}

/**
 * Folds U+09E6..U+09EF to '0'..'9' and touches nothing else.
 *
 * Total by construction: any string in, same-shape string out, no failure mode.
 * SC-009 holds structurally because every parser folds before it reads.
 */
export function normalizeBanglaNumerals(input: string): string {
  let out = '';
  for (const ch of normalizeBanglaNumeralsCharSafe(input)) {
    const code = ch.codePointAt(0) as number;
    out +=
      code >= BANGLA_ZERO_CODE && code <= BANGLA_ZERO_CODE + 9
        ? String(code - BANGLA_ZERO_CODE)
        : ch;
  }
  return out;
}

function normalizeBanglaNumeralsCharSafe(input: string): string {
  return typeof input === 'string' ? input : String(input ?? '');
}

/**
 * Total comparison/parse normalizer: folds Bangla numerals, trims, collapses
 * internal whitespace, lowercases. Garbage is caught by the parsers, not here,
 * because a throwing normalizer would give normalization a second contract.
 */
export function normalizeEntryText(input: string): string {
  return normalizeBanglaNumerals(normalizeBanglaNumeralsCharSafe(input))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function compactEntryText(input: string): string {
  return normalizeBanglaNumerals(normalizeBanglaNumeralsCharSafe(input)).replace(/\s+/g, ' ').trim();
}

export function parseManualAmount(raw: string | number): ParseResult<number> {
  // The raw length gate prevents a hostile body from reaching the per-codepoint
  // normalizer. Numbers arrive as strings from the parser, so they get the same
  // 240-char cap as every other piece of user free text.
  const rawText = typeof raw === 'number' ? String(raw) : raw;
  if (exceedsFreeTextCap(rawText, MAX_DESCRIPTION_LENGTH)) {
    return fail('AMOUNT_TOO_LONG');
  }
  const text = typeof raw === 'number' ? String(raw) : normalizeEntryText(raw);
  const compact = text.replace(/[৳\s]/g, '').replace(/,/g, '');

  if (compact === '') return fail('AMOUNT_REQUIRED');
  if (!/^[+-]?\d+(\.\d+)?$/.test(compact)) return fail('AMOUNT_NOT_A_NUMBER');

  const negative = compact.startsWith('-');
  const unsigned = compact.replace(/^[+-]/, '');
  const fraction = unsigned.includes('.') ? unsigned.slice(unsigned.indexOf('.') + 1) : '';

  // Over-precision is rejected here, never rounded: rounding would substitute a
  // value the user did not assert. `roundMoney` is then the identity on what
  // survives, and it is still the authority that normalizes -0.
  if (fraction.length > 2) return fail('AMOUNT_TOO_PRECISE');

  const value = Number(unsigned);
  if (!Number.isFinite(value)) return fail('AMOUNT_NOT_A_NUMBER');
  // Zero before the sign. A zero is not a transaction whatever its sign, and the
  // negative message ("the sign is carried by direction") is the wrong explanation
  // for it.
  if (value === 0) return fail('AMOUNT_ZERO');
  if (negative) return fail('AMOUNT_NEGATIVE');
  if (value > MAX_MANUAL_ENTRY_AMOUNT_BDT) return fail('AMOUNT_ABOVE_MAXIMUM');

  return { ok: true, value: roundMoney(value) };
}

function pad2(part: number): string {
  return part < 10 ? `0${part}` : String(part);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function assemble(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseDateParts(text: string): string | null {
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return assemble(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // DD/MM/YYYY, not MM/DD: the repo convention at server/pipeline.ts, and how a
  // Dhaka user reads a bKash statement.
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return assemble(Number(slash[3]), Number(slash[2]), Number(slash[1]));

  const named = text.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (named) {
    const index = MONTH_TOKENS.indexOf(named[2].slice(0, 3));
    if (index === -1) return null;
    return assemble(Number(named[3]), index + 1, Number(named[1]));
  }

  return null;
}

/**
 * Days since epoch from ISO parts, so no host timezone can shift the day.
 * `Date.UTC` parts are used per the contract, never `new Date(iso)`.
 */
function dayStamp(iso: string): number | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const canonical = assemble(Number(match[1]), Number(match[2]), Number(match[3]));
  if (canonical !== iso) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / MS_PER_DAY;
}

export function parseManualDate(raw: string, today: string): ParseResult<string> {
  if (exceedsFreeTextCap(raw, MAX_DESCRIPTION_LENGTH)) return fail('DATE_TOO_LONG');
  const text = normalizeEntryText(raw);
  if (text === '') return fail('DATE_REQUIRED');

  // 2026-02-31 has no ISO reading, so it never rolls forward into March.
  const iso = parseDateParts(text);
  if (!iso) return fail('DATE_NOT_RECOGNISED');

  const entered = dayStamp(iso);
  const todayStamp = dayStamp(normalizeEntryText(today));
  if (entered === null || todayStamp === null) return fail('DATE_NOT_RECOGNISED');
  if (entered > todayStamp) return fail('DATE_IN_FUTURE');

  return { ok: true, value: iso };
}

function normalizeDirection(raw: string): 'EXPENSE' | 'INCOME' | null {
  // A leading sign is stripped here, so it never reaches the amount.
  const text = normalizeEntryText(raw).replace(/^[+\-\s]+/, '');
  if (text === 'expense' || text === 'income') return text.toUpperCase() as 'EXPENSE' | 'INCOME';
  return null;
}

/**
 * True when the text is over the cap, without materializing its codepoints.
 *
 * The cheap `.length` gate is what keeps a hostile body cheap: UTF-16 length is
 * read in constant time and allocates nothing, and normalization only ever
 * shortens a string, so a raw length inside the cap cannot hide a longer
 * codepoint count. The loop then counts by iteration and stops the moment it
 * passes the cap, instead of building the array `Array.from` would.
 */
function exceedsFreeTextCap(text: string, cap: number): boolean {
  if (text.length > cap) return true;
  let seen = 0;
  for (const _ of text) {
    seen += 1;
    if (seen > cap) return true;
  }
  return false;
}

export function validateManualEntry(
  input: ManualEntryInput,
  options: { today: string; statement_period?: { start: string; end: string } },
): ManualEntryValidationResult {
  const errors: ManualEntryError[] = [];
  const warnings: ManualEntryWarning[] = [];

  // All field errors are collected, never just the first, so one pass reports
  // everything that needs another keystroke.
  const amount = parseManualAmount(input.amount);
  if (!amount.ok) {
    errors.push({ field: 'amount', code: amount.code, reason: amount.reason, reason_bn: amount.reason_bn });
  }

  const date = parseManualDate(input.transaction_date, options.today);
  if (!date.ok) {
    errors.push({
      field: 'transaction_date',
      code: date.code,
      reason: date.reason,
      reason_bn: date.reason_bn,
    });
  }

  const direction = normalizeDirection(input.direction);
  if (direction === null) {
    errors.push({
      field: 'direction',
      code: 'DIRECTION_NOT_RECOGNISED',
      ...MESSAGES.DIRECTION_NOT_RECOGNISED,
    });
  }

  // The raw length is read before any per-codepoint work. `compactEntryText`
  // folds the string one codepoint at a time, so a 50 MB body that reached it
  // would be amplified into hundreds of megabytes of allocation before the cap
  // was ever compared.
  const rawDescription = normalizeBanglaNumeralsCharSafe(input.description);
  let description = '';
  if (exceedsFreeTextCap(rawDescription, MAX_DESCRIPTION_LENGTH)) {
    errors.push({
      field: 'description',
      code: 'DESCRIPTION_TOO_LONG',
      ...MESSAGES.DESCRIPTION_TOO_LONG,
    });
  } else {
    description = compactEntryText(rawDescription);
    if (description === '') {
      errors.push({
        field: 'description',
        code: 'DESCRIPTION_REQUIRED',
        ...MESSAGES.DESCRIPTION_REQUIRED,
      });
    } else if (exceedsFreeTextCap(description, MAX_DESCRIPTION_LENGTH)) {
      // Unreachable while normalization only shortens a string, and kept as the
      // second bound it is: the cheap form costs nothing and a future
      // normalizer that grew the text must not slip past the cap.
      errors.push({
        field: 'description',
        code: 'DESCRIPTION_TOO_LONG',
        ...MESSAGES.DESCRIPTION_TOO_LONG,
      });
    }
  }

  // The merchant name is optional, so an absent field is absence and not an
  // error. A field the user did submit must name a merchant or be left out, and
  // it obeys the same free-text cap as the description.
  const rawMerchant =
    input.merchant_name === undefined || input.merchant_name === null
      ? null
      : normalizeBanglaNumeralsCharSafe(input.merchant_name);
  let merchantName = '';
  if (rawMerchant !== null) {
    if (exceedsFreeTextCap(rawMerchant, MAX_DESCRIPTION_LENGTH)) {
      errors.push({
        field: 'merchant_name',
        code: 'MERCHANT_TOO_LONG',
        ...MESSAGES.MERCHANT_TOO_LONG,
      });
    } else {
      merchantName = compactEntryText(rawMerchant);
      if (merchantName === '') {
        errors.push({
          field: 'merchant_name',
          code: 'MERCHANT_REQUIRED',
          ...MESSAGES.MERCHANT_REQUIRED,
        });
      }
    }
  }

  // Warn only: spec.md says a date before any statement period must not break
  // period comparison, not that it must be refused.
  if (date.ok && options.statement_period) {
    const start = dayStamp(normalizeEntryText(options.statement_period.start));
    const end = dayStamp(normalizeEntryText(options.statement_period.end));
    const entered = dayStamp(date.value);
    if (start !== null && end !== null && entered !== null && (entered < start || entered > end)) {
      warnings.push({
        field: 'transaction_date',
        code: 'DATE_OUTSIDE_STATEMENT_PERIOD',
        ...MESSAGES.DATE_OUTSIDE_STATEMENT_PERIOD,
      });
    }
  }

  if (errors.length > 0 || !amount.ok || !date.ok || direction === null) {
    return { ok: false, normalized_input: null, errors, warnings };
  }

  return {
    ok: true,
    normalized_input: {
      transaction_date: date.value,
      amount: amount.value,
      direction,
      description,
      merchant_name: merchantName,
    },
    errors,
    warnings,
  };
}

function categoryNameOf(categoryId: string): string {
  const found = DEFAULT_CATEGORIES.find(category => category.id === categoryId);
  return found ? found.name : categoryId;
}

export function proposeCategory(text: string, rules: MerchantRule[] = MERCHANT_RULES): CategoryProposal {
  const haystack = normalizeEntryText(text);

  // First match wins, the loop at server/db.ts. The rule index is carried so the
  // justification is traceable to a deterministic line of code.
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    rule.pattern.lastIndex = 0;
    if (!rule.pattern.test(haystack)) continue;
    return {
      category_id: rule.categoryId,
      canonical_merchant: rule.canonicalName,
      source: 'MERCHANT_RULE',
      matched_rule_index: index,
      basis: `Matched the merchant rule for ${rule.canonicalName}, so this row reads as ${categoryNameOf(rule.categoryId)}.`,
      justification: 'RULE_MATCH',
    };
  }

  // Never cat_other and never the model: the only non-sentinel return path is a
  // rule match, which is how SC-002 holds structurally (FR-003).
  return {
    category_id: UNCATEGORIZED_CATEGORY_ID,
    canonical_merchant: '',
    source: 'UNCATEGORIZED',
    matched_rule_index: null,
    basis: 'No merchant rule matched this text, so the category stays open until it is confirmed.',
    justification: 'NO_RULE_MATCH',
  };
}

interface DuplicateMatch {
  anchor: Transaction;
  tier: DuplicateFlag['tier'];
  matchedFields: DuplicateMatchedField[];
}

/**
 * Flags the closest existing row, never discards the candidate.
 *
 * `flagged_at` mirrors `candidate.updated_at` because this signature carries no
 * clock: the caller stamps the row and the flag together, so nothing here reads
 * `Date.now()`.
 */
export function detectDuplicateFlag(
  candidate: Transaction,
  existing: Transaction[],
): DuplicateFlag | null {
  const candidateDay = dayStamp(candidate.transaction_date);
  if (candidateDay === null) return null;

  const candidateText = normalizeEntryText(candidate.description);
  const candidateMerchant = normalizeEntryText(candidate.merchant_name);
  const matches: DuplicateMatch[] = [];

  for (const other of existing) {
    if (other.id === candidate.id) continue;
    if (other.direction !== candidate.direction) continue;

    // One poisha of tolerance; a looser bound would collide two real purchases
    // at the same price.
    if (amountDelta(other.amount, candidate.amount) > AMOUNT_TOLERANCE_BDT) continue;

    const otherDay = dayStamp(other.transaction_date);
    if (otherDay === null) continue;
    // Calendar-day delta from ISO parts, never new Date(iso).getTime(), which
    // mixes a bare YYYY-MM-DD with a full ISO posted_at and drifts a day.
    const dayDelta = Math.abs(otherDay - candidateDay);
    if (dayDelta > DUPLICATE_DAY_WINDOW) continue;

    // Whole-string equality after normalization, never substring containment.
    const sameText = normalizeEntryText(other.description) === candidateText;
    const sameMerchant = normalizeEntryText(other.merchant_name) === candidateMerchant;
    if (!sameText && !sameMerchant) continue;

    const matchedFields: DuplicateMatchedField[] = ['amount', 'direction', 'date'];
    if (sameText) matchedFields.push('description');
    if (sameMerchant) matchedFields.push('merchant_name');

    // Every row is a candidate anchor, including one already flagged, so a chain
    // resolves back to the original row.
    matches.push({
      anchor: other,
      tier: sameText ? 'EXACT_TEXT' : 'SAME_MERCHANT_SAME_TICKET',
      matchedFields,
    });
  }

  if (matches.length === 0) return null;

  // Lowest created_at, tie-broken by lexicographic id, so the result does not
  // depend on the order rows arrived in.
  const best = matches.reduce((chosen, current) => {
    if (current.anchor.created_at !== chosen.anchor.created_at) {
      return current.anchor.created_at < chosen.anchor.created_at ? current : chosen;
    }
    return current.anchor.id < chosen.anchor.id ? current : chosen;
  });

  const anchorDay = dayStamp(best.anchor.transaction_date) as number;

  return {
    transaction_id: candidate.id,
    existing_transaction_id: best.anchor.id,
    tier: best.tier,
    matched_fields: best.matchedFields,
    amount_delta_bdt: amountDelta(best.anchor.amount, candidate.amount),
    day_delta: Math.abs(anchorDay - candidateDay),
    flagged_at: candidate.updated_at,
  };
}

/**
 * The only constructor of a user-asserted row.
 *
 * FR-018: no document, no evidence, no confidence. The `USER_ASSERTED` arm of
 * `TransactionProvenance` declares no confidence field at all, so reporting one
 * here is a compile error rather than a code-review argument.
 */
export function buildManualTransaction(args: {
  entry: NormalizedManualEntry;
  proposal: CategoryProposal;
  userId: string;
  id: string;
  now: string;
}): Transaction {
  const { entry, proposal, userId, id, now } = args;
  return {
    id,
    user_id: userId,
    transaction_date: entry.transaction_date,
    amount: entry.amount,
    currency: 'BDT',
    direction: entry.direction,
    // A rule match means the system, not the user, named the merchant, and
    // `category_source: 'MERCHANT_RULE'` says so to every reader of the row, so
    // the canonical name is what gets stored. `canonical_merchant` is '' when no
    // rule matched, which is absence rather than a merchant with no name: the
    // typed text survives, and failing that the description, so a row never
    // carries an empty merchant into insight copy or a prompt.
    merchant_name: proposal.canonical_merchant || entry.merchant_name || entry.description,
    description: entry.description,
    category_id: proposal.category_id,
    category_source: proposal.source as CategoryAssignmentSource,
    status: 'USER_ENTERED',
    provenance: {
      source: 'USER_ASSERTED',
      asserted_at: now,
      assertion_method: 'MANUAL_ENTRY',
    },
    evidence_ids: [],
    created_at: now,
    updated_at: now,
  };
}

const CORRECTION_ORDER: CorrectableTransactionField[] = [
  'transaction_date',
  'amount',
  'direction',
  'description',
  'merchant_name',
  'category_id',
];

function fieldText(tx: Transaction, field: CorrectableTransactionField): string {
  // The audit column is one string type for a date, a BDT amount, and an enum
  // id; the record is read by no total, so a decimal string cannot contaminate a
  // figure (data-model.md §4).
  return field === 'amount' ? String(tx.amount) : String(tx[field]);
}

export interface ManualCorrectionRejection {
  ok: false;
  field: CorrectableTransactionField;
  code: ManualEntryErrorCode;
  reason: string;
  reason_bn: string;
}

export type ManualCorrectionResult =
  | { ok: true; transaction: Transaction; corrections: CorrectionRecord[] }
  | ManualCorrectionRejection;

function reject(
  field: CorrectableTransactionField,
  code: ManualEntryErrorCode,
): ManualCorrectionRejection {
  return { ok: false, field, code, ...MESSAGES[code] };
}

/**
 * Membership in the categories this product actually holds, so an id that names
 * nothing can never drop a row out of every category breakdown.
 */
function isKnownCategoryId(categoryId: unknown): boolean {
  return typeof categoryId === 'string' && DEFAULT_CATEGORIES.some(category => category.id === categoryId);
}

/**
 * Applies a patch and returns every prior value verbatim in the audit records.
 * History is never overwritten in place.
 *
 * One record per changed field, in `CORRECTION_ORDER`, so a three-field patch
 * persists three changes and records all three: the row and the trail must never
 * disagree about what changed. A patch that changes nothing returns an empty
 * `corrections` array and leaves `updated_at` alone, because a stamp on an
 * unchanged row would assert a change that did not happen.
 *
 * Validation is here because a patch carries no parsed result to check: a bare
 * number can be `NaN` (`Number('')` from an empty amount box) and a category id
 * can be any string at all. Authorization belongs to the caller.
 */
export function applyManualCorrection(
  tx: Transaction,
  patch: Partial<NormalizedManualEntry> & { category_id?: string },
  meta: { userId: string; correctionId: string; now: string },
): ManualCorrectionResult {
  // Checked before the row is copied, so a rejected patch leaves both the row
  // and the history exactly as they were. Each branch reuses the code that
  // already describes that defect rather than inventing a new one.
  if (patch.amount !== undefined) {
    if (Number.isNaN(patch.amount)) return reject('amount', 'AMOUNT_NOT_A_NUMBER');
    if (!Number.isFinite(patch.amount)) {
      return patch.amount > 0
        ? reject('amount', 'AMOUNT_ABOVE_MAXIMUM')
        : reject('amount', 'AMOUNT_NEGATIVE');
    }
    if (patch.amount <= 0) return reject('amount', 'AMOUNT_NEGATIVE');
    if (patch.amount > MAX_MANUAL_ENTRY_AMOUNT_BDT) return reject('amount', 'AMOUNT_ABOVE_MAXIMUM');
    // Over-precision is rounded by roundMoney, not rejected — the correction path
    // accepts any finite positive number within the ceiling, and roundMoney is the
    // single rounding authority. The parse path already rejects >2 decimals.
  }
  if (patch.transaction_date !== undefined) {
    const dateRes = parseManualDate(patch.transaction_date, meta.now.split('T')[0]);
    if (!dateRes.ok) return reject('transaction_date', dateRes.code);
  }
  if (patch.direction !== undefined) {
    const dir = normalizeDirection(patch.direction);
    if (!dir) return reject('direction', 'DIRECTION_NOT_RECOGNISED');
  }
  if (patch.description !== undefined) {
    if (exceedsFreeTextCap(patch.description, MAX_DESCRIPTION_LENGTH)) {
      return reject('description', 'DESCRIPTION_TOO_LONG');
    }
    const desc = compactEntryText(patch.description);
    if (desc === '') return reject('description', 'DESCRIPTION_EMPTY');
  }
  if (patch.category_id !== undefined && !isKnownCategoryId(patch.category_id)) {
    return reject('category_id', 'CATEGORY_NOT_RECOGNISED');
  }
  if (patch.merchant_name !== undefined) {
    const merchant = normalizeBanglaNumeralsCharSafe(patch.merchant_name);
    if (exceedsFreeTextCap(merchant, MAX_DESCRIPTION_LENGTH)) {
      return reject('merchant_name', 'MERCHANT_TOO_LONG');
    }
    if (compactEntryText(merchant) === '') return reject('merchant_name', 'MERCHANT_REQUIRED');
  }

  const next: Transaction = { ...tx };

  if (patch.transaction_date !== undefined) next.transaction_date = patch.transaction_date;
  if (patch.amount !== undefined) next.amount = roundMoney(patch.amount);
  if (patch.direction !== undefined) next.direction = normalizeDirection(patch.direction)!;
  if (patch.description !== undefined) next.description = compactEntryText(patch.description);
  if (patch.merchant_name !== undefined) next.merchant_name = compactEntryText(normalizeBanglaNumeralsCharSafe(patch.merchant_name));
  if (patch.category_id !== undefined) next.category_id = patch.category_id;
  if (next.category_id !== tx.category_id) next.category_source = 'USER_CORRECTION';

  const corrections: CorrectionRecord[] = CORRECTION_ORDER.filter(
    field => fieldText(tx, field) !== fieldText(next, field),
  ).map(field => ({
    // Derived from the caller's id and the field, so a multi-field patch gets
    // distinct, traceable records from the one id it was handed.
    id: `${meta.correctionId}-${field}`,
    transaction_id: tx.id,
    user_id: meta.userId,
    field,
    previous_value: fieldText(tx, field),
    current_value: fieldText(next, field),
    kind: field === 'category_id' ? 'USER_CATEGORY_CORRECTION' : 'USER_CORRECTION',
    corrected_at: meta.now,
  }));

  if (corrections.length === 0) {
    return { ok: true, transaction: { ...tx }, corrections };
  }

  next.updated_at = meta.now;
  return { ok: true, transaction: next, corrections };
}

/**
 * Builds the removal audit record. Deletion is the caller's action; this makes
 * the removal inspectable without performing it.
 */
export function removalRecord(
  tx: Transaction,
  meta: { userId: string; correctionId: string; now: string },
): CorrectionRecord {
  return {
    id: meta.correctionId,
    transaction_id: tx.id,
    user_id: meta.userId,
    field: 'description',
    previous_value: tx.description,
    current_value: '',
    kind: 'USER_DELETION',
    corrected_at: meta.now,
  };
}
