-- Deploy the v2-only application before applying this migration.
-- Unmigrated legacy cloud saves are intentionally discarded.
DROP TABLE IF EXISTS jkt48_manager_data;
