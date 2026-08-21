import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowLeft, Copy, Pause, Play, Plus, RefreshCw, Search, ShieldAlert, Ticket, X } from 'lucide-react';
import { VOUCHER_MEMBER_STATS, voucherStatLabel } from '../data/voucher.js';

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options });
  let data = {};
  try { data = await response.json(); } catch { /* API error without JSON */ }
  if (!response.ok) throw new Error(data.error || 'Admin voucher request failed.');
  return data;
}

const initialForm = {
  code: '', codePrefix: 'JKT48', name: '', description: '', type: 'member-stat-editor', totalPoints: 10,
  maxIncreasePerStat: 5, maxIncreasePerMember: 10, allowedStats: [...VOUCHER_MEMBER_STATS], allowDecrease: false,
  allowMultipleMembers: true, maxRedemptions: '', maxRedemptionsPerUser: 1, targetUserIds: '', lifecycleStatus: 'draft', validFrom: '', expiresAt: '',
};

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const numberFormatter = new Intl.NumberFormat();
const formatDate = (value, fallback = 'Any time') => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : dateFormatter.format(date);
};
const formatDateTime = (value, fallback = 'Unknown') => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : dateTimeFormatter.format(date);
};
const statusClass = (status) => `voucher-status voucher-status-${String(status ?? '').toLowerCase()}`;

function VoucherStatus({ status }) {
  return <span className={statusClass(status)}>{status || 'Unknown'}</span>;
}

function VoucherForm({ form, setForm, onSubmit, busy, editing = false, locked = false, onCancel }) {
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleStat = (stat) => update('allowedStats', form.allowedStats.includes(stat) ? form.allowedStats.filter((item) => item !== stat) : [...form.allowedStats, stat]);

  return <form className="voucher-admin-form" onSubmit={onSubmit}>
    <div className="voucher-admin-form-grid">
      <label><span>Name</span><input name="voucher-name" required value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
      <label><span>Code {editing ? '(locked after redemption)' : ''}</span><input name="voucher-code" value={form.code} disabled={editing && locked} onChange={(event) => update('code', event.target.value.toUpperCase())} placeholder="e.g. JKT48-SUMMER…" spellCheck={false} /></label>
      <label className="voucher-wide"><span>Description</span><textarea name="voucher-description" value={form.description} onChange={(event) => update('description', event.target.value)} rows="2" /></label>
      <label><span>Type</span><select name="voucher-type" value={form.type} disabled><option value="member-stat-editor">Member stat editor</option></select></label>
      <label><span>Total points</span><input name="voucher-total-points" type="number" min="1" required value={form.totalPoints} disabled={locked} onChange={(event) => update('totalPoints', Number(event.target.value))} /></label>
      <label><span>Max / stat</span><input name="voucher-max-stat" type="number" min="0" required value={form.maxIncreasePerStat} disabled={locked} onChange={(event) => update('maxIncreasePerStat', Number(event.target.value))} /></label>
      <label><span>Max / member</span><input name="voucher-max-member" type="number" min="0" required value={form.maxIncreasePerMember} disabled={locked} onChange={(event) => update('maxIncreasePerMember', Number(event.target.value))} /></label>
      <label><span>Max redemptions</span><input name="voucher-max-redemptions" type="number" min="1" value={form.maxRedemptions} onChange={(event) => update('maxRedemptions', event.target.value)} placeholder="Unlimited…" /></label>
      <label><span>Max per user</span><input name="voucher-max-per-user" type="number" min="1" value={form.maxRedemptionsPerUser} onChange={(event) => update('maxRedemptionsPerUser', event.target.value)} placeholder="Unlimited…" /></label>
      <label><span>Lifecycle</span><select name="voucher-lifecycle" value={form.lifecycleStatus} onChange={(event) => update('lifecycleStatus', event.target.value)}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option></select></label>
      <label><span>Valid from</span><input name="voucher-valid-from" type="datetime-local" value={form.validFrom} onChange={(event) => update('validFrom', event.target.value)} /></label>
      <label><span>Expires at</span><input name="voucher-expires-at" type="datetime-local" value={form.expiresAt} onChange={(event) => update('expiresAt', event.target.value)} /></label>
      <label><span>Target user IDs</span><input name="voucher-target-users" value={form.targetUserIds} onChange={(event) => update('targetUserIds', event.target.value)} placeholder="e.g. 12, 34…" inputMode="numeric" /></label>
      <fieldset className="voucher-stat-picker voucher-wide"><legend>Allowed stats {locked ? '(locked)' : ''}</legend>{VOUCHER_MEMBER_STATS.map((stat) => <label key={stat}><input name={`voucher-stat-${stat}`} type="checkbox" checked={form.allowedStats.includes(stat)} disabled={locked} onChange={() => toggleStat(stat)} />{voucherStatLabel(stat)}</label>)}</fieldset>
      <label className="voucher-check"><input name="voucher-allow-decrease" type="checkbox" checked={form.allowDecrease} disabled={locked} onChange={(event) => update('allowDecrease', event.target.checked)} />Allow decreases</label>
      <label className="voucher-check"><input name="voucher-allow-multiple-members" type="checkbox" checked={form.allowMultipleMembers} disabled={locked} onChange={(event) => update('allowMultipleMembers', event.target.checked)} />Allow multiple members</label>
    </div>
    <div className="voucher-admin-form-actions"><button type="submit" className="setup-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save voucher' : 'Create voucher'} <Plus aria-hidden="true" size={16} /></button>{onCancel ? <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button> : null}</div>
  </form>;
}

