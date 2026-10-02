# Feature Specification: Manual Transaction Entry

**Feature Branch**: `003-manual-transaction-entry`

**Created**: 2026-10-01

**Status**: Draft — unblocked by constitution 1.1.0 (2026-10-01)

**Input**: User description: "1. manual entry of transaction"

## Problem Statement

A user who spends cash, or who wants to record a transaction today rather than
wait for a statement, currently has no way to add one. The interface offers only
upload, and the backend offers no route that creates a transaction from user
input. Editing an existing row exists but is not creation. For a Dhaka user
whose daily life mixes bKash, ATM cash withdrawals, and hand-to-hand payments,
a ledger that only knows about statement rows is missing most of their spending.

## Conflict Note

`PRODUCT.md` will-not-build ledger #8 bars "budgets, goals, manual
categorization" and Q2 requires "no human judgment mid-loop". This spec treats
manual entry as an **additive path outside the upload-to-clue loop**: the user
asserts a row that happened, and the system categorizes it, rather than the user
being required to categorize extracted data. `PRODUCT.md` ledger #8 should be
scoped to mean "no required manual categorization" rather than "no manual
entry". Note that the shipped code already violates ledger #8 by shipping a
goals view. Resolution requires decision D3.

## User Scenarios & Testing

### User Story 1 — Record a transaction I just made (Priority: P1)

As a user, I enter today's cash withdrawal or market purchase directly, and it
appears in my ledger and in my totals, so that my analysis reflects what I
actually spent rather than waiting for a statement.

**Why this priority**: This is the core of the request. Without it, a large
share of real spending is invisible to the system.

**Independent Test**: Enter a transaction from the interface and confirm it
appears in the ledger, is included in the period totals, and is reflected in the
category breakdown and trend figures.

**Acceptance Scenarios**:

1. **Given** no statement has been uploaded, **When** the user enters a
   transaction with a date, an amount, a direction, and a description, **Then**
   it appears in the ledger and in the totals for that period.
2. **Given** a manually entered transaction, **When** it is viewed, **Then** it
   is visibly marked as entered by hand and distinguished from an extracted row.
3. **Given** a duplicate of an existing transaction, **When** the user enters
   it, **Then** the system flags the likely duplicate without silently discarding
   the entry.

---

### User Story 2 — I am not asked to do accounting work (Priority: P1)

As a user, I expect the system to categorize what I enter, so that recording a
transaction takes seconds rather than requiring me to choose a category from a
taxonomy.

**Why this priority**: The product's promise is that the user does no financial
bookkeeping. Requiring a category would invert that.

**Independent Test**: Enter transactions covering varied merchants and confirm
each receives a proposed category without the user selecting one, and that a
proposal can be corrected if wrong.

**Acceptance Scenarios**:

1. **Given** a description of a known merchant, **When** the user enters it,
   **Then** the system proposes a category and the user is not required to
   confirm it.
2. **Given** a description matching no known merchant, **When** it is entered,
   **Then** the row is left uncategorized rather than guessed into a wrong
   bucket, and the user may correct it.
3. **Given** the user corrects a category, **When** the correction is saved,
   **Then** it is recorded as a user correction, not as a system determination.

---

### User Story 3 — My mistake is fixable without losing the record (Priority: P2)

As a user, I mistype an amount or date, **When** I correct it, **Then** the
correction is traceable rather than silently overwriting what I entered.

**Why this priority**: Trust in a financial ledger depends on corrections being
visible. Silent overwriting is how errors become undetectable.

**Independent Test**: Correct an entry and confirm the prior value remains
visible in the record's history.

**Acceptance Scenarios**:

1. **Given** a transaction I entered, **When** I correct a field, **Then** the
   correction is applied and the previous value remains inspectable.
2. **Given** a transaction I entered, **When** I delete it, **Then** the system
   asks for confirmation and records the removal.
3. **Given** a manually entered transaction, **When** I try to delete it,
   **Then** the system explains the consequence before acting.

---

### Edge Cases

- An amount of zero, which must be refused as it is not a transaction.
- A negative amount, which must be expressed as a direction, not a sign.
- A date in the future, which must be refused or flagged.
- A date before any statement period, which must not break period comparison.
- Entering an amount with more precision than the currency allows.
- Entering while offline, which must not lose the entry silently.
- A very large number of manual entries, which must not degrade the interface.
- Entering an amount in Bangla numerals.

