import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  finalizeGameSetup,
  getGraduationCountdown,
  getPendingGraduationSetups,
  prepareGraduation,
} from '../src/engine/gameEngine.js';
import { BALANCE } from '../src/data/balance.js';
import { normalizeGameState } from '../src/state/gameStateMigration.js';
import { decodeSnapshot, encodeSnapshot } from '../src/state/saveFormat.js';

function gameFixture(seed) {
  const draft = createGame(seed);
  const memberIds = draft.members.slice(0, BALANCE.foundingRosterSize).map((member) => member.id);
  const game = finalizeGameSetup(draft, 'community', memberIds);
  return {
    ...game,
    year: 3,
    week: 30,
    money: 100_000_000,
    graduations: [],
  };
}

function graduation(id, memberId, overrides = {}) {
  return {
    id,
    memberId,
    memberName: id,
    announced: true,
    completed: false,
    departureYear: 4,
    departureWeek: 10,
    ...overrides,
  };
}

async function saveAndReload(state) {
  const snapshot = {
    version: 1,
    savedAt: 123,
    activeRun: { slot: 1, updatedAt: 123, state },
    metaProfile: null,
  };
  const encoded = await encodeSnapshot(snapshot, { slot: 1, updatedAt: 123 });
  const decoded = await decodeSnapshot(encoded);
  return normalizeGameState(decoded.activeRun.state);
}

test('pending graduation setup survives a saved-state round trip without a notification or countdown', async () => {
  const game = gameFixture('graduation-setup-save-recovery');
  const member = game.members[0];
  const pending = graduation('pending-far-departure', member.id);
  const state = { ...game, graduations: [pending] };
  delete state.notifications;

  const restored = await saveAndReload(JSON.parse(JSON.stringify(state)));

  assert.equal(Object.hasOwn(restored, 'notifications'), false);
  assert.deepEqual(getGraduationCountdown(restored), []);
  assert.deepEqual(getPendingGraduationSetups(restored).map((item) => item.id), [pending.id]);
});

test('pending setup selection returns independent announced records and excludes ineligible graduations', () => {
  const game = gameFixture('graduation-setup-filtering');
  const [first, preparedMember, second, graduatedMember, unannouncedMember] = game.members;
  const state = {
    ...game,
    members: game.members.map((member) => member.id === graduatedMember.id
      ? { ...member, status: 'graduated' }
      : member),
    graduations: [
      graduation('pending-first', first.id),
      graduation('already-prepared', preparedMember.id, { preparation: { finalShow: true } }),
      graduation('pending-second', second.id),
      graduation('already-completed', first.id, { completed: true }),
      graduation('never-announced', unannouncedMember.id, { announced: false }),
      graduation('member-absent', 'member-no-longer-on-roster'),
      graduation('legacy-graduated-member', graduatedMember.id),
    ],
  };

  assert.deepEqual(getPendingGraduationSetups(state).map((item) => item.id), [
    'pending-first',
    'pending-second',
  ]);
});

test('repeated setup lookups are read-only; preparation hides the reminder and cannot charge again after reload', async () => {
  const game = gameFixture('graduation-setup-idempotency');
  const member = game.members[0];
  const pending = graduation('pending-to-prepare', member.id);
  const state = { ...game, graduations: [pending] };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(getPendingGraduationSetups(state)[0].id, pending.id);
    assert.equal(state.money, game.money);
    assert.equal(state.graduations[0].preparation, undefined);
  }

  const prepared = prepareGraduation(state, pending.id, { specialSegment: true });
  assert.equal(prepared.money, game.money - 4_000_000);
  assert.equal(prepared.graduations[0].preparation.cost, 4_000_000);
  assert.deepEqual(getPendingGraduationSetups(prepared), []);
  assert.strictEqual(prepareGraduation(prepared, pending.id, { specialSegment: true }), prepared);

  const restored = await saveAndReload(JSON.parse(JSON.stringify(prepared)));
  assert.deepEqual(getPendingGraduationSetups(restored), []);

  const repeatedPreparation = prepareGraduation(restored, pending.id, { specialSegment: true });
  assert.strictEqual(repeatedPreparation, restored);
  assert.equal(repeatedPreparation.money, game.money - 4_000_000);
  assert.equal(repeatedPreparation.financialEvents.filter((event) => event.id === `${pending.id}-preparation-cost`).length, 1);
});
