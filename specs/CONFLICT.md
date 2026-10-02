# Governance Conflict Report

**Created**: 2026-10-01
**Status**: Open — blocks implementation of specs 003 through 006
**Reported by**: audit preceding the specification inventory

## Summary

Five capabilities were requested. Four conflict with `PRODUCT.md`'s
will-not-build ledger. Two conflict with the constitution's MVP Scope
Discipline. `PRODUCT.md` is itself already out of sync with the shipped code in
the opposite direction.

Per `.specify/memory/constitution.md` § Governance: *"When two authoritative
artifacts conflict, the conflict MUST be reported and reconciled before
implementation continues."* This report is that step. No implementation work
should begin until the items below are decided.

---

## Conflict 1 — Authentication versus "no accounts and login"

**`PRODUCT.md` will-not-build ledger #1** states, verbatim:

> **Accounts and login.** *Instead:* none. The file is processed in-session and
> not stored.

**Requested**: "authentication and authorization".

**Additional exposure.** Authorization is currently advertised in the product
surface but is fiction. `server.ts:31` returns a hardcoded user id, so the
seven ownership checks can never fail, and five routes perform no ownership
check at all. `TrustSection` and `SettingsView` both tell the user their data is
isolated per tenant. That claim is not currently verifiable, which
`PRODUCT.md` ledger #10 forbids in its own terms: *"claim nothing unverified."*

**Why this must be decided, not assumed.** Dataset isolation is constitutional
Principle III, and the application now holds real financial records across
eight data stores. Without identity there is no boundary. Authorizing this is a
defensible product decision — the user is the product owner. It cannot be done
silently, because the constitution requires amendment, not reinterpretation.

**Resolution required**: amend `PRODUCT.md` ledger #1 and amend the
constitution's MVP Scope Discipline to permit a minimal session identity.
Recommended amendment: identity is a phone number plus a one-time code, it
exists solely to scope one person's data to one person, and no credential,
password, or third-party identity provider is introduced.

---

## Conflict 2 — Questioning versus "no chat with AI"

**`PRODUCT.md` will-not-build ledger #7** states:

> **Chat with AI.** *Instead:* none. The LLM only phrases the explanation.

**`.specify/memory/constitution.md` MVP Scope Discipline** permanently bans
*"general-purpose chatbot"*.

**Requested**: "questioning about transactions and spending habits".

**This conflict is narrower than it appears.** The constitution's Principle II
already names the exact eight capabilities that any quantitative answer must
come from: financial summary, category breakdown, transactions, top merchants,
recurring expenses, period comparison, spending patterns, savings estimation.
A question-answering surface that is *restricted to those eight capabilities*
is not a general-purpose chatbot. It is precisely the tool-mediated design the
constitution mandates and which has never been implemented.

**Recommended resolution**: permit free-form questions, bounded to the fixed
tool surface, with the model permitted only to select a tool, supply its
validated parameters, and phrase engine output. No arithmetic, no invented
facts, and an explicit refusal path when the data cannot answer the question.
`PRODUCT.md` ledger #7 should be rewritten to ban *unconstrained* chat rather
than question answering as such.

---

## Conflict 3 — Dashboard and charts versus "one clue card"

**`PRODUCT.md` will-not-build ledger #4** states:

> **Dashboard and charts.** *Instead:* one clue card.

**Requested**: "visual dashboard showing monthly and weekly and maybe yearly
trends".

**Compounding fact.** `DashboardView` already exists and already renders four
metric tiles, a category breakdown, a merchant list, and a ledger table. The
"one clue card" promise was abandoned by the original scaffold, not by this
request. The conflict is that `PRODUCT.md` describes a product the code stopped
being several commits ago.

**Recommended resolution**: amend `PRODUCT.md` ledger #4 to admit a read-only
trend surface, while preserving the constraint that matters — no pie charts,
no 3D, no vanity gauges, and no chart that cannot be traced to transactions.
A trends view is a legitimate reading of constitution Principle VI, since each
aggregate point links to its contributing rows.

---

## Conflict 4 — Manual entry versus "no manual categorization"

**`PRODUCT.md` will-not-build ledger #8** states:

> **Budgets, goals, manual categorization.** *Instead:* auto-categorize or leave
> uncategorized.

**`PRODUCT.md` Q2** adds: *"No human judgment mid-loop. The user does not confirm
categories, pick detectors, or choose which clue to see."*

**Requested**: "manual entry of transaction".

**This conflict is the weakest of the four.** Ledger #8 targets *manual
categorization* and the goals UI. A user typing in a cash withdrawal they made
this morning is not categorizing an extracted row, and is not a judgment inside
the upload loop. Note that the code *already ships both* — `GoalsView` exists
despite ledger #8 naming goals explicitly.

**Recommended resolution**: permit manual entry as an additive path that sits
outside the upload→clue loop, requires no category from the user (the
categorizer proposes, the user may accept or override), and records the row as
user-asserted rather than extracted, with confidence explicitly not applicable.
`PRODUCT.md` ledger #8 should be scoped to mean "no required manual
categorization" instead of "no manual entry".

---

