import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { clearLocalDatabase, getLegacyRecoveryData, getLocalSnapshot, getV2RecoveryData, hasLegacySaves, migrateLocalSaves, replaceLocalSnapshot, verifyLocalSaves } from '../state/saveDb.js';
import { canonicalJson, decodeSnapshot, encodeSnapshot } from '../state/saveFormat.js';
import { compareSaveFreshness } from '../state/saveFreshness.js';
import { normalizeSnapshot } from '../state/gameStateMigration.js';
import { simpleDecrypt } from '../utils/crypto.js';

const AuthContext = createContext(null);
const IDLE_MIGRATION = { status: 'idle', stage: '', progress: null, completed: 0, total: 5, error: '', canDownloadRecovery: false };

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options });
  const data = await readJson(response);
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.');
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

function migrationErrorMessage(error) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'The migration paused because this device is offline. Reconnect, then retry migration.';
  return error?.message || 'Migration could not be completed. Retry to continue.';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [storageRevision, setStorageRevision] = useState(0);
  const [startupRevision, setStartupRevision] = useState(0);
  const [syncState, setSyncState] = useState({ phase: 'idle', message: '', error: '', updatedAt: null });
  const [migrationState, setMigrationState] = useState(IDLE_MIGRATION);
  const cloudRevisionRef = useRef(null);
  const migrationRetryRef = useRef(null);
  const recoveryDataRef = useRef(null);
  const migratedSectionsRef = useRef(new Set());
  const cloudUploadQueueRef = useRef(Promise.resolve());

  const setProgress = useCallback((phase, message) => setSyncState((current) => ({ ...current, phase, message, error: '' })), []);
  const setFailure = useCallback((error) => setSyncState((current) => ({ ...current, phase: 'error', message: '', error: error.message || 'Cloud operation failed. Check your connection and retry.' })), []);

  const updateMigration = useCallback((event = {}) => {
    if (event.detail && ['core', 'roster', 'operations', 'history', 'profile'].includes(event.detail)) migratedSectionsRef.current.add(event.detail);
    setMigrationState((current) => ({ ...current, status: 'running', stage: event.stage || current.stage || 'reading', progress: Number.isFinite(event.progress) ? event.progress : current.progress, completed: migratedSectionsRef.current.size, total: 5, error: '' }));
  }, []);

  const runMigration = useCallback(async (task, { recoveryData = null, onRetryComplete } = {}) => {
    recoveryDataRef.current = recoveryData;
    migratedSectionsRef.current = new Set();
    const execute = async () => {
      setMigrationState({ status: 'running', stage: 'reading', progress: 0, completed: 0, total: 5, error: '', canDownloadRecovery: Boolean(recoveryData) });
      try {
        const result = await task(updateMigration);
        setMigrationState({ status: 'complete', stage: 'complete', progress: 1, completed: 5, total: 5, error: '', canDownloadRecovery: false });
        recoveryDataRef.current = null;
        return result;
      } catch (error) {
        setMigrationState((current) => ({ ...current, status: 'failed', error: migrationErrorMessage(error) }));
        throw error;
      }
    };
    migrationRetryRef.current = async () => {
      try {
        const result = await execute();
        await onRetryComplete?.(result);
        setSyncState({ phase: 'success', message: 'Save migration complete.', error: '', updatedAt: result?.updatedAt ?? null });
        setMigrationState(IDLE_MIGRATION);
      } catch { /* Keep the blocking retry state. */ }
    };
    const result = await execute();
    setMigrationState(IDLE_MIGRATION);
    return result;
  }, [updateMigration]);

  const retryMigration = useCallback(() => migrationRetryRef.current?.(), []);
  const downloadMigrationRecovery = useCallback(() => {
    if (!recoveryDataRef.current) return;
    const blob = new Blob([String(recoveryDataRef.current)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jkt48-manager-recovery-${new Date().toISOString().replaceAll(':', '-')}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  const fetchCloudSnapshot = useCallback(async ({ onRetryComplete } = {}) => {
    let result;
    try { result = await request('/api/save/load?format=2'); }
    catch (error) { if (error.status === 404) return null; throw error; }
    if (!result.exists) return null;
    if (result.format === 2 && result.manifest && result.sections) {
      let storedSnapshot;
      try {
        storedSnapshot = await decodeSnapshot({ manifest: result.manifest, sections: result.sections });
      } catch {
        return runMigration(async (onProgress) => {
          onProgress({ stage: 'reading-back', progress: 0.05 });
          const verified = await decodeSnapshot(
            { manifest: result.manifest, sections: result.sections },
            { onProgress: (event) => onProgress({ ...event, progress: 0.05 + (event.progress ?? 0) * 0.95 }) },
          );
          return { snapshot: normalizeSnapshot(verified), updatedAt: result.updated_at ?? null };
        }, { recoveryData: JSON.stringify(result), onRetryComplete });
      }
      const snapshot = normalizeSnapshot(storedSnapshot);
      cloudRevisionRef.current = Number(result.revision ?? result.manifest.revision ?? 0);
      if (canonicalJson(snapshot) !== canonicalJson(storedSnapshot)) {
        const normalizeStored = async (onProgress) => {
          onProgress({ stage: 'normalizing', progress: 0.1 });
          const encoded = await encodeSnapshot(snapshot, { onProgress: (event) => onProgress({ ...event, progress: 0.1 + (event.progress ?? 0) * 0.62 }) });
          onProgress({ stage: 'writing', progress: 0.75 });
          const pushed = await request('/api/save/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 2, manifest: encoded.manifest, sections: encoded.sections, expectedRevision: cloudRevisionRef.current }) });
          onProgress({ stage: 'reading-back', progress: 0.86 });
          const reread = await request('/api/save/load?format=2');
          const verified = await decodeSnapshot({ manifest: reread.manifest, sections: reread.sections, onProgress: (event) => onProgress({ ...event, progress: 0.86 + (event.progress ?? 0) * 0.14 }) });
          if (canonicalJson(verified) !== canonicalJson(snapshot)) throw new Error('Normalized cloud save verification failed.');
          cloudRevisionRef.current = Number(reread.revision ?? pushed.revision);
          return { snapshot: verified, updatedAt: reread.updated_at ?? pushed.updated_at ?? null };
        };
        return runMigration(normalizeStored, { recoveryData: JSON.stringify(storedSnapshot), onRetryComplete });
      }
      return { snapshot, updatedAt: result.updated_at ?? null };
    }
    const legacyData = result.data?.save_data;
    if (!result.migrationRequired || !legacyData) throw new Error('Cloud save format is not supported.');
    const migrate = async (onProgress) => {
      onProgress({ stage: 'reading', progress: 0.05 });
      const legacySnapshot = JSON.parse(simpleDecrypt(legacyData));
      onProgress({ stage: 'normalizing', progress: 0.12 });
      const snapshot = normalizeSnapshot(legacySnapshot);
      // First convert the untouched legacy snapshot so the server can prove
      // semantic equivalence before deleting its only legacy recovery copy.
      const encoded = await encodeSnapshot(legacySnapshot, { onProgress: (event) => onProgress({ ...event, progress: 0.12 + (event.progress ?? 0) * 0.38 }) });
      onProgress({ stage: 'writing', progress: 0.72 });
      const migrated = await request('/api/save/migrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 2, manifest: encoded.manifest, sections: encoded.sections }) });
      if (!migrated.alreadyMigrated && (!migrated.verified || !migrated.legacyDeleted)) throw new Error('Cloud migration did not confirm verification and cleanup.');
      onProgress({ stage: 'reading-back', progress: 0.84 });
      let stored = await request('/api/save/load?format=2');
      const rebuiltLegacy = await decodeSnapshot({ manifest: stored.manifest, sections: stored.sections });
      if (canonicalJson(rebuiltLegacy) !== canonicalJson(legacySnapshot)) throw new Error('Cloud save read-back did not match the legacy save.');
      // Persist the normalized game schema as a second revision. If this step
      // is interrupted, the already verified v2 legacy snapshot remains safe.
      const normalizedEncoded = await encodeSnapshot(snapshot, { onProgress: (event) => onProgress({ ...event, progress: 0.84 + (event.progress ?? 0) * 0.08 }) });
      await request('/api/save/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 2, manifest: normalizedEncoded.manifest, sections: normalizedEncoded.sections, expectedRevision: stored.revision }) });
      stored = await request('/api/save/load?format=2');
      const rebuilt = normalizeSnapshot(await decodeSnapshot({ manifest: stored.manifest, sections: stored.sections, onProgress: (event) => onProgress({ ...event, progress: 0.92 + (event.progress ?? 0) * 0.06 }) }));
      if (canonicalJson(rebuilt) !== canonicalJson(snapshot)) throw new Error('Cloud save read-back did not match the normalized save.');
      onProgress({ stage: 'removing', progress: 1 });
      cloudRevisionRef.current = Number(stored.revision ?? migrated.revision ?? 1);
      return { snapshot: rebuilt, updatedAt: stored.updated_at ?? migrated.updated_at ?? null };
    };
    return runMigration(migrate, { recoveryData: legacyData, onRetryComplete });
  }, [runMigration]);

  const uploadLocalSnapshot = useCallback(() => {
    const upload = cloudUploadQueueRef.current.catch(() => {}).then(async () => {
      const snapshot = normalizeSnapshot(await getLocalSnapshot());
      const encoded = await encodeSnapshot(snapshot);
      const body = { format: 2, manifest: encoded.manifest, sections: encoded.sections };
      if (cloudRevisionRef.current !== null) body.expectedRevision = cloudRevisionRef.current;
      const result = await request('/api/save/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      cloudRevisionRef.current = Number(result.revision ?? cloudRevisionRef.current ?? 1);
      return result;
    });
    cloudUploadQueueRef.current = upload;
    return upload;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      try {
        let legacySavePresent;
        try { legacySavePresent = await hasLegacySaves(); }
        catch {
          // Storage inspection failures are migration failures too; never fall
          // through to an apparently empty new game screen.
          await runMigration(async (onProgress) => {
            onProgress({ stage: 'reading', progress: null });
            if (await hasLegacySaves()) return migrateLocalSaves({ onProgress });
            return { migrated: 0 };
          }, { onRetryComplete: () => {
            setStorageRevision((revision) => revision + 1);
            setAuthLoading(true);
            setStartupRevision((revision) => revision + 1);
          } });
          legacySavePresent = false;
        }
        if (legacySavePresent) {
          const recoveryData = await getLegacyRecoveryData().catch(() => null);
          await runMigration((onProgress) => migrateLocalSaves({ onProgress }), { recoveryData, onRetryComplete: () => {
            setStorageRevision((revision) => revision + 1);
            setAuthLoading(true);
            setStartupRevision((revision) => revision + 1);
          } });
        }
        try {
          await verifyLocalSaves();
        } catch {
          const recoveryData = await getV2RecoveryData().catch(() => null);
          await runMigration((onProgress) => verifyLocalSaves({ onProgress }), { recoveryData, onRetryComplete: () => {
            setAuthLoading(true);
            setStartupRevision((revision) => revision + 1);
          } });
        }
      } catch {
        if (!cancelled) setAuthLoading(false);
        return;
      }
      try {
        const session = await request('/api/auth/me');
        if (!cancelled) setUser({ username: session.username, user_id: session.user_id });
        const local = await getLocalSnapshot();
        setProgress('loading', 'Loading cloud save…');
        const cloud = await fetchCloudSnapshot({ onRetryComplete: async (loaded) => {
          const currentLocal = await getLocalSnapshot();
          const freshness = compareSaveFreshness(currentLocal, loaded?.snapshot);
          if (freshness === 'cloud') await replaceLocalSnapshot(loaded.snapshot);
          else if (freshness === 'local') await uploadLocalSnapshot();
          setStorageRevision((revision) => revision + 1);
        } });
        let cloudUpdatedAt = cloud?.updatedAt ?? null;
        if (cloud) {
          const freshness = compareSaveFreshness(local, cloud.snapshot);
          if (freshness === 'cloud') {
            await replaceLocalSnapshot(cloud.snapshot);
            if (!cancelled) setStorageRevision((revision) => revision + 1);
          } else if (freshness === 'local') {
            setProgress('saving', 'Uploading newer browser save...');
            const uploaded = await uploadLocalSnapshot();
            cloudUpdatedAt = uploaded.updated_at ?? cloudUpdatedAt;
          }
        } else if (!cloud) {
          setProgress('saving', 'No cloud save found. Uploading local save…');
          const uploaded = await uploadLocalSnapshot();
          cloudUpdatedAt = uploaded.updated_at ?? null;
        }
        if (!cancelled) setSyncState({ phase: 'success', message: 'Account ready.', error: '', updatedAt: cloudUpdatedAt });
      } catch {
        // An unavailable session endpoint must not block local guest play.
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };
    restoreSession();
    return () => { cancelled = true; };
  }, [fetchCloudSnapshot, runMigration, setProgress, startupRevision, uploadLocalSnapshot]);

  const login = useCallback(async (username, password) => {
    setProgress('authenticating', 'Checking account…');
    try {
      const session = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      setUser({ username: session.username, user_id: session.user_id });
      const local = await getLocalSnapshot();
      setProgress('loading', 'Loading cloud save…');
      const installCloud = async (cloud) => { if (cloud?.snapshot) await replaceLocalSnapshot(cloud.snapshot); setStorageRevision((revision) => revision + 1); };
      const installNewest = async (loaded) => {
        const currentLocal = await getLocalSnapshot();
        const freshness = compareSaveFreshness(currentLocal, loaded?.snapshot);
        if (freshness === 'cloud') await installCloud(loaded);
        else if (freshness === 'local') await uploadLocalSnapshot();
      };
      const cloud = await fetchCloudSnapshot({ onRetryComplete: installNewest });
      let updatedAt = null;
      let loadedCloud = false;
      if (cloud) {
        const freshness = compareSaveFreshness(local, cloud.snapshot);
        if (freshness === 'cloud') {
          await installCloud(cloud);
          loadedCloud = true;
        } else if (freshness === 'local') {
          setProgress('saving', 'Uploading newer browser save...');
          const uploaded = await uploadLocalSnapshot();
          updatedAt = uploaded.updated_at ?? cloud.updatedAt;
        }
        if (!updatedAt) updatedAt = cloud.updatedAt;
      }
      else { setProgress('saving', 'No cloud save found. Uploading local save…'); const uploaded = await uploadLocalSnapshot(); updatedAt = uploaded.updated_at ?? null; }
      setSyncState({ phase: 'success', message: loadedCloud ? 'Cloud save loaded.' : 'Latest browser save confirmed in cloud.', error: '', updatedAt });
      return session;
    } catch (error) { setFailure(error); throw error; }
  }, [fetchCloudSnapshot, setFailure, setProgress, uploadLocalSnapshot]);

  const register = useCallback(async (username, password) => {
    setProgress('authenticating', 'Creating account…');
    try {
      const session = await request('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      setUser({ username: session.username, user_id: session.user_id });
      setProgress('saving', 'Uploading local save…');
      const uploaded = await uploadLocalSnapshot();
      setStorageRevision((revision) => revision + 1);
      setSyncState({ phase: 'success', message: 'Account created and local save uploaded.', error: '', updatedAt: uploaded.updated_at ?? null });
      return session;
    } catch (error) { setFailure(error); throw error; }
  }, [setFailure, setProgress, uploadLocalSnapshot]);

  const pushSave = useCallback(async (reason = 'manual') => {
    if (!user) return { skipped: true };
    const messages = reason === 'week' ? ['Saving weekly checkpoint to cloud…', 'Weekly cloud checkpoint saved.'] : reason === 'new-year' ? ['Saving new-year checkpoint to cloud…', 'New-year cloud checkpoint saved.'] : reason === 'refresh' ? ['Saving before refresh…', 'Refresh save confirmed.'] : ['Saving run to cloud…', 'Cloud save complete.'];
    setProgress('saving', messages[0]);
    try { const result = await uploadLocalSnapshot(); setSyncState({ phase: 'success', message: messages[1], error: '', updatedAt: result.updated_at ?? null }); return result; }
    catch (error) { setFailure(error); throw error; }
  }, [setFailure, setProgress, uploadLocalSnapshot, user]);

  const loadCloudSave = useCallback(async () => {
    if (!user) throw new Error('Sign in to load a cloud save.');
    setProgress('loading', 'Loading cloud save…');
    try {
      const installCloud = async (cloud) => { if (cloud?.snapshot) await replaceLocalSnapshot(cloud.snapshot); setStorageRevision((revision) => revision + 1); };
      const cloud = await fetchCloudSnapshot({ onRetryComplete: installCloud });
      if (!cloud) throw new Error('No cloud save exists for this account.');
      await installCloud(cloud);
      setSyncState({ phase: 'success', message: 'Cloud save loaded.', error: '', updatedAt: cloud.updatedAt });
      return cloud.snapshot;
    } catch (error) { setFailure(error); throw error; }
  }, [fetchCloudSnapshot, setFailure, setProgress, user]);

  const logout = useCallback(async () => {
    if (!user) return;
    setProgress('saving', 'Saving before logout…');
    try {
      await uploadLocalSnapshot();
      setProgress('logging-out', 'Ending session…');
      await request('/api/auth/logout', { method: 'POST' });
      await clearLocalDatabase();
      cloudRevisionRef.current = null;
      setUser(null);
      setStorageRevision((revision) => revision + 1);
      setSyncState({ phase: 'success', message: 'Save confirmed. Logged out.', error: '', updatedAt: null });
    } catch (error) { setFailure(error); throw error; }
  }, [setFailure, setProgress, uploadLocalSnapshot, user]);

  const dismissSync = useCallback(() => setSyncState((current) => ({ ...current, phase: 'idle', message: '', error: '' })), []);
  const value = useMemo(() => ({ user, authLoading, storageRevision, syncState, migrationState, login, register, logout, pushSave, loadCloudSave, dismissSync, retryMigration, downloadMigrationRecovery }), [authLoading, dismissSync, downloadMigrationRecovery, loadCloudSave, login, logout, migrationState, pushSave, register, retryMigration, storageRevision, syncState, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
