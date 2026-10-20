[DONE] Session 16 of 22 — Phase 4 step 4: characterization spec for offline scope routing and both queues (tests only, no production change)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/core/services/offline/offline-scope.characterization.spec.ts warehouse-front/src/app/shared/components/user-menu/user-menu.component.spec.ts
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file warehouse-front/src/app/shared/components/user-menu/user-menu.component.spec.ts
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/services/offline/offline-scope.characterization.spec.ts --min-tests 14 --require normalizeScope --require getScopedDbName --require resolveScopeFromUrl --require getCurrentActiveAppScope --require setInstalledModules --require runQueueSequential --require getPendingCount --require getUnsentCountStrict --require getQueueEntries --require purgeEphemeralQueueEntries --require buildScopedHeaders --require refreshAccessToken --require dismissError --require deleteError --require SessionTabService --require doc-tasks
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/shared/components/user-menu/user-menu.component.spec.ts --contains /app/treasury --contains /app/tag-templates
verify: python scripts/automation/verify_tools.py ng-test-compare --base 64b2c17 --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(offline): characterize scope routing and both queues"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session writes tests only. Do not change any production `.ts` file. Change only the 2 files in the scope verify line: create the new spec, and append tests to `user-menu.component.spec.ts` without changing or deleting any existing test there.
- The tests must lock what the code does today. When a test fails, fix the test expectation to match today's behaviour, never the production code.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.
- Do not install packages. There is no `fake-indexeddb`: mock Dexie tables with `vi.spyOn` the way `warehouse-front/src/app/core/services/offline/offline-queue-runner.spec.ts` does.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `#### ۴.۱` under `### گام ۴`. Read the invariants (lines starting with `ن۱` to `ن۱۲`) and the paragraph for session 16.
- Code under test: `warehouse-front/src/app/core/services/offline-db.ts` (`normalizeScope`, `getScopedDbName`, `resolveScopeFromUrl`, `getCurrentActiveAppScope`, `getOfflineDb`, `warehouseOfflineDb`, `financeOfflineDb`); `warehouse-front/src/app/core/services/offline/offline-queue-runner.ts` (`runQueueSequential`, `getPendingCount`, `getUnsentCountStrict`, `getQueueEntries`, `buildScopedHeaders`, `refreshAccessToken`); `offline-local-patcher.ts` (`purgeEphemeralQueueEntries`); `offline-conflict-manager.ts` (`dismissError`, `deleteError`); `warehouse-front/src/app/core/services/session-tab.service.ts` (`getScopedAccessToken`, `setScopedAccessToken`); `warehouse-front/src/app/shared/components/user-menu/user-menu.component.ts` (getter `currentScopeContext`).
- The server-installed module list is set with `getModuleRegistry().setInstalledModules(codes)` and read with `getInstalledCodes()` in `warehouse-front/src/app/core/modules/module-registry.service.ts`.

3. Definitions:
- "Both DBs" means the two instances `warehouseOfflineDb` (IndexedDB name `WarehouseOfflineDB_warehouse`) and `financeOfflineDb` (`WarehouseOfflineDB_finance`).
- "Installed subsets" means three runs of the same table: `setInstalledModules(['warehouse', 'accounting'])`, `setInstalledModules(['warehouse'])` and `setInstalledModules(['accounting'])`. Save `getInstalledCodes()` in `beforeEach` and restore it in `afterEach`.

4. Task: create `warehouse-front/src/app/core/services/offline/offline-scope.characterization.spec.ts` (first line `// @vitest-environment jsdom`, like the other specs) with at least 14 plain `it(` blocks covering:
- a) `normalizeScope` and `getScopedDbName` for `undefined`, `null`, `''`, `'warehouse'`, `'WAREHOUSE'`, `'finance'`, `'personnel'`, `'accounting'`, `'operations'`, `'xyz'`.
- b) `resolveScopeFromUrl` for at least 20 URLs, each run under the three installed subsets with identical expected values: one URL for each of the 8 finance patterns in the function, plus URLs containing `/doc-tasks/`, `/inventory/`, `/warehouses/`, `/chat/`, `/notifications/`, `/auth/refresh/`, an absolute `https://` URL, an uppercase URL, and `null` (which returns the current scope).
- c) `getCurrentActiveAppScope`: sessionStorage `active_app_module` = `personnel`, `warehouse`, `operations`; sessionStorage `wh_active_app` = `finance`; no session key with `window.history.pushState` to `/app/finance/x`, `/app/warehouse/x`, `/app/operations/users`, `/`; localStorage `active_app_module` = `accounting` on path `/`. Clear both storages between tests.
- d) `getOfflineDb(scope)` returns exactly (`toBe`) `warehouseOfflineDb` or `financeOfflineDb` for every value in a), and `.name` of both DBs equals the two locked names.
- e) `runQueueSequential` with a mocked online `NetworkStatusService` (`isBrowserOnline: true`, `reportServerUnreachable` spy) and a global `fetch` mock returning status 201: entries in both DBs (pending, different `createdAt`, interleaved) are sent in ascending `createdAt` order across both DBs, and each `syncQueue.delete` is called on the DB that holds the entry with that entry's id. Mock `syncQueue.where` to return an object whose `anyOf` returns `{ sortBy, toArray, count }` for the test data. Use ids that exist in both DBs (for example id 1 in each) to prove the DB handle, not the id, decides the target.
- f) `getPendingCount()` and `getUnsentCountStrict()` return the sum of both DBs; `getQueueEntries('all')` returns entries of both DBs sorted by `createdAt`.
- g) `purgeEphemeralQueueEntries` deletes only matching ephemeral URLs, from both DBs, and leaves every other entry.
- h) `buildScopedHeaders('warehouse')` and `buildScopedHeaders('finance')`: values of `X-Active-App` and `X-Active-Role`, and which token key is read, under the three installed subsets. `refreshAccessToken` with a `fetch` mock returning `{ access: 'NEW' }`: the scoped key written is `wh_access_token_finance` when sessionStorage `active_app_module` is `personnel`, and `wh_access_token_warehouse` when it is `warehouse`.
- i) `dismissError(7)` and `deleteError(7)` when id 7 exists in both DBs' `syncErrors`: record which DB is written today (the code updates or deletes only the first DB where `get` finds it).
- j) `SessionTabService`: `setScopedAccessToken('T', 'personnel')` writes `wh_access_token_finance`; with `'warehouse'` it writes `wh_access_token_warehouse`; `getScopedAccessToken('personnel')` reads the finance key first.
- k) In `user-menu.component.spec.ts`, append one `describe` block that reuses the existing setup and checks `currentScopeContext` for router URLs `/app/finance/x`, `/app/personnel/x`, `/app/payroll/x`, `/app/treasury/x`, `/app/projects/x`, `/app/warehouse/x`, `/app/inventory/x`, `/app/counting/x`, `/app/items/x`, `/app/tag-templates/x`, `/app/operations/x`.

