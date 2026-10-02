/**
 * Single-row parsing for delimited and plain-text statements.
 *
 * This exists as a separate module because it is the one place where a wrong
 * number becomes a wrong amount in a user's ledger, and it therefore has to be
 * unit-testable without booting the pipeline, a database, or a model.
 *
 * The bug it replaces: the amount was found with a regex for "the first number
 * on the line", so on `2026-09-01 250.00 Foodpanda` it returned 202 — the year.
 * Every row in a dated statement inherited a wrong amount, and the flat 0.92
 * confidence then presented it as a certain reading. Nothing downstream could
 * catch it, because the engine trusts extracted rows (constitution Principle I).
 *
 * Two rules follow from that and shape everything here:
 *
 *   - A field is reported only when it was genuinely established. Anything
 *     ambiguous returns null rather than a guess, and the caller downgrades the
 *     row to NEEDS_REVIEW.
 *   - Ambiguity is surfaced as a signal, not resolved silently. A date that
 *     could be either 1 September or 9 January is flagged, because filing a row
 *     in the wrong month is the failure that once evicted an entire dashboard.
 */

/** Fields the parser could not establish. A row missing any of these is not safe. */
export interface RowSignals {
  date: boolean;
  amount: boolean;
  merchant: boolean;
  direction: boolean;
  /** The date matched a pattern that does not identify the calendar convention. */
  dateAmbiguous: boolean;
  /** More than one candidate amount of equal standing, so the last was taken. */
  amountAmbiguous: boolean;
  /** The amount token carried a `+` or `-`. */
  amountSigned: boolean;
  /**
   * The amount was a bare integer with nothing marking it as money.
   *
   * Distinct from `amount`, which means the field was established. The value is
   * reported, because dropping real rows is worse than a flagged one, but the
   * row is downgraded for review.
   */
  amountWeak: boolean;
}

export interface ParsedRow {
  /** ISO `YYYY-MM-DD`, or null when no date could be established. */
  date: string | null;
  /** Positive number, or null when no money token could be established. */
  amount: number | null;
  direction: 'INCOME' | 'EXPENSE';
  /**
   * True when no explicit credit or debit marker appeared and the direction came
   * from the statement convention rather than from the row.
   */
  directionInferred: boolean;
  merchant: string;
  /** The whole source line, kept so evidence can quote the truth. */
  raw: string;
  signals: RowSignals;
}

/**
 * The longest line that can be a transaction row.
 *
 * A statement row is a date, an amount, a merchant and a description. The
 * longest realistic one is a few hundred characters.
 *
 * This bound is a denial-of-service fix, not a tidiness rule. The amount and
 * integer patterns below scan a line with quantified groups, and on a line that
 * is megabytes long their backtracking is quadratic. Uploads are accepted up to
 * 25 MB, so a single line of digits was enough to pin the Node event loop for
 * minutes -- one request from one signed-in user freezing the whole process. The
 * line is refused before any pattern runs.
 */
const MAX_ROW_CHARS = 2_000;

const CREDIT_WORDS = /\b(credit|credited|salary|deposit|received|receive|inward|salary\s*credit|refund)\b/i;
const DEBIT_WORDS = /\b(debit|debited|sent|send|withdraw|withdrawal|payment|paid|outward|charge|charged|purchase|shopping)\b/i;

/**
 * Merchant patterns.
 *
 * Keyed by a name the user will recognise. A pattern that never matches is dead
 * weight, so each one corresponds to a merchant that appears in the fixtures.
 */
const MERCHANT_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /foodpanda|\bFP\*|\bFP-/i, name: 'Foodpanda' },
  { pattern: /chaldal/i, name: 'Chaldal' },
  { pattern: /shwapno/i, name: 'Shwapno' },
  { pattern: /uber/i, name: 'Uber' },
  { pattern: /pathao/i, name: 'Pathao' },
  { pattern: /daraz/i, name: 'Daraz' },
  { pattern: /bikroy/i, name: 'Bikroy' },
  { pattern: /apex/i, name: 'Apex' },
  { pattern: /panda/i, name: 'The Daily Star' },
  { pattern: /bksh\b|bkash/i, name: 'bKash' },
  { pattern: /nagad/i, name: 'Nagad' },
  { pattern: /airport\s*express/i, name: 'Airport Express' },
  { pattern: /grameenphone|banglalink|robi|teletalk/i, name: 'Mobile Recharge' },
  { pattern: /electricity|wapda|beri|desco/i, name: 'Electricity Bill' },
  { pattern: /gas\b|bashundhara|danish/i, name: 'Gas Bill' },
  { pattern: /internet| broadband| link\.\s*3/i, name: 'Internet Bill' },
  { pattern: /salary|payroll|monthly\s*salary/i, name: 'Salary' },
  { pattern: /atm\b/i, name: 'ATM Withdrawal' },
  { pattern: /loan|emi|installment/i, name: 'Loan Payment' },
];

