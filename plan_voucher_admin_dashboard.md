# Voucher Admin Dashboard Plan

## Goal

Create an administrator-only dashboard for creating, configuring, distributing, monitoring, disabling, and auditing Voucher System codes.

The dashboard is the source of voucher issuance.

Players do not access this dashboard.

Flow:

```text
Admin Dashboard
-> Create Voucher
-> Configure limits
-> Activate
-> Distribute code
-> Monitor redemptions
-> Inspect edits
-> Pause/revoke when needed
```

The dashboard must use the same authoritative voucher data as the game.

Do not create a disconnected dashboard-only voucher store.


## Guest Accounts Are Ineligible

Voucher codes may only be redeemed by authenticated account users.

Guest players are never valid voucher recipients.

The dashboard must not:

```text
target a guest session
create voucher ownership for a guest save
show guest sessions as eligible redemption users
```

If the dashboard supports targeted vouchers, user selection must resolve to a persistent authenticated user/account ID.

Do not use temporary guest IDs as voucher targets.

Dashboard redemption metrics and logs should therefore contain only authenticated users.

## Admin Security

The dashboard must require:

```text
authenticated user
AND
authorized admin role
```

Frontend route hiding is not sufficient.

Every admin backend action must independently check authorization.

Regular users must never be able to:

```text
create vouchers
list all vouchers
see other users' redemptions
see audit logs
change voucher limits
pause/revoke vouchers
```

## Recommended Dashboard Structure

```text
Voucher Dashboard
├── Overview
├── Vouchers
│   ├── Voucher List
│   ├── Create Voucher
│   └── Voucher Detail / Edit
├── Redemptions
├── Edit Logs
└── User Targeting (optional)
```

## Overview

Show:

```text
Total Vouchers
Active Vouchers
Total Redemptions
Total Points Issued
Total Points Used
Recent Redemptions
Recent Stat Edits
```

Optional:

```text
Expired Vouchers
Revoked Vouchers
Redemption Rate
```

## Voucher List

Recommended columns:

```text
Code
Name
Type
Status
Redemptions
Limit
Points
Valid From
Expires
Created
```

Example:

```text
HBD2026
Birthday Stat Voucher
Member Stat Editor
Active
351 / 500
10 points
Aug 1
Dec 31
```

Actions:

```text
View
Edit
Pause/Activate
Revoke
Duplicate
```

Prefer soft lifecycle states over hard delete so history remains auditable.

## Search / Filter

Support:

```text
search by code
search by name
filter by status
filter by type
filter by expiry
```

Recommended statuses:

```text
Draft
Active
Paused
Expired
Revoked
Exhausted
```

Some may be derived rather than stored.

Example:

```text
Expired => expiresAt < now
```

## Create Voucher Form

Required fields:

```text
Code
Name
Description
Type
Total Edit Points
Allowed Stats
Maximum Increase Per Stat
Maximum Increase Per Member
Allow Decrease
Allow Multiple Members
Maximum Redemptions
Maximum Redemptions Per User
Valid From
Expires At
Active Status
```

## Code Creation

Support:

```text
manual code
generated code
```

Manual:

```text
HBDJKT48-2026
```

Generated:

```text
JKT48-X7K9-PQ2M
```

Generate random codes on the backend using a strong random source where available.

Do not rely on predictable client-only randomness.

## Code Validation

Before creation:

```text
trim
normalize case
reject blank
reject duplicate
reject invalid format
```

Recommended allowed characters:

```text
A-Z
0-9
-
_
```

Do not silently change an existing public code after redemptions begin.

## Voucher Type

Initial type:

```text
Member Stat Editor
```

Internal value:

```text
member-stat-editor
```

Make the form extensible for future types, but do not implement unrelated types now.

## Canonical Stat List

The dashboard should load the same editable-stat registry used by the game.

Do not maintain a second manually duplicated dashboard-only list if avoidable.

Example:

```text
Allowed Stats

☑ Vocal
☑ Dance
☑ Performance
☑ MC
☑ Visual
```

If Overall is derived and not independently editable:

```text
do not offer it as an editable stat
```

## Points and Limits

Fields:

```text
Total Points
Max Increase Per Stat
Max Increase Per Member
```

Validation:

```text
totalPoints >= 1
maxPerStat >= 0
maxPerMember >= 0
maxPerStat <= totalPoints
maxPerMember <= totalPoints
```

## Multiple Members

Control:

```text
Allow Multiple Members
[Yes/No]
```

If false, helper text should explain:

```text
The first edited member becomes locked to this redemption.
```

## Allow Decrease

Control:

```text
Allow Stat Decrease
[Yes/No]
```

Default:

```text
No
```

Warn that decreases do not refund points under the v1 Voucher System.

## Redemption Limits

Fields:

```text
Maximum Total Redemptions
Maximum Redemptions Per User
```

