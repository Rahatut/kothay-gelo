# Tasks: 003 Manual Transaction Entry

**Date**: 2026-10-01 | **Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

Phases A to C are Wave A and are unblocked. Phase D is Wave B, blocked on
`specs/001-foundation-authority`, and is recorded rather than scheduled.

## Phase A — Type surface

- [x] **A1** `src/types.ts` — add `TransactionProvenance` as a discriminated
      union with `extraction_confidence` declared only on the `EXTRACTED` arm
- [x] **A2** `src/types.ts` — add `CategoryAssignmentSource`,
      `CorrectableTransactionField`, `CorrectionKind`, `CorrectionRecord`,
      `DuplicateMatchTier`, `DuplicateMatchedField`, `DuplicateFlag`,
      `CategoryProposal`
- [x] **A3** `src/types.ts` — add `'USER_ENTERED'` to `TransactionStatus`
- [x] **A4** `src/types.ts` — delete `Transaction.confidence`, add
      `provenance` and `category_source` to `Transaction`. Leave
      `Insight.confidence` untouched.
- [x] **A5** `server/categories.ts` — add `UNCATEGORIZED_CATEGORY_ID` and the
      `Uncategorized` / `শ্রেণিবিহীন` row
- [ ] **A6** `server/categories.ts` — add Bengali aliases to `MERCHANT_RULES`
      for the existing canonical merchants, including at least ফুডপান্ডা, পাঠাও,
      উবার, চালডাল, শ্বাপনো, দেশকোপ, গ্রামীণফোন, রবি, বাংলালিংক, নেটফ্লিক্স,
      বেতন. Latin and Bengali in one pattern per rule.
- [ ] **A7** Gate — `npm run lint`. Expected: errors only at the literals in B1
      and B2 and the two readers in C1.

## Phase B — Core module

- [x] **B1** `server/manualEntry.ts` (new) — `normalizeBanglaNumerals`,
      `normalizeEntryText`, the boundary types, `MAX_MANUAL_ENTRY_AMOUNT_BDT`
- [x] **B2** `server/manualEntry.ts` — `parseManualAmount`, `parseManualDate`
- [x] **B3** `server/manualEntry.ts` — `validateManualEntry` with injected
      `today`, all errors in the table in
      [contracts/manual-entry.md](contracts/manual-entry.md), plain en and bn
- [x] **B4** `server/manualEntry.ts` — `proposeCategory`, `buildManualTransaction`
- [x] **B5** `server/manualEntry.ts` — `detectDuplicateFlag`
- [x] **B6** `server/manualEntry.ts` — `applyManualCorrection`, `removalRecord`
- [ ] **B7** `server/pipeline.ts` — migrate the literal at `:131-150`
- [ ] **B8** `server/goldenDataset.ts` — migrate 24 literals. 18 `EXTRACTED`
      where a `document_id` is present, 6 previous-month rows at `:455-558`
      `ENGINE_DERIVED`. **No amount, date, or category value may change.**
- [ ] **B9** Gate — `npm run lint` clean for `server/`. This is the gate that
      proves the type change is complete; a missed literal is the only error
      class `strictNullChecks: false` still catches.

## Phase C — Presentation and period

- [x] **C1** `src/provenance.ts` (new) — `isUserAsserted`,
      `extractionConfidenceOf`, `evidenceFor`
- [ ] **C2** `src/components/EvidenceModal.tsx:88` and
      `src/components/ReviewView.tsx:281` — route through
      `extractionConfidenceOf` and render nothing for a user-asserted row.
      Mandatory, not polish: without it a manual row renders `Confidence 0%`.
- [ ] **C3** `src/components/EvidenceModal.tsx:67` — stop printing
      `Doc #origin` when `document_id` is absent. FR-018 forbids a fabricated
      document location. Also gate `:49-53` and the heading at `:95`, which
      currently fall back to `transaction.description` under a "raw statement
      text" label.
- [ ] **C4** `src/components/ReviewView.tsx:88,95,178`,
      `src/components/TransactionsView.tsx:74,181`,
      `src/components/DashboardView.tsx:537` — resolve the sentinel through the
      category list. `DashboardView.tsx:537` renders a raw category id as a
      badge, so an entered row would otherwise show `cat_uncategorized`.
- [ ] **C5** `server/financialEngine.ts` — add `periodKeyOf`,
      `previousPeriodKey`, `groupTransactionsByPeriod`. Additive; no existing
      line changes.
- [ ] **C6** `server/db.ts:175-176,195-196,245` — derive the current and
      previous period keys from the data instead of the hardcoded `2026-09` and
      `2026-08` prefixes, and derive the `period` label.
- [x] **C7** Gate — `npm run lint` and `npm run build` both clean.

## Phase C verification

- [x] **V1** Bangla parity. `৳১,২৫০.৫০`, `1250.50`, `১২৫০`, and ` ৳১২৫০ ` all yield
      `1250.5`. Covers SC-009.