5. Tool policy: from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base 64b2c17 --include "src/app/core/services/**/*.spec.ts" --include "src/app/shared/components/user-menu/*.spec.ts"`. Reading files is unrestricted. If a command fails, read its output and change approach; do not repeat the same call unchanged.

6. Before finishing: the ng-test-compare run above reports no new failing test and no new type error, and `git diff --stat` shows only the 2 files.

7. Output and stop condition:
- Commit with this message, without push:
test(offline): characterize scope routing and both queues
- Short English report: the number of tests in each file, any behaviour you found surprising (state it as a fact, do not fix it), and the ng-test-compare summary line. End the turn after the commit and the report.

===

[DONE] Session 17 of 22 — Phase 4 step 4: fix two pre-existing data-loss paths (legacy DB migration, sync monitor writes to both DBs)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/core/services/offline-db.ts warehouse-front/src/app/core/services/offline-db.legacy-migration.spec.ts warehouse-front/src/app/modules/common/components/operations/operations-sync-monitor/operations-sync-monitor.ts warehouse-front/src/app/modules/common/components/operations/operations-sync-monitor/operations-sync-monitor.error-source.spec.ts
verify: python scripts/automation/verify_tools.py diff-free --base {base} --path warehouse-front/src/app/core/services/offline-db.ts --pattern "this\.version\(|\.stores\(|\+\+id|WarehouseOfflineDB_warehouse|WarehouseOfflineDB_finance|export function resolveScopeFromUrl|export function normalizeScope"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/services/offline-db.ts --absent "where('url')" --absent "docTasks.bulkPut(legacyDocs)" --contains wh_legacy_offline_db_migrated_v1 --contains migratedAt
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/modules/common/components/operations/operations-sync-monitor/operations-sync-monitor.ts --absent "await financeOfflineDb.syncErrors.update(errorId" --absent "await financeOfflineDb.syncErrors.delete(errorId"
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/services/offline-db.legacy-migration.spec.ts --min-tests 6 --require migratedAt --require docTasks
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/modules/common/components/operations/operations-sync-monitor/operations-sync-monitor.error-source.spec.ts --min-tests 3
verify: python scripts/e2e/guardian_34_offline_continuity.py
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base 64b2c17 --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(offline): idempotent legacy migration and single-DB error writes in sync monitor"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Change only the 4 files in the scope verify line. Do not edit any existing spec, including `offline-scope.characterization.spec.ts` from session 16.
- In `offline-db.ts`, change only `migrateLegacyDatabaseIfNeeded` and add helpers next to it. Do not change any `version()`/`stores()` line, any DB name, `normalizeScope`, `resolveScopeFromUrl`, `getCurrentActiveAppScope`, `getOfflineDb` or the `offlineDb` Proxy.
- Never delete, clear or close-and-delete the legacy IndexedDB `WarehouseOfflineDB`, and never delete any row from it. Never call `bulkPut`, `put` or `clear` on any table of `warehouseOfflineDb` or `financeOfflineDb` in this session.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `#### ۴.۱`, the invariants `ن۸` and `ن۹` and the paragraph for session 17.
- `migrateLegacyDatabaseIfNeeded` in `warehouse-front/src/app/core/services/offline-db.ts` runs on every app start (called from `initialize()` in `offline-sync.service.ts`). Its defects today:
  - `targetDb.syncQueue.where('url')` throws a Dexie `SchemaError`, because `url` is not an index in any `syncQueue` schema. The outer `catch` swallows it, so no legacy queue row is ever migrated.
  - `warehouseOfflineDb.docTasks.bulkPut(legacyDocs)` runs on every start and overwrites newer local `docTasks` rows (including rows with `_offlinePending`) with the old legacy copies.
  - `add({ ...item, appScope: scope })` keeps the legacy `id`, which collides with existing auto-increment ids in the target DB.
- `warehouse-front/src/app/modules/common/components/operations/operations-sync-monitor/operations-sync-monitor.ts`: errors are loaded from both DBs (around line 185) and merged. The "discard" strategy updates and the "server" strategy deletes `syncErrors` rows with the same `errorId` in both DBs (around lines 298 and 319). Ids are per DB, so this also dismisses or deletes an unrelated error row of the other DB, which holds the only copy of a rejected request body.

3. Definitions:
- "Source DB" of an error is the DB instance the row was read from.
- "Migrated legacy row" is a row of the legacy `syncQueue` whose `migratedAt` field is set.

