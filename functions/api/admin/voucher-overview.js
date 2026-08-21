import { errorResponse, requireAdmin } from '../_voucher.js';

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    const [totals, recentRedemptions, recentEdits] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS total_vouchers, SUM(CASE WHEN lifecycle_status = 'active' AND (expires_at IS NULL OR expires_at > datetime('now')) AND (max_redemptions IS NULL OR (SELECT COUNT(*) FROM voucher_redemptions vr_active WHERE vr_active.voucher_id = vouchers.voucher_id) < max_redemptions) THEN 1 ELSE 0 END) AS active_vouchers, (SELECT COUNT(*) FROM voucher_redemptions) AS total_redemptions, (SELECT COALESCE(SUM(points_total), 0) FROM voucher_redemptions) AS points_issued, (SELECT COALESCE(SUM(points_used), 0) FROM voucher_redemptions) AS points_used FROM vouchers`).first(),
      env.DB.prepare(`SELECT vr.redemption_id, vr.user_id, uh.username, vr.points_total, vr.points_used, vr.redeemed_at, v.voucher_id, v.code, v.name FROM voucher_redemptions vr JOIN vouchers v ON v.voucher_id = vr.voucher_id LEFT JOIN user_h uh ON uh.user_id = vr.user_id ORDER BY vr.redeemed_at DESC LIMIT 10`).all(),
      env.DB.prepare(`SELECT el.edit_id, el.voucher_id, el.redemption_id, el.user_id, el.member_id, el.stat, el.delta, el.points_used, el.created_at, v.code FROM voucher_edit_log el JOIN vouchers v ON v.voucher_id = el.voucher_id ORDER BY el.created_at DESC LIMIT 10`).all(),
    ]);
    return Response.json({ ok: true, totals: {
      totalVouchers: Number(totals?.total_vouchers ?? 0), activeVouchers: Number(totals?.active_vouchers ?? 0), totalRedemptions: Number(totals?.total_redemptions ?? 0), pointsIssued: Number(totals?.points_issued ?? 0), pointsUsed: Number(totals?.points_used ?? 0),
    }, recentRedemptions: recentRedemptions.results ?? [], recentEdits: recentEdits.results ?? [] });
  } catch (error) { return errorResponse(error); }
}
