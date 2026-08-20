import dreamSetlistSongs from '../data/DreamSetlist_Songs.js';
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

export const clampCampaignDuration = (durationWeeks) => Math.max(CAMPAIGN_MIN_DURATION, Math.min(CAMPAIGN_MAX_DURATION, Math.round(Number(durationWeeks) || 12)));
export const campaignTypeForYear = (campaignYear, firstCampaignYear = CAMPAIGN_FIRST_YEAR) => campaignYear < firstCampaignYear ? null : CAMPAIGN_ROTATION[(campaignYear - firstCampaignYear) % CAMPAIGN_ROTATION.length];

export function campaignRevenuePerVote(group = {}) {
  const confidence = Math.max(0, Math.min(100, ((group.fanTrust ?? 50) + (group.reputation ?? 50)) / 2));
  return Math.round(5_000 + confidence * 50);
}

const canonicalSong = (songId) => dreamSetlistSongs.find((song) => song.id === songId) ?? null;
const activeMembers = (members = []) => members.filter((member) => ['active', 'trainee'].includes(member.status) && !member.graduationPending && !member.temporarilyUnavailable);
const randomSongId = (rng) => dreamSetlistSongs[randomInt(rng, 0, dreamSetlistSongs.length - 1)]?.id ?? dreamSetlistSongs[0]?.id;
const appendLifecycle = (campaign, status, year, week) => ({ ...campaign, status, lifecycle: [...(campaign.lifecycle ?? []), { status, year, week }] });

