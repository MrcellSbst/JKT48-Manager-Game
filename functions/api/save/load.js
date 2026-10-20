import { getSessionUser } from '../_session.js';
import { decodeV2Sections, encryptText, reconstructSnapshot } from '../_saveFormat.js';

const V2_COLUMNS = ['manifest', 'core', 'roster', 'operations', 'history', 'profile', 'format_version', 'revision', 'updated_at'];

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated.' }, 401);
  const wantsV2 = new URL(request.url).searchParams.get('format') === '2';

  const v2 = await env.DB.prepare(`SELECT ${V2_COLUMNS.join(', ')} FROM jkt48_manager_data_v2 WHERE user_id = ?`).bind(user.user_id).first();
  if (v2?.manifest) {
    if (!wantsV2) {
      const snapshot = reconstructSnapshot(await decodeV2Sections(v2));
      return json({ exists: true, data: { save_data: encryptText(JSON.stringify(snapshot)), updated_at: v2.updated_at } });
    }
    return json({
      exists: true,
      format: 2,
      revision: Number(v2.revision ?? 1),
      manifest: parseJson(v2.manifest, v2.manifest),
      sections: Object.fromEntries(['core', 'roster', 'operations', 'history', 'profile'].map((name) => [name, v2[name]])),
      updated_at: v2.updated_at,
    });
  }

  if (v2) throw new Error('Cloud save manifest is missing.');
  return json({ exists: false }, 404);
}

function parseJson(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
