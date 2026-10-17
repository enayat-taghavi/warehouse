[DONE] Session 1 of 9 — Phase 3: registry helpers for JWT token scopes and WebSocket app-scope normalization (behavior unchanged)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; c=pathlib.Path('warehouse-backend/core'); s=(c/'accounts/serializers.py').read_text(encoding='utf-8'); av=(c/'accounts/views_domains/auth_views.py').read_text(encoding='utf-8'); nc=(c/'notifications/consumers.py').read_text(encoding='utf-8'); rg=(c/'platform_core/registry.py').read_text(encoding='utf-8'); q=chr(39); bad={'ser_hardcoded':'get_user_valid_roles_for_app(user, '+q+'personnel'+q in s,'auth_hardcoded':'get_user_valid_roles_for_app(user, '+q+'personnel'+q in av,'ws_hardcoded':q+'personnel'+q in nc,'helpers_missing':not all(f in rg for f in ('def build_user_token_scopes','def resolve_default_active_app','def normalize_ws_app_scope')),'ser_not_using_helper':s.count('build_user_token_scopes(user)')<2 or s.count('resolve_default_active_app(')<2,'auth_not_using_helper':'build_user_token_scopes(user)' not in av,'ws_not_using_helper':nc.count('normalize_ws_app_scope(')<3}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import subprocess,sys; ok={'warehouse-backend/core/platform_core/registry.py','warehouse-backend/core/platform_core/tests.py','warehouse-backend/core/accounts/serializers.py','warehouse-backend/core/accounts/views_domains/auth_views.py','warehouse-backend/core/notifications/consumers.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 770
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(core): build token scopes and websocket app groups from the module registry"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Behavior must stay identical: the token `scopes` dict keeps exactly the keys `finance` and `warehouse` with the same role lists, `active_app` keeps the same priority, and the WebSocket consumer joins exactly the same groups as today. In particular `app=operations` must still join no app group (`app_group_name` stays None), because the operations cockpit relies on receiving every event.
- Change only: `warehouse-backend/core/platform_core/registry.py`, `warehouse-backend/core/platform_core/tests.py`, `warehouse-backend/core/accounts/serializers.py`, `warehouse-backend/core/accounts/views_domains/auth_views.py`, `warehouse-backend/core/notifications/consumers.py`. Do not touch `config/asgi.py`.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan: `Documents/Deep_Modularization_Phase3/modular_architecture_phase3_plan.md`, heading `### گام ۱`.
- `registry.py` already has the compatibility bridge `app_code_to_module`, `module_allowed_app_code` and `_MODULE_TO_ALLOWED_APP` (accounting appears as `finance` in tokens).
- Hardcoded scope dicts today: `CustomTokenObtainPairSerializer.get_token` and `CustomTokenObtainPairSerializer.validate` in `serializers.py`, and `SwitchAppScopeView` in `auth_views.py`. `consumers.py` checks `in ('warehouse', 'finance', 'personnel')` in `connect` and in the `switch_app` branch of `receive`, and maps `personnel` to `finance` in `send_notification`.

3. Definitions: "catalog modules" means the keys of `MODULE_CATALOG` from `platform_core.module_catalog` (all known modules, installed or not).

4. Task:
- a) In `registry.py`, next to the compatibility bridge, add:
  - `build_user_token_scopes(user) -> dict[str, list[str]]`: for each catalog module code, `scopes[module_allowed_app_code(code)] = get_user_valid_roles_for_app(user, code)` (import `get_user_valid_roles_for_app` inside the function from `accounts.middleware`).
  - `resolve_default_active_app(allowed_apps) -> str`: start with `allowed = set(allowed_apps or ())`; return `'finance'` if `'finance'` is allowed and `'warehouse'` is not; else `'warehouse'` if `'warehouse'` is allowed; else `'finance'`.
  - `normalize_ws_app_scope(code) -> str | None`: return None for a falsy value; `module = app_code_to_module(code)`; return `module_allowed_app_code(module)` if `module` else None. No `.strip()` or `.lower()`.
- b) Use `build_user_token_scopes(user)` and `resolve_default_active_app(allowed_apps)` in `get_token` and `validate`, and `build_user_token_scopes(user)` in `SwitchAppScopeView` (keep `refresh['active_app'] = target_app`).
- c) In `consumers.py`, use `normalize_ws_app_scope(...)` in `connect`, in `switch_app`, and in `send_notification` as `normalize_ws_app_scope(event_app) or event_app`. Keep everything else in those methods unchanged.
- d) Tests in `platform_core/tests.py` (plain `SimpleTestCase` or `TestCase`): `normalize_ws_app_scope` for `'warehouse'`, `'finance'`, `'personnel'`, `'accounting'`, `'operations'`, `None`, `'Warehouse'`, `'unknown'` (expected `'warehouse'`, `'finance'`, `'finance'`, `'finance'`, None, None, None, None); `resolve_default_active_app` for `['finance']`, `['warehouse']`, `['warehouse','finance']`, `[]`; `build_user_token_scopes` for a normal user returns exactly the keys `{'finance','warehouse'}` and values equal to `get_user_valid_roles_for_app(user, 'personnel')` and `get_user_valid_roles_for_app(user, 'warehouse')`.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test platform_core accounts notifications --noinput`, and `python scripts/e2e/guardian_modularization.py` at most twice. If a command fails, read the output and change approach; do not repeat it unchanged.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(core): build token scopes and websocket app groups from the module registry
- Short English report: changed files, tests added, commands actually run with pass/fail counts, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 2 of 9 — Phase 3: characterization test for SoD page-route and action-code inference (pure refactor)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys,re; p=pathlib.Path('warehouse-backend/core/accounts/permissions.py').read_text(encoding='utf-8'); t=pathlib.Path('warehouse-backend/integration_tests/test_sod_context_resolution.py'); tt=t.read_text(encoding='utf-8') if t.is_file() else ''; hp=p[p.find('class SoDPolicyPermission'):]; ok={'func':'def resolve_sod_context(request, view)' in p,'used':'resolve_sod_context(request, view)' in hp,'inline_removed':'monthly-payroll' not in hp,'test_file':t.is_file(),'cases':len(re.findall(r'expected_route|assertEqual', tt))>=14}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; ok={'warehouse-backend/core/accounts/permissions.py','warehouse-backend/integration_tests/test_sod_context_resolution.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts personnel --known scripts/automation/known_backend_failures.txt --min-tests 300
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(sod): extract resolve_sod_context and pin its behavior"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Pure refactor: the resolved `(page_route, action_code)` for every request must stay exactly as today. Do not reorder, merge or simplify any condition.
- Change only `warehouse-backend/core/accounts/permissions.py` and the new file `warehouse-backend/integration_tests/test_sod_context_resolution.py`.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan heading `### گام ۲`. In `SoDPolicyPermission.has_permission`, the block from `page_route = getattr(view, 'sod_page_route', None)` to the final `action_code = action_name or method.lower()` infers the page route from `request.path` (with the `'/attendance'` default) and then the action code, using the final page route.

3. Definitions: "characterization test" means a test whose expected values are what the current code returns, written before the logic is moved, so a later move can prove it changed nothing.

4. Task:
- a) Move that block verbatim into a module-level function `resolve_sod_context(request, view) -> tuple[str, str]` placed above `SoDPolicyPermission`, and call `page_route, action_code = resolve_sod_context(request, view)` from `has_permission`. Nothing else in `has_permission` changes.
- b) Create `integration_tests/test_sod_context_resolution.py` with a `SimpleTestCase` and a table of at least 14 cases, each with `path`, `method`, `data`, `action`, optional view attributes, `expected_route` and `expected_action`, checked with `assertEqual`. Requests are `types.SimpleNamespace(path=..., method=..., data=...)`; views are `types.SimpleNamespace(action=...)`. Compute every expected value by reading the current code. Cover: `attendance` + `create`; `attendance` + `lock_period`; a path without any keyword + `create` (fallback route `/attendance`, action `create_daily_attendance_entry`); a path without any keyword + `approve_period`; `profiles` + `approve_manager`; a path containing both `profiles` and `finance`; `monthly-payroll` + `disburse_period`; `treasury` + `list`; `manager` + `action=None` with GET; a path containing both `customs` and `manager`; `customs` + `create`; PATCH with `data={'base_wage': 1}` on a path without keywords; an uppercase path such as `/API/Personnel/Attendance/`; a view with `sod_page_route='/x'` and `sod_action_code='y'`.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test integration_tests.test_sod_context_resolution --noinput` and one run of `.\venv\Scripts\python.exe manage.py test integration_tests accounts --noinput`. If a case fails, fix the expected value only if your reading of the current code was wrong; never change the logic to fit a test.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
test(sod): extract resolve_sod_context and pin its behavior
- Short English report: the case table, commands actually run with pass/fail counts, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 3 of 9 — Phase 3: move module permission classes and SoD inference rules out of core/accounts/permissions.py

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys,re; names={'CanApproveDocuments','CanApproveFeeds','CanFinalizeInventory','CanManageItemPhotos','CanApprovePersonnelManager','CanApprovePersonnelFinance','CanApproveFleetManager','CanApproveFleetFinance','CanApprovePersonnelSupervisor','CanApproveFleetSupervisor','CanAuthorizePaymentManager','CanDisburseTreasury','CanViewTreasury'}; rx=re.compile(r'from\s+accounts\.permissions\s+import\s+(\([^)]*\)|[^\n]*)'); files=[f for d in ('core','modules','integration_tests') for f in pathlib.Path('warehouse-backend',d).rglob('*.py')]; imp=sorted({str(f) for f in files for m in rx.finditer(f.read_text(encoding='utf-8',errors='replace')) if set(re.findall(r'\w+', m.group(1))) & names}); core=pathlib.Path('warehouse-backend/core/accounts/permissions.py').read_text(encoding='utf-8'); left=sorted(n for n in names if 'class '+n in core); lit=[w for w in ('monthly-payroll','treasury-cartable','manager-approvals','/customs','wage','approve_attendance_period','disburse_treasury_payment') if w in core]; mods=[w for w in ('import personnel','from personnel','import inventory','from inventory','import warehouses','from warehouses') if w in core]; print('importers_of_moved_names',imp,'classes_left',left,'literals_left',lit,'module_imports',mods); sys.exit(1 if imp or left or lit or mods else 0)"
verify: python -c "import pathlib,sys; p=pathlib.Path('warehouse-backend'); inv=p/'modules/warehouse/inventory/permissions.py'; acc=(p/'modules/accounting/personnel/permissions.py').read_text(encoding='utf-8'); core=(p/'core/accounts/permissions.py').read_text(encoding='utf-8'); ok={'inv_file':inv.is_file() and 'class CanManageItemPhotos' in inv.read_text(encoding='utf-8'),'acc_classes':'class CanApprovePersonnelManager' in acc and 'class CanViewTreasury' in acc,'route_rules':'sod_route_rules' in core and 'sod_action_resolvers' in core,'no_pep562':'def __getattr__' not in core}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; r=subprocess.run(['git','diff','--quiet','{base}','HEAD','--','warehouse-backend/integration_tests/test_sod_context_resolution.py']); print('sod test unchanged:',r.returncode==0); sys.exit(r.returncode)"
verify: python -c "import subprocess,sys; ok={'warehouse-backend/core/accounts/permissions.py','warehouse-backend/modules/accounting/personnel/permissions.py','warehouse-backend/modules/accounting/personnel/sod_rules.py','warehouse-backend/modules/accounting/personnel/apps.py','warehouse-backend/modules/accounting/personnel/cartable_views.py','warehouse-backend/modules/accounting/personnel/phase_guardian_approval.py','warehouse-backend/modules/accounting/personnel/views_domains/hr_views.py','warehouse-backend/modules/accounting/personnel/views_domains/fleet_views.py','warehouse-backend/modules/warehouse/inventory/permissions.py','warehouse-backend/modules/warehouse/inventory/views_photos.py','warehouse-backend/modules/warehouse/inventory/views_domains/item_views.py','warehouse-backend/modules/warehouse/warehouses/sod_rules.py','warehouse-backend/modules/warehouse/warehouses/apps.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 770
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(permissions): move module permission classes and SoD inference rules into modules"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Behavior must stay identical. `integration_tests/test_sod_context_resolution.py` must not change and must still pass.
- `core/accounts/permissions.py` must not import from `personnel`, `inventory` or `warehouses`, and must not define a module-level `__getattr__`.
- Change only the 13 files listed in the scope verify line of this session.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan heading `### گام ۳`. The function `resolve_sod_context` was added in the previous session.
- The only importers of the moved classes (6 files): `personnel/cartable_views.py`, `personnel/phase_guardian_approval.py` (inside a function), `personnel/views_domains/hr_views.py` (multi-line import at the top), `personnel/views_domains/fleet_views.py` (multi-line import at the top), `inventory/views_photos.py` (module level) and `inventory/views_domains/item_views.py` (inside a method).
- `personnel/permissions.py` already exists (it re-exports `companies.permissions` helpers). `inventory/permissions.py` does not exist.
- Both apps already register SoD rules in `ready()` with `contribute('sod_rules', rule)`; follow that style.

