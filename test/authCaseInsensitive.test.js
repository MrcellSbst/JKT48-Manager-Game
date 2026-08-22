import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as login } from '../functions/api/auth/login.js';
import { onRequestPost as register } from '../functions/api/auth/register.js';
import { hashPassword } from '../functions/api/_session.js';

const post = (path, body) => new Request(`https://manager.example${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('registration rejects an existing username with different casing', async () => {
  const env = {
    DB: {
      prepare(sql) {
        assert.match(sql, /COLLATE NOCASE/);
        return {
          bind(username) {
            assert.equal(username, 'MARCELL');
            return { first: async () => ({ user_id: 'existing-user' }) };
          },
        };
      },
    },
  };

  const response = await register({ request: post('/api/auth/register', { username: 'MARCELL', password: 'secret12' }), env });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'Username already taken.' });
});

test('login ignores username casing and returns stored display casing', async () => {
  const storedPassword = await hashPassword('secret12');
  const statements = [];
  const env = {
    DB: {
      prepare(sql) {
        statements.push(sql);
        return {
          bind(...values) {
            if (/FROM user_h/.test(sql)) {
              assert.match(sql, /COLLATE NOCASE/);
              assert.deepEqual(values, ['mArCeLl', 'mArCeLl']);
              return { all: async () => ({ results: [{ user_id: 'user-1', username: 'Marcell', password: storedPassword }] }) };
            }
            return { run: async () => ({ meta: { changes: 1 } }) };
          },
        };
      },
    },
  };

  const response = await login({ request: post('/api/auth/login', { username: 'mArCeLl', password: 'secret12' }), env });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.username, 'Marcell');
  assert.equal(body.user_id, 'user-1');
  assert.ok(statements.some((sql) => /DELETE FROM sessions/.test(sql)));
  assert.ok(statements.some((sql) => /INSERT INTO sessions/.test(sql)));
});
