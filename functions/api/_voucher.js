import { getSessionUser } from './_session.js';
import { decodeV2Sections, reconstructSnapshot } from './_saveFormat.js';

export const VOUCHER_TYPE = 'member-stat-editor';
export const EDITABLE_MEMBER_STATS = Object.freeze([
  'vocal', 'dance', 'performance', 'mc', 'variety', 'stamina', 'popularity', 'ego',
]);
export const CORE_PERMISSION_FIELDS = Object.freeze([
  'totalPoints', 'maxIncreasePerStat', 'maxIncreasePerMember', 'allowedStats', 'allowDecrease', 'allowMultipleMembers',
]);

const CODE_PATTERN = /^[A-Z0-9_-]{3,64}$/;
const SAVE_KEY = 'JKT48ManagerSaveKey48';
const SAVE_KEY_BYTES = new TextEncoder().encode(SAVE_KEY);

// Legacy save blobs are whole snapshots, so base64 conversion is a multi-
// megabyte string build. Chunked conversion avoids reallocating the string on
// every character the way per-byte concatenation does.
const BINARY_CHUNK = 8192;

function toBinaryString(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += BINARY_CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + BINARY_CHUNK));
  }
  return binary;
}

function fromBinaryString(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    throw new VoucherError('Invalid request body.', 400, 'invalid_request');
  }
}

export class VoucherError extends Error {
  constructor(message, status = 400, code = 'voucher_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorResponse(error) {
  const normalized = error instanceof VoucherError
    ? error
    : /unique constraint failed:\s*vouchers\.code/i.test(String(error?.message ?? ''))
      ? new VoucherError('Voucher code already exists.', 409, 'duplicate_code')
      : new VoucherError('Voucher service unavailable.', 500, 'internal_error');
  return json({ error: normalized.message, code: normalized.code }, normalized.status);
}

export async function requireUser(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) throw new VoucherError('Sign in with an account to use vouchers.', 401, 'not_authenticated');
  return user;
}

export async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (String(user.user_id) !== '1') throw new VoucherError('Administrator access is required.', 403, 'admin_required');
  return user;
}

export function normalizeVoucherCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) throw new VoucherError('Voucher code must use 3-64 letters, numbers, hyphens, or underscores.', 400, 'invalid_code');
  return code;
}

export function parseNullableLimit(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new VoucherError(`${fieldName} must be a positive whole number or unlimited.`, 400, 'invalid_limit');
  return parsed;
}

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

