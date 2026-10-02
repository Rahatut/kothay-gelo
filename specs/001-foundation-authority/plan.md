# Implementation Plan: Foundation Authority

**Branch**: `001-foundation-authority` | **Date**: 2026-10-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-foundation-authority/spec.md`

## Summary

Make the application's claims true. Replace the theatrical identity layer with
real accounts backed by a relational store, enforce ownership on every data
route through a single capability layer that is the only path to a financial
figure, and delete every fabricated default currently standing in for data the
system does not have. Nothing else may ship until this lands, because trends,
questions, and recommendations all surface numbers that must be authenticated,
reproducible, and attributable.

**Technical approach**: libSQL (SQLite dialect) via `@libsql/client`, behind a
repository layer that leaves `financialEngine.ts` as pure functions.
`crypto.scrypt` for password hashing with opaque server-side session tokens in
httpOnly cookies. A hand-rolled `PRAGMA user_version` migration runner with demo
seeding split out of the schema path. `node:test` via `tsx` as the first real
test harness, so the eight acceptance metrics become measurable for the first
time.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22 (local runtime 22.22.1)

**Primary Dependencies**: Express 4.21 · `@libsql/client` 0.18 (new) ·
`unpdf` 1.8 (spec 002, added here because upload validation is FR-020) · React
19 + Vite 8 + Tailwind 4 · `@google/genai` 2.4 · `motion` 12 · `lucide-react`
· `tsx` for dev and test

**Storage**: libSQL / Turso remote over `@libsql/client`, SQLite dialect. Local
`file:` URL in development only. Schema owned by numbered `.sql` migrations
tracked in `PRAGMA user_version`; demo data owned separately by an idempotent
seed.

**Testing**: `node:test` via `node --import tsx --test "server/**/*.test.ts"`.
Assertions from `node:assert/strict`. Coverage via
`--experimental-test-coverage`, with threshold enforcement deferred.

**Target Platform**: Linux server on Google AI Studio / Cloud Run, single
container, port 3000. Vite dev middleware in development, static `dist/` in
production.

**Project Type**: Single-service web application — one Express process serving
both the API and the built client

**Performance Goals**: Upload-to-clue ≤20 s on a 100-row statement. Engine
aggregation over 10,000 transactions under 100 ms. Question answers under 3 s.
Sign-in hashing budget ~70 ms per verification.

**Constraints**: ≤20 s end-to-end upload budget · 512 MB–1 GB instance memory,
which caps concurrent `scrypt` verifications · `scryptSync` must pass an explicit
`maxmem` or throw `error:030000AC` · no file-system dependency, because the
container filesystem is ephemeral · no dependency may block the build, since
`npm install` currently fails on an unresolved esbuild peer conflict and requires
`--legacy-peer-deps`

**Scale/Scope**: One developer. Small user base. Nine relational entities. 37
existing routes to reconcile, of which 17 are currently dead and 5 lack
ownership checks. Seven specs in the committed pipeline, of which this is the
first.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Gate status at initial check (pre-amendment): FAIL.** Principle III was
violated in implementation — identity was a hardcoded constant, so no ownership
check could ever fail, and five routes performed none. Principle II was not
implemented at all. Principle I was violated on the extraction path, where a
model-supplied amount is written into the ledger and then feeds every total.

**Gate status after constitution 1.1.0 amendment (2026-10-01): PASS**, with the
conditions below.

| Principle | Requirement | How this plan satisfies it | Status |
|---|---|---|---|
| I. Deterministic Financial Truth | Engine authoritative for all figures | Repository layer becomes the only data path; `financialEngine.ts` stays pure; every route delegates to a capability; FR-008 forbids route-level computation | PASS |
| II. Tool-Mediated Quantitative Answers | Fixed tool surface, parameters validated | `server/capabilities/` implements the eight named capabilities as the only addressable quantitative operations, each validating its parameters. This is the first implementation of a principle that was ratified and never built | PASS |
| III. Dataset-Scoped Authorization | Server-side identity, per-request enforcement | Real accounts, server-held sessions, and a single `requireCapability` guard applied to every data route. FR-003 names the five currently-unchecked routes explicitly | PASS |
| IV. Untrusted Imported Data | Imported text stays data | Unchanged by this plan. FR-014 restates it; capability layer passes imported text as values only and never as instructions | PASS |
| V. Read-Only MVP | No transaction execution, no mutation of financial records | Unchanged. FR-015 restates it. Manual entry (spec 003) is user-assertion, not execution | PASS |
| VI. Evidence Is Mandatory | Claims trace to transactions | FR-013 forbids displaying a finding with no supporting rows; the 13-of-18 seed rows missing evidence are fixed here | PASS |
| VII. Certainty Levels | Facts, estimates, insufficient data distinguished | FR-012 requires explicit labelling; missing-figure defaults are deleted rather than replaced | PASS |
| VIII. Simple Modular Architecture | Boring, no speculative abstraction | Hand-rolled migration runner over a framework; `node:test` over vitest/jest; rejected knex specifically to keep SQL out of app-layer figure production. Persistence is the one real complexity, and it is bought once for all seven specs | PASS, with tracked exception |
| IX. Correctness Over Feature Count | Cut scope, never cut correctness | No feature ships ahead of this spec. Persistence was the exception taken: it was bought early because 003–006 all depend on it | PASS |
| X. Independently Testable Engine | Engine testable without the LLM | Engine stays pure functions over `Transaction[]`; `node:test` harness added so this is actually verifiable for the first time | PASS |

**Tracked exception — persistence bought before it is strictly needed.** Principle
VIII prefers simplicity. A relational store is not the simplest possible thing.
It is adopted now rather than in spec 003 because accounts, history, and seven
downstream specs all require it, and retrofitting storage after auth is far more
expensive than adopting it alongside. The alternatives were genuinely simpler and
rejected on durability grounds, not on convenience — see `research.md` Q1.

**Complexity Tracking**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| External database service (libSQL) | SC-009 requires records to survive a restart; Cloud Run offers no durable volume and the deploy path permits no sidecar or VPC connector | Local SQLite file fails durability — the container filesystem is ephemeral, so ledgers vanish on cold start |
| Password authentication | D1-B requires full accounts with retained history | Phone OTP was the recommended alternative; rejected by the product owner, and it would have required an SMS provider |
| Migration runner written by hand | 001 replaces the store with no production data, so schema needs versioning from zero | A framework adds a dependency and config to solve a problem `PRAGMA user_version` solves in one line |

## Project Structure

### Documentation (this feature)

```text
specs/001-foundation-authority/
├── spec.md              # requirements (input)
├── plan.md              # this file
├── research.md          # Phase 0 — decisions and rejected alternatives
├── data-model.md        # Phase 1 — entities, schema, validation
├── quickstart.md        # Phase 1 — runnable validation scenarios
├── contracts/           # Phase 1 — API and capability contracts
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
server/
├── capabilities/          # NEW — the only path to a financial figure
│   ├── registry.ts        # the eight approved capabilities, name → handler
│   ├── guard.ts           # requireCapability: identity + ownership + params
│   └── handlers/          # one file per capability
├── db/
│   ├── client.ts          # NEW — libSQL connection, migration bootstrap
│   ├── migrations/        # NEW — numbered .sql, schema only
│   ├── seed.ts            # NEW — idempotent demo data, extracted from db.ts
│   └── repositories/      # NEW — account, session, transaction, evidence, ...
├── auth/
│   ├── password.ts        # NEW — scrypt hash/verify with explicit maxmem
│   ├── session.ts         # NEW — opaque token issue, rotate, revoke
│   └── guard.ts           # NEW — resolveIdentity middleware
├── financialEngine.ts     # EXTENDED — stays pure, gains period bucketing
├── gemini.ts              # unchanged this spec
├── pipeline.ts            # MODIFIED — sleep removed, per-stage timing added
├── goldenDataset.ts       # EXTENDED — evidence added to all 18 rows
├── db.ts                  # REPLACED by db/repositories
├── categories.ts          # unchanged
└── pipeline.ts

