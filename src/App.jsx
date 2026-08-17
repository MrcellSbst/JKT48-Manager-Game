import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Archive, ArrowLeft, BookOpen, Building2, CalendarDays, Check, ChevronRight, CircleDollarSign, Clapperboard,
  Clock3, Disc3, History, Languages, LayoutDashboard, Menu, Moon, Plus, Save, Search, ShieldAlert, Square,
  Sparkles, Sun, Ticket, Trash2, TrendingUp, Trophy, UserRoundSearch, Users, Wrench, X,
} from 'lucide-react';
import { BALANCE, DAYS } from './data/balance.js';
import { BONUS_TEMPLATES } from './data/bonusTemplates.js';
import { assignActivity, createGame, endRun, finalizeGameSetup, getRosterDanger, getTheaterEligibleMembers, getTheaterRenovationOffer, renovateTheater, resolveWeek, runAudition, startSingleProduction } from './engine/gameEngine.js';
import { deleteActiveRun, getActiveRun, getMetaProfile, loadActiveRun, saveActiveRun, saveMetaProfile } from './state/saveDb.js';
import { localizeDocument } from './localization.js';

const portraitModules = import.meta.glob([
  './Asset/member_active/*',
  '!./Asset/member_active/{PIA_MERALEO,ISHA_KIRANA,TANA_NONA,SAMI_MAONO,GENDIS_MAYRANNISA}.*',
], { eager: true, query: '?url', import: 'default' });
const portraits = Object.fromEntries(Object.entries(portraitModules).map(([path, url]) => [path.split('/').at(-1), url]));

const NAV = [
  ['dashboard', 'Command', LayoutDashboard], ['schedule', 'Schedule', CalendarDays],
  ['roster', 'Roster', Users], ['campaigns', 'Campaigns', Clapperboard], ['finance', 'Finance', CircleDollarSign],
  ['history', 'History', History], ['wiki', 'Wiki', BookOpen], ['saves', 'Saves', Archive],
];
const ID_TEXT = { 'Game menu':'Menu permainan','Dark mode':'Mode gelap','Light mode':'Mode terang','Save run':'Simpan permainan','Saving...':'Menyimpan...','New timeline':'Linimasa baru',Command:'Komando',Schedule:'Jadwal',Roster:'Anggota',Campaigns:'Kampanye',History:'Riwayat',Saves:'Penyimpanan',Season:'Musim',Week:'Minggu','Resolve week':'Selesaikan minggu','Open menu':'Buka menu','Close menu':'Tutup menu','Simulation stats are fictional.':'Statistik simulasi bersifat fiktif.','Save controls become available after the founding lineup is confirmed.':'Kontrol penyimpanan tersedia setelah susunan awal dikonfirmasi.','Run saved just now.':'Permainan baru saja disimpan.','Save failed. Try again.':'Gagal menyimpan. Coba lagi.' };
const translate = (language, text) => language === 'id' ? (ID_TEXT[text] ?? text) : text;

