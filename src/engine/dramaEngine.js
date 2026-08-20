import { MANAGEMENT_DRAMA_TEMPLATES } from '../data/dramaData.js';
import { weightedPick } from './rng.js';

export const personalizeDramaText = (value = '', memberName = '', targetName = 'the target') => String(value)
  .replaceAll('{member}', memberName)
  .replaceAll('{target}', targetName);

export const templateNeedsMember = (template) => /\{member\}/.test(`${template?.title ?? ''} ${template?.detail ?? ''} ${template?.titleId ?? ''} ${template?.detailId ?? ''}`);

const recentItems = (state, collection, weeks = 8) => {
  const now = (state.year ?? 1) * 100 + (state.week ?? 1);
  return (state[collection] ?? []).filter((item) => now - ((item.year ?? item.targetYear ?? state.year ?? 1) * 100 + (item.week ?? item.targetWeek ?? 1)) <= weeks);
};

const activeMembers = (members = []) => members.filter((member) => ['active', 'trainee'].includes(member.status));

export function getManagementDramaContext(state, members = state.members ?? []) {
  const active = activeMembers(members);
  const scheduleValues = Object.values(state.schedule ?? {});
  const financialEvents = recentItems(state, 'financialEvents', 12);
  const upcomingConcert = (state.concerts ?? []).some((event) => event.status !== 'completed' && event.targetYear === state.year && event.targetWeek >= state.week);
  const upcomingFanEvent = (state.fanEventPlans ?? []).some((event) => event.year === state.year && event.targetWeek >= state.week);
  const upcomingYearEnd = (state.yearEndMeetGreets ?? []).some((event) => event.year === state.year && event.targetWeek >= state.week);
  const denseMember = active
    .map((member) => ({ member, assignments: Object.entries(state.schedule ?? {}).filter(([key, activity]) => key.startsWith(`${member.id}:`) && activity !== 'rest' && activity !== 'clear').length }))
    .sort((first, second) => second.assignments - first.assignments)[0];
  const hasDebt = (state.ledger?.debt?.salary ?? 0) + (state.ledger?.debt?.upkeep ?? 0) + (state.ledger?.debt?.operations ?? 0) > 0 || (state.money ?? 0) < 0;
  const repeatedCenter = (state.singles ?? []).filter((single) => single.centerId).reduce((counts, single) => counts.set(single.centerId, (counts.get(single.centerId) ?? 0) + 1), new Map());
  const favoriteCenter = [...repeatedCenter.entries()].sort((first, second) => second[1] - first[1])[0];
  const hasGraduationPressure = Object.values(state.graduationTargets ?? {}).some((target) => target && !target.completed)
    || (state.departures ?? []).some((departure) => departure.year === state.year);
  const hasSponsorActivity = recentItems(state, 'opportunityHistory', 16).some((item) => item.category === 'brand' || item.category === 'sponsor' || item.type === 'sponsor')
    || recentItems(state, 'financialEvents', 16).some((item) => `${item.type ?? ''} ${item.category ?? ''}`.toLowerCase().includes('sponsor'));
  const hasManagementAction = recentItems(state, 'history', 16).some((item) => ['punishment', 'fire', 'member', 'graduation'].includes(item.type) || `${item.title ?? ''} ${item.detail ?? ''}`.toLowerCase().includes('management'));

  if (hasDebt || financialEvents.some((event) => (event.amount ?? event.value ?? 0) < 0)) return { kind: 'finance', memberId: denseMember?.member?.id, evidence: `cash ${Math.round(state.money ?? 0).toLocaleString('id-ID')}` };
  if (denseMember && (denseMember.assignments >= 5 || (denseMember.member.energy ?? 100) < 35)) return { kind: 'overwork', memberId: denseMember.member.id, evidence: `${denseMember.member.nickname || denseMember.member.name} has ${denseMember.assignments} scheduled assignments` };
  if (upcomingConcert || upcomingFanEvent || upcomingYearEnd) return { kind: 'event', evidence: 'upcoming concert, fan event, or year-end meet-and-greet' };
  if (favoriteCenter && favoriteCenter[1] >= 2) return { kind: 'favoritism', memberId: favoriteCenter[0], evidence: `${favoriteCenter[1]} recent center selections` };
  if (hasGraduationPressure) return { kind: 'restructuring', evidence: 'graduation or departure plans are active' };
  if (hasSponsorActivity) return { kind: 'sponsor', evidence: 'recent sponsor or brand activity' };
  if (hasManagementAction) return { kind: 'management', evidence: 'recent management decisions are recorded' };
  if (scheduleValues.length >= active.length * 4) return { kind: 'event', evidence: 'dense office schedule' };
  return { kind: 'general', evidence: 'current office activity' };
}

const CONTEXT_IDS = Object.freeze({
  finance: ['budget-overspending', 'financial-crisis-link'],
  overwork: ['member-overwork', 'health-pressure-crisis'],
  event: ['ticketing-system-failure', 'event-queue-chaos', 'last-minute-event-cancellation'],
  favoritism: ['center-favoritism', 'inconsistent-member-punishment'],
  restructuring: ['restructuring-backlash', 'mass-graduation-rumor', 'sudden-graduation-pressure'],
  sponsor: ['sponsor-contract-conflict', 'sponsor-backlash'],
  management: ['bad-official-statement', 'inconsistent-member-punishment'],
});

export function selectManagementDramaTemplate(state, members, rng) {
  const context = getManagementDramaContext(state, members);
  const preferred = new Set(CONTEXT_IDS[context.kind] ?? []);
  const candidates = MANAGEMENT_DRAMA_TEMPLATES.filter((template) => preferred.has(template.id));
  const pool = candidates.length ? candidates : MANAGEMENT_DRAMA_TEMPLATES;
  return { template: weightedPick(rng, pool, (template) => Math.max(1, template.weight ?? 1)), context };
}

export function appendManagementContext(template, context) {
  if (!context?.evidence) return template;
  return {
    ...template,
    detail: `${template.detail} Management record: ${context.evidence}.`,
    detailId: `${template.detailId} Catatan manajemen: ${context.evidence}.`,
  };
}
