import { canonicalJson, checksum, decodeSnapshot, encodeSnapshot, SAVE_FORMAT_VERSION } from './saveFormat.js';
import { normalizeSnapshot } from './gameStateMigration.js';

const DB_NAME = 'jkt48-manager';
const STORE_NAME = 'saves';
const META_STORE = 'meta';
const MANIFEST_STORE = 'save_manifests';
const SECTION_STORE = 'save_sections';
const DB_VERSION = 3;
let saveOperationQueue = Promise.resolve();

function enqueueSaveOperation(operation) {
  const queued = saveOperationQueue.catch(() => {}).then(operation);
  saveOperationQueue = queued;
  return queued;
}

export function flushSaveOperations() {
  return saveOperationQueue.catch(() => {});
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'slot' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(MANIFEST_STORE)) db.createObjectStore(MANIFEST_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SECTION_STORE)) db.createObjectStore(SECTION_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Older/partially-written IndexedDB rows may have no record object or no
// slot field. Never dereference those rows during startup verification.
function getStoredSlot(record) {
  if (!record || typeof record !== 'object') return null;
  const fallback = typeof record.id === 'string' && /^\d+$/.test(record.id) ? record.id : null;
  const slot = Number(record.slot ?? fallback);
  return Number.isInteger(slot) && slot > 0 ? slot : null;
}

async function readStore(storeName, key) {
  const db = await openDb();
  try { return await requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).get(key)); } finally { db.close(); }
}

async function readAll(storeName) {
  const db = await openDb();
  try { return await requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).getAll()); } finally { db.close(); }
}

async function mutateStores(storeNames, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeNames, 'readwrite');
      const result = action(transaction);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally { db.close(); }
}

async function readV2Record(slot) {
  const manifestRecord = await readStore(MANIFEST_STORE, String(slot));
  if (!manifestRecord?.manifest) return null;
  const allSections = await readAll(SECTION_STORE);
  return { manifest: manifestRecord.manifest, sections: Object.fromEntries(allSections.filter((section) => getStoredSlot(section) === slot && section.name).map((section) => [section.name, section.payload])) };
}

async function writeV2Record(slot, encoded, updatedAt) {
  const rows = Object.entries(encoded.sections).map(([name, payload]) => ({ id: `${slot}:${name}`, slot, name, payload, updatedAt }));
  await mutateStores([MANIFEST_STORE, SECTION_STORE], (transaction) => {
    const manifests = transaction.objectStore(MANIFEST_STORE);
    const sections = transaction.objectStore(SECTION_STORE);
    sections.getAll().onsuccess = (event) => {
      event.target.result.filter((item) => item.slot === slot).forEach((item) => sections.delete(item.id));
      rows.forEach((row) => sections.put(row));
      manifests.put({ id: String(slot), slot, manifest: encoded.manifest, updatedAt });
    };
  });
}

async function deleteLegacy(slot) {
  await mutateStores([STORE_NAME], (transaction) => transaction.objectStore(STORE_NAME).delete(slot));
}

const migrationCheckpointId = (slot) => `save-migration:${slot}`;

async function deleteMigrationCheckpoint(slot) {
  await mutateStores([META_STORE], (transaction) => transaction.objectStore(META_STORE).delete(migrationCheckpointId(slot)));
}

function report(onProgress, stage, completed, total, detail = '') {
  onProgress?.({ stage, completed, total, progress: total ? completed / total : null, detail });
}

const DEFAULT_UNLOCKED_BONUSES = ['B001', 'B002', 'B011', 'B015', 'B019', 'B025'];
export const DEFAULT_META = { id: 'profile', currency: 24, unlockedBonusIds: DEFAULT_UNLOCKED_BONUSES, bonusLevels: Object.fromEntries(DEFAULT_UNLOCKED_BONUSES.map((id) => [id, 1])), completedRuns: 0, runHistory: [] };

