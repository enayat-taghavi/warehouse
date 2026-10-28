
===

[ ] Session 1 of 1 — Release v1 step 5-b: version sync tool test, what's new dialog and Live Update ready bar specs

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/shared/components/whats-new/whats-new-5b.dom.spec.ts" --allow "frontend/src/app/core/platform/live-update-ready-5b.spec.ts" --allow "frontend/tools/sync-app-version.test.js"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/shared/components/whats-new/whats-new-5b.dom.spec.ts --min-tests 5 --require "app.lastSeenVersion" --require "whats-new-dialog" --require "RELEASE_NOTES"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/core/platform/live-update-ready-5b.spec.ts --min-tests 6 --require "liveUpdateReady" --require "applyLiveUpdateNow" --require "live-update-apply" --require "isSyncing"
verify: python scripts/automation/verify_tools.py text-check --file frontend/tools/sync-app-version.test.js --contains "node:test" --contains "10203" --contains "syncAppVersion" --contains "versionCode" --absent "skip"
verify: node --test frontend/tools/sync-app-version.test.js
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/shared/components/whats-new/whats-new-5b.dom.spec.ts" --include "src/app/core/platform/live-update-ready-5b.spec.ts" --include "src/app/shared/components/update-bar/update-bar.dom.spec.ts" --include "src/app/core/platform/live-update.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 5-b): version sync, what's new and Live Update ready specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7 and 10 apply.
- Create exactly three new files: `frontend/src/app/shared/components/whats-new/whats-new-5b.dom.spec.ts`, `frontend/src/app/core/platform/live-update-ready-5b.spec.ts` and `frontend/tools/sync-app-version.test.js`. Change no other file (never touch `scripts/automation/*`, never change `package.json`, `app-version.ts` or `version.properties`). Never change production code. If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. If `git status` shows files you did not create, leave them alone and do not commit them.
- No `skip`, no `only`, no `it.skip`, no `xit(`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in commits `6d3ca86e` and `6b2be8b7`; read only these):
- `frontend/tools/sync-app-version.js` (whole file): exports `parseStrictVersion`, `versionCodeOf`, `syncAppVersion(root)` returning `{ version, versionCode, changed }`; CLI `node tools/sync-app-version.js --root <dir>` exits 1 on a bad version.
- `frontend/src/app/core/platform/release-notes.ts` (whole file): `RELEASE_NOTES`, `LAST_SEEN_VERSION_KEY` (`app.lastSeenVersion`), `formatVersionFa`, `releaseNotesToShow(lastSeen, current)`.
- `frontend/src/app/shared/components/whats-new/whats-new.component.ts` (whole file): the dialog; data-testids `whats-new-dialog`, `whats-new-close`, `whats-new-close-x`.
- `frontend/src/app/core/platform/live-update.ts` (whole file): `liveUpdateReady` signal, `activeLiveBundleVersion`, `applyLiveUpdateNow()` returning `'applied' | 'syncing' | 'none' | 'failed'`, `checkForLiveUpdate({ force: true })`, the mutable `liveUpdateBridge` object (replace its methods with `vi.spyOn(liveUpdateBridge, 'next')` etc.), `stopLiveUpdate()`.
- `frontend/src/app/core/platform/live-update.spec.ts` (whole file): a working setup for `isNativePlatform`, `OfflineSyncService.getInstance()` and the bridge mocks. COPY its setup style; do not import from it.
- `frontend/src/app/shared/components/update-bar/update-bar.component.ts` (whole file) and `update-bar.dom.spec.ts` lines 1-50 (TestBed setup with a fake `PwaUpdateService`). The Live Update branch has data-testids `live-update-bar`, `live-update-apply`, `live-update-later`, `live-update-syncing`, `live-update-pending`; it reads `OfflineSyncService.getInstance().isSyncing$` and `pendingCount$` (BehaviorSubjects `_isSyncing$` and `_pendingCount$`; push values with `(OfflineSyncService.getInstance() as any)._isSyncing$.next(true)` and reset them in `afterEach`).

3. Definitions: never retype Persian UI text; select elements by data-testid. A "fresh install" is an empty `localStorage`. Clear `localStorage` and set `liveUpdateReady.set(null)` in `beforeEach` and `afterEach`. When a test needs notes for a version, add them with `RELEASE_NOTES['9.9.9'] = ['x']` only if you also mock `APP_VERSION`; otherwise use the existing `RELEASE_NOTES[APP_VERSION]` entry (import `APP_VERSION` from `app-version.ts`).

