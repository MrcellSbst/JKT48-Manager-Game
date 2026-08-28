import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareSaveFreshness } from '../src/state/saveFreshness.js';

const snapshot = ({ year = 1, week = 1, updatedAt = 1, seed = 'run', runSalt = 'salt', marker = '', profile } = {}) => ({
  activeRun: { updatedAt, state: { seed, runSalt, year, week, marker } },
  ...(profile ? { metaProfile: profile } : {}),
});

test('save freshness favors farther progress within the same timeline', () => {
  const local = snapshot({ year: 2, week: 9, updatedAt: 100 });
  const cloud = snapshot({ year: 2, week: 4, updatedAt: 999999 });
  assert.equal(compareSaveFreshness(local, cloud), 'local');
  assert.equal(compareSaveFreshness(cloud, local), 'cloud');
});

test('save freshness uses the last local write for equal progress or different timelines', () => {
  const local = snapshot({ week: 8, updatedAt: 500, marker: 'local' });
  const cloud = snapshot({ week: 8, updatedAt: 400, marker: 'cloud' });
  assert.equal(compareSaveFreshness(local, cloud), 'local');
  assert.equal(compareSaveFreshness(snapshot({ seed: 'other', updatedAt: 200 }), local), 'cloud');
});

test('save freshness handles missing and identical active runs', () => {
  const run = snapshot();
  assert.equal(compareSaveFreshness({}, run), 'cloud');
  assert.equal(compareSaveFreshness(run, {}), 'local');
  assert.equal(compareSaveFreshness(run, structuredClone(run)), 'equal');
});

test('save freshness detects a newer profile-only update', () => {
  const state = { week: 8, marker: 'same' };
  const local = snapshot({ ...state, updatedAt: 400, profile: { currency: 9, updatedAt: 600 } });
  const cloud = snapshot({ ...state, updatedAt: 500, profile: { currency: 8, updatedAt: 500 } });
  assert.equal(compareSaveFreshness(local, cloud), 'local');
});

test('local save writes and cloud uploads are serialized', async () => {
  const localSource = await readFile(new URL('../src/state/saveDb.js', import.meta.url), 'utf8');
  const cloudSource = await readFile(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8');
  assert.match(localSource, /saveOperationQueue\.catch\(\(\) => \{\}\)\.then\(operation\)/);
  assert.match(localSource, /return enqueueSaveOperation\(\(\) => writeSaveNow\(slot, state, options\)\)/);
  assert.match(localSource, /await flushSaveOperations\(\);\s*const \[activeRun, metaProfile\]/);
  assert.match(localSource, /export async function loadSave[\s\S]*await flushSaveOperations\(\);/);
  assert.match(localSource, /export async function getActiveRun[\s\S]*await flushSaveOperations\(\);/);
  assert.match(cloudSource, /cloudUploadQueueRef\.current\.catch\(\(\) => \{\}\)\.then/);
  assert.match(cloudSource, /cloudUploadQueueRef\.current = upload/);
});
