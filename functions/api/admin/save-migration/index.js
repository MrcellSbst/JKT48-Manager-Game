import { requireAdmin, errorResponse, VoucherError } from '../../_voucher.js';
import { buildV2Payload, canonicalJson, checksum, decodeV2Sections, parseEncryptedSnapshot, reconstructSnapshot, snapshotsEquivalent } from '../../_saveFormat.js';

const DEFAULT_LIMIT = 25;

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    const [legacy, migrated] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS count FROM jkt48_manager_data').first(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM jkt48_manager_data_v2').first().catch(() => ({ count: 0 })),
    ]);
    const remaining = legacy;
    return Response.json({ ok: true, legacy: Number(legacy?.count ?? 0), migrated: Number(migrated?.count ?? 0), remaining: Number(remaining?.count ?? 0) });
  } catch (error) { return errorResponse(error); }
}

export async function onRequestPost({ request, env }) {
  try {
    await requireAdmin(request, env);
    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(100, Number(body.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT));
    const cursor = String(body.cursor ?? '');
    const commit = body.commit === true || body.dryRun === false;
    const rows = await env.DB.prepare(`SELECT l.user_id, l.username, l.save_data, l.updated_at
      FROM jkt48_manager_data l WHERE l.user_id > ? ORDER BY l.user_id ASC LIMIT ?`).bind(cursor, limit).all();
    const migrated = []; const verified = []; const alreadyMigrated = []; const failed = [];
    for (const row of rows.results ?? []) {
      try {
        const snapshot = parseEncryptedSnapshot(row.save_data);
        const existing = await env.DB.prepare('SELECT manifest, core, roster, operations, history, profile FROM jkt48_manager_data_v2 WHERE user_id = ?').bind(row.user_id).first().catch(() => null);
        let payload = null;
        const wasAlreadyMigrated = Boolean(existing?.manifest);
        if (existing?.manifest) {
          const manifest = JSON.parse(existing.manifest);
          const rebuilt = reconstructSnapshot(await decodeV2Sections(existing));
          if (manifest.fullChecksum && await checksum(canonicalJson(rebuilt)) !== manifest.fullChecksum) throw new Error('Existing v2 save checksum failed.');
        } else {
          payload = await buildV2Payload(snapshot, { revision: 1 });
          const rebuilt = reconstructSnapshot(await decodeV2Sections(payload.sections));
          if (!snapshotsEquivalent(snapshot, rebuilt)) throw new Error('Converted save verification failed.');
        }
        if (commit) {
          if (payload) await env.DB.prepare(`INSERT INTO jkt48_manager_data_v2 (user_id, username, manifest, core, roster, operations, history, profile, format_version, revision, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT(user_id) DO NOTHING`).bind(row.user_id, row.username, JSON.stringify(payload.manifest), payload.sections.core, payload.sections.roster, payload.sections.operations, payload.sections.history, payload.sections.profile, 2, 1).run();
          const stored = await env.DB.prepare('SELECT core, roster, operations, history, profile FROM jkt48_manager_data_v2 WHERE user_id = ?').bind(row.user_id).first();
          const rebuilt = reconstructSnapshot(await decodeV2Sections(stored));
          if (payload && !snapshotsEquivalent(snapshot, rebuilt)) throw new Error('Read-back verification failed.');
          await env.DB.prepare('DELETE FROM jkt48_manager_data WHERE user_id = ?').bind(row.user_id).run();
        }
        (wasAlreadyMigrated ? alreadyMigrated : migrated).push(String(row.user_id));
        verified.push(String(row.user_id));
      } catch (error) {
        failed.push({ userId: String(row.user_id), error: error.message || 'Migration failed.' });
      }
    }
    const nextCursor = rows.results?.length ? String(rows.results[rows.results.length - 1].user_id) : null;
    const remainingRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM jkt48_manager_data').first();
    return Response.json({ ok: true, dryRun: !commit, commit, migrated, verified, alreadyMigrated, failed, remaining: Number(remainingRow?.count ?? 0), processed: rows.results?.length ?? 0, nextCursor, hasMore: (rows.results?.length ?? 0) === limit });
  } catch (error) { return errorResponse(error); }
}
