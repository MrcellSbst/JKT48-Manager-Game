import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  finalizeGameSetup,
  scheduleFanCampaign,
  scheduleYearEndMeetGreet,
} from '../src/engine/gameEngine.js';
import {
  TUTORIAL_CHAPTERS,
  completeTutorialWeek,
  createTutorialState,
  getTutorialChapter,
  markTutorialStep,
  normalizeTutorialState,
  skipTutorial,
} from '../src/engine/tutorial.js';

function activeGame(seed = 'tutorial-title-test') {
  const draft = createGame(seed);
  const memberIds = draft.members.slice(0, 16).map((member) => member.id);
  return finalizeGameSetup(draft, draft.theaterOffers[0].id, memberIds, 'Test Management');
}

test('new timelines start with an active, versioned tutorial', () => {
  const game = createGame('tutorial-new-run');
  assert.equal(game.tutorialState.schemaVersion, 1);
  assert.equal(game.tutorialState.status, 'active');
  assert.deepEqual(game.tutorialState.completedStepIds, []);
  assert.deepEqual(game.tutorialState.completedSteps, { schedule: [], training: [], campaigns: [], 'weekly-loop': [] });
  assert.deepEqual(TUTORIAL_CHAPTERS.map((chapter) => chapter.week), [1, 2, 3, 4]);
  assert.equal(getTutorialChapter(game.tutorialState, 1, 1).id, 'schedule');
});

test('saves without tutorial state normalize as skipped legacy timelines', () => {
  const legacy = normalizeTutorialState(undefined);
  assert.equal(legacy.schemaVersion, 1);
  assert.equal(legacy.status, 'skipped');
  assert.deepEqual(legacy.completedStepIds, []);

  const newTimelineFallback = normalizeTutorialState(undefined, { isNewTimeline: true });
  assert.equal(newTimelineFallback.status, 'active');
});

test('tutorial steps, skip, and week-four completion are deterministic', () => {
  let tutorial = createTutorialState('active');
  tutorial = markTutorialStep(tutorial, 'schedule-opened');
  tutorial = markTutorialStep(tutorial, 'training-queued');
  tutorial = markTutorialStep(tutorial, 'training-queued');
  assert.deepEqual(tutorial.completedStepIds, ['schedule-opened', 'training-queued']);
  assert.deepEqual(tutorial.completedSteps.schedule, ['schedule-opened']);
  assert.deepEqual(tutorial.completedSteps.training, ['training-queued']);
  assert.equal(getTutorialChapter(tutorial, 1, 3).id, 'campaigns');

  const skipped = skipTutorial(tutorial);
  assert.equal(skipped.status, 'skipped');
  assert.equal(markTutorialStep(skipped, 'campaigns-opened').status, 'skipped');
  assert.equal(getTutorialChapter(skipped, 1, 3), null);

  const completed = completeTutorialWeek(tutorial, 1, 4);
  assert.equal(completed.status, 'completed');
  assert.ok(completed.completedStepIds.includes('week-4-resolved'));
  assert.equal(completeTutorialWeek(tutorial, 2, 4).status, 'active');
});

test('fan-event titles trim whitespace, use defaults, and enforce the 60-character cap', () => {
  const game = activeGame('fan-title-validation');
  const selected = game.members.slice(0, 3).map((member) => member.id);

  const custom = scheduleFanCampaign(game, 'videoCall', 'Fri', selected, 2, '  Oshi Check-in  ');
  assert.equal(custom.fanEventPlans.length, 1);
  assert.equal(custom.fanEventPlans[0].title, 'Oshi Check-in');
  assert.equal(custom.fanEventPlans[0].customTitle, true);

  const defaultTitle = scheduleFanCampaign(game, 'meetGreet', 'Sun', [], 2);
  assert.equal(defaultTitle.fanEventPlans.length, 1);
  assert.equal(defaultTitle.fanEventPlans[0].title, 'Meet & Greet');
  assert.equal(defaultTitle.fanEventPlans[0].customTitle, false);

  const tooLong = scheduleFanCampaign(game, 'videoCall', 'Mon', [game.members[3].id], 2, 'x'.repeat(61));
  assert.equal(tooLong, game);
});

test('same-week video calls keep separate event IDs and titles', () => {
  const game = activeGame('fan-title-ids');
  const firstMember = game.members[0].id;
  const secondMember = game.members[1].id;
  const first = scheduleFanCampaign(game, 'videoCall', 'Fri', [firstMember], 2, 'Friday Check-in');
  const second = scheduleFanCampaign(first, 'videoCall', 'Sat', [secondMember], 2, 'Saturday Check-in');

  assert.equal(second.fanEventPlans.length, 2);
  assert.notEqual(second.fanEventPlans[0].id, second.fanEventPlans[1].id);
  assert.deepEqual(second.fanEventPlans.map((plan) => plan.title), ['Friday Check-in', 'Saturday Check-in']);
  assert.ok(second.fanEventPlans.every((plan) => plan.id.startsWith('fan-event-videoCall-1-2-')));
});

test('year-end Meet & Greet persists a trimmed custom title into history and finance', () => {
  let game = activeGame('year-end-title');
  game = { ...game, week: 25, money: 200_000_000 };
  const scheduled = scheduleYearEndMeetGreet(game, 38, 'Sat', 36, {}, '  Winter Fan Day  ');

  assert.equal(scheduled.yearEndMeetGreets.length, 1);
  const event = scheduled.yearEndMeetGreets[0];
  assert.equal(event.title, 'Winter Fan Day');
  assert.equal(event.customTitle, true);
  assert.ok(scheduled.history.some((entry) => entry.id === event.id && entry.title === 'Winter Fan Day announced'));
  assert.ok(scheduled.financialEvents.some((entry) => entry.id === `${event.id}-cost` && entry.title === 'Winter Fan Day booking'));
});