3. Definitions:
- "route rule" is a tuple `(priority: int, keywords: tuple[str, ...], route: str)`. A rule matches when any keyword is a substring of `request.path.lower()`.
- "action resolver" is a callable `(request, view, action_name, method, page_route) -> str | None`, where `method` is `request.method.upper()` and `page_route` is the final page route.

4. Task:
- a) Move the 9 accounting classes (`CanApprovePersonnelManager`, `CanApprovePersonnelFinance`, `CanApproveFleetManager`, `CanApproveFleetFinance`, `CanApprovePersonnelSupervisor`, `CanApproveFleetSupervisor`, `CanAuthorizePaymentManager`, `CanDisburseTreasury`, `CanViewTreasury`) verbatim to the end of `personnel/permissions.py`, and the 4 warehouse classes (`CanApproveDocuments`, `CanApproveFeeds`, `CanFinalizeInventory`, `CanManageItemPhotos`) verbatim to a new `inventory/permissions.py`. Update the 6 importers to import from `personnel.permissions` or `inventory.permissions`.
- b) Rewrite `resolve_sod_context` in core: keep the `sod_page_route` and `sod_action_code` view attributes first. Page route: sort `contributions('sod_route_rules')` by priority and take the route of the first matching rule; if none matches, use `'/attendance'`. Action code: call each of `contributions('sod_action_resolvers')` in order and take the first non-None result; if none, `action_name or method.lower()`.
- c) In `personnel/sod_rules.py`, define and in `PersonnelConfig.ready()` register the route rules `(10, ('attendance',), '/attendance')`, `(20, ('profiles',), '/profiles')`, `(30, ('finance', 'monthly-payroll'), '/finance-cartable')`, `(40, ('treasury',), '/treasury-cartable')`, `(50, ('manager',), '/manager-approvals')` and one action resolver containing today's five action rules in the same order. In `warehouses/sod_rules.py`, define and in `WarehousesConfig.ready()` register `(60, ('customs',), '/customs')`. Register outside any `try` block.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test integration_tests accounts --noinput` and one run of `.\venv\Scripts\python.exe manage.py test personnel inventory warehouses --noinput`; `python scripts/e2e/guardian_modularization.py` at most twice. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the allowed files, and `test_sod_context_resolution.py` is unchanged.

7. Output and stop condition:
- Commit with this message, without push:
refactor(permissions): move module permission classes and SoD inference rules into modules
- Short English report: moved classes, updated importers, registered rules, commands actually run with pass/fail counts, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 4 of 9 — Phase 3: company delete blockers, org-structure write permissions and UserViewSet module queries via registry contributions

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; c=pathlib.Path('warehouse-backend/core'); cv=(c/'companies/views.py').read_text(encoding='utf-8'); cp=(c/'companies/permissions.py').read_text(encoding='utf-8'); uv=(c/'accounts/views_domains/user_views.py').read_text(encoding='utf-8'); q=chr(39); bad={'blockers_hardcoded':'personnel_profiles' in cv or 'monthly_work_periods' in cv or q+'warehouses'+q in cv,'perm_hardcoded':'perm_approve_personnel_manager' in cp,'uv_is_installed':'is_installed(' in uv,'uv_section_q':'section_assignments' in uv,'no_contrib':'company_delete_blockers' not in cv or 'org_structure_write_perms' not in cp or 'company_member_q_builders' not in uv}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import ast,pathlib,sys; pts=('company_delete_blockers','org_structure_write_perms','company_member_q_builders'); fs=[pathlib.Path('warehouse-backend/modules/accounting/personnel/apps.py'),pathlib.Path('warehouse-backend/modules/warehouse/warehouses/apps.py')]; bad=[(f.name,n.lineno) for f in fs for t in ast.walk(ast.parse(f.read_text(encoding='utf-8'))) if isinstance(t,ast.Try) for n in ast.walk(t) if isinstance(n,ast.Call) and getattr(n.func,'id','')=='contribute' and n.args and isinstance(n.args[0],ast.Constant) and n.args[0].value in pts]; print('contribute inside try:',bad); sys.exit(1 if bad else 0)"
verify: python -c "import pathlib,sys; t=pathlib.Path('warehouse-backend/integration_tests/test_company_extension_points.py'); s=t.read_text(encoding='utf-8') if t.is_file() else ''; ok={'file':t.is_file(),'blockers':'company_delete_blockers' in s,'delete_400':'400' in s,'q_builder':'section' in s}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; ok={'warehouse-backend/core/companies/views.py','warehouse-backend/core/companies/permissions.py','warehouse-backend/core/accounts/views_domains/user_views.py','warehouse-backend/modules/warehouse/warehouses/apps.py','warehouse-backend/modules/warehouse/warehouses/user_extension.py','warehouse-backend/modules/accounting/personnel/apps.py','warehouse-backend/modules/accounting/personnel/company_access.py','warehouse-backend/integration_tests/test_company_extension_points.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts warehouses inventory reports platform_core personnel companies communications settings_core notifications common --known scripts/automation/known_backend_failures.txt --min-tests 770
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_31_install_profiles.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(core): company delete blockers and user directory queries via registry contributions"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- No data may be lost: a company that has any of the six related records must still be impossible to delete, with the same Persian message as today. Register these contributions outside any `try` block, so a registration failure fails loudly instead of silently removing a blocker.
- Tenant isolation: the org-admin user directory must return exactly the same users as today.
- Change only the 8 files listed in the scope verify line of this session.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- Plan heading `### گام ۴`.
- `core/companies/views.py` has `COMPANY_DELETE_BLOCKERS` (6 tuples) used in `perform_destroy` with `hasattr` and `.exists()`.
- `core/companies/permissions.py` `has_structure_write_permission` has a hardcoded list including `'accounts.perm_approve_personnel_manager'`.
- `core/accounts/views_domains/user_views.py` uses `apps.is_installed('warehouses')` in `get_queryset` (prefetch `assigned_warehouses`) and `apps.is_installed('personnel')` in `_org_admin_directory_queryset` (section-assignment `Q`).
- `warehouses/user_extension.py` already registers `WarehouseUserExtension()` with `contribute('user_extensions', ...)`.

3. Definitions: "blocker" is a tuple `(order: int, related_name: str, message: str)`.

4. Task:
- a) Replace `COMPANY_DELETE_BLOCKERS` with `contributions('company_delete_blockers')` sorted by `order`, keeping the `hasattr` and `.exists()` logic. Register in `PersonnelConfig.ready()`: `(10,'projects',...)`, `(30,'personnel_profiles',...)`, `(40,'monthly_work_periods',...)`, `(50,'counterparties',...)`, `(60,'fiscal_periods',...)`; and in `WarehousesConfig.ready()`: `(20,'warehouses',...)`. Copy each Persian message exactly from the current tuple.
- b) In `has_structure_write_permission`, remove `'accounts.perm_approve_personnel_manager'` from the core list and add `*contributions('org_structure_write_perms')`; register that permission string in `PersonnelConfig.ready()`.
- c) In `get_queryset`, extend `prefetch_items` with `getattr(ext, 'user_prefetch_related', ())` for each `contributions('user_extensions')`, keeping the order `groups__customrole`, `user_permissions`, module items, `company_accesses__company`; add `user_prefetch_related = ('assigned_warehouses',)` to `WarehouseUserExtension`.
- d) In `_org_admin_directory_queryset`, OR in the result of each `contributions('company_member_q_builders')` builder called with `allowed_cids` (skip None). In `personnel/company_access.py`, add `build_section_member_q(allowed_cids)` that returns today's `Q(section_assignments__is_active=True, section_assignments__section__project__company_id__in=allowed_cids)`, and register it in `PersonnelConfig.ready()`.
- e) New `integration_tests/test_company_extension_points.py` (`TestCase`): the sorted `company_delete_blockers` related names equal `['projects','warehouses','personnel_profiles','monthly_work_periods','counterparties','fiscal_periods']`; a superuser DELETE on a company that has a warehouse returns 400 and the company still exists; the same for a company that has a project; a user with only `accounts.perm_approve_personnel_manager` passes `has_structure_write_permission`; in the org-admin directory, an active section member of a project of an allowed company is listed and a user of another company is not.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test integration_tests.test_company_extension_points --noinput`, one run of `.\venv\Scripts\python.exe manage.py test integration_tests companies accounts --noinput`, and `python scripts/e2e/guardian_modularization.py` at most twice. If an existing test fails, report it; do not weaken any check.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(core): company delete blockers and user directory queries via registry contributions
- Short English report: each contribution point and where it is registered, tests added, commands actually run with pass/fail counts, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 5 of 9 — Phase 3: company sub-resource and Google Drive endpoints from the accounting module extension

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); files=[app/'core/api/company-api.service.ts',app/'modules/common/components/operations/companies/companies.ts',app/'modules/common/components/operations/companies/company-gdrive-tab/company-gdrive-tab.ts',app/'modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts']; bad={f.name:('/personnel/' in f.read_text(encoding='utf-8')) for f in files}; api=files[0].read_text(encoding='utf-8'); bad['fake_org_fallback']='/org/company-' in api; bad['no_gdrive_helper']='getCompanyGdriveUrl(' not in api; bad['no_matcher']='matchesCompanyUrl(' not in api; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import subprocess,sys; p='warehouse-front/src/app/'; ok={p+'core/modules/module-contract.ts',p+'modules/accounting/module.ts',p+'core/api/company-api.service.ts',p+'modules/common/components/operations/companies/companies.ts',p+'modules/common/components/operations/companies/company-gdrive-tab/company-gdrive-tab.ts',p+'modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts',p+'modules/common/components/operations/companies/company-api-endpoints.spec.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/modules/common/components/operations/companies/*.spec.ts" --include "src/app/modules/common/components/settings/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(company-api): company sub-resource and gdrive endpoints from the accounting module extension"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7 and 10 apply.
- Every URL sent to the server must stay byte-for-byte the same as today when the accounting module is installed. Do not invent fallback endpoints: `/org/` has only `companies` and `user-company-access` on the backend.
- Change only the 7 files listed in the scope verify line of this session. No `.html` template changes.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan heading `### گام ۵`.
- `company-api.service.ts` already resolves `companiesEndpoint` and `accessEndpoint` from `this.moduleRegistry.getExtensions('companyApiEndpoints')[0]?.extension` with `/org/...` fallbacks (those two fallbacks are real and stay). `documentsEndpoint`, `bankAccountsEndpoint`, `boardMembersEndpoint` (top of the class) and `fiscalPeriodsEndpoint` (above `getFiscalPeriods`) are hardcoded `/personnel/...`.
- `companies.ts` (subscription to `offlineSync.liveDataUpdates$`) matches URLs with `url.includes('/personnel/...')`. The accounting tabs are shown only when `isAccountingInstalled` is true.
- `company-gdrive-tab.ts` has 9 hardcoded `${environment.apiUrl}/personnel/companies/${cid}/gdrive...` URLs; `settings-backup-tab.ts` has one in `toggleCompanyBackupSync`.

3. Definitions: "missing extension" means `getExtensions('companyApiEndpoints')` returns no entry or the needed field is empty.

