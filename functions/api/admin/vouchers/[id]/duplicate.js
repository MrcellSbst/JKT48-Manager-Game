import { buildVoucherInsert, EDITABLE_MEMBER_STATS, errorResponse, generateVoucherCode, normalizeVoucherDefinition, readJson, requireAdmin, VoucherError } from '../../../_voucher.js';
import { assertTargetUsersExist, loadVoucher, routeId } from '../../_voucher.js';

export async function onRequestPost({ request, env, params }) {
  try {
    const admin = await requireAdmin(request, env);
    const source = await loadVoucher(env, routeId(params));
    const body = await readJson(request);
    const allowedStats = (body.allowedStats ?? source.voucher.allowedStats ?? []).filter((stat) => EDITABLE_MEMBER_STATS.includes(String(stat).toLowerCase()));
    const voucher = normalizeVoucherDefinition({ ...source.voucher, ...body, allowedStats, voucherId: undefined, code: body.code || generateVoucherCode(source.voucher.code), lifecycleStatus: body.lifecycleStatus || 'draft' });
    if (voucher.lifecycleStatus === 'revoked') throw new VoucherError('Duplicated vouchers cannot start revoked.', 400, 'invalid_lifecycle');
    await assertTargetUsersExist(env, voucher.targetUserIds);
    const insert = buildVoucherInsert(voucher, admin.user_id);
    const voucherId = insert.bindings[0];
    const timestamp = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(insert.sql).bind(...insert.bindings),
      env.DB.prepare(`INSERT INTO admin_voucher_audit_log (audit_id, admin_user_id, action, voucher_id, before_snapshot, after_snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(`voucher-audit-${crypto.randomUUID()}`, admin.user_id, 'voucher_duplicated', voucherId, JSON.stringify(source.voucher), JSON.stringify({ ...voucher, voucherId }), timestamp),
    ]);
    return Response.json({ ok: true, voucher: (await loadVoucher(env, voucherId)).voucher }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
