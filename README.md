# Game Dev Studio

A mobile-first game development tycoon. Found a studio in a 1985 garage, make games, chase great reviews and grow into a campus by 2025.

Built as an installable web app (PWA) in TypeScript + Vite. The only runtime dependencies are three.js, which renders the 3D office and loads lazily after the game starts, and the bundled Bricolage Grotesque display font.

The UI is laid out like a mobile game, not a web page. The office fills the screen, with a HUD on top (studio, play/pause, speed, cash/fans/RP), an action dock and a floating tab bar. Other tabs slide up as panels over the office, and sheets can be swiped down to close. The visual style is warm paper and ink: outlined cards and buttons with hard offset shadows, a tomato-red primary colour, and mustard and teal accents. It runs in any phone browser, works offline once loaded, and can be wrapped for the App Store or Google Play with [Capacitor](https://capacitorjs.com/).

## Gameplay

- **Make games**: pick a title, a **topic** and a **genre**. Some combinations are great and some are terrible. You learn which after each release, and from then on the new-game screen shows a **reception preview**: how players will take that combination, how your last game with it scored, and whether players are tired of seeing it.
- **Make sequels** to any released game: they keep its topic and genre, sell to its fans (up to +45% for a hit, less for a flop), and skip the "seen this recently" penalty. Rushing one out within a year reviews worse, and long series start to tire players.
- **Awards**: a game that reviews 9.0 or better is a 🏅 Critics' Choice, 9.5 or better a 👑 Masterpiece. The badge shows on the game and in the games list, and its sequel starts development with hype already built (+20 at 9.0, +40 at 9.5, +60 for a perfect 10).
- **🏆 Game of the Year**: each new year, the best-reviewed release of the last one, yours or a rival's, wins (ties go to you; the News tab reports the winner). Winning brings fans (3% of yours, at least 1,000), 25% more copies of what it has left to sell if it's still on sale, and +15 hype for its sequel.
- **Choose a platform**: 18 fictional platforms launch and retire over 40 years, from home computers and 8-bit consoles to handhelds, motion consoles and phones. Each has its own audience size, license cost and genre preferences.
- **Set the focus** for each of the 3 development phases (Foundation, Content, Presentation). Each genre cares about different areas, and reviews reveal what matters.
- **Balance design vs tech**: every genre has an ideal ratio. Missing it costs review points, though a game that clearly beats expectations on total points is forgiven much of that.
- **Watch your team work** in a 3D low-poly office (three.js) that changes as you move from the garage to the campus. Day turns to night, monitors light up faces in the dark, computers change with the decades (beige CRTs in the 80s to dual widescreens later), every desk has a personal item, and a studio cat wanders around. Tap a developer or the cat to say hi. The cat climbs onto computers (on top of the warm CRTs of the early years) and, while a game is in development, now and then curls up on someone's lap for a few weeks: that developer works 30% faster while it purrs. You can drop the cat on a developer yourself, but after each visit it wants a few weeks of alone time. Press and drag the cat to carry it around the room by the scruff, like a mother cat carries a kitten: it dangles and swings as you move, then lands on its feet (a little offended) wherever you let go. Every so often a developer gets **in the zone**: they glow, sparks fly, and for a few weeks they produce 1.8x as much with half the bugs. Staff chatter in speech bubbles (designers and tech folks say different things, and the whole team reacts to reviews and paydays) and wander off for coffee breaks. Breaks are just for show and don't affect output.
- **Polish** before you release. Fix bugs one at a time, or add more design or tech points to fix the game's balance for its genre. Design and tech polishing gives less each week, and new bugs slip in while nobody is fixing them. All points (design, tech, bugs, research) are gained in whole numbers.
- **Marketing**:
  - Pick an ad budget when you start a game. Magazine ads are available from day one, and research unlocks the big campaigns. Ad costs scale with the game's size.
  - Build **hype** while a game is in development: a press preview, a trailer, or (from 2006) an influencer campaign, all from the 📣 Promote button. Hype fades a little each week.
  - Hype pays off only if the game delivers. A well-reviewed game sells more and wins more fans. A hyped game that reviews badly gets a backlash: fewer sales and fans walking away.
  - **GameExpo** runs every year. Book a small, medium or big booth up to 8 weeks before it for a burst of hype and new fans.
  - After launch, use 📣 Push sales on a game on the market: an ad push sells more of its remaining copies, and a discount sale cuts the price but sells many more copies and wins extra fans.
- **Industry news** (News tab):
  - Every January a new **trend** starts: a hot genre (+15% sales) and a hot topic (+10%). The new-game screen marks them with 🔥.
  - **Rival studios** open, release games and close over the decades. A rival's hit (8+) takes 15% of the sales of your games with the same topic and genre for half a year, and the new-game screen warns you.
  - A **platform market** overview shows each platform's audience and whether it is growing, shrinking or about to be discontinued, plus rumours of next year's launches.
  - A yearly round-up of your studio's releases, and your own studio log.
- **Reviews** from 4 outlets decide sales and fans. The bar keeps rising: the market expects each game to beat your best work.
- **Store**: spend cash on power-ups. Boosts last a few game-development weeks: the Espresso Bar adds 20% more points, Pizza Night triples the chance of getting in the zone, and a Bug Bash fixes 40% of bugs at once. Permanent studio upgrades are Ergonomic Chairs (+5% points), Noise-cancelling Headphones (zone 50% more often) and Test Automation (15% fewer bugs). Boost prices scale with team size, and all prices rise over the years like salaries.
- **Decorate the studio** (🎨 Decorate, in the Store or the Team tab): repaint the walls and floor (a small fee, going back to the original is free), and buy decorations: a rug, potted plants, bean bags, a bookshelf, a trophy shelf (one trophy per game that scored 8 or more), an aquarium, an arcade cabinet and a neon sign with your studio's name. Each one has its own spot in the room, and once bought it can be placed or put away for free. It's just for looks, it's saved with the game, and it moves with you to bigger offices. (The 2D fallback office shows the paint but not the decorations.)
- **Game results**: every game records what it cost (budget and license, marketing, and the team's salaries and rent while they made it) and what it sold each week.
  - Tap a game for its report card: a verdict (🏆 Blockbuster, ⭐ Hit, 👍 Success, 😐 Broke even, 💸 Flop, from how many times its cost it made), revenue, profit, copies and score.
  - Its charts show money made against cost (and the week it paid for itself), copies sold each week, and where the money went.
  - The Games tab charts the profit or loss of every release (tap a column to open the game), and games on sale show a small sales line.
- **Grow**: take contracts to pay the bills, earn research points (RP), unlock topics, game sizes, engines and QA, hire and train staff, and move to bigger offices.
  - Every week of development earns RP (more with a bigger team), and every release earns more, scaled by its review score and size. Contracts earn some too.
  - A solo founder earns roughly 50–60 RP a year, enough for medium-sized games within about a year and the first engine and design upgrades by the third or fourth.
- **Money**:
  - Monthly rent and salaries apply (including a modest wage for you, the founder), and three months in the red means bankruptcy.
  - Every game has a production budget, so a flop loses money.
  - Prices rise about 5% a year: salaries get a yearly pay review, and rent, budgets, marketing and the Store follow suit.
  - Bigger platforms sell more games, but crowded markets mean sales grow slower than player numbers.
  - Contracts cover your running costs with a little to spare: a safety net, not a way to get rich.
  - Late in the game a Global TV & web campaign (from 1998) gives big studios something big to spend on.
  - The money curve is tuned with `scripts/balance.test.ts` (prints year-by-year cash for many bot careers), and `src/core/economy.test.ts` keeps it on target:
    - good studios get rich (but not absurdly);
    - careless studios that expand go bankrupt;
    - careless solo developers stay small.

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
3. **Android jobs**: build an APK from the same web build and push it to the `android` channel (see [Android](#android)).

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
  economy.ts   Prices, inflation, market reach: the money model
  scoring.ts   Review score model
  bot.ts       Automated players used for tests and balancing
src/ui/        DOM rendering: tabs, bottom sheets, game loop, animations
  office3d.ts  3D office scene (three.js), lazy-loaded
  office.ts    2D pixel-art office: fallback when WebGL is unavailable or three.js can't load
  office-loading.ts  Loading card shown while three.js downloads
  office-common.ts  Behaviour shared by both: looks, gestures, day/night, eras
src/save.ts    localStorage persistence
public/        PWA manifest, icon, service worker
```

## Android

The game is wrapped as a native Android app with [Capacitor](https://capacitorjs.com/). The Android Studio project is in `android/`, configured by `capacitor.config.ts` (app id `io.github.theaob.gamedevstudio`). It's portrait-only and uses the game's icon and a paper-coloured splash screen. Those images are generated from `assets/` with `npx @capacitor/assets generate --android`.

**CI** (`.github/workflows/ci.yml`, job *Android APK*):
- Every run copies the web build into the Android project and builds an APK and an Android App Bundle (AAB) with Gradle. They are saved as the `android-apk` and `android-aab` artifacts on the workflow run (Actions → the run → Artifacts).
- The **AAB is for Google Play**. It is only Play-ready when it's signed with your own upload key (see Signing below). Without the key it's named `…-debug-signed.aab`, and Play will reject it.
- On `main`, `v*` tags and manual runs, the APK is pushed to itch.io on the `android` channel, so it shows up as an Android download on the game page.
- Pull requests build the same APK for testing and never deploy.
- `versionCode` is the run number, so every build installs as an update. `versionName` matches the web version.

**Signing.** Android only installs updates signed with the same key as the installed version.
- **Shared debug key (the default):** without release secrets, every build is signed with the debug key committed at `android/app/debug.keystore`. All builds share it, so itch.io players can install updates over older versions.
  - It's fine for sideloading from itch.io.
  - Because the key is public, anyone could sign an APK that installs over yours.
  - Google Play won't accept it.
- **Your own release key (recommended before a wider release or Google Play):** create it once on your computer (needs Java):

```bash
keytool -genkeypair -v -keystore release.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore   # on macOS: base64 -i release.keystore
```

Then add four repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the base64 output above |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose |
| `ANDROID_KEY_ALIAS` | `upload` (or the alias you used) |
| `ANDROID_KEY_PASSWORD` | the key password (same as the keystore password if you pressed Enter) |

Once the secrets are set, the next run on `main` (or a manual run: Actions → CI & itch.io deploy → Run workflow) produces a signed `game-dev-studio-<version>.aab` in the `android-aab` artifact. Upload it in the Play Console under Testing or Production → Create new release. The first time, accept **Play App Signing**: Google keeps the key that signs the app players download, and your key is only the *upload* key, so if you lose it Google can reset it.

Keep `release.keystore` and its passwords backed up somewhere safe. If you lose them, players can't install updates and have to reinstall. Switching from the shared debug key to your release key also means players reinstall once.

**Ads and Remove ads (Android only).** The Android app shows Google AdMob ads (`src/ui/monetization.ts`, plugins `@capacitor-community/admob` and `@capgo/native-purchases`):
- **Rewarded videos** (`src/core/rewards.ts`): in the Store, players can watch a video for an investor's cash, a free Espresso Bar or a research grant, each with a cooldown in game weeks. When the studio is in the red, the investor offer also shows on the studio screen.
- **Interstitials**: rarely, after closing a game's reviews. Never in the first 3 minutes of a session, never within 4 minutes of another ad, and not before the player's third release.
- **Remove ads**: a one-time Google Play purchase (`remove_ads`) turns off interstitials; reward videos stay optional. *Restore purchases* and, where required, *Privacy options* (Google's consent form) are in the menu.
- AdMob IDs come from the repository variables `ADMOB_APP_ID`, `ADMOB_REWARDED_ID` and `ADMOB_INTERSTITIAL_ID`. Without them the app shows Google's test ads.
- The web and itch.io builds never load the ad or billing plugins. To try the ad UI in a browser, open the dev server with `?fake-ads`.

**Google Play:** the store listing text, privacy policy, graphics and a step-by-step Play Console checklist are in [`store/`](store/README.md).

**Local builds:** `npm run android` builds the web game, syncs it into `android/` and opens Android Studio. You need Android Studio with JDK 21 and Android SDK 36.
