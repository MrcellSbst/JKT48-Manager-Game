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

-- Voucher system tables. Voucher ownership and edits are account-bound and
-- intentionally separate from the encrypted game save.
CREATE TABLE IF NOT EXISTS vouchers (
  voucher_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'member-stat-editor',
  total_points INTEGER NOT NULL,
  max_increase_per_stat INTEGER NOT NULL,
  max_increase_per_member INTEGER NOT NULL,
  allowed_stats TEXT NOT NULL,
  allow_decrease INTEGER NOT NULL DEFAULT 0,
  allow_multiple_members INTEGER NOT NULL DEFAULT 1,
  max_redemptions INTEGER,
  max_redemptions_per_user INTEGER,
  target_user_ids TEXT,
  lifecycle_status TEXT NOT NULL DEFAULT 'draft',
  valid_from TEXT,
  expires_at TEXT,
  created_by TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES user_h(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (revoked_by) REFERENCES user_h(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_vouchers_expires ON vouchers(expires_at);

CREATE TABLE IF NOT EXISTS voucher_redemptions (
  redemption_id TEXT PRIMARY KEY,
  voucher_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  points_total INTEGER NOT NULL,
  points_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  redeemed_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (voucher_id) REFERENCES vouchers(voucher_id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES user_h(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_voucher ON voucher_redemptions(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_user ON voucher_redemptions(user_id);

CREATE TABLE IF NOT EXISTS voucher_edit_log (
  edit_id TEXT PRIMARY KEY,
  redemption_id TEXT NOT NULL,
  voucher_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  stat TEXT NOT NULL,
  base_value_at_edit REAL NOT NULL,
  voucher_adjustment_before REAL NOT NULL,
  voucher_adjustment_after REAL NOT NULL,
  display_value_before REAL NOT NULL,
  display_value_after REAL NOT NULL,
  delta REAL NOT NULL,
  points_used REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (redemption_id) REFERENCES voucher_redemptions(redemption_id) ON DELETE RESTRICT,
  FOREIGN KEY (voucher_id) REFERENCES vouchers(voucher_id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES user_h(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_voucher_edit_log_redemption ON voucher_edit_log(redemption_id, created_at);
CREATE INDEX IF NOT EXISTS idx_voucher_edit_log_user ON voucher_edit_log(user_id, created_at);

CREATE TABLE IF NOT EXISTS admin_voucher_audit_log (
  audit_id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  voucher_id TEXT,
  redemption_id TEXT,
  before_snapshot TEXT,
  after_snapshot TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (admin_user_id) REFERENCES user_h(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (voucher_id) REFERENCES vouchers(voucher_id) ON DELETE SET NULL,
  FOREIGN KEY (redemption_id) REFERENCES voucher_redemptions(redemption_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_voucher_audit_created ON admin_voucher_audit_log(created_at);