/** Tokens that are identifiers or metadata, never merchants. */
const ID_LIKE = /^(trxid|txn|trans|reference|ref|id|no|serial|order|invoice|inv|sl)\b|^\*+$/i;

/**
 * Description words, not merchant names.
 *
 * A statement row routinely begins with what happened rather than who it happened
 * to, so the descriptive words have to come off before the remainder can be read
 * as a counterparty.
 */
const LABEL_WORDS = new Set([
  'payment', 'paid', 'purchase', 'purchase', 'transaction', 'transfer', 'sent',
  'send', 'received', 'receive', 'debit', 'credit', 'deposit', 'withdrawal',
  'withdraw', 'refund', 'charge', 'charged', 'to', 'from', 'at', 'on', 'for',
  'the', 'and', 'via', 'cash', 'bkash', 'nagad', 'card', 'mobile', 'recharge',
]);

/**
 * Statement summary lines: totals, balances, and carry-forwards.
 *
 * These carry a money figure and nothing else, so the amount patterns match them
 * and the row used to be filed as a real transaction. `Total Debit: 46,376.00`
 * became a 46,376 expense, which is the single most damaging way to get
 * extraction wrong: it inflates every downstream total, and because the engine
 * trusts extracted rows it never gets a second look.
 *
 * Matched anywhere on the line, not only at the start. An earlier version anchored
 * it with `^`, so a statement that printed its period on the same line as the
 * total -- `From 01/09/2026 Total Debit: 46,376.00` -- was filed as a 46,376
 * transaction, which is the exact defect this constant exists to prevent.
 *
 * Word boundaries keep a merchant whose name merely contains a keyword safe:
 * `TotalMart` does not match `\btotal\b`. A line that genuinely reads
 * "Total Foodpanda 250.00" is rejected, which loses one row; filing a footer as a
 * 52,000 expense loses the whole account's totals. The error is taken on the side
 * of the missing row.
 */
const SUMMARY_LABEL =
  /\b(grand\s+total|sub\s*-?\s*total|total|b[ea]lance|opening\s+balance|closing\s+balance|carried\s+forward|brought\s+forward|statement\s+period|amount\s+due|total\s+debit|total\s+credit)\b/i;

/**
 * Parses one statement line.
 *
 * Returns a row even when fields are missing, so the caller can decide what to
 * do; only a line with no date and no amount is null, because there is nothing
 * in it to file.
 */
export function parseRow(line: string): ParsedRow | null {
  const raw = line.trim();
  if (!raw) return null;
  if (raw.length > MAX_ROW_CHARS) return null;
  // A summary line is not a transaction. Rejecting it here keeps the totals it
  // reports out of the ledger, which is the only correct place for them.
  if (SUMMARY_LABEL.test(raw)) return null;

  const { date, ambiguous: dateAmbiguous, matched: matchedDate } = extractDate(raw);
  const {
    amount,
    ambiguous: amountAmbiguous,
    weak: amountWeak,
    matched: matchedAmount,
    sign: amountSign,
  } = extractAmount(raw, matchedDate);
  const { direction: explicit, merchant, merchantFound } = extractDescriptor(
    raw,
    matchedDate,
    matchedAmount,
    amountSign,
  );
  // A statement lists debits unless a row is marked as a credit. That is a domain
  // rule about the document, not a reading of this row, so it is applied in one
  // named place and reported through `directionInferred` rather than being left
  // for each caller to reinvent. The previous version returned null here and the
  // pipeline substituted 'EXPENSE', so the guess lived in the caller and nothing
  // recorded that it had been made.
  const direction: 'INCOME' | 'EXPENSE' = explicit ?? 'EXPENSE';

  if (date === null && amount === null) return null;

  return {
    date,
    amount,
    direction,
    directionInferred: explicit === null,
    merchant,
    raw,
    signals: {
      date: date !== null,
      amount: amount !== null,
      merchant: merchantFound,
      direction: direction !== null,
      dateAmbiguous,
      amountAmbiguous,
      amountWeak,
      amountSigned: amountSign !== '',
    },
  };
}

