export const TUTORIAL_SCHEMA_VERSION = 1;

export const TUTORIAL_CHAPTERS = Object.freeze([
  { id: 'schedule', week: 1, view: 'schedule', stepIds: ['schedule-opened', 'schedule-assigned', 'schedule-understood'] },
  { id: 'training', week: 2, view: 'training', stepIds: ['training-opened', 'training-queued', 'training-understood'] },
  { id: 'campaigns', week: 3, view: 'campaigns', stepIds: ['campaigns-opened', 'fan-event-reviewed', 'campaigns-understood'] },
  { id: 'weekly-loop', week: 4, view: 'dashboard', stepIds: ['command-opened', 'resolve-reviewed', 'week-4-resolved'] },
]);

const emptyCompletedSteps = () => Object.fromEntries(TUTORIAL_CHAPTERS.map((chapter) => [chapter.id, []]));
const chapterForStep = (stepId) => TUTORIAL_CHAPTERS.find((chapter) => chapter.stepIds.includes(stepId) || stepId.startsWith(`${chapter.id}-`));

export function createTutorialState(status = 'active') {
  return { schemaVersion: TUTORIAL_SCHEMA_VERSION, status, completedSteps: emptyCompletedSteps(), completedStepIds: [] };
}

export function normalizeTutorialState(value, { isNewTimeline = false } = {}) {
  if (!value || typeof value !== 'object') return createTutorialState(isNewTimeline ? 'active' : 'skipped');
  const status = ['active', 'skipped', 'completed'].includes(value.status) ? value.status : 'skipped';
  const groupedIds = Object.values(value.completedSteps ?? {}).flatMap((ids) => (Array.isArray(ids) ? ids : []));
  const completedStepIds = [...new Set([...(Array.isArray(value.completedStepIds) ? value.completedStepIds : []), ...groupedIds].filter((id) => typeof id === 'string'))];
  const completedSteps = emptyCompletedSteps();
  completedStepIds.forEach((stepId) => {
    const chapter = chapterForStep(stepId);
    if (chapter) completedSteps[chapter.id].push(stepId);
  });
  return { schemaVersion: TUTORIAL_SCHEMA_VERSION, status, completedSteps, completedStepIds };
}

export function markTutorialStep(tutorialState, stepId) {
  const tutorial = normalizeTutorialState(tutorialState);
  if (tutorial.status !== 'active' || !stepId || tutorial.completedStepIds.includes(stepId)) return tutorial;
  const chapter = chapterForStep(stepId);
  return {
    ...tutorial,
    completedSteps: chapter ? { ...tutorial.completedSteps, [chapter.id]: [...tutorial.completedSteps[chapter.id], stepId] } : tutorial.completedSteps,
    completedStepIds: [...tutorial.completedStepIds, stepId],
  };
}

export function skipTutorial(tutorialState) {
  const tutorial = normalizeTutorialState(tutorialState);
  return tutorial.status === 'active' ? { ...tutorial, status: 'skipped' } : tutorial;
}

export function completeTutorialWeek(tutorialState, year, week) {
  const tutorial = normalizeTutorialState(tutorialState);
  if (tutorial.status !== 'active' || year !== 1 || week !== 4) return tutorial;
  return { ...markTutorialStep(tutorial, 'week-4-resolved'), status: 'completed' };
}

export function getTutorialChapter(tutorialState, year, week) {
  const tutorial = normalizeTutorialState(tutorialState);
  if (tutorial.status !== 'active' || year !== 1) return null;
  return TUTORIAL_CHAPTERS.find((chapter) => chapter.week === week) ?? null;
}
