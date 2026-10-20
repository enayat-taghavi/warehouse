[DONE] Session 1 of 15 — Phase 4: AuthGuard generic module loop only for modules with routeAccess; unused markers removed from app.routes; open scopeKind type and closed deepSyncScope

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/core/auth/auth.guard.ts warehouse-front/src/app/app.routes.ts warehouse-front/src/app/core/modules/module-contract.ts
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/modules/module-contract.ts --contains "scopeKind: 'warehouse' | 'finance' | 'operations' | (string & {});" --contains "deepSyncScope?: 'warehouse' | 'finance';"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/app.routes.ts --absent "registry.permissionMarkers('warehouse')" --absent "registry.permissionMarkers('accounting')"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base ef99e43 --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(guard): generic module loop only for modules with routeAccess"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Change only the 3 files listed in the scope verify line of this session. Do not edit any spec file.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit the plan document or anything under `scripts/`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, headings `## ۱.` and `### گام ۰`.
- Commit `30648fb` added a generic loop to `AuthGuard` in `warehouse-front/src/app/core/auth/auth.guard.ts` (the loop that starts with `for (const mod of installed)` and skips `scopeKind` `warehouse` and `finance`). `ModuleRegistryService` always adds the built-in `OPERATIONS_SPEC` (`scopeKind: 'operations'`, `routePrefix: '/app/operations'`) and it has no `routeAccess`. The loop therefore denies every non-admin user on `/app/operations/*`.
- Evidence: `src/app/core/auth/route-access.characterization.spec.ts`, tests 2 to 5 of the `AuthGuard characterization` block, fail on HEAD and pass on commit `ef99e43`. Example: a user with only `view_sys_users` must get `true` for `/app/operations/users`.

3. Definitions: "module with routeAccess" means `getModuleRouteAccess(mod)` in `auth.guard.ts` returns a value.

4. Task:
- a) In that generic loop, skip every module without routeAccess, in addition to the existing `warehouse`/`finance` skip. Do not change any other branch of `AuthGuard`.
- b) In `app.routes.ts`, delete the two unused constants `whMarkers` and `acctMarkers` in both redirect functions (path `app` and path `''`). Change nothing else there.
- c) In `module-contract.ts`, set `scopeKind: 'warehouse' | 'finance' | 'operations' | (string & {});` and set `deepSyncScope?: 'warehouse' | 'finance';` (the offline system has exactly two scopes).

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most two runs of `python scripts/automation/verify_tools.py ng-test-compare --base ef99e43 --include "src/app/core/auth/*.spec.ts" --include "src/app/modules/common/components/login/*.spec.ts"`. If a command fails, read its output and change approach.

6. Before finishing: the ng-test-compare run above reports no new failing test, and `git diff --stat` shows only the 3 files.

7. Output and stop condition:
- Commit with this message, without push:
fix(guard): generic module loop only for modules with routeAccess
- Short English report: the change per item a to c, the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 2 of 15 — Phase 4: the server rollback and restore gates count the unsent offline queue of both IndexedDB scopes

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts warehouse-front/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.spec.ts
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts --contains "warehouseOfflineDb.syncQueue" --contains "financeOfflineDb.syncQueue" --absent "offlineDb.syncQueue"
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file warehouse-front/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.spec.ts
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.spec.ts --min-tests 13 --require "finance queue"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(backup): rollback and restore gates count both offline queues"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- No data may ever be lost. These two gates stop a server rollback or restore while unsent offline records exist. The gate may only become stricter; it must never let a rollback or restore start while either queue holds a record.
- Do not change `offline-db.ts` or any queue, sync or delete logic. Only the two gate checks and their spec change.
- Run every command in the foreground and wait until it finishes. Never end your turn while a command is still running.
- Change only the 2 files listed in the scope verify line. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `### گام ۰`.
- `settings-backup-tab.ts` reads `await offlineDb.syncQueue.toArray()` in `openRollbackConfirm` and in `openRestoreConfirm`. `offlineDb` is a proxy that resolves to the database of the active scope only, so unsent records in the other scope (`WarehouseOfflineDB_finance` or `WarehouseOfflineDB_warehouse`) are not counted.
- `warehouseOfflineDb` and `financeOfflineDb` are exported by `core/services/offline-db.ts`.

3. Task:
- a) Add one private async method in the component that returns the total number of entries in `warehouseOfflineDb.syncQueue` plus `financeOfflineDb.syncQueue` (use `toArray()` on both, any status counts, as today). Use it in both gates; the Persian toast text keeps today's wording with the total count.
- b) Update the spec so the existing tests mock both queues (empty by default). Keep every existing test.
- c) Add at least two tests: one whose name contains `finance queue` (rollback blocked when only the finance queue has a record and the warehouse queue is empty), and one for restore blocked when only the finance queue has a record. Each asserts the error toast and that the confirm modal stays closed.

4. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most three runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/modules/common/components/settings/**/*.spec.ts"`.

