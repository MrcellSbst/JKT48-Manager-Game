import { BALANCE } from '../data/balance.js';
import { MANAGEMENT_DRAMA_TEMPLATES } from '../data/dramaData.js';
import { weightedPick } from './rng.js';

export const personalizeDramaText = (value = '', memberName = '', targetName = 'the target') => String(value)
  .replaceAll('{member}', memberName)
  .replaceAll('{target}', targetName);

export const templateNeedsMember = (template) => /\{member\}/.test(`${template?.title ?? ''} ${template?.detail ?? ''} ${template?.titleId ?? ''} ${template?.detailId ?? ''}`);

const activeMembers = (members = []) => members.filter((member) => ['active', 'trainee'].includes(member.status));
const absoluteWeek = (year, week) => ((year ?? 1) - 1) * (BALANCE.weeksPerYear ?? 48) + (week ?? 1);
const recentItems = (state, collection, weeks = 8) => {
  const now = absoluteWeek(state.year, state.week);
  return (state[collection] ?? []).filter((item) => {
    const age = now - absoluteWeek(item.year ?? item.targetYear ?? state.year, item.week ?? item.targetWeek ?? 1);
    return age >= 0 && age <= weeks;
  });
};
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const hasDebt = (state) => (state.ledger?.debt?.salary ?? 0) + (state.ledger?.debt?.upkeep ?? 0) + (state.ledger?.debt?.operations ?? 0) > 0 || (state.money ?? 0) < 0;

const MANAGEMENT_CONTEXT_IDS = Object.freeze({
  finance: ['budget-overspending', 'financial-crisis-link'],
  overwork: ['member-overwork', 'health-pressure-crisis'],
  event: ['ticketing-system-failure', 'event-queue-chaos', 'last-minute-event-cancellation'],
  favoritism: ['center-favoritism', 'inconsistent-member-punishment', 'election-controversy'],
  restructuring: ['restructuring-backlash', 'mass-graduation-rumor', 'sudden-graduation-pressure'],
  sponsor: ['sponsor-contract-conflict', 'sponsor-backlash', 'franchise-contract-dispute'],
  management: ['bad-official-statement', 'inconsistent-member-punishment'],
  security: ['member-location-leak', 'stalker-privacy-incident'],
});

const TEMPLATE_RISK_KEY = Object.freeze({
  'budget-overspending': 'financialMismanagement', 'financial-crisis-link': 'financialMismanagement',
  'member-overwork': 'overwork', 'health-pressure-crisis': 'overwork',
  'center-favoritism': 'favoritism', 'election-controversy': 'favoritism',
  'inconsistent-member-punishment': 'ruleInconsistency',
  'ticketing-system-failure': 'eventHandling', 'event-queue-chaos': 'eventHandling', 'last-minute-event-cancellation': 'eventHandling',
  'sponsor-contract-conflict': 'sponsorRelations', 'sponsor-backlash': 'sponsorRelations', 'franchise-contract-dispute': 'sponsorRelations',
  'restructuring-backlash': 'restructuring', 'mass-graduation-rumor': 'restructuring', 'sudden-graduation-pressure': 'restructuring',
  'member-location-leak': 'securityNeglect', 'stalker-privacy-incident': 'securityNeglect',
  'bad-official-statement': 'crisisHandling',
});

const scoreSchedule = (state, members) => {
  const workloads = new Map(members.map((member) => [member.id, { member, assignments: 0, recentAssignments: 0, restDays: 0 }]));
  Object.entries(state.schedule ?? {}).forEach(([key, activity]) => {
    const memberId = key.slice(0, key.lastIndexOf(':'));
    const row = workloads.get(memberId);
    if (!row) return;
    if (activity === 'rest' || activity === 'clear' || !activity) row.restDays += 1;
    else row.assignments += 1;
  });
  recentItems(state, 'weeklyReports', 8).forEach((report) => Object.entries(report.schedule ?? {}).forEach(([key, activity]) => {
    const memberId = key.slice(0, key.lastIndexOf(':'));
    const row = workloads.get(memberId);
    if (row && activity && activity !== 'rest' && activity !== 'clear') row.recentAssignments += 1;
  }));
  return [...workloads.values()].sort((first, second) => (second.assignments + second.recentAssignments * 0.08) - (first.assignments + first.recentAssignments * 0.08));
};

