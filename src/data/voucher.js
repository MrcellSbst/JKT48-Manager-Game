export const VOUCHER_MEMBER_STATS = Object.freeze([
  'vocal', 'dance', 'performance', 'mc', 'variety', 'stamina', 'popularity', 'ego',
]);

export const VOUCHER_ADMIN_MEMBER_STATS = Object.freeze([
  'vocal', 'dance', 'performance', 'mc', 'variety', 'stamina', 'popularity', 'energy', 'ego',
]);

export const VOUCHER_STAT_LABELS = Object.freeze({
  vocal: 'Vocal', dance: 'Dance', performance: 'Performance', mc: 'MC', variety: 'Variety', stamina: 'Stamina', popularity: 'Popularity', energy: 'Energy', ego: 'Ego',
});

export const voucherStatLabel = (stat) => VOUCHER_STAT_LABELS[stat] ?? String(stat ?? '').replace(/[-_]/g, ' ');

/** Voucher stat usage is scoped to one member within one redemption. */
export function getVoucherMemberStatUsage(redemption, memberId, stat) {
  return (redemption?.usage ?? [])
    .filter((item) => String(item.memberId) === String(memberId) && item.stat === stat)
    .reduce((sum, item) => sum + Number(item.pointsUsed ?? 0), 0);
}

/** Single eligibility contract shared by voucher editors and validation callers. */
export function getVoucherEditEligibility(redemption, memberId) {
  const voucher = redemption?.voucher ?? {};
  const usage = Array.isArray(redemption?.usage) ? redemption.usage : [];
  const editsUsed = usage.filter((item) => String(item.memberId) === String(memberId)).reduce((sum, item) => sum + Number(item.pointsUsed ?? 0), 0);
  const editLimit = Number(voucher.maxIncreasePerMember ?? 0);
  const vouchersAvailable = Number(redemption?.pointsRemaining ?? 0);
  const otherMemberUsed = new Set(usage.filter((item) => String(item.memberId) !== String(memberId)).map((item) => String(item.memberId))).size;
  if (!redemption || redemption.status !== 'active' || vouchersAvailable <= 0) return { allowed: false, editsUsed, editLimit, vouchersAvailable, reason: 'no_voucher_available' };
  if (!voucher.allowMultipleMembers && otherMemberUsed > 0) return { allowed: false, editsUsed, editLimit, vouchersAvailable, reason: 'member_limit_reached' };
  if (editLimit > 0 && editsUsed >= editLimit) return { allowed: false, editsUsed, editLimit, vouchersAvailable, reason: 'edit_limit_reached' };
  return { allowed: true, editsUsed, editLimit, vouchersAvailable, reason: null };
}
