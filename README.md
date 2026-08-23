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

Create the Manager save and voucher tables before deployment (the script is idempotent):

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

Guest saves remain in browser IndexedDB. Account saves use the same IndexedDB data locally and upload an encrypted snapshot to the Manager-only `jkt48_manager_data` D1 table.

- Only one run can be active at a time.
- Local progress saves after founding setup and each resolved week.
- Signed-in runs create cloud checkpoints every four resolved weeks, on manual Save run, and before logout.
- Registering uploads existing guest progress.
- Logging in loads existing account data; explicit Load cloud save is also available from Save and load.
- Logout waits for successful cloud save and session deletion, then clears all Manager data from local IndexedDB.
- Clearing browser site data removes guest progress that has not been uploaded.

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
