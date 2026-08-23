import { patchnoteErrorResponse, patchnoteJson, patchnoteToClient } from '../_patchnotes.js';

export async function onRequestGet({ env }) {
  try {
    const now = new Date().toISOString();
    const row = await env.DB.prepare(`
      SELECT patchnote_id, version_label, title_en, title_id, body_en, body_id,
             lifecycle_status, published_at, created_at, updated_at
      FROM manager_patchnotes
      WHERE lifecycle_status = 'published' AND published_at <= ?
      ORDER BY published_at DESC, updated_at DESC
      LIMIT 1
    `).bind(now).first();
    return patchnoteJson({ ok: true, patchnote: patchnoteToClient(row) });
  } catch (error) {
    if (/no such table:\s*manager_patchnotes/i.test(String(error?.message ?? ''))) {
      return patchnoteJson({ ok: true, patchnote: null });
    }
    return patchnoteErrorResponse(error);
  }
}
