import dreamSetlistSongs from '../data/DreamSetlist_Songs.js';
import { CONCERT_BUDGETS, CONCERT_VENUES, DAYS, SINGLE_BUDGETS } from '../data/balance.js';
import { createRng, hashSeed, randomInt } from './rng.js';
import { resolveSousenkyo } from './campaigns/sousenkyoEngine.js';
import { resolveRequestHour } from './campaigns/requestHourEngine.js';
import { resolveJanken } from './campaigns/jankenEngine.js';
export { resolveJankenBracket } from './campaigns/jankenEngine.js';

export const CAMPAIGN_ROTATION = Object.freeze(['sousenkyo', 'request-hour', 'janken']);
export const CAMPAIGN_FIRST_YEAR = 2;
export const CAMPAIGN_MIN_DURATION = 8;
export const CAMPAIGN_MAX_DURATION = 16;
export const CAMPAIGN_WEEKS_PER_YEAR = 48;
export const CAMPAIGN_MV_PRODUCTION_WEEKS = 4;
export const CAMPAIGN_DEFAULT_CONCERT_DAY = 'Sat';
export const CAMPAIGN_TERMINAL_STATUSES = ['completed', 'cancelled', 'skipped'];
export const REQUEST_HOUR_TOP_COUNTS = Object.freeze([30, 40]);

export const normalizeRequestHourTopCount = (value) => Number(value) === 30 ? 30 : 40;

export function isMajorCampaignActive(state = {}) {
  return Boolean(state.campaign && !CAMPAIGN_TERMINAL_STATUSES.includes(state.campaign.status));
}

function campaignRanDuringYear(campaign, year) {
  if (!campaign || campaign.held === false) return false;
  const startYear = campaign.startYear ?? campaign.campaignYear;
  if (!Number.isInteger(startYear)) return false;
  if (!CAMPAIGN_TERMINAL_STATUSES.includes(campaign.status)) return startYear <= year;
  const lifecycleEndYear = [...(campaign.lifecycle ?? [])].reverse().find((entry) => Number.isInteger(entry?.year))?.year;
  const endYear = campaign.completedYear ?? campaign.archivedAt?.year ?? lifecycleEndYear ?? startYear;
  return startYear <= year && year <= endYear;
}

export function hasMajorCampaignRunInYear(state = {}, year = state.year) {
  if (!Number.isInteger(year)) return false;
  return [...(state.campaignHistory ?? []), state.campaign].some((campaign) => campaignRanDuringYear(campaign, year));
}

export function getMajorCampaignStartBlockReason(state = {}) {
  if (state.runStatus === 'ended') return 'run-ended';
  // Auditions do not consume campaign or Schedule slots and may run alongside
  // Sousenkyo, Request Hour, or Janken.
  if ((state.year ?? 0) < (state.firstCampaignYear ?? CAMPAIGN_FIRST_YEAR)) return 'campaigns-locked';
  if (isMajorCampaignActive(state)) return 'campaign-in-progress';
  if (hasMajorCampaignRunInYear(state)) return 'campaign-held-this-year';
  if ((state.singles ?? []).some((single) => single.status !== 'released')) return 'mv-in-progress';
  if (activeMembers(state.members ?? []).length < 12) return 'missing-members';
  return null;
}

export const clampCampaignDuration = (durationWeeks) => Math.max(CAMPAIGN_MIN_DURATION, Math.min(CAMPAIGN_MAX_DURATION, Math.round(Number(durationWeeks) || 12)));
export const campaignTypeForYear = (campaignYear, firstCampaignYear = CAMPAIGN_FIRST_YEAR) => campaignYear < firstCampaignYear ? null : CAMPAIGN_ROTATION[(campaignYear - firstCampaignYear) % CAMPAIGN_ROTATION.length];
const toCampaignAbsoluteWeek = (year, week) => (Math.max(1, Number(year) || 1) - 1) * CAMPAIGN_WEEKS_PER_YEAR + Math.max(1, Number(week) || 1);
const fromCampaignAbsoluteWeek = (absoluteWeek) => ({ year: Math.floor((absoluteWeek - 1) / CAMPAIGN_WEEKS_PER_YEAR) + 1, week: ((absoluteWeek - 1) % CAMPAIGN_WEEKS_PER_YEAR) + 1 });

