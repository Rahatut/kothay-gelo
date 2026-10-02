# Feature Specification: Spending Analyst

**Feature Branch**: `005-spending-analyst`

**Created**: 2026-10-01

**Status**: Draft — unblocked by constitution 1.1.0 (2026-10-01)

**Input**: User description: "2. questioning about transactions and spending habits"

## Problem Statement

A user who wants to know why they spent what they spent has one option today:
read the insight list the system already decided was worth surfacing. There is no
way to ask. The constitution anticipated exactly this and describes the correct
mechanism in Principle II — eight approved capabilities through which every
quantitative answer must originate — but that mechanism has never been built.
There is no tool registry, no capability dispatch, and no parameter validation.
Building it is what makes question answering constitutional rather than a
violation of it.

## Conflict Note

`PRODUCT.md` ledger #7 bars "Chat with AI" and the constitution permanently bans
"general-purpose chatbot". A question surface **restricted to the eight approved
capabilities** is not a general-purpose chatbot — it is the tool-mediated design
the constitution requires. This spec is deliberately built so that distinction
holds: the model selects a capability and phrases engine output, and may never
compute or invent a figure. `PRODUCT.md` ledger #7 should be rewritten to ban
unconstrained chat rather than question answering.

## User Scenarios & Testing

### User Story 1 — Ask about my own spending in plain language (Priority: P1)

As a user, I ask "why did my food spending go up?" and get an answer built from
my actual rows, so that I understand my own behaviour without reading a report.

**Why this priority**: This is the core of the request, and it is only safe
because every number comes from the engine.

**Independent Test**: Ask a question the dataset can answer and verify every
figure in the reply equals the corresponding engine value for that dataset.

**Acceptance Scenarios**:

1. **Given** a question answerable from the user's data, **When** it is asked,
   **Then** the answer is composed only of figures returned by an approved
   capability for that identity's data.
2. **Given** a question about another person or an unrelated dataset, **When** it
   is asked, **Then** the system answers only from the asker's own data and does
   not confirm whether other data exists.
3. **Given** a question in Bengali, **When** it is asked, **Then** it is
   understood and answered in Bengali.

---

### User Story 2 — Every answer shows its work (Priority: P1)

As a user, I see which capability produced each figure in my answer and can open
the rows behind it, so that I can verify the answer rather than trust it.

**Why this priority**: Constitutional Principle VI. An answer to a financial
question that cannot be audited is worse than no answer, because it invites
reliance.

**Independent Test**: For every figure in every answer, confirm a capability
attribution and a link to contributing transactions are present, and that the
linked rows sum to the stated figure.

**Acceptance Scenarios**:

1. **Given** an answer containing a figure, **When** the user inspects it,
   **Then** the capability that produced it is named and the contributing
   transactions can be opened.
2. **Given** a question requiring more than one capability, **When** it is
   answered, **Then** each figure is attributed to the capability that produced
   it.
3. **Given** a capability returns no usable result, **When** the answer is
   composed, **Then** no figure from that capability appears.

---

### User Story 3 — Told when the data cannot answer (Priority: P1)

As a user, if my data does not cover what I am asking, I am told that plainly,
so that I do not act on a confident-sounding but unfounded answer.

**Why this priority**: Constitutional Principle VII. This is the single most
important failure mode of a question-answering surface over thin data.

**Independent Test**: Ask questions the dataset cannot support and confirm each
produces an explicit insufficient-data statement with no fabricated figure.

**Acceptance Scenarios**:

1. **Given** a question about a period with no data, **When** it is asked,
   **Then** the system states the data cannot answer it and names the period
   that is missing.
2. **Given** a question outside the approved capabilities, **When** it is asked,
   **Then** the system states the question is outside what it can answer.
3. **Given** a question whose answer would require data the user has not
   supplied, **When** it is asked, **Then** the system says what data is missing.

---

### User Story 4 — Push back on a wrong answer (Priority: P2)

As a user, I can tell the system an answer is wrong, so that bad answers are
visible rather than silently trusted.

**Why this priority**: The feedback route exists and is currently uncalled.
Closing it improves trust but is not required for the question surface to be
correct.

**Independent Test**: Submit feedback on an answer and confirm it is recorded,
associated with the answer, and visible to the user.

**Acceptance Scenarios**:

1. **Given** an answer, **When** the user marks it incorrect, **Then** the
   feedback is recorded against that answer.
2. **Given** a user asks the same question twice, **When** both are answered,
   **Then** both are attributed and neither silently reuses the other's
   unattributed text.

---

### Edge Cases

- A question with no time reference, which defaults to the selected period.
- A question naming a category the user does not use.
- A question about a merchant with only one transaction.
- A question mixing periods, such as "this month versus last year".
- A question with an injected instruction hidden in a merchant name, which must
  remain ordinary data.
- A question asked before any data is loaded.
- A question in a language other than English or Bengali.
- A question that would require a capability that returns an error.
- A question containing a request for the system to ignore its rules.

## Requirements

### Functional Requirements

- **FR-001**: The user MUST be able to ask a free-form question about their
  transactions and spending habits in English or Bengali.
