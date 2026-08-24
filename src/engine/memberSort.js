export const ROSTER_SORT_OPTIONS = Object.freeze(['name', 'birthday', 'generation', 'team']);
export const SQUAD_SORT_OPTIONS = Object.freeze(['visible-stat', 'status', 'name', 'generation', 'birthday']);
export const SORT_DIRECTIONS = Object.freeze(['asc', 'desc']);

// Keep this registry shared with the Schedule member-stat panel. Overall is derived
// from the five core performance stats and is intentionally offered separately.
export const VISIBLE_MEMBER_STAT_KEYS = Object.freeze([
  'vocal', 'dance', 'performance', 'mc', 'variety', 'stamina', 'ego',
]);

const STAT_LABELS = Object.freeze({
  vocal: 'Vocal', dance: 'Dance', performance: 'Performance', mc: 'MC',
  variety: 'Variety', stamina: 'Stamina', ego: 'Ego', overall: 'Overall',
});

export const visibleStatLabel = (key) => STAT_LABELS[key] ?? String(key ?? '').replace(/[-_]/g, ' ');

export const getMemberOverall = (member = {}) => Math.round((
  Number(member.vocal ?? 0) + Number(member.dance ?? 0) + Number(member.performance ?? 0)
  + Number(member.mc ?? 0) + Number(member.variety ?? 0)
) / 5);

export const getMemberSelectionScore = (member = {}) => (
  getMemberOverall(member) + Number(member.popularity ?? 0)
) / 2;

// Shared deterministic ranking for MV Auto Fill and template-center fallback.
export const rankMembersForSelection = (members = []) => [...members].sort((first, second) => {
  const score = getMemberSelectionScore(second) - getMemberSelectionScore(first);
  if (score !== 0) return score;
  const overall = getMemberOverall(second) - getMemberOverall(first);
  if (overall !== 0) return overall;
  const popularity = Number(second?.popularity ?? 0) - Number(first?.popularity ?? 0);
  if (popularity !== 0) return popularity;
  const name = String(first?.name ?? first?.nickname ?? '').localeCompare(String(second?.name ?? second?.nickname ?? ''), undefined, { sensitivity: 'base', numeric: true });
  if (name !== 0) return name;
  return String(first?.id ?? '').localeCompare(String(second?.id ?? ''), undefined, { sensitivity: 'base', numeric: true });
});

const textValue = (value) => String(value ?? '').trim();
const numericValue = (value, fallback = Number.POSITIVE_INFINITY) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const generationValue = (member) => {
  const match = textValue(member?.generation).match(/\d+/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
};
const birthdayValue = (member) => {
  const month = numericValue(member?.birthMonth, Number.POSITIVE_INFINITY);
  // Member data currently stores month only for ordering purposes. The year is
  // deliberately excluded so birthdays stay calendar-season ordered.
  return month;
};
const compareText = (first, second) => textValue(first).localeCompare(textValue(second), undefined, { sensitivity: 'base', numeric: true });
const compareNumber = (first, second) => first - second;

const primaryValue = (member, sortKey, visibleStat = 'overall') => {
  if (sortKey === 'name') return textValue(member?.name ?? member?.nickname);
  if (sortKey === 'birthday') return birthdayValue(member);
  if (sortKey === 'generation') return generationValue(member);
  if (sortKey === 'team') return textValue(member?.team);
  // Schedule treats every current-roster member who is not a trainee as a
  // regular member, including a regular member who is temporarily suspended.
  if (sortKey === 'status') return member?.status === 'trainee' ? 1 : 0;
  if (sortKey === 'visible-stat') return visibleStat === 'overall' ? getMemberOverall(member) : numericValue(member?.[visibleStat], Number.NEGATIVE_INFINITY);
  // Retain the roster's legacy metric sorts while routing them through the same
  // immutable comparator used by the new controls.
  if (sortKey === 'energy' || sortKey === 'popularity' || VISIBLE_MEMBER_STAT_KEYS.includes(sortKey)) return numericValue(member?.[sortKey], Number.NEGATIVE_INFINITY);
  if (sortKey === 'overall') return getMemberOverall(member);
  return textValue(member?.name ?? member?.nickname);
};

const comparePrimary = (first, second, sortKey, visibleStat) => {
  const firstValue = primaryValue(first, sortKey, visibleStat);
  const secondValue = primaryValue(second, sortKey, visibleStat);
  if (typeof firstValue === 'string' || typeof secondValue === 'string') return compareText(firstValue, secondValue);
  return compareNumber(firstValue, secondValue);
};

export const compareMembers = (first, second, { sortKey = 'name', direction = 'asc', visibleStat = 'overall' } = {}) => {
  const primary = comparePrimary(first, second, sortKey, visibleStat);
  if (primary !== 0) return direction === 'desc' ? -primary : primary;
  const name = compareText(first?.name ?? first?.nickname, second?.name ?? second?.nickname);
  if (name !== 0) return name;
  return compareText(first?.id, second?.id);
};

export const sortMembers = (members = [], options = {}) => [...members].sort((first, second) => compareMembers(first, second, options));