export function campaignRevenuePerVote(group = {}) {
  const confidence = Math.max(0, Math.min(100, ((group.fanTrust ?? 50) + (group.reputation ?? 50)) / 2));
  return Math.round(5_000 + confidence * 50);
}

const canonicalSong = (songId) => dreamSetlistSongs.find((song) => song.id === songId) ?? null;
const activeMembers = (members = []) => members.filter((member) => ['active', 'trainee'].includes(member.status) && !member.temporarilyUnavailable);
const randomSongId = (rng) => dreamSetlistSongs[randomInt(rng, 0, dreamSetlistSongs.length - 1)]?.id ?? dreamSetlistSongs[0]?.id;
const validBudgetId = (catalog, id, fallback) => catalog.some((option) => option.id === id) ? id : fallback;
const appendLifecycle = (campaign, status, year, week) => ({ ...campaign, status, lifecycle: [...(campaign.lifecycle ?? []), { status, year, week }] });

function makeParticipants(type, members, rng) {
  const eligible = activeMembers(members);
  const memberIds = eligible.map((member) => member.id);
  const memberSnapshots = eligible.map((member) => ({
    memberId: member.id,
    name: member.name,
    nickname: member.nickname,
    photo: member.photo,
    generation: member.generation,
    team: member.team,
    vocal: member.vocal,
    dance: member.dance,
    performance: member.performance,
    mc: member.mc,
    variety: member.variety,
    stamina: member.stamina,
  }));
  if (type === 'sousenkyo') return { memberIds, memberSnapshots, votes: Object.fromEntries(memberIds.map((memberId) => [memberId, 0])) };
  if (type === 'request-hour') return { memberIds, memberSnapshots, songIds: dreamSetlistSongs.map((song) => song.id), votes: Object.fromEntries(dreamSetlistSongs.map((song) => [song.id, 0])) };
  const shuffled = [...eligible].sort(() => rng() - 0.5);
  // Janken is a pure luck bracket: there are no votes, support points, or
  // member-stat modifiers. The shuffled entrant order is the only setup input.
  return { memberIds: shuffled.map((member) => member.id), memberSnapshots };
}

function makeJankenBracketPreview(memberIds = []) {
  const bracketSize = 2 ** Math.ceil(Math.log2(Math.max(1, memberIds.length)));
  const entrants = [...memberIds, ...Array.from({ length: Math.max(0, bracketSize - memberIds.length) }, () => null)];
  return {
    bracketSize,
    rounds: [Array.from({ length: bracketSize / 2 }, (_, index) => ({
      match: index + 1,
      memberAId: entrants[index * 2] ?? null,
      memberBId: entrants[index * 2 + 1] ?? null,
      bye: !entrants[index * 2] || !entrants[index * 2 + 1],
    }))],
  };
}

export function createCampaignConfig({ campaignYear, configuredInYear = campaignYear, firstCampaignYear = CAMPAIGN_FIRST_YEAR, type = campaignTypeForYear(campaignYear, firstCampaignYear), startWeek = 1, durationWeeks = 12, budget = 0, concertBudgetId = 'standard', concertVenueId = 'hall', mvBudgetId = 'medium', concertDay = CAMPAIGN_DEFAULT_CONCERT_DAY, requestHourTopCount = 40, held = true } = {}) {
  if (!type) return null;
  const duration = clampCampaignDuration(durationWeeks);
  const safeStartWeek = Math.max(1, Math.round(Number(startWeek) || 1));
  const startAbsoluteWeek = toCampaignAbsoluteWeek(campaignYear, safeStartWeek);
  const endCalendar = fromCampaignAbsoluteWeek(startAbsoluteWeek + duration - 1);
  const resultCalendar = fromCampaignAbsoluteWeek(startAbsoluteWeek + duration);
  return { id: `campaign-${campaignYear}-${type}-${safeStartWeek}`, type, campaignYear, configuredInYear, startYear: campaignYear, startWeek: safeStartWeek, startAbsoluteWeek, durationWeeks: duration, endYear: endCalendar.year, endWeek: endCalendar.week, endAbsoluteWeek: startAbsoluteWeek + duration - 1, resultYear: resultCalendar.year, resultWeek: resultCalendar.week, resultAbsoluteWeek: startAbsoluteWeek + duration, budget: Math.max(0, Math.round(Number(budget) || 0)), concertBudgetId: validBudgetId(CONCERT_BUDGETS, concertBudgetId, 'standard'), concertVenueId: validBudgetId(CONCERT_VENUES, concertVenueId, 'hall'), mvBudgetId: validBudgetId(SINGLE_BUDGETS, mvBudgetId, 'medium'), concertDay: DAYS.includes(concertDay) ? concertDay : CAMPAIGN_DEFAULT_CONCERT_DAY, requestHourTopCount: type === 'request-hour' ? normalizeRequestHourTopCount(requestHourTopCount) : null, held: held !== false, configured: true };
}

