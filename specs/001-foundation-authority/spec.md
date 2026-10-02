# Feature Specification: Foundational Authority

**Feature Branch**: `001-foundation-authority`

**Created**: 2026-10-01

**Status**: Draft — unblocked by constitution 1.1.0 (2026-10-01)

**Input**: User description: "look into the codebase to understand what needs to be made functional"

## Problem Statement

The application displays authentication and per-tenant isolation in its user
surface while neither exists. Identity is a hardcoded constant, the seven
ownership checks that do exist can never fail, five routes perform no ownership
check at all, and no data survives a restart. Quantitative figures are
computed in four places at once — engine, route handler, and two components in
the browser — and the extraction path writes a model-supplied amount directly
into the ledger. Constitutional Principles I, II, III, and VI are all currently
violated. Every other specification depends on this one: trends, questions, and
recommendations are meaningless if figures are unauthenticated, unreproducible,
or unattributable.

## User Scenarios & Testing

### User Story 1 — My data belongs to me and only me (Priority: P1)

As a user, I sign in once with my phone number so that my financial records are
scoped to me, and no identifier I type — and no identifier the analysis engine
receives — can move me into someone else's data.

**Why this priority**: Without it, nothing else can be trusted, and the product
currently makes a privacy claim to the user that it cannot honour.

**Independent Test**: Create two identities. Have each upload a statement.
Confirm that identity A cannot read, list, mutate, or narrate identity B's
transactions, documents, insights, goals, or evidence by guessing any
identifier. Confirm the attempt is refused and recorded.

**Acceptance Scenarios**:

1. **Given** an unauthenticated request, **When** it calls any data route,
   **Then** it is refused with an unauthenticated response and no record is
   returned.
2. **Given** a valid session for identity A, **When** A requests a resource
   that belongs to identity B using a valid identifier for it, **Then** the
   request is refused, the refusal is recorded in the audit trail, and no
   content, count, or existence signal is disclosed.
3. **Given** a valid session, **When** the user signs out, **Then** the session
   is invalidated immediately and subsequent requests with the old credential
   are refused.

---

### User Story 2 — The same question always gets the same answer (Priority: P1)

As a user, I want every figure the application shows me to be computed by one
authoritative calculation, so that a total in the dashboard, the same total in
the ledger, and the same total in a recommendation always agree.

**Why this priority**: The engine is constitutionally authoritative. Today the
same percentage is computed twice and the browser recomputes it a third time,
discarding the server's value.

**Independent Test**: For a populated dataset, assert that every displayed
figure equals the engine value returned by the financial interface, and that no
browser-side calculation can change a displayed number.

**Acceptance Scenarios**:

1. **Given** a dataset, **When** a percentage share, period grouping, savings
   figure, or recommendation bound is displayed anywhere, **Then** the value
   originates from the financial engine and is displayed unaltered.
2. **Given** the engine has no basis for a figure, **When** that figure is
   requested, **Then** the system states the data cannot answer it rather than
   substituting a default.

---

### User Story 3 — Nothing is invented when data is missing (Priority: P1)

As a user, I want the application to tell me when it does not know something,
rather than showing me a plausible number, so that I can trust what I am shown.

**Why this priority**: The codebase substitutes hardcoded values in at least
eight places — a fabricated count of 12, a fabricated confidence of 0.9, a
yearly figure from a ×12 multiplier, a goal inflated ×3.

**Independent Test**: Remove a field from every input surface and confirm the
system reports absence in each case instead of producing a substitute.

**Acceptance Scenarios**:

1. **Given** a response omits a count, **When** it is rendered, **Then** the
   count is shown as unavailable, never as a fallback constant.
2. **Given** a period contains no data, **When** a comparison is requested,
   **Then** the system reports insufficient data and does not compute a growth
   or decline percentage.

---

### Edge Cases

- Session token expired mid-request.
- Two sessions for the same identity in different browsers.
- A resource identifier that does not exist versus one that exists but belongs
  to another identity — both must be indistinguishable to the caller.
- A dataset with exactly one transaction, which cannot support a trend.
- A period boundary that splits a single transaction's month.
- Clock skew between session creation and validation.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST establish identity from a server-held session
  only, and MUST NOT accept a user identifier supplied by a client or a model.
- **FR-002**: The system MUST refuse every data request lacking a valid session.
- **FR-003**: The system MUST verify record ownership on every read and write,
  including status polling, evidence retrieval, feedback submission, and
  narration, which currently perform no such check.
- **FR-004**: The system MUST make "does not exist" and "belongs to another
  identity" indistinguishable to the caller, so ownership cannot be probed.
- **FR-005**: The system MUST invalidate a session on sign-out.
- **FR-006**: The system MUST record authentication events and ownership
  refusals in the audit trail without capturing personal financial content.
- **FR-007**: All quantitative answers MUST originate from the approved
  financial capabilities: financial summary, category breakdown, transactions,
  top merchants, recurring expenses, period comparison, spending patterns, and
  savings estimation. Every capability MUST validate its parameters and MUST
  enforce ownership independently of the caller.
- **FR-008**: No analytical route may compute a figure independently of the
  financial engine. Route handlers MUST delegate.
- **FR-009**: Period selection MUST accept the user's chosen range rather than
  the hardcoded literals `2026-09` and `2026-08` currently embedded in the data
  layer.
