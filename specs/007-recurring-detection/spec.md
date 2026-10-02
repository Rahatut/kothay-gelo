# Feature Specification: Recurring Detection

**Feature Branch**: `007-recurring-detection`

**Created**: 2026-10-01

**Status**: Draft — unblocked by constitution 1.1.0, depends on specs 001 and 004

**Input**: User description: "identified as a necessary spec during codebase audit"

## Problem Statement

The constitution names recurring expense detection as one of eight approved
capabilities. It does not exist. There is no code path for it anywhere in the
engine. The fixture data proves the gap concretely: September rent and August
rent are both present at an identical 18,000 BDT and neither is recognised as
recurring, because the only related detector counts merchant orders inside one
already-hardcoded month. A subscription charged on the 3rd of every month is
invisible to the system, which means the recommendations in spec 006 cannot
offer the single highest-value saving advice available — cancel or reduce a
standing commitment — and the user's question about their spending habits cannot
be answered for this entire class of spending.

## User Scenarios & Testing

### User Story 1 — See my standing commitments (Priority: P1)

As a user, I see every bill and subscription that repeats, with its amount and
how often it recurs, so that I know what I am committed to each month.

**Why this priority**: Standing commitments are usually the largest reliable
saving opportunity available, and they are currently entirely invisible.

**Independent Test**: Load the fixtures and verify each known recurring payment
is detected with the correct amount, period, and merchant, and that a
non-recurring payment is not.

**Acceptance Scenarios**:

1. **Given** a payment appearing at a regular monthly interval, **When** recurring
   detection runs, **Then** it is reported with its amount, frequency, merchant,
   and the transactions that establish the pattern.
2. **Given** a payment appearing at a regular weekly or quarterly interval,
   **When** detection runs, **Then** it is reported at the correct frequency.
3. **Given** a payment appearing once or twice, **When** detection runs, **Then**
   it is not reported as recurring.

---

### User Story 2 — Trust that a pattern is real (Priority: P1)

As a user, I can see the evidence behind each detected recurrence, so that a
recurring charge is never asserted without support.

**Why this priority**: Constitutional Principle VI. A recurring detection with
two data points, presented as certain, is exactly the kind of unfounded claim
the constitution prohibits.

**Independent Test**: For every detected recurrence, verify the cited
transactions establish the claimed interval and that the stated confidence
reflects the number of supporting observations.

**Acceptance Scenarios**:

1. **Given** a detected recurrence, **When** the user inspects it, **Then** every
   transaction establishing the pattern is listed with its date.
2. **Given** a pattern supported by two occurrences, **When** it is displayed,
   **Then** it is labelled as provisional rather than confirmed.
3. **Given** amounts that vary between occurrences, **When** it is displayed,
   **Then** the variation is shown rather than hidden behind a single figure.

---

### User Story 3 — Catch a recurring charge I did not expect (Priority: P2)

As a user, I am shown a repeating charge that I do not recognise, so that I can
check whether it is legitimate.

**Why this priority**: Valuable but a refinement; it depends on detection
quality being established first.

**Independent Test**: Detect a repeating charge absent from the user's known
subscriptions and confirm it surfaces distinctly from recognised ones.

**Acceptance Scenarios**:

1. **Given** a recurring charge the user has not acknowledged, **When**
   detection runs, **Then** it is surfaced separately from acknowledged
   commitments.
2. **Given** a charge that recurs but whose amounts vary widely, **When** it is
   surfaced, **Then** the variance is stated so the user can judge it.

---

### Edge Cases

- A bill paid on the 31st that falls in the next month some months.
- A subscription whose amount changes mid-year, such as a price increase.
- Two subscriptions from the same merchant with different amounts.
- A rent payment recorded from two different accounts in the same month.
- A recurring charge that stopped, which must be distinguishable from one that
  never started.
- A one-time large purchase that looks like a recurrence by coincidence.
- Weekly small payments that sum to a monthly commitment.
- A merchant whose name varies slightly between rows.
- Annual or quarterly premiums.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST detect payments recurring at weekly, monthly,
  quarterly, and annual intervals.
