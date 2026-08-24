# Schedule, Roster Sorting, Event Visibility, Center Display, VC/M&G Re-Eligibility, and Voucher Stat Editing Plan

## Objective

Improve scheduling, roster-management UX, event visibility, and several state/eligibility bugs found during playtesting.

This plan covers:

1. Reuse the Training-section Core/Trainee sorting system in Schedule and Members.
2. Add a full-year calendar/history view for planning and reviewing the whole year.
3. Make Festival/event timing, participating members, Energy cost, and injury effects clearly visible.
4. Fix the Single Production Center display/state bug.
5. Re-evaluate injured members for VC/M&G based on the actual event date.
6. Fix voucher-based stat editing becoming unavailable before the actual edit limit is reached.

Do not change unrelated gameplay balance unless required to fix one of these issues.

---

# 1. Reuse Core / Trainee Sorting Across Sections

## Current Problem

The Training section already supports sorting/filtering members by:

```text
All Members
Core / Inti
Trainee
```

Schedule / Jadwal and Members / Anggota do not.

This creates inconsistent UX and makes larger rosters harder to manage.

## Goal

Reuse the same sorting/filtering behavior in:

```text
Schedule / Jadwal
Members / Anggota
```

If other member-list screens use similar data, audit whether the same shared control can be reused there too.

## Preferred Implementation

Do not create duplicate filtering logic per page.

Extract/reuse the current Training logic into a shared helper/component.

Example:

```js
filterMembers(members, {
  memberType: "all" | "core" | "trainee",
  sortBy: "...",
  order: "asc" | "desc"
});
```

or:

```jsx
<MemberSortControls ... />
```

## Required Behavior

- Filter updates immediately.
- Filter is view-only.
- It does not mutate member data.
- It does not reset selected week/day.
- It does not reset current scheduling state.
- Training behavior must remain unchanged.
- Use existing localization for All / Core / Trainee.

---

# 2. Full-Year Calendar / Schedule History

## Current Problem

Players currently need to manually switch:

```text
Month
Week
```

to inspect or plan a whole year.

This is cumbersome for long-range planning of:

```text
Video Call
Meet & Greet
Theater
Festival
MV
Concert
Audition
Graduation
Other Events
```

## Goal

Add a full-year calendar view.

The player should be able to:

```text
View all 12 months
Inspect scheduled activities
Open a month/week/day
Plan allowed future events
Review past schedule history
```

Suggested navigation:

```text
[ Week ] [ Month ] [ Year ]
```

## Year View

Display all 12 months in a compact layout.

Example:

```text
JAN FEB MAR
APR MAY JUN
JUL AUG SEP
OCT NOV DEC
```

Each month should show compact event indicators/counts.

Example:

```text
MARCH

VC        2
Theater   7
Festival  1
MV        1
```

Do not try to show every member name in the year overview.

Clicking a month should open the detailed Month view.

Clicking an event should open the event detail.

## Long-Range Planning

Allow future event scheduling where game rules already permit it.

Examples:

```text
Plan monthly VC campaigns for the year
Plan M&G campaigns
Reserve event weeks
Plan known major events
```

Do not bypass existing restrictions.

Examples:

```text
Year-End M&G:
Only in allowed Oct–Nov window.

Anniversary Concert:
Only in allowed December window.

Audition:
Only Q4.
```

## Event Status

Differentiate:

```text
Planned
Confirmed
Completed
Cancelled
```

Past activities should normally be read-only.

## Schedule History

Past schedule entries should remain viewable for the entire run.

Where relevant, show:

```text
Participating members
Energy before
Energy cost
Energy after
Result
Revenue
Fan gain/loss
Injury/unavailability result
```

---

# 3. Festival / Event Schedule, Participation, Energy, and Injury Visibility

## Current Problem

For Festival and similar invitations, it is currently unclear:

```text
What exact day the event happens
Which members participate
Whether the event consumes Energy
How much Energy it costs
Whether injury/unavailability can happen
```

A member can finish a Festival and then appear injured, while the player cannot clearly see the relationship between the Festival, the participating member, and the Energy/risk impact.

## Goal

Every event that can affect member state must be represented clearly in the schedule and event-detail UI.

If an event can:

```text
Consume Energy
Cause injury/unavailability
Change stats
Affect fan growth
```

the relevant participating members and effects must be visible.

## Event Detail Requirement

When a Festival or similar event is accepted, show:

