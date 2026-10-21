import test from 'node:test';
import assert from 'node:assert/strict';
import { getFinancialPeriodData, getFinancialReportYears } from '../src/engine/financialPeriods.js';

test('month and year periods keep January and December separated across years', () => {
  const game = {
    year: 2,
    week: 1,
    weeklyReports: [
      { id: 'year-1-december', year: 1, week: 48, moneyDelta: 480 },
      { id: 'year-2-january-1', year: 2, week: 1, moneyDelta: 21 },
      { id: 'year-2-january-4', year: 2, week: 4, moneyDelta: 24 },
      { id: 'year-2-february', year: 2, week: 5, moneyDelta: 25 },
    ],
    financialEvents: [
      { id: 'december-event', year: 1, week: 48, expense: 10 },
      { id: 'january-event', year: 2, week: 1, income: 5 },
    ],
  };

  assert.deepEqual(getFinancialPeriodData(game, { period: 'month', year: 1, month: 12 }).reports.map(({ id }) => id), ['year-1-december']);
  assert.deepEqual(getFinancialPeriodData(game, { period: 'month', year: 2, month: 1 }).reports.map(({ id }) => id), ['year-2-january-1', 'year-2-january-4']);
  assert.deepEqual(getFinancialPeriodData(game, { period: 'month', year: 2, month: 1 }).financialEvents.map(({ id }) => id), ['january-event']);
  assert.deepEqual(getFinancialPeriodData(game, { period: 'year', year: 1 }).reports.map(({ id }) => id), ['year-1-december']);
  assert.deepEqual(getFinancialPeriodData(game, { period: 'year', year: 2 }).reports.map(({ id }) => id), ['year-2-january-1', 'year-2-january-4', 'year-2-february']);
});

test('week period selects each week of a month independently', () => {
  const game = { year: 3, week: 1, weeklyReports: [1, 2, 3, 4].map((week) => ({ year: 3, week, moneyDelta: week * 10 })) };

  for (const week of [1, 2, 3, 4]) {
    const result = getFinancialPeriodData(game, { period: 'week', year: 3, month: 1, week });
    assert.deepEqual(result.reports.map((report) => report.week), [week]);
    assert.deepEqual(result.trend.map(({ week: trendWeek }) => trendWeek), [week]);
    assert.equal(result.weekCount, 1);
  }
});

test('all time includes dated reports and immediate events from every year', () => {
  const game = {
    year: 2,
    week: 6,
    weeklyReports: [{ year: 1, week: 48, moneyDelta: 100 }, { year: 2, week: 1, moneyDelta: -20 }],
    financialEvents: [{ year: 1, week: 48, revenue: 30, cost: 10 }],
  };
  const result = getFinancialPeriodData(game, { period: 'all', year: 99, month: 99, week: 99 });

  assert.equal(result.weekCount, 2);
  assert.deepEqual(result.trend, [
    { year: 1, week: 48, moneyDelta: 120 },
    { year: 2, week: 1, moneyDelta: -20 },
  ]);
});

test('historical financial events are included only in their selected calendar period', () => {
  const game = {
    year: 2,
    week: 20,
    weeklyReports: [],
    financialEvents: [
      { id: 'old-month', year: 1, week: 4, income: 40 },
      { id: 'next-month', year: 1, week: 5, expense: 15 },
      { id: 'next-year', year: 2, week: 1, income: 100 },
    ],
  };

  assert.deepEqual(getFinancialPeriodData(game, { period: 'month', year: 1, month: 1 }).financialEvents.map(({ id }) => id), ['old-month']);
  assert.deepEqual(getFinancialPeriodData(game, { period: 'month', year: 1, month: 2 }).financialEvents.map(({ id }) => id), ['next-month']);
  assert.deepEqual(getFinancialPeriodData(game, { period: 'year', year: 1 }).financialEvents.map(({ id }) => id), ['old-month', 'next-month']);
});

test('results are chronological and sorting does not mutate the saved arrays', () => {
  const reports = [{ year: 2, week: 2, id: 'later' }, { year: 1, week: 48, id: 'earlier' }];
  const financialEvents = [{ year: 2, week: 1, id: 'middle' }, { year: 1, week: 48, id: 'earliest-week-event' }];
  const before = JSON.stringify({ reports, financialEvents });
  const result = getFinancialPeriodData({ year: 2, week: 1, weeklyReports: reports, financialEvents }, { period: 'all' });

  assert.deepEqual(result.reports.map(({ id }) => id), ['earlier', 'later']);
  assert.deepEqual(result.financialEvents.map(({ id }) => id), ['earliest-week-event', 'middle']);
  assert.deepEqual(result.trend.map(({ year, week }) => [year, week]), [[1, 48], [2, 1], [2, 2]]);
  assert.equal(JSON.stringify({ reports, financialEvents }), before);
});

test('an event-only period contributes a net trend and counts as data', () => {
  const result = getFinancialPeriodData({
    year: 1,
    week: 1,
    financialEvents: [{ year: 1, week: 1, revenue: 125, cost: 25 }],
  });

  assert.deepEqual(result.reports, []);
  assert.deepEqual(result.trend, [{ year: 1, week: 1, moneyDelta: 100 }]);
  assert.equal(result.weekCount, 1);
  assert.equal(result.hasData, true);
});

test('empty legacy saves without report arrays return no financial data', () => {
  const game = { year: 1, week: 1 };
  assert.deepEqual(getFinancialPeriodData(game), { reports: [], financialEvents: [], trend: [], weekCount: 0, hasData: false });
  assert.deepEqual(getFinancialReportYears(game), [1]);
});

test('report years include the current year and valid historical report and event years', () => {
  const game = {
    year: 3,
    weeklyReports: [{ year: 1, week: 48 }, { year: 2, week: 1 }, { year: 0, week: 1 }, { year: 9, week: 49 }],
    financialEvents: [{ year: 4, week: 2 }, { year: 5, week: 0 }],
  };

  assert.deepEqual(getFinancialReportYears(game), [4, 3, 2, 1]);
});