5. Output and stop condition:
- Commit with this message, without push:
fix(backup): rollback and restore gates count both offline queues
- Short English report: the change, the tests added, the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 3 of 15 — Phase 4 backend: module spec is the only source for app codes; active_priority picks the default active app; default active app from default_module()

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-backend/core/platform_core/registry.py warehouse-backend/core/platform_core/tests.py warehouse-backend/core/accounts/middleware.py warehouse-backend/core/accounts/permissions.py warehouse-backend/modules/warehouse/module.py warehouse-backend/modules/accounting/module.py
verify: python -c "import ast,pathlib,sys; p=pathlib.Path('warehouse-backend/core/platform_core/registry.py'); src=p.read_text(encoding='utf-8'); t=ast.parse(src); fs={'resolve_default_active_app','app_code_to_module','module_allowed_app_code','module_scope_codes','default_module'}; names={'warehouse','finance','accounting','personnel'}; bad=[(f.name,c.value) for f in ast.walk(t) if isinstance(f,ast.FunctionDef) and f.name in fs for c in ast.walk(f) if isinstance(c,ast.Constant) and c.value in names]; legacy=[n for n in ('_APP_CODE_TO_MODULE','_MODULE_TO_ALLOWED_APP','_MODULE_SCOPE_CODES') if n in src]; ok='active_priority' in src; print('literals:',bad,'legacy:',legacy,'active_priority:',ok); sys.exit(1 if bad or legacy or not ok else 0)"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/core/accounts/permissions.py --absent "or 'accounting')"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/core/accounts/middleware.py --absent "default='accounting'"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/modules/warehouse/module.py --contains "active_priority=10"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/modules/accounting/module.py --contains "active_priority=20"
verify: python -c "import pathlib,re,sys; s=pathlib.Path('warehouse-backend/core/platform_core/tests.py').read_text(encoding='utf-8'); n=len(re.findall(r'def test_', s)); print('tests:',n); sys.exit(0 if n>=7 else 1)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 860
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(registry): module spec is the only source for app codes"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Behaviour must stay identical in the full profile (both modules installed). The existing tests in `core/platform_core/tests.py` must pass unchanged; do not edit or delete them.
- Change only the 6 files listed in the scope verify line.
- Run every command in the foreground. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, headings `## ۱.` and `### گام ۱`.
- `core/platform_core/registry.py` still has three legacy dicts (`_APP_CODE_TO_MODULE`, `_MODULE_TO_ALLOWED_APP`, `_MODULE_SCOPE_CODES`) used only as fallbacks. `MODULE_CATALOG` (`platform_core/module_catalog.py`) loads every `modules/*/module.py` on disk regardless of `WH_MODULES`, so uninstalled modules are in it; `app_code_to_module`, `module_allowed_app_code` and `module_scope_codes` already read it.
- `resolve_default_active_app` hardcodes `'warehouse'` and `'accounting'`. Its contract is fixed by `test_resolve_default_active_app`: `['finance']` gives `finance`, `['warehouse']` gives `warehouse`, both give `warehouse`, `[]` gives `finance`. `default_module()` (lowest `default_priority` among installed modules, accounting 10, warehouse 20) must keep returning `accounting` in the full profile. One priority field cannot express both rules, so a second field is added.
- `core/accounts/middleware.py` declares `_current_active_app_var` with `default='accounting'`. `core/accounts/permissions.py` ends two expressions with `or 'accounting')`.

3. Definitions: "app code of a spec" means `spec.allowed_app_code` when it is not empty, otherwise `spec.code`. "All specs" means `{**MODULE_CATALOG, **_REGISTRY}`.

4. Task:
- a) Delete the three legacy dicts and every line that reads them. `module_allowed_app_code(code)` returns the app code of the spec from `_REGISTRY` or else `MODULE_CATALOG`, or `code` when no spec exists. `module_scope_codes(code)` returns `spec.scope_codes` when not empty, else `(module_allowed_app_code(code),)`. `app_code_to_module` keeps its current lookup over all specs and returns `None` when nothing matches.
- b) Add `active_priority: int = 100` to `ModuleSpec`; set `active_priority=10` in `modules/warehouse/module.py` and `active_priority=20` in `modules/accounting/module.py`.
- c) Rewrite `resolve_default_active_app(allowed_apps)` without any module name: among all specs whose app code is in `allowed_apps`, return the app code of the one with the lowest `active_priority`; if none, return the app code of the catalog spec with the lowest `default_priority`; if there are no specs, return `''`. This also removes the current bug where `getattr(spec, 'allowed_app_code', spec.code)` returns `''`.
- d) In `middleware.py`, change the ContextVar default to `''` and make `get_current_active_app()` return the variable value or, when empty, `default_module()` (import inside the function). In `permissions.py`, remove the trailing `or 'accounting'` from both expressions.
- e) Add at least three tests to `core/platform_core/tests.py`: with `accounting` removed from `_REGISTRY` (use `patch.dict` as the existing test does), `app_code_to_module('personnel') == 'accounting'` and `module_scope_codes('accounting') == ('finance', 'personnel')`; with an extra catalog spec `ModuleSpec(code='zeta', title_fa='زتا', allowed_app_code='zeta', active_priority=5)` patched into `MODULE_CATALOG`, `resolve_default_active_app(['zeta', 'warehouse']) == 'zeta'`; `get_current_active_app()` outside a request equals `default_module()`.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test platform_core --noinput`, one run of `.\venv\Scripts\python.exe manage.py test accounts integration_tests --noinput`, and `python scripts/e2e/guardian_31_install_profiles.py` at most twice. If an existing test fails, report it; do not weaken any check.

6. Output and stop condition:
- Commit with this message, without push:
refactor(registry): module spec is the only source for app codes; active_priority for the default active app
- Short English report: changes per item a to e, commands actually run with pass/fail counts, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 4 of 15 — Phase 4 backend: public read prefixes and the reports fallback come from module spec fields instead of hardcoded names in authentication.py

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-backend/core/accounts/authentication.py warehouse-backend/core/platform_core/registry.py warehouse-backend/modules/warehouse/module.py warehouse-backend/integration_tests/test_module_spec_auth_fields.py
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/core/accounts/authentication.py --absent "'warehouse'" --absent "module.code ==" --contains "public_read_prefixes" --contains "reports_fallback"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/modules/warehouse/module.py --contains "public_read_prefixes=('/api/warehouses/',)" --contains "reports_fallback=True"
verify: python -c "import pathlib,re,sys; p=pathlib.Path('warehouse-backend/integration_tests/test_module_spec_auth_fields.py'); s=p.read_text(encoding='utf-8') if p.is_file() else ''; n=len(re.findall(r'def test_', s)); print('tests:',n); sys.exit(0 if n>=4 else 1)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 860
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(auth): public read prefixes and reports fallback from module spec"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Tenant and app-scope isolation: every request that is allowed or denied today must get the same result. Only where the module-specific values come from changes.
- Change only the 4 files listed in the scope verify line.
- Run every command in the foreground. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `### گام ۱`.
- `core/accounts/authentication.py`, method `CustomJWTAuthentication.enforce_token_app_scope`:
  - For `api/reports/`, when `get_reporting_modules()` gives no installed module, it falls back to `['warehouse']` if `'warehouse' in installed_modules()`.
  - For a path of an installed module, `GET`/`HEAD`/`OPTIONS` on `/api/warehouses/` return early (no scope check) through `module.code == 'warehouse' and path.startswith('/api/warehouses/')`.