export function configureNextCampaign(state, { startWeek = 1, durationWeeks = 12, budget = 0, type, concertBudgetId, concertVenueId, mvBudgetId, concertDay, requestHourTopCount, held } = {}) {
  const firstCampaignYear = state.firstCampaignYear ?? CAMPAIGN_FIRST_YEAR;
  const campaignYear = Math.max(firstCampaignYear, (state.year ?? 1) + 1);
  const expectedType = nextCampaignType(state);
  const campaignType = type ?? expectedType;
  if (!campaignType || campaignType !== expectedType) return state;
  const previous = state.nextCampaignConfig?.campaignYear === campaignYear ? state.nextCampaignConfig : {};
  return { ...state, nextCampaignConfig: createCampaignConfig({ campaignYear, configuredInYear: state.year, firstCampaignYear, type: campaignType, startWeek, durationWeeks, budget, concertBudgetId: concertBudgetId ?? previous.concertBudgetId ?? 'standard', concertVenueId: concertVenueId ?? previous.concertVenueId ?? 'hall', mvBudgetId: mvBudgetId ?? previous.mvBudgetId ?? 'medium', concertDay: concertDay ?? previous.concertDay ?? CAMPAIGN_DEFAULT_CONCERT_DAY, requestHourTopCount: requestHourTopCount ?? previous.requestHourTopCount ?? 40, held: held ?? previous.held ?? true }) };
}

export function nextCampaignType(state = {}) {
  const lastType = state.lastCampaignType ?? [...(state.campaignHistory ?? []), state.campaign].filter((entry) => entry?.type && entry.held !== false).at(-1)?.type;
  if (!lastType || !CAMPAIGN_ROTATION.includes(lastType)) return CAMPAIGN_ROTATION[0];
  return CAMPAIGN_ROTATION[(CAMPAIGN_ROTATION.indexOf(lastType) + 1) % CAMPAIGN_ROTATION.length];
}

export function startCampaign(state, { members = state.members ?? [], type = nextCampaignType(state), startWeek = state.week, durationWeeks = 12, budget = 0, concertBudgetId = 'standard', concertVenueId = 'hall', mvBudgetId = 'medium', concertDay = CAMPAIGN_DEFAULT_CONCERT_DAY, requestHourTopCount = 40 } = {}) {
  const firstCampaignYear = state.firstCampaignYear ?? CAMPAIGN_FIRST_YEAR;
  if (state.year < firstCampaignYear || !CAMPAIGN_ROTATION.includes(type) || getMajorCampaignStartBlockReason(state)) return state;
  const config = createCampaignConfig({ campaignYear: state.year, configuredInYear: state.year, type, startWeek: Math.max(state.week, startWeek), durationWeeks, budget, concertBudgetId, concertVenueId, mvBudgetId, concertDay, requestHourTopCount, held: true });
  const rng = createRng(hashSeed(`${state.seed}:campaign:${state.year}:${state.week}:${type}:${(state.campaignHistory ?? []).length}`));
  const campaign = initializeCampaign(config, members, rng);
  return { ...state, campaign, nextCampaignConfig: null, lastCampaignType: type, history: [{ id: `${campaign.id}-start`, type: 'campaign', campaignType: type, title: `${type} campaign scheduled`, detail: `Management chose to hold ${type} beginning in Year ${state.year}, Week ${state.week}.`, year: state.year, week: state.week }, ...(state.history ?? [])], notifications: [{ type: 'success', text: `${type} campaign scheduled.`, }, ...(state.notifications ?? [])].slice(0, 20) };
}

export function cancelCampaign(state, reason = 'Cancelled by management') {
  if (!state.campaign || ['completed', 'cancelled'].includes(state.campaign.status)) return state;
  const campaign = { ...state.campaign, status: 'cancelled', cancellationReason: reason, lifecycle: [...(state.campaign.lifecycle ?? []), { status: 'cancelled', year: state.year, week: state.week, reason }] };
  return { ...state, campaign, campaignHistory: [...(state.campaignHistory ?? []), { ...campaign, archivedAt: { year: state.year, week: state.week } }].slice(-24) };
}

