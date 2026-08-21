# UI Sorting + Context-Aware Management Drama Plan

## Goal

Implement three improvements:

1. Add richer sorting controls to the **Roster** page.
2. Add richer sorting controls to the **Schedule > Squad** section.
3. Make **Management Drama** context-aware so its eligibility and probability are influenced by the player's actual management decisions.

**USER POST SCRIPT EDIT: the checkbox for Seitansai and Last show are position weirdly, try to move it to a better position**

Do not change unrelated roster, schedule, member-stat, or drama mechanics unless required for compatibility.

---

# 1. Roster Page Sorting

Add sorting by:

- Name
- Birthday
- Generation
- Team

Every sort supports:

- Ascending
- Descending

Recommended sort keys:

```js
export const ROSTER_SORT_OPTIONS = Object.freeze([
  'name',
  'birthday',
  'generation',
  'team',
]);
```

Recommended sort directions:

```js
export const SORT_DIRECTIONS = Object.freeze([
  'asc',
  'desc',
]);
```

If a shared sort helper already exists, reuse it.

## UI

Recommended:

```text
Sort by:
[ Name ▼ ]

Order:
[ Ascending ▼ ]
```

or a compact equivalent matching the existing UI.

## Name

Ascending:

```text
A -> Z
```

Descending:

```text
Z -> A
```

Use locale-aware comparison where possible.

## Birthday

Sort by month/day rather than birth year unless the current roster intentionally treats Birthday as full DOB ordering.

Recommended:

```text
ASC: Jan 1 -> Dec 31
DESC: Dec 31 -> Jan 1
```

Reuse the existing birthday/date parser if one exists.

## Generation

Sort numerically.

Example:

```text
ASC:
Gen 1 -> Gen 2 -> ... -> Gen 10

DESC:
Gen 10 -> ... -> Gen 2 -> Gen 1
```

Do not use raw lexical ordering that puts `Gen 10` before `Gen 2`.

## Team

Use an existing canonical team order if the project has one.

Otherwise use alphabetical ordering.

Support ASC/DESC.

## Tie Breakers

Keep sorting deterministic.

Recommended:

```text
Birthday tie -> Name ASC
Generation tie -> Name ASC
Team tie -> Name ASC
```

## Do Not Mutate Source Data

Do not sort the canonical member array in place.

Preferred:

```js
const sortedMembers = [...members].sort(...)
```

or `toSorted()` if supported.

---

# 2. Schedule > Squad Sorting

In the Schedule page's **Squad** section, add sorting by:

- Visible Stat
- Name
- Generation
- Birthday

Every sort supports:

- Ascending
- Descending

Recommended:

```js
export const SQUAD_SORT_OPTIONS = Object.freeze([
  'visible-stat',
  'name',
  'generation',
  'birthday',
]);
```

## Visible Stat

`Visible Stat` is a sort category containing:

```text
Overall
+ every visible member stat
```

Example:

```text
Visible Stat
├── Overall
├── Vocal
├── Dance
├── Performance
├── Variety
├── MC
├── Visual
└── ...
```

Codex must inspect the actual member stat registry and use the real stats.

Do not create a second hard-coded stat list if a central stat definition already exists.

## Visible Stat UI

Recommended:

```text
Sort by:
[ Visible Stat ▼ ]

Stat:
[ Overall ▼ ]

Order:
[ Descending ▼ ]
```

Hide or disable the Stat selector when the selected sort category is not `Visible Stat`.

## Overall

If `overall` already exists:

```text
use it
```

If Overall is derived:

```text
reuse the existing Overall calculation
```

Do not create a separate sorting-only Overall formula.

## Individual Stats

Ascending:

```text
lowest -> highest
```

Descending:

```text
highest -> lowest
```

Recommended default for stat sorting:

```text
Descending
```

unless the existing UI already remembers a user's previous choice.

## Shared Sorting Logic

Roster and Schedule should reuse shared comparison helpers where practical.

Possible helper file:

```text
memberSort.js
```

Possible helpers:

```js
compareMemberName()
compareMemberBirthday()
compareMemberGeneration()
compareMemberTeam()
compareMemberStat()
sortMembers()
```

Avoid separate slightly different implementations in the Roster and Schedule components.

## Squad Selection Must Remain Stable

Sorting the Squad list must not:

- remove selected members
- reset selected member IDs
- change actual scheduled lineup order unless explicitly intended
- mutate canonical member state

