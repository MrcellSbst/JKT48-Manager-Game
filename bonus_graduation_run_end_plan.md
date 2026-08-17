# JKT48 Roguelike Management Game — Bonus, Graduation, and Run Ending Plan

## 1. Scope

This document defines three connected systems:

1. The pre-run permanent bonus system
2. Graduation pacing and roster attrition
3. The theater-based run-ending condition

The overall title/name of the pre-run bonus system is intentionally left undecided.

Use the placeholder:

```text
Management Perks
```

until the final name is chosen.

---

# 2. Management  — Core Concept

The player can unlock permanent pre-run bonuses using a separate meta-progression currency.

These bonuses:

- are selected before starting a run
- remain active for the entire run
- cannot be purchased during a run
- cannot normally be changed after the run starts
- are meant to slightly shape strategy, not overpower the simulation
- should not directly eliminate roguelike randomness

The system flow is:

```text
COMPLETE / FAIL A RUN
        ↓
Earn Meta Currency
        ↓
Unlock Permanent Bonuses
        ↓
START NEW RUN
        ↓
Choose Limited Bonus Loadout
        ↓
Bonuses Stay Active
for Entire Run
```

The player permanently owns unlocked bonuses, but should only be able to equip a limited number per run.

Recommended starting value:

```text
Equipped Bonus Slots:
3
```

Possible late-game progression:

```text
Maximum:
4
```

Do not allow the player to equip every unlocked bonus at once.

The purpose is to create different management builds.

---

# 3. Meta Currency

Currency name is still open.

Possible placeholder:

```text
META_CURRENCY
```

The currency should only exist outside a run.

It is earned from:

```text
Run completion
Run survival length
Management rank
Major milestones
Achievements
Historical records
Rare accomplishments
```

Failed runs should still award some currency.

This avoids making a failed long run feel completely wasted.

Suggested reward structure:

```text
Base Run Reward
+
Years Survived Bonus
+
Management Grade Bonus
+
Milestone Bonus
```

Example:

```text
Run survived 7 years
Management Grade: A
Largest concert: 12,000
Fan Trust peak: 91

Total META_CURRENCY:
+X
```

The exact economy should be balanced later.

---

# 4. Bonus Design Philosophy

Bonuses should primarily improve:

```text
Efficiency
Information
Choice
Risk Mitigation
Resource Management
Operational Flexibility
```

Avoid bonuses that directly turn members into superhumans.

Bad example:

```text
+20 Vocal to every member
```

Better example:

```text
Training EXP +10%
```

Bad example:

```text
Drama disabled
```

Better example:

```text
Drama Fan Trust damage -15%
```

Bad example:

```text
Always get a large concert venue
```

Better example:

```text
+1 venue offer whenever concert venues are generated
```

The best bonuses should slightly bend the simulation in the player's favor without removing uncertainty.

---

# 5. Bonus Categories

Recommended categories:

```text
Finance
Theater
Infrastructure
Member Development
Energy
Fan Events
Fan Trust
Concerts
MV / Singles
Auditions
Scouting
Risk Mitigation
```

---

# 6. Bonus Template Structure

Each bonus should use a standardized data structure.

Example:

```js
{
  id: "B001",
  name: "Theater Partnership",
  category: "Finance / Theater",
  effectType: "percentage_modifier",
  target: "theater_purchase_cost",
  value: -0.15,
  duration: "entire_run",
  stackable: false
}
```

Suggested fields:

```text
id
name
category
description
effectType
target
value
duration
stackable
unlockCost
rarity / tier (optional)
notes
```

---

# 7. Recommended Bonus Pool

The overall system title remains undefined.

These are individual bonus templates only.

## Finance / Theater

### Theater Partnership

```text
Effect:
Theater acquisition / purchase / lease cost -15%
```

Purpose:

```text
Helps the player establish or upgrade theater infrastructure earlier.
```

---

### Theater Operations

```text
Effect:
Theater recurring running cost -12%
```

Purpose:

```text
Strong long-term financial bonus for theater-focused builds.
```

---

### Facility Contractor

```text
Effect:
Theater renovation and facility upgrade costs -12%
```

Does not reduce normal recurring operating expenses.

---

### Lean Operations

```text
Effect:
General recurring management costs -6%
```

Broad bonus, therefore intentionally weaker than specialized cost reductions.

---

### Production Partnership

