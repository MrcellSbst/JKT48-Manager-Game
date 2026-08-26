import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('graduation Save plan action is imported into App', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const engineImport = source.match(/import \{([^}]+)\} from '\.\/engine\/gameEngine\.js';/s)?.[1] ?? '';
  assert.match(engineImport, /\bprepareGraduation\b/);
  assert.match(source, /prepareGraduation\(current, graduation\.id, options\)/);
});

test('browser runtime avoids Array.toSorted for older iOS Safari', async () => {
  const sources = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/engine/gameEngine.js', import.meta.url), 'utf8'),
  ]);
  sources.forEach((source) => assert.doesNotMatch(source, /\.toSorted\s*\(/));
});

test('Schedule exposes separate select and unselect all actions', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /const selectAllMembers = \(\) => setBatchMemberIds\(selectableMemberIds\)/);
  assert.match(source, /const unselectAllMembers = \(\) => setBatchMemberIds\(\[\]\)/);
  assert.match(source, /onClick=\{unselectAllMembers\}>\{t\('Unselect all'\)\}/);
});

test('full Theater and Off-air Fill controls clear their matching lineup', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(selectedIds\.size >= 12\)/);
  assert.match(source, /if \(schedule\[key\] === activityId\) delete schedule\[key\]/);
  assert.doesNotMatch(source, /disabled=\{(?:theaterCounts|offAirCounts)\[day\] === 12\}/);
  assert.match(source, /toggleRequiredLineup\(day, 'theater'\)/);
  assert.match(source, /toggleRequiredLineup\(day, 'offAir'\)/);
});

test('Theater and Off-air Fill exclude injured and unavailable members', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /const isEligibleForLineup = \(item\) => canMemberPerform\(item, activityId\)/);
  assert.match(source, /item\.canPerformTheater !== false/);
  assert.match(source, /!item\.temporarilyUnavailable/);
  assert.match(source, /if \(schedule\[key\] === activityId && !isEligibleForLineup\(item\)\) delete schedule\[key\]/);
});

test('Roster never renders legacy graduated members', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /const rosterMembers = useMemo\(\(\) => game\.members\.filter\(\(member\) => member\.status !== 'graduated'\)/);
  assert.match(source, /const selected = rosterMembers\.find\(\(member\) => member\.id === selectedMember\)/);
});

test('founding member selection filters by generation beside search', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /const \[generationFilter, setGenerationFilter\] = useState\('all'\)/);
  assert.match(source, /member\.generation !== generationFilter/);
  assert.match(source, /aria-label="Filter founding members by generation"/);
  assert.match(source, /<option value="all">All generations<\/option>/);
});

test('MV lineup dropdowns stay editable and swap occupied positions', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /\{ year: selectedRelease\.year, week: selectedRelease\.targetWeek \}/);
  assert.doesNotMatch(source, /const eligibilityDate = selectedRelease \?\?/);
  assert.match(source, /const selectMvPosition = \(positionIndex, memberId\) =>/);
  assert.match(source, /\[next\[positionIndex\], next\[occupiedIndex\]\] = \[next\[occupiedIndex\], next\[positionIndex\]\]/);
  assert.match(source, /onChange=\{\(event\) => selectMvPosition\(0, event\.target\.value\)\}/);
  assert.match(source, /onChange=\{\(event\) => selectMvPosition\(index \+ 1, event\.target\.value\)\}/);
  assert.match(source, /disabled=\{!eligibleMemberIds\.has\(member\.id\)\}/);
  assert.doesNotMatch(source, /eligibleMembers\.length > 12 \? <div className="mv-roster-select">/);
  assert.doesNotMatch(source, /className="mv-auto-lineup"/);
});

