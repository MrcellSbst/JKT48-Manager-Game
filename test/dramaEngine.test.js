import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_DRAMA_TEMPLATES, MANAGEMENT_DRAMA_BY_ID, MANAGEMENT_DRAMA_TEMPLATES, MEMBER_DRAMA_BY_ID, MEMBER_DRAMA_TEMPLATES } from '../src/data/dramaData.js';
import { getManagementDramaContext, selectManagementDramaTemplate } from '../src/engine/dramaEngine.js';
import { createRng, hashSeed } from '../src/engine/rng.js';

test('management drama context follows player decisions and recent state', () => {
  const members = [{ id: 'm1', name: 'A', status: 'active', energy: 20, popularity: 70 }];
  const state = {
    year: 3, week: 20, money: -10_000, members, schedule: { 'm1:Mon': 'theater', 'm1:Tue': 'media', 'm1:Wed': 'vocal', 'm1:Thu': 'dance', 'm1:Fri': 'performance', 'm1:Sat': 'mc' },
    ledger: { debt: { salary: 1, upkeep: 0, operations: 0 } }, concerts: [], fanEventPlans: [], yearEndMeetGreets: [], financialEvents: [], opportunityHistory: [], history: [], singles: [], graduationTargets: {}, departures: [],
  };
  const context = getManagementDramaContext(state, members);
  assert.equal(context.kind, 'finance');
  const selection = selectManagementDramaTemplate(state, members, createRng(hashSeed('management')));
  assert.ok(['budget-overspending', 'financial-crisis-link'].includes(selection.template.id));
  assert.ok(MANAGEMENT_DRAMA_TEMPLATES.some((template) => template.id === selection.template.id));
});

test('management templates may be rendered without a random member subject', () => {
  const template = MANAGEMENT_DRAMA_TEMPLATES.find((item) => item.id === 'ticketing-system-failure');
  assert.ok(template);
  assert.equal(/\{member\}/.test(template.title + template.detail), false);
});

test('management drama records reflect an active management decision', () => {
  const members = [{ id: 'm1', name: 'A', status: 'active', energy: 80, popularity: 70 }];
  const state = { year: 3, week: 10, money: 100_000, members, schedule: {}, ledger: { debt: {} }, concerts: [{ targetYear: 3, targetWeek: 12, status: 'announced' }], fanEventPlans: [], yearEndMeetGreets: [], financialEvents: [], opportunityHistory: [], history: [{ type: 'management', title: 'Venue booking approved', detail: 'Management approved the venue.' }], singles: [], graduationTargets: {}, departures: [] };
  const selection = selectManagementDramaTemplate(state, members, createRng(hashSeed('event-context')));
  assert.equal(getManagementDramaContext(state, members).kind, 'event');
  assert.ok(selection.context.evidence.includes('upcoming'));
});

test('drama catalogs keep sources, IDs, localization, and placeholders explicit', () => {
  assert.equal(new Set(ALL_DRAMA_TEMPLATES.map((template) => template.id)).size, ALL_DRAMA_TEMPLATES.length);
  assert.equal(new Set([...MEMBER_DRAMA_TEMPLATES, ...MANAGEMENT_DRAMA_TEMPLATES].map((template) => template.id)).size, ALL_DRAMA_TEMPLATES.length);
  [...MEMBER_DRAMA_TEMPLATES, ...MANAGEMENT_DRAMA_TEMPLATES].forEach((template) => {
    assert.ok(template.title && template.titleId && template.detail && template.detailId);
    assert.equal(template.dramaSource, template.id in MEMBER_DRAMA_BY_ID ? 'member' : 'management');
    if (template.dramaSource === 'management' && !/\{member\}/.test(`${template.title}${template.detail}`)) assert.doesNotMatch(`${template.title}${template.detail}`, /undefined|null/);
  });
});