Sorting is a display operation.

If a member is selected, they remain selected after changing the sort.

---

# 3. Context-Aware Management Drama

## Core Rule

Management Drama must not be selected from a completely context-free random pool.

The player is effectively the group's management.

Therefore:

```text
management decisions should influence management-drama risk
```

Management Drama should often emerge as a consequence of how the player has actually managed the group.

## Selection Flow

Before selecting a Management Drama:

1. Inspect recent relevant player actions.
2. Determine which Management Drama templates are contextually justified.
3. Modify eligibility and/or weight from those actions.
4. Apply protective factors from good management.
5. Select from the resulting weighted pool.
6. Keep randomness so drama remains unpredictable.

The system should effectively ask:

```text
"What has the player done recently that could plausibly contribute to this controversy?"
```

## Player Actions To Consider

Where existing mechanics allow it, consider:

- member scheduling
- member workload
- rest decisions
- center choices
- lineup decisions
- promotion decisions
- punishment decisions
- suspension decisions
- demotion decisions
- contract termination
- graduation pressure
- campaign spending
- event spending
- MV spending
- financial overspending
- security decisions
- event preparation
- sponsor handling
- crisis statements
- response to Member Drama
- rule enforcement
- repeated favoritism

Use only actions/statistics that actually exist.

Do not invent unrelated subsystems just to feed drama.

## Requirements, Risk Factors, Protective Factors

Recommended concept:

```js
managementDrama({
  id: 'member-overwork',

  baseWeight: 2,

  requirements: [...],
  riskFactors: [...],
  protectiveFactors: [...],
})
```

Do not require this exact schema if the existing drama engine already has a condition/weight system.

## Requirements

Requirements determine whether a drama is eligible.

Example:

```text
Member Health / Pressure Crisis
```

could require one or more of:

```text
an active member
recent high workload
repeated scheduling at low energy
insufficient rest
```

A contextually impossible drama should generally not receive normal weight.

## Risk Factors

Risk factors increase selection weight.

Example:

```text
Overwork Drama
```

risk factors:

```text
repeated low-energy scheduling
high consecutive workload
few/no rest days
multiple major assignments close together
```

## Protective Factors

Good player decisions reduce relevant risk.

Examples:

```text
giving members rest
reasonable schedule rotation
sustainable spending
consistent discipline
good crisis handling
adequate preparation
```

A well-managed group should experience fewer management-caused controversies.

---

# Suggested Management Risk Signals

If useful, maintain small derived risk values rather than rescanning the entire run every time.

Example:

```js
managementRisk = {
  overwork: 0,
  favoritism: 0,
  financialMismanagement: 0,
  ruleInconsistency: 0,
  eventHandling: 0,
  securityNeglect: 0,
  sponsorRelations: 0,
  crisisHandling: 0,
};
```

This is optional.

If the existing game already stores enough recent action history, calculate directly from that instead.

Do not create unnecessary duplicate state.

---

# Example Risk Changes

## Overwork

Repeatedly schedule a member at low energy:

```text
overwork risk +
```

Give sufficient rest:

```text
overwork risk -
```

## Favoritism

Repeatedly use the same member as center despite viable alternatives:

```text
favoritism risk +
```

Rotate opportunities reasonably:

```text
favoritism risk -
```

Do not penalize normal strategic use of strong members. Favoritism risk should require repeated/excessive behavior.

## Financial Mismanagement

Repeated unsustainable overspending:

```text
financial risk +
```

Examples:

```text
major spending while cash reserves are critically low
repeated deficit spending
expensive projects despite warning signs
```

Normal investment should not count as mismanagement by itself.

## Rule Inconsistency

Similar violations receive very different punishments:

```text
rule inconsistency risk +
```

Consistent discipline:

```text
rule inconsistency risk -
```

Use only the minimum disciplinary history needed.

Do not build a huge audit subsystem if none exists.

## Event Handling

Poor preparation, member availability problems, repeated cancellations, or knowingly running events under bad conditions can increase:

```text
Event Controversy
Fan Safety Incident
Management Misconduct / Bad Handling
```

only when supported by current mechanics.

## Crisis Handling

A Member Drama can later escalate into Management Drama depending on the player's response.

Example:

```text
Member Drama:
controversial SNS post

Player response:
reasonable investigation + consistent punishment

=> management-drama escalation risk reduced
```

Versus:

```text
ignore issue
contradictory official statement
obvious favoritism
excessive/unfair punishment

=> management-drama escalation risk increased
```

