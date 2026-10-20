import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as migrateCloudSave } from '../functions/api/save/migrate.js';
import { onRequestGet as getAdminSaveMigration, onRequestPost as postAdminSaveMigration } from '../functions/api/admin/save-migration/index.js';

const schemaSql = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
const v2MigrationSql = await readFile(new URL('../migrations/0002_manager_save_v2.sql', import.meta.url), 'utf8');
const dropLegacyMigrationSql = await readFile(new URL('../migrations/0003_drop_legacy_manager_data.sql', import.meta.url), 'utf8');
const RETIRED_SAVE_TABLE = /\bjkt48_manager_data\b/;

function createSharedTables() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE user_h (user_id TEXT PRIMARY KEY, username TEXT NOT NULL);
    CREATE TABLE sessions (
      session_token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user_h(user_id) ON DELETE CASCADE
    );
  `);
  return sqlite;
}

function tableExists(sqlite, name) {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function createEndpointDb() {
  const sqlite = createSharedTables();
  sqlite.exec(v2MigrationSql);
  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
  const insertUser = sqlite.prepare('INSERT INTO user_h (user_id, username) VALUES (?, ?)');
  insertUser.run('1', 'admin');
  insertUser.run('user-48', 'manager');
  const insertSession = sqlite.prepare('INSERT INTO sessions (session_token, user_id, expires_at) VALUES (?, ?, ?)');
  insertSession.run('admin-token', '1', expiresAt);
  insertSession.run('valid-token', 'user-48', expiresAt);

  const calls = [];
  const DB = {
    prepare(sql) {
      assert.equal(RETIRED_SAVE_TABLE.test(sql), false, `Retired save table queried: ${sql}`);
      const call = { sql, values: [] };
      calls.push(call);
      return {
        bind(...values) {
          call.values = values;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...call.values) ?? null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...call.values) };
        },
        async run() {
          const result = sqlite.prepare(sql).run(...call.values);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
  return { DB, sqlite, calls };
}

function request(path, { method = 'GET', token = null, body = undefined } = {}) {
  const headers = {};
  if (token) headers.Cookie = `session_token=${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(`https://manager.example${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function json(response) {
  return response.json();
}

test('save migration endpoint returns 401 when signed out and 410 after authentication', async () => {
  const db = createEndpointDb();
  const signedOut = await migrateCloudSave({ request: request('/api/save/migrate', { method: 'POST' }), env: { DB: db.DB } });
  assert.equal(signedOut.status, 401);

  const authenticated = await migrateCloudSave({ request: request('/api/save/migrate', { method: 'POST', token: 'valid-token', body: {} }), env: { DB: db.DB } });
  assert.equal(authenticated.status, 410);
  assert.equal((await json(authenticated)).code, 'legacy_migration_retired');
  assert.equal(db.calls.some(({ sql }) => RETIRED_SAVE_TABLE.test(sql)), false);
});

test('admin save migration GET and POST require an admin before returning the retired response', async () => {
  const db = createEndpointDb();
  const cases = [
    { method: 'GET', handler: getAdminSaveMigration, body: undefined },
    { method: 'POST', handler: postAdminSaveMigration, body: {} },
  ];

  for (const { method, handler, body } of cases) {
    const signedOut = await handler({ request: request('/api/admin/save-migration', { method, body }), env: { DB: db.DB } });
    assert.equal(signedOut.status, 401, `${method} must require a session`);

    const regularUser = await handler({ request: request('/api/admin/save-migration', { method, token: 'valid-token', body }), env: { DB: db.DB } });
    assert.equal(regularUser.status, 403, `${method} must reject non-admin users`);

    const admin = await handler({ request: request('/api/admin/save-migration', { method, token: 'admin-token', body }), env: { DB: db.DB } });
    assert.equal(admin.status, 410, `${method} must report that migration is retired after admin auth`);
    assert.equal((await json(admin)).code, 'legacy_migration_retired');
  }
  assert.equal(db.calls.some(({ sql }) => RETIRED_SAVE_TABLE.test(sql)), false);
});

test('0003 removes only the old save table and can run more than once', () => {
  const sqlite = createSharedTables();
  const expiresAt = '2099-01-01T00:00:00.000Z';
  sqlite.prepare('INSERT INTO user_h (user_id, username) VALUES (?, ?)').run('1', 'admin');
  sqlite.prepare('INSERT INTO user_h (user_id, username) VALUES (?, ?)').run('user-48', 'manager');
  sqlite.prepare('INSERT INTO sessions (session_token, user_id, expires_at) VALUES (?, ?, ?)').run('admin-token', '1', expiresAt);
  sqlite.exec(`CREATE TABLE jkt48_manager_data (
    user_id TEXT PRIMARY KEY, username TEXT NOT NULL, save_data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES user_h(user_id) ON DELETE CASCADE
  );`);
  sqlite.prepare('INSERT INTO jkt48_manager_data (user_id, username, save_data) VALUES (?, ?, ?)').run('user-48', 'manager', 'legacy-copy');
  sqlite.exec(schemaSql);

  sqlite.prepare(`INSERT INTO jkt48_manager_data_v2
    (user_id, username, manifest, core, roster, operations, history, profile, format_version, revision, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('user-48', 'manager', '{"version":2}', 'core', 'roster', 'operations', 'history', 'profile', 2, 9, '2026-08-20 12:00:00');
  sqlite.prepare(`INSERT INTO vouchers
    (voucher_id, code, name, total_points, max_increase_per_stat, max_increase_per_member, allowed_stats, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('voucher-1', 'KEEP-ME', 'Existing voucher', 10, 5, 10, '["vocal"]', '1');
  sqlite.prepare(`INSERT INTO voucher_redemptions (redemption_id, voucher_id, user_id, points_total)
    VALUES (?, ?, ?, ?)`)
    .run('redemption-1', 'voucher-1', 'user-48', 10);
  sqlite.prepare(`INSERT INTO voucher_edit_log
    (edit_id, redemption_id, voucher_id, user_id, member_id, stat, base_value_at_edit,
     voucher_adjustment_before, voucher_adjustment_after, display_value_before,
     display_value_after, delta, points_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('edit-1', 'redemption-1', 'voucher-1', 'user-48', 'member-1', 'vocal', 50, 0, 2, 50, 52, 2, 2);
  sqlite.prepare(`INSERT INTO admin_voucher_audit_log (audit_id, admin_user_id, action, voucher_id, redemption_id)
    VALUES (?, ?, ?, ?, ?)`)
    .run('audit-1', '1', 'seed', 'voucher-1', 'redemption-1');

  sqlite.exec(dropLegacyMigrationSql);
  sqlite.exec(dropLegacyMigrationSql);

  assert.equal(tableExists(sqlite, 'jkt48_manager_data'), false);
  assert.equal(sqlite.prepare('SELECT revision FROM jkt48_manager_data_v2 WHERE user_id = ?').get('user-48').revision, 9);
  assert.equal(sqlite.prepare('SELECT username FROM user_h WHERE user_id = ?').get('user-48').username, 'manager');
  assert.equal(sqlite.prepare('SELECT user_id FROM sessions WHERE session_token = ?').get('admin-token').user_id, '1');
  for (const table of ['vouchers', 'voucher_redemptions', 'voucher_edit_log', 'admin_voucher_audit_log']) {
    assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 1, `${table} rows should survive`);
  }
});

test('fresh schema creates v2 and shared tables without the retired save table', () => {
  const sqlite = createSharedTables();
  sqlite.exec(schemaSql);

  assert.equal(tableExists(sqlite, 'jkt48_manager_data'), false);
  for (const table of ['jkt48_manager_data_v2', 'user_h', 'sessions', 'vouchers', 'voucher_redemptions', 'voucher_edit_log', 'admin_voucher_audit_log']) {
    assert.equal(tableExists(sqlite, table), true, `${table} should be present`);
  }
});
