import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const VoucherContext = createContext(null);

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options });
  const data = await readJson(response);
  if (!response.ok) {
    const error = new Error(data.error || 'Voucher request failed.');
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

export function VoucherProvider({ children }) {
  const { user, loadCloudSave } = useAuth();
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!user || String(user.user_id) === 'guest') { setRedemptions([]); return []; }
    setLoading(true);
    try {
      const result = await request('/api/voucher/mine');
      setRedemptions(result.redemptions ?? []);
      setError('');
      return result.redemptions ?? [];
    } catch (nextError) {
      setError(nextError.message);
      return [];
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const redeem = useCallback(async (code) => {
    const result = await request('/api/voucher/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    await refresh();
    return result.redemption;
  }, [refresh]);

  const editStat = useCallback(async (payload) => {
    const result = await request('/api/voucher/edit-member-stat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    await loadCloudSave();
    await refresh();
    return result;
  }, [loadCloudSave, refresh]);

  const value = useMemo(() => ({ redemptions, loading, error, refresh, redeem, editStat }), [editStat, error, loading, redemptions, redeem, refresh]);
  return <VoucherContext.Provider value={value}>{children}</VoucherContext.Provider>;
}

export function useVouchers() {
  const context = useContext(VoucherContext);
  if (!context) throw new Error('useVouchers must be used inside <VoucherProvider>.');
  return context;
}
