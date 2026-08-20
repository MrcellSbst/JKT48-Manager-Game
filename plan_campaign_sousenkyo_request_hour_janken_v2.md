# Campaign System Plan — Sousenkyo, Request Hour, and Janken

## Goal

Implement three major campaign types under the existing **Campaign** system:

1. **Sousenkyo (SSK)**
2. **Request Hour (RH)**
3. **Janken Tournament**

These campaigns are not held together every year.

They rotate yearly:

```text
Year N     -> Sousenkyo
Year N + 1 -> Request Hour
Year N + 2 -> Janken
Year N + 3 -> Sousenkyo
Year N + 4 -> Request Hour
Year N + 5 -> Janken
...
```

Short form:

```text
SSK -> RH -> Janken -> repeat
```

Only one of these three major campaigns should run in a given year.

The campaign for the next year must be configurable during the previous year.

---

# Core Design Principles

The three campaigns share:

```text
Campaign lifecycle
Yearly rotation
Year-ahead configuration
8-16 week campaign/voting duration
Live campaign status
Vote/support accumulation
Voting revenue
Campaign history
MV reward integration
Song catalog integration
```

But they remain mechanically different:

```text
Sousenkyo
= member popularity election

Request Hour
= song popularity election

Janken
= random rock-paper-scissors tournament
```

---

# Canonical Song Source

All three campaign types must use:

```text
@DreamSetlist_Songs.js
```

as the canonical source of song data.

This applies to:

```text
Sousenkyo
Request Hour
Janken
```

Do not create a separate campaign-only song database.

Codex must inspect the actual exports and structure of:

```text
@DreamSetlist_Songs.js
```

before implementing campaign song selection.

Do not invent duplicate fields if the file already contains:

```text
song id
title
localized title
setlist
metadata
availability
group
center
unit data
```

Use stable song IDs/references wherever possible.

---

# Campaign Rotation

Recommended:

```js
export const CAMPAIGN_ROTATION = Object.freeze([
  'sousenkyo',
  'request-hour',
  'janken',
]);
```

Example helper:

```js
export function getCampaignTypeForYear(
  year,
  firstCampaignYear = 2
) {
  if (year < firstCampaignYear) return null;

  const offset = year - firstCampaignYear;
  const index = offset % CAMPAIGN_ROTATION.length;

  return CAMPAIGN_ROTATION[index];
}
```

Example:

```text
firstCampaignYear = 2

Year 1 -> none
Year 2 -> Sousenkyo
Year 3 -> Request Hour
Year 4 -> Janken
Year 5 -> Sousenkyo
```

Keep the first campaign year configurable.

Do not hard-code the rotation in multiple places.

---

# One Major Campaign Per Year

Default rule:

```text
Maximum active rotating major campaign per year:
1
```

The player should not be able to run:

```text
Sousenkyo + Request Hour
```

or:

```text
Request Hour + Janken
```

in the same year under normal gameplay.

The campaign type is determined by the rotation.

---

# Configure Campaign One Year Before

The campaign for Year N must be configurable during Year N-1.

Example:

```text
Year 2:
Sousenkyo runs

During Year 2:
Player configures Year 3 Request Hour

Year 3:
Request Hour runs

During Year 3:
Player configures Year 4 Janken

Year 4:
Janken runs
```

Recommended fields:

```js
{
  campaignYear: 3,
  configuredInYear: 2,

  type: 'request-hour',

  startWeek: 9,
  durationWeeks: 12,
  resultWeek: 21,

  budget: 0,

  configured: true,
}
```

The exact available configuration fields should follow existing Campaign UI patterns.

Possible player-configurable settings:

```text
Campaign start week
Campaign duration
Campaign budget
Promotion intensity
Production budget
Result event budget
```

Do not let the player change the campaign type unless the game later explicitly adds custom rotation.

---

# Campaign Duration

Campaign voting/support period must be:

```text
Minimum:
8 weeks

Maximum:
16 weeks
```

Recommended constant:

```js
export const CAMPAIGN_DURATION_LIMITS = Object.freeze({
  minWeeks: 8,
  maxWeeks: 16,
});
```

Clamp invalid values.

Example:

```js
function clampCampaignDuration(value) {
  return Math.max(
    CAMPAIGN_DURATION_LIMITS.minWeeks,
    Math.min(
      CAMPAIGN_DURATION_LIMITS.maxWeeks,
      value
    )
  );
}
```

