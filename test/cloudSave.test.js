import test from 'node:test';
import assert from 'node:assert/strict';
import { simpleDecrypt, simpleEncrypt } from '../src/utils/crypto.js';
import { hashPassword, verifyPassword } from '../functions/api/_session.js';
import { onRequestPost as pushCloudSave } from '../functions/api/save/push.js';
import { onRequestGet as loadCloudSave } from '../functions/api/save/load.js';

function createDb({ saveRow = null } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            first: async () => sql.includes('FROM sessions')
              ? { user_id: 'user-48', username: 'manager', expires_at: new Date(Date.now() + 60_000).toISOString() }
              : saveRow,
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
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

test('cloud save endpoint authenticates and upserts only encrypted Manager save data', async () => {
  const db = createDb();
  const encrypted = simpleEncrypt(JSON.stringify({ version: 1, activeRun: null, metaProfile: { currency: 24 } }));
  const request = new Request('https://manager.example/api/save/push', {
    method: 'POST',
    headers: { Cookie: 'session_token=valid', 'Content-Type': 'application/json' },
    body: JSON.stringify({ save_data: encrypted, ignored: 'value' }),
  });
  const response = await pushCloudSave({ request, env: { DB: db } });
  assert.equal(response.status, 200);
  const upsert = db.calls.find((call) => call.sql.includes('INSERT INTO jkt48_manager_data'));
  assert.deepEqual(upsert.values, ['user-48', 'manager', encrypted]);
});

test('cloud load endpoint returns encrypted snapshot for authenticated user', async () => {
  const saveRow = { save_data: 'encrypted-payload', updated_at: '2026-08-20 12:00:00' };
  const db = createDb({ saveRow });
  const request = new Request('https://manager.example/api/save/load', { headers: { Cookie: 'session_token=valid' } });
  const response = await loadCloudSave({ request, env: { DB: db } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { exists: true, data: saveRow });
});