interface DateMatch {
  date: string | null;
  ambiguous: boolean;
  matched: string;
}

const ISO_DATE = /(\d{4})-(\d{2})-(\d{2})/;
const YEAR_FIRST_SLASH = /(\d{4})[\/](\d{2})[\/](\d{2})/;
// Dot-separated year-first. `DAY_FIRST` accepts `.`, so without this a
// `2026.09.02` fell through to it, which matched the substring `26.09.02` and
// filed the row as 2002-09-26 at full confidence.
const YEAR_FIRST_DOT = /(\d{4})[.](\d{2})[.](\d{2})/;
// Day-first, the convention used on Bangladeshi statements. Separators vary.
const DAY_FIRST = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/;

/**
 * Finds the row's date.
 *
 * A day-first date whose first two numbers could both be a valid day is
 * ambiguous: 01/09/2026 is either 1 September or 9 January. It is reported
 * day-first, which is the convention the statements this product accepts use,
 * but flagged so the row is reviewed rather than trusted.
 */
function extractDate(line: string): DateMatch {
  const iso = ISO_DATE.exec(line);
  if (iso) {
    return { date: normalise(iso[1], iso[2], iso[3]), ambiguous: false, matched: iso[0] };
  }

  const yearFirst = YEAR_FIRST_SLASH.exec(line);
  if (yearFirst) {
    return { date: normalise(yearFirst[1], yearFirst[2], yearFirst[3]), ambiguous: false, matched: yearFirst[0] };
  }

  const yearFirstDot = YEAR_FIRST_DOT.exec(line);
  if (yearFirstDot) {
    return {
      date: normalise(yearFirstDot[1], yearFirstDot[2], yearFirstDot[3]),
      ambiguous: false,
      matched: yearFirstDot[0],
    };
  }

  const dayFirst = DAY_FIRST.exec(line);
  if (dayFirst) {
    const first = Number(dayFirst[1]);
    const second = Number(dayFirst[2]);
    const year = expandYear(dayFirst[3]);
    // Both readings are calendar-valid, so the convention cannot be determined
    // from the line itself.
    const ambiguous = first <= 12 && second <= 12;
    return {
      date: normalise(String(year), String(second).padStart(2, '0'), String(first).padStart(2, '0')),
      ambiguous,
      matched: dayFirst[0],
    };
  }

  return { date: null, ambiguous: false, matched: '' };
}

function expandYear(raw: string): string {
  if (raw.length === 4) return raw;
  // Two-digit years in this domain are the 2000s.
  return `20${raw}`;
}

function normalise(year: string, month: string, day: string): string | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!isRealDate(y, m, d)) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

interface AmountMatch {
  amount: number | null;
  ambiguous: boolean;
  weak: boolean;
  matched: string;
}

/**
 * Money tokens, in decreasing order of how much the token asserts it is money.
 *
 *   1. A currency mark. The token says so.
 *   2. Two decimal places. A price, not a count or an ID fragment.
 *   3. A thousands separator. A figure large enough to need grouping.
 *
 * Requiring one of those three is what keeps a date, a TrxID, or a row number
 * from being read as an amount. A bare integer with no other money token on the
 * line is not accepted, because a bare integer is exactly what identifiers are
 * made of.
 *
 * Each pattern captures the sign separately. A leading `-` is a direction signal
 * and must survive: an earlier version filtered on `value > 0`, so `-250.00`
 * matched nothing and the row was dropped, and `-৳250.00` was filed as 250 with
 * the sign discarded. Signed statements are common, and the sign is often the
 * only direction evidence on the line.
 */
/**
 * Money tokens, in decreasing order of how much the token asserts it is money.
 *
 *   1. A currency mark. The token says so.
 *   2. Two decimal places. A price, not a count or an ID fragment.
 *   3. A thousands separator. A figure large enough to need grouping.
 *
 * Requiring one of those three is what keeps a date, a TrxID, or a row number
 * from being read as an amount. A bare integer with no other money token on the
 * line is not accepted, because a bare integer is exactly what identifiers are
 * made of.
 *
 * Every inner quantifier is bounded, and that is a security property rather than
 * tidiness. Pattern 2 was `\d[\d,]*\.\d{2}`, whose unbounded `*` restarts from
 * every offset when the trailing `.\d{2}` fails, which is quadratic in the length
 * of the digit run: a 2,000-character line of digits cost 1.8 ms to parse, and
 * a 24 MB upload of such lines blocked the event loop for 28 seconds in a single
 * request. `MAX_ROW_CHARS` did not prevent this, it only shrank the payload to a
 * size that still hurt. A figure long enough to hit these ceilings is not money.
 */
