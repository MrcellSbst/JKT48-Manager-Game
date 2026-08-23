import { getSessionUser } from './_session.js';

export const PATCHNOTE_STATUSES = Object.freeze(['draft', 'published']);

export class PatchnoteError extends Error {
  constructor(message, status = 400, code = 'patchnote_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function patchnoteJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function patchnoteErrorResponse(error) {
  const message = String(error?.message ?? '');
  const normalized = error instanceof PatchnoteError
    ? error
    : /no such table:\s*manager_patchnotes/i.test(message)
      ? new PatchnoteError('Patchnotes database is not initialized.', 503, 'patchnotes_not_initialized')
      : new PatchnoteError('Patchnotes service unavailable.', 500, 'internal_error');
  return patchnoteJson({ error: normalized.message, code: normalized.code }, normalized.status);
}

export async function readPatchnoteJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    throw new PatchnoteError('Invalid request body.', 400, 'invalid_request');
  }
}

export async function requirePatchnoteAdmin(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) throw new PatchnoteError('Sign in to manage patchnotes.', 401, 'not_authenticated');
  if (String(user.user_id) !== '1') throw new PatchnoteError('Administrator access is required.', 403, 'admin_required');
  return user;
}

export function parseJakartaDateTime(value, fieldName = 'Publish date') {
  const raw = String(value ?? '').trim();
  if (!raw) throw new PatchnoteError(`${fieldName} is required.`, 400, 'invalid_date');
  const hasExplicitTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const jakartaValue = hasExplicitTimeZone
    ? raw
    : /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T00:00:00+07:00`
      : `${raw}+07:00`;
  const date = new Date(jakartaValue);
  if (Number.isNaN(date.getTime())) throw new PatchnoteError(`${fieldName} is invalid.`, 400, 'invalid_date');
  return date.toISOString();
}

const cleanText = (value, maximum) => String(value ?? '').trim().slice(0, maximum);

export function patchnoteToClient(row) {
  if (!row) return null;
  return {
    patchnoteId: row.patchnote_id ?? row.patchnoteId,
    versionLabel: row.version_label ?? row.versionLabel ?? '',
    titleEn: row.title_en ?? row.titleEn ?? '',
    titleId: row.title_id ?? row.titleId ?? '',
    bodyEn: row.body_en ?? row.bodyEn ?? '',
    bodyId: row.body_id ?? row.bodyId ?? '',
    lifecycleStatus: row.lifecycle_status ?? row.lifecycleStatus ?? 'draft',
    publishedAt: row.published_at ?? row.publishedAt,
    createdBy: row.created_by ?? row.createdBy ?? null,
    updatedBy: row.updated_by ?? row.updatedBy ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

export function normalizePatchnote(input, current = null) {
  const source = current ? { ...patchnoteToClient(current), ...input } : input;
  const titleEn = cleanText(source.titleEn, 160);
  const bodyEn = cleanText(source.bodyEn, 20_000);
  const lifecycleStatus = cleanText(source.lifecycleStatus || 'draft', 20).toLowerCase();
  if (!titleEn) throw new PatchnoteError('English title is required.', 400, 'invalid_title');
  if (!bodyEn) throw new PatchnoteError('English patchnote content is required.', 400, 'invalid_body');
  if (!PATCHNOTE_STATUSES.includes(lifecycleStatus)) throw new PatchnoteError('Patchnote status is invalid.', 400, 'invalid_lifecycle');
  return {
    versionLabel: cleanText(source.versionLabel, 40),
    titleEn,
    titleId: cleanText(source.titleId, 160),
    bodyEn,
    bodyId: cleanText(source.bodyId, 20_000),
    lifecycleStatus,
    publishedAt: parseJakartaDateTime(source.publishedAt),
  };
}

export function createPatchnoteId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `patchnote-${uuid}`;
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `patchnote-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function patchnoteRouteId(params) {
  const value = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const id = String(value ?? '').trim();
  if (!id) throw new PatchnoteError('Patchnote was not found.', 404, 'patchnote_not_found');
  return id;
}

export async function loadPatchnote(env, patchnoteId) {
  const row = await env.DB.prepare('SELECT * FROM manager_patchnotes WHERE patchnote_id = ?').bind(patchnoteId).first();
  if (!row) throw new PatchnoteError('Patchnote was not found.', 404, 'patchnote_not_found');
  return row;
}
