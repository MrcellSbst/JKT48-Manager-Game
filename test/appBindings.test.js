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
});
