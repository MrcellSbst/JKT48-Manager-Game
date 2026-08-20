# Drama System Refactor Plan

## Goal

Refactor the current drama data so dramas are explicitly divided into two sources:

1. **Member Drama**
   - The incident is primarily caused by, centered on, or attributed to an individual member.
   - The event should normally have a `{member}` actor and may optionally have a `{target}`.
   - Consequences may still affect management, fans, reputation, sponsors, or the group.

2. **Management Drama**
   - The incident is primarily caused by management decisions, office policy, business operations, event handling, safety handling, franchise relationships, financial decisions, or organizational restructuring.
   - A member may be affected or referenced, but the member is not the primary cause of the drama.
   - Management dramas should not require a member unless the specific scenario genuinely revolves around one.

3. **The Timing and Internal Cooldown**
   - Member Drama and Management drama have different cooldown and separate
   - the cooldown is the same, but they count separately

The existing gameplay severity mechanics do **not** need to change just because the source type changes. Keep the current trust, reputation, suspension, or other mechanical rules unless another task explicitly changes them.

---

# Why This Refactor

The current file puts member misconduct, management failures, business crises, safety failures, and organizational controversies into the same `MEMBER_DRAMA_CATEGORIES` and `MEMBER_DRAMA_TEMPLATES` pool.

Examples:

- `Dating / Relationship Scandal` is clearly member-driven.
- `Member-vs-Member Conflict` is clearly member-driven.
- `Financial Crisis` is primarily management/business-driven.
- `Mass Graduation / Restructuring` is primarily management-driven.
- `Franchise / Contract Dispute` is primarily management/business-driven.
- `Center / Management Favoritism` is primarily a management decision even though one member benefits.
- `Member Health / Pressure Crisis` is primarily a management-pressure issue when the controversy is about workload or ignored warning signs.

The refactor should make the drama source explicit while preserving the existing categories and scenario flavor.

---

# Proposed Data Structure

Use two separate category collections and two separate template collections.

Suggested names:

```js
export const MEMBER_DRAMA_CATEGORIES = Object.freeze([...]);
export const MANAGEMENT_DRAMA_CATEGORIES = Object.freeze([...]);

export const MEMBER_DRAMA_CATEGORY_ID = Object.freeze({...});
export const MANAGEMENT_DRAMA_CATEGORY_ID = Object.freeze({...});

export const MEMBER_DRAMA_TEMPLATES = Object.freeze([...]);
export const MANAGEMENT_DRAMA_TEMPLATES = Object.freeze([...]);

export const MEMBER_DRAMA_BY_ID = Object.freeze(
  Object.fromEntries(MEMBER_DRAMA_TEMPLATES.map((item) => [item.id, item]))
);

export const MANAGEMENT_DRAMA_BY_ID = Object.freeze(
  Object.fromEntries(MANAGEMENT_DRAMA_TEMPLATES.map((item) => [item.id, item]))
);
```

Optional later convenience API:

```js
export const ALL_DRAMA_TEMPLATES = Object.freeze([
  ...MEMBER_DRAMA_TEMPLATES,
  ...MANAGEMENT_DRAMA_TEMPLATES,
]);
```

Do not add `ALL_DRAMA_TEMPLATES` unless it is actually useful to the current engine.

---

# Drama Source Rule

When deciding where a drama belongs, ask:

> "Who made the decision or performed the action that primarily created the controversy?"

If the answer is **a member**, use Member Drama.

If the answer is **management / office / staff / business operations / event organization**, use Management Drama.

Do not classify based only on who is hurt by the incident.

Example:

```text
Member misses an event without explanation
=> Member Drama

Management cancels or mishandles an event
=> Management Drama

Member posts an offensive message
=> Member Drama

Management releases a contradictory or insensitive official statement
=> Management Drama

A member becomes exhausted because management keeps overworking them
=> Management Drama
```

---

# Member Drama Categories

These categories should remain in the member-side pool:

```js
[
  'Dating / Relationship Scandal',
  'Leaked Photo / Private SNS',
  'Golden Rule Violation',
  'Member Suspension',
  'Member Demotion',
  'Forced / Sudden Graduation',
  'Contract Termination',
  'Member-vs-Member Conflict',
  'Fandom War',
  'Event Controversy',
  'Public Apology Disaster',
  'SNS Controversy',
  'Rumor / Tabloid Scandal',
  'Conflict of Interest with Brands',
  'Bad Fan Services',
  'Political Opinion Controversy',
  'Criminal Incident'
]
```

## Member Drama Description

