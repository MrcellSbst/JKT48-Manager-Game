import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_ROTATION, advanceCampaign, campaignRevenuePerVote, campaignTypeForYear, clampCampaignDuration, configureNextCampaign, createCampaignConfig, getMajorCampaignStartBlockReason, hasMajorCampaignRunInYear, nextCampaignType, startCampaign } from '../src/engine/campaignEngine.js';
import { resolveJanken, resolveJankenBracket } from '../src/engine/campaigns/jankenEngine.js';
import { resolveRequestHour } from '../src/engine/campaigns/requestHourEngine.js';
import { resolveSousenkyo } from '../src/engine/campaigns/sousenkyoEngine.js';
import dreamSetlistSongs from '../src/data/DreamSetlist_Songs.js';
import { createRng, hashSeed } from '../src/engine/rng.js';

const members = (count = 30) => Array.from({ length: count }, (_, index) => ({ id: `member-${index}`, name: `Member ${index}`, status: 'active', popularity: 40 + index, performance: 50, fanbase: 10_000, oshiSentiment: 0 }));

test('campaign rotation starts in Year 2 and cycles SSK, Request Hour, Janken', () => {
  assert.equal(campaignTypeForYear(1), null);
  assert.deepEqual([2, 3, 4, 5].map((year) => campaignTypeForYear(year)), CAMPAIGN_ROTATION.concat('sousenkyo'));
  assert.equal(nextCampaignType({ year: 8, week: 1, campaign: null, campaignHistory: [] }), 'sousenkyo');
  assert.equal(nextCampaignType({ year: 8, week: 1, lastCampaignType: 'sousenkyo' }), 'request-hour');
  assert.equal(nextCampaignType({ year: 99, week: 48, lastCampaignType: 'request-hour' }), 'janken');
});

test('campaign duration clamps to eight through sixteen weeks', () => {
  assert.equal(clampCampaignDuration(2), 8);
  assert.equal(clampCampaignDuration(20), 16);
  assert.equal(createCampaignConfig({ campaignYear: 2, durationWeeks: 11 }).resultWeek, 12);
});

test('campaign configuration persists reward concert and MV budgets', () => {
  const configured = configureNextCampaign({ year: 1, firstCampaignYear: 2, nextCampaignConfig: null }, { startWeek: 9, durationWeeks: 14, concertBudgetId: 'major', concertVenueId: 'arena', mvBudgetId: 'high' });
  assert.equal(configured.nextCampaignConfig.startWeek, 9);
  assert.equal(configured.nextCampaignConfig.durationWeeks, 14);
  assert.equal(configured.nextCampaignConfig.concertBudgetId, 'major');
  assert.equal(configured.nextCampaignConfig.concertVenueId, 'arena');
  assert.equal(configured.nextCampaignConfig.mvBudgetId, 'high');
  assert.equal(configured.nextCampaignConfig.held, true);
  const retimed = configureNextCampaign(configured, { startWeek: 12, durationWeeks: 14 });
  assert.equal(retimed.nextCampaignConfig.startWeek, 12);
  assert.equal(retimed.nextCampaignConfig.concertBudgetId, 'major');
  assert.equal(retimed.nextCampaignConfig.concertVenueId, 'arena');
  assert.equal(retimed.nextCampaignConfig.mvBudgetId, 'high');
});

test('campaigns are optional and waiting does not auto-open or advance rotation', () => {
  const roster = members(16);
  const base = { seed: 'campaign-optional', year: 2, week: 1, members: roster, group: { fanTrust: 55, reputation: 60, fanbase: 150_000 }, campaign: null, nextCampaignConfig: null, campaignHistory: [], lastCampaignType: null, runStatus: 'active' };
  const idle = advanceCampaign(base, { year: 8, week: 24, members: roster, group: base.group, rng: createRng(hashSeed('optional-idle')) });
  assert.equal(idle.campaign, null);
  assert.equal(idle.nextCampaignConfig, null);
  assert.equal(nextCampaignType({ ...base, year: 8, week: 24 }), 'sousenkyo');
  const started = startCampaign({ ...base, year: 8, week: 24 }, { members: roster, durationWeeks: 10 });
  assert.equal(started.campaign.type, 'sousenkyo');
  assert.equal(started.campaign.status, 'configured');
  const heldThenWaited = { ...started, campaign: { ...started.campaign, status: 'completed' }, year: 20, week: 48 };
  assert.equal(nextCampaignType(heldThenWaited), 'request-hour');
});

