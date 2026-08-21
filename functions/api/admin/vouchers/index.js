import { buildVoucherInsert, errorResponse, generateVoucherCode, normalizeVoucherDefinition, readJson, requireAdmin, voucherToClient, VoucherError } from '../../_voucher.js';
import { assertTargetUsersExist, loadVoucher } from '../_voucher.js';

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    const url = new URL(request.url);
    const search = String(url.searchParams.get('search') ?? '').trim().toUpperCase();
    const status = String(url.searchParams.get('status') ?? '').trim().toLowerCase();
    const sortBy = ['created', 'expiry', 'redemptions', 'status', 'code', 'name'].includes(url.searchParams.get('sort')) ? url.searchParams.get('sort') : 'created';
    const direction = url.searchParams.get('direction') === 'asc' ? 1 : -1;
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(url.searchParams.get('pageSize') ?? 25) || 25));
    const rows = await env.DB.prepare(`SELECT v.*, (SELECT COUNT(*) FROM voucher_redemptions vr WHERE vr.voucher_id = v.voucher_id) AS redemption_count, (SELECT COALESCE(SUM(points_total), 0) FROM voucher_redemptions vr2 WHERE vr2.voucher_id = v.voucher_id) AS points_issued, (SELECT COALESCE(SUM(points_used), 0) FROM voucher_redemptions vr3 WHERE vr3.voucher_id = v.voucher_id) AS points_used FROM vouchers v ORDER BY v.created_at DESC`).all();
    const filtered = (rows.results ?? []).map((row) => voucherToClient(row, { redemptionCount: Number(row.redemption_count), pointsIssued: Number(row.points_issued), pointsUsed: Number(row.points_used) })).filter((voucher) => {
      const matchesSearch = !search || voucher.code.includes(search) || voucher.name.toUpperCase().includes(search);
      return matchesSearch && (!status || voucher.status === status);
    });
    const valueFor = (voucher) => sortBy === 'expiry' ? (voucher.expiresAt ? new Date(voucher.expiresAt).getTime() : Number.POSITIVE_INFINITY) : sortBy === 'redemptions' ? voucher.redemptionCount : sortBy === 'status' ? voucher.status : sortBy === 'code' ? voucher.code : sortBy === 'name' ? voucher.name.toUpperCase() : new Date(voucher.createdAt ?? 0).getTime();
    filtered.sort((left, right) => { const a = valueFor(left); const b = valueFor(right); return (a < b ? -1 : a > b ? 1 : left.voucherId.localeCompare(right.voucherId)) * direction; });
    const start = (page - 1) * pageSize;
    return Response.json({ ok: true, vouchers: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);
    const body = await readJson(request);
    if (!String(body.code ?? '').trim()) body.code = generateVoucherCode(body.codePrefix ?? 'JKT48');
    const voucher = normalizeVoucherDefinition(body);
    if (!voucher.name) throw new VoucherError('Voucher name is required.', 400, 'invalid_name');
    if (voucher.lifecycleStatus === 'revoked') throw new VoucherError('New vouchers cannot start revoked.', 400, 'invalid_lifecycle');
    await assertTargetUsersExist(env, voucher.targetUserIds);
    const insert = buildVoucherInsert(voucher, admin.user_id);
    const voucherId = insert.bindings[0];
    const after = { ...voucher, voucherId };
    await env.DB.batch([
      env.DB.prepare(insert.sql).bind(...insert.bindings),
      env.DB.prepare(`INSERT INTO admin_voucher_audit_log (audit_id, admin_user_id, action, voucher_id, before_snapshot, after_snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(`voucher-audit-${crypto.randomUUID()}`, admin.user_id, 'voucher_created', voucherId, null, JSON.stringify(after), new Date().toISOString()),
    ]);
    const loaded = await loadVoucher(env, voucherId);
    return Response.json({ ok: true, voucher: loaded.voucher }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
