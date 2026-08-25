# Localization Audit Plan — English / Indonesian

## Objective

Perform a complete localization audit across the entire game.

The goal is to ensure that **every user-facing text string has both an English and Indonesian localization counterpart** and that no visible text is left hardcoded in components, game-engine output, configuration, event descriptions, tooltips, modal content, flavor text, or other UI surfaces.

Known incomplete localization areas:
- Footer
- Management Bonus / pre-run bonus system
- In-game flavor text
- In-game description text

Treat these as confirmed gaps, but continue auditing every section of the game for additional missing localization.

## General Requirements

Every visible string must:
1. Use the existing localization/i18n system.
2. Have an English entry.
3. Have an Indonesian entry.
4. Follow the project’s existing localization key structure.
5. Avoid hardcoded UI text where practical.
6. Use interpolation for dynamic values instead of concatenating localized strings.

Do not redesign the localization architecture unless necessary. Reuse the current localization implementation and conventions.

## Audit Scope

Audit all player-facing text in:

- Main menu, start screen, new run, load/save, settings, navigation, header, footer
- Roster, member detail, stats, traits, status, development, energy, schedule
- Calendar, week/day views, activity assignment, scheduling warnings
- Theater, setlists, lineups, units, show results, ticket demand, audience results
- Training, training types, results, descriptions
- Singles, senbatsu, center selection, release results
- MV concepts, production, budget, results, descriptions
- Meet & Greet sessions, sales, demand, sell-through, results
- Video Call sessions, sales, demand, results
- Concert venue selection, venue descriptions, production tiers, rehearsals, ticket sales, hype, results
- Year-End M&G and Anniversary Concert
- Auditions, candidates, scouting, stages, finalists, selection, generation results
- Graduation announcements, planning, final activities, results
- Drama notices, suspension, refunds, cooldown, return messages
- Fans, yearly targets, Fan Trust, Reputation, Popularity, narratives, discussions
- Management Bonus names, descriptions, effects, categories, tooltips, unlock UI
- Economy, revenue, expenses, financial reports
- History, timeline, annual review, run summary, game-over screen
- Notifications, toasts, errors, warnings, confirmations, empty states
- Tooltips, help text, flavor text, generated descriptions

Anything visible to the player is in scope.

## Known Missing Area: Footer

Audit:
- copyright/credits
- version labels
- links
- disclaimer text
- navigation labels
- status/help text

No footer text should remain hardcoded if it is player-facing.

## Known Missing Area: Management Bonus

Audit:
- bonus names
- bonus category names
- descriptions
- effect descriptions
- unlock text
- costs
- owned/locked state
- equip/unequip text
- slot labels
- selection limits
- confirmation prompts
- errors
- tooltips
- “permanent for run” descriptions
- meta-progression related text

If bonus data is data-driven, prefer localization keys:

```js
{
  id: "B001",
  nameKey: "managementBonus.theaterPartnership.name",
  descriptionKey: "managementBonus.theaterPartnership.description",
  effectKey: "managementBonus.theaterPartnership.effect"
}
```

Avoid raw English prose in bonus definitions when the existing architecture supports keys.

## Known Missing Area: Flavor Text

Audit all atmospheric/narrative text:
- event flavor
- concert descriptions
- fan reactions
- audition flavor
- graduation flavor
- drama flavor
- theater result descriptions
- member-development descriptions
- year-end commentary
- management notices
- run-history narrative lines
- random-event descriptions
- fake social/fan discussion text

Random flavor pools should contain localization keys, not embedded English prose.

Example:

```js
const flavorPool = [
  "events.theater.greatPerformance.01",
  "events.theater.greatPerformance.02",
  "events.theater.greatPerformance.03"
];
```

## Known Missing Area: Description Text

Audit all description fields:
- activity descriptions
- bonus descriptions
- venue descriptions
- event descriptions
- training descriptions
- trait descriptions
- status descriptions
- difficulty descriptions
- audition reports
- concert production descriptions
- MV concept descriptions

Prefer `descriptionKey` or the equivalent existing pattern over raw English strings.

## Hardcoded String Audit

Search the entire source tree for user-facing strings in:
- `.jsx`
- `.tsx`
- `.js`
- `.ts`
- `.json`
- config/data files
- event pools
- modal definitions
- notification definitions

Inspect:
- JSX text nodes
- button labels
- modal titles
- toast text
- warnings
- empty states
- descriptions
- tooltips
- placeholders
- template literals
- conditional UI text
- string arrays

Examples that need localization:

```jsx
<button>Continue</button>
```

```js
toast("Member is unavailable");
```

```js
description: "Increase weekly recovery by 5"
```

```js
return `${member.name} has graduated`;
```

Do not convert internal IDs, logs, comments, API field names, database names, or test descriptions unless they are visible to players.

## Dynamic Text and Interpolation