test('only one major campaign can run in a calendar year', () => {
  const roster = members(16);
  const base = { seed: 'annual-campaign-lock', year: 2, week: 2, members: roster, singles: [], group: { fanTrust: 55, reputation: 60, fanbase: 150_000 }, campaign: null, nextCampaignConfig: null, campaignHistory: [], lastCampaignType: null, runStatus: 'active' };
  const first = startCampaign(base, { members: roster, type: 'sousenkyo', durationWeeks: 8 });
  const completedCampaign = { ...first.campaign, status: 'completed', completedYear: 2, completedWeek: 14, lifecycle: [...first.campaign.lifecycle, { status: 'completed', year: 2, week: 14 }] };
  const completed = { ...first, year: 2, week: 24, campaign: completedCampaign, campaignHistory: [{ ...completedCampaign, archivedAt: { year: 2, week: 14 } }] };

  assert.equal(hasMajorCampaignRunInYear(completed, 2), true);
  assert.equal(getMajorCampaignStartBlockReason(completed), 'campaign-held-this-year');
  assert.equal(startCampaign(completed, { members: roster, type: 'request-hour', durationWeeks: 8 }), completed);

  const nextYear = { ...completed, year: 3, week: 1 };
  assert.equal(hasMajorCampaignRunInYear(nextYear, 3), false);
  const second = startCampaign(nextYear, { members: roster, type: 'request-hour', durationWeeks: 8 });
  assert.equal(second.campaign.type, 'request-hour');
  assert.equal(second.campaign.campaignYear, 3);
});

test('campaign years consumed by a cross-year campaign cannot host another campaign', () => {
  const crossYear = { id: 'cross-year', type: 'sousenkyo', held: true, status: 'completed', campaignYear: 2, startYear: 2, completedYear: 3, lifecycle: [{ status: 'configured', year: 2, week: 46 }, { status: 'completed', year: 3, week: 12 }] };
  const state = { year: 3, week: 20, campaign: crossYear, campaignHistory: [crossYear], singles: [], runStatus: 'active' };
  assert.equal(hasMajorCampaignRunInYear(state, 2), true);
  assert.equal(hasMajorCampaignRunInYear(state, 3), true);
  assert.equal(getMajorCampaignStartBlockReason(state), 'campaign-held-this-year');
});

test('unreleased regular MV blocks a major campaign start', () => {
  const roster = members(16);
  const state = { seed: 'mv-blocks-campaign', year: 2, week: 1, members: roster, singles: [{ id: 'single-active', status: 'production' }], group: { fanTrust: 55, reputation: 60, fanbase: 150_000 }, campaign: null, campaignHistory: [], runStatus: 'active' };
  assert.equal(getMajorCampaignStartBlockReason(state), 'mv-in-progress');
  assert.equal(startCampaign(state, { members: roster, type: 'sousenkyo', durationWeeks: 8 }), state);
});

test('major campaign start reports a missing-member blocker', () => {
  const roster = members(11);
  const state = { seed: 'campaign-roster-block', year: 2, week: 1, members: roster, singles: [], group: { fanTrust: 55, reputation: 60, fanbase: 150_000 }, campaign: null, campaignHistory: [], runStatus: 'active' };
  assert.equal(getMajorCampaignStartBlockReason(state), 'missing-members');
  assert.equal(startCampaign(state, { members: roster, type: 'sousenkyo', durationWeeks: 8 }), state);
});

test('every major campaign persists its member entrants and roster snapshots', () => {
  const roster = members(16);
  const expectedIds = roster.map((member) => member.id).sort();
  for (const type of CAMPAIGN_ROTATION) {
    const started = startCampaign({ seed: `participant-snapshot-${type}`, year: 2, week: 1, runStatus: 'active', members: roster, group: { fanTrust: 55, reputation: 60, fanbase: 150_000 }, campaign: null, campaignHistory: [] }, { type, durationWeeks: 8 });
    assert.deepEqual([...started.campaign.participants.memberIds].sort(), expectedIds);
    assert.equal(started.campaign.participants.memberSnapshots.length, roster.length);
    assert.deepEqual(started.campaign.participants.memberSnapshots.map((member) => member.memberId).sort(), expectedIds);
    assert.equal(started.campaign.participants.memberSnapshots[0].name, roster[0].name);
  }
});

test('Sousenkyo ranks members, creates Senbatsu and only creates Undergirls with 24 participants', () => {
  const campaign = { participants: { votes: Object.fromEntries(members(30).map((member, index) => [member.id, index])) } };
  const result = resolveSousenkyo(campaign, members(30), createRng(hashSeed('ssk')));
  assert.equal(result.result.winnerMemberId, 'member-29');
  assert.equal(result.result.senbatsu.length, 12);
  assert.equal(result.result.undergirls.length, 12);
  assert.ok(result.result.underGirlsSongId);
  assert.notEqual(result.result.underGirlsSongId, result.result.rewardSongId);
  const small = resolveSousenkyo({ participants: { votes: Object.fromEntries(members(12).map((member) => [member.id, 1])) } }, members(12), createRng(hashSeed('ssk-small')));
  assert.deepEqual(small.result.undergirls, []);
  assert.equal(small.result.underGirlsSongId, null);
  assert.ok(dreamSetlistSongs.some((song) => song.id === result.rewardSongId));
});

