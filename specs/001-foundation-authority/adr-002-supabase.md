# Storage Decision — Revision 2

**Created**: 2026-10-01
**Supersedes**: `research.md` Q1 (libSQL/Turso)
**Status**: Accepted by the product owner. Not yet acted on.

---

## Decision

The product owner has stated that **Supabase is the intended production store**.

This was decided after Phase 2A was built on libSQL. It is recorded here rather
than acted on immediately, because no Supabase project exists yet — there is no
instance URL, no service role key, and no migration path configured. Migrating
today would be migrating to nothing.

## What this changes

Phase 2A shipped a working, tested SQLite layer: 7 migrations, 11 tables, 180
tests, migrating at boot, serving the seed. That work is not wasted — it is the
schema design and the repository layer, which carry over. What does not carry
over is the driver and the dialect.

### Inventory of SQLite-specific constructs

Measured, not guessed. This is the complete list of what must change.

| Construct | Where | PostgreSQL equivalent | Cost |
|---|---|---|---|
| `PRAGMA user_version` | `server/db/migrate.ts` | A `schema_migrations` table with one row per applied version | Small — the runner is ~60 lines |
| `@libsql/client` `createClient` | `server/db/client.ts` | `pg` or `postgres.js`, or the Supabase SDK | Small, but it decides the API shape — see below |
| `intMode: 'number'` | `client.ts` | Not needed; Postgres returns integers as numbers | Trivial |
| `INSERT OR IGNORE` | `migrations/001` | `ON CONFLICT DO NOTHING` | Trivial |
| `RAISE(ABORT, ...)` triggers | `migrations/004` (2 of them) | `plpgsql` trigger functions returning a raised exception | Moderate — the constitutional invariants live in these |
| `json_valid()` in CHECK | `migrations/005` (2 of them) | `jsonb` column type with a native constraint | Trivial, and strictly better as `jsonb` |
| `substr(x, 1, 7)` | `repositories/transactions.ts` | `substr` exists in Postgres too | None |

Two of these deserve attention because they are not mechanical:

1. **The triggers enforce constitution Principles III and VI.** They refuse a
   financial row with no owner and a link to evidence from a mismatched account.
   These must be re-expressed as `plpgsql` functions. Losing them silently would
   remove a constitutional guarantee, so the repository tests that assert them
   must run against Postgres before the cutover is called done.

2. **`supporting_transaction_ids` should become `jsonb`, not `json`.** The
   application currently serialises and parses these strings by hand in
   `repositories/insights.ts`. `jsonb` removes that code and lets the database
   index the array.

## The decision that actually matters: driver, not dialect

Two ways to reach Supabase, and they are not equivalent:

### A. Direct Postgres connection (`pg` or `postgres.js`)

The repository layer changes very little. SQL strings stay, `account_id` scoping
stays enforced in application code, and the migration work above is the whole
cost. Supabase is then just a Postgres host with backups and a connection pool.

### B. Supabase client SDK (`@supabase/supabase-js`)

Every repository is rewritten against a different query API. In exchange,
**Row Level Security** becomes available: an `account_id` policy enforced by the
database itself, so a query that forgets its scope returns nothing rather than
leaking.

Option B is the stronger answer to constitution Principle III. The current
design enforces dataset isolation in application code — every repository method
takes `accountId` and weaves it into the WHERE clause, and 36 tests assert it.
That is correct but it is *voluntary* isolation. RLS makes it *physical*: the
database refuses the query.

Option B also means the `account_id`-first signature on every repository method
becomes a deliberate choice rather than the only line of defence, which is a
better place for it to be.

## Recommendation

**Migrate to Postgres via the Supabase SDK (option B), with RLS on every
financial table.** The rewrite is larger than option A, but the isolation it buys
is exactly what the constitution demands and what the audit found missing.

Do it as a dedicated spec — `008-supabase-postgres` — placed before the remaining
features, not after. Reason: every subsequent spec adds repositories, and each one
added after the cutover is cheaper to write against the final API. The cost of
migrating grows with the amount of repository code that exists.

## Consequences for work in flight

- The schema design and repository *semantics* are settled and should not change.
  Specs 002 and 003 through 007 can be written against the current interfaces.
- No further SQLite-specific SQL should be introduced. `research.md` Q3 already
  rejected a query builder for exactly this reason; the same reasoning now also
  argues against dialect tricks.
- The 36 account-scoping tests must be re-run against Postgres at cutover. A test
  that passes on SQLite and not on Postgres means the isolation guarantee was
  weaker than believed.
- Until then, the SQLite layer is the dev and test store, and `data/` and
  `.data/` are both gitignored so neither database file is committed.
