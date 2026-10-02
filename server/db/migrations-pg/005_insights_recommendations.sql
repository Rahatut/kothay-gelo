-- Detected patterns and the savings suggestions derived from them.
--
-- calculation_version is mandatory so a stored figure stays interpretable after
-- the method changes. supporting_transaction_ids is mandatory because an insight
-- with no supporting rows is not a finding (constitution principle VI) — an
-- empty array is rejected at the repository layer.

CREATE TABLE IF NOT EXISTS insights (
  id                        TEXT PRIMARY KEY,
  account_id                TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type                      TEXT NOT NULL
                              CHECK (type IN ('CATEGORY_SHIFT','MICRO_SPEND','MERCHANT_FREQUENCY','PERIOD_COMPARISON','RECURRING')),
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

CREATE TABLE IF NOT EXISTS recommendations (
  id                        TEXT PRIMARY KEY,
  account_id                TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  insight_id                TEXT NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
  action_type               TEXT NOT NULL
                              CHECK (action_type IN ('REDUCE_FREQUENCY','SWITCH_VENDOR','CANCEL_SUBSCRIPTION','BUDGET_CAP')),
  title                     TEXT NOT NULL,
  title_bn                  TEXT,
  description               TEXT NOT NULL,
  description_bn            TEXT,
  -- Per-recommendation only. Summing every min against every max produces a
  -- range wider than any single lever supports.
  potential_savings_min     NUMERIC(14,2) NOT NULL CHECK (potential_savings_min >= 0),
  potential_savings_max     NUMERIC(14,2) NOT NULL CHECK (potential_savings_max >= potential_savings_min),
  calculation_method        TEXT NOT NULL,
  calculation_version       TEXT NOT NULL,
  supporting_transaction_ids JSONB NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_insights_account_id ON insights(account_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_account_id ON recommendations(account_id);