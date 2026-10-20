import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { simpleDecrypt, simpleEncrypt } from '../src/utils/crypto.js';
import { hashPassword, verifyPassword } from '../functions/api/_session.js';
import { onRequestPost as pushCloudSave } from '../functions/api/save/push.js';
import { onRequestGet as loadCloudSave } from '../functions/api/save/load.js';
import { buildV2Payload, decodeV2Sections, reconstructSnapshot, snapshotsEquivalent } from '../functions/api/_saveFormat.js';
import { decodeSnapshot } from '../src/state/saveFormat.js';

const v2MigrationSql = await readFile(new URL('../migrations/0002_manager_save_v2.sql', import.meta.url), 'utf8');
const RETIRED_SAVE_TABLE = /\bjkt48_manager_data\b/;

function createDb(t, { failSql = null, afterBatch = null } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
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
  sqlite.exec(v2MigrationSql);
  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
  const addUser = sqlite.prepare('INSERT INTO user_h (user_id, username) VALUES (?, ?)');
  addUser.run('1', 'admin');
  addUser.run('user-48', 'manager');
  const addSession = sqlite.prepare('INSERT INTO sessions (session_token, user_id, expires_at) VALUES (?, ?, ?)');
  addSession.run('admin-token', '1', expiresAt);
  addSession.run('valid-token', 'user-48', expiresAt);

  const calls = [];
  const DB = {
    prepare(sql) {
      assert.equal(RETIRED_SAVE_TABLE.test(sql), false, `Retired save table queried: ${sql}`);
      const call = { sql, values: [] };
      calls.push(call);
      const failure = failSql?.(sql);
      if (failure) throw failure instanceof Error ? failure : new Error('Injected database failure.');
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
      await afterBatch?.(sqlite);
      return results;
    },
  };
  return { DB, sqlite, calls };
}

function snapshotWith(currency) {
  return {
    version: 1,
    savedAt: 123,
    metaProfile: { currency, runHistory: [] },
    activeRun: {
      slot: 1,
      state: { year: 2, week: 3, members: [{ id: 'm1', name: 'Test' }], schedule: {}, weeklyReports: [] },
    },
  };
}

