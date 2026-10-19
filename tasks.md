[DONE] Session 1 of 12 — Mobile phase B: reviewer fixes for the version lock screen, chat attachment button and download buttons

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/shared/components/app-version-lock/* warehouse-front/src/app/core/platform/app-version.service.ts warehouse-front/src/app/core/platform/app-version.service.spec.ts warehouse-front/src/app/modules/common/components/communications/chat-drawer/chat-drawer.component.* warehouse-front/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices.html warehouse-front/src/app/modules/common/components/operations/companies/companies.html warehouse-front/src/app/app.html
verify: python scripts/automation/verify_tools.py glob-absent --root warehouse-front/src/app/shared/components/app-version-lock --glob "*.ts" "*.html" --regex "animate-fade-in|active:scale-98|text-right|text-left|bg-white|text-slate-|border-slate-|bg-slate-|rotate-180|z-50" --skip-specs
verify: python scripts/automation/verify_tools.py glob-absent --root warehouse-front/src/app/shared/components/app-version-lock --glob "*.ts" --regex "err\.message" --skip-specs
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/shared/components/app-version-lock/app-version-lock.component.spec.ts --min-tests 4 --require "still pending"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/modules/common/components/communications/chat-drawer/chat-drawer.component.html --contains "[attr.aria-label]"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(ui): version lock accessibility and tokens, honest emergency result, labelled download buttons"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7, 9 and 10 apply (design system: semantic tokens `surface`/`fg`/`line`, `<svg appIcon>` only, Persian `title` and `aria-label`, touch targets at least 40x40 px for icon-only buttons, logical directions).
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- No data may ever be lost: do not change how the queues are flushed, gated or deleted. Only the messages and the UI of the lock screen change.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context: plan `Documents/Mobile_App_Capacitor/implementation_plan_mobile_app.md`, heading `## گزارش پیشرفت` (the last entry lists these reviewer findings). Files: `warehouse-front/src/app/shared/components/app-version-lock/app-version-lock.component.ts` (inline template), `chat-drawer.component.html` near line 195, `employee-invoices.html` near line 579, `companies.html` near lines 1822, 1874, 2675, 2738. Read `.claude/skills/design-system/SKILL.md` for tokens and patterns.

3. Task:
- a) Lock overlay: use `z-[100]` (the modal layer); on open move focus to the update button, keep Tab inside the dialog, and set the `inert` attribute on the app content behind it (a wrapper around the `router-outlet` in `app.html`), removing it when the overlay closes. Keep `role="dialog"` and `aria-modal="true"`; add `aria-labelledby` pointing to the heading.
- b) Lock component styles: replace `bg-white`, `text-slate-*`, `border-slate-*`, `bg-slate-*` with the semantic tokens; `text-right`/`text-left` with `text-start`/`text-end`; remove the undefined `animate-fade-in` (use the existing `.fade-in` class) and `active:scale-98` (use `active:scale-95`); replace the rotated `cloud-upload` icon with `appIcon="download"` (if `download` is not in the icon registry, use an existing registry icon without rotation and say which).
- c) Emergency send result: after the send finishes, refresh the unsent count; show the success text only when it is 0; otherwise show «هنوز {n} رکورد ارسال نشده است؛ دوباره تلاش کنید» with `n` in Persian digits (use the project's existing Persian digit helper). Never show `err.message`; show a fixed Persian error text.
- d) Every count shown in the component uses Persian digits.
- e) `chat-drawer.component.html`: the attachment download button gets `[attr.aria-label]="'دانلود ' + att.file_name"` and the same `title`; replace inner `<div>` elements inside the `<button>` with `<span class="block">` keeping their classes.
- f) The download buttons in `employee-invoices.html` and `companies.html` that replaced `download` anchors get the project's standard `focus-visible` ring classes.
- g) New spec `app-version-lock.component.spec.ts` with at least 4 tests, one whose name contains `still pending` (an emergency send that leaves records shows the pending text, not the success text), plus success when the count is 0, the fixed Persian error text on failure, and focus moved into the dialog when locked.

4. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most three runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/shared/**/*.spec.ts" --include "src/app/core/platform/*.spec.ts"`. If a command fails, read its output and change approach.

5. Output and stop condition:
- Commit with this message, without push:
fix(ui): version lock accessibility and tokens, honest emergency result, labelled download buttons
- Short English report: changes per finding (a to g), the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 2 of 12 — Mobile phase B: add Capacitor 8, the CoManage Android and iOS projects, mobile build configurations and flavors

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/package.json warehouse-front/package-lock.json warehouse-front/capacitor.config.ts warehouse-front/angular.json warehouse-front/.gitignore warehouse-front/src/environments/* warehouse-front/src/app/app.config.ts warehouse-front/android/* warehouse-front/ios/*
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/capacitor.config.ts --contains "appId: 'ir.comanage.soft'" --contains "appName: 'CoManage'" --contains "webDir: 'dist-mobile/warehouse-app/browser'" --contains "androidScheme: 'https'" --contains "hostname: 'localhost'"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/environments/environment.mobile.ts --contains "serverOrigin: 'https://soft.farsalish.ir'" --contains "apiUrl: '/api'" --contains "appChannel: 'direct'"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/environments/environment.mobile-test.ts --contains "serverOrigin: 'https://app.farsalish.ir'" --contains "apiUrl: '/api'"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/angular.json --contains "mobile-test" --contains "dist-mobile"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/android/app/build.gradle --contains "applicationId \"ir.comanage.soft\"" --contains "applicationIdSuffix \".test\"" --contains "productFlavors" --contains "direct" --contains "bazaar" --contains "myket" --contains "APP_CHANNEL"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/package.json --contains "@capacitor/core" --contains "@capacitor/android" --contains "build:mobile" --contains "build:mobile-test"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/app.config.ts --contains "isNativePlatform()" --contains "withInterceptors([authInterceptor, errorInterceptor, offlineInterceptor, apiOriginInterceptor])"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/.gitignore --contains "/dist-mobile"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: cd warehouse-front && npx ng build --configuration mobile-test
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(mobile): Capacitor 8 projects, mobile build configurations and Android flavors"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- The web build and web behavior must not change. The mobile build writes to `warehouse-front/dist-mobile/` and never to `warehouse-front/dist/` (Express serves `dist/` right now).
- These values are permanent after the first install and must be exactly: app id `ir.comanage.soft`, test flavor suffix `.test`, `androidScheme: 'https'`, `hostname: 'localhost'`. Changing them later makes every user's offline data unreachable.
- Do not install the Android SDK and do not run Gradle in this session. Do not create a keystore.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`. Never stage build outputs (`dist-mobile`, `android/app/build`, `android/.gradle`, `local.properties`, `android/app/src/main/assets/public`).

2. Context:
- Plan headings `### ۴-ب.`, `### ۴-د.`, `#### گام ب-۱` and `## ۱۰.` (the test build uses app id `ir.comanage.soft.test`).
- npm versions available today: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios` 8.5.3.
- `angular.json` build `configurations` has `production` (with `"serviceWorker": "ngsw-config.json"`) and `development`; default `production`. `app.config.ts` registers the service worker with `enabled: !isDevMode()`.
- Environment files have `serverOrigin: ''` and `appChannel: 'direct'`. `isNativePlatform` is in `src/app/core/platform/platform.ts`.

3. Definitions: flavor dimensions in `android/app/build.gradle`: `env` with `prod` (no suffix, `manifestPlaceholders = [appLabel: "CoManage"]`) and `staging` (`applicationIdSuffix ".test"`, `versionNameSuffix "-test"`, `manifestPlaceholders = [appLabel: "CoManage تست"]`); `channel` with `direct`, `bazaar`, `myket`, each with `buildConfigField "String", "APP_CHANNEL", "\"<name>\""`. `AndroidManifest.xml` uses `android:label="${appLabel}"` for the application and the main activity.

4. Task:
- a) In `warehouse-front`: `npm install @capacitor/core@^8.5.3 @capacitor/android@^8.5.3 @capacitor/ios@^8.5.3` and `npm install -D @capacitor/cli@^8.5.3`.
- b) `capacitor.config.ts` with `appId: 'ir.comanage.soft'`, `appName: 'CoManage'`, `webDir: 'dist-mobile/warehouse-app/browser'`, `server: { androidScheme: 'https', hostname: 'localhost' }`, and a comment that these values must never change.
- c) `src/environments/environment.mobile.ts` (copy of `environment.ts` with `serverOrigin: 'https://soft.farsalish.ir'`, `appChannel: 'direct'`) and `environment.mobile-test.ts` (same with `serverOrigin: 'https://app.farsalish.ir'`).
- d) `angular.json`: build configurations `mobile` and `mobile-test`, each equal to `production` but with `"serviceWorker": false`, `"outputPath": "dist-mobile/warehouse-app"` and the matching `fileReplacements` for `environment.ts`.
- e) `app.config.ts`: the service worker `enabled: !isDevMode() && !isNativePlatform()`.
- f) `package.json` scripts: `"build:mobile": "ng build --configuration mobile && npx cap sync"`, `"build:mobile-test": "ng build --configuration mobile-test && npx cap sync"`. Add `/dist-mobile` to `warehouse-front/.gitignore`.
- g) `npx ng build --configuration mobile-test`, then `npx cap add android`, then `npx cap add ios`. If `cap add ios` fails on Windows, keep going, do not create `ios/` by hand, and report the exact error.
- h) Add the flavors from section 3 to `android/app/build.gradle` and the label placeholder to `AndroidManifest.xml`; remove the `app_name` string only if it causes a duplicate resource error.

5. Tool policy: each `npm install` at most twice; `npx ng build --configuration mobile-test` at most twice; `npx ng build --output-path ../scratch/ng-build-agent` at most twice; one run of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/core/**/*.spec.ts"`. If a command fails, read its output and change approach.