```text
Effect:
MV production cost -10%
```

Does not directly increase MV quality.

---

### Live Production Network

```text
Effect:
Concert production cost -8%
```

Does not reduce venue rental.

---

### Venue Partnership

```text
Effect:
Concert venue rental cost -10%
```

Useful for aggressive larger-venue strategies.

---

### Sponsor Relations

```text
Effect:
Sponsorship revenue +8%
```

---

### Media Partnership

```text
Effect:
Revenue from paid media opportunities +8%
```

Does not directly increase popularity.

---

# 8. Member / Energy Bonuses

### Recovery Program

```text
Effect:
Weekly passive Energy regeneration +5
```

Default:

```text
40 → 45
```

Permanent for the run.

---

### Performance Conditioning

```text
Effect:
Theater and concert Energy costs -7%
```

Applied after the normal Stamina modifier.

---

### Event Conditioning

```text
Effect:
Meet & Greet and Video Call Energy costs -10%
```

---

### Rehearsal Efficiency

```text
Effect:
Concert rehearsal Energy cost -15%
```

Does not reduce actual concert performance cost.

---

# 9. Member Development Bonuses

### Professional Coaching

```text
Effect:
Normal training EXP +10%
```

---

### Youth Development Program

```text
Effect:
Trainee training EXP +15%
```

Does not affect established members.

---

### Setlist Academy

```text
Effect:
Setlist familiarity gain +20%
```

Helps build understudies and flexible theater lineups.

---

### Cross-Training Program

```text
Effect:
Training a member's currently lowest core skill gives +12% EXP
```

Encourages balanced development.

---

# 10. Audition / Scouting Bonuses

### Talent Network

```text
Effect:
+2 audition finalists
```

Important:

```text
Does NOT increase audition intake cap.
```

It increases choice, not roster size.

---

### Advanced Scouting

```text
Effect:
Candidate scouting accuracy +12%
```

Narrows uncertainty around:

```text
Stats
Potential
Development profile
```

---

### Recruitment Office

```text
Effect:
Audition operating cost -15%
```

---

### Youth Outreach

```text
Effect:
Audition applicant pool +15%
```

This may indirectly improve finalist quality, but it does not guarantee stronger candidates.

---

# 11. Fan / Risk Bonuses

### Fan Relations Department

```text
Effect:
Fan Trust losses from normal management decisions -8%
```

Does not apply to every possible penalty unless explicitly configured.

---

### Crisis Communications

```text
Effect:
Fan Trust and Reputation loss caused by Drama events -15%
```

Does NOT:

```text
Cancel Drama
Shorten suspension
Prevent refunds
Restore cancelled activities
```

---

### Community Outreach

```text
Effect:
Fan conversion from theater performances +10%
```

---

### Digital Strategy

```text
Effect:
Digital fan acquisition from MV and Video Call activity +8%
```

---

### Fan Event Marketing

```text
Effect:
M&G and VC ticket-selling speed +10%
```

Does NOT increase true underlying demand.

---

# 12. Concert Bonuses

### Venue Network

```text
Effect:
+1 additional venue choice whenever concert venues are generated
```

This is a system bonus, not a stat bonus.

Example:

```text
Normal offers:
2,100
4,500
6,800

With Venue Network:
2,100
4,500
6,800
8,200
```

The additional option is still generated using RNG.

---

### Concert Promoter Network

```text
Effect:
Concert ticket-selling speed +10%
```

Especially useful for shorter selling periods.

---

### Live Production Team

```text
Effect:
Concert production quality +8%
```

Should be balanced carefully.

---

# 13. MV / Creative Bonuses

### Creative Network

```text
Effect:
Minimum MV quality roll +5
```

This raises the floor, not the ceiling.

Example:

```text
Normal quality roll:
0–100

With bonus:
5–100
```

Exact implementation can use a more controlled quality formula.

---

# 14. Theater Risk Bonus

### Understudy Program

```text
Effect:
Emergency replacement setlist-unfamiliarity penalty -50%
```

Useful during:

```text
Drama suspension
Graduation
Fatigue
Unexpected unavailability
Roster shortage
```

This does not make the substitute fully trained.

---

# 15. Bonus Stacking Rules

Default:

```text
Identical bonus:
Cannot stack with itself
```

If two different bonuses affect the same system, use controlled stacking.

Example:

