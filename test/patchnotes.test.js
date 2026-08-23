import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizePatchnote, parseJakartaDateTime } from '../functions/api/_patchnotes.js';
import { onRequestGet as getLatestPatchnote } from '../functions/api/patchnotes/latest.js';
import { onRequestPost as createPatchnote } from '../functions/api/admin/patchnotes/index.js';
import {
  hardRefreshPage,
  PATCHNOTE_SEEN_KEY,
  readSeenPatchnote,
  rememberPatchnote,
  shouldShowPatchnote,
  toJakartaDateTimeLocal,
} from '../src/utils/patchnotes.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: (key) => values.get(key),
  };
}

function latestDb(row) {
  return { prepare() { return { bind() { return { first: async () => row }; } }; } };
}

function adminCreateDb(userId = '1') {
  let inserted = null;
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes('FROM sessions')) return { user_id: userId, username: 'admin', expires_at: new Date(Date.now() + 60_000).toISOString() };
              if (sql.includes('FROM manager_patchnotes')) return inserted;
              return null;
            },
            run: async () => {
              if (sql.includes('INSERT INTO manager_patchnotes')) {
                inserted = {
                  patchnote_id: values[0], version_label: values[1], title_en: values[2], title_id: values[3], body_en: values[4], body_id: values[5],
                  lifecycle_status: values[6], published_at: values[7], created_by: values[8], updated_by: values[9], created_at: values[10], updated_at: values[11],
                };
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

test('patchnote publication times treat timezone-less admin input as UTC+7', () => {
  assert.equal(parseJakartaDateTime('2026-08-23T20:30'), '2026-08-23T13:30:00.000Z');
  assert.equal(parseJakartaDateTime('2026-08-23T20:30:00Z'), '2026-08-23T20:30:00.000Z');
  assert.equal(toJakartaDateTimeLocal('2026-08-23T13:30:00.000Z'), '2026-08-23T20:30');
});

test('patchnote definitions preserve bilingual content and require English fallback', () => {
  const normalized = normalizePatchnote({ versionLabel: ' v1.2 ', titleEn: ' Update ', titleId: ' Pembaruan ', bodyEn: ' Fixes ', bodyId: ' Perbaikan ', lifecycleStatus: 'published', publishedAt: '2026-08-23T20:30' });
  assert.deepEqual(normalized, { versionLabel: 'v1.2', titleEn: 'Update', titleId: 'Pembaruan', bodyEn: 'Fixes', bodyId: 'Perbaikan', lifecycleStatus: 'published', publishedAt: '2026-08-23T13:30:00.000Z' });
  assert.throws(() => normalizePatchnote({ bodyEn: 'Body', publishedAt: '2026-08-23T20:30' }), /English title/);
  assert.throws(() => normalizePatchnote({ titleEn: 'Title', bodyEn: 'Body', lifecycleStatus: 'deleted', publishedAt: '2026-08-23T20:30' }), /status is invalid/);
});

test('latest public patchnote endpoint returns published content without caching', async () => {
  const row = { patchnote_id: 'patchnote-1', version_label: 'v1', title_en: 'Update', title_id: 'Pembaruan', body_en: 'Body', body_id: 'Isi', lifecycle_status: 'published', published_at: '2026-08-23T13:30:00.000Z', created_at: '2026-08-23T13:00:00.000Z', updated_at: '2026-08-23T13:00:00.000Z' };
  const response = await getLatestPatchnote({ env: { DB: latestDb(row) } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).patchnote.patchnoteId, 'patchnote-1');
});

test('only user ID 1 can create patchnotes and Jakarta input is stored as UTC', async () => {
  const payload = { versionLabel: 'v2', titleEn: 'New update', titleId: 'Pembaruan baru', bodyEn: 'Changes', bodyId: 'Perubahan', lifecycleStatus: 'published', publishedAt: '2026-08-23T20:30' };
  const request = (userId) => new Request('https://manager.example/api/admin/patchnotes', { method: 'POST', headers: { Cookie: 'session_token=valid', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const forbidden = await createPatchnote({ request: request('2'), env: { DB: adminCreateDb('2') } });
  assert.equal(forbidden.status, 403);
  const created = await createPatchnote({ request: request('1'), env: { DB: adminCreateDb('1') } });
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.equal(body.patchnote.publishedAt, '2026-08-23T13:30:00.000Z');
  assert.equal(body.patchnote.titleId, 'Pembaruan baru');
});

test('seen tracking compares canonical patchnote publication time', () => {
  const storage = memoryStorage();
  const first = { patchnoteId: 'p1', publishedAt: '2026-08-23T13:30:00.000Z' };
  const newer = { patchnoteId: 'p2', publishedAt: '2026-08-24T01:00:00.000Z' };
  assert.equal(shouldShowPatchnote(first, readSeenPatchnote(storage)), true);
  assert.equal(rememberPatchnote(first, storage), true);
  assert.deepEqual(JSON.parse(storage.value(PATCHNOTE_SEEN_KEY)), first);
  assert.equal(shouldShowPatchnote(first, readSeenPatchnote(storage)), false);
  assert.equal(shouldShowPatchnote({ patchnoteId: 'p1-replacement', publishedAt: first.publishedAt }, readSeenPatchnote(storage)), true);
  assert.equal(shouldShowPatchnote(newer, readSeenPatchnote(storage)), true);
});

test('hard refresh unregisters workers, clears Cache Storage, and reloads', async () => {
  const calls = [];
  await hardRefreshPage({
    navigatorObject: { serviceWorker: { getRegistrations: async () => [{ unregister: async () => calls.push('unregister-1') }, { unregister: async () => calls.push('unregister-2') }] } },
    cachesObject: { keys: async () => ['app', 'images'], delete: async (key) => calls.push(`cache-${key}`) },
    locationObject: { reload: (hard) => calls.push(`reload-${hard}`) },
  });
  assert.deepEqual(calls, ['unregister-1', 'unregister-2', 'cache-app', 'cache-images', 'reload-true']);
});

test('app exposes hidden patchnote admin route and mounts update notice before login', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  assert.match(source, /const ADMIN_PATCHNOTES_PATH = '\/admin\/patchnotes'/);
  assert.match(source, /<PatchnotesAdminDashboard language=\{language\}/);
  assert.match(source, /const patchnoteLayer = <PatchnoteNotice language=\{language\} \/>/);
  assert.match(source, /if \(!user && !guestMode\) return <><AuthScreen[\s\S]*?\{patchnoteLayer\}<SyncOverlay/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS manager_patchnotes/);
});
