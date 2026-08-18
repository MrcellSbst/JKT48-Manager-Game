import { memberData } from '../data/newmemberdata.js';
import { BALANCE, DAYS } from '../data/balance.js';
import dreamSetlistSongs from '../data/DreamSetlist_Songs.js';
import { BONUS_BY_ID } from '../data/bonusTemplates.js';
import { createRng, hashSeed, randomInt, weightedPick } from './rng.js';

const ARCHETYPES = ['Performer', 'Vocalist', 'Entertainer', 'All-Rounder', 'Specialist', 'Raw Prospect', 'Prodigy', 'Late Bloomer'];
const TRAITS = ['Quick Learner', 'Big Stage Performer', 'Theater Specialist', 'Reliable Performer', 'Versatile', 'Crowd Magnet'];
const SKILLS = ['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina'];

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const moneyText = (value) => `Rp ${value.toLocaleString('id-ID')}`;
const hasBonus = (state, id) => (state.bonusLoadout ?? []).includes(id);
const bonusValue = (state, id) => hasBonus(state, id) ? BONUS_BY_ID[id].value : 0;
const applyRate = (value, rate) => Math.round(value * (1 + rate));

export function getTheaterEligibleMembers(state) {
  return (state.members ?? []).filter((member) => ['active', 'trainee'].includes(member.status) && member.canPerformTheater !== false && !member.temporarilyUnavailable && (member.suspensionWeeks ?? 0) === 0);
}

export function getRosterDanger(count) {
  if (count >= 23) return 'COMFORTABLE';
  if (count >= 18) return 'STABLE';
  if (count >= 15) return 'THIN';
  if (count >= 13) return 'DANGER';
  if (count === 12) return 'CRITICAL';
  return 'THEATER CANNOT OPERATE';
}

function makeStats(rng, archetype) {
  const stats = Object.fromEntries(SKILLS.map((key) => [key, randomInt(rng, 38, 82)]));
  const boost = {
    Performer: ['dance', 'performance'], Vocalist: ['vocal'], Entertainer: ['mc', 'variety'],
    'All-Rounder': SKILLS, Specialist: [SKILLS[randomInt(rng, 0, SKILLS.length - 1)]],
    'Raw Prospect': [], Prodigy: ['vocal', 'dance', 'performance'], 'Late Bloomer': [],
  }[archetype];
  boost.forEach((key) => { stats[key] = clamp(stats[key] + randomInt(rng, 8, 18)); });
  return stats;
}

const roundTo = (value, step) => Math.round(value / step) * step;

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

export function getActiveRoster() {
  return Object.entries(memberData).flatMap(([generation, members]) =>
    generation.toUpperCase().startsWith('JKT48V')
      ? []
      : members.filter((member) => !member.graduated).map((member) => ({ ...member, generation })));
}

export function createGame(seed = `JKT48-${Math.random().toString(36).slice(2, 12).toUpperCase()}`) {
  const rng = createRng(hashSeed(seed));
  const members = getActiveRoster().map((identity, index) => {
    const archetype = ARCHETYPES[randomInt(rng, 0, ARCHETYPES.length - 1)];
    const stats = makeStats(rng, archetype);
    return {
      id: `${slug(identity.name)}-${index}`,
      ...identity,
      archetype,
      traits: [TRAITS[randomInt(rng, 0, TRAITS.length - 1)]],
      ...stats,
      popularity: randomInt(rng, 30, 76),
      energy: 100,
      ego: randomInt(rng, 0, 100),
      potential: randomInt(rng, 62, 98),
      development: randomInt(rng, 35, 92),
      fanbase: randomInt(rng, 1800, 12000),
      momentum: 0,
      status: 'active',
      careerStage: ['Early', 'Established', 'Veteran'][randomInt(rng, 0, 2)],
      joinedYear: 0,
      joinedWeek: 1,
      canPerformTheater: true,
      suspensionWeeks: 0,
      appearances: { theater: 0, center: 0, media: 0 },
    };
  });
  return {
    version: 1,
    calendarWeeks: BALANCE.weeksPerYear,
    seed,
    managementName: '',
    rngStep: 1,
    year: 1,
    week: 1,
    money: BALANCE.startingMoney,
    theaterOffers: generateTheaterOffers(seed),
    group: { fanbase: 125000, popularity: 48, fanTrust: 58, reputation: 52, publicAwareness: 44 },
    members,
    schedule: {},
    history: [{ id: 'start', type: 'system', title: 'Alternate timeline begins', detail: `${members.length} active members enter Year 1.`, year: 1, week: 1 }],
    notifications: [],
    singles: [], concerts: [], auditions: [], graduations: [], renovations: [], scheduleTemplates: [], fanNarratives: [],
    activeDrama: null,
    dramaCooldown: 0,
    lastResult: null,
    runStatus: 'setup',
    records: { peakFanbase: 125000, peakFanTrust: 58, peakReputation: 52, largestRoster: members.length, lowestEligibleRoster: members.length, theaterShows: 0, dramaSuspensions: 0, moneyEarned: 0, moneySpent: 0 },
  };
}

