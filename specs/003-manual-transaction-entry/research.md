# Phase 0 Research: 003 Manual Transaction Entry

**Date**: 2026-10-01 | **Plan**: [plan.md](plan.md)

## R1. Why `confidence` must be deleted, not made nullable

**Question**: FR-005 says confidence MUST NOT be reported for a user-asserted
row. Does making `Transaction.confidence` optional satisfy that?

**Finding**: No, and the failure is silent.

`tsconfig.json` declares no `strict` and no `strictNullChecks`. Under that
setting `confidence?: number` gives every read site a `number`, not
`number | undefined`. `src/components/EvidenceModal.tsx:88` and
`src/components/ReviewView.tsx:281` both do `Math.round(tx.confidence * 100)`.
For a manual row that is `null * 100 === 0`, so the interface renders
`Confidence 0%` — a fabricated extraction score on a row that was never
extracted. That fails SC-004 directly.

**Decision**: delete `Transaction.confidence` and move it to
`provenance.extraction_confidence`, declared only on the `EXTRACTED` arm of a
discriminated union. Reading it without narrowing is then a compile error
regardless of `strictNullChecks`. The guarantee moves from reviewer discipline
into the type system.

## R2. Why an uncategorized row cannot be `null`

**Question**: FR-003 says an uncategorizable row must be left uncategorized.
What is the representation?

**Finding**: `null` breaks three things.

1. `server/financialEngine.ts:53` keys its `Map` on `t.category_id`. A `null`
   key produces a `CategorySummary.category_id` of `undefined`, which
   `src/types.ts:260` types as `string` and which vanishes from JSON. Its
   percentage would still count toward the total while the category list looked
   incomplete — a silent reconciliation failure, the thing SC-003 checks.
2. `server/db.ts:213` resolves a name with
   `this.categories.find(c => c.id === cs.category_id)` and falls back to
   `{ name: 'Other' }`. Absence gets relabelled as a real category, which is
   the exact guess FR-003 forbids.
3. It would require touching 21 read sites listed in
   [data-model.md](data-model.md) for no gain, because `strictNullChecks` is off
   and a `string | null` gives no compile-time protection either.

**Decision**: a reserved sentinel string, `cat_uncategorized`, added to
`DEFAULT_CATEGORIES` so it resolves by id with no fallback. `category_id` stays
required `string`, the breakdown keeps summing to `total_expenses`, and the row
stays visible at full weight per FR-006. `cat_other` is left exactly as it is
for the extracted path, where its guess is a separate spec-002 concern.

## R3. Why `evidence_ids` stays required

**Question**: An entered row has no evidence. Make `evidence_ids` optional?

**Finding**: With `strictNullChecks` off, `evidence_ids?: string[]` typechecks at
every read site and then throws `TypeError: undefined is not iterable` at
`server/financialEngine.ts:139,183,232,285`, which all do
`transactions.flatMap(t => t.evidence_ids)`. Typecheck passes, runtime dies.

**Decision**: keep `evidence_ids: string[]` required. An entered row carries
`[]`, and `document_id` is simply absent (`src/types.ts:65` is already optional
and `server.ts:359` already null-guards it). Suppression is then a provenance
decision enforced by `evidenceFor` in `src/provenance.ts`, not by optionality
that the compiler would not catch.

## R4. Where the reporting period is hardcoded

**Question**: SC-003 requires 100% of entered rows to appear in period totals.
Does that hold today?

**Finding**: No. `server/db.ts:175-176` and `:195-196` filter transactions with
`transaction_date.startsWith('2026-09')` and `'2026-08'`, and `server/db.ts:245`
reports `period: 'September 2026'` as a literal. A row entered today matches
neither prefix, so it is counted in `/v1/transactions` but in **no** dashboard
total, **no** category breakdown, and **no** insight. That is the feature's
entire purpose failing.

**Decision**: add three additive pure functions to the engine —
`periodKeyOf`, `previousPeriodKey`, `groupTransactionsByPeriod` — and derive the
current and previous keys from the data instead of hardcoding them. Period and
date-range math is the engine's job under Principle I; the *choice* of which two
periods to present stays product policy in `server/db.ts`.

