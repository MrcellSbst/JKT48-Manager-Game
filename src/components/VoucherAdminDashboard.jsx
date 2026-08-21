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

const toDateTimeLocal = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function VoucherForm({ form, setForm, onSubmit, busy, editing = false, locked = false, onCancel }) {
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleStat = (stat) => update('allowedStats', form.allowedStats.includes(stat) ? form.allowedStats.filter((item) => item !== stat) : [...form.allowedStats, stat]);
  return <form className="voucher-admin-form" onSubmit={onSubmit}>
    <div className="voucher-admin-form-grid">
      <label><span>Name</span><input required value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
      <label><span>Code {editing ? '(locked after redemption)' : ''}</span><input value={form.code} disabled={editing && locked} onChange={(event) => update('code', event.target.value.toUpperCase())} placeholder="Leave empty to generate" /></label>
      <label className="voucher-wide"><span>Description</span><textarea value={form.description} onChange={(event) => update('description', event.target.value)} rows="2" /></label>
      <label><span>Type</span><select value={form.type} disabled><option value="member-stat-editor">Member stat editor</option></select></label>
      <label><span>Total points</span><input type="number" min="1" required value={form.totalPoints} disabled={locked} onChange={(event) => update('totalPoints', Number(event.target.value))} /></label>
      <label><span>Max / stat</span><input type="number" min="0" required value={form.maxIncreasePerStat} disabled={locked} onChange={(event) => update('maxIncreasePerStat', Number(event.target.value))} /></label>
      <label><span>Max / member</span><input type="number" min="0" required value={form.maxIncreasePerMember} disabled={locked} onChange={(event) => update('maxIncreasePerMember', Number(event.target.value))} /></label>
      <label><span>Max redemptions</span><input type="number" min="1" value={form.maxRedemptions} onChange={(event) => update('maxRedemptions', event.target.value)} placeholder="Unlimited" /></label>
      <label><span>Max per user</span><input type="number" min="1" value={form.maxRedemptionsPerUser} onChange={(event) => update('maxRedemptionsPerUser', event.target.value)} placeholder="Unlimited" /></label>
      <label><span>Lifecycle</span><select value={form.lifecycleStatus} onChange={(event) => update('lifecycleStatus', event.target.value)}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option></select></label>
      <label><span>Valid from</span><input type="datetime-local" value={form.validFrom} onChange={(event) => update('validFrom', event.target.value)} /></label>
      <label><span>Expires at</span><input type="datetime-local" value={form.expiresAt} onChange={(event) => update('expiresAt', event.target.value)} /></label>
      <label><span>Target user IDs</span><input value={form.targetUserIds} onChange={(event) => update('targetUserIds', event.target.value)} placeholder="Optional, comma separated" /></label>
      <fieldset className="voucher-stat-picker voucher-wide"><legend>Allowed stats {locked ? '(locked)' : ''}</legend>{VOUCHER_MEMBER_STATS.map((stat) => <label key={stat}><input type="checkbox" checked={form.allowedStats.includes(stat)} disabled={locked} onChange={() => toggleStat(stat)} />{voucherStatLabel(stat)}</label>)}</fieldset>
      <label className="voucher-check"><input type="checkbox" checked={form.allowDecrease} disabled={locked} onChange={(event) => update('allowDecrease', event.target.checked)} />Allow decreases</label>
      <label className="voucher-check"><input type="checkbox" checked={form.allowMultipleMembers} disabled={locked} onChange={(event) => update('allowMultipleMembers', event.target.checked)} />Allow multiple members</label>
    </div>
    <div className="voucher-admin-form-actions"><button type="submit" className="setup-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save voucher' : 'Create voucher'} <Plus size={16} /></button>{onCancel ? <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button> : null}</div>
  </form>;
}

function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return <div className="voucher-pagination"><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button><span>Page {page} / {pages}</span><button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button></div>;
}

