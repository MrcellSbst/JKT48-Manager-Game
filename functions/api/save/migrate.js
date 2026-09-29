import { getSessionUser } from '../_session.js';
import { canonicalJson, checksum, decodeV2Sections, parseEncryptedSnapshot, reconstructSnapshot, snapshotsEquivalent, SAVE_FORMAT_VERSION } from '../_saveFormat.js';
import { writeV2 } from './push.js';

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid migration request.' }, 400); }

  const legacy = await env.DB.prepare('SELECT save_data, updated_at FROM jkt48_manager_data WHERE user_id = ?').bind(user.user_id).first();
  const existingV2 = await env.DB.prepare('SELECT manifest, core, roster, operations, history, profile, revision FROM jkt48_manager_data_v2 WHERE user_id = ?').bind(user.user_id).first().catch(() => null);
  if (existingV2?.manifest) {
    try {
      const manifest = JSON.parse(existingV2.manifest);
      const rebuilt = reconstructSnapshot(await decodeV2Sections(existingV2));
      if (manifest.fullChecksum && await checksum(canonicalJson(rebuilt)) !== manifest.fullChecksum) throw new Error('Existing v2 save checksum failed.');
      if (legacy?.save_data) await env.DB.prepare('DELETE FROM jkt48_manager_data WHERE user_id = ?').bind(user.user_id).run();
      return json({ ok: true, format: SAVE_FORMAT_VERSION, migrated: false, alreadyMigrated: true, verified: true, legacyDeleted: Boolean(legacy?.save_data), revision: Number(existingV2.revision ?? 1) });
    } catch (error) { return json({ error: error.message, code: 'migration_failed' }, 409); }
  }
  if (!legacy?.save_data) return json({ error: 'No legacy save exists for migration.' }, 404);

  try {
    const sourceSnapshot = parseEncryptedSnapshot(legacy.save_data);
    const sections = await decodeV2Sections(body.sections ?? body);
    const migratedSnapshot = reconstructSnapshot(sections);
    if (!snapshotsEquivalent(sourceSnapshot, migratedSnapshot)) return json({ error: 'Migration verification failed: the converted save does not match the legacy save.', code: 'migration_mismatch' }, 409);
    // One-way conversion of the only remaining recovery copy, so this is the one
    // path that still pays for a full-snapshot re-derivation before writing.
    const result = await writeV2({ env, user, body, deleteLegacy: true, verifyFullChecksum: true });
    return json({ ...result, migrated: true, legacyDeleted: true, verified: true });
  } catch (error) {
    return json({ error: error.message || 'Migration verification failed.', code: 'migration_failed' }, 409);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
