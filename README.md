# Game Dev Studio

A mobile-first game development tycoon. Found a studio in a 1985 garage, make games, chase great reviews and grow into a campus by 2025.

Built as an installable web app (PWA) in TypeScript + Vite with no runtime dependencies. It runs in any phone browser, works offline once loaded, and can be wrapped for the App Store or Google Play with [Capacitor](https://capacitorjs.com/).

## Gameplay

- **Make games**: pick a title, a **topic** and a **genre**. Some combinations are great and some are terrible. You learn which after each release.
- **Choose a platform**: 18 fictional platforms launch and retire over 40 years, from home computers and 8-bit consoles to handhelds, motion consoles and phones. Each has its own audience size, license cost and genre preferences.
- **Set the focus** for each of the 3 development phases (Foundation, Content, Presentation). Each genre cares about different areas, and reviews reveal what matters.
- **Balance design vs tech**: every genre has an ideal ratio.
- **Polish** to squash bugs before you release.
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

## Project layout

```
src/core/      Pure, deterministic simulation (no DOM). Seeded RNG lives in the save.
  data.ts      Topics, genres, platforms, research, offices: all the tuning numbers
  sim.ts       Game state, weekly tick, player actions
  scoring.ts   Review score model
  bot.ts       Automated players used for tests and balancing
src/ui/        DOM rendering: tabs, bottom sheets, game loop, animations
src/save.ts    localStorage persistence
public/        PWA manifest, icon, service worker
```

## Shipping to app stores (next step)

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Game Dev Studio" com.example.gamedevstudio --web-dir dist
npm run build && npx cap add ios && npx cap add android && npx cap sync
```
