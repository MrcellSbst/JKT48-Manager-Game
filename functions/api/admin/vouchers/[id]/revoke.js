import { errorResponse, requireAdmin, VoucherError } from '../../../_voucher.js';
import { loadVoucher, routeId } from '../../_voucher.js';

export async function onRequestPost({ request, env, params }) {
  try {
    const admin = await requireAdmin(request, env);
    const voucherId = routeId(params);
    const loaded = await loadVoucher(env, voucherId);
    if (loaded.voucher.lifecycleStatus === 'revoked') throw new VoucherError('Voucher is already revoked.', 409, 'voucher_revoked');
    const timestamp = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('UPDATE vouchers SET lifecycle_status = \'revoked\', revoked_at = ?, revoked_by = ?, updated_at = ? WHERE voucher_id = ?').bind(timestamp, admin.user_id, timestamp, voucherId),
      env.DB.prepare(`INSERT INTO admin_voucher_audit_log (audit_id, admin_user_id, action, voucher_id, before_snapshot, after_snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(`voucher-audit-${crypto.randomUUID()}`, admin.user_id, 'voucher_revoked', voucherId, JSON.stringify(loaded.voucher), JSON.stringify({ ...loaded.voucher, lifecycleStatus: 'revoked', revokedAt: timestamp, revokedBy: admin.user_id }), timestamp),
    ]);
    return Response.json({ ok: true, voucher: (await loadVoucher(env, voucherId)).voucher });
  } catch (error) { return errorResponse(error); }
}