const getCenterSignal = (state, members) => {
  const centers = [...(state.singles ?? []), ...(state.theaterHistory ?? [])]
    .filter((item) => item.centerId)
    .reduce((counts, item) => counts.set(item.centerId, (counts.get(item.centerId) ?? 0) + 1), new Map());
  const favorite = [...centers.entries()].sort((first, second) => second[1] - first[1])[0];
  const member = favorite ? members.find((candidate) => candidate.id === favorite[0]) : null;
  return { favorite, member, distinct: centers.size };
};

export function getManagementDramaContext(state, members = state.members ?? []) {
  const active = activeMembers(members);
  const workloads = scoreSchedule(state, active);
  const denseMember = workloads[0];
  const centerSignal = getCenterSignal(state, active);
  const financialEvents = recentItems(state, 'financialEvents', 12);
  const negativeFinance = financialEvents.some((event) => (event.net ?? event.amount ?? event.value ?? 0) < 0 || (event.expense ?? 0) > (event.income ?? 0));
  const currentAbsolute = absoluteWeek(state.year, state.week);
  const upcomingConcert = (state.concerts ?? []).find((event) => event.status !== 'completed' && absoluteWeek(event.targetYear, event.targetWeek) >= currentAbsolute);
  const upcomingFanEvent = (state.fanEventPlans ?? []).find((event) => absoluteWeek(event.year, event.targetWeek) >= currentAbsolute);
  const upcomingYearEnd = (state.yearEndMeetGreets ?? []).find((event) => absoluteWeek(event.year, event.targetWeek) >= currentAbsolute);
  const eventHistory = recentItems(state, 'history', 12).filter((item) => /cancel|queue|ticket|event/i.test(`${item.title ?? ''} ${item.detail ?? ''}`));
  const punishmentHistory = recentItems(state, 'history', 24).filter((item) => item.type === 'punishment' || /punish|suspend/i.test(`${item.title ?? ''} ${item.detail ?? ''}`));
  const punishmentDurations = new Set(punishmentHistory.map((item) => Number(item.weeks ?? item.punishmentWeeks)).filter(Number.isFinite));
  const graduationPressure = Object.values(state.graduationTargets ?? {}).some((target) => target && !target.completed)
    || (state.departures ?? []).some((departure) => departure.firedYear === state.year || departure.year === state.year);
  const sponsorActivity = recentItems(state, 'opportunityHistory', 16).some((item) => ['brand', 'sponsor'].includes(item.category) || item.type === 'sponsor')
    || financialEvents.some((item) => /sponsor|brand/i.test(`${item.type ?? ''} ${item.category ?? ''}`));
  const privacyActivity = recentItems(state, 'history', 16).some((item) => /privacy|stalker|location|security/i.test(`${item.title ?? ''} ${item.detail ?? ''}`));
  const risk = {
    overwork: clamp((denseMember?.assignments >= 5 ? 0.7 : 0) + ((denseMember?.member.energy ?? 100) < 35 ? 0.35 : 0) + (denseMember?.recentAssignments >= 18 ? 0.2 : 0)),
    favoritism: clamp((centerSignal.favorite?.[1] >= 2 && active.length > 1 ? 0.65 : 0) + (centerSignal.distinct <= 1 && centerSignal.favorite && active.length > 1 ? 0.2 : 0)),
    financialMismanagement: clamp((hasDebt(state) ? 0.8 : 0) + (negativeFinance ? 0.35 : 0)),
    ruleInconsistency: clamp(punishmentDurations.size > 1 && punishmentHistory.length >= 2 ? 0.8 : 0),
    eventHandling: clamp((upcomingConcert || upcomingFanEvent || upcomingYearEnd ? 0.35 : 0) + (eventHistory.length ? 0.65 : 0)),
    securityNeglect: privacyActivity ? 0.85 : 0,
    sponsorRelations: sponsorActivity ? 0.75 : 0,
    crisisHandling: state.activeDrama || state.activeManagementDrama ? 0.65 : 0,
    restructuring: graduationPressure ? 0.7 : 0,
  };
  const protective = {
    restCoverage: denseMember && denseMember.restDays >= 2 && denseMember.member.energy >= 45 ? 0.45 : 0,
    centerRotation: centerSignal.distinct >= 3 ? 0.4 : 0,
    financialBuffer: !hasDebt(state) && (state.money ?? 0) > 0 ? 0.35 : 0,
    consistentRules: punishmentHistory.length < 2 || punishmentDurations.size <= 1 ? 0.3 : 0,
    eventPreparedness: upcomingConcert || upcomingFanEvent || upcomingYearEnd ? 0.15 : 0,
  };
  const contextPriority = [['financialMismanagement', 'finance'], ['overwork', 'overwork'], ['eventHandling', 'event'], ['favoritism', 'favoritism'], ['restructuring', 'restructuring'], ['sponsorRelations', 'sponsor'], ['securityNeglect', 'security'], ['crisisHandling', 'management'], ['ruleInconsistency', 'management']];
  const prioritizedRisk = contextPriority.find(([key]) => risk[key] > 0);
  const riskEntries = Object.entries(risk).sort((first, second) => second[1] - first[1]);
  const [topRisk, topValue] = prioritizedRisk ? [prioritizedRisk[0], risk[prioritizedRisk[0]]] : (riskEntries[0] ?? ['general', 0]);
  const kind = topValue > 0
    ? ({ financialMismanagement: 'finance', overwork: 'overwork', eventHandling: 'event', favoritism: 'favoritism', restructuring: 'restructuring', sponsorRelations: 'sponsor', securityNeglect: 'security', crisisHandling: 'management', ruleInconsistency: 'management' }[topRisk] ?? 'general')
    : 'general';
  const evidence = {
    finance: `cash ${Math.round(state.money ?? 0).toLocaleString('id-ID')}`,
    overwork: denseMember ? `${denseMember.member.nickname || denseMember.member.name} has ${denseMember.assignments} scheduled assignments` : 'workload checks are active',
    event: eventHistory.length ? `${eventHistory[0].title ?? 'an event handling record'} is still shaping fan confidence` : 'upcoming concert, fan event, or year-end meet-and-greet',
    favoritism: centerSignal.favorite ? `${centerSignal.favorite[1]} recent center selections for ${centerSignal.member?.nickname || centerSignal.member?.name || 'one member'}` : 'center rotation is under scrutiny',
    restructuring: 'graduation or departure plans are active', sponsor: 'recent sponsor or brand activity', security: 'recent privacy or security record', management: 'recent management decisions are recorded', general: 'current office activity',
  }[kind];
  const protectiveScore = Object.values(protective).reduce((sum, value) => sum + value, 0);
  const riskScore = Object.values(risk).reduce((sum, value) => sum + value, 0);
  return {
    kind, causeType: kind, memberId: denseMember?.member?.id ?? centerSignal.member?.id, affectedMemberId: denseMember?.member?.id ?? centerSignal.member?.id,
    relatedCampaignId: null, relatedEventId: upcomingConcert?.id ?? upcomingFanEvent?.id ?? upcomingYearEnd?.id ?? null,
    externalTrigger: kind === 'security' ? 'privacy incident' : null, evidence, risk, protective, riskScore, protectiveScore,
    chanceMultiplier: clamp(0.45 + riskScore * 0.45 - protectiveScore * 0.2, 0.35, 2.5),
  };
}

