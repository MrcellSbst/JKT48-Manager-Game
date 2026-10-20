# JKT48 Manager Game

A browser-based management simulation built with React and Vite. Create a management office, purchase a seeded theater, select a founding roster of 12 active JKT48 members, and manage weekly activities, finances, growth, graduations, and long-term theater operations.

All member ratings, traits, archetypes, and simulation outcomes are fictional gameplay data. This project is not affiliated with or endorsed by JKT48.

## Feature

- Seeded member statistics and randomized theater offers
- Current active-member data and local member assets
- Founding roster selection with searchable member profiles
- Theater shows requiring exactly 12 members
- Weekly scheduling, training, media, MV, concert, Video Call, and Meet & Greet activities
- Weekly and monthly financial reports
- Year, named month, and four-week calendar system
- Monthly graduation checks beginning in Year 2
- Graduation announcements with scheduled departure dates
- Year-end theater renovation
- Management Perks and persistent Management Token progression
- English and Indonesian localization
- Light and dark themes
- Responsive desktop and mobile layouts
- In-game rules and economy Wiki
- One active run stored locally in browser IndexedDB
- Manual saves and weekly autosaves
- Optional account login with encrypted D1 cloud checkpoints
- UTC+7-scheduled bilingual patchnotes with one-time update notices

## Requirements

- Node.js 20 or newer
- npm

## Local Development

Install dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

Preview the Vite production build:

```bash
npm run preview
```

## Tests

Run the game-engine and localization tests:

```bash
npm test
```

## Cloudflare Pages

The repository includes `wrangler.jsonc`, uses `dist` as the Pages build output directory, and shares the existing `gacha-jkt48` D1 binding for `user_h` authentication.

`schema.sql` defines the current Manager and voucher tables. Its cloud-save schema creates only `jkt48_manager_data_v2`.

For a new database, create the tables before deployment:

```bash
npx wrangler d1 execute gacha-jkt48 --remote --file schema.sql
```

Run a local Cloudflare Pages preview:

```bash
npm run pages:dev
```

Authenticate Wrangler before the first production deployment:

```bash
npx wrangler login
```

Build and deploy to Cloudflare Pages:

```bash
npm run pages:deploy
```

The configured Pages project name is `jkt48-manager-game`. Change `name` in `wrangler.jsonc` if a different Cloudflare Pages project name is required.

Administration dashboards have no player-facing navigation links. Open `/admin/vouchers` or `/admin/patchnotes` directly while signed in with administrator account `user_id = 1`; other accounts are redirected away, and admin API endpoints enforce the same check server-side. Patchnote dates entered in the editor are interpreted as Asia/Jakarta (UTC+7), stored as UTC, and become public only when that publication time arrives.

## Save Data

Guest saves remain in browser IndexedDB. Account saves use the same data locally and upload independently compressed and encrypted `core`, `roster`, `operations`, `history`, and `profile` sections to `jkt48_manager_data_v2`. Local IndexedDB saves from the earlier format still migrate at startup and retain retry and downloadable recovery support. Cloud saves use v2; the legacy `jkt48_manager_data` table is being retired, and legacy-only cloud rows are discarded when the retirement migration runs.

- Only one run can be active at a time.
- Local progress saves after founding setup and each resolved week.
- Signed-in runs create cloud checkpoints after every resolved week, on manual Save run, before refresh, and before logout.
- Registering uploads existing guest progress.
- Logging in loads existing account data; explicit Load cloud save is also available from Save and load.
- Logout waits for successful cloud save and session deletion, then clears all Manager data from local IndexedDB.
- Clearing browser site data removes guest progress that has not been uploaded.

For the legacy cloud-save retirement rollout, deploy the updated Pages/API code first, then run `npm run db:migrate:remote`. This applies migration `0003`, which drops `jkt48_manager_data` and discards any rows that exist only in that table. It preserves `jkt48_manager_data_v2` and the shared account, session, voucher, and patchnote tables. Do not apply the drop migration before the updated API is deployed.

The retired `/api/save/migrate` and `/api/admin/save-migration` endpoints return HTTP 410 and require a page refresh. Previously cached clients that send legacy push or load wire formats continue to have those requests converted to v2 by the backend.

Local save recovery remains available in the browser: if IndexedDB migration or v2 verification fails, the app blocks startup, allows a retry, and offers a recovery download when it can read the save data. Cloud legacy saves are not migrated; users who still have an older cached page should refresh to load the current client.

## Project Structure

```text
src/
  Asset/member_active/   Member portrait assets
  data/                  Member, balance, and Management Perks data
  engine/                Seeded simulation and weekly resolution logic
  state/                 IndexedDB persistence
  context/               Authentication, encrypted cloud sync, and voucher inventory
  components/AuthScreen  Login, registration, guest entry, and sync status
  components/Patchnote*  Admin editor and player update notice
  App.jsx                Main React application and views
  localization.js        English-to-Indonesian localization
  styles.css             Responsive light and dark theme styles
test/                    Node test suite
public/                  Cloudflare Pages static configuration
wrangler.jsonc           Cloudflare Pages configuration
schema.sql               Manager save, voucher, patchnote, redemption, and audit tables
functions/api/           Same-origin auth, save, voucher, patchnote, and admin endpoints
```

## Game Calendar

Each year contains 12 named months with four weeks per month, for a total of 48 weeks.

- Video Call: once per member each month
- Meet & Greet: once per week, involving all available members
- Concert: once per month, involving all available members
- Audition: available from October Week 1
- Theater renovation: available at December Week 4
- Graduation checks: performed at Week 1 of each month from Year 2 onward

## Data and Assets

Active-member information is sourced from `src/data/newmemberdata.js`. Portraits are loaded from `src/Asset/member_active/`. Entries under the excluded JKT48V generation are not included in the playable roster.

Do not redistribute member images or third-party data unless you have the appropriate permission to do so.

## License

No open-source license is currently included. Unless a license is added, the source code remains under its default copyright restrictions.