export function finalizeGameSetup(state, theaterId, memberIds, managementName = 'JKT48 Management', bonusLoadout = []) {
  const theater = state.theaterOffers?.find((item) => item.id === theaterId);
  const uniqueIds = new Set(memberIds);
  const normalizedManagementName = managementName.trim();
  if (!normalizedManagementName || normalizedManagementName.length > 40) throw new Error('Enter a management name up to 40 characters.');
  if (bonusLoadout.length > BALANCE.bonusSlots || new Set(bonusLoadout).size !== bonusLoadout.length || bonusLoadout.some((id) => !BONUS_BY_ID[id])) throw new Error(`Choose up to ${BALANCE.bonusSlots} unique bonuses.`);
  if (!theater) throw new Error('Choose a theater.');
  if (uniqueIds.size !== 12) throw new Error('Choose exactly 12 founding members.');
  const purchasePrice = applyRate(theater.price, bonusLoadout.includes('B001') ? BONUS_BY_ID.B001.value : 0);
  if (state.money < purchasePrice) throw new Error('Not enough money for this theater.');
  const members = state.members.filter((member) => uniqueIds.has(member.id));
  if (members.length !== 12) throw new Error('Founding lineup contains an unknown member.');
  const unsignedMembers = state.members.filter((member) => !uniqueIds.has(member.id));
  return {
    ...state,
    managementName: normalizedManagementName,
    bonusLoadout: [...bonusLoadout],
    runStatus: 'active',
    money: state.money - purchasePrice,
    theater: { ...theater, price: purchasePrice, weeklyUpkeep: applyRate(theater.weeklyUpkeep, bonusLoadout.includes('B002') ? BONUS_BY_ID.B002.value : 0), renovationLevel: 0 },
    members,
    unsignedMembers,
    history: [{
      id: 'founding-lineup', type: 'system', title: `${theater.name} opens`,
      detail: `${theater.capacity}-seat home purchased. Twelve founding members join the active roster.`, year: 1, week: 1,
    }],
  };
}