const number = new Intl.NumberFormat('en-US');
const money = (value) => `Rp ${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`;
const randomSeed = () => {
  const values = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else { values[0] = Math.floor(Math.random() * 0xffffffff); values[1] = Math.floor(Math.random() * 0xffffffff); }
  return `JKT48-${Array.from(values, (value) => value.toString(36).padStart(7, '0')).join('-').toUpperCase()}`;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const calendarParts = (week) => ({ month: MONTHS[Math.min(11, Math.floor((week - 1) / BALANCE.weeksPerMonth))], weekOfMonth: ((week - 1) % BALANCE.weeksPerMonth) + 1 });
const activityEnergyLabel = (activity) => activity.energyRecovery ? `+${activity.energyRecovery}` : activity.energy ? `-${activity.energy}` : '0';
const calendarLabel = (year, week) => { const date = calendarParts(week); return `Year ${year} · ${date.month} · Week ${date.weekOfMonth}`; };
const displayName = (member) => member.nickname || member.name.split(' ')[0];
const overall = (member) => Math.round((member.vocal + member.dance + member.performance + member.mc + member.variety) / 5);
const energyTone = (value) => value >= 60 ? 'good' : value >= 40 ? 'warn' : 'critical';
const projectedEnergy = (member, schedule) => DAYS.reduce((energy, day) => {
  const activity = BALANCE.activities[schedule[`${member.id}:${day}`]];
  return activity ? Math.max(0, Math.min(100, energy - (activity.energy ?? 0) + (activity.energyRecovery ?? 0))) : energy;
}, member.energy);
const normalizeSessionActivities = (state) => {
  const legacyCalendar = !state.calendarWeeks || state.calendarWeeks === 52;
  const convertWeek = (week) => legacyCalendar && Number.isFinite(week) ? Math.max(1, Math.min(BALANCE.weeksPerYear, Math.ceil(week * BALANCE.weeksPerYear / 52))) : week;
  const convertEntries = (items) => (items ?? []).map((item) => { const week = convertWeek(item.week); return { ...item, week, month: item.month && week ? Math.ceil(week / BALANCE.weeksPerMonth) : item.month, announcementWeek: convertWeek(item.announcementWeek), departureWeek: convertWeek(item.departureWeek) }; });
  const singles = (state.singles ?? []).map((single) => single.status === 'production' ? { ...single, productionDay: single.productionDay ?? DAYS[0] } : single);
  const schedule = Object.fromEntries(Object.entries(state.schedule ?? {}).map(([key, activity]) => [key, /^vc[123]$/.test(activity) ? 'vc1' : /^mg[123]$/.test(activity) ? 'mg1' : activity]));
  singles.filter((single) => single.status === 'production').forEach((single) => single.memberIds?.forEach((memberId) => { schedule[`${memberId}:${single.productionDay}`] = 'mvProduction'; }));
  return {
    ...state,
    calendarWeeks: BALANCE.weeksPerYear,
    week: convertWeek(state.week),
    schedule, singles,
    history: convertEntries(state.history), activityEvents: convertEntries(state.activityEvents), weeklyReports: convertEntries(state.weeklyReports), concerts: convertEntries(state.concerts), renovations: convertEntries(state.renovations), graduations: convertEntries(state.graduations),
    lastResult: state.lastResult ? { ...state.lastResult, week: convertWeek(state.lastResult.week) } : state.lastResult,
  };
};

function Portrait({ member, size = 'medium' }) {
  const src = portraits[member.photo];
  return src ? <img className={`portrait portrait-${size}`} src={src} alt={`${member.name} portrait`} /> : <div className={`portrait portrait-${size} portrait-fallback`}>{displayName(member).slice(0, 1)}</div>;
}

function IconButton({ label, children, className = '', ...props }) {
  return <button className={`icon-button ${className}`.trim()} type="button" aria-label={label} title={label} {...props}>{children}</button>;
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
  ['Momentum', 'A temporary modifier used by drama selection and event outcomes; it fades by 30% each week.'],
  ['Fanbase', 'Personal demand pool used when selling Video Call and Meet & Greet tickets.'],
];

function Wiki({ game }) {
  const activityRows = Object.entries(BALANCE.activities);
  const theaterGross = game?.theater ? game.theater.capacity * game.theater.ticketPrice : 0;
  return <div className="page wiki-page">
    <section className="page-heading"><div><span className="eyebrow">Game reference</span><h1>Manager wiki</h1><p>Rules, member ratings, event income, operating costs, and timing limits used by this run.</p></div></section>
    <nav className="wiki-jump" aria-label="Wiki sections"><a href="#wiki-stats">Member stats</a><a href="#wiki-income">Income and costs</a><a href="#wiki-rules">Event rules</a><a href="#wiki-systems">Season systems</a></nav>
    <section className="wiki-section" id="wiki-stats"><div className="wiki-section-head"><span>01</span><div><h2>Member stats</h2><p>Most ratings use a 0–100 scale and are generated from the run seed.</p></div></div><div className="wiki-definition-grid">{WIKI_STATS.map(([name, description]) => <article key={name}><strong>{name}</strong><p>{description}</p></article>)}</div></section>
    <section className="wiki-section" id="wiki-income"><div className="wiki-section-head"><span>02</span><div><h2>Income and costs</h2><p>Activity costs are charged for every participating member unless noted otherwise.</p></div></div>
      <div className="wiki-callout"><CircleDollarSign size={20} /><div><strong>Weekly fixed expenses</strong><p>Rp 18m general operations + theater upkeep. Management Perks can reduce both amounts.</p></div></div>
      <div className="wiki-table-wrap"><table className="wiki-table"><thead><tr><th>Activity</th><th>Energy</th><th>Cost / member</th><th>Gross income</th><th>Income rule</th></tr></thead><tbody>{activityRows.map(([id, item]) => <tr key={id}><td><strong>{item.label}</strong></td><td>{id === 'liveStream' ? `+${item.energyRecovery}` : item.energy}</td><td>{money(item.cost ?? 0)}</td><td>{id === 'theater' ? (theaterGross ? money(theaterGross) : 'Capacity × ticket price') : id === 'liveStream' ? `Popularity × ${money(item.revenuePerPopularity)}` : item.capacity ? `Up to ${money(item.capacity * item.ticket)}` : item.revenue ? money(item.revenue) : 'None'}</td><td>{id === 'theater' ? 'Requires exactly 12 members; displayed gross is for the complete show.' : id.startsWith('vc') ? `${item.capacity} slots × ${money(item.ticket)} per selected member.` : id.startsWith('mg') ? `${item.capacity} slots × ${money(item.ticket)} per participating member.` : id === 'liveStream' ? 'Once per member each week; restores 6 Energy and adds fans based on Popularity.' : id === 'concert' ? 'Fixed Rp 5m per participating member.' : 'No direct income.'}</td></tr>)}</tbody></table></div>
      <p className="wiki-note">Video Call and Meet & Greet sales are demand-limited. Demand uses personal fanbase, Popularity, and a random 90–120% sales factor.</p>
    </section>
    <section className="wiki-section" id="wiki-rules"><div className="wiki-section-head"><span>03</span><div><h2>Event rules</h2><p>Scheduling limits are enforced when assignments are made.</p></div></div><div className="wiki-rule-list"><article><strong>Theater show</strong><p>Exactly 12 members must be assigned on the same day. An incomplete show is canceled with no revenue, cost, or fatigue. Gross ticket income equals capacity × ticket price.</p></article><article><strong>Video Call</strong><p>One Video Call per member per four-week month. Only the selected member participates.</p></article><article><strong>Meet & Greet</strong><p>One event per week. Every available member participates and generates their own ticket sales and costs.</p></article><article><strong>Concert</strong><p>One concert per four-week month. Every available member participates. Each participant generates the configured fixed revenue, cost, fatigue, and fan gain.</p></article><article><strong>MV and media</strong><p>MV roles generate fans and Popularity but no direct income. Media appearances generate fans from Variety and add Popularity.</p></article><article><strong>Training</strong><p>Training improves one skill. Gains depend on Potential, Development, current skill level, traits, trainee status, and Management Perks.</p></article></div></section>
    <section className="wiki-section" id="wiki-systems"><div className="wiki-section-head"><span>04</span><div><h2>Season systems</h2><p>Long-term rules that shape roster and theater management.</p></div></div><div className="wiki-rule-list"><article><strong>Energy and performance</strong><p>Stamina reduces fatigue. Performance is full at 60+ Energy, 95% at 40–59, 85% at 20–39, and 70% below 20. Active members recover 40 Energy weekly.</p></article><article><strong>Drama</strong><p>From Year 2, there is a 2% weekly chance when no drama or cooldown is active. The selected member is unavailable for four weeks; higher Ego and positive Momentum increase selection weight.</p></article><article><strong>Graduation</strong><p>Graduations are announced 6–12 weeks before departure. The system protects the minimum 12-member theater roster when scheduling departures.</p></article><article><strong>Renovation</strong><p>Available at December Week 4 once per year. It costs roughly 22–35% of theater purchase price plus a level surcharge, raises ticket price 8–15%, and raises weekly upkeep 12–20%.</p></article><article><strong>Run end</strong><p>The run ends when fewer than 12 eligible members remain, or when management ends it manually. The final record awards Management Token.</p></article><article><strong>Management Perks</strong><p>Three unlocked perks can be equipped before a run. They remain locked for that run and modify the exact systems stated on each perk.</p></article></div></section>
  </div>;
}

function Metric({ icon: Icon, label, value, meta, tone = '' }) {
  return <div className={`metric ${tone}`}><Icon size={18} /><div><span>{label}</span><strong>{value}</strong><small>{meta}</small></div></div>;
}

function PreGameMenu({ theme, onToggleTheme, language, onToggleLanguage }) {
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
    <aside id="pre-game-menu" className={open ? 'pre-game-menu open' : 'pre-game-menu'} aria-label="Game menu">
      <div className="pre-game-menu-head"><strong>{translate(language, 'Game menu')}</strong><IconButton label={translate(language, 'Close menu')} onClick={() => setOpen(false)}><X size={19} /></IconButton></div>
      <button type="button" onClick={onToggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}<span>{translate(language, theme === 'dark' ? 'Light mode' : 'Dark mode')}</span></button>
      <button type="button" onClick={onToggleLanguage}><Languages size={18} /><span>{language === 'id' ? 'English' : 'Bahasa Indonesia'}</span></button>
      <button type="button" onClick={() => { setOpen(false); setWikiOpen(true); }}><BookOpen size={18} /><span>Wiki</span></button>
      <p>{translate(language, 'Save controls become available after the founding lineup is confirmed.')}</p>
    </aside>
    {open ? <button className="pre-game-scrim" aria-label="Close menu" type="button" onClick={() => setOpen(false)} /> : null}
    {wikiOpen ? <div className="pre-game-wiki" role="dialog" aria-modal="true" aria-label="Manager wiki"><IconButton label="Close wiki" className="pre-game-wiki-close" onClick={() => setWikiOpen(false)}><ArrowLeft size={20} /></IconButton><Wiki /></div> : null}
  </>;
}

function AppShell({ game, activeView, setActiveView, onAdvance, onNewRun, onEndRun, onManualSave, onToggleTheme, onToggleLanguage, advancing, manualSaving, saveMessage, theme, language, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmAdvance, setConfirmAdvance] = useState(false);
  useEffect(() => {
    if (!confirmAdvance) return undefined;
    const close = (event) => { if (event.key === 'Escape') setConfirmAdvance(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [confirmAdvance]);
  return <div className="app-shell">
    <aside className={mobileOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><div className="brand-mark">48</div><div><strong>JKT48</strong><span>{game.managementName || 'Manager'}</span></div></div>
      <nav aria-label="Main navigation">{NAV.map(([id, label, Icon]) => <button key={id} type="button" className={activeView === id ? 'active' : ''} onClick={() => { setActiveView(id); setMobileOpen(false); }}><Icon size={19} /><span>{translate(language, label)}</span></button>)}</nav>
      <div className="sidebar-footer">
        <button type="button" onClick={onManualSave} disabled={manualSaving}><Save size={18} />{translate(language, manualSaving ? 'Saving...' : 'Save run')}</button>
        <button type="button" onClick={onToggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}{translate(language, theme === 'dark' ? 'Light mode' : 'Dark mode')}</button>
        <button type="button" onClick={onToggleLanguage}><Languages size={18} />{language === 'id' ? 'English' : 'Bahasa Indonesia'}</button>
        <button type="button" onClick={onNewRun}><Plus size={18} />{translate(language, 'New timeline')}</button>
        <button type="button" className="end-run-button" onClick={onEndRun}><Square size={17} />End run</button>
        <p className={saveMessage ? 'sidebar-save-status visible' : 'sidebar-save-status'} aria-live="polite">{translate(language, saveMessage || 'Simulation stats are fictional.')}</p>
      </div>
    </aside>
    <main>
      <header className="topbar">
        <IconButton label={translate(language, 'Open menu')} onClick={() => setMobileOpen(true)}><Menu size={20} /></IconButton>
        <div className="week-title"><span>{translate(language, 'Year')} {game.year}</span><strong>{calendarParts(game.week).month} <small>· {translate(language, 'Week')} {calendarParts(game.week).weekOfMonth}/4</small></strong></div>
        <div className="topbar-status"><span><CircleDollarSign size={16} />{money(game.money)}</span><span><Users size={16} />{number.format(game.group.fanbase)} fans</span></div>
        <button className="advance-button" type="button" onClick={() => setConfirmAdvance(true)} disabled={advancing}>{advancing ? 'Resolving…' : 'Resolve week'} <ChevronRight size={19} /></button>
      </header>
      {children}
    </main>
    {mobileOpen ? <button className="scrim" aria-label="Close menu" type="button" onClick={() => setMobileOpen(false)} /> : null}
    {confirmAdvance ? <div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmAdvance(false); }}><section className="confirm-week-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-week-title"><div className="confirm-week-icon"><Clock3 size={25} /></div><span className="eyebrow">Schedule confirmation</span><h2 id="confirm-week-title">End this week?</h2><p>All scheduled activities will resolve, finances will be calculated, and the calendar will advance. This action cannot be undone.</p><div className="confirm-week-actions"><button type="button" className="secondary-button" onClick={() => setConfirmAdvance(false)}>Cancel</button><button type="button" className="setup-primary" onClick={() => { setConfirmAdvance(false); onAdvance(); }}>End week <ChevronRight size={18} /></button></div></section></div> : null}
  </div>;
}

function Dashboard({ game, setView, selectedMember, setSelectedMember }) {
  const topMembers = useMemo(() => [...game.members].filter((m) => m.status !== 'graduated').sort((a, b) => b.popularity - a.popularity).slice(0, 5), [game.members]);
  const scheduled = Object.keys(game.schedule).length;
  const eligibleCount = getTheaterEligibleMembers(game).length;
  return <div className="page dashboard-page">
    <section className="page-heading"><div><span className="eyebrow">Management briefing</span><h1>Command center</h1><p>Balance this week’s exposure, development, energy, and financial risk.</p></div><div className="seed">Seed <code>{game.seed}</code></div></section>
    {game.notifications.length ? <section className="notice-strip">{game.notifications.map((item, index) => <div key={`${item.text}-${index}`} className={item.type}><Sparkles size={17} /><span>{item.text}</span></div>)}</section> : null}
    {game.week === BALANCE.weeksPerYear && !(game.renovations ?? []).some((item) => item.year === game.year) ? <section className="year-end-renovation"><Wrench size={22} /><div><strong>Year-end renovation window open</strong><span>Review permanent ticket and upkeep changes before advancing to next year.</span></div><button type="button" onClick={() => setView('campaigns')}>Review offer <ChevronRight size={17} /></button></section> : null}
    <section className="metrics-grid">
      <Metric icon={Users} label="Fanbase" value={number.format(game.group.fanbase)} meta="Group reach" />
      <Metric icon={TrendingUp} label="Popularity" value={`${game.group.popularity}/100`} meta="Public interest" tone="red" />
      <Metric icon={Trophy} label="Fan trust" value={`${game.group.fanTrust}/100`} meta="Management confidence" />
      <Metric icon={Activity} label="Reputation" value={`${game.group.reputation}/100`} meta="Industry standing" />
    </section>
    <section className="dashboard-grid">
      <div className="panel weekly-plan">
        <div className="panel-heading"><div><span className="eyebrow">Current fixture</span><h2>Week plan</h2></div><button type="button" className="text-button" onClick={() => setView('schedule')}>Open schedule <ChevronRight size={17} /></button></div>
        <div className="week-days">{DAYS.map((day) => { const count = Object.keys(game.schedule).filter((key) => key.endsWith(`:${day}`)).length; return <div key={day} className={count ? 'booked' : ''}><span>{day}</span><strong>{count}</strong><small>{count === 1 ? 'assignment' : 'assignments'}</small></div>; })}</div>
        <div className="plan-footer"><span><CalendarDays size={18} /> {scheduled} activities booked</span><span><Clock3 size={18} /> Resolve to advance</span></div>
      </div>
      <div className="panel form-watch">
        <div className="panel-heading"><div><span className="eyebrow">Selection watch</span><h2>High momentum</h2></div></div>
        <div className="member-list">{topMembers.map((member, index) => <button type="button" key={member.id} onClick={() => { setSelectedMember(member.id); setView('roster'); }}><span className="rank">{index + 1}</span><Portrait member={member} size="small" /><span className="member-copy"><strong>{displayName(member)}</strong><small>{member.generation} · POP {member.popularity}</small></span><span className={`energy-dot ${energyTone(member.energy)}`}>{member.energy}</span></button>)}</div>
      </div>
      <div className="panel last-result">
        <div className="panel-heading"><div><span className="eyebrow">Latest report</span><h2>{game.lastResult ? calendarLabel(game.week === 1 ? game.year - 1 : game.year, game.week === 1 ? BALANCE.weeksPerYear : game.week - 1) : 'Timeline opened'}</h2></div></div>
        {game.lastResult ? <><div className="result-score"><div><span>Net cash</span><strong className={game.lastResult.moneyDelta >= 0 ? 'positive' : 'negative'}>{game.lastResult.moneyDelta >= 0 ? '+' : ''}{money(game.lastResult.moneyDelta)}</strong></div><div><span>New fans</span><strong>+{number.format(game.lastResult.fanGain)}</strong></div><div><span>Activities</span><strong>{game.lastResult.activities}</strong></div></div>{game.lastResult.finances ? <div className="finance-breakdown"><div className="finance-column income"><h3>Income</h3><dl><div><dt>Theater tickets</dt><dd>{money(game.lastResult.finances.theater)}</dd></div><div><dt>Video Call</dt><dd>{money(game.lastResult.finances.videoCall)}</dd></div><div><dt>Meet & Greet</dt><dd>{money(game.lastResult.finances.meetGreet)}</dd></div><div><dt>Concerts</dt><dd>{money(game.lastResult.finances.concert)}</dd></div><div><dt>Other income</dt><dd>{money(game.lastResult.finances.otherIncome)}</dd></div><div className="finance-total"><dt>Total income</dt><dd>{money(game.lastResult.finances.totalIncome)}</dd></div></dl></div><div className="finance-column expenses"><h3>Expenses</h3><dl><div><dt>Activity costs</dt><dd>{money(game.lastResult.finances.activityCosts)}</dd></div><div><dt>General operations</dt><dd>{money(game.lastResult.finances.generalOperations)}</dd></div><div><dt>Theater upkeep</dt><dd>{money(game.lastResult.finances.theaterUpkeep)}</dd></div><div className="finance-total"><dt>Total expenses</dt><dd>{money(game.lastResult.finances.totalExpenses)}</dd></div></dl></div></div> : <p className="finance-legacy-note">Resolve another week to generate the detailed income report.</p>}</> : <p className="empty-copy">Schedule first week to establish form and fan response.</p>}
      </div>
      <div className="panel roster-health">
        <div className="panel-heading"><div><span className="eyebrow">Availability</span><h2>Roster condition</h2></div><span className={`danger-label danger-${getRosterDanger(eligibleCount).toLowerCase().replaceAll(' ', '-')}`}>{getRosterDanger(eligibleCount)}</span></div>
        <div className="health-bar"><span style={{ width: `${game.members.filter((m) => m.energy >= 60 && ['active','trainee'].includes(m.status)).length / game.members.length * 100}%` }} /></div>
        <dl><div><dt>Theater eligible</dt><dd>{eligibleCount}</dd></div><div><dt>Tired</dt><dd>{game.members.filter((m) => m.energy < 60 && ['active','trainee'].includes(m.status)).length}</dd></div><div><dt>Unavailable</dt><dd>{game.members.filter((m) => m.status === 'suspended').length}</dd></div></dl>
      </div>
    </section>
  </div>;
}

function Schedule({ game, setGame, selectedMember, setSelectedMember }) {
  const [activity, setActivity] = useState('theater');
  const [batchMode, setBatchMode] = useState(false);
  const [batchMemberIds, setBatchMemberIds] = useState([]);
  const [batchDay, setBatchDay] = useState(DAYS[0]);
  const reportYears = [...new Set((game.weeklyReports ?? []).map((report) => report.year))].sort((a, b) => b - a);
  const [historyYear, setHistoryYear] = useState(reportYears[0] ?? game.year);
  const [historyMonth, setHistoryMonth] = useState(Math.ceil(game.week / BALANCE.weeksPerMonth));
  const [historyWeek, setHistoryWeek] = useState(1);
  const activeMembers = useMemo(() => game.members.filter((member) => member.status !== 'graduated'), [game.members]);
  const batchMemberSet = useMemo(() => new Set(batchMemberIds), [batchMemberIds]);
  const member = activeMembers.find((item) => item.id === selectedMember) ?? activeMembers[0];
  const memberProjectedEnergy = member ? projectedEnergy(member, game.schedule) : 0;
  useEffect(() => { if (!selectedMember && member) setSelectedMember(member.id); }, [member, selectedMember, setSelectedMember]);
  const activities = Object.entries(BALANCE.activities).filter(([, item]) => item.schedulable !== false);
  const theaterCounts = useMemo(() => Object.fromEntries(DAYS.map((day) => [day, game.members.reduce((count, item) => count + (game.schedule[`${item.id}:${day}`] === 'theater' ? 1 : 0), 0)])), [game.members, game.schedule]);
  const historyReport = (game.weeklyReports ?? []).find((report) => report.year === historyYear && report.week === (historyMonth - 1) * BALANCE.weeksPerMonth + historyWeek);
  const historyByDay = Object.fromEntries(DAYS.map((day) => [day, Object.entries(historyReport?.schedule ?? {}).filter(([key]) => key.endsWith(`:${day}`)).map(([key, activityId]) => ({ member: game.members.find((item) => item.id === key.slice(0, key.lastIndexOf(':'))), activityId }))]));
  const fillTheaterLineup = (day) => setGame((current) => {
    const existingCount = current.members.reduce((count, item) => count + (current.schedule[`${item.id}:${day}`] === 'theater' ? 1 : 0), 0);
    if (existingCount === 12) return current;
    const available = current.members.filter((item) => ['active','trainee'].includes(item.status) && current.schedule[`${item.id}:${day}`] !== 'mvProduction').sort((a, b) => b.energy - a.energy).slice(0, 12);
    if (available.length !== 12) return current;
    const schedule = { ...current.schedule };
    current.members.forEach((item) => { if (schedule[`${item.id}:${day}`] === 'theater') delete schedule[`${item.id}:${day}`]; });
    available.forEach((item) => { schedule[`${item.id}:${day}`] = 'theater'; });
    return { ...current, schedule };
  });
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
  return <div className="page schedule-page">
    <section className="page-heading"><div><span className="eyebrow">Weekly operations</span><h1>Schedule</h1><p>Select member, activity, then day. Existing assignments can be replaced.</p></div><div className="legend"><span><i className="fresh" />Fresh</span><span><i className="tired" />Tired</span><span><i className="unavailable" />Unavailable</span></div></section>
    <div className="batch-toolbar"><button type="button" className={batchMode ? 'batch-toggle active' : 'batch-toggle'} onClick={toggleBatchMode} aria-pressed={batchMode}><Users size={17} /> Multiple select</button>{batchMode ? <><span><strong>{batchMemberIds.length}</strong> selected</span><label>Day<select value={batchDay} onChange={(event) => setBatchDay(event.target.value)}>{DAYS.map((day) => <option key={day} value={day}>{day}</option>)}</select></label><button type="button" className="batch-apply" disabled={!batchMemberIds.length} onClick={applyBatchAssignment}><Check size={17} /> Apply activity</button></> : <small>Assign one activity and day to several members.</small>}</div>
    <div className="schedule-layout">
      <section className="roster-rail" aria-label="Member selection"><div className="rail-title"><strong>Squad</strong><span>{batchMode ? `${batchMemberIds.length}/${activeMembers.length}` : activeMembers.length}</span></div>{activeMembers.map((item) => { const preview = projectedEnergy(item, game.schedule); return <button type="button" key={item.id} disabled={batchMode && (!['active','trainee'].includes(item.status) || (item.suspensionWeeks ?? 0) > 0)} className={batchMode ? (batchMemberSet.has(item.id) ? 'batch-selected' : '') : (item.id === member?.id ? 'selected' : '')} onClick={() => chooseMember(item)} aria-pressed={batchMode ? batchMemberSet.has(item.id) : item.id === member?.id}><Portrait member={item} size="tiny" /><span><strong>{displayName(item)}</strong><small>{item.generation}</small></span>{batchMode ? <Check className="batch-check" size={16} /> : <b className={energyTone(preview)}>{preview}</b>}</button>; })}</section>
      {member ? <section className="scheduler">
        <div className="selected-player"><Portrait member={member} size="large" /><div><span>{member.generation} · {member.team || 'JKT48'}</span><h2>{member.name}</h2><p>{member.archetype} · {member.traits.join(', ')}</p></div><div className={`energy-box ${energyTone(memberProjectedEnergy)}`}><span>Projected Energy</span><strong>{memberProjectedEnergy}</strong></div></div>
        {!['active','trainee'].includes(member.status) ? <div className="suspension"><ShieldAlert size={21} /><div><strong>Member unavailable</strong><span>{member.suspensionWeeks} week(s) remaining</span></div></div> : null}
        <div className="activity-picker"><label htmlFor="activity">Assignment</label><select id="activity" value={activity} onChange={(event) => setActivity(event.target.value)}>{activities.map(([id, item]) => <option key={id} value={id}>{item.label} · {activityEnergyLabel(item)} energy</option>)}</select></div>
        <div className="theater-lineups"><div><Building2 size={18} /><span><strong>Theater requires 12 members</strong><small>Incomplete lineups cancel without fatigue or revenue.</small></span></div>{DAYS.map((day) => theaterCounts[day] > 0 ? <button type="button" key={day} disabled={theaterCounts[day] === 12} className={theaterCounts[day] === 12 ? 'ready' : ''} onClick={() => fillTheaterLineup(day)}><span>{day}</span><strong>{theaterCounts[day]}/12</strong>{theaterCounts[day] === 12 ? <Check size={15} /> : 'Fill'}</button> : null)}</div>
        <div className="calendar-row">{DAYS.map((day) => { const key = `${member.id}:${day}`; const existing = game.schedule[key]; return <button type="button" key={day} disabled={!['active','trainee'].includes(member.status)} className={existing ? 'assigned' : ''} onClick={() => setGame((current) => assignActivity(current, member.id, day, existing === activity ? 'clear' : activity))}><span>{day}</span><strong>{existing ? BALANCE.activities[existing].label : 'Available'}</strong><small>{existing === 'theater' ? `Lineup ${theaterCounts[day]}/12 · ${activityEnergyLabel(BALANCE.activities[existing])} energy` : existing ? `${activityEnergyLabel(BALANCE.activities[existing])} base energy` : activity === 'theater' ? `Current lineup ${theaterCounts[day]}/12` : 'Click to assign'}</small></button>; })}</div>
        <div className="member-stats">{['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina', 'ego'].map((key) => <div key={key}><span>{key}</span><div><i style={{ width: `${member[key]}%` }} /></div><strong>{Math.round(member[key])}</strong></div>)}</div>
      </section> : null}
    </div>
    <section className="schedule-history"><div className="schedule-history-head"><div><span className="eyebrow">Resolved schedules</span><h2>Schedule history</h2></div><div className="schedule-history-filters"><label>Year<select value={historyYear} onChange={(event) => setHistoryYear(Number(event.target.value))}>{(reportYears.length ? reportYears : [game.year]).map((year) => <option key={year} value={year}>{year}</option>)}</select></label><label>Month<select value={historyMonth} onChange={(event) => setHistoryMonth(Number(event.target.value))}>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label><div className="history-week-tabs" aria-label="Schedule history week">{[1, 2, 3, 4].map((week) => <button type="button" key={week} className={historyWeek === week ? 'active' : ''} aria-pressed={historyWeek === week} onClick={() => setHistoryWeek(week)}>W{week}</button>)}</div></div></div>{historyReport?.schedule ? <div className="schedule-history-days">{DAYS.map((day) => <article key={day}><h3>{day}</h3>{historyByDay[day].length ? <ul>{historyByDay[day].map(({ member: historyMember, activityId }) => <li key={`${historyMember?.id ?? 'unknown'}-${activityId}`}><span>{historyMember ? displayName(historyMember) : 'Former member'}</span><strong>{BALANCE.activities[activityId]?.label ?? activityId}</strong></li>)}</ul> : <p>No assignments</p>}</article>)}</div> : <div className="schedule-history-empty"><CalendarDays size={24} /><strong>No schedule recorded</strong><span>{historyReport ? 'This older report has no schedule snapshot.' : 'No resolved report exists for this week.'}</span></div>}</section>
  </div>;
}

function Roster({ game, selectedMember, setSelectedMember }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('overall');
  const visible = useMemo(() => game.members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'energy' ? b.energy - a.energy : sort === 'popularity' ? b.popularity - a.popularity : overall(b) - overall(a)), [game.members, query, sort]);
  const selected = game.members.find((m) => m.id === selectedMember);
  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) setSelectedMember(null);
  }, [setSelectedMember]);
  return <div className="page roster-page">
    <section className="page-heading"><div><span className="eyebrow">Squad database</span><h1>Roster</h1><p>Every rating below is fictional and regenerated for this timeline.</p></div><div className="roster-controls"><input aria-label="Search members" placeholder="Search member" value={query} onChange={(e) => setQuery(e.target.value)} /><select aria-label="Sort roster" value={sort} onChange={(e) => setSort(e.target.value)}><option value="overall">Overall</option><option value="energy">Energy</option><option value="popularity">Popularity</option></select></div></section>
    <section className="member-grid">{visible.map((member) => <button type="button" key={member.id} className={selected?.id === member.id ? 'member-card selected' : 'member-card'} onClick={() => setSelectedMember(member.id)}><div className="photo-wrap"><Portrait member={member} size="card" /><span className={`availability ${member.status}`}>{member.status}</span><b>{overall(member)}</b></div><div className="card-body"><span>{member.generation}</span><h3>{member.name}</h3><p>{member.archetype}</p><div className="card-bars"><div><span>Energy</span><i><b className={energyTone(member.energy)} style={{ width: `${member.energy}%` }} /></i><strong>{member.energy}</strong></div><div><span>POP</span><i><b style={{ width: `${member.popularity}%` }} /></i><strong>{member.popularity}</strong></div></div></div></button>)}</section>
    {selected ? <aside className="member-drawer"><div className="drawer-head"><div><span>Player profile</span><h2>{displayName(selected)}</h2></div><IconButton label="Close profile" onClick={() => setSelectedMember(null)}><X size={20} /></IconButton></div><Portrait member={selected} size="drawer" /><h3>{selected.name}</h3><p>{selected.generation} · {selected.team || 'JKT48'} · {selected.archetype}</p><div className="drawer-score"><strong>{overall(selected)}</strong><span>Overall</span></div><dl>{['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina', 'popularity', 'energy', 'ego'].map((key) => <div key={key}><dt>{key}</dt><dd>{Math.round(selected[key])}</dd></div>)}</dl><div className="trait-list">{selected.traits.map((trait) => <span key={trait}>{trait}</span>)}</div><small>Potential, development curve, ego, and compatibility are fictional simulation values.</small></aside> : null}
  </div>;
}

