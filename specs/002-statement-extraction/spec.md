# Feature Specification: Statement Extraction

**Feature Branch**: `002-statement-extraction`

**Created**: 2026-10-01

**Status**: Draft — unblocked by constitution 1.1.0, depends on spec 001

**Input**: User description: "look into the codebase to understand what needs to be made functional"

## Problem Statement

PDF extraction does not exist. No PDF library is installed, and the browser
sends a PDF through a plain text reader, so binary bytes reach a set of regular
expressions. The deterministic fallback parser is also defective: it takes the
first number on a line, which matches `202` out of the date `2026-09-01` before
reaching the real amount; non-ISO dates are silently forced to a single
hardcoded day; confidence is a fixed 0.92 for every row regardless of content;
and evidence bounding boxes are invented coordinates. Only one of the three
required fixtures exists, and 13 of its 18 transactions carry no evidence at
all. Extraction accuracy therefore cannot be measured, and no insight built on
top of it can be trusted.

## User Scenarios & Testing

### User Story 1 — My real statement is read correctly (Priority: P1)

As a user, I upload the actual PDF my wallet produced and see the transactions
in it, with the correct dates and amounts, so that the analysis describes my
real spending rather than a guess.

**Why this priority**: Extraction accuracy gates the ≥95% row accuracy metric
and every insight downstream. Nothing else matters if the rows are wrong.

**Independent Test**: Extract all three fixtures and compare row count, dates,
amounts, and directions against hand-built ground truth. Report accuracy as a
percentage.

**Acceptance Scenarios**:

1. **Given** a text-based PDF statement, **When** it is uploaded, **Then** its
   text content is extracted and parsed into dated, directed, amount-bearing
   rows.
2. **Given** a line containing both a date and an amount, **When** it is
   parsed, **Then** the amount is read as the amount and not as a fragment of
   the date.
3. **Given** a statement with more rows than the extraction window allows,
   **When** it is processed, **Then** the user is told that rows were omitted
   and how many.

---

### User Story 2 — I can see where each row came from (Priority: P1)

As a user, I click any transaction and see the exact text it was read from, so
that I can judge whether to trust it or correct it.

**Why this priority**: Evidence is constitutionally mandatory and is currently
absent for most seed rows. Claims are asserted at high confidence with nothing
attached.

**Independent Test**: For every extracted row, open its evidence and confirm
the recorded text appears verbatim in the source document.

**Acceptance Scenarios**:

1. **Given** any extracted transaction, **When** the user inspects it,
   **Then** the verbatim source text is shown and locates the row in the
   document.
2. **Given** a scanned image with no embedded text, **When** extraction finds no
   text layer, **Then** the user is told to upload the original PDF rather than
   being shown an empty result.

---

### User Story 3 — A bad file tells me what to do (Priority: P2)

As a user, if my file cannot be read, I get a plain explanation and a next
step, never a technical error.

**Why this priority**: `PRODUCT.md` requires zero raw errors across five
bad-file tests. Today a malformed PDF produces an exception path with no
guidance.

**Independent Test**: Submit five bad files and confirm each yields a plain
message with a next step and no stack trace or internal identifier.

**Acceptance Scenarios**:

1. **Given** an unsupported or unreadable file, **When** it is submitted,
   **Then** the user sees a plain message naming a next step.
2. **Given** a file exceeding the size limit, **When** it is submitted, **Then**
   the limit and the actual size are both stated.

---

### Edge Cases

- A statement whose rows span a month boundary.
- A row with a negative or reversed amount.
- A credit and debit on the same line.
- A duplicate row appearing twice in the source.
- A statement in Bengali script.
- A password-protected or corrupt PDF.
- A statement with no header row, so columns must be inferred.
- A very long statement that exceeds the extraction window.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST extract text from text-based PDFs and MUST
  extract text from plain-text and delimited statement files.
- **FR-002**: The system MUST identify the date, amount, direction, and
  counterparty for each row, and MUST NOT read a date fragment as an amount.
- **FR-003**: The system MUST classify debit as expense and credit as income,
  and MUST leave direction unclassified when it cannot be determined rather than
  guessing.
- **FR-004**: Every extracted row MUST carry evidence: the verbatim source text
  and its location within the document.
