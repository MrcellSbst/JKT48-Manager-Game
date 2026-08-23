import { memberData } from '../data/newmemberdata.js';
import { BALANCE, CONCERT_BUDGETS, CONCERT_VENUES, DAYS, FAN_BALANCE, OPPORTUNITIES, SINGLE_BUDGETS, TRAINING_ACTIVITY_IDS } from '../data/balance.js';
import { MEMBER_DRAMA_TEMPLATES } from '../data/dramaData.js';
import dreamSetlistSongs from '../data/DreamSetlist_Songs.js';
import { SETLISTS, SETLIST_BY_ID } from '../data/setlists.js';
import { BONUS_BY_ID, getBonusValueAtLevel, normalizeBonusLevel } from '../data/bonusTemplates.js';
import { createRng, hashSeed, randomInt, weightedPick } from './rng.js';
import { appendManagementContext, getManagementDramaChanceMultiplier, getManagementDramaContext, personalizeDramaText, selectManagementDramaTemplate } from './dramaEngine.js';
import { advanceCampaign, CAMPAIGN_DEFAULT_CONCERT_DAY, configureNextCampaign, nextCampaignType, startCampaign } from './campaignEngine.js';

const ARCHETYPES = ['Performer', 'Vocalist', 'Entertainer', 'All-Rounder', 'Specialist', 'Raw Prospect', 'Prodigy', 'Late Bloomer'];
const TRAITS = ['Quick Learner', 'Big Stage Performer', 'Theater Specialist', 'Reliable Performer', 'Versatile', 'Crowd Magnet'];
const SKILLS = ['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina'];
const ALL_NINETY_STATS = Object.fromEntries([
  ...SKILLS,
  'consistency',
  'adaptability',
  'popularity',
  'energy',
  'potential',
  'development',
].map((key) => [key, 100]));
const AUDITION_CANDIDATE_COUNT = 12;
const AUDITION_MAX_INTAKE = 6;
const ALL_NINETY_SEED = 'SEKAISEIN@1903@MARCELL';
const TRAINING_SCHEMA_VERSION = 1;
const INJURY_HISTORY_SCHEMA_VERSION = 1;
const TRAINING_ACTIVITY_SET = new Set(TRAINING_ACTIVITY_IDS);

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const voucherAdjustmentFor = (member, stat) => Number(member?.voucherAdjustments?.[stat] ?? 0);
const voucherNaturalCap = (member, stat) => ({
  min: -voucherAdjustmentFor(member, stat),
  max: 100 - voucherAdjustmentFor(member, stat),
});
const voucherBaseFor = (member, stat) => {
  const adjustment = voucherAdjustmentFor(member, stat);
  return Number(member?.voucherBaseStats?.[stat] ?? ((member?.[stat] ?? 0) - adjustment));
};
const applyNaturalStatChange = (member, stat, delta) => {
  const adjustment = voucherAdjustmentFor(member, stat);
  const natural = voucherBaseFor(member, stat);
  const nextNatural = clamp(natural + delta, -adjustment, 100 - adjustment);
  return {
    ...member,
    [stat]: Math.round((nextNatural + adjustment) * 10) / 10,
    voucherBaseStats: { ...(member.voucherBaseStats ?? {}), [stat]: Math.round(nextNatural * 10) / 10 },
  };
};
const isAllNinetySeed = (seed) => String(seed ?? '').trim().toUpperCase() === ALL_NINETY_SEED;
const toAbsoluteWeek = (year, week) => (year - 1) * BALANCE.weeksPerYear + week;
const fromAbsoluteWeek = (absoluteWeek) => ({ year: Math.floor((absoluteWeek - 1) / BALANCE.weeksPerYear) + 1, week: ((absoluteWeek - 1) % BALANCE.weeksPerYear) + 1 });
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const moneyText = (value) => `Rp ${value.toLocaleString('id-ID')}`;
const hasBonus = (state, id) => (state.bonusLoadout ?? []).includes(id);
const bonusLevel = (state, id) => hasBonus(state, id) ? normalizeBonusLevel(state.bonusLevels?.[id] ?? 1) : 0;
const bonusValue = (state, id) => getBonusValueAtLevel(BONUS_BY_ID[id], bonusLevel(state, id));
const protectNormalTrustLoss = (state, delta) => delta < 0 ? Math.ceil(delta * (1 + bonusValue(state, 'B023'))) : delta;
const applyRate = (value, rate) => Math.round(value * (1 + rate));
const chemistryPairKey = (firstId, secondId) => [firstId, secondId].sort().join('::');
const chemistryDimensions = ['stage', 'performance', 'mc', 'unit'];
const isConcertActivity = (activityId) => activityId === 'concert' || activityId === 'concertRehearsal';
const isMeetGreetActivity = (activityId) => activityId === 'yearEndMeetGreet' || activityId?.startsWith?.('mg');
const isCampaignActivity = (activityId) => isConcertActivity(activityId) || isMeetGreetActivity(activityId)
  || activityId === 'mvProduction' || activityId?.startsWith?.('mv') || activityId?.startsWith?.('vc');
const isGroupCampaignType = (type) => type === 'concert' || type === 'meetGreet' || type === 'yearEndMeetGreet';
const campaignTypeForActivity = (activityId) => {
  if (isConcertActivity(activityId)) return 'concert';
  if (activityId === 'yearEndMeetGreet') return 'yearEndMeetGreet';
  if (activityId?.startsWith?.('mg')) return 'meetGreet';
  if (activityId?.startsWith?.('vc')) return 'videoCall';
  return 'mv';
};
// Campaigns outrank ordinary/template work, but campaign slots are first-claim wins.
// Event type never replaces another campaign that already took the member/day slot.
const claimScheduleSlot = (schedule, key, activityId) => {
  const currentActivity = schedule[key];
  if (!currentActivity || currentActivity === activityId || (!isCampaignActivity(currentActivity) && isCampaignActivity(activityId))) schedule[key] = activityId;
  return schedule[key] === activityId;
};
const campaignConflictLabel = (type) => type === 'concert'
  ? 'Concert already occupies the requested schedule.'
  : type === 'yearEndMeetGreet' ? 'Year-end Meet & Greet already occupies the requested schedule.'
    : type === 'meetGreet' ? 'Meet & Greet already occupies the requested schedule.'
      : type === 'videoCall' ? 'Video Call already occupies this member and day.'
        : 'MV production already occupies this member and day.';
const campaignEventDays = (event) => [...new Set([event.day, ...(event.rehearsalDays ?? [])].filter(Boolean))];
const campaignDaysOverlap = (requestedDays, existingDays) => !requestedDays.length || !existingDays.length || requestedDays.some((day) => existingDays.includes(day));
const campaignMemberOverlap = (requestedMembers, existingMembers) => requestedMembers.size > 0 && existingMembers.some((memberId) => requestedMembers.has(memberId));
const conflictNotification = (state, reasons) => ({
  ...state,
  notifications: [{ type: 'critical', text: `Campaign blocked: ${reasons[0]}` }, ...(state.notifications ?? [])].slice(0, 20),
});

export function getCampaignConflictReasons(state, options = {}) {
  const targetYear = options.year ?? state.year;
  const targetWeek = options.week;
  if (!Number.isInteger(targetYear) || !Number.isInteger(targetWeek)) return [];
  const targetAbsolute = toAbsoluteWeek(targetYear, targetWeek);
  const type = options.type ?? 'meetGreet';
  const requestedDays = [...new Set([...(options.days ?? []), options.day].filter(Boolean))];
  const requestedMembers = new Set(options.memberIds ?? []);
  const reasons = [];
  const addReason = (conflictType) => {
    const label = campaignConflictLabel(conflictType);
    if (!reasons.includes(label)) reasons.push(label);
  };
  const matchesStoredCampaign = ({ absolute, type: existingType, days = [], memberIds = [] }) => {
    if (absolute !== targetAbsolute) return false;
    // Meet & Greet is a single group campaign per target week; other campaign
    // types remain slot-aware and only conflict when their day/member overlaps.
    if (type === 'meetGreet' && existingType === 'meetGreet') return true;
    if (!campaignDaysOverlap(requestedDays, days)) return false;
    if (type === 'videoCall' || type === 'mv') {
      if (isGroupCampaignType(existingType)) return true;
      return campaignMemberOverlap(requestedMembers, memberIds);
    }
    return true;
  };
  const storedCampaigns = [
    ...(state.concerts ?? []).map((event) => ({ absolute: toAbsoluteWeek(event.targetYear, event.targetWeek), type: 'concert', days: campaignEventDays(event), memberIds: event.memberIds ?? [] })),
    ...(state.yearEndMeetGreets ?? []).map((event) => ({ absolute: toAbsoluteWeek(event.year, event.targetWeek), type: 'yearEndMeetGreet', days: [event.day].filter(Boolean), memberIds: (event.memberSessions ?? []).map((session) => session.memberId) })),
    ...(state.fanEventPlans ?? []).map((event) => ({ absolute: toAbsoluteWeek(event.year, event.targetWeek), type: event.type, days: [event.day].filter(Boolean), memberIds: event.memberIds ?? [] })),
    ...(state.activityEvents ?? []).map((event) => ({ absolute: toAbsoluteWeek(event.year, event.week), type: event.type, days: [], memberIds: event.memberId ? [event.memberId] : [] })),
  ];
  storedCampaigns.forEach((campaign) => { if (matchesStoredCampaign(campaign)) addReason(campaign.type); });
  // Meet & Greet is limited to one event per four-week month, not merely one
  // target week. Check resolved events and future plans before opening the
  // confirmation flow so a second week in the same month cannot become a
  // silent no-op in assignActivity.
  if (type === 'meetGreet') {
    const targetMonth = Math.ceil(targetWeek / BALANCE.weeksPerMonth);
    const resolvedThisMonth = (state.activityEvents ?? []).some((event) => event.type === 'meetGreet' && event.year === targetYear && event.month === targetMonth);
    const plannedThisMonth = (state.fanEventPlans ?? []).some((plan) => plan.type === 'meetGreet' && plan.year === targetYear && Math.ceil(plan.targetWeek / BALANCE.weeksPerMonth) === targetMonth);
    const currentScheduleThisMonth = targetYear === state.year
      && Math.ceil(state.week / BALANCE.weeksPerMonth) === targetMonth
      && Object.values(state.schedule ?? {}).some((activity) => activity?.startsWith?.('mg'));
    if (resolvedThisMonth || plannedThisMonth || currentScheduleThisMonth) addReason('meetGreet');
  }

  (state.singles ?? []).forEach((single) => {
    if (single.status === 'released') return;
    const startYear = Number.isInteger(single.productionStartYear) ? single.productionStartYear : single.year;
    const startWeek = Number.isInteger(single.productionStartWeek) ? single.productionStartWeek : single.week;
    if (!Number.isInteger(startYear) || !Number.isInteger(startWeek)) return;
    const startAbsolute = toAbsoluteWeek(startYear, startWeek);
    if (targetAbsolute < startAbsolute || targetAbsolute >= startAbsolute + (single.durationWeeks ?? 4) || !campaignDaysOverlap(requestedDays, [single.productionDay].filter(Boolean))) return;
    if ((type === 'videoCall' || type === 'mv') && !campaignMemberOverlap(requestedMembers, single.memberIds ?? [])) return;
    addReason('mv');
  });

  if (targetAbsolute === toAbsoluteWeek(state.year, state.week) && requestedDays.length) {
    if (type === 'meetGreet' && Object.values(state.schedule ?? {}).some((activity) => activity?.startsWith?.('mg'))) addReason('meetGreet');
    Object.entries(state.schedule ?? {}).forEach(([key, activity]) => {
      if (!isCampaignActivity(activity)) return;
      const separator = key.lastIndexOf(':');
      const memberId = key.slice(0, separator);
      const day = key.slice(separator + 1);
      if (requestedDays.length && !requestedDays.includes(day)) return;
      if (type === 'videoCall' || type === 'mv') {
        const existingType = campaignTypeForActivity(activity);
        if (isGroupCampaignType(existingType)) addReason(existingType);
        else if (requestedMembers.has(memberId)) addReason(existingType);
      } else addReason(campaignTypeForActivity(activity));
    });
  }
  return reasons;
}

function createChemistry(seed, firstId, secondId) {
  if (isAllNinetySeed(seed)) return Object.fromEntries(chemistryDimensions.map((dimension) => [dimension, 100]));
  const rng = createRng(hashSeed(`${seed}:chemistry:${chemistryPairKey(firstId, secondId)}`));
  return Object.fromEntries(chemistryDimensions.map((dimension) => [dimension, randomInt(rng, 35, 95)]));
}

function buildChemistry(seed, members) {
  const chemistry = {};
  members.forEach((member, index) => {
    members.slice(index + 1).forEach((other) => {
      chemistry[chemistryPairKey(member.id, other.id)] = createChemistry(seed, member.id, other.id);
    });
  });
  return chemistry;
}

function ensureChemistry(state, members) {
  const chemistry = { ...(state.chemistry ?? {}) };
  members.forEach((member, index) => {
    members.slice(index + 1).forEach((other) => {
      const key = chemistryPairKey(member.id, other.id);
      if (!chemistry[key]) chemistry[key] = createChemistry(state.seed, member.id, other.id);
    });
  });
  return chemistry;
}

export function getMemberChemistry(state, firstId, secondId) {
  if (!firstId || !secondId || firstId === secondId) return null;
  const key = chemistryPairKey(firstId, secondId);
  return state.chemistry?.[key] ?? createChemistry(state.seed, firstId, secondId);
}

const chemistryScore = (state, memberIds, dimension = 'stage') => {
  const pairs = [];
  memberIds.forEach((memberId, index) => memberIds.slice(index + 1).forEach((otherId) => {
    const pair = getMemberChemistry(state, memberId, otherId);
    if (pair) pairs.push(pair[dimension] ?? 50);
  }));
  return pairs.length ? pairs.reduce((sum, value) => sum + value, 0) / pairs.length : 50;
};

// Roster size, for the run-ending "can the theater still operate" test. Injured members are counted:
// an injury is a scheduling problem, so it must never be able to end a run on its own.
export function getTheaterEligibleMembers(state) {
  return (state.members ?? []).filter((member) => ['active', 'trainee'].includes(member.status) && member.canPerformTheater !== false && !member.temporarilyUnavailable && (member.suspensionWeeks ?? 0) === 0);
}

// Maps an activity id onto the coarse category injuries block.
export function getActivityCategory(activityId) {
  if (!activityId) return null;
  if (BALANCE.activities[activityId]?.skill) return 'training';
  if (activityId.startsWith('vc')) return 'videoCall';
  if (activityId.startsWith('mg') || activityId === 'yearEndMeetGreet') return 'meetGreet';
  if (activityId.startsWith('mv')) return 'mv';
  return activityId;
}

export function isMemberInjured(member) {
  return (member?.injury?.weeksRemaining ?? 0) > 0;
}

// Can this member be given this activity right now? Suspension blocks everything; an injury blocks
// only the categories its severity covers, so a lightly injured member can still rest or livestream.
export function canMemberPerform(member, activityId) {
  if (!member || !['active', 'trainee'].includes(member.status) || (member.suspensionWeeks ?? 0) > 0) return false;
  if (activityId === 'clear' || activityId === 'rest') return true;
  if (!isMemberInjured(member)) return true;
  const blocks = member.injury.blocks ?? ['all'];
  if (blocks.includes('all')) return false;
  return !blocks.includes(getActivityCategory(activityId));
}

function applyMemberAbsenceToCommitments(state, memberId, durationWeeks) {
  const currentAbsolute = toAbsoluteWeek(state.year, state.week);
  const endAbsolute = Number.isFinite(durationWeeks) ? currentAbsolute + durationWeeks : Infinity;
  const absentAt = (year, week) => {
    if (!Number.isInteger(year) || !Number.isInteger(week)) return false;
    const absolute = toAbsoluteWeek(year, week);
    return absolute >= currentAbsolute && absolute < endAbsolute;
  };
  const schedule = Object.fromEntries(Object.entries(state.schedule ?? {}).filter(([key]) => !key.startsWith(`${memberId}:`)));
  const trainingPlans = { ...(state.trainingPlans ?? {}) };
  delete trainingPlans[memberId];
  const replacementFor = (lineup, activityId) => (state.members ?? [])
    .filter((candidate) => candidate.id !== memberId && !lineup.includes(candidate.id) && canMemberPerform(candidate, activityId))
    .toSorted((first, second) => (second.performance ?? 0) - (first.performance ?? 0))[0];
  const replacementNotices = [];
  let refund = 0;

  const yearEndMeetGreets = (state.yearEndMeetGreets ?? []).map((event) => {
    if (!absentAt(event.year, event.targetWeek)) return event;
    const sessions = event.memberSessions ?? [];
    const hasRefundableAssignment = sessions.some((session) => session.memberId === memberId && (session.sold ?? 0) > 0);
    if (!hasRefundableAssignment) return event;
    let eventRefund = 0;
    const memberSessions = sessions.map((session) => {
      if (session.memberId !== memberId || (session.sold ?? 0) <= 0) return session;
      eventRefund += session.sold * event.ticketPrice;
      return { ...session, refunded: (session.refunded ?? 0) + session.sold, sold: 0 };
    });
    refund += eventRefund;
    return eventRefund ? { ...event, memberSessions, revenue: Math.max(0, (event.revenue ?? 0) - eventRefund) } : event;
  });

  const concerts = (state.concerts ?? []).map((concert) => {
    if (!absentAt(concert.targetYear, concert.targetWeek) || !concert.memberIds?.includes(memberId)) return concert;
    const replacement = replacementFor(concert.memberIds, 'concert');
    if (!replacement) return { ...concert, memberIds: concert.memberIds.filter((id) => id !== memberId) };
    replacementNotices.push(`${replacement.nickname || replacement.name} joins ${concert.title} as an emergency replacement.`);
    return { ...concert, memberIds: concert.memberIds.map((id) => id === memberId ? replacement.id : id), replacements: [...(concert.replacements ?? []), { outMemberId: memberId, inMemberId: replacement.id, year: state.year, week: state.week }] };
  });

  const singles = (state.singles ?? []).map((single) => {
    if (single.status === 'released' || !single.memberIds?.includes(memberId)) return single;
    const productionStart = Number.isInteger(single.productionStartYear) && Number.isInteger(single.productionStartWeek)
      ? toAbsoluteWeek(single.productionStartYear, single.productionStartWeek)
      : single.status === 'production' ? currentAbsolute - (single.progressWeeks ?? 0) : Infinity;
    const productionEnd = productionStart + (single.durationWeeks ?? 4);
    if (productionStart >= endAbsolute || productionEnd <= currentAbsolute) return single;
    const replacement = replacementFor(single.memberIds, 'mvProduction');
    if (!replacement) return { ...single, memberIds: single.memberIds.filter((id) => id !== memberId), centerId: single.centerId === memberId ? null : single.centerId };
    replacementNotices.push(`${replacement.nickname || replacement.name} replaces an unavailable MV member.`);
    return { ...single, memberIds: single.memberIds.map((id) => id === memberId ? replacement.id : id), centerId: single.centerId === memberId ? replacement.id : single.centerId, recasts: [...(single.recasts ?? []), { outMemberId: memberId, inMemberId: replacement.id, year: state.year, week: state.week }] };
  });

  const fanEventPlans = (state.fanEventPlans ?? []).map((plan) => absentAt(plan.year, plan.targetWeek)
    ? { ...plan, memberIds: (plan.memberIds ?? []).filter((id) => id !== memberId) }
    : plan);
  return {
    state: { ...state, schedule, trainingPlans, yearEndMeetGreets, concerts, singles, fanEventPlans, money: state.money - refund },
    notifications: [
      ...(refund ? [`${moneyText(refund)} in sold fan-event tickets refunded.`] : []),
      ...replacementNotices,
    ],
  };
}

export function punishMember(state, memberId, weeks) {
  const duration = Math.max(1, Math.min(12, Math.round(Number(weeks) || 1)));
  const member = state.members?.find((item) => item.id === memberId);
  if (state.runStatus === 'ended' || !member || !['active', 'trainee', 'suspended'].includes(member.status) || state.activeDrama?.memberId !== memberId || state.activeDrama?.punishmentWeeks) return state;
  const name = member.nickname || member.name;
  const legacySuspension = member.status === 'suspended';
  const consequence = applyMemberAbsenceToCommitments(state, memberId, duration);
  const prepared = consequence.state;
  return {
    ...prepared,
    members: prepared.members.map((item) => item.id === memberId ? { ...item, status: 'suspended', suspensionWeeks: duration } : item),
    activeDrama: { ...state.activeDrama, memberId, name, originalStatus: state.activeDrama.originalStatus ?? (member.status === 'trainee' ? 'trainee' : 'active'), response: 'punished', punishmentWeeks: duration, responseYear: state.year, responseWeek: state.week },
    records: { ...(state.records ?? {}), dramaSuspensions: (state.records?.dramaSuspensions ?? 0) + (legacySuspension ? 0 : 1) },
    notifications: [{ type: 'critical', text: `${name} is suspended for ${duration} week(s).` }, ...consequence.notifications.map((text) => ({ type: 'critical', text })), ...(state.notifications ?? [])].slice(0, 20),
    history: [{ id: `punishment-${memberId}-${state.year}-${state.week}`, type: 'punishment', memberId, memberName: name, weeks: duration, title: `${name} receives a suspension`, detail: `${duration} week(s) suspension recorded by management.`, year: state.year, week: state.week }, ...(state.history ?? [])],
  };
}

export function resolveMemberDramaWithoutPunishment(state, memberId) {
  const member = state.members?.find((item) => item.id === memberId);
  const drama = state.activeDrama;
  if (state.runStatus === 'ended' || !member || drama?.memberId !== memberId || drama.punishmentWeeks) return state;
  const name = member.nickname || member.name;
  const legacySuspension = member.status === 'suspended';
  const originalStatus = drama.originalStatus === 'trainee' ? 'trainee' : 'active';
  const cooldownRng = createRng(hashSeed(`${state.seed}:drama-response:${drama.dramaId ?? 'member'}:${memberId}:${drama.startedWeek ?? state.week}`));
  const cooldown = randomInt(cooldownRng, ...BALANCE.dramaCooldown);
  return {
    ...state,
    members: state.members.map((item) => item.id === memberId && item.status === 'suspended' ? { ...item, status: originalStatus, suspensionWeeks: 0 } : item),
    activeDrama: null,
    dramaCooldown: cooldown,
    memberDramaCooldown: cooldown,
    records: { ...(state.records ?? {}), dramaSuspensions: Math.max(0, (state.records?.dramaSuspensions ?? 0) - (legacySuspension ? 1 : 0)) },
    notifications: [{ type: 'success', text: `${name} receives no punishment and remains available.` }, ...(state.notifications ?? [])].slice(0, 20),
    history: [{ id: `drama-no-punishment-${memberId}-${state.year}-${state.week}`, type: 'drama', dramaSource: 'member', memberId, memberName: name, response: 'none', title: `${name} receives no punishment`, detail: 'Management lets the incident pass without suspending the member.', year: state.year, week: state.week }, ...(state.history ?? [])],
  };
}

// Members who can actually be put to work this week.
export function getSchedulableMembers(state, activityId = null) {
  return (state.members ?? []).filter((member) => activityId ? canMemberPerform(member, activityId) : ['active', 'trainee'].includes(member.status) && (member.suspensionWeeks ?? 0) === 0 && !isMemberInjured(member));
}

export function getRosterDanger(count) {
  if (count >= 23) return 'COMFORTABLE';
  if (count >= 18) return 'STABLE';
  if (count >= 15) return 'THIN';
  if (count >= 13) return 'DANGER';
  if (count === 12) return 'MINIMUM THEATER ROSTER';
  return 'THEATER CANNOT OPERATE';
}

function makeStats(rng, archetype, hardMode = false) {
  const baseMin = hardMode ? 40 : 38;
  const baseMax = hardMode ? 60 : 82;
  const boostMin = hardMode ? 5 : 8;
  const boostMax = hardMode ? 10 : 18;
  const stats = Object.fromEntries(SKILLS.map((key) => [key, randomInt(rng, baseMin, baseMax)]));
  const boost = {
    Performer: ['dance', 'performance'], Vocalist: ['vocal'], Entertainer: ['mc', 'variety'],
    'All-Rounder': SKILLS, Specialist: [SKILLS[randomInt(rng, 0, SKILLS.length - 1)]],
    'Raw Prospect': [], Prodigy: ['vocal', 'dance', 'performance'], 'Late Bloomer': [],
  }[archetype];
  boost.forEach((key) => { stats[key] = clamp(stats[key] + randomInt(rng, boostMin, boostMax)); });
  return stats;
}

function makeHiddenProfile(rng, archetype) {
  return {
    consistency: randomInt(rng, 35, 95),
    adaptability: randomInt(rng, 30, 96),
    developmentCurve: archetype === 'Late Bloomer' ? 'late' : archetype === 'Prodigy' ? 'early' : ['early', 'steady', 'late'][randomInt(rng, 0, 2)],
  };
}

function makeFanComposition(rng) {
  const raw = { core: randomInt(rng, 18, 42), casual: randomInt(rng, 15, 35), digital: randomInt(rng, 12, 40), event: randomInt(rng, 8, 30) };
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  const composition = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Math.round(value / total * 100)]));
  composition.event += 100 - Object.values(composition).reduce((sum, value) => sum + value, 0);
  return composition;
}

// Birthdays are fictional simulation data, derived from the run seed plus a stable identity key so a
// reloaded save always rebuilds the same month and year. Only month and year are modelled.
export function createBirthday(seed, identityKey, careerStage = 'Early') {
  const rng = createRng(hashSeed(`${seed}:birthday:${identityKey}`));
  const ageBand = { Early: [17, 21], Established: [19, 24], Veteran: [21, 27] }[careerStage] ?? [17, 24];
  return { birthMonth: randomInt(rng, 1, 12), birthYear: BALANCE.birthdayReferenceYear - randomInt(rng, ageBand[0], ageBand[1]) };
}

export function getMemberAge(member, year = 1) {
  if (!Number.isFinite(member?.birthYear)) return null;
  return BALANCE.birthdayReferenceYear + (year - 1) - member.birthYear;
}

function shuffleWithRng(items, rng) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(rng, 0, index);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function makePoolCandidate(member, poolSize, qualityBonus = 0) {
  return {
    ...member,
    candidateId: member.id,
    sourcePoolId: member.id,
    identityId: member.identityId ?? member.id,
    originalTeam: member.originalTeam ?? member.team,
    team: 'TRAINEE',
    status: 'trainee',
    energy: 100,
    suspensionWeeks: 0,
    injury: member.injury ?? null,
    injuryHistory: member.injuryHistory ?? [],
    weeksWithoutEvent: 0,
    graduationPending: false,
    traineeWeeks: 0,
    trainingProgress: 0,
    theaterAppearances: 0,
    potential: clamp((member.potential ?? 70) + qualityBonus),
    development: clamp((member.development ?? 50) + qualityBonus),
    canPerformTheater: true,
    finalistPoolSize: poolSize,
  };
}

function recycleMemberForPool(member, state, graduation) {
  const identityId = member.identityId ?? member.id;
  const incarnation = (member.incarnation ?? 0) + 1;
  const rng = createRng(hashSeed(`${state.seed}:pool-return:${graduation.id}:${incarnation}`));
  const archetype = ARCHETYPES[randomInt(rng, 0, ARCHETYPES.length - 1)];
  const injuryHistory = (member.injuryHistory ?? []).map((incident) => {
    if (incident.status !== 'active') return incident;
    const recoveredAt = fromAbsoluteWeek(toAbsoluteWeek(incident.startYear, incident.startWeek) + Math.max(1, incident.originalWeeks ?? 1));
    return { ...incident, status: 'recovered', recoveredYear: recoveredAt.year, recoveredWeek: recoveredAt.week };
  });
  return {
    id: `${identityId}-return-${incarnation}`,
    identityId,
    incarnation,
    name: member.name,
    nickname: member.nickname,
    generation: member.generation,
    team: member.originalTeam ?? member.team ?? '',
    originalTeam: member.originalTeam ?? member.team ?? '',
    photo: member.photo,
    graduated: false,
    archetype,
    traits: [TRAITS[randomInt(rng, 0, TRAITS.length - 1)]],
    ...makeStats(rng, 'Raw Prospect', state.hardMode),
    ...makeHiddenProfile(rng, archetype),
    popularity: randomInt(rng, 10, 35),
    energy: 100,
    ego: randomInt(rng, 0, 100),
    potential: randomInt(rng, 62, 98),
    development: randomInt(rng, 35, 92),
    fanbase: randomInt(rng, 300, 1200),
    fanComposition: makeFanComposition(rng),
    oshiSentiment: 0,
    momentum: 0,
    traineeWeeks: 0,
    trainingProgress: 0,
    theaterAppearances: 0,
    status: 'active',
    careerStage: 'Early',
    joinedYear: null,
    joinedWeek: null,
    canPerformTheater: true,
    suspensionWeeks: 0,
    injury: null,
    injuryHistory,
    weeksWithoutEvent: 0,
    salary: member.salary,
    // A returning graduate is the same person, so the birthday carries over even though every
    // performance stat above is regenerated.
    birthMonth: member.birthMonth ?? createBirthday(state.seed, identityId).birthMonth,
    birthYear: member.birthYear ?? createBirthday(state.seed, identityId).birthYear,
    appearances: { theater: 0, center: 0, media: 0, offAir: 0 },
    setlistFamiliarity: {},
  };
}

