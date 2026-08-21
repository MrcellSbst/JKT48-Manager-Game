export const VOUCHER_MEMBER_STATS = Object.freeze([
  'vocal', 'dance', 'performance', 'mc', 'variety', 'stamina', 'popularity', 'energy', 'ego',
]);

export const VOUCHER_STAT_LABELS = Object.freeze({
  vocal: 'Vocal', dance: 'Dance', performance: 'Performance', mc: 'MC', variety: 'Variety', stamina: 'Stamina', popularity: 'Popularity', energy: 'Energy', ego: 'Ego',
});

export const voucherStatLabel = (stat) => VOUCHER_STAT_LABELS[stat] ?? String(stat ?? '').replace(/[-_]/g, ' ');
