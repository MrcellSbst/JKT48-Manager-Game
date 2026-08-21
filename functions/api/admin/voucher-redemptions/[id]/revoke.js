import { errorResponse, requireAdmin, VoucherError } from '../../../_voucher.js';

export async function onRequestPost({ request, env, params }) {
  try {
    const admin = await requireAdmin(request, env);
    const id = String(params?.id ?? '').trim();
    if (!id) throw new VoucherError('Redemption identifier is required.', 400, 'invalid_id');
    const current = await env.DB.prepare('SELECT * FROM voucher_redemptions WHERE redemption_id = ?').bind(id).first();
    if (!current) throw new VoucherError('Voucher redemption not found.', 404, 'redemption_not_found');
    const timestamp = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE voucher_redemptions SET status = 'revoked', updated_at = ? WHERE redemption_id = ?").bind(timestamp, id),
      env.DB.prepare(`INSERT INTO admin_voucher_audit_log (audit_id, admin_user_id, action, voucher_id, redemption_id, before_snapshot, after_snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(`voucher-audit-${crypto.randomUUID()}`, admin.user_id, 'redemption_revoked', current.voucher_id, id, JSON.stringify(current), JSON.stringify({ ...current, status: 'revoked', updated_at: timestamp }), timestamp),
    ]);
    return Response.json({ ok: true, redemption: { ...current, status: 'revoked', updated_at: timestamp } });
  } catch (error) { return errorResponse(error); }
}
