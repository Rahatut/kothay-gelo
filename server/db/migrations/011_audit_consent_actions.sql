-- Widen the audit action set to include consent decisions.
--
-- `audit_events.action` has a CHECK that had no CONSENT_ACCEPTED or
-- CONSENT_REVOKED, and the TypeScript union matched it, so a consent decision could
-- not be recorded in the durable trail at all. `POST /v1/settings/consents` therefore
-- logged to `db.logAudit`, an in-memory log that `/v1/settings/audit` does not read,
-- so a user asking "prove I agreed to this" was shown a trail with nothing in it.
--
-- Migration 006 is not edited to widen it. `user_version` has already stamped 006 on
-- every existing database, so changing the file would apply the new CHECK only to
-- fresh databases and leave deployed ones unable to record a consent. A migration that
-- behaves differently depending on when it was created is worse than no migration.
--
-- SQLite cannot alter a CHECK, so the table is rebuilt. It is a child of `accounts`
-- and nothing references it, so dropping it cannot orphan another table. Every row is
-- copied across, so the existing trail is preserved.
--
-- Plain SQL only — CREATE, INSERT ... SELECT, DROP, RENAME — because AGENTS.md
-- forbids introducing SQLite-specific SQL into new migrations while Postgres is the
-- target.

CREATE TABLE IF NOT EXISTS audit_events_rebuilt (
  id            TEXT PRIMARY KEY,
  account_id    TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  action        TEXT NOT NULL
                CHECK (action IN ('SIGNED_UP','SIGNED_IN','SIGNED_OUT','READ','MUTATED',
                                  'OWNERSHIP_REFUSED','EXPORTED','DELETED',
                                  'CONSENT_ACCEPTED','CONSENT_REVOKED')),
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  occurred_at   TEXT NOT NULL
);

INSERT INTO audit_events_rebuilt
  (id, account_id, action, resource_type, resource_id, occurred_at)
SELECT id, account_id, action, resource_type, resource_id, occurred_at FROM audit_events;

DROP TABLE audit_events;

ALTER TABLE audit_events_rebuilt RENAME TO audit_events;

-- Dropped with the old table and recreated here.
CREATE INDEX IF NOT EXISTS idx_audit_events_account_id ON audit_events(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at ON audit_events(occurred_at);