import { simpleDecrypt, simpleEncrypt } from '../utils/crypto.js';

export const SAVE_FORMAT_VERSION = 2;
export const SAVE_FORMAT_CODEC = 'gzip-xor-v1';
export const SAVE_SECTIONS = Object.freeze(['core', 'roster', 'operations', 'history', 'profile']);

// These are deliberately conservative. A key which is not known here stays in
// core, so adding a game field never makes an older migration drop it.
const ROSTER_KEYS = new Set([
  'members', 'formerMembers', 'graduatedMembers', 'releasedMembers', 'rosterPool',
  'unsignedMembers', 'rosterHistory', 'memberHistory', 'injuryHistory',
  'relationships', 'memberRelationships', 'mentorships', 'dramas', 'dramaHistory',
  'auditionCandidates', 'auditionPool', 'memberIncarnations', 'traineeProgress',
  'chemistry', 'mentorshipHistory', 'promotions', 'graduations', 'departures',
  'graduationTargets', 'seitansaiObligations', 'auditions', 'auditionCampaign',
]);
const OPERATION_KEYS = new Set([
  'schedule', 'scheduleTemplates', 'trainingPlans', 'trainingTemplates',
  'campaigns', 'activeCampaigns', 'singleProductions',
  'singles', 'mvs', 'concerts', 'fanEvents',
  'opportunities', 'theater', 'theaterShows', 'setlists',
  'pendingYearEndSettlement', 'audition', 'auditionState', 'graduationPlans',
  'yearEndMeetGreets', 'fanEventPlans', 'nextCampaignConfig', 'pendingOpportunity',
  'concertVenueOffers', 'loans', 'loanOffers', 'ledger',
  'renovations',
]);
const HISTORY_KEYS = new Set([
  'history', 'timeline', 'timelineEvents', 'weeklyReports', 'reports',
  'financialEvents', 'financialHistory', 'activityHistory', 'skillChanges',
  'resolvedTraining', 'trainingHistory', 'yearlyReviews', 'annualReviews',
  'taxHistory', 'yearEndSettlements', 'theaterChanges', 'runSummary',
  'notifications', 'records', 'dramaMemory', 'fanNarratives', 'failureCounters',
  'demandHistory', 'campaignHistory', 'mvHistory', 'concertHistory',
  'theaterHistory', 'opportunityHistory',
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function fallbackChecksum(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export async function checksum(value) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return fallbackChecksum(value);
  const bytes = new TextEncoder().encode(value);
  const digest = await subtle.digest('SHA-256', bytes);
  return `sha256-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function compress(value) {
  if (typeof CompressionStream === 'undefined') return { codec: 'plain', bytes: new TextEncoder().encode(value) };
  const stream = new Blob([new TextEncoder().encode(value)]).stream().pipeThrough(new CompressionStream('gzip'));
  return { codec: 'gzip', bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
}

async function decompress(bytes, codec) {
  if (codec === 'plain') return new TextDecoder().decode(bytes);
  if (codec !== 'gzip' || typeof DecompressionStream === 'undefined') throw new Error('Unsupported save compression codec.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

function progress(callback, stage, completed, total, detail = '') {
  callback?.({ stage, completed, total, progress: total ? completed / total : null, detail });
}

export function splitSnapshot(snapshot) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const activeRun = source.activeRun && typeof source.activeRun === 'object' ? source.activeRun : null;
  const state = activeRun?.state && typeof activeRun.state === 'object' ? activeRun.state : {};
  const coreState = {};
  const roster = {};
  const operations = {};
  const history = {};
  Object.entries(state).forEach(([key, value]) => {
    if (ROSTER_KEYS.has(key)) roster[key] = value;
    else if (OPERATION_KEYS.has(key)) operations[key] = value;
    else if (HISTORY_KEYS.has(key)) history[key] = value;
    else coreState[key] = value;
  });
  const activeRunMeta = activeRun ? { ...activeRun } : activeRun;
  if (activeRunMeta) delete activeRunMeta.state;
  const topLevel = { ...source };
  delete topLevel.activeRun;
  delete topLevel.metaProfile;
  return {
    core: { topLevel, activeRun: activeRunMeta, state: coreState },
    roster,
    operations,
    history,
    profile: { metaProfile: source.metaProfile ?? null },
  };
}

export function joinSnapshot(sections) {
  const core = sections?.core ?? {};
  const state = {
    ...(core.state ?? {}),
    ...(sections?.roster ?? {}),
    ...(sections?.operations ?? {}),
    ...(sections?.history ?? {}),
  };
  const activeRun = core.activeRun ? { ...core.activeRun, state } : null;
  return { ...(core.topLevel ?? {}), activeRun, metaProfile: sections?.profile?.metaProfile ?? null };
}

export async function encodeSnapshot(snapshot, { slot = 1, updatedAt = Date.now(), onProgress, resume, onSection } = {}) {
  const sections = splitSnapshot(snapshot);
  const encoded = { ...(resume?.sections ?? {}) };
  const metadata = { ...(resume?.metadata ?? {}) };
  const total = SAVE_SECTIONS.length;
  progress(onProgress, 'converting', 0, total);
  for (let index = 0; index < SAVE_SECTIONS.length; index += 1) {
    const name = SAVE_SECTIONS[index];
    const plain = canonicalJson(sections[name]);
    const plainChecksum = await checksum(plain);
    if (typeof encoded[name] === 'string' && metadata[name]?.checksum === plainChecksum) {
      progress(onProgress, 'compressing', index + 1, total, name);
      continue;
    }
    const compressed = await compress(plain);
    const payload = JSON.stringify({ codec: compressed.codec, checksum: plainChecksum, data: toBase64(compressed.bytes) });
    encoded[name] = simpleEncrypt(payload);
    metadata[name] = { checksum: plainChecksum, bytes: compressed.bytes.byteLength };
    await onSection?.({ name, payload: encoded[name], metadata: metadata[name] });
    progress(onProgress, 'compressing', index + 1, total, name);
  }
  const fullChecksum = await checksum(canonicalJson(snapshot));
  return {
    manifest: { version: SAVE_FORMAT_VERSION, codec: SAVE_FORMAT_CODEC, slot, updatedAt, sections: metadata, fullChecksum },
    sections: encoded,
  };
}

export async function decodeSnapshot(record, { onProgress } = {}) {
  if (!record?.manifest || record.manifest.version !== SAVE_FORMAT_VERSION) throw new Error('Unsupported save format.');
  const sections = {};
  const total = SAVE_SECTIONS.length;
  for (let index = 0; index < SAVE_SECTIONS.length; index += 1) {
    const name = SAVE_SECTIONS[index];
    const encrypted = record.sections?.[name];
    if (typeof encrypted !== 'string') throw new Error(`Save section is missing: ${name}.`);
    const payload = JSON.parse(simpleDecrypt(encrypted));
    const plain = await decompress(fromBase64(payload.data), payload.codec);
    if (await checksum(plain) !== payload.checksum || payload.checksum !== record.manifest.sections?.[name]?.checksum) {
      throw new Error(`Save section checksum failed: ${name}.`);
    }
    sections[name] = JSON.parse(plain);
    progress(onProgress, 'verifying', index + 1, total, name);
  }
  const snapshot = joinSnapshot(sections);
  if (await checksum(canonicalJson(snapshot)) !== record.manifest.fullChecksum) throw new Error('Save checksum verification failed.');
  return snapshot;
}

export function isV2Manifest(value) {
  return Boolean(value?.version === SAVE_FORMAT_VERSION && Array.isArray(value?.sectionNames ?? SAVE_SECTIONS));
}