function initializeCampaign(config, members, rng) {
  const participants = makeParticipants(config.type, members, rng);
  const campaign = {
    id: config.id, type: config.type, campaignYear: config.campaignYear, configuredInYear: config.configuredInYear, held: config.held !== false,
    status: 'configured', currentYear: config.startYear, currentWeek: config.startWeek, progressWeeks: 0, startYear: config.startYear, startWeek: config.startWeek, startAbsoluteWeek: config.startAbsoluteWeek, durationWeeks: config.durationWeeks, endYear: config.endYear, endWeek: config.endWeek, endAbsoluteWeek: config.endAbsoluteWeek, resultYear: config.resultYear, resultWeek: config.resultWeek, resultAbsoluteWeek: config.resultAbsoluteWeek,
    budget: config.budget, spent: 0, totalVotes: 0, votingRevenue: 0, weeklyVoteHistory: [], participants, liveStandings: [], result: null,
    concertBudgetId: config.concertBudgetId, concertVenueId: config.concertVenueId, concertDay: config.concertDay, mvBudgetId: config.mvBudgetId, requestHourTopCount: config.type === 'request-hour' ? normalizeRequestHourTopCount(config.requestHourTopCount) : null, rewardConcertId: null, rewardConcertStatus: null, rewardConcertYear: null, rewardConcertWeek: null, rewardConcertMemberIds: [], rewardConcertPerformerCount: 0, rewardConcertCompletedWeek: null, rewardSongId: null, underGirlsSongId: null, mvProjectId: null, underGirlsMvProjectId: null, mvProductionWeeks: 0, mvProductionDurationWeeks: CAMPAIGN_MV_PRODUCTION_WEEKS, bracket: config.type === 'janken' ? makeJankenBracketPreview(participants.memberIds) : null, lifecycle: [{ status: 'configured', year: config.campaignYear, week: config.startWeek }], history: [],
  };
  return campaign;
}

function voteMember(member, group, rng, type) {
  const base = type === 'sousenkyo'
    ? (member.popularity ?? 50) * 0.55 + (member.performance ?? 50) * 0.2 + (member.oshiSentiment ?? 0) * 1.5 + (member.fanbase ?? 0) / 100_000
    : 1 + (member.popularity ?? 50) / 30;
  return Math.max(1, Math.round(base * (0.9 + rng() * 0.2)));
}

function updateMemberStandings(campaign, members) {
  const byId = new Map(members.map((member) => [member.id, member]));
  const previousRanks = new Map((campaign.liveStandings ?? []).map((entry) => [entry.memberId, entry.rank]));
  return Object.entries(campaign.participants.votes ?? {})
    .map(([memberId, votes]) => ({ memberId, name: byId.get(memberId)?.nickname || byId.get(memberId)?.name || memberId, votes }))
    .sort((first, second) => second.votes - first.votes || first.memberId.localeCompare(second.memberId))
    .map((entry, index) => ({ ...entry, rank: index + 1, previousRank: previousRanks.get(entry.memberId) ?? null, movement: previousRanks.has(entry.memberId) ? previousRanks.get(entry.memberId) - (index + 1) : 0 }));
}

function updateSongStandings(campaign) {
  const previousRanks = new Map((campaign.liveStandings ?? []).map((entry) => [entry.songId, entry.rank]));
  return Object.entries(campaign.participants.votes ?? {})
    .map(([songId, votes]) => ({ songId, title: canonicalSong(songId)?.title ?? songId, votes }))
    .sort((first, second) => second.votes - first.votes || first.songId.localeCompare(second.songId))
    .map((entry, index) => ({ ...entry, rank: index + 1, previousRank: previousRanks.get(entry.songId) ?? null, movement: previousRanks.has(entry.songId) ? previousRanks.get(entry.songId) - (index + 1) : 0 }));
}

function sampleBinomial(trials, probability, rng) {
  if (trials <= 2_000) {
    let successes = 0;
    for (let index = 0; index < trials; index += 1) if (rng() < probability) successes += 1;
    return successes;
  }
  const mean = trials * probability;
  const deviation = Math.sqrt(trials * probability * (1 - probability));
  const normal = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, rng()))) * Math.cos(2 * Math.PI * rng());
  return Math.max(0, Math.min(trials, Math.round(mean + normal * deviation)));
}