function developmentCurveMultiplier(member, year) {
  if (member.developmentCurve === 'late') return year >= 3 ? 1.2 : 0.82;
  if (member.developmentCurve === 'early') return year <= 2 ? 1.15 : 0.9;
  return 1;
}

const roundTo = (value, step) => Math.round(value / step) * step;

// Stamina both lowers what an activity costs and raises what rest gives back, so investing in it
// compounds across a week instead of only trimming fatigue.
export const staminaCostMultiplier = (stamina = 50) => Math.max(BALANCE.stamina.costFloor, BALANCE.stamina.costBase - (stamina ?? 50) * BALANCE.stamina.costPerPoint);
export const staminaRecoveryMultiplier = (stamina = 50) => 1 + (stamina ?? 50) * BALANCE.stamina.recoveryPerPoint;

function activeMentorshipFor(state, memberId) {
  return (state.mentorships ?? []).find((item) => item.menteeId === memberId
    && item.status === 'active'
    && toAbsoluteWeek(state.year, state.week) >= toAbsoluteWeek(item.startYear, item.startWeek)
    && toAbsoluteWeek(state.year, state.week) < item.endAbsolute);
}

function trainingStatGain(member, stats, activity, energyBefore, state, mentorship) {
  const ceiling = Math.max(0.15, (member.potential - stats[activity.skill]) / 45);
  const traitBonus = member.traits.includes('Quick Learner') ? 1.2 : 1;
  const trainingRate = bonusValue(state, 'B015') + (member.status === 'trainee' ? bonusValue(state, 'B016') : 0) + (mentorship?.developmentBonus ?? 0);
  const energyEffectiveness = energyBefore >= 60 ? 1 : energyBefore >= 40 ? 0.9 : energyBefore >= 20 ? 0.7 : 0.4;
  const lowestSkill = SKILLS.reduce((lowest, skill) => stats[skill] < stats[lowest] ? skill : lowest, SKILLS[0]);
  const crossTrainingRate = activity.skill === lowestSkill ? bonusValue(state, 'B018') : 0;
  const adaptabilityRate = activity.skill === lowestSkill ? 0.9 + (member.adaptability ?? 50) / 500 : member.traits.includes('Versatile') ? 1.08 : 1;
  const gain = ceiling * member.development / 100 * developmentCurveMultiplier(member, state.year) * adaptabilityRate * traitBonus * energyEffectiveness * (activity.intensity ?? 1) * (1 + trainingRate + crossTrainingRate);
  return Math.max(0.1, gain);
}

function activityEnergyChange(state, member, activityId, activityDay = null) {
  const activity = BALANCE.activities[activityId];
  if (!activity) return { fatigue: 0, recovery: 0 };
  const energyRate = (['theater', 'concert'].includes(activityId) ? bonusValue(state, 'B012') : 0)
    + (/^(mg|vc)/.test(activityId) || activityId === 'yearEndMeetGreet' ? bonusValue(state, 'B013') : 0)
    + (activityId === 'concertRehearsal' ? bonusValue(state, 'B014') : 0);
  let fatigue = Math.round((activity.energy ?? 0) * staminaCostMultiplier(member.stamina) * (1 + energyRate));
  const theaterShow = activityId === 'theater' ? state.theaterShows?.[activityDay] : null;
  if (theaterShow?.isSeitansai && theaterShow.seitansaiMemberId === member.id && member.birthMonth === Math.ceil(state.week / BALANCE.weeksPerMonth)) fatigue += 5;
  return {
    fatigue,
    recovery: Math.round((activity.energyRecovery ?? 0) * staminaRecoveryMultiplier(member.stamina)),
  };
}

export function getConfirmedScheduleForWeek(state, targetYear, targetWeek) {
  if (!Number.isInteger(targetYear) || targetYear < 1 || !Number.isInteger(targetWeek) || targetWeek < 1 || targetWeek > BALANCE.weeksPerYear) return {};
  const targetAbsolute = toAbsoluteWeek(targetYear, targetWeek);
  const currentAbsolute = toAbsoluteWeek(state.year, state.week);
  if (targetAbsolute < currentAbsolute) return {};
  const schedule = targetAbsolute === currentAbsolute ? { ...(state.schedule ?? {}) } : {};
  const weeksUntilTarget = targetAbsolute - currentAbsolute;
  const membersById = new Map((state.members ?? []).map((member) => [member.id, member]));
  const canAttend = (memberId) => {
    const member = membersById.get(memberId);
    if (!member || member.status === 'graduated') return false;
    if (['active', 'trainee'].includes(member.status)) return true;
    return member.status === 'suspended' && (member.suspensionWeeks ?? Infinity) <= weeksUntilTarget;
  };
  const reserve = (memberIds, day, activityId) => {
    if (!DAYS.includes(day)) return;
    (memberIds ?? []).filter(canAttend).forEach((memberId) => {
      claimScheduleSlot(schedule, `${memberId}:${day}`, activityId);
    });
  };

  (state.concerts ?? [])
    .filter((concert) => concert.status !== 'cancelled' && toAbsoluteWeek(concert.targetYear, concert.targetWeek) === targetAbsolute)
    .forEach((concert) => {
      reserve(concert.memberIds, concert.day, 'concert');
      if (concert.eventType === 'anniversary') (concert.rehearsalDays ?? []).forEach((day) => reserve(concert.memberIds, day, 'concertRehearsal'));
    });
  (state.yearEndMeetGreets ?? [])
    .filter((event) => event.status !== 'cancelled' && toAbsoluteWeek(event.year, event.targetWeek) === targetAbsolute)
    .forEach((event) => reserve((event.memberSessions ?? []).map((session) => session.memberId), event.day, 'yearEndMeetGreet'));
  (state.fanEventPlans ?? [])
    .filter((plan) => plan.status !== 'cancelled' && plan.year === targetYear && plan.targetWeek === targetWeek && plan.type === 'meetGreet')
    .forEach((plan) => reserve(plan.memberIds, plan.day, 'mg1'));
  (state.singles ?? [])
    .filter((single) => single.status !== 'released' && single.status !== 'cancelled')
    .forEach((single) => {
      const startYear = Number.isInteger(single.productionStartYear) ? single.productionStartYear : single.year;
      const startWeek = Number.isInteger(single.productionStartWeek) ? single.productionStartWeek : single.week;
      if (!Number.isInteger(startYear) || !Number.isInteger(startWeek)) return;
      const startAbsolute = toAbsoluteWeek(startYear, startWeek);
      if (targetAbsolute >= startAbsolute && targetAbsolute < startAbsolute + (single.durationWeeks ?? 4)) reserve(single.memberIds, single.productionDay, 'mvProduction');
    });
  (state.fanEventPlans ?? [])
    .filter((plan) => plan.status !== 'cancelled' && plan.year === targetYear && plan.targetWeek === targetWeek && plan.type === 'videoCall')
    .forEach((plan) => reserve(plan.memberIds, plan.day, 'vc1'));
  return schedule;
}

export function getScheduleSnapshotForWeek(state, targetYear, targetWeek) {
  if (!Number.isInteger(targetYear) || targetYear < 1 || !Number.isInteger(targetWeek) || targetWeek < 1 || targetWeek > BALANCE.weeksPerYear) return { kind: 'missing', schedule: null };
  const report = (state.weeklyReports ?? []).find((item) => item.year === targetYear && item.week === targetWeek);
  if (report) return { kind: 'resolved', schedule: report.schedule ?? null };
  if (toAbsoluteWeek(targetYear, targetWeek) < toAbsoluteWeek(state.year, state.week)) return { kind: 'missing', schedule: null };
  const schedule = getConfirmedScheduleForWeek(state, targetYear, targetWeek);
  return { kind: 'confirmed', schedule: Object.keys(schedule).length ? schedule : null };
}

function currentWeekSchedule(state) {
  return getConfirmedScheduleForWeek(state, state.year, state.week);
}

const validTrainingSessions = (sessions) => (Array.isArray(sessions) ? sessions : [])
  .filter((activityId) => TRAINING_ACTIVITY_SET.has(activityId))
  .slice(0, BALANCE.training.maxSessionsPerMember);

const trainingPlanFor = (state, memberId) => validTrainingSessions(state.trainingPlans?.[memberId]);

const splitScheduleKey = (key) => {
  const separator = key.lastIndexOf(':');
  return { memberId: key.slice(0, separator), day: key.slice(separator + 1) };
};

function migrateTrainingReport(report) {
  if (!report) return report;
  const scheduleEntries = Object.entries(report.schedule ?? {});
  const legacySessions = scheduleEntries
    .filter(([, activityId]) => TRAINING_ACTIVITY_SET.has(activityId))
    .sort(([leftKey], [rightKey]) => DAYS.indexOf(splitScheduleKey(leftKey).day) - DAYS.indexOf(splitScheduleKey(rightKey).day))
    .map(([key, activityId], index) => {
      const { memberId, day } = splitScheduleKey(key);
      const activity = BALANCE.activities[activityId];
      return { memberId, activityId, skill: activity.skill, intensity: activity.type, order: index, day, status: 'completed', cost: activity.cost, energyUsed: null, before: null, after: null, delta: null, legacy: true };
    });
  if (!legacySessions.length) return { ...report, trainingSessions: report.trainingSessions ?? [] };
  const schedule = Object.fromEntries(scheduleEntries.filter(([, activityId]) => !TRAINING_ACTIVITY_SET.has(activityId)));
  const existingKeys = new Set((report.trainingSessions ?? []).map((session) => `${session.memberId}:${session.day}:${session.activityId}`));
  return { ...report, schedule, trainingSessions: [...(report.trainingSessions ?? []), ...legacySessions.filter((session) => !existingKeys.has(`${session.memberId}:${session.day}:${session.activityId}`))] };
}

export function migrateTrainingState(state) {
  if (!state) return state;
  const scheduleEntries = Object.entries(state.schedule ?? {});
  const legacyByMember = new Map();
  scheduleEntries.filter(([, activityId]) => TRAINING_ACTIVITY_SET.has(activityId)).forEach(([key, activityId]) => {
    const { memberId, day } = splitScheduleKey(key);
    const sessions = legacyByMember.get(memberId) ?? [];
    sessions.push({ activityId, day });
    legacyByMember.set(memberId, sessions);
  });
  const trainingPlans = Object.fromEntries(Object.entries(state.trainingPlans ?? {})
    .map(([memberId, sessions]) => [memberId, validTrainingSessions(sessions)])
    .filter(([, sessions]) => sessions.length));
  legacyByMember.forEach((sessions, memberId) => {
    if (trainingPlanFor({ trainingPlans }, memberId).length) return;
    trainingPlans[memberId] = sessions.toSorted((left, right) => DAYS.indexOf(left.day) - DAYS.indexOf(right.day)).map((session) => session.activityId).slice(0, BALANCE.training.maxSessionsPerMember);
  });

  const trainingTemplates = (state.trainingTemplates ?? []).map((template) => ({
    ...template,
    entries: (template.entries ?? []).map((entry) => ({ ...entry, sessions: validTrainingSessions(entry.sessions) })).filter((entry) => entry.sessions.length),
  }));
  const trainingTemplateIds = new Set(trainingTemplates.map((template) => template.id));
  const scheduleTemplates = [];
  (state.scheduleTemplates ?? []).forEach((template, templateIndex) => {
    const trainingEntries = (template.entries ?? []).filter((entry) => TRAINING_ACTIVITY_SET.has(entry.activityId));
    const scheduleEntriesForTemplate = (template.entries ?? []).filter((entry) => !TRAINING_ACTIVITY_SET.has(entry.activityId));
    if (scheduleEntriesForTemplate.length) scheduleTemplates.push({ ...template, entries: scheduleEntriesForTemplate });
    if (!trainingEntries.length) return;
    const id = `training-${template.id ?? `legacy-${templateIndex}`}`;
    if (trainingTemplateIds.has(id)) return;
    const plans = new Map();
    trainingEntries.toSorted((left, right) => DAYS.indexOf(left.day) - DAYS.indexOf(right.day)).forEach((entry) => {
      const sessions = plans.get(entry.memberId) ?? [];
      if (sessions.length < BALANCE.training.maxSessionsPerMember) sessions.push(entry.activityId);
      plans.set(entry.memberId, sessions);
    });
    trainingTemplates.push({ id, name: template.name, createdYear: template.createdYear, createdWeek: template.createdWeek, entries: [...plans].map(([memberId, sessions]) => ({ memberId, sessions })) });
    trainingTemplateIds.add(id);
  });

  return {
    ...state,
    trainingSchemaVersion: TRAINING_SCHEMA_VERSION,
    schedule: Object.fromEntries(scheduleEntries.filter(([, activityId]) => !TRAINING_ACTIVITY_SET.has(activityId))),
    trainingPlans,
    scheduleTemplates,
    trainingTemplates,
    weeklyReports: (state.weeklyReports ?? []).map(migrateTrainingReport),
    lastResult: migrateTrainingReport(state.lastResult),
  };
}

const injuryIncidentId = (member, injury, state) => {
  const identityId = member.identityId ?? member.id;
  const startYear = injury?.causedBy?.year ?? state.year;
  const startWeek = injury?.causedBy?.week ?? state.week;
  return `injury-${slug(identityId)}-${startYear}-${startWeek}`;
};

const normalizeInjuryAssignments = (assignments) => (Array.isArray(assignments) ? assignments : [])
  .map((assignment) => ({
    day: assignment?.day ?? null,
    activityId: assignment?.activityId ?? (typeof assignment === 'string' ? assignment : null),
    source: assignment?.source === 'training' ? 'training' : 'schedule',
  }))
  .filter((assignment) => assignment.activityId && assignment.activityId !== 'rest');

function createInjuryIncident(member, injury, state, legacy = false) {
  const startYear = injury?.causedBy?.year ?? state.year;
  const startWeek = injury?.causedBy?.week ?? state.week;
  return {
    id: injury.incidentId ?? injuryIncidentId(member, injury, state),
    memberId: member.id,
    identityId: member.identityId ?? member.id,
    severity: injury.severity,
    label: injury.label ?? injury.severity,
    startYear,
    startWeek,
    originalWeeks: Math.max(1, injury.weeks ?? injury.originalWeeks ?? injury.weeksRemaining ?? 1),
    workload: Number.isFinite(injury?.causedBy?.load) ? injury.causedBy.load : null,
    assignments: normalizeInjuryAssignments(injury?.causedBy?.assignments),
    status: 'active',
    recoveredYear: null,
    recoveredWeek: null,
    ...(legacy ? { legacy: true } : {}),
  };
}

function injuryTimelineEvent(incident, memberName, status) {
  const recovered = status === 'recovered';
  const activityText = incident.assignments?.length
    ? ` Activities: ${incident.assignments.map((assignment) => `${assignment.day ?? 'Unknown day'} — ${BALANCE.activities[assignment.activityId]?.label ?? assignment.activityId}`).join('; ')}.`
    : '';
  return recovered
    ? {
      id: `${incident.id}-recovery`, type: 'injuryRecovery', injuryStatus: 'recovered', incidentId: incident.id, memberId: incident.memberId, identityId: incident.identityId,
      memberName, severity: incident.severity, label: incident.label, originalWeeks: incident.originalWeeks, workload: incident.workload, assignments: incident.assignments,
      title: `${memberName} recovers from injury`, detail: `${incident.label} injury cleared after ${incident.originalWeeks} week(s).`, year: incident.recoveredYear, week: incident.recoveredWeek,
    }
    : {
      id: `${incident.id}-onset`, type: 'injury', injuryStatus: 'onset', incidentId: incident.id, memberId: incident.memberId, identityId: incident.identityId,
      memberName, severity: incident.severity, label: incident.label, originalWeeks: incident.originalWeeks, workload: incident.workload, assignments: incident.assignments,
      title: `${memberName} suffers a ${String(incident.label).toLowerCase()} injury`, detail: `${incident.label} injury after workload ${incident.workload ?? 'unknown'}. Estimated recovery: ${incident.originalWeeks} week(s).${activityText}`, year: incident.startYear, week: incident.startWeek,
    };
}

function appendMissingInjuryRecoveryEvents(member, history) {
  const memberName = member.nickname || member.name;
  (member.injuryHistory ?? []).filter((incident) => incident.status === 'recovered').forEach((incident) => {
    const event = injuryTimelineEvent(incident, memberName, 'recovered');
    if (!history.some((item) => item.id === event.id)) history.unshift(event);
  });
}

function migrateMemberInjuryHistory(member, state) {
  if (!member) return { member, backfilledIncident: null };
  const injuryHistory = Array.isArray(member.injuryHistory) ? member.injuryHistory.map((incident) => ({
    ...incident,
    memberId: incident.memberId ?? member.id,
    identityId: incident.identityId ?? member.identityId ?? member.id,
    assignments: normalizeInjuryAssignments(incident.assignments),
    status: incident.status === 'recovered' ? 'recovered' : 'active',
    recoveredYear: incident.recoveredYear ?? null,
    recoveredWeek: incident.recoveredWeek ?? null,
  })) : [];
  if (!isMemberInjured(member)) return { member: { ...member, injuryHistory }, backfilledIncident: null };
  const incidentId = member.injury.incidentId ?? injuryHistory.find((incident) => incident.status === 'active')?.id ?? injuryIncidentId(member, member.injury, state);
  const existing = injuryHistory.find((incident) => incident.id === incidentId);
  const incident = existing ?? createInjuryIncident(member, { ...member.injury, incidentId }, state, true);
  return {
    member: { ...member, injury: { ...member.injury, incidentId }, injuryHistory: existing ? injuryHistory : [incident, ...injuryHistory] },
    backfilledIncident: existing ? null : incident,
  };
}

export function migrateInjuryHistoryState(state) {
  if (!state) return state;
  const backfilled = [];
  const migrateMember = (member) => {
    const migrated = migrateMemberInjuryHistory(member, state);
    if (migrated.backfilledIncident) backfilled.push({ incident: migrated.backfilledIncident, memberName: member.nickname || member.name });
    return migrated.member;
  };
  const members = (state.members ?? []).map(migrateMember);
  const unsignedMembers = (state.unsignedMembers ?? []).map(migrateMember);
  const departures = (state.departures ?? []).map((departure) => departure.member ? { ...departure, member: migrateMember(departure.member) } : departure);
  const history = [...(state.history ?? [])];
  const historyIds = new Set(history.map((event) => event.id));
  const migrationEvents = backfilled.map(({ incident, memberName }) => injuryTimelineEvent(incident, memberName, 'onset')).filter((event) => !historyIds.has(event.id));
  return { ...state, injuryHistorySchemaVersion: INJURY_HISTORY_SCHEMA_VERSION, members, unsignedMembers, departures, history: [...migrationEvents, ...history] };
}

export function getTrainingPlanStatus(state, memberId) {
  const member = state.members?.find((item) => item.id === memberId);
  const plan = trainingPlanFor(state, memberId);
  const schedule = currentWeekSchedule(state);
  const freeDays = DAYS.filter((day) => {
    const activityId = schedule[`${memberId}:${day}`];
    return !activityId || activityId === 'rest';
  });
  const available = Boolean(member && canMemberPerform(member, TRAINING_ACTIVITY_IDS[0]));
  return { memberId, available, planned: plan.length, capacity: available ? freeDays.length : 0, freeDays, overflow: available ? Math.max(0, plan.length - freeDays.length) : plan.length };
}

export function queueTrainingSession(state, memberId, activityId) {
  if (state.runStatus === 'ended' || !TRAINING_ACTIVITY_SET.has(activityId)) return state;
  const member = state.members?.find((item) => item.id === memberId);
  const status = getTrainingPlanStatus(state, memberId);
  const plan = trainingPlanFor(state, memberId);
  if (!member || !canMemberPerform(member, activityId) || plan.length >= BALANCE.training.maxSessionsPerMember || plan.length >= status.capacity) return state;
  return { ...state, trainingPlans: { ...(state.trainingPlans ?? {}), [memberId]: [...plan, activityId] } };
}

export function moveTrainingSession(state, memberId, fromIndex, toIndex) {
  const plan = trainingPlanFor(state, memberId);
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 || fromIndex >= plan.length || toIndex < 0 || toIndex >= plan.length || fromIndex === toIndex) return state;
  const sessions = [...plan];
  const [session] = sessions.splice(fromIndex, 1);
  sessions.splice(toIndex, 0, session);
  return { ...state, trainingPlans: { ...(state.trainingPlans ?? {}), [memberId]: sessions } };
}

export function removeTrainingSession(state, memberId, index) {
  const plan = trainingPlanFor(state, memberId);
  if (!Number.isInteger(index) || index < 0 || index >= plan.length) return state;
  const sessions = plan.filter((_, sessionIndex) => sessionIndex !== index);
  const trainingPlans = { ...(state.trainingPlans ?? {}) };
  if (sessions.length) trainingPlans[memberId] = sessions;
  else delete trainingPlans[memberId];
  return { ...state, trainingPlans };
}

export function clearTrainingPlan(state, memberId) {
  if (!state.trainingPlans?.[memberId]) return state;
  const trainingPlans = { ...state.trainingPlans };
  delete trainingPlans[memberId];
  return { ...state, trainingPlans };
}

export function saveTrainingTemplate(state, name) {
  const cleanName = String(name ?? '').trim().slice(0, 40);
  const entries = Object.entries(state.trainingPlans ?? {}).map(([memberId, sessions]) => ({ memberId, sessions: validTrainingSessions(sessions) })).filter((entry) => entry.sessions.length);
  if (!cleanName || !entries.length || state.runStatus === 'ended') return state;
  const template = { id: `training-template-${Date.now()}`, name: cleanName, createdYear: state.year, createdWeek: state.week, entries };
  return { ...state, trainingTemplates: [...(state.trainingTemplates ?? []), template] };
}

export function renameTrainingTemplate(state, templateId, name) {
  const cleanName = String(name ?? '').trim().slice(0, 40);
  if (!cleanName || !(state.trainingTemplates ?? []).some((template) => template.id === templateId)) return state;
  return { ...state, trainingTemplates: state.trainingTemplates.map((template) => template.id === templateId ? { ...template, name: cleanName } : template) };
}

export function deleteTrainingTemplate(state, templateId) {
  if (!(state.trainingTemplates ?? []).some((template) => template.id === templateId)) return state;
  return { ...state, trainingTemplates: state.trainingTemplates.filter((template) => template.id !== templateId) };
}

export function applyTrainingTemplate(state, template) {
  if (!template?.entries?.length || state.runStatus === 'ended') return state;
  const trainingPlans = { ...(state.trainingPlans ?? {}) };
  let skipped = 0;
  template.entries.forEach((entry) => {
    const member = state.members?.find((item) => item.id === entry.memberId);
    const capacity = getTrainingPlanStatus(state, entry.memberId).capacity;
    const requestedSessions = validTrainingSessions(entry.sessions);
    const sessions = requestedSessions.filter((activityId) => member && canMemberPerform(member, activityId)).slice(0, Math.min(capacity, BALANCE.training.maxSessionsPerMember));
    skipped += Math.max(0, requestedSessions.length - sessions.length);
    if (sessions.length) trainingPlans[entry.memberId] = sessions;
    else delete trainingPlans[entry.memberId];
  });
  const notification = skipped ? { type: 'critical', text: `${skipped} training template session(s) skipped because members or days were unavailable.` } : { type: 'success', text: `${template.name} training plan applied.` };
  return { ...state, trainingPlans, notifications: [notification, ...(state.notifications ?? [])].slice(0, 20) };
}

function composeMemberWeekAssignments(state, member, schedule, validTheaterDays, validOffAirDays) {
  const plan = trainingPlanFor(state, member.id);
  const skippedTraining = [];
  const injuryActive = Boolean(member.injury && (member.injury.weeksRemaining ?? 0) > 0);
  const unavailableReason = (member.suspensionWeeks ?? 0) > 0 ? 'suspended' : !['active', 'trainee'].includes(member.status) ? 'unavailable' : injuryActive ? 'injured' : null;
  if (unavailableReason) plan.forEach((activityId, order) => skippedTraining.push({ memberId: member.id, activityId, skill: BALANCE.activities[activityId]?.skill, intensity: BALANCE.activities[activityId]?.type, order, day: null, status: 'skipped', reason: unavailableReason, cost: 0, energyUsed: 0, before: null, after: null, delta: 0 }));
  if (injuryActive) return { assignments: DAYS.map((day) => ({ activityId: 'rest', day })), skippedTraining };

  let trainingIndex = 0;
  const assignments = DAYS.map((day) => {
    const scheduledActivityId = schedule[`${member.id}:${day}`];
    const freeForTraining = !scheduledActivityId || scheduledActivityId === 'rest';
    if (!unavailableReason && freeForTraining && trainingIndex < plan.length) {
      const activityId = plan[trainingIndex];
      const assignment = { activityId, day, source: 'training', trainingIndex };
      trainingIndex += 1;
      return assignment;
    }
    if (scheduledActivityId === 'theater' && !validTheaterDays.has(day)) return null;
    if (scheduledActivityId === 'offAir' && !validOffAirDays.has(day)) return null;
    return { activityId: scheduledActivityId ?? 'rest', day };
  }).filter(Boolean);

  if (!unavailableReason) plan.slice(trainingIndex).forEach((activityId, offset) => skippedTraining.push({ memberId: member.id, activityId, skill: BALANCE.activities[activityId]?.skill, intensity: BALANCE.activities[activityId]?.type, order: trainingIndex + offset, day: null, status: 'skipped', reason: 'no-free-day', cost: 0, energyUsed: 0, before: null, after: null, delta: 0 }));
  return { assignments, skippedTraining };
}

function scheduleLineupValidity(state, schedule) {
  const theaterLineups = Object.fromEntries(DAYS.map((day) => [day, state.members.reduce((count, member) => count + (schedule[`${member.id}:${day}`] === 'theater' ? 1 : 0), 0)]));
  const offAirLineups = Object.fromEntries(DAYS.map((day) => [day, state.members.reduce((count, member) => count + (schedule[`${member.id}:${day}`] === 'offAir' ? 1 : 0), 0)]));
  const validTheaterDays = new Set(DAYS.filter((day) => theaterLineups[day] === BALANCE.theaterMinimumMembers));
  const completeOffAirDays = DAYS.filter((day) => offAirLineups[day] === BALANCE.activities.offAir.requiredMembers);
  return {
    theaterLineups,
    offAirLineups,
    validTheaterDays,
    validOffAirDays: new Set(completeOffAirDays.slice(0, BALANCE.activities.offAir.maxPerWeek)),
    surplusOffAirDays: completeOffAirDays.slice(BALANCE.activities.offAir.maxPerWeek),
  };
}

function projectMemberEnergy(state, member, schedule, validTheaterDays, validOffAirDays) {
  if ((member.suspensionWeeks ?? 0) > 0) return member.suspensionWeeks === 1 ? 100 : member.energy;
  const { assignments } = composeMemberWeekAssignments(state, member, schedule, validTheaterDays, validOffAirDays);
  let energy = voucherBaseFor(member, 'energy');
  const stats = { ...member };
  SKILLS.forEach((skill) => { stats[skill] = voucherBaseFor(member, skill); });
  const mentorship = activeMentorshipFor(state, member.id);
  for (const { activityId, day } of assignments) {
    const activity = BALANCE.activities[activityId];
    if (!activity || (energy <= 0 && !activity.energyRecovery)) continue;
    const energyBefore = energy;
    const { fatigue, recovery } = activityEnergyChange(state, member, activityId, day);
    energy = clamp(energy - fatigue + recovery);
    if (activity.skill) {
      const statCap = voucherNaturalCap(member, activity.skill);
      stats[activity.skill] = clamp(stats[activity.skill] + trainingStatGain(member, stats, activity, energyBefore, state, mentorship), statCap.min, statCap.max);
    }
  }
  const energyCap = voucherNaturalCap(member, 'energy');
  const displayedEnergy = clamp(energy, energyCap.min, energyCap.max) + voucherAdjustmentFor(member, 'energy');
  if (!['active', 'trainee'].includes(member.status)) return displayedEnergy;
  const projectedStamina = Math.round((stats.stamina + voucherAdjustmentFor(member, 'stamina')) * 10) / 10;
  const passiveRecovery = Math.round((BALANCE.weeklyRecovery + bonusValue(state, 'B011')) * staminaRecoveryMultiplier(projectedStamina));
  return clamp(displayedEnergy + passiveRecovery);
}

export function getProjectedEnergyByMember(state) {
  const schedule = currentWeekSchedule(state);
  const { validTheaterDays, validOffAirDays } = scheduleLineupValidity(state, schedule);
  return Object.fromEntries(state.members.map((member) => [member.id, projectMemberEnergy(state, member, schedule, validTheaterDays, validOffAirDays)]));
}

export function calculateNextFanTarget(lastFanTarget, year) {
  const { fixedGrowthPercent, startingRunningGrowthPercent, runningGrowthIncreasePerYear, maxRunningGrowthPercent, year2PlusBonusPercent = 0 } = FAN_BALANCE.target;
  const runningGrowthPercent = Math.min(startingRunningGrowthPercent + (year - 1) * runningGrowthIncreasePerYear, maxRunningGrowthPercent);
  const bonusPercent = year >= 2 ? year2PlusBonusPercent : 0;
  return Math.round(lastFanTarget * (1 + (fixedGrowthPercent + runningGrowthPercent + bonusPercent) / 100));
}

