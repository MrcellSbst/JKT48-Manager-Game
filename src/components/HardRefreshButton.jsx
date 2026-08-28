import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { hardRefreshPage } from '../utils/patchnotes.js';
import './HardRefreshButton.css';

const COPY = {
  en: { label: 'Hard refresh page', title: 'Save, then fetch the latest app version', idle: 'Hard Refresh', saving: 'Saving & refreshing…', failed: 'Refresh stopped because the save could not be confirmed. Try again.' },
  id: { label: 'Muat ulang penuh halaman', title: 'Simpan, lalu ambil versi aplikasi terbaru', idle: 'Muat Ulang Penuh', saving: 'Menyimpan & memuat ulang…', failed: 'Muat ulang dihentikan karena penyimpanan belum dapat dikonfirmasi. Coba lagi.' },
};

export default function HardRefreshButton({ onBeforeRefresh, language = 'en' }) {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const copy = COPY[language] ?? COPY.en;
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError('');
    try {
      await hardRefreshPage({ beforeRefresh: onBeforeRefresh });
    } catch (refreshError) {
      console.error(refreshError);
      setError(copy.failed);
      setRefreshing(false);
    }
  };
  return <>
    {error ? <p className="hard-refresh-error" role="alert">{error}</p> : null}
    <button type="button" className={`hard-refresh-button${refreshing ? ' is-refreshing' : ''}`} onClick={handleRefresh} disabled={refreshing} aria-label={copy.label} title={copy.title}>
      <RefreshCw aria-hidden="true" size={20} /><span>{refreshing ? copy.saving : copy.idle}</span>
    </button>
  </>;
}
