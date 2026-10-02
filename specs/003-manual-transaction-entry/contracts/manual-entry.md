# Contracts: 003 Manual Transaction Entry — Wave A module boundary

**Date**: 2026-10-01 | **Plan**: [plan.md](plan.md) | **Data model**: [data-model.md](data-model.md)

## Scope of this document

Wave A is a pure domain module. It has **no HTTP surface**. No route is added in
this wave, `server.ts` is not modified, and the wave introduces no new tool
surface, which Principle II (`.specify/memory/constitution.md:80`) requires.

HTTP contracts for create, correct, and delete belong to Wave B and are not
designed here, because a route written now would scope records to the fiction
identity at `server.ts:31`. See `tasks.md` Phase D.

## Module boundary

`server/manualEntry.ts` imports `../src/types`, `../src/types` type-only,
`./categories`, and `./financialEngine` **for `roundMoney` only**. Nothing else.

The `./financialEngine` exception is a deliberate departure from module purity,
and it is recorded here because it is one:

- **Constitutional Principle I outranks the module-purity rule.** It names
  `server/financialEngine.ts` the single authority for every money figure, and
  `AGENTS.md` §15 requires all money to pass through `roundMoney` and forbids
  rounding at the call site. A local rounding stand-in inside this module would
  be a second authority, which is the failure Principle I exists to prevent.
- The import is narrow and was verified to stay inert: `financialEngine.ts`
  imports only `node:crypto` and `../src/types` — no `./db`, no `./gemini`, no
  `express` — and its single `new Date().toISOString()` sits inside
  `generateDeterministicInsights`, not at module scope, so importing the module
  reads no clock and adds no time-dependence to a module whose whole contract is
  that `today`, `id`, and `now` are injected. `roundMoney` itself is pure.
- Any other use of that import, or a second import from the engine, voids the
  exception and needs a new decision recorded here.

Forbidden imports, each with the principle it would violate:

| Forbidden | Principle | Why |
|---|---|---|
| `./db` | X (`:162`) | A live store instance makes the logic untestable without a seeded database, and a `db` import plus a `db` delegation would form a cycle. |
| `./gemini` | I, IV | The model may not originate a category, an amount, or a date. |
| `express` | — | No HTTP in a pure module. |
| `Date.now()` / `new Date()` | X (`:162`) | The clock is injected so the module is byte-reproducible under test. `server/pipeline.ts` uses `Date.now()` freely; that is a different contract. |

## Exported functions

```ts
normalizeBanglaNumerals(input: string): string
normalizeEntryText(input: string): string
parseManualAmount(raw: string | number): ParseResult<number>
parseManualDate(raw: string, today: string): ParseResult<string>
validateManualEntry(
  input: ManualEntryInput,
  options: { today: string; statement_period?: { start: string; end: string } },
): ManualEntryValidationResult
proposeCategory(text: string, rules?: MerchantRule[]): CategoryProposal
detectDuplicateFlag(candidate: Transaction, existing: Transaction[]): DuplicateFlag | null
buildManualTransaction(args: {
  entry: NormalizedManualEntry;
  proposal: CategoryProposal;
  userId: string;
  id: string;
  now: string;
}): Transaction
applyManualCorrection(
  tx: Transaction,
  patch: Partial<NormalizedManualEntry> & { category_id?: string },
  meta: { userId: string; correctionId: string; now: string },
): ManualCorrectionResult
removalRecord(
  tx: Transaction,
  meta: { userId: string; correctionId: string; now: string },
): CorrectionRecord
```

```ts
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
```

A patch is **not** a parsed value: `patch.amount` is a bare `number` and
`patch.category_id` is a bare `string`, so `applyManualCorrection` validates both
itself. Rejections come back as the failure arm rather than a throw, because this
module returns a discriminated result and never throws.

