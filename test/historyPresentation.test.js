import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHistoryEventDetail } from '../src/engine/historyPresentation.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const calendarLabel = (year, week) => `Year ${year} · ${MONTHS[Math.floor((week - 1) / 4)]} · Week ${((week - 1) % 4) + 1}`;

test('history dates remain stable when detail already uses calendar labels', () => {
  const detail = 'Production starts Year 1 · Jan · Week 3; release is Year 1 · Feb · Week 4.';
  assert.equal(formatHistoryEventDetail(detail, 1, calendarLabel), detail);
});

test('history dates normalize legacy absolute and month-based week labels', () => {
  assert.equal(
    formatHistoryEventDetail('Starts Year 2, Week 5; release Year 2, Month 3, Week 2.', 2, calendarLabel),
    'Starts Year 2 · Feb · Week 1; release Year 2 · Mar · Week 2.',
  );
});