Example configurations:

```text
8 weeks
10 weeks
12 weeks
14 weeks
16 weeks
```

---

# Janken Duration Clarification

Janken does not use votes to decide who wins matches.

However, Janken still uses an:

```text
8-16 week Campaign period
```

for:

```text
registration
promotion
fan support
campaign participation
campaign revenue
bracket buildup
event hype
```

The final tournament result remains pure rock-paper-scissors RNG.

---

# Campaign Lifecycle

Recommended shared status values:

```text
configured
announced
registration
active
locked
result
mv-production
completed
cancelled
```

Not every campaign needs every phase.

Example:

```text
Sousenkyo

configured
-> announced
-> registration
-> active voting
-> locked
-> result
-> MV reward
-> completed
```

```text
Request Hour

configured
-> announced
-> active voting
-> locked
-> result
-> 4-week MV production
-> completed
```

```text
Janken

configured
-> announced
-> registration
-> active campaign
-> tournament
-> result
-> MV reward
-> completed
```

Use existing naming if Campaign already has a lifecycle convention.

---

# Shared Campaign Record

Recommended conceptual shape:

```js
{
  id: 'campaign-id',

  type: 'sousenkyo',

  campaignYear: 5,
  configuredInYear: 4,

  status: 'active',

  startWeek: 8,
  durationWeeks: 12,
  endWeek: 19,
  resultWeek: 20,

  budget: 0,
  spent: 0,

  totalVotes: 0,
  votingRevenue: 0,

  participants: [],
  liveStandings: [],
  result: null,

  rewardSongId: null,
  mvProjectId: null,

  history: [],
}
```

Adapt this to existing save structure rather than introducing duplicate state.

---

# ============================================================
# VOTING / SUPPORT REVENUE
# ============================================================

All three campaigns generate money from fan voting/support participation.

Revenue per vote/support unit:

```text
5,000 to 10,000
```

The value depends on:

```text
Fan Trust
Reputation
```

Higher Fan Trust and Reputation:

```text
closer to 10,000 per vote
```

Lower Fan Trust and Reputation:

```text
closer to 5,000 per vote
```

---

# Revenue Per Vote Formula

Use the real stat ranges already present in the engine.

Do not assume both stats are 0-100 without checking.

Concept:

```js
const trustNormalized = normalize(
  fanTrust,
  FAN_TRUST_MIN,
  FAN_TRUST_MAX
);

const reputationNormalized = normalize(
  reputation,
  REPUTATION_MIN,
  REPUTATION_MAX
);

const campaignQuality =
  (trustNormalized + reputationNormalized) / 2;

const revenuePerVote =
  Math.round(
    5000 + campaignQuality * 5000
  );
```

Clamp:

```js
const clampedRevenuePerVote = Math.max(
  5000,
  Math.min(
    10000,
    revenuePerVote
  )
);
```

---

# Campaign Revenue Tick

Every time campaign votes/support are generated:

```js
const revenue =
  generatedVotes * revenuePerVote;
```

Update:

```text
campaign.totalVotes
campaign.votingRevenue
player/group money
```

Use the existing finance transaction/history system if available.

Do not directly mutate money if the game normally uses a finance helper.

---

# Revenue Applies To All Three

## Sousenkyo

Votes are assigned to:

```text
members
```

Votes affect the election ranking.

---

## Request Hour

Votes are assigned to:

```text
songs
```

Votes affect the song ranking.

---

## Janken

Fan support/votes generate:

```text
campaign revenue
fan engagement
campaign activity
```

But:

```text
Janken support votes DO NOT influence match results.
```

This is critical.

---

# Vote Generation

Vote/support generation should scale from existing game factors.

Possible inputs:

```text
group fanbase
Fan Trust
Reputation
Public Awareness
campaign budget
campaign promotion
member/song appeal
campaign duration
```

Do not invent a new global fan system if existing fanbase values already exist.

Example conceptual model:

```js
votesThisWeek =
  baseVoteGeneration
  * fanbaseFactor
  * trustFactor
  * reputationFactor
  * campaignFactor;
```

Then distribute those votes according to each campaign's rules.

---

# ============================================================
# LIVE CAMPAIGN STATUS
# ============================================================

The Campaign page must show the current running state.

The user must be able to see live standings/status while the campaign is active.

Do not only show final results.

---

# Shared Campaign Page Status

Show:

```text
Campaign
Year
Status
Start week
End week
Current week
Weeks elapsed
Weeks remaining
Total votes/support
Current revenue per vote
Total voting revenue
```

Example:

```text
SOUSENKYO — YEAR 5

Voting Open

Week:
7 / 12

Total Votes:
128,440

Revenue Per Vote:
8,100

Voting Revenue:
1,040,364,000
```

Use the game's actual currency formatting.

---

# Sousenkyo Live Standings

Display:

```text
Rank
Member
Current votes
Rank movement
```

Example:

```text
1. Member A   18,421   ▲2
2. Member B   17,980   ▼1
3. Member C   16,771   -
4. Member D   14,290   ▲4
```

Optional additional display:

```text
Senbatsu line
Undergirls line
```

Example:

```text
1-12
SENBATSU

13-24
UNDERGIRLS
```

Only show the Undergirls marker if:

```text
participant count >= 24
```

---

# Request Hour Live Standings

Display:

```text
Rank
Song
Current votes
Rank movement
```

Example:

```text
1. Song A   24,201   ▲1
2. Song B   23,876   ▼1
3. Song C   20,104   -
```

All song names must resolve from:

```text
@DreamSetlist_Songs.js
```

---

# Janken Live Status

Before tournament:

```text
Registered members
Campaign/support total
Voting revenue
Campaign weeks remaining
Bracket status
```

During tournament:

```text
Current round
Remaining members
Completed matches
Bracket
```

After result:

```text
Winner
Runner-up
Top finishers
MV reward song
```

Do not show a fake popularity ranking as if it determines match winners.

---

# Campaign Page Performance

Do not recompute all historical votes from scratch on every UI render.

Store/update:

```text
liveStandings
currentVoteTotals
rankMovement
campaignRevenue
```

when the campaign engine advances.

The UI should mostly read existing campaign state.

---

# ============================================================
# SOUSENKYO
# ============================================================

# Concept

Sousenkyo is the annual rotating **member election**.

Fans vote for individual members.

Ranking should primarily reflect:

```text
Member popularity
Fan support
Recent activity
Recent exposure
Campaign momentum
Reputation
Random variance
```

The player influences the campaign environment but should not directly select the winner.

---

# Sousenkyo Rotation

Sousenkyo appears once every three years:

```text
SSK
-> next year RH
-> next year Janken
-> next year SSK
```

---

# Sousenkyo Voting Period

Use the shared configurable:

```text
8-16 weeks
```

During active voting:

```text
votes accumulate every campaign tick/week
rank changes can occur
campaign revenue is generated
```

---

# Sousenkyo Eligibility

Eligible members:

```text
active
not graduated
not terminated
not unavailable for the entire campaign
```

Suspension behavior should use existing member availability rules.

Do not duplicate suspension logic inside SSK.

---

# Sousenkyo Vote Score

Suggested concept:

```js
memberVoteWeight =
  popularityWeight
  * memberSupportWeight
  * exposureWeight
  * campaignMomentumWeight
  * reputationWeight
  * randomVariance;
```

Do not allow campaign money to guarantee #1.

---

# Sousenkyo Campaign Actions

Possible promotion actions:

```text
SNS Promotion
Magazine Feature
Special Livestream
Campaign Poster
Member Interview
Mini Fan Event
```

Reuse existing activity systems where practical.

Campaign actions may affect:

```text
vote weight
public awareness
energy
money
campaign momentum
```

---

# Sousenkyo Live Ranking

Store live vote totals.

Example:

```js
{
  memberId: 'member-id',
  votes: 18241,
  rank: 1,
  previousRank: 3,
  movement: 2,
}
```

---

# Sousenkyo Final Ranking Groups

Required:

```text
Rank 1-12:
Senbatsu

Rank 13-24:
Undergirls
```

But Undergirls only exists when there are enough members.

Rule:

```text
If participant count >= 24:
13-24 = Undergirls

If participant count < 24:
NO Undergirls
```

Do not create partial Undergirls.

---

# Examples

## 8 participants

```text
1-8:
Senbatsu

Undergirls:
none
```

---

## 18 participants

```text
1-12:
Senbatsu

13-18:
normal ranked members

Undergirls:
none
```

---

## 24 participants

```text
1-12:
Senbatsu

13-24:
Undergirls
```

---

## 30 participants

```text
1-12:
Senbatsu

13-24:
Undergirls

25-30:
normal ranked members
```

---

# Sousenkyo Center

Rank #1 becomes:

```text
Sousenkyo Center
```

---

# Sousenkyo MV Reward

Sousenkyo gives an MV reward.

The system randomly selects the MV song from:

```text
@DreamSetlist_Songs.js
```

The player does not manually choose the song.

Pseudo:

```js
const eligibleSongs =
  getEligibleCampaignSongsFromDreamSetlist();

const selectedSong =
  randomChoice(eligibleSongs, rng);
```

Use seeded RNG if the engine supports deterministic randomness.

---

# Sousenkyo MV Lineup

Recommended:

```text
Center:
Rank #1

Main lineup:
Rank #1-12 Senbatsu
```

Use the existing MV lineup system.

Do not create a separate MV implementation if one already exists.

---

# Sousenkyo Result Record

Example:

```js
{
  memberId: '...',
  rank: 1,
  votes: 142221,

  previousRank: 4,
  movement: 3,

  group: 'senbatsu',
}
```

For ranks 13-24 when enough members exist:

```js
group: 'undergirls'
```

Otherwise:

```js
group: null
```

---

# Sousenkyo History

Store:

```text
Year
Member
Rank
Votes
Rank movement
Senbatsu status
Undergirls status
Center
Reward MV song
```

Member profile may later display:

```text
Y2  #11
Y5  #4
Y8  #1
```

---

# Sousenkyo Campaign Template

```js
{
  id: 'sousenkyo',
  type: 'sousenkyo',

  title: 'Sousenkyo',
  titleId: 'Sousenkyo',

  description:
    'Fans vote for members to determine the campaign ranking, Senbatsu, Undergirls, and center.',

  descriptionId:
    'Penggemar memberikan suara kepada member untuk menentukan peringkat kampanye, Senbatsu, Undergirls, dan center.',
}
```

---

# ============================================================
# REQUEST HOUR
# ============================================================

# Concept

Request Hour is the rotating **song election campaign**.

Fans vote for songs.

Unlike Sousenkyo:

```text
SSK:
member voting

RH:
song voting
```

---

# Request Hour Song Pool

All RH songs come from:

```text
@DreamSetlist_Songs.js
```

This is mandatory.

Do not build the RH pool from a separate file.

Codex must inspect the file and use its existing IDs/metadata.

---

# Request Hour Eligibility

Use existing song metadata where possible.

Potential rules:

```text
valid song entry
available/unlocked in current run
not disabled
not removed
```

Only apply filters supported by actual data.

Do not invent fake properties.

---

# Request Hour Rotation

RH appears one year after SSK:

```text
SSK
-> RH
-> Janken
```

Then repeats every three years.

---

# Request Hour Voting Duration

Configurable:

```text
8-16 weeks
```

Votes accumulate during the active campaign.

---

# Request Hour Vote Weight

Suggested factors:

```text
song popularity
recent performances
theater use
single/MV exposure
fan familiarity
nostalgia
center/member association
campaign promotion
random variance
```

Use existing song performance/history data where possible.

---

# Request Hour Live Ranking

Campaign page shows:

```text
Rank
Song
Votes
Rank movement
```

All song names/IDs resolve from:

```text
@DreamSetlist_Songs.js
```

---

# Request Hour Result

Final ranking example:

```text
#1 Song A
#2 Song B
#3 Song C
...
```

Store:

```text
rank
songId
votes
previousRank
movement
```

---

# Request Hour #1 Reward

The #1 song gets an MV.

The winning song is already known.

Therefore RH does NOT randomly choose a reward song.

Use:

```text
Request Hour rank #1 song
```

from:

```text
@DreamSetlist_Songs.js
```

---

# Request Hour MV Production

Required:

```text
4 weeks
```

Recommended constant:

```js
export const REQUEST_HOUR_MV_PRODUCTION_WEEKS = 4;
```

Flow:

```text
RH voting closes
-> final ranking generated
-> #1 song selected
-> MV production starts
-> MV takes 4 weeks
-> MV completes
-> campaign can fully complete
```

---

# MV Integration

If the existing MV system supports production duration:

```js
createMVProject({
  songId: winningSongId,
  productionWeeks: 4,
});
```

Use it.

Do not build a second RH-only MV production engine.

---

# Request Hour Performer Selection

Use existing song/member metadata where practical.

Potential sources:

```text
original center
original lineup
current lineup
existing unit data
```

If graduated/inactive members cannot participate:

use existing substitution logic.

