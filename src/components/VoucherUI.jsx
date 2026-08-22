import { useMemo, useState } from 'react';
import { Check, Plus, Ticket, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useVouchers } from '../context/VoucherContext.jsx';
import { VOUCHER_MEMBER_STATS, voucherStatLabel } from '../data/voucher.js';
import { getActiveLanguage } from '../localization.js';

const formatDate = (value) => value ? new Intl.DateTimeFormat(getActiveLanguage() === 'id' ? 'id-ID' : 'en-US', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(new Date(value)) : null;

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

export function VoucherEditModal({ member, initialStat = 'vocal', language = 'en', onClose }) {
  const { redemptions, editStat } = useVouchers();
  const [redemptionId, setRedemptionId] = useState('');
  const [deltas, setDeltas] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const copy = language === 'id' ? {
    title: 'Edit statistik anggota', voucher: 'Voucher', points: 'poin', selected: 'Poin dipilih', remaining: 'Sisa setelah diedit',
    cancel: 'Batal', close: 'Tutup', apply: 'Terapkan perubahan', applying: 'Menerapkan…', empty: 'Tidak ada voucher aktif yang dapat mengedit anggota ini.',
    helpDecrease: 'Gunakan tombol − dan + untuk mengubah beberapa statistik sekaligus.', helpIncrease: 'Voucher ini hanya dapat menaikkan statistik.',
    decrease: 'Kurangi', increase: 'Tambah',
  } : {
    title: 'Edit member stats', voucher: 'Voucher', points: 'points', selected: 'Points selected', remaining: 'Remaining after edit',
    cancel: 'Cancel', close: 'Close', apply: 'Apply changes', applying: 'Applying…', empty: 'No active voucher can edit this member.',
    helpDecrease: 'Use − and + to change multiple stats before applying.', helpIncrease: 'This voucher only allows stat increases.',
    decrease: 'Decrease', increase: 'Increase',
  };
  const eligible = useMemo(() => redemptions.filter((item) => {
    if (item.status !== 'active' || item.pointsRemaining <= 0 || !item.voucher?.allowedStats?.length) return false;
    const usedMemberIds = new Set((item.usage ?? []).map((usage) => String(usage.memberId)));
    return item.voucher.allowMultipleMembers || usedMemberIds.size === 0 || usedMemberIds.has(String(member.id));
  }), [member.id, redemptions]);
  const selectedRedemption = eligible.find((item) => item.redemptionId === redemptionId)
    ?? eligible.find((item) => item.voucher.allowedStats.includes(initialStat))
    ?? eligible[0];
  const editableStats = useMemo(() => VOUCHER_MEMBER_STATS.filter((stat) => selectedRedemption?.voucher.allowedStats.includes(stat)), [selectedRedemption]);
  const usageByStat = useMemo(() => Object.fromEntries(editableStats.map((stat) => [stat, (selectedRedemption?.usage ?? []).filter((item) => item.stat === stat).reduce((sum, item) => sum + Number(item.pointsUsed ?? 0), 0)])), [editableStats, selectedRedemption]);
  const memberUsed = selectedRedemption?.usage?.filter((item) => String(item.memberId) === String(member.id)).reduce((sum, item) => sum + Number(item.pointsUsed ?? 0), 0) ?? 0;
  const selectedPoints = Object.values(deltas).reduce((sum, value) => sum + Math.abs(value), 0);
  const remainingPoints = Math.max(0, Number(selectedRedemption?.pointsRemaining ?? 0) - selectedPoints);

  const canAdjust = (stat, amount, currentDeltas = deltas) => {
    if (!selectedRedemption || busy) return false;
    const next = Number(currentDeltas[stat] ?? 0) + amount;
    if (!selectedRedemption.voucher.allowDecrease && next < 0) return false;
    const otherPoints = Object.entries(currentDeltas).reduce((sum, [key, value]) => key === stat ? sum : sum + Math.abs(value), 0);
    const nextPoints = otherPoints + Math.abs(next);
    return nextPoints <= Number(selectedRedemption.pointsRemaining)
      && memberUsed + nextPoints <= Number(selectedRedemption.voucher.maxIncreasePerMember)
      && Number(usageByStat[stat] ?? 0) + Math.abs(next) <= Number(selectedRedemption.voucher.maxIncreasePerStat);
  };

  const adjustStat = (stat, amount) => setDeltas((current) => {
    if (!canAdjust(stat, amount, current)) return current;
    const nextValue = Number(current[stat] ?? 0) + amount;
    if (nextValue === 0) {
      const next = { ...current };
      delete next[stat];
      return next;
    }
    return { ...current, [stat]: nextValue };
  });

  const submit = async (event) => {
    event.preventDefault();
    const edits = editableStats.flatMap((stat) => deltas[stat] ? [{ stat, delta: deltas[stat] }] : []);
    if (!selectedRedemption || edits.length === 0 || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await editStat({ redemptionId: selectedRedemption.redemptionId, memberId: member.id, edits });
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
            <h2 id="voucher-edit-title">{copy.title}</h2>
            <p>{member.nickname || member.name}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={copy.close}><X aria-hidden="true" size={19} /></button>
        </header>
        {selectedRedemption ? (
          <form onSubmit={submit}>
            <label>
              <span>{copy.voucher}</span>
              <select value={selectedRedemption.redemptionId} onChange={(event) => { setRedemptionId(event.target.value); setDeltas({}); setMessage(''); }}>
                {eligible.map((item) => <option key={item.redemptionId} value={item.redemptionId}>{item.voucher.code} · {item.pointsRemaining} {copy.points}</option>)}
              </select>
            </label>
            <div className="voucher-edit-summary" aria-live="polite">
              <span>{copy.selected}<strong>{selectedPoints}</strong></span>
              <span>{copy.remaining}<strong>{remainingPoints}</strong></span>
            </div>
            <div className="voucher-stat-grid">
              {editableStats.map((stat) => {
                const delta = Number(deltas[stat] ?? 0);
                const displayedValue = Math.min(100, Math.max(0, Number(member?.[stat] ?? 0) + delta));
                return (
                  <div className={delta ? 'voucher-stat-row is-edited' : 'voucher-stat-row'} key={stat}>
                    <span>{voucherStatLabel(stat)}</span>
                    <div className="voucher-stat-stepper">
                      <button type="button" onClick={() => adjustStat(stat, -1)} disabled={!canAdjust(stat, -1)} aria-label={`${copy.decrease} ${voucherStatLabel(stat)}`}>−</button>
                      <output aria-label={`${voucherStatLabel(stat)} ${Math.round(displayedValue)}`}>{Math.round(displayedValue)}</output>
                      <button type="button" onClick={() => adjustStat(stat, 1)} disabled={!canAdjust(stat, 1)} aria-label={`${copy.increase} ${voucherStatLabel(stat)}`}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="voucher-delta-help">{selectedRedemption.voucher.allowDecrease ? copy.helpDecrease : copy.helpIncrease}</p>
            {message ? <p className="voucher-message" role="alert">{message}</p> : null}
            <div className="confirm-week-actions">
              <button type="button" className="secondary-button" onClick={onClose}>{copy.cancel}</button>
              <button type="submit" className="setup-primary" disabled={busy || selectedPoints === 0}>{busy ? copy.applying : `${copy.apply} (${selectedPoints})`} <Check aria-hidden="true" size={17} /></button>
            </div>
          </form>
        ) : (
          <>
            <p className="muted-copy">{copy.empty}</p>
            <div className="confirm-week-actions"><button type="button" className="setup-primary" onClick={onClose}>{copy.close}</button></div>
          </>
        )}
      </section>
    </div>
  );
}
