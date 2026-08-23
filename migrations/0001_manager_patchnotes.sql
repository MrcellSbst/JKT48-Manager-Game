CREATE TABLE IF NOT EXISTS manager_patchnotes (
  patchnote_id TEXT PRIMARY KEY,
  version_label TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL,
  title_id TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL,
  body_id TEXT NOT NULL DEFAULT '',
  lifecycle_status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES user_h(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES user_h(user_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_manager_patchnotes_publication
  ON manager_patchnotes(lifecycle_status, published_at DESC);
