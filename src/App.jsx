import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, Archive, ArrowDown, ArrowLeft, ArrowUp, BookOpen, Building2, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, CircleDollarSign, Clapperboard, Cloud,
  Clock3, Disc3, Download, Dumbbell, History, Languages, LayoutDashboard, LogOut, Menu, Megaphone, Moon, Pencil, PhoneCall, Plus, Save, Search, ShieldAlert, Square,
  Sparkles, Sun, Target, Ticket, Trash2, TrendingUp, Trophy, UserRoundSearch, Users, Wrench, X,
} from 'lucide-react';
import { BALANCE, CONCERT_BUDGETS, CONCERT_VENUES, DAYS, SCHEDULE_ACTIVITY_GROUPS, SCHEDULE_STANDALONE_ACTIVITIES, SINGLE_BUDGETS, TRAINING_ACTIVITY_GROUPS, TRAINING_SKILLS, CONCERT_COST_RULES, concertQuarterForWeek } from './data/balance.js';
import { BONUS_BY_ID, BONUS_TEMPLATES, MAX_BONUS_LEVEL, formatBonusEffect, getBonusUpgradeCost, getBonusValueAtLevel } from './data/bonusTemplates.js';
import { SETLISTS, SETLIST_BY_ID } from './data/setlists.js';
import dreamSetlistSongs from './data/DreamSetlist_Songs.js';
import { announceAnniversaryConcert, announceConcert, applyScheduleTemplate, applyTrainingTemplate, assignActivity, canMemberPerform, clearTrainingPlan, completeYearEndSettlement, configureMajorCampaign, configureTheaterShow, configureTheaterSpecialFlags, createBirthday, createFanTargetForYear, createGame, deleteTrainingTemplate, endRun, finalizeAudition, finalizeGameSetup, fireMember, getAvailableStsLastShowMembers, getCampaignConflictReasons, getConcertCostBreakdown, getFanGrowthMultiplier, getFanTargetPerformance, getGraduationCountdown, getGraduationLastShowCandidates, getMajorCampaignStartBlockReason, getMemberAge, getMemberSalary, getNextMajorCampaignType, getPendingGraduationSetups, getProjectedEnergyByMember, getReportSkillChanges, getRosterDanger, getRunEndWarnings, getScheduleSnapshotForWeek, getSeitansaiCandidates, getSetlistBoredom, getSingleEligibleMembers, getSingleParticipants, getTheaterChangeOffers, getTheaterEligibleMembers, getTheaterRenovationOffer, getTraineePromotionStatus, getTrainingPlanStatus, isMajorCampaignActive, memberCanPerformOnCampaignDate, migrateEconomyState, migrateGraduatedRosterState, migrateInjuryHistoryState, moveTrainingSession, punishMember, payDebt, prepareGraduation, promoteTrainee, queueTrainingSession, removeTrainingSession, renameTrainingTemplate, renovateTheater, replaceTheaterSpecialAssignment, resolveMemberDramaWithoutPunishment, resolveWeek, respondToOpportunity, saveTrainingTemplate, scheduleFanCampaign, scheduleYearEndMeetGreet, settleAnnualTax, startAuditionCampaign, startMajorCampaign, startMentorship, startSingleProduction, takeLoan } from './engine/gameEngine.js';
import { createRunHistoryEntry, deleteActiveRun, getActiveRun, getMetaProfile, loadActiveRun, mergeRunHistory, saveActiveRun, saveMetaProfile } from './state/saveDb.js';
import { formatCloudDateTime, formatDateTime, formatMoney, formatNumber, localizeDocument, setActiveLanguage, translateIndonesian } from './localization.js';
import AuthScreen, { SyncOverlay } from './components/AuthScreen.jsx';
import { useAuth } from './context/AuthContext.jsx';
import comingSoonImage from './Asset/Pics/Coming_SoonCOPY.png';
import { getMemberOverall, rankMembersForSelection, ROSTER_SORT_OPTIONS, SORT_DIRECTIONS, SQUAD_SORT_OPTIONS, sortMembers, VISIBLE_MEMBER_STAT_KEYS, visibleStatLabel } from './engine/memberSort.js';
import { formatHistoryEventDetail } from './engine/historyPresentation.js';
import { VoucherEditModal, VoucherInventory } from './components/VoucherUI.jsx';
import CoreTraineeFilter from './components/CoreTraineeFilter.jsx';
import { filterCoreTraineeMembers } from './engine/memberFilter.js';
import { getFinancialPeriodData, getFinancialReportYears } from './engine/financialPeriods.js';
import VoucherAdminDashboard from './components/VoucherAdminDashboard.jsx';
import PatchnoteNotice from './components/PatchnoteNotice.jsx';
import PatchnotesPage, { LatestPatchnoteCard } from './components/PatchnotesPage.jsx';
import PatchnotesAdminDashboard from './components/PatchnotesAdminDashboard.jsx';
import MigrationScreen from './components/MigrationScreen.jsx';
import HardRefreshButton from './components/HardRefreshButton.jsx';
import { getTutorialChapter, markTutorialStep, normalizeTutorialState, skipTutorial, TUTORIAL_CHAPTERS } from './engine/tutorial.js';
import { normalizeGameState } from './state/gameStateMigration.js';
import { canonicalJson } from './state/saveFormat.js';

const portraitModules = import.meta.glob([
  './Asset/member_active/*',
  './Asset/exmember/**/*',
  '!./Asset/member_active/GENDIS_MAYRANNISA.*',
], { eager: true, query: '?url', import: 'default' });
// `photo` in newmemberdata.js is a bare filename for current members and a `GenN/file` path for
// ex-members — exactly each asset path with its folder prefix removed, so one map serves both.
const portraits = Object.fromEntries(Object.entries(portraitModules).map(([path, url]) => [path.replace('./Asset/member_active/', '').replace('./Asset/exmember/', ''), url]));
const setlistCoverModules = import.meta.glob('./Asset/Setlist/*', { eager: true, query: '?url', import: 'default' });
const setlistCovers = Object.fromEntries(Object.entries(setlistCoverModules).map(([path, url]) => [path.split('/').at(-1), url]));
const AUTOMATIC_ACTIVITY_LOCKS = ['mvProduction', 'concert', 'concertRehearsal', 'yearEndMeetGreet', 'mg1', 'vc1'];

const NAV = [
  ['dashboard', 'Command', LayoutDashboard], ['schedule', 'Schedule', CalendarDays], ['training', 'Training', Dumbbell],
  ['roster', 'Roster', Users], ['campaigns', 'Campaigns', Clapperboard], ['templates', 'Templates', Archive], ['statistics', 'Statistics', ChartNoAxesCombined],
  ['history', 'History', History], ['wiki', 'Wiki', BookOpen], ['patchnotes', 'Patchnotes', Megaphone], ['saves', 'Saves', Archive],
];
const ADMIN_VOUCHER_PATH = '/admin/vouchers';
const ADMIN_PATCHNOTES_PATH = '/admin/patchnotes';
const getAdminRoute = () => {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === ADMIN_VOUCHER_PATH) return 'vouchers';
  if (path === ADMIN_PATCHNOTES_PATH) return 'patchnotes';
  return null;
};
const translate = (language, text) => {
  if (typeof text !== 'string') return text;
  const normalized = text.replaceAll('$', 'FRL.').replace(/FRL(?=\d)/g, 'FRL.');
  return language === 'id' ? translateIndonesian(normalized) : normalized;
};

function ModalPortal({ children }) {
  if (typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}

function ConfirmationModal({ title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, icon = null, destructive = false, children = null }) {
  const cancelRef = useRef(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const close = (event) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onCancel]);
  return <ModalPortal><div className="setup-modal-backdrop confirmation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="confirm-week-modal centered-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="centered-confirmation-title" aria-describedby="centered-confirmation-description">{icon ? <div className="confirm-week-icon">{icon}</div> : null}<h2 id="centered-confirmation-title">{title}</h2><p id="centered-confirmation-description">{description}</p>{children}<div className="confirm-week-actions"><button ref={cancelRef} type="button" className="secondary-button" onClick={onCancel}>{cancelLabel}</button><button type="button" className={destructive ? 'remove-member-button' : 'setup-primary'} onClick={onConfirm}>{confirmLabel} <ChevronRight size={18} /></button></div></section></div></ModalPortal>;
}

const number = { format: (value) => formatNumber(value) };
const money = (value) => formatMoney(value);
const randomSeed = () => {
  const values = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else { values[0] = Math.floor(Math.random() * 0xffffffff); values[1] = Math.floor(Math.random() * 0xffffffff); }
  return `JKT48-${Array.from(values, (value) => value.toString(36).padStart(7, '0')).join('-').toUpperCase()}`;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TRAINING_HISTORY_PAGE_SIZE = 10;
const calendarParts = (week) => ({ month: MONTHS[Math.min(11, Math.floor((week - 1) / BALANCE.weeksPerMonth))], weekOfMonth: ((week - 1) % BALANCE.weeksPerMonth) + 1 });
const activityEnergyLabel = (activity) => activity.energyRecovery ? `+${activity.energyRecovery}` : activity.energy ? `-${activity.energy}` : '0';
const calendarLabel = (year, week) => { const date = calendarParts(week); return `Year ${year} · ${date.month} · Week ${date.weekOfMonth}`; };
const monthWeekLabel = (week) => { const date = calendarParts(week); return `${date.month} · Week ${date.weekOfMonth}`; };
const YEAR_END_MEET_GREET_FAILURE = 'Year-end Meet & Greet could not be scheduled. Check funds, date, roster availability, and campaign conflicts.';
const ANNIVERSARY_CONCERT_FAILURE = 'Anniversary Concert could not be scheduled. Check funds, date, venue, roster availability, and campaign conflicts.';
const YEAR_END_MEET_GREET_FAILURE_CODE = 'year-end-meet-greet-schedule-failed';
const ANNIVERSARY_CONCERT_FAILURE_CODE = 'anniversary-concert-schedule-failed';
const absoluteWeek = (year, week) => (year - 1) * BALANCE.weeksPerYear + week;
const normalizeDashboardNotificationDate = (game, value) => {
  if (typeof value !== 'string') return value ?? '';
  let normalized = value
    .replace(/Year (\d+),?\s*Month (\d+),?\s*Week (\d+)/g, (_, year, month, week) => calendarLabel(Number(year), (Number(month) - 1) * BALANCE.weeksPerMonth + Number(week)))
    .replace(/Year (\d+),?\s*Week (\d+)/g, (_, year, week) => calendarLabel(Number(year), Number(week)))
    .replace(/Year (\d+)\s*·\s*Week (\d+)/g, (_, year, week) => calendarLabel(Number(year), Number(week)));
  const scheduled = normalized.match(/^(.+) scheduled for Week (\d+)\.$/);
  if (scheduled) {
    const concert = (game.concerts ?? []).find((item) => item.title === scheduled[1] && item.targetWeek === Number(scheduled[2]));
    if (concert && Number.isInteger(concert.targetYear) && Number.isInteger(concert.targetWeek)) {
      return `${scheduled[1]} scheduled for ${calendarLabel(concert.targetYear, concert.targetWeek)}.`;
    }
  }
  return normalized;
};
const eventConflictsForWeek = (game, week, eventType = 'meetGreet', day = null, memberIds = [], days = []) => getCampaignConflictReasons(game, {
  year: game.year,
  week,
  type: eventType,
  ...(day ? { day } : {}),
  ...(days.length ? { days } : {}),
  ...(memberIds.length ? { memberIds } : {}),
});
const EventConflictNotice = ({ game, week, eventType = 'meetGreet', day = null, memberIds = [], days = [] }) => {
  const conflicts = eventConflictsForWeek(game, week, eventType, day, memberIds, days);
  return conflicts.length ? <p className="event-conflict-warning">{calendarLabel(game.year, week)} unavailable: {conflicts.join(' ')}</p> : null;
};
const campaignMonthOptions = (game, minimumLead) => Array.from({ length: 18 }, (_, offset) => {
  const baseMonth = Math.ceil(game.week / BALANCE.weeksPerMonth) - 1 + offset;
  const year = game.year + Math.floor(baseMonth / 12);
  const month = (baseMonth % 12) + 1;
  const targetWeek = month * BALANCE.weeksPerMonth;
  return { value: `${year}-${month}`, year, month, targetWeek, absolute: absoluteWeek(year, targetWeek), label: calendarLabel(year, targetWeek) };
}).filter((option) => option.absolute - absoluteWeek(game.year, game.week) >= minimumLead);
const displayName = (member) => member.nickname || member.name.split(' ')[0];
const fanEventPlanFor = (game, memberId, day, activityId, year = game.year, week = game.week) => {
  if (activityId === 'yearEndMeetGreet') return (game.yearEndMeetGreets ?? []).find((event) => event.status !== 'cancelled' && event.year === year && event.targetWeek === week && event.day === day && (event.memberSessions ?? []).some((session) => session.memberId === memberId)) ?? null;
  const type = activityId?.startsWith?.('vc') ? 'videoCall' : activityId?.startsWith?.('mg') ? 'meetGreet' : null;
  if (!type) return null;
  return (game.fanEventPlans ?? []).find((plan) => plan.type === type && plan.year === year && plan.targetWeek === week && plan.day === day && (plan.memberIds ?? []).includes(memberId)) ?? null;
};
const birthdayLabel = (member) => Number.isFinite(member?.birthMonth) && Number.isFinite(member?.birthYear) ? `${MONTHS[member.birthMonth - 1]} ${member.birthYear}` : 'Unknown';
const birthdayMeta = (member, year = 1) => { const age = getMemberAge(member, year); return age === null ? birthdayLabel(member) : `${birthdayLabel(member)} · Age ${age}`; };
const overall = getMemberOverall;
const energyTone = (value) => value >= 60 ? 'good' : value >= 40 ? 'warn' : 'critical';
const injuryLabel = (member) => member?.injury?.weeksRemaining > 0 ? `${member.injury.label ?? member.injury.severity} injury · ${member.injury.weeksRemaining} week${member.injury.weeksRemaining === 1 ? '' : 's'} remaining` : null;
const normalizeSessionActivities = normalizeGameState;

const scheduleStatusForWeek = (game, year, week) => {
  const absolute = absoluteWeek(year, week);
  const current = absoluteWeek(game.year, game.week);
  if (absolute < current) return 'completed';
  if (absolute === current) return 'confirmed';
  return 'planned';
};

function buildScheduleCalendarEvents(game, year) {
  const events = [];
  for (let week = 1; week <= BALANCE.weeksPerYear; week += 1) {
    const snapshot = getScheduleSnapshotForWeek(game, year, week);
    const schedule = snapshot.schedule ?? {};
    const grouped = new Map();
    Object.entries(schedule).forEach(([key, activityId]) => {
      if (!activityId || activityId === 'rest') return;
      const separator = key.lastIndexOf(':');
      const memberId = key.slice(0, separator);
      const day = key.slice(separator + 1);
      const groupKey = `${activityId}:${day}`;
      const group = grouped.get(groupKey) ?? { activityId, day, memberIds: [] };
      group.memberIds.push(memberId);
      grouped.set(groupKey, group);
    });
    grouped.forEach(({ activityId, day, memberIds }) => {
      const report = (game.weeklyReports ?? []).find((item) => item.year === year && item.week === week);
      const reportActivity = report?.scheduleDetails?.find?.((item) => item.activityId === activityId && item.day === day);
      events.push({ id: `schedule-${year}-${week}-${activityId}-${day}`, type: activityId, title: BALANCE.activities[activityId]?.label ?? activityId, year, week, day, memberIds, status: snapshot.kind === 'resolved' ? 'completed' : snapshot.kind === 'confirmed' ? 'confirmed' : scheduleStatusForWeek(game, year, week), energyCost: BALANCE.activities[activityId]?.energy ?? 0, energyBefore: reportActivity?.energyBefore, energyAfter: reportActivity?.energyAfter, revenue: reportActivity?.revenue, fanGain: reportActivity?.fanGain, injury: reportActivity?.injury });
    });
  }
  (game.fanEventPlans ?? []).filter((event) => event.year === year).forEach((event) => {
    events.push({ id: event.id, type: event.type, title: event.title ?? (event.type === 'videoCall' ? 'Video Call' : 'Meet & Greet'), customTitle: Boolean(event.customTitle), year, week: event.targetWeek, day: event.day, memberIds: event.memberIds ?? [], status: event.status === 'completed' ? 'completed' : event.status === 'cancelled' ? 'cancelled' : 'planned', energyCost: BALANCE.activities[event.type === 'videoCall' ? 'vc1' : 'mg1']?.energy ?? 0, revenue: event.revenue });
  });
  (game.weeklyReports ?? []).filter((report) => report.year === year).forEach((report) => (report.fanEvents ?? []).forEach((event) => events.push({ id: `resolved-${event.id}`, type: event.type, title: event.title ?? (event.type === 'videoCall' ? 'Video Call' : 'Meet & Greet'), customTitle: Boolean(event.customTitle), year: report.year, week: report.week, day: event.day, memberIds: event.memberIds ?? [], status: 'completed', energyCost: BALANCE.activities[event.type === 'videoCall' ? 'vc1' : 'mg1']?.energy ?? 0, revenue: event.revenue })));
  (game.yearEndMeetGreets ?? []).filter((event) => event.year === year).forEach((event) => events.push({ id: event.id, type: 'yearEndMeetGreet', title: event.title ?? 'Year-end Meet & Greet', customTitle: Boolean(event.customTitle), year, week: event.targetWeek, day: event.day, memberIds: (event.memberSessions ?? []).map((session) => session.memberId), status: event.status === 'completed' ? 'completed' : event.status === 'cancelled' ? 'cancelled' : 'planned', energyCost: BALANCE.activities.yearEndMeetGreet?.energy ?? BALANCE.activities.mg1?.energy ?? 0, revenue: event.revenue }));
  (game.concerts ?? []).filter((event) => event.targetYear === year).forEach((event) => events.push({ id: event.id, type: event.eventType ?? 'concert', title: event.title ?? 'Concert', customTitle: Boolean(event.customTitle), year, week: event.targetWeek, day: event.day, memberIds: event.memberIds ?? [], status: event.status === 'completed' ? 'completed' : event.status === 'cancelled' ? 'cancelled' : 'planned', energyCost: BALANCE.activities.concert?.energy ?? 0, revenue: event.revenue }));
  (game.singles ?? []).filter((single) => single.status !== 'cancelled' && (single.productionStartYear === year || single.releaseYear === year || single.year === year)).forEach((single) => events.push({ id: single.id, type: 'mvProduction', title: single.title ?? 'MV production', customTitle: true, year, week: single.productionStartYear === year ? single.productionStartWeek : single.releaseWeek ?? single.week, day: single.productionDay, memberIds: single.memberIds ?? [], status: single.status === 'released' ? 'completed' : single.status === 'planned' ? 'planned' : 'confirmed', energyCost: BALANCE.activities.mvProduction?.energy ?? 0 }));
  (game.opportunityHistory ?? []).filter((event) => (event.resolvedYear ?? event.offeredYear) === year && event.resolvedWeek).forEach((event) => events.push({ id: `${event.id}-history`, type: event.category ?? 'opportunity', title: event.title ?? 'Opportunity', year: event.resolvedYear ?? event.offeredYear, week: event.resolvedWeek, day: event.day, memberIds: event.memberIds ?? [], status: event.accepted ? 'completed' : 'cancelled', energyCost: event.energy ?? 0, revenue: event.accepted ? event.revenue : 0, fanGain: event.accepted ? event.fansGained : 0 }));
  return events.filter((event) => Number.isInteger(event.week) && event.week >= 1 && event.week <= BALANCE.weeksPerYear).sort((first, second) => first.week - second.week || String(first.day).localeCompare(String(second.day)) || String(first.title).localeCompare(String(second.title)));
}

function ScheduleYearCalendar({ game, year = game.year, focusMonth = null, language = 'en' }) {
  const t = (value) => translate(language, value);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const events = useMemo(() => buildScheduleCalendarEvents(game, year), [game, year]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => ({ month: index + 1, events: events.filter((event) => Math.ceil(event.week / BALANCE.weeksPerMonth) === index + 1) })), [events]);
  const activeMonth = focusMonth ?? selectedMonth;
  const selectedEvents = activeMonth ? months[activeMonth - 1]?.events ?? [] : [];
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  useEffect(() => { setSelectedEventId(null); }, [focusMonth, year]);
  const memberName = (memberId) => displayName(game.members.find((member) => member.id === memberId) ?? historicalCampaignMember(game, memberId) ?? { name: memberId });
  return <section className="schedule-year-calendar" aria-label={t('Year view')}>
    <header className="schedule-year-calendar-head"><div><span className="eyebrow">{t('Full year')}</span><h2>{t(`Year ${year}`)}</h2><p>{t('Review planned, confirmed, completed, and cancelled events across the year.')}</p></div><span className="schedule-calendar-total">{events.length} {t('events')}</span></header>
    {!focusMonth ? <div className="schedule-year-grid">{months.map(({ month, events: monthEvents }) => { const counts = monthEvents.reduce((result, event) => ({ ...result, [event.type]: (result[event.type] ?? 0) + 1 }), {}); return <button type="button" key={month} className={selectedMonth === month ? 'schedule-month-card selected' : 'schedule-month-card'} onClick={() => { setSelectedMonth(month); setSelectedEventId(null); }}><strong>{t(MONTHS[month - 1])}</strong><span>{monthEvents.length} {t('events')}</span><div>{Object.entries(counts).slice(0, 4).map(([type, count]) => <small key={type}><i className={`calendar-dot ${type}`} />{t(BALANCE.activities[type]?.label ?? (type === 'videoCall' ? 'Video Call' : type === 'meetGreet' ? 'Meet & Greet' : type))} {count}</small>)}</div></button>; })}</div> : null}
    {activeMonth ? <div className="schedule-month-detail"><header><h3>{t(MONTHS[activeMonth - 1])} {year}</h3><button type="button" className="secondary-button" onClick={() => { setSelectedMonth(null); setSelectedEventId(null); }}>{t('Close')}</button></header>{selectedEvents.length ? <div className="schedule-event-list">{selectedEvents.map((event) => <button type="button" key={event.id} className="schedule-event-row" onClick={() => setSelectedEventId(event.id)}><span>{monthWeekLabel(event.week)} · {t(event.day ?? 'All days')}</span><strong data-i18n-ignore={event.customTitle ? 'true' : undefined}>{event.title}</strong><small>{t(event.status)} · {event.memberIds.length} {t('members')}</small></button>)}</div> : <p className="empty-copy">{t('No events scheduled this month.')}</p>}</div> : null}
    {selectedEvent ? <article className="schedule-event-detail"><header><div><span className="eyebrow">{t('Event detail')}</span><h3 data-i18n-ignore={selectedEvent.customTitle ? 'true' : undefined}>{selectedEvent.title}</h3></div><span className={`schedule-event-status ${selectedEvent.status}`}>{t(selectedEvent.status)}</span></header><dl><div><dt>{t('Date')}</dt><dd>{t(calendarLabel(selectedEvent.year, selectedEvent.week))} · {t(selectedEvent.day ?? 'All days')}</dd></div><div><dt>{t('Participating Members')}</dt><dd>{selectedEvent.memberIds.length ? selectedEvent.memberIds.map(memberName).join(', ') : t('Not recorded')}</dd></div><div><dt>{t('Energy Cost')}</dt><dd>{selectedEvent.energyCost ? `-${selectedEvent.energyCost}` : '0'}</dd></div>{selectedEvent.energyBefore !== undefined ? <div><dt>{t('Energy after')}</dt><dd>{selectedEvent.energyBefore} → {selectedEvent.energyAfter}</dd></div> : null}{selectedEvent.revenue !== undefined ? <div><dt>{t('Revenue')}</dt><dd>{money(selectedEvent.revenue)}</dd></div> : null}{selectedEvent.fanGain !== undefined ? <div><dt>{t('Fan gain/loss')}</dt><dd>{selectedEvent.fanGain >= 0 ? '+' : ''}{number.format(selectedEvent.fanGain)}</dd></div> : null}{selectedEvent.injury ? <div><dt>{t('Injury / unavailability')}</dt><dd>{selectedEvent.injury}</dd></div> : null}</dl></article> : null}
  </section>;
}

function Portrait({ member, size = 'medium' }) {
  const src = portraits[member.photo];
  return src ? <img className={`portrait portrait-${size}`} src={src} alt={`${member.name} portrait`} /> : <div className={`portrait portrait-${size} portrait-fallback`}>{displayName(member).slice(0, 1)}</div>;
}

const EMPTY_PARTICIPANT_LIST = Object.freeze([]);

function historicalCampaignMember(game, memberId) {
  return game.members.find((member) => member.id === memberId)
    ?? game.graduations?.find((graduation) => graduation.memberId === memberId)?.memberSnapshot
    ?? game.departures?.find((departure) => departure.memberId === memberId)?.member
    ?? game.unsignedMembers?.find((member) => member.id === memberId)
    ?? null;
}

function ParticipantDetails({ game, single = null, members = EMPTY_PARTICIPANT_LIST, participantIds = EMPTY_PARTICIPANT_LIST, participantSnapshots = EMPTY_PARTICIPANT_LIST, centerId = null, language = 'en', defaultOpen = false, summaryLabel = 'MV participants' }) {
  const t = (value) => translate(language, value);
  const snapshotsById = new Map(participantSnapshots.map((participant) => [participant.memberId, participant]));
  const resolvedCenterId = centerId ?? single?.centerId ?? null;
  const sourceParticipants = single
    ? getSingleParticipants(game, single)
    : members.length
      ? members
      : participantIds.map((memberId) => snapshotsById.get(memberId) ?? historicalCampaignMember(game, memberId) ?? { id: memberId, memberId, name: memberId });
  const participants = sourceParticipants.map((member) => ({ ...member, memberId: member.memberId ?? member.id, role: (member.memberId ?? member.id) === resolvedCenterId ? 'center' : member.role ?? 'member' }));
  if (!participants.length) return null;
  return <details className="mv-participant-details" open={defaultOpen}><summary><span>{t(summaryLabel)}</span><strong>{participants.length} {t('members')}</strong></summary><div className="mv-participant-grid">{participants.map((participant, index) => { const name = participant.nickname || participant.name; const rating = overall(participant); return <div key={participant.memberId ?? `${name}-${index}`} className={participant.role === 'center' ? 'mv-participant center' : 'mv-participant'}><Portrait member={participant} size="tiny" /><div><strong>{name}</strong><span>{participant.generation || t('Generation not recorded')} · {participant.team || 'JKT48'}</span><small>{t('Vocal')} {Math.round(participant.vocal ?? 0)} · {t('Dance')} {Math.round(participant.dance ?? 0)} · {t('Performance')} {Math.round(participant.performance ?? 0)}</small></div><span className="mv-participant-role">{t(participant.role === 'center' ? 'Center' : 'Member')}</span><b aria-label={`${t('Overall')} ${rating}`}>{rating}</b></div>; })}</div></details>;
}

function IconButton({ label, children, className = '', ...props }) {
  return <button className={`icon-button ${className}`.trim()} type="button" aria-label={label} title={label} {...props}>{children}</button>;
}

function TheaterPlanner({ game, setGame, theaterCounts }) {
  const activeDays = DAYS.filter((day) => theaterCounts[day] > 0);
  if (!activeDays.length) return null;
  const birthdayCandidates = getSeitansaiCandidates(game);
  // Helper: update theater flags for a day
  const updateFlags = (day, flags) => setGame((g) => configureTheaterSpecialFlags(g, day, flags));
  return <section className="theater-planner"><div className="theater-planner-head"><div><span className="eyebrow">Theater production</span><h3>Setlist and center</h3></div><small>Familiarity improves after every complete 12-member show. Repeating a setlist reduces its demand.</small></div><div className="theater-show-configs">{activeDays.map((day) => {
    const lineup = game.members.filter((member) => game.schedule[`${member.id}:${day}`] === 'theater');
    const fallbackCenter = [...lineup].sort((a, b) => b.performance - a.performance)[0];
    const configured = game.theaterShows?.[day] ?? {};
    const setlist = SETLIST_BY_ID[configured?.setlistId] ?? SETLISTS[0];
    const centerId = lineup.some((member) => member.id === configured?.centerId) ? configured.centerId : fallbackCenter?.id;
    const update = (setlistId, nextCenterId) => setGame((current) => configureTheaterShow(current, day, setlistId, nextCenterId));
    const averageFamiliarity = lineup.length ? Math.round(lineup.reduce((sum, member) => sum + (member.setlistFamiliarity?.[setlist.id] ?? 0), 0) / lineup.length) : 0;
    const boredom = getSetlistBoredom(game, setlist.id);
    const isSeitansai = configured.isSeitansai || false;
    const isLastShow = configured.isLastShow || false;
    const birthdayLineupMembers = birthdayCandidates.filter((candidate) => lineup.some((member) => member.id === candidate.id));
    // Prefer a birthday member who is not already assigned to another
    // Seitansai/Last Show this week. The assignment dropdown still exposes
    // the complete lineup so the existing replacement behavior remains
    // available when the user intentionally picks someone else.
    const availableBirthdayMembers = getAvailableStsLastShowMembers(game, {
      day,
      assignmentKey: 'seitansaiMemberId',
      eligibleMembers: birthdayLineupMembers,
    });
    // A Seitansai can only be assigned to a member who is actually on this day's theater lineup.
    const birthdayMembers = birthdayLineupMembers;
    const seitansaiMemberId = birthdayLineupMembers.some((candidate) => candidate.id === configured.seitansaiMemberId)
      ? configured.seitansaiMemberId
      : (availableBirthdayMembers[0]?.id ?? '');
    const graduatingMembers = getGraduationLastShowCandidates(game, day);
    const lastShowMemberId = graduatingMembers.some((candidate) => candidate.id === configured.lastShowMemberId)
      ? configured.lastShowMemberId
      : (graduatingMembers[0]?.id ?? '');
    const handleSeitansaiToggle = () => updateFlags(day, { isSeitansai: !isSeitansai, seitansaiMemberId: isSeitansai ? '' : seitansaiMemberId });
    const handleLastShowToggle = () => updateFlags(day, { isLastShow: !isLastShow, lastShowMemberId: isLastShow ? '' : lastShowMemberId });
    const handleSeitansaiMemberChange = (e) => setGame((current) => replaceTheaterSpecialAssignment(current, day, 'seitansaiMemberId', e.target.value));
    const handleLastShowMemberChange = (e) => setGame((current) => replaceTheaterSpecialAssignment(current, day, 'lastShowMemberId', e.target.value));
    return <article key={day}><img src={setlistCovers[setlist.coverFile]} alt={`${setlist.title} cover`} /><div className="theater-show-copy"><strong>{day} · {theaterCounts[day]}/12</strong><span>{setlist.songs.length} songs · {averageFamiliarity}% lineup familiarity</span>{boredom.penalty > 0 ? <span className="setlist-boredom">Demand -{Math.round(boredom.penalty * 100)}% · played {boredom.plays}x in {boredom.windowWeeks} weeks</span> : <span className="setlist-boredom rested">Rested setlist · full demand</span>}<div><label>Setlist<select value={setlist.id} onChange={(event) => update(event.target.value, centerId)}>{SETLISTS.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select></label><label>Center<select value={centerId ?? ''} disabled={!lineup.length} onChange={(event) => update(setlist.id, event.target.value)}>{lineup.map((member) => <option key={member.id} value={member.id}>{displayName(member)}</option>)}</select></label></div>{birthdayMembers.length ? <div className="theater-special-flags"><label><input type="checkbox" checked={isSeitansai} disabled={isLastShow || (!isSeitansai && !seitansaiMemberId)} onChange={handleSeitansaiToggle} /> Seitansai (birthday show)</label>{isSeitansai ? <><select value={seitansaiMemberId} onChange={handleSeitansaiMemberChange}>{birthdayMembers.map((member) => <option key={member.id} value={member.id}>{member.isActualBirthday ? displayName(member) : `${displayName(member)} (last month)`}</option>)}</select><span className="two-shot-info">2-Shot Birthday · FRL200k · 100 slots</span></> : null}</div> : null}{graduatingMembers.length ? <div className="theater-special-flags"><label><input type="checkbox" checked={isLastShow} disabled={isSeitansai} onChange={handleLastShowToggle} /> Last Show (graduation)</label>{isLastShow ? <><select value={lastShowMemberId} onChange={handleLastShowMemberChange}>{graduatingMembers.map((member) => <option key={member.id} value={member.id}>{displayName(member)}</option>)}</select><span className="two-shot-info">2-Shot Last Show · FRL200k · 100 slots</span></> : null}</div> : null}</div></article>;
  })}</div></section>;
}

   const WIKI_STATS = [
  ['Vocal', 'Improves vocal training and contributes to theater, MV, and concert performance scores.'],
  ['Dance', 'Improves dance training and contributes to theater, MV, and concert performance scores.'],
  ['Performance', 'Improves performance training and contributes to theater, MV, and concert performance scores.'],
  ['MC', 'Improves through MC training and represents speaking ability.'],
  ['Variety', 'Determines fan gains from media appearances.'],
  ['Stamina', 'Reduces activity energy cost. Higher stamina means less fatigue.'],
  ['Popularity', 'Raises Video Call and Meet & Greet demand and can grow through successful appearances.'],
  ['Energy', 'Applies a performance penalty below 60. Members recover 40 Energy after each resolved week.'],
  ['Ego', 'Raises the member weighting for drama selection from Year 2 onward. It does not improve performance.'],
  ['Potential', 'Sets the training ceiling. More room below Potential produces faster skill growth.'],
  ['Development', 'Multiplies skill gains earned from training.'],
  ['Consistency', 'Reduces random performance variance. This hidden rating is generated from the run seed.'],
  ['Adaptability', 'Improves training response and emergency lineup readiness.'],
  ['Development curve', 'Changes progression timing between early, steady, and late growth profiles.'],
  ['Momentum', 'A temporary modifier used by drama selection and event outcomes; it fades by 30% each week.'],
    ['Fanbase', 'Personal demand pool used when selling Video Call and Meet & Greet tickets.'],
    ['Traits', 'Seeded gameplay modifiers. Quick Learner improves training, Theater Specialist improves theater performance, Crowd Magnet improves audience response, Big Stage Performer is a rare stage archetype marker, Reliable Performer is a rare consistency marker, and Versatile is a rare adaptability marker.'],
];

function LegacyWiki({ game }) {
  const activityRows = Object.entries(BALANCE.activities);
  return <div className="page wiki-page">
    <section className="page-heading"><div><span className="eyebrow">Game reference</span><h1>Manager wiki</h1><p>Rules, member ratings, event income, operating costs, and timing limits used by this run.</p></div></section>
    <nav className="wiki-jump" aria-label="Wiki sections"><a href="#wiki-stats">Member stats</a><a href="#wiki-income">Income and costs</a><a href="#wiki-rules">Event rules</a><a href="#wiki-systems">Season systems</a></nav>
    <section className="wiki-section" id="wiki-stats"><div className="wiki-section-head"><span>01</span><div><h2>Member stats</h2><p>Most ratings use a 0–100 scale and are generated from the run seed.</p></div></div><div className="wiki-definition-grid">{WIKI_STATS.map(([name, description]) => <article key={name}><strong>{name}</strong><p>{description}</p></article>)}</div></section>
    <section className="wiki-section" id="wiki-income"><div className="wiki-section-head"><span>02</span><div><h2>Income and costs</h2><p>Activity costs are charged for every participating member unless noted otherwise.</p></div></div>
      <div className="wiki-callout"><CircleDollarSign size={20} /><div><strong>Weekly fixed expenses</strong><p>FRL18m general operations + theater upkeep. Management Perks can reduce both amounts.</p></div></div>
      <div className="wiki-table-wrap"><table className="wiki-table"><thead><tr><th>Activity</th><th>Energy</th><th>Cost / member</th><th>Gross income</th><th>Income rule</th></tr></thead><tbody>{activityRows.map(([id, item]) => <tr key={id}><td><strong>{item.label}</strong></td><td>{id === 'liveStream' ? `+${item.energyRecovery}` : item.energy}</td><td>{money(item.cost ?? 0)}</td><td>{id === 'theater' ? 'Attendance × ticket price' : ['liveStream','media'].includes(id) ? `Popularity × ${money(item.revenuePerPopularity)}` : id === 'offAir' ? 'Full theater gate +5-10%' : item.capacity ? `Up to ${money(item.capacity * item.ticket)}` : item.revenue ? money(item.revenue) : 'None'}</td><td>{id === 'theater' ? 'Exactly 12 members; demand is capped by theater capacity and falls when a setlist repeats.' : id.startsWith('vc') ? `${item.capacity} slots × ${money(item.ticket)} per selected member.` : id.startsWith('mg') ? `${item.capacity} slots × ${money(item.ticket)} per participating member.` : id === 'liveStream' ? 'Available every day; restores 6 Energy and adds fans based on Popularity.' : id === 'media' ? 'Income is based on the participating member’s Popularity.' : id === 'offAir' ? 'Exactly 12 members, once per week. Pays a sold-out theater night plus 5-10%.' : id === 'yearEndMeetGreet' ? 'Every active member receives the normal Meet & Greet capacity and ticket price.' : id === 'concert' ? 'Concert income comes from campaign ticket sales before the event.' : 'No direct income.'}</td></tr>)}</tbody></table></div>
      <p className="wiki-note">Live Stream pays the direct rate shown above (Popularity × FRL40k), with no additional multiplier. Video Call and Meet & Greet sales are demand-limited. Video Call favors digital and casual fans; Meet & Greet favors event and core fans. Each result stores sold tickets, sell-through, and unmet demand.</p>
    </section>
    <section className="wiki-section" id="wiki-rules"><div className="wiki-section-head"><span>03</span><div><h2>Event rules</h2><p>Scheduling limits are enforced when assignments are made.</p></div></div><div className="wiki-rule-list"><article><strong>Theater show</strong><p>Exactly 12 members must be assigned on the same day. Demand controls attendance and revenue. Familiarity, ability, crowd traits, and sell-through shape satisfaction; results record center, unit songs, understudies, and Theater EXP.</p></article><article><strong>Video Call</strong><p>Set up in Campaigns. One 75-slot Video Call per member per four-week month. Choose the participating members and event day; tickets cost FRL120k.</p></article><article><strong>Meet & Greet</strong><p>Set up in Campaigns. One 300-slot event per four-week month. Every available member participates on the chosen day; tickets cost FRL50k.</p></article><article><strong>Concert</strong><p>One concert per four-week month. Every available member participates. Choose budget, venue, title, month, and day; ticket sales close two weeks before the event and its day is locked.</p></article><article><strong>MV and single</strong><p>Production needs exactly 12 members, occupies one chosen day for four weeks, and begins five weeks before release. Views decline after launch and enter a fanbase-capped long tail from week four.</p></article><article><strong>Off-air performance</strong><p>Exactly 12 members on one day, at most once per week. It pays a sold-out theater night plus 5-10% and converts more fans than a theater show, at a higher Energy cost.</p></article><article><strong>Setlist demand</strong><p>Every time a setlist is performed it loses {Math.round(BALANCE.theater.boredomPerPlay * 100)}% theater demand for the next {BALANCE.theater.boredomWindowWeeks} weeks, up to {Math.round(BALANCE.theater.boredomMax * 100)}%. Rotating setlists keeps attendance high.</p></article><article><strong>Training</strong><p>Training improves one skill. Gains depend on Potential, Development, development curve, Adaptability, skill level, Energy, traits, trainee status, mentorship, and Management Perks.</p></article></div></section>
    <section className="wiki-section" id="wiki-systems"><div className="wiki-section-head"><span>04</span><div><h2>Season systems</h2><p>Long-term rules that shape roster and theater management.</p></div></div><div className="wiki-rule-list"><article><strong>Energy and performance</strong><p>Stamina reduces fatigue. Performance is full at 60+ Energy, 95% at 40–59, 85% at 20–39, and 70% below 20. Active members recover 40 Energy weekly.</p></article><article><strong>Fans and narratives</strong><p>Core, casual, general-public, digital, event, oshi, and group fan pools respond differently to activities. Faction sentiment, personal fan composition, event demand, and history-derived narratives persist.</p></article><article><strong>Annual fan target</strong><p>Year 1 targets 100,000 fans. A missed target carries forward unchanged each year until achieved. After achievement, the next year's target increases by 120% to 2.2 times the completed target. Missing it never ends the run; the result changes Fan Trust, Reputation, annual grade, and Management Token reward.</p></article><article><strong>Fan growth soft cap</strong><p>Positive gains use x1 below target, x0.75 at 100–110%, x0.40 at 110–120%, x0.15 at 120–130%, and x0.05 above 130%. Media, MV, concerts, anniversary concerts, and viral events resist part of this reduction. Fan losses are never reduced.</p></article><article><strong>Auditions and trainees</strong><p>A five-week Q4 audition presents exactly 12 system-selected candidates. Review every exact stat, then explicitly confirm zero to six recruits; only confirmed recruits leave the pool and join as trainees.</p></article><article><strong>Drama and opportunities</strong><p>Member drama requires a management response. Let it pass without punishment, choose a suspension duration, or release the member; only suspensions refund affected fan-event tickets and replace unavailable campaign members. New management offers have a 24% chance to appear after each resolved week and expire after two weeks.</p></article><article><strong>Graduation</strong><p>Year 1 is protected. From Year 2 onward, each season receives a seeded target of exactly four or six graduations after tenure eligibility is calculated. A four-graduation target guarantees one announcement attempt per quarter; a six-graduation target guarantees one attempt per two-month period. Only one member can graduate in each four-week calendar month; colliding departure dates move to the next free month. If a selected member is already in a campaign, departure is set to one week after that campaign finishes. Announced graduates cannot join new campaigns; already-confirmed commitments may finish through the departure date. The minimum roster floor, farewell preparation, and two-year audition-pool return remain active.</p></article><article><strong>Annual rhythm</strong><p>Each year has 12 four-week months. Q4 contains auditions, year-end events, renovation, and a persistent annual management review.</p></article><article><strong>Run end</strong><p>Runs have no fixed year limit. They end through roster failure, sustained financial or reputation collapse, or a manual decision. The final record awards Management Token.</p></article><article><strong>Management Perks</strong><p>Each perk has five permanent levels. Equip exactly three before a run; their current levels and effects are snapshotted and locked for that timeline.</p></article></div></section>
  </div>;
}

function Wiki({ game, language = 'en', onReplayTutorial = null }) {
  const id = language === 'id';
  const text = (en, indonesian) => {
    const replacements = {
      'Year 1 targets 162,500 fans. Each next target uses the previous target, growing by 35%, 40%, then 45% from Year 4 onward. Missing it never ends the run; the result changes Fan Trust, Reputation, annual grade, and Management Token reward.': 'Year 1 target is 100,000 fans. Each following target adds +120% to the previous target, making it 2.2 times larger. Missing it never ends the run; the result changes Fan Trust, Reputation, annual grade, and Management Token reward.',
      'A five-week Q4 audition draws real identities from the members left after the founding 12. Selected candidates leave that pool and join as trainees. Trainees progress through tenure, training, and theater milestones; promotion is manual, and an eligible Veteran can provide an eight-week mentorship.': `A five-week Q4 audition draws real identities from the members left after the founding ${BALANCE.foundingRosterSize}. Selected candidates leave that pool and join as trainees. Trainees progress through tenure, training, and theater milestones; promotion is manual, and an eligible Veteran can provide an eight-week mentorship.`,
    };
    return id ? indonesian : replacements[en] ?? en;
  };
  const stats = [
    ['Vocal', 'Vokal', 'Training and stage skill for vocal-heavy units and performances.', 'Kemampuan latihan dan panggung untuk unit serta penampilan yang menonjolkan vokal.'],
    ['Dance', 'Tari', 'Training and stage skill for choreography and performance scores.', 'Kemampuan latihan dan panggung untuk koreografi dan skor penampilan.'],
    ['Performance', 'Penampilan', 'Core stage score used by theater, MV, and concert results.', 'Skor panggung utama untuk hasil teater, MV, dan konser.'],
    ['MC / Variety', 'MC / Varietas', 'MC supports speaking outcomes; Variety drives media response and demand.', 'MC mendukung hasil berbicara; Varietas mendorong respons media dan permintaan.'],
    ['Stamina', 'Stamina', `Reduces activity fatigue. Current formula: base ${BALANCE.stamina.costBase} − ${BALANCE.stamina.costPerPoint} per Stamina, never below ${BALANCE.stamina.costFloor}.`, `Mengurangi kelelahan aktivitas. Rumus saat ini: dasar ${BALANCE.stamina.costBase} − ${BALANCE.stamina.costPerPoint} per Stamina, tidak pernah di bawah ${BALANCE.stamina.costFloor}.`],
    ['Popularity', 'Popularitas', 'Raises event demand, media income, and public response.', 'Menaikkan permintaan acara, pendapatan media, dan respons publik.'],
    ['Ego', 'Ego', 'Hidden drama-weighting stat from Year 2 onward; it does not increase performance.', 'Nilai tersembunyi yang memengaruhi bobot drama mulai Tahun 2; tidak menaikkan penampilan.'],
    ['Momentum', 'Momentum', 'Temporary boost used by event outcomes and drama selection; it fades each resolved week.', 'Bonus sementara untuk hasil acara dan pemilihan drama; berkurang setiap minggu yang diselesaikan.'],
    ['Fan composition', 'Komposisi penggemar', 'Core, Casual, Digital, and Event shares change which events create demand.', 'Porsi Core, Casual, Digital, dan Event mengubah acara mana yang menghasilkan permintaan.'],
    ['Energy', 'Energi', '60+ is full performance; 40–59 is 95%; 20–39 is 85%; below 20 is 70%.', '60+ memberi penampilan penuh; 40–59 menjadi 95%; 20–39 menjadi 85%; di bawah 20 menjadi 70%.'],
    ['Potential / Development', 'Potensi / Perkembangan', 'Hidden ceiling and growth multiplier for training.', 'Batas tersembunyi dan pengali pertumbuhan latihan.'],
    ['Consistency / Adaptability', 'Konsistensi / Adaptabilitas', 'Hidden seeded ratings: Consistency reduces variance; Adaptability improves emergency readiness and understudy value.', 'Nilai seed tersembunyi: Konsistensi mengurangi variasi; Adaptabilitas meningkatkan kesiapan darurat dan nilai understudy.'],
    ['Traits', 'Sifat', 'Seeded gameplay modifiers: Quick Learner improves training; Theater Specialist improves theater performance; Crowd Magnet improves audience response. Big Stage Performer adds 10% concert performance, Reliable Performer reduces performance variance, and Versatile adds 8% adaptability when training a non-lowest skill.', 'Pengubah permainan dari seed: Quick Learner meningkatkan latihan; Theater Specialist meningkatkan penampilan teater; Crowd Magnet meningkatkan respons penonton. Big Stage Performer menambah 10% penampilan konser, Reliable Performer mengurangi variasi penampilan, dan Versatile menambah 8% adaptabilitas saat melatih kemampuan yang bukan terendah.'],
  ];
  const offAirPremium = Math.round(BALANCE.activities.offAir.theaterRevenuePremium[0] * 100) + '–' + Math.round(BALANCE.activities.offAir.theaterRevenuePremium[1] * 100) + '%';
  const incomeRows = [
    [text('Campaign reward concert / MV', 'Konser / MV hadiah kampanye'), text('Sousenkyo, Request Hour, and Janken rewards use a configured concert budget, then a configured four-week MV budget after the result concert.', 'Hadiah Sousenkyo, Request Hour, dan Janken memakai anggaran konser yang dipilih, lalu anggaran MV empat minggu setelah konser hasil.'), text('Concert and MV reward work is scheduled above Video Call and template work; selected budgets are charged when each stage starts.', 'Konser dan MV hadiah dijadwalkan di atas Video Call dan template; anggaran terpilih dibebankan saat setiap tahap dimulai.')],
    [text('Theater show', 'Pertunjukan teater'), game?.theater ? text('Attendance × ' + money(game.theater.ticketPrice) + ' ticket; ' + number.format(game.theater.capacity) + '-seat capacity.', 'Kehadiran × tiket ' + money(game.theater.ticketPrice) + '; kapasitas ' + number.format(game.theater.capacity) + ' kursi.') : text('Attendance × chosen theater ticket price; capacity is set by the theater.', 'Kehadiran × harga tiket teater yang dipilih; kapasitas ditentukan teater.'), text('Exactly ' + BALANCE.theaterMinimumMembers + ' members; ' + money(BALANCE.activities.theater.cost) + ' cost per member.', 'Tepat ' + BALANCE.theaterMinimumMembers + ' anggota; biaya ' + money(BALANCE.activities.theater.cost) + ' per anggota.')],
    [text('Off-air performance', 'Penampilan off-air'), text('Full theater gate plus a seeded ' + offAirPremium + ' premium.', 'Pendapatan penuh teater ditambah premium seed ' + offAirPremium + '.'), text('Exactly ' + BALANCE.activities.offAir.requiredMembers + ' members; maximum ' + BALANCE.activities.offAir.maxPerWeek + ' per week; ' + money(BALANCE.activities.offAir.cost) + ' cost per member.', 'Tepat ' + BALANCE.activities.offAir.requiredMembers + ' anggota; maksimal ' + BALANCE.activities.offAir.maxPerWeek + ' kali per minggu; biaya ' + money(BALANCE.activities.offAir.cost) + ' per anggota.')],
    [text('Media appearance', 'Penampilan media'), text('Participating member Popularity × ' + money(BALANCE.activities.media.revenuePerPopularity) + '.', 'Popularitas anggota yang ikut × ' + money(BALANCE.activities.media.revenuePerPopularity) + '.'), text(money(BALANCE.activities.media.cost) + ' cost per member.', 'Biaya ' + money(BALANCE.activities.media.cost) + ' per anggota.')],
    [text('Live Stream', 'Live Stream'), text('Participating member Popularity × ' + money(BALANCE.activities.liveStream.revenuePerPopularity) + '; also adds fans. This is the direct rate with no additional multiplier.', 'Popularitas anggota yang ikut × ' + money(BALANCE.activities.liveStream.revenuePerPopularity) + '; juga menambah penggemar. Ini adalah nilai langsung tanpa pengali tambahan.'), text(money(BALANCE.activities.liveStream.cost) + ' cost; restores ' + BALANCE.activities.liveStream.energyRecovery + ' Energy.', 'Biaya ' + money(BALANCE.activities.liveStream.cost) + '; memulihkan ' + BALANCE.activities.liveStream.energyRecovery + ' Energi.')],
    [text('Video Call', 'Panggilan Video'), text('Sold tickets × ' + money(BALANCE.activities.vc1.ticket) + '.', 'Tiket terjual × ' + money(BALANCE.activities.vc1.ticket) + '.'), text(BALANCE.activities.vc1.capacity + ' slots per member; ' + money(BALANCE.activities.vc1.cost) + ' cost per member.', BALANCE.activities.vc1.capacity + ' slot per anggota; biaya ' + money(BALANCE.activities.vc1.cost) + ' per anggota.')],
    [text('Meet & Greet', 'Meet & Greet'), text('Sold tickets × ' + money(BALANCE.activities.mg1.ticket) + '.', 'Tiket terjual × ' + money(BALANCE.activities.mg1.ticket) + '.'), text(BALANCE.activities.mg1.capacity + ' slots per member; ' + money(BALANCE.activities.mg1.cost) + ' cost per member.', BALANCE.activities.mg1.capacity + ' slot per anggota; biaya ' + money(BALANCE.activities.mg1.cost) + ' per anggota.')],
    [text('2Shot roulette', '2Shot roulette'), text('Sold tickets × ' + money(BALANCE.twoShot.roulette.ticket) + '.', 'Tiket terjual × ' + money(BALANCE.twoShot.roulette.ticket) + '.'), text(BALANCE.twoShot.roulette.slotsPerMember + ' slots per theater member.', BALANCE.twoShot.roulette.slotsPerMember + ' slot per anggota teater.')],
    [text('2Shot Meet & Greet', '2Shot Meet & Greet'), text('Sold tickets × ' + money(BALANCE.twoShot.meetGreet.ticket) + '.', 'Tiket terjual × ' + money(BALANCE.twoShot.meetGreet.ticket) + '.'), text(BALANCE.twoShot.meetGreet.slotsPerEvent + ' premium slots per event.', BALANCE.twoShot.meetGreet.slotsPerEvent + ' slot premium per acara.')],
    [text('2Shot Birthday', '2Shot Ulang Tahun'), text('Sold tickets × FRL200k.', 'Tiket terjual × FRL200 ribu.'), text('Only during a Seitansai theater show; 100 slots.', 'Hanya saat pertunjukan teater Seitansai; 100 slot.')],
    [text('2Shot Last Show', '2Shot Pertunjukan Terakhir'), text('Sold tickets × FRL200k.', 'Tiket terjual × FRL200 ribu.'), text('Only during a marked final theater show; 100 slots.', 'Hanya saat pertunjukan teater terakhir yang ditandai; 100 slot.')],
    [text('Year-end Meet & Greet', 'Meet & Greet Akhir Tahun'), text('Sold tickets × ' + money(BALANCE.activities.yearEndMeetGreet.ticket) + '.', 'Tiket terjual × ' + money(BALANCE.activities.yearEndMeetGreet.ticket) + '.'), text('Q4 event; sales begin before the target week and use 300 slots per member.', 'Acara Q4; penjualan dimulai sebelum minggu target dan memakai 300 slot per anggota.')],
    [text('Concert', 'Konser'), text('Campaign ticket sales before the event; demand and venue capacity cap sales.', 'Penjualan tiket kampanye sebelum acara; permintaan dan kapasitas venue membatasi penjualan.'), text('Production starts at ' + money(CONCERT_BUDGETS[0].cost) + ' and adds venue cost.', 'Produksi mulai dari ' + money(CONCERT_BUDGETS[0].cost) + ' ditambah biaya venue.')],
    [text('Annual campaign voting', 'Voting kampanye tahunan'), text('Sousenkyo, Request Hour, and Janken support generates weekly votes and fan revenue at FRL5k–10k per vote based on Fan Trust and Reputation.', 'Dukungan Sousenkyo, Request Hour, dan Janken menghasilkan suara mingguan serta pendapatan penggemar FRL5k–10k per suara berdasarkan Kepercayaan Penggemar dan Reputasi.'), text('Campaigns are optional; held campaigns last 8–16 weeks. Request Hour winner receives exactly four MV production weeks.', 'Kampanye bersifat opsional; kampanye yang diadakan berlangsung 8–16 minggu. Pemenang Request Hour mendapat tepat empat minggu produksi MV.')],
    [text('Management opportunity', 'Peluang manajemen'), text('A new offer has a 24% chance to appear after each resolved week; revenue is paid after any category-specific Management Perk.', 'Tawaran baru memiliki peluang 24% muncul setelah setiap minggu selesai; pendapatan dibayarkan setelah bonus manajemen kategori diterapkan.'), text('Accept before the two-week deadline; offer cost is paid immediately and revenue is recorded in Statistics.', 'Terima sebelum tenggat dua minggu; biaya tawaran dibayar langsung dan pendapatan dicatat di Statistik.')],
    [text('Graduation merchandise', 'Merchandise kelulusan'), text('FRL18m when prepared farewell merchandise completes.', 'FRL18 juta saat merchandise perpisahan yang disiapkan selesai.'), text('Requires a prepared graduation plan; recorded under Other income.', 'Membutuhkan rencana kelulusan yang disiapkan; dicatat sebagai Pendapatan lain.')],
  ];
  incomeRows[incomeRows.findIndex(([source]) => source === text('Concert', 'Konser'))] = [text('Concert', 'Konser'), text('Campaign ticket sales before the event; demand and venue capacity cap sales.', 'Penjualan tiket kampanye sebelum acara; permintaan dan kapasitas venue membatasi penjualan.'), text(`Production starts at ${money(CONCERT_BUDGETS[0].cost)}. Static venues cost ${money(CONCERT_VENUES[0].cost)}, ${money(CONCERT_VENUES[1].cost)}, or ${money(CONCERT_VENUES[2].cost)} before perks.`, `Produksi mulai dari ${money(CONCERT_BUDGETS[0].cost)}. Venue statis berharga ${money(CONCERT_VENUES[0].cost)}, ${money(CONCERT_VENUES[1].cost)}, atau ${money(CONCERT_VENUES[2].cost)} sebelum bonus.`)];
  incomeRows[incomeRows.findIndex(([source]) => source === text('Annual campaign voting', 'Voting kampanye tahunan'))] = [text('Annual campaign voting', 'Voting kampanye tahunan'), text('Each active Sousenkyo or Request Hour voting week generates exactly 7–15% of the current fanbase as votes, with FRL5k–10k revenue per vote based on Fan Trust and Reputation. Janken is luck-only and generates no votes.', 'Setiap minggu voting Sousenkyo atau Request Hour yang aktif menghasilkan suara tepat 7–15% dari basis penggemar saat ini, dengan pendapatan FRL5–10 ribu per suara berdasarkan Kepercayaan Penggemar dan Reputasi. Janken hanya mengandalkan keberuntungan dan tidak menghasilkan suara.'), text('Sousenkyo distributes votes by member strength and sentiment; Request Hour distributes them randomly among eligible songs.', 'Sousenkyo membagikan suara berdasarkan kekuatan dan sentimen anggota; Request Hour membagikannya secara acak ke lagu yang memenuhi syarat.')];
  incomeRows[incomeRows.findIndex(([source]) => source === text('Concert', 'Konser'))] = [text('Concert', 'Konser'), text('Campaign ticket sales before the event; demand and venue capacity cap sales.', 'Penjualan tiket kampanye sebelum acara; permintaan dan kapasitas venue membatasi penjualan.'), text('Up to four regular concerts per year, one per quarter; Q4 is reserved for the Anniversary Concert. Venue cost is 2x the base price, then production is 65%/75%/85% of that doubled venue cost for Lean/Standard/Major. Year 1 adds 0%; Year 2 10%; Year 3 15%; each later year adds one point.', 'Maksimal empat konser reguler per tahun, satu per kuartal; Q4 dicadangkan untuk Konser Hari Jadi. Biaya venue adalah 2x harga dasar, lalu produksi sebesar 65%/75%/85% dari biaya venue yang digandakan untuk Lean/Standard/Major. Tahun 1 bertambah 0%; Tahun 2 10%; Tahun 3 15%; tahun berikutnya bertambah satu poin.')];
  const demandRows = [
    [text('Theater', 'Teater'), text('Group fans, group popularity, lineup fanbase/popularity, center, momentum, positive narratives, familiarity, and recent exposure.', 'Penggemar grup, popularitas grup, basis penggemar/popularitas lineup, center, momentum, narasi positif, familiaritas, dan paparan terbaru.'), text('Use exactly 12 available members; choose a rested setlist, strong center, varied lineup, and avoid repeating the same setlist.', 'Gunakan tepat 12 anggota yang tersedia; pilih setlist yang cukup istirahat, center kuat, lineup beragam, dan hindari pengulangan setlist.'), text('Attendance × theater ticket price; capacity is the hard ceiling.', 'Kehadiran × harga tiket teater; kapasitas adalah batas mutlak.')],
    [text('Video Call', 'Panggilan Video'), text('Member fanbase and popularity, weighted toward Digital and Casual fans.', 'Basis penggemar dan popularitas anggota, dengan bobot lebih besar pada penggemar Digital dan Casual.'), text(`Schedule one per member per four-week month. Each member has ${BALANCE.activities.vc1.capacity} slots at ${money(BALANCE.activities.vc1.ticket)}.`, `Jadwalkan satu per anggota per bulan empat minggu. Setiap anggota memiliki ${BALANCE.activities.vc1.capacity} slot dengan harga ${money(BALANCE.activities.vc1.ticket)}.`), text('Sold tickets × ticket price; unsold demand is recorded as unmet demand.', 'Tiket terjual × harga tiket; permintaan yang tidak terpenuhi tetap dicatat.')],
    [text('Meet & Greet', 'Meet & Greet'), text('Member fanbase and popularity, weighted toward Event and Core fans.', 'Basis penggemar dan popularitas anggota, dengan bobot lebih besar pada penggemar Event dan Core.'), text(`Schedule one event per four-week month. All available members participate; capacity is ${BALANCE.activities.mg1.capacity} at ${money(BALANCE.activities.mg1.ticket)} per ticket.`, `Jadwalkan satu acara per bulan empat minggu. Semua anggota yang tersedia ikut; kapasitas ${BALANCE.activities.mg1.capacity} dengan harga ${money(BALANCE.activities.mg1.ticket)} per tiket.`), text('Sold tickets are capped by event capacity.', 'Tiket terjual dibatasi oleh kapasitas acara.')],
    [text('2Shot roulette', '2Shot roulette'), text('Theater lineup event demand; separate from theater gate revenue.', 'Permintaan acara dalam lineup teater; terpisah dari pendapatan tiket teater.'), text(`Complete a 12-member theater show. Each member adds ${BALANCE.twoShot.roulette.slotsPerMember} cheaper slots at ${money(BALANCE.twoShot.roulette.ticket)}.`, `Selesaikan pertunjukan teater dengan 12 anggota. Setiap anggota menambah ${BALANCE.twoShot.roulette.slotsPerMember} slot murah seharga ${money(BALANCE.twoShot.roulette.ticket)}.`), text('Sold 2Shot tickets are added to weekly 2Shot income.', 'Tiket 2Shot terjual ditambahkan ke pendapatan 2Shot mingguan.')],
    [text('2Shot Meet & Greet', '2Shot Meet & Greet'), text('Event-demand roll from the participating Meet & Greet lineup.', 'Perhitungan permintaan acara dari lineup Meet & Greet yang ikut.'), text(`Schedule a valid Meet & Greet. The event has ${BALANCE.twoShot.meetGreet.slotsPerEvent} premium slots at ${money(BALANCE.twoShot.meetGreet.ticket)}.`, `Jadwalkan Meet & Greet yang valid. Acara memiliki ${BALANCE.twoShot.meetGreet.slotsPerEvent} slot premium seharga ${money(BALANCE.twoShot.meetGreet.ticket)}.`), text('Sold tickets are capped by the 150-slot event.', 'Tiket terjual dibatasi oleh acara 150 slot.')],
  ];
  incomeRows.push([text('Concert cost rules', 'Aturan biaya konser'), text('Up to four regular concerts may be held each year, one per quarter; Q4 is reserved for the Anniversary Concert. Venue cost is 2× the base venue price. Lean, Standard, and Major production costs are 65%, 75%, and 85% of the doubled venue price. Yearly escalation is 0% in Year 1, 10% in Year 2, 15% in Year 3, then +1 percentage point each year.', 'Maksimal empat konser reguler dapat diadakan setiap tahun, satu per kuartal; Q4 dicadangkan untuk Konser Hari Jadi. Biaya venue adalah 2× harga dasar. Biaya produksi Lean, Standard, dan Major adalah 65%, 75%, dan 85% dari biaya venue yang sudah digandakan. Kenaikan tahunan 0% pada Tahun 1, 10% pada Tahun 2, 15% pada Tahun 3, lalu bertambah 1 poin persentase setiap tahun.'), text('Selected budget and venue are charged when the concert is announced. Perks are applied after the doubled and escalated base amounts.', 'Anggaran dan venue pilihan dibebankan saat konser diumumkan. Bonus diterapkan setelah biaya dasar digandakan dan dinaikkan sesuai tahun.')]);
  const rules = [
    [text('Run-ending conditions', 'Kondisi akhir permainan'), text(`A run ends immediately when fewer than ${BALANCE.theaterMinimumMembers} theater-eligible members remain. Hard mode also ends after more than ${BALANCE.salary.unpaidMonthsToEnd} months of unpaid current salary. A run ends after four consecutive resolved weeks with negative cash, Fan Trust below 5, or Reputation below 5; after eight consecutive resolved weeks below 20,000 fans; or when management chooses End Run. Returning to non-negative cash, Fan Trust 5+, Reputation 5+, or 20,000+ fans resets that condition's consecutive-week counter.`, `Permainan langsung berakhir ketika anggota yang memenuhi syarat untuk teater kurang dari ${BALANCE.theaterMinimumMembers}. Mode sulit juga berakhir setelah gaji berjalan tidak dibayar selama lebih dari ${BALANCE.salary.unpaidMonthsToEnd} bulan. Permainan berakhir setelah empat minggu terselesaikan berturut-turut dengan saldo negatif, Kepercayaan Penggemar di bawah 5, atau Reputasi di bawah 5; setelah delapan minggu terselesaikan berturut-turut dengan penggemar di bawah 20.000; atau ketika manajemen memilih Akhiri Permainan. Saldo kembali nol atau positif, Kepercayaan Penggemar 5+, Reputasi 5+, atau penggemar 20.000+ akan mereset penghitung minggu berturut-turut untuk kondisi tersebut.`)],
    [text('Demand fulfillment checklist', 'Checklist memenuhi permintaan'), text('Demand is not a promise of sales. Match the correct fan faction, keep members rested, protect capacity, and avoid repeated setlists. Unmet demand means the audience wanted more than the available slots or seats.', 'Permintaan bukan jaminan penjualan. Cocokkan faksi penggemar yang tepat, jaga energi anggota, lindungi kapasitas, dan hindari setlist berulang. Permintaan tidak terpenuhi berarti audiens menginginkan lebih banyak daripada slot atau kursi yang tersedia.')],
    [text('Stamina and recovery', 'Stamina dan pemulihan'), text(`Stamina scales fatigue and recovery. Rest restores ${BALANCE.activities.rest.energyRecovery} base Energy; Live Stream restores ${BALANCE.activities.liveStream.energyRecovery}; weekly passive recovery is ${BALANCE.weeklyRecovery}, all multiplied by Stamina and perks.`, `Stamina mengatur kelelahan dan pemulihan. Istirahat memulihkan ${BALANCE.activities.rest.energyRecovery} Energi dasar; Live Stream memulihkan ${BALANCE.activities.liveStream.energyRecovery}; pemulihan pasif mingguan ${BALANCE.weeklyRecovery}, semuanya dikalikan Stamina dan bonus.`)],
    [text('Boredom and familiarity', 'Kebosanan dan familiaritas'), text(`A setlist loses ${Math.round(BALANCE.theater.boredomPerPlay * 100)}% theater demand per recent play, capped at ${Math.round(BALANCE.theater.boredomMax * 100)}% over ${BALANCE.theater.boredomWindowWeeks} weeks. Complete shows raise lineup familiarity and Theater EXP.`, `Setlist kehilangan ${Math.round(BALANCE.theater.boredomPerPlay * 100)}% permintaan teater setiap kali dimainkan baru-baru ini, maksimal ${Math.round(BALANCE.theater.boredomMax * 100)}% selama ${BALANCE.theater.boredomWindowWeeks} minggu. Pertunjukan lengkap menaikkan familiaritas lineup dan EXP Teater.`)],
    [text('Injury', 'Cedera'), text(`Overloading activities above load ${BALANCE.injury.loadThreshold}, especially below ${BALANCE.injury.lowEnergyThreshold} Energy, can cause Minor, Moderate, or Severe injury. Injured members still count toward the 12-member roster minimum but blocked activities are skipped during recovery.`, `Beban aktivitas di atas load ${BALANCE.injury.loadThreshold}, terutama saat Energi di bawah ${BALANCE.injury.lowEnergyThreshold}, dapat menyebabkan cedera Ringan, Sedang, atau Berat. Anggota cedera tetap dihitung untuk minimum 12 anggota, tetapi aktivitas yang diblokir dilewati selama pemulihan.`)],
     [text('Hard mode stat roll', 'Roll statistik mode sulit'), text('Hard mode also changes founding stat generation. Core skills roll from 40–60 instead of 38–82, and archetype boosts roll from +5–10 instead of +8–18. Identity, traits, hidden profile, and RNG seed remain stable per member.', 'Mode sulit juga mengubah pembuatan statistik awal. Kemampuan inti diacak dari 40–60, bukan 38–82, dan bonus arketipe diacak dari +5–10, bukan +8–18. Identitas, sifat, profil tersembunyi, dan seed RNG tetap stabil untuk setiap anggota.')],
     [text('Normal mode economy', 'Ekonomi mode normal'), text(`Normal mode charges monthly salary directly (${money(BALANCE.salary.regular)} regular / ${money(BALANCE.salary.trainee)} trainee, +${BALANCE.salary.annualIncreasePercent}% yearly). Salary never becomes arrears; insufficient cash produces a negative balance governed by sustained-bankruptcy rules.`, `Mode normal membebankan gaji bulanan secara langsung (${money(BALANCE.salary.regular)} anggota reguler / ${money(BALANCE.salary.trainee)} trainee, naik ${BALANCE.salary.annualIncreasePercent}% per tahun). Gaji tidak menjadi tunggakan; uang yang tidak cukup menghasilkan saldo negatif yang mengikuti aturan kebangkrutan berkelanjutan.`)],
     [text('Hard mode economy', 'Ekonomi mode sulit'), text(`Hard mode charges higher monthly salary (${money(BALANCE.salary.hardModeRegular)} regular / ${money(BALANCE.salary.hardModeTrainee)} trainee, +${BALANCE.salary.annualIncreasePercent}% yearly), plus theater upkeep, operations, arrears, predatory loans, and birthday obligations. Settlement priority is salary, theater upkeep, then operations; more than two months of unpaid current salary ends the run.`, `Mode sulit membebankan gaji bulanan lebih tinggi (${money(BALANCE.salary.hardModeRegular)} anggota reguler / ${money(BALANCE.salary.hardModeTrainee)} trainee, naik ${BALANCE.salary.annualIncreasePercent}% per tahun), ditambah biaya teater, operasional, tunggakan, pinjaman predatori, dan kewajiban ulang tahun. Prioritas pembayaran adalah gaji, biaya teater, lalu operasional; gaji berjalan yang tidak dibayar lebih dari dua bulan mengakhiri permainan.`)],
    [text('Birthday and Seitansai', 'Ulang tahun dan Seitansai'), text('Every member receives a seeded fictional birth month and year. In hard mode, a member whose birthday falls in the current month creates a Seitansai obligation due within roughly two weeks; fulfill it with a theater appearance or lose trust and Oshi sentiment. December birthdays before a new run are exempt during Year 1 January.', 'Setiap anggota mendapat bulan dan tahun lahir fiktif dari seed. Dalam mode sulit, anggota yang ulang tahunnya jatuh bulan ini membuat kewajiban Seitansai yang jatuh tempo sekitar dua minggu; penuhi dengan penampilan teater atau kehilangan kepercayaan dan sentimen Oshi. Ulang tahun bulan Desember sebelum permainan baru dibebaskan selama Januari Tahun 1.')],
    [text('Roster, auditions, and idle members', 'Roster, audisi, dan anggota terabaikan'), text('Active, Ex-member, or All-member scope is selected before founding. The same scope supplies the audition pool. Members who receive no theater, training, media, or event participation gain graduation weight from Year 2 onward.', 'Cakupan Aktif, Ex-member, atau Semua dipilih sebelum pembentukan. Cakupan yang sama memasok pool audisi. Anggota yang tidak menerima teater, latihan, media, atau partisipasi acara mendapat bobot kelulusan lebih tinggi mulai Tahun 2.')],
    [text('Drama and management risk', 'Drama dan risiko manajemen'), text('Member drama waits for a management response. Let it pass without punishment, choose a suspension duration, or release the member; only suspension creates unavailability and affected-event refunds. From Year 2, management drama can reduce Fan Trust and Reputation.', 'Drama anggota menunggu respons manajemen. Biarkan berlalu tanpa hukuman, pilih durasi penangguhan, atau keluarkan anggota; hanya penangguhan yang membuat anggota tidak tersedia dan memicu pengembalian dana acara terdampak. Mulai Tahun 2, drama manajemen dapat mengurangi Kepercayaan Penggemar dan Reputasi.')],
     [text('Fan target growth', 'Pertumbuhan target penggemar'), text('Year 1 target is 100,000 fans. Each following target adds +120% to the previous target, making it 2.2 times larger.', 'Target Tahun 1 adalah 100.000 penggemar. Setiap target berikutnya menambah +120% dari target sebelumnya, sehingga menjadi 2,2 kali lebih besar.')],
     [text('Fan target soft cap', 'Batas lunak target penggemar'), text('Positive fan gains are reduced after reaching target bands; media, MV, concerts, and viral outcomes resist part of the cap. Fan losses are never softened.', 'Kenaikan penggemar positif berkurang setelah melewati batas target; media, MV, konser, dan hasil viral menahan sebagian batas ini. Penurunan penggemar tidak pernah dikurangi.')],
    [text('Chemistry and narratives', 'Chemistry dan narasi'), text('Pair chemistry affects stage, performance, MC, and unit outcomes. Positive and negative narratives persist for a limited window and can lift or reduce demand and trust.', 'Chemistry pasangan memengaruhi hasil panggung, penampilan, MC, dan unit. Narasi positif dan negatif bertahan selama jangka waktu tertentu dan dapat menaikkan atau menurunkan permintaan serta kepercayaan.')],
     [text('Opportunities and perks', 'Peluang dan bonus'), text('A management opportunity rolls at 24% after each resolved week and expires after two weeks. Management Perks are equipped before a run and modify exact systems such as costs, recovery, scouting, demand, or fan conversion.', 'Peluang manajemen diacak dengan peluang 24% setelah setiap minggu selesai dan kedaluwarsa setelah dua minggu. Bonus manajemen dipasang sebelum permainan dan mengubah sistem tertentu seperti biaya, pemulihan, pencarian kandidat, permintaan, atau konversi penggemar.')],
      [text('Unexplained mechanics', 'Mekanik yang belum dijelaskan'), text('Some systems stay partly hidden by design: seeded RNG, chemistry, drama weighting, narrative generation, demand rolls, injury severity, graduation weighting, event conflict checks, and captain effects. The wiki explains known inputs and visible consequences, but not every roll or future event. This preserves uncertainty without making outcomes arbitrary.', 'Sebagian sistem sengaja tetap tersembunyi: RNG dari seed, chemistry, bobot drama, pembuatan narasi, perhitungan permintaan, tingkat cedera, bobot kelulusan, pemeriksaan konflik acara, dan efek kapten. Wiki menjelaskan input yang diketahui serta dampak yang terlihat, tetapi tidak setiap perhitungan atau kejadian masa depan. Hal ini mempertahankan ketidakpastian tanpa membuat hasil menjadi sewenang-wenang.')],
  ];
  rules.push([
    text('Campaign reward concerts', 'Konser hadiah kampanye'),
    text('Request Hour accepts votes for all eligible songs, then uses your chosen Top 30 or Top 40 for its reward concert. The lowest selected rank opens the concert and #1 closes it. Sousenkyo #1 is the Senbatsu MV song and #2 is the Under Girls MV song when available; Janken #1 is the winner\'s MV reward song.', 'Request Hour menerima suara untuk semua lagu yang memenuhi syarat, lalu memakai Top 30 atau Top 40 pilihan Anda untuk konser hadiah. Peringkat terendah yang dipilih membuka konser dan #1 menutupnya. #1 Sousenkyo adalah lagu MV Senbatsu dan #2 adalah lagu MV Under Girls jika tersedia; #1 Janken adalah lagu hadiah MV pemenang.'),
  ]);
  rules.splice(rules.length - 1, 0,
    [text('MV Auto Fill and schedule templates', 'Isi Otomatis MV dan templat jadwal'), text('MV Auto Fill ranks eligible members by an equal blend of Overall and Popularity, then breaks ties by Overall, Popularity, name, and ID. Schedule templates save member assignments plus theater setlists and centers; unavailable saved centers are replaced by the highest-ranked assigned theater member. Seitansai and Last Show flags are never copied.', 'Isi Otomatis MV mengurutkan anggota yang memenuhi syarat dengan gabungan seimbang Keseluruhan dan Popularitas, lalu memecahkan hasil seri berdasarkan Keseluruhan, Popularitas, nama, dan ID. Templat jadwal menyimpan penugasan anggota beserta setlist dan center teater; center tersimpan yang tidak tersedia diganti oleh anggota teater terpilih dengan peringkat tertinggi. Penanda Seitansai dan Pertunjukan Terakhir tidak pernah disalin.')],
    [text('Training growth', 'Pertumbuhan latihan'), text(`Light, Regular, and Intensive Training use the same Potential, Development, Energy, trait, mentorship, and perk formulas as before, then multiply the uncapped stat gain by ${BALANCE.training.statGainMultiplier}. Cost, Energy use, intensity ratios, and trainee progress are unchanged. The member rail can search and filter by generation, roster status, and availability, then sort every visible stat, Popularity, current or projected Energy, and planned-session count.`, `Latihan Ringan, Reguler, dan Intensif memakai rumus Potensi, Perkembangan, Energi, sifat, mentorship, dan bonus yang sama seperti sebelumnya, lalu mengalikan kenaikan statistik sebelum batas dengan ${BALANCE.training.statGainMultiplier}. Biaya, penggunaan Energi, rasio intensitas, dan progres trainee tidak berubah. Daftar anggota dapat dicari dan difilter berdasarkan generasi, status roster, serta ketersediaan, lalu diurutkan menurut setiap statistik terlihat, Popularitas, Energi saat ini atau proyeksi, dan jumlah sesi yang direncanakan.`)],
    [text('Activity development', 'Perkembangan dari aktivitas'), text('Completed theater and Off-air work develops Vocal, Dance, Performance, and MC. Live Stream and Media develop MC and Variety; Photoshoot develops Performance and Variety; Video Call and Meet & Greet develop MC and Variety; MV work and concert rehearsal develop Vocal, Dance, and Performance; concerts also develop MC. Accepted opportunities grant matching development immediately. Each mapped skill receives the former Light-training baseline, without Training perks, mentorship, the Training multiplier, or trainee Training Progress.', 'Teater dan Off-air yang selesai mengembangkan Vokal, Tari, Penampilan, dan MC. Live Stream dan Media mengembangkan MC dan Varietas; Pemotretan mengembangkan Penampilan dan Varietas; Panggilan Video dan Meet & Greet mengembangkan MC dan Varietas; pekerjaan MV serta latihan konser mengembangkan Vokal, Tari, dan Penampilan; konser juga mengembangkan MC. Peluang yang diterima langsung memberi perkembangan yang sesuai. Setiap kemampuan terpetakan mendapat nilai dasar Latihan Ringan lama, tanpa bonus Latihan, mentorship, pengali Latihan, atau Progres Latihan trainee.')],
  );
  rules.splice(rules.length - 1, 0,
    [text('Annual tax', 'Pajak tahunan'), text('After Week 48, tax is settled before theater spending. Taxable profit is operating income minus activity costs, refunds, operations, upkeep, salary, operating-debt payments, and prior tax-debt payments. Loans, loan repayment, theater purchase or sale, renovations, and the current tax payment are excluded. Normal rates are 5%, 10%, 15%, and 20%; Hard rates are 10%, 15%, 20%, and 25% at FRL500m, FRL1.5b, and FRL3b boundaries. The selected rate applies to the entire profit. Unpaid tax becomes interest-free debt.', 'Setelah Minggu 48, pajak diselesaikan sebelum pengeluaran teater. Laba kena pajak adalah pendapatan operasional dikurangi biaya aktivitas, pengembalian dana, operasional, pemeliharaan, gaji, pembayaran utang operasional, dan pembayaran utang pajak lama. Pinjaman, pembayaran pinjaman, pembelian atau penjualan teater, renovasi, dan pembayaran pajak saat ini tidak dihitung. Tarif Normal adalah 5%, 10%, 15%, dan 20%; tarif Sulit adalah 10%, 15%, 20%, dan 25% pada batas FRL500 juta, FRL1,5 miliar, dan FRL3 miliar. Tarif terpilih berlaku pada seluruh laba. Pajak yang belum dibayar menjadi utang tanpa bunga.')],
    [text('Theater renovation and replacement', 'Renovasi dan penggantian teater'), text('At year-end, Keep is free. Renovation uses the theater gross market value and preserves the theater. Change Theater offers exactly three larger homes at 1.35×/1.20×, 1.70×/1.45×, and 2.10×/1.75× gross price/capacity. The old theater gives a 50% market-value resale credit; purchase and upkeep perks apply, ticket price is preserved, and renovation level resets.', 'Pada akhir tahun, Pertahankan tidak dikenai biaya. Renovasi memakai nilai pasar bruto teater dan mempertahankan teater tersebut. Ganti Teater menawarkan tepat tiga tempat yang lebih besar pada 1,35×/1,20×, 1,70×/1,45×, dan 2,10×/1,75× harga bruto/kapasitas. Teater lama memberi kredit penjualan kembali 50% dari nilai pasar; bonus pembelian dan pemeliharaan berlaku, harga tiket dipertahankan, dan level renovasi direset.')],
  );
  const nav = [['wiki-stats', text('Stats', 'Statistik')], ['wiki-income', text('Income and costs', 'Pendapatan dan biaya')], ['wiki-demand', text('Demand', 'Permintaan')], ['wiki-rules', text('Rules', 'Aturan')], ['wiki-hidden', text('Hidden mechanics', 'Mekanik tersembunyi')]];
  return <div className="page wiki-page">
    <section className="page-heading"><div><span className="eyebrow">{text('Game reference', 'Referensi permainan')}</span><h1>{text('Manager wiki', 'Wiki manajer')}</h1><p>{text('Rules, demand formulas, income sources, fulfillment tactics, and hidden mechanics used by this run.', 'Aturan, rumus permintaan, sumber pendapatan, cara memenuhi permintaan, dan mekanik tersembunyi yang digunakan permainan ini.')}</p></div>{onReplayTutorial ? <button type="button" className="secondary-button tutorial-replay-button" onClick={onReplayTutorial}>{text('Replay Tutorial', 'Ulangi Tutorial')}</button> : null}</section>
    <nav className="wiki-jump" aria-label={text('Wiki sections', 'Bagian wiki')}>{nav.map(([href, label]) => <a key={href} href={'#' + href}>{label}</a>)}</nav>
    <section className="wiki-section" id="wiki-stats"><div className="wiki-section-head"><span>01</span><div><h2>{text('Member stats', 'Statistik anggota')}</h2><p>{text('Visible and hidden values all come from the run seed.', 'Nilai terlihat dan tersembunyi semuanya berasal dari seed permainan.')}</p></div></div><div className="wiki-definition-grid">{stats.map(([enName, idName, enDescription, idDescription]) => <article key={enName}><strong>{text(enName, idName)}</strong><p>{text(enDescription, idDescription)}</p></article>)}</div></section>
    <section className="wiki-section" id="wiki-income"><div className="wiki-section-head"><span>02</span><div><h2>{text('Income and costs', 'Pendapatan dan biaya')}</h2><p>{text('Income comes from demand fulfillment, campaign sales, management opportunities, and special events; activity and operating costs determine the margin.', 'Pendapatan berasal dari pemenuhan permintaan, penjualan kampanye, peluang manajemen, dan acara khusus; biaya aktivitas dan operasional menentukan margin.')}</p></div></div><div className="wiki-callout"><CircleDollarSign size={20} /><div><strong>{text('Introducing Our New In-game Currency: FouReaLite', 'Memperkenalkan Mata Uang Dalam Game Baru: FouReaLite')}</strong><p>{text('FouReaLite is the in-game currency for FouReality JKT48 Manager Simulator. FRL is its symbol, like IDR or Rp. It is fictional and uses a fictional 1:1 value with Indonesian currency to make value conversion easier.', 'FouReaLite adalah mata uang dalam game FouReality JKT48 Manager Simulator. FRL adalah simbol FouReaLite, seperti IDR atau Rp. Mata uang ini bersifat fiktif dan menggunakan nilai fiktif 1:1 dengan mata uang Indonesia agar konversi nilai lebih mudah.')}</p></div></div><div className="wiki-callout"><CircleDollarSign size={20} /><div><strong>{text('Operating costs', 'Biaya operasional')}</strong><p>{text('Weekly operations and theater upkeep are deducted from run finances. Activity costs are charged per participating member; hard mode settles fixed costs and salaries monthly.', 'Operasional mingguan dan biaya teater dipotong dari keuangan permainan. Biaya aktivitas dibebankan per anggota yang ikut; mode sulit menyelesaikan biaya tetap dan gaji setiap bulan.')}</p></div></div><div className="wiki-table-wrap"><table className="wiki-table"><thead><tr><th>{text('Income source', 'Sumber pendapatan')}</th><th>{text('Income calculation', 'Perhitungan pendapatan')}</th><th>{text('Cost and limit', 'Biaya dan batas')}</th></tr></thead><tbody>{incomeRows.map(([source, income, limits]) => <tr key={source}><td><strong>{source}</strong></td><td>{income}</td><td>{limits}</td></tr>)}</tbody></table></div><p className="wiki-note">{text('Statistics separates regular activity income, 2Shot income, opportunities, and other income such as graduation merchandise. Use sold-through and unmet demand together: full capacity means income is capped, while unmet demand points to a capacity, popularity, or fan-segment opportunity.', 'Statistik memisahkan pendapatan aktivitas rutin, pendapatan 2Shot, peluang, dan pendapatan lain seperti merchandise kelulusan. Gunakan tingkat penjualan dan permintaan tidak terpenuhi bersama-sama: kapasitas penuh berarti pendapatan sudah dibatasi, sedangkan permintaan tidak terpenuhi menunjukkan peluang pada kapasitas, popularitas, atau segmen penggemar.')}</p></section>
    <section className="wiki-section" id="wiki-demand"><div className="wiki-section-head"><span>03</span><div><h2>{text('Demand detail and fulfillment', 'Detail permintaan dan cara memenuhi')}</h2><p>{text('Demand is calculated per activity, then capped by seats or ticket slots.', 'Permintaan dihitung per aktivitas, lalu dibatasi oleh kursi atau slot tiket.')}</p></div></div><div className="wiki-table-wrap"><table className="wiki-table"><thead><tr><th>{text('Activity', 'Aktivitas')}</th><th>{text('Demand responds to', 'Permintaan dipengaruhi')}</th><th>{text('How to fulfill it', 'Cara memenuhinya')}</th><th>{text('Income', 'Pendapatan')}</th></tr></thead><tbody>{demandRows.map(([name, demand, fulfill, income]) => <tr key={name}><td><strong>{name}</strong></td><td>{demand}</td><td>{fulfill}</td><td>{income}</td></tr>)}</tbody></table></div><p className="wiki-note">{text('Every demand record stores capacity, demand, sold tickets, sell-through, unmet demand, and revenue. Use unmet demand as a signal to increase capacity or improve the relevant member/fan segment.', 'Setiap catatan permintaan menyimpan kapasitas, permintaan, tiket terjual, tingkat penjualan, permintaan tidak terpenuhi, dan pendapatan. Gunakan permintaan tidak terpenuhi sebagai sinyal untuk menaikkan kapasitas atau memperbaiki anggota/segmen penggemar yang relevan.')}</p></section>
    <section className="wiki-section" id="wiki-rules"><div className="wiki-section-head"><span>04</span><div><h2>{text('Rules and limits', 'Aturan dan batas')}</h2><p>{text('These gates decide whether weekly activities resolve or cancel.', 'Batas ini menentukan apakah aktivitas mingguan berjalan atau dibatalkan.')}</p></div></div><div className="wiki-rule-list">{[[text('Training', 'Latihan'), text('Training is planned separately from Schedule. Each member can queue up to seven sessions. Sessions use free days from earliest to latest, consume Energy and money, and are skipped when Schedule takes priority.', 'Latihan direncanakan terpisah dari Jadwal. Setiap anggota dapat mengantrekan hingga tujuh sesi. Sesi memakai hari kosong dari yang paling awal, menggunakan Energi dan uang, serta dilewati saat Jadwal mengambil prioritas.')],[text('Theater', 'Teater'), text('Exactly 12 available members. Incomplete shows cancel without fatigue or income. Off-air also requires 12 and can run only once per week.', 'Tepat 12 anggota yang tersedia. Pertunjukan yang tidak lengkap batal tanpa kelelahan atau pendapatan. Off-air juga membutuhkan 12 anggota dan hanya dapat berjalan sekali per minggu.')],[text('Campaign timing', 'Waktu kampanye'), text('Video Call and Meet & Greet can be announced for the current or a future week. Only one Sousenkyo, Request Hour, or Janken can run in a calendar year. A major campaign and a regular MV cannot be active at the same time.', 'Panggilan Video dan Meet & Greet dapat diumumkan untuk minggu berjalan atau minggu mendatang. Hanya satu Sousenkyo, Request Hour, atau Janken yang dapat berjalan dalam satu tahun kalender. Kampanye utama dan MV reguler tidak dapat aktif pada saat bersamaan.')],[text('Concerts and singles', 'Konser dan single'), text('Concert sales close before the event; MV production and release calendars occupy locked days. Venue capacity, budget quality, and demand determine the result.', 'Penjualan konser ditutup sebelum acara; kalender produksi dan rilisan MV mengunci hari tertentu. Kapasitas tempat, kualitas anggaran, dan permintaan menentukan hasil.')],[text('Graduation and release', 'Kelulusan dan pelepasan'), text('Year 1 is protected. From Year 2, each new annual target is exactly four or six announcements: four uses one quarterly window, while six uses one two-month window. Eligibility, tenure, the minimum roster floor, and campaign commitments can leave a window unscheduled; legacy targets such as five or twelve finish under their original behavior. Only one member can graduate per four-week calendar month; conflicting departure dates move to the next free month. Preparation can fund a final show, special segment, merchandise, and successor training; releasing a member is blocked if it would break the 12-member minimum.', 'Tahun 1 dilindungi. Mulai Tahun 2, setiap target tahunan baru tepat empat atau enam pengumuman: target empat memakai satu jendela setiap kuartal, sedangkan target enam memakai satu jendela setiap dua bulan. Kelayakan, masa bergabung, batas minimum roster, dan komitmen kampanye dapat membuat jendela tidak terjadwal; target lama seperti lima atau dua belas tetap memakai aturan lamanya. Hanya satu anggota yang dapat lulus setiap bulan kalender yang terdiri dari empat minggu; tanggal keberangkatan yang bentrok dipindahkan ke bulan kosong berikutnya. Persiapan dapat membiayai pertunjukan terakhir, segmen khusus, merchandise, dan pelatihan penerus; pelepasan anggota diblokir jika membuat minimum 12 anggota tidak terpenuhi.')]].map(([title, description]) => <article key={title}><strong>{title}</strong><p>{description}</p></article>)}</div></section>
    <section className="wiki-section" id="wiki-hidden"><div className="wiki-section-head"><span>05</span><div><h2>{text('Hidden mechanics', 'Mekanik tersembunyi')}</h2><p>{text('Seeded outcomes create variation, but management choices still control the important levers.', 'Hasil dari seed menciptakan variasi, tetapi pilihan manajemen tetap mengendalikan tuas penting.')}</p></div></div><div className="wiki-rule-list">{rules.map(([title, description]) => <article key={title}><strong>{title}</strong><p>{description}</p></article>)}</div></section>
  </div>;
}

function Metric({ icon: Icon, label, value, meta, tone = '' }) {
  return <div className={`metric ${tone}`}><Icon size={18} /><div><span>{label}</span><strong>{value}</strong><small>{meta}</small></div></div>;
}

function MetricDelta({ icon: Icon, label, value, previous, format = (numberValue) => numberValue, formatDelta = format, language = 'en' }) {
  const delta = value - previous;
  return <div className="metric"><Icon size={18} /><div><span>{translate(language, label)}</span><strong>{format(value)}</strong><small className={delta > 0 ? 'positive' : delta < 0 ? 'negative' : ''}>{delta > 0 ? '+' : ''}{formatDelta(delta)} {translate(language, 'from last week')}</small></div></div>;
}

function PreGameMenu({ theme, onToggleTheme, language, onToggleLanguage, user, onOpenAccount, onLogout, accountBusy }) {
  const [open, setOpen] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  useEffect(() => {
    if (!open && !wikiOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') { setOpen(false); setWikiOpen(false); } };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, wikiOpen]);

  return <>
    <IconButton label={translate(language, 'Open menu')} className="pre-game-menu-button" aria-expanded={open} aria-controls="pre-game-menu" onClick={() => setOpen(true)}><Menu size={21} /></IconButton>
    <aside id="pre-game-menu" className={open ? 'pre-game-menu open' : 'pre-game-menu'} aria-label={translate(language, 'Game menu')}>
      <div className="pre-game-menu-head"><strong>{translate(language, 'Game menu')}</strong><IconButton label={translate(language, 'Close menu')} onClick={() => setOpen(false)}><X size={19} /></IconButton></div>
      <button type="button" onClick={onToggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}<span>{translate(language, theme === 'dark' ? 'Light mode' : 'Dark mode')}</span></button>
      <button type="button" onClick={onToggleLanguage}><Languages size={18} /><span>{language === 'id' ? 'English' : 'Bahasa Indonesia'}</span></button>
      <button type="button" onClick={() => { setOpen(false); setWikiOpen(true); }}><BookOpen size={18} /><span>{translate(language, 'Wiki')}</span></button>
      {user ? <><div className="pre-game-account"><Cloud aria-hidden="true" size={18} /><span><strong>{user.username}</strong><small>{translate(language, 'Cloud save enabled')}</small></span></div><button type="button" disabled={accountBusy} onClick={() => { setOpen(false); onLogout(); }}><LogOut aria-hidden="true" size={18} /><span>{translate(language, accountBusy ? 'Saving…' : 'Save and logout')}</span></button></> : <button type="button" onClick={() => { setOpen(false); onOpenAccount(); }}><Cloud aria-hidden="true" size={18} /><span>{translate(language, 'Login / Register')}</span></button>}
      <p>{translate(language, 'Save controls become available after the founding lineup is confirmed.')}</p>
    </aside>
    {open ? <button className="pre-game-scrim" aria-label={translate(language, 'Close menu')} type="button" onClick={() => setOpen(false)} /> : null}
    {wikiOpen ? <div className="pre-game-wiki" role="dialog" aria-modal="true" aria-label={translate(language, 'Manager wiki')}><IconButton label={translate(language, 'Close wiki')} className="pre-game-wiki-close" onClick={() => setWikiOpen(false)}><ArrowLeft size={20} /></IconButton><Wiki language={language} /></div> : null}
  </>;
}

function TutorialCoach({ game, language, activeView, onNavigate, onAction, onSkip, replayChapter, onReplayChapter, onCloseReplay }) {
  const tutorial = normalizeTutorialState(game.tutorialState);
  const chapter = replayChapter ? TUTORIAL_CHAPTERS[replayChapter - 1] : getTutorialChapter(tutorial, game.year, game.week);
  if (!chapter) return null;
  const t = (value) => translate(language, value);
  const completed = new Set(tutorial.completedStepIds);
  if (!replayChapter && completed.has(`${chapter.id}-understood`)) return null;
  const plannedTraining = Object.values(game.trainingPlans ?? {}).reduce((sum, sessions) => sum + sessions.length, 0);
  const copy = {
    schedule: { title: 'Build the weekly Schedule', body: 'Select a member, choose an activity and day, then make one assignment. Theater shows need exactly 12 members; campaign days stay locked.', steps: [['schedule-opened', activeView === 'schedule', 'Open Schedule'], ['schedule-assigned', Object.keys(game.schedule ?? {}).length > 0, 'Make one assignment']] },
    training: { title: 'Plan member Training', body: 'Check free days and projected Energy, then queue one session. Training resolves on the earliest day not occupied by Schedule or Campaigns.', steps: [['training-opened', activeView === 'training', 'Open Training'], ['training-queued', plannedTraining > 0, 'Queue one session']] },
    campaigns: { title: 'Explore Campaigns', body: 'Open Video Call or Meet & Greet, choose the details and optional title, then open Review. Confirming and spending money are optional.', steps: [['campaigns-opened', activeView === 'campaigns', 'Open Campaigns'], ['fan-event-reviewed', completed.has('fan-event-reviewed'), 'Open a fan-event review']] },
    'weekly-loop': { title: 'Complete the weekly loop', body: 'Return to Command, compare Schedule and Training totals, then open Resolve Week. Resolving Week 4 completes the tutorial.', steps: [['command-opened', activeView === 'dashboard', 'Return to Command'], ['resolve-reviewed', completed.has('resolve-reviewed'), 'Review Resolve Week']] },
  }[chapter.id];
  const replay = Boolean(replayChapter);
  const allDone = copy.steps.every(([, done]) => done);
  const targetLabel = chapter.view === 'dashboard' ? 'Command' : chapter.view[0].toUpperCase() + chapter.view.slice(1);
  return <aside className="tutorial-coach" aria-label={t('Tutorial coach')} aria-live="polite"><header><span>{t(replay ? 'Tutorial replay' : `Week ${chapter.week} tutorial`)}</span><strong>{chapter.week}/4</strong></header><h2>{t(copy.title)}</h2><p>{t(copy.body)}</p><ul>{copy.steps.map(([id, liveDone, label]) => { const done = !replay && (completed.has(id) || liveDone); return <li key={id} className={done ? 'done' : ''}><Check size={16} aria-hidden="true" /><span>{t(label)}</span></li>; })}</ul><div className="tutorial-coach-actions">{replay ? <><button type="button" className="secondary-button" disabled={replayChapter === 1} onClick={() => onReplayChapter(replayChapter - 1)}>{t('Previous')}</button><button type="button" onClick={() => replayChapter === 4 ? onCloseReplay() : onReplayChapter(replayChapter + 1)}>{t(replayChapter === 4 ? 'Finish replay' : 'Next')}</button></> : <><button type="button" className="secondary-button" onClick={onSkip}>{t('Skip tutorial')}</button><button type="button" onClick={() => activeView === chapter.view ? onAction(`${chapter.id}-understood`) : onNavigate(chapter.view)}>{t(activeView === chapter.view ? allDone ? 'Got it' : 'Continue' : `Open ${targetLabel}`)}</button></>}</div></aside>;
}

function AppShell({ game, activeView, setActiveView, onAdvance, onNewRun, onEndRun, onManualSave, onBeforeRefresh, onToggleTheme, onToggleLanguage, onOpenAccount, onLogout, user, accountBusy, advancing, manualSaving, saveMessage, theme, language, onTutorialAction, tutorialCoach, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
  const [confirmAdvance, setConfirmAdvance] = useState(false);
  const scheduledActivityCount = Object.values(game.schedule ?? {}).filter(Boolean).length;
  const plannedTrainingCount = Object.values(game.trainingPlans ?? {}).reduce((sum, sessions) => sum + sessions.length, 0);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const updateViewport = (event) => setIsMobileViewport(event.matches);
    updateViewport(media);
    media.addEventListener?.('change', updateViewport);
    return () => media.removeEventListener?.('change', updateViewport);
  }, []);
  useEffect(() => {
    if (!confirmAdvance) return undefined;
    const close = (event) => { if (event.key === 'Escape') setConfirmAdvance(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [confirmAdvance]);
  const menuExpanded = isMobileViewport ? mobileOpen : !desktopCollapsed;
  const toggleMenu = () => {
    if (isMobileViewport) setMobileOpen((current) => !current);
    else setDesktopCollapsed((current) => !current);
  };
  return <div className={desktopCollapsed ? 'app-shell sidebar-collapsed' : 'app-shell'}>
    <aside id="main-sidebar" className={mobileOpen ? 'sidebar open' : 'sidebar'}>
      <IconButton label={translate(language, 'Close menu')} className="sidebar-close-button" onClick={() => setMobileOpen(false)}><X size={20} /></IconButton>
      <div className="brand"><div className="brand-mark">48</div><div><strong>JKT48</strong><span>{game.managementName || translate(language, 'Manager')}</span></div></div>
      <div className="sidebar-scroll">
        <nav aria-label={translate(language, 'Main navigation')}>{NAV.map(([id, label, Icon]) => <button key={id} type="button" className={activeView === id ? 'active' : ''} onClick={() => { setActiveView(id); setMobileOpen(false); }}><Icon size={19} /><span>{translate(language, label)}</span></button>)}</nav>
        <div className="sidebar-footer">
          {user ? <><div className="sidebar-account"><Cloud aria-hidden="true" size={17} /><span><strong>{user.username}</strong><small>{translate(language, 'Cloud sync on')}</small></span></div><button type="button" onClick={onLogout} disabled={accountBusy}><LogOut aria-hidden="true" size={18} />{translate(language, accountBusy ? 'Saving…' : 'Save and logout')}</button></> : <button type="button" onClick={onOpenAccount}><Cloud aria-hidden="true" size={18} />{translate(language, 'Login / Register')}</button>}
          <button type="button" onClick={onManualSave} disabled={manualSaving}><Save aria-hidden="true" size={18} />{translate(language, manualSaving ? 'Saving…' : 'Save run')}</button>
          <button type="button" onClick={onToggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}{translate(language, theme === 'dark' ? 'Light mode' : 'Dark mode')}</button>
          <button type="button" onClick={onToggleLanguage}><Languages size={18} />{language === 'id' ? 'English' : 'Bahasa Indonesia'}</button>
          <button type="button" onClick={onNewRun}><Plus size={18} />{translate(language, 'New timeline')}</button>
          <button type="button" className="end-run-button" onClick={onEndRun}><Square size={17} />{translate(language, 'End run')}</button>
          <p className={saveMessage ? 'sidebar-save-status visible' : 'sidebar-save-status'} aria-live="polite">{translate(language, saveMessage || 'Simulation stats are fictional.')}</p>
        </div>
      </div>
    </aside>
    <main>
      <header className="topbar">
        <IconButton label={translate(language, menuExpanded ? 'Close menu' : 'Open menu')} aria-expanded={menuExpanded} aria-controls="main-sidebar" onClick={toggleMenu}><Menu size={20} /></IconButton>
        <div className="week-title"><span>{translate(language, 'Year')} {game.year}</span><strong>{calendarParts(game.week).month} <small>· {translate(language, 'Week')} {calendarParts(game.week).weekOfMonth}/4</small></strong></div>
        <div className="topbar-status"><span><CircleDollarSign size={16} />{money(game.money)}</span><span><Users size={16} />{number.format(game.group.fanbase)} {translate(language, 'fans')}</span></div>
        <button className="advance-button" type="button" onClick={() => { setConfirmAdvance(true); onTutorialAction?.('resolve-reviewed'); }} disabled={advancing || Boolean(game.pendingYearEndSettlement)}>{translate(language, game.pendingYearEndSettlement ? 'Year-end settlement pending' : advancing ? 'Resolving…' : 'Resolve week')} <ChevronRight size={19} /></button>
      </header>
       {children}
       <footer className="app-footer"><span>{translate(language, 'JKT48 Manager')} · {translate(language, 'Alternate timeline simulator')}</span><small>{translate(language, 'Fictional gameplay data for entertainment.')} · {translate(language, 'All rights reserved.')}</small></footer>
    </main>
    {isMobileViewport && mobileOpen ? <button className="scrim" aria-label={translate(language, 'Close menu')} type="button" onClick={() => setMobileOpen(false)} /> : null}
    {confirmAdvance ? <ModalPortal><div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmAdvance(false); }}><section className="confirm-week-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-week-title"><div className="confirm-week-icon"><Clock3 aria-hidden="true" size={25} /></div><span className="eyebrow">{translate(language, 'Schedule confirmation')}</span><h2 id="confirm-week-title">{translate(language, 'End this week?')}</h2><p>{translate(language, 'All scheduled activities and planned training will resolve, finances will be calculated, and the calendar will advance. This action cannot be undone.')}</p><div className="resolve-week-counts"><span><CalendarDays aria-hidden="true" size={18} /><small>{translate(language, 'Schedule activities')}</small><strong>{scheduledActivityCount}</strong></span><span><Dumbbell aria-hidden="true" size={18} /><small>{translate(language, 'Training sessions')}</small><strong>{plannedTrainingCount}</strong></span></div>{game.week === BALANCE.weeksPerYear ? <p className="fan-target-warning"><ShieldAlert aria-hidden="true" size={18} />{translate(language, 'The annual fan result resolves after this week. It affects Fan Trust, Reputation, annual grade, and Management Token reward, but does not end the run.')}</p> : null}<div className="confirm-week-actions"><button type="button" className="secondary-button" onClick={() => setConfirmAdvance(false)}>{translate(language, 'Cancel')}</button><button type="button" className="setup-primary" onClick={() => { setConfirmAdvance(false); onAdvance(); }}>{translate(language, 'End week')} <ChevronRight aria-hidden="true" size={18} /></button></div></section></div></ModalPortal> : null}
    {tutorialCoach}
    <HardRefreshButton onBeforeRefresh={onBeforeRefresh} language={language} />
  </div>;
}

function YearEndSettlementModal({ game, language = 'en', busy, onSettleTax, onComplete }) {
  const dialogRef = useRef(null);
  const pending = game.pendingYearEndSettlement;
  const t = (value) => translate(language, value);
  const tax = pending?.tax ?? {};
  const renovation = getTheaterRenovationOffer(game);
  const changes = getTheaterChangeOffers(game);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const focusable = () => [...dialog.querySelectorAll('button:not([disabled])')];
    focusable()[0]?.focus();
    const trap = (event) => {
      if (event.key !== 'Tab') return;
      const controls = focusable();
      if (!controls.length) return;
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('keydown', trap);
    return () => dialog.removeEventListener('keydown', trap);
  }, [pending?.stage]);
  if (!pending) return null;
  const availableTaxPayment = Math.min(Math.max(0, game.money), tax.taxDue ?? 0);
  const projectedTaxDebt = Math.max(0, (tax.taxDue ?? 0) - availableTaxPayment);
  return <ModalPortal><div className="setup-modal-backdrop year-end-settlement-backdrop"><section ref={dialogRef} className="year-end-settlement" role="dialog" aria-modal="true" aria-labelledby="year-end-settlement-title" aria-describedby="year-end-settlement-description">
    <header><div><h2 id="year-end-settlement-title">{t(`Year ${pending.closingYear} settlement`)}</h2><p id="year-end-settlement-description">{t(pending.stage === 'tax' ? 'Settle annual tax before choosing what happens to the theater.' : 'Choose the club home for the new year. Keep, renovate, or move to a larger theater.')}</p></div><span>{t(pending.stage === 'tax' ? 'Tax review' : 'Theater decision')}</span></header>
    {pending.stage === 'tax' ? <div className="settlement-tax-stage"><dl className="settlement-ledger"><div><dt>{t('Operating income')}</dt><dd>{money(tax.operatingIncome)}</dd></div><div><dt>{t('Deductible expenses')}</dt><dd>{money(tax.deductibleExpenses)}</dd></div><div><dt>{t('Taxable profit')}</dt><dd>{money(tax.taxableProfit)}</dd></div><div><dt>{t('Tax rate')}</dt><dd>{Math.round((tax.rate ?? 0) * 100)}%</dd></div><div className="settlement-total"><dt>{t('Tax due')}</dt><dd>{money(tax.taxDue)}</dd></div></dl>{tax.exempt ? <p className="settlement-note">{t('This partial legacy year is tax-exempt. Tax tracking begins next year.')}</p> : projectedTaxDebt ? <p className="settlement-warning"><ShieldAlert size={18} />{t(`${money(availableTaxPayment)} will be paid now. ${money(projectedTaxDebt)} will become tax debt.`)}</p> : <p className="settlement-note">{t(`${money(availableTaxPayment)} will be paid from current cash.`)}</p>}<button type="button" className="setup-primary" disabled={busy} onClick={onSettleTax}>{t(busy ? 'Saving…' : 'Pay tax and continue')} <ChevronRight size={18} /></button></div> : <div className="settlement-theater-stage">
      <div className="current-theater-summary"><Building2 size={22} /><span><strong>{game.theater.name}</strong><small>{number.format(game.theater.capacity)} {t('seats')} · {money(game.theater.weeklyUpkeep)} / {t('week')}</small></span><b>{money(game.money)} {t('available')}</b></div>
      <div className="settlement-options"><article><h3>{t('Keep current theater')}</h3><p>{t('Start the new year without facility spending or changes.')}</p><button type="button" className="secondary-button" disabled={busy} onClick={() => onComplete('keep')}>{t('Keep theater')}</button></article>
      <article><h3>{t('Renovate theater')}</h3><p>{renovation ? `${money(renovation.currentTicketPrice)} → ${money(renovation.ticketPrice)} ${t('ticket price')} · ${money(renovation.weeklyUpkeep)} / ${t('week')}` : t('No renovation is available.')}</p><strong>{money(renovation?.cost ?? 0)}</strong><button type="button" disabled={busy || !renovation || game.money < renovation.cost} onClick={() => onComplete('renovate')}>{t('Renovate')}</button></article>
      {changes.map((offer) => <article key={offer.id}><h3>{t(offer.name)}</h3><dl><div><dt>{t('Capacity')}</dt><dd>{number.format(offer.capacity)}</dd></div><div><dt>{t('Gross price')}</dt><dd>{money(offer.grossPrice)}</dd></div><div><dt>{t('Resale credit')}</dt><dd>−{money(offer.resaleCredit)}</dd></div><div><dt>{t('Weekly upkeep')}</dt><dd>{money(offer.weeklyUpkeep)}</dd></div></dl><strong>{money(offer.netPayment)} {t('net')}</strong><button type="button" disabled={busy || game.money < offer.netPayment} onClick={() => onComplete('change', offer.id)}>{t('Change theater')}</button></article>)}
      </div>
    </div>}
  </section></div></ModalPortal>;
}

function HardModeFinance({ game, setGame, language = 'en' }) {
  const t = (value) => translate(language, value);
  const debt = game.ledger?.debt ?? {};
  if (!game.hardMode && !(debt.tax > 0)) return null;
  const debtRows = [...(game.hardMode ? [['salary', 'Salary'], ['upkeep', 'Theater upkeep'], ['operations', 'Operations']] : []), ['tax', 'Tax']];
  return <section className="hard-finance-panel"><div className="panel-heading"><div><span className="eyebrow">{t(game.hardMode ? 'Hard mode ledger' : 'Tax ledger')}</span><h2>{t(game.hardMode ? 'Debt and loan control' : 'Tax debt control')}</h2></div><strong>{money(Object.values(debt).reduce((sum, value) => sum + (value ?? 0), 0))} {t('owed')}</strong></div><div className="hard-finance-debt">{debtRows.map(([category, label]) => <div key={category}><span><strong>{t(label)}</strong><small>{money(debt[category] ?? 0)} {t('outstanding')}</small></span><button type="button" disabled={!debt[category] || game.money <= 0} onClick={() => setGame((current) => payDebt(current, category))}>{t('Pay available')}</button></div>)}</div>{game.hardMode && (game.loanOffers ?? []).length ? <div className="hard-finance-loans"><strong>{t('Available loans')}</strong>{game.loanOffers.map((offer) => <div key={offer.id}><span><b>{money(offer.principal)}</b><small>{offer.termMonths} {t('months')} · {money(offer.repayment)} {t('total')}</small></span><button type="button" disabled={(game.loans ?? []).some((loan) => loan.offerId === offer.id)} onClick={() => setGame((current) => takeLoan(current, offer.id))}>{t('Take loan')}</button></div>)}</div> : null}</section>;
}

function RunEndRiskWarnings({ game, language = 'en' }) {
  const warnings = getRunEndWarnings(game);
  if (!warnings.length) return null;
  const id = language === 'id';
  const copy = (warning) => {
    if (warning.id === 'theaterRoster') return id
      ? `${warning.value} anggota memenuhi syarat untuk teater. Permainan langsung berakhir jika jumlahnya turun di bawah ${warning.limit}. Pulihkan ketersediaan anggota atau rekrut anggota baru.`
      : `${warning.value} theater-eligible members remain. Run ends immediately below ${warning.limit}. Restore member availability or recruit before losing another member.`;
    if (warning.id === 'salaryDefault') return id
      ? `Gaji berjalan tidak terbayar ${warning.value}/${warning.limit} bulan. Lunasi gaji sebelum penyelesaian bulanan berikutnya.`
      : `Current salary is unpaid for ${warning.value}/${warning.limit} months. Pay salary before the next monthly settlement.`;
    if (warning.id === 'bankruptcy') return id
      ? `Risiko kebangkrutan ${warning.value}/${warning.limit} minggu berturut-turut. Naikkan saldo ke FRL0 atau lebih sebelum minggu ke-${warning.limit} diselesaikan.`
      : `Bankruptcy risk: ${warning.value}/${warning.limit} consecutive weeks. Restore cash to FRL0 or higher before resolving week ${warning.limit}.`;
    if (warning.id === 'fanTrust') return warning.weeks > 0
      ? (id ? `Risiko keruntuhan Kepercayaan Penggemar ${warning.weeks}/${warning.limit} minggu. Naikkan nilainya ke 5 atau lebih untuk mereset penghitung.` : `Fan Trust collapse risk: ${warning.weeks}/${warning.limit} weeks. Raise it to 5 or higher to reset the counter.`)
      : warning.active
        ? (id ? `Kepercayaan Penggemar ${warning.value}/100, di bawah batas 5. Minggu bahaya pertama dicatat saat minggu berikutnya diselesaikan.` : `Fan Trust is ${warning.value}/100, below 5. First danger week records when the next week resolves.`)
        : (id ? `Kepercayaan Penggemar hanya ${warning.value}/100. Penghitung keruntuhan dimulai saat nilainya di bawah 5.` : `Fan Trust is only ${warning.value}/100. Collapse counter starts below 5.`);
    if (warning.id === 'reputation') return warning.weeks > 0
      ? (id ? `Risiko keruntuhan Reputasi ${warning.weeks}/${warning.limit} minggu. Naikkan nilainya ke 5 atau lebih untuk mereset penghitung.` : `Reputation collapse risk: ${warning.weeks}/${warning.limit} weeks. Raise it to 5 or higher to reset the counter.`)
      : warning.active
        ? (id ? `Reputasi ${warning.value}/100, di bawah batas 5. Minggu bahaya pertama dicatat saat minggu berikutnya diselesaikan.` : `Reputation is ${warning.value}/100, below 5. First danger week records when the next week resolves.`)
        : (id ? `Reputasi hanya ${warning.value}/100. Penghitung keruntuhan dimulai saat nilainya di bawah 5.` : `Reputation is only ${warning.value}/100. Collapse counter starts below 5.`);
    return warning.weeks > 0
      ? (id ? `Risiko keruntuhan basis penggemar ${warning.weeks}/${warning.limit} minggu. Naikkan penggemar menjadi 20.000 atau lebih untuk mereset penghitung.` : `Fanbase collapse risk: ${warning.weeks}/${warning.limit} weeks. Reach 20,000 fans or more to reset the counter.`)
      : warning.active
        ? (id ? `Basis penggemar ${number.format(warning.value)}, di bawah batas 20.000. Minggu bahaya pertama dicatat saat minggu berikutnya diselesaikan.` : `Fanbase is ${number.format(warning.value)}, below 20,000. First danger week records when the next week resolves.`)
        : (id ? `Basis penggemar mendekati batas keruntuhan: ${number.format(warning.value)}. Penghitung dimulai di bawah 20.000.` : `Fanbase is near collapse threshold: ${number.format(warning.value)}. Counter starts below 20,000.`);
  };
  return <section className="notice-strip run-risk-warnings" aria-label={id ? 'Peringatan risiko akhir permainan' : 'Run-ending risk warnings'} aria-live="polite">{warnings.map((warning) => <div key={warning.id} className={warning.severity}><ShieldAlert aria-hidden="true" size={18} /><span>{copy(warning)}</span></div>)}</section>;
}

function GraduationCountdown({ game, language = 'en' }) {
  const t = (value) => translate(language, value);
  const countdowns = getGraduationCountdown(game);
  if (!countdowns.length) return null;
  const urgent = countdowns.some((graduation) => graduation.weeksRemaining <= 1);
  return <section className="notice-strip graduation-countdown" aria-label={t('Graduation countdown')} aria-live="polite"><div className={urgent ? 'critical' : 'warning'}><CalendarDays aria-hidden="true" size={17} /><span><strong className="graduation-countdown-title">{t('Graduation countdown')}</strong>{countdowns.map((graduation) => <span className="graduation-countdown-row" key={graduation.id}><strong>{graduation.memberName}</strong><span>{t(graduation.weeksRemaining === 0 ? 'Graduation this week' : `${graduation.weeksRemaining} week${graduation.weeksRemaining === 1 ? '' : 's'} until graduation`)} · {t(calendarLabel(graduation.departureYear, graduation.departureWeek))}</span></span>)}</span></div></section>;
}

function Dashboard({ game, setGame, setView, selectedMember, setSelectedMember, language = 'en', onReplayTutorial, onOpenGraduation }) {
  const t = (value) => translate(language, value);
  const topMembers = useMemo(() => [...game.members].filter((m) => m.status !== 'graduated').sort((a, b) => b.popularity - a.popularity).slice(0, 5), [game.members]);
  const releasedSingles = useMemo(() => [...game.singles].filter((single) => single.status === 'released').reverse(), [game.singles]);
  const totalSingleViews = releasedSingles.reduce((total, single) => total + (single.views ?? 0), 0);
  const scheduled = Object.keys(game.schedule).length;
  const plannedTraining = Object.values(game.trainingPlans ?? {}).reduce((sum, sessions) => sum + sessions.length, 0);
  const hasCurrentYearAnniversary = (game.concerts ?? []).some((concert) => concert.eventType === 'anniversary' && concert.targetYear === game.year);
  let campaignBlockSeen = false;
  const visibleNotifications = (game.notifications ?? []).filter((item) => {
    if (item.text === YEAR_END_MEET_GREET_FAILURE) {
      // This generic notification is persisted by older builds, but has no
      // target date and cannot be recomputed reliably after a reload. The
      // annual-event cards now show the live blocker reason instead.
      return false;
    }
    if (item.text === ANNIVERSARY_CONCERT_FAILURE) {
      return false;
    }
    const isCampaignBlock = item.code === 'campaign-blocked' || (typeof item.text === 'string' && item.text.startsWith('Campaign blocked:'));
    // An annual concert booking supersedes any stale concert-block notice
    // left by an earlier confirmation attempt. Do not keep showing it on
    // Command after the event exists.
    if (isCampaignBlock && item.campaignType === 'concert' && hasCurrentYearAnniversary) return false;
    if (isCampaignBlock) {
      if (campaignBlockSeen) return false;
      campaignBlockSeen = true;
    }
    return true;
  });
  const pendingGraduationSetups = getPendingGraduationSetups(game);
  const eligibleCount = getTheaterEligibleMembers(game).length;
  const rosterDanger = getRosterDanger(eligibleCount) || 'STABLE';
  const targetProgress = Math.max(0, Math.round(game.group.fanbase / Math.max(1, game.fanTarget.targetFanbase) * 10_000) / 100);
  const targetRemaining = Math.max(0, game.fanTarget.targetFanbase - game.group.fanbase);
  const targetPerformance = getFanTargetPerformance(game.group.fanbase, game.fanTarget.targetFanbase);
  const fanGrowthMultiplier = getFanGrowthMultiplier(game.group.fanbase, game.fanTarget.targetFanbase);
  return <div className="page dashboard-page">
    <section className="page-heading"><div><span className="eyebrow">Management briefing</span><h1>Command center</h1><p>Balance this week’s exposure, development, energy, and financial risk.</p></div><div className="seed">Seed <code>{game.seed}</code></div><button type="button" className="secondary-button tutorial-replay-button" onClick={onReplayTutorial}>{t('Replay Tutorial')}</button></section>
      {visibleNotifications.length ? <section className="notice-strip">{visibleNotifications.map((item, index) => <div key={`${item.text}-${index}`} className={item.type}><Sparkles size={17} /><span>{t(normalizeDashboardNotificationDate(game, item.text))}{item.skillChanges?.length ? <details className="notification-skill-gains"><summary>{t('View individual skill gains')}</summary><ul>{item.skillChanges.map((change, changeIndex) => <li key={`${change.memberId}-${change.skill}-${changeIndex}`}>{change.memberName}: {t(visibleStatLabel(change.skill))} {change.delta > 0 ? '+' : ''}{change.delta}</li>)}</ul></details> : null}</span></div>)}</section> : null}
      <RunEndRiskWarnings game={game} language={language} />
      {pendingGraduationSetups.length ? <section className="notice-strip graduation-setup-notices" aria-label={t('Graduation preparation pending')}>
        {pendingGraduationSetups.map((graduation) => <div className="warning" key={graduation.id}>
          <CalendarDays aria-hidden="true" size={17} />
          <span><strong>{graduation.memberName}</strong> · {t('Graduation preparation pending')} · {t(calendarLabel(graduation.departureYear, graduation.departureWeek))}</span>
          <button type="button" className="secondary-button" aria-label={`${t('Set up graduation')}: ${graduation.memberName}`} onClick={() => onOpenGraduation(graduation)}>{t('Set up graduation')}</button>
        </div>)}
      </section> : null}
      <GraduationCountdown game={game} language={language} />
      {(() => { const hasSeitansaiThisWeek = (memberId) => DAYS.some((day) => { const show = game.theaterShows?.[day]; return show?.isSeitansai && show.seitansaiMemberId === memberId; }); const hasCompletedSeitansai = (item) => (game.theaterHistory ?? []).some((show) => show.isSeitansai && show.seitansaiMemberId === item.memberId && show.year === item.year); const obligations = (game.seitansaiObligations ?? []).filter((item) => (item.status === 'open' || (item.status === 'overdue' && item.year === game.year)) && !hasSeitansaiThisWeek(item.memberId) && !hasCompletedSeitansai(item)); const currentMonth = Math.ceil(game.week / BALANCE.weeksPerMonth); const weekOneCandidates = game.hardMode && game.week % BALANCE.weeksPerMonth === 1 ? game.members.filter((member) => ['active', 'trainee'].includes(member.status) && member.birthMonth === currentMonth && !(game.seitansaiObligations ?? []).some((item) => item.memberId === member.id && item.year === game.year && item.month === currentMonth) && !hasSeitansaiThisWeek(member.id) && !hasCompletedSeitansai({ memberId: member.id, year: game.year })) : []; const warningMemberIds = [...new Set([...obligations.map((item) => item.memberId), ...weekOneCandidates.map((member) => member.id)])]; return warningMemberIds.length ? <section className="notice-strip"><div className="critical"><CalendarDays size={17} /><span>Seitansai pending: {warningMemberIds.map((memberId) => game.members.find((member) => member.id === memberId)?.name ?? 'Member').join(', ')}. Schedule that member's Seitansai theater show before the due date.</span></div></section> : null; })()}
    <section className={targetRemaining ? 'fan-target-strip' : 'fan-target-strip achieved'}><div className="fan-target-icon"><Target size={22} /></div><div className="fan-target-copy"><span><strong>Year {game.fanTarget.year} fan target</strong><small>{targetRemaining ? `${number.format(targetRemaining)} fans still needed` : targetPerformance.label}</small></span><progress max="130" value={Math.min(130, targetProgress)} aria-label="Annual fan target progress">{targetProgress}%</progress></div><div className="fan-target-score"><strong>{number.format(game.group.fanbase)}</strong><span>/ {number.format(game.fanTarget.targetFanbase)}</span><small>{targetProgress}% · Fan growth x{fanGrowthMultiplier.toFixed(2)} · {BALANCE.weeksPerYear - game.week + 1} weeks remaining</small></div></section>
    {game.pendingOpportunity ? <section className="opportunity-offer"><div className="opportunity-icon"><Sparkles size={22} /></div><div><span className="eyebrow">{t('Limited opportunity')}</span><h2>{t(game.pendingOpportunity.title)}</h2><p>{t(`${game.pendingOpportunity.memberIds.length} members · ${money(game.pendingOpportunity.revenue)} gross revenue · ${number.format(game.pendingOpportunity.fans)} projected fans`)}</p></div><div className="opportunity-actions"><button type="button" className="secondary-button" onClick={() => setGame((current) => respondToOpportunity(current, false))}>{t('Decline')}</button><button type="button" onClick={() => setGame((current) => respondToOpportunity(current, true))} disabled={game.money < game.pendingOpportunity.cost}>{t('Accept')} · {money(game.pendingOpportunity.cost)}</button></div></section> : null}
    {game.pendingOpportunity ? <section className="opportunity-visibility"><span className="eyebrow">{t('Event detail')}</span><div><span>{t('Date')}</span><strong>{t(calendarLabel(game.year, game.week))}</strong></div><div><span>{t('Participating Members')}</span><strong>{game.pendingOpportunity.memberIds.length}</strong></div><div><span>{t('Energy Cost')}</span><strong>-{game.pendingOpportunity.energy ?? 0}</strong></div><div><span>{t('Physical Load')}</span><strong>{game.pendingOpportunity.category === 'live' ? t('Heavy') : t('Moderate')}</strong></div><div><span>{t('Injury Risk')}</span><strong>{game.pendingOpportunity.category === 'live' ? t('Medium') : t('Low')}</strong></div></section> : null}
    {(game.ledger?.debt?.tax ?? 0) > 0 ? <section className="notice-strip"><div className="critical"><ShieldAlert size={17} /><span>{t('Outstanding tax debt remains. Pay it from Finance when cash is available.')}</span></div></section> : null}
     <section className="metrics-grid">
       <MetricDelta language={language} icon={Users} label="Fanbase" value={game.group.fanbase} previous={game.lastResult?.statistics?.before?.fanbase ?? game.group.fanbase} format={number.format.bind(number)} />
       <MetricDelta language={language} icon={TrendingUp} label="Popularity" value={game.group.popularity} previous={game.lastResult?.statistics?.before?.popularity ?? game.group.popularity} format={(value) => `${value}/100`} formatDelta={(value) => `${value}`} />
       <MetricDelta language={language} icon={Trophy} label="Fan trust" value={game.group.fanTrust} previous={game.lastResult?.statistics?.before?.fanTrust ?? game.group.fanTrust} format={(value) => `${value}/100`} formatDelta={(value) => `${value}`} />
       <MetricDelta language={language} icon={Activity} label="Reputation" value={game.group.reputation} previous={game.lastResult?.statistics?.before?.reputation ?? game.group.reputation} format={(value) => `${value}/100`} formatDelta={(value) => `${value}`} />
       <MetricDelta language={language} icon={Sparkles} label="Public awareness" value={game.group.publicAwareness} previous={game.lastResult?.statistics?.before?.publicAwareness ?? game.group.publicAwareness} format={(value) => `${value}/100`} formatDelta={(value) => `${value}`} />
    </section>
    <section className="dashboard-view-report"><div><span className="eyebrow">Release audience</span><h2>MV / Single views</h2><strong>{number.format(totalSingleViews)}</strong><small>{releasedSingles.length} releases</small></div>{releasedSingles.length ? <div className="dashboard-view-list">{releasedSingles.map((single) => <article key={single.id}><span><strong>{single.title}</strong><small>{single.releasedYear ? calendarLabel(single.releasedYear, single.releasedWeek) : 'Released'}</small></span><b>{number.format(single.views ?? 0)}</b><small>+{number.format(single.weeklyViewGain ?? 0)} latest week</small></article>)}</div> : <div className="dashboard-view-empty"><Disc3 size={22} /><span>No released singles yet.</span></div>}</section>
    {(game.fanNarratives ?? []).length ? <section className="fan-narrative-feed"><div><span className="eyebrow">{t('Fan pulse')}</span><h2>{t('Current narratives')}</h2></div><div>{game.fanNarratives.slice(0, 4).map((narrative) => <article key={narrative.id} className={narrative.sentiment}><span>{t(language === 'id' && narrative.titleId ? narrative.titleId : narrative.title)}</span><p>{t(language === 'id' && narrative.detailId ? narrative.detailId : narrative.detail)}</p><small>{t(calendarLabel(narrative.year, narrative.week))}</small></article>)}</div></section> : null}
    <HardModeFinance game={game} setGame={setGame} language={language} />
    <section className="dashboard-grid">
      <div className="panel weekly-plan">
        <div className="panel-heading"><div><span className="eyebrow">Current fixture</span><h2>Week plan</h2></div><div className="panel-heading-actions"><button type="button" className="text-button" onClick={() => setView('schedule')}>Open schedule <ChevronRight size={17} /></button><button type="button" className="text-button" onClick={() => setView('training')}>Open training <ChevronRight size={17} /></button></div></div>
        <div className="week-days">{DAYS.map((day) => { const count = Object.keys(game.schedule).filter((key) => key.endsWith(`:${day}`)).length; return <div key={day} className={count ? 'booked' : ''}><span>{day}</span><strong>{count}</strong><small>{count === 1 ? 'assignment' : 'assignments'}</small></div>; })}</div>
        <div className="plan-footer"><span><CalendarDays size={18} /> {scheduled} activities booked</span><span><Dumbbell size={18} /> {plannedTraining} training sessions</span><span><Clock3 size={18} /> Resolve to advance</span></div>
      </div>
      <div className="panel form-watch">
        <div className="panel-heading"><div><span className="eyebrow">Selection watch</span><h2>High momentum</h2></div></div>
        <div className="member-list">{topMembers.map((member, index) => <button type="button" key={member.id} onClick={() => { setSelectedMember(member.id); setView('roster'); }}><span className="rank">{index + 1}</span><Portrait member={member} size="small" /><span className="member-copy"><strong>{displayName(member)}</strong><small>{member.generation} · POP {member.popularity}</small></span><span className={`energy-dot ${energyTone(member.energy)}`}>{member.energy}</span></button>)}</div>
      </div>
      <div className="panel last-result">
        <div className="panel-heading"><div><span className="eyebrow">Latest report</span><h2>{game.lastResult ? calendarLabel(game.week === 1 ? game.year - 1 : game.year, game.week === 1 ? BALANCE.weeksPerYear : game.week - 1) : 'Timeline opened'}</h2></div></div>
        {game.lastResult ? <><div className="result-score"><div><span>Net cash</span><strong className={game.lastResult.moneyDelta >= 0 ? 'positive' : 'negative'}>{game.lastResult.moneyDelta >= 0 ? '+' : ''}{money(game.lastResult.moneyDelta)}</strong></div><div><span>New fans</span><strong>+{number.format(game.lastResult.fanGain)}</strong></div><div><span>Activities</span><strong>{game.lastResult.activities}</strong></div></div>{game.lastResult.finances ? <div className="finance-breakdown"><div className="finance-column income"><h3>Income</h3><dl><div><dt>Theater tickets</dt><dd>{money(game.lastResult.finances.theater)}</dd></div><div><dt>Video Call</dt><dd>{money(game.lastResult.finances.videoCall)}</dd></div><div><dt>Meet & Greet</dt><dd>{money(game.lastResult.finances.meetGreet)}</dd></div><div><dt>Concerts</dt><dd>{money(game.lastResult.finances.concert)}</dd></div><div><dt>Annual campaigns</dt><dd>{money(game.lastResult.finances.campaign)}</dd></div><div><dt>Other income</dt><dd>{money(game.lastResult.finances.otherIncome)}</dd></div><div className="finance-total"><dt>Total income</dt><dd>{money(game.lastResult.finances.totalIncome)}</dd></div></dl></div><div className="finance-column expenses"><h3>Expenses</h3><dl><div><dt>Activity costs</dt><dd>{money(game.lastResult.finances.activityCosts)}</dd></div><div><dt>General operations</dt><dd>{money(game.lastResult.finances.generalOperations)}</dd></div><div><dt>Theater upkeep</dt><dd>{money(game.lastResult.finances.theaterUpkeep)}</dd></div><div className="finance-total"><dt>Total expenses</dt><dd>{money(game.lastResult.finances.totalExpenses)}</dd></div></dl></div></div> : <p className="finance-legacy-note">Resolve another week to generate the detailed income report.</p>}</> : <p className="empty-copy">Schedule first week to establish form and fan response.</p>}
        {game.lastResult?.baseFanGain > game.lastResult?.fanGain ? <p className="fan-cap-note">Base fan potential: {number.format(game.lastResult.baseFanGain)} · soft cap applied</p> : null}
      </div>
      <div className="panel roster-health">
         <div className="panel-heading"><div><span className="eyebrow">{t('Availability')}</span><h2>{t('Roster condition')}</h2><small className="roster-condition-note">{t(eligibleCount <= BALANCE.theaterMinimumMembers ? 'No theater replacement buffer remains.' : 'Eligible roster has replacement coverage.')}</small></div><span className={`danger-label danger-${rosterDanger.toLowerCase().replaceAll(' ', '-')}`}>{t(rosterDanger) || rosterDanger}</span></div>
        <div className="health-bar"><span style={{ width: `${game.members.filter((m) => m.energy >= 60 && ['active','trainee'].includes(m.status)).length / game.members.length * 100}%` }} /></div>
        <dl><div><dt>Theater eligible</dt><dd>{eligibleCount}</dd></div><div><dt>Tired</dt><dd>{game.members.filter((m) => m.energy < 60 && ['active','trainee'].includes(m.status)).length}</dd></div><div><dt>Unavailable</dt><dd>{game.members.filter((m) => m.status === 'suspended').length}</dd></div></dl>
      </div>
    </section>
  </div>;
}

function Schedule({ game, setGame, selectedMember, setSelectedMember, language = 'en' }) {
  const t = (value) => translate(language, value);
  const [activity, setActivity] = useState('theater');
  const [batchMode, setBatchMode] = useState(false);
  const [batchMemberIds, setBatchMemberIds] = useState([]);
  const [batchDay, setBatchDay] = useState(DAYS[0]);
  const [squadSortKey, setSquadSortKey] = useState('visible-stat');
  const [squadVisibleStat, setSquadVisibleStat] = useState('overall');
  const [squadSortDirection, setSquadSortDirection] = useState('desc');
  const [squadRosterFilter, setSquadRosterFilter] = useState('all');
  const [historyView, setHistoryView] = useState('week');
  const scheduleYears = useMemo(() => {
    const years = new Set([game.year]);
    (game.weeklyReports ?? []).forEach((report) => years.add(report.year));
    (game.concerts ?? []).forEach((concert) => years.add(concert.targetYear));
    (game.yearEndMeetGreets ?? []).forEach((event) => years.add(event.year));
    (game.fanEventPlans ?? []).forEach((plan) => years.add(plan.year));
    (game.singles ?? []).forEach((single) => {
      years.add(single.productionStartYear ?? single.year);
      if (single.releaseYear) years.add(single.releaseYear);
    });
    return [...years].filter(Number.isInteger).sort((a, b) => b - a);
  }, [game.concerts, game.fanEventPlans, game.singles, game.weeklyReports, game.year, game.yearEndMeetGreets]);
  const [historyYear, setHistoryYear] = useState(game.year);
  const [historyMonth, setHistoryMonth] = useState(Math.ceil(game.week / BALANCE.weeksPerMonth));
  const [historyWeek, setHistoryWeek] = useState(((game.week - 1) % BALANCE.weeksPerMonth) + 1);
  const [confirmTemplate, setConfirmTemplate] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [confirmLineup, setConfirmLineup] = useState(null);
   const [templateName, setTemplateName] = useState('Weekly Template');
   const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const activeMembers = useMemo(() => game.members.filter((member) => member.status !== 'graduated'), [game.members]);
  const sortedActiveMembers = useMemo(() => sortMembers(filterCoreTraineeMembers(activeMembers, squadRosterFilter), { sortKey: squadSortKey, visibleStat: squadVisibleStat, direction: squadSortDirection }), [activeMembers, squadRosterFilter, squadSortKey, squadVisibleStat, squadSortDirection]);
  const projectedEnergyByMember = useMemo(() => getProjectedEnergyByMember(game), [game]);
  const batchMemberSet = useMemo(() => new Set(batchMemberIds), [batchMemberIds]);
  const member = activeMembers.find((item) => item.id === selectedMember) ?? activeMembers[0];
  const memberProjectedEnergy = member ? projectedEnergyByMember[member.id] ?? member.energy : 0;
  useEffect(() => { if (!selectedMember && member) setSelectedMember(member.id); }, [member, selectedMember, setSelectedMember]);
  const theaterCounts = useMemo(() => Object.fromEntries(DAYS.map((day) => [day, game.members.reduce((count, item) => count + (game.schedule[`${item.id}:${day}`] === 'theater' ? 1 : 0), 0)])), [game.members, game.schedule]);
  const offAirCounts = useMemo(() => Object.fromEntries(DAYS.map((day) => [day, game.members.reduce((count, item) => count + (game.schedule[`${item.id}:${day}`] === 'offAir' ? 1 : 0), 0)])), [game.members, game.schedule]);
  const selectedHistoryWeek = (historyMonth - 1) * BALANCE.weeksPerMonth + historyWeek;
  const historySnapshot = useMemo(() => getScheduleSnapshotForWeek(game, historyYear, selectedHistoryWeek), [game, historyYear, selectedHistoryWeek]);
  const historyByDay = Object.fromEntries(DAYS.map((day) => {
    const activitiesForDay = Object.entries(historySnapshot.schedule ?? {}).filter(([key]) => key.endsWith(`:${day}`)).reduce((groups, [key, activityId]) => {
      const memberId = key.slice(0, key.lastIndexOf(':'));
      const historyMember = game.members.find((item) => item.id === memberId);
      const existing = groups.get(activityId) ?? { activityId, memberNames: [] };
      existing.memberNames.push(historyMember ? displayName(historyMember) : 'Former member');
      groups.set(activityId, existing);
      return groups;
    }, new Map());
    return [day, [...activitiesForDay.values()]];
  }));
  const toggleRequiredLineup = (day, activityId) => setGame((current) => {
    const schedule = { ...current.schedule };
    const isEligibleForLineup = (item) => canMemberPerform(item, activityId)
      && item.canPerformTheater !== false
      && !item.temporarilyUnavailable
      && !AUTOMATIC_ACTIVITY_LOCKS.includes(current.schedule[`${item.id}:${day}`]);
    current.members.forEach((item) => {
      const key = `${item.id}:${day}`;
      if (schedule[key] === activityId && !isEligibleForLineup(item)) delete schedule[key];
    });
    const selectedIds = new Set(current.members
      .filter((item) => schedule[`${item.id}:${day}`] === activityId)
      .map((item) => item.id));
    if (selectedIds.size >= 12) {
      current.members.forEach((item) => {
        const key = `${item.id}:${day}`;
        if (schedule[key] === activityId) delete schedule[key];
      });
      return { ...current, schedule };
    }
    const slotsToFill = 12 - selectedIds.size;
    const available = current.members
      .filter((item) => isEligibleForLineup(item) && !selectedIds.has(item.id))
      .sort((a, b) => b.energy - a.energy)
      .slice(0, slotsToFill);
    if (available.length !== slotsToFill) return { ...current, schedule };
    available.forEach((item) => { schedule[`${item.id}:${day}`] = activityId; });
    return { ...current, schedule };
  });
  const requestRequiredLineupToggle = (day, activityId, count) => setConfirmLineup({ day, activityId, empty: count >= 12 });
  const toggleBatchMode = () => {
    setBatchMode((current) => !current);
    setBatchMemberIds([]);
  };
  const chooseMember = (item) => {
    if (!batchMode) {
      setSelectedMember(item.id);
      return;
    }
    if (!['active', 'trainee'].includes(item.status) || (item.suspensionWeeks ?? 0) > 0) return;
    setBatchMemberIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
  };
  const applyBatchAssignment = () => {
    if (!batchMemberIds.length) return;
    setGame((current) => batchMemberIds.reduce((next, memberId) => assignActivity(next, memberId, batchDay, activity), current));
  };
  const selectableMemberIds = activeMembers.filter((item) => ['active', 'trainee'].includes(item.status) && (item.suspensionWeeks ?? 0) === 0).map((item) => item.id);
  const batchAssignmentValid = batchMemberIds.length > 0 && (activity !== 'offAir' || batchMemberIds.length === 12);
  const selectAllMembers = () => setBatchMemberIds(selectableMemberIds);
  const unselectAllMembers = () => setBatchMemberIds([]);
   const createTemplate = () => {
    const entries = Object.entries(game.schedule).filter(([, activityId]) => BALANCE.activities[activityId]?.schedulable !== false).map(([key, activityId]) => { const separator = key.lastIndexOf(':'); return { memberId: key.slice(0, separator), day: key.slice(separator + 1), activityId }; });
    if (!entries.length || !templateName.trim()) return;
    const theaterPlans = Object.fromEntries(DAYS.flatMap((day) => {
      const lineup = game.members.filter((item) => entries.some((entry) => entry.memberId === item.id && entry.day === day && entry.activityId === 'theater'));
      if (lineup.length !== 12) return [];
      const configured = game.theaterShows?.[day] ?? {};
      const setlistId = SETLIST_BY_ID[configured.setlistId] ? configured.setlistId : SETLISTS[0]?.id;
      const centerId = lineup.some((item) => item.id === configured.centerId) ? configured.centerId : rankMembersForSelection(lineup)[0]?.id;
      return setlistId && centerId ? [[day, { setlistId, centerId }]] : [];
    }));
    setGame((current) => ({ ...current, scheduleTemplates: [...(current.scheduleTemplates ?? []), { id: `template-${Date.now()}`, name: templateName.trim(), entries, theaterPlans, createdYear: current.year, createdWeek: current.week }] }));
    setConfirmTemplate(false);
   };
   const applySelectedTemplate = () => {
     const template = (game.scheduleTemplates ?? []).find((item) => item.id === selectedTemplateId);
     if (template) setGame((current) => applyScheduleTemplate(current, template));
   };
  return <div className="page schedule-page" data-history-view={historyView}>
    <section className="page-heading"><div><span className="eyebrow">Weekly operations</span><h1>Schedule</h1><p>Select member, activity, then day. Existing assignments can be replaced.</p></div><div className="legend"><span><i className="fresh" />Fresh</span><span><i className="tired" />Tired</span><span><i className="unavailable" />Unavailable</span></div></section>
     <div className="batch-toolbar"><button type="button" className={batchMode ? 'batch-toggle active' : 'batch-toggle'} onClick={toggleBatchMode} aria-pressed={batchMode}><Users size={17} /> Multiple select</button>{batchMode ? <><span><strong>{batchMemberIds.length}</strong> selected{activity === 'offAir' ? ' / 12 required' : ''}</span><button type="button" className="batch-select-all" disabled={batchMemberIds.length === selectableMemberIds.length} onClick={selectAllMembers}>{t('Select all')}</button><button type="button" className="batch-select-all" disabled={batchMemberIds.length === 0} onClick={unselectAllMembers}>{t('Unselect all')}</button><label>Day<select value={batchDay} onChange={(event) => setBatchDay(event.target.value)}>{DAYS.map((day) => <option key={day} value={day}>{day}</option>)}</select></label><button type="button" className="batch-apply" disabled={!batchAssignmentValid} onClick={() => setConfirmBatch(true)}><Check size={17} /> Apply activity</button></> : <><small>Assign one activity and day to several members.</small><label className="template-apply-select">Apply template<select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}><option value="">Choose saved template</option>{(game.scheduleTemplates ?? []).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><button type="button" className="batch-apply" disabled={!selectedTemplateId} onClick={applySelectedTemplate}>Apply</button><button type="button" className="save-template-button" disabled={!Object.values(game.schedule).some((activityId) => !AUTOMATIC_ACTIVITY_LOCKS.includes(activityId))} onClick={() => setConfirmTemplate(true)}><Save size={16} /> Save as template</button></>}</div>
    <div className="schedule-layout">
       <section className="roster-rail" aria-label="Member selection"><div className="rail-title"><strong>Squad</strong><span>{batchMode ? `${batchMemberIds.length}/${activeMembers.length}` : activeMembers.length}</span><CoreTraineeFilter value={squadRosterFilter} onChange={setSquadRosterFilter} label={t('Roster status')} id="schedule-roster-filter" translate={t} /><div className="squad-sort-controls" aria-label="Squad sorting"><label><span>{t('Sort by')}</span><select value={squadSortKey} onChange={(event) => setSquadSortKey(event.target.value)}><option value="visible-stat">{t('Stat')}</option>{SQUAD_SORT_OPTIONS.filter((key) => key !== 'visible-stat').map((key) => { const label = key === 'generation' ? 'Generation' : key[0].toUpperCase() + key.slice(1); return <option key={key} value={key}>{t(label)}</option>; })}</select></label>{squadSortKey === 'visible-stat' ? <label><span>{t('Stat')}</span><select value={squadVisibleStat} onChange={(event) => setSquadVisibleStat(event.target.value)}><option value="overall">{t('Overall')}</option>{VISIBLE_MEMBER_STAT_KEYS.map((key) => <option key={key} value={key}>{t(visibleStatLabel(key))}</option>)}</select></label> : null}<label><span>{t('Order')}</span><select value={squadSortDirection} onChange={(event) => setSquadSortDirection(event.target.value)}>{SORT_DIRECTIONS.map((direction) => { const label = direction === 'asc' ? 'Ascending' : 'Descending'; return <option key={direction} value={direction}>{t(label)}</option>; })}</select></label></div></div>{sortedActiveMembers.map((item) => { const preview = projectedEnergyByMember[item.id] ?? item.energy; return <button type="button" key={item.id} disabled={batchMode && (!['active','trainee'].includes(item.status) || (item.suspensionWeeks ?? 0) > 0)} className={batchMode ? (batchMemberSet.has(item.id) ? 'batch-selected' : '') : (item.id === member?.id ? 'selected' : '')} onClick={() => chooseMember(item)} aria-pressed={batchMode ? batchMemberSet.has(item.id) : item.id === member?.id}><Portrait member={item} size="tiny" /><span><strong>{displayName(item)}</strong><small>{item.generation}</small>{injuryLabel(item) ? <small className="injury-label">{injuryLabel(item)}</small> : null}</span>{batchMode ? <Check className="batch-check" size={16} /> : <b className={energyTone(preview)}>{preview}</b>}</button>; })}</section>
      {member ? <section className="scheduler">
         <div className="selected-player"><Portrait member={member} size="large" /><div><span>{member.generation} · {member.team || 'JKT48'}</span><h2>{member.name}</h2><p>{member.archetype} · {member.traits.join(', ')}</p>{injuryLabel(member) ? <strong className="injury-label">{injuryLabel(member)}</strong> : null}</div><div className={`energy-box ${energyTone(memberProjectedEnergy)}`}><span>Projected Energy</span><strong>{memberProjectedEnergy}</strong></div></div>
         {member.status === 'suspended' ? <div className="suspension"><ShieldAlert size={21} /><div><strong>Member punished</strong><span>{member.suspensionWeeks} week(s) remaining</span></div></div> : injuryLabel(member) ? <div className="suspension injury-notice"><ShieldAlert size={21} /><div><strong>{member.injury.label} injury</strong><span>{member.injury.weeksRemaining} week(s) remaining</span></div></div> : null}
        <div className="activity-picker"><label htmlFor="activity">{t('Assignment')}</label><select id="activity" value={activity} onChange={(event) => setActivity(event.target.value)}>{SCHEDULE_ACTIVITY_GROUPS.map((group) => <optgroup key={group.label} label={t(group.label)}>{group.activities.map((id) => { const item = BALANCE.activities[id]; return <option key={id} value={id}>{t(item.label)} · {activityEnergyLabel(item)} {t('energy')}</option>; })}</optgroup>)}{SCHEDULE_STANDALONE_ACTIVITIES.map((id) => { const item = BALANCE.activities[id]; return <option key={id} value={id}>{t(item.label)} · {activityEnergyLabel(item)} {t('energy')}</option>; })}</select></div>
        <div className="theater-lineups"><div><Building2 size={18} /><span><strong>Theater requires 12 members</strong><small>Incomplete lineups cancel without fatigue or revenue.</small></span></div>{DAYS.map((day) => theaterCounts[day] > 0 ? <button type="button" key={day} className={theaterCounts[day] >= 12 ? 'ready clearable' : ''} onClick={() => requestRequiredLineupToggle(day, 'theater', theaterCounts[day])}><span>{t(day)}</span><strong>{theaterCounts[day]}/12</strong>{t(theaterCounts[day] >= 12 ? 'Empty' : 'Fill')}</button> : null)}</div>
        <div className="theater-lineups off-air-lineups"><div><Clapperboard size={18} /><span><strong>Off-air performance requires 12 members</strong><small>Income uses the total Popularity of the complete lineup.</small></span></div>{DAYS.map((day) => offAirCounts[day] > 0 ? <button type="button" key={day} className={offAirCounts[day] >= 12 ? 'ready clearable' : ''} onClick={() => requestRequiredLineupToggle(day, 'offAir', offAirCounts[day])}><span>{t(day)}</span><strong>{offAirCounts[day]}/12</strong>{t(offAirCounts[day] >= 12 ? 'Empty' : 'Fill')}</button> : null)}</div>
        <TheaterPlanner game={game} setGame={setGame} theaterCounts={theaterCounts} />
         <div className="calendar-row">{DAYS.map((day) => { const key = `${member.id}:${day}`; const existing = game.schedule[key]; const locked = AUTOMATIC_ACTIVITY_LOCKS.includes(existing); const plan = fanEventPlanFor(game, member.id, day, existing); return <button type="button" key={day} disabled={!['active','trainee'].includes(member.status) || locked} className={existing ? `assigned${locked ? ' locked' : ''}` : 'rest-day'} onClick={() => setGame((current) => assignActivity(current, member.id, day, existing === activity ? 'clear' : activity))}><span>{t(day)}</span><strong>{plan?.customTitle ? <span data-i18n-ignore="true">{plan.title}</span> : t(plan?.title ?? (existing ? BALANCE.activities[existing].label : 'Rest'))}</strong><small>{t(locked ? 'Campaign date locked' : existing === 'theater' ? `Lineup ${theaterCounts[day]}/12 · ${activityEnergyLabel(BALANCE.activities[existing])} energy` : existing === 'offAir' ? `Lineup ${offAirCounts[day]}/12 · ${activityEnergyLabel(BALANCE.activities[existing])} energy` : existing ? `${activityEnergyLabel(BALANCE.activities[existing])} base energy` : 'Unassigned day restores energy')}</small></button>; })}</div>
        <div className="member-stats">{VISIBLE_MEMBER_STAT_KEYS.map((key) => <div key={key}><span>{visibleStatLabel(key)}</span><div><i style={{ width: `${member[key]}%` }} /></div><strong>{Math.round(member[key])}</strong></div>)}<div key="popularity"><span>{t('Popularity')}</span><div><i style={{ width: `${Math.max(0, Math.min(100, Number(member.popularity ?? 0)))}%` }} /></div><strong>{Math.round(member.popularity ?? 0)}</strong></div></div>
      </section> : null}
    </div>
    <div className="schedule-history-view-switcher" role="tablist" aria-label={t('Schedule history view')}><button type="button" className={historyView === 'week' ? 'active' : ''} aria-selected={historyView === 'week'} onClick={() => setHistoryView('week')}>{t('Week')}</button><button type="button" className={historyView === 'month' ? 'active' : ''} aria-selected={historyView === 'month'} onClick={() => setHistoryView('month')}>{t('Month')}</button><button type="button" className={historyView === 'year' ? 'active' : ''} aria-selected={historyView === 'year'} onClick={() => setHistoryView('year')}>{t('Year')}</button><label>{t('Year')}<select value={historyYear} onChange={(event) => setHistoryYear(Number(event.target.value))}>{scheduleYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label></div>
    {historyView === 'year' ? <ScheduleYearCalendar game={game} year={historyYear} language={language} /> : historyView === 'month' ? <ScheduleYearCalendar game={game} year={historyYear} focusMonth={historyMonth} language={language} /> : null}
    <section className="schedule-history"><div className="schedule-history-head"><div className="schedule-history-title"><span className="eyebrow">{t('Resolved & confirmed schedules')}</span><div><h2>{t('Schedule history')}</h2>{historySnapshot.kind !== 'missing' ? <span className={`schedule-history-status ${historySnapshot.kind}`}>{t(historySnapshot.kind === 'resolved' ? 'Resolved' : 'Confirmed')}</span> : null}</div></div><div className="schedule-history-filters"><label>{t('Year')}<select value={historyYear} onChange={(event) => setHistoryYear(Number(event.target.value))}>{scheduleYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label><label>{t('Month')}<select value={historyMonth} onChange={(event) => setHistoryMonth(Number(event.target.value))}>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{t(month)}</option>)}</select></label><div className="history-week-tabs" aria-label={t('Schedule history week')}>{[1, 2, 3, 4].map((week) => <button type="button" key={week} className={historyWeek === week ? 'active' : ''} aria-pressed={historyWeek === week} onClick={() => setHistoryWeek(week)}>W{week}</button>)}</div></div></div>{historySnapshot.schedule ? <div className="schedule-history-days">{DAYS.map((day) => <article key={day}><h3>{t(day)}</h3>{historyByDay[day].length ? <ul>{historyByDay[day].map(({ activityId, memberNames }) => <li key={activityId}><strong>{t(BALANCE.activities[activityId]?.label ?? activityId)}</strong><span>{memberNames.map((name) => name === 'Former member' ? t(name) : name).join(', ')}</span></li>)}</ul> : <p>{t('No assignments')}</p>}</article>)}</div> : <div className="schedule-history-empty"><CalendarDays aria-hidden="true" size={24} /><strong>{t('No schedule recorded')}</strong><span>{t(historySnapshot.kind === 'resolved' ? 'This older report has no schedule snapshot.' : historySnapshot.kind === 'confirmed' ? 'No confirmed assignments exist for this week.' : 'No resolved report exists for this week.')}</span></div>}</section>
    {confirmBatch ? <ModalPortal><div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmBatch(false); }}><section className="confirm-week-modal" role="dialog" aria-modal="true" aria-labelledby="batch-confirm-title"><div className="confirm-week-icon"><Users size={24} /></div><h2 id="batch-confirm-title">{t('Confirm group assignment?')}</h2><p>{t(`Assign ${BALANCE.activities[activity].label} to ${batchMemberIds.length} selected members on ${batchDay}. Locked or unavailable schedules will remain unchanged.`)}</p><div className="confirm-week-actions"><button type="button" className="secondary-button" onClick={() => setConfirmBatch(false)}>{t('Cancel')}</button><button type="button" className="setup-primary" onClick={() => { applyBatchAssignment(); setConfirmBatch(false); }}>{t('Confirm assignment')} <ChevronRight size={18} /></button></div></section></div></ModalPortal> : null}
    {confirmLineup ? <ConfirmationModal title={t('Confirm lineup change?')} description={confirmLineup.empty ? `${t('Remove all members from this lineup')} · ${t(confirmLineup.activityId === 'theater' ? 'Theater' : 'Off-air')} · ${t(confirmLineup.day)}?` : `${t('Fill this lineup with 12 eligible members')} · ${t(confirmLineup.activityId === 'theater' ? 'Theater' : 'Off-air')} · ${t(confirmLineup.day)}. ${t('Injured or unavailable members will be skipped.')}`} confirmLabel={t(confirmLineup.empty ? 'Empty' : 'Fill')} cancelLabel={t('Cancel')} onCancel={() => setConfirmLineup(null)} onConfirm={() => { toggleRequiredLineup(confirmLineup.day, confirmLineup.activityId); setConfirmLineup(null); }} icon={confirmLineup.empty ? <Trash2 size={22} /> : <Users size={22} />} destructive={confirmLineup.empty} /> : null}
    {confirmTemplate ? <ModalPortal><div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmTemplate(false); }}><section className="confirm-week-modal" role="dialog" aria-modal="true" aria-labelledby="template-confirm-title"><div className="confirm-week-icon"><Archive size={24} /></div><h2 id="template-confirm-title">{t('Create weekly template?')}</h2><p>{t('Copy current assignments, theater setlists, and centers except automatic campaign and event locks. Seitansai and Last Show flags are not saved.')}</p><label className="template-name-field">{t('Template name')}<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} maxLength={40} /></label><div className="confirm-week-actions"><button type="button" className="secondary-button" onClick={() => setConfirmTemplate(false)}>{t('Cancel')}</button><button type="button" className="setup-primary" onClick={createTemplate} disabled={!templateName.trim()}>{t('Create template')} <ChevronRight size={18} /></button></div></section></div></ModalPortal> : null}
  </div>;
}

function Training({ game, setGame, selectedMember, setSelectedMember, language = 'en' }) {
  const t = (value) => translate(language, value);
  const [batchMode, setBatchMode] = useState(false);
  const [batchMemberIds, setBatchMemberIds] = useState([]);
  const [batchActivity, setBatchActivity] = useState('vocal');
  const [batchMessage, setBatchMessage] = useState('');
  const [trainingQuery, setTrainingQuery] = useState('');
  const [trainingGeneration, setTrainingGeneration] = useState('all');
  const [trainingRosterStatus, setTrainingRosterStatus] = useState('all');
  const [trainingAvailability, setTrainingAvailability] = useState('all');
  const [trainingSortKey, setTrainingSortKey] = useState('stat');
  const [trainingVisibleStat, setTrainingVisibleStat] = useState('overall');
  const [trainingSortDirection, setTrainingSortDirection] = useState('desc');
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [editingTemplateName, setEditingTemplateName] = useState('');
  const [pendingTemplateDelete, setPendingTemplateDelete] = useState(null);
  const [historyYear, setHistoryYear] = useState(game.year);
  const [historyMonth, setHistoryMonth] = useState(Math.ceil(game.week / BALANCE.weeksPerMonth));
  const [historyWeek, setHistoryWeek] = useState(((game.week - 1) % BALANCE.weeksPerMonth) + 1);
  const [historyPage, setHistoryPage] = useState(1);
  const activeMembers = useMemo(() => game.members.filter((item) => item.status !== 'graduated'), [game.members]);
  const projectedEnergyByMember = useMemo(() => getProjectedEnergyByMember(game), [game]);
  const trainingStatuses = useMemo(() => Object.fromEntries(activeMembers.map((item) => [item.id, getTrainingPlanStatus(game, item.id)])), [activeMembers, game]);
  const batchMemberSet = useMemo(() => new Set(batchMemberIds), [batchMemberIds]);
  const trainingGenerations = useMemo(() => [...new Set(activeMembers.map((item) => item.generation).filter(Boolean))].sort((first, second) => String(first).localeCompare(String(second), undefined, { numeric: true })), [activeMembers]);
  const visibleTrainingMembers = useMemo(() => {
    const query = trainingQuery.trim().toLocaleLowerCase();
    const decorated = activeMembers.map((item) => ({
      ...item,
      projectedEnergy: projectedEnergyByMember[item.id] ?? item.energy,
      plannedSessions: game.trainingPlans?.[item.id]?.length ?? 0,
    })).filter((item) => {
      const matchesQuery = !query || `${item.name ?? ''} ${item.nickname ?? ''}`.toLocaleLowerCase().includes(query);
      const matchesGeneration = trainingGeneration === 'all' || item.generation === trainingGeneration;
      const isTrainee = item.status === 'trainee';
      const matchesRosterStatus = trainingRosterStatus === 'all' || (trainingRosterStatus === 'trainee' ? isTrainee : !isTrainee);
      const isAvailable = Boolean(trainingStatuses[item.id]?.available);
      const matchesAvailability = trainingAvailability === 'all' || (trainingAvailability === 'available' ? isAvailable : !isAvailable);
      return matchesQuery && matchesGeneration && matchesRosterStatus && matchesAvailability;
    });
    return sortMembers(decorated, {
      sortKey: trainingSortKey === 'stat' ? 'visible-stat' : trainingSortKey,
      visibleStat: trainingVisibleStat,
      direction: trainingSortDirection,
    });
  }, [activeMembers, game.trainingPlans, projectedEnergyByMember, trainingAvailability, trainingGeneration, trainingQuery, trainingRosterStatus, trainingSortDirection, trainingSortKey, trainingStatuses, trainingVisibleStat]);
  const member = visibleTrainingMembers.find((item) => item.id === selectedMember) ?? visibleTrainingMembers[0];
  const memberPlan = member ? game.trainingPlans?.[member.id] ?? [] : [];
  const memberStatus = member ? trainingStatuses[member.id] : null;
  const reportYears = [...new Set((game.weeklyReports ?? []).map((report) => report.year))].sort((left, right) => right - left);
  const historyReport = (game.weeklyReports ?? []).find((report) => report.year === historyYear && report.week === (historyMonth - 1) * BALANCE.weeksPerMonth + historyWeek);
  const historySessions = historyReport?.trainingSessions ?? [];
  const historyPageCount = Math.max(1, Math.ceil(historySessions.length / TRAINING_HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, historyPageCount);
  const pagedHistorySessions = historySessions.slice((safeHistoryPage - 1) * TRAINING_HISTORY_PAGE_SIZE, safeHistoryPage * TRAINING_HISTORY_PAGE_SIZE);
  const trainingTemplates = game.trainingTemplates ?? [];
  const plannedCost = memberPlan.slice(0, memberStatus?.capacity ?? 0).reduce((sum, activityId) => sum + (BALANCE.activities[activityId]?.cost ?? 0), 0);

  useEffect(() => { if (member && member.id !== selectedMember) setSelectedMember(member.id); }, [member, selectedMember, setSelectedMember]);
  useEffect(() => { setHistoryPage(1); }, [historyYear, historyMonth, historyWeek]);

  const chooseMember = (item) => {
    if (batchMode) {
      if (!trainingStatuses[item.id]?.available) return;
      setBatchMemberIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
    } else setSelectedMember(item.id);
  };
  const toggleBatchMode = () => {
    setBatchMode((current) => !current);
    setBatchMemberIds([]);
    setBatchMessage('');
  };
  const applyBatchTraining = () => {
    let next = game;
    let added = 0;
    batchMemberIds.forEach((memberId) => {
      const before = next.trainingPlans?.[memberId]?.length ?? 0;
      next = queueTrainingSession(next, memberId, batchActivity);
      if ((next.trainingPlans?.[memberId]?.length ?? 0) > before) added += 1;
    });
    setGame(next);
    setBatchMessage(t(`${added} session(s) added; ${batchMemberIds.length - added} skipped.`));
  };
  const saveTemplate = () => {
    const next = saveTrainingTemplate(game, templateName);
    if (next !== game) {
      setGame(next);
      setTemplateName('');
    }
  };
  const applySelectedTemplate = () => {
    const template = trainingTemplates.find((item) => item.id === selectedTemplateId);
    if (template) setGame((current) => applyTrainingTemplate(current, template));
  };
  const startRenameTemplate = (template) => {
    setEditingTemplateId(template.id);
    setEditingTemplateName(template.name);
  };
  const commitTemplateRename = () => {
    setGame((current) => renameTrainingTemplate(current, editingTemplateId, editingTemplateName));
    setEditingTemplateId(null);
    setEditingTemplateName('');
  };

  return <div className="page training-page">
    <section className="page-heading"><div><h1>{t('Training')}</h1><p>{t('Build an ordered training queue. Sessions use the earliest free days; unfinished sessions carry into next week.')}</p></div><div className="training-summary"><span>{t('Planned sessions')}</span><strong>{Object.values(game.trainingPlans ?? {}).reduce((sum, sessions) => sum + sessions.length, 0)}</strong></div></section>
    <div className="training-batch-toolbar">
      <button type="button" className={batchMode ? 'batch-toggle active' : 'batch-toggle'} onClick={toggleBatchMode} aria-pressed={batchMode}><Users aria-hidden="true" size={17} /> {t('Multiple select')}</button>
      {batchMode ? <><span><strong>{batchMemberIds.length}</strong> {t('selected')}</span><label>{t('Training session')}<select value={batchActivity} onChange={(event) => setBatchActivity(event.target.value)}>{TRAINING_ACTIVITY_GROUPS.map((group) => <optgroup key={group.label} label={t(group.label)}>{group.activities.map((activityId) => <option key={activityId} value={activityId}>{t(BALANCE.activities[activityId].label)}</option>)}</optgroup>)}</select></label><button type="button" className="batch-apply" disabled={!batchMemberIds.length} onClick={applyBatchTraining}><Plus aria-hidden="true" size={16} /> {t('Add to selected')}</button></> : <span>{t('Select members to append the same session to each available queue.')}</span>}
      <p className="training-batch-message" aria-live="polite">{batchMessage}</p>
    </div>

    <div className="training-layout">
      <section className="training-member-rail" aria-label={t('Member selection')}>
        <header className="training-member-controls"><div><strong>{t('Squad')}</strong><span>{visibleTrainingMembers.length}/{activeMembers.length}</span></div><label className="training-search"><span>{t('Search')}</span><input type="search" value={trainingQuery} onChange={(event) => setTrainingQuery(event.target.value)} placeholder={t('Name or nickname')} /></label><div className="training-filter-grid"><label><span>{t('Generation')}</span><select value={trainingGeneration} onChange={(event) => setTrainingGeneration(event.target.value)}><option value="all">{t('All generations')}</option>{trainingGenerations.map((generation) => <option key={generation} value={generation}>{generation}</option>)}</select></label><label><span>{t('Roster status')}</span><select value={trainingRosterStatus} onChange={(event) => setTrainingRosterStatus(event.target.value)}><option value="all">{t('All members')}</option><option value="regular">{t('Regular')}</option><option value="trainee">{t('Trainee')}</option></select></label><label><span>{t('Availability')}</span><select value={trainingAvailability} onChange={(event) => setTrainingAvailability(event.target.value)}><option value="all">{t('All availability')}</option><option value="available">{t('Available')}</option><option value="unavailable">{t('Unavailable')}</option></select></label><label><span>{t('Sort by')}</span><select value={trainingSortKey} onChange={(event) => setTrainingSortKey(event.target.value)}><option value="stat">{t('Stat')}</option><option value="name">{t('Name')}</option><option value="generation">{t('Generation')}</option><option value="birthday">{t('Birthday')}</option><option value="status">{t('Status')}</option></select></label>{trainingSortKey === 'stat' ? <label><span>{t('Stat')}</span><select value={trainingVisibleStat} onChange={(event) => setTrainingVisibleStat(event.target.value)}><option value="overall">{t('Overall')}</option>{VISIBLE_MEMBER_STAT_KEYS.map((key) => <option key={key} value={key}>{t(visibleStatLabel(key))}</option>)}<option value="popularity">{t('Popularity')}</option><option value="energy">{t('Energy')}</option><option value="projectedEnergy">{t('Projected Energy')}</option><option value="plannedSessions">{t('Planned sessions')}</option></select></label> : null}<label><span>{t('Order')}</span><select value={trainingSortDirection} onChange={(event) => setTrainingSortDirection(event.target.value)}><option value="asc">{t('Ascending')}</option><option value="desc">{t('Descending')}</option></select></label></div></header>
        <div className="training-member-list">
        {visibleTrainingMembers.map((item) => {
          const status = trainingStatuses[item.id];
          const planned = game.trainingPlans?.[item.id]?.length ?? 0;
          const projected = projectedEnergyByMember[item.id] ?? item.energy;
          return <button type="button" key={item.id} disabled={batchMode && !status.available} className={batchMode ? (batchMemberSet.has(item.id) ? 'batch-selected' : '') : (item.id === member?.id ? 'selected' : '')} onClick={() => chooseMember(item)} aria-pressed={batchMode ? batchMemberSet.has(item.id) : item.id === member?.id}><Portrait member={item} size="tiny" /><span><strong>{displayName(item)}</strong><small>{planned}/{status.capacity} {t('sessions')} · {t(status.available ? 'Available' : 'Unavailable')}</small></span><b className={energyTone(projected)} aria-label={`${t('Energy')} ${item.energy}; ${t('Projected Energy')} ${projected}`}><small>E</small><span>{item.energy}→{projected}</span></b></button>;
        })}
        {!visibleTrainingMembers.length ? <div className="training-member-empty" role="status"><UserRoundSearch aria-hidden="true" size={24} /><strong>{t('No members match')}</strong><span>{t('Change the search, filters, or availability selection.')}</span></div> : null}
        </div>
      </section>

      {member ? <section className="training-workspace">
        <header className="training-member-head"><Portrait member={member} size="large" /><div><span>{member.generation} · {member.team || 'JKT48'}</span><h2>{member.name}</h2><p>{t('Queue order determines which free day and Energy band each session uses.')}</p></div><div className={`energy-box ${energyTone(projectedEnergyByMember[member.id] ?? member.energy)}`}><span>{t('Projected Energy')}</span><strong>{projectedEnergyByMember[member.id] ?? member.energy}</strong></div></header>
        {!memberStatus.available ? <div className="training-warning" role="status"><ShieldAlert aria-hidden="true" size={19} /><span>{t('This member cannot train while injured, suspended, or unavailable. Queued sessions carry into next week.')}</span></div> : memberStatus.overflow ? <div className="training-warning" role="status"><ShieldAlert aria-hidden="true" size={19} /><span>{t(`${memberStatus.overflow} session(s) will carry into next week because Schedule now occupies those days.`)}</span></div> : null}

        <div className="training-capacity-strip"><span><small>{t('Free days')}</small><strong>{memberStatus.freeDays.map((day) => t(day)).join(', ') || t('None')}</strong></span><span><small>{t('Queue')}</small><strong>{memberPlan.length}/{memberStatus.capacity}</strong></span><span><small>{t('Planned cost')}</small><strong>{money(plannedCost)}</strong></span></div>

        <div className="training-builder">
          <section className="training-skill-picker"><div className="training-section-head"><div><h3>{t('Choose Training')}</h3><p>{t('Add Light, Regular, or Intensive work to the end of this member’s queue.')}</p></div></div><div className="training-skill-grid">{TRAINING_SKILLS.map((skill) => <article key={skill}><header><span>{t(visibleStatLabel(skill))}</span><strong>{Math.round(member[skill] * 10) / 10}</strong></header><div>{TRAINING_ACTIVITY_GROUPS.map((group) => { const activityId = group.activities[TRAINING_SKILLS.indexOf(skill)]; const activity = BALANCE.activities[activityId]; return <button type="button" key={activityId} disabled={!memberStatus.available || memberPlan.length >= memberStatus.capacity || memberPlan.length >= BALANCE.training.maxSessionsPerMember} onClick={() => setGame((current) => queueTrainingSession(current, member.id, activityId))}><span>{t(group.label.replace(' training', ''))}</span><small>{activityEnergyLabel(activity)} {t('energy')} · {money(activity.cost)}</small></button>; })}</div></article>)}</div></section>

          <section className="training-queue"><div className="training-section-head"><div><h3>{t('Session Queue')}</h3><p>{t('First session uses the earliest free day; unfinished sessions carry into next week.')}</p></div>{memberPlan.length ? <button type="button" className="text-button" onClick={() => setGame((current) => clearTrainingPlan(current, member.id))}>{t('Clear queue')}</button> : null}</div>{memberPlan.length ? <ol>{memberPlan.map((activityId, index) => { const activity = BALANCE.activities[activityId]; const carriesOver = !memberStatus.available || index >= memberStatus.capacity; const assignedDay = carriesOver ? null : memberStatus.freeDays[index]; return <li key={`${activityId}-${index}`} className={carriesOver ? 'at-risk' : ''}><span className="training-order">{index + 1}</span><div><strong>{t(activity.label)}</strong><small>{assignedDay ? t(assignedDay) : t('Will carry into next week')} · {activityEnergyLabel(activity)} {t('energy')} · {money(activity.cost)}</small></div><div className="training-queue-actions"><IconButton label={t('Move session up')} disabled={index === 0} onClick={() => setGame((current) => moveTrainingSession(current, member.id, index, index - 1))}><ArrowUp aria-hidden="true" size={16} /></IconButton><IconButton label={t('Move session down')} disabled={index === memberPlan.length - 1} onClick={() => setGame((current) => moveTrainingSession(current, member.id, index, index + 1))}><ArrowDown aria-hidden="true" size={16} /></IconButton><IconButton label={t('Remove session')} onClick={() => setGame((current) => removeTrainingSession(current, member.id, index))}><X aria-hidden="true" size={16} /></IconButton></div></li>; })}</ol> : <div className="training-empty"><Dumbbell aria-hidden="true" size={26} /><strong>{t('No Training Planned')}</strong><span>{t('Choose a skill and intensity to use this member’s free days.')}</span></div>}</section>
        </div>
      </section> : null}
    </div>

    <section className="training-templates"><div className="training-section-head"><div><h2>{t('Training Templates')}</h2><p>{t('Save and reuse ordered member training plans.')}</p></div></div><div className="training-template-toolbar"><label>{t('Template name')}<input name="training-template-name" autoComplete="off" maxLength={40} value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder={t('Example: Vocal development…')} /></label><button type="button" disabled={!templateName.trim() || !Object.values(game.trainingPlans ?? {}).some((sessions) => sessions.length)} onClick={saveTemplate}><Save aria-hidden="true" size={16} /> {t('Save template')}</button>{trainingTemplates.length ? <><label>{t('Apply template')}<select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}><option value="">{t('Choose training template')}</option>{trainingTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><button type="button" disabled={!selectedTemplateId} onClick={applySelectedTemplate}><Check aria-hidden="true" size={16} /> {t('Apply')}</button></> : null}</div>{trainingTemplates.length ? <div className="training-template-list">{trainingTemplates.map((template) => <article key={template.id}>{editingTemplateId === template.id ? <label>{t('Template name')}<input name={`training-template-${template.id}`} autoComplete="off" maxLength={40} value={editingTemplateName} onChange={(event) => setEditingTemplateName(event.target.value)} /></label> : <div><span>{t(`Year ${template.createdYear}`)} · {t('Week')} {template.createdWeek}</span><strong>{template.name}</strong><small>{template.entries.reduce((sum, entry) => sum + entry.sessions.length, 0)} {t('sessions')}</small></div>}<div>{editingTemplateId === template.id ? <><button type="button" disabled={!editingTemplateName.trim()} onClick={commitTemplateRename}>{t('Save name')}</button><button type="button" className="secondary-button" onClick={() => setEditingTemplateId(null)}>{t('Cancel')}</button></> : <><button type="button" onClick={() => setGame((current) => applyTrainingTemplate(current, template))}>{t('Apply')}</button><button type="button" className="secondary-button" onClick={() => startRenameTemplate(template)}><Pencil aria-hidden="true" size={15} /> {t('Rename')}</button><IconButton label={t(`Delete ${template.name}`)} onClick={() => setPendingTemplateDelete(template)}><Trash2 aria-hidden="true" size={16} /></IconButton></>}</div></article>)}</div> : <div className="training-template-empty"><span>{t('No training templates saved.')}</span></div>}</section>

    <section className="training-history"><div className="schedule-history-head"><div><h2>{t('Training History')}</h2><p>{t('Completed and skipped sessions from resolved weeks.')}</p></div><div className="schedule-history-filters"><label>{t('Year')}<select value={historyYear} onChange={(event) => setHistoryYear(Number(event.target.value))}>{(reportYears.length ? reportYears : [game.year]).map((year) => <option key={year} value={year}>{year}</option>)}</select></label><label>{t('Month')}<select value={historyMonth} onChange={(event) => setHistoryMonth(Number(event.target.value))}>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{t(month)}</option>)}</select></label><div className="history-week-tabs" aria-label={t('Training history week')}>{[1, 2, 3, 4].map((week) => <button type="button" key={week} className={historyWeek === week ? 'active' : ''} aria-pressed={historyWeek === week} onClick={() => setHistoryWeek(week)}>W{week}</button>)}</div></div></div>{historySessions.length ? <><div className="training-history-table-wrap"><table aria-label={t('Training History')}><thead><tr><th>{t('Member')}</th><th>{t('Session')}</th><th>{t('Day')}</th><th>{t('Energy')}</th><th>{t('Cost')}</th><th>{t('Result')}</th></tr></thead><tbody>{pagedHistorySessions.map((session, index) => <tr key={`${session.memberId}-${session.order}-${(safeHistoryPage - 1) * TRAINING_HISTORY_PAGE_SIZE + index}`}><td>{session.memberName ?? game.members.find((item) => item.id === session.memberId)?.name ?? t('Former member')}</td><td>{t(BALANCE.activities[session.activityId]?.label ?? session.activityId)}</td><td>{session.day ? t(session.day) : '—'}</td><td>{session.energyUsed ?? '—'}</td><td>{session.cost ? money(session.cost) : '—'}</td><td><span className={session.status}>{session.status === 'completed' ? <>{t(visibleStatLabel(session.skill))} {session.before ?? '—'} → {session.after ?? '—'} ({session.delta > 0 ? '+' : ''}{session.delta ?? '—'})</> : t(`Skipped: ${session.reason}`)}</span></td></tr>)}</tbody></table></div>{historyPageCount > 1 ? <nav className="training-history-pagination" aria-label={t('Training history pagination')}><button type="button" disabled={safeHistoryPage <= 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}>{t('Previous')}</button><span>{t('Page')} {safeHistoryPage} {t('of')} {historyPageCount}</span><button type="button" disabled={safeHistoryPage >= historyPageCount} onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))}>{t('Next')}</button></nav> : null}</> : <div className="training-history-empty"><Dumbbell aria-hidden="true" size={25} /><strong>{t('No Training Recorded')}</strong><span>{t(historyReport ? 'This week has no training sessions.' : 'No resolved report exists for this week.')}</span></div>}</section>

    {pendingTemplateDelete ? <ConfirmationModal title={t(`Delete ${pendingTemplateDelete.name}?`)} description={t('This training template will be removed permanently. Current weekly plans are not changed.')} confirmLabel={t('Delete template')} destructive onCancel={() => setPendingTemplateDelete(null)} onConfirm={() => { setGame((current) => deleteTrainingTemplate(current, pendingTemplateDelete.id)); setPendingTemplateDelete(null); }} icon={<Trash2 size={24} />} /> : null}
  </div>;
}

function MemberFanProfile({ game, member, language = 'en' }) {
  const t = (value) => translate(language, value);
  const demand = [...(game.demandHistory ?? [])].filter((record) => record.memberId === member.id).slice(-6).reverse();
  const composition = member.fanComposition ?? { core: 25, casual: 25, digital: 25, event: 25 };
  return <section className="member-fan-profile"><div><span className="eyebrow">{t('Fan profile')}</span><h3>{t('Demand and composition')}</h3></div><div className="fan-composition">{Object.entries(composition).map(([key, value]) => <span key={key}><small>{t(key)}</small><strong>{value}%</strong></span>)}<span><small>{t('oshi sentiment')}</small><strong>{member.oshiSentiment >= 0 ? '+' : ''}{member.oshiSentiment ?? 0}</strong></span></div>{demand.length ? <div className="member-demand-list">{demand.map((record) => <article key={record.id}><span><strong>{record.type === 'videoCall' ? 'Video Call' : 'Meet & Greet'}</strong><small>{t(calendarLabel(record.year, record.week))}</small></span><b>{record.sold}/{record.capacity}</b><small>{t(`${record.unmetDemand} unmet`)}</small></article>)}</div> : <p>{t('No resolved fan-event demand yet.')}</p>}</section>;
}

function TraineeDevelopment({ game, member, setGame, language = 'en' }) {
  const t = (value) => translate(language, value);
  const mentors = game.members.filter((candidate) => candidate.status === 'active' && (candidate.careerStage === 'Veteran' || candidate.graduationPending));
  const activeMentorship = (game.mentorships ?? []).find((item) => item.menteeId === member.id && item.status === 'active');
  const [mentorId, setMentorId] = useState(mentors[0]?.id ?? '');
  if (member.status !== 'trainee') return null;
  const promotion = getTraineePromotionStatus(game, member.id);
  return <section className="trainee-development"><div><span className="eyebrow">{t('Trainee development')}</span><h3>{t('Promotion path')}</h3></div><div className="trainee-milestones"><span><small>{t('Tenure')}</small><strong>{promotion.traineeWeeks ?? 0}/{BALANCE.trainee.minimumWeeks}</strong></span><span><small>{t('Training')}</small><strong>{Math.round(promotion.trainingProgress ?? 0)}/{BALANCE.trainee.minimumTrainingProgress}</strong></span><span><small>{t('Theater')}</small><strong>{promotion.theaterAppearances ?? 0}/{BALANCE.trainee.minimumTheaterAppearances}</strong></span></div>{activeMentorship ? <div className="mentorship-status"><strong>{t('Mentorship active')}</strong><span>{game.members.find((candidate) => candidate.id === activeMentorship.mentorId)?.nickname ?? t('Veteran mentor')} · {activeMentorship.durationWeeks} {t('weeks')}</span></div> : mentors.length ? <div className="mentorship-control"><label>{t('Mentor')}<select value={mentorId} onChange={(event) => setMentorId(event.target.value)}>{mentors.map((mentor) => <option key={mentor.id} value={mentor.id}>{displayName(mentor)}</option>)}</select></label><button type="button" disabled={!mentorId} onClick={() => setGame((current) => startMentorship(current, mentorId, member.id))}>{t('Start mentorship')}</button></div> : <p>{t('No eligible Veteran or graduating mentor is available.')}</p>}<button type="button" className="promote-button" disabled={!promotion.eligible} onClick={() => setGame((current) => promoteTrainee(current, member.id))}>{t(promotion.eligible ? 'Promote to active roster' : promotion.reasons[0])}</button></section>;
}

function MemberInjuryHistory({ member, language = 'en' }) {
  const t = (value) => translate(language, value);
  const incidents = useMemo(() => [...(member.injuryHistory ?? [])].sort((first, second) => {
    if (first.status === 'active' && second.status !== 'active') return -1;
    if (second.status === 'active' && first.status !== 'active') return 1;
    return absoluteWeek(second.startYear, second.startWeek) - absoluteWeek(first.startYear, first.startWeek);
  }), [member.injuryHistory]);
  const headingId = `injury-history-${member.id}`;
  return <section className="member-injury-history" aria-labelledby={headingId}>
    <header className="injury-history-heading"><div className="injury-history-title"><span className="injury-history-icon"><Activity aria-hidden="true" size={18} /></span><h3 id={headingId}>{t('Injury History')}</h3></div><span className="injury-history-count">{incidents.length}</span></header>
    {incidents.length ? <ol>{incidents.map((incident) => <li key={incident.id} className={incident.status === 'active' ? 'active' : 'recovered'}>
      <div className="injury-incident-head"><strong>{t(incident.label ?? incident.severity)}</strong><span>{t(incident.status === 'active' ? 'Active' : 'Recovered')}</span></div>
      <p>{t(calendarLabel(incident.startYear, incident.startWeek))}</p>
      <dl className="injury-facts"><div><dt>{t('Duration')}</dt><dd>{incident.originalWeeks} {t(incident.originalWeeks === 1 ? 'week' : 'weeks')}</dd></div><div><dt>{t('Workload')}</dt><dd>{incident.workload ?? t('Not recorded')}</dd></div>{incident.status === 'recovered' && incident.recoveredYear && incident.recoveredWeek ? <div><dt>{t('Recovered')}</dt><dd>{t(calendarLabel(incident.recoveredYear, incident.recoveredWeek))}</dd></div> : null}</dl>
      {incident.assignments?.length ? <div className="injury-activities"><span>{t('Contributing Activities')}</span><ul>{incident.assignments.map((assignment, index) => <li key={`${assignment.day}-${assignment.activityId}-${index}`}><span>{assignment.day ? t(assignment.day) : t('Unknown day')}</span><strong>{t(BALANCE.activities[assignment.activityId]?.label ?? assignment.activityId)}</strong><small>{t(assignment.source === 'training' ? 'Training' : 'Schedule')}</small></li>)}</ul></div> : null}
    </li>)}</ol> : <div className="injury-history-empty"><span className="injury-history-empty-icon"><Activity aria-hidden="true" size={22} /></span><div><strong>{t('No Injury History')}</strong><span>{t('No injuries have been recorded for this member.')}</span></div></div>}
  </section>;
}

function Roster({ game, setGame, selectedMember, setSelectedMember, language = 'en', onOpenGraduation }) {
  const t = (value) => translate(language, value);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('overall');
  const [sortDirection, setSortDirection] = useState('desc');
  const [rosterFilter, setRosterFilter] = useState('all');
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [voucherStat, setVoucherStat] = useState(null);
  const rosterMembers = useMemo(() => game.members.filter((member) => member.status !== 'graduated'), [game.members]);
  const visible = useMemo(() => sortMembers(filterCoreTraineeMembers(rosterMembers, rosterFilter).filter((member) => member.name.toLowerCase().includes(query.toLowerCase())), { sortKey: sort, direction: sortDirection }), [rosterMembers, rosterFilter, query, sort, sortDirection]);
  const selected = rosterMembers.find((member) => member.id === selectedMember);
  const pendingGraduation = getPendingGraduationSetups(game).find((graduation) => graduation.memberId === selected?.id);
  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) setSelectedMember(null);
  }, [setSelectedMember]);
  return <div className="page roster-page"><VoucherInventory />
    <section className="page-heading"><div><span className="eyebrow">Squad database</span><h1>Roster</h1><p>Every rating below is fictional and regenerated for this timeline.</p></div><div className="roster-controls"><input aria-label={t('Search members')} placeholder={t('Search member')} value={query} onChange={(e) => setQuery(e.target.value)} /><CoreTraineeFilter value={rosterFilter} onChange={setRosterFilter} label={t('Roster status')} id="roster-status-filter" translate={t} /><select aria-label={t('Sort roster')} value={sort} onChange={(e) => setSort(e.target.value)}><optgroup label={t('Visible Stat')}><option value="overall">{t('Overall')}</option><option value="energy">{t('Energy')}</option><option value="popularity">{t('Popularity')}</option></optgroup>{ROSTER_SORT_OPTIONS.map((key) => { const label = key === 'generation' ? 'Generation' : key[0].toUpperCase() + key.slice(1); return <option key={key} value={key}>{t(label)}</option>; })}</select><select aria-label={t('Roster sort order')} value={sortDirection} onChange={(e) => setSortDirection(e.target.value)}>{SORT_DIRECTIONS.map((direction) => { const label = sort === 'age' ? (direction === 'asc' ? 'Youngest first' : 'Oldest first') : (direction === 'asc' ? 'Ascending' : 'Descending'); return <option key={direction} value={direction}>{t(label)}</option>; })}</select></div></section>
     <section className="member-grid">{visible.map((member) => <button type="button" key={member.id} className={selected?.id === member.id ? 'member-card selected' : 'member-card'} onClick={() => setSelectedMember(member.id)}><div className="photo-wrap"><Portrait member={member} size="card" /><span className={`availability ${member.status}`}>{member.status}</span><b>{overall(member)}</b></div><div className="card-body"><span>{member.generation}</span><h3>{member.name}</h3><p>{member.archetype}{member.captain ? ' · Captain' : ''}</p><p className="member-card-age">{t('Age')}: {getMemberAge(member, game.year) ?? '—'}</p>{injuryLabel(member) ? <small className="injury-label">{injuryLabel(member)}</small> : null}<div className="card-bars"><div><span>Energy</span><i><b className={energyTone(member.energy)} style={{ width: `${member.energy}%` }} /></i><strong>{member.energy}</strong></div><div><span>POP</span><i><b style={{ width: `${member.popularity}%` }} /></i><strong>{member.popularity}</strong></div></div></div></button>)}</section>
     {selected ? <ModalPortal><div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedMember(null); }}><aside className="member-drawer member-drawer-modal" role="dialog" aria-modal="true"><div className="drawer-head"><div><span>{t('Player profile')}</span><h2>{displayName(selected)}</h2></div><IconButton label={t('Close profile')} onClick={() => setSelectedMember(null)}><X size={20} /></IconButton></div><Portrait member={selected} size="drawer" /><h3>{selected.name}</h3><p>{selected.generation} · {selected.team || 'JKT48'} · {t(selected.archetype)}</p><p className="member-birthday">{t(`Birthday ${birthdayMeta(selected, game.year)}`)}</p><p className="member-salary">{t('Salary')} {money(getMemberSalary(selected, game.year, game.hardMode))} / {t('month')}</p><div className="drawer-score"><strong>{overall(selected)}</strong><span>{t('Overall')}</span></div>{pendingGraduation ? <button type="button" className="secondary-button graduation-setup-button" onClick={() => onOpenGraduation(pendingGraduation)}><CalendarDays aria-hidden="true" size={17} />{t('Set up graduation')}</button> : null}<button type="button" className="secondary-button voucher-open-button" onClick={() => setVoucherStat('vocal')}>{t('Edit with voucher')}</button><dl>{['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina', 'popularity', 'energy', 'ego'].map((key) => <div key={key}><dt>{t(key)}</dt><dd><strong>{Math.round(selected[key] ?? 0)}</strong></dd></div>)}</dl><MemberInjuryHistory member={selected} language={language} /><MemberFanProfile game={game} member={selected} language={language} /><TraineeDevelopment key={selected.id} game={game} member={selected} setGame={setGame} language={language} /><div className="trait-list">{selected.traits.map((trait) => <span key={trait}>{t(trait)}</span>)}</div><small>{t('Potential, development curve, ego, and compatibility are fictional simulation values.')}</small><button type="button" className="captain-button" onClick={() => setGame((current) => ({ ...current, members: current.members.map((item) => ({ ...item, captain: item.id === selected.id })) }))}>{t(selected.captain ? 'Captain selected' : 'Select as captain')}</button><button type="button" className="fire-member-button" disabled={getTheaterEligibleMembers(game).length <= BALANCE.theaterMinimumMembers && selected.status !== 'suspended'} onClick={() => setConfirmRelease(true)}>{t('Release member')}</button></aside></div></ModalPortal> : null}
     {selected && voucherStat ? <ModalPortal><VoucherEditModal member={selected} initialStat={voucherStat} language={language} onClose={() => setVoucherStat(null)} /></ModalPortal> : null}
     {confirmRelease && selected ? <ConfirmationModal title={language === 'id' ? `Lepaskan ${displayName(selected)} dari daftar anggota?` : `Release ${displayName(selected)} from the roster?`} description={t('The member leaves immediately, applies the configured trust and reputation penalties, and cannot be restored for two in-game years.')} confirmLabel={t('Release member')} cancelLabel={t('Cancel')} destructive onCancel={() => setConfirmRelease(false)} onConfirm={() => { setGame((current) => fireMember(current, selected.id)); setConfirmRelease(false); setSelectedMember(null); }} icon={<UserRoundSearch size={24} />} /> : null}
  </div>;
}

function AnnualEventsCore({ game, setGame }) {
  const mgExisting = (game.yearEndMeetGreets ?? []).find((event) => event.year === game.year);
  const anniversaryExisting = game.concerts.find((concert) => concert.eventType === 'anniversary' && concert.targetYear === game.year);
  const mgWeeks = Array.from({ length: 8 }, (_, index) => 37 + index).filter((week) => week > game.week);
  const anniversaryWeeks = [45, 46, 47, 48].filter((week) => week - game.week >= 2);
  const venues = game.concertVenueOffers?.length ? game.concertVenueOffers : CONCERT_VENUES;
  const [mgWeek, setMgWeek] = useState(mgWeeks[0] ?? 44);
  const [mgDay, setMgDay] = useState('Sat');
  const [anniversaryWeek, setAnniversaryWeek] = useState(anniversaryWeeks[0] ?? 48);
  const [anniversaryDay, setAnniversaryDay] = useState('Sat');
  const [anniversaryBudget, setAnniversaryBudget] = useState('standard');
  const [anniversaryVenue, setAnniversaryVenue] = useState(venues[0]?.id ?? 'hall');
  const [anniversaryTitle, setAnniversaryTitle] = useState('');
  const [confirm, setConfirm] = useState(null);
  const mgConflicts = mgWeek ? eventConflictsForWeek(game, mgWeek, 'yearEndMeetGreet', mgDay) : [];
  const anniversaryConflicts = anniversaryWeek ? eventConflictsForWeek(game, anniversaryWeek, 'concert', anniversaryDay, [], ['Tue', 'Thu']) : [];
  if (!mgWeeks.length && !anniversaryWeeks.length && !mgExisting && !anniversaryExisting) return null;
  const scheduleMg = () => {
    setGame((current) => scheduleYearEndMeetGreet(current, mgWeek, mgDay, current.week));
    setConfirm(null);
  };
  const scheduleAnniversary = () => {
    setGame((current) => announceAnniversaryConcert(current, anniversaryWeek, anniversaryDay, anniversaryTitle, anniversaryBudget, anniversaryVenue, ['Tue', 'Thu']));
    setConfirm(null);
  };
  return <section className="annual-events"><div className="annual-events-head"><span className="eyebrow">Annual rhythm</span><h2>Year-end events</h2><p>Commit Q4 calendar space before the season closes.</p></div><div className="annual-event-grid"><article><span>October-November</span><h3>Year-end Meet &amp; Greet</h3>{mgExisting ? <div className="annual-event-status"><strong>{calendarLabel(game.year, mgExisting.targetWeek)} · {mgExisting.day}</strong><span>{mgExisting.memberSessions.reduce((sum, session) => sum + session.sold, 0)} / {mgExisting.memberSessions.reduce((sum, session) => sum + session.capacity, 0)} tickets · {mgExisting.status}</span></div> : <><div className="annual-event-fields"><label>Event week<select value={mgWeek} onChange={(event) => setMgWeek(Number(event.target.value))}>{mgWeeks.map((week) => <option key={week} value={week}>{calendarLabel(game.year, week)}</option>)}</select></label><label>Event day<select value={mgDay} onChange={(event) => setMgDay(event.target.value)}>{DAYS.map((day) => <option key={day}>{day}</option>)}</select></label><div className="annual-event-rule"><span>Per member</span><strong>300 slots · FRL50k</strong></div></div>{mgConflicts.length ? <p className="event-conflict-warning">{calendarLabel(game.year, mgWeek)} unavailable: {mgConflicts.join(' ')}</p> : null}<button type="button" onClick={() => setConfirm('mg')} disabled={!mgWeeks.length || mgConflicts.length > 0 || game.money < 60_000_000}>Review FRL40m campaign</button></>}</article><article><span>December</span><h3>Anniversary Concert</h3>{anniversaryExisting ? <div className="annual-event-status"><strong>{calendarLabel(game.year, anniversaryExisting.targetWeek)} · {anniversaryExisting.day}</strong><span>{anniversaryExisting.venueName} · {anniversaryExisting.status}</span></div> : <><label className="campaign-title-field">Concert title<input value={anniversaryTitle} maxLength={60} onChange={(event) => setAnniversaryTitle(event.target.value)} placeholder={`JKT48 Anniversary ${game.year}`} /></label><div className="annual-event-fields"><label>Event week<select value={anniversaryWeek} onChange={(event) => setAnniversaryWeek(Number(event.target.value))}>{anniversaryWeeks.map((week) => <option key={week} value={week}>{calendarLabel(game.year, week)}</option>)}</select></label><label>Show day<select value={anniversaryDay} onChange={(event) => setAnniversaryDay(event.target.value)}>{DAYS.filter((day) => !['Tue','Thu'].includes(day)).map((day) => <option key={day}>{day}</option>)}</select></label><label>Production<select value={anniversaryBudget} onChange={(event) => setAnniversaryBudget(event.target.value)}>{CONCERT_BUDGETS.map((budget) => <option key={budget.id} value={budget.id}>{budget.name} · {money(budget.cost)}</option>)}</select></label><label>Venue<select value={anniversaryVenue} onChange={(event) => setAnniversaryVenue(event.target.value)}>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name} · {number.format(venue.capacity)}</option>)}</select></label></div>{anniversaryConflicts.length ? <p className="event-conflict-warning">{calendarLabel(game.year, anniversaryWeek)} unavailable: {anniversaryConflicts.join(' ')}</p> : null}<button type="button" onClick={() => setConfirm('anniversary')} disabled={!anniversaryWeeks.length || anniversaryConflicts.length > 0}>Review anniversary</button></>}</article></div>{confirm ? <ModalPortal><div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirm(null); }}><section className="confirm-week-modal" role="dialog" aria-modal="true"><div className="confirm-week-icon">{confirm === 'mg' ? <Users size={24} /> : <Ticket size={24} />}</div><h2>Confirm {confirm === 'mg' ? 'year-end Meet & Greet' : 'Anniversary Concert'}?</h2><p>{confirm === 'mg' ? `Spend FRL40m. Sales start now for ${calendarLabel(game.year, mgWeek)}; every active member receives 300 slots at FRL50k, matching normal Meet & Greet.` : `Book ${calendarLabel(game.year, anniversaryWeek)}. Tuesday and Thursday become rehearsals; ${anniversaryDay} becomes the concert day.`}</p><div className="confirm-week-actions"><button type="button" className="secondary-button" onClick={() => setConfirm(null)}>Cancel</button><button type="button" className="setup-primary" onClick={confirm === 'mg' ? scheduleMg : scheduleAnniversary}>Confirm event <ChevronRight size={18} /></button></div></section></div></ModalPortal> : null}</section>;
}

function FixedAnnualEvents({ game, setGame, language = 'en' }) {
  const t = (value) => translate(language, value);
  const mgExisting = (game.yearEndMeetGreets ?? []).find((event) => event.year === game.year);
  const anniversaryExisting = game.concerts.find((concert) => concert.eventType === 'anniversary' && concert.targetYear === game.year);
  const mgWeeks = Array.from({ length: 8 }, (_, index) => 37 + index).filter((week) => week > game.week);
  const anniversaryWeeks = [45, 46, 47, 48].filter((week) => week - game.week >= 2);
  const venues = game.concertVenueOffers?.length ? game.concertVenueOffers : CONCERT_VENUES;
  const [requestedMgWeek, setMgWeek] = useState(mgWeeks[0] ?? 44);
  const [mgDay, setMgDay] = useState('Sat');
  const [requestedAnniversaryWeek, setAnniversaryWeek] = useState(anniversaryWeeks[0] ?? 48);
  const [anniversaryDay, setAnniversaryDay] = useState('Sat');
  const [requestedAnniversaryBudget, setRequestedAnniversaryBudget] = useState('standard');
  const [requestedAnniversaryVenue, setRequestedAnniversaryVenue] = useState(venues[0]?.id ?? 'hall');
  const [anniversaryTitle, setAnniversaryTitle] = useState('');
  const [mgTitle, setMgTitle] = useState('');
  const [confirm, setConfirm] = useState(null);
  const annualSubmitRef = useRef(false);
  // A controlled select whose saved value is no longer in its options renders
  // the first option while React keeps the stale value. Use the visible week
  // for conflict checks, confirmation copy, and the eventual engine action.
  const selectedMgWeek = mgWeeks.includes(Number(requestedMgWeek)) ? Number(requestedMgWeek) : (mgWeeks[0] ?? null);
  const selectedAnniversaryWeek = anniversaryWeeks.includes(Number(requestedAnniversaryWeek)) ? Number(requestedAnniversaryWeek) : (anniversaryWeeks[0] ?? null);
  const mgWeek = selectedMgWeek;
  const anniversaryWeek = selectedAnniversaryWeek;
  // Keep controlled select values canonical. The Indonesian localization
  // observer rewrites option labels after render; it must never be able to
  // make the confirmation action use a stale or display-only value.
  const anniversaryBudget = CONCERT_BUDGETS.some((budget) => budget.id === requestedAnniversaryBudget)
    ? requestedAnniversaryBudget
    : (CONCERT_BUDGETS[0]?.id ?? '');
  const anniversaryVenue = venues.some((venue) => venue.id === requestedAnniversaryVenue)
    ? requestedAnniversaryVenue
    : (venues[0]?.id ?? '');
  const setAnniversaryBudget = setRequestedAnniversaryBudget;
  const setAnniversaryVenue = setRequestedAnniversaryVenue;
  const selectedAnniversaryBudgetId = anniversaryBudget;
  const selectedAnniversaryVenueId = anniversaryVenue;
  const selectedAnniversaryBudget = CONCERT_BUDGETS.find((budget) => budget.id === anniversaryBudget) ?? CONCERT_BUDGETS[0];
  const selectedAnniversaryVenue = venues.find((venue) => venue.id === anniversaryVenue) ?? venues[0];
  const anniversaryCost = getConcertCostBreakdown(game, selectedAnniversaryBudget, selectedAnniversaryVenue);
  const anniversaryUpfrontCost = anniversaryCost.upfrontCost;
  useEffect(() => {
    if (!venues.some((venue) => venue.id === requestedAnniversaryVenue)) setAnniversaryVenue(venues[0]?.id ?? '');
  }, [requestedAnniversaryVenue, venues]);
  useEffect(() => {
    if (!CONCERT_BUDGETS.some((budget) => budget.id === requestedAnniversaryBudget)) setAnniversaryBudget(CONCERT_BUDGETS[0].id);
  }, [requestedAnniversaryBudget]);
  // Keep the booking preview in lockstep with the engine.  A campaign may be
  // announced several weeks ahead, so checking today's injury/suspension state
  // here can disagree with the target-date validation used when booking.
  const eligibleCountFor = (activityId, targetWeek) => (targetWeek
    ? game.members.filter((member) => memberCanPerformOnCampaignDate(game, member, activityId, game.year, targetWeek)).length
    : 0);
  const mgEligibleCount = eligibleCountFor('yearEndMeetGreet', selectedMgWeek);
  const anniversaryEligibleCount = eligibleCountFor('concert', selectedAnniversaryWeek);
  const yearEndMeetGreetLockReason = game.week < 25 ? `Year-end Meet & Greet bookings open from ${monthWeekLabel(25)}.` : !mgWeeks.length ? 'Year-end Meet & Greet has no eligible future Q4 date.' : mgEligibleCount < BALANCE.theaterMinimumMembers ? `Year-end Meet & Greet requires ${BALANCE.theaterMinimumMembers} available members; ${mgEligibleCount} available.` : game.money < 40_000_000 ? `Requires ${money(40_000_000)}; current funds: ${money(game.money)}.` : '';
  const mgScheduleConflicts = selectedMgWeek
    ? getCampaignConflictReasons(game, {
        year: game.year,
        week: selectedMgWeek,
        type: 'yearEndMeetGreet',
        day: mgDay,
        monthScope: true,
      })
    : [];
  const mgConflicts = yearEndMeetGreetLockReason ? [yearEndMeetGreetLockReason] : mgScheduleConflicts;
  const anniversaryBookingLockReason = game.week < 25 ? `Anniversary Concert bookings open from ${monthWeekLabel(25)}.` : !anniversaryWeeks.length ? 'Anniversary Concert requires a future date with at least two weeks of lead time.' : anniversaryEligibleCount < BALANCE.theaterMinimumMembers ? `Anniversary Concert requires ${BALANCE.theaterMinimumMembers} available members; ${anniversaryEligibleCount} available.` : game.money < anniversaryUpfrontCost ? `Requires ${money(anniversaryUpfrontCost)}; current funds: ${money(game.money)}.` : '';
  const anniversaryScheduleConflicts = selectedAnniversaryWeek
    ? getCampaignConflictReasons(game, {
        year: game.year,
        week: selectedAnniversaryWeek,
        type: 'concert',
        days: [anniversaryDay, 'Tue', 'Thu'],
        monthScope: true,
        allowQ4: true,
      })
    : [];
  const anniversaryConflicts = anniversaryBookingLockReason ? [anniversaryBookingLockReason] : anniversaryScheduleConflicts;
  useEffect(() => {
    if (!mgWeeks.includes(requestedMgWeek) && mgWeeks.length) setMgWeek(mgWeeks[0]);
  }, [game.year, game.week]);
  useEffect(() => {
    if (!anniversaryWeeks.includes(Number(requestedAnniversaryWeek)) && anniversaryWeeks.length) setAnniversaryWeek(anniversaryWeeks[0]);
  }, [game.year, game.week]);
  if (!mgWeeks.length && !anniversaryWeeks.length && !mgExisting && !anniversaryExisting) return null;
  const commitAnnualEvent = (action, failureText, failureCode, succeeded) => {
    // Prevent double taps (especially common on mobile) from queuing a second
    // state update that observes the just-booked event as a booking failure.
    if (annualSubmitRef.current) return;
    annualSubmitRef.current = true;
    setGame((current) => {
      const next = action(current);
      if (succeeded(next, current))
        return {
          ...next,
          // A stale blocked notification can survive a confirmation that was
          // opened before the latest state refresh. Clear it once the annual
          // event is actually persisted, otherwise Command shows a red
          // warning although the event is booked.
          notifications: (next.notifications ?? []).filter((item) => item.text !== failureText
            && !(item.code === 'campaign-blocked' && item.campaignType === (failureCode === ANNIVERSARY_CONCERT_FAILURE_CODE ? 'concert' : 'yearEndMeetGreet'))),
        };
      if (next !== current) return next;
      return {
        ...current,
        notifications: [
          {
            type: 'critical',
            code: failureCode,
            year: current.year,
            week: current.week,
            text: failureText,
          },
          ...(current.notifications ?? []),
        ].slice(0, 20),
      };
    });
    setConfirm(null);
    // Promise callbacks are supported by the older mobile browsers we target.
    Promise.resolve().then(() => { annualSubmitRef.current = false; });
  };
  const scheduleMg = () => {
    if (!selectedMgWeek || mgConflicts.length) return;
    commitAnnualEvent(
      (current) => scheduleYearEndMeetGreet(current, selectedMgWeek, mgDay, current.week, {}, mgTitle),
      YEAR_END_MEET_GREET_FAILURE,
      YEAR_END_MEET_GREET_FAILURE_CODE,
      (next, current) => (next.yearEndMeetGreets ?? []).length > (current.yearEndMeetGreets ?? []).length,
    );
  };
  const scheduleAnniversary = () => {
    if (!selectedAnniversaryWeek || anniversaryConflicts.length) return;
    commitAnnualEvent(
      (current) => announceAnniversaryConcert(current, selectedAnniversaryWeek, anniversaryDay, anniversaryTitle.trim(), selectedAnniversaryBudgetId, selectedAnniversaryVenueId, ['Tue', 'Thu']),
      ANNIVERSARY_CONCERT_FAILURE,
      ANNIVERSARY_CONCERT_FAILURE_CODE,
      (next, current) => (next.concerts ?? []).length > (current.concerts ?? []).length,
    );
  };
  return (<section className="annual-events"><div className="annual-events-head"><span className="eyebrow">Annual rhythm</span><h2>Year-end events</h2><p>Commit Q4 calendar space before the season closes.</p></div><div className="annual-event-grid"><article><span>October-November</span><h3>Year-end Meet &amp; Greet</h3>{mgExisting ? (<div className="annual-event-status"><strong data-i18n-ignore={mgExisting.customTitle ? 'true' : undefined}>{mgExisting.customTitle ? mgExisting.title : t(mgExisting.title ?? 'Year-end Meet & Greet')}</strong><strong>{calendarLabel(game.year, mgExisting.targetWeek)} · {mgExisting.day}</strong><span>{mgExisting.memberSessions.reduce((sum, session) => sum + session.sold, 0)} / {mgExisting.memberSessions.reduce((sum, session) => sum + session.capacity, 0)} tickets · {mgExisting.status}</span></div>) : (<><label className="campaign-title-field">Event title<input name="year-end-meet-greet-title" autoComplete="off" value={mgTitle} maxLength={60} onChange={(event) => setMgTitle(event.target.value)} placeholder="Year-end Meet & Greet" /></label><div className="annual-event-fields"><label>Event week<select value={mgWeek} onChange={(event) => setMgWeek(Number(event.target.value))}>{mgWeeks.map((week) => (<option key={week} value={week}>{calendarLabel(game.year, week)}</option>))}</select></label><label>Event day<select value={mgDay} onChange={(event) => setMgDay(event.target.value)}>{DAYS.map((day) => (<option key={day}>{day}</option>))}</select></label><div className="annual-event-rule"><span>Per member ticket</span><strong>300 slots · FRL50k</strong></div><div className="annual-event-rule"><span>Booking cost</span><strong>FRL40m</strong></div></div>{mgScheduleConflicts.length ? (<p className="event-conflict-warning campaign-block-reason" role="status">{calendarLabel(game.year, mgWeek)} unavailable: {mgScheduleConflicts.join(' ')}</p>) : yearEndMeetGreetLockReason ? (<p className="campaign-block-reason" role="status">{t(yearEndMeetGreetLockReason)}</p>) : null}<button type="button" onClick={() => setConfirm('mg')} disabled={!mgWeeks.length || mgConflicts.length > 0 || game.money < 40_000_000}>Review End-of-Year Meet&amp;Greet</button></>)}</article><article><span>December</span><h3>Anniversary Concert</h3>{anniversaryExisting ? (<div className="annual-event-status"><strong>{calendarLabel(game.year, anniversaryExisting.targetWeek)} · {anniversaryExisting.day}</strong><span>{anniversaryExisting.venueName} · {anniversaryExisting.status}</span></div>) : (<><label className="campaign-title-field">Concert title<input value={anniversaryTitle} maxLength={60} onChange={(event) => setAnniversaryTitle(event.target.value)} placeholder={`JKT48 Anniversary ${game.year}`} /></label><div className="annual-event-fields"><label>Event week<select value={anniversaryWeek} onChange={(event) => setAnniversaryWeek(Number(event.target.value))}>{anniversaryWeeks.map((week) => (<option key={week} value={week}>{calendarLabel(game.year, week)}</option>))}</select></label><label>Show day<select value={anniversaryDay} onChange={(event) => setAnniversaryDay(event.target.value)}>{DAYS.filter((day) => !['Tue', 'Thu'].includes(day)).map((day) => (<option key={day}>{day}</option>))}</select></label><label>Production<select value={anniversaryBudget} onChange={(event) => setAnniversaryBudget(event.target.value)}>{CONCERT_BUDGETS.map((budget) => (<option key={budget.id} value={budget.id}>{budget.name} · {money(budget.cost)}</option>))}</select></label><label>Venue<select value={anniversaryVenue} onChange={(event) => setAnniversaryVenue(event.target.value)}>{venues.map((venue) => (<option key={venue.id} value={venue.id}>{venue.name} · {number.format(venue.capacity)}</option>))}</select></label></div>{anniversaryScheduleConflicts.length ? (<p className="event-conflict-warning campaign-block-reason" role="status">{calendarLabel(game.year, anniversaryWeek)} unavailable: {anniversaryScheduleConflicts.join(' ')}</p>) : anniversaryBookingLockReason ? (<p className="campaign-block-reason" role="status">{t(anniversaryBookingLockReason)}</p>) : null}<button type="button" onClick={() => setConfirm('anniversary')} disabled={!anniversaryWeeks.length || anniversaryConflicts.length > 0}>Review anniversary</button></>)}</article></div>{confirm ? (<ModalPortal><div className="setup-modal-backdrop confirmation-backdrop"role="presentation"onMouseDown={(event) => {if (event.target === event.currentTarget) setConfirm(null);}}><section className="confirm-week-modal campaign-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="annual-campaign-confirm-title"><div className="confirm-week-icon">{confirm === 'mg' ? <Users size={24} /> : <Ticket size={24} />}</div><h2 id="annual-campaign-confirm-title">Confirm <span data-i18n-ignore="true">{confirm === 'mg' ? mgTitle.trim() || 'Year-end Meet & Greet' : 'Anniversary Concert'}</span>?</h2><p>{confirm === 'mg' ? `Spend FRL40m. Sales start now for ${calendarLabel(game.year, mgWeek)}; every active member receives 300 slots at FRL50k.` : `Book ${calendarLabel(game.year, anniversaryWeek)}. Tuesday and Thursday become rehearsals; ${anniversaryDay} becomes the concert day.`}</p><div className="confirm-week-actions"><button type="button" className="secondary-button" onClick={() => setConfirm(null)}>Cancel</button><button type="button" className="setup-primary" disabled={confirm === 'mg' ? mgConflicts.length > 0 : anniversaryConflicts.length > 0} onClick={confirm === 'mg' ? scheduleMg : scheduleAnniversary}>Confirm event <ChevronRight size={18} /></button></div></section></div></ModalPortal>) : null}</section>);
}

function AnnualEvents({ game, setGame, language = 'en' }) {
  return <FixedAnnualEvents game={game} setGame={setGame} language={language} />;
}

function LegacyFanEventCampaigns({ game, setGame }) {
  const [eventType, setEventType] = useState('videoCall');
  const [eventDay, setEventDay] = useState(DAYS[5]);
  const [eventWeek, setEventWeek] = useState(game.week);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmEvent, setConfirmEvent] = useState(false);
  const month = Math.ceil(game.week / BALANCE.weeksPerMonth);
  const eligibleMembers = game.members.filter((member) => ['active', 'trainee'].includes(member.status) && (member.suspensionWeeks ?? 0) === 0);
  const completedVcIds = new Set((game.activityEvents ?? []).filter((event) => event.type === 'videoCall' && event.year === game.year && event.month === month).map((event) => event.memberId));
const scheduledVcIds = new Set(Object.entries(game.schedule).filter(([, activityId]) => activityId === 'vc1').map(([key]) => key.slice(0, key.lastIndexOf(':'))));
const plannedVcIds = new Set((game.fanEventPlans ?? []).filter((plan) => plan.year === game.year && Math.ceil(plan.targetWeek / BALANCE.weeksPerMonth) === month && plan.type === 'videoCall').flatMap((plan) => plan.memberIds));
const vcMembers = eligibleMembers.filter((member) => !completedVcIds.has(member.id) && !scheduledVcIds.has(member.id) && !plannedVcIds.has(member.id) && !AUTOMATIC_ACTIVITY_LOCKS.includes(game.schedule[`${member.id}:${eventDay}`]));
const meetGreetUsed = (game.activityEvents ?? []).some((event) => event.type === 'meetGreet' && event.year === game.year && event.month === month) || Object.values(game.schedule).some((activityId) => activityId === 'mg1') || (game.fanEventPlans ?? []).some((plan) => plan.year === game.year && Math.ceil(plan.targetWeek / BALANCE.weeksPerMonth) === month && plan.type === 'meetGreet');
  const chosenIds = selectedIds.filter((memberId) => vcMembers.some((member) => member.id === memberId));
  const dayHasCampaignLock = eligibleMembers.some((member) => AUTOMATIC_ACTIVITY_LOCKS.includes(game.schedule[`${member.id}:${eventDay}`]));
   const eventWeeks = useMemo(() => Array.from({ length: BALANCE.weeksPerYear - game.week + 1 }, (_, index) => game.week + index).filter((week) => !eventConflictsForWeek(game, week, eventType).length || week === eventWeek), [game, eventType, eventWeek]);
   const selectedWeekConflicts = eventConflictsForWeek(game, eventWeek, eventType);
  useEffect(() => { setSelectedIds((current) => current.filter((memberId) => vcMembers.some((member) => member.id === memberId))); }, [game.year, month, game.schedule, eventDay]);
  useEffect(() => {
    if (!confirmEvent) return undefined;
    const close = (event) => { if (event.key === 'Escape') setConfirmEvent(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [confirmEvent]);
  const toggleMember = (memberId) => setSelectedIds((current) => current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]);
  const scheduleEvent = () => {
    setGame((current) => scheduleFanCampaign(current, eventType, eventDay, eventType === 'videoCall' ? chosenIds : [], eventWeek));
    setConfirmEvent(false);
  };
  const disabled = selectedWeekConflicts.length > 0 || (eventType === 'videoCall' ? chosenIds.length === 0 : meetGreetUsed || dayHasCampaignLock);
  return <section className="fan-event-campaigns"><header><div><h2>Fan event campaigns</h2><p>Set up monthly Video Call and Meet &amp; Greet sessions before assigning the rest of the week.</p></div><div className="fan-event-tabs" role="tablist" aria-label="Fan event type"><button type="button" role="tab" aria-selected={eventType === 'videoCall'} className={eventType === 'videoCall' ? 'active' : ''} onClick={() => setEventType('videoCall')}><PhoneCall size={16} /> Video Call</button><button type="button" role="tab" aria-selected={eventType === 'meetGreet'} className={eventType === 'meetGreet' ? 'active' : ''} onClick={() => setEventType('meetGreet')}><Users size={16} /> Meet &amp; Greet</button></div></header><div className="fan-event-setup"><div className="fan-event-facts"><span><small>Ticket price</small><strong>{money(BALANCE.activities[eventType === 'videoCall' ? 'vc1' : 'mg1'].ticket)}</strong></span><span><small>Slots / member</small><strong>{BALANCE.activities[eventType === 'videoCall' ? 'vc1' : 'mg1'].capacity}</strong></span><span><small>Energy / member</small><strong>{BALANCE.activities[eventType === 'videoCall' ? 'vc1' : 'mg1'].energy}</strong></span><span><small>Frequency</small><strong>{eventType === 'videoCall' ? 'Once / member / month' : 'Once / month'}</strong></span></div><label className="fan-event-day">Event day<select value={eventDay} onChange={(event) => setEventDay(event.target.value)}>{DAYS.map((day) => <option key={day} value={day}>{day}</option>)}</select></label>{eventType === 'videoCall' ? <div className="fan-event-members"><div><strong>Select members</strong><span>{chosenIds.length} selected · {vcMembers.length} available</span><button type="button" onClick={() => setSelectedIds(chosenIds.length === vcMembers.length ? [] : vcMembers.map((member) => member.id))}>{chosenIds.length === vcMembers.length ? 'Clear all' : 'Select all'}</button></div><div>{vcMembers.map((member) => <label key={member.id}><input type="checkbox" checked={chosenIds.includes(member.id)} onChange={() => toggleMember(member.id)} /><Portrait member={member} size="tiny" /><span><strong>{displayName(member)}</strong><small>POP {member.popularity} · Energy {member.energy}</small></span></label>)}</div>{vcMembers.length ? null : <p>No members available for another Video Call this month.</p>}</div> : <div className="fan-event-group-status"><Users size={20} /><span><strong>{eligibleMembers.length} members participate</strong><small>{meetGreetUsed ? 'Meet & Greet already scheduled or completed this month.' : dayHasCampaignLock ? 'Selected day conflicts with an automatic campaign.' : 'All available active members and trainees will be assigned.'}</small></span></div>}<div className="fan-event-action"><span><strong>{money((eventType === 'videoCall' ? chosenIds.length : eligibleMembers.length) * BALANCE.activities[eventType === 'videoCall' ? 'vc1' : 'mg1'].cost)}</strong><small>Projected activity cost</small></span><button type="button" disabled={disabled} onClick={() => setConfirmEvent(true)}>Review event</button></div></div>{confirmEvent ? <ModalPortal><div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmEvent(false); }}><section className="confirm-week-modal" role="dialog" aria-modal="true" aria-labelledby="fan-event-confirm-title"><div className="confirm-week-icon">{eventType === 'videoCall' ? <PhoneCall size={24} /> : <Users size={24} />}</div><h2 id="fan-event-confirm-title">Confirm {eventType === 'videoCall' ? 'Video Call' : 'Meet & Greet'} campaign?</h2><p>Assign {eventType === 'videoCall' ? `${chosenIds.length} selected member(s)` : `all ${eligibleMembers.length} available members`} on {eventDay}. Existing unlocked assignments on that day will be replaced.</p><div className="confirm-week-actions"><button type="button" className="secondary-button" onClick={() => setConfirmEvent(false)}>Cancel</button><button type="button" className="setup-primary" onClick={scheduleEvent}>Confirm event <ChevronRight size={18} /></button></div></section></div></ModalPortal> : null}</section>;
}

function FanEventCampaignsCore({ game, setGame }) {
  const [eventType, setEventType] = useState('videoCall');
  const [eventDay, setEventDay] = useState(DAYS[5]);
  const [eventWeek, setEventWeek] = useState(game.week);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmEvent, setConfirmEvent] = useState(false);
  const eventWeeks = useMemo(() => Array.from({ length: BALANCE.weeksPerYear - game.week + 1 }, (_, index) => game.week + index), [game.week]);
  const targetMonth = Math.ceil(eventWeek / BALANCE.weeksPerMonth);
  const eligibleMembers = game.members.filter((member) => ['active', 'trainee'].includes(member.status) && (member.suspensionWeeks ?? 0) === 0);
  const eventSchedule = eventWeek === game.week ? game.schedule : {};
  const completedVcIds = new Set((game.activityEvents ?? []).filter((event) => event.type === 'videoCall' && event.year === game.year && event.month === targetMonth).map((event) => event.memberId));
  const currentMonth = Math.ceil(game.week / BALANCE.weeksPerMonth);
  const scheduleToCheck = currentMonth === targetMonth ? game.schedule : {};
  const scheduledVcIds = new Set(Object.entries(scheduleToCheck).filter(([, activityId]) => activityId === 'vc1').map(([key]) => key.slice(0, key.lastIndexOf(':'))));
  const plannedVcIds = new Set((game.fanEventPlans ?? []).filter((plan) => plan.year === game.year && Math.ceil(plan.targetWeek / BALANCE.weeksPerMonth) === targetMonth && plan.type === 'videoCall').flatMap((plan) => plan.memberIds));
  const vcMembers = eligibleMembers.filter((member) => !completedVcIds.has(member.id) && !scheduledVcIds.has(member.id) && !plannedVcIds.has(member.id) && !AUTOMATIC_ACTIVITY_LOCKS.includes(eventSchedule[`${member.id}:${eventDay}`]));
  const chosenIds = selectedIds.filter((memberId) => vcMembers.some((member) => member.id === memberId));
  const selectedWeekConflicts = eventConflictsForWeek(game, eventWeek, eventType, eventDay, eventType === 'videoCall' ? chosenIds : []);
  const meetGreetUsed = eventType === 'meetGreet' && ((game.activityEvents ?? []).some((event) => event.type === 'meetGreet' && event.year === game.year && event.month === targetMonth) || Object.values(eventSchedule).some((activityId) => activityId === 'mg1') || (game.fanEventPlans ?? []).some((plan) => plan.year === game.year && Math.ceil(plan.targetWeek / BALANCE.weeksPerMonth) === targetMonth && plan.type === 'meetGreet'));
  const dayHasCampaignLock = (eventType === 'videoCall' ? chosenIds : eligibleMembers).some((member) => AUTOMATIC_ACTIVITY_LOCKS.includes(eventSchedule[`${member.id}:${eventDay}`]));
  useEffect(() => { setEventWeek((current) => Math.max(game.week, Math.min(current, BALANCE.weeksPerYear))); }, [game.week]);
  useEffect(() => { setSelectedIds((current) => current.filter((memberId) => vcMembers.some((member) => member.id === memberId))); }, [eventWeek, eventDay, game.year, game.week, game.schedule, game.fanEventPlans]);
  useEffect(() => { if (!confirmEvent) return undefined; const close = (event) => { if (event.key === 'Escape') setConfirmEvent(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [confirmEvent]);
  const scheduleEvent = () => {
    const memberIds = eventType === 'videoCall' ? chosenIds : [];
    // Re-check the latest visible state before committing the modal action.
    if (eventConflictsForWeek(game, eventWeek, eventType, eventDay, memberIds).length) return;
    setGame((current) => scheduleFanCampaign(current, eventType, eventDay, memberIds, eventWeek));
    setConfirmEvent(false);
  };
    const disabled = selectedWeekConflicts.length > 0 || (eventType === 'videoCall' ? chosenIds.length === 0 : meetGreetUsed || dayHasCampaignLock);
   const activity = BALANCE.activities[eventType === 'videoCall' ? 'vc1' : 'mg1'];
   return <section className="fan-event-campaigns"><header><div><h2>Fan event campaigns</h2><p>Schedule Video Call and Meet &amp; Greet sessions for this week or a future week.</p></div><div className="fan-event-tabs" role="tablist" aria-label="Fan event type"><button type="button" role="tab" aria-selected={eventType === 'videoCall'} className={eventType === 'videoCall' ? 'active' : ''} onClick={() => setEventType('videoCall')}><PhoneCall size={16} /> Video Call</button><button type="button" role="tab" aria-selected={eventType === 'meetGreet'} className={eventType === 'meetGreet' ? 'active' : ''} onClick={() => setEventType('meetGreet')}><Users size={16} /> Meet &amp; Greet</button></div></header>{selectedWeekConflicts.length ? <EventConflictNotice game={game} week={eventWeek} eventType={eventType} day={eventDay} memberIds={eventType === 'videoCall' ? chosenIds : []} /> : null}<div className="fan-event-setup"><div className="fan-event-facts"><span><small>Ticket price</small><strong>{money(activity.ticket)}</strong></span><span><small>Slots / member</small><strong>{activity.capacity}</strong></span><span><small>Energy / member</small><strong>{activity.energy}</strong></span><span><small>Frequency</small><strong>{eventType === 'videoCall' ? 'Once / member / month' : 'Once / month'}</strong></span></div><div className="fan-event-date-fields"><label className="fan-event-day">Event week<select value={eventWeek} onChange={(event) => setEventWeek(Number(event.target.value))}>{eventWeeks.map((week) => <option key={week} value={week}>{calendarLabel(game.year, week)}</option>)}</select></label><label className="fan-event-day">Event day<select value={eventDay} onChange={(event) => setEventDay(event.target.value)}>{DAYS.map((day) => <option key={day} value={day}>{day}</option>)}</select></label></div>{eventType === 'videoCall' ? <div className="fan-event-members"><div><strong>Select members</strong><span>{chosenIds.length} selected · {vcMembers.length} available</span><button type="button" onClick={() => setSelectedIds(chosenIds.length === vcMembers.length ? [] : vcMembers.map((member) => member.id))}>{chosenIds.length === vcMembers.length ? 'Clear all' : 'Select all'}</button></div><div>{vcMembers.map((member) => <label key={member.id}><input type="checkbox" checked={chosenIds.includes(member.id)} onChange={() => setSelectedIds((current) => current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])} /><Portrait member={member} size="tiny" /><span><strong>{displayName(member)}</strong><small>POP {member.popularity} · Energy {member.energy}</small></span></label>)}</div>{vcMembers.length ? null : <p>No members available for another Video Call in this month.</p>}</div> : <div className="fan-event-group-status"><Users size={20} /><span><strong>{eligibleMembers.length} members participate</strong><small>{meetGreetUsed ? 'Meet &amp; Greet already scheduled or completed for this week.' : dayHasCampaignLock ? 'Selected day conflicts with an automatic campaign.' : 'All available active members and trainees will be assigned.'}</small></span></div>}<div className="fan-event-action"><span><strong>{money((eventType === 'videoCall' ? chosenIds.length : eligibleMembers.length) * activity.cost)}</strong><small>Projected activity cost</small></span><button type="button" disabled={disabled} onClick={() => setConfirmEvent(true)}>Review event</button></div></div>{confirmEvent ? <ModalPortal><div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmEvent(false); }}><section className="confirm-week-modal" role="dialog" aria-modal="true" aria-labelledby="fan-event-confirm-title"><div className="confirm-week-icon">{eventType === 'videoCall' ? <PhoneCall size={24} /> : <Users size={20} />}</div><h2 id="fan-event-confirm-title">Confirm {eventType === 'videoCall' ? 'Video Call' : 'Meet & Greet'} campaign?</h2><p>Schedule {eventType === 'videoCall' ? `${chosenIds.length} selected member(s)` : `all ${eligibleMembers.length} available members`} for {calendarParts(eventWeek).month} · Week {calendarParts(eventWeek).weekOfMonth}, {eventDay}.</p><div className="confirm-week-actions"><button type="button" className="secondary-button" onClick={() => setConfirmEvent(false)}>Cancel</button><button type="button" className="setup-primary" onClick={scheduleEvent}>Confirm event <ChevronRight size={18} /></button></div></section></div></ModalPortal> : null}</section>;
}

function FixedFanEventCampaigns({ game, setGame, language = 'en', onTutorialAction }) {
  const t = (value) => translate(language, value);
  const announcedEvents = (game.fanEventPlans ?? []).filter((plan) => plan.year === game.year && ['videoCall', 'meetGreet'].includes(plan.type)).sort((a, b) => a.targetWeek - b.targetWeek);
  const [eventType, setEventType] = useState('videoCall');
  const [eventDay, setEventDay] = useState(DAYS[5]);
  const [eventWeek, setEventWeek] = useState(game.week);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmEvent, setConfirmEvent] = useState(false);
  const [eventTitles, setEventTitles] = useState({ videoCall: '', meetGreet: '' });
  const eventWeeks = useMemo(() => Array.from({ length: BALANCE.weeksPerYear - game.week + 1 }, (_, index) => game.week + index), [game.week]);
  const targetMonth = Math.ceil(eventWeek / BALANCE.weeksPerMonth);
  const eligibleMembers = game.members.filter((member) => memberCanPerformOnCampaignDate(game, member, eventType === 'videoCall' ? 'vc1' : 'mg1', game.year, eventWeek));
  const eventSchedule = eventWeek === game.week ? game.schedule : {};
  const currentMonth = Math.ceil(game.week / BALANCE.weeksPerMonth);
  const completedVcIds = new Set((game.activityEvents ?? []).filter((event) => event.type === 'videoCall' && event.year === game.year && event.month === targetMonth).map((event) => event.memberId));
  const scheduledVcIds = new Set(
    Object.entries(currentMonth === targetMonth ? game.schedule : {})
      .filter(([, activityId]) => activityId === 'vc1')
      .map(([key]) => key.slice(0, key.lastIndexOf(':'))),
  );
  const plannedVcIds = new Set((game.fanEventPlans ?? []).filter((plan) => plan.year === game.year && Math.ceil(plan.targetWeek / BALANCE.weeksPerMonth) === targetMonth && plan.type === 'videoCall').flatMap((plan) => plan.memberIds));
  const vcMembers = eligibleMembers.filter((member) => !completedVcIds.has(member.id) && !scheduledVcIds.has(member.id) && !plannedVcIds.has(member.id) && !AUTOMATIC_ACTIVITY_LOCKS.includes(eventSchedule[`${member.id}:${eventDay}`]));
  const chosenIds = selectedIds.filter((memberId) => vcMembers.some((member) => member.id === memberId));
  const conflicts = eventConflictsForWeek(game, eventWeek, eventType, eventDay, eventType === 'videoCall' ? chosenIds : []);
  const currentMonthHasMeetGreet = currentMonth === targetMonth && Object.values(game.schedule ?? {}).some((activityId) => activityId?.startsWith?.('mg'));
  const meetGreetUsed = eventType === 'meetGreet' && ((game.activityEvents ?? []).some((event) => event.type === 'meetGreet' && event.year === game.year && event.month === targetMonth) || currentMonthHasMeetGreet || (game.fanEventPlans ?? []).some((plan) => plan.year === game.year && Math.ceil(plan.targetWeek / BALANCE.weeksPerMonth) === targetMonth && plan.type === 'meetGreet'));
  const dayHasCampaignLock = (eventType === 'videoCall' ? chosenIds : eligibleMembers).some((member) => AUTOMATIC_ACTIVITY_LOCKS.includes(eventSchedule[`${member.id}:${eventDay}`]));
  const activity = BALANCE.activities[eventType === 'videoCall' ? 'vc1' : 'mg1'];
  const blockerReason = conflicts[0] || (!eligibleMembers.length ? 'No eligible members are available for the selected date.' : '') || (eventType === 'videoCall' && !vcMembers.length ? 'No members remain eligible for another Video Call in this month.' : '') || (eventType === 'videoCall' && !chosenIds.length ? 'Select at least one available member.' : '') || (dayHasCampaignLock ? 'Selected day conflicts with an automatic campaign.' : '');
  const disabled = Boolean(blockerReason);
  const eventTitle = eventTitles[eventType];
  const displayedEventTitle = eventTitle.trim() || (eventType === 'videoCall' ? 'Video Call' : 'Meet & Greet');
  useEffect(() => {
    setEventWeek((current) => Math.max(game.week, Math.min(current, BALANCE.weeksPerYear)));
  }, [game.week]);
  useEffect(() => {
    setSelectedIds((current) => current.filter((memberId) => vcMembers.some((member) => member.id === memberId)));
  }, [eventWeek, eventDay, game.year, game.week, game.schedule, game.fanEventPlans]);
  useEffect(() => {
    if (!confirmEvent) return undefined;
    const close = (event) => {
      if (event.key === 'Escape') setConfirmEvent(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [confirmEvent]);
  const scheduleEvent = () => {
    const memberIds = eventType === 'videoCall' ? chosenIds : [];
    // Always commit against the latest state. The engine re-checks conflicts and
    // records a notification instead of silently dropping a stale confirmation.
    setGame((current) => {
      const next = scheduleFanCampaign(current, eventType, eventDay, memberIds, eventWeek, eventTitle);
      if (next !== current) return next;
      const label = eventType === 'videoCall' ? 'Video Call' : 'Meet & Greet';
      return {
        ...current,
        notifications: [
          {
            type: 'critical',
            text: `${label} could not be scheduled. Check the selected date, member availability, funds, and campaign conflicts.`,
          },
          ...(current.notifications ?? []),
        ].slice(0, 20),
      };
    });
    setConfirmEvent(false);
  };
  return (<section className="fan-event-campaigns"><header><div><h2>Fan event campaigns</h2><p>Schedule Video Call and Meet &amp; Greet sessions for this week or a future week.</p></div><div className="fan-event-tabs" role="tablist" aria-label="Fan event type"><button type="button" role="tab" aria-selected={eventType === 'videoCall'} className={eventType === 'videoCall' ? 'active' : ''} onClick={() => setEventType('videoCall')}><PhoneCall size={16} /> Video Call</button><button type="button" role="tab" aria-selected={eventType === 'meetGreet'} className={eventType === 'meetGreet' ? 'active' : ''} onClick={() => setEventType('meetGreet')}><Users size={16} /> Meet &amp; Greet</button></div></header>{conflicts.length ? <EventConflictNotice game={game} week={eventWeek} eventType={eventType} day={eventDay} memberIds={eventType === 'videoCall' ? chosenIds : []} /> : null}<div className="fan-event-setup"><label className="campaign-title-field">Event title<input name={`${eventType}-title`} autoComplete="off" value={eventTitle} maxLength={60} onChange={(event) => setEventTitles((current) => ({ ...current, [eventType]: event.target.value }))} placeholder={eventType === 'videoCall' ? 'Video Call' : 'Meet & Greet'} /></label><div className="fan-event-facts"><span><small>Ticket price</small><strong>{money(activity.ticket)}</strong></span><span><small>Slots / member</small><strong>{activity.capacity}</strong></span><span><small>Energy / member</small><strong>{activity.energy}</strong></span><span><small>Frequency</small><strong>{eventType === 'videoCall' ? 'Once / member / month' : 'Once / month'}</strong></span></div><div className="fan-event-date-fields"><label className="fan-event-day">Event week<select value={eventWeek} onChange={(event) => setEventWeek(Number(event.target.value))}>{eventWeeks.map((week) => (<option key={week} value={week}>{calendarLabel(game.year, week)}</option>))}</select></label><label className="fan-event-day">Event day<select value={eventDay} onChange={(event) => setEventDay(event.target.value)}>{DAYS.map((day) => (<option key={day} value={day}>{day}</option>))}</select></label></div>{eventType === 'videoCall' ? (<div className="fan-event-members"><div><strong>Select members</strong><span>{chosenIds.length} selected · {vcMembers.length} available</span><button type="button" onClick={() => setSelectedIds(chosenIds.length === vcMembers.length ? [] : vcMembers.map((member) => member.id))}>{chosenIds.length === vcMembers.length ? 'Clear all' : 'Select all'}</button></div><div>{vcMembers.map((member) => (<label key={member.id}><input type="checkbox" checked={chosenIds.includes(member.id)} onChange={() => setSelectedIds((current) => (current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id]))} /><Portrait member={member} size="tiny" /><span><strong>{displayName(member)}</strong><small>POP {member.popularity} · Energy {member.energy}</small></span></label>))}</div>{vcMembers.length ? null : <p>No members available for another Video Call in this month.</p>}</div>) : (<div className="fan-event-group-status"><Users size={20} /><span><strong>{eligibleMembers.length} members participate</strong><small>{meetGreetUsed ? 'Meet &amp; Greet already scheduled or completed for this week.' : dayHasCampaignLock ? 'Selected day conflicts with an automatic campaign.' : 'All available active members and trainees will be assigned.'}</small></span></div>)}{blockerReason ? (<p className="campaign-block-reason" role="status">{t(blockerReason)}</p>) : null}<div className="fan-event-action"><span><strong>{money((eventType === 'videoCall' ? chosenIds.length : eligibleMembers.length) * activity.cost)}</strong><small>Projected activity cost</small></span><button type="button"disabled={disabled}onClick={() => {setConfirmEvent(true);onTutorialAction?.('fan-event-reviewed');}}>Review event</button></div></div>{announcedEvents.length ? (<div className="fan-event-plan-list" aria-label={t('Scheduled fan events')}>{announcedEvents.map((plan) => (<article key={plan.id}><span><strong {...(plan.customTitle ? { 'data-i18n-ignore': 'true' } : {})}>{plan.title ?? (plan.type === 'videoCall' ? 'Video Call' : 'Meet & Greet')}</strong><small>{calendarLabel(plan.year, plan.targetWeek)} · {t(plan.day)}</small></span><b>{t('Announced')}</b></article>))}</div>) : null}{confirmEvent ? (<ModalPortal><div className="setup-modal-backdrop confirmation-backdrop"role="presentation"onMouseDown={(event) => {if (event.target === event.currentTarget) setConfirmEvent(false);}}><section className="confirm-week-modal campaign-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="fan-event-confirm-title"><div className="confirm-week-icon">{eventType === 'videoCall' ? <PhoneCall size={24} /> : <Users size={20} />}</div><h2 id="fan-event-confirm-title">Confirm <span data-i18n-ignore="true">{displayedEventTitle}</span>?</h2><p>Schedule {eventType === 'videoCall' ? `${chosenIds.length} selected member(s)` : `all ${eligibleMembers.length} available members`} for {calendarLabel(game.year, eventWeek)}, {eventDay}.</p>{conflicts.length ? <p className="event-conflict-warning">This slot is no longer available: {conflicts.join(' ')}</p> : null}<div className="confirm-week-actions"><button type="button" className="secondary-button" onClick={() => setConfirmEvent(false)}>Cancel</button><button type="button" className="setup-primary" disabled={disabled} onClick={scheduleEvent}>Confirm event <ChevronRight size={18} /></button></div></section></div></ModalPortal>) : null}</section>);
}

function FanEventCampaigns({ game, setGame, language = 'en', onTutorialAction }) {
  return (<div className="fan-event-box"><FixedFanEventCampaigns game={game} setGame={setGame} language={language} onTutorialAction={onTutorialAction} /></div>);
}

function MajorCampaignPanel({ game, setGame, language = 'en' }) {
  const current = game.campaign;
  // Campaigns are started explicitly by the manager. Legacy nextCampaignConfig
  // drafts are intentionally not rendered or scheduled automatically.
  const text = (en, id) => language === 'id' ? id : en;
  const standings = current?.liveStandings ?? current?.result?.standings ?? [];
  const standingsLimit = current?.type === 'request-hour' && current?.result ? (Number(current.requestHourTopCount ?? current.result.requestHourTopCount ?? current.result.topCount) === 30 ? 30 : 40) : 12;
  const memberName = (memberId) => game.members.find((member) => member.id === memberId)?.nickname || game.members.find((member) => member.id === memberId)?.name || game.campaign?.participants?.memberSnapshots?.find((member) => member.memberId === memberId)?.nickname || game.campaign?.participants?.memberSnapshots?.find((member) => member.memberId === memberId)?.name || historicalCampaignMember(game, memberId)?.nickname || historicalCampaignMember(game, memberId)?.name || memberId;
  const songName = (songId) => dreamSetlistSongs.find((song) => song.id === songId)?.title || songId;
  return <section className="major-campaign-panel"><div className="major-campaign-head"><div><span className="eyebrow">{text('Major campaign', 'Kampanye utama')}</span><h2>{current ? current.type.replace('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : text('Campaigns are optional', 'Kampanye bersifat opsional')}</h2><p>{text('Hold at most one Sousenkyo, Request Hour, or Janken per calendar year. Waiting does not create or skip a campaign.', 'Adakan maksimal satu Sousenkyo, Request Hour, atau Janken per tahun kalender. Menunggu tidak membuat atau melewati kampanye.')}</p></div>{current ? <span className={`campaign-status campaign-status-${current.status}`}>{current.status}</span> : <span className="campaign-status">{text('No campaign held', 'Belum ada kampanye')}</span>}</div>{current ? <div className="major-campaign-metrics"><div><span>{text('Week progress', 'Progres minggu')}</span><strong>{current.progressWeeks ?? Math.min(current.durationWeeks, Math.max(0, game.week - current.startWeek + 1))}/{current.durationWeeks}</strong></div><div><span>{text('Votes / support', 'Suara / dukungan')}</span><strong>{number.format(current.totalVotes ?? 0)}</strong></div><div><span>{text('Revenue / vote', 'Pendapatan / suara')}</span><strong>{money(current.totalVotes ? Math.round((current.votingRevenue ?? 0) / current.totalVotes) : 0)}</strong></div><div><span>{text('Total revenue', 'Total pendapatan')}</span><strong>{money(current.votingRevenue ?? 0)}</strong></div></div> : null}{current && standings.length ? <div className="major-campaign-standings"><div><strong>{current.type === 'request-hour' && current.result ? text(`Top ${standingsLimit} final ranking`, `Peringkat akhir Top ${standingsLimit}`) : text('Live standings', 'Peringkat langsung')}</strong><span>{current.type === 'janken' ? text('Support does not affect seeded matches.', 'Dukungan tidak memengaruhi pertandingan ber-seed.') : current.type === 'request-hour' && current.result ? text('These songs form the result concert.', 'Lagu-lagu ini menjadi susunan konser hasil.') : text('Rankings update weekly.', 'Peringkat diperbarui tiap minggu.')}</span></div><ol>{standings.slice(0, standingsLimit).map((entry) => <li key={entry.memberId ?? entry.songId}><span>{entry.rank ?? ''}</span><strong>{entry.name ?? entry.title ?? memberName(entry.memberId ?? '')}</strong><small>{number.format(entry.votes ?? entry.supports ?? 0)}</small></li>)}</ol></div> : null}{current?.result ? <><div className="major-campaign-result"><Trophy size={18} /><span><strong>{current.type === 'janken' ? text('Janken winner', 'Pemenang Janken') : text('Result', 'Hasil')}</strong><small>{current.type === 'sousenkyo' ? `${text('Center', 'Center')}: ${memberName(current.result.winnerMemberId)}` : current.type === 'request-hour' ? `${text('Winning song', 'Lagu pemenang')}: ${songName(current.result.winnerSongId)}` : memberName(current.result.winnerMemberId)}</small>{current.type === 'janken' && current.result.rounds ? <small>{text(`${current.result.rounds.length} seeded rounds · ${current.result.bracketSize}-slot bracket`, `${current.result.rounds.length} ronde seed · bracket ${current.result.bracketSize} slot`)}</small> : null}</span></div><CampaignRewardDetails game={game} campaign={current} language={language} /></> : null}{(game.campaignHistory ?? []).length ? <div className="major-campaign-history"><strong>{text('Campaign history', 'Riwayat kampanye')}</strong>{game.campaignHistory.slice(-3).reverse().map((entry) => <span key={`${entry.id}-${entry.archivedAt?.week ?? 0}`}>{entry.campaignYear} · {entry.type} · {entry.status}</span>)}</div> : null}</section>;
}

function CampaignRewardDetails({ game, campaign, language = 'en' }) {
  const text = (en, id) => language === 'id' ? id : en;
  const localized = (value) => translate(language, value);
  const songName = (songId) => dreamSetlistSongs.find((song) => song.id === songId)?.title || songId;
  const rewardConcert = (game.concerts ?? []).find((concert) => concert.id === campaign.rewardConcertId || concert.campaignId === campaign.id);
  const rewardMvs = (game.singles ?? []).filter((single) => single.campaignId === campaign.id);
  const mainMv = rewardMvs.find((single) => single.id === campaign.mvProjectId) ?? rewardMvs[0] ?? null;
  const underGirlsMv = rewardMvs.find((single) => single.id === campaign.underGirlsMvProjectId) ?? rewardMvs.find((single) => single.id !== mainMv?.id) ?? null;
  const dateLabel = (year, week, day = null) => {
    if (!Number.isInteger(year) || !Number.isInteger(week)) return null;
    const date = localized(calendarLabel(year, week));
    return day ? `${date} · ${localized(day)}` : date;
  };
  const concertDate = dateLabel(rewardConcert?.targetYear ?? campaign.rewardConcertYear, rewardConcert?.targetWeek ?? campaign.rewardConcertWeek, rewardConcert?.day ?? campaign.concertDay);
  const releaseDate = (single) => {
    if (!single) {
      if (campaign.status === 'concert-scheduled' && Number.isInteger(rewardConcert?.targetYear) && Number.isInteger(rewardConcert?.targetWeek)) {
        const releaseAbsolute = absoluteWeek(rewardConcert.targetYear, rewardConcert.targetWeek) + (campaign.mvProductionDurationWeeks ?? 4) + 1;
        const releaseYear = Math.floor((releaseAbsolute - 1) / BALANCE.weeksPerYear) + 1;
        const releaseWeek = ((releaseAbsolute - 1) % BALANCE.weeksPerYear) + 1;
        return `${dateLabel(releaseYear, releaseWeek)} (${text('estimated', 'perkiraan')})`;
      }
      return campaign.rewardConcertStatus === 'completed' || ['mv-pending', 'mv-budget-pending', 'mv-production'].includes(campaign.status)
        ? text('Pending', 'Menunggu')
        : text('After reward concert', 'Setelah konser hadiah');
    }
    if (Number.isInteger(single.releasedYear) && Number.isInteger(single.releasedWeek)) return dateLabel(single.releasedYear, single.releasedWeek);
    if (Number.isInteger(single.year) && Number.isInteger(single.week) && Number.isFinite(single.durationWeeks)) {
      const releaseAbsolute = absoluteWeek(single.year, single.week) + Math.max(1, Math.round(single.durationWeeks));
      const releaseYear = Math.floor((releaseAbsolute - 1) / BALANCE.weeksPerYear) + 1;
      const releaseWeek = ((releaseAbsolute - 1) % BALANCE.weeksPerYear) + 1;
      return `${dateLabel(releaseYear, releaseWeek)} (${text('estimated', 'perkiraan')})`;
    }
    return text('Pending', 'Menunggu');
  };
  const concertName = rewardConcert?.title ?? campaign.result?.concertTitle ?? campaign.result?.concertName ?? text('Result concert', 'Konser hasil');
  const rewardSongId = campaign.rewardSongId ?? campaign.result?.rewardSongId ?? campaign.result?.winnerSongId;
  const mainMvName = mainMv?.title ?? (rewardSongId ? `${songName(rewardSongId)} MV` : text('Not started', 'Belum dimulai'));
  const mvDate = releaseDate(mainMv);
  const underGirlsDate = underGirlsMv ? releaseDate(underGirlsMv) : null;
  const userTitle = Boolean(rewardConcert?.customTitle);
  return <div className="campaign-result-details"><div><span>{text('Concert name', 'Nama konser')}</span><strong {...(userTitle ? { 'data-i18n-ignore': 'true' } : {})}>{concertName}</strong></div><div><span>{text('Concert date', 'Tanggal konser')}</span><strong>{concertDate ?? text('Not scheduled', 'Belum dijadwalkan')}</strong></div><div><span>{text('MV name', 'Nama MV')}</span><strong>{mainMvName}</strong>{underGirlsMv ? <small>{text('Under Girls MV', 'MV Under Girls')}: {underGirlsMv.title}</small> : null}</div><div><span>{text('MV release date', 'Tanggal rilis MV')}</span><strong>{mvDate}</strong>{underGirlsDate ? <small>{text('Under Girls release', 'Rilis Under Girls')}: {underGirlsDate}</small> : null}</div></div>;
}

function CampaignParticipantDetails({ game, language = 'en' }) {
  const campaign = game.campaign;
  if (!campaign || !['sousenkyo', 'request-hour', 'janken'].includes(campaign.type)) return null;
  const campaignCleared = ['completed', 'cancelled', 'skipped'].includes(campaign.status);
  const legacyRequestHourIds = campaign.type === 'request-hour' && !campaignCleared
    ? game.members.filter((member) => ['active', 'trainee'].includes(member.status)).map((member) => member.id)
    : EMPTY_PARTICIPANT_LIST;
  const participantIds = campaign.participants?.memberIds?.length ? campaign.participants.memberIds : legacyRequestHourIds;
  if (!participantIds.length) return null;
  const summaryLabel = campaign.type === 'sousenkyo' ? 'Sousenkyo participants' : campaign.type === 'request-hour' ? 'Request Hour participants' : 'Janken participants';
  const centerId = campaign.result?.centerMemberId ?? campaign.result?.winnerMemberId ?? null;
  return <ParticipantDetails game={game} participantIds={participantIds} participantSnapshots={campaign.participants?.memberSnapshots ?? EMPTY_PARTICIPANT_LIST} centerId={centerId} language={language} summaryLabel={summaryLabel} />;
}

function LegacyCampaignLaunchEditor({ game, setGame, language = 'en' }) {
  const text = (en, id) => language === 'id' ? id : en;
  const nextType = getNextMajorCampaignType(game);
  const active = game.campaign && !['completed', 'cancelled', 'skipped'].includes(game.campaign.status);
  const beforeFirstCampaignYear = game.year < (game.firstCampaignYear ?? 2);
  const [durationWeeks, setDurationWeeks] = useState(12);
  const [concertBudgetId, setConcertBudgetId] = useState('standard');
  const [concertVenueId, setConcertVenueId] = useState('hall');
  const [mvBudgetId, setMvBudgetId] = useState('medium');
  const [concertDay, setConcertDay] = useState(DAYS[5]);
  const [requestHourTopCount, setRequestHourTopCount] = useState(40);
  useEffect(() => {
    setDurationWeeks(12);
    setConcertBudgetId('standard');
    setConcertVenueId('hall');
    setMvBudgetId('medium');
    setConcertDay(DAYS[5]);
    setRequestHourTopCount(40);
  }, [nextType, game.campaign?.id, game.campaign?.status]);
  const start = () => setGame((state) => startMajorCampaign(state, { durationWeeks, concertBudgetId, concertVenueId, mvBudgetId, concertDay, requestHourTopCount }));
  return <section className="major-campaign-config campaign-launch-editor"><div><strong>{text('Start the next campaign', 'Mulai kampanye berikutnya')}</strong><span>{text(`Next in rotation: ${nextType.replace('-', ' ')}`, `Berikutnya dalam rotasi: ${nextType.replace('-', ' ')}`)}</span><small>{beforeFirstCampaignYear ? text('Campaigns unlock in Year 2.', 'Kampanye terbuka mulai Tahun 2.') : text(`You choose when to hold it. Current date: ${calendarLabel(game.year, game.week)}.`, `Anda memilih kapan mengadakannya. Tanggal saat ini: ${calendarLabel(game.year, game.week)}.`)}</small></div><div className="campaign-launch-fields"><label><span>{text('Duration', 'Durasi')}</span><input type="number" min="8" max="16" value={durationWeeks} onChange={(event) => setDurationWeeks(Math.max(8, Math.min(16, Number(event.target.value) || 12)))} /></label>{nextType === 'request-hour' ? <label><span>{text('Result concert size', 'Ukuran konser hasil')}</span><select value={requestHourTopCount} onChange={(event) => setRequestHourTopCount(Number(event.target.value) === 30 ? 30 : 40)}><option value={30}>Top 30</option><option value={40}>Top 40</option></select></label> : null}<label><span>{text('Concert budget', 'Anggaran konser')}</span><select value={concertBudgetId} onChange={(event) => setConcertBudgetId(event.target.value)}>{CONCERT_BUDGETS.map((budget) => <option key={budget.id} value={budget.id}>{budget.name} · {money(budget.cost)}</option>)}</select></label><label><span>{text('Concert venue', 'Venue konser')}</span><select value={concertVenueId} onChange={(event) => setConcertVenueId(event.target.value)}>{CONCERT_VENUES.map((venue) => <option key={venue.id} value={venue.id}>{venue.name} · {money(venue.cost)}</option>)}</select></label><label><span>{text('MV budget', 'Anggaran MV')}</span><select value={mvBudgetId} onChange={(event) => setMvBudgetId(event.target.value)}>{SINGLE_BUDGETS.map((budget) => <option key={budget.id} value={budget.id}>{budget.name} · {money(budget.cost)}</option>)}</select></label><label><span>{text('Concert day', 'Hari konser')}</span><select value={concertDay} onChange={(event) => setConcertDay(event.target.value)}>{DAYS.map((day) => <option key={day} value={day}>{day}</option>)}</select></label></div><button type="button" className="setup-primary" onClick={start} disabled={active || beforeFirstCampaignYear || game.runStatus === 'ended'}>{active ? text('Campaign in progress', 'Kampanye sedang berjalan') : beforeFirstCampaignYear ? text('Available in Year 2', 'Tersedia di Tahun 2') : text(`Start ${nextType.replace('-', ' ')}`, `Mulai ${nextType.replace('-', ' ')}`)}</button></section>;
}

function CampaignLaunchEditor({ game, setGame, language = 'en' }) {
  const text = (en, id) => language === 'id' ? id : en;
  const nextType = getNextMajorCampaignType(game);
  const blockReason = getMajorCampaignStartBlockReason(game);
  const blockingSingle = game.singles.find((single) => single.status !== 'released');
  const [durationWeeks, setDurationWeeks] = useState(12);
  const [concertBudgetId, setConcertBudgetId] = useState('standard');
  const [concertVenueId, setConcertVenueId] = useState('hall');
  const [mvBudgetId, setMvBudgetId] = useState('medium');
  const [concertDay, setConcertDay] = useState(DAYS[5]);
  const [requestHourTopCount, setRequestHourTopCount] = useState(40);
  const durationLabel = ['sousenkyo', 'request-hour'].includes(nextType) ? text('Campaign duration (weeks)', 'Durasi kampanye (minggu)') : text('Duration', 'Durasi');
  useEffect(() => {
    setDurationWeeks(12);
    setConcertBudgetId('standard');
    setConcertVenueId('hall');
    setMvBudgetId('medium');
    setConcertDay(DAYS[5]);
    setRequestHourTopCount(40);
  }, [nextType, game.campaign?.id, game.campaign?.status]);
  const start = () => setGame((state) => startMajorCampaign(state, { durationWeeks, concertBudgetId, concertVenueId, mvBudgetId, concertDay, requestHourTopCount }));
  const blockerCopy = blockReason === 'campaign-in-progress'
    ? text('Finish the current major campaign before starting another.', 'Selesaikan kampanye utama saat ini sebelum memulai kampanye lain.')
    : blockReason === 'campaign-held-this-year'
      ? text(`A major campaign has already run in Year ${game.year}. The next campaign opens in Year ${game.year + 1}.`, `Kampanye utama sudah dijalankan pada Tahun ${game.year}. Kampanye berikutnya terbuka pada Tahun ${game.year + 1}.`)
      : blockReason === 'mv-in-progress'
        ? text(`Finish ${blockingSingle?.title ?? 'the current MV'} before starting a major campaign.`, `Selesaikan ${blockingSingle?.title ?? 'MV saat ini'} sebelum memulai kampanye utama.`)
        : blockReason === 'campaigns-locked'
          ? text('Campaigns unlock in Year 2.', 'Kampanye terbuka mulai Tahun 2.')
          : blockReason === 'missing-members'
            ? text('At least 12 available members are required to start a major campaign.', 'Diperlukan minimal 12 anggota yang tersedia untuk memulai kampanye utama.')
          : blockReason === 'run-ended'
            ? text('This run has ended.', 'Permainan ini telah berakhir.')
            : text(`You choose when to hold it. Current date: ${calendarLabel(game.year, game.week)}.`, `Anda memilih kapan mengadakannya. Tanggal saat ini: ${calendarLabel(game.year, game.week)}.`);
  const buttonCopy = blockReason === 'campaign-in-progress'
    ? text('Campaign in progress', 'Kampanye sedang berjalan')
    : blockReason === 'campaign-held-this-year'
      ? text('Campaign held this year', 'Kampanye sudah diadakan tahun ini')
      : blockReason === 'mv-in-progress'
        ? text('MV production in progress', 'Produksi MV sedang berjalan')
        : blockReason === 'campaigns-locked'
          ? text('Available in Year 2', 'Tersedia di Tahun 2')
          : blockReason === 'missing-members'
            ? text('Need 12 available members', 'Butuh 12 anggota tersedia')
            : text(`Start ${nextType.replace('-', ' ')}`, `Mulai ${nextType.replace('-', ' ')}`);
  const configuredVenue = CONCERT_VENUES.find((venue) => venue.id === concertVenueId) ?? CONCERT_VENUES[0];
  const configuredBudget = CONCERT_BUDGETS.find((budget) => budget.id === concertBudgetId) ?? CONCERT_BUDGETS[0];
  return <section className="major-campaign-config campaign-launch-editor"><div><strong>{text('Start the next campaign', 'Mulai kampanye berikutnya')}</strong><span>{text(`Next in rotation: ${nextType.replace('-', ' ')}`, `Berikutnya dalam rotasi: ${nextType.replace('-', ' ')}`)}</span><small aria-live="polite">{blockerCopy}</small></div><div className="campaign-launch-fields"><label><span>{durationLabel}</span><input type="number" min="8" max="16" value={durationWeeks} onChange={(event) => setDurationWeeks(Math.max(8, Math.min(16, Number(event.target.value) || 12)))} /></label>{nextType === 'request-hour' ? <label><span>{text('Result concert size', 'Ukuran konser hasil')}</span><select value={requestHourTopCount} onChange={(event) => setRequestHourTopCount(Number(event.target.value) === 30 ? 30 : 40)}><option value={30}>Top 30</option><option value={40}>Top 40</option></select></label> : null}<label><span>{text('Concert budget', 'Anggaran konser')}</span><select value={concertBudgetId} onChange={(event) => setConcertBudgetId(event.target.value)}>{CONCERT_BUDGETS.map((budget) => <option key={budget.id} value={budget.id}>{concertBudgetOptionLabel(game, budget, configuredVenue)}</option>)}</select></label><label><span>{text('Concert venue', 'Venue konser')}</span><select value={concertVenueId} onChange={(event) => setConcertVenueId(event.target.value)}>{CONCERT_VENUES.map((venue) => <option key={venue.id} value={venue.id}>{concertVenueOptionLabel(game, venue, configuredBudget)}</option>)}</select></label><label><span>{text('MV budget', 'Anggaran MV')}</span><select value={mvBudgetId} onChange={(event) => setMvBudgetId(event.target.value)}>{SINGLE_BUDGETS.map((budget) => <option key={budget.id} value={budget.id}>{budget.name} · {money(budget.cost)}</option>)}</select></label><label><span>{text('Concert day', 'Hari konser')}</span><select value={concertDay} onChange={(event) => setConcertDay(event.target.value)}>{DAYS.map((day) => <option key={day} value={day}>{day}</option>)}</select></label></div>{blockReason ? <p className="campaign-block-reason" role="status">{blockerCopy}</p> : null}<button type="button" className="setup-primary" onClick={start} disabled={Boolean(blockReason)}>{buttonCopy}</button></section>;
}

function JankenLuckNotice({ game, language = 'en' }) {
  if (game.campaign?.type !== 'janken') return null;
  return <div className="campaign-luck-notice" role="note">{language === 'id' ? 'Janken hanya menggunakan keberuntungan acak. Voting, dukungan, dan statistik anggota tidak memengaruhi pemenang.' : 'Janken uses pure random luck. Votes, support, and member stats do not affect the winner.'}</div>;
}

function CampaignBracketPreview({ game, language = 'en' }) {
  const campaign = game.campaign;
  if (campaign?.type !== 'janken' || !campaign.bracket?.rounds?.length || campaign.result) return null;
  const label = language === 'id' ? 'Bracket Janken awal' : 'Seeded Janken bracket';
  const names = (id) => id ? game.members.find((member) => member.id === id)?.nickname || game.members.find((member) => member.id === id)?.name || id : (language === 'id' ? 'Bye' : 'Bye');
  return <section className="major-campaign-panel campaign-bracket-preview"><div className="major-campaign-head"><div><span className="eyebrow">{label}</span><h2>{campaign.bracket.bracketSize}-slot bracket</h2><p>{language === 'id' ? 'Seed dan bye ditentukan saat kampanye dibuka.' : 'Seeds and byes are fixed when the campaign opens.'}</p></div></div><div className="major-campaign-standings"><ol>{campaign.bracket.rounds[0].map((match) => <li key={match.match}><span>#{match.match}</span><strong>{names(match.memberAId)} vs {names(match.memberBId)}</strong><small>{match.bye ? (language === 'id' ? 'bye' : 'bye') : (language === 'id' ? 'menunggu' : 'pending')}</small></li>)}</ol></div></section>;
}

function CampaignTimingEditor({ game, setGame, language = 'en' }) {
  const next = game.nextCampaignConfig;
  const [startWeek, setStartWeek] = useState(next?.startWeek ?? 1);
  useEffect(() => { setStartWeek(next?.startWeek ?? 1); }, [next?.id, next?.startWeek]);
  if (!next) return null;
  const text = (en, id) => language === 'id' ? id : en;
  return <div className="major-campaign-config campaign-timing-editor"><label><span>{text('Start week', 'Minggu mulai')}</span><input type="number" min="1" max="40" value={startWeek} onChange={(event) => setStartWeek(Math.max(1, Math.min(40, Number(event.target.value) || 1)))} /></label><button type="button" className="secondary-button" onClick={() => setGame((state) => configureMajorCampaign(state, { startWeek, durationWeeks: next.durationWeeks, concertBudgetId: next.concertBudgetId, concertVenueId: next.concertVenueId, mvBudgetId: next.mvBudgetId, concertDay: next.concertDay }))}>{text('Save start week', 'Simpan minggu mulai')}</button></div>;
}

function CampaignParticipationEditor({ game, setGame, language = 'en' }) {
  const next = game.nextCampaignConfig;
  const [held, setHeld] = useState(next?.held !== false);
  useEffect(() => { setHeld(next?.held !== false); }, [next?.id, next?.held]);
  if (!next) return null;
  const text = (en, id) => language === 'id' ? id : en;
  const saveChoice = (value) => {
    setHeld(value);
    setGame((state) => configureMajorCampaign(state, { startWeek: next.startWeek, durationWeeks: next.durationWeeks, concertBudgetId: next.concertBudgetId, concertVenueId: next.concertVenueId, mvBudgetId: next.mvBudgetId, concertDay: next.concertDay, held: value }));
  };
  return <div className="major-campaign-config campaign-participation-editor"><div><strong>{text('Annual campaign participation', 'Partisipasi kampanye tahunan')}</strong><span>{text(`Choose whether to hold ${next.type.replace('-', ' ')} next year. Skipping removes voting, result concert, and MV rewards.`, `Pilih apakah ${next.type.replace('-', ' ')} tahun depan akan diadakan. Melewati kampanye menghapus voting, konser hasil, dan hadiah MV.`)}</span></div><div className="campaign-choice-buttons" role="group" aria-label={text('Campaign participation', 'Partisipasi kampanye')}><button type="button" className={held ? 'active' : ''} aria-pressed={held} onClick={() => saveChoice(true)}>{text('Hold campaign', 'Adakan kampanye')}</button><button type="button" className={!held ? 'active' : ''} aria-pressed={!held} onClick={() => saveChoice(false)}>{text('Skip campaign', 'Lewati kampanye')}</button></div></div>;
}

function CampaignRewardBudgetEditor({ game, setGame, language = 'en' }) {
  const next = game.nextCampaignConfig;
  const [concertBudgetId, setConcertBudgetId] = useState(next?.concertBudgetId ?? 'standard');
  const [concertVenueId, setConcertVenueId] = useState(next?.concertVenueId ?? 'hall');
  const [mvBudgetId, setMvBudgetId] = useState(next?.mvBudgetId ?? 'medium');
  const configuredVenue = CONCERT_VENUES.find((venue) => venue.id === concertVenueId) ?? CONCERT_VENUES[0];
  const configuredBudget = CONCERT_BUDGETS.find((budget) => budget.id === concertBudgetId) ?? CONCERT_BUDGETS[0];
  useEffect(() => {
    setConcertBudgetId(next?.concertBudgetId ?? 'standard');
    setConcertVenueId(next?.concertVenueId ?? 'hall');
    setMvBudgetId(next?.mvBudgetId ?? 'medium');
  }, [next?.id, next?.concertBudgetId, next?.concertVenueId, next?.mvBudgetId]);
  if (!next) return null;
  const text = (en, id) => language === 'id' ? id : en;
  return <div className="major-campaign-config campaign-reward-budget-editor"><div><strong>{text('Reward production budgets', 'Anggaran produksi hadiah')}</strong><span>{text('Choose the concert and MV budgets before next year starts.', 'Pilih anggaran konser dan MV sebelum tahun depan dimulai.')}</span></div><label><span>{text('Concert budget', 'Anggaran konser')}</span><select value={concertBudgetId} onChange={(event) => setConcertBudgetId(event.target.value)}>{CONCERT_BUDGETS.map((budget) => <option key={budget.id} value={budget.id}>{concertBudgetOptionLabel(game, budget, configuredVenue)}</option>)}</select></label><label><span>{text('Concert venue', 'Venue konser')}</span><select value={concertVenueId} onChange={(event) => setConcertVenueId(event.target.value)}>{CONCERT_VENUES.map((venue) => <option key={venue.id} value={venue.id}>{concertVenueOptionLabel(game, venue, configuredBudget)}</option>)}</select></label><label><span>{text('MV budget', 'Anggaran MV')}</span><select value={mvBudgetId} onChange={(event) => setMvBudgetId(event.target.value)}>{SINGLE_BUDGETS.map((budget) => <option key={budget.id} value={budget.id}>{budget.name} · {money(budget.cost)}</option>)}</select></label><button type="button" className="secondary-button" onClick={() => setGame((state) => configureMajorCampaign(state, { startWeek: next.startWeek, durationWeeks: next.durationWeeks, concertBudgetId, concertVenueId, mvBudgetId, concertDay: next.concertDay }))}>{text('Save reward budgets', 'Simpan anggaran hadiah')}</button></div>;
}

function CampaignRewardStatus({ game, language = 'en' }) {
  const campaign = game.campaign;
  if (!campaign || !['sousenkyo', 'request-hour', 'janken'].includes(campaign.type)) return null;
  const text = (en, id) => language === 'id' ? id : en;
  const concertBudget = CONCERT_BUDGETS.find((budget) => budget.id === campaign.concertBudgetId);
  const mvBudget = SINGLE_BUDGETS.find((budget) => budget.id === campaign.mvBudgetId);
  const rewardConcert = (game.concerts ?? []).find((concert) => concert.id === campaign.rewardConcertId);
  return <section className="major-campaign-panel campaign-reward-status"><div className="major-campaign-head"><div><span className="eyebrow">{text('Reward pipeline', 'Alur hadiah')}</span><h2>{text('Voting → Concert → MV Release', 'Voting → Konser → Rilis MV')}</h2><p>{text('Campaign reward production follows the configured budget and keeps concert/MV work above VC and template assignments.', 'Produksi hadiah kampanye memakai anggaran yang dipilih dan menempatkan konser/MV di atas VC serta template.')}</p></div></div><div className="major-campaign-metrics"><div><span>{text('Concert budget', 'Anggaran konser')}</span><strong>{concertBudget?.name ?? campaign.concertBudgetId}</strong></div><div><span>{text('MV budget', 'Anggaran MV')}</span><strong>{mvBudget?.name ?? campaign.mvBudgetId}</strong></div><div><span>{text('Concert status', 'Status konser')}</span><strong>{rewardConcert?.status ?? campaign.rewardConcertStatus ?? text('Waiting', 'Menunggu')}</strong></div><div><span>{text('Performers', 'Penampil')}</span><strong>{campaign.rewardConcertMemberIds?.length ?? 0}</strong></div></div></section>;
}

function ConcertCostNotice({ game, budget, venue, language = 'en' }) {
  if (!budget || !venue) return null;
  const quote = getConcertCostBreakdown(game, budget, venue);
  const text = language === 'id'
    ? `Maksimal satu konser reguler per kuartal; Q4 dicadangkan untuk Konser Hari Jadi. Venue ${CONCERT_COST_RULES.venueMultiplier}× harga dasar; produksi ${Math.round(quote.productionRatio * 100)}% dari biaya venue. Tahun ${quote.costYear} menambah ${Math.round(quote.yearRate * 100)}%. Total pilihan ini ${money(quote.upfrontCost)}.`
    : `One regular concert per quarter; Q4 is reserved for the Anniversary Concert. Venue is ${CONCERT_COST_RULES.venueMultiplier}× the base price; production is ${Math.round(quote.productionRatio * 100)}% of venue cost. Year ${quote.costYear} adds ${Math.round(quote.yearRate * 100)}%. This selection totals ${money(quote.upfrontCost)}.`;
  // This is an informational price/rules note, not a blocker. Keep it out of
  // the blocker styling so an available campaign does not look disabled.
  return <p className="campaign-cost-note" role="note">{text}</p>;
}

// Keep calculated concert prices in React's render tree. Directly rewriting
// option.textContent after render can desynchronise controlled selects (and the
// document localization observer), especially when switching to Indonesian.
const concertBudgetOptionLabel = (game, budget, venue) => `${budget.name} · ${money(getConcertCostBreakdown(game, budget, venue).productionCost)}`;
const concertVenueOptionLabel = (game, venue, budget) => `${venue.name} · ${number.format(venue.capacity)} seats · +${money(getConcertCostBreakdown(game, budget, venue).venueCost)}`;

function Campaigns({ game, setGame, selectedMember, setSelectedMember, onRenovate, language = 'en', onTutorialAction }) {
  const t = (value) => translate(language, value);
  const [confirmSingle, setConfirmSingle] = useState(false);
  const productionConfirmRef = useRef(null);
  const productionCancelRef = useRef(null);
  const [productionDay, setProductionDay] = useState(DAYS[0]);
  const [mvLineupIds, setMvLineupIds] = useState([]);
  const [concertDay, setConcertDay] = useState(DAYS[5]);
  const releaseOptions = useMemo(() => campaignMonthOptions(game, 5), [game.week, game.year]);
  const concertOptions = useMemo(() => campaignMonthOptions(game, 2).filter((option) => concertQuarterForWeek(option.targetWeek) !== 4), [game.week, game.year]);
  // Seed each selector from the first valid window so a blocker message is
  // not shown for an empty, transient selection during the initial render.
  const [releaseTarget, setReleaseTarget] = useState(() => releaseOptions[0]?.value ?? '');
  const [concertTarget, setConcertTarget] = useState(() => concertOptions[0]?.value ?? '');
  const [singleTitle, setSingleTitle] = useState('');
  const [singleBudgetId, setSingleBudgetId] = useState('medium');
  const [concertTitle, setConcertTitle] = useState('');
  const [concertBudgetId, setConcertBudgetId] = useState(CONCERT_BUDGETS[0].id);
  const concertVenues = game.concertVenueOffers?.length ? game.concertVenueOffers : CONCERT_VENUES;
  const [concertVenueId, setConcertVenueId] = useState(concertVenues[0].id);
  const [confirmAudition, setConfirmAudition] = useState(false);
  const [auditionSelection, setAuditionSelection] = useState([]);
  const [confirmAuditionSelection, setConfirmAuditionSelection] = useState(false);
  const [inspectingCandidateId, setInspectingCandidateId] = useState(null);
  const [confirmRenovation, setConfirmRenovation] = useState(false);
  const selectedRelease = releaseOptions.find((option) => option.value === releaseTarget);
  const eligibilityDate = selectedRelease
    ? { year: selectedRelease.year, week: selectedRelease.targetWeek }
    : { year: game.year, week: game.week };
  const eligibleMembers = getSingleEligibleMembers(game, eligibilityDate.year, eligibilityDate.week);
  const mvRosterMembers = game.members
    .filter((member) => ['active', 'trainee'].includes(member.status))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  const eligibleMemberIds = new Set(eligibleMembers.map((member) => member.id));
  const eligibleMemberKey = eligibleMembers.map((member) => member.id).join('|');
  const rankedEligibleMembers = rankMembersForSelection(eligibleMembers);
  const storedSingleCenterId = game.singleProduction?.centerMemberId ?? selectedMember;
  const center = eligibleMembers.find((member) => member.id === storedSingleCenterId) ?? rankedEligibleMembers[0];
  useEffect(() => {
    if (!center || game.singleProduction?.centerMemberId === center.id) return;
    setGame((current) => ({ ...current, singleProduction: { ...(current.singleProduction ?? {}), centerMemberId: center.id } }));
  }, [center?.id, game.singleProduction?.centerMemberId, setGame]);
  useEffect(() => {
    if (!center) { setMvLineupIds([]); return; }
    const candidates = rankMembersForSelection(eligibleMembers.filter((member) => member.id !== center.id));
    setMvLineupIds((current) => {
      const candidateIds = new Set(candidates.map((member) => member.id));
      const retainedIds = new Set();
      const next = Array.from({ length: 11 }, (_, index) => {
        const memberId = current[index] ?? '';
        if (!candidateIds.has(memberId) || retainedIds.has(memberId)) return '';
        retainedIds.add(memberId);
        return memberId;
      });
      candidates.forEach((member) => {
        if (retainedIds.has(member.id)) return;
        const emptyIndex = next.indexOf('');
        if (emptyIndex === -1) return;
        next[emptyIndex] = member.id;
        retainedIds.add(member.id);
      });
      return next;
    });
  }, [center?.id, eligibleMemberKey]);
  const selectMvPosition = (positionIndex, memberId) => {
    if (!center || !eligibleMemberIds.has(memberId)) return;
    const next = [center.id, ...Array.from({ length: 11 }, (_, index) => mvLineupIds[index] ?? '')];
    const occupiedIndex = next.indexOf(memberId);
    if (occupiedIndex >= 0) [next[positionIndex], next[occupiedIndex]] = [next[occupiedIndex], next[positionIndex]];
    else next[positionIndex] = memberId;
    setSelectedMember(next[0]);
    setGame((current) => ({ ...current, singleProduction: { ...(current.singleProduction ?? {}), centerMemberId: next[0] } }));
    setMvLineupIds(next.slice(1));
  };
  const mvMembers = [center, ...mvLineupIds.map((memberId) => eligibleMembers.find((member) => member.id === memberId))].filter(Boolean);
  const activeSingle = game.singles.find((single) => single.status !== 'released');
  const activeMajorCampaign = isMajorCampaignActive(game);
  const singleProjectBlocked = Boolean(activeSingle || activeMajorCampaign);
  const autoFillMv = () => {
    if (rankedEligibleMembers.length < 12 || singleProjectBlocked) return;
    const lineup = rankedEligibleMembers.slice(0, 12);
    setSelectedMember(lineup[0].id);
    setGame((current) => ({ ...current, singleProduction: { ...(current.singleProduction ?? {}), centerMemberId: lineup[0].id } }));
    setMvLineupIds(lineup.slice(1).map((member) => member.id));
  };
  useEffect(() => { if (!releaseOptions.some((option) => option.value === releaseTarget)) setReleaseTarget(releaseOptions[0]?.value ?? ''); }, [releaseOptions, releaseTarget]);
  useEffect(() => { if (!concertOptions.some((option) => option.value === concertTarget)) setConcertTarget(concertOptions[0]?.value ?? ''); }, [concertOptions, concertTarget]);
  const selectedConcert = concertOptions.find((option) => option.value === concertTarget);
  const selectedConcertBudget = CONCERT_BUDGETS.find((option) => option.id === concertBudgetId) ?? CONCERT_BUDGETS[0];
  const selectedSingleBudget = SINGLE_BUDGETS.find((option) => option.id === singleBudgetId);
  const selectedConcertVenue = concertVenues.find((option) => option.id === concertVenueId) ?? concertVenues[0] ?? CONCERT_VENUES[0];
  const runBonusValue = (id) => game.bonusLoadout?.includes(id) ? getBonusValueAtLevel(BONUS_BY_ID[id], game.bonusLevels?.[id] ?? 1) : 0;
  const singleProductionRate = 1 + runBonusValue('B005');
  const singleProductionCost = Math.round(selectedSingleBudget.cost * singleProductionRate);
  const concertCost = getConcertCostBreakdown(game, selectedConcertBudget, selectedConcertVenue);
  const concertProductionCost = concertCost.productionCost;
  const concertVenueCost = concertCost.venueCost;
  const concertUpfrontCost = concertCost.upfrontCost;
  const auditionCost = Math.round(65_000_000 * (1 + runBonusValue('B021')));
  const auditionPoolCount = game.unsignedMembers?.length ?? 0;
  const auditionCampaign = game.auditionCampaign;
  useEffect(() => { setAuditionSelection(auditionCampaign?.selectedCandidateIds ?? []); setInspectingCandidateId(null); setConfirmAuditionSelection(false); }, [auditionCampaign?.id, auditionCampaign?.selectedCandidateIds]);
  useEffect(() => { if (!concertVenues.some((option) => option.id === concertVenueId)) setConcertVenueId(concertVenues[0].id); }, [concertVenueId, concertVenues]);
  useEffect(() => { if (!CONCERT_BUDGETS.some((option) => option.id === concertBudgetId)) setConcertBudgetId(CONCERT_BUDGETS[0].id); }, [concertBudgetId]);
  const releasedSingles = [...game.singles].filter((single) => single.status === 'released').reverse();
  const productionStartsNow = selectedRelease?.absolute - 5 === absoluteWeek(game.year, game.week);
  const productionDayOccupied = productionStartsNow && mvMembers.some((member) => game.schedule[`${member.id}:${productionDay}`]);
  const singleConflictReasons = selectedRelease ? [...new Set(Array.from({ length: 4 }, (_, index) => selectedRelease.absolute - 5 + index).flatMap((targetAbsolute) => getCampaignConflictReasons(game, { year: Math.floor((targetAbsolute - 1) / BALANCE.weeksPerYear) + 1, week: ((targetAbsolute - 1) % BALANCE.weeksPerYear) + 1, type: 'mv', day: productionDay, memberIds: mvMembers.map((member) => member.id) })))] : [];
  const concertCampaignConflict = Boolean(activeSingle && selectedConcert && activeSingle.productionDay === concertDay && selectedConcert.absolute >= absoluteWeek(activeSingle.productionStartYear, activeSingle.productionStartWeek) && selectedConcert.absolute < absoluteWeek(activeSingle.productionStartYear, activeSingle.productionStartWeek) + activeSingle.durationWeeks);
  const concertThisQuarter = selectedConcert ? game.concerts.some((item) => item.targetYear === selectedConcert.year && concertQuarterForWeek(item.targetWeek ?? ((item.targetMonth ?? 1) * BALANCE.weeksPerMonth)) === concertQuarterForWeek(selectedConcert.targetWeek)) : false;
  const concertThisMonth = concertThisQuarter;
  const concertEligibleCount = selectedConcert
    ? game.members.filter((member) => memberCanPerformOnCampaignDate(game, member, 'concert', selectedConcert.year, selectedConcert.targetWeek)).length
    : 0;
  const concertConflictReasons = selectedConcert ? getCampaignConflictReasons(game, { year: selectedConcert.year, week: selectedConcert.targetWeek, type: 'concert', day: concertDay }) : [];
  const singleBlockReason = activeSingle
    ? 'A single project is already active.'
    : activeMajorCampaign ? 'Finish the current major campaign before producing a regular MV.'
    : !selectedRelease ? 'No eligible release window is available.'
    : game.money < singleProductionCost ? `Requires ${money(singleProductionCost)}; current funds: ${money(game.money)}.`
    : mvMembers.length !== 12 ? 'At least 12 eligible members are required; announced graduates are unavailable after their Last Show week.'
    : singleConflictReasons[0] ? singleConflictReasons[0]
    : productionDayOccupied ? 'Choose a free production day.' : '';
  const concertBlockReason = !selectedConcert
    ? 'No eligible concert window is available.'
    : game.money < concertUpfrontCost ? `Requires ${money(concertUpfrontCost)}; current funds: ${money(game.money)}.`
    : concertEligibleCount < BALANCE.theaterMinimumMembers ? `Concert requires ${BALANCE.theaterMinimumMembers} available members; ${concertEligibleCount} available.`
    : concertThisQuarter ? 'A concert is already booked in this quarter.'
    : selectedConcert && concertQuarterForWeek(selectedConcert.targetWeek) === 4 ? 'Q4 is reserved for the Anniversary Concert.'
    : concertConflictReasons[0] ? concertConflictReasons[0]
    : concertCampaignConflict ? 'The concert date conflicts with active MV production.' : '';
  const auditionBlockReason = game.week < BALANCE.auditionStartWeek
    ? `Auditions open from ${monthWeekLabel(BALANCE.auditionStartWeek)}.`
    : game.money < auditionCost ? `Requires ${money(auditionCost)}; current funds: ${money(game.money)}.`
    : game.auditions.some((audition) => audition.year === game.year) ? 'An audition has already been completed this year.'
    : auditionPoolCount < 12 ? `At least 12 unsigned candidates are required; ${auditionPoolCount} available.` : '';
  useEffect(() => {
    if (!confirmSingle && !confirmAudition && !confirmRenovation) return undefined;
    const close = (event) => { if (event.key === 'Escape') { setConfirmSingle(false); setConfirmAudition(false); setConfirmRenovation(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [confirmAudition, confirmRenovation, confirmSingle]);
  useEffect(() => {
    if (!confirmSingle) return undefined;
    const previouslyFocused = document.activeElement;
    productionCancelRef.current?.focus();
    const trapFocus = (event) => {
      if (event.key !== 'Tab' || !productionConfirmRef.current) return;
      const focusable = [...productionConfirmRef.current.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), summary, [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', trapFocus);
    return () => { window.removeEventListener('keydown', trapFocus); previouslyFocused?.focus?.(); };
  }, [confirmSingle]);
  // Facility choices are handled after tax in the mandatory year-end settlement.
  const renovationOffer = null;
  const renovatedThisYear = (game.renovations ?? []).some((item) => item.year === game.year);
  const createSingle = () => {
    setGame((current) => startSingleProduction(current, center.id, productionDay, mvMembers.map((member) => member.id), selectedRelease.year, selectedRelease.month, singleTitle, singleBudgetId));
    setConfirmSingle(false);
  };
  const holdConcert = () => setGame((current) => announceConcert(current, concertDay, selectedConcert.year, selectedConcert.month, concertTitle, selectedConcertBudget.id, selectedConcertVenue.id));
  return <div className="page campaigns-page">
    <section className="page-heading"><div><span className="eyebrow">Group projects</span><h1>Campaigns</h1><p>Commit budget, choose spotlight, and create fan-facing moments.</p></div></section>
    <MajorCampaignPanel game={game} setGame={setGame} language={language} />
    <CampaignParticipantDetails game={game} language={language} />
    <CampaignLaunchEditor game={game} setGame={setGame} language={language} />
    <JankenLuckNotice game={game} language={language} />
    <CampaignRewardStatus game={game} language={language} />
    <ConcertCostNotice game={game} budget={selectedConcertBudget} venue={selectedConcertVenue} language={language} />
    <CampaignBracketPreview game={game} language={language} />
    <FanEventCampaigns game={game} setGame={setGame} language={language} onTutorialAction={onTutorialAction} />
    <AnnualEvents game={game} setGame={setGame} language={language} />
    <section className="campaign-grid">
      <article className="campaign-feature"><div className="campaign-icon"><Disc3 size={26} /></div><span className="eyebrow">Release project</span><h2>Produce next single</h2><p>Choose a release month. Production begins five weeks before release and occupies four weekly schedule days.</p><label className="campaign-title-field">Single / MV title<input type="text" maxLength={60} value={singleTitle} onChange={(event) => setSingleTitle(event.target.value)} placeholder={`Single ${game.singles.length + 1}`} disabled={singleProjectBlocked} /></label><div className="concert-option-grid single-budget-grid"><label>Production budget<select value={singleBudgetId} onChange={(event) => setSingleBudgetId(event.target.value)} disabled={singleProjectBlocked}>{SINGLE_BUDGETS.map((option) => <option key={option.id} value={option.id}>{option.name} · {money(Math.round(option.cost * singleProductionRate))}</option>)}</select></label><div className="budget-impact"><span>Release impact</span><strong>Popularity +{selectedSingleBudget.popularityGain} · Fan trust {selectedSingleBudget.fanTrustGain >= 0 ? '+' : ''}{selectedSingleBudget.fanTrustGain}</strong></div></div>{center ? <div className="center-select"><Portrait member={center} size="small" /><label>Center<select value={center.id} onChange={(event) => selectMvPosition(0, event.target.value)} disabled={singleProjectBlocked}>{mvRosterMembers.map((member) => <option key={member.id} value={member.id} disabled={!eligibleMemberIds.has(member.id)}>{displayName(member)}</option>)}</select></label></div> : null}{activeSingle ? <><div className="production-progress"><div><strong>{activeSingle.title}</strong><span>{activeSingle.status === 'planned' ? 'Announced' : activeSingle.status === 'ready' ? 'Production complete' : `${activeSingle.progressWeeks}/${activeSingle.durationWeeks} weeks`}</span></div><progress aria-label={`${activeSingle.title} production progress`} max={activeSingle.durationWeeks} value={activeSingle.progressWeeks}>{Math.round(activeSingle.progressWeeks / activeSingle.durationWeeks * 100)}%</progress><small>Release: {calendarLabel(activeSingle.releaseYear, activeSingle.releaseWeek)} · {activeSingle.productionDay} production day</small></div><ParticipantDetails game={game} single={activeSingle} language={language} /></> : <><div className="mv-roster-select"><div className="mv-roster-heading"><div><strong>{t('MV members')}</strong><span>{t('Choose or swap the 11 positions beside the center. Unavailable members are disabled.')}</span></div><button type="button" className="secondary-button" onClick={autoFillMv} disabled={rankedEligibleMembers.length < 12 || singleProjectBlocked}>{t('Auto Fill')}</button></div><div>{Array.from({ length: 11 }, (_, index) => <label key={index}><span>{index + 2}</span><select aria-label={`${t('MV member')} ${index + 2}`} value={mvLineupIds[index] ?? ''} onChange={(event) => selectMvPosition(index + 1, event.target.value)} disabled={activeMajorCampaign}><option value="" disabled>{t('Choose member')}</option>{mvRosterMembers.map((member) => <option key={member.id} value={member.id} disabled={!eligibleMemberIds.has(member.id)}>{displayName(member)}</option>)}</select></label>)}</div></div><div className="campaign-date-grid"><label>Release month<select value={releaseTarget} onChange={(event) => setReleaseTarget(event.target.value)} disabled={activeMajorCampaign}>{releaseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Production day<select value={productionDay} onChange={(event) => setProductionDay(event.target.value)} disabled={activeMajorCampaign}>{DAYS.map((day) => <option key={day} value={day}>{day}</option>)}</select></label></div>{selectedRelease ? <div className="campaign-timeline"><span>Production starts</span><strong>{calendarLabel(Math.floor((selectedRelease.absolute - 6) / BALANCE.weeksPerYear) + 1, ((selectedRelease.absolute - 6) % BALANCE.weeksPerYear) + 1)}</strong><small>Four production weeks · release in Week 4</small></div> : null}<div className="mv-lineup-status"><strong>{mvMembers.length}/12 members ready</strong><span aria-live="polite">{activeMajorCampaign ? 'Finish the current major campaign before producing a regular MV.' : mvMembers.length < 12 ? 'At least 12 eligible members are required; announced graduates are unavailable after their Last Show week.' : productionDayOccupied ? 'Choose a free production day.' : `${displayName(center)} leads the selected 12-member lineup.`}</span></div></>}{singleBlockReason ? <p className="campaign-block-reason" role="status">{t(singleBlockReason)}</p> : null}<div className="campaign-action"><span><strong>{money(singleProductionCost)}</strong><small>Production + promotion</small></span><button type="button" onClick={() => setConfirmSingle(true)} disabled={Boolean(singleBlockReason)}>{activeSingle ? activeSingle.campaignId ? 'Campaign MV in production' : 'Single scheduled' : activeMajorCampaign ? 'Major campaign in progress' : 'Review production'}</button></div></article>
      <article className="campaign-feature"><div className="campaign-icon"><Ticket size={26} /></div><span className="eyebrow">Live opportunity</span><h2>Book concert offer</h2><p>Choose a concert month. Ticket sales run from announcement through two weeks before the show.</p><label className="campaign-title-field">Concert title<input type="text" maxLength={60} value={concertTitle} onChange={(event) => setConcertTitle(event.target.value)} placeholder={`Concert ${game.concerts.length + 1}`} /></label><div className="concert-option-grid"><label>Production budget<select value={concertBudgetId} onChange={(event) => setConcertBudgetId(event.target.value)}>{CONCERT_BUDGETS.map((option) => <option key={option.id} value={option.id}>{concertBudgetOptionLabel(game, option, selectedConcertVenue)}</option>)}</select></label><label>Venue size<select value={concertVenueId} onChange={(event) => setConcertVenueId(event.target.value)}>{concertVenues.map((option) => <option key={option.id} value={option.id}>{concertVenueOptionLabel(game, option, selectedConcertBudget)}</option>)}</select></label></div><div className="venue-preview"><strong>{number.format(selectedConcertVenue.capacity)}</strong><span>selected venue seats</span><small>{concertThisMonth ? 'A concert is already booked in this quarter.' : 'Concert is held in Week 4.'}</small></div><div className="campaign-date-grid"><label>Concert month<select value={concertTarget} onChange={(event) => setConcertTarget(event.target.value)}>{concertOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Concert day<select value={concertDay} onChange={(event) => setConcertDay(event.target.value)}>{DAYS.map((day) => <option key={day} value={day}>{day}</option>)}</select></label></div>{selectedConcert ? <div className="campaign-timeline"><span>Ticket sales</span><strong>Now → {calendarLabel(Math.floor((selectedConcert.absolute - 3) / BALANCE.weeksPerYear) + 1, ((selectedConcert.absolute - 3) % BALANCE.weeksPerYear) + 1)}</strong><small>Sales close D-2 weeks · concert in Week 4</small></div> : null}{concertBlockReason ? <p className="campaign-block-reason" role="status">{t(concertBlockReason)}</p> : null}<div className="campaign-action"><span><strong>{money(concertUpfrontCost)}</strong><small>Production + venue</small></span><button type="button" onClick={holdConcert} disabled={Boolean(concertBlockReason)}>{concertThisMonth ? 'Month already booked' : concertCampaignConflict ? 'Campaign date conflict' : 'Announce concert'}</button></div></article>
      <article className="campaign-feature audition"><div className="campaign-icon"><UserRoundSearch size={26} /></div><span className="eyebrow">Q4 · Oct Week 1+</span><h2>Open audition</h2><p>The system chooses 12 candidates over five weeks. Review every exact stat, then confirm up to six recruits.</p>{auditionCampaign ? <><div className="audition-progress"><div><strong>{auditionCampaign.phase}</strong><span>Week {Math.min(auditionCampaign.progressWeeks + 1, auditionCampaign.durationWeeks)} of {auditionCampaign.durationWeeks}</span></div><progress max={auditionCampaign.durationWeeks} value={auditionCampaign.progressWeeks}>{auditionCampaign.progressWeeks / auditionCampaign.durationWeeks * 100}%</progress><small>{auditionCampaign.candidatePool.length} candidates · up to {auditionCampaign.maxIntake} trainees</small></div>{auditionCampaign.progressWeeks >= 4 ? <div className="audition-candidates"><div><strong>Select roster recruits</strong><span>{auditionSelection.length}/{auditionCampaign.maxIntake} selected</span></div>{auditionCampaign.candidatePool.map((candidate) => { const selected = auditionSelection.includes(candidate.id); const locked = Boolean(auditionCampaign.selectionConfirmed); const toggle = () => setAuditionSelection((current) => selected ? current.filter((id) => id !== candidate.id) : [...current, candidate.id]); return <div key={candidate.id} className={selected ? 'audition-candidate-row selected' : 'audition-candidate-row'}><label><input type="checkbox" checked={selected} disabled={locked || (!selected && auditionSelection.length >= auditionCampaign.maxIntake)} onChange={toggle} /><span><strong>{candidate.nickname || candidate.name}</strong><small>{candidate.archetype} · Potential {candidate.potential} · Development {candidate.development}</small></span></label><button type="button" className="candidate-details-button" onClick={() => setInspectingCandidateId(candidate.id)}>View details</button></div>; })}<button type="button" disabled={auditionCampaign.selectionConfirmed} onClick={() => setConfirmAuditionSelection(true)}>{auditionCampaign.selectionConfirmed ? 'Recruit selection confirmed' : `Review ${auditionSelection.length} recruit${auditionSelection.length === 1 ? '' : 's'}`}</button></div> : null}</> : <><div className="audition-state"><strong>{game.week >= BALANCE.auditionStartWeek ? 'Window open' : `${BALANCE.auditionStartWeek - game.week} weeks until window`}</strong><span>{game.auditions.some((a) => a.year === game.year) ? 'Audition completed this year' : auditionPoolCount >= 12 ? `${auditionPoolCount} pool members available` : auditionPoolCount ? `Need 12 pool members · ${auditionPoolCount} available` : 'Talent pool empty'}</span></div>{auditionBlockReason ? <p className="campaign-block-reason" role="status">{t(auditionBlockReason)}</p> : null}<div className="campaign-action"><span><strong>{money(auditionCost)}</strong><small>12 candidates · up to 6 recruits</small></span><button type="button" onClick={() => setConfirmAudition(true)} disabled={Boolean(auditionBlockReason)}>Review audition</button></div></>}</article>
      {game.week === BALANCE.weeksPerYear && renovationOffer ? <article className="campaign-feature renovation"><div className="campaign-icon"><Wrench size={26} /></div><span className="eyebrow">Year-end facility decision</span><h2>Renovate {game.theater.name}</h2><p>Improve fan-facing facilities and permanently raise ticket value. Larger operation increases weekly fixed costs.</p><div className="renovation-comparison"><div><span>Ticket price</span><strong>{money(renovationOffer.currentTicketPrice)} <ChevronRight size={14} /> {money(renovationOffer.ticketPrice)}</strong></div><div><span>Weekly upkeep</span><strong>{money(renovationOffer.currentWeeklyUpkeep)} <ChevronRight size={14} /> {money(renovationOffer.weeklyUpkeep)}</strong></div><div><span>Renovation level</span><strong>{game.theater.renovationLevel ?? 0} <ChevronRight size={14} /> {renovationOffer.level}</strong></div></div><div className="campaign-action"><span><strong>{money(renovationOffer.cost)}</strong><small>One-time renovation cost</small></span><button type="button" onClick={() => setConfirmRenovation(true)} disabled={renovatedThisYear || game.money < renovationOffer.cost}>{renovatedThisYear ? 'Completed' : 'Review renovation'}</button></div></article> : null}
    </section>
    {releasedSingles.length ? <section className="single-performance-list"><div><span className="eyebrow">Release performance</span><h2>Single views</h2></div>{releasedSingles.map((single) => <article key={single.id}><div><strong>{single.title}</strong><span>{single.releasedYear ? calendarLabel(single.releasedYear, single.releasedWeek) : 'Released'}</span></div><div><span>Total views</span><strong>{number.format(single.views ?? 0)}</strong></div><div><span>Latest weekly gain</span><strong>+{number.format(single.weeklyViewGain ?? 0)}</strong></div><small>View week {single.viewWeeks ?? 0}</small><ParticipantDetails game={game} single={single} language={language} /></article>)}</section> : null}
    {confirmSingle && selectedRelease ? <ModalPortal><div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmSingle(false); }}><section ref={productionConfirmRef} className="confirm-week-modal production-confirm" role="dialog" aria-modal="true" aria-labelledby="production-confirm-title"><div className="confirm-week-icon"><Disc3 size={24} /></div><h2 id="production-confirm-title">Confirm single release</h2><p>Spend {money(singleProductionCost)} now with the {selectedSingleBudget.name.toLowerCase()}. Production starts five weeks before {selectedRelease.label}, uses every {productionDay} for four weeks, then releases in Week 4.</p><div className="production-confirm-facts"><span><strong>12</strong> members</span><span><strong>+{selectedSingleBudget.popularityGain}</strong> popularity</span><span><strong>{selectedSingleBudget.fanTrustGain >= 0 ? '+' : ''}{selectedSingleBudget.fanTrustGain}</strong> fan trust</span><span><strong>{productionDay}</strong> production</span><span><strong>{MONTHS[selectedRelease.month - 1]}</strong> release</span></div><ParticipantDetails game={game} members={mvMembers} centerId={center?.id} language={language} defaultOpen /><div className="confirm-week-actions"><button ref={productionCancelRef} className="secondary-button" type="button" onClick={() => setConfirmSingle(false)}>{t('Cancel')}</button><button className="setup-primary" type="button" onClick={createSingle}>Confirm release plan <ChevronRight size={18} /></button></div></section></div></ModalPortal> : null}
    {confirmAudition ? <ConfirmationModal title="Confirm audition" description={`Spend ${money(auditionCost)} for a five-week audition. The system will choose 12 candidates and you may recruit up to six.`} confirmLabel="Begin audition" onCancel={() => setConfirmAudition(false)} onConfirm={() => { setGame((current) => startAuditionCampaign(current, current.week)); setConfirmAudition(false); }} icon={<UserRoundSearch size={24} />} /> : null}
    {confirmAuditionSelection ? <ConfirmationModal title="Confirm audition recruits" description={auditionSelection.length ? `${auditionSelection.length} selected candidate${auditionSelection.length === 1 ? '' : 's'} will join as trainees when the audition resolves. This selection cannot be edited afterward.` : 'No candidate will join the roster. Confirming an empty selection completes the audition without recruits.'} confirmLabel={auditionSelection.length ? `Confirm ${auditionSelection.length} recruits` : 'Confirm no recruits'} onCancel={() => setConfirmAuditionSelection(false)} onConfirm={() => { setGame((current) => finalizeAudition(current, auditionSelection)); setConfirmAuditionSelection(false); }} icon={<Check size={24} />} /> : null}
    {inspectingCandidateId && auditionCampaign ? <CandidateStatModal candidate={auditionCampaign.candidatePool.find((candidate) => candidate.id === inspectingCandidateId)} selected={auditionSelection.includes(inspectingCandidateId)} atLimit={auditionSelection.length >= auditionCampaign.maxIntake} selectionLocked={Boolean(auditionCampaign.selectionConfirmed)} onToggle={() => setAuditionSelection((current) => current.includes(inspectingCandidateId) ? current.filter((id) => id !== inspectingCandidateId) : [...current, inspectingCandidateId])} onClose={() => setInspectingCandidateId(null)} /> : null}
    {confirmRenovation && renovationOffer ? <ModalPortal><div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmRenovation(false); }}><section className="confirm-week-modal" role="dialog" aria-modal="true" aria-labelledby="renovation-confirm-title"><div className="confirm-week-icon"><Wrench size={24} /></div><h2 id="renovation-confirm-title">Confirm theater renovation</h2><p>Spend {money(renovationOffer.cost)} now. Ticket price becomes {money(renovationOffer.ticketPrice)} and weekly upkeep becomes {money(renovationOffer.weeklyUpkeep)} permanently.</p><div className="confirm-week-actions"><button className="secondary-button" type="button" onClick={() => setConfirmRenovation(false)}>Cancel</button><button className="setup-primary" type="button" onClick={() => { setConfirmRenovation(false); onRenovate(); }}>Confirm renovation <ChevronRight size={18} /></button></div></section></div></ModalPortal> : null}
  </div>;
}

function localizedInjuryEventCopy(event, language) {
  if (!['injury', 'injuryRecovery'].includes(event.type)) return null;
  const t = (value) => translate(language, value);
  const memberName = event.memberName ?? t('Former member');
  const severity = t(event.label ?? event.severity ?? 'Injury').toLowerCase();
  const weeks = `${event.originalWeeks ?? 1} ${t((event.originalWeeks ?? 1) === 1 ? 'week' : 'weeks')}`;
  if (event.type === 'injuryRecovery') return language === 'id'
    ? { title: `${memberName} pulih dari cedera`, detail: `Cedera ${severity} pulih setelah ${weeks}.` }
    : { title: `${memberName} recovers from injury`, detail: `${severity[0].toUpperCase()}${severity.slice(1)} injury cleared after ${weeks}.` };
  const workload = event.workload ?? t('Not recorded');
  const activities = (event.assignments ?? []).map((assignment) => `${assignment.day ? t(assignment.day) : t('Unknown day')} — ${t(BALANCE.activities[assignment.activityId]?.label ?? assignment.activityId)}`);
  if (language === 'id') return { title: `${memberName} mengalami cedera ${severity}`, detail: `Cedera ${severity} setelah beban kerja ${workload}. Perkiraan pemulihan: ${weeks}.${activities.length ? ` Aktivitas: ${activities.join('; ')}.` : ''}` };
  return { title: `${memberName} suffers a ${severity} injury`, detail: `${severity[0].toUpperCase()}${severity.slice(1)} injury after workload ${workload}. Estimated recovery: ${weeks}.${activities.length ? ` Activities: ${activities.join('; ')}.` : ''}` };
}

function HistoryView({ game, language = 'en' }) {
  const t = (value) => translate(language, value);
  const reviews = [...(game.annualReviews ?? [])].reverse();
  const buildHistoryEntries = (events, status) =>
    events.reduce((groups, event) => {
      const year = event.year;
      const week = event.week ?? event.targetWeek;
      const key = event.eventId ?? (status === 'scheduled' ? event.id : null) ?? `${year}-${week}-${event.type}`;
      const group = groups.get(key) ?? {
        ...event,
        id: `history-${key}`,
        memberIds: [],
        type: event.type,
        title: event.title ?? (event.type === 'videoCall' ? 'Video Call' : 'Meet & Greet'),
        customTitle: Boolean(event.customTitle),
        eventStatus: status,
        year,
        week,
      };
      if (event.memberId) group.memberIds.push(event.memberId);
      if (event.memberIds) group.memberIds.push(...event.memberIds);
      groups.set(key, group);
      return groups;
    }, new Map());
  const completedMap = buildHistoryEntries(
    (game.activityEvents ?? []).filter((e) => e.type === 'videoCall' || e.type === 'meetGreet'),
    'completed',
  );
  const plannedMap = buildHistoryEntries(
    (game.fanEventPlans ?? []).filter((e) => e.type === 'videoCall' || e.type === 'meetGreet'),
    'scheduled',
  );
  const combinedMap = new Map([...completedMap, ...plannedMap]);
  const fanEventHistory = [...combinedMap.values()].map((event) => {
    const report = (game.weeklyReports ?? []).find((item) => item.year === event.year && item.week === event.week);
    const scheduleEntries = Object.entries(report?.schedule ?? {}).filter(([, activityId]) => (event.type === 'videoCall' ? activityId === 'vc1' : activityId === 'mg1'));
    const memberIdsFromSchedule = scheduleEntries.map(([key]) => key.slice(0, key.lastIndexOf(':')));
    const memberIds = [...new Set([...event.memberIds, ...memberIdsFromSchedule])];
    let detail;
    if (scheduleEntries.length) {
      const daysMap = new Map();
      scheduleEntries.forEach(([key]) => {
        const [memberId, day] = key.split(':');
        if (!daysMap.has(day)) daysMap.set(day, []);
        daysMap.get(day).push(memberId);
      });
      const parts = [];
      for (const [day, ids] of daysMap) {
        const names = ids.map((id) => {
          const member = game.members.find((item) => item.id === id);
          return member ? displayName(member) : t('Former member');
        });
        parts.push(`${t(day)}: ${names.join(', ')}`);
      }
      detail = parts.join('; ');
    } else if (memberIds.length) {
      const names = memberIds.map((id) => {
        const member = game.members.find((item) => item.id === id);
        return member ? displayName(member) : t('Former member');
      });
      detail = `Members: ${names.join(', ')}.`;
    } else {
      detail = `Group fan event ${event.eventStatus}.`;
    }
    return { ...event, detail };
  });
  const historyEvents = [...game.history, ...fanEventHistory].sort((a, b) => absoluteWeek(b.year, b.week) - absoluteWeek(a.year, a.week));
  const formatEventDetail = (event) => formatHistoryEventDetail(event.detail, event.year, calendarLabel);
  return (<div className="page history-page"><section className="page-heading"><div><span className="eyebrow">{t('Alternate timeline')}</span><h1>{t('Club history')}</h1><p>{t('Major decisions, breakthroughs, disruptions, and generations remain in this run.')}</p></div></section>{reviews.length ? (<section className="annual-review-list"><div><span className="eyebrow">{t('Season archive')}</span><h2>{t('Annual reviews')}</h2></div>{reviews.map((review) => (<article key={review.year}><header><span>{t(`Year ${review.year}`)}</span><strong>{review.overallGrade}</strong></header><div>{review.categories.map((category) => (<span key={category.id}><small>{t(category.label)}</small><b>{category.grade}</b></span>))}</div><footer>{review.snapshot.fanGrowth ? (<><span>{t('Fan target grade')} <strong>{t(review.snapshot.fanGrowth.label)}</strong></span><span>{t('Starting fans')} <strong>{number.format(review.snapshot.fanGrowth.startingFans)}</strong></span><span>{t('Target fans')} <strong>{number.format(review.snapshot.fanGrowth.targetFans)}</strong></span><span>{t('Actual fans')} <strong>{number.format(review.snapshot.fanGrowth.actualFans)}</strong></span><span>{t('Achievement')} <strong>{review.snapshot.fanGrowth.achievementPercent}%</strong></span></>) : (<span>{t('Fanbase')} <strong>{number.format(review.snapshot.fanbase)}</strong></span>)}<span>{t('Net cash')} <strong>{money(review.snapshot.netCash)}</strong></span><span>{t('Roster')} <strong>{review.snapshot.roster}</strong></span></footer></article>))}</section>) : null}<section className="timeline">{historyEvents.map((event) => {const injuryCopy = localizedInjuryEventCopy(event, language);return (<article key={event.id}><div className={`timeline-mark ${event.type}`} />{' '}<div className="timeline-time"><strong>{t(`Year ${event.year}`)}</strong><span>{t(`${calendarParts(event.week).month} · Week ${calendarParts(event.week).weekOfMonth}`)}</span></div><div><span>{t(event.type)}</span><h2 {...(event.customTitle ? { 'data-i18n-ignore': 'true' } : {})}>{injuryCopy?.title ?? (event.customTitle ? event.title : t(language === 'id' && event.titleId ? event.titleId : event.title))}</h2><p>{injuryCopy?.detail ?? t(language === 'id' && event.detailId ? event.detailId : formatEventDetail(event))}</p></div></article>);})}</section></div>);
}

function ScheduleTemplates({ game, setGame, language = 'en' }) {
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const templates = game.scheduleTemplates ?? [];
  const unavailableCount = pendingTemplate?.entries?.filter((entry) => {
    const member = game.members.find((item) => item.id === entry.memberId);
    return !member || !['active', 'trainee'].includes(member.status) || (member.suspensionWeeks ?? 0) > 0 || AUTOMATIC_ACTIVITY_LOCKS.includes(game.schedule[`${entry.memberId}:${entry.day}`]);
  }).length ?? 0;
  const applyTemplate = () => {
    setGame((current) => applyScheduleTemplate(current, pendingTemplate));
    setPendingTemplate(null);
  };
  const removeTemplate = (template) => {
    setGame((current) => ({ ...current, scheduleTemplates: (current.scheduleTemplates ?? []).filter((item) => item.id !== template.id) }));
    setPendingDelete(null);
  };
  return <div className="page templates-page"><section className="page-heading"><div><span className="eyebrow">Reusable planning</span><h1>Weekly templates</h1><p>Apply saved member, day, and activity assignments to the current week.</p></div></section>{templates.length ? <section className="template-list">{templates.map((template) => <article key={template.id}><div><span>Year {template.createdYear} · Week {template.createdWeek}</span><h2>{template.name}</h2><p>{template.entries.length} saved assignments</p></div><div className="template-actions"><button type="button" onClick={() => setPendingTemplate(template)}><Check size={17} /> Apply template</button><IconButton label={`Delete ${template.name}`} onClick={() => setPendingDelete(template)}><Trash2 size={17} /></IconButton></div></article>)}</section> : <section className="template-empty"><Archive size={28} /><strong>No weekly templates</strong><span>Build a schedule, then use Save as template from Schedule.</span></section>}{pendingTemplate ? <ModalPortal><div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingTemplate(null); }}><section className="confirm-week-modal" role="dialog" aria-modal="true" aria-labelledby="apply-template-title"><div className="confirm-week-icon"><Archive size={24} /></div><h2 id="apply-template-title">Apply {pendingTemplate.name}?</h2><p>Available members will be assigned now. Existing unlocked assignments may be replaced.</p>{unavailableCount ? <div className="template-warning"><ShieldAlert size={18} /><span>{unavailableCount} assignment(s) are unavailable and will be skipped.</span></div> : null}<div className="confirm-week-actions"><button type="button" className="secondary-button" onClick={() => setPendingTemplate(null)}>Cancel</button><button type="button" className="setup-primary" onClick={applyTemplate}>Confirm assignments <ChevronRight size={18} /></button></div></section></div></ModalPortal> : null}{pendingDelete ? <ConfirmationModal title={`Delete ${pendingDelete.name}?`} description="This schedule template will be removed permanently. The current weekly schedule is not changed." confirmLabel="Delete template" destructive onCancel={() => setPendingDelete(null)} onConfirm={() => removeTemplate(pendingDelete)} icon={<Trash2 size={24} />} /> : null}</div>;
}

function FinanceDashboard({ game }) {
  const [period, setPeriod] = useState('month');
  const reports = game.weeklyReports ?? [];
  const currentMonth = Math.ceil(game.week / BALANCE.weeksPerMonth);
  const filtered = reports.filter((report) => period === 'all' || (report.year === game.year && (period === 'year' || Math.ceil(report.week / BALANCE.weeksPerMonth) === currentMonth)));
  const financialEvents = (game.financialEvents ?? []).filter((event) => period === 'all' || (event.year === game.year && (period === 'year' || Math.ceil(event.week / BALANCE.weeksPerMonth) === currentMonth)));
  const totals = sumReports(filtered, financialEvents);
  const incomeRows = [['Theater', totals.finances.theater], ['Video Call', totals.finances.videoCall], ['Meet & Greet', totals.finances.meetGreet], ['2Shot', totals.finances.twoShot], ['Media', totals.finances.media], ['Off-air', totals.finances.offAir], ['Live Stream', totals.finances.liveStream], ['Concert', totals.finances.concert], ['Annual campaigns', totals.finances.campaign], ['Opportunities', totals.finances.opportunity], ['Other', totals.finances.otherIncome]];
  const expenseRows = [['Activities', totals.finances.activityCosts], ['Refunds', totals.finances.refunds], ['Salary', totals.finances.salary], ['Debt payments', totals.finances.debtPayments + totals.finances.loanPayment], ['Opportunity costs', totals.finances.opportunityCosts], ['Operations', totals.finances.generalOperations], ['Theater upkeep', totals.finances.theaterUpkeep]];
  const largestCategory = Math.max(1, ...incomeRows.map(([, value]) => value), ...expenseRows.map(([, value]) => value));
  const trend = filtered.slice(-12);
  const largestTrend = Math.max(1, ...trend.map((report) => Math.abs(report.moneyDelta)));
  const averageNet = filtered.length ? Math.round(totals.moneyDelta / filtered.length) : 0;
  return <div className="page finance-page">
    <section className="page-heading"><div><span className="eyebrow">Financial analysis</span><h1>Finance dashboard</h1><p>Compare income, operating expenses, and weekly cash movement from resolved reports.</p></div><div className="finance-period" aria-label="Financial period">{[['month', 'This month'], ['year', 'This year'], ['all', 'All time']].map(([value, label]) => <button type="button" key={value} className={period === value ? 'active' : ''} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}</div></section>
    <section className="finance-kpis"><div><span>Total income</span><strong className="positive">{money(totals.finances.totalIncome)}</strong></div><div><span>Total expenses</span><strong className="negative">{money(totals.finances.totalExpenses)}</strong></div><div><span>Net cash</span><strong className={totals.moneyDelta >= 0 ? 'positive' : 'negative'}>{totals.moneyDelta >= 0 ? '+' : ''}{money(totals.moneyDelta)}</strong></div><div><span>Average weekly net</span><strong>{averageNet >= 0 ? '+' : ''}{money(averageNet)}</strong></div></section>
    {filtered.length ? <section className="finance-analysis-grid"><article className="finance-analysis"><h2>Income sources</h2><div className="finance-bars">{incomeRows.map(([label, value]) => <div key={label}><span>{label}</span><div><i className="income-bar" style={{ width: `${value / largestCategory * 100}%` }} /></div><strong>{money(value)}</strong></div>)}</div></article><article className="finance-analysis"><h2>Expense categories</h2><div className="finance-bars">{expenseRows.map(([label, value]) => <div key={label}><span>{label}</span><div><i className="expense-bar" style={{ width: `${value / largestCategory * 100}%` }} /></div><strong>{money(value)}</strong></div>)}</div></article><article className="finance-analysis finance-trend"><h2>Weekly net trend</h2><div className="trend-chart">{trend.map((report) => <div key={`${report.year}-${report.week}`}><span>{report.moneyDelta >= 0 ? money(report.moneyDelta) : `-${money(Math.abs(report.moneyDelta))}`}</span><i className={report.moneyDelta >= 0 ? 'positive-bar' : 'negative-bar'} style={{ height: `${Math.max(8, Math.abs(report.moneyDelta) / largestTrend * 100)}%` }} /><small>{calendarParts(report.week).month} W{calendarParts(report.week).weekOfMonth}</small></div>)}</div></article></section> : <section className="finance-empty"><CircleDollarSign size={28} /><strong>No financial reports in this period</strong><span>Resolve a week to record income and expenses.</span></section>}
  </div>;
}

function StatisticsDashboard({ game, language = 'en' }) {
  const text = (english, indonesian) => language === 'id' ? indonesian : english;
  const [period, setPeriod] = useState('month');
  const [reportDate, setReportDate] = useState(null);
  const currentMonth = Math.ceil(game.week / BALANCE.weeksPerMonth);
  const currentWeek = calendarParts(game.week).weekOfMonth;
  const selectedYear = reportDate?.year ?? game.year;
  const monthCount = selectedYear === game.year ? currentMonth : MONTHS.length;
  const selectedMonth = Math.min(reportDate?.month ?? currentMonth, monthCount);
  const weekCountInMonth = selectedYear === game.year && selectedMonth === currentMonth ? currentWeek : BALANCE.weeksPerMonth;
  const selectedWeek = Math.min(reportDate?.week ?? currentWeek, weekCountInMonth);
  const selectReportDate = (changes) => setReportDate({ year: selectedYear, month: selectedMonth, week: selectedWeek, ...changes });
  const reportYears = getFinancialReportYears(game);
  const { reports: filtered, financialEvents, trend: periodTrend, weekCount, hasData } = getFinancialPeriodData(game, { period, year: selectedYear, month: selectedMonth, week: selectedWeek });
  const totals = sumReports(filtered, financialEvents);
  const firstSnapshot = filtered.find((report) => report.statistics?.before)?.statistics.before;
  const lastSnapshot = [...filtered].reverse().find((report) => report.statistics?.after)?.statistics.after;
  const isCurrentPeriod = period === 'all' || (selectedYear === game.year && (period === 'year' || (selectedMonth === currentMonth && (period === 'month' || selectedWeek === currentWeek))));
  const currentSnapshot = lastSnapshot ?? (isCurrentPeriod ? game.group : null);
  const periodDelta = (key) => firstSnapshot && currentSnapshot ? currentSnapshot[key] - firstSnapshot[key] : (key === 'fanbase' && filtered.length ? totals.fanGain : null);
  const formatDelta = (key) => {
    const delta = periodDelta(key);
    if (delta === null) return text('No period baseline', 'Tidak ada data awal periode');
    return `${delta >= 0 ? '+' : ''}${number.format(delta)} ${text('this period', 'periode ini')}`;
  };
  const snapshotValue = (key, rating = false) => currentSnapshot?.[key] == null ? '—' : rating ? `${currentSnapshot[key]}/100` : number.format(currentSnapshot[key]);
  const selectedWeekNumber = (selectedMonth - 1) * BALANCE.weeksPerMonth + selectedWeek;
  const selectedPeriodLabel = period === 'all' ? text('All time', 'Sepanjang waktu')
    : period === 'year' ? `${text('Year', 'Tahun')} ${selectedYear}`
      : period === 'month' ? `${text('Year', 'Tahun')} ${selectedYear} · ${translate(language, MONTHS[selectedMonth - 1])}`
        : translate(language, calendarLabel(selectedYear, selectedWeekNumber));
  const incomeRows = [[text('Theater', 'Teater'), totals.finances.theater], [text('Video Call', 'Panggilan Video'), totals.finances.videoCall], [text('Meet & Greet', 'Meet & Greet'), totals.finances.meetGreet], [text('2Shot', '2Shot'), totals.finances.twoShot], [text('Media', 'Media'), totals.finances.media], [text('Off-air', 'Off-air'), totals.finances.offAir], [text('Live Stream', 'Live Stream'), totals.finances.liveStream], [text('Concert', 'Konser'), totals.finances.concert], [text('Annual campaigns', 'Kampanye tahunan'), totals.finances.campaign], [text('Opportunities', 'Peluang manajemen'), totals.finances.opportunity], [text('Other', 'Pendapatan lain'), totals.finances.otherIncome]];
  const expenseRows = [[text('Activities', 'Aktivitas'), totals.finances.activityCosts], [text('Refunds', 'Pengembalian dana'), totals.finances.refunds], [text('Salary', 'Gaji'), totals.finances.salary], [text('Debt payments', 'Pembayaran utang'), totals.finances.debtPayments + totals.finances.loanPayment], [text('Opportunity costs', 'Biaya peluang'), totals.finances.opportunityCosts], [text('Operations', 'Operasional'), totals.finances.generalOperations], [text('Theater upkeep', 'Biaya teater'), totals.finances.theaterUpkeep]];
  const largestCategory = Math.max(1, ...incomeRows.map(([, value]) => value), ...expenseRows.map(([, value]) => value));
  const trend = periodTrend.slice(-12);
  const largestTrend = Math.max(1, ...trend.map((report) => Math.abs(report.moneyDelta)));
  const averageNet = weekCount ? Math.round(totals.moneyDelta / weekCount) : 0;
  const roster = {
    total: game.members.length,
    active: game.members.filter((member) => member.status === 'active').length,
    trainees: game.members.filter((member) => member.status === 'trainee').length,
    graduated: (game.graduations ?? []).filter((graduation) => graduation.completed).length,
    drama: game.records?.dramaSuspensions ?? 0,
  };
  return <div className="page finance-page statistics-page">
    <section className="page-heading"><div><h1>Statistics</h1><p>Track audience health, roster development, income, expenses, and weekly cash movement.</p></div><div className="statistics-period-controls">
      <div className="finance-period" role="group" aria-label={text('Statistics period', 'Periode statistik')}>{[['week', text('Week', 'Minggu')], ['month', text('Month', 'Bulan')], ['year', text('Year', 'Tahun')], ['all', text('All time', 'Sepanjang waktu')]].map(([value, label]) => <button type="button" key={value} className={period === value ? 'active' : ''} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}</div>
      {period !== 'all' ? <div className="statistics-date-controls">
        <label><span>{text('Report year', 'Tahun laporan')}</span><select value={selectedYear} onChange={(event) => selectReportDate({ year: Number(event.target.value) })}>{reportYears.map((year) => <option key={year} value={year}>{text('Year', 'Tahun')} {year}</option>)}</select></label>
        {period !== 'year' ? <label><span>{text('Report month', 'Bulan laporan')}</span><select value={selectedMonth} onChange={(event) => selectReportDate({ month: Number(event.target.value) })}>{MONTHS.slice(0, monthCount).map((month, index) => <option key={month} value={index + 1}>{translate(language, month)}</option>)}</select></label> : null}
        {period === 'week' ? <label><span>{text('Report week', 'Minggu laporan')}</span><select value={selectedWeek} onChange={(event) => selectReportDate({ week: Number(event.target.value) })}>{Array.from({ length: weekCountInMonth }, (_, index) => <option key={index + 1} value={index + 1}>{text('Week', 'Minggu')} {index + 1}</option>)}</select></label> : null}
        {reportDate ? <button type="button" className="secondary-button" onClick={() => setReportDate(null)}>{text('Current period', 'Periode saat ini')}</button> : null}
      </div> : null}
    </div></section>
    <p className="statistics-period-caption" aria-live="polite">{selectedPeriodLabel}</p>
    <section className="statistics-kpis" aria-label="Audience statistics"><div><span>Fans</span><strong>{snapshotValue('fanbase')}</strong><small>{formatDelta('fanbase')}</small></div><div><span>Popularity</span><strong>{snapshotValue('popularity', true)}</strong><small>{formatDelta('popularity')}</small></div><div><span>Fan Trust</span><strong>{snapshotValue('fanTrust', true)}</strong><small>{formatDelta('fanTrust')}</small></div><div><span>Reputation</span><strong>{snapshotValue('reputation', true)}</strong><small>{formatDelta('reputation')}</small></div></section>
    <h2 className="statistics-roster-heading">{text('Current roster', 'Roster saat ini')}</h2>
    <section className="statistics-roster" aria-label={text('Current roster statistics', 'Statistik roster saat ini')}><div><span>Total members</span><strong>{roster.total}</strong></div><div><span>Active</span><strong>{roster.active}</strong></div><div><span>Trainees</span><strong>{roster.trainees}</strong></div><div><span>Graduated</span><strong>{roster.graduated}</strong></div><div><span>Drama incidents</span><strong>{roster.drama}</strong></div></section>
    <section className="finance-kpis"><div><span>Total income</span><strong className="positive">{money(totals.finances.totalIncome)}</strong></div><div><span>Total expenses</span><strong className="negative">{money(totals.finances.totalExpenses)}</strong></div><div><span>Net cash</span><strong className={totals.moneyDelta >= 0 ? 'positive' : 'negative'}>{totals.moneyDelta >= 0 ? '+' : ''}{money(totals.moneyDelta)}</strong></div><div><span>Average weekly net</span><strong>{averageNet >= 0 ? '+' : ''}{money(averageNet)}</strong></div></section>
    {hasData ? <section className="finance-analysis-grid"><article className="finance-analysis"><h2>Income sources</h2><div className="finance-bars">{incomeRows.map(([label, value]) => <div key={label}><span>{label}</span><div><i className="income-bar" style={{ width: `${value / largestCategory * 100}%` }} /></div><strong>{money(value)}</strong></div>)}</div></article><article className="finance-analysis"><h2>Expense categories</h2><div className="finance-bars">{expenseRows.map(([label, value]) => <div key={label}><span>{label}</span><div><i className="expense-bar" style={{ width: `${value / largestCategory * 100}%` }} /></div><strong>{money(value)}</strong></div>)}</div></article><article className="finance-analysis finance-trend"><h2>Weekly net trend</h2><div className="trend-chart">{trend.map((report) => <div key={`${report.year}-${report.week}`}><span>{report.moneyDelta >= 0 ? money(report.moneyDelta) : `-${money(Math.abs(report.moneyDelta))}`}</span><i className={report.moneyDelta >= 0 ? 'positive-bar' : 'negative-bar'} style={{ height: `${Math.max(8, Math.abs(report.moneyDelta) / largestTrend * 100)}%` }} /><small title={translate(language, calendarLabel(report.year, report.week))}>{translate(language, calendarParts(report.week).month)} W{calendarParts(report.week).weekOfMonth}<br />{text('Year', 'Tahun')} {report.year}</small></div>)}</div></article></section> : <section className="finance-empty"><ChartNoAxesCombined size={28} /><strong>No reports in this period</strong><span>{text('Choose another period, or resolve a week to record statistics and finances.', 'Pilih periode lain, atau selesaikan satu minggu untuk mencatat statistik dan keuangan.')}</span></section>}
  </div>;
}

function Saves({ game, activeSave, onLoad, onDelete, user, syncState, onCloudSave, onCloudLoad, onOpenAccount }) {
  return <div className="page saves-page">
    <section className="page-heading"><div><span className="eyebrow">Save operations</span><h1>Save and load</h1><p>Every game-state change autosaves to IndexedDB. Cloud checkpoints run after each resolved week, on manual save, before refresh, and before logout.</p><small className="save-timezone-note">All times shown in WIB (UTC+7).</small></div></section>
    <div className="save-operation-grid">
    <section className="save-grid single-save"><article className="save-card occupied"><div className="slot-number">48</div><span>Local browser save</span><h2>{calendarLabel(game.year, game.week)}</h2><p>{game.seed} · {number.format(game.group.fanbase)} fans · {money(game.money)}</p><small>{activeSave ? `Saved ${formatDateTime(activeSave.updatedAt)}` : 'Waiting for first autosave'}</small><div className="save-actions"><button type="button" onClick={onLoad}>Reload local save</button><IconButton label="Delete active run" onClick={onDelete}><Trash2 size={18} /></IconButton></div></article></section>
      <section className={user ? 'cloud-save-panel connected' : 'cloud-save-panel'}><div className="cloud-save-icon"><Cloud size={26} /></div><div><span>Cloud account</span><h2>{user ? user.username : 'Guest mode'}</h2><p>{user ? 'Encrypted snapshot ready for cross-device recovery.' : 'This run exists only in this browser until you register.'}</p>{syncState.updatedAt ? <small>Last cloud confirmation {formatCloudDateTime(syncState.updatedAt)}</small> : <small>{user ? 'No cloud confirmation this session.' : 'IndexedDB remains active.'}</small>}</div><div className="cloud-save-actions">{user ? <><button type="button" onClick={onCloudSave}><Cloud size={17} />Save to cloud</button><button type="button" className="secondary-button" onClick={onCloudLoad}><Download size={17} />Load cloud save</button></> : <button type="button" onClick={onOpenAccount}>Register and upload this run</button>}</div></section>
    </div>
    <p className="storage-note">Loading cloud data replaces this browser's active run and Management Token profile.</p>
  </div>;
}

function StartScreen({ saves, onStart, onLoad, metaProfile, language = 'en' }) {
  const [seed, setSeed] = useState(randomSeed);
  const activeSave = saves.find((save) => save.state?.runStatus !== 'ended');
  const runHistory = metaProfile.runHistory ?? [];
  return <main className="start-screen">
     <section className="start-brand"><div className="start-number">48</div><div><img className="coming-soon-logo" src={comingSoonImage} alt="Coming soon" /><p>Build the schedule. Develop the roster. Let every decision write a different history.</p></div></section>
    <section className="start-control">
      {activeSave ? <div className="continue-run"><span>Active run</span><h2>{calendarLabel(activeSave.state.year, activeSave.state.week)}</h2><p>{activeSave.state.seed} · {number.format(activeSave.state.group.fanbase)} fans</p><button className="continue-button" type="button" onClick={onLoad}>Continue run <ChevronRight size={20} /></button></div> : <><span className="eyebrow">New management run</span><h2>Enter the theater office</h2></>}
      <div className={activeSave ? 'new-run-panel' : ''}>{activeSave ? <strong>Start replacement timeline</strong> : null}<label htmlFor="seed">Run seed</label><div className="seed-input"><input id="seed" value={seed} onChange={(e) => setSeed(e.target.value)} /><IconButton label="Randomize seed" onClick={() => setSeed(randomSeed())}><Sparkles size={19} /></IconButton></div><button className="start-button" type="button" onClick={() => onStart(seed)}>Start new timeline <ChevronRight size={20} /></button>{activeSave ? <small>Current run remains saved until new lineup is confirmed.</small> : null}</div>
      <p className="fiction-note">Member skills, traits, and story outcomes are fictional gameplay data generated independently for each save.</p>
      <LatestPatchnoteCard language={language} />
      <section className="past-run-history"><header><div><span className="eyebrow">Past timelines</span><h3>Management history</h3></div><strong>{runHistory.length} completed</strong></header>{runHistory.length ? <div className="past-run-list">{runHistory.map((run) => <article key={run.id}><div className="past-run-title"><span>{run.managementName || 'Unnamed Management'}</span><h4>{run.rank} · {run.score} points</h4><small>{new Date(run.completedAt).toLocaleDateString()} · {run.yearsSurvived} year(s), {run.weeksSurvived} weeks</small></div><dl><div><dt>Final money</dt><dd>{money(run.finalMoney)}</dd></div><div><dt>Fans</dt><dd>{number.format(run.finalFanbase)}</dd></div><div><dt>Popularity</dt><dd>{run.finalPopularity}</dd></div><div><dt>Fan Trust</dt><dd>{run.finalFanTrust}</dd></div><div><dt>Reputation</dt><dd>{run.finalReputation}</dd></div><div><dt>Total members</dt><dd>{run.totalMembers}</dd></div><div><dt>Graduated</dt><dd>{run.finalGraduatedMembers}</dd></div><div><dt>Drama</dt><dd>{run.dramaSuspensions}</dd></div></dl><p>{run.cause}</p></article>)}</div> : <div className="past-run-empty"><History size={22} /><span>Completed runs will be summarized here.</span></div>}</section>
    </section>
  </main>;
}

function MemberStatModal({ member, selected, atLimit, onConfirm, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return <ModalPortal><div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="setup-modal" role="dialog" aria-modal="true" aria-labelledby="member-modal-title">
      <IconButton autoFocus label="Close member details" onClick={onClose}><X size={20} /></IconButton>
      <div className="setup-modal-profile"><Portrait member={member} size="setup" /><div><span>{member.generation} · {member.team || 'JKT48'}</span><h2 id="member-modal-title">{member.name}</h2><p>{member.archetype} · {member.traits.join(', ')}</p><p className="member-birthday">Birthday {birthdayMeta(member)}</p></div><div className="modal-overall"><strong>{overall(member)}</strong><span>Overall</span></div></div>
      <div className="setup-stat-grid">{['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina', 'popularity', 'energy', 'ego'].map((key) => <div key={key}><span>{key}</span><div><i style={{ width: `${member[key]}%` }} /></div><strong>{Math.round(member[key])}</strong></div>)}</div>
      <p className="setup-stat-note">All ratings are fictional values generated for this seed.</p>
       <div className="setup-modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className={selected ? 'remove-member-button' : 'confirm-member-button'} disabled={!selected && atLimit} onClick={onConfirm}>{selected ? 'Remove from founding roster' : atLimit ? 'Founding roster complete' : 'Confirm member'} {selected ? <X size={18} /> : <Check size={18} />}</button></div>
    </section>
  </div></ModalPortal>;
}

function CandidateStatModal({ candidate, selected, atLimit, selectionLocked, onToggle, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  if (!candidate) return null;
  const statKeys = ['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina', 'consistency', 'adaptability', 'popularity', 'energy', 'potential', 'development', 'ego'];
  return <ModalPortal><div className="setup-modal-backdrop candidate-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="setup-modal candidate-stat-modal" role="dialog" aria-modal="true" aria-labelledby="candidate-modal-title"><IconButton autoFocus label="Close candidate details" onClick={onClose}><X size={20} /></IconButton><div className="setup-modal-profile"><Portrait member={candidate} size="setup" /><div><span>{candidate.generation} · Audition candidate</span><h2 id="candidate-modal-title">{candidate.name}</h2><p>{candidate.archetype} · {candidate.traits.join(', ')}</p><p className="member-birthday">Birthday {birthdayMeta(candidate)}</p></div><div className="modal-overall"><strong>{overall(candidate)}</strong><span>Overall</span></div></div><div className="setup-stat-grid candidate-stat-grid">{statKeys.map((key) => <div key={key}><span>{key}</span><div><i style={{ width: `${candidate[key]}%` }} /></div><strong>{Math.round(candidate[key])}</strong></div>)}</div><p className="setup-stat-note">Exact fictional ratings for this audition candidate.</p><div className="setup-modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Close details</button><button type="button" className={selected ? 'remove-member-button' : 'confirm-member-button'} disabled={selectionLocked || (!selected && atLimit)} onClick={onToggle}>{selectionLocked ? 'Selection confirmed' : selected ? 'Remove candidate' : atLimit ? 'Six candidates selected' : 'Select candidate'} {selected ? <X size={18} /> : <Check size={18} />}</button></div></section></div></ModalPortal>;
}

function FoundingSetup({ draft, metaProfile, onUpgradeBonus, onChangeRosterScope, onChangeDifficulty, onComplete, onCancel }) {
  const [step, setStep] = useState('bonuses');
  const [selectedBonusIds, setSelectedBonusIds] = useState([]);
  const [managementName, setManagementName] = useState(draft.managementName ?? '');
  const [hardMode, setHardMode] = useState(draft.hardMode ?? false);
  const [theaterId, setTheaterId] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [generationFilter, setGenerationFilter] = useState('all');
  const [inspectingId, setInspectingId] = useState(null);
  const [pendingBonus, setPendingBonus] = useState(null);
  const [confirmLoadout, setConfirmLoadout] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [perkError, setPerkError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const rosterScope = draft.rosterScope ?? 'active';
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const theater = draft.theaterOffers.find((item) => item.id === theaterId);
  const selectedBonusLevels = Object.fromEntries(selectedBonusIds.map((id) => [id, metaProfile.bonusLevels?.[id] ?? 1]));
  const selectedBonusValue = (id) => selectedBonusIds.includes(id) ? getBonusValueAtLevel(BONUS_BY_ID[id], selectedBonusLevels[id]) : 0;
  const theaterPurchaseRate = 1 + selectedBonusValue('B001');
  const theaterUpkeepRate = 1 + selectedBonusValue('B002');
  const selectedTheaterPrice = theater ? Math.round(theater.price * theaterPurchaseRate) : 0;
  const inspecting = draft.members.find((member) => member.id === inspectingId);
  const pendingBonusLevel = pendingBonus ? (metaProfile.bonusLevels?.[pendingBonus.id] ?? (metaProfile.unlockedBonusIds.includes(pendingBonus.id) ? 1 : 0)) : 0;
  const pendingBonusNextLevel = pendingBonus ? Math.min(MAX_BONUS_LEVEL, pendingBonusLevel + 1) : 0;
  const pendingBonusCost = pendingBonus ? getBonusUpgradeCost(pendingBonus, pendingBonusNextLevel) : 0;
  // Switching scope rebuilds the draft with different member ids, so any prior picks are dropped.
  const changeScope = (scope) => {
    if (scope === rosterScope) return;
    setSelectedIds([]);
    setInspectingId(null);
    setGenerationFilter('all');
    onChangeRosterScope(scope);
  };
  const foundingGenerations = useMemo(() => [...new Set(draft.members.map((member) => member.generation).filter(Boolean))].sort((first, second) => first.localeCompare(second, undefined, { numeric: true, sensitivity: 'base' })), [draft.members]);
  const filteredFoundingMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    return draft.members.filter((member) => {
      if (generationFilter !== 'all' && member.generation !== generationFilter) return false;
      return !query || [member.name, member.nickname, member.team].some((value) => String(value ?? '').toLowerCase().includes(query));
    });
  }, [draft.members, generationFilter, memberSearch]);
  const confirmMember = () => {
    if (!inspecting) return;
     setSelectedIds((current) => current.includes(inspecting.id) ? current.filter((id) => id !== inspecting.id) : current.length < BALANCE.foundingRosterSize ? [...current, inspecting.id] : current);
    setInspectingId(null);
  };
  const finish = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try { await onComplete(finalizeGameSetup(draft, theaterId, selectedIds, managementName, selectedBonusIds, { hardMode, rosterScope, bonusLevels: selectedBonusLevels })); }
    catch { setSaveError('Could not save founding lineup. Check browser storage and try again.'); setSaving(false); }
  };

  return <main className="founding-setup">
     <header className="setup-header"><button type="button" className="setup-back" onClick={step === 'bonuses' ? onCancel : () => setStep(step === 'lineup' ? 'theater' : step === 'theater' ? 'management' : 'bonuses')}><ArrowLeft size={19} />{step === 'bonuses' ? 'Change seed' : step === 'management' ? 'Bonus loadout' : step === 'theater' ? 'Management name' : 'Theater choice'}</button><div className="setup-brand"><img src={comingSoonImage} alt="Coming soon" /></div><div className="setup-progress" aria-label={`Setup step ${step === 'bonuses' ? 1 : step === 'management' ? 2 : step === 'theater' ? 3 : 4} of 4`}><span className="active" /><span className={step !== 'bonuses' ? 'active' : ''} /><span className={['theater','lineup'].includes(step) ? 'active' : ''} /><span className={step === 'lineup' ? 'active' : ''} /><b>{step === 'bonuses' ? '1' : step === 'management' ? '2' : step === 'theater' ? '3' : '4'} / 4</b></div></header>
    {step === 'bonuses' ? <section className="bonus-step">
      <div className="setup-title lineup-title"><div><span className="eyebrow">Management Perks</span><h1>Choose your run bonuses</h1><p>Unlock and level perks permanently from 1–5, then equip exactly {BALANCE.bonusSlots}. The loadout locks when the run begins.</p></div><div className={selectedBonusIds.length === BALANCE.bonusSlots ? 'selection-count complete' : 'selection-count'}><strong>{selectedBonusIds.length}</strong><span>of {BALANCE.bonusSlots} equipped</span></div></div>
      <div className="bonus-wallet"><CircleDollarSign size={18} /><strong>{metaProfile.currency}</strong><span>Management Token available</span></div>
      <p className={perkError ? 'save-error perk-error visible' : 'save-error perk-error'} aria-live="polite">{perkError}</p>
      <div className="bonus-grid">{BONUS_TEMPLATES.map((bonus, index) => { const level = metaProfile.bonusLevels?.[bonus.id] ?? (metaProfile.unlockedBonusIds.includes(bonus.id) ? 1 : 0); const unlocked = level > 0; const selected = selectedBonusIds.includes(bonus.id); const nextLevel = Math.min(MAX_BONUS_LEVEL, level + 1); const upgradeCost = getBonusUpgradeCost(bonus, nextLevel); return <article key={bonus.id} style={{ '--item-index': index % 10 }} className={selected ? 'bonus-card selected' : 'bonus-card'}><div><span>{bonus.id} · {bonus.category}</span>{selected ? <Check size={18} /> : null}</div><div className="perk-level-row"><strong>Level {level}/{MAX_BONUS_LEVEL}</strong><span className="perk-level-track" aria-label={`${bonus.name} Level ${level} of ${MAX_BONUS_LEVEL}`}>{Array.from({ length: MAX_BONUS_LEVEL }, (_, levelIndex) => <i key={levelIndex} className={levelIndex < level ? 'filled' : ''} />)}</span></div><h2>{bonus.name}</h2><p>{bonus.description}</p><small>{unlocked ? `Current effect ${formatBonusEffect(bonus, level)} · locked into equipped runs` : `Unlock Level 1 effect ${formatBonusEffect(bonus, 1)}`}</small><div className="perk-card-actions">{unlocked ? <button type="button" className="secondary-button" aria-pressed={selected} disabled={!selected && selectedBonusIds.length >= BALANCE.bonusSlots} onClick={() => setSelectedBonusIds((current) => selected ? current.filter((id) => id !== bonus.id) : [...current, bonus.id])}>{selected ? 'Unequip' : 'Equip'}</button> : null}<button type="button" className="secondary-button" disabled={level >= MAX_BONUS_LEVEL || metaProfile.currency < upgradeCost || upgradeBusy} onClick={() => { setPerkError(''); setPendingBonus(bonus); }}><CircleDollarSign size={16} />{level >= MAX_BONUS_LEVEL ? 'Max level' : level === 0 ? `Unlock ${upgradeCost}` : `Level ${nextLevel} · ${upgradeCost}`}</button></div></article>; })}</div>
       <ModalPortal><footer className="setup-footer"><div><span>Locked loadout</span><strong>{selectedBonusIds.length}/{BALANCE.bonusSlots} equipped</strong><small>Perk levels are snapshotted when the run begins.</small></div><button type="button" className="setup-primary" disabled={selectedBonusIds.length !== BALANCE.bonusSlots} onClick={() => setConfirmLoadout(true)}>Review loadout <ChevronRight size={19} /></button></footer></ModalPortal>
    </section> : step === 'management' ? <section className="management-step">
      <div className="management-form"><div className="management-icon"><UserRoundSearch size={28} /></div><span className="eyebrow">Founding identity</span><h1>Name your management</h1><p>This name identifies the office responsible for your active timeline.</p><label htmlFor="management-name">Management name</label><input id="management-name" autoFocus maxLength={40} value={managementName} onChange={(event) => setManagementName(event.target.value)} placeholder="Example: Senayan Stage Office" onKeyDown={(event) => { if (event.key === 'Enter' && managementName.trim()) setStep('theater'); }} /><small>{managementName.trim().length}/40 characters</small>
        <div className="difficulty-choice" role="radiogroup" aria-label="Run difficulty"><span className="difficulty-label">Difficulty</span>{[['normal', 'Normal', 'Adds direct monthly member salaries to weekly operating costs. Salary arrears, predatory loans, and mandatory Seitansai stay switched off.'], ['hard', 'Hard', 'Adds higher monthly member salaries, unpaid-cost arrears, predatory loans, and mandatory Seitansai shows. Missing payroll for more than two months ends the run.']].map(([value, label, description]) => <button type="button" key={value} role="radio" aria-checked={hardMode === (value === 'hard')} className={hardMode === (value === 'hard') ? 'difficulty-option selected' : 'difficulty-option'} onClick={() => { const next = value === 'hard'; setHardMode(next); onChangeDifficulty(next); }}><strong>{label}{hardMode === (value === 'hard') ? <Check size={17} /> : null}</strong><small>{description}</small></button>)}</div>
       </div>
       <ModalPortal><footer className="setup-footer"><div><span>Founding identity</span><strong>{managementName.trim() || 'Name your management'}</strong><small>Run seed: {draft.seed}</small></div><button type="button" className="setup-primary" disabled={!managementName.trim()} onClick={() => setStep('theater')}>Continue to theater <ChevronRight size={19} /></button></footer></ModalPortal>
    </section> : step === 'theater' ? <section className="theater-step">
      <div className="setup-title"><h1>Choose your home theater</h1><p>Purchase is mandatory. Capacity sets ticket ceiling; upkeep continues every week.</p></div>
      <div className="theater-options">{draft.theaterOffers.map((option, index) => { const discountedPrice = Math.round(option.price * theaterPurchaseRate); const discountedUpkeep = Math.round(option.weeklyUpkeep * theaterUpkeepRate); return <button type="button" key={option.id} style={{ '--item-index': index }} className={theaterId === option.id ? 'theater-option selected' : 'theater-option'} onClick={() => setTheaterId(option.id)} aria-pressed={theaterId === option.id}><div className="theater-tier"><span>{option.tier} investment · Seeded offer</span>{theaterId === option.id ? <Check size={20} /> : <Building2 size={20} />}</div>{theaterPurchaseRate < 1 || theaterUpkeepRate < 1 ? <div className="perk-discount"><Sparkles size={14} />Management Perks {theaterPurchaseRate < 1 ? `· Purchase ${Math.round((theaterPurchaseRate - 1) * 100)}%` : ''}{theaterUpkeepRate < 1 ? ` · Upkeep ${Math.round((theaterUpkeepRate - 1) * 100)}%` : ''}</div> : null}<h2>{option.name}</h2>{theaterPurchaseRate < 1 ? <span className="original-price">{money(option.price)}</span> : null}<strong className="theater-price">{money(discountedPrice)}</strong><dl><div><dt>Capacity</dt><dd>{number.format(option.capacity)}</dd></div><div><dt>Weekly upkeep</dt><dd>{theaterUpkeepRate < 1 ? <><s>{money(option.weeklyUpkeep)}</s> {money(discountedUpkeep)}</> : money(option.weeklyUpkeep)}</dd></div><div><dt>Ticket price</dt><dd>{money(option.ticketPrice)}</dd></div></dl><p>{option.id === 'community' ? 'Low risk and limited gate revenue.' : option.id === 'city' ? 'Balanced capacity for steady growth.' : 'High reach with serious fixed costs.'}</p></button>; })}</div>
      <ModalPortal><footer className="setup-footer"><div><span>Starting budget</span><strong>{theater ? `${theater.name} · ${money(selectedTheaterPrice)}` : money(draft.money)}</strong>{theater ? <small>{money(draft.money - selectedTheaterPrice)} remaining after purchase</small> : <small>Select a theater to continue.</small>}</div><button type="button" className="setup-primary" disabled={!theater} onClick={() => setStep('lineup')}>{theater ? 'Confirm theater and choose lineup' : 'Choose a theater'} <ChevronRight size={19} /></button></footer></ModalPortal>
    </section> : <section className="lineup-step">
       <div className="setup-title lineup-title"><div><h1>Select your first {BALANCE.foundingRosterSize} members</h1><p>Open any member card to inspect seeded stats, then confirm selection.</p></div><div className={selectedIds.length === BALANCE.foundingRosterSize ? 'selection-count complete' : 'selection-count'}><strong>{selectedIds.length}</strong><span>of {BALANCE.foundingRosterSize} selected</span></div></div>
      <div className="roster-scope-choice" role="radiogroup" aria-label="Member pool"><span className="roster-scope-label">Member pool</span>{[['active', 'Active members'], ['ex', 'Ex-members'], ['all', 'All members']].map(([value, label]) => <button type="button" key={value} role="radio" aria-checked={rosterScope === value} className={rosterScope === value ? 'roster-scope-option selected' : 'roster-scope-option'} onClick={() => changeScope(value)}>{label}</button>)}<small>This choice applies to the whole run: the pool you pick here also supplies later auditions. Changing it clears your current selection.</small></div>
      <div className="founding-filter-row"><div className="founding-search"><Search size={18} /><input type="search" aria-label="Search founding members" placeholder="Search name, nickname, or team" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} /><span>{filteredFoundingMembers.length} members</span>{memberSearch ? <IconButton label="Clear member search" onClick={() => setMemberSearch('')}><X size={17} /></IconButton> : null}</div><label className="founding-generation-filter"><span>Generation</span><select aria-label="Filter founding members by generation" value={generationFilter} onChange={(event) => setGenerationFilter(event.target.value)}><option value="all">All generations</option>{foundingGenerations.map((generation) => <option key={generation} value={generation}>{generation}</option>)}</select></label></div>
       <div className="founding-member-grid">{filteredFoundingMembers.length ? filteredFoundingMembers.map((member, index) => <button type="button" key={member.id} style={{ '--item-index': index % 10 }} className={selectedSet.has(member.id) ? 'founding-member selected' : 'founding-member'} onClick={() => setInspectingId(member.id)} aria-pressed={selectedSet.has(member.id)}><div className="founding-photo"><Portrait member={member} size="founding" />{selectedSet.has(member.id) ? <span><Check size={17} />Selected</span> : null}</div><div><span>{member.generation}</span><h2>{member.name}</h2><p>{member.nickname ? `${member.nickname} · ` : ''}{member.team || member.archetype}</p><dl><div><dt>OVR</dt><dd>{overall(member)}</dd></div><div><dt>Energy</dt><dd>{member.energy}</dd></div></dl></div></button>) : <div className="founding-empty"><UserRoundSearch size={28} /><strong>No members found</strong><span>Try another generation, name, nickname, or team.</span></div>}</div>
       <ModalPortal><footer className="setup-footer lineup-footer"><div><span>{theater.name}</span><strong>{number.format(theater.capacity)} seats · {money(selectedTheaterPrice)}</strong><small className={saveError ? 'save-error' : ''} aria-live="polite">{saveError || (selectedIds.length < BALANCE.foundingRosterSize ? `Choose ${BALANCE.foundingRosterSize - selectedIds.length} more member${BALANCE.foundingRosterSize - selectedIds.length === 1 ? '' : 's'}` : saving ? 'Saving active run…' : 'Founding lineup ready')}</small></div><button type="button" className="setup-primary" disabled={selectedIds.length !== BALANCE.foundingRosterSize || saving} onClick={finish}>{saving ? 'Saving…' : 'Begin management'} <ChevronRight size={19} /></button></footer></ModalPortal>
    </section>}
     {inspecting ? <MemberStatModal member={inspecting} selected={selectedSet.has(inspecting.id)} atLimit={selectedIds.length >= BALANCE.foundingRosterSize} onConfirm={confirmMember} onClose={() => setInspectingId(null)} /> : null}
     {pendingBonus ? <ConfirmationModal title={pendingBonusLevel ? `Upgrade ${pendingBonus.name} to Level ${pendingBonusNextLevel}?` : `Unlock ${pendingBonus.name}?`} description={`Spend ${pendingBonusCost} Management Token. Effect becomes ${formatBonusEffect(pendingBonus, pendingBonusNextLevel)} and remains permanently available for future run loadouts.`} confirmLabel={pendingBonusLevel ? `Upgrade · ${pendingBonusCost}` : `Unlock · ${pendingBonusCost}`} onCancel={() => { if (!upgradeBusy) setPendingBonus(null); }} onConfirm={async () => { if (upgradeBusy) return; setUpgradeBusy(true); setPerkError(''); try { await onUpgradeBonus(pendingBonus); setPendingBonus(null); } catch { setPerkError('Perk upgrade could not be saved. Try again.'); } finally { setUpgradeBusy(false); } }} icon={<Sparkles size={24} />} /> : null}
     {confirmLoadout ? <ConfirmationModal title="Lock this Management Perk loadout?" description="These three perk levels will be snapshotted into the new run and cannot be changed until the next timeline." confirmLabel="Lock loadout" onCancel={() => setConfirmLoadout(false)} onConfirm={() => { setConfirmLoadout(false); setStep('management'); }} icon={<Check size={24} />}><div className="confirm-loadout-list">{selectedBonusIds.map((id) => <span key={id}><strong>{BONUS_BY_ID[id].name}</strong><small>Level {selectedBonusLevels[id]} · {formatBonusEffect(BONUS_BY_ID[id], selectedBonusLevels[id])}</small></span>)}</div></ConfirmationModal> : null}
  </main>;
}

const sumReports = (reports, financialEvents = []) => {
  const total = reports.reduce((summary, report) => ({
    moneyDelta: summary.moneyDelta + (report.moneyDelta ?? 0),
    fanGain: summary.fanGain + (report.fanGain ?? 0),
    activities: summary.activities + (report.activities ?? 0),
    finances: Object.fromEntries(Object.keys(summary.finances).map((key) => [key, summary.finances[key] + (report.finances?.[key] ?? 0)])),
  }), { moneyDelta: 0, fanGain: 0, activities: 0, finances: { theater: 0, videoCall: 0, meetGreet: 0, media: 0, offAir: 0, liveStream: 0, concert: 0, twoShot: 0, campaign: 0, opportunity: 0, otherIncome: 0, activityCosts: 0, refunds: 0, salary: 0, debtPayments: 0, loanPayment: 0, opportunityCosts: 0, generalOperations: 0, theaterUpkeep: 0, totalIncome: 0, totalExpenses: 0 } });
  financialEvents.forEach((event) => {
    const income = Math.max(0, Number(event.income ?? event.revenue ?? 0));
    const expense = Math.max(0, Number(event.expense ?? event.cost ?? 0));
    total.moneyDelta += income - expense;
    total.finances.opportunity += income;
    total.finances.opportunityCosts += expense;
    total.finances.totalIncome += income;
    total.finances.totalExpenses += expense;
  });
  return total;
};

const applyFinancialEvents = (report, financialEvents = []) => {
  if (!financialEvents.length) return report;
  const summary = sumReports([report], financialEvents);
  return { ...report, moneyDelta: summary.moneyDelta, finances: summary.finances };
};

function ReportSummary({ title, report }) {
  const incomeRows = [['Theater tickets', 'theater'], ['Video Call', 'videoCall'], ['Meet & Greet', 'meetGreet'], ['2Shot', 'twoShot'], ['Media appearances', 'media'], ['Off-air performances', 'offAir'], ['Live Stream', 'liveStream'], ['Concerts', 'concert'], ['Annual campaign voting', 'campaign'], ['Opportunities', 'opportunity'], ['Other income', 'otherIncome']];
  return <section className="report-summary"><h3>{title}</h3><div className="report-kpis"><div><span>Net cash</span><strong className={report.moneyDelta >= 0 ? 'positive' : 'negative'}>{report.moneyDelta >= 0 ? '+' : ''}{money(report.moneyDelta)}</strong></div><div><span>New fans</span><strong>+{number.format(report.fanGain)}</strong></div><div><span>Activities</span><strong>{report.activities}</strong></div></div><div className="report-ledger">{incomeRows.map(([label, key]) => <div key={key}><span>{label}</span><strong>{money(report.finances?.[key] ?? 0)}</strong></div>)}<div><span>Activity costs</span><strong>{money(report.finances?.activityCosts ?? 0)}</strong></div><div><span>Opportunity costs</span><strong>{money(report.finances?.opportunityCosts ?? 0)}</strong></div><div><span>Total income</span><strong className="positive">{money(report.finances?.totalIncome ?? 0)}</strong></div><div><span>Total expenses</span><strong className="negative">{money(report.finances?.totalExpenses ?? 0)}</strong></div></div></section>;
}

function SkillGrowthSummary({ changes = [] }) {
  const memberChanges = [...changes.reduce((groups, change) => {
    const member = groups.get(change.memberId) ?? { memberId: change.memberId, memberName: change.memberName, skills: [] };
    member.skills.push(change);
    groups.set(change.memberId, member);
    return groups;
  }, new Map()).values()];
  return <section className="skill-growth-summary"><h3>Skill growth</h3>{memberChanges.length ? <div className="skill-change-list">{memberChanges.map((member) => <article key={member.memberId}><h4>{member.memberName}</h4><ul>{member.skills.map((change) => <li key={change.skill} aria-label={`${change.skill} increased from ${change.before.toFixed(1)} to ${change.after.toFixed(1)}`}><strong>{change.skill}</strong><b>+{change.delta.toFixed(1)}</b><small>{change.before.toFixed(1)} → {change.after.toFixed(1)}</small></li>)}</ul></article>)}</div> : <p>No skill changes this week.</p>}</section>;
}

function TrainingSessionSummary({ sessions = [] }) {
  if (!sessions.length) return null;
  const completed = sessions.filter((session) => session.status === 'completed');
  const skipped = sessions.length - completed.length;
  const cost = completed.reduce((sum, session) => sum + (session.cost ?? 0), 0);
  const energy = completed.reduce((sum, session) => sum + (session.energyUsed ?? 0), 0);
  return <section className="training-report-summary"><h3>Training sessions</h3><div><span><small>Completed</small><strong>{completed.length}</strong></span><span><small>Skipped</small><strong>{skipped}</strong></span><span><small>Energy used</small><strong>{energy}</strong></span><span><small>Training cost</small><strong>{money(cost)}</strong></span></div></section>;
}

function SingleViewSummary({ changes = [] }) {
  if (!changes.length) return null;
  return <section className="single-view-summary"><h3>Single / MV views</h3>{changes.map((change) => <div key={change.singleId}><span><strong>{change.title}</strong><small>View week {change.viewWeek}</small></span><b>+{number.format(change.gain)}</b><small>{number.format(change.total)} total views</small></div>)}</section>;
}

function TheaterResultSummary({ shows = [] }) {
  if (!shows.length) return null;
  return <section className="theater-result-summary"><h3>Theater results</h3>{shows.map((show) => <article key={show.id}><header><span><strong>{show.day} · {show.setlistTitle}</strong><small>Center: {show.centerName}</small></span><b>{show.audienceSatisfaction}</b></header><div><span><small>Attendance</small><strong>{number.format(show.attendance)} / {number.format(show.capacity)}</strong></span><span><small>Sell-through</small><strong>{show.sellThrough}%</strong></span><span><small>Unmet demand</small><strong>{number.format(show.unmetDemand)}</strong></span><span><small>Revenue</small><strong>{money(show.revenue)}</strong></span></div><details><summary>{show.units.length} unit songs · {show.understudyIds.length} understudies</summary>{show.units.map((unit) => <p key={unit.songId}><strong>{unit.title}</strong><span>{unit.memberNames.join(', ')}</span></p>)}</details></article>)}</section>;
}

function ConcertSetlistSummary({ summary }) {
  if (!summary) return null;
  const evaluation = summary.evaluation;
  const ranked = summary.ranked || summary.songs.some((song) => Number.isInteger(song.rank));
  const displaySongs = ranked ? [...summary.songs].sort((first, second) => (first.rank ?? 0) - (second.rank ?? 0)) : summary.songs;
  return <section className="concert-setlist-summary"><div><h3>{summary.title || 'Concert setlist'}</h3><span>{summary.day} · {summary.songCount} songs</span></div>{evaluation ? <div className="concert-evaluation"><span><small>Attendance</small><strong>{number.format(evaluation.attendance)} / {number.format(evaluation.capacity)}</strong></span><span><small>Occupancy</small><strong>{evaluation.occupancy}%</strong></span><span><small>Performance</small><strong>{evaluation.memberPerformance}</strong></span><span><small>Production</small><strong>{evaluation.productionQuality}</strong></span><span><small>Setlist</small><strong>{evaluation.setlistReception}</strong></span><span><small>Expectation</small><strong>{evaluation.fanExpectation}</strong></span><span><small>Efficiency</small><strong>{evaluation.managementEfficiency}</strong></span><span className="overall"><small>Overall</small><strong>{evaluation.overall}</strong></span></div> : null}<ol>{displaySongs.map((song, index) => <li key={`${song.songId}-${index}`}><span>{song.rank ?? index + 1}</span><p><strong>{song.title}</strong><small>{song.performerType === 'team' ? 'Team performs' : `${song.performerNames.join(', ')} perform`}</small></p></li>)}</ol></section>;
}

function YearEndMeetGreetSummary({ summary }) {
  if (!summary) return null;
  const occupancy = summary.capacity ? Math.round(summary.attendance / summary.capacity * 100) : 0;
  return <section className="year-end-summary"><div><span className="eyebrow">Annual event</span><h3>{summary.title}</h3></div><div className="year-end-summary-grid"><span><small>Attendance</small><strong>{number.format(summary.attendance)} / {number.format(summary.capacity)}</strong></span><span><small>Occupancy</small><strong>{occupancy}%</strong></span><span><small>Members</small><strong>{summary.participatingMembers}</strong></span><span><small>Revenue</small><strong>{money(summary.revenue)}</strong></span></div></section>;
}

function StatisticsModal({ report, monthlyReport, financialEvents = [], onClose }) {
  const weeklyEvents = financialEvents.filter((event) => event.year === report.year && event.week === report.week);
  const weeklyReport = applyFinancialEvents(report, weeklyEvents);
  const resolvedMonthlyReport = monthlyReport;
  report = weeklyReport;
  monthlyReport = resolvedMonthlyReport;
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return <ModalPortal><div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="statistics-modal" role="dialog" aria-modal="true" aria-labelledby="statistics-title"><div className="statistics-head"><div><span className="eyebrow">Financial report</span><h2 id="statistics-title">{calendarLabel(report.year, report.week)}</h2></div><IconButton label="Close report" onClick={onClose}><X size={20} /></IconButton></div><ReportSummary title="Weekly summary" report={report} />{monthlyReport ? <ReportSummary title={`Monthly summary · ${calendarParts(report.week).month}` } report={monthlyReport} /> : null}<TrainingSessionSummary sessions={report.trainingSessions} /><SkillGrowthSummary changes={getReportSkillChanges(report)} /><SingleViewSummary changes={report.singleViewChanges} /><TheaterResultSummary shows={report.theaterShows} /><ConcertSetlistSummary summary={report.concertSummary} /><YearEndMeetGreetSummary summary={report.yearEndMeetGreetSummary} /><button className="setup-primary report-close" type="button" onClick={onClose}>Continue management <ChevronRight size={18} /></button></section></div></ModalPortal>;
}

function GraduationModal({ game, setGame, graduation, member, onClose }) {
  const [options, setOptions] = useState({ finalShow: true, specialSegment: false, merchandise: false, successorId: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  const successors = game.members.filter((candidate) => candidate.id !== graduation.memberId && ['active', 'trainee'].includes(candidate.status));
  const cost = (options.finalShow ? 8_000_000 : 0) + (options.specialSegment ? 4_000_000 : 0) + (options.merchandise ? 10_000_000 : 0) + (options.successorId ? 6_000_000 : 0);
  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      // Equivalent state transition: prepareGraduation(current, graduation.id, options).
      const next = prepareGraduation(game, graduation.id, options);
      if (next === game) throw new Error('Graduation plan could not be saved. Check funds or preparation status.');
      await saveActiveRun(next);
      setGame(next);
      onClose();
    } catch (error) {
      setSaveError(error.message || 'Graduation plan could not be saved.');
    } finally {
      setSaving(false);
    }
  };
  return <ModalPortal><div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="statistics-modal graduation-modal" role="dialog" aria-modal="true" aria-labelledby="graduation-title"><div className="statistics-head"><div><span className="eyebrow">Graduation announcement</span><h2 id="graduation-title">{graduation.memberName} will graduate</h2></div><IconButton label="Close graduation announcement" onClick={onClose} disabled={saving}><X size={20} /></IconButton></div><div className="graduation-profile">{member ? <Portrait member={member} size="setup" /> : <div className="graduation-symbol"><CalendarDays size={30} /></div>}<div><span>Final theater departure</span><strong>{calendarLabel(graduation.departureYear, graduation.departureWeek)}</strong><p>Existing campaign commitments may finish through this date. New campaigns cannot include this member.</p></div></div>{graduation.preparation ? <div className="graduation-plan-saved"><Check size={18} /><span><strong>Preparation saved</strong><small>{money(graduation.preparation.cost)} committed to the farewell plan.</small></span></div> : <div className="graduation-options"><label><input type="checkbox" checked={options.finalShow} disabled={saving} onChange={(event) => setOptions((current) => ({ ...current, finalShow: event.target.checked }))} /><span><strong>Final theater show</strong><small>FRL8m · fan growth and trust</small></span></label><label><input type="checkbox" checked={options.specialSegment} disabled={saving} onChange={(event) => setOptions((current) => ({ ...current, specialSegment: event.target.checked }))} /><span><strong>Special segment</strong><small>FRL4m · extra fan response</small></span></label><label><input type="checkbox" checked={options.merchandise} disabled={saving} onChange={(event) => setOptions((current) => ({ ...current, merchandise: event.target.checked }))} /><span><strong>Farewell merchandise</strong><small>FRL10m · FRL18m departure revenue</small></span></label><label className="successor-select"><span><strong>Train successor</strong><small>FRL6m · Performance +2, Popularity +1</small></span><select value={options.successorId} disabled={saving} onChange={(event) => setOptions((current) => ({ ...current, successorId: event.target.value }))}><option value="">No successor</option>{successors.map((candidate) => <option key={candidate.id} value={candidate.id}>{displayName(candidate)}</option>)}</select></label></div>}{saveError ? <p className="save-error visible" role="alert">{saveError}</p> : null}<div className="graduation-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Acknowledge</button>{!graduation.preparation ? <button className="setup-primary" type="button" disabled={!cost || game.money < cost || saving} onClick={confirm}>{saving ? 'Saving…' : `Save plan · ${money(cost)}`} <ChevronRight size={18} /></button> : null}</div></section></div></ModalPortal>;
}

function DramaDecisionModal({ game, setGame, drama, language = 'en', onClose }) {
  const [punishmentWeeks, setPunishmentWeeks] = useState('4');
  const t = (value) => translate(language, value);
  const member = game.members.find((item) => item.id === drama.memberId);
  const isManagement = drama.dramaSource === 'management' || drama.type === 'management';
  if (!member && !isManagement) return null;
  const title = language === 'id' ? drama.titleId : drama.title;
  const detail = language === 'id' ? drama.detailId : drama.detail;
  const category = language === 'id' ? drama.categoryId ?? drama.category ?? (isManagement ? 'Insiden manajemen' : 'Insiden anggota') : drama.category ?? (isManagement ? 'Management incident' : 'Member incident');
  const directedAt = drama.directedTarget ? (language === 'id' ? drama.targetNameId ?? drama.targetName : drama.targetName) : null;
  const subject = member?.name ?? drama.name ?? (language === 'id' ? 'kantor manajemen' : 'management office');
  const canFire = isManagement || getTheaterEligibleMembers(game).length > BALANCE.theaterMinimumMembers || member?.status === 'suspended';
  const punishLabel = language === 'id' ? `Hukum ${punishmentWeeks} minggu` : `Punish ${punishmentWeeks} ${punishmentWeeks === '1' ? 'week' : 'weeks'}`;
  return <ModalPortal><div className="setup-modal-backdrop" role="presentation"><section className="confirm-week-modal drama-decision-modal" role="dialog" aria-modal="true" aria-labelledby="drama-decision-title" aria-describedby="drama-decision-detail"><div className="confirm-week-icon"><ShieldAlert size={24} /></div><span className="eyebrow">{isManagement ? (language === 'id' ? 'Drama manajemen' : 'Management drama') : (language === 'id' ? 'Drama anggota' : 'Member drama')} · {category}</span><h2 id="drama-decision-title">{title ?? `${subject} is involved in bad drama`}</h2><p id="drama-decision-detail">{detail ?? `${subject} is involved in bad drama.`}</p>{directedAt ? <small>{language === 'id' ? 'Ditujukan kepada' : 'Directed at'}: {directedAt}</small> : null}{isManagement ? <><p>{language === 'id' ? `Tingkat: ${t(drama.severity)}. Insiden ini mencerminkan keputusan kantor terbaru dan memengaruhi kepercayaan grup serta reputasi.` : `Severity: ${drama.severity}. This incident reflects recent office decisions and affects group trust and reputation.`}</p><div className="confirm-week-actions"><button type="button" className="setup-primary" onClick={onClose}>{language === 'id' ? 'Akui insiden' : 'Acknowledge incident'}</button></div></> : <><p>{language === 'id' ? `Tingkat: ${t(drama.severity)}. Dampak terhadap kepercayaan dan reputasi sudah berlaku. Pilih respons manajemen.` : `Severity: ${drama.severity}. Trust and reputation damage already applies. Choose management response.`}</p><div className="drama-response-choice"><div><strong>{t('No punishment has been applied yet.')}</strong><span>{t('Let it be keeps the member active and closes this drama without punishment.')}</span></div><label><span>{t('Punishment duration')}</span><select autoFocus value={punishmentWeeks} onChange={(event) => setPunishmentWeeks(event.target.value)}><option value="1">{t('1 week')}</option><option value="2">{t('2 weeks')}</option><option value="4">{t('4 weeks')}</option><option value="8">{t('8 weeks')}</option><option value="12">{t('12 weeks')}</option></select><small>{t('The member will be unavailable for the selected duration.')}</small></label></div><div className="confirm-week-actions drama-decision-actions"><button type="button" className="secondary-button" aria-label={t('Let it be — no punishment')} onClick={() => { setGame((current) => resolveMemberDramaWithoutPunishment(current, member.id)); onClose(); }}>{t('Let it be')}</button><button type="button" className="secondary-button" onClick={() => { setGame((current) => punishMember(current, member.id, punishmentWeeks)); onClose(); }}>{punishLabel}</button><button type="button" className="setup-primary" disabled={!canFire} onClick={() => { setGame((current) => fireMember(current, member.id)); onClose(); }}>{t('Fire member')}</button></div></>}</section></div></ModalPortal>;
}

function RunEndScreen({ game, onNewRun }) {
  const summary = game.runSummary;
  return <main className="run-end-screen"><section className="run-end-hero"><span>Management term complete</span><h1>Run ended</h1><p>{game.managementName}&apos;s alternate timeline has reached its conclusion.</p><div className="run-end-count"><strong>{summary.rank ?? 'D'}</strong><span>management rank · {number.format(summary.score ?? 0)} points</span></div></section><section className="run-summary"><span className="eyebrow">Management record</span><h2>{summary.cause}</h2><div className="summary-grid"><div><span>Years survived</span><strong>{summary.yearsSurvived}</strong></div><div><span>Weeks survived</span><strong>{summary.weeksSurvived}</strong></div><div><span>Singles released</span><strong>{summary.singlesReleased ?? 0}</strong></div><div><span>Theater shows</span><strong>{summary.theaterShows}</strong></div><div><span>VC tickets</span><strong>{number.format(summary.videoCallTickets ?? 0)}</strong></div><div><span>M&amp;G tickets</span><strong>{number.format(summary.meetGreetTickets ?? 0)}</strong></div><div><span>Largest concert</span><strong>{number.format(summary.largestConcert ?? 0)}</strong></div><div><span>Best occupancy</span><strong>{summary.bestConcertOccupancy ?? 0}%</strong></div><div><span>Largest roster</span><strong>{summary.largestRoster}</strong></div><div><span>Members recruited</span><strong>{summary.membersRecruited}</strong></div><div><span>Members developed</span><strong>{summary.membersDeveloped ?? 0}</strong></div><div><span>New generations</span><strong>{summary.newGenerations ?? 0}</strong></div><div><span>Breakout stars</span><strong>{summary.breakoutStars ?? 0}</strong></div><div><span>Successful centers</span><strong>{summary.successfulCenters ?? 0}</strong></div><div><span>Graduations</span><strong>{summary.graduations}</strong></div><div><span>Peak fanbase</span><strong>{number.format(summary.peakFanbase)}</strong></div>{summary.highestSellingSingle ? <div><span>Top single</span><strong>{summary.highestSellingSingle.title} · {number.format(summary.highestSellingSingle.views)}</strong></div> : null}</div><div className="meta-reward"><CircleDollarSign size={22} /><span>Run reward</span><strong>+{summary.metaReward} Management Token</strong></div><button className="start-button" type="button" onClick={onNewRun}>Begin another timeline <ChevronRight size={19} /></button></section></main>;
}

export default function App() {
  const { user, authLoading, storageRevision, syncState, migrationState, retryMigration, downloadMigrationRecovery, pushSave, loadCloudSave, logout } = useAuth();
  const [game, setGame] = useState(null);
  const [setupDraft, setSetupDraft] = useState(null);
  const [saves, setSaves] = useState([]);
  const [activeView, setActiveView] = useState('dashboard');
  const [tutorialReplayChapter, setTutorialReplayChapter] = useState(null);
  const [adminRoute, setAdminRoute] = useState(getAdminRoute);
  const [selectedMember, setSelectedMember] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [statisticsReport, setStatisticsReport] = useState(null);
  const [settlementBusy, setSettlementBusy] = useState(false);
  const [graduationAlert, setGraduationAlert] = useState(null);
  const [dramaAlert, setDramaAlert] = useState(null);
  const [confirmDeleteRun, setConfirmDeleteRun] = useState(false);
  const [confirmEndRun, setConfirmEndRun] = useState(false);
  const [confirmCloudLoad, setConfirmCloudLoad] = useState(false);
  const [metaProfile, setMetaProfile] = useState({ id: 'profile', currency: 0, unlockedBonusIds: [], bonusLevels: {}, completedRuns: 0, runHistory: [] });
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('jkt48-manager-theme') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  const [language, setLanguage] = useState(() => {
    try { return localStorage.getItem('jkt48-manager-language') === 'id' ? 'id' : 'en'; }
    catch { return 'en'; }
  });
  setActiveLanguage(language);
  const advancingRef = useRef(false);
  const rewardingRef = useRef(false);
  const rewardingPromiseRef = useRef(null);
  const latestGameRef = useRef(null);
  const lastPersistedGameRef = useRef(null);

  const saveGameLocally = useCallback(async (state) => {
    if (!state) return null;
    const saved = await saveActiveRun(state);
    lastPersistedGameRef.current = state;
    return saved;
  }, []);

  const saveBeforeRefresh = useCallback(async () => {
    const currentGame = latestGameRef.current;
    if (currentGame) await saveGameLocally(currentGame);
    if (user) await pushSave('refresh');
  }, [pushSave, saveGameLocally, user]);

  useEffect(() => {
    latestGameRef.current = game;
    if (!game || lastPersistedGameRef.current === game) return undefined;
    const timerId = window.setTimeout(() => {
      saveGameLocally(game).catch((error) => {
        console.error(error);
        setSaveMessage('Local autosave failed. Use Save run before leaving this page.');
      });
    }, 500);
    return () => window.clearTimeout(timerId);
  }, [game, saveGameLocally]);

  useEffect(() => {
    const saveIfHidden = () => {
      if (document.visibilityState === 'hidden' && latestGameRef.current) void saveGameLocally(latestGameRef.current).catch(console.error);
    };
    const warnIfDirty = (event) => {
      if (!latestGameRef.current || lastPersistedGameRef.current === latestGameRef.current) return;
      void saveGameLocally(latestGameRef.current).catch(console.error);
      event.preventDefault();
      event.returnValue = '';
    };
    document.addEventListener('visibilitychange', saveIfHidden);
    window.addEventListener('beforeunload', warnIfDirty);
    return () => {
      document.removeEventListener('visibilitychange', saveIfHidden);
      window.removeEventListener('beforeunload', warnIfDirty);
    };
  }, [saveGameLocally]);

  const refreshSaves = useCallback(async () => { const active = await getActiveRun(); const normalized = active ? { ...active, state: normalizeSessionActivities(active.state) } : null; setSaves(normalized?.state.runStatus === 'ended' ? [] : normalized ? [normalized] : []); return normalized; }, []);
  useEffect(() => {
    if (authLoading || ['running', 'failed'].includes(migrationState.status)) return undefined;
    let cancelled = false;
    Promise.all([getActiveRun(), getMetaProfile()])
      .then(([active, profile]) => {
        if (cancelled) return;
        const normalized = active ? { ...active, state: normalizeSessionActivities(active.state) } : null;
        const endedRun = normalized?.state.runStatus === 'ended';
        setSaves(normalized && !endedRun ? [normalized] : []);
        setMetaProfile(profile);
        if (endedRun || storageRevision > 0) {
          setGame(normalized?.state ?? null);
          setSetupDraft(null);
        }
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setMetaLoaded(true); });
    return () => { cancelled = true; };
  }, [authLoading, migrationState.status, storageRevision]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#11110f' : '#11509c');
    try { localStorage.setItem('jkt48-manager-theme', theme); }
    catch { /* Theme still applies for this session when storage is unavailable. */ }
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language === 'id' ? 'id' : 'en';
    try { localStorage.setItem('jkt48-manager-language', language); }
    catch { /* Language still applies for this session when storage is unavailable. */ }
  }, [language]);
  useEffect(() => localizeDocument(language), [language, game, setupDraft, activeView]);
  useEffect(() => {
    if (!game?.activeDrama || game.activeDrama.punishmentWeeks) return;
    setDramaAlert((current) => current ?? game.activeDrama);
  }, [game?.activeDrama?.dramaId, game?.activeDrama?.memberId, game?.activeDrama?.punishmentWeeks]);
  useEffect(() => {
    if (!adminRoute || authLoading || (!user && !guestMode) || String(user?.user_id) === '1') return;
    window.history.replaceState({}, '', '/');
    setAdminRoute(null);
  }, [adminRoute, authLoading, guestMode, user]);

  const start = (seed) => { setSetupDraft(createGame(seed.trim() || randomSeed())); };
  // Roster scope changes the identity pool, so the seeded draft is rebuilt from the same seed.
  const changeRosterScope = (scope) => setSetupDraft((current) => current ? createGame(current.seed, scope, current.hardMode, { runSalt: current.runSalt }) : current);
  // Difficulty changes the seeded stat band, so the draft is rebuilt so founding stats reflect it.
  const changeDifficulty = (hardMode) => setSetupDraft((current) => current ? createGame(current.seed, current.rosterScope ?? 'active', hardMode, { runSalt: current.runSalt }) : current);
  const upgradeBonus = async (bonus) => {
    const currentLevel = metaProfile.bonusLevels?.[bonus.id] ?? (metaProfile.unlockedBonusIds.includes(bonus.id) ? 1 : 0);
    if (currentLevel >= MAX_BONUS_LEVEL) return;
    const nextLevel = currentLevel + 1;
    const cost = getBonusUpgradeCost(bonus, nextLevel);
    if (metaProfile.currency < cost) return;
    const next = { ...metaProfile, currency: metaProfile.currency - cost, unlockedBonusIds: metaProfile.unlockedBonusIds.includes(bonus.id) ? metaProfile.unlockedBonusIds : [...metaProfile.unlockedBonusIds, bonus.id], bonusLevels: { ...(metaProfile.bonusLevels ?? {}), [bonus.id]: nextLevel } };
    await saveMetaProfile(next);
    setMetaProfile(next);
  };
  const completeSetup = async (readyGame) => { await saveGameLocally(readyGame); setSaves([{ slot: 1, state: readyGame, updatedAt: Date.now() }]); setGraduationAlert(null); setTutorialReplayChapter(null); setGame(readyGame); setSetupDraft(null); setActiveView('dashboard'); };
  const load = async () => { const save = await loadActiveRun(); if (save) { const normalized = normalizeSessionActivities(save.state); setGraduationAlert(null); setTutorialReplayChapter(null); setSetupDraft(null); setGame(normalized); setActiveView('dashboard'); } };
  const remove = async () => {
    await deleteActiveRun();
    setSaves([]);
    setGame(null);
    setConfirmDeleteRun(false);
  };
  const advance = async () => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setAdvancing(true);
    try {
      const next = resolveWeek(game);
      const newAnnouncement = (next.graduations ?? []).find((graduation) => graduation.announced && !(game.graduations ?? []).some((previous) => previous.id === graduation.id && previous.announced));
      await saveGameLocally(next);
      let cloudMessage = '';
      if (user) {
        try {
          await pushSave('week');
          cloudMessage = 'Week resolved and cloud checkpoint saved.';
        } catch {
          cloudMessage = 'Week resolved locally, but cloud sync failed. The next weekly save will retry.';
        }
      }
      setGame(next);
       setGraduationAlert(newAnnouncement ?? null);
       setDramaAlert((next.activeDrama && !game.activeDrama ? next.activeDrama : null) ?? (next.activeManagementDrama && !game.activeManagementDrama ? next.activeManagementDrama : null));
       const monthlyReports = next.lastResult.week % 4 === 0 ? next.weeklyReports.filter((report) => report.year === next.lastResult.year && report.week > next.lastResult.week - 4 && report.week <= next.lastResult.week) : [];
       const monthlyEvents = next.lastResult.week % 4 === 0 ? (next.financialEvents ?? []).filter((event) => event.year === next.lastResult.year && event.week > next.lastResult.week - 4 && event.week <= next.lastResult.week) : [];
       setStatisticsReport({ weekly: next.lastResult, monthly: monthlyReports.length === 4 ? sumReports(monthlyReports, monthlyEvents) : null });
      await refreshSaves();
      setSaveMessage(cloudMessage);
      setActiveView('dashboard');
    } catch (error) {
      console.error(error);
      setSaveMessage('Could not save the resolved week. Try again.');
    } finally {
      advancingRef.current = false;
      setAdvancing(false);
    }
  };
  const applySettlementAction = async (action) => {
    if (settlementBusy || !game?.pendingYearEndSettlement) return;
    setSettlementBusy(true);
    try {
      const next = action(game);
      if (next === game) return;
      const startedNewYear = Boolean(game.pendingYearEndSettlement)
        && !next.pendingYearEndSettlement
        && next.year > game.year
        && next.week === 1;
      await saveGameLocally(next);
      if (startedNewYear) {
        const verifiedLocal = await loadActiveRun();
        if (!verifiedLocal?.state || canonicalJson(verifiedLocal.state) !== canonicalJson(next)) {
          throw new Error('New-year local save verification failed.');
        }
      }
      setGame(next);
      await refreshSaves();
      if (startedNewYear && user) {
        try {
          await pushSave('new-year');
          setSaveMessage('New year saved locally and to cloud.');
        } catch {
          setSaveMessage('New year saved locally, but cloud sync failed. Use Save run to retry.');
        }
      }
    } catch (error) {
      console.error(error);
      setSaveMessage('Could not save the year-end settlement. Try again.');
    } finally {
      setSettlementBusy(false);
    }
  };
  const renovate = async () => {
    const next = renovateTheater(game);
    if (next === game) return;
    try {
      await saveGameLocally(next);
      setGame(next);
      await refreshSaves();
    } catch (error) {
      console.error(error);
      setSaveMessage('Could not save the renovation. Try again.');
    }
  };
  const manualSave = async () => {
    if (!game || manualSaving) return;
    setManualSaving(true);
    setSaveMessage('');
    try {
      await saveGameLocally(game);
      if (user) await pushSave('manual');
      await refreshSaves();
      setSaveMessage(user ? 'Run saved locally and to cloud.' : 'Guest run saved locally.');
    } catch (error) {
      console.error(error);
      setSaveMessage('Save failed. Try again.');
    } finally {
      setManualSaving(false);
    }
  };
  const finishRun = async () => {
    const ended = endRun(game);
    try {
      await saveGameLocally(ended);
      setSaves([]);
      setGame(ended);
      setConfirmEndRun(false);
    } catch (error) {
      console.error(error);
      setSaveMessage('Could not end and save the run. Try again.');
    }
  };

  useEffect(() => {
    if (!metaLoaded || rewardingRef.current || game?.runStatus !== 'ended' || !game.runSummary) return;
    const historyEntry = createRunHistoryEntry(game);
    const needsArchive = historyEntry && !(metaProfile.runHistory ?? []).some((entry) => entry.id === historyEntry.id);
    const needsReward = !game.metaRewardClaimed;
    if (!needsArchive && !needsReward) return;
    rewardingRef.current = true;
    const claimedGame = needsReward ? { ...game, metaRewardClaimed: true } : game;
    const rewardedMeta = needsReward ? { ...metaProfile, currency: metaProfile.currency + game.runSummary.metaReward, completedRuns: (metaProfile.completedRuns ?? 0) + 1 } : metaProfile;
    const nextMeta = mergeRunHistory(rewardedMeta, historyEntry);
    const rewardingPromise = Promise.all([saveGameLocally(claimedGame), saveMetaProfile(nextMeta)]);
    rewardingPromiseRef.current = rewardingPromise;
    rewardingPromise.then(() => { setGame((current) => current?.runStatus === 'ended' && current.seed === claimedGame.seed ? claimedGame : current); setMetaProfile(nextMeta); }).catch(console.error).finally(() => { rewardingRef.current = false; if (rewardingPromiseRef.current === rewardingPromise) rewardingPromiseRef.current = null; });
  }, [game, metaLoaded, metaProfile]);

  const beginAnotherRun = async () => {
    let baseMeta = metaProfile;
    let rewardAlreadyPersisted = false;
    if (rewardingPromiseRef.current) {
      try {
        await rewardingPromiseRef.current;
        baseMeta = await getMetaProfile();
        rewardAlreadyPersisted = true;
      } catch { /* Retry the reward and archive together below. */ }
    }
    const historyEntry = createRunHistoryEntry(game);
    const needsReward = !game.metaRewardClaimed && !rewardAlreadyPersisted;
    const rewardedMeta = needsReward ? { ...baseMeta, currency: baseMeta.currency + game.runSummary.metaReward, completedRuns: (baseMeta.completedRuns ?? 0) + 1 } : baseMeta;
    const nextMeta = mergeRunHistory(rewardedMeta, historyEntry);
    await saveMetaProfile(nextMeta);
    await deleteActiveRun();
    setMetaProfile(nextMeta);
    setSaves([]);
    setTutorialReplayChapter(null);
    setGame(null);
  };

  const accountBusy = ['authenticating', 'loading', 'saving', 'logging-out'].includes(syncState.phase);
  const openAccount = async () => {
    if (game) await saveGameLocally(game);
    setAccountOpen(true);
  };
  const handleLogout = async () => {
    setSaveMessage('');
    try {
      if (game) await saveGameLocally(game);
      await logout();
      setGuestMode(false);
      setAccountOpen(false);
      setSetupDraft(null);
      setGame(null);
      setSaves([]);
    } catch (error) {
      console.error(error);
      setSaveMessage('Logout stopped because cloud save was not confirmed. Try again.');
    }
  };
  const loadFromCloud = async () => {
    try {
      await loadCloudSave();
      setSaveMessage('Cloud save loaded into this browser.');
      setConfirmCloudLoad(false);
    } catch (error) {
      console.error(error);
      setSaveMessage(error.message || 'Cloud load failed.');
    }
  };

  const toggleLanguage = () => setLanguage((value) => {
    const next = value === 'id' ? 'en' : 'id';
    setActiveLanguage(next);
    if (typeof document !== 'undefined') document.documentElement.lang = next;
    return next;
  });
  const commitTutorialAction = (stepId) => {
    if (!game) return;
    const tutorialState = markTutorialStep(game.tutorialState, stepId);
    if (JSON.stringify(tutorialState) === JSON.stringify(game.tutorialState)) return;
    const next = { ...game, tutorialState };
    setGame(next);
    void saveGameLocally(next).catch(console.error);
  };
  const skipCurrentTutorial = () => {
    if (!game) return;
    const tutorialState = skipTutorial(game.tutorialState);
    const next = { ...game, tutorialState };
    setGame(next);
    void saveGameLocally(next).catch(console.error);
  };
  useEffect(() => {
    if (!game || normalizeTutorialState(game.tutorialState).status !== 'active' || game.year !== 1) return;
    const steps = [];
    if (game.week === 1 && activeView === 'schedule') steps.push('schedule-opened');
    if (game.week === 1 && Object.keys(game.schedule ?? {}).length) steps.push('schedule-assigned');
    if (game.week === 2 && activeView === 'training') steps.push('training-opened');
    if (game.week === 2 && Object.values(game.trainingPlans ?? {}).some((sessions) => sessions.length)) steps.push('training-queued');
    if (game.week === 3 && activeView === 'campaigns') steps.push('campaigns-opened');
    if (game.week === 4 && activeView === 'dashboard') steps.push('command-opened');
    if (!steps.length) return;
    const tutorialState = steps.reduce((current, stepId) => markTutorialStep(current, stepId), game.tutorialState);
    if (JSON.stringify(tutorialState) === JSON.stringify(game.tutorialState)) return;
    const next = { ...game, tutorialState };
    setGame(next);
    void saveGameLocally(next).catch(console.error);
  }, [activeView, game]);
  const navigateView = (view) => {
    if (view === 'roster') setSelectedMember(null);
    setActiveView(view);
  };
  const preGameMenu = <PreGameMenu theme={theme} onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} language={language} onToggleLanguage={toggleLanguage} user={user} onOpenAccount={openAccount} onLogout={handleLogout} accountBusy={accountBusy} />;
  const openGraduationSetup = (graduation) => {
    const pending = getPendingGraduationSetups(game).find((item) => item.id === graduation.id);
    if (!pending) return;
    setSelectedMember(null);
    setGraduationAlert(pending);
  };
  const patchnoteCanShow = !adminRoute && ((!game && !setupDraft) || (Boolean(game) && game.runStatus !== 'ended' && activeView === 'dashboard'));
  const accountLayer = <><PatchnoteNotice language={language} canShow={patchnoteCanShow} cloudEnabled={Boolean(user)} onBeforeRefresh={saveBeforeRefresh} /><SyncOverlay />{accountOpen ? <AuthScreen language={language} onClose={() => setAccountOpen(false)} onAuthenticated={() => { setGuestMode(false); setAccountOpen(false); }} /> : null}</>;
  if (['running', 'failed'].includes(migrationState.status)) return <MigrationScreen language={language} migrationState={migrationState} onRetry={retryMigration} onDownloadRecovery={migrationState.canDownloadRecovery ? downloadMigrationRecovery : undefined} />;
  if (authLoading) return <><main className="startup-sync" role="status"><div className="startup-sync-mark">48</div><strong>{translate(language, 'Checking account…')}</strong><span>{translate(language, 'Loading browser save status.')}</span></main><SyncOverlay /></>;
  if (!user && !guestMode) return <><AuthScreen language={language} allowGuest onGuest={() => setGuestMode(true)} /><SyncOverlay /><HardRefreshButton onBeforeRefresh={saveBeforeRefresh} language={language} /></>;
  if (adminRoute && String(user?.user_id) === '1') {
    const leaveAdminRoute = () => {
      window.history.replaceState({}, '', '/');
      setAdminRoute(null);
      setActiveView('dashboard');
    };
    return <>{adminRoute === 'patchnotes' ? <PatchnotesAdminDashboard language={language} onBack={leaveAdminRoute} /> : <VoucherAdminDashboard onBack={leaveAdminRoute} />}{accountLayer}</>;
  }
  if (!game && setupDraft) return <>{preGameMenu}<FoundingSetup draft={setupDraft} metaProfile={metaProfile} onUpgradeBonus={upgradeBonus} onChangeRosterScope={changeRosterScope} onChangeDifficulty={changeDifficulty} onComplete={completeSetup} onCancel={() => setSetupDraft(null)} />{accountLayer}<HardRefreshButton onBeforeRefresh={saveBeforeRefresh} language={language} /></>;
  if (!game) return <>{preGameMenu}<StartScreen saves={saves} onStart={start} onLoad={load} metaProfile={metaProfile} language={language} />{accountLayer}<HardRefreshButton onBeforeRefresh={saveBeforeRefresh} language={language} /></>;
  if (game.runStatus === 'ended') return <>{preGameMenu}<RunEndScreen game={game} onNewRun={beginAnotherRun} />{accountLayer}<HardRefreshButton onBeforeRefresh={saveBeforeRefresh} language={language} /></>;

  return <><AppShell game={game} activeView={activeView} setActiveView={navigateView} onAdvance={advance} onNewRun={() => { setTutorialReplayChapter(null); setGame(null); }} onEndRun={() => setConfirmEndRun(true)} onManualSave={manualSave} onBeforeRefresh={saveBeforeRefresh} onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} onToggleLanguage={toggleLanguage} onOpenAccount={openAccount} onLogout={handleLogout} user={user} accountBusy={accountBusy} advancing={advancing} manualSaving={manualSaving} saveMessage={saveMessage} theme={theme} language={language} onTutorialAction={commitTutorialAction} tutorialCoach={<TutorialCoach game={game} language={language} activeView={activeView} onNavigate={navigateView} onAction={commitTutorialAction} onSkip={skipCurrentTutorial} replayChapter={tutorialReplayChapter} onReplayChapter={setTutorialReplayChapter} onCloseReplay={() => setTutorialReplayChapter(null)} />}>
    {activeView === 'dashboard' ? <Dashboard game={game} setGame={setGame} setView={navigateView} selectedMember={selectedMember} setSelectedMember={setSelectedMember} language={language} onReplayTutorial={() => setTutorialReplayChapter(1)} onOpenGraduation={openGraduationSetup} /> : null}
    {activeView === 'schedule' ? <Schedule game={game} setGame={setGame} selectedMember={selectedMember} setSelectedMember={setSelectedMember} language={language} /> : null}
    {activeView === 'training' ? <Training game={game} setGame={setGame} selectedMember={selectedMember} setSelectedMember={setSelectedMember} language={language} /> : null}
    {activeView === 'roster' ? <Roster game={game} setGame={setGame} selectedMember={selectedMember} setSelectedMember={setSelectedMember} language={language} onOpenGraduation={openGraduationSetup} /> : null}
    {activeView === 'campaigns' ? <Campaigns game={game} setGame={setGame} selectedMember={selectedMember} setSelectedMember={setSelectedMember} onRenovate={renovate} language={language} onTutorialAction={commitTutorialAction} /> : null}
    {activeView === 'templates' ? <ScheduleTemplates game={game} setGame={setGame} language={language} /> : null}
    {activeView === 'statistics' ? <StatisticsDashboard game={game} language={language} /> : null}
    {activeView === 'history' ? <HistoryView game={game} language={language} /> : null}
    {activeView === 'wiki' ? <Wiki game={game} language={language} onReplayTutorial={() => setTutorialReplayChapter(1)} /> : null}
    {activeView === 'patchnotes' ? <PatchnotesPage language={language} /> : null}
    {activeView === 'saves' ? <Saves game={game} activeSave={saves[0]} onLoad={load} onDelete={() => setConfirmDeleteRun(true)} user={user} syncState={syncState} onCloudSave={manualSave} onCloudLoad={() => setConfirmCloudLoad(true)} onOpenAccount={openAccount} /> : null}
    {statisticsReport ? <StatisticsModal report={statisticsReport.weekly} monthlyReport={statisticsReport.monthly} financialEvents={game.financialEvents ?? []} onClose={() => setStatisticsReport(null)} /> : null}
     {!statisticsReport && game.pendingYearEndSettlement ? <YearEndSettlementModal game={game} language={language} busy={settlementBusy} onSettleTax={() => applySettlementAction(settleAnnualTax)} onComplete={(decision, offerId) => applySettlementAction((state) => completeYearEndSettlement(state, decision, offerId))} /> : null}
     {!statisticsReport && !game.pendingYearEndSettlement && graduationAlert ? <GraduationModal key={graduationAlert.id} game={game} setGame={setGame} graduation={game.graduations.find((item) => item.id === graduationAlert.id) ?? graduationAlert} member={game.members.find((member) => member.id === graduationAlert.memberId)} onClose={() => setGraduationAlert(null)} /> : null}
     {!statisticsReport && !game.pendingYearEndSettlement && !graduationAlert && dramaAlert ? <DramaDecisionModal game={game} setGame={setGame} drama={dramaAlert} language={language} onClose={() => setDramaAlert(null)} /> : null}
  </AppShell>{confirmDeleteRun ? <ConfirmationModal title="Delete active run?" description="This browser timeline will be permanently deleted and cannot be recovered." confirmLabel="Delete run" destructive onCancel={() => setConfirmDeleteRun(false)} onConfirm={remove} icon={<Trash2 size={24} />} /> : null}{confirmEndRun ? <ConfirmationModal title="End this run now?" description="The final summary and Management Token reward will be calculated immediately. This action cannot be undone." confirmLabel="End run" destructive onCancel={() => setConfirmEndRun(false)} onConfirm={finishRun} icon={<Square size={24} />} /> : null}{confirmCloudLoad ? <ConfirmationModal title="Load cloud save?" description="Cloud data will replace this browser's active run and Management Token profile." confirmLabel="Replace local data" destructive onCancel={() => setConfirmCloudLoad(false)} onConfirm={loadFromCloud} icon={<Download size={24} />} /> : null}{accountLayer}</>;
}
