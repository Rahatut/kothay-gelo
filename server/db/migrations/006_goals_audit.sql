-- Savings targets and the audit trail.
--
-- goal target_amount carries a CHECK for the same reason the interface does not:
-- a zero target makes a percentage a division by zero.

CREATE TABLE IF NOT EXISTS goals (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  target_amount   REAL NOT NULL CHECK (target_amount > 0),
  current_amount  REAL NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  -- No default date. The previous fallback wrote a hardcoded future date onto
  -- every goal the user created.
  target_date     TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

-- An audit event records that something happened, never what it contained.
-- Amounts, merchant names, and statement text are prohibited here.
CREATE TABLE IF NOT EXISTS audit_events (
  id            TEXT PRIMARY KEY,
  account_id    TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  action        TEXT NOT NULL
                  CHECK (action IN ('SIGNED_UP','SIGNED_IN','SIGNED_OUT','READ','MUTATED',
                                    'OWNERSHIP_REFUSED','EXPORTED','DELETED')),
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  occurred_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goals_account_id ON goals(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_account_id ON audit_events(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at ON audit_events(occurred_at);