```text
Base theater running cost:
100%

Theater Operations:
-12%

Lean Operations:
-6%
```

Recommended final modifier:

```text
100% × 0.88 × 0.94
```

rather than:

```text
100% - 18%
```

Multiplicative stacking makes extreme combinations easier to control.

---

# 16. Pre-Run Bonus Selection UI

Suggested flow:

```text
NEW RUN
    ↓
Seed / Difficulty
    ↓
Management Perks
    ↓
Choose 3 Bonuses
    ↓
Confirm Loadout
    ↓
Run Starts
```

Example:

```text
SELECT 3

[ Theater Partnership ]
[ Recovery Program ]
[ Venue Network ]
[ Advanced Scouting ]
[ Fan Relations Department ]
[ Youth Development Program ]
```

The player should be able to inspect exact numerical effects before confirming.

---

# 17. Bonus Locking

Once the run starts:

```text
Loadout is locked.
```

No buying new bonuses during the run.

No swapping bonuses mid-run.

No temporary bonus shop.

This keeps the bonus system part of **pre-run strategy**.

---

# 18. Graduation System — Purpose

Graduation is one of the primary long-term roster attrition mechanics.

The player should not control whether a member graduates.

The player controls how well the organization prepares for and handles the loss.

Graduations create pressure on:

```text
Roster size
Theater viability
Center succession
Senbatsu depth
Fan-event revenue
Concert lineup depth
Member development
Audition timing
```

The system must be paced carefully because the theater requires a minimum of 12 available members.

---

# 19. Graduation Eligibility

Starting members and generated audition members should use different eligibility logic.

## Starting Roster

Starting real-world members already existed before the simulation begins.

Therefore they do not all need to wait multiple in-game years before becoming graduation-eligible.

At run initialization, generate a fictional hidden gameplay value such as:

```text
Career Stage
```

Possible values:

```text
Early
Established
Veteran
```

This value exists only for the save.

It is not intended as a real-world judgment.

Suggested earliest eligibility:

```text
Early:
Year 3+

Established:
Year 2+

Veteran:
Year 2+
```

Exact distribution should be tuned.

---

# 20. Generated Members

Audition-generated members should have a minimum tenure before becoming graduation-eligible.

Recommended:

```text
Minimum tenure:
2 in-game years
```

Example:

```text
Member joins:
Year 2 Week 46

Earliest graduation eligibility:
Year 4 Week 46
```

This prevents newly recruited members from immediately leaving.

---

# 21. Graduation RNG

Graduation should not simply be:

```text
Every eligible member has X% weekly chance.
```

That can create extreme clusters.

Use a controlled yearly or seasonal graduation budget / pressure system.

Suggested flow:

```text
Start of Year
    ↓
Generate Graduation Pressure
    ↓
Determine approximate number of possible graduations
    ↓
Select eligible members over the year
    ↓
Space announcements/departures
```

The exact member selection remains random.

---

# 22. Graduation Pace Targets

Initial recommended pacing:

```text
Year 1:
0–3 graduations

Year 2+:
Typical 2–5 graduations/year

High-turnover year:
6

Extreme maximum:
7
```

These are balance targets, not necessarily fixed guaranteed values.

The goal is to avoid:

```text
10+ members suddenly leaving in a short period
```

unless a special future mode intentionally allows it.

---

# 23. Graduation Spacing

Graduations should usually be spaced.

Recommended:

```text
Minimum normal gap between new graduation announcements:
2–4 weeks
```

Multiple previously announced graduations can still overlap.

Example:

```text
Week 10:
Member A announces graduation

Week 13:
Member B announces graduation

Week 18:
Member A graduates

Week 21:
Member B graduates
```

The exact dates can vary.

---

# 24. Graduation Announcement Lead Time

Graduation should normally be announced before the member actually leaves.

Suggested lead time:

```text
6–12 weeks
```

This gives management time to react.

Possible effects:

```text
Schedule final theater performances
Develop successor
Assign final center
Prepare graduation merchandise
Plan graduation segment
Rebalance fan events
Prepare audition urgency
```

---

# 25. Graduation Management

Once announced, the player may decide:

```text
Final Theater Show
Graduation Segment
Graduation Concert / Special Segment
Final Center Opportunity
Graduation Song
Merchandise
Mentorship
Successor Training
```

These choices can affect:

