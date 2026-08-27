import test from 'node:test';
import assert from 'node:assert/strict';
import { announceAnniversaryConcert, announceConcert, applyFanSoftCap, applyScheduleTemplate, applyTrainingTemplate, assignActivity, calculateAnnualTax, calculateNextFanTarget, canMemberPerform, clearTrainingPlan, completeYearEndSettlement, configureTheaterShow, createAnnualFanTarget, createBirthday, createGame, deleteTrainingTemplate, endRun, finalizeAudition, finalizeGameSetup as finalizeGameSetupEngine, fireMember, generateConcertVenueOffers, getActiveRoster, getAnnualTaxRate, getCampaignConflictReasons, getConfirmedScheduleForWeek, getConcertCostBreakdown, getFanGrowthMultiplier, getFanTargetPerformance, getGraduationCountdown, getGraduationLastShowCandidates, getMemberAge, getMemberChemistry, getMemberSalary, getProjectedEnergyByMember, getReportSkillChanges, getRosterPool, getRunEndWarnings, getScheduleSnapshotForWeek, getSeitansaiCandidates, getSetlistBoredom, getSingleEligibleMembers, getSingleParticipants, getTheaterChangeOffers, getTheaterEligibleMembers, getTheaterRenovationOffer, getTraineePromotionStatus, getTrainingPlanStatus, memberAvailableOnCampaignDate, migrateEconomyState, migrateGraduationState, migrateGraduatedRosterState, migrateInjuryHistoryState, migrateTrainingState, moveTrainingSession, payDebt, prepareGraduation, promoteTrainee, punishMember, queueTrainingSession, removeTrainingSession, renameTrainingTemplate, renovateTheater, resolveMemberDramaWithoutPunishment, resolveWeek, respondToOpportunity, rollGraduationTarget, runAudition, saveTrainingTemplate, scheduleFanCampaign, scheduleYearEndMeetGreet, settleAnnualTax, staminaCostMultiplier, staminaRecoveryMultiplier, startAuditionCampaign, startMajorCampaign, startMentorship, startSingleProduction } from '../src/engine/gameEngine.js';
import { SETLISTS } from '../src/data/setlists.js';
import dreamSetlistSongs from '../src/data/DreamSetlist_Songs.js';
import { MEMBER_DRAMA_CATEGORIES, MEMBER_DRAMA_TEMPLATES } from '../src/data/dramaData.js';
import { ACTIVITY_SKILL_GAINS, BALANCE, CONCERT_BUDGETS, CONCERT_VENUES, DAYS, FAN_BALANCE, OPPORTUNITY_SKILL_GAINS, SCHEDULE_ACTIVITY_GROUPS, SCHEDULE_STANDALONE_ACTIVITIES, TRAINING_ACTIVITY_GROUPS } from '../src/data/balance.js';
import { BONUS_BY_ID, getBonusUpgradeCost, getBonusValueAtLevel } from '../src/data/bonusTemplates.js';
import { normalizeGameState } from '../src/state/gameStateMigration.js';
import { translateIndonesian } from '../src/localization.js';
import { createRunHistoryEntry, mergeRunHistory, normalizeMetaProfile } from '../src/state/saveDb.js';
import { configureTheaterSpecialFlags, getAvailableStsLastShowMembers, getStsLastShowAssignmentConflicts, replaceTheaterSpecialAssignment } from '../src/engine/gameEngine.js';

const finalizeGameSetup = (draft, theaterId, memberIds, ...args) => {
  const foundingIds = memberIds.length === 12 ? [...memberIds, ...draft.members.slice(12, BALANCE.foundingRosterSize).map((member) => member.id)] : memberIds;
  const game = finalizeGameSetupEngine(draft, theaterId, foundingIds, ...args);
  if (memberIds.length !== 12) return game;
  return { ...game, members: game.members.slice(0, 12), unsignedMembers: [...game.members.slice(12), ...game.unsignedMembers] };
};

test('active roster includes current members, including JKT48V', () => {
  const roster = getActiveRoster();
  assert.equal(roster.length, 61);
  assert.equal(roster.some((member) => member.graduated), false);
  assert.ok(roster.some((member) => member.generation.startsWith('JKT48V')));
});

test('roster scopes select current members, ex-members, or both, including JKT48V', () => {
  const active = getRosterPool('active');
  const ex = getRosterPool('ex');
  const all = getRosterPool('all');
  assert.deepEqual(active, getActiveRoster());
  assert.equal(active.length, 61);
  assert.equal(ex.length, 195);
  assert.equal(all.length, active.length + ex.length);
  assert.ok(ex.every((member) => member.graduated && member.rosterScope === 'ex'));
  assert.ok(active.every((member) => !member.graduated && member.rosterScope === 'active'));
  assert.ok(all.some((member) => member.generation.toUpperCase().startsWith('JKT48V')));
  // Current members lead the pool so the prebuilt chemistry subset stays a contiguous prefix.
  assert.deepEqual(all.slice(0, active.length), active);
  assert.equal(getRosterPool('nonsense').length, 61);
});

test('every identity carries a portrait path the asset glob can resolve', () => {
  assert.ok(getRosterPool('ex').every((member) => /^(?:Gen\d+|JKT48V_GEN\d+)\/.+\.(jpg|jpeg|png|webp)$/i.test(member.photo)));
  assert.ok(getRosterPool('active').every((member) => /^[^/]+\.(jpg|jpeg|png|webp)$/i.test(member.photo)));
});

test('roster scope drives the founding pool and the leftover audition pool', () => {
  const activeRun = createGame('scope-test', 'active');
  const allRun = createGame('scope-test', 'all');
  assert.equal(activeRun.rosterScope, 'active');
  assert.equal(activeRun.members.length, 61);
  assert.equal(allRun.rosterScope, 'all');
  assert.equal(allRun.members.length, 256);
  const finalized = finalizeGameSetup(allRun, 'community', allRun.members.slice(0, 12).map((member) => member.id), 'Scope Office', [], { rosterScope: 'all' });
  assert.equal(finalized.rosterScope, 'all');
  assert.equal(finalized.members.length, 12);
  assert.equal(finalized.unsignedMembers.length, 244);
  assert.ok(finalized.unsignedMembers.some((member) => member.rosterScope === 'ex'));
  assert.equal(createGame('scope-test', 'ex').members.length, 195);
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

test('normal and hard mode use their dedicated increased salary rates', () => {
  const draft = createGame('salary-reduction-test');
  const ids = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
  const normal = finalizeGameSetupEngine(draft, 'community', ids, 'Normal Salary Office');
  const hard = finalizeGameSetupEngine(draft, 'community', ids, 'Hard Salary Office', [], { hardMode: true });
  const trainee = { ...normal.members[0], status: 'trainee' };
  assert.equal(getMemberSalary(normal.members[0], 1, false), 15_000_000);
  assert.equal(getMemberSalary(trainee, 1, false), 6_000_000);
  assert.equal(getMemberSalary(hard.members[0], 1, true), 20_000_000);
  assert.equal(getMemberSalary(trainee, 1, true), 8_000_000);
  assert.equal(getMemberSalary(normal.members[0], 2, false), 15_750_000);
});

test('normal mode charges full monthly salary directly without creating arrears', () => {
  const draft = createGame('normal-salary-charge-test');
  const game = { ...finalizeGameSetupEngine(draft, 'community', draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id)), week: 4, money: 0 };
  const next = resolveWeek(game);
  const expectedSalary = BALANCE.foundingRosterSize * BALANCE.salary.regular;
  assert.equal(next.lastResult.finances.salary, expectedSalary);
  assert.equal(next.ledger.debt.salary, 0);
  assert.ok(next.money < -expectedSalary);
});

test('hard mode keeps unpaid monthly salary as debt', () => {
  const draft = createGame('hard-salary-debt-test', 'active', true);
  const game = { ...finalizeGameSetupEngine(draft, 'community', draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id), 'Hard Debt Office', [], { hardMode: true }), week: 4, money: 0 };
  const next = resolveWeek(game);
  assert.equal(next.lastResult.finances.salary, 0);
  assert.equal(next.ledger.debt.salary, BALANCE.foundingRosterSize * BALANCE.salary.hardModeRegular);
  assert.equal(next.ledger.unpaidSalaryMonths, 1);
});

test('new-run January excludes previous December from Seitansai candidates', () => {
  const members = [
    { id: 'december', status: 'active', birthMonth: 12 },
    { id: 'january', status: 'active', birthMonth: 1 },
    { id: 'november', status: 'active', birthMonth: 11 },
  ];
  const base = { members, theaterHistory: [], seitansaiObligations: [] };
  assert.deepEqual(getSeitansaiCandidates({ ...base, year: 1, week: 1 }).map((member) => member.id), ['january']);
  assert.deepEqual(getSeitansaiCandidates({ ...base, year: 1, week: 4 }).map((member) => member.id), ['january']);
  assert.deepEqual(getSeitansaiCandidates({ ...base, year: 2, week: 1 }).map((member) => member.id), ['december', 'january']);
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
  assert.equal(translateIndonesian('Year 3, Week 14'), 'Tahun 3 · Apr · Minggu 2');
  assert.equal(translateIndonesian('Nadia announces graduation for Year 2 · Mar · Week 3.'), 'Nadia mengumumkan kelulusan untuk Tahun 2 · Mar · Minggu 3.');
  assert.equal(translateIndonesian('Fiony has graduated.'), 'Fiony telah lulus.');
  assert.equal(translateIndonesian('Management Perks'), 'Management Perks');
  assert.equal(translateIndonesian('Management Token'), 'Management Token');
  assert.equal(translateIndonesian('Theater results'), 'Hasil teater');
  assert.equal(translateIndonesian('3 unmet'), '3 tidak terpenuhi');
  assert.equal(translateIndonesian('Save plan · FRL28m'), 'Simpan rencana · FRL.28m');
  assert.equal(translateIndonesian('Fan target grade'), 'Nilai target penggemar');
  assert.equal(translateIndonesian('Annual fan result: Exceptional (120.5%).'), 'Hasil target penggemar tahunan: Luar biasa (120.5%).');
  assert.equal(translateIndonesian('Statistics'), 'Statistik');
  assert.equal(translateIndonesian('+12,500 this period'), '+12,500 periode ini');
  assert.equal(translateIndonesian('3 completed'), '3 selesai');
  assert.equal(translateIndonesian('Off-air performance requires 12 members'), 'Penampilan off-air membutuhkan 12 anggota');
  assert.equal(translateIndonesian('24 pool members available'), '24 anggota tersedia di kumpulan');
  assert.equal(translateIndonesian('Fiony returns to the talent pool'), 'Fiony kembali ke kumpulan talenta');
  assert.equal(translateIndonesian('Training History'), 'Riwayat Latihan');
  assert.equal(translateIndonesian('2 training session(s) skipped. Review free days, member availability, and Energy.'), '2 sesi latihan dilewati. Periksa hari kosong, ketersediaan anggota, dan Energi.');
});

test('schedule activity groups are ordered and cover every player-selectable activity once', () => {
  assert.deepEqual(TRAINING_ACTIVITY_GROUPS.map((group) => group.label), ['Light training', 'Regular training', 'Intensive training']);
  assert.deepEqual(SCHEDULE_ACTIVITY_GROUPS.map((group) => group.label), ['Media', 'Show']);
  assert.deepEqual(SCHEDULE_ACTIVITY_GROUPS[0].activities, ['photoshoot', 'media']);
  assert.deepEqual(SCHEDULE_ACTIVITY_GROUPS[1].activities, ['theater', 'offAir']);
  assert.deepEqual(SCHEDULE_STANDALONE_ACTIVITIES, ['liveStream']);
  const configured = [...SCHEDULE_ACTIVITY_GROUPS.flatMap((group) => group.activities), ...SCHEDULE_STANDALONE_ACTIVITIES];
  const schedulable = Object.entries(BALANCE.activities).filter(([id, activity]) => id !== 'rest' && activity.schedulable !== false).map(([id]) => id);
  assert.equal(new Set(configured).size, configured.length);
  assert.deepEqual(new Set(configured), new Set(schedulable));
  assert.deepEqual(new Set(TRAINING_ACTIVITY_GROUPS.flatMap((group) => group.activities)), new Set(Object.entries(BALANCE.activities).filter(([, activity]) => activity.skill).map(([id]) => id)));
});

test('same seed creates different fictional roster stats unless run salt is reused', () => {
  const first = createGame('test-seed');
  const second = createGame('test-seed');
  assert.notEqual(first.runSalt, second.runSalt);
  assert.notDeepEqual(first.members, second.members);

  const repeated = createGame('test-seed', 'active', false, { runSalt: first.runSalt });
  assert.deepEqual(first.members, repeated.members);
});

test('SekaiSein@1903@Marcell seed maxes member ratings and team chemistry while leaving ego seeded', () => {
  const game = createGame('SekaiSein@1903@Marcell');
  const repeated = createGame('SekaiSein@1903@Marcell', 'active', false, { runSalt: 'ignored-random-salt' });
  const ratingKeys = ['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina', 'consistency', 'adaptability', 'popularity', 'energy', 'potential', 'development'];
  assert.ok(game.members.length > 0);
  assert.ok(game.members.every((member) => ratingKeys.every((key) => member[key] === 100)));
  assert.ok(game.members.some((member) => member.ego !== 100));
  assert.equal(game.runSalt, 'all90-fixed');
  assert.deepEqual(game.members, repeated.members);

  const chemistry = getMemberChemistry(game, game.members[0].id, game.members[1].id);
  assert.ok(Object.values(chemistry).every((value) => value === 100));
});

