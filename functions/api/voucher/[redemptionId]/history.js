import { errorResponse, requireUser, VoucherError } from '../../_voucher.js';

export async function onRequestGet({ request, env, params }) {
  try {
    const user = await requireUser(request, env);
    const redemptionId = String(params.redemptionId ?? '').trim();
    const owned = await env.DB.prepare('SELECT redemption_id FROM voucher_redemptions WHERE redemption_id = ? AND user_id = ?').bind(redemptionId, user.user_id).first();
    if (!owned) throw new VoucherError('Voucher redemption not found.', 404, 'redemption_not_found');
    const result = await env.DB.prepare(`SELECT edit_id, redemption_id, voucher_id, member_id, stat, base_value_at_edit, voucher_adjustment_before, voucher_adjustment_after, display_value_before, display_value_after, delta, points_used, created_at FROM voucher_edit_log WHERE redemption_id = ? AND user_id = ? ORDER BY created_at DESC`).bind(redemptionId, user.user_id).all();
    return new Response(JSON.stringify({ ok: true, history: (result.results ?? []).map((row) => ({ editId: row.edit_id, redemptionId: row.redemption_id, voucherId: row.voucher_id, memberId: row.member_id, stat: row.stat, baseValueAtEdit: Number(row.base_value_at_edit), voucherAdjustmentBefore: Number(row.voucher_adjustment_before), voucherAdjustmentAfter: Number(row.voucher_adjustment_after), displayValueBefore: Number(row.display_value_before), displayValueAfter: Number(row.display_value_after), delta: Number(row.delta), pointsUsed: Number(row.points_used), createdAt: row.created_at })) }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