4. Task:
- a) In `module-contract.ts`, add optional `documentsEndpoint`, `bankAccountsEndpoint`, `boardMembersEndpoint`, `fiscalPeriodsEndpoint` (strings) and `companyGdriveBaseEndpoint?: (companyId: number | string) => string` to `companyApiEndpoints`. In `accounting/module.ts`, set them to `'/personnel/company-documents'`, `'/personnel/company-bank-accounts'`, `'/personnel/company-board-members'`, `'/personnel/company-fiscal-periods'` and `(cid) => '/personnel/companies/' + cid + '/gdrive'`.
- b) In `company-api.service.ts`, resolve those four endpoints from the extension. When the extension is missing, each public method that needs one returns `throwError(() => new Error('accounting-module-not-installed'))` and sends no request. Add `getCompanyGdriveUrl(companyId: number | string, subPath = ''): string | null` (null when missing) and `matchesCompanyUrl(url: string, kind: 'companies' | 'bankAccounts' | 'boardMembers' | 'documents'): boolean`, where `'companies'` also accepts `/org/companies/` as today.
- c) In `companies.ts`, replace the four `url.includes('/personnel/...')` checks with `this.companyApi.matchesCompanyUrl(url, ...)`; keep the branch order and bodies.
- d) In `company-gdrive-tab.ts` and `settings-backup-tab.ts`, inject `CompanyApiService` where missing and build every gdrive URL with `getCompanyGdriveUrl(cid, '<same subpath and query as today>')`; if it returns null, show the existing error handling path for that call and send nothing.
- e) In `company-api-endpoints.spec.ts`, add tests: with the accounting extension the four endpoints and `getCompanyGdriveUrl(5, '/queue/')` equal today's URLs; without it the methods error and no HTTP request is issued (the existing spec mocks `HttpClient` with `vi.fn()`; assert with `expect(http.get).not.toHaveBeenCalled()` and the same for the other verbs); `matchesCompanyUrl` for each kind.

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent` and one run of `python scripts/e2e/guardian_57_front_module_fence.py` from the repo root. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(company-api): company sub-resource and gdrive endpoints from the accounting module extension
- Short English report: replaced call sites with their old and new URL expressions, tests added, commands actually run with results, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 6 of 9 — Phase 3: offline queue headers, deep-sync probe and tab scope detection from module sync config

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); qr=(app/'core/services/offline/offline-queue-runner.ts').read_text(encoding='utf-8'); os_=(app/'core/services/offline-sync.service.ts').read_text(encoding='utf-8'); st=(app/'core/services/session-tab.service.ts').read_text(encoding='utf-8'); q=chr(39); ok={'qr_registry':'getExtensions('+q+'syncConfig'+q+')' in qr,'qr_fallback_kept':'wh_access_token_' in qr and q+'counter'+q in qr,'probe_clean':'/personnel/' not in os_ and '/inventory/' not in os_,'st_registry':'getInstalledModules()' in st and 'launcherTile' in st,'st_no_finance_path':'/app/finance' not in st and '/app/warehouse' not in st,'st_spec':(app/'core/services/session-tab.service.spec.ts').is_file()}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; r=subprocess.run(['git','diff','--quiet','{base}','HEAD','--','warehouse-front/src/app/core/services/offline-db.ts']); print('offline-db unchanged:',r.returncode==0); sys.exit(r.returncode)"
verify: python -c "import subprocess,sys; p='warehouse-front/src/app/'; ok={p+'core/modules/module-contract.ts',p+'modules/warehouse/module.ts',p+'modules/accounting/module.ts',p+'core/services/offline/offline-queue-runner.ts',p+'core/services/offline/offline-queue-runner.spec.ts',p+'core/services/offline-sync.service.ts',p+'core/services/session-tab.service.ts',p+'core/services/session-tab.service.spec.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_34_offline_continuity.py
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/core/services/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(offline-core): offline headers, deep-sync probe and tab scope from module sync config"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- No data may be lost. Queued offline records must be replayed with exactly the same headers as today, including when a module is missing from the cached installed list, so keep today's values as fallbacks. Never delete, clear or skip queue records, cache entries or IndexedDB stores. Do not modify `core/services/offline-db.ts`.
- Change only the 8 files listed in the scope verify line of this session.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan heading `### گام ۶`.
- `buildScopedHeaders(appScope)` in `offline-queue-runner.ts` hardcodes the token key suffix, default role and `X-Active-App` per scope.
- `offline-sync.service.ts` (deep update, around line 625) builds a probe URL with hardcoded `/personnel/sync/pull/?project_id=` and `/inventory/sync/pull/?warehouse_id=`. `sync-pull.service.ts` already finds `syncConfig` with `getModuleRegistry().getExtensions('syncConfig').find(e => e.extension.scopeKind === scopeKind)`; reuse that lookup pattern.
- `syncConfig` today: warehouse `{scopeKind:'warehouse', pullEndpoint:'/inventory/sync/pull/', scopeParamKey:'warehouse_id'}`, accounting `{scopeKind:'finance', pullEndpoint:'/personnel/sync/pull/', scopeParamKey:'project_id'}`. `launcherTile.appKey` is `'warehouse'` and `'personnel'`.
- `SessionTabService.getActiveApp()` checks `path.includes('/app/operations')`, `'/app/warehouse'` and `'/app/finance'`.

3. Definitions: "same URL" means the probe URL string is identical to today's for both scopes, including the trailing slash and the `&limit=1` query.

4. Task:
- a) Add optional `activeAppHeader`, `defaultOfflineRole` and `tokenScopeKey` to `syncConfig` in `module-contract.ts`; set them in `warehouse/module.ts` (`'warehouse'`, `'counter'`, `'warehouse'`) and `accounting/module.ts` (`'personnel'`, `'operator'`, `'finance'`).
- b) In `buildScopedHeaders`, read those three values from the matching `syncConfig`, falling back to today's expressions when absent.
- c) In `offline-sync.service.ts`, build the probe URL as `${environment.apiUrl}${syncConfig.pullEndpoint}?${syncConfig.scopeParamKey}=${testId}&limit=1`; if no `syncConfig` matches the scope, return `[]` before the probe. Do not change the error handling around the probe.
- d) In `getActiveApp()`, keep the `/app/operations` check first, then loop over `getModuleRegistry().getInstalledModules()` and, when `path.includes(mod.routePrefix)` and `mod.extensions?.launcherTile?.appKey` exists, call `setActiveApp(appKey)` and return it. Keep the session-storage and local-storage fallbacks.
- e) Tests: in `offline-queue-runner.spec.ts`, assert the exact headers for `'warehouse'` and `'finance'` with the real registry and with a registry whose `getExtensions` returns `[]`. New `session-tab.service.spec.ts`: `/app/warehouse/counter` gives `'warehouse'`, `/app/finance/x` gives `'personnel'`, `/app/operations/cockpit` gives `'operations'`.

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, one run of `python scripts/e2e/guardian_34_offline_continuity.py` and one of `python scripts/e2e/guardian_57_front_module_fence.py`. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(offline-core): offline headers, deep-sync probe and tab scope from module sync config
- Short English report: before and after expressions for each header and URL, tests added, commands actually run with results, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 7 of 9 — Phase 3: accounting notification navigation moved out of the shared NotificationCenterComponent

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); nc=(app/'shared/components/notification-center/notification-center.component.ts').read_text(encoding='utf-8'); nh=app/'modules/accounting/notification-handlers.ts'; sp=app/'modules/accounting/notification-handlers.spec.ts'; am=(app/'modules/accounting/module.ts').read_text(encoding='utf-8'); bad={'personnel_url_in_nc':'/personnel/' in nc,'finance_route_in_nc':'/app/finance' in nc,'missing_handler_file':not nh.is_file(),'missing_spec':not sp.is_file(),'not_registered':'notificationHandlers' not in am,'nc_not_delegating':'notificationHandlers' not in nc}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import subprocess,sys; p='warehouse-front/src/app/'; ok={p+'core/modules/module-contract.ts',p+'modules/accounting/notification-handlers.ts',p+'modules/accounting/notification-handlers.spec.ts',p+'modules/accounting/module.ts',p+'shared/components/notification-center/notification-center.component.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer|app-employee-new-vehicle"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_55_clickable_ergonomics.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/modules/accounting/notification-handlers.spec.ts" --include "src/app/modules/common/components/layout/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(notifications): accounting notification navigation via module notificationHandlers"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Navigation must stay identical: same target route, same query params, same HTTP lookups with the `SKIP_GLOBAL_ERROR_TOAST` header, same fallbacks on error, for every permission combination.
- Change only the 5 files listed in the scope verify line of this session. The component template is inline in the `.ts` file; do not change it.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan heading `### گام ۷`.
- `NotificationCenterComponent.onNotificationClick` handles `item.url`, then `notification_type === 'fleet_change_request'`, `target_model === 'VehicleDriverProfile'` and `target_model === 'PersonnelProfile'`, using the private helpers `userPerms`, `navigateToFleet`, `navigateByRoleForFleet`, `navigateToPersonnel` and `navigateByRole`.

3. Definitions: "handler" is `{ canHandle: (item) => boolean; navigate: (ctx: NotificationNavigationContext) => void }`, where the context is `{ item, http: HttpClient, router: Router, userPerms: string[], isSuperuser: boolean }`.

4. Task:
- a) Add `NotificationNavigationContext` and `notificationHandlers?: Array<handler>` to `ExtensionMap` in `module-contract.ts`.
- b) Create `modules/accounting/notification-handlers.ts` exporting `ACCOUNTING_NOTIFICATION_HANDLERS` (three handlers in today's order). Move the fleet and personnel navigation logic and the four helpers into it with identical conditions, using the context instead of `this`. Register it as `extensions.notificationHandlers` in `accounting/module.ts`.
- c) In `onNotificationClick`, keep `markAsRead`, closing the panel and the `item.url` branch; then compute `userPerms()` once, iterate over `this.moduleRegistry.getExtensions('notificationHandlers')`, and for each entry iterate over `entry.extension` (an array of handlers); call `navigate(context)` on the first handler whose `canHandle(item)` is true and return. Inject `ModuleRegistryService` with `inject()`. Remove the moved private helpers and any now-unused imports.
- d) `notification-handlers.spec.ts`: for each handler, the route and query params for the manager, accountant, supervisor and plain-employee permission sets, the invalid `target_id` fallback, and the HTTP-error fallback (mock `HttpClient` with `vi.fn()` returning `of(...)` or `throwError(...)`, and spy on `Router.navigate`).

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; one run of `python scripts/e2e/guardian_57_front_module_fence.py` from the repo root. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(notifications): accounting notification navigation via module notificationHandlers
- Short English report: moved logic, tests added, commands actually run with results, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 8 of 9 — Phase 3: move module-only front models into their modules and remove the dead RecordHttpService

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); idx=(app/'core/models/index.ts').read_text(encoding='utf-8'); bad={'personnel_in_core':(app/'core/models/personnel.model.ts').exists(),'count_in_core':(app/'core/models/count-task.model.ts').exists(),'doc_in_core':(app/'core/models/doc-task.model.ts').exists(),'record_http_exists':(app/'core/http/record-http.service.ts').exists(),'personnel_missing':not (app/'modules/accounting/models/personnel.model.ts').is_file(),'count_missing':not (app/'modules/warehouse/models/count-task.model.ts').is_file(),'doc_missing':not (app/'modules/warehouse/models/doc-task.model.ts').is_file(),'barrel_still_exports':'count-task.model' in idx or 'doc-task.model' in idx,'item_moved':not (app/'core/models/item.model.ts').is_file(),'field_config_moved':not (app/'core/models/field-config.model.ts').is_file()}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import subprocess,sys; out=subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split(); bad=[f for f in out if not (f.startswith('warehouse-front/src/app/modules/accounting/') or f.startswith('warehouse-front/src/app/modules/warehouse/') or f in ('warehouse-front/src/app/core/models/index.ts','warehouse-front/src/app/core/models/personnel.model.ts','warehouse-front/src/app/core/models/count-task.model.ts','warehouse-front/src/app/core/models/doc-task.model.ts','warehouse-front/src/app/core/http/record-http.service.ts'))]; print('outside scope:',bad); sys.exit(1 if bad or not out else 0)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base}
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(front-models): move module-only models into their modules and remove dead RecordHttpService"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Only file moves and import path updates; no type or logic changes. Do not move `core/models/item.model.ts` or `core/models/field-config.model.ts` (core files import them).
- Changes are limited to the moved files, `core/models/index.ts`, the deleted `core/http/record-http.service.ts`, and import lines in files under `modules/accounting/` and `modules/warehouse/`.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context: plan heading `### گام ۸`. `personnel.model.ts` is imported only under `modules/accounting/`. `count-task.model.ts` and `doc-task.model.ts` are imported only under `modules/warehouse/` and re-exported by `core/models/index.ts`. `record-http.service.ts` has no importer.

3. Definitions: "import update" means changing only the module specifier string of an existing import.