export function createAnnualFanTarget(year, lastFanTarget = FAN_BALANCE.startingFanTarget, startingFanbase = FAN_BALANCE.startingFans) {
  const baseTarget = year === 1 ? FAN_BALANCE.startingFanTarget : lastFanTarget;
  const targetFanbase = year === 1 ? FAN_BALANCE.startingFanTarget : calculateNextFanTarget(baseTarget, year);
  return { formulaVersion: 2, year, baseTarget, startingFanbase, requiredGain: Math.max(0, targetFanbase - startingFanbase), targetFanbase };
}

export function createFanTargetForYear(year, startingFanbase = FAN_BALANCE.startingFans) {
  let lastFanTarget = FAN_BALANCE.startingFanTarget;
  for (let runningYear = 1; runningYear < year; runningYear += 1) lastFanTarget = calculateNextFanTarget(lastFanTarget, runningYear);
  return createAnnualFanTarget(year, lastFanTarget, startingFanbase);
}

export function getFanGrowthMultiplier(currentFans, yearlyTarget) {
  const ratio = yearlyTarget > 0 ? currentFans / yearlyTarget : 0;
  return FAN_BALANCE.softCap.find((band) => ratio >= band.minRatio && ratio < band.maxRatio)?.multiplier ?? 0.05;
}

export function applyFanSoftCap(baseFanGain, capMultiplier, softCapResistance = 0) {
  if (baseFanGain <= 0) return baseFanGain;
  const resistance = clamp(softCapResistance, 0, 1);
  const effectiveMultiplier = capMultiplier + (1 - capMultiplier) * resistance;
  const generatedFans = Math.round(baseFanGain * (FAN_BALANCE.generationMultiplier ?? 1));
  return Math.round(generatedFans * effectiveMultiplier);
}

export function getFanTargetPerformance(currentFans, yearlyTarget) {
  const ratio = yearlyTarget > 0 ? currentFans / yearlyTarget : 0;
  const band = FAN_BALANCE.annualPerformance.find((item) => ratio >= item.minRatio) ?? FAN_BALANCE.annualPerformance.at(-1);
  return { ...band, ratio, achievementPercent: Math.round(ratio * 10_000) / 100 };
}

function generateTheaterOffers(seed) {
  const rng = createRng(hashSeed(`${seed}:theater-offers`));
  return BALANCE.theaterTiers.map((template) => {
    const price = roundTo(randomInt(rng, template.priceRange[0] / 5_000_000, template.priceRange[1] / 5_000_000) * 5_000_000, 5_000_000);
    const capacity = roundTo(randomInt(rng, template.capacityRange[0] / 10, template.capacityRange[1] / 10) * 10, 10);
    const ticketPrice = roundTo(randomInt(rng, template.ticketRange[0] / 5_000, template.ticketRange[1] / 5_000) * 5_000, 5_000);
    const weeklyUpkeep = roundTo(price * 0.012 + capacity * 8_000, 500_000);
    return { id: template.id, name: template.name, tier: template.tier, price, capacity, ticketPrice, weeklyUpkeep };
  });
}

export function generateConcertVenueOffers(seed, year = 1, extraChoices = 0) {
  const rng = createRng(hashSeed(`${seed}:concert-venues:${year}`));
  const names = ['Civic Hall', 'Harbor Hall', 'Metropolitan Arena', 'City Arena', 'National Arena', 'Grand Stadium'];
  const count = 3 + Math.max(0, extraChoices);
  return Array.from({ length: count }, (_, index) => {
    const scale = index / Math.max(1, count - 1);
    const capacity = roundTo(randomInt(rng, 140 + Math.round(scale * 430), 260 + Math.round(scale * 700)) * 10, 50);
    const cost = roundTo(capacity * randomInt(rng, 24_000, 38_000), 5_000_000);
    return { id: `venue-${year}-${index + 1}`, name: names[Math.min(names.length - 1, index + randomInt(rng, 0, 1))], capacity, cost };
  }).sort((a, b) => a.capacity - b.capacity);
}

export const ROSTER_SCOPES = ['active', 'ex', 'all'];

export function getRosterPool(scope = 'active') {
  const includeActive = scope !== 'ex';
  const includeEx = scope === 'ex' || scope === 'all';
  const identities = Object.entries(memberData).flatMap(([generation, members]) =>
    members
      .filter((member) => member.graduated ? includeEx : includeActive)
      .map((member) => ({ ...member, generation, rosterScope: member.graduated ? 'ex' : 'active' })));
  // Current members lead the pool so founding selection reads chronologically-relevant first and the
  // prebuilt chemistry subset stays a contiguous prefix. Generation order is preserved within a group.
  return [...identities.filter((member) => member.rosterScope === 'active'), ...identities.filter((member) => member.rosterScope === 'ex')];
}

export function getActiveRoster() {
  return getRosterPool('active');
}

export function createGame(seed = `JKT48-${Math.random().toString(36).slice(2, 12).toUpperCase()}`, rosterScope = 'active', hardMode = false) {
  const scope = ROSTER_SCOPES.includes(rosterScope) ? rosterScope : 'active';
  const allNinety = isAllNinetySeed(seed);
  const members = getRosterPool(scope).map((identity) => {
    const identityKey = `${identity.generation}:${identity.name}`;
    const memberId = slug(identityKey);
    // Every card owns its seeded stream. Reordering cards or changing roster scope must not move
    // fictional stats from one member to another.
    const rng = createRng(hashSeed(`${seed}:member:${identityKey}`));
    const archetype = ARCHETYPES[randomInt(rng, 0, ARCHETYPES.length - 1)];
    const stats = makeStats(rng, archetype, hardMode);
    const member = {
      id: memberId,
      identityId: memberId,
      ...identity,
      originalTeam: identity.team,
      // Provenance lives in rosterScope. An ex-member picked into this timeline is an active roster
      // member here, so the identity-level graduated flag must not leak onto the run record.
      graduated: false,
      archetype,
      traits: [TRAITS[randomInt(rng, 0, TRAITS.length - 1)]],
      ...stats,
      ...makeHiddenProfile(rng, archetype),
      popularity: randomInt(rng, 30, 76),
      energy: 100,
      ego: randomInt(rng, 0, 100),
      potential: randomInt(rng, 62, 98),
      development: randomInt(rng, 35, 92),
      fanbase: randomInt(rng, 1800, 12000),
      fanComposition: makeFanComposition(rng),
      oshiSentiment: 0,
      momentum: 0,
      traineeWeeks: 0,
      trainingProgress: 0,
      theaterAppearances: 0,
      status: 'active',
      careerStage: ['Early', 'Established', 'Veteran'][randomInt(rng, 0, 2)],
      joinedYear: 0,
      joinedWeek: 1,
      canPerformTheater: true,
      suspensionWeeks: 0,
      injury: null,
      injuryHistory: [],
      weeksWithoutEvent: 0,
      salary: null,
      appearances: { theater: 0, center: 0, media: 0 },
      setlistFamiliarity: {},
    };
    const seededMember = allNinety ? { ...member, ...ALL_NINETY_STATS } : member;
    return { ...seededMember, ...createBirthday(seed, seededMember.identityId, seededMember.careerStage) };
  });
  return {
    version: 1,
    calendarWeeks: BALANCE.weeksPerYear,
    seed,
    rosterScope: scope,
    hardMode,
    managementName: '',
    rngStep: 1,
    year: 1,
    week: 1,
    money: BALANCE.startingMoney,
    theaterOffers: generateTheaterOffers(seed),
    concertVenueOffers: generateConcertVenueOffers(seed, 1),
    group: { fanbase: FAN_BALANCE.startingFans, popularity: 48, fanTrust: 58, reputation: 52, publicAwareness: 44, fanPools: { coreWota: 2_700, casual: 2_500, generalPublic: 1_400, digital: 2_000, event: 1_400, oshi: 2_300, groupFans: 3_000 }, fanSentiment: { coreWota: 0, casual: 0, generalPublic: 0, digital: 0, event: 0, oshi: 0, groupFans: 0 } },
    fanTarget: createAnnualFanTarget(1, FAN_BALANCE.startingFanTarget, FAN_BALANCE.startingFans),
    fanTargetHistory: [],
    fanTargetMetaReward: 0,
    members,
    schedule: {},
    history: [{ id: 'start', type: 'system', title: 'Alternate timeline begins', detail: `${members.length} members enter the founding pool for Year 1.`, year: 1, week: 1 }],
    notifications: [],
    bonusLoadout: [], bonusLevels: {}, graduationTargets: {},
    singles: [], concerts: [], yearEndMeetGreets: [], auditions: [], auditionCampaign: null, graduations: [], renovations: [], annualReviews: [], scheduleTemplates: [], trainingSchemaVersion: TRAINING_SCHEMA_VERSION, trainingPlans: {}, trainingTemplates: [], injuryHistorySchemaVersion: INJURY_HISTORY_SCHEMA_VERSION, fanNarratives: [], theaterShows: {}, theaterHistory: [],
    // Chemistry is prebuilt for current members only. Ex-member pairs are filled in lazily by
    // ensureChemistry/getMemberChemistry, which are deterministic from the seed, so the full identity
    // pool does not pay for 31k unused pairs up front.
    mentorships: [], mentorshipHistory: [], chemistry: buildChemistry(seed, members.filter((member) => member.rosterScope !== 'ex')), promotions: [], demandHistory: [], opportunityHistory: [], financialEvents: [], pendingOpportunity: null, fanEventPlans: [],
    departures: [], ledger: { pendingUpkeep: 0, pendingOperations: 0, debt: { salary: 0, upkeep: 0, operations: 0 }, unpaidSalaryMonths: 0, settlements: [] }, loans: [], loanOffers: generateLoanOffers(seed, 1), seitansaiObligations: [],
    activeDrama: null,
    activeManagementDrama: null,
    dramaMemory: [],
    dramaCooldown: 0,
    memberDramaCooldown: 0,
    managementDramaCooldown: 0,
    campaign: null,
    firstCampaignYear: 2,
    nextCampaignConfig: null,
    lastCampaignType: null,
    campaignHistory: [],
    failureCounters: { negativeCashWeeks: 0, lowTrustWeeks: 0, lowReputationWeeks: 0, lowFanbaseWeeks: 0 },
    lastResult: null,
    runStatus: 'setup',
    records: { peakFanbase: FAN_BALANCE.startingFans, peakPopularity: 48, peakFanTrust: 58, peakReputation: 52, largestRoster: members.length, lowestEligibleRoster: members.length, theaterShows: 0, dramaSuspensions: 0, singlesReleased: 0, videoCallTickets: 0, meetGreetTickets: 0, moneyEarned: 0, moneySpent: 0, largestConcert: 0, bestConcertOccupancy: 0 },
  };
}

export function getMemberSalary(member, year = 1, hardMode = false) {
  const base = hardMode
    ? (member?.status === 'trainee' ? BALANCE.salary.hardModeTrainee : BALANCE.salary.hardModeRegular)
    : (member?.status === 'trainee' ? BALANCE.salary.trainee : BALANCE.salary.regular);
  return member?.salary ?? Math.round(base * ((1 + BALANCE.salary.annualIncreasePercent / 100) ** Math.max(0, year - 1)));
}

export function getSeitansaiCandidates(state) {
  const currentMonth = Math.ceil(state.week / BALANCE.weeksPerMonth);
  const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const currentAbsoluteWeek = toAbsoluteWeek(state.year, state.week);
  const fulfilledKeys = new Set((state.seitansaiObligations ?? [])
    .filter((obligation) => obligation.status === 'fulfilled')
    .map((obligation) => `${obligation.memberId}:${obligation.year}:${obligation.month}`));
  const recentlyHeldMemberIds = new Set((state.theaterHistory ?? [])
    .filter((show) => {
      const showAbsoluteWeek = toAbsoluteWeek(show.year, show.week);
      return show.isSeitansai && currentAbsoluteWeek - showAbsoluteWeek >= 0 && currentAbsoluteWeek - showAbsoluteWeek <= 8;
    })
    .map((show) => show.seitansaiMemberId));
  const skipPreviousDecember = state.year === 1 && currentMonth === 1;

  return (state.members ?? []).filter((member) => {
    if (!['active', 'trainee'].includes(member.status)) return false;
    const isCurrentBirthday = member.birthMonth === currentMonth;
    const isPreviousBirthday = member.birthMonth === previousMonth && !skipPreviousDecember;
    if (!isCurrentBirthday && !isPreviousBirthday) return false;
    const birthdayYear = currentMonth === 1 && member.birthMonth === 12 ? state.year - 1 : state.year;
    return !fulfilledKeys.has(`${member.id}:${birthdayYear}:${member.birthMonth}`) && !recentlyHeldMemberIds.has(member.id);
  }).map((member) => ({ ...member, isActualBirthday: member.birthMonth === currentMonth }));
}

export function payDebt(state, category, amount = Infinity) {
  if (!state.hardMode || !['salary', 'upkeep', 'operations'].includes(category) || state.runStatus === 'ended') return state;
  const debt = state.ledger?.debt?.[category] ?? 0;
  const payment = Math.min(Math.max(0, amount), debt, Math.max(0, state.money));
  if (!payment) return state;
  const ledger = { ...(state.ledger ?? {}), debt: { ...(state.ledger?.debt ?? {}), [category]: debt - payment } };
  return { ...state, money: state.money - payment, ledger, notifications: [{ type: 'success', text: `${moneyText(payment)} paid toward ${category} debt.` }, ...(state.notifications ?? [])].slice(0, 20) };
}

export function generateLoanOffers(seed, year = 1) {
  const rng = createRng(hashSeed(`${seed}:loan-offers:${year}`));
  return Array.from({ length: BALANCE.loans.offersPerYear }, (_, index) => {
    const principal = randomInt(rng, 80, 180) * 1_000_000;
    const termMonths = BALANCE.loans.termsMonths[index % BALANCE.loans.termsMonths.length];
    const multiplier = BALANCE.loans.repaymentMultipliers[index % BALANCE.loans.repaymentMultipliers.length];
    return { id: `loan-${year}-${index + 1}`, principal, termMonths, repayment: Math.round(principal * multiplier), monthlyPayment: Math.ceil(principal * multiplier / termMonths), title: `${termMonths}-month emergency facility` };
  });
}

export function takeLoan(state, offerId) {
  if (!state.hardMode || state.runStatus === 'ended') return state;
  const offer = (state.loanOffers ?? []).find((item) => item.id === offerId);
  if (!offer || (state.loans ?? []).some((loan) => loan.offerId === offerId)) return state;
  return { ...state, money: state.money + offer.principal, loans: [...(state.loans ?? []), { ...offer, offerId, monthsRemaining: offer.termMonths, balance: offer.repayment }], notifications: [{ type: 'critical', text: `${moneyText(offer.principal)} loan accepted. Monthly payment: ${moneyText(offer.monthlyPayment)}.` }, ...(state.notifications ?? [])].slice(0, 20) };
}

export function finalizeGameSetup(state, theaterId, memberIds, managementName = 'JKT48 Management', bonusLoadout = [], options = {}) {
  const theater = state.theaterOffers?.find((item) => item.id === theaterId);
  const uniqueIds = new Set(memberIds);
  const normalizedManagementName = managementName.trim();
  if (!normalizedManagementName || normalizedManagementName.length > 40) throw new Error('Enter a management name up to 40 characters.');
  if (bonusLoadout.length > BALANCE.bonusSlots || new Set(bonusLoadout).size !== bonusLoadout.length || bonusLoadout.some((id) => !BONUS_BY_ID[id])) throw new Error(`Choose up to ${BALANCE.bonusSlots} unique bonuses.`);
  const selectedBonusLevels = Object.fromEntries(bonusLoadout.map((id) => [id, Math.max(1, normalizeBonusLevel(options.bonusLevels?.[id] ?? 1))]));
  const selectedBonusValue = (id) => bonusLoadout.includes(id) ? getBonusValueAtLevel(BONUS_BY_ID[id], selectedBonusLevels[id]) : 0;
  if (!theater) throw new Error('Choose a theater.');
  if (uniqueIds.size !== BALANCE.foundingRosterSize) throw new Error(`Choose exactly ${BALANCE.foundingRosterSize} founding members.`);
  const purchasePrice = applyRate(theater.price, selectedBonusValue('B001'));
  if (state.money < purchasePrice) throw new Error('Not enough money for this theater.');
  const members = state.members.filter((member) => uniqueIds.has(member.id));
  if (members.length !== BALANCE.foundingRosterSize) throw new Error('Founding lineup contains an unknown member.');
  const unsignedMembers = state.members.filter((member) => !uniqueIds.has(member.id));
  const hardMode = Boolean(options.hardMode ?? state.hardMode);
  return {
    ...state,
    managementName: normalizedManagementName,
    bonusLoadout: [...bonusLoadout],
    bonusLevels: selectedBonusLevels,
    hardMode,
    rosterScope: options.rosterScope ?? state.rosterScope ?? 'active',
    runStatus: 'active',
    money: state.money - purchasePrice,
    theater: { ...theater, price: purchasePrice, weeklyUpkeep: applyRate(theater.weeklyUpkeep, selectedBonusValue('B002')), renovationLevel: 0 },
    concertVenueOffers: generateConcertVenueOffers(state.seed, state.year, selectedBonusValue('B007')),
    members,
    unsignedMembers,
    // Founding members drawn from the ex-member pool have no prebuilt chemistry; fill it in now so the
    // first week resolves against persisted values rather than the lazy fallback.
    chemistry: ensureChemistry(state, members),
    history: [{
      id: 'founding-lineup', type: 'system', title: `${theater.name} opens`,
       detail: `${theater.capacity}-seat home purchased. ${BALANCE.foundingRosterSize} founding members join the active roster.`, year: 1, week: 1,
    }],
  };
}

export function fireMember(state, memberId) {
  if (state.runStatus === 'ended') return state;
  const member = state.members?.find((item) => item.id === memberId);
  const eligibleCount = getTheaterEligibleMembers(state).length;
  if (!member || !['active', 'trainee', 'suspended'].includes(member.status) || (member.status !== 'suspended' && eligibleCount <= BALANCE.theaterMinimumMembers)) return state;
  const severance = state.hardMode ? getMemberSalary(member, state.year, true) : BALANCE.fire.flatSeverance;
  const departure = { id: `fire-${member.id}-${state.year}-${state.week}`, memberId: member.id, member, firedYear: state.year, firedWeek: state.week, returnAbsolute: toAbsoluteWeek(state.year, state.week) + BALANCE.weeksPerYear * 2, status: 'fired' };
  const name = member.nickname || member.name;
  const consequence = applyMemberAbsenceToCommitments(state, memberId, Infinity);
  const prepared = consequence.state;
  const resolvesDrama = state.activeDrama?.memberId === memberId;
  const cooldownRng = resolvesDrama ? createRng(hashSeed(`${state.seed}:drama-response:${state.activeDrama.dramaId ?? 'member'}:${memberId}:fire`)) : null;
  const cooldown = cooldownRng ? randomInt(cooldownRng, ...BALANCE.dramaCooldown) : state.memberDramaCooldown;
  return {
    ...prepared,
    members: prepared.members.filter((item) => item.id !== memberId),
    departures: [...(state.departures ?? []), departure],
    activeDrama: resolvesDrama ? null : state.activeDrama,
    dramaCooldown: resolvesDrama ? cooldown : state.dramaCooldown,
    memberDramaCooldown: resolvesDrama ? cooldown : state.memberDramaCooldown,
    money: prepared.money - severance,
    group: { ...state.group, fanTrust: clamp(state.group.fanTrust + protectNormalTrustLoss(state, -BALANCE.fire.fanTrustPenalty)), reputation: clamp(state.group.reputation - BALANCE.fire.reputationPenalty) },
    notifications: [{ type: 'critical', text: `${name} is released. Severance: ${moneyText(severance)}.` }, ...consequence.notifications.map((text) => ({ type: 'critical', text })), ...(state.notifications ?? [])].slice(0, 20),
    history: [{ id: departure.id, type: 'member', title: `${name} released`, detail: `${name} leaves the roster after a ${moneyText(severance)} severance payment.`, year: state.year, week: state.week }, ...(state.history ?? [])],
  };
}

export function getTraineePromotionStatus(state, memberId) {
  const member = state.members?.find((item) => item.id === memberId);
  if (!member || member.status !== 'trainee') return { eligible: false, memberId, reasons: ['Member is not a trainee.'] };
  const requirements = BALANCE.trainee;
  const traineeWeeks = member.traineeWeeks ?? 0;
  const trainingProgress = member.trainingProgress ?? 0;
  const theaterAppearances = member.theaterAppearances ?? member.appearances?.theater ?? 0;
  const reasons = [];
  if (traineeWeeks < requirements.minimumWeeks) reasons.push(`Needs ${requirements.minimumWeeks - traineeWeeks} more trainee week(s).`);
  if (trainingProgress < requirements.minimumTrainingProgress) reasons.push(`Needs ${requirements.minimumTrainingProgress - trainingProgress} more training progress.`);
  if (theaterAppearances < requirements.minimumTheaterAppearances) reasons.push(`Needs ${requirements.minimumTheaterAppearances - theaterAppearances} more theater appearance(s).`);
  return { eligible: reasons.length === 0, memberId, traineeWeeks, trainingProgress, theaterAppearances, reasons };
}

export function promoteTrainee(state, memberId) {
  if (state.runStatus === 'ended') return state;
  const member = state.members?.find((item) => item.id === memberId);
  const status = getTraineePromotionStatus(state, memberId);
  if (!member || !status.eligible) return state;
  const promotion = { id: `promotion-${member.id}-${state.year}-${state.week}`, memberId: member.id, memberName: member.nickname || member.name, year: state.year, week: state.week };
  const members = state.members.map((item) => item.id === member.id ? { ...item, status: 'active', team: item.team === 'TRAINEE' ? 'JKT48' : item.team, promotedYear: state.year, promotedWeek: state.week } : item);
  return {
    ...state,
    members,
    promotions: [...(state.promotions ?? []), promotion],
    notifications: [{ type: 'success', text: `${promotion.memberName} is promoted to the active roster.` }, ...(state.notifications ?? [])].slice(0, 20),
    history: [{ ...promotion, type: 'member', title: `${promotion.memberName} promoted`, detail: 'Trainee development milestones complete; member joins the active roster.' }, ...(state.history ?? [])],
  };
}

export function startMentorship(state, mentorId, menteeId, durationWeeks = BALANCE.mentorship.durationWeeks) {
  if (state.runStatus === 'ended' || mentorId === menteeId) return state;
  const mentor = state.members?.find((member) => member.id === mentorId);
  const mentee = state.members?.find((member) => member.id === menteeId);
  const activeMentorships = (state.mentorships ?? []).filter((mentorship) => mentorship.status !== 'completed');
  if (!mentor || !mentee || mentor.status !== 'active' || mentee.status !== 'trainee' || (!mentor.graduationPending && mentor.careerStage !== 'Veteran')) return state;
  if (!Number.isInteger(durationWeeks) || durationWeeks < 1 || durationWeeks > BALANCE.weeksPerYear || activeMentorships.some((mentorship) => mentorship.mentorId === mentorId || mentorship.menteeId === menteeId)) return state;
  const startAbsolute = toAbsoluteWeek(state.year, state.week);
  const mentorship = { id: `mentorship-${mentorId}-${menteeId}-${state.year}-${state.week}`, mentorId, menteeId, startYear: state.year, startWeek: state.week, durationWeeks, endAbsolute: startAbsolute + durationWeeks, developmentBonus: BALANCE.mentorship.developmentBonus, status: 'active', chemistry: getMemberChemistry(state, mentorId, menteeId) };
  return { ...state, mentorships: [...(state.mentorships ?? []), mentorship], history: [{ id: mentorship.id, type: 'member', title: `${mentor.nickname || mentor.name} mentors ${mentee.nickname || mentee.name}`, detail: `Mentorship begins for ${durationWeeks} weeks with a ${Math.round(BALANCE.mentorship.developmentBonus * 100)}% development bonus.`, year: state.year, week: state.week }, ...(state.history ?? [])] };
}

function applyAutomaticPromotions(state, members, year, week, history, notifications) {
  const nextState = { ...state, members };
  const promotions = [];
  const nextMembers = members.map((member) => {
    const status = getTraineePromotionStatus(nextState, member.id);
    if (!status.eligible) return member;
    const promotion = { id: `promotion-${member.id}-${year}-${week}`, memberId: member.id, memberName: member.nickname || member.name, year, week };
    promotions.push(promotion);
    notifications.push({ type: 'success', text: `${promotion.memberName} is promoted to the active roster.` });
    history.unshift({ ...promotion, type: 'member', title: `${promotion.memberName} promoted`, detail: 'Trainee development milestones complete; member joins the active roster.' });
    return { ...member, status: 'active', team: member.team === 'TRAINEE' ? 'JKT48' : member.team, promotedYear: year, promotedWeek: week };
  });
  return { members: nextMembers, promotions };
}

export function assignActivity(state, memberId, day, activityId, options = {}) {
  if (state.runStatus === 'ended' || TRAINING_ACTIVITY_SET.has(activityId)) return state;
  const member = state.members.find((item) => item.id === memberId);
  if (!member || (activityId !== 'clear' && !canMemberPerform(member, activityId))) return state;
  const key = `${memberId}:${day}`;
  const schedule = { ...state.schedule };
  const currentActivity = schedule[key];
  // Campaigns can take an ordinary/template slot, but never replace a campaign that claimed it first.
  if (activityId === 'clear') {
    if (isCampaignActivity(currentActivity)) return state;
  } else if (isCampaignActivity(currentActivity) && currentActivity !== activityId) {
    return state;
  }
  const month = Math.ceil(state.week / BALANCE.weeksPerMonth);
  const events = state.activityEvents ?? [];
  const eligibleMembers = state.members.filter((item) => canMemberPerform(item, activityId));
  // Clearing a group booking must reach every member holding it, including anyone an injury now
  // bars from the replacement activity — otherwise their old assignment would be stranded.
  const groupMembers = state.members.filter((item) => ['active', 'trainee'].includes(item.status) && (item.suspensionWeeks ?? 0) === 0);
  if (activityId === 'clear' && (isConcertActivity(currentActivity) || isMeetGreetActivity(currentActivity))) {
    groupMembers.forEach((item) => { if (schedule[`${item.id}:${day}`] === currentActivity) delete schedule[`${item.id}:${day}`]; });
    return { ...state, schedule };
  }
  if (currentActivity && (isConcertActivity(currentActivity) || isMeetGreetActivity(currentActivity)) && activityId !== currentActivity) {
    groupMembers.forEach((item) => { if (schedule[`${item.id}:${day}`] === currentActivity) delete schedule[`${item.id}:${day}`]; });
  }
  if (isConcertActivity(activityId) || isMeetGreetActivity(activityId)) {
    const type = isConcertActivity(activityId) ? 'concert' : 'meetGreet';
    const alreadyResolved = events.some((event) => event.type === type && event.year === state.year && event.month === month);
    const alreadyScheduled = Object.values(schedule).some((value) => type === 'concert' ? isConcertActivity(value) : isMeetGreetActivity(value));
    const campaignLock = groupMembers.some((item) => isCampaignActivity(schedule[`${item.id}:${day}`]));
    if (alreadyResolved || alreadyScheduled || campaignLock) return state;
    // Group campaign claims every available member slot that is not already campaign-locked.
    eligibleMembers.forEach((item) => {
      const memberKey = `${item.id}:${day}`;
      if (!isCampaignActivity(schedule[memberKey])) schedule[memberKey] = activityId;
    });
    return { ...state, schedule };
  }
  if (activityId.startsWith('vc')) {
    const resolvedThisMonth = events.some((event) => event.type === 'videoCall' && event.memberId === memberId && event.year === state.year && event.month === month);
    const scheduledVideoCall = schedule[key]?.startsWith?.('vc');
    const hasVideoCallThisWeek = Object.entries(schedule).some(([k, v]) => k.startsWith(`${memberId}:`) && v?.startsWith?.('vc') && k !== key);
    const plannedThisMonth = (state.fanEventPlans ?? []).some((plan) => plan.type === 'videoCall' && plan.memberIds.includes(memberId) && plan.year === state.year && Math.ceil(plan.targetWeek / BALANCE.weeksPerMonth) === month);
    if (resolvedThisMonth || scheduledVideoCall || hasVideoCallThisWeek || plannedThisMonth) return state;
  }
  if (activityId === 'theater' && schedule[key] !== 'theater') {
    const lineupSize = state.members.reduce((count, item) => count + (schedule[`${item.id}:${day}`] === 'theater' ? 1 : 0), 0);
    if (lineupSize >= 12) return state;
  }
  if (activityId === 'offAir' && schedule[key] !== 'offAir') {
    const lineupSize = state.members.reduce((count, item) => count + (schedule[`${item.id}:${day}`] === 'offAir' ? 1 : 0), 0);
    if (lineupSize >= BALANCE.activities.offAir.requiredMembers) return state;
    // One off-air show per week: block a second day once another already has anyone assigned.
    const otherOffAirDays = DAYS.filter((otherDay) => otherDay !== day && state.members.some((item) => schedule[`${item.id}:${otherDay}`] === 'offAir'));
    if (otherOffAirDays.length >= BALANCE.activities.offAir.maxPerWeek) return state;
  }
  if (activityId === 'clear') delete schedule[key];
  else schedule[key] = activityId;
  return { ...state, schedule };
}