4. Task:
- a) Split the migration so it is testable: an exported function `migrateLegacyData(legacy, targets)` that takes a legacy object with `tables: { name: string }[]` and `table(name)` (returning an object with `toArray()` and `update(key, changes)`), and the target DBs. `migrateLegacyDatabaseIfNeeded` keeps its current guard (`Dexie.getDatabaseNames()`, `new Dexie('WarehouseOfflineDB')`, `open()`) and calls it.
- b) Run-once marker: when localStorage key `wh_legacy_offline_db_migrated_v1` is set, return immediately. Set it only after the whole migration finished without an error.
- c) `docTasks`: add only rows whose primary key `sync_id` is not already present in `warehouseOfflineDb.docTasks` (check with `get` or `bulkGet`, then `bulkAdd` the missing rows). Never overwrite an existing row.
- d) Queue: skip legacy rows that already have `migratedAt`. For each other row, the target scope is `resolveScopeFromUrl(item.url)` as today. Detect an existing copy with `targetDb.syncQueue.filter(e => e.url === item.url && e.method === item.method && e.createdAt === item.createdAt).first()`. If no copy exists, `add` the row without its `id` field and with `appScope` set. In both cases, then call `update(item.id, { migratedAt: Date.now() })` on the legacy table. A failure on one row is logged and does not stop the other rows; any failure means the marker of b) is not set.
- e) Sync monitor: when errors are loaded, remember the source DB of each error (for example a `Map` from the error object or a `{ error, db }` pair). Every `syncErrors.update` or `syncErrors.delete` in that component for one selected error uses only its source DB. The bulk action around line 425 that runs per DB keeps working per DB. Do not change the template.
- f) Spec `offline-db.legacy-migration.spec.ts` (at least 6 `it(`): marker set means nothing is read; existing `docTasks` row is not overwritten and a missing one is added; a legacy queue row is added once without its legacy `id` and gets `migratedAt`; a row with `migratedAt` is skipped; a second run with an existing copy adds nothing; a failing row leaves the marker unset. Use plain objects and `vi.spyOn` on the target tables.
- g) Spec `operations-sync-monitor.error-source.spec.ts` (at least 3 `it(`): with id 5 in both DBs, discarding the warehouse error updates only `warehouseOfflineDb.syncErrors`; the server strategy without `server_record` deletes only in the source DB; same for a finance error.

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base 64b2c17 --include "src/app/core/services/**/*.spec.ts" --include "src/app/modules/common/components/operations/**/*.spec.ts"`. If a command fails, read its output and change approach.

6. Before finishing: the ng-test-compare run above reports no new failing test, `offline-scope.characterization.spec.ts` passes unchanged, and `git diff --stat` shows only the 4 files.

7. Output and stop condition:
- Commit with this message, without push:
fix(offline): idempotent legacy migration and single-DB error writes in sync monitor
- Short English report: what changed per defect, the tests added, the ng-test-compare summary line, and remaining uncertainty. End the turn after the commit and the report.

===

[DONE] Session 18 of 22 — Phase 4 step 4: offlineSync module extension and registry-driven scope resolution with the two locked DBs

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/core/modules/module-contract.ts warehouse-front/src/app/modules/warehouse/module.ts warehouse-front/src/app/modules/accounting/module.ts warehouse-front/src/app/core/services/offline-db.ts warehouse-front/src/app/core/services/offline/offline-scope.registry.spec.ts
verify: python scripts/automation/verify_tools.py diff-free --base {base} --path warehouse-front/src/app/core/services/offline-db.ts --pattern "this\.version\(|\.stores\(|\+\+id|warehouse: 'WarehouseOfflineDB_warehouse'|finance: 'WarehouseOfflineDB_finance'|accounting: 'WarehouseOfflineDB_finance'|personnel: 'WarehouseOfflineDB_finance'"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/services/offline-db.ts --contains "export type AppScope = 'warehouse' | 'finance' | (string & {});" --contains "export function getAllOfflineDbs" --contains "export function resolveOfflineDbStrict" --contains "function resolveLegacyScopeFromUrl" --contains "getAllModules()" --absent "getInstalledModules" --absent "getExtensions("
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/modules/module-contract.ts --contains "offlineSync?:" --contains queueUrlPatterns --contains activePathPatterns --contains appRoutePrefixes --contains scopeAliases
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/modules/accounting/module.ts --contains "offlineSync:" --contains "'WarehouseOfflineDB_finance'" --contains "'/treasury'" --contains "'/attendance'" --contains "'/paya'" --contains "'/slips'" --contains "'/fiscal'" --contains "'/app/projects'"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/modules/warehouse/module.ts --contains "offlineSync:" --contains "'WarehouseOfflineDB_warehouse'" --contains "'/app/tag-templates'"
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/services/offline/offline-scope.registry.spec.ts --min-tests 8 --require registerModule --require resolveOfflineDbStrict --require getAllOfflineDbs --require WarehouseOfflineDB_
verify: python scripts/e2e/guardian_34_offline_continuity.py
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base 64b2c17 --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(offline): offlineSync extension and registry-driven scope resolution"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Change only the 5 files in the scope verify line. Do not edit any existing spec. `offline-scope.characterization.spec.ts` must pass unchanged: it is the definition of correct behaviour.
- Never change an IndexedDB name, the `SCOPED_DB_NAMES` lines, or any `version()`/`stores()` line. Never construct a second `OfflineDatabase` for a name that already has an instance.
- Do not change `migrateLegacyDatabaseIfNeeded`/`migrateLegacyData` except replacing its call of `resolveScopeFromUrl` with `resolveLegacyScopeFromUrl`.
- Do not touch the `offlineDb` Proxy, `offline-queue-runner.ts` or any other consumer; those are sessions 19 to 21.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `#### ۴.۱`: the failed-attempt paragraph, invariants `ن۱` to `ن۱۲`, the `offlineSync` contract table, and the paragraph for session 18.
- `scratch/offline-db-modular-attempt-2026-10-19.patch` is a failed earlier attempt. Read it as a list of mistakes to avoid; do not apply it.
- Existing pattern: the `syncConfig` extension in `module-contract.ts` and its values in `modules/warehouse/module.ts` and `modules/accounting/module.ts`.
- `ModuleRegistryService.getAllModules()` returns every module compiled into the build. `getInstalledModules()` and `getExtensions()` filter by the server-provided list, which can change at runtime; they must not be used for offline scope resolution.

