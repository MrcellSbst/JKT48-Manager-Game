import { getSessionUser } from '../_session.js';
import { buildV2Payload, decodeV2Sections, decryptText, normalizeV2Sections, parseEncryptedSnapshot, reconstructSnapshot, SAVE_FORMAT_CODEC, SAVE_FORMAT_VERSION, SAVE_SECTION_NAMES, snapshotsEquivalent } from '../_saveFormat.js';

const MAX_SAVE_LENGTH = 8_000_000;

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request body.' }, 400);

  if (Number(body.format) === SAVE_FORMAT_VERSION || body.sections) {
    try {
      const result = await writeV2({ env, user, body });
      return json(result);
    } catch (error) {
      if (error?.code && error.status) return json({ error: error.message, code: error.code }, error.status);
      return json({ error: error.message || 'Save data could not be stored.' }, /too large/i.test(error.message) ? 413 : 400);
    }
  }

  // Cached pre-v2 clients still send one encrypted blob. Convert it directly
  // into v2 without reading or recreating the retired cloud table.
  if (typeof body.save_data !== 'string' || body.save_data.length === 0) return json({ error: 'Encrypted save data is required.' }, 400);
  if (body.save_data.length > MAX_SAVE_LENGTH) return json({ error: 'Save data is too large.' }, 413);
  try {
    const snapshot = parseEncryptedSnapshot(body.save_data);
    const payload = await buildV2Payload(snapshot, { revision: 1 });
    const result = await writeV2({ env, user, body: { ...body, ...payload, format: 2, revision: undefined } });
    const stored = await env.DB.prepare('SELECT core, roster, operations, history, profile FROM jkt48_manager_data_v2 WHERE user_id = ?').bind(user.user_id).first();
    if (!snapshotsEquivalent(snapshot, reconstructSnapshot(await decodeV2Sections(stored)))) throw new Error('Legacy save conversion verification failed.');
    return json({ ...result, migrated: true, verified: true });
  } catch (error) {
    if (error?.code && error.status) return json({ error: error.message, code: error.code }, error.status);
    return json({ error: error.message || 'Legacy save conversion failed.' }, /too large/i.test(error.message) ? 413 : 400);
  }
}

export async function writeV2({ env, user, body }) {
  const source = body.sections && typeof body.sections === 'object' ? body.sections : {};
  const sections = normalizeV2Sections(source);
  const tooLarge = Object.values(sections).some((value) => value.length > MAX_SAVE_LENGTH);
  if (tooLarge) throw new Error('Save data is too large.');
  const existing = await env.DB.prepare('SELECT revision FROM jkt48_manager_data_v2 WHERE user_id = ?').bind(user.user_id).first();
  const currentRevision = Number(existing?.revision ?? 0);
  const expected = body.expectedRevision ?? body.expected_revision;
  if (expected !== undefined && Number(expected) !== currentRevision) {
    const error = new Error('The cloud save changed. Reload and try again.');
    error.status = 409; error.code = 'save_conflict'; throw error;
  }
  const revision = Number(body.revision ?? (currentRevision + 1)) || currentRevision + 1;
  const manifest = body.manifest && typeof body.manifest === 'object'
    ? { ...body.manifest, version: SAVE_FORMAT_VERSION, revision }
    : { version: SAVE_FORMAT_VERSION, codec: SAVE_FORMAT_CODEC, sectionNames: [...SAVE_SECTION_NAMES], revision, sections: {}, fullChecksum: null };
  // The browser already canonicalized, gzipped, and checksummed every section
  // before uploading, so verifying the upload only has to read the section
  // envelope. Decoding the snapshot here would re-gunzip, re-parse, and re-hash
  // the whole game state — twice per save — without covering a single byte the
  // per-section checksums do not already cover.
  for (const name of SAVE_SECTION_NAMES) {
    const encodedPayload = JSON.parse(decryptText(sections[name]));
    const expectedChecksum = manifest.sections?.[name]?.checksum;
    if (expectedChecksum && encodedPayload.checksum !== expectedChecksum) throw new Error(`Save section checksum failed: ${name}.`);
  }
  const values = [user.user_id, user.username, JSON.stringify(manifest), sections.core, sections.roster, sections.operations, sections.history, sections.profile, SAVE_FORMAT_VERSION, revision];
  const statements = [env.DB.prepare(`INSERT INTO jkt48_manager_data_v2
      (user_id, username, manifest, core, roster, operations, history, profile, format_version, revision, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, manifest = excluded.manifest,
      core = excluded.core, roster = excluded.roster, operations = excluded.operations, history = excluded.history,
      profile = excluded.profile, format_version = excluded.format_version, revision = excluded.revision,
      updated_at = datetime('now')`).bind(...values)];
  await env.DB.batch(statements);
  return { ok: true, format: SAVE_FORMAT_VERSION, revision, updated_at: new Date().toISOString() };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