- [x] **V2** Every row of the validation table rejects or warns as specified.
      Includes `2026-02-30` rejected and `2026-09-01` accepted against a
      supplied `today`.
- [x] **V3** `proposeCategory` hits a known merchant and returns the sentinel,
      never `cat_other`, on a miss. A Bengali description matches.
- [x] **V4** A built manual row has `provenance.source === 'USER_ASSERTED'`,
      no `extraction_confidence` reachable, `evidence_ids: []`, no
      `document_id`, and `status: 'USER_ENTERED'`.
- [x] **V5** `applyManualCorrection` retains the prior value in the record, and
      `removalRecord` returns a record without deleting.
- [x] **V6** Duplicate detection: both tiers, and negatives for a different
      amount, a different direction, and a date two days out. Verify the flag,
      not a discard.
- [x] **V7** FR-006 and SC-003: feed a built manual row through
      `calculatePeriodMetrics` and `calculateCategoryBreakdown` and confirm it
      moves `total_expenses` identically to an extracted row.
- [x] **V8** `git diff --stat server/financialEngine.ts` shows additions only.
- [ ] **V9** Exercise the affected routes in the browser. Confirm an extracted
      seeded row still shows its percentage and its evidence.
- [ ] **V10** `code-reviewer`, then `security-reviewer`.
- [ ] **V11** Record which of SC-001, SC-002, SC-006, SC-007, SC-009 remain
      formally unverified for want of a runner, per
      [research.md](research.md) R8.

All `npx tsx` assertions in this phase are throwaway and must not be committed.

## Phase D — Wave B, blocked on spec 001

Not scheduled. Recorded so nothing is lost.

| Item | Requirement | Blocker |
|---|---|---|
| Create, correct, delete routes | FR-001, FR-010, FR-011 | `server.ts:31` returns a hardcoded user id, so Principle III cannot be satisfied |
| Per-identity scoping | FR-014 | No authenticated identity exists. D1-B unbuilt. |
| Durable correction and deletion records | FR-011, SC-007 | `MemoryDatabase` loses them on restart. D2-A unbuilt. |
| Entry form, provenance badge, category override, delete confirmation | FR-016, FR-017, SC-008 | A UI before identity would present a privacy claim the code cannot honour, which `PRODUCT.md` ledger #10 forbids |
| Duplicate and proposal surfacing | FR-002, FR-009 | Wave A produces the values; nothing renders them |
| Preserve entered provenance in `PATCH /v1/transactions/:id` | FR-004 | `server.ts:398-407` sets `USER_EDITED` unconditionally and would clobber the status |
| Uncategorized insight label | FR-003 | `server/financialEngine.ts:171,180,200,279,296` labels any non-food/non-shopping id as the literal string `'Category'` |
| Acceptance instrumentation for SC-001, SC-002, SC-006, SC-007, SC-009 | success criteria | No runner exists, 1 of 3 fixtures. `CONFLICT.md:177-182` assigns this to 001. Principle IX forbids adding a runner here. |

## Governance item still open

`PRODUCT.md` will-not-build ledger #8 bars manual entry as written. `CONFLICT.md`
D3 amended the constitution to 1.1.0 in this spec's favour, but `PRODUCT.md` was
never reworded. Ledger #8 should be scoped to mean "no required manual
categorization" rather than "no manual entry".

---

## Completion note

The pure module (`server/manualEntry.ts`, 831 lines, 82 unit tests) existed from an
earlier pass but was wired into nothing: no route, no repository write, no interface.
It was audited rather than rewritten — it holds no SQL, duplicates none of the engine,
fabricates no defaults, and lets the type system enforce FR-018 — so the work was the
persistence and the surface, not the logic.

Added:

- `server/db/migrations/008_transaction_corrections.sql` — FR-010 had no storage. One
  row per changed field, so the row and the trail cannot disagree.
- `createManualTransaction`, `updateTransactionRow`, `deleteTransactionRow`,
  `listCorrections` in `server/db/repositories/transactions.ts`
- `POST /v1/transactions`, `GET /v1/transactions/:id/corrections`, and
  `DELETE /v1/transactions/:id`
- `PATCH /v1/transactions/:id` and `POST /v1/transactions/:id/confirm` rewritten onto
  the repository. Both previously wrote only to the in-memory map, so **a correction
  changed nothing about the ledger** and vanished on restart.
- `recalculateForAccount` replaces `db.recalculateUserInsights` after a write; the old
  one read the empty map, so insights were computed from a stale set
- `src/components/ManualEntryView.tsx` plus a one-click affordance on the ledger and
  the review desk (FR-016)
- `server/manualEntry.integration.test.ts` — 10 tests over HTTP, including survival
  across a restart

### Defect found while wiring

The Vite dev middleware had been moved *ahead* of the API routes. With `appType:
'spa'` it answers anything it recognises, so `POST /v1/auth/register` returned 404 in
a freshly started process — registration, login, and every financial route dead. It
went unnoticed because the long-running dev server predated the move. Mounted after
the routes again, with `server/isolation.test.ts` (24 tests) as the guard.
