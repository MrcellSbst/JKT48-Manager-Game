import { memberData } from '../data/newmemberdata.js';
import { BALANCE, CONCERT_BUDGETS, CONCERT_VENUES, DAYS, FAN_BALANCE, OPPORTUNITIES, SINGLE_BUDGETS } from '../data/balance.js';
import dreamSetlistSongs from '../data/DreamSetlist_Songs.js';
import { SETLISTS, SETLIST_BY_ID } from '../data/setlists.js';
import { BONUS_BY_ID } from '../data/bonusTemplates.js';
import { createRng, hashSeed, randomInt, weightedPick } from './rng.js';

const ARCHETYPES = ['Performer', 'Vocalist', 'Entertainer', 'All-Rounder', 'Specialist', 'Raw Prospect', 'Prodigy', 'Late Bloomer'];
const TRAITS = ['Quick Learner', 'Big Stage Performer', 'Theater Specialist', 'Reliable Performer', 'Versatile', 'Crowd Magnet'];
const SKILLS = ['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina'];

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const toAbsoluteWeek = (year, week) => (year - 1) * BALANCE.weeksPerYear + week;
const fromAbsoluteWeek = (absoluteWeek) => ({ year: Math.floor((absoluteWeek - 1) / BALANCE.weeksPerYear) + 1, week: ((absoluteWeek - 1) % BALANCE.weeksPerYear) + 1 });
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const moneyText = (value) => `Rp ${value.toLocaleString('id-ID')}`;
const hasBonus = (state, id) => (state.bonusLoadout ?? []).includes(id);
const bonusValue = (state, id) => hasBonus(state, id) ? BONUS_BY_ID[id].value : 0;
const applyRate = (value, rate) => Math.round(value * (1 + rate));
const chemistryPairKey = (firstId, secondId) => [firstId, secondId].sort().join('::');
const chemistryDimensions = ['stage', 'performance', 'mc', 'unit'];

function createChemistry(seed, firstId, secondId) {
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

// Members who can actually be put to work this week.
export function getSchedulableMembers(state, activityId = null) {
  return (state.members ?? []).filter((member) => activityId ? canMemberPerform(member, activityId) : ['active', 'trainee'].includes(member.status) && (member.suspensionWeeks ?? 0) === 0 && !isMemberInjured(member));
}

export function getRosterDanger(count) {
  if (count >= 23) return 'COMFORTABLE';
  if (count >= 18) return 'STABLE';
  if (count >= 15) return 'THIN';
  if (count >= 13) return 'DANGER';
  if (count === 12) return 'CRITICAL';
  return 'THEATER CANNOT OPERATE';
}

function makeStats(rng, archetype, hardMode = false) {
  const baseMin = hardMode ? 30 : 38;
  const baseMax = hardMode ? 68 : 82;
  const boostMin = hardMode ? 5 : 8;
  const boostMax = hardMode ? 12 : 18;
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

export function calculateNextFanTarget(lastFanTarget, year) {
  const { fixedGrowthPercent, startingRunningGrowthPercent, runningGrowthIncreasePerYear, maxRunningGrowthPercent, year2PlusBonusPercent = 0 } = FAN_BALANCE.target;
  const runningGrowthPercent = Math.min(startingRunningGrowthPercent + (year - 1) * runningGrowthIncreasePerYear, maxRunningGrowthPercent);
  const bonusPercent = year >= 2 ? year2PlusBonusPercent : 0;
  return Math.round(lastFanTarget * (1 + (fixedGrowthPercent + runningGrowthPercent + bonusPercent) / 100));
}

export function createAnnualFanTarget(year, lastFanTarget = FAN_BALANCE.startingFans, startingFanbase = FAN_BALANCE.startingFans) {
  const targetFanbase = calculateNextFanTarget(lastFanTarget, year);
  return { formulaVersion: 2, year, baseTarget: lastFanTarget, startingFanbase, requiredGain: Math.max(0, targetFanbase - startingFanbase), targetFanbase };
}

export function createFanTargetForYear(year, startingFanbase = FAN_BALANCE.startingFans) {
  let lastFanTarget = FAN_BALANCE.startingFans;
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
      weeksWithoutEvent: 0,
      salary: null,
      appearances: { theater: 0, center: 0, media: 0 },
      setlistFamiliarity: {},
    };
    return { ...member, ...createBirthday(seed, member.identityId, member.careerStage) };
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
    group: { fanbase: FAN_BALANCE.startingFans, popularity: 48, fanTrust: 58, reputation: 52, publicAwareness: 44, fanPools: { coreWota: 34_000, casual: 31_000, generalPublic: 18_000, digital: 25_000, event: 17_000, oshi: 29_000, groupFans: 38_000 }, fanSentiment: { coreWota: 0, casual: 0, generalPublic: 0, digital: 0, event: 0, oshi: 0, groupFans: 0 } },
    fanTarget: createAnnualFanTarget(1, FAN_BALANCE.startingFans),
    fanTargetHistory: [],
    fanTargetMetaReward: 0,
    members,
    schedule: {},
    history: [{ id: 'start', type: 'system', title: 'Alternate timeline begins', detail: `${members.length} members enter the founding pool for Year 1.`, year: 1, week: 1 }],
    notifications: [],
    singles: [], concerts: [], yearEndMeetGreets: [], auditions: [], auditionCampaign: null, graduations: [], renovations: [], annualReviews: [], scheduleTemplates: [], fanNarratives: [], theaterShows: {}, theaterHistory: [],
    // Chemistry is prebuilt for current members only. Ex-member pairs are filled in lazily by
    // ensureChemistry/getMemberChemistry, which are deterministic from the seed, so the full identity
    // pool does not pay for 31k unused pairs up front.
    mentorships: [], mentorshipHistory: [], chemistry: buildChemistry(seed, members.filter((member) => member.rosterScope !== 'ex')), promotions: [], demandHistory: [], opportunityHistory: [], pendingOpportunity: null, fanEventPlans: [],
    departures: [], ledger: { pendingUpkeep: 0, pendingOperations: 0, debt: { salary: 0, upkeep: 0, operations: 0 }, unpaidSalaryMonths: 0, settlements: [] }, loans: [], loanOffers: generateLoanOffers(seed, 1), seitansaiObligations: [],
    activeDrama: null,
    dramaMemory: [],
    dramaCooldown: 0,
    failureCounters: { negativeCashWeeks: 0, lowTrustWeeks: 0, lowReputationWeeks: 0, lowFanbaseWeeks: 0 },
    lastResult: null,
    runStatus: 'setup',
    records: { peakFanbase: FAN_BALANCE.startingFans, peakPopularity: 48, peakFanTrust: 58, peakReputation: 52, largestRoster: members.length, lowestEligibleRoster: members.length, theaterShows: 0, dramaSuspensions: 0, singlesReleased: 0, videoCallTickets: 0, meetGreetTickets: 0, moneyEarned: 0, moneySpent: 0, largestConcert: 0, bestConcertOccupancy: 0 },
  };
}

export function getMemberSalary(member, year = 1) {
  const base = member?.status === 'trainee' ? BALANCE.salary.trainee : BALANCE.salary.regular;
  return member?.salary ?? Math.round(base * ((1 + BALANCE.salary.annualIncreasePercent / 100) ** Math.max(0, year - 1)));
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
  if (!theater) throw new Error('Choose a theater.');
  if (uniqueIds.size !== 12) throw new Error('Choose exactly 12 founding members.');
  const purchasePrice = applyRate(theater.price, bonusLoadout.includes('B001') ? BONUS_BY_ID.B001.value : 0);
  if (state.money < purchasePrice) throw new Error('Not enough money for this theater.');
  const members = state.members.filter((member) => uniqueIds.has(member.id));
  if (members.length !== 12) throw new Error('Founding lineup contains an unknown member.');
  const unsignedMembers = state.members.filter((member) => !uniqueIds.has(member.id));
  const hardMode = Boolean(options.hardMode ?? state.hardMode);
  return {
    ...state,
    managementName: normalizedManagementName,
    bonusLoadout: [...bonusLoadout],
    hardMode,
    rosterScope: options.rosterScope ?? state.rosterScope ?? 'active',
    runStatus: 'active',
    money: state.money - purchasePrice,
    theater: { ...theater, price: purchasePrice, weeklyUpkeep: applyRate(theater.weeklyUpkeep, bonusLoadout.includes('B002') ? BONUS_BY_ID.B002.value : 0), renovationLevel: 0 },
    concertVenueOffers: generateConcertVenueOffers(state.seed, state.year, bonusLoadout.includes('B007') ? BONUS_BY_ID.B007.value : 0),
    members,
    unsignedMembers,
    // Founding members drawn from the ex-member pool have no prebuilt chemistry; fill it in now so the
    // first week resolves against persisted values rather than the lazy fallback.
    chemistry: ensureChemistry(state, members),
    history: [{
      id: 'founding-lineup', type: 'system', title: `${theater.name} opens`,
      detail: `${theater.capacity}-seat home purchased. Twelve founding members join the active roster.`, year: 1, week: 1,
    }],
  };
}