function Campaigns({ game, setGame, selectedMember, setSelectedMember, onRenovate }) {
  const [confirmSingle, setConfirmSingle] = useState(false);
  const [productionDay, setProductionDay] = useState(DAYS[0]);
  const [confirmAudition, setConfirmAudition] = useState(false);
  const [confirmRenovation, setConfirmRenovation] = useState(false);
  const eligibleMembers = game.members.filter((member) => ['active', 'trainee'].includes(member.status) && (member.suspensionWeeks ?? 0) === 0);
  const center = eligibleMembers.find((member) => member.id === selectedMember) ?? [...eligibleMembers].sort((a, b) => b.popularity - a.popularity)[0];
  const mvMembers = [center, ...eligibleMembers.filter((member) => member.id !== center?.id).sort((a, b) => overall(b) - overall(a))].filter(Boolean).slice(0, 12);
  const activeSingle = game.singles.find((single) => single.status === 'production');
  const productionDayOccupied = mvMembers.some((member) => game.schedule[`${member.id}:${productionDay}`]);
  useEffect(() => {
    if (!confirmSingle && !confirmAudition && !confirmRenovation) return undefined;
    const close = (event) => { if (event.key === 'Escape') { setConfirmSingle(false); setConfirmAudition(false); setConfirmRenovation(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [confirmAudition, confirmRenovation, confirmSingle]);
  const renovationOffer = getTheaterRenovationOffer(game);
  const renovatedThisYear = (game.renovations ?? []).some((item) => item.year === game.year);
  const currentMonth = Math.ceil(game.week / 4);
  const concertThisMonth = game.concerts.some((item) => item.year === game.year && Math.ceil(item.week / 4) === currentMonth) || (game.activityEvents ?? []).some((item) => item.type === 'concert' && item.year === game.year && item.month === currentMonth);
  const createSingle = () => {
    setGame((current) => startSingleProduction(current, center.id, productionDay));
    setConfirmSingle(false);
  };
  const holdConcert = () => setGame((current) => {
    const month = Math.ceil(current.week / 4);
    if (current.money < 120_000_000 || current.concerts.some((item) => item.year === current.year && Math.ceil(item.week / 4) === month) || (current.activityEvents ?? []).some((item) => item.type === 'concert' && item.year === current.year && item.month === month)) return current;
    const demand = Math.round(current.group.fanbase * (current.group.popularity / 100) * 0.045);
    const capacity = demand > 6000 ? 7500 : demand > 3000 ? 4500 : 2000;
    const sold = Math.min(capacity, Math.round(demand * 0.9));
    const revenue = sold * 450_000;
    const concert = { id: `concert-${current.year}-${current.concerts.length + 1}`, capacity, sold, year: current.year, week: current.week };
    return { ...current, money: current.money - 120_000_000 + revenue, concerts: [...current.concerts, concert], group: { ...current.group, fanbase: current.group.fanbase + Math.round(sold * 0.4), fanTrust: Math.min(100, current.group.fanTrust + (sold / capacity > 0.75 ? 3 : -4)) }, history: [{ id: concert.id, type: 'concert', title: `${capacity.toLocaleString()}-seat concert`, detail: `${sold.toLocaleString()} tickets sold · ${Math.round(sold / capacity * 100)}% occupancy.`, year: current.year, week: current.week }, ...current.history] };
  });
  return <div className="page campaigns-page">
    <section className="page-heading"><div><span className="eyebrow">Group projects</span><h1>Campaigns</h1><p>Commit budget, choose spotlight, and create fan-facing moments.</p></div></section>
    <section className="campaign-grid">
      <article className="campaign-feature"><div className="campaign-icon"><Disc3 size={26} /></div><span className="eyebrow">Release project</span><h2>Produce next single</h2><p>Requires 12 available members. Production takes four resolved weeks before the release benefits apply.</p>{center ? <div className="center-select"><Portrait member={center} size="small" /><label>Center<select value={center.id} onChange={(e) => setSelectedMember(e.target.value)} disabled={Boolean(activeSingle)}>{eligibleMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div> : null}{activeSingle ? <div className="production-progress"><div><strong>{activeSingle.title}</strong><span>{activeSingle.progressWeeks}/{activeSingle.durationWeeks} weeks</span></div><progress aria-label={`${activeSingle.title} production progress`} max={activeSingle.durationWeeks} value={activeSingle.progressWeeks}>{Math.round(activeSingle.progressWeeks / activeSingle.durationWeeks * 100)}%</progress><small>{activeSingle.productionDay} locked · 12-member MV production</small></div> : <><div className="mv-day-select"><label htmlFor="mv-production-day">Production day</label><select id="mv-production-day" value={productionDay} onChange={(event) => setProductionDay(event.target.value)}>{DAYS.map((day) => <option key={day} value={day} disabled={mvMembers.some((member) => game.schedule[`${member.id}:${day}`])}>{day}{mvMembers.some((member) => game.schedule[`${member.id}:${day}`]) ? ' · occupied' : ''}</option>)}</select></div><div className="mv-lineup-status"><strong>{mvMembers.length}/12 members ready</strong><span>{mvMembers.length < 12 ? 'At least 12 available members are required.' : productionDayOccupied ? 'Choose a free day for all 12 members.' : `${displayName(center)} + 11 selected members`}</span></div></>}<div className="campaign-action"><span><strong>Rp 85m</strong><small>Production + promotion</small></span><button type="button" onClick={() => setConfirmSingle(true)} disabled={game.money < 85_000_000 || mvMembers.length < 12 || Boolean(activeSingle) || productionDayOccupied}>{activeSingle ? 'Production active' : 'Review production'}</button></div></article>
      <article className="campaign-feature"><div className="campaign-icon"><Ticket size={26} /></div><span className="eyebrow">Live opportunity</span><h2>Book concert offer</h2><p>Venue scales to current demand. All available members participate, and only one concert can be held each month.</p><div className="venue-preview"><strong>{game.group.fanbase > 150000 ? '4,500' : '2,000'}</strong><span>projected seats</span><small>{concertThisMonth ? 'Monthly concert limit reached.' : 'Demand remains uncertain until sales close.'}</small></div><div className="campaign-action"><span><strong>Rp 120m</strong><small>Base production</small></span><button type="button" onClick={holdConcert} disabled={game.money < 120_000_000 || concertThisMonth}>{concertThisMonth ? 'Completed this month' : 'Accept offer'}</button></div></article>
      <article className="campaign-feature audition"><div className="campaign-icon"><UserRoundSearch size={26} /></div><span className="eyebrow">Q4 · Oct Week 1+</span><h2>Open audition</h2><p>First intake caps at four. Fan trust and reputation improve future candidate choices.</p><div className="audition-state"><strong>{game.week >= BALANCE.auditionStartWeek ? 'Window open' : `${BALANCE.auditionStartWeek - game.week} weeks until window`}</strong><span>{game.auditions.some((a) => a.year === game.year) ? 'Audition completed this year' : 'One intake available this year'}</span></div><div className="campaign-action"><span><strong>Rp 65m</strong><small>Five-week process</small></span><button type="button" onClick={() => setConfirmAudition(true)} disabled={game.week < BALANCE.auditionStartWeek || game.money < 65_000_000 || game.auditions.some((a) => a.year === game.year)}>Review audition</button></div></article>
      {game.week === BALANCE.weeksPerYear && renovationOffer ? <article className="campaign-feature renovation"><div className="campaign-icon"><Wrench size={26} /></div><span className="eyebrow">Year-end facility decision</span><h2>Renovate {game.theater.name}</h2><p>Improve fan-facing facilities and permanently raise ticket value. Larger operation increases weekly fixed costs.</p><div className="renovation-comparison"><div><span>Ticket price</span><strong>{money(renovationOffer.currentTicketPrice)} <ChevronRight size={14} /> {money(renovationOffer.ticketPrice)}</strong></div><div><span>Weekly upkeep</span><strong>{money(renovationOffer.currentWeeklyUpkeep)} <ChevronRight size={14} /> {money(renovationOffer.weeklyUpkeep)}</strong></div><div><span>Renovation level</span><strong>{game.theater.renovationLevel ?? 0} <ChevronRight size={14} /> {renovationOffer.level}</strong></div></div><div className="campaign-action"><span><strong>{money(renovationOffer.cost)}</strong><small>One-time renovation cost</small></span><button type="button" onClick={() => setConfirmRenovation(true)} disabled={renovatedThisYear || game.money < renovationOffer.cost}>{renovatedThisYear ? 'Completed' : 'Review renovation'}</button></div></article> : null}
    </section>
    {confirmSingle ? <div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmSingle(false); }}><section className="confirm-week-modal production-confirm" role="dialog" aria-modal="true" aria-labelledby="production-confirm-title"><div className="confirm-week-icon"><Disc3 size={24} /></div><h2 id="production-confirm-title">Confirm single production</h2><p>Spend Rp 85m to begin a four-week MV production with {displayName(center)} as center and 11 additional members. Every {productionDay} will be locked on their schedules.</p><div className="production-confirm-facts"><span><strong>12</strong> members</span><span><strong>{productionDay}</strong> locked</span><span><strong>4 weeks</strong> duration</span></div><div className="confirm-week-actions"><button className="secondary-button" type="button" onClick={() => setConfirmSingle(false)}>Cancel</button><button className="setup-primary" type="button" onClick={createSingle}>Confirm production <ChevronRight size={18} /></button></div></section></div> : null}
    {confirmAudition ? <div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmAudition(false); }}><section className="confirm-week-modal" role="dialog" aria-modal="true" aria-labelledby="audition-confirm-title"><div className="confirm-week-icon"><UserRoundSearch size={24} /></div><h2 id="audition-confirm-title">Confirm audition</h2><p>Spend Rp 65m to run this year&apos;s audition. The intake can recruit up to four trainees and cannot be repeated this year.</p><div className="confirm-week-actions"><button className="secondary-button" type="button" onClick={() => setConfirmAudition(false)}>Cancel</button><button className="setup-primary" type="button" onClick={() => { setGame(runAudition); setConfirmAudition(false); }}>Begin audition <ChevronRight size={18} /></button></div></section></div> : null}
    {confirmRenovation && renovationOffer ? <div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmRenovation(false); }}><section className="confirm-week-modal" role="dialog" aria-modal="true" aria-labelledby="renovation-confirm-title"><div className="confirm-week-icon"><Wrench size={24} /></div><h2 id="renovation-confirm-title">Confirm theater renovation</h2><p>Spend {money(renovationOffer.cost)} now. Ticket price becomes {money(renovationOffer.ticketPrice)} and weekly upkeep becomes {money(renovationOffer.weeklyUpkeep)} permanently.</p><div className="confirm-week-actions"><button className="secondary-button" type="button" onClick={() => setConfirmRenovation(false)}>Cancel</button><button className="setup-primary" type="button" onClick={() => { setConfirmRenovation(false); onRenovate(); }}>Confirm renovation <ChevronRight size={18} /></button></div></section></div> : null}
  </div>;
}

