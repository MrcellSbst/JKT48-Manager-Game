import { auditInsert, errorResponse, VoucherError, voucherStatus, voucherToClient } from '../_voucher.js';

export function routeId(params, key = 'id') {
  const id = String(params?.[key] ?? '').trim();
  if (!id) throw new VoucherError('Voucher identifier is required.', 400, 'invalid_id');
  return id;
}

export async function loadVoucher(env, voucherId) {
  const row = await env.DB.prepare('SELECT * FROM vouchers WHERE voucher_id = ?').bind(voucherId).first();
  if (!row) throw new VoucherError('Voucher not found.', 404, 'voucher_not_found');
  const metrics = await env.DB.prepare(`SELECT COUNT(*) AS redemption_count, COALESCE(SUM(points_total), 0) AS points_issued, COALESCE(SUM(points_used), 0) AS points_used FROM voucher_redemptions WHERE voucher_id = ?`).bind(voucherId).first();
  const redemptionCount = Number(metrics?.redemption_count ?? 0);
  return { row, voucher: voucherToClient(row, { redemptionCount, pointsIssued: Number(metrics?.points_issued ?? 0), pointsUsed: Number(metrics?.points_used ?? 0) }), redemptionCount };
}

export async function writeAudit(env, input) {
  const statement = auditInsert(input);
  await env.DB.prepare(statement.sql).bind(...statement.bindings).run();
}

export async function assertTargetUsersExist(env, userIds) {
  if (!userIds.length) return;
  const result = await env.DB.prepare(`SELECT user_id FROM user_h WHERE user_id IN (${userIds.map(() => '?').join(',')})`).bind(...userIds).all();
  const found = new Set((result.results ?? []).map((row) => String(row.user_id)));
  if (userIds.some((id) => !found.has(String(id)))) throw new VoucherError('Every targeted user must be an authenticated account.', 400, 'invalid_target');
}

export function lifecycleStatus(voucher) {
  return voucherStatus({
    ...voucher,
    lifecycle_status: voucher.lifecycleStatus,
    expires_at: voucher.expiresAt,
    max_redemptions: voucher.maxRedemptions,
  }, voucher.redemptionCount);
}

export { errorResponse };