export function assignActivity(state, memberId, day, activityId) {
  if (state.runStatus === 'ended') return state;
  const member = state.members.find((item) => item.id === memberId);
  if (!member || !['active', 'trainee'].includes(member.status)) return state;
  const key = `${memberId}:${day}`;
  const schedule = { ...state.schedule };
  const currentActivity = schedule[key];
  if (currentActivity === 'mvProduction' || currentActivity === 'concert') return state;
  const month = Math.ceil(state.week / BALANCE.weeksPerMonth);
  const events = state.activityEvents ?? [];
  const eligibleMembers = state.members.filter((item) => ['active', 'trainee'].includes(item.status) && (item.suspensionWeeks ?? 0) === 0);
  if (activityId === 'clear' && (currentActivity === 'concert' || currentActivity?.startsWith('mg'))) {
    eligibleMembers.forEach((item) => { if (schedule[`${item.id}:${day}`] === currentActivity) delete schedule[`${item.id}:${day}`]; });
    return { ...state, schedule };
  }
  if (currentActivity && (currentActivity === 'concert' || currentActivity.startsWith('mg')) && activityId !== currentActivity) {
    eligibleMembers.forEach((item) => { if (schedule[`${item.id}:${day}`] === currentActivity) delete schedule[`${item.id}:${day}`]; });
  }
  if (activityId === 'concert' || activityId.startsWith('mg')) {
    const type = activityId === 'concert' ? 'concert' : 'meetGreet';
    const alreadyResolved = events.some((event) => event.type === type && event.year === state.year && event.month === month);
    const alreadyScheduled = Object.values(schedule).some((value) => type === 'concert' ? value === 'concert' : value.startsWith?.('mg'));
    const mvLocked = eligibleMembers.some((item) => schedule[`${item.id}:${day}`] === 'mvProduction');
    if (alreadyResolved || alreadyScheduled || mvLocked) return state;
    eligibleMembers.forEach((item) => { schedule[`${item.id}:${day}`] = activityId; });
    return { ...state, schedule };
  }
  if (activityId.startsWith('vc')) {
    const resolvedThisMonth = events.some((event) => event.type === 'videoCall' && event.memberId === memberId && event.year === state.year && event.month === month);
    const scheduledVideoCall = Object.entries(schedule).some(([scheduleKey, value]) => scheduleKey.startsWith(`${memberId}:`) && value.startsWith?.('vc'));
    if (resolvedThisMonth || scheduledVideoCall) return state;
  }
  if (activityId === 'theater' && schedule[key] !== 'theater') {
    const lineupSize = state.members.reduce((count, item) => count + (schedule[`${item.id}:${day}`] === 'theater' ? 1 : 0), 0);
    if (lineupSize >= 12) return state;
  }
  if (activityId === 'clear') delete schedule[key];
  else schedule[key] = activityId;
  return { ...state, schedule };
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

export function startSingleProduction(state, centerId, productionDay, selectedMemberIds = null) {
  if (state.runStatus === 'ended' || state.money < 85_000_000 || state.singles.some((single) => single.status === 'production')) return state;
  if (!DAYS.includes(productionDay)) return state;
  const eligible = state.members.filter((member) => ['active', 'trainee'].includes(member.status) && (member.suspensionWeeks ?? 0) === 0);
  const center = eligible.find((member) => member.id === centerId);
  if (!center || eligible.length < 12) return state;
  const score = (member) => member.vocal + member.dance + member.performance + member.mc + member.variety;
  const automaticIds = [center, ...eligible.filter((member) => member.id !== centerId).sort((a, b) => score(b) - score(a))].slice(0, 12).map((member) => member.id);
  const requestedIds = eligible.length === 12 ? automaticIds : selectedMemberIds ? [centerId, ...selectedMemberIds.filter((memberId) => memberId !== centerId)] : automaticIds;
  const memberIds = [...new Set(requestedIds)];
  if (memberIds.length !== 12 || memberIds.some((memberId) => !eligible.some((member) => member.id === memberId))) return state;
  if (memberIds.some((memberId) => state.schedule[`${memberId}:${productionDay}`])) return state;
  const schedule = { ...state.schedule };
  memberIds.forEach((memberId) => { schedule[`${memberId}:${productionDay}`] = 'mvProduction'; });
  const single = { id: `single-${state.year}-${state.singles.length + 1}`, title: `Single ${state.singles.length + 1}`, centerId, memberIds, productionDay, week: state.week, year: state.year, status: 'production', progressWeeks: 0, durationWeeks: 4 };
  return { ...state, money: state.money - 85_000_000, schedule, singles: [...state.singles, single], history: [{ id: `${single.id}-production`, type: 'single', title: `${single.title} enters production`, detail: `${center.nickname || center.name} leads a 12-member MV lineup every ${productionDay}. Production will take four weeks.`, year: state.year, week: state.week }, ...state.history] };
}

export function applyScheduleTemplate(state, template) {
  if (!template?.entries?.length || state.runStatus === 'ended') return state;
  let next = state;
  let skipped = 0;
  for (const entry of template.entries) {
    const member = next.members.find((item) => item.id === entry.memberId);
    if (!member || !['active', 'trainee'].includes(member.status) || (member.suspensionWeeks ?? 0) > 0) { skipped += 1; continue; }
    const before = next;
    next = assignActivity(next, entry.memberId, entry.day, entry.activityId);
    if (next === before && next.schedule[`${entry.memberId}:${entry.day}`] !== entry.activityId) skipped += 1;
  }
  const notification = skipped ? { type: 'critical', text: `${skipped} template assignment(s) skipped because members or dates were unavailable.` } : { type: 'success', text: `${template.name} assigned successfully.` };
  return { ...next, notifications: [notification, ...(next.notifications ?? [])].slice(0, 20) };
}

function createConcertSummary(rng, members, day) {
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
  return { day, songCount, songs };
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

function resolveMemberWeek(member, assignments, rng, theater, state) {
  let energy = member.energy;
  let money = 0;
  let fanGain = 0;
  let popularity = member.popularity;
  let momentum = member.momentum * 0.7;
  const finances = { theater: 0, videoCall: 0, meetGreet: 0, liveStream: 0, concert: 0, otherIncome: 0, activityCosts: 0 };
  const stats = { ...member };
  const appearances = { ...member.appearances };

  for (const activityId of assignments) {
    const activity = BALANCE.activities[activityId];
    if (!activity || (energy <= 0 && !activity.energyRecovery)) continue;
    const energyRate = (['theater', 'concert'].includes(activityId) ? bonusValue(state, 'B012') : 0) + (/^(mg|vc)/.test(activityId) ? bonusValue(state, 'B013') : 0);
    const fatigue = Math.round(activity.energy * (1.15 - member.stamina * 0.003) * (1 + energyRate));
    const performanceBand = energy >= 60 ? 1 : energy >= 40 ? 0.95 : energy >= 20 ? 0.85 : 0.7;
    const score = ((member.performance + member.dance + member.vocal) / 3) * performanceBand + randomInt(rng, -8, 8);
    energy = clamp(energy - fatigue + (activity.energyRecovery ?? 0));
    const activityCost = activity.cost ?? 0;
    const activityRevenue = activity.revenue ?? 0;
    money -= activityCost;
    money += activityRevenue;
    finances.activityCosts += activityCost;
    if (activityRevenue) finances[activityId === 'concert' ? 'concert' : 'otherIncome'] += activityRevenue;
    if (activityId === 'theater' && theater) {
      const theaterRevenue = Math.round((theater.capacity * theater.ticketPrice) / 12);
      money += theaterRevenue;
      finances.theater += theaterRevenue;
    }
    if (activity.skill) {
      const ceiling = Math.max(0.15, (member.potential - stats[activity.skill]) / 45);
      const traitBonus = member.traits.includes('Quick Learner') ? 1.2 : 1;
      const trainingRate = bonusValue(state, 'B015') + (member.status === 'trainee' ? bonusValue(state, 'B016') : 0);
      stats[activity.skill] = clamp(stats[activity.skill] + Math.max(0.2, ceiling * member.development / 100 * traitBonus * (1 + trainingRate)));
    }
    if (activityId === 'theater') {
      appearances.theater += 1;
      fanGain += Math.max(15, Math.round(score * 1.8 * (1 + bonusValue(state, 'B025'))));
      popularity += score >= 75 ? 1 : 0;
    }
    if (activityId === 'media') {
      appearances.media += 1;
      fanGain += Math.round(member.variety * 2.2);
      popularity += 1;
    }
    if (activityId === 'liveStream') {
      const streamRevenue = Math.round(member.popularity * activity.revenuePerPopularity);
      const streamFans = Math.round(member.popularity * activity.fansPerPopularity);
      money += streamRevenue;
      finances.liveStream += streamRevenue;
      fanGain += streamFans;
      momentum += 1;
    }
    if (activity.capacity) {
      const demand = Math.round(member.fanbase * (0.006 + member.popularity / 12000) * (0.9 + rng() * 0.3));
      const sold = Math.min(activity.capacity, demand);
      const ticketRevenue = sold * activity.ticket;
      money += ticketRevenue;
      if (activityId.startsWith('vc')) finances.videoCall += ticketRevenue;
      else if (activityId.startsWith('mg')) finances.meetGreet += ticketRevenue;
      else finances.otherIncome += ticketRevenue;
      fanGain += Math.round(sold * 0.12);
      momentum += sold / activity.capacity > 0.9 ? 2 : -1;
    }
    if (activityId.startsWith('mv')) {
      fanGain += Math.round(score * 12);
      popularity += activityId === 'mvCenter' ? 4 : 2;
    }
    if (activityId === 'concert') {
      fanGain += Math.round(score * 25);
      popularity += score >= 70 ? 3 : -1;
    }
  }
  return {
    member: { ...member, ...Object.fromEntries(SKILLS.map((key) => [key, Math.round(stats[key] * 10) / 10])), energy, popularity: clamp(popularity), momentum: clamp(momentum, -20, 20), fanbase: member.fanbase + fanGain, appearances },
    money,
    fanGain,
    finances,
  };
}

function scheduleGraduations(state, targetYear, currentWeek, members, rng) {
  const config = BALANCE.graduation;
  const existing = state.graduations ?? [];
  if (targetYear < 2) return existing;
  if ((currentWeek - 1) % BALANCE.weeksPerMonth !== 0) return existing;
  const eligible = members.filter((member) => {
    if (!['active', 'trainee'].includes(member.status) || member.graduationPending) return false;
    if (member.id.startsWith('trainee-')) return targetYear - (member.joinedYear ?? targetYear) >= config.generatedMinimumTenureYears;
    return targetYear >= (member.careerStage === 'Early' ? 3 : 2);
  });
  const budgetRng = createRng(hashSeed(`${state.seed}:graduation-budget:${targetYear}`));
  const maximum = Math.min(config.extremeMax, randomInt(budgetRng, config.normalMin, config.normalMax));
  const plannedThisYear = existing.filter((item) => item.planYear === targetYear).length;
  if (plannedThisYear >= maximum) return existing;
  const pendingCount = existing.filter((item) => !item.completed).length;
  const safeMaximum = Math.max(0, getTheaterEligibleMembers({ members }).length - BALANCE.theaterMinimumMembers - pendingCount);
  if (safeMaximum === 0 || eligible.length === 0) return existing;
  const currentMonth = Math.ceil(currentWeek / BALANCE.weeksPerMonth);
  const remainingBudget = maximum - plannedThisYear;
  const remainingMonths = 13 - currentMonth;
  if (rng() >= Math.min(1, remainingBudget / remainingMonths)) return existing;
  const member = eligible[randomInt(rng, 0, eligible.length - 1)];
  const lead = randomInt(rng, config.minLead, config.maxLead);
  const departureTotal = currentWeek + lead;
  const plan = { id: `graduation-${targetYear}-${currentMonth}-${member.id}`, memberId: member.id, memberName: member.nickname || member.name, planYear: targetYear, announcementYear: targetYear, announcementWeek: currentWeek, departureYear: departureTotal > BALANCE.weeksPerYear ? targetYear + 1 : targetYear, departureWeek: departureTotal > BALANCE.weeksPerYear ? departureTotal - BALANCE.weeksPerYear : departureTotal, announced: false, completed: false };
  return [...existing, plan];
}

function makeRunSummary(state, members, eligibleCount, records) {
  const active = members.filter((member) => ['active', 'trainee'].includes(member.status)).length;
  const reward = 5 + (state.year - 1) * 5 + Math.floor((state.week - 1) / 12) + Math.floor((records.peakFanTrust + records.peakReputation) / 40);
  return { yearsSurvived: state.year - 1, weeksSurvived: (state.year - 1) * BALANCE.weeksPerYear + state.week, theaterShows: records.theaterShows, largestRoster: records.largestRoster, lowestEligibleRoster: records.lowestEligibleRoster, membersRecruited: (state.auditions ?? []).reduce((sum, item) => sum + item.size, 0), graduations: (state.graduations ?? []).filter((item) => item.completed).length, dramaSuspensions: records.dramaSuspensions, concertsHeld: state.concerts.length, peakFanbase: records.peakFanbase, peakFanTrust: records.peakFanTrust, peakReputation: records.peakReputation, finalActiveRoster: active, finalEligibleRoster: eligibleCount, cause: 'THEATER ROSTER FAILURE', metaReward: reward };
}

export function endRun(state) {
  if (state.runStatus === 'ended') return state;
  const eligibleCount = getTheaterEligibleMembers(state).length;
  const records = state.records ?? { peakFanTrust: state.group.fanTrust, peakReputation: state.group.reputation, peakFanbase: state.group.fanbase, largestRoster: state.members.length, lowestEligibleRoster: eligibleCount, theaterShows: 0, dramaSuspensions: 0 };
  return { ...state, runStatus: 'ended', runEndedAt: { year: state.year, week: state.week }, runSummary: { ...makeRunSummary(state, state.members, eligibleCount, records), cause: 'RUN ENDED BY MANAGEMENT' } };
}

export function resolveWeek(state) {
  if (state.runStatus === 'ended') return state;
  const rng = createRng(hashSeed(`${state.seed}:${state.rngStep}`));
  let moneyDelta = -applyRate(18_000_000, bonusValue(state, 'B004')) - (state.theater?.weeklyUpkeep ?? 0);
  let fanGain = 0;
  const finances = { theater: 0, videoCall: 0, meetGreet: 0, liveStream: 0, concert: 0, otherIncome: 0, activityCosts: 0, generalOperations: applyRate(18_000_000, bonusValue(state, 'B004')), theaterUpkeep: state.theater?.weeklyUpkeep ?? 0 };
  const theaterLineups = Object.fromEntries(DAYS.map((day) => [day, state.members.reduce((count, member) => count + (state.schedule[`${member.id}:${day}`] === 'theater' ? 1 : 0), 0)]));
  const month = Math.ceil(state.week / BALANCE.weeksPerMonth);
  const scheduledEntries = Object.entries(state.schedule);
  const concertDay = DAYS.find((day) => scheduledEntries.some(([key, activity]) => key.endsWith(`:${day}`) && activity === 'concert'));
  const concertMembers = concertDay ? state.members.filter((member) => state.schedule[`${member.id}:${concertDay}`] === 'concert') : [];
  const concertSummary = concertDay && concertMembers.length ? createConcertSummary(rng, concertMembers, concertDay) : null;
  const activityEvents = [...(state.activityEvents ?? [])];
  if (scheduledEntries.some(([, activity]) => activity === 'concert')) activityEvents.push({ id: `concert-${state.year}-${state.week}`, type: 'concert', year: state.year, week: state.week, month });
  if (scheduledEntries.some(([, activity]) => activity.startsWith('mg'))) activityEvents.push({ id: `meet-greet-${state.year}-${state.week}`, type: 'meetGreet', year: state.year, week: state.week, month });
  scheduledEntries.filter(([, activity]) => activity.startsWith('vc')).forEach(([scheduleKey]) => activityEvents.push({ id: `video-call-${state.year}-${state.week}-${scheduleKey}`, type: 'videoCall', memberId: scheduleKey.split(':')[0], year: state.year, week: state.week, month }));
  const validTheaterDays = new Set(DAYS.filter((day) => theaterLineups[day] === 12));
  let members = state.members.map((member) => {
    if (member.suspensionWeeks > 0) {
      const left = member.suspensionWeeks - 1;
      return { ...member, suspensionWeeks: left, status: left === 0 ? 'active' : 'suspended', energy: left === 0 ? 100 : member.energy };
    }
    const assignments = DAYS.map((day) => {
      const assignment = state.schedule[`${member.id}:${day}`];
      return assignment === 'theater' && !validTheaterDays.has(day) ? null : assignment;
    }).filter(Boolean);
    const result = resolveMemberWeek(member, assignments, rng, state.theater, state);
    moneyDelta += result.money;
    fanGain += result.fanGain;
    Object.keys(result.finances).forEach((key) => { finances[key] += result.finances[key]; });
    return result.member;
  });

  let week = state.week + 1;
  let year = state.year;
  const history = [...state.history];
  const notifications = [];
  DAYS.filter((day) => theaterLineups[day] > 0 && theaterLineups[day] !== 12).forEach((day) => {
    notifications.push({ type: 'critical', text: `${day} theater show canceled: ${theaterLineups[day]}/12 members assigned.` });
  });
  let dramaCooldown = Math.max(0, state.dramaCooldown - 1);
  let activeDrama = members.some((member) => member.status === 'suspended') ? state.activeDrama : null;

  if (!activeDrama && state.activeDrama) {
    dramaCooldown = randomInt(rng, ...BALANCE.dramaCooldown);
    history.unshift({ id: `return-${state.rngStep}`, type: 'member', title: `${state.activeDrama.name} returns`, detail: `Returns fully rested. Drama cooldown: ${dramaCooldown} weeks.`, year, week: state.week });
  }
  if (year >= 2 && !activeDrama && dramaCooldown === 0 && rng() < BALANCE.dramaChance) {
    const eligible = members.filter((member) => member.status === 'active');
    if (eligible.length) {
      const selected = weightedPick(rng, eligible, (member) => 10 + member.ego * 0.8 + Math.max(0, member.momentum));
      members = members.map((member) => member.id === selected.id ? { ...member, status: 'suspended', suspensionWeeks: BALANCE.dramaDuration } : member);
      activeDrama = { memberId: selected.id, name: selected.nickname || selected.name, startedWeek: state.week };
      notifications.push({ type: 'critical', text: `${activeDrama.name} unavailable for four weeks.` });
      history.unshift({ id: `drama-${state.rngStep}`, type: 'drama', title: 'Schedule disruption', detail: `${activeDrama.name} becomes unavailable for four weeks.`, year, week: state.week });
    }
  }
  let graduations = scheduleGraduations(state, year, state.week, members, rng);
  graduations = graduations.map((graduation) => {
    if (!graduation.announced && graduation.announcementYear === year && graduation.announcementWeek === state.week) {
      notifications.push({ type: 'critical', text: `${graduation.memberName} announces graduation for Year ${graduation.departureYear}, Week ${graduation.departureWeek}.` });
      history.unshift({ id: `${graduation.id}-announcement`, type: 'member', title: `${graduation.memberName} announces graduation`, detail: `Final departure scheduled for Year ${graduation.departureYear}, Week ${graduation.departureWeek}.`, year, week: state.week });
      members = members.map((member) => member.id === graduation.memberId ? { ...member, graduationPending: true } : member);
      return { ...graduation, announced: true };
    }
    if (!graduation.completed && graduation.departureYear === year && graduation.departureWeek === state.week) {
      notifications.push({ type: 'critical', text: `${graduation.memberName} has graduated.` });
      history.unshift({ id: `${graduation.id}-departure`, type: 'member', title: `${graduation.memberName} graduates`, detail: 'The member leaves the active theater roster.', year, week: state.week });
      members = members.map((member) => member.id === graduation.memberId ? { ...member, status: 'graduated', theaterEligible: false, canPerformTheater: false, graduationPending: false } : member);
      return { ...graduation, completed: true };
    }
    return graduation;
  });
  if (rng() < 0.12) {
    const selected = members[randomInt(rng, 0, members.length - 1)];
    const gain = randomInt(rng, 1200, 8000);
    members = members.map((member) => member.id === selected.id ? { ...member, fanbase: member.fanbase + gain, popularity: clamp(member.popularity + randomInt(rng, 2, 7)), momentum: clamp(member.momentum + 5, -20, 20) } : member);
    fanGain += gain;
    notifications.push({ type: 'success', text: `${selected.nickname || selected.name} gains momentum from a viral clip.` });
    history.unshift({ id: `viral-${state.rngStep}`, type: 'viral', title: 'Viral moment', detail: `${selected.nickname || selected.name} gained ${gain.toLocaleString()} new fans.`, year, week: state.week });
  }
  if (week > BALANCE.weeksPerYear) {
    year += 1;
    week = 1;
    history.unshift({ id: `year-${year}`, type: 'year', title: `Year ${year} begins`, detail: 'New season. Roster recovery and annual review complete.', year, week: 1 });
  }
  members = members.map((member) => ['active', 'trainee'].includes(member.status) ? { ...member, energy: clamp(member.energy + BALANCE.weeklyRecovery + bonusValue(state, 'B011')) } : member);
  let completedSingles = 0;
  const singles = state.singles.map((single) => {
    if (single.status !== 'production') return single;
    const progressWeeks = Math.min(single.durationWeeks, single.progressWeeks + 1);
    if (progressWeeks < single.durationWeeks) return { ...single, progressWeeks };
    completedSingles += 1;
    notifications.push({ type: 'success', text: `${single.title} MV production completed.` });
    history.unshift({ id: `${single.id}-release`, type: 'single', title: `${single.title} released`, detail: 'Four-week MV production completed. Group popularity and public awareness increased.', year, week });
    return { ...single, progressWeeks, status: 'released', releasedYear: year, releasedWeek: week };
  });
  const nextSchedule = {};
  singles.filter((single) => single.status === 'production').forEach((single) => {
    single.memberIds.forEach((memberId) => { nextSchedule[`${memberId}:${single.productionDay}`] = 'mvProduction'; });
  });
  const group = {
    ...state.group,
    fanbase: state.group.fanbase + fanGain,
    popularity: clamp(state.group.popularity + (fanGain > 5000 ? 1 : 0) + completedSingles * 3),
    fanTrust: clamp(state.group.fanTrust + (moneyDelta > 0 ? 1 : moneyDelta < -60_000_000 ? -1 : 0)),
    publicAwareness: clamp(state.group.publicAwareness + (fanGain > 8000 ? 1 : 0) + completedSingles * 4),
  };
  const eligibleCount = getTheaterEligibleMembers({ members }).length;
  const previousRecords = state.records ?? {};
  const theaterShows = [...validTheaterDays].length;
  const records = { ...previousRecords, peakFanbase: Math.max(previousRecords.peakFanbase ?? 0, group.fanbase), peakFanTrust: Math.max(previousRecords.peakFanTrust ?? 0, group.fanTrust), peakReputation: Math.max(previousRecords.peakReputation ?? 0, group.reputation), largestRoster: Math.max(previousRecords.largestRoster ?? 0, members.filter((member) => ['active', 'trainee'].includes(member.status)).length), lowestEligibleRoster: Math.min(previousRecords.lowestEligibleRoster ?? eligibleCount, eligibleCount), theaterShows: (previousRecords.theaterShows ?? 0) + theaterShows, dramaSuspensions: (previousRecords.dramaSuspensions ?? 0) + (activeDrama && !state.activeDrama ? 1 : 0), moneyEarned: (previousRecords.moneyEarned ?? 0) + Math.max(0, moneyDelta), moneySpent: (previousRecords.moneySpent ?? 0) + Math.max(0, -moneyDelta) };
  const ended = eligibleCount < BALANCE.theaterMinimumMembers;
  const skillChanges = members.flatMap((member) => {
    const previous = state.members.find((item) => item.id === member.id);
    return previous ? SKILLS.filter((skill) => member[skill] !== previous[skill]).map((skill) => ({ memberId: member.id, memberName: member.nickname || member.name, skill, before: previous[skill], after: member[skill], delta: Math.round((member[skill] - previous[skill]) * 10) / 10 })) : [];
  });
  const lastResult = { year: state.year, week: state.week, moneyDelta, fanGain, activities: Object.keys(state.schedule).length, schedule: { ...state.schedule }, skillChanges, concertSummary, finances: { ...finances, totalIncome: finances.theater + finances.videoCall + finances.meetGreet + finances.liveStream + finances.concert + finances.otherIncome, totalExpenses: finances.activityCosts + finances.generalOperations + finances.theaterUpkeep } };
  const weeklyReports = [...(state.weeklyReports ?? []), lastResult].slice(-(BALANCE.weeksPerYear * 2));
  const next = {
    ...state, year, week, members, singles, concerts: state.concerts.map((concert) => concert.year === state.year && concert.week === state.week ? { ...concert, status: 'completed', summary: concertSummary } : concert), group, money: state.money + moneyDelta, schedule: nextSchedule, activityEvents: activityEvents.slice(-500), history: history.slice(0, 250),
    notifications, activeDrama, dramaCooldown, graduations, records, weeklyReports, runStatus: ended ? 'ended' : 'active', rngStep: state.rngStep + 1,
    lastResult,
  };
  return ended ? { ...next, runEndedAt: { year, week }, runSummary: makeRunSummary(next, members, eligibleCount, records) } : next;
}

export function runAudition(state) {
  if (state.runStatus === 'ended') return state;
  const auditionCost = applyRate(65_000_000, bonusValue(state, 'B021'));
  if (state.week < BALANCE.auditionStartWeek || state.money < auditionCost || state.auditions.some((item) => item.year === state.year)) return state;
  const rng = createRng(hashSeed(`${state.seed}:audition:${state.year}`));
  const cap = state.auditions.length === 0 ? 4 : Math.min(6, 3 + Math.floor((state.group.fanTrust * 0.55 + state.group.reputation * 0.45) / 20));
  const finalistBonus = bonusValue(state, 'B019');
  const candidates = Array.from({ length: cap }, (_, index) => ({
    id: `trainee-${state.year}-${index}`, name: `Trainee ${state.year}-${index + 1}`, nickname: `Rookie ${index + 1}`,
    generation: `GEN ${Math.max(14, state.year + 13)}`, team: 'TRAINEE', photo: '', archetype: ARCHETYPES[randomInt(rng, 0, ARCHETYPES.length - 1)],
    traits: [TRAITS[randomInt(rng, 0, TRAITS.length - 1)]], ...makeStats(rng, 'Raw Prospect'), popularity: randomInt(rng, 10, 35),
    energy: 100, ego: randomInt(rng, 0, 100), potential: randomInt(rng, 68, 99), development: randomInt(rng, 45, 95), fanbase: randomInt(rng, 300, 1200),
    momentum: 0, status: 'trainee', suspensionWeeks: 0, joinedYear: state.year, joinedWeek: state.week, canPerformTheater: true, finalistPoolSize: cap + finalistBonus, appearances: { theater: 0, center: 0, media: 0 },
  }));
  return { ...state, members: [...state.members, ...candidates], money: state.money - auditionCost, auditions: [...state.auditions, { year: state.year, size: candidates.length, finalistPoolSize: cap + finalistBonus }], history: [{ id: `audition-${state.year}`, type: 'audition', title: `Generation ${candidates[0]?.generation.replace('GEN ', '')} selected`, detail: `${candidates.length} trainees join from ${cap + finalistBonus} finalists after the Q4 audition.`, year: state.year, week: state.week }, ...state.history] };
}