```text
Event Name
Date
Week
Day
Participating Members
Energy Cost
Expected Rewards
Physical Load / Injury Risk if applicable
```

If date is generated automatically, reveal it immediately.

If the player chooses a date, require the date before confirmation.

## Member Participation

Show all participating members.

Example:

```text
Festival ABC
Saturday — Week 14

Members:
Member A
Member B
Member C
Member D
```

If lineup editing is allowed, let the player edit before the event locks.

If the game auto-selects members, clearly show who was selected.

## Energy Visibility

Before event:

```text
Member A
Current Energy: 74
Festival Cost: -20
Projected Energy: 54
```

After event:

```text
Member A
Before: 74
Cost: -20
After: 54
```

Use the existing Stamina/fatigue formula consistently.

Do not silently deduct Energy.

## Injury / Unavailability Visibility

If the event can cause injury/unavailability, communicate the risk at a readable level.

Example:

```text
Physical Load:
Heavy

Injury Risk:
Medium
```

No need to expose exact hidden RNG percentages unless the existing design does so.

If injury occurs, show:

```text
Affected member
Source event
Unavailable duration
Future schedule conflicts
```

Example:

```text
Member A was injured following Festival ABC.

Unavailable:
2 weeks

Affected future activities:
3
```

## Calendar Integration

Accepted Festival and similar events must appear in:

```text
Week View
Month View
Year View
Member Schedule
History
```

No invisible workload.

---

# 4. Single Production Center Display Bug

## Current Problem

In Single Production:

```text
Player selects Member A as Center.
```

After switching between sections/tabs, the UI sometimes displays another member as the Center.

Observed behavior indicates:

```text
The final single still uses the originally selected correct Center.
```

So this likely affects presentation/local state rather than the authoritative game state.

## Goal

The Center shown in every Single Production section must always match the actual stored Center selection.

Switching sections must never visually replace it.

## Investigation

Audit duplicate/local state such as:

```text
selectedCenter
previewCenter
defaultCenter
currentCenter
formCenter
```

Possible bug:

```text
Component remounts
→ local state initializes again
→ default/first member is displayed
→ authoritative production state remains correct
```

## Preferred Fix

Use one source of truth:

```js
singleProduction.centerMemberId
```

All sections should derive the visible member from that ID.

Example:

```js
const centerMember = members.find(
  member => member.id === singleProduction.centerMemberId
);
```

Avoid separate center state per tab.

## Regression Tests

Test:

```text
1. Select Member A.
2. Switch Single Production section.
3. Return.
4. Member A still displays.

5. Navigate away.
6. Return before finalizing.
7. Member A still displays.

8. Finalize.
9. Final single center is Member A.

10. Change center to Member B.
11. Repeat section-switch test.
12. Member B remains displayed and finalized.
```

---

# 5. VC / M&G Injury Re-Eligibility Before Event Date

## Current Problem

When a future VC or M&G campaign is created, a member who is injured/unavailable at creation time can be excluded from the campaign roster.

If she recovers before the actual VC/M&G date, she may remain excluded incorrectly.

Availability at campaign creation time should not permanently determine event-day eligibility.

## Goal

Evaluate eligibility based on the member's status on the actual event/session date.

Example:

```text
Week 2:
Member A injured.

Week 3:
M&G campaign created.

Event:
Week 7.

Recovery:
Week 5.
```

Expected:

```text
Member A is eligible for the Week 7 M&G.
```

## Eligibility Logic

Separate:

```text
Current availability
```

from:

```text
Availability on event date
```

Preferred helper:

```js
function canParticipateOnDate(member, eventDate) {
  return !isUnavailableOnDate(member, eventDate);
}
```

Do not only check:

```js
member.currentlyInjured
```

for future events.

## Availability Data

Member state should expose an availability range or equivalent data.

Example:

```js
member.unavailability = {
  startWeek: 3,
  endWeek: 5,
  reason: "injury"
};
```

Then:

```text
VC Week 7:
Eligible.

M&G Week 4:
Not eligible.
```

## Campaign UI

If a member is currently injured but expected to recover before the event:

```text
Currently unavailable
Expected to recover before event
```

She should remain selectable.

If she will still be unavailable on event date:

```text
Unavailable on event date
```

Disable selection or show a blocking warning.

## Revalidation

Re-check availability:

```text
Before ticket sales lock, if applicable
Before event day
```

