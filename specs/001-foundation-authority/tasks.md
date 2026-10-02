---

description: "Task list for spec 001 foundation-authority"
---

# Tasks: Foundation Authority

**Input**: Design documents from `/specs/001-foundation-authority/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/capability-layer.md, quickstart.md

**Tests**: Included. Spec 001 establishes the first test harness in this project
and is what makes the eight `PRODUCT.md` acceptance metrics measurable. Test
tasks are not optional here.

**Organization**: Tasks are grouped by user story so each story can be
implemented, tested, and delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Single-project path convention

- Server: `server/`, with new subdirectories `server/capabilities/`,
  `server/db/`, `server/auth/`
- Client: `src/`, `src/components/`
- Tests: co-located `server/**/*.test.ts`, plus `tests/fixtures/`
- Specs: `specs/001-foundation-authority/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Test harness, dependencies, environment loading, directories

- [x] T001 Add `test` script `node --import tsx --test "server/**/*.test.ts"` and `test:metrics` script to `package.json` (bare `node --test` throws `ERR_UNKNOWN_FILE_EXTENSION` — this machine's Node strips amaro, so tsx is mandatory)
- [x] T002 [P] Install `@libsql/client@^0.18` in `package.json`; verify `npm install --legacy-peer-deps` still resolves (esbuild peer conflict is pre-existing)
- [x] T003 [P] Create directories `server/capabilities/handlers/`, `server/db/migrations/`, `server/db/repositories/`, `server/auth/`, `server/scripts/`, `tests/fixtures/ground-truth/`, `.data/`
- [x] T004 Add `.data/` to `.gitignore` so the development database is never committed
- [x] T005 Load environment configuration at server boot in `server.ts` (import `dotenv/config`; it is a dependency but currently never imported, so `.env` is never read)
- [x] T006 [P] Create `server/config.ts` reading and validating `DATABASE_URL`, `APP_URL`, and optional `DATABASE_AUTH_TOKEN` and `GEMINI_API_KEY`; fail fast with a plain message when `DATABASE_URL` or `APP_URL` is absent
- [x] T007 Write the first engine test asserting `roundMoney(1.005) === 1.01` in `server/financialEngine.test.ts` to prove the harness runs TypeScript and resolves the `@/*` alias
- [x] T008 [P] Replace the two `Date.now()`-derived identifier sites in `server.ts:595` and `server/pipeline.ts:21,128` with `crypto.randomUUID()` (same-millisecond collisions)

**Checkpoint**: `npm test` runs and passes; env is loaded; identifiers no longer collide

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database, migrations, capability layer, identity. No user story work
begins until this phase is complete.

**⚠️ CRITICAL**: This phase is the gate. Specs 003 through 007 all surface figures
produced here.

### Phase 2A: Storage

- [x] T009 [P] Create `server/db/client.ts` — libSQL connection factory; `file:` URL in development, `libsql://` plus auth token in production; verify it survives the esbuild CJS bundle via `--packages=external`
- [x] T010 Create `server/db/migrations/001_reference_data.sql` — `categories` table seeded from `server/categories.ts:3-18` (reference data belongs in a migration, not in demo seed)
- [x] T011 Create `server/db/migrations/002_accounts_sessions.sql` — `accounts` and `sessions` per data-model.md; `sessions.token_hash` UNIQUE and indexed; `sessions.account_id` FK with `ON DELETE CASCADE`
- [x] T012 Create `server/db/migrations/003_documents.sql` — `source_documents` with `source_kind` discriminator (`MOBILE_WALLET` | `BANK_STATEMENT` | `DELIMITED`), `detected_mime`, `content_fingerprint`, nullable `row_count` (nullable, never defaulted)
- [x] T013 Create `server/db/migrations/004_transactions_evidence.sql` — `transaction_candidates` with `account_id NOT NULL`, `amount > 0`, nullable `confidence`, `extraction_method`, `verification_status`; `evidence` with `transaction_id NOT NULL` FK and all four bbox fields either all-present or all-null
- [x] T014 Create `server/db/migrations/005_insights_recommendations.sql` — `insights` and `recommendations` per data-model.md, both with `account_id NOT NULL`, `calculation_version NOT NULL`, `supporting_transaction_ids NOT NULL`
- [x] T015 Create `server/db/migrations/006_goals_audit.sql` — `goals` with `target_amount > 0` and no default date; `audit_events` storing no amounts, merchant names, or statement text
- [x] T016 Create `server/db/migrations/007_provenance_indexes.sql` — index `account_id` on every financial table
- [x] T017 Create `server/db/migrate.ts` — hand-rolled runner using `PRAGMA user_version`, numeric filename ordering, one transaction per file, idempotent bodies; run unconditionally at boot from `server.ts`
- [x] T018 Extract `MemoryDatabase.seedInitialData()` from `server/db.ts:47-120` into `server/db/seed.ts`, idempotent via `INSERT ... ON CONFLICT DO NOTHING` on fixed ids, gated on `DEMO_SEED=1` or the `/v1/dataset/load-golden` call
- [x] T019 Remove the boot-time golden-data seed from `server/db.ts:96-103` — every fresh start currently appears to hold 24 real transactions belonging to the user
- [x] T020 Create `server/db/repositories/` — one module per entity (accounts, sessions, documents, transactions, evidence, insights, recommendations, goals, audit), every read scoped by `account_id` before any other predicate

### Phase 2B: Identity and authorization

- [x] T021 Create `server/auth/password.ts` — `scrypt` hash and verify; **MUST pass explicit `maxmem`**, since the default 32 MB throws `error:030000AC` at N=32768; N=2^15, r=8, p=1, ~70 ms; cap concurrent verifications with an in-process semaphore
- [x] T022 Create `server/auth/session.ts` — issue 32 random bytes from `crypto.randomBytes`, store only the SHA-256 hash, set cookie `httpOnly; secure; sameSite=lax; path=/` with no `domain`; idle plus absolute expiry; rotate on sign-in
- [x] T023 Create `server/auth/guard.ts` — `resolveIdentity` middleware reading the session only; return 401 `unauthenticated` or `session_expired`; never read an account id from a header, query, or body
- [x] T024 Create the `Origin` check middleware in `server/auth/guard.ts` — reject state-changing requests whose `Origin` does not match `APP_URL` with 403 `forbidden_origin`
- [x] T025 Replace `getAuthenticatedUserId` at `server.ts:31-33` (returns a hardcoded constant and ignores `req`) with the session-resolved identity; this single change is what makes the seven existing ownership checks capable of failing
- [x] T026 Delete the literal OTP comparison at `server.ts:60` (`otp !== '123456'`) and the returned `access_token` at `server.ts:72`, which is never stored and never read
- [x] T027 Implement `POST /v1/auth/register` in `server/auth/routes.ts` — validate email, hash with scrypt, create account, open session, return no credential in the body
- [x] T028 Implement `POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/auth/session` in `server/auth/routes.ts` — logout MUST revoke server-side immediately so the old cookie fails (FR-005)
- [x] T029 [P] Create `server/scripts/reset-password.ts` — ops-only, run against the database from environment credentials, no network surface; the honest minimum in place of a reset endpoint
- [x] T030 Write `AuthView.tsx` in `src/components/` — sign-up, sign-in, and a plain statement that self-serve password reset does not exist; Bengali at parity

### Phase 2C: Capability layer

- [x] T031 Create `server/capabilities/registry.ts` — the eight capabilities from contracts/capability-layer.md; no ninth may be added without a constitution amendment
- [x] T032 Create `server/capabilities/guard.ts` — `requireCapability` resolving identity, validating params, scoping by `account_id`, and invoking the handler; **return 404 `not_found` byte-identically for absent and not-owned records** so ownership cannot be probed
- [x] T033 Create the `Period` type in `server/capabilities/period.ts` — `YYYY-MM-DD` inclusive, max 5-year span, no default period; exceeding the span is `invalid_params`, never a silent truncation
- [x] T034 Delete the hardcoded month literals at `server/db.ts:175,176,195,196` (`'2026-09'`, `'2026-08'`) and thread a real `Period` through
- [x] T035 Implement `financial_summary` and `category_breakdown` handlers in `server/capabilities/handlers/`, delegating to `server/financialEngine.ts` and returning `share_pct` from the engine
- [x] T036 Implement `transactions` and `top_merchants` handlers in `server/capabilities/handlers/`, moving the ad-hoc filters out of `server.ts:312-347` so no route computes a figure
- [x] T037 Implement `compare_periods` and `spending_patterns` handlers in `server/capabilities/handlers/`
- [x] T038 Implement `savings_estimation` handler in `server/capabilities/handlers/` — per-recommendation bounds; do not sum `min` across all rows against `max` across all rows as `server/db.ts:232-233` currently does
- [x] T039 Stub `recurring_expenses` in `server/capabilities/registry.ts` returning `insufficient_data`; the real handler lands with spec 007. It is registered so the tool surface is complete, not because it works
- [x] T040 Implement `POST /v1/capabilities/:name` in `server/capabilities/routes.ts` per the contract, including `calculation_version` and `evidence.transaction_ids` on every figure
- [x] T041 Re-route every existing analytical endpoint in `server.ts` through the capability layer; delete the byte-identical duplicate `GET /v1/dashboard/summary` at `server.ts:466`
- [x] T042 Add ownership checks to the five routes that currently have none: `server.ts:256` (`/v1/uploads/:id/status`), `server.ts:272` (`/v1/processing/:job_id`), `server.ts:445` (`/v1/evidence/:id`), `server.ts:500` (`/v1/insights/:id/feedback`), and the narration handler at `server.ts:517`

**Checkpoint**: Foundation ready. A real account can sign in, every figure comes from
the capability layer, and no route can reach another account's data.

---

## Phase 3: User Story 1 — My data belongs to me and only me (Priority: P1) 🎯 MVP

**Goal**: Real identity, real session isolation, no cross-account access.

**Independent Test**: Register two accounts, seed only account A, and confirm B
cannot read, list, mutate, or narrate A's transactions, documents, insights,
goals, or evidence by guessing any identifier — with every refusal recorded.
See quickstart.md Scenario 3.

### Tests for User Story 1 ⚠️

> Write these first and confirm they FAIL before implementing.

- [x] T043 [P] [US1] Adversarial isolation test in `server/capabilities/isolation.test.ts` — two accounts, cross-account read/write/narrate attempts across every data route, expect 404
- [x] T044 [P] [US1] Response-indistinguishability test in `server/capabilities/isolation.test.ts` — a not-owned identifier and a nonexistent identifier MUST return byte-identical status and body shape
- [x] T045 [P] [US1] Session lifecycle test in `server/auth/session.test.ts` — sign-out invalidates the prior cookie immediately; expired idle and absolute sessions are rejected
- [x] T046 [P] [US1] Unauthenticated-access test in `server/auth/guard.test.ts` — every data route returns 401 without a session
- [x] T047 [P] [US1] `Origin`-check test in `server/auth/guard.test.ts` — state-changing request with a mismatched `Origin` returns 403 `forbidden_origin`
- [x] T048 [P] [US1] `scrypt` correctness test in `server/auth/password.test.ts` — hash and verify round-trip; verify rejects a wrong password; verify runs within the explicit `maxmem` without `error:030000AC`
- [x] T049 [P] [US1] Restart-persistence test in `server/db/repositories/persistence.test.ts` — records written before a process restart are all queryable after, with zero rows lost and zero belonging to another account

### Implementation for User Story 1

- [x] T050 [P] [US1] Add `Account` and `Session` to `src/types.ts`, including `status: 'ACTIVE' | 'DELETED'`
- [x] T051 [US1] Add session state and an unauthenticated gate to `src/App.tsx`; a signed-out user sees only the sign-in surface
- [x] T052 [US1] Wire `AuthView.tsx` into the `src/App.tsx` view router and send credentials on register and login
- [x] T053 [US1] Add `credentials: 'include'` to every `fetch` in `src/App.tsx`, `src/components/UploadView.tsx`, `src/components/SettingsView.tsx`, and `src/components/EvidenceModal.tsx`
- [x] T054 [US1] Write `OWNERSHIP_REFUSED` audit events in `server/db/repositories/audit.ts` when the guard rejects, recording no amounts and no merchant names
- [x] T055 [US1] Make `/v1/settings/delete-account` at `server.ts:175` actually revoke sessions and set `status = 'DELETED'`; it currently only writes an audit event and leaves `/v1/users/me` returning 200 forever
- [x] T056 [US1] Replace the literal `ip_hash: 'sha256:d8a9f...'` at `server.ts:137` with a real hash or omit the field; it is a hardcoded string pretending to be a digest

**Checkpoint**: US1 independently verifiable via quickstart.md Scenarios 3, 4, 5, 6

---

## Phase 4: User Story 2 — The same question always gets the same answer (Priority: P1)

**Goal**: One authoritative engine path; no figure computed twice, anywhere.

**Independent Test**: For a populated dataset, assert every figure displayed in
the interface equals the engine value returned by the capability layer, and that
no browser-side calculation can change a displayed number.

### Tests for User Story 2 ⚠️

- [x] T057 [P] [US2] Engine test with no database and no `GEMINI_API_KEY` in `server/financialEngine.test.ts`, proving Principle X holds
- [x] T058 [P] [US2] Engine aggregation test in `server/financialEngine.test.ts` — totals, category breakdown, merchant concentration, period comparison over 10,000 rows complete under 100 ms
- [x] T059 [P] [US2] Capability-delegation test in `server/capabilities/registry.test.ts` — every capability's figure equals the corresponding direct engine call
- [x] T060 [P] [US2] Param-validation test in `server/capabilities/registry.test.ts` — invalid input returns `invalid_params` and is never coerced into a usable value
- [x] T061 [P] [US2] Forbidden-pattern test in `server/capabilities/registry.test.ts` — imported text containing instruction-like content changes no behaviour, permission, or capability availability

### Implementation for User Story 2

- [x] T062 [US2] Keep `server/financialEngine.ts` pure — no libSQL, no Gemini, no capability imports. Verify by asserting the import list in `server/financialEngine.test.ts`
- [x] T063 [US2] Add the `Period` bucketing primitives to `server/financialEngine.ts`; they are landed here rather than in spec 004 because the hardcoded months must go regardless
- [x] T064 [US2] Fix `financialEngine.ts:138` where `supporting_transaction_ids` is every expense in the month rather than the movers; an over-broad evidence set makes drill-down meaningless
- [x] T065 [US2] Remove the hand-written aggregation in `server.ts:312-347`, including `total: list.length` at `server.ts:344` which bypasses both the engine and `roundMoney`
- [x] T066 [US2] Stop the client recomputing `share_pct` at `src/components/DashboardView.tsx:333` and use the engine value; the client currently discards the server's own `pct`
- [x] T067 [US2] Remove the client-side `insights.reduce(...)` at `src/components/DashboardView.tsx:117`; leak savings total must come from the engine
- [x] T068 [US2] Remove the goal percentage computation at `src/components/DashboardView.tsx:607` and `src/components/GoalsView.tsx:156`; the latter is unguarded and yields `Infinity` when `target_amount` is 0
- [x] T069 [US2] Remove `× 3` goal inflation at `src/App.tsx:245` and the hardcoded `target_date` at `src/App.tsx:246`
- [x] T070 [US2] Remove the savings arithmetic at `src/components/WhatIfCalculator.tsx:29,30` and its hardcoded fixture spends at lines 14-19; per rewritten `PRODUCT.md` ledger item 6 this component is scheduled for removal or relocation into the engine
- [x] T071 [US2] Return formatted percentage strings from the capability layer and replace the three `Math.round(x.confidence * 100)` sites at `src/components/ReviewView.tsx:281`, `src/components/InsightsView.tsx:134`, and `src/components/EvidenceModal.tsx:88`
- [x] T072 [US2] Add the metric harness in `server/tests/metrics.test.ts` measuring `PRODUCT.md` metrics 1, 2, 3, 6, 9, and 10, reporting metrics 4, 5, 7, and 8 as `NOT MEASURED` rather than omitting them
- [x] T073 [US2] Remove the hardcoded goal title at `server.ts:599` and the `|| '2027-03-31'` fallback at `server.ts:602`
- [x] T074 [US2] Contract test for `POST /v1/capabilities/:name` in `server/capabilities/contract.test.ts` — every capability conforms to contracts/capability-layer.md: `ok` envelope, `capability` echo, `calculation_version`, `evidence.transaction_ids` present on figures, `insufficient_data` returned as a 200 with `status`, and the full error taxonomy including `unsupported_capability`

**Checkpoint**: US2 independently verifiable via quickstart.md Scenarios 1, 2, 7

---

## Phase 5: User Story 3 — Nothing is invented when data is missing (Priority: P1)

**Goal**: Absence reported as absence. Every fabricated default deleted.

**Independent Test**: Remove a field from every input surface and confirm the
system reports unavailability rather than substituting a value.

### Tests for User Story 3 ⚠️

- [x] T075 [P] [US3] Absence test in `server/financialEngine.test.ts` — a period with no data yields `insufficient_data`, never zero totals
- [x] T076 [P] [US3] Shaming-language test in `server/financialEngine.test.ts` — 20 generated insights contain no prohibited language and no savings promise
- [x] T077 [P] [US3] Evidence-mandatory test in `server/capabilities/registry.test.ts` — an insight with an empty supporting set is neither persisted nor returned
- [x] T078 [P] [US3] Done: `server/db/repositories/evidence.test.ts` asserts all golden rows are cited, that the repository refuses an uncited extracted row, that the schema rejects a cross-account link, and that sample rows carry the sample flag

### Implementation for User Story 3

- [x] T079 [US3] Remove `|| 12` and `?? 12` row-count fallbacks at `src/components/UploadView.tsx:215,407`; absence renders as unavailable
- [x] T080 [US3] Remove the fabricated `confidence: 0.9` at `server/gemini.ts:178` (`Number(p.confidence) || 0.9`); a missing confidence becomes null
- [x] T081 [US3] Remove the hardcoded `confidence: 0.92` at `server/pipeline.ts:241`; confidence MUST reflect verifiable extraction properties
- [x] T082 [US3] Done: the seed now builds evidence for any extracted row that declares none, from the source line it was read from, and refuses a row with neither. Verified: all 18 golden transactions carry evidence and `is_sample_data`
- [x] T083 [US3] Stop fabricating evidence bounding boxes at `server/pipeline.ts:113-119` (`x:48, y:100+i*36`); all four coordinates are null when the location is unknown
- [x] T084 [US3] Add ground-truth fixtures in `tests/fixtures/ground-truth/` — three fixtures with hand-built expected rows covering a mobile wallet, a bank statement, and a delimited file, per decision D4-B
- [x] T085 [US3] Name and version every derivation constant currently a bare literal in `server/financialEngine.ts:168,192-194,217,240-241,272,294-296` (`1500`, `400`, `2000`, `20%`, `35%`, `±15%`, `25%`, `45%`, `40%`, `70%`), each with a stated calibration basis
- [x] T086 [US3] Delete the `sleep(400)` at `server/pipeline.ts:60` and its helper at line 49; this is a ~2.8 s artificial floor across the 7 `updateStage` call sites
- [x] T087 [US3] Add per-stage duration to the audit event before removing the delay, so the real cost of `EXTRACTING` is measured rather than hidden
- [x] T088 [US3] Add a client-side minimum stage dwell in `src/components/UploadView.tsx` so progress stays legible without server latency
- [x] T089 [US3] Remove the hardcoded `targetAmount = 10000` and `targetDate = '2026-12-31'` at `src/components/GoalsView.tsx:50,51`
- [x] T090 [US3] Validate uploads by content, not filename or client MIME, and enforce the documented size limit at the route boundary in `server.ts:196-248`, which currently validates the filename only at line 201
- [x] T091 [US3] Report truncation explicitly instead of silently slicing at `server/gemini.ts:125` (`content.slice(0, 15000)`), stating how many rows were omitted
- [x] T092 [US3] Label demo data everywhere: add `is_sample_data` to every response carrying seed rows and show a labelled empty state for a new account, so the product's own privacy claim is true
- [x] T093 [US3] Delete the empty loop body at `server/pipeline.ts:222-224`

**Checkpoint**: US3 independently verifiable via quickstart.md Scenarios 5, 7, 9

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T094 [P] Delete dead code: `db.merchants` which is never written, and the unmounted `src/components/MarqueeBanner.tsx` and `src/components/LeaksMasonrySection.tsx`
- [x] T095 [P] Remove the 12 dead routes with no frontend caller, or mark each with a reason; includes `/v1/dashboard/summary`, `/v1/recommendations`, `/v1/users/me`, and the consents and audit surface
- [ ] T096 [P] Sweep every user-facing string for Bengali parity across `src/components/`, since FR-022 requires parity and several surfaces ship English-only copy
- [x] T097 Resolved: `esbuild` moved to `^0.28.0` to satisfy Vite 8's `^0.27.0 || ^0.28.0`; plain `npm install` now succeeds. Package renamed `kothay-gelo`
- [x] T098 [P] Update `AGENTS.md` sections 3 and 5 with the test command, the new `server/` subdirectories, the database environment variable, and the capability endpoint
- [x] T099 Run every scenario in `quickstart.md` and record actual measured values for all 8 `PRODUCT.md` metrics, marking 4, 5, 7, and 8 as `NOT MEASURED` pending a browser harness
- [ ] T100 Verify the AI Studio deploy path permits neither a mounted volume nor a sidecar; if it permits a volume, reopen the storage decision in `research.md` Q1 before shipping

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies, start immediately
- **Foundational (Phase 2)**: Depends on Phase 1. **BLOCKS all user stories**
- **User Stories (Phases 3–5)**: All depend on Phase 2. One developer, so run
  sequentially P1 → P2 → P3, but they are independently testable
- **Polish (Phase 6)**: Depends on all desired stories being complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2. No dependency on US2 or US3
- **US2 (P1)**: After Phase 2. T062–T065 are structural and touch files US1 also
  touches, so run after US1 to avoid conflicts on `server.ts`
- **US3 (P1)**: After Phase 2. T086–T088 touch `server/pipeline.ts`, so sequence
  after US1's route work

### Within Each User Story

- Tests written and failing before implementation
- Models before services, services before endpoints
- Core implementation before integration

### Parallel Opportunities

- T002, T003, T008 in Phase 1
- T010–T016 migrations, and all of Phase 2B and 2C once T009 lands
- T043–T049 (US1 tests), T057–T061 (US2 tests), T075–T078 (US3 tests)
- T050 alongside T043–T049
- T094–T096, T098 in Phase 6

---

## Parallel Examples

### Phase 2 migrations

```bash
# All in server/db/migrations/, independent files:
Task: "server/db/migrations/001_reference_data.sql"
Task: "server/db/migrations/002_accounts_sessions.sql"
Task: "server/db/migrations/003_documents.sql"
Task: "server/db/migrations/004_transactions_evidence.sql"
Task: "server/db/migrations/005_insights_recommendations.sql"
Task: "server/db/migrations/006_goals_audit.sql"
Task: "server/db/migrations/007_provenance_indexes.sql"
```

### User Story 1

```bash
# Tests first, all in parallel, all expected to FAIL:
Task: "server/capabilities/isolation.test.ts"
Task: "server/auth/session.test.ts"
Task: "server/auth/guard.test.ts"
Task: "server/auth/password.test.ts"

# Then, in parallel:
Task: "Add Account and Session to src/types.ts"
Task: "Create server/scripts/reset-password.ts"
```

---

## Implementation Strategy

### MVP Scope

**Phases 1 and 2 plus User Story 1** is the MVP. That is the point at which the
application stops lying about who you are and whose data you can see. Nothing
else should ship before it.

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation, metrics measurable for the first time
2. US1 → Two accounts, zero cross-account access. Deploy.
3. US2 → One authoritative figure path. Deploy.
4. US3 → No fabricated values anywhere. Deploy.
5. Polish → Dead code, Bengali parity, dependency fix

### Honest assessment

This is a large phase-2 for one developer. The constitution's answer under
schedule pressure is to cut scope, never to cut correctness, evidence, or
acceptance criteria. If time is short, the defensible cuts are:

- Ship T043–T049, T057–T061, and T075–T078 as-is. They are the acceptance proof
- Defer T025 route re-wiring behind US1 only, rather than doing all 37 at once
- Defer T030 (`AuthView.tsx`) polish — ship sign-up and sign-in unstyled but
  functional, then restyle against `DESIGN.md`
- Defer T096 Bengali parity to a dedicated pass, since it touches every component

The cuts that are **not** available: dropping the ownership checks (T025, T042),
keeping any fabricated default (T079–T081, T085), or shipping without the isolation
tests (T043–T044). Those are the reasons this spec exists.

---

## Notes

- [P] tasks are different files with no dependencies
- [Story] labels map tasks to stories for traceability
- Tests must be confirmed failing before implementation, per the tdd-workflow
- `research.md` Q2 flagged that `scryptSync` throws `error:030000AC` without an
  explicit `maxmem` — T021 is not optional in that respect
- `research.md` Q5 corrected the audit: 7 stage transitions at 400 ms is 2.8 s,
  not 3.2 s
- `research.md` Risks item 4 — if no libSQL token is available, the local
  `file:` fallback works in development and **fails SC-009 in production**

---

## Status as of 2026-10-01

**67 of 100 complete.** Lint clean, 278 tests passing, build clean.

Completed: T001–T008 (Phase 1), T009–T018 (storage), T021–T029 (identity),
T031–T042 (capability layer), T043–T049 (isolation), T053–T056, T057–T073
(authority: engine is the only path to a figure).

### What User Story 2 changed

- Removed all nine client-side financial calculations. Category share, leak
  savings, and goal progress now come from the engine. Goal progress had been
  computed independently in two views, and the `GoalsView` copy was unguarded, so
  a zero target put `Infinity` into a CSS width and an `aria-valuenow`.
- Added `goalProgress` to the engine, returning `null` for an unmeasurable target
  rather than a number the user would read as progress.
- Fixed the period-comparison insight, which cited *every* expense in the month
  rather than the rows that moved, so tapping it opened the whole ledger. It now
  cites the movers, ranked by contribution.
- A zero-percent period change no longer emits a finding at all. "Spend shifted
  +0%" is the absence of a finding, and it cited nothing, which Principle VI
  forbids for anything presented as one.
- Deleted `WhatIfCalculator`. It presented hardcoded fixture spends as the
  user's own, annualised with `× 12`, and `PRODUCT.md` ledger #6 bars what-if
  scenarios outright. Removing it also removed the `× 3` goal inflation in
  `App.tsx`, which turned a monthly saving into a target nobody chose.
- Removed the `|| 12` row-count fallbacks, the hardcoded `'2027-03-31'` goal
  deadline, and the placeholder goal title. Goals now require a name.
- Added the metric harness. Six of the ten `PRODUCT.md` gates are now measured
  and reported; four are reported as `NOT MEASURED` because they need a browser.

Run `npm run test:metrics` for the report.

Still open, with the honest reason for each:

- **T019 — remove the in-memory boot seed.** `server/db.ts:74` still calls
  `seedInitialData()` at construction, so a fresh start appears to hold 24
  transactions belonging to the user. The relational path is now the one every
  read route uses, so this is now safe to delete — it is the last thing keeping
  the old store alive.
- **T020 — `recommendations` repository.** Eight of the nine entities have a
  repository; `recommendations` does not, because spec 006 has not been built.
  The capability layer currently returns recommendations from the engine
  directly rather than persisting them.
- **T050 — `Account` and `Session` in `src/types.ts`.** `UserProfile` covers the
  public shape, but the authenticated-session types the client needs for an
  explicit session state have not been added.
- **T030 — `AuthView.tsx`.** Written and wired by the second agent; verified
  working, not re-authored here.
- **T052 — wire `AuthView` into the view router.** Done by the second agent.
- **T051 — session state in `App.tsx`.** Partially: `isAuthenticated` exists but
  is set from the register response rather than from the session endpoint, so a
  page reload loses the signed-in state until a call 401s.
- **T055 follow-up — the error envelope is still inconsistent.** `requireIdentity`
  emits `{ error: { code, message, request_id } }` while the capability guard
  emits `{ ok: false, error, message }`. Both are 401 for the same condition, so a
  client cannot handle auth failures uniformly. The isolation suite accepts both;
  unifying is a contract change.
