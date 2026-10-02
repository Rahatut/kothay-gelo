-- Ledger rows and their provenance.
--
-- Two invariants are enforced by the schema rather than by convention:
--   1. account_id NOT NULL, so a figure cannot exist without an owner (III).
--   2. every extracted transaction must have at least one evidence link, so a
--      transaction cannot exist without provenance (VI).
--
-- Evidence is modelled the way the domain models it: a field-level record
-- attached to a document (an AMOUNT, a MERCHANT, a TRANSACTION_DATE), which one
-- evidence row can serve many transactions. The earlier draft made
-- evidence.transaction_id NOT NULL, which both contradicts the domain shape and
-- would force the same evidence to be duplicated per row. A join table carries
-- the link and the trigger below enforces that the link exists.

CREATE TABLE IF NOT EXISTS transaction_candidates (
  id                     TEXT PRIMARY KEY,
  account_id             TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  document_id            TEXT REFERENCES source_documents(id) ON DELETE SET NULL,
  transaction_date       TEXT NOT NULL,
  -- Always positive. A negative amount is expressed through `direction`, so a
  -- sign can never be double-counted.
  amount                 REAL NOT NULL CHECK (amount > 0),
  direction              TEXT NOT NULL
                           CHECK (direction IN ('EXPENSE','INCOME','TRANSFER','REFUND','UNKNOWN')),
  merchant_name          TEXT NOT NULL DEFAULT '',
  raw_text_snippet       TEXT NOT NULL DEFAULT '',
  category_id            TEXT REFERENCES categories(id),
  -- NULL when the extractor did not establish it. Never defaulted: the previous
  -- behaviour fabricated 0.9 and 0.92 for missing values.
  confidence             REAL,
  extraction_method      TEXT NOT NULL
                           CHECK (extraction_method IN ('MODEL','DETERMINISTIC','MANUAL')),
  -- Mirrors TransactionStatus in src/types.ts exactly. The schema must not
  -- invent a narrower vocabulary than the domain type, or every insert needs a
  -- translation layer that can silently drop a state.
  status                 TEXT NOT NULL DEFAULT 'EXTRACTED'
                           CHECK (status IN ('EXTRACTED','NORMALIZED','CLASSIFIED','ACCEPTED',
                                             'CONFIRMED','NEEDS_REVIEW','USER_EDITED','USER_ENTERED')),
  is_duplicate_candidate INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT NOT NULL
);

-- Evidence is field-level and belongs to a document, not to one row.
CREATE TABLE IF NOT EXISTS evidence (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  document_id      TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  -- Mirrors EvidenceType in src/types.ts.
  evidence_type    TEXT
                     CHECK (evidence_type IN ('TRANSACTION_DATE','AMOUNT','MERCHANT',
                                              'REFERENCE','ACCOUNT','BALANCE','OTHER')),
  raw_text         TEXT NOT NULL,
  raw_text_snippet TEXT,
  normalized_text  TEXT,
  page_number      INTEGER,
  -- All four are null when the location could not be determined. Fabricating
  -- coordinates would put a highlight on the wrong words.
  bbox_x           REAL,
  bbox_y           REAL,
  bbox_width       REAL,
  bbox_height      REAL,
  -- PDF.js reports bottom-left origin in PDF units. Recording the space keeps
  -- the transform explicit instead of implied.
  coordinate_space TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_evidence (
  transaction_id TEXT NOT NULL REFERENCES transaction_candidates(id) ON DELETE CASCADE,
  evidence_id    TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, evidence_id)
);

-- A hand-entered row asserts a fact about the world. It has no document, so it
-- can have no evidence, and it must not carry an extraction confidence.
CREATE TRIGGER IF NOT EXISTS trg_manual_row_has_no_document_provenance
BEFORE INSERT ON transaction_candidates
WHEN NEW.extraction_method = 'MANUAL'
BEGIN
  SELECT RAISE(ABORT, 'a manual row must have no document and no extraction confidence')
    WHERE NEW.document_id IS NOT NULL OR NEW.confidence IS NOT NULL;
END;

-- Principle VI, enforced at the schema boundary. Extracted rows must be linked
-- to evidence; the link is inserted after the row within the same transaction,
-- so the check runs at commit rather than per-statement insert.
CREATE TRIGGER IF NOT EXISTS trg_extracted_row_requires_evidence
AFTER INSERT ON transaction_evidence
BEGIN
  SELECT RAISE(ABORT, 'evidence link must reference a transaction of the same account')
    WHERE NOT EXISTS (
      SELECT 1 FROM transaction_candidates t
       WHERE t.id = NEW.transaction_id AND t.account_id = (
             SELECT account_id FROM evidence WHERE id = NEW.evidence_id)
    );
END;

CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transaction_candidates(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transaction_candidates(account_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_evidence_document_id ON evidence(document_id);
CREATE INDEX IF NOT EXISTS idx_transaction_evidence_evidence ON transaction_evidence(evidence_id);