export function normalizeMetaProfile(profile = {}) {
  const unlockedBonusIds = profile.unlockedBonusIds ?? DEFAULT_META.unlockedBonusIds;
  const storedLevels = profile.bonusLevels ?? {};
  const bonusLevels = Object.fromEntries(unlockedBonusIds.map((id) => [id, Math.max(1, Math.min(5, Math.floor(Number(storedLevels[id]) || 1)))]));
  return { ...DEFAULT_META, ...profile, unlockedBonusIds, bonusLevels, runHistory: profile.runHistory ?? [] };
}

export async function migrateLegacySave(slot, { onProgress } = {}) {
  const legacy = await readStore(STORE_NAME, slot);
  if (!legacy) return null;
  const profile = await readStore(META_STORE, 'profile');
  const updatedAt = legacy.updatedAt ?? Date.now();
  report(onProgress, 'reading', 0, 8);
  const legacySnapshot = { version: 1, savedAt: updatedAt, activeRun: { slot, state: legacy.state, updatedAt }, metaProfile: normalizeMetaProfile(profile) };
  report(onProgress, 'normalizing', 1, 8);
  const snapshot = normalizeSnapshot(legacySnapshot);
  const sourceChecksum = await checksum(canonicalJson(snapshot));
  const storedCheckpoint = await readStore(META_STORE, migrationCheckpointId(slot));
  const checkpoint = storedCheckpoint?.sourceChecksum === sourceChecksum
    ? storedCheckpoint
    : { id: migrationCheckpointId(slot), sourceChecksum, sections: {}, metadata: {} };
  if (storedCheckpoint && storedCheckpoint.sourceChecksum !== sourceChecksum) await deleteMigrationCheckpoint(slot);
  const encoded = await encodeSnapshot(snapshot, {
    slot,
    updatedAt,
    resume: checkpoint,
    onSection: async ({ name, payload, metadata }) => {
      checkpoint.sections[name] = payload;
      checkpoint.metadata[name] = metadata;
      checkpoint.completedSection = name;
      checkpoint.updatedAt = Date.now();
      await mutateStores([META_STORE], (transaction) => transaction.objectStore(META_STORE).put(checkpoint));
    },
    onProgress: (event) => report(onProgress, event.stage, 1 + event.completed * 0.8, 8, event.detail),
  });
  report(onProgress, 'writing', 6, 8);
  await writeV2Record(slot, encoded, updatedAt);
  const written = await readV2Record(slot);
  report(onProgress, 'reading-back', 6.5, 8);
  let rebuilt;
  try {
    rebuilt = await decodeSnapshot(written, { onProgress: (event) => report(onProgress, event.stage, 6.5 + event.completed * 0.1, 8, event.detail) });
  } catch (error) {
    // A damaged checkpoint must not poison every retry. The legacy row is
    // still intact, so clear staged work and rebuild it next time.
    await deleteMigrationCheckpoint(slot);
    throw error;
  }
  if (canonicalJson(rebuilt) !== canonicalJson(snapshot)) {
    await deleteMigrationCheckpoint(slot);
    throw new Error('Local save migration verification failed.');
  }
  report(onProgress, 'removing', 7, 8);
  await deleteLegacy(slot);
  await deleteMigrationCheckpoint(slot);
  report(onProgress, 'complete', 8, 8);
  return rebuilt;
}

async function ensureMigrated(slot, options) {
  const v2 = await readV2Record(slot);
  if (v2) {
    try {
      await decodeSnapshot(v2);
      // A verified v2 record is authoritative. A legacy row can remain after
      // an interrupted cleanup, so remove it now instead of prompting for the
      // same migration on every startup.
      if (await readStore(STORE_NAME, slot)) {
        report(options?.onProgress, 'removing', 7, 8);
        await deleteLegacy(slot);
        await deleteMigrationCheckpoint(slot);
        report(options?.onProgress, 'complete', 8, 8);
      }
      return v2;
    } catch (error) {
      // A legacy row is the recovery source for an interrupted/corrupt v2
      // write. If no legacy row exists, surface the v2 verification error.
      if (!(await readStore(STORE_NAME, slot))) throw error;
    }
  }
  if (await readStore(STORE_NAME, slot)) {
    await migrateLegacySave(slot, options);
    return readV2Record(slot);
  }
  return null;
}

