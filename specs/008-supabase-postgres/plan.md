# Implementation Plan: 008 Supabase / Postgres Cutover

**Branch**: `008-supabase-postgres` | **Date**: 2026-10-02 | **Spec**: ADR [../001-foundation-authority/adr-002-supabase.md](../001-foundation-authority/adr-002-supabase.md)

**Status**: Plan only. Blocked on credentials — no Supabase project exists yet.

## Summary

Move durable storage from libSQL/SQLite to Supabase Postgres. The schema design
and the repository semantics are settled and carry over unchanged; the driver and
the dialect do not. Nothing above `server/db/` should need to change: routes call
repositories, repositories call `query`/`execute`/`transaction` in
`server/db/client.ts`, and `server.ts` never touches the driver.

Measured scope, from reading every file rather than trusting ADR-002's estimate:

- 1 driver surface: `server/db/client.ts` (103 lines).
- 1 migration runner: `server/db/migrate.ts` (118 lines).
- 11 repository modules, 2,056 lines, of which 717 are tests.
- 8 migrations, 336 lines of SQL.
- 21 test files. 36 of them assert `account_id` scoping.

`client.ts` is the only module that imports `@libsql/client`.
`server/db/repositories/transactions.ts:12` is the only other file that names it.

## Driver decision: direct pool, not the Supabase SDK

ADR-002 recommended the Supabase client SDK (option B) on the grounds that RLS
becomes available. Reaching for the SDK would bypass the guarantee it was chosen
for, so the recommendation needs one correction.

**The service role key bypasses RLS by design.** Supabase grants `service_role`
`BYPASSRLS`. Every server request in this application would run as that role, so
policies would be written, deployed, and never once evaluated. RLS bought with
the service key is theatre.

**The anon key does not help either.** RLS policies evaluate against
`request.jwt.claims`, which means a verified Supabase JWT. This application has
its own session model (`server/auth/session.ts`, opaque token, SHA-256 hash
stored in `sessions`) and issues no Supabase JWT. Adopting the SDK would mean
either replacing the auth layer or minting throwaway Supabase tokens — both
larger than the migration itself.

**Decision: `postgres` (postgres.js) direct connection to the Supabase pooler,
with a non-superuser application role and per-transaction identity.**

```
supabase://<ref>.pooler.supabase.com:6543/postgres   role: kothay_app  (no BYPASSRLS)
```

Per transaction: `BEGIN; SET LOCAL app.account_id = $1; <work>; COMMIT;`

Every RLS policy on a financial table then reads
`account_id = current_setting('app.account_id', true)`. `SET LOCAL` is scoped to
the transaction and reverted on commit, so one connection serving concurrent
requests cannot leak one account's scope into another's.

This keeps the `accountId`-first signature on every repository method
(`server/db/repositories/base.ts:9-12`) and makes it *physical* rather than
voluntary: a query that forgets its scope returns nothing.

## Dialect map, measured

Complete inventory of SQLite-specific constructs. Nothing here is guesswork;
each row names the file it was found in.

| Construct | Location | Postgres replacement | Risk |
|---|---|---|---|
| `@libsql/client` `createClient`, `InValue`, `Transaction` | `client.ts:1`, `transactions.ts:12` | `postgres` tagged template, `sql` type | Low — 3 call sites |
| `PRAGMA user_version` read/write | `migrate.ts:67,100` | `schema_migrations` table, one row per version | Low |
| `tx.executeMultiple(migration.sql)` | `migrate.ts:99` | `sql.unsafe(migration.sql)`; Postgres accepts a multi-statement simple-query string | Low — but the comment at `migrate.ts:95-98` about trigger bodies must be re-verified, not assumed |
| `INSERT OR IGNORE` | `migrations/001:20` | `ON CONFLICT (id) DO NOTHING` | Trivial |
| `RAISE(ABORT, ...)` triggers (2) | `migrations/004:76-96` | `plpgsql` functions returning `RAISE EXCEPTION` | **High** — these enforce Principles III and VI |
| `CHECK (json_valid(x))` (2) | `migrations/005:23,44` | `jsonb` column type | Trivial, strictly better |
| `substr(transaction_date, 1, 7)` | `repositories/transactions.ts:280` | `to_char(transaction_date, 'YYYY-MM')` on a `date` column | Trivial |
| `INTEGER PRIMARY KEY` / `TEXT PRIMARY KEY` | all migrations | `text PRIMARY KEY`; ids stay text, no sequence needed | None |
| 112 `TEXT`/`REAL`/`INTEGER` column declarations | all migrations | see type map below | Medium — see money |

### Type map

| SQLite | Postgres | Note |
|---|---|---|
| `TEXT` holding `YYYY-MM-DD` | `date` | enables real date comparison and removes string sorting |
| `TEXT` holding ISO timestamps | `timestamptz` | `nowIso()` in `base.ts:53` writes `Date.toISOString()`, which parses cleanly |
| `REAL` for money (`amount`, `target_amount`, `current_amount`, savings bounds, bbox) | `numeric(14,2)` for money, `double precision` for bbox | **Biggest correctness risk — see below** |
| `INTEGER` 0/1 flags (`is_duplicate_candidate`) | `boolean` | |
| `TEXT` id columns | `text` | no change |
| json-as-`TEXT` (`supporting_transaction_ids`) | `jsonb` | removes hand-rolled `JSON.parse` in `repositories/insights.ts` |

