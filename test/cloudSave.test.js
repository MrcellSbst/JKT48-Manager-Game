import test from 'node:test';
import assert from 'node:assert/strict';
import { simpleDecrypt, simpleEncrypt } from '../src/utils/crypto.js';
import { hashPassword, verifyPassword } from '../functions/api/_session.js';
import { onRequestPost as pushCloudSave } from '../functions/api/save/push.js';
import { onRequestGet as loadCloudSave } from '../functions/api/save/load.js';
import { buildV2Payload, decodeV2Sections, reconstructSnapshot, snapshotsEquivalent } from '../functions/api/_saveFormat.js';
import { decodeSnapshot } from '../src/state/saveFormat.js';

function createDb({ saveRow = null } = {}) {
  const calls = [];
  let storedV2 = null;
  const db = {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          const statement = {
            sql, values,
            first: async () => {
              if (sql.includes('FROM sessions')) return { user_id: 'user-48', username: 'manager', expires_at: new Date(Date.now() + 60_000).toISOString() };
              if (sql.includes('jkt48_manager_data_v2')) return storedV2;
              return saveRow;
            },
            run: async () => {
              if (sql.includes('INSERT INTO jkt48_manager_data_v2')) storedV2 = { manifest: values[2], core: values[3], roster: values[4], operations: values[5], history: values[6], profile: values[7], format_version: values[8], revision: values[9], updated_at: '2026-08-20 12:00:00' };
              return { success: true };
            },
          };
          return statement;
        },
      };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
  return db;
}

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

test('cached legacy cloud push converts directly to verified v2 sections', async () => {
  const db = createDb();
  const encrypted = simpleEncrypt(JSON.stringify({ version: 1, activeRun: null, metaProfile: { currency: 24 } }));
  const request = new Request('https://manager.example/api/save/push', {
    method: 'POST',
    headers: { Cookie: 'session_token=valid', 'Content-Type': 'application/json' },
    body: JSON.stringify({ save_data: encrypted, ignored: 'value' }),
  });
  const response = await pushCloudSave({ request, env: { DB: db } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.format, 2);
  assert.equal(body.verified, true);
  const upsert = db.calls.find((call) => call.sql.includes('INSERT INTO jkt48_manager_data_v2'));
  assert.equal(upsert.values[0], 'user-48');
  assert.equal(upsert.values[1], 'manager');
  assert.equal(db.calls.some((call) => call.sql.includes('INSERT INTO jkt48_manager_data (')), false);
});

test('cloud load endpoint returns encrypted snapshot for authenticated user', async () => {
  const saveRow = { save_data: 'encrypted-payload', updated_at: '2026-08-20 12:00:00' };
  const db = createDb({ saveRow });
  const request = new Request('https://manager.example/api/save/load', { headers: { Cookie: 'session_token=valid' } });
  const response = await loadCloudSave({ request, env: { DB: db } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { exists: true, data: saveRow });
});

test('v2 section payload is compatible with the browser decoder and reconstructs exactly', async () => {
  const snapshot = {
    version: 1,
    savedAt: 123,
    metaProfile: { currency: 48, runHistory: [] },
    activeRun: { slot: 1, state: { year: 2, week: 1, members: [{ id: 'm1', name: 'Test' }], schedule: {}, weeklyReports: [] } },
  };
  const payload = await buildV2Payload(snapshot, { slot: 1, updatedAt: 123 });
  const browserSnapshot = await decodeSnapshot(payload);
  const serverSnapshot = reconstructSnapshot(await decodeV2Sections(payload.sections));
  assert.equal(snapshotsEquivalent(snapshot, browserSnapshot), true);
  assert.equal(snapshotsEquivalent(snapshot, serverSnapshot), true);
  assert.deepEqual(payload.manifest.sectionNames, ['core', 'roster', 'operations', 'history', 'profile']);
});
