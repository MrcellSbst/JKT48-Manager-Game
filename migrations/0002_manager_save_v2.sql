-- Sectioned encrypted save format. Legacy jkt48_manager_data is retained while
-- individual rows are migrated and verified, then their legacy payload is deleted.
CREATE TABLE IF NOT EXISTS jkt48_manager_data_v2 (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  manifest TEXT NOT NULL,
  core TEXT NOT NULL,
  roster TEXT NOT NULL,
  operations TEXT NOT NULL,
  history TEXT NOT NULL,
  profile TEXT NOT NULL,
  format_version INTEGER NOT NULL DEFAULT 2,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES user_h(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jkt48_manager_data_v2_updated_at
  ON jkt48_manager_data_v2(updated_at);

CREATE INDEX IF NOT EXISTS idx_jkt48_manager_data_v2_revision
  ON jkt48_manager_data_v2(revision);
