const SAVE_KEY = 'JKT48ManagerSaveKey48';
const SAVE_KEY_BYTES = new TextEncoder().encode(SAVE_KEY);

export const SAVE_FORMAT_VERSION = 2;
export const SAVE_FORMAT_CODEC = 'gzip-xor-v1';
export const SAVE_SECTION_NAMES = Object.freeze(['core', 'roster', 'operations', 'history', 'profile']);
export const MAX_SECTION_LENGTH = 8_000_000;

// Save sections are routinely multi-megabyte, so every byte/string conversion
// below runs over the whole payload. Building the binary string one character
// at a time makes V8 reallocate and recons the rope on each append, and
// `Uint8Array.from` invokes its mapper once per character. Both are replaced by
// chunked / index-assignment equivalents that produce identical output.
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

const ROSTER_KEYS = new Set(['members', 'formerMembers', 'graduatedMembers', 'releasedMembers', 'rosterPool', 'unsignedMembers', 'rosterHistory', 'memberHistory', 'injuryHistory', 'relationships', 'memberRelationships', 'mentorships', 'dramas', 'dramaHistory', 'auditionCandidates', 'auditionPool', 'memberIncarnations', 'traineeProgress', 'chemistry', 'mentorshipHistory', 'promotions', 'graduations', 'departures', 'graduationTargets', 'seitansaiObligations', 'auditions', 'auditionCampaign']);
const OPERATION_KEYS = new Set(['schedule', 'scheduleTemplates', 'trainingPlans', 'trainingTemplates', 'campaigns', 'activeCampaigns', 'singleProductions', 'singles', 'mvs', 'concerts', 'fanEvents', 'opportunities', 'theater', 'theaterShows', 'setlists', 'pendingYearEndSettlement', 'audition', 'auditionState', 'graduationPlans', 'yearEndMeetGreets', 'fanEventPlans', 'nextCampaignConfig', 'pendingOpportunity', 'concertVenueOffers', 'loans', 'loanOffers', 'ledger', 'renovations']);
const HISTORY_KEYS = new Set(['history', 'timeline', 'timelineEvents', 'weeklyReports', 'reports', 'financialEvents', 'financialHistory', 'activityHistory', 'skillChanges', 'resolvedTraining', 'trainingHistory', 'yearlyReviews', 'annualReviews', 'taxHistory', 'yearEndSettlements', 'theaterChanges', 'runSummary', 'notifications', 'records', 'dramaMemory', 'fanNarratives', 'failureCounters', 'demandHistory', 'campaignHistory', 'mvHistory', 'concertHistory', 'theaterHistory', 'opportunityHistory']);

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((result, key) => { if (value[key] !== undefined) result[key] = canonicalize(value[key]); return result; }, {});
  return value;
}
export function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }

function fallbackChecksum(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export async function checksum(value) {
  if (!globalThis.crypto?.subtle) return fallbackChecksum(value);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `sha256-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function encryptText(value) {
  const payload = JSON.stringify({ d: value, c: legacyChecksum(value) });
  const payloadBytes = new TextEncoder().encode(payload);
  const encrypted = new Uint8Array(payloadBytes.length);
  for (let index = 0; index < payloadBytes.length; index += 1) encrypted[index] = payloadBytes[index] ^ SAVE_KEY_BYTES[index % SAVE_KEY_BYTES.length];
  return btoa(toBinaryString(encrypted));
}

export function decryptText(value) {
  try {
    const encrypted = fromBinaryString(String(value));
    const payloadBytes = new Uint8Array(encrypted.length);
    for (let index = 0; index < encrypted.length; index += 1) payloadBytes[index] = encrypted[index] ^ SAVE_KEY_BYTES[index % SAVE_KEY_BYTES.length];
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (typeof payload.d !== 'string' || legacyChecksum(payload.d) !== payload.c) throw new Error('Checksum verification failed.');
    return payload.d;
  } catch { throw new Error('Save data is invalid or has been modified.'); }
}

function legacyChecksum(value) { let total = 0; for (let index = 0; index < value.length; index += 1) total = (total + value.charCodeAt(index) * (index + 1)) % 1_000_000; return total; }
export function parseEncryptedSnapshot(value) { return JSON.parse(decryptText(value)); }

export function splitSnapshot(snapshot) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const activeRun = source.activeRun && typeof source.activeRun === 'object' ? source.activeRun : null;
  const state = activeRun?.state && typeof activeRun.state === 'object' ? activeRun.state : {};
  const sections = { core: { topLevel: { ...source }, activeRun: activeRun ? { ...activeRun } : activeRun, state: {} }, roster: {}, operations: {}, history: {}, profile: { metaProfile: source.metaProfile ?? null } };
  delete sections.core.topLevel.activeRun; delete sections.core.topLevel.metaProfile; if (sections.core.activeRun) delete sections.core.activeRun.state;
  for (const [key, value] of Object.entries(state)) {
    const target = ROSTER_KEYS.has(key) ? 'roster' : OPERATION_KEYS.has(key) ? 'operations' : HISTORY_KEYS.has(key) ? 'history' : 'core';
    if (target === 'core') sections.core.state[key] = value; else sections[target][key] = value;
  }
  return sections;
}

export function reconstructSnapshot(sections) {
  const core = sections?.core ?? {};
  const state = { ...(core.state ?? {}), ...(sections?.roster ?? {}), ...(sections?.operations ?? {}), ...(sections?.history ?? {}) };
  const activeRun = core.activeRun ? { ...core.activeRun, state } : null;
  return { ...(core.topLevel ?? {}), activeRun, metaProfile: sections?.profile?.metaProfile ?? null };
}

function toBase64(bytes) { return btoa(toBinaryString(bytes)); }
function fromBase64(value) { return fromBinaryString(value); }

async function encodeSection(value) {
  const plain = canonicalJson(value);
  const sectionChecksum = await checksum(plain);
  const source = new TextEncoder().encode(plain);
  let codec = 'plain';
  let bytes = source;
  if (typeof CompressionStream !== 'undefined') {
    codec = 'gzip';
    const stream = new Blob([source]).stream().pipeThrough(new CompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const payload = JSON.stringify({ codec, checksum: sectionChecksum, data: toBase64(bytes) });
  return { encrypted: encryptText(payload), checksum: sectionChecksum, bytes: bytes.byteLength };
}

export async function buildV2Payload(snapshot, { slot = 1, updatedAt = Date.now(), revision = 1 } = {}) {
  const plain = splitSnapshot(snapshot); const sections = {}; const metadata = {};
  for (const name of SAVE_SECTION_NAMES) { const encoded = await encodeSection(plain[name]); sections[name] = encoded.encrypted; metadata[name] = { checksum: encoded.checksum, bytes: encoded.bytes }; }
  return { format: SAVE_FORMAT_VERSION, manifest: { version: SAVE_FORMAT_VERSION, codec: SAVE_FORMAT_CODEC, sectionNames: [...SAVE_SECTION_NAMES], slot, updatedAt, revision, sections: metadata, fullChecksum: await checksum(canonicalJson(snapshot)) }, sections };
}

export function normalizeV2Sections(source) {
  const sections = {};
  for (const name of SAVE_SECTION_NAMES) { const value = source?.[name]; sections[name] = typeof value === 'string' ? value : encryptText(JSON.stringify(value ?? {})); if (sections[name].length > MAX_SECTION_LENGTH) throw new Error(`Save section ${name} is too large.`); }
  return sections;
}

async function decompress(bytes, codec) {
  if (codec === 'plain') return new TextDecoder().decode(bytes);
  if (codec !== 'gzip' || typeof DecompressionStream === 'undefined') throw new Error('Unsupported save compression codec.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

export async function decodeV2Sections(rowOrSections) {
  const source = rowOrSections?.sections ?? rowOrSections ?? {}; const decoded = {};
  for (const name of SAVE_SECTION_NAMES) {
    const value = source[name]; if (!value) { decoded[name] = {}; continue; }
    const payload = JSON.parse(decryptText(value));
    if (payload?.data && payload?.codec) { const plain = await decompress(fromBase64(payload.data), payload.codec); if (await checksum(plain) !== payload.checksum) throw new Error(`Save section checksum failed: ${name}.`); decoded[name] = JSON.parse(plain); }
    else decoded[name] = payload;
  }
  return decoded;
}

export function snapshotsEquivalent(left, right) { return canonicalJson(left) === canonicalJson(right); }