const MONEY_PATTERNS: { pattern: RegExp; sign: number; digits: number }[] = [
  { pattern: /([+-]?)\s*৳\s*(\d[\d,]{0,14}(?:\.\d{1,2})?)/g, sign: 1, digits: 2 },
  { pattern: /([+-]?)(\d[\d,]{0,14}\.\d{2})/g, sign: 1, digits: 2 },
  { pattern: /([+-]?)(\d{1,3}(?:,\d{3}){1,4})(?!\.\d)/g, sign: 1, digits: 2 },
];

interface AmountMatch {
  amount: number | null;
  ambiguous: boolean;
  weak: boolean;
  /** The exact substring removed from the line, so the residue stays intact. */
  matched: string;
  /** '+' or '-' when the token carried a sign. Empty otherwise. */
  sign: '' | '+' | '-';
}

/**
 * Field separators recognised in a delimited export.
 *
 * Tab, semicolon and pipe are included because they carry no ambiguity at all:
 * they never appear inside a number, so splitting on them can never merge or
 * break a figure. Comma is the hard one and is handled by `splitFields`.
 */
const FIELD_DELIMITERS = [',', '\t', ';', '|'];

/**
 * Splits a line into fields, or returns null when it is not a delimited row.
 *
 * A comma is a field separator only when the line has the shape of a row of
 * columns. `01/09/2026 4,500.00 Shwapno` contains a comma and is not delimited:
 * that comma groups digits. Requiring at least three non-empty fields tells the
 * two apart, because a grouping comma inside a plain-text row splits one figure
 * across two pieces and can never yield three columns.
 *
 * Quoted fields are honoured so that a description containing a comma — very
 * common in a merchant field, since merchants put cities in their names — does
 * not shift every column to its left.
 *
 * This is the fix for two defects at once. `findBareInteger` matched
 * `(?<![\w.:#\/-])(\d{1,7})(?![\w.,:\/-])`, whose trailing lookahead rejects any
 * number followed by a comma, and in a delimited row every field except the
 * last is followed by one: a bare integer amount therefore parsed to nothing and
 * the upload completed with zero rows. The same comma was also read as a
 * thousands separator by `MONEY_PATTERNS`, so `2026-09-02,Foodpanda FP9382,580`
 * filed 382580 at full confidence. Working field by field makes the separator
 * stop being ambiguous.
 */
function splitFields(line: string): string[] | null {
  const delimiter = FIELD_DELIMITERS.find((d) => line.includes(d));
  if (!delimiter) return null;

  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === delimiter && !quoted) {
      fields.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  fields.push(current);

  const nonEmpty = fields.filter((f) => f.trim().length > 0);
  return nonEmpty.length >= 3 ? fields : null;
}

/** A field that is nothing but an optionally signed whole number. */
const BARE_FIELD = /^[+-]?\d{1,7}$/;

/**
 * A field consisting solely of an identifier-label word.
 *
 * Distinct from `ID_LIKE`, which is a prefix match because it has to be when
 * reading a description. Here the whole field must be the word, so that
 * `Order FP9382` — a merchant field ending in an order id — is not mistaken for
 * a column header and the 1500 beside it is not discarded as metadata.
 */
const LABEL_ONLY = /^(trxid|txn|trans|reference|ref|id|no|serial|order|invoice|inv|sl)$/i;

/** An amount-shaped word: a direction column, or a labelled amount column. */
const DIRECTION_FIELD = /^(debit|credit|dr|cr|in|out|income|expense|withdrawal|deposit|payment)s?$/i;