## Conflict 5 — Recommendations versus "investment advisor" and "autonomous budgeting"

**`.specify/memory/constitution.md` MVP Scope Discipline** permanently bans
*"investment advisor"* and *"autonomous budgeting"*.

**`PRODUCT.md` ledger #6** states: *"one static line: potential = 25% of the
pattern total"*, explicitly flagged as *"my assumption"*.

**Requested**: "AI generated recommendations on how to save money and stuff".

**Current state.** `GET /v1/recommendations` and the `Recommendation` type
already exist and are populated by the engine, but nothing renders them. There
is a real `Recommendation` shape with `potential_savings_min`,
`potential_savings_max`, `calculation_method`, `calculation_version`, and
`supporting_transaction_ids`. The bounds are currently summed independently
across every recommendation, which can produce a range wider than any single
lever supports.

**Recommended resolution**: permit recommendations bounded to reducing
identified spending leaks. The boundary that keeps this compliant is: no
investment products, no securities, no insurance or loan products, no
automated budget enforcement, and no prescriptive spending caps presented as
authority. Every recommendation must carry its own derivation and evidence
links, and savings bounds must be reported per recommendation rather than
summed into one inflated range.

---

## Additional required reconciliation, not tied to the five requests

### `PRODUCT.md` is stale relative to the shipped code

Ledger items #4, #5, #8, and the "one clue card" premise all describe an MVP
the code does not implement. Present state: seven workspace views, a goals
feature, a review queue, a settings and consent surface, claims to support
Nagad, cards, and multiple banks, and a what-if calculator. `PRODUCT.md` should
be rewritten to describe the product that exists, then amended for the five
new capabilities — otherwise every future conflict resolution will be measured
against a false baseline.

### The constitution needs a version bump and a Sync Impact Report

Amendment requires, per § Governance: an edit to the file, a semantic version
bump (MAJOR for removing or redefining a principle; MINOR for a materially
expanded one), an updated Sync Impact Report, and re-evaluation of existing
specs. Current version is 1.0.0. Allowing identity and a Q&A surface is a
materially expanded scope, so **MINOR → 1.1.0** is the correct bump.

### Acceptance metrics are currently unmeasurable

`PRODUCT.md` defines 8 pass/fail metrics. None can be evaluated: no test
harness, 1 of 3 required fixtures, and no instrumentation. Spec 001 must
establish the measurement path before any other spec can honestly claim a
passing criterion.

---

## Decisions taken

Resolved by the product owner on 2026-10-01. Recorded here for audit.

| # | Decision | Outcome |
|---|---|---|
| D1 | Identity model | **B — full accounts with retained history, backed by a real database.** Not a phone-code session |
| D2 | Persistence | **A — records survive a restart.** Note: D1-B supersedes the file-backed option. An in-memory store cannot hold accounts and history, so the store is relational. D2's intent, survival across restart, is satisfied by D1-B's mechanism |
| D3 | Scope ceiling | **A — amend the constitution to 1.1.0** to permit identity, bounded Q&A, trends, and leak-reduction recommendations |
| D4 | Multi-source support | **B — formally admit Nagad, cards, and bank aggregation.** Bank API integration remains prohibited |

### Consequences of D1-B and D4-B together

The product is no longer a single-session, single-user applet. That has effects
beyond the four questions above, and they are accepted rather than overlooked:

- **Privacy claims become enforceable instead of aspirational.** With real
  accounts, `PRODUCT.md` ledger #10 can be satisfied honestly. This is a net
  improvement, because the previous build made a claim it could not honour.
- **SMS dependency is avoided.** A phone-OTP flow would have required an
  external SMS provider, which sits badly with the constitution's boring-
  infrastructure principle. Account-and-password avoids that. The sign-in
  method itself is settled in the technical plan for spec 001.
- **Deployment shape changes.** Retained history plus a relational store means
  the deployment needs a persistent volume. This is a hosting decision, tracked
  in the spec 001 plan.
- **Data subject rights become real obligations.** With history, the existing
  export and delete-account routes stop being decorative and become testable
  requirements.
- **Source discrimination must exist from day one.** D4-B means the data model
  carries a source discriminator on documents and transactions immediately,
  rather than assuming one provider and retrofitting later.

## Post-decision state

- `.specify/memory/constitution.md` amended to **1.1.0**, MINOR bump, with an
  updated Sync Impact Report. No principle was deleted, redefined, or weakened;
  every absolute prohibition is retained verbatim.
- `PRODUCT.md` rewritten to match admitted scope and to stop describing a
  one-clue-card product the code stopped being.
- Specs 001 through 007 marked unblocked. 001 extended to cover the account
  lifecycle, retained history, and relational persistence. 002 extended for
  multiple source formats.
- Open items that remain, and are not resolved by these decisions: the sign-in
  method, the relational engine choice, the persistent-volume hosting shape,
  and the SMS-free credential approach. All are settled in the spec 001
  technical plan.

## Previously recommended, now overridden

The recommendations in this report were advisory. The product owner selected
(B) for D1 and (D) over the recommended (A) for D4. Those recommendations
should not be treated as pending requirements.

