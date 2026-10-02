# Specification Inventory — Kothay Gelo?

**Created**: 2026-10-01
**Status**: Draft, pending governance decision
**Basis**: Codebase audit of `server.ts`, `server/*.ts`, `src/`, and `PRODUCT.md` vs `.specify/memory/constitution.md`

This index lists every specification required to make the application
functional and to deliver the five requested capabilities. Each entry states
what exists today, what is missing, and what must be built.

---

## 1. Governance conflict — must be resolved first

`.specify/memory/constitution.md` states: *"When two authoritative artifacts
conflict, the conflict MUST be reported and reconciled before implementation
continues."* Four of the five requested capabilities conflict with
`PRODUCT.md`'s will-not-build ledger, and two conflict with the constitution's
MVP Scope Discipline. Details in [`CONFLICT.md`](./CONFLICT.md).

| Requested | Conflicts with | Reconcilable? |
|---|---|---|
| 1. Manual transaction entry | PRODUCT.md ledger #8, Q2 "no human judgment mid-loop" | Yes — entry can be additive, outside the upload loop |
| 2. Questioning spending habits | PRODUCT.md ledger #7, constitution scope ("general-purpose chatbot") | Yes, if bounded to the fixed tool surface — which is exactly what constitution Principle II already describes |
| 3. Visual dashboard, weekly/monthly/yearly trends | PRODUCT.md ledger #4 "Dashboard and charts. Instead: one clue card." | Requires amending PRODUCT.md |
| 4. Authentication and authorization | PRODUCT.md ledger #1 "Accounts and login. Instead: none." | Requires amending PRODUCT.md |
| 5. AI saving recommendations | Constitution scope bans "investment advisor" and "autonomous budgeting" | Yes, if bounded to spending-leak reduction with no investment products |

**The constitution must be amended before any of these are implemented.** That
means a file edit, a version bump, and an updated Sync Impact Report. See
`CONFLICT.md` for the exact proposed amendments.

---

## 2. What the codebase actually is today

The audit found this is a **scaffold, not a working application**. The gap
between what appears implemented and what is implemented is the dominant fact
that shapes this inventory.

| Area | Reality |
|---|---|
| Authentication | Theatrical. `server.ts:31` returns a hardcoded user id and ignores the request. OTP compares against the source literal `'123456'`. The issued access token is never stored and never read. No session, no middleware. All 6 auth routes have zero frontend callers. |
| Authorization | Not enforced. 7 routes compare ownership against that same compile-time constant, so the check can never fail. 5 further routes (`uploads/:id/status`, `processing/:job_id`, `evidence/:id`, `insights/:id/feedback`, insight narration) perform **no** ownership check at all. |
| Persistence | None. Zero file or database I/O anywhere. All uploads, edits, goals, and audit events are lost on restart. `dotenv` is a dependency but never imported, so `.env` is never read. |
| PDF extraction | Does not exist. No PDF library installed. The browser sends a `.pdf` through `File.text()`, so binary bytes hit the regex parser. `UploadView` advertises PDF support that cannot work. |
| Deterministic parser | Defective. `pipeline.ts:205` takes the first number on the line, which matches `202` out of the date `2026-09-01` before reaching the real amount. Non-ISO dates are forced to `2026-09-15`. Confidence is hardcoded `0.92` for every row. Evidence bounding boxes are fabricated coordinates. |
| Fixed tool surface (constitution II) | Not implemented. No tool registry, no capability dispatch, no parameter validation. The 8 approved capabilities are not addressable. |
| Recurring detection | Absent entirely. No code path. The fixtures contain September rent and August rent at an identical 18,000 and neither is detected. |
| Period comparison | Partial. Implemented, but the comparison window is hardcoded to the literal strings `'2026-09'` and `'2026-08'`. A statement from any other month yields an empty current set, all totals zero, and zero insights. |
| Evidence (constitution VI) | Violated on the seed data the app boots with. 13 of 18 golden transactions and 6 of 6 previous-month rows carry `evidence_ids: []`, yet the insights built from them assert `confidence: 0.99`. |
| Engine authority (constitution I) | Violated on the extraction path. `pipeline.ts:137` writes the LLM's own amount into `Transaction.amount`, and that amount then feeds every downstream total. `gemini.ts:178` fabricates `confidence: 0.9` for any missing field. Also violated in the client: 8 separate places compute financial values the server already sent. |
| Golden fixtures | One exists. `PRODUCT.md` and `AGENTS.md` both gate on 3. The single fixture is synthetic with a hand-typed sequential `TrxID` pattern. |
| Dead routes | 17 of 37 routes have no frontend caller, including `/v1/recommendations`, all of `/v1/auth/*`, `/v1/users/me`, and the entire settings/consent/audit surface. |
| Dead code | `db.merchants` is never written. `MarqueeBanner` and `LeaksMasonrySection` are never imported. `pipeline.ts:222` is an empty loop body. |
| Latency | `pipeline.ts:60` sleeps 400 ms per stage transition purely to animate the UI, adding a ~3.2 s floor to every upload against a 20 s budget. |

