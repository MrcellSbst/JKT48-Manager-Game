-- Requires existing user_h and sessions tables from Tierlist-JKT48.
CREATE TABLE IF NOT EXISTS jkt48_manager_data (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  save_data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES user_h(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jkt48_manager_data_updated_at
  ON jkt48_manager_data(updated_at);