function DetailPanel({ detail, onClose }) {
  if (!detail) return null;
  const voucher = detail.voucher;
  return <section className="panel-card voucher-detail-panel"><header><div><span className="eyebrow">Voucher detail</span><h2>{voucher.name}</h2><p>{voucher.code} · {voucher.status}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close detail"><X size={18} /></button></header><div className="voucher-detail-grid"><span><small>Type</small><strong>{voucher.type}</strong></span><span><small>Usage</small><strong>{voucher.redemptionCount}{voucher.maxRedemptions ? ` / ${voucher.maxRedemptions}` : ''}</strong></span><span><small>Points</small><strong>{voucher.pointsUsed} / {voucher.pointsIssued}</strong></span><span><small>Validity</small><strong>{voucher.validFrom ? new Date(voucher.validFrom).toLocaleString() : 'Any time'}{voucher.expiresAt ? ` → ${new Date(voucher.expiresAt).toLocaleString()}` : ''}</strong></span></div><p className="muted-copy">{voucher.description || 'No description.'}</p><h3>Redemptions</h3><div className="voucher-table-wrap"><table className="voucher-table"><thead><tr><th>User</th><th>Status</th><th>Points</th><th>Redeemed</th></tr></thead><tbody>{(detail.redemptions ?? []).map((item) => <tr key={item.redemption_id}><td>{item.username || item.user_id}</td><td>{item.status}</td><td>{item.points_used} / {item.points_total}</td><td>{item.redeemed_at}</td></tr>)}</tbody></table></div><h3>Admin audit</h3><div className="voucher-activity-list">{(detail.audit ?? []).slice(0, 20).map((item) => <div key={item.audit_id}><span>{item.action}</span><strong>{item.admin_user_id}</strong><small>{item.created_at}</small></div>)}</div></section>;
}

