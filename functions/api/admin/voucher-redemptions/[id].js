import { errorResponse, requireAdmin, VoucherError } from '../../_voucher.js';

export async function onRequestGet({ request, env, params }) {
  try {
    await requireAdmin(request, env);
    const id = String(params?.id ?? '').trim();
    if (!id) throw new VoucherError('Redemption identifier is required.', 400, 'invalid_id');
    const redemption = await env.DB.prepare(`SELECT vr.*, v.code, v.name, v.description, uh.username FROM voucher_redemptions vr JOIN vouchers v ON v.voucher_id = vr.voucher_id LEFT JOIN user_h uh ON uh.user_id = vr.user_id WHERE vr.redemption_id = ?`).bind(id).first();
    if (!redemption) throw new VoucherError('Voucher redemption not found.', 404, 'redemption_not_found');
    const edits = await env.DB.prepare(`SELECT * FROM voucher_edit_log WHERE redemption_id = ? ORDER BY created_at DESC`).bind(id).all();
    const audit = await env.DB.prepare(`SELECT * FROM admin_voucher_audit_log WHERE redemption_id = ? ORDER BY created_at DESC`).bind(id).all();
    return Response.json({ ok: true, redemption, edits: edits.results ?? [], audit: audit.results ?? [] });
  } catch (error) { return errorResponse(error); }
}
