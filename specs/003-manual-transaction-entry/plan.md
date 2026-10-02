# Implementation Plan: 003 Manual Transaction Entry

**Branch**: `003-manual-transaction-entry` | **Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)

**Status**: Wave A planned and cleared to implement. Wave B blocked on spec 001.

## Summary

Add a pure, deterministic domain layer that lets a user assert a transaction by
hand: normalize the input, validate it, propose a category, flag a likely
duplicate, and record corrections with the prior value retained. Every figure the
row touches still comes from `server/financialEngine.ts`.

The type surface is where most of the real work sits. `Transaction.confidence`
is a required `number` today, and `tsconfig.json` sets neither `strict` nor
`strictNullChecks`, so making it nullable buys **zero** compile-time protection:
`Math.round(tx.confidence * 100)` at `src/components/EvidenceModal.tsx:88` and
`src/components/ReviewView.tsx:281` would still typecheck and render
`Confidence 0%`, because `null * 100 === 0`. That is a fabricated value and
fails SC-004. The field is therefore **deleted** from `Transaction` and moved
into a discriminated `provenance` union whose non-extracted arms do not declare
it, so reading a confidence value without narrowing to `EXTRACTED` is a
compile error. FR-005 becomes a type-level guarantee instead of a review
convention.

## Why this is two waves

Spec 001 (real accounts, real authorization, relational persistence) is unbuilt.
`server.ts:31` returns a hardcoded `'usr_bangladesh_consumer_01'`,
`server.ts:60` compares the OTP to the literal `'123456'`, and
`server/db.ts:26-38` is in-memory and loses everything on restart. `CONFLICT.md`
D1-B and D2-A already rejected that state.

**Wave A — implement now.** Deterministic domain logic with no HTTP, no auth, and
no persistence. Runnable and verifiable with `tsc`, `vite build`, and throwaway
`tsx` assertions.

**Wave B — deferred, blocked on 001.** Routes, per-identity scoping, durable
correction storage, and every UI affordance. Recorded in
[../CONFLICT.md](../CONFLICT.md) and in `tasks.md` Phase D, not planned here.

## Technical Context

**Language**: TypeScript 5, strict-clean by convention (no `strict` in
`tsconfig.json`)
**Stack**: Express 4 + React 19 + Vite 8, unchanged
**Storage**: unchanged in Wave A. `MemoryDatabase` in `server/db.ts`
**Testing**: no runner exists. Verification is `npm run lint`, `npm run build`,
and non-committed `npx tsx` assertions. Spec 001 owns the harness
(`CONFLICT.md:177-182`)
**New dependencies**: none. Hand-rolled date validation and numeral folding

## Constitution Check

| Decision | Principle | Constraint it imposes |
|---|---|---|
| Delete `Transaction.confidence`, nest it in a `provenance` union | I (`:68`), VII (`:134`) | `null` and `0` are both lies for a user-asserted row. Absence must be representable as absence, per the standing constraint at `constitution.md:210`. |
| `UNCATEGORIZED_CATEGORY_ID` sentinel, not `null` | I, VII | `server/financialEngine.ts:53` keys a `Map` on `category_id`; a `null` key vanishes from JSON while its percentage still counts, and `server/db.ts:213` then relabels absence as `'Other'`. A sentinel keeps the breakdown summing to `total_expenses`, which SC-003 depends on. |
| `evidence_ids` stays required `string[]`, `[]` on entered rows | VI (`:124`) | FR-018 forbids a document location on an entered row. An empty array shows nothing. Optional would crash `flatMap` at `server/financialEngine.ts:139,183,232,285`, since `strictNullChecks` is off. |
| `server/manualEntry.ts` imports no `db`, no `gemini`, no `express`, no clock | V (`:115`), X (`:162`) | Read-only MVP: entry is user-initiated, never model-initiated. Independently testable engine: `today`, `id`, and `now` are injected parameters, so the module is byte-reproducible. |
| Proposal reads `MERCHANT_RULES` only, never the model | I, II (`:80`) | The model may not originate a category. The returned `justification` is the justification SC-002 demands. No new tool, no new endpoint. |
| Duplicate flag never discards | IX (`:153`) | Persist the row first, then set the flag. Never auto-delete, never merge amounts. |
| Corrections retain the prior value as its own record | VI, and `constitution.md:213` | No in-place overwrite. A quantitative figure must trace to the transactions behind it, including the earlier version. |
| `MERCHANT_RULES` gains Bengali aliases | VII | SC-002 targets 90% coverage and FR-017 requires Bengali input. Bengali-only rules are still deterministic rules. |
| Additive period functions in the engine | I | Period and date-range math belongs to the engine. The *choice* of which two periods are current and previous stays product policy in `server/db.ts`. |

**Unresolved governance item, recorded not fixed.** `PRODUCT.md` will-not-build
ledger #8 still bars manual entry as written. `CONFLICT.md` D3 amended the
constitution to 1.1.0 in the spec's favour, but `PRODUCT.md` was never
reworded. Ledger #8 should be scoped to mean "no required manual categorization".