export function scheduleFanCampaign(state, type, day, memberIds = [], targetWeek = state.week) {
  if (state.runStatus === 'ended' || !DAYS.includes(day) || !['videoCall', 'meetGreet'].includes(type)) return state;
  if (!Number.isInteger(targetWeek) || targetWeek < state.week || targetWeek > BALANCE.weeksPerYear) return state;
  const conflictReasons = getCampaignConflictReasons(state, { year: state.year, week: targetWeek, type, day, memberIds });
  if (conflictReasons.length) return conflictNotification(state, conflictReasons);
  const activityId = type === 'videoCall' ? 'vc1' : 'mg1';
  const eligibleIds = getSchedulableMembers(state, activityId).map((member) => member.id);
  if (!eligibleIds.length) return state;
  if (type === 'videoCall') {
    const requestedIds = [...new Set(memberIds)].filter((memberId) => eligibleIds.includes(memberId));
    const targetMonth = Math.ceil(targetWeek / BALANCE.weeksPerMonth);
    const hasExistingMemberEvent = requestedIds.some((memberId) => (
      (state.activityEvents ?? []).some((event) => event.type === 'videoCall' && event.memberId === memberId && event.year === state.year && event.month === targetMonth)
      || Object.entries(state.schedule ?? {}).some(([key, activity]) => key.startsWith(`${memberId}:`) && activity?.startsWith?.('vc'))
      || (state.fanEventPlans ?? []).some((plan) => plan.type === 'videoCall' && plan.year === state.year && plan.memberIds.includes(memberId) && Math.ceil(plan.targetWeek / BALANCE.weeksPerMonth) === targetMonth)
    ));
    if (hasExistingMemberEvent) return conflictNotification(state, ['Video Call already scheduled for one of the selected members in this period.']);
  }
  if (targetWeek > state.week) {
    const selectedIds = type === 'meetGreet' ? eligibleIds : [...new Set(memberIds)].filter((id) => eligibleIds.includes(id));
    const sameDayPlanExists = (state.fanEventPlans ?? []).some((plan) => plan.year === state.year && plan.targetWeek === targetWeek && plan.day === day && plan.type === type);
    if (!selectedIds.length) return state;
    if (sameDayPlanExists) return conflictNotification(state, [`${type === 'videoCall' ? 'Video Call' : 'Meet & Greet'} already occupies the requested day.`]);
    if (type === 'meetGreet' && (state.fanEventPlans ?? []).some((plan) => plan.year === state.year && plan.targetWeek === targetWeek && plan.type === type)) return conflictNotification(state, ['Meet & Greet already occupies the requested week.']);
    if (type === 'videoCall') {
      const targetMonth = Math.ceil(targetWeek / BALANCE.weeksPerMonth);
      const currentMonth = Math.ceil(state.week / BALANCE.weeksPerMonth);
      const hasExisting = selectedIds.some((memberId) => {
        const resolved = (state.activityEvents ?? []).some((event) => event.type === 'videoCall' && event.memberId === memberId && event.year === state.year && event.month === targetMonth);
        const planned = (state.fanEventPlans ?? []).some((plan) => plan.type === 'videoCall' && plan.memberIds.includes(memberId) && Math.ceil(plan.targetWeek / BALANCE.weeksPerMonth) === targetMonth && !(plan.targetWeek === targetWeek && plan.day !== day));
        const scheduled = currentMonth === targetMonth && Object.entries(state.schedule).some(([key, value]) => {
          const [id] = key.split(':');
          return value.startsWith('vc') && id === memberId && key === `${memberId}:${day}`;
        });
        const plannedSameWeek = (state.fanEventPlans ?? []).some((plan) => plan.type === 'videoCall' && plan.memberIds.includes(memberId) && plan.year === state.year && plan.targetWeek === targetWeek);
        return resolved || planned || scheduled || plannedSameWeek;
      });
      if (hasExisting) return conflictNotification(state, ['Video Call already scheduled for one of the selected members in this period.']);
    }
    return { ...state, fanEventPlans: [...(state.fanEventPlans ?? []), { id: `fan-event-${type}-${state.year}-${targetWeek}-${day}`, type, day, memberIds: selectedIds, year: state.year, targetWeek, status: 'announced' }] };
  }
  if (type === 'meetGreet') {
    const hasCampaignLock = eligibleIds.some((memberId) => isCampaignActivity(state.schedule[`${memberId}:${day}`]));
    return hasCampaignLock ? state : assignActivity(state, eligibleIds[0], day, activityId, { source: 'campaign' });
  }
  const requestedIds = [...new Set(memberIds)].filter((memberId) => eligibleIds.includes(memberId));
  if (!requestedIds.length) return state;
  return requestedIds.reduce((next, memberId) => assignActivity(next, memberId, day, activityId, { source: 'campaign' }), state);
}

export function configureMajorCampaign(state, options = {}) {
  if (state.runStatus === 'ended') return state;
  return configureNextCampaign(state, options);
}

export function getNextMajorCampaignType(state) {
  return nextCampaignType(state);
}

export function startMajorCampaign(state, options = {}) {
  if (state.runStatus === 'ended') return state;
  return startCampaign(state, { ...options, members: state.members });
}

export function configureTheaterShow(state, day, setlistId, centerId) {
  if (state.runStatus === 'ended' || !DAYS.includes(day) || !SETLIST_BY_ID[setlistId]) return state;
  const lineupIds = state.members.filter((member) => state.schedule[`${member.id}:${day}`] === 'theater').map((member) => member.id);
  if (!lineupIds.includes(centerId)) return state;
  return {
    ...state,
    theaterShows: {
      ...(state.theaterShows ?? {}),
      [day]: { setlistId, centerId },
    },
  };
}

export function getTheaterRenovationOffer(state) {
  if (!state.theater) return null;
  const level = state.theater.renovationLevel ?? 0;
  const rng = createRng(hashSeed(`${state.seed}:renovation:${state.year}:${level}`));
  const costRate = randomInt(rng, 22, 35) / 100;
  const ticketRate = randomInt(rng, 8, 15) / 100;
  const upkeepRate = randomInt(rng, 12, 20) / 100;
  return {
    cost: applyRate(roundTo(state.theater.price * costRate + level * 15_000_000, 5_000_000), bonusValue(state, 'B003')),
    currentTicketPrice: state.theater.ticketPrice,
    ticketPrice: roundTo(state.theater.ticketPrice * (1 + ticketRate), 5_000),
    currentWeeklyUpkeep: state.theater.weeklyUpkeep,
    weeklyUpkeep: roundTo(state.theater.weeklyUpkeep * (1 + upkeepRate), 500_000),
    level: level + 1,
  };
}

export function startSingleProduction(state, centerId, productionDay, selectedMemberIds = null, releaseYear = null, releaseMonth = null, requestedTitle = '', budgetId = 'medium') {
  const budget = SINGLE_BUDGETS.find((option) => option.id === budgetId);
  const productionCost = applyRate(budget?.cost ?? 0, bonusValue(state, 'B005'));
  if (!budget || state.runStatus === 'ended' || state.money < productionCost || state.singles.some((single) => single.status !== 'released')) return state;
  if (!DAYS.includes(productionDay)) return state;
  const eligible = getSchedulableMembers(state, 'mvProduction');
  const center = eligible.find((member) => member.id === centerId);
  if (!center || eligible.length < 12) return state;
  const score = (member) => member.vocal + member.dance + member.performance + member.mc + member.variety;
  const automaticIds = [center, ...eligible.filter((member) => member.id !== centerId).sort((a, b) => score(b) - score(a))].slice(0, 12).map((member) => member.id);
  const requestedIds = eligible.length === 12 ? automaticIds : selectedMemberIds ? [centerId, ...selectedMemberIds.filter((memberId) => memberId !== centerId)] : automaticIds;
  const memberIds = [...new Set(requestedIds)];
  if (memberIds.length !== 12 || memberIds.some((memberId) => !eligible.some((member) => member.id === memberId))) return state;
  const scheduledRelease = Number.isInteger(releaseYear) && Number.isInteger(releaseMonth);
  const releaseWeek = scheduledRelease ? releaseMonth * BALANCE.weeksPerMonth : null;
  const releaseAbsolute = scheduledRelease ? toAbsoluteWeek(releaseYear, releaseWeek) : null;
  const productionStartAbsolute = scheduledRelease ? releaseAbsolute - 5 : toAbsoluteWeek(state.year, state.week);
  const currentAbsolute = toAbsoluteWeek(state.year, state.week);
  if (scheduledRelease && (releaseMonth < 1 || releaseMonth > 12 || productionStartAbsolute < currentAbsolute)) return state;
  const startsNow = productionStartAbsolute === currentAbsolute;
  if (startsNow && memberIds.some((memberId) => state.schedule[`${memberId}:${productionDay}`])) return conflictNotification(state, ['MV production cannot use an occupied member and day.']);
  const productionConflictReasons = [...new Set(
    Array.from({ length: 4 }, (_, offset) => fromAbsoluteWeek(productionStartAbsolute + offset))
      .flatMap(({ year, week }) => getCampaignConflictReasons(state, { year, week, type: 'mv', day: productionDay, memberIds })),
  )];
  if (productionConflictReasons.length) return conflictNotification(state, productionConflictReasons);
  const schedule = { ...state.schedule };
  if (startsNow) memberIds.forEach((memberId) => { schedule[`${memberId}:${productionDay}`] = 'mvProduction'; });
  const productionStart = fromAbsoluteWeek(productionStartAbsolute);
  const customTitle = requestedTitle.trim();
  if (customTitle.length > 60) return state;
  const lineup = memberIds.map((memberId) => eligible.find((member) => member.id === memberId));
  const lineupQuality = lineup.reduce((sum, member) => sum + (member.vocal + member.dance + member.performance) / 3, 0) / lineup.length;
  const qualityFloorBonus = bonusValue(state, 'B029');
  const qualityRng = createRng(hashSeed(`${state.seed}:mv-quality:${state.year}:${state.singles.length + 1}`));
  const qualityRoll = randomInt(qualityRng, -10 + qualityFloorBonus, 10);
  const productionQuality = clamp(Math.round(lineupQuality * 0.45 + budget.quality * 0.55 + qualityRoll));
  const single = { id: `single-${state.year}-${state.singles.length + 1}`, title: customTitle || `Single ${state.singles.length + 1}`, centerId, memberIds, productionDay, budgetId: budget.id, budgetName: budget.name, productionCost, productionQuality, qualityRoll, qualityFloorBonus, popularityGain: budget.popularityGain, fanTrustGain: budget.fanTrustGain, week: state.week, year: state.year, status: startsNow ? 'production' : 'planned', progressWeeks: 0, durationWeeks: 4, ...(scheduledRelease ? { releaseYear, releaseMonth, releaseWeek, productionStartYear: productionStart.year, productionStartWeek: productionStart.week } : {}) };
  return { ...state, money: state.money - productionCost, schedule, singles: [...state.singles, single], history: [{ id: `${single.id}-production`, type: 'single', title: scheduledRelease ? `${single.title} announced` : `${single.title} enters production`, detail: scheduledRelease ? `${center.nickname || center.name} leads a 12-member MV lineup with a ${budget.name.toLowerCase()}. Production starts Year ${productionStart.year}, Week ${productionStart.week}; release is Year ${single.releaseYear}, Week ${single.releaseWeek}.` : `${center.nickname || center.name} leads a 12-member MV lineup every ${productionDay} with a ${budget.name.toLowerCase()}. Production will take four weeks.`, year: state.year, week: state.week }, ...state.history] };
}

export function announceConcert(state, concertDay, targetYear, targetMonth, requestedTitle = '', budgetId = 'lean', venueId = 'hall', targetWeekOverride = null) {
  const budget = CONCERT_BUDGETS.find((option) => option.id === budgetId);
  const venue = [...(state.concertVenueOffers ?? []), ...CONCERT_VENUES].find((option) => option.id === venueId);
  const productionCost = applyRate(budget?.cost ?? 0, bonusValue(state, 'B006'));
  const venueCost = applyRate(venue?.cost ?? 0, bonusValue(state, 'B008'));
  const upfrontCost = productionCost + venueCost;
  if (!budget || !venue || state.runStatus === 'ended' || state.money < upfrontCost || !DAYS.includes(concertDay) || targetMonth < 1 || targetMonth > 12) return state;
  const targetWeek = Number.isInteger(targetWeekOverride) ? targetWeekOverride : targetMonth * BALANCE.weeksPerMonth;
  if (targetWeek < 1 || targetWeek > BALANCE.weeksPerYear) return state;
  const targetAbsolute = toAbsoluteWeek(targetYear, targetWeek);
  const currentAbsolute = toAbsoluteWeek(state.year, state.week);
  if (targetAbsolute - currentAbsolute < 2 || state.concerts.some((concert) => concert.targetYear === targetYear && concert.targetMonth === targetMonth)) return state;
  const conflictReasons = getCampaignConflictReasons(state, { year: targetYear, week: targetWeek, type: 'concert', day: concertDay });
  if (conflictReasons.length) return conflictNotification(state, conflictReasons);
  const memberIds = state.members.filter((member) => ['active', 'trainee'].includes(member.status) && (member.suspensionWeeks ?? 0) === 0).map((member) => member.id);
  if (memberIds.length < BALANCE.theaterMinimumMembers) return state;
  const salesMultiplier = 1 + bonusValue(state, 'B028');
  const demand = Math.round(state.group.fanbase * (state.group.popularity / 100) * 0.045 * budget.demandMultiplier * salesMultiplier);
  const capacity = venue.capacity;
  const projectedSold = Math.min(capacity, Math.round(demand * 0.9));
  const saleCloseAbsolute = targetAbsolute - 2;
  const customTitle = requestedTitle.trim();
  if (customTitle.length > 60) return state;
  const concert = { id: `concert-${targetYear}-${targetMonth}-${state.concerts.length + 1}`, title: customTitle || `Concert ${state.concerts.length + 1}`, budgetId, budgetName: budget.name, productionCost, venueId, venueName: venue.name, venueCost, upfrontCost, targetYear, targetMonth, targetWeek, day: concertDay, announcementYear: state.year, announcementWeek: state.week, status: 'selling', capacity, projectedDemand: demand, projectedSold, sold: 0, revenue: 0, ticketPrice: 450_000, saleCloseAbsolute, salesWeeks: saleCloseAbsolute - currentAbsolute + 1, memberIds };
  const targetWeekOfMonth = ((targetWeek - 1) % BALANCE.weeksPerMonth) + 1;
  return { ...state, money: state.money - upfrontCost, concerts: [...state.concerts, concert], history: [{ id: concert.id, type: 'concert', title: `${concert.title} announced`, detail: `${venue.name} · ${capacity.toLocaleString()} seats · ${budget.name} · Year ${targetYear}, Month ${targetMonth}, Week ${targetWeekOfMonth} on ${concertDay}.`, year: state.year, week: state.week }, ...state.history] };
}

export function scheduleYearEndMeetGreet(state, targetWeek, day, salesStartWeek, sessionCounts = {}) {
  if (state.runStatus === 'ended' || state.week < 25 || targetWeek < 37 || targetWeek > 44 || targetWeek <= state.week || salesStartWeek < state.week || salesStartWeek >= targetWeek || !DAYS.includes(day)) return state;
  if ((state.yearEndMeetGreets ?? []).some((event) => event.year === state.year)) return state;
  const conflictReasons = getCampaignConflictReasons(state, { year: state.year, week: targetWeek, type: 'yearEndMeetGreet', day });
  if (conflictReasons.length) return conflictNotification(state, conflictReasons);
  const cost = 40_000_000;
  if (state.money < cost) return state;
  const eligible = state.members.filter((member) => ['active', 'trainee'].includes(member.status) && (member.suspensionWeeks ?? 0) === 0);
  if (eligible.length < BALANCE.theaterMinimumMembers) return state;
  const normalMeetGreet = BALANCE.activities.mg1;
  const memberSessions = eligible.map((member) => ({ memberId: member.id, sessions: 1, capacity: normalMeetGreet.capacity, sold: 0 }));
  const event = { id: `year-end-mg-${state.year}`, eventType: 'yearEndMeetGreet', year: state.year, targetWeek, day, announcementWeek: state.week, salesStartWeek, status: salesStartWeek === state.week ? 'selling' : 'announced', ticketPrice: normalMeetGreet.ticket, memberSessions, revenue: 0, cost };
  return { ...state, money: state.money - cost, yearEndMeetGreets: [...(state.yearEndMeetGreets ?? []), event], history: [{ id: event.id, type: 'meetGreet', title: 'Year-end Meet & Greet announced', detail: `Sales begin Week ${salesStartWeek}; event is Week ${targetWeek} on ${day}.`, year: state.year, week: state.week }, ...state.history] };
}

export function announceAnniversaryConcert(state, targetWeek, concertDay, requestedTitle = '', budgetId = 'standard', venueId = null, rehearsalDays = ['Tue', 'Thu']) {
  if (state.week < 25 || targetWeek < 45 || targetWeek > 48 || targetWeek - state.week < 2 || rehearsalDays.some((day) => !DAYS.includes(day) || day === concertDay) || new Set(rehearsalDays).size !== rehearsalDays.length) return state;
  const conflictReasons = getCampaignConflictReasons(state, { year: state.year, week: targetWeek, type: 'concert', days: [concertDay, ...rehearsalDays] });
  if (conflictReasons.length) return conflictNotification(state, conflictReasons);
  if (state.concerts.some((concert) => concert.eventType === 'anniversary' && concert.targetYear === state.year)) return state;
  const chosenVenueId = venueId ?? state.concertVenueOffers?.[0]?.id ?? CONCERT_VENUES[0].id;
  const announced = announceConcert(state, concertDay, state.year, 12, requestedTitle || `JKT48 Anniversary ${state.year}`, budgetId, chosenVenueId, targetWeek);
  if (announced === state) return state;
  const createdId = announced.concerts.at(-1).id;
  const targetAbsolute = toAbsoluteWeek(state.year, targetWeek);
  const currentAbsolute = toAbsoluteWeek(state.year, state.week);
  return { ...announced, concerts: announced.concerts.map((concert) => concert.id === createdId ? { ...concert, eventType: 'anniversary', targetWeek, targetMonth: 12, rehearsalDays, saleCloseAbsolute: targetAbsolute - 2, salesWeeks: targetAbsolute - currentAbsolute - 1 } : concert) };
}

export function applyScheduleTemplate(state, template) {
  if (!template?.entries?.length || state.runStatus === 'ended') return state;
  let next = state;
  let skipped = 0;
  for (const entry of template.entries) {
    const member = next.members.find((item) => item.id === entry.memberId);
    const key = `${entry.memberId}:${entry.day}`;
    if (!member || TRAINING_ACTIVITY_SET.has(entry.activityId) || !canMemberPerform(member, entry.activityId) || BALANCE.activities[entry.activityId]?.schedulable === false || isCampaignActivity(next.schedule[key])) { skipped += 1; continue; }
    const before = next;
    next = assignActivity(next, entry.memberId, entry.day, entry.activityId);
    if (next === before && next.schedule[`${entry.memberId}:${entry.day}`] !== entry.activityId) skipped += 1;
  }
  const notification = skipped ? { type: 'critical', text: `${skipped} template assignment(s) skipped because members or dates were unavailable.` } : { type: 'success', text: `${template.name} assigned successfully.` };
  return { ...next, notifications: [notification, ...(next.notifications ?? [])].slice(0, 20) };
}

function createConcertSummary(rng, members, day, concert = null, state = null) {
  const pool = dreamSetlistSongs.filter(({ title }) => !/JKT48[_ ]?V|virtual/i.test(title));
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(rng, 0, index);
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  const songCount = randomInt(rng, 35, 40);
  const songs = pool.slice(0, songCount).map((song, index) => {
    const memberFeature = index % 5 === 2 || index % 7 === 4;
    if (!memberFeature) return { songId: song.id, title: song.title, performerType: 'team', performerNames: [] };
    const performerCount = randomInt(rng, 1, Math.min(3, members.length));
    const start = randomInt(rng, 0, Math.max(0, members.length - 1));
    const performerNames = Array.from({ length: performerCount }, (_, offset) => members[(start + offset) % members.length].nickname || members[(start + offset) % members.length].name);
    return { songId: song.id, title: song.title, performerType: 'members', performerNames };
  });
  const occupancy = concert?.capacity ? concert.sold / concert.capacity : 0;
  const chemistryBonus = state ? (chemistryScore(state, members.map((member) => member.id), 'performance') - 50) * 0.08 : 0;
  const memberPerformance = clamp(Math.round(members.reduce((sum, member) => sum + (member.vocal + member.dance + member.performance) / 3 * (member.traits.includes('Big Stage Performer') ? 1.1 : 1), 0) / Math.max(1, members.length) + chemistryBonus + randomInt(rng, -5, 5)));
  const budget = CONCERT_BUDGETS.find((option) => option.id === concert?.budgetId) ?? CONCERT_BUDGETS[0];
  const productionQuality = clamp(budget.quality + randomInt(rng, -5, 5));
  const setlistReception = clamp(Math.round(68 + songCount * 0.4 + randomInt(rng, -7, 7)));
  const demandRatio = concert?.capacity ? (concert.projectedDemand ?? concert.projectedSold ?? 0) / concert.capacity : 1;
  const fanExpectation = clamp(Math.round(100 - Math.abs(1 - Math.min(2, demandRatio)) * 55));
  const managementEfficiency = clamp(Math.round(occupancy * 72 + fanExpectation * 0.28));
  const overall = clamp(Math.round(occupancy * 25 + memberPerformance * 0.2 + productionQuality * 0.2 + setlistReception * 0.15 + fanExpectation * 0.1 + managementEfficiency * 0.1));
  const popularityDelta = overall >= 85 ? 5 : overall >= 70 ? 3 : overall >= 55 ? 1 : -2;
  const fanTrustDelta = occupancy >= 0.85 && fanExpectation >= 65 ? 4 : occupancy < 0.45 || fanExpectation < 35 ? -6 : occupancy < 0.65 ? -2 : 1;
  const reputationDelta = overall >= 80 ? 3 : overall >= 65 ? 1 : overall < 50 ? -3 : 0;
  return { title: concert?.title ?? 'Concert', day, songCount, songs, evaluation: { attendance: concert?.sold ?? members.length, capacity: concert?.capacity ?? members.length, occupancy: Math.round(occupancy * 1000) / 10, memberPerformance, productionQuality, setlistReception, fanExpectation, managementEfficiency, overall, popularityDelta, fanTrustDelta, reputationDelta, revenue: concert?.revenue ?? 0, profit: (concert?.revenue ?? 0) - (concert?.upfrontCost ?? 0) } };
}

function mvViewGain(single, group, viewWeek) {
  const qualityMultiplier = Number.isFinite(single.productionQuality) ? 0.7 + single.productionQuality / 250 : 1;
  const launchViews = single.launchViews ?? Math.max(1, Math.round(group.fanbase * (0.12 + group.publicAwareness / 500) * qualityMultiplier));
  if (viewWeek === 1) return { gain: launchViews, launchViews };
  if (viewWeek === 2) return { gain: Math.round(launchViews * 0.55), launchViews };
  if (viewWeek === 3) return { gain: Math.round(launchViews * 0.25), launchViews };
  const longTailCap = Math.max(1, Math.round((group.fanbase / 5) * 0.01));
  return { gain: Math.min(longTailCap, Math.max(1, Math.round(longTailCap * (0.85 ** (viewWeek - 4))))), launchViews };
}

const activeCampaignMembers = (members = []) => members.filter((member) => ['active', 'trainee'].includes(member.status) && (member.suspensionWeeks ?? 0) === 0 && !member.temporarilyUnavailable);

function campaignRewardMemberIds(campaign, members) {
  const eligible = activeCampaignMembers(members);
  const byId = new Set(eligible.map((member) => member.id));
  const result = campaign.result ?? {};
  if (campaign.type === 'sousenkyo') {
    return [...new Set((result.senbatsu ?? []).filter((memberId) => byId.has(memberId)))].slice(0, 12);
  }
  if (campaign.type === 'request-hour') {
    const count = eligible.length >= 40 ? 40 : eligible.length >= 30 ? 30 : eligible.length;
    return [...eligible].sort((first, second) => (second.popularity ?? 0) - (first.popularity ?? 0) || (second.performance ?? 0) - (first.performance ?? 0)).slice(0, count).map((member) => member.id);
  }
  const winner = result.winnerMemberId;
  return [winner, ...eligible.sort((first, second) => (second.performance ?? 0) - (first.performance ?? 0)).map((member) => member.id)].filter((memberId, index, ids) => memberId && byId.has(memberId) && ids.indexOf(memberId) === index).slice(0, 12);
}

function productionBusyOnDay(single, absolute, day) {
  if (single.productionDay !== day || single.status === 'released') return false;
  if (single.productionStartYear && single.productionStartWeek) {
    const start = toAbsoluteWeek(single.productionStartYear, single.productionStartWeek);
    return absolute >= start && absolute < start + (single.durationWeeks ?? 4);
  }
  return single.status === 'production';
}

function campaignConcertTarget({ state, campaign, concerts, yearEndMeetGreets, singles }) {
  const now = toAbsoluteWeek(state.year, state.week);
  const preferredDay = campaign.concertDay ?? CAMPAIGN_DEFAULT_CONCERT_DAY;
  const dayOrder = [preferredDay, ...DAYS.filter((day) => day !== preferredDay)];
  for (let offset = 2; offset <= BALANCE.weeksPerYear * 2; offset += 1) {
    const absolute = now + offset;
    const calendar = fromAbsoluteWeek(absolute);
    if (calendar.week % BALANCE.weeksPerMonth !== 0) continue;
    const occupiedEvent = concerts.some((concert) => toAbsoluteWeek(concert.targetYear, concert.targetWeek) === absolute)
      || (yearEndMeetGreets ?? []).some((event) => toAbsoluteWeek(event.year, event.targetWeek) === absolute);
    if (occupiedEvent) continue;
    const day = dayOrder.find((candidate) => !singles.some((single) => productionBusyOnDay(single, absolute, candidate)));
    if (day) return { ...calendar, absolute, day };
  }
  return null;
}

function campaignRewardConcert({ state, campaign, members, concerts, yearEndMeetGreets, singles, availableMoney }) {
  if (!campaign || campaign.status !== 'concert-pending' || campaign.rewardConcertId) return { campaign, concert: null, upfrontCost: 0 };
  const budget = CONCERT_BUDGETS.find((option) => option.id === campaign.concertBudgetId) ?? CONCERT_BUDGETS.find((option) => option.id === 'standard') ?? CONCERT_BUDGETS[0];
  const venue = [...(state.concertVenueOffers ?? []), ...CONCERT_VENUES].find((option) => option.id === campaign.concertVenueId) ?? CONCERT_VENUES[0];
  const target = campaignConcertTarget({ state, campaign, concerts, yearEndMeetGreets, singles });
  const performerIds = campaignRewardMemberIds(campaign, members);
  if (!target || performerIds.length < 1) return { campaign, concert: null, upfrontCost: 0 };
  const productionCost = applyRate(budget.cost, bonusValue(state, 'B006'));
  const venueCost = applyRate(venue.cost, bonusValue(state, 'B008'));
  const upfrontCost = productionCost + venueCost;
  if ((availableMoney ?? state.money) < upfrontCost) return { campaign: { ...campaign, rewardConcertStatus: 'budget-pending', rewardConcertMemberIds: performerIds, rewardConcertPerformerCount: performerIds.length }, concert: null, upfrontCost };
  const salesMultiplier = 1 + bonusValue(state, 'B028');
  const demand = Math.round(state.group.fanbase * (state.group.popularity / 100) * 0.045 * budget.demandMultiplier * salesMultiplier);
  const capacity = venue.capacity;
  const projectedSold = Math.min(capacity, Math.round(demand * 0.9));
  const rewardConcertId = `campaign-concert-${campaign.id}`;
  const concert = { id: rewardConcertId, title: `${campaign.type === 'sousenkyo' ? 'Sousenkyo' : campaign.type === 'request-hour' ? 'Request Hour' : 'Janken'} result concert`, eventType: 'campaign-reward', campaignId: campaign.id, campaignType: campaign.type, campaignReward: true, budgetId: budget.id, budgetName: budget.name, productionCost, venueId: venue.id, venueName: venue.name, venueCost, upfrontCost, targetYear: target.year, targetMonth: Math.ceil(target.week / BALANCE.weeksPerMonth), targetWeek: target.week, day: target.day, announcementYear: state.year, announcementWeek: state.week, status: 'selling', capacity, projectedDemand: demand, projectedSold, sold: 0, revenue: 0, ticketPrice: 450_000, saleCloseAbsolute: target.absolute - 2, salesWeeks: Math.max(1, target.absolute - toAbsoluteWeek(state.year, state.week) - 1), memberIds: performerIds, rewardSongId: campaign.rewardSongId };
  return { campaign: { ...campaign, status: 'concert-scheduled', rewardConcertId, rewardConcertStatus: 'scheduled', rewardConcertYear: target.year, rewardConcertWeek: target.week, rewardConcertMemberIds: performerIds, rewardConcertPerformerCount: performerIds.length }, concert, upfrontCost };
}

function campaignMvProductionDay({ state, campaign, concerts, yearEndMeetGreets, singles }) {
  const now = toAbsoluteWeek(state.year, state.week);
  const productionDays = DAYS.filter((day) => !state.schedule || state.members.every((member) => !['concert', 'concertRehearsal', 'mg1', 'yearEndMeetGreet'].includes(state.schedule[`${member.id}:${day}`])));
  const candidates = productionDays.length ? productionDays : DAYS;
  return candidates.find((day) => {
    for (let offset = 1; offset <= (campaign.mvProductionDurationWeeks ?? 4); offset += 1) {
      const absolute = now + offset;
      if (concerts.some((concert) => toAbsoluteWeek(concert.targetYear, concert.targetWeek) === absolute && concert.day === day) || (yearEndMeetGreets ?? []).some((event) => toAbsoluteWeek(event.year, event.targetWeek) === absolute && event.day === day)) return false;
      if (singles.some((single) => productionBusyOnDay(single, absolute, day))) return false;
    }
    return true;
  }) ?? DAYS[0];
}

