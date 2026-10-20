import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as editMemberStat } from '../functions/api/voucher/edit-member-stat.js';
import { buildV2Payload, decodeV2Sections, reconstructSnapshot } from '../functions/api/_saveFormat.js';

const schemaSql = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
const RETIRED_SAVE_TABLE = /\bjkt48_manager_data\b/;
const USER_ID = 'user-48';
const REDEMPTION_ID = 'redemption-1';
const MEMBER_ID = 'member-1';

function createDb({ failSql = null, failRunSql = null, beforeBatch = null } = {}) {
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
  sqlite.exec(schemaSql);

  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
  sqlite.prepare('INSERT INTO user_h (user_id, username) VALUES (?, ?)').run('1', 'admin');
  sqlite.prepare('INSERT INTO user_h (user_id, username) VALUES (?, ?)').run(USER_ID, 'manager');
  sqlite.prepare('INSERT INTO sessions (session_token, user_id, expires_at) VALUES (?, ?, ?)').run('valid-token', USER_ID, expiresAt);

  const calls = [];
  let batchCount = 0;
  const DB = {
    prepare(sql) {
      assert.equal(RETIRED_SAVE_TABLE.test(sql), false, `Retired save table queried: ${sql}`);
      const call = { sql, values: [] };
      calls.push(call);
      if (failSql?.(sql)) throw new Error('Injected database failure.');
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
          if (failRunSql?.(sql)) throw new Error('Injected database statement failure.');
          const result = sqlite.prepare(sql).run(...call.values);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch(statements) {
      batchCount += 1;
      await beforeBatch?.(sqlite);
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { DB, sqlite, calls, get batchCount() { return batchCount; } };
}

function snapshot() {
  return {
    version: 1,
    savedAt: 123,
    metaProfile: { currency: 40, runHistory: [] },
    activeRun: {
      slot: 1,
      state: {
        year: 2,
        week: 3,
        seed: 'voucher-v2-test',
        members: [{ id: MEMBER_ID, name: 'Member One', status: 'active', vocal: 55, dance: 61, voucherBaseStats: { vocal: 55, dance: 61 }, voucherAdjustments: { vocal: 0, dance: 0 } }],
        schedule: { Monday: 'theater' },
        weeklyReports: [{ week: 3, marker: 'history stays stable' }],
        futureStateField: { marker: 'core stays stable' },
      },
    },
  };
}

function seedVoucher(db, { pointsTotal = 20, pointsUsed = 0, maxPerStat = 20, maxPerMember = 20, allowedStats = ['vocal'] } = {}) {
  db.sqlite.prepare(`INSERT INTO vouchers
    (voucher_id, code, name, total_points, max_increase_per_stat, max_increase_per_member, allowed_stats, lifecycle_status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('voucher-1', 'SAVE-TEST', 'Save test voucher', pointsTotal, maxPerStat, maxPerMember, JSON.stringify(allowedStats), 'active', '1');
  db.sqlite.prepare(`INSERT INTO voucher_redemptions
    (redemption_id, voucher_id, user_id, points_total, points_used, status)
    VALUES (?, ?, ?, ?, ?, 'active')`)
    .run(REDEMPTION_ID, 'voucher-1', USER_ID, pointsTotal, pointsUsed);
}

function seedEditLog(db, { editId = 'prior-edit', delta = 3 } = {}) {
  db.sqlite.prepare(`INSERT INTO voucher_edit_log
    (edit_id, redemption_id, voucher_id, user_id, member_id, stat, base_value_at_edit,
     voucher_adjustment_before, voucher_adjustment_after, display_value_before,
     display_value_after, delta, points_used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(editId, REDEMPTION_ID, 'voucher-1', USER_ID, MEMBER_ID, 'vocal', 55, 0, delta, 55, 55 + delta, delta, delta, '2026-10-16T00:00:00.000Z');
}

async function seedV2Save(db, save = snapshot(), revision = 7) {
  const payload = await buildV2Payload(save, { slot: 1, updatedAt: 123, revision });
  db.sqlite.prepare(`INSERT INTO jkt48_manager_data_v2
    (user_id, username, manifest, core, roster, operations, history, profile, format_version, revision, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(USER_ID, 'manager', JSON.stringify(payload.manifest), payload.sections.core, payload.sections.roster,
      payload.sections.operations, payload.sections.history, payload.sections.profile, 2, revision, '2026-10-16 00:00:00');
  return payload;
}

function editRequest({ delta = 4, edits = null, token = 'valid-token' } = {}) {
  return new Request('https://manager.example/api/voucher/edit-member-stat', {
    method: 'POST',
    headers: { Cookie: `session_token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ redemptionId: REDEMPTION_ID, memberId: MEMBER_ID, edits: edits ?? [{ stat: 'vocal', delta }] }),
  });
}

async function callEdit(db, options) {
  return editMemberStat({ request: editRequest(options), env: { DB: db.DB } });
}

function accountingState(sqlite) {
  const redemption = sqlite.prepare('SELECT points_used, status FROM voucher_redemptions WHERE redemption_id = ?').get(REDEMPTION_ID);
  const edits = sqlite.prepare('SELECT edit_id, member_id, stat, delta, points_used FROM voucher_edit_log WHERE redemption_id = ? ORDER BY edit_id').all(REDEMPTION_ID);
  return { redemption, edits };
}

function assertNoRetiredSaveSql(db) {
  assert.equal(db.calls.some(({ sql }) => RETIRED_SAVE_TABLE.test(sql)), false);
}

test('voucher edits update only the v2 roster section and account for points', async () => {
  const db = createDb();
  seedVoucher(db);
  const original = snapshot();
  await seedV2Save(db, original);
  const before = db.sqlite.prepare(`SELECT manifest, core, roster, operations, history, profile, revision
    FROM jkt48_manager_data_v2 WHERE user_id = ?`).get(USER_ID);

  const response = await callEdit(db);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.member.vocal, 59);
  assert.equal(result.pointsUsed, 4);
  assert.equal(result.pointsRemaining, 16);

  const after = db.sqlite.prepare(`SELECT manifest, core, roster, operations, history, profile, revision
    FROM jkt48_manager_data_v2 WHERE user_id = ?`).get(USER_ID);
  const previousManifest = JSON.parse(before.manifest);
  const nextManifest = JSON.parse(after.manifest);
  assert.equal(after.revision, before.revision + 1);
  assert.equal(nextManifest.revision, before.revision + 1);
  for (const section of ['core', 'operations', 'history', 'profile']) {
    assert.equal(after[section], before[section], `${section} bytes should remain unchanged`);
    assert.deepEqual(nextManifest.sections[section], previousManifest.sections[section], `${section} metadata should remain unchanged`);
  }
  assert.notEqual(after.roster, before.roster);
  const restored = reconstructSnapshot(await decodeV2Sections(after));
  assert.deepEqual(restored.activeRun.state.members[0], result.member);
  assert.deepEqual(restored.activeRun.state.schedule, original.activeRun.state.schedule);
  assert.deepEqual(restored.activeRun.state.weeklyReports, original.activeRun.state.weeklyReports);

  const accounting = accountingState(db.sqlite);
  assert.equal(accounting.redemption.points_used, 4);
  assert.equal(accounting.redemption.status, 'active');
  assert.equal(accounting.edits.length, 1);
  assert.equal(accounting.edits[0].stat, 'vocal');
  assert.equal(accounting.edits[0].delta, 4);
  assert.equal(accounting.edits[0].points_used, 4);
  assertNoRetiredSaveSql(db);
});

test('missing v2 save returns save_unavailable without voucher mutations', async () => {
  const db = createDb();
  seedVoucher(db);
  const before = accountingState(db.sqlite);

  const response = await callEdit(db);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'save_unavailable');
  assert.deepEqual(accountingState(db.sqlite), before);
  assert.equal(db.batchCount, 0);
  assertNoRetiredSaveSql(db);
});

