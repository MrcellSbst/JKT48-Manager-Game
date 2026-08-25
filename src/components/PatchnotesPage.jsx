import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Megaphone, RefreshCw } from 'lucide-react';
import { formatDateTime } from '../localization.js';
import { fetchLatestPatchnote, fetchPatchnotesPage } from '../utils/patchnotes.js';

const COPY = {
  en: {
    archive: 'Patchnotes',
    archiveDescription: 'Read published game updates and changes.',
    latest: 'Latest patchnote',
    published: 'Published',
    loading: 'Loading patchnotes…',
    retry: 'Retry',
    requestFailed: 'Patchnotes could not be loaded.',
    empty: 'No patchnotes have been published yet.',
    page: 'Page',
    previous: 'Previous page',
    next: 'Next page',
    noLatest: 'No published patchnote yet.',
  },
  id: {
    archive: 'Catatan pembaruan',
    archiveDescription: 'Baca pembaruan dan perubahan game yang telah diterbitkan.',
    latest: 'Catatan pembaruan terbaru',
    published: 'Diterbitkan',
    loading: 'Memuat catatan pembaruan…',
    retry: 'Coba lagi',
    requestFailed: 'Catatan pembaruan tidak dapat dimuat.',
    empty: 'Belum ada catatan pembaruan yang diterbitkan.',
    page: 'Halaman',
    previous: 'Halaman sebelumnya',
    next: 'Halaman berikutnya',
    noLatest: 'Belum ada catatan pembaruan yang diterbitkan.',
  },
};

function copyFor(language) {
  return COPY[language] ?? COPY.en;
}

function noteTitle(note, language) {
  return language === 'id' && note?.titleId ? note.titleId : note?.titleEn;
}

function noteBody(note, language) {
  return language === 'id' && note?.bodyId ? note.bodyId : note?.bodyEn;
}

function publishedLabel(value, language) {
  const formatted = formatDateTime(value, language);
  return formatted ? `${formatted} · WIB (UTC+7)` : '';
}

function NoteMeta({ note, language, copy }) {
  const publishedAt = publishedLabel(note?.publishedAt, language);
  return <div className="patchnotes-public-meta">
    {note?.versionLabel ? <strong data-i18n-ignore="true">{note.versionLabel}</strong> : null}
    {publishedAt ? <span>{copy.published} {publishedAt}</span> : null}
  </div>;
}

export function LatestPatchnoteCard({ language = 'en' }) {
  const copy = copyFor(language);
  const [state, setState] = useState({ loading: true, error: false, patchnote: null });
  const request = () => {
    setState((current) => ({ ...current, loading: true, error: false }));
    fetchLatestPatchnote()
      .then((patchnote) => setState({ loading: false, error: false, patchnote }))
      .catch(() => setState({ loading: false, error: true, patchnote: null }));
  };

  useEffect(() => {
    let cancelled = false;
    fetchLatestPatchnote()
      .then((patchnote) => { if (!cancelled) setState({ loading: false, error: false, patchnote }); })
      .catch(() => { if (!cancelled) setState({ loading: false, error: true, patchnote: null }); });
    return () => { cancelled = true; };
  }, []);

  return <section className="patchnote-latest-card" aria-busy={state.loading}>
    <header>
      <span className="patchnote-latest-mark"><Megaphone aria-hidden="true" size={19} /></span>
      <div><span>{copy.latest}</span><h2 data-i18n-ignore="true">{state.patchnote ? noteTitle(state.patchnote, language) || copy.latest : copy.latest}</h2></div>
    </header>
    {state.loading ? <p className="patchnotes-public-status" role="status">{copy.loading}</p> : state.error ? <div className="patchnotes-public-status error" role="alert"><AlertTriangle aria-hidden="true" size={18} /><span>{copy.requestFailed}</span><button type="button" className="secondary-button" onClick={request}>{copy.retry}</button></div> : state.patchnote ? <>
      <NoteMeta note={state.patchnote} language={language} copy={copy} />
      <div className="patchnote-latest-body" data-i18n-ignore="true">{noteBody(state.patchnote, language)}</div>
    </> : <p className="patchnotes-public-status">{copy.noLatest}</p>}
  </section>;
}

function PublicPatchnoteCard({ note, language, copy }) {
  return <article className="patchnote-public-card">
    <div className="patchnotes-public-date"><NoteMeta note={note} language={language} copy={copy} /></div>
    <div className="patchnotes-public-copy">
      <h2 data-i18n-ignore="true">{noteTitle(note, language) || copy.archive}</h2>
      <p data-i18n-ignore="true">{noteBody(note, language)}</p>
    </div>
  </article>;
}

export default function PatchnotesPage({ language = 'en' }) {
  const copy = copyFor(language);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const loadedPages = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    const cached = loadedPages.current.get(page);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    setError(false);
    fetchPatchnotesPage(page)
      .then((next) => {
        if (cancelled) return;
        loadedPages.current.set(page, next);
        setData(next);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError(true);
      });
    return () => { cancelled = true; };
  }, [page, retryToken]);

  const retry = () => {
    loadedPages.current.delete(page);
    setError(false);
    setLoading(true);
    setRetryToken((current) => current + 1);
  };
  const totalPages = data?.totalPages ?? 0;
  const notes = data?.patchnotes ?? [];

  return <div className="page patchnotes-page">
    <section className="page-heading">
      <div><span className="eyebrow">{copy.archive}</span><h1>{copy.archive}</h1><p>{copy.archiveDescription}</p></div>
    </section>
    <section className="panel-card patchnotes-public-panel" aria-live="polite">
      {loading ? <div className="patchnotes-loading" role="status"><RefreshCw aria-hidden="true" className="spinning" size={22} />{copy.loading}</div> : error ? <div className="patchnotes-public-status error" role="alert"><AlertTriangle aria-hidden="true" size={20} /><span>{copy.requestFailed}</span><button type="button" className="secondary-button" onClick={retry}>{copy.retry}</button></div> : notes.length ? <div className="patchnotes-public-list">{notes.map((note) => <PublicPatchnoteCard key={note.patchnoteId} note={note} language={language} copy={copy} />)}</div> : <div className="patchnotes-empty"><Megaphone aria-hidden="true" size={24} /><strong>{copy.empty}</strong></div>}
    </section>
    {!loading && !error && totalPages > 1 ? <nav className="patchnotes-pagination" aria-label={copy.archive}>
      <button type="button" className="secondary-button" aria-label={copy.previous} disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft aria-hidden="true" size={17} />{copy.previous}</button>
      <div>{Array.from({ length: totalPages }, (_, index) => index + 1).map((value) => <button type="button" key={value} className={value === page ? 'active' : 'secondary-button'} aria-current={value === page ? 'page' : undefined} aria-label={`${copy.page} ${value}`} onClick={() => setPage(value)}>{value}</button>)}</div>
      <button type="button" className="secondary-button" aria-label={copy.next} disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>{copy.next}<ChevronRight aria-hidden="true" size={17} /></button>
    </nav> : null}
  </div>;
}
