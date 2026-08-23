# JKT48 Roguelike Management Game — System Plan

## 1\. Game Concept

A roguelike idol-management simulation where the player manages JKT48 across multiple in-game years.

The current active JKT48 roster is used as the starting cast, but the game does **not** try to reproduce real-world member abilities, personalities, careers, or history.

Each save is an alternate timeline.

The main design principle is:

> Members provide the identity.  
> The simulation creates the story.

Most gameplay-facing member stats are randomized at the start of each run so the same roster can behave very differently between saves.

The game should focus on:

* roster management
* weekly scheduling
* member development
* energy/fatigue management
* theater scheduling
* singles and MVs
* concerts
* Meet \& Greet
* Video Call
* auditions
* graduations
* fan popularity
* fan trust
* management reputation
* procedural fan narratives
* rare drama/disruption events
* long-term generational turnover

The player should gradually create their own alternate JKT48 history.

\---

# 2\. Run Structure

Suggested baseline:

* 1 in-game year = 52 weeks
* 1 turn = 1 week
* Each week contains Monday–Sunday scheduling
* Suggested run length: around 5 years
* Systems must be able to support longer runs later

Basic run flow:

```text
START RUN
    ↓
Load current active roster
    ↓
Randomize gameplay stats
    ↓
Year 1
    ↓
Weekly management
    ↓
Singles / Theater / VC / M\&G / MV / Concerts
    ↓
Q4 Audition
    ↓
Year-End M\&G
    ↓
Anniversary Concert
    ↓
Year Review
    ↓
New Year
    ↓
Generations / Graduations / Development
    ↓
Repeat
```

The game should keep a persistent history of major events across the run.

\---

# 3\. Main Game State

Suggested conceptual state:

```js
gameState = {
  year: 1,
  week: 1,

  money: 0,

  group: {
    fanbase: 0,
    popularity: 0,
    fanTrust: 0,
    reputation: 0,
    publicAwareness: 0
  },

  members: \[],
  generations: \[],

  calendar: {},
  events: \[],
  activities: \[],

  singles: \[],
  mvs: \[],
  concerts: \[],
  theaterHistory: \[],
  fanEvents: \[],
  auditions: \[],
  graduations: \[],

  fanNarratives: \[],
  activeDrama: null,
  dramaCooldownUntilWeek: null,

  history: \[]
}
```

The game should record enough history for later systems to inspect past decisions.

Examples:

* member has not appeared in theater for X weeks
* member has centered several singles consecutively
* member has had very little exposure
* member repeatedly sells out M\&G
* member repeatedly sells out VC
* generation receives unusually little stage time
* management repeatedly chooses venues below expected scale

These facts can be used by the fan-narrative and trust systems.

\---

# 4\. Member Identity Data

Identity information is not randomized.

Suggested fields:

```text
id
name
generation
photo
birthDate
realWorldStatus / initial status
```

Gameplay-facing stats are randomized separately.

\---

# 5\. Randomized Member Stats

Every new run randomizes member gameplay stats.

Core visible stats:

```text
Vocal
Dance
Performance
MC
Variety
Stamina
Popularity
Energy
```

Suggested range:

```text
0–100
```

Energy always has:

```text
Maximum Energy = 100
```

Popularity is separate from skill.

A member can be highly skilled but not popular, or very popular but only average in performance ability.

Example:

```text
Member A

Vocal        61
Dance        88
Performance  84
MC           43
Variety      58
Stamina      76
Popularity   52
Energy       100
```

Another save may generate completely different stats for the same member.

\---

# 6\. Hidden Member Development Stats

Suggested hidden values:

```text
Potential
Development Speed
Consistency
Adaptability
Peak Timing / Development Curve
```

These should not be presented as statements about the real people.

They are fictional gameplay values generated for the current save.

Example:

```text
Current Ability: 54
Potential: 94
Development Speed: 82
```

This allows weak starting members to become major stars later.

\---

# 7\. Member Archetypes

Stats should not be fully uniform-random.

First generate a hidden gameplay archetype, then generate stats from weighted ranges.

Possible archetypes:

```text
Performer
Vocalist
Entertainer
All-Rounder
Specialist
Raw Prospect
Prodigy
Late Bloomer
```

Example:

```text
PERFORMER

Dance        65–95
Performance  70–95
Vocal        40–80
MC           35–75
Variety      35–75
```

Ranges should overlap enough to allow unusual combinations.

A vocalist can still randomly become a strong all-rounder.

\---

# 8\. Member Traits

Members may receive 1–3 randomized gameplay traits.

Examples:

```text
Quick Learner
+20% training EXP

Big Stage Performer
+10% concert performance

Theater Specialist
+15% theater performance

Unit Specialist
Bonus in small units

Reliable Performer
Reduced performance variance

Late Bloomer
Higher development later in the run

Versatile
Reduced penalty when changing roles

Crowd Magnet
Higher audience satisfaction
```

Traits may also be earned through gameplay.

Example:

```text
50 theater appearances
→ Theater Veteran
```

Traits should represent gameplay strengths and development, not negative claims about the real person.

\---

# 9\. Ego Stat

Add one randomized member stat:

```text
Ego
0–100
```

This is a fictional simulation stat generated independently for every save.

Its main purpose is to influence the **drama-selection weighting**.

Important:

* Ego is not the percentage chance of drama.
* A high value does not guarantee drama.
* A low value does not make a member immune.
* Drama itself is still triggered by a separate global RNG check.

Suggested selection concept:

```js
dramaWeight =
  baseWeight
  + ego \* egoWeight
  + optionalExposureModifier
  + optionalFanPressureModifier;
```

Only use these weights **after** the global game has already decided that a drama event occurs.

\---

# 10\. Energy System

Each member has:

```text
Energy: 0–100
```

Maximum remains 100 for every member.

Stamina does **not** increase maximum energy.

Instead, Stamina modifies energy cost.

Suggested formula:

```js
fatigueMultiplier =
  1.15 - (stamina / 100) \* 0.30;
```

Approximate result:

```text
Stamina 0   → ×1.15 fatigue
Stamina 50  → ×1.00 fatigue
Stamina 100 → ×0.85 fatigue
```

Example:

```text
Concert base cost: 38

Stamina 100:
38 × 0.85 ≈ 32

Stamina 0:
38 × 1.15 ≈ 44
```

Round final fatigue cost to an integer.

\---

# 11\. Weekly Passive Energy Regeneration

Energy regeneration happens at the **start of every new week**.

Initial balance target:

```text
Base weekly recovery: +40 Energy
```

Example:

```text
End Week 8:
Energy 36

Start Week 9:
36 + 40 = 76
```

Energy is capped at 100.

No automatic daily passive regeneration is needed if weekly recovery is used.

A member who is heavily overworked can therefore carry fatigue into following weeks.

Example:

```text
End week:
Energy 23

Next Monday:
23 + 40 = 63
```

This member is usable but still not fully recovered.

\---

# 12\. Energy Performance Bands

Suggested thresholds:

```text
80–100
FRESH
No penalty

60–79
NORMAL
No meaningful penalty

40–59
TIRED
Performance -5%
Training effectiveness -10%

20–39
FATIGUED
Performance -15%
Training effectiveness -25%
Higher unavailable risk if added later

1–19
EXHAUSTED
Performance -30%
Training effectiveness heavily reduced

0
UNAVAILABLE
Cannot be scheduled
```

Exact percentages are balance values and may be tuned.

\---

# 13\. Activity Energy Costs

Initial balancing targets.

## Training

```text
Light Training       8
Normal Training     15
Intensive Training  25
```

## Theater

```text
Theater Show        18
Theater Center      \~20
```

## Meet \& Greet

Each member may receive 1–3 sessions.

```text
1 session     8
2 sessions   14
3 sessions   20
```

## Video Call

```text
1 session     5
2 sessions    9
3 sessions   13
```

## Media

```text
TV / Media Appearance    10
Photoshoot               10
```

## Festival / Off-Air

```text
Festival / Off-Air Performance   20
```

## MV

```text
Supporting Member   18
Main / Senbatsu     25
Center              32
```

## Concert

Suggested baseline:

```text
Small Concert          28
Medium Concert         34
Large Concert          40
Major / Anniversary    45
```

Concert rehearsals also cost energy:

```text
Light Rehearsal         8
Full Rehearsal         15
Dress Rehearsal        12
```

These values must be playtested.

\---

# 14\. Activity Resolution Order

Performance should use the energy level **before** the activity fatigue cost is deducted.

Correct:

```js
performance = resolvePerformance(member.energy);

member.energy -= activity.energyCost;
```

Not:

```js
member.energy -= activity.energyCost;

performance = resolvePerformance(member.energy);
```

This prevents an event from punishing a member for fatigue caused by the same event before it has happened.

\---

# 15\. Weekly Calendar Scheduling

The player assigns activities to individual members on specific days.

Example:

```text
WEEK 14

             MON    TUE     WED      THU    FRI      SAT   SUN

Member A     Train   —      Theater  —      VC       —     Theater
Member B     —       Media  Theater  Train  VC       M\&G   —
Member C     Train   —      —        Media  VC       —     Theater
```

The player should be able to click each day/member cell and assign an allowed activity.

\---

# 16\. Global Events vs Member Assignments

Some events exist at the group/calendar level first.

Examples:

```text
Concert
M\&G
Video Call
MV Shoot
Festival
TV Special
Theater Show
```

The player then chooses participating members and schedules their individual sessions/assignments.

A member cannot simply select “Concert” unless a concert exists on that date.

\---

# 17\. Activity Time Classes

Suggested categories:

## Light

```text
VC 1 session
Light training
Short media appearance
Photoshoot
```

## Medium

```text
VC 2–3 sessions
M\&G 1 session
Normal training
Theater
TV appearance
```

## Heavy

```text
M\&G 2–3 sessions
MV shooting
Festival
Concert
Intensive training
```

Suggested scheduling rules:

```text
Light + Light
Allowed

Light + Medium
Allowed with additional fatigue penalty

Medium + Medium
Usually not allowed

Heavy + anything
Normally not allowed
```

This can be tuned based on actual gameplay.

\---

# 18\. Double-Booking Penalty

If certain compatible activities are scheduled on the same week, add extra fatigue (cannot book on the same day).

Example:

```text
VC session       -5
Theater          -18
Double-booking    -5

Total            -28
```

This allows desperate scheduling without making it optimal.

\---

# 19\. Theater System

Theater is one of the main recurring activities.

Each theater show contains:

```text
Setlist
Team / lineup grouping
Center
Participating members
Units
Understudies
Ticket demand
Audience satisfaction
Revenue
Member EXP
Energy cost
```

Members gain setlist familiarity.

Example:

```text
Member A

Pajama Drive      91%
Ramune            62%
TWT               34%
```

Low familiarity causes a performance penalty.

The game should track recent theater usage:

```text
Shows last 4 weeks
Shows last 12 weeks
Center appearances
Unit appearances
Total exposure
```

These numbers may later feed fan narratives.

\---

# 20\. Training System

Training categories:

```text
Vocal
Dance
Performance
MC
Variety
Stamina
```

Training costs:

* energy
* time
* money if applicable

Growth should be affected by:

```text
Potential
Development Speed
Current Stat
Training Type
Current Energy
Trait Modifiers
```

Use diminishing returns.

Example:

```text
Dance 40 → 60
relatively easy

Dance 90 → 95
very difficult
```

Training while tired becomes less effective.

Suggested effectiveness:

```text
Energy > 60
100%

Energy 40–59
90%

Energy 20–39
70%

Energy < 20
40%
```

Balance value only.

\---

# 21\. Popularity

Popularity is separate from member skill.

Suggested member values:

```text
Member Popularity
Member Fanbase
Recent Momentum
```

Example:

```text
Member A
Ability: 91
Popularity: 48

Member B
Ability: 68
Popularity: 93
```

Neither is automatically more useful.

\---

# 22\. Fan Categories

Do not simulate every individual fan.

Use aggregated fan pools.

Suggested categories:

```text
Core Wota
Casual Fans
General Public
Oshi Fans
DD / Group Fans
Digital Fans
Event Fans
```

Different groups respond to different activities.

Examples:

## Core Wota

Care more about:

```text
Theater
Rotation
Setlists
Member development
```

## Casual / General Public

Care more about:

```text
Popular songs
Trending members
TV
MV
Big concerts
```

## Oshi Fans

Care heavily about:

```text
Their member's exposure
Center
Senbatsu
M\&G
VC
Merchandise
```

## Group Fans

Care more about:

```text
Overall group success
Management competence
Roster development
Concert quality
```

\---

# 23\. Fan Sentiment

Management decisions generate sentiment changes across fan groups.

Example:

```text
Member A selected as center.

Member A fans        +18
General public        +5
Core wota             -2
Member B fans         -7
Member C fans         -4
```

Most sentiment changes should **not** become drama.

They mainly feed:

```text
Fan Trust
Member Popularity
Narratives
Event Demand
Social discussion
```

\---

# 24\. Fan Narratives

The game watches historical patterns and dynamically generates fan narratives.

Examples:

```text
Next Ace
Underrated
Management Favorite
Future Center
Theater Queen
Variety Star
Breakout Rookie
Reliable Veteran
Golden Generation
Lost Generation
Management Lacks Ambition
New Era
```

These are not intrinsic member traits.

They are **in-universe fan perceptions based on the current run**.

Example:

```text
Reality:
Member B Performance 73
Popularity 51

Fan Narrative:
"Future Ace"
```

If the player continues ignoring this member, expectation mismatch may increase fan dissatisfaction.

\---

# 25\. Viral Moments

Activities may randomly produce viral outcomes.

Example:

```text
VIRAL PERFORMANCE

Member D theater clip becomes popular.

Popularity +18
New Fans +9,420
```

Viral moments can change:

```text
M\&G demand
VC demand
Popularity
Narratives
Single consideration
Concert demand
```

\---

# 26\. Meet \& Greet Rules

Hard design rules:

```text
Maximum sessions per member per M\&G event: 3

Tickets per session:
100

Maximum tickets/member/event:
300
```

The player chooses how many sessions each member receives:

```text
1
2
or
3
```

The number of tickets per session is fixed.

The player cannot manually set arbitrary ticket capacity inside a session.

\---

# 27\. Meet \& Greet Demand

Track:

```text
Sessions allocated
Capacity
Tickets sold
Sell-through %
Estimated demand
Unmet demand
```

Examples:

```text
Member A

3 sessions
Capacity: 300
Demand: 650
Sold: 300/300
Unmet demand: 350
```

Versus:

```text
Member B

1 session
Capacity: 100
Demand: 103
Sold: 100/100
Unmet demand: 3
```

Both sold out, but their true demand is very different.

Suggested demand factors:

```text
Member Fanbase
Fan Loyalty
Recent Exposure
Recent Performance
Current Narrative
Single Participation
Center / Senbatsu Status
Momentum
RNG
```

\---

# 28\. Video Call Rules

Hard design rules:

```text
Maximum sessions per member per VC event: 3

Tickets per session:
25

Maximum tickets/member/event:
75
```

Player chooses 1–3 sessions.

VC should represent a somewhat different fan-demand profile than M\&G.

Suggested factors:

```text
Digital Fanbase
Fan Loyalty
Recent Online Exposure
Viral Activity
Single Participation
Momentum
RNG
```

A member can have strong M\&G demand but weaker VC demand, or vice versa.

\---

# 29\. Member Fan Composition

A member's fanbase may contain hidden proportions such as:

```text
Core Fans
Casual Fans
Digital Fans
Event Fans
```

Example:

```text
Member A Fanbase

Core Fans       38%
Casual Fans     24%
Digital Fans    31%
Event Fans       7%
```

This helps M\&G and VC behave differently without hardcoding “this member is good at video calls.”

\---

# 30\. Monthly Video Call Scheduling

VC is generally a monthly event/campaign.

The player may decide:

* which week of the month a member participates
* which day of that week
* how many of the member's 1–3 sessions occur that day

Example:

```text
Member A

VC Session 1:
Week 1 Friday

VC Session 2:
Week 3 Saturday

VC Session 3:
Week 3 Saturday
```

Sessions may be bundled or distributed.

Suggested energy efficiency:

```text
1 session   5
2 sessions  9
3 sessions 13
```

Bundling multiple sessions is slightly more energy efficient, but consumes more of that day.

\---

# 31\. M\&G Session Scheduling

Same principle as VC.

The player can distribute 1–3 sessions across the allowed event week.

Example:

```text
Member A

Week Event:

Friday:
Session 1

Saturday:
Session 2 + Session 3
```

Energy uses the bundled session cost for that day.

\---

# 32\. Single System

Every few months, management may create/release a single.

Player decisions:

```text
Center
Senbatsu / participating members
Song concept
Promotion strategy
MV production
Marketing budget
```

Single result depends on:

```text
Group popularity
Member popularity
Center appeal
Lineup chemistry
Song quality RNG
MV quality
Promotion
Fan sentiment
Current narratives
```

Singles should generate an event campaign, not just a one-click reward.

\---

# 33\. MV System

MV production is connected to singles.

Player chooses:

```text
Concept
Center
Participating members
Production budget
Production tier
Shoot date(s)
```

Example concepts:

```text
Performance
Story-driven
Cute / Idol
Cool
Experimental
```

Suggested budget tiers:

```text
Low
Standard
Premium
```

Exact money values should be balanced later.

MV result can influence:

```text
Public Awareness
Member Popularity
Fan Growth
Single Performance
Viral Chance
```

Energy costs depend on role:

```text
Supporting    18
Senbatsu      25
Center        32
```

\---

# 34\. Concert Availability

Concerts should **not** be freely spammable.

Concert opportunities unlock after sufficiently large fan-facing events or campaign milestones.

Primary example:

```text
Major M\&G
    ↓
Demand / Revenue / Fan Response evaluated
    ↓
Concert opportunity becomes available
```

The year-end Anniversary Concert is a special guaranteed annual system, described separately below.

\---

# 35\. Randomized Concert Venues

When a concert opportunity appears, generate multiple venue offers with randomized stats.

Example:

```text
Venue A
Capacity: 1,850
Rental Cost: $240m
Production Ceiling: LOW
Popularity Gain Potential: LOW

Venue B
Capacity: 4,200
Rental Cost: $620m
Production Ceiling: MEDIUM
Popularity Gain Potential: MEDIUM

Venue C
Capacity: 8,750
Rental Cost: $1.45b
Production Ceiling: HIGH
Popularity Gain Potential: HIGH
Financial Risk: HIGH
```

Do not guarantee one Small / Medium / Large choice every time.

Example rolls may be:

```text
2200
3600
9000
```

or:

```text
1500
5100
6400
```

or an unlucky set:

```text
1200
1800
3000
```

Venue opportunities are part of the roguelike randomness.

\---

# 36\. Concert Scale Expectation

Small venues are not automatically bad.

The game should calculate the scale fans reasonably expect based on current group strength.

Suggested inputs:

```text
Group Popularity
Fanbase
Recent M\&G Sales
Previous Concert Demand
Recent Concert Occupancy
Fan Trust
Financial Strength
Recent Growth
```

Example:

```text
Expected Concert Scale:
4,000–7,000

Management selects:
1,500
```

Result may cause:

```text
Fan Trust decrease
Core Fan dissatisfaction
Narrative:
"Management lacks ambition"
```

But if the group is weak and demand is low, a 1,500–2,000 capacity venue may be a smart choice and increase trust.

Fan Trust should evaluate **management competence**, not simply spending.

\---

# 37\. Popularity vs Fan Trust

Keep these conceptually separate.

```text
Popularity
= How much attention / interest the group has.

Fan Trust
= How much fans believe management is competent and acting appropriately.
```

Possible state:

```text
Popularity: 92
Fan Trust: 31
```

The group can be hugely popular while fans dislike management.

\---

# 38\. Concert Occupancy

A bigger venue is only good if demand supports it.

Example failure:

```text
Capacity: 8,000
Tickets Sold: 2,910
Occupancy: 36.4%

Popularity: -2
Fan Trust: -8
Reputation: -5
Financial loss: high
```

Example success:

```text
Capacity: 4,000
Tickets Sold: 3,940
Occupancy: 98.5%

Popularity: +11
Fan Trust: +8
```

Repeatedly under-booking or over-booking may create persistent fan narratives.

\---

# 39\. Concert Production

Concert spending should contain at least a simplified production-tier system.

Example:

```text
Basic
Standard
Premium
Spectacle
```

Production tier affects:

```text
Concert Quality
Fan Trust
Popularity Gain
Financial Risk
```

A large venue with extremely cheap production can still damage Fan Trust.

A small venue with excessive production can produce a fantastic concert but lose a lot of money.

\---

# 40\. Concert Performance Slots

Larger concerts give more stage/content slots.

Example:

## Small Concert

```text
Main songs:       8
Unit songs:       3
Solo/unit slots:  2
Encore:           2
```

## Medium Concert

```text
Main songs:       12
Unit songs:        5
Special slots:     4
Encore:            3
```

## Major Concert

```text
Main songs:       16
Unit songs:        8
Special slots:     6
Solo slots:        3
Encore:            4
```

Exact numbers are tunable.

Bigger concerts should allow more members to receive exposure.

\---

# 41\. Concert Evaluation

Suggested result breakdown:

```text
Attendance
Member Performance
Production Quality
Setlist Reception
Fan Expectation
Management Efficiency
```

Example:

```text
CONCERT SCORE

Attendance             92
Member Performance     87
Production Quality     91
Setlist Reception      84
Fan Expectation        89
Management Efficiency  76

Overall:
87
```

Rewards may include:

```text
Popularity
Fan Trust
Fanbase Growth
Member EXP
Revenue / Loss
Narratives
```

\---

# 42\. Year-End M\&G

There is a special major M\&G event every year.

Event window:

```text
Approximately mid-October through November
```

The player chooses:

```text
Exact event week
Exact event days within that week
Ticket selling start date
Session allocation for each member
```

Hard rule:

```text
The Year-End M\&G can only occupy one calendar week.
```

It may use one or multiple days inside that week.

Example:

```text
YEAR-END M\&G WEEK

MON  —
TUE  —
WED  M\&G
THU  M\&G
FRI  M\&G
SAT  M\&G
SUN  M\&G
```

or:

```text
FRI–SUN only
```

Member session rules remain:

```text
Max 3 sessions
100 tickets/session
300 max/member
```

\---

# 43\. M\&G Selling Period

Before the Year-End M\&G, the player chooses when ticket selling starts.

Earlier is not automatically better.

Conceptual effects:

## Long Sales Period

```text
+ More time to sell
+ Better for lower-demand members
+ Better revenue visibility

- Hype can decay
- Less urgency
```

## Short Sales Period

```text
+ More urgency
+ Can exploit recent member momentum / viral events

- Less time to sell
- Riskier for weaker-demand members
```

Suggested rough timing bands:

```text
10+ weeks
Very Early

5–9 weeks
Healthy

2–4 weeks
Late

<2 weeks
Very Late
```

These are modifiers, not hard fail states.

\---

# 44\. Ticket Sales Simulation

Sales should progress over time while the selling period is open.

Suggested conceptual factors:

```text
Current Demand
Fan Purchasing Power
Member Momentum
Remaining Capacity
Sales Urgency
RNG
```

Example UI:

```text
YEAR-END M\&G

5 weeks remaining

Member A
257 / 300

Member B
184 / 300

Member C
98 / 200

Member D
42 / 100
```

The same screen two weeks later may show progress.

Demand can change during the sale period due to:

```text
Viral moments
Single release
MV performance
New narratives
Center announcement
Media appearance
Drama
```

\---

# 45\. Year-End Anniversary Concert

There is one special annual Anniversary Concert.

Window:

```text
Mid to late December
```

The player chooses:

```text
Event week
Concert date(s)
Venue
Production tier
Announcement date
Ticket sales start date
Rehearsal schedule
Lineup
Setlist / slots
```

Hard rule:

```text
The Anniversary Concert can only occupy one calendar week.
```

The operation, rehearsals, and concert should fit within that one designated event week as much as the final design allows.

\---

# 46\. Anniversary Concert Week

Example:

```text
MON
Rehearsal

TUE
Rehearsal

WED
Free / Light

THU
Dress Rehearsal

FRI
Concert Day 1

SAT
Concert Day 2

SUN
Recovery
```

Or a single-day concert with several rehearsal days.

The player controls the exact week/day choice inside the allowed December window.

\---

# 47\. Anniversary Venue Generation

Year-End M\&G results strongly influence venue opportunities.

Suggested factors:

```text
M\&G Sell-Through
M\&G Unmet Demand
Group Popularity
Fan Trust
Reputation
Previous Concert Demand
Financial Strength
RNG
```

Strong year example:

```text
Potential Venues:
4,500
7,500
11,000
```

Weak year example:

```text
Potential Venues:
1,800
2,700
4,100
```

Still include RNG so opportunities are not deterministic.

\---

# 48\. Concert Announcement vs Ticket Sales

Treat these as separate decisions.

Example:

```text
September 20
Announce Anniversary Concert

October 15
Reveal Venue

October 20
Open Ticket Sales

December 19
Concert
```

Alternative:

```text
November 20
Surprise Announcement

November 22
Ticket Sales

December 19
Concert
```

Short lead times create urgency but make large venues much riskier.

\---

# 49\. Concert Hype

Suggested visible metric:

```text
CONCERT HYPE
0–100
```

Affected by:

```text
Recent Singles
MV Success
M\&G Results
Fan Trust
Current Narratives
Center Popularity
Previous Concert Results
Announcement Quality
Current Group Momentum
```

Ticket conversion can be influenced by hype when sales begin.

\---

# 50\. Anniversary Fan Expectations

The Anniversary Concert is the major year-end statement from management.

Expected scale should be calculated from the entire year.

Possible inputs:

```text
Annual Revenue
Popularity
Fanbase
M\&G Performance
Previous Anniversary
Fan Trust
Reputation
Recent Growth
```

If expectation is:

```text
7,000–11,000
```

and management chooses:

```text
2,500
```

Fan Trust may decrease even if the concert sells out instantly.

An extremely fast sellout can generate even more criticism if it proves management badly underestimated demand.

Likewise, selecting a 12,000-seat venue when demand only supports 4,000 can initially increase hype but later damage trust if occupancy is poor.

\---

# 51\. Audition Availability

Auditions may only be started during **Q4**.

Allowed months:

```text
October
November
December
```

The player chooses:

```text
Month
Week
Exact audition start
```

Starting earlier or later has tradeoffs.

\---

# 52\. Audition Timing Tradeoffs

## October

Advantages:

```text
More time for the full audition
Earlier new-member development
Less calendar pressure
```

Disadvantages:

```text
Year-End M\&G has not happened yet
Annual Fan Trust / Reputation may still improve later
```

## November

Balanced option.

Can benefit from M\&G results depending on exact timing.

## December

Advantages:

```text
May benefit from maximum year-end reputation/trust
```

Disadvantages:

```text
Anniversary planning conflict
Very busy calendar
Generation may not finalize until next year
```

Auditions can cross into the following calendar year.

\---

# 53\. Audition Duration

Suggested initial structure:

```text
Week 1
Applications

Week 2
Screening

Week 3
Performance Evaluation

Week 4
Finalists

Week 5
Final Selection / Offers
```

Exact duration may be tuned.

Starting an audition late in December can therefore result in members being finalized/debuting the next year.

\---

# 54\. Audition Intake Philosophy

Do **not** allow the player to recruit a huge group immediately.

The game should avoid the first audition effectively creating a second full team.

Normal generation sizes should be relatively small.

Preferred baseline:

```text
3–5 members
```

Occasional:

```text
6 members
```

Six should feel like a large intake.

\---

# 55\. First Audition Cap

Hard early-game rule:

```text
FIRST AUDITION OF THE RUN

Maximum intake:
4 members
```

This applies regardless of strong Fan Trust or Reputation.

Purpose:

* prevents roster explosion
* preserves roster pressure
* keeps starting members relevant
* allows generational change to happen gradually

\---

# 56\. Later Audition Intake Cap

Suggested management-based cap:

```text
Management Score 0–39
Max 3

Management Score 40–59
Max 4

Management Score 60–79
Max 5

Management Score 80+
Max 6
```

Six is the absolute normal maximum.

These thresholds are tunable.

\---

# 57\. Management Score for Auditions

Use both:

```text
Fan Trust
Reputation
```

Suggested conceptual formula:

```js
auditionManagementScore =
  fanTrust \* 0.55
  + reputation \* 0.45;
```

Fan Trust represents confidence in management.

Reputation represents JKT48's external prestige/success.

\---

# 58\. Intake Cap Is Not Generation Size

Important distinction:

```text
Maximum allowed intake
≠
Number of members the player must choose
```

Example:

```text
Management Cap:
5

Finalists:
12

Player may sign:
0–5
```

The player can deliberately choose fewer members.

Example:

```text
Cap: 5

Only 3 candidates seem worthwhile.

Final Generation Size:
3
```

This creates meaningful drafting decisions.

\---

# 59\. Finalist Pool

Generate more finalists than available member slots.

Example:

```text
15 finalists
Maximum intake: 4
```

The player compares candidates and selects only a few.

Candidate information should initially be incomplete.

Example:

```text
Candidate #07

Vocal        B
Dance        C+
Performance A-
MC           C

Potential:
Unknown

Scout Report:
"Shows significant room for development."
```

\---

# 60\. Audition Scouting Accuracy

Exact candidate stats should initially be hidden.

Scouting reveals estimates.

Scout accuracy may itself be affected by management systems/facilities later.

Example:

```text
Estimated Potential:
80–90

Actual Potential:
71
```

or the reverse.

This preserves discovery and roguelike randomness.

\---

# 61\. Reputation and Candidate Quality

Strong management should primarily reward the player with **better choices**, not simply more members.

Higher Reputation may improve:

```text
Applicant Count
Average Finalist Quality
Chance of Exceptional Prospects
Candidate Acceptance Rate
```

Example:

```text
Low Reputation
Applicants: 1,500
Exceptional candidate chance: low

High Reputation
Applicants: 5,000+
Exceptional candidate chance: higher
```

RNG still applies.

A low-reputation year may still produce a generational prospect.

\---

