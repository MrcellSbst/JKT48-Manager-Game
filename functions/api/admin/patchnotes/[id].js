import {
  loadPatchnote,
  normalizePatchnote,
  patchnoteErrorResponse,
  patchnoteJson,
  patchnoteRouteId,
  patchnoteToClient,
  readPatchnoteJson,
  requirePatchnoteAdmin,
} from '../../_patchnotes.js';

export async function onRequestPatch({ request, env, params }) {
  try {
    const admin = await requirePatchnoteAdmin(request, env);
    const patchnoteId = patchnoteRouteId(params);
    const current = await loadPatchnote(env, patchnoteId);
    const patchnote = normalizePatchnote(await readPatchnoteJson(request), current);
    const now = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE manager_patchnotes
      SET version_label = ?, title_en = ?, title_id = ?, body_en = ?, body_id = ?,
          lifecycle_status = ?, published_at = ?, updated_by = ?, updated_at = ?
      WHERE patchnote_id = ?
    `).bind(
      patchnote.versionLabel, patchnote.titleEn, patchnote.titleId, patchnote.bodyEn,
      patchnote.bodyId, patchnote.lifecycleStatus, patchnote.publishedAt,
      admin.user_id, now, patchnoteId,
    ).run();
    return patchnoteJson({ ok: true, patchnote: patchnoteToClient(await loadPatchnote(env, patchnoteId)) });
  } catch (error) {
    return patchnoteErrorResponse(error);
  }
}

export async function onRequestDelete({ request, env, params }) {
  try {
    await requirePatchnoteAdmin(request, env);
    const patchnoteId = patchnoteRouteId(params);
    await loadPatchnote(env, patchnoteId);
    await env.DB.prepare('DELETE FROM manager_patchnotes WHERE patchnote_id = ?').bind(patchnoteId).run();
    return patchnoteJson({ ok: true });
  } catch (error) {
    return patchnoteErrorResponse(error);
  }
}
