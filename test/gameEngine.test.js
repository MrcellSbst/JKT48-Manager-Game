import test from 'node:test';
import assert from 'node:assert/strict';
import { announceAnniversaryConcert, announceConcert, applyFanSoftCap, applyScheduleTemplate, assignActivity, calculateNextFanTarget, configureTheaterShow, createAnnualFanTarget, createBirthday, createGame, endRun, finalizeAudition, finalizeGameSetup as finalizeGameSetupEngine, generateConcertVenueOffers, getActiveRoster, getFanGrowthMultiplier, getFanTargetPerformance, getMemberAge, getMemberChemistry, getMemberSalary, getRosterPool, getSetlistBoredom, getTheaterEligibleMembers, getTheaterRenovationOffer, getTraineePromotionStatus, prepareGraduation, promoteTrainee, renovateTheater, resolveWeek, respondToOpportunity, runAudition, scheduleFanCampaign, scheduleYearEndMeetGreet, staminaCostMultiplier, staminaRecoveryMultiplier, startAuditionCampaign, startMentorship, startSingleProduction } from '../src/engine/gameEngine.js';
import { SETLISTS } from '../src/data/setlists.js';
import { BALANCE, FAN_BALANCE, SCHEDULE_ACTIVITY_GROUPS, SCHEDULE_STANDALONE_ACTIVITIES } from '../src/data/balance.js';
import { translateIndonesian } from '../src/localization.js';
import { createRunHistoryEntry, mergeRunHistory } from '../src/state/saveDb.js';

const finalizeGameSetup = (draft, theaterId, memberIds, ...args) => {
  const foundingIds = memberIds.length === 12 ? [...memberIds, ...draft.members.slice(12, BALANCE.foundingRosterSize).map((member) => member.id)] : memberIds;
  const game = finalizeGameSetupEngine(draft, theaterId, foundingIds, ...args);
  if (memberIds.length !== 12) return game;
  return { ...game, members: game.members.slice(0, 12), unsignedMembers: [...game.members.slice(12), ...game.unsignedMembers] };
};

test('active roster includes current members, including JKT48V', () => {
  const roster = getActiveRoster();
  assert.equal(roster.length, 62);
  assert.equal(roster.some((member) => member.graduated), false);
  assert.ok(roster.some((member) => member.generation.startsWith('JKT48V')));
});

test('roster scopes select current members, ex-members, or both, including JKT48V', () => {
  const active = getRosterPool('active');
  const ex = getRosterPool('ex');
  const all = getRosterPool('all');
  assert.deepEqual(active, getActiveRoster());
  assert.equal(active.length, 62);
  assert.equal(ex.length, 194);
  assert.equal(all.length, active.length + ex.length);
  assert.ok(ex.every((member) => member.graduated && member.rosterScope === 'ex'));
  assert.ok(active.every((member) => !member.graduated && member.rosterScope === 'active'));
  assert.ok(all.some((member) => member.generation.toUpperCase().startsWith('JKT48V')));
  // Current members lead the pool so the prebuilt chemistry subset stays a contiguous prefix.
  assert.deepEqual(all.slice(0, active.length), active);
  assert.equal(getRosterPool('nonsense').length, 62);
});

test('every identity carries a portrait path the asset glob can resolve', () => {
  assert.ok(getRosterPool('ex').every((member) => /^(?:Gen\d+|JKT48V_GEN\d+)\/.+\.(jpg|jpeg|png|webp)$/i.test(member.photo)));
  assert.ok(getRosterPool('active').every((member) => /^[^/]+\.(jpg|jpeg|png|webp)$/i.test(member.photo)));
});

test('roster scope drives the founding pool and the leftover audition pool', () => {
  const activeRun = createGame('scope-test', 'active');
  const allRun = createGame('scope-test', 'all');
  assert.equal(activeRun.rosterScope, 'active');
  assert.equal(activeRun.members.length, 62);
  assert.equal(allRun.rosterScope, 'all');
  assert.equal(allRun.members.length, 256);
  const finalized = finalizeGameSetup(allRun, 'community', allRun.members.slice(0, 12).map((member) => member.id), 'Scope Office', [], { rosterScope: 'all' });
  assert.equal(finalized.rosterScope, 'all');
  assert.equal(finalized.members.length, 12);
  assert.equal(finalized.unsignedMembers.length, 244);
  assert.ok(finalized.unsignedMembers.some((member) => member.rosterScope === 'ex'));
  assert.equal(createGame('scope-test', 'ex').members.length, 194);
});

test('an ex-member founding pick gets persisted chemistry despite the lazy prebuild', () => {
  const draft = createGame('ex-chemistry-test', 'all');
  const exMembers = draft.members.filter((member) => member.rosterScope === 'ex').slice(0, 12);
  assert.equal(exMembers.length, 12);
  const pairKey = [exMembers[0].id, exMembers[1].id].sort().join('::');
  assert.equal(draft.chemistry[pairKey], undefined);
  const game = finalizeGameSetup(draft, 'community', exMembers.map((member) => member.id), 'Ex Office', [], { rosterScope: 'all' });
  assert.ok(game.chemistry[pairKey]);
  assert.deepEqual(game.chemistry[pairKey], getMemberChemistry(draft, exMembers[0].id, exMembers[1].id));
});

test('hard mode is opt-in at setup and defaults to off', () => {
  const draft = createGame('hard-mode-test');
  const ids = draft.members.slice(0, 12).map((member) => member.id);
  assert.equal(draft.hardMode, false);
  assert.equal(finalizeGameSetup(draft, 'community', ids, 'Normal Office').hardMode, false);
  assert.equal(finalizeGameSetup(draft, 'community', ids, 'Hard Office', [], { hardMode: true }).hardMode, true);
});

test('hard mode reduces member salary by 25%', () => {
  const draft = createGame('salary-reduction-test');
  const ids = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
  const normal = finalizeGameSetupEngine(draft, 'community', ids, 'Normal Salary Office');
  const hard = finalizeGameSetupEngine(draft, 'community', ids, 'Hard Salary Office', [], { hardMode: true });
  assert.equal(getMemberSalary(normal.members[0], 1, false), BALANCE.salary.regular);
  assert.equal(getMemberSalary(hard.members[0], 1, true), BALANCE.salary.hardModeRegular);
});

