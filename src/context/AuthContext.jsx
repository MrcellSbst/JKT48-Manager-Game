import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearLocalSnapshot, getLocalSnapshot, replaceLocalSnapshot } from '../state/saveDb.js';
import { simpleDecrypt, simpleEncrypt } from '../utils/crypto.js';

const AuthContext = createContext(null);

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options });
  const data = await readJson(response);
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function fetchCloudSnapshot() {
  try {
    const result = await request('/api/save/load');
    if (!result.exists || !result.data?.save_data) return null;
    const snapshot = JSON.parse(simpleDecrypt(result.data.save_data));
    return { snapshot, updatedAt: result.data.updated_at ?? null };
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function uploadLocalSnapshot() {
  const snapshot = await getLocalSnapshot();
  const saveData = simpleEncrypt(JSON.stringify(snapshot));
  return request('/api/save/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ save_data: saveData }),
  });
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [storageRevision, setStorageRevision] = useState(0);
  const [syncState, setSyncState] = useState({ phase: 'idle', message: '', error: '', updatedAt: null });

  const setProgress = useCallback((phase, message) => {
    setSyncState((current) => ({ ...current, phase, message, error: '' }));
  }, []);

  const setFailure = useCallback((error) => {
    setSyncState((current) => ({ ...current, phase: 'error', message: '', error: error.message || 'Cloud operation failed. Check your connection and retry.' }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      try {
        const session = await request('/api/auth/me');
        const local = await getLocalSnapshot();
        let cloudUpdatedAt = null;
        setProgress('loading', 'Loading cloud save…');
        const cloud = await fetchCloudSnapshot();
        if (cloud) {
          if (!local.activeRun) {
            await replaceLocalSnapshot(cloud.snapshot);
            cloudUpdatedAt = cloud.updatedAt;
            if (!cancelled) setStorageRevision((revision) => revision + 1);
          }
        } else {
          setProgress('saving', 'No cloud save found. Uploading local save…');
          const uploaded = await uploadLocalSnapshot();
          cloudUpdatedAt = uploaded.updated_at ?? null;
        }
        if (!cancelled) {
          setUser({ username: session.username, user_id: session.user_id });
          setSyncState({ phase: 'success', message: 'Account ready.', error: '', updatedAt: cloudUpdatedAt });
        }
      } catch {
        // An unavailable session endpoint must not block local guest play.
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };
    restoreSession();
    return () => { cancelled = true; };
  }, [setFailure, setProgress]);

  const login = useCallback(async (username, password) => {
    setProgress('authenticating', 'Checking account…');
    try {
      const session = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      setProgress('loading', 'Loading cloud save…');
      const cloud = await fetchCloudSnapshot();
      let updatedAt = null;
      if (cloud) {
        await replaceLocalSnapshot(cloud.snapshot);
        updatedAt = cloud.updatedAt;
      } else {
        setProgress('saving', 'No cloud save found. Uploading local save…');
        const uploaded = await uploadLocalSnapshot();
        updatedAt = uploaded.updated_at ?? null;
      }
      setStorageRevision((revision) => revision + 1);
      setUser({ username: session.username, user_id: session.user_id });
      setSyncState({ phase: 'success', message: cloud ? 'Cloud save loaded.' : 'Local save uploaded.', error: '', updatedAt });
      return session;
    } catch (error) {
      setFailure(error);
      throw error;
    }
  }, [setFailure, setProgress]);

  const register = useCallback(async (username, password) => {
    setProgress('authenticating', 'Creating account…');
    try {
      const session = await request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      setProgress('saving', 'Uploading local save…');
      const uploaded = await uploadLocalSnapshot();
      setStorageRevision((revision) => revision + 1);
      setUser({ username: session.username, user_id: session.user_id });
      setSyncState({ phase: 'success', message: 'Account created and local save uploaded.', error: '', updatedAt: uploaded.updated_at ?? null });
      return session;
    } catch (error) {
      setFailure(error);
      throw error;
    }
  }, [setFailure, setProgress]);

  const pushSave = useCallback(async (reason = 'manual') => {
    if (!user) return { skipped: true };
    setProgress('saving', reason === 'month' ? 'Saving monthly checkpoint to cloud…' : 'Saving run to cloud…');
    try {
      const result = await uploadLocalSnapshot();
      setSyncState({ phase: 'success', message: reason === 'month' ? 'Monthly cloud checkpoint saved.' : 'Cloud save complete.', error: '', updatedAt: result.updated_at ?? null });
      return result;
    } catch (error) {
      setFailure(error);
      throw error;
    }
  }, [setFailure, setProgress, user]);

  const loadCloudSave = useCallback(async () => {
    if (!user) throw new Error('Sign in to load a cloud save.');
    setProgress('loading', 'Loading cloud save…');
    try {
      const cloud = await fetchCloudSnapshot();
      if (!cloud) throw new Error('No cloud save exists for this account.');
      await replaceLocalSnapshot(cloud.snapshot);
      setStorageRevision((revision) => revision + 1);
      setSyncState({ phase: 'success', message: 'Cloud save loaded.', error: '', updatedAt: cloud.updatedAt });
      return cloud.snapshot;
    } catch (error) {
      setFailure(error);
      throw error;
    }
  }, [setFailure, setProgress, user]);

  const logout = useCallback(async () => {
    if (!user) return;
    setProgress('saving', 'Saving before logout…');
    try {
      await uploadLocalSnapshot();
      setProgress('logging-out', 'Ending session…');
      await request('/api/auth/logout', { method: 'POST' });
      await clearLocalSnapshot();
      setUser(null);
      setStorageRevision((revision) => revision + 1);
      setSyncState({ phase: 'success', message: 'Save confirmed. Logged out.', error: '', updatedAt: null });
    } catch (error) {
      setFailure(error);
      throw error;
    }
  }, [setFailure, setProgress, user]);

  const dismissSync = useCallback(() => setSyncState((current) => ({ ...current, phase: 'idle', message: '', error: '' })), []);
  const value = useMemo(() => ({ user, authLoading, storageRevision, syncState, login, register, logout, pushSave, loadCloudSave, dismissSync }), [authLoading, dismissSync, loadCloudSave, login, logout, pushSave, register, storageRevision, syncState, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
