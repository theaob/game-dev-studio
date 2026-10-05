# Game Dev Studio

A mobile-first game development tycoon. Found a studio in a 1985 garage, make games, chase great reviews and grow into a campus by 2025.

Built as an installable web app (PWA) in TypeScript + Vite with no runtime dependencies. It runs in any phone browser, works offline once loaded, and can be wrapped for the App Store or Google Play with [Capacitor](https://capacitorjs.com/).

## Gameplay

- **Make games**: pick a title, a **topic** and a **genre**. Some combinations are great and some are terrible. You learn which after each release, and from then on the new-game screen shows a **reception preview**: how players will take that combination, how your last game with it scored, and whether players are tired of seeing it.
- **Choose a platform**: 18 fictional platforms launch and retire over 40 years, from home computers and 8-bit consoles to handhelds, motion consoles and phones. Each has its own audience size, license cost and genre preferences.
- **Set the focus** for each of the 3 development phases (Foundation, Content, Presentation). Each genre cares about different areas, and reviews reveal what matters.
- **Balance design vs tech**: every genre has an ideal ratio.
- **Watch your team work** in an animated pixel-art office that changes as you move from the garage to the campus. Every so often a developer gets **in the zone**: they glow, sparks fly, and for a few weeks they produce 1.8x as much with half the bugs. Staff chatter in speech bubbles (designers and tech folks say different things, and the whole team reacts to reviews and paydays) and wander off for coffee breaks. Breaks are just for show and don't affect output.
- **Polish** to squash bugs one at a time (bugs are always whole numbers) before you release.
- **Reviews** from 4 outlets decide sales and fans. The bar keeps rising: the market expects each game to beat your best work.
- **Grow**: take contracts to pay the bills, earn research points, unlock topics, game sizes, engines and QA, hire and train staff, and move to bigger offices.
- Monthly rent and salaries apply, and three months in the red means bankruptcy.

The game autosaves to local storage every in-game month.

## Development

```bash
npm install
npm run dev        # dev server, also reachable from your phone on the LAN
npm test           # unit tests and full-game bot playthroughs
npm run build      # typecheck and production build in dist/
npx vitest run scripts/balance.test.ts   # year-by-year economy report from bot players
```

## CI and itch.io deployment

`.github/workflows/ci.yml` runs on every push and pull request:

1. **Build job**: `npm ci`, typecheck, unit tests and bot playthroughs, `vite build`, and a check that `dist/` is a valid HTML5 upload (has `index.html` and uses only relative asset paths). The build is saved as the `web-build` artifact.
2. **Deploy job**: pushes that exact build to itch.io with [butler](https://itch.io/docs/butler/). It runs on pushes to `main`, on `v*` tags, and when started by hand from the Actions tab. It never runs for pull requests.

Versions show up on itch.io as `0.1.0-build.<run number>` for `main` builds, or as the tag (`v1.2.0` → `1.2.0`) for releases.

### One-time setup

1. **Create the game on itch.io** (Dashboard → Create new project):
   - Kind of project: **HTML**
   - Upload a placeholder once, or let the first CI run create the `html5` channel. Then tick **This file will be played in the browser**.
   - Embed options: **Mobile friendly**, orientation **Portrait**, viewport around **390 × 780**, and turn on **Fullscreen button**.
2. **Get a butler API key**: run `butler login` locally and copy the key from `~/.config/itch/butler_creds`, or create one at <https://itch.io/user/settings/api-keys>.
3. **Configure the GitHub repo** (Settings → Secrets and variables → Actions → **Secrets**). Add three repository secrets:
   - `BUTLER_API_KEY`: the key from step 2
   - `ITCH_USER`: your itch.io username (the `<user>` in `<user>.itch.io`)
   - `ITCH_GAME`: the project's URL slug (the `<game>` in `<user>.itch.io/<game>`)

   The deploy job uses a GitHub environment called `itch.io`. You can add required reviewers to it under Settings → Environments if you want to approve each release. Because the username and slug are secrets, GitHub masks them in logs as `***`.

If anything is missing, the deploy job fails straight away with a message saying what to add.

## Project layout

```
src/core/      Pure, deterministic simulation (no DOM). Seeded RNG lives in the save.
  data.ts      Topics, genres, platforms, research, offices: all the tuning numbers
  sim.ts       Game state, weekly tick, player actions
  scoring.ts   Review score model
  bot.ts       Automated players used for tests and balancing
src/ui/        DOM rendering: tabs, bottom sheets, game loop, animations
  office.ts    Procedural pixel-art office scene (canvas)
src/save.ts    localStorage persistence
public/        PWA manifest, icon, service worker
```

## Shipping to app stores (next step)

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Game Dev Studio" com.example.gamedevstudio --web-dir dist
npm run build && npx cap add ios && npx cap add android && npx cap sync
```