function HistoryView({ game }) {
  return <div className="page history-page"><section className="page-heading"><div><span className="eyebrow">Alternate timeline</span><h1>Club history</h1><p>Major decisions, breakthroughs, disruptions, and generations remain in this run.</p></div></section><section className="timeline">{game.history.map((event) => <article key={event.id}><div className={`timeline-mark ${event.type}`} /> <div className="timeline-time"><strong>{event.year}</strong><span>{calendarParts(event.week).month} · W{calendarParts(event.week).weekOfMonth}</span></div><div><span>{event.type}</span><h2>{event.title}</h2><p>{event.detail}</p></div></article>)}</section></div>;
}

function FinanceDashboard({ game }) {
  const [period, setPeriod] = useState('month');
  const reports = game.weeklyReports ?? [];
  const currentMonth = Math.ceil(game.week / BALANCE.weeksPerMonth);
  const filtered = reports.filter((report) => period === 'all' || (report.year === game.year && (period === 'year' || Math.ceil(report.week / BALANCE.weeksPerMonth) === currentMonth)));
  const totals = sumReports(filtered);
  const incomeRows = [['Theater', totals.finances.theater], ['Video Call', totals.finances.videoCall], ['Meet & Greet', totals.finances.meetGreet], ['Live Stream', totals.finances.liveStream], ['Concert', totals.finances.concert], ['Other', totals.finances.otherIncome]];
  const expenseRows = [['Activities', totals.finances.activityCosts], ['Operations', totals.finances.generalOperations], ['Theater upkeep', totals.finances.theaterUpkeep]];
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

function Saves({ game, activeSave, onLoad, onDelete }) {
  return <div className="page saves-page"><section className="page-heading"><div><span className="eyebrow">Browser storage</span><h1>Active run</h1><p>Only one timeline can remain active. Progress saves after founding lineup and every resolved week.</p></div></section><section className="save-grid single-save"><article className="save-card occupied"><div className="slot-number">48</div><span>{calendarLabel(game.year, game.week)}</span><h2>{game.seed}</h2><p>{number.format(game.group.fanbase)} fans · {money(game.money)}</p><small>{activeSave ? `Saved ${new Date(activeSave.updatedAt).toLocaleString()}` : 'Waiting for next weekly autosave'}</small><div className="save-actions"><button type="button" onClick={onLoad}>Reload saved run</button><IconButton label="Delete active run" onClick={onDelete}><Trash2 size={18} /></IconButton></div></article></section><p className="storage-note">Starting another timeline replaces this run only after new founding setup is complete.</p></div>;
}

function StartScreen({ saves, onStart, onLoad }) {
  const [seed, setSeed] = useState(randomSeed);
  const activeSave = saves[0];
  return <main className="start-screen"><section className="start-brand"><div className="start-number">48</div><div><span>Alternate timeline simulator</span><h1>JKT48<br />Manager</h1><p>Build the schedule. Develop the roster. Let every decision write a different history.</p></div></section><section className="start-control">{activeSave ? <div className="continue-run"><span>Active run</span><h2>{calendarLabel(activeSave.state.year, activeSave.state.week)}</h2><p>{activeSave.state.seed} · {number.format(activeSave.state.group.fanbase)} fans</p><button className="continue-button" type="button" onClick={onLoad}>Continue run <ChevronRight size={20} /></button></div> : <><span className="eyebrow">New management run</span><h2>Enter the theater office</h2></>}<div className={activeSave ? 'new-run-panel' : ''}>{activeSave ? <strong>Start replacement timeline</strong> : null}<label htmlFor="seed">Run seed</label><div className="seed-input"><input id="seed" value={seed} onChange={(e) => setSeed(e.target.value)} /><IconButton label="Randomize seed" onClick={() => setSeed(randomSeed())}><Sparkles size={19} /></IconButton></div><button className="start-button" type="button" onClick={() => onStart(seed)}>Start new timeline <ChevronRight size={20} /></button>{activeSave ? <small>Current run remains saved until new lineup is confirmed.</small> : null}</div><p className="fiction-note">Member skills, traits, and story outcomes are fictional gameplay data generated independently for each save.</p></section></main>;
}

function MemberStatModal({ member, selected, atLimit, onConfirm, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return <div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="setup-modal" role="dialog" aria-modal="true" aria-labelledby="member-modal-title">
      <IconButton autoFocus label="Close member details" onClick={onClose}><X size={20} /></IconButton>
      <div className="setup-modal-profile"><Portrait member={member} size="setup" /><div><span>{member.generation} · {member.team || 'JKT48'}</span><h2 id="member-modal-title">{member.name}</h2><p>{member.archetype} · {member.traits.join(', ')}</p></div><div className="modal-overall"><strong>{overall(member)}</strong><span>Overall</span></div></div>
      <div className="setup-stat-grid">{['vocal', 'dance', 'performance', 'mc', 'variety', 'stamina', 'popularity', 'energy', 'ego'].map((key) => <div key={key}><span>{key}</span><div><i style={{ width: `${member[key]}%` }} /></div><strong>{Math.round(member[key])}</strong></div>)}</div>
      <p className="setup-stat-note">All ratings are fictional values generated for this seed.</p>
      <div className="setup-modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className={selected ? 'remove-member-button' : 'confirm-member-button'} disabled={!selected && atLimit} onClick={onConfirm}>{selected ? 'Remove from first 12' : atLimit ? 'First 12 complete' : 'Confirm member'} {selected ? <X size={18} /> : <Check size={18} />}</button></div>
    </section>
  </div>;
}

function FoundingSetup({ draft, metaProfile, onUnlockBonus, onComplete, onCancel }) {
  const [step, setStep] = useState('bonuses');
  const [selectedBonusIds, setSelectedBonusIds] = useState([]);
  const [managementName, setManagementName] = useState(draft.managementName ?? '');
  const [theaterId, setTheaterId] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [inspectingId, setInspectingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const theater = draft.theaterOffers.find((item) => item.id === theaterId);
  const theaterPurchaseRate = selectedBonusIds.includes('B001') ? 0.85 : 1;
  const theaterUpkeepRate = selectedBonusIds.includes('B002') ? 0.88 : 1;
  const selectedTheaterPrice = theater ? Math.round(theater.price * theaterPurchaseRate) : 0;
  const inspecting = draft.members.find((member) => member.id === inspectingId);
  const filteredFoundingMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return draft.members;
    return draft.members.filter((member) => [member.generation, member.name, member.nickname, member.team].some((value) => String(value ?? '').toLowerCase().includes(query)));
  }, [draft.members, memberSearch]);
  const confirmMember = () => {
    if (!inspecting) return;
    setSelectedIds((current) => current.includes(inspecting.id) ? current.filter((id) => id !== inspecting.id) : current.length < 12 ? [...current, inspecting.id] : current);
    setInspectingId(null);
  };
  const finish = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try { await onComplete(finalizeGameSetup(draft, theaterId, selectedIds, managementName, selectedBonusIds)); }
    catch { setSaveError('Could not save founding lineup. Check browser storage and try again.'); setSaving(false); }
  };

  return <main className="founding-setup">
    <header className="setup-header"><button type="button" className="setup-back" onClick={step === 'bonuses' ? onCancel : () => setStep(step === 'lineup' ? 'theater' : step === 'theater' ? 'management' : 'bonuses')}><ArrowLeft size={19} />{step === 'bonuses' ? 'Change seed' : step === 'management' ? 'Bonus loadout' : step === 'theater' ? 'Management name' : 'Theater choice'}</button><div className="setup-brand"><span>48</span><strong>JKT48 Manager</strong></div><div className="setup-progress" aria-label={`Setup step ${step === 'bonuses' ? 1 : step === 'management' ? 2 : step === 'theater' ? 3 : 4} of 4`}><span className="active" /><span className={step !== 'bonuses' ? 'active' : ''} /><span className={['theater','lineup'].includes(step) ? 'active' : ''} /><span className={step === 'lineup' ? 'active' : ''} /><b>{step === 'bonuses' ? '1' : step === 'management' ? '2' : step === 'theater' ? '3' : '4'} / 4</b></div></header>
    {step === 'bonuses' ? <section className="bonus-step">
      <div className="setup-title lineup-title"><div><span className="eyebrow">Management Perks</span><h1>Choose your run bonuses</h1><p>Unlock bonuses permanently, then equip exactly {BALANCE.bonusSlots}. The loadout locks when the run begins.</p></div><div className={selectedBonusIds.length === BALANCE.bonusSlots ? 'selection-count complete' : 'selection-count'}><strong>{selectedBonusIds.length}</strong><span>of {BALANCE.bonusSlots} equipped</span></div></div>
      <div className="bonus-wallet"><CircleDollarSign size={18} /><strong>{metaProfile.currency}</strong><span>Management Token available</span></div>
      <div className="bonus-grid">{BONUS_TEMPLATES.map((bonus, index) => { const unlocked = metaProfile.unlockedBonusIds.includes(bonus.id); const selected = selectedBonusIds.includes(bonus.id); return <article key={bonus.id} style={{ '--item-index': index % 10 }} className={selected ? 'bonus-card selected' : 'bonus-card'}><div><span>{bonus.id} · {bonus.category}</span>{selected ? <Check size={18} /> : null}</div><h2>{bonus.name}</h2><p>{bonus.description}</p><small>Permanent for this run</small>{unlocked ? <button type="button" className="secondary-button" aria-pressed={selected} disabled={!selected && selectedBonusIds.length >= BALANCE.bonusSlots} onClick={() => setSelectedBonusIds((current) => selected ? current.filter((id) => id !== bonus.id) : [...current, bonus.id])}>{selected ? 'Unequip' : 'Equip'}</button> : <button type="button" className="secondary-button" disabled={metaProfile.currency < bonus.unlockCost} onClick={() => onUnlockBonus(bonus)}><CircleDollarSign size={16} />Unlock {bonus.unlockCost}</button>}</article>; })}</div>
      <footer className="setup-footer"><div><span>Locked loadout</span><strong>{selectedBonusIds.length}/{BALANCE.bonusSlots} equipped</strong><small>Bonuses cannot be changed during the run.</small></div><button type="button" className="setup-primary" disabled={selectedBonusIds.length !== BALANCE.bonusSlots} onClick={() => setStep('management')}>Confirm loadout <ChevronRight size={19} /></button></footer>
    </section> : step === 'management' ? <section className="management-step">
      <div className="management-form"><div className="management-icon"><UserRoundSearch size={28} /></div><span className="eyebrow">Founding identity</span><h1>Name your management</h1><p>This name identifies the office responsible for your active timeline.</p><label htmlFor="management-name">Management name</label><input id="management-name" autoFocus maxLength={40} value={managementName} onChange={(event) => setManagementName(event.target.value)} placeholder="Example: Senayan Stage Office" onKeyDown={(event) => { if (event.key === 'Enter' && managementName.trim()) setStep('theater'); }} /><small>{managementName.trim().length}/40 characters</small></div>
      <footer className="setup-footer"><div><span>Run seed</span><strong>{draft.seed}</strong><small>The seed keeps member stats and theater offers consistent.</small></div><button type="button" className="setup-primary" disabled={!managementName.trim()} onClick={() => setStep('theater')}>Continue to theater <ChevronRight size={19} /></button></footer>
    </section> : step === 'theater' ? <section className="theater-step">
      <div className="setup-title"><h1>Choose your home theater</h1><p>Purchase is mandatory. Capacity sets ticket ceiling; upkeep continues every week.</p></div>
      <div className="theater-confirm-row"><div><span>Starting budget</span><strong>{money(draft.money)}</strong>{theater ? <small>{money(draft.money - selectedTheaterPrice)} remaining after purchase</small> : <small>Select a theater to continue.</small>}</div><button type="button" className="setup-primary" disabled={!theater} onClick={() => setStep('lineup')}>{theater ? 'Confirm theater and choose lineup' : 'Choose a theater'} <ChevronRight size={19} /></button></div>
      <div className="theater-options">{draft.theaterOffers.map((option, index) => { const discountedPrice = Math.round(option.price * theaterPurchaseRate); const discountedUpkeep = Math.round(option.weeklyUpkeep * theaterUpkeepRate); return <button type="button" key={option.id} style={{ '--item-index': index }} className={theaterId === option.id ? 'theater-option selected' : 'theater-option'} onClick={() => setTheaterId(option.id)} aria-pressed={theaterId === option.id}><div className="theater-tier"><span>{option.tier} investment · Seeded offer</span>{theaterId === option.id ? <Check size={20} /> : <Building2 size={20} />}</div>{theaterPurchaseRate < 1 || theaterUpkeepRate < 1 ? <div className="perk-discount"><Sparkles size={14} />Management Perks {theaterPurchaseRate < 1 ? '· Purchase -15%' : ''}{theaterUpkeepRate < 1 ? ' · Upkeep -12%' : ''}</div> : null}<h2>{option.name}</h2>{theaterPurchaseRate < 1 ? <span className="original-price">{money(option.price)}</span> : null}<strong className="theater-price">{money(discountedPrice)}</strong><dl><div><dt>Capacity</dt><dd>{number.format(option.capacity)}</dd></div><div><dt>Weekly upkeep</dt><dd>{theaterUpkeepRate < 1 ? <><s>{money(option.weeklyUpkeep)}</s> {money(discountedUpkeep)}</> : money(option.weeklyUpkeep)}</dd></div><div><dt>Ticket price</dt><dd>{money(option.ticketPrice)}</dd></div></dl><p>{option.id === 'community' ? 'Low risk and limited gate revenue.' : option.id === 'city' ? 'Balanced capacity for steady growth.' : 'High reach with serious fixed costs.'}</p></button>; })}</div>
    </section> : <section className="lineup-step">
      <div className="setup-title lineup-title"><div><h1>Select your first 12 members</h1><p>Open any member card to inspect seeded stats, then confirm selection.</p></div><div className={selectedIds.length === 12 ? 'selection-count complete' : 'selection-count'}><strong>{selectedIds.length}</strong><span>of 12 selected</span></div></div>
      <div className="founding-search"><Search size={18} /><input type="search" aria-label="Search founding members" placeholder="Search generation, name, nickname, or team" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} /><span>{filteredFoundingMembers.length} members</span>{memberSearch ? <IconButton label="Clear member search" onClick={() => setMemberSearch('')}><X size={17} /></IconButton> : null}</div>
      <div className="founding-member-grid">{filteredFoundingMembers.length ? filteredFoundingMembers.map((member, index) => <button type="button" key={member.id} style={{ '--item-index': index % 10 }} className={selectedSet.has(member.id) ? 'founding-member selected' : 'founding-member'} onClick={() => setInspectingId(member.id)} aria-pressed={selectedSet.has(member.id)}><div className="founding-photo"><Portrait member={member} size="founding" />{selectedSet.has(member.id) ? <span><Check size={17} />Selected</span> : null}</div><div><span>{member.generation}</span><h2>{member.name}</h2><p>{member.nickname ? `${member.nickname} · ` : ''}{member.team || member.archetype}</p><dl><div><dt>OVR</dt><dd>{overall(member)}</dd></div><div><dt>Energy</dt><dd>{member.energy}</dd></div></dl></div></button>) : <div className="founding-empty"><UserRoundSearch size={28} /><strong>No members found</strong><span>Try another generation, name, nickname, or team.</span></div>}</div>
      <footer className="setup-footer lineup-footer"><div><span>{theater.name}</span><strong>{number.format(theater.capacity)} seats · {money(selectedTheaterPrice)}</strong><small className={saveError ? 'save-error' : ''} aria-live="polite">{saveError || (selectedIds.length < 12 ? `Choose ${12 - selectedIds.length} more member${12 - selectedIds.length === 1 ? '' : 's'}` : saving ? 'Saving active run…' : 'Founding lineup ready')}</small></div><button type="button" className="setup-primary" disabled={selectedIds.length !== 12 || saving} onClick={finish}>{saving ? 'Saving…' : 'Begin management'} <ChevronRight size={19} /></button></footer>
    </section>}
    {inspecting ? <MemberStatModal member={inspecting} selected={selectedSet.has(inspecting.id)} atLimit={selectedIds.length >= 12} onConfirm={confirmMember} onClose={() => setInspectingId(null)} /> : null}
  </main>;
}

