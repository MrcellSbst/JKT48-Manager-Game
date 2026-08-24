import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMemberVoucherAdjustment,
  capMemberVoucherAdjustment,
  getMemberVoucherState,
  normalizeVoucherCode,
  normalizeVoucherDefinition,
  parseDate,
  requireAdmin,
  voucherStatus,
} from '../functions/api/_voucher.js';
import { onRequestPost as redeemVoucher } from '../functions/api/voucher/redeem.js';
import { onRequestPost as createVoucher } from '../functions/api/admin/vouchers/index.js';
import { getVoucherEditEligibility } from '../src/data/voucher.js';

test('voucher edit eligibility keeps limit-minus-one editable and locks exactly at limit', () => {
  const base = { status: 'active', pointsRemaining: 4, usage: [{ memberId: 'm1', stat: 'vocal', pointsUsed: 2 }], voucher: { allowMultipleMembers: true, maxIncreasePerMember: 3, allowedStats: ['vocal'] } };
  assert.equal(getVoucherEditEligibility(base, 'm1').allowed, true);
  assert.equal(getVoucherEditEligibility({ ...base, usage: [{ memberId: 'm1', stat: 'vocal', pointsUsed: 3 }] }, 'm1').reason, 'edit_limit_reached');
  assert.equal(getVoucherEditEligibility({ ...base, pointsRemaining: 0 }, 'm1').reason, 'no_voucher_available');
});

function sessionDb(userId) {
  return { prepare(sql) { return { bind() { return { first: async () => sql.includes('FROM sessions') ? { user_id: userId, username: 'manager', expires_at: new Date(Date.now() + 60_000).toISOString() } : null, run: async () => ({}) }; } }; } };
}

function redeemDb({ sessionUser = 'user-48', voucher = null, userCount = 0, redemptionCount = 0, insertChanges = 1 } = {}) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes('FROM sessions')) return sessionUser ? { user_id: sessionUser, username: 'manager', expires_at: new Date(Date.now() + 60_000).toISOString() } : null;
              if (sql.includes('FROM vouchers')) return voucher ? { ...voucher, redemption_count: redemptionCount } : null;
              if (sql.includes('COUNT(*) AS count')) return { count: userCount };
              return null;
            },
            run: async () => ({ meta: { changes: insertChanges } }),
          };
        },
      };
    },
  };
}

const validVoucherRow = {
  voucher_id: 'voucher-1', code: 'JKT48-TEST', name: 'Test voucher', description: '', type: 'member-stat-editor',
  total_points: 10, max_increase_per_stat: 5, max_increase_per_member: 10, allowed_stats: '["vocal"]',
  allow_decrease: 0, allow_multiple_members: 1, max_redemptions: 2, max_redemptions_per_user: 1,
  target_user_ids: '[]', lifecycle_status: 'active', valid_from: null, expires_at: null,
};

test('voucher definitions normalize codes, limits, and editable permissions', () => {
  assert.equal(normalizeVoucherCode('  jkt48-test_1 '), 'JKT48-TEST_1');
  const voucher = normalizeVoucherDefinition({ code: 'jkt48-test', name: 'Training', totalPoints: 12, maxIncreasePerStat: 5, maxIncreasePerMember: 8, allowedStats: ['Vocal', 'vocal', 'ego'], allowMultipleMembers: false });
  assert.deepEqual(voucher.allowedStats, ['vocal', 'ego']);
  assert.equal(voucher.allowMultipleMembers, false);
  assert.throws(() => normalizeVoucherCode('bad code'), /letters/);
  assert.throws(() => normalizeVoucherDefinition({ code: 'JKT48-E', name: 'Energy', totalPoints: 5, maxIncreasePerStat: 5, maxIncreasePerMember: 5, allowedStats: ['energy'] }), /unsupported stat/);
  assert.throws(() => normalizeVoucherDefinition({ code: 'JKT48-X', name: 'Bad', totalPoints: 5, maxIncreasePerStat: 6, maxIncreasePerMember: 2, allowedStats: ['vocal'] }), /between 0 and total/);
});