test('Request Hour only uses canonical DreamSetlist songs', () => {
  const campaign = { participants: { votes: { [dreamSetlistSongs[0].id]: 8, [dreamSetlistSongs[1].id]: 2 } } };
  const result = resolveRequestHour(campaign, createRng(hashSeed('rh')));
  assert.equal(result.result.winnerSongId, dreamSetlistSongs[0].id);
  assert.ok(result.result.standings.every((entry) => dreamSetlistSongs.some((song) => song.id === entry.songId)));
});

test('Janken bracket uses byes and seeded RPS, independent of member stats', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const first = resolveJankenBracket(ids, 'janken-seed');
  const second = resolveJankenBracket(ids, 'janken-seed');
  assert.deepEqual(first, second);
  assert.equal(first.bracketSize, 8);
  assert.ok(first.rounds.some((round) => round.matches.some((match) => match.bye)));
  assert.ok(ids.includes(first.winnerMemberId));
});

test('Janken is pure luck and never uses votes, support, or member stats', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const campaign = { id: 'campaign-janken-luck', campaignYear: 8, participants: { memberIds: ids, supports: Object.fromEntries(ids.map((id) => [id, 999_999])) }, totalVotes: 999_999, votingRevenue: 123_456 };
  const first = resolveJanken(campaign, createRng(hashSeed('janken-luck')));
  const second = resolveJanken({ ...campaign, participants: { memberIds: ids, supports: Object.fromEntries(ids.map((id) => [id, 0])) } }, createRng(hashSeed('janken-luck')));
  assert.equal(first.result.winnerMemberId, second.result.winnerMemberId);
  assert.equal(first.totalVotes, 0);
  assert.equal(first.votingRevenue, 0);
  assert.deepEqual(first.liveStandings, []);
  const state = startCampaign({ seed: 'janken-no-vote', year: 2, week: 1, runStatus: 'active', members: members(16), group: { fanTrust: 80, reputation: 80, fanbase: 500_000 }, campaign: null, campaignHistory: [] }, { type: 'janken', durationWeeks: 8 });
  const opened = advanceCampaign(state, { year: 2, week: 1, members: state.members, group: state.group, rng: createRng(hashSeed('janken-no-vote-week')) });
  assert.equal(opened.campaign.totalVotes, 0);
  assert.equal(opened.campaign.votingRevenue, 0);
});

test('campaign revenue per vote stays within configured trust and reputation range', () => {
  assert.equal(campaignRevenuePerVote({ fanTrust: 0, reputation: 0 }), 5_000);
  assert.equal(campaignRevenuePerVote({ fanTrust: 100, reputation: 100 }), 10_000);
});

test('SSK and Request Hour generate an exact seeded 7-15 percent fanbase vote pool', () => {
  const roster = members(24);
  const group = { fanTrust: 55, reputation: 60, fanbase: 1_234_567 };
  for (const type of ['sousenkyo', 'request-hour']) {
    const base = { seed: `vote-pool-${type}`, year: 2, week: 1, members: roster, group, campaign: null, nextCampaignConfig: null, campaignHistory: [], runStatus: 'active' };
    let state = startCampaign(base, { members: roster, type, startWeek: 1, durationWeeks: 8 });
    state = advanceCampaign(state, { year: 2, week: 1, members: roster, group, rng: createRng(hashSeed(`${type}-registration`)) });
    state = advanceCampaign({ ...base, ...state }, { year: 2, week: 2, members: roster, group, rng: createRng(hashSeed(`${type}-voting`)) });
    const weekly = state.campaign.weeklyVoteHistory[0];
    assert.ok(weekly.ratePercent >= 7 && weekly.ratePercent <= 15);
    assert.equal(weekly.votes, Math.round(group.fanbase * weekly.ratePercent / 100));
    assert.equal(weekly.revenue, weekly.votes * weekly.perVote);
    assert.equal(Object.values(state.campaign.participants.votes).reduce((sum, value) => sum + value, 0), weekly.votes);
  }
});