function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return <nav className="voucher-pagination" aria-label="Pagination"><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button></nav>;
}

function TableState({ loading, emptyCopy }) {
  return <p className="voucher-table-state" role={loading ? 'status' : undefined}>{loading ? 'Loading…' : emptyCopy}</p>;
}

function DetailPanel({ detail, onClose }) {
  if (!detail) return null;
  const voucher = detail.voucher;
  return <section className="panel-card voucher-detail-panel" aria-label="Voucher detail">
    <header><div><span className="eyebrow">Voucher detail</span><h2>{voucher.name}</h2><p><code translate="no">{voucher.code}</code> · <VoucherStatus status={voucher.status} /></p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close voucher detail"><X aria-hidden="true" size={18} /></button></header>
    <div className="voucher-detail-grid"><span><small>Type</small><strong>{voucher.type}</strong></span><span><small>Usage</small><strong>{voucher.redemptionCount}{voucher.maxRedemptions ? ` / ${voucher.maxRedemptions}` : ''}</strong></span><span><small>Points</small><strong>{voucher.pointsUsed} / {voucher.pointsIssued}</strong></span><span><small>Validity</small><strong>{formatDate(voucher.validFrom)}{voucher.expiresAt ? ` – ${formatDate(voucher.expiresAt)}` : ''}</strong></span></div>
    <p className="muted-copy">{voucher.description || 'No description.'}</p>
    <h3>Redemptions</h3>
    <div className="voucher-table-wrap"><table className="voucher-table voucher-detail-table"><caption className="sr-only">Redemptions for {voucher.name}</caption><thead><tr><th>User</th><th>Status</th><th>Points</th><th>Redeemed</th></tr></thead><tbody>{(detail.redemptions ?? []).map((item) => <tr key={item.redemption_id}><td>{item.username || item.user_id}</td><td><VoucherStatus status={item.status} /></td><td>{item.points_used} / {item.points_total}</td><td>{formatDateTime(item.redeemed_at)}</td></tr>)}</tbody></table>{!(detail.redemptions ?? []).length ? <TableState emptyCopy="No redemptions yet." /> : null}</div>
    <h3>Admin audit</h3>
    <div className="voucher-activity-list">{(detail.audit ?? []).slice(0, 20).map((item) => <div key={item.audit_id}><span>{item.action}</span><strong>{item.admin_user_id}</strong><small>{formatDateTime(item.created_at)}</small></div>)}{!(detail.audit ?? []).length ? <TableState emptyCopy="No audit entries yet." /> : null}</div>
  </section>;
}

