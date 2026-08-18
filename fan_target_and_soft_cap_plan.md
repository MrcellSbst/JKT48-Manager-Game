# JKT48 Roguelike Management Game — Fan Target and Fan Growth Cap Plan

## 1. Scope

This document defines:

1. Starting fan count
2. Yearly fan-target formula
3. Annual target growth progression
4. Target-growth cap
5. Soft cap for fan acquisition after the yearly target is reached
6. How fan-growth diminishing returns should work
7. Which event types may partially bypass the soft cap
8. How yearly performance should affect Fan Trust / Reputation

---

# 2. Starting Fan Count

Hard starting value:

```text
Starting Fans:
125,000
```

This is the initial fan count at the beginning of Year 1.

---

# 3. Yearly Fan Target Philosophy

The yearly fan target is a management expectation.

It should:

- increase every year
- become harder during the early years
- stop accelerating forever after a certain point
- not directly end the run if missed
- affect Fan Trust / Reputation / annual review instead
- remain separate from the theater-based run-ending condition

The run still ends because the theater cannot operate with fewer than 12 theater-eligible members.

Missing the fan target should create management consequences, not immediate game over.

---

# 4. Yearly Target Formula

Use the previous year's fan target as the base.

The intended formula is:

```text
Next Target =
Last Fan Target
+
Last Fan Target / 10
+
Last Fan Target × Growth Percentage
```

Where:

```text
Last Fan Target / 10
=
+10%
```

The additional yearly growth percentage begins at 20%.

---

# 5. Running-Year Growth Percentage

Use:

```text
Year 1:
20%

Year 2:
25%

Year 3:
30%

Year 4:
35%

Year 5+:
35%
```

The +5% yearly increase stops after reaching 35%.

Formula:

```js
const runningGrowthPercent =
  Math.min(20 + (year - 1) * 5, 35);
```

---

# 6. Effective Total Target Growth

Because the formula includes:

```text
+10%
```

from:

```text
Last Target / 10
```

the effective total yearly target increase becomes:

```text
Year 1:
+30%

Year 2:
+35%

Year 3:
+40%

Year 4:
+45%

Year 5+:
+45%
```

This is the intended target curve.

---

# 7. Final Target Formula

Recommended implementation:

```js
function calculateNextFanTarget(lastFanTarget, year) {
  const runningGrowthPercent = Math.min(
    20 + (year - 1) * 5,
    35
  );

  const nextTarget =
    lastFanTarget
    + lastFanTarget * 0.10
    + lastFanTarget * (runningGrowthPercent / 100);

  return Math.round(nextTarget);
}
```

Equivalent simplified form:

```js
function calculateNextFanTarget(lastFanTarget, year) {
  const runningGrowthPercent = Math.min(
    20 + (year - 1) * 5,
    35
  );

  const multiplier =
    1.10 + (runningGrowthPercent / 100);

  return Math.round(lastFanTarget * multiplier);
}
```

---

# 8. Example Target Progression

Starting from:

```text
125,000
```

Approximate target curve:

```text
Start
125,000

Year 1
162,500
(+30%)

Year 2
219,375
(+35%)

Year 3
307,125
(+40%)

Year 4
445,331
(+45%)

Year 5
645,730
(+45%)

Year 6
936,309
(+45%)

Year 7
1,357,648
(+45%)

Year 8
1,968,590
(+45%)

Year 9
2,854,456
(+45%)

Year 10
4,139,961
(+45%)
```

Exact final values depend on rounding implementation.

---

# 9. Why Growth Acceleration Is Capped

Do not allow the yearly growth percentage to increase forever.

Bad example:

```text
Year 10:
+75%

Year 15:
+100%

Year 20:
+125%
```

The game has no fixed maximum run length.

If target difficulty increased forever, the fan-target system would eventually become mathematically impossible regardless of management quality.

Therefore:

```text
Maximum running growth component:
35%
```

Combined with the fixed +10% component:

```text
Maximum effective yearly target growth:
45%
```

---

# 10. Fan Target Does Not Use Current Fan Count

The next yearly target should normally be based on:

```text
Previous Fan Target
```

not:

```text
Current Actual Fans
```

Example:

```text
Year 3 Target:
307,125

Actual Year-End Fans:
380,000

Year 4 Target:
Calculated from 307,125
not 380,000
```

This prevents a single extremely successful year from permanently exploding future target difficulty.

---

# 11. Target Achievement

Track:

```text
Current Fans
Yearly Fan Target
Target Achievement %
```

Formula:

```js
targetAchievement =
  currentFans / yearlyFanTarget;
```

Example:

```text
Target:
307,125

Current:
330,000

Achievement:
107.45%
```

---

# 12. Recommended Annual Performance Bands

Suggested:

```text
120%+
Exceptional

100–119.99%
Target Achieved

90–99.99%
Slightly Below Target

75–89.99%
Underperformed

Below 75%
Major Failure
```

These values should affect:

```text
Fan Trust
Reputation
Annual Management Grade
Meta-currency reward
```

Exact rewards/penalties remain configurable.

---

# 13. Fan Acquisition Soft Cap

Once the player reaches or exceeds the yearly target, fan acquisition should begin receiving diminishing returns.

Do NOT use a hard fan cap.

Bad:

```text
Fans reach 120% of target
→ all fan gains become 0
```

Preferred:

```text
Fans can continue growing,
but growth becomes progressively harder.
```

The practical soft-cap zone should be around:

```text
110–120% of yearly target
```

---

# 14. Recommended Soft-Cap Multipliers

Use the current fan count as a percentage of the current yearly target.

Recommended:

```text
Below 100% of Target:
Fan Gain ×1.00

100%–110%:
Fan Gain ×0.75

110%–120%:
Fan Gain ×0.40

120%–130%:
Fan Gain ×0.15

130%+:
Fan Gain ×0.05
```

This makes approximately 120% of target the practical soft cap.

---

# 15. Soft-Cap Function

Suggested implementation:

```js
function getFanGrowthMultiplier(currentFans, yearlyTarget) {
  const ratio = currentFans / yearlyTarget;

  if (ratio < 1.00) {
    return 1.00;
  }

  if (ratio < 1.10) {
    return 0.75;
  }

  if (ratio < 1.20) {
    return 0.40;
  }

  if (ratio < 1.30) {
    return 0.15;
  }

  return 0.05;
}
```

---

# 16. Applying the Soft Cap

Base fan gain should be calculated first.

Example:

```text
Base activity fan gain:
+6,000
```

Then:

```js
finalFanGain =
  baseFanGain
  * fanGrowthMultiplier;
```

Example at 115% of target:

```text
Multiplier:
0.40

Base:
6,000

Final:
2,400
```

Example at 125%:

```text
Multiplier:
0.15

Base:
6,000

Final:
900
```

---

# 17. Why Use a Soft Cap

The soft cap exists to prevent runaway snowballing.

Without it:

```text
Good early year
    ↓
Huge fan gain
    ↓
More demand
    ↓
More popularity
    ↓
Even more fan gain
    ↓
Runaway exponential growth
```

With a soft cap:

```text
Reach yearly target
    ↓
Fan growth slows
    ↓
Player can still overperform
    ↓
Exceptional events still matter
    ↓
Next year resets the effective growth room
```

---

# 18. Soft Cap Resets Each New Year

When a new year begins:

```text
New Yearly Fan Target is calculated.
```

The player's current fan count is compared against the new target.

Example:

```text
End Year 3:

Target:
307,125

Fans:
360,000
```

Year 4 target:

```text
445,331
```

At the start of Year 4:

```text
360,000 / 445,331
≈ 80.8%
```

Therefore normal:

```text
×1.00 fan acquisition
```

returns automatically.

This creates fresh growth room every year.

---

# 19. Event-Specific Soft-Cap Resistance

Not every event should be affected equally by the fan-growth soft cap.

Ordinary repeatable activities should be affected strongly.

Major breakthrough events may partially ignore the diminishing-return multiplier.

Recommended categories:

```text
Normal Theater
100% affected

Training
No direct fan gain normally

M&G
100% affected

Video Call
100% affected

Normal Media
80–100% affected

Normal MV
70–100% affected

Major Concert
~50% affected

Viral MV
~30% affected

Extreme Viral Event
May ignore most or all of the soft cap
```

Exact numbers remain tunable.

---

# 20. Event Resistance Formula

Each fan-generating activity may define:

```text
softCapResistance
```

Range:

```text
0.00–1.00
```

Interpretation:

```text
0.00
Fully affected by soft cap

1.00
Completely ignores soft cap
```

Suggested formula:

```js
function applyFanSoftCap(
  baseFanGain,
  capMultiplier,
  softCapResistance
) {
  const effectiveMultiplier =
    capMultiplier
    + (1 - capMultiplier) * softCapResistance;

  return Math.round(
    baseFanGain * effectiveMultiplier
  );
}
```

---

# 21. Example Event Resistance

Example:

```text
Current soft-cap multiplier:
0.40
```

## Theater

```text
Resistance:
0.00

Effective multiplier:
0.40
```

6,000 becomes:

```text
2,400
```

## Major Concert

```text
Resistance:
0.50
```

Effective multiplier:

```text
0.40 + (1 - 0.40) × 0.50
= 0.70
```

6,000 becomes:

```text
4,200
```

## Viral Event

```text
Resistance:
0.80
```

Effective multiplier:

```text
0.40 + 0.60 × 0.80
= 0.88
```

6,000 becomes:

```text
5,280
```

This allows major moments to break through normal market saturation.

---

# 22. Recommended Initial Resistance Values

Starting balance template:

```text
Theater:
0.00

M&G:
0.00

Video Call:
0.00

Normal Media:
0.20

Standard MV:
0.25

Major Concert:
0.50

Major Anniversary Concert:
0.60

Viral MV:
0.70

Extreme Viral Event:
0.90–1.00
```

These values should remain configurable.

---

# 23. Fan Losses

The soft cap should only reduce **positive fan acquisition**.

It should not reduce fan losses.

Example:

```text
Drama causes:
-8,000 fans
```

The loss should remain:

```text
-8,000
```

Do not multiply negative outcomes by:

```text
0.15
```

simply because the group is above target.

---

# 24. Fan Churn

Optional future system:

As the fanbase grows, background churn may increase slightly.

Possible conceptual formula:

```text
Weekly Net Fans =
New Fans
-
Natural Fan Churn
+
Event Effects
```

This is optional and should only be added if fan totals still grow too aggressively after the soft-cap system is implemented.

Do not add churn unless playtesting shows it is necessary.

---

# 25. Fan Target and Fan Trust

Meeting or missing the yearly fan target should affect Fan Trust.

Suggested starting values:

```text
120%+
Fan Trust +6

100–119%
Fan Trust +3

90–99%
Fan Trust -1

75–89%
Fan Trust -4

Below 75%
Fan Trust -8
```

These are balance targets only.

---

# 26. Fan Target and Reputation

Suggested:

```text
120%+
Reputation +5

100–119%
Reputation +2

90–99%
No major change

75–89%
Reputation -2

Below 75%
Reputation -5
```

Again:

```text
Configurable values.
```

---

# 27. Fan Target and Annual Review

The annual report should show:

```text
FAN GROWTH

Start of Year Fans:
125,000

Target:
162,500

Actual:
188,200

Achievement:
115.8%

Grade:
TARGET ACHIEVED
```

This result contributes to the annual management grade.

---

# 28. Fan Target and Concert Expectations

Current actual fan count may still influence systems such as:

```text
Concert venue expectations
M&G demand
VC demand
Sponsor interest
Public awareness
```

Even though next year's fan target is based on the previous target rather than current actual fans.

This distinction is important.

Example:

```text
Year 3 Target:
307k

Actual:
380k
```

Next target uses:

```text
307k
```

But Anniversary Concert expected scale may use:

```text
380k actual fans
```

---

# 29. Fan Target and Audition Reputation

Strong target performance may indirectly improve:

```text
Fan Trust
Reputation
```

which then affects:

```text
Audition finalist quality
Audition applicant count
Audition intake cap
```

Do not directly make:

```text
More Fans = More Audition Slots
```

Use existing Fan Trust / Reputation systems as the bridge.

---

# 30. Example Year 1

Starting:

```text
Fans:
125,000
```

Year 1 target:

```text
162,500
```

Suppose by mid-year:

```text
Fans:
160,000
```

Normal fan growth still applies:

```text
160,000 / 162,500
= 98.5%

Multiplier:
1.00
```

After target is reached:

```text
Fans:
170,000

170,000 / 162,500
= 104.6%

Multiplier:
0.75
```

Later:

```text
Fans:
190,000

190,000 / 162,500
= 116.9%

Multiplier:
0.40
```

Normal weekly fan growth is now strongly reduced.

---

# 31. Example Year 2 Reset

End Year 1:

```text
Fans:
190,000
```

Year 2 target:

```text
219,375
```

Start Year 2 ratio:

```text
190,000 / 219,375
= 86.6%
```

Fan acquisition returns to:

```text
×1.00
```

The player now has room to grow toward the new target.

---

# 32. Configuration Recommendation

Keep all values in a balance config.

Example:

```js
export const FAN_BALANCE = {
  startingFans: 125000,

  target: {
    fixedGrowthPercent: 10,
    startingRunningGrowthPercent: 20,
    runningGrowthIncreasePerYear: 5,
    maxRunningGrowthPercent: 35
  },

  softCap: [
    {
      minRatio: 0.00,
      maxRatio: 1.00,
      multiplier: 1.00
    },
    {
      minRatio: 1.00,
      maxRatio: 1.10,
      multiplier: 0.75
    },
    {
      minRatio: 1.10,
      maxRatio: 1.20,
      multiplier: 0.40
    },
    {
      minRatio: 1.20,
      maxRatio: 1.30,
      multiplier: 0.15
    },
    {
      minRatio: 1.30,
      maxRatio: Infinity,
      multiplier: 0.05
    }
  ],

  activityResistance: {
    theater: 0.00,
    meetAndGreet: 0.00,
    videoCall: 0.00,
    media: 0.20,
    mv: 0.25,
    concert: 0.50,
    anniversaryConcert: 0.60,
    viralMv: 0.70,
    extremeViral: 0.95
  }
};
```

---

# 33. Hard Rules Currently Decided

Treat these as locked unless intentionally changed.

```text
Starting fan count:
125,000

Yearly fan target is based on:
Previous yearly fan target

Target formula contains:
+10% fixed component

Running growth component:
Year 1 = 20%
Year 2 = 25%
Year 3 = 30%
Year 4+ = 35%

Effective target growth:
Year 1 = +30%
Year 2 = +35%
Year 3 = +40%
Year 4+ = +45%

Running growth component does not increase forever.

Fan target does NOT directly end the run.

Run-ending condition remains:
Theater cannot operate with fewer than 12 eligible members.

Fan growth uses a soft cap after reaching the yearly target.

Recommended practical soft-cap zone:
110–120% of target.

No hard fan ceiling.

Negative fan losses are not reduced by the soft-cap multiplier.

New year target creates new growth room automatically.
```

---

# 34. Values Still Considered Balance Targets

These should remain easy to adjust.

```text
Soft-cap multipliers:
1.00 / 0.75 / 0.40 / 0.15 / 0.05

Soft-cap ratio bands:
100 / 110 / 120 / 130%

Event soft-cap resistance

Fan Trust annual rewards/penalties

Reputation annual rewards/penalties

Whether natural fan churn is needed later
```

---

# 35. Core Design Goal

The fan system should create this behavior:

```text
Early Year
Fast growth is possible.

Approaching Target
Normal management can still reach expectations.

Target Achieved
Growth begins slowing.

10–20% Above Target
Normal activities produce much smaller gains.

Exceptional Event
Concert / Viral MV can still create meaningful breakthroughs.

New Year
Target rises and normal growth room returns.
```

The player should feel rewarded for exceeding expectations, but should not be able to turn one successful year into unlimited runaway fan growth.
