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

The repository includes `wrangler.jsonc` and uses `dist` as the Pages build output directory.

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

## Save Data

Save data remains in the player's browser using IndexedDB. It is not uploaded to a server and is scoped to the site's browser origin.

- Only one run can be active at a time.
- Progress is saved after founding setup and each resolved week.
- Manual saving is available from the game menu.
- Clearing browser site data removes the active run and Management Token profile.
- Saves from localhost and a deployed Pages domain are separate.

## Project Structure

```text
src/
  Asset/member_active/   Member portrait assets
  data/                  Member, balance, and Management Perks data
  engine/                Seeded simulation and weekly resolution logic
  state/                 IndexedDB persistence
  App.jsx                Main React application and views
  localization.js        English-to-Indonesian localization
  styles.css             Responsive light and dark theme styles
test/                    Node test suite
public/                  Cloudflare Pages static configuration
wrangler.jsonc           Cloudflare Pages configuration
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