async function seedV2Save(db, snapshot, revision = 1) {
  const payload = await buildV2Payload(snapshot, { slot: 1, updatedAt: 123, revision });
  db.sqlite.prepare(`INSERT INTO jkt48_manager_data_v2
    (user_id, username, manifest, core, roster, operations, history, profile, format_version, revision, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('user-48', 'manager', JSON.stringify(payload.manifest), payload.sections.core, payload.sections.roster,
      payload.sections.operations, payload.sections.history, payload.sections.profile, 2, revision, '2026-08-20 12:00:00');
  return payload;
}

function pushRequest(bodyText, token = 'valid-token') {
  return new Request('https://manager.example/api/save/push', {
    method: 'POST',
    headers: { Cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: bodyText,
  });
}

function loadRequest(format = null) {
  const suffix = format ? `?format=${format}` : '';
  return new Request(`https://manager.example/api/save/load${suffix}`, { headers: { Cookie: 'session_token=valid-token' } });
}

function assertNoRetiredSaveSql(db) {
  assert.equal(db.calls.some(({ sql }) => RETIRED_SAVE_TABLE.test(sql)), false);
}

test('current v2 client pushes and loads a sectioned cloud save', async (t) => {
  const db = createDb(t);
  const snapshot = snapshotWith(48);
  const payload = await buildV2Payload(snapshot, { slot: 1, updatedAt: 123 });
  const response = await pushCloudSave({
    request: pushRequest(JSON.stringify({ ...payload, expectedRevision: 0 })),
    env: { DB: db.DB },
  });

  assert.equal(response.status, 200);
  const stored = await response.json();
  assert.equal(stored.format, 2);
  assert.equal(stored.revision, 1);

  const loadedResponse = await loadCloudSave({ request: loadRequest('2'), env: { DB: db.DB } });
  assert.equal(loadedResponse.status, 200);
  const loaded = await loadedResponse.json();
  assert.equal(loaded.exists, true);
  assert.equal(loaded.format, 2);
  assert.equal(loaded.revision, 1);
  const decodedBrowserSave = await decodeSnapshot(loaded);
  assert.equal(snapshotsEquivalent(snapshot, decodedBrowserSave), true);
  assertNoRetiredSaveSql(db);
});

test('legacy client load reconstructs the old encrypted wire shape from v2 sections', async (t) => {
  const db = createDb(t);
  const snapshot = snapshotWith(24);
  await seedV2Save(db, snapshot, 5);

  const response = await loadCloudSave({ request: loadRequest(), env: { DB: db.DB } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.exists, true);
  assert.equal(typeof result.data.save_data, 'string');
  assert.equal(JSON.parse(simpleDecrypt(result.data.save_data)).metaProfile.currency, 24);
  assert.deepEqual(JSON.parse(simpleDecrypt(result.data.save_data)), snapshot);
  assert.equal(result.data.updated_at, '2026-08-20 12:00:00');
  assertNoRetiredSaveSql(db);
});

test('legacy encrypted blob push converts directly to v2, verifies readback, and increments the existing revision with or without an expected revision', async (t) => {
  const db = createDb(t);
  await seedV2Save(db, snapshotWith(1), 7);
  const legacySnapshot = snapshotWith(24);
  const response = await pushCloudSave({
    request: pushRequest(JSON.stringify({ save_data: simpleEncrypt(JSON.stringify(legacySnapshot)), expectedRevision: 7 })),
    env: { DB: db.DB },
  });

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.format, 2);
  assert.equal(result.revision, 8);
  assert.equal(result.verified, true);
  const stored = db.sqlite.prepare('SELECT manifest, core, roster, operations, history, profile, revision FROM jkt48_manager_data_v2 WHERE user_id = ?').get('user-48');
  assert.equal(stored.revision, 8);
  assert.equal(JSON.parse(stored.manifest).revision, 8);
  assert.equal(snapshotsEquivalent(legacySnapshot, reconstructSnapshot(await decodeV2Sections(stored))), true);

  const secondResponse = await pushCloudSave({
    request: pushRequest(JSON.stringify({ save_data: simpleEncrypt(JSON.stringify(snapshotWith(25))) })),
    env: { DB: db.DB },
  });
  assert.equal(secondResponse.status, 200);
  assert.equal((await secondResponse.json()).revision, 9);
  assert.equal(db.sqlite.prepare('SELECT revision FROM jkt48_manager_data_v2 WHERE user_id = ?').get('user-48').revision, 9);
  assertNoRetiredSaveSql(db);
});

test('v2 upload revision conflict keeps the current save', async (t) => {
  const db = createDb(t);
  const original = snapshotWith(7);
  await seedV2Save(db, original, 4);
  const incoming = await buildV2Payload(snapshotWith(8));
  const response = await pushCloudSave({
    request: pushRequest(JSON.stringify({ ...incoming, expectedRevision: 3 })),
    env: { DB: db.DB },
  });

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'save_conflict');
  assert.equal(db.sqlite.prepare('SELECT revision FROM jkt48_manager_data_v2 WHERE user_id = ?').get('user-48').revision, 4);
  assertNoRetiredSaveSql(db);
});

test('legacy blob upload also preserves v2 revision conflicts', async (t) => {
  const db = createDb(t);
  await seedV2Save(db, snapshotWith(7), 4);
  const response = await pushCloudSave({
    request: pushRequest(JSON.stringify({ save_data: simpleEncrypt(JSON.stringify(snapshotWith(8))), expectedRevision: 3 })),
    env: { DB: db.DB },
  });

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'save_conflict');
  assert.equal(db.sqlite.prepare('SELECT revision FROM jkt48_manager_data_v2 WHERE user_id = ?').get('user-48').revision, 4);
  assertNoRetiredSaveSql(db);
});

test('push rejects invalid JSON, null payloads, malformed encryption, and mismatched section checksums', async (t) => {
  const db = createDb(t);
  const invalidJson = await pushCloudSave({ request: pushRequest('{'), env: { DB: db.DB } });
  assert.equal(invalidJson.status, 400);
  const nullPayload = await pushCloudSave({ request: pushRequest('null'), env: { DB: db.DB } });
  assert.equal(nullPayload.status, 400);
  const badEncryption = await pushCloudSave({
    request: pushRequest(JSON.stringify({ save_data: 'not valid encrypted data' })),
    env: { DB: db.DB },
  });
  assert.equal(badEncryption.status, 400);
  const payload = await buildV2Payload(snapshotWith(8));
  payload.manifest.sections.core.checksum = 'sha256-invalid';
  const badChecksum = await pushCloudSave({ request: pushRequest(JSON.stringify(payload)), env: { DB: db.DB } });
  assert.equal(badChecksum.status, 400);
  assertNoRetiredSaveSql(db);
});

