import { sortMembers } from './memberSort.js';

/** Values accepted by the shared Core/Trainee roster filter. */
export const CORE_TRAINEE_FILTERS = Object.freeze(['all', 'core', 'trainee']);

export const isTraineeMember = (member = {}) => member.status === 'trainee';

export const matchesCoreTraineeFilter = (member, filter = 'all') => {
  const value = String(filter ?? 'all').toLowerCase();
  if (value === 'all' || value === '') return true;
  if (value === 'trainee') return isTraineeMember(member);
  // “Core” is the regular roster: suspended members remain core members.
  if (value === 'core' || value === 'regular') return !isTraineeMember(member);
  return false;
};

/**
 * Filter without changing the caller's array or member objects.
 * Graduated members remain eligible for the caller to decide; this helper only
 * separates Core and Trainee, so it can be reused by roster and training views.
 */
export const filterCoreTraineeMembers = (members = [], filter = 'all') =>
  [...members].filter((member) => matchesCoreTraineeFilter(member, filter));

/** Filter first, then apply the shared immutable member sorter. */
export const filterAndSortMembers = (members = [], {
  roster = 'all',
  ...sortOptions
} = {}) => sortMembers(filterCoreTraineeMembers(members, roster), sortOptions);

// Friendly aliases for callers that describe the control as a roster filter.
export const filterMembersByRoster = filterCoreTraineeMembers;
export const applyMemberFilters = filterAndSortMembers;