4. Task A — `whats-new-5b.dom.spec.ts` (Vitest + jsdom, header `// @vitest-environment jsdom`), describe `WhatsNewComponent (Release v1 step 5-b)`, one `it` each:
- a) fresh install: no `app.lastSeenVersion` → after `detectChanges` no `[data-testid="whats-new-dialog"]`, and `localStorage.getItem('app.lastSeenVersion')` equals `APP_VERSION`.
- b) upgrade: `app.lastSeenVersion` = `0.9.0` → the dialog is shown and lists `RELEASE_NOTES[APP_VERSION].length` `li` items; the key is still `0.9.0` while the dialog is open.
- c) close: in the state of (b) click `[data-testid="whats-new-close"]` → dialog gone and the key equals `APP_VERSION`; a new component instance (new fixture) shows no dialog.
- d) Escape: in the state of (b) dispatch `new KeyboardEvent('keydown', { key: 'Escape' })` on `document` → dialog gone and the key equals `APP_VERSION`.
- e) same version: key = `APP_VERSION` → no dialog.
- f) pure function: `releaseNotesToShow('0.9.0', '7.7.7')` is `null` (no notes for that version); `releaseNotesToShow(null, APP_VERSION)` is `null`; `releaseNotesToShow('bad', APP_VERSION)` is `null`; `formatVersionFa('1.0.0')` has no ASCII digit.

5. Task B — `live-update-ready-5b.spec.ts`, describe `Live Update ready bar (Release v1 step 5-b)`:
- a) `checkForLiveUpdate({ force: true })` on native with a manifest of a higher version and `download` resolving `{ id: 'b1', version: '9.0.0' }` → `next` called with `{ id: 'b1' }` and `liveUpdateReady()` equals `{ id: 'b1', version: '9.0.0' }`; `set` was NOT called.
- b) when `download` rejects, `liveUpdateReady()` stays `null`.
- c) `applyLiveUpdateNow()` with `liveUpdateReady` null → `'none'` and `set` not called.
- d) with `liveUpdateReady.set({ id: 'b1', version: '9.0.0' })` and `isSyncing` true → `'syncing'` and `set` not called.
- e) same but not syncing → `'applied'` and `set` called once with `{ id: 'b1' }`.
- f) `UpdateBarComponent` DOM (fake `PwaUpdateService` with `updateReady` false): with `liveUpdateReady` set, `[data-testid="live-update-bar"]` is shown; with `_isSyncing$` true the `[data-testid="live-update-apply"]` button is disabled and `[data-testid="live-update-syncing"]` is shown; with `_isSyncing$` false and `_pendingCount$` 2 the button is enabled and `[data-testid="live-update-pending"]` is shown; clicking it calls the `set` spy; clicking `[data-testid="live-update-later"]` hides the bar.
- g) no storage clear: spy on `localStorage.clear` and `indexedDB.deleteDatabase` (define a stub `indexedDB` on `globalThis` if jsdom has none) → after case (e) neither was called.

6. Task C — `frontend/tools/sync-app-version.test.js` (plain Node, `const test = require('node:test'); const assert = require('node:assert');`, CommonJS, require `./sync-app-version`):
- a) `versionCodeOf('1.2.3') === 10203` and `versionCodeOf('1.0.0') === 10000`.
- b) `parseStrictVersion` returns null for `'1.0'`, `'1.0.0-beta'`, `'v1.0.0'`, `'1.100.0'`.
- c) in a temp dir from `fs.mkdtempSync(path.join(os.tmpdir(), 'appver-'))` with a `package.json` `{"version":"1.2.3"}`: `syncAppVersion(dir)` writes `src/app/core/platform/app-version.ts` containing `APP_VERSION = '1.2.3'` and `AppChannel`, and `android/app/version.properties` containing `versionCode=10203` and `versionName=1.2.3`; `changed.length === 2`; a second call returns `changed.length === 0`; after rewriting the ts file with CRLF line endings, a third call returns `changed.length === 0`.
- d) bad version: temp dir with `{"version":"1.0"}` → `syncAppVersion` throws; and `child_process.spawnSync(process.execPath, [script, '--root', dir])` returns `status === 1`.
- Remove temp dirs with `fs.rmSync(dir, { recursive: true, force: true })` in `test.after` (only the temp dirs you created).

7. Tool policy: only reading the listed files, Grep in `frontend/src/app/core/` and `frontend/src/app/shared/`, writing the three files, the test commands below, `git add` of those three files, `git commit`, `git status --short`. Test commands, in the repository root: `node --test frontend/tools/sync-app-version.test.js` and `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --no-skip --max-failed 0 --include "src/app/shared/components/whats-new/whats-new-5b.dom.spec.ts" --include "src/app/core/platform/live-update-ready-5b.spec.ts"`; per-test log `scratch/logs/runner/ngtest-head.log`. If a test fails, read the error, fix the test (not production code), rerun at most 5 times.

8. Before finishing: all cases pass; commit only the three files with the message `test(release-v1 5-b): version sync, what's new and Live Update ready specs`; `git status --short` shows no change of yours.

9. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.
