# Feature Specification: Saving Recommendations

**Feature Branch**: `006-saving-recommendations`

**Created**: 2026-10-01

**Status**: Draft — unblocked by constitution 1.1.0 (2026-10-01)

**Input**: User description: "5. ai generated recommendations on how to save money and stuff"

## Problem State

The data model for recommendations already exists and is populated by the
financial engine, and nothing renders it. `GET /v1/recommendations` has zero
callers. `Recommendation` already carries a title, description, savings bounds,
`calculation_method`, `calculation_version`, and supporting transaction
identifiers, which is the correct shape. Two problems block it: the bounds are
summed independently across every recommendation, so the minimum comes from one
lever and the maximum from another and produces a range wider than any single
action supports; and the derivation constants behind them are bare literals with
no citation — 25% and 45% of micro-spend, 40% and 70% of category change, a
400 BDT floor, a 5-order floor, a 35% order cut, and a 15% ticket variance.

## Conflict Note

The constitution permanently bans "investment advisor" and "autonomous
budgeting". This spec stays clear of both by construction: recommendations are
bounded to reducing spending the system has already identified as a leak, name
no investment or financial product, and enforce nothing. It also revises
`PRODUCT.md` ledger #6, which currently specifies a single static line at 25% of
the pattern total and flags that figure as an assumption.

## User Scenarios & Testing

### User Story 1 — See what I could actually change (Priority: P1)

As a user, I see concrete suggestions tied to my own transactions with a
realistic saving range each, so that I know what action would help.

**Why this priority**: This is the core of the request, and the existing data
model is already close to correct.

**Independent Test**: For a populated dataset, verify each recommendation's
bounds equal the engine computation for that recommendation's own supporting
transactions.

**Acceptance Scenarios**:

1. **Given** an identified spending pattern, **When** recommendations are
   generated, **Then** each names the specific change, the transactions involved,
   and a saving range derived from those transactions.
2. **Given** two recommendations, **When** they are shown together, **Then** each
   carries its own range and no combined figure is presented as achievable by
   either.
3. **Given** a recommendation with no supporting transactions, **When** it would
   be generated, **Then** it is not presented as a finding.

---

### User Story 2 — Check the arithmetic (Priority: P1)

As a user, I can see how each figure was arrived at, so that I can judge whether
the suggestion is sensible rather than magic.

**Why this priority**: Constitutional Principle VI and Principle I. A saving
figure without a derivation is exactly the unauditable LLM arithmetic the
constitution prohibits.

**Independent Test**: For every recommendation, confirm the stated derivation
reproduces the stated bounds from the stated transactions.

**Acceptance Scenarios**:

1. **Given** a recommendation, **When** the user inspects it, **Then** the
   calculation method, its version, and the contributing transactions are shown.
2. **Given** the derivation involves a proportion of a total, **When** the user
   inspects it, **Then** the proportion, the base total, and both are visible.
3. **Given** a figure the system estimates rather than measures, **When** it is
   shown, **Then** it is labelled an estimate.

---

### User Story 3 — Not be judged for it (Priority: P1)

As a user, I am not told I was irresponsible or wasteful, so that I am willing to
come back and act on this.

**Why this priority**: `PRODUCT.md` requires zero shaming language across 20
generated clues. Shaming is a product failure, not a tone preference — it drives
the user away from the one thing that would help them.

**Independent Test**: Generate 20 recommendations and check for prohibited
language and for savings promises.

**Acceptance Scenarios**:

1. **Given** any generated recommendation, **When** it is displayed, **Then** it
   describes a pattern and a possible change without characterising the user.
2. **Given** any recommendation, **When** it is displayed, **Then** it states a
   possible change and does not promise a specific future saving.

---

### User Story 4 — Act on one and see it reflected (Priority: P2)

As a user, I mark a recommendation as acted on and see its effect over the
following weeks, so that I know whether it was worth it.

**Why this priority**: Closing the loop is genuinely valuable but requires
reliable period comparison, which depends on spec 004.

**Independent Test**: Mark a recommendation acted on, then compare the affected
category across periods and confirm the tracking is visible.

**Acceptance Scenarios**:

1. **Given** a recommendation, **When** the user marks it acted on, **Then** it
   is recorded and shown as tracked.
2. **Given** a tracked recommendation and later periods, **When** the user views
   it, **Then** the affected category's change is shown with an estimate label
   where the period is partial.

---

### Edge Cases

- A pattern with too few transactions to support a recommendation.
- A saving bound that rounds to zero.
- A recommendation whose bound exceeds the category's actual monthly spend.
- Overlapping recommendations that both target the same transactions, where
  claiming both would double count.
- A partial current period, where acting on advice is not yet measurable.
- A user with no detected patterns at all.
- A recommendation for a category the user has since stopped using.

## Requirements

### Functional Requirements

- **FR-001**: The user MUST see recommendations derived from their own detected
  spending patterns.
- **FR-002**: Every recommendation MUST name a specific, describable change
  rather than a general principle.
