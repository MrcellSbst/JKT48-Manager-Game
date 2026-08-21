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
    setBusy(true);
    setMessage('');
    try {
      await redeem(code);
      setCode('');
      setMessage('Voucher redeemed.');
    } catch (nextError) {
      setMessage(nextError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="voucher-inventory panel-card">
      <div className="voucher-panel-heading">
        <div>
          <span className="eyebrow">Account vouchers</span>
          <h2>Member stat editors</h2>
          <p>Redeem a code, then spend points on eligible roster members.</p>
        </div>
        <Ticket aria-hidden="true" size={25} />
      </div>
      <form className="voucher-redeem-form" onSubmit={submit}>
        <label>
          <span>Voucher code</span>
          <input name="voucher-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="JKT48-XXXX-XXXX…" autoComplete="off" spellCheck={false} />
        </label>
        <button type="submit" className="setup-primary" disabled={busy || !code.trim()}>
          {busy ? 'Redeeming…' : 'Redeem'} <Plus aria-hidden="true" size={17} />
        </button>
      </form>
      {message || error ? <p className="voucher-message" role="status">{message || error}</p> : null}
      {loading ? <p className="muted-copy">Loading vouchers…</p> : null}
      {redemptions.length ? (
        <div className="voucher-inventory-list">
          {redemptions.map((redemption) => (
            <article className="voucher-inventory-item" key={redemption.redemptionId}>
              <div>
                <strong>{redemption.voucher?.name || redemption.voucher?.code}</strong>
                <small>{redemption.voucher?.code}{redemption.voucher?.expiresAt ? ` · Expires ${formatDate(redemption.voucher.expiresAt)}` : ''}</small>
              </div>
              <span className={`voucher-status voucher-status-${redemption.status}`}>{redemption.pointsRemaining}/{redemption.pointsTotal} points</span>
            </article>
          ))}
        </div>
      ) : <p className="muted-copy">No redeemed vouchers yet.</p>}
    </section>
  );
}

function clampDelta(value, min, max) {
  return Math.min(max, Math.max(min, Number.isInteger(value) ? value : min));
}

