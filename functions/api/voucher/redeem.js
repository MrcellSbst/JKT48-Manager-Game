import { createId, errorResponse, normalizeVoucherCode, parseJson, redemptionToClient, requireUser, VoucherError, voucherStatus, voucherToClient } from '../_voucher.js';

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    const parsedBody = await request.json().catch(() => { throw new VoucherError('Invalid request body.', 400, 'invalid_request'); });
    const body = parsedBody && typeof parsedBody === 'object' ? parsedBody : {};
    const code = normalizeVoucherCode(body.code);
    const result = await env.DB.prepare(`
      SELECT v.*, (SELECT COUNT(*) FROM voucher_redemptions vr WHERE vr.voucher_id = v.voucher_id) AS redemption_count
      FROM vouchers v WHERE v.code = ?`).bind(code).first();
    if (!result) throw new VoucherError('Invalid voucher code.', 404, 'invalid_code');
    const voucher = voucherToClient(result, { redemptionCount: Number(result.redemption_count) });
    const status = voucherStatus(result, Number(result.redemption_count));
    if (status !== 'active') {
      const messages = { draft: 'Voucher is not active.', paused: 'Voucher is paused.', revoked: 'Voucher has been revoked.', expired: 'Voucher has expired.', exhausted: 'Voucher redemption limit reached.' };
      throw new VoucherError(messages[status] ?? 'Voucher is not active.', 409, `voucher_${status}`);
    }
    const now = new Date();
    if (result.valid_from && new Date(result.valid_from) > now) throw new VoucherError('Voucher is not valid yet.', 409, 'voucher_future');
    const targetUserIds = parseJson(result.target_user_ids, []);
    if (targetUserIds.length && !targetUserIds.includes(String(user.user_id))) throw new VoucherError('This voucher is assigned to another account.', 403, 'voucher_targeted');
    const userCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM voucher_redemptions WHERE voucher_id = ? AND user_id = ?').bind(result.voucher_id, user.user_id).first();
    if (result.max_redemptions_per_user !== null && Number(userCount?.count ?? 0) >= Number(result.max_redemptions_per_user)) throw new VoucherError('Your redemption limit for this voucher has been reached.', 409, 'user_redemption_limit');
    if (result.max_redemptions !== null && Number(result.redemption_count ?? 0) >= Number(result.max_redemptions)) throw new VoucherError('Voucher redemption limit reached.', 409, 'redemption_limit');
    const redemption = { id: createId('redemption'), now: now.toISOString() };
    const inserted = await env.DB.prepare(`
      INSERT INTO voucher_redemptions (redemption_id, voucher_id, user_id, points_total, points_used, status, redeemed_at, updated_at)
      SELECT ?, v.voucher_id, ?, v.total_points, 0, 'active', ?, ?
      FROM vouchers v
      WHERE v.voucher_id = ?
        AND v.lifecycle_status = 'active'
        AND (v.valid_from IS NULL OR v.valid_from <= ?)
        AND (v.expires_at IS NULL OR v.expires_at > ?)
        AND (v.max_redemptions IS NULL OR (SELECT COUNT(*) FROM voucher_redemptions current_vr WHERE current_vr.voucher_id = v.voucher_id) < v.max_redemptions)
        AND (v.max_redemptions_per_user IS NULL OR (SELECT COUNT(*) FROM voucher_redemptions current_user_vr WHERE current_user_vr.voucher_id = v.voucher_id AND current_user_vr.user_id = ?) < v.max_redemptions_per_user)`)
      .bind(redemption.id, user.user_id, redemption.now, redemption.now, result.voucher_id, redemption.now, redemption.now, user.user_id).run();
    if ((inserted?.meta?.changes ?? 0) !== 1) {
      const latest = await env.DB.prepare('SELECT COUNT(*) AS count FROM voucher_redemptions WHERE voucher_id = ? AND user_id = ?').bind(result.voucher_id, user.user_id).first();
      if (result.max_redemptions_per_user !== null && Number(latest?.count ?? 0) >= Number(result.max_redemptions_per_user)) throw new VoucherError('Your redemption limit for this voucher has been reached.', 409, 'user_redemption_limit');
      throw new VoucherError('Voucher redemption limit reached.', 409, 'redemption_limit');
    }
    return new Response(JSON.stringify({ ok: true, redemption: redemptionToClient({ redemption_id: redemption.id, voucher_id: result.voucher_id, user_id: user.user_id, points_total: result.total_points, points_used: 0, status: 'active', redeemed_at: redemption.now, updated_at: redemption.now }, voucher, []) }), { status: 201, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