Support unlimited only with an explicit representation such as `null`.

Do not use ambiguous magic values unless already conventional in the project.

## Validity Window

Fields:

```text
Valid From
Expires At
```

Allow:

```text
no start restriction
no expiry
```

If both exist:

```text
expiresAt > validFrom
```

## Targeted Vouchers

Recommended optional modes:

```text
Anyone
Specific User
Specific User List
```

If multi-user targeting is too large for v1, implement:

```text
Anyone
Specific User
```

Backend eligibility remains authoritative.

## Lifecycle

Recommended:

```text
Draft
Active
Paused
Revoked
Expired
Exhausted
```

### Draft

Not redeemable.

### Active

Redeemable if all other conditions pass.

### Paused

Temporarily prevents new redemptions.

Recommended v1 behavior:

```text
existing redeemed vouchers remain usable
```

unless a separate disable-existing-redemptions option is implemented.

### Revoked

Explicit permanent stop.

Recommended v1 policy:

```text
new redemptions blocked
existing redemptions also blocked from future edits
```

If a different policy is preferred, document and test it consistently.

### Expired

Derived from expiry date.

### Exhausted

Derived when global redemption cap is reached.

## Voucher Detail Page

Show:

```text
Code
Name
Description
Status
Configuration
Validity
Usage
Redemptions
Recent Edits
```

Metrics:

```text
351 / 500 redeemed
3,510 points issued
1,422 points used
2,088 points remaining
```

## Editing an Existing Voucher

Safe metadata to edit after redemption:

```text
name
description
pause/active state
future expiry
max total redemptions if >= current usage
```

Core permission fields are dangerous to alter after users already redeemed the code:

```text
totalPoints
allowedStats
maxIncreasePerStat
maxIncreasePerMember
allowDecrease
allowMultipleMembers
```

Recommended rule:

```text
lock core permission fields after the first redemption
```

This prevents existing redemption behavior from silently changing.

Future versioning can replace this later.

## Duplicate Voucher

Provide:

```text
Duplicate
```

Copy configuration except:

```text
voucherId
code
createdAt
usage
redemptions
logs
```

Admin must set/generate a new code.

## Pause / Activate

Pause prevents new redemptions.

Recommended existing-redemption behavior:

```text
still usable
```

Activate restores new redemption eligibility.

## Revoke

Revoke must require explicit confirmation.

Example:

```text
Revoke HBDJKT48-2026?

This will stop future use according to the voucher revocation policy.
```

Do not use accidental one-click revoke behavior.

## Redemption List

Columns:

```text
User
Voucher
Code
Redeemed At
Points Used
Points Remaining
Status
```

Filters:

```text
voucher
user
status
date
```

## Redemption Detail

Show:

```text
User
Voucher
Redeemed At
Points Total
Points Used
Points Remaining
Locked Member if applicable
Status
Edit History
```

Admin action:

```text
Revoke Redemption
```

Do not add arbitrary point grants in v1 unless explicitly requested later.

## Edit Log

Global immutable player-edit audit log.

Columns:

```text
Timestamp
User
Voucher
Member
Stat
Old Value
New Value
Delta
Points Used
```

Filters:

```text
user
voucher
member
stat
date range
```

Do not provide a normal delete button for edit logs.

## Admin Action Audit Log

Also log important admin operations:

```text
voucher created
voucher activated
voucher paused
voucher revoked
voucher edited
voucher duplicated
redemption revoked
```

Recommended fields:

```text
adminUserId
action
voucherId
redemptionId
before
after
timestamp
```

Do not store passwords, secrets, or session tokens in audit snapshots.

## Backend Actions

Adapt to the project's backend style.

Conceptually:

```text
GET    /admin/vouchers
POST   /admin/vouchers
GET    /admin/vouchers/:id
PATCH  /admin/vouchers/:id
POST   /admin/vouchers/:id/activate
POST   /admin/vouchers/:id/pause
POST   /admin/vouchers/:id/revoke
POST   /admin/vouchers/:id/duplicate

GET    /admin/voucher-redemptions
GET    /admin/voucher-redemptions/:id
POST   /admin/voucher-redemptions/:id/revoke

GET    /admin/voucher-edit-logs
```

Use server actions/RPC/Workers instead if that matches the project.

## Admin API Security

Every admin action checks server-side admin authorization.

Do not trust:

```text
frontend-only route guards
hidden buttons
client-supplied role values
```

## Pagination

Voucher, redemption, and log tables should support pagination.

Recommended:

```text
25-100 rows per page
```

Follow existing dashboard table conventions.

## Sorting

Useful sorts:

```text
created date
expiry date
redemption count
status
code
name
```

For large tables, prefer server-side sorting if the project already supports it.

## Dashboard Mutations

For critical actions:

```text
Create
Pause
Revoke
```

show final state only after server confirmation.

Do not fake success for destructive actions.

