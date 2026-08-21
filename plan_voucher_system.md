# Voucher System Plan

## Goal

Add a developer-issued Voucher System that grants players limited permission to modify member stats inside the game.

The intended flow is:

Admin creates voucher -> player redeems code -> compatible member stats expose an edit/pencil action -> player spends voucher points within configured limits -> backend validates -> edit is logged.

This is not an earnable in-game currency. Players cannot create, buy, craft, or farm vouchers.

## Core Rules

The Voucher System must be:

- server-authoritative
- limited
- auditable
- configurable
- safe for save/load
- separate from normal member progression

The client must never be trusted for remaining points, allowed stats, per-stat limits, per-member limits, expiry, redemption counts, or voucher status.

## Voucher Definition

Recommended conceptual shape:

```js
{
  voucherId: 'uuid',
  code: 'HBDJKT48-2026',
  name: 'Birthday Stat Voucher',
  description: 'Limited stat adjustment voucher.',
  type: 'member-stat-editor',

  totalPoints: 10,
  maxIncreasePerStat: 3,
  maxIncreasePerMember: 5,

  allowedStats: [
    'vocal',
    'dance',
    'performance',
    'mc',
    'visual'
  ],

  allowDecrease: false,
  allowMultipleMembers: true,

  maxRedemptions: 500,
  maxRedemptionsPerUser: 1,

  validFrom: null,
  expiresAt: null,
  isActive: true,

  createdAt: '...',
  updatedAt: '...'
}
```

Adapt field names to the project conventions.

## Voucher Code

Codes must be unique, trimmed, normalized, and validated server-side.

Recommended:

```js
normalizeVoucherCode(" hbdjkt48-2026 ")
=> "HBDJKT48-2026"
```

Do not expose the internal voucher ID as the public redeem code.

## Initial Voucher Type

Implement:

```text
member-stat-editor
```

Design the data model so more types can be added later, but do not implement unrelated voucher powers during this task.

## Stat Editing Model

Voucher edits should be stored separately from natural stats.

Recommended:

```js
member.stats = {
  dance: 78,
  vocal: 70
};

member.voucherAdjustments = {
  dance: 3,
  vocal: 1
};
```

Displayed value:

```js
displayValue = baseValue + voucherAdjustment;
```

Example:

```text
Natural Dance: 78
Voucher Adjustment: +3
Displayed Dance: 81
```

Natural training must continue independently.

Example:

```text
before training:
base 78
voucher +3
display 81

after training:
base 79
voucher +3
display 82
```

Do not permanently merge voucher bonuses into the natural stat value.

## Global Stat Caps

Respect the existing game's stat minimum/maximum.

Example:

```text
Base: 98
Voucher request: +3
Global maximum: 100
```

Clamp the applied result to the valid final cap instead of rejecting the voucher request. The requested voucher points are still consumed and logged, while the effective stat increase is limited to the remaining room. For example, Base 95 + request 10 produces Display 100 with an effective adjustment of +5.

## Allowed Stats

The voucher controls which stats may be edited.

Example:

```js
allowedStats: ['dance', 'vocal']
```

The player must not be able to edit other stats through a modified client request.

## Overall

If Overall is derived from other stats, do not edit Overall directly.

Changing component stats should naturally update Overall.

Only permit direct Overall editing if the current member model stores it independently and the voucher explicitly allows it.

## Edit Points

Default rule:

```text
+1 stat = 1 voucher point
```

Example:

```text
+3 Dance = 3 points
```

Recommended redemption state:

```js
{
  pointsTotal: 10,
  pointsUsed: 8,
  pointsRemaining: 2
}
```

The backend must calculate authoritative remaining points.

## Maximum Per Stat

Example:

```text
maxIncreasePerStat = 3
```

The limit is cumulative per member/stat for the redemption.

This must not be bypassable through:

```text
+1
+1
+1
+1
```

## Maximum Per Member

Example:

```text
maxIncreasePerMember = 5
```

