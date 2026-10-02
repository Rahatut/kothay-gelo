# Phase 1 Data Model: 003 Manual Transaction Entry

**Date**: 2026-10-01 | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

All types live in `src/types.ts`, the single shared domain surface that both
`server/` and `src/` already import. `AGENTS.md` §4 records the layout quirk as
intentional: one type surface, not a fork.

## 1. Provenance

Replaces `Transaction.confidence` (`src/types.ts:82`).

```ts
export type TransactionProvenance =
  | {
      source: 'USER_ASSERTED';
      asserted_at: string;
      assertion_method: 'MANUAL_ENTRY';
    }
  | {
      source: 'EXTRACTED';
      extraction_model: string;
      extraction_version: string;
      extraction_confidence: number;
    }
  | {
      source: 'ENGINE_DERIVED';
      calculation_version: string;
      derivation: string;
    };
```

`extraction_confidence` is declared only on the `EXTRACTED` arm. Reading
`tx.provenance.extraction_confidence` without first narrowing
`tx.provenance.source === 'EXTRACTED'` is a compile error. This is the mechanism
behind FR-005 and SC-004, and it holds even though `tsconfig.json` sets no
`strictNullChecks`.

`ENGINE_DERIVED` exists because the six previous-month fixture rows at
`server/goldenDataset.ts:455-558` have no `document_id` and no evidence. Calling
those extracted would be a Principle VI fabrication.

## 2. Transaction, restructured

```ts
export type CategoryAssignmentSource =
  | 'MERCHANT_RULE'
  | 'USER_CORRECTION'
  | 'UNCATEGORIZED';

export interface Transaction {
  id: string;
  user_id: string;
  document_id?: string;      // absent on a user-asserted row (FR-018)
  transaction_date: string;  // YYYY-MM-DD
  posted_at?: string;
  amount: number;            // BDT, 2 decimals, via roundMoney
  currency: 'BDT';
  direction: TransactionDirection;
  transaction_type?: 'DEBIT' | 'CREDIT';
  merchant_id?: string;
  merchant_name: string;
  raw_merchant_name?: string;
  raw_text_snippet?: string;
  description: string;
  category_id: string;       // cat_uncategorized when nothing was justified
  category_source: CategoryAssignmentSource;
  status: TransactionStatus;
  provenance: TransactionProvenance;
  evidence_ids: string[];    // [] on a user-asserted row (FR-018)
  is_duplicate_candidate?: boolean;
  duplicate_of_id?: string;
  created_at: string;
  updated_at: string;
}
```

Four changes: `confidence` deleted, `provenance` added, `category_source` added,
`corrections` deliberately **not** a field on this interface (see §4).

`TransactionStatus` (`src/types.ts:3-10`) gains `'USER_ENTERED'`. Reusing
`'ACCEPTED'` collides with the edit lock at `src/components/ReviewView.tsx:180-181`;
reusing `'NEEDS_REVIEW'` would falsely claim the system doubts a row the user
asserted, and would inflate `needs_review_count` at `server/db.ts:235`.

`Insight.confidence` (`src/types.ts:165`) is untouched. It is engine-owned and a
different concept; Principle I keeps it out of this change.

## 3. The uncategorized sentinel

In `server/categories.ts`, alongside `DEFAULT_CATEGORIES`:

```ts
export const UNCATEGORIZED_CATEGORY_ID = 'cat_uncategorized';
```

plus one row:

```ts
{
  id: UNCATEGORIZED_CATEGORY_ID,
  name: 'Uncategorized',
  name_bn: 'শ্রেণিবিহীন',
  color: '#94A3B8',
  icon: 'CircleDashed',
}
```

It follows the existing `cat_*` id convention. It resolves by id at
`server/db.ts:213` with no fallback, so absence is never relabelled. `cat_other`
is left exactly as it is for the extracted path.

Because the sentinel is a real category, the row keeps its full weight in
`calculateCategoryBreakdown` (`server/financialEngine.ts:46`) and the bucket
amounts still sum to `total_expenses`. That is what SC-003 depends on.

## 4. Correction and duplicate records

```ts
export type CorrectableTransactionField =
  | 'transaction_date'
  | 'amount'
  | 'direction'
  | 'description'
  | 'merchant_name'
  | 'category_id';

export type CorrectionKind =
  | 'USER_CORRECTION'
  | 'USER_CATEGORY_CORRECTION'
  | 'USER_DELETION';

export interface CorrectionRecord {
  id: string;
  transaction_id: string;
  user_id: string;
  field: CorrectableTransactionField;
  previous_value: string;   // ISO date, BDT decimal string, or enum id
  current_value: string;    // '' when kind is 'USER_DELETION'
  kind: CorrectionKind;
  corrected_at: string;
}

export type DuplicateMatchTier = 'EXACT_TEXT' | 'SAME_MERCHANT_SAME_TICKET';

export type DuplicateMatchedField =
  | 'amount' | 'direction' | 'date' | 'description' | 'merchant_name';

export interface DuplicateFlag {
  transaction_id: string;
  existing_transaction_id: string;
  tier: DuplicateMatchTier;
  matched_fields: DuplicateMatchedField[];
  amount_delta_bdt: number;
  day_delta: number;
  flagged_at: string;
}

export interface CategoryProposal {
  category_id: string;              // sentinel when no rule matched
  canonical_merchant: string;       // '' when no rule matched
  source: 'MERCHANT_RULE' | 'UNCATEGORIZED';
  matched_rule_index: number | null;
  basis: string;                    // plain sentence, user-facing
  justification: 'RULE_MATCH' | 'NO_RULE_MATCH';
}
```