`corrections` is empty, and `updated_at` is **not** stamped, when the patch
changes nothing. A patch that writes the value already stored is also a no-change
patch. `updated_at` is only stamped when a record exists, so the row never claims
a change the audit trail does not carry.

Record ids are derived as `` `${meta.correctionId}-${field}` ``. One correction id
in, one distinct traceable record per changed field out; the caller does not have
to mint an id per field to keep a multi-field patch auditable.

## Failure modes per function

`normalizeBanglaNumerals` and `normalizeEntryText` are **total**. Any string in,
same-shape string out, with no failure mode by construction. Garbage input is
caught by the parsers, not by normalization; giving the normalizer a throw would
give normalization two contracts. `normalizeBanglaNumerals` folds U+09E6..U+09EF
to `0`..`9` and touches nothing else.

Every other function returns a discriminated result and never throws:

| Function | Success | Failure |
|---|---|---|
| `parseManualAmount` | `{ ok: true, value }` | `{ ok: false, code, reason, reason_bn }` for `AMOUNT_REQUIRED`, `AMOUNT_NOT_A_NUMBER`, `AMOUNT_ZERO`, `AMOUNT_NEGATIVE`, `AMOUNT_TOO_PRECISE`, `AMOUNT_ABOVE_MAXIMUM` |
| `parseManualDate` | `{ ok: true, value }` with ISO `YYYY-MM-DD` | `DATE_REQUIRED`, `DATE_NOT_RECOGNISED`, `DATE_IN_FUTURE` |
| `validateManualEntry` | `ok: true`, `normalized_input` non-null, `warnings` possibly non-empty | `ok: false`, `normalized_input` null, **all** field errors collected, never just the first |
| `proposeCategory` | always returns a proposal, sentinel `category_id` on no match | no failure branch by design; a miss is a result, not an error |
| `detectDuplicateFlag` | `DuplicateFlag` | `null` when nothing matches |
| `buildManualTransaction` | `Transaction` | no failure branch; callers must validate first |
| `applyManualCorrection` | `{ ok: true, transaction, corrections }` | `{ ok: false, field, code, reason, reason_bn }` for a non-finite amount, a `category_id` outside `DEFAULT_CATEGORIES`, and a blank or over-cap merchant name. Authorization stays the caller's. |
| `removalRecord` | `CorrectionRecord` | returns a record, **does not delete**. Deletion is the caller's action. |

## Invariants each function upholds

- No function mutates its arguments.
- No function reads the clock, the store, the network, or the environment.
- `buildManualTransaction` is the only constructor of a user-asserted row. It
  sets `extraction_confidence` on the `USER_ASSERTED` arm to nothing at all,
  `evidence_ids: []`, omits `document_id`, sets `status: 'USER_ENTERED'`, and
  sets `category_source` from the proposal.
  `merchant_name` is `proposal.canonical_merchant || entry.merchant_name ||
  entry.description`: when `category_source` says a merchant rule named it, the
  row must hold the name the rule matched, and an empty `canonical_merchant`
  means "no rule matched", not "this purchase has no merchant".
- `applyManualCorrection` emits **one record per changed field**, in
  `CORRECTION_ORDER`, each carrying that field's prior value verbatim, so a
  three-field patch persists three changes and records all three. It never
  overwrites history in place. `CORRECTION_ORDER` is the ordering authority and
  is not reordered.
- Every money figure this module produces or stores — parsed, corrected, or
  compared — passes through `roundMoney`. On the parse path over-precision is
  rejected before it can round, because rounding there would substitute a value
  the user did not assert; on the correction path there is no parsed value to
  reject, so `roundMoney` is what keeps `৳12.3456` from being stored and
  rendered. Rounding never happens at a call site.
- Free text is bounded before it is walked. The cheap UTF-16 `.length` gate runs
  before any per-codepoint normalization, and the codepoint count stops at the
  cap instead of materializing an array, so an oversized body costs O(1) before
  O(n) and never O(n) objects.

## Validation rules