Member Drama represents controversies whose initiating action is directly tied to a member's behavior, private life, public statements, interpersonal conflict, rule violations, or conduct during group activities.

Typical effects:

- member trust loss
- member reputation loss
- group reputation loss
- fan backlash
- possible suspension
- possible demotion
- possible termination
- possible graduation pressure
- relationship changes between members

The category itself should not automatically determine severity. Continue using the existing gameplay severity/result logic.

---

# Management Drama Categories

Move these categories into the management-side pool:

```js
[
  'Center / Management Favoritism',
  'Election Controversy',
  'Management Misconduct / Bad Handling',
  'Privacy / Stalker Incident',
  'Fan Safety Incident',
  'Sponsor Backlash',
  'Financial Crisis',
  'Mass Graduation / Restructuring',
  'Franchise / Contract Dispute',
  'Member Health / Pressure Crisis',
  'Management Rule Inconsistency'
]
```

## Management Drama Description

Management Drama represents controversies caused primarily by office policy, management decisions, staff handling, business operations, security failures, event administration, financial problems, organizational restructuring, sponsorship relations, or franchise obligations.

Typical effects:

- management trust loss
- group reputation loss
- sponsor relationship damage
- fan trust loss
- financial penalties
- event disruption
- member morale loss
- member health/pressure consequences
- possible roster-wide effects

Management drama should generally target the **group/office**, not punish one member as if they caused it.

---

# Ambiguous Categories

Some existing categories can appear on either side depending on the story.

Do **not** duplicate a category automatically. Classify the specific template based on the initiating actor.

## Event Controversy

Member-side example:

```text
{member} misses a confirmed fan event.
```

Management-side example:

```text
Management changes the event rules at the last minute and strands fans.
```

The current `event-no-show` and `rehearsal-no-show` stories are member-driven, so keep them under Member Drama.

## Fan Safety Incident

The current `unsafe-prank` story is actually member-driven because the member's prank causes the safety scare.

Therefore:

- Keep `unsafe-prank` under Member Drama.
- Keep the **category** available on the member side if this template remains.
- Management-side safety incidents should use new management templates such as poor security planning, overcrowding, unsafe venue handling, or ignored warnings.

If category constants must stay unique globally, consider a shared category registry later. For this refactor, template ownership matters more than forcing every category name to exist in only one list.

## Franchise / Contract Dispute

The current `plagiarism-accusation` scenario is centered on a member allegedly using protected work, so it behaves more like a Member Drama despite its current category name.

The current `franchise-contract-dispute` scenario is management/business-driven and should move to Management Drama.

This is a good example of why **template source** and **category label** should not be assumed to be identical concepts.

## Management Misconduct / Bad Handling

The current `staff-complaint` and `unpolite-remark-staff` templates are initiated by a member's behavior toward staff.

Those specific templates should stay Member Drama even though the category name currently says management misconduct.

Consider recategorizing those two templates to a clearer category later, such as:

```js
'Staff Conflict'
```

Do not rename categories in this refactor unless necessary, because that can create unrelated localization/test churn.

---

# Existing Template Classification

## MEMBER DRAMA

### `careless-social-post`

Category: `SNS Controversy`

Reason:
The member creates the controversy by making the post.

Current concept:

```text
{member} posts a sarcastic message that fans read as disrespectful toward the group.
```

---

### `livestream-slip`

Category: `SNS Controversy`

Reason:
The initiating action is a member comment during a livestream.

Current concept:

```text
{member} makes an offhand comment during a livestream, and clipped footage spreads without context.
```

---

### `fan-interaction-misread`

Category: `Bad Fan Services`

Reason:
The incident centers on the member's fan interaction.

Current concept:

```text
A crowded fan interaction involving {member} is recorded from an angle that creates a damaging impression.
```

---

### `backstage-argument`

Category: `Member-vs-Member Conflict`

Reason:
Direct member-to-member conflict.

Current concept:

```text
{member} has a heated backstage argument with a teammate, and staff accounts reach the public.
```

---

### `rehearsal-no-show`

Category: `Event Controversy`

Reason:
The member fails to attend a required rehearsal.

Current concept:

```text
{member} misses a critical rehearsal without a clear explanation before an important appearance.
```

---

### `late-arrival`

Category: `Golden Rule Violation`

Reason:
Repeated member rule-breaking initiates the controversy.

Current concept:

```text
Repeated rule-breaking by {member} is documented, and management is accused of giving special treatment.
```

Management favoritism is a secondary controversy here, but the trigger is still the member's repeated violations.

---

### `unauthorized-brand-deal`