3. Task:
- a) Add to `ModuleSpec` in `registry.py`: `public_read_prefixes: tuple[str, ...] = ()` and `reports_fallback: bool = False`. In `modules/warehouse/module.py` set `public_read_prefixes=('/api/warehouses/',)` and `reports_fallback=True`.
- b) Reports fallback: when no installed reporting module exists, use the installed modules whose spec (from `_REGISTRY`) has `reports_fallback` true.
- c) Read exemption: return early when the method is `GET`, `HEAD` or `OPTIONS` and the path starts with any prefix in `module.public_read_prefixes` of the resolved module spec. Update the nearby comment so it no longer names the warehouse module.
- d) New `integration_tests/test_module_spec_auth_fields.py` (`TestCase`, at least 4 tests). Call `CustomJWTAuthentication().enforce_token_app_scope(request, user, token)` directly with a `RequestFactory` request, a non-superuser user and a dict token such as `{'allowed_apps': ['finance']}`:
  - `GET /api/warehouses/` with only `finance` passes.
  - `POST /api/warehouses/` with only `finance` raises `PermissionDenied`.
  - With `get_reporting_modules` patched to return `[]`, `GET /api/reports/entities/` passes with `['warehouse']` and raises `PermissionDenied` with `['finance']`.
  - With the warehouse spec's `public_read_prefixes` patched to `()`, `GET /api/warehouses/` with only `finance` raises `PermissionDenied`.

4. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test integration_tests.test_module_spec_auth_fields --noinput`, one run of `.\venv\Scripts\python.exe manage.py test accounts integration_tests --noinput`, and `python scripts/e2e/guardian_31_install_profiles.py` at most twice.

5. Output and stop condition:
- Commit with this message, without push:
refactor(auth): public read prefixes and reports fallback from module spec
- Short English report: changes per item a to d, commands actually run with pass/fail counts. End the turn after the commit and report.

===

[DONE] Session 5 of 15 — Phase 4 backend: users report entity reads module extra fields lazily in the query engine; the warehouse app no longer calls the reports registry

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-backend/core/platform_core/query_engine/definitions.py warehouse-backend/core/reports/registry.py warehouse-backend/core/reports/tests.py warehouse-backend/modules/warehouse/warehouses/apps.py
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/modules/warehouse/warehouses/apps.py --absent "_register_platform_entities" --absent "reports.registry" --contains "contribute('user_report_extra_fields'"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/core/reports/registry.py --absent "contributions('user_report_extra_fields')" --contains "extra_fields_point='user_report_extra_fields'"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/core/platform_core/query_engine/definitions.py --contains "extra_fields_point"
verify: python -c "import pathlib,re,sys; s=pathlib.Path('warehouse-backend/core/reports/tests.py').read_text(encoding='utf-8'); n=len(re.findall(r'def test_', s)); ok='assigned_warehouses_count' in s; print('tests:',n,'field named:',ok); sys.exit(0 if n>=4 and ok else 1)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 860
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(reports): lazy module extra fields on the users entity"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Tenant isolation: do not change `scope_resolver`, permissions or any field other than how module extra fields reach the `users` entity.
- Change only the 4 files listed in the scope verify line.
- Run every command in the foreground. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, headings `## ۱.` (row about the report field) and `### گام ۱`.
- `PLATFORM_APPS` come before `MODULE_APPS` in `config/settings.py`, so `ReportsConfig.ready()` registers the `users` entity before `WarehousesConfig.ready()` contributes `user_report_extra_fields`. To work around this, `WarehousesConfig.ready()` calls the private `reports.registry._register_platform_entities()` inside `try/except: pass`.
- `ReportEngine` reads entities through `get_entity()` (`platform_core/query_engine/engine.py`) and `EntityConfig.get_fields()` (`definitions.py`); the export job in `core/reports/excel.py` does not go through `reports.registry.get_registry()`.

3. Task:
- a) Add an optional constructor argument `extra_fields_point: str = ''` to `EntityConfig`. In `get_fields()`, right after `fields.update(self.extra)`, when the point is set, read `contributions(point)` at call time and add each item: a `FieldDef` by its `key`; a callable is called first; a `(key, FieldDef)` tuple by its key.
- b) In `_register_platform_entities()`, remove the contributions loop and pass `extra_fields_point='user_report_extra_fields'` to the `users` `EntityConfig`.
- c) In `WarehousesConfig.ready()`, delete the `try` block that imports and calls `_register_platform_entities`; keep `contribute('user_report_extra_fields', get_user_report_extra_fields())`.
- d) Add at least three tests to `core/reports/tests.py`: `get_entity('users').get_fields()` contains `assigned_warehouses_count` in the full profile without calling `get_registry()` or `register_warehouse_reports()`; an `EntityConfig` built with a test point gets a `FieldDef` contributed after it was built (patch `platform_core.registry._CONTRIBUTIONS` with `patch.dict` so nothing leaks); a `ReportEngine` run on `users` that selects `assigned_warehouses_count` returns the correct count for a user with two assigned warehouses (follow the spec format of existing report tests in `integration_tests/test_reports_integration.py`).

4. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test reports --noinput`, one run of `.\venv\Scripts\python.exe manage.py test integration_tests reports platform_core --noinput`.

5. Output and stop condition:
- Commit with this message, without push:
refactor(reports): lazy module extra fields on the users entity
- Short English report: changes per item a to d, commands actually run with pass/fail counts. End the turn after the commit and report.

===

[DONE] Session 6 of 15 — Phase 4 backend: characterization tests for the audit log app-scope filters (list, stats and Excel export) on the current code

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-backend/integration_tests/test_audit_app_scope_characterization.py
verify: python -c "import pathlib,re,sys; p=pathlib.Path('warehouse-backend/integration_tests/test_audit_app_scope_characterization.py'); s=p.read_text(encoding='utf-8') if p.is_file() else ''; n=len(re.findall(r'def test_', s)); need=['app_scope','stats','export_excel','warehouse_logs_count','finance_logs_count','CROSS_APP_DENIED','personnel','assigned']; miss=[w for w in need if w not in s]; print('tests:',n,'missing:',miss); sys.exit(0 if n>=10 and not miss else 1)"
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests.test_audit_app_scope_characterization --min-tests 10
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(audit): characterization of app-scope filters"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- This session adds tests only. Do not change any application file. The tests describe today's behaviour exactly and must pass on the current code; if a result looks wrong, still assert today's result and mention it in the report.
- Change only the one file listed in the scope verify line.
- Run every command in the foreground. Do not push. Stage only your changed file. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `### گام ۲`.
- `core/accounts/views_domains/audit_views.py`, `AuditLogViewSet` (router `audit-logs` under `/api/accounts/`):
  - `get_queryset`: for a non-superuser without `accounts.perm_sys_logs`, restricts by `user.assigned_warehouses` with three branches of the `app_scope` query parameter (`finance`/`personnel`, `warehouse`, anything else), then applies the app-scope filter (`warehouse`; `finance`/`personnel`; `all` or absent means no filter).
  - `stats` action: `warehouse_logs_count` and `finance_logs_count` use the same two filters.
  - `export_excel` action: the same app-scope filter on `app_scope` from the request data.
- The filters use `audit_scope_keys('warehouse')`, `audit_scope_keys('accounting')`, `warehouse_id`, a list of six `target_model` names, `details__target_module='finance'`, and exclude the events `CROSS_APP_DENIED` and `APP_SCOPE_SWITCH`.

3. Task: new `integration_tests/test_audit_app_scope_characterization.py` (`TestCase`, at least 10 tests). Build a fixed set of `AuditLog` rows that covers: a warehouse-module key with a warehouse id; an accounting-module key with no warehouse id; an accounting key with a warehouse id; a row with `target_model='PersonnelProfile'` and a non-accounting module; a row with `details={'target_module': 'finance'}`; a `CROSS_APP_DENIED` row; an `APP_SCOPE_SWITCH` row; a row of a warehouse the user is not assigned to. Assert exact id sets (not only counts) for:
- superuser list with `app_scope` `warehouse`, `finance`, `personnel`, `all` and absent;
- a non-superuser who can list audit logs, without `perm_sys_logs`, assigned to one warehouse, with `app_scope` `warehouse`, `finance` and absent;
- `stats` for the superuser: `warehouse_logs_count` and `finance_logs_count`;
- `export_excel` for the superuser with `app_scope` `warehouse` and `finance`: the number of data rows (read the workbook with `openpyxl`; data starts at row 3).
Find the permission the list needs from `get_permissions` and the existing permission classes; give the non-superuser only what is needed.

4. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most five runs of `.\venv\Scripts\python.exe manage.py test integration_tests.test_audit_app_scope_characterization --noinput`.

5. Output and stop condition:
- Commit with this message, without push:
test(audit): characterization of app-scope filters for list, stats and export
- Short English report: the fixture rows, each test and its expected id set, any result that looked wrong. End the turn after the commit and report.

===

[DONE] Session 7 of 15 — Phase 4 backend: audit log app-scope filters and the assigned-warehouse restriction come from module contributions

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-backend/core/accounts/views_domains/audit_views.py warehouse-backend/core/accounts/audit_scope.py warehouse-backend/core/platform_core/registry.py warehouse-backend/modules/warehouse/warehouses/apps.py warehouse-backend/modules/warehouse/warehouses/audit_scope.py warehouse-backend/modules/accounting/personnel/apps.py warehouse-backend/modules/accounting/personnel/audit_scope.py
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/core/accounts/views_domains/audit_views.py --absent "assigned_warehouses" --absent "'PersonnelProfile'" --absent "app_scope == 'warehouse'" --absent "in ['finance', 'personnel']" --absent "app_scope_param in" --contains "apply_audit_app_scope"
verify: python -c "import pathlib,re,sys; s=pathlib.Path('warehouse-backend/core/accounts/audit_scope.py').read_text(encoding='utf-8'); bad=re.findall(r'[\x27\x22](warehouse|finance|personnel|accounting|PersonnelProfile)[\x27\x22]', s); print('module literals in core helper:',bad); sys.exit(1 if bad else 0)"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/modules/warehouse/warehouses/apps.py --contains "audit_app_scope_filters" --contains "audit_user_restrictions"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/modules/accounting/personnel/apps.py --contains "audit_app_scope_filters"
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests.test_audit_app_scope_characterization --min-tests 10
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 860
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(audit): app-scope filters and user restriction via module contributions"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Tenant isolation: every user must see exactly the same audit rows as today. `integration_tests/test_audit_app_scope_characterization.py` (session 6) is the contract: it must pass unchanged, and you must not edit it.
- Register the contributions outside any `try` block, so a registration failure fails loudly instead of silently widening what users see.
- Change only the 7 files listed in the scope verify line.
- Run every command in the foreground. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `### گام ۲`.
- `audit_views.py` repeats the same app-scope filter in `get_queryset`, `stats` and `export_excel`, and restricts non-superusers through `user.assigned_warehouses` in `get_queryset`. Read the three blocks and the session 6 test before changing anything.
- `audit_scope_keys(code)` in `registry.py` reads `MODULE_CATALOG`, so it works for uninstalled modules.

3. Definitions:
- "Scope module" of an `app_scope` value: the catalog spec whose `scope_codes` contains the value (`warehouse` gives `warehouse`; `finance` and `personnel` give `accounting`; `accounting`, `all`, empty or unknown give `None`). Add a registry helper `module_for_scope_code(code)` for it.
- "Other modules' keys" of module M: the union of `audit_scope_keys(c)` for every catalog module `c` other than M.

