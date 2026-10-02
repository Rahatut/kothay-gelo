# Kothay Gelo? | Product Definition

**Build type**: MVP, scope-expanded.
**Constitution**: `.specify/memory/constitution.md` v1.1.0.
**Last reconciled**: 2026-10-01, after the specification inventory.

## What changed and why

This document previously described a single-clue, no-account, bKash-only
product. The shipped code had already outgrown it: seven workspace views, a
goals feature, a review queue, a settings surface, and claims to support Nagad,
cards, and multiple banks. It also under-described the product, promising a
privacy guarantee the code could not honour, because identity was a hardcoded
constant and tenant isolation was not enforced.

The product owner resolved four scope decisions on 2026-10-01, and the
constitution was amended from 1.0.0 to 1.1.0 to match. This file is now
reconciled with both the code and the amended constitution. See
`specs/CONFLICT.md` for the conflict that triggered this rewrite.

**Standing constraint**: the constitution outranks this document. If they
disagree, the constitution wins and the conflict is reported before work
continues.

---

## Persona

A Dhaka salaried professional who pays for most daily things through bKash and
Nagad, holds bank cards, withdraws cash from ATMs, and has never reconciled what
happened over a month. At month end they know the balance fell and not why.

## Job to be done

**State A**: A set of unreadable statements, a downloaded PDF or CSV, and the
feeling that money vanished.

**Core loop**: The system extracts and categorizes rows, runs deterministic
detectors, ranks findings, and has a model phrase the explanation using only
computed numbers. The user can also enter a transaction by hand, ask a question
about their own spending, and browse trends over any range they select.

**State B**: One ranked clue at a time on first load, each number linking to its
underlying transactions, alongside a workspace where the full ledger, trends,
recurring commitments, questions, and recommendations are available.

**Rule retained**: no human judgment inside the automatic loop. The user is not
required to confirm categories, select detectors, or choose which clue appears
first. Hand-entered rows and user corrections are additive and outside that
loop.

## Scope decisions of record

| Decision | Choice | Consequence |
|---|---|---|
| Identity | Full accounts with retained history | Real relational store; real sign-in; real tenant isolation |
| Persistence | Records survive restart | No in-memory-only stores |
| Constitution | Amended to 1.1.0 | Identity, bounded Q&A, trends, recommendations, multi-source admitted |
| Sources | Multiple admitted | bKash, Nagad, bank statements, delimited files. Bank APIs still prohibited |

## Success metrics

Retained from the original definition, plus two added by the amendment. All are
pass/fail gates. None is currently measurable — spec 001 must establish the
measurement path first.

| # | Condition |
|---|---|
| 1 | Across 3 fixtures, ≥95% of rows extracted with correct date, amount, and direction against recorded ground truth |
| 2 | Clue count and totals match hand computation on 100% of the fixtures |
| 3 | Tapping any figure lists transactions whose sum equals that figure |
| 4 | Upload to clue in ≤20s on a 100-row statement |
| 5 | Across 5 bad-file tests, zero raw errors; every failure shows a plain message plus a next step |
| 6 | Across 20 generated clues and recommendations, zero shaming words and zero savings promises |
| 7 | Full path works at a 375px viewport |
| 8 | 4 of 5 first-time testers explain what was found unprompted |
| 9 | **Added**: zero cross-identity reads or writes succeed in an adversarial pass over every data route |
| 10 | **Added**: every quantitative figure displayed matches the engine value, verified across every surface |

**North star**: valid first clues ÷ valid uploads ≥ 80%.

## In scope

- Accounts with sign-in and retained history, backed by a real database
- Statement upload and real text extraction for mobile wallets, bank statements,
  and delimited files
- Automatic categorization with a visible uncategorized state
- Deterministic detectors for category shift, micro-spend, merchant
  concentration, and recurring commitments
- One ranked clue on first load, with evidence and drill-down
- A read-only workspace: ledger, review queue, insights, trends, targets,
  settings