function RedemptionDetail({ detail, onClose, onRevoke }) {
  if (!detail) return null;
  const item = detail.redemption;
  const lockedMembers = [...new Set((detail.edits ?? []).map((edit) => edit.member_id))];
  return <section className="panel-card voucher-detail-panel"><header><div><span className="eyebrow">Redemption detail</span><h2>{item.code}</h2><p>{item.username || item.user_id}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close redemption detail"><X size={18} /></button></header><div className="voucher-detail-grid"><span><small>Status</small><strong>{item.status}</strong></span><span><small>Points</small><strong>{item.points_used} / {item.points_total}</strong></span><span><small>Locked member</small><strong>{lockedMembers.length ? lockedMembers.join(', ') : 'None'}</strong></span><span><small>Redeemed</small><strong>{item.redeemed_at}</strong></span></div><h3>Edit history</h3><div className="voucher-table-wrap"><table className="voucher-table"><thead><tr><th>Member</th><th>Stat</th><th>Before → after</th><th>Delta</th><th>Date</th></tr></thead><tbody>{(detail.edits ?? []).map((edit) => <tr key={edit.edit_id}><td>{edit.member_id}</td><td>{edit.stat}</td><td>{edit.display_value_before} → {edit.display_value_after}</td><td>{edit.delta > 0 ? '+' : ''}{edit.delta}</td><td>{edit.created_at}</td></tr>)}</tbody></table></div>{item.status !== 'revoked' ? <button type="button" className="danger-link voucher-detail-revoke" onClick={onRevoke}>Revoke redemption</button> : null}</section>;
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
  const pageSize = 25;

  const load = useCallback(async () => {
    const voucherQuery = new URLSearchParams({ search, status, sort: voucherSort, direction: voucherDirection, page: String(voucherPage), pageSize: String(pageSize) });
    const redemptionQuery = new URLSearchParams({ search: redemptionSearch, status: redemptionStatus, page: String(redemptionPage), pageSize: String(pageSize) });
    const logQuery = new URLSearchParams({ search: logSearch, stat: logStat, page: String(logPage), pageSize: String(pageSize) });
    const [nextOverview, nextVouchers, nextRedemptions, nextLogs] = await Promise.all([
      api('/api/admin/voucher-overview'), api(`/api/admin/vouchers?${voucherQuery}`), api(`/api/admin/voucher-redemptions?${redemptionQuery}`), api(`/api/admin/voucher-edit-logs?${logQuery}`),
    ]);
    setOverview(nextOverview); setVouchers(nextVouchers.vouchers ?? []); setVoucherTotal(Number(nextVouchers.total ?? 0)); setRedemptions(nextRedemptions.redemptions ?? []); setRedemptionTotal(Number(nextRedemptions.total ?? 0)); setLogs(nextLogs.logs ?? []); setLogTotal(Number(nextLogs.total ?? 0));
  }, [search, status, voucherSort, voucherDirection, redemptionSearch, redemptionStatus, logSearch, logStat, voucherPage, redemptionPage, logPage]);
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [load]);

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const payload = { ...form, targetUserIds: form.targetUserIds.split(',').map((item) => item.trim()).filter(Boolean), maxRedemptions: form.maxRedemptions || null, maxRedemptionsPerUser: form.maxRedemptionsPerUser || null };
      if (editing) await api(`/api/admin/vouchers/${editing.voucherId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      else await api('/api/admin/vouchers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setForm(initialForm); setEditing(null); await load(); setMessage(editing ? 'Voucher updated.' : 'Voucher created.');
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  const action = async (path, success) => { if (path.endsWith('/revoke') && !window.confirm('Confirm this permanent revoke? Existing redemptions will stop being usable.')) return; setBusy(true); setMessage(''); try { await api(path, { method: 'POST' }); await load(); setMessage(success); } catch (error) { setMessage(error.message); } finally { setBusy(false); } };
  const edit = (voucher) => { setEditing(voucher); setForm({ ...initialForm, ...voucher, code: voucher.code, targetUserIds: (voucher.targetUserIds ?? []).join(', '), maxRedemptions: voucher.maxRedemptions ?? '', maxRedemptionsPerUser: voucher.maxRedemptionsPerUser ?? '', validFrom: toDateTimeLocal(voucher.validFrom), expiresAt: toDateTimeLocal(voucher.expiresAt) }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const showVoucher = async (voucherId) => { try { setVoucherDetail((await api(`/api/admin/vouchers/${voucherId}`))); } catch (error) { setMessage(error.message); } };
  const showRedemption = async (redemptionId) => { try { setRedemptionDetail((await api(`/api/admin/voucher-redemptions/${redemptionId}`))); } catch (error) { setMessage(error.message); } };
  const metrics = overview?.totals ?? {};
  const resetPage = (setter) => (value) => setter(value);

  return <main className="page voucher-admin-page">
    <section className="page-heading"><div>{onBack ? <button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={16} /> Back</button> : null}<span className="eyebrow">Administrator · user ID 1</span><h1>Voucher control room</h1><p>Create, monitor, and revoke account-bound member stat vouchers.</p></div><button type="button" className="secondary-button" onClick={() => load()}><RefreshCw size={16} /> Refresh</button></section>
    {message ? <p className="voucher-message" role="status">{message}</p> : null}
    <section className="voucher-admin-metrics">{[['Vouchers', metrics.totalVouchers], ['Active', metrics.activeVouchers], ['Redemptions', metrics.totalRedemptions], ['Points issued', metrics.pointsIssued], ['Points used', metrics.pointsUsed]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{Number(value ?? 0).toLocaleString()}</strong></article>)}</section>
    <section className="panel-card"><div className="voucher-panel-heading"><div><span className="eyebrow">{editing ? 'Edit voucher' : 'Issue voucher'}</span><h2>{editing ? editing.name : 'Create a member stat editor'}</h2></div>{editing ? <button type="button" className="icon-button" onClick={() => { setEditing(null); setForm(initialForm); }} aria-label="Cancel editing"><X size={18} /></button> : <Ticket size={24} />}</div><VoucherForm form={form} setForm={setForm} onSubmit={submit} busy={busy} editing={Boolean(editing)} locked={Boolean(editing?.redemptionCount)} onCancel={editing ? () => { setEditing(null); setForm(initialForm); } : null} /></section>
    {voucherDetail ? <DetailPanel detail={voucherDetail} onClose={() => setVoucherDetail(null)} /> : null}
    {redemptionDetail ? <RedemptionDetail detail={redemptionDetail} onClose={() => setRedemptionDetail(null)} onRevoke={() => action(`/api/admin/voucher-redemptions/${redemptionDetail.redemption.redemption_id}/revoke`, 'Redemption revoked.')} /> : null}
    <section className="panel-card"><div className="voucher-panel-heading"><div><span className="eyebrow">Inventory</span><h2>Vouchers</h2></div><div className="voucher-admin-filters"><label><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setVoucherPage(1); }} placeholder="Search code or name" /></label><select value={status} onChange={(event) => { setStatus(event.target.value); setVoucherPage(1); }}><option value="">All statuses</option><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="revoked">Revoked</option><option value="expired">Expired</option><option value="exhausted">Exhausted</option></select></div></div><div className="voucher-table-wrap"><table className="voucher-table"><thead><tr><th>Voucher</th><th>Type</th><th>Status</th><th>Usage</th><th>Points</th><th>Validity</th><th>Actions</th></tr></thead><tbody>{vouchers.map((voucher) => <tr key={voucher.voucherId}><td><strong>{voucher.name}</strong><small>{voucher.code}</small></td><td>{voucher.type}</td><td><span className={`voucher-status voucher-status-${voucher.status}`}>{voucher.status}</span></td><td>{voucher.redemptionCount}{voucher.maxRedemptions ? ` / ${voucher.maxRedemptions}` : ''}</td><td>{voucher.pointsUsed} / {voucher.pointsIssued}</td><td><small>{voucher.validFrom ? new Date(voucher.validFrom).toLocaleDateString() : 'Any'}{voucher.expiresAt ? ` – ${new Date(voucher.expiresAt).toLocaleDateString()}` : ''}</small></td><td className="voucher-row-actions"><button type="button" onClick={() => showVoucher(voucher.voucherId)}>View</button><button type="button" onClick={() => edit(voucher)}>Edit</button>{voucher.status === 'active' ? <button type="button" onClick={() => action(`/api/admin/vouchers/${voucher.voucherId}/pause`, 'Voucher paused.')}><Pause size={14} /></button> : voucher.status !== 'revoked' ? <button type="button" onClick={() => action(`/api/admin/vouchers/${voucher.voucherId}/activate`, 'Voucher activated.')}><Play size={14} /></button> : null}<button type="button" onClick={() => action(`/api/admin/vouchers/${voucher.voucherId}/duplicate`, 'Voucher duplicated.')}><Copy size={14} /></button>{voucher.status !== 'revoked' ? <button type="button" className="danger-link" onClick={() => action(`/api/admin/vouchers/${voucher.voucherId}/revoke`, 'Voucher revoked.')}>Revoke</button> : null}</td></tr>)}</tbody></table>{!vouchers.length ? <p className="muted-copy">No vouchers match these filters.</p> : null}</div><Pagination page={voucherPage} pageSize={pageSize} total={voucherTotal} onChange={resetPage(setVoucherPage)} /></section>
    <section className="panel-card"><div className="voucher-panel-heading"><div><span className="eyebrow">Account activity</span><h2>Redemptions</h2></div><div className="voucher-admin-filters"><label><Search size={16} /><input value={redemptionSearch} onChange={(event) => { setRedemptionSearch(event.target.value); setRedemptionPage(1); }} placeholder="Search user or code" /></label><select value={redemptionStatus} onChange={(event) => { setRedemptionStatus(event.target.value); setRedemptionPage(1); }}><option value="">All statuses</option><option value="active">Active</option><option value="depleted">Depleted</option><option value="revoked">Revoked</option></select><Activity size={22} /></div></div><div className="voucher-table-wrap"><table className="voucher-table"><thead><tr><th>User</th><th>Voucher</th><th>Redeemed</th><th>Points</th><th>Status</th><th>Actions</th></tr></thead><tbody>{redemptions.map((item) => <tr key={item.redemption_id}><td>{item.username || item.user_id}</td><td><strong>{item.name}</strong><small>{item.code}</small></td><td>{item.redeemed_at}</td><td>{item.points_used} / {item.points_total}</td><td>{item.status}</td><td className="voucher-row-actions"><button type="button" onClick={() => showRedemption(item.redemption_id)}>View</button>{item.status !== 'revoked' ? <button type="button" className="danger-link" onClick={() => action(`/api/admin/voucher-redemptions/${item.redemption_id}/revoke`, 'Redemption revoked.')}>Revoke</button> : null}</td></tr>)}</tbody></table>{!redemptions.length ? <p className="muted-copy">No redemptions match these filters.</p> : null}</div><Pagination page={redemptionPage} pageSize={pageSize} total={redemptionTotal} onChange={resetPage(setRedemptionPage)} /></section>
    <section className="panel-card"><div className="voucher-panel-heading"><div><span className="eyebrow">Audit</span><h2>Edit log</h2></div><div className="voucher-admin-filters"><label><Search size={16} /><input value={logSearch} onChange={(event) => { setLogSearch(event.target.value); setLogPage(1); }} placeholder="Search user, voucher, member" /></label><select value={logStat} onChange={(event) => { setLogStat(event.target.value); setLogPage(1); }}><option value="">All stats</option>{VOUCHER_MEMBER_STATS.map((stat) => <option key={stat} value={stat}>{voucherStatLabel(stat)}</option>)}</select><ShieldAlert size={22} /></div></div><div className="voucher-table-wrap"><table className="voucher-table"><thead><tr><th>Date</th><th>User</th><th>Voucher</th><th>Member</th><th>Stat</th><th>Values</th><th>Delta</th><th>Points</th></tr></thead><tbody>{logs.map((item) => <tr key={item.edit_id}><td>{item.created_at}</td><td>{item.username || item.user_id}</td><td>{item.code}</td><td>{item.member_id}</td><td>{item.stat}</td><td>{item.display_value_before} → {item.display_value_after}</td><td>{item.delta > 0 ? '+' : ''}{item.delta}</td><td>{item.points_used}</td></tr>)}</tbody></table>{!logs.length ? <p className="muted-copy">No edits match these filters.</p> : null}</div><Pagination page={logPage} pageSize={pageSize} total={logTotal} onChange={resetPage(setLogPage)} /></section>
  </main>;
}
