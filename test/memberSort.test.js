import test from 'node:test';
import assert from 'node:assert/strict';
import { getMemberOverall, sortMembers } from '../src/engine/memberSort.js';

const members = [
  { id: '10', name: 'Zeta', generation: 'Gen 10', team: 'Team B', birthMonth: 2, birthYear: 1998, vocal: 80, dance: 80, performance: 80, mc: 80, variety: 80, stamina: 60, ego: 20 },
  { id: '2', name: 'Alpha', generation: 'Gen 2', team: 'Team A', birthMonth: 2, birthYear: 2004, vocal: 60, dance: 60, performance: 60, mc: 60, variety: 60, stamina: 90, ego: 30 },
  { id: '1', name: 'Beta', generation: 'Gen 10', team: 'Team A', birthMonth: 1, birthYear: 2000, vocal: 70, dance: 70, performance: 70, mc: 70, variety: 70, stamina: 40, ego: 10 },
];

test('member sorting supports stable name, generation, birthday, and team directions', () => {
  assert.deepEqual(sortMembers(members, { sortKey: 'name', direction: 'asc' }).map((member) => member.name), ['Alpha', 'Beta', 'Zeta']);
  assert.deepEqual(sortMembers(members, { sortKey: 'name', direction: 'desc' }).map((member) => member.name), ['Zeta', 'Beta', 'Alpha']);
  assert.deepEqual(sortMembers(members, { sortKey: 'generation', direction: 'asc' }).map((member) => member.name), ['Alpha', 'Beta', 'Zeta']);
  assert.deepEqual(sortMembers(members, { sortKey: 'generation', direction: 'desc' }).map((member) => member.name), ['Beta', 'Zeta', 'Alpha']);
  assert.deepEqual(sortMembers(members, { sortKey: 'birthday', direction: 'asc' }).map((member) => member.name), ['Beta', 'Alpha', 'Zeta']);
  assert.deepEqual(sortMembers(members, { sortKey: 'team', direction: 'asc' }).map((member) => member.name), ['Alpha', 'Beta', 'Zeta']);
  assert.deepEqual(sortMembers(members, { sortKey: 'team', direction: 'desc' }).map((member) => member.name), ['Zeta', 'Alpha', 'Beta']);
});

test('visible-stat sorting uses the shared Overall calculation and does not mutate input', () => {
  const source = [...members];
  assert.deepEqual(sortMembers(source, { sortKey: 'visible-stat', visibleStat: 'overall', direction: 'desc' }).map((member) => member.name), ['Zeta', 'Beta', 'Alpha']);
  assert.deepEqual(sortMembers(source, { sortKey: 'visible-stat', visibleStat: 'stamina', direction: 'asc' }).map((member) => member.name), ['Beta', 'Zeta', 'Alpha']);
  assert.equal(getMemberOverall(members[0]), 80);
  assert.deepEqual(source, members);
});