const sumReports = (reports) => reports.reduce((total, report) => ({ moneyDelta: total.moneyDelta + report.moneyDelta, fanGain: total.fanGain + report.fanGain, activities: total.activities + report.activities, finances: Object.fromEntries(Object.keys(total.finances).map((key) => [key, total.finances[key] + (report.finances?.[key] ?? 0)])) }), { moneyDelta: 0, fanGain: 0, activities: 0, finances: { theater: 0, videoCall: 0, meetGreet: 0, liveStream: 0, concert: 0, otherIncome: 0, activityCosts: 0, generalOperations: 0, theaterUpkeep: 0, totalIncome: 0, totalExpenses: 0 } });

function ReportSummary({ title, report }) {
  const incomeRows = [['Theater tickets', 'theater'], ['Video Call', 'videoCall'], ['Meet & Greet', 'meetGreet'], ['Live Stream', 'liveStream'], ['Concerts', 'concert']];
  return <section className="report-summary"><h3>{title}</h3><div className="report-kpis"><div><span>Net cash</span><strong className={report.moneyDelta >= 0 ? 'positive' : 'negative'}>{report.moneyDelta >= 0 ? '+' : ''}{money(report.moneyDelta)}</strong></div><div><span>New fans</span><strong>+{number.format(report.fanGain)}</strong></div><div><span>Activities</span><strong>{report.activities}</strong></div></div><div className="report-ledger">{incomeRows.map(([label, key]) => <div key={key}><span>{label}</span><strong>{money(report.finances?.[key] ?? 0)}</strong></div>)}<div><span>Total income</span><strong className="positive">{money(report.finances?.totalIncome ?? 0)}</strong></div><div><span>Total expenses</span><strong className="negative">{money(report.finances?.totalExpenses ?? 0)}</strong></div></div></section>;
}