test('missing cloud save returns the explicit no-save response', async (t) => {
  const db = createDb(t);
  const response = await loadCloudSave({ request: loadRequest('2'), env: { DB: db.DB } });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { exists: false });
  assertNoRetiredSaveSql(db);
});

test('load database failures never become the no-save 404 response', async (t) => {
  const db = createDb(t, { failSql: (sql) => /FROM jkt48_manager_data_v2/i.test(sql) });
  let outcome;
  try {
    outcome = await loadCloudSave({ request: loadRequest('2'), env: { DB: db.DB } });
  } catch (error) {
    outcome = error;
  }

  assert.ok(outcome instanceof Error || outcome.status >= 500);
  assert.notEqual(outcome.status, 404);
  assertNoRetiredSaveSql(db);
});

test('coded database failures do not become successful pushes and unknown queries fail', async (t) => {
  const dbFailure = Object.assign(new Error('Injected SQLite failure.'), { code: 'ERR_SQLITE_ERROR' });
  const db = createDb(t, { failSql: (sql) => /INSERT INTO jkt48_manager_data_v2/i.test(sql) && dbFailure });
  const payload = await buildV2Payload(snapshotWith(8));
  const response = await pushCloudSave({ request: pushRequest(JSON.stringify(payload)), env: { DB: db.DB } });
  assert.notEqual(response.status, 200);
  await assert.rejects(() => db.DB.prepare('SELECT * FROM a_table_that_does_not_exist').first(), /no such table/i);
  assertNoRetiredSaveSql(db);
});

test('legacy conversion rejects a readback that no longer matches its source snapshot', async (t) => {
  const tamperedProfile = simpleEncrypt(JSON.stringify({ metaProfile: { currency: 999 } }));
  const db = createDb(t, {
    afterBatch: (sqlite) => sqlite.prepare('UPDATE jkt48_manager_data_v2 SET profile = ? WHERE user_id = ?').run(tamperedProfile, 'user-48'),
  });
  const response = await pushCloudSave({
    request: pushRequest(JSON.stringify({ save_data: simpleEncrypt(JSON.stringify(snapshotWith(24))) })),
    env: { DB: db.DB },
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /conversion verification failed/i);
  assert.equal(db.sqlite.prepare('SELECT revision FROM jkt48_manager_data_v2 WHERE user_id = ?').get('user-48').revision, 1);
  assertNoRetiredSaveSql(db);
});

test('Manager cloud snapshot encryption round-trips and rejects tampering', () => {
  const snapshot = JSON.stringify({ version: 1, activeRun: { state: { seed: 'JKT48-TEST', week: 4 } } });
  const encrypted = simpleEncrypt(snapshot);
  assert.notEqual(encrypted, snapshot);
  assert.equal(simpleDecrypt(encrypted), snapshot);
  const tampered = `${encrypted.slice(0, -2)}AA`;
  assert.throws(() => simpleDecrypt(tampered), /invalid or has been modified/);
});

test('shared user_h password format remains compatible with PBKDF2 verification', async () => {
  const stored = await hashPassword('stage48');
  assert.equal(await verifyPassword('stage48', stored), true);
  assert.equal(await verifyPassword('wrong-password', stored), false);
});

test('v2 section payload remains compatible with the browser decoder', async () => {
  const snapshot = snapshotWith(48);
  const payload = await buildV2Payload(snapshot, { slot: 1, updatedAt: 123 });
  const browserSnapshot = await decodeSnapshot(payload);
  const serverSnapshot = reconstructSnapshot(await decodeV2Sections(payload.sections));
  assert.equal(snapshotsEquivalent(snapshot, browserSnapshot), true);
  assert.equal(snapshotsEquivalent(snapshot, serverSnapshot), true);
  assert.deepEqual(payload.manifest.sectionNames, ['core', 'roster', 'operations', 'history', 'profile']);
});
