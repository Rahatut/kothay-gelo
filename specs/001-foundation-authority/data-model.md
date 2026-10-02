# Data Model — spec 001 foundation-authority

**Created**: 2026-10-01 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Store**: libSQL / Turso, SQLite dialect. Migrations own schema only. Demo
seeding is separate and idempotent.

**Two invariants are enforced by the schema, not by convention:**

1. `account_id NOT NULL` on every financial table — a figure cannot exist
   without an owner (Principle III).
2. `evidence.transaction_id NOT NULL` — a transaction cannot exist without
   provenance (Principle VI).

---

## Entity: Account

An authenticated identity. Holds no financial content of its own.

| Field | Type | Rules |
|---|---|---|
| `id` | TEXT PK | `acct_<uuid>` |
| `email` | TEXT | UNIQUE NOT NULL, stored lowercased and trimmed |
| `password_hash` | TEXT NOT NULL | `scrypt$N$r$p$salt_b64$key_b64` |
| `created_at` | TEXT NOT NULL | ISO 8601 |
| `updated_at` | TEXT NOT NULL | ISO 8601 |
| `status` | TEXT NOT NULL | `ACTIVE` \| `DELETED` |

**Validation**: email must match a conservative pattern and be ≤254 characters.
Password minimum 10 characters; maximum 200 bytes, enforced at the byte level
before hashing to bound `scrypt` cost. No password complexity rules — length is
what matters.

**State transitions**: `ACTIVE` → `DELETED` on delete-account. Deletion is
soft in the first pass so audit events referencing the account stay valid; a
hard-delete purge is deferred and named as a follow-up rather than silently
omitted.

## Entity: Session

A credential bound to one account. Opaque, not a token that encodes claims.

| Field | Type | Rules |
|---|---|---|
| `id` | TEXT PK | `sess_<uuid>` |
| `account_id` | TEXT NOT NULL | FK → `accounts.id`, indexed, `ON DELETE CASCADE` |
| `token_hash` | TEXT NOT NULL | SHA-256 hex of the raw token, UNIQUE, indexed |
| `created_at` | TEXT NOT NULL | |
| `last_seen_at` | TEXT NOT NULL | drives idle expiry |
| `absolute_expires_at` | TEXT NOT NULL | |
| `revoked_at` | TEXT NULL | set on sign-out or delete-account |

**Validation**: the raw token is 32 bytes from `crypto.randomBytes`, base64url
encoded, and is never stored. Only its hash is persisted, so a database leak does
not yield usable session credentials. Cookie flags are `httpOnly`, `secure`,
`sameSite=lax`, `path=/`, no `domain`.

**State transitions**: live → revoked on sign-out. Expired sessions are treated
as absent rather than deleted, so a sweep can clean them up.

## Entity: SourceDocument

An uploaded statement. Carries a source discriminator from day one, because
decision D4-B admits multiple providers and retrofitting one later is expensive.

| Field | Type | Rules |
|---|---|---|
| `id` | TEXT PK | `doc_<uuid>` |
| `account_id` | TEXT NOT NULL | indexed |
| `source_kind` | TEXT NOT NULL | `MOBILE_WALLET` \| `BANK_STATEMENT` \| `DELIMITED` |
| `provider` | TEXT NULL | normalised name, null when unrecognised |
| `original_filename` | TEXT NOT NULL | display only, never trusted for validation |
| `detected_mime` | TEXT NOT NULL | determined by content sniffing, not by client |
| `byte_size` | INTEGER NOT NULL | bounded at the route boundary |
| `content_fingerprint` | TEXT NOT NULL | SHA-256 of bytes, for duplicate detection |
| `period_start` | TEXT NULL | `YYYY-MM-DD`, only when determinable |
| `period_end` | TEXT NULL | `YYYY-MM-DD` |
| `row_count` | INTEGER NULL | null when parsing failed, never defaulted |
| `stage` | TEXT NOT NULL | mirrors the processing pipeline stage |
| `created_at` | TEXT NOT NULL | |

**Validation**: `source_kind` MUST be derived from observed content, never from
the filename extension or a browser-supplied MIME type. An unrecognised layout
yields `provider = null` rather than a guess. `row_count` is null on failure —
the current `?? 12` fallback is deleted outright, not relocated.

## Entity: TransactionCandidate

An extracted row that has not yet been accepted into the ledger. This split
exists because Principle I forbids a model-supplied amount from becoming an
authoritative figure.