export function renovateTheater(state) {
  if (state.runStatus === 'ended') return state;
  const renovations = state.renovations ?? [];
  if (state.week !== BALANCE.weeksPerYear || renovations.some((item) => item.year === state.year)) return state;
  const offer = getTheaterRenovationOffer(state);
  if (!offer || state.money < offer.cost) return state;
  return {
    ...state,
    money: state.money - offer.cost,
    theater: { ...state.theater, ticketPrice: offer.ticketPrice, weeklyUpkeep: offer.weeklyUpkeep, renovationLevel: offer.level },
    renovations: [...renovations, { year: state.year, week: state.week, ...offer }],
    notifications: [{ type: 'success', text: `${state.theater.name} renovation complete. Ticket price and upkeep increased.` }, ...state.notifications],
    history: [{ id: `renovation-${state.year}`, type: 'system', title: `${state.theater.name} renovated`, detail: `${moneyText(offer.cost)} invested. Tickets now ${moneyText(offer.ticketPrice)}; weekly upkeep ${moneyText(offer.weeklyUpkeep)}.`, year: state.year, week: state.week }, ...state.history],
  };
}

export function respondToOpportunity(state, accept) {
  const offer = state.pendingOpportunity;
  if (!offer || state.runStatus === 'ended') return state;
  let opportunityHistory = [...(state.opportunityHistory ?? []), { ...offer, accepted: Boolean(accept), resolvedYear: state.year, resolvedWeek: state.week }];
  if (!accept) return { ...state, pendingOpportunity: null, opportunityHistory, notifications: [{ type: 'critical', text: `${offer.title} declined.` }, ...(state.notifications ?? [])].slice(0, 20) };
  const revenueRate = offer.category === 'sponsor' ? bonusValue(state, 'B009') : offer.category === 'media' ? bonusValue(state, 'B010') : 0;
  const revenue = Math.round(applyRate(offer.revenue, revenueRate));
  const capMultiplier = getFanGrowthMultiplier(state.group.fanbase, state.fanTarget?.targetFanbase ?? Infinity);
  const resistance = offer.category === 'live' ? FAN_BALANCE.activityResistance.concert : FAN_BALANCE.activityResistance.media;
  const fansGained = applyFanSoftCap(offer.fans, capMultiplier, resistance);
  opportunityHistory = opportunityHistory.map((item, index) => index === opportunityHistory.length - 1 ? { ...item, baseFans: offer.fans, fansGained, fanMultiplier: capMultiplier } : item);
  const participantSet = new Set(offer.memberIds);
  const members = state.members.map((member) => {
    if (!participantSet.has(member.id)) return member;
    const naturalEnergy = clamp(voucherBaseFor(member, 'energy') - Math.round(offer.energy * (1.15 - member.stamina * 0.003)), -voucherAdjustmentFor(member, 'energy'), 100 - voucherAdjustmentFor(member, 'energy'));
    const next = applyNaturalStatChange(member, 'popularity', offer.awareness >= 3 ? 1 : 0);
    return { ...next, energy: naturalEnergy + voucherAdjustmentFor(member, 'energy'), voucherBaseStats: { ...(next.voucherBaseStats ?? {}), energy: naturalEnergy }, fanbase: member.fanbase + Math.round(fansGained / Math.max(1, offer.memberIds.length)), appearances: { ...member.appearances, media: (member.appearances?.media ?? 0) + (offer.category === 'media' ? 1 : 0), offAir: (member.appearances?.offAir ?? 0) + (offer.category === 'live' ? 1 : 0) } };
  });
  const financialEvent = { id: `${offer.id}-accepted-${state.year}-${state.week}`, type: 'opportunity', category: offer.category, title: offer.title, year: state.year, week: state.week, income: revenue, expense: offer.cost, net: revenue - offer.cost };
  return { ...state, pendingOpportunity: null, opportunityHistory, financialEvents: [...(state.financialEvents ?? []), financialEvent], money: state.money - offer.cost + revenue, members, group: { ...state.group, fanbase: state.group.fanbase + fansGained, popularity: clamp(state.group.popularity + 1), publicAwareness: clamp(state.group.publicAwareness + offer.awareness), reputation: clamp(state.group.reputation + offer.reputation) }, notifications: [{ type: 'success', text: `${offer.title} completed: ${moneyText(revenue)} revenue and ${fansGained.toLocaleString()} new fans.` }, ...(state.notifications ?? [])].slice(0, 20), history: [{ id: `${offer.id}-accepted`, type: 'opportunity', title: offer.title, detail: `${offer.memberIds.length} members participate. Net cash ${moneyText(revenue - offer.cost)}; ${fansGained.toLocaleString()} of ${offer.fans.toLocaleString()} potential fans gained.`, year: state.year, week: state.week }, ...(state.history ?? [])] };
}

export function prepareGraduation(state, graduationId, options = {}) {
  const graduation = (state.graduations ?? []).find((item) => item.id === graduationId);
  if (!graduation || graduation.completed || graduation.preparation) return state;
  const successor = options.successorId ? state.members.find((member) => member.id === options.successorId && ['active', 'trainee'].includes(member.status) && member.id !== graduation.memberId) : null;
  const preparation = { finalShow: Boolean(options.finalShow), specialSegment: Boolean(options.specialSegment), merchandise: Boolean(options.merchandise), successorId: successor?.id ?? null };
  const cost = (preparation.finalShow ? 8_000_000 : 0) + (preparation.specialSegment ? 4_000_000 : 0) + (preparation.merchandise ? 10_000_000 : 0) + (preparation.successorId ? 6_000_000 : 0);
  if (!Object.values(preparation).some(Boolean) || state.money < cost) return state;
  return { ...state, money: state.money - cost, graduations: state.graduations.map((item) => item.id === graduationId ? { ...item, preparation: { ...preparation, cost, configuredYear: state.year, configuredWeek: state.week } } : item), history: [{ id: `${graduationId}-preparation`, type: 'member', title: `${graduation.memberName} graduation plan`, detail: `Final show: ${preparation.finalShow ? 'yes' : 'no'}; special segment: ${preparation.specialSegment ? 'yes' : 'no'}; merchandise: ${preparation.merchandise ? 'yes' : 'no'}${successor ? `; successor: ${successor.nickname || successor.name}` : ''}.`, year: state.year, week: state.week }, ...(state.history ?? [])] };
}

export function getSetlistBoredom(state, setlistId, year = state.year, week = state.week) {
  const { boredomWindowWeeks, boredomPerPlay, boredomMax } = BALANCE.theater;
  const currentAbsolute = toAbsoluteWeek(year, week);
  const plays = (state.theaterHistory ?? []).filter((show) => show.setlistId === setlistId && currentAbsolute - toAbsoluteWeek(show.year, show.week) < boredomWindowWeeks).length;
  const penalty = Math.min(boredomMax, plays * boredomPerPlay);
  return { plays, penalty, demandMultiplier: 1 - penalty, windowWeeks: boredomWindowWeeks };
}

function createTheaterEconomics(state, day, theater = state.theater ?? state.theaterOffers?.[0]) {
  const configured = state.theaterShows?.[day];
  const setlist = SETLIST_BY_ID[configured?.setlistId] ?? SETLISTS[0];
  const lineup = state.members.filter((member) => state.schedule[`${member.id}:${day}`] === 'theater');
  const rng = createRng(hashSeed(`${state.seed}:theater-result:${state.year}:${state.week}:${day}:${setlist.id}`));
  const averagePopularity = lineup.reduce((sum, member) => sum + member.popularity, 0) / Math.max(1, lineup.length);
  const averageFanbase = lineup.reduce((sum, member) => sum + member.fanbase, 0) / Math.max(1, lineup.length);
  const averageMomentum = lineup.reduce((sum, member) => sum + member.momentum, 0) / Math.max(1, lineup.length);
  const averageFamiliarity = lineup.reduce((sum, member) => sum + (member.setlistFamiliarity?.[setlist.id] ?? 0), 0) / Math.max(1, lineup.length);
  const averageAbility = lineup.reduce((sum, member) => sum + (member.vocal + member.dance + member.performance) / 3, 0) / Math.max(1, lineup.length);
  const recentWindow = (state.theaterHistory ?? []).filter((show) => toAbsoluteWeek(state.year, state.week) - toAbsoluteWeek(show.year, show.week) <= 12);
  const lineupIds = new Set(lineup.map((member) => member.id));
  const recentExposure = recentWindow.reduce((sum, show) => sum + (show.memberIds ?? []).filter((memberId) => lineupIds.has(memberId)).length, 0) / Math.max(1, lineup.length);
  const center = lineup.find((member) => member.id === configured?.centerId);
  const narrativeLift = (state.fanNarratives ?? []).filter((item) => item.sentiment === 'positive' && (!item.memberId || lineupIds.has(item.memberId))).length * 4;
  const demandBase = state.group.fanbase * 0.0011 + averageFanbase * 0.012 + averagePopularity * 2.2 + state.group.popularity * 1.5 + averageMomentum * 1.2 + (center?.popularity ?? 0) * 0.8 + narrativeLift - recentExposure * 1.5;
  const boredom = getSetlistBoredom(state, setlist.id);
  const demand = Math.max(0, Math.round(demandBase * boredom.demandMultiplier * (0.9 + rng() * 0.2)));
  const attendance = Math.min(theater.capacity, demand);
  const crowdBonus = lineup.filter((member) => member.traits.includes('Crowd Magnet')).length * 1.2;
  const audienceSatisfaction = clamp(Math.round(averageAbility * 0.5 + averageFamiliarity * 0.25 + attendance / theater.capacity * 20 + crowdBonus + randomInt(rng, -4, 4)));
  const unitSongs = setlist.songs.slice(3, Math.min(8, setlist.songs.length));
  const units = unitSongs.map((song, index) => {
    const unitMembers = Array.from({ length: index % 2 ? 3 : 2 }, (_, offset) => lineup[(index * 2 + offset) % lineup.length]).filter(Boolean);
    return { songId: song.id, title: song.title, memberIds: unitMembers.map((member) => member.id), memberNames: unitMembers.map((member) => member.nickname || member.name) };
  });
  const understudyIds = state.members.filter((member) => canMemberPerform(member, 'theater') && !lineupIds.has(member.id)).sort((a, b) => (b.adaptability + b.performance) - (a.adaptability + a.performance)).slice(0, 2).map((member) => member.id);
  return { setlistId: setlist.id, setlistTitle: setlist.title, demand, attendance, capacity: theater.capacity, sellThrough: Math.round(attendance / theater.capacity * 1000) / 10, unmetDemand: Math.max(0, demand - attendance), revenue: attendance * theater.ticketPrice, audienceSatisfaction, averageFamiliarity: Math.round(averageFamiliarity), setlistPlaysInWindow: boredom.plays, setlistBoredomPenalty: boredom.penalty, memberExp: Math.max(1, Math.round(audienceSatisfaction / 12)), units, understudyIds };
}

// An off-air show is booked against a full house at the home theater plus a seeded premium, so it
// reliably beats a theater night on cash while costing more energy and being capped at one per week.
function createOffAirEconomics(state, day, theater = state.theater ?? state.theaterOffers?.[0]) {
  const activity = BALANCE.activities.offAir;
  const [minPremium, maxPremium] = activity.theaterRevenuePremium;
  const rng = createRng(hashSeed(`${state.seed}:off-air:${state.year}:${state.week}:${day}`));
  const premium = minPremium + rng() * (maxPremium - minPremium);
  const theaterCeiling = theater.capacity * theater.ticketPrice;
  return { day, premium: Math.round(premium * 1000) / 1000, theaterCeiling, revenue: Math.round(theaterCeiling * (1 + premium)) };
}

function activitySoftCapResistance(activityId, state) {
  if (activityId === 'theater') return FAN_BALANCE.activityResistance.theater;
  if (activityId.startsWith('vc')) return FAN_BALANCE.activityResistance.videoCall;
  if (activityId.startsWith('mg') || activityId === 'yearEndMeetGreet') return FAN_BALANCE.activityResistance.meetAndGreet;
  if (activityId === 'media' || activityId === 'offAir' || activityId === 'liveStream') return FAN_BALANCE.activityResistance.media;
  if (activityId.startsWith('mv')) return FAN_BALANCE.activityResistance.mv;
  if (activityId === 'concert') {
    const concert = state.concerts?.find((item) => item.targetYear === state.year && item.targetWeek === state.week);
    return concert?.eventType === 'anniversary' ? FAN_BALANCE.activityResistance.anniversaryConcert : FAN_BALANCE.activityResistance.concert;
  }
  return 0;
}

function getFanEventDemand(member, activityId, rng) {
  const composition = member.fanComposition ?? { core: 25, casual: 25, digital: 25, event: 25 };
  const videoCall = activityId.startsWith('vc');
  const profileWeight = videoCall ? composition.digital * 0.00012 + composition.casual * 0.00003 : composition.event * 0.00012 + composition.core * 0.00004;
  return Math.round(member.fanbase * (0.0035 + profileWeight + member.popularity / 15000) * (0.9 + rng() * 0.3));
}

function resolveMemberWeek(member, assignments, rng, theater, state) {
  let energy = voucherBaseFor(member, 'energy');
  let money = 0;
  let fanGain = 0;
  let baseFanGain = 0;
  const capMultiplier = getFanGrowthMultiplier(state.group.fanbase, state.fanTarget?.targetFanbase ?? Infinity);
  const addFans = (baseGain, resistance, acquisitionRate = 0) => {
    const normalizedBase = Math.round(baseGain);
    const appliedGain = applyFanSoftCap(normalizedBase, capMultiplier, resistance);
    const baseBonus = acquisitionRate > 0 ? Math.max(1, Math.round(normalizedBase * acquisitionRate)) : 0;
    const appliedBonus = acquisitionRate > 0 ? Math.max(1, Math.round(appliedGain * acquisitionRate)) : 0;
    baseFanGain += normalizedBase + baseBonus;
    fanGain += appliedGain + appliedBonus;
  };
  let popularity = voucherBaseFor(member, 'popularity');
  let momentum = member.momentum * 0.7;
  const finances = { theater: 0, videoCall: 0, meetGreet: 0, media: 0, offAir: 0, liveStream: 0, concert: 0, otherIncome: 0, activityCosts: 0 };
  const stats = { ...member };
  const voucherBaseStats = { ...(member.voucherBaseStats ?? {}) };
  SKILLS.forEach((skill) => {
    stats[skill] = voucherBaseFor(member, skill);
    voucherBaseStats[skill] = stats[skill];
  });
  const appearances = { ...member.appearances };
  let trainingProgress = member.trainingProgress ?? 0;
  let theaterAppearances = member.theaterAppearances ?? appearances.theater ?? 0;
  const demandRecords = [];
  const trainingSessions = [];
  const mentorship = activeMentorshipFor(state, member.id);

  for (const assignment of assignments) {
    const activityId = typeof assignment === 'string' ? assignment : assignment.activityId;
    const activityDay = typeof assignment === 'string' ? null : assignment.day;
    const activity = BALANCE.activities[activityId];
    const plannedTraining = typeof assignment !== 'string' && assignment.source === 'training' && Boolean(activity?.skill);
    if (!activity) continue;
    if (energy <= 0 && !activity.energyRecovery) {
      if (plannedTraining) trainingSessions.push({ memberId: member.id, memberName: member.nickname || member.name, activityId, skill: activity.skill, intensity: activity.type, order: assignment.trainingIndex, day: activityDay, status: 'skipped', reason: 'no-energy', cost: 0, energyUsed: 0, before: stats[activity.skill] + voucherAdjustmentFor(member, activity.skill), after: stats[activity.skill] + voucherAdjustmentFor(member, activity.skill), delta: 0 });
      continue;
    }
    const energyBefore = energy;
    const theaterShow = activityId === 'theater' ? state.theaterShows?.[activityDay] : null;
    const { fatigue, recovery } = activityEnergyChange(state, member, activityId, activityDay);
    const performanceBand = energy >= 60 ? 1 : energy >= 40 ? 0.95 : energy >= 20 ? 0.85 : 0.7;
    const familiarity = theaterShow ? member.setlistFamiliarity?.[theaterShow.setlistId] ?? 0 : 0;
    const baseFamiliarityMultiplier = 0.85 + familiarity * 0.0015;
    const unfamiliarityPenaltyRate = activityId === 'theater' ? Math.max(0, 1 + bonusValue(state, 'B030')) : 1;
    const familiarityMultiplier = activityId === 'theater' ? 1 - (1 - baseFamiliarityMultiplier) * unfamiliarityPenaltyRate : 1;
    const theaterTraitMultiplier = activityId === 'theater' && member.traits.includes('Theater Specialist') ? 1.15 : 1;
    const peers = activityDay && ['theater', 'concert'].includes(activityId)
      ? state.members.filter((item) => item.id !== member.id && state.schedule?.[`${item.id}:${activityDay}`] === activityId).map((item) => item.id)
      : [];
    const chemistryBonus = peers.length ? (chemistryScore(state, [member.id, ...peers], 'stage') - 50) * 0.12 : 0;
    const performanceVariance = member.traits.includes('Reliable Performer') ? Math.max(2, Math.round(5 - (member.consistency ?? 50) * 0.035)) : Math.max(3, Math.round(10 - (member.consistency ?? 50) * 0.07));
    const score = ((member.performance + member.dance + member.vocal) / 3) * performanceBand * familiarityMultiplier * theaterTraitMultiplier + chemistryBonus + randomInt(rng, -performanceVariance, performanceVariance);
    energy = clamp(energy - fatigue + recovery);
    const activityCost = activity.cost ?? 0;
    const activityRevenue = Math.round((activity.revenue ?? 0));
    money -= activityCost;
    money += activityRevenue;
    finances.activityCosts += activityCost;
    if (activityRevenue) finances[activityId === 'concert' ? 'concert' : 'otherIncome'] += activityRevenue;
    if (activityId === 'theater' && theater) {
      const theaterRevenue = Math.round((state.theaterEconomics?.[activityDay]?.revenue ?? theater.capacity * theater.ticketPrice) / 12);
      money += theaterRevenue;
      finances.theater += theaterRevenue;
    }
    if (activity.skill) {
      const trainingBefore = stats[activity.skill] + voucherAdjustmentFor(member, activity.skill);
      const statCap = voucherNaturalCap(member, activity.skill);
      stats[activity.skill] = clamp(stats[activity.skill] + trainingStatGain(member, stats, activity, energyBefore, state, mentorship), statCap.min, statCap.max);
      if (member.status === 'trainee') trainingProgress = clamp(trainingProgress + (activity.intensity ?? 1) * BALANCE.trainee.trainingProgressPerIntensity);
      if (plannedTraining) {
        const trainingAfter = stats[activity.skill] + voucherAdjustmentFor(member, activity.skill);
        trainingSessions.push({ memberId: member.id, memberName: member.nickname || member.name, activityId, skill: activity.skill, intensity: activity.type, order: assignment.trainingIndex, day: activityDay, status: 'completed', reason: null, cost: activityCost, energyUsed: fatigue, before: Math.round(trainingBefore * 10) / 10, after: Math.round(trainingAfter * 10) / 10, delta: Math.round((trainingAfter - trainingBefore) * 10) / 10 });
      }
    }
    if (activityId === 'theater') {
      appearances.theater += 1;
      if (member.status === 'trainee') theaterAppearances += 1;
      if (theaterShow?.centerId === member.id) appearances.center = (appearances.center ?? 0) + 1;
      const crowdMultiplier = member.traits.includes('Crowd Magnet') ? 1.12 : 1;
      addFans(Math.max(15, Math.round(score * 1.8 * crowdMultiplier * (1 + bonusValue(state, 'B025')))), activitySoftCapResistance(activityId, state));
      popularity += score >= 75 ? 1 : 0;
      if (theaterShow?.centerId === member.id && score >= 65) popularity += 1;
      if (theaterShow) {
        const familiarityGain = 6 * (1 + bonusValue(state, 'B017'));
        stats.setlistFamiliarity = { ...(stats.setlistFamiliarity ?? {}), [theaterShow.setlistId]: clamp(familiarity + familiarityGain) };
      }
      const theaterResult = state.theaterEconomics?.[activityDay];
      if (theaterResult?.units.some((unit) => unit.memberIds.includes(member.id))) appearances.unit = (appearances.unit ?? 0) + 1;
      stats.theaterExp = (stats.theaterExp ?? member.theaterExp ?? 0) + (theaterResult?.memberExp ?? 1);
    }
    if (activityId === 'media') {
      const mediaRevenue = Math.round(member.popularity * activity.revenuePerPopularity * (1 + bonusValue(state, 'B010')));
      money += mediaRevenue;
      finances.media += mediaRevenue;
      appearances.media += 1;
      addFans(member.variety * 2.2, activitySoftCapResistance(activityId, state));
      popularity += 1;
    }
    if (activityId === 'offAir') {
      // Off-air is priced against a sold-out theater night plus a premium, so it out-earns the theater
      // while costing more energy and being limited to one day a week.
      const performanceRevenue = Math.round((state.offAirEconomics?.[activityDay]?.revenue ?? 0) / activity.requiredMembers);
      money += performanceRevenue;
      finances.offAir += performanceRevenue;
      appearances.offAir = (appearances.offAir ?? 0) + 1;
      addFans(score * 4.6, activitySoftCapResistance(activityId, state));
      popularity += score >= 70 ? 1 : 0;
      momentum += score >= 75 ? 1 : 0;
    }
    if (activityId === 'liveStream') {
      const streamRevenue = Math.round(member.popularity * activity.revenuePerPopularity);
      const streamFans = Math.round(member.popularity * activity.fansPerPopularity);
      money += streamRevenue;
      finances.liveStream += streamRevenue;
      addFans(streamFans, activitySoftCapResistance(activityId, state), bonusValue(state, 'B026'));
      momentum += 1;
    }
    if (activity.capacity && activityId !== 'yearEndMeetGreet') {
      const demand = Math.round(getFanEventDemand(member, activityId, rng) * (1 + bonusValue(state, 'B027')));
      const sold = Math.min(activity.capacity, demand);
      const ticketRevenue = Math.round(sold * activity.ticket);
      money += ticketRevenue;
      if (activityId.startsWith('vc')) finances.videoCall += ticketRevenue;
      else if (activityId.startsWith('mg')) finances.meetGreet += ticketRevenue;
      else finances.otherIncome += ticketRevenue;
      const eventFans = sold * 0.12;
      addFans(eventFans, activitySoftCapResistance(activityId, state), activityId.startsWith('vc') ? bonusValue(state, 'B026') : 0);
      momentum += sold / activity.capacity > 0.9 ? 2 : -1;
      demandRecords.push({ id: `demand-${state.year}-${state.week}-${member.id}-${activityId}-${activityDay}`, memberId: member.id, memberName: member.nickname || member.name, type: activityId.startsWith('vc') ? 'videoCall' : activityId.startsWith('mg') ? 'meetGreet' : activityId, activityId, year: state.year, week: state.week, day: activityDay, capacity: activity.capacity, demand, sold, unmetDemand: Math.max(0, demand - sold), sellThrough: Math.round(sold / activity.capacity * 1000) / 10, revenue: ticketRevenue });
    }
    if (activityId.startsWith('mv')) {
      addFans(score * 12, activitySoftCapResistance(activityId, state), bonusValue(state, 'B026'));
      popularity += activityId === 'mvCenter' ? 4 : 2;
    }
    if (activityId === 'concert') {
      addFans(score * 25, activitySoftCapResistance(activityId, state));
      popularity += score >= 70 ? 3 : -1;
    }
    if (activityId === 'yearEndMeetGreet') {
      addFans(member.popularity * 3, activitySoftCapResistance(activityId, state));
      momentum += 2;
    }
  }
  const naturalEnergy = clamp(energy, -voucherAdjustmentFor(member, 'energy'), 100 - voucherAdjustmentFor(member, 'energy'));
  const naturalPopularity = clamp(popularity, -voucherAdjustmentFor(member, 'popularity'), 100 - voucherAdjustmentFor(member, 'popularity'));
  const displayEnergy = naturalEnergy + voucherAdjustmentFor(member, 'energy');
  const displayPopularity = naturalPopularity + voucherAdjustmentFor(member, 'popularity');
  const naturalVoucherBaseStats = {
    ...voucherBaseStats,
    energy: naturalEnergy,
    popularity: naturalPopularity,
  };
  return {
    member: {
      ...member,
      ...Object.fromEntries(SKILLS.map((key) => [key, Math.round((stats[key] + voucherAdjustmentFor(member, key)) * 10) / 10])),
      voucherBaseStats: { ...naturalVoucherBaseStats, ...Object.fromEntries(SKILLS.map((key) => [key, Math.round(stats[key] * 10) / 10])) },
      setlistFamiliarity: stats.setlistFamiliarity ?? member.setlistFamiliarity ?? {},
      theaterExp: stats.theaterExp ?? member.theaterExp ?? 0,
      energy: displayEnergy,
      popularity: displayPopularity,
      momentum: clamp(momentum, -20, 20),
      fanbase: member.fanbase + fanGain,
      appearances,
      trainingProgress,
      theaterAppearances,
    },
    money,
    fanGain,
    baseFanGain,
    finances,
    demandRecords,
    trainingSessions,
  };
}

// Weekly wear from what a member was actually asked to do. Heavy days (theater, concerts, M&G, MV)
// count for more than light ones; the injury roll then uses the member's current energy band.
function rollInjury(member, assignments, rng, state) {
  const config = BALANCE.injury;
  if (isMemberInjured(member) || !assignments.length) return null;
  const load = assignments.reduce((sum, assignment) => {
    const activityId = typeof assignment === 'string' ? assignment : assignment.activityId;
    const activity = BALANCE.activities[activityId];
    if (!activity || activity.energyRecovery) return sum;
    return sum + (config.loadByType[activity.type] ?? 1);
  }, 0);
  const excess = load - config.loadThreshold;
  if (excess <= 0) return null;
  const chance = member.energy <= config.lowEnergyThreshold
    ? config.chanceByEnergy.low
    : member.energy >= config.highEnergyThreshold
      ? config.chanceByEnergy.high
      : config.chanceByEnergy.mid;
  if (rng() >= chance) return null;
  const severity = weightedPick(rng, config.severities, (option) => option.weight);
  const contributingAssignments = assignments.filter((assignment) => {
    const activityId = typeof assignment === 'string' ? assignment : assignment.activityId;
    const activity = BALANCE.activities[activityId];
    return activity && !activity.energyRecovery;
  });
  return { severity: severity.id, label: severity.label, weeksRemaining: severity.weeks, weeks: severity.weeks, blocks: [...severity.blocks], causedBy: { year: state.year, week: state.week, load, assignments: normalizeInjuryAssignments(contributingAssignments) } };
}

function scheduleGraduations(state, targetYear, currentWeek, members, rng) {
  const config = BALANCE.graduation;
  const existing = state.graduations ?? [];
  const graduationTargets = { ...(state.graduationTargets ?? {}) };
  if (targetYear < 2 || (currentWeek - 1) % BALANCE.weeksPerMonth !== 0) return { graduations: existing, graduationTargets };
  if (!graduationTargets[targetYear]) {
    const budgetRng = createRng(hashSeed(`${state.seed}:graduation-budget:${targetYear}`));
    graduationTargets[targetYear] = { year: targetYear, targetCount: randomInt(budgetRng, BALANCE.graduation.normalMin, BALANCE.graduation.normalMax), scheduledCount: existing.filter((item) => item.planYear === targetYear).length };
  }
  const alreadyPlannedIds = new Set(existing.filter((item) => !item.completed).map((item) => item.memberId));
  const eligible = members.map((member) => {
    const joinedYear = Number.isFinite(member.joinedYear) ? member.joinedYear : 1;
    const joinedWeek = Number.isFinite(member.joinedWeek) ? member.joinedWeek : 1;
    return { member, tenureWeeks: toAbsoluteWeek(targetYear, currentWeek) - toAbsoluteWeek(joinedYear, joinedWeek) };
  }).filter(({ member, tenureWeeks }) => {
    if (!['active', 'trainee'].includes(member.status) || member.graduationPending) return false;
    if (alreadyPlannedIds.has(member.id)) return false;
    return tenureWeeks >= config.minimumTenureYears * BALANCE.weeksPerYear;
  });
  const maximum = graduationTargets[targetYear].targetCount;
  const plannedThisYear = existing.filter((item) => item.planYear === targetYear).length;
  if (plannedThisYear >= maximum) return { graduations: existing, graduationTargets };
  // Pending graduates are already excluded by getTheaterEligibleMembers, so subtracting
  // them again would stop a safe 18-member roster before its sixth planned departure.
  const safeMaximum = Math.max(0, getTheaterEligibleMembers({ members }).length - BALANCE.theaterMinimumMembers);
  if (safeMaximum === 0 || eligible.length === 0) return { graduations: existing, graduationTargets };
  const currentMonth = Math.ceil(currentWeek / BALANCE.weeksPerMonth);
  const remainingBudget = maximum - plannedThisYear;
  const remainingMonths = 13 - currentMonth;
  if (remainingMonths > remainingBudget && rng() >= remainingBudget / remainingMonths) return { graduations: existing, graduationTargets };
  const member = eligible.sort((first, second) => second.tenureWeeks - first.tenureWeeks || (second.member.weeksWithoutEvent ?? 0) - (first.member.weeksWithoutEvent ?? 0) || first.member.id.localeCompare(second.member.id))[0].member;
  const lead = randomInt(rng, config.minLead, config.maxLead);
  const departureTotal = currentWeek + lead;
  const plan = { id: `graduation-${targetYear}-${currentMonth}-${member.id}`, memberId: member.id, memberName: member.nickname || member.name, planYear: targetYear, annualTarget: maximum, announcementYear: targetYear, announcementWeek: currentWeek, departureYear: departureTotal > BALANCE.weeksPerYear ? targetYear + 1 : targetYear, departureWeek: departureTotal > BALANCE.weeksPerYear ? departureTotal - BALANCE.weeksPerYear : departureTotal, announced: false, completed: false };
  graduationTargets[targetYear] = { ...graduationTargets[targetYear], scheduledCount: plannedThisYear + 1 };
  return { graduations: [...existing, plan], graduationTargets };
}