- **FR-003**: Every recommendation MUST carry a saving range computed by the
  deterministic financial engine from that recommendation's own supporting
  transactions.
- **FR-004**: Saving bounds MUST NOT be summed across recommendations into a
  single combined figure. Each range MUST stand alone, and any combined figure
  that is shown MUST be explicitly labelled as non-additive.
- **FR-005**: Where recommendations overlap on the same transactions, the system
  MUST either merge them or state the overlap, so a user cannot believe both
  ranges are independently achievable.
- **FR-006**: Every recommendation MUST expose its calculation method, its
  calculation version, and its supporting transactions.
- **FR-007**: Every derivation constant MUST be named, justified, and held in
  one place rather than scattered as bare literals. Each MUST state its
  calibration basis and be versioned.
- **FR-008**: Estimates MUST be labelled as estimates. Facts MUST be labelled as
  facts.
- **FR-009**: A recommendation MUST NOT be generated without at least one
  supporting transaction.
- **FR-010**: A saving bound MUST NOT exceed the actual spend in the affected
  category for the period.
- **FR-011**: Recommendations MUST NOT contain shaming language, and MUST NOT
  characterise the user's judgment, character, or discipline.
- **FR-012**: Recommendations MUST NOT promise a specific saving. Wording such as
  "you will save" is prohibited.
- **FR-013**: Recommendations MUST NOT concern investments, securities,
  insurance, loans, or any named financial product.
- **FR-014**: Recommendations MUST NOT enforce, schedule, or automatically apply
  any spending limit. They are advice only.
- **FR-015**: The model MUST NOT originate any figure in a recommendation. It
  may phrase engine output and select which recommendations to surface.
- **FR-016**: When the model service is unavailable, recommendations MUST still
  be produced through deterministic phrasing.
- **FR-017**: Recommendations MUST scope to the authenticated identity.
- **FR-018**: User feedback on a recommendation MUST be recorded and associated
  with it.
- **FR-019**: Acting on a recommendation MUST create no automatic record,
  transaction, or change to any financial figure.
- **FR-020**: Where the period is partial, a recommendation MUST state that its
  figures are provisional.
- **FR-021**: Recommendations MUST exist in Bengali at parity with English.
- **FR-022**: The recommendation surface MUST work at a 375 px viewport, and
  every derivation MUST be expandable to reveal its transactions and arithmetic.
- **FR-023**: The system MUST state when no recommendations exist, rather than
  presenting an empty surface.

### Key Entities

- **Recommendation**: a specific suggested change, with a name, description, an
  own saving range, a derivation, and supporting transactions.
- **Derivation**: the named method and version used to compute a range, with its
  constants recorded alongside it.
- **Savings Range**: a per-recommendation lower and upper bound, never summed
  across recommendations into a single claim.
- **Overlapping Set**: recommendations sharing supporting transactions, so the
  user is not misled into believing both ranges are additive.
- **Recommendation Feedback**: a user judgement recorded against a
  recommendation.
- **Tracked Recommendation**: one the user has marked as acted on, used to
  display later change in the affected category.

### Scope Boundaries

**In scope**: generating and displaying recommendations; per-recommendation
ranges; derivation transparency; named and versioned constants; certainty
labels; non-shaming language; Bengali parity; feedback and tracking.

**Out of scope**: investment or product advice, budget enforcement, automatic
limits, goal-linked automated saving, forecasting, comparison against other
users, and any recommendation not derived from the user's own detected
patterns.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of recommendation ranges reproduce exactly from their stated
  derivations and stated supporting transactions.
- **SC-002**: Zero combined savings figures are presented without a non-additive
  label.
- **SC-003**: Zero recommendations are displayed without at least one supporting
  transaction.
- **SC-004**: Zero recommendations across 20 generated samples contain shaming
  language or a savings promise.
- **SC-005**: Zero recommendations reference an investment, insurance, or loan
  product.
- **SC-006**: Zero derivation constants remain as unnamed literals; all are
  named, documented, and versioned.
- **SC-007**: Zero recommendations are enforced automatically; no spending limit
  is applied anywhere in the system.
- **SC-008**: With the model service unavailable, 100% of detected patterns
  still yield a recommendation.
- **SC-009**: Every recommendation is fully inspectable to its arithmetic and
  transactions at a 375 px viewport, in both languages.

## Assumptions

- The existing `Recommendation` shape is retained; it already carries the right
  fields.
- Detection of the underlying patterns is a prerequisite; recurring detection
  (spec 007) materially improves subscription and bill recommendations and is
  scheduled before this spec's generator is finalised.
- Constants are documented and versioned in one place, not scattered through the
  engine.
- Recommendation wording is reviewed against the prohibited-language list as a
  gate, not trusted to a prompt alone.
- Overlap detection is included because presenting two non-additive ranges as
  independently achievable is a misleading claim.
- Acting on a recommendation is user-initiated and advisory; the system never
  applies anything.
