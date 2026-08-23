import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CalendarClock, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { JAKARTA_TIME_ZONE, toJakartaDateTimeLocal } from '../utils/patchnotes.js';

const COPY = {
  en: {
    back: 'Back', admin: 'Administrator / user ID 1', title: 'Patchnote control room', description: 'Publish localized update notices and schedule when players should see them.', refresh: 'Refresh', refreshing: 'Refreshing…',
    create: 'Create patchnote', edit: 'Edit patchnote', version: 'Version label', publishAt: 'Publish date and time', timezone: 'Asia/Jakarta (UTC+7)', status: 'Status', draft: 'Draft', published: 'Published', englishTitle: 'English title', indonesianTitle: 'Indonesian title', englishBody: 'English content', indonesianBody: 'Indonesian content', fallback: 'Optional; English content is used when empty.', save: 'Save patchnote', saving: 'Saving…', cancel: 'Cancel', inventory: 'Patchnotes', inventoryDescription: 'Newest publication time appears first. Future published entries stay scheduled until their UTC+7 time.', empty: 'No patchnotes yet.', editAction: 'Edit', deleteAction: 'Delete', deleteConfirm: 'Delete this patchnote permanently?', created: 'Patchnote created.', updated: 'Patchnote updated.', deleted: 'Patchnote deleted.', scheduled: 'Scheduled', publishedState: 'Published', draftState: 'Draft', closeEdit: 'Cancel editing', openVouchers: 'Voucher admin', requestFailed: 'Patchnote request failed.',
  },
  id: {
    back: 'Kembali', admin: 'Administrator / user ID 1', title: 'Ruang kontrol patchnote', description: 'Terbitkan pemberitahuan pembaruan dwibahasa dan jadwalkan kapan pemain melihatnya.', refresh: 'Muat ulang', refreshing: 'Memuat ulang…',
    create: 'Buat patchnote', edit: 'Edit patchnote', version: 'Label versi', publishAt: 'Tanggal dan waktu terbit', timezone: 'Asia/Jakarta (UTC+7)', status: 'Status', draft: 'Draf', published: 'Diterbitkan', englishTitle: 'Judul bahasa Inggris', indonesianTitle: 'Judul bahasa Indonesia', englishBody: 'Konten bahasa Inggris', indonesianBody: 'Konten bahasa Indonesia', fallback: 'Opsional; konten bahasa Inggris dipakai jika kosong.', save: 'Simpan patchnote', saving: 'Menyimpan…', cancel: 'Batal', inventory: 'Patchnote', inventoryDescription: 'Waktu terbit terbaru tampil pertama. Entri yang diterbitkan untuk masa depan tetap terjadwal sampai waktu UTC+7.', empty: 'Belum ada patchnote.', editAction: 'Edit', deleteAction: 'Hapus', deleteConfirm: 'Hapus patchnote ini secara permanen?', created: 'Patchnote dibuat.', updated: 'Patchnote diperbarui.', deleted: 'Patchnote dihapus.', scheduled: 'Terjadwal', publishedState: 'Diterbitkan', draftState: 'Draf', closeEdit: 'Batalkan edit', openVouchers: 'Admin voucher', requestFailed: 'Permintaan patchnote gagal.',
  },
};

const makeInitialForm = () => ({
  versionLabel: '',
  titleEn: '',
  titleId: '',
  bodyEn: '',
  bodyId: '',
  lifecycleStatus: 'draft',
  publishedAt: toJakartaDateTimeLocal(new Date()),
});

async function api(url, options = {}, fallback) {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
}

function formatDateTime(value, language) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const formatted = new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-US', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: JAKARTA_TIME_ZONE,
  }).format(date);
  return `${formatted} · UTC+7`;
}

