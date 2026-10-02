<!--
Sync Impact Report
==================
Version change: 1.0.0 → 1.1.0 (scope expansion)
Trigger: product-owner decision on 2026-10-01 after the specification
inventory and governance conflict report (`specs/CONFLICT.md`).
Decisions taken: D1-B full accounts with a database · D2-A persistence across
restart · D3-A amend rather than hold · D4-B admit multiple statement sources.

Modified principles: NONE. No principle is deleted, redefined, or weakened.

Added principles: NONE. This is a scope amendment, not a principle change.

Amended sections:
  - MVP Scope Discipline (expansions + retained prohibitions)

Expansions admitted into scope by this amendment:
  - Identity and accounts, with a real relational store, so that Principle III
    dataset isolation has an enforceable boundary. Bounded by Principle III:
    no identity provider may supply identity to the model, and dataset
    ownership is established server-side only.
  - A question-answering surface restricted to the eight capabilities named in
    Principle II. This is NOT the previously banned general-purpose chatbot.
    Principle II's tool surface is the binding constraint; a question the tools
    cannot answer is refused rather than answered.
  - Read-only trend visualisations, where every plotted point links to the
    transactions that produced it.
  - Saving recommendations bounded to reducing patterns the engine has already
    detected, each carrying its own derivation. NOT investment advice, NOT
    product advice, NOT enforced limits.
  - Multiple statement sources: mobile wallets, bank statements, and delimited
    files. Bank API integration remains prohibited.
  - User-asserted transactions entered by hand, recorded with provenance that
    distinguishes them from extracted rows.

Prohibitions RETAINED unchanged and still absolute: transaction execution,
arbitrary SQL, whole-database agent access, bank API integration, investment
advisor, autonomous budgeting or limit enforcement, general-purpose chatbot,
voice agent, long-term personal memory, multi-agent product architecture,
plugin marketplace, arbitrary report generation.

Re-evaluation of existing specs against this amendment:
  - specs/001-foundation-authority: unblocked. Extended to cover account
    lifecycle, history, and relational persistence (was in-memory assumption).
  - specs/002-statement-extraction: extended to cover multiple source formats,
    consistent with D4-B.
  - specs/003-manual-transaction-entry: unblocked, as admitted by this
    amendment.
  - specs/004-spending-trends: unblocked, as admitted by this amendment.
  - specs/005-spending-analyst-qa: unblocked ONLY because it is bounded to the
    Principle II tool surface. Any widening voids the admission.
  - specs/006-saving-recommendations: unblocked ONLY under the retained
    investment-advisor and autonomous-budgeting prohibitions.
  - specs/007-recurring-detection: unblocked. Required by Principle II, which
    already named recurring detection as an approved capability.

Follow-up TODOs:
  - PRODUCT.md rewritten to match admitted scope and to stop describing a
    one-clue-card product the code stopped being.
  - Acceptance metrics in PRODUCT.md remain unmeasurable until spec 001
    establishes the measurement path.
-->

# Kothay Gelo Constitution

## Core Principles

### I. Deterministic Financial Truth

The financial engine — not the LLM — is authoritative for all financial
calculations. Totals, income, expenses, net, counts, percentages, date ranges,
aggregations, recurring detection, period comparison, savings estimates, and
reconciliation MUST be computed by the deterministic engine. The agent may
interpret engine results but MUST NOT independently establish authoritative
numbers. Never trust LLM arithmetic when the engine can provide the result.

**Rationale**: Financial answers must be reproducible and auditable; LLM
arithmetic is nondeterministic and unauditable.

### II. Tool-Mediated Quantitative Answers

Every quantitative agent answer MUST originate from one of the approved
financial tools: `get_financial_summary`, `get_category_breakdown`,
`get_transactions`, `get_top_merchants`, `get_recurring_expenses`,
`compare_periods`, `find_spending_patterns`, `estimate_savings_opportunity`.
No arbitrary SQL, arbitrary database access, arbitrary code execution, or
duplicate analytical tools without a documented requirement. Every tool MUST
validate its parameters.

**Rationale**: Constraining the agent to a fixed tool surface keeps answers
traceable and the blast radius bounded.

### III. Dataset-Scoped Authorization

Every financial tool execution MUST independently enforce
`authenticated_user == dataset.owner`, with identity established by the
application/backend — never by the model. A model-supplied `dataset_id` is an
untrusted parameter only. Conversation context and transaction text MUST NEVER
override authorization.

**Rationale**: The model must never be trusted to establish access rights;
authorization is a backend invariant.

### IV. Untrusted Imported Data

CSV contents, merchant names, transaction descriptions, notes, imported text,
and uploaded metadata are untrusted data, not instructions. Prompt-injection
text in transactions MUST remain ordinary transaction content and MUST NEVER
modify system behavior, agent permissions, tool availability, authorization,
secrets, or hidden instructions.

**Rationale**: Imported financial records are attacker-controllable input that
flows near the LLM boundary.

### V. Read-Only MVP (NON-NEGOTIABLE)

The MVP is read-only. The agent MUST NOT execute financial transactions,
mutate financial records, hold transaction-execution authority, or perform
autonomous financial actions of any kind.