| Field | Type | Rules |
|---|---|---|
| `id` | TEXT PK | `txn_<uuid>` — UUID, never a timestamp |
| `account_id` | TEXT NOT NULL | indexed |
| `document_id` | TEXT NULL | FK, null for hand-entered rows |
| `transaction_date` | TEXT NOT NULL | `YYYY-MM-DD` |
| `amount` | REAL NOT NULL | BDT, always positive; sign lives in `direction` |
| `direction` | TEXT NOT NULL | `EXPENSE` \| `INCOME` \| `TRANSFER` \| `REFUND` \| `UNKNOWN` |
| `merchant_name` | TEXT NOT NULL | may be empty when not determinable |
| `raw_text_snippet` | TEXT NOT NULL | verbatim source line |
| `category_id` | TEXT NULL | FK, null when uncategorised |
| `confidence` | REAL NULL | **null when not determinable — never defaulted** |
| `extraction_method` | TEXT NOT NULL | `MODEL` \| `DETERMINISTIC` \| `MANUAL` |
| `verification_status` | TEXT NOT NULL | `UNVERIFIED` \| `VERIFIED` \| `USER_EDITED` \| `REJECTED` |
| `created_at` | TEXT NOT NULL | |

**Validation**: `amount > 0`; a negative amount is expressed via `direction`.
Future dates are refused. `confidence` is null rather than 0.9 when the extractor
omits it — the current `Number(p.confidence) || 0.9` fabrication is deleted. A
`MODEL`-extracted row MUST be `UNVERIFIED` and MUST NOT contribute to a
headline total without passing through the engine's verification or the user's
confirmation.

**Provenance rule**: `extraction_method = MANUAL` implies
`document_id IS NULL` and `confidence IS NULL`. A hand-entered row displays its
provenance, never an extraction confidence.

**Identifier rule**: UUID-based, because the current `Date.now()` scheme collides
within a single millisecond when a statement yields many rows.

## Entity: Evidence

Provenance for a transaction. The schema makes it mandatory.

| Field | Type | Rules |
|---|---|---|
| `id` | TEXT PK | `evd_<uuid>` |
| `transaction_id` | TEXT NOT NULL | FK, indexed, mandatory |
| `document_id` | TEXT NOT NULL | FK |
| `evidence_type` | TEXT NOT NULL | `RAW_TEXT` \| `BOUNDING_BOX` \| `MODEL_TRACE` |
| `raw_text_snippet` | TEXT NOT NULL | verbatim, select-all in the view |
| `page_number` | INTEGER NULL | null when not determinable |
| `bbox_x` | REAL NULL | null when not determinable |
| `bbox_y` | REAL NULL | |
| `bbox_width` | REAL NULL | |
| `bbox_height` | REAL NULL | |
| `coordinate_space` | TEXT NULL | records the origin and units |
| `created_at` | TEXT NOT NULL | |

**Validation**: all four coordinate fields are either all present or all null.
Fabricated coordinates are prohibited — where a location cannot be determined,
every coordinate is null and the view states the location is unknown.
PDF.js reports bottom-left origin in PDF units, so `coordinate_space` records
that explicitly and the view applies the Y flip. Getting this wrong silently
mirrors every evidence highlight.

## Entity: Category

The Bangladesh spending taxonomy. Static reference data.

| Field | Type | Rules |
|---|---|---|
| `id` | TEXT PK | `cat_<slug>` |
| `name` | TEXT NOT NULL | English |
| `name_bn` | TEXT NULL | Bengali, required for parity before release |
| `parent_id` | TEXT NULL | self-reference |
| `active` | INTEGER NOT NULL | boolean |

Seeded by migration, not by demo seed — it is reference data, not demo content.

## Entity: Insight

A detected pattern. Must cite the transactions that produced it.

| Field | Type | Rules |
|---|---|---|
| `id` | TEXT PK | |
| `account_id` | TEXT NOT NULL | indexed |
| `type` | TEXT NOT NULL | `CATEGORY_SHIFT` \| `MICRO_SPEND` \| `MERCHANT_FREQUENCY` \| `PERIOD_COMPARISON` \| `RECURRING` |
| `title` | TEXT NOT NULL | |
| `title_bn` | TEXT NULL | parity required |
| `description` | TEXT NOT NULL | |
| `description_bn` | TEXT NULL | |
| `confidence` | REAL NOT NULL | engine-computed |
| `calculation_version` | TEXT NOT NULL | so a stored figure stays interpretable |
| `supporting_transaction_ids` | TEXT NOT NULL | JSON array, **non-empty enforced in code** |
| `period_start` | TEXT NOT NULL | real dates, never hardcoded literals |
| `period_end` | TEXT NOT NULL | |
| `created_at` | TEXT NOT NULL | |

**Validation**: an insight with an empty supporting set is not persisted as a
finding and is not displayed. The current PERIOD_COMPARISON defect, where the
supporting set is every expense in the month rather than the movers, is corrected
here because an over-broad evidence set makes drill-down meaningless.

