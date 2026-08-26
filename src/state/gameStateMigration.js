import { BALANCE, DAYS } from '../data/balance.js';
import { MAX_BONUS_LEVEL } from '../data/bonusTemplates.js';
import {
  createBirthday,
  createFanTargetForYear,
  migrateEconomyState,
  migrateGraduatedRosterState,
  migrateInjuryHistoryState,
  migrateTrainingState,
} from '../engine/gameEngine.js';
import { normalizeTutorialState } from '../engine/tutorial.js';

const backfillBirthday = (seed, member) => Number.isFinite(member.birthMonth) && Number.isFinite(member.birthYear)
  ? {}
  : createBirthday(seed ?? 'legacy-run', member.identityId ?? member.id ?? member.name ?? 'unknown', member.careerStage);

export function normalizeGameState(state) {
  if (!state || typeof state !== 'object') return state;
  const legacyCalendar = !state.calendarWeeks || state.calendarWeeks === 52;
  const convertWeek = (week) => {
    const numericWeek = Number(week);
    if (!Number.isFinite(numericWeek)) return week;
    return legacyCalendar
      ? Math.max(1, Math.min(BALANCE.weeksPerYear, Math.ceil(numericWeek * BALANCE.weeksPerYear / 52)))
      : Math.trunc(numericWeek);
  };
  const normalizedYear = Number.isFinite(Number(state.year)) ? Math.trunc(Number(state.year)) : state.year;
  const convertEntries = (items) => (items ?? []).map((item) => {
    const week = convertWeek(item.week);
    const year = Number.isFinite(Number(item.year)) ? Math.trunc(Number(item.year)) : item.year;
    const targetYear = Number.isFinite(Number(item.targetYear)) ? Math.trunc(Number(item.targetYear)) : item.targetYear;
    return { ...item, year, targetYear, week, month: item.month && week ? Math.ceil(week / BALANCE.weeksPerMonth) : item.month, announcementWeek: convertWeek(item.announcementWeek), departureWeek: convertWeek(item.departureWeek) };
  });
  const singles = (state.singles ?? []).map((single) => single.status === 'production' ? { ...single, productionDay: single.productionDay ?? DAYS[0] } : single);
  const schedule = Object.fromEntries(Object.entries(state.schedule ?? {}).map(([key, activity]) => [key, /^vc[123]$/.test(activity) ? 'vc1' : /^mg[123]$/.test(activity) ? 'mg1' : activity]));
  singles.filter((single) => single.status === 'production').forEach((single) => single.memberIds?.forEach((memberId) => { schedule[`${memberId}:${single.productionDay}`] = 'mvProduction'; }));
  const currentYearFanGain = (state.weeklyReports ?? []).filter((report) => report.year === state.year).reduce((sum, report) => sum + Math.max(0, report.fanGain ?? 0), 0);
  const inferredYearStartFans = Math.max(0, (state.group?.fanbase ?? 125_000) - currentYearFanGain);
  const bonusLoadout = state.bonusLoadout ?? [];
  const bonusLevels = Object.fromEntries(bonusLoadout.map((id) => [id, Math.max(1, Math.min(MAX_BONUS_LEVEL, Math.floor(Number(state.bonusLevels?.[id]) || 1)))]));
  const auditionCampaign = state.auditionCampaign ? { ...state.auditionCampaign, selectionConfirmed: state.auditionCampaign.selectionConfirmed ?? Boolean(state.auditionCampaign.selectedCandidateIds?.length) } : null;
  return migrateEconomyState(migrateInjuryHistoryState(migrateGraduatedRosterState(migrateTrainingState({
    ...state,
    calendarWeeks: BALANCE.weeksPerYear,
    runSalt: state.runSalt ?? `legacy-${String(state.seed ?? 'run')}`,
    hardMode: state.hardMode ?? false,
    rosterScope: state.rosterScope ?? 'active',
    group: { ...state.group, fanPools: { coreWota: Math.round((state.group?.fanbase ?? 0) * 0.27), casual: Math.round((state.group?.fanbase ?? 0) * 0.25), generalPublic: Math.round((state.group?.fanbase ?? 0) * 0.14), digital: Math.round((state.group?.fanbase ?? 0) * 0.2), event: Math.round((state.group?.fanbase ?? 0) * 0.14), oshi: Math.round((state.group?.fanbase ?? 0) * 0.23), groupFans: Math.round((state.group?.fanbase ?? 0) * 0.3), ...(state.group?.fanPools ?? {}) }, fanSentiment: { coreWota: 0, casual: 0, generalPublic: 0, digital: 0, event: 0, oshi: 0, groupFans: 0, ...(state.group?.fanSentiment ?? {}) } },
    year: normalizedYear,
    week: convertWeek(state.week),
    bonusLoadout, bonusLevels, graduationTargets: state.graduationTargets ?? {},
    schedule, singles, tutorialState: normalizeTutorialState(state.tutorialState), scheduleTemplates: state.scheduleTemplates ?? [], theaterShows: state.theaterShows ?? {}, theaterHistory: state.theaterHistory ?? [], concertVenueOffers: state.concertVenueOffers?.length ? state.concertVenueOffers : undefined, auditionCampaign, annualReviews: state.annualReviews ?? [], fanTarget: state.fanTarget?.formulaVersion === 2 ? state.fanTarget : createFanTargetForYear(normalizedYear, inferredYearStartFans), fanTargetHistory: (state.fanTargetHistory ?? []).filter((target) => target.formulaVersion === 2), fanTargetMetaReward: state.fanTargetMetaReward ?? 0, mentorships: state.mentorships ?? [], mentorshipHistory: state.mentorshipHistory ?? [], promotions: state.promotions ?? [], chemistry: state.chemistry ?? {}, demandHistory: state.demandHistory ?? [], opportunityHistory: state.opportunityHistory ?? [], pendingOpportunity: state.pendingOpportunity ?? null, fanEventPlans: state.fanEventPlans ?? [], departures: state.departures ?? [], ledger: state.ledger ?? { pendingUpkeep: 0, pendingOperations: 0, debt: { salary: 0, upkeep: 0, operations: 0 }, unpaidSalaryMonths: 0, settlements: [] }, loans: state.loans ?? [], loanOffers: state.loanOffers ?? [], seitansaiObligations: state.seitansaiObligations ?? [],
    financialEvents: convertEntries(state.financialEvents), activeDrama: state.activeDrama ? { ...state.activeDrama, dramaSource: state.activeDrama.dramaSource ?? 'member' } : null, activeManagementDrama: state.activeManagementDrama ? { ...state.activeManagementDrama, dramaSource: 'management' } : null, dramaCooldown: state.dramaCooldown ?? 0, memberDramaCooldown: state.memberDramaCooldown ?? state.dramaCooldown ?? 0, managementDramaCooldown: state.managementDramaCooldown ?? 0, campaign: state.campaign ?? null, firstCampaignYear: state.firstCampaignYear ?? 2, nextCampaignConfig: null, lastCampaignType: state.lastCampaignType ?? null, campaignHistory: state.campaignHistory ?? [],
    members: (state.members ?? []).map((member) => ({ ...member, joinedYear: Number.isFinite(member.joinedYear) ? member.joinedYear : 1, joinedWeek: Number.isFinite(member.joinedWeek) ? convertWeek(member.joinedWeek) : 1, consistency: member.consistency ?? 60, adaptability: member.adaptability ?? 60, developmentCurve: member.developmentCurve ?? 'steady', fanComposition: member.fanComposition ?? { core: 25, casual: 25, digital: 25, event: 25 }, oshiSentiment: member.oshiSentiment ?? 0, salary: member.salary ?? null, setlistFamiliarity: member.setlistFamiliarity ?? {}, injury: member.injury ?? null, weeksWithoutEvent: member.weeksWithoutEvent ?? 0, rosterScope: member.rosterScope ?? (member.graduated ? 'ex' : 'active'), ...backfillBirthday(state.seed, member) })), unsignedMembers: (state.unsignedMembers ?? []).map((member) => ({ ...member, salary: member.salary ?? null, injury: member.injury ?? null, weeksWithoutEvent: member.weeksWithoutEvent ?? 0, rosterScope: member.rosterScope ?? (member.graduated ? 'ex' : 'active'), ...backfillBirthday(state.seed, member) })), fanNarratives: state.fanNarratives ?? [], dramaMemory: state.dramaMemory ?? [], failureCounters: state.failureCounters ?? { negativeCashWeeks: 0, lowTrustWeeks: 0, lowReputationWeeks: 0, lowFanbaseWeeks: 0 },
    history: convertEntries(state.history), activityEvents: convertEntries(state.activityEvents), weeklyReports: convertEntries(state.weeklyReports), concerts: convertEntries(state.concerts), yearEndMeetGreets: convertEntries(state.yearEndMeetGreets), renovations: convertEntries(state.renovations), graduations: convertEntries(state.graduations),
    lastResult: state.lastResult ? { ...state.lastResult, week: convertWeek(state.lastResult.week) } : state.lastResult,
  }))));
}

export function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  if (!snapshot.activeRun?.state) return { ...snapshot, version: 2 };
  return { ...snapshot, version: 2, activeRun: { ...snapshot.activeRun, state: normalizeGameState(snapshot.activeRun.state) } };
}