4. Task:
- a) `git mv` `core/models/personnel.model.ts` to `modules/accounting/models/personnel.model.ts` and update every import of it under `modules/accounting/` (components, `api/personnel-api.models.ts`, `.spec.ts` and `.dom.spec.ts` files).
- b) `git mv` `core/models/count-task.model.ts` and `core/models/doc-task.model.ts` to `modules/warehouse/models/`, fix their own relative imports (for example `Item` from `../../../core/models/item.model`), remove both lines from `core/models/index.ts`, and update every import under `modules/warehouse/`, including imports that used the `core/models` barrel for these types.
- c) `git rm` `core/http/record-http.service.ts`.

5. Tool policy: in `warehouse-front`, at most three runs of `npx ng build --output-path ../scratch/ng-build-agent`; one run of `python scripts/e2e/guardian_57_front_module_fence.py` from the repo root. Use the Grep tool to find importers. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only renames, `index.ts`, the deletion and import-line edits.

7. Output and stop condition:
- Commit with this message, without push:
refactor(front-models): move module-only models into their modules and remove dead RecordHttpService
- Short English report: moved files, number of updated imports per module, commands actually run with results, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 9 of 9 — Phase 3: semantic core fences in Guardian 29 (backend) and Guardian 57 (frontend)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/e2e/guardian_57_front_module_fence.py --self-test
verify: python -c "import json,pathlib,sys; b29=json.loads(pathlib.Path('scripts/e2e/modularization_baseline.json').read_text(encoding='utf-8')).get('counters',{}); b57=json.loads(pathlib.Path('scripts/e2e/front_fence_baseline.json').read_text(encoding='utf-8')).get('counters',{}); v29=b29.get('core_module_app_refs'); v57=b57.get('core_hardcoded_module_api_paths'); ok={'b29_present':isinstance(v29,int),'b29_max':isinstance(v29,int) and v29<=14,'b57_zero':v57==0}; print(ok,'core_module_app_refs=',v29,'core_hardcoded_module_api_paths=',v57); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; ok={'scripts/e2e/guardian_modularization.py','scripts/e2e/modularization_baseline.json','scripts/e2e/guardian_57_front_module_fence.py','scripts/e2e/front_fence_baseline.json'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py sample-module
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(guardians): semantic core fences for module app references and hardcoded module API paths"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Change only the two guardian scripts and their two baseline JSON files. Do not change application code to make a counter smaller.
- Existing counters, their behavior and the existing self-test must keep working.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan heading `### گام ۹`.
- Guardian 29 (`scripts/e2e/guardian_modularization.py`) fails only when a counter in `counters` exceeds `modularization_baseline.json`; `--update-baseline` records a new snapshot.
- Guardian 57 (`scripts/e2e/guardian_57_front_module_fence.py`) classifies files with `get_file_zone(rel_posix, module_names)` (zones `composition_root`, a module name, or `core_common`; `modules/common` is `core_common`), counts in `scan_front_fences`, and has `run_self_test()` with a dummy file in zone `core_common`.

3. Definitions:
- "core module app reference" is one regex match in a non-test, non-migration `.py` file under `warehouse-backend/core/` (skip files named `tests.py`, `test_*.py` and anything under `tests/` or `migrations/`) of `apps\.(?:is_installed|get_model)\(\s*['"](?:personnel|warehouses|inventory)['"]` or `get_user_valid_roles_for_app\(\s*user\s*,\s*['"](?:personnel|warehouse)['"]`.
- "hardcoded module API path" is one match of `['"\x60][^'"\x60\n]*/(?:personnel|inventory)/` in a non-spec `.ts` file of zone `core_common`, ignoring lines whose stripped text starts with `//`, `*` or `/*`, and lines matching `^\s*(import|export)\b.*\bfrom\b`. (`\x60` is the backtick character.)

4. Task:
- a) Guardian 29: add `scan_core_module_app_refs(backend_dir)` and record its count as `counters["core_module_app_refs"]`, with the per-file list in the report output. Run `--update-baseline`. Expected count: 14 (soft `warehouses` couplings in `accounts/admin.py`, `accounts/models.py`, `accounts/views_domains/audit_views.py`, `communications/models.py`, `communications/views.py`, `reports/registry.py`, `settings_core/models.py`). If you get a different number, report the list; do not edit application code.
- b) Guardian 57: add the counter `core_hardcoded_module_api_paths` to `scan_front_fences` with file and line in `violations`. Extend `run_self_test()` so the dummy file also contains a literal with a query string, for example a template literal with `/api/personnel/sync/pull/?project_id=1`, and assert it is detected. Run `--update-baseline`; the count must be 0.

5. Tool policy: from the repo root, `python scripts/e2e/guardian_modularization.py` and `python scripts/e2e/guardian_57_front_module_fence.py` (each with or without `--update-baseline`) at most three times each, and `--self-test` at most three times. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the four allowed files.

7. Output and stop condition:
- Commit with this message, without push:
feat(guardians): semantic core fences for module app references and hardcoded module API paths
- Short English report: both counters with their values and file lists, self-test result, commands actually run with results, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 10 of 10 — Phase 3 follow-up: test that the org-admin directory honors the company_id narrowing for section members

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys; s=pathlib.Path('warehouse-backend/integration_tests/test_company_extension_points.py').read_text(encoding='utf-8'); ok={'new_test':'def test_org_admin_directory_company_id_param_narrows_section_members' in s,'uses_param':'company_id=' in s}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; ok={'warehouse-backend/integration_tests/test_company_extension_points.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/automation/verify_tools.py migrations-unchanged
verify: python scripts/automation/verify_tools.py django-tests --labels integration_tests accounts companies --known scripts/automation/known_backend_failures.txt --min-tests 150
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(org-directory): company_id narrowing for section members"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply (including the new rule: never alter, bypass or shadow a runner check).
- Test-only session: change only `warehouse-backend/integration_tests/test_company_extension_points.py`. Do not change application code. If the new test fails, report the failure with the output and end the turn; do not change application code to make it pass.
- Do not push. Stage only your changed file. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Run `manage.py test` only with labels.

2. Context:
- `UserViewSet._org_admin_directory_queryset` in `warehouse-backend/core/accounts/views_domains/user_views.py` narrows `allowed_cids` to `{company_id}` when the `company_id` query parameter is given, then ORs the `company_member_q_builders` contributions (section members of projects of those companies).
- The existing test `test_org_admin_directory_lists_active_section_member_of_allowed_company` covers an admin with access to one company only, so it would not catch a builder that ignored the narrowing.

3. Definitions: "section member of company X" means a user with an active `UserSectionAssignment` in a `ProjectSection` of a `FinancialProject` of company X.

4. Task: add `test_org_admin_directory_company_id_param_narrows_section_members` next to the existing test, reusing its setup style (new unique codes, usernames and phone numbers). The org admin has `perm_manage_projects_sections` and `workspace_full` access to both comp1 and comp2; there is one section member in each company. Assert: `GET /api/accounts/users/` lists both members; `GET /api/accounts/users/?company_id=<comp1.id>` lists the comp1 member and not the comp2 member; `GET /api/accounts/users/?company_id=<comp2.id>` lists the comp2 member and not the comp1 member.

5. Tool policy: in `warehouse-backend` with `PYTHONUTF8=1`, at most three runs of `.\venv\Scripts\python.exe manage.py test integration_tests.test_company_extension_points --noinput`. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the test file.

7. Output and stop condition:
- Commit with this message, without push:
test(org-directory): company_id narrowing for section members
- Short English report: the test added, commands actually run with pass/fail counts. End the turn after the commit and report.

===

[DONE] Session 11 — Phase 3 release on the local app environment: backup, migration check, patched frontend build; the runner restarts Daphne and the GDrive worker and runs the health checks

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
- This session is a release only. Do not edit, create, stage or commit any file. Do not run `git` commands that change the working tree or history.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`. The runner restarts Daphne and the GDrive worker itself after your turn.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `warehouse-backend/backups/` or `warehouse-front/dist/`.

2. Context: the phase 3 queue (sessions 1 to 10) changed backend and frontend code and added no migration. Your terminal may be PowerShell; if so, set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order:
- a) Backup. In `warehouse-backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app phase 3'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0. Do not continue without a successful backup.
- b) Migration check. `.\venv\Scripts\python.exe manage.py showmigrations --plan` must show no `[ ]` line. If any `[ ]` line appears, stop and report it; do not migrate.
- c) Frontend build. In `warehouse-front`, run `npx ng build --delete-output-path=false`, then `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.

4. Tool policy: only the commands above and `git status --short`. Run the build at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error; do not try workarounds that touch files or services.

5. Before finishing: `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the backup filename and size, the `showmigrations` result, the build result (errors, warnings count) and the patch script line. No commit. End the turn after the report.

===

[DONE] Session 12 of 22 — Phase 3 DOM test: the org-admin user directory inside projects-and-sections

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/modules/accounting/components/organization/projects-and-sections/projects-and-sections.dom.spec.ts --min-tests 6 --require "@vitest-environment jsdom" --require "createComponent(" --require "nativeElement" --require "perm_manage_projects_sections"
verify: python -c "import subprocess,sys; ok={'warehouse-front/src/app/modules/accounting/components/organization/projects-and-sections/projects-and-sections.dom.spec.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/modules/accounting/components/organization/projects-and-sections/projects-and-sections.dom.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(dom): org-admin user directory in projects-and-sections"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- This session adds one test file only: `warehouse-front/src/app/modules/accounting/components/organization/projects-and-sections/projects-and-sections.dom.spec.ts`. Do not change any application file, template, existing spec, config or script. If the application behaves differently from this task text, leave that assertion out of the file and list the difference in the report; do not change application code.
- No `fs`, `path` or `__dirname`; no `it.skip`, `it.only`, `it.todo`, `xit`. Every test must assert on the rendered DOM (`fixture.nativeElement`) or on a mocked service call.
- Do not push. Stage only the new spec. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase3/modular_architecture_phase3_plan.md`, heading `## گزارش پیشرفت`, the last entry (batch A). These specs replace a manual check of pages behind the login.
- Component class in `projects-and-sections.ts` with template `projects-and-sections.html` (`templateUrl`). `loadUsers()` fills `systemUsers` from `AccountsHttpService.getUsers()` and shows a toast with the text «خطا در دریافت لیست کاربران» on error.
- Spec style to copy: `src/app/modules/common/components/login/login.spec.ts` and `src/app/modules/common/components/health-dashboard/health-dashboard.dom.spec.ts` (`// @vitest-environment jsdom`, `import '@angular/compiler'`, `TestBed` with mocked providers, `getTestBed().initTestEnvironment(...)` inside a try block). The `@angular/build:unit-test` builder resolves `templateUrl`; no `fs` is needed.
- Backend rule already tested in `warehouse-backend/integration_tests/test_company_extension_points.py`: an org admin (permission `perm_manage_projects_sections`, not superuser) receives only members of the sections of their companies. The frontend shows exactly what the API returns.

3. Definitions:
- "org admin" means a mocked `AuthService` whose `userPermissions()` returns `['perm_manage_projects_sections']` and whose `user()` returns a non-superuser.
- "user directory" means every place in `projects-and-sections.html` where entries of `systemUsers` are rendered (for example a member picker or an assignment list). Read the template to find them, and open the modal or tab needed to make them visible through rendered buttons.

4. Task: write the spec with at least 6 tests:
- a) For the org admin, after `getUsers()` returns users A and B, the user directory shows A and B (by the name field the template renders).
- b) A user C that the API did not return never appears in `fixture.nativeElement.textContent`.
- c) `getUsers()` is called exactly once on init, without a `has_perm` argument (as today).
- d) When `getUsers()` errors, the mocked toast receives `'error'` and a message containing «خطا در دریافت لیست کاربران», and the page header still renders.
- e) An empty user list renders without throwing and shows no user entries.
- f) After the public flow that refreshes assignments runs (the one the template triggers), users A and B are still shown.
- Mock every injected service with `vi.fn()` returning `of(...)`; no real HTTP.

5. Tool policy: from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/modules/accounting/components/organization/projects-and-sections/projects-and-sections.dom.spec.ts"` (it runs the spec from the working tree and prints the log path). If a run fails, read the log and change approach; do not repeat it unchanged.

6. Before finishing: `git status --short` shows only runner files.

7. Output and stop condition:
- Commit with this message, without push:
test(dom): org-admin user directory in projects-and-sections
- Short English report: tests added (one line each), the last ng-test-compare summary line, and any behavior that differed from this task text. End the turn after the commit and report.

===