test('voucher datetimes treat timezone-less input as Jakarta time before storing UTC', () => {
  assert.equal(parseDate('2026-08-21T10:00', 'Valid from'), '2026-08-21T03:00:00.000Z');
  assert.equal(parseDate('2026-08-21T10:00:00+02:00', 'Valid from'), '2026-08-21T08:00:00.000Z');
  assert.equal(parseDate('2026-08-21', 'Valid from'), '2026-08-20T17:00:00.000Z');
});

test('voucher permission fields lock after first redemption', () => {
  const current = { voucherId: 'voucher-1', code: 'JKT48-X', name: 'Training', totalPoints: 10, maxIncreasePerStat: 5, maxIncreasePerMember: 10, allowedStats: ['vocal'], allowDecrease: false, allowMultipleMembers: true, maxRedemptions: null, maxRedemptionsPerUser: 1, targetUserIds: [], lifecycleStatus: 'active', redemptionCount: 1 };
  assert.throws(() => normalizeVoucherDefinition({ totalPoints: 12 }, { partial: true, current, redemptionCount: 1 }), /locked/);
  assert.equal(normalizeVoucherDefinition({ totalPoints: 10, allowedStats: ['vocal'], allowDecrease: false }, { partial: true, current, redemptionCount: 1 }).totalPoints, 10);
  const renamed = normalizeVoucherDefinition({ name: 'Renamed', description: 'Updated' }, { partial: true, current, redemptionCount: 1 });
  assert.equal(renamed.name, 'Renamed');
  assert.throws(() => normalizeVoucherDefinition({ code: 'JKT48-NEW' }, { partial: true, current, redemptionCount: 1 }), /cannot change/);
});

test('legacy vouchers drop Energy without tripping locked permission checks', () => {
  const current = { voucherId: 'voucher-old', code: 'JKT48-OLD', name: 'Legacy', totalPoints: 10, maxIncreasePerStat: 5, maxIncreasePerMember: 10, allowedStats: ['vocal', 'energy'], allowDecrease: false, allowMultipleMembers: true, maxRedemptions: null, maxRedemptionsPerUser: 1, targetUserIds: [], lifecycleStatus: 'active', redemptionCount: 1 };
  const updated = normalizeVoucherDefinition({ name: 'Legacy renamed' }, { partial: true, current, redemptionCount: 1 });
  assert.deepEqual(updated.allowedStats, ['vocal']);
});

test('voucher status reflects lifecycle, expiry, and exhaustion', () => {
  const base = { lifecycle_status: 'active', max_redemptions: 2, expires_at: null };
  assert.equal(voucherStatus(base, 0), 'active');
  assert.equal(voucherStatus(base, 2), 'exhausted');
  assert.equal(voucherStatus({ ...base, lifecycle_status: 'revoked' }, 0), 'revoked');
  assert.equal(voucherStatus({ ...base, expires_at: '2020-01-01T00:00:00.000Z' }, 0), 'expired');
});

test('voucher adjustments preserve a natural stat base', () => {
  const member = { id: 'm1', vocal: 70 };
  const boosted = applyMemberVoucherAdjustment(member, 'vocal', 4);
  assert.deepEqual(getMemberVoucherState(boosted, 'vocal'), { baseValue: 70, adjustment: 4, displayValue: 74 });
  const reduced = applyMemberVoucherAdjustment(boosted, 'vocal', 1);
  assert.equal(reduced.vocal, 71);
  assert.equal(reduced.voucherBaseStats.vocal, 70);
});

test('voucher adjustments clamp displayed stats to the global 0-100 range', () => {
  assert.equal(capMemberVoucherAdjustment(95, 10), 5);
  assert.equal(capMemberVoucherAdjustment(0, -10), 0);
  const capped = applyMemberVoucherAdjustment({ id: 'm2', vocal: 95 }, 'vocal', 10);
  assert.equal(capped.vocal, 100);
  assert.equal(capped.voucherAdjustments.vocal, 5);
});