Category: `Conflict of Interest with Brands`

Reason:
The member participates in an unapproved promotion.

Current concept:

```text
{member} appears in promotional material for a brand that was never cleared with management.
```

---

### `private-chat-leak`

Category: `Leaked Photo / Private SNS`

Reason:
The material being exposed belongs to the member.

Current concept:

```text
Private messages involving {member} are leaked and make routine roster frustrations look malicious.
```

---

### `lineup-leak`

Category: `Leaked Photo / Private SNS`

Reason:
A member's private photo leaks unreleased group information.

Current concept:

```text
A private photo from {member} reveals an unreleased lineup and damages trust in the production team.
```

---

### `unsafe-prank`

Category: `Fan Safety Incident`

Reason:
The member's prank causes the safety incident.

Current concept:

```text
A backstage prank involving {member} causes a minor safety scare and draws severe online criticism.
```

---

### `unapproved-livestream`

Current category: `Management Rule Inconsistency`

Classification: **Member Drama**

Reason:
The member initiates an unscheduled livestream that conflicts with management's communication plan.

Current concept:

```text
{member} starts an unscheduled livestream that contradicts the office communication plan.
```

The category name is management-oriented, but the current scenario itself is member-driven.

User Post Script note: This category is unnecessary, remove this

---

### `event-no-show`

Category: `Event Controversy`

Reason:
The member misses a confirmed appearance.

Current concept:

```text
{member} misses a confirmed fan event, leaving attendees waiting while conflicting explanations circulate.
```

---

### `dating-rumor`

Category: `Dating / Relationship Scandal`

Reason:
The controversy centers on the member's private relationship.

Current concept:

```text
Photos involving {member} fuel a relationship rumor, and the office cannot immediately clarify the story.
```

---

### `tabloid-rumor`

Category: `Rumor / Tabloid Scandal`

Reason:
The member is the subject of the tabloid story.

Current concept:

```text
A sensational tabloid story names {member}, and speculation overwhelms the group's planned announcement.
```

---

### `plagiarism-accusation`

Current category: `Franchise / Contract Dispute`

Classification: **Member Drama**

Reason:
The creator accuses the member directly of using protected work.

Current concept:

```text
A creator accuses {member} of using protected work, turning a rights dispute into a public argument.
```

---

### `staff-complaint`

Current category: `Management Misconduct / Bad Handling`

Classification: **Member Drama**

Reason:
The controversy comes from a dispute involving a former staff member and the member.

Current concept:

```text
A former staff member describes a dispute with {member}, and incomplete details spread through fan communities.
```

---

### `rival-fandom-dispute`

Category: `Fandom War`

Reason:
A member's public exchange becomes the trigger for fan conflict.

Current concept:

```text
A public exchange involving {member} escalates into a fan-war and overwhelms the group conversation.
```

---

### `conflicting-statement`

Category: `Public Apology Disaster`

Reason:
The member gives an apology that contradicts the office statement.

Current concept:

```text
{member} gives an apology that conflicts with the office statement, making a routine issue look like a cover-up.
```

---

### `unpolite-remark-member`

Category: `Member-vs-Member Conflict`

Directed target: `member`

Reason:
Direct member-to-member misconduct.

Current concept:

```text
{member} makes an unpolite remark about {target}, and the exchange is circulated as a personal attack.
```

---

### `unpolite-remark-fans`

Category: `Bad Fan Services`

Directed target: `fans`

Reason:
The member directly insults or dismisses fans.

Current concept:

```text
{member} makes an unpolite remark about fans during a public interaction, and attendees feel dismissed.
```

---

### `unpolite-remark-staff`

Current category: `Management Misconduct / Bad Handling`

Directed target: `staff`

Classification: **Member Drama**

Reason:
The member causes the workplace dispute.

Current concept:

```text
{member} makes an unpolite remark about staff within earshot of a guest, creating a workplace dispute.
```

---

### `discriminatory-remark-fans`

Category: `Bad Fan Services`

Directed target: `fans`

Reason:
The member makes the remark.

Current concept:

```text
A remark by {member} about fans is recorded and widely condemned as discriminatory, whether intended or not.
```

---

### `discriminatory-remark-member`

Category: `Member-vs-Member Conflict`

Directed target: `member`

Reason:
The member makes the remark about another member.

Current concept:

```text
A remark by {member} about {target} is circulated as discriminatory and triggers a roster-wide backlash.
```

---

### `political-opinion`

Category: `Political Opinion Controversy`

Reason:
The member personally shares the opinion.

Current concept:

```text
{member} shares a polarizing political opinion, forcing management to explain how the statement affects group activities.
```