## Project Structure

```text
specs/003-manual-transaction-entry/
├── spec.md
├── plan.md                  # This file
├── research.md              # Phase 0
├── data-model.md            # Phase 1
├── contracts/
│   └── manual-entry.md      # Phase 1
└── tasks.md                 # Phase 2

server/
├── manualEntry.ts           # NEW. Pure domain logic. No db/gemini/express/clock.
├── categories.ts            # + sentinel, + 1 category row, + Bengali aliases
├── financialEngine.ts       # + 3 additive period functions. No existing line changes.
├── db.ts                    # period selection de-hardcoded
├── goldenDataset.ts         # 24 Transaction literals migrated
└── pipeline.ts              # 1 Transaction literal migrated
src/
├── types.ts                 # Transaction restructured
├── provenance.ts            # NEW. isUserAsserted, extractionConfidenceOf, evidenceFor
└── components/              # 4 files: sentinel resolution + confidence + FR-018 gates
```

`server/manualEntry.ts` is the only new server file. It is justified because
`AGENTS.md` §4 documents `server/financialEngine.ts` as money math specifically,
and because a pure leaf module with zero `db` imports is the only form in which
this logic is testable without a seeded database. The sibling homes are already
taken: `financialEngine.ts` money math, `categories.ts` rule table,
`pipeline.ts` upload state machine, `db.ts` store.

`src/provenance.ts` is the only new client file. `src/types.ts` holds zero
runtime code today, and no `src/` file imports from `server/`, so a
client-importable selector needs a client-side home.

## Build Order

Each step ends at a compilable state. `npm run lint` after every step.

1. `src/types.ts`, `server/categories.ts` — type surface, sentinel, aliases
2. `server/manualEntry.ts`, `src/provenance.ts` — the core
3. `server/goldenDataset.ts`, `server/pipeline.ts` — migrate every literal
4. Four components — sentinel resolution, confidence readers, FR-018 gates
5. `server/financialEngine.ts`, `server/db.ts` — period functions, de-hardcode
6. `npm run lint` + `npm run build` + throwaway `tsx` assertions
7. `code-reviewer`, then `security-reviewer`

Step 3 is the gate that proves the type change is complete: a missed literal is
an excess-property or missing-property error, which is the only class of error
`strictNullChecks: false` still catches.

## Decisions

**Provenance is stored, not derived.** `CONFLICT.md:216` requires source
discrimination from day one under D4-B. Provenance lives on the row.

**`TransactionStatus` gains `'USER_ENTERED'`.** Reusing `'ACCEPTED'` collides
with the edit lock at `src/components/ReviewView.tsx:180-181`. Reusing
`'NEEDS_REVIEW'` would falsely claim the system doubts a row the user asserted,
and would inflate `needs_review_count` at `server/db.ts:235`.

**Direction is `EXPENSE` or `INCOME` only.** `server/financialEngine.ts:16,23`
sum only those two, but `:35` counts every row, so a `TRANSFER` would inflate
`count` while entering neither total. A leading sign is stripped; the
`direction` field is authoritative per FR-001.

**Over-precision is rejected, not rounded.** Rounding substitutes a value the
user did not assert, which `constitution.md:210` forbids. `roundMoney` still
governs amounts that are already representable.

**A date outside the statement period warns, it does not block.** The spec's
edge case says such a date must not *break* period comparison, not that it must
be refused.

**An amount ceiling of ৳10,000,000 is a sanity bound, not a business rule.** An
unbounded number lets a typo become a total.

## Wave B, recorded only

Blocked on `specs/001-foundation-authority` (D1-B accounts, D2-A survival
across restart).

| Item | Requirement | Why blocked |
|---|---|---|
| Create/correct/delete routes | FR-001, FR-010, FR-011 | A route now would scope records to a fiction identity. Principle III cannot be satisfied. |
| Per-identity scoping | FR-014 | No authenticated identity exists. |
| Durable correction and deletion records | FR-011, SC-007 | `MemoryDatabase` loses them on restart, so SC-007 is unclaimable. |
| Entry form, provenance badge, category override, delete confirmation | FR-016, FR-017, SC-008 | A UI shipping before identity would present a privacy claim the code cannot honour, which `PRODUCT.md` ledger #10 forbids. |
| Duplicate and proposal surfacing | FR-002, FR-009 | Wave A produces the values; nothing renders them. |
| Acceptance instrumentation | SC-001, SC-002, SC-006, SC-007, SC-009 | No harness, 1 of 3 required fixtures (`CONFLICT.md:177-182`). Do not add a test runner here; Principle IX forbids dependency churn without a documented requirement. |
| Uncategorized insight label | FR-003 | `server/financialEngine.ts:171,180,200,279,296` labels any non-food/non-shopping id as the literal string `'Category'`. The engine is authoritative and frozen in Wave A; the label fix belongs with the period work. |

## Out of Scope

Bulk or CSV import by hand, receipt photo entry, scheduled entries, splitting a
transaction across categories, attaching evidence to an entered row, and any
automation of entry — all per the spec's own scope boundaries.