If one member receives:

```text
Dance +3
Vocal +2
```

that member has reached 5/5 for that redemption.

## Multiple Members

If:

```js
allowMultipleMembers = false
```

the first edited member becomes the locked target for that redemption.

If true, points may be spread across multiple members within all other limits.

## Decreasing Stats

Default:

```text
allowDecrease = false
```

If false, negative edits are rejected.

If true, decreases still respect the global stat minimum and must be audited.

For v1:

```text
decreasing a stat does not refund already spent points
```

## Redemption Flow

Player submits code:

```text
normalize code
-> server lookup
-> validate voucher
-> validate redemption limits
-> create redemption
-> return active redemption state
```

Server must validate:

- authenticated non-guest user session exists
- voucher exists
- voucher is active
- validFrom has been reached
- voucher has not expired
- global redemption cap is not exhausted
- user redemption cap is not exhausted
- targeted-user eligibility if implemented

## Redemption Status

Recommended:

```text
active
depleted
expired
revoked
```

Conceptual record:

```js
{
  redemptionId: 'uuid',
  voucherId: 'uuid',
  userId: 'uuid',
  pointsTotal: 10,
  pointsUsed: 4,
  status: 'active',
  redeemedAt: '...'
}
```

## Edit Request

The client should send only the desired action:

```js
{
  redemptionId: '...',
  memberId: '...',
  stat: 'dance',
  delta: 3
}
```

Do not trust client-supplied limit values.

## Server Edit Validation

For every edit:

1. Load redemption.
2. Load voucher.
3. Verify authenticated user owns redemption.
4. Verify voucher/redemption is active.
5. Verify expiry/revocation.
6. Verify stat is allowed.
7. Verify edit direction.
8. Verify enough points remain.
9. Verify cumulative per-stat limit.
10. Verify cumulative per-member limit.
11. Verify multiple-member rule.
12. Verify resulting stat is within global limits.
13. Apply voucher adjustment.
14. Update points used.
15. Write audit log.
16. Return updated authoritative state.

## Atomicity

These must happen atomically:

```text
validate remaining points
apply stat adjustment
update redemption usage
create edit log
```

Do not allow concurrent requests to spend the same points twice.

## Edit Log

Every successful edit must be logged.

Recommended fields:

```text
editId
redemptionId
voucherId
userId
memberId
stat
baseValueAtEdit
voucherAdjustmentBefore
voucherAdjustmentAfter
displayValueBefore
displayValueAfter
delta
pointsUsed
createdAt
```

At minimum preserve who, which voucher, which member, which stat, what changed, and when.

## Player UI

Without an applicable voucher:

```text
Dance
78
```

With an applicable voucher:

```text
Dance
78  ✏
```

Only show/enable the pencil when the user owns an active compatible redemption.

## Edit Modal

Example:

```text
EDIT DANCE

Member:
Freya

Natural Value:
78

Voucher Adjustment:
+1

Displayed Value:
79

Voucher:
Birthday Voucher

Remaining Points:
7

Max Additional Change:
+2

Change:
[ +2 ]

Result:
81

[Cancel] [Apply]
```

## Multiple Vouchers

If multiple redemptions can edit the stat:

```text
Voucher
[ Birthday Voucher ▼ ]
```

Show remaining points, expiry, and current limits for the selected voucher.

Do not silently consume an arbitrary voucher.

## Voucher Inventory

Add a player-facing voucher section.

Example:

```text
MY VOUCHERS

Birthday Voucher
7 / 10 points remaining
Expires: Dec 31, 2026

Dance Special
2 / 5 points remaining
No expiry
```

Statuses:

```text
Active
Depleted
Expired
Revoked
```

## Modified Stat Display

Recommended:

```text
Dance
81
+3 Voucher
```

Tooltip/detail:

```text
Natural: 78
Voucher: +3
```

Voucher-modified stats should not look identical to natural progression.

## Per-Run vs Permanent Scope

Codex must inspect the current save architecture.