### Money is the landmine

`postgres.js` returns `numeric` as a **string**, to preserve precision. Inserting
that string into an object that the financial engine then adds up produces string
concatenation, and `1e3`-style coercion, or a `TypeError`, depending on path. The
engine's `roundMoney` in `server/financialEngine.ts` already assumes numbers.

Fix at the driver boundary, not at 40 call sites: configure a type parser so
`numeric` arrives as a number, and keep the column `numeric(14,2)`. Money stays
exact in the database and a JS number in the engine, which is what today's code
already assumes. Round-trip tests must cover this before cutover is called done.

## RLS design

`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` plus a policy per scoped table:
`accounts`, `source_documents`, `transaction_candidates`, `evidence`,
`transaction_evidence`, `insights`, `recommendations`, `goals`, `audit_events`,
`transaction_corrections`, `sessions`.

Table shape is already uniform — all eleven carry `account_id`, and it is
`NOT NULL` everywhere except `audit_events.account_id` (`006:22`,
`ON DELETE SET NULL`). That table needs its own policy and a documented
treatment for the null case, because a null owner cannot be scoped to a session.

The two triggers become constraint-backed, which is stronger than RLS because it
holds regardless of role:

- `trg_manual_row_has_no_document_provenance` → `plpgsql` `BEFORE INSERT`.
- `trg_extracted_row_requires_evidence` → `plpgsql` `AFTER INSERT`.

## Task order

Each task is independently verifiable and leaves the server booting.

1. **Credentials and pooling.** Create the Supabase project. Add
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (migrations only),
   `SUPABASE_APP_DB_URL`, `SUPABASE_APP_DB_PASSWORD` to `.env` and
   `.env.example`. Create role `kothay_app` with `LOGIN`, no `BYPASSRLS`,
   `GRANT SELECT, INSERT, UPDATE, DELETE` on the schema. Verify with `psql`.
2. **`schema_migrations` runner.** Rewrite `migrate.ts` to insert one row per
   applied version inside the same transaction as the body. Take
   `pg_advisory_xact_lock` first: two server instances booting at once must not
   both apply migration 004. Keep `migrate.test.ts` passing against a local
   Postgres via `TEST_DATABASE_URL`.
3. **Driver swap behind the existing API.** Rewrite `client.ts` to export the
   same `query`, `execute`, `transaction`, `hasAnyAccount`, `closeClient`, plus
   the numeric type parser. Nothing above `server/db/` may change. This is the
   step where `npm test` decides whether the swap is honest.
4. **Port the 8 migrations.** New files under `server/db/migrations/` written for
   Postgres from the start — do not edit the SQLite ones in place, they are the
   local dev and test store until cutover completes.
5. **Triggers as `plpgsql`.** Verify by test, not by inspection: assert that an
   extracted row with no evidence is refused, and that a cross-account evidence
   link is refused. Those assertions already exist for SQLite and must be
   re-expressed unchanged in intent.
6. **Repository query fixes.** `transactions.ts:280` month grouping, and any
   `substr`/date comparison. Bounded `LIMIT`/`OFFSET` syntax is identical.
7. **RLS policies and the `app.account_id` set.** Every scoped repository method
   wraps its work in a transaction that sets it. A read path that does not set it
   must return zero rows — assert that, because a silent full-table read is the
   exact failure mode this feature exists to prevent.
8. **Session lookup.** `sessions.ts` must read `sessions` before it knows which
   account is asking, so it runs as a deliberately un-scoped, table-restricted
   path. Narrowest possible exception, documented in the file.
9. **Numeric round-trip tests.** Write money in, read it back through the
   engine, assert equality against `roundMoney`.
10. **Full suite against Postgres.** All 21 test files. The 36 scoping assertions
    are the gate, per ADR-002.
11. **Cutover.** `.env.example` switches to the Postgres default; SQLite path
    stays for local dev and CI until step 12.
12. **Optional: retire libSQL.** Delete `server/db/migrations/*.sql` (SQLite) and
    drop `@libsql/client`. Separate commit, separate PR, only after 11 is green
    on real Supabase.

## Verification

- `npm run lint` clean.
- `npm test` with `TEST_DATABASE_URL` pointing at Postgres: all 21 files green.
- `npm run test:metrics` unchanged — the engine did not move.
- `server/screens.test.ts`, `server/clientLoad.test.ts`, `server/purge.test.ts`
  re-run against Postgres. The purge suite is the one that proves `DELETE`
  reaches Postgres through the RLS policies.
- Manual: sign up, upload the golden fixture, read a clue, export, purge, and
  confirm rows are gone from the Supabase dashboard, not just from the response.

## Rollback

The SQLite path is untouched until step 12, so rollback is one environment
variable. Nothing in this plan is irreversible.

## Credentials checklist

From the Supabase dashboard, none of which exist yet:

- Project URL — Settings, API.
- Connection string, **session pooler** port 5432 for the app, transaction
  pooler 6543 for migrations. Password comes from the same page.
- `SUPABASE_SERVICE_KEY` — needed only for the migration connection. Never in a
  client bundle.
- `GEMINI_API_KEY` — independent of this spec. `server/config.ts:91` already
  reads it; the app degrades to the deterministic parser when it is absent.