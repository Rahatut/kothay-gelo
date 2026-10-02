-- Uploaded statements.
--
-- source_kind is a discriminator rather than a single provider column because
-- decision D4-B admits multiple statement sources. Retrofitting one later would
-- mean backfilling every existing row.
--
-- row_count is nullable and never defaulted: a failed extraction has no count,
-- and inventing one is the fabrication this schema exists to prevent.

CREATE TABLE IF NOT EXISTS source_documents (
  id                   TEXT PRIMARY KEY,
  account_id           TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source_kind          TEXT NOT NULL
                         CHECK (source_kind IN ('MOBILE_WALLET', 'BANK_STATEMENT', 'DELIMITED')),
  provider             TEXT,
  original_filename    TEXT NOT NULL,
  -- Determined by inspecting content. Never the browser-supplied type or the
  -- filename extension, both of which are attacker-controlled.
  detected_mime        TEXT NOT NULL,
  byte_size            INTEGER NOT NULL CHECK (byte_size >= 0),
  content_fingerprint  TEXT NOT NULL,
  period_start         TEXT,
  period_end           TEXT,
  row_count            INTEGER,
  stage                TEXT NOT NULL,
  is_sample_data       INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_documents_account_id ON source_documents(account_id);