---

### `suspension-announcement`

Category: `Member Suspension`

Reason:
Although management announces the punishment, this represents the consequence of an internal member-related issue.

Current concept:

```text
The office announces that {member} will be suspended after an internal review draws public attention.
```

Keep on Member Drama unless the future system treats punishment decisions themselves as management controversies.
User Post Script note: This category is unnecessary, remove this

---

### `demotion-rumor`

Category: `Member Demotion`

Classification: **Member Drama for now**

Reason:
The scenario is directly attached to the status of one member.

Current concept:

```text
A leaked planning document suggests {member} may lose a prominent role, and fans accuse management of humiliating them.
```

This is borderline management-driven. If management dramas later model unfair discipline, it can be moved there.
User Post Script note: This category is unnecessary, remove this

---

### `sudden-graduation-pressure`

Category: `Forced / Sudden Graduation`

Classification: **Management Drama**

Although the affected object is a member, the story explicitly says the office is allegedly pushing the member toward graduation.

Move this template to Management Drama.

---

### `contract-termination-rumor`

Category: `Contract Termination`

Classification: **Management Drama**

Reason:
The core conflict is a contract/office decision, and management briefings are part of the controversy.

Move this template to Management Drama.

---

### `alleged-criminal-incident`

Category: `Criminal Incident`

Reason:
The alleged incident directly involves the member.

Current concept:

```text
An alleged criminal incident involving {member} is reported to management, triggering a serious review before facts are settled.
```

Keep wording cautious because the scenario is explicitly an allegation.

---

# MANAGEMENT DRAMA

### `sponsor-backlash`

Category: `Sponsor Backlash`

Reason:
The main problem is the office's sponsor campaign and partner relationship, not necessarily member misconduct.

Current concept:

```text
A campaign featuring {member} is criticized for its tone, forcing the office to answer questions from partners.
```

Move to Management Drama.

The template may still optionally reference `{member}` because a member can be the face of the campaign.

---

### `sudden-graduation-pressure`

Category: `Forced / Sudden Graduation`

Reason:
The controversy is management allegedly forcing an abrupt graduation.

Current concept:

```text
Reports claim {member} is being pushed toward an abrupt graduation, and the office is accused of hiding the timeline.
```

---

### `contract-termination-rumor`

Category: `Contract Termination`

Reason:
The contract decision and contradictory briefings come from office/business handling.

Current concept:

```text
A contract dispute puts {member} at risk of termination, while conflicting briefings reach fans and sponsors.
```

---

### `center-favoritism`

Category: `Center / Management Favoritism`

Reason:
Management controls center selection.

Current concept:

```text
Repeated center choices for {member} lead fans and teammates to accuse management of favoritism.
```

The member is the beneficiary, not necessarily the cause.

---

### `election-controversy`

Category: `Election Controversy`

Reason:
The controversy concerns the office-run election process and vote counting.

Current concept:

```text
Supporters claim the election process favored {member}, forcing the office to defend its vote-counting process.
```

---

### `stalker-privacy-incident`

Category: `Privacy / Stalker Incident`

Reason:
The stalker causes the initial incident, but the actual group controversy in this template is about the office's safety response.

Current concept:

```text
A stalker incident involving {member} exposes private travel details, and fans question the office safety response.
```

Treat this as a management/security crisis.

---

### `financial-crisis-link`

Category: `Financial Crisis`

Reason:
Unpaid bills and spending approval are management/business responsibilities.

Current concept:

```text
An unpaid bill connected to {member}'s project sparks questions about who approved the spending.
```

The member may be attached to the project but is not automatically responsible for financial approval.

---

### `mass-graduation-rumor`

Category: `Mass Graduation / Restructuring`

Reason:
Organizational restructuring is a management decision.

Current concept:

```text
A restructuring memo names {member} among possible departures, causing fans to fear a mass graduation wave.
```

---

### `franchise-contract-dispute`

Category: `Franchise / Contract Dispute`

Reason:
The dispute is between the local office and franchise partners.

Current concept:

```text
A rights dispute involving {member} exposes conflicting obligations between the local office and franchise partners.
```

---

### `health-pressure-crisis`

Category: `Member Health / Pressure Crisis`

Reason:
The controversy is specifically about management allegedly ignoring workload/pressure warning signs.

Current concept:

```text
Signs of exhaustion around {member} cause concern, while fans accuse management of ignoring pressure signals.
```

This should affect both management trust and member morale/health where applicable.

---

# Final Existing Template Split

## Member Drama IDs