6. Before finishing: `git status --short` shows no build output; `git diff --stat` shows only allowed paths.

7. Output and stop condition:
- Commit with this message, without push:
feat(mobile): Capacitor 8 projects, mobile build configurations and Android flavors
- Short English report: installed versions, generated folders, the `cap add ios` result, the compile and target SDK levels from `android/variables.gradle`. End the turn after the commit and report.

===

[DONE] Session 3 of 12 — Mobile phase B: install the Android SDK, generate app icons, and build the staging debug APK

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/package.json warehouse-front/package-lock.json warehouse-front/resources/* warehouse-front/android/* warehouse-front/ios/* warehouse-front/public/icons/* warehouse-front/src/index.html
verify: python -c "import pathlib,sys; s=pathlib.Path('E:/Android/Sdk'); ok={'adb':(s/'platform-tools/adb.exe').is_file(),'platforms':any((s/'platforms').glob('android-*')),'build_tools':any((s/'build-tools').glob('*')),'apkanalyzer':(s/'cmdline-tools/latest/bin/apkanalyzer.bat').is_file()}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import pathlib,subprocess,sys; apks=[p for p in pathlib.Path('warehouse-front/android/app/build/outputs/apk').rglob('*.apk') if all(k in p.name.lower() for k in ('staging','direct','debug'))]; print('apks:',[str(a) for a in apks]); r=subprocess.run(['cmd','/c','E:\\Android\\Sdk\\cmdline-tools\\latest\\bin\\apkanalyzer.bat','manifest','application-id',str(apks[0])],capture_output=True,text=True) if apks else None; out=r.stdout.strip() if r else ''; print('application-id:',out); sys.exit(0 if out=='ir.comanage.soft.test' else 1)"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/index.html --contains "apple-touch-icon-180.png"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(mobile): app icons and the first staging debug build"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes (SDK and Gradle downloads take minutes). Never start a command in the background, and never end your turn while a command is still running.
- Install the Android SDK only under `E:\Android\Sdk`. Do not change system or user environment variables; point Gradle to the SDK through `warehouse-front/android/local.properties` (`sdk.dir=E\:\\Android\\Sdk`), which must stay untracked.
- The user approved installing the Android SDK in this plan; accept the SDK licenses with `sdkmanager --licenses` (answer `y`).
- Do not change the app id, flavors, `capacitor.config.ts` or any web source except `src/index.html`. Do not create a keystore.
- Do not push. Stage only your changed files. Never stage build outputs or `local.properties`. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context:
- Plan heading `#### گام ب-۱`. JDK 21 (Temurin) is installed and on PATH. `dl.google.com`, `services.gradle.org` and `maven.google.com` are reachable.
- Session 2 created `warehouse-front/android/` (read `android/variables.gradle` for `compileSdkVersion` and `targetSdkVersion`).
- `public/icons/` has only SVG icons (`icon-512x512.svg` is the largest). `src/index.html` links `apple-touch-icon` to an SVG, which iOS ignores.

3. Task:
- a) Download the latest Windows "command line tools" zip (find its file name in `https://dl.google.com/android/repository/repository2-3.xml`), unpack it so that `E:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat` exists, accept the licenses, and install `platform-tools`, `platforms;android-<compileSdkVersion>` and the matching `build-tools` version.
- b) Write `warehouse-front/android/local.properties` with `sdk.dir`.
- c) Icons: `npm install -D @capacitor/assets@^3`; create `warehouse-front/resources/icon.png` (1024x1024) and `resources/splash.png` (2732x2732, the icon centered on the app's dark background color) by rendering `public/icons/icon-512x512.svg` with the `sharp` package that `@capacitor/assets` brings; run `npx capacitor-assets generate --android --ios` (the iOS part may be skipped if it fails). Also write `public/icons/apple-touch-icon-180.png` (180x180) and point the `apple-touch-icon` link in `src/index.html` to `icons/apple-touch-icon-180.png`.
- d) `npm run build:mobile-test`, then in `warehouse-front/android` run `gradlew.bat assembleStagingDirectDebug`.

4. Tool policy: each install or download command at most twice; Gradle at most three times. If a download fails twice, stop and report the exact error. If a command fails, read its output and change approach.

5. Before finishing: `git status --short` shows no build output and no `local.properties`.

6. Output and stop condition:
- Commit with this message, without push:
feat(mobile): app icons and the first staging debug build
- Short English report: SDK packages installed, the APK path and size, the application id, any warning that matters. End the turn after the commit and report.

===

[DONE] Session 4 of 12 — Mobile phase B: native branches for file saving, printing, external links, back button, status bar, splash and camera permission

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/package.json warehouse-front/package-lock.json warehouse-front/capacitor.config.ts warehouse-front/src/app/core/platform/* warehouse-front/src/app/app.ts warehouse-front/src/app/app.config.ts warehouse-front/src/app/modules/common/components/operations/companies/company-gdrive-tab/company-gdrive-tab.ts warehouse-front/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts warehouse-front/android/* warehouse-front/ios/*
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/platform/file-output.ts --contains "@capacitor/filesystem" --contains "@capacitor/share" --contains "@capgo/capacitor-printer" --contains "isNativePlatform"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/platform/external-link.ts --contains "@capacitor/browser" --contains "isNativePlatform"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/android/app/src/main/AndroidManifest.xml --contains "android.permission.CAMERA"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/modules/common/components/operations/companies/company-gdrive-tab/company-gdrive-tab.ts --contains "isNativePlatform"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts --contains "isNativePlatform"
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/platform/file-output.spec.ts --min-tests 8 --require "native"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: cd warehouse-front && npx ng build --configuration mobile-test
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(mobile): native file saving, printing, links, back button and app shell"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 9 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Web behavior must stay identical: every native branch runs only when `isNativePlatform()` is true; web branches are not changed.
- Do not push. Stage only your changed files. Never stage build outputs, `local.properties`, `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context:
- Plan headings `### ۴-الف.`, `#### گام ب-۲` and `## ۱۰.` (Google Drive OAuth is web-only; the barcode scanner keeps `@zxing` through the WebView camera, ML Kit is deferred).
- `core/platform/file-output.ts` (`saveBlob`, `saveUrl`, `printWindow`) and `core/platform/external-link.ts` (`openExternal`) have web implementations and comments marking the native branch.
- npm versions available: `@capacitor/app` 8.1.2, `@capacitor/browser` 8.0.5, `@capacitor/filesystem` 8.1.5, `@capacitor/share` 8.0.3, `@capacitor/status-bar` 8.0.4, `@capacitor/splash-screen` 8.0.2, `@capgo/capacitor-printer` 8.1.8. Read each plugin's README in `node_modules` before using it.
- Google Drive OAuth popups: `company-gdrive-tab.ts` (around line 603) and `settings-backup-tab.ts` (around line 525).

3. Task:
- a) Install the seven plugins with `npm install`.
- b) `saveBlob` native: write the blob as base64 with `Filesystem.writeFile` to `Directory.Cache` under the given file name, then `Share.share({ title: filename, url: <file uri> })`. `saveUrl` native: download the resolved URL with `fetch` using the same `Authorization` header the app's direct `fetch` calls use (read `offline-queue-runner.ts`), then pass the blob to `saveBlob`. `printWindow` native: print the HTML of the target document (`(target ?? window).document.documentElement.outerHTML`) with the printer plugin's HTML print method.
- c) `openExternal` native: `Browser.open({ url: resolveServerUrl(url) })` and return `null`; popups to `about:blank` are not supported natively and return `null`.
- d) App shell (a small `core/platform/native-shell.ts` started from `app.config.ts` or `app.ts`), native only: Android back button with `App.addListener('backButton', ...)` that goes back in history when possible and otherwise minimizes the app; `StatusBar` style matching the theme; `SplashScreen.hide()` once the app is stable.
- e) Google Drive connect buttons in the two files: when native, do not open the popup; show the existing toast service with «اتصال گوگل‌درایو را از نسخهٔ وب انجام دهید».
- f) `AndroidManifest.xml`: add `android.permission.CAMERA` (the WebView camera for the barcode scanner). Run `npx cap sync`.
- g) Extend `core/platform/file-output.spec.ts` to at least 8 tests with mocked plugins: native `saveBlob` writes and shares; native `printWindow` calls the printer; web paths unchanged. Use the word `native` in those test names.

4. Tool policy: `npm install` at most twice; each build command at most twice; from the repo root at most three runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/core/platform/*.spec.ts"`. If a command fails, read its output and change approach.

5. Output and stop condition:
- Commit with this message, without push:
feat(mobile): native file saving, printing, links, back button and app shell
- Short English report: plugin versions, the native behavior of each function, tests added, the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 5 of 12 — Mobile phase B backend: publish live-update bundles and APK files through public endpoints

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-backend/core/settings_core/mobile_release.py warehouse-backend/core/settings_core/views.py warehouse-backend/core/settings_core/mobile_views.py warehouse-backend/core/settings_core/management/commands/publish_mobile_bundle.py warehouse-backend/core/settings_core/management/commands/publish_mobile_apk.py warehouse-backend/core/settings_core/test_mobile_release.py warehouse-backend/config/urls.py
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/config/urls.py --contains "api/public/mobile-update/" --contains "api/public/mobile-files/"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/core/settings_core/test_mobile_release.py --count "8:def test_"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels settings_core integration_tests --known scripts/automation/known_backend_failures.txt --min-tests 40
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(mobile): public live-update manifest and mobile file download"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- No migration. Files live under `MEDIA_ROOT / 'mobile'` only. The public file view must never serve anything outside that folder: accept only file names matching `^[A-Za-z0-9._-]+\.(zip|apk)$` and resolve them inside the folder.
- Run `manage.py test` only with labels. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context: plan headings `### ۴-ج.` and `#### گام ب-۳`. `config/urls.py` registers `api/public/config/` (line 24) and serves media through `common.media_urls.serve_media`. `MEDIA_ROOT` is in `config/settings.py:298`.

3. Definitions:
- Manifest file: `MEDIA_ROOT/mobile/updates/manifest.json` with `{"version": "X.Y.Z", "file": "<name>.zip", "sha256": "<hex>", "min_native_version": "X.Y.Z", "published_at": "<ISO time>"}`.
- APK folder: `MEDIA_ROOT/mobile/apk/`.

4. Task:
- a) `core/settings_core/mobile_release.py`: helpers to read the manifest (a missing or invalid file returns None), compute sha256, validate versions (`^\d{1,4}\.\d{1,4}\.\d{1,4}$`).
- b) Management command `publish_mobile_bundle --zip PATH --version X.Y.Z --min-native X.Y.Z`: validate, copy the zip to `mobile/updates/<version>.zip`, compute sha256, write the manifest atomically (temporary file then replace). Never delete older bundles.
- c) Management command `publish_mobile_apk --apk PATH --version X.Y.Z --channel direct|bazaar|myket --env prod|staging`: copy to `mobile/apk/CoManage-<version>-<channel>.apk` for `prod` and `mobile/apk/CoManage-<version>-<channel>-test.apk` for `staging`, and print the public URL path.
- d) Views in `core/settings_core/mobile_views.py` (AllowAny): `GET /api/public/mobile-update/` returns the manifest plus `"url"` (absolute URL of `/api/public/mobile-files/updates/<file>` built with `request.build_absolute_uri`) or `{}` when there is none; `GET /api/public/mobile-files/<kind>/<name>` with `kind` in `updates`/`apk` streams the file with `FileResponse` (`as_attachment=True` for APKs, content type `application/vnd.android.package-archive`), 404 otherwise.
- e) `core/settings_core/test_mobile_release.py` with at least 8 tests using a temporary `MEDIA_ROOT` (`override_settings`): no manifest gives `{}`; publish then read gives version, sha256 and url; invalid version rejected; path traversal or bad names (`../x.zip`, `a/b.apk`, `x.exe`) give 404; APK served with the right content type; older bundles kept after a second publish.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test settings_core --noinput`. If a command fails, read its output and change approach.

6. Output and stop condition:
- Commit with this message, without push:
feat(mobile): public live-update manifest and mobile file download
- Short English report: endpoints, commands, tests with pass count. End the turn after the commit and report.

===

[DONE] Session 6 of 12 — Mobile phase B: live update on the native app with Capgo in manual mode, and the bundle build script

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/package.json warehouse-front/package-lock.json warehouse-front/capacitor.config.ts warehouse-front/tools/make-mobile-bundle.js warehouse-front/src/app/core/platform/* warehouse-front/src/app/app.config.ts warehouse-front/src/app/app.ts warehouse-front/android/* warehouse-front/ios/*
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/capacitor.config.ts --contains "CapacitorUpdater" --contains "autoUpdate: false" --contains "appId: 'ir.comanage.soft'" --contains "androidScheme: 'https'" --contains "hostname: 'localhost'"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/platform/live-update.ts --contains "notifyAppReady" --contains "checksum" --contains "/api/public/mobile-update/" --contains "min_native_version"
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/platform/live-update.spec.ts --min-tests 7 --require "isSyncing"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/tools/make-mobile-bundle.js --contains "sha256" --contains "dist-mobile"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: cd warehouse-front && npx ng build --configuration mobile-test
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(mobile): live update with Capgo in manual mode"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- No data may ever be lost: a new bundle is only marked for the NEXT cold start (`next`), never applied immediately with `set` or a reload; nothing touches IndexedDB, the queues or storage. Do not change `appId`, `androidScheme` or `hostname`.
- Web behavior must stay identical: everything runs only when `isNativePlatform()` is true.
- Do not push. Stage only your changed files. Never stage build outputs, `local.properties`, `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context:
- Plan headings `### ۴-ج.` and `#### گام ب-۳`. Backend (session 5): `GET /api/public/mobile-update/` returns `{version, file, sha256, min_native_version, published_at, url}` or `{}`.
- `@capgo/capacitor-updater` 8.53.0 is available; read its README in `node_modules` (manual mode: `autoUpdate: false`, `notifyAppReady`, `download` with `checksum`, `next`, `current`).
- `APP_VERSION` is in `core/platform/app-version.ts`; `AppUpdateService` in `core/platform/app-update.service.ts` wraps the PWA updater; `resolveServerUrl` in `core/platform/server-origin.ts`; the native app version comes from `App.getInfo()` (`@capacitor/app`).

3. Task:
- a) `npm install @capgo/capacitor-updater@^8.53.0`; in `capacitor.config.ts` add `plugins: { CapacitorUpdater: { autoUpdate: false } }` keeping every other value.
- b) `core/platform/live-update.ts`, native only: call `notifyAppReady()` once the app is stable; then fetch the manifest with `fetch(resolveServerUrl('/api/public/mobile-update/'))`; when its `version` is higher than the current bundle version (`APP_VERSION` for the built-in bundle) and `min_native_version` is not higher than `App.getInfo().version`, download with `checksum: sha256` and call `next({ id })`; while the offline sync is running (`OfflineSyncService` `isSyncing`), skip and retry later; errors are logged and ignored. Check at start and when the app returns to the foreground, at most once per 30 minutes.
- c) Start it from `AppUpdateService` (native branch) without changing the web branch.
- d) `tools/make-mobile-bundle.js`: zip `dist-mobile/warehouse-app/browser` into `dist-mobile/bundles/<version>.zip` (version from `package.json`), print the sha256 and the exact `publish_mobile_bundle` command to run. Use Node built-ins or packages already in `node_modules`; if a zip package is needed, add it as a dev dependency.
- e) `core/platform/live-update.spec.ts` with at least 7 tests (mocked plugins): web does nothing; a newer version downloads with checksum and calls `next`; the same or an older version does nothing; a too high `min_native_version` does nothing; while `isSyncing` it does not download (the test name contains `isSyncing`); errors are swallowed; `notifyAppReady` is called.
- f) `npx cap sync`.

4. Tool policy: `npm install` at most twice; each build at most twice; at most three runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/core/platform/*.spec.ts"`. If a command fails, read its output and change approach.

5. Output and stop condition:
- Commit with this message, without push:
feat(mobile): live update with Capgo in manual mode
- Short English report: the update flow, tests added, the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 6b of 12 — Mobile phase B: reviewer fixes for the native back button, status bar, external links and native file output

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/core/platform/* warehouse-front/src/app/app.ts warehouse-front/src/app/modules/common/components/operations/companies/company-gdrive-tab/company-gdrive-tab.ts warehouse-front/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/platform/native-shell.ts --absent "prefers-color-scheme" --contains "aria-modal" --contains "Escape"
verify: python -c "import pathlib,sys; t=pathlib.Path('warehouse-front/src/app/core/platform/external-link.ts').read_text(encoding='utf-8'); n=t.count('window.open(resolved, target)'); print('window.open(resolved, target) count:', n); sys.exit(0 if n==1 else 1)"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/platform/file-output.ts --absent "Directory.Cache" --contains "Directory.Documents" --contains "Directory.Data" --contains "setFileOutputErrorNotifier"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/app.ts --contains "setFileOutputErrorNotifier"
verify: python -c "import pathlib,sys; b=pathlib.Path('warehouse-front/src/app/modules/common/components'); fs=[b/'operations/companies/company-gdrive-tab/company-gdrive-tab.ts', b/'settings/tabs/settings-backup-tab/settings-backup-tab.ts']; new='\u0627\u062a\u0635\u0627\u0644 \u06af\u0648\u06af\u0644\u200c\u062f\u0631\u0627\u06cc\u0648 \u0631\u0627 \u0627\u0632 \u0646\u0633\u062e\u0647 \u0648\u0628 \u0627\u0646\u062c\u0627\u0645 \u062f\u0647\u06cc\u062f.'; old='\u06af\u0648\u06af\u0644\u062f\u0631\u0627\u06cc\u0648 \u0631\u0627 \u0627\u0632'; ok={f.name:(new in f.read_text(encoding='utf-8') and old not in f.read_text(encoding='utf-8')) for f in fs}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file warehouse-front/src/app/core/platform/native-shell.spec.ts warehouse-front/src/app/core/platform/external-link.spec.ts warehouse-front/src/app/core/platform/file-output.spec.ts
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/platform/native-shell.spec.ts --min-tests 6 --require "aria-modal"
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/platform/file-output.spec.ts --min-tests 12 --require "Directory.Documents" --require "Directory.Data" --require "cancel"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: cd warehouse-front && npx ng build --configuration mobile-test
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(mobile): reviewer fixes for native shell, links and file output"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Web behavior must stay identical: every change below is inside the `isNativePlatform()` branch, except the two message texts in section 4 f.
- No data may ever be lost: a file the user exports on the phone must be written to persistent storage, never to an evictable cache.
- Do not push. Stage only your changed files. Never stage build outputs, `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`. Never remove or weaken an existing test; update assertions only where this task changes the behavior.

2. Context:
- Files: `warehouse-front/src/app/core/platform/native-shell.ts`, `external-link.ts`, `file-output.ts` and their `.spec.ts` files; `warehouse-front/src/app/app.ts` (it already calls `initNativeShell(this.appRef)` in the constructor); `ToastService` is in `shared/components/toast/toast.component.ts` (`error(message)`).
- Modal components (`shared/components/modal/modal.component.ts`, `confirm-dialog`, and others) close on `@HostListener('document:keydown.escape')` and render an element with `aria-modal="true"`.
- In Capacitor `StatusBar`, `Style.Light` means dark icons for a light background and `Style.Dark` means light icons. The app is always light unless `document.documentElement` has the class `dark`.
- `@capacitor/share` rejects with a message containing `cancel` (any case) when the user closes the share sheet.
- About 39 callers use `void saveBlob(...)`, `void saveUrl(...)` or `printWindow(...)` without handling errors; `offline-db.ts` `downloadLocalDatabaseSnapshotFile` awaits `saveBlob` and its callers show their own error toast.

3. Definitions:
- "Open modal" means `document.querySelector('[aria-modal="true"]')` returns an element.
- "Cancel error" means an error whose message, lowercased, contains `cancel`.

4. Task:
- a) `native-shell.ts`, back button: when a modal is open, dispatch `new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })` on `document` and do nothing else; otherwise keep the current `history.back()` / `minimizeApp()` behavior.
- b) `native-shell.ts`, status bar: remove the `prefers-color-scheme` check; use `Style.Dark` only when `document.documentElement.classList.contains('dark')`, otherwise `Style.Light`.
- c) `external-link.ts`, native branch: remove the `window.open` call so the link opens only once, through the Browser plugin. Leave the web branch unchanged (it keeps its single `window.open(resolved, target)` line).
- d) `file-output.ts`, native branch of `saveBlob`:
  - Write the file with `Directory.Documents`, path `CoManage/<filename>`, `recursive: true` (extend the bridge `writeFile` options type with `recursive?: boolean`). If that write throws, write it again with `Directory.Data` and the same path and options. Remove `Directory.Cache`.
  - Then share the written file `uri` as today. If the share throws a cancel error, return normally (the file is already saved); any other share error is rethrown.
- e) `file-output.ts`, error notifier:
  - Export `setFileOutputErrorNotifier(fn: ((message: string) => void) | null): void` storing the function in a module variable.
  - In the native branches of `saveBlob`, `saveUrl` and `printWindow`, wrap the work in try/catch: on any error that `saveBlob` does not treat as success, call the stored notifier (if set) with `ذخیره یا اشتراک فایل روی گوشی انجام نشد. دوباره تلاش کنید.` (for `printWindow` use `چاپ روی گوشی انجام نشد. دوباره تلاش کنید.`), then rethrow the error. When `saveUrl` calls `saveBlob`, notify only once.
  - In `app.ts` constructor, inject `ToastService` and call `setFileOutputErrorNotifier((m) => toast.error(m))`.
- f) Messages: in `company-gdrive-tab.ts` and `settings-backup-tab.ts` replace `اتصال گوگلدرایو را از نسخهٔ وب انجام دهید` with `اتصال گوگل‌درایو را از نسخه وب انجام دهید.` (with the zero-width non-joiner in گوگل‌درایو and a final period).
- g) Tests (mocked bridges, as the existing specs do):
  - `native-shell.spec.ts` (at least 6 tests in total): with an element `aria-modal="true"` in the document, the back button dispatches an Escape keydown on `document` and does not call `history.back` or `minimizeApp` (the test name contains `aria-modal`); with OS dark mode mocked (`matchMedia` returning `matches: true`) and no `dark` class, `setStyle` gets `Style.Light`.
  - `external-link.spec.ts`: native `openExternal` calls the Browser bridge once and never calls `window.open`.
  - `file-output.spec.ts` (at least 12 tests in total): native `saveBlob` writes with `Directory.Documents` and path `CoManage/<filename>`; falls back to `Directory.Data` when the first write throws (test names contain `Directory.Documents` and `Directory.Data`); a share cancel error resolves without notifying (test name contains `cancel`); a write failure in both directories calls the notifier once and rejects; native `saveUrl` with a 500 response calls the notifier once and rejects; native `printWindow` failure calls the notifier and rejects. Reset the notifier with `setFileOutputErrorNotifier(null)` after each test.

5. Tool policy: in `warehouse-front`, each build at most twice; at most three runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/core/platform/*.spec.ts"`. If a command fails, read its output and change approach.

6. Output and stop condition:
- Commit with this message, without push:
fix(mobile): reviewer fixes for native shell, links and file output
- Short English report: what changed per file, tests added, the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 7 of 12 — Mobile phase B backend: device tokens and FCM push for new notifications (disabled until a Firebase key exists)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-backend/core/notifications/* warehouse-backend/config/settings.py
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/core/notifications/models.py --contains "class DeviceToken"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/core/notifications/push.py --contains "class PushProvider" --contains "FIREBASE_CREDENTIALS_FILE" --contains "on_commit"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/core/notifications/tests.py --count "10:def test_"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py django-tests --labels notifications communications accounts integration_tests --known scripts/automation/known_backend_failures.txt --min-tests 100
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(notifications): device tokens and FCM push"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- One new additive migration in `core/notifications/migrations/` created with `makemigrations notifications`; never edit existing migrations; do not run `migrate` on the local database (the release session does that after a backup).
- Each user registers, lists and deletes only their own tokens. A push goes only to the tokens of the notification's `recipient`.
- Push must never break or slow down notification creation: send after commit (`transaction.on_commit`), in a background thread with a 10-second timeout, catch and log every error. When `FIREBASE_CREDENTIALS_FILE` is not set or the file is missing, the provider is disabled and does nothing.
- No new pip package: use `google-auth` (already installed) for the OAuth token and `requests` for the FCM HTTP v1 call. Never log or commit credentials.
- Run `manage.py test` only with labels. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context: plan heading `#### گام ب-۴`. `core/notifications/models.py` has `Notification` (`recipient`, `title`, `message`, `notification_type`, `target_model`, `target_id`, `created_at`); routes under `api/notifications/` (`core/notifications/urls.py`, router). Notifications are created with `Notification.objects.create` in `communications/views.py`, `personnel/lifecycle_services.py` and `personnel/fleet_lifecycle_services.py`.

3. Task:
- a) Model `DeviceToken`: `user` (FK to `settings.AUTH_USER_MODEL`, CASCADE), `token` (unique, max 512), `platform` (`android`/`ios`), `app_version` (blank), `created_at`, `last_seen_at`. Migration.
- b) `core/notifications/push.py`: `PushProvider` interface, `FcmPushProvider` (reads `settings.FIREBASE_CREDENTIALS_FILE`, project id from the credentials file, sends `title`, `body`, and data `notification_id`, `target_model`, `target_id`), `get_push_provider()` returning a disabled provider when not configured; tokens rejected by FCM as unregistered are deleted.
- c) A `post_save` receiver on `Notification` (created only) that schedules the push with `transaction.on_commit`.
- d) Endpoints under `api/notifications/devices/`: `POST` register or refresh (upsert by token; a token moves to the current user), `DELETE` by token (own only). Authenticated only.
- e) `config/settings.py`: `FIREBASE_CREDENTIALS_FILE = os.environ.get('FIREBASE_CREDENTIALS_FILE', '')`.
- f) Tests in `core/notifications/tests.py` (at least 10 new `test_` methods): register, refresh, move to another user, delete own, cannot delete another user's token, unauthenticated rejected, disabled provider sends nothing, a created notification schedules exactly one send to the recipient's tokens (mock the provider, use `captureOnCommitCallbacks`), provider errors do not raise, unregistered token deleted.

4. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`: `.\venv\Scripts\python.exe manage.py makemigrations notifications` once, at most three runs of `.\venv\Scripts\python.exe manage.py test notifications --noinput`. If a command fails, read its output and change approach.

5. Output and stop condition:
- Commit with this message, without push:
feat(notifications): device tokens and FCM push
- Short English report: model, migration name, endpoints, tests with pass count. End the turn after the commit and report.

===

[DONE] Session 8 of 12 — Mobile phase B frontend: register for push notifications on the native app

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/package.json warehouse-front/package-lock.json warehouse-front/src/app/core/platform/* warehouse-front/src/app/core/auth/auth.service.ts warehouse-front/src/app/app.config.ts warehouse-front/src/app/app.ts warehouse-front/android/* warehouse-front/ios/*
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/platform/push.service.ts --contains "@capacitor/push-notifications" --contains "isNativePlatform" --contains "/notifications/devices/"
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/platform/push.service.spec.ts --min-tests 5
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: cd warehouse-front && npx ng build --configuration mobile-test
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(mobile): push notification registration"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Web behavior must stay identical (native only). Push must never block login or logout: every push call is wrapped and its failure ignored. Without `google-services.json` the Android registration fails at runtime; that must be caught and logged only.
- Do not push. Stage only your changed files. Never stage build outputs, `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`. Do not add `google-services.json`.

2. Context: plan heading `#### گام ب-۴`. Backend (session 7): `POST /api/notifications/devices/` `{token, platform, app_version}` and `DELETE /api/notifications/devices/` `{token}`, authenticated. `@capacitor/push-notifications` 8.1.3 is available. The WebSocket notification stream stays the main channel while the app is open.

3. Task:
- a) `npm install @capacitor/push-notifications@^8.1.3`; `npx cap sync`.
- b) `core/platform/push.service.ts` (`providedIn: 'root'`), native only: after a successful login (hook into `AuthService` where the session starts) request permission, register, and send the token to the backend through `HttpClient`; on logout delete the token before the session is cleared; on a notification tap navigate to the target the existing notification center would open for the same `target_model`/`target_id`, or to the notifications page.
- c) `core/platform/push.service.spec.ts` with at least 5 tests (mocked plugin and HTTP): web does nothing; native registers and posts the token; logout deletes it; a registration error is swallowed; a tap navigates.

4. Tool policy: `npm install` at most twice; each build at most twice; at most three runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/core/**/*.spec.ts"`. If a command fails, read its output and change approach.