function makeRunSummary(state, members, eligibleCount, records) {
  const active = members.filter((member) => ['active', 'trainee'].includes(member.status)).length;
  const baseReward = 5 + (state.year - 1) * 5 + Math.floor((state.week - 1) / 12) + Math.floor((records.peakFanTrust + records.peakReputation) / 40);
  const reward = Math.max(1, Math.floor(baseReward * BALANCE.managementTokenMultiplier)) + (state.fanTargetMetaReward ?? 0);
  const score = Math.max(0, Math.round((records.peakPopularity ?? 0) * 2 + (records.peakFanTrust ?? 0) * 2 + (records.peakReputation ?? 0) * 2 + (records.singlesReleased ?? 0) * 20 + (records.theaterShows ?? 0) * 2 + state.year * 40));
  const rank = score >= 700 ? 'S' : score >= 550 ? 'A' : score >= 400 ? 'B' : score >= 250 ? 'C' : 'D';
  const highestSellingSingle = [...(state.singles ?? [])].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
  const newGenerations = new Set((state.auditions ?? []).map((audition) => audition.year)).size;
  const breakoutStars = new Set((state.fanNarratives ?? []).filter((narrative) => ['breakout', 'pattern'].includes(narrative.type) && /Breakout|Next Ace|Future/i.test(narrative.title)).map((narrative) => narrative.memberId)).size;
  const successfulCenters = members.filter((member) => (member.appearances?.center ?? 0) >= 5).length;
  return {
    seed: state.seed,
    managementName: state.managementName,
    theaterName: state.theater?.name ?? '',
    yearsSurvived: state.year - 1,
    weeksSurvived: (state.year - 1) * BALANCE.weeksPerYear + state.week,
    score,
    rank,
    singlesReleased: records.singlesReleased ?? 0,
    theaterShows: records.theaterShows ?? 0,
    videoCallTickets: records.videoCallTickets ?? 0,
    meetGreetTickets: records.meetGreetTickets ?? 0,
    largestConcert: records.largestConcert ?? 0,
    bestConcertOccupancy: records.bestConcertOccupancy ?? 0,
    largestRoster: records.largestRoster ?? active,
    lowestEligibleRoster: records.lowestEligibleRoster ?? eligibleCount,
    membersRecruited: (state.auditions ?? []).reduce((sum, item) => sum + item.size, 0),
    membersDeveloped: (state.promotions ?? []).length,
    newGenerations,
    breakoutStars,
    successfulCenters,
    highestSellingSingle: highestSellingSingle ? { title: highestSellingSingle.title, views: highestSellingSingle.views ?? 0 } : null,
    graduations: (state.graduations ?? []).filter((item) => item.completed).length,
    dramaSuspensions: records.dramaSuspensions ?? 0,
    concertsHeld: state.concerts.filter((concert) => concert.status === 'completed' || !concert.status).length,
    moneyEarned: records.moneyEarned ?? 0,
    moneySpent: records.moneySpent ?? 0,
    finalMoney: state.money,
    finalFanbase: state.group.fanbase,
    finalPopularity: state.group.popularity,
    finalFanTrust: state.group.fanTrust,
    finalReputation: state.group.reputation,
    finalPublicAwareness: state.group.publicAwareness,
    totalMembers: members.length,
    finalActiveRoster: active,
    finalTrainees: members.filter((member) => member.status === 'trainee').length,
    finalGraduatedMembers: (state.graduations ?? []).filter((item) => item.completed).length,
    finalEligibleRoster: eligibleCount,
    peakFanbase: records.peakFanbase,
    peakPopularity: records.peakPopularity ?? state.group.popularity,
    peakFanTrust: records.peakFanTrust,
    peakReputation: records.peakReputation,
    cause: 'THEATER ROSTER FAILURE',
    metaReward: reward,
  };
}

function appendNarrative(items, narrative) {
  if (!narrative || items.some((item) => item.id === narrative.id)) return items;
  return [narrative, ...items].slice(0, 20);
}

function derivePatternNarratives(items, members, year, week, currentAbsolute) {
  let narratives = items;
  const active = members.filter((member) => ['active', 'trainee'].includes(member.status));
  active.forEach((member) => {
    const ability = SKILLS.slice(0, 5).reduce((sum, skill) => sum + member[skill], 0) / 5;
    const name = member.nickname || member.name;
    if (ability >= 72 && member.popularity < 50) narratives = appendNarrative(narratives, { id: `underrated-${member.id}`, type: 'pattern', title: 'Underrated', detail: `Fans argue that ${name}'s ability deserves more attention.`, memberId: member.id, sentiment: 'mixed', year, week, expiresAbsolute: currentAbsolute + 16 });
    if ((member.appearances?.theater ?? 0) >= 20) narratives = appendNarrative(narratives, { id: `theater-queen-${member.id}`, type: 'pattern', title: 'Theater Queen', detail: `${name}'s sustained theater presence has become central to core fan discussion.`, memberId: member.id, sentiment: 'positive', year, week, expiresAbsolute: currentAbsolute + 24 });
    if ((member.appearances?.center ?? 0) >= 5 && member.appearances.center / Math.max(1, member.appearances.theater) >= 0.35) narratives = appendNarrative(narratives, { id: `management-favorite-${member.id}`, type: 'pattern', title: 'Management Favorite', detail: `${name}'s repeated center assignments are drawing attention across fan factions.`, memberId: member.id, sentiment: 'mixed', year, week, expiresAbsolute: currentAbsolute + 12 });
    if (member.status === 'trainee' && member.momentum >= 6) narratives = appendNarrative(narratives, { id: `breakout-rookie-${member.id}`, type: 'pattern', title: 'Breakout Rookie', detail: `${name} is building early momentum as a possible future center.`, memberId: member.id, sentiment: 'positive', year, week, expiresAbsolute: currentAbsolute + 16 });
  });
  if (year >= 2 && active.length) {
    const overallExposure = active.reduce((sum, member) => sum + (member.appearances?.theater ?? 0), 0) / active.length;
    const generations = active.reduce((groups, member) => ({ ...groups, [member.generation]: [...(groups[member.generation] ?? []), member] }), {});
    Object.entries(generations).forEach(([generation, generationMembers]) => {
      const exposure = generationMembers.reduce((sum, member) => sum + (member.appearances?.theater ?? 0), 0) / generationMembers.length;
      if (generationMembers.length >= 2 && overallExposure >= 8 && exposure < overallExposure * 0.35) narratives = appendNarrative(narratives, { id: `lost-generation-${generation}`, type: 'pattern', title: 'Lost Generation', detail: `${generation} is receiving unusually little theater exposure compared with the roster.`, sentiment: 'negative', year, week, expiresAbsolute: currentAbsolute + 16 });
    });
  }
  return narratives;
}

const gradeForScore = (score) => score >= 95 ? 'S' : score >= 88 ? 'A+' : score >= 80 ? 'A' : score >= 74 ? 'A-' : score >= 68 ? 'B+' : score >= 60 ? 'B' : score >= 54 ? 'B-' : score >= 46 ? 'C' : score >= 38 ? 'D' : 'E';

function createAnnualReview(state, { group, members, lastResult, concerts, auditions, fanTargetPerformance, fanTarget }) {
  const reports = [...(state.weeklyReports ?? []).filter((report) => report.year === state.year), lastResult];
  const netCash = reports.reduce((sum, report) => sum + (report.moneyDelta ?? 0), 0);
  const trainingGrowth = reports.flatMap((report) => report.skillChanges ?? []).reduce((sum, change) => sum + Math.max(0, change.delta ?? 0), 0);
  const theaterShows = reports.reduce((sum, report) => sum + (report.theaterShows?.length ?? 0), 0);
  const releasedSingles = concerts ? state.singles.filter((single) => single.releasedYear === state.year).length : 0;
  const anniversary = concerts.find((concert) => concert.eventType === 'anniversary' && concert.targetYear === state.year);
  const categories = [
    ['financial', 'Financial Management', clamp(Math.round(55 + netCash / 12_000_000))],
    ['development', 'Member Development', clamp(Math.round(42 + trainingGrowth * 5))],
    ['fans', 'Fan Relations', clamp(Math.round(group.fanTrust * 0.7 + group.reputation * 0.3))],
    ['growth', 'Group Growth', clamp(Math.round(group.popularity * 0.45 + group.publicAwareness * 0.35 + Math.min(20, group.fanbase / 25_000)))],
    ['singles', 'Singles / Media', clamp(Math.round(45 + releasedSingles * 14 + Math.min(25, reports.reduce((sum, report) => sum + (report.finances?.otherIncome ?? 0), 0) / 8_000_000)))],
    ['theater', 'Theater Management', clamp(Math.round(40 + Math.min(60, theaterShows * 2.5)))],
    ['anniversary', 'Anniversary Execution', anniversary?.summary?.evaluation?.overall ?? (anniversary ? 55 : 25)],
    ['audition', 'Audition Management', auditions.some((audition) => audition.year === state.year) ? 78 : 35],
    ['fanTarget', 'Fan Growth', fanTargetPerformance.reviewScore],
  ].map(([id, label, score]) => ({ id, label, score, grade: gradeForScore(score) }));
  const overallScore = Math.round(categories.reduce((sum, category) => sum + category.score, 0) / categories.length);
  return { year: state.year, overallScore, overallGrade: gradeForScore(overallScore), categories, snapshot: { fanbase: group.fanbase, popularity: group.popularity, fanTrust: group.fanTrust, reputation: group.reputation, publicAwareness: group.publicAwareness, netCash, roster: members.filter((member) => ['active', 'trainee'].includes(member.status)).length, theaterShows, singlesReleased: releasedSingles, fanGrowth: { startingFans: fanTarget.startingFanbase, targetFans: fanTarget.targetFanbase, actualFans: group.fanbase, achievementPercent: fanTargetPerformance.achievementPercent, label: fanTargetPerformance.label, trustDelta: fanTargetPerformance.trustDelta, reputationDelta: fanTargetPerformance.reputationDelta, metaReward: fanTargetPerformance.metaReward } } };
}

export function endRun(state) {
  if (state.runStatus === 'ended') return state;
  const eligibleCount = getTheaterEligibleMembers(state).length;
  const records = state.records ?? { peakFanTrust: state.group.fanTrust, peakReputation: state.group.reputation, peakFanbase: state.group.fanbase, largestRoster: state.members.length, lowestEligibleRoster: eligibleCount, theaterShows: 0, dramaSuspensions: 0 };
  return { ...state, runStatus: 'ended', runEndedAt: { year: state.year, week: state.week }, runSummary: { ...makeRunSummary(state, state.members, eligibleCount, records), cause: 'RUN ENDED BY MANAGEMENT' } };
}

