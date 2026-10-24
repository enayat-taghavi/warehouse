[DONE] Session 1 of 1 — Release v1 step 2.3-c2: mechanical removal of the old SoD matrix code in backend and frontend (the model, its migration and the stress-test probes stay for Claude)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow backend/core/accounts/sod_cache_service.py backend/core/accounts/permissions.py backend/core/platform_core/registry.py backend/modules/accounting/module.py backend/modules/warehouse/module.py backend/modules/showcase/module.py scripts/module-template/backend/module.py backend/modules/accounting/personnel/apps.py backend/modules/accounting/personnel/sod_rules.py backend/modules/warehouse/warehouses/apps.py backend/modules/warehouse/warehouses/sod_rules.py backend/modules/accounting/personnel/phase_guardian_approval.py backend/integration_tests/test_sod_context_resolution.py scripts/e2e/guardian_50_users_sensitive_sync.py frontend/tools/dom-verify.js frontend/src/app/app.routes.ts "frontend/src/app/modules/common/components/operations/operations-rbac-governance/*" frontend/src/app/modules/common/components/operations/operations-layout/operations-layout.ts frontend/src/app/modules/common/components/operations/operations-cockpit/operations-cockpit.html frontend/src/app/core/modules/module-contract.ts frontend/src/app/modules/accounting/personas.ts frontend/src/app/modules/accounting/components/personnel/personnel-profiles/personnel-profiles.ts frontend/src/app/core/services/app-persona.characterization.spec.ts
verify: python -c "import os,sys; p=['backend/core/accounts/sod_cache_service.py','backend/modules/accounting/personnel/sod_rules.py','backend/modules/warehouse/warehouses/sod_rules.py','backend/integration_tests/test_sod_context_resolution.py','scripts/e2e/guardian_50_users_sensitive_sync.py','frontend/src/app/modules/common/components/operations/operations-rbac-governance']; left=[x for x in p if os.path.exists(x)]; print('still present:', left); sys.exit(1 if left else 0)"
verify: python scripts/automation/verify_tools.py glob-absent --root backend/core --glob *.py --regex "sod_cache_service|check_sod_prohibition|resolve_sod_context|SoDPolicyPermission|SoDCacheService|app_code_for_sod|sod_rules|sod_route_rules|sod_action_resolvers|sod_app_module|SOD_RULES|SOD_ROUTE_RULES"
verify: python scripts/automation/verify_tools.py glob-absent --root backend/modules --glob *.py --regex "sod_cache_service|check_sod_prohibition|resolve_sod_context|SoDPolicyPermission|SoDCacheService|app_code_for_sod|sod_rules|sod_route_rules|sod_action_resolvers|sod_app_module|SOD_RULES|SOD_ROUTE_RULES|SoDPolicyRule|FRONTEND_SOD_PROHIBITIONS|OperationsRbacGovernanceComponent|audit_guardian_9_|audit_guardian_11_"
verify: python scripts/automation/verify_tools.py glob-absent --root scripts/module-template --glob *.py --regex "sod_app_module"
verify: python scripts/automation/verify_tools.py glob-absent --root frontend/src --glob *.ts *.html --regex "rbac-governance|RbacGovernance|ACCOUNTING_SOD_PROHIBITIONS"
verify: python scripts/automation/verify_tools.py text-check --file frontend/tools/dom-verify.js --absent operations-rbac-governance
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/personnel/personnel-profiles/personnel-profiles.ts --absent canPerform( --contains perm_approve_personnel_finance --contains perm_approve_fleet_finance --contains canEditWageAndAllowances
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/warehouse/personas.ts --contains WAREHOUSE_SOD_PROHIBITIONS --contains sodProhibitions
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/core/services/app-persona.service.ts --contains isActionProhibited --contains canPerform
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/core/services/app-persona.characterization.spec.ts --absent approve_attendance_period --absent modify_employment_contracts --contains finalize_inventory_count --contains view_customs_and_costs
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/apps.py --contains "contribute('workflows', INVOICE_WORKFLOW_SPEC)" --contains "from platform_core.registry import contribute"
verify: python -m py_compile backend/modules/accounting/personnel/phase_guardian_approval.py backend/core/accounts/permissions.py backend/core/platform_core/registry.py
verify: python scripts/automation/verify_tools.py django-check
verify: python scripts/e2e/guardian_modularization.py
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_54_module_independence.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/e2e/guardian_58_scoped_has_perm.py
verify: python scripts/automation/verify_tools.py sample-module
verify: cd frontend && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/core/services/app-persona*.spec.ts" --include "src/app/modules/common/components/operations/**/*.spec.ts" --include "src/app/modules/accounting/components/personnel/personnel-profiles/*.spec.ts" --include "src/app/modules/common/components/users/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(release-v1 2.3-c2): remove the old SoD matrix code"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session only deletes dead code. Change only the files listed in the scope verify line. Do not add any new feature, permission, file or test.
- Do NOT touch these, they belong to another worker in parallel: `backend/core/accounts/models.py` (the `SoDPolicyRule` model and `get_app_module_choices` stay), every file under any `migrations/` folder, `backend/core/accounts/concurrency_stress_service.py`, `backend/core/accounts/concurrency_stress_test.py`, `scripts/e2e/core_literal_allowlist.json`, every file under `backend/modules/accounting/personnel/` other than `apps.py`, `sod_rules.py` and `phase_guardian_approval.py`, and every file under `Documents/`.
- Keep these unchanged (decision ق13 of the release plan): `frontend/src/app/modules/warehouse/personas.ts` (including `WAREHOUSE_SOD_PROHIBITIONS`), `frontend/src/app/core/services/app-persona.service.ts` (including `isActionProhibited` and `canPerform`), the `sodProhibitions` field of `ModulePersonas` in `frontend/src/app/core/modules/module-contract.ts` (line 29), and every use of `active_role`, `X-Active-Role` and `activeRole`.
- Do not run `makemigrations` or `migrate`. Do not run `manage.py test` without app labels. Never run `phase_guardian_approval.py` (it writes to the database).
- Do not push. Stage only your changed and deleted files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`. Do not edit anything under `scripts/` except deleting `scripts/e2e/guardian_50_users_sensitive_sync.py` and editing `scripts/module-template/backend/module.py` as described below.

2. Context:
- Plan `Documents/Release_v1/2.3_workflow/plan_2.3_workflow.md`: read the table row that starts with `| ت۱۸ |` and item 4 of the numbered list in section 3. Read nothing else of the plan.
- Background: the backend SoD matrix (`SoDPolicyRule` rows, `SoDCacheService`, `SoDPolicyPermission`, `check_sod_prohibition`) no longer blocks any request. Permissions from step 2.2 replaced it. The accounting forbidden-actions map in the frontend is replaced by the same permissions.

3. Definitions:
- "Delete a file" means `git rm` the file.
- "Remove a block" means delete the lines and any comment line directly above them that only describes them. Leave the surrounding code byte-identical.
- "The SoD regex" means the pattern in the `glob-absent` verify lines. After this session no `.py` file under `backend/core` or `backend/modules` matches it.

4. Task:
Backend:
- a) Delete `backend/core/accounts/sod_cache_service.py`.
- b) `backend/core/accounts/permissions.py`: remove the function `check_sod_prohibition` (starts at line 180), the function `resolve_sod_context` (line 210) and the class `SoDPolicyPermission` (lines 246 to 275). Keep line 277 (`from .scope import get_visible_users_for_user`) and everything above line 180.
- c) `backend/core/platform_core/registry.py`: remove the dataclass field `sod_app_module` (line 34) and the function `app_code_for_sod` (lines 298 to 305). Also remove the `sod_app_module=...` keyword line from `backend/modules/accounting/module.py` (line 45), `backend/modules/warehouse/module.py` (line 44), `backend/modules/showcase/module.py` (line 25) and `scripts/module-template/backend/module.py` (line 21).
- d) `backend/modules/accounting/personnel/apps.py`: remove lines 82 to 89 (the comment line about SoD rules, the `from personnel.sod_rules import ...` line and the three `contribute('sod_...')` statements with their `for` loops). KEEP line 83 `from platform_core.registry import contribute`, because the invoice workflow lines below it use `contribute`. Delete `backend/modules/accounting/personnel/sod_rules.py`.
- e) `backend/modules/warehouse/warehouses/apps.py`: remove lines 107 to 112 (the SoD comment, the import and both `for` loops). Delete `backend/modules/warehouse/warehouses/sod_rules.py`.
- f) Delete `backend/integration_tests/test_sod_context_resolution.py` (it only tests `resolve_sod_context`).
- g) `backend/modules/accounting/personnel/phase_guardian_approval.py`:
  - remove the whole method `audit_guardian_9_sod_database_and_redis_cache` (starts at line 855) and the whole method `audit_guardian_11_prohibited_actions_backend_barrier` (starts at line 1023);
  - in the runner block near line 3662, remove the lines `g9 = ...` and `g11 = ...`, and remove `g9 and ` and `g11 and ` from the `all_ok = (...)` expression;
  - in `audit_guardian_12_two_level_app_switcher_reactive` (line 1154), remove only the condition `and 'FRONTEND_SOD_PROHIBITIONS' in content`;
  - in `audit_guardian_14_smart_dom_red_lines_masking`, remove the block that starts with the comment `# Check 4: Frontend-Backend SoD Rules Absolute Consistency` (around line 1346) up to the line before `except Exception as e:`;
  - in `audit_guardian_15_e2e_superapp_integrity`, remove the block that starts with the comment `# Check 3: Full 16 SoD Rules Database & Cache Health` (around line 1397) up to the line before the comment `# Check 4: Cross-Module Round-Trip Spoofing Prevention`;
  - in `audit_guardian_27_operations_hub_phase2_specialized_pillars`, remove the block that starts with the comment line containing `OperationsRbacGovernanceComponent` (around line 3166) up to the line before the comment line that starts with `# ۴.`; in the `dedicated_routes_ok = (...)` expression below it remove only the line `"component: OperationsRbacGovernanceComponent" in routes_code and`.
- h) Delete `scripts/e2e/guardian_50_users_sensitive_sync.py` (it only reads the deleted governance page).

Frontend (paths relative to `frontend/src/app/`):
- i) Delete the folder `modules/common/components/operations/operations-rbac-governance/` (4 files: `.ts`, `.html`, `.css`, `.dom.spec.ts`).
- j) `app.routes.ts`: remove the import on line 17 and the route on line 85 (`{ path: 'rbac-governance', ... }`).
- k) `modules/common/components/operations/operations-layout/operations-layout.ts`: remove the menu item object with `id: 'rbac-governance'` (lines 185 to 190) and the comma before it so the array stays valid. If `PLATFORM_ENTITY_ICONS` is no longer used in the file, remove it from its import.
- l) `modules/common/components/operations/operations-cockpit/operations-cockpit.html`: remove card 5 (the comment line 239 that introduces card 5 and the whole `<a ...>` element from line 240 to its closing `</a>` on line 265). Keep card 6 and the rest unchanged.
- m) `core/modules/module-contract.ts` line 410: in the comment, remove only the text ` و operations-rbac-governance.ts`.
- n) `frontend/tools/dom-verify.js` line 25: remove the array entry for `operations-rbac-governance.html`.
- o) `modules/accounting/personas.ts`: remove the constant `ACCOUNTING_SOD_PROHIBITIONS` (lines 114 to 133) and the line `sodProhibitions: ACCOUNTING_SOD_PROHIBITIONS,` (line 199) from `ACCOUNTING_PERSONAS`.
- p) `modules/accounting/components/personnel/personnel-profiles/personnel-profiles.ts` lines 221 to 255: in the four getters `canApprovePersonnelManager`, `canApprovePersonnelFinance`, `canApproveFleetManager` and `canApproveFleetFinance`, remove the `if (!this.persona.canPerform(...)) { return false; }` block and keep the permission `return`. Replace the body of `canEditWageAndAllowances` with `return this.canApprovePersonnelFinance || this.canApprovePersonnelManager;` (wage fields follow the backend rule that only finance and manager approvers see and edit wages). Keep the `persona` constructor parameter if any other line of the file uses `this.persona`; otherwise keep it too (do not change the constructor).
- q) `core/services/app-persona.characterization.spec.ts`, section `e)` (lines 579 to 700): remove the 14 objects in `SOD_CASES` whose `app` is `'personnel'`. Keep the 2 objects with `app: 'warehouse'` and the loop unchanged. Do not change any other test in the file.

Out of scope: the conflict-resolution modal (`isSodRestricted`), texts in `health-dashboard.ts`, `operations-sync-monitor.html` and `employee-new-personnel*` that only mention the word SoD, and every test name containing `sod` in `backend/modules/accounting/personnel/tests_*.py`.

5. Tool policy:
- Reading files is unrestricted. Use `git rm` for deletions.
- From the repo root you may run: `python scripts/automation/verify_tools.py django-check` (at most 3 times), `python scripts/e2e/guardian_modularization.py`, `python scripts/e2e/guardian_57_front_module_fence.py`, `python -m py_compile <file>`, and `python scripts/automation/verify_tools.py ng-test-compare --base 432f003b --include "src/app/core/services/app-persona*.spec.ts" --include "src/app/modules/common/components/operations/**/*.spec.ts" --include "src/app/modules/accounting/components/personnel/personnel-profiles/*.spec.ts"` (at most 3 times).
- From `frontend`: `npx ng build --output-path ../scratch/ng-build-check` (at most 3 times).
- If a command fails, read its output and change approach; do not repeat the same call unchanged.

6. Before finishing:
- `git grep -n -E "sod_cache_service|check_sod_prohibition|resolve_sod_context|SoDPolicyPermission|SoDCacheService|app_code_for_sod|sod_rules|sod_app_module" -- backend/core backend/modules scripts/module-template` prints nothing.
- `git grep -n -E "rbac-governance|RbacGovernance|ACCOUNTING_SOD_PROHIBITIONS" -- frontend/src frontend/tools/dom-verify.js` prints nothing.
- The django-check, the build and the ng-test-compare run above pass, and `git status --short` shows only files from the scope verify line.

7. Output and stop condition:
- Commit with this message, without push:
refactor(release-v1 2.3-c2): remove the old SoD matrix code (cache service, permission class, route rules, registry field, guardian checks, governance page, accounting forbidden-actions map)
- Short English report: the list of deleted files, the list of edited files with one line each on what was removed, the summary lines of django-check, ng build and ng-test-compare, and anything you left in place on purpose. End the turn after the commit and the report.