function StatisticsModal({ report, monthlyReport, onClose }) {
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return <div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="statistics-modal" role="dialog" aria-modal="true" aria-labelledby="statistics-title"><div className="statistics-head"><div><span className="eyebrow">Financial report</span><h2 id="statistics-title">{calendarLabel(report.year, report.week)}</h2></div><IconButton label="Close report" onClick={onClose}><X size={20} /></IconButton></div><ReportSummary title="Weekly summary" report={report} />{monthlyReport ? <ReportSummary title={`Monthly summary · ${calendarParts(report.week).month}` } report={monthlyReport} /> : null}<button className="setup-primary report-close" type="button" onClick={onClose}>Continue management <ChevronRight size={18} /></button></section></div>;
}

function GraduationModal({ graduation, member, onClose }) {
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return <div className="setup-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="statistics-modal graduation-modal" role="dialog" aria-modal="true" aria-labelledby="graduation-title"><div className="statistics-head"><div><span className="eyebrow">Graduation announcement</span><h2 id="graduation-title">{graduation.memberName} will graduate</h2></div><IconButton label="Close graduation announcement" onClick={onClose}><X size={20} /></IconButton></div><div className="graduation-profile">{member ? <Portrait member={member} size="setup" /> : <div className="graduation-symbol"><CalendarDays size={30} /></div>}<div><span>Final theater departure</span><strong>{calendarLabel(graduation.departureYear, graduation.departureWeek)}</strong><p>The member remains available for scheduling until the announced departure date.</p></div></div><button className="setup-primary report-close" type="button" onClick={onClose}>Acknowledge <ChevronRight size={18} /></button></section></div>;
}

