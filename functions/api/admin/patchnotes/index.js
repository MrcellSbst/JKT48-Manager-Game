import {
  createPatchnoteId,
  normalizePatchnote,
  patchnoteErrorResponse,
  patchnoteJson,
  patchnoteToClient,
  readPatchnoteJson,
  requirePatchnoteAdmin,
} from '../../_patchnotes.js';

export async function onRequestGet({ request, env }) {
  try {
    await requirePatchnoteAdmin(request, env);
    const rows = await env.DB.prepare(`
      SELECT * FROM manager_patchnotes
      ORDER BY published_at DESC, updated_at DESC
      LIMIT 250
    `).all();
    return patchnoteJson({ ok: true, patchnotes: (rows.results ?? []).map(patchnoteToClient) });
  } catch (error) {
    return patchnoteErrorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const admin = await requirePatchnoteAdmin(request, env);
    const patchnote = normalizePatchnote(await readPatchnoteJson(request));
    const patchnoteId = createPatchnoteId();
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO manager_patchnotes (
        patchnote_id, version_label, title_en, title_id, body_en, body_id,
        lifecycle_status, published_at, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      patchnoteId, patchnote.versionLabel, patchnote.titleEn, patchnote.titleId,
      patchnote.bodyEn, patchnote.bodyId, patchnote.lifecycleStatus, patchnote.publishedAt,
      admin.user_id, admin.user_id, now, now,
    ).run();
    const row = await env.DB.prepare('SELECT * FROM manager_patchnotes WHERE patchnote_id = ?').bind(patchnoteId).first();
    return patchnoteJson({ ok: true, patchnote: patchnoteToClient(row) }, 201);
  } catch (error) {
    return patchnoteErrorResponse(error);
  }
}