test('campaign advance creates Year 2 registration, active voting, and result lifecycle', () => {
  const roster = members(16);
  const base = { seed: 'campaign-lifecycle', year: 2, week: 1, members: roster, group: { fanTrust: 55, reputation: 60, fanbase: 150_000 }, campaign: null, nextCampaignConfig: null, campaignHistory: [] };
  const started = startCampaign({ ...base, runStatus: 'active' }, { members: roster, type: 'sousenkyo', startWeek: 1, durationWeeks: 12 });
  const opened = advanceCampaign({ ...base, ...started }, { year: 2, week: 1, members: roster, group: base.group, rng: createRng(hashSeed('week1')) });
  assert.equal(opened.campaign.type, 'sousenkyo');
  assert.equal(opened.campaign.status, 'registration');
  const active = advanceCampaign({ ...base, ...opened }, { year: 2, week: 2, members: roster, group: base.group, rng: createRng(hashSeed('week2')) });
  assert.equal(active.campaign.status, 'active');
  assert.ok(active.campaign.totalVotes > 0);
  let result = active;
  for (let week = 3; week <= 13; week += 1) result = advanceCampaign({ ...base, ...result }, { year: 2, week, members: roster, group: base.group, rng: createRng(hashSeed(`week${week}`)) });
  assert.equal(result.campaign.status, 'concert-pending');
  assert.ok(result.campaign.result.winnerMemberId);
  const rewardConcert = { id: `campaign-concert-${result.campaign.id}`, campaignId: result.campaign.id, status: 'completed', targetYear: 2, targetWeek: 16 };
  result = advanceCampaign({ ...base, ...result, campaign: { ...result.campaign, status: 'concert-scheduled', rewardConcertId: rewardConcert.id }, concerts: [rewardConcert] }, { year: 2, week: 16, members: roster, group: base.group, rng: createRng(hashSeed('week16')) });
  assert.equal(result.campaign.status, 'mv-production');
  for (let week = 17; week <= 20; week += 1) result = advanceCampaign({ ...base, ...result, concerts: [rewardConcert] }, { year: 2, week, members: roster, group: base.group, rng: createRng(hashSeed(`week${week}`)) });
  assert.equal(result.campaign.status, 'completed');
});

test('a user-started campaign can span the year boundary without moving its dates', () => {
  const roster = members(16);
  const base = { seed: 'campaign-cross-year', year: 2, week: 46, members: roster, group: { fanTrust: 55, reputation: 60, fanbase: 150_000 }, campaign: null, nextCampaignConfig: null, campaignHistory: [], runStatus: 'active' };
  let state = startCampaign(base, { members: roster, type: 'sousenkyo', durationWeeks: 8 });
  assert.equal(state.campaign.startYear, 2);
  assert.equal(state.campaign.startWeek, 46);
  assert.equal(state.campaign.endYear, 3);
  assert.equal(state.campaign.endWeek, 5);
  state = advanceCampaign(state, { year: 2, week: 46, members: roster, group: base.group, rng: createRng(hashSeed('cross-46')) });
  assert.equal(state.campaign.status, 'registration');
  for (const [year, week] of [[2, 47], [2, 48], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5]]) {
    state = advanceCampaign(state, { year, week, members: roster, group: base.group, rng: createRng(hashSeed(`cross-${year}-${week}`)) });
  }
  assert.equal(state.campaign.status, 'locked');
  state = advanceCampaign(state, { year: 3, week: 6, members: roster, group: base.group, rng: createRng(hashSeed('cross-result')) });
  assert.equal(state.campaign.status, 'concert-pending');
});

test('campaign MV production can finish across a year boundary', () => {
  const roster = members(16);
  const base = { seed: 'campaign-boundary', year: 2, week: 48, members: roster, group: { fanTrust: 55, reputation: 60, fanbase: 150_000 }, campaign: { id: 'campaign-2-sousenkyo', type: 'sousenkyo', campaignYear: 2, status: 'locked', startWeek: 40, durationWeeks: 8, endWeek: 47, resultWeek: 48, budget: 0, spent: 0, totalVotes: 0, votingRevenue: 0, participants: { memberIds: roster.map((member) => member.id), votes: Object.fromEntries(roster.map((member) => [member.id, 1])) }, liveStandings: [], result: null, rewardSongId: null, mvProjectId: null, mvProductionWeeks: 0, lifecycle: [] }, nextCampaignConfig: createCampaignConfig({ campaignYear: 3, configuredInYear: 2 }), campaignHistory: [] };
  const result = advanceCampaign(base, { year: 2, week: 48, members: roster, group: base.group, rng: createRng(hashSeed('boundary-result')) });
  const rewardConcert = { id: `campaign-concert-${result.campaign.id}`, campaignId: result.campaign.id, status: 'completed', targetYear: 3, targetWeek: 4 };
  const nextYear = advanceCampaign({ ...base, ...result, campaign: { ...result.campaign, status: 'concert-scheduled', rewardConcertId: rewardConcert.id }, concerts: [rewardConcert] }, { year: 3, week: 1, members: roster, group: base.group, rng: createRng(hashSeed('boundary-next')) });
  assert.equal(nextYear.campaign.campaignYear, 2);
  assert.equal(nextYear.campaign.status, 'mv-production');
  assert.equal(nextYear.campaign.mvProductionWeeks, 0);
});