4. Task:
- a) New `core/accounts/audit_scope.py` with `apply_audit_app_scope(qs, app_scope)`: no scope module, return `qs` unchanged; otherwise apply the filter function contributed for that module through point `audit_app_scope_filters` (items are `(module_code, fn)`, `fn(qs) -> qs`), or `qs.filter(module__in=audit_scope_keys(module))` when the module contributed none; then exclude `CROSS_APP_DENIED` and `APP_SCOPE_SWITCH` as today. Also `restrict_audit_for_user(qs, user, app_scope)`: call every function contributed through `audit_user_restrictions` as `fn(qs, user, scope_module)` and return the result. No module name may appear in this file.
- b) `modules/warehouse/warehouses/audit_scope.py`: the warehouse filter (`module__in` own keys or `warehouse_id__isnull=False`, excluding other modules' keys) and the user restriction with today's three branches, using the user's assigned warehouse ids (no restriction when the user has no `assigned_warehouses` attribute): scope module is `warehouse` gives ids only; another module gives ids or null warehouse; `None` gives ids or (null warehouse and module in other modules' keys). `modules/accounting/personnel/audit_scope.py`: the accounting filter (own keys, the six `target_model` names, `details__target_module='finance'`). Register both in their `ready()`.
- c) In `audit_views.py`, replace the three filter blocks with `apply_audit_app_scope` and the restriction block with `restrict_audit_for_user`, keeping the superuser and `perm_sys_logs` check in the view. `stats` keeps the response keys `warehouse_logs_count` and `finance_logs_count`, computed with `apply_audit_app_scope(base_qs, 'warehouse')` and `apply_audit_app_scope(base_qs, 'finance')`.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most four runs of `.\venv\Scripts\python.exe manage.py test integration_tests.test_audit_app_scope_characterization --noinput`, one run of `.\venv\Scripts\python.exe manage.py test accounts integration_tests --noinput`.

6. Output and stop condition:
- Commit with this message, without push:
refactor(audit): app-scope filters and user restriction via module contributions
- Short English report: where each contribution is registered, the characterization test result, commands actually run with pass/fail counts, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 8 of 15 — Phase 4 backend: comment target models come from module contributions instead of a hardcoded set in communications

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-backend/core/communications/serializers.py warehouse-backend/modules/warehouse/inventory/apps.py warehouse-backend/modules/warehouse/warehouses/apps.py warehouse-backend/integration_tests/test_comment_target_models.py
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/core/communications/serializers.py --absent "ALLOWED_COMMENT_MODELS = {" --absent "'counttask'" --contains "comment_target_models"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/modules/warehouse/inventory/apps.py --contains "comment_target_models"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/modules/warehouse/warehouses/apps.py --contains "comment_target_models"
verify: python -c "import pathlib,re,sys; p=pathlib.Path('warehouse-backend/integration_tests/test_comment_target_models.py'); s=p.read_text(encoding='utf-8') if p.is_file() else ''; n=len(re.findall(r'def test_', s)); print('tests:',n); sys.exit(0 if n>=3 else 1)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 860
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(comments): comment target models via module contributions"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Do not change `can_access_comment_target` or any access check; only the allow-list source changes.
- Change only the 4 files listed in the scope verify line.
- Run every command in the foreground. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `### گام ۲`.
- `core/communications/serializers.py` has `ALLOWED_COMMENT_MODELS = {'item', 'counttask', 'doctask', 'warehouse', 'document', 'financialdocument'}` used in `validate`. `Item`, `CountTask` and `DocTask` are in `modules/warehouse/inventory`, `Warehouse` in `modules/warehouse/warehouses`. No model named `Document` or `FinancialDocument` exists in the project, so those two entries are dropped.

3. Task:
- a) Replace the constant with a function that returns the set of lowercase model names from `contributions('comment_target_models')`, read at validation time.
- b) Register `'item'`, `'counttask'` and `'doctask'` in `InventoryConfig.ready()` and `'warehouse'` in `WarehousesConfig.ready()`, outside any `try` block.
- c) New `integration_tests/test_comment_target_models.py` (`TestCase`, at least 3 tests): the contributed set equals `{'item', 'counttask', 'doctask', 'warehouse'}`; the comment serializer accepts `content_type_str='inventory.item'` past the allow-list check; it rejects `content_type_str='personnel.personneldocument'` with the existing Persian «مجاز نیست» error.

4. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test integration_tests.test_comment_target_models --noinput`, one run of `.\venv\Scripts\python.exe manage.py test communications integration_tests --noinput`.

5. Output and stop condition:
- Commit with this message, without push:
refactor(comments): comment target models via module contributions
- Short English report: changes, commands actually run with pass/fail counts. End the turn after the commit and report.

===

[DONE] Session 9 of 15 — Phase 4 backend: user serializers and user views reach assigned warehouses only through WarehouseUserExtension

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-backend/core/accounts/serializers.py warehouse-backend/core/accounts/views_domains/user_views.py warehouse-backend/modules/warehouse/warehouses/user_extension.py warehouse-backend/integration_tests/test_user_warehouse_extension_calls.py
verify: python -c "import pathlib,re,sys; fs=['warehouse-backend/core/accounts/serializers.py','warehouse-backend/core/accounts/views_domains/user_views.py']; pat=re.compile(r'''assigned_warehouses\.(set|values_list|all)\(|hasattr\(\w+, ?'assigned_warehouses'\)'''); bad=[(f,m.group(0)) for f in fs for m in pat.finditer(pathlib.Path(f).read_text(encoding='utf-8'))]; print('direct uses:',bad); sys.exit(1 if bad else 0)"
verify: python -c "import pathlib,re,sys; p=pathlib.Path('warehouse-backend/integration_tests/test_user_warehouse_extension_calls.py'); s=p.read_text(encoding='utf-8') if p.is_file() else ''; n=len(re.findall(r'def test_', s)); print('tests:',n); sys.exit(0 if n>=4 else 1)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 860
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(users): assigned warehouses through the warehouse user extension"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Tenant isolation and no data loss: the Excel import must still replace only the warehouses inside the importer's own scope and keep the warehouses outside it (the `kept` logic in `user_views.py`). API field names (`assigned_warehouses`) and responses stay the same.
- Change only the 4 files listed in the scope verify line. Do not change `core/common/warehouse_scope.py`.
- Run every command in the foreground. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `### گام ۲`.
- `WarehouseUserExtension` (`modules/warehouse/warehouses/user_extension.py`) is registered under `user_extensions`; core finds it with `_get_user_warehouse_extension()` (defined in `accounts/serializers.py`, `accounts/excel_utils.py`, and inline in `user_views.py`).
- Direct uses left in core: `serializers.py` (`get_assigned_warehouses`, `create`, `update`) and `user_views.py` (the export row near `warehouses = list(user.assigned_warehouses...`, the Excel import update and create paths, and the user detail/card near `wh_names`).