export async function migrateLocalSaves(options = {}) {
  const legacy = await readAll(STORE_NAME);
  for (const save of legacy) await ensureMigrated(save.slot, options);
  return { migrated: legacy.length };
}

export async function hasLegacySaves() {
  return (await readAll(STORE_NAME)).length > 0;
}

export async function getLegacyRecoveryData() {
  const [legacy, profile] = await Promise.all([readAll(STORE_NAME), readStore(META_STORE, 'profile')]);
  if (!legacy.length) return null;
  return JSON.stringify({ version: 1, exportedAt: Date.now(), saves: legacy, metaProfile: normalizeMetaProfile(profile) });
}

export async function getV2RecoveryData() {
  const [manifests, sections] = await Promise.all([readAll(MANIFEST_STORE), readAll(SECTION_STORE)]);
  if (!manifests.length && !sections.length) return null;
  return JSON.stringify({ version: SAVE_FORMAT_VERSION, exportedAt: Date.now(), manifests, sections });
}

export async function verifyLocalSaves({ onProgress } = {}) {
  const manifests = (await readAll(MANIFEST_STORE)).filter((record) => getStoredSlot(record) !== null);
  const total = manifests.length;
  for (let index = 0; index < total; index += 1) {
    const slot = getStoredSlot(manifests[index]);
    report(onProgress, 'reading-back', index, total || 1, String(slot));
    const record = await readV2Record(slot);
    await decodeSnapshot(record, {
      onProgress: (event) => report(onProgress, 'verifying', index + (event.progress ?? 0), total || 1, event.detail),
    });
  }
  report(onProgress, 'verifying', total, total || 1);
  return { verified: total };
}

async function loadSnapshot(slot, options = {}) {
  const record = await readV2Record(slot);
  if (record) {
    try { return await decodeSnapshot(record, options); }
    catch (error) {
      if (!await readStore(STORE_NAME, slot)) throw error;
      // A valid legacy row is the recovery source for an interrupted or
      // corrupt section write. Rebuild v2, verify it, then remove legacy.
      return migrateLegacySave(slot, options);
    }
  }
  if (await readStore(STORE_NAME, slot)) return migrateLegacySave(slot, options);
  return null;
}

export async function listSaves(options = {}) {
  const legacy = await readAll(STORE_NAME);
  for (const save of legacy) await ensureMigrated(save.slot, options);
  const manifests = await readAll(MANIFEST_STORE);
  const slots = [...new Set([
    ...manifests.map(getStoredSlot).filter((slot) => slot !== null),
    ...legacy.map(getStoredSlot).filter((slot) => slot !== null),
  ])];
  const result = [];
  for (const slot of slots) {
    const snapshot = await loadSnapshot(slot, options);
    if (snapshot?.activeRun) result.push({ slot, state: snapshot.activeRun.state, updatedAt: snapshot.activeRun.updatedAt ?? snapshot.savedAt });
  }
  return result;
}

export async function loadSave(slot, options = {}) {
  await flushSaveOperations();
  const snapshot = await loadSnapshot(slot, options);
  return snapshot?.activeRun ? { slot, state: snapshot.activeRun.state, updatedAt: snapshot.activeRun.updatedAt ?? snapshot.savedAt } : undefined;
}

async function writeSaveNow(slot, state, options = {}) {
  const existing = await loadSnapshot(slot, options);
  const storedProfile = await readStore(META_STORE, 'profile');
  const profile = storedProfile ? normalizeMetaProfile(storedProfile) : existing?.metaProfile ?? normalizeMetaProfile();
  const updatedAt = Date.now();
  const snapshot = { version: SAVE_FORMAT_VERSION, savedAt: updatedAt, activeRun: { slot, state, updatedAt }, metaProfile: profile };
  const encoded = await encodeSnapshot(snapshot, { slot, updatedAt, onProgress: options.onProgress });
  await writeV2Record(slot, encoded, updatedAt);
  return { slot, state, updatedAt };
}

export function writeSave(slot, state, options = {}) {
  return enqueueSaveOperation(() => writeSaveNow(slot, state, options));
}