function extractAmount(line: string, dateToken: string): AmountMatch {
  // Remove the date first, so its digits can never be considered as money even
  // if the date happened to be written with decimals. Used only by the
  // whole-line passes below; the field pass splits the original line, because a
  // stripped date leaves two columns where the row had three and the row stops
  // looking delimited at all.
  const withoutDate = removeToken(line, dateToken);
  const fields = splitFields(line);

  // Phases 1 and 2 run first, and only on a line that is actually delimited.
  // They have to precede the whole-line pass because that pass treats a comma as
  // a digit group, which is what produced the merged figures; a field-aware
  // search that ran afterwards would never be reached.
  if (fields) {
    const significant = fields.map((f) => f.trim()).filter((f) => f.length > 0);

    // A direction column is never an amount, in either position.
    const isDirection = (f: string) => DIRECTION_FIELD.test(f);

    // Right to left: in a dated statement the amount follows the identifiers,
    // which is the same rule the whole-line pass already applies.
    for (let i = significant.length - 1; i >= 0; i--) {
      const field = significant[i];
      if (isDirection(field)) continue;
      if (isLabelledIdentifier(significant, i)) continue;

      const marked = matchMoneyPatterns(field);
      if (marked) {
        return {
          ...marked,
          // The whole field, not just the digits. `extractDescriptor` removes the
          // matched substring from the line, and `String.replace` deletes the
          // first textual occurrence: returning `580` from
          // `2026-09-02,FOODPANDA ORDER 580,580,DEBIT` would strip the
          // description's copy and leave the amount in the merchant residue.
          matched: field,
        };
      }
    }

    for (let i = significant.length - 1; i >= 0; i--) {
      const field = significant[i];
      if (isDirection(field)) continue;
      if (isLabelledIdentifier(significant, i)) continue;
      if (!BARE_FIELD.test(field)) continue;

      // The sign expresses direction through `signals.amountSigned`, and the
      // schema requires amount > 0, so the magnitude is what gets filed.
      const value = Math.abs(Number(field));
      // Zero is not an amount. A balance column reading 0 is a balance.
      if (!Number.isFinite(value) || value <= 0) continue;

      // A row number or a numeric TrxID in its own column is an identifier. It
      // is indistinguishable from an amount without the header line, which
      // `parseRow` never sees, so it is reported as weak rather than trusted.
      return {
        amount: Math.round(value * 100) / 100,
        ambiguous: true,
        weak: true,
        matched: field,
        sign: field.startsWith('-') ? '-' : field.startsWith('+') ? '+' : '',
      };
    }
  }

  // Phases 3 and 4: the existing whole-line behaviour, unchanged. They cover
  // plain-text statements and the last field of a delimited row.
  return extractAmountFromLine(withoutDate);
}

/**
 * True when the field is a number its own preceding field names as metadata.
 *
 * `Sl,2` and `Ref,4471` are two columns, not a 2 taka charge and a merchant.
 * `ID_LIKE` already lists the words that mark such a column; this applies that
 * list to the field that follows it, which is the only place the label survives.
 *
 * The preceding field has to be *only* the label. `ID_LIKE` is a prefix match,
 * because that is what it must be when reading a description, so `Order FP9382`
 * also begins with a label word — and that is a merchant field ending in an order
 * id, not a column header. Requiring the whole field to be the label word, or
 * the label word and a colon-separated value, separates the two cases.
 */
function isLabelledIdentifier(fields: string[], index: number): boolean {
  const previous = index > 0 ? fields[index - 1] : '';
  if (!previous) return false;

  const label = previous.includes(':') || previous.includes('=')
    ? previous.split(/[:=]/)[0].trim()
    : previous;

  return LABEL_ONLY.test(label);
}

/** Runs `MONEY_PATTERNS` over one string, right-most match wins. */
function matchMoneyPatterns(text: string): AmountMatch | null {
  for (const { pattern, sign, digits } of MONEY_PATTERNS) {
    const found: { value: number; token: string; sign: string }[] = [];
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const token = m[digits];
      const value = Number(token.replace(/,/g, ''));
      if (Number.isFinite(value) && value > 0) {
        found.push({ value, token: m[0], sign: m[sign] ?? '' });
      }
    }
    if (found.length === 0) continue;

    const chosen = found[found.length - 1];
    return {
      // Always positive. A negative amount is expressed through `direction`, so
      // a sign can never be double-counted; the schema enforces amount > 0.
      amount: Math.round(chosen.value * 100) / 100,
      // Two equally-plausible money tokens means the line is not trustworthy
      // enough to file without review.
      ambiguous: found.length > 1,
      weak: false,
      matched: chosen.token,
      sign: chosen.sign === '-' ? '-' : chosen.sign === '+' ? '+' : '',
    };
  }
  return null;
}

/** The original whole-line amount search, used when the row is not delimited. */
function extractAmountFromLine(withoutDate: string): AmountMatch {
  const marked = matchMoneyPatterns(withoutDate);
  if (marked) return marked;

  // Last resort: a bare integer. Refusing these outright would discard real rows
  // from plain-text statements, which routinely carry no currency mark and no
  // decimals, so the value is reported and flagged instead.
  const bare = findBareInteger(withoutDate);
  if (bare !== null) {
    return {
      amount: bare.value,
      ambiguous: true,
      weak: true,
      matched: bare.matched,
      sign: bare.sign,
    };
  }

  return { amount: null, ambiguous: false, weak: false, matched: '', sign: '' };
}