[DONE] Session 13 of 22 — Phase 3 DOM test: fleet and personnel notification navigation in NotificationCenterComponent

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/shared/components/notification-center/notification-center.dom.spec.ts --min-tests 7 --require "@vitest-environment jsdom" --require "createComponent(" --require "nativeElement" --require "fleet_change_request" --require "PersonnelProfile" --require "VehicleDriverProfile" --require "notificationHandlers"
verify: python -c "import subprocess,sys; ok={'warehouse-front/src/app/shared/components/notification-center/notification-center.dom.spec.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/shared/components/notification-center/notification-center.dom.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(dom): notification center fleet and personnel navigation"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- This session adds one test file only: `warehouse-front/src/app/shared/components/notification-center/notification-center.dom.spec.ts`. Do not change any application file, template, existing spec, config or script. If the application behaves differently from this task text, leave that assertion out and list the difference in the report.
- No `fs`, `path` or `__dirname`; no `it.skip`, `it.only`, `it.todo`, `xit`. Every test must assert on the rendered DOM or on a mocked call.
- Do not push. Stage only the new spec. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- `notification-center.component.ts` (inline template). Clicking an item runs `onNotificationClick(item)`: `markAsRead`, closes the panel, follows `item.url` if set, otherwise asks the handlers from `ModuleRegistryService.getExtensions('notificationHandlers')`.
- The accounting handlers are `ACCOUNTING_NOTIFICATION_HANDLERS` in `src/app/modules/accounting/notification-handlers.ts`; the expected routes and query params per permission set are pinned in `notification-handlers.spec.ts`. Reuse those exact expectations; do not invent routes.
- Spec style: `src/app/modules/common/components/health-dashboard/health-dashboard.dom.spec.ts`.

3. Definitions:
- "accounting registry" means a mocked `ModuleRegistryService` whose `getExtensions('notificationHandlers')` returns one entry whose `extension` is `ACCOUNTING_NOTIFICATION_HANDLERS` (use the entry shape the component reads), and `[]` for other keys.
- "warehouse-only registry" means the same mock returning `[]` for `notificationHandlers`.

4. Task: write the spec with at least 7 tests. Render the component, open the panel through its rendered button, and click the rendered item element (do not call `onNotificationClick` directly):
- a) The list renders one row per notification and the unread badge shows the unread count.
- b) Fleet: with the accounting registry and the manager permission set from `notification-handlers.spec.ts`, clicking a `fleet_change_request` item calls `Router.navigate` with the same arguments that spec expects.
- c) A `VehicleDriverProfile` item for the accountant permission set: same arguments as the handler spec.
- d) A `PersonnelProfile` item for the supervisor permission set and for a plain employee: same arguments as the handler spec.
- e) An item with `url` calls `Router.navigateByUrl` with that url and no handler navigation.
- f) Warehouse-only registry: clicking a `PersonnelProfile` item marks it read and closes the panel, calls neither `navigate` nor `navigateByUrl`, and throws nothing.
- g) Every click marks the item read (visible read state in the DOM, or the mocked mark-read HTTP call the component makes today).
- Mock `HttpClient`, `AuthService`, `WebSocketService` and `Router` with `vi.fn()`; no real HTTP.

5. Tool policy: from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/shared/components/notification-center/notification-center.dom.spec.ts"`. If a run fails, read the log and change approach.

6. Before finishing: `git status --short` shows only runner files.

7. Output and stop condition:
- Commit with this message, without push:
test(dom): notification center fleet and personnel navigation
- Short English report: tests added, the last ng-test-compare summary line, any behavior difference. End the turn after the commit and report.

===

[DONE] Session 14 of 22 — Phase 3 DOM test: company finance tabs and the Google Drive tab with and without the accounting module

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/modules/common/components/operations/companies/company-finance-tabs.dom.spec.ts --min-tests 5 --require "@vitest-environment jsdom" --require "createComponent(" --require "nativeElement" --require "isAccountingInstalled"
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/modules/common/components/operations/companies/company-gdrive-tab/company-gdrive-tab.dom.spec.ts --min-tests 5 --require "@vitest-environment jsdom" --require "createComponent(" --require "getCompanyGdriveUrl" --require "/personnel/companies/"
verify: python -c "import subprocess,sys; p='warehouse-front/src/app/modules/common/components/operations/companies/'; ok={p+'company-finance-tabs.dom.spec.ts',p+'company-gdrive-tab/company-gdrive-tab.dom.spec.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/modules/common/components/operations/companies/company-finance-tabs.dom.spec.ts" --include "src/app/modules/common/components/operations/companies/company-gdrive-tab/company-gdrive-tab.dom.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(dom): company finance tabs and gdrive tab"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7 and 10 apply.
- This session adds two test files only: `warehouse-front/src/app/modules/common/components/operations/companies/company-finance-tabs.dom.spec.ts` and `warehouse-front/src/app/modules/common/components/operations/companies/company-gdrive-tab/company-gdrive-tab.dom.spec.ts`. Do not change application files, templates, existing specs (including `companies.dom.spec.ts`), config or scripts. If the application behaves differently from this task text, leave that assertion out and list the difference in the report.
- No `fs`, `path` or `__dirname`; no `it.skip`, `it.only`, `it.todo`, `xit`.
- Do not push. Stage only the two new specs. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- `companies.ts` / `companies.html`: the accounting-only parts are guarded by `isAccountingInstalled`: the table columns «پروژه‌ها» and «سلامت مدارک», the modal tabs `treasury`, `governance` and `gdrive`, and the modal subtitle text. The existing `companies.dom.spec.ts` shows how to mock `CompanyApiService`, `ActiveCompanyService`, `AccountsHttpService`, `WebSocketService`, `ToastService`, `ConfirmDialogService` and `ModuleRegistryService`; copy its provider setup but not its `fs`/`path` usage (the builder resolves `templateUrl`).
- `company-gdrive-tab.ts` (`@Input() companyId`) builds every URL with `this.companyApi?.getCompanyGdriveUrl(cid, subPath)` and sends nothing when it returns null. With the accounting module the URL is `${environment.apiUrl}/personnel/companies/<cid>/gdrive<subPath>` (pinned in `company-api-endpoints.spec.ts`).

3. Definitions: "with accounting" means the mocked `ModuleRegistryService` reports the accounting module installed so the component sets `isAccountingInstalled` to true (read `companies.ts` for the registry method it uses); "without accounting" means it reports only the warehouse module.

4. Task:
- a) `company-finance-tabs.dom.spec.ts`, at least 5 tests: with accounting the two columns render and opening a company's studio modal through its rendered button shows the treasury, governance and gdrive tab buttons; without accounting none of them render and the subtitle is the non-accounting text; with accounting, clicking each of the three tab buttons renders its panel; without accounting the mocked bank-account and board-member loaders of `CompanyApiService` are not called.
- b) `company-gdrive-tab.dom.spec.ts`, at least 5 tests: with a mocked `CompanyApiService.getCompanyGdriveUrl` that returns the real accounting URL, init with `companyId = 5` sends its first `HttpClient.get` to the URL under `${environment.apiUrl}/personnel/companies/5/gdrive`; the disconnect and trigger-sync actions, through their rendered buttons (confirm the mocked dialog if one opens), send requests to URLs ending in `/gdrive/disconnect/` and `/gdrive/trigger-sync/`; when `getCompanyGdriveUrl` returns null, no `HttpClient` method is called and the component renders without throwing.
- Mock `HttpClient` with `vi.fn()` for every verb; no real HTTP.

5. Tool policy: from the repo root, at most five runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "<spec path relative to warehouse-front>"` for these two specs. If a run fails, read the log and change approach.

6. Before finishing: `git status --short` shows only runner files.

7. Output and stop condition:
- Commit with this message, without push:
test(dom): company finance tabs and gdrive tab with and without accounting
- Short English report: tests added, the last ng-test-compare summary line, any behavior difference. End the turn after the commit and report.

===

[DONE] Session 15 of 22 — Phase 3 DOM test: offline queue badge states, pending count and manual sync

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/shared/components/offline-pending-badge/offline-pending-badge.dom.spec.ts --min-tests 7 --require "@vitest-environment jsdom" --require "createComponent(" --require "nativeElement" --require "server-unreachable"
verify: python -c "import subprocess,sys; ok={'warehouse-front/src/app/shared/components/offline-pending-badge/offline-pending-badge.dom.spec.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/shared/components/offline-pending-badge/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(dom): offline queue badge states"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- No data may be lost: the spec must never call anything that clears, deletes or skips queue records or IndexedDB stores; use mocks only, never the real `OfflineDb`.
- This session adds one test file only: `warehouse-front/src/app/shared/components/offline-pending-badge/offline-pending-badge.dom.spec.ts`. Do not change application files, templates, the existing `offline-pending-badge.component.spec.ts`, config or scripts. If the application behaves differently from this task text, leave that assertion out and list the difference in the report.
- No `fs`, `path` or `__dirname`; no `it.skip`, `it.only`, `it.todo`, `xit`.
- Do not push. Stage only the new spec. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- `offline-pending-badge.component.ts` (inline template, `@Input() mode: 'header' | 'inline'`, fields `networkState`, `isSyncing`, `pendingCount`). Read the class to see which services feed those fields and mock them with `BehaviorSubject`s or signals so a test can change the state.
- Texts today in `mode = 'header'`: «متصل» (online, idle, empty queue), «در حال ارسال (N)» (syncing), «آفلاین» (not online, empty queue), «صف ارسال (N)» (pending records). The details panel shows «N رکورد در انتظار» or «همگام و بدون صف». The manual sync button is disabled while syncing or when not online.

3. Definitions: "pending" means the mocked source reports N queued records, N > 0.

4. Task: write the spec with at least 7 tests in `mode = 'header'`:
- a) online, idle, 0 pending: «متصل» renders.
- b) online, 3 pending: «صف ارسال (3)» and the count badge 3 render.
- c) syncing with 2 pending: «در حال ارسال (2)».
- d) `networkState` offline with 0 pending: «آفلاین».
- e) `networkState = 'server-unreachable'` with 1 pending: the `status-warning` icon and «صف ارسال (1)».
- f) Clicking the badge opens the panel: «3 رکورد در انتظار» for 3 pending and «همگام و بدون صف» for 0.
- g) The manual sync button is disabled when offline and enabled when online and idle; clicking it when enabled calls the mocked sync method once.
- h) Changing the mocked pending count from 3 to 0 updates the DOM after change detection.

5. Tool policy: from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/shared/components/offline-pending-badge/*.spec.ts"`. If a run fails, read the log and change approach.

6. Before finishing: `git status --short` shows only runner files.

7. Output and stop condition:
- Commit with this message, without push:
test(dom): offline queue badge states, pending count and manual sync
- Short English report: tests added, the last ng-test-compare summary line, any behavior difference. End the turn after the commit and report.

===

[DONE] Session 16 of 23 — Deep-sync probe: classify a failed probe with isServerUnreachable() and keep aborting before any local change

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import pathlib,sys,re; s=pathlib.Path('warehouse-front/src/app/core/services/offline-sync.service.ts').read_text(encoding='utf-8'); i=s.find('async performDeepUpdate('); body=s[i:s.find('SyncPullService', i)]; ok={'uses_helper':'isServerUnreachable(' in body,'imports_helper':bool(re.search(r'import\s*\{[^}]*isServerUnreachable[^}]*\}\s*from', s)),'still_throws':'throw new Error' in body,'auth_kept':'401' in body}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python scripts/automation/verify_tools.py diff-free --base {base} --pattern "\.delete\(|\.clear\(|deleteProjectAttendance|bulkDelete" --path warehouse-front/src/app/core/services/offline-sync.service.ts
verify: python -c "import subprocess,sys; p='warehouse-front/src/app/core/services/'; ok={p+'offline-sync.service.ts',p+'offline-sync.deep-update-probe.spec.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/services/offline-sync.deep-update-probe.spec.ts --min-tests 6 --require "performDeepUpdate" --require "530" --require "403"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_34_offline_continuity.py
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/core/services/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(offline-sync): classify the deep-update probe failure with isServerUnreachable"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- No data may be lost. `performDeepUpdate` deletes cached rows per warehouse or project only after the probe succeeds. Every non-2xx probe response and every network failure must still throw before that point, exactly as today. Do not touch any line that deletes, clears or rewrites local data, the pull loop, or `core/services/offline-db.ts`.
- Change only `warehouse-front/src/app/core/services/offline-sync.service.ts` (only the probe `try`/`catch` inside `performDeepUpdate` and the import line) and the new spec `warehouse-front/src/app/core/services/offline-sync.deep-update-probe.spec.ts`.
- Do not push. Stage only those two files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase3/modular_architecture_phase3_plan.md`, heading `## ۴.`, row about the deep-sync probe.
- Project rule (CLAUDE.md): HTTP status interpretation must use `isServerUnreachable()` from `core/services/server-reachability.ts`, never `status >= 500` or a blanket non-2xx. It returns true for 0, 502, 503, 504 and 520 to 530.
- Today the probe throws `'auth-required'` for 401 and `'server-unreachable'` for every other non-2xx; the catch block turns that into «نشست شما منقضی شده است. لطفا وارد شوید.» or «سرور در دسترس نیست». So a 403, 404 or 500 is reported to the user as an unreachable server, which is wrong.