If a new injury or Drama suspension overlaps the event later, existing:

```text
refund
cancellation
schedule-conflict
```

logic should still apply.

## Important

Recovered members become:

```text
eligible
```

They should not automatically receive sessions the player never assigned.

If a member was originally intended for the campaign but excluded only because of temporary injury, preserve/restore the planned assignment where possible.

Otherwise prompt the player to assign sessions.

---

# 6. Voucher Stat Editing Can Lock Before Limit

## Current Problem

Sometimes a member's stats can no longer be edited using a voucher even though the configured voucher/stat-edit limit has not yet been reached.

This can appear as:

```text
Edit button disabled
Voucher action unavailable
Stat treated as capped
```

while the member should still have remaining valid voucher edits.

This may be:

```text
UI state bug
Incorrect counter
Off-by-one validation
Wrong per-member/per-stat limit
Stale persisted state
Voucher consumption/state synchronization issue
```

## Goal

A member must remain editable with a valid voucher until the actual configured edit limit is reached.

The UI and engine must use the same authoritative validation rule.

## Required Investigation

Find the authoritative values for:

```text
Voucher quantity
Number of edits used
Maximum edits allowed
Per-member limit
Per-stat limit, if any
Run/account limit, if any
```

Audit whether the UI is calculating eligibility separately from the engine.

Avoid logic like:

```js
disabled={editCount >= someLocalCalculatedLimit}
```

if the engine uses a different rule.

## Preferred Single Source of Truth

Create/reuse a helper such as:

```js
canEditMemberStatWithVoucher(member, stat, gameState)
```

Return structured information:

```js
{
  allowed: true,
  editsUsed: 2,
  editLimit: 3,
  vouchersAvailable: 4,
  reason: null
}
```

or:

```js
{
  allowed: false,
  editsUsed: 3,
  editLimit: 3,
  vouchersAvailable: 4,
  reason: "edit_limit_reached"
}
```

Use the same function for:

```text
Button enabled/disabled state
Voucher confirmation
Actual stat-edit transaction
Tooltip/error reason
```

## Boundary Rules

Test exact boundaries.

If limit is 3:

```text
0 / 3 used → editable
1 / 3 used → editable
2 / 3 used → editable
3 / 3 used → locked
```

Do not lock at:

```text
2 / 3
```

This should explicitly catch off-by-one bugs.

## Voucher Availability

Editing also requires:

```text
voucher count > 0
```

The UI should distinguish:

```text
No vouchers remaining
```

from:

```text
Member stat edit limit reached
```

Do not show a generic disabled state with no explanation.

## Per-Stat vs Per-Member Limits

If the game intends the limit to be per member rather than per individual stat, verify that editing one stat does not incorrectly lock all remaining edits too early.

If the limit is per stat, verify that editing Vocal does not incorrectly consume the limit for Dance unless explicitly intended.

Document the actual intended rule in code/tests.

## Persistence / Save Audit

Check whether:

```text
editCount
voucher usage
stat-edit history
```

is persisted correctly in IndexedDB/backend save state.

Potential stale-state bug:

```text
Voucher edit succeeds
UI increments local count
Save reloads stale count
UI derives incorrect lock state
```

or the reverse.

Ensure migrated/older saves receive sane defaults.

## Regression Tests

At minimum:

```text
1. Member with 0 edits used and voucher available can edit.
2. Member with limit - 1 edits used can still edit.
3. Final allowed edit succeeds.
4. Exactly at limit, further edit is blocked.
5. Voucher count decreases exactly once per successful edit.
6. Failed edit does not consume voucher.
7. Reload/save preserves correct edit count.
8. Switching member/section does not incorrectly lock editing.
9. Different members track their edit limits independently.
10. Error reason correctly distinguishes no voucher vs edit limit.
```

---

# 7. Shared Availability Model

The schedule/event issues suggest using one consistent member-availability helper.

Recommended:

```js
getMemberAvailability(member, date)
```

Possible result:

```js
{
  available: true,
  reasons: [],
  projectedEnergy: 72
}
```

or:

```js
{
  available: false,
  reasons: ["injury"],
  unavailableUntil: ...
}
```

Use across:

```text
Schedule
Theater
VC
M&G
Festival
Concert
MV
Training
Single-related activities
```

Avoid feature-specific interpretations of member availability.

---

# 8. Shared Schedule Event Model

For Year View and event visibility, scheduled activities should use a consistent event object.