test('MV Auto Fill uses shared 50/50 ranking and mobile review remains scrollable', async () => {
  const [app, css, sorter] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/engine/memberSort.js', import.meta.url), 'utf8'),
  ]);
  assert.match(sorter, /getMemberSelectionScore/);
  assert.match(sorter, /getMemberOverall\(member\) \+ Number\(member\.popularity/);
  assert.match(app, /const autoFillMv = \(\) =>/);
  assert.match(app, /const lineup = rankedEligibleMembers\.slice\(0, 12\)/);
  assert.match(app, /onClick=\{autoFillMv\}/);
  assert.match(css, /\.production-confirm\{max-height:calc\(100dvh - 40px\);overflow-y:auto;overscroll-behavior:contain/);
  assert.match(css, /\.production-confirm \.confirm-week-actions\{position:sticky/);
});

test('dark theme keeps shared surfaces tied to active theme tokens', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /--surface:var\(--paper\)/);
  assert.match(css, /--panel:var\(--paper\)/);
  assert.match(css, /--text:var\(--ink\)/);
  assert.match(css, /--accent:var\(--red\)/);
  assert.match(css, /--danger:var\(--critical\)/);
  assert.match(css, /\.major-campaign-config select\{[^}]*background:var\(--paper\);color:var\(--ink\)/);
  assert.match(css, /\.campaign-bracket-preview\{background:var\(--ink\);color:var\(--paper\)\}:root\[data-theme='dark'\] \.campaign-bracket-preview\{background:#090908;color:#f2f2ee\}/);
});

test('schedule history year control is grouped as a responsive themed field', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.schedule-history-view-switcher>label\{display:flex;align-items:center/);
  assert.match(css, /\.schedule-history-view-switcher>label select\{height:32px/);
  assert.match(css, /@media\(max-width:560px\)\{\.schedule-history-view-switcher>label\{margin-left:0;width:100%/);
});

test('Training exposes search, roster filters, availability, stat sorting, and persistent batch selection', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /const \[trainingQuery, setTrainingQuery\] = useState\(''\)/);
  assert.match(source, /const \[trainingGeneration, setTrainingGeneration\] = useState\('all'\)/);
  assert.match(source, /const \[trainingRosterStatus, setTrainingRosterStatus\] = useState\('all'\)/);
  assert.match(source, /const \[trainingAvailability, setTrainingAvailability\] = useState\('all'\)/);
  assert.match(source, /projectedEnergy: projectedEnergyByMember\[item\.id\]/);
  assert.match(source, /plannedSessions: game\.trainingPlans\?\.\[item\.id\]\?\.length/);
  assert.match(source, /visibleTrainingMembers\.map/);
  assert.match(source, /batchMemberSet\.has\(item\.id\)/);
  assert.match(source, /No members match/);
});

test('Schedule templates store theater setlists and centers without one-off show flags', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /const theaterPlans = Object\.fromEntries/);
  assert.match(source, /\{ setlistId, centerId \}/);
  const createTemplateSource = source.slice(source.indexOf('const createTemplate = () =>'), source.indexOf('const applySelectedTemplate = () =>'));
  assert.doesNotMatch(createTemplateSource, /isSeitansai|isLastShow|seitansaiMemberId|lastShowMemberId/);
});

test('Wiki documents every run-ending threshold and counter reset', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /text\('Run-ending conditions', 'Kondisi akhir permainan'\)/);
  assert.match(source, /four consecutive resolved weeks with negative cash, Fan Trust below 5, or Reputation below 5/);
  assert.match(source, /eight consecutive resolved weeks below 20,000 fans/);
  assert.match(source, /fewer than \$\{BALANCE\.theaterMinimumMembers\} theater-eligible members/);
  assert.match(source, /more than \$\{BALANCE\.salary\.unpaidMonthsToEnd\} months of unpaid current salary/);
  assert.match(source, /resets that condition's consecutive-week counter/);
});

test('Command Center renders localized run-ending risk warnings', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /function RunEndRiskWarnings\(\{ game, language = 'en' \}\)/);
  assert.match(source, /const warnings = getRunEndWarnings\(game\)/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /<RunEndRiskWarnings game=\{game\} language=\{language\} \/>/);
  assert.match(source, /Peringatan risiko akhir permainan/);
});

test('Campaign UI explains annual campaign and mutual MV locks', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /const blockReason = getMajorCampaignStartBlockReason\(game\)/);
  assert.match(source, /A major campaign has already run in Year/);
  assert.match(source, /Finish .* before starting a major campaign/);
  assert.match(source, /const activeMajorCampaign = isMajorCampaignActive\(game\)/);
  assert.match(source, /Finish the current major campaign before producing a regular MV/);
  assert.match(source, /singleProjectBlocked/);
  assert.match(source, /Only one Sousenkyo, Request Hour, or Janken can run in a calendar year/);
  assert.match(source, /const singleBlockReason =/);
  assert.match(source, /const concertBlockReason =/);
  assert.match(source, /const auditionBlockReason =/);
  assert.match(source, /const blockerReason = conflicts\[0\]/);
  assert.match(source, /You choose when to hold it\. Current date/);
  assert.match(source, /className="campaign-block-reason" role="status"/);
});

