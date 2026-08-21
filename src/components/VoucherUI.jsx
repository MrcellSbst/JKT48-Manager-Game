import { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Ticket, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useVouchers } from '../context/VoucherContext.jsx';
import { VOUCHER_MEMBER_STATS, voucherStatLabel } from '../data/voucher.js';

const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : null;

export function VoucherInventory() {
  const { user, authLoading } = useAuth();
  const { redemptions, loading, redeem, error } = useVouchers();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  if (authLoading || !user || String(user.user_id) === 'guest') return null;
  const submit = async (event) => {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true); setMessage('');
    try { await redeem(code); setCode(''); setMessage('Voucher redeemed.'); }
    catch (nextError) { setMessage(nextError.message); }
    finally { setBusy(false); }
  };
  return <section className="voucher-inventory panel-card"><div className="voucher-panel-heading"><div><span className="eyebrow">Account vouchers</span><h2>Member stat editors</h2><p>Redeem a code, then spend points on eligible roster members.</p></div><Ticket size={25} /></div><form className="voucher-redeem-form" onSubmit={submit}><label><span>Voucher code</span><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="JKT48-XXXX-XXXX" autoComplete="off" /></label><button type="submit" className="setup-primary" disabled={busy || !code.trim()}>{busy ? 'Redeeming…' : 'Redeem'} <Plus size={17} /></button></form>{message || error ? <p className="voucher-message" role="status">{message || error}</p> : null}{loading ? <p className="muted-copy">Loading vouchers…</p> : null}{redemptions.length ? <div className="voucher-inventory-list">{redemptions.map((redemption) => <article className="voucher-inventory-item" key={redemption.redemptionId}><div><strong>{redemption.voucher?.name || redemption.voucher?.code}</strong><small>{redemption.voucher?.code}{redemption.voucher?.expiresAt ? ` · Expires ${formatDate(redemption.voucher.expiresAt)}` : ''}</small></div><span className={`voucher-status voucher-status-${redemption.status}`}>{redemption.pointsRemaining}/{redemption.pointsTotal} points</span></article>)}</div> : <p className="muted-copy">No redeemed vouchers yet.</p>}</section>;
}

export function VoucherEditModal({ member, language = 'en', onClose }) {
  const { redemptions, editStat } = useVouchers();
  const [stat, setStat] = useState('vocal');
  const [redemptionId, setRedemptionId] = useState('');
  const [delta, setDelta] = useState(1);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const eligible = useMemo(() => redemptions.filter((item) => item.status === 'active' && item.pointsRemaining > 0 && item.voucher?.allowedStats?.includes(stat)), [redemptions, stat]);
  const selectedRedemption = eligible.find((item) => item.redemptionId === redemptionId) ?? eligible[0];
  const selectedStat = member?.[stat] ?? 0;
  const adjustment = Number(member?.voucherAdjustments?.[stat] ?? 0);
  const base = Number(member?.voucherBaseStats?.[stat] ?? (selectedStat - adjustment));
  const current = Number(selectedStat);
  const statUsed = selectedRedemption?.usage?.filter((item) => item.stat === stat).reduce((sum, item) => sum + Number(item.pointsUsed ?? 0), 0) ?? 0;
  const memberUsed = selectedRedemption?.usage?.filter((item) => item.memberId === member.id).reduce((sum, item) => sum + Number(item.pointsUsed ?? 0), 0) ?? 0;
  const maxDelta = selectedRedemption ? Math.max(0, Math.min(selectedRedemption.pointsRemaining, Number(selectedRedemption.voucher.maxIncreasePerStat) - statUsed, Number(selectedRedemption.voucher.maxIncreasePerMember) - memberUsed)) : 0;
  const title = language === 'id' ? 'Edit statistik anggota' : 'Edit member stat';
  const submit = async (event) => {
    event.preventDefault();
    if (!selectedRedemption || !Number.isInteger(Number(delta)) || Number(delta) === 0 || busy) return;
    setBusy(true); setMessage('');
    try { await editStat({ redemptionId: selectedRedemption.redemptionId, memberId: member.id, stat, delta: Number(delta) }); onClose(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="voucher-edit-modal" role="dialog" aria-modal="true" aria-labelledby="voucher-edit-title"><header><div><span className="eyebrow">Voucher points</span><h2 id="voucher-edit-title">{title}</h2><p>{member.nickname || member.name}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>{eligible.length ? <form onSubmit={submit}><label><span>Voucher</span><select value={selectedRedemption?.redemptionId ?? ''} onChange={(event) => setRedemptionId(event.target.value)}>{eligible.map((item) => <option key={item.redemptionId} value={item.redemptionId}>{item.voucher.code} · {item.pointsRemaining} points</option>)}</select></label><label><span>Stat</span><select value={stat} onChange={(event) => setStat(event.target.value)}>{VOUCHER_MEMBER_STATS.filter((item) => redemptions.some((redemption) => redemption.status === 'active' && redemption.pointsRemaining > 0 && redemption.voucher?.allowedStats?.includes(item))).map((item) => <option key={item} value={item}>{voucherStatLabel(item)}</option>)}</select></label><div className="voucher-stat-preview"><span>Natural base <strong>{Math.round(base)}</strong></span><span>Voucher adjustment <strong>{adjustment > 0 ? '+' : ''}{Math.round(adjustment)}</strong></span><span>Displayed <strong>{Math.round(current)}</strong></span></div><label><span>Change (negative allowed only if voucher permits)</span><input type="number" step="1" min={selectedRedemption?.voucher.allowDecrease ? -maxDelta : 1} max={maxDelta} value={delta} onChange={(event) => setDelta(Number(event.target.value))} /></label>{message ? <p className="voucher-message" role="alert">{message}</p> : null}<div className="confirm-week-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="setup-primary" disabled={busy || !selectedRedemption}>{busy ? 'Applying…' : 'Apply points'} <Check size={17} /></button></div></form> : <><p className="muted-copy">No active voucher can edit this stat. Redeem a voucher or choose another stat.</p><div className="confirm-week-actions"><button type="button" className="setup-primary" onClick={onClose}>Close</button></div></>}</section></div>;
}

export function VoucherStatButton({ member, stat, onEdit }) {
  const { redemptions } = useVouchers();
  const adjustment = Number(member?.voucherAdjustments?.[stat] ?? 0);
  const canEdit = redemptions.some((item) => item.status === 'active' && item.pointsRemaining > 0 && item.voucher?.allowedStats?.includes(stat));
  return <span className="voucher-stat-cell"><strong>{Math.round(member?.[stat] ?? 0)}</strong>{adjustment ? <small className="voucher-adjustment">{adjustment > 0 ? '+' : ''}{Math.round(adjustment)} voucher</small> : null}{canEdit ? <button type="button" className="voucher-edit-trigger" onClick={() => onEdit(stat)} aria-label={`Edit ${voucherStatLabel(stat)}`} title={`Edit ${voucherStatLabel(stat)}`}><Pencil size={13} /></button> : null}</span>;
}