Recommended initial behavior:

```text
voucher edits apply to the member state in the current run/save
```

Do not silently carry edits into every future run.

If the current game stores member state account-wide, adapt accordingly.

## Targeted Voucher Support

Recommended optional schema support:

```text
targetUserId
```

or a separate eligibility mapping.

This allows admin-only vouchers for specific users.

## Error States

User-facing errors should include:

```text
Invalid voucher code
Voucher is inactive
Voucher has expired
Redemption limit reached
You already redeemed this voucher
No points remaining
This stat is not allowed
Maximum per-stat adjustment reached
Maximum per-member adjustment reached
Voucher is locked to another member
Requested stat is clamped to the global limit
```

Do not expose database internals.

## Backend Actions

Adapt to the current backend style.

Conceptually:

```text
POST /voucher/redeem
GET  /voucher/mine
POST /voucher/edit-member-stat
GET  /voucher/:redemptionId/history
```

## Security

Use the authenticated session to determine user identity.

Guest sessions are not eligible for voucher redemption or voucher usage.

Never trust arbitrary client-provided `userId`.

If no authenticated account user exists:

```text
reject redemption
reject voucher stat edit
```

Rate-limit voucher-code attempts if an existing rate-limit system exists.

## Storage Model

### vouchers

```text
voucher_id
code
name
description
type
total_points
max_increase_per_stat
max_increase_per_member
allowed_stats
allow_decrease
allow_multiple_members
max_redemptions
max_redemptions_per_user
valid_from
expires_at
is_active
created_at
updated_at
```

### voucher_redemptions

```text
redemption_id
voucher_id
user_id
points_total
points_used
status
redeemed_at
updated_at
```

### voucher_edit_log

```text
edit_id
redemption_id
voucher_id
user_id
member_id
stat
old_adjustment
new_adjustment
delta
points_used
created_at
```

## Tests

Redemption:

- authenticated user with valid code works
- guest player redemption rejected
- invalid code rejected
- inactive rejected
- future-dated rejected before validFrom
- expired rejected
- global redemption cap enforced
- per-user cap enforced

Editing:

- allowed stat accepted
- disallowed stat rejected
- +1 uses 1 point
- cannot overspend
- per-stat cumulative limit enforced
- per-member cumulative limit enforced
- multiple-member rule enforced
- negative edits rejected when disabled
- global stat cap enforced by clamping the displayed result to 0-100
- successful edit creates one log
- failed edit creates no applied edit log
- concurrent requests cannot overspend

Progression:

```text
base 70
voucher +2
natural training +1

result:
base 71
voucher +2
display 73
```

## Implementation Order

1. Inspect member stat model, Overall, stat caps, saves, auth, and backend pattern.
2. Add voucher storage model.
3. Add redemption model.
4. Add edit log.
5. Add code normalization.
6. Implement redemption validation.
7. Implement server-side edit validation.
8. Store voucher adjustments separately from natural stats.
9. Make edit updates atomic.
10. Add voucher inventory API/state.
11. Add pencil/edit affordance.
12. Add voucher selection/edit modal.
13. Add modified-stat indicator.
14. Add tests.
15. Verify old users/saves still work.

## Acceptance Criteria

- Admin-issued codes can be redeemed by authenticated account users.
- Guest players cannot redeem or use vouchers.
- Players cannot create vouchers.
- Remaining points are server-authoritative.
- Allowed stats are server-authoritative.
- Per-stat and per-member limits are enforced.
- Multi-member restrictions are enforced.
- Expiry and active status are enforced.
- Voucher adjustments remain separate from natural stats.
- Compatible stats expose an edit/pencil action.
- Every successful edit is audited.
- Client request tampering cannot bypass limits.
- Old accounts/saves still work.

## Non-Goals

Do not add:

```text
voucher drops
voucher shop
voucher crafting
voucher gacha
normal in-game voucher earning
voucher trading
automatic point refunds
unrestricted player editor
```