export function resolveWeek(state) {
  if (state.runStatus === 'ended') return state;
  state = migrateInjuryHistoryState(state);
  const rng = createRng(hashSeed(`${state.seed}:${state.rngStep}`));
  const currentAbsolute = toAbsoluteWeek(state.year, state.week);
  const activatedPlans = (state.fanEventPlans ?? []).filter((plan) => plan.year === state.year && plan.targetWeek === state.week);
  const weekSchedule = currentWeekSchedule(state);
  let moneyDelta = state.hardMode ? 0 : -applyRate(18_000_000, bonusValue(state, 'B004')) - (state.theater?.weeklyUpkeep ?? 0);
  let fanGain = 0;
  let baseFanGain = 0;
  const weeklyFanCapMultiplier = getFanGrowthMultiplier(state.group.fanbase, state.fanTarget?.targetFanbase ?? Infinity);
  const addGroupFans = (baseGain, resistance = 0) => {
    const normalizedBase = Math.round(baseGain);
    baseFanGain += normalizedBase;
    const applied = applyFanSoftCap(normalizedBase, weeklyFanCapMultiplier, resistance);
    fanGain += applied;
    return applied;
  };
  const finances = { theater: 0, videoCall: 0, meetGreet: 0, media: 0, offAir: 0, liveStream: 0, concert: 0, twoShot: 0, campaign: 0, otherIncome: 0, activityCosts: 0, refunds: 0, salary: 0, debtPayments: 0, loanPayment: 0, generalOperations: state.hardMode ? 0 : applyRate(18_000_000, bonusValue(state, 'B004')), theaterUpkeep: state.hardMode ? 0 : state.theater?.weeklyUpkeep ?? 0 };
  const { theaterLineups, offAirLineups, validTheaterDays, validOffAirDays, surplusOffAirDays } = scheduleLineupValidity(state, weekSchedule);
  const month = Math.ceil(state.week / BALANCE.weeksPerMonth);
  const scheduledEntries = Object.entries(weekSchedule);
  const concertDay = DAYS.find((day) => scheduledEntries.some(([key, activity]) => key.endsWith(`:${day}`) && activity === 'concert'));
  const concertMembers = concertDay ? state.members.filter((member) => weekSchedule[`${member.id}:${concertDay}`] === 'concert') : [];
  const currentConcert = state.concerts.find((concert) => concert.targetYear === state.year && concert.targetWeek === state.week);
  const concertSummary = concertDay && concertMembers.length ? createConcertSummary(rng, concertMembers, concertDay, currentConcert, state) : null;
  let concerts = state.concerts.map((concert) => {
    if (concert.status !== 'selling' || currentAbsolute > concert.saleCloseAbsolute) return concert;
    const remaining = concert.projectedSold - concert.sold;
    const weeklyTarget = currentAbsolute === concert.saleCloseAbsolute ? remaining : Math.min(remaining, Math.ceil(concert.projectedSold / concert.salesWeeks));
    const salesRevenue = Math.round(weeklyTarget * concert.ticketPrice);
    moneyDelta += salesRevenue;
    finances.concert += salesRevenue;
    return { ...concert, sold: concert.sold + weeklyTarget, revenue: (concert.revenue ?? 0) + salesRevenue, status: currentAbsolute === concert.saleCloseAbsolute ? 'salesClosed' : 'selling' };
  });
  let yearEndMeetGreets = (state.yearEndMeetGreets ?? []).map((event) => {
    if (event.year !== state.year || currentAbsolute >= toAbsoluteWeek(event.year, event.targetWeek) || state.week < event.salesStartWeek) return event;
    const salesRng = createRng(hashSeed(`${state.seed}:${event.id}:sales:${state.week}`));
    let weeklyRevenue = 0;
    const memberSessions = event.memberSessions.map((session) => {
      const member = state.members.find((item) => item.id === session.memberId);
      if (!member || member.status === 'graduated') return session;
      const remaining = session.capacity - session.sold;
      const demand = Math.round(getFanEventDemand(member, 'mg1', salesRng) * (1 + bonusValue(state, 'B027')));
      const sold = Math.min(remaining, Math.max(0, demand));
      weeklyRevenue += Math.round(sold * event.ticketPrice);
      return { ...session, sold: session.sold + sold };
    });
    moneyDelta += weeklyRevenue;
    finances.meetGreet += weeklyRevenue;
    return { ...event, status: 'selling', memberSessions, revenue: event.revenue + weeklyRevenue };
  });
  const activityEvents = [...(state.activityEvents ?? [])];
  if (scheduledEntries.some(([, activity]) => activity === 'concert')) activityEvents.push({ id: `concert-${state.year}-${state.week}`, type: 'concert', year: state.year, week: state.week, month });
  if (scheduledEntries.some(([, activity]) => activity.startsWith('mg'))) activityEvents.push({ id: `meet-greet-${state.year}-${state.week}`, type: 'meetGreet', year: state.year, week: state.week, month });
  scheduledEntries.filter(([, activity]) => activity.startsWith('vc')).forEach(([scheduleKey]) => activityEvents.push({ id: `video-call-${state.year}-${state.week}-${scheduleKey}`, type: 'videoCall', memberId: scheduleKey.split(':')[0], year: state.year, week: state.week, month }));
  const effectiveTheater = state.theater ?? state.theaterOffers?.[0];
  const theaterEconomics = Object.fromEntries([...validTheaterDays].map((day) => [day, createTheaterEconomics({ ...state, schedule: weekSchedule }, day, effectiveTheater)]));
  const offAirEconomics = Object.fromEntries([...validOffAirDays].map((day) => [day, createOffAirEconomics(state, day, effectiveTheater)]));
  const resolutionState = { ...state, schedule: weekSchedule, theater: effectiveTheater, theaterEconomics, offAirEconomics };
  const weeklyDemandRecords = [];
  const twoShotRecords = [];
  [...validTheaterDays].forEach((day) => {
    const lineup = state.members.filter((member) => weekSchedule[`${member.id}:${day}`] === 'theater');
    const capacity = lineup.length * BALANCE.twoShot.roulette.slotsPerMember;
    const demand = lineup.reduce((sum, member) => sum + Math.max(0, Math.round(getFanEventDemand(member, 'mg1', createRng(hashSeed(`${state.seed}:2shot:roulette:${state.year}:${state.week}:${day}:${member.id}`))) / 50)), 0);
    const sold = Math.min(capacity, demand);
    const revenue = Math.round(sold * BALANCE.twoShot.roulette.ticket);
    moneyDelta += revenue;
    finances.twoShot += revenue;
    twoShotRecords.push({ id: `2shot-roulette-${state.year}-${state.week}-${day}`, type: 'twoShotRoulette', year: state.year, week: state.week, day, capacity, demand, sold, unmetDemand: Math.max(0, demand - sold), revenue });
    // 2-Shot Birthday (Seitansai)
    const configured = state.theaterShows?.[day] ?? {};
    const seitansaiMember = lineup.find((member) => member.id === configured.seitansaiMemberId);
    if (configured.isSeitansai && seitansaiMember) {
      const birthdayCapacity = 100;
      const birthdayTicket = 200000;
      const birthdayDemand = Math.max(0, Math.round(getFanEventDemand(seitansaiMember, 'mg1', createRng(hashSeed(`${state.seed}:2shot:birthday:${state.year}:${state.week}:${day}:${seitansaiMember.id}`))) / 30));
      const birthdaySold = Math.min(birthdayCapacity, birthdayDemand);
      const birthdayRevenue = Math.round(birthdaySold * birthdayTicket);
      moneyDelta += birthdayRevenue;
      finances.twoShot += birthdayRevenue;
      twoShotRecords.push({ id: `2shot-birthday-${state.year}-${state.week}-${day}`, type: 'twoShotBirthday', year: state.year, week: state.week, day, capacity: birthdayCapacity, demand: birthdayDemand, sold: birthdaySold, unmetDemand: Math.max(0, birthdayDemand - birthdaySold), revenue: birthdayRevenue });
    }
    // 2-Shot Last Show
    if (configured.isLastShow) {
      const lastShowCapacity = 100;
      const lastShowTicket = 200000;
      const lastShowDemand = lineup.reduce((sum, member) => sum + Math.max(0, Math.round(getFanEventDemand(member, 'mg1', createRng(hashSeed(`${state.seed}:2shot:lastshow:${state.year}:${state.week}:${day}:${member.id}`))) / 30)), 0);
      const lastShowSold = Math.min(lastShowCapacity, lastShowDemand);
      const lastShowRevenue = Math.round(lastShowSold * lastShowTicket);
      moneyDelta += lastShowRevenue;
      finances.twoShot += lastShowRevenue;
      twoShotRecords.push({ id: `2shot-lastshow-${state.year}-${state.week}-${day}`, type: 'twoShotLastShow', year: state.year, week: state.week, day, capacity: lastShowCapacity, demand: lastShowDemand, sold: lastShowSold, unmetDemand: Math.max(0, lastShowDemand - lastShowSold), revenue: lastShowRevenue });
    }
  });
  const meetGreetDays = [...new Set(scheduledEntries.filter(([, activity]) => activity === 'mg1').map(([key]) => key.slice(key.lastIndexOf(':') + 1)))];
  meetGreetDays.forEach((day) => {
    const lineup = state.members.filter((member) => weekSchedule[`${member.id}:${day}`] === 'mg1');
    const capacity = BALANCE.twoShot.meetGreet.slotsPerEvent;
    const demand = lineup.reduce((sum, member) => sum + Math.max(0, Math.round(getFanEventDemand(member, 'mg1', createRng(hashSeed(`${state.seed}:2shot:mg:${state.year}:${state.week}:${day}:${member.id}`))) / 18)), 0);
    const sold = Math.min(capacity, demand);
    const revenue = Math.round(sold * BALANCE.twoShot.meetGreet.ticket);
    moneyDelta += revenue;
    finances.twoShot += revenue;
    twoShotRecords.push({ id: `2shot-mg-${state.year}-${state.week}-${day}`, type: 'twoShotMeetGreet', year: state.year, week: state.week, day, capacity, demand, sold, unmetDemand: Math.max(0, demand - sold), revenue });
  });
  weeklyDemandRecords.push(...twoShotRecords);
  const injuryNotifications = [];
  const injuryEvents = [];
  const trainingSessionRecords = [];
  let unsignedMembers = [...(state.unsignedMembers ?? [])];
  let members = state.members.map((member) => {
    if (member.suspensionWeeks > 0) {
      trainingPlanFor(state, member.id).forEach((activityId, order) => trainingSessionRecords.push({ memberId: member.id, memberName: member.nickname || member.name, activityId, skill: BALANCE.activities[activityId]?.skill, intensity: BALANCE.activities[activityId]?.type, order, day: null, status: 'skipped', reason: 'suspended', cost: 0, energyUsed: 0, before: null, after: null, delta: 0 }));
      const left = member.suspensionWeeks - 1;
      return { ...member, suspensionWeeks: left, status: left === 0 ? 'active' : 'suspended', energy: left === 0 ? 100 : member.energy };
    }
    const injury = member.injury && (member.injury.weeksRemaining ?? 0) > 0
      ? { ...member.injury, weeksRemaining: member.injury.weeksRemaining - 1 }
      : null;
    const injuryActive = Boolean(injury && injury.weeksRemaining >= 0);
    const { assignments, skippedTraining } = composeMemberWeekAssignments(state, member, weekSchedule, validTheaterDays, validOffAirDays);
    skippedTraining.forEach((session) => trainingSessionRecords.push({ ...session, memberName: member.nickname || member.name }));
    const result = resolveMemberWeek({ ...member, injury: injuryActive ? injury : null }, assignments, rng, effectiveTheater, resolutionState);
    const rolledInjury = injuryActive ? null : rollInjury(result.member, assignments, rng, state);
    if (rolledInjury) {
      injuryNotifications.push(`${result.member.nickname || result.member.name} suffers a ${rolledInjury.label.toLowerCase()} injury and misses ${rolledInjury.weeksRemaining} week(s).`);
    }
    moneyDelta += result.money;
    fanGain += result.fanGain;
    baseFanGain += result.baseFanGain;
    weeklyDemandRecords.push(...result.demandRecords);
    trainingSessionRecords.push(...result.trainingSessions);
    Object.keys(result.finances).forEach((key) => { finances[key] += result.finances[key]; });
    const participated = assignments.some(({ activityId }) => activityId === 'theater' || activityId === 'offAir' || activityId === 'media' || activityId === 'photoshoot' || BALANCE.activities[activityId]?.skill);
    let injuryHistory = result.member.injuryHistory ?? [];
    let nextInjury = rolledInjury ?? (injuryActive && injury?.weeksRemaining > 0 ? injury : null);
    if (rolledInjury) {
      const incident = createInjuryIncident(result.member, rolledInjury, state);
      nextInjury = { ...rolledInjury, incidentId: incident.id };
      injuryHistory = [incident, ...injuryHistory.filter((item) => item.id !== incident.id)];
      injuryEvents.push(injuryTimelineEvent(incident, result.member.nickname || result.member.name, 'onset'));
    } else if (member.injury && !nextInjury) {
      const incidentId = member.injury.incidentId;
      const incident = injuryHistory.find((item) => item.id === incidentId && item.status === 'active');
      if (incident) {
        const recovered = { ...incident, status: 'recovered', recoveredYear: state.year, recoveredWeek: state.week };
        injuryHistory = injuryHistory.map((item) => item.id === incident.id ? recovered : item);
        injuryEvents.push(injuryTimelineEvent(recovered, result.member.nickname || result.member.name, 'recovered'));
      }
    }
    const nextMember = { ...result.member, injury: nextInjury, injuryHistory, weeksWithoutEvent: participated ? 0 : (member.weeksWithoutEvent ?? 0) + 1 };
    return nextMember.status === 'trainee' ? { ...nextMember, traineeWeeks: (nextMember.traineeWeeks ?? 0) + 1 } : nextMember;
  });

  let week = state.week + 1;
  let year = state.year;
  const history = [...state.history];
  const existingHistoryIds = new Set(history.map((event) => event.id));
  injuryEvents.filter((event) => !existingHistoryIds.has(event.id)).forEach((event) => history.unshift(event));
  const notifications = [];
  injuryNotifications.forEach((text) => notifications.push({ type: 'critical', text }));
  DAYS.filter((day) => theaterLineups[day] > 0 && theaterLineups[day] !== 12).forEach((day) => {
    notifications.push({ type: 'critical', text: `${day} theater show canceled: ${theaterLineups[day]}/12 members assigned.` });
  });
  DAYS.filter((day) => offAirLineups[day] > 0 && offAirLineups[day] !== BALANCE.activities.offAir.requiredMembers).forEach((day) => {
    notifications.push({ type: 'critical', text: `${day} off-air performance canceled: ${offAirLineups[day]}/${BALANCE.activities.offAir.requiredMembers} members assigned.` });
  });
  surplusOffAirDays.forEach((day) => {
    notifications.push({ type: 'critical', text: `${day} off-air performance canceled: only ${BALANCE.activities.offAir.maxPerWeek} off-air show is allowed each week.` });
  });
  const skippedTrainingCount = trainingSessionRecords.filter((session) => session.status === 'skipped').length;
  if (skippedTrainingCount) notifications.push({ type: 'critical', code: 'training-skipped', text: `${skippedTrainingCount} training session(s) skipped. Review free days, member availability, and Energy.` });
  let memberDramaCooldown = Math.max(0, (state.memberDramaCooldown ?? state.dramaCooldown ?? 0) - 1);
  let managementDramaCooldown = Math.max(0, (state.managementDramaCooldown ?? 0) - 1);
  let activeDrama = members.some((member) => member.status === 'suspended') ? state.activeDrama : null;
  let activeManagementDrama = state.activeManagementDrama?.weeksRemaining > 0
    ? { ...state.activeManagementDrama, weeksRemaining: state.activeManagementDrama.weeksRemaining - 1 }
    : null;
  let dramaTrustDelta = 0;
  let dramaReputationDelta = 0;
  let graduationTrustDelta = 0;
  let dramaMemory = (state.dramaMemory ?? []).map((memory) => ({ ...memory, weeksRemaining: memory.weeksRemaining - 1 })).filter((memory) => memory.weeksRemaining > 0);
  let fanNarratives = (state.fanNarratives ?? []).filter((narrative) => !narrative.expiresAbsolute || narrative.expiresAbsolute >= currentAbsolute);

  if (!activeDrama && state.activeDrama) {
    memberDramaCooldown = randomInt(rng, ...BALANCE.dramaCooldown);
    history.unshift({ id: `return-${state.rngStep}`, type: 'member', title: `${state.activeDrama.name} returns`, detail: `Returns fully rested. Drama cooldown: ${memberDramaCooldown} weeks.`, year, week: state.week });
  }
  if (!activeManagementDrama && state.activeManagementDrama) {
    managementDramaCooldown = randomInt(rng, ...BALANCE.dramaCooldown);
    history.unshift({ id: `management-return-${state.rngStep}`, type: 'management', dramaSource: 'management', title: 'Management incident closes', detail: `Office response cycle closes. Management drama cooldown: ${managementDramaCooldown} weeks.`, year, week: state.week });
  }
  if (year >= 2 && !activeDrama && memberDramaCooldown === 0 && rng() < BALANCE.dramaChance) {
    const eligible = members.filter((member) => member.status === 'active');
    if (eligible.length) {
      const selected = weightedPick(rng, eligible, (member) => 10 + member.ego * 0.8 + Math.max(0, member.momentum));
      const dramaTemplate = weightedPick(rng, MEMBER_DRAMA_TEMPLATES, (template) => template.weight);
      const memberName = selected.nickname || selected.name;
      const targetCandidates = dramaTemplate.directedTarget === 'member'
        ? members.filter((member) => member.id !== selected.id && ['active', 'trainee'].includes(member.status))
        : [];
      const targetMember = targetCandidates.length ? weightedPick(rng, targetCandidates, (member) => 10 + member.popularity) : null;
      const targetName = targetMember?.nickname || targetMember?.name || (dramaTemplate.directedTarget === 'fans' ? 'fans' : dramaTemplate.directedTarget === 'staff' ? 'staff' : 'the target');
      const targetNameId = targetMember?.nickname || targetMember?.name || (dramaTemplate.directedTarget === 'fans' ? 'penggemar' : dramaTemplate.directedTarget === 'staff' ? 'staf' : 'target');
      const dramaTitle = personalizeDramaText(dramaTemplate.title, memberName, targetName);
      const dramaTitleId = personalizeDramaText(dramaTemplate.titleId, memberName, targetNameId);
      const dramaDetail = personalizeDramaText(dramaTemplate.detail, memberName, targetName);
      const dramaDetailId = personalizeDramaText(dramaTemplate.detailId, memberName, targetNameId);
      const severityRoll = rng();
      const severity = severityRoll < 0.4 ? 'Minor' : severityRoll < 0.75 ? 'Moderate' : severityRoll < 0.95 ? 'Major' : 'Extreme';
      const baseDamage = { Minor: 2, Moderate: 4, Major: 7, Extreme: 11 }[severity];
      const protectedDamage = Math.max(1, Math.round(baseDamage * (1 + bonusValue(state, 'B024'))));
      dramaTrustDelta = -protectedDamage;
      dramaReputationDelta = -Math.max(1, Math.round(protectedDamage * 0.7));
      activeDrama = { dramaSource: 'member', memberId: selected.id, name: memberName, originalStatus: selected.status, response: 'pending', dramaId: dramaTemplate.id, category: dramaTemplate.category, categoryId: dramaTemplate.categoryId, directedTarget: dramaTemplate.directedTarget ?? null, targetMemberId: targetMember?.id ?? null, targetName, targetNameId, title: dramaTitle, titleId: dramaTitleId, detail: dramaDetail, detailId: dramaDetailId, severity, startedWeek: state.week };
      dramaMemory = [{ dramaSource: 'member', memberId: selected.id, name: activeDrama.name, dramaId: activeDrama.dramaId, category: activeDrama.category, categoryId: activeDrama.categoryId, directedTarget: activeDrama.directedTarget, targetMemberId: activeDrama.targetMemberId, targetName: activeDrama.targetName, title: activeDrama.title, titleId: activeDrama.titleId, detail: activeDrama.detail, detailId: activeDrama.detailId, severity, weeksRemaining: 12, initialImpact: protectedDamage }, ...dramaMemory].slice(0, 20);
      fanNarratives = appendNarrative(fanNarratives, { id: `drama-narrative-${state.rngStep}`, type: 'drama', dramaSource: 'member', title: dramaTitle, detail: dramaDetail, sentiment: 'negative', year, week: state.week, expiresAbsolute: currentAbsolute + 12 });
      notifications.push({ type: 'critical', text: `${activeDrama.name}: ${dramaTitle}. Management response required.` });
      history.unshift({ id: `drama-${state.rngStep}`, type: 'drama', dramaSource: 'member', title: dramaTitle, titleId: dramaTitleId, detail: dramaDetail, detailId: dramaDetailId, category: dramaTemplate.category, categoryId: dramaTemplate.categoryId, year, week: state.week });
    }
  }
  const managementContext = getManagementDramaContext(state, members);
  if (year >= 2 && !activeManagementDrama && managementDramaCooldown === 0 && rng() < BALANCE.dramaChance * 0.35 * getManagementDramaChanceMultiplier(managementContext)) {
    const selection = selectManagementDramaTemplate(state, members, rng, managementContext);
    const selectedTemplate = appendManagementContext(selection.template, selection.context);
    const needsMember = /\{member\}/.test(`${selectedTemplate.title} ${selectedTemplate.detail} ${selectedTemplate.titleId} ${selectedTemplate.detailId}`);
    const contextMember = needsMember
      ? members.find((member) => member.id === selection.context.memberId && ['active', 'trainee'].includes(member.status))
        ?? weightedPick(rng, members.filter((member) => ['active', 'trainee'].includes(member.status)), (member) => 10 + member.popularity)
      : null;
    const memberName = contextMember?.nickname || contextMember?.name || '';
    const title = personalizeDramaText(selectedTemplate.title, memberName);
    const titleId = personalizeDramaText(selectedTemplate.titleId, memberName);
    const detail = personalizeDramaText(selectedTemplate.detail, memberName);
    const detailId = personalizeDramaText(selectedTemplate.detailId, memberName);
    const severityRoll = rng();
    const severity = severityRoll < 0.4 ? 'Minor' : severityRoll < 0.75 ? 'Moderate' : severityRoll < 0.95 ? 'Major' : 'Extreme';
    const baseDamage = { Minor: 2, Moderate: 4, Major: 7, Extreme: 11 }[severity];
    const protectedDamage = Math.max(1, Math.round(baseDamage * (1 + bonusValue(state, 'B024'))));
    dramaTrustDelta += Math.round((selectedTemplate.trust ?? -protectedDamage) * (1 + bonusValue(state, 'B024')));
    dramaReputationDelta += Math.round((selectedTemplate.reputation ?? -Math.max(1, protectedDamage * 0.7)) * (1 + bonusValue(state, 'B024')));
    activeManagementDrama = {
      dramaSource: 'management', memberId: contextMember?.id ?? null, name: memberName || null,
      dramaId: selectedTemplate.id, category: selectedTemplate.category, categoryId: selectedTemplate.categoryId,
      title, titleId, detail, detailId, severity, context: selection.context, weeksRemaining: 1, startedWeek: state.week,
    };
    dramaMemory = [{ type: 'management', dramaSource: 'management', memberId: contextMember?.id ?? null, name: memberName || null, dramaId: selectedTemplate.id, category: selectedTemplate.category, categoryId: selectedTemplate.categoryId, title, titleId, detail, detailId, severity, context: selection.context, weeksRemaining: 8, year, week: state.week }, ...dramaMemory].slice(0, 20);
    fanNarratives = appendNarrative(fanNarratives, { id: `management-drama-${state.rngStep}`, type: 'drama', dramaSource: 'management', title, detail, sentiment: 'negative', year, week: state.week, expiresAbsolute: currentAbsolute + 8 });
    notifications.push({ type: 'critical', text: `${title}: management trust and reputation take a hit.` });
    history.unshift({ id: `management-drama-${state.rngStep}`, type: 'drama', dramaSource: 'management', title, titleId, detail, detailId, category: selectedTemplate.category, categoryId: selectedTemplate.categoryId, year, week: state.week });
  }
  const graduationSchedule = scheduleGraduations(state, year, state.week, members, rng);
  let graduations = graduationSchedule.graduations;
  const graduationTargets = graduationSchedule.graduationTargets;
  graduations = graduations.map((graduation) => {
    if (!graduation.announced && graduation.announcementYear === year && graduation.announcementWeek === state.week) {
      notifications.push({ type: 'critical', text: `${graduation.memberName} announces graduation for Year ${graduation.departureYear}, Week ${graduation.departureWeek}.` });
      history.unshift({ id: `${graduation.id}-announcement`, type: 'member', title: `${graduation.memberName} announces graduation`, detail: `Final departure scheduled for Year ${graduation.departureYear}, Week ${graduation.departureWeek}.`, year, week: state.week });
      members = members.map((member) => member.id === graduation.memberId ? { ...member, graduationPending: true } : member);
      return { ...graduation, announced: true };
    }
    if (!graduation.completed && graduation.departureYear === year && graduation.departureWeek === state.week) {
      const preparation = graduation.preparation ?? {};
      const graduationFans = (preparation.finalShow ? 4_000 : 0) + (preparation.specialSegment ? 1_500 : 0);
      const merchandiseRevenue = preparation.merchandise ? Math.round(18_000_000) : 0;
      const appliedGraduationFans = addGroupFans(graduationFans, FAN_BALANCE.activityResistance.concert);
      moneyDelta += merchandiseRevenue;
      finances.otherIncome += merchandiseRevenue;
      graduationTrustDelta += (preparation.finalShow ? 2 : 0) + (preparation.specialSegment ? 1 : 0);
      notifications.push({ type: 'critical', text: `${graduation.memberName} has graduated.` });
      history.unshift({ id: `${graduation.id}-departure`, type: 'member', title: `${graduation.memberName} graduates`, detail: preparation.finalShow ? `The final show closes the member's active career with ${appliedGraduationFans.toLocaleString()} fan growth.` : 'The member leaves the active theater roster.', year, week: state.week });
      members = members.map((member) => {
        if (member.id === graduation.memberId) return { ...member, status: 'graduated', theaterEligible: false, canPerformTheater: false, graduationPending: false };
        if (member.id !== preparation.successorId) return member;
        return { ...applyNaturalStatChange(applyNaturalStatChange(member, 'performance', 2), 'popularity', 1), successorOf: graduation.memberId };
      });
      return { ...graduation, completed: true, outcome: { baseFanGain: graduationFans, fanGain: appliedGraduationFans, merchandiseRevenue, fanTrustGain: graduationTrustDelta } };
    }
    return graduation;
  });
  let departures = (state.departures ?? []).map((departure) => {
    if (departure.status !== 'fired' || currentAbsolute + 1 < departure.returnAbsolute) return departure;
    const recycled = recycleMemberForPool(departure.member, state, departure);
    appendMissingInjuryRecoveryEvents(recycled, history);
    if (!(unsignedMembers ?? []).some((candidate) => (candidate.identityId ?? candidate.id) === recycled.identityId)) unsignedMembers.push(recycled);
    notifications.push({ type: 'success', text: `${departure.member.nickname || departure.member.name} returns to the audition pool after release.` });
    history.unshift({ id: `${departure.id}-pool-return`, type: 'member', title: `${departure.member.nickname || departure.member.name} returns to the talent pool`, detail: 'Two years after release, the member can be recruited again with newly generated stats.', year, week: state.week });
    return { ...departure, status: 'returned', poolReturnYear: year, poolReturnWeek: state.week };
  }).filter((departure) => departure.status !== 'returned');
  graduations = graduations.map((graduation) => {
    if (!graduation.completed || graduation.returnedToPool) return graduation;
    const returnAbsolute = toAbsoluteWeek(graduation.departureYear, graduation.departureWeek) + BALANCE.weeksPerYear * 2;
    if (currentAbsolute + 1 < returnAbsolute) return graduation;
    const poolCalendar = fromAbsoluteWeek(currentAbsolute + 1);
    const graduatedMember = members.find((member) => member.id === graduation.memberId && member.status === 'graduated');
    if (!graduatedMember) return { ...graduation, returnedToPool: true, poolReturnYear: poolCalendar.year, poolReturnWeek: poolCalendar.week };
    const recycled = recycleMemberForPool(graduatedMember, state, graduation);
    appendMissingInjuryRecoveryEvents(recycled, history);
    const identityAlreadyAvailable = unsignedMembers.some((member) => (member.identityId ?? member.id) === recycled.identityId);
    members = members.filter((member) => member.id !== graduatedMember.id);
    if (!identityAlreadyAvailable) unsignedMembers.push(recycled);
    notifications.push({ type: 'success', text: `${graduation.memberName} is available in the audition pool again with a reset profile.` });
    history.unshift({ id: `${graduation.id}-pool-return`, type: 'member', title: `${graduation.memberName} returns to the talent pool`, detail: 'Two years after graduation, the member can be recruited again with newly generated stats.', year: poolCalendar.year, week: poolCalendar.week });
    return { ...graduation, returnedToPool: true, poolReturnYear: poolCalendar.year, poolReturnWeek: poolCalendar.week, recycledMemberId: recycled.id };
  });
  const promotionResult = { members, promotions: [] };
  const promotions = state.promotions ?? [];
  if (rng() < 0.12) {
    const selected = members[randomInt(rng, 0, members.length - 1)];
    const baseGain = randomInt(rng, 1200, 8000);
    const gain = addGroupFans(baseGain, FAN_BALANCE.activityResistance.extremeViral);
    members = members.map((member) => member.id === selected.id ? { ...applyNaturalStatChange(member, 'popularity', randomInt(rng, 2, 7)), fanbase: member.fanbase + gain, momentum: clamp(member.momentum + 5, -20, 20) } : member);
    notifications.push({ type: 'success', text: `${selected.nickname || selected.name} gains momentum from a viral clip.` });
    history.unshift({ id: `viral-${state.rngStep}`, type: 'viral', title: 'Viral moment', detail: `${selected.nickname || selected.name} gained ${gain.toLocaleString()} new fans.`, year, week: state.week });
    fanNarratives = appendNarrative(fanNarratives, { id: `breakout-${selected.id}-${year}-${state.week}`, type: 'breakout', title: 'Breakout star', detail: `Fans are watching ${selected.nickname || selected.name} after a viral performance.`, memberId: selected.id, sentiment: 'positive', year, week: state.week, expiresAbsolute: currentAbsolute + 12 });
  }
  if (week > BALANCE.weeksPerYear) {
    year += 1;
    week = 1;
    history.unshift({ id: `year-${year}`, type: 'year', title: `Year ${year} begins`, detail: 'New season. Roster recovery and annual review complete.', year, week: 1 });
  }
  members = members.map((member) => ['active', 'trainee'].includes(member.status) ? { ...member, energy: clamp(member.energy + Math.round((BALANCE.weeklyRecovery + bonusValue(state, 'B011')) * staminaRecoveryMultiplier(member.stamina))) } : member);
  let auditions = state.auditions ?? [];
  let auditionCampaign = state.auditionCampaign ?? null;
  if (auditionCampaign?.status === 'active') {
    const progressWeeks = auditionCampaign.progressWeeks + 1;
    if (progressWeeks >= auditionCampaign.durationWeeks) {
      if (!auditionCampaign.selectionConfirmed) {
        auditionCampaign = { ...auditionCampaign, progressWeeks: auditionCampaign.durationWeeks - 1, phase: 'selection' };
      } else {
        const selectedIds = (auditionCampaign.selectedCandidateIds ?? []).slice(0, auditionCampaign.maxIntake);
        const selectedCandidates = auditionCampaign.candidatePool.filter((candidate) => selectedIds.includes(candidate.id));
        const selectedPoolIds = new Set(selectedCandidates.map((candidate) => candidate.sourcePoolId ?? candidate.candidateId ?? candidate.id));
        members = [...members, ...selectedCandidates.map(({ candidateId, sourcePoolId, ...candidate }) => ({ ...candidate, id: candidateId ?? candidate.id, status: 'trainee', joinedYear: year, joinedWeek: week, traineeWeeks: 0, trainingProgress: 0 }))];
        unsignedMembers = unsignedMembers.filter((member) => !selectedPoolIds.has(member.id));
        auditions = [...auditions, { year: auditionCampaign.year, size: selectedCandidates.length, finalistPoolSize: auditionCampaign.finalistPoolSize, applicantPoolSize: auditionCampaign.applicantPoolSize, startWeek: auditionCampaign.startWeek, durationWeeks: auditionCampaign.durationWeeks }];
        auditionCampaign = null;
        notifications.push({ type: 'success', text: `${selectedCandidates.length} trainees join after the five-week audition.` });
        history.unshift({ id: `audition-${state.year}-${state.week}-complete`, type: 'audition', title: 'Audition finalized', detail: `${selectedCandidates.length} trainees join the roster after candidate selection.`, year: state.year, week: state.week });
      }
    } else {
      auditionCampaign = { ...auditionCampaign, progressWeeks, phase: ['applications', 'screening', 'evaluation', 'finalists', 'selection'][progressWeeks] ?? 'selection' };
    }
  }
  const completedMentorships = [];
  const mentorships = (state.mentorships ?? []).map((mentorship) => {
    if (mentorship.status !== 'active' || currentAbsolute + 1 < mentorship.endAbsolute) return mentorship;
    const completed = { ...mentorship, status: 'completed', completedYear: state.year, completedWeek: state.week };
    completedMentorships.push(completed);
    notifications.push({ type: 'success', text: 'Mentorship cycle completed.' });
    return completed;
  });
  const mentorshipHistory = [...(state.mentorshipHistory ?? []), ...completedMentorships];
  let completedSingles = 0;
  let singlePopularityGain = 0;
  let singleFanTrustGain = 0;
  let singles = state.singles.map((storedSingle) => {
    let single = storedSingle;
    if (single.status === 'released') {
      const viewWeek = (single.viewWeeks ?? 0) + 1;
      const viewResult = mvViewGain(single, state.group, viewWeek);
      return { ...single, views: (single.views ?? 0) + viewResult.gain, weeklyViewGain: viewResult.gain, viewWeeks: viewWeek, launchViews: viewResult.launchViews };
    }
    if (!single.releaseYear || !single.releaseWeek) {
      if (single.status !== 'production') return single;
      const progressWeeks = Math.min(single.durationWeeks, single.progressWeeks + 1);
      if (progressWeeks < single.durationWeeks) return { ...single, progressWeeks };
      completedSingles += 1;
      singlePopularityGain += single.popularityGain ?? 3;
      singleFanTrustGain += single.fanTrustGain ?? 1;
      notifications.push({ type: 'success', text: `${single.title} MV production completed.` });
      history.unshift({ id: `${single.id}-release`, type: 'single', title: `${single.title} released`, detail: 'Four-week MV production completed. Group popularity and public awareness increased.', year, week });
      const viewResult = mvViewGain(single, state.group, 1);
      return { ...single, progressWeeks, status: 'released', releasedYear: year, releasedWeek: week, views: viewResult.gain, weeklyViewGain: viewResult.gain, viewWeeks: 1, launchViews: viewResult.launchViews };
    }
    const productionStartAbsolute = toAbsoluteWeek(single.productionStartYear, single.productionStartWeek);
    const releaseAbsolute = toAbsoluteWeek(single.releaseYear, single.releaseWeek);
    let nextSingle = single;
    if (currentAbsolute >= productionStartAbsolute && currentAbsolute < productionStartAbsolute + single.durationWeeks) {
      const progressWeeks = Math.min(single.durationWeeks, single.progressWeeks + 1);
      nextSingle = { ...single, status: progressWeeks === single.durationWeeks ? 'ready' : 'production', progressWeeks };
      if (progressWeeks === single.durationWeeks) notifications.push({ type: 'success', text: `${single.title} MV production completed. Release preparations begin.` });
    }
    if (currentAbsolute === releaseAbsolute) {
      completedSingles += 1;
      singlePopularityGain += single.popularityGain ?? 3;
      singleFanTrustGain += single.fanTrustGain ?? 1;
      notifications.push({ type: 'success', text: `${single.title} released.` });
      history.unshift({ id: `${single.id}-release`, type: 'single', title: `${single.title} released`, detail: 'The scheduled single release increased group popularity and public awareness.', year: state.year, week: state.week });
      const viewResult = mvViewGain(single, state.group, 1);
      nextSingle = { ...nextSingle, status: 'released', releasedYear: state.year, releasedWeek: state.week, views: viewResult.gain, weeklyViewGain: viewResult.gain, viewWeeks: 1, launchViews: viewResult.launchViews };
    }
    return nextSingle;
  });
  const newlyReleasedSingles = singles.filter((single) => single.status === 'released' && state.singles.find((previous) => previous.id === single.id)?.status !== 'released');
  if (newlyReleasedSingles.length) {
    members = members.map((member) => {
      const selected = newlyReleasedSingles.filter((single) => single.memberIds.includes(member.id));
      const centered = selected.filter((single) => single.centerId === member.id).length;
      const excluded = newlyReleasedSingles.length - selected.length;
      return { ...member, oshiSentiment: clamp((member.oshiSentiment ?? 0) + selected.length * 2 + centered * 2 - excluded, -100, 100) };
    });
  }
  const nextAbsolute = toAbsoluteWeek(year, week);
  const nextSchedule = getConfirmedScheduleForWeek({ ...state, year, week, members, singles, concerts, yearEndMeetGreets, schedule: {} }, year, week);
  if (concertSummary) concerts = concerts.map((concert) => concert.targetYear === state.year && concert.targetWeek === state.week ? { ...concert, status: 'completed', summary: concertSummary } : concert);
  const currentYearEndMeetGreet = yearEndMeetGreets.find((event) => event.year === state.year && event.targetWeek === state.week);
  const yearEndMeetGreetSummary = currentYearEndMeetGreet ? { title: 'Year-end Meet & Greet', attendance: currentYearEndMeetGreet.memberSessions.reduce((sum, session) => sum + session.sold, 0), capacity: currentYearEndMeetGreet.memberSessions.reduce((sum, session) => sum + session.capacity, 0), revenue: currentYearEndMeetGreet.revenue, participatingMembers: currentYearEndMeetGreet.memberSessions.length } : null;
  if (currentYearEndMeetGreet) yearEndMeetGreets = yearEndMeetGreets.map((event) => event.id === currentYearEndMeetGreet.id ? { ...event, status: 'completed', summary: yearEndMeetGreetSummary } : event);
  const concertTrustDelta = concertSummary?.evaluation.fanTrustDelta ?? 0;
  const protectedConcertTrustDelta = protectNormalTrustLoss(state, concertTrustDelta);
  if (concertSummary?.evaluation.overall >= 85) fanNarratives = appendNarrative(fanNarratives, { id: `concert-triumph-${state.year}-${state.week}`, type: 'concert', title: 'A defining stage', detail: `${concertSummary.title} exceeds fan expectations and strengthens management credibility.`, sentiment: 'positive', year: state.year, week: state.week, expiresAbsolute: currentAbsolute + 16 });
  if (concertSummary?.evaluation.occupancy < 50) fanNarratives = appendNarrative(fanNarratives, { id: `concert-risk-${state.year}-${state.week}`, type: 'concert', title: 'Venue ambition questioned', detail: `${concertSummary.title} finishes below 50% occupancy. Fans question the venue decision.`, sentiment: 'negative', year: state.year, week: state.week, expiresAbsolute: currentAbsolute + 16 });
  fanNarratives = derivePatternNarratives(fanNarratives, members, state.year, state.week, currentAbsolute);
  const currentPools = state.group.fanPools ?? { coreWota: Math.round(state.group.fanbase * 0.27), casual: Math.round(state.group.fanbase * 0.25), generalPublic: Math.round(state.group.fanbase * 0.14), digital: Math.round(state.group.fanbase * 0.2), event: Math.round(state.group.fanbase * 0.14), oshi: Math.round(state.group.fanbase * 0.23), groupFans: Math.round(state.group.fanbase * 0.3) };
  const hasDigitalActivity = scheduledEntries.some(([, activity]) => activity === 'liveStream' || activity.startsWith('vc')) || completedSingles > 0;
  const hasEventActivity = scheduledEntries.some(([, activity]) => activity === 'theater' || activity.startsWith('mg') || activity === 'concert');
  const fanPools = { ...currentPools, casual: currentPools.casual + Math.round(fanGain * 0.2), generalPublic: currentPools.generalPublic + Math.round(fanGain * 0.12), coreWota: currentPools.coreWota + Math.round(fanGain * (hasEventActivity ? 0.28 : 0.18)), digital: currentPools.digital + Math.round(fanGain * (hasDigitalActivity ? 0.3 : 0.18)), event: currentPools.event + Math.round(fanGain * (hasEventActivity ? 0.22 : 0.12)), oshi: (currentPools.oshi ?? Math.round(state.group.fanbase * 0.23)) + Math.round(fanGain * 0.24), groupFans: (currentPools.groupFans ?? Math.round(state.group.fanbase * 0.3)) + Math.round(fanGain * 0.26) };
  const previousSentiment = state.group.fanSentiment ?? {};
  const fanSentiment = { coreWota: clamp((previousSentiment.coreWota ?? 0) + (validTheaterDays.size ? 1 : 0), -100, 100), casual: clamp((previousSentiment.casual ?? 0) + (completedSingles ? 2 : 0), -100, 100), generalPublic: clamp((previousSentiment.generalPublic ?? 0) + (completedSingles || concertSummary ? 2 : 0), -100, 100), digital: clamp((previousSentiment.digital ?? 0) + (hasDigitalActivity ? 1 : 0), -100, 100), event: clamp((previousSentiment.event ?? 0) + (hasEventActivity ? 1 : 0), -100, 100), oshi: clamp((previousSentiment.oshi ?? 0) + (fanGain > 0 ? 1 : 0) + dramaTrustDelta, -100, 100), groupFans: clamp((previousSentiment.groupFans ?? 0) + protectedConcertTrustDelta + dramaTrustDelta, -100, 100) };
  let resolvedLedger = state.ledger ?? { pendingUpkeep: 0, pendingOperations: 0, debt: { salary: 0, upkeep: 0, operations: 0 }, unpaidSalaryMonths: 0, settlements: [] };
  let resolvedLoans = state.loans ?? [];
  let loanPenalty = 0;
  let salaryDefault = false;
  let seitansaiObligations = [...(state.seitansaiObligations ?? [])];
  let seitansaiTrustDelta = 0;
  const seitansaiOshiDelta = new Map();
  if (state.hardMode && state.week % BALANCE.weeksPerMonth === 1) {
    members.filter((member) => ['active', 'trainee'].includes(member.status) && member.birthMonth === month).forEach((member) => {
      if (!seitansaiObligations.some((obligation) => obligation.memberId === member.id && obligation.year === state.year && obligation.month === month)) seitansaiObligations.push({ id: `seitansai-${state.year}-${month}-${member.id}`, memberId: member.id, year: state.year, month, dueAbsolute: currentAbsolute + 6, status: 'open' });
    });
  }
  seitansaiObligations = seitansaiObligations.map((obligation) => {
    if (obligation.status !== 'open') return obligation;
    const fulfilled = [...validTheaterDays].some((day) => {
      const show = state.theaterShows?.[day];
      return show?.isSeitansai && show.seitansaiMemberId === obligation.memberId && weekSchedule[`${obligation.memberId}:${day}`] === 'theater';
    }) || (state.theaterHistory ?? []).some((show) => show.isSeitansai && show.seitansaiMemberId === obligation.memberId && show.memberIds?.includes(obligation.memberId) && show.year === obligation.year && toAbsoluteWeek(show.year, show.week) >= obligation.dueAbsolute - 6);
    if (fulfilled) {
      seitansaiTrustDelta += BALANCE.seitansai.trustGain;
      seitansaiOshiDelta.set(obligation.memberId, BALANCE.seitansai.oshiSentiment);
      return { ...obligation, status: 'fulfilled', fulfilledYear: state.year, fulfilledWeek: state.week };
    }
    if (currentAbsolute < obligation.dueAbsolute) return obligation;
    seitansaiTrustDelta -= BALANCE.seitansai.missedTrustLoss;
    seitansaiOshiDelta.set(obligation.memberId, -BALANCE.seitansai.missedOshiLoss);
    notifications.push({ type: 'critical', text: `${members.find((member) => member.id === obligation.memberId)?.name ?? 'Birthday member'}'s Seitansai was missed.` });
    return { ...obligation, status: 'missed', missedYear: state.year, missedWeek: state.week };
  });
  members = members.map((member) => seitansaiOshiDelta.has(member.id) ? { ...member, oshiSentiment: clamp((member.oshiSentiment ?? 0) + seitansaiOshiDelta.get(member.id)) } : member);
  if (!state.hardMode && state.week % BALANCE.weeksPerMonth === 0) {
    const salaryDue = members
      .filter((member) => ['active', 'trainee'].includes(member.status))
      .reduce((sum, member) => sum + getMemberSalary(member, state.year, false), 0);
    moneyDelta -= salaryDue;
    finances.salary += salaryDue;
  }
  if (state.hardMode) {
    resolvedLedger = { ...resolvedLedger, pendingUpkeep: (resolvedLedger.pendingUpkeep ?? 0) + (state.theater?.weeklyUpkeep ?? 0), pendingOperations: (resolvedLedger.pendingOperations ?? 0) + applyRate(18_000_000, bonusValue(state, 'B004')), debt: { ...(resolvedLedger.debt ?? {}) } };
    if (state.week % BALANCE.weeksPerMonth === 0) {
      let settlementCash = state.money + moneyDelta;
      const previousSalaryDebt = resolvedLedger.debt.salary ?? 0;
      const due = { salary: members.filter((member) => ['active', 'trainee'].includes(member.status)).reduce((sum, member) => sum + getMemberSalary(member, state.year, true), 0) + previousSalaryDebt, upkeep: resolvedLedger.pendingUpkeep + (resolvedLedger.debt.upkeep ?? 0), operations: resolvedLedger.pendingOperations + (resolvedLedger.debt.operations ?? 0) };
      const paid = {};
      Object.entries(due).forEach(([category, amount]) => { const amountPaid = Math.min(Math.max(0, settlementCash), amount); settlementCash -= amountPaid; moneyDelta -= amountPaid; paid[category] = amountPaid; resolvedLedger.debt[category] = amount - amountPaid; });
      const unpaidCurrentSalary = paid.salary < Math.max(0, due.salary - previousSalaryDebt);
      resolvedLedger = { ...resolvedLedger, pendingUpkeep: 0, pendingOperations: 0, unpaidSalaryMonths: unpaidCurrentSalary ? (resolvedLedger.unpaidSalaryMonths ?? 0) + 1 : 0, settlements: [...(resolvedLedger.settlements ?? []), { year: state.year, month, due, paid }].slice(-24) };
      finances.salary += paid.salary;
      finances.debtPayments += paid.upkeep + paid.operations;
      resolvedLoans = resolvedLoans.flatMap((loan) => {
        const payment = Math.min(Math.max(0, state.money + moneyDelta), loan.monthlyPayment, loan.balance);
        moneyDelta -= payment;
        finances.loanPayment += payment;
        const missed = payment < loan.monthlyPayment;
        if (missed) loanPenalty += BALANCE.loans.reputationPenalty;
        const nextBalance = Math.max(0, loan.balance - payment) + (missed ? Math.round(loan.monthlyPayment * BALANCE.loans.monthlyFeeRate) : 0);
        return loan.monthsRemaining <= 1 && nextBalance <= 0 ? [] : [{ ...loan, balance: nextBalance, monthsRemaining: loan.monthsRemaining - 1 }];
      });
      salaryDefault = resolvedLedger.unpaidSalaryMonths > BALANCE.salary.unpaidMonthsToEnd;
    }
  }
  const currentFanTarget = state.fanTarget?.formulaVersion === 2 ? state.fanTarget : createFanTargetForYear(state.year, state.group.fanbase);
  const annualFanPerformance = state.week === BALANCE.weeksPerYear ? getFanTargetPerformance(state.group.fanbase + fanGain, currentFanTarget.targetFanbase) : null;
  const protectedAnnualFanPerformance = annualFanPerformance ? { ...annualFanPerformance, trustDelta: protectNormalTrustLoss(state, annualFanPerformance.trustDelta) } : null;
  const financialTrustDelta = moneyDelta > 0 ? 1 : moneyDelta < -60_000_000 ? -1 : 0;
  const group = {
    ...state.group,
    fanbase: state.group.fanbase + fanGain,
    popularity: clamp(state.group.popularity + (fanGain > 5000 ? 1 : 0) + singlePopularityGain + (concertSummary?.evaluation.popularityDelta ?? 0)),
    fanTrust: clamp(state.group.fanTrust + protectNormalTrustLoss(state, financialTrustDelta) + protectNormalTrustLoss(state, singleFanTrustGain) + protectedConcertTrustDelta + dramaTrustDelta + graduationTrustDelta + protectNormalTrustLoss(state, seitansaiTrustDelta) + (protectedAnnualFanPerformance?.trustDelta ?? 0)),
    reputation: clamp(state.group.reputation + (concertSummary?.evaluation.reputationDelta ?? 0) + dramaReputationDelta + (annualFanPerformance?.reputationDelta ?? 0) - loanPenalty),
    publicAwareness: clamp(state.group.publicAwareness + (fanGain > 8000 ? 1 : 0) + completedSingles * 4),
    fanPools, fanSentiment,
  };
  const eligibleCount = getTheaterEligibleMembers({ members }).length;
  const previousRecords = state.records ?? {};
  const theaterShows = [...validTheaterDays].length;
  const concertEvaluation = concertSummary?.evaluation;
  const records = { ...previousRecords, peakFanbase: Math.max(previousRecords.peakFanbase ?? 0, group.fanbase), peakPopularity: Math.max(previousRecords.peakPopularity ?? 0, group.popularity), peakFanTrust: Math.max(previousRecords.peakFanTrust ?? 0, group.fanTrust), peakReputation: Math.max(previousRecords.peakReputation ?? 0, group.reputation), largestRoster: Math.max(previousRecords.largestRoster ?? 0, members.filter((member) => ['active', 'trainee'].includes(member.status)).length), lowestEligibleRoster: Math.min(previousRecords.lowestEligibleRoster ?? eligibleCount, eligibleCount), theaterShows: (previousRecords.theaterShows ?? 0) + theaterShows, singlesReleased: (previousRecords.singlesReleased ?? 0) + completedSingles, videoCallTickets: (previousRecords.videoCallTickets ?? 0) + Math.round(finances.videoCall / BALANCE.activities.vc1.ticket), meetGreetTickets: (previousRecords.meetGreetTickets ?? 0) + Math.round(finances.meetGreet / BALANCE.activities.mg1.ticket), largestConcert: Math.max(previousRecords.largestConcert ?? 0, concertEvaluation?.attendance ?? 0), bestConcertOccupancy: Math.max(previousRecords.bestConcertOccupancy ?? 0, concertEvaluation?.occupancy ?? 0), dramaSuspensions: previousRecords.dramaSuspensions ?? 0, moneyEarned: (previousRecords.moneyEarned ?? 0) + Math.max(0, moneyDelta), moneySpent: (previousRecords.moneySpent ?? 0) + Math.max(0, -moneyDelta) };
  const previousCampaignStatus = state.campaign?.status;
  let campaignResult = advanceCampaign({ ...state, campaign: state.campaign ?? null, nextCampaignConfig: state.nextCampaignConfig ?? null, campaignHistory: state.campaignHistory ?? [], concerts }, { year, week, members, group, rng });
  if (campaignResult.revenue) {
    moneyDelta += campaignResult.revenue;
    finances.campaign += campaignResult.revenue;
  }
  const rewardConcertResult = campaignRewardConcert({ state: { ...state, money: state.money + moneyDelta }, campaign: campaignResult.campaign, members, concerts, yearEndMeetGreets, singles, availableMoney: state.money + moneyDelta });
  if (rewardConcertResult.concert) {
    concerts = [...concerts, rewardConcertResult.concert];
    moneyDelta -= rewardConcertResult.upfrontCost;
    finances.activityCosts += rewardConcertResult.upfrontCost;
    campaignResult = { ...campaignResult, campaign: rewardConcertResult.campaign };
    history.unshift({ id: rewardConcertResult.concert.id, type: 'concert', campaignId: rewardConcertResult.concert.campaignId, title: `${rewardConcertResult.concert.title} announced`, detail: `${rewardConcertResult.concert.memberIds.length} campaign performers · ${rewardConcertResult.concert.budgetName} · ${rewardConcertResult.concert.venueName}.`, year, week });
    notifications.push({ type: 'success', text: `${rewardConcertResult.concert.title} scheduled for Week ${rewardConcertResult.concert.targetWeek}.` });
  } else if (rewardConcertResult.campaign?.status === 'concert-pending' && rewardConcertResult.campaign.rewardConcertStatus === 'budget-pending') {
    campaignResult = { ...campaignResult, campaign: rewardConcertResult.campaign };
    notifications.push({ type: 'critical', text: 'Campaign result concert is waiting for the configured concert budget.' });
  }
  const mvBudget = campaignResult.campaign?.status === 'mv-production' ? SINGLE_BUDGETS.find((option) => option.id === campaignResult.campaign.mvBudgetId) ?? SINGLE_BUDGETS.find((option) => option.id === 'medium') : null;
  const sskHasUnderGirlsMv = campaignResult.campaign?.type === 'sousenkyo'
    && (campaignResult.campaign.result?.undergirls?.length ?? 0) >= 12;
  const mvProjectCount = sskHasUnderGirlsMv ? 2 : 1;
  const mvProductionCost = mvBudget ? applyRate(mvBudget.cost, bonusValue(state, 'B005')) * mvProjectCount : 0;
  if (campaignResult.campaign?.status === 'mv-production' && previousCampaignStatus !== 'mv-production' && mvProductionCost > state.money + moneyDelta) {
    campaignResult = { ...campaignResult, campaign: { ...campaignResult.campaign, status: 'mv-budget-pending', mvProjectId: null, mvBudgetCost: mvProductionCost } };
    notifications.push({ type: 'critical', text: 'Campaign MV is waiting for the configured production budget.' });
  } else if (campaignResult.campaign?.status === 'mv-production' && mvBudget) {
    campaignResult = { ...campaignResult, campaign: { ...campaignResult.campaign, mvBudgetCost: mvProductionCost } };
    if (previousCampaignStatus !== 'mv-production') {
      moneyDelta -= mvProductionCost;
      finances.activityCosts += mvProductionCost;
    }
  }
  campaignResult.events.forEach((event) => {
    const title = event.type === 'campaign-result' ? `${event.campaignType} result announced` : event.type === 'campaign-complete' ? `${event.campaignType} campaign completed` : event.title;
    const detail = event.type === 'campaign-result' ? 'Live campaign standings are locked into the history record.' : event.detail ?? 'Campaign lifecycle updated.';
    notifications.push({ type: 'success', text: title });
    history.push({ id: `campaign-${state.rngStep}-${event.type}`, type: 'campaign', campaignType: event.campaignType ?? campaignResult.campaign?.type, title, detail, year, week });
  });
  const campaignUnderGirlsExpected = campaignResult.campaign?.type === 'sousenkyo'
    && (campaignResult.campaign.result?.undergirls?.length ?? 0) >= 12;
  const campaignUnderGirlsProjectId = campaignUnderGirlsExpected
    ? (campaignResult.campaign.underGirlsMvProjectId ?? `mv-campaign-${campaignResult.campaign.id}-undergirls`)
    : null;
  const campaignHasMissingMv = campaignResult.campaign?.mvProjectId && (!singles.some((single) => single.id === campaignResult.campaign.mvProjectId)
    || (campaignUnderGirlsProjectId && !singles.some((single) => single.id === campaignUnderGirlsProjectId)));
  const campaignMv = campaignResult.campaign?.status === 'mv-production'
    && campaignResult.campaign.mvProjectId
    && (previousCampaignStatus !== 'mv-production' || campaignHasMissingMv);
  if (campaignMv && campaignHasMissingMv) {
    const campaign = campaignResult.campaign;
    const result = campaign.result ?? {};
    const eligible = members.filter((member) => ['active', 'trainee'].includes(member.status) && !member.temporarilyUnavailable);
    const centerId = result.centerMemberId ?? result.winnerMemberId ?? [...eligible].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0]?.id ?? null;
    const preferredIds = campaign.type === 'sousenkyo'
      ? (result.senbatsu ?? [])
      : campaign.type === 'janken'
        ? [result.winnerMemberId]
        : [];
    const lineupIds = [centerId, ...preferredIds, ...eligible.sort((a, b) => (b.performance ?? 0) - (a.performance ?? 0)).map((member) => member.id)]
      .filter((memberId, index, ids) => memberId && ids.indexOf(memberId) === index && eligible.some((member) => member.id === memberId))
      .slice(0, 12);
    const song = dreamSetlistSongs.find((item) => item.id === campaign.rewardSongId);
    const campaignProductionDay = campaignMvProductionDay({ state, campaign, concerts, yearEndMeetGreets, singles });
    const underGirlsIds = campaign.type === 'sousenkyo'
      ? [...new Set((result.undergirls ?? []).filter((memberId) => eligible.some((member) => member.id === memberId)))].slice(0, 12)
      : [];
    const underGirlsProjectId = underGirlsIds.length === 12 ? (campaign.underGirlsMvProjectId ?? `mv-campaign-${campaign.id}-undergirls`) : null;
    const underGirlsSongId = result.underGirlsSongId
      ?? campaign.underGirlsSongId
      ?? dreamSetlistSongs.find((item) => item.id !== campaign.rewardSongId)?.id
      ?? null;
    const underGirlsSong = dreamSetlistSongs.find((item) => item.id === underGirlsSongId);
    const singleProductionCost = mvProductionCost / mvProjectCount;
    const buildCampaignMv = ({ id, title, songId, center, memberIds }) => {
      const lineupMembers = memberIds.map((memberId) => eligible.find((member) => member.id === memberId)).filter(Boolean);
      const lineupPerformance = lineupMembers.reduce((sum, member) => sum + (member.performance ?? 0), 0) / Math.max(1, lineupMembers.length);
      return {
        id, title, songId, centerId: center ?? memberIds[0] ?? null, memberIds, productionDay: campaignProductionDay,
        productionCost: singleProductionCost, budgetId: mvBudget?.id ?? 'medium', budgetName: mvBudget?.name ?? 'Medium budget',
        popularityGain: mvBudget?.popularityGain ?? 3, fanTrustGain: mvBudget?.fanTrustGain ?? 1,
        productionQuality: clamp(Math.round((mvBudget?.quality ?? 74) * 0.75 + lineupPerformance * 0.25)), qualityRoll: 0, qualityFloorBonus: 0,
        year, week, status: 'production', progressWeeks: 0, durationWeeks: campaign.mvProductionDurationWeeks ?? 4, campaignId: campaign.id, campaignType: campaign.type,
      };
    };
    const mainMv = buildCampaignMv({ id: campaign.mvProjectId, title: `${song?.title ?? campaign.type.replace('-', ' ')} MV`, songId: campaign.rewardSongId, center: centerId ?? lineupIds[0], memberIds: lineupIds });
    const underGirlsMv = underGirlsProjectId && underGirlsSong
      ? buildCampaignMv({ id: underGirlsProjectId, title: `${underGirlsSong.title} · Under Girls MV`, songId: underGirlsSong.id, center: result.underGirlsCenterMemberId ?? underGirlsIds[0], memberIds: underGirlsIds })
      : null;
    const newCampaignMvs = [mainMv, underGirlsMv].filter((single) => single && !singles.some((existing) => existing.id === single.id));
    singles = [...singles, ...newCampaignMvs];
    campaignResult = { ...campaignResult, campaign: { ...campaign, underGirlsSongId: underGirlsSong?.id ?? null, underGirlsMvProjectId: underGirlsMv?.id ?? campaign.underGirlsMvProjectId ?? null } };
    newCampaignMvs.forEach((single) => history.unshift({ id: `${single.id}-start`, type: 'single', campaignId: campaign.id, title: `${single.title} production started`, detail: `The ${campaign.mvBudgetId ?? 'medium'} campaign production budget enters the existing four-week MV production pipeline.`, year, week }));
  }
  const nextMoney = state.money + moneyDelta;
  const previousFailures = state.failureCounters ?? {};
  const failureCounters = { negativeCashWeeks: nextMoney < 0 ? (previousFailures.negativeCashWeeks ?? 0) + 1 : 0, lowTrustWeeks: group.fanTrust < 5 ? (previousFailures.lowTrustWeeks ?? 0) + 1 : 0, lowReputationWeeks: group.reputation < 5 ? (previousFailures.lowReputationWeeks ?? 0) + 1 : 0, lowFanbaseWeeks: group.fanbase < 20_000 ? (previousFailures.lowFanbaseWeeks ?? 0) + 1 : 0 };
  const failureReason = eligibleCount < BALANCE.theaterMinimumMembers ? 'THEATER ROSTER FAILURE' : salaryDefault ? 'SALARY DEFAULT' : failureCounters.negativeCashWeeks >= 4 ? 'SUSTAINED BANKRUPTCY' : failureCounters.lowTrustWeeks >= 4 ? 'FAN TRUST COLLAPSE' : failureCounters.lowReputationWeeks >= 4 ? 'REPUTATION COLLAPSE' : failureCounters.lowFanbaseWeeks >= 8 ? 'FANBASE COLLAPSE' : null;
  const ended = Boolean(failureReason);
  const skillChanges = members.flatMap((member) => {
    const previous = state.members.find((item) => item.id === member.id);
    return previous ? SKILLS.filter((skill) => member[skill] !== previous[skill]).map((skill) => ({ memberId: member.id, memberName: member.nickname || member.name, skill, before: previous[skill], after: member[skill], delta: Math.round((member[skill] - previous[skill]) * 10) / 10 })) : [];
  });
  const completedTrainingSessions = trainingSessionRecords.filter((session) => session.status === 'completed');
  const trainingDayKeys = new Set(completedTrainingSessions.filter((session) => session.day).map((session) => `${session.memberId}:${session.day}`));
  const reportSchedule = Object.fromEntries(Object.entries(weekSchedule).filter(([key, activityId]) => activityId !== 'rest' || !trainingDayKeys.has(key)));
  const singleViewChanges = singles.filter((single) => (single.views ?? 0) > (state.singles.find((item) => item.id === single.id)?.views ?? 0)).map((single) => ({ singleId: single.id, title: single.title, gain: single.weeklyViewGain, total: single.views, viewWeek: single.viewWeeks }));
  const lastResult = {
    year: state.year,
    week: state.week,
    moneyDelta,
    fanGain,
    baseFanGain,
    fanGrowthMultiplier: weeklyFanCapMultiplier,
    fanTargetPerformance: protectedAnnualFanPerformance,
    activities: Object.keys(reportSchedule).length + completedTrainingSessions.length,
    schedule: reportSchedule,
    trainingSessions: trainingSessionRecords,
    skillChanges,
    singleViewChanges,
    promotions: promotionResult.promotions,
    completedMentorships,
    concertSummary,
    yearEndMeetGreetSummary,
    campaign: campaignResult.campaign ? { id: campaignResult.campaign.id, type: campaignResult.campaign.type, status: campaignResult.campaign.status, held: campaignResult.campaign.held !== false, currentWeek: campaignResult.campaign.currentWeek ?? week, startWeek: campaignResult.campaign.startWeek, durationWeeks: campaignResult.campaign.durationWeeks, concertBudgetId: campaignResult.campaign.concertBudgetId, concertVenueId: campaignResult.campaign.concertVenueId, mvBudgetId: campaignResult.campaign.mvBudgetId, rewardConcertId: campaignResult.campaign.rewardConcertId ?? null, rewardConcertYear: campaignResult.campaign.rewardConcertYear ?? null, rewardConcertWeek: campaignResult.campaign.rewardConcertWeek ?? null, totalVotes: campaignResult.campaign.totalVotes ?? 0, votingRevenue: campaignResult.campaign.votingRevenue ?? 0, rewardSongId: campaignResult.campaign.rewardSongId ?? null, underGirlsSongId: campaignResult.campaign.underGirlsSongId ?? campaignResult.campaign.result?.underGirlsSongId ?? null, mvProjectId: campaignResult.campaign.mvProjectId ?? null, underGirlsMvProjectId: campaignResult.campaign.underGirlsMvProjectId ?? null, result: campaignResult.campaign.result ?? null } : null,
    statistics: {
      before: { money: state.money, fanbase: state.group.fanbase, popularity: state.group.popularity, fanTrust: state.group.fanTrust, reputation: state.group.reputation },
      after: { money: nextMoney, fanbase: group.fanbase, popularity: group.popularity, fanTrust: group.fanTrust, reputation: group.reputation },
      roster: { total: members.length, active: members.filter((member) => ['active', 'trainee'].includes(member.status)).length, eligible: eligibleCount, trainees: members.filter((member) => member.status === 'trainee').length, graduated: graduations.filter((item) => item.completed).length },
      dramaSuspensions: records.dramaSuspensions ?? 0,
      graduations: graduations.filter((item) => item.completed).length,
    },
    finances: { ...finances, totalIncome: finances.theater + finances.videoCall + finances.meetGreet + finances.media + finances.offAir + finances.liveStream + finances.concert + finances.twoShot + finances.campaign + finances.otherIncome, totalExpenses: finances.activityCosts + finances.refunds + finances.generalOperations + finances.theaterUpkeep + finances.salary + finances.debtPayments + finances.loanPayment },
  };
  const annualReviews = state.week === BALANCE.weeksPerYear ? [...(state.annualReviews ?? []).filter((review) => review.year !== state.year), createAnnualReview(state, { group, members, lastResult, concerts, auditions, fanTargetPerformance: protectedAnnualFanPerformance, fanTarget: currentFanTarget })] : (state.annualReviews ?? []);
  const resolvedTheaterShows = [...validTheaterDays].map((day) => {
    const configured = state.theaterShows?.[day];
    const setlist = SETLIST_BY_ID[configured?.setlistId] ?? SETLISTS[0];
    const lineup = members.filter((member) => weekSchedule[`${member.id}:${day}`] === 'theater');
    const center = lineup.find((member) => member.id === configured?.centerId) ?? lineup.toSorted((a, b) => b.performance - a.performance)[0];
    const validSeitansaiMember = lineup.find((member) => member.id === configured?.seitansaiMemberId);
    return { id: `theater-${state.year}-${state.week}-${day}`, year: state.year, week: state.week, day, setlistId: setlist.id, setlistTitle: setlist.title, centerId: center?.id, centerName: center?.nickname || center?.name, memberIds: lineup.map((member) => member.id), songs: setlist.songs, isSeitansai: Boolean(configured?.isSeitansai && validSeitansaiMember), seitansaiMemberId: validSeitansaiMember?.id ?? null, isLastShow: Boolean(configured?.isLastShow), lastShowMemberId: configured?.lastShowMemberId ?? null, twoShot: twoShotRecords.find((record) => record.type === 'twoShotRoulette' && record.day === day) ?? null, ...theaterEconomics[day] };
  });
  lastResult.theaterShows = resolvedTheaterShows;
  const weeklyReports = [...(state.weeklyReports ?? []), lastResult];
  const nextConcertVenueOffers = year !== state.year ? generateConcertVenueOffers(state.seed, year, hasBonus(state, 'B007') ? bonusValue(state, 'B007') : 0) : state.concertVenueOffers;
  const chemistry = ensureChemistry(state, members);
  const fanTargetHistory = state.week === BALANCE.weeksPerYear ? [...(state.fanTargetHistory ?? []), { ...currentFanTarget, actualFanbase: group.fanbase, ...protectedAnnualFanPerformance }] : (state.fanTargetHistory ?? []);
  const fanTarget = state.week === BALANCE.weeksPerYear ? createAnnualFanTarget(year, currentFanTarget.targetFanbase, group.fanbase) : currentFanTarget;
  const fanTargetMetaReward = (state.fanTargetMetaReward ?? 0) + (annualFanPerformance?.metaReward ?? 0);
  if (annualFanPerformance) {
    history.unshift({ id: `fan-target-${state.year}`, type: 'year', title: `Year ${state.year} fan target: ${annualFanPerformance.label}`, detail: `${group.fanbase.toLocaleString()} fans against a ${currentFanTarget.targetFanbase.toLocaleString()} target (${annualFanPerformance.achievementPercent}%). Next target: ${fanTarget.targetFanbase.toLocaleString()}.`, year: state.year, week: state.week });
    notifications.push({ type: annualFanPerformance.ratio >= 1 ? 'success' : 'critical', text: `Annual fan result: ${annualFanPerformance.label} (${annualFanPerformance.achievementPercent}%).` });
  }
  let pendingOpportunity = state.pendingOpportunity ?? null;
  let opportunityHistory = state.opportunityHistory ?? [];
  if (pendingOpportunity && nextAbsolute > pendingOpportunity.deadlineAbsolute) {
    opportunityHistory = [...opportunityHistory, { ...pendingOpportunity, accepted: false, expired: true, resolvedYear: year, resolvedWeek: week }];
    notifications.push({ type: 'critical', text: `${pendingOpportunity.title} opportunity expired.` });
    pendingOpportunity = null;
  }
  if (!pendingOpportunity && !ended && rng() < 0.24) {
    const template = OPPORTUNITIES[randomInt(rng, 0, OPPORTUNITIES.length - 1)];
    const eligible = members.filter((member) => member.status === 'active').sort((a, b) => template.category === 'media' ? b.variety - a.variety : b.performance - a.performance);
    const memberIds = eligible.slice(0, Math.min(template.memberCount, eligible.length)).map((member) => member.id);
    pendingOpportunity = { ...template, id: `opportunity-${template.id}-${year}-${week}-${state.rngStep}`, offeredYear: year, offeredWeek: week, deadlineAbsolute: nextAbsolute + 2, memberIds };
    notifications.push({ type: 'success', text: `New opportunity: ${template.title}. Respond within two weeks.` });
  }
  const next = {
    ...state, year, week, members, unsignedMembers, singles, concerts, yearEndMeetGreets, auditions, auditionCampaign, mentorships, mentorshipHistory, chemistry, promotions, annualReviews, fanTarget, fanTargetHistory, fanTargetMetaReward, demandHistory: [...(state.demandHistory ?? []), ...weeklyDemandRecords].slice(-1000), pendingOpportunity, opportunityHistory, group, money: nextMoney, schedule: nextSchedule, trainingPlans: {}, theaterShows: {}, theaterHistory: [...(state.theaterHistory ?? []), ...resolvedTheaterShows].slice(-250), activityEvents: activityEvents.slice(-500), history: history.slice(0, 1000),
    notifications, activeDrama, activeManagementDrama, dramaMemory, dramaCooldown: memberDramaCooldown, memberDramaCooldown, managementDramaCooldown, campaign: campaignResult.campaign, nextCampaignConfig: campaignResult.nextCampaignConfig, campaignHistory: campaignResult.campaignHistory, fanNarratives, graduations, graduationTargets, departures, seitansaiObligations, records, failureCounters, weeklyReports, concertVenueOffers: nextConcertVenueOffers, ledger: resolvedLedger, loans: resolvedLoans, loanOffers: year !== state.year ? generateLoanOffers(state.seed, year) : state.loanOffers, fanEventPlans: (state.fanEventPlans ?? []).filter((plan) => !activatedPlans.includes(plan)), runStatus: ended ? 'ended' : 'active', rngStep: state.rngStep + 1,
    lastResult,
  };
  return ended ? { ...next, runEndedAt: { year, week }, runSummary: { ...makeRunSummary(next, members, eligibleCount, records), cause: failureReason } } : next;
}