5. Output and stop condition:
- Commit with this message, without push:
feat(mobile): push notification registration
- Short English report: hooks used in AuthService, tests added, the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 9 of 12 — Mobile phase B: public download page for the Android app with iPhone install guidance

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/app.routes.ts warehouse-front/src/app/modules/common/components/app-download/* warehouse-front/src/app/modules/common/components/login/login.html warehouse-front/src/app/modules/common/components/login/login.ts
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/app.routes.ts --contains "'download'"
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/modules/common/components/app-download/app-download.component.spec.ts --min-tests 4
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(mobile): public app download page"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7, 9 and 10 apply (design system, Persian text, RTL, accessibility).
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- The page is public (no login, no guard) and lazy-loaded. Do not change any existing route or the login flow except one small link.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context: plan heading `#### گام ب-۵`. `/api/public/config/` returns `app_download_urls.direct`, `system_name` and `app_recommended_version`; `ConfigApiService` (`core/api/config-api.service.ts`) reads it. `openExternal` and `saveUrl` are in `core/platform/`.

3. Task:
- a) Standalone component `modules/common/components/app-download/` at route `download` (public, lazy): app name CoManage, a «دانلود نسخهٔ اندروید» button using `app_download_urls.direct` (disabled with «به‌زودی» when empty), a short Persian guide for installing an Android app from a file, and a short iPhone guide (open the site in Safari, Share, «Add to Home Screen»). Light and dark themes, mobile first.
- b) A small link «دریافت اپ موبایل» to `/download` on the login page, below the form, matching existing link styles.
- c) Spec with at least 4 tests: button enabled with a URL, disabled text without one, iPhone guide rendered, the page renders without login.

4. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; at most three runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/modules/common/components/app-download/*.spec.ts" --include "src/app/modules/common/components/login/*.spec.ts"`. If a command fails, read its output and change approach.

5. Output and stop condition:
- Commit with this message, without push:
feat(mobile): public app download page
- Short English report: route, component, tests, the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 10 of 12 — Mobile phase B: release signing with a keystore outside the repository; signed prod and staging direct APKs

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/android/* warehouse-front/.gitignore
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/android/app/build.gradle --contains "signingConfigs" --contains "keystore.properties"
verify: python -c "import pathlib,subprocess,sys; ks=pathlib.Path('E:/warehouse-secrets/comanage'); apk=lambda env: [p for p in pathlib.Path('warehouse-front/android/app/build/outputs/apk').rglob('*.apk') if all(k in p.name.lower() for k in (env,'direct','release')) and 'unsigned' not in p.name.lower()]; aid=lambda p: subprocess.run(['cmd','/c','E:\\Android\\Sdk\\cmdline-tools\\latest\\bin\\apkanalyzer.bat','manifest','application-id',str(p)],capture_output=True,text=True).stdout.strip(); pr=apk('prod'); st=apk('staging'); ok={'keystore':(ks/'release.jks').is_file(),'props':(ks/'keystore.properties').is_file(),'prod_apk':bool(pr) and aid(pr[0])=='ir.comanage.soft','staging_apk':bool(st) and aid(st[0])=='ir.comanage.soft.test'}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; out=subprocess.run(['git','ls-files'],capture_output=True,text=True).stdout; bad=[l for l in out.splitlines() if l.endswith(('.jks','.keystore','keystore.properties','local.properties','google-services.json'))]; print('tracked secrets:',bad); sys.exit(1 if bad else 0)"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "build(mobile): release signing from a keystore outside the repository"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Secrets never enter the repository: the keystore and its passwords live only in `E:\warehouse-secrets\comanage\`. Never print the passwords in your report or in any file you write outside that folder; never commit `keystore.properties`, `*.jks` or `local.properties`.
- Do not change the app id, flavors or any web source. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context: plan headings `### ۴-د.`, `#### گام ب-۵` and `## ۱۰.` (the staging flavor `ir.comanage.soft.test` talks to `app.farsalish.ir`; the prod flavor talks to `soft.farsalish.ir`). JDK 21 `keytool` is on PATH. The Android SDK is at `E:\Android\Sdk`; `android/local.properties` exists (untracked).

3. Task:
- a) Create `E:\warehouse-secrets\comanage\` and generate `release.jks` with `keytool -genkeypair` (RSA 4096, validity 10000 days, alias `comanage`, distinguished name `CN=CoManage, O=CoManage, C=IR`) with a random 32-character store and key password generated by a script (for example Python `secrets.token_urlsafe`), never typed into your report.
- b) Write `E:\warehouse-secrets\comanage\keystore.properties` with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`, and a `README.txt` there in Persian saying this folder must be backed up and that losing it makes app updates impossible.
- c) `android/app/build.gradle`: a `release` signing config that reads the properties file at `E:/warehouse-secrets/comanage/keystore.properties` when it exists (path overridable by the environment variable `COMANAGE_KEYSTORE_PROPERTIES`), used by the `release` build type; builds without the file still work unsigned. Add `*.jks` and `keystore.properties` to `warehouse-front/.gitignore`.
- d) `npm run build:mobile`, then in `warehouse-front/android` `gradlew.bat assembleProdDirectRelease`; then `npm run build:mobile-test`, then `gradlew.bat assembleStagingDirectRelease`.

4. Tool policy: `keytool` once; Gradle at most four times; each mobile build at most twice. If a command fails, read its output and change approach.

5. Output and stop condition:
- Commit with this message, without push:
build(mobile): release signing from a keystore outside the repository
- Short English report: both APK paths and sizes, the keystore folder (no passwords), the signing certificate SHA-256 fingerprint from `keytool -list -v`. End the turn after the commit and report.

===

[DONE] Session 11 of 12 — Mobile phase B: iOS project synced with all plugins and Persian permission texts (build later on a Mac)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; p=pathlib.Path('warehouse-front/ios/App/App/Info.plist'); t=p.read_text(encoding='utf-8') if p.is_file() else ''; ok={'plist':p.is_file(),'camera':'NSCameraUsageDescription' in t,'photos':'NSPhotoLibraryAddUsageDescription' in t}; print(ok); sys.exit(0 if all(ok.values()) or not pathlib.Path('warehouse-front/ios').exists() else 1)"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "chore(mobile): iOS project synced"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Change only `warehouse-front/ios/` (and package files only if the sync requires it). Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context: plan heading `#### گام ب-۶`. Session 2 tried `npx cap add ios`; read its commit to see whether `ios/` exists.

3. Task:
- a) If `ios/` does not exist, run `npx cap add ios` once; if it fails on Windows, make an empty commit (`git commit --allow-empty`) with the message below and report the error (the iOS project is then created later on a Mac).
- b) If it exists: `npx cap sync ios` (CocoaPods or SPM errors on Windows are expected; report them), and add Persian `NSCameraUsageDescription` («برای اسکن بارکد و عکس کالا به دوربین نیاز است») and `NSPhotoLibraryAddUsageDescription` («برای ذخیرهٔ فایل‌های خروجی») to `ios/App/App/Info.plist`.

4. Tool policy: each `npx cap` command at most twice.

5. Output and stop condition:
- Commit with this message, without push:
chore(mobile): iOS project synced
- Short English report. End the turn after the commit and report.

===

[DONE] Session 12 of 12 — Release mobile phase B on the local app environment: backup, migrate the notifications table, patched web build, publish the staging APK; the runner restarts Daphne and the worker

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py restart-worker
verify: python scripts/automation/verify_tools.py release-check
verify: python -c "import json,sys,urllib.request; h={'User-Agent':'release-check'}; d=json.load(urllib.request.urlopen(urllib.request.Request('https://app.farsalish.ir/api/public/config/',headers=h),timeout=30)); u=d.get('app_download_urls',{}).get('direct',''); print('direct url:',u); r=urllib.request.urlopen(urllib.request.Request(u,method='HEAD',headers=h),timeout=60) if u else None; print('status:', r.status if r else None); sys.exit(0 if r is not None and r.status==200 else 1)"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session is a release only. Do not edit, create, stage or commit any tracked file.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`; do not kill any `node` process. The runner restarts Daphne and the worker after your turn.
- Only the local `app` environment on this Windows machine is in scope. Never connect to `soft.farsalish.ir`. Do not run `deploy.ps1`. Publish only the STAGING APK (app id `ir.comanage.soft.test`, talks to `app.farsalish.ir`); never publish the prod APK here.
- Do not run `run_auto_backup`, `flush`, any `manage.py test`, or any command that deletes files under `warehouse-backend/backups/`, `warehouse-backend/media/` or `warehouse-front/dist/`.

2. Context: phase B added one migration in `notifications` (device tokens), public mobile endpoints and commands (`publish_mobile_apk`), and frontend code. Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order:
- a) Backup (stop if it fails or the size is 0), in `warehouse-backend`:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app mobile phase B'); print(m['filename'], m['size'])"`
- b) `.\venv\Scripts\python.exe manage.py showmigrations --plan`: the only `[ ]` lines may be in `notifications`. If any other app has `[ ]`, stop and report. Then `.\venv\Scripts\python.exe manage.py migrate notifications`.
- c) Web build in `warehouse-front`: `npx ng build --delete-output-path=false`, then `node tools/patch-ngsw-530.js`.
- d) `.\venv\Scripts\python.exe manage.py publish_mobile_apk --apk "<path of the staging direct release APK from session 10>" --version 1.0.0 --channel direct --env staging`; then set the setting `app_download_url_direct` to the absolute URL `https://app.farsalish.ir` + the printed path, through `manage.py shell` with the project's settings service (validate with `validate_settings_payload` first, then save the same way the settings API does).

4. Tool policy: only the commands above, `git status --short`, and reading files. The web build at most twice. If a step fails, stop and report the exact error.

5. Output and stop condition: a short English report with the backup file and size, the migration applied, the build result and patch line, and the published APK URL. No commit. End the turn after the report.

===

[DONE] Session 13 of 15 — Mobile phase B review fixes: push registration guard in release builds, file output fallback, push token cleanup, download page states and accessibility

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/.gitignore warehouse-front/android/app/build.gradle warehouse-front/src/app/core/platform/* warehouse-front/src/app/core/auth/auth.service.ts warehouse-front/src/app/modules/common/components/app-download/* warehouse-front/src/app/modules/common/components/login/login.html
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/.gitignore --contains "google-services.json"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/android/app/build.gradle --contains "GradleException" --contains "versionCode 2" --contains "versionName \"1.0.1\""
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/modules/common/components/app-download/app-download.component.html --regex-absent "dark:" --regex-absent "linear-gradient" --regex-absent "\bpr-1\b" --regex-absent "text-fg-subtle" --contains "<bdi>"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/modules/common/components/login/login.html --contains "focus-visible:ring-2"
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file warehouse-front/src/app/core/platform/push.service.spec.ts warehouse-front/src/app/core/platform/file-output.spec.ts warehouse-front/src/app/modules/common/components/app-download/app-download.component.spec.ts
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/platform/push.service.spec.ts --min-tests 7 --require "remote logout"
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/platform/file-output.spec.ts --min-tests 13 --require "Directory.Data"
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/modules/common/components/app-download/app-download.component.spec.ts --min-tests 6
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: cd warehouse-front && npx ng build --configuration mobile-test
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python -c "import subprocess,sys; out=subprocess.run(['git','ls-files'],capture_output=True,text=True).stdout; bad=[l for l in out.splitlines() if l.endswith(('.jks','.keystore','keystore.properties','local.properties','google-services.json'))]; print('tracked secrets:',bad); sys.exit(1 if bad else 0)"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(mobile): review fixes for push, file output and download page"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7, 9 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Web behavior must stay identical except the download page and the login link styling. Push must never block login or logout.
- Never add, copy or stage `google-services.json`, keystores or `keystore.properties`. Do not run Gradle in this session.
- Do not push. Stage only your changed files. Never stage build outputs, `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`. Never remove or weaken an existing test.

2. Context:
- Bug seen on a phone: after the user grants notification permission the Android app crashes, because `PushNotifications.register()` (`core/platform/push.service.ts`) runs while the APK was built without `android/app/google-services.json`, so Firebase is not initialized (native crash, JavaScript cannot catch it). `android/app/build.gradle` applies the google-services plugin only when that file exists, and signs release builds only when the keystore properties file exists; otherwise it silently builds without them.
- `push.service.ts` is called from `core/auth/auth.service.ts` (constructor when logged in, successful login, `logout`). `deleteToken()` runs only in `logout`; `handleRemoteLogout` does not call it. `deleteToken()` resets its listeners flag before `removeAllListeners()` resolves.
- `core/platform/file-output.ts` native `saveBlob` writes to `Directory.Documents` and falls back to `Directory.Data`; a share cancel then returns as success even when the only copy is in app-private `Directory.Data`.
- Download page: `modules/common/components/app-download/` (html, ts, spec). The `dark` class is never set in this app, so `dark:` classes are dead code.

3. Task:
- a) `android/app/build.gradle`: when any requested Gradle task name contains `Release` (`gradle.startParameter.taskNames`), throw `GradleException` with a clear English message if `google-services.json` is missing in the app folder or the keystore properties file is missing. Debug builds keep working without them. Set `versionCode 2` and `versionName "1.0.1"`.
- b) `warehouse-front/.gitignore`: add `google-services.json`.
- c) `file-output.ts`: when the file was written to `Directory.Data` (fallback) and the share is cancelled, treat it as a failure: notify once with the existing message and reject. Cancel after a successful `Directory.Documents` write stays a success.
- d) `push.service.ts` and `auth.service.ts`: call the push token deletion in `handleRemoteLogout` before the session is cleared (wrapped, failure ignored, never blocking). In `deleteToken()` reset the listeners flag only after `removeAllListeners()` has resolved (or failed).
- e) Download page html/ts:
  - Show «در حال بارگذاری…» on the button while the config loads.
  - When the request fails, show a short Persian error line and a retry button.
  - When the URL is empty, keep the disabled «به‌زودی» button and add the hint «لینک دانلود هنوز منتشر نشده است».
  - Replace `text-fg-subtle` with `text-fg-muted`.
  - Remove every `dark:` class.
  - Replace the inline gradient style with `bg-gradient-to-br from-indigo-600 to-violet-600`.
  - Replace `pr-1` with `ps-1`.
  - Wrap the Latin words (Safari, Share, Add to Home Screen, Add, Settings) in `<bdi>`.
  - Add `dir="ltr"` to the version badge.
- f) `login.html`: add `focus-visible:ring-2 focus-visible:ring-indigo-500` to the «دریافت اپ موبایل» link.
- g) Tests:
  - `push.service.spec.ts`, at least 7 tests in total: one whose name contains `remote logout` (the token is deleted), and one for the listeners flag after `removeAllListeners`.
  - `file-output.spec.ts`, at least 13 tests in total: a share cancel after the `Directory.Data` fallback notifies and rejects.
  - `app-download.component.spec.ts`, at least 6 tests in total: loading text, and error line with retry.

4. Tool policy: in `warehouse-front`, each build at most twice; at most three runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/core/**/*.spec.ts" --include "src/app/modules/common/components/app-download/*.spec.ts"`. If a command fails, read its output and change approach.

5. Output and stop condition:
- Commit with this message, without push:
fix(mobile): review fixes for push, file output and download page
- Short English report per file, tests added, the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 14 of 15 — Mobile phase B backend review fixes: push never breaks notification creation, bounded push threads, device token input validation

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-backend/core/notifications/push.py warehouse-backend/core/notifications/views.py warehouse-backend/core/notifications/serializers.py warehouse-backend/core/notifications/tests.py
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/core/notifications/push.py --contains "ThreadPoolExecutor" --contains "close_old_connections"
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py django-tests --labels notifications communications accounts integration_tests --known scripts/automation/known_backend_failures.txt --min-tests 100
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(notifications): safer push sending and device token validation"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- No new migration and no model change. Never log credentials or full tokens. Run `manage.py test` only with labels. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context: `core/notifications/push.py` (FCM provider, `post_save` receiver on `Notification`, `transaction.on_commit`, one daemon thread per notification, token lookup at save time); `core/notifications/views.py` `DeviceTokenView` (POST register/refresh, DELETE by token). A real Firebase credentials file is now configured on this machine, so tests must mock every network call.

3. Task:
- a) The `post_save` receiver must never raise: move the recipient token lookup inside the `on_commit` callback, and wrap the whole callback body in try/except with `logger.exception` (no token values in the message).
- b) Replace the per-notification thread with one module-level `ThreadPoolExecutor(max_workers=2)`; cache the loaded credentials object in the provider and refresh only when expired; the worker calls `django.db.close_old_connections()` before and after its work.
- c) `views.py` POST: validate with a serializer: `token` a non-empty string of at most 512 characters, `platform` one of `android`/`ios`, `app_version` optional string of at most 50 characters; invalid input or a non-object body returns 400 with a Persian message. DELETE returns 404 both for a missing token and for another user's token.
- d) Tests in `core/notifications/tests.py` (keep all existing tests): a receiver failure (mock the token query to raise) does not break `Notification.objects.create`; tokens are read at commit time; POST with a 600-character token returns 400; POST with a JSON array returns 400; DELETE of another user's token returns 404 and keeps the token.

4. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test notifications --noinput`. If a command fails, read its output and change approach.

5. Output and stop condition:
- Commit with this message, without push:
fix(notifications): safer push sending and device token validation
- Short English report: changes and test pass count. End the turn after the commit and report.

===

[DONE] Session 15 of 15 — Release on the local app environment: staging APK 1.0.1 with Firebase, patched web build; the runner restarts Daphne and the worker

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: python -c "import subprocess,sys,pathlib; p=pathlib.Path('warehouse-front/android/app/google-services.json'); tracked=subprocess.run(['git','ls-files','--error-unmatch',str(p)],capture_output=True).returncode==0; print('exists',p.is_file(),'tracked',tracked); sys.exit(0 if p.is_file() and not tracked else 1)"
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py restart-worker
verify: python scripts/automation/verify_tools.py release-check
verify: python -c "import json,sys,urllib.request; h={'User-Agent':'release-check'}; d=json.load(urllib.request.urlopen(urllib.request.Request('https://app.farsalish.ir/api/public/config/',headers=h),timeout=30)); u=d.get('app_download_urls',{}).get('direct',''); print('direct url:',u); r=urllib.request.urlopen(urllib.request.Request(u,method='HEAD',headers=h),timeout=60) if u else None; print('status:', r.status if r else None); sys.exit(0 if r is not None and r.status==200 and '1.0.1' in u else 1)"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Release only. Do not edit, create, stage or commit any tracked file. Never print the content of any file in `E:\warehouse-secrets\`.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`; do not kill any `node` process. The runner restarts Daphne and the worker after your turn.
- Only the local `app` environment. Never connect to `soft.farsalish.ir`. Do not run `deploy.ps1`. Publish only the STAGING APK (`ir.comanage.soft.test`).
- Do not run `run_auto_backup`, `flush`, any `manage.py test`, or any command that deletes files under `warehouse-backend/backups/`, `warehouse-backend/media/` or `warehouse-front/dist/`.

2. Context: sessions 13 and 14 changed frontend, `android/app/build.gradle` (versionCode 2, versionName 1.0.1; release builds now require `android/app/google-services.json` and the keystore) and backend push code. No new migration. Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order:
- a) Backup (stop if it fails or the size is 0), in `warehouse-backend`:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app mobile 1.0.1'); print(m['filename'], m['size'])"`
- b) `.\venv\Scripts\python.exe manage.py showmigrations --plan`: if any line has `[ ]`, stop and report.
- c) Copy `E:\warehouse-secrets\comanage\google-services.json` to `warehouse-front\android\app\google-services.json` (it is git-ignored; confirm with `git status --short` that it does not appear).
- d) In `warehouse-front`: `npm run build:mobile-test`, then in `warehouse-front\android` `.\gradlew.bat assembleStagingDirectRelease`.
- e) Web build in `warehouse-front`: `npx ng build --delete-output-path=false`, then `node tools/patch-ngsw-530.js`.
- f) In `warehouse-backend`: `.\venv\Scripts\python.exe manage.py publish_mobile_apk --apk "<path of the new staging direct release APK>" --version 1.0.1 --channel direct --env staging`; then set the setting `app_download_url_direct` to `https://app.farsalish.ir` + the printed path, the same way as the previous release (validate with `validate_settings_payload`, then save as the settings API does).

4. Tool policy: only the commands above, `git status --short`, `Copy-Item`, and reading files outside `E:\warehouse-secrets\`. Gradle at most twice, each build at most twice. If a step fails, stop and report the exact error.

5. Output and stop condition: a short English report with the backup file and size, the APK path and size, the build result and patch line, and the published APK URL. No commit. End the turn after the report.