Example:

```js
{
  id,
  type,
  titleKey,

  year,
  month,
  week,
  day,

  startDate,
  endDate,

  memberIds: [],

  status:
    "planned" |
    "confirmed" |
    "completed" |
    "cancelled",

  energyCost,
  result,
  metadata
}
```

This same event should feed:

```text
Week calendar
Month calendar
Year calendar
Member schedule
History
Event result UI
```

Avoid maintaining duplicate event state per calendar view.

---

# 9. Localization

All new UI text must use the existing English/Indonesian localization system.

New labels may include:

```text
Year View
All Members
Core
Trainee
Projected Energy
Energy Cost
Physical Load
Injury Risk
Participating Members
Currently Unavailable
Expected to Recover Before Event
Unavailable on Event Date
Schedule History
Planned
Confirmed
Completed
Cancelled
Voucher Edit Limit Reached
No Voucher Available
Edits Remaining
```

Do not introduce hardcoded English-only strings.

---

# 10. Acceptance Criteria

## Sorting

- [ ] Schedule supports All / Core / Trainee.
- [ ] Members supports All / Core / Trainee.
- [ ] Behavior matches Training.
- [ ] Shared implementation is used where practical.
- [ ] Filtering does not mutate game state.

## Year Calendar

- [ ] Full-year view exists.
- [ ] All 12 months are visible.
- [ ] Major scheduled events are visible.
- [ ] Past schedules remain inspectable.
- [ ] Future events can be planned where existing rules allow.
- [ ] Clicking month/event opens detail.
- [ ] Existing event-window restrictions remain enforced.

## Festival / Events

- [ ] Event date is visible.
- [ ] Participating members are visible.
- [ ] Energy cost is visible.
- [ ] Projected Energy is visible before event.
- [ ] Actual Energy change is visible afterward.
- [ ] Injury result identifies member and source event.
- [ ] Event appears in relevant calendar/member views.

## Single Center

- [ ] Selected center never changes visually when switching sections.
- [ ] One authoritative center state is used.
- [ ] Center stays correct after navigation.
- [ ] Finalized single matches displayed center.
- [ ] Regression tests cover section switching.

## VC / M&G Re-Eligibility

- [ ] Current injury does not permanently exclude a member from a future event.
- [ ] Event-date availability determines eligibility.
- [ ] Member recovered before event can participate.
- [ ] Member still unavailable on event date cannot participate.
- [ ] Later injuries/suspensions trigger revalidation.
- [ ] Existing refund/cancellation behavior remains valid.
- [ ] Recovered members are made eligible, not silently given new sessions.

## Voucher Stat Editing

- [ ] Voucher stat editing remains available until the true limit is reached.
- [ ] `limit - 1` remains editable.
- [ ] Exact limit locks further edits.
- [ ] Voucher count is validated independently from edit limit.
- [ ] UI and engine use the same eligibility logic.
- [ ] Successful edit consumes exactly one voucher.
- [ ] Failed edit consumes no voucher.
- [ ] Save/reload preserves edit usage correctly.
- [ ] Different members track limits independently.
- [ ] Disabled state explains the actual reason.

---

# 11. Regression Rules

Do not unintentionally rebalance:

```text
Energy costs
Injury probability
Drama probability
VC ticket limits
M&G ticket limits
Concert rules
Audition rules
Graduation rules
Fan growth
Single result calculation
Voucher edit limits
Voucher prices/rewards
```

Unless a currently implemented value is itself the cause of the reported bug.

Primary changes are:

```text
UX consistency
calendar visibility
availability correctness
state synchronization
future-event eligibility
voucher validation correctness
```

---

# 12. Deliverables

Provide a concise implementation summary covering:

```text
1. Shared member sorting/filtering changes
2. Full-year calendar/history implementation
3. Festival/event visibility changes
4. Single Center display bug root cause and fix
5. VC/M&G event-date eligibility logic
6. Voucher stat-edit lock bug root cause and fix
7. Tests added/updated
8. Remaining edge cases
```

---

# 13. Final Design Principle

The scheduling system should make it obvious:

> Who is doing what, when they are doing it, how much Energy it costs, and whether they will actually be available when the event happens.

The roster-management UI should behave consistently across Training, Schedule, and Members.

Voucher-based stat editing should similarly be deterministic and transparent:

> If the player has a valid voucher and the configured edit limit has not been reached, the edit must remain available.