async function deleteSaveNow(slot) {
  await mutateStores([STORE_NAME, MANIFEST_STORE, SECTION_STORE], (transaction) => {
    transaction.objectStore(STORE_NAME).delete(slot);
    transaction.objectStore(MANIFEST_STORE).delete(String(slot));
    const sections = transaction.objectStore(SECTION_STORE);
    sections.getAll().onsuccess = (event) => event.target.result.filter((item) => getStoredSlot(item) === slot).forEach((item) => sections.delete(item.id));
  });
}

export function deleteSave(slot) {
  return enqueueSaveOperation(() => deleteSaveNow(slot));
}

export async function getActiveRun(options = {}) {
  await flushSaveOperations();
  const saves = await listSaves(options);
  if (saves.length === 0) return null;
  const newest = saves.reduce((latest, save) => save.updatedAt > latest.updatedAt ? save : latest);
  const active = newest.slot === 1 ? newest : { ...newest, slot: 1 };
  if (newest.slot !== 1) await writeSave(1, newest.state, options);
  await Promise.all(saves.filter((save) => save.slot !== 1).map((save) => deleteSave(save.slot)));
  return active;
}

export const loadActiveRun = (options) => loadSave(1, options);
export const saveActiveRun = (state, options) => writeSave(1, state, options);
export const deleteActiveRun = () => deleteSave(1);

export async function getMetaProfile() { return normalizeMetaProfile(await readStore(META_STORE, 'profile')); }

async function saveMetaProfileOnly(profile) {
  const normalized = normalizeMetaProfile(profile);
  await mutateStores([META_STORE], (transaction) => transaction.objectStore(META_STORE).put({ ...normalized, id: 'profile' }));
}

export function saveMetaProfile(profile) {
  const normalized = { ...normalizeMetaProfile(profile), updatedAt: Date.now() };
  return enqueueSaveOperation(async () => {
    await saveMetaProfileOnly(normalized);
    const snapshot = await loadSnapshot(1);
    if (snapshot?.activeRun?.state) await writeSaveNow(1, snapshot.activeRun.state);
    return normalized;
  });
}

export function createRunHistoryEntry(game, completedAt = Date.now()) {
  if (!game?.runSummary || game.runStatus !== 'ended') return null;
  const endedYear = game.runEndedAt?.year ?? game.year;
  const endedWeek = game.runEndedAt?.week ?? game.week;
  const historyKey = `${game.seed}:${endedYear}:${endedWeek}:${game.runSummary.score}:${game.runSummary.cause}`;
  return { id: historyKey, completedAt, endedYear, endedWeek, ...game.runSummary };
}

export function mergeRunHistory(profile, entry, limit = 50) {
  if (!entry) return profile;
  const existing = profile.runHistory ?? [];
  if (existing.some((item) => item.id === entry.id)) return profile;
  return { ...profile, runHistory: [entry, ...existing].slice(0, limit) };
}

export async function getLocalSnapshot(options = {}) {
  await flushSaveOperations();
  const [activeRun, metaProfile] = await Promise.all([getActiveRun(options), getMetaProfile()]);
  return { version: SAVE_FORMAT_VERSION, savedAt: Date.now(), activeRun, metaProfile };
}

export async function replaceLocalSnapshot(snapshot, options = {}) {
  if (!snapshot || ![1, SAVE_FORMAT_VERSION].includes(snapshot.version) || typeof snapshot.metaProfile !== 'object') throw new Error('Cloud save format is not supported.');
  const normalized = normalizeSnapshot(snapshot);
  await saveMetaProfileOnly(normalized.metaProfile);
  if (normalized.activeRun?.state) await writeSave(1, normalized.activeRun.state, options);
  else await deleteActiveRun();
}

async function clearLocalDatabaseNow() {
  const db = await openDb();
  try {
    const storeNames = Array.from(db.objectStoreNames);
    if (!storeNames.length) return;
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeNames, 'readwrite');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB cleanup transaction aborted'));
      storeNames.forEach((storeName) => transaction.objectStore(storeName).clear());
    });
  } finally { db.close(); }
}

export function clearLocalDatabase() {
  return enqueueSaveOperation(clearLocalDatabaseNow);
}

export const clearLocalSnapshot = clearLocalDatabase;
export { openDb };