3. Definitions:
- "unreachable" means `fetch` rejected (network error) or `isServerUnreachable(res.status)` is true.
- "rejected by the server" means any other non-2xx status except 401.

4. Task:
- a) In the probe block: 401 keeps the session-expired message; unreachable keeps «سرور در دسترس نیست»; rejected by the server throws an `Error` with the message «سرور درخواست بروزرسانی عمیق را نپذیرفت (کد <status>).» with the numeric status. All three paths throw before any code after the probe runs. Keep the `console.error` line.
- b) New spec `offline-sync.deep-update-probe.spec.ts` (Vitest; stub `fetch` with `vi.stubGlobal`; give `getModuleRegistry().getExtensions('syncConfig')` a warehouse `syncConfig` through the real registry or a mock, as the existing specs in `core/services/` do). At least 6 tests: 401 gives the session-expired message; 530 and 503 give «سرور در دسترس نیست»; a network rejection gives «سرور در دسترس نیست»; 403 and 500 give the rejected message containing the status; in every failing case `fetch` was called exactly once (only the probe) and the deep-update state observable never reported `isActive: true`; an empty id list returns `[]` without calling `fetch`.

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/core/services/offline-sync.deep-update-probe.spec.ts"`. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
fix(offline-sync): classify the deep-update probe failure with isServerUnreachable
- Short English report: the new message mapping, tests added, the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 17 of 23 — Guardians 33 and 35: check the current module build and lazy routing mechanism instead of the removed accounting-only config and stub file

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/e2e/guardian_33_bundle_isolation.py
verify: python scripts/e2e/guardian_35_route_matching.py
verify: python scripts/e2e/guardian_33_bundle_isolation.py --self-test
verify: python scripts/e2e/guardian_35_route_matching.py --self-test
verify: python -c "import pathlib,sys; g33=pathlib.Path('scripts/e2e/guardian_33_bundle_isolation.py').read_text(encoding='utf-8'); g35=pathlib.Path('scripts/e2e/guardian_35_route_matching.py').read_text(encoding='utf-8'); ok={'g33_no_old_config':'accounting-only' not in g33 and 'routes.stub' not in g33,'g33_new':'build-for-modules' in g33 and 'gen-installed-modules' in g33,'g35_redirects_kept':'EXPECTED_LEGACY_REDIRECTS' in g35,'g35_eager_kept':'eager_components' in g35,'g35_new':'INSTALLED_MODULES' in g35 and 'loadChildren' in g35}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import subprocess,sys; ok={'scripts/e2e/guardian_33_bundle_isolation.py','scripts/e2e/guardian_35_route_matching.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(guardians): guardians 33 and 35 check the current module build and lazy routing"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Change only `scripts/e2e/guardian_33_bundle_isolation.py` and `scripts/e2e/guardian_35_route_matching.py`. Do not change application code, `angular.json`, `package.json` or any tool to make a guardian pass. Do not remove or loosen a check that is still valid; replace only the checks that refer to removed files.
- Do not push. Stage only the two guardians. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase3/modular_architecture_phase3_plan.md`, heading `## ۴.`, row about guardians 33 and 35, and the last entry under `## گزارش پیشرفت`.
- Both guardians fail on HEAD only because the architecture changed: guardian 33 looks for an `accounting-only` build configuration in `angular.json` and the file `modules/warehouse/warehouse.routes.stub.ts`, which no longer exist; guardian 35 looks for literal `path: 'app/warehouse'` and `path: 'app/finance'` routes with `loadChildren: () => import(`.
- Current mechanism: `warehouse-front/tools/gen-installed-modules.js` writes `src/app/modules/installed-modules.ts` (the committed version lists every discovered module); `warehouse-front/tools/build-for-modules.js` (npm script `build:modules`) regenerates it for `WH_MODULES`, builds, and restores the committed version; each `src/app/modules/<name>/module.ts` declares `routes: () => import('./<name>.routes')...`; `app.routes.ts` builds `dynamicModuleRoutes` from `INSTALLED_MODULES` with `loadChildren: m.routes!`.
- Guardian 33's existing dist loop asserts nothing (its body is `pass`). Real bundle isolation per profile is checked by the runner with separate `build:modules` builds and `verify_tools.py dist-free`.

3. Definitions: "self-test" means the guardian runs its checks against small in-memory text fixtures (a good fixture that must pass and at least one bad fixture per check that must fail) and exits 0 only if every fixture gives the expected result. It must not write files outside a temporary directory.

4. Task:
- a) Guardian 33 checks: `package.json` has a `build:modules` script that runs `tools/build-for-modules.js`; `build-for-modules.js` requires `./gen-installed-modules` and restores the committed `installed-modules.ts` in a `finally` path and on signals; the committed `installed-modules.ts` imports every `src/app/modules/*/module.ts`; every `module.ts` that declares `routes` uses a dynamic `import(` (no static import of its routes file); and no file under `src/app/core` or `src/app/shared` statically imports a `*.routes` file of a module. Remove the no-op dist loop. Add `--self-test`.
- b) Guardian 35 checks: replace check 1 with `app.routes.ts` imports `INSTALLED_MODULES`, builds routes from it with `loadChildren: m.routes` and a `canMatch` that calls `isModuleInstalled`; keep checks 2 (eager component imports), 3 (all `EXPECTED_LEGACY_REDIRECTS`, unchanged) and 4 unchanged. Add `--self-test`.
- c) Keep the Persian console style of both guardians.

5. Tool policy: from the repo root, run each guardian and its `--self-test` at most three times. If a command fails, read the output and change approach.

6. Before finishing: both guardians exit 0 on HEAD and with `--self-test`; `git diff --stat` shows only the two files.

7. Output and stop condition:
- Commit with this message, without push:
test(guardians): guardians 33 and 35 check the current module build and lazy routing
- Short English report: each check before and after, the self-test fixtures, both exit codes. End the turn after the commit and report.

===

[DONE] Session 18 of 23 — Persona characterization spec: pin availableRoles, the persona list, SoD prohibitions and role route isolation before moving them to the modules

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/services/app-persona.characterization.spec.ts --min-tests 25 --require "setInstalledModules" --require "availableRoles" --require "isActionProhibited" --require "canAccessRoute" --require "badgeColor" --require "org_admin" --require "manager_review" --require "getDefaultRouteForRole"
verify: python -c "import pathlib,sys; s=pathlib.Path('warehouse-front/src/app/core/services/app-persona.characterization.spec.ts').read_text(encoding='utf-8'); bad={'mock_registry':'provide: ModuleRegistryService' in s,'imports_ALL_APP_ROLES':'ALL_APP_ROLES' in s,'imports_SOD_map':'FRONTEND_SOD_PROHIBITIONS' in s,'snapshot':'toMatchSnapshot' in s or 'toMatchInlineSnapshot' in s}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import subprocess,sys; ok={'warehouse-front/src/app/core/services/app-persona.characterization.spec.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/core/services/app-persona*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(persona): characterization of available roles, persona list, SoD prohibitions and role route isolation"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- This session adds one test file only: `warehouse-front/src/app/core/services/app-persona.characterization.spec.ts`. Do not change application code, existing specs, config or scripts.
- The spec pins today's behavior. Expected values are literal arrays and objects written in the spec, taken from the behavior on HEAD; no snapshot files, no `toMatchSnapshot`. The spec must test only through public members of `AppPersonaService` (`availableRoles`, `isActionProhibited`, `canPerform`, `canAccessRoute`, `getDefaultRouteForRole`, `activeApp`, `activeRole`) and must not import `ALL_APP_ROLES` or `FRONTEND_SOD_PROHIBITIONS`, because the next sessions move those constants into the modules and this spec must keep passing unchanged.
- Use the real `ModuleRegistryService` (not a mock) with `setInstalledModules(['warehouse', 'accounting'])`, because the next sessions read persona data from the registry.
- No `fs`, `path` or `__dirname`; no `it.skip`, `it.only`, `it.todo`, `xit`.
- Do not push. Stage only the new spec. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase3/modular_architecture_phase3_plan.md`, heading `## ۴.` (persona row) and the last entry under `## گزارش پیشرفت` (batch C).
- `core/services/app-persona.service.ts`: `ALL_APP_ROLES`, `FRONTEND_SOD_PROHIBITIONS`, `availableRoles` (computed from `activeApp`, `isSuperuser()`, `auth.userPermissions()`, `auth.user()?.roles`, `hasWarehouseAccess`, `hasPersonnelAccess`), `isActionProhibited`, `canAccessRoute`.
- Existing spec for setup ideas: `core/services/app-persona.generic-module.spec.ts` (storage mock). Construct the service with `TestBed` and mocks for `AuthService` (signals `user` and `userPermissions`), `Router` (`events` as a `Subject`, `navigate` as `vi.fn()`), `WebSocketService`, `SessionTabService` (`getActiveApp`, `getActiveRole`, setters as `vi.fn()`) and `ActiveCompanyService` (`hasWarehouseModule: true`, `hasCompanyDocumentsAccess()` returning false).

3. Definitions:
- "access user" means a non-superuser whose permissions give access to both modules through the real registry (include at least one `permissionMarkers` entry of each module from `modules/warehouse/module.ts` and `modules/accounting/module.ts`, plus `allowed_apps` if the registry needs it).
- "role list" of a case means `availableRoles().map(r => r.code)` in order.

4. Task: write the spec with at least 25 tests:
- a) Superuser, `activeApp` `'personnel'`, `'warehouse'` and `'operations'`: the full persona objects (all seven fields) in order, as literals.
- b) Non-superuser role lists for app `'personnel'`, one case per trigger in `availableRoles`: each permission and each user role that the personnel branch checks (including the operator rule with and without another explicit role, and `treasurer` as a user role), plus one case with all personnel triggers together. Each case adds the access user's base permissions.
- c) The same for app `'warehouse'`: each permission and user role the warehouse branch checks, including `view_sys_supervisor` with and without `can_act_as_workshop_supervisor`, plus all warehouse triggers together.
- d) A non-superuser with no access to the active app gets `[]` for `'personnel'` and for `'warehouse'`; app `'operations'` for a non-superuser gives `[]`.
- e) `isActionProhibited` for every key of today's SoD map: set `activeApp` and `activeRole` from the key, call with the route prefixed by `/app/finance` (personnel keys) or `/app/warehouse` (warehouse keys), expect true for each listed action and false for an unlisted action; superuser always false.
- f) `canAccessRoute` for the access user with `activeRole` set to each of `accountant`, `operator`, `supervisor`, `manager`, `treasury`, `org_admin` and `counter`, over this route list: `/app/finance/employee-attendance`, `/app/finance/supervisor-fleet`, `/app/finance/accountant-payroll`, `/app/finance/manager-dashboard`, `/app/finance/treasurer-cheques`, `/app/finance/finance-cartable`, `/app/finance/treasury-cartable`, `/app/finance/manager-approvals`, `/app/finance/attendance`, `/app/finance/fleet`, `/app/finance/projects-and-sections`, `/app/finance/company-documents`, `/app/finance/health`, `/app/warehouse/dashboard`. Record the boolean table as a literal and compare it in one test per role.
- g) `getDefaultRouteForRole(code)` for every persona code plus `'treasurer'`, and for an unknown code with `activeApp` `'warehouse'` and with `activeApp` `'personnel'`.

5. Tool policy: from the repo root, at most five runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/core/services/app-persona*.spec.ts"`. To learn today's values, you may temporarily log them in a scratch test, but the committed spec must contain only literal expectations. If a run fails, read the log and change approach.

6. Before finishing: `git status --short` shows only runner files.