## Requirements

### Functional Requirements

- **FR-001**: The user MUST be able to create a transaction by entering a date,
  an amount, a direction, and a description.
- **FR-002**: The system MUST categorize an entered transaction without
  requiring the user to choose a category.
- **FR-003**: A transaction the system cannot categorize MUST remain
  uncategorized. The system MUST NOT assign a category it cannot justify.
- **FR-004**: Every entered transaction MUST be recorded as user-asserted and
  MUST be visibly distinguished from an extracted or engine-derived row.
- **FR-005**: Confidence MUST NOT be reported for a user-asserted transaction,
  because extraction confidence does not apply. The record MUST state its
  provenance instead.
- **FR-006**: The system MUST reuse the deterministic financial engine for all
  totals, breakdowns, trends, and savings involving entered transactions. An
  entered row MUST carry the same weight as any other row.
- **FR-007**: The system MUST validate amount, direction, and date at entry and
  refuse invalid input with a plain message.
- **FR-008**: Bangla numerals MUST be accepted and normalised.
- **FR-009**: The system MUST flag a likely duplicate without discarding the
  user's entry.
- **FR-010**: Corrections MUST be recorded with the previous value retained.
- **FR-011**: Deletion MUST require confirmation and MUST be recorded.
- **FR-012**: Manual entry MUST NOT be a required step in the upload-to-clue
  path. The loop described in `PRODUCT.md` MUST remain fully automatic.
- **FR-013**: The system MUST NOT require the user to confirm categories, select
  detectors, or choose which clue to see.
- **FR-014**: The system MUST scope every entered record to the authenticated
  identity.
- **FR-015**: The system MUST NOT execute, transfer, or schedule anything as a
  result of entry.
- **FR-016**: Manual entry MUST be reachable within the primary loop in at most
  two interactions.
- **FR-017**: Entry MUST be usable at a 375 px viewport and MUST support
  Bengali input and messaging.
- **FR-018**: Evidence MUST apply only to extracted rows. An entered row MUST
  NOT be shown with fabricated evidence or a document location.

### Key Entities

- **Manual Entry**: a user-asserted transaction with date, amount, direction,
  description, and optional correction history. Carries provenance stating it
  was entered by hand.
- **Category Proposal**: a system suggestion for an entered row, accepted
  silently and correctable by the user.
- **Correction Record**: the prior and current value of a corrected field.
- **Duplicate Flag**: a probable overlap with an existing row, recorded but not
  acted upon.

### Scope Boundaries

**In scope**: creating, correcting, and deleting user-asserted transactions;
automatic categorization; validation; Bangla numerals; duplicate flagging.

**Out of scope**: bulk or CSV import by hand, receipt photo entry, scheduled or
recurring manual entries, splitting a transaction across categories, attaching
evidence to an entered row, and any automation of entry.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A user can record a transaction from a cold start in under 20
  seconds with no prior statement uploaded.
- **SC-002**: At least 90% of entered transactions receive a category proposal,
  and no transaction receives a category the system cannot justify.
- **SC-003**: 100% of entered transactions appear in period totals, category
  breakdowns, and trend figures with the same treatment as extracted rows.
- **SC-004**: Zero entered transactions display an extraction confidence value.
- **SC-005**: Zero entered transactions display evidence or a document location.
- **SC-006**: Zero invalid entries are accepted, and every rejection states a
  plain reason.
- **SC-007**: 100% of corrections and deletions are recorded and inspectable.
- **SC-008**: The full entry path works at a 375 px viewport in both English and
  Bengali.
- **SC-009**: Bangla numerals entered for an amount produce the same result as
  Latin numerals.

## Assumptions

- Manual entry is additive and sits outside the automatic upload-to-clue loop.
- The user is not asked to categorize. The system proposes.
- Entry is a single-row interaction; batch entry is deferred.
- The system treats a user-asserted row as trustworthy for the user's own
  analysis while recording that the user asserted it.
- Persistence follows decision D2 in `CONFLICT.md`; if records do not survive a
  restart, the interface must say so.
- Manual entries participate in duplicate detection and period comparison on
  equal footing with extracted rows.
