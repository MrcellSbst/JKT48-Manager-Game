import { patchnoteErrorResponse, patchnoteJson, patchnoteToClient } from '../_patchnotes.js';

const PUBLIC_PAGE_SIZE = 5;

function parsePage(request) {
  const value = Number(new URL(request.url).searchParams.get('page') ?? 1);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

function emptyResponse(page = 1) {
  return patchnoteJson({
    ok: true,
    patchnotes: [],
    page,
    pageSize: PUBLIC_PAGE_SIZE,
    totalPages: 0,
    total: 0,
  });
}

export async function onRequestGet({ request, env }) {
  const page = parsePage(request);
  const offset = (page - 1) * PUBLIC_PAGE_SIZE;
  const now = new Date().toISOString();

  try {
    const countRow = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM manager_patchnotes
      WHERE lifecycle_status = 'published' AND published_at <= ?
    `).bind(now).first();
    const total = Number(countRow?.count ?? 0);
    if (!total) return emptyResponse(page);

    const rows = await env.DB.prepare(`
      SELECT patchnote_id, version_label, title_en, title_id, body_en, body_id,
             lifecycle_status, published_at, created_at, updated_at
      FROM manager_patchnotes
      WHERE lifecycle_status = 'published' AND published_at <= ?
      ORDER BY published_at DESC, updated_at DESC, patchnote_id DESC
      LIMIT ? OFFSET ?
    `).bind(now, PUBLIC_PAGE_SIZE, offset).all();

    return patchnoteJson({
      ok: true,
      patchnotes: (rows.results ?? []).map(patchnoteToClient),
      page,
      pageSize: PUBLIC_PAGE_SIZE,
      totalPages: Math.ceil(total / PUBLIC_PAGE_SIZE),
      total,
    });
  } catch (error) {
    if (/no such table:\s*manager_patchnotes/i.test(String(error?.message ?? ''))) {
      return emptyResponse(page);
    }
    return patchnoteErrorResponse(error);
  }
}

