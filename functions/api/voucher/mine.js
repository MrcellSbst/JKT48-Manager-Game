import { EDITABLE_MEMBER_STATS, errorResponse, redemptionToClient, requireUser, voucherStatus, voucherToClient } from '../_voucher.js';

export async function onRequestGet({ request, env }) {
  try {
    const user = await requireUser(request, env);
    const result = await env.DB.prepare(`
      SELECT vr.redemption_id, vr.voucher_id, vr.user_id, vr.points_total, vr.points_used, vr.status AS redemption_status, vr.redeemed_at, vr.updated_at,
             v.code, v.name, v.description, v.type, v.total_points, v.max_increase_per_stat, v.max_increase_per_member,
             v.allowed_stats, v.allow_decrease, v.allow_multiple_members, v.max_redemptions, v.max_redemptions_per_user,
             v.target_user_ids, v.lifecycle_status, v.valid_from, v.expires_at, v.created_at, v.updated_at AS voucher_updated_at,
             (SELECT COUNT(*) FROM voucher_redemptions all_vr WHERE all_vr.voucher_id = v.voucher_id) AS redemption_count
      FROM voucher_redemptions vr JOIN vouchers v ON v.voucher_id = vr.voucher_id
      WHERE vr.user_id = ? ORDER BY vr.redeemed_at DESC`).bind(user.user_id).all();
    const redemptions = await Promise.all((result.results ?? []).map(async (row) => {
      const voucherRow = { ...row, updated_at: row.voucher_updated_at };
      const voucher = voucherToClient(voucherRow, { redemptionCount: Number(row.redemption_count) });
      const usageResult = await env.DB.prepare(`SELECT member_id, stat, SUM(ABS(delta)) AS points_used, SUM(delta) AS delta FROM voucher_edit_log WHERE redemption_id = ? GROUP BY member_id, stat`).bind(row.redemption_id).all();
      const usage = (usageResult.results ?? []).map((item) => ({ memberId: item.member_id, stat: item.stat, pointsUsed: Number(item.points_used ?? 0), delta: Number(item.delta ?? 0) }));
      return redemptionToClient({ ...row, status: row.redemption_status }, { ...voucher, status: voucherStatus(voucherRow, Number(row.redemption_count)) }, usage);
    }));
    return new Response(JSON.stringify({ ok: true, stats: EDITABLE_MEMBER_STATS, redemptions }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