test('exhausted voucher and per-stat limits return conflicts without mutations', async () => {
  const cases = [
    { name: 'voucher points', voucher: { pointsTotal: 10, pointsUsed: 9 }, delta: 2, code: 'points_exhausted' },
    { name: 'per-stat allowance', voucher: { pointsTotal: 20, pointsUsed: 3, maxPerStat: 5 }, priorEdit: true, delta: 3, code: 'stat_limit' },
  ];

  for (const scenario of cases) {
    const db = createDb();
    seedVoucher(db, scenario.voucher);
    if (scenario.priorEdit) seedEditLog(db);
    await seedV2Save(db);
    const before = accountingState(db.sqlite);

    const response = await callEdit(db, { delta: scenario.delta });
    assert.equal(response.status, 409, scenario.name);
    assert.equal((await response.json()).code, scenario.code, scenario.name);
    assert.deepEqual(accountingState(db.sqlite), before, scenario.name);
    assert.equal(db.batchCount, 0, scenario.name);
    assertNoRetiredSaveSql(db);
  }
});

test('revision change before the batch rejects the edit without charging points or logging it', async () => {
  const db = createDb({
    beforeBatch(sqlite) {
      const row = sqlite.prepare('SELECT manifest FROM jkt48_manager_data_v2 WHERE user_id = ?').get(USER_ID);
      const manifest = JSON.parse(row.manifest);
      manifest.revision += 1;
      sqlite.prepare('UPDATE jkt48_manager_data_v2 SET manifest = ?, revision = ? WHERE user_id = ?')
        .run(JSON.stringify(manifest), manifest.revision, USER_ID);
    },
  });
  seedVoucher(db);
  await seedV2Save(db);
  const before = accountingState(db.sqlite);

  const response = await callEdit(db);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'edit_conflict');
  assert.deepEqual(accountingState(db.sqlite), before);
  assert.equal(db.batchCount, 1);
  assertNoRetiredSaveSql(db);
});