```text
Fan Trust
Fan Satisfaction
Money
Legacy
Mentee Development
```

They do not cancel graduation.

---

# 26. Graduation and Energy

A graduating member remains a normal schedulable member until the final graduation date unless another system makes them unavailable.

Their Energy continues working normally.

After final graduation:

```text
member.status = "graduated"
member.theaterEligible = false
```

They no longer count toward theater roster size.

---

# 27. Graduation and Audition Balance

The core long-term roster equation is:

```text
Roster Change =
New Audition Members
-
Graduated Members
-
Temporary Unavailable Members
```

Typical example:

```text
Starting Year Roster:
20

Graduations:
-4

New Generation:
+4

End Year:
20
```

Bad year:

```text
Starting:
18

Graduations:
-6

New Generation:
+3

End:
15
```

Repeated bad years push the run toward failure.

---

# 28. Audition Reminder

Relevant previously-decided audition rules:

```text
Auditions can only start in Q4.

Allowed:
October
November
December

Player chooses exact start week.

First audition:
Maximum 4 selected members.

Later generations:
Usually 3–5 members.

6 members:
Large / uncommon intake.

Fan Trust + Reputation:
Influence intake cap and candidate quality.
```

The player is never forced to fill every available intake slot.

---

# 29. Why Small Generations Matter

Small generation sizes ensure that auditions do not instantly erase graduation pressure.

The player should not be able to automatically replace:

```text
6 graduates
```

with:

```text
8 brand-new members
```

every year.

Sometimes:

```text
Graduations:
5

Audition intake:
3
```

Net roster loss:

```text
-2
```

This is intentional.

Roster survival should be a long-term management challenge.

---

# 30. Theater Minimum Roster Rule

Hard rule:

```text
Theater requires:
12 available theater-eligible members.
```

If fewer than 12 eligible members are available, the theater cannot operate.

The theater is the core organizational survival condition.

---

# 31. Theater-Eligible Member Definition

A member counts toward the minimum 12 if:

```text
Member is currently active
AND
Member is allowed to perform theater
AND
Member is not currently suspended/unavailable
```

Both established members and trainees may count.

Recommended:

```text
Trainees count toward the 12-member minimum.
```

This lets the player survive with trainee-heavy lineups.

However, low skill and low setlist familiarity can significantly reduce theater quality.

---

# 32. Theater-Eligible Calculation

Conceptually:

```js
theaterEligibleCount = members.filter(member =>
  member.status === "active" &&
  member.canPerformTheater &&
  !member.scheduleLocked &&
  !member.temporarilyUnavailable
).length;
```

Graduated members do not count.

Members suspended by Drama do not count.

---

# 33. Roster Danger Levels

Suggested visible warnings:

```text
23+ eligible
COMFORTABLE

18–22
STABLE

15–17
THIN

13–14
DANGER

12
CRITICAL

0–11
THEATER CANNOT OPERATE
```

These labels are tuning/UI values.

The important hard threshold is 12.

---

# 34. Run Ending Condition

The run concludes when:

```text
theaterEligibleCount < 12
```

Meaning:

```text
0–11 available theater-eligible members
```

The theater can no longer assemble its minimum required lineup.

This is the primary natural end condition of the run.

---

# 35. Temporary Unavailability and Run Ending

Temporary unavailability counts.

Example:

```text
Active roster:
12

Drama suspension:
1

Available theater members:
11
```

Result:

```text
Theater cannot run.
```

This can end the run.

This is intentionally harsh and makes roster redundancy important.

The player should be warned when operating at or near the 12-member minimum.

---

# 36. Drama Interaction

Previously decided Drama rules:

```text
Drama disabled in Year 1.

Drama enabled from Year 2.

One member may be suspended.

Suspension duration:
4 weeks.

Suspended member:
Cannot participate in any activity.

After suspension:
Returns with 100 Energy.

After return:
8–16 week Drama cooldown.

After cooldown:
Weekly Drama RNG resumes.
```

Because suspended members do not count toward theater availability, Drama can directly cause run failure if the roster is already critically thin.

---

# 37. Graduation Can Cause Run Failure

Example:

```text
Current theater-eligible roster:
12

Member graduates:
-1

Remaining:
11

RUN ENDS
```

This makes graduation planning and Q4 audition timing critical.

---

# 38. Q4 Audition Timing Can Save or Kill a Run

Example:

```text
September:
Roster = 14

3 graduations are already scheduled.

Projected:
11
```

The player can start the Q4 audition early.

Example:

```text
October W1:
Audition starts

November:
New members join

Roster survives.
```

If the player delays the audition until December hoping for higher Fan Trust / Reputation:

```text
Graduations complete first.

Roster:
11

Theater fails.

RUN ENDS.
```

This creates a meaningful tradeoff between:

```text
Early audition:
Safer roster replenishment

Late audition:
Potentially better reputation, candidate pool, or intake conditions
```

---

# 39. No Fixed Run Duration

There should be no mandatory fixed number of years.

The run lasts:

```text
As long as the player can keep the theater operational.
```

Possible runs:

```text
3 years
6 years
11 years
20+ years
```

depending on:

```text
Graduation RNG
Audition quality
Audition timing
Fan Trust
Reputation
Drama
Roster development
Financial health
Player decisions
```

---

# 40. Minimum Possible Run Length

There is no single fixed minimum unless graduation pacing is hard-capped.

With the recommended controlled pacing:

```text
Year 1:
Maximum around 3 graduations

Year 2+:
Maximum around 7 in an extreme year
```

a run should not normally collapse immediately unless the starting roster is already near the 12-member threshold.

The exact theoretical shortest run should be calculated using:

```text
Starting theater-eligible roster size
-
Maximum Year 1 graduations
+
First Q4 audition intake
-
Maximum Year 2 graduations
-
Temporary Drama loss
```

Example formula:

```js
yearEndRoster =
  startingRoster
  - graduations
  + newMembers;
```

Then apply temporary availability:

```js
availableRoster =
  activeRoster
  - suspendedMembers
  - temporarilyUnavailableMembers;
```

Run ends if:

```js
availableRoster < 12;
```

---

# 41. Recommended Graduation Safety Logic

To prevent impossible or absurd early runs, the graduation generator should know the roster state.

Do not make graduations fully independent.

Recommended guardrail:

```text
If projected active roster becomes dangerously low,
reduce probability of additional graduation generation.
```

But do NOT guarantee safety.

Example:

```text
Eligible roster:
14

Already announced graduations:
2

Projected roster:
12
```

Additional graduations should become much less likely.

However:

```text
Drama
Temporary unavailability
Player delaying audition
```

can still push the roster below 12.

This preserves danger without letting raw RNG destroy every run unfairly.

---

# 42. Optional Hard Graduation Guardrail

If needed after playtesting:

```text
Do not generate a NEW graduation announcement if:
Projected active roster after all announced graduations < 12
```

Important:

This only protects against newly generated graduation announcements.

It does NOT protect against:

```text
Drama
Temporary absence
Player choosing too few audition members
Existing graduation commitments
Other future disruption systems
```

Use this only if graduation RNG proves too punishing.

---

# 43. Run-End Sequence

When theater eligibility falls below 12:

```text
THEATER OPERATIONS CHECK
        ↓
Eligible Members = 11
        ↓
Minimum Required = 12
        ↓
THEATER CANNOT OPERATE
        ↓
RUN ENDS
```

Suggested presentation:

```text
JKT48 THEATER OPERATIONS SUSPENDED

Available Members:
11

Required:
12

Management can no longer maintain
the minimum theater lineup.
```

Then show the run summary.

---

# 44. Run Summary

Suggested statistics:

```text
Years Survived
Weeks Survived
Theater Shows Held
Largest Active Roster
Lowest Safe Roster
Generations Recruited
Members Recruited
Graduations
Drama Suspensions
Singles Released
MVs Produced
M&G Tickets Sold
VC Tickets Sold
Concerts Held
Largest Concert
Peak Fanbase
Peak Fan Trust
Peak Reputation
Money Earned
Money Spent
```

Also show:

```text
Final Active Roster
Final Theater-Eligible Roster
Cause of Run End
```

Example:

```text
Years Survived:
8

Final Active Members:
12

Drama Suspended:
1

Theater-Eligible:
11

Cause:
THEATER ROSTER FAILURE
```

---

# 45. Meta Currency Reward at Run End

The run-end screen should also calculate the meta reward used to unlock pre-run bonuses.

Suggested factors:

```text
Years Survived
Weeks Survived
Management Grade
Fan Trust Peak
Reputation Peak
Concert Milestones
Audition Milestones
Member Development
Financial Performance
Rare Achievements
```

