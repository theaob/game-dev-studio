# Publishing on Google Play

Everything needed for the Play Console listing is in this folder:

- `listing.md`: the name, descriptions, category and release notes to paste in.
- `privacy-policy.md`: the privacy policy. Its URL is https://github.com/theaob/game-dev-studio/blob/main/store/privacy-policy.md
- `graphics/`: the icon, feature graphic and phone screenshots.

The app bundle (AAB) comes from CI: open the latest run of *CI & itch.io deploy* on `main` and download the `android-aab` artifact. It's signed with the upload key from the `ANDROID_*` secrets.

## App details

| | |
|---|---|
| Package name | `io.github.theaob.gamedevstudio` (can't change after the first upload) |
| Target SDK | 36 |
| Version code | the CI run number, so every build is higher than the last |
| Ads | none |
| In-app purchases | none |

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
| Ads | No, the app does not contain ads |
| App access | All functionality is available without special access |
| Content rating | Fill in the IARC questionnaire (see below) |
| Target audience | 13–15, 16–17 and 18+ (leaving out under-13s avoids the extra Families policy requirements) |
| Data safety | No data collected, no data shared (see below) |
| Government app | No |
| Financial features | None |
| Health | None |
| News app | No (the in-game News tab is fiction) |

**Content rating questionnaire (IARC).** Category: *Game*. Answer **No** to everything: violence, fear, sexuality, gambling, language, controlled substances, crude humour, user interaction or chat, sharing location, digital purchases. Some game topics have dark names (Horror, Zombies, Military, Post-Apocalyptic), but they're text labels only, with nothing shown. Expect *Everyone* / PEGI 3.

**Data safety.**
- Does your app collect or share any of the required user data types? **No**.
- That gives the listing "No data collected" and "No data shared".
- The game makes no network requests. Saves stay on the device.

### 3. Store listing
Grow users → Store presence → **Main store listing**: paste the text from `listing.md` and upload `graphics/icon-512.png`, `graphics/feature-graphic.png` and `graphics/phone/*` in order. Also set **Store settings**: category *Simulation* and a contact email.

### 4. Upload a build and test it
1. Testing → **Internal testing** → Create new release.
2. Accept **Play App Signing** when asked (Google keeps the app signing key, and the key in our secrets is only the upload key).
3. Upload the `.aab` from the `android-aab` artifact, add the release notes from `listing.md` and roll out to yourself as a tester.
4. Install it from the Play Store link on a real phone and check:
   - the top bar and the bottom tabs aren't hidden under the status bar or the navigation bar (Android 15+ draws apps edge to edge);
   - the back button behaves sensibly;
   - the game saves and resumes after you close it.

### 5. Closed test (new personal developer accounts)
Personal developer accounts created after November 2023 must run a **closed test with at least 12 testers who stay opted in for 14 days** before they can apply for production access. Set up Testing → **Closed testing**, add the testers' Google accounts (or a Google Group), and share the opt-in link. Organisation accounts skip this step.

### 6. Production
After the closed test, apply for production access (Dashboard), then create a release under **Production** with the same AAB or a newer one. Google's review usually takes from a few hours to a few days.

## Updating the graphics
The screenshots were taken from the web build at 360 × 640 with 3× pixel density (1080 × 1920), using saves from a simulated career. If the UI changes a lot, retake them. Any 9:16 screenshot from a phone also works.