test('year-end event Review checks the full target month', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /const selectedMgWeek = mgWeeks\.includes\(requestedMgWeek\) \? requestedMgWeek : \(?mgWeeks\[0\] \?\? null\)?/);
  assert.match(source, /const selectedAnniversaryWeek = anniversaryWeeks\.includes\(requestedAnniversaryWeek\) \? requestedAnniversaryWeek : \(?anniversaryWeeks\[0\] \?\? null\)?/);
  assert.match(source, /const mgWeek = selectedMgWeek/);
  assert.match(source, /const anniversaryWeek = selectedAnniversaryWeek/);
  assert.match(source, /week: selectedMgWeek,\s*type: 'yearEndMeetGreet',\s*day: mgDay,\s*monthScope: true/);
  assert.match(source, /week: selectedAnniversaryWeek,\s*type: 'concert',\s*days: \[anniversaryDay, 'Tue', 'Thu'\],\s*monthScope: true/);
  assert.match(source, /scheduleYearEndMeetGreet\(current, selectedMgWeek, mgDay, current\.week(?:, \{\}, mgTitle)?\)/);
  assert.match(source, /announceAnniversaryConcert\(current, selectedAnniversaryWeek, anniversaryDay/);
  assert.match(source, /memberCanPerformOnCampaignDate\(game, member, activityId, game\.year, targetWeek\)/);
  assert.match(source, /if \(!venues\.some\(\(venue\) => venue\.id === anniversaryVenue\)\) setAnniversaryVenue\(venues\[0\]\?\.id \?\? ''\)/);
  assert.match(source, /selectedAnniversaryVenue\?\.id \?\? anniversaryVenue/);
});

test('setup rebuilds preserve difficulty and per-run stat salt', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /createGame\(current\.seed, scope, current\.hardMode, \{ runSalt: current\.runSalt \}\)/);
  assert.match(source, /createGame\(current\.seed, current\.rosterScope \?\? 'active', hardMode, \{ runSalt: current\.runSalt \}\)/);
});

test('ended local runs reopen their summary and are not offered as resumable saves', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /const activeSave = saves\.find\(\(save\) => save\.state\?\.runStatus !== 'ended'\)/);
  assert.match(source, /const endedRun = normalized\?\.state\.runStatus === 'ended'/);
  assert.match(source, /if \(endedRun \|\| storageRevision > 0\)/);
  assert.match(source, /setSaves\(normalized && !endedRun \? \[normalized\] : \[\]\)/);
  assert.match(source, /await saveActiveRun\(ended\);\s+setSaves\(\[\]\);\s+setGame\(ended\)/);
});

test('fan-event History keeps legacy grouping and renders custom titles verbatim', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /event\.eventId \?\? \(status === 'scheduled' \? event\.id : null\) \?\? `\$\{year\}-\$\{week\}-\$\{event\.type\}`/);
  assert.match(source, /event\.customTitle \? event\.title : t\(/);
});

test('member cards grow with copy and Training keeps a taller desktop member rail', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.founding-member-grid\{grid-auto-rows:360px/);
  assert.match(css, /\.member-card \.card-body\{flex:1;min-width:0;display:flex;flex-direction:column\}/);
  assert.match(css, /\.training-layout\{min-height:760px\}\.training-member-rail\{max-height:calc\(100dvh - 130px\)\}/);
  assert.match(css, /@media\(max-width:820px\)\{\.training-layout\{min-height:0\}/);
});

test('fan-event warning trusts the concrete campaign conflict type', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('const blockerReason = conflicts[0]');
  const blocker = source.slice(start, source.indexOf(';', start));
  assert.ok(start >= 0);
  assert.doesNotMatch(blocker, /meetGreetUsed/);
});

test('starting a new year persists locally before its dedicated cloud checkpoint', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('const applySettlementAction');
  const block = source.slice(start, source.indexOf('const renovate =', start));
  assert.match(block, /const startedNewYear = Boolean\(game\.pendingYearEndSettlement\)/);
  assert.match(block, /await saveActiveRun\(next\);[\s\S]*const verifiedLocal = await loadActiveRun\(\);[\s\S]*canonicalJson\(verifiedLocal\.state\) !== canonicalJson\(next\)[\s\S]*setGame\(next\);/);
  assert.match(block, /if \(startedNewYear && user\)[\s\S]*await pushSave\('new-year'\)/);
  assert.match(block, /New year saved locally, but cloud sync failed/);
});
