import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_ROTATION, advanceCampaign, campaignRevenuePerVote, campaignTypeForYear, clampCampaignDuration, createCampaignConfig } from '../src/engine/campaignEngine.js';
import { resolveJankenBracket } from '../src/engine/campaigns/jankenEngine.js';
import { resolveRequestHour } from '../src/engine/campaigns/requestHourEngine.js';
import { resolveSousenkyo } from '../src/engine/campaigns/sousenkyoEngine.js';
import dreamSetlistSongs from '../src/data/DreamSetlist_Songs.js';
import { createRng, hashSeed } from '../src/engine/rng.js';

const members = (count = 30) => Array.from({ length: count }, (_, index) => ({ id: `member-${index}`, name: `Member ${index}`, status: 'active', popularity: 40 + index, performance: 50, fanbase: 10_000, oshiSentiment: 0 }));

test('campaign rotation starts in Year 2 and cycles SSK, Request Hour, Janken', () => {
  assert.equal(campaignTypeForYear(1), null);
  assert.deepEqual([2, 3, 4, 5].map((year) => campaignTypeForYear(year)), CAMPAIGN_ROTATION.concat('sousenkyo'));
});

test('campaign duration clamps to eight through sixteen weeks', () => {
  assert.equal(clampCampaignDuration(2), 8);
  assert.equal(clampCampaignDuration(20), 16);
  assert.equal(createCampaignConfig({ campaignYear: 2, durationWeeks: 11 }).resultWeek, 12);
});

test('Sousenkyo ranks members, creates Senbatsu and only creates Undergirls with 24 participants', () => {
  const campaign = { participants: { votes: Object.fromEntries(members(30).map((member, index) => [member.id, index])) } };
  const result = resolveSousenkyo(campaign, members(30), createRng(hashSeed('ssk')));
  assert.equal(result.result.winnerMemberId, 'member-29');
  assert.equal(result.result.senbatsu.length, 12);
  assert.equal(result.result.undergirls.length, 12);
  const small = resolveSousenkyo({ participants: { votes: Object.fromEntries(members(12).map((member) => [member.id, 1])) } }, members(12), createRng(hashSeed('ssk-small')));
  assert.deepEqual(small.result.undergirls, []);
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

test('campaign revenue per vote stays within configured trust and reputation range', () => {
  assert.equal(campaignRevenuePerVote({ fanTrust: 0, reputation: 0 }), 5_000);
  assert.equal(campaignRevenuePerVote({ fanTrust: 100, reputation: 100 }), 10_000);
});

test('campaign advance creates Year 2 registration, active voting, and result lifecycle', () => {
  const roster = members(16);
  const base = { seed: 'campaign-lifecycle', year: 2, week: 1, members: roster, group: { fanTrust: 55, reputation: 60, fanbase: 150_000 }, campaign: null, nextCampaignConfig: null, campaignHistory: [] };
  const opened = advanceCampaign(base, { year: 2, week: 1, members: roster, group: base.group, rng: createRng(hashSeed('week1')) });
  assert.equal(opened.campaign.type, 'sousenkyo');
  assert.equal(opened.campaign.status, 'registration');
  const active = advanceCampaign({ ...base, ...opened }, { year: 2, week: 2, members: roster, group: base.group, rng: createRng(hashSeed('week2')) });
  assert.equal(active.campaign.status, 'active');
  assert.ok(active.campaign.totalVotes > 0);
  let result = active;
  for (let week = 3; week <= 13; week += 1) result = advanceCampaign({ ...base, ...result }, { year: 2, week, members: roster, group: base.group, rng: createRng(hashSeed(`week${week}`)) });
  assert.equal(result.campaign.status, 'mv-production');
  assert.ok(result.campaign.result.winnerMemberId);
  for (let week = 14; week <= 17; week += 1) result = advanceCampaign({ ...base, ...result }, { year: 2, week, members: roster, group: base.group, rng: createRng(hashSeed(`week${week}`)) });
  assert.equal(result.campaign.status, 'completed');
});

test('campaign MV production can finish across a year boundary', () => {
  const roster = members(16);
  const base = { seed: 'campaign-boundary', year: 2, week: 48, members: roster, group: { fanTrust: 55, reputation: 60, fanbase: 150_000 }, campaign: { id: 'campaign-2-sousenkyo', type: 'sousenkyo', campaignYear: 2, status: 'locked', startWeek: 40, durationWeeks: 8, endWeek: 47, resultWeek: 48, budget: 0, spent: 0, totalVotes: 0, votingRevenue: 0, participants: { memberIds: roster.map((member) => member.id), votes: Object.fromEntries(roster.map((member) => [member.id, 1])) }, liveStandings: [], result: null, rewardSongId: null, mvProjectId: null, mvProductionWeeks: 0, lifecycle: [] }, nextCampaignConfig: createCampaignConfig({ campaignYear: 3, configuredInYear: 2 }), campaignHistory: [] };
  const result = advanceCampaign(base, { year: 2, week: 48, members: roster, group: base.group, rng: createRng(hashSeed('boundary-result')) });
  const nextYear = advanceCampaign({ ...base, ...result }, { year: 3, week: 1, members: roster, group: base.group, rng: createRng(hashSeed('boundary-next')) });
  assert.equal(nextYear.campaign.campaignYear, 2);
  assert.equal(nextYear.campaign.status, 'mv-production');
  assert.equal(nextYear.campaign.mvProductionWeeks, 1);
});
