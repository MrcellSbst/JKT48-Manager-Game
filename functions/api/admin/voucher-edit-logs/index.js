import { errorResponse, requireAdmin } from '../../_voucher.js';

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    const url = new URL(request.url);
    const search = String(url.searchParams.get('search') ?? '').trim().toUpperCase();
    const stat = String(url.searchParams.get('stat') ?? '').trim().toLowerCase();
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(url.searchParams.get('pageSize') ?? 25) || 25));
    const rows = await env.DB.prepare(`SELECT el.*, v.code, v.name, uh.username FROM voucher_edit_log el JOIN vouchers v ON v.voucher_id = el.voucher_id LEFT JOIN user_h uh ON uh.user_id = el.user_id ORDER BY el.created_at DESC`).all();
    const filtered = (rows.results ?? []).filter((row) => (!stat || row.stat === stat) && (!search || String(row.user_id).toUpperCase().includes(search) || String(row.username ?? '').toUpperCase().includes(search) || String(row.code).toUpperCase().includes(search) || String(row.member_id).toUpperCase().includes(search)));
    const start = (page - 1) * pageSize;
    return Response.json({ ok: true, logs: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize });
  } catch (error) { return errorResponse(error); }
}
