# Feature Specification: Spending Trends

**Feature Branch**: `004-spending-trends`

**Created**: 2026-10-01

**Status**: Draft — unblocked by constitution 1.1.0 (2026-10-01)

**Input**: User description: "3. visual dashboard showing monthly and weekly and maybe yearly trends"

## Problem Statement

There is no time dimension anywhere in the product. Zero charts exist: no line,
bar, area, sparkline, or heatmap, and no charting library is installed. Every
figure is a single aggregate. The only period handling is two hardcoded month
literals in the data layer, so a statement from any month other than September
2026 produces an empty comparison with zero totals and zero insights. A user
cannot see whether they are spending more or less than last month, cannot tell
which weekday is expensive, and cannot see the shape of a year.

## Conflict Note

`PRODUCT.md` will-not-build ledger #4 states "Dashboard and charts. Instead: one
clue card." That promise was already abandoned by the shipped `DashboardView`,
which renders four metric tiles, a category breakdown, a merchant list, and a
ledger table. This spec admits a read-only trend surface while keeping the
constraint that matters: every point links to its contributing transactions, and
no vanity visualisation is introduced.

## User Scenarios & Testing

### User Story 1 — See whether I am spending more or less (Priority: P1)

As a user, I compare this month against previous months and see clearly whether
my spending is rising or falling, so that I know whether to be concerned.

**Why this priority**: A trend without a comparison is just a number. The
comparison is the insight.

**Independent Test**: With at least three months of data, verify that each
monthly point equals the engine total for that month and that the direction of
change matches the engine's computed change.

**Acceptance Scenarios**:

1. **Given** three months of transactions, **When** the user selects a monthly
   view, **Then** one point per month appears, each equal to that month's total
   expenses.
2. **Given** the current month is incomplete, **When** it is plotted, **Then** it
   is visually marked as partial and is excluded from period-over-period
   percentage comparisons.
3. **Given** a month with no transactions, **When** it falls in the range,
   **Then** the axis keeps the gap and the period is reported as having no data,
   rather than the month being omitted or shown as zero spending.

---

### User Story 2 — Find the expensive week (Priority: P1)

As a user, I see my spending broken down by week, so that I can identify which
part of the month costs me the most.

**Why this priority**: Weekly granularity is where an actionable pattern
usually appears; monthly totals are too coarse to act on.

**Independent Test**: With data spanning several weeks, verify each weekly point
equals the engine total for that week and that weeks partition the range without
gap or overlap.

**Acceptance Scenarios**:

1. **Given** transactions spanning four weeks, **When** the user selects a
   weekly view, **Then** one point per week appears with correct totals.
2. **Given** a week boundary that falls mid-week, **When** weeks are grouped,
   **Then** the grouping rule is stated in the interface rather than applied
   silently.

---

### User Story 3 — Drill into any point (Priority: P1)

As a user, I click a point on a trend and see the transactions behind it, so
that a number on a chart is never a dead end.

**Why this priority**: This is constitutional Principle VI applied to
visualisation. A chart point with no drill-down is an unverifiable claim.

**Independent Test**: Click every point and confirm the listed transactions sum
to the displayed value.

**Acceptance Scenarios**:

1. **Given** a monthly point, **When** the user selects it, **Then** the
   contributing transactions are listed and their sum equals the point value.
2. **Given** a category breakdown within a selected period, **When** the user
   selects a category, **Then** only that category's rows are shown.
3. **Given** a trend point with no contributing rows, **When** the user selects
   it, **Then** the system states there is no data rather than showing an empty
   drill-down.

---

### User Story 4 — See the year in shape (Priority: P2)

As a user, I see a year-level view so I can judge whether my habits are changing
over the long term.

**Why this priority**: Yearly view is a convenience over monthly data; it adds
little that monthly data does not already support, so it ranks last.

**Independent Test**: With twelve months of data, verify each monthly roll-up
equals the sum of its transactions and the year total equals the sum of months.

**Acceptance Scenarios**:

1. **Given** twelve months of data, **When** the user selects a yearly view,
   **Then** one point per month appears with the year total available.
2. **Given** fewer than twelve months of data, **When** the yearly view is
   selected, **Then** the missing months are shown as gaps and the coverage is
   stated.

---

### Edge Cases

- A single transaction in the entire range.
- A range spanning a year boundary, where calendar and fiscal year differ in
  Bangladesh.
- A partial week at the start or end of the range.
- A period containing only income, producing no expense series.
- Manual and extracted rows present in the same period.
- A category that appears in one week and not another.
- Bengali calendar boundaries, which differ from Gregorian.
- Very long ranges where daily granularity would produce an unreadable axis.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST provide daily, weekly, monthly, and yearly views
  over a user-selected range.