3. Definitions:
- "Locked scope": `warehouse`, `finance`, and the aliases `personnel`, `accounting` (both map to `finance`), as in `SCOPED_DB_NAMES`. They always resolve to `warehouseOfflineDb`/`financeOfflineDb`, whatever modules are installed or compiled.
- "Registered scope": a lowercase `scopeKind` matching `^[a-z][a-z0-9_]*$` from a valid `offlineSync` extension of a module in `getAllModules()`.
- "Valid extension": `dbName` equals `SCOPED_DB_NAMES[scopeKind]` for a locked scope, or `` `WarehouseOfflineDB_${scopeKind}` `` otherwise; a non-locked `scopeKind` must not be an alias of a locked scope and its `dbName` must not be a locked name. An invalid extension is ignored and reported once with `console.error`. Validation reads only `SCOPED_DB_NAMES` and the scopeKind string, never the registry.
- "Default scope": `warehouse`. Matching order: registered non-default scopes in `getAllModules()` order, then the default.

4. Task:
- a) `module-contract.ts`: add `offlineSync?: { scopeKind: string; dbName: string; scopeAliases?: string[]; queueUrlPatterns: string[]; activePathPatterns: string[]; appRoutePrefixes: string[] }` with a Persian doc comment like the other extension points.
- b) `modules/accounting/module.ts`: `offlineSync` with `scopeKind: 'finance'`, `dbName: 'WarehouseOfflineDB_finance'`, `scopeAliases: ['personnel', 'accounting']`, `queueUrlPatterns`: the 8 patterns of today's `resolveScopeFromUrl` in the same order, `activePathPatterns`: the 4 finance paths of today's `getCurrentActiveAppScope`, `appRoutePrefixes`: the 5 finance prefixes of `currentScopeContext` in `user-menu.component.ts`.
- c) `modules/warehouse/module.ts`: `offlineSync` with `scopeKind: 'warehouse'`, `dbName: 'WarehouseOfflineDB_warehouse'`, `queueUrlPatterns: []`, `activePathPatterns`: the 2 warehouse paths, `appRoutePrefixes`: the 5 warehouse prefixes of `currentScopeContext`.
- d) `offline-db.ts`:
  - `AppScope` becomes `'warehouse' | 'finance' | (string & {})`.
  - Private helper `getOfflineSyncSpecs()`: reads `getModuleRegistry().getAllModules()` lazily inside a `try/catch`, keeps valid extensions only, and returns `[]` on any error. Never call it at module evaluation time; `warehouseOfflineDb` and `financeOfflineDb` must still be created without reading the registry.
  - `normalizeScope(scope)`: empty means `warehouse`; lowercase it; locked scopes and aliases first (same result as today); then registered scopes and their `scopeAliases`; anything else returns `warehouse`.
  - `getScopedDbName(scope)`: `SCOPED_DB_NAMES` for locked scopes, `` `WarehouseOfflineDB_${scope}` `` for registered scopes, otherwise the warehouse name.
  - `resolveScopeFromUrl(url)`: no url means `getCurrentActiveAppScope()` as today; otherwise the first registered non-default scope with a `queueUrlPatterns` entry contained in the lowercased url, else `warehouse`. Keep the function name and the `export function resolveScopeFromUrl` declaration, and do not mention `doc-tasks` in its body (guardian 34 reads it).
  - `resolveLegacyScopeFromUrl(url)`: not exported or exported, your choice; an exact copy of today's `resolveScopeFromUrl` body with the 8 hard-coded patterns, used only by the legacy migration.
  - `getCurrentActiveAppScope()`: same order as today (session keys, then path, then localStorage); the path step uses `activePathPatterns` in matching order; on any registry error it falls through to the localStorage step.
  - `getOfflineDb(scope)`: same signature and results as today for every locked or unknown scope; for a registered non-locked scope it creates the DB once (key = DB name in `dbInstances`) and reuses it.
  - `resolveOfflineDbStrict(scope)`: returns the locked instance for a locked scope or alias, the registered DB for a registered scope, and `null` for empty, unknown or invalid scopes. Never falls back to warehouse.
  - `getAllOfflineDbs()`: `[warehouseOfflineDb, financeOfflineDb, ...registered non-locked DBs]` without duplicates; on registry error only the two locked DBs.
