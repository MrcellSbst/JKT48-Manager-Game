import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, decodeSnapshot, encodeSnapshot, splitSnapshot } from '../src/state/saveFormat.js';

const snapshot = {
  version: 1,
  savedAt: 123,
  activeRun: {
    slot: 1,
    updatedAt: 123,
    state: {
      year: 3,
      members: [{ id: 'member-1', name: '测试' }],
      schedule: { Monday: 'theater' },
      weeklyReports: [{ week: 8, skillChanges: { member: { vocal: 1 } } }],
      futureStateField: { retained: true },
    },
  },
  metaProfile: { currency: 24, unlockedBonusIds: ['B001'] },
};

test('save format splits known domains and keeps unknown state in core', () => {
  const sections = splitSnapshot(snapshot);
  assert.deepEqual(sections.roster.members, snapshot.activeRun.state.members);
  assert.deepEqual(sections.operations.schedule, snapshot.activeRun.state.schedule);
  assert.deepEqual(sections.history.weeklyReports, snapshot.activeRun.state.weeklyReports);
  assert.deepEqual(sections.core.state.futureStateField, snapshot.activeRun.state.futureStateField);
});

test('save format independently encodes and verifies all sections', async () => {
  const encoded = await encodeSnapshot(snapshot, { slot: 1 });
  assert.deepEqual(Object.keys(encoded.sections).sort(), ['core', 'history', 'operations', 'profile', 'roster']);
  const restored = await decodeSnapshot(encoded);
  assert.equal(canonicalJson(restored), canonicalJson(snapshot));
  const tampered = { ...encoded, sections: { ...encoded.sections, roster: `${encoded.sections.roster.slice(0, -4)}AAAA` } };
  await assert.rejects(() => decodeSnapshot(tampered), /failed|invalid|modified/i);
});

test('a voucher-style roster-only update keeps unchanged sections verifiable', async () => {
  const original = await encodeSnapshot(snapshot, { slot: 1, updatedAt: 123 });
  const editedSnapshot = structuredClone(snapshot);
  editedSnapshot.activeRun.state.members[0].vocal = 88;
  const edited = await encodeSnapshot(editedSnapshot, { slot: 1, updatedAt: 124 });
  const rosterOnlyWrite = {
    manifest: edited.manifest,
    sections: { ...original.sections, roster: edited.sections.roster },
  };
  const restored = await decodeSnapshot(rosterOnlyWrite);
  assert.equal(canonicalJson(restored), canonicalJson(editedSnapshot));
});

test('section conversion resumes verified checkpoint payloads without recompressing them', async () => {
  const first = await encodeSnapshot(snapshot, { slot: 1, updatedAt: 123 });
  const rewritten = [];
  const resumed = await encodeSnapshot(snapshot, {
    slot: 1,
    updatedAt: 123,
    resume: { sections: first.sections, metadata: first.manifest.sections },
    onSection: ({ name }) => rewritten.push(name),
  });
  assert.deepEqual(rewritten, []);
  assert.equal(canonicalJson(await decodeSnapshot(resumed)), canonicalJson(snapshot));
});
