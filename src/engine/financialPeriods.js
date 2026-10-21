import { BALANCE } from '../data/balance.js';

const isValidDate = (item) => Number.isInteger(item?.year)
  && item.year >= 1
  && Number.isInteger(item.week)
  && item.week >= 1
  && item.week <= BALANCE.weeksPerYear;

const compareDates = (first, second) => first.year - second.year || first.week - second.week;
const finiteNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function getFinancialPeriodData(game, {
  period = 'month',
  year = game.year,
  month = Math.ceil(game.week / BALANCE.weeksPerMonth),
  week = ((game.week - 1) % BALANCE.weeksPerMonth) + 1,
} = {}) {
  const validYear = Number.isInteger(year) && year >= 1;
  const validMonth = Number.isInteger(month) && month >= 1 && month <= BALANCE.weeksPerYear / BALANCE.weeksPerMonth;
  const validWeekOfMonth = Number.isInteger(week) && week >= 1 && week <= BALANCE.weeksPerMonth;
  const selectedWeek = (month - 1) * BALANCE.weeksPerMonth + week;
  const inPeriod = (item) => {
    if (!isValidDate(item)) return false;
    if (period === 'all') return true;
    if (!validYear || item.year !== year) return false;
    if (period === 'year') return true;
    if (!validMonth) return false;
    if (period === 'month') {
      const firstWeek = (month - 1) * BALANCE.weeksPerMonth + 1;
      return item.week >= firstWeek && item.week <= month * BALANCE.weeksPerMonth;
    }
    return period === 'week' && validWeekOfMonth && item.week === selectedWeek;
  };

  const reports = (game.weeklyReports ?? []).filter(inPeriod).sort(compareDates);
  const financialEvents = (game.financialEvents ?? []).filter(inPeriod).sort(compareDates);
  const trendByWeek = new Map();
  const addToTrend = (item, moneyDelta) => {
    const key = `${item.year}:${item.week}`;
    const point = trendByWeek.get(key) ?? { year: item.year, week: item.week, moneyDelta: 0 };
    point.moneyDelta += moneyDelta;
    trendByWeek.set(key, point);
  };

  reports.forEach((report) => addToTrend(report, finiteNumber(report.moneyDelta)));
  financialEvents.forEach((event) => {
    const income = Math.max(0, finiteNumber(event.income ?? event.revenue));
    const expense = Math.max(0, finiteNumber(event.expense ?? event.cost));
    addToTrend(event, income - expense);
  });

  const trend = [...trendByWeek.values()].sort(compareDates);
  return { reports, financialEvents, trend, weekCount: trend.length, hasData: trend.length > 0 };
}

export function getFinancialReportYears(game) {
  const years = new Set(Number.isInteger(game.year) && game.year >= 1 ? [game.year] : []);
  [...(game.weeklyReports ?? []), ...(game.financialEvents ?? [])]
    .filter(isValidDate)
    .forEach((item) => years.add(item.year));
  return [...years].sort((first, second) => second - first);
}