```js
[
  'careless-social-post',
  'livestream-slip',
  'fan-interaction-misread',
  'backstage-argument',
  'rehearsal-no-show',
  'late-arrival',
  'unauthorized-brand-deal',
  'private-chat-leak',
  'lineup-leak',
  'unsafe-prank',
  'unapproved-livestream',
  'event-no-show',
  'dating-rumor',
  'tabloid-rumor',
  'plagiarism-accusation',
  'staff-complaint',
  'rival-fandom-dispute',
  'conflicting-statement',
  'unpolite-remark-member',
  'unpolite-remark-fans',
  'unpolite-remark-staff',
  'discriminatory-remark-fans',
  'discriminatory-remark-member',
  'political-opinion',
  'suspension-announcement',
  'demotion-rumor',
  'alleged-criminal-incident'
]
```

Count: **27**

## Management Drama IDs

```js
[
  'sponsor-backlash',
  'sudden-graduation-pressure',
  'contract-termination-rumor',
  'center-favoritism',
  'election-controversy',
  'stalker-privacy-incident',
  'financial-crisis-link',
  'mass-graduation-rumor',
  'franchise-contract-dispute',
  'health-pressure-crisis'
]
```

Count: **10**

Total existing templates: **37**

---

# Drama Template Format

Keep the existing bilingual title/detail fields.

## Member Drama Template

```js
drama({
  id: 'unique-id',
  category: 'Category Name',
  weight: 8,

  title: 'English title',
  titleId: 'Judul Bahasa Indonesia',

  detail: '{member} does something that creates a controversy.',
  detailId: '{member} melakukan sesuatu yang menimbulkan kontroversi.',
})
```

Optional target:

```js
drama({
  id: 'member-conflict-example',
  category: 'Member-vs-Member Conflict',
  directedTarget: 'member',
  weight: 8,

  title: 'A conflict reaches the public',
  titleId: 'Konflik menjadi konsumsi publik',

  detail: '{member} publicly criticizes {target}, creating tension across the roster.',
  detailId: '{member} mengkritik {target} secara publik dan memicu ketegangan di seluruh roster.',
})
```

Supported target concepts currently include:

```text
member
fans
staff
```

Do not invent new target-resolution behavior unless the engine supports it.

---

# Management Drama Template

Recommended format:

```js
managementDrama({
  id: 'unique-id',
  category: 'Category Name',
  weight: 6,

  title: 'English title',
  titleId: 'Judul Bahasa Indonesia',

  detail: 'Management makes a decision that creates controversy.',
  detailId: 'Manajemen mengambil keputusan yang menimbulkan kontroversi.',
})
```

A management drama may optionally involve a member:

```js
managementDrama({
  id: 'center-favoritism',
  category: 'Center / Management Favoritism',
  weight: 7,

  title: 'Center favoritism accusations grow',
  titleId: 'Tuduhan favoritisme center membesar',

  detail: 'Repeated center choices for {member} lead fans and teammates to accuse management of favoritism.',
  detailId: 'Pemilihan center berulang untuk {member} membuat penggemar dan rekan satu tim menuduh manajemen pilih kasih.',
})
```

Do not require `{member}` in every management drama.

For example:

```js
managementDrama({
  id: 'ticketing-chaos',
  category: 'Event Controversy',
  weight: 6,

  title: 'Ticketing chaos angers fans',
  titleId: 'Kekacauan tiket membuat penggemar marah',

  detail: 'A poorly communicated ticketing change leaves fans unable to use reservations they already secured.',
  detailId: 'Perubahan sistem tiket yang dikomunikasikan dengan buruk membuat penggemar tidak dapat menggunakan reservasi yang sudah mereka dapatkan.',
})
```

---

# Helper Function

The current helper automatically maps `category` through `MEMBER_DRAMA_CATEGORY_ID`.

Do not reuse that helper unchanged for management dramas.

Preferred:

```js
const memberDrama = (data) => ({
  ...data,
  dramaSource: 'member',
  categoryId: MEMBER_DRAMA_CATEGORY_ID[data.category] ?? data.category,
});

const managementDrama = (data) => ({
  ...data,
  dramaSource: 'management',
  categoryId: MANAGEMENT_DRAMA_CATEGORY_ID[data.category] ?? data.category,
});
```

Adding:

```js
dramaSource: 'member'
```

or:

```js
dramaSource: 'management'
```

is recommended even though the templates are stored in separate arrays.

This makes downstream event handling, UI rendering, logs, and debugging much easier.

---

# Recommended Event Object

When a drama is selected/generated, normalize it to something like:

```js
{
  id: 'center-favoritism',
  dramaSource: 'management',
  category: 'Center / Management Favoritism',
  categoryId: 'Favoritisme Center / Manajemen',

  title: 'Center favoritism accusations grow',
  titleId: 'Tuduhan favoritisme center membesar',

  detail: 'Repeated center choices for {member} lead fans and teammates to accuse management of favoritism.',
  detailId: 'Pemilihan center berulang untuk {member} membuat penggemar dan rekan satu tim menuduh manajemen pilih kasih.',

  weight: 7,

  memberId: null,
  targetMemberId: null
}
```

For member drama:

```js
{
  id: 'backstage-argument',
  dramaSource: 'member',
  category: 'Member-vs-Member Conflict',

  weight: 10,

  memberId: 'member-id',
  targetMemberId: 'target-member-id'
}
```

Do not change the runtime event shape if doing so would break existing saves/tests unless migration is included.

---

# UI Description

The UI should distinguish the source visually/textually.

Suggested labels:

```text
MEMBER DRAMA
MANAGEMENT DRAMA
```

Indonesian:

```text
DRAMA MEMBER
DRAMA MANAJEMEN
```

Recommended header examples:

```text
MEMBER DRAMA
A backstage argument leaks
```

```text
MANAGEMENT DRAMA
Center favoritism accusations grow
```

The existing category should remain visible underneath or in metadata.

Example:

```text
MANAGEMENT DRAMA
Center favoritism accusations grow
Favoritisme Center / Manajemen

Repeated center choices for Shani lead fans and teammates to accuse management of favoritism.
```

---

# New Management Drama Templates To Add

The existing file has many member-oriented scenarios and relatively few pure management scenarios.

Add management-specific templates so the pool does not feel like "member drama with a management label."

## 1. Ticketing Failure

```js
managementDrama({
  id: 'ticketing-system-failure',
  category: 'Event Controversy',
  weight: 7,
  title: 'A ticketing failure leaves fans furious',
  titleId: 'Kegagalan sistem tiket membuat penggemar marah',
  detail: 'A ticketing failure invalidates confirmed reservations, and management struggles to explain how affected fans will be compensated.',
  detailId: 'Kegagalan sistem tiket membatalkan reservasi yang sudah dikonfirmasi, dan manajemen kesulitan menjelaskan kompensasi bagi penggemar yang terdampak.',
})
```

## 2. Poor Event Queue Handling

```js
managementDrama({
  id: 'event-queue-chaos',
  category: 'Fan Safety Incident',
  weight: 6,
  title: 'Poor queue handling creates a safety scare',
  titleId: 'Penanganan antrean yang buruk memicu masalah keselamatan',
  detail: 'Poor crowd-control planning causes dangerous congestion outside an event and fans demand an explanation.',
  detailId: 'Perencanaan pengendalian massa yang buruk menyebabkan kepadatan berbahaya di luar acara dan penggemar menuntut penjelasan.',
})
```

## 3. Inconsistent Punishment

```js
managementDrama({
  id: 'inconsistent-member-punishment',
  category: 'Management Rule Inconsistency',
  weight: 7,
  title: 'Inconsistent punishment angers fans',
  titleId: 'Hukuman yang tidak konsisten membuat penggemar marah',
  detail: 'Two similar rule violations receive very different punishments, leading fans to accuse management of favoritism.',
  detailId: 'Dua pelanggaran aturan yang serupa mendapat hukuman yang sangat berbeda, membuat penggemar menuduh manajemen pilih kasih.',
})
```

## 4. Poor Crisis Statement

```js
managementDrama({
  id: 'bad-official-statement',
  category: 'Management Misconduct / Bad Handling',
  weight: 8,
  title: 'An official statement makes the crisis worse',
  titleId: 'Pernyataan resmi memperburuk krisis',
  detail: 'Management releases a vague statement that contradicts known information and intensifies public criticism.',
  detailId: 'Manajemen merilis pernyataan samar yang bertentangan dengan informasi yang diketahui dan memperbesar kritik publik.',
})
```

## 5. Overworked Member

```js
managementDrama({
  id: 'member-overwork',
  category: 'Member Health / Pressure Crisis',
  weight: 7,
  title: 'An overloaded schedule raises concerns',
  titleId: 'Jadwal yang terlalu padat menimbulkan kekhawatiran',
  detail: 'A member shows visible exhaustion after weeks of dense scheduling, and fans accuse management of ignoring workload limits.',
  detailId: 'Seorang member terlihat kelelahan setelah berminggu-minggu menjalani jadwal padat, dan penggemar menuduh manajemen mengabaikan batas beban kerja.',
})
```