- Trends over daily, weekly, monthly, and yearly buckets across a
  user-selected range, with partial-period labelling
- Question answering restricted to the eight approved financial capabilities
- Saving recommendations bounded to detected leaks, each with its own
  derivation, bounds, and supporting transactions
- Manual transaction entry, user corrections, and export
- English and Bengali at parity throughout

## Will-not-build ledger

Rewritten 2026-10-01. Unchanged entries retain their original force.

1. ~~Accounts and login.~~ **Admitted** — see scope decisions. Identity exists
   solely to scope one person's data to one person.
2. ~~Other sources.~~ **Admitted** — bKash, Nagad, bank statements, delimited
   files. **Bank API integration remains permanently prohibited.**
3. **JPG/PNG/OCR upload.** Instead: text extraction only. Scanned images are
   rejected with a plain message directing the user to the original.
4. ~~Dashboard and charts.~~ **Admitted in bounded form** — read-only trends
   where every point drills to its transactions. No pie charts, no 3D, no
   gauges, no vanity visualisation.
5. **Multiple simultaneous clues on first load.** Instead: one ranked clue
   first, full results in the workspace.
6. **What-if scenarios.** Still out. The existing calculator is a
   demonstration surface, not a feature, and computes outside the financial
   engine. It is scheduled for removal or relocation to the engine.
7. ~~Chat with AI.~~ **Re-scoped** — free-form questions are permitted **only**
   where the eight approved capabilities can answer them. Unconstrained
   conversation remains prohibited.
8. **Required manual categorization.** Still out — the system categorizes.
   Manual *entry* of a transaction is admitted; the user is not asked to file it.
9. **History and return loop.** ~~Out.~~ **Admitted** with accounts. Retained
   history is a consequence of decision D1-B.
10. **Unverified security and privacy claims.** Still out. The interface states
    only what is true and verifiable. This entry was violated by the previous
    build and is the reason spec 001 is a P0 gate.
11. **Investment, securities, insurance, and loan advice.** Permanently out.
12. **Automatic spending limits or budget enforcement.** Permanently out.
    Recommendations are advice only and enforce nothing.
13. **General-purpose assistant.** Permanently out.
14. **Long-term memory of conversations across sessions.** Permanently out.
    Question history is session-scoped.

## Prioritization

Ordered by dependency, not by appeal. Specs 001 and 002 gate everything else,
because a figure that is unauthenticated, unreproducible, or unattributable
cannot be shown to anyone.

| Order | Spec | Why here |
|---|---|---|
| 1 | 001 foundation-authority | Identity, ownership enforcement, the capability layer, single authoritative engine path. Nothing is trustworthy without it |
| 2 | 002 statement-extraction | Real text extraction, parser repair, evidence on every row, 3 fixtures. Insights built on wrong rows are wrong |
| 3 | 007 recurring-detection | Standing commitments are the largest reliable saving opportunity and are currently invisible |
| 4 | 003 manual-transaction-entry | Captures cash and same-day spending the statements miss |
| 5 | 004 spending-trends | Requires real period selection and engine bucketing |
| 6 | 006 saving-recommendations | Improves once 007 gives it real commitments to reason about |
| 7 | 005 spending-analyst-qa | Most valuable last, because it needs every prior capability to be trustworthy |

## Risks

- **Scope**: seven specs against a four-week original estimate is roughly four
  times the committed scope. The constitution's answer is to cut scope, not to
  weaken principles. Cut candidates are listed in each spec's scope boundaries.
- **Extraction accuracy** is the least controllable risk. A 95% row-accuracy
  gate on real-world statement layouts may not hold; if it does not, the honest
  response is to narrow the supported layouts and say so, not to lower the gate.
- **Authenticating a Dhaka salaried user** requires either phone OTP, which
  depends on an SMS provider the constitution's "boring infrastructure" rule
  resists, or an account the user creates directly. The latter is assumed here
  pending the technical plan.
- **The demo currently contradicts this document** by showing seeded data as if
  it were the user's own. Labeling that as sample data is in scope for spec 001.