function RedemptionDetail({ detail, onClose, onRevoke }) {
  if (!detail) return null;
  const item = detail.redemption;
  const lockedMembers = [...new Set((detail.edits ?? []).map((edit) => edit.member_id))];
  return <section className="panel-card voucher-detail-panel" aria-label="Redemption detail">
    <header><div><span className="eyebrow">Redemption detail</span><h2><code translate="no">{item.code}</code></h2><p>{item.username || item.user_id}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close redemption detail"><X aria-hidden="true" size={18} /></button></header>
    <div className="voucher-detail-grid"><span><small>Status</small><strong><VoucherStatus status={item.status} /></strong></span><span><small>Points</small><strong>{item.points_used} / {item.points_total}</strong></span><span><small>Locked member</small><strong>{lockedMembers.length ? lockedMembers.join(', ') : 'None'}</strong></span><span><small>Redeemed</small><strong>{formatDateTime(item.redeemed_at)}</strong></span></div>
    <h3>Edit history</h3>
    <div className="voucher-table-wrap"><table className="voucher-table voucher-detail-table"><caption className="sr-only">Edit history for {item.code}</caption><thead><tr><th>Member</th><th>Stat</th><th>Before → after</th><th>Delta</th><th>Date</th></tr></thead><tbody>{(detail.edits ?? []).map((edit) => <tr key={edit.edit_id}><td>{edit.member_id}</td><td>{edit.stat}</td><td>{edit.display_value_before} → {edit.display_value_after}</td><td>{edit.delta > 0 ? '+' : ''}{edit.delta}</td><td>{formatDateTime(edit.created_at)}</td></tr>)}</tbody></table>{!(detail.edits ?? []).length ? <TableState emptyCopy="No edits recorded yet." /> : null}</div>
    {item.status !== 'revoked' ? <button type="button" className="danger-link voucher-detail-revoke" onClick={onRevoke}>Revoke redemption</button> : null}
  </section>;
}

function SearchFilter({ name, value, onChange, placeholder, label }) {
  return <label className="voucher-filter-search"><Search aria-hidden="true" size={16} /><span className="sr-only">{label}</span><input type="search" name={name} aria-label={label} value={value} onChange={onChange} placeholder={placeholder} autoComplete="off" /></label>;
}

