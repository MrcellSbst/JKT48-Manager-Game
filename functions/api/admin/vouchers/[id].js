import { errorResponse, normalizeVoucherDefinition, readJson, requireAdmin, VoucherError } from '../../_voucher.js';
import { assertTargetUsersExist, loadVoucher, routeId, writeAudit } from '../_voucher.js';

export async function onRequestGet({ request, env, params }) {
  try {
    await requireAdmin(request, env);
    const voucherId = routeId(params);
    const loaded = await loadVoucher(env, voucherId);
    const redemptions = await env.DB.prepare(`
      SELECT vr.redemption_id, vr.voucher_id, vr.user_id, vr.points_total, vr.points_used, vr.status, vr.redeemed_at, vr.updated_at,
             uh.username
      FROM voucher_redemptions vr LEFT JOIN user_h uh ON uh.user_id = vr.user_id
      WHERE vr.voucher_id = ? ORDER BY vr.redeemed_at DESC`).bind(voucherId).all();
    const audit = await env.DB.prepare(`SELECT audit_id, admin_user_id, action, redemption_id, before_snapshot, after_snapshot, created_at FROM admin_voucher_audit_log WHERE voucher_id = ? ORDER BY created_at DESC LIMIT 100`).bind(voucherId).all();
    return Response.json({ ok: true, voucher: loaded.voucher, redemptions: redemptions.results ?? [], audit: (audit.results ?? []).map((row) => ({ ...row, before: row.before_snapshot ? JSON.parse(row.before_snapshot) : null, after: row.after_snapshot ? JSON.parse(row.after_snapshot) : null })) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPatch({ request, env, params }) {
  try {
    const admin = await requireAdmin(request, env);
    const voucherId = routeId(params);
    const loaded = await loadVoucher(env, voucherId);
    const body = await readJson(request);
    const voucher = normalizeVoucherDefinition(body, { partial: true, current: loaded.voucher, redemptionCount: loaded.redemptionCount });
    if (!voucher.name) throw new VoucherError('Voucher name is required.', 400, 'invalid_name');
    if (loaded.voucher.lifecycleStatus === 'revoked' && voucher.lifecycleStatus !== 'revoked') throw new VoucherError('Revoked vouchers cannot be reactivated.', 409, 'voucher_revoked');
    if (loaded.voucher.lifecycleStatus !== 'revoked' && voucher.lifecycleStatus === 'revoked') throw new VoucherError('Use the revoke action to permanently revoke a voucher.', 409, 'revoke_action_required');
    await assertTargetUsersExist(env, voucher.targetUserIds);
    const before = loaded.voucher;
    const timestamp = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`UPDATE vouchers SET code = ?, name = ?, description = ?, type = ?, total_points = ?, max_increase_per_stat = ?, max_increase_per_member = ?, allowed_stats = ?, allow_decrease = ?, allow_multiple_members = ?, max_redemptions = ?, max_redemptions_per_user = ?, target_user_ids = ?, lifecycle_status = ?, valid_from = ?, expires_at = ?, updated_at = ? WHERE voucher_id = ?`)
        .bind(voucher.code, voucher.name, voucher.description, voucher.type, voucher.totalPoints, voucher.maxIncreasePerStat, voucher.maxIncreasePerMember, JSON.stringify(voucher.allowedStats), voucher.allowDecrease ? 1 : 0, voucher.allowMultipleMembers ? 1 : 0, voucher.maxRedemptions, voucher.maxRedemptionsPerUser, JSON.stringify(voucher.targetUserIds), voucher.lifecycleStatus, voucher.validFrom, voucher.expiresAt, timestamp, voucherId),
      env.DB.prepare(`INSERT INTO admin_voucher_audit_log (audit_id, admin_user_id, action, voucher_id, before_snapshot, after_snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(`voucher-audit-${crypto.randomUUID()}`, admin.user_id, 'voucher_updated', voucherId, JSON.stringify(before), JSON.stringify({ ...voucher, voucherId }), timestamp),
    ]);
    return Response.json({ ok: true, voucher: (await loadVoucher(env, voucherId)).voucher });
  } catch (error) {
    return errorResponse(error);
  }
}
