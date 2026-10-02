-- Processing jobs, persisted so status survives a restart.
--
-- `GET /v1/processing/:job_id` read `db.processingJobs`, an in-memory map written
-- only by the process that created the job and never reloaded on boot. A job that
-- had already finished still answered NOT_FOUND after a restart. The upload route
-- is polled through `/v1/uploads/:id/status` (which now reads the document row), but
-- the job route is part of the documented API surface and is exercised by the purge
-- suite, so it needs a durable backing too.
--
-- The row is a snapshot: the pipeline upserts it on every stage transition, and the
-- terminal rows carry `error_code`/`error_message`. Nothing derives a figure from it,
-- so there is no arithmetic to keep in sync with the engine.

CREATE TABLE IF NOT EXISTS processing_jobs (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  document_id        TEXT NOT NULL,
  status             TEXT NOT NULL,
  stage              TEXT NOT NULL,
  attempt            INTEGER NOT NULL DEFAULT 1,
  pipeline_version   TEXT NOT NULL,
  extracted_count    INTEGER NOT NULL DEFAULT 0,
  error_code         TEXT,
  error_message      TEXT,
  started_at         TEXT NOT NULL,
  completed_at       TEXT,
  created_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_account_id ON processing_jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_document_id ON processing_jobs(document_id);