- **FR-002**: Detection MUST group by merchant or counterparty and MUST
  normalise name variation before grouping.
- **FR-003**: Detection MUST require at least two occurrences, and MUST label a
  pattern with exactly two occurrences as provisional.
- **FR-004**: Every detected recurrence MUST list the transactions that
  establish it, with dates and amounts.
- **FR-005**: Where amounts vary across occurrences, the system MUST show the
  range and the variation rather than a single figure.
- **FR-006**: The computed monthly and annual cost of a recurrence MUST be
  derived by the deterministic financial engine, not by the detector or the
  view.
- **FR-007**: A recurrence MUST NOT be reported when occurrences are too few or
  the interval too irregular to support the claim.
- **FR-008**: A stopped recurrence MUST be distinguishable from an active one.
- **FR-009**: Detection MUST run over a user-selected range rather than a
  hardcoded month, so that history is available before comparison exists.
- **FR-010**: Detection MUST operate over the full transaction history
  available to the identity, including manual entries.
- **FR-011**: Detection MUST NOT group transactions across identities.
- **FR-012**: Detection MUST NOT require the model. It MUST be deterministic and
  independently verifiable without any language model.
- **FR-013**: Detection MUST distinguish a recurring charge from a recurring
  category, and MUST NOT conflate a merchant's frequency within one month with
  recurrence across months.
- **FR-014**: Recurrence amounts MUST feed recommendations as supporting
  transactions, not as independently originated figures.
- **FR-015**: Detection MUST NOT classify a payment as recurring where the
  amount is so irregular that no reliable amount can be stated; the system MUST
  say so.
- **FR-016**: Detected recurrences MUST be inspectable and MUST exist in Bengali
  at parity.
- **FR-017**: Detection MUST NOT infer intent, and MUST NOT characterise a
  commitment as wasteful.
- **FR-018**: Where a recurrence spans a manual entry, provenance MUST remain
  visible per transaction.

### Key Entities

- **Recurring Pattern**: a merchant or counterparty with a detected interval, a
  frequency, an amount or amount range, a provisional or confirmed state, and
  its supporting transactions.
- **Occurrence**: one transaction participating in a recurring pattern, with its
  date, amount, and provenance.
- **Derived Cost**: the monthly and annual cost of a pattern, computed by the
  engine from its occurrences.
- **Provisional Pattern**: one supported by the minimum evidence, presented as
  such.

### Scope Boundaries

**In scope**: interval detection across weekly, monthly, quarterly, and annual
cadences; merchant normalisation; amount variance; evidence per pattern;
provisional labelling; engine-derived costs; exposure as an approved capability.

**Out of scope**: predicting future charges, price-change alerts, subscription
cancellation flows, bank-level automatic payment detection, and any inference
about why a commitment exists.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Every recurring payment present in the fixtures is detected, with
  correct amount, interval, and merchant.
- **SC-002**: Zero non-recurring payments are reported as recurring across all
  three fixtures.
- **SC-003**: 100% of detected recurrences list the transactions establishing
  them, and those dates exhibit the claimed interval.
- **SC-004**: 100% of patterns with exactly two occurrences are labelled
  provisional.
- **SC-005**: 100% of derived monthly and annual costs match the engine
  computation over the cited occurrences.
- **SC-006**: Zero detections require the model; the detector runs and verifies
  with the language model absent.
- **SC-007**: Detection over a user-selected range finds patterns that a
  hardcoded single-month window cannot.
- **SC-008**: A stopped recurrence is correctly distinguished from an active one
  in every fixture case.

## Assumptions

- Detection requires at least two occurrences, and two is treated as
  provisional. Three or more is confirmed.
- Merchant grouping normalises case, whitespace, and common punctuation, but
  does not attempt fuzzy merchant identity resolution.
- Weekly grouping is calendar-based, with the week boundary stated in the
  interface.
- Recurring detection is deterministic and lives in the financial engine, with
  no language model import, so it stays independently testable per Principle X.
- Detection benefits from more history, so the range is user-selected rather
  than fixed at one month.
- The rent case in the fixtures is the primary acceptance test, since it is a
  known, currently-missed detection.
