import test from 'node:test';
import assert from 'node:assert/strict';
import { assignActivity, createGame, endRun, finalizeGameSetup, getActiveRoster, getTheaterEligibleMembers, getTheaterRenovationOffer, renovateTheater, resolveWeek, runAudition } from '../src/engine/gameEngine.js';
import { translateIndonesian } from '../src/localization.js';

test('active roster excludes graduated members and JKT48V', () => {
  const roster = getActiveRoster();
  assert.equal(roster.length, 60);
  assert.equal(roster.some((member) => member.graduated), false);
  assert.equal(roster.some((member) => member.generation.startsWith('JKT48V')), false);
});

test('Indonesian localization handles fixed and dynamic game text', () => {
  assert.equal(translateIndonesian('Choose your run bonuses'), 'Pilih bonus permainan');
  assert.equal(translateIndonesian('Year 3, Week 14'), 'Tahun 3, Minggu 14');
  assert.equal(translateIndonesian('Fiony has graduated.'), 'Fiony telah lulus.');
  assert.equal(translateIndonesian('Management Perks'), 'Management Perks');
  assert.equal(translateIndonesian('Management Token'), 'Management Token');
});

test('same seed creates same fictional roster stats', () => {
  const first = createGame('test-seed');
  const second = createGame('test-seed');
  assert.deepEqual(first.members, second.members);
});

test('setup purchases theater and creates exactly 12-member roster', () => {
  const draft = createGame('setup-test');
  const selectedIds = draft.members.slice(0, 12).map((member) => member.id);
  const game = finalizeGameSetup(draft, 'city', selectedIds, '  Senayan Stage Office  ');
  const offer = draft.theaterOffers.find((theater) => theater.id === 'city');
  assert.deepEqual(game.theater, { ...offer, renovationLevel: 0 });
  assert.equal(game.members.length, 12);
  assert.equal(game.unsignedMembers.length, 48);
  assert.equal(game.money, draft.money - offer.price);
  assert.equal(game.managementName, 'Senayan Stage Office');
});

test('setup rejects a blank management name', () => {
  const draft = createGame('management-name-test');
  assert.throws(() => finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id), '   '), /management name/);
});

test('bonus loadout is locked into the run and modifies theater purchase', () => {
  const draft = createGame('bonus-test');
  const offer = draft.theaterOffers.find((item) => item.id === 'community');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id), 'Bonus Office', ['B001', 'B002', 'B011']);
  assert.deepEqual(game.bonusLoadout, ['B001', 'B002', 'B011']);
  assert.equal(game.theater.price, Math.round(offer.price * 0.85));
  assert.equal(game.theater.weeklyUpkeep, Math.round(offer.weeklyUpkeep * 0.88));
});

test('trainees count as theater eligible and can be scheduled', () => {
  const draft = createGame('trainee-eligible-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const trainee = { ...game.members[0], id: 'trainee-test', status: 'trainee' };
  const withTrainee = { ...game, members: [...game.members.slice(1), trainee] };
  assert.equal(getTheaterEligibleMembers(withTrainee).length, 12);
  assert.equal(assignActivity(withTrainee, trainee.id, 'Mon', 'theater').schedule[`${trainee.id}:Mon`], 'theater');
});

test('run ends when a suspension leaves fewer than 12 theater eligible members', () => {
  const draft = createGame('run-end-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const suspended = { ...game, year: 2, activeDrama: { memberId: game.members[0].id, name: game.members[0].name }, members: game.members.map((member, index) => index === 0 ? { ...member, status: 'suspended', suspensionWeeks: 2 } : member) };
  const ended = resolveWeek(suspended);
  assert.equal(ended.runStatus, 'ended');
  assert.equal(ended.runSummary.finalEligibleRoster, 11);
  assert.equal(ended.runSummary.cause, 'THEATER ROSTER FAILURE');
  assert.equal(resolveWeek(ended), ended);
});

test('management can voluntarily end a run exactly once', () => {
  const draft = createGame('manual-end-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const ended = endRun(game);
  assert.equal(ended.runStatus, 'ended');
  assert.equal(ended.runSummary.cause, 'RUN ENDED BY MANAGEMENT');
  assert.ok(ended.runSummary.metaReward > 0);
  assert.equal(endRun(ended), ended);
});

test('graduation planning runs at the start of each month from Year 2', () => {
  const draft = createGame('graduation-plan-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const expanded = { ...game, year: 2, week: 45, members: [...game.members, ...game.unsignedMembers.slice(0, 4)] };
  const next = resolveWeek(expanded);
  const plans = next.graduations.filter((item) => item.planYear === 2);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].announcementWeek, 45);
  assert.equal(plans[0].announced, true);
  assert.ok(next.members.length - plans.length >= 12);
  assert.deepEqual(plans, resolveWeek({ ...expanded }).graduations.filter((item) => item.planYear === 2));
  assert.deepEqual(resolveWeek({ ...expanded, week: 46 }).graduations, []);
});

test('graduations are not planned during Year 1', () => {
  const draft = createGame('no-year-one-graduation');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const expanded = { ...game, week: 12, members: [...game.members, ...game.unsignedMembers.slice(0, 4)] };
  assert.deepEqual(resolveWeek(expanded).graduations, []);
});

test('theater offers are seeded, randomized, and economically ordered', () => {
  const first = createGame('theater-seed-a').theaterOffers;
  const repeated = createGame('theater-seed-a').theaterOffers;
  const different = createGame('theater-seed-b').theaterOffers;
  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, different);
  assert.ok(first[0].price < first[1].price && first[1].price < first[2].price);
  assert.ok(first[0].capacity < first[1].capacity && first[1].capacity < first[2].capacity);
  assert.ok(first[0].weeklyUpkeep < first[1].weeklyUpkeep && first[1].weeklyUpkeep < first[2].weeklyUpkeep);
});

test('year-end renovation permanently increases ticket and upkeep costs', () => {
  const draft = createGame('renovation-test');
  const game = { ...finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id)), week: 48 };
  const offer = getTheaterRenovationOffer(game);
  const renovated = renovateTheater(game);
  assert.equal(renovated.money, game.money - offer.cost);
  assert.equal(renovated.theater.ticketPrice, offer.ticketPrice);
  assert.equal(renovated.theater.weeklyUpkeep, offer.weeklyUpkeep);
  assert.ok(renovated.theater.ticketPrice > game.theater.ticketPrice);
  assert.ok(renovated.theater.weeklyUpkeep > game.theater.weeklyUpkeep);
  assert.equal(renovateTheater(renovated), renovated);
});