Do not reward only victory, because there is no conventional victory condition.

A longer and better-managed run should naturally produce more meta currency.

---

# 46. Core Strategic Loop Created by These Systems

The bonus, graduation, audition, drama, and theater systems should combine into:

```text
PRE-RUN
Choose permanent bonuses
        ↓
RUN START
Manage current roster
        ↓
Members graduate
        ↓
Roster shrinks
        ↓
Q4 audition opportunity
        ↓
Choose timing
        ↓
Recruit limited 3–5 member generation
        ↓
Develop trainees
        ↓
Maintain theater depth
        ↓
Drama / temporary losses happen
        ↓
Roster redundancy tested
        ↓
Repeat
        ↓
Available members fall below 12
        ↓
RUN ENDS
        ↓
Earn meta currency
        ↓
Unlock more pre-run bonuses
        ↓
NEW RUN
```

---

# 47. Important Design Principle

The player should never feel like:

```text
"I can just recruit enough members every year to stay safe forever."
```

Audition intake is intentionally limited.

At the same time, the player should also not feel like:

```text
"The RNG randomly deleted 15 members and I had no possible response."
```

Graduation pacing must be controlled enough to allow strategic counterplay.

The intended tension is:

> The player usually sees roster danger coming, but cannot always solve it perfectly.

---

# 48. Hard Rules Currently Decided

Treat these as locked until intentionally changed.

```text
PRE-RUN BONUSES

Bonuses are selected before a run.
Bonuses remain active for the entire run.
Bonuses cannot normally be changed mid-run.
Player can only equip a limited number.
Recommended starting slots: 3.
Overall system title/name is intentionally undecided.


GRADUATION

Graduation is outside direct player control.
Generated audition members should have minimum tenure before eligibility.
Recommended minimum generated-member tenure: 2 years.
Graduation should be paced rather than pure unrestricted weekly RNG.
Player can prepare for graduation but cannot cancel it.


AUDITION

Auditions start only in Q4.
First audition max intake: 4.
Later generations usually: 3–5.
6 members is a large/uncommon intake.
Fan Trust + Reputation affect audition opportunities.


THEATER

The theater requires 12 available theater-eligible members.
Trainees count toward the minimum if they are allowed to perform.
Suspended/unavailable members do not count.


RUN END

No fixed year limit.
Run ends when available theater-eligible members fall below 12.
Temporary Drama suspension can therefore cause run failure.
Graduation can cause run failure.
Poor audition timing can cause run failure.
```

---

# 49. Balance Values Still Open

Keep these in config rather than hardcoded.

```text
Bonus percentages
Bonus unlock costs
Meta currency reward rate
Equipped bonus slot progression
Graduation yearly count
Graduation announcement spacing
Graduation lead time
Starting-member career-stage distribution
Generated-member minimum tenure
Roster danger labels
Graduation safety guardrails
```

---

# 50. Suggested Config Structure

Example:

```js
export const BALANCE = {
  theater: {
    minimumEligibleMembers: 12
  },

  bonusSystem: {
    baseEquippedSlots: 3,
    maxEquippedSlots: 4
  },

  graduation: {
    generatedMemberMinimumTenureYears: 2,
    year1MaxGraduations: 3,
    normalYearMinGraduations: 2,
    normalYearMaxGraduations: 5,
    extremeYearMaxGraduations: 7,
    minAnnouncementGapWeeks: 2,
    maxAnnouncementGapWeeks: 4,
    minLeadTimeWeeks: 6,
    maxLeadTimeWeeks: 12
  },

  audition: {
    firstRunAuditionMax: 4,
    commonGenerationMin: 3,
    commonGenerationMax: 5,
    rareLargeGenerationMax: 6
  }
};
```

These numbers should be treated as starting balance values rather than permanent immutable rules unless explicitly locked later.

---

# 51. Final Design Goal

These systems should make roster size itself one of the most important strategic resources in the game.

The player is not simply trying to maximize:

```text
Money
Popularity
Member stats
Concert size
```

They are also trying to maintain enough organizational depth to keep the theater alive.

A high-performing but extremely thin roster may be more dangerous than a slightly weaker but deep roster.

The central long-term question becomes:

> Can management keep developing and recruiting enough members to survive graduations, fatigue, Drama, and other losses while still operating the theater with at least 12 available members?