test('initial fictional stats follow member identity instead of roster card position', () => {
  const options = { runSalt: 'identity-scope-test' };
  const allMembers = createGame('identity-stat-seed', 'all', false, options).members;
  const exMembers = createGame('identity-stat-seed', 'ex', false, options).members;
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
  assert.deepEqual(game.theater, { ...offer, marketValue: offer.price, acquisitionCost: offer.price, renovationLevel: 0 });
  assert.equal(game.members.length, BALANCE.foundingRosterSize);
  // Default scope is current members only: 61 identities minus the founding 16.
  assert.equal(game.rosterScope, 'active');
  assert.equal(game.unsignedMembers.length, 61 - BALANCE.foundingRosterSize);
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

test('run-end warnings expose near thresholds, active counters, and recovery progress', () => {
  const game = createGame('run-end-warning-test');
  const safeGame = { ...game, group: { ...game.group, fanbase: 50_000 } };
  assert.deepEqual(getRunEndWarnings(safeGame), []);

  const endangered = {
    ...safeGame,
    hardMode: true,
    members: game.members.slice(0, 13),
    money: -1,
    group: { ...game.group, fanTrust: 4, reputation: 8, fanbase: 19_500 },
    ledger: { ...game.ledger, unpaidSalaryMonths: 2 },
    failureCounters: { negativeCashWeeks: 2, lowTrustWeeks: 1, lowReputationWeeks: 0, lowFanbaseWeeks: 3 },
  };
  const warnings = Object.fromEntries(getRunEndWarnings(endangered).map((warning) => [warning.id, warning]));

  assert.equal(warnings.theaterRoster.severity, 'warning');
  assert.equal(warnings.salaryDefault.severity, 'critical');
  assert.deepEqual([warnings.bankruptcy.value, warnings.bankruptcy.limit], [2, 4]);
  assert.deepEqual([warnings.fanTrust.weeks, warnings.fanTrust.limit], [1, 4]);
  assert.equal(warnings.fanTrust.active, true);
  assert.equal(warnings.reputation.severity, 'warning');
  assert.deepEqual([warnings.fanbase.weeks, warnings.fanbase.limit], [3, 8]);
  assert.deepEqual(getRunEndWarnings({ ...endangered, runStatus: 'ended' }), []);
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
  assert.ok(first.every((offer) => offer.ticketPrice === 200_000));
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

test('annual tax rates use whole-profit brackets in both difficulties', () => {
  assert.equal(getAnnualTaxRate(500_000_000, false), 0.05);
  assert.equal(getAnnualTaxRate(500_000_001, false), 0.10);
  assert.equal(getAnnualTaxRate(1_500_000_001, false), 0.15);
  assert.equal(getAnnualTaxRate(3_000_000_001, false), 0.20);
  assert.equal(getAnnualTaxRate(500_000_000, true), 0.10);
  assert.equal(getAnnualTaxRate(3_000_000_001, true), 0.25);
  assert.equal(getAnnualTaxRate(0, true), 0);
});

test('annual tax includes operating records and excludes financing or facility events', () => {
  const state = {
    ...createGame('tax-calculation-test'),
    taxTrackingStartYear: 1,
    weeklyReports: [{ year: 1, finances: { theater: 900_000_000, campaign: 600_000_000, activityCosts: 200_000_000, refunds: 20_000_000, salary: 100_000_000, debtPayments: 30_000_000, generalOperations: 50_000_000, theaterUpkeep: 25_000_000 } }],
    financialEvents: [
      { year: 1, income: 100_000_000, expense: 10_000_000 },
      { year: 1, income: 500_000_000, expense: 500_000_000, taxable: false },
    ],
  };
  const tax = calculateAnnualTax(state, 1);
  assert.equal(tax.operatingIncome, 1_600_000_000);
  assert.equal(tax.deductibleExpenses, 435_000_000);
  assert.equal(tax.taxableProfit, 1_165_000_000);
  assert.equal(tax.rate, 0.10);
  assert.equal(tax.taxDue, 116_500_000);
});

test('annual tax never charges a loss and prior tax-debt payments are deductible', () => {
  const base = { ...createGame('tax-loss-test'), taxTrackingStartYear: 1, hardMode: false };
  const loss = calculateAnnualTax({ ...base, weeklyReports: [{ year: 1, finances: { theater: 100_000_000, activityCosts: 150_000_000 } }] }, 1);
  assert.equal(loss.taxableProfit, 0);
  assert.equal(loss.taxDue, 0);

  const paid = payDebt({ ...base, runStatus: 'active', year: 2, money: 40_000_000, ledger: { debt: { salary: 0, upkeep: 0, operations: 0, tax: 60_000_000 } } }, 'tax');
  assert.equal(paid.money, 0);
  assert.equal(paid.ledger.debt.tax, 20_000_000);
  const nextTax = calculateAnnualTax({ ...paid, financialEvents: [...paid.financialEvents, { id: 'income', year: 2, income: 100_000_000, expense: 0 }] }, 2);
  assert.equal(nextTax.taxableProfit, 60_000_000);
});

test('legacy economy migration upgrades unbooked venues once and exempts the partial year', () => {
  const base = createGame('economy-migration-test');
  const legacy = { ...base, economySchemaVersion: 0, taxTrackingStartYear: undefined, runStatus: 'active', week: 20, theater: { ...base.theaterOffers[0], price: 200_000_000 }, concertVenueOffers: [{ id: 'legacy-offer', cost: 100_000_000, capacity: 2_000 }] };
  const migrated = migrateEconomyState(legacy);
  assert.equal(migrated.concertVenueOffers[0].cost, 150_000_000);
  assert.equal(migrated.taxTrackingStartYear, 2);
  assert.equal(migrated.theater.marketValue, 200_000_000);
  assert.equal(migrated.ledger.debt.tax, 0);
  assert.deepEqual(migrateEconomyState(migrated), migrated);
});

test('Week 48 creates a persistent settlement and blocks another resolve until completion', () => {
  const draft = createGame('year-end-settlement-test');
  let game = finalizeGameSetup({ ...draft, week: 48 }, 'community', draft.members.slice(0, 12).map((member) => member.id));
  game = resolveWeek(game);
  assert.equal(game.year, 1);
  assert.equal(game.week, 48);
  assert.equal(game.pendingYearEndSettlement.closingYear, 1);
  const blocked = resolveWeek(game);
  assert.equal(blocked.year, 1);
  assert.equal(blocked.week, 48);
  game = settleAnnualTax(game);
  assert.equal(game.pendingYearEndSettlement.stage, 'theater');
  game = completeYearEndSettlement(game, 'keep');
  assert.equal(game.pendingYearEndSettlement, null);
  assert.equal(game.year, 2);
  assert.equal(game.week, 1);
  assert.equal(game.yearEndSettlements.length, 1);
  assert.ok(game.history.some((entry) => entry.id === 'year-2'));
});

test('tax shortage becomes interest-free debt and theater replacement applies resale credit', () => {
  const draft = createGame('tax-debt-theater-change-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  game = { ...game, money: 30_000_000, pendingYearEndSettlement: { id: 'year-end-settlement-1', closingYear: 1, nextYear: 2, stage: 'tax', tax: { year: 1, taxDue: 100_000_000 } } };
  game = settleAnnualTax(game);
  assert.equal(game.money, 0);
  assert.equal(game.ledger.debt.tax, 70_000_000);
  assert.equal(game.pendingYearEndSettlement.stage, 'theater');
  game = { ...game, money: 2_000_000_000 };
  const offers = getTheaterChangeOffers(game);
  assert.deepEqual(offers.map((offer) => offer.id), ['expanded', 'metropolitan', 'grand']);
  assert.ok(offers.every((offer) => offer.grossPrice > game.theater.marketValue && offer.capacity > game.theater.capacity));
  const offer = offers[0];
  const oldTicketPrice = game.theater.ticketPrice;
  game = completeYearEndSettlement(game, 'change', offer.id);
  assert.equal(game.theater.capacity, offer.capacity);
  assert.equal(game.theater.marketValue, offer.grossPrice);
  assert.equal(game.theater.ticketPrice, oldTicketPrice);
  assert.equal(game.theater.renovationLevel, 0);
  assert.equal(game.money, 2_000_000_000 - offer.netPayment);
  assert.equal(game.theaterChanges[0].resaleCredit, offer.resaleCredit);
});

test('theater replacement applies purchase and upkeep perks after gross offer calculation', () => {
  const draft = createGame('theater-change-perk-test');
  const ids = draft.members.slice(0, 12).map((member) => member.id);
  const base = finalizeGameSetup(draft, 'community', ids, 'Base theater');
  const perked = finalizeGameSetup(draft, 'community', ids, 'Perked theater', ['B001', 'B002']);
  const baseOffer = getTheaterChangeOffers(base)[2];
  const perkedOffer = getTheaterChangeOffers(perked)[2];
  assert.equal(perkedOffer.grossPrice, baseOffer.grossPrice);
  assert.equal(perkedOffer.capacity, baseOffer.capacity);
  assert.ok(perkedOffer.netPayment < baseOffer.netPayment);
  assert.ok(perkedOffer.weeklyUpkeep < baseOffer.weeklyUpkeep);
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

test('projected Energy matches resolved Stamina fatigue and passive recovery', () => {
  const draft = createGame('projected-energy-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = game.members[0].id;
  game = { ...game, members: game.members.map((member) => member.id === memberId ? { ...member, energy: 60, stamina: 50 } : member) };
  for (const day of DAYS) game = assignActivity(game, memberId, day, 'media');
  const projected = getProjectedEnergyByMember(game)[memberId];
  const resolved = resolveWeek(game).members.find((member) => member.id === memberId).energy;
  assert.equal(projected, 48);
  assert.equal(projected, resolved);
});

test('projected Energy includes Recovery Program and current-week Stamina growth', () => {
  const draft = createGame('projected-energy-stamina-training-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id), 'Energy Office', ['B011']);
  const memberId = game.members[0].id;
  game = { ...game, members: game.members.map((member) => member.id === memberId ? { ...member, energy: 90, stamina: 40 } : member) };
  for (const day of DAYS) game = queueTrainingSession(game, memberId, 'staminaIntensive');
  const projected = getProjectedEnergyByMember(game)[memberId];
  const resolvedGame = resolveWeek(game);
  const resolvedMember = resolvedGame.members.find((member) => member.id === memberId);
  assert.ok(resolvedMember.stamina > 40);
  assert.equal(projected, resolvedMember.energy);
});

test('standalone training queue supports ordering, removal, limits, and availability gates', () => {
  const game = createGame('standalone-training-queue-test');
  const memberId = game.members[0].id;
  let planned = queueTrainingSession(game, memberId, 'vocal');
  planned = queueTrainingSession(planned, memberId, 'danceIntensive');
  assert.deepEqual(planned.trainingPlans[memberId], ['vocal', 'danceIntensive']);
  planned = moveTrainingSession(planned, memberId, 1, 0);
  assert.deepEqual(planned.trainingPlans[memberId], ['danceIntensive', 'vocal']);
  planned = removeTrainingSession(planned, memberId, 1);
  assert.deepEqual(planned.trainingPlans[memberId], ['danceIntensive']);
  while (planned.trainingPlans[memberId].length < BALANCE.training.maxSessionsPerMember) planned = queueTrainingSession(planned, memberId, 'vocalLight');
  assert.equal(queueTrainingSession(planned, memberId, 'mc'), planned);
  assert.equal(assignActivity(game, memberId, 'Mon', 'vocal'), game);
  assert.deepEqual(clearTrainingPlan(planned, memberId).trainingPlans, {});

  const injured = { ...game, members: game.members.map((member) => member.id === memberId ? { ...member, injury: { severity: 'minor', weeksRemaining: 1, blocks: ['training'] } } : member) };
  const suspended = { ...game, members: game.members.map((member) => member.id === memberId ? { ...member, status: 'suspended', suspensionWeeks: 2 } : member) };
  assert.equal(queueTrainingSession(injured, memberId, 'vocal'), injured);
  assert.equal(queueTrainingSession(suspended, memberId, 'vocal'), suspended);
});

test('training uses explicit Rest, follows queue order, and skips overflow after Schedule changes', () => {
  const game = createGame('standalone-training-priority-test');
  const memberId = game.members[0].id;
  let planned = game;
  for (let index = 0; index < 7; index += 1) planned = queueTrainingSession(planned, memberId, index === 0 ? 'danceIntensive' : 'vocalLight');
  planned = assignActivity(planned, memberId, 'Mon', 'media');
  planned = assignActivity(planned, memberId, 'Tue', 'rest');
  assert.equal(getTrainingPlanStatus(planned, memberId).overflow, 1);
  const projected = getProjectedEnergyByMember(planned)[memberId];
  const next = resolveWeek(planned);
  const sessions = next.lastResult.trainingSessions.filter((session) => session.memberId === memberId);
  const completed = sessions.filter((session) => session.status === 'completed');
  const skipped = sessions.filter((session) => session.status === 'skipped');
  assert.equal(completed.length, 6);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].reason, 'no-free-day');
  assert.deepEqual(completed.map((session) => session.day), ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.equal(completed[0].activityId, 'danceIntensive');
  assert.equal(next.lastResult.schedule[`${memberId}:Mon`], 'media');
  assert.equal(next.lastResult.schedule[`${memberId}:Tue`], undefined);
  assert.equal(next.lastResult.finances.activityCosts, BALANCE.activities.media.cost + BALANCE.activities.danceIntensive.cost + BALANCE.activities.vocalLight.cost * 5);
  assert.equal(next.members.find((member) => member.id === memberId).energy, projected);
  assert.deepEqual(next.trainingPlans[memberId], ['vocalLight']);
  const carriedResolved = resolveWeek(next);
  assert.deepEqual(carriedResolved.trainingPlans, {});
  assert.ok(next.notifications.some((notification) => notification.code === 'training-skipped'));
});

test('injured or suspended members keep blocked training sessions for next week', () => {
  for (const block of ['injury', 'suspension']) {
    const draft = createGame(`training-carryover-${block}`);
    const memberId = draft.members[0].id;
    const member = block === 'injury'
      ? { ...draft.members[0], injury: { severity: 'minor', weeksRemaining: 1, blocks: ['training'] } }
      : { ...draft.members[0], status: 'suspended', suspensionWeeks: 1 };
    const queued = queueTrainingSession(draft, memberId, 'vocal');
    const game = { ...queued, members: queued.members.map((item) => item.id === memberId ? member : item) };
    const next = resolveWeek(game);
    assert.deepEqual(next.trainingPlans[memberId], ['vocal'], `${block} session should carry forward`);
    const resolved = resolveWeek(next);
    assert.equal(resolved.trainingPlans[memberId], undefined, `${block} session should resolve after block clears`);
  }
});

test('training queue order deterministically controls which skill receives the stronger Energy band', () => {
  const build = (firstActivity, secondActivity) => {
    let game = createGame('training-order-energy-band-test');
    const memberId = game.members[0].id;
    game = { ...game, members: game.members.map((member) => member.id === memberId ? { ...member, energy: 50, vocal: 50, dance: 50, performance: 50, mc: 50, variety: 50, stamina: 0, potential: 100, development: 100, adaptability: 50, traits: [] } : member) };
    game = queueTrainingSession(game, memberId, firstActivity);
    game = queueTrainingSession(game, memberId, secondActivity);
    return resolveWeek(game).members.find((member) => member.id === memberId);
  };
  const vocalFirst = build('vocalIntensive', 'danceIntensive');
  const danceFirst = build('danceIntensive', 'vocalIntensive');
  assert.ok(vocalFirst.vocal > danceFirst.vocal);
  assert.ok(danceFirst.dance > vocalFirst.dance);
});

test('training templates save, replace included plans, rename, apply, and delete', () => {
  let game = createGame('training-template-test');
  const [first, second, third] = game.members;
  game = queueTrainingSession(game, first.id, 'vocal');
  game = queueTrainingSession(game, second.id, 'danceLight');
  game = saveTrainingTemplate(game, 'Development A');
  const template = game.trainingTemplates[0];
  game = clearTrainingPlan(game, first.id);
  game = queueTrainingSession(game, third.id, 'mc');
  game = applyTrainingTemplate(game, template);
  assert.deepEqual(game.trainingPlans[first.id], ['vocal']);
  assert.deepEqual(game.trainingPlans[second.id], ['danceLight']);
  assert.deepEqual(game.trainingPlans[third.id], ['mc']);
  game = renameTrainingTemplate(game, template.id, 'Development B');
  assert.equal(game.trainingTemplates[0].name, 'Development B');
  game = deleteTrainingTemplate(game, template.id);
  assert.deepEqual(game.trainingTemplates, []);
});

test('legacy training migration splits schedules, templates, and reports once', () => {
  const game = createGame('training-migration-test');
  const memberId = game.members[0].id;
  const legacy = {
    ...game,
    trainingSchemaVersion: 0,
    schedule: { [`${memberId}:Tue`]: 'dance', [`${memberId}:Mon`]: 'vocalLight', [`${memberId}:Wed`]: 'media', [`${memberId}:Thu`]: 'rest' },
    scheduleTemplates: [{ id: 'mixed', name: 'Mixed week', createdYear: 1, createdWeek: 1, entries: [{ memberId, day: 'Tue', activityId: 'dance' }, { memberId, day: 'Wed', activityId: 'media' }, { memberId, day: 'Mon', activityId: 'vocalLight' }, { memberId, day: 'Thu', activityId: 'rest' }] }],
    weeklyReports: [{ year: 1, week: 1, schedule: { [`${memberId}:Mon`]: 'vocal', [`${memberId}:Tue`]: 'media' } }],
    lastResult: { year: 1, week: 1, schedule: { [`${memberId}:Mon`]: 'vocal' } },
  };
  const migrated = migrateTrainingState(legacy);
  assert.deepEqual(migrated.trainingPlans[memberId], ['vocalLight', 'dance']);
  assert.deepEqual(migrated.schedule, { [`${memberId}:Wed`]: 'media' });
  assert.deepEqual(migrated.scheduleTemplates[0].entries, [{ memberId, day: 'Wed', activityId: 'media' }]);
  assert.deepEqual(migrated.trainingTemplates[0].entries, [{ memberId, sessions: ['vocalLight', 'dance'] }]);
  assert.deepEqual(migrated.weeklyReports[0].schedule, { [`${memberId}:Tue`]: 'media' });
  assert.equal(migrated.weeklyReports[0].trainingSessions[0].legacy, true);
  assert.deepEqual(migrateTrainingState(migrated), migrated);
});

test('completed training sessions backfill missing Skill Growth report entries', () => {
  const report = {
    skillChanges: [],
    trainingSessions: [
      { memberId: 'member-1', memberName: 'Member One', skill: 'vocal', status: 'completed', before: 60, after: 60.2, delta: 0.2 },
      { memberId: 'member-1', memberName: 'Member One', skill: 'vocal', status: 'completed', before: 60.2, after: 60.5, delta: 0.3 },
      { memberId: 'member-1', memberName: 'Member One', skill: 'dance', status: 'skipped', before: 50, after: 50, delta: 0 },
    ],
  };
  assert.deepEqual(getReportSkillChanges(report), [
    { memberId: 'member-1', memberName: 'Member One', skill: 'vocal', before: 60, after: 60.5, delta: 0.5 },
  ]);
  assert.deepEqual(migrateTrainingState({ trainingPlans: {}, schedule: {}, scheduleTemplates: [], trainingTemplates: [], weeklyReports: [report], lastResult: report }).lastResult.skillChanges, getReportSkillChanges(report));
});

test('moderate injuries include every minor restriction plus their own limits', () => {
  const injury = (severity) => ({ status: 'active', injury: { severity, weeksRemaining: severity === 'minor' ? 1 : 2, blocks: BALANCE.injury.severities.find((item) => item.id === severity).blocks } });
  const minor = injury('minor');
  assert.equal(canMemberPerform(minor, 'vocal'), false);
  assert.equal(canMemberPerform(minor, 'theater'), false);
  assert.equal(canMemberPerform(minor, 'offAir'), false);
  assert.equal(canMemberPerform(minor, 'mg1'), false);
  assert.equal(canMemberPerform(minor, 'photoshoot'), true);
  assert.equal(canMemberPerform(minor, 'media'), true);
  assert.equal(canMemberPerform(minor, 'vc1'), true);
  const moderate = injury('moderate');
  for (const activity of ['vocal', 'theater', 'offAir', 'mg1', 'photoshoot', 'media', 'vc1']) assert.equal(canMemberPerform(moderate, activity), false);
  assert.equal(canMemberPerform(moderate, 'liveStream'), true);
  assert.equal(canMemberPerform(moderate, 'rest'), true);
});

test('injury history migration backfills one active legacy incident and stays idempotent', () => {
  const game = createGame('legacy-injury-history-test');
  const member = game.members[0];
  const legacy = {
    ...game,
    injuryHistorySchemaVersion: 0,
    members: game.members.map((item) => item.id === member.id ? { ...item, injury: { severity: 'minor', label: 'Minor', weeksRemaining: 1, weeks: 1, blocks: ['training'], causedBy: { year: 1, week: 1, load: 8 } }, injuryHistory: undefined } : item),
  };
  const migrated = migrateInjuryHistoryState(legacy);
  const migratedMember = migrated.members.find((item) => item.id === member.id);
  assert.equal(migrated.injuryHistorySchemaVersion, 1);
  assert.equal(migratedMember.injuryHistory.length, 1);
  assert.equal(migratedMember.injury.incidentId, migratedMember.injuryHistory[0].id);
  assert.equal(migratedMember.injuryHistory[0].legacy, true);
  assert.equal(migrated.history.filter((event) => event.incidentId === migratedMember.injury.incidentId).length, 1);
  assert.deepEqual(migrateInjuryHistoryState(migrated), migrated);
});

test('injury migration clears completed graduates and legacy regenerated candidates', () => {
  const draft = createGame('legacy-regenerated-injury-clear-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const member = game.members[0];
  const incident = { id: `injury-${member.identityId}-1-1`, memberId: member.id, identityId: member.identityId, severity: 'minor', label: 'Minor', startYear: 1, startWeek: 1, originalWeeks: 1, workload: 8, assignments: [], status: 'recovered', recoveredYear: 1, recoveredWeek: 2 };
  const returnedCandidate = { ...game.unsignedMembers[0], id: `${game.unsignedMembers[0].identityId}-return-1`, incarnation: 1, injuryHistory: [incident] };
  const legacy = {
    ...game,
    unsignedMembers: [returnedCandidate, ...game.unsignedMembers.slice(1)],
    graduations: [{ id: 'legacy-completed-graduation', memberId: member.id, completed: true, memberSnapshot: { ...member, status: 'graduated', injuryHistory: [incident] } }],
  };
  const migrated = migrateInjuryHistoryState(legacy);
  assert.deepEqual(migrated.unsignedMembers[0].injuryHistory, []);
  assert.equal(migrated.unsignedMembers[0].injury, null);
  assert.deepEqual(migrated.graduations[0].memberSnapshot.injuryHistory, []);
  assert.equal(migrated.graduations[0].memberSnapshot.injury, null);
  assert.deepEqual(migrateInjuryHistoryState(migrated), migrated);
});

test('resolved injuries record full workload, activities, onset, and recovery once', () => {
  let injuredGame = null;
  let injuredMemberId = null;
  for (let attempt = 0; attempt < 200 && !injuredGame; attempt += 1) {
    let game = createGame(`injury-incident-test-${attempt}`);
    injuredMemberId = game.members[0].id;
    for (let day = 0; day < DAYS.length; day += 1) game = queueTrainingSession(game, injuredMemberId, 'performanceIntensive');
    const resolved = resolveWeek(game);
    if (resolved.members.find((member) => member.id === injuredMemberId)?.injuryHistory?.some((incident) => incident.status === 'active')) injuredGame = resolved;
  }
  assert.ok(injuredGame, 'expected deterministic seed search to produce an injury');
  const injuredMember = injuredGame.members.find((member) => member.id === injuredMemberId);
  const incident = injuredMember.injuryHistory[0];
  assert.equal(incident.workload, DAYS.length * BALANCE.injury.loadByType.heavy);
  assert.deepEqual(incident.assignments.map(({ day, source }) => ({ day, source })), DAYS.map((day) => ({ day, source: 'training' })));
  assert.equal(injuredGame.history.filter((event) => event.id === `${incident.id}-onset`).length, 1);

  let recoveredGame = injuredGame;
  for (let week = 0; week < 3 && recoveredGame.members.find((member) => member.id === injuredMemberId).injury; week += 1) recoveredGame = resolveWeek(recoveredGame);
  const recoveredMember = recoveredGame.members.find((member) => member.id === injuredMemberId);
  const recoveredIncident = recoveredMember.injuryHistory.find((item) => item.id === incident.id);
  assert.equal(recoveredIncident.status, 'recovered');
  assert.ok(recoveredIncident.recoveredYear);
  assert.ok(recoveredIncident.recoveredWeek);
  assert.equal(recoveredGame.history.filter((event) => event.id === `${incident.id}-recovery`).length, 1);
  assert.deepEqual(migrateInjuryHistoryState(recoveredGame), recoveredGame);
});

test('regenerated members return to the audition pool with cleared injury history', () => {
  let game = createGame('injury-release-history-test');
  const member = game.members[0];
  const activeIncident = { id: `injury-${member.identityId}-1-1`, memberId: member.id, identityId: member.identityId, severity: 'minor', label: 'Minor', startYear: 1, startWeek: 1, originalWeeks: 1, workload: 8, assignments: [], status: 'active', recoveredYear: null, recoveredWeek: null };
  game = { ...game, runStatus: 'active', members: game.members.map((item) => item.id === member.id ? { ...item, injury: { severity: 'minor', label: 'Minor', weeksRemaining: 1, weeks: 1, blocks: ['training'], incidentId: activeIncident.id }, injuryHistory: [activeIncident] } : item) };
  game = fireMember(game, member.id);
  game = { ...game, departures: game.departures.map((departure) => ({ ...departure, returnAbsolute: 1 })) };
  const returned = resolveWeek(game);
  const poolMember = returned.unsignedMembers.find((item) => item.identityId === member.identityId);
  assert.ok(poolMember);
  assert.equal(poolMember.injury, null);
  assert.deepEqual(poolMember.injuryHistory, []);
  assert.equal(returned.history.filter((event) => event.id === `${activeIncident.id}-recovery`).length, 0);
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
  for (const skill of ['vocal', 'dance', 'performance', 'mc']) assert.equal(updated[skill], member[skill]);
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

test('a completed Seitansai show immediately fulfills its member obligation', () => {
  const draft = createGame('seitansai-fulfillment-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id), 'Birthday Office', [], { hardMode: true });
  const birthdayMemberId = game.members[0].id;
  game = { ...game, members: game.members.map((member) => member.id === birthdayMemberId ? { ...member, birthMonth: 1 } : member) };
  game = resolveWeek(game);
  assert.equal(game.seitansaiObligations.find((item) => item.memberId === birthdayMemberId)?.status, 'open');

  game.members.forEach((member) => { game = assignActivity(game, member.id, 'Sat', 'theater'); });
  game = configureTheaterShow(game, 'Sat', SETLISTS[0].id, birthdayMemberId);
  game = { ...game, theaterShows: { ...game.theaterShows, Sat: { ...game.theaterShows.Sat, isSeitansai: true, seitansaiMemberId: birthdayMemberId } } };
  game = resolveWeek(game);

  assert.equal(game.seitansaiObligations.find((item) => item.memberId === birthdayMemberId)?.status, 'fulfilled');
  assert.equal(game.theaterHistory.at(-1).isSeitansai, true);
  assert.equal(game.theaterHistory.at(-1).seitansaiMemberId, birthdayMemberId);
});

test('theater show configuration rejects unknown setlists and non-lineup centers', () => {
  const draft = createGame('theater-setlist-validation-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  game = assignActivity(game, game.members[0].id, 'Sat', 'theater');
  assert.equal(configureTheaterShow(game, 'Sat', 'missing', game.members[0].id), game);
  assert.equal(configureTheaterShow(game, 'Sat', SETLISTS[0].id, game.members[1].id), game);
});

test('STS and Last Show assignments stay unique across theater shows', () => {
  const game = createGame('sts-last-show-uniqueness-test');
  const [first, second, third] = game.members;
  const configured = {
    ...game,
    theaterShows: {
      Mon: { isSeitansai: true, seitansaiMemberId: first.id },
      Tue: { isLastShow: true, lastShowMemberId: second.id },
    },
  };
  assert.deepEqual(getStsLastShowAssignmentConflicts(configured), []);
  assert.deepEqual(getAvailableStsLastShowMembers(configured, { day: 'Wed', assignmentKey: 'seitansaiMemberId', eligibleMembers: [first, second, third] }).map((member) => member.id), [third.id]);
  assert.deepEqual(getAvailableStsLastShowMembers(configured, { day: 'Mon', assignmentKey: 'seitansaiMemberId', eligibleMembers: [first, second, third] }).map((member) => member.id), [first.id, third.id]);
  const moved = configureTheaterSpecialFlags(configured, 'Mon', { seitansaiMemberId: third.id });
  assert.deepEqual(getAvailableStsLastShowMembers(moved, { day: 'Tue', assignmentKey: 'lastShowMemberId', eligibleMembers: [first, second, third] }).map((member) => member.id), [first.id, second.id]);
  const swapped = replaceTheaterSpecialAssignment(configured, 'Tue', 'lastShowMemberId', first.id);
  assert.equal(swapped.theaterShows.Tue.lastShowMemberId, first.id);
  assert.equal(swapped.theaterShows.Mon.seitansaiMemberId, second.id);
  assert.deepEqual(getStsLastShowAssignmentConflicts(swapped), []);
});

test('different members can have Seitansai shows in the same week', () => {
  const game = createGame('multiple-sts-week-test');
  const [first, second] = game.members;
  const firstShow = configureTheaterSpecialFlags(game, 'Mon', { isSeitansai: true, seitansaiMemberId: first.id });
  const secondShow = configureTheaterSpecialFlags(firstShow, 'Tue', { isSeitansai: true, seitansaiMemberId: second.id });
  assert.equal(secondShow.theaterShows.Mon.seitansaiMemberId, first.id);
  assert.equal(secondShow.theaterShows.Tue.seitansaiMemberId, second.id);
  assert.deepEqual(getStsLastShowAssignmentConflicts(secondShow), []);
});

test('Seitansai and Last Show cannot share the same theater day', () => {
  const game = createGame('same-day-special-show-guard-test');
  const [birthdayMember, graduate] = game.members;
  const seitansai = configureTheaterSpecialFlags(game, 'Sat', { isSeitansai: true, seitansaiMemberId: birthdayMember.id });
  assert.equal(configureTheaterSpecialFlags(seitansai, 'Sat', { isLastShow: true, lastShowMemberId: graduate.id }), seitansai);

  const lastShow = configureTheaterSpecialFlags(game, 'Sat', { isLastShow: true, lastShowMemberId: graduate.id });
  assert.equal(configureTheaterSpecialFlags(lastShow, 'Sat', { isSeitansai: true, seitansaiMemberId: birthdayMember.id }), lastShow);

  const corrupted = {
    ...game,
    theaterShows: {
      Sat: {
        isSeitansai: true,
        seitansaiMemberId: birthdayMember.id,
        isLastShow: true,
        lastShowMemberId: graduate.id,
      },
    },
  };
  assert.equal(getStsLastShowAssignmentConflicts(corrupted)[0]?.type, 'same-day-special-show');
  const blocked = resolveWeek(corrupted);
  assert.equal(blocked.week, game.week);
  assert.match(blocked.notifications[0].text, /cannot be scheduled on the same theater day/);
});

test('resolveWeek blocks corrupted duplicate STS / Last Show assignments', () => {
  const game = createGame('sts-last-show-duplicate-guard-test');
  const memberId = game.members[0].id;
  const corrupted = { ...game, theaterShows: { Mon: { isSeitansai: true, seitansaiMemberId: memberId }, Tue: { isLastShow: true, lastShowMemberId: memberId } } };
  const blocked = resolveWeek(corrupted);
  assert.equal(blocked.week, game.week);
  assert.match(blocked.notifications[0].text, /must be unique/);
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
  const next = resolveWeek(queueTrainingSession(game, member.id, 'vocal'));
  const change = next.lastResult.skillChanges.find((item) => item.memberId === member.id && item.skill === 'vocal');
  assert.ok(change);
  assert.ok(change.delta > 0);
  assert.ok(change.after > change.before);
});

test('training intensity and starting energy affect development', () => {
  const draft = createGame('training-intensity-test');
  const base = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = base.members[0].id;
  const prepare = (energy, activity) => queueTrainingSession({ ...base, members: base.members.map((member) => member.id === memberId ? { ...member, energy, vocal: 40, potential: 95, development: 90 } : member) }, memberId, activity);
  const light = resolveWeek(prepare(100, 'vocalLight')).members.find((member) => member.id === memberId).vocal;
  const intensive = resolveWeek(prepare(100, 'vocalIntensive')).members.find((member) => member.id === memberId).vocal;
  const exhausted = resolveWeek(prepare(15, 'vocalIntensive')).members.find((member) => member.id === memberId).vocal;
  assert.ok(intensive > light);
  assert.ok(intensive > exhausted);
  assert.equal(BALANCE.activities.variety.skill, 'variety');
});

test('regular training multiplies the former uncapped gain by exactly 2.5', () => {
  const draft = createGame('training-multiplier-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = game.members[0].id;
  game = { ...game, members: game.members.map((member) => member.id === memberId ? { ...member, vocal: 40, dance: 40, performance: 40, mc: 40, variety: 40, potential: 85, development: 100, developmentCurve: 'balanced', adaptability: 50, traits: [], energy: 100, voucherBaseStats: undefined } : member) };
  const next = resolveWeek(queueTrainingSession(game, memberId, 'vocal'));
  const trained = next.members.find((member) => member.id === memberId);
  assert.equal(BALANCE.training.statGainMultiplier, 2.5);
  assert.ok(Math.abs(trained.vocal - 42.5) < 0.000001, `expected 42.5, received ${trained.vocal}`);
});

test('completed activities add only their mapped Light-baseline skill gains', () => {
  const draft = createGame('activity-development-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = game.members[0].id;
  game = { ...game, members: game.members.map((member) => member.id === memberId ? { ...member, vocal: 40, dance: 40, performance: 40, mc: 40, variety: 40, potential: 85, development: 100, developmentCurve: 'balanced', adaptability: 50, traits: [], energy: 100, voucherBaseStats: undefined } : member) };
  const next = resolveWeek(assignActivity(game, memberId, 'Mon', 'media'));
  const developed = next.members.find((member) => member.id === memberId);
  assert.equal(developed.vocal, 40);
  assert.equal(developed.dance, 40);
  assert.ok(Math.abs(developed.mc - 40.6) < 0.000001);
  assert.ok(Math.abs(developed.variety - 40.6) < 0.000001);
  assert.deepEqual(next.lastResult.skillChanges.filter((change) => change.memberId === memberId).map((change) => change.skill).sort(), ['mc', 'variety']);
});

test('activity and opportunity development mappings cover each requested work type', () => {
  assert.deepEqual(ACTIVITY_SKILL_GAINS.theater, ['vocal', 'dance', 'performance', 'mc']);
  assert.deepEqual(ACTIVITY_SKILL_GAINS.offAir, ['vocal', 'dance', 'performance', 'mc']);
  assert.deepEqual(ACTIVITY_SKILL_GAINS.liveStream, ['mc', 'variety']);
  assert.deepEqual(ACTIVITY_SKILL_GAINS.media, ['mc', 'variety']);
  assert.deepEqual(ACTIVITY_SKILL_GAINS.photoshoot, ['performance', 'variety']);
  assert.deepEqual(ACTIVITY_SKILL_GAINS.vc1, ['mc', 'variety']);
  assert.deepEqual(ACTIVITY_SKILL_GAINS.mg1, ['mc', 'variety']);
  assert.deepEqual(ACTIVITY_SKILL_GAINS.mvProduction, ['vocal', 'dance', 'performance']);
  assert.deepEqual(ACTIVITY_SKILL_GAINS.concertRehearsal, ['vocal', 'dance', 'performance']);
  assert.deepEqual(ACTIVITY_SKILL_GAINS.concert, ['vocal', 'dance', 'performance', 'mc']);
  assert.deepEqual(OPPORTUNITY_SKILL_GAINS.media, ['mc', 'variety']);
  assert.deepEqual(OPPORTUNITY_SKILL_GAINS.live, ['vocal', 'dance', 'performance', 'mc']);
  assert.deepEqual(OPPORTUNITY_SKILL_GAINS.sponsor, ['performance', 'variety']);
});

test('schedule template assigns available members and skips unavailable members', () => {
  const game = createGame('schedule-template-test');
  const [available, unavailable] = game.members;
  const suspended = { ...game, members: game.members.map((member) => member.id === unavailable.id ? { ...member, status: 'suspended', suspensionWeeks: 2 } : member) };
  const template = { name: 'Media week', entries: [{ memberId: available.id, day: 'Mon', activityId: 'media' }, { memberId: unavailable.id, day: 'Tue', activityId: 'photoshoot' }] };
  const next = applyScheduleTemplate(suspended, template);
  assert.equal(next.schedule[`${available.id}:Mon`], 'media');
  assert.equal(next.schedule[`${unavailable.id}:Tue`], undefined);
  assert.match(next.notifications[0].text, /1 template assignment\(s\) skipped/);
});

test('legacy Schedule template Rest entries remain empty when applied', () => {
  const game = createGame('legacy-rest-template-test');
  const memberId = game.members[0].id;
  const restOnly = { id: 'legacy-rest-only', name: 'Old rest template', entries: [{ memberId, day: 'Mon', activityId: 'rest' }] };
  assert.equal(applyScheduleTemplate(game, restOnly), game);

  const mixed = { id: 'legacy-rest-mixed', name: 'Old mixed template', entries: [...restOnly.entries, { memberId, day: 'Tue', activityId: 'media' }] };
  const applied = applyScheduleTemplate(game, mixed);
  assert.equal(applied.schedule[`${memberId}:Mon`], undefined);
  assert.equal(applied.schedule[`${memberId}:Tue`], 'media');
});

test('campaign priority keeps template assignments from replacing campaign work', () => {
  const game = createGame('campaign-template-priority-test');
  const memberId = game.members[0].id;
  const template = { name: 'Media week', entries: [{ memberId, day: 'Mon', activityId: 'media' }] };
  for (const campaignActivity of ['concert', 'mg1', 'mvProduction', 'vc1']) {
    const staged = { ...game, schedule: { [`${memberId}:Mon`]: campaignActivity } };
    const next = applyScheduleTemplate(staged, template);
    assert.equal(next.schedule[`${memberId}:Mon`], campaignActivity, `${campaignActivity} must outrank template work`);
  }
});

test('schedule templates apply theater setlists and substitute unavailable saved centers', () => {
  const game = createGame('schedule-template-theater-plan-test');
  const lineup = game.members.slice(0, 12);
  const unavailableCenter = game.members[12];
  const template = {
    name: 'Theater plan',
    entries: lineup.map((member) => ({ memberId: member.id, day: 'Sat', activityId: 'theater' })),
    theaterPlans: { Sat: { setlistId: SETLISTS[1].id, centerId: unavailableCenter.id } },
  };
  const next = applyScheduleTemplate(game, template);
  assert.equal(next.theaterShows.Sat.setlistId, SETLISTS[1].id);
  assert.ok(lineup.some((member) => member.id === next.theaterShows.Sat.centerId));
  assert.match(next.notifications[0].text, /1 unavailable center\(s\) replaced/);
});

test('schedule templates replace an unlocked theater lineup before restoring its setlist and center', () => {
  const game = createGame('schedule-template-theater-replace-test');
  const existingLineup = game.members.slice(0, 12);
  const savedLineup = game.members.slice(12, 24);
  const staged = existingLineup.reduce((current, member) => assignActivity(current, member.id, 'Sat', 'theater'), game);
  const template = {
    name: 'Saved theater lineup',
    entries: savedLineup.map((member) => ({ memberId: member.id, day: 'Sat', activityId: 'theater' })),
    theaterPlans: { Sat: { setlistId: SETLISTS[1].id, centerId: savedLineup[0].id } },
  };
  const next = applyScheduleTemplate(staged, template);
  const appliedLineup = next.members.filter((member) => next.schedule[`${member.id}:Sat`] === 'theater').map((member) => member.id);
  assert.deepEqual(new Set(appliedLineup), new Set(savedLineup.map((member) => member.id)));
  assert.equal(next.theaterShows.Sat.setlistId, SETLISTS[1].id);
  assert.equal(next.theaterShows.Sat.centerId, savedLineup[0].id);
});

test('training migration preserves theater-only schedule templates', () => {
  const template = { id: 'theater-only', name: 'Theater only', entries: [], theaterPlans: { Sat: { setlistId: SETLISTS[1].id, centerId: 'member-1' } } };
  const migrated = migrateTrainingState({ schedule: {}, scheduleTemplates: [template], trainingPlans: {}, trainingTemplates: [] });
  assert.equal(migrated.scheduleTemplates.length, 1);
  assert.deepEqual(migrated.scheduleTemplates[0].theaterPlans, template.theaterPlans);
});

test('campaign schedule resolution uses first campaign claim, with templates below campaign work', () => {
  const game = createGame('campaign-resolution-priority-test');
  const memberId = game.members[0].id;
  const plan = (type) => ({ id: `priority-${type}`, type, day: 'Mon', memberIds: [memberId], year: 1, targetWeek: 1, status: 'announced' });
  const resolveWith = (existingActivity, plannedType) => resolveWeek({
    ...game,
    schedule: { [`${memberId}:Mon`]: existingActivity },
    fanEventPlans: [plan(plannedType)],
  }).lastResult.schedule[`${memberId}:Mon`];

  assert.equal(resolveWith('media', 'videoCall'), 'vc1');
  assert.equal(resolveWith('mvProduction', 'videoCall'), 'mvProduction');
  assert.equal(resolveWith('mvProduction', 'meetGreet'), 'mvProduction');
  assert.equal(resolveWith('concert', 'meetGreet'), 'concert');
});

test('Seitansai only resolves when the selected birthday member is in that theater lineup', () => {
  const draft = createGame('seitansai-lineup-gate-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id), 'Birthday Office', [], { hardMode: true });
  const birthdayMemberId = game.members[0].id;
  game = { ...game, members: game.members.map((member) => member.id === birthdayMemberId ? { ...member, birthMonth: 1 } : member) };
  game.members.slice(1, 13).forEach((member) => { game = assignActivity(game, member.id, 'Sat', 'theater'); });
  game = configureTheaterShow(game, 'Sat', SETLISTS[0].id, game.members[1].id);
  game = { ...game, theaterShows: { ...game.theaterShows, Sat: { ...game.theaterShows.Sat, isSeitansai: true, seitansaiMemberId: birthdayMemberId } } };
  game = resolveWeek(game);
  assert.equal(game.theaterHistory.at(-1).isSeitansai, false);
  assert.equal(game.theaterHistory.at(-1).seitansaiMemberId, null);
  assert.equal(game.seitansaiObligations.find((item) => item.memberId === birthdayMemberId)?.status, 'open');
});

test('campaign rewards run result concert before the configured MV budget', () => {
  const draft = createGame('campaign-reward-pipeline-test');
  const base = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const campaign = { id: 'campaign-2-sousenkyo', type: 'sousenkyo', campaignYear: 2, status: 'locked', startWeek: 1, durationWeeks: 12, endWeek: 12, resultWeek: 13, concertBudgetId: 'major', concertVenueId: 'hall', concertDay: 'Sat', mvBudgetId: 'high', participants: { memberIds: base.members.map((member) => member.id), votes: Object.fromEntries(base.members.map((member) => [member.id, 1])) }, liveStandings: [], totalVotes: 12, votingRevenue: 0, result: null, rewardConcertId: null, rewardConcertStatus: null, mvProjectId: null, mvProductionWeeks: 0 };
  let game = { ...base, year: 2, week: 13, money: 2_000_000_000, campaign, nextCampaignConfig: null, dramaCooldown: 99, memberDramaCooldown: 99, managementDramaCooldown: 99 };
  game = resolveWeek(game);
  assert.equal(game.campaign.status, 'concert-scheduled');
  assert.ok(game.campaign.rewardConcertId);
  const rewardConcert = game.concerts.find((concert) => concert.id === game.campaign.rewardConcertId);
  assert.equal(rewardConcert.budgetId, 'major');
  assert.equal(rewardConcert.memberIds.length, 12);
  while (game.campaign.status !== 'mv-production' && game.week < 30) game = resolveWeek(game);
  assert.equal(game.campaign.status, 'mv-production');
  const rewardMv = game.singles.find((single) => single.campaignId === campaign.id);
  assert.equal(rewardMv.budgetId, 'high');
  assert.equal(rewardMv.durationWeeks, 4);
  assert.ok(rewardMv.productionCost > 0);
});

test('Request Hour reward concert uses selected Top count and closes with rank one', () => {
  const draft = createGame('request-hour-ranked-concert-test');
  const base = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const votes = Object.fromEntries(dreamSetlistSongs.map((song, index) => [song.id, dreamSetlistSongs.length - index]));
  const campaign = {
    id: 'campaign-2-request-hour-ranked', type: 'request-hour', campaignYear: 2, status: 'locked', startWeek: 1, durationWeeks: 12, endWeek: 12, resultWeek: 13,
    concertBudgetId: 'standard', concertVenueId: 'hall', concertDay: 'Sat', mvBudgetId: 'medium', requestHourTopCount: 30,
    participants: { memberIds: base.members.map((member) => member.id), songIds: dreamSetlistSongs.map((song) => song.id), votes },
    liveStandings: [], totalVotes: 0, votingRevenue: 0, result: null, rewardConcertId: null, rewardConcertStatus: null, mvProjectId: null, mvProductionWeeks: 0,
  };
  let game = { ...base, year: 2, week: 13, money: 2_000_000_000, campaign, nextCampaignConfig: null, dramaCooldown: 99, memberDramaCooldown: 99, managementDramaCooldown: 99 };
  game = resolveWeek(game);
  assert.equal(game.campaign.result.topCount, 30);
  assert.equal(game.campaign.result.standings.length, 30);
  const concertId = game.campaign.rewardConcertId;
  assert.equal(game.concerts.find((concert) => concert.id === concertId).rankedSongs.length, 30);
  for (let guard = 0; guard < 12 && game.concerts.find((concert) => concert.id === concertId)?.status !== 'completed'; guard += 1) game = resolveWeek(game);
  const summary = game.concerts.find((concert) => concert.id === concertId)?.summary;
  assert.equal(summary.songCount, 30);
  assert.equal(summary.ranked, true);
  assert.equal(summary.performanceOrder, 'descending-rank');
  assert.equal(summary.songs[0].rank, 30);
  assert.equal(summary.songs.at(-1).rank, 1);
  assert.equal(summary.songs.at(-1).songId, game.campaign.rewardSongId);
  assert.deepEqual(summary.songs.map((song) => song.performancePosition), Array.from({ length: 30 }, (_, index) => index + 1));
});

test('SSK and Janken reward concerts pin their MV songs to closing ranks', () => {
  for (const type of ['sousenkyo', 'janken']) {
    const draft = createGame(`ranked-${type}-concert-test`);
    const foundingIds = draft.members.slice(0, 12).map((member) => member.id);
    const base = finalizeGameSetup(draft, 'community', foundingIds);
    const roster = type === 'sousenkyo' ? [...base.members, ...draft.members.slice(12, 24)] : base.members;
    const participantIds = roster.map((member) => member.id);
    const campaign = {
      id: `campaign-2-${type}-ranked`, type, campaignYear: 2, status: 'locked', startWeek: 1, durationWeeks: 12, endWeek: 12, resultWeek: 13,
      concertBudgetId: 'standard', concertVenueId: 'hall', concertDay: 'Sat', mvBudgetId: 'medium',
      participants: { memberIds: participantIds, memberSnapshots: roster.map((member) => ({ memberId: member.id, name: member.name, nickname: member.nickname })), votes: Object.fromEntries(participantIds.map((memberId, index) => [memberId, index + 1])) },
      liveStandings: [], totalVotes: 0, votingRevenue: 0, result: null, rewardConcertId: null, rewardConcertStatus: null, mvProjectId: null, mvProductionWeeks: 0,
    };
    let game = { ...base, members: roster, year: 2, week: 13, money: 2_000_000_000, campaign, nextCampaignConfig: null, dramaCooldown: 99, memberDramaCooldown: 99, managementDramaCooldown: 99 };
    game = resolveWeek(game);
    const concertId = game.campaign.rewardConcertId;
    const scheduled = game.concerts.find((concert) => concert.id === concertId);
    if (type === 'sousenkyo') {
      assert.equal(scheduled.memberIds.length, 24);
      assert.equal(scheduled.underGirlsMemberIds.length, 12);
    } else {
      assert.ok(game.campaign.result.winnerMemberId);
      assert.equal(scheduled.winnerMemberId, game.campaign.result.winnerMemberId);
    }
    for (let guard = 0; guard < 12 && game.concerts.find((concert) => concert.id === concertId)?.status !== 'completed'; guard += 1) game = resolveWeek(game);
    const summary = game.concerts.find((concert) => concert.id === concertId)?.summary;
    assert.ok(summary.songCount >= 35 && summary.songCount <= 40);
    assert.equal(summary.songs.at(-1).rank, 1);
    assert.equal(summary.songs.at(-1).songId, game.campaign.rewardSongId);
    if (type === 'sousenkyo') {
      assert.equal(summary.songs.at(-2).rank, 2);
      assert.equal(summary.songs.at(-2).songId, game.campaign.result.underGirlsSongId);
      assert.equal(summary.songs.at(-2).performerNames.length, 12);
    }
  }
});

test('active major campaign blocks regular MV production in both directions', () => {
  const draft = createGame('major-campaign-mv-lock-test');
  const base = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const ready = { ...base, year: 2, week: 1, money: 2_000_000_000 };
  const campaign = startMajorCampaign(ready, { durationWeeks: 8 });
  const lineupIds = campaign.members.slice(0, 12).map((member) => member.id);

  assert.equal(startSingleProduction(campaign, lineupIds[0], 'Mon', lineupIds), campaign);

  const completedCampaign = { ...campaign.campaign, status: 'completed', completedYear: 2, completedWeek: 20 };
  const campaignComplete = { ...campaign, campaign: completedCampaign };
  const single = startSingleProduction(campaignComplete, lineupIds[0], 'Mon', lineupIds);
  assert.equal(single.singles.length, campaignComplete.singles.length + 1);
});

test('SSK creates separate Senbatsu and Undergirls MV projects', () => {
  const draft = createGame('ssk-separate-mv-test');
  const base = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const members = [...base.members, ...draft.members.slice(12, 24)];
  const senbatsu = members.slice(0, 12).map((member) => member.id);
  const undergirls = members.slice(12, 24).map((member) => member.id);
  const campaign = {
    id: 'campaign-2-sousenkyo-mv-test', type: 'sousenkyo', campaignYear: 2, status: 'mv-pending', startWeek: 1, durationWeeks: 12,
    resultWeek: 1, concertBudgetId: 'standard', concertVenueId: 'hall', mvBudgetId: 'medium', mvProductionDurationWeeks: 4,
    rewardSongId: dreamSetlistSongs[0].id, underGirlsSongId: dreamSetlistSongs[1].id, rewardConcertId: 'already-complete', rewardConcertStatus: 'completed',
    mvProjectId: null, underGirlsMvProjectId: null, mvProductionWeeks: 0, totalVotes: 0, votingRevenue: 0, liveStandings: [],
    participants: { memberIds: members.map((member) => member.id), votes: Object.fromEntries(members.map((member) => [member.id, 1])) },
    result: { winnerMemberId: senbatsu[0], centerMemberId: senbatsu[0], senbatsu, undergirls, underGirlsCenterMemberId: undergirls[0], rewardSongId: dreamSetlistSongs[0].id, underGirlsSongId: dreamSetlistSongs[1].id },
    lifecycle: [],
  };
  const next = resolveWeek({ ...base, members, year: 2, week: 1, money: 2_000_000_000, campaign, concerts: [], nextCampaignConfig: null, managementDramaCooldown: 99, memberDramaCooldown: 99, dramaCooldown: 99 });
  const campaignMvs = next.singles.filter((single) => single.campaignId === campaign.id);
  assert.equal(campaignMvs.length, 2);
  assert.deepEqual(new Set(campaignMvs.map((single) => single.memberIds.length)), new Set([12]));
  assert.equal(campaignMvs.every((single) => single.participants.length === 12), true);
  assert.equal(campaignMvs.every((single) => single.participants.filter((participant) => participant.role === 'center').length === 1), true);
  assert.notEqual(campaignMvs[0].songId, campaignMvs[1].songId);
  assert.ok(campaignMvs.some((single) => single.memberIds.every((memberId) => senbatsu.includes(memberId))));
  assert.ok(campaignMvs.some((single) => single.memberIds.every((memberId) => undergirls.includes(memberId))));
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
  // A member can only have one Video Call per week, so second call with same members is blocked.
  const secondVideoCall = scheduleFanCampaign(videoCall, 'videoCall', 'Sat', selectedIds);
  assert.equal(Object.values(secondVideoCall.schedule).filter((activity) => activity === 'vc1').length, 3);
  const repeatedVideoCall = scheduleFanCampaign(secondVideoCall, 'videoCall', 'Sat', selectedIds);
  assert.equal(Object.values(repeatedVideoCall.schedule).filter((activity) => activity === 'vc1').length, 3);
  assert.match(repeatedVideoCall.notifications[0].text, /Campaign blocked/);

  const meetGreet = scheduleFanCampaign(game, 'meetGreet', 'Sun');
  assert.equal(Object.values(meetGreet.schedule).filter((activity) => activity === 'mg1').length, 12);
  const repeatedMeetGreet = scheduleFanCampaign(meetGreet, 'meetGreet', 'Sat');
  assert.equal(Object.values(repeatedMeetGreet.schedule).filter((activity) => activity === 'mg1').length, 12);
  assert.match(repeatedMeetGreet.notifications[0].text, /Campaign blocked/);
  const campaignLocked = { ...game, schedule: { [`${game.members[5].id}:Thu`]: 'mvProduction' } };
  const campaignBlocked = scheduleFanCampaign(campaignLocked, 'meetGreet', 'Thu');
  assert.equal(Object.values(campaignBlocked.schedule).filter((activity) => activity === 'mg1').length, 0);
  assert.equal(campaignBlocked.schedule[`${game.members[5].id}:Thu`], 'mvProduction');
});

test('Video Call cannot book the same member on different days in one week', () => {
  const draft = createGame('video-call-same-week-different-day-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = game.members[0].id;
  const friday = scheduleFanCampaign(game, 'videoCall', 'Fri', [memberId]);
  const saturday = scheduleFanCampaign(friday, 'videoCall', 'Sat', [memberId]);

  assert.equal(friday.schedule[`${memberId}:Fri`], 'vc1');
  // Second call should be blocked because member already has a Video Call this week.
  assert.equal(saturday.schedule[`${memberId}:Sat`], undefined);
  const repeatedSaturday = scheduleFanCampaign(saturday, 'videoCall', 'Sat', [memberId]);
  assert.match(repeatedSaturday.notifications[0].text, /Campaign blocked/);
});

test('campaign conflicts are scoped to the requested day and members', () => {
  const draft = createGame('campaign-slot-conflict-scope-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 16).map((member) => member.id));
  const mvIds = game.members.slice(0, 12).map((member) => member.id);
  const withMv = startSingleProduction(game, mvIds[0], 'Mon', mvIds.slice(1));
  const outsideMemberId = game.members[12].id;

  const unrelatedDay = scheduleFanCampaign(withMv, 'videoCall', 'Tue', [outsideMemberId]);
  assert.equal(unrelatedDay.schedule[`${outsideMemberId}:Tue`], 'vc1');

  const occupiedMemberDay = scheduleFanCampaign(withMv, 'videoCall', 'Mon', [mvIds[0]]);
  assert.equal(occupiedMemberDay.schedule[`${mvIds[0]}:Mon`], 'mvProduction');
  assert.match(occupiedMemberDay.notifications[0].text, /Campaign blocked/);
});

test('future fan campaigns occupy member schedules when their weeks begin', () => {
  const draft = createGame('future-fan-campaign-schedule-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const selectedIds = game.members.slice(0, 3).map((member) => member.id);
  // Schedule Video Call for Friday of week 2.
  const plannedVideoCall = scheduleFanCampaign(game, 'videoCall', 'Fri', selectedIds, 2);
  // Second day for same members in same week is blocked (each member only once per week).
  const plannedVideoCallSecondDay = scheduleFanCampaign(plannedVideoCall, 'videoCall', 'Sat', selectedIds, 2);
  const plannedMeetGreet = scheduleFanCampaign(plannedVideoCallSecondDay, 'meetGreet', 'Sun', [], 3);

  const weekTwo = resolveWeek(plannedMeetGreet);
  // Only Friday assignments should exist.
  assert.deepEqual(selectedIds.map((memberId) => weekTwo.schedule[`${memberId}:Fri`]), ['vc1', 'vc1', 'vc1']);
  // Saturday should have no Video Calls for these members.
  assert.deepEqual(selectedIds.map((memberId) => weekTwo.schedule[`${memberId}:Sat`]), [undefined, undefined, undefined]);
  assert.equal(weekTwo.fanEventPlans.some((plan) => plan.targetWeek === 2), true);

  const weekThree = resolveWeek(weekTwo);
  assert.equal(Object.values(weekThree.schedule).filter((activity) => activity === 'mg1').length, 12);
  assert.equal(weekThree.fanEventPlans.some((plan) => plan.targetWeek === 3), true);

  const weekFour = resolveWeek(weekThree);
  assert.equal(weekFour.fanEventPlans.some((plan) => plan.targetWeek === 3), false);
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
  assert.equal(next.lastResult.finances.liveStream, 2 * 80 * BALANCE.activities.liveStream.revenuePerPopularity);
  assert.equal(next.lastResult.fanGain, 240);
  const stamina = updated.stamina;
  assert.equal(updated.energy, 100);
  assert.equal(next.lastResult.moneyDelta, next.lastResult.finances.totalIncome - next.lastResult.finances.totalExpenses);
});

test('single production requires 12 members and completes after four weeks', () => {
  const draft = createGame('single-production-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const centerId = game.members[0].id;
  const occupied = assignActivity(game, centerId, 'Wed', 'media');
  const blockedOccupied = startSingleProduction(occupied, centerId, 'Wed');
  assert.equal(blockedOccupied.singles.length, 0);
  assert.match(blockedOccupied.notifications[0].text, /Campaign blocked/);
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

test('MV eligibility exposes all valid choices when fourteen members can participate', () => {
  const draft = createGame('fourteen-member-mv-choice-test');
  const finalized = finalizeGameSetupEngine(
    draft,
    'community',
    draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id),
  );
  const game = { ...finalized, members: finalized.members.slice(0, 14) };
  const eligible = getSingleEligibleMembers(game, game.year, game.week);
  const selectedIds = eligible.slice(0, 12).map((member) => member.id);
  const started = startSingleProduction(game, selectedIds[0], 'Fri', selectedIds);

  assert.equal(eligible.length, 14);
  assert.deepEqual(new Set(started.singles[0].memberIds), new Set(selectedIds));
});

test('MV projects persist detailed participant snapshots and center role', () => {
  const game = createGame('mv-participant-snapshot-test');
  const selected = game.members.slice(0, 12);
  const started = startSingleProduction(game, selected[0].id, 'Fri', selected.map((member) => member.id));
  const participants = getSingleParticipants(started, started.singles[0]);

  assert.equal(participants.length, 12);
  assert.equal(participants[0].memberId, selected[0].id);
  assert.equal(participants[0].role, 'center');
  assert.equal(participants[0].name, selected[0].name);
  assert.equal(participants[0].generation, selected[0].generation);
  assert.equal(participants[0].vocal, selected[0].vocal);
  assert.equal(participants.slice(1).every((participant) => participant.role === 'member'), true);
});

test('announced graduates are blocked from new campaigns immediately while existing cutoff dates remain readable', () => {
  const game = createGame('graduation-campaign-cutoff-test');
  const graduate = game.members[0];
  const withGraduation = {
    ...game,
    graduations: [{ id: 'graduation-cutoff', memberId: graduate.id, memberName: graduate.name, announced: true, completed: false, departureYear: 1, departureWeek: 8 }],
    members: game.members.map((member) => member.id === graduate.id ? { ...member, graduationPending: true } : member),
  };

  assert.equal(memberAvailableOnCampaignDate(withGraduation, graduate, 1, 8), false);
  assert.equal(memberAvailableOnCampaignDate(withGraduation, graduate, 1, 9), false);
  const onCutoff = scheduleFanCampaign(withGraduation, 'videoCall', 'Fri', [graduate.id], 8);
  assert.equal(onCutoff, withGraduation);
  const afterCutoff = scheduleFanCampaign(withGraduation, 'videoCall', 'Fri', [graduate.id], 9);
  assert.equal(afterCutoff, withGraduation);

  const concert = announceConcert(withGraduation, 'Sat', 1, 3, 'After Last Show');
  assert.equal(concert.concerts[0].memberIds.includes(graduate.id), false);
  const legacyFuture = { ...withGraduation, concerts: [{ ...concert.concerts[0], memberIds: [graduate.id, ...concert.concerts[0].memberIds] }] };
  assert.equal(getConfirmedScheduleForWeek(legacyFuture, 1, 12)[`${graduate.id}:Sat`], undefined);
});

test('MV releases and major campaign entrants enforce announced graduation cutoff', () => {
  const game = createGame('graduation-mv-major-campaign-test');
  const graduate = game.members[0];
  const withGraduation = {
    ...game,
    year: 2,
    graduations: [{ id: 'graduation-before-release', memberId: graduate.id, memberName: graduate.name, announced: true, completed: false, departureYear: 2, departureWeek: 7 }],
    members: game.members.map((member) => member.id === graduate.id ? { ...member, graduationPending: true } : member),
  };
  const selectedWithGraduate = withGraduation.members.slice(0, 12).map((member) => member.id);
  assert.equal(startSingleProduction(withGraduation, graduate.id, 'Fri', selectedWithGraduate, 2, 2), withGraduation);
  const eligibleIds = withGraduation.members.slice(1, 13).map((member) => member.id);
  const started = startSingleProduction(withGraduation, eligibleIds[0], 'Fri', eligibleIds, 2, 2);
  assert.equal(started.singles[0].memberIds.includes(graduate.id), false);

  const campaign = startMajorCampaign(withGraduation, { durationWeeks: 8 });
  assert.equal(campaign.campaign.participants.memberIds.includes(graduate.id), false);
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

test('schedule snapshots expose confirmed future campaign and event assignments', () => {
  const draft = createGame('future-schedule-snapshot-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberIds = game.members.map((member) => member.id);
  const staged = {
    ...game,
    fanEventPlans: [{ id: 'future-vc', type: 'videoCall', day: 'Fri', memberIds: memberIds.slice(0, 3), year: 1, targetWeek: 2, status: 'announced' }],
    singles: [{ id: 'future-mv', status: 'planned', memberIds, productionDay: 'Wed', productionStartYear: 1, productionStartWeek: 2, durationWeeks: 4, year: 1, week: 1 }],
    concerts: [{ id: 'future-concert', status: 'selling', eventType: 'anniversary', memberIds, day: 'Sat', rehearsalDays: ['Tue', 'Thu'], targetYear: 1, targetWeek: 3 }],
    yearEndMeetGreets: [{ id: 'future-mg', status: 'announced', year: 1, targetWeek: 4, day: 'Sun', memberSessions: memberIds.map((memberId) => ({ memberId, sold: 0, capacity: 300 })) }],
  };

  const weekTwo = getScheduleSnapshotForWeek(staged, 1, 2);
  assert.equal(weekTwo.kind, 'confirmed');
  assert.equal(weekTwo.schedule[`${memberIds[0]}:Fri`], 'vc1');
  assert.equal(weekTwo.schedule[`${memberIds[0]}:Wed`], 'mvProduction');

  const weekThree = getConfirmedScheduleForWeek(staged, 1, 3);
  assert.equal(weekThree[`${memberIds[0]}:Tue`], 'concertRehearsal');
  assert.equal(weekThree[`${memberIds[0]}:Thu`], 'concertRehearsal');
  assert.equal(weekThree[`${memberIds[0]}:Sat`], 'concert');
  assert.equal(weekThree[`${memberIds[0]}:Wed`], 'mvProduction');

  const weekFour = getScheduleSnapshotForWeek(staged, 1, 4);
  assert.equal(weekFour.schedule[`${memberIds[0]}:Sun`], 'yearEndMeetGreet');
  assert.equal(weekFour.schedule[`${memberIds[0]}:Wed`], 'mvProduction');
});

test('resolved schedule snapshots remain authoritative over confirmed reservations', () => {
  const draft = createGame('resolved-schedule-snapshot-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = game.members[0].id;
  const staged = {
    ...game,
    concerts: [{ id: 'reported-concert', status: 'completed', memberIds: game.members.map((member) => member.id), day: 'Sat', targetYear: 1, targetWeek: 3 }],
    weeklyReports: [{ year: 1, week: 3, schedule: { [`${memberId}:Mon`]: 'media' } }],
  };
  const snapshot = getScheduleSnapshotForWeek(staged, 1, 3);
  assert.equal(snapshot.kind, 'resolved');
  assert.deepEqual(snapshot.schedule, { [`${memberId}:Mon`]: 'media' });
});

test('live stream uses the direct FRL40k income rate', () => {
  const draft = createGame('live-stream-income-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const member = game.members[0];
  game = { ...game, members: game.members.map((item) => item.id === member.id ? { ...item, popularity: 50 } : item) };
  const next = resolveWeek(assignActivity(game, member.id, 'Mon', 'liveStream'));
  assert.equal(BALANCE.activities.liveStream.revenuePerPopularity, 40_000);
  assert.equal(next.lastResult.finances.liveStream, 50 * 40_000);
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
  const expectedCost = getConcertCostBreakdown(game, 'lean', 'hall').upfrontCost;
  game = announceConcert(game, 'Sat', 1, 2);
  assert.equal(game.concerts[0].status, 'selling');
  assert.equal(game.money, startingMoney - expectedCost);
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
  assert.deepEqual(CONCERT_VENUES.map((venue) => venue.cost), [90_000_000, 180_000_000, 405_000_000]);
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
  assert.ok(announced.concerts[0].venueCost < announced.concerts[0].grossVenueCost);
});

test('concert costs use doubled venue pricing, tiered production ratios, and yearly escalation', () => {
  const game = finalizeGameSetup(createGame('concert-cost-rules-test'), 'community', createGame('concert-cost-rules-test').members.slice(0, 12).map((member) => member.id));
  const yearOne = getConcertCostBreakdown(game, 'lean', 'hall', 1);
  assert.equal(yearOne.grossVenueCost, 180_000_000);
  assert.equal(yearOne.grossProductionCost, 117_000_000);
  assert.equal(yearOne.upfrontCost, 297_000_000);
  const yearTwo = getConcertCostBreakdown(game, 'standard', 'arena', 2);
  assert.equal(yearTwo.grossVenueCost, 396_000_000);
  assert.equal(yearTwo.grossProductionCost, 297_000_000);
  assert.equal(yearTwo.upfrontCost, 693_000_000);
  const yearThree = getConcertCostBreakdown(game, 'major', 'stadium', 3);
  assert.equal(yearThree.yearRate, 0.15);
  assert.equal(yearThree.grossVenueCost, 931_500_000);
  assert.equal(yearThree.grossProductionCost, 791_775_000);
  assert.equal(yearThree.upfrontCost, 1_723_275_000);
});

test('regular concerts allow one per quarter and reserve Q4 for the anniversary concert', () => {
  const draft = createGame('concert-quarter-limit-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  game = announceConcert(game, 'Sat', 1, 2);
  assert.equal(game.concerts.length, 1);
  const sameQuarter = announceConcert(game, 'Sat', 1, 3);
  assert.equal(sameQuarter.concerts.length, 1);
  assert.match(sameQuarter.notifications[0].text, /Concert already occupies this quarter/);
  const q4 = announceConcert(game, 'Sat', 1, 10);
  assert.equal(q4.concerts.length, 1);
  assert.match(q4.notifications[0].text, /Q4 is reserved for the Anniversary Concert/);
  const reopened = announceConcert({ ...game, concerts: game.concerts.map((concert) => ({ ...concert, status: 'cancelled' })) }, 'Sat', 1, 3);
  assert.equal(reopened.concerts.length, 2);
  const reasons = getCampaignConflictReasons(game, { year: 1, week: 12, type: 'concert' });
  assert.ok(reasons.includes('Concert already occupies this quarter.'));
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

test('year-end Meet & Greet and anniversary concert can both be booked in their separate Q4 windows', () => {
  const draft = createGame('annual-events-booking-test');
  let game = finalizeGameSetup({ ...draft, week: 37 }, 'community', draft.members.slice(0, 16).map((member) => member.id));
  game = scheduleYearEndMeetGreet(game, 39, 'Sat', 37, {}, 'Autumn Fan Day');
  assert.equal(game.yearEndMeetGreets.length, 1);
  game = announceAnniversaryConcert(game, 45, 'Sat', 'December Anniversary', 'standard', game.concertVenueOffers[0].id, ['Tue', 'Thu']);
  assert.equal(game.concerts.filter((concert) => concert.eventType === 'anniversary').length, 1);
});

test('annual booking rejects malformed target dates without mutating state', () => {
  const draft = createGame('annual-events-invalid-date-test');
  const game = finalizeGameSetup({ ...draft, week: 37 }, 'community', draft.members.slice(0, 16).map((member) => member.id));
  assert.equal(scheduleYearEndMeetGreet(game, '39', 'Sat', 37), game);
  assert.equal(announceAnniversaryConcert(game, Number.NaN, 'Sat', 'Invalid', 'standard', game.concertVenueOffers[0].id), game);
  assert.equal(announceAnniversaryConcert(game, 45, 'Sat', 'Invalid', 'standard', game.concertVenueOffers[0].id, null), game);
});

test('anniversary booking normalizes select week values before confirmation', () => {
  const draft = createGame('anniversary-select-value-test');
  const game = finalizeGameSetup({ ...draft, week: 43 }, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const booked = announceAnniversaryConcert(game, '45', 'Sat', 'December Anniversary', 'standard', game.concertVenueOffers[0].id, ['Tue', 'Thu']);
  assert.equal(booked.concerts[0].eventType, 'anniversary');
  assert.equal(booked.concerts[0].targetWeek, 45);
});

test('successful anniversary booking clears stale concert block warnings', () => {
  const draft = createGame('anniversary-stale-warning-test');
  const game = finalizeGameSetup({ ...draft, week: 43, notifications: [{ type: 'critical', code: 'campaign-blocked', campaignType: 'concert', text: 'Campaign blocked: stale conflict.' }] }, 'community', draft.members.slice(0, 16).map((member) => member.id));
  const announced = announceAnniversaryConcert(game, 45, 'Sat', 'Anniversary Night', 'standard', game.concertVenueOffers[0].id, ['Tue', 'Thu']);
  assert.equal(announced.concerts[0].eventType, 'anniversary');
  assert.equal(announced.notifications.some((item) => item.code === 'campaign-blocked' && item.campaignType === 'concert'), false);
});

test('anniversary concert falls back from a stale saved venue selection', () => {
  const draft = createGame('anniversary-stale-venue-test');
  const game = finalizeGameSetup({ ...draft, week: 43 }, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const currentOffers = game.concertVenueOffers.map((venue, index) => ({ ...venue, id: `refreshed-${index + 1}` }));
  const refreshed = { ...game, concertVenueOffers: currentOffers };
  const announced = announceAnniversaryConcert(refreshed, 45, 'Sat', 'Anniversary Night', 'standard', game.concertVenueOffers[0].id, ['Tue', 'Thu']);
  assert.equal(announced.concerts[0].venueId, currentOffers[0].id);
});

test('anniversary concert booking is unavailable before Month 7 Week 1', () => {
  const draft = createGame('anniversary-early-booking-test');
  const game = finalizeGameSetup({ ...draft, week: 24 }, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const venueId = game.concertVenueOffers[0].id;
  const blocked = announceAnniversaryConcert(game, 45, 'Sat', 'Too Early Anniversary', 'standard', venueId, ['Tue', 'Thu']);
  assert.equal(blocked, game);
});

test('anniversary conflict checks the full selected month', () => {
  const draft = createGame('anniversary-target-week-conflict-test');
  let game = finalizeGameSetup({ ...draft, week: 43 }, 'community', draft.members.slice(0, 12).map((member) => member.id));
  game = scheduleFanCampaign(game, 'meetGreet', 'Mon', [], 48);
  const venueId = game.concertVenueOffers[0].id;
  const blocked = announceAnniversaryConcert(game, 45, 'Sat', 'Early Anniversary', 'standard', venueId, ['Tue', 'Thu']);
  assert.equal(blocked.concerts.length, 0);
  assert.match(blocked.notifications[0].text, /Meet & Greet already occupies this month/);
});

test('year-end Meet & Greet and Anniversary Concert require a clear target month', () => {
  const draft = createGame('annual-event-month-conflict-test');
  const game = finalizeGameSetup({ ...draft, week: 37 }, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberIds = game.members.map((member) => member.id);

  const octoberVideoCall = scheduleFanCampaign(game, 'videoCall', 'Thu', memberIds, 38);
  const blockedMeetGreet = scheduleYearEndMeetGreet(octoberVideoCall, 39, 'Sat', 37);
  assert.equal(blockedMeetGreet.yearEndMeetGreets.length, 0);
  assert.match(blockedMeetGreet.notifications[0].text, /Video Call already occupies this month/);

  const decemberVideoCall = scheduleFanCampaign(game, 'videoCall', 'Thu', memberIds, 46);
  const venueId = game.concertVenueOffers[0].id;
  const blockedAnniversary = announceAnniversaryConcert(decemberVideoCall, 45, 'Sat', 'Anniversary Night', 'standard', venueId, ['Tue', 'Thu']);
  assert.equal(blockedAnniversary.concerts.length, 0);
  assert.match(blockedAnniversary.notifications[0].text, /Video Call already occupies this month/);
});

test('booked annual events prevent later campaigns anywhere in their month', () => {
  const draft = createGame('annual-event-reverse-month-conflict-test');
  const game = finalizeGameSetup({ ...draft, week: 37 }, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberIds = game.members.map((member) => member.id);
  const annualMeetGreet = scheduleYearEndMeetGreet(game, 39, 'Sat', 37);
  const blockedVideoCall = scheduleFanCampaign(annualMeetGreet, 'videoCall', 'Thu', memberIds, 38);

  assert.equal(blockedVideoCall.fanEventPlans.length, 0);
  assert.match(blockedVideoCall.notifications[0].text, /Year-end Meet & Greet already occupies this month/);
});

test('concert announcement persists selected budget and venue size', () => {
  const draft = createGame('concert-budget-venue-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const announced = announceConcert(game, 'Sat', 1, 2, 'Big Night', 'standard', 'arena');
  assert.equal(announced.concerts[0].budgetId, 'standard');
  assert.equal(announced.concerts[0].venueId, 'arena');
  assert.equal(announced.concerts[0].capacity, 4_500);
  const expectedCost = getConcertCostBreakdown(game, 'standard', 'arena').upfrontCost;
  assert.equal(announced.concerts[0].upfrontCost, expectedCost);
  assert.equal(announced.money, game.money - expectedCost);
});

test('concert booking normalizes selected budget and venue objects and missing titles', () => {
  const draft = createGame('concert-object-selection-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const budget = CONCERT_BUDGETS.find((option) => option.id === 'standard');
  const venue = game.concertVenueOffers[0];
  const announced = announceConcert(game, 'Sat', 1, 2, undefined, budget, venue);
  assert.equal(announced.concerts[0].budgetId, budget.id);
  assert.equal(announced.concerts[0].venueId, venue.id);
  assert.equal(announced.concerts[0].title, 'Concert 1');
});

test('Q4 audition obeys first intake cap and cannot repeat in year', () => {
  const draft = createGame('audition-test');
  const game = { ...finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id)), week: 37 };
  const poolIds = new Set(game.unsignedMembers.map((member) => member.id));
  const audition = runAudition(game);
  assert.equal(audition.members.length, game.members.length + 6);
  assert.equal(audition.unsignedMembers.length, game.unsignedMembers.length - 6);
  assert.equal(audition.auditions[0].finalistPoolSize, 12);
  assert.ok(audition.members.filter((member) => member.status === 'trainee').every((member) => poolIds.has(member.id)));
  assert.equal(audition.auditions.length, 1);
  assert.equal(runAudition(audition), audition);
});

test('Q4 audition requires available funds', () => {
  const draft = createGame('poor-audition-test');
  const game = { ...finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id)), week: 37, money: 64_999_999 };
  assert.equal(runAudition(game), game);
});

test('audition campaign progresses for five weeks and finalizes selected trainees', () => {
  let game = finalizeGameSetup({ ...createGame('audition-campaign-test'), week: 37 }, 'community', createGame('audition-campaign-test').members.slice(0, 12).map((member) => member.id));
  game = startAuditionCampaign(game, 37);
  assert.equal(game.auditionCampaign.phase, 'applications');
  assert.equal(game.auditionCampaign.progressWeeks, 0);
  assert.equal(game.auditionCampaign.candidatePool.length, 12);
  assert.equal(game.auditionCampaign.maxIntake, 6);
  const originalPoolIds = new Set(game.unsignedMembers.map((member) => member.id));
  assert.ok(game.auditionCampaign.candidatePool.every((candidate) => originalPoolIds.has(candidate.sourcePoolId)));
  const selected = game.auditionCampaign.candidatePool.slice(0, 2).map((candidate) => candidate.id);
  for (let index = 0; index < 4; index += 1) game = resolveWeek(game);
  assert.equal(game.auditionCampaign.progressWeeks, 4);
  game = finalizeAudition(game, selected);
  assert.deepEqual(game.auditionCampaign.selectedCandidateIds, selected);
  assert.equal(game.auditionCampaign.selectionConfirmed, true);
  game = resolveWeek(game);
  assert.equal(game.auditionCampaign, null);
  assert.equal(game.auditions[0].size, 2);
  assert.equal(game.members.filter((member) => member.status === 'trainee').length, 2);
  assert.ok(selected.every((memberId) => !game.unsignedMembers.some((member) => member.id === memberId)));
});

test('audition and major campaign can start in either order', () => {
  const draft = createGame('parallel-audition-major-campaign');
  const base = { ...finalizeGameSetup(draft, 'community', draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id)), year: 2, week: 37, money: 9_000_000_000 };

  const auditionFirst = startAuditionCampaign(base, 37);
  const majorAfterAudition = startMajorCampaign(auditionFirst, { type: 'sousenkyo', durationWeeks: 8 });
  assert.equal(majorAfterAudition.auditionCampaign?.status, 'active');
  assert.equal(majorAfterAudition.campaign?.type, 'sousenkyo');

  const majorFirst = startMajorCampaign(base, { type: 'sousenkyo', durationWeeks: 8 });
  const auditionAfterMajor = startAuditionCampaign(majorFirst, 37);
  assert.equal(auditionAfterMajor.campaign?.type, 'sousenkyo');
  assert.equal(auditionAfterMajor.auditionCampaign?.status, 'active');
});

test('audition waits for explicit confirmation and accepts an empty recruit selection', () => {
  const draft = { ...createGame('audition-explicit-confirmation'), week: 37 };
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const originalRosterSize = game.members.length;
  game = startAuditionCampaign(game, 37);
  for (let index = 0; index < 5; index += 1) game = resolveWeek(game);
  assert.equal(game.auditionCampaign.status, 'active');
  assert.equal(game.auditionCampaign.phase, 'selection');
  assert.equal(game.members.length, originalRosterSize);
  game = finalizeAudition(game, []);
  game = resolveWeek(game);
  assert.equal(game.auditionCampaign, null);
  assert.equal(game.auditions[0].size, 0);
  assert.equal(game.members.length, originalRosterSize);
});

test('management perks scale through five levels and old unlocks migrate to level one', () => {
  const perk = BONUS_BY_ID.B001;
  assert.equal(getBonusValueAtLevel(perk, 1), -0.15);
  assert.equal(getBonusValueAtLevel(perk, 5), -0.3);
  assert.equal(getBonusUpgradeCost(perk, 1), perk.unlockCost);
  assert.equal(getBonusUpgradeCost(perk, 5), perk.unlockCost * 3);
  const migrated = normalizeMetaProfile({ currency: 9, unlockedBonusIds: ['B001'] });
  assert.equal(migrated.bonusLevels.B001, 1);
});

test('founding setup snapshots equipped perk levels into the run', () => {
  const draft = createGame('perk-level-snapshot');
  const memberIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
  const levelOne = finalizeGameSetupEngine(draft, 'community', memberIds, 'Level One', ['B001'], { bonusLevels: { B001: 1 } });
  const levelFive = finalizeGameSetupEngine(draft, 'community', memberIds, 'Level Five', ['B001'], { bonusLevels: { B001: 5 } });
  assert.equal(levelFive.bonusLevels.B001, 5);
  assert.ok(levelFive.theater.price < levelOne.theater.price);
});

test('B005 discounts the actual MV charge and allows a production at the discounted balance', () => {
  const draft = createGame('b005-mv-cost');
  const memberIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
  const createRun = (level) => finalizeGameSetupEngine(draft, 'community', memberIds, 'Production Test', level ? ['B005'] : [], { bonusLevels: { B005: level } });
  const base = createRun(0);
  const discounted = createRun(1);
  const lineupIds = base.members.slice(1, 12).map((member) => member.id);
  const baseStarted = startSingleProduction(base, base.members[0].id, 'Mon', lineupIds);
  const discountedStarted = startSingleProduction(discounted, discounted.members[0].id, 'Mon', lineupIds);
  const expectedCost = Math.round(baseStarted.singles[0].productionCost * (1 + getBonusValueAtLevel(BONUS_BY_ID.B005, 1)));

  assert.equal(discountedStarted.singles[0].productionCost, expectedCost);
  assert.equal(discountedStarted.money, discounted.money - expectedCost);

  const exactBalance = { ...discounted, money: expectedCost };
  assert.equal(startSingleProduction(exactBalance, exactBalance.members[0].id, 'Mon', lineupIds).money, 0);
  assert.equal(startSingleProduction({ ...base, money: expectedCost }, base.members[0].id, 'Mon', lineupIds).singles.length, 0);
});

test('B023 protects ordinary Fan Trust losses from firing, cash pressure, low-budget MVs, Seitansai, and annual targets', () => {
  const createRun = (seed, withPerk = false, options = {}) => {
    const draft = createGame(seed);
    const memberIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
    return finalizeGameSetupEngine(draft, 'community', memberIds, 'Trust Test', withPerk ? ['B023'] : [], { ...options, bonusLevels: { B023: 1 } });
  };
  const compareTrust = (makeState) => {
    const base = makeState(false);
    const protectedState = makeState(true);
    assert.ok(protectedState.group.fanTrust > base.group.fanTrust);
  };

  compareTrust((withPerk) => {
    const game = createRun('b023-fire', withPerk);
    return fireMember(game, game.members[0].id);
  });

  compareTrust((withPerk) => resolveWeek({ ...createRun('b023-cash', withPerk), theater: { ...createRun('b023-cash', withPerk).theater, weeklyUpkeep: 70_000_000 } }));

  compareTrust((withPerk) => {
    const game = createRun('b023-single', withPerk);
    return resolveWeek({ ...game, singles: [{ id: 'low-budget-release', title: 'Lean MV', centerId: game.members[0].id, memberIds: game.members.slice(0, 12).map((member) => member.id), productionDay: 'Mon', budgetId: 'low', status: 'production', progressWeeks: 0, durationWeeks: 1, fanTrustGain: -1, popularityGain: 2 }] });
  });

  compareTrust((withPerk) => {
    const game = createRun('b023-seitansai', withPerk, { hardMode: true });
    return resolveWeek({ ...game, week: 2, seitansaiObligations: [{ id: 'missed-birthday', memberId: game.members[0].id, year: 1, month: 1, dueAbsolute: 0, status: 'open' }] });
  });

  compareTrust((withPerk) => {
    const game = createRun('b023-annual', withPerk);
    return resolveWeek({ ...game, week: BALANCE.weeksPerYear, fanTarget: { ...createAnnualFanTarget(1), targetFanbase: 1_000_000 } });
  });
});

test('B023 does not reduce drama damage reserved for B024', () => {
  const previousChance = BALANCE.dramaChance;
  BALANCE.dramaChance = 1;
  try {
    const resolveDrama = (withPerk) => {
      const draft = { ...createGame('b023-drama-isolation', 'active', false, { runSalt: 'b023-drama-isolation' }), year: 2, dramaCooldown: 0 };
      const memberIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
      const game = finalizeGameSetupEngine(draft, 'community', memberIds, 'Drama Test', withPerk ? ['B023'] : [], { bonusLevels: { B023: 1 } });
      return resolveWeek(game);
    };
    assert.equal(resolveDrama(true).group.fanTrust, resolveDrama(false).group.fanTrust);
  } finally {
    BALANCE.dramaChance = previousChance;
  }
});

test('B026 boosts fan acquisition from Live Stream, Video Call, and MV work', () => {
  const runActivity = (activity, withPerk) => {
    const draft = createGame(`b026-${activity}`, 'active', false, { runSalt: `b026-${activity}` });
    const memberIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
    let game = finalizeGameSetupEngine(draft, 'community', memberIds, 'Digital Test', withPerk ? ['B026'] : [], { bonusLevels: { B026: 1 } });
    if (activity === 'mvProduction') game = startSingleProduction(game, game.members[0].id, 'Mon', game.members.slice(1, 12).map((member) => member.id));
    else game = assignActivity(game, game.members[0].id, 'Mon', activity);
    return resolveWeek(game).lastResult.fanGain;
  };
  for (const activity of ['liveStream', 'vc1', 'mvProduction']) {
    assert.ok(runActivity(activity, true) > runActivity(activity, false), `${activity} should gain more fans with B026`);
  }
});

test('B029 raises the seeded MV quality floor and release views', () => {
  const draft = createGame('b029-0');
  const memberIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
  const produce = (withPerk) => {
    let game = finalizeGameSetupEngine(draft, 'community', memberIds, 'Creative Test', withPerk ? ['B029'] : [], { bonusLevels: { B029: 1 } });
    game = startSingleProduction(game, game.members[0].id, 'Mon', game.members.slice(1, 12).map((member) => member.id));
    const created = game.singles[0];
    for (let index = 0; index < created.durationWeeks; index += 1) game = resolveWeek(game);
    return { created, released: game.singles[0] };
  };
  const base = produce(false);
  const boosted = produce(true);
  assert.equal(base.created.qualityFloorBonus, 0);
  assert.equal(boosted.created.qualityFloorBonus, 5);
  assert.ok(boosted.created.qualityRoll > base.created.qualityRoll);
  assert.ok(boosted.created.productionQuality > base.created.productionQuality);
  assert.ok(boosted.released.views > base.released.views);
});

test('B030 reduces theater unfamiliarity penalty for emergency lineups', () => {
  const perform = (withPerk) => {
    const draft = createGame('b030-theater', 'active', false, { runSalt: 'b030-theater' });
    const memberIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
    let game = finalizeGameSetupEngine(draft, 'community', memberIds, 'Understudy Test', withPerk ? ['B030'] : [], { bonusLevels: { B030: 1 } });
    game = { ...game, members: game.members.map((member) => ({ ...member, setlistFamiliarity: { [SETLISTS[0].id]: 0 } })) };
    for (const member of game.members.slice(0, 12)) game = assignActivity(game, member.id, 'Mon', 'theater');
    game = configureTheaterShow(game, 'Mon', SETLISTS[0].id, game.members[0].id);
    return resolveWeek(game).lastResult.fanGain;
  };
  assert.ok(perform(true) > perform(false));
});

test('audition campaign rejects duplicate or non-Q4 starts', () => {
  const base = { ...createGame('audition-campaign-limits'), week: 36 };
  const game = finalizeGameSetup(base, 'community', base.members.slice(0, 12).map((member) => member.id));
  assert.equal(startAuditionCampaign(game, 36), game);
  const started = startAuditionCampaign({ ...game, week: 37 }, 37);
  assert.equal(startAuditionCampaign(started, 38), started);
  assert.equal(startAuditionCampaign({ ...game, week: 37, unsignedMembers: game.unsignedMembers.slice(0, 11) }, 37).auditionCampaign, null);
  let ready = started;
  for (let index = 0; index < 4; index += 1) ready = resolveWeek(ready);
  assert.equal(finalizeAudition(ready, ready.auditionCampaign.candidatePool.map((candidate) => candidate.id)).auditionCampaign.selectedCandidateIds.length, ready.auditionCampaign.maxIntake);
});

test('trainee progression records trainee time and training progress', () => {
  const draft = createGame('trainee-progression-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const trainee = { ...game.members[0], id: 'trainee-progression', status: 'trainee', team: 'TRAINEE', traineeWeeks: 0, trainingProgress: 0, theaterAppearances: 0 };
  const withTrainee = { ...game, members: [trainee, ...game.members.slice(1)] };
  const next = resolveWeek(queueTrainingSession(withTrainee, trainee.id, 'vocal'));
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
  const withoutMentor = resolveWeek(queueTrainingSession(game, menteeId, 'vocal'));
  const withMentor = resolveWeek(queueTrainingSession(mentored, menteeId, 'vocal'));
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
  const pending = resolveWeek(game);
  assert.equal(pending.year, 1);
  assert.equal(pending.week, BALANCE.weeksPerYear);
  const next = completeYearEndSettlement(settleAnnualTax(pending), 'keep');
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
  const pending = resolveWeek(game);
  const next = completeYearEndSettlement(settleAnnualTax(pending), 'keep');
  assert.equal(next.year, 6);
  assert.equal(next.runStatus, 'active');
});

test('drama refunds future fan-event tickets only after management chooses suspension', () => {
  const previousChance = BALANCE.dramaChance;
  BALANCE.dramaChance = 1;
  try {
    const base = { ...createGame('drama-refund-test'), year: 2, week: 37, dramaCooldown: 0 };
    let game = finalizeGameSetup(base, 'community', base.members.slice(0, 12).map((member) => member.id));
    game = scheduleYearEndMeetGreet(game, 44, 'Sat', 37, Object.fromEntries(game.members.map((member) => [member.id, 3])));
    const pending = resolveWeek(game);
    const dramaMember = pending.members.find((member) => member.id === pending.activeDrama.memberId);
    const pendingSession = pending.yearEndMeetGreets[0].memberSessions.find((session) => session.memberId === dramaMember.id);
    assert.equal(dramaMember.status, 'active');
    assert.equal(pendingSession.refunded ?? 0, 0);
    assert.ok(pendingSession.sold > 0);

    const next = punishMember(pending, dramaMember.id, 12);
    const refundedSessions = next.yearEndMeetGreets[0].memberSessions.filter((session) => (session.refunded ?? 0) > 0);
    assert.equal(refundedSessions.length, 1);
    assert.equal(refundedSessions[0].sold, 0);
    assert.equal(next.money, pending.money - (pendingSession.sold * pending.yearEndMeetGreets[0].ticketPrice));
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
  assert.deepEqual(accepted.financialEvents.at(-1), { id: 'test-offer-accepted-1-1', type: 'opportunity', category: 'media', title: 'Test Broadcast', year: 1, week: 1, income: 7_000_000, expense: 2_000_000, net: 5_000_000 });
  assert.equal(accepted.money, game.money + 5_000_000);
  assert.equal(accepted.group.fanbase, game.group.fanbase + 270);
  assert.equal(accepted.opportunityHistory.at(-1).skillChanges.length, 6);
  assert.deepEqual([...new Set(accepted.opportunityHistory.at(-1).skillChanges.map((change) => change.skill))].sort(), ['mc', 'variety']);
  const declined = respondToOpportunity({ ...game, pendingOpportunity: offer }, false);
  assert.equal(declined.opportunityHistory.at(-1).accepted, false);
  assert.equal(declined.money, game.money);
});

test('graduation preparation charges once and applies final-event and successor benefits', () => {
  const draft = createGame('graduation-preparation-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const graduate = game.members[0];
  const successor = game.members[1];
  const injuryIncident = { id: `injury-${graduate.identityId}-1-1`, memberId: graduate.id, identityId: graduate.identityId, severity: 'minor', label: 'Minor', startYear: 1, startWeek: 1, originalWeeks: 1, workload: 8, assignments: [], status: 'recovered', recoveredYear: 1, recoveredWeek: 2 };
  const graduation = { id: 'graduation-test', memberId: graduate.id, memberName: graduate.nickname || graduate.name, departureYear: 2, departureWeek: 1, announced: true, completed: false };
  const staged = { ...game, year: 2, week: 1, members: game.members.map((member) => member.id === graduate.id ? { ...member, injuryHistory: [injuryIncident] } : member), graduations: [graduation] };
  const prepared = prepareGraduation(staged, graduation.id, { finalShow: true, specialSegment: true, merchandise: true, successorId: successor.id });
  assert.equal(prepared.money, staged.money - 28_000_000);
  assert.equal(prepared.graduations[0].preparation.successorId, successor.id);
  assert.ok(prepared.members.some((member) => member.id === graduate.id), 'saving graduation plan must not dismiss member early');
  assert.equal(prepareGraduation(prepared, graduation.id, { finalShow: true }), prepared);
  const resolved = resolveWeek(prepared);
  const completed = resolved.graduations[0];
  const promotedSuccessor = resolved.members.find((member) => member.id === successor.id);
  assert.equal(completed.completed, true);
  assert.equal(resolved.members.some((member) => member.id === graduate.id), false);
  assert.equal(completed.memberSnapshot.id, graduate.id);
  assert.equal(completed.memberSnapshot.status, 'graduated');
  assert.equal(completed.memberSnapshot.injury, null);
  assert.deepEqual(completed.memberSnapshot.injuryHistory, []);
  assert.equal(completed.outcome.fanGain, 1_650);
  assert.equal(completed.outcome.merchandiseRevenue, 18_000_000);
  assert.equal(promotedSuccessor.performance, successor.performance + 2);
  assert.equal(promotedSuccessor.popularity, successor.popularity + 1);
});

test('graduate stays on roster until Last Show week finishes', () => {
  const draft = createGame('graduation-dismissal-timing-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const graduate = game.members[0];
  const rosterSupport = { ...game.unsignedMembers[0], status: 'active' };
  const graduation = { id: 'graduation-timing', memberId: graduate.id, memberName: graduate.nickname || graduate.name, departureYear: 2, departureWeek: 2, announced: true, completed: false };
  const staged = prepareGraduation({ ...game, year: 2, week: 1, members: [...game.members, rosterSupport], unsignedMembers: game.unsignedMembers.slice(1), graduations: [graduation], dramaCooldown: 999 }, graduation.id, { finalShow: true });

  const lastShowWeek = resolveWeek(staged);
  assert.equal(lastShowWeek.year, 2);
  assert.equal(lastShowWeek.week, 2);
  assert.ok(lastShowWeek.members.some((member) => member.id === graduate.id));
  assert.equal(lastShowWeek.graduations[0].completed, false);

  const afterLastShowWeek = resolveWeek(lastShowWeek);
  assert.equal(afterLastShowWeek.week, 3);
  assert.equal(afterLastShowWeek.members.some((member) => member.id === graduate.id), false);
  assert.equal(afterLastShowWeek.graduations[0].completed, true);
  assert.equal(afterLastShowWeek.graduations[0].memberSnapshot.id, graduate.id);
});

test('Last Show only accepts prepared graduate on departure-week theater lineup', () => {
  const draft = createGame('graduation-last-show-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const graduate = game.members[0];
  const graduation = { id: 'graduation-last-show', memberId: graduate.id, memberName: graduate.nickname || graduate.name, departureYear: 2, departureWeek: 1, announced: true, completed: false };
  game = prepareGraduation({ ...game, year: 2, week: 1, graduations: [graduation] }, graduation.id, { finalShow: true });
  game.members.forEach((member) => { game = assignActivity(game, member.id, 'Sat', 'theater'); });
  game = configureTheaterShow(game, 'Sat', SETLISTS[0].id, graduate.id);
  game = { ...game, theaterShows: { ...game.theaterShows, Sat: { ...game.theaterShows.Sat, isLastShow: true, lastShowMemberId: graduate.id } } };
  game = configureTheaterShow(game, 'Sat', SETLISTS[1].id, graduate.id);

  assert.deepEqual(getGraduationLastShowCandidates(game, 'Sat').map((member) => member.id), [graduate.id]);
  assert.equal(game.theaterShows.Sat.isLastShow, true, 'setlist changes preserve Last Show selection');
  const resolved = resolveWeek(game);
  assert.equal(resolved.lastResult.theaterShows[0].isLastShow, true);
  assert.equal(resolved.lastResult.theaterShows[0].lastShowMemberId, graduate.id);
  assert.ok(resolved.lastResult.theaterShows[0].memberIds.includes(graduate.id));
  assert.equal(resolved.members.some((member) => member.id === graduate.id), false);
  assert.ok(resolved.lastResult.finances.twoShot > 0);
});

test('member drama resolves from the dedicated fictional scenario catalog', () => {
  const representedCategories = new Set(MEMBER_DRAMA_TEMPLATES.map((item) => item.category));
  assert.deepEqual(MEMBER_DRAMA_CATEGORIES.filter((category) => !representedCategories.has(category)), []);
  assert.ok(MEMBER_DRAMA_TEMPLATES.some((item) => item.id === 'unpolite-remark-member' && item.directedTarget === 'member' && item.detail.includes('{target}')));
  assert.ok(MEMBER_DRAMA_TEMPLATES.some((item) => item.id === 'unpolite-remark-fans' && item.directedTarget === 'fans'));
  assert.ok(MEMBER_DRAMA_TEMPLATES.some((item) => item.id === 'unpolite-remark-staff' && item.directedTarget === 'staff'));
  assert.ok(MEMBER_DRAMA_TEMPLATES.some((item) => item.id === 'discriminatory-remark-member' && item.directedTarget === 'member' && item.detail.includes('{target}')));
  const previousChance = BALANCE.dramaChance;
  BALANCE.dramaChance = 1;
  try {
    const draft = { ...createGame('member-drama-data-test'), year: 2, week: 37, dramaCooldown: 0 };
    const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
    const next = resolveWeek(game);
    assert.ok(MEMBER_DRAMA_TEMPLATES.some((template) => template.id === next.activeDrama.dramaId));
    assert.ok(next.activeDrama.title);
    assert.ok(next.activeDrama.detail.includes(next.activeDrama.name));
    assert.equal(next.history[0].title, next.activeDrama.title);
    const dramaMember = next.members.find((member) => member.id === next.activeDrama.memberId);
    assert.equal(dramaMember.status, 'active');
    assert.equal(dramaMember.suspensionWeeks, 0);
    assert.equal(next.activeDrama.response, 'pending');
    assert.equal(next.records.dramaSuspensions, 0);

    let targetedDrama = null;
    for (let seedIndex = 0; seedIndex < 100 && !targetedDrama; seedIndex += 1) {
      const targetedDraft = { ...createGame(`member-drama-target-${seedIndex}`), year: 2, week: 37, dramaCooldown: 0 };
      const targetedGame = finalizeGameSetupEngine(targetedDraft, 'community', targetedDraft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id), 'Target Test');
      const targetedNext = resolveWeek(targetedGame);
      if (targetedNext.activeDrama?.directedTarget === 'member') targetedDrama = targetedNext.activeDrama;
    }
    assert.ok(targetedDrama?.targetMemberId);
    assert.ok(targetedDrama.detail.includes(targetedDrama.targetName));
  } finally {
    BALANCE.dramaChance = previousChance;
  }
});

test('Let it be resolves member drama without punishment or commitment changes', () => {
  const draft = createGame('drama-no-punishment-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const member = game.members[0];
  const schedule = { [`${member.id}:Mon`]: 'media' };
  const event = { id: 'no-punishment-event', year: game.year, targetWeek: game.week, day: 'Sat', ticketPrice: 50_000, revenue: 500_000, memberSessions: [{ memberId: member.id, sold: 10, capacity: 300 }] };
  const staged = {
    ...game,
    schedule,
    yearEndMeetGreets: [event],
    activeDrama: { dramaSource: 'member', memberId: member.id, name: member.name, dramaId: 'careless-social-post', severity: 'Moderate', originalStatus: 'active', response: 'pending', startedWeek: game.week },
  };
  const resolved = resolveMemberDramaWithoutPunishment(staged, member.id);
  const resolvedMember = resolved.members.find((item) => item.id === member.id);
  assert.equal(resolvedMember.status, 'active');
  assert.equal(resolvedMember.suspensionWeeks, 0);
  assert.equal(resolved.activeDrama, null);
  assert.deepEqual(resolved.schedule, schedule);
  assert.deepEqual(resolved.yearEndMeetGreets, [event]);
  assert.equal(resolved.money, staged.money);
  assert.equal(resolved.notifications.some((notification) => notification.text.includes('refunded')), false);
  assert.ok(resolved.memberDramaCooldown >= BALANCE.dramaCooldown[0] && resolved.memberDramaCooldown <= BALANCE.dramaCooldown[1]);
  assert.equal(resolved.records.dramaSuspensions, 0);
  assert.match(resolved.history[0].title, /receives no punishment/);
});

test('drama popup punishment duration controls suspension and affected commitments', () => {
  const draft = createGame('drama-duration-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const member = game.members[0];
  const event = { id: 'drama-event', year: game.year, targetWeek: game.week, day: 'Sat', ticketPrice: 50_000, revenue: 500_000, memberSessions: [{ memberId: member.id, sold: 10, capacity: 300 }] };
  const staged = {
    ...game,
    schedule: { [`${member.id}:Mon`]: 'media' },
    trainingPlans: { [member.id]: ['vocal'] },
    yearEndMeetGreets: [event],
    activeDrama: { dramaSource: 'member', memberId: member.id, name: member.name, dramaId: 'livestream-slip', severity: 'Major', originalStatus: 'active', response: 'pending', startedWeek: game.week },
  };
  const punished = punishMember(staged, member.id, 8);
  const punishedMember = punished.members.find((item) => item.id === member.id);
  assert.equal(punishedMember.status, 'suspended');
  assert.equal(punishedMember.suspensionWeeks, 8);
  assert.equal(punished.activeDrama.dramaId, staged.activeDrama.dramaId);
  assert.equal(punished.activeDrama.punishmentWeeks, 8);
  assert.equal(punished.records.dramaSuspensions, 1);
  assert.equal(punished.schedule[`${member.id}:Mon`], undefined);
  assert.equal(punished.trainingPlans[member.id], undefined);
  assert.equal(punished.yearEndMeetGreets[0].memberSessions[0].sold, 0);
  assert.equal(punished.money, staged.money - 500_000);
});

test('punishment and release do not refund events without an affected-member assignment', () => {
  const draft = createGame('unassigned-refund-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const [affectedMember, assignedMember] = game.members;
  const event = { id: 'unassigned-event', year: game.year, targetWeek: game.week, day: 'Sat', ticketPrice: 50_000, revenue: 500_000, memberSessions: [{ memberId: assignedMember.id, sold: 10, capacity: 300 }] };
  const staged = {
    ...game,
    yearEndMeetGreets: [event],
    activeDrama: { dramaSource: 'member', memberId: affectedMember.id, name: affectedMember.name, dramaId: 'unassigned-drama', severity: 'Moderate', originalStatus: 'active', response: 'pending', startedWeek: game.week },
  };

  const punished = punishMember(staged, affectedMember.id, 4);
  assert.deepEqual(punished.yearEndMeetGreets, [event]);
  assert.equal(punished.money, staged.money);
  assert.equal(punished.notifications.some((notification) => notification.text.includes('refunded')), false);

  const rosterSupport = { ...game.unsignedMembers[0], status: 'active' };
  const releaseState = { ...staged, members: [...game.members, rosterSupport] };
  const released = fireMember(releaseState, affectedMember.id);
  assert.deepEqual(released.yearEndMeetGreets, [event]);
  assert.equal(released.money, releaseState.money - BALANCE.fire.flatSeverance);
  assert.equal(released.notifications.some((notification) => notification.text.includes('refunded')), false);
});

test('graduation planning protects Year 1 and budgets exactly four or six eligible departures per later year', () => {
  const draft = createGame('annual-graduation-budget-test');
  const foundingIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
  const base = finalizeGameSetupEngine(draft, 'community', foundingIds);
  const protectedYear = resolveWeek({ ...base, year: 1, week: 1 });
  assert.equal(protectedYear.graduationTargets[1], undefined);

  const support = base.unsignedMembers.slice(0, 2).map((member) => ({ ...member, status: 'active', team: member.team || 'J', joinedYear: 0, joinedWeek: 1 }));
  let game = { ...base, year: 3, week: 1, money: 9_000_000_000_000, group: { ...base.group, fanbase: 100_000 }, members: [...base.members, ...support], unsignedMembers: base.unsignedMembers.slice(2) };
  for (let index = 0; index < BALANCE.weeksPerYear; index += 1) game = resolveWeek(game);
  const target = game.graduationTargets[3];
  const planned = game.graduations.filter((graduation) => graduation.planYear === 3);
  assert.ok([4, 6].includes(target.targetCount));
  assert.equal(planned.length, target.targetCount);
  assert.equal(target.scheduledCount, target.targetCount);
  assert.ok(planned.every((graduation) => graduation.annualTarget === target.targetCount));
});

test('graduation target rolls are deterministic binary choices with persisted cadence metadata', () => {
  const first = rollGraduationTarget('graduation-target-seed', 4);
  const second = rollGraduationTarget('graduation-target-seed', 4);
  assert.deepEqual(first, second);
  assert.ok([4, 6].includes(first.targetCount));
  assert.equal(first.schemaVersion, 2);
  assert.equal(first.rolledAt.year, 4);
  assert.equal(first.rolledAt.week, 1);
  assert.equal(first.windows.length, first.targetCount);
  assert.equal(first.cadence, first.targetCount === 4 ? 'quarterly' : 'bimonthly');
  first.windows.forEach((window) => assert.ok(window.preferredMonth >= window.startMonth && window.preferredMonth <= window.endMonth));

  const legacy = migrateGraduationState({ seed: 'legacy-target-seed', year: 4, week: 27, graduations: [], graduationTargets: { 3: { year: 3, targetCount: 5 }, 4: { year: 4, targetCount: 12 } } });
  assert.equal(legacy.graduationTargets[3].cadence, 'legacy');
  assert.equal(legacy.graduationTargets[4].cadence, 'legacy');
  assert.equal(legacy.graduationTargets[3].targetCount, 5);
  assert.equal(legacy.graduationTargets[4].targetCount, 12);
  assert.deepEqual(migrateGraduationState(legacy), legacy);

  const missing = migrateGraduationState({ seed: 'missing-target-seed', year: 2, week: 20, graduations: [], graduationTargets: {} });
  assert.ok([4, 6].includes(missing.graduationTargets[2].targetCount));
  assert.deepEqual(migrateGraduationState(missing), missing);

  const stale = migrateGraduationState({ seed: 'stale-target-seed', year: 2, week: 20, graduations: [{ id: 'announced', announcementYear: 2, announcementWeek: 5, completed: false }], graduationTargets: { 2: { year: 2, targetCount: 4, scheduledCount: 99 } } });
  assert.equal(stale.graduationTargets[2].scheduledCount, 1);

  const normalized = normalizeGameState({ ...createGame('normalization-target-seed'), year: 2, week: 20, graduationTargets: {} });
  assert.ok([4, 6].includes(normalized.graduationTargets[2].targetCount));
});

test('year-end settlement creates the next annual graduation target before Week 1 opens', () => {
  const draft = createGame('settlement-graduation-target');
  const base = finalizeGameSetupEngine(draft, 'community', draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id));
  const settled = completeYearEndSettlement({
    ...base,
    year: 1,
    week: BALANCE.weeksPerYear,
    pendingYearEndSettlement: { id: 'settlement-1', closingYear: 1, nextYear: 2, stage: 'theater', tax: { taxDue: 0 }, taxPaid: 0, taxDebtAdded: 0 },
    yearEndSettlements: [],
  }, 'keep');
  assert.equal(settled.year, 2);
  assert.equal(settled.week, 1);
  assert.ok([4, 6].includes(settled.graduationTargets[2].targetCount));
  assert.equal(settled.graduationTargets[2].rolledAt.week, 1);
  assert.deepEqual(completeYearEndSettlement(settled, 'keep'), settled);
});

function graduationCadenceFixture(seed, targetCount) {
  const draft = createGame(seed);
  const base = finalizeGameSetupEngine(draft, 'community', draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id));
  const support = base.unsignedMembers.slice(0, 12).map((member) => ({ ...member, status: 'active', joinedYear: 0, joinedWeek: 1 }));
  return {
    ...base,
    year: 3,
    week: 1,
    money: 9_000_000_000_000,
    group: { ...base.group, fanbase: 100_000 },
    members: [...base.members, ...support],
    unsignedMembers: base.unsignedMembers.slice(12),
    memberDramaCooldown: 999,
    managementDramaCooldown: 999,
    graduationTargets: { 3: { year: 3, targetCount } },
  };
}

test('four-target graduation announcements occupy at most one quarter window', () => {
  let game = graduationCadenceFixture('quarterly-graduation-cadence', 4);
  for (let index = 0; index < BALANCE.weeksPerYear; index += 1) game = resolveWeek(game);
  const announcements = game.graduations.filter((graduation) => graduation.planYear === 3 && graduation.announcementYear === 3);
  assert.equal(announcements.length, 4);
  const windows = announcements.map((graduation) => Math.floor((Math.ceil(graduation.announcementWeek / BALANCE.weeksPerMonth) - 1) / 3));
  assert.equal(new Set(windows).size, 4);
});

test('six-target graduation announcements occupy at most one two-month window', () => {
  let game = graduationCadenceFixture('bimonthly-graduation-cadence', 6);
  for (let index = 0; index < BALANCE.weeksPerYear; index += 1) game = resolveWeek(game);
  const announcements = game.graduations.filter((graduation) => graduation.planYear === 3 && graduation.announcementYear === 3);
  assert.equal(announcements.length, 6);
  const windows = announcements.map((graduation) => Math.floor((Math.ceil(graduation.announcementWeek / BALANCE.weeksPerMonth) - 1) / 2));
  assert.equal(new Set(windows).size, 6);
});

test('active SSK, Request Hour, and Janken entrants can roll graduation one week after their campaign commitment', () => {
  for (const type of ['sousenkyo', 'request-hour', 'janken']) {
    const draft = createGame(`campaign-graduation-protection-${type}`);
    const foundingIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
    const base = finalizeGameSetupEngine(draft, 'community', foundingIds);
    const veteranMembers = base.members.map((member) => ({ ...member, joinedYear: 0, joinedWeek: 1 }));
    const staged = startMajorCampaign({
      ...base,
      year: 3,
      week: 1,
      money: 9_000_000_000_000,
      members: veteranMembers,
      graduationTargets: { 3: { year: 3, targetCount: 12, scheduledCount: 0 } },
    }, { type, durationWeeks: 8 });
    const result = resolveWeek(staged);
    const graduation = result.graduations.find((item) => item.planYear === 3);
    assert.ok(graduation, `${type} entrants remain eligible for the graduation roll`);
    assert.equal(graduation.commitmentType, 'major-campaign');
    assert.equal(graduation.commitmentEndYear, 3);
    assert.equal(graduation.commitmentEndWeek, 16);
    assert.equal(graduation.departureYear, 3);
    assert.equal(graduation.departureWeek, 17, `${type} departure is one week after the projected campaign finish`);
  }
});

test('legacy active Request Hour saves without member IDs delay rather than block graduation rolls', () => {
  const draft = createGame('legacy-request-hour-graduation-protection');
  const foundingIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
  const base = finalizeGameSetupEngine(draft, 'community', foundingIds);
  const staged = startMajorCampaign({
    ...base,
    year: 3,
    week: 1,
    money: 9_000_000_000_000,
    members: base.members.map((member) => ({ ...member, joinedYear: 0, joinedWeek: 1 })),
    graduationTargets: { 3: { year: 3, targetCount: 12, scheduledCount: 0 } },
  }, { type: 'request-hour', durationWeeks: 8 });
  const { memberIds, memberSnapshots, ...legacyParticipants } = staged.campaign.participants;
  const result = resolveWeek({ ...staged, campaign: { ...staged.campaign, participants: legacyParticipants } });
  const graduation = result.graduations.find((item) => item.planYear === 3);
  assert.ok(graduation);
  assert.equal(graduation.commitmentType, 'major-campaign');
  assert.equal(graduation.departureWeek, 17);
});

test('future MV, concert, and fan-event bookings do not delay a graduation roll', () => {
  const draft = createGame('graduation-latest-commitment-test');
  const foundingIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
  const base = finalizeGameSetupEngine(draft, 'community', foundingIds);
  const veteranMembers = base.members.map((member) => ({ ...member, joinedYear: 0, joinedWeek: 1 }));
  const memberIds = veteranMembers.map((member) => member.id);
  const result = resolveWeek({
    ...base,
    year: 3,
    week: 1,
    money: 9_000_000_000_000,
    members: veteranMembers,
    graduationTargets: { 3: { year: 3, targetCount: 12, scheduledCount: 0 } },
    singles: [{ id: 'future-mv', status: 'planned', memberIds, releaseYear: 3, releaseWeek: 18, durationWeeks: 4 }],
    concerts: [{ id: 'future-concert', status: 'selling', memberIds, targetYear: 3, targetWeek: 20 }],
    fanEventPlans: [{ id: 'future-vc', type: 'videoCall', status: 'announced', memberIds, year: 3, targetWeek: 22, day: 'Sat' }],
  });
  const graduation = result.graduations.find((item) => item.planYear === 3);
  assert.ok(graduation);
  assert.equal(graduation.commitmentType, undefined);
  assert.equal(graduation.commitmentEndWeek, undefined);
  assert.notEqual(graduation.departureWeek, 26);
});

test('an announced graduation is pushed only for the same active campaign, using a one-week buffer', () => {
  const draft = createGame('graduation-reconciliation-test');
  const foundingIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
  const base = finalizeGameSetupEngine(draft, 'community', foundingIds);
  const graduate = base.members[0];
  const result = resolveWeek({
    ...base,
    year: 3,
    week: 10,
    members: base.members.map((member) => member.id === graduate.id ? { ...member, graduationPending: true } : member),
    graduations: [{ id: 'delayed-graduation', memberId: graduate.id, memberName: graduate.nickname || graduate.name, planYear: 3, announcementYear: 3, announcementWeek: 1, departureYear: 3, departureWeek: 10, announced: true, completed: false }],
    campaign: {
      id: 'late-campaign', type: 'janken', status: 'mv-production', mvProductionWeeks: 3, mvProductionDurationWeeks: 4,
      participants: { memberIds: [graduate.id] }, result: { winnerMemberId: graduate.id },
    },
  });
  assert.equal(result.graduations[0].departureYear, 3);
  assert.equal(result.graduations[0].departureWeek, 11);
  assert.equal(result.graduations[0].commitmentDelayWeeks, 1);
  assert.equal(result.graduations[0].commitmentType, 'major-campaign');
  assert.ok(result.notifications.some((item) => /graduation moves to Year 3 · Mar · Week 3/.test(item.text)));
  assert.ok(result.history.some((item) => /final departure is now Year 3 · Mar · Week 3/.test(item.detail)));
});

test('graduation departures are separated so only one member graduates per calendar month', () => {
  const draft = createGame('graduation-month-spacing-test');
  const foundingIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
  const base = finalizeGameSetupEngine(draft, 'community', foundingIds);
  const first = base.members[0];
  const second = base.members[1];
  const result = resolveWeek({
    ...base,
    year: 3,
    week: 10,
    members: base.members.map((member) => [first.id, second.id].includes(member.id) ? { ...member, graduationPending: true } : member),
    graduations: [
      { id: 'first-month-graduation', memberId: first.id, memberName: first.name, planYear: 3, announcementYear: 3, announcementWeek: 1, departureYear: 3, departureWeek: 13, announced: true, completed: false },
      { id: 'second-month-graduation', memberId: second.id, memberName: second.name, planYear: 3, announcementYear: 3, announcementWeek: 1, departureYear: 3, departureWeek: 14, announced: true, completed: false },
    ],
  });
  const firstGraduation = result.graduations.find((item) => item.id === 'first-month-graduation');
  const secondGraduation = result.graduations.find((item) => item.id === 'second-month-graduation');
  assert.equal(firstGraduation.departureWeek, 13);
  assert.equal(secondGraduation.departureWeek, 18);
  assert.notEqual(Math.floor((firstGraduation.departureWeek - 1) / BALANCE.weeksPerMonth), Math.floor((secondGraduation.departureWeek - 1) / BALANCE.weeksPerMonth));
  assert.ok(result.notifications.some((item) => /graduation moves to Year 3 · May · Week 2 so only one member graduates in each month/.test(item.text)));
  assert.ok(result.history.some((item) => /only one member can graduate in each calendar month/.test(item.detail)));
});

test('graduation countdown starts four weeks before departure and crosses year boundaries', () => {
  const countdown = getGraduationCountdown({
    year: 3,
    week: 48,
    graduations: [
      { id: 'countdown-four', memberName: 'Four', announced: true, completed: false, departureYear: 4, departureWeek: 4 },
      { id: 'countdown-five', memberName: 'Five', announced: true, completed: false, departureYear: 4, departureWeek: 5 },
      { id: 'countdown-hidden', memberName: 'Hidden', announced: false, completed: false, departureYear: 4, departureWeek: 2 },
      { id: 'countdown-done', memberName: 'Done', announced: true, completed: true, departureYear: 4, departureWeek: 2 },
    ],
  });
  assert.deepEqual(countdown.map(({ id, weeksRemaining }) => ({ id, weeksRemaining })), [{ id: 'countdown-four', weeksRemaining: 4 }]);
});

test('graduated member returns to the audition pool after exactly two years with reset stats', () => {
  const draft = createGame('graduation-pool-return-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const graduate = game.members[0];
  const injuryIncident = { id: `injury-${graduate.identityId}-1-1`, memberId: graduate.id, identityId: graduate.identityId, severity: 'minor', label: 'Minor', startYear: 1, startWeek: 1, originalWeeks: 1, workload: 8, assignments: [], status: 'recovered', recoveredYear: 1, recoveredWeek: 2 };
  const rosterSupport = { ...game.unsignedMembers[0], status: 'active' };
  const graduation = { id: 'graduation-pool-return', memberId: graduate.id, memberName: graduate.nickname || graduate.name, departureYear: 2, departureWeek: 1, announced: true, completed: true };
  const staged = {
    ...game,
    year: 3,
    week: 47,
    members: [{ ...graduate, status: 'graduated', canPerformTheater: false, injuryHistory: [injuryIncident] }, ...game.members.slice(1), rosterSupport],
    unsignedMembers: game.unsignedMembers.slice(1),
    graduations: [graduation],
    dramaCooldown: 999,
  };
  const oneWeekEarly = resolveWeek(staged);
  assert.equal(oneWeekEarly.members.some((member) => member.id === graduate.id), false);
  assert.equal(oneWeekEarly.graduations[0].memberSnapshot.id, graduate.id);
  assert.equal(oneWeekEarly.graduations[0].memberSnapshot.injury, null);
  assert.deepEqual(oneWeekEarly.graduations[0].memberSnapshot.injuryHistory, []);
  assert.equal(oneWeekEarly.graduations[0].returnedToPool, undefined);
  const yearEnd = resolveWeek(oneWeekEarly);
  const returned = completeYearEndSettlement(settleAnnualTax(yearEnd), 'keep');
  const recycled = returned.unsignedMembers.find((member) => member.identityId === graduate.identityId);
  assert.equal(returned.year, 4);
  assert.equal(returned.week, 1);
  assert.ok(recycled);
  assert.equal(recycled.injury, null);
  assert.deepEqual(recycled.injuryHistory, []);
  assert.notEqual(recycled.id, graduate.id);
  assert.equal(returned.members.some((member) => member.id === graduate.id), false);
  assert.equal(returned.graduations[0].returnedToPool, true);
  assert.equal(returned.graduations[0].poolReturnYear, 4);
  assert.equal(returned.graduations[0].poolReturnWeek, 1);
  assert.deepEqual(recycled.appearances, { theater: 0, center: 0, media: 0, offAir: 0 });
  const skillKeys = ['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina'];
  assert.notDeepEqual(skillKeys.map((skill) => recycled[skill]), skillKeys.map((skill) => graduate[skill]));
});

test('legacy graduated roster members migrate into graduation snapshots once', () => {
  const draft = createGame('graduation-dismissal-migration-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const graduate = game.members[0];
  const graduation = { id: 'legacy-graduation', memberId: graduate.id, memberName: graduate.nickname || graduate.name, departureYear: 2, departureWeek: 1, announced: true, completed: true };
  const legacy = {
    ...game,
    members: [{ ...graduate, status: 'graduated' }, ...game.members.slice(1)],
    graduations: [graduation],
    schedule: { [`${graduate.id}:Mon`]: 'media', [`${game.members[1].id}:Mon`]: 'media' },
    trainingPlans: { [graduate.id]: ['trainVocalLight'], [game.members[1].id]: ['trainDanceLight'] },
  };
  const migrated = migrateGraduatedRosterState(legacy);
  assert.equal(migrated.members.some((member) => member.id === graduate.id), false);
  assert.equal(migrated.graduations[0].memberSnapshot.id, graduate.id);
  assert.equal(migrated.schedule[`${graduate.id}:Mon`], undefined);
  assert.equal(migrated.trainingPlans[graduate.id], undefined);
  assert.equal(migrated.schedule[`${game.members[1].id}:Mon`], 'media');
  assert.deepEqual(migrateGraduatedRosterState(migrated), migrated);
});

test('run summary includes development, generation, center, and sales records', () => {
  const draft = createGame('expanded-summary-test');
  const game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const summary = endRun(game).runSummary;
  ['membersDeveloped', 'newGenerations', 'breakoutStars', 'successfulCenters', 'highestSellingSingle', 'finalMoney', 'finalFanbase', 'finalPopularity', 'finalFanTrust', 'finalReputation', 'totalMembers', 'finalGraduatedMembers', 'dramaSuspensions'].forEach((key) => assert.ok(Object.hasOwn(summary, key)));
});

test('single selection raises selected oshi sentiment, lowers excluded active sentiment, and protects excluded trainees', () => {
  const draft = createGame('oshi-sentiment-test');
  const selectedIds = draft.members.slice(0, 12).map((member) => member.id);
  const base = finalizeGameSetup(draft, 'community', selectedIds);
  const excluded = { ...draft.members[12], status: 'active' };
  const excludedTrainee = { ...draft.members[13], status: 'trainee' };
  const single = { id: 'sentiment-single', title: 'Selection Test', centerId: selectedIds[0], memberIds: selectedIds, productionDay: 'Mon', status: 'ready', progressWeeks: 4, durationWeeks: 4, releaseYear: 1, releaseWeek: 1, productionStartYear: 1, productionStartWeek: 1, popularityGain: 3, fanTrustGain: 1 };
  const next = resolveWeek({ ...base, members: [...base.members, excluded, excludedTrainee], singles: [single] });
  assert.equal(next.members.find((member) => member.id === selectedIds[0]).oshiSentiment, 4);
  assert.equal(next.members.find((member) => member.id === selectedIds[1]).oshiSentiment, 2);
  assert.equal(next.members.find((member) => member.id === excluded.id).oshiSentiment, -1);
  assert.equal(next.members.find((member) => member.id === excludedTrainee.id).oshiSentiment, 0);
});

test('annual fan target curve adds the Year 2+ bonus and caps acceleration', () => {
  const expected = [220_000, 484_000, 1_064_800, 2_342_560, 5_153_632, 11_337_990];
  let previous = 100_000;
  expected.forEach((target, index) => {
    previous = calculateNextFanTarget(previous, index + 1);
    assert.equal(previous, target);
  });
  // Year 1 is deliberately exempt from the bonus; every later year carries it.
  assert.equal(calculateNextFanTarget(100_000, 1), 220_000);
  assert.equal(calculateNextFanTarget(100_000, 2), 220_000);
  assert.equal(calculateNextFanTarget(100_000, 9), 220_000);
  assert.equal(FAN_BALANCE.target.startingRunningGrowthPercent, 120);
});

test('missing the annual fan target applies review penalties without ending the run', () => {
  const draft = createGame('missed-fan-target-test');
  const base = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const target = { formulaVersion: 2, year: 1, baseTarget: 125_000, startingFanbase: base.group.fanbase, requiredGain: 999_875_000, targetFanbase: 1_000_000_000 };
  const pending = resolveWeek({ ...base, week: BALANCE.weeksPerYear, fanTarget: target });
  const next = completeYearEndSettlement(settleAnnualTax(pending), 'keep');
  assert.equal(next.runStatus, 'active');
  assert.equal(next.year, 2);
  assert.equal(next.fanTargetHistory.at(-1).id, 'majorFailure');
  // Major-failure trust loss combines with the normal month-end cash-pressure penalty from payroll.
  assert.equal(next.group.fanTrust, base.group.fanTrust - 9);
  assert.equal(next.group.reputation, base.group.reputation - 5);
  assert.equal(next.annualReviews[0].snapshot.fanGrowth.label, 'Major Failure');
});

test('overperforming creates the next target from the previous target, not actual fans', () => {
  const draft = createGame('achieved-fan-target-test');
  const base = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const target = createAnnualFanTarget(1, 100_000, 100_000);
  const pending = resolveWeek({ ...base, week: BALANCE.weeksPerYear, group: { ...base.group, fanbase: 500_000 }, fanTarget: target });
  const next = completeYearEndSettlement(settleAnnualTax(pending), 'keep');
  assert.equal(next.runStatus, 'active');
  assert.equal(next.year, 2);
  assert.equal(next.week, 1);
  assert.equal(next.fanTarget.year, 2);
  assert.equal(next.fanTarget.baseTarget, 100_000);
  assert.equal(next.fanTarget.targetFanbase, 220_000);
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

test('future Video Call eligibility uses injury state on target week', () => {
  const draft = createGame('future-vc-injury-eligibility-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = game.members[0].id;
  game = { ...game, members: game.members.map((member) => member.id === memberId ? { ...member, injury: { weeksRemaining: 2, blocks: ['videoCall'] } } : member) };
  const planned = scheduleFanCampaign(game, 'videoCall', 'Sat', [memberId], 2);
  assert.equal(planned.fanEventPlans.length, 0);
});

test('future Video Call keeps members selectable when injury clears before target week', () => {
  const draft = createGame('future-vc-recovery-eligibility-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = game.members[0].id;
  game = { ...game, members: game.members.map((member) => member.id === memberId ? { ...member, injury: { weeksRemaining: 1, blocks: ['videoCall'] } } : member) };
  const planned = scheduleFanCampaign(game, 'videoCall', 'Sat', [memberId], 2);
  assert.equal(planned.fanEventPlans.length, 1);
  assert.equal(planned.fanEventPlans[0].memberIds.includes(memberId), true);
});

test('future Video Call revalidates member injury before target-week resolve', () => {
  const draft = createGame('future-vc-injury-resolve-test');
  let game = finalizeGameSetup(draft, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = game.members[0].id;
  game = scheduleFanCampaign(game, 'videoCall', 'Sat', [memberId], 2);
  game = { ...game, members: game.members.map((member) => member.id === memberId ? { ...member, injury: { weeksRemaining: 2, blocks: ['videoCall'] } } : member) };
  game = resolveWeek(game);
  game = resolveWeek(game);
  assert.equal(game.activityEvents.some((event) => event.type === 'videoCall' && event.memberId === memberId), false);
});

test('year-end Meet & Greet revalidates injury before event resolve', () => {
  const draft = createGame('year-end-mg-injury-resolve-test');
  let game = finalizeGameSetup({ ...draft, week: 36 }, 'community', draft.members.slice(0, 12).map((member) => member.id));
  const memberId = game.members[0].id;
  game = scheduleYearEndMeetGreet(game, 38, 'Sat', 36);
  game = { ...game, members: game.members.map((member) => member.id === memberId ? { ...member, injury: { weeksRemaining: 3, blocks: ['meetGreet'] } } : member) };
  game = resolveWeek(game);
  game = resolveWeek(game);
  game = resolveWeek(game);
  assert.equal(game.lastResult.yearEndMeetGreetSummary.participatingMembers, 11);
  assert.equal(game.lastResult.yearEndMeetGreetSummary.capacity, 11 * BALANCE.activities.mg1.capacity);
});