export function VoucherEditModal({ member, initialStat = 'vocal', language = 'en', onClose }) {
  const { redemptions, editStat } = useVouchers();
  const [stat, setStat] = useState(initialStat);
  const [redemptionId, setRedemptionId] = useState('');
  const [delta, setDelta] = useState(1);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const eligible = useMemo(() => redemptions.filter((item) => item.status === 'active' && item.pointsRemaining > 0 && item.voucher?.allowedStats?.includes(stat)), [redemptions, stat]);
  const editableStats = useMemo(() => VOUCHER_MEMBER_STATS.filter((item) => redemptions.some((redemption) => redemption.status === 'active' && redemption.pointsRemaining > 0 && redemption.voucher?.allowedStats?.includes(item))), [redemptions]);
  const selectedRedemption = eligible.find((item) => item.redemptionId === redemptionId) ?? eligible[0];
  const selectedStat = Number(member?.[stat] ?? 0);
  const adjustment = Number(member?.voucherAdjustments?.[stat] ?? 0);
  const base = Number(member?.voucherBaseStats?.[stat] ?? (selectedStat - adjustment));
  const statUsed = selectedRedemption?.usage?.filter((item) => item.stat === stat).reduce((sum, item) => sum + Number(item.pointsUsed ?? 0), 0) ?? 0;
  const memberUsed = selectedRedemption?.usage?.filter((item) => item.memberId === member.id).reduce((sum, item) => sum + Number(item.pointsUsed ?? 0), 0) ?? 0;
  const maxDelta = selectedRedemption ? Math.max(0, Math.min(selectedRedemption.pointsRemaining, Number(selectedRedemption.voucher.maxIncreasePerStat) - statUsed, Number(selectedRedemption.voucher.maxIncreasePerMember) - memberUsed)) : 0;
  const minDelta = selectedRedemption?.voucher.allowDecrease ? -maxDelta : Math.min(1, maxDelta);
  const boundedDelta = clampDelta(delta, minDelta, maxDelta);
  const title = language === 'id' ? 'Edit statistik anggota' : 'Edit member stat';
  const adjustDelta = (amount) => setDelta((current) => clampDelta(current + amount, minDelta, maxDelta));

  const submit = async (event) => {
    event.preventDefault();
    if (!selectedRedemption || boundedDelta === 0 || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await editStat({ redemptionId: selectedRedemption.redemptionId, memberId: member.id, stat, delta: boundedDelta });
      onClose();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup-modal-backdrop voucher-edit-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="voucher-edit-modal" role="dialog" aria-modal="true" aria-labelledby="voucher-edit-title">
        <header>
          <div>
            <span className="eyebrow">Voucher points</span>
            <h2 id="voucher-edit-title">{title}</h2>
            <p>{member.nickname || member.name}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X aria-hidden="true" size={19} /></button>
        </header>
        {eligible.length ? (
          <form onSubmit={submit}>
            <label>
              <span>Voucher</span>
              <select value={selectedRedemption?.redemptionId ?? ''} onChange={(event) => setRedemptionId(event.target.value)}>
                {eligible.map((item) => <option key={item.redemptionId} value={item.redemptionId}>{item.voucher.code} · {item.pointsRemaining} points</option>)}
              </select>
            </label>
            <label>
              <span>Stat</span>
              <select value={stat} onChange={(event) => { setStat(event.target.value); setDelta(1); }}>
                {editableStats.map((item) => <option key={item} value={item}>{voucherStatLabel(item)}</option>)}
              </select>
            </label>
            <div className="voucher-stat-preview">
              <span>Natural base <strong>{Math.round(base)}</strong></span>
              <span>Voucher adjustment <strong>{adjustment > 0 ? '+' : ''}{Math.round(adjustment)}</strong></span>
              <span>Displayed <strong>{Math.round(selectedStat)}</strong></span>
            </div>
            <fieldset className="voucher-delta-control">
              <legend>Change</legend>
              <button type="button" className="voucher-delta-button" onClick={() => adjustDelta(-1)} disabled={busy || boundedDelta <= minDelta} aria-label="Decrease stat change">−</button>
              <output aria-live="polite" aria-label="Stat change">{boundedDelta > 0 ? '+' : ''}{boundedDelta}</output>
              <button type="button" className="voucher-delta-button" onClick={() => adjustDelta(1)} disabled={busy || boundedDelta >= maxDelta} aria-label="Increase stat change">+</button>
            </fieldset>
            <p className="voucher-delta-help">{selectedRedemption?.voucher.allowDecrease ? 'Use − for decrease or + for increase.' : 'This voucher only allows increases.'} Maximum available: {maxDelta} point{maxDelta === 1 ? '' : 's'}.</p>
            {message ? <p className="voucher-message" role="alert">{message}</p> : null}
            <div className="confirm-week-actions">
              <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
              <button type="submit" className="setup-primary" disabled={busy || !selectedRedemption || boundedDelta === 0}>{busy ? 'Applying…' : 'Apply points'} <Check aria-hidden="true" size={17} /></button>
            </div>
          </form>
        ) : (
          <>
            <p className="muted-copy">No active voucher can edit this stat. Redeem a voucher or choose another stat.</p>
            <div className="confirm-week-actions"><button type="button" className="setup-primary" onClick={onClose}>Close</button></div>
          </>
        )}
      </section>
    </div>
  );
}

export function VoucherStatButton({ member, stat, onEdit }) {
  const { redemptions } = useVouchers();
  const adjustment = Number(member?.voucherAdjustments?.[stat] ?? 0);
  const canEdit = redemptions.some((item) => item.status === 'active' && item.pointsRemaining > 0 && item.voucher?.allowedStats?.includes(stat));
  return (
    <span className="voucher-stat-cell">
      <strong>{Math.round(member?.[stat] ?? 0)}</strong>
      {adjustment ? <small className="voucher-adjustment">{adjustment > 0 ? '+' : ''}{Math.round(adjustment)} voucher</small> : null}
      {canEdit ? <button type="button" className="voucher-edit-trigger" onClick={() => onEdit(stat)} aria-label={`Edit ${voucherStatLabel(stat)}`} title={`Edit ${voucherStatLabel(stat)}`}><Pencil aria-hidden="true" size={13} /></button> : null}
    </span>
  );
}