export function fireMember(state, memberId) {
  if (state.runStatus === 'ended') return state;
  const member = state.members?.find((item) => item.id === memberId);
  const eligibleCount = getTheaterEligibleMembers(state).length;
  if (!member || !['active', 'trainee'].includes(member.status) || eligibleCount <= BALANCE.theaterMinimumMembers) return state;
  const severance = state.hardMode ? getMemberSalary(member, state.year) : BALANCE.fire.flatSeverance;
  const departure = { id: `fire-${member.id}-${state.year}-${state.week}`, memberId: member.id, member, firedYear: state.year, firedWeek: state.week, returnAbsolute: toAbsoluteWeek(state.year, state.week) + BALANCE.weeksPerYear * 2, status: 'fired' };
  const name = member.nickname || member.name;
  return {
    ...state,
    members: state.members.filter((item) => item.id !== memberId),
    departures: [...(state.departures ?? []), departure],
    money: state.money - severance,
    group: { ...state.group, fanTrust: clamp(state.group.fanTrust - BALANCE.fire.fanTrustPenalty), reputation: clamp(state.group.reputation - BALANCE.fire.reputationPenalty) },
    notifications: [{ type: 'critical', text: `${name} is released. Severance: ${moneyText(severance)}.` }, ...(state.notifications ?? [])].slice(0, 20),
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

export function assignActivity(state, memberId, day, activityId) {
  if (state.runStatus === 'ended') return state;
  const member = state.members.find((item) => item.id === memberId);
  if (!member || !canMemberPerform(member, activityId)) return state;
  const key = `${memberId}:${day}`;
  const schedule = { ...state.schedule };
  const currentActivity = schedule[key];
  if (['mvProduction', 'concert', 'concertRehearsal', 'yearEndMeetGreet'].includes(currentActivity)) return state;
  const month = Math.ceil(state.week / BALANCE.weeksPerMonth);
  const events = state.activityEvents ?? [];
  const eligibleMembers = state.members.filter((item) => canMemberPerform(item, activityId));
  // Clearing a group booking must reach every member holding it, including anyone an injury now
  // bars from the replacement activity — otherwise their old assignment would be stranded.
  const groupMembers = state.members.filter((item) => ['active', 'trainee'].includes(item.status) && (item.suspensionWeeks ?? 0) === 0);
  if (activityId === 'clear' && (currentActivity === 'concert' || currentActivity?.startsWith('mg'))) {
    groupMembers.forEach((item) => { if (schedule[`${item.id}:${day}`] === currentActivity) delete schedule[`${item.id}:${day}`]; });
    return { ...state, schedule };
  }
  if (currentActivity && (currentActivity === 'concert' || currentActivity.startsWith('mg')) && activityId !== currentActivity) {
    groupMembers.forEach((item) => { if (schedule[`${item.id}:${day}`] === currentActivity) delete schedule[`${item.id}:${day}`]; });
  }
  if (activityId === 'concert' || activityId.startsWith('mg')) {
    const type = activityId === 'concert' ? 'concert' : 'meetGreet';
    const alreadyResolved = events.some((event) => event.type === type && event.year === state.year && event.month === month);
    const alreadyScheduled = Object.values(schedule).some((value) => type === 'concert' ? value === 'concert' : value.startsWith?.('mg'));
    const mvLocked = groupMembers.some((item) => schedule[`${item.id}:${day}`] === 'mvProduction');
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
  const activityId = type === 'videoCall' ? 'vc1' : 'mg1';
  const eligibleIds = getSchedulableMembers(state, activityId).map((member) => member.id);
  if (!eligibleIds.length) return state;
  if (targetWeek > state.week) {
    const selectedIds = type === 'meetGreet' ? eligibleIds : [...new Set(memberIds)].filter((id) => eligibleIds.includes(id));
    if (!selectedIds.length || (state.fanEventPlans ?? []).some((plan) => plan.year === state.year && plan.targetWeek === targetWeek && plan.type === type)) return state;
    if (type === 'videoCall') {
      const targetMonth = Math.ceil(targetWeek / BALANCE.weeksPerMonth);
      const currentMonth = Math.ceil(state.week / BALANCE.weeksPerMonth);
      const hasExisting = selectedIds.some((memberId) => {
        const resolved = (state.activityEvents ?? []).some((event) => event.type === 'videoCall' && event.memberId === memberId && event.year === state.year && event.month === targetMonth);
        const planned = (state.fanEventPlans ?? []).some((plan) => plan.type === 'videoCall' && plan.memberIds.includes(memberId) && Math.ceil(plan.targetWeek / BALANCE.weeksPerMonth) === targetMonth);
        const scheduled = currentMonth === targetMonth && Object.entries(state.schedule).some(([key, value]) => {
          const [id] = key.split(':');
          return value.startsWith('vc') && id === memberId;
        });
        return resolved || planned || scheduled;
      });
      if (hasExisting) return state;
    }
    return { ...state, fanEventPlans: [...(state.fanEventPlans ?? []), { id: `fan-event-${type}-${state.year}-${targetWeek}`, type, day, memberIds: selectedIds, year: state.year, targetWeek, status: 'announced' }] };
  }
  if (type === 'meetGreet') {
    const hasLockedMember = eligibleIds.some((memberId) => ['mvProduction', 'concert', 'concertRehearsal', 'yearEndMeetGreet'].includes(state.schedule[`${memberId}:${day}`]));
    return hasLockedMember ? state : assignActivity(state, eligibleIds[0], day, activityId);
  }
  const requestedIds = [...new Set(memberIds)].filter((memberId) => eligibleIds.includes(memberId));
  if (!requestedIds.length) return state;
  return requestedIds.reduce((next, memberId) => assignActivity(next, memberId, day, activityId), state);
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
  if (!budget || state.runStatus === 'ended' || state.money < budget.cost || state.singles.some((single) => single.status !== 'released')) return state;
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
  if (startsNow && memberIds.some((memberId) => state.schedule[`${memberId}:${productionDay}`])) return state;
  const schedule = { ...state.schedule };
  if (startsNow) memberIds.forEach((memberId) => { schedule[`${memberId}:${productionDay}`] = 'mvProduction'; });
  const productionStart = fromAbsoluteWeek(productionStartAbsolute);
  const customTitle = requestedTitle.trim();
  if (customTitle.length > 60) return state;
  const single = { id: `single-${state.year}-${state.singles.length + 1}`, title: customTitle || `Single ${state.singles.length + 1}`, centerId, memberIds, productionDay, budgetId: budget.id, budgetName: budget.name, productionCost: budget.cost, popularityGain: budget.popularityGain, fanTrustGain: budget.fanTrustGain, week: state.week, year: state.year, status: startsNow ? 'production' : 'planned', progressWeeks: 0, durationWeeks: 4, ...(scheduledRelease ? { releaseYear, releaseMonth, releaseWeek, productionStartYear: productionStart.year, productionStartWeek: productionStart.week } : {}) };
  return { ...state, money: state.money - budget.cost, schedule, singles: [...state.singles, single], history: [{ id: `${single.id}-production`, type: 'single', title: scheduledRelease ? `${single.title} announced` : `${single.title} enters production`, detail: scheduledRelease ? `${center.nickname || center.name} leads a 12-member MV lineup with a ${budget.name.toLowerCase()}. Production starts Year ${productionStart.year}, Week ${productionStart.week}; release is Year ${single.releaseYear}, Week ${single.releaseWeek}.` : `${center.nickname || center.name} leads a 12-member MV lineup every ${productionDay} with a ${budget.name.toLowerCase()}. Production will take four weeks.`, year: state.year, week: state.week }, ...state.history] };
}

export function announceConcert(state, concertDay, targetYear, targetMonth, requestedTitle = '', budgetId = 'lean', venueId = 'hall') {
  const budget = CONCERT_BUDGETS.find((option) => option.id === budgetId);
  const venue = [...(state.concertVenueOffers ?? []), ...CONCERT_VENUES].find((option) => option.id === venueId);
  const productionCost = applyRate(budget?.cost ?? 0, bonusValue(state, 'B006'));
  const venueCost = applyRate(venue?.cost ?? 0, bonusValue(state, 'B008'));
  const upfrontCost = productionCost + venueCost;
  if (!budget || !venue || state.runStatus === 'ended' || state.money < upfrontCost || !DAYS.includes(concertDay) || targetMonth < 1 || targetMonth > 12) return state;
  const targetWeek = targetMonth * BALANCE.weeksPerMonth;
  const targetAbsolute = toAbsoluteWeek(targetYear, targetWeek);
  const currentAbsolute = toAbsoluteWeek(state.year, state.week);
  if (targetAbsolute - currentAbsolute < 2 || state.concerts.some((concert) => concert.targetYear === targetYear && concert.targetMonth === targetMonth)) return state;
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
  return { ...state, money: state.money - upfrontCost, concerts: [...state.concerts, concert], history: [{ id: concert.id, type: 'concert', title: `${concert.title} announced`, detail: `${venue.name} · ${capacity.toLocaleString()} seats · ${budget.name} · Year ${targetYear}, Month ${targetMonth}, Week 4 on ${concertDay}.`, year: state.year, week: state.week }, ...state.history] };
}

export function scheduleYearEndMeetGreet(state, targetWeek, day, salesStartWeek, sessionCounts = {}) {
  if (state.runStatus === 'ended' || targetWeek < 37 || targetWeek > 44 || targetWeek <= state.week || salesStartWeek < state.week || salesStartWeek >= targetWeek || !DAYS.includes(day)) return state;
  if ((state.yearEndMeetGreets ?? []).some((event) => event.year === state.year)) return state;
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
  if (targetWeek < 45 || targetWeek > 48 || targetWeek - state.week < 2 || rehearsalDays.some((day) => !DAYS.includes(day) || day === concertDay) || new Set(rehearsalDays).size !== rehearsalDays.length) return state;
  if (state.concerts.some((concert) => concert.eventType === 'anniversary' && concert.targetYear === state.year)) return state;
  const chosenVenueId = venueId ?? state.concertVenueOffers?.[0]?.id ?? CONCERT_VENUES[0].id;
  const announced = announceConcert(state, concertDay, state.year, 12, requestedTitle || `JKT48 Anniversary ${state.year}`, budgetId, chosenVenueId);
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
    if (!member || !canMemberPerform(member, entry.activityId) || BALANCE.activities[entry.activityId]?.schedulable === false) { skipped += 1; continue; }
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
  const memberPerformance = clamp(Math.round(members.reduce((sum, member) => sum + (member.vocal + member.dance + member.performance) / 3, 0) / Math.max(1, members.length) + chemistryBonus + randomInt(rng, -5, 5)));
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
  const launchViews = single.launchViews ?? Math.max(1, Math.round(group.fanbase * (0.12 + group.publicAwareness / 500)));
  if (viewWeek === 1) return { gain: launchViews, launchViews };
  if (viewWeek === 2) return { gain: Math.round(launchViews * 0.55), launchViews };
  if (viewWeek === 3) return { gain: Math.round(launchViews * 0.25), launchViews };
  const longTailCap = Math.max(1, Math.round((group.fanbase / 5) * 0.01));
  return { gain: Math.min(longTailCap, Math.max(1, Math.round(longTailCap * (0.85 ** (viewWeek - 4))))), launchViews };
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
  const members = state.members.map((member) => participantSet.has(member.id) ? { ...member, energy: clamp(member.energy - Math.round(offer.energy * (1.15 - member.stamina * 0.003))), fanbase: member.fanbase + Math.round(fansGained / Math.max(1, offer.memberIds.length)), popularity: clamp(member.popularity + (offer.awareness >= 3 ? 1 : 0)), appearances: { ...member.appearances, media: (member.appearances?.media ?? 0) + (offer.category === 'media' ? 1 : 0), offAir: (member.appearances?.offAir ?? 0) + (offer.category === 'live' ? 1 : 0) } } : member);
  return { ...state, pendingOpportunity: null, opportunityHistory, money: state.money - offer.cost + revenue, members, group: { ...state.group, fanbase: state.group.fanbase + fansGained, popularity: clamp(state.group.popularity + 1), publicAwareness: clamp(state.group.publicAwareness + offer.awareness), reputation: clamp(state.group.reputation + offer.reputation) }, notifications: [{ type: 'success', text: `${offer.title} completed: ${moneyText(revenue)} revenue and ${fansGained.toLocaleString()} new fans.` }, ...(state.notifications ?? [])].slice(0, 20), history: [{ id: `${offer.id}-accepted`, type: 'opportunity', title: offer.title, detail: `${offer.memberIds.length} members participate. Net cash ${moneyText(revenue - offer.cost)}; ${fansGained.toLocaleString()} of ${offer.fans.toLocaleString()} potential fans gained.`, year: state.year, week: state.week }, ...(state.history ?? [])] };
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
  let energy = member.energy;
  let money = 0;
  let fanGain = 0;
  let baseFanGain = 0;
  const capMultiplier = getFanGrowthMultiplier(state.group.fanbase, state.fanTarget?.targetFanbase ?? Infinity);
  const addFans = (baseGain, resistance) => {
    const normalizedBase = Math.round(baseGain);
    baseFanGain += normalizedBase;
    fanGain += applyFanSoftCap(normalizedBase, capMultiplier, resistance);
  };
  let popularity = member.popularity;
  let momentum = member.momentum * 0.7;
  const finances = { theater: 0, videoCall: 0, meetGreet: 0, media: 0, offAir: 0, liveStream: 0, concert: 0, otherIncome: 0, activityCosts: 0 };
  const stats = { ...member };
  const appearances = { ...member.appearances };
  let trainingProgress = member.trainingProgress ?? 0;
  let theaterAppearances = member.theaterAppearances ?? appearances.theater ?? 0;
  const demandRecords = [];
  const mentorship = (state.mentorships ?? []).find((item) => item.menteeId === member.id && item.status === 'active' && toAbsoluteWeek(state.year, state.week) >= toAbsoluteWeek(item.startYear, item.startWeek) && toAbsoluteWeek(state.year, state.week) < item.endAbsolute);

  for (const assignment of assignments) {
    const activityId = typeof assignment === 'string' ? assignment : assignment.activityId;
    const activityDay = typeof assignment === 'string' ? null : assignment.day;
    const activity = BALANCE.activities[activityId];
    if (!activity || (energy <= 0 && !activity.energyRecovery)) continue;
    const energyBefore = energy;
    const energyRate = (['theater', 'concert'].includes(activityId) ? bonusValue(state, 'B012') : 0) + (/^(mg|vc)/.test(activityId) || activityId === 'yearEndMeetGreet' ? bonusValue(state, 'B013') : 0) + (activityId === 'concertRehearsal' ? bonusValue(state, 'B014') : 0);
    const fatigue = Math.round(activity.energy * staminaCostMultiplier(member.stamina) * (1 + energyRate));
    const recovery = Math.round((activity.energyRecovery ?? 0) * staminaRecoveryMultiplier(member.stamina));
    const performanceBand = energy >= 60 ? 1 : energy >= 40 ? 0.95 : energy >= 20 ? 0.85 : 0.7;
    const theaterShow = activityId === 'theater' ? state.theaterShows?.[activityDay] : null;
    const familiarity = theaterShow ? member.setlistFamiliarity?.[theaterShow.setlistId] ?? 0 : 0;
    const familiarityMultiplier = activityId === 'theater' ? 0.85 + familiarity * 0.0015 : 1;
    const theaterTraitMultiplier = activityId === 'theater' && member.traits.includes('Theater Specialist') ? 1.15 : 1;
    const peers = activityDay && ['theater', 'concert'].includes(activityId)
      ? state.members.filter((item) => item.id !== member.id && state.schedule?.[`${item.id}:${activityDay}`] === activityId).map((item) => item.id)
      : [];
    const chemistryBonus = peers.length ? (chemistryScore(state, [member.id, ...peers], 'stage') - 50) * 0.12 : 0;
    const performanceVariance = Math.max(3, Math.round(10 - (member.consistency ?? 50) * 0.07));
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
      const ceiling = Math.max(0.15, (member.potential - stats[activity.skill]) / 45);
      const traitBonus = member.traits.includes('Quick Learner') ? 1.2 : 1;
      const trainingRate = bonusValue(state, 'B015') + (member.status === 'trainee' ? bonusValue(state, 'B016') : 0) + (mentorship?.developmentBonus ?? 0);
      const energyEffectiveness = energyBefore >= 60 ? 1 : energyBefore >= 40 ? 0.9 : energyBefore >= 20 ? 0.7 : 0.4;
      const lowestSkill = SKILLS.reduce((lowest, skill) => stats[skill] < stats[lowest] ? skill : lowest, SKILLS[0]);
      const crossTrainingRate = activity.skill === lowestSkill ? bonusValue(state, 'B018') : 0;
      const adaptabilityRate = activity.skill === lowestSkill ? 0.9 + (member.adaptability ?? 50) / 500 : 1;
      const gain = ceiling * member.development / 100 * developmentCurveMultiplier(member, state.year) * adaptabilityRate * traitBonus * energyEffectiveness * (activity.intensity ?? 1) * (1 + trainingRate + crossTrainingRate);
      stats[activity.skill] = clamp(stats[activity.skill] + Math.max(0.1, gain));
      if (member.status === 'trainee') trainingProgress = clamp(trainingProgress + (activity.intensity ?? 1) * BALANCE.trainee.trainingProgressPerIntensity);
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
      const streamRevenue = Math.round(member.popularity * activity.revenuePerPopularity * 0.7);
      const streamFans = Math.round(member.popularity * activity.fansPerPopularity);
      money += streamRevenue;
      finances.liveStream += streamRevenue;
      addFans(streamFans, activitySoftCapResistance(activityId, state));
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
      addFans(sold * 0.12, activitySoftCapResistance(activityId, state));
      momentum += sold / activity.capacity > 0.9 ? 2 : -1;
      demandRecords.push({ id: `demand-${state.year}-${state.week}-${member.id}-${activityId}-${activityDay}`, memberId: member.id, memberName: member.nickname || member.name, type: activityId.startsWith('vc') ? 'videoCall' : activityId.startsWith('mg') ? 'meetGreet' : activityId, activityId, year: state.year, week: state.week, day: activityDay, capacity: activity.capacity, demand, sold, unmetDemand: Math.max(0, demand - sold), sellThrough: Math.round(sold / activity.capacity * 1000) / 10, revenue: ticketRevenue });
    }
    if (activityId.startsWith('mv')) {
      addFans(score * 12, activitySoftCapResistance(activityId, state));
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
  return {
    member: { ...member, ...Object.fromEntries(SKILLS.map((key) => [key, Math.round(stats[key] * 10) / 10])), setlistFamiliarity: stats.setlistFamiliarity ?? member.setlistFamiliarity ?? {}, theaterExp: stats.theaterExp ?? member.theaterExp ?? 0, energy, popularity: clamp(popularity), momentum: clamp(momentum, -20, 20), fanbase: member.fanbase + fanGain, appearances, trainingProgress, theaterAppearances },
    money,
    fanGain,
    baseFanGain,
    finances,
    demandRecords,
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
  return { severity: severity.id, label: severity.label, weeksRemaining: severity.weeks, weeks: severity.weeks, blocks: [...severity.blocks], causedBy: { year: state.year, week: state.week, load } };
}

function scheduleGraduations(state, targetYear, currentWeek, members, rng) {
  const config = BALANCE.graduation;
  const existing = state.graduations ?? [];
  if ((currentWeek - 1) % BALANCE.weeksPerMonth !== 0) return existing;
  const eligible = members.filter((member) => {
    if (!['active', 'trainee'].includes(member.status) || member.graduationPending) return false;
    const joinedYear = member.joinedYear ?? 1;
    return targetYear - joinedYear >= config.minimumTenureYears;
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
  const member = weightedPick(rng, eligible, (candidate) => 10 + (candidate.weeksWithoutEvent ?? 0) * config.idleWeightPerWeek);
  const lead = randomInt(rng, config.minLead, config.maxLead);
  const departureTotal = currentWeek + lead;
  const plan = { id: `graduation-${targetYear}-${currentMonth}-${member.id}`, memberId: member.id, memberName: member.nickname || member.name, planYear: targetYear, announcementYear: targetYear, announcementWeek: currentWeek, departureYear: departureTotal > BALANCE.weeksPerYear ? targetYear + 1 : targetYear, departureWeek: departureTotal > BALANCE.weeksPerYear ? departureTotal - BALANCE.weeksPerYear : departureTotal, announced: false, completed: false };
  return [...existing, plan];
}

function makeRunSummary(state, members, eligibleCount, records) {
  const active = members.filter((member) => ['active', 'trainee'].includes(member.status)).length;
  const reward = 5 + (state.year - 1) * 5 + Math.floor((state.week - 1) / 12) + Math.floor((records.peakFanTrust + records.peakReputation) / 40) + (state.fanTargetMetaReward ?? 0);
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
  const rng = createRng(hashSeed(`${state.seed}:${state.rngStep}`));
  const currentAbsolute = toAbsoluteWeek(state.year, state.week);
  const activatedPlans = (state.fanEventPlans ?? []).filter((plan) => plan.year === state.year && plan.targetWeek === state.week);
  const weekSchedule = { ...state.schedule };
  activatedPlans.forEach((plan) => plan.memberIds.forEach((memberId) => { weekSchedule[`${memberId}:${plan.day}`] = plan.type === 'videoCall' ? 'vc1' : 'mg1'; }));
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
  const finances = { theater: 0, videoCall: 0, meetGreet: 0, media: 0, offAir: 0, liveStream: 0, concert: 0, twoShot: 0, otherIncome: 0, activityCosts: 0, refunds: 0, salary: 0, debtPayments: 0, loanPayment: 0, generalOperations: state.hardMode ? 0 : applyRate(18_000_000, bonusValue(state, 'B004')), theaterUpkeep: state.hardMode ? 0 : state.theater?.weeklyUpkeep ?? 0 };
  const theaterLineups = Object.fromEntries(DAYS.map((day) => [day, state.members.reduce((count, member) => count + (weekSchedule[`${member.id}:${day}`] === 'theater' ? 1 : 0), 0)]));
  const offAirLineups = Object.fromEntries(DAYS.map((day) => [day, state.members.reduce((count, member) => count + (weekSchedule[`${member.id}:${day}`] === 'offAir' ? 1 : 0), 0)]));
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
  const validTheaterDays = new Set(DAYS.filter((day) => theaterLineups[day] === 12));
  // Only one off-air show can pay out per week; extra complete lineups are treated as canceled.
  const completeOffAirDays = DAYS.filter((day) => offAirLineups[day] === BALANCE.activities.offAir.requiredMembers);
  const validOffAirDays = new Set(completeOffAirDays.slice(0, BALANCE.activities.offAir.maxPerWeek));
  const surplusOffAirDays = completeOffAirDays.slice(BALANCE.activities.offAir.maxPerWeek);
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
  let unsignedMembers = [...(state.unsignedMembers ?? [])];
  let members = state.members.map((member) => {
    if (member.suspensionWeeks > 0) {
      const left = member.suspensionWeeks - 1;
      return { ...member, suspensionWeeks: left, status: left === 0 ? 'active' : 'suspended', energy: left === 0 ? 100 : member.energy };
    }
    const injury = member.injury && (member.injury.weeksRemaining ?? 0) > 0
      ? { ...member.injury, weeksRemaining: member.injury.weeksRemaining - 1 }
      : null;
    const injuryActive = Boolean(injury && injury.weeksRemaining >= 0);
    const assignments = injuryActive ? [] : DAYS.map((day) => {
      const assignment = weekSchedule[`${member.id}:${day}`];
      if (assignment === 'theater' && !validTheaterDays.has(day)) return null;
      if (assignment === 'offAir' && !validOffAirDays.has(day)) return null;
      return assignment ? { activityId: assignment, day } : null;
    }).filter(Boolean);
    const result = resolveMemberWeek({ ...member, injury: injuryActive ? injury : null }, assignments, rng, effectiveTheater, resolutionState);
    const rolledInjury = injuryActive ? null : rollInjury(result.member, assignments, rng, state);
    if (rolledInjury) {
      injuryNotifications.push(`${result.member.nickname || result.member.name} suffers a ${rolledInjury.label.toLowerCase()} injury and misses ${rolledInjury.weeksRemaining} week(s).`);
    }
    moneyDelta += result.money;
    fanGain += result.fanGain;
    baseFanGain += result.baseFanGain;
    weeklyDemandRecords.push(...result.demandRecords);
    Object.keys(result.finances).forEach((key) => { finances[key] += result.finances[key]; });
    const participated = assignments.some(({ activityId }) => activityId === 'theater' || activityId === 'offAir' || activityId === 'media' || activityId === 'photoshoot' || BALANCE.activities[activityId]?.skill);
    const nextMember = { ...result.member, injury: rolledInjury ?? (injuryActive && injury?.weeksRemaining > 0 ? injury : null), weeksWithoutEvent: participated ? 0 : (member.weeksWithoutEvent ?? 0) + 1 };
    return nextMember.status === 'trainee' ? { ...nextMember, traineeWeeks: (nextMember.traineeWeeks ?? 0) + 1 } : nextMember;
  });

  let week = state.week + 1;
  let year = state.year;
  const history = [...state.history];
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
  let dramaCooldown = Math.max(0, state.dramaCooldown - 1);
  let activeDrama = members.some((member) => member.status === 'suspended') ? state.activeDrama : null;
  let dramaTrustDelta = 0;
  let dramaReputationDelta = 0;
  let graduationTrustDelta = 0;
  let disruptedMemberId = null;
  let dramaMemory = (state.dramaMemory ?? []).map((memory) => ({ ...memory, weeksRemaining: memory.weeksRemaining - 1 })).filter((memory) => memory.weeksRemaining > 0);
  let fanNarratives = (state.fanNarratives ?? []).filter((narrative) => !narrative.expiresAbsolute || narrative.expiresAbsolute >= currentAbsolute);

  if (!activeDrama && state.activeDrama) {
    dramaCooldown = randomInt(rng, ...BALANCE.dramaCooldown);
    history.unshift({ id: `return-${state.rngStep}`, type: 'member', title: `${state.activeDrama.name} returns`, detail: `Returns fully rested. Drama cooldown: ${dramaCooldown} weeks.`, year, week: state.week });
  }
  if (year >= 2 && !activeDrama && dramaCooldown === 0 && rng() < BALANCE.dramaChance) {
    const eligible = members.filter((member) => member.status === 'active');
    if (eligible.length) {
      const selected = weightedPick(rng, eligible, (member) => 10 + member.ego * 0.8 + Math.max(0, member.momentum));
      disruptedMemberId = selected.id;
      members = members.map((member) => member.id === selected.id ? { ...member, status: 'suspended', suspensionWeeks: BALANCE.dramaDuration } : member);
      let refund = 0;
      yearEndMeetGreets = yearEndMeetGreets.map((event) => {
        if (toAbsoluteWeek(event.year, event.targetWeek) <= currentAbsolute) return event;
        let eventRefund = 0;
        const memberSessions = event.memberSessions.map((session) => {
          if (session.memberId !== selected.id || session.sold <= 0) return session;
          eventRefund += session.sold * event.ticketPrice;
          return { ...session, refunded: (session.refunded ?? 0) + session.sold, sold: 0 };
        });
        refund += eventRefund;
        return { ...event, memberSessions, revenue: Math.max(0, event.revenue - eventRefund) };
      });
      if (refund) {
        moneyDelta -= refund;
        finances.refunds += refund;
        notifications.push({ type: 'critical', text: `${moneyText(refund)} in sold fan-event tickets refunded.` });
      }
      const severityRoll = rng();
      const severity = severityRoll < 0.4 ? 'Minor' : severityRoll < 0.75 ? 'Moderate' : severityRoll < 0.95 ? 'Major' : 'Extreme';
      const baseDamage = { Minor: 2, Moderate: 4, Major: 7, Extreme: 11 }[severity];
      const protectedDamage = Math.max(1, Math.round(baseDamage * (1 + bonusValue(state, 'B024'))));
      dramaTrustDelta = -protectedDamage;
      dramaReputationDelta = -Math.max(1, Math.round(protectedDamage * 0.7));
      activeDrama = { memberId: selected.id, name: selected.nickname || selected.name, severity, startedWeek: state.week };
      dramaMemory = [{ memberId: selected.id, name: activeDrama.name, severity, weeksRemaining: 12, initialImpact: protectedDamage }, ...dramaMemory].slice(0, 20);
      fanNarratives = appendNarrative(fanNarratives, { id: `drama-narrative-${state.rngStep}`, type: 'drama', title: 'Management under pressure', detail: `${activeDrama.name}'s ${severity.toLowerCase()} disruption tests roster depth and fan confidence.`, sentiment: 'negative', year, week: state.week, expiresAbsolute: currentAbsolute + 12 });
      notifications.push({ type: 'critical', text: `${activeDrama.name} unavailable for four weeks.` });
      history.unshift({ id: `drama-${state.rngStep}`, type: 'drama', title: 'Schedule disruption', detail: `${activeDrama.name} becomes unavailable for four weeks.`, year, week: state.week });
    }
  }
  if (!activeDrama && year >= 2 && dramaCooldown === 0 && rng() < BALANCE.dramaChance * 0.35) {
    const template = weightedPick(rng, BALANCE.managementDrama.templates, (item) => Math.max(1, Math.abs(item.trust) + Math.abs(item.reputation)));
    dramaTrustDelta += Math.round(template.trust * (1 + bonusValue(state, 'B024')));
    dramaReputationDelta += Math.round(template.reputation * (1 + bonusValue(state, 'B024')));
    dramaMemory = [{ type: 'management', title: template.title, detail: template.detail, weeksRemaining: 8, year, week: state.week }, ...dramaMemory].slice(0, 20);
    fanNarratives = appendNarrative(fanNarratives, { id: `management-drama-${state.rngStep}`, type: 'drama', title: template.title, detail: template.detail, sentiment: 'negative', year, week: state.week, expiresAbsolute: currentAbsolute + 8 });
    notifications.push({ type: 'critical', text: `${template.title}: management trust and reputation take a hit.` });
    history.unshift({ id: `management-drama-${state.rngStep}`, type: 'drama', title: template.title, detail: template.detail, year, week: state.week });
  }
  if (disruptedMemberId) concerts = concerts.map((concert) => {
    if (toAbsoluteWeek(concert.targetYear, concert.targetWeek) <= currentAbsolute || !concert.memberIds?.includes(disruptedMemberId)) return concert;
    const replacement = members.filter((member) => member.status === 'active' && !concert.memberIds.includes(member.id)).sort((a, b) => b.performance - a.performance)[0];
    if (!replacement) return concert;
    notifications.push({ type: 'critical', text: `${replacement.nickname || replacement.name} joins an upcoming concert as an emergency replacement.` });
    return { ...concert, memberIds: concert.memberIds.map((memberId) => memberId === disruptedMemberId ? replacement.id : memberId), replacements: [...(concert.replacements ?? []), { outMemberId: disruptedMemberId, inMemberId: replacement.id, year: state.year, week: state.week }] };
  });
  let graduations = scheduleGraduations(state, year, state.week, members, rng);
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
      members = members.map((member) => member.id === graduation.memberId ? { ...member, status: 'graduated', theaterEligible: false, canPerformTheater: false, graduationPending: false } : member.id === preparation.successorId ? { ...member, performance: clamp(member.performance + 2), popularity: clamp(member.popularity + 1), successorOf: graduation.memberId } : member);
      return { ...graduation, completed: true, outcome: { baseFanGain: graduationFans, fanGain: appliedGraduationFans, merchandiseRevenue, fanTrustGain: graduationTrustDelta } };
    }
    return graduation;
  });
  let departures = (state.departures ?? []).map((departure) => {
    if (departure.status !== 'fired' || currentAbsolute + 1 < departure.returnAbsolute) return departure;
    const recycled = recycleMemberForPool(departure.member, state, departure);
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
    members = members.map((member) => member.id === selected.id ? { ...member, fanbase: member.fanbase + gain, popularity: clamp(member.popularity + randomInt(rng, 2, 7)), momentum: clamp(member.momentum + 5, -20, 20) } : member);
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
      const selectedIds = (auditionCampaign.selectedCandidateIds?.length ? auditionCampaign.selectedCandidateIds : auditionCampaign.candidatePool.map((candidate) => candidate.id)).slice(0, auditionCampaign.maxIntake);
      const selectedCandidates = auditionCampaign.candidatePool.filter((candidate) => selectedIds.includes(candidate.id));
      const selectedPoolIds = new Set(selectedCandidates.map((candidate) => candidate.sourcePoolId ?? candidate.candidateId ?? candidate.id));
      members = [...members, ...selectedCandidates.map(({ candidateId, sourcePoolId, ...candidate }) => ({ ...candidate, id: candidateId ?? candidate.id, status: 'trainee', joinedYear: year, joinedWeek: week, traineeWeeks: 0, trainingProgress: 0 }))];
      unsignedMembers = unsignedMembers.filter((member) => !selectedPoolIds.has(member.id));
      auditions = [...auditions, { year: auditionCampaign.year, size: selectedCandidates.length, finalistPoolSize: auditionCampaign.finalistPoolSize, startWeek: auditionCampaign.startWeek, durationWeeks: auditionCampaign.durationWeeks }];
      auditionCampaign = null;
      notifications.push({ type: 'success', text: `${selectedCandidates.length} trainees join after the five-week audition.` });
      history.unshift({ id: `audition-${state.year}-${state.week}-complete`, type: 'audition', title: 'Audition finalized', detail: `${selectedCandidates.length} trainees join the roster after finalist selection.`, year: state.year, week: state.week });
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
  const singles = state.singles.map((storedSingle) => {
    let single = storedSingle;
    if (disruptedMemberId && single.status !== 'released' && single.memberIds?.includes(disruptedMemberId)) {
      const replacement = members.filter((member) => member.status === 'active' && !single.memberIds.includes(member.id)).sort((a, b) => b.performance - a.performance)[0];
      if (replacement) {
        single = { ...single, memberIds: single.memberIds.map((memberId) => memberId === disruptedMemberId ? replacement.id : memberId), centerId: single.centerId === disruptedMemberId ? replacement.id : single.centerId, recasts: [...(single.recasts ?? []), { outMemberId: disruptedMemberId, inMemberId: replacement.id, year: state.year, week: state.week }] };
        notifications.push({ type: 'critical', text: `${replacement.nickname || replacement.name} replaces an unavailable MV member.` });
      }
    }
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
  const nextSchedule = {};
  const nextAbsolute = toAbsoluteWeek(year, week);
  singles.forEach((single) => {
    if (!single.productionStartYear || !single.productionStartWeek) {
      if (single.status === 'production') single.memberIds.forEach((memberId) => { nextSchedule[`${memberId}:${single.productionDay}`] = 'mvProduction'; });
      return;
    }
    const startAbsolute = toAbsoluteWeek(single.productionStartYear, single.productionStartWeek);
    if (nextAbsolute >= startAbsolute && nextAbsolute < startAbsolute + single.durationWeeks) single.memberIds.forEach((memberId) => { nextSchedule[`${memberId}:${single.productionDay}`] = 'mvProduction'; });
  });
  concerts.forEach((concert) => {
    if (nextAbsolute !== toAbsoluteWeek(concert.targetYear, concert.targetWeek)) return;
    concert.memberIds.filter((memberId) => members.some((member) => member.id === memberId && ['active', 'trainee'].includes(member.status))).forEach((memberId) => { nextSchedule[`${memberId}:${concert.day}`] = 'concert'; });
    if (concert.eventType === 'anniversary') concert.rehearsalDays.forEach((day) => concert.memberIds.filter((memberId) => members.some((member) => member.id === memberId && ['active', 'trainee'].includes(member.status))).forEach((memberId) => { nextSchedule[`${memberId}:${day}`] = 'concertRehearsal'; }));
  });
  yearEndMeetGreets.forEach((event) => {
    if (nextAbsolute !== toAbsoluteWeek(event.year, event.targetWeek)) return;
    event.memberSessions.filter((session) => members.some((member) => member.id === session.memberId && ['active', 'trainee'].includes(member.status))).forEach((session) => { nextSchedule[`${session.memberId}:${event.day}`] = 'yearEndMeetGreet'; });
  });
  if (concertSummary) concerts = concerts.map((concert) => concert.targetYear === state.year && concert.targetWeek === state.week ? { ...concert, status: 'completed', summary: concertSummary } : concert);
  const currentYearEndMeetGreet = yearEndMeetGreets.find((event) => event.year === state.year && event.targetWeek === state.week);
  const yearEndMeetGreetSummary = currentYearEndMeetGreet ? { title: 'Year-end Meet & Greet', attendance: currentYearEndMeetGreet.memberSessions.reduce((sum, session) => sum + session.sold, 0), capacity: currentYearEndMeetGreet.memberSessions.reduce((sum, session) => sum + session.capacity, 0), revenue: currentYearEndMeetGreet.revenue, participatingMembers: currentYearEndMeetGreet.memberSessions.length } : null;
  if (currentYearEndMeetGreet) yearEndMeetGreets = yearEndMeetGreets.map((event) => event.id === currentYearEndMeetGreet.id ? { ...event, status: 'completed', summary: yearEndMeetGreetSummary } : event);
  const concertTrustDelta = concertSummary?.evaluation.fanTrustDelta ?? 0;
  const protectedConcertTrustDelta = concertTrustDelta < 0 ? Math.ceil(concertTrustDelta * (1 + bonusValue(state, 'B023'))) : concertTrustDelta;
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
    if (obligation.status !== 'open' || currentAbsolute < obligation.dueAbsolute) return obligation;
    const fulfilled = [...validTheaterDays].some((day) => weekSchedule[`${obligation.memberId}:${day}`] === 'theater') || (state.theaterHistory ?? []).some((show) => show.year === obligation.year && show.memberIds?.includes(obligation.memberId) && toAbsoluteWeek(show.year, show.week) >= obligation.dueAbsolute - 6);
    if (fulfilled) {
      seitansaiTrustDelta += BALANCE.seitansai.trustGain;
      seitansaiOshiDelta.set(obligation.memberId, BALANCE.seitansai.oshiSentiment);
      return { ...obligation, status: 'fulfilled', fulfilledYear: state.year, fulfilledWeek: state.week };
    }
    seitansaiTrustDelta -= BALANCE.seitansai.missedTrustLoss;
    seitansaiOshiDelta.set(obligation.memberId, -BALANCE.seitansai.missedOshiLoss);
    notifications.push({ type: 'critical', text: `${members.find((member) => member.id === obligation.memberId)?.name ?? 'Birthday member'}'s Seitansai was missed.` });
    return { ...obligation, status: 'missed', missedYear: state.year, missedWeek: state.week };
  });
  members = members.map((member) => seitansaiOshiDelta.has(member.id) ? { ...member, oshiSentiment: clamp((member.oshiSentiment ?? 0) + seitansaiOshiDelta.get(member.id)) } : member);
  if (state.hardMode) {
    resolvedLedger = { ...resolvedLedger, pendingUpkeep: (resolvedLedger.pendingUpkeep ?? 0) + (state.theater?.weeklyUpkeep ?? 0), pendingOperations: (resolvedLedger.pendingOperations ?? 0) + applyRate(18_000_000, bonusValue(state, 'B004')), debt: { ...(resolvedLedger.debt ?? {}) } };
    if (state.week % BALANCE.weeksPerMonth === 0) {
      let settlementCash = state.money + moneyDelta;
      const previousSalaryDebt = resolvedLedger.debt.salary ?? 0;
      const due = { salary: members.filter((member) => ['active', 'trainee'].includes(member.status)).reduce((sum, member) => sum + getMemberSalary(member, state.year), 0) + previousSalaryDebt, upkeep: resolvedLedger.pendingUpkeep + (resolvedLedger.debt.upkeep ?? 0), operations: resolvedLedger.pendingOperations + (resolvedLedger.debt.operations ?? 0) };
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
  const group = {
    ...state.group,
    fanbase: state.group.fanbase + fanGain,
    popularity: clamp(state.group.popularity + (fanGain > 5000 ? 1 : 0) + singlePopularityGain + (concertSummary?.evaluation.popularityDelta ?? 0)),
    fanTrust: clamp(state.group.fanTrust + (moneyDelta > 0 ? 1 : moneyDelta < -60_000_000 ? -1 : 0) + singleFanTrustGain + protectedConcertTrustDelta + dramaTrustDelta + graduationTrustDelta + seitansaiTrustDelta + (annualFanPerformance?.trustDelta ?? 0)),
    reputation: clamp(state.group.reputation + (concertSummary?.evaluation.reputationDelta ?? 0) + dramaReputationDelta + (annualFanPerformance?.reputationDelta ?? 0) - loanPenalty),
    publicAwareness: clamp(state.group.publicAwareness + (fanGain > 8000 ? 1 : 0) + completedSingles * 4),
    fanPools, fanSentiment,
  };
  const eligibleCount = getTheaterEligibleMembers({ members }).length;
  const previousRecords = state.records ?? {};
  const theaterShows = [...validTheaterDays].length;
  const concertEvaluation = concertSummary?.evaluation;
  const records = { ...previousRecords, peakFanbase: Math.max(previousRecords.peakFanbase ?? 0, group.fanbase), peakPopularity: Math.max(previousRecords.peakPopularity ?? 0, group.popularity), peakFanTrust: Math.max(previousRecords.peakFanTrust ?? 0, group.fanTrust), peakReputation: Math.max(previousRecords.peakReputation ?? 0, group.reputation), largestRoster: Math.max(previousRecords.largestRoster ?? 0, members.filter((member) => ['active', 'trainee'].includes(member.status)).length), lowestEligibleRoster: Math.min(previousRecords.lowestEligibleRoster ?? eligibleCount, eligibleCount), theaterShows: (previousRecords.theaterShows ?? 0) + theaterShows, singlesReleased: (previousRecords.singlesReleased ?? 0) + completedSingles, videoCallTickets: (previousRecords.videoCallTickets ?? 0) + Math.round(finances.videoCall / BALANCE.activities.vc1.ticket), meetGreetTickets: (previousRecords.meetGreetTickets ?? 0) + Math.round(finances.meetGreet / BALANCE.activities.mg1.ticket), largestConcert: Math.max(previousRecords.largestConcert ?? 0, concertEvaluation?.attendance ?? 0), bestConcertOccupancy: Math.max(previousRecords.bestConcertOccupancy ?? 0, concertEvaluation?.occupancy ?? 0), dramaSuspensions: (previousRecords.dramaSuspensions ?? 0) + (activeDrama && !state.activeDrama ? 1 : 0), moneyEarned: (previousRecords.moneyEarned ?? 0) + Math.max(0, moneyDelta), moneySpent: (previousRecords.moneySpent ?? 0) + Math.max(0, -moneyDelta) };
  const nextMoney = state.money + moneyDelta;
  const previousFailures = state.failureCounters ?? {};
  const failureCounters = { negativeCashWeeks: nextMoney < 0 ? (previousFailures.negativeCashWeeks ?? 0) + 1 : 0, lowTrustWeeks: group.fanTrust < 5 ? (previousFailures.lowTrustWeeks ?? 0) + 1 : 0, lowReputationWeeks: group.reputation < 5 ? (previousFailures.lowReputationWeeks ?? 0) + 1 : 0, lowFanbaseWeeks: group.fanbase < 20_000 ? (previousFailures.lowFanbaseWeeks ?? 0) + 1 : 0 };
  const failureReason = eligibleCount < BALANCE.theaterMinimumMembers ? 'THEATER ROSTER FAILURE' : salaryDefault ? 'SALARY DEFAULT' : failureCounters.negativeCashWeeks >= 4 ? 'SUSTAINED BANKRUPTCY' : failureCounters.lowTrustWeeks >= 4 ? 'FAN TRUST COLLAPSE' : failureCounters.lowReputationWeeks >= 4 ? 'REPUTATION COLLAPSE' : failureCounters.lowFanbaseWeeks >= 8 ? 'FANBASE COLLAPSE' : null;
  const ended = Boolean(failureReason);
  const skillChanges = members.flatMap((member) => {
    const previous = state.members.find((item) => item.id === member.id);
    return previous ? SKILLS.filter((skill) => member[skill] !== previous[skill]).map((skill) => ({ memberId: member.id, memberName: member.nickname || member.name, skill, before: previous[skill], after: member[skill], delta: Math.round((member[skill] - previous[skill]) * 10) / 10 })) : [];
  });
  const singleViewChanges = singles.filter((single) => (single.views ?? 0) > (state.singles.find((item) => item.id === single.id)?.views ?? 0)).map((single) => ({ singleId: single.id, title: single.title, gain: single.weeklyViewGain, total: single.views, viewWeek: single.viewWeeks }));
  const lastResult = {
    year: state.year,
    week: state.week,
    moneyDelta,
    fanGain,
    baseFanGain,
    fanGrowthMultiplier: weeklyFanCapMultiplier,
    fanTargetPerformance: annualFanPerformance,
    activities: Object.keys(weekSchedule).length,
    schedule: { ...weekSchedule },
    skillChanges,
    singleViewChanges,
    promotions: promotionResult.promotions,
    completedMentorships,
    concertSummary,
    yearEndMeetGreetSummary,
    statistics: {
      before: { money: state.money, fanbase: state.group.fanbase, popularity: state.group.popularity, fanTrust: state.group.fanTrust, reputation: state.group.reputation },
      after: { money: nextMoney, fanbase: group.fanbase, popularity: group.popularity, fanTrust: group.fanTrust, reputation: group.reputation },
      roster: { total: members.length, active: members.filter((member) => ['active', 'trainee'].includes(member.status)).length, eligible: eligibleCount, trainees: members.filter((member) => member.status === 'trainee').length, graduated: graduations.filter((item) => item.completed).length },
      dramaSuspensions: records.dramaSuspensions ?? 0,
      graduations: graduations.filter((item) => item.completed).length,
    },
    finances: { ...finances, totalIncome: finances.theater + finances.videoCall + finances.meetGreet + finances.media + finances.offAir + finances.liveStream + finances.concert + finances.twoShot + finances.otherIncome, totalExpenses: finances.activityCosts + finances.refunds + finances.generalOperations + finances.theaterUpkeep + finances.salary + finances.debtPayments + finances.loanPayment },
  };
  const annualReviews = state.week === BALANCE.weeksPerYear ? [...(state.annualReviews ?? []).filter((review) => review.year !== state.year), createAnnualReview(state, { group, members, lastResult, concerts, auditions, fanTargetPerformance: annualFanPerformance, fanTarget: currentFanTarget })] : (state.annualReviews ?? []);
  const resolvedTheaterShows = [...validTheaterDays].map((day) => {
    const configured = state.theaterShows?.[day];
    const setlist = SETLIST_BY_ID[configured?.setlistId] ?? SETLISTS[0];
    const lineup = members.filter((member) => weekSchedule[`${member.id}:${day}`] === 'theater');
    const center = lineup.find((member) => member.id === configured?.centerId) ?? lineup.toSorted((a, b) => b.performance - a.performance)[0];
    return { id: `theater-${state.year}-${state.week}-${day}`, year: state.year, week: state.week, day, setlistId: setlist.id, setlistTitle: setlist.title, centerId: center?.id, centerName: center?.nickname || center?.name, memberIds: lineup.map((member) => member.id), songs: setlist.songs, twoShot: twoShotRecords.find((record) => record.type === 'twoShotRoulette' && record.day === day) ?? null, ...theaterEconomics[day] };
  });
  lastResult.theaterShows = resolvedTheaterShows;
  const weeklyReports = [...(state.weeklyReports ?? []), lastResult];
  const nextConcertVenueOffers = year !== state.year ? generateConcertVenueOffers(state.seed, year, hasBonus(state, 'B007') ? bonusValue(state, 'B007') : 0) : state.concertVenueOffers;
  const chemistry = ensureChemistry(state, members);
  const fanTargetHistory = state.week === BALANCE.weeksPerYear ? [...(state.fanTargetHistory ?? []), { ...currentFanTarget, actualFanbase: group.fanbase, ...annualFanPerformance }] : (state.fanTargetHistory ?? []);
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
  if (!pendingOpportunity && !ended && rng() < 0.08) {
    const template = OPPORTUNITIES[randomInt(rng, 0, OPPORTUNITIES.length - 1)];
    const eligible = members.filter((member) => member.status === 'active').sort((a, b) => template.category === 'media' ? b.variety - a.variety : b.performance - a.performance);
    const memberIds = eligible.slice(0, Math.min(template.memberCount, eligible.length)).map((member) => member.id);
    pendingOpportunity = { ...template, id: `opportunity-${template.id}-${year}-${week}-${state.rngStep}`, offeredYear: year, offeredWeek: week, deadlineAbsolute: nextAbsolute + 2, memberIds };
    notifications.push({ type: 'success', text: `New opportunity: ${template.title}. Respond within two weeks.` });
  }
  const next = {
    ...state, year, week, members, unsignedMembers, singles, concerts, yearEndMeetGreets, auditions, auditionCampaign, mentorships, mentorshipHistory, chemistry, promotions, annualReviews, fanTarget, fanTargetHistory, fanTargetMetaReward, demandHistory: [...(state.demandHistory ?? []), ...weeklyDemandRecords].slice(-1000), pendingOpportunity, opportunityHistory, group, money: nextMoney, schedule: nextSchedule, theaterShows: {}, theaterHistory: [...(state.theaterHistory ?? []), ...resolvedTheaterShows].slice(-250), activityEvents: activityEvents.slice(-500), history: history.slice(0, 1000),
    notifications, activeDrama, dramaMemory, dramaCooldown, fanNarratives, graduations, departures, seitansaiObligations, records, failureCounters, weeklyReports, concertVenueOffers: nextConcertVenueOffers, ledger: resolvedLedger, loans: resolvedLoans, loanOffers: year !== state.year ? generateLoanOffers(state.seed, year) : state.loanOffers, fanEventPlans: (state.fanEventPlans ?? []).filter((plan) => !activatedPlans.includes(plan)), runStatus: ended ? 'ended' : 'active', rngStep: state.rngStep + 1,
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
  if (!availablePool.length) return state;
  const managementScore = state.group.fanTrust * 0.55 + state.group.reputation * 0.45;
  const intakeLimit = state.auditions.length === 0 ? 4 : Math.min(6, managementScore < 40 ? 3 : managementScore < 60 ? 4 : managementScore < 80 ? 5 : 6);
  const maxIntake = Math.min(intakeLimit, availablePool.length);
  const finalistBonus = bonusValue(state, 'B019');
  const applicantBonus = bonusValue(state, 'B022');
  const poolSize = Math.min(availablePool.length, Math.max(maxIntake, Math.ceil((maxIntake + 2 + finalistBonus) * (1 + applicantBonus))));
  const scoutingBonus = bonusValue(state, 'B020');
  const qualityBonus = Math.round((managementScore - 50) * 0.08);
  const candidatePool = availablePool.slice(0, poolSize).map((member) => makePoolCandidate(member, poolSize, qualityBonus));
  const campaign = { id: `audition-campaign-${state.year}-${startWeek}`, year: state.year, startYear: state.year, startWeek, phase: 'applications', progressWeeks: 0, durationWeeks: 5, maxIntake, finalistPoolSize: poolSize, candidatePool, selectedCandidateIds: [], cost: auditionCost, scoutingAccuracy: 1 + scoutingBonus, status: 'active' };
  return { ...state, money: state.money - auditionCost, auditionCampaign: campaign, history: [{ id: campaign.id, type: 'audition', title: 'Audition opens', detail: `Applications begin in Week ${startWeek}. Final selection completes after five weeks.`, year: state.year, week: state.week }, ...state.history] };
}

export function finalizeAudition(state, selectedCandidateIds = []) {
  const campaign = state.auditionCampaign;
  if (!campaign || campaign.status !== 'active' || campaign.progressWeeks < 4) return state;
  const validIds = [...new Set(selectedCandidateIds)].filter((id) => campaign.candidatePool.some((candidate) => candidate.id === id)).slice(0, campaign.maxIntake);
  return { ...state, auditionCampaign: { ...campaign, selectedCandidateIds: validIds } };
}

export function runAudition(state) {
  if (state.runStatus === 'ended') return state;
  const auditionCost = applyRate(97_500_000, bonusValue(state, 'B021'));
  if (state.week < BALANCE.auditionStartWeek || state.money < auditionCost || state.auditions.some((item) => item.year === state.year)) return state;
  const rng = createRng(hashSeed(`${state.seed}:audition:${state.year}`));
  const rosterIdentityIds = new Set(state.members.map((member) => member.identityId ?? member.id));
  const availablePool = shuffleWithRng((state.unsignedMembers ?? []).filter((member) => !rosterIdentityIds.has(member.identityId ?? member.id)), rng);
  if (!availablePool.length) return state;
  const cap = Math.min(availablePool.length, state.auditions.length === 0 ? 4 : Math.min(6, 3 + Math.floor((state.group.fanTrust * 0.55 + state.group.reputation * 0.45) / 20)));
  const finalistBonus = bonusValue(state, 'B019');
  const finalistPoolSize = Math.min(availablePool.length, cap + finalistBonus);
  const candidates = availablePool.slice(0, cap).map((member) => ({ ...makePoolCandidate(member, finalistPoolSize), joinedYear: state.year, joinedWeek: state.week }));
  const selectedPoolIds = new Set(candidates.map((candidate) => candidate.sourcePoolId));
  return { ...state, members: [...state.members, ...candidates.map(({ candidateId, sourcePoolId, ...candidate }) => ({ ...candidate, id: candidateId }))], unsignedMembers: availablePool.filter((member) => !selectedPoolIds.has(member.id)), money: state.money - auditionCost, auditions: [...state.auditions, { year: state.year, size: candidates.length, finalistPoolSize }], history: [{ id: `audition-${state.year}`, type: 'audition', title: `Generation ${candidates[0]?.generation.replace('GEN ', '')} selected`, detail: `${candidates.length} trainees join from ${finalistPoolSize} finalists after the Q4 audition.`, year: state.year, week: state.week }, ...state.history] };
}