server/scripts/
└── reset-password.ts      # NEW — ops-only, no network surface

server/**/*.test.ts        # NEW — node:test suites
tests/
└── fixtures/ground-truth  # NEW — hand-built expected rows per fixture

src/
├── App.tsx                # MODIFIED — session state, sample-data labelling
├── components/
│   ├── AuthView.tsx       # NEW — sign-up, sign-in
│   ├── ...                # EXISTING — swept for client-side financial math
└── types.ts               # EXTENDED — Account, Session, provenance fields

tests: node --import tsx --test
```

**Structure Decision**: The existing single-process layout is kept. What changes
is that `server/` gains three directories — `capabilities/`, `db/`, and `auth/` —
each with one responsibility, because all three are consumed by every one of the
six downstream specs and therefore need stable seams. No new service, no new
process, no new top-level project. `financialEngine.ts` stays at its current
path and stays pure; nothing in `db/` or `capabilities/` is imported into it.

## Constitution Re-check (post-Phase 1 design)

| Principle | Change introduced by Phase 1 | Status |
|---|---|---|
| I | `data-model.md` makes `account_id` NOT NULL on every financial table and indexes it, so a figure cannot exist without an owner | PASS |
| III | `contracts/` defines the guard contract: every data route declares exactly one capability, and the guard resolves identity from the session only | PASS |
| VI | `data-model.md` makes `evidence.transaction_id` NOT NULL, so a transaction row cannot exist without provenance | PASS |
| VIII | Rejected the query-builder dependency explicitly to keep figure production confined to the engine | PASS |
| X | `quickstart.md` runs the engine suite with no database and no model, proving Principle X | PASS |

No violations introduced. Gate remains PASS.

## Deferred to later specs, tracked not forgotten

- Recurring detection (spec 007) — named capability, handler lands with 007
- Period bucketing primitives in the engine — added in 001 because 004 depends on
  them and the hardcoded month literals must go regardless
- Question composition over the capability registry — spec 005
- The what-if calculator computes outside the engine and is scheduled for removal
  per the rewritten `PRODUCT.md` ledger item 6
- `MarqueeBanner` and `LeaksMasonrySection` are dead code; removal is a
  cleanup task, not a design decision