Do not resurrect unavailable members automatically.

---

# Request Hour Campaign Template

```js
{
  id: 'request-hour',
  type: 'request-hour',

  title: 'Request Hour',
  titleId: 'Request Hour',

  description:
    'Fans vote for songs from the group catalog, with the #1 song receiving a new MV.',

  descriptionId:
    'Penggemar memilih lagu dari katalog grup, dan lagu peringkat #1 mendapatkan MV baru.',
}
```

---

# ============================================================
# JANKEN
# ============================================================

# Concept

Janken is the rotating rock-paper-scissors tournament.

Unlike SSK and RH:

```text
Popularity does not determine the winner.
Votes do not determine the winner.
Fan Trust does not determine the winner.
Reputation does not determine the winner.
```

Match results are determined only by Janken RNG.

---

# Janken Rotation

Janken appears:

```text
one year after RH
```

Cycle:

```text
SSK
-> RH
-> Janken
-> SSK
```

---

# Janken Campaign Duration

The campaign/support period lasts:

```text
8-16 weeks
```

This period generates:

```text
fan engagement
support votes
money
promotion
bracket hype
```

But does not influence match outcomes.

---

# Janken Eligibility

Eligible:

```text
active members
not graduated
not terminated
available for the result event
```

Use existing suspension/availability rules.

---

# Janken Bracket

Support any roster size.

Examples:

```text
12
16
21
24
30
32
37
```

Use byes where necessary.

Do not require powers of two.

---

# Janken Seeding

Default:

```text
random
```

Do not seed based on:

```text
popularity
fanbase
rank
center status
Senbatsu history
```

---

# Janken Match Logic

Choices:

```text
rock
paper
scissors
```

Rules:

```text
rock beats scissors
scissors beats paper
paper beats rock
```

Tie:

```text
replay
```

---

# Janken RNG

Use the game's seeded RNG/helper if one exists.

Avoid uncontrolled:

```js
Math.random()
```

if deterministic tests/saves require seeded randomness.

---

# Janken Match Record

Recommended:

```js
{
  round: 1,

  memberAId: '...',
  memberBId: '...',

  memberAChoice: 'rock',
  memberBChoice: 'scissors',

  winnerId: '...',

  replayCount: 0,
}
```

---

# Janken Live Campaign Status

Before tournament:

```text
Registered Members
Campaign Week
Fan Support
Voting Revenue
Tournament Date
```

During tournament:

```text
Current Round
Remaining Members
Completed Matches
Bracket
```

After tournament:

```text
Winner
Runner-up
Top finishers
MV reward song
```

---

# Janken Winner Reward

Winner becomes:

```text
Janken Center
```

---

# Janken MV Reward

Janken gives an MV.

The system randomly chooses the MV song from:

```text
@DreamSetlist_Songs.js
```

Same rule as SSK.

Pseudo:

```js
const selectedSong =
  randomChoice(
    getEligibleCampaignSongsFromDreamSetlist(),
    rng
  );
```

---

# Janken MV Center

The Janken winner becomes the center of the reward MV.

Use the existing MV system.

---

# Janken Lineup

Optional recommendation:

```text
Top 12 tournament finishers
```

may be used as the reward MV lineup if the existing MV system needs a campaign lineup.

Do not force this if the current MV system already chooses supporting members another way.

---

# Janken Campaign Template

```js
{
  id: 'janken',
  type: 'janken',

  title: 'Janken Tournament',
  titleId: 'Turnamen Janken',

  description:
    'Members compete in a random rock-paper-scissors tournament for the center position of a special MV.',

  descriptionId:
    'Para member bertanding dalam turnamen batu-gunting-kertas acak untuk mendapatkan posisi center pada MV spesial.',
}
```

---

# ============================================================
# SHARED SONG HELPERS
# ============================================================

All three features should share song-selection helpers.

Recommended:

```js
function getEligibleCampaignSongsFromDreamSetlist() {
  // read/import actual DreamSetlist_Songs data
}
```

For random reward songs:

```js
function chooseRandomCampaignSong(rng) {
  const songs =
    getEligibleCampaignSongsFromDreamSetlist();

  return randomChoice(songs, rng);
}
```

Usage:

```text
SSK:
random campaign song

RH:
ranking uses DreamSetlist songs
#1 song gets MV

Janken:
random campaign song
```

Do not duplicate these helpers inside every engine.

---

# Song Save References

Prefer storing:

```text
songId
```