test('voucher admin authorization is limited to user ID 1', async () => {
  const request = new Request('https://manager.example/api/admin/vouchers', { headers: { Cookie: 'session_token=valid' } });
  await assert.doesNotReject(() => requireAdmin(request, { DB: sessionDb('1') }));
  await assert.rejects(() => requireAdmin(request, { DB: sessionDb('2') }), (error) => error.status === 403 && error.code === 'admin_required');
});

test('normal accounts cannot create vouchers through the admin endpoint', async () => {
  const request = new Request('https://manager.example/api/admin/vouchers', { method: 'POST', headers: { Cookie: 'session_token=valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'forbidden' }) });
  const response = await createVoucher({ request, env: { DB: sessionDb('2') } });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'admin_required');
});

test('authenticated account can redeem a valid voucher through the endpoint', async () => {
  const request = new Request('https://manager.example/api/voucher/redeem', { method: 'POST', headers: { Cookie: 'session_token=valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: ' jkt48-test ' }) });
  const response = await redeemVoucher({ request, env: { DB: redeemDb({ voucher: validVoucherRow }) } });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).redemption.pointsRemaining, 10);
});

test('guest and invalid lifecycle redemption attempts are rejected', async () => {
  const guestRequest = new Request('https://manager.example/api/voucher/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'JKT48-TEST' }) });
  assert.equal((await redeemVoucher({ request: guestRequest, env: { DB: redeemDb({ voucher: validVoucherRow, sessionUser: null }) } })).status, 401);
  const pausedRequest = new Request('https://manager.example/api/voucher/redeem', { method: 'POST', headers: { Cookie: 'session_token=valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'JKT48-TEST' }) });
  const paused = await redeemVoucher({ request: pausedRequest, env: { DB: redeemDb({ voucher: { ...validVoucherRow, lifecycle_status: 'paused' } }) } });
  assert.equal(paused.status, 409);
  const future = await redeemVoucher({ request: new Request('https://manager.example/api/voucher/redeem', { method: 'POST', headers: { Cookie: 'session_token=valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'JKT48-TEST' }) }), env: { DB: redeemDb({ voucher: { ...validVoucherRow, valid_from: new Date(Date.now() + 60_000).toISOString() } }) } });
  assert.equal(future.status, 409);
  const expired = await redeemVoucher({ request: new Request('https://manager.example/api/voucher/redeem', { method: 'POST', headers: { Cookie: 'session_token=valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'JKT48-TEST' }) }), env: { DB: redeemDb({ voucher: { ...validVoucherRow, expires_at: new Date(Date.now() - 60_000).toISOString() } }) } });
  assert.equal(expired.status, 409);
});

test('redemption and per-user caps are enforced after an atomic insert conflict', async () => {
  const request = new Request('https://manager.example/api/voucher/redeem', { method: 'POST', headers: { Cookie: 'session_token=valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'JKT48-TEST' }) });
  const userCapped = await redeemVoucher({ request, env: { DB: redeemDb({ voucher: validVoucherRow, userCount: 1, insertChanges: 0 }) } });
  assert.equal(userCapped.status, 409);
  assert.equal((await userCapped.json()).code, 'user_redemption_limit');
  const globalRequest = new Request('https://manager.example/api/voucher/redeem', { method: 'POST', headers: { Cookie: 'session_token=valid', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'JKT48-TEST' }) });
  const globallyCapped = await redeemVoucher({ request: globalRequest, env: { DB: redeemDb({ voucher: { ...validVoucherRow, max_redemptions_per_user: null }, redemptionCount: 2, insertChanges: 0 }) } });
  assert.equal(globallyCapped.status, 409);
  assert.equal((await globallyCapped.json()).code, 'voucher_exhausted');
});
