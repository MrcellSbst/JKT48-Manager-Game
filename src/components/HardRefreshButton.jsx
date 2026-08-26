import { useState } from 'react';
import './HardRefreshButton.css';

export default function HardRefreshButton() {
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } finally {
      window.location.reload();
    }
  };
  return <button type="button" className={`hard-refresh-button${refreshing ? ' is-refreshing' : ''}`} onClick={handleRefresh} disabled={refreshing} aria-label="Hard refresh page" title="Fetch latest app version from server">
    <span aria-hidden="true">↻</span><span>{refreshing ? 'Refreshing…' : 'Hard Refresh'}</span>
  </button>;
}
