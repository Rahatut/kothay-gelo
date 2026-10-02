-- Identity. Constitution principle III requires dataset-scoped authorization,
-- which needs a real boundary: an account that owns records and a session that
-- is revocable server-side.

CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE', 'DELETED'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT PRIMARY KEY,
  account_id          TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Only the SHA-256 of the raw token is stored. A database leak must not yield
  -- usable session credentials.
  token_hash          TEXT NOT NULL UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL,
  last_seen_at        TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_account_id ON sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);