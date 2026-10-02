-- Correction history for ledger rows.
--
-- FR-010: a correction must record the value it replaced. Without this table the
-- previous amount, date, or category is overwritten in place and the row's history
-- is unrecoverable — a user who fixes a mistyped date has no way to see what the
-- system previously believed, which is the whole basis of the evidence chain.
--
-- One row per changed field, not one per edit: a three-field patch records three
-- changes, so the row and the trail can never disagree about what changed.

CREATE TABLE IF NOT EXISTS transaction_corrections (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL
                    REFERENCES transaction_candidates(id) ON DELETE CASCADE,
  -- Denormalised so history stays readable after the row moves between accounts' views
  -- and so a query for "what did this user change" never has to join through a row
  -- that may itself be gone.
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  field           TEXT NOT NULL
                    CHECK (field IN ('transaction_date','amount','direction',
                                     'description','merchant_name','category_id')),
  -- One text column for every field type. A BDT amount, an ISO date, and an enum id
  -- are all stored as the string they were, because this record is read by no total:
  -- a decimal representation here could never contaminate a figure.
  previous_value  TEXT NOT NULL,
  current_value   TEXT NOT NULL,
  kind            TEXT NOT NULL
                    CHECK (kind IN ('USER_CORRECTION','USER_CATEGORY_CORRECTION','USER_DELETION')),
  corrected_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transaction_corrections_account
  ON transaction_corrections(account_id, corrected_at DESC);

CREATE INDEX IF NOT EXISTS idx_transaction_corrections_transaction
  ON transaction_corrections(transaction_id, corrected_at DESC);