function findBareInteger(line: string): {
  value: number;
  matched: string;
  sign: '' | '+' | '-';
} | null {
  // The returned `matched` is the substring actually consumed, not the number
  // rebuilt from it. An earlier version returned the value and the caller removed
  // `String(value)` from the line, which deletes the first textual occurrence of
  // that digit string wherever it sits -- including inside a TrxID.
  const STANDALONE = /([+-]?)(?<![\w.:#\/-])(\d{1,7})(?![\w.,:\/-])/g;
  const found: { value: number; matched: string; sign: '' | '+' | '-' }[] = [];
  let m: RegExpExecArray | null;
  while ((m = STANDALONE.exec(line)) !== null) {
    const value = Number(m[2]);
    if (value > 0) {
      found.push({
        value,
        matched: m[0],
        sign: m[1] === '-' ? '-' : m[1] === '+' ? '+' : '',
      });
    }
  }
  if (found.length === 0) return null;
  return found[found.length - 1];
}

interface DescriptorMatch {
  /** The direction the line stated explicitly, or null if it stated none. */
  direction: 'INCOME' | 'EXPENSE' | null;
  merchant: string;
  merchantFound: boolean;
}

/**
 * Reads direction and merchant from what is left of the line.
 *
 * Direction is taken only from an explicit word or sign. "Amount went up" is an
 * interpretation, and an interpretation presented as a recorded direction is a
 * fabricated transaction.
 */
/** Removes a token only when it is actually present. */
function removeToken(line: string, token: string): string {
  return token ? line.replace(token, ' ') : line;
}

function extractDescriptor(
  line: string,
  dateToken: string,
  amountToken: string,
  amountSign: '' | '+' | '-',
): DescriptorMatch {
  // Explicit only. Inference from the statement convention happens once, in
  // parseRow, so there is a single place that knows a direction was assumed.
  const direction = explicitDirection(line, amountSign);

  for (const { pattern, name } of MERCHANT_PATTERNS) {
    if (pattern.test(line)) {
      return { direction, merchant: name, merchantFound: true };
    }
  }

  // No known merchant: take the longest run of letters left over once the date
  // and the amount are removed, so an identifier is not promoted to a merchant.
  // `String.replace('')` is not a no-op: it inserts at index 0. Both tokens can
  // be empty on the paths that never matched, so each removal is guarded.
  const residue = removeToken(removeToken(line, dateToken), amountToken)
    .replace(/[০-৯0-9]/g, ' ');

  const words = residue
    .split(/[^A-Za-z]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !ID_LIKE.test(w));

  // The last leftover run, matching the amount rule. Taking the first named
  // "Payment" on the line "Payment received from Rahat 5,000.00", which is a
  // description, not a merchant. `LABEL_WORDS` removes the description words
  // themselves, and an empty result is reported as unknown rather than guessed.
  const meaningful = words.filter((w) => !LABEL_WORDS.has(w.toLowerCase()));
  return {
    direction,
    merchant: meaningful[meaningful.length - 1] ?? 'Unknown Merchant',
    merchantFound: meaningful.length > 0,
  };
}

/**
 * Reads the direction the row states.
 *
 * An explicit word wins, then an explicit sign, then the amount's own sign. The
 * last of those is the fix for a real defect: `+250.00` in a delimited row used
 * to file as an EXPENSE, because the sign was captured by `extractAmount`,
 * reported through `signals.amountSigned`, and then never consulted here. A
 * signed credit on the wrong side of every total until a human corrected it is
 * worse than an unreadable row.
 *
 * The amount's sign only decides when no word contradicts it. A row reading
 * `DEBIT` with a `+` amount is internally inconsistent, and the stated word is
 * the more specific of the two.
 */
function explicitDirection(line: string, amountSign: '' | '+' | '-' = ''): 'INCOME' | 'EXPENSE' | null {
  const hasSign = /^\s*[+＋]/.test(line) || /\+\s*৳/.test(line);
  const credit = CREDIT_WORDS.test(line);
  const debit = DEBIT_WORDS.test(line);

  if (credit) return 'INCOME';
  if (debit) return 'EXPENSE';
  if (hasSign || amountSign === '+') return 'INCOME';
  if (amountSign === '-') return 'EXPENSE';
  return null;
}