3. Task:
- a) Add to `WarehouseUserExtension`: `get_assigned_ids(user) -> list[int]`, `get_assigned_names(user) -> list[str]`, `get_assigned(user) -> list` and `set_assigned(user, warehouses) -> None`, each tolerant of a user without the attribute (empty result, no-op).
- b) Replace every direct use listed above with the extension methods; when the extension is `None` (no warehouse module), keep today's result for that install (empty list, nothing set). Keep the order of operations in the import code.
- c) New `integration_tests/test_user_warehouse_extension_calls.py` (`TestCase`, at least 4 tests): creating a user through the user API with `assigned_warehouses` sets them; the user detail returns the same ids; updating with a new list replaces them; with `contributions('user_extensions')` patched to return no extension, the user serializer has no `assigned_warehouses` field and create still works.

4. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test integration_tests.test_user_warehouse_extension_calls --noinput`, one run of `.\venv\Scripts\python.exe manage.py test accounts integration_tests --noinput`.

5. Output and stop condition:
- Commit with this message, without push:
refactor(users): assigned warehouses through the warehouse user extension
- Short English report: each replaced use and the method used, commands actually run with pass/fail counts, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 10 of 15 — Phase 4 backend: warehouse scope rules of the report query engine come from a module scope handler

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-backend/core/platform_core/query_engine/engine.py warehouse-backend/core/platform_core/query_engine/definitions.py warehouse-backend/core/platform_core/query_engine/__init__.py warehouse-backend/modules/warehouse/warehouses/apps.py warehouse-backend/modules/warehouse/warehouses/report_scope.py warehouse-backend/integration_tests/test_report_scope_handlers.py
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/core/platform_core/query_engine/engine.py --absent "scope_kind == 'warehouse'" --absent "common.warehouse_scope" --contains "report_scope_handlers"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/core/platform_core/query_engine/definitions.py --absent "self.scope_kind == 'warehouse'"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-backend/modules/warehouse/warehouses/apps.py --contains "report_scope_handlers"
verify: python -c "import pathlib,re,sys; p=pathlib.Path('warehouse-backend/integration_tests/test_report_scope_handlers.py'); s=p.read_text(encoding='utf-8') if p.is_file() else ''; n=len(re.findall(r'def test_', s)); print('tests:',n); sys.exit(0 if n>=4 else 1)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 860
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(reports): warehouse scope rules via a module scope handler"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Tenant isolation: every report must return exactly the same rows to every user as today. A scope kind with a `scope_path` and no handler must be denied (`ReportError`, status 403), never left unscoped.
- Keep the `company` scope rules in core unchanged. Keep the default values of `scope_kind` and `module_code` parameters unchanged.
- Register the handler outside any `try` block.
- Change only the files listed in the scope verify line.
- Run every command in the foreground. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `### گام ۲`.
- `platform_core/query_engine/engine.py` has `scope_kind == 'warehouse'` branches in `_build_join_scope_q`, `_check_scope_access` and `_scope_queryset`, using `common.warehouse_scope` (`can_access_warehouse`, `user_warehouse_ids`, `scope_queryset`). `definitions.py` `EntityConfig.get_fields()` reads the `blind_counting` setting per warehouse when `self.scope_kind == 'warehouse'`.
- The platform `users` entity keeps the default `scope_kind='warehouse'` with `scope_path=None` and a `scope_resolver`; it must work in every install profile.

3. Definitions: a "scope handler" is an object contributed through `report_scope_handlers` with attribute `kind` (str), attribute `per_scope_settings` (bool), and methods `check_access(user, scope_id) -> assigned_ids or None` (raises `ReportError` 403 when the user may not access `scope_id`), `scope_queryset(qs, user, path, scope_id) -> qs`, and `join_q(user, assigned_ids, path, scope_id) -> Q`.

4. Task:
- a) In core, look up the handler for an entity's `scope_kind` at call time. In `_check_scope_access`, `_scope_queryset` and `_build_join_scope_q`, replace each `warehouse` branch with the handler call, keeping the exact logic (including the superuser rule in `_build_join_scope_q`). When no handler exists: `scope_path` is `None`, or the kind is `company`, behave as today's non-warehouse path; otherwise raise `ReportError(..., status=403)` with a Persian message.
- b) In `get_fields()`, read the per-scope `blind_counting` setting when the entity's handler has `per_scope_settings` true, instead of comparing the kind with `'warehouse'`.
- c) New `modules/warehouse/warehouses/report_scope.py` with the warehouse handler (`kind='warehouse'`, `per_scope_settings=True`) using `common.warehouse_scope` exactly as the engine does today; register it in `WarehousesConfig.ready()`.
- d) New `integration_tests/test_report_scope_handlers.py` (`TestCase`, at least 4 tests): exactly one handler with kind `warehouse` is registered; a non-superuser assigned to one warehouse gets only that warehouse's rows from a warehouse-scoped entity (follow `integration_tests/test_reports_integration.py`); requesting another warehouse id gives 403; an entity with a made-up kind and a `scope_path` raises `ReportError` with status 403.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test integration_tests.test_report_scope_handlers --noinput`, one run of `.\venv\Scripts\python.exe manage.py test reports integration_tests --noinput`.

