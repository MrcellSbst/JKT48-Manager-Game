import test from 'node:test';
import assert from 'node:assert/strict';
import { announceConcert, applyScheduleTemplate, assignActivity, createGame, endRun, finalizeGameSetup, getActiveRoster, getTheaterEligibleMembers, getTheaterRenovationOffer, renovateTheater, resolveWeek, runAudition, startSingleProduction } from '../src/engine/gameEngine.js';
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
  assert.equal(next.lastResult.schedule[`${member.id}:Mon`], 'theater');
});

test('Rest is scheduled explicitly and restores energy without another activity', () => {
  const draft = createGame('rest-recovery-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = game.members[0].id;
  game = { ...game, members: game.members.map((member) => member.id === memberId ? { ...member, energy: 0 } : member) };
  const scheduled = assignActivity(game, memberId, 'Mon', 'rest');
  assert.equal(scheduled.schedule[`${memberId}:Mon`], 'rest');
  assert.equal(resolveWeek(scheduled).members.find((member) => member.id === memberId).energy, 60);
  assert.equal(assignActivity(scheduled, memberId, 'Mon', 'clear').schedule[`${memberId}:Mon`], undefined);
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

test('Meet & Greet is group-wide and limited to one event per four-week month', () => {
  const draft = createGame('meet-greet-limit-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const scheduled = assignActivity(game, game.members[0].id, 'Sat', 'mg1');
  assert.equal(Object.values(scheduled.schedule).filter((activity) => activity === 'mg1').length, 12);
  assert.equal(assignActivity(scheduled, game.members[1].id, 'Sun', 'mg1'), scheduled);
  let next = resolveWeek(scheduled);
  assert.equal(Object.keys(assignActivity(next, next.members[0].id, 'Sun', 'mg1').schedule).length, 0);
  for (let index = 0; index < 3; index += 1) next = resolveWeek(next);
  assert.equal(Object.values(assignActivity(next, next.members[0].id, 'Sun', 'mg1').schedule).filter((activity) => activity === 'mg1').length, 12);
});

test('concert is group-wide and limited to one event per four-week month', () => {
  const draft = createGame('concert-limit-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const scheduled = assignActivity(game, game.members[0].id, 'Sat', 'concert');
  assert.equal(Object.values(scheduled.schedule).filter((activity) => activity === 'concert').length, 12);
  const nextWeek = resolveWeek(scheduled);
  assert.ok(nextWeek.lastResult.concertSummary.songCount >= 35 && nextWeek.lastResult.concertSummary.songCount <= 40);
  assert.equal(new Set(nextWeek.lastResult.concertSummary.songs.map((song) => song.songId)).size, nextWeek.lastResult.concertSummary.songCount);
  assert.ok(nextWeek.lastResult.concertSummary.songs.some((song) => song.performerType === 'team'));
  assert.ok(nextWeek.lastResult.concertSummary.songs.some((song) => song.performerType === 'members'));
  assert.equal(nextWeek.lastResult.concertSummary.songs.some((song) => /JKT48[_ ]?V|virtual/i.test(song.title)), false);
  assert.equal(Object.keys(assignActivity(nextWeek, nextWeek.members[0].id, 'Sat', 'concert').schedule).length, 0);
});

test('weekly report lists skill improvements after training', () => {
  const game = createGame('skill-report-test');
  const member = game.members[0];
  const next = resolveWeek(assignActivity(game, member.id, 'Mon', 'vocal'));
  const change = next.lastResult.skillChanges.find((item) => item.memberId === member.id && item.skill === 'vocal');
  assert.ok(change);
  assert.ok(change.delta > 0);
  assert.ok(change.after > change.before);
});

test('schedule template assigns available members and skips unavailable members', () => {
  const game = createGame('schedule-template-test');
  const [available, unavailable] = game.members;
  const suspended = { ...game, members: game.members.map((member) => member.id === unavailable.id ? { ...member, status: 'suspended', suspensionWeeks: 2 } : member) };
  const template = { name: 'Training week', entries: [{ memberId: available.id, day: 'Mon', activityId: 'vocal' }, { memberId: unavailable.id, day: 'Tue', activityId: 'dance' }] };
  const next = applyScheduleTemplate(suspended, template);
  assert.equal(next.schedule[`${available.id}:Mon`], 'vocal');
  assert.equal(next.schedule[`${unavailable.id}:Tue`], undefined);
  assert.match(next.notifications[0].text, /1 template assignment\(s\) skipped/);
});

test('Video Call is limited to one event per member per four-week month', () => {
  const draft = createGame('video-call-limit-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const firstMemberId = game.members[0].id;
  const nextWeek = resolveWeek(assignActivity(game, firstMemberId, 'Sat', 'vc1'));
  assert.equal(Object.keys(assignActivity(nextWeek, firstMemberId, 'Sat', 'vc1').schedule).length, 0);
  assert.equal(assignActivity(nextWeek, nextWeek.members[1].id, 'Sat', 'vc1').schedule[`${nextWeek.members[1].id}:Sat`], 'vc1');
});

test('Live Stream is available daily and scales revenue and fans with popularity', () => {
  const draft = createGame('live-stream-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = game.members[0].id;
  game = { ...game, members: game.members.map((member) => member.id === memberId ? { ...member, energy: 20, popularity: 80 } : member) };
  const scheduled = assignActivity(game, memberId, 'Mon', 'liveStream');
  const scheduledTwice = assignActivity(scheduled, memberId, 'Tue', 'liveStream');
  assert.equal(scheduledTwice.schedule[`${memberId}:Tue`], 'liveStream');
  const next = resolveWeek(scheduledTwice);
  const updated = next.members.find((member) => member.id === memberId);
  assert.equal(next.lastResult.finances.liveStream, 6_400_000);
  assert.ok(next.lastResult.fanGain >= 800);
  assert.equal(updated.energy, 72);
  assert.equal(next.lastResult.moneyDelta, next.lastResult.finances.totalIncome - next.lastResult.finances.totalExpenses);
});

test('single production requires 12 members and completes after four weeks', () => {
  const draft = createGame('single-production-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const centerId = game.members[0].id;
  const occupied = assignActivity(game, centerId, 'Wed', 'vocal');
  assert.equal(startSingleProduction(occupied, centerId, 'Wed'), occupied);
  const started = startSingleProduction(game, centerId, 'Wed');
  assert.equal(started.singles[0].memberIds.length, 12);
  assert.equal(new Set(started.singles[0].memberIds).size, 12);
  assert.equal(started.singles[0].productionDay, 'Wed');
  assert.equal(Object.values(started.schedule).filter((activity) => activity === 'mvProduction').length, 12);
  assert.equal(assignActivity(started, centerId, 'Wed', 'rest'), started);
  assert.equal(assignActivity(started, game.members.at(-1).id, 'Wed', 'concert'), started);
  assert.equal(startSingleProduction(started, centerId, 'Thu'), started);
  let progressed = started;
  for (let index = 0; index < 3; index += 1) {
    progressed = resolveWeek(progressed);
    assert.equal(Object.values(progressed.schedule).filter((activity) => activity === 'mvProduction').length, 12);
  }
  progressed = resolveWeek(progressed);
  assert.equal(progressed.singles[0].status, 'released');
  assert.equal(progressed.singles[0].progressWeeks, 4);
  assert.equal(Object.values(progressed.schedule).filter((activity) => activity === 'mvProduction').length, 0);
  assert.ok(progressed.group.popularity >= game.group.popularity + 3);
  const shortRoster = { ...game, members: game.members.slice(0, 11) };
  assert.equal(startSingleProduction(shortRoster, shortRoster.members[0].id, 'Wed'), shortRoster);
});

test('single production respects a selected 12-member lineup from a larger roster', () => {
  const game = createGame('selected-single-lineup-test');
  const selectedIds = game.members.slice(4, 16).map((member) => member.id);
  const started = startSingleProduction(game, selectedIds[0], 'Fri', selectedIds);
  assert.deepEqual(new Set(started.singles[0].memberIds), new Set(selectedIds));
  assert.equal(Object.values(started.schedule).filter((activity) => activity === 'mvProduction').length, 12);
  assert.equal(startSingleProduction(game, selectedIds[0], 'Fri', selectedIds.slice(0, 11)), game);
});

test('single production auto-locks every member when exactly 12 are eligible', () => {
  const draft = createGame('automatic-single-lineup-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const started = startSingleProduction(game, game.members[0].id, 'Thu', [game.members[0].id]);
  assert.deepEqual(new Set(started.singles[0].memberIds), new Set(game.members.map((member) => member.id)));
});

test('scheduled single starts five weeks before its release month and releases in week four', () => {
  const draft = createGame('scheduled-single-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  game = startSingleProduction(game, game.members[0].id, 'Wed', game.members.map((member) => member.id), 1, 2);
  assert.equal(game.singles[0].status, 'planned');
  assert.equal(game.singles[0].productionStartWeek, 3);
  assert.equal(game.singles[0].releaseWeek, 8);
  assert.equal(Object.keys(game.schedule).length, 0);
  game = resolveWeek(resolveWeek(game));
  assert.equal(game.week, 3);
  assert.equal(Object.values(game.schedule).filter((activity) => activity === 'mvProduction').length, 12);
  for (let index = 0; index < 4; index += 1) game = resolveWeek(game);
  assert.equal(game.singles[0].status, 'ready');
  assert.equal(game.singles[0].progressWeeks, 4);
  game = resolveWeek(game);
  assert.equal(game.week, 8);
  assert.equal(game.singles[0].status, 'ready');
  game = resolveWeek(game);
  assert.equal(game.singles[0].status, 'released');
  assert.equal(game.singles[0].releasedWeek, 8);
});

test('single and concert creation persist trimmed custom titles', () => {
  const draft = createGame('custom-campaign-title-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const single = startSingleProduction(game, game.members[0].id, 'Wed', game.members.map((member) => member.id), 1, 2, '  Sakura Horizon  ');
  assert.equal(single.singles[0].title, 'Sakura Horizon');
  const concert = announceConcert(game, 'Sat', 1, 2, '  Jakarta Resonance  ');
  assert.equal(concert.concerts[0].title, 'Jakarta Resonance');
  assert.equal(startSingleProduction(game, game.members[0].id, 'Wed', game.members.map((member) => member.id), 1, 2, 'x'.repeat(61)), game);
  assert.equal(announceConcert(game, 'Sat', 1, 2, 'x'.repeat(61)), game);
});

test('Off-air performance costs energy and money while gaining fans', () => {
  const draft = createGame('off-air-performance-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const member = game.members[0];
  game = { ...game, members: game.members.map((item) => item.id === member.id ? { ...item, energy: 50 } : item) };
  const next = resolveWeek(assignActivity(game, member.id, 'Tue', 'offAir'));
  assert.ok(next.lastResult.fanGain > 0);
  assert.ok(next.lastResult.finances.activityCosts >= 600_000);
  assert.ok(next.members.find((item) => item.id === member.id).energy < 100);
  assert.equal(next.members.find((item) => item.id === member.id).appearances.offAir, 1);
});

test('released single views decline and use the fanbase long-tail cap from week four', () => {
  const draft = createGame('single-view-decay-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  game = startSingleProduction(game, game.members[0].id, 'Wed');
  for (let index = 0; index < 4; index += 1) game = resolveWeek(game);
  const first = game.singles[0].weeklyViewGain;
  game = resolveWeek(game);
  const second = game.singles[0].weeklyViewGain;
  game = resolveWeek(game);
  const third = game.singles[0].weeklyViewGain;
  game = resolveWeek(game);
  const fourth = game.singles[0].weeklyViewGain;
  const longTailCap = Math.round((game.group.fanbase / 5) * 0.01);
  assert.ok(first > second && second > third && third > fourth);
  assert.ok(fourth <= longTailCap);
  const previousTotal = game.singles[0].views;
  game = resolveWeek(game);
  assert.ok(game.singles[0].weeklyViewGain < fourth);
  assert.equal(game.singles[0].views, previousTotal + game.singles[0].weeklyViewGain);
  assert.equal(game.lastResult.singleViewChanges[0].total, game.singles[0].views);
});

test('concert tickets sell through D-2 and the target week locks every member', () => {
  const draft = createGame('scheduled-concert-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const startingMoney = game.money;
  game = announceConcert(game, 'Sat', 1, 2);
  assert.equal(game.concerts[0].status, 'selling');
  assert.equal(game.money, startingMoney - 120_000_000);
  assert.equal(game.concerts[0].sold, 0);
  for (let index = 0; index < 6; index += 1) game = resolveWeek(game);
  assert.equal(game.week, 7);
  assert.equal(game.concerts[0].status, 'salesClosed');
  assert.equal(game.concerts[0].sold, game.concerts[0].projectedSold);
  const soldAtClose = game.concerts[0].sold;
  game = resolveWeek(game);
  assert.equal(game.week, 8);
  assert.equal(game.concerts[0].sold, soldAtClose);
  assert.equal(Object.values(game.schedule).filter((activity) => activity === 'concert').length, 12);
  game = resolveWeek(game);
  assert.equal(game.concerts[0].status, 'completed');
  assert.ok(game.lastResult.concertSummary.songCount >= 35);
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