## 6. Sponsor Conflict

```js
managementDrama({
  id: 'sponsor-contract-conflict',
  category: 'Sponsor Backlash',
  weight: 6,
  title: 'A sponsor publicly challenges management',
  titleId: 'Sponsor secara terbuka mempertanyakan manajemen',
  detail: 'A sponsor disputes how a campaign was handled and pauses promotional activity while demanding clarification.',
  detailId: 'Sponsor mempersoalkan cara kampanye ditangani dan menghentikan sementara aktivitas promosi sambil meminta klarifikasi.',
})
```

## 7. Budget Overspending

```js
managementDrama({
  id: 'budget-overspending',
  category: 'Financial Crisis',
  weight: 5,
  title: 'An expensive project goes over budget',
  titleId: 'Proyek mahal melampaui anggaran',
  detail: 'A major project exceeds its approved budget and forces management to cut spending elsewhere.',
  detailId: 'Sebuah proyek besar melampaui anggaran yang disetujui dan memaksa manajemen memangkas pengeluaran di tempat lain.',
})
```

## 8. Sudden Schedule Cancellation

```js
managementDrama({
  id: 'last-minute-event-cancellation',
  category: 'Event Controversy',
  weight: 6,
  title: 'A last-minute cancellation frustrates fans',
  titleId: 'Pembatalan mendadak membuat penggemar kecewa',
  detail: 'Management cancels a major appearance with little explanation after fans have already traveled to the venue.',
  detailId: 'Manajemen membatalkan penampilan besar dengan sedikit penjelasan setelah penggemar sudah datang ke lokasi.',
})
```

## 9. Security Information Leak

```js
managementDrama({
  id: 'member-location-leak',
  category: 'Privacy / Stalker Incident',
  weight: 8,
  title: 'Private member location data leaks',
  titleId: 'Data lokasi pribadi member bocor',
  detail: 'Internal handling exposes private member travel information, forcing management to review security procedures.',
  detailId: 'Penanganan internal membocorkan informasi perjalanan pribadi member, memaksa manajemen meninjau prosedur keamanan.',
})
```

## 10. Restructuring Backlash

```js
managementDrama({
  id: 'restructuring-backlash',
  category: 'Mass Graduation / Restructuring',
  weight: 5,
  title: 'A restructuring announcement shocks the fandom',
  titleId: 'Pengumuman restrukturisasi mengejutkan fandom',
  detail: 'Management announces a major organizational restructuring with little warning, creating fear about member departures and future activities.',
  detailId: 'Manajemen mengumumkan restrukturisasi organisasi besar dengan sedikit peringatan, memicu kekhawatiran tentang kepergian member dan kegiatan mendatang.',
})
```

---

# Selection Logic

Where the engine currently selects only from:

```js
MEMBER_DRAMA_TEMPLATES
```

update the caller so it deliberately chooses a source.

Example:

```js
const pool =
  dramaSource === 'management'
    ? MANAGEMENT_DRAMA_TEMPLATES
    : MEMBER_DRAMA_TEMPLATES;
```

If drama source itself should be random:

```js
const dramaSource = random() < MANAGEMENT_DRAMA_CHANCE
  ? 'management'
  : 'member';
```

Do **not** hard-code a new probability without checking the existing event-generation system.

A reasonable future balancing target could be:

```text
Member Drama: ~70-80%
Management Drama: ~20-30%
```

but this is a design recommendation, not a required change.

---

# Member Selection Rules

## Member Drama

Usually requires:

```text
member
```

If:

```js
directedTarget: 'member'
```

then select another valid member:

```text
target !== member
```

If:

```js
directedTarget: 'fans'
```

no target member is necessary.

If:

```js
directedTarget: 'staff'
```

no target member is necessary unless the game later models staff entities.

## Management Drama

Do not automatically select a member.

Only resolve `{member}` if the selected template contains `{member}`.

This avoids fake cases where a completely organizational issue gets randomly attached to an innocent member.

Pseudo-rule:

```js
const needsMember =
  template.detail.includes('{member}') ||
  template.detailId.includes('{member}') ||
  template.title.includes('{member}') ||
  template.titleId.includes('{member}');
```

Use an existing token/template helper if one already exists.

---

# Consequence Direction

This refactor should also make future consequence logic easier.

## Member Drama Default Direction

Primary:

```text
member trust/reputation
```

Secondary:

```text
group reputation
fan sentiment
```

Possible severe outcomes:

```text
suspension
demotion
termination
graduation
```

