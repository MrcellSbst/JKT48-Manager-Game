import { errorResponse, requireAdmin } from '../../_voucher.js';

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    const url = new URL(request.url);
    const search = String(url.searchParams.get('search') ?? '').trim().toUpperCase();
    const status = String(url.searchParams.get('status') ?? '').trim().toLowerCase();
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(url.searchParams.get('pageSize') ?? 25) || 25));
    const rows = await env.DB.prepare(`SELECT vr.*, v.code, v.name, uh.username FROM voucher_redemptions vr JOIN vouchers v ON v.voucher_id = vr.voucher_id LEFT JOIN user_h uh ON uh.user_id = vr.user_id ORDER BY vr.redeemed_at DESC`).all();
    const filtered = (rows.results ?? []).filter((row) => (!status || row.status === status) && (!search || String(row.user_id).toUpperCase().includes(search) || String(row.username ?? '').toUpperCase().includes(search) || String(row.code).toUpperCase().includes(search)));
    const start = (page - 1) * pageSize;
    return Response.json({ ok: true, redemptions: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize });
  } catch (error) { return errorResponse(error); }
}
