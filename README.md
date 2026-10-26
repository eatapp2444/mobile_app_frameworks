# EatApp mobile framework — v17

One repo builds **every** app in the EatApp CMS. You never edit anything here per app.

## Setup (once, ~2 minutes)

1. Create an **empty** GitHub repo and copy every file from this zip into it.
2. Commit and push. **Do not run `npm install` locally.** You do not need node_modules,
   an `.env` file, or the EAS CLI on your Mac.
3. In [expo.dev](https://expo.dev) → your project → **GitHub** → connect this repository.
   Leave **Base directory** blank (not `/`).
4. Go to the EatApp CMS → an app → **Save & Publish**. The CMS dispatches the workflow,
   Expo checks out this repo, and everything else is automatic.

That's it. No local install step exists, so there are no local dependency errors.

## Why installs used to fail

- **`package-lock.json` is committed** so new dependencies stay reproducible.
  `.npmrc` still sets `legacy-peer-deps=true`. If a lockfile ever goes stale,
  regenerate it with `npm install` rather than editing it by hand.
- **`.npmrc` sets `legacy-peer-deps=true`**, which absorbs the OneSignal / expo-font
  peer conflicts that caused `ERESOLVE could not resolve`.
- Dependency versions are pinned to exactly what Expo SDK 54 expects
  (`npx expo install --check` reports "Dependencies are up to date").

## Why `expo` commands no longer crash

`app.config.js` used to throw when the CMS config wasn't reachable, which broke
`expo config`, `expo install --fix` and Expo's GitHub integration with
`No EAS project id for bundle "app.eatapp.demo"`.

It now degrades gracefully: without `EATAPP_BUNDLE_ID` it produces a valid generic
config, and it only demands an EAS project id while actually running on EAS Build.

## How a build gets its data

The CMS dispatches `.eas/workflows/build-ios.yml` / `build-android.yml` with inputs:

| input | example |
| --- | --- |
| `bundle_id` | `com.company.bkstakeaway` |
| `eas_project_id` | `30c33451-…` |
| `app_version` | `7.0.2` |
| `build_number` | `53` |

`scripts/fetch-config.js` then pulls `/api/public/apps/config` for that bundle and writes
`assets/config/app.json` plus the downloaded icon/splash images. `app.config.js` reads
those to produce the name, slug, bundle id, version, build number, permissions,
OneSignal plugin and splash screen. At runtime `src/config.ts` re-fetches the same
endpoint so content changes appear without a rebuild.

## Optional: running it locally

Only if you want the Expo Go preview:

```bash
npm install
EATAPP_BUNDLE_ID=com.company.bkstakeaway npx expo start -c
```

## Notes

- Only `app.config.js` exists — delete any leftover `app.config.ts`.
- `eas.json` pins Node `20.19.4` and iOS image `latest` (Xcode 26) so App Store Connect
  stops rejecting uploads with ITMS-90725.

## v13 changes

* **App bar is now 100% CMS-driven** — `design.template` (`appbar|tabs|drawer|none`),
  `design.showTitle`, `theme.appBar` / `theme.appBarText` (auto-contrast from
  `theme.primary`), app name/logo and every entry in
  `navigation.appBarButtons[]` (the notification bell is always first).
* **Notification centre** — new `/notifications` screen renders
  `notifications.history[]` (real OneSignal deliveries returned by the CMS),
  with relative timestamps and pull-to-refresh.
* **External links fixed** — the CMS returns external targets in `route`
  (not `url`), which previously routed to `/p/<https:/...>` and showed
  “This page is not available yet.” All navigation now goes through
  `src/nav.ts`, which opens `http(s)` targets in the in-app WebView,
  `tel:`/`mailto:`/`sms:` in the OS handler, and everything else as a page.
  `UrlView` gained cookies, pull-to-refresh, loading indicator and an
  “Open in browser” fallback.
* **Home “blank” layout** — supports `home.blank.{bg, heading, subheading,
  overlay, textPos, headingColor, subColor}` including the vertical text
  position slider and per-text colours.
* **Fonts** — `theme.fontFamily` is applied to native text (tab bar / app bar)
  and `theme.fontStack` inside every WebView, so app and dashboard match.


## v16 — linked EAS project identity

The build workflows now require and pass both `eas_project_id` and `expo_slug`.
`app.config.js` uses that authoritative slug and stops immediately when a linked
EAS build is missing it, preventing errors such as project slug `bkstakeaway`
being built with the repository fallback slug `eatapp`. Replace both files in
`.eas/workflows/` when upgrading an existing repository.


## Separate Expo projects for iOS and Android (v17)

Android often lives in its own Expo project with its **own slug and project ID**
(for example iOS `bkstakeaway`, Android `bkstakeaway-android`). EAS rejects a build
when `slug` does not match the slug of the project referenced by `extra.eas.projectId`,
which is what caused:

```
Project config: Slug for project identified by "extra.eas.projectId" (bkstakeaway)
does not match the "slug" field (eatapp).
```

### How to configure it

1. In the CMS open **App → Store & Submission → Android**.
2. Fill **Package name** (the Android application id — it may differ from the iOS bundle id).
3. Fill **Android EAS project ID (optional)** with the Expo project ID used for Android.
   Leave it empty to reuse the app-wide EAS project.
4. Click **Check slug** — the CMS asks Expo for that project and shows the real slug.
5. Save. Every Android build/submit now uses that project ID and its slug; iOS keeps
   using the app-wide project.

### What the workflow receives

| input | iOS | Android |
| --- | --- | --- |
| `bundle_id` | `apps.bundle_id` | Android **package name** |
| `eas_project_id` | app-wide EAS project | Android EAS project (falls back to app-wide) |
| `expo_slug` | slug of the iOS project | slug of the Android project |
| `app_version` / `build_number` | resolved by the CMS | resolved by the CMS |

`app.config.js` uses `EATAPP_SLUG` for `slug` and `EAS_PROJECT_ID` for
`extra.eas.projectId`, so the two always agree and the slug mismatch cannot occur.

## Android target API level (Google Play requirement)

Google Play requires apps to target **Android 16 (API level 36)** or higher.
`app.config.js` includes the `expo-build-properties` plugin which pins:

```
compileSdkVersion: 36
targetSdkVersion: 36
buildToolsVersion: '36.0.0'
minSdkVersion: 24
```

After replacing the framework, run `npm install` (adds `expo-build-properties`),
commit, push, then start a new Android build from the CMS. Test with an internal
track release before promoting to production.

## Downloading a testable APK (no Play Store)

The `preview` build profile produces an installable **APK** with internal
distribution. A dedicated workflow ships at
`.eas/workflows/build-android-apk.yml` (same inputs as `build-android.yml`,
but `profile: preview`).

From the CMS: **App → Builds → EAS live connection → Build Android APK (test)**.
When the build finishes, use the **Download** button in the Builds-on-EAS table
(or the EAS build page) to get the `.apk`, then sideload it on any Android
device (`adb install app.apk` or open the link on the phone).

Notes
- The APK is signed with the same EAS keystore, so OneSignal push and Google
  Maps work exactly as in the store build, provided your Maps API key allows
  the EAS debug/release SHA-1.
- Play Store releases keep using `build-android.yml` (`profile: production`,
  AAB).

## v20 — Android app name & icon fix

Android builds use a different application id than iOS, and the previous
build-time config sync aborted when the CMS payload reported the iOS bundle id.
That silently shipped the generic **EatApp** name and the placeholder icon.

v20 changes:

- `scripts/fetch-config.js` accepts the CMS payload when the requested id matches
  either `app.bundleId` (iOS) or the new `app.androidPackage` (Android).
- With `EATAPP_STRICT_CONFIG=1` (set by every CMS workflow) the build now **fails
  loudly** instead of falling back to the generic name/icon, including when no
  icon could be downloaded.
- `app.config.js` resolves the Android `package` from `EATAPP_ANDROID_PACKAGE` or
  `app.androidPackage` before falling back to the requested bundle id.

Upload your icon in the CMS (App → Icon) before building.


## v21 — Google Play photo/video permission fix (superseded by v23)

`fastlane supply` fails with *"All developers requesting access to the photo and
video permissions are required to tell Google Play about the core functionality
of their app"* when the AAB declares `READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE`.

v21 only added those permissions when **Photos** or **Storage** was switched on in
the CMS, and listed them under `android.blockedPermissions` when off. That was
not enough: the CMS ships `storage.on: true` for client apps that never read
storage, so the permissions were still merged into the AAB.

## v23 — always strip photo/video/storage and Advertising ID on Android

EatApp client apps do not use a native photo picker, media library, or ads.
Every Android build now sets `android.blockedPermissions` (Expo writes
`tools:node="remove"`) for:

- `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` / `READ_MEDIA_VISUAL_USER_SELECTED`
- `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE`
- `com.google.android.gms.permission.AD_ID`

CMS Photos/Storage toggles are ignored on Android so a per-app flag cannot
reintroduce the Play declaration. iOS usage-description strings are unchanged.
OneSignal push permissions (`POST_NOTIFICATIONS`, `INTERNET`, `VIBRATE`,
`RECEIVE_BOOT_COMPLETED`, FCM/C2DM, `WAKE_LOCK`, etc.) are not blocked.

If an app ever needs photo access, complete Play Console -> Policy -> App
content -> **Photo and Video Permissions** *and* stop blocking the matching
permission in `app.config.js` — do not rely on the CMS toggle alone.

## Homepage HTML — opening native tabs and submenus

Builder-supplied Home HTML (and other CMS pages rendered by `HtmlView`) can
open the same native tabs and group sheets as the tab bar. Links are
intercepted inside the WebView — the same path as `tel:` / `mailto:` / `https`.
The page does **not** navigate away, so there is no white flash.

This is **generic**: any tab can be a submenu (Order, Venues, More, …). Short
aliases `eatapp://open/order` and `eatapp://open/venues` follow Fenwick's
**single- vs multi-venue** rule.

**Rule:** a short alias is multi-venue when the matching Order/Venues tab is a
group with **two or more children** (the bottom-nav submenu). Otherwise it is
single-venue: the tab's own destination opens, or its only child if the group
has exactly one. `config.venues.length` is a fallback only when that group has
no children. Live CMS payloads often leave `venues: []` and put rows on the
group.

The Order alias matches a tab whose id or label is `Order`, `Order Online`,
`Order now`, `Online order`, or `Online ordering`. The Venues alias matches
`Venues`, `Venue`, `Our Venues`, or `Our Venue`. Unrelated tabs (Menu, Account,
Home) are not matched. `eatapp://open/tab/<name>` is still an exact id/label
match and is unchanged.

| href | Behaviour |
| --- | --- |
| `eatapp://open/tab/<name>` | Same as tapping that tab. If the tab is a **group** (`isGroup` / `action: "group"` with sub-items), its sheet opens (e.g. Venues → Hahndorf / Murray Bridge / Mount Barker). If it is not a group, that tab is selected. `<name>` matches the tab **id** or **label**, case-insensitive (`Venues`, `venues`, `about-us`). Query strings and hashes are ignored (`eatapp://open/tab/order?x=1`). |
| `eatapp://open/order` | **Order Online** button. Single-venue → that venue's online ordering listing. Multi-venue → the Order / Order Online bottom-nav sheet so the guest picks a venue. |
| `eatapp://open/venues` | **Our Venues** rows. Single-venue → that venue's page. Multi-venue → the Venues bottom-nav sheet. Never an ordering URL. |
| any other `eatapp://…` | Ignored. The WebView does not load the URL. Unknown tab names are also no-ops. |

Example for the homepage HTML (what the page generator should emit):

```html
<a href="eatapp://open/order">Order online</a>
<a href="eatapp://open/venues">Our venues</a>
<li><a href="eatapp://open/venues">Hahndorf</a></li>
```

Pre-build check (required in CI):

```bash
npm run check:nav-links -- path/to/config.json
```

Apps that never use these hrefs are unchanged. Do not use `https://…` if you
want a native **sheet** — that still opens the in-app browser (`/web`).

### Builder config: a submenu on any tab

The tab bar already treats **every** `navigation.items[]` entry the same. Order
is not a unique type. To make Venues (or any tab) a multi-venue submenu, send
the same group shape Order already uses:

```json
{
  "id": "venues",
  "label": "Venues",
  "icon": "MapPin",
  "isGroup": true,
  "action": "group",
  "submenu": {
    "title": "Venues",
    "items": [
      { "id": "hahndorf", "label": "Hahndorf", "route": "/hahndorf" },
      { "id": "murray-bridge", "label": "Murray Bridge", "route": "/murray-bridge" },
      { "id": "mount-barker", "label": "Mount Barker", "route": "/mount-barker" }
    ]
  }
}
```

Equivalent: put the rows on `children` instead of `submenu.items`. The tab bar
opens a sheet only when **`isGroup` or `action: "group"`** is set **and** that
list is non-empty — the same rule Order already uses. A tab that has extra
`children` but is not flagged as a group still opens its own `url`/`route` and
keeps its own pane. Child `route` values are normal page slugs (`/hahndorf`) or
`https://…` Order URLs.

A tab with no group flag (or an empty submenu) stays a single destination (tap
or `eatapp://open/tab/<name>` just switches to it).

## v22 — no header jump + screen animation

- The home screen and every stacked screen (page / web view / notifications)
  now render the **same `AppBar` component** at a fixed 52pt height, so the top
  bar no longer shifts a few pixels while navigating.
- Back navigation is a chevron inside that same bar (`showBack`), instead of a
  separate, slightly shorter sub-header.
- Screen transitions use `slide_from_right` (220ms) and the app-bar title
  cross-fades/slides in, for a smoother feel.
- App-bar icons dim on press for touch feedback.