export function parseDate(value, fieldName, { allowNull = true } = {}) {
  if (value === null || value === undefined || value === '') {
    if (allowNull) return null;
    throw new VoucherError(`${fieldName} is required.`, 400, 'invalid_date');
  }
  const raw = String(value).trim();
  // The admin form uses datetime-local, whose value has no timezone. Voucher
  // schedules are authored in Jakarta time, so make that zone explicit before
  // normalizing the value stored in D1 as UTC ISO.
  const hasExplicitTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const jakartaValue = hasExplicitTimeZone
    ? raw
    : /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T00:00:00+07:00`
      : `${raw}+07:00`;
  const date = new Date(jakartaValue);
  if (Number.isNaN(date.getTime())) throw new VoucherError(`${fieldName} is invalid.`, 400, 'invalid_date');
  return date.toISOString();
}

export function normalizeTargetUserIds(value) {
  if (value === null || value === undefined || value === '') return [];
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

export function normalizeAllowedStats(value) {
  const stats = Array.isArray(value) ? [...new Set(value.map((item) => String(item ?? '').trim().toLowerCase()))] : [];
  if (!stats.length) throw new VoucherError('Choose at least one editable stat.', 400, 'invalid_allowed_stats');
  if (stats.some((stat) => !EDITABLE_MEMBER_STATS.includes(stat))) throw new VoucherError('The voucher includes an unsupported stat.', 400, 'invalid_allowed_stats');
  return stats;
}

export function normalizeVoucherDefinition(input, { partial = false, current = null, redemptionCount = 0 } = {}) {
  const inheritedAllowedStats = current && input.allowedStats === undefined
    ? (current.allowedStats ?? []).filter((stat) => EDITABLE_MEMBER_STATS.includes(String(stat).toLowerCase()))
    : input.allowedStats;
  const source = current ? { ...voucherToClient(current), ...input, allowedStats: inheritedAllowedStats } : input;
  const code = input.code === undefined && current ? current.code : normalizeVoucherCode(source.code);
  const type = String(source.type ?? VOUCHER_TYPE);
  if (type !== VOUCHER_TYPE) throw new VoucherError('This voucher type is not supported.', 400, 'invalid_type');
  const totalPoints = Number(source.totalPoints);
  const maxIncreasePerStat = Number(source.maxIncreasePerStat);
  const maxIncreasePerMember = Number(source.maxIncreasePerMember);
  if (!Number.isInteger(totalPoints) || totalPoints < 1) throw new VoucherError('Total points must be at least 1.', 400, 'invalid_points');
  if (!Number.isInteger(maxIncreasePerStat) || maxIncreasePerStat < 0 || maxIncreasePerStat > totalPoints) throw new VoucherError('Maximum increase per stat must be between 0 and total points.', 400, 'invalid_points');
  if (!Number.isInteger(maxIncreasePerMember) || maxIncreasePerMember < 0 || maxIncreasePerMember > totalPoints) throw new VoucherError('Maximum increase per member must be between 0 and total points.', 400, 'invalid_points');
  const allowedStats = normalizeAllowedStats(source.allowedStats);
  const maxRedemptions = parseNullableLimit(source.maxRedemptions, 'Maximum redemptions');
  const maxRedemptionsPerUser = parseNullableLimit(source.maxRedemptionsPerUser, 'Maximum redemptions per user');
  if (maxRedemptions !== null && maxRedemptions < redemptionCount) throw new VoucherError('Maximum redemptions cannot be lower than current usage.', 400, 'invalid_limit');
  const validFrom = parseDate(source.validFrom, 'Valid from');
  const expiresAt = parseDate(source.expiresAt, 'Expires at');
  if (validFrom && expiresAt && new Date(expiresAt) <= new Date(validFrom)) throw new VoucherError('Expires at must be later than valid from.', 400, 'invalid_date_range');
  const targetUserIds = normalizeTargetUserIds(source.targetUserIds);
  const lifecycleStatus = source.lifecycleStatus === undefined || source.lifecycleStatus === null || source.lifecycleStatus === '' ? 'draft' : String(source.lifecycleStatus).toLowerCase();
  if (!['draft', 'active', 'paused', 'revoked'].includes(lifecycleStatus)) throw new VoucherError('This voucher lifecycle is not supported.', 400, 'invalid_lifecycle');
  const normalized = {
    code,
    name: String(source.name ?? '').trim().slice(0, 120),
    description: String(source.description ?? '').trim().slice(0, 500),
    type,
    totalPoints,
    maxIncreasePerStat,
    maxIncreasePerMember,
    allowedStats,
    allowDecrease: parseBoolean(source.allowDecrease, false),
    allowMultipleMembers: parseBoolean(source.allowMultipleMembers, true),
    maxRedemptions,
    maxRedemptionsPerUser,
    targetUserIds,
    lifecycleStatus,
    validFrom,
    expiresAt,
  };
  if (partial && current && redemptionCount > 0) {
    const sameList = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
    const currentAllowedStats = [...new Set((current.allowedStats ?? []).map((stat) => String(stat).trim().toLowerCase()).filter((stat) => EDITABLE_MEMBER_STATS.includes(stat)))];
    const lockedValues = {
      totalPoints: Number(current.totalPoints),
      maxIncreasePerStat: Number(current.maxIncreasePerStat),
      maxIncreasePerMember: Number(current.maxIncreasePerMember),
      allowedStats: currentAllowedStats,
      allowDecrease: Boolean(current.allowDecrease),
      allowMultipleMembers: Boolean(current.allowMultipleMembers),
    };
    const changed = CORE_PERMISSION_FIELDS.some((field) => input[field] !== undefined && (
      field === 'allowedStats' ? !sameList(normalized[field], lockedValues[field]) : normalized[field] !== lockedValues[field]
    ));
    if (changed) throw new VoucherError('Permission settings are locked after the first redemption.', 409, 'permissions_locked');
    if (input.code !== undefined && normalizeVoucherCode(input.code) !== current.code) {
      throw new VoucherError('Voucher codes cannot change after redemption begins.', 409, 'code_locked');
    }
  }
  return normalized;
}

export function createId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function generateVoucherCode(prefix = 'JKT48') {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const token = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `${String(prefix).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12) || 'JKT48'}-${token.slice(0, 4)}-${token.slice(4)}`;
}

export function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export function voucherStatus(row, redemptionCount = row.redemptionCount ?? 0, now = new Date()) {
  const lifecycle = row.lifecycle_status ?? row.lifecycleStatus ?? 'draft';
  const expiresAt = row.expires_at ?? row.expiresAt;
  const maxRedemptions = row.max_redemptions ?? row.maxRedemptions;
  if (lifecycle === 'revoked') return 'revoked';
  if (expiresAt && new Date(expiresAt) <= now) return 'expired';
  if (maxRedemptions !== null && maxRedemptions !== undefined && redemptionCount >= maxRedemptions) return 'exhausted';
  return lifecycle;
}

export function voucherToClient(row, metrics = {}) {
  const redemptionCount = Number(metrics.redemptionCount ?? row.redemptionCount ?? 0);
  return {
    voucherId: row.voucher_id ?? row.voucherId,
    code: row.code,
    name: row.name,
    description: row.description ?? '',
    type: row.type ?? VOUCHER_TYPE,
    totalPoints: Number(row.total_points ?? row.totalPoints ?? 0),
    maxIncreasePerStat: Number(row.max_increase_per_stat ?? row.maxIncreasePerStat ?? 0),
    maxIncreasePerMember: Number(row.max_increase_per_member ?? row.maxIncreasePerMember ?? 0),
    allowedStats: parseJson(row.allowed_stats ?? row.allowedStats, row.allowedStats ?? []),
    allowDecrease: Boolean(row.allow_decrease ?? row.allowDecrease),
    allowMultipleMembers: Boolean(row.allow_multiple_members ?? row.allowMultipleMembers),
    maxRedemptions: row.max_redemptions ?? row.maxRedemptions ?? null,
    maxRedemptionsPerUser: row.max_redemptions_per_user ?? row.maxRedemptionsPerUser ?? null,
    targetUserIds: parseJson(row.target_user_ids ?? row.targetUserIds, row.targetUserIds ?? []),
    lifecycleStatus: row.lifecycle_status ?? row.lifecycleStatus ?? 'draft',
    status: voucherStatus(row, redemptionCount),
    validFrom: row.valid_from ?? row.validFrom ?? null,
    expiresAt: row.expires_at ?? row.expiresAt ?? null,
    createdBy: row.created_by ?? row.createdBy ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    revokedAt: row.revoked_at ?? row.revokedAt ?? null,
    redemptionCount,
    pointsIssued: Number(metrics.pointsIssued ?? row.pointsIssued ?? redemptionCount * Number(row.total_points ?? 0)),
    pointsUsed: Number(metrics.pointsUsed ?? row.pointsUsed ?? 0),
  };
}

export function redemptionToClient(row, voucher = null, usage = []) {
  const pointsTotal = Number(row.points_total ?? row.pointsTotal ?? 0);
  const pointsUsed = Number(row.points_used ?? row.pointsUsed ?? 0);
  const pointsRemaining = Math.max(0, pointsTotal - pointsUsed);
  const status = row.status === 'revoked' ? 'revoked' : pointsRemaining <= 0 ? 'depleted' : voucher?.status === 'expired' ? 'expired' : voucher?.status === 'revoked' ? 'revoked' : 'active';
  return {
    redemptionId: row.redemption_id ?? row.redemptionId,
    voucherId: row.voucher_id ?? row.voucherId,
    userId: row.user_id ?? row.userId,
    pointsTotal,
    pointsUsed,
    pointsRemaining,
    status,
    redeemedAt: row.redeemed_at ?? row.redeemedAt,
    updatedAt: row.updated_at ?? row.updatedAt,
    voucher,
    usage,
  };
}

export function getMemberVoucherState(member, stat) {
  const adjustment = Number(member?.voucherAdjustments?.[stat] ?? 0);
  const displayValue = Number(member?.[stat] ?? 0);
  const baseValue = Number(member?.voucherBaseStats?.[stat] ?? (displayValue - adjustment));
  return { baseValue, adjustment, displayValue };
}

export function capMemberVoucherAdjustment(baseValue, adjustment) {
  const base = Number(baseValue);
  const requested = base + Number(adjustment);
  const cappedDisplay = Math.min(100, Math.max(0, requested));
  return Math.round((cappedDisplay - base) * 10) / 10;
}

export function applyMemberVoucherAdjustment(member, stat, adjustment) {
  const current = getMemberVoucherState(member, stat);
  const cappedAdjustment = capMemberVoucherAdjustment(current.baseValue, adjustment);
  const voucherAdjustments = { ...(member.voucherAdjustments ?? {}), [stat]: cappedAdjustment };
  const voucherBaseStats = { ...(member.voucherBaseStats ?? {}), [stat]: current.baseValue };
  return { ...member, [stat]: Math.round((current.baseValue + cappedAdjustment) * 10) / 10, voucherAdjustments, voucherBaseStats };
}

export function decryptSnapshot(saveData) {
  try {
    const encrypted = fromBinaryString(saveData);
    const payloadBytes = new Uint8Array(encrypted.length);
    for (let index = 0; index < encrypted.length; index += 1) payloadBytes[index] = encrypted[index] ^ SAVE_KEY_BYTES[index % SAVE_KEY_BYTES.length];
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (typeof payload.d !== 'string' || checksum(payload.d) !== payload.c) throw new Error('Invalid save checksum.');
    return JSON.parse(payload.d);
  } catch {
    throw new VoucherError('The account save could not be updated. Load the game once and try again.', 409, 'save_unavailable');
  }
}

export function encryptSnapshot(snapshot) {
  const data = JSON.stringify(snapshot);
  const payload = JSON.stringify({ d: data, c: checksum(data) });
  const payloadBytes = new TextEncoder().encode(payload);
  const encrypted = new Uint8Array(payloadBytes.length);
  for (let index = 0; index < payloadBytes.length; index += 1) encrypted[index] = payloadBytes[index] ^ SAVE_KEY_BYTES[index % SAVE_KEY_BYTES.length];
  return btoa(toBinaryString(encrypted));
}

function checksum(value) {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) total = (total + value.charCodeAt(index) * (index + 1)) % 1_000_000;
  return total;
}

export async function loadSnapshot(env, userId) {
  const v2 = await env.DB.prepare('SELECT manifest, core, roster, operations, history, profile, revision, updated_at FROM jkt48_manager_data_v2 WHERE user_id = ?').bind(userId).first().catch(() => null);
  if (v2?.manifest) return { row: v2, snapshot: reconstructSnapshot(await decodeV2Sections(v2)), format: 2 };
  const row = await env.DB.prepare('SELECT save_data, updated_at FROM jkt48_manager_data WHERE user_id = ?').bind(userId).first();
  if (!row?.save_data) throw new VoucherError('No account save exists yet. Start or save a run before using a voucher.', 409, 'save_unavailable');
  return { row, snapshot: decryptSnapshot(row.save_data), format: 1 };
}

export function buildVoucherInsert(voucher, userId, now = new Date().toISOString()) {
  return {
    sql: `INSERT INTO vouchers (voucher_id, code, name, description, type, total_points, max_increase_per_stat, max_increase_per_member, allowed_stats, allow_decrease, allow_multiple_members, max_redemptions, max_redemptions_per_user, target_user_ids, lifecycle_status, valid_from, expires_at, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    bindings: [createId('voucher'), voucher.code, voucher.name, voucher.description, voucher.type, voucher.totalPoints, voucher.maxIncreasePerStat, voucher.maxIncreasePerMember, JSON.stringify(voucher.allowedStats), voucher.allowDecrease ? 1 : 0, voucher.allowMultipleMembers ? 1 : 0, voucher.maxRedemptions, voucher.maxRedemptionsPerUser, JSON.stringify(voucher.targetUserIds), voucher.lifecycleStatus, voucher.validFrom, voucher.expiresAt, userId, now, now],
  };
}

export function auditInsert({ adminUserId, action, voucherId = null, redemptionId = null, before = null, after = null }) {
  return {
    sql: `INSERT INTO admin_voucher_audit_log (audit_id, admin_user_id, action, voucher_id, redemption_id, before_snapshot, after_snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    bindings: [createId('voucher-audit'), adminUserId, action, voucherId, redemptionId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, new Date().toISOString()],
  };
}