- **FR-002**: Every point MUST be computed by the deterministic financial
  engine. No component may compute a trend value.
- **FR-003**: Grouping MUST partition the range exactly, with no transaction
  counted twice and none omitted.
- **FR-004**: The grouping rule MUST be stated in the interface, including how
  weeks and years are bounded.
- **FR-005**: A partial period MUST be marked as partial and MUST be excluded
  from period-over-period percentage comparisons.
- **FR-006**: A period with no data MUST be shown as a gap with an explicit
  no-data label, never as zero spending.
- **FR-007**: Every point MUST be drillable to the transactions that produced
  it, and the sum of those transactions MUST equal the displayed value.
- **FR-008**: Period-over-period comparison MUST be computed by the engine and
  MUST be labelled as an estimate when the comparison period is partial.
- **FR-009**: The user MUST be able to select the range. The system MUST NOT
  hardcode a month or a month pair.
- **FR-010**: The series MUST distinguish facts from estimates. A partial-period
  figure MUST be labelled an estimate.
- **FR-011**: The view MUST show coverage, stating how much of the selected
  range actually contains data.
- **FR-012**: Trend figures MUST incorporate manual entries on equal footing
  with extracted rows.
- **FR-013**: Visualisation MUST be readable without relying on colour alone.
  Each series MUST be identifiable by label as well as hue.
- **FR-014**: The view MUST meet accessibility requirements, including keyboard
  operation of the drill-down and accessible names for each data point.
- **FR-015**: The view MUST work at a 375 px viewport, where dense ranges MUST
  reduce granularity or scroll rather than overlap.
- **FR-016**: Axis labels, tooltips, and empty states MUST exist in Bengali at
  parity with English.
- **FR-017**: The system MUST NOT introduce pie charts, 3D rendering, gauges, or
  any visualisation that cannot be traced to underlying rows.
- **FR-018**: The system MUST NOT display a period comparison that the engine
  cannot compute from available data.
- **FR-019**: The view MUST render a clear empty state explaining that no
  transactions exist for the range, rather than an axis with no data.
- **FR-020**: Server-supplied period boundaries MUST be used for grouping so
  that client and server never disagree about which rows belong to a period.

### Key Entities

- **Period Selection**: the user's chosen range and granularity.
- **Trend Series**: an ordered set of points for one measure across a range,
  each point carrying its value, its coverage state, and its contributing rows.
- **Data Point**: one bucket's value, whether it is complete or partial, and the
  transactions behind it.
- **Coverage**: how much of the selected range contains data, so the user can
  tell a spending drop from missing records.

### Scope Boundaries

**In scope**: daily, weekly, monthly, and yearly aggregation; user-selected
ranges; partial-period labelling; drill-down to transactions; empty and gap
states; accessible rendering.

**Out of scope**: real-time or streaming updates, comparison against other
users or benchmarks, forecasting and prediction, budget-versus-actual
enforcement, custom report generation, and exporting charts as images.

## Success Criteria

### Measurable Outcomes

- **SC-001**: For any range with data, the sum of all monthly points equals the
  engine total for that range, verified across the three fixtures.
- **SC-002**: 100% of drill-downs list transactions whose sum exactly equals the
  clicked point.
- **SC-003**: Zero partial periods are included in a percentage comparison
  without an estimate label.
- **SC-004**: Zero empty periods are rendered as zero spending.
- **SC-005**: A user can find their highest-spending week in under 15 seconds.
- **SC-006**: The full trend path works at a 375 px viewport with no overlapping
  labels or horizontal page scroll.
- **SC-007**: Every data point is reachable by keyboard and has an accessible
  name that does not rely on colour.
- **SC-008**: Every user-facing string in the trend surface has a Bengali
  counterpart at parity.
- **SC-009**: The view renders correctly for a range spanning a year boundary,
  with the grouping rule stated in the interface.

## Assumptions

- Calendar grouping follows the Gregorian calendar, with the rule stated in the
  interface. Bangla calendar grouping is deferred and noted as a known gap.
- Weeks start on a fixed weekday, stated in the interface.
- The engine gains period-bucketing capability; it does not exist yet and is the
  principal engineering cost of this spec.
- Existing period comparison in the engine is reused where it already produces
  a correct result, and reworked where it hardcodes month literals.
- The chart is rendered with a lightweight approach consistent with `DESIGN.md`:
  hairline axes, ink text, no chart library that fights the design system.
- Chart rendering remains server-agnostic — the engine computes, the view draws.