export default function PatchnotesAdminDashboard({ language = 'en', onBack = null }) {
  const copy = COPY[language] ?? COPY.en;
  const [patchnotes, setPatchnotes] = useState([]);
  const [form, setForm] = useState(makeInitialForm);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('success');
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const notify = (text, tone = 'success') => { setMessage(text); setMessageTone(tone); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/admin/patchnotes', {}, copy.requestFailed);
      setPatchnotes(data.patchnotes ?? []);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [copy.requestFailed]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setEditing(null); setForm(makeInitialForm()); };
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const path = editing ? `/api/admin/patchnotes/${editing.patchnoteId}` : '/api/admin/patchnotes';
      await api(path, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }, copy.requestFailed);
      const success = editing ? copy.updated : copy.created;
      resetForm();
      await load();
      notify(success);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const edit = (patchnote) => {
    setEditing(patchnote);
    setForm({
      versionLabel: patchnote.versionLabel ?? '', titleEn: patchnote.titleEn ?? '', titleId: patchnote.titleId ?? '',
      bodyEn: patchnote.bodyEn ?? '', bodyId: patchnote.bodyId ?? '', lifecycleStatus: patchnote.lifecycleStatus ?? 'draft',
      publishedAt: toJakartaDateTimeLocal(patchnote.publishedAt),
    });
    window.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const remove = async (patchnote) => {
    if (!window.confirm(copy.deleteConfirm)) return;
    setBusy(true); setMessage('');
    try {
      await api(`/api/admin/patchnotes/${patchnote.patchnoteId}`, { method: 'DELETE' }, copy.requestFailed);
      if (editing?.patchnoteId === patchnote.patchnoteId) resetForm();
      await load();
      notify(copy.deleted);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return <main className="page patchnotes-admin-page" aria-busy={loading}>
    <section className="page-heading patchnotes-admin-heading">
      <div>{onBack ? <button type="button" className="secondary-button patchnotes-back-button" onClick={onBack}><ArrowLeft aria-hidden="true" size={16} /> {copy.back}</button> : null}<span>{copy.admin}</span><h1>{copy.title}</h1><p>{copy.description}</p></div>
      <div className="patchnotes-admin-heading-actions"><a className="secondary-button" href="/admin/vouchers">{copy.openVouchers}</a><button type="button" className="secondary-button" onClick={load} disabled={loading}><RefreshCw aria-hidden="true" className={loading ? 'spinning' : ''} size={16} /> {loading ? copy.refreshing : copy.refresh}</button></div>
    </section>
    {message ? <p className={`patchnotes-message ${messageTone}`} role="status" aria-live="polite">{message}</p> : null}
    <section className="panel-card patchnotes-editor">
      <header><div><h2>{editing ? copy.edit : copy.create}</h2><p>{copy.timezone}</p></div>{editing ? <button type="button" className="icon-button" aria-label={copy.closeEdit} onClick={resetForm}><X aria-hidden="true" size={18} /></button> : <CalendarClock aria-hidden="true" size={24} />}</header>
      <form onSubmit={submit}>
        <div className="patchnotes-form-grid">
          <label><span>{copy.version}</span><input name="versionLabel" autoComplete="off" value={form.versionLabel} maxLength="40" onChange={(event) => update('versionLabel', event.target.value)} placeholder="e.g. v0.2.1…" /></label>
          <label><span>{copy.publishAt}</span><input name="publishedAt" autoComplete="off" type="datetime-local" required value={form.publishedAt} onChange={(event) => update('publishedAt', event.target.value)} /><small>{copy.timezone}</small></label>
          <label><span>{copy.status}</span><select name="lifecycleStatus" autoComplete="off" value={form.lifecycleStatus} onChange={(event) => update('lifecycleStatus', event.target.value)}><option value="draft">{copy.draft}</option><option value="published">{copy.published}</option></select></label>
          <label className="patchnotes-wide"><span>{copy.englishTitle}</span><input name="titleEn" autoComplete="off" required maxLength="160" value={form.titleEn} onChange={(event) => update('titleEn', event.target.value)} /></label>
          <label className="patchnotes-wide"><span>{copy.indonesianTitle}</span><input name="titleId" autoComplete="off" maxLength="160" value={form.titleId} onChange={(event) => update('titleId', event.target.value)} /><small>{copy.fallback}</small></label>
          <label className="patchnotes-language-field"><span>{copy.englishBody}</span><textarea name="bodyEn" autoComplete="off" required rows="10" maxLength="20000" value={form.bodyEn} onChange={(event) => update('bodyEn', event.target.value)} /></label>
          <label className="patchnotes-language-field"><span>{copy.indonesianBody}</span><textarea name="bodyId" autoComplete="off" rows="10" maxLength="20000" value={form.bodyId} onChange={(event) => update('bodyId', event.target.value)} /><small>{copy.fallback}</small></label>
        </div>
        <div className="patchnotes-form-actions"><button type="submit" className="setup-primary" disabled={busy}>{busy ? copy.saving : editing ? copy.save : copy.create} <Plus aria-hidden="true" size={16} /></button>{editing ? <button type="button" className="secondary-button" onClick={resetForm}>{copy.cancel}</button> : null}</div>
      </form>
    </section>
    <section className="panel-card patchnotes-inventory">
      <header><div><h2>{copy.inventory}</h2><p>{copy.inventoryDescription}</p></div><strong>{patchnotes.length}</strong></header>
      {loading ? <div className="patchnotes-loading" role="status">{copy.refreshing}</div> : patchnotes.length ? <div className="patchnotes-list">{patchnotes.map((patchnote) => {
        const future = Date.parse(patchnote.publishedAt) > Date.now();
        const status = patchnote.lifecycleStatus === 'draft' ? copy.draftState : future ? copy.scheduled : copy.publishedState;
        const title = language === 'id' && patchnote.titleId ? patchnote.titleId : patchnote.titleEn;
        const body = language === 'id' && patchnote.bodyId ? patchnote.bodyId : patchnote.bodyEn;
        return <article key={patchnote.patchnoteId}>
          <div className="patchnotes-list-date"><span>{formatDateTime(patchnote.publishedAt, language)}</span><strong className={`patchnote-status ${patchnote.lifecycleStatus === 'draft' ? 'draft' : future ? 'scheduled' : 'published'}`}>{status}</strong></div>
          <div className="patchnotes-list-copy"><div>{patchnote.versionLabel ? <span>{patchnote.versionLabel}</span> : null}<h3>{title}</h3></div><p>{body}</p></div>
          <div className="patchnotes-list-actions"><button type="button" onClick={() => edit(patchnote)}><Pencil aria-hidden="true" size={15} /> {copy.editAction}</button><button type="button" className="danger-link" disabled={busy} onClick={() => remove(patchnote)}><Trash2 aria-hidden="true" size={15} /> {copy.deleteAction}</button></div>
        </article>;
      })}</div> : <div className="patchnotes-empty"><CalendarClock aria-hidden="true" size={25} /><strong>{copy.empty}</strong></div>}
    </section>
  </main>;
}