function RunEndScreen({ game, onNewRun }) {
  const summary = game.runSummary;
  return <main className="run-end-screen"><section className="run-end-hero"><span>Theater operations suspended</span><h1>Run ended</h1><p>{game.managementName} can no longer maintain the minimum 12-member theater lineup.</p><div className="run-end-count"><strong>{summary.finalEligibleRoster}</strong><span>available / 12 required</span></div></section><section className="run-summary"><span className="eyebrow">Management record</span><h2>{summary.cause}</h2><div className="summary-grid"><div><span>Years survived</span><strong>{summary.yearsSurvived}</strong></div><div><span>Weeks survived</span><strong>{summary.weeksSurvived}</strong></div><div><span>Theater shows</span><strong>{summary.theaterShows}</strong></div><div><span>Largest roster</span><strong>{summary.largestRoster}</strong></div><div><span>Members recruited</span><strong>{summary.membersRecruited}</strong></div><div><span>Graduations</span><strong>{summary.graduations}</strong></div><div><span>Drama suspensions</span><strong>{summary.dramaSuspensions}</strong></div><div><span>Peak fanbase</span><strong>{number.format(summary.peakFanbase)}</strong></div></div><div className="meta-reward"><CircleDollarSign size={22} /><span>Run reward</span><strong>+{summary.metaReward} Management Token</strong></div><button className="start-button" type="button" onClick={onNewRun}>Begin another timeline <ChevronRight size={19} /></button></section></main>;
}

