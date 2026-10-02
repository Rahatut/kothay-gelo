-- Persist the engine's shown calculation on an insight.
--
-- The engine emits `math_formula` and `metric_value` alongside every insight. They
-- are the "claim → calculation → evidence" middle link: the narration path reads the
-- formula so the phrasing can state how a figure was reached, and the evidence chain
-- is incomplete without it. Neither column existed, so moving insights from the
-- in-memory map to the table dropped both.
--
-- Nullable, because not every insight type produces a formula. A null means the
-- engine did not state one, which is honest; an empty string would claim it did.
--
-- ALTER TABLE ... ADD COLUMN is the same statement in SQLite and Postgres.

ALTER TABLE insights ADD COLUMN math_formula TEXT;
ALTER TABLE insights ADD COLUMN metric_value TEXT;