# 62\. Roster Size Pressure

Current roster size may slightly modify practical intake recommendations/caps.

Example:

```text
Active Roster: 42
Management Cap: 5

Roster Pressure Modifier:
-1 or -2

Final Cap:
3–4
```

A small roster may allow the full management cap.

Roster shortage should **not automatically give 7–8 new members**.

The player must sometimes survive with a thin roster.

\---

# 63\. Trainee System

Audition winners join as trainees.

Trainees require:

```text
Training
Theater appearances
Setlist familiarity
Experience
Time
```

They are not immediately equal to established members.

Later systems may allow promotions.

Fan narratives can react to:

```text
Fast promotion
Long trainee period
Repeated lack of exposure
Breakout performances
```

\---

# 64\. Graduation System

Graduation is a long-term roster-turnover mechanic.

Graduation should be partly randomized and outside direct player control.

Potential internal factors:

```text
Time in Group
Career Stage
Game Progression
Randomness
```

Avoid making real-member graduation mechanically caused by fictional negative personality judgments.

When triggered:

```text
GRADUATION ANNOUNCEMENT

Member will graduate in X weeks.
```

The player then handles:

```text
Final Theater Show
Graduation Concert / Segment
Graduation Song
Final Center Opportunity
Merchandise
Mentorship
Successor Development
```

\---

# 65\. Mentorship

Veteran or graduating members may mentor younger members.

Example:

```text
Mentor:
Member A

Mentee:
Member G

Duration:
8 weeks

Development Bonus:
+20%
```

This can create long-term member-development lineages.

\---

# 66\. Chemistry

Each member pair may have randomized gameplay compatibility.

Suggested categories:

```text
Stage Compatibility
Performance Compatibility
MC Compatibility
Unit Compatibility
```

Avoid framing negative chemistry as members personally disliking each other.

Two members can simply have styles that do not mechanically synergize.

\---

# 67\. Lineup Calculation

Possible conceptual formula:

```text
Lineup Score =

Member Ability
+ Center Suitability
+ Chemistry
+ Setlist Familiarity
+ Current Form
+ Crowd Appeal
- Fatigue Penalty
+ RNG
```

The top raw-stat members should not always create the best lineup.

\---

# 68\. Random Opportunity Events

Normal procedural events may include:

```text
TV Appearance
Festival
Brand Campaign
Radio
Variety Show
Photo Shoot
Special Theater
Tour
Collaboration
Concert Invitation
Extra Theater Slot
Production Delay
Schedule Conflict
Member Unavailable
Viral Opportunity
```

These are separate from the special Drama system.

\---

# 69\. Drama System Overview

Drama is a rare, high-impact random disruption.

Drama is disabled during Year 1.

Hard rule:

```text
Year 1:
Drama cannot occur.

Year 2+:
Drama may occur.
```

Drama should never become a constant weekly nuisance.

\---

# 70\. Drama Eligibility

Drama may only roll if all conditions are true:

```text
Year >= 2
No active drama
No member currently punished
Previous punishment has ended
Drama cooldown has fully expired
```

Only after all gates pass does the weekly global drama RNG happen.

\---

# 71\. Drama Base Chance

Initial suggested baseline:

```text
\~2% chance per eligible week
```

This is a tuning value.

Possible modifiers later:

```text
Very High Fan Trust
slightly lower chance

Very Low Fan Trust
slightly higher chance

High overall fan tension
slightly higher chance
```

Do not make Drama easy to fully eliminate.

\---

# 72\. Drama Member Selection

When the global drama roll succeeds, select one member using weighted RNG.

Arrogancy is a major weighting input.

Possible conceptual formula:

```js
weight =
  base
  + arrogancy \* 0.8
  + exposure \* 0.3
  + recentFanPressure \* 0.5;
```

Exact coefficients are tunable.

High-arrogancy members are more likely to be selected, but no member should be guaranteed or immune.

\---

# 73\. Drama Duration

Hard rule:

```text
Punishment duration:
4 weeks
```

Use four weekly turns rather than calendar-month arithmetic.

Example:

```text
Drama starts:
Week 18

Punished:
Week 18
Week 19
Week 20
Week 21

Returns:
Start of Week 22
```

\---

# 74\. Drama Punishment Effect

During punishment:

```text
Member Status:
SUSPENDED / UNAVAILABLE
```

The member cannot participate in any activity.

Blocked:

```text
Theater
Concert
MV
M\&G
Video Call
Media
Training
Photoshoot
Festival
Other Events
```

Effectively:

```js
member.scheduleLocked = true;
```

\---

# 75\. Existing Assignments During Drama

If drama begins after an activity was already scheduled, the schedule must react.

Examples:

```text
Theater
Replacement required

Video Call
Cancelled for member

M\&G
Cancelled for member

MV
Recast required

Concert
Lineup incomplete / replacement required
```

This creates a true roster-management disruption.

\---

# 76\. Sold Fan-Event Tickets During Drama

If a member already sold M\&G or VC tickets and then becomes unavailable:

```text
Tickets are refunded
Revenue is lost
Fan Trust may decrease
```

Example:

```text
VC:
75/75 sold

Member suspended

75 tickets refunded
Revenue -X
Fan Trust -2
```

Same principle for M\&G.

This creates concentration risk around relying too heavily on one star.

\---

# 77\. Energy After Drama

When the four-week punishment ends:

```text
Member Energy = 100
```

They have not participated in activities during the suspension, so they return fully rested.

\---

# 78\. Drama Cooldown

After the punished member returns, drama remains disabled for a random cooldown.

Suggested range:

```text
8–16 weeks
```

Approximately:

```text
2–4 months
```

Example:

```text
Member returns Week 22

Cooldown:
12 weeks

Weeks 22–33:
No drama possible

Week 34:
Drama weekly RNG becomes eligible again
```

\---

# 79\. Cooldown Does Not Force Another Drama

After cooldown ends, drama does **not** automatically happen.

Instead:

```text
Cooldown ends
    ↓
Weekly \~2% roll resumes
    ↓
Eventually another drama may happen
```

This means actual gaps between dramas can be much longer than the minimum cooldown.

\---

# 80\. Only One Drama at a Time

Hard rule:

```text
No simultaneous member punishments from the Drama system.
```

A new drama cannot occur until:

```text
previous member returns
+
cooldown ends
+
new weekly RNG succeeds
```

\---

# 81\. Drama Severity

Optional fan-backlash severity roll:

```text
Minor
Moderate
Major
Extreme
```

Suggested initial weighting:

```text
Minor       40%
Moderate    35%
Major       20%
Extreme      5%
```

Arrogancy may slightly shift this weighting.

Severity affects:

```text
Fan Trust
Reputation
Member Popularity
Member Fanbase
Fan Narratives
```

But suspension always remains four weeks.

\---

# 82\. Drama Memory

After a member returns, fan sentiment may take time to normalize.

Conceptual decay:

```text
Return Week:
Drama memory 100%

After \~4 weeks:
60%

After \~8 weeks:
30%

After \~12 weeks:
0%
```

Promoting the member immediately after return may have higher fan-reaction risk.

The player is still allowed to do it.

\---

# 83\. Why Drama Exists

The Drama system should create roster-depth pressure.

Example:

```text
Main Center
Suspended

Main Vocal
Energy 32

Second Center
Graduating

Anniversary Concert
3 weeks away
```

This rewards:

```text
Strong bench depth
Understudies
Multiple center options
Training younger members
Balanced member usage
Good energy management
```

The player should mitigate the **damage** of drama, not completely prevent drama itself.

\---

# 84\. Economy

Suggested income sources:

```text
Theater
Concerts
Singles
Merchandise
Meet \& Greet
Video Call
Sponsorship
Media
```

Suggested expenses:

```text
Staff
Training
Theater
Concert Production
Music Production
MV Production
Promotion
Travel
Auditions
Refunds
```

Money should create opportunity-cost decisions.

\---

# 85\. Group-Level Metrics

Keep visible global metrics reasonably small.

Recommended:

```text
Fanbase
Popularity
Fan Trust
Reputation
Money
Public Awareness
```

More detailed values may exist internally.

\---

# 86\. Annual Rhythm

Suggested year structure:

```text
JAN–SEP

Normal operation:
Theater
Training
Singles
MV
Monthly VC
Regular M\&G
Media
Festival
Concert opportunities
Development
Graduations


Q4 STARTS

October
Auditions become available


MID OCT–NOV

YEAR-END M\&G WINDOW
Choose one week
Choose sessions
Choose selling start


OCT–DEC

Q4 AUDITION
Player decides exact start week


MID–LATE DECEMBER

ANNIVERSARY CONCERT
Choose one week
Choose venue
Choose production
Choose sales period
Schedule rehearsals


END OF YEAR

Annual report
Fan Trust / Reputation result
Roster changes
Generation progress
History update
```

\---

# 87\. Year-End Review

Suggested categories:

```text
Financial Management
Member Development
Fan Relations
Group Growth
Singles / Media
Theater Management
Anniversary Execution
Audition Management
```

Example:

```text
2028 REVIEW

Financial Management      B+
Member Development        A
Fan Relations             A-
Group Growth              A+
Anniversary Execution     S

Overall:
A+
```

\---

# 88\. Run History

Maintain a timeline of important procedural events.

Example:

```text
Year 1
Member A becomes center.

Year 1 Week 29
Member C goes viral.

Year 2
Generation 14 debuts.

Year 2
Member A graduates.

Year 3
Member C becomes center.

Year 3
Fans begin calling Gen 14
"The Golden Generation."

Year 4
Member G becomes the most popular member.

Year 5
Generation 16 debuts.
```

The final run should feel like its own alternate JKT48 history.

\---

# 89\. Failure Conditions

Avoid instant game-over from one mistake.

Possible long-term failure conditions:

```text
Bankruptcy
Extreme Fan Trust collapse
Extreme Reputation collapse
Unable to maintain minimum roster
Severe sustained fanbase collapse
```

Recovery opportunities may exist.

\---

# 90\. Run Scoring

At the end of a run, show a management history report.

Possible statistics:

```text
Years Managed
Singles Released
Concerts
Theater Shows
M\&G Tickets Sold
VC Tickets Sold
Peak Fanbase
Peak Popularity
Peak Fan Trust
Members Developed
New Generations
Graduations
Breakout Stars
Successful Centers
Highest Selling Single
Largest Concert
Best Concert Occupancy
```

Then assign an optional management rank.

Example:

```text
S
A
B
C
etc.
```

The generated history is more important than the grade itself.

\---

# 91\. Meta Progression

Keep roguelike meta progression light.

Avoid permanent massive stat boosts.

Better unlocks:

```text
Advanced scouting
Better analytics
Additional management strategies
More training options
Different starting budget modes
Expanded event types
Historical statistics
Alternative UI tools
```

Meta progression should add strategic options, not erase randomness.

\---

# 92\. Recommended Simulation Modules

Keep systems separated.

Suggested architecture:

```text
GAME ENGINE
│
├── Calendar Engine
│   ├ weekly progression
│   ├ day scheduling
│   └ event windows
│
├── Member Engine
│   ├ stats
│   ├ development
│   ├ energy
│   ├ stamina
│   └ traits
│
├── Activity Engine
│   ├ theater
│   ├ training
│   ├ media
│   ├ MV
│   ├ M\&G
│   ├ VC
│   └ concert
│
├── Fan Engine
│   ├ fan pools
│   ├ sentiment
│   ├ popularity
│   ├ fan trust
│   ├ demand
│   └ narratives
│
├── Event Engine
│   ├ random opportunities
│   ├ viral moments
│   └ procedural events
│
├── Drama Engine
│   ├ eligibility
│   ├ weekly RNG
│   ├ member weighting
│   ├ suspension
│   └ cooldown
│
├── Roster Engine
│   ├ auditions
│   ├ trainees
│   ├ promotion
│   ├ graduation
│   └ mentorship
│
├── Release Engine
│   ├ singles
│   ├ centers
│   ├ senbatsu
│   └ MV campaigns
│
├── Economy Engine
│
└── History Engine
```

Avoid deeply coupling activity resolution directly to unrelated systems.

Prefer result objects.

Example:

```js
const result = resolveTheaterShow(show);

result = {
  performanceScore,
  revenue,
  memberExp,
  fatigue,
  popularityChanges,
  fanSentiment,
  narrativeInputs
};
```

Other engines then process those results.

\---

# 93\. Suggested MVP

Do not build every system immediately.

## Version 0.1

Implement:

```text
Current roster
Randomized member stats
Energy / stamina
Weekly regeneration
7-day member scheduling
Theater
Training
Basic popularity
Basic fan trust
Monthly VC
M\&G
Basic single
Basic MV
Simple concert
Graduation
Q4 audition
First-audition cap
3–5 member generation sizes
Simple yearly loop
Final score
```

## Version 0.2

Add:

```text
Traits
Chemistry
Setlist familiarity
Detailed member development
```

## Version 0.3

Add:

```text
Fan factions
Fan narratives
Viral moments
Demand history
```

## Version 0.4

Add:

```text
Advanced concerts
Random venue offers
Production tiers
Ticket selling periods
Year-End M\&G
Anniversary Concert
```

## Version 0.5

Add:

```text
Advanced audition scouting
Candidate quality
Applicant reputation effects
Trainee depth
Mentorship
```

## Version 0.6

Add:

```text
Drama system
Arrogancy
Suspension
Refund effects
Cooldown
Drama memory
```

## Version 0.7

Add:

```text
Run timeline
Advanced annual review
Historical charts
Narrative history
```

## Version 1.0

Polish:

```text
Full UI
Animations
Member cards
Fake fan/social feed
Advanced charts
Better calendar UX
Balancing
Save/load
Seeded RNG
Accessibility
```

\---

# 94\. Core Design Pillars

The final game should revolve around these systems:

## 1\. Randomized Member Development

Same starting roster, different stats, potential, roles, and usefulness every run.

## 2\. Calendar / Energy Management

The player cannot use the same strongest members for everything forever.

Every activity costs energy.

Weekly recovery and day-by-day scheduling create opportunity costs.

## 3\. Fan-Driven Emergent Narratives

Fans react to what management actually does.

Narratives develop from:

```text
Exposure
Centers
M\&G demand
VC demand
Theater usage
Concert scale
Single results
Viral moments
Management decisions
```

## 4\. Generational Turnover

Graduations and Q4 auditions slowly reshape the roster.

Small generations prevent immediate roster replacement.

## 5\. Year-End Pressure

Q4 creates the strategic climax:

```text
Audition timing
Year-End M\&G
Ticket-selling period
Fan Trust
Reputation
Anniversary venue
Anniversary Concert
```

## 6\. Rare Roguelike Disruption

Starting Year 2, drama can randomly remove one member for four weeks.

Roster depth becomes essential.

\---

# 95\. Hard Rules Currently Decided

These should be treated as locked until intentionally changed.

```text
Member maximum Energy:
100

Weekly passive Energy regeneration:
+40 baseline, capped at 100

Meet \& Greet:
100 tickets/session
Maximum 3 sessions/member/event
Maximum 300 tickets/member/event

Video Call:
25 tickets/session
Maximum 3 sessions/member/event
Maximum 75 tickets/member/event

Year-End M\&G:
Occurs in the mid-October to November window
Player chooses exact week
Can only occupy one week

Anniversary Concert:
Occurs around mid-to-late December
Player chooses exact week
Can only occupy one week

Ticket sales:
Player chooses when selling starts before the event

Auditions:
Can only be started in Q4
October / November / December
Player chooses month and week

First audition:
Maximum 4 selected members

Later auditions:
Normal generations roughly 3–5 members
6 is a rare / large intake
Management Fan Trust + Reputation influence intake cap and candidate quality

Drama:
Disabled in Year 1
Enabled from Year 2
Global random weekly check
Arrogancy affects member-selection weighting
One member punished at a time
Punishment lasts 4 weeks
Punished member cannot participate in any activity
Existing sold fan-event tickets must be refunded if needed
Member returns with 100 Energy
After return, drama has a random 8–16 week hard cooldown
After cooldown, normal weekly drama RNG resumes
```

\---

# 96\. Values Still Considered Balance Targets

These should be easy to change from config files.

```text
Weekly recovery = 40

Training costs:
8 / 15 / 25

Theater:
18

M\&G fatigue:
8 / 14 / 20

VC fatigue:
5 / 9 / 13

MV fatigue:
18 / 25 / 32

Concert fatigue:
28 / 34 / 40 / 45

Rehearsal:
8 / 15 / 12

Drama base chance:
\~2% per eligible week

Drama cooldown:
8–16 weeks

Audition management thresholds

Fan Trust modifiers

Concert expectation formulas

Ticket-selling demand curves

Training growth formulas
```

These should live in data/config rather than being hardcoded throughout the application.

\---

# 97\. Technical Recommendation

Use seeded RNG for all procedural systems.

Example:

```text
Run Seed:
JKT48-2028-123456
```

The seed should control:

```text
Member starting stats
Hidden potential
Traits
Chemistry
Audition candidates
Generation quality
Venue opportunities
Viral events
Fan narrative triggers
Drama rolls
Drama target weighting
Random event results
```

This allows:

* reproducible saves
* debugging
* challenge seeds
* sharing interesting runs later

Keep core data separate from simulation rules.

Suggested structure:

```text
/src
  /data
    members.json
    activities.json
    venues.json
    eventTypes.json
    balance.json

  /engine
    calendarEngine.js
    memberEngine.js
    energyEngine.js
    activityEngine.js
    theaterEngine.js
    trainingEngine.js
    fanEngine.js
    fanEventEngine.js
    releaseEngine.js
    concertEngine.js
    auditionEngine.js
    graduationEngine.js
    dramaEngine.js
    historyEngine.js
    rng.js

  /state
    gameState.js

  /ui
    ...
```

Avoid storing balancing constants inside UI components.

\---

# 98\. Primary Gameplay Question

Every system should reinforce this question:

> Given limited money, calendar space, member energy, fan expectations, and uncertain future events, who should management push, develop, rest, rotate, recruit, and trust with the group's next opportunity?

If the player can always sort by Overall Rating and use the same members everywhere, the simulation has failed.

If each save produces different stars, different role players, different crises, different successful generations, and different year-end stories, the core design is working.