export default function App() {
  const [game, setGame] = useState(null);
  const [setupDraft, setSetupDraft] = useState(null);
  const [saves, setSaves] = useState([]);
  const [activeView, setActiveView] = useState('dashboard');
  const [selectedMember, setSelectedMember] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [statisticsReport, setStatisticsReport] = useState(null);
  const [graduationAlert, setGraduationAlert] = useState(null);
  const [metaProfile, setMetaProfile] = useState({ id: 'profile', currency: 0, unlockedBonusIds: [], completedRuns: 0 });
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('jkt48-manager-theme') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  const [language, setLanguage] = useState(() => {
    try { return localStorage.getItem('jkt48-manager-language') === 'id' ? 'id' : 'en'; }
    catch { return 'en'; }
  });
  const advancingRef = useRef(false);
  const rewardingRef = useRef(false);

  const refreshSaves = useCallback(async () => { const active = await getActiveRun(); setSaves(active ? [{ ...active, state: normalizeSessionActivities(active.state) }] : []); }, []);
  useEffect(() => { refreshSaves().catch(console.error); }, [refreshSaves]);
  useEffect(() => { getMetaProfile().then(setMetaProfile).catch(console.error).finally(() => setMetaLoaded(true)); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#11110f' : '#d71920');
    try { localStorage.setItem('jkt48-manager-theme', theme); }
    catch { /* Theme still applies for this session when storage is unavailable. */ }
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language === 'id' ? 'id' : 'en';
    try { localStorage.setItem('jkt48-manager-language', language); }
    catch { /* Language still applies for this session when storage is unavailable. */ }
  }, [language]);
  useEffect(() => localizeDocument(language), [language, game, setupDraft, activeView]);

  const start = (seed) => { setSetupDraft(createGame(seed.trim() || randomSeed())); };
  const unlockBonus = async (bonus) => {
    if (metaProfile.unlockedBonusIds.includes(bonus.id) || metaProfile.currency < bonus.unlockCost) return;
    const next = { ...metaProfile, currency: metaProfile.currency - bonus.unlockCost, unlockedBonusIds: [...metaProfile.unlockedBonusIds, bonus.id] };
    await saveMetaProfile(next);
    setMetaProfile(next);
  };
  const completeSetup = async (readyGame) => { await saveActiveRun(readyGame); setSaves([{ slot: 1, state: readyGame, updatedAt: Date.now() }]); setGraduationAlert(null); setGame(readyGame); setSetupDraft(null); setActiveView('dashboard'); };
  const load = async () => { const save = await loadActiveRun(); if (save) { const normalized = normalizeSessionActivities(save.state); setGraduationAlert(null); setSetupDraft(null); setGame(normalized); setActiveView('dashboard'); } };
  const remove = async () => {
    if (!window.confirm('Delete active run? This timeline cannot be recovered.')) return;
    await deleteActiveRun();
    setSaves([]);
    setGame(null);
  };
  const advance = async () => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setAdvancing(true);
    try {
      const next = resolveWeek(game);
      const newAnnouncement = (next.graduations ?? []).find((graduation) => graduation.announced && !(game.graduations ?? []).some((previous) => previous.id === graduation.id && previous.announced));
      await saveActiveRun(next);
      setGame(next);
      setGraduationAlert(newAnnouncement ?? null);
      const monthlyReports = next.lastResult.week % 4 === 0 ? next.weeklyReports.filter((report) => report.year === next.lastResult.year && report.week > next.lastResult.week - 4 && report.week <= next.lastResult.week) : [];
      setStatisticsReport({ weekly: next.lastResult, monthly: monthlyReports.length === 4 ? sumReports(monthlyReports) : null });
      await refreshSaves();
      setActiveView('dashboard');
    } catch (error) {
      console.error(error);
      setSaveMessage('Could not save the resolved week. Try again.');
    } finally {
      advancingRef.current = false;
      setAdvancing(false);
    }
  };
  const renovate = async () => {
    const next = renovateTheater(game);
    if (next === game) return;
    try {
      await saveActiveRun(next);
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
      await saveActiveRun(game);
      await refreshSaves();
      setSaveMessage('Run saved just now.');
    } catch (error) {
      console.error(error);
      setSaveMessage('Save failed. Try again.');
    } finally {
      setManualSaving(false);
    }
  };
  const finishRun = async () => {
    const prompt = language === 'id' ? 'Akhiri permainan sekarang? Tindakan ini tidak dapat dibatalkan dan ringkasan akhir akan langsung dihitung.' : 'End this run now? This cannot be undone and the final summary will be calculated immediately.';
    if (!window.confirm(prompt)) return;
    const ended = endRun(game);
    try {
      await saveActiveRun(ended);
      setGame(ended);
    } catch (error) {
      console.error(error);
      setSaveMessage('Could not end and save the run. Try again.');
    }
  };

  useEffect(() => {
    if (!metaLoaded || rewardingRef.current || game?.runStatus !== 'ended' || game.metaRewardClaimed || !game.runSummary) return;
    rewardingRef.current = true;
    const claimedGame = { ...game, metaRewardClaimed: true };
    const nextMeta = { ...metaProfile, currency: metaProfile.currency + game.runSummary.metaReward, completedRuns: (metaProfile.completedRuns ?? 0) + 1 };
    Promise.all([saveActiveRun(claimedGame), saveMetaProfile(nextMeta)]).then(() => { setGame(claimedGame); setMetaProfile(nextMeta); }).catch(console.error).finally(() => { rewardingRef.current = false; });
  }, [game, metaLoaded, metaProfile]);

  const toggleLanguage = () => setLanguage((value) => value === 'id' ? 'en' : 'id');
  const preGameMenu = <PreGameMenu theme={theme} onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} language={language} onToggleLanguage={toggleLanguage} />;
  if (!game && setupDraft) return <>{preGameMenu}<FoundingSetup draft={setupDraft} metaProfile={metaProfile} onUnlockBonus={unlockBonus} onComplete={completeSetup} onCancel={() => setSetupDraft(null)} /></>;
  if (!game) return <>{preGameMenu}<StartScreen saves={saves} onStart={start} onLoad={load} /></>;
  if (game.runStatus === 'ended') return <><PreGameMenu theme={theme} onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} language={language} onToggleLanguage={toggleLanguage} /><RunEndScreen game={game} onNewRun={async () => { await deleteActiveRun(); setSaves([]); setGame(null); }} /></>;

  return <AppShell game={game} activeView={activeView} setActiveView={setActiveView} onAdvance={advance} onNewRun={() => setGame(null)} onEndRun={finishRun} onManualSave={manualSave} onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} onToggleLanguage={toggleLanguage} advancing={advancing} manualSaving={manualSaving} saveMessage={saveMessage} theme={theme} language={language}>
    {activeView === 'dashboard' ? <Dashboard game={game} setView={setActiveView} selectedMember={selectedMember} setSelectedMember={setSelectedMember} /> : null}
    {activeView === 'schedule' ? <Schedule game={game} setGame={setGame} selectedMember={selectedMember} setSelectedMember={setSelectedMember} /> : null}
    {activeView === 'roster' ? <Roster game={game} selectedMember={selectedMember} setSelectedMember={setSelectedMember} /> : null}
    {activeView === 'campaigns' ? <Campaigns game={game} setGame={setGame} selectedMember={selectedMember} setSelectedMember={setSelectedMember} onRenovate={renovate} /> : null}
    {activeView === 'finance' ? <FinanceDashboard game={game} /> : null}
    {activeView === 'history' ? <HistoryView game={game} /> : null}
    {activeView === 'wiki' ? <Wiki game={game} /> : null}
    {activeView === 'saves' ? <Saves game={game} activeSave={saves[0]} onLoad={load} onDelete={remove} /> : null}
    {statisticsReport ? <StatisticsModal report={statisticsReport.weekly} monthlyReport={statisticsReport.monthly} onClose={() => setStatisticsReport(null)} /> : null}
    {!statisticsReport && graduationAlert ? <GraduationModal graduation={graduationAlert} member={game.members.find((member) => member.id === graduationAlert.memberId)} onClose={() => setGraduationAlert(null)} /> : null}
  </AppShell>;
}