Rejections carry a code plus plain English and Bengali text. No blame, no
"invalid", no "wrong", no second person — the zero-shaming gate in `PRODUCT.md`
and Principle IX.

`errors` block the row. `warnings` never do.

| Edge case from `spec.md` | Field | Code | Outcome |
|---|---|---|---|
| Amount of zero (`:109`) | `amount` | `AMOUNT_ZERO` | reject |
| Negative amount (`:110`) | `amount` | `AMOUNT_NEGATIVE` | reject — the sign is never carried, `direction` is |
| Over-precise amount (`:113`) | `amount` | `AMOUNT_TOO_PRECISE` | reject, do not round |
| Future date (`:111`) | `transaction_date` | `DATE_IN_FUTURE` | reject |
| Date before **or after** any statement period (`:112`) | `transaction_date` | `DATE_OUTSIDE_STATEMENT_PERIOD` | **warn only** — the spec says it must not break period comparison, not that it must be refused. Both sides of the window warn identically; the period edges themselves stay silent. |
| Bangla numerals (`:116`) | `amount`, `transaction_date` | none | **accept** — SC-009 holds by construction, since folding runs before parsing |
| Amount absent | `amount` | `AMOUNT_REQUIRED` | reject |
| Amount not a number | `amount` | `AMOUNT_NOT_A_NUMBER` | reject |
| Amount above the ৳10,000,000 ceiling | `amount` | `AMOUNT_ABOVE_MAXIMUM` | reject |
| Date absent | `transaction_date` | `DATE_REQUIRED` | reject |
| Date unrecognised, including `2026-02-31` | `transaction_date` | `DATE_NOT_RECOGNISED` | reject, never roll to March |
| Direction absent or not `EXPENSE`/`INCOME` | `direction` | `DIRECTION_NOT_RECOGNISED` | reject |
| Description absent | `description` | `DESCRIPTION_REQUIRED` | reject |
| Description over 240 characters | `description` | `DESCRIPTION_TOO_LONG` | reject |
| Merchant name submitted but blank | `merchant_name` | `MERCHANT_REQUIRED` | reject |
| Merchant name over 240 characters | `merchant_name` | `MERCHANT_TOO_LONG` | reject |
| Merchant name omitted entirely | `merchant_name` | none | **accept** — the field is optional; `buildManualTransaction` falls back to the description |

`MAX_DESCRIPTION_LENGTH` (240) governs **every** piece of user free text,
description and merchant name alike. One limit, one constant, one message per
field: a second looser cap on the merchant would be a bound nobody enforces.
The merchant name is a free-text field that reaches `insight.title` string
interpolation and the Gemini prompt, so it is bounded exactly like the
description.

`ManualEntryField` carries `'merchant_name'` for those two rows, which widens the
union documented at `data-model.md` §4. The widening is a superset: no existing
member is removed, and no consumer switches exhaustively on the union yet.

The ৳10,000,000 ceiling is a named constant
`MAX_MANUAL_ENTRY_AMOUNT_BDT` in the module, not a magic number at a call site.
It is a sanity bound against float abuse and a typo becoming a total, not a
business rule.

## Date forms

Exactly three, after numeral folding:

1. `YYYY-MM-DD`
2. `DD/MM/YYYY`
3. `DD Mon YYYY`

`DD/MM`, not `MM/DD`, because that is the repo's own existing convention in
`normalizeMerchant` and it is how a Dhaka user reads a bKash statement.
Reassembly uses validated `Date.UTC` parts so no host timezone can shift the day.
`today` is a parameter, never `new Date()`.

## Duplicate predicate

Flag when some existing row `e` satisfies all of:

```
e.id !== candidate.id
  AND e.direction === candidate.direction
  AND |e.amount - candidate.amount| <= 0.01
  AND dayDeltaDays(e.transaction_date, candidate.transaction_date) <= 1
  AND (
    normalizeEntryText(e.description) === normalizeEntryText(candidate.description)
    OR normalizeEntryText(e.merchant_name) === normalizeEntryText(candidate.merchant_name)
  )
```