test('member birthdays are seeded, stable, and expose a derived age', () => {
  const first = createGame('birthday-test');
  const second = createGame('birthday-test');
  first.members.forEach((member, index) => {
    assert.ok(member.birthMonth >= 1 && member.birthMonth <= 12);
    assert.ok(Number.isInteger(member.birthYear));
    assert.equal(member.birthMonth, second.members[index].birthMonth);
    assert.equal(member.birthYear, second.members[index].birthYear);
    const age = getMemberAge(member, 1);
    assert.ok(age >= 17 && age <= 27, `age ${age} out of band`);
    assert.equal(getMemberAge(member, 3), age + 2);
  });
  assert.deepEqual(createBirthday('birthday-test', first.members[0].identityId, first.members[0].careerStage), { birthMonth: first.members[0].birthMonth, birthYear: first.members[0].birthYear });
  assert.equal(getMemberAge({}, 1), null);
});

test('a recycled pool member keeps the same birthday as the graduate', () => {
  const draft = createGame('recycled-birthday-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const graduate = game.members[0];
  const rosterSupport = { ...game.unsignedMembers[0], status: 'active' };
  const graduation = { id: 'graduation-birthday', memberId: graduate.id, memberName: graduate.name, departureYear: 2, departureWeek: 1, announced: true, completed: true };
  const staged = { ...game, year: 3, week: 48, dramaCooldown: 999, members: [{ ...graduate, status: 'graduated', canPerformTheater: false }, ...game.members.slice(1), rosterSupport], unsignedMembers: game.unsignedMembers.slice(1), graduations: [graduation] };
  const returned = resolveWeek(staged);
  const recycled = returned.unsignedMembers.find((member) => member.identityId === graduate.identityId);
  assert.ok(recycled);
  assert.equal(recycled.birthMonth, graduate.birthMonth);
  assert.equal(recycled.birthYear, graduate.birthYear);
});

test('Indonesian localization handles fixed and dynamic game text', () => {
  assert.equal(translateIndonesian('Choose your run bonuses'), 'Pilih bonus permainan');
  assert.equal(translateIndonesian('Year 3, Week 14'), 'Tahun 3, Minggu 14');
  assert.equal(translateIndonesian('Fiony has graduated.'), 'Fiony telah lulus.');
  assert.equal(translateIndonesian('Management Perks'), 'Management Perks');
  assert.equal(translateIndonesian('Management Token'), 'Management Token');
  assert.equal(translateIndonesian('Theater results'), 'Hasil teater');
  assert.equal(translateIndonesian('3 unmet'), '3 tidak terpenuhi');
  assert.equal(translateIndonesian('Save plan · Rp 28m'), 'Simpan rencana · Rp 28m');
  assert.equal(translateIndonesian('Fan target grade'), 'Nilai target penggemar');
  assert.equal(translateIndonesian('Annual fan result: Exceptional (120.5%).'), 'Hasil target penggemar tahunan: Luar biasa (120.5%).');
  assert.equal(translateIndonesian('Statistics'), 'Statistik');
  assert.equal(translateIndonesian('+12,500 this period'), '+12,500 periode ini');
  assert.equal(translateIndonesian('3 completed'), '3 selesai');
  assert.equal(translateIndonesian('Off-air performance requires 12 members'), 'Penampilan off-air membutuhkan 12 anggota');
  assert.equal(translateIndonesian('24 pool members available'), '24 anggota tersedia di kumpulan');
  assert.equal(translateIndonesian('Fiony returns to the talent pool'), 'Fiony kembali ke kumpulan talenta');
});

test('schedule activity groups are ordered and cover every schedulable activity once', () => {
  assert.deepEqual(SCHEDULE_ACTIVITY_GROUPS.map((group) => group.label), ['Light training', 'Regular training', 'Intensive training', 'Media', 'Show']);
  assert.deepEqual(SCHEDULE_ACTIVITY_GROUPS[3].activities, ['photoshoot', 'media']);
  assert.deepEqual(SCHEDULE_ACTIVITY_GROUPS[4].activities, ['theater', 'offAir']);
  assert.deepEqual(SCHEDULE_STANDALONE_ACTIVITIES, ['rest', 'liveStream']);
  const configured = [...SCHEDULE_ACTIVITY_GROUPS.flatMap((group) => group.activities), ...SCHEDULE_STANDALONE_ACTIVITIES];
  const schedulable = Object.entries(BALANCE.activities).filter(([, activity]) => activity.schedulable !== false).map(([id]) => id);
  assert.equal(new Set(configured).size, configured.length);
  assert.deepEqual(new Set(configured), new Set(schedulable));
});

test('same seed creates same fictional roster stats', () => {
  const first = createGame('test-seed');
  const second = createGame('test-seed');
  assert.deepEqual(first.members, second.members);
});

test('initial fictional stats follow member identity instead of roster card position', () => {
  const allMembers = createGame('identity-stat-seed', 'all').members;
  const exMembers = createGame('identity-stat-seed', 'ex').members;
  const allByIdentity = new Map(allMembers.map((member) => [`${member.generation}:${member.name}`, member]));
  const statKeys = ['archetype', 'traits', 'vocal', 'dance', 'performance', 'mc', 'variety', 'stamina', 'consistency', 'adaptability', 'developmentCurve', 'popularity', 'ego', 'potential', 'development', 'fanbase', 'fanComposition', 'careerStage'];
  const pickStats = (member) => Object.fromEntries(statKeys.map((key) => [key, member[key]]));

  exMembers.forEach((member) => {
    const identityKey = `${member.generation}:${member.name}`;
    assert.deepEqual(pickStats(member), pickStats(allByIdentity.get(identityKey)), identityKey);
  });
});

test('completed run history entries persist summary statistics without duplicates', () => {
  const draft = createGame('run-history-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id), 'History Office');
  const ended = endRun(game);
  const entry = createRunHistoryEntry(ended, 123456);
  assert.equal(entry.managementName, 'History Office');
  assert.equal(entry.finalMoney, ended.money);
  assert.equal(entry.finalFanbase, ended.group.fanbase);
  assert.equal(entry.totalMembers, ended.members.length);
  assert.equal(entry.weeksSurvived, ended.runSummary.weeksSurvived);
  const profile = mergeRunHistory({ id: 'profile', currency: 0, runHistory: [] }, entry);
  assert.equal(profile.runHistory.length, 1);
  assert.equal(mergeRunHistory(profile, entry), profile);
});

test('member hidden profiles and fan composition are deterministic and normalized', () => {
  const game = createGame('hidden-profile-test');
  game.members.forEach((member) => {
    assert.ok(member.consistency >= 35 && member.consistency <= 95);
    assert.ok(member.adaptability >= 30 && member.adaptability <= 96);
    assert.ok(['early', 'steady', 'late'].includes(member.developmentCurve));
    assert.equal(Object.values(member.fanComposition).reduce((sum, value) => sum + value, 0), 100);
  });
});

test('setup purchases theater and creates exactly 16-member founding roster', () => {
  const draft = createGame('setup-test');
  const selectedIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
  const game = finalizeGameSetupEngine(draft, 'city', selectedIds, '  Senayan Stage Office  ');
  const offer = draft.theaterOffers.find((theater) => theater.id === 'city');
  assert.deepEqual(game.theater, { ...offer, renovationLevel: 0 });
  assert.equal(game.members.length, BALANCE.foundingRosterSize);
  // Default scope is current members only: 62 identities minus the founding 16.
  assert.equal(game.rosterScope, 'active');
  assert.equal(game.unsignedMembers.length, 62 - BALANCE.foundingRosterSize);
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

test('sustained bankruptcy ends only after four consecutive weeks', () => {
  const draft = createGame('bankruptcy-pressure-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  game = { ...game, money: -1 };
  for (let index = 0; index < 3; index += 1) {
    game = resolveWeek(game);
    assert.equal(game.runStatus, 'active');
  }
  game = resolveWeek(game);
  assert.equal(game.runStatus, 'ended');
  assert.equal(game.runSummary.cause, 'SUSTAINED BANKRUPTCY');
  assert.ok(Number.isFinite(game.runSummary.score));
  assert.match(game.runSummary.rank, /^[SABCD]$/);
});

test('graduation planning runs at the start of each month once members pass their tenure cooldown', () => {
  const draft = createGame('graduation-plan-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const expanded = { ...game, year: 4, week: 45, members: [...game.members, ...game.unsignedMembers.slice(0, 4)] };
  const next = resolveWeek(expanded);
  const plans = next.graduations.filter((item) => item.planYear === 4);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].announcementWeek, 45);
  assert.equal(plans[0].announced, true);
  assert.ok(next.members.length - plans.length >= 12);
  assert.deepEqual(plans, resolveWeek({ ...expanded }).graduations.filter((item) => item.planYear === 4));
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
  assert.throws(() => finalizeGameSetupEngine(draft, 'community', draft.members.slice(0, BALANCE.foundingRosterSize - 1).map((member) => member.id)), /exactly 16/);
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
  // Stamina scales both the Rest recovery and the weekly passive regen.
  const stamina = game.members.find((member) => member.id === memberId).stamina;
  const expected = Math.min(100, Math.round(BALANCE.activities.rest.energyRecovery * staminaRecoveryMultiplier(stamina)) * 7 + Math.round(BALANCE.weeklyRecovery * staminaRecoveryMultiplier(stamina)));
  assert.equal(resolveWeek(scheduled).members.find((member) => member.id === memberId).energy, Math.min(100, expected));
  assert.ok(expected > BALANCE.activities.rest.energyRecovery + BALANCE.weeklyRecovery);
  assert.equal(assignActivity(scheduled, memberId, 'Mon', 'clear').schedule[`${memberId}:Mon`], undefined);
});

test('stamina lowers activity energy cost and raises every form of recovery', () => {
  assert.ok(staminaCostMultiplier(90) < staminaCostMultiplier(40));
  assert.ok(staminaRecoveryMultiplier(90) > staminaRecoveryMultiplier(40));
  // A maxed stamina member still pays something for a heavy day.
  assert.equal(staminaCostMultiplier(100), Math.max(BALANCE.stamina.costFloor, BALANCE.stamina.costBase - 100 * BALANCE.stamina.costPerPoint));
  assert.ok(staminaCostMultiplier(1000) >= BALANCE.stamina.costFloor);
  const draft = createGame('stamina-scaling-test');
  const base = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = base.members[0].id;
   const drain = (stamina) => {
     const prepared = { ...base, members: base.members.map((member) => member.id === memberId ? { ...member, stamina, energy: 60 } : member) };
     let scheduled = prepared;
     for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) scheduled = assignActivity(scheduled, memberId, day, 'media');
     return resolveWeek(scheduled).members.find((member) => member.id === memberId).energy;
  };
  assert.ok(drain(90) > drain(30));
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

test('complete theater shows persist setlist, center, and familiarity progress', () => {
  const draft = createGame('theater-setlist-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id), 'Setlist Test');
  game.members.forEach((member) => { game = assignActivity(game, member.id, 'Sat', 'theater'); });
  const centerId = game.members[3].id;
  game = configureTheaterShow(game, 'Sat', SETLISTS[1].id, centerId);
  game = resolveWeek(game);
  assert.equal(game.lastResult.theaterShows[0].setlistTitle, SETLISTS[1].title);
  assert.equal(game.lastResult.theaterShows[0].centerId, centerId);
  assert.equal(game.theaterHistory[0].songs.length, SETLISTS[1].songs.length);
  assert.ok(game.members.every((member) => member.setlistFamiliarity[SETLISTS[1].id] > 0));
  assert.equal(game.members.find((member) => member.id === centerId).appearances.center, 1);
  assert.deepEqual(game.theaterShows, {});
});

test('theater show configuration rejects unknown setlists and non-lineup centers', () => {
  const draft = createGame('theater-setlist-validation-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  game = assignActivity(game, game.members[0].id, 'Sat', 'theater');
  assert.equal(configureTheaterShow(game, 'Sat', 'missing', game.members[0].id), game);
  assert.equal(configureTheaterShow(game, 'Sat', SETLISTS[0].id, game.members[1].id), game);
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

test('training intensity and starting energy affect development', () => {
  const draft = createGame('training-intensity-test');
  const base = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = base.members[0].id;
  const prepare = (energy, activity) => assignActivity({ ...base, members: base.members.map((member) => member.id === memberId ? { ...member, energy, vocal: 40, potential: 95, development: 90 } : member) }, memberId, 'Mon', activity);
  const light = resolveWeek(prepare(100, 'vocalLight')).members.find((member) => member.id === memberId).vocal;
  const intensive = resolveWeek(prepare(100, 'vocalIntensive')).members.find((member) => member.id === memberId).vocal;
  const exhausted = resolveWeek(prepare(15, 'vocalIntensive')).members.find((member) => member.id === memberId).vocal;
  assert.ok(intensive > light);
  assert.ok(intensive > exhausted);
  assert.equal(BALANCE.activities.variety.skill, 'variety');
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

test('fan campaigns schedule selected Video Call members and the full Meet & Greet roster', () => {
  const draft = createGame('fan-campaign-setup-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const selectedIds = game.members.slice(0, 3).map((member) => member.id);
  const videoCall = scheduleFanCampaign(game, 'videoCall', 'Fri', selectedIds);
  assert.equal(Object.values(videoCall.schedule).filter((activity) => activity === 'vc1').length, 3);
  assert.deepEqual(videoCall, scheduleFanCampaign(videoCall, 'videoCall', 'Sat', selectedIds));

  const meetGreet = scheduleFanCampaign(game, 'meetGreet', 'Sun');
  assert.equal(Object.values(meetGreet.schedule).filter((activity) => activity === 'mg1').length, 12);
  assert.deepEqual(meetGreet, scheduleFanCampaign(meetGreet, 'meetGreet', 'Sat'));
  const campaignLocked = { ...game, schedule: { [`${game.members[5].id}:Thu`]: 'mvProduction' } };
  assert.deepEqual(scheduleFanCampaign(campaignLocked, 'meetGreet', 'Thu'), campaignLocked);
});

test('legacy schedule templates cannot bypass fan campaign setup', () => {
  const draft = createGame('fan-campaign-template-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = game.members[0].id;
  const next = applyScheduleTemplate(game, { name: 'Legacy fan event', entries: [{ memberId, day: 'Sat', activityId: 'vc1' }] });
  assert.equal(next.schedule[`${memberId}:Sat`], undefined);
  assert.match(next.notifications[0].text, /1 template assignment\(s\) skipped/);
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
  assert.equal(next.lastResult.finances.liveStream, 4_480_000);
  assert.equal(next.lastResult.fanGain, 240);
  const stamina = updated.stamina;
  assert.equal(updated.energy, 100);
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

test('single production budget controls cost and release trust and popularity', () => {
  const draft = createGame('single-budget-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const ids = game.members.map((member) => member.id);
  const low = startSingleProduction(game, ids[0], 'Thu', ids, null, null, '', 'low');
  const high = startSingleProduction(game, ids[0], 'Thu', ids, null, null, '', 'high');
  assert.equal(low.money, game.money - 75_000_000);
  assert.equal(high.money, game.money - 225_000_000);
  assert.equal(low.singles[0].budgetId, 'low');
  assert.equal(high.singles[0].budgetId, 'high');
  let lowReleased = low;
  let highReleased = high;
  for (let index = 0; index < 4; index += 1) {
    lowReleased = resolveWeek(lowReleased);
    highReleased = resolveWeek(highReleased);
  }
  assert.equal(highReleased.group.popularity - lowReleased.group.popularity, 3);
  assert.equal(highReleased.group.fanTrust - lowReleased.group.fanTrust, 4);
  assert.equal(startSingleProduction(game, ids[0], 'Thu', ids, null, null, '', 'unknown'), game);
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

test('media appearance earns popularity-scaled income', () => {
  const draft = createGame('media-income-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const member = game.members[0];
  game = { ...game, members: game.members.map((item) => item.id === member.id ? { ...item, popularity: 50 } : item) };
  const next = resolveWeek(assignActivity(game, member.id, 'Mon', 'media'));
  assert.equal(next.lastResult.finances.media, 50 * BALANCE.activities.media.revenuePerPopularity);
  assert.equal(next.lastResult.finances.activityCosts, BALANCE.activities.media.cost);
  assert.ok(next.lastResult.fanGain > 0);
});

test('incomplete off-air performance cancels without activity cost or fan gain', () => {
  const draft = createGame('off-air-performance-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const member = game.members[0];
  const next = resolveWeek(assignActivity(game, member.id, 'Tue', 'offAir'));
  assert.equal(next.lastResult.fanGain, 0);
  assert.equal(next.lastResult.finances.offAir, 0);
  assert.equal(next.lastResult.finances.activityCosts, 0);
  assert.match(next.notifications[0].text, /off-air performance canceled/);
});

test('complete off-air performance pays a premium over a sold-out theater night', () => {
  const draft = createGame('off-air-lineup-income-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  game = game.members.reduce((current, member) => assignActivity(current, member.id, 'Tue', 'offAir'), game);
  const theaterCeiling = game.theater.capacity * game.theater.ticketPrice;
  const [minPremium, maxPremium] = BALANCE.activities.offAir.theaterRevenuePremium;
  const next = resolveWeek(game);
  const revenue = next.lastResult.finances.offAir;
  assert.ok(revenue > theaterCeiling, `${revenue} should beat the ${theaterCeiling} theater ceiling`);
  assert.ok(revenue <= Math.round(theaterCeiling * (1 + maxPremium)));
  assert.ok(revenue >= Math.floor(theaterCeiling * (1 + minPremium)) - 12, 'rounding per member stays within a rupiah of the gross');
  assert.equal(next.lastResult.finances.activityCosts, 12 * BALANCE.activities.offAir.cost);
  assert.ok(next.lastResult.fanGain > 0);
  assert.ok(next.members.every((member) => member.appearances.offAir === 1));
  assert.deepEqual(resolveWeek(game).lastResult.finances.offAir, revenue, 'premium is seeded, not re-rolled');
});

test('only one off-air show can run in a week', () => {
  const draft = createGame('off-air-weekly-cap-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  game = game.members.reduce((current, member) => assignActivity(current, member.id, 'Tue', 'offAir'), game);
  // A second off-air day is rejected outright while the first one holds a lineup.
  const blocked = assignActivity(game, game.members[0].id, 'Thu', 'offAir');
  assert.equal(blocked.schedule[`${game.members[0].id}:Thu`], undefined);
  assert.equal(BALANCE.activities.offAir.maxPerWeek, 1);
  // Even a state that already carries two complete lineups only pays out once.
  const forced = { ...game, schedule: { ...game.schedule, ...Object.fromEntries(game.members.map((member) => [`${member.id}:Thu`, 'offAir'])) } };
  const next = resolveWeek(forced);
  assert.equal(next.lastResult.finances.activityCosts, 12 * BALANCE.activities.offAir.cost);
  assert.ok(next.members.every((member) => member.appearances.offAir === 1));
  assert.ok(next.notifications.some((item) => /only 1 off-air show is allowed/.test(item.text)));
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
  assert.equal(game.money, startingMoney - 180_000_000);
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
  assert.ok(game.lastResult.concertSummary.evaluation.overall >= 0);
  assert.equal(game.lastResult.concertSummary.evaluation.capacity, game.concerts[0].capacity);
  assert.ok(Number.isFinite(game.lastResult.concertSummary.evaluation.managementEfficiency));
});

test('concert venue offers are seeded and venue perks alter choices and costs', () => {
  assert.deepEqual(generateConcertVenueOffers('venue-seed', 2), generateConcertVenueOffers('venue-seed', 2));
  const draft = createGame('concert-perk-test');
  const ids = draft.members.slice(0, 12).map((member) => member.id);
  const base = finalizeGameSetup(draft, 'community', ids, 'Base');
  const perked = finalizeGameSetup(draft, 'community', ids, 'Perked', ['B006', 'B007', 'B008']);
  assert.equal(base.concertVenueOffers.length, 3);
  assert.equal(perked.concertVenueOffers.length, 4);
  const venue = perked.concertVenueOffers[0];
  const announced = announceConcert(perked, 'Sat', 1, 2, '', 'standard', venue.id);
  assert.ok(announced.concerts[0].productionCost < 300_000_000);
  assert.ok(announced.concerts[0].venueCost < venue.cost);
});

test('year-end Meet & Greet sells tickets and locks its target day', () => {
  const draft = createGame('year-end-mg-test');
  let game = finalizeGameSetup({ ...draft, week: 36 }, 'community', draft.members.slice(0, 12).map((member) => member.id));
  game = scheduleYearEndMeetGreet(game, 38, 'Sat', 36);
  assert.equal(game.yearEndMeetGreets[0].memberSessions.length, 12);
  assert.equal(game.yearEndMeetGreets[0].memberSessions[0].capacity, 300);
  assert.equal(game.yearEndMeetGreets[0].ticketPrice, BALANCE.activities.mg1.ticket);
  assert.equal(game.yearEndMeetGreets[0].memberSessions[0].capacity, BALANCE.activities.mg1.capacity);
  game = resolveWeek(game);
  assert.ok(game.yearEndMeetGreets[0].revenue > 0);
  game = resolveWeek(game);
  assert.equal(Object.values(game.schedule).filter((activity) => activity === 'yearEndMeetGreet').length, 12);
  game = resolveWeek(game);
  assert.equal(game.yearEndMeetGreets[0].status, 'completed');
  assert.ok(game.lastResult.yearEndMeetGreetSummary.attendance <= game.lastResult.yearEndMeetGreetSummary.capacity);
});

test('anniversary concert locks rehearsal and concert dates', () => {
  const draft = createGame('anniversary-concert-test');
  let game = finalizeGameSetup({ ...draft, week: 43 }, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const venueId = game.concertVenueOffers[0].id;
  game = announceAnniversaryConcert(game, 45, 'Sat', 'Anniversary Night', 'standard', venueId, ['Tue', 'Thu']);
  assert.equal(game.concerts[0].eventType, 'anniversary');
  game = resolveWeek(game);
  game = resolveWeek(game);
  assert.equal(Object.values(game.schedule).filter((activity) => activity === 'concert').length, 12);
  assert.equal(Object.values(game.schedule).filter((activity) => activity === 'concertRehearsal').length, 24);
  assert.equal(assignActivity(game, game.members[0].id, 'Tue', 'rest'), game);
});

test('concert announcement persists selected budget and venue size', () => {
  const draft = createGame('concert-budget-venue-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const announced = announceConcert(game, 'Sat', 1, 2, 'Big Night', 'standard', 'arena');
  assert.equal(announced.concerts[0].budgetId, 'standard');
  assert.equal(announced.concerts[0].venueId, 'arena');
  assert.equal(announced.concerts[0].capacity, 4_500);
  assert.equal(announced.concerts[0].upfrontCost, 420_000_000);
  assert.equal(announced.money, game.money - 420_000_000);
});

test('Q4 audition obeys first intake cap and cannot repeat in year', () => {
  const draft = createGame('audition-test');
  const game = { ...finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id)), week: 37 };
  const poolIds = new Set(game.unsignedMembers.map((member) => member.id));
  const audition = runAudition(game);
  assert.equal(audition.members.length, game.members.length + 4);
  assert.equal(audition.unsignedMembers.length, game.unsignedMembers.length - 4);
  assert.ok(audition.members.filter((member) => member.status === 'trainee').every((member) => poolIds.has(member.id)));
  assert.equal(audition.auditions.length, 1);
  assert.equal(runAudition(audition), audition);
});

test('Q4 audition requires available funds', () => {
  const draft = createGame('poor-audition-test');
  const game = { ...finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id)), week: 37, money: 97_499_999 };
  assert.equal(runAudition(game), game);
});

test('audition campaign progresses for five weeks and finalizes selected trainees', () => {
  let game = finalizeGameSetup({ ...createGame('audition-campaign-test'), week: 37 }, 'community', createGame('audition-campaign-test').members.slice(0, 12).map((member) => member.id));
  game = startAuditionCampaign(game, 37);
  assert.equal(game.auditionCampaign.phase, 'applications');
  assert.equal(game.auditionCampaign.progressWeeks, 0);
  assert.ok(game.auditionCampaign.candidatePool.length >= game.auditionCampaign.maxIntake);
  const originalPoolIds = new Set(game.unsignedMembers.map((member) => member.id));
  assert.ok(game.auditionCampaign.candidatePool.every((candidate) => originalPoolIds.has(candidate.sourcePoolId)));
  const selected = game.auditionCampaign.candidatePool.slice(0, 2).map((candidate) => candidate.id);
  for (let index = 0; index < 4; index += 1) game = resolveWeek(game);
  assert.equal(game.auditionCampaign.progressWeeks, 4);
  game = finalizeAudition(game, selected);
  assert.deepEqual(game.auditionCampaign.selectedCandidateIds, selected);
  game = resolveWeek(game);
  assert.equal(game.auditionCampaign, null);
  assert.equal(game.auditions[0].size, 2);
  assert.equal(game.members.filter((member) => member.status === 'trainee').length, 2);
  assert.ok(selected.every((memberId) => !game.unsignedMembers.some((member) => member.id === memberId)));
});

test('audition campaign rejects duplicate or non-Q4 starts', () => {
  const base = { ...createGame('audition-campaign-limits'), week: 36 };
  const game = finalizeGameSetup(base, 'community', base.members.slice(0, 12).map((member) => member.id));
  assert.equal(startAuditionCampaign(game, 36), game);
  const started = startAuditionCampaign({ ...game, week: 37 }, 37);
  assert.equal(startAuditionCampaign(started, 38), started);
  let ready = started;
  for (let index = 0; index < 4; index += 1) ready = resolveWeek(ready);
  assert.equal(finalizeAudition(ready, ready.auditionCampaign.candidatePool.map((candidate) => candidate.id)).auditionCampaign.selectedCandidateIds.length, ready.auditionCampaign.maxIntake);
});

test('trainee progression records trainee time and training progress', () => {
  const draft = createGame('trainee-progression-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const trainee = { ...game.members[0], id: 'trainee-progression', status: 'trainee', team: 'TRAINEE', traineeWeeks: 0, trainingProgress: 0, theaterAppearances: 0 };
  const withTrainee = { ...game, members: [trainee, ...game.members.slice(1)] };
  const next = resolveWeek(assignActivity(withTrainee, trainee.id, 'Mon', 'vocal'));
  const progressed = next.members.find((member) => member.id === trainee.id);
  assert.equal(progressed.traineeWeeks, 1);
  assert.ok(progressed.trainingProgress > 0);
  assert.equal(getTraineePromotionStatus(next, trainee.id).eligible, false);
});

test('trainees promote after required milestones and remain save-compatible', () => {
  const draft = createGame('trainee-promotion-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const trainee = { ...game.members[0], id: 'trainee-ready', status: 'trainee', team: 'TRAINEE', traineeWeeks: 12, trainingProgress: 24, theaterAppearances: 4 };
  const ready = { ...game, members: [trainee, ...game.members.slice(1)] };
  assert.equal(getTraineePromotionStatus(ready, trainee.id).eligible, true);
  const promoted = promoteTrainee(ready, trainee.id);
  const member = promoted.members.find((item) => item.id === trainee.id);
  assert.equal(member.status, 'active');
  assert.equal(member.team, 'JKT48');
  assert.equal(promoted.promotions.length, 1);
  assert.equal(promoteTrainee(promoted, trainee.id), promoted);
});

test('mentorship gives trainee development bonus and completes after eight weeks', () => {
  const draft = createGame('mentorship-test');
  const base = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const mentorId = base.members[0].id;
  const menteeId = base.members[1].id;
  const members = base.members.map((member) => member.id === mentorId ? { ...member, careerStage: 'Veteran' } : member.id === menteeId ? { ...member, status: 'trainee', team: 'TRAINEE', energy: 100, vocal: 40, potential: 95, development: 90 } : member);
  const game = { ...base, members };
  const mentored = startMentorship(game, mentorId, menteeId);
  assert.equal(mentored.mentorships[0].durationWeeks, 8);
  const withoutMentor = resolveWeek(assignActivity(game, menteeId, 'Mon', 'vocal'));
  const withMentor = resolveWeek(assignActivity(mentored, menteeId, 'Mon', 'vocal'));
  const baselineGain = withoutMentor.members.find((member) => member.id === menteeId).vocal - game.members.find((member) => member.id === menteeId).vocal;
  const mentoredGain = withMentor.members.find((member) => member.id === menteeId).vocal - game.members.find((member) => member.id === menteeId).vocal;
  assert.ok(mentoredGain > baselineGain);
  let completed = withMentor;
  for (let index = 0; index < 7; index += 1) completed = resolveWeek(completed);
  assert.equal(completed.mentorships[0].status, 'completed');
  assert.equal(completed.mentorshipHistory.length, 1);
});

test('member chemistry is deterministic, symmetric, and persisted in run state', () => {
  const game = createGame('chemistry-test');
  const firstId = game.members[0].id;
  const secondId = game.members[1].id;
  const first = getMemberChemistry(game, firstId, secondId);
  const reverse = getMemberChemistry(game, secondId, firstId);
  assert.deepEqual(first, reverse);
  assert.deepEqual(game.chemistry[[firstId, secondId].sort().join('::')], first);
  assert.deepEqual(Object.keys(first).sort(), ['mc', 'performance', 'stage', 'unit']);
  assert.ok(Object.values(first).every((value) => value >= 35 && value <= 95));
});

test('year rollover creates a persistent annual review', () => {
  const base = { ...createGame('annual-review-test'), week: BALANCE.weeksPerYear, fanTarget: createAnnualFanTarget(1, 125_000, 125_000) };
  const game = finalizeGameSetup(base, 'community', base.members.slice(0, 12).map((member) => member.id));
  const next = resolveWeek(game);
  assert.equal(next.year, 2);
  assert.equal(next.week, 1);
  assert.equal(next.annualReviews.length, 1);
  assert.equal(next.annualReviews[0].year, 1);
  assert.equal(next.annualReviews[0].categories.length, 9);
  assert.equal(next.annualReviews[0].snapshot.fanGrowth.targetFans, 100_000);
  assert.equal(next.annualReviews[0].snapshot.fanGrowth.actualFans, next.group.fanbase);
  assert.match(next.annualReviews[0].overallGrade, /^(S|A\+?|A-|B\+?|B-|C|D|E)$/);
});

test('runs do not end at a fixed five-year limit', () => {
  const base = { ...createGame('open-ended-run-test'), year: 5, week: BALANCE.weeksPerYear, dramaCooldown: 999, fanTarget: { year: 5, startingFanbase: 100_000, requiredGain: 20_000, targetFanbase: 120_000 } };
  const game = finalizeGameSetup(base, 'community', base.members.slice(0, 12).map((member) => member.id));
  const next = resolveWeek(game);
  assert.equal(next.year, 6);
  assert.equal(next.runStatus, 'active');
});

test('drama refunds sold future fan-event tickets for the suspended member', () => {
  const previousChance = BALANCE.dramaChance;
  BALANCE.dramaChance = 1;
  try {
    const base = { ...createGame('drama-refund-test'), year: 2, week: 37, dramaCooldown: 0 };
    let game = finalizeGameSetup(base, 'community', base.members.slice(0, 12).map((member) => member.id));
    game = scheduleYearEndMeetGreet(game, 44, 'Sat', 37, Object.fromEntries(game.members.map((member) => [member.id, 3])));
    const next = resolveWeek(game);
    const refundedSessions = next.yearEndMeetGreets[0].memberSessions.filter((session) => (session.refunded ?? 0) > 0);
    assert.equal(refundedSessions.length, 1);
    assert.equal(refundedSessions[0].sold, 0);
    assert.ok(next.lastResult.finances.refunds > 0);
  } finally {
    BALANCE.dramaChance = previousChance;
  }
});

test('theater resolution records demand, satisfaction, unit songs, and understudies', () => {
  const draft = createGame('theater-economics-test');
  let game = finalizeGameSetup(draft, 'city', draft.members.slice(0, 12).map((member) => member.id));
  game = game.members.reduce((current, member) => assignActivity(current, member.id, 'Mon', 'theater'), game);
  game = configureTheaterShow(game, 'Mon', SETLISTS[0].id, game.members[0].id);
  const next = resolveWeek(game);
  const show = next.lastResult.theaterShows[0];
  assert.ok(show.attendance > 0 && show.attendance <= show.capacity);
  assert.equal(show.revenue, show.attendance * game.theater.ticketPrice);
  assert.ok(show.audienceSatisfaction >= 0 && show.audienceSatisfaction <= 100);
  assert.ok(show.units.length >= 1);
  assert.ok(show.units.every((unit) => unit.memberIds.length >= 2));
  assert.ok(Array.isArray(show.understudyIds));
  assert.ok(next.members.every((member) => member.theaterExp > 0));
});

test('repeating a setlist reduces theater demand until it is rested', () => {
  const draft = createGame('setlist-boredom-test');
  const game = finalizeGameSetup(draft, 'city', draft.members.slice(0, 12).map((member) => member.id));
  const setlistId = SETLISTS[0].id;
  const fresh = getSetlistBoredom(game, setlistId);
  assert.equal(fresh.plays, 0);
  assert.equal(fresh.demandMultiplier, 1);
  const played = (times) => ({ ...game, theaterHistory: Array.from({ length: times }, (_, index) => ({ setlistId, year: 1, week: index + 1 })), week: times + 1 });
  assert.equal(getSetlistBoredom(played(1), setlistId).penalty, BALANCE.theater.boredomPerPlay);
  assert.equal(getSetlistBoredom(played(3), setlistId).plays, 3);
  // The penalty stops compounding at the configured ceiling.
  assert.equal(getSetlistBoredom(played(20), setlistId).penalty, BALANCE.theater.boredomMax);
  // A different setlist is unaffected, and plays older than the window stop counting.
  assert.equal(getSetlistBoredom(played(3), SETLISTS[1].id).plays, 0);
  const stale = { ...game, theaterHistory: [{ setlistId, year: 1, week: 1 }], week: 1 + BALANCE.theater.boredomWindowWeeks };
  assert.equal(getSetlistBoredom(stale, setlistId).plays, 0);
});

test('a bored setlist draws a smaller theater audience than a rested one', () => {
  const draft = createGame('setlist-boredom-demand-test');
  let game = finalizeGameSetup(draft, 'city', draft.members.slice(0, 12).map((member) => member.id));
  game = game.members.reduce((current, member) => assignActivity(current, member.id, 'Mon', 'theater'), game);
  game = configureTheaterShow(game, 'Mon', SETLISTS[0].id, game.members[0].id);
  const restedShow = resolveWeek(game).lastResult.theaterShows[0];
  const boredHistory = Array.from({ length: 5 }, (_, index) => ({ setlistId: SETLISTS[0].id, year: 1, week: index + 1 }));
  const boredShow = resolveWeek({ ...game, theaterHistory: boredHistory }).lastResult.theaterShows[0];
  assert.equal(restedShow.setlistBoredomPenalty, 0);
  assert.ok(boredShow.setlistBoredomPenalty > 0);
  assert.equal(boredShow.setlistPlaysInWindow, 5);
  assert.ok(boredShow.demand < restedShow.demand, `${boredShow.demand} should be under ${restedShow.demand}`);
});

test('video-call demand history records profile-specific sell-through and unmet demand', () => {
  const draft = createGame('demand-history-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  game = assignActivity(game, game.members[0].id, 'Tue', 'vc1');
  const next = resolveWeek(game);
  const demand = next.demandHistory.find((entry) => entry.memberId === game.members[0].id && entry.type === 'videoCall');
  assert.ok(demand);
  assert.equal(demand.capacity, BALANCE.activities.vc1.capacity);
  assert.equal(demand.unmetDemand, Math.max(0, demand.demand - demand.sold));
  assert.ok(demand.sellThrough >= 0 && demand.sellThrough <= 100);
});

test('management opportunities can be accepted or declined with persistent outcomes', () => {
  const draft = createGame('opportunity-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const offer = { id: 'test-offer', title: 'Test Broadcast', category: 'media', memberIds: game.members.slice(0, 3).map((member) => member.id), cost: 2_000_000, revenue: 7_000_000, fans: 900, awareness: 3, reputation: 1, energy: 8 };
  const accepted = respondToOpportunity({ ...game, pendingOpportunity: offer }, true);
  assert.equal(accepted.pendingOpportunity, null);
  assert.equal(accepted.opportunityHistory.at(-1).accepted, true);
  assert.equal(accepted.money, game.money + 5_000_000);
  assert.equal(accepted.group.fanbase, game.group.fanbase + 270);
  const declined = respondToOpportunity({ ...game, pendingOpportunity: offer }, false);
  assert.equal(declined.opportunityHistory.at(-1).accepted, false);
  assert.equal(declined.money, game.money);
});

test('graduation preparation charges once and applies final-event and successor benefits', () => {
  const draft = createGame('graduation-preparation-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const graduate = game.members[0];
  const successor = game.members[1];
  const graduation = { id: 'graduation-test', memberId: graduate.id, memberName: graduate.nickname || graduate.name, departureYear: 2, departureWeek: 1, announced: true, completed: false };
  const staged = { ...game, year: 2, week: 1, graduations: [graduation] };
  const prepared = prepareGraduation(staged, graduation.id, { finalShow: true, specialSegment: true, merchandise: true, successorId: successor.id });
  assert.equal(prepared.money, staged.money - 28_000_000);
  assert.equal(prepared.graduations[0].preparation.successorId, successor.id);
  assert.equal(prepareGraduation(prepared, graduation.id, { finalShow: true }), prepared);
  const resolved = resolveWeek(prepared);
  const completed = resolved.graduations[0];
  const promotedSuccessor = resolved.members.find((member) => member.id === successor.id);
  assert.equal(completed.completed, true);
  assert.equal(completed.outcome.fanGain, 1_650);
  assert.equal(completed.outcome.merchandiseRevenue, 18_000_000);
  assert.equal(promotedSuccessor.performance, successor.performance + 2);
  assert.equal(promotedSuccessor.popularity, successor.popularity + 1);
});

test('graduated member returns to the audition pool after exactly two years with reset stats', () => {
  const draft = createGame('graduation-pool-return-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const graduate = game.members[0];
  const rosterSupport = { ...game.unsignedMembers[0], status: 'active' };
  const graduation = { id: 'graduation-pool-return', memberId: graduate.id, memberName: graduate.nickname || graduate.name, departureYear: 2, departureWeek: 1, announced: true, completed: true };
  const staged = {
    ...game,
    year: 3,
    week: 47,
    members: [{ ...graduate, status: 'graduated', canPerformTheater: false }, ...game.members.slice(1), rosterSupport],
    unsignedMembers: game.unsignedMembers.slice(1),
    graduations: [graduation],
    dramaCooldown: 999,
  };
  const oneWeekEarly = resolveWeek(staged);
  assert.ok(oneWeekEarly.members.some((member) => member.id === graduate.id));
  assert.equal(oneWeekEarly.graduations[0].returnedToPool, undefined);
  const returned = resolveWeek(oneWeekEarly);
  const recycled = returned.unsignedMembers.find((member) => member.identityId === graduate.identityId);
  assert.equal(returned.year, 4);
  assert.equal(returned.week, 1);
  assert.ok(recycled);
  assert.notEqual(recycled.id, graduate.id);
  assert.equal(returned.members.some((member) => member.id === graduate.id), false);
  assert.equal(returned.graduations[0].returnedToPool, true);
  assert.equal(returned.graduations[0].poolReturnYear, 4);
  assert.equal(returned.graduations[0].poolReturnWeek, 1);
  assert.deepEqual(recycled.appearances, { theater: 0, center: 0, media: 0, offAir: 0 });
  const skillKeys = ['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina'];
  assert.notDeepEqual(skillKeys.map((skill) => recycled[skill]), skillKeys.map((skill) => graduate[skill]));
});

test('run summary includes development, generation, center, and sales records', () => {
  const draft = createGame('expanded-summary-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const summary = endRun(game).runSummary;
  ['membersDeveloped', 'newGenerations', 'breakoutStars', 'successfulCenters', 'highestSellingSingle', 'finalMoney', 'finalFanbase', 'finalPopularity', 'finalFanTrust', 'finalReputation', 'totalMembers', 'finalGraduatedMembers', 'dramaSuspensions'].forEach((key) => assert.ok(Object.hasOwn(summary, key)));
});

test('single selection raises selected oshi sentiment and lowers excluded sentiment', () => {
  const draft = createGame('oshi-sentiment-test');
  const selectedIds = draft.members.slice(0, 12).map((member) => member.id);
  const base = finalizeGameSetup(draft, 'community', selectedIds);
  const excluded = { ...draft.members[12], status: 'active' };
  const single = { id: 'sentiment-single', title: 'Selection Test', centerId: selectedIds[0], memberIds: selectedIds, productionDay: 'Mon', status: 'ready', progressWeeks: 4, durationWeeks: 4, releaseYear: 1, releaseWeek: 1, productionStartYear: 1, productionStartWeek: 1, popularityGain: 3, fanTrustGain: 1 };
  const next = resolveWeek({ ...base, members: [...base.members, excluded], singles: [single] });
  assert.equal(next.members.find((member) => member.id === selectedIds[0]).oshiSentiment, 4);
  assert.equal(next.members.find((member) => member.id === selectedIds[1]).oshiSentiment, 2);
  assert.equal(next.members.find((member) => member.id === excluded.id).oshiSentiment, -1);
});

test('annual fan target curve adds the Year 2+ bonus and caps acceleration', () => {
  const expected = [120_000, 144_000, 172_800, 207_360, 248_832, 298_598];
  let previous = 100_000;
  expected.forEach((target, index) => {
    previous = calculateNextFanTarget(previous, index + 1);
    assert.equal(previous, target);
  });
  // Year 1 is deliberately exempt from the bonus; every later year carries it.
  assert.equal(calculateNextFanTarget(100_000, 1), 120_000);
  assert.equal(calculateNextFanTarget(100_000, 2), 120_000);
  assert.equal(calculateNextFanTarget(100_000, 9), 120_000);
  assert.equal(FAN_BALANCE.target.startingRunningGrowthPercent, 20);
});

test('missing the annual fan target applies review penalties without ending the run', () => {
  const draft = createGame('missed-fan-target-test');
  const base = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const target = { formulaVersion: 2, year: 1, baseTarget: 125_000, startingFanbase: base.group.fanbase, requiredGain: 999_875_000, targetFanbase: 1_000_000_000 };
  const next = resolveWeek({ ...base, week: BALANCE.weeksPerYear, fanTarget: target });
  assert.equal(next.runStatus, 'active');
  assert.equal(next.year, 2);
  assert.equal(next.fanTargetHistory.at(-1).id, 'majorFailure');
  assert.equal(next.group.fanTrust, base.group.fanTrust - 8);
  assert.equal(next.group.reputation, base.group.reputation - 5);
  assert.equal(next.annualReviews[0].snapshot.fanGrowth.label, 'Major Failure');
});

test('overperforming creates the next target from the previous target, not actual fans', () => {
  const draft = createGame('achieved-fan-target-test');
  const base = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const target = createAnnualFanTarget(1, 100_000, 100_000);
  const next = resolveWeek({ ...base, week: BALANCE.weeksPerYear, group: { ...base.group, fanbase: 500_000 }, fanTarget: target });
  assert.equal(next.runStatus, 'active');
  assert.equal(next.year, 2);
  assert.equal(next.week, 1);
  assert.equal(next.fanTarget.year, 2);
  assert.equal(next.fanTarget.baseTarget, 100_000);
  assert.equal(next.fanTarget.targetFanbase, 120_000);
  assert.equal(next.fanTargetHistory.at(-1).id, 'exceptional');
  assert.equal(next.fanTargetMetaReward, 2);
});

test('fan soft-cap bands and resistance follow the configured boundaries', () => {
  const target = 100_000;
  assert.deepEqual([99_999, 100_000, 110_000, 120_000, 130_000].map((fans) => getFanGrowthMultiplier(fans, target)), [1, 0.75, 0.4, 0.15, 0.05]);
  assert.equal(FAN_BALANCE.generationMultiplier, 0.3);
  assert.equal(applyFanSoftCap(6_000, 0.4, 0), 720);
  assert.equal(applyFanSoftCap(6_000, 0.4, 0.5), 1_260);
  assert.equal(applyFanSoftCap(6_000, 0.4, 0.8), 1_584);
  assert.equal(applyFanSoftCap(-6_000, 0.05, 0), -6_000);
});

test('annual target performance bands expose review and management deltas', () => {
  assert.deepEqual([1.2, 1, 0.9, 0.75, 0.74].map((ratio) => getFanTargetPerformance(ratio * 100_000, 100_000).id), ['exceptional', 'achieved', 'slightlyBelow', 'underperformed', 'majorFailure']);
});

test('media opportunities use soft-cap resistance after the target is exceeded', () => {
  const draft = createGame('soft-cap-opportunity-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const offer = { id: 'capped-media', title: 'Capped Broadcast', category: 'media', memberIds: game.members.slice(0, 3).map((member) => member.id), cost: 0, revenue: 0, fans: 1_000, awareness: 1, reputation: 0, energy: 0 };
  const saturated = { ...game, group: { ...game.group, fanbase: 180_000 }, pendingOpportunity: offer };
  const next = respondToOpportunity(saturated, true);
  assert.equal(next.opportunityHistory.at(-1).baseFans, 1_000);
  assert.equal(next.opportunityHistory.at(-1).fansGained, 72);
  assert.equal(next.group.fanbase, 180_072);
});

test('annual fan performance rewards contribute to final Management Token payout', () => {
  const draft = createGame('fan-target-meta-reward-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const baseReward = endRun(game).runSummary.metaReward;
  assert.equal(endRun({ ...game, fanTargetMetaReward: 7 }).runSummary.metaReward, baseReward + 7);
});