test('redemption points or status changes before the batch reject without adding edit records', async () => {
  const cases = [
    {
      name: 'points changed',
      update(sqlite) {
        sqlite.prepare('UPDATE voucher_redemptions SET points_used = 2 WHERE redemption_id = ?').run(REDEMPTION_ID);
      },
      expected: { points_used: 2, status: 'active' },
    },
    {
      name: 'redemption depleted',
      update(sqlite) {
        sqlite.prepare("UPDATE voucher_redemptions SET points_used = 20, status = 'depleted' WHERE redemption_id = ?").run(REDEMPTION_ID);
      },
      expected: { points_used: 20, status: 'depleted' },
    },
  ];

  for (const scenario of cases) {
    const db = createDb({ beforeBatch: scenario.update });
    seedVoucher(db);
    await seedV2Save(db);

    const response = await callEdit(db);
    assert.equal(response.status, 409, scenario.name);
    assert.equal((await response.json()).code, 'edit_conflict', scenario.name);
    const accounting = accountingState(db.sqlite);
    assert.deepEqual({ ...accounting.redemption }, scenario.expected, scenario.name);
    assert.deepEqual(accounting.edits, [], scenario.name);
    assert.equal(db.batchCount, 1, scenario.name);
    assertNoRetiredSaveSql(db);
  }
});

test('multiple stat edits write all roster changes and charge their combined points', async () => {
  const db = createDb();
  seedVoucher(db, { allowedStats: ['vocal', 'dance'] });
  await seedV2Save(db);

  const response = await callEdit(db, { edits: [{ stat: 'vocal', delta: 3 }, { stat: 'dance', delta: 2 }] });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.pointsUsed, 5);
  assert.equal(result.pointsRemaining, 15);
  assert.deepEqual(result.appliedEdits.map(({ stat, appliedDelta }) => ({ stat, appliedDelta })), [
    { stat: 'vocal', appliedDelta: 3 },
    { stat: 'dance', appliedDelta: 2 },
  ]);

  const stored = db.sqlite.prepare(`SELECT manifest, core, roster, operations, history, profile, revision
    FROM jkt48_manager_data_v2 WHERE user_id = ?`).get(USER_ID);
  const restored = reconstructSnapshot(await decodeV2Sections(stored));
  assert.equal(restored.activeRun.state.members[0].vocal, 58);
  assert.equal(restored.activeRun.state.members[0].dance, 63);
  assert.equal(stored.revision, 8);
  const accounting = accountingState(db.sqlite);
  assert.equal(accounting.redemption.points_used, 5);
  assert.deepEqual(accounting.edits.map(({ stat, delta, points_used }) => ({ stat, delta, points_used })).sort((a, b) => a.stat.localeCompare(b.stat)), [
    { stat: 'dance', delta: 2, points_used: 2 },
    { stat: 'vocal', delta: 3, points_used: 3 },
  ]);
  assert.equal(db.batchCount, 1);
  assertNoRetiredSaveSql(db);
});

test('SQL failure midway through the D1 batch rolls back all edit mutations', async () => {
  const db = createDb({ failRunSql: (sql) => /UPDATE\s+jkt48_manager_data_v2\s+SET manifest/i.test(sql) });
  seedVoucher(db);
  await seedV2Save(db);
  const beforeAccounting = accountingState(db.sqlite);
  const beforeSave = db.sqlite.prepare(`SELECT manifest, core, roster, operations, history, profile, revision
    FROM jkt48_manager_data_v2 WHERE user_id = ?`).get(USER_ID);

  const response = await callEdit(db);
  assert.equal(response.status, 500);
  assert.equal((await response.json()).code, 'internal_error');
  assert.deepEqual(accountingState(db.sqlite), beforeAccounting);
  assert.deepEqual(db.sqlite.prepare(`SELECT manifest, core, roster, operations, history, profile, revision
    FROM jkt48_manager_data_v2 WHERE user_id = ?`).get(USER_ID), beforeSave);
  assert.equal(db.batchCount, 1);
  assertNoRetiredSaveSql(db);
});

test('v2 database read failure is not reported as a missing save', async () => {
  const db = createDb({ failSql: (sql) => /FROM\s+jkt48_manager_data_v2\s+WHERE/i.test(sql) });
  seedVoucher(db);
  await seedV2Save(db);
  const before = accountingState(db.sqlite);

  const response = await callEdit(db);
  assert.equal(response.status, 500);
  assert.equal((await response.json()).code, 'internal_error');
  assert.deepEqual(accountingState(db.sqlite), before);
  assert.equal(db.batchCount, 0);
  assertNoRetiredSaveSql(db);
});