export function startAuditionCampaign(state, startWeek = state.week) {
  if (state.runStatus === 'ended') return state;
  const auditionCost = applyRate(65_000_000, bonusValue(state, 'B021'));
  if (startWeek < BALANCE.auditionStartWeek || startWeek > BALANCE.weeksPerYear || state.money < auditionCost || state.auditionCampaign?.status === 'active' || state.auditions.some((item) => item.year === state.year)) return state;
  const rng = createRng(hashSeed(`${state.seed}:audition-campaign:${state.year}:${startWeek}`));
  const rosterIdentityIds = new Set(state.members.map((member) => member.identityId ?? member.id));
  const availablePool = shuffleWithRng((state.unsignedMembers ?? []).filter((member) => !rosterIdentityIds.has(member.identityId ?? member.id)), rng);
  if (availablePool.length < AUDITION_CANDIDATE_COUNT) return state;
  const managementScore = state.group.fanTrust * 0.55 + state.group.reputation * 0.45;
  const maxIntake = AUDITION_MAX_INTAKE;
  const finalistBonus = bonusValue(state, 'B019');
  const applicantBonus = bonusValue(state, 'B022');
  const applicantPoolSize = Math.min(availablePool.length, Math.max(AUDITION_CANDIDATE_COUNT, Math.ceil((AUDITION_CANDIDATE_COUNT + finalistBonus) * (1 + applicantBonus))));
  const scoutingBonus = bonusValue(state, 'B020');
  const qualityBonus = Math.round((managementScore - 50) * 0.08 + scoutingBonus * 10);
  const candidatePool = availablePool.slice(0, applicantPoolSize)
    .map((member) => makePoolCandidate(member, Math.min(AUDITION_CANDIDATE_COUNT, availablePool.length), qualityBonus))
    .sort((first, second) => (second.potential + second.development + second.performance) - (first.potential + first.development + first.performance) || first.id.localeCompare(second.id))
    .slice(0, AUDITION_CANDIDATE_COUNT);
  const campaign = { id: `audition-campaign-${state.year}-${startWeek}`, year: state.year, startYear: state.year, startWeek, phase: 'applications', progressWeeks: 0, durationWeeks: 5, maxIntake, finalistPoolSize: candidatePool.length, applicantPoolSize, candidatePool, selectedCandidateIds: [], selectionConfirmed: false, cost: auditionCost, scoutingAccuracy: 1 + scoutingBonus, status: 'active' };
  return { ...state, money: state.money - auditionCost, auditionCampaign: campaign, history: [{ id: campaign.id, type: 'audition', title: 'Audition opens', detail: `Applications begin in Week ${startWeek}. Final selection completes after five weeks.`, year: state.year, week: state.week }, ...state.history] };
}

export function finalizeAudition(state, selectedCandidateIds = []) {
  const campaign = state.auditionCampaign;
  if (!campaign || campaign.status !== 'active' || campaign.progressWeeks < 4) return state;
  const validIds = [...new Set(selectedCandidateIds)].filter((id) => campaign.candidatePool.some((candidate) => candidate.id === id)).slice(0, campaign.maxIntake);
  return { ...state, auditionCampaign: { ...campaign, selectedCandidateIds: validIds, selectionConfirmed: true } };
}

export function runAudition(state) {
  if (state.runStatus === 'ended') return state;
  const auditionCost = applyRate(65_000_000, bonusValue(state, 'B021'));
  if (state.week < BALANCE.auditionStartWeek || state.money < auditionCost || state.auditions.some((item) => item.year === state.year)) return state;
  const rng = createRng(hashSeed(`${state.seed}:audition:${state.year}`));
  const rosterIdentityIds = new Set(state.members.map((member) => member.identityId ?? member.id));
  const availablePool = shuffleWithRng((state.unsignedMembers ?? []).filter((member) => !rosterIdentityIds.has(member.identityId ?? member.id)), rng);
  if (availablePool.length < AUDITION_CANDIDATE_COUNT) return state;
  const cap = AUDITION_MAX_INTAKE;
  const finalistPoolSize = AUDITION_CANDIDATE_COUNT;
  const candidates = availablePool.slice(0, cap).map((member) => ({ ...makePoolCandidate(member, finalistPoolSize), joinedYear: state.year, joinedWeek: state.week }));
  const selectedPoolIds = new Set(candidates.map((candidate) => candidate.sourcePoolId));
  return { ...state, members: [...state.members, ...candidates.map(({ candidateId, sourcePoolId, ...candidate }) => ({ ...candidate, id: candidateId }))], unsignedMembers: availablePool.filter((member) => !selectedPoolIds.has(member.id)), money: state.money - auditionCost, auditions: [...state.auditions, { year: state.year, size: candidates.length, finalistPoolSize }], history: [{ id: `audition-${state.year}`, type: 'audition', title: `Generation ${candidates[0]?.generation.replace('GEN ', '')} selected`, detail: `${candidates.length} trainees join from ${finalistPoolSize} finalists after the Q4 audition.`, year: state.year, week: state.week }, ...state.history] };
}