6. Output and stop condition:
- Commit with this message, without push:
refactor(reports): warehouse scope rules via a module scope handler
- Short English report: changes per item a to d, commands actually run with pass/fail counts, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 11 of 15 — Phase 4: one generic module loop in AuthGuard replaces the hardcoded warehouse and finance blocks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/core/auth/auth.guard.ts warehouse-front/src/app/core/modules/module-contract.ts warehouse-front/src/app/modules/warehouse/route-access.ts warehouse-front/src/app/modules/accounting/route-access.ts
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/auth/auth.guard.ts --absent "scopeKind === 'warehouse'" --absent "scopeKind === 'finance'" --absent "'/app/warehouse'" --absent "'/app/finance'" --absent "hasWarehouseAccess" --absent "hasPersonnelAccess" --absent "routeConfig?.path === 'warehouse'" --absent "routeConfig?.path === 'finance'"
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file warehouse-front/src/app/core/auth/route-access.characterization.spec.ts warehouse-front/src/app/core/auth/auth.guard.spec.ts warehouse-front/src/app/modules/common/components/login/login-destination.characterization.spec.ts
verify: python scripts/automation/verify_tools.py diff-free --base {base} --pattern "." --path warehouse-front/src/app/core/auth/route-access.characterization.spec.ts warehouse-front/src/app/core/auth/auth.guard.spec.ts
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(guard): one generic module loop in AuthGuard"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Every guard decision must stay the same. `route-access.characterization.spec.ts`, `auth.guard.spec.ts` and `login-destination.characterization.spec.ts` are the contract: do not edit them; they must pass.
- Change only the 4 files listed in the scope verify line. Do not change the company-documents logic in this session beyond moving it unchanged (session 12 handles it).
- Run every command in the foreground. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `### گام ۳`.
- `auth.guard.ts` `AuthGuard` has: a warehouse scope block (`isWarehouseScope`), a finance scope block (`isFinanceScope`, with the company-documents exception), a generic loop for other modules with routeAccess (session 1), and a page-permission loop whose fallback is `roleHome()` for warehouse pages and the other module's `defaultRoute` for other pages.
- Today's asymmetric rules that must survive: a module that is not installed redirects to the first other installed module with routeAccess, else `/app/launcher`; a user without access to a module's scope goes to another accessible module's `defaultRoute`, else `/login`; on a page of a module the user cannot access, warehouse pages go to `roleHome()` and finance pages go to the other module's `defaultRoute`.

3. Task:
- a) Add one optional field to `ModuleRouteAccess` in `module-contract.ts`: `deniedPageFallback?: 'roleHome' | 'otherModuleDefault'`; set `'roleHome'` in `modules/warehouse/route-access.ts` and `'otherModuleDefault'` in `modules/accounting/route-access.ts`.
- b) Replace the warehouse block, the finance block and both loops with one loop over all known module specs that have routeAccess (installed and not installed, so the not-installed redirect still works; find how the registry exposes them), detecting the module by `routePrefix` or `route.routeConfig?.path` equal to the prefix without its leading slash. Use `extensions.layoutNav.hasCompanyDocumentsArchive` to apply the company-documents exception only to the module that owns the archive, keeping today's checks exactly.
- c) No module name, route prefix or scope kind literal remains in `auth.guard.ts` except inside the company-documents expressions that session 12 replaces.

4. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/core/auth/*.spec.ts" --include "src/app/modules/common/components/login/*.spec.ts" --include "src/app/core/services/app-persona*.spec.ts"`.

5. Output and stop condition:
- Commit with this message, without push:
refactor(guard): one generic module loop in AuthGuard
- Short English report: the new loop, how each asymmetric rule is kept, the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 12 of 15 — Phase 4: the company documents route comes from the layoutNav extension of the module that owns the archive

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/core/modules/module-contract.ts warehouse-front/src/app/modules/accounting/module.ts warehouse-front/src/app/app.routes.ts warehouse-front/src/app/core/auth/auth.guard.ts warehouse-front/src/app/core/services/app-persona.service.ts warehouse-front/src/app/core/auth/company-documents-route.spec.ts
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/app.routes.ts --absent "app/finance/company-documents"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/auth/auth.guard.ts --absent "company-documents" --absent "'/documents'"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/services/app-persona.service.ts --absent "company-documents" --absent "'/documents'"
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/modules/accounting/module.ts --contains "companyDocumentsRoute: '/app/finance/company-documents'"
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/auth/company-documents-route.spec.ts --min-tests 4 --require "without the archive module"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(routes): company documents route from the layoutNav extension"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Every redirect and access decision stays the same in the full profile. Do not edit existing spec files.
- Change only the 6 files listed in the scope verify line.
- Run every command in the foreground. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `### گام ۳`.
- Hardcoded uses: `app.routes.ts` (the two root redirect functions and the legacy redirects for paths `company-documents` and `documents`), `auth.guard.ts` (`isCompanyDocsRoute`), `app-persona.service.ts` (`getDefaultRouteForRole` and `canAccessRoute`). The accounting module already declares `extensions.layoutNav.hasCompanyDocumentsArchive: true`; its route is `company-documents` under `/app/finance`, with a legacy alias `documents`.

3. Task:
- a) Add `companyDocumentsRoute?: string` to the `layoutNav` extension in `module-contract.ts`, and set `companyDocumentsRoute: '/app/finance/company-documents'` in `modules/accounting/module.ts`.
- b) Read the route from the installed module whose `layoutNav` has `hasCompanyDocumentsArchive` true, through the module registry, in all the places above. A URL counts as a company-documents URL when it starts with that route or with the same parent path plus `/documents`. The two legacy redirects use a function that returns the route without its leading slash, or `app/launcher` when no module owns the archive.
- c) New `core/auth/company-documents-route.spec.ts` (at least 4 tests, one name containing `without the archive module`): the root redirect sends a user with company-documents access and no module access to the archive route; the guard allows that user on the archive route; the legacy `documents` redirect resolves to the archive route; without the archive module installed the redirect goes to `app/launcher`.

4. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/core/**/*.spec.ts" --include "src/app/modules/common/components/login/*.spec.ts" --include "src/app/*.spec.ts"`.

5. Output and stop condition:
- Commit with this message, without push:
refactor(routes): company documents route from the layoutNav extension
- Short English report: each replaced use, the tests added, the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 13 of 15 — Phase 4: app switching in AppPersonaService uses module specs for warehouse and accounting like any other module

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow warehouse-front/src/app/core/services/app-persona.service.ts warehouse-front/src/app/core/modules/module-contract.ts warehouse-front/src/app/modules/warehouse/module.ts warehouse-front/src/app/modules/accounting/module.ts warehouse-front/src/app/modules/warehouse/route-access.ts warehouse-front/src/app/modules/accounting/route-access.ts warehouse-front/src/app/modules/warehouse/personas.ts warehouse-front/src/app/modules/accounting/personas.ts
verify: python scripts/automation/verify_tools.py text-check --file warehouse-front/src/app/core/services/app-persona.service.ts --absent "'/app/warehouse" --absent "'/app/finance" --absent "spec.code === 'accounting'"
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file warehouse-front/src/app/core/services/app-persona.characterization.spec.ts warehouse-front/src/app/core/services/app-persona.generic-module.spec.ts
verify: python scripts/automation/verify_tools.py diff-free --base {base} --pattern "." --path warehouse-front/src/app/core/services/app-persona.characterization.spec.ts warehouse-front/src/app/core/services/app-persona.generic-module.spec.ts
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(persona): app switching from module specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Behaviour must stay identical: `app-persona.characterization.spec.ts` (70 tests) and `app-persona.generic-module.spec.ts` are the contract; do not edit them; they must pass.
- Storage values stay as today: `active_app_module` is still `warehouse` or `personnel`, the token scope is still `warehouse` or `finance`, the WebSocket channel is still `warehouse`, `finance` or `operations`.
- Change only the files listed in the scope verify line.
- Run every command in the foreground. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `### گام ۳`.
- `core/services/app-persona.service.ts` has hardcoded warehouse/finance branches in `syncScopeFromUrl`, `sanitizeActiveRole`, `switchApp` (token scope, channel and default navigation), `getDefaultRouteForRole` and `canAccessRoute`, next to a generic path for other modules (`isGenericModuleApp`).
- Values already in the module contract: `routePrefix`, `defaultRoute`, `scopeKind` (equals the token scope and the channel), `routeAccess.loginActiveAppModule` (`warehouse` and `personnel`, the persona app code).

3. Task:
- a) Use the persona app code `routeAccess.loginActiveAppModule ?? spec.code`, the token scope and channel `spec.scopeKind`, and the prefix `spec.routePrefix` for warehouse and accounting through the same code path as other modules. Keep the `operations` shell handling as it is.
- b) Where a module-specific value has no contract field yet (for example the finance fallback role route `/app/finance/accountant-payroll` or the warehouse dashboard used by `switchApp`), add an optional field to the module contract, personas or route access, and set it in the module that owns the value.
- c) Remove `isGenericModuleApp`'s hardcoded list only if the characterization specs stay green; otherwise keep it and say why in the report.

4. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/core/services/app-persona*.spec.ts" --include "src/app/core/auth/*.spec.ts" --include "src/app/modules/common/components/login/*.spec.ts"`.

5. Output and stop condition:
- Commit with this message, without push:
refactor(persona): app switching from module specs
- Short English report: each replaced branch, the fields added, the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 14 of 15 — Phase 4: guardians 29 and 57 count module-name literals in the core with the no-increase rule

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow scripts/e2e/guardian_modularization.py scripts/e2e/modularization_baseline.json scripts/e2e/guardian_57_front_module_fence.py scripts/e2e/front_fence_baseline.json
verify: python scripts/automation/verify_tools.py text-check --file scripts/e2e/modularization_baseline.json --contains "core_module_literals"
verify: python scripts/automation/verify_tools.py text-check --file scripts/e2e/guardian_modularization.py --contains "core_module_literals" --contains "self-test"
verify: python scripts/automation/verify_tools.py text-check --file scripts/e2e/guardian_57_front_module_fence.py --contains "core_module_literals" --contains "self-test"
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_modularization.py --self-test
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/e2e/guardian_57_front_module_fence.py --self-test
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(guardians): module-name literal counters in core"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- This session changes only guardian scripts and their baseline files. Do not change application code. Do not lower any existing counter or relax any existing rule.
- Change only files listed in the scope verify line (use only the baseline file each guardian already uses).
- Run every command in the foreground. Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase4/modular_architecture_phase4_plan.md`, heading `### گام ۵`.
- Guardian 29 (`scripts/e2e/guardian_modularization.py`) already counts `core_module_app_refs` in `warehouse-backend/core` (skipping tests and migrations) and fails when a counter rises above `modularization_baseline.json`. Guardian 57 (`scripts/e2e/guardian_57_front_module_fence.py`) does the same for the frontend core and shared code.

3. Definitions: a "module-name literal" is a quoted string literal exactly equal to `warehouse`, `finance`, `personnel` or `accounting` (single or double quotes). Comment lines and docstrings do not count.

4. Task:
- a) Guardian 29: add counter `core_module_literals` = number of module-name literals in `.py` files under `warehouse-backend/core`, skipping tests and migrations (use `ast` string constants, so comments and docstrings are skipped). Print each finding as `file:line`.
- b) Guardian 57: add counter `core_module_literals` for `.ts` files under `warehouse-front/src/app/core` and `warehouse-front/src/app/shared`, skipping `*.spec.ts`, comment lines and import lines.
- c) Record the current values in each guardian's baseline with its existing update mechanism; the rule is "no increase".
- d) Add `--self-test` to both guardians: it runs the counter on a temporary fixture with one extra literal and confirms the guardian would fail, then on the unchanged fixture and confirms it would pass; it exits 0 only when both hold and never writes the real baseline.

5. Tool policy: each guardian at most four runs; the baseline update at most once per guardian.

6. Output and stop condition:
- Commit with this message, without push:
test(guardians): module-name literal counters in core
- Short English report: the recorded value of each counter, the self-test result. End the turn after the commit and report.

===

[DONE] Session 15 of 15 — Release phase 4 on the local app environment: backup, migration check, patched frontend build; the runner restarts Daphne and the GDrive worker and runs the health checks

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

2. Context: sessions 1 to 14 of phase 4 changed backend and frontend code, tests and guardian scripts, and added no migration. Your terminal may be PowerShell; if so, set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order:
- a) Backup. In `warehouse-backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app phase 4'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0. Do not continue without a successful backup.
- b) Migration check. `.\venv\Scripts\python.exe manage.py showmigrations --plan` must show no `[ ]` line. If any `[ ]` line appears, stop and report it; do not migrate.
- c) Frontend build. In `warehouse-front`, run `npx ng build --delete-output-path=false` in the foreground and wait for it to finish, then run `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.

4. Tool policy: only the commands above and `git status --short`. Run the build at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the backup filename and size, the `showmigrations` result, the build result (errors and warnings count) and the patch script line. Write the report only after the build and the patch have finished. No commit. End the turn after the report.