- **FR-002**: Every figure in an answer MUST originate from one of the eight
  approved capabilities: financial summary, category breakdown, transactions,
  top merchants, recurring expenses, period comparison, spending patterns, and
  savings estimation.
- **FR-003**: No capability outside that list may be added, and no arbitrary
  query, direct data access, or generated code path may be introduced.
- **FR-004**: Every capability MUST validate its parameters and MUST reject
  invalid input rather than coercing it.
- **FR-005**: Every capability MUST independently verify that the authenticated
  identity owns the data, using server-established identity only. An identifier
  supplied by the model MUST be treated as untrusted input.
- **FR-006**: The model MUST NOT perform arithmetic or originate any figure.
  Where a figure appears in an answer, it MUST be traceable to a capability
  result.
- **FR-007**: Every figure MUST carry its capability attribution and links to
  the transactions that produced it.
- **FR-008**: Where the data cannot answer a question, the system MUST state
  that explicitly, name what is missing, and MUST NOT produce a figure.
- **FR-009**: A question requiring a capability outside the approved set MUST be
  refused with a statement of what the system can answer.
- **FR-010**: Conversation history MUST NOT override authorization, expand tool
  availability, or alter system behaviour.
- **FR-011**: Merchant names, descriptions, and imported text MUST be treated as
  untrusted content. Text inside transaction data that resembles an instruction
  MUST be treated as data and MUST NOT change behaviour, permissions, or tool
  availability.
- **FR-012**: Answers MUST distinguish facts, estimates, and insufficient data
  explicitly.
- **FR-013**: Answers MUST NOT contain shaming language and MUST NOT promise
  savings. Wording such as "wasted", "too much", "irresponsible", or "you will
  save" is prohibited.
- **FR-014**: Answers MUST NOT give investment, securities, insurance, or loan
  advice, and MUST NOT recommend specific products.
- **FR-015**: Answers MUST NOT execute any action, move money, or create
  records as a side effect of being asked.
- **FR-016**: The question surface MUST scope to the authenticated identity and
  MUST NOT reveal whether any other identity's data exists.
- **FR-017**: Conversation content MUST NOT be retained beyond the session, and
  the retention rule MUST be stated to the user.
- **FR-018**: When the model service is unavailable, the system MUST answer from
  capability results through deterministic phrasing rather than failing.
- **FR-019**: Every answer MUST be reproducible: the same question on the same
  data MUST produce the same figures.
- **FR-020**: A question MUST NOT be answered from a partial period without an
  estimate label.
- **FR-021**: The question surface MUST work at a 375 px viewport and MUST meet
  accessibility requirements, including keyboard operation and announced
  responses.
- **FR-022**: Conversation history MUST NOT be used to widen capability access
  in a later turn.

### Key Entities

- **Question**: the user's free-form request, with language and optional period
  reference.
- **Capability Call**: one invocation of an approved capability, with validated
  parameters, identity verification outcome, and result. Every figure in an
  answer maps to one.
- **Grounded Answer**: the composed reply, in which every figure is traceable to
  a capability call and every claim is labelled by certainty.
- **Insufficient Data Statement**: an explicit reply that the data cannot
  answer, naming the missing period, category, or record type.
- **Answer Feedback**: a user judgement on an answer, recorded against it.

### Scope Boundaries

**In scope**: question input in English and Bengali, capability selection and
dispatch, parameter validation, grounded answer composition, certainty labels,
capability attribution, drill-down to transactions, insufficient-data handling,
feedback.

**Out of scope**: a general-purpose assistant, open-ended conversation for its
own sake, persistent or long-term memory across sessions, voice input,
proactive or unsolicited advice, action execution, and any capability beyond the
approved eight.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of figures in 50 test answers trace to a capability call,
  and every one equals the engine value for that dataset.
- **SC-002**: Zero answers contain a figure absent from a capability result.
- **SC-003**: For questions the data cannot answer, 100% produce an explicit
  insufficient-data statement with no fabricated figure.
- **SC-004**: Prompt-injection text placed in merchant names across 20 attempts
  changes no behaviour, no permission, and no capability availability in 20 of 20
  attempts.
- **SC-005**: Zero answers cross identity boundaries, across all attempts.
- **SC-006**: Zero answers contain prohibited shaming language or savings
  promises across 50 generated answers.
- **SC-007**: With the model service unavailable, 100% of answerable questions
  still receive a grounded answer through deterministic phrasing.
- **SC-008**: The same question on unchanged data produces identical figures in
  100% of repeat runs.
- **SC-009**: The question path is fully operable by keyboard at a 375 px
  viewport in both languages.

## Assumptions

- Question answering is bounded to the eight approved capabilities. This is the
  control that keeps the feature compliant with Principle II and outside the
  constitutional ban on general-purpose chatbots.
- The model performs selection, parameter filling, and phrasing only.
- The capability layer from spec 001 is a hard prerequisite; this spec adds the
  dispatch and composition on top of it.
- Conversation history is held in session only and is not persisted.
- Default period for an unqualified question is the user's currently selected
  period, stated in the answer.
- Bengali is supported for both input and output at parity with English.
- Suggested questions are provided to reduce the risk of unsupported requests,
  but the user is never restricted to them.