- e) Spec `offline-scope.registry.spec.ts` (at least 8 `it(`), registering a fake third module with `getModuleRegistry().registerModule(...)` only inside this file:
  - a valid third module `qa_mod` with `dbName: 'WarehouseOfflineDB_qa_mod'` and pattern `/qa-mod/`: `resolveScopeFromUrl('/api/qa-mod/x/')` is `qa_mod`, `getOfflineDb('qa_mod')` has that name and is the same instance on a second call, `getAllOfflineDbs()` has 3 entries with the locked two first;
  - an invalid `dbName`, an uppercase `scopeKind`, and a module claiming `scopeKind: 'personnel'` or `dbName: 'WarehouseOfflineDB_finance'` for another scope are ignored;
  - with `setInstalledModules(['warehouse'])`, `getOfflineDb('finance')` is still `financeOfflineDb` and `resolveScopeFromUrl('/api/payroll/x/')` is still `finance` (build-static source);
  - `resolveOfflineDbStrict('xyz')`, `resolveOfflineDbStrict('')` and `resolveOfflineDbStrict(undefined)` are `null`; `resolveOfflineDbStrict('personnel')` is `financeOfflineDb`;
  - for both real modules, `offlineSync.scopeKind` equals `syncConfig.scopeKind`.
  Do not open IndexedDB in tests: assert names and instance identity only.

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base 64b2c17 --include "src/app/core/**/*.spec.ts" --include "src/app/shared/components/user-menu/*.spec.ts"` and at most two runs each of `python scripts/e2e/guardian_34_offline_continuity.py` and `python scripts/e2e/guardian_57_front_module_fence.py`. Guardian 57 must not report an increase; never run it with `--update-baseline`. If a command fails, read its output and change approach.

6. Before finishing: the characterization spec of session 16 passes unchanged, the ng-test-compare run reports no new failing test, guardians 34 and 57 pass, and `git diff --stat` shows only the 5 files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(offline): offlineSync extension and registry-driven scope resolution
- Short English report: the new functions with one line each, the guardian 57 counter before and after, the ng-test-compare summary line, remaining uncertainty. End the turn after the commit and the report.

===

[DONE] Session 19 of 22 — Phase 4 step 4: queue readers use every offline DB (drain, counts, protection sets, restore gate)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/core/services/offline/offline-queue-runner.ts warehouse-front/src/app/core/services/offline-sync.service.ts warehouse-front/src/app/core/services/sync-pull.service.ts warehouse-front/src/app/core/services/offline/offline-local-patcher.ts warehouse-front/src/app/core/services/offline-db.ts warehouse-front/src/app/core/services/server-restore-gate.ts warehouse-front/src/app/core/services/offline/offline-n-scope.readers.spec.ts
verify: python scripts/automation/verify_tools.py diff-free --base {base} --path warehouse-front/src/app/core/services/offline-db.ts --pattern "this\.version\(|\.stores\(|\+\+id|WarehouseOfflineDB_warehouse'|WarehouseOfflineDB_finance'"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/services/offline/offline-queue-runner.ts --contains getAllOfflineDbs --absent otherScope --absent "financeOfflineDb.syncQueue.where('status').anyOf(['pending', 'failed']).count()"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/services/server-restore-gate.ts --contains getAllOfflineDbs --contains getDatabaseNames --contains WarehouseOfflineDB_
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/services/sync-pull.service.ts --contains getAllOfflineDbs
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/services/offline/offline-local-patcher.ts --contains getAllOfflineDbs --contains "for (const db of [warehouseOfflineDb, financeOfflineDb])"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/services/offline-db.ts --contains "others:" --contains "warehouse: { [tableName: string]: any[] };" --contains "finance: { [tableName: string]: any[] };"
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/services/offline/offline-n-scope.readers.spec.ts --min-tests 7 --require registerModule --require runQueueSequential --require countUnsentEntries --require getDatabaseNames
verify: python scripts/e2e/guardian_34_offline_continuity.py
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base 64b2c17 --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(offline): queue readers cover every offline database"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Change only the 7 files in the scope verify line. Do not edit any existing spec. `offline-scope.characterization.spec.ts` and `offline-scope.registry.spec.ts` must pass unchanged.
- This session changes readers only. Do not change how any single record is written, retried, cancelled or deleted (`sendEntry`, `handleRetry`, `markTransportFailure`, `cancelQueueEntry`, `reconcileRejected`, `applyOptimisticUpdate`, conflict-manager functions): those are session 20.
- `purgeEphemeralQueueEntries` keeps its loop over exactly `[warehouseOfflineDb, financeOfflineDb]` (invariant `ن۱۲`). Do not extend any URL-based deletion to other DBs.
- The JSON keys `warehouse` and `finance` of `exportLocalDatabaseSnapshot` and their content stay exactly as they are; only a new key is added.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `#### ۴.۱`, invariants `ن۶`, `ن۱۱`, `ن۱۲` and the paragraph for session 19.
- `getAllOfflineDbs()` in `warehouse-front/src/app/core/services/offline-db.ts` (session 18) returns the two locked DBs first, then registered DBs.
- Places that read both queues with a fixed pair today:
  - `offline-queue-runner.ts`: the drain loop in `runQueueSequential` (`currentScope`/`otherScope`), `getPendingCount`, `getUnsentCountStrict`, `getQueueEntries`.
  - `offline-sync.service.ts`: `initialize()` (`sending` back to `pending`) and `refreshCounts()`.
  - `sync-pull.service.ts`: the `pendingSyncIds` set (around line 318).
  - `offline-local-patcher.ts`: the `protectedIds` set in `pruneOldLocalData`.
  - `offline-db.ts`: `clearAllScopedCaches`, `exportLocalDatabaseSnapshot`.
  - `server-restore-gate.ts`: `countUnsentEntries`.

3. Definitions:
- "Every DB" means `getAllOfflineDbs()`.
- "Unknown device DB" means a name from `Dexie.getDatabaseNames()` that starts with `WarehouseOfflineDB_` and is not the name of any DB in `getAllOfflineDbs()`.

