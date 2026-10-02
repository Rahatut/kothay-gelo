-- Consent records.
--
-- These lived only in `db.consents`, an in-memory Map, so a consent record — the
-- artefact that proves the user agreed to process their financial data — existed
-- for as long as the process and was gone after a restart. A consent that cannot
-- be evidenced is not a consent.
--
-- One row per consent type per account rather than an append-only history: the
-- current state is what the settings screen and the audit trail need. Accepting
-- after revoking updates the row in place, so the table answers "what has this
-- account agreed to right now" with one query and no aggregation.
--
-- The CHECK mirrors the union in `ConsentRecord`, so an unrecognised type is
-- rejected by the database rather than becoming a row nothing reads.
--
-- ip_hash is nullable because the request IP genuinely is sometimes unavailable: a
-- local request, or a proxy that strips it. Making it required is what forced the
-- old truncated literal 'sha256:d8a9f...', which looked like a digest and hashed
-- nothing. Absence is honest; a fabricated digest is not.

CREATE TABLE IF NOT EXISTS consents (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  consent_type    TEXT NOT NULL
                    CHECK (consent_type IN (
                      'PRIVACY_POLICY',
                      'FINANCIAL_DATA_PROCESSING',
                      'DOCUMENT_PROCESSING',
                      'OPTIONAL_ANALYTICS',
                      'OPTIONAL_AI_PROCESSING'
                    )),
  policy_version  TEXT NOT NULL,
  accepted_at     TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  ip_hash         TEXT,

  -- One current record per type. Enforced here as well as in the repository so a
  -- concurrent double-accept cannot leave two live rows for the same type.
  UNIQUE (account_id, consent_type)
);

CREATE INDEX IF NOT EXISTS idx_consents_account_id ON consents(account_id);