rather than copying the full song object into campaign saves.

On load:

```text
songId
-> resolve from @DreamSetlist_Songs.js
```

This avoids duplicated song metadata.

If the game's save format already snapshots song data, follow the existing pattern.

---

# ============================================================
# ENGINE / FILE STRUCTURE
# ============================================================

These campaign systems can become large.

If putting everything inside the current Campaign engine would make it too large, split the feature engines.

Recommended structure:

```text
campaignEngine.js
campaignEngine.test.js

campaigns/
  sousenkyoEngine.js
  sousenkyoEngine.test.js

  requestHourEngine.js
  requestHourEngine.test.js

  jankenEngine.js
  jankenEngine.test.js
```

Adapt names/paths to the repository convention.

---

# Shared campaignEngine Responsibilities

Keep shared logic here:

```text
campaign rotation
year-ahead configuration
campaign lifecycle
campaign duration
campaign start/end
vote/support generation
voting revenue
shared Campaign page data
history
save normalization
feature dispatch
```

---

# sousenkyoEngine Responsibilities

```text
member eligibility
member vote weighting
vote distribution
live rank calculation
Senbatsu
Undergirls
final result
SSK MV reward song selection
```

---

# requestHourEngine Responsibilities

```text
DreamSetlist song loading
RH song eligibility
song vote weighting
song vote distribution
live song ranking
final ranking
#1 song
4-week MV creation
```

---

# jankenEngine Responsibilities

```text
member registration
bracket generation
byes
RPS match RNG
match history
tournament progress
winner
Janken MV reward song selection
```

---

# Test File Split

If current campaign tests become too large, split them.

Recommended:

```text
campaignEngine.test.js
sousenkyoEngine.test.js
requestHourEngine.test.js
jankenEngine.test.js
```

If the repository stores tests under:

```text
test/
```

use that convention.

Example:

```text
test/campaignEngine.test.js
test/sousenkyoEngine.test.js
test/requestHourEngine.test.js
test/jankenEngine.test.js
```

Do not create a new test convention unnecessarily.

---

# ============================================================
# SHARED ENGINE FUNCTIONS
# ============================================================

Possible shared functions:

```js
getCampaignTypeForYear()

getNextYearCampaignType()

configureNextYearCampaign()

startCampaign()

advanceCampaign()

generateCampaignVotes()

calculateCampaignRevenuePerVote()

applyCampaignVotingRevenue()

getCampaignLiveStatus()

lockCampaign()

completeCampaign()
```

---

# Sousenkyo Functions

```js
createSousenkyo()

getEligibleSousenkyoMembers()

calculateSousenkyoVoteWeights()

generateSousenkyoVotes()

calculateSousenkyoStandings()

resolveSousenkyo()

buildSousenkyoGroups()

createSousenkyoMVReward()
```

---

# Request Hour Functions

```js
createRequestHour()

getRequestHourSongs()

calculateRequestHourVoteWeights()

generateRequestHourVotes()

calculateRequestHourStandings()

resolveRequestHour()

createRequestHourMV()
```

---

# Janken Functions

```js
createJankenCampaign()

createJankenBracket()

resolveJankenMatch()

advanceJankenRound()

resolveJankenTournament()

createJankenMVReward()
```

---

# ============================================================
# CAMPAIGN PAGE
# ============================================================

The Campaign page should have:

```text
Current Campaign
Next Year's Campaign
Campaign History
```

---

# Current Campaign

Show:

```text
Campaign name
Campaign type
Status
Current week
Duration
Weeks remaining
Votes/support
Revenue per vote
Total campaign revenue
Live ranking/bracket
```

---

# Next Year's Campaign

During Year N:

show configuration for:

```text
Year N+1
```

Example:

```text
NEXT YEAR CAMPAIGN

Request Hour

Start Week:
9

Duration:
12 weeks

Result Week:
21

Budget:
...
```

Campaign type is determined by rotation.

---

# Campaign History

Example:

```text
Year 2
Sousenkyo
Winner: Member A

Year 3
Request Hour
#1: Song B

Year 4
Janken
Winner: Member C

Year 5
Sousenkyo
Winner: Member D
```

Clicking the history record should show full result detail.

---

# ============================================================
# SAVE COMPATIBILITY
# ============================================================

New fields need safe defaults.

Example:

```js
campaignState:
  save.campaignState ?? null

campaignHistory:
  save.campaignHistory ?? []

nextCampaignConfig:
  save.nextCampaignConfig ?? null
```