## Server Validation

Frontend validation improves UX, but the backend remains authoritative.

Server validates:

```text
unique code
valid voucher type
valid stat list
valid numeric limits
valid validity window
valid targeting
valid redemption limits
```

## Core Permission Lock

Recommended backend rule:

```text
if redemptionCount > 0
```

reject changes to:

```text
totalPoints
allowedStats
maxIncreasePerStat
maxIncreasePerMember
allowDecrease
allowMultipleMembers
```

unless a future voucher-version system is added.

## Redemption Cap Safety

Do not allow:

```text
maxRedemptions < currentRedemptionCount
```

## Dashboard Metrics

Compute overview metrics from authoritative backend data.

Examples:

```text
Active vouchers
Redemptions today
Points consumed
Top redeemed voucher
```

Do not rely on inaccurate client aggregation for important totals.

## Example Voucher List UI

```text
VOUCHERS

[Create Voucher]

Code            Name               Status    Redeemed
HBD2026         Birthday Voucher   Active    351 / 500
DANCE2026       Dance Special      Active     88 / 100
TEST-001        Test Voucher       Paused      2 / 5
```

## Example Create Form

```text
CREATE VOUCHER

Code
[ HBDJKT48-2026 ]

Name
[ Birthday Voucher ]

Total Points
[ 10 ]

Max Per Stat
[ 3 ]

Max Per Member
[ 5 ]

Allowed Stats
[x] Vocal
[x] Dance
[x] Performance
[x] MC
[x] Visual

Allow Decrease
[ Off ]

Allow Multiple Members
[ On ]

Max Redemptions
[ 500 ]

Max Per User
[ 1 ]

Valid From
[ ... ]

Expires
[ ... ]

[Save Draft] [Create & Activate]
```

## Shared Data

Dashboard and game must operate on the same authoritative structures:

```text
vouchers
voucher_redemptions
voucher_edit_log
```

Add an admin audit structure if no general admin audit log already exists:

```text
admin_voucher_audit_log
```

## Tests

### Authorization

For every mutation endpoint:

```text
not authenticated -> rejected
normal user -> rejected
admin -> accepted
```

### Creation

Test:

```text
valid voucher created
duplicate code rejected
invalid point limits rejected
invalid allowed stat rejected
invalid expiry range rejected
```

### Lifecycle

Test:

```text
Draft -> not redeemable
Active -> redeemable
Paused -> new redemption blocked
Expired -> blocked
Exhausted -> blocked
Revoked -> blocked according to revocation policy
```

### Editing

Before first redemption:

```text
core permission fields editable
```

After first redemption:

```text
core permission fields locked
safe metadata remains editable
```

### Caps

Dashboard cannot reduce max redemptions below existing redemption count.

### Pause

Test that existing redemption behavior matches the chosen pause policy.

### Revoke

Test both:

```text
new redemption
existing redemption usage
```

against the chosen revoke policy.

### Logs

Every important admin mutation creates an admin audit entry.

Player voucher edit logs cannot be deleted through normal dashboard actions.

### Targeting

If targeted vouchers are implemented:

```text
target authenticated user can redeem
other users cannot
guest players cannot redeem
```

## Implementation Order

1. Inspect auth/session and admin-role model.
2. Inspect existing dashboard/admin UI conventions.
3. Reuse voucher storage from the Voucher System task.
4. Add/confirm server-side admin authorization helper.
5. Implement voucher admin CRUD backend.
6. Add code normalization and uniqueness checks.
7. Add Voucher List.
8. Add Create Voucher form.
9. Load canonical stat list.
10. Add Voucher Detail.
11. Add safe editing/locked core fields.
12. Add Pause/Activate/Revoke.
13. Add Duplicate.
14. Add Redemptions list/detail.
15. Add Edit Logs.
16. Add admin audit logging.
17. Add search/filter/pagination.
18. Add authorization and validation tests.
19. Verify regular users cannot access admin functionality.

## Acceptance Criteria

- Admin can create vouchers.
- Admin can set total points.
- Admin can select allowed stats.
- Admin can set max increase per stat.
- Admin can set max increase per member.
- Admin can control multiple-member use.
- Admin can control decrease permission.
- Admin can set total redemption limits.
- Admin can set per-user redemption limits.
- Admin can set validity dates.
- Admin can activate, pause, and revoke vouchers.
- Admin can inspect redemptions.
- Admin can inspect all applied stat edits.
- Core permission fields are protected after redemption begins.
- All admin actions are authorized server-side.
- Important admin mutations are audited.
- Dashboard and game share the same voucher data.
- Guest players are never eligible voucher recipients or redemption owners.

## Non-Goals

Do not add:

```text
public voucher creation
player voucher generator
voucher marketplace
voucher purchases
voucher trading
voucher gifting
automatic email distribution
social-media distribution
complex analytics warehouse
```