function generateWeeklySupport(campaign, members, group, rng) {
  if (campaign.type === 'janken') return { participants: campaign.participants, votes: 0, revenue: 0, perVote: 0, ratePercent: 0, fanbase: group.fanbase ?? 0 };
  const active = activeMembers(members);
  const perVote = campaignRevenuePerVote(group);
  const fanbase = Math.max(0, Math.round(group.fanbase ?? 0));
  const ratePercent = randomInt(rng, 7, 15);
  const votes = Math.round(fanbase * ratePercent / 100);
  const nextParticipants = { ...campaign.participants, votes: { ...(campaign.participants.votes ?? {}) }, supports: { ...(campaign.participants.supports ?? {}) } };
  if (campaign.type === 'sousenkyo') {
    // Once SSK voting starts, every registered candidate remains eligible for
    // votes even when a temporary availability flag keeps them off schedules.
    const weighted = members
      .filter((member) => nextParticipants.votes[member.id] !== undefined)
      .map((member) => ({ id: member.id, weight: voteMember(member, group, rng, campaign.type) }));
    const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    const apportioned = weighted.map((entry) => {
      const exact = totalWeight ? votes * entry.weight / totalWeight : 0;
      return { ...entry, amount: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });
    let remainder = votes - apportioned.reduce((sum, entry) => sum + entry.amount, 0);
    apportioned.sort((first, second) => second.remainder - first.remainder || first.id.localeCompare(second.id));
    for (let index = 0; index < remainder; index += 1) apportioned[index % Math.max(1, apportioned.length)].amount += 1;
    apportioned.forEach(({ id, amount }) => { nextParticipants.votes[id] += amount; });
  } else if (campaign.type === 'request-hour') {
    const songs = campaign.participants.songIds ?? [];
    if (songs.length) {
      let remainingVotes = votes;
      songs.forEach((songId, index) => {
        const remainingSongs = songs.length - index;
        const amount = remainingSongs === 1 ? remainingVotes : sampleBinomial(remainingVotes, 1 / remainingSongs, rng);
        nextParticipants.votes[songId] += amount;
        remainingVotes -= amount;
      });
    }
  } else {
    active.forEach((member) => { if (nextParticipants.supports[member.id] !== undefined) nextParticipants.supports[member.id] += voteMember(member, group, rng, campaign.type); });
  }
  return { participants: nextParticipants, votes, revenue: votes * perVote, perVote, ratePercent, fanbase };
}

export function advanceCampaign(state, { year = state.year, week = state.week, members = state.members ?? [], group = state.group ?? {}, rng = createRng(hashSeed(`${state.seed}:campaign:${year}:${week}`)) } = {}) {
  let campaign = state.campaign ?? null;
  // No campaign is queued by the calendar. Legacy draft configs are ignored
  // so loading an older save cannot silently schedule an event.
  const nextCampaignConfig = null;
  const events = [];
  let revenue = 0;
  let perVote = 0;
  if (!campaign) return { campaign, nextCampaignConfig, campaignHistory: state.campaignHistory ?? [], revenue, perVote, events };
  if (campaign.type === 'request-hour' && !REQUEST_HOUR_TOP_COUNTS.includes(Number(campaign.requestHourTopCount))) {
    campaign = { ...campaign, requestHourTopCount: 40 };
  }
  const currentAbsoluteWeek = toCampaignAbsoluteWeek(year, week);
  const startAbsoluteWeek = campaign.startAbsoluteWeek ?? toCampaignAbsoluteWeek(campaign.campaignYear, campaign.startWeek);
  const endAbsoluteWeek = campaign.endAbsoluteWeek ?? toCampaignAbsoluteWeek(campaign.campaignYear, campaign.endWeek);
  const resultAbsoluteWeek = campaign.resultAbsoluteWeek ?? toCampaignAbsoluteWeek(campaign.campaignYear, campaign.resultWeek);
  campaign = { ...campaign, currentYear: year, currentWeek: week, progressWeeks: Math.max(0, Math.min(campaign.durationWeeks ?? CAMPAIGN_MAX_DURATION, currentAbsoluteWeek - startAbsoluteWeek + 1)) };
  if (campaign.status === 'configured' && currentAbsoluteWeek >= startAbsoluteWeek) {
    campaign = appendLifecycle(campaign, 'announced', year, week);
    campaign = appendLifecycle(campaign, 'registration', year, week);
  }
  if (campaign.status === 'registration' && currentAbsoluteWeek > startAbsoluteWeek) campaign = appendLifecycle(campaign, 'active', year, week);
  if (['registration', 'active'].includes(campaign.status) && currentAbsoluteWeek >= startAbsoluteWeek && currentAbsoluteWeek <= endAbsoluteWeek && campaign.status === 'active') {
    const generated = generateWeeklySupport(campaign, members, group, rng);
    campaign = { ...campaign, participants: generated.participants, totalVotes: (campaign.totalVotes ?? 0) + generated.votes, votingRevenue: (campaign.votingRevenue ?? 0) + generated.revenue, weeklyVoteHistory: [...(campaign.weeklyVoteHistory ?? []), { year, week, ratePercent: generated.ratePercent, fanbase: generated.fanbase, votes: generated.votes, revenue: generated.revenue, perVote: generated.perVote }], liveStandings: campaign.type === 'request-hour' ? updateSongStandings({ ...campaign, participants: generated.participants }) : campaign.type === 'sousenkyo' ? updateMemberStandings({ ...campaign, participants: generated.participants }, members) : campaign.liveStandings };
    revenue += generated.revenue;
    perVote = generated.perVote;
    if (currentAbsoluteWeek >= endAbsoluteWeek) campaign = appendLifecycle(campaign, 'locked', year, week);
  }
  if (campaign.status === 'concert-scheduled') {
    const rewardConcert = (state.concerts ?? []).find((concert) => concert.id === campaign.rewardConcertId || concert.campaignId === campaign.id);
    if (rewardConcert?.status === 'completed') {
      campaign = appendLifecycle({ ...campaign, rewardConcertStatus: 'completed', rewardConcertCompletedWeek: week }, 'mv-pending', year, week);
      campaign = { ...campaign, status: 'mv-pending' };
      events.push({ type: 'campaign-concert-complete', campaignType: campaign.type, result: campaign.result });
    }
  }
  if (campaign.status === 'mv-budget-pending' && (state.money ?? 0) >= (campaign.mvBudgetCost ?? 0)) {
    campaign = { ...campaign, status: 'mv-production', mvProductionWeeks: -1, mvProductionDurationWeeks: CAMPAIGN_MV_PRODUCTION_WEEKS, mvProjectId: `mv-campaign-${campaign.id}` };
  }
  if (campaign.status === 'mv-pending') {
    campaign = { ...campaign, status: 'mv-production', mvProductionWeeks: -1, mvProductionDurationWeeks: CAMPAIGN_MV_PRODUCTION_WEEKS, mvProjectId: `mv-campaign-${campaign.id}` };
  }
  if (campaign.status === 'locked' && currentAbsoluteWeek >= resultAbsoluteWeek) {
    campaign = campaign.type === 'sousenkyo' ? resolveSousenkyo(campaign, members, rng) : campaign.type === 'request-hour' ? resolveRequestHour(campaign, rng) : resolveJanken(campaign, rng);
    campaign = appendLifecycle(campaign, 'result', year, week);
    events.push({ type: 'campaign-result', campaignType: campaign.type, result: campaign.result });
    campaign = { ...campaign, status: 'concert-pending', rewardConcertStatus: 'pending', mvProductionWeeks: 0, mvProductionDurationWeeks: CAMPAIGN_MV_PRODUCTION_WEEKS, mvProjectId: null };
  } else if (campaign.status === 'mv-production') {
    const mvProductionWeeks = (campaign.mvProductionWeeks ?? 0) + 1;
    campaign = { ...campaign, mvProductionWeeks };
    if (mvProductionWeeks >= (campaign.mvProductionDurationWeeks ?? CAMPAIGN_MV_PRODUCTION_WEEKS)) {
      campaign = appendLifecycle(campaign, 'completed', year, week);
      campaign = { ...campaign, completedYear: year, completedWeek: week };
      events.push({ type: 'campaign-complete', campaignType: campaign.type, result: campaign.result });
    }
  }
  const history = ['completed', 'skipped'].includes(campaign.status) || campaign.status === 'result' && campaign.type !== 'request-hour'
    ? [...(state.campaignHistory ?? []).filter((entry) => entry.id !== campaign.id), { ...campaign, archivedAt: { year, week } }]
    : (state.campaignHistory ?? []);
  return { campaign, nextCampaignConfig, campaignHistory: history.slice(-24), revenue, perVote, events };
}
