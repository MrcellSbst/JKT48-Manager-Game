# Schedule Popularity Sort and STS/Last Show Assignment Rules

## Objective

Implement two scheduling improvements:

1. Add **Popularity** as a sorting option in the Schedule section.
2. Prevent the same member from being selected in multiple STS / Last Show dropdowns, and disable the related checklist when no valid member remains available.

Keep the implementation consistent with the existing scheduling UI and member-selection logic.

---

# 1. Add Popularity Sort to Schedule

## Current Requirement

The Schedule section already supports member sorting/filtering.

Add:

```text
Popularity
```

as an available sort option.

## Expected Behavior

When the player selects Popularity:

```text
- Members are sorted by current Popularity.
- Sorting uses the actual current member Popularity value.
- The sort must not modify member data.
- The sort must not reset current schedule assignments.
- The sort should behave consistently with existing sort controls.
```

If the Schedule section supports ascending/descending direction, Popularity should respect that same behavior.

Recommended default when selecting Popularity:

```text
Highest Popularity first
```

unless the existing sort system has a different established default.

## Shared Sorting Logic

If Schedule already reuses a shared member-sorting helper, add Popularity there rather than implementing page-specific logic.

Conceptual example:

```js
case "popularity":
  return b.popularity - a.popularity;
```

Handle missing/null values safely.

Example fallback:

```js
const popularityA = Number(a.popularity ?? 0);
const popularityB = Number(b.popularity ?? 0);
```

## Localization

Add both English and Indonesian labels through the existing localization system.

Example:

```text
EN:
Popularity

ID:
Popularitas
```

Do not hardcode the label inside the component.

---

# 2. Prevent Duplicate STS / Last Show Member Selection

## Goal

A member selected for one STS / Last Show slot must not be selectable in another STS / Last Show dropdown for another show.

The assignment must be unique across all applicable shows.

Example:

```text
Show A
STS / Last Show Member:
Member A
```

Then in:

```text
Show B
STS / Last Show Member dropdown
```

Member A must be disabled or excluded.

The same applies in reverse for every show.

---

# 3. Member Availability in STS / Last Show Dropdowns

## Required Logic

For each STS / Last Show dropdown, determine members already selected by other shows.

Conceptual:

```js
const selectedElsewhere = allShows
  .filter(show => show.id !== currentShow.id)
  .map(show => show.stsLastShowMemberId)
  .filter(Boolean);
```

Then:

```js
const isDisabled =
  selectedElsewhere.includes(member.id);
```

The currently selected member for the current show must remain selectable in its own dropdown.

Do not disable the current show's own existing value.

---

# 4. Dropdown UI Behavior

When a member is selected on another show:

```text
- Show the member in the dropdown if that matches current UI convention.
- Disable the option.
- Prevent selection.
```

Preferred:

```text
Member A — Already assigned
```

or equivalent localized wording if the design supports explanatory labels.

At minimum, the option must be disabled.

Do not silently allow duplicate assignment and resolve it later.

---

# 5. Re-enable Member When Assignment Changes

If the player removes or changes the STS / Last Show member on Show A:

```text
Member A must immediately become available again
in all other eligible dropdowns.
```

This should update without requiring page reload.

Example:

```text
Show A:
Member A selected

Show B:
Member A disabled

Player changes Show A → Member B

Show B:
Member A becomes selectable
Member B becomes disabled
```

---

# 6. Disable Checklist When No STS / Last Show Member Is Available

## Requirement

If a show's STS / Last Show feature uses a checklist/toggle to enable the assignment:

```text
[ ] STS / Last Show
```

and there are no valid members left who can be assigned to that show, disable the checklist.

Example:

```text
All eligible STS / Last Show members
are already assigned to other shows.
```

Then:

```text
STS / Last Show checkbox:
Disabled
```

The player should not be able to enable an STS / Last Show assignment that cannot be completed.

---

# 7. Valid Member Count

Determine availability based on:

```text
Eligible STS / Last Show members
MINUS
Members assigned to other shows
```

Conceptual:

```js
const availableMembers = eligibleMembers.filter(
  member =>
    !selectedElsewhere.includes(member.id)
);
```

If:

```js
availableMembers.length === 0
```

then:

```text
disable checklist
```

unless the current show already has a valid STS / Last Show member selected.

---

# 8. Existing Assignment Exception

