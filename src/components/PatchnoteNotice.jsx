import { useEffect, useRef, useState } from 'react';
import { Megaphone, RefreshCw, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { fetchLatestPatchnote, hardRefreshPage, JAKARTA_TIME_ZONE, readSeenPatchnote, rememberPatchnote, shouldShowPatchnote } from '../utils/patchnotes.js';

const COPY = {
  en: {
    label: 'New game update',
    heading: 'Update available',
    published: 'Published',
    refreshHint: 'Refresh the game to load this update on your device.',
    later: 'Later',
    refresh: 'Refresh now',
    refreshing: 'Refreshing…',
    close: 'Close update notice',
  },
  id: {
    label: 'Pembaruan game baru',
    heading: 'Pembaruan tersedia',
    published: 'Diterbitkan',
    refreshHint: 'Muat ulang game untuk memasang pembaruan ini di perangkat Anda.',
    later: 'Nanti',
    refresh: 'Muat ulang sekarang',
    refreshing: 'Memuat ulang…',
    close: 'Tutup pemberitahuan pembaruan',
  },
};

const PATCHNOTE_CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000;
let latestPatchnoteRequest = null;

function loadLatestPatchnote() {
  if (!latestPatchnoteRequest) {
    latestPatchnoteRequest = fetchLatestPatchnote()
      .finally(() => {
        latestPatchnoteRequest = null;
      });
  }
  return latestPatchnoteRequest;
}

function formatPublishedAt(value, language) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const formatted = new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: JAKARTA_TIME_ZONE,
  }).format(date);
  return `${formatted} · UTC+7`;
}

export default function PatchnoteNotice({ language = 'en', canShow = true }) {
  const [patchnote, setPatchnote] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const dialogRef = useRef(null);
  const refreshRef = useRef(null);
  const refreshingRef = useRef(false);
  const copy = COPY[language] ?? COPY.en;

  useEffect(() => {
    let cancelled = false;
    const checkForPatchnote = () => loadLatestPatchnote().then((latest) => {
      if (cancelled || !shouldShowPatchnote(latest, readSeenPatchnote())) return;
      setPatchnote(latest);
    }).catch(() => {
      // Update notices never block gameplay when the public endpoint is offline.
    });
    checkForPatchnote();
    const intervalId = window.setInterval(checkForPatchnote, PATCHNOTE_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!patchnote || !canShow) return undefined;
    rememberPatchnote(patchnote);
    const previousFocus = document.activeElement;
    refreshRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !refreshingRef.current) {
        setPatchnote(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled)') ?? [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [patchnote, canShow]);

  if (!canShow || !patchnote || typeof document === 'undefined') return null;
  const title = language === 'id' && patchnote.titleId ? patchnote.titleId : patchnote.titleEn;
  const body = language === 'id' && patchnote.bodyId ? patchnote.bodyId : patchnote.bodyEn;
  const publishedAt = formatPublishedAt(patchnote.publishedAt, language);
  const refresh = async () => {
    if (refreshing) return;
    refreshingRef.current = true;
    setRefreshing(true);
    await hardRefreshPage();
  };

  return createPortal(<div className="patchnote-notice-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !refreshing) setPatchnote(null);
  }}>
    <section ref={dialogRef} className="patchnote-notice" role="dialog" aria-modal="true" aria-labelledby="patchnote-notice-title" aria-describedby="patchnote-notice-content patchnote-refresh-hint">
      <header>
        <span className="patchnote-notice-mark"><Megaphone aria-hidden="true" size={21} /></span>
        <div><span>{copy.label}</span><h2 id="patchnote-notice-title">{title || copy.heading}</h2></div>
        <button type="button" className="icon-button" aria-label={copy.close} disabled={refreshing} onClick={() => setPatchnote(null)}><X aria-hidden="true" size={19} /></button>
      </header>
      <div className="patchnote-notice-meta">
        {patchnote.versionLabel ? <strong>{patchnote.versionLabel}</strong> : null}
        {publishedAt ? <span>{copy.published} {publishedAt}</span> : null}
      </div>
      <div id="patchnote-notice-content" className="patchnote-notice-content">{body}</div>
      <p id="patchnote-refresh-hint" className="patchnote-refresh-hint">{copy.refreshHint}</p>
      <footer>
        <button type="button" className="secondary-button" disabled={refreshing} onClick={() => setPatchnote(null)}>{copy.later}</button>
        <button ref={refreshRef} type="button" className="setup-primary" disabled={refreshing} onClick={refresh}><RefreshCw aria-hidden="true" className={refreshing ? 'spinning' : ''} size={17} /> {refreshing ? copy.refreshing : copy.refresh}</button>
      </footer>
    </section>
  </div>, document.body);
}