export function getManagementDramaChanceMultiplier(context) {
  return context?.chanceMultiplier ?? 1;
}

export function selectManagementDramaTemplate(state, members, rng, providedContext = null) {
  const context = providedContext ?? getManagementDramaContext(state, members);
  const preferred = new Set(MANAGEMENT_CONTEXT_IDS[context.kind] ?? []);
  const preferredCandidates = MANAGEMENT_DRAMA_TEMPLATES.filter((template) => preferred.has(template.id));
  const pool = preferredCandidates.length ? preferredCandidates : MANAGEMENT_DRAMA_TEMPLATES;
  const weights = Object.fromEntries(pool.map((template) => {
    const riskKey = TEMPLATE_RISK_KEY[template.id];
    const riskWeight = riskKey ? context.risk?.[riskKey] ?? 0 : 0;
    const protection = riskKey === 'overwork' ? context.protective?.restCoverage ?? 0 : riskKey === 'favoritism' ? context.protective?.centerRotation ?? 0 : 0;
    return [template.id, Math.max(0.25, (template.weight ?? 1) * (1 + riskWeight * 1.25 - protection * 0.45))];
  }));
  return { template: weightedPick(rng, pool, (template) => weights[template.id]), context, weights };
}

export function appendManagementContext(template, context) {
  if (!context?.evidence) return template;
  return {
    ...template,
    detail: `${template.detail} Management record: ${context.evidence}.`,
    detailId: `${template.detailId} Catatan manajemen: ${context.evidence}.`,
  };
}