`previous_value` and `current_value` are strings so one audit column type covers
a date, a BDT amount, and an enum id. The record is never read by any total, so
a decimal string cannot contaminate a figure. `justification` is a label, not a
score, per Principle VII: no new fabricated confidence.

`DuplicateFlag` is a new record type, but the denormalized pair
`is_duplicate_candidate` / `duplicate_of_id` already on `Transaction` stays, so
`server.ts:434`, `server/db.ts:236`, `src/components/ReviewView.tsx:167`, and
`server/pipeline.ts:160-161` keep working untouched.

Corrections live on the transaction as `corrections?` rather than a separate
collection, so the existing account-scrub path (`server/db.ts:264`) and the
export route cover them for free once persistence lands.

## 5. Boundary types for server/manualEntry.ts

These are a request and result contract for one pure module, not persisted
records, so they live in the module rather than in `src/types.ts`.

```ts
export type ManualEntryErrorCode =
  | 'AMOUNT_REQUIRED'
  | 'AMOUNT_NOT_A_NUMBER'
  | 'AMOUNT_ZERO'
  | 'AMOUNT_NEGATIVE'
  | 'AMOUNT_TOO_PRECISE'
  | 'AMOUNT_ABOVE_MAXIMUM'
  | 'DATE_REQUIRED'
  | 'DATE_NOT_RECOGNISED'
  | 'DATE_IN_FUTURE'
  | 'DIRECTION_NOT_RECOGNISED'
  | 'DESCRIPTION_REQUIRED'
  | 'DESCRIPTION_TOO_LONG';

export type ManualEntryWarningCode = 'DATE_OUTSIDE_STATEMENT_PERIOD';

export type ManualEntryField =
  | 'transaction_date' | 'amount' | 'direction' | 'description';

export interface ManualEntryInput {
  transaction_date: string;   // raw; Bangla numerals and 3 date forms accepted
  amount: string | number;    // raw; normalised before parsing
  direction: string;
  description: string;
  merchant_name?: string;
}

export interface NormalizedManualEntry {
  transaction_date: string;   // ISO YYYY-MM-DD
  amount: number;             // BDT, 2 decimals
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
```

`reason_bn` is required on every message, not optional. FR-017 and SC-008
require Bengali messaging, and `AGENTS.md` §15 requires Bengali copy to be
authored rather than machine-translated.

## 6. src/provenance.ts

The only sanctioned accessors for confidence and evidence.

```ts
export function isUserAsserted(tx: Transaction): boolean;
export function extractionConfidenceOf(tx: Transaction): number | null;
export function evidenceFor(tx: Transaction): string[];
```

`extractionConfidenceOf` returns `null` unless provenance is `EXTRACTED`. A
renderer that calls it gets `null` for an entered row and must render nothing.
`evidenceFor` returns `[]` unless provenance is `EXTRACTED`, which is FR-018.

## 7. Migration inventory

Every `Transaction` literal needs `provenance` and `category_source`, and loses
`confidence`. With `strictNullChecks` off these are the only class of error
`npm run lint` still catches, so this list must be exact.

**24 literals in `server/goldenDataset.ts`** — 18 carry a `document_id` and
become `EXTRACTED`; 6 previous-month rows at `:455-558` become `ENGINE_DERIVED`.
`category_id` and `confidence` line numbers: 120/123, 139/142, 158/161, 177/180,
196/199, 215/218, 234/237, 253/256, 272/275, 291/294, 310/313, 329/332, 348/351,
367/370, 386/389, 405/408, 424/427, 443/446, 466/469, 483/486, 500/503, 517/520,
534/537, 551/554.

No amount, date, or category value changes. Fixture math must stay verifiable
against hand computation.

**1 literal in `server/pipeline.ts:131-150`.** Replace `:147` with a
`provenance` object built from `cand.extraction_model` and
`cand.extraction_version`, which already exist on
`ExtractedTransactionCandidate` (`src/types.ts:98-99`) but are currently read
nowhere. Confirm `server/gemini.ts` populates them before wiring; otherwise use
the literal `'unknown'` rather than a default score. Add `category_source` at
`:144`.

**Readers of `Transaction.confidence` that break**: `EvidenceModal.tsx:88`,
`ReviewView.tsx:281`. `InsightsView.tsx:134` reads `insight.confidence`, a
different type, and is unaffected.

**Sites that must resolve the sentinel** (they read `category_id` and would show
a raw id otherwise): `server.ts:319,400,401,416`,
`server/financialEngine.ts:53,56,151,154,159,162`, `server/db.ts:213,219`,
`ReviewView.tsx:88,95,178`, `TransactionsView.tsx:74,181`,
`DashboardView.tsx:537`.