7. Output and stop condition:
- Commit with this message, without push:
test(persona): characterization of available roles, persona list, SoD prohibitions and role route isolation
- Short English report: number of tests per group (a to f), the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 19 of 23 — Personas and available-role rules come from the modules; the persona list is read from the registry at call time

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import subprocess,sys; r=subprocess.run(['git','diff','--quiet','{base}','HEAD','--','warehouse-front/src/app/core/services/app-persona.characterization.spec.ts']); print('characterization spec unchanged:',r.returncode==0); sys.exit(r.returncode)"
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); s=(app/'core/services/app-persona.service.ts').read_text(encoding='utf-8'); am=(app/'modules/accounting/module.ts').read_text(encoding='utf-8'); wm=(app/'modules/warehouse/module.ts').read_text(encoding='utf-8'); c=(app/'core/modules/module-contract.ts').read_text(encoding='utf-8'); q=chr(39); bad={'svc_has_acct_triggers':any(x in s for x in ('perm_approve_fleet_finance','can_act_as_company_manager','perm_approve_personnel_manager')),'svc_has_wh_triggers':any(x in s for x in ('can_act_as_doc_worker','can_act_as_wh_manager','perm_inventory_finalize')),'const_snapshot':'export const ALL_APP_ROLES: RolePersona[] = [' in s,'contract_missing':'personas' not in c,'acct_missing':'personas' not in am or 'perm_approve_fleet_finance' not in (app/'modules/accounting/personas.ts').read_text(encoding='utf-8'),'wh_missing':'personas' not in wm or 'can_act_as_doc_worker' not in (app/'modules/warehouse/personas.ts').read_text(encoding='utf-8')}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import subprocess,sys; p='warehouse-front/src/app/'; ok={p+'core/modules/module-contract.ts',p+'core/services/app-persona.service.ts',p+'modules/accounting/module.ts',p+'modules/accounting/personas.ts',p+'modules/warehouse/module.ts',p+'modules/warehouse/personas.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(persona): personas and available-role rules from the module contract"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Behavior must stay identical with both modules installed: `app-persona.characterization.spec.ts` must pass without any change to it. Do not edit that spec.
- The persona list must be read from the registry each time it is needed (a function or a computed over `getInstalledModules()`), never captured once at module load time.
- Change only `core/modules/module-contract.ts`, `core/services/app-persona.service.ts`, `modules/accounting/module.ts`, the new `modules/accounting/personas.ts`, `modules/warehouse/module.ts` and the new `modules/warehouse/personas.ts` (all under `warehouse-front/src/app/`). Leave `FRONTEND_SOD_PROHIBITIONS`, `canAccessRoute` and `getDefaultRouteForRole` unchanged in this session; they move in session 20.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan heading `## ۴.` (persona row) and the last entry under `## گزارش پیشرفت`.
- `ALL_APP_ROLES` holds `ops_commander` (app `operations`), the accounting personas (app `personnel`: operator, supervisor, accountant, manager, treasury, org_admin), the warehouse personas (app `warehouse`: counter, warehouse_supervisor, docs_specialist, manager_review) and `superuser`. `availableRoles` has one branch per app. Other members (`getRoleSpec` style lookups around `ALL_APP_ROLES.find`) also read the list.
- `module.ts` files already declare `roles` (codes only). The registry is `ModuleRegistryService`; `getModuleRegistry()` gives the singleton outside DI.

3. Definitions:
- "module personas" means `{ roles: RolePersona[]; resolveRoleCodes: (ctx: { perms: string[]; userRoles: string[] }) => string[] }`, where `resolveRoleCodes` returns the role codes in the order today's branch pushes them, using exactly today's conditions (`userRoles` already lower-cased).
- "persona app" of a module is the `app` value of its personas (`'personnel'` for accounting, `'warehouse'` for warehouse).

4. Task:
- a) Move the `RolePersona` interface into `module-contract.ts` (re-export it from `app-persona.service.ts` so existing imports keep working) and add `personas?: ModulePersonas` to `WhFrontendModule`.
- b) Create `modules/accounting/personas.ts` and `modules/warehouse/personas.ts` with each module's persona objects (copied field by field) and its `resolveRoleCodes` (copied condition by condition); set `personas` in each `module.ts`.
- c) In `app-persona.service.ts`: keep `ops_commander` and `superuser` as core personas. Replace the `ALL_APP_ROLES` constant with a function `getAllAppRoles()` that returns `[ops_commander, ...personas of each installed module in registry order, superuser]` at call time; replace every `ALL_APP_ROLES` use with it. In `availableRoles`, keep the superuser path and the access checks; for a non-superuser, find the installed module whose persona app equals `activeApp()`, call its `resolveRoleCodes`, and map codes to persona objects in the returned order; keep the `'operations'` branch as is.
- d) Keep exporting a name `ALL_APP_ROLES` only if some file outside this session's scope imports it; otherwise remove it.

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most three runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/core/services/app-persona*.spec.ts"` and one run of `python scripts/e2e/guardian_57_front_module_fence.py`. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(persona): personas and available-role rules from the module contract
- Short English report: changed files, the last ng-test-compare summary line, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 20 of 23 — SoD prohibitions, role route isolation and role default routes come from the modules

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import subprocess,sys; r=subprocess.run(['git','diff','--quiet','{base}','HEAD','--','warehouse-front/src/app/core/services/app-persona.characterization.spec.ts']); print('characterization spec unchanged:',r.returncode==0); sys.exit(r.returncode)"
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); s=(app/'core/services/app-persona.service.ts').read_text(encoding='utf-8'); ap=(app/'modules/accounting/personas.ts').read_text(encoding='utf-8'); wp=(app/'modules/warehouse/personas.ts').read_text(encoding='utf-8'); bad={'svc_has_sod_keys':'personnel:operator:' in s or 'warehouse:counter:' in s,'svc_has_role_routes':'/app/finance/employee-attendance' in s or '/app/warehouse/counter' in s,'svc_methods_missing':not all(x in s for x in ('switchApp','switchRole','canPerform','canAccessRoute','getDefaultRouteForRole')),'svc_has_role_paths':any(x in s for x in ('/treasurer-','finance-cartable','manager-approvals','projects-and-sections')),'acct_missing_sod':'personnel:operator:/attendance' not in ap,'acct_missing_routes':'/treasurer-' not in ap,'wh_missing_sod':'warehouse:counter:/customs' not in wp}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import subprocess,sys; p='warehouse-front/src/app/'; ok={p+'core/modules/module-contract.ts',p+'core/services/app-persona.service.ts',p+'modules/accounting/personas.ts',p+'modules/warehouse/personas.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "personnel:operator:/attendance|personnel:treasury:/profiles"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "warehouse:counter:/customs"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(persona): SoD prohibitions, role route isolation and role default routes from the module personas"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Behavior must stay identical with both modules installed: `app-persona.characterization.spec.ts` must pass without any change. Do not edit that spec.
- Change only `core/modules/module-contract.ts`, `core/services/app-persona.service.ts`, `modules/accounting/personas.ts` and `modules/warehouse/personas.ts` (under `warehouse-front/src/app/`). The method names `switchApp`, `switchRole`, `canPerform`, `isActionProhibited` and `canAccessRoute` stay in `app-persona.service.ts` with the same signatures.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Session 19 added `ModulePersonas` and `modules/*/personas.ts`.
- `FRONTEND_SOD_PROHIBITIONS` in `app-persona.service.ts` has `personnel:*` keys (accounting) and `warehouse:counter:*` keys (warehouse). `canAccessRoute` first checks app-level access by route prefix, then has one branch per accounting role (`accountant`, `operator`, `supervisor`, `manager`, `treasury`, `org_admin`) that denies routes by substring.

3. Definitions: "role route rule" means `isRouteDeniedForRole?: (role: string, cleanRoute: string) => boolean`, returning true exactly when today's branch for that role returns false. "role default routes" means `defaultRouteForRole?: Record<string, string>` holding today's `case` targets of `getDefaultRouteForRole` for that module's role codes (accounting includes `'treasurer'`).

4. Task:
- a) Add `sodProhibitions?: Record<string, string[]>`, `isRouteDeniedForRole?` and `defaultRouteForRole?` to `ModulePersonas`.
- b) Move each module's SoD keys (verbatim keys and action lists) into its `personas.ts`, and move the six accounting role branches of `canAccessRoute` (same substrings, same order, same `allowed` list for `org_admin`) into accounting's `isRouteDeniedForRole`.
- c) In `app-persona.service.ts`: `isActionProhibited` looks up the key in the merged `sodProhibitions` of the installed modules, read at call time; `canAccessRoute` keeps the superuser shortcut and the app-level prefix checks unchanged, then returns false when any installed module's `isRouteDeniedForRole(role, cleanRoute)` is true. `getDefaultRouteForRole` keeps the `ops_commander` case and the `default` branch exactly as today and, before them, returns the first installed module's `defaultRouteForRole[role]` when defined. Keep exporting `FRONTEND_SOD_PROHIBITIONS` only if a file outside this session's scope imports it.

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most three runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/core/services/app-persona*.spec.ts"` and one run of `python scripts/e2e/guardian_57_front_module_fence.py`. Do not run `phase_guardian_approval.py`; it writes to the database. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(persona): SoD prohibitions, role route isolation and role default routes from the module personas
- Short English report: changed files, the last ng-test-compare summary line, remaining doubts. End the turn after the commit and report.

===

[DONE] Session 21 of 23 — Characterization specs: login destination and route access (hasRoutePermission and AuthGuard decisions) before moving their module lists

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/modules/common/components/login/login-destination.characterization.spec.ts --min-tests 30 --require "navigateByUrl" --require "active_app_module" --require "returnUrl" --require "view_wh_labels" --require "can_act_as_operator"
verify: python scripts/automation/verify_tools.py spec-check --file warehouse-front/src/app/core/auth/route-access.characterization.spec.ts --min-tests 20 --require "hasRoutePermission" --require "AuthGuard" --require "setInstalledModules" --require "treasurer-reconciliation" --require "feed_approvals" --require "count-tracking"
verify: python -c "import pathlib,sys; a=pathlib.Path('warehouse-front/src/app/core/auth/route-access.characterization.spec.ts').read_text(encoding='utf-8'); l=pathlib.Path('warehouse-front/src/app/modules/common/components/login/login-destination.characterization.spec.ts').read_text(encoding='utf-8'); bad={'mock_registry':'provide: ModuleRegistryService' in a or 'provide: ModuleRegistryService' in l,'snapshot':'toMatchSnapshot' in a+l or 'toMatchInlineSnapshot' in a+l}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import subprocess,sys; ok={'warehouse-front/src/app/modules/common/components/login/login-destination.characterization.spec.ts','warehouse-front/src/app/core/auth/route-access.characterization.spec.ts'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/modules/common/components/login/*.spec.ts" --include "src/app/core/auth/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(route-access): characterization of login destination, hasRoutePermission and AuthGuard decisions"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session adds two test files only: `warehouse-front/src/app/modules/common/components/login/login-destination.characterization.spec.ts` and `warehouse-front/src/app/core/auth/route-access.characterization.spec.ts`. Do not change application code, existing specs, config or scripts.
- The specs pin today's behavior with literal expectations taken from HEAD; no snapshot files. They test only through `Login` (rendered with `TestBed`, submitting its form), the exported `hasRoutePermission` and the exported `AuthGuard`, so they keep passing after session 22 moves the permission lists into the modules. Use the real `ModuleRegistryService` with `setInstalledModules(['warehouse', 'accounting'])`; do not provide a mock for it.
- No `fs`, `path` or `__dirname`; no `it.skip`, `it.only`, `it.todo`, `xit`.
- Do not push. Stage only the two new specs. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Plan `Documents/Deep_Modularization_Phase3/modular_architecture_phase3_plan.md`, heading `## ۴.` (the `ROUTE_PERMISSIONS` row) and the last entry under `## گزارش پیشرفت` (batch D).
- `modules/common/components/login/login.ts`: after a successful login it computes `hasWarehouse` and `hasFinance` from two literal permission lists (superuser counts as both), picks a target (`/app/launcher`, `/app/finance` with `active_app_module = 'personnel'`, or a warehouse page chosen by a priority chain with `active_app_module = 'warehouse'`), lets a `returnUrl` query param starting with `/app/` override it, and calls `router.navigateByUrl(target)`. A user with `requires_password_change` goes to `/change-password`. These lists differ from the modules' `permissionMarkers`; for example `view_wh_labels`, `view_sys_projects` or `can_act_as_operator` alone give neither module at login.
- `core/auth/auth.guard.ts`: `ROUTE_PERMISSIONS`, `hasRoutePermission(path, perms)`, `WAREHOUSE_PERMISSIONS`, `PERSONNEL_PERMISSIONS`, `WAREHOUSE_ROUTE_KEYS`, `FINANCE_ROUTE_KEYS` and `AuthGuard`.
- Existing login spec for setup: `modules/common/components/login/login.spec.ts`.