function makeParticipants(type, members, rng) {
  const eligible = activeMembers(members);
  if (type === 'sousenkyo') return { memberIds: eligible.map((member) => member.id), votes: Object.fromEntries(eligible.map((member) => [member.id, 0])) };
  if (type === 'request-hour') return { songIds: dreamSetlistSongs.map((song) => song.id), votes: Object.fromEntries(dreamSetlistSongs.map((song) => [song.id, 0])) };
  const shuffled = [...eligible].sort(() => rng() - 0.5);
  return { memberIds: shuffled.map((member) => member.id), supports: Object.fromEntries(shuffled.map((member) => [member.id, 0])) };
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

export function createCampaignConfig({ campaignYear, configuredInYear = Math.max(1, campaignYear - 1), firstCampaignYear = CAMPAIGN_FIRST_YEAR, type = campaignTypeForYear(campaignYear, firstCampaignYear), startWeek = 1, durationWeeks = 12, budget = 0 } = {}) {
  if (!type) return null;
  const duration = clampCampaignDuration(durationWeeks);
  const safeStartWeek = Math.max(1, Math.min(CAMPAIGN_WEEKS_PER_YEAR - duration, Math.round(Number(startWeek) || 1)));
  return { id: `campaign-${campaignYear}-${type}`, type, campaignYear, configuredInYear, startWeek: safeStartWeek, durationWeeks: duration, endWeek: safeStartWeek + duration - 1, resultWeek: safeStartWeek + duration, budget: Math.max(0, Math.round(Number(budget) || 0)), configured: true };
}

export function configureNextCampaign(state, { startWeek = 1, durationWeeks = 12, budget = 0, type } = {}) {
  const firstCampaignYear = state.firstCampaignYear ?? CAMPAIGN_FIRST_YEAR;
  const campaignYear = Math.max(firstCampaignYear, (state.year ?? 1) + 1);
  const expectedType = campaignTypeForYear(campaignYear, firstCampaignYear);
  const campaignType = type ?? expectedType;
  if (!campaignType || campaignType !== expectedType) return state;
  return { ...state, nextCampaignConfig: createCampaignConfig({ campaignYear, configuredInYear: state.year, firstCampaignYear, type: campaignType, startWeek, durationWeeks, budget }) };
}

export function cancelCampaign(state, reason = 'Cancelled by management') {
  if (!state.campaign || ['completed', 'cancelled'].includes(state.campaign.status)) return state;
  const campaign = { ...state.campaign, status: 'cancelled', cancellationReason: reason, lifecycle: [...(state.campaign.lifecycle ?? []), { status: 'cancelled', year: state.year, week: state.week, reason }] };
  return { ...state, campaign, campaignHistory: [...(state.campaignHistory ?? []), { ...campaign, archivedAt: { year: state.year, week: state.week } }].slice(-24) };
}

function initializeCampaign(config, members, rng) {
  const participants = makeParticipants(config.type, members, rng);
  const campaign = {
    id: config.id, type: config.type, campaignYear: config.campaignYear, configuredInYear: config.configuredInYear,
    status: 'configured', currentWeek: config.startWeek, startWeek: config.startWeek, durationWeeks: config.durationWeeks, endWeek: config.endWeek, resultWeek: config.resultWeek,
    budget: config.budget, spent: 0, totalVotes: 0, votingRevenue: 0, participants, liveStandings: [], result: null,
    rewardSongId: null, mvProjectId: null, mvProductionWeeks: 0, mvProductionDurationWeeks: CAMPAIGN_MV_PRODUCTION_WEEKS, bracket: config.type === 'janken' ? makeJankenBracketPreview(participants.memberIds) : null, lifecycle: [{ status: 'configured', year: config.campaignYear, week: config.startWeek }], history: [],
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

function generateWeeklySupport(campaign, members, group, rng) {
  const active = activeMembers(members);
  const perVote = campaignRevenuePerVote(group);
  let votes = 0;
  const nextParticipants = { ...campaign.participants, votes: { ...(campaign.participants.votes ?? {}) }, supports: { ...(campaign.participants.supports ?? {}) } };
  if (campaign.type === 'sousenkyo') {
    active.forEach((member) => { if (nextParticipants.votes[member.id] !== undefined) { const amount = voteMember(member, group, rng, campaign.type); nextParticipants.votes[member.id] += amount; votes += amount; } });
  } else if (campaign.type === 'request-hour') {
    const songs = campaign.participants.songIds ?? [];
    const ballots = Math.max(1, Math.round((group.fanbase ?? 0) / 25_000));
    for (let index = 0; index < ballots; index += 1) { const songId = songs[randomInt(rng, 0, songs.length - 1)]; nextParticipants.votes[songId] += 1; votes += 1; }
  } else {
    active.forEach((member) => { if (nextParticipants.supports[member.id] !== undefined) { const amount = voteMember(member, group, rng, campaign.type); nextParticipants.supports[member.id] += amount; votes += amount; } });
  }
  return { participants: nextParticipants, votes, revenue: votes * perVote, perVote };
}

export function advanceCampaign(state, { year = state.year, week = state.week, members = state.members ?? [], group = state.group ?? {}, rng = createRng(hashSeed(`${state.seed}:campaign:${year}:${week}`)) } = {}) {
  let campaign = state.campaign ?? null;
  let nextCampaignConfig = state.nextCampaignConfig ?? null;
  const events = [];
  let revenue = 0;
  let perVote = 0;
  const firstCampaignYear = state.firstCampaignYear ?? CAMPAIGN_FIRST_YEAR;
  if (!nextCampaignConfig && year + 1 >= firstCampaignYear) nextCampaignConfig = createCampaignConfig({ campaignYear: Math.max(firstCampaignYear, year + 1), configuredInYear: year, firstCampaignYear });
  const canOpenNewCampaign = !campaign || campaign.campaignYear === year || ['completed', 'cancelled'].includes(campaign.status);
  if ((!campaign || (campaign.campaignYear < year && canOpenNewCampaign)) && year >= firstCampaignYear) {
    const config = nextCampaignConfig?.campaignYear === year ? nextCampaignConfig : createCampaignConfig({ campaignYear: year, configuredInYear: year - 1, firstCampaignYear });
    campaign = initializeCampaign(config, members, rng);
    nextCampaignConfig = nextCampaignConfig?.campaignYear === year + 1 ? nextCampaignConfig : createCampaignConfig({ campaignYear: year + 1, configuredInYear: year, firstCampaignYear });
    events.push({ type: 'campaign', title: `${config.type} campaign opens`, detail: `Year ${year} campaign enters registration.` });
  }
  if (!campaign || (campaign.campaignYear !== year && campaign.status !== 'mv-production')) return { campaign, nextCampaignConfig, campaignHistory: state.campaignHistory ?? [], revenue, perVote, events };
  campaign = { ...campaign, currentWeek: week };
  if (campaign.status === 'configured' && week >= campaign.startWeek) {
    campaign = appendLifecycle(campaign, 'announced', year, week);
    campaign = appendLifecycle(campaign, 'registration', year, week);
  }
  if (campaign.status === 'registration' && week > campaign.startWeek) campaign = appendLifecycle(campaign, 'active', year, week);
  if (['registration', 'active'].includes(campaign.status) && week >= campaign.startWeek && week <= campaign.endWeek && campaign.status === 'active') {
    const generated = generateWeeklySupport(campaign, members, group, rng);
    campaign = { ...campaign, participants: generated.participants, totalVotes: (campaign.totalVotes ?? 0) + generated.votes, votingRevenue: (campaign.votingRevenue ?? 0) + generated.revenue, liveStandings: campaign.type === 'request-hour' ? updateSongStandings({ ...campaign, participants: generated.participants }) : campaign.type === 'sousenkyo' ? updateMemberStandings({ ...campaign, participants: generated.participants }, members) : campaign.liveStandings };
    revenue += generated.revenue;
    perVote = generated.perVote;
    if (week >= campaign.endWeek) campaign = appendLifecycle(campaign, 'locked', year, week);
  }
  if (campaign.status === 'locked' && week >= campaign.resultWeek) {
    campaign = campaign.type === 'sousenkyo' ? resolveSousenkyo(campaign, members, rng) : campaign.type === 'request-hour' ? resolveRequestHour(campaign, rng) : resolveJanken(campaign, rng);
    campaign = appendLifecycle(campaign, 'result', year, week);
    events.push({ type: 'campaign-result', campaignType: campaign.type, result: campaign.result });
    campaign = { ...campaign, status: 'mv-production', mvProductionWeeks: 0, mvProductionDurationWeeks: CAMPAIGN_MV_PRODUCTION_WEEKS, mvProjectId: `mv-campaign-${campaign.id}` };
  } else if (campaign.status === 'mv-production') {
    const mvProductionWeeks = (campaign.mvProductionWeeks ?? 0) + 1;
    campaign = { ...campaign, mvProductionWeeks };
    if (mvProductionWeeks >= (campaign.mvProductionDurationWeeks ?? CAMPAIGN_MV_PRODUCTION_WEEKS)) {
      campaign = appendLifecycle(campaign, 'completed', year, week);
      campaign = { ...campaign, completedYear: year, completedWeek: week };
      events.push({ type: 'campaign-complete', campaignType: campaign.type, result: campaign.result });
    }
  }
  const history = campaign.status === 'completed' || campaign.status === 'result' && campaign.type !== 'request-hour'
    ? [...(state.campaignHistory ?? []).filter((entry) => entry.id !== campaign.id), { ...campaign, archivedAt: { year, week } }]
    : (state.campaignHistory ?? []);
  return { campaign, nextCampaignConfig, campaignHistory: history.slice(-24), revenue, perVote, events };
}
