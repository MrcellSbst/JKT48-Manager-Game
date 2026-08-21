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

test('management risk separates overwork from protective rest and does not invent finance risk', () => {
  const members = [{ id: 'm1', name: 'A', status: 'active', energy: 25, popularity: 70 }];
  const overloaded = { year: 3, week: 20, money: 100_000, members, schedule: { 'm1:Mon': 'theater', 'm1:Tue': 'media', 'm1:Wed': 'vocal', 'm1:Thu': 'dance', 'm1:Fri': 'performance' }, ledger: { debt: {} }, financialEvents: [], history: [], weeklyReports: [], singles: [], theaterHistory: [], fanEventPlans: [], concerts: [], yearEndMeetGreets: [], graduationTargets: {}, departures: [] };
  const rested = { ...overloaded, money: 2_000_000, members: [{ ...members[0], energy: 80 }], schedule: { 'm1:Mon': 'rest', 'm1:Tue': 'rest' } };
  const overloadedContext = getManagementDramaContext(overloaded, overloaded.members);
  const restedContext = getManagementDramaContext(rested, rested.members);
  assert.equal(overloadedContext.kind, 'overwork');
  assert.ok(overloadedContext.risk.overwork > restedContext.risk.overwork);
  assert.ok(overloadedContext.risk.financialMismanagement === 0);
  assert.ok(restedContext.protective.restCoverage > 0);
  assert.ok(overloadedContext.chanceMultiplier > restedContext.chanceMultiplier);
});

test('management template weights follow the active risk and protective factor', () => {
  const members = [{ id: 'm1', name: 'A', status: 'active', energy: 20, popularity: 70 }];
  const state = { year: 3, week: 20, money: 100_000, members, schedule: { 'm1:Mon': 'theater', 'm1:Tue': 'media', 'm1:Wed': 'vocal', 'm1:Thu': 'dance', 'm1:Fri': 'performance' }, ledger: { debt: {} }, financialEvents: [], history: [], weeklyReports: [], singles: [], theaterHistory: [], fanEventPlans: [], concerts: [], yearEndMeetGreets: [], graduationTargets: {}, departures: [] };
  const selection = selectManagementDramaTemplate(state, members, createRng(hashSeed('weight-test')));
  assert.ok(selection.weights['member-overwork'] > 0);
  assert.ok(selection.context.risk.overwork > 0);
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