## Entity: Recommendation

A saving suggestion. The shape already exists in `src/types.ts` and is retained.

| Field | Type | Rules |
|---|---|---|
| `id` | TEXT PK | |
| `account_id` | TEXT NOT NULL | indexed |
| `insight_id` | TEXT NOT NULL | FK |
| `action_type` | TEXT NOT NULL | `REDUCE_FREQUENCY` \| `SWITCH_VENDOR` \| `CANCEL_SUBSCRIPTION` \| `BUDGET_CAP` |
| `title` | TEXT NOT NULL | |
| `description` | TEXT NOT NULL | |
| `potential_savings_min` | REAL NOT NULL | per-recommendation only |
| `potential_savings_max` | REAL NOT NULL | **never summed across rows into one claim** |
| `calculation_method` | TEXT NOT NULL | named, versioned |
| `calculation_version` | TEXT NOT NULL | |
| `supporting_transaction_ids` | TEXT NOT NULL | non-empty |
| `created_at` | TEXT NOT NULL | |

**Validation**: `min ≤ max`, and both MUST be reproducible from the cited
transactions via the stated method. Bounds are additive only when the
recommendations are non-overlapping; otherwise the overlap is stated. The
current practice of summing every `min` against every `max` is deleted.

## Entity: Goal

A user savings target.

| Field | Type | Rules |
|---|---|---|
| `id` | TEXT PK | |
| `account_id` | TEXT NOT NULL | indexed |
| `title` | TEXT NOT NULL | user supplied, no hardcoded default |
| `target_amount` | REAL NOT NULL | `> 0` — a zero target yields a division by zero today |
| `current_amount` | REAL NOT NULL | `≥ 0` |
| `target_date` | TEXT NOT NULL | real date; the hardcoded `2027-03-31` default is removed |
| `created_at` | TEXT NOT NULL | |

## Entity: AuditEvent

An immutable record of access, mutation, and refusal. Never contains financial
content.

| Field | Type | Rules |
|---|---|---|
| `id` | TEXT PK | |
| `account_id` | TEXT NULL | null for pre-authentication events |
| `action` | TEXT NOT NULL | `SIGNED_UP` \| `SIGNED_IN` \| `SIGNED_OUT` \| `READ` \| `MUTATED` \| `OWNERSHIP_REFUSED` \| `EXPORTED` \| `DELETED` |
| `resource_type` | TEXT NOT NULL | |
| `resource_id` | TEXT NULL | |
| `occurred_at` | TEXT NOT NULL | |

**Validation**: MUST NOT store amounts, merchant names, or statement text.
`OWNERSHIP_REFUSED` is written when the guard rejects a cross-account access, so
adversarial probing is visible. Retention is currently capped and the oldest rows
drop; a duration-based policy replaces the row cap, and its duration is a named
open item rather than an unstated default.

## Relationships

```text
accounts 1───* sessions
accounts 1───* source_documents
accounts 1───* transaction_candidates
accounts 1───* insights  ───* recommendations
accounts 1───* goals
accounts 1───* audit_events
source_documents 1───* transaction_candidates
source_documents 1───* evidence
transaction_candidates 1───* evidence      (mandatory provenance)
insights 1───* recommendations
categories 1───* transaction_candidates
```

Every financial table carries `account_id` and indexes it. Every list query is
scoped by `account_id` before any other predicate.

## Query-time invariants

Enforced by the capability layer in `server/capabilities/guard.ts`, not by each
route remembering to do it:

1. Identity resolves from the session only.
2. Every query carries `account_id = resolved_account_id`.
3. A record absent from the account's scope is reported exactly as a record that
   does not exist — same status, same body shape — so ownership cannot be probed.
4. Parameters are validated before the query runs, never coerced.
5. Every capability returns figures from `financialEngine.ts` only, or raw rows
   the view displays verbatim without computing from them.

## Migration and seed split

```text
server/db/migrations/
├── 001_reference_data.sql      # categories only
├── 002_accounts_sessions.sql
├── 003_documents.sql
├── 004_transactions_evidence.sql
├── 005_insights_recommendations.sql
├── 006_goals_audit.sql
└── 007_provenance_indexes.sql
```

Migrations run unconditionally at boot and are tracked in `PRAGMA user_version`.
Every migration body is written so that re-execution is safe.

`server/db/seed.ts` owns all demo content, is idempotent via
`ON CONFLICT DO NOTHING` on fixed identifiers, and runs only when `DEMO_SEED=1`
or when `/v1/dataset/load-golden` is called. The current behaviour of seeding the
golden dataset during database construction, so every fresh start appears to have
24 real transactions belonging to the user, is deleted. Demo rows must be
visibly labelled as sample data wherever they are displayed.