Prefer:

```js
t("graduation.memberGraduated", { member: member.name })
```

over:

```js
`${member.name} has graduated`
```

English:
```text
{{member}} has graduated.
```

Indonesian:
```text
{{member}} telah lulus dari grup.
```

Use the localization library’s existing interpolation syntax.

## Pluralization

Audit quantity-dependent text:
- week/weeks
- member/members
- session/sessions
- ticket/tickets
- fan/fans
- day/days

Use localization plural support if available. Avoid manually appending English `s`.

## Numbers, Currency, and Dates

Audit locale-aware formatting for:
- fan counts
- money
- percentages
- ticket counts
- large values
- dates
- month names
- day names
- week labels

Prefer shared formatting helpers or `Intl.NumberFormat(locale)` where appropriate.

Keep Rupiah formatting consistent across languages.

## Status and Enum Localization

Do not display internal enum values directly.

Audit values such as:
- Fresh
- Normal
- Tired
- Fatigued
- Exhausted
- Unavailable
- Suspended
- Active
- Trainee
- Graduated
- Sold Out
- Available
- Locked
- Owned
- Selected
- Equipped

Preferred:

```jsx
<span>{t(`member.status.${member.status}`)}</span>
```

Also localize:
- archetypes
- traits
- training types
- activity types
- concert sizes
- production tiers
- bonus categories
- fan categories
- narrative types
- audition stages
- drama severity
- event types

Keep internal enum IDs language-neutral.

## Generated Fan / Narrative Text

Simulation logic should return semantic data, not full English sentences.

Preferred:

```js
{
  type: "venue_too_small",
  severity: "major",
  expectedCapacity: 8000,
  selectedCapacity: 2500
}
```

Then let the UI/localization layer render the message in English or Indonesian.

## Engine Output Audit

If game-engine code returns prose like:

```js
{
  message: "The concert was a huge success!"
}
```

prefer:

```js
{
  messageKey: "concert.result.hugeSuccess"
}
```

or return semantic state and translate at render time.

Keep simulation logic separate from localization where practical.

## Localization Key Naming

Follow the project’s current key naming style.

If there is no clear convention, use semantic namespaces:

```text
footer.*
managementBonus.*
member.*
calendar.*
theater.*
training.*
single.*
mv.*
meetAndGreet.*
videoCall.*
concert.*
audition.*
graduation.*
drama.*
fans.*
economy.*
history.*
common.*
```

Avoid meaningless keys such as `text1`, `label12`, or `messageABC`.

## English / Indonesian Parity Check

Compare translation trees programmatically.

The audit must report:
- keys missing in Indonesian
- keys missing in English
- duplicate keys
- optionally unused keys

Completion target:

```text
Missing Indonesian counterparts: 0
Missing English counterparts: 0
```

for all actively used localizable strings.

## Translation Quality

Indonesian should read naturally as game/UI Indonesian, not overly literal machine translation.

Preserve established terminology where appropriate, for example:
- Meet & Greet
- Video Call
- Senbatsu
- Center
- Trainee
- Setlist
- MV

Consistency with existing Indonesian terminology is more important than translating every borrowed term.

Do not translate proper names, member names, JKT48, generation identifiers, venue proper names, or song titles unless the project already intentionally localizes them.

## Language Switching

Test:
- English → Indonesian
- Indonesian → English

Verify live updates across:
- modals
- tooltips
- dropdowns
- calendar
- notifications
- event descriptions
- footer
- Management Bonus
- fan events
- run history

Do not require a reload unless that is already the intended design.

## Layout Audit

Indonesian strings may be longer than English.

Check:
- text overflow
- button clipping
- card overflow
- modal overflow
- table overflow
- calendar cell overflow
- mobile wrapping
- desktop alignment

Adjust layout where necessary instead of shortening translations unnaturally.

## Footer Checklist

- [ ] All footer labels localized
- [ ] All descriptions localized
- [ ] All links use localized labels
- [ ] Version/credits/disclaimer reviewed
- [ ] No hardcoded English remains
- [ ] Indonesian counterpart exists for every footer string

## Management Bonus Checklist

- [ ] Screen title localized
- [ ] Bonus names localized
- [ ] Bonus descriptions localized
- [ ] Bonus effects localized
- [ ] Categories localized
- [ ] Cost labels localized
- [ ] Unlock labels localized
- [ ] Equip/unequip labels localized
- [ ] Slot count localized
- [ ] Permanent-run wording localized
- [ ] Confirmation dialogs localized
- [ ] Error states localized
- [ ] Tooltips localized
- [ ] Empty states localized
- [ ] No raw English bonus prose remains where localization keys should be used

## Flavor / Description Checklist