Possible escalation categories:

```text
Management Misconduct / Bad Handling
Management Rule Inconsistency
Sponsor Backlash
Public backlash
```

---

# Cause vs External Incident

Not every bad event is management's fault.

Example:

```text
A stalker appears
```

may be an external incident.

But if the player had:

```text
ignored repeated warnings
reduced relevant safeguards
poorly handled the response
```

then the incident can become a management controversy.

Where possible, distinguish:

```text
external trigger
```

from:

```text
management-caused escalation
```

---

# Suggested Weighting Model

Conceptually:

```js
finalWeight =
  baseWeight
  * riskMultiplier
  * contextMultiplier
  * protectiveMultiplier;
```

Example only:

```js
finalWeight =
  baseWeight
  * (1 + relevantRisk * 0.15);
```

Do not blindly use this exact number.

Integrate with the current drama-weight system.

## No Guaranteed Drama

High risk should:

```text
increase probability
```

not:

```text
guarantee immediate drama
```

Example:

```text
Repeated overwork
=> significantly higher Overwork Drama probability
```

not:

```text
one bad schedule
=> guaranteed scandal
```

Keep randomness.

---

# Management Drama Context

When a Management Drama is generated, preserve enough context to explain why.

Optional runtime data:

```js
{
  causeType: 'overwork',
  affectedMemberId: '...',
  relatedCampaignId: null,
  relatedEventId: null,
}
```

Do not store huge snapshots.

## Contextual Description

Prefer descriptions tied to the actual cause.

Generic:

```text
Fans accuse management of overworking a member.
```

Better:

```text
{member} shows visible exhaustion after being scheduled repeatedly with little recovery time, and fans criticize management's workload decisions.
```

---

# Example Management Drama Template

```js
managementDrama({
  id: 'member-overwork',

  category: 'Member Health / Pressure Crisis',

  baseWeight: 2,

  title:
    'An overloaded schedule raises concerns',

  titleId:
    'Jadwal yang terlalu padat menimbulkan kekhawatiran',

  detail:
    '{member} shows visible exhaustion after a demanding schedule, and fans accuse management of ignoring workload limits.',

  detailId:
    '{member} terlihat kelelahan setelah jadwal yang berat, dan penggemar menuduh manajemen mengabaikan batas beban kerja.',

  contextKey: 'overwork',
})
```

---

# Recommended Drama Mapping

## Member Health / Pressure Crisis

Increase from:

```text
overwork
low-energy scheduling
too little rest
repeated major appearances
```

Reduce from:

```text
rest
reasonable workload
schedule rotation
```

## Center / Management Favoritism

Increase from:

```text
same center repeatedly
same members repeatedly receiving premium jobs
viable alternatives consistently ignored
```

Reduce from:

```text
reasonable rotation
performance-based choices
varied opportunities
```

## Management Rule Inconsistency

Increase from:

```text
different punishments for comparable violations
ignored rule-breaking by favored members
```

Reduce from:

```text
consistent discipline
```

## Financial Crisis

Increase from:

```text
repeated overspending
low cash reserve
unprofitable major projects
continuing expensive spending despite warnings
```

Reduce from:

```text
healthy reserves
sustainable spending
profitable operations
```

## Event Controversy

Increase from:

```text
poor preparation
bad scheduling
low participant availability
repeated cancellations
```

## Sponsor Backlash

Increase from:

```text
bad sponsor handling
conflicting obligations
poor campaign execution
```

only if relevant sponsor mechanics exist.

## Mass Graduation / Restructuring

Increase from combinations such as:

```text
very low member morale
high graduation pressure
financial stress
poor management trust
repeated dissatisfaction
```

Do not trigger this solely because normal graduations happen close together.

## Franchise / Contract Dispute

Increase from:

```text
contract conflicts
rights misuse
ignored obligations
```

only when those systems actually exist.

---

# Good Management Must Matter

The system should feel like:

```text
bad management
-> higher relevant management-drama probability

good management
-> lower relevant management-drama probability

external/random pressure
-> still possible
```

It should not feel like the game punishes the player randomly regardless of their decisions.

---

# Shared Sort State

Roster:

```js
{
  sortKey: 'name',
  direction: 'asc',
}
```

Schedule Squad:

```js
{
  sortKey: 'visible-stat',
  visibleStat: 'overall',
  direction: 'desc',
}
```

Persist this only if other UI preferences are already persisted.