**Accepted consequence**: existing dashboard numbers shift, because the fixture
months are no longer privileged. That is the correct behaviour, not a
regression. Verified against `server/goldenDataset.ts` after the change.

## R5. Bengali coverage against SC-002

**Question**: SC-002 wants 90% of entered rows categorized. `MERCHANT_RULES` is
Latin-only. What happens to a Bengali description?

**Finding**: Nothing matches, so every Bengali row lands Uncategorized. That is
safe under FR-003 but fails SC-002, and FR-017 requires Bengali input and
messaging.

**Decision**: extend `MERCHANT_RULES` with a Bengali alias set covering the
existing canonical merchants — ফুডপান্ডা, পাঠাও, উবার, চালডাল, শ্বাপনো, দেশকোপ,
গ্রামীণফোন, রবি, বাংলালিংক, নেটফ্লিক্স, বেতন, and the rest of the table. These
are ordinary deterministic rules and also improve extracted Bengali rows, which
spec 002 would otherwise have to do later. No model is consulted.

## R6. Duplicate predicate

**Question**: What exactly counts as a likely duplicate?

**Finding**: `server/db.ts:157-171` already implements a predicate — exact date,
amount within 0.01, same direction, and a lowercased merchant or description
match — but it returns the **first** match and the pipeline sets
`status: 'NEEDS_REVIEW'` on a hit.

**Decision**: extract the predicate to a pure function with three changes.

1. **±1 day window**, computed from ISO parts via `Date.UTC` rather than
   `new Date(iso)`. `server/db.ts:238-242` already mixes bare `YYYY-MM-DD` with
   full ISO `posted_at`, which is how a one-day drift gets introduced.
2. **Return all matches**, not the first, with a deterministic anchor: lowest
   `created_at`, tie-broken by lexicographic `id`. Without the tie-break the
   result depends on `Map` insertion order.
3. **Do not borrow `NEEDS_REVIEW`.** `server/db.ts:235` counts that status into
   `needs_review_count`, so an entered row carrying it would inflate a review
   queue with rows the user already knows are right. A user-asserted row is not
   in doubt. It stays `USER_ENTERED` and sets the existing
   `is_duplicate_candidate` / `duplicate_of_id` pair, which
   `src/components/ReviewView.tsx:165-167` already surfaces.

Text comparison is whole-string equality after normalization, never substring
containment. A `contains` rule flags `Uber` against `Uber Eats BD`, producing
flag fatigue that trains the user to ignore flags.

## R7. Pre-existing violations found, not fixed here

Recorded so 003 does not absorb another spec's work.

| Site | Issue | Owner |
|---|---|---|
| `server/pipeline.ts:109-126` | Fabricates `page_number: 1` and an invented bounding box for every extracted row | 002 |
| `server/pipeline.ts:241` | Hardcoded `confidence: 0.92` | 002 |
| `server/gemini.ts:178` | Fabricated `confidence` default of `0.9` | 002 |
| `server/financialEngine.ts:140,184,233,286` | Hardcoded `Insight.confidence` | 002 |
| `server/db.ts:213` | `cat_other` guess on the extracted path | 002 |
| `server.ts:398-407` | `PATCH /v1/transactions/:id` sets `USER_EDITED` unconditionally, which would clobber an entered row's status | 001 |
| `src/components/EvidenceModal.tsx:67` | Prints `Doc #origin` when `document_id` is absent — a fabricated document location, which is what FR-018 forbids | Wave B |
| `src/components/TrustSection.tsx:22` | Prose asserting extracted records show confidence; must not read as a claim about entered rows | Wave B |

## R8. No test runner

**Question**: How is any of this verified?

**Finding**: `package.json` has no `test` script, `AGENTS.md` §1 confirms no
runner, and `CONFLICT.md:177-182` assigns the measurement path to spec 001.
`AGENTS.md` §9 names spec 001's harness as the prerequisite for any spec
claiming a passing criterion.

**Decision**: verify Wave A with `npm run lint`, `npm run build`, and
non-committed `npx tsx` assertions. Installing a runner here would be dependency
churn, which Principle IX forbids without a documented requirement, and it is
not this spec's requirement to satisfy.

**Consequence, stated plainly**: SC-001, SC-002, SC-006, SC-007, and SC-009 stay
formally unverified until spec 001 lands a runner. Do not report them as
passing.