**Rationale**: Any write path to financial data multiplies risk beyond what a
four-week MVP can secure.

### VI. Evidence Is Mandatory

Material financial claims MUST be traceable: `claim → calculation → evidence →
View transactions`. Evidence is part of the user-facing experience, not a
developer/debugging feature. The agent MUST NOT fabricate transactions,
merchants, amounts, dates, totals, percentages, or categories.

**Rationale**: Trust in the analysis comes from inspectable provenance, not
from confident prose.

### VII. Fact, Estimate, and Insufficient-Data Disclosure

The application MUST explicitly distinguish facts, estimates, and insufficient
data. Facts are stated as facts; estimates are labeled as estimates;
unanswerable questions MUST be answered with an explicit statement that the
data cannot answer the question.

**Rationale**: Blurring certainty levels is how financial tools lose user
trust.

### VIII. Simple Modular Architecture

Prefer a modular monolith and boring infrastructure appropriate for one
developer and a four-week MVP. Avoid speculative abstraction, premature
microservices, dependency churn, and cleverness without measurable benefit.

**Rationale**: Architecture must match the iron triangle: fixed time, one
developer, variable scope.

### IX. Correctness Over Feature Count

Correctness, security, and scope discipline take priority over feature count.
When schedule pressure threatens the MVP: reduce scope, simplify architecture,
remove non-essential polish — never remove security, correctness, evidence, or
acceptance criteria.

**Rationale**: Scope is the only safe variable in the iron triangle.

### X. Independently Testable Financial Engine

The financial engine MUST remain independently testable without the LLM.
Engine tests cover totals, parsing, normalization, reconciliation,
authorization, tool boundaries, and evidence in isolation from any model.

**Rationale**: Deterministic truth is only useful if it can be verified
deterministically.

## MVP Scope Discipline

### Permanently out of scope

These MUST NOT be added because an external library or model makes them easy.
This list is unchanged by the 1.1.0 amendment:

transaction execution · arbitrary SQL · whole-database agent access · bank API
integration · investment advisor · product-level financial advice (insurance,
loans, securities) · autonomous budgeting or enforcement of spending limits ·
general-purpose chatbot · voice agent · long-term personal memory across
sessions · multi-agent product architecture · plugin marketplace · arbitrary
report generation.

### Admitted into scope by the 1.1.0 amendment

1. **Identity and accounts** with a real relational store and retained history.
   Bounded by Principle III: identity is established server-side only and never
   supplied by the model.
2. **Question answering restricted to the eight Principle II capabilities.**
   This is not a general-purpose chatbot. The tool surface is the binding
   constraint; a question the tools cannot answer is refused with an explicit
   insufficient-data statement, never answered from model knowledge.
3. **Read-only trend visualisations** — daily, weekly, monthly, yearly — where
   every plotted point links to the transactions that produced it.
4. **Saving recommendations** bounded to reducing patterns the engine has
   already detected, each with its own per-recommendation derivation, its own
   supporting transactions, and certainty labels. Bounds MUST NOT be summed
   across recommendations into a single claim.
5. **Multiple statement sources** — mobile wallets, bank statements, delimited
   files. Bank API integration remains prohibited.
6. **User-asserted transactions** entered by hand, recorded with provenance that
   distinguishes them from extracted rows and without a fabricated confidence.

### Standing constraints on admitted scope

- Model-supplied values MUST NOT enter a financial record as authoritative.
  Extracted amounts are unverified candidates until the engine or the user
  verifies them.
- Absence MUST be reported as absence. No default, fallback, or multiplier may
  substitute for a missing figure.
- Every quantitative figure MUST trace to the engine and, where it drives a
  user-facing claim, to the transactions behind it.


## Quality Gates

A feature is complete only when: specified behavior works; acceptance criteria
pass; relevant tests pass; financial calculations are deterministic;
authorization is enforced; dataset isolation is preserved; agent/tool
boundaries are preserved; quantitative answers have tool provenance; evidence
is inspectable; failure states are handled; UI follows `DESIGN.md`; mobile
behavior is acceptable; no forbidden scope was added.

Verification order: tests → typecheck → lint → relevant E2E → security review
where applicable → code review → acceptance criteria.

## Governance

This constitution is the highest Spec Kit artifact and supersedes conflicting
guidance in later artifacts (`spec.md`, `plan.md`, `tasks.md`) and in agent
assumptions. When two authoritative artifacts conflict, the conflict MUST be
reported and reconciled before implementation continues.

Amendments require: an edit to this file, a version bump per semantic
versioning (MAJOR: principle removal/redefinition; MINOR: new or materially
expanded principle; PATCH: clarifications), an updated Sync Impact Report, and
re-evaluation of existing specs against the amended principles.

All reviews and convergence checks MUST verify compliance with these
principles. Runtime development guidance lives in `AGENTS.md`; product
definition lives in `PRODUCT.md`; visual authority lives in `DESIGN.md`.

**Version**: 1.1.0 | **Ratified**: 2026-09-30 | **Last Amended**: 2026-10-01