**PRODUCT.md is also already out of date, in the opposite direction.** The
ledger promises one clue card and no dashboard, goals, review queue, settings,
or multi-source support — but the code ships seven workspace views, a goals
feature, a review queue, and Nagad/bank/card claims. `PRODUCT.md` needs
reconciling regardless of what is decided about the five requests.

---

## 3. Specification inventory

Ordered by dependency. Each is independently shippable and independently
verifiable.

| ID | Spec | Covers | Priority |
|---|---|---|---|
| 001 | [foundation-authority](./001-foundation-authority/spec.md) | Real identity and sessions, per-request ownership enforcement, the fixed tool surface, engine-authoritative reads, removal of client-side and fabricated financial math | P0 — gate for everything |
| 002 | [statement-extraction](./002-statement-extraction/spec.md) | Real PDF text extraction, parser repair, upload validation, evidence on every row, 3 golden fixtures, removal of the artificial delay | P0 — gate for every insight |
| 003 | [manual-transaction-entry](./003-manual-transaction-entry/spec.md) | **Requested 1.** Hand-entered transactions with provenance and no fabricated confidence | P1 |
| 004 | [spending-trends](./004-spending-trends/spec.md) | **Requested 3.** Weekly, monthly, and yearly time series over a real, user-selected period | P1 |
| 005 | [spending-analyst-qa](./005-spending-analyst-qa/spec.md) | **Requested 2.** Natural-language questions answered only through the fixed tool surface | P1 |
| 006 | [saving-recommendations](./006-saving-recommendations/spec.md) | **Requested 5.** Deterministic recommendations with cited derivation, no investment products, no shaming | P1 |
| 007 | [recurring-detection](./007-recurring-detection/spec.md) | Subscription and bill detection; prerequisite for a real `007` baseline and for credible recommendations | P1 |

---

## 4. Cross-cutting requirements

These apply to every spec above and are not restated in each one.

- **Engine is authoritative.** No view, component, or model may originate a
  number. Percentage shares, period groupings, savings figures, and
  recommendation bounds are computed once in the financial engine and sent.
  The frontend formats; it does not calculate.
- **No fabricated values.** Remove `+12` and `?? 12` row-count fallbacks,
  `× 12` annualisation, `× 3` goal inflation, `remaining / 6` horizons,
  hardcoded `0.92`/`0.9` confidences, and hardcoded future dates. Absence is
  reported as absence.
- **Evidence on every claim.** Every insight, recommendation, and trend
  aggregate links to the transactions that produced it. A claim with no
  supporting rows cannot be displayed as a finding.
- **Certainty labels.** Facts, estimates, and insufficient data are visually
  distinct. Estimates from a partial period are labelled as partial.
- **Dataset isolation.** Identity comes from the server session, never from a
  client or model value. Every read and write is scoped to the session owner.
- **Imported data is data.** Merchant names and descriptions stay ordinary
  content and can never alter behaviour, permissions, or tool availability.
- **Read-only financial records.** Transactions are created from uploads or by
  the user, then are append-only corrections. No execution, no movement of
  money.
- **Bengali first-class.** Every user-facing string has a Bengali counterpart
  at parity, not a subset.
- **375 px first.** Every new surface works at 375 px and follows `DESIGN.md`.

## 5. Verification gap

`PRODUCT.md` defines 8 pass/fail metrics. None can currently be evaluated:
there is no test harness, only 1 of 3 required fixtures exists, and no metric
is instrumented. Spec 001 must establish the measurement path before any
acceptance criterion in any other spec can honestly be claimed as passing.