Important edge case:

If a show already has:

```text
STS enabled
Member A selected
```

and all other eligible members become unavailable, do NOT disable or clear that show's existing valid assignment.

For that show:

```text
Member A remains valid.
Checklist remains enabled/checked.
```

The "no available members" rule applies to creating a new assignment, not invalidating an existing unique assignment.

---

# 9. If Current Assignment Becomes Invalid

If member eligibility can change for other reasons, such as:

```text
Graduation
Injury
Suspension
Roster removal
Status change
```

use the existing game rules for invalidating or warning about the assignment.

Do not silently move another member into the slot.

If necessary:

```text
- show invalid assignment warning
- require player replacement
```

This duplicate-assignment task should not introduce automatic reassignment.

---

# 10. Single Source of Truth

Avoid implementing separate duplicate checks in:

```text
Checkbox component
Dropdown component
Save handler
Validation handler
```

Create/reuse a shared helper.

Example:

```js
getAvailableStsLastShowMembers({
  currentShowId,
  shows,
  eligibleMembers
});
```

or:

```js
isMemberAvailableForStsLastShow(
  memberId,
  currentShowId,
  shows
);
```

Use the same logic for:

```text
Dropdown disabled options
Checklist disabled state
Final validation
```

---

# 11. Final Validation

UI disabling is not enough.

Before saving/confirming schedule state, validate that no member is assigned to STS / Last Show on multiple shows.

Conceptual check:

```js
const selectedIds = shows
  .map(show => show.stsLastShowMemberId)
  .filter(Boolean);

const hasDuplicates =
  new Set(selectedIds).size !== selectedIds.length;
```

If duplicate data somehow exists:

```text
Block save/confirmation
Show localized validation error
```

Do not allow corrupted duplicate assignments into persisted game state.

---

# 12. Localization

Any new visible text must have both English and Indonesian localization.

Possible strings:

```text
Popularity
Popularitas

Already assigned
Sudah dipilih di show lain

No available member
Tidak ada member yang tersedia

No STS / Last Show member available
Tidak ada member STS / Last Show yang tersedia
```

Follow existing terminology already used by the game.

---

# 13. Acceptance Criteria

## Popularity Sort

- [ ] Popularity appears in Schedule sort options.
- [ ] Sort uses current member Popularity.
- [ ] Highest-first works correctly where applicable.
- [ ] Existing assignments are unaffected.
- [ ] Localization exists in English and Indonesian.

## STS / Last Show Uniqueness

- [ ] A member selected on Show A is disabled on Show B.
- [ ] A member selected on Show B is disabled on Show A.
- [ ] Current show's selected member remains valid in its own dropdown.
- [ ] Changing an assignment immediately frees the previous member.
- [ ] Newly selected member becomes disabled on other shows.
- [ ] Duplicate selection cannot be saved.

## Checklist

- [ ] Checklist is disabled when no eligible unassigned member remains.
- [ ] Checklist remains usable if at least one valid member exists.
- [ ] Existing valid checked assignment is not disabled just because no additional member remains.
- [ ] No automatic reassignment occurs.

---

# 14. Regression Tests

Add/update tests for:

```text
1. Popularity sorting descending.
2. Popularity sorting with missing/null popularity.
3. Member A selected on Show A becomes disabled on Show B.
4. Member A remains enabled in Show A's own dropdown.
5. Changing Show A from Member A to Member B frees Member A.
6. Member B becomes disabled on other shows.
7. Checklist disables when zero valid members remain.
8. Checklist stays enabled when one valid member remains.
9. Existing valid assignment remains checked when no extra members remain.
10. Duplicate assignment fails final validation.
```

---

# 15. Regression Rules

Do not change:

```text
Member Popularity calculations
Show result calculations
STS / Last Show gameplay effects
Eligibility rules unrelated to duplicate assignment
Schedule balance
Energy values
Fan calculations
```

This task is specifically about:

```text
Schedule sorting
Selection uniqueness
UI availability
Validation correctness
```

---

# 16. Deliverables

When complete, report:

```text
1. Where Popularity sort was added.
2. Whether sorting logic was shared/reused.
3. How STS / Last Show assignments are tracked.
4. How duplicate selections are prevented.
5. How checklist disabled state is calculated.
6. Validation added before save/confirmation.
7. Tests added or updated.
```