test('renovation is unavailable before December Week 4', () => {
  const draft = createGame('early-renovation-test');
  const game = finalizeGameSetup(draft, 'city', draft.members.slice(0, 12).map((member) => member.id));
  assert.equal(renovateTheater(game), game);
});

test('setup rejects incomplete founding lineup', () => {
  const draft = createGame('invalid-setup');
  assert.throws(() => finalizeGameSetup(draft, 'community', draft.members.slice(0, 11).map((member) => member.id)), /exactly 12/);
});

test('scheduled activity resolves, clears calendar, and advances week', () => {
  const game = createGame('schedule-test');
  const member = game.members[0];
  const scheduled = game.members.slice(0, 12).reduce((current, item) => assignActivity(current, item.id, 'Mon', 'theater'), game);
  const next = resolveWeek(scheduled);
  const updated = next.members.find((item) => item.id === member.id);
  assert.equal(next.week, 2);
  assert.deepEqual(next.schedule, {});
  assert.equal(updated.appearances.theater, 1);
  assert.ok(updated.fanbase > member.fanbase);
});

test('weekly result exposes an income and expense breakdown matching net cash', () => {
  const draft = createGame('finance-breakdown-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  for (const member of game.members) game = assignActivity(game, member.id, 'Sat', 'theater');
  game = assignActivity(game, game.members[0].id, 'Sun', 'vc1');
  const result = resolveWeek(game).lastResult;
  assert.ok(result.finances.theater > 0);
  assert.ok(result.finances.videoCall > 0);
  assert.equal(result.moneyDelta, result.finances.totalIncome - result.finances.totalExpenses);
});

test('weekly reports persist enough data for four-week monthly summaries', () => {
  const draft = createGame('monthly-report-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  for (let index = 0; index < 4; index += 1) game = resolveWeek(game);
  assert.equal(game.weeklyReports.length, 4);
  assert.deepEqual(game.weeklyReports.at(-1), game.lastResult);
  assert.deepEqual(game.weeklyReports.map((report) => report.week), [1, 2, 3, 4]);
});

test('incomplete theater lineup is canceled without fatigue or appearance', () => {
  const game = createGame('incomplete-theater-test');
  const member = game.members[0];
  const next = resolveWeek(assignActivity(game, member.id, 'Mon', 'theater'));
  const updated = next.members.find((item) => item.id === member.id);
  assert.equal(updated.appearances.theater, 0);
  assert.equal(updated.energy, 100);
  assert.match(next.notifications[0].text, /1\/12 members/);
});

test('theater lineup cannot exceed 12 members on one day', () => {
  const game = createGame('theater-cap-test');
  const scheduled = game.members.slice(0, 13).reduce((current, member) => assignActivity(current, member.id, 'Sat', 'theater'), game);
  const count = game.members.filter((member) => scheduled.schedule[`${member.id}:Sat`] === 'theater').length;
  assert.equal(count, 12);
});

test('Meet & Greet is group-wide and limited to one event per week', () => {
  const draft = createGame('meet-greet-limit-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const scheduled = assignActivity(game, game.members[0].id, 'Sat', 'mg1');
  assert.equal(Object.values(scheduled.schedule).filter((activity) => activity === 'mg1').length, 12);
  assert.equal(assignActivity(scheduled, game.members[1].id, 'Sun', 'mg1'), scheduled);
});

test('concert is group-wide and limited to one event per four-week month', () => {
  const draft = createGame('concert-limit-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const scheduled = assignActivity(game, game.members[0].id, 'Sat', 'concert');
  assert.equal(Object.values(scheduled.schedule).filter((activity) => activity === 'concert').length, 12);
  const nextWeek = resolveWeek(scheduled);
  assert.equal(Object.keys(assignActivity(nextWeek, nextWeek.members[0].id, 'Sat', 'concert').schedule).length, 0);
});

test('Video Call is limited to one event per member per four-week month', () => {
  const draft = createGame('video-call-limit-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const firstMemberId = game.members[0].id;
  const nextWeek = resolveWeek(assignActivity(game, firstMemberId, 'Sat', 'vc1'));
  assert.equal(Object.keys(assignActivity(nextWeek, firstMemberId, 'Sat', 'vc1').schedule).length, 0);
  assert.equal(assignActivity(nextWeek, nextWeek.members[1].id, 'Sat', 'vc1').schedule[`${nextWeek.members[1].id}:Sat`], 'vc1');
});

test('Q4 audition obeys first intake cap and cannot repeat in year', () => {
  const game = { ...createGame('audition-test'), week: 37 };
  const audition = runAudition(game);
  assert.equal(audition.members.length, game.members.length + 4);
  assert.equal(audition.auditions.length, 1);
  assert.equal(runAudition(audition), audition);
});

test('Q4 audition requires available funds', () => {
  const game = { ...createGame('poor-audition-test'), week: 37, money: 64_999_999 };
  assert.equal(runAudition(game), game);
});