- **FR-010**: The system MUST NOT emit a default in place of a missing figure,
  and MUST NOT fabricate a transaction count, confidence, date, or multiplier.
- **FR-011**: Model-supplied values MUST NOT enter a financial record as
  authoritative. An extracted amount MUST be treated as a candidate requiring
  verification, never as a settled ledger value.
- **FR-012**: The system MUST report whether a figure is a measured fact, an
  estimate derived from a partial period, or unavailable.
- **FR-013**: Every insight and recommendation MUST link to the transactions
  that produced it. A claim with no supporting rows MUST NOT be presented as a
  finding.
- **FR-014**: Imported text MUST remain data. Merchant names and descriptions
  MUST NOT alter behaviour, permissions, tool availability, or authorization.
- **FR-015**: The system MUST NOT execute transactions, move money, or
  automate enforcement of any spending limit.
- **FR-016**: Financial records MUST be stored in a relational database and MUST survive an application restart. Identity, transactions, evidence, insights, recommendations, goals, feedback, and audit events MUST each be independently queryable and scoped to an account.
- **FR-017**: Account history MUST be retained and MUST remain accessible to its owner across sessions, and MUST be exportable by its owner.
- **FR-018**: Environment configuration MUST be loaded from the environment.
  Secrets MUST NOT be hardcoded, logged, or returned in any response.
- **FR-019**: The system MUST state plainly whether records persist across a
  restart, and the user interface MUST reflect the truth.
- **FR-020**: Uploaded files MUST be validated for type and size at the route
  boundary before any processing begins.
- **FR-021**: The system MUST NOT silently truncate extracted content.
  Truncation MUST be reported to the user.
- **FR-022**: Every user-facing string MUST have a Bengali counterpart at
  parity.

### Key Entities

- **Account**: an authenticated identity with sign-in credentials, creation
  time, and retained history. Holds no financial content of its own.
- **Session**: a credential bound to one account, invalidated on sign-out.
- **Historical Period**: any past range an account can revisit, made possible by
  relational retention rather than in-memory state.
- **Audit Event**: an immutable record of an access, mutation, or refusal.
  References who, what kind of action, and when. Never contains financial
  amounts or merchant names.
- **Financial Capability**: one of the eight approved quantitative questions.
  Each validates parameters and enforces ownership.
- **Period**: a user-selected date range used by every aggregate, replacing the
  hardcoded month literals.

### Scope Boundaries

**In scope**: accounts and sign-in, sessions, retained history, ownership
enforcement on every data route, the capability layer, engine-authoritative
reads, removal of fabricated defaults, removal of the `remaining / 6` and
`× 12` multipliers, loading environment configuration, upload validation,
replacement of the in-memory store with a relational one, labelling of seeded
sample data.

**Out of scope**: statement extraction quality (spec 002), manual entry (spec
003), trends (spec 004), questions (spec 005), recommendations (spec 006),
recurring detection (spec 007). Goals, review, settings, and the what-if
calculator already exist in the interface but are not extended here.


## Success Criteria

### Measurable Outcomes

- **SC-001**: Two concurrent identities can perform every operation, and zero
  cross-identity reads, writes, or enumerations succeed in an adversarial pass
  covering every data route.
- **SC-002**: Every quantitative figure displayed anywhere in the interface
  matches the engine value byte for byte, verified across the dashboard, ledger,
  insights, and recommendations.
- **SC-003**: Zero fabricated constants remain in the read and display paths.
  Each of the identified fallbacks — count of 12, confidence 0.9 and 0.92,
  ×12 annualisation, ×3 goal inflation, six-month horizon, hardcoded target
  dates — is removed and its absence reported instead.
- **SC-004**: Extracted amounts that were never verified by the user or the
  engine are never presented as settled ledger values.
- **SC-005**: Every insight and recommendation links to at least one real
  transaction, and claims with no supporting rows are not displayed as findings.
- **SC-006**: Records either persist across a restart or the interface states
  that they do not. No configuration presents ephemeral storage as durable.
- **SC-007**: No secret value appears in any response body, log line, audit
  entry, or client-visible message.
- **SC-008**: A user can complete sign-up and sign-in on a 375 px viewport in
  under 60 seconds.
- **SC-009**: All records for one account remain queryable after a full process
  restart, with zero rows lost and zero rows belonging to another account.
- **SC-010**: An account can export its complete history and delete it entirely,
  with the deletion verifiable in the same session.

## Assumptions

- **Decision D1-B (taken 2026-10-01)**: full accounts with retained history,
  backed by a real relational database. Not a phone-code session. Sign-in method
  is settled in `plan.md` research, not here.
- **Decision D2-A (taken)**: records persist across a restart. D1-B supersedes
  the earlier file-backed-store option — an in-memory store is not compatible
  with accounts and history, so the store is relational.
- The existing in-memory data layer is replaced rather than wrapped, since no
  production data exists to migrate.
- The eight capabilities named in the constitution are the complete permitted
  set. No capability is added by this spec.
- A user with no session sees only the sign-in surface and the labelled sample
  dataset, never another person's data.
- The seeded sample dataset on boot is intentional for demonstration and is
  clearly labelled as sample data rather than presented as the user's own
  records.
- **Decision D4-B (taken)**: multiple statement sources are in scope, so the
  account and document model carries a source discriminator from day one rather
  than assuming a single provider later.