## Management Drama Default Direction

Primary:

```text
management trust
group reputation
fan sentiment
```

Secondary:

```text
money
sponsor relations
event performance
member morale
```

Do not automatically suspend or punish a random member for a management drama.

If the current engine only supports member-level penalties, preserve compatibility for now and mark management-specific consequences as a separate future task rather than forcing incorrect member punishments.

---

# Localization

Preserve the existing English and Indonesian fields.

Member category localization can remain in:

```js
MEMBER_DRAMA_CATEGORY_ID
```

Management category localization should use:

```js
MANAGEMENT_DRAMA_CATEGORY_ID
```

If duplicate categories exist across both sources, duplicated translation entries are acceptable initially.

A future cleanup could replace both with one shared:

```js
DRAMA_CATEGORY_ID
```

but do not combine them during this refactor unless it clearly reduces complexity without breaking imports.

---

# Backward Compatibility

Check all imports of:

```js
MEMBER_DRAMA_CATEGORIES
MEMBER_DRAMA_CATEGORY_ID
MEMBER_DRAMA_TEMPLATES
MEMBER_DRAMA_BY_ID
```

Do not rename/remove existing exports until all callers are updated.

If saved games store only:

```text
drama id
```

then keeping existing IDs unchanged should preserve compatibility.

Do **not** rename existing IDs during the split.

Add `dramaSource` as derived metadata if possible rather than requiring a save migration.

---

# Tests To Update / Add

## 1. Every member template has member source

```js
for (const drama of MEMBER_DRAMA_TEMPLATES) {
  assert.equal(drama.dramaSource, 'member');
}
```

## 2. Every management template has management source

```js
for (const drama of MANAGEMENT_DRAMA_TEMPLATES) {
  assert.equal(drama.dramaSource, 'management');
}
```

## 3. IDs remain unique across both pools

```js
const ids = [
  ...MEMBER_DRAMA_TEMPLATES,
  ...MANAGEMENT_DRAMA_TEMPLATES,
].map((item) => item.id);

assert.equal(new Set(ids).size, ids.length);
```

## 4. Localized fields exist

Every drama must contain:

```text
id
category
categoryId
weight
title
titleId
detail
detailId
dramaSource
```

## 5. Directed member targets are valid

For templates with:

```js
directedTarget: 'member'
```

the generated target must not be the same member as the source member.

## 6. Management dramas without `{member}` do not assign a random member

This is important for pure office/business incidents.

## 7. Existing IDs still resolve

All previously existing drama IDs must remain available through the appropriate lookup.

---

# Implementation Order For Codex

1. Inspect all imports/usages of the current drama exports.
2. Split categories into member and management collections.
3. Add separate category localization maps.
4. Replace the single `drama()` helper with `memberDrama()` and `managementDrama()`.
5. Add `dramaSource` to every template.
6. Move the 10 existing management templates into `MANAGEMENT_DRAMA_TEMPLATES`.
7. Keep the 27 member templates in `MEMBER_DRAMA_TEMPLATES`.
8. Preserve all existing template IDs.
9. Add `MANAGEMENT_DRAMA_BY_ID`.
10. Update drama selection logic to select from the correct pool.
11. Ensure management templates only select a member when their text actually requires `{member}`.
12. Ensure management dramas do not accidentally apply member punishment just because the old system assumed every drama belonged to a member.
13. Update UI labels so the popup/log can show `Member Drama` or `Management Drama`.
14. Add/update tests.
15. Only after the split is stable, add the new management-specific templates listed in this plan.

---

# Acceptance Criteria

The refactor is complete when:

- Member-caused drama and management-caused drama are stored separately.
- Every drama has a clear `dramaSource`.
- Existing drama IDs remain unchanged.
- Existing member drama behavior still works.
- Management drama can exist without attaching an unrelated member.
- Member-targeted management scenarios can still resolve `{member}` where needed.
- UI/logs can distinguish Member Drama from Management Drama.
- Indonesian and English drama text still works.
- No existing save that references a drama ID is broken solely because of this refactor.
- Tests confirm IDs are unique across both pools.
- Management incidents do not automatically trigger member-specific punishments unless the scenario/mechanics explicitly require it.

---

# Important Non-Goals

Do not change these as part of this task unless required for compatibility:

- overall drama severity calculations
- trust/reputation formulas
- suspension thresholds
- graduation mechanics
- probability of drama occurring
- member personality/arrogancy systems
- save format
- unrelated UI
- unrelated game economy

This task is primarily a **data ownership + generation source refactor**, not a rebalance.
