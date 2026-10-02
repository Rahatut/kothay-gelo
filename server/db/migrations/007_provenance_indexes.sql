-- Provenance and drill-down indexes.
--
-- Separated from the table definitions so a query planner can use them without
-- the table migrations being rewritten. Every index below backs a path the
-- product actually takes: evidence drill-down from an insight, the ledger by
-- account and date, and insight lookup per account and period.

CREATE INDEX IF NOT EXISTS idx_transactions_document_id ON transaction_candidates(document_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transaction_candidates(account_id, category_id);
CREATE INDEX IF NOT EXISTS idx_evidence_document_id ON evidence(document_id);
CREATE INDEX IF NOT EXISTS idx_insights_period ON insights(account_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(account_id, type);
CREATE INDEX IF NOT EXISTS idx_recommendations_insight_id ON recommendations(insight_id);