export default function VoucherAdminDashboard({ onBack = null }) {
  const [overview, setOverview] = useState(null);
  const [vouchers, setVouchers] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [voucherTotal, setVoucherTotal] = useState(0);
  const [redemptionTotal, setRedemptionTotal] = useState(0);
  const [logTotal, setLogTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [voucherSort, setVoucherSort] = useState('created');
  const [voucherDirection, setVoucherDirection] = useState('desc');
  const [redemptionSearch, setRedemptionSearch] = useState('');
  const [redemptionStatus, setRedemptionStatus] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [logStat, setLogStat] = useState('');
  const [voucherPage, setVoucherPage] = useState(1);
  const [redemptionPage, setRedemptionPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [voucherDetail, setVoucherDetail] = useState(null);
  const [redemptionDetail, setRedemptionDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('');
  const [loading, setLoading] = useState(true);
  const pageSize = 25;

  const notify = (nextMessage, tone = 'success') => {
    setMessage(nextMessage);
    setMessageTone(tone);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const voucherQuery = new URLSearchParams({ search, status, sort: voucherSort, direction: voucherDirection, page: String(voucherPage), pageSize: String(pageSize) });
    const redemptionQuery = new URLSearchParams({ search: redemptionSearch, status: redemptionStatus, page: String(redemptionPage), pageSize: String(pageSize) });
    const logQuery = new URLSearchParams({ search: logSearch, stat: logStat, page: String(logPage), pageSize: String(pageSize) });
    try {
      const [nextOverview, nextVouchers, nextRedemptions, nextLogs] = await Promise.all([
        api('/api/admin/voucher-overview'), api(`/api/admin/vouchers?${voucherQuery}`), api(`/api/admin/voucher-redemptions?${redemptionQuery}`), api(`/api/admin/voucher-edit-logs?${logQuery}`),
      ]);
      setOverview(nextOverview); setVouchers(nextVouchers.vouchers ?? []); setVoucherTotal(Number(nextVouchers.total ?? 0)); setRedemptions(nextRedemptions.redemptions ?? []); setRedemptionTotal(Number(nextRedemptions.total ?? 0)); setLogs(nextLogs.logs ?? []); setLogTotal(Number(nextLogs.total ?? 0));
    } catch (error) {
      notify(error.message, 'error');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [search, status, voucherSort, voucherDirection, redemptionSearch, redemptionStatus, logSearch, logStat, voucherPage, redemptionPage, logPage]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMessage(''); setMessageTone('');
    try {
      const payload = { ...form, targetUserIds: form.targetUserIds.split(',').map((item) => item.trim()).filter(Boolean), maxRedemptions: form.maxRedemptions || null, maxRedemptionsPerUser: form.maxRedemptionsPerUser || null };
      if (editing) await api(`/api/admin/vouchers/${editing.voucherId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      else await api('/api/admin/vouchers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setForm(initialForm); setEditing(null); await load(); notify(editing ? 'Voucher updated.' : 'Voucher created.');
    } catch (error) { notify(error.message, 'error'); } finally { setBusy(false); }
  };

  const action = async (path, success) => {
    if (path.endsWith('/revoke') && !window.confirm('Confirm this permanent revoke? Existing redemptions will stop being usable.')) return;
    setBusy(true); setMessage(''); setMessageTone('');
    try { await api(path, { method: 'POST' }); await load(); notify(success); }
    catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };

  const edit = (voucher) => {
    setEditing(voucher);
    setForm({ ...initialForm, ...voucher, code: voucher.code, targetUserIds: (voucher.targetUserIds ?? []).join(', '), maxRedemptions: voucher.maxRedemptions ?? '', maxRedemptionsPerUser: voucher.maxRedemptionsPerUser ?? '', validFrom: toDateTimeLocal(voucher.validFrom), expiresAt: toDateTimeLocal(voucher.expiresAt) });
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  };
  const showVoucher = async (voucherId) => { try { setVoucherDetail((await api(`/api/admin/vouchers/${voucherId}`))); } catch (error) { notify(error.message, 'error'); } };
  const showRedemption = async (redemptionId) => { try { setRedemptionDetail((await api(`/api/admin/voucher-redemptions/${redemptionId}`))); } catch (error) { notify(error.message, 'error'); } };
  const metrics = overview?.totals ?? {};
  const refresh = () => load().catch(() => {});
  const emptyOrLoading = (emptyCopy) => <TableState loading={loading} emptyCopy={emptyCopy} />;

  return <main className="page voucher-admin-page" aria-busy={loading}>
    <section className="page-heading"><div className="voucher-admin-heading">{onBack ? <button type="button" className="secondary-button voucher-back-button" onClick={onBack}><ArrowLeft aria-hidden="true" size={16} /> Back</button> : null}<span className="eyebrow">Administrator / user ID 1</span><h1>Voucher control room</h1><p>Create, monitor, and revoke account-bound member stat vouchers.</p></div><button type="button" className="secondary-button" onClick={refresh} disabled={loading}><RefreshCw aria-hidden="true" size={16} /> {loading ? 'Refreshing…' : 'Refresh'}</button></section>
    {message ? <p className={`voucher-message voucher-message-${messageTone || 'success'}`} role="status" aria-live="polite">{message}</p> : null}
    <section className="voucher-admin-metrics" aria-label="Voucher overview">{[['Vouchers', metrics.totalVouchers], ['Active', metrics.activeVouchers], ['Redemptions', metrics.totalRedemptions], ['Points issued', metrics.pointsIssued], ['Points used', metrics.pointsUsed]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{numberFormatter.format(Number(value ?? 0))}</strong></article>)}</section>
    <section className="panel-card"><div className="voucher-panel-heading"><div><span className="eyebrow">{editing ? 'Edit voucher' : 'Issue voucher'}</span><h2>{editing ? editing.name : 'Create a member stat editor'}</h2></div>{editing ? <button type="button" className="icon-button" onClick={() => { setEditing(null); setForm(initialForm); }} aria-label="Cancel editing"><X aria-hidden="true" size={18} /></button> : <Ticket aria-hidden="true" size={24} />}</div><VoucherForm form={form} setForm={setForm} onSubmit={submit} busy={busy} editing={Boolean(editing)} locked={Boolean(editing?.redemptionCount)} onCancel={editing ? () => { setEditing(null); setForm(initialForm); } : null} /></section>
    {voucherDetail ? <DetailPanel detail={voucherDetail} onClose={() => setVoucherDetail(null)} /> : null}
    {redemptionDetail ? <RedemptionDetail detail={redemptionDetail} onClose={() => setRedemptionDetail(null)} onRevoke={() => action(`/api/admin/voucher-redemptions/${redemptionDetail.redemption.redemption_id}/revoke`, 'Redemption revoked.')} /> : null}
    <section className="panel-card"><div className="voucher-panel-heading"><div><span className="eyebrow">Inventory</span><h2>Vouchers</h2></div><div className="voucher-admin-filters"><SearchFilter name="voucher-search" label="Search vouchers" value={search} onChange={(event) => { setSearch(event.target.value); setVoucherPage(1); }} placeholder="e.g. summer…" /><label><span className="sr-only">Filter vouchers by status</span><select name="voucher-status" aria-label="Filter vouchers by status" value={status} onChange={(event) => { setStatus(event.target.value); setVoucherPage(1); }}><option value="">All statuses</option><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="revoked">Revoked</option><option value="expired">Expired</option><option value="exhausted">Exhausted</option></select></label><label><span className="sr-only">Sort vouchers by</span><select name="voucher-sort" aria-label="Sort vouchers by" value={voucherSort} onChange={(event) => { setVoucherSort(event.target.value); setVoucherPage(1); }}><option value="created">Newest</option><option value="expiry">Expiry</option><option value="redemptions">Redemptions</option><option value="status">Status</option><option value="code">Code</option><option value="name">Name</option></select></label><label><span className="sr-only">Voucher sort direction</span><select name="voucher-direction" aria-label="Voucher sort direction" value={voucherDirection} onChange={(event) => { setVoucherDirection(event.target.value); setVoucherPage(1); }}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label></div></div><div className="voucher-table-wrap" aria-busy={loading}><table className="voucher-table voucher-inventory-table"><caption className="sr-only">Voucher inventory</caption><thead><tr><th scope="col">Voucher</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Usage</th><th scope="col">Points</th><th scope="col">Validity</th><th scope="col">Actions</th></tr></thead><tbody>{vouchers.map((voucher) => <tr key={voucher.voucherId}><td><strong>{voucher.name}</strong><small><code translate="no">{voucher.code}</code></small></td><td>{voucher.type}</td><td><VoucherStatus status={voucher.status} /></td><td>{voucher.redemptionCount}{voucher.maxRedemptions ? ` / ${voucher.maxRedemptions}` : ''}</td><td>{voucher.pointsUsed} / {voucher.pointsIssued}</td><td><small>{formatDate(voucher.validFrom)}{voucher.expiresAt ? ` – ${formatDate(voucher.expiresAt)}` : ''}</small></td><td className="voucher-row-actions"><button type="button" onClick={() => showVoucher(voucher.voucherId)}>View</button><button type="button" onClick={() => edit(voucher)}>Edit</button>{voucher.status === 'active' ? <button type="button" aria-label={`Pause ${voucher.name}`} title={`Pause ${voucher.name}`} onClick={() => action(`/api/admin/vouchers/${voucher.voucherId}/pause`, 'Voucher paused.')}><Pause aria-hidden="true" size={16} /></button> : voucher.status !== 'revoked' ? <button type="button" aria-label={`Activate ${voucher.name}`} title={`Activate ${voucher.name}`} onClick={() => action(`/api/admin/vouchers/${voucher.voucherId}/activate`, 'Voucher activated.')}><Play aria-hidden="true" size={16} /></button> : null}<button type="button" aria-label={`Duplicate ${voucher.name}`} title={`Duplicate ${voucher.name}`} onClick={() => action(`/api/admin/vouchers/${voucher.voucherId}/duplicate`, 'Voucher duplicated.')}><Copy aria-hidden="true" size={16} /></button>{voucher.status !== 'revoked' ? <button type="button" className="danger-link" onClick={() => action(`/api/admin/vouchers/${voucher.voucherId}/revoke`, 'Voucher revoked.')}>Revoke</button> : null}</td></tr>)}</tbody></table>{!vouchers.length ? emptyOrLoading('No vouchers match these filters.') : null}</div><Pagination page={voucherPage} pageSize={pageSize} total={voucherTotal} onChange={setVoucherPage} /></section>
    <section className="panel-card"><div className="voucher-panel-heading"><div><span className="eyebrow">Account activity</span><h2>Redemptions</h2></div><div className="voucher-admin-filters"><SearchFilter name="redemption-search" label="Search redemptions" value={redemptionSearch} onChange={(event) => { setRedemptionSearch(event.target.value); setRedemptionPage(1); }} placeholder="e.g. username…" /><label><span className="sr-only">Filter redemptions by status</span><select name="redemption-status" aria-label="Filter redemptions by status" value={redemptionStatus} onChange={(event) => { setRedemptionStatus(event.target.value); setRedemptionPage(1); }}><option value="">All statuses</option><option value="active">Active</option><option value="depleted">Depleted</option><option value="revoked">Revoked</option></select></label><Activity aria-hidden="true" className="voucher-filter-icon" size={20} /></div></div><div className="voucher-table-wrap" aria-busy={loading}><table className="voucher-table voucher-redemption-table"><caption className="sr-only">Voucher redemptions</caption><thead><tr><th scope="col">User</th><th scope="col">Voucher</th><th scope="col">Redeemed</th><th scope="col">Points</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>{redemptions.map((item) => <tr key={item.redemption_id}><td>{item.username || item.user_id}</td><td><strong>{item.name}</strong><small><code translate="no">{item.code}</code></small></td><td>{formatDateTime(item.redeemed_at)}</td><td>{item.points_used} / {item.points_total}</td><td><VoucherStatus status={item.status} /></td><td className="voucher-row-actions"><button type="button" onClick={() => showRedemption(item.redemption_id)}>View</button>{item.status !== 'revoked' ? <button type="button" className="danger-link" onClick={() => action(`/api/admin/voucher-redemptions/${item.redemption_id}/revoke`, 'Redemption revoked.')}>Revoke</button> : null}</td></tr>)}</tbody></table>{!redemptions.length ? emptyOrLoading('No redemptions match these filters.') : null}</div><Pagination page={redemptionPage} pageSize={pageSize} total={redemptionTotal} onChange={setRedemptionPage} /></section>
    <section className="panel-card"><div className="voucher-panel-heading"><div><span className="eyebrow">Audit</span><h2>Edit log</h2></div><div className="voucher-admin-filters"><SearchFilter name="audit-search" label="Search audit log" value={logSearch} onChange={(event) => { setLogSearch(event.target.value); setLogPage(1); }} placeholder="e.g. member…" /><label><span className="sr-only">Filter audit log by stat</span><select name="audit-stat" aria-label="Filter audit log by stat" value={logStat} onChange={(event) => { setLogStat(event.target.value); setLogPage(1); }}><option value="">All stats</option>{VOUCHER_MEMBER_STATS.map((stat) => <option key={stat} value={stat}>{voucherStatLabel(stat)}</option>)}</select></label><ShieldAlert aria-hidden="true" className="voucher-filter-icon" size={20} /></div></div><div className="voucher-table-wrap" aria-busy={loading}><table className="voucher-table voucher-audit-table"><caption className="sr-only">Voucher edit audit log</caption><thead><tr><th scope="col">Date</th><th scope="col">User</th><th scope="col">Voucher</th><th scope="col">Member</th><th scope="col">Stat</th><th scope="col">Values</th><th scope="col">Delta</th><th scope="col">Points</th></tr></thead><tbody>{logs.map((item) => <tr key={item.edit_id}><td>{formatDateTime(item.created_at)}</td><td>{item.username || item.user_id}</td><td><code translate="no">{item.code}</code></td><td>{item.member_id}</td><td>{item.stat}</td><td>{item.display_value_before} → {item.display_value_after}</td><td className={item.delta > 0 ? 'positive' : item.delta < 0 ? 'negative' : ''}>{item.delta > 0 ? '+' : ''}{item.delta}</td><td>{item.points_used}</td></tr>)}</tbody></table>{!logs.length ? emptyOrLoading('No edits match these filters.') : null}</div><Pagination page={logPage} pageSize={pageSize} total={logTotal} onChange={setLogPage} /></section>
  </main>;
}

function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
