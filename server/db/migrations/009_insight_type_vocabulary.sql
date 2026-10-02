-- Align the insights type vocabulary with the financial engine.
--
-- The CHECK in 005 accepted CATEGORY_SHIFT, MICRO_SPEND, MERCHANT_FREQUENCY,
-- PERIOD_COMPARISON, RECURRING. The engine emits CATEGORY_CHANGE and
-- SMALL_PURCHASES. Two of the five names did not match, so no engine output could
-- be persisted, which is why `replaceInsights` was written and then never called:
-- the repository was correct and unreachable.
--
-- SQLite cannot alter a CHECK constraint, so the table is rebuilt. The rebuild is
-- written in plain SQL — CREATE, INSERT ... SELECT, DROP, RENAME — because
-- AGENTS.md forbids introducing SQLite-specific SQL into new migrations while
-- Postgres is the target.
--
-- `json_valid(supporting_transaction_ids)` from 005 is deliberately NOT restated.
-- It is SQLite-specific, and carrying it forward would spread a dialect detail
-- into a second file. The repository already refuses to store an insight with no
-- supporting rows (constitution principle VI), and the Postgres migration will
-- express the constraint natively. The column is still NOT NULL.
--
-- Rows in `recommendations` are removed before the old table is dropped. They
-- reference `insights(id)`, and every one of them is regenerated from the engine on
-- the next recompute, so keeping an orphaned set would be worse than an empty one.
-- Foreign key enforcement is ON (libSQL enables it by default), so this delete is
-- required: dropping `insights` while `recommendations` still references it fails.
-- The explicit delete is not relying on ON DELETE CASCADE.

DELETE FROM recommendations;

CREATE TABLE IF NOT EXISTS insights_rebuilt (
  id                        TEXT PRIMARY KEY,
  account_id                TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- The engine's vocabulary, unchanged. Widening the set rather than renaming
  -- leaves room for a detector to be added without another table rebuild.
  type                      TEXT NOT NULL
                              CHECK (type IN ('CATEGORY_CHANGE','SMALL_PURCHASES','MERCHANT_FREQUENCY','PERIOD_COMPARISON','RECURRING')),
  title                     TEXT NOT NULL,
  title_bn                  TEXT,
  description               TEXT NOT NULL,
  description_bn            TEXT,
  confidence                REAL NOT NULL,
  calculation_version       TEXT NOT NULL,
  supporting_transaction_ids TEXT NOT NULL,
  period_start              TEXT NOT NULL,
  period_end                TEXT NOT NULL,
  created_at                TEXT NOT NULL
);

-- Legacy rows are mapped onto the engine's names before they are copied. The old
-- CHECK accepted CATEGORY_SHIFT and MICRO_SPEND; copying one of those straight into
-- the widened CHECK aborts this migration, leaves `user_version` at 8, and stops the
-- server from booting. No deployed database is expected to hold one (replaceInsights
-- was never called), but a migration that fails closed on data it can translate is a
-- boot-blocker waiting for the first such row.
INSERT INTO insights_rebuilt
  (id, account_id, type, title, title_bn, description, description_bn, confidence,
   calculation_version, supporting_transaction_ids, period_start, period_end, created_at)
SELECT
  id, account_id,
  CASE type
    WHEN 'CATEGORY_SHIFT' THEN 'CATEGORY_CHANGE'
    WHEN 'MICRO_SPEND' THEN 'SMALL_PURCHASES'
    ELSE type
  END,
  title, title_bn, description, description_bn, confidence,
  calculation_version, supporting_transaction_ids, period_start, period_end, created_at
FROM insights;

DROP TABLE insights;

ALTER TABLE insights_rebuilt RENAME TO insights;

-- Dropped with the old table and recreated here.
CREATE INDEX IF NOT EXISTS idx_insights_account_id ON insights(account_id);
CREATE INDEX IF NOT EXISTS idx_insights_period ON insights(account_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(account_id, type);