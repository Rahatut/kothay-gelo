-- Align the insights type vocabulary with the financial engine.
--
-- The CHECK in 005 accepted CATEGORY_SHIFT, MICRO_SPEND, MERCHANT_FREQUENCY,
-- PERIOD_COMPARISON, RECURRING. The engine emits CATEGORY_CHANGE and
-- SMALL_PURCHASES. Two of the five names did not match, so no engine output could
-- be persisted.
--
-- Postgres: rebuild table with corrected CHECK and JSONB column.

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
  confidence                NUMERIC(3,2) NOT NULL,
  calculation_version       TEXT NOT NULL,
  supporting_transaction_ids JSONB NOT NULL,
  period_start              DATE NOT NULL,
  period_end                DATE NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL
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

DROP TABLE insights CASCADE;

ALTER TABLE insights_rebuilt RENAME TO insights;

-- Recreate the foreign key on recommendations
ALTER TABLE recommendations ADD CONSTRAINT recommendations_insight_id_fkey
  FOREIGN KEY (insight_id) REFERENCES insights(id) ON DELETE CASCADE;

-- Dropped with the old table and recreated here.
CREATE INDEX IF NOT EXISTS idx_insights_account_id ON insights(account_id);
CREATE INDEX IF NOT EXISTS idx_insights_period ON insights(account_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(account_id, type);