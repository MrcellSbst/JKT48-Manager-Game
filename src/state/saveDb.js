const DB_NAME = 'jkt48-manager';
const STORE_NAME = 'saves';
const META_STORE = 'meta';
const DB_VERSION = 2;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'slot' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transactStore(storeName, mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('IndexedDB transaction aborted')); };
  });
}

async function transact(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('IndexedDB transaction aborted')); };
  });
}

export const listSaves = () => transact('readonly', (store) => store.getAll());
export const loadSave = (slot) => transact('readonly', (store) => store.get(slot));
export const writeSave = (slot, state) => transact('readwrite', (store) => store.put({ slot, state, updatedAt: Date.now() }));
export const deleteSave = (slot) => transact('readwrite', (store) => store.delete(slot));

export async function getActiveRun() {
  const saves = await listSaves();
  if (saves.length === 0) return null;
  const newest = saves.reduce((latest, save) => save.updatedAt > latest.updatedAt ? save : latest);
  const active = newest.slot === 1 ? newest : { ...newest, slot: 1 };
  if (newest.slot !== 1) await writeSave(1, newest.state);
  await Promise.all(saves.filter((save) => save.slot !== 1).map((save) => deleteSave(save.slot)));
  return active;
}

export const loadActiveRun = () => loadSave(1);
export const saveActiveRun = (state) => writeSave(1, state);
export const deleteActiveRun = () => deleteSave(1);

const DEFAULT_UNLOCKED_BONUSES = ['B001', 'B002', 'B011', 'B015', 'B019', 'B025'];
export const DEFAULT_META = { id: 'profile', currency: 24, unlockedBonusIds: DEFAULT_UNLOCKED_BONUSES, bonusLevels: Object.fromEntries(DEFAULT_UNLOCKED_BONUSES.map((id) => [id, 1])), completedRuns: 0, runHistory: [] };

export function normalizeMetaProfile(profile = {}) {
  const unlockedBonusIds = profile.unlockedBonusIds ?? DEFAULT_META.unlockedBonusIds;
  const storedLevels = profile.bonusLevels ?? {};
  const bonusLevels = Object.fromEntries(unlockedBonusIds.map((id) => [id, Math.max(1, Math.min(5, Math.floor(Number(storedLevels[id]) || 1)))]));
  return { ...DEFAULT_META, ...profile, unlockedBonusIds, bonusLevels, runHistory: profile.runHistory ?? [] };
}

export async function getMetaProfile() {
  const profile = await transactStore(META_STORE, 'readonly', (store) => store.get('profile'));
  return normalizeMetaProfile(profile);
}
export const saveMetaProfile = (profile) => transactStore(META_STORE, 'readwrite', (store) => store.put({ ...normalizeMetaProfile(profile), id: 'profile' }));

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

export async function getLocalSnapshot() {
  const [activeRun, metaProfile] = await Promise.all([getActiveRun(), getMetaProfile()]);
  return { version: 1, savedAt: Date.now(), activeRun, metaProfile };
}

export async function replaceLocalSnapshot(snapshot) {
  if (!snapshot || snapshot.version !== 1 || typeof snapshot.metaProfile !== 'object') {
    throw new Error('Cloud save format is not supported.');
  }
  await Promise.all([
    snapshot.activeRun?.state ? saveActiveRun(snapshot.activeRun.state) : deleteActiveRun(),
    saveMetaProfile(normalizeMetaProfile(snapshot.metaProfile)),
  ]);
}

export async function clearLocalDatabase() {
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
  } finally {
    db.close();
  }
}

export const clearLocalSnapshot = clearLocalDatabase;
