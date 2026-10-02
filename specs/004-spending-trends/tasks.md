# Tasks — 004 Spending Trends

**Feature**: 004-spending-trends
**Spec**: [`spec.md`](./spec.md)
**Status**: Implemented. Engine, capability, and surface all landed in one pass.

## Approach

The constitution fixes the tool surface at eight capabilities, so a ninth
(`spending_trend`) would have needed an amendment. A trend is a spending pattern
over time, so `spending_patterns` gained an optional `granularity` and now returns a
`series` beside its `patterns`. One call, one read of the same rows, so the chart and
its narrative cannot disagree — and an existing caller that omits `granularity` gets
byte-identical behaviour to before.

Every figure is computed by `financialEngine.buildTrendSeries`. `TrendsView`
computes no total, no percentage, and no bar height of its own.

## Engine — `server/financialEngine.ts`

- [x] `TREND_GRANULARITIES` — a closed set of four; an unrecognised value is refused,
      never coerced into a bucket whose meaning the user never chose
- [x] `bucketFor(date, granularity)` — daily, ISO Monday-to-Sunday weeks keyed by the
      Monday, calendar months (leap February is not clamped), calendar years
- [x] `bucketRange(start, end, granularity)` — derived from the calendar, not from
      the transactions, which is what makes an empty period appear as a gap (FR-006)
- [x] `describeGrouping(granularity)` — the rule as a sentence, so the interface
      states it rather than implying it (FR-004)
- [x] `buildTrendSeries(...)` — totals per bucket, income kept out of expenses,
      `partial` and `comparable` flags, per-point `transaction_ids`, coverage
- [x] `omitted_outside_range` counted and reported, never folded into a neighbour
- [x] No filter on `extraction_method` anywhere — manual entries are on equal
      footing (FR-012)

## Capability — `spending_patterns`

- [x] `granularity` validated against the closed vocabulary; `CapabilityError`
      `invalid_params` on anything else
- [x] `series` returned beside `patterns`
- [x] A period with spending but no pattern returns the chart anyway. "No recurring
      pattern" and "no spending" are different answers
- [x] `evidence.transaction_ids` covers every row behind every point, so any bar can
      be drilled to (FR-007)

## Surface — `src/components/TrendsView.tsx`

- [x] Granularity selector over the four values, `aria-pressed` on the active one
- [x] The grouping rule displayed verbatim from the server
- [x] Coverage shown: days with rows over days in range, as a percentage
- [x] A bucket with no rows renders its note, not a zero-height bar (FR-006)
- [x] A partial bucket is hollow and excluded from comparison (FR-005)
- [x] Comparison withheld unless the engine says every bucket is comparable (FR-018)
- [x] Each bar is a `button`, so every drill-down is keyboard reachable (FR-014)
- [x] Value written as text beside every bar; nothing carried by colour or width
      alone (FR-013)
- [x] Plain bars only — no pie, 3D, or gauge (FR-017)
- [x] Empty state explaining what to do, in both languages (FR-019, FR-016)
- [x] Wired into `App` and `Navbar` as the `trends` tab; the period comes from the
      ledger, never from a client-chosen range (FR-020)

## Tests — `server/trends.test.ts` (21)

- [x] Bucket rules per granularity, including the ISO week boundary and leap February
- [x] **FR-003** the buckets partition the range exactly, proven at all four
      granularities by summing the points and comparing to the input, and by
      checking no id appears twice
- [x] An out-of-range row is omitted and counted
- [x] **FR-006** an empty period still produces its buckets, each with a reason
- [x] **FR-005** a range cutting into a week marks it partial and not comparable
- [x] **FR-018** a series with any partial bucket refuses comparison
- [x] **FR-011** coverage is reported as a proportion
- [x] **FR-012** a `USER_ASSERTED` row appears in the series; income kept out of
      expenses
- [x] **FR-007** every point names its rows; consecutive buckets do not overlap
- [x] `screens.test.ts` renders `TrendsView` against a real engine-built series

## Verification

Live against a 25-row September statement. Totals are **৳27,528 at MONTHLY, WEEKLY
and DAILY alike**, which is the direct observable form of FR-003: the same rows,
partitioned three different ways, reconcile to the same figure.

| Granularity | Points | Gaps | Comparison |
|---|---|---|---|
| MONTHLY | 1 | 0 | allowed |
| WEEKLY | 5 | 1 (the trailing part-week) | **withheld** — first and last weeks are cut by the range |
| DAILY | 30 | 6, each with a reason | allowed |

`granularity: "FORTNIGHT"` is refused with the allowed set named in the message.