- The amount tolerance is one poisha. A looser bound would collide two genuinely
  different purchases at the same price.
- The date window is plus or minus one calendar day, computed from ISO parts
  through `Date.UTC`, not `new Date(iso).getTime()`. The database layer
  (`detectDuplicateCandidate`) mixes bare `YYYY-MM-DD` with full ISO `posted_at`,
  which is how a one-day drift gets introduced.
- Text is whole-string equality after normalization, never substring
  containment.
- The anchor is the match with the lowest `created_at`, tie-broken by
  lexicographic `id`, so the result does not depend on `Map` insertion order.
- `DuplicateFlag.flagged_at` mirrors `candidate.updated_at`, because the module
  reads no clock (Principle X) and the caller stamps row and flag together. If a
  caller corrects the row before persisting the flag, the value moves with the
  row; that is intended, and the flag is a derived view rather than an
  independent timestamp.
- Every row is a candidate anchor, including one already carrying
  `is_duplicate_candidate`, so a chain resolves to the original row.
- Entered rows are compared against entered and extracted rows alike, per
  `spec.md:207`.

**Flags, never discards.** The caller persists the row first, then sets
`is_duplicate_candidate: true` and `duplicate_of_id`, then appends the
`DuplicateFlag`. `status` stays `USER_ENTERED`; borrowing `NEEDS_REVIEW` would
inflate the `needs_review_count` returned by `getDashboardSummary` with rows the
user already knows are right.

## Category proposal

Scans `MERCHANT_RULES` in order, first match wins, matching the loop in
`normalizeMerchant`.

On a match: the rule's `categoryId` and `canonicalName`, `source:
'MERCHANT_RULE'`, `matched_rule_index` set to the array index so the
justification is traceable, and `justification: 'RULE_MATCH'`.

On no match: `category_id: UNCATEGORIZED_CATEGORY_ID`, `canonical_merchant: ''`,
`source: 'UNCATEGORIZED'`, `matched_rule_index: null`, and
`justification: 'NO_RULE_MATCH'`.

It never falls back to `cat_other` and never calls the model. SC-002's "no
transaction receives a category the system cannot justify" is satisfied
structurally: the only non-sentinel return path is a rule match.

## Additive engine functions

Five new exports in `server/financialEngine.ts`. No existing line changes.

```ts
periodKeyOf(transactionDate: string): string | null
previousPeriodKey(periodKey: string): string | null
groupTransactionsByPeriod(transactions: Transaction[]): Map<string, Transaction[]>
latestPeriodKey(transactions: Transaction[]): string | null
periodLabelOf(periodKey: string): string | null
```

`latestPeriodKey` and `periodLabelOf` are additions beyond the original three.
Both were needed to remove the last literal: picking "current" as the latest
period present in the data, and rendering `period: 'September 2026'` from a key
rather than a hardcoded string, each require one. Month names live in the engine
rather than the route layer because a period label is derived date data.

Every function here is clock-free and pure: `daysInMonth` and the year-rollover
path go through `Date.UTC` on caller-supplied parts. Dates that are not
canonical ISO calendar dates return `null` rather than being coerced, because
`new Date('2026-02-31')` silently rolls into March and would file a row under a
period the user never chose. `groupTransactionsByPeriod` omits an unplaceable
row rather than bucketing it somewhere arbitrary, so an unparseable date is
visible as absence instead of inflating a total.

Month arithmetic is date-range work, which Principle I assigns to the engine.
`groupTransactionsByPeriod` partitions the whole set; choosing which two keys are
current and previous stays product policy in `server/db.ts`.

The call sites in `server/db.ts` that stopped hardcoding are the current/previous
split in `splitCurrentAndPreviousPeriod` and the dashboard period label in
`getDashboardSummary`.
