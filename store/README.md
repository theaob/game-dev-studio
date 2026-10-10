# Publishing on Google Play

Everything needed for the Play Console listing is in this folder:

- `listing.md`: the name, descriptions, category and release notes to paste in.
- `privacy-policy.md`: the privacy policy. Its URL is https://github.com/theaob/game-dev-studio/blob/main/store/privacy-policy.md
- `graphics/`: the icon, feature graphic and phone screenshots.
- `play-games/`: the 25 achievements (names, descriptions, points) and their icons, for Google Play Games.

The app bundle (AAB) comes from CI: open the latest run of *CI & itch.io deploy* on `main` and download the `android-aab` artifact. It's signed with the upload key from the `ANDROID_*` secrets.

## App details

| | |
|---|---|
| Package name | `io.github.theaob.gamedevstudio` (can't change after the first upload) |
| Target SDK | 36 |
| Version code | the CI run number, so every build is higher than the last |
| Ads | Google AdMob: rewarded videos (Store, and when cash is negative) and an occasional interstitial after a game's reviews |
| In-app purchases | `remove_ads`, a one-time product |

## Checklist

### 1. Create the app
Play Console → **Create app**:
- App name: `Game Dev Studio`
- Default language: English (United States)
- App or game: **Game**
- Free or paid: **Free** (a free app can never be changed to paid)
- Accept the declarations.

### 2. App content (Policy → App content)

| Section | Answer |
|---|---|
| Privacy policy | https://github.com/theaob/game-dev-studio/blob/main/store/privacy-policy.md |
| Ads | **Yes**, the app contains ads |
| App access | All functionality is available without special access |
| Content rating | Fill in the IARC questionnaire (see below) |
| Target audience | 13–15, 16–17 and 18+ (leaving out under-13s avoids the extra Families policy requirements) |
| Data safety | No data collected, no data shared (see below) |
| Government app | No |
| Financial features | None |
| Health | None |
| News app | No (the in-game News tab is fiction) |

**Content rating questionnaire (IARC).** Category: *Game*. Answer **No** to violence, fear, sexuality, gambling, language, controlled substances, crude humour, user interaction or chat and sharing location. Answer **Yes** to *digital purchases* (Remove ads). Some game topics have dark names (Horror, Zombies, Military, Post-Apocalyptic), but they're text labels only, with nothing shown. Expect *Everyone* / PEGI 3.

**Data safety.** The game itself collects nothing; the AdMob SDK does. Answer:
- Does your app collect or share any of the required user data types? **Yes**.
- Is all of the user data collected by your app encrypted in transit? **Yes**.
- Do you provide a way for users to request that their data be deleted? **No** (the game keeps no user data; Google handles ad data).
- Data types, all *collected* and *shared*, *not* processed ephemerally, *required* (can't be turned off), for **Advertising or marketing**, **Analytics** and **Fraud prevention, security and compliance**:
  - **Location → Approximate location** (from the IP address).
  - **App activity → App interactions** (ads seen and tapped).
  - **App info and performance → Crash logs** and **Diagnostics**.
  - **Device or other IDs → Device or other IDs** (the advertising ID).
- Purchases go through Google Play Billing, so the game doesn't collect purchase history itself.

**Advertising ID.** In App content → Advertising ID, answer **Yes**, the app uses it, for **Advertising or marketing** and **Analytics**. The AdMob SDK adds the `AD_ID` permission automatically.

### 2b. AdMob and the Remove ads product
1. **AdMob** (https://admob.google.com): add an Android app, link it to the Play listing once it exists, and create two ad units: one **Rewarded** and one **Interstitial**.
2. In GitHub → Settings → Secrets and variables → Actions → **Variables** (not secrets, the IDs ship inside the app), add:

   | Variable | Value |
   |---|---|
   | `ADMOB_APP_ID` | the app ID, `ca-app-pub-…~…` |
   | `ADMOB_REWARDED_ID` | the rewarded ad unit, `ca-app-pub-…/…` |
   | `ADMOB_INTERSTITIAL_ID` | the interstitial ad unit |

   Until these are set, builds show Google's **test ads**, which is what you want while testing. Never tap your own real ads.
3. **Privacy & messaging** in AdMob: create a **GDPR** consent message for the app (and a US state message if you like). The game shows it automatically to players who need it and adds a *Privacy options* menu entry for them.
4. **app-ads.txt**: it's at https://theaob.github.io/app-ads.txt (repo `theaob/theaob.github.io`), authorising publisher `pub-3615836489279250`. In the Play Console's **Store settings → Store listing contact details**, set the website to `https://theaob.github.io/` (the game's page is https://theaob.github.io/games/game-dev-studio/). AdMob checks the file within about a day of the app being linked to its Play listing; see AdMob → Apps → app-ads.txt.
5. **Play Console → Monetize → Products → In-app products**: create a one-time product with ID **`remove_ads`** (it must match exactly), a name like "Remove ads" and a price, then activate it. This needs a payments profile (merchant account) in the Play Console. The product only shows a price in the app once a build with billing has been uploaded to a testing track.

### 2c. Google Play Games achievements
The Android app signs players in to **Google Play Games** and unlocks the matching Play Games achievement whenever they earn one in the game (and catches up on ones they earned before signing in). Until it's set up, the app works exactly as before, with achievements only in the game.

1. **Create the project.** Play Console → the app → Grow users → **Play Games Services → Setup and management → Configuration**. Choose *No, my game doesn't use Google APIs* and create a new Play Games Services project named `Game Dev Studio`.
2. **OAuth consent screen.** Under Credentials, follow the link to Google Cloud and configure the consent screen: *External*, app name `Game Dev Studio`, your support email. No scopes are needed.
3. **Android credentials.** Back in Configuration → **Add credential** → *Android*, with package name `io.github.theaob.gamedevstudio`, and create an OAuth client for each key that signs builds you'll play:
   - **Play App Signing key** (installs from the Play Store): copy its SHA-1 from Test and release → Setup → **App signing**.
   - **Shared debug key** (CI builds from pull requests and itch.io, when no release key is set): SHA-1 `3E:F8:3C:67:56:18:B2:1B:73:D9:C1:19:BB:E2:15:8E:D8:D1:4A:35`.
   - **Your upload key**, if you install CI release builds directly: its SHA-1 is on the same App signing page.
4. **Achievements.** Setup and management → **Achievements** → Add achievement, once per row of [`play-games/achievements.csv`](play-games/achievements.csv): name, description, the icon from [`play-games/icons/`](play-games/icons/), points as listed (they add up to exactly 1,000, the maximum), and *Revealed*. Keep the names exactly as listed: the game matches achievements by name.
5. **Testers.** Setup and management → **Testers**: add your Google account (and your testers'). Until Play Games is published, only testers can sign in.
6. **Get the IDs.** Achievements → **Get resources** → *Android (XML)*, and copy the whole XML. In GitHub → Settings → Secrets and variables → Actions → **Variables**, add `PLAY_GAMES_RESOURCES` with that XML as the value. CI reads the project ID and every achievement ID from it, and its tests fail if any achievement is missing an ID.
7. **Build and try it.** Run CI on `main` (or wait for the next push), install the new build, open Menu → Achievements → *Google Play Games* and sign in.
8. **Publish.** Play Games Services → **Review and publish**, so everyone (not just testers) can sign in. Do this alongside the production release.

**Data safety and privacy.** The Play Games SDK sends the player's Play Games profile and achievement progress to Google. Add what Google lists for Play Games Services to the Data safety form; the privacy policy already covers it.

### 3. Store listing
Grow users → Store presence → **Main store listing**: paste the text from `listing.md` and upload `graphics/icon-512.png`, `graphics/feature-graphic.png` and `graphics/phone/*` in order. Also set **Store settings**: category *Simulation* and a contact email.

### 4. Upload a build and test it
1. Testing → **Internal testing** → Create new release.
2. Accept **Play App Signing** when asked (Google keeps the app signing key, and the key in our secrets is only the upload key).
3. Upload the `.aab` from the `android-aab` artifact, add the release notes from `listing.md` and roll out to yourself as a tester.
4. Install it from the Play Store link on a real phone and check:
   - the top bar and the bottom tabs aren't hidden under the status bar or the navigation bar (Android 15+ draws apps edge to edge);
   - the back button behaves sensibly;
   - the game saves and resumes after you close it;
   - the Store's *Free with a video* rewards play a test ad and pay out;
   - after your third release, closing the reviews sometimes shows a full-screen test ad (at most every 4 minutes);
   - *Remove ads* in the menu opens the Google Play purchase sheet. Add your account under Settings → **License testing** to buy without being charged.

### 5. Closed test (new personal developer accounts)
Personal developer accounts created after November 2023 must run a **closed test with at least 12 testers who stay opted in for 14 days** before they can apply for production access. Set up Testing → **Closed testing**, add the testers' Google accounts (or a Google Group), and share the opt-in link. Organisation accounts skip this step.

### 6. Production
After the closed test, apply for production access (Dashboard), then create a release under **Production** with the same AAB or a newer one. Google's review usually takes from a few hours to a few days.

## Updating the graphics
The screenshots were taken from the web build at 360 × 640 with 3× pixel density (1080 × 1920), using saves from a simulated career. If the UI changes a lot, retake them. Any 9:16 screenshot from a phone also works.