Do not break old saves.

---

# Existing Campaign Save

If the game already stores Campaign state:

extend the existing structure.

Do not add a second parallel campaign save system.

---

# Song References

For all three campaigns:

```text
song IDs should resolve from @DreamSetlist_Songs.js
```

Handle missing song IDs safely.

Do not crash an old save if the song catalog changes.

---

# ============================================================
# TEST PLAN
# ============================================================

# Rotation Tests

Test:

```text
Year 2 -> SSK
Year 3 -> RH
Year 4 -> Janken
Year 5 -> SSK
Year 6 -> RH
Year 7 -> Janken
```

Also test custom:

```text
firstCampaignYear
```

---

# Year-Ahead Configuration Tests

Test:

```text
Year 2 can configure Year 3
Year 3 can configure Year 4
configured campaign persists after save/load
wrong campaign type cannot be configured for normal rotation
```

---

# Duration Tests

Test:

```text
7 weeks -> clamp/reject to 8
8 weeks -> valid
12 weeks -> valid
16 weeks -> valid
17 weeks -> clamp/reject to 16
```

Follow existing validation style.

---

# Campaign Revenue Tests

Test:

```text
revenue per vote >= 5000
revenue per vote <= 10000
```

Test low stats:

```text
low trust + low reputation
=> near 5000
```

Test high stats:

```text
high trust + high reputation
=> near 10000
```

Test:

```text
increasing trust does not reduce revenue-per-vote
increasing reputation does not reduce revenue-per-vote
```

Test:

```text
votes * revenuePerVote
= voting revenue
```

---

# Live Status Tests

Test:

```text
Campaign page data exposes:
status
current week
duration
votes
revenue
standings/bracket
```

---

# Sousenkyo Tests

Test:

```text
only eligible members participate
votes accumulate
live ranks update
final ranks are unique
```

Test group rules:

```text
8 members:
Senbatsu 1-8
no Undergirls

18 members:
Senbatsu 1-12
no Undergirls

24 members:
Senbatsu 1-12
Undergirls 13-24

30 members:
Senbatsu 1-12
Undergirls 13-24
25-30 no group
```

Test:

```text
rank #1 becomes center
```

Test:

```text
reward MV song comes from @DreamSetlist_Songs.js
```

Test seeded RNG:

```text
same seed
=> same random SSK MV song
```

---

# Request Hour Tests

Test:

```text
songs come from @DreamSetlist_Songs.js
```

Test:

```text
votes accumulate per song
live song ranking updates
final ranks are unique
#1 song is preserved
```

Test:

```text
#1 song creates MV production
MV duration = exactly 4 weeks
```

Test:

```text
winning song ID still resolves after save/load
```

---

# Janken Tests

Test RPS:

```text
rock beats scissors
scissors beats paper
paper beats rock
tie replays
```

Bracket sizes:

```text
12
13
16
21
24
30
32
37
```

Verify:

```text
one final winner
byes work
member cannot appear twice in same round
loser does not advance
winner advances
```

Critical fairness:

```text
popularity does not affect match result
fan votes do not affect match result
Fan Trust does not affect match result
Reputation does not affect match result
```

Test:

```text
fan support still generates voting revenue
```

Test:

```text
reward MV song comes from @DreamSetlist_Songs.js
```

Seeded RNG:

```text
same seed
=> same bracket/result/reward song
```

if that matches existing deterministic RNG behavior.

---

# ============================================================
# IMPLEMENTATION ORDER FOR CODEX
# ============================================================

1. Inspect the current Campaign system.

2. Inspect:

```text
@DreamSetlist_Songs.js
```

before implementing any song lookup.

3. Inspect:

```text
Fan Trust
Reputation
Money/finance helpers
RNG helper
MV production
Campaign UI
Save/load
```

4. Add campaign rotation:

```text
SSK -> RH -> Janken -> repeat
```

5. Add year-ahead campaign configuration.

6. Add configurable 8-16 week duration.

7. Add shared vote/support generation.

8. Add shared 5,000-10,000 voting revenue formula.

9. Add Campaign-page live-status data.

10. Split engine/test files if the current Campaign engine becomes too large.

11. Implement Sousenkyo.

12. Implement SSK live member rankings.

13. Implement SSK Senbatsu/Undergirls rules.

14. Implement random SSK MV song from:

```text
@DreamSetlist_Songs.js
```