Do not add save migration solely for temporary UI sort state unless that matches the project convention.

---

# Test Plan

## Roster Sorting

Test:

```text
Name ASC
Name DESC
Birthday ASC
Birthday DESC
Generation ASC
Generation DESC
Team ASC
Team DESC
```

Verify:

```text
source member array is not mutated
ties are deterministic
Gen 2 / Gen 10 sort numerically
```

If birthday uses month/day, test different birth years to ensure year does not affect ordering.

## Schedule Squad Sorting

Test:

```text
Visible Stat -> Overall ASC
Visible Stat -> Overall DESC
Visible Stat -> each visible stat ASC/DESC
Name ASC/DESC
Generation ASC/DESC
Birthday ASC/DESC
```

Verify:

```text
selected squad IDs stay selected
sorting does not mutate canonical member state
```

## Visible Stat

Verify the selector contains:

```text
Overall
all current visible member stats
```

Prefer deriving it from the central stat registry.

## Management Drama Context

### Overwork

Compare:

```text
A:
well-rested member

B:
same member repeatedly scheduled at low energy
```

Verify:

```text
Overwork-related drama weight in B > A
```

### Favoritism

Compare balanced center use versus repeated same-center use despite alternatives.

Verify:

```text
Favoritism risk increases in the repeated case
```

### Financial Risk

Compare healthy finances against repeated unsustainable overspending.

Verify:

```text
Financial Crisis weight increases
```

### Good Management

Verify protective actions lower or do not increase risk.

Example:

```text
resting an exhausted member
```

should reduce/not increase overwork risk.

### Unrelated Risk

Overwork should not arbitrarily increase:

```text
Franchise / Contract Dispute
```

unless explicitly mapped.

### Randomness

Test changes in:

```text
eligibility / weight
```

rather than expecting high-risk drama to always fire.

---

# Implementation Order for Codex

1. Inspect the Roster member-list component.
2. Inspect the Schedule > Squad component.
3. Find the member fields for:
   - name
   - birthday
   - generation
   - team
4. Find the central visible-stat definition.
5. Find/reuse the existing Overall calculation.
6. Find any existing sorting helpers.
7. Implement shared member comparison/sort helpers.
8. Add Roster sorting:
   - Name
   - Birthday
   - Generation
   - Team
   - ASC/DESC
9. Add Schedule Squad sorting:
   - Visible Stat
   - Name
   - Generation
   - Birthday
   - ASC/DESC
10. Make Visible Stat expose:
    - Overall
    - every currently visible member stat
11. Ensure sorting does not change selection state.
12. Inspect current Management Drama selection and weighting.
13. Inspect which recent player actions are already stored.
14. Reuse existing action/state history where possible.
15. Add contextual eligibility/weight modifiers.
16. Start with signals that can be derived reliably from existing systems:
    - workload/overwork
    - favoritism
    - finances
    - discipline consistency
    - event handling
    - crisis handling
17. Add protective-factor handling.
18. Add affected-member/context resolution where useful.
19. Add/update tests.
20. Verify Member Drama behavior is unchanged.
21. Verify old saves still load.

---

# Acceptance Criteria

## Roster

- Sort by Birthday.
- Sort by Name.
- Sort by Generation.
- Sort by Team.
- All support ASC/DESC.
- Sorting does not mutate canonical member state.
- Sorting is deterministic.

## Schedule Squad

- Sort by Visible Stat.
- Sort by Name.
- Sort by Generation.
- Sort by Birthday.
- All support ASC/DESC.
- Visible Stat contains Overall plus every current visible member stat.
- Existing squad selections survive sort changes.
- Sorting does not unintentionally modify scheduled lineup state.

## Management Drama

- Management Drama considers player actions.
- It is not selected from a context-free random pool.
- Relevant bad management increases relevant drama weight.
- Good management can reduce relevant drama weight.
- Drama remains probabilistic.
- Generated context can identify an affected member/event where relevant.
- Unrelated actions do not arbitrarily increase unrelated drama types.
- Existing Member Drama behavior remains intact.

---

# Important Non-Goals

Do not:

```text
rebalance member stats
change Overall formulas
rewrite the Schedule system
change squad-selection mechanics
change roster membership
change team assignment rules
rewrite the entire Drama system
guarantee drama after one bad action
invent unsupported sponsor/security/contract systems
```

Prefer small reusable helpers and integration with existing state over parallel duplicate systems.