4. Task:
- a) `runQueueSequential`: read pending/failed entries of every DB, pair each entry with its own DB, keep the existing global sort (retry ceiling first, then `createdAt`) and every existing rule (user check, transport abort, auth stop, head-of-line rule). Replace the log text that names the current and other scope with per-DB counts.
- b) `getPendingCount(scope)`: `'all'` or no argument sums every DB; a scope argument counts only `resolveOfflineDbStrict(scope)` and returns 0 when it is `null`. `getUnsentCountStrict()` sums every DB. `getQueueEntries(scope)`: same scope rule, merged and sorted by `createdAt`.
- c) `offline-sync.service.ts`: `initialize()` resets `sending` to `pending` in every DB; `refreshCounts()` sums pending and undismissed errors over every DB. Keep the photo queue part unchanged.
- d) `sync-pull.service.ts` `pendingSyncIds` and `pruneOldLocalData` `protectedIds`: built from the queues of every DB.
- e) `clearAllScopedCaches`: every DB.
- f) `exportLocalDatabaseSnapshot`: add key `others: { [dbName: string]: { [tableName: string]: any[] } }` with every DB after the locked two (empty object when there are none) and include their records in `metrics.totalRecords`.
- g) `countUnsentEntries` in `server-restore-gate.ts`: count every DB, plus the `syncQueue` rows of every unknown device DB, opened read-only with `new Dexie(name)` and `open()` (dynamic mode, no `version()` call), counted, then `close()`d. Skip a DB without a `syncQueue` table. Any error while listing or reading must propagate so the gate stays closed, exactly like today's read errors.
- h) Spec `offline-n-scope.readers.spec.ts` (at least 7 `it(`), registering a fake module `qa_mod` (as in `offline-scope.registry.spec.ts`) and spying on the tables of its DB: the drain sends a `qa_mod` entry with its own DB handle in global `createdAt` order; `getPendingCount()`, `getUnsentCountStrict()` and `getQueueEntries('all')` include it; `getPendingCount('xyz')` is 0; `countUnsentEntries` counts a `qa_mod` row and a row from an unknown device DB returned by a mocked `Dexie.getDatabaseNames`; a rejected `getDatabaseNames` makes `countUnsentEntries` reject; `purgeEphemeralQueueEntries` does not touch the `qa_mod` DB.

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base 64b2c17 --include "src/app/core/**/*.spec.ts" --include "src/app/modules/**/settings-backup-tab/*.spec.ts" --include "src/app/modules/warehouse/components/wh-settings/*.spec.ts" --include "src/app/shared/components/offline-pending-badge/*.spec.ts"`. If a command fails, read its output and change approach.

6. Before finishing: the specs of sessions 16 and 18 pass unchanged, the ng-test-compare run reports no new failing test, and `git diff --stat` shows only files from the scope line.

7. Output and stop condition:
- Commit with this message, without push:
refactor(offline): queue readers cover every offline database
- Short English report: each reader changed with one line, the tests added, the ng-test-compare summary line, remaining uncertainty. End the turn after the commit and the report.

===

[DONE] Session 20 of 22 — Phase 4 step 4: record writers never fall back to the warehouse DB for an unknown scope

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/core/services/offline/offline-queue-runner.ts warehouse-front/src/app/core/services/offline/offline-local-patcher.ts warehouse-front/src/app/core/services/offline/offline-conflict-manager.ts warehouse-front/src/app/core/services/offline-sync.service.ts warehouse-front/src/app/modules/common/components/operations/operations-sync-monitor/operations-sync-monitor.ts warehouse-front/src/app/core/services/offline/offline-n-scope.writers.spec.ts
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/services/offline/offline-queue-runner.ts --contains resolveOfflineDbStrict --absent "targetDb || getOfflineDb(entry.appScope)" --absent "targetDb || getOfflineDb(appScope)"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/services/offline/offline-local-patcher.ts --contains resolveOfflineDbStrict --absent "const otherScope"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/services/offline/offline-conflict-manager.ts --contains getAllOfflineDbs --contains resolveOfflineDbStrict
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/services/offline/offline-n-scope.writers.spec.ts --min-tests 8 --require cancelQueueEntry --require handleRetry --require reconcileRejected --require dismissError --require resolveOfflineDbStrict
verify: python scripts/e2e/guardian_34_offline_continuity.py
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base 64b2c17 --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(offline): id-keyed queue and error writes resolve their database strictly"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Change only the 6 files in the scope verify line. Do not edit any existing spec. The specs of sessions 16, 17, 18 and 19 must pass unchanged, including the "first found" results of `dismissError`/`deleteError` locked in session 16.
- A queue record is deleted only after explicit server acceptance (2xx) or explicit rejection (4xx); 5xx means retry. Do not change any status-code rule in `sendEntry`.
- An id-keyed write whose DB cannot be resolved is skipped and logged with `console.warn`; it never falls back to `warehouseOfflineDb`.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `#### ۴.۱`, invariants `ن۷` and `ن۹` and the paragraph for session 20.
- Queue and error ids are numbered separately in each DB, so the same id can exist in several DBs. `resolveOfflineDbStrict(scope)` and `getAllOfflineDbs()` are in `offline-db.ts`.
- Writers today:
  - `offline-queue-runner.ts`: `handleRetry` and `markTransportFailure` use `targetDb || getOfflineDb(entry.appScope)`; `sendEntry` uses `targetDb || getOfflineDb(appScope)`; `cancelQueueEntry` checks the two DBs when no scope is given and refuses an id found in both.
  - `offline-local-patcher.ts`: `getCachedEntry` falls back to the "other" scope; `invalidateCache` without scope uses the fixed pair; `reconcileRejected` and `applyOptimisticUpdate` use `getOfflineDb(scope)`.
  - `offline-conflict-manager.ts`: `getErrors`, `getAllErrors`, `dismissError`, `deleteError`, `dismissAllErrors`, `clearAllErrors`, `retryError`, `resolveConflict` use the fixed pair, and look up a bare id in warehouse first, then finance.
  - `offline-sync.service.ts`: wrappers that call the conflict-manager functions.
  - `operations-sync-monitor.ts`: since session 17 it knows the source DB of each error; its `resolveConflict` call still passes only the id.

3. Definitions:
- "Strict DB" of a record: the DB handle passed by the caller when there is one; otherwise `resolveOfflineDbStrict(record.appScope)` when `appScope` is non-empty; otherwise (no `appScope`) the existing lookup rule of that function.
- "First found" order: every DB in `getAllOfflineDbs()` order (warehouse, finance, then others).