- [ ] Theater flavor text localized
- [ ] Concert flavor text localized
- [ ] MV flavor text localized
- [ ] Audition flavor text localized
- [ ] Graduation flavor text localized
- [ ] Drama flavor text localized
- [ ] Fan narrative text localized
- [ ] Random event text localized
- [ ] Management notice text localized
- [ ] Activity descriptions localized
- [ ] Trait descriptions localized
- [ ] Status descriptions localized
- [ ] Venue descriptions localized
- [ ] Production descriptions localized

## Automated Test Recommendation

Add or update a localization parity test.

Pseudo-example:

```js
test("English and Indonesian localization keys stay in sync", () => {
  const enKeys = flattenKeys(en);
  const idKeys = flattenKeys(id);

  assert.deepEqual(
    [...enKeys].sort(),
    [...idKeys].sort()
  );
});
```

If translation files are split by namespace, check every namespace.

## Regression Rules

After localization work:
- run existing tests
- run build
- run lint if configured
- do not rebalance gameplay
- do not alter fan, energy, audition, graduation, concert, bonus, or Drama mechanics unless required purely to separate localizable text from simulation logic



## Money / Compact Number Localization

Audit all compact money and large-number formatting.

The game must not use one global suffix mapping for both English and Indonesian, because the abbreviations mean different things.

Required compact suffix mapping:

```text
English
K = thousand
M = million
B = billion

Indonesian
RB = ribu
JT = juta
M = miliar
```

Examples:

```text
English
FRL850K
FRL1.2M
FRL2.5B

Indonesian
FRL850 RB
FRL1,2 JT
FRL2,5 M
```

Important:

```text
English "M" means million.
Indonesian "M" means miliar.
```

Do not reuse the English suffix directly when switching locale.

Prefer a centralized formatter rather than manually formatting money inside components.

Conceptual structure:

```js
const compactUnits = {
  en: {
    thousand: "K",
    million: "M",
    billion: "B"
  },
  id: {
    thousand: "RB",
    million: "JT",
    billion: "M"
  }
};
```

The actual implementation should follow the existing localization architecture.

### Decimal Separators

Compact numbers should also follow locale conventions.

Examples:

```text
English:
FRL1.5M

Indonesian:
FRL1,5 JT
```

### Full Number Formatting

When compact formatting is not used:

```text
English:
FRL1,500,000

Indonesian:
FRL1.500.000
```

Use the project’s shared formatter or locale-aware formatting such as:

```js
Intl.NumberFormat(locale)
```

where appropriate.

### Money Localization Scope

Audit money formatting in:

- current cash balance
- theater purchase/lease cost
- theater running cost
- theater renovation cost
- training cost
- MV budget and production cost
- concert venue rental
- concert production budget
- concert revenue
- M&G revenue
- Video Call revenue
- ticket refunds
- sponsorship revenue
- media revenue
- audition cost
- Management Bonus costs if applicable
- annual financial report
- run summary
- tooltips
- cards
- tables
- charts
- notifications
- confirmation dialogs

Do not leave components with manual formatting such as:

```js
`FRL${value / 1_000_000}M`
```

because that will produce incorrect Indonesian output.

Prefer a shared function such as:

```js
formatMoney(value, locale, { compact: true })
```

or the equivalent existing utility.

### Money Localization Checklist

- [ ] English compact suffixes use K / M / B
- [ ] Indonesian compact suffixes use RB / JT / M
- [ ] English decimal separator is appropriate
- [ ] Indonesian decimal separator is appropriate
- [ ] Full number grouping follows locale conventions
- [ ] All financial screens use the shared formatter
- [ ] No hardcoded `K`, `M`, `B`, `JT`, or `RB` remains in UI components where locale switching applies
- [ ] Switching language immediately updates visible compact money formatting


## Deliverables

Provide:
1. Code changes
2. Audit summary
3. List of files/sections audited
4. Count of hardcoded strings converted
5. Count of new English keys
6. Count of new Indonesian keys
7. Missing-key report
8. Remaining known issues, if any

Explicitly confirm:

```text
Footer: Complete
Management Bonus: Complete
In-game Flavor Text: Complete
In-game Description Text: Complete
```

## Definition of Done

The task is complete only when:

1. The whole game has been audited for user-facing hardcoded text.
2. Every currently used localization key has both English and Indonesian entries.
3. Footer localization is complete.
4. Management Bonus localization is complete.
5. In-game flavor localization is complete.
6. In-game description localization is complete.
7. Dynamic/generated text is localization-safe.
8. Language switching works on audited screens.
9. Indonesian text does not visibly break layouts.
10. Localization parity checks pass.
11. Existing build/tests still pass.
12. No gameplay balancing changes were introduced accidentally.

## Final Principle

Do not treat this as only “find the obvious untranslated buttons.”

Treat it as:

> Every piece of text a player can see must come from a localization-aware source, and English/Indonesian must stay in parity across the entire project.

The finished codebase should make future missing Indonesian counterparts easy to detect automatically.
