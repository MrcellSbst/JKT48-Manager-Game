const FORMATTED_CALENDAR_PATTERN = /Year (\d+)\s*·\s*([A-Z][a-z]{2})\s*·\s*Week ([1-4])/;
const LEGACY_MONTH_PATTERN = /Year (\d+),?\s*Month (\d+),?\s*Week (\d+)/;
const LEGACY_WEEK_PATTERN = /Year (\d+),?\s*Week (\d+)/;
const STANDALONE_WEEK_PATTERN = /\bWeek (\d+)\b/;
const HISTORY_DATE_PATTERN = new RegExp([
  FORMATTED_CALENDAR_PATTERN.source,
  LEGACY_MONTH_PATTERN.source,
  LEGACY_WEEK_PATTERN.source,
  STANDALONE_WEEK_PATTERN.source,
].join('|'), 'g');

export function formatHistoryEventDetail(detail, eventYear, formatCalendar) {
  return String(detail ?? '').replace(
    HISTORY_DATE_PATTERN,
    (match, formattedYear, _formattedMonth, _formattedWeek, monthYear, month, monthWeek, weekYear, yearWeek, standaloneWeek) => {
      // Consume an already-formatted label as one token. Without this branch,
      // its trailing "Week N" was formatted again every time History rendered.
      if (formattedYear) return match;
      if (monthYear) return formatCalendar(Number(monthYear), (Number(month) - 1) * 4 + Number(monthWeek));
      if (weekYear) return formatCalendar(Number(weekYear), Number(yearWeek));
      return formatCalendar(eventYear, Number(standaloneWeek));
    },
  );
}