4. Task:
- a) `handleRetry`, `markTransportFailure`, `sendEntry`: use the strict DB; when it is `null`, skip the write, log, and return the same result type the function returns for a missing id today.
- b) `cancelQueueEntry(id, scope)`: with a scope, use `resolveOfflineDbStrict(scope)` and return `false` when it is `null`; without a scope, search every DB and refuse when the id exists in more than one, as today for two.
- c) `offline-local-patcher.ts`: `reconcileRejected` and `applyOptimisticUpdate` use the strict DB and do nothing when it is `null`; `getCachedEntry` falls back over every other DB in order; `invalidateCache` without scope covers every DB.
- d) `offline-conflict-manager.ts`: list and bulk functions cover every DB; each single-error function (`dismissError`, `deleteError`, `retryError`, `resolveConflict`) gets an optional last parameter `scope`. With `scope`, it uses only `resolveOfflineDbStrict(scope)` (nothing when `null`); without `scope`, it keeps the "first found" rule over every DB. In `retryError` and `resolveConflict`, the re-queued entry keeps the scope of the DB it came from.
- e) `offline-sync.service.ts`: pass the optional `scope` through its wrappers. `operations-sync-monitor.ts`: pass the source DB's `dbScope` to `resolveConflict`.
- f) Spec `offline-n-scope.writers.spec.ts` (at least 8 `it(`): an entry with `appScope: 'xyz'` makes `handleRetry` and `markTransportFailure` write nothing in any DB; `cancelQueueEntry(7, 'xyz')` returns `false` and deletes nothing; `cancelQueueEntry(7)` with id 7 in the warehouse DB and in a registered `qa_mod` DB returns `false`; `reconcileRejected` with `appScope: 'xyz'` writes nothing; `dismissError(7, 'finance')` with id 7 in both locked DBs updates only the finance DB; `dismissError(7)` without scope keeps the session 16 result; `resolveOfflineDbStrict` is used for `qa_mod` entries (its DB handle receives the write).

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base 64b2c17 --include "src/app/core/**/*.spec.ts" --include "src/app/modules/common/components/operations/**/*.spec.ts" --include "src/app/shared/components/offline-pending-badge/*.spec.ts"`. If a command fails, read its output and change approach.

6. Before finishing: the specs of sessions 16 to 19 pass unchanged, the ng-test-compare run reports no new failing test, and `git diff --stat` shows only files from the scope line.

7. Output and stop condition:
- Commit with this message, without push:
fix(offline): id-keyed queue and error writes resolve their database strictly
- Short English report: each writer changed with one line, the tests added, the ng-test-compare summary line, remaining uncertainty. End the turn after the commit and the report.

===

[DONE] Session 21 of 22 — Phase 4 step 4: user-menu scope context and session-tab token scope read the offlineSync extension

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/shared/components/user-menu/user-menu.component.ts warehouse-front/src/app/core/services/session-tab.service.ts
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/shared/components/user-menu/user-menu.component.ts --contains appRoutePrefixes --contains normalizeScope --absent "url.startsWith('/app/treasury')" --absent "url.startsWith('/app/tag-templates')"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/services/session-tab.service.ts --contains normalizeScope --absent "scope === 'personnel' || scope === 'finance' ? 'finance' : 'warehouse'"
verify: python scripts/automation/verify_tools.py diff-free --base {base} --path warehouse-front/src/app/shared/components/user-menu/user-menu.component.ts --pattern "\(click\)|\[ngClass\]|class="
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base 64b2c17 --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(offline): user-menu and session-tab scopes from offlineSync"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Change only the 2 files in the scope verify line. Do not change any template, style or spec. The specs of sessions 16 to 20 and the existing `user-menu.component.spec.ts` and `session-tab.service.spec.ts` must pass unchanged.
- The token storage keys `wh_access_token_finance` and `wh_access_token_warehouse` must not change.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `#### ۴.۱`, the `offlineSync` table and the paragraph for session 21.
- `currentScopeContext` in `warehouse-front/src/app/shared/components/user-menu/user-menu.component.ts` (around lines 110 to 160): step 1 checks hard-coded `startsWith` prefixes, step 2 maps `activeApp` names, step 3 checks installed `scopeKind`s.
- `getScopedAccessToken` and `setScopedAccessToken` in `warehouse-front/src/app/core/services/session-tab.service.ts` map `personnel`/`finance` to `finance` and everything else to `warehouse`.
- `normalizeScope` and the `offlineSync` extension (session 18) are in `offline-db.ts` and the two module files.

3. Definitions: "route scope" is the `scopeKind` of the first module in `getModuleRegistry().getAllModules()` whose `offlineSync.appRoutePrefixes` contains a prefix the router url starts with.

4. Task:
- a) `currentScopeContext`: keep the `/app/operations` check first and unchanged. Replace the hard-coded finance and warehouse prefix lists with the route scope. Replace the `activeApp` name mapping with `normalizeScope(activeApp)` for any non-empty `activeApp` other than `operations`. Keep step 3 and the final default unchanged. The return type stays the same; a route scope or normalized scope that is neither `warehouse` nor `finance` returns `warehouse` (the deep-sync modal has only these two sections).
- b) `session-tab.service.ts`: in both token functions, compute the scoped key suffix with `normalizeScope(scope)` and keep only `warehouse` or `finance` as the suffix (anything else uses `warehouse`, as today).

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base 64b2c17 --include "src/app/shared/components/user-menu/*.spec.ts" --include "src/app/core/services/**/*.spec.ts"`. If a command fails, read its output and change approach.

6. Before finishing: the ng-test-compare run reports no new failing test, and `git diff --stat` shows only the 2 files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(offline): user-menu and session-tab scopes from offlineSync
- Short English report: what changed, the ng-test-compare summary line, remaining uncertainty. End the turn after the commit and the report.

===

[DONE] Session 22 of 22 — Release phase 4 step 4 on the local app environment: backup, migration check, patched frontend build; the runner restarts Daphne and the GDrive worker and runs the health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py restart-worker
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session is a release only. Do not edit, create, stage or commit any file. Do not run `git` commands that change the working tree or history.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`. The runner restarts Daphne and the GDrive worker itself after your turn.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `warehouse-backend/backups/` or `warehouse-front/dist/`.

2. Context: sessions 16 to 21 of phase 4 changed frontend offline code and tests only, and added no migration. Your terminal may be PowerShell; if so, set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order:
- a) Backup. In `warehouse-backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app phase 4 step 4'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0. Do not continue without a successful backup.
- b) Migration check. `.\venv\Scripts\python.exe manage.py showmigrations --plan` must show no `[ ]` line. If any `[ ]` line appears, stop and report it; do not migrate.
- c) Frontend build. In `warehouse-front`, run `npx ng build --delete-output-path=false` in the foreground and wait for it to finish, then run `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.

