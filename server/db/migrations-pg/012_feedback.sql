-- Insight and recommendation feedback.
--
-- Feedback was written to `db.feedback`, an in-memory array, and read back for
-- exactly one thing: whether a recommendation has been marked `acted_on`, which the
-- recommendations list surfaces as `tracked`. So a user who marked a saving as acted
-- on was shown it untracked again after a restart, and every helpful/not-helpful
-- signal the evaluation path depends on was gone.
--
-- It also had to move for a mechanical reason: `POST /v1/insights/:id/feedback` and
-- `POST /v1/recommendations/:id/feedback` looked the target up in the in-memory maps.
-- Those maps are no longer where insights and recommendations live, so both routes
-- would have answered 404 for ids that exist in the relational store.
--
-- The CHECKs mirror the two unions in the routes. A feedback_type the product does
-- not recognise is rejected by the database rather than becoming a row the evaluation
-- query has to defend against.

CREATE TABLE IF NOT EXISTS feedback (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  object_type   TEXT NOT NULL
                  CHECK (object_type IN ('Insight','Recommendation')),
  object_id     TEXT NOT NULL,
  feedback_type TEXT NOT NULL
                  CHECK (feedback_type IN ('helpful','not_helpful','acted_on')),
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_object ON feedback(account_id, object_type, object_id);