3. Definitions:
- "destination" of a case means the argument of `navigateByUrl` (or `navigate` for the password change) plus the value of `localStorage.active_app_module` after the login.
- "guard result" means `true`, or the serialized `UrlTree` (`router.serializeUrl(result)`) returned by `AuthGuard` run with `TestBed.runInInjectionContext`, a route whose `routeConfig.path` is the page key, and a state whose `url` is the full URL. Mock `AuthService` (`isLoggedIn` true, `user`, `userPermissions`), `AppPersonaService` (`canAccessRoute` returning true, `getDefaultRouteForRole` returning `'/role-home'`, and `hasWarehouseAccess`, `hasPersonnelAccess`, `canAccessApp(code)` consistent with the case), and `ActiveCompanyService` (`hasCompanyDocumentsAccess` returning false). Use a real `Router` from `provideRouter([])`.

4. Task:
- a) Login destination spec, at least 30 tests: superuser; each of the 12 warehouse login permissions alone (the priority chain decides the page); each of the 10 finance login permissions alone; one warehouse plus one finance permission (launcher); no relevant permission; each of `view_wh_labels`, `view_wh_feed_approvals`, `view_sys_projects`, `can_act_as_operator`, `can_act_as_accountant` alone (they are module markers but not login permissions); `returnUrl=/app/finance/payroll` overriding a warehouse user; `returnUrl=/elsewhere` ignored; `requires_password_change`.
- b) Route access spec, at least 20 tests:
  - `hasRoutePermission`: for every key of today's `ROUTE_PERMISSIONS`, true with each listed permission alone and false with `['unrelated_perm']` (one test per key group is fine, but every key and every listed permission must be covered by literal data in the spec); an unknown key is true.
  - `AuthGuard` results for these users: warehouse-only (`view_wh_docs`), finance-only (`view_sys_payroll`), both, neither (`['view_sys_users']`), and admin (`admin_all`); on these pages: `/app/warehouse/docs` (key `docs`), `/app/warehouse/count-tracking` (`count-tracking`), `/app/finance/payroll` (`payroll`), `/app/finance/treasurer-reconciliation` (`treasurer-reconciliation`), `/app/warehouse/feed_approvals` (`feed_approvals`) and `/app/operations/users` (`users`). Record the result table as a literal and compare it in one test per user.

5. Tool policy: from the repo root, at most five runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/modules/common/components/login/*.spec.ts" --include "src/app/core/auth/*.spec.ts"`. To learn today's values you may temporarily log them, but the committed specs contain only literal expectations. If a run fails, read the log and change approach.

6. Before finishing: `git status --short` shows only runner files.

7. Output and stop condition:
- Commit with this message, without push:
test(route-access): characterization of login destination, hasRoutePermission and AuthGuard decisions
- Short English report: number of tests per spec, the last ng-test-compare summary line. End the turn after the commit and report.

===

[DONE] Session 22 of 23 — Login entry lists, guard access lists and module page permissions come from the module contract

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -c "import subprocess,sys; r=subprocess.run(['git','diff','--quiet','{base}','HEAD','--','warehouse-front/src/app/modules/common/components/login/login-destination.characterization.spec.ts','warehouse-front/src/app/core/auth/route-access.characterization.spec.ts']); print('characterization specs unchanged:',r.returncode==0); sys.exit(r.returncode)"
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); g=(app/'core/auth/auth.guard.ts').read_text(encoding='utf-8'); l=(app/'modules/common/components/login/login.ts').read_text(encoding='utf-8'); ar=app/'modules/accounting/route-access.ts'; wr=app/'modules/warehouse/route-access.ts'; at=ar.read_text(encoding='utf-8') if ar.is_file() else ''; wt=wr.read_text(encoding='utf-8') if wr.is_file() else ''; bad={'guard_lists':any(x in g for x in ('WAREHOUSE_PERMISSIONS = [','PERSONNEL_PERMISSIONS = [','WAREHOUSE_ROUTE_KEYS = new Set([','FINANCE_ROUTE_KEYS = new Set([')),'guard_module_keys':any(x in g for x in (chr(39)+'treasurer-reconciliation'+chr(39)+':',chr(39)+'feed_approvals'+chr(39)+':',chr(39)+'employee-portal'+chr(39)+':',chr(39)+'count-tracking'+chr(39)+':')),'login_lists':any(x in l for x in ('view_wh_feeding','perm_treasury_disburse_action','/app/warehouse/counter')),'acct_file':'treasurer-reconciliation' not in at or 'perm_treasury_disburse_action' not in at,'wh_file':'count-tracking' not in wt or 'view_wh_feeding' not in wt,'has_route_perm_kept':'export function hasRoutePermission(path: string, userPerms: string[])' not in g}; print(bad); sys.exit(1 if any(bad.values()) else 0)"
verify: python -c "import pathlib,sys; t=pathlib.Path('warehouse-backend/modules/accounting/personnel/phase_guardian_approval.py').read_text(encoding='utf-8'); ok={'reads_module_file':'route-access.ts' in t}; print(ok); sys.exit(0 if all(ok.values()) else 1)"
verify: python -c "import pathlib,sys; app=pathlib.Path('warehouse-front/src/app'); c=(app/'core/auth/auth.guard.ts').read_text(encoding='utf-8')+(app/'modules/accounting/route-access.ts').read_text(encoding='utf-8'); ok=all(k in c for k in (chr(39)+'attendance'+chr(39)+':',chr(39)+'finance-cartable'+chr(39)+':',chr(39)+'treasury-cartable'+chr(39)+':')); print('guardian 15 route coverage text present:',ok); sys.exit(0 if ok else 1)"
verify: python -c "import subprocess,sys; p='warehouse-front/src/app/'; ok={p+'core/modules/module-contract.ts',p+'core/auth/auth.guard.ts',p+'modules/common/components/login/login.ts',p+'modules/accounting/module.ts',p+'modules/accounting/route-access.ts',p+'modules/warehouse/module.ts',p+'modules/warehouse/route-access.ts','warehouse-backend/modules/accounting/personnel/phase_guardian_approval.py'}; ch=set(subprocess.run(['git','diff','--name-only','{base}','HEAD'],capture_output=True,text=True).stdout.split()); bad=sorted(ch-ok); print('changed:',sorted(ch),'outside scope:',bad); sys.exit(1 if bad or not ch else 0)"
verify: cd warehouse-front && set "WH_MODULES=accounting" && npm run build:modules -- --output-path ../scratch/ng-build-acc
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-acc/browser --pattern "app-counter-dashboard|app-count-tracking|app-feeding"
verify: cd warehouse-front && set "WH_MODULES=warehouse" && npm run build:modules -- --output-path ../scratch/ng-build-wh
verify: python scripts/automation/verify_tools.py dist-free --dist scratch/ng-build-wh/browser --pattern "app-accountant-payroll|app-treasurer"
verify: cd warehouse-front && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/e2e/guardian_35_route_matching.py
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(route-access): login entry, guard access lists and module page permissions from the module contract"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Behavior must stay identical with both modules installed: `login-destination.characterization.spec.ts` and `route-access.characterization.spec.ts` must pass without any change. Do not edit them. In particular the login lists stay separate from `permissionMarkers` (using the markers would change where users land).
- Change only `core/modules/module-contract.ts`, `core/auth/auth.guard.ts`, `modules/common/components/login/login.ts`, `modules/accounting/module.ts`, the new `modules/accounting/route-access.ts`, `modules/warehouse/module.ts`, the new `modules/warehouse/route-access.ts` (all under `warehouse-front/src/app/`) and `warehouse-backend/modules/accounting/personnel/phase_guardian_approval.py`. Do not change `app.routes.ts`, `layout.ts` or `app-persona.service.ts`.
- Never run `phase_guardian_approval.py`; it writes to the database. Only edit its text check.
- Do not push. Stage only your changed files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context:
- Session 21 pinned the behavior. The scope checks in `AuthGuard` already find the modules with `installed.find(m => m.scopeKind === 'warehouse')` and `'finance'`; keep that pattern.
- `phase_guardian_approval.py` (guardian 15), check 1, reads `auth.guard.ts` and requires the texts `'attendance':`, `'finance-cartable':` and `'treasury-cartable':`.

3. Definitions:
- "module route access" means `routeAccess?: { guardAccessPermissions: string[]; pagePermissions: Record<string, string[]>; loginPermissions: string[]; loginActiveAppModule: string; resolveLoginRoute: (perms: string[]) => string }` on `WhFrontendModule`.
- Warehouse values: `guardAccessPermissions` = today's `WAREHOUSE_PERMISSIONS`; `pagePermissions` = the `ROUTE_PERMISSIONS` entries whose key is in `WAREHOUSE_ROUTE_KEYS` (lists copied verbatim, same order); `loginPermissions` = today's 12-item `hasWarehouse` list in `login.ts`; `loginActiveAppModule` = `'warehouse'`; `resolveLoginRoute` = today's priority chain.
- Accounting values: `PERSONNEL_PERMISSIONS`, the entries whose key is in `FINANCE_ROUTE_KEYS`, the 10-item `hasFinance` list, `'personnel'`, and a function returning `'/app/finance'`.
- Entries whose key is in neither set stay in the core `ROUTE_PERMISSIONS` of `auth.guard.ts`.

4. Task:
- a) Add the `routeAccess` type to `module-contract.ts`; create the two `route-access.ts` files with the values above and set `routeAccess` in each `module.ts`.
- b) `auth.guard.ts`: `hasRoutePermission(path, userPerms)` keeps its signature and looks the key up in the core map first, then in the `pagePermissions` of the installed modules (read at call time through `getModuleRegistry()`). In `AuthGuard`, compute `hasWarehouseAccess` and `hasPersonnelAccess` from `whModule?.routeAccess?.guardAccessPermissions` and `accModule?.routeAccess?.guardAccessPermissions` (admin still true); replace `WAREHOUSE_ROUTE_KEYS.has(path)` and `FINANCE_ROUTE_KEYS.has(path)` with membership in the `pagePermissions` of `whModule` and `accModule`; the per-page required list comes from the same lookup as `hasRoutePermission`. Keep every redirect target and branch order unchanged.
- c) `login.ts`: for each installed module with `routeAccess`, the user has it when superuser or when any `loginPermissions` entry is in the permissions. Two or more modules: `/app/launcher`. Exactly one: set `localStorage.active_app_module` to its `loginActiveAppModule` and use `resolveLoginRoute(perms)`. None: `/app/launcher`. Keep the password-change branch, the `returnUrl` override and the `navigateByUrl` failure handling unchanged.
- d) `phase_guardian_approval.py` check 1: read `auth.guard.ts` and `modules/accounting/route-access.ts` together and require the same three texts in the combined content. Change nothing else in that file.

5. Tool policy: in `warehouse-front`, at most two runs of `npx ng build --output-path ../scratch/ng-build-agent`; from the repo root, at most four runs of `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/modules/common/components/login/*.spec.ts" --include "src/app/core/auth/*.spec.ts"` and one run of `python scripts/e2e/guardian_57_front_module_fence.py`. If a command fails, read the output and change approach.

6. Before finishing: `git diff --stat` shows only the allowed files.

7. Output and stop condition:
- Commit with this message, without push:
refactor(route-access): login entry, guard access lists and module page permissions from the module contract
- Short English report: changed files, which `ROUTE_PERMISSIONS` keys stayed in core, the last ng-test-compare summary line, remaining doubts. End the turn after the commit and report.


===

[DONE] Session 23 of 23 — Release the end of phase 3 on the local app environment: backup, migration check, patched frontend build; the runner restarts Daphne and the GDrive worker and runs the health checks

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

2. Context: sessions 12 to 22 changed frontend code, frontend specs and guardian scripts, and added no migration. Your terminal may be PowerShell; if so, set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order:
- a) Backup. In `warehouse-backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app phase 3 end'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0. Do not continue without a successful backup.
- b) Migration check. `.\venv\Scripts\python.exe manage.py showmigrations --plan` must show no `[ ]` line. If any `[ ]` line appears, stop and report it; do not migrate.
- c) Frontend build. In `warehouse-front`, run `npx ng build --delete-output-path=false` in the foreground and wait for it to finish, then run `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.

4. Tool policy: only the commands above and `git status --short`. Run the build at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the backup filename and size, the `showmigrations` result, the build result (errors and warnings count) and the patch script line. Write the report only after the build and the patch have finished. No commit. End the turn after the report.