4. Tool policy: only the commands above and `git status --short`. Run the build at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the backup filename and size, the `showmigrations` result, the build result (errors and warnings count) and the patch script line. Write the report only after the build and the patch have finished. No commit. End the turn after the report.

===

[DONE] Session 23 of 24 — Phase 4 step 4 review fixes: explicit locked scope constants; legacy queue migration without duplicate send

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/core/services/offline-db.ts warehouse-front/src/app/core/services/offline-db.legacy-migration.spec.ts
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file warehouse-front/src/app/core/services/offline-db.legacy-migration.spec.ts
verify: python scripts/automation/verify_tools.py diff-free --base {base} --path warehouse-front/src/app/core/services/offline-db.ts --pattern "this\.version\(|\.stores\(|\+\+id|: 'WarehouseOfflineDB_"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/services/offline-db.ts --absent "SCOPE_KEYS[" --absent "Object.keys(SCOPED_DB_NAMES)" --contains "navigator.locks" --contains wh-legacy-offline-migration
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/services/offline-db.legacy-migration.spec.ts --min-tests 10 --require locks
verify: python scripts/e2e/guardian_34_offline_continuity.py
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base 64b2c17 --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(offline): explicit locked scope constants and claim-first legacy queue migration"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Change only the 2 files in the scope verify line. In the spec, add tests and adjust only expectations that test the old order of `add` and `update`; do not delete tests. All other specs must pass unchanged.
- Do not change any `version()`/`stores()` line or any IndexedDB name. Never delete or clear the legacy IndexedDB `WarehouseOfflineDB` or any of its rows.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `#### ۴.۱`, invariants `ن۲` and `ن۸`.
- `warehouse-front/src/app/core/services/offline-db.ts` defines `WH_SCOPE`, `FIN_SCOPE`, `ACCT_SCOPE` and `PERS_SCOPE` by position from `Object.keys(SCOPED_DB_NAMES)`. Reordering that table would silently change which DB a record goes to.
- `migrateLegacyData` in the same file, queue part: it checks for an existing copy, then `add`s, then sets `migratedAt` on the legacy row. Two defects:
  - Two tabs opened at the same time both run it, both find no copy, and both add the same row, so the request is sent twice.
  - When `add` succeeds but the `migratedAt` update fails, the marker stays unset; after the added copy is sent and deleted, the next start finds no copy and adds the row again, so it is sent twice.

3. Definitions:
- "Claim" means writing `migratedAt` on the legacy row before adding its copy to the target queue.
- "Release a claim" means `update(item.id, { migratedAt: undefined })` on the legacy row.

4. Task:
- a) Replace the 4 positional constants with explicit ones: `const WH_SCOPE: AppScope = 'warehouse';`, `FIN_SCOPE` = `'finance'`, `ACCT_SCOPE` = `'accounting'`, `PERS_SCOPE` = `'personnel'`. Remove `SCOPE_KEYS`. Change nothing else in the resolvers.
- b) Cross-tab lock: `migrateLegacyDatabaseIfNeeded` runs the whole migration inside `navigator.locks.request('wh-legacy-offline-migration', { mode: 'exclusive' }, callback)` when `navigator.locks` exists, otherwise directly. Inside the lock, check the localStorage marker again before reading anything.
- c) Claim-first per queue row: skip a row without `id` (log it). Claim the row; if the claim fails, skip the row and set the error flag. Then check for an existing copy and `add` when there is none (unchanged rules). If the check or `add` throws, release the claim; if the release also fails, log it and keep the error flag. The row is never deleted from the legacy DB.
- d) Spec: add at least 4 tests: the claim `update` happens before `add`; a failing `add` releases the claim and leaves the marker unset; a failing claim adds nothing; with a mocked `navigator.locks.request` the migration body runs inside it, and without `navigator.locks` it still runs.

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base 64b2c17 --include "src/app/core/services/**/*.spec.ts"` and at most two runs of `python scripts/e2e/guardian_57_front_module_fence.py` (never with `--update-baseline`). If a command fails, read its output and change approach.

6. Before finishing: the ng-test-compare run reports no new failing test, guardian 57 passes, and `git diff --stat` shows only the 2 files.

7. Output and stop condition:
- Commit with this message, without push:
fix(offline): explicit locked scope constants and claim-first legacy queue migration
- Short English report: what changed, the tests added, the guardian 57 counter, the ng-test-compare summary line. End the turn after the commit and the report.

===

[DONE] Session 24 of 24 — Release phase 4 step 4 review fixes on the local app environment: backup, migration check, patched frontend build; the runner restarts Daphne and the GDrive worker and runs the health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py restart-worker
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session is a release only. Do not edit, create, stage or commit any file. Do not run `git` commands that change the working tree or history.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`. The runner restarts Daphne and the GDrive worker itself after your turn.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `warehouse-backend/backups/` or `warehouse-front/dist/`.

2. Context: sessions 16 to 21 and 23 of phase 4 changed frontend offline code and tests only, and added no migration. Your terminal may be PowerShell; if so, set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order:
- a) Backup. In `warehouse-backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app phase 4 step 4 fixes'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0. Do not continue without a successful backup.
- b) Migration check. `.\venv\Scripts\python.exe manage.py showmigrations --plan` must show no `[ ]` line. If any `[ ]` line appears, stop and report it; do not migrate.
- c) Frontend build. In `warehouse-front`, run `npx ng build --delete-output-path=false` in the foreground and wait for it to finish, then run `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.

4. Tool policy: only the commands above and `git status --short`. Run the build at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the backup filename and size, the `showmigrations` result, the build result (errors and warnings count) and the patch script line. Write the report only after the build and the patch have finished. No commit. End the turn after the report.