- **FR-005**: The system MUST NOT assign a fixed confidence to all rows.
  Confidence MUST reflect verifiable properties of the extraction and MUST NOT
  be defaulted when a property is missing.
- **FR-006**: The system MUST NOT invent document coordinates. Where a location
  cannot be determined, the system MUST record that it is unknown.
- **FR-007**: The system MUST state explicitly when a file has no extractable
  text and direct the user to upload the original.
- **FR-008**: The system MUST NOT silently truncate content. Any omission MUST
  be reported with the number of rows affected.
- **FR-009**: The system MUST validate file type by content, not by filename or
  by a browser-supplied type, and MUST enforce a documented size limit.
- **FR-010**: The system MUST present a readable progress sequence and MUST NOT
  add artificial delay. Processing MUST be as fast as the work allows.
- **FR-011**: A model-extracted amount MUST be recorded as an unverified
  candidate and MUST NOT be presented as a settled value until the engine or
  the user has verified it.
- **FR-012**: Rows the system cannot parse MUST remain visible and
  uncategorized rather than being dropped.
- **FR-013**: The system MUST support at least three fixtures with recorded
  ground truth. Per decision D4-B these MUST cover a mobile wallet, a bank
  statement, and a delimited file, with a second mobile wallet fixture where a
  layout differs materially from the first.
- **FR-014**: Row identifiers MUST NOT be derived solely from a timestamp,
  which can collide within the same millisecond.
- **FR-015**: Imported statement text MUST be treated as untrusted content and
  MUST NOT influence system behaviour.
- **FR-016**: Extraction progress and failure MUST be readable in Bengali.

### Key Entities

- **Source Document**: an uploaded statement with a declared type, size, and
  content fingerprint.
- **Extracted Candidate**: a row proposed by extraction, carrying date, amount,
  direction, counterparty, verification state, and evidence references. Not a
  settled transaction until verified.
- **Evidence**: the verbatim text a candidate was read from, plus its location,
  or an explicit record that no location was determinable.
- **Extraction Ground Truth**: the hand-built expected rows for a fixture,
  enabling accuracy to be measured rather than asserted.
- **Extraction Report**: measured accuracy per fixture, stated as rows correct
  over rows expected.

### Scope Boundaries

**In scope**: real text extraction, parser repair, evidence on every row, honest
confidence, upload validation, no artificial delay, three fixtures with ground
truth, collision-free identifiers.

**Out of scope**: recurring detection (spec 007), trend aggregation (spec 004),
intelligent model improvements beyond accurate prompting and validation. Optical
character recognition of scanned images is out of scope; scanned images are
rejected with a clear message.

## Success Criteria

### Measurable Outcomes

- **SC-001**: At least 95% of rows across all three fixtures are extracted with
  correct date, amount, and direction against recorded ground truth.
- **SC-002**: Zero rows are misread because a date fragment was taken as an
  amount.
- **SC-003**: 100% of extracted rows link to verbatim source text present in the
  document.
- **SC-004**: Zero rows carry a fabricated confidence or a fabricated document
  location.
- **SC-005**: Across five bad-file submissions, zero raw technical errors reach
  the user, and every failure names a next step.
- **SC-006**: Processing adds no artificial delay. A 100-row statement reaches
  completion within the 20 second end-to-end budget, measured from upload.
- **SC-007**: Zero identifier collisions occur when rows are created within the
  same millisecond.
- **SC-008**: No row is silently dropped; every unparsed row is surfaced.

## Assumptions

- Fixtures are synthetic but structurally realistic, and are labelled as such.
  Real customer statements are never committed.
- Text-based PDFs are in scope. Scanned images are rejected with a clear
  message rather than silently returning nothing.
- Decision D4-B admits multiple sources, so extraction MUST record which source
  format produced each row and MUST NOT assume a single provider's column layout.
- Bengali-language statements are out of scope for the first pass; the parser
  targets English column headers and Latin digits, and states this when a file
  cannot be read.
- Verification of a model-extracted amount happens in the engine or through the
  existing review surface, not inside the extraction path.
- Extraction accuracy is measured by a script over the fixtures, not by
  inspection.