15. Implement Request Hour using only:

```text
@DreamSetlist_Songs.js
```

for song data.

16. Add live RH song standings.

17. Make RH #1 create a 4-week MV.

18. Implement Janken bracket/RPS.

19. Ensure Janken campaign votes generate revenue but do not affect match RNG.

20. Implement random Janken MV song from:

```text
@DreamSetlist_Songs.js
```

21. Add campaign history.

22. Add/update tests.

23. Verify old saves.

24. Verify existing campaigns/events still work.

---

# ============================================================
# ACCEPTANCE CRITERIA
# ============================================================

The implementation is complete when:

## Rotation

- Only one SSK/RH/Janken campaign runs each year.
- Rotation is:

```text
SSK -> RH -> Janken -> repeat
```

- Rotation persists correctly across years.

---

## Configuration

- Next year's campaign can be configured during the current year.
- Configuration persists through save/load.
- Duration supports:

```text
8-16 weeks
```

---

## Song Source

- SSK uses songs from:

```text
@DreamSetlist_Songs.js
```

- RH uses songs from:

```text
@DreamSetlist_Songs.js
```

- Janken uses songs from:

```text
@DreamSetlist_Songs.js
```

- No duplicate campaign song catalog exists.

---

## Voting Revenue

- Campaign participation generates votes/support.
- Each vote/support generates:

```text
5,000-10,000
```

depending on Fan Trust and Reputation.
- Revenue is added through the existing economy system.

---

## Campaign Page

- Current campaign status is visible.
- User can see current vote totals.
- SSK shows member rankings.
- RH shows song rankings.
- Janken shows campaign status/bracket.
- Vote revenue is visible.

---

## Sousenkyo

- Members receive votes.
- Rank #1 becomes center.
- Rank 1-12 = Senbatsu.
- Rank 13-24 = Undergirls only when participant count is at least 24.
- There is no partial Undergirls.
- SSK reward MV song is randomly selected from `@DreamSetlist_Songs.js`.

---

## Request Hour

- Songs are loaded from `@DreamSetlist_Songs.js`.
- Songs receive votes.
- Live song rank is visible.
- Final #1 is stored.
- #1 song receives an MV.
- MV production takes exactly 4 weeks.

---

## Janken

- Members enter a random bracket.
- Non-power-of-two roster sizes work.
- Matches use actual RPS rules.
- Popularity does not influence match results.
- Votes do not influence match results.
- Janken campaign participation still generates revenue.
- Winner becomes Janken center.
- Reward MV song is randomly selected from `@DreamSetlist_Songs.js`.

---

## Architecture

- Shared Campaign logic remains centralized.
- SSK/RH/Janken logic may be split into dedicated engine files.
- Tests may be split into dedicated test files.
- No unnecessary duplicate campaign/song/MV systems are created.
- Old saves still load.

---

# ============================================================
# IMPORTANT NON-GOALS
# ============================================================

Do not change unrelated systems:

```text
theater member minimum
audition
graduation
drama
injury
energy recovery
normal concerts
M&G
VC
livestream economy
run-ending rules
fan target rules
```

Do not rebalance the entire game economy.

Do not allow campaign budget to guarantee an SSK/RH winner.

Do not allow votes to influence Janken matches.

Do not create a second song catalog.

Do not create a second MV engine.

Do not run all three campaigns in the same year.

---

# Final Design Summary

```text
YEAR N
SOUSENKYO

8-16 weeks
Member voting
Live member ranking
5k-10k revenue per vote

1-12:
Senbatsu

13-24:
Undergirls only if >=24 participants

Reward:
Random song from @DreamSetlist_Songs.js
-> MV
-> SSK #1 is center


YEAR N+1
REQUEST HOUR

8-16 weeks
Song voting
Songs from @DreamSetlist_Songs.js
Live song ranking
5k-10k revenue per vote

Reward:
#1 song
-> MV
-> 4 weeks production


YEAR N+2
JANKEN

8-16 week campaign buildup
Fan support/votes generate revenue
Votes do NOT affect tournament

Random RPS bracket

Reward:
Random song from @DreamSetlist_Songs.js
-> MV
-> Janken winner is center


THEN REPEAT

SSK -> RH -> Janken -> SSK -> RH -> Janken...
```

The campaign for the next year is configured during the current year.

All song-related campaign logic uses:

```text
@DreamSetlist_Songs.js
```

as the single canonical source.
