import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMemberFilters,
  filterCoreTraineeMembers,
  filterMembersByRoster,
  matchesCoreTraineeFilter,
} from '../src/engine/memberFilter.js';

const members = [
  { id: 'regular', name: 'Regular', status: 'active', generation: 'Gen 2' },
  { id: 'trainee', name: 'Trainee', status: 'trainee', generation: 'Gen 1' },
  { id: 'suspended', name: 'Suspended', status: 'suspended', generation: 'Gen 3' },
];

test('Core/Trainee filter keeps core members together and preserves order', () => {
  assert.deepEqual(filterCoreTraineeMembers(members, 'core').map((member) => member.id), ['regular', 'suspended']);
  assert.deepEqual(filterCoreTraineeMembers(members, 'trainee').map((member) => member.id), ['trainee']);
  assert.deepEqual(filterCoreTraineeMembers(members).map((member) => member.id), ['regular', 'trainee', 'suspended']);
  assert.equal(matchesCoreTraineeFilter({ status: 'trainee' }, 'regular'), false);
  assert.equal(matchesCoreTraineeFilter({ status: 'active' }, 'regular'), true);
});

test('filter helpers never mutate source and preserve shared sorting semantics', () => {
  const source = [...members];
  assert.deepEqual(applyMemberFilters(source, { roster: 'core', sortKey: 'name', direction: 'desc' }).map((member) => member.name), ['Suspended', 'Regular']);
  assert.deepEqual(source, members);
  assert.deepEqual(filterMembersByRoster(source, 'trainee'), [members[1]]);
});

