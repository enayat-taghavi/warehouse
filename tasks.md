[DONE] Session 1 of 2 — Release v1 step 2.3-e: invoice workflow scenario tests 1 and 2 (cartable hand-over at each step, unsupervised section, rejection reasons in history)

<!-- runner
parallel: e
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_invoice_workflow_flow.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_invoice_workflow_flow.py --contains /api/workflow/tasks/ --contains /api/workflow/history/ --contains no_recipient --contains test_scenario_1 --contains test_scenario_2
verify: set DB_TEST_NAME=test_agy_flow&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_invoice_workflow_flow --min-tests 3
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.3-e): invoice workflow scenarios 1 and 2"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Create exactly one new file: `backend/modules/accounting/personnel/test_invoice_workflow_flow.py`. Change no other file. Never edit any production code, any other test, anything under `scripts/` or `Documents/`, `tasks.md` or `tasks_history.md`.
- If a test fails because the production code behaves differently from this task, do not change production code and do not weaken the expectation silently: keep the test as written, mark it with `@unittest.expectedFailure`, and describe the difference in your report.
- Test method docstrings and comments are Persian, like the existing file.
- No push. Stage only your own file.

2. Context:
- Plan `Documents/Release_v1/2.3_workflow/plan_2.3_workflow.md`, section `## ۵. معیار پذیرش`, scenarios 1 and 2 of the numbered list.
- Existing tests to copy the fixture from: `backend/modules/accounting/personnel/test_invoice_workflow.py` lines 1–59 (imports, `setUp`, helpers `user`, `invoice`, `post`, `step`, `status`). Tests 1 and 2 there already check the step chain; your file adds what they do not check.
- Workflow API (read-only reference): `backend/core/workflow/urls.py`, `backend/core/workflow/views.py` classes `MyTasksView` and `HistoryView`, `backend/core/workflow/serializers.py` functions `task_card`, `history_step`, `history_instance`, `_skipped`.
  - `GET /api/workflow/tasks/` returns `{count, results, page, page_size}`; each card has `task_id`, `entity_kind` (`expense_invoice`), `entity_id`, `step_key`, `on_behalf_of`.
  - `GET /api/workflow/tasks/count/` returns `{count}`.
  - `GET /api/workflow/history/?kind=expense_invoice&id=<invoice pk>` returns `{entity_kind, entity_id, instances: [...]}`; each instance has `status`, `current_step` and `steps`; each step has `action` (`submit`, `act`, `return`, `reject`, `cancel`, `auto`), `actor`, `reason`, `skipped` (list of `{step, reason, reason_fa}`).
  - Invoice actions: `POST /api/personnel/expense-invoices/<pk>/<action>/` with `submit`, `approve`, `reject` (`reason` required), `request-revision` (`reason` required), `pay` (`tracking_code`), `cancel`; header `HTTP_X_COMPANY_ID`.
  - Step keys of the invoice workflow: `supervisor_ok`, `accountant_review`, `manager_ok`, `treasury_pay` (`backend/modules/accounting/personnel/workflows.py`).

3. Definitions:
- "Cartable of user U" = the set of `entity_id` values of cards with `entity_kind == 'expense_invoice'` in `GET /api/workflow/tasks/` for U (authenticated with `APIClient.force_authenticate`).

4. Task — new class `InvoiceFlowScenarioTests(TestCase)` in the new file, with the copied fixture:
- a) `test_scenario_1_each_step_moves_task_between_cartables`: employee invoice, submit. After submit the invoice is in the supervisor's cartable only (not in accountant, manager, treasury, employee). After the supervisor approves: in the accountant's cartable and no longer in the supervisor's. Then manager, then treasury, the same way. After `pay` with a tracking code it is in nobody's cartable and `GET /api/workflow/tasks/count/` is 0 for all five users. Also check the card `step_key` at each step.
- b) `test_scenario_2_supervisor_invoice_goes_to_accountant_and_reject_reason_in_history`: supervisor invoice, submit: in the accountant's cartable, the `submit` history step has `skipped` with step `supervisor_ok`. The accountant rejects with reason «فاکتور تکراری». History (read as the supervisor who created it): instance `status == 'rejected'`, one step with `action == 'reject'` and `reason == 'فاکتور تکراری'`. The invoice is in nobody's cartable.
- c) `test_scenario_2_unsupervised_section_employee_goes_to_accountant`: create a second section `IWF-S2` in the same project with an employee `emp2` and an accountant `acc3` (both assigned to that section with the `user` helper's `section` argument) and no supervisor. `emp2` submits an invoice in `IWF-S2` (add a `section` parameter to your copy of the `invoice` helper). The task is at `accountant_review` in `acc3`'s cartable; the `submit` history step skipped `supervisor_ok` with reason `no_recipient`. `acc3` rejects with reason «مدرک ناقص»; the history of that invoice shows it.

Out of scope: production code, other test files.

5. Tool policy:
- Reading files is unrestricted.
- From `backend`: `set DB_TEST_NAME=test_agy_flow&& set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test personnel.test_invoice_workflow_flow --noinput` (at most 6 times). Always set `DB_TEST_NAME` exactly like this; another agent uses the default test database at the same time.
- If a command fails, read its output and change approach; do not repeat the same call unchanged.

6. Before finishing:
- The test command above passes (or only your documented `expectedFailure` tests are marked).
- `git status --short` shows only your new file before the commit and nothing after it.

7. Output and stop condition:
- Commit with this message, without push:
test(release-v1 2.3-e): invoice workflow scenarios 1 and 2 (cartable hand-over, unsupervised section, reject reason in history)
- Short English report: the test names, the summary line of the test run, and any behaviour that differed from this task. End the turn after the commit and the report.

===

[DONE] Session 2 of 2 — Release v1 step 2.3-e: invoice workflow scenario tests 4 and 7 (no second approval label, return for fix restarts from the creator level)

<!-- runner
parallel: e
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_invoice_workflow_return.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_invoice_workflow_return.py --contains /api/workflow/tasks/ --contains /api/workflow/history/ --contains no_second_approval --contains request-revision --contains test_scenario_4 --contains test_scenario_7
verify: set DB_TEST_NAME=test_agy_return&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_invoice_workflow_return --min-tests 3
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.3-e): invoice workflow scenarios 4 and 7"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Create exactly one new file: `backend/modules/accounting/personnel/test_invoice_workflow_return.py`. Change no other file. Never edit any production code, any other test, anything under `scripts/` or `Documents/`, `tasks.md` or `tasks_history.md`.
- If a test fails because the production code behaves differently from this task, do not change production code and do not weaken the expectation silently: keep the test as written, mark it with `@unittest.expectedFailure`, and describe the difference in your report.
- Test method docstrings and comments are Persian, like the existing file.
- No push. Stage only your own file.

2. Context:
- Plan `Documents/Release_v1/2.3_workflow/plan_2.3_workflow.md`, section `## ۵. معیار پذیرش`, scenarios 4 and 7 of the numbered list.
- Existing tests to copy the fixture from: `backend/modules/accounting/personnel/test_invoice_workflow.py` lines 1–59 (imports, `setUp`, helpers `user`, `invoice`, `post`, `step`, `status`). Tests 4 and 7 there already check the step chain and the reject/cancel status codes; your file adds what they do not check.
- Workflow API (read-only reference): `backend/core/workflow/urls.py`, `backend/core/workflow/views.py` classes `MyTasksView` and `HistoryView`, `backend/core/workflow/serializers.py` functions `task_card`, `history_step`, `history_instance`, `_skipped` and the dict `SKIP_REASON_TITLES`.
  - `GET /api/workflow/tasks/` returns `{count, results, page, page_size}`; each card has `task_id`, `entity_kind` (`expense_invoice`), `entity_id`, `step_key`.
  - `GET /api/workflow/history/?kind=expense_invoice&id=<invoice pk>` returns `{entity_kind, entity_id, instances: [...]}`; each instance has `instance_id`, `status`, `current_step`, `can_cancel` and `steps`; each step has `action` (`submit`, `act`, `return`, `reject`, `cancel`, `auto`), `actor`, `reason`, `skipped` (list of `{step, reason, reason_fa}`).
  - Invoice actions: `POST /api/personnel/expense-invoices/<pk>/<action>/` with `submit`, `approve`, `reject` (`reason` required), `request-revision` (`reason` required), `pay` (`tracking_code`), `cancel`; header `HTTP_X_COMPANY_ID`. Invoice status after `request-revision` is `revision_required`.
  - Step keys of the invoice workflow: `supervisor_ok`, `accountant_review`, `manager_ok`, `treasury_pay` (`backend/modules/accounting/personnel/workflows.py`).

3. Definitions:
- "Cartable of user U" = the set of `entity_id` values of cards with `entity_kind == 'expense_invoice'` in `GET /api/workflow/tasks/` for U (authenticated with `APIClient.force_authenticate`).
- "All skipped of an invoice" = every `skipped` item of every step of every instance in its history.

4. Task — new class `InvoiceReturnScenarioTests(TestCase)` in the new file, with the copied fixture:
- a) `test_scenario_4_manager_invoice_without_other_manager_shows_no_second_approval`: manager invoice, submit, accountant approves. The task is at `treasury_pay`; all skipped of the invoice contain an item with step `manager_ok`, reason `no_second_approval` and `reason_fa == 'بدون تأیید دوم'`. The invoice is not in the manager's cartable at any point after submit.
- b) `test_scenario_7_return_for_fix_restarts_from_creator_level`: employee invoice, submit, supervisor approves, accountant calls `request-revision` with reason «مبلغ اشتباه است». Invoice status `revision_required`; it is in nobody's cartable; history has a step with `action == 'return'` and that reason. The employee changes the amount (save the model) and submits again: the task is at `supervisor_ok` again and in the supervisor's cartable (not in the accountant's), and the history now has two instances or a new `submit` step after the `return` step (assert whichever the API returns: read `HistoryView` and `history_instance` first and assert the real shape, then the step order `submit` → `act` → `return` → `submit` across the instances in order).
- c) `test_scenario_7_reject_locks_and_cancel_flag`: employee invoice, submit: history `can_cancel` is true for the employee. Supervisor approves: `can_cancel` is false and `POST cancel` returns 409. Accountant rejects with reason «تکراری»: status `rejected`, `submit` returns 400, and the invoice is in nobody's cartable.

Out of scope: production code, other test files.

5. Tool policy:
- Reading files is unrestricted.
- From `backend`: `set DB_TEST_NAME=test_agy_return&& set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test personnel.test_invoice_workflow_return --noinput` (at most 6 times). Always set `DB_TEST_NAME` exactly like this; another agent uses a different test database at the same time.
- If a command fails, read its output and change approach; do not repeat the same call unchanged.

6. Before finishing:
- The test command above passes (or only your documented `expectedFailure` tests are marked).
- `git status --short` shows only your new file before the commit and nothing after it.

7. Output and stop condition:
- Commit with this message, without push:
test(release-v1 2.3-e): invoice workflow scenarios 4 and 7 (no second approval label, return for fix restarts from the creator level)
- Short English report: the test names, the summary line of the test run, and any behaviour that differed from this task. End the turn after the commit and the report.

===

[DONE] Session 1 of 1 — Release v1 2.3 heavy checks: low-risk UI review fixes (accessibility, contrast, labels, states) in the workflow screens

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/common/components/my-tasks/my-tasks.html" --allow "frontend/src/app/modules/common/components/my-tasks/my-tasks.ts" --allow "frontend/src/app/modules/common/components/my-tasks/my-tasks.dom.spec.ts" --allow "frontend/src/app/shared/components/workflow-reason-dialog/workflow-reason-dialog.component.ts" --allow "frontend/src/app/shared/components/workflow-history/workflow-history.component.ts" --allow "frontend/src/app/shared/components/workflow-substitutes/workflow-substitutes.component.html" --allow "frontend/src/app/modules/common/components/operations/companies/company-workflow-tab/company-workflow-tab.component.html" --allow "frontend/src/app/shared/components/user-menu/user-menu.component.html"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/my-tasks/my-tasks.html --contains showOffline --contains role="status" --contains goBack
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/modules/common/components/my-tasks/*.spec.ts" --include "src/app/shared/components/user-menu/*.spec.ts"
verify: python -X utf8 scripts/e2e/guardian_52_icon_registry.py
verify: python -X utf8 scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(release-v1 2.3 heavy checks): UI review fixes"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 7 and 10 apply. Read `.claude/skills/design-system/SKILL.md` once before editing.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Change only these files: `frontend/src/app/modules/common/components/my-tasks/my-tasks.html`, `my-tasks.ts` and `my-tasks.dom.spec.ts` (same folder), `frontend/src/app/shared/components/workflow-reason-dialog/workflow-reason-dialog.component.ts`, `frontend/src/app/shared/components/workflow-history/workflow-history.component.ts`, `frontend/src/app/shared/components/workflow-substitutes/workflow-substitutes.component.html`, `frontend/src/app/modules/common/components/operations/companies/company-workflow-tab/company-workflow-tab.component.html`, `frontend/src/app/shared/components/user-menu/user-menu.component.html`.
- In `.ts` files change only what task items A1, A2 and A6 name, plus inline template markup in B and C. Never remove or rename an existing event handler, input, output, `*ngIf`/`*ngFor` condition or `appIcon` name. Never add inline `<svg>` content: icons only through `<svg appIcon="name">` with names that already exist in `frontend/src/app/shared/icons/icon-registry.ts`.
- All user-visible text is Persian. No `dark:` classes. No push. Stage only the files above.

2. Context:
- A UI review of the workflow screens (my-tasks page, reason dialog, history timeline, substitutes form, company workflow tab, user-menu task dot) found accessibility and state gaps. The fixes below are exact; apply them as written.
- `my-tasks.ts` uses `this.workflowTasks` with signals `loaded()`, `loading()`, `isStale()`, `cachedAt()`, `tasks()` and the method `refresh()`. It already has a `Router` field; read the field declarations before adding A2.

3. Task:
A. my-tasks
- A1. In `my-tasks.ts` add the getter `get showOffline(): boolean { return !this.workflowTasks.loaded() && !this.workflowTasks.loading() && this.workflowTasks.isStale() && this.workflowTasks.tasks().length === 0; }`. In `my-tasks.html` add, next to the existing error block of the list, a block `*ngIf="showOffline && activeTab === 'my-tasks'"` with `role="status"`, the text «فهرست کارها هنوز دریافت نشده؛ اتصال برقرار نیست» and a button «تلاش دوباره» that calls `refresh()` (same classes as the existing retry button of the unassigned error block). Show the stale banner only when `workflowTasks.cachedAt()` is truthy (add it to its `*ngIf`), and add `role="status"` to it and to the 409 notices container.
- A2. In `my-tasks.ts` add `goBack(): void { this.router.navigateByUrl('/app/launcher'); }` using the existing Router field name. In `my-tasks.html` add as the first child of the header title group an icon button (same classes as the existing refresh button) with `appIcon="arrow-right"` (if that name is not in the registry use `chevron-right`), `(click)="goBack()"`, `title="بازگشت"` and `aria-label="بازگشت"`.
- A3. Card actions: put the action buttons (not the document button) in a wrapper with `grid grid-cols-3 gap-2 sm:flex sm:flex-wrap` so the three actions fit one row on mobile.
- A4. Replace `text-slate-400` with `text-slate-500` in `my-tasks.html` (all occurrences). On the two filter selects replace `focus:ring-indigo-100` with `focus-visible:ring-indigo-500` and `focus:outline-none` with `focus-visible:outline-none`.
- A5. Add `role="alert"` to the list error block. In the empty state, when `selectedCompany || selectedWorkflow` show «موردی با این فیلتر یافت نشد» instead of the normal empty text.
- A6. In the `tabs` getter of `my-tasks.ts` add `shortLabel: 'من'` to the my-tasks tab and `shortLabel: 'بی‌گیرنده'` to the unassigned tab.
- A7. Add one test to `my-tasks.dom.spec.ts`: `showOffline` is true when `loadedSignal` is false, `loadingSignal` false, `isStaleSignal` true and `tasksSignal` empty; false when `tasksSignal` has one card.
B. workflow-reason-dialog (inline template in the `.ts`): overlay `z-50` → `z-[100]`; panel `rounded-2xl` → `rounded-3xl` plus `max-h-[90vh] overflow-y-auto`; textarea `focus:ring-indigo-100` → `focus-visible:ring-indigo-500` and add `aria-required="true"`; the red asterisk span gets `aria-hidden="true"`; the error paragraph gets `role="alert"`.
C. workflow-history (inline template in the `.ts`): `text-slate-400` → `text-slate-500`; `pr-4` → `ps-4`, `mr-1` → `ms-1`, `border-r-2` → `border-s-2`, `-right-[23px]` → `-end-[23px]`, `mr-auto` → `ms-auto`; the error block gets `role="alert"`.
D. workflow-substitutes.component.html: give every form control an `id` (prefix `wfsub-`) and its `<label>` a matching `for`; add `aria-label="جستجوی کاربر جانشین"` to the user search input; add `role="alert"` to every error paragraph or block; `text-slate-400` → `text-slate-500`; controls with `focus:border-indigo-500` also get `focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none`; `text-right` → `text-start`, `text-left` → `text-end`.
E. company-workflow-tab.component.html: `p-4.5` → `p-4 sm:p-5` (two places); the same `id`/`for` (prefix `cwf-`), `role="alert"`, contrast, focus-visible and `text-start`/`text-end` changes as in D; `text-amber-600` → `text-amber-700`; add `inputmode="numeric"` and `aria-label="سقف مبلغ"` to the threshold amount input; add above the form `<div *ngIf="error && !loading" role="alert" class="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm font-bold text-rose-700">{{ error }}</div>` (the component already has `error` and `loading`).
F. user-menu.component.html: inside the task dot near line 10 add `<span class="sr-only">{{ taskCount }} کار در انتظار</span>` and change `-right-0.5` → `-end-0.5`; in the substitutes modal (around lines 267–294) add `role="dialog" aria-modal="true" aria-label="جانشین موقت من"` to the panel and set the close button `title="بستن"` (same as its `aria-label`).

4. Tool policy:
- Reading files is unrestricted.
- From the repo root: `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/modules/common/components/my-tasks/*.spec.ts" --include "src/app/shared/components/user-menu/*.spec.ts"` (at most 4 times) and `python -X utf8 scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output and change approach; do not repeat the same call unchanged.

5. Before finishing:
- The spec command passes with no new failure; guardian 52 passes.
- `git status --short` shows only files from the list before the commit and nothing after it.

6. Output and stop condition:
- Commit with this message, without push:
fix(release-v1 2.3 heavy checks): UI review fixes (offline first-load state, back button, a11y labels and roles, contrast, focus rings, RTL classes)
- Short English report: what was changed per item A–F, anything skipped and why, the test summary line. End the turn after the commit and the report.

===

[DONE] Session 1 of 1 — Release v1 2.3 follow-up: Android check of the my-tasks page on app (seed scenario, log in on the emulator, one approve action, evidence, purge)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py text-check --file scratch/logs/android_check.txt --contains ACTION_OK --contains PURGE_OK
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- This is an operational task on the local test environment `app` (this Windows machine, test data only, no real users). Never touch `soft`.
- Change no tracked file. Do not commit. Write only under `scratch/logs/`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running. The only exception is the emulator in step C, which runs in its own Windows Terminal tab.
- The test passwords are in `scratch/qa_scenario_credentials.txt`. Never print a password in your reply, in a log you write, or in a file name. Pass it only to `adb shell input text`.
- adb is `E:\Android\Sdk\platform-tools\adb.exe` (call it by full path).

2. Context:
- The new staging APK (app id `ir.comanage.soft.test`, activity `ir.comanage.soft.MainActivity`) is already installed on the emulator AVD `AndroidTest15`. It talks to `https://app.farsalish.ir`, which this machine serves.
- The scenario seed creates the company QA-SCN and users `qa_scn_*`; `scratch/heavy/make_invoices.py` creates 5 submitted expense invoices, so some `qa_scn_*` users get open workflow tasks.
- `scratch/qa_scenario_credentials.txt` has one user per line, tab-separated: username, password, role, place.
- Helper: `backend\venv\Scripts\python.exe -X utf8 scratch\heavy\android_check_helper.py who|evidence|purge` (run from the repo root). `who` lists users with open tasks; `evidence` appends `ACTION_OK ...` to `scratch/logs/android_check.txt` when a `qa_scn_*` user closed a task in the last 2 hours; `purge` removes all scenario data and appends `PURGE_OK`.
- Emulator screen is 1080x2400 pixels. On the login page the username field centre is about (540, 1130), the password field about (540, 1338), the login button «ورود به سامانه» about (540, 1655).

3. Task:
A. Seed. In the `backend` folder (PowerShell): `$env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe -X utf8 manage.py seed_workflow_scenario`. Then, still in `backend`: `.\venv\Scripts\python.exe -X utf8 manage.py shell -c "exec(open('../scratch/heavy/make_invoices.py', encoding='utf-8').read())"`. Every `submit` line must show status 200; if not, stop and report the output.
B. From the repo root run the helper `who`. Pick the first listed user (most open tasks). If it prints `NO_OPEN_TASKS`, stop and report.
C. Run `adb devices`. If `emulator-5554` is not listed as `device`, start it with `wt.exe -w 0 new-tab --title "Android Emulator" cmd /k "E:\Android\Sdk\emulator\emulator.exe -avd AndroidTest15"` and repeat `adb shell getprop sys.boot_completed` (with a pause of at most 15 seconds between tries, at most 12 tries) until it prints 1.
D. `adb shell am force-stop ir.comanage.soft.test`, then `adb shell am start -n ir.comanage.soft.test/ir.comanage.soft.MainActivity`, wait about 8 seconds.
E. To find elements, use `adb shell uiautomator dump /sdcard/ui.xml` then `adb pull /sdcard/ui.xml scratch/logs/ui.xml` and read the XML: find the node by its `text`, `hint` or `content-desc`, and tap the centre of its `bounds` with `adb shell input tap X Y`. If the XML has no web page nodes, use the coordinates from the context and screenshots (`adb exec-out screencap -p > scratch/logs/android_<name>.png`) instead.
F. Log in: tap the username field, `adb shell input text <username>`; tap the password field, `adb shell input text <password>`; tap «ورود به سامانه». Wait about 8 seconds. If the app asks to choose a system or role, choose the accounting one («مالی» / «حسابداری»).
G. Open «کارهای من»: find a node whose text contains «کارهای من» and tap it. If none is visible, tap the profile button (its `content-desc` or text contains «پروفایل کاربری») and then «کارهای من». Wait about 5 seconds and save `scratch/logs/android_mytasks_before.png`.
H. On the first task card tap the green approve button (text «بررسی» or «تایید»). If a dialog with «دلیل اقدام» opens, tap its text box, `adb shell input text test`, then tap its confirm button. Wait about 8 seconds and save `scratch/logs/android_mytasks_after.png`.
I. Run the helper `evidence`. If it wrote `ACTION_MISSING`, repeat steps G–I once.
J. Run the helper `purge`. It must print `PURGE_OK`.

4. Tool policy:
- Reading files is unrestricted. Allowed commands: the commands named above, `adb` (devices, shell input, shell am, shell getprop, shell uiautomator dump, pull, exec-out screencap), `Get-Content`/`Select-String` for reading, and `git status --short`.
- At most 40 adb calls in total. If a command fails, read its output and change approach; do not repeat the same call unchanged.

5. Before finishing:
- `scratch/logs/android_check.txt` contains a line `ACTION_OK` and a line `PURGE_OK`.
- `git status --short` prints nothing.

6. Output and stop condition:
- No commit.
- Short English report: the user picked (username only), what was visible on the my-tasks page before and after the action (from the screenshots), the `ACTION_OK` line, the purge result, and anything that did not work. End the turn after the report.

===

[DONE] Session 1 of 4 — Release v1 step 2.9-c part 1: users page layout at 360px and accessibility (users.html, users.ts)

<!-- runner
parallel: u1
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/common/components/users/users.html" "frontend/src/app/modules/common/components/users/users.ts" "frontend/src/app/modules/common/components/users/users.css" "frontend/src/app/modules/common/components/users/users.spec.ts"
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file frontend/src/app/modules/common/components/users/users.spec.ts
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/users/users.html --absent p-4.5 --absent "گام ۱ از ۴" --absent "گام ۲ از ۴" --absent "گام ۴ از ۴" --absent "گام بعدی" --absent "گام قبلی" --absent "toggle-switch shrink-0" --absent "bottom-6 left-1/2" --contains aria-invalid --contains aria-describedby --contains app-toggle-switch --contains idPrefix="user-modal" --count "3:app-tab-bar" --regex-absent "[\U0001F300-\U0001FAFF\u2705\u2713\u274C\u26A0]" --regex-absent "text-\[[5-9]px\]"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/users/users.spec.ts --contains openUserAssignments --contains aria-invalid --contains user-modal-tab-permissions
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/modules/common/components/users/**/*.spec.ts" --include "src/app/shared/components/user-menu/**/*.spec.ts"
verify: python -X utf8 scripts/e2e/guardian_52_icon_registry.py
verify: python -X utf8 scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python -X utf8 scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(release-v1 2.9-c): users page at 360px"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 7 and 10 apply. Read `.claude/skills/design-system/SKILL.md` once before editing.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Change only these files in `frontend/src/app/modules/common/components/users/`: `users.html`, `users.ts`, `users.css`, `users.spec.ts`. Never edit `user-permissions-tab/*`, `role-bundles-panel/*`, any shared component, anything under `scripts/` or `Documents/`, `tasks.md` or `tasks_history.md`.
- Never add inline `<svg>` content: icons only through `<svg appIcon="name">` with names that already exist in `frontend/src/app/shared/icons/icon-registry.ts` (guardian 52 checks it).
- Never remove an existing `it(` test from `users.spec.ts`. When a test queries markup that you replace (for example the old modal tab buttons with `data-user-permissions-tab` / `data-user-substitute-tab`), update the selector in that test so it still checks the same behaviour.
- All user-visible text is Persian. Numbers shown to the user use the existing `formatFa(...)` helper of the component. No `dark:` classes. No push. Stage only the files above.
- Do not change these behaviours (they are covered by existing tests; keep them green): permission gating `canAddUsers()` / `canEditUsers()` / `canWriteRoles()`; the password is never sent for another user (`isEditingOtherUser`); the one-time password panel does not close on Escape; `extractApiError`; live update logic `subscribeDirectoryChanges`, `refetchEditingUser`, `userFormBaseline`, `isUserFormDirty`; offline disabling (`isOffline`, `offlineTitle`).

2. Context:
- Plan `Documents/Release_v1/2.9_users/plan_2.9_users.md`, section `## ۳. کارها`, subsection `### ۲.۹-ج` (the list of visual and accessibility goals), and section `## ۵. معیار پذیرش` (at 360px no horizontal scroll and no button smaller than 40px).
- `users.html` landmarks (line numbers are approximate, verify before editing): sticky header and toolbar lines 1–150 (search 52–61, warehouse filter 63–76, role filter 78–91, status chips 93–126, view-mode switch 133–148); grid cards from 190; grid "load more" 333; table view 340–540 (row icon buttons around 505–540 use `p-1.5`); table pagination 541–598; bulk action bar 600–630; role modal from 826 (`role="dialog"`, `aria-labelledby="role-modal-title"`); user modal from 1188 (`aria-labelledby="user-modal-title"`), its inner tab buttons 1236–1301, identity step 1316–1546, security step 1551–1685 (username field around 1580–1590, `is_active` and `is_superuser` switches around 1649 and 1666 use `<label class="toggle-switch ...">`), roles step 1690–1795, warehouses/scope step 1810–1960; one-time password dialog from 2080 (`aria-labelledby="otp-title"`).
- `users.ts`: `userTabs` getter with a cache (lines 74–100) is the pattern for a stable tab array; `userModalInnerTab` (line 328) and `setUserModalInnerTab(...)` (line 1701); `requestCloseUserModal()` (line 1709) asks before closing a dirty form; the Escape key handler near line 1782; `openUserAssignments(companyId)` (line 1792) closes the modal directly with `this.isUserModalOpen = false`; `userViewMode` (line 344) and `setViewMode` (line 381); `userFieldMessages` holds per-field server errors.
- Shared tab bar: `frontend/src/app/shared/components/tab-bar/tab-bar.component.ts` — `TabDef` has `id`, `label`, `shortLabel`, `icon`, `count`, `tone`, `indicator: { tone: 'emerald'|'amber'|'rose'; label; pulse? }`; inputs `tabs`, `active`, `mobile` ('short'|'icon'), `idPrefix`; output `activeChange`. With `idPrefix="user-modal"` each tab button gets `id="user-modal-tab-<tab id>"`.
- Shared switch: `frontend/src/app/shared/components/toggle-switch/toggle-switch.component.ts` — selector `app-toggle-switch`, inputs `checked`, `label`, `title`, output `checkedChange`.
- Focus trap pattern to copy (logic only): `frontend/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts` method `handleFocusTrap` (around lines 360–400).

3. Definitions:
- "Mobile" = below the Tailwind `md` breakpoint (768px). "360px" = the page width used for the acceptance check.
- "Logical classes" = `ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e` instead of `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right/border-l/border-r`.
- "Token colors" = `bg-surface`, `text-fg`, `border-line` and their variants from `tailwind.config.js`; use them for new or touched neutral surfaces, keep semantic colors (rose/emerald/amber/indigo) as they are.

4. Task:
A. Header and filters (users.html 1–150, users.ts):
- A1. Add `showUserFilters = false` to `users.ts` and a button in the users toolbar, visible only below `md` (`md:hidden`), with `appIcon="filter"`, `title`/`aria-label` «فیلترها», `[attr.aria-expanded]="showUserFilters"`, `aria-controls="users-filters"`, min size 40x40px, toggling `showUserFilters`. Wrap the warehouse filter, role filter and status chips in `<div id="users-filters" ...>` that is hidden below `md` unless `showUserFilters` is true (`[ngClass]="showUserFilters ? 'flex' : 'hidden md:flex'"` or equivalent) and always visible from `md`. The search field stays always visible.
- A2. Keep the header short on mobile: the sticky container keeps `sticky top-0`; reduce its vertical spacing on mobile (`space-y-2 md:space-y-2.5`, `pb-1.5 md:pb-2`). Give the warehouse and role selects an `id` and a `<label for>` with class `sr-only` (Persian texts «فیلتر انبار», «فیلتر نقش سازمانی»), and the search input `aria-label="جستجوی کاربران"`.
- A3. Table view only from `md`: the view-mode switch (133–148) gets `hidden md:flex`. The grid block (190) renders when `userViewMode === 'grid'` OR on mobile: change its `*ngIf` to drop the `userViewMode === 'grid'` condition and add `[ngClass]="{ 'md:hidden': userViewMode === 'table' }"`; do the same for the grid "load more" block (333). The table block (340) and the pagination block (541) get `hidden md:block` / `hidden md:flex` added to their classes. Result: below `md` the cards are always shown, from `md` the selected mode is shown.
- A4. Row icon buttons of the table (around 505–540) and the grid card menu button (around line 244, `p-1 sm:min-w-[28px] sm:min-h-[28px]`): every icon-only button gets `min-w-[40px] min-h-[40px] inline-flex items-center justify-center` and keeps its `title` and `aria-label`. The search clear button (around 58) gets `aria-label="پاک کردن جستجو"` and `title` with the same text.
B. Bulk action bar (600–630): replace `fixed bottom-6 left-1/2 -translate-x-1/2` with `fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] sm:inset-x-0 sm:mx-auto sm:w-fit`, add `flex-wrap justify-center`, and make each button in it at least 40px high. Add bottom padding to the page root (line 1, `pb-10`) while the bar is visible, using the same condition as the bar's `*ngIf`: `[ngClass]="{ 'pb-32': <that condition> }"`.
C. User modal tabs (1236–1301, users.ts):
- C1. Replace the six hand-made tab buttons with `<app-tab-bar [tabs]="userModalTabs" [active]="userModalInnerTab" (activeChange)="setUserModalInnerTab($any($event))" mobile="icon" idPrefix="user-modal" />`. Add a cached getter `userModalTabs` in `users.ts` following the `userTabs` cache pattern (rebuild only when its key changes). Tabs and icons: `identity` «هویت و تماس» `user`; `security` «امنیت و ورود» `key`; `roles` «نقش‌های سازمانی» `shield`; `warehouses` with the current label expression of that tab button and `building`; `permissions` «مجوزها» `lock` and `substitute` «جانشین موقت» `users` only when `editingUser?.id`. Move the existing check mark and error dot conditions into `indicator`: error condition → `{ tone: 'rose', label: 'خطا در این بخش', pulse: true }`, otherwise valid condition → `{ tone: 'emerald', label: 'تکمیل شده' }`. Put each tab's content in a container with `id="user-modal-panel-<tab id>"`, `role="tabpanel"`, `aria-labelledby="user-modal-tab-<tab id>"`.
- C2. Remove the step navigation bars at the end of each step («گام بعدی …», «گام قبلی …», around 1539–1546, 1675–1685, 1785–1795, 1955–1960) and the «گام ۱ از ۴», «گام ۲ از ۴», «گام ۴ از ۴» badges (around 1325, 1560, 1827). Remove handler methods in `users.ts` only if nothing else calls them (search the whole `frontend/src` first).
- C3. Move the username field block (label, input, its error paragraph and hint, around 1575–1592) from the security step to the top of the identity step. Keep its `name`, `id`, bindings and validation unchanged.
- C4. Replace every `p-4.5` with `p-4`.
- C5. Replace the two `<label class="toggle-switch ...">` switches (`is_active`, `is_superuser`) with `<app-toggle-switch [checked]="userForm.is_active" (checkedChange)="userForm.is_active = $event" title="وضعیت حساب" />` and `<app-toggle-switch [checked]="userForm.is_superuser" (checkedChange)="userForm.is_superuser = $event" title="مدیر ارشد" />` (import `ToggleSwitchComponent` in the component `imports`). Keep the surrounding `*ngIf`.
- C6. Replace every emoji in `users.html` (for example 👤 🛡️ 🔑 ✓ ✅ ⚠️) with `<svg appIcon="..." class="w-4 h-4" aria-hidden="true"></svg>` using existing icon names (`user`, `shield`, `key`, `status-approved`, `alert-triangle`, ...). Remove `<span class="text-sm">` wrappers that only held an emoji.
D. Accessibility of the forms (users.html, users.ts):
- D1. For every input/select/textarea that has a `data-field-error="<field>"` paragraph: give the paragraph `id="user-field-error-<field>"` and the control `[attr.aria-invalid]="userFieldMessages['<field>'] ? 'true' : null"` and `[attr.aria-describedby]="userFieldMessages['<field>'] ? 'user-field-error-<field>' : null"`. Every such control must have a `<label for>` matching its `id`; add missing `id`s (prefix `user-`).
- D2. Add inline error paragraphs, same pattern as D1 (`data-field-error`, `role="alert"`, `id="user-field-error-<field>"`), for `groups` (below the roles list of the roles step), `assigned_warehouses` and `company_ids` (below the scope lists of the warehouses step). Their containers get the same `aria-describedby` binding.
- D3. Focus trap: in `users.ts` add a `keydown` handler for Tab and Shift+Tab (extend the existing document keydown/Escape handler near line 1782, do not add a second listener of the same event) that keeps focus inside the topmost open dialog among the user modal, the role modal and the one-time password dialog (query `[role="dialog"][aria-modal="true"]`, take the last one in DOM order). Copy the first/last focusable logic of `handleFocusTrap` from the backup tab. Escape behaviour stays exactly as it is now.
- D4. Role modal read-only when offline: wrap the role form fields in `<fieldset [disabled]="isOffline" class="contents">` (or the existing read-only condition of the role modal if one exists; read the role modal first) so that no field can be changed offline. The close button stays outside the fieldset.
- D5. `openUserAssignments(companyId)` must go through the dirty check: make it `async`, call `await this.requestCloseUserModal()`, and navigate only if `this.isUserModalOpen` is false afterwards.
E. Small fixes (users.html): replace physical classes with logical ones (definition in section 3) in every line you touch and in the toolbar 1–150, the bulk bar and the modal header; every text size below 10px (`text-[8px]`, `text-[9px]`) becomes `text-[10px]`; `text-slate-400` on text (not icons) becomes `text-slate-500`; focus styles `focus:ring-indigo-100` on the elements you touch become `focus-visible:ring-2 focus-visible:ring-indigo-500`.
F. Tests in `users.spec.ts` (new `describe('۲.۹-ج — ظاهر و دسترس‌پذیری', ...)`), at least these `it(` cases:
- the filter toggle button flips `showUserFilters` and `aria-expanded`;
- with `userViewMode = 'table'` the grid block has class `md:hidden` and the table block has class `hidden`;
- the user modal renders `app-tab-bar` with a button `#user-modal-tab-permissions` only when `editingUser.id` is set, and clicking it sets `userModalInnerTab` to `permissions`;
- the username input is inside `#user-modal-panel-identity`;
- with `userFieldMessages = { phone_number: 'x' }` the phone input has `aria-invalid="true"` and `aria-describedby="user-field-error-phone_number"`;
- with `userFieldMessages = { groups: 'x' }` an element `[data-field-error="groups"]` is shown;
- `openUserAssignments(5)` with a dirty form asks first (spy on `requestCloseUserModal` or on the confirm service the existing dirty-close tests use) and does not navigate when the answer is no;
- the `is_active` switch is an `app-toggle-switch` and its `checkedChange` updates `userForm.is_active`.

5. Tool policy:
- Reading files is unrestricted.
- From the repo root: `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/modules/common/components/users/**/*.spec.ts" --include "src/app/shared/components/user-menu/**/*.spec.ts"` (at most 5 times), `python -X utf8 scripts/e2e/guardian_52_icon_registry.py`, `python -X utf8 scripts/e2e/guardian_56_change_integrity.py --base HEAD`.
- If a command fails, read its output and change approach; do not repeat the same call unchanged.

6. Before finishing:
- The spec command passes with no new failure; guardians 52 and 56 pass.
- `git status --short` shows only files from the list before the commit and nothing after it.

7. Output and stop condition:
- Commit with this message, without push:
feat(release-v1 2.9-c): users page at 360px (collapsible filters, cards below md, full-width bulk bar, modal tab bar, no step bars, toggle switch, icons) and accessibility (field errors, focus trap, offline role fieldset, dirty check before assignments)
- Short English report: what was changed per item A–F, anything skipped and why, the test summary line. End the turn after the commit and the report.

===

[DONE] Session 2 of 4 — Release v1 step 2.9-d part 1: server scenario tests for user management (company manager, project manager, shared user)

<!-- runner
parallel: u1
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/core/accounts/test_user_scenarios_29.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/core/accounts/test_user_scenarios_29.py --contains one_time_password --contains requires_password_change --contains users_changed --contains MSG_NOT_CONTROLLED --contains /avatar/ --contains /api/accounts/roles/ --contains captureOnCommitCallbacks --contains Project.objects.create --count "8:def test_"
verify: set DB_TEST_NAME=test_agy_users29&& python scripts/automation/verify_tools.py django-tests --labels accounts.test_user_scenarios_29 --min-tests 8
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.9-d): user management scenarios"
verify: python scripts/automation/verify_tools.py clean-tree
verify-merged: set DB_TEST_NAME=test_agy_users29m&& python scripts/automation/verify_tools.py django-tests --labels accounts --min-tests 140
verify-merged: python scripts/automation/verify_tools.py migrations-unchanged
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Create exactly one new file: `backend/core/accounts/test_user_scenarios_29.py`. Change no other file. Never edit production code, any other test, anything under `scripts/` or `Documents/`, `tasks.md` or `tasks_history.md`.
- Never run `manage.py test` without an app label (it would run root scripts against the real database).
- If a test fails because the production code behaves differently from this task, do not change production code and do not weaken the expectation silently: keep the test as written, mark it with `@unittest.expectedFailure`, and describe the difference in your report.
- Test docstrings and comments are Persian, like the existing files. No push. Stage only your own file.

2. Context:
- Plan `Documents/Release_v1/2.9_users/plan_2.9_users.md`, section `## ۳. کارها`, subsections `### ۲.۹-الف` and `### ۲.۹-د`, and the 2.9-الف entry of section `## ۷. گزارش پیشرفت` (the rules: a manager changes only a user all of whose companies are among the manager's own companies and who has no permission the manager lacks; another user's password only through reset with a random one-time password).
- Fixture to copy: `backend/core/accounts/test_user_scope_29.py` lines 1–64 (imports, `UserScope29Base.setUp` with companies `a`/`b`, `admin`, `manager`, `local`, `shared`, `peer`, `outsider`, helpers `make_user`, `link`, `as_user`; `pe._send` is patched to collect messages in `self.sent`). Reference tests in the same file: `OneTimePasswordAndCardTests` (create returns `one_time_password`) and `UsersChangedEventTests` (`captureOnCommitCallbacks(execute=True)` and filtering `self.sent` by `type_str == 'users_changed'`).
- Role tests to copy the role setup from: `backend/core/accounts/test_admin_scope_29.py` class `RoleScopeTests` (lines 167–200, `ROLES_URL = '/api/accounts/roles/'`, `CustomRole.objects.create(...)`, `role.user_set.add(...)`).
- Endpoints (`backend/core/accounts/views_domains/user_views.py`): `POST /api/accounts/users/` (create; body `username`, `first_name`, `last_name`, `phone_number`, `company_ids`; response 201 with `one_time_password` when no password is sent); `PATCH /api/accounts/users/<id>/` (edit); `PATCH /api/accounts/users/<id>/toggle_status/` with `{'is_active': bool}`; `POST /api/accounts/users/<id>/admin_reset_password/` (response `one_time_password`; sets `requires_password_change = True`); `POST` and `DELETE /api/accounts/users/<id>/avatar/` (multipart field `avatar`; response `avatar`); `DELETE /api/accounts/users/<id>/` (204). Control checks raise 403 with `accounts.scope.MSG_NOT_CONTROLLED` (shared user) or `MSG_OUTRANKED` (target has more permissions).
- Models: `companies.models.Project` (`company`, `code`, `name`), `companies.models.SectionAssignment` (`user`, `company` or `project` or `section`, `role`, `is_active`).

3. Definitions:
- "Company manager" = `self.manager` of the copied fixture.
- "Project manager" = a new user `s29_pm` with permissions `view_sys_users`, `perm_usr_edit`, `perm_usr_add`, a `UserCompanyAccess(company=a, section_levels={'user_access': 'write'})`, and an active `SectionAssignment(user=pm, project=P, role='manager')` where `P = Project.objects.create(company=self.a, code='S29-P', name='پروژهٔ ۲۹')`; no company-level assignment.
- "users_changed events of a block" = items of `self.sent` with `type_str == 'users_changed'` collected while the request runs inside `with self.captureOnCommitCallbacks(execute=True):`; clear `self.sent` before each block.
- "Small image" = a 10x10 PNG built with Pillow into `io.BytesIO`, sent as `SimpleUploadedFile('a.png', data, content_type='image/png')`.

4. Task — new file with a base class copying the fixture (plus the project manager) and these tests (one `def test_` each, at least 8):
- a) `test_company_manager_full_cycle_on_local_user`: as the company manager: create a user with `company_ids=[a.id]` → 201, `one_time_password` non-empty, `check_password(otp)` true, `requires_password_change` true; edit `first_name` → 200; toggle off → 200 and inactive, toggle on → 200; reset → 200, new `one_time_password` works, `requires_password_change` true; avatar upload → 200 with a non-empty `avatar`, avatar delete → 200 with `avatar` None; delete → 204 and the user no longer exists. For create, edit, toggle and delete: users_changed events go only to `company_<a.id>_notifications` (never `global_notifications`, never company b). Wrap the test class with `@override_settings(MEDIA_ROOT=<a tempfile.mkdtemp() directory>)` and remove that directory in `tearDownClass` or `addCleanup` with `shutil.rmtree(path, ignore_errors=True)` (only that temporary directory).
- b) `test_project_manager_can_manage_local_user`: as the project manager on `self.local`: edit → 200, toggle off/on → 200, reset → 200 with `one_time_password`, delete → 204.
- c) `test_company_manager_cannot_touch_shared_user`: as the company manager on `self.shared`: GET detail → 200; edit, toggle, reset, avatar upload and delete → each 403; the 403 of edit (or of the first write that returns 403) has `detail == MSG_NOT_CONTROLLED`; afterwards `self.shared` still exists, is active, its password still is `pass-1234-x` and its name is unchanged.
- d) `test_project_manager_cannot_touch_shared_user`: the same writes as in c) as the project manager → each 403.
- e) `test_superuser_manages_shared_user_and_event_reaches_both_companies`: as `self.admin` on `self.shared`: toggle off → 200; users_changed events go to the channels of both company a and company b; reset → 200 with `one_time_password`.
- f) `test_outsider_is_invisible_to_company_manager`: as the company manager: GET detail of `self.outsider` → 404; PATCH edit → 403 or 404 (`assertIn`); the outsider is unchanged.
- g) `test_shared_role_rename_is_403_with_persian_detail`: a role writer `s29_role_mgr` (permissions `view_sys_users`, `perm_usr_edit`, `perm_usr_role`, `UserCompanyAccess(company=a, section_levels={'user_access': 'write'})`); a role shared by `self.local` and `self.outsider`; PATCH `title` as the role writer → 403, the response `detail` contains Persian letters (`re.search('[\u0600-\u06FF]', detail)`), the title is unchanged; a role whose only member is `self.local` → PATCH `title` 200.
- h) `test_create_with_other_company_is_refused`: as the company manager, create with `company_ids=[a.id, b.id]` → status 400 or 403 (`assertIn`) and no user with that username exists.

Out of scope: production code, other test files.

5. Tool policy:
- Reading files is unrestricted.
- From `backend`: `set DB_TEST_NAME=test_agy_users29&& set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test accounts.test_user_scenarios_29 --noinput` (at most 6 times). Always set `DB_TEST_NAME` exactly like this; another agent works at the same time.
- If a command fails, read its output and change approach; do not repeat the same call unchanged.

6. Before finishing:
- The test command passes (or only your documented `expectedFailure` tests are marked).
- `git status --short` shows only your new file before the commit and nothing after it.

7. Output and stop condition:
- Commit with this message, without push:
test(release-v1 2.9-d): user management scenarios (company manager, project manager, shared user, superuser, shared role, users_changed channels)
- Short English report: the test names, the summary line of the test run, and any behaviour that differed from this task. End the turn after the commit and the report.

===

[DONE] Session 3 of 4 — Release v1 step 2.9-c part 2: permissions tab, role bundles, my substitute and user menu at 360px and accessibility

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/common/components/users/user-permissions-tab/*" "frontend/src/app/modules/common/components/users/role-bundles-panel/*" "frontend/src/app/shared/components/workflow-substitutes/*" "frontend/src/app/shared/components/user-menu/user-menu.component.html"
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file frontend/src/app/modules/common/components/users/user-permissions-tab/user-permissions-tab.dom.spec.ts frontend/src/app/modules/common/components/users/role-bundles-panel/role-bundles-panel.spec.ts frontend/src/app/shared/components/workflow-substitutes/workflow-substitutes.component.spec.ts frontend/src/app/shared/components/user-menu/user-menu.component.spec.ts
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/components/workflow-substitutes/workflow-substitutes.component.html --contains usersLoadError --contains md:hidden --contains "hidden md:block"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/components/workflow-substitutes/workflow-substitutes.component.spec.ts --contains usersLoadError
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/users/user-permissions-tab/user-permissions-tab.html --absent p-4.5 --regex-absent "[\U0001F300-\U0001FAFF\u2705\u2713\u274C\u26A0]" --regex-absent "text-\[[5-9]px\]"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/users/role-bundles-panel/role-bundles-panel.html --absent p-4.5 --regex-absent "[\U0001F300-\U0001FAFF\u2705\u2713\u274C\u26A0]" --regex-absent "text-\[[5-9]px\]"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/modules/common/components/users/**/*.spec.ts" --include "src/app/shared/components/user-menu/**/*.spec.ts" --include "src/app/shared/components/workflow-substitutes/**/*.spec.ts"
verify: python -X utf8 scripts/e2e/guardian_52_icon_registry.py
verify: python -X utf8 scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python -X utf8 scripts/e2e/guardian_57_front_module_fence.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(release-v1 2.9-c): permissions tab, role bundles"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 7 and 10 apply. Read `.claude/skills/design-system/SKILL.md` once before editing.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Change only these files: everything in `frontend/src/app/modules/common/components/users/user-permissions-tab/`, everything in `frontend/src/app/modules/common/components/users/role-bundles-panel/`, everything in `frontend/src/app/shared/components/workflow-substitutes/`, and `frontend/src/app/shared/components/user-menu/user-menu.component.html`. Never edit `users.html`, `users.ts`, `users.spec.ts`, other shared components, anything under `scripts/` or `Documents/`, `tasks.md` or `tasks_history.md`.
- In `.ts` files change only what the task items name. Never remove or rename an existing event handler, input, output, `*ngIf`/`*ngFor` condition or `appIcon` name. Never add inline `<svg>` content: icons only through `<svg appIcon="name">` with names that already exist in `frontend/src/app/shared/icons/icon-registry.ts`.
- Never remove an existing `it(` test. All user-visible text is Persian; numbers shown to the user in Persian digits (use the component's existing formatting helper or a shared helper it already imports; if none, `Number(x).toLocaleString('fa-IR')`). No `dark:` classes. No push. Stage only the files above.
- Do not change permission or scope logic (which assignments, roles or substitutes a user may see or change), API calls or their payloads.

2. Context:
- Plan `Documents/Release_v1/2.9_users/plan_2.9_users.md`, section `## ۳. کارها`, subsection `### ۲.۹-ج` (bullet «جانشین من» and the visual/accessibility bullets), and section `## ۵. معیار پذیرش` (at 360px no horizontal scroll and no button smaller than 40px).
- `workflow-substitutes.component.ts`: `loadUsers()` (lines 134–152) loads substitute candidates with `getSubstituteCandidates`; its `error` callback only empties `availableUsers` and gives no message. `loadSubstitutes()` (109–132) sets `error`. The template shows the substitutes as a `<table>` (around lines 231–235 of the html) on every screen size; the header close button was already moved (do not move it again).
- `user-menu.component.html`: the «جانشین موقت من» modal (around lines 265–298) hosts `app-workflow-substitutes`.

3. Definitions:
- "Mobile" = below the Tailwind `md` breakpoint (768px).
- "Logical classes" = `ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e` instead of `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right/border-l/border-r`.

4. Task:
A. workflow-substitutes:
- A1. Add `usersLoadError = ''` to the component. In `loadUsers()` clear it at start and set it in the `error` callback to «فهرست کاربران قابل انتخاب دریافت نشد». In the template, next to the candidate select, show `<div *ngIf="usersLoadError" role="alert" ...>` with the message and a button «تلاش دوباره» (min height 40px) calling `loadUsers()`.
- A2. Show the substitutes list as cards below `md`: keep the existing table inside a wrapper with `hidden md:block`, and add before it a `md:hidden` list of cards (`*ngFor` over the same array, same fields and the same action buttons with the same handlers and conditions, each card `rounded-2xl border border-line bg-surface p-3`).
- A3. Every icon-only button at least 40x40px with Persian `title` and `aria-label`; every control has an `id` with prefix `wfsub-` and a `<label for>` (add only the missing ones); physical → logical classes; `text-[8px]`/`text-[9px]` → `text-[10px]`.
- A4. Tests in `workflow-substitutes.component.spec.ts`: `loadUsers()` with an erroring `getSubstituteCandidates` sets `usersLoadError` and renders the alert with a retry button that calls `loadUsers` again; with two substitutes the `md:hidden` card list renders two cards.
B. user-permissions-tab (`user-permissions-tab.html`, `.ts` only for helpers used by the template):
- `p-4.5` → `p-4`; emoji → `<svg appIcon="..." class="w-4 h-4" aria-hidden="true">` with existing names; icon-only buttons ≥40x40px with Persian `title`/`aria-label`; text below 10px → `text-[10px]`; physical → logical classes; every select/input of the inline «افزودن انتساب» form has an `id` (prefix `uptab-`) and a `<label for>`; focus styles `focus-visible:ring-2 focus-visible:ring-indigo-500`; numbers shown with Persian digits; tables that would scroll horizontally at 360px get a `md:hidden` card version like A2 (same handlers and conditions).
- Add tests to `user-permissions-tab.dom.spec.ts`: the inline form controls have labels linked by `for`; at least one icon-only button has `aria-label` and the class `min-w-[40px]`.
C. role-bundles-panel (`role-bundles-panel.html`): the same rules as B (prefix `rbp-` for ids). Add one test to `role-bundles-panel.spec.ts` that checks a label/`for` pair or an `aria-label` you added.
D. user-menu.component.html, the substitutes modal only (around 265–298): the modal panel gets `max-h-[90vh] overflow-y-auto` and full width on mobile (`w-full` plus the existing max width), inner padding `p-4 sm:p-5`, physical → logical classes in that block. Do not change anything outside that block.

5. Tool policy:
- Reading files is unrestricted.
- From the repo root: `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/modules/common/components/users/**/*.spec.ts" --include "src/app/shared/components/user-menu/**/*.spec.ts" --include "src/app/shared/components/workflow-substitutes/**/*.spec.ts"` (at most 5 times), `python -X utf8 scripts/e2e/guardian_52_icon_registry.py`, `python -X utf8 scripts/e2e/guardian_56_change_integrity.py --base HEAD`.
- If a command fails, read its output and change approach; do not repeat the same call unchanged.

6. Before finishing:
- The spec command passes with no new failure; guardians 52 and 56 pass.
- `git status --short` shows only files from the list before the commit and nothing after it.

7. Output and stop condition:
- Commit with this message, without push:
feat(release-v1 2.9-c): permissions tab, role bundles, my substitute and user menu at 360px (cards below md, candidate load error with retry, 40px buttons, labels, icons, logical classes)
- Short English report: what was changed per item A–D, anything skipped and why, the test summary line. End the turn after the commit and the report.

===

[DONE] Session 4 of 4 — Release v1 step 2.9-d part 2: DOM flow test of the users page (create, stay on permissions, inline assignment, substitute tab)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/common/components/users/users-flow.dom.spec.ts"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/users/users-flow.dom.spec.ts --contains user-modal-tab-permissions --contains user-modal-tab-substitute --contains app-user-permissions-tab --contains app-workflow-substitutes --contains "افزودن انتساب" --count "4:it("
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/modules/common/components/users/**/*.spec.ts" --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.9-d): users page DOM flow"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 7 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Create exactly one new file: `frontend/src/app/modules/common/components/users/users-flow.dom.spec.ts`. Change no other file (no production code, no other spec, nothing under `scripts/` or `Documents/`, not `tasks.md` or `tasks_history.md`).
- If a step of the flow behaves differently from this task, do not change production code: keep the expectation, mark that `it` with `it.fails(` (Vitest), and describe the difference in your report.
- Test names are Persian. No push. Stage only your own file.

2. Context:
- Plan `Documents/Release_v1/2.9_users/plan_2.9_users.md`, section `## ۳. کارها`, subsection `### ۲.۹-د` (DOM flow create → permissions → substitute), and the 2.9-ب entry of section `## ۷. گزارش پیشرفت` (after create the form stays in edit mode on the «مجوزها» tab; «افزودن انتساب» is inline in that tab).
- Setup to copy: `frontend/src/app/modules/common/components/users/users.spec.ts` lines 1 to the end of the top-level `beforeEach` (imports, `initTestEnvironment`, resource resolution with `fs`/`path`, the provider mocks for `PermissionService`, `StateService`, `AccountsHttpService`, `ScopeDirectoryService`, `CompanyApiService`, `ApiService`, `ConfirmDialogService`, `Router`, `ActivatedRoute` and the rest). Find the existing test that checks that the modal stays on the permissions tab after create (search `users.spec.ts` for `permissions`) and reuse how it mocks the create response.
- The user modal tabs are rendered by `app-tab-bar` with `idPrefix="user-modal"`: tab buttons have ids `user-modal-tab-<id>` (`identity`, `security`, `roles`, `warehouses`, `permissions`, `substitute`); `permissions` and `substitute` exist only when `editingUser.id` is set. The permissions tab hosts `app-user-permissions-tab` (its inline form opens with a button whose `aria-label` is «افزودن انتساب»; see `user-permissions-tab/user-permissions-tab.html` around line 44 and the describe «فرم «افزودن انتساب» (۲.۹-ب)» in `user-permissions-tab.dom.spec.ts` for the providers it needs). The substitute tab hosts `app-workflow-substitutes`.

3. Task — `describe('جریان ساخت کاربر → مجوزها → جانشین (۲.۹-د)', ...)` with at least these four `it(` cases, each driving the DOM (click buttons, `fixture.detectChanges()`, `await fixture.whenStable()`), not only calling methods:
- a) before create: in a new-user modal the buttons `#user-modal-tab-permissions` and `#user-modal-tab-substitute` do not exist.
- b) after a successful create (mocked response with an `id` and a `one_time_password`): the modal is still open, `editingUser.id` is set, `#user-modal-tab-permissions` exists and is the active tab (`aria-selected="true"`), and `app-user-permissions-tab` is rendered.
- c) in the permissions tab, clicking the button with `aria-label="افزودن انتساب"` shows the inline form (its first select is present). Add the providers that `UserPermissionsTab` needs as mocks if the copied setup lacks them.
- d) clicking `#user-modal-tab-substitute` renders `app-workflow-substitutes`, and clicking `#user-modal-tab-permissions` again brings back `app-user-permissions-tab`.

4. Tool policy:
- Reading files is unrestricted.
- From the repo root: `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include "src/app/modules/common/components/users/**/*.spec.ts"` (at most 5 times).
- If a command fails, read its output and change approach; do not repeat the same call unchanged.

5. Before finishing:
- The spec command passes with no failure (or only your documented `it.fails` cases).
- `git status --short` shows only your new file before the commit and nothing after it.

6. Output and stop condition:
- Commit with this message, without push:
test(release-v1 2.9-d): users page DOM flow (create, stay on permissions, inline assignment, substitute tab)
- Short English report: the test names, the test summary line, and any behaviour that differed from this task. End the turn after the commit and the report.

===

[DONE] Session 1 of 2 — Release v1 2.9 heavy checks: release on the local app environment (backup, migration check, staging APK build and install on the emulator, patched web build); the runner restarts Daphne and the GDrive worker and runs the health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py restart-worker
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py text-check --file scratch/logs/apk29_install.txt --contains Success
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running. The only exception is the emulator in step e, which runs in its own Windows Terminal tab.
- Release only. Do not edit, create, stage or commit any tracked file. Write only under `scratch/logs/`. Never print the content of any file in `E:\warehouse-secrets\`.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill`; do not kill any `node` process. The runner restarts Daphne and the worker after your turn.
- Only the local `app` environment on this Windows machine. Never connect to `soft.farsalish.ir`. Do not run `deploy.ps1`. Build only the STAGING APK (`ir.comanage.soft.test`); do not publish it.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `backend/backups/`, `backend/media/` or `frontend/dist/`.

2. Context: step 2.9 changed the users page, the permissions tab, role bundles, the user menu substitute modal and backend user-management scope code. No new migration. Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`. adb is `E:\Android\Sdk\platform-tools\adb.exe` (call it by full path).

3. Task, in this order:
- a) Backup (stop if it fails or the size is 0), in `backend`:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app 2.9 users'); print(m['filename'], m['size'])"`
- b) `.\venv\Scripts\python.exe manage.py showmigrations --plan`: if any line has `[ ]`, stop and report; do not migrate.
- c) Copy `E:\warehouse-secrets\comanage\google-services.json` to `frontend\android\app\google-services.json` (it is git-ignored; confirm with `git status --short` that it does not appear).
- d) In `frontend`: `npm run build:mobile-test`, then in `frontend\android` `.\gradlew.bat assembleStagingDirectRelease`.
- e) Run `adb devices`. If `emulator-5554` is not listed as `device`, start it with `wt.exe -w 0 new-tab --title "Android Emulator" cmd /k "E:\Android\Sdk\emulator\emulator.exe -avd AndroidTest15"` and repeat `adb shell getprop sys.boot_completed` (pause at most 15 seconds between tries, at most 12 tries) until it prints 1. Then from the repo root install: `adb install -r "frontend\android\app\build\outputs\apk\stagingDirect\release\app-staging-direct-release.apk" > scratch\logs\apk29_install.txt` and read that file; it must contain `Success`.
- f) Web build in `frontend`: `npx ng build --delete-output-path=false`, then `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.

4. Tool policy: only the commands above, `git status --short`, `Copy-Item`, `Get-Content`, and reading files outside `E:\warehouse-secrets\`. Gradle at most twice, each build at most twice. If a step fails, read its output, change approach, and if it still fails stop and report the exact error.

5. Before finishing: `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the backup file and size, the `showmigrations` result, the APK path and size, the install result, the web build result and the patch line. No commit. End the turn after the report.

===

[DONE] Session 2 of 2 — Release v1 2.9 heavy checks: Android check of the users page and the «جانشین من» modal on app with a temporary QA superuser

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py text-check --file scratch/logs/qa29_user.txt --contains QA_USER_CREATED
verify: python scratch/heavy/check_png29.py
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- This is an operational task on the local test environment `app` (this Windows machine, test data only, no real users). Never touch `soft`.
- Change no tracked file. Do not commit. Write only under `scratch/logs/` (the helper in step A also writes `scratch/qa_h29_credentials.txt`).
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running. The only exception is the emulator, which runs in its own Windows Terminal tab.
- The test password is in `scratch/qa_h29_credentials.txt` (one line, tab-separated: username, password). Never print the password in your reply, in a log you write, or in a file name. Pass it only to `adb shell input text`.
- Do not delete the QA user; Claude uses it afterwards and a later session deletes it.
- adb is `E:\Android\Sdk\platform-tools\adb.exe` (call it by full path).

2. Context:
- The staging APK (app id `ir.comanage.soft.test`, activity `ir.comanage.soft.MainActivity`) was installed on the emulator AVD `AndroidTest15` by session 1. It talks to `https://app.farsalish.ir`.
- Emulator screen is 1080x2400 pixels. On the login page the username field centre is about (540, 1130), the password field about (540, 1338), the login button «ورود به سامانه» about (540, 1655).

3. Task:
A. Create the QA user. In `backend` (PowerShell): `.\venv\Scripts\python.exe -X utf8 manage.py shell -c "import sys; sys.argv=['x','create']; exec(open('../scratch/heavy/qa29_user.py', encoding='utf-8').read())"`. It must print `QA_USER_CREATED`.
B. `adb devices`. If `emulator-5554` is not listed as `device`, start it with `wt.exe -w 0 new-tab --title "Android Emulator" cmd /k "E:\Android\Sdk\emulator\emulator.exe -avd AndroidTest15"` and repeat `adb shell getprop sys.boot_completed` (pause at most 15 seconds between tries, at most 12 tries) until it prints 1.
C. `adb shell am force-stop ir.comanage.soft.test`, then `adb shell am start -n ir.comanage.soft.test/ir.comanage.soft.MainActivity`, wait about 8 seconds.
D. To find elements, use `adb shell uiautomator dump /sdcard/ui.xml` then `adb pull /sdcard/ui.xml scratch/logs/ui.xml` and read the XML: find the node by its `text`, `hint` or `content-desc`, and tap the centre of its `bounds` with `adb shell input tap X Y`. If the XML has no web page nodes, use the coordinates from the context and screenshots (`adb exec-out screencap -p > scratch/logs/android29_<name>.png`) instead.
E. Log in: tap the username field, `adb shell input text <username>`; tap the password field, `adb shell input text <password>`; tap «ورود به سامانه». Wait about 8 seconds. If the app shows the launcher or asks to choose a system, choose the accounting one («مالی» / «حسابداری»).
F. Open the users page: find and tap a node whose text contains «کاربران» (in the side menu, which opens with the menu button, or in the launcher). Wait about 6 seconds and save `scratch/logs/android29_users.png`.
G. Open the user menu (the profile button; its `content-desc` or text contains «پروفایل کاربری»), then tap «جانشین من». Wait about 5 seconds and save `scratch/logs/android29_substitute.png`. Then tap the close button of that modal (its `content-desc` contains «بستن») and save `scratch/logs/android29_after_close.png`.

4. Tool policy:
- Reading files is unrestricted. Allowed commands: the commands named above, `adb` (devices, shell input, shell am, shell getprop, shell uiautomator dump, pull, exec-out screencap), `Get-Content`/`Select-String` for reading, and `git status --short`.
- At most 45 adb calls in total. If a command fails, read its output and change approach; do not repeat the same call unchanged.

5. Before finishing:
- `scratch/logs/qa29_user.txt` contains `QA_USER_CREATED`; the three screenshots exist.
- `git status --short` prints nothing.

6. Output and stop condition:
- No commit.
- Short English report: what was visible on the users page (cards or table, any horizontal scroll), what the substitute modal showed, whether it closed, and anything that did not work. End the turn after the report.

===

[DONE] Session 1 of 2 — Release v1 step 2.4-a operations on app: delete the temporary QA user, back up the database and apply migration notifications 0003

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py text-check --file scratch/logs/qa29_user.txt --contains QA_USER_DELETED
verify: python scripts/automation/verify_tools.py text-check --file scratch/logs/migrate24a.txt --contains 0003_notification_url --absent "[ ]"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- Operational task on the local test environment `app` (this Windows machine, test data only). Never touch `soft`.
- Change no tracked file. Do not commit. Write only under `scratch/logs/`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.

2. Context: step 2.4-a added an additive migration `notifications/0003_notification_url` (one new text column with an empty default). The temporary QA superuser `qa_h29_admin` from the 2.9 Android check must now be deleted.

3. Task, in this order, all in `backend`:
- a) Delete the QA user: `.\venv\Scripts\python.exe -X utf8 manage.py shell -c "import sys; sys.argv=['x','delete']; exec(open('../scratch/heavy/qa29_user.py', encoding='utf-8').read())"`. It must print `QA_USER_DELETED` (the helper also writes `scratch/logs/qa29_user.txt`).
- b) Backup (stop if it fails or the size is 0): `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-migrate app 2.4-a'); print(m['filename'], m['size'])"`. Never run `run_auto_backup`.
- c) `.\venv\Scripts\python.exe manage.py migrate notifications`. It must apply only `0003_notification_url`.
- d) `.\venv\Scripts\python.exe manage.py showmigrations notifications > ..\scratch\logs\migrate24a.txt` and read that file: every line must show `[X]`.

4. Tool policy: only the commands above, `git status --short` and `Get-Content`. If a step fails, read the error and stop with a report; do not retry with other flags.

5. Before finishing: `git status --short` prints nothing.

6. Output and stop condition: a short English report (QA user result, backup file and size, migrate output, showmigrations lines). No commit. End the turn after the report.

===

[DONE] Session 2 of 2 — Release v1 step 2.4-a: scenario tests for in-app notifications created from workflow task events

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/core/workflow/tests/test_notify.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/core/workflow/tests/test_notify.py --contains test_received_creates_row_per_holder --contains test_substitute_gets_on_behalf_text --contains test_no_row_for_removed_or_own_done --contains test_superuser_alert_rows --contains test_reason_in_return_and_reject --contains test_completed_url --contains test_inactive_user_no_row --contains test_failure_does_not_break_engine --contains test_constant_queries_per_event
verify: set DB_TEST_NAME=test_agy_notify&& python scripts/automation/verify_tools.py django-tests --labels workflow.tests.test_notify workflow.tests.test_realtime --min-tests 14
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.4-a): workflow notification scenarios"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly one new file: `backend/core/workflow/tests/test_notify.py`. Change no other file: never edit production code, other tests, `scripts/`, `Documents/`, `tasks.md` or `tasks_history.md`.
- If a test fails because production code behaves differently from this task, do not change production code and do not weaken the expectation silently: keep the test as written, mark it `@unittest.expectedFailure`, and describe the difference in your report.
- Test docstrings and comments are Persian, like the existing tests in that folder.
- No push. Stage only your own file. Commit message subject exactly: `test(release-v1 2.4-a): workflow notification scenarios`.

2. Context (read these, nothing broader):
- `backend/core/workflow/notify.py` (whole file, about 165 lines): `create_for_event(event)` builds `notifications.Notification` rows for one task event; `TITLES_FA`, `COMPLETED_TITLE_FA`, `MY_TASKS_URL`, `NOTIFICATION_TYPE`, `TARGET_MODEL`.
- `backend/core/workflow/realtime.py` (whole file): `on_task_event` calls `notify.create_for_event` first, then sends the personal websocket messages with `notification_id`, `title`, `url`, `created_at`.
- `backend/core/workflow/tests/test_realtime.py` (whole file): copy its `FakeLayer`, the `setUp` that patches `channels.layers.get_channel_layer`, and `run_flow` (which wraps a call in `self.captureOnCommitCallbacks(execute=True)` so events and notifications are produced).
- `backend/core/workflow/tests/base.py` lines 1-150 (`WorkflowTestBase`: users `member`, `lead`, `reviewer`, `boss`, `payer`, superuser `su`, sections `sec`, `sec2`; helpers `user`, `fresh`, `doc`; the test spec `summary(obj)` gives the document title used in the message) and `backend/core/workflow/tests/test_engine.py` lines 20-55 (`EngineBase.submit`, `task`, `act`, and `test_member_to_lead_reviewer_boss_payer` for the order of actors) and lines 277-283 (`SubstituteTests.sub` helper that creates a `WorkflowSubstitute`; copy it).

3. Task: write class `NotifyTests(EngineBase)` in `test_notify.py` with the same `setUp` as `RealtimeTests`, and these tests (use these exact method names):
- `test_received_creates_row_per_holder`: add a second lead (`self.user('lead2', 'wf_lead')`), submit. Exactly one `Notification` per lead with `notification_type == 'workflow_task'`, `title == TITLES_FA['received']`, `url == '/app/my-tasks'`, `target_model == 'WorkflowInstance'`, `target_id == str(instance.pk)`; the message contains the step title of the first step; the member (creator) got no row.
- `test_substitute_gets_on_behalf_text`: `helper = self.user('helper', 'wf_member')`, `self.sub(self.lead, helper)`, submit. The helper has one row whose message contains `به جانشینی از` and the lead's display name (`get_full_name()` or username); the lead's own row does not contain `به جانشینی از`. A user who is both principal and substitute for the same task gets exactly one row: create `lead2 = self.user('lead2', 'wf_lead')` and `self.sub(self.lead, lead2)` before submitting; lead2 has exactly one row and it does not contain `به جانشینی از`.
- `test_no_row_for_removed_or_own_done`: with lead and lead2, submit, then `self.act(self.lead, d)` inside `run_flow`. Each lead still has exactly one row (the `done` to the actor and the `removed` to lead2 create none); the reviewer got one `received` row.
- `test_superuser_alert_rows`: create an inactive superuser (`is_active=False`) first, then submit with `section=self.sec2` (no reviewer there, see `test_realtime.py` line 61). Every active superuser has one row with `title == TITLES_FA['superuser_alert']`; the inactive superuser has none; the websocket message to `realtime.SUPERUSER_GROUP` has a non-empty `title` and no `notification_id` key.
- `test_reason_in_return_and_reject`: submit; return with reason `'مبلغ اشتباه است'` (`engine.return_for_fix(self.fresh(self.lead), self.task(d), reason)` inside `run_flow`); resubmit (`engine.submit('zz_wf_flow', d, self.member)` inside `run_flow`); act as lead; reject with reason `'تکراری'` (`engine.reject(self.fresh(self.reviewer), self.task(d), reason)`). The member has a row with `title == TITLES_FA['returned']` whose message contains the first reason and a row with `title == TITLES_FA['rejected']` whose message contains the second; both have a `url` that is not `/app/my-tasks` and contains `str(d.pk)`.
- `test_completed_url`: take a document through all steps (order of actors as in `test_member_to_lead_reviewer_boss_payer`). The member gets exactly one row with `title == COMPLETED_TITLE_FA` and its `url` contains `str(d.pk)`.
- `test_inactive_user_no_row`: set `self.lead.is_active = False` and save before submit; the lead gets no row.
- `test_failure_does_not_break_engine`: patch `notifications.models.Notification.objects.bulk_create` with `side_effect=RuntimeError('db down')`; submit and act as lead inside `run_flow` still work (the task moves to step `review`), and `received` websocket messages are still sent, without a `notification_id` key.
- `test_constant_queries_per_event`: call `notify.create_for_event` directly with a hand-built payload `events.build_payload(events.RECEIVED, instance, task, user_ids)` for 2 users and then for 12 users (create the extra users with role `wf_lead`), each time inside `CaptureQueriesContext(connection)` and inside `self.captureOnCommitCallbacks(execute=False)` so the push callback does not run; the two query counts are equal.

4. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. Run tests only with `.\venv\Scripts\python.exe manage.py test workflow.tests.test_notify workflow.tests.test_realtime --noinput` in `backend` (set `$env:PYTHONUTF8='1';` first). At most 6 test runs.

5. Before finishing: the test command passes (expected failures allowed only as described in rule 1); `git status --short` is clean after your commit.

6. Output and stop condition: commit, then a short English report: tests written, pass/fail counts, any expectedFailure with the exact difference. End the turn after the report.

===

[DONE] (by Claude: agy auth timed out) Session 1 of 1 — Release v1 step 2.4-b: guard against direct Notification use in modules, and tests for notifications.services.notify_users

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "scripts/e2e/module_coupling_scan.py" --allow "backend/core/notifications/test_services.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/core/notifications/test_services.py --contains test_rows_and_personal_messages --contains test_inactive_user_skipped --contains test_constant_queries --contains test_extra_keys_kept --contains test_websocket_failure_logged --contains test_row_failure_logged --contains test_runs_after_commit
verify: python scripts/automation/verify_tools.py text-check --file scripts/e2e/module_coupling_scan.py --contains direct_notification_refs
verify: python scripts/e2e/module_coupling_scan.py --self-test
verify: set DB_TEST_NAME=test_agy_notify_svc&& python scripts/automation/verify_tools.py django-tests --labels notifications.test_services --min-tests 7
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.4-b): notify_users tests and module Notification guard"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Change exactly two files: edit `scripts/e2e/module_coupling_scan.py` and create `backend/core/notifications/test_services.py`. Never edit production code under `backend/`, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- If a test fails because production code behaves differently from this task, do not change production code and do not weaken the expectation silently: keep the test as written, mark it `@unittest.expectedFailure`, and describe the difference in your report.
- Test docstrings and code comments are Persian, like the existing code in those folders.
- No push. Stage only your two files. Commit message subject exactly: `test(release-v1 2.4-b): notify_users tests and module Notification guard`.

2. Context (read these, nothing broader):
- `backend/core/notifications/services.py` (whole file, about 120 lines): `create_notifications(...)` and `notify_users(user_ids, *, title, message, notification_type, target_model='', target_id='', url='', company_id=None, extra=None)`. `notify_users` registers `transaction.on_commit(_run)`; `_run` keeps only active users (one query), creates rows with one `bulk_create`, schedules FCM with `notifications.push.schedule_push_for_notifications`, then sends one message per row with `channel_layer.group_send` to group `user_{id}`. Errors are only logged with `logger.exception` (logger name `notifications.services`).
- `backend/core/workflow/tests/test_realtime.py` lines 1-60: copy the `FakeLayer` class idea and the `setUp` that patches `channels.layers.get_channel_layer` with `mock.patch`.
- `backend/core/notifications/tests.py` lines 1-50: how users are created in tests (`get_user_model().objects.create_user`).
- `scripts/e2e/module_coupling_scan.py` lines 120-180 (`_is_test_file`, `_iter_files`, `scan_backend`) and lines 276-377 (`evaluate`, `self_test`).

3. Definitions:
- Direct Notification reference: in a non-test Python file under `backend/modules/`, a line that matches the regular expression `\bfrom\s+notifications\.models\s+import\b|\bimport\s+notifications\.models\b|\bNotification\.objects\b`. Test files are the ones `_is_test_file` already treats as tests.

4. Task A, guard in `scripts/e2e/module_coupling_scan.py`:
- In `scan_backend`, add a third key `"direct_notification_refs": []` to `found`. Walk `_iter_files(backend_dir / "modules", ("*.py",))`, skip test files with `_is_test_file(rel)`, and for every matching line append `{"file": f"backend:{rel.as_posix()}", "line": i, "match": "Notification", "text": line.strip()}`. Compile the regular expression once at module level as `DIRECT_NOTIFICATION_RE` with a one-line Persian comment saying modules must use `notifications.services.notify_users` (plan 2.4, decision 7).
- Do not add anything to `ALLOWED_FILES`.
- In `self_test`, before `b = scan_backend(be)`, write `be / "modules" / "beta" / "beta_app" / "notify.py"` with the two lines `from notifications.models import Notification` and `Notification.objects.create(title='x')`, and `be / "modules" / "beta" / "beta_app" / "tests.py"` with the line `from notifications.models import Notification`. After the existing backend check, add a check that `[v["line"] for v in b["direct_notification_refs"]] == [1, 2]`, print it like the other checks (`self-test direct notification refs: ...`), and fold it into `ok`.
- After the change, `python scripts/e2e/module_coupling_scan.py` must print `'direct_notification_refs': 0` in the backend counters line, and `python scripts/e2e/module_coupling_scan.py --self-test` must exit 0.

5. Task B, tests in `backend/core/notifications/test_services.py`, class `NotifyUsersTests(TestCase)`. In `setUp` patch `channels.layers.get_channel_layer` to return a fake layer that records `(group, message)` for every `group_send` (an `async def group_send`), and create users with `create_user`. Call `notify_users` inside `with self.captureOnCommitCallbacks(execute=True):`. Use these exact method names:
- `test_rows_and_personal_messages`: notify 3 active users with `title='t'`, `message='m'`, `notification_type='personnel_workflow'`, `target_model='PersonnelProfile'`, `target_id=7`, `url='/app/x'`, `company_id=5`. Exactly 3 `Notification` rows with those fields (`target_id == '7'`, `url == '/app/x'`); exactly 3 messages, each to group `user_<that user id>` only (no other group), with `type == 'send_notification'`, `type_str == 'personnel_workflow'`, `notification_id` equal to that user row id, `title`, `message`, `url`, `company_id == 5` and a non-empty `created_at`.
- `test_inactive_user_skipped`: one active and one inactive user (`is_active=False`); only the active user gets a row and a message.
- `test_constant_queries`: build lists of 2 and of 12 active users; for each, measure queries with `CaptureQueriesContext(connection)` around `with self.captureOnCommitCallbacks(execute=True): notify_users(...)`; the two counts are equal. Also duplicate ids and `None` in the id list (`[u1.id, u1.id, None]`) produce one row.
- `test_extra_keys_kept`: `extra={'vehicle_id': 9, 'approval_status': 'pending_supervisor', 'type': 'bad'}`; the message has `vehicle_id == 9` and `approval_status == 'pending_supervisor'`, and `type` is still `'send_notification'` (base keys win).
- `test_websocket_failure_logged`: the fake `group_send` raises `RuntimeError`; with `self.assertLogs('notifications.services', level='ERROR')` the call does not raise, rows are still created, and one error is logged per user.
- `test_row_failure_logged`: patch `notifications.models.Notification.objects.bulk_create` with `side_effect=RuntimeError('db down')`; inside `assertLogs('notifications.services', level='ERROR')` the call does not raise and no message is sent.
- `test_runs_after_commit`: call `notify_users` inside `with self.captureOnCommitCallbacks(execute=False) as callbacks:`; right after the call there is no row and no message and the return value is `{}`; then run every callback in `callbacks` and check the row and the message exist.

6. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. Run tests only with `.\venv\Scripts\python.exe manage.py test notifications.test_services --noinput` in `backend` (set `$env:PYTHONUTF8='1';` first). Run the scan from the repository root with `python scripts/e2e/module_coupling_scan.py` and `python scripts/e2e/module_coupling_scan.py --self-test`. At most 6 test runs.

7. Before finishing: the test command passes (expected failures allowed only as described in rule 1); both scan commands behave as in Task A; `git status --short` is clean after your commit.

8. Output and stop condition: commit, then a short English report: guard change, tests written, pass/fail counts, any expectedFailure with the exact difference. End the turn after the report.

===

[DONE] (scope verify line had repeated --allow; nargs=+ keeps the last; all other checks passed) Session 1 of 1 — Release v1 step 2.4-c: DOM specs for the notification bell and the Android push tap

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/shared/components/notification-center/notification-center.dom.spec.ts" --allow "frontend/src/app/core/platform/push.service.spec.ts"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/shared/components/notification-center/notification-center.dom.spec.ts --min-tests 14 --require "i) " --require "j) " --require "k) " --require "l) " --require "m) "
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/core/platform/push.service.spec.ts --min-tests 10 --require "10. "
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file frontend/src/app/shared/components/notification-center/notification-center.dom.spec.ts frontend/src/app/core/platform/push.service.spec.ts
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/shared/components/notification-center/notification-center.dom.spec.ts --include src/app/core/platform/push.service.spec.ts --no-skip --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.4-c): bell and push tap specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Change exactly two files: `frontend/src/app/shared/components/notification-center/notification-center.dom.spec.ts` and `frontend/src/app/core/platform/push.service.spec.ts`. Never edit production code, other specs, `Documents/`, `tasks.md` or `tasks_history.md`. Never delete or weaken an existing test.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, mark that one test with `it.fails(` and describe the exact difference in your report.
- No `it.only`, `describe.only`, `it.skip`, no `fs`/`path` imports.
- No push. Stage only your two files. Commit message subject exactly: `test(release-v1 2.4-c): bell and push tap specs`.

2. Context (read these, nothing broader):
- `frontend/src/app/shared/components/notification-center/notification-center.component.ts` (whole file, about 330 lines). Facts: `isInAppUrl(url)` is exported and accepts only strings that start with `/app/`. `listenToWebSocket` reacts to a websocket message that has `title`, or `notification_id`, or `type_str` `personnel_workflow`/`fleet_workflow`: it sets `hasNewPulse` to true and calls `scheduleRefresh()`. `scheduleRefresh` waits `NotificationCenterComponent.REFRESH_DEBOUNCE_MS` (500 ms; a new message restarts the wait) and then calls `loadUnreadCount()` (GET `.../notifications/unread-count/`) and, only if the panel is open, `loadNotifications()`. There is no local `+1` any more. HTTP errors are swallowed: the count and the list keep their last values. `onNotificationClick` marks the item read, closes the panel, navigates with `router.navigateByUrl(item.url)` only when `isInAppUrl(item.url)`, otherwise falls through to the chat drawer or the module handlers. The panel has `id="notification-center-panel"` and classes `fixed inset-x-2` (mobile full width) plus `sm:absolute sm:w-96`. Each row has class `notification-item`, `role="button"`, `tabindex="0"`. Icon-only buttons are `w-10 h-10` and have Persian `title` and `aria-label`.
- `frontend/src/app/shared/components/notification-center/notification-center.dom.spec.ts` (whole file, 485 lines): reuse its `beforeEach` mocks (`mockHttp`, `mockRouter`, `mockWs.notifications$` Subject, `currentUnreadCount`). Existing tests are named `a)` to `h)`.
- `frontend/src/app/core/platform/push.service.ts` lines 225–290 (`handleNotificationTap`): navigates with `router.navigateByUrl(url)` only when `url` (from `data.url` or `notification.link`) is a string starting with `/app/`; otherwise the old behaviour runs (chat drawer, module handlers, fallback).
- `frontend/src/app/core/platform/push.service.spec.ts` (whole file): reuse its setup; existing tests are numbered `1.` to `9.`.

3. Task A, add to `notification-center.dom.spec.ts` (new `it` blocks after `h)`, use `vi.useFakeTimers()` in the tests that need the debounce and `vi.useRealTimers()` in an `afterEach` or at the end of the test):
- `i) A titled websocket message reloads the count from the server after the debounce, not by +1`: start with count 2 from the server; set `currentUnreadCount = 5`; emit `{ type: 'send_notification', type_str: 'workflow_task', title: 'کار تازه', url: '/app/my-tasks' }` on `mockWs.notifications$`; before 500 ms the count is still 2 and the pulse is on; after `vi.advanceTimersByTime(500)` the count is 5 (not 3).
- `j) A burst of three messages makes exactly one unread-count request`: count the `mockHttp.get` calls whose url contains `/notifications/unread-count/` after the initial load; emit three titled messages 100 ms apart; advance 500 ms; exactly one more such call.
- `k) Open panel: a titled message also reloads the list`: open the panel by clicking the bell, set `currentNotifications` to one new item, emit a titled message, advance 500 ms, `fixture.detectChanges()`; the row text is in the DOM.
- `l) Offline: when the server is unreachable the count and list stay and nothing throws`: after a count of 4 is loaded, make `mockHttp.get` return `throwError(() => new HttpErrorResponse({ status: 0 }))` for every url; emit a titled message, advance 500 ms; the count is still 4, no exception, and `console.error` (spy with `vi.spyOn(console, 'error')`) was not called.
- `m) Click with an in-app url navigates; an external url does not`: an item with `url: '/app/my-tasks'` calls `navigateByUrl('/app/my-tasks')`; an item with `url: 'https://evil.example/x'` and no handler match does not call `navigateByUrl`; both are marked read.
- `n) 360px and accessibility`: open the panel; the element `#notification-center-panel` has the classes `fixed`, `inset-x-2` and `sm:w-96` and has no class `w-80`; the bell button has `aria-label` and `title` with Persian text and classes `w-10` and `h-10`; with one unread item, its mark-read button has classes `w-10` and `h-10` and a non-empty `aria-label`; each `.notification-item` has `role="button"` and `tabindex="0"`.
- `o) isInAppUrl`: true for `/app/x`; false for `//evil.example/app/`, `https://a.b/app/x`, `/admin`, `''`, `null`, `undefined`, `42`.

4. Task B, add to `push.service.spec.ts` one test named `10. tap url guard: /app/ url navigates, external url is ignored and falls back`: `data.url = '/app/my-tasks'` calls `navigateByUrl('/app/my-tasks')`; `data.url = 'https://evil.example/x'` never calls `navigateByUrl` with that url and runs the same fallback the existing test 5 expects for an item without a handler.

5. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. To run the two specs, in `frontend` create a temporary file `tsconfig.agy-2.4c.spec.json` with the content `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/shared/components/notification-center/notification-center.dom.spec.ts", "src/app/core/platform/push.service.spec.ts"], "exclude": [] }` and run `npx ng test --watch=false --ts-config tsconfig.agy-2.4c.spec.json --include src/app/shared/components/notification-center/notification-center.dom.spec.ts --include src/app/core/platform/push.service.spec.ts` (the build takes about two minutes). Delete the temporary tsconfig before committing. At most 5 test runs.

6. Before finishing: both specs pass (only `it.fails` allowed, as in rule 1); the temporary tsconfig is deleted; `git status --short` is clean after your commit.

7. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any `it.fails` with the exact difference. End the turn after the report.

===

[DONE] Session 1 of 1 — Release v1 step 2.5-a: tests for live-event tab id, no global channel, and skipLiveEvent

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow backend/modules/accounting/personnel/test_live_events_25a.py frontend/src/app/core/http/websocket.service.spec.ts
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/core/http/websocket.service.spec.ts --min-tests 6
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/core/http/websocket.service.spec.ts --no-skip --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.5-a): live event tab id and skipLiveEvent"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly two new files: `backend/modules/accounting/personnel/test_live_events_25a.py` and `frontend/src/app/core/http/websocket.service.spec.ts`. Never edit production code, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, mark that one test with `@unittest.expectedFailure` (Python) or `it.fails(` (spec) and describe the exact difference in your report.
- No `it.only`, `describe.only`, `it.skip`, no `fs`/`path` imports in the spec.
- No push. Stage only your two files. Commit message subject exactly: `test(release-v1 2.5-a): live event tab id and skipLiveEvent`.

2. Context (read these, nothing broader):
- `backend/modules/accounting/personnel/views_domains/scope_helpers.py` lines 264–540: `broadcast_personnel_update`, `broadcast_vehicle_update`, `broadcast_attendance_updated`. Facts: when `client_tab_id` is not passed (None), each of the three reads it with `accounts.middleware.get_current_client_tab_id()`; an explicit value wins. Personnel and vehicle without a company send nothing. `broadcast_attendance_updated` without a company (no `company_id`, no `extra_data['company_id']`, no `warehouse_id`) now sends nothing; with `company_id=X` it sends one message to group `company_X_notifications` with `type_str == 'attendance_updated'`, `company_id == X` and `client_tab_id`.
- `backend/modules/accounting/personnel/test_company_multitenant.py` lines 1–60 (setUp: companies) and 443–480 (`test_websocket_broadcast_isolation_and_privacy`): copy its way of patching `channels.layers.get_channel_layer` with a `MagicMock` whose `group_send` is an `AsyncMock`, and of creating a `PersonnelProfile` with a company.
- `backend/core/accounts/middleware.py` lines 60–75: `set_current_client_tab_id(tab_id)` returns a token; reset it with `accounts.middleware._current_client_tab_id_var.reset(token)` in a `finally`.
- `backend/modules/accounting/personnel/views_domains/trip_views.py`: the string `global_notifications` must no longer appear in it.
- `frontend/src/app/core/http/websocket.service.ts` lines 1–60: `WebSocketService` (constructor takes `AuthService` and `ToastService`), `tabId`, and `skipLiveEvent(msg)`: returns true for a falsy msg; true when `msg.client_tab_id === tabId`; true when the event company (`msg.company_id`, else `msg.metadata?.company_id`) and the active company (`ActiveCompanyService.activeCompanySignal()?.id`, read lazily through the `Injector`) are both set and differ (compared as numbers); otherwise false.

3. Task A, `backend/modules/accounting/personnel/test_live_events_25a.py`, class `LiveEventTabIdTests(TestCase)` with a company created like in `test_company_multitenant.py`:
- `test_personnel_default_tab_id_from_request`: with `set_current_client_tab_id('tab_a')`, `broadcast_personnel_update(p)` sends one message whose `client_tab_id == 'tab_a'` to `company_<id>_notifications`.
- `test_personnel_explicit_tab_id_wins`: same context, `client_tab_id='tab_b'` passed; message has `'tab_b'`.
- `test_personnel_no_context_tab_is_none`: no context value; message `client_tab_id` is None.
- `test_vehicle_default_tab_id_from_request`: same as the first for `broadcast_vehicle_update` with a `VehicleProfile` (or the vehicle model used in `scope_helpers.py`; create it with the minimum required fields and the company) — if creating the vehicle is hard, use a `types.SimpleNamespace(id=1, company_id=<company id>, plate_number='12ب345', driver_name='x')` instead.
- `test_attendance_without_company_sends_nothing`: `broadcast_attendance_updated(date_shamsi='1405/08/03')` makes no `group_send` call.
- `test_attendance_with_company_and_tab`: with context tab `'tab_c'`, `broadcast_attendance_updated(company_id=<id>, date_shamsi='1405/08/03')` sends exactly one message to `company_<id>_notifications` with `client_tab_id == 'tab_c'` and `company_id == <id>`.
- `test_trip_views_never_use_global_channel`: read the source of `personnel.views_domains.trip_views` with `inspect.getsource` and assert `'global_notifications'` is not in it.

4. Task B, `frontend/src/app/core/http/websocket.service.spec.ts` (Vitest, `TestBed`): provide `WebSocketService` with `{ provide: AuthService, useValue: { getToken: () => null } }`, `{ provide: ToastService, useValue: { show: vi.fn(), error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() } }` and `{ provide: ActiveCompanyService, useValue: { activeCompanySignal: signal<any>(null) } }` (keep a reference to the signal to set it per test). Do not call `connect()`. Tests (names exactly):
- `1. skips a falsy message`: `null` and `undefined` return true.
- `2. skips an event from the same tab`: `{ client_tab_id: service.tabId }` returns true.
- `3. keeps an event from another tab`: `{ client_tab_id: 'tab_other', company_id: 5 }` with active company 5 returns false.
- `4. skips an event of another company`: active company 5, `{ company_id: 7 }` returns true; `{ company_id: '5' }` returns false (number compare).
- `5. uses metadata.company_id when company_id is missing`: active 5, `{ metadata: { company_id: 9 } }` returns true.
- `6. keeps events when no active company or no event company`: active null with `{ company_id: 7 }` returns false; active 5 with `{}` returns false.

5. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. Backend: in `backend` run `$env:PYTHONUTF8='1'; .\venv\Scripts\python.exe manage.py test personnel.test_live_events_25a --keepdb --noinput`. Frontend: in `frontend` create a temporary `tsconfig.agy-2.5a.spec.json` with `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/core/http/websocket.service.spec.ts"], "exclude": [] }` and run `npx ng test --watch=false --ts-config tsconfig.agy-2.5a.spec.json --include src/app/core/http/websocket.service.spec.ts`; delete the temporary tsconfig before committing. At most 5 runs of each.

6. Before finishing: both test files pass (only the marked expected failures allowed, as in rule 1); the temporary tsconfig is deleted; `git status --short` shows no change to tracked files after your commit.

7. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any expected failure with the exact difference. End the turn after the report.
===

[DONE] Session 1 of 1 — Release v1 step 2.5-b: error interceptor spec (reads never show a red error on server unreachable)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow frontend/src/app/core/error/error.interceptor.spec.ts
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/core/error/error.interceptor.spec.ts --min-tests 7
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/core/error/error.interceptor.spec.ts --no-skip --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.5-b): error interceptor read toasts"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly one new file: `frontend/src/app/core/error/error.interceptor.spec.ts`. Never edit production code, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, mark that one test with `it.fails(` and describe the exact difference in your report.
- No `it.only`, `describe.only`, `it.skip`, no `fs`/`path` imports.
- No push. Stage only your file. Commit message subject exactly: `test(release-v1 2.5-b): error interceptor read toasts`.

2. Context (read these, nothing broader):
- `frontend/src/app/core/error/error.interceptor.ts` (whole file, about 130 lines). Facts: `errorInterceptor` is a functional `HttpInterceptorFn`; it injects `ToastService` (from `../../shared/components/toast/toast.component`) and `AuthStore` (from `../stores/auth.store`). A module-level variable `lastOfflineToastAt` with `OFFLINE_TOAST_GAP_MS = 3000` throttles the warning toasts. New rule: a `GET` whose error status is server-unreachable (0, 502, 503, 504, 520 to 530) calls `toast.show('warning', <text>)` at most once per 3000 ms and never `toast.show('error', ...)`. Non-GET requests with those statuses still call `toast.show('error', 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.')`. GET with 403 shows `toast.show('error', 'شما مجوز دسترسی به این عملیات را ندارید.')`; GET with 500 shows `toast.show('error', 'خطای داخلی سرور. لطفا با پشتیبانی تماس بگیرید.')`. A request whose context sets `SKIP_GLOBAL_ERROR_TOAST` to true shows nothing.
- `frontend/src/app/core/services/server-reachability.ts` lines 31–36.

3. Task, `frontend/src/app/core/error/error.interceptor.spec.ts` (Vitest + `TestBed`): providers `provideHttpClient(withInterceptors([errorInterceptor]))`, `provideHttpClientTesting()`, `{ provide: ToastService, useValue: { show: vi.fn() } }`, `{ provide: AuthStore, useValue: { setActiveWarehouse: vi.fn() } }`. Use `HttpClient` and `HttpTestingController`; fail a request with `req.flush(null, { status, statusText: 'x' })` (for status 0 use `req.error(new ProgressEvent('error'))`). Subscribe with an `error` callback so the test does not throw. Because the throttle is module-level, call `vi.useFakeTimers()` in `beforeEach` and move the clock forward by 10000 ms with `vi.setSystemTime(Date.now() + 10000)` at the start of every test; `vi.useRealTimers()` and `httpMock.verify()` in `afterEach`. Tests (names exactly):
- `1. GET with 502 shows one warning, no error`: `show` called once with first argument `'warning'`; never with `'error'`.
- `2. GET with status 0 shows a warning, no error`.
- `3. GET with 530 twice within 3 seconds shows one warning`: two GETs failing with 530 in the same clock time; `show` called exactly once.
- `4. POST with 503 still shows the red unreachable error`: `show` called with `('error', 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.')`.
- `5. GET with 403 shows the permission error`.
- `6. GET with 500 shows the internal server error`.
- `7. GET with SKIP_GLOBAL_ERROR_TOAST shows nothing`: pass `{ context: new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true) }` with a 502; `show` not called.

4. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. In `frontend` create a temporary `tsconfig.agy-2.5b.spec.json` with `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/core/error/error.interceptor.spec.ts"], "exclude": [] }` and run `npx ng test --watch=false --ts-config tsconfig.agy-2.5b.spec.json --include src/app/core/error/error.interceptor.spec.ts`; delete the temporary tsconfig before committing. At most 5 runs.

5. Before finishing: the spec passes (only `it.fails` allowed, as in rule 1); the temporary tsconfig is deleted; `git status --short` shows no change to tracked files after your commit.

6. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any `it.fails` with the exact difference. End the turn after the report.

===

[x] Session 1 of 1 — Release v1 step 2.5-b2: cache warm-up specs (core trigger and accounting warmCache)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow frontend/src/app/core/services/cache-warmup.service.spec.ts --allow frontend/src/app/modules/accounting/api/warm-cache.spec.ts
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/core/services/cache-warmup.service.spec.ts --min-tests 6
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/accounting/api/warm-cache.spec.ts --min-tests 3
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/core/services/cache-warmup.service.spec.ts --include src/app/modules/accounting/api/warm-cache.spec.ts --no-skip --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.5-b2): cache warm-up specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly two new files: `frontend/src/app/core/services/cache-warmup.service.spec.ts` and `frontend/src/app/modules/accounting/api/warm-cache.spec.ts`. Never edit production code, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, mark that one test with `it.fails(` and describe the exact difference in your report.
- No `it.only`, `describe.only`, `it.skip`, no `fs`/`path` imports.
- No push. Stage only your two files. Commit message subject exactly: `test(release-v1 2.5-b2): cache warm-up specs`.

2. Context (read these, nothing broader):
- `frontend/src/app/core/services/cache-warmup.service.ts` (whole file, about 125 lines). Facts: `CacheWarmupService` (providedIn root) injects `Injector` and `ActiveCompanyService`. `warm(force = false)` returns a Promise and never throws. It does nothing when `NetworkStatusService.getInstance().isOnline` is false, when no `wh_access_token` is in sessionStorage or localStorage, when `activeCompany.activeCompanyId` is null, or when `getStoredCurrentUserId()` is null (reads `wh_user_profile` JSON `{ id }` from sessionStorage or localStorage). It collects `syncConfig.warmCache` functions from `getModuleRegistry().getExtensions('syncConfig')` and calls each with the injector, one after another; an error in one hook is caught and the next hook still runs. Throttle: localStorage key `wh_cache_warmup:<userId>:<companyId>` holds the last run time; a second `warm()` within `CACHE_WARMUP_INTERVAL_MS` (10 minutes) does nothing unless `force` is true.
- `frontend/src/app/modules/accounting/api/warm-cache.ts` (whole file, about 45 lines). Facts: `warmAccountingCache(injector)` uses `injector.get(ApiService)` and calls `api.get(endpoint, params, { context })` where the context has `SKIP_GLOBAL_ERROR_TOAST` true. First `org/section-assignments/my-sections/` and `org/project-sections` with `{ is_active: true }`; then for each section id (my sections, or the active sections when my sections is empty; at most `WARM_SECTION_LIMIT` = 5) seven GETs: `personnel/profiles` with `{ section_id, approval_status: 'pending_supervisor' }`, `personnel/profiles` with `{ section_id }`, `personnel/personnel-change-requests`, `personnel/attendance`, `personnel/vehicles` with and without `approval_status: 'pending_supervisor'`, `personnel/vehicle-change-requests` (all with `{ section_id }`). Any failed GET is ignored.
- `frontend/src/app/core/error/error.interceptor.ts` line 15 (`SKIP_GLOBAL_ERROR_TOAST`).

3. Task A, `frontend/src/app/core/services/cache-warmup.service.spec.ts` (Vitest + `TestBed`). Setup: `localStorage.clear()` and `sessionStorage.clear()` in `beforeEach`; set `sessionStorage.setItem('wh_access_token', 't')` and `sessionStorage.setItem('wh_user_profile', JSON.stringify({ id: 7 }))`. Provide `{ provide: ActiveCompanyService, useValue: { activeCompanyId: 3, activeCompany$: new BehaviorSubject(null) } }` (keep a reference to change `activeCompanyId`). Mock online state with `vi.spyOn(NetworkStatusService.getInstance(), 'isOnline', 'get').mockReturnValue(true)` (or `false`). Register hooks with `vi.spyOn(getModuleRegistry(), 'getExtensions').mockReturnValue([{ module: {} as any, moduleCode: 'm1', extension: { scopeKind: 'x', pullEndpoint: '/p', scopeParamKey: 'k', warmCache: hookA } }] as any)` where `hookA = vi.fn().mockResolvedValue(undefined)`. Do not call `start()`. `vi.restoreAllMocks()` in `afterEach`. Tests (names exactly):
- `1. calls each warmCache hook with the injector when online`: `await service.warm()`; `hookA` called once and its first argument is an object with a `get` function.
- `2. does nothing when offline`: `isOnline` false; `hookA` not called.
- `3. does nothing without a token or without an active company`: remove the token, `warm()`, `hookA` not called; then restore the token, set `activeCompanyId` to null, `warm()`, still not called.
- `4. second call within 10 minutes is skipped, force runs it`: two `await service.warm()`; `hookA` called once; then `await service.warm(true)`; called twice; `localStorage.getItem('wh_cache_warmup:7:3')` is not null.
- `5. a failing hook does not stop the next one and warm never throws`: two hooks, the first `vi.fn().mockRejectedValue(new Error('x'))`, the second resolves; `await expect(service.warm()).resolves.toBeUndefined()`; the second hook called once.
- `6. throttle key is per company`: `warm()` with company 3, then set `activeCompanyId` to 4 and `warm()` again; `hookA` called twice.

4. Task B, `frontend/src/app/modules/accounting/api/warm-cache.spec.ts` (Vitest + `TestBed`): providers `provideHttpClient()`, `provideHttpClientTesting()`. Call `const p = warmAccountingCache(TestBed.inject(Injector))`, then answer requests with `HttpTestingController`: use `httpMock.match(r => r.url.endsWith('/org/section-assignments/my-sections/'))` etc. Between flushes `await` a few macrotasks (for example `await new Promise(r => setTimeout(r, 0))`) so the next requests are issued; finally `await p`. Tests (names exactly):
- `1. warms my sections and seven lists per section with the toast skipped`: my-sections returns `[{ id: 11 }]`, project-sections returns `[]`; then exactly 7 requests carry `section_id=11` in `urlWithParams`; two of them (`/personnel/profiles/` and `/personnel/vehicles/`) also carry `approval_status=pending_supervisor`; every request has `context.get(SKIP_GLOBAL_ERROR_TOAST) === true` and method GET. The project-sections request has `is_active=true`.
- `2. falls back to active sections when my sections is empty`: my-sections `[]`, project-sections `[{ id: 21 }, { id: 22 }]`; requests are issued for `section_id=21` and then `section_id=22` (7 each).
- `3. a failed my-sections request does not throw`: my-sections flushed with status 500, project-sections `[]`; `await expect(p).resolves.toBeUndefined()` and no `/personnel/` request is made.
- End each test with `httpMock.verify()`.

5. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. In `frontend` create a temporary `tsconfig.agy-2.5b2.spec.json` with `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/core/services/cache-warmup.service.spec.ts", "src/app/modules/accounting/api/warm-cache.spec.ts"], "exclude": [] }` and run `npx ng test --watch=false --ts-config tsconfig.agy-2.5b2.spec.json --include src/app/core/services/cache-warmup.service.spec.ts --include src/app/modules/accounting/api/warm-cache.spec.ts`; delete the temporary tsconfig before committing. At most 5 runs.

6. Before finishing: both specs pass (only `it.fails` allowed, as in rule 1); the temporary tsconfig is deleted; `git status --short` shows no change to tracked files after your commit.

7. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any `it.fails` with the exact difference. End the turn after the report.

===

[DONE] [ ] Session 1 of 2 — Release v1 step 2.5-c: backend tests for the document_changed live event

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow backend/modules/accounting/personnel/test_document_event_25c.py
verify: set DB_TEST_NAME=test_agy_docevent&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_document_event_25c --min-tests 9
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.5-c): document_changed backend tests"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly one new file: `backend/modules/accounting/personnel/test_document_event_25c.py`. Never edit production code, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, decorate that one test with `@unittest.expectedFailure` and describe the exact difference in your report.
- No push. Stage only your file. Commit message subject exactly: `test(release-v1 2.5-c): document_changed backend tests`.

2. Context (read these ranges, nothing broader):
- `backend/core/companies/realtime.py` lines 60 to 105: `broadcast_document_changed(doc_type, doc_id, *, company_id, section_id=None, status=None, action='updated', client_tab_id=None, sender_id=None)`. Without `company_id` it logs a warning and registers nothing. Otherwise it builds the payload at call time (`type` is `send_notification`, `type_str` is `document_changed`, keys `doc_type`, `doc_id`, `action`, `status`, `company_id`, `section_id`, `client_tab_id`, `sender_id`); when `client_tab_id` is None it takes `accounts.middleware.get_current_client_tab_id()`. It sends with `transaction.on_commit` to group `company_<id>_notifications` through `channels.layers.get_channel_layer()` and `asgiref.sync.async_to_sync(layer.group_send)`.
- `backend/modules/accounting/personnel/workflow_engine.py` lines 70 to 105: `notify_document_changed(instance, action='status_changed')` maps `ExpenseInvoice` to `expense_invoice` and `PettyCashTransaction` to `petty_cash` (company = `section.project.company_id`, section = `section_id`, status = `status`), `MonthlyPayrollRecord` to `payroll_record`, `MonthlyWorkPeriod` to `payroll_period`; every other model sends nothing. It is called at the end of `advance_workflow_step`, `request_workflow_revision`, `reject_workflow` and `execute_treasury_disbursement`.
- `backend/modules/accounting/personnel/workflows.py` lines 27 to 40: invoice state changes from the core workflow engine call `notify_document_changed(invoice)` when the invoice status changes.
- `backend/modules/accounting/personnel/views_domains/treasury_views.py`: `ExpenseInvoiceViewSet.perform_create` (about line 283) sends action `created`, `perform_update` sends `updated`, `perform_destroy` sends `deleted`; `PettyCashTransactionViewSet.perform_create` (about line 670) sends `created`.
- `backend/modules/accounting/personnel/test_invoice_workflow_flow.py` lines 1 to 66: reuse this fixture pattern (company, project, section, counterparty, `grant_section_perms`, `APIClient` with `HTTP_X_COMPANY_ID`, `self.captureOnCommitCallbacks(execute=True)`, `BASE = '/api/personnel/expense-invoices/'`).
- `backend/modules/accounting/personnel/test_live_events_25a.py` lines 1 to 55: the mock pattern for the channel layer (`patch('channels.layers.get_channel_layer')`, `group_send = AsyncMock()`) and `set_current_client_tab_id` / `_current_client_tab_id_var.reset(token)`.
- `backend/core/notifications/consumers.py` lines 214 to 262 (`NotificationConsumer.send_notification`, forwarded keys).
- For the petty cash POST body only: `backend/modules/accounting/personnel/serializers_domains/treasury_audit.py` lines 127 to 160 and `backend/modules/accounting/personnel/models_domains/treasury_audit.py` lines 211 to 320.

3. Definitions: a "document event" is a `group_send` call whose second argument has `type_str == 'document_changed'`. Collect them with a helper `events(mock_layer)` that returns the payloads of such calls in order.

4. Task: write `test_document_event_25c.py` with one `TestCase` class `DocumentChangedEventTests`. In `setUp` build the fixture like `test_invoice_workflow_flow.py` (codes `DOC25C`, `DOC25C-P`, `DOC25C-S`) plus a superuser `User.objects.create_superuser(username='doc25c_admin', password='x')` with a `UserCompanyAccess` row for the company. Patch the channel layer in each test. Tests (names exactly):
- `test_1_helper_without_company_sends_nothing`: inside `with self.captureOnCommitCallbacks(execute=True) as callbacks:` call `broadcast_document_changed('expense_invoice', 1, company_id=None)`; `callbacks` is empty and `group_send` is not called.
- `test_2_helper_sends_only_after_commit`: `with self.captureOnCommitCallbacks(execute=False) as callbacks:` call the helper with `company_id=self.company.pk`; `group_send` not called; then run each callback; exactly one document event, group `company_<pk>_notifications`, `doc_type`, `doc_id`, `action == 'updated'`.
- `test_3_helper_default_tab_id_and_explicit_wins`: with `set_current_client_tab_id('tab_doc')` the payload has `client_tab_id == 'tab_doc'`; with `client_tab_id='tab_x'` passed explicitly the payload has `tab_x`. Reset the context var in `finally`.
- `test_4_invoice_create_sends_created`: POST to `BASE` as the superuser with section, counterparty, invoice_number, invoice_date_shamsi, amount, category, description (use `format='multipart'` or `'json'` as the existing tests do) inside `captureOnCommitCallbacks(execute=True)`; status 201; exactly one document event with `doc_type == 'expense_invoice'`, `action == 'created'`, `doc_id` equal to the new invoice id, `section_id == self.sec.pk`, `company_id == self.company.pk`.
- `test_5_invoice_submit_sends_status_changed_with_new_status`: create an invoice with the ORM (as in `invoice()`), POST `submit/` as the employee user; at least one document event with `action == 'status_changed'`, and the last one has `status` equal to the refreshed `invoice.status`.
- `test_6_invoice_update_and_delete`: PATCH a draft invoice description as the superuser: one event with `action == 'updated'`; DELETE it: one event with `action == 'deleted'` and the old id.
- `test_7_petty_cash_create_sends_created`: POST to `/api/personnel/petty-cash-transactions/` (check the route in `backend/modules/accounting/personnel/urls.py` with a search for `petty`) as the superuser; status 201; at least one document event with `doc_type == 'petty_cash'` and `action == 'created'`.
- `test_8_engine_advance_sends_one_event`: create a `PettyCashTransaction` with the ORM in status `pending_supervisor` (fill the required fields), call `advance_workflow_step(tx, self.admin, is_financial=True)` inside `captureOnCommitCallbacks(execute=True)`; exactly one document event, `doc_type == 'petty_cash'`, `status` equal to the refreshed status.
- `test_9_other_models_send_nothing`: `notify_document_changed(PersonnelProfile.objects.create(first_name='a', last_name='b', national_code='0012345679', company=self.company))` inside `captureOnCommitCallbacks(execute=True)` sends no document event.
- `test_10_consumer_forwards_document_fields`: `inspect.getsource(NotificationConsumer.send_notification)` contains `'doc_type'`, `'doc_id'` and `'status'`.

5. Tool policy: read only the files and ranges in section 2 and `.agents/AGENTS.md`. In `backend` run `$env:PYTHONUTF8='1'; $env:DB_TEST_NAME='test_agy_docevent'; .\venv\Scripts\python.exe manage.py test personnel.test_document_event_25c --keepdb --noinput`. At most 6 runs.

6. Before finishing: all 10 tests pass (only `expectedFailure` allowed, as in rule 1); `git status --short` shows no change to tracked files after your commit.

7. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any `expectedFailure` with the exact difference. End the turn after the report.

===

[DONE] [ ] Session 2 of 2 — Release v1 step 2.5-c: frontend specs for document_changed (core helper and accountant invoices page)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow frontend/src/app/core/http/websocket.document-changed.spec.ts frontend/src/app/modules/accounting/components/finance/accountant/accountant-invoices/accountant-invoices.live.spec.ts
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/core/http/websocket.document-changed.spec.ts --min-tests 6
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-invoices/accountant-invoices.live.spec.ts --min-tests 3
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/core/http/websocket.document-changed.spec.ts --include src/app/modules/accounting/components/finance/accountant/accountant-invoices/accountant-invoices.live.spec.ts --no-skip --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.5-c): document_changed frontend specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly two new files: `frontend/src/app/core/http/websocket.document-changed.spec.ts` and `frontend/src/app/modules/accounting/components/finance/accountant/accountant-invoices/accountant-invoices.live.spec.ts`. Never edit production code, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, mark that one test with `it.fails(` and describe the exact difference in your report.
- No `it.only`, `describe.only`, `it.skip`, no `fs`/`path` imports.
- No push. Stage only your two files. Commit message subject exactly: `test(release-v1 2.5-c): document_changed frontend specs`.

2. Context (read these, nothing broader):
- `frontend/src/app/core/http/websocket.service.ts` lines 1 to 80. Facts: exported `DocumentChangedEvent` and `patchDocumentRow(rows, ev, statusField = 'status')`: returns false when `ev.action !== 'status_changed'`, when `ev.status` is null or undefined, when rows is null, or when no row has `Number(row.id) === Number(ev.doc_id)`; otherwise sets `row[statusField] = ev.status` and returns true. `WebSocketService.documentChanges$(docTypes)` emits messages from `notifications$` whose `type` (or `type_str`) is `document_changed`, whose `doc_type` is in `docTypes`, and for which `skipLiveEvent(msg)` is false (`skipLiveEvent` drops a message whose `client_tab_id` equals `service.tabId`, and a message whose `company_id` differs from `ActiveCompanyService.activeCompanySignal()?.id`).
- `frontend/src/app/core/http/websocket.service.spec.ts` (the existing setup: how `WebSocketService` is created with its `AuthService`, `ToastService` and `ActiveCompanyService` mocks). Copy that setup.
- `frontend/src/app/modules/accounting/components/finance/accountant/accountant-invoices/accountant-invoices.ts` lines 1 to 240. Facts: `AccountantInvoicesHubComponent`; `ngOnInit` subscribes to `ws.documentChanges$(['expense_invoice'])`; for an event, if `patchDocumentRow(this.allInvoices, ev)` is true it calls `updateViewAndCounters()`; otherwise, when `selectedSectionId` is null or `ev.section_id` is empty or equals `selectedSectionId`, it calls `fetchInvoices(true)`. `fetchInvoices(silent)` with `silent = true` never sets `isLoading` to true and shows no error toast.

3. Task A, `websocket.document-changed.spec.ts` (Vitest + `TestBed`). Tests (names exactly):
- `1. patchDocumentRow sets the status of the matching row`: rows `[{ id: 1, status: 'draft' }, { id: 2, status: 'draft' }]`, event `{ type: 'document_changed', doc_type: 'expense_invoice', doc_id: 2, action: 'status_changed', status: 'paid' }` returns true and only row 2 becomes `paid`.
- `2. patchDocumentRow returns false for a missing row, a non-status action or a null status`: three checks, rows unchanged.
- `3. patchDocumentRow uses the given status field`: rows `[{ id: 5, payment_status: 'PENDING' }]`, statusField `payment_status`.
- `4. documentChanges$ emits only the requested doc types`: subscribe with `['petty_cash']`; push through `service.notifications$.next(...)` one `expense_invoice` and one `petty_cash` message; exactly one emission (`petty_cash`).
- `5. documentChanges$ drops events of the same tab`: message with `client_tab_id: service.tabId` is not emitted.
- `6. documentChanges$ drops events of another company`: active company id 3 in the mock, message with `company_id: 4` not emitted; `company_id: 3` emitted.

4. Task B, `accountant-invoices.live.spec.ts` (Vitest + `TestBed`). Use `TestBed.overrideComponent(AccountantInvoicesHubComponent, { set: { template: '', imports: [] } })` so no child component is needed. Providers: `{ provide: PersonnelApiService, useValue: api }` where `api.getMySections` returns `of([{ id: 11 }])`, `api.getProjectSections` returns `of([])`, `api.getExpenseInvoices` is `vi.fn(() => of([{ id: 1, status: 'pending_accountant' }, { id: 2, status: 'pending_accountant' }]))`; `ActivatedRoute` with `queryParams: of({})`; `Router` with `navigate: vi.fn()`; `ToastService` with `vi.fn()` methods; `AuthService` and `StateService` as `{}`; `{ provide: WebSocketService, useValue: ws }` where `ws.documentChanges$ = vi.fn(() => subject.asObservable())` and `subject = new Subject<any>()`. Create the component, call `fixture.detectChanges()`, then reset the `getExpenseInvoices` call count with `api.getExpenseInvoices.mockClear()`. Tests (names exactly):
- `1. subscribes to expense_invoice document events`: `ws.documentChanges$` called with `['expense_invoice']`.
- `2. a status change of a listed invoice is patched in place without a refetch`: `subject.next({ type: 'document_changed', doc_type: 'expense_invoice', doc_id: 1, action: 'status_changed', status: 'pending_manager', section_id: 11 })`; `component.allInvoices[0].status` is `pending_manager`; `getExpenseInvoices` not called; `component.statusCounters.pending_audit` is 1.
- `3. an unknown invoice triggers a silent refetch`: event with `doc_id: 99`, `action: 'created'`, `section_id: 11`; `getExpenseInvoices` called once and `component.isLoading` is false.
- `4. an event of another section is ignored`: set `component.selectedSectionId = 11`, event with `doc_id: 99`, `section_id: 12`; `getExpenseInvoices` not called.

5. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. In `frontend` create a temporary `tsconfig.agy-2.5c.spec.json` with `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/core/http/websocket.document-changed.spec.ts", "src/app/modules/accounting/components/finance/accountant/accountant-invoices/accountant-invoices.live.spec.ts"], "exclude": [] }` and run `npx ng test --watch=false --ts-config tsconfig.agy-2.5c.spec.json --include src/app/core/http/websocket.document-changed.spec.ts --include src/app/modules/accounting/components/finance/accountant/accountant-invoices/accountant-invoices.live.spec.ts`; delete the temporary tsconfig before committing. At most 5 runs.

6. Before finishing: both specs pass (only `it.fails` allowed, as in rule 1); the temporary tsconfig is deleted; `git status --short` shows no change to tracked files after your commit.

7. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any `it.fails` with the exact difference. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 2.5-d: specs for the update bar and the update-ready state

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow frontend/src/app/shared/components/update-bar/update-bar.dom.spec.ts frontend/src/app/core/services/pwa-update.state.spec.ts
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/shared/components/update-bar/update-bar.dom.spec.ts --min-tests 4
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/core/services/pwa-update.state.spec.ts --min-tests 4
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/shared/components/update-bar/update-bar.dom.spec.ts --include src/app/core/services/pwa-update.state.spec.ts --no-skip --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.5-d): update bar and update-ready specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly two new files: `frontend/src/app/shared/components/update-bar/update-bar.dom.spec.ts` and `frontend/src/app/core/services/pwa-update.state.spec.ts`. Never edit production code, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, mark that one test with `it.fails(` and describe the exact difference in your report.
- No `it.only`, `describe.only`, `it.skip`, no `fs`/`path` imports.
- No push. Stage only your two files. Commit message subject exactly: `test(release-v1 2.5-d): update bar and update-ready specs`.

2. Context (read these, nothing broader):
- `frontend/src/app/core/services/pwa-update.service.ts` lines 1 to 130. Facts: `PwaUpdateService` has public signals `updateReady` (initially false) and `updateDismissed` (initially false). In `init()`, a `VERSION_READY` event from `swUpdate.versionUpdates` sets `updateReady` to true and `updateDismissed` to false, and opens no dialog; while a manual update is in progress (`checkAndApplyManualUpdate` running) the event is ignored. `applyUpdate()` awaits `swUpdate.activateUpdate()` (errors are caught) and then calls `window.location.reload()`. `dismissUpdate()` sets `updateDismissed` to true. In `checkAndApplyManualUpdate()`, when online, `swUpdate.isEnabled` is true and `updateReady()` is true, it calls `applyUpdate()` and does not call `swUpdate.checkForUpdate()`.
- `frontend/src/app/core/services/pwa-update.service.spec.ts` lines 1 to 80 (the existing setup: `SwUpdate`, `ToastService` and `ConfirmDialogService` mocks, `TestBed`, and how `NetworkStatusService.getInstance()` getters `isBrowserOnline` / `isServerUnreachable` are mocked with `vi.spyOn(..., 'get')`). Copy that setup.
- `frontend/src/app/shared/components/update-bar/update-bar.component.ts` (whole file, 66 lines). Facts: standalone `UpdateBarComponent`, selector `app-update-bar`, injects `PwaUpdateService` as `pwaUpdate`. It renders a `section[role="status"]` only when `pwaUpdate.updateReady()` is true and `pwaUpdate.updateDismissed()` is false. Button `[data-testid="update-bar-apply"]` calls `onApply()`, which calls `pwaUpdate.applyUpdate()`. Button `[data-testid="update-bar-later"]` calls `pwaUpdate.dismissUpdate()`. Text `نسخهٔ تازهٔ برنامه آماده است.` is in the bar.
- To stub the reload in jsdom: `Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload: vi.fn() } })` in `beforeEach`, and restore the original object in `afterEach`.

3. Task A, `update-bar.dom.spec.ts` (Vitest + `TestBed`, first line `// @vitest-environment jsdom`, same `initTestEnvironment` try-block as the existing spec). Provide `{ provide: PwaUpdateService, useValue: fake }` where `fake = { updateReady: signal(false), updateDismissed: signal(false), applyUpdate: vi.fn().mockResolvedValue(undefined), dismissUpdate: vi.fn(() => fake.updateDismissed.set(true)) }` (`signal` from `@angular/core`). Tests (names exactly):
- `1. hidden when no update is ready`: after `fixture.detectChanges()`, no `section[role="status"]`.
- `2. shown when an update is ready`: set `fake.updateReady.set(true)`, detect changes; the section exists and its text contains `نسخهٔ تازهٔ برنامه آماده است.`.
- `3. the update button calls applyUpdate`: ready, click `[data-testid="update-bar-apply"]`, `await fixture.whenStable()`; `fake.applyUpdate` called once.
- `4. the later button dismisses and hides the bar`: ready, click `[data-testid="update-bar-later"]`, detect changes; `fake.dismissUpdate` called once and the section is gone.
- `5. buttons have Persian aria-labels`: ready; apply button `aria-label` is `به‌روزرسانی`, later button `aria-label` is `بعداً`.

4. Task B, `pwa-update.state.spec.ts` (Vitest + `TestBed`, first line `// @vitest-environment jsdom`, copy the existing spec setup with a `Subject` for `versionUpdates`; call `service.ngOnDestroy()` in `afterEach`). Tests (names exactly):
- `1. VERSION_READY sets updateReady and opens no dialog`: `service.init()`, push `{ type: 'VERSION_READY', currentVersion: { hash: '1' }, latestVersion: { hash: '2' } }`; `service.updateReady()` is true, `service.updateDismissed()` is false, `mockConfirmDialog.open` not called.
- `2. dismissUpdate sets updateDismissed and a new VERSION_READY clears it`: after test 1 state, `service.dismissUpdate()` makes `updateDismissed()` true; another `VERSION_READY` makes it false again.
- `3. applyUpdate activates the update and reloads`: `await service.applyUpdate()`; `mockSwUpdate.activateUpdate` called once and `window.location.reload` called once.
- `4. applyUpdate still reloads when activateUpdate fails`: `mockSwUpdate.activateUpdate.mockRejectedValue(new Error('x'))`; `await service.applyUpdate()`; reload called once.
- `5. manual update with an update already ready applies it without a new check`: online mocks as in the existing spec, `service.updateReady.set(true)`, `await service.checkAndApplyManualUpdate()`; `mockSwUpdate.checkForUpdate` not called, `mockSwUpdate.activateUpdate` called once, reload called once.

5. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. In `frontend` create a temporary `tsconfig.agy-2.5d.spec.json` with `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/shared/components/update-bar/update-bar.dom.spec.ts", "src/app/core/services/pwa-update.state.spec.ts"], "exclude": [] }` and run `npx ng test --watch=false --ts-config tsconfig.agy-2.5d.spec.json --include src/app/shared/components/update-bar/update-bar.dom.spec.ts --include src/app/core/services/pwa-update.state.spec.ts`; delete the temporary tsconfig before committing. At most 5 runs.

6. Before finishing: both specs pass (only `it.fails` allowed, as in rule 1); the temporary tsconfig is deleted; `git status --short` shows no change to tracked files after your commit.

7. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any `it.fails` with the exact difference. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 2.6-a: tests for can_view and is_locked registry hooks and workflow history

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow backend/core/workflow/tests/test_view_hooks_26a.py
verify: set DB_TEST_NAME=test_agy_hooks26a&& python scripts/automation/verify_tools.py django-tests --labels workflow.tests.test_view_hooks_26a --min-tests 10
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.6-a): can_view and is_locked hooks"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly one new file: `backend/core/workflow/tests/test_view_hooks_26a.py`. Never edit production code, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, mark that one test with `@unittest.expectedFailure` and describe the exact difference in your report.
- Every hook a test adds must be removed after the test: use `unittest.mock.patch.dict(platform_core.registry._CONTRIBUTIONS, {...})` as a context manager or decorator, never a bare `contribute(...)`.
- No push. Stage only your file. Commit message subject exactly: `test(release-v1 2.6-a): can_view and is_locked hooks`.

2. Context (read these, nothing broader):
- `backend/core/platform_core/registry.py`, the block starting at the comment line that contains `can_view:<kind>` (about 50 lines, after `resolve_entity_map`). Facts:
  - `entity_view_decision(user, kind, entity_id)` returns True, False or None. Inactive user or None user: False. Active superuser: True, even with a deny hook. Empty kind or falsy entity_id: False. Then it calls every `contributions(f'can_view:{kind}')` hook as `hook(user, entity_id)`: a hook returning False makes the result False at once; a hook raising any exception makes the result False; if at least one hook returned True and none returned False, the result is True; if no hooks exist or all returned None, the result is None.
  - `can_view(user, kind, entity_id)` is True only when `entity_view_decision` is True.
  - `is_entity_locked(kind, entity_id)`: empty kind or falsy id returns False; True when any `contributions(f'is_locked:{kind}')` hook called as `hook(entity_id)` returns a truthy value; a hook raising an exception makes it True; no hooks returns False.
  - Hooks are stored in the module dict `_CONTRIBUTIONS` (key is the point name, value is a list of callables).
- `backend/core/accounts/apps.py`: `ready()` registers `contribute('can_view:user', ...)`: for kind `user`, the hook returns True when `str(user.pk) == str(entity_id)`, otherwise None.
- `backend/core/workflow/views.py`, function `visible_instances` (about 25 lines): it first calls `entity_view_decision(user, kind, entity_id)`; False returns no instances (history GET answers 404), True returns all instances (200), None falls back to the old rules.
- `backend/core/workflow/tests/test_api.py` lines 1–48 (class `ApiBase`, helpers `get`, `submit`) and lines 152–185 (`HistoryApiTests`): copy the way `test_history_rows` creates a document with `self.submit()` and calls `self.get(user, 'history/', kind=KIND, id=d.pk)`. Users available from the base: `self.member` (the submitter, sees history by the old rules), `self.payer` (does not see it by the old rules, 404), `self.su` (superuser). `KIND` comes from `.base`.

3. Task, `backend/core/workflow/tests/test_view_hooks_26a.py`:
- Class `RegistryHookTests(django.test.TestCase)`; create one active normal user and one active superuser with `django.contrib.auth.get_user_model().objects.create_user(...)` (superuser with `is_superuser=True`). Use the kind string `'zz_doc'` and entity id 7. Tests (names exactly):
  - `test_no_hook_is_none_and_can_view_false`: decision is None; `can_view` is False.
  - `test_allow_hook_gives_true`: one hook returning True; decision True; `can_view` True.
  - `test_deny_wins_over_allow`: hooks `[allow, deny]` and also `[deny, allow]`; decision False both times.
  - `test_hook_error_is_deny`: a hook raising `RuntimeError`; decision False.
  - `test_superuser_and_inactive`: with a deny hook the superuser gets True; an inactive normal user (`is_active=False`) gets False with an allow hook; `None` user gets False.
  - `test_falsy_entity_or_kind_is_false`: allow hook present; entity id 0 and None give False; kind `''` gives False.
  - `test_user_kind_self_only`: no patching; `entity_view_decision(user, 'user', user.pk)` is True and with `str(user.pk)` is True; for another user's pk it is None; `can_view` for the other pk is False.
  - `test_is_locked`: no hook gives False; hook returning True gives True; hooks `[lambda i: False]` give False; a raising hook gives True; entity id 0 gives False even with a True hook.
- Class `HistoryHookTests(ApiBase)` importing `ApiBase` from `.test_api` and `KIND` from `.base`. Tests (names exactly):
  - `test_deny_hook_hides_history_from_submitter`: `d, _ = self.submit()`; with a `can_view:{KIND}` hook returning False, `self.member` gets 404 and `self.su` gets 200; without the hook (after the patch ends) `self.member` gets 200 again.
  - `test_allow_hook_shows_history_to_outsider`: with a hook returning True only for `self.payer.pk` (else None), `self.payer` gets 200; without it, 404.
  - `test_none_hook_keeps_old_rules`: hook returning None for everyone; `self.member` 200, `self.payer` 404.

4. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. In `backend` run `$env:PYTHONUTF8='1'; .\venv\Scripts\python.exe manage.py test workflow.tests.test_view_hooks_26a --keepdb --noinput`. At most 5 runs.

5. Before finishing: all 11 tests pass (only marked expected failures allowed, as in rule 1); `git status --short` shows no change to tracked files after your commit.

6. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any expected failure with the exact difference. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 2.6-b: tests for the core attachments API and protected media

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow backend/core/attachments/tests/__init__.py backend/core/attachments/tests/test_attachments_26b.py
verify: set DB_TEST_NAME=test_agy_att26b&& python scripts/automation/verify_tools.py django-tests --labels attachments.tests.test_attachments_26b --min-tests 10
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.6-b): attachments API"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly two new files: `backend/core/attachments/tests/__init__.py` (empty) and `backend/core/attachments/tests/test_attachments_26b.py`. Never edit production code, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, mark that one test with `@unittest.expectedFailure` and describe the exact difference in your report.
- Every hook a test adds must be removed after the test: use `unittest.mock.patch.dict(platform_core.registry._CONTRIBUTIONS, {...})` as a context manager or decorator, never a bare `contribute(...)`. Note `patch.dict` with a new key adds it and removes it afterwards; for the key `can_view:user` keep the existing list (do not patch it).
- Every test class uses a temporary media folder: `tempfile.mkdtemp()` in `setUpClass`, `override_settings(MEDIA_ROOT=tmp)` on the class (or `self.settings(...)` per test), and `shutil.rmtree(tmp, ignore_errors=True)` in `tearDownClass`. Never write into the real `backend/media`.
- No push. Stage only your two files. Commit message subject exactly: `test(release-v1 2.6-b): attachments API`.

2. Context (read these, nothing broader):
- `backend/core/attachments/views.py` (whole file, about 210 lines) and `backend/core/attachments/models.py` (whole file). Facts:
  - URLs under `/api/attachments/`: `GET ?kind=<k>&id=<id>` list (403 when `can_view` is not True), `POST` multipart with `kind`, `id`, `file`, optional `label`, `order`, `description` (403 when `can_attach` is not True; 201 with JSON fields including `sha256`, `storage`, `download_url`), `DELETE <pk>/` (204; soft delete sets `archived_at`; 403 without `can_attach`; 409 when the entity is locked), `POST <pk>/replace/` with `file` (201, new row; old row gets `archived_at` and `replaced_by`; 409 when locked), `GET <pk>/download/` (403 without `can_view`, checked on every request; archived rows give 404 to non-superusers).
  - Allowed file extensions include `.pdf` and `.png`; use `django.core.files.uploadedfile.SimpleUploadedFile('a.pdf', b'%PDF-1.4 test', content_type='application/pdf')`.
  - `company_id` of a new row comes from `platform_core.registry.company_of(kind, id)`, which calls hooks under the key `company_of:<kind>` as `hook(entity_id)`.
- `backend/core/platform_core/registry.py`: functions `can_view`, `can_attach`, `is_entity_locked`, `company_of` (Grep them; about 10–25 lines each). Hook keys: `can_view:<kind>` and `can_attach:<kind>` called as `hook(user, entity_id)` returning True, False or None; `is_locked:<kind>` called as `hook(entity_id)`. Active superusers always pass `can_view` and `can_attach`.
- `backend/core/accounts/apps.py`: `ready()` registers `can_view:user` and `can_attach:user`: True only when `str(user.pk) == str(entity_id)`, else None.
- `backend/core/common/media_urls.py` (whole file, about 170 lines): `signed_media_url(name)` returns `/media/<path>?e=..&s=..` for protected prefixes (now including `personnel_docs/` and `vehicle_docs/`); `serve_media` answers 403 for any path starting with `attachments/` even with a valid signature, and 403 for protected paths without a valid signature.

3. Task, `backend/core/attachments/tests/test_attachments_26b.py`:
- Use `rest_framework.test.APITestCase` and `self.client.force_authenticate(user)`. Users from `django.contrib.auth.get_user_model().objects.create_user(...)`: `self.owner`, `self.other` (both normal, active) and `self.su` (`is_superuser=True`, `is_staff=True`). Kind string `'zz_doc'`, entity id `'7'`. Helper `_hooks(view=None, attach=None, locked=None, company=None)` returning a `patch.dict(registry._CONTRIBUTIONS, {...})` with only the given keys, where each value is a one-item list. Helper `_upload(user, kind='zz_doc', entity_id='7', name='a.pdf', content=b'%PDF-1.4 test', label='')` posting multipart to `/api/attachments/`.
- Tests (names exactly):
  - `test_list_denied_without_can_view`: no hooks; `GET /api/attachments/?kind=zz_doc&id=7` as `self.owner` is 403.
  - `test_upload_denied_without_can_attach`: view hook allows, no attach hook; upload is 403 and `Attachment.objects.count() == 0`.
  - `test_upload_ok_sha256_company`: attach and view hooks allow, `company` hook returns 42; upload 201; row has `sha256 == hashlib.sha256(content).hexdigest()`, `company_id == 42`, `storage == 'server'`, `uploaded_by == self.owner`; the list as `self.owner` returns 1 item whose `download_url` ends with `/download/`.
  - `test_delete_locked_refused`: upload with hooks allowing; then with a `locked` hook returning True, `DELETE /api/attachments/<pk>/` is 409 and the row still has `archived_at is None`; the same with the superuser is also 409.
  - `test_replace_locked_refused`: same as above with `POST /api/attachments/<pk>/replace/` (new file); 409 and the count of rows is still 1.
  - `test_soft_delete_keeps_file`: upload, remember `path = Attachment.objects.get().file.path`; `DELETE` (no lock) is 204; the row has `archived_at` set; `os.path.exists(path)` is True; the list no longer shows it; download as `self.owner` is 404; download as `self.su` is 200.
  - `test_replace_archives_old`: upload, then replace is 201; the old row has `archived_at` set and `replaced_by_id` equal to the new row id; the list shows only the new row.
  - `test_download_checks_can_view_each_request`: upload; with the view hook allowing, download is 200 and the body (join `response.streaming_content`) equals the uploaded bytes; then with a view hook returning False the same URL is 403.
  - `test_media_attachments_always_forbidden`: upload; `name = Attachment.objects.get().file.name`; `url = signed_media_url(name)` from `common.media_urls`, but for this prefix build a signed URL yourself: `from common.media_urls import _current_expiry, _signature`; `e = _current_expiry(); s = _signature(name, e)`; `self.client.get(f'/media/{name}?e={e}&s={s}')` is 403. Also `/media/x/../{name}` is 403.
  - `test_personnel_docs_requires_signature`: write a file `personnel_docs/p.pdf` under the temp MEDIA_ROOT; unauthenticated `GET /media/personnel_docs/p.pdf` is 403; `GET` of `signed_media_url('personnel_docs/p.pdf')` is 200. Same for `vehicle_docs/2026/01/v.pdf`.
  - `test_user_signature_self_only`: no patching. `self.owner` uploads with `kind='user'`, `entity_id=str(self.owner.pk)`, `name='sig.png'`, content a few bytes, `label='signature'`: 201 and `storage == 'server'`. `self.other` uploading to the owner's user id is 403; `self.other` listing `?kind=user&id=<owner pk>` is 403; `self.other` downloading the owner's signature is 403; `self.owner` downloading it is 200.
  - `test_bad_kind_rejected`: with allow hooks for `zz_doc`, uploading with `kind='Bad-Kind'` is 400.

4. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. In `backend` run `$env:PYTHONUTF8='1'; .\venv\Scripts\python.exe manage.py test attachments.tests.test_attachments_26b --keepdb --noinput`. At most 6 runs.

5. Before finishing: all 12 tests pass (only marked expected failures allowed, as in rule 1); `git status --short` shows no change to tracked files after your commit; the temporary media folders are removed.

6. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any expected failure with the exact difference. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 2.6-c: tests for the drive models move to core settings_core

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow backend/core/settings_core/test_drive_move_26c.py
verify: set DB_TEST_NAME=test_agy_drive26c&& python scripts/automation/verify_tools.py django-tests --labels settings_core.test_drive_move_26c --min-tests 6
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.6-c): drive models move"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly one new file: `backend/core/settings_core/test_drive_move_26c.py`. Never edit production code, migrations, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, mark that one test with `@unittest.expectedFailure` and describe the exact difference in your report.
- Never delete rows from the real database; tests run only on the Django test database.
- No push. Stage only your file. Commit message subject exactly: `test(release-v1 2.6-c): drive models move`.

2. Context (read these, nothing broader):
- `backend/core/settings_core/models.py` lines 180–445: classes `CompanyGoogleDriveConfig` (OneToOne `company` to `companies.Company`, `related_name='gdrive_config'`, `db_table='personnel_companygoogledriveconfig'`) and `GoogleDriveSyncQueue` (FK `company`, `related_name='gdrive_sync_tasks'`, `db_table='personnel_googledrivesyncqueue'`, six indexes with explicit names). They were moved from the accounting module state-only; `backend/modules/accounting/personnel/models.py` re-exports both names (`from settings_core.models import CompanyGoogleDriveConfig, GoogleDriveSyncQueue`).
- `backend/modules/accounting/personnel/migrations/0006_move_drive_to_settings_core.py` (whole file): moves the content types of both models to app label `settings_core`.
- `backend/core/settings_core/management/commands/run_gdrive_sync_worker.py` lines 29–130: flags `--once`, `--interval`, `--limit`, `--company-id`, `--ignore-schedule`.
- `backend/core/companies/models.py`: Grep `class Company(` and read only that class to see the required fields for `Company.objects.create(...)`.

3. Task, `backend/core/settings_core/test_drive_move_26c.py`:
- Use `django.test.TestCase`. In `setUpTestData` create one company `cls.company` with the minimal required fields (unique `code` such as `'DRV26C'`).
- Tests (names exactly):
  - `test_personnel_reexports_core_classes`: `personnel.models.CompanyGoogleDriveConfig is settings_core.models.CompanyGoogleDriveConfig` and the same for `GoogleDriveSyncQueue`; both have `_meta.app_label == 'settings_core'`.
  - `test_tables_unchanged`: `_meta.db_table` is `'personnel_companygoogledriveconfig'` and `'personnel_googledrivesyncqueue'`.
  - `test_index_names_unchanged`: the set of `index.name` in `GoogleDriveSyncQueue._meta.indexes` equals `{'personnel_g_company_f971b0_idx', 'personnel_g_status_50fa27_idx', 'personnel_g_model_n_4c523e_idx', 'personnel_g_status_7b750a_idx', 'personnel_g_status_dcbe53_idx', 'idx_gdrive_dedup_acct'}`; also, with `django.db.connection.introspection.get_constraints(cursor, 'personnel_googledrivesyncqueue')`, all six names exist in the database.
  - `test_rows_counted_in_same_table`: create one config and three queue rows (`model_name='ZzDoc'`, `source_file_path='x.pdf'`, `target_folder_path='a/b'`, `target_filename='x.pdf'`) through the core models; a raw `SELECT COUNT(*) FROM personnel_googledrivesyncqueue` equals 3 and equals `GoogleDriveSyncQueue.objects.count()`; the same for the config table (1).
  - `test_related_names_work`: after creating the rows, `self.company.gdrive_config` is the config and `self.company.gdrive_sync_tasks.count() == 3`.
  - `test_content_types_moved`: `ContentType.objects.get_for_model(GoogleDriveSyncQueue).app_label == 'settings_core'`, the same for the config, and `ContentType.objects.filter(app_label='personnel', model__in=['googledrivesyncqueue', 'companygoogledriveconfig']).count() == 0`.
  - `test_worker_once_keeps_rows`: create one queue row with `status='pending'` for a company that has NO config; `call_command('run_gdrive_sync_worker', '--once', stdout=io.StringIO(), stderr=io.StringIO())` raises nothing; afterwards `GoogleDriveSyncQueue.objects.count()` is unchanged and the row still exists (its status may be any value, only assert it exists).

4. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. In `backend` run `$env:PYTHONUTF8='1'; .\venv\Scripts\python.exe manage.py test settings_core.test_drive_move_26c --keepdb --noinput`. At most 6 runs.

5. Before finishing: all 7 tests pass (only marked expected failures allowed, as in rule 1); `git status --short` shows no change to tracked files after your commit.

6. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any expected failure with the exact difference. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 2.6-c2: tests for attachment drive storage and the core company drive queue

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow backend/core/attachments/tests/test_storage_26c2.py
verify: set DB_TEST_NAME=test_agy_storage26c2&& python scripts/automation/verify_tools.py django-tests --labels attachments.tests.test_storage_26c2 --min-tests 8
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.6-c2): attachment drive storage"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly one new file: `backend/core/attachments/tests/test_storage_26c2.py`. Never edit production code, migrations, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- Core test files must not import accounting or warehouse modules (no `personnel`, `warehouses`, `inventory` imports). Use only `companies`, `settings_core`, `attachments`, `platform_core` and Django.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, mark that one test with `@unittest.expectedFailure` and describe the exact difference in your report.
- Never delete rows from the real database; tests run only on the Django test database.
- No push. Stage only your file. Commit message subject exactly: `test(release-v1 2.6-c2): attachment drive storage`.

2. Context (read these, nothing broader):
- `backend/core/attachments/views.py` lines 1–130: `SERVER_ONLY_LABELS`, `_storage_for(kind, entity_id, label, company_id)` (returns `Attachment.STORAGE_SERVER` or `Attachment.STORAGE_GDRIVE`), `_enqueue_drive_copy(obj)`, and lines 145–166 (`AttachmentListCreateView.post`).
- `backend/core/attachments/tests/test_attachments_26b.py` lines 1–95: copy its pattern exactly: the `patch.dict(platform_core.registry._CONTRIBUTIONS, ...)` helper for registry hooks (`can_view:<kind>`, `can_attach:<kind>`, `company_of:<kind>`, `is_confidential:<kind>`), the temporary `MEDIA_ROOT` with `override_settings`, the user and the upload request to `/api/attachments/`.
- `backend/core/platform_core/registry.py` lines 233–241: `is_entity_confidential` reads hooks `is_confidential:<kind>`.
- `backend/core/settings_core/models.py` lines 180–445: `CompanyGoogleDriveConfig` (OneToOne `company`, fields `is_enabled`, `refresh_token`) and `GoogleDriveSyncQueue`.
- `backend/core/settings_core/company_drive_service.py` lines 173–200: `_run_scan_all` reads hook `gdrive_scan_all`; with no hook the row goes back to `pending` with `next_retry_at` set.
- `backend/core/companies/models.py`: Grep `class Company(` and read only that class.

3. Task, `backend/core/attachments/tests/test_storage_26c2.py`. Use `rest_framework.test.APITestCase`. Create one company with a config helper `_connect(company, enabled=True, token='enc-token')` that creates `CompanyGoogleDriveConfig(company=company, is_enabled=enabled, refresh_token=token)`. Use entity kind `zzdoc` with registry hooks patched as in the 26b file (`company_of:zzdoc` returns the company id). Tests (names exactly):
  - `test_server_when_confidential`: connected company, hook `is_confidential:zzdoc` returns True → `_storage_for('zzdoc', '1', '', company.id) == 'server'`.
  - `test_server_for_user_kind`: connected company → `_storage_for('user', '1', '', company.id) == 'server'`.
  - `test_server_for_signature_and_stamp`: connected company → label `'signature'` and label `'stamp'` both give `'server'`.
  - `test_server_without_config`: company with no config → `'server'`; also `company_id=None` → `'server'`.
  - `test_server_without_refresh_token`: config with `refresh_token=None` → `'server'`; config with `refresh_token=''` → `'server'`; config with `is_enabled=False` → `'server'`.
  - `test_gdrive_when_connected`: enabled config with a token, no confidential hook → `'gdrive'`.
  - `test_upload_enqueues_one_row_and_keeps_file`: connected company, POST a small pdf upload to `/api/attachments/` (same shape as the 26b upload test) → 201, response `storage == 'gdrive'`; exactly one `GoogleDriveSyncQueue` row with `model_name='Attachment'`, `object_id` equal to the new attachment id, `field_name='file'`, `action='upload'`, `status='pending'`, `source_file_path == attachment.file.name`; the file exists on disk at `os.path.join(settings.MEDIA_ROOT, attachment.file.name)`. A second upload for a company without config creates no queue row and gives `storage == 'server'`.
  - `test_worker_keeps_scan_all_pending_without_hook`: connected company with `sync_mode='immediate'`; create a `GoogleDriveSyncQueue` row with `action='scan_all'`, `status='pending'`, `model_name='ScanAll'`, `source_file_path=''`, `target_folder_path=''`, `target_filename=''`; with `patch.dict(platform_core.registry._CONTRIBUTIONS, {}, clear=False)` plus removing the key `gdrive_scan_all` (use `patch.dict(..., {'gdrive_scan_all': []})`), call `call_command('run_gdrive_sync_worker', '--once', stdout=io.StringIO(), stderr=io.StringIO())`; the row still exists, `status == 'pending'` and `next_retry_at` is not None.

4. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. In `backend` run `$env:PYTHONUTF8='1'; $env:DB_TEST_NAME='test_agy_storage26c2'; .\venv\Scripts\python.exe manage.py test attachments.tests.test_storage_26c2 --noinput`. At most 6 runs.

5. Before finishing: all 8 tests pass (only marked expected failures allowed, as in rule 1); `git status --short` shows no change to tracked files after your commit.

6. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any expected failure with the exact difference. End the turn after the report.

===

[DONE] [ ] Session 1 of 2 — Release v1 step 2.6-d: tests for the document view log and the audit log view-hook filter

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow backend/core/attachments/tests/test_view_log_26d.py
verify: set DB_TEST_NAME=test_agy_viewlog26d&& python scripts/automation/verify_tools.py django-tests --labels attachments.tests.test_view_log_26d --min-tests 7
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.6-d): view log and audit filter"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly one new file: `backend/core/attachments/tests/test_view_log_26d.py`. Never edit production code, migrations, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- Core test files must not import accounting or warehouse modules (no `personnel`, `warehouses`, `inventory` imports). Use only `accounts`, `companies`, `attachments`, `platform_core` and Django.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, mark that one test with `@unittest.expectedFailure` and describe the exact difference in your report.
- Never delete rows from the real database; tests run only on the Django test database.
- No push. Stage only your file. Commit message subject exactly: `test(release-v1 2.6-d): view log and audit filter`.

2. Context (read these, nothing broader):
- `backend/core/attachments/models.py`: classes `Attachment` and `EntityViewLog` (fields `user`, `entity_kind`, `entity_id` (string), `company_id`, `viewed_at`).
- `backend/core/attachments/services.py` (whole file, 30 lines): `record_entity_view(user, kind, entity_id, company_id=None)` writes at most one row per user and document per 10 minutes (`VIEW_LOG_WINDOW`) and returns True only when it wrote a row.
- `backend/core/attachments/views.py` lines 211–245: `AttachmentDownloadView.get` calls `record_entity_view` only after the `can_view` check passes and the file exists.
- `backend/core/attachments/tests/test_attachments_26b.py` lines 1–110: copy its pattern exactly: the `_hooks(...)` helper with `patch.dict(platform_core.registry._CONTRIBUTIONS, ...)`, the temporary `MEDIA_ROOT` with `override_settings`, the users and the upload request to `/api/attachments/`. The download URL is `/api/attachments/<id>/download/`.
- `backend/core/accounts/views_domains/audit_views.py` lines 733–795: `audit_entity_kinds()` reads `contribute('audit_entity_kinds', (target_model, kind))`; `denied_audit_ids(user, logs)`; `AuditLogViewSet.list` hides rows whose document the `can_view:<kind>` hook denies with exactly `False` (a `None` verdict keeps the row); `get_object` raises 404 for such rows. Lines 1413–1470: `revert` and `bulk_revert`.
- `backend/core/accounts/models.py` line 208: class `AuditLog` (read only its field list: `target_model`, `target_object_id`, `module`, `action`, `user`, `company_id`).
- The audit list route is `/api/audit-logs/` (router in `backend/core/accounts/urls.py` line 23); the list response is paginated with a `results` key.

3. Task, `backend/core/attachments/tests/test_view_log_26d.py`. Use `rest_framework.test.APITestCase`. Use entity kind `zz_doc`. Tests (names exactly):
  - `test_download_writes_one_row`: superuser uploads an attachment (as in 26b), then a normal active user with `can_view:zz_doc` hook returning True downloads it → 200 and exactly one `EntityViewLog` row for that user with `entity_kind='zz_doc'` and `entity_id='7'`.
  - `test_second_download_within_window_writes_none`: same user downloads twice → still exactly one row.
  - `test_download_after_window_writes_again`: after the first download, update the row with `EntityViewLog.objects.update(viewed_at=timezone.now() - timedelta(minutes=11))`, download again → two rows.
  - `test_denied_download_writes_none`: hook returns False → 403 and zero rows; hook not registered at all → 403 and zero rows.
  - `test_audit_list_hides_denied_rows`: create two `AuditLog` rows directly with `target_model='ZzDoc'`, `target_object_id='1'` and `'2'`, `module='security'`, `action='UPDATE'`, `company_id=None`. Superusers bypass the filter, so the requesting user is a normal active user with `is_staff=False` who has the Django permission `accounts.perm_sys_logs` (add it with `Permission.objects.get(codename='perm_sys_logs')` and `user.user_permissions.add(...)`, then re-fetch the user). Patch `_CONTRIBUTIONS` with `{'audit_entity_kinds': [('ZzDoc', 'zz_doc')], 'can_view:zz_doc': [lambda user, eid: False if str(eid) == '1' else None]}`. GET `/api/audit-logs/` → 200; the ids in `results` contain row 2 and not row 1.
  - `test_audit_detail_denied_is_404`: same setup; GET `/api/audit-logs/<row1 id>/` → 404; GET for row 2 → 200.
  - `test_superuser_sees_denied_rows`: same hooks; superuser GET `/api/audit-logs/` → both row ids present.

4. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. In `backend` run `$env:PYTHONUTF8='1'; $env:DB_TEST_NAME='test_agy_viewlog26d'; .\venv\Scripts\python.exe manage.py test attachments.tests.test_view_log_26d --noinput`. At most 6 runs. If the audit list returns 403 for the normal user, add the user to whatever is needed only inside the test (for example also grant `accounts.perm_sys_audit_export`) and report it.

5. Before finishing: all 7 tests pass (only marked expected failures allowed, as in rule 1); `git status --short` shows no change to tracked files after your commit.

6. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any expected failure with the exact difference. End the turn after the report.

===

[DONE] [ ] Session 2 of 2 — Release v1 step 2.6-d: tests for the company settings API

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow backend/core/settings_core/test_company_settings_26d.py
verify: set DB_TEST_NAME=test_agy_compset26d&& python scripts/automation/verify_tools.py django-tests --labels settings_core.test_company_settings_26d --min-tests 7
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.6-d): company settings api"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly one new file: `backend/core/settings_core/test_company_settings_26d.py`. Never edit production code, migrations, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- Core test files must not import accounting or warehouse modules (no `personnel`, `warehouses`, `inventory` imports). Use only `accounts`, `companies`, `settings_core`, `platform_core` and Django.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, mark that one test with `@unittest.expectedFailure` and describe the exact difference in your report.
- Never delete rows from the real database; tests run only on the Django test database.
- No push. Stage only your file. Commit message subject exactly: `test(release-v1 2.6-d): company settings api`.

2. Context (read these, nothing broader):
- `backend/core/settings_core/company_settings.py` (whole file, ~130 lines): `CompanySettingSpec(module, key, default, type, title_fa, perm)`, `company_setting_specs()` reads `contribute('company_settings', spec)`, `can_write_company_setting`, `CompanySettingsView` (GET list, PATCH/PUT one key). Route `/api/settings/company/<company_id>/` (`backend/config/urls.py`, name `company-settings`).
- `backend/core/settings_core/models.py`: Grep `class CompanySetting` and read that class only.
- `backend/core/companies/access.py` lines 152–235: `get_user_allowed_companies` and `validate_user_company_access` (no access → 403).
- `backend/core/settings_core/test_drive_move_26c.py`: read its first 60 lines to see how it creates a `Company` and gives a normal user access to it; reuse the same way. If it does not give access, Grep `CompanyMembership\|UserCompanyAccess\|assigned_companies` in `backend/core/companies/models.py` and use the simplest membership model there.
- For registry patching copy the pattern in `backend/core/attachments/tests/test_attachments_26b.py` lines 1–40 (`patch.dict(platform_core.registry._CONTRIBUTIONS, {...})`).

3. Task, `backend/core/settings_core/test_company_settings_26d.py`. Use `rest_framework.test.APITestCase`. Register fake specs with `patch.dict(platform_core.registry._CONTRIBUTIONS, {'company_settings': [CompanySettingSpec('zzmod', 'flag', False, 'bool', 'Flag', 'accounts.perm_sys_settings'), CompanySettingSpec('zzmod', 'limit', 5, 'int', 'Limit', 'accounts.perm_sys_settings')]})`. Users: a superuser; user A (normal, active) with access to company 1 and the Django permission `accounts.perm_sys_settings` (if that codename does not exist, pick any existing system-scope permission from `Permission.objects.filter(content_type__app_label='accounts')` that is NOT returned by `accounts.scoped_permissions.section_permission_codes()` and use it in both specs); user B with access to company 1 but no permission; user C with access only to company 2. Tests (names exactly):
  - `test_default_returned_when_no_row`: user A GET company 1 → 200; `results` has `flag` with `value False` and `is_default True`, `limit` with `value 5`.
  - `test_undeclared_key_400`: user A PATCH `{module: 'zzmod', key: 'nope', value: 1}` → 400; no `CompanySetting` row.
  - `test_wrong_type_400`: user A PATCH `{module: 'zzmod', key: 'flag', value: 1}` → 400; `{key: 'limit', value: True}` → 400; `{key: 'limit', value: '7'}` → 400.
  - `test_write_ok_then_read_back`: user A PATCH `{module: 'zzmod', key: 'limit', value: 9}` with `format='json'` → 200 and value 9; one `CompanySetting` row with `updated_by` = user A; GET returns `limit` value 9 and `is_default False`. A second PATCH with 10 updates the same row (still one row).
  - `test_user_without_perm_403`: user B PATCH → 403, no row; user B GET → 200 with `can_edit False` on both items.
  - `test_other_company_user_cannot_read_or_write`: user C GET company 1 → 403; PATCH company 1 → 403; no row.
  - `test_unknown_company_404`: superuser GET `/api/settings/company/999999/` → 404.

4. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. In `backend` run `$env:PYTHONUTF8='1'; $env:DB_TEST_NAME='test_agy_compset26d'; .\venv\Scripts\python.exe manage.py test settings_core.test_company_settings_26d --noinput`. At most 6 runs.

5. Before finishing: all 7 tests pass (only marked expected failures allowed, as in rule 1); `git status --short` shows no change to tracked files after your commit.

6. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any expected failure with the exact difference. End the turn after the report.

===

[DONE] [ ] Session 1 of 2 — Release v1 step 2.6-e: tests for section on/off switches (disabled_sections)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow backend/core/settings_core/test_toggle_sections_26e.py
verify: set DB_TEST_NAME=test_agy_toggle26e&& python scripts/automation/verify_tools.py django-tests --labels settings_core.test_toggle_sections_26e --min-tests 7
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.6-e): section switches"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly one new file: `backend/core/settings_core/test_toggle_sections_26e.py`. Never edit production code, migrations, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- Core test files must not import accounting or warehouse modules (no `personnel`, `warehouses`, `inventory` imports). Use only `accounts`, `settings_core`, `platform_core` and Django.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, mark that one test with `@unittest.expectedFailure` and describe the exact difference in your report.
- Never delete rows from the real database; tests run only on the Django test database.
- No push. Stage only your file. Commit message subject exactly: `test(release-v1 2.6-e): section switches`.

2. Context (read these, nothing broader):
- `backend/core/settings_core/services.py`: `DEFAULT_SETTINGS` (key `disabled_sections`, default `[]`), functions `declared_toggle_sections()` (reads `contributions('toggle_sections')`, items are `(code, title_fa)` tuples), `get_disabled_sections()` (drops codes that are not declared) and the `disabled_sections` branch of `validate_settings_payload` (value must be a list of unique declared codes). Also `clear_setting_cache`.
- `backend/core/settings_core/views.py`: `SettingsViewSet.global_settings` POST (route `/api/settings/global/`, see `backend/config/urls.py` line 27): a non-superuser whose payload changes `disabled_sections` gets 403 with `invalid_keys == ['disabled_sections']`, even with permission `accounts.perm_sys_settings`; `PublicConfigViewSet.list` (route `/api/public/config/`, line 29) returns `disabled_sections` for everyone and `toggle_sections` (list of `{code, title_fa}`) only for an authenticated superuser.
- `backend/core/settings_core/test_settings_validation.py`: read its first 60 lines for how users, permission `perm_sys_settings` and the POST to `/api/settings/global/` are set up; copy that.
- Registry patching: copy the pattern in `backend/core/attachments/tests/test_attachments_26b.py` lines 1–40 (`patch.dict(platform_core.registry._CONTRIBUTIONS, {...})`).

3. Task, `backend/core/settings_core/test_toggle_sections_26e.py`. Use `rest_framework.test.APITestCase`. In `setUp` call `cache.clear()` (from `django.core.cache`). Patch `_CONTRIBUTIONS` in every test with `{'toggle_sections': [('zz.alpha', 'Alpha'), ('zz.beta', 'Beta')]}`. Users: a superuser; user P (active, not superuser) with Django permission `accounts.perm_sys_settings` (re-fetch after adding). Post JSON with `format='json'`. Tests (names exactly):
  - `test_superuser_can_disable_declared_section`: superuser POST `{'disabled_sections': ['zz.alpha']}` → 200; then anonymous GET `/api/public/config/` → `disabled_sections == ['zz.alpha']`.
  - `test_undeclared_code_rejected`: superuser POST `{'disabled_sections': ['zz.nope']}` → 400 and `'disabled_sections' in invalid_keys`.
  - `test_wrong_shape_rejected`: superuser POST `{'disabled_sections': 'zz.alpha'}` → 400; `{'disabled_sections': ['zz.alpha', 'zz.alpha']}` → 400; `{'disabled_sections': [1]}` → 400.
  - `test_non_superuser_cannot_change`: user P POST `{'disabled_sections': ['zz.alpha']}` → 403; `SystemSetting.objects.filter(key='disabled_sections').exists()` is False.
  - `test_non_superuser_unchanged_value_allowed`: user P POST `{'disabled_sections': []}` (same as the default) → 200.
  - `test_public_config_toggle_sections_only_for_superuser`: anonymous GET → no `toggle_sections` key; user P GET → no key; superuser GET → `toggle_sections == [{'code': 'zz.alpha', 'title_fa': 'Alpha'}, {'code': 'zz.beta', 'title_fa': 'Beta'}]`.
  - `test_stale_code_dropped_from_public_config`: create `SystemSetting(key='disabled_sections', warehouse_id=None, value=['zz.alpha', 'zz.gone'])` directly, `clear_setting_cache()`, anonymous GET → `disabled_sections == ['zz.alpha']`.

4. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. In `backend` run `$env:PYTHONUTF8='1'; $env:DB_TEST_NAME='test_agy_toggle26e'; .\venv\Scripts\python.exe manage.py test settings_core.test_toggle_sections_26e --noinput`. At most 6 runs.

5. Before finishing: all 7 tests pass (only marked expected failures allowed, as in rule 1); `git status --short` shows no change to tracked files after your commit.

6. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any expected failure with the exact difference. End the turn after the report.

===

[DONE] [ ] Session 2 of 2 — Release v1 step 2.6-e: DOM specs for the attachments component, company settings tab and section switches

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow frontend/src/app/shared/components/attachments/attachments.dom.spec.ts frontend/src/app/modules/common/components/operations/companies/company-settings-tab/company-settings-tab.dom.spec.ts frontend/src/app/core/services/section-toggle.service.spec.ts
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/shared/components/attachments/attachments.dom.spec.ts --min-tests 6
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/common/components/operations/companies/company-settings-tab/company-settings-tab.dom.spec.ts --min-tests 5
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/core/services/section-toggle.service.spec.ts --min-tests 4
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/shared/components/attachments/attachments.dom.spec.ts --include src/app/modules/common/components/operations/companies/company-settings-tab/company-settings-tab.dom.spec.ts --include src/app/core/services/section-toggle.service.spec.ts --no-skip --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.6-e): attachments and company settings specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly three new files: `frontend/src/app/shared/components/attachments/attachments.dom.spec.ts`, `frontend/src/app/modules/common/components/operations/companies/company-settings-tab/company-settings-tab.dom.spec.ts`, `frontend/src/app/core/services/section-toggle.service.spec.ts`. Never edit production code, other specs, `Documents/`, `tasks.md` or `tasks_history.md`.
- No `it.skip`, `it.only`, `describe.skip`, no `fs` or `path` imports.
- If a test fails because production code behaves differently from this task, do not change production code: delete that one expectation, keep the rest, and describe the exact difference in your report.
- No push. Stage only your files. Commit message subject exactly: `test(release-v1 2.6-e): attachments and company settings specs`.

2. Context (read these, nothing broader):
- `frontend/src/app/modules/common/components/my-tasks/my-tasks.dom.spec.ts`: the spec style to copy (first line `// @vitest-environment jsdom`, `import '@angular/compiler'`, the `getTestBed().initTestEnvironment(...)` try block, `TestBed` with mocked providers, `vi.fn()`).
- `frontend/src/app/shared/components/attachments/attachments.component.ts` and `.html` (whole files): uses `ApiService` methods `get`, `upload`, `delete`, `download` (all return Observables), `ConfirmDialogService.open(...)` (returns a Promise of boolean), `ToastService.success` and `ToastService.error`.
- `frontend/src/app/modules/common/components/operations/companies/company-settings-tab/company-settings-tab.component.ts` and `.html` (whole files): uses `ApiService.get` and `ApiService.patch`.
- `frontend/src/app/core/services/section-toggle.service.ts` (whole file).

3. Task A, `attachments.dom.spec.ts`. Provide `{ provide: ApiService, useValue: api }` where `api = { get: vi.fn(), upload: vi.fn(), delete: vi.fn(), download: vi.fn() }` (return `of(...)` or `throwError(() => ({ error: { detail: 'boom' } }))` from rxjs), a fake `ConfirmDialogService` with `open: vi.fn().mockResolvedValue(true)` and a fake `ToastService` with `success: vi.fn(), error: vi.fn()`. Create the component, set inputs with `fixture.componentRef.setInput('kind', 'zz_doc')` and `setInput('entityId', 7)`, call `fixture.detectChanges()` and `await fixture.whenStable()` (then `detectChanges()` again). Tests (names exactly):
  - `loads list with kind and id`: `api.get` called with `'attachments'` and an object containing `kind: 'zz_doc', id: 7`; two returned items render both `original_name` texts in the DOM.
  - `shows empty state`: `api.get` returns `of([])` → the empty-state text from the template appears.
  - `shows error detail and retries`: `api.get` fails with detail `boom` → `boom` appears; clicking the retry button calls `api.get` again.
  - `hides edit buttons without canEdit`: with `canEdit` false there is no upload and no delete button (find them by their `aria-label` values in the template).
  - `delete asks confirm and reloads`: with `canEdit` true, clicking delete calls `confirm.open`, then `api.delete` with `'attachments/<id>'`, then `api.get` a second time.
  - `download uses api not a link`: there is no `a[href*="/api/attachments/"]` in the DOM; clicking download calls `api.download` with `'attachments/<id>/download/'` or the same path without the trailing slash (accept either).
  - `sends label on list request`: `setInput('label', 'signature')` → `api.get` params contain `label: 'signature'`.

4. Task B, `company-settings-tab.dom.spec.ts`. Fake `ApiService` with `get` and `patch`; fake `ToastService`. `setInput('companyId', 3)`. Response for `get`: `{ company_id: 3, results: [ {module:'zzmod', key:'flag', type:'bool', title_fa:'Flag', default:false, value:false, is_default:true, can_edit:true}, {module:'zzmod', key:'limit', type:'int', title_fa:'Limit', default:5, value:5, is_default:true, can_edit:false} ] }`. Tests (names exactly):
  - `loads settings of the company`: `api.get` called with `'settings/company/3'`; texts `Flag` and `Limit` appear.
  - `shows empty state`: results `[]` → the empty-state text from the template appears.
  - `read only row is disabled`: the input of `limit` is disabled.
  - `toggle sends patch`: call `component.onToggle(row, true)` for the `flag` row (from `component.groups[0].rows`) → `api.patch` called with `'settings/company/3'` and `{ module: 'zzmod', key: 'flag', value: true }`.
  - `shows server detail on error`: `api.patch` fails with `{ error: { detail: 'bad' } }` → after `onToggle` and `whenStable`, `bad` appears in the DOM and the row draft is back to false.

5. Task C, `section-toggle.service.spec.ts` (plain service test; `localStorage.clear()` and `TestBed.resetTestingModule()` in `beforeEach`, then `TestBed.inject(SectionToggleService)`). Tests (names exactly):
  - `item without key is enabled`: `isEnabled(undefined)` and `isEnabled('')` are true.
  - `applyConfig disables listed codes`: `applyConfig({ disabled_sections: ['a.x'] })` → `isEnabled('a.x')` false, `isEnabled('a.y')` true.
  - `config without key keeps previous list`: after the above, `applyConfig({})` keeps `a.x` disabled.
  - `stores list for offline boot`: after `applyConfig({ disabled_sections: ['a.x'] })`, `localStorage.getItem('wh_disabled_sections')` equals `'["a.x"]'`.
  - `declared keeps only valid items`: `applyConfig({ toggle_sections: [{code:'a.x', title_fa:'X'}, {code: 1}] })` → `declared()` has length 1.

6. Tool policy: read only the files listed in section 2, `CLAUDE.md` section "Frontend tests (ng test)" and `.agents/AGENTS.md`. Run only these specs: in `frontend` run `npx ng test --watch=false --include src/app/shared/components/attachments/attachments.dom.spec.ts --include src/app/modules/common/components/operations/companies/company-settings-tab/company-settings-tab.dom.spec.ts --include src/app/core/services/section-toggle.service.spec.ts`. If the build fails to compile because of other spec files, use the temporary tsconfig workaround from that `CLAUDE.md` section (temporary tsconfig under `scratch/` only, never committed). At most 8 runs.

7. Before finishing: all tests pass; `git status --short` shows no change to tracked files after your commit.

8. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any removed expectation with the exact difference. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 2.7-b: server tests for the single-sheet document PDF, print API and public verify API

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow backend/core/reports/test_document_pdf_27b.py
verify: set DB_TEST_NAME=test_agy_r27b&& python scripts/automation/verify_tools.py django-tests --labels reports.test_document_pdf_27b --min-tests 10
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.7-b): document pdf and verify"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly one new file: `backend/core/reports/test_document_pdf_27b.py`. Never edit production code, migrations, other tests, `Documents/`, `tasks.md` or `tasks_history.md`.
- Core test files must not import accounting or warehouse modules (no `personnel`, `warehouses`, `inventory` imports) and must not contain the words `invoice` or `warehouse`. Use only `accounts`, `attachments`, `companies`, `reports`, `platform_core` and Django.
- Do not install packages. `pypdf` is not installed; do not use it.
- If a test fails because production code behaves differently from this task, do not change production code: keep the expectation, mark that one test with `@unittest.expectedFailure` and describe the exact difference in your report.
- Never delete rows from the real database; tests run only on the Django test database.
- No push. Stage only your file. Commit message subject exactly: `test(release-v1 2.7-b): document pdf and verify`.

2. Context (read these, nothing broader):
- `backend/core/reports/document_pdf.py` (whole file): dataclasses `PrintableDocument` and `Signer`, `render_document_pdf(doc) -> bytes`, `signer_images(signer)`, `verify_token(kind, entity_id, number, *, company_id=None, title='', date='', confidential=False)`, `read_verify_token(token)`, `fa_digits`, module-level names `Image` (reportlab flowable) and `_rtl_lines`.
- `backend/core/reports/document_views.py` (whole file): `PrintPdfView` (route `GET /api/print/<kind>/<entity_id>/pdf/?size=A4|A5`) and `PublicVerifyView` (route `GET /api/public/verify/<token>/`, no login).
- `backend/core/platform_core/registry.py`: functions `printable_document`, `can_view`, `is_entity_confidential` (Grep `def printable_document`, read 15 lines from there; Grep `def entity_view_decision`, read 25 lines).
- Registry patching: copy the pattern in `backend/core/attachments/tests/test_view_log_26d.py` lines 1–40 and 80–100 (`patch.dict(platform_core.registry._CONTRIBUTIONS, {...})`, user creation, `EntityViewLog`).
- `backend/core/attachments/models.py` lines 1–45 (`Attachment` fields: `entity_kind`, `entity_id`, `label`, `file`, `status`, `archived_at`).

3. Task, `backend/core/reports/test_document_pdf_27b.py`. Use `rest_framework.test.APITestCase` (and `django.test.TestCase` where no HTTP is needed). Kind used everywhere: `zz_doc`. Helper `make_doc(**kw)` returns `PrintableDocument(company_id=None, title='Test title', number='1404-17', attachments_count=1, paragraphs=['Body text'], **kw)`. Users: superuser S, normal active user U (no permissions), both with `force_authenticate`. Hooks dict for allowed cases: `{'can_view:zz_doc': [lambda user, eid: True], 'printable:zz_doc': [lambda user, eid: make_doc()]}`. Tests (names exactly):
  - `test_pdf_a4_and_a5_bytes`: call `render_document_pdf(make_doc(size='A4'))` and `make_doc(size='A5')`; both start with `b'%PDF'`; the A4 bytes contain `b'/MediaBox [ 0 0 595.2756 841.8898 ]'` and the A5 bytes contain `b'/MediaBox [ 0 0 419.5276 595.2756 ]'` (if the exact spacing differs, instead assert with a regex `rb'/MediaBox \[\s*0 0 595'` and `rb'/MediaBox \[\s*0 0 419'`).
  - `test_persian_text_reshaped`: patch `reports.document_pdf._rtl_lines` with `wraps=` the real function, render a doc whose title is `'سلام دنیا'`; assert the mock was called with that exact title as first argument; separately call the real `_rtl_lines(that_title, 'Helvetica', 12, 500)` and assert the single returned line is not equal to the input (it was reshaped and reordered).
  - `test_print_requires_can_view`: with hooks `{'can_view:zz_doc': [lambda user, eid: False], 'printable:zz_doc': [lambda user, eid: make_doc()]}`, U GETs `/api/print/zz_doc/5/pdf/` → 404. With no `can_view:zz_doc` hook at all (only the printable hook), U → 404.
  - `test_unknown_kind_404`: S GETs `/api/print/zz_unknown/5/pdf/` with empty patched `_CONTRIBUTIONS` (`patch.dict(..., {}, clear=False)` is fine; the kind has no hooks) → 404.
  - `test_hook_error_or_none_404`: hooks with `can_view` True and `printable:zz_doc` raising `RuntimeError` → U gets 404; `printable:zz_doc` returning `None` → 404.
  - `test_print_ok_no_store_and_view_log`: allowed hooks, U GETs `/api/print/zz_doc/5/pdf/?size=A5` → 200, `response['Content-Type'] == 'application/pdf'`, `response['Cache-Control'] == 'no-store'`, body (`b''.join(response.streaming_content)` if streaming else `response.content`) starts with `b'%PDF'`, and `EntityViewLog.objects.filter(user=U, entity_kind='zz_doc', entity_id='5').count() == 1`.
  - `test_unsigned_signer_image_not_drawn`: create an `Attachment(entity_kind='user', entity_id=str(U.pk), label='signature', status='accepted')` whose `file` is a `SimpleUploadedFile('s.png', <bytes of a 10x10 PNG made with PIL.Image.new('RGB', (10, 10)) saved to BytesIO>, content_type='image/png')`. Assert `signer_images(Signer('A', 'R', U.pk, False)) == []` and `len(signer_images(Signer('A', 'R', U.pk, True))) == 1`. Then patch `reports.document_pdf.Image` with `wraps=` the real class, render `make_doc(signers=[Signer('A', 'R', U.pk, False)])` → mock call count 0; render `make_doc(signers=[Signer('A', 'R', U.pk, True)])` → call count 1. Use `override_settings(MEDIA_ROOT=<a tempfile.mkdtemp() directory>)` for this test and remove the directory in `addCleanup` with `shutil.rmtree(..., ignore_errors=True)`.
  - `test_archived_signature_not_used`: same as above but set `archived_at=timezone.now()` → `signer_images(Signer('A', 'R', U.pk, True)) == []`.
  - `test_verify_valid_and_tampered`: `t = verify_token('zz_doc', 5, '1404-17', title='Test title', date='1404/08/04')`; anonymous client GET `/api/public/verify/<t>/` → 200, `valid` True, `number == '1404-17'`, `title == 'Test title'`, `date == '1404/08/04'`, and the response has no key `amount`. Change the last character of `t` to a different character → 200 and JSON exactly `{'valid': False}`. GET `/api/public/verify/garbage/` → `{'valid': False}`.
  - `test_verify_confidential_hides_title`: with hooks `{'is_confidential:zz_doc': [lambda eid: True]}` and the token from the previous test → JSON exactly `{'valid': True, 'number': '1404-17'}`. Also `read_verify_token(verify_token('zz_doc', 5, '9', title='Secret', confidential=True))` has no key `t`.
  - `test_print_token_in_pdf_is_verifiable`: allowed hooks; patch `reports.document_views.render_document_pdf` with a `MagicMock(return_value=b'%PDF-1.4 x')`; U GETs the print URL → 200; take the `PrintableDocument` passed to the mock, assert its `verify_url` contains `/verify/`, extract the token after `/verify/`, and assert `read_verify_token(token)['n'] == '1404-17'`.

4. Tool policy: read only the files listed in section 2 and `.agents/AGENTS.md`. In `backend` run `$env:PYTHONUTF8='1'; $env:DB_TEST_NAME='test_agy_r27b'; .\venv\Scripts\python.exe manage.py test reports.test_document_pdf_27b --noinput`. Always pass the label; never run `manage.py test` without a label. At most 6 runs.

5. Before finishing: all 11 tests pass (only marked expected failures allowed, as in rule 1); `git status --short` shows no change to tracked files after your commit.

6. Output and stop condition: commit, then a short English report: tests added, pass/fail counts, any expected failure with the exact difference. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 2.7-c: DOM specs for PrintService, document verify page, person-role picker and amount input

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow frontend/src/app/core/services/print.service.spec.ts frontend/src/app/modules/common/components/document-verify/document-verify.dom.spec.ts frontend/src/app/shared/components/person-role-picker/person-role-picker.dom.spec.ts frontend/src/app/shared/components/amount-input/amount-input.dom.spec.ts
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/core/services/print.service.spec.ts --min-tests 4
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/common/components/document-verify/document-verify.dom.spec.ts --min-tests 4
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/shared/components/person-role-picker/person-role-picker.dom.spec.ts --min-tests 6
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/shared/components/amount-input/amount-input.dom.spec.ts --min-tests 4
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/core/services/print.service.spec.ts --include src/app/modules/common/components/document-verify/document-verify.dom.spec.ts --include src/app/shared/components/person-role-picker/person-role-picker.dom.spec.ts --include src/app/shared/components/amount-input/amount-input.dom.spec.ts --no-skip --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.7-c): print, verify, picker and amount specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Create exactly four new files: `frontend/src/app/core/services/print.service.spec.ts`, `frontend/src/app/modules/common/components/document-verify/document-verify.dom.spec.ts`, `frontend/src/app/shared/components/person-role-picker/person-role-picker.dom.spec.ts`, `frontend/src/app/shared/components/amount-input/amount-input.dom.spec.ts`. Never edit production code, other specs, `Documents/`, `tasks.md` or `tasks_history.md`.
- No `it.skip`, `it.only`, `describe.skip`, no `fs` or `path` imports.
- Persian strings in expectations: copy them exactly from the production source file named in each task (do not retype them).
- If a test fails because production code behaves differently from this task, do not change production code: delete that one expectation, keep the rest, and describe the exact difference in your report.
- No push. Stage only your files. Commit message subject exactly: `test(release-v1 2.7-c): print, verify, picker and amount specs`.

2. Context (read these, nothing broader):
- `frontend/src/app/modules/common/components/my-tasks/my-tasks.dom.spec.ts`: the spec style to copy (first line `// @vitest-environment jsdom`, `import '@angular/compiler'`, the `getTestBed().initTestEnvironment(...)` try block, `TestBed` with mocked providers, `vi.fn()`).
- `frontend/src/app/core/services/print.service.ts` (whole file).
- `frontend/src/app/modules/common/components/document-verify/document-verify.ts` and `.html` (whole files).
- `frontend/src/app/shared/components/person-role-picker/person-role-picker.component.ts` (whole file, inline template).
- `frontend/src/app/shared/components/amount-input/amount-input.component.ts` (whole file, inline template).
- `frontend/src/app/core/services/network-status.service.ts` lines 55–95 (singleton `NetworkStatusService.getInstance()`, getters `state` and `isBrowserOnline`, observable `state$`).
- HTTP: these files use `HttpClient` directly. In specs use `provideHttpClient()` and `provideHttpClientTesting()` and `HttpTestingController` (`expectOne` with a function matcher on `req.url`, `flush`, `verify`). `environment.apiUrl` is `/api`.
- Offline: use `vi.spyOn(NetworkStatusService.getInstance(), 'isBrowserOnline', 'get').mockReturnValue(false)` (and the same for `state` returning `'offline'` when needed); call `vi.restoreAllMocks()` in `afterEach`.

3. Task A, `print.service.spec.ts`. Provide fake `FileOutputService` (`{ saveBlob: vi.fn().mockResolvedValue(undefined) }`) and fake `ToastService` (`{ error: vi.fn(), success: vi.fn() }`). Tests (names exactly):
  - `downloads pdf and saves blob`: `downloadPdf('zz_doc', 7, 'A5')`; the request URL is `/api/print/zz_doc/7/pdf/` with `size=A5` (check `req.urlWithParams` or `req.url` contains `size=A5`) and `responseType` `blob`; flush a `new Blob(['%PDF'])`; result `true`; `saveBlob` called with a Blob and `'zz_doc-7.pdf'`.
  - `404 shows not available toast`: flush with `{ status: 404, statusText: 'Not Found' }` (body `new Blob([''])`); result `false`; `toast.error` called with the not-available text from `print.service.ts`; `saveBlob` not called.
  - `server unreachable shows offline toast`: flush with status 530; `toast.error` called with the offline text from `print.service.ts`.
  - `offline does not send request`: with `isBrowserOnline` mocked false, result `false`, `httpMock.expectNone(() => true)`, `toast.error` called once.
  - `other error shows generic toast`: status 500 → the generic failure text.

4. Task B, `document-verify.dom.spec.ts`. Provide `{ provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ token: 'abc:def' })), snapshot: { paramMap: convertToParamMap({ token: 'abc:def' }) } } }` and the HTTP testing providers. Tests (names exactly):
  - `requests public verify with encoded token`: one request whose URL is `/api/public/verify/abc%3Adef/`.
  - `renders full valid result`: flush `{ valid: true, number: '1404-17', title: 'T1', date: '1404/08/04', company_name: 'C1' }` → DOM text contains `1404-17`, `T1`, `1404/08/04` and `C1` (also accept the same number written with Persian digits only if the template converts; read the template).
  - `confidential shows only number`: flush `{ valid: true, number: '9' }` → number shown; no `T1`/`C1`; the valid message from the template appears.
  - `invalid token message`: flush `{ valid: false }` → the invalid text from `document-verify.html` appears.
  - `error shows retry and retries`: flush with status 530 → the unreachable text from `document-verify.ts` appears; clicking the retry button sends a second request.
  - `never renders an amount`: after flushing `{ valid: true, number: '1', title: 'T', date: 'D', company_name: 'C', amount: '999999' }` the DOM text does not contain `999999`.

5. Task C, `person-role-picker.dom.spec.ts`. Use fake timers (`vi.useFakeTimers()`, `vi.advanceTimersByTime(300)`) for the 300 ms debounce; restore real timers in `afterEach`. Users endpoint `/api/auth/users/` with param `search`; roles endpoint `/api/auth/roles/`. Users response `{ results: [ { id: 1, first_name: 'Ali', last_name: 'A', username: 'ali' }, { id: 2, first_name: '', last_name: '', username: 'bob' } ] }`; roles response `[ { id: 10, title: 'Manager' } ]`. Tests (names exactly):
  - `search is debounced`: type `al` into the input (set value and dispatch `input`); before 300 ms there is no request; after 300 ms one users request with `search=al`.
  - `enter adds active option as chip`: after flushing both responses, press ArrowDown/Enter (dispatch `keydown` on the input) → a chip with `Ali A` appears and the registered `onChange` mock is called with an array containing `{ type: 'user', id: 1, label: 'Ali A' }`.
  - `username fallback label`: option for id 2 shows `bob`.
  - `backspace on empty input removes last chip`: after `writeValue([{ type: 'role', id: 10, label: 'Manager' }])` and an empty input, `keydown` Backspace → chip gone and `onChange` called with `[]`.
  - `max is respected`: `setInput('max', 1)`, `writeValue` one item → input or adding is blocked (calling `add(...)` on the component does not change the value length).
  - `allowRoles false hides roles`: `setInput('allowRoles', false)`; after search there is no request to `/api/auth/roles/` and no `Manager` option.
  - `remove button has aria label`: the chip remove button has an `aria-label` containing the chip label.
  - `error state shown`: users request flushed with status 500 → the failure text from the component appears.

6. Task D, `amount-input.dom.spec.ts`. Tests (names exactly):
  - `persian digits become plain rial string`: set input value to Persian digits for 1250000 (build the string with `'1250000'.replace(/\d/g, d => String.fromCharCode(0x06F0 + Number(d)))`) and dispatch `input` → `onChange` called with `'1250000'` and the input value is `1,250,000`.
  - `arabic digits accepted`: same with base `0x0660` → `'1250000'`.
  - `empty gives null`: value `''` → `onChange` called with `null`; no toman text.
  - `toman text shown`: `writeValue(1250000)` → the input shows `1,250,000` and the DOM contains the toman word from the template and the Persian-digit form of 125,000 (use `new Intl.NumberFormat('fa-IR').format(125000)`).
  - `leading zeros stripped`: value `00012` → `onChange` called with `'12'`.
  - `disabled state`: `setDisabledState(true)` → the input is disabled.

7. Verification you run before committing: from `frontend/`, `npx ng test --watch=false --include src/app/core/services/print.service.spec.ts --include src/app/modules/common/components/document-verify/document-verify.dom.spec.ts --include src/app/shared/components/person-role-picker/person-role-picker.dom.spec.ts --include src/app/shared/components/amount-input/amount-input.dom.spec.ts` must pass. If the full-suite compile fails because of the 18 known broken specs, use `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --include ...` from the repo root instead.

8. Output: commit, then report in English: the test names per file, results, and any deleted expectation with the exact difference.

===

[DONE] [ ] Session 1 of 3 — Release v1 step 2.7-d: remove browser confirm() fallbacks in company studio and companies

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow frontend/src/app/modules/accounting/components/companies-studio/** frontend/src/app/modules/common/components/operations/companies/companies.ts frontend/src/app/modules/common/components/operations/companies/companies.dom.spec.ts
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/companies-studio/company-treasury-tab/company-treasury-tab.ts --absent window.confirm
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/companies-studio/company-governance-tab/company-governance-tab.ts --absent window.confirm
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/companies-studio/company-archive-section/company-archive-section.ts --absent window.confirm
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/companies-studio/company-fiscal-periods-section/company-fiscal-periods-section.ts --absent window.confirm
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/operations/companies/companies.ts --absent window.confirm
verify: cmd /c "cd frontend && npx tsc -p tsconfig.app.json --noEmit"
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file frontend/src/app/modules/common/components/operations/companies/companies.dom.spec.ts
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/modules/accounting/components/companies-studio/company-treasury-tab/company-treasury-tab.dom.spec.ts --include src/app/modules/accounting/components/companies-studio/company-governance-tab/company-governance-tab.dom.spec.ts --include src/app/modules/accounting/components/companies-studio/company-archive-section/company-archive-section.dom.spec.ts --include src/app/modules/accounting/components/companies-studio/company-fiscal-periods-section/company-fiscal-periods-section.dom.spec.ts --include src/app/modules/accounting/components/companies-studio/company-finance-tabs.dom.spec.ts --include src/app/modules/common/components/operations/companies/companies.dom.spec.ts
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(release-v1 2.7-d): drop window.confirm fallbacks in company studio"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Mechanical change only. Edit only the files named below (and their existing specs only when a spec breaks, see rule 5). No other refactors, no formatting changes, no new files. Never edit `Documents/`, `tasks.md` or `tasks_history.md`.
- Keep every Persian message text exactly as it is.
- If an existing spec spied on `window.confirm` for a changed path, change that spec to mock `ConfirmDialogService.open` (`vi.fn().mockResolvedValue(true)` or `false`) instead. Never delete or skip a test.
- No push. Stage only your files. Commit message subject exactly: `refactor(release-v1 2.7-d): drop window.confirm fallbacks in company studio`.

2. Context: `ConfirmDialogService` (`frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.ts` lines 12–73) is `providedIn: 'root'` and always available; `open(config)` returns `Promise<boolean | string>` and `true` means confirmed. In these files it is injected as optional (`inject(ConfirmDialogService, { optional: true })`), so each helper has a dead `window.confirm` fallback branch.

3. Task. In each place below replace the `window.confirm(...)` fallback with `false` (the dialog branch above it stays unchanged):
- `frontend/src/app/modules/accounting/components/companies-studio/company-treasury-tab/company-treasury-tab.ts` line 190 (`return window.confirm(message);` → `return false;`) and line 392 (`: window.confirm('...');` → `: false;`).
- `frontend/src/app/modules/accounting/components/companies-studio/company-governance-tab/company-governance-tab.ts` line 160 (`return window.confirm(message);` → `return false;`).
- `frontend/src/app/modules/accounting/components/companies-studio/company-archive-section/company-archive-section.ts` line 192 (same).
- `frontend/src/app/modules/accounting/components/companies-studio/company-fiscal-periods-section/company-fiscal-periods-section.ts` line 140 (`return window.confirm(config.message);` → `return false;`).
- `frontend/src/app/modules/common/components/operations/companies/companies.ts` lines 305 and 428 (`return window.confirm(...)` → `return false;`) and line 2038 (`: window.confirm('...');` → `: false;`).

4. Verification before committing (repo root): `cmd /c "cd frontend && npx tsc -p tsconfig.app.json --noEmit"` must exit 0, then the `ng-test-compare` line from the runner block above must pass.

5. Output: commit, then report in English: each file and line changed, any spec you changed and why, test results.

===

[DONE] [ ] Session 2 of 3 — Release v1 step 2.7-d: replace browser confirm() in employee personnel, vehicle, invoices and petty cash

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow frontend/src/app/modules/accounting/components/finance/employee/employee-new-personnel/** frontend/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/** frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/** frontend/src/app/modules/accounting/components/finance/employee/employee-petty-cash/**
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-new-personnel/employee-new-personnel.ts --regex-absent "[^.\w]confirm\("
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle.ts --regex-absent "[^.\w]confirm\("
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices.ts --regex-absent "[^.\w]confirm\("
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-petty-cash/employee-petty-cash.ts --regex-absent "[^.\w]confirm\("
verify: cmd /c "cd frontend && npx tsc -p tsconfig.app.json --noEmit"
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file frontend/src/app/modules/accounting/components/finance/employee/employee-new-personnel/employee-new-personnel.spec.ts frontend/src/app/modules/accounting/components/finance/employee/employee-new-personnel/employee-new-personnel-phase7.spec.ts frontend/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle.spec.ts frontend/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle-phase7.spec.ts frontend/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-vehicle-all-scenarios.spec.ts frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices.spec.ts frontend/src/app/modules/accounting/components/finance/employee/employee-petty-cash/employee-petty-cash.spec.ts
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/modules/accounting/components/finance/employee/employee-new-personnel/employee-new-personnel.spec.ts --include src/app/modules/accounting/components/finance/employee/employee-new-personnel/employee-new-personnel-phase7.spec.ts --include src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle.spec.ts --include src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle-phase7.spec.ts --include src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-vehicle-all-scenarios.spec.ts --include src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle.dom.spec.ts --include src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices.spec.ts --include src/app/modules/accounting/components/finance/employee/employee-petty-cash/employee-petty-cash.spec.ts
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(release-v1 2.7-d): confirm dialog in employee forms"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Mechanical change only. Edit only the four component files below (and their existing specs only when a spec breaks, see the next rule). No other refactors, no formatting changes, no new files. Never edit `Documents/`, `tasks.md` or `tasks_history.md`.
- If an existing spec spied on `window.confirm` (or global `confirm`) for a changed method, change that spec to mock `ConfirmDialogService.open` (`vi.fn().mockResolvedValue(true)` or `false`) and `await` the now-async method. Never delete or skip a test.
- Keep every Persian message text exactly as it is (copy it, do not retype it).
- No push. Stage only your files. Commit message subject exactly: `refactor(release-v1 2.7-d): confirm dialog in employee forms`.

2. Context: `ConfirmDialogService` in `frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.ts` lines 12–73. `open({ title, message, type, confirmText })` returns `Promise<boolean | string>`; only `=== true` means confirmed. It is `providedIn: 'root'`.

3. Replacement pattern for every call. If the component does not already have it, add `private readonly confirmDialog = inject(ConfirmDialogService);` (import `inject` from `@angular/core` and `ConfirmDialogService` from the shared confirm-dialog component with a relative path like the other shared imports in that file). If the field name `confirmDialog` already exists with the same service, reuse it. Then
`if (!confirm(MSG)) { ... }` becomes
`if ((await this.confirmDialog.open({ title: TITLE, message: MSG, type: TYPE })) !== true) { ... }`
and the containing method gets `async` (return type `void` becomes `Promise<void>`; if the method returned a value, wrap it in `Promise<...>`). Callers in templates need no change. MSG is the exact original expression (template literals stay template literals).
- Delete-type messages (the text contains `حذف`): TITLE `'حذف'`, TYPE `'danger'`, add `confirmText: 'حذف'`.
- Revoke-type messages (the text contains `ابطال`): TITLE `'ابطال درخواست'`, TYPE `'danger'`.
- Send messages (the text contains `ارسال`): TITLE `'ارسال برای سرپرست'`, TYPE `'info'`.
- Draft replace message: TITLE `'جایگزینی با پیش‌نویس'`, TYPE `'warning'`.

4. Calls (line numbers as of the base commit):
- `frontend/src/app/modules/accounting/components/finance/employee/employee-new-personnel/employee-new-personnel.ts` lines 726, 1066 (keep the `hasTypedData &&` condition: `if (hasTypedData && (await this.confirmDialog.open({...})) !== true) return;`), 1088, 1991, 2636.
- `frontend/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle.ts` lines 1712, 2185, 2486.
- `frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices.ts` lines 630, 656.
- `frontend/src/app/modules/accounting/components/finance/employee/employee-petty-cash/employee-petty-cash.ts` lines 485, 511.
If a call sits inside a non-async callback (for example inside `subscribe({ next: ... })`), make that arrow function `async`.

5. Verification before committing (repo root): `cmd /c "cd frontend && npx tsc -p tsconfig.app.json --noEmit"` must exit 0, then the `ng-test-compare` line from the runner block above must pass.

6. Output: commit, then report in English: each file and line changed, any spec you changed and why, test results.

===

[DONE] [ ] Session 3 of 3 — Release v1 step 2.7-d: replace browser confirm()/alert() in diskettes, base settings, backup tab and avatar cropper

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow frontend/src/app/modules/accounting/components/finance/accountant/accountant-diskettes/** frontend/src/app/modules/accounting/components/personnel/base-settings/** frontend/src/app/modules/common/components/settings/tabs/settings-backup-tab/** frontend/src/app/shared/components/avatar-cropper-modal/**
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-diskettes/accountant-diskettes.ts --regex-absent "[^.\w]confirm\("
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/personnel/base-settings/base-settings.ts --regex-absent "[^.\w]confirm\("
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts --regex-absent "[^.\w]confirm\("
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/components/avatar-cropper-modal/avatar-cropper-modal.ts --regex-absent "[^.\w]alert\("
verify: cmd /c "cd frontend && npx tsc -p tsconfig.app.json --noEmit"
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-diskettes/accountant-diskettes.spec.ts frontend/src/app/modules/accounting/components/personnel/base-settings/base-settings.spec.ts frontend/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.spec.ts
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/modules/accounting/components/finance/accountant/accountant-diskettes/accountant-diskettes.spec.ts --include src/app/modules/accounting/components/personnel/base-settings/base-settings.spec.ts --include src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.spec.ts
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "refactor(release-v1 2.7-d): confirm dialog and toast in settings, diskettes, cropper"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Mechanical change only. Edit only the four component files below (and their existing specs only when a spec breaks, see the next rule). No other refactors, no formatting changes, no new files. Never edit `Documents/`, `tasks.md` or `tasks_history.md`.
- If an existing spec spied on `window.confirm` (or global `confirm`) for a changed method, change that spec to mock `ConfirmDialogService.open` (`vi.fn().mockResolvedValue(true)` or `false`) and `await` the now-async method (or flush promises with `await Promise.resolve()` for callbacks). Never delete or skip a test.
- Keep every Persian message text exactly as it is (copy it, do not retype it).
- No push. Stage only your files. Commit message subject exactly: `refactor(release-v1 2.7-d): confirm dialog and toast in settings, diskettes, cropper`.

2. Context: `ConfirmDialogService` in `frontend/src/app/shared/components/confirm-dialog/confirm-dialog.component.ts` lines 12–73: `open({ title, message, type, confirmText })` returns `Promise<boolean | string>`; only `=== true` means confirmed; `providedIn: 'root'`. `ToastService` in `frontend/src/app/shared/components/toast/toast.component.ts` has `error(message)`.

3. Replacement pattern. If the component does not already have it, add `private readonly confirmDialog = inject(ConfirmDialogService);` (import `inject` from `@angular/core`, the service from the shared confirm-dialog component with a relative path like other shared imports in that file). Reuse an existing field for the same service if there is one. `confirm(MSG)` becomes `(await this.confirmDialog.open({ title: TITLE, message: MSG, type: TYPE })) === true`, and the containing function becomes `async`. MSG is the exact original expression.

4. Calls (line numbers as of the base commit):
- `frontend/src/app/modules/accounting/components/finance/accountant/accountant-diskettes/accountant-diskettes.ts` line 242 (inside `subscribe({ next: (res) => ... })`: make that arrow `async`; TITLE `'پرسنل منقضی'`, TYPE `'warning'`, `confirmText: 'ادامه'`) and line 254 (inside `error: () => ...`: make it `async`; same TITLE, TYPE and confirmText). Keep the rest of each callback (toast, `onConfirmed()`, `this.cdr.detectChanges()`) in the same order after the await.
- `frontend/src/app/modules/accounting/components/personnel/base-settings/base-settings.ts` line 340: TITLE `'حذف تنظیمات اختصاصی'`, TYPE `'danger'`, `confirmText: 'حذف'`.
- `frontend/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts` line 581 (`} else if (!confirm(...)) {` becomes `} else if ((await this.confirmDialog.open({...})) !== true) {`): TITLE `'قطع اتصال درایو'`, TYPE `'danger'`, `confirmText: 'قطع اتصال'`.
- `frontend/src/app/shared/components/avatar-cropper-modal/avatar-cropper-modal.ts` line 100: `alert(MSG)` becomes `this.toast.error(MSG)` with `private readonly toast = inject(ToastService);` (reuse an existing ToastService field if present). The method stays sync.

5. Verification before committing (repo root): `cmd /c "cd frontend && npx tsc -p tsconfig.app.json --noEmit"` must exit 0, then the `ng-test-compare` line from the runner block above must pass.

6. Output: commit, then report in English: each file and line changed, any spec you changed and why, test results.

===

[DONE] Session 1 of 1 — Release v1 step 2.3-f-c: My-tasks DOM specs for referral cards

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/common/components/my-tasks/my-tasks.dom.spec.ts"
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file frontend/src/app/modules/common/components/my-tasks/my-tasks.dom.spec.ts
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/my-tasks/my-tasks.dom.spec.ts --contains markRead --contains referralKindLabel --contains isOverdue --contains replyText --contains due_at_shamsi
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/modules/common/components/my-tasks/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 2.3-f-c): my-tasks referral card specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 7 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Change exactly one file: `frontend/src/app/modules/common/components/my-tasks/my-tasks.dom.spec.ts`. Never edit production code, any other spec, anything under `scripts/` or `Documents/`, `tasks.md` or `tasks_history.md`.
- Keep every existing `it(` block unchanged and passing. Add new `it(` blocks only.
- If a new test fails because production code behaves differently from this task, do not change production code and do not weaken the expectation silently: keep the test, mark it with `it.fails(`, and describe the difference in your report.
- Test names and comments stay in the style of the file (Persian strings for UI text checks).
- No push. Stage only that file.

2. Context (read only these):
- `frontend/src/app/modules/common/components/my-tasks/my-tasks.dom.spec.ts` (whole file, fixture and fakes).
- `frontend/src/app/modules/common/components/my-tasks/my-tasks.ts` methods `isReferral`, `isUnread`, `referralKindLabel`, `isOverdue`, `onCardOpened`, `getActionLabel` (or the method that returns action labels), `onActionClick`, `executeAct`, field `replyText`.
- `frontend/src/app/modules/common/components/my-tasks/my-tasks.html`: the referral block (search `isReferral(card)`), the reply textarea (`'reply-' + card.task_id`), and the action buttons.
- `frontend/src/app/core/models/workflow.model.ts` interface `WorkflowTaskCard` (new optional fields `track`, `kind`, `instruction`, `due_at`, `due_at_shamsi`, `referred_by`, `parent_task_id`, `read_at`).
- `frontend/src/app/core/services/workflow-tasks.service.ts` method `markRead(task)` (the component calls it through the service; in the spec the service is a fake, so add a `markRead: vi.fn()` to the fake if it is missing).

3. Definitions:
- "Referral card" = a `WorkflowTaskCard` with `track: 'referral'`, `step_kind` and `kind` equal to `'refer'` (actions `['done']`) or `'inform'` (actions `['seen']`), `referred_by: { id: 9, name: 'مدیر دفتر' }`, `instruction: 'لطفاً بررسی شود'`, `due_at` an ISO string, `due_at_shamsi: '1405/08/10 10:00'`, `read_at: null` unless the test says otherwise.

4. Task — add these `it(` blocks inside the existing `describe`:
- a) refer card: `isReferral` is true, `referralKindLabel` returns «ارجاع»; inform card returns «برای اطلاع»; a step card (existing sample) has `isReferral` false and `isUnread` false.
- b) `isUnread` is true when `read_at` is null and false when `read_at` is set.
- c) `isOverdue` is true for a `due_at` one hour in the past, false for one day in the future and false when `due_at` is null.
- d) `onCardOpened` on an unread referral card calls the fake service `markRead` once with that card; on a read referral card or a step card it does not call it.
- e) `onActionClick(card, 'seen')` on an inform card calls the service `act` with `(card, 'seen', undefined)` (or the exact arguments `executeAct` passes; read the code) and does NOT open the reason dialog (`reasonDialogOpen` stays false).
- f) `onActionClick(card, 'done')` on a refer card with `component.replyText[card.task_id] = 'انجام شد'` calls the service `act` with the card, `'done'` and `'انجام شد'`; after the fake `act` resolves `{ status: 'done' }`, `replyText[card.task_id]` is undefined.
- g) The label method returns «انجام شد» for `'done'` and «رؤیت شد» for `'seen'`.
- h) If the file already renders the template in jsdom for other tests, also add one render test: with one unread refer card in the tasks signal, the rendered text contains «ارجاع», «از طرف: مدیر دفتر», «لطفاً بررسی شود», «مهلت: 1405/08/10 10:00» and «(نخوانده)». If the file does not render the template, skip h and say so in the report.

5. Verification before committing (repo root): `cmd /c "cd frontend && npx tsc -p tsconfig.app.json --noEmit"` must exit 0, then the `ng-test-compare` line from the runner block above must pass. Commit message: `test(release-v1 2.3-f-c): my-tasks referral card specs`.

6. Output: commit, then report in English: tests added (names), any `it.fails` and why, test results.


===

[DONE] [ ] Session 1 of 2 — Release v1 stage 2 close-out on the local app environment: backup, apply the stage-2 migrations, patched frontend build; the runner restarts Daphne and the GDrive worker and runs the health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: backend\venv\Scripts\python.exe -X utf8 backend\manage.py migrate --check
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
- Do not run `run_auto_backup`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `backend/backups/` or `frontend/dist/`.

2. Context: Release v1 stage 2 (steps 2.1 to 2.9 and 2.3-f) changed backend and frontend code. These migrations may still be unapplied on the app database: `attachments 0001_initial`, `attachments 0002_entityviewlog`, `settings_core 0002_company_drive_moved_from_personnel`, `settings_core 0003_companysetting`, `personnel 0006_move_drive_to_settings_core`, `numbering 0001_initial`, `workflow 0003_referral` (possibly others of stage 2 too). The app database holds test data only. Your terminal may be PowerShell; if so, set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order:
- a) Backup. In `backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app stage 2 close-out'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0. Do not continue without a successful backup.
- b) Migration list. `.\venv\Scripts\python.exe manage.py showmigrations --plan` and note every `[ ]` line.
- c) Migrate. `.\venv\Scripts\python.exe manage.py migrate --noinput`. If it fails, stop and report the last 40 lines of the error; do not try to fix it, and never fake or skip migrations.
- d) Check. `.\venv\Scripts\python.exe manage.py migrate --check` exits 0, and `.\venv\Scripts\python.exe manage.py check` prints no errors.
- e) Frontend build. In `frontend`, run `npx ng build --delete-output-path=false` in the foreground and wait for it to finish, then run `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.

4. Tool policy: only the commands above and `git status --short`. Run the build at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the backup filename and size, the `[ ]` migrations found in step b, the migrate result, the build result (errors and warnings count) and the patch script line. Write the report only after the build and the patch have finished. No commit. End the turn after the report.

===

[DONE] [ ] Session 2 of 2 — Release v1 stage 2: check pages behind the login on https://app.farsalish.ir in a real browser (company numbering tab, settings leave guard, my-tasks) with a temporary QA account that is deleted at the end

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session only checks pages. Do not edit, create, stage or commit any repository file. Do not restart any service.
- Only `https://app.farsalish.ir` (or `http://localhost:4200`, the same build) is in scope. Never open or touch `soft.farsalish.ir`.
- In the app, do not save, submit, delete or change any record: you only open pages, type into one field to test the leave guard, and cancel. Never press a save button.
- If you have no browser tool, write `NO_BROWSER` as the first line of your report, still run step 3-f (the account was never created, so it prints a count of 0, which is fine in that case) and stop.

2. Context: stage 2 added an unsaved-changes leave guard on the warehouse settings page (an in-app confirm dialog, never the browser `confirm()`), a company studio tab «شماره‌گذاری اسناد» (route `/app/operations/companies/<id>`, short label «شماره‌ها» on mobile), and referral cards on «کارهای من» (`/app/my-tasks`). Your terminal may be PowerShell; if so, set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order:
- a) Create a temporary superuser. Generate a random 20-character password yourself. In `backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from django.contrib.auth import get_user_model; U = get_user_model(); u = U.objects.create_superuser('qa_stage2_check', 'qa_stage2@example.test', 'YOUR_PASSWORD'); print('created', u.pk)"`
  with YOUR_PASSWORD replaced. Never write the password into any file or into your report.
- b) Log in at `https://app.farsalish.ir/login` with that account. Report whether the dashboard opens and whether the browser console shows red errors (list them; ignore warnings).
- c) Company numbering tab: open `/app/operations/companies`, open the first company, open the tab «شماره‌گذاری اسناد». Expected: the series cards and the section «دفتر شماره‌های صادرشده» render (an empty-ledger text is fine). If the pager is visible, «صفحهٔ قبل» is on the right with an arrow pointing right and «صفحهٔ بعد» on the left with an arrow pointing left. Take a screenshot. Do not save anything.
- d) Settings leave guard: open `/app/warehouse/settings` (if the route does not exist or redirects away, write that and skip this item). Change any text field without saving, then click another sidebar menu item. Expected: an in-app dialog asks to confirm leaving (not a browser popup). Click the stay/cancel button: you stay on the page. Then reload the page so the change is dropped. Take a screenshot of the dialog.
- e) My tasks: open `/app/my-tasks`. Expected: the page renders its tabs and either task cards or the empty state, with no red console errors. If any card shows «ارجاع» or «برای اطلاع», take a screenshot; do not press its buttons.
- f) Delete the QA account (always, even if a step failed):
  `.\venv\Scripts\python.exe manage.py shell -c "from django.contrib.auth import get_user_model; print(get_user_model().objects.filter(username='qa_stage2_check').delete())"`
  If deletion raises an error, set `is_active=False` on that user instead and report it.

4. Tool policy: only the commands above, the browser and `git status --short`. Save screenshots only under `scratch/logs/agy_stage2/`. If a page does not load, report the HTTP status or error text and continue with the next item.

5. Before finishing: the QA account is deleted or deactivated, and `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report, one line per item b to f with PASS / FAIL / SKIPPED and what you saw, the console errors, and the screenshot paths. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 3.1-b: API scenario tests for company-scoped counterparties on core external parties

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_counterparty_parties.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_counterparty_parties.py --contains test_list_shows_only_own_company --contains test_create_ignores_foreign_company --contains test_same_national_id_same_company_returns_existing --contains test_same_national_id_other_company_is_new --contains test_invoice_with_other_company_counterparty_rejected --contains test_duplicate_queued_post_returns_200_without_new_row --contains test_plain_member_sees_masked_bank_and_national_id --contains test_accountant_and_treasury_of_same_company_see_full
verify: set DB_TEST_NAME=test_agy_cp31b&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_counterparty_parties --min-tests 8
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 3.1-b): counterparty scope, idempotent create and masking scenarios"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly one new file: `backend/modules/accounting/personnel/test_counterparty_parties.py`. Change no other file. If a test fails because of production code, do not change production code: keep the test, mark it with `@unittest.expectedFailure` and a one-line comment, and say so in the report.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.
- Never run `manage.py test` without app labels.

2. Context (already committed by Claude in the previous commit):
- `Counterparty` (`personnel.models`) is now the financial role of a core `contacts.models.ExternalParty`. Identity fields (`company`, `kind`, `name`, `national_id`, `phone`, …) live on `counterparty.party`. Shortcut for test setup: `Counterparty.objects.create(company=<Company>, name='...', national_id='...', counterparty_type='other')` creates the party too. Read attributes as `cp.company_id`, `cp.name`, `cp.party.national_id`. Query with `Counterparty.objects.filter(party__company=..., party__national_id=...)`.
- Bank accounts: `personnel.models.PartyBankAccount(party=<ExternalParty>, bank_name, account_number, sheba_number, is_primary)`.
- API `/api/personnel/counterparties/` (POST create, GET list with optional header `X-Company-ID`). Create resolves the company: body `company` if allowed, else header if allowed, else the user's only company, else the user's first allowed company; a foreign company is ignored, never rejected (the offline queue drops a record on any 4xx). If the same company already has a party with the same `national_id` that has a counterparty, the response is HTTP 200 with `existing: true` and the same `id`, and no new row; otherwise HTTP 201 with `existing: false`.
- Masking: the response has `bank_masked` (bool). When true, `sheba_number`, `account_number` (flat keys and inside `bank_accounts`) and the `national_id` of a person (`kind='person'`) show only the last 4 characters, the rest `*`. Full view: superuser, the user who created it, a counterparty manager, or a user with `can_act_as_accountant`, `view_sys_treasury` or `perm_treasury_disburse_action` in a section of the same company.
- Read for patterns only (do not edit): `backend/modules/accounting/personnel/test_counterparty_core.py` (whole file, ~150 lines) and `backend/modules/accounting/personnel/test_org_admin_menu_permissions.py` lines 1-45 (helpers `_grant`, `grant_membership`, `grant_section_perms`) and 160-200 (setUp with two companies).
- Valid test sheba: `IR450120000000101111111001`. Valid person national id: `0012345678`; legal: `12345678901`.

3. Task: write `test_counterparty_parties.py` (Django `TestCase`, `APIClient`, two companies A and B, sections in each via `companies.models.Project` / `ProjectSection`) with exactly these test methods (names are checked):
- a) `test_list_shows_only_own_company`: a member of A lists counterparties and sees only A rows; with header `X-Company-ID` of B the response is 403.
- b) `test_create_ignores_foreign_company`: a member of A posts `{'name': 'x', 'company': B.id}` and gets 201 with `company == A.id`; no counterparty exists in B.
- c) `test_same_national_id_same_company_returns_existing`: two POSTs with the same `national_id` in A; the second returns 200, `existing` true, the same `id`; one row only.
- d) `test_same_national_id_other_company_is_new`: the same `national_id` posted by a member of A and by a member of B (or a superuser with `company`) gives two different rows, one per company, both 201.
- e) `test_invoice_with_other_company_counterparty_rejected`: `personnel.serializers.ExpenseInvoiceSerializer` with a section of A and a counterparty of B is not valid and has the error key `counterparty`.
- f) `test_duplicate_queued_post_returns_200_without_new_row`: replay the exact same JSON body three times (with `national_id`, `sheba_number`, `bank_name`); first 201, then 200 twice; exactly one `Counterparty` and one `PartyBankAccount`.
- g) `test_plain_member_sees_masked_bank_and_national_id`: a counterparty of A created by a superuser with a person national id and a sheba; a plain member of A (no extra permissions) gets `bank_masked` true, `sheba_number` and `national_id` contain `*` and end with the last 4 real characters, and `bank_accounts[0]['sheba_number']` contains `*`.
- h) `test_accountant_and_treasury_of_same_company_see_full`: users with `can_act_as_accountant`, and separately with `view_sys_treasury`, granted on A (use `_grant` like in `test_org_admin_menu_permissions.py`) see `bank_masked` false and the full values; the same permission granted only on B still sees the A row masked if they can list A at all (member of A without permissions in A).

4. Tool policy: only reading the listed files, writing the new test file, the test command below, `git add` of the new file, `git commit`, `git status --short`. Test command, in `backend`: `$env:PYTHONUTF8='1'; .\venv\Scripts\python.exe manage.py test personnel.test_counterparty_parties --keepdb --noinput`. If it fails, read the error, fix the test (not production code), and rerun at most 4 times.

5. Before finishing: all 8 tests pass (or are marked expectedFailure with a reason); commit only the new file with the message `test(release-v1 3.1-b): counterparty scope, idempotent create and masking scenarios`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any expectedFailure with its reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 3.1-c: DOM specs for the counterparties page (bank-accounts sub-list, masked state) and the existing label of the invoice quick modal

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/counterparties/counterparties.dom.spec.ts" --allow "frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-existing.dom.spec.ts"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/accounting/components/finance/counterparties/counterparties.dom.spec.ts --min-tests 6 --require "masked" --require "addBankAccount" --require "deletePartyBankAccount"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-existing.dom.spec.ts --min-tests 2 --require "existing"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/modules/accounting/components/finance/counterparties/counterparties.dom.spec.ts --include src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-existing.dom.spec.ts --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 3.1-c): counterparties page and quick modal DOM specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly two new files: `frontend/src/app/modules/accounting/components/finance/counterparties/counterparties.dom.spec.ts` and `frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-existing.dom.spec.ts`. Change no other file. Never change production code. If a test fails because of production code, keep the test, mark it `it.fails(...)` with a one-line comment, and say so in the report.
- No `it.skip`, `it.only`, `describe.skip`, `describe.only`; do not import `fs` or `path` (the new specs do not need them).
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in the previous commit):
- `CounterpartiesComponent` (`counterparties.ts`, `counterparties.html` in `frontend/src/app/modules/accounting/components/finance/counterparties/`). Constructor order: `AuthService, StateService, PersonnelApiService, WebSocketService, ToastService, ChangeDetectorRef, ActivatedRoute, Router, ActiveCompanyService (optional)`.
- Model `Counterparty` and `PartyBankAccount` in `frontend/src/app/modules/accounting/models/personnel.model.ts` (search `export interface PartyBankAccount`). A counterparty has `party` (external party id), `bank_accounts`, `bank_masked` (true means `sheba_number`, `account_number` and a person's `national_id` contain `*` and show only the last 4 digits).
- `PersonnelApiService` methods used by the page: `getCounterparties`, `createCounterparty`, `updateCounterparty`, `deleteCounterparty`, `getPartyBankAccounts(partyId)`, `createPartyBankAccount(data)`, `updatePartyBankAccount(id, data)`, `deletePartyBankAccount(id)`, `exportCounterpartiesExcel`, `downloadCounterpartiesTemplate`, `importCounterpartiesExcel`.
- Component members to test: `editCounterparty(cp)` (loads the sub-list with `getPartyBankAccounts(cp.party)` into `bankAccounts`), `addBankAccount()` (posts `{party, sheba_number: 'IR'+24 digits, bank_name, account_number, card_number, owner_name, is_primary}` with `is_primary` true only when the list is empty), `setPrimaryBankAccount(acc)` (PATCH `{is_primary: true}` only), `deleteBankAccount(acc)` (opens `confirmModal`; `executeConfirmDialog()` calls `deletePartyBankAccount`), `isEditingMasked`, `isMaskedValue(v)`, `saveCounterparty()` (edit PATCH never contains `bank_name`, `account_number`, `sheba_number`, `company`, nor a masked `national_id`), `onShebaInput(value)` fills the bank form from a sheba.
- Template facts: in the table and card views the sheba copy button (`title` text `کپی شماره شبا (بدون IR)`) is rendered only when `!cp.bank_masked`; in the edit sub-list the copy button (`aria-label` `کپی شبا`) is rendered only when not masked; the sub-list section has `aria-labelledby="cp-bank-list-title"`.
- `EmployeeInvoicesHubComponent` (`employee-invoices.ts`): `saveQuickCounterparty()` calls `personnelApi.createCounterparty`; when the response has `existing: true` it calls `toast.show('info', <text containing تکراری>)`, otherwise `toast.show('success', ...)`, and in both cases sets `newInvoice.counterparty = created.id` when `isNewInvoiceModalOpen` is true.
- Read for patterns only (do not edit): `frontend/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle.dom.spec.ts` lines 1-140 (jsdom header, `ɵfac` override with `ɵɵdirectiveInject`, mocks, TestBed setup) and `frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices.spec.ts` lines 1-140 and 324-375 (mocks and the quick counterparty modal tests).
- Valid test sheba digits (24 digits, without IR): `450120000000101111111001`.

3. Task:
- a) In `counterparties.dom.spec.ts` write at least these tests (names may be Persian or English; the words below must appear in the file because they are checked: `masked`, `addBankAccount`, `deletePartyBankAccount`):
  - list with one unmasked counterparty with a sheba renders the sheba copy button; list with one counterparty `bank_masked: true` and sheba `********************1001` renders no sheba copy button (table view);
  - `editCounterparty` with `party: 7` calls `getPartyBankAccounts(7)` and renders one list item per returned account, with the text `اصلی` on the primary one;
  - masked edit: `bank_masked: true` hides the sub-list copy buttons and makes the national id input readonly;
  - `addBankAccount()` after `onShebaInput('450120000000101111111001')` calls `createPartyBankAccount` with `party: 7`, `sheba_number: 'IR450120000000101111111001'` and `is_primary: true` when the list is empty, and `is_primary: false` when one account already exists;
  - `deleteBankAccount(acc)` then `executeConfirmDialog()` calls `deletePartyBankAccount(acc.id)`;
  - `saveCounterparty()` in edit mode of a masked counterparty (national id `******5678`) calls `updateCounterparty` with a payload that has no `national_id`, no `sheba_number`, no `bank_name`, no `account_number` and no `company` key;
  - `saveCounterparty()` in create mode with a valid sheba sends `bank_accounts` with one item that has `is_primary: true`, and a create response with `existing: true` calls `toast.show` with `'info'`.
- b) In `employee-invoices-existing.dom.spec.ts` write at least 2 tests (the word `existing` must appear): a create response with `existing: true` gives `toast.show('info', ...)` with text containing `تکراری` and selects the id in `newInvoice.counterparty` when the invoice modal is open; a response without `existing` gives `toast.show('success', ...)`. Instantiating the component as in `employee-invoices.spec.ts` (without DOM) is fine for this file if a DOM render is hard; keep the jsdom header.

4. Tool policy: only reading the listed files, writing the two new spec files, the test command below, `git add` of the two files, `git commit`, `git status --short`. Test command, in `frontend`: `npx ng test --watch=false --include=src/app/modules/accounting/components/finance/counterparties/counterparties.dom.spec.ts --include=src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-existing.dom.spec.ts`. If it fails, read the error, fix the spec (not production code), and rerun at most 5 times.

5. Before finishing: both spec files pass; commit only the two new files with the message `test(release-v1 3.1-c): counterparties page and quick modal DOM specs`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any `it.fails` with its reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 3.2-b: API scenario tests for the closed fiscal period lock on invoices and petty cash

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_fiscal_lock_api_32.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_fiscal_lock_api_32.py --contains test_invoice_create_in_closed_period_rejected --contains test_invoice_create_in_open_period_or_without_period_allowed --contains test_invoice_patch_date_into_closed_period_rejected --contains test_invoice_patch_of_closed_period_invoice_rejected --contains test_invoice_delete_in_closed_period_rejected --contains test_petty_cash_create_and_submit_in_closed_period_rejected --contains test_reopen_period_allows_create --contains test_other_company_closed_period_does_not_lock
verify: set DB_TEST_NAME=test_agy_fp32b&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_fiscal_lock_api_32 --min-tests 8
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 3.2-b): closed fiscal period API scenarios"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly one new file: `backend/modules/accounting/personnel/test_fiscal_lock_api_32.py`. Change no other file. If a test fails because of production code, do not change production code: keep the test, mark it with `@unittest.expectedFailure` and a one-line comment, and say so in the report.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.
- Never run `manage.py test` without app labels.

2. Context (already committed by Claude in the previous commit):
- A company fiscal period is `personnel.models.CompanyFiscalPeriod` (`company`, `fiscal_year`, `title`, `start_date`, `end_date` as Shamsi strings `YYYY/MM/DD`, `status` in `open` / `closed`, `is_active`). A dated document whose date falls inside a `closed` period of its section's company is locked: create, update (old date or new date), delete and workflow actions return HTTP 400 with a JSON body that has `code == 'fiscal_period_closed'` and a list of messages under the date field key. The date field is `invoice_date_shamsi` for invoices and `transaction_date_shamsi` for petty-cash transactions. A date in no period is never locked. A closed period of another company never locks this company.
- APIs: `/api/personnel/expense-invoices/` (POST, PATCH `<id>/`, DELETE `<id>/`, POST `<id>/submit/`), `/api/personnel/petty-cash-transactions/` (POST, POST `<id>/submit/`), `/api/personnel/company-fiscal-periods/<id>/reopen-period/` (POST).
- Reuse the fixtures, do not copy them: `from personnel.test_fiscal_period_32 import FiscalFixtures` and subclass it. Read `backend/modules/accounting/personnel/test_fiscal_period_32.py` lines 1-77 only. `FiscalFixtures.setUp` gives `self.company`, `self.other` (second company), `self.sec` (section of `self.company`), `self.other_sec`, `self.cp` (counterparty), `self.admin` (superuser), `self.api` (APIClient logged in as admin with header `X-Company-ID` of `self.company`). Helpers: `self.period(year='1405', start='1405/01/01', end='1405/12/29', status='open', company=None)`, `self.invoice(date='1405/08/01', section=None, status='draft')`, `self.petty(date='1405/08/01', status='draft')`, `self.invoice_payload(date)` (POST body for an invoice), `self.assert_closed(response, field)` (asserts 400, `code == 'fiscal_period_closed'` and the field key in the body).
- Petty-cash POST body: `{'section': self.sec.id, 'custodian': self.admin.id, 'amount': '10000', 'transaction_date_shamsi': <date>, 'title': 'tx', 'category': 'misc'}`.

3. Task: write `test_fiscal_lock_api_32.py` with one class `FiscalLockApiTests(FiscalFixtures)` and exactly these test methods (names are checked):
- a) `test_invoice_create_in_closed_period_rejected`: closed period 1405; POST invoice dated `1405/08/01` gives `assert_closed(..., 'invoice_date_shamsi')`; `ExpenseInvoice` count unchanged.
- b) `test_invoice_create_in_open_period_or_without_period_allowed`: open period 1405; POST dated `1405/08/01` gives 201; POST dated `1407/01/10` (no period) gives 201.
- c) `test_invoice_patch_date_into_closed_period_rejected`: closed period 1405; invoice created with `self.invoice(date='1406/02/01')`; PATCH `{'invoice_date_shamsi': '1405/08/01'}` is rejected with `assert_closed`; after `refresh_from_db()` the date is still `1406/02/01`.
- d) `test_invoice_patch_of_closed_period_invoice_rejected`: closed period 1405; `self.invoice(date='1405/08/01')`; PATCH `{'description': 'changed'}` is rejected with `assert_closed`; the description is unchanged.
- e) `test_invoice_delete_in_closed_period_rejected`: closed period 1405; DELETE of an invoice dated `1405/08/01` is rejected with `assert_closed`; the row still exists.
- f) `test_petty_cash_create_and_submit_in_closed_period_rejected`: closed period 1405; POST petty cash dated `1405/08/01` gives `assert_closed(..., 'transaction_date_shamsi')`; `tx = self.petty()` then POST `<tx.id>/submit/` gives `assert_closed`; `tx.refresh_from_db()` status is still `draft`.
- g) `test_reopen_period_allows_create`: closed period 1405; POST invoice dated `1405/08/01` is rejected; POST `reopen-period/` on that period gives 200; the same POST invoice now gives 201.
- h) `test_other_company_closed_period_does_not_lock`: closed period 1405 with `company=self.other`; POST invoice dated `1405/08/01` (section of `self.company`) gives 201.

4. Tool policy: only reading the listed file range, writing the new test file, the test command below, `git add` of the new file, `git commit`, `git status --short`. Test command, in `backend`: `$env:PYTHONUTF8='1'; .\venv\Scripts\python.exe manage.py test personnel.test_fiscal_lock_api_32 --keepdb --noinput`. If it fails, read the error, fix the test (not production code), and rerun at most 4 times.

5. Before finishing: all 8 tests pass (or are marked expectedFailure with a reason); commit only the new file with the message `test(release-v1 3.2-b): closed fiscal period API scenarios`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any expectedFailure with its reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 3.2-c: DOM specs for the fiscal periods section (no frozen, confirm, field errors, closed info) and the closed-period message on the invoice date field

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/companies-studio/company-fiscal-periods-section/company-fiscal-periods-section.dom.spec.ts" "frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-fiscal-closed.dom.spec.ts"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/accounting/components/companies-studio/company-fiscal-periods-section/company-fiscal-periods-section.dom.spec.ts --min-tests 10 --require "fieldErrors" --require "closed_by_name" --require "reopen-period"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-fiscal-closed.dom.spec.ts --min-tests 3 --require "fiscal_period_closed" --require "invoice_date_error"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/modules/accounting/components/companies-studio/company-fiscal-periods-section/company-fiscal-periods-section.dom.spec.ts --include src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-fiscal-closed.dom.spec.ts --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 3.2-c): fiscal periods section and closed-period invoice DOM specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Change exactly two files: edit the existing `frontend/src/app/modules/accounting/components/companies-studio/company-fiscal-periods-section/company-fiscal-periods-section.dom.spec.ts` (add tests, keep every existing test) and create the new `frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-fiscal-closed.dom.spec.ts`. Change no other file. Never change production code. If a test fails because of production code, keep the test, mark it `it.fails(...)` with a one-line comment, and say so in the report.
- No `it.skip`, `it.only`, `describe.skip`, `describe.only`; do not import `fs` or `path`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in the previous commit):
- `CompanyFiscalPeriodsSectionComponent` (`company-fiscal-periods-section.ts` and `.html` in the same folder as the existing spec). A fiscal period status is only `open` or `closed`; there is no freeze action any more (the API path `freeze-period` and the method `freezeFiscalPeriod` were removed). The `open` period shows the button `بستن سال مالی`; the `closed` period shows the button `بازگشایی` (both only when `canCloseFiscal`, which the existing spec setup already allows). A closed period badge contains an `svg` with attribute `appIcon="status-locked"`.
- `fieldErrors` (object with optional keys `fiscal_year`, `title`, `start_date`, `end_date`, `notes`) is filled from a 400 response body of `createFiscalPeriod` shaped `{ <field>: ['message'] }`; each message is rendered in a `p` with id `fp_<field>_error` (for example `fp_start_date_error`) and `role="alert"` under its field, and the input gets `aria-invalid="true"`. When the body has no field key, the toast shows `detail`. `fiscal_year` is optional: an empty year is not sent in the payload (the server fills it); `title`, `start_date` and `end_date` stay required.
- `closeFiscalPeriod(p)` and `reopenFiscalPeriod(p)` ask through the injected `ConfirmDialogService.open(...)` (mocked as `mockConfirm` in the existing spec); after a successful close the component reloads the list with `getFiscalPeriods`. A closed period with `closed_at` (ISO date) and `closed_by_name` renders the text `بسته شده` and `توسط <name>` in the table cell and in the mobile card.
- The server returns the closed-period rule on the endpoint `reopen-period` (mention the word `reopen-period` in a test name or comment; it is checked).
- `EmployeeInvoicesHubComponent` (`employee-invoices.ts`, `employee-invoices.html`): `saveInvoice()` calls `personnelApi.createExpenseInvoice(payload)`. When the error body is `{ invoice_date_shamsi: ['msg'], code: 'fiscal_period_closed' }` it sets `invoiceDateError = 'msg'`, calls `toast.show('error', 'msg')`, and the template renders `<p id="invoice_date_error" role="alert">msg</p>` under the date input inside the new-invoice modal (`isNewInvoiceModalOpen`). Any other error keeps the old toast text starting with `خطا در ثبت فاکتور` and leaves `invoiceDateError` empty. Changing the date input (ngModelChange) and `openNewInvoiceModal()` clear `invoiceDateError`. `sendToSupervisor` and `deleteDraftInvoice` show the closed-period message in the toast when the error has that code.
- Read for patterns only (do not edit): the existing `company-fiscal-periods-section.dom.spec.ts` (all 192 lines) and `frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-existing.dom.spec.ts` (all 176 lines: jsdom header, constructor injection override, mocks, TestBed setup). Copy the setup of the second file into the new spec.

3. Task:
- a) Add to `company-fiscal-periods-section.dom.spec.ts` at least these tests (keep the existing ones):
  - the rendered buttons of an open period never contain the label `انجماد`, and the component has no `freezeFiscalPeriod` member (`expect((component as any).freezeFiscalPeriod).toBeUndefined()`);
  - a closed period (`status: 'closed', closed_at: '2026-03-20T08:00:00Z', closed_by_name: 'مدیر مالی'`) renders the button `بازگشایی`, no `بستن سال مالی` button, the lock icon in the badge and the text `مدیر مالی`;
  - `closeFiscalPeriod` when `mockConfirm.open` resolves `false` does not call the API; when it resolves `true` it calls `closeFiscalPeriod` and then `getFiscalPeriods` again;
  - `reopenFiscalPeriod` (server action `reopen-period`) goes through `mockConfirm.open` and sets the status to `open`;
  - `createFiscalPeriod` rejecting with `{ status: 400, error: { start_date: ['این بازه با دورهٔ مالی ۱۴۰۴ همپوشانی دارد.'] } }` keeps the form open, sets `fieldErrors.start_date`, renders `#fp_start_date_error` with that text, and the start input has `aria-invalid="true"`;
  - a 400 with `{ detail: 'x' }` only shows `toast.error('x')` and leaves `fieldErrors` empty;
  - saving with an empty year and a valid title and dates calls `createFiscalPeriod` with a payload that has no `fiscal_year` key.
- b) In the new `employee-invoices-fiscal-closed.dom.spec.ts` write at least 3 tests (the words `fiscal_period_closed` and `invoice_date_error` must appear): the closed-period 400 on `saveInvoice()` renders `#invoice_date_error` with the server message inside the open modal and calls `toast.show('error', <message>)`; a 500 error leaves `invoiceDateError` empty and shows the old toast; `openNewInvoiceModal()` clears a previous `invoiceDateError`. Fill the required invoice fields before saving (`counterparty`, `invoice_number`, `invoice_date_shamsi`, `amount` > 0, and a selected section as in the existing spec).

4. Tool policy: only reading the listed files, editing or writing the two spec files, the test command below, `git add` of the two files, `git commit`, `git status --short`. Test command, in `frontend`: `npx ng test --watch=false --include=src/app/modules/accounting/components/companies-studio/company-fiscal-periods-section/company-fiscal-periods-section.dom.spec.ts --include=src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-fiscal-closed.dom.spec.ts`. If it fails, read the error, fix the spec (not production code), and rerun at most 5 times.

5. Before finishing: both spec files pass; commit only the two files with the message `test(release-v1 3.2-c): fiscal periods section and closed-period invoice DOM specs`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any `it.fails` with its reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 3.3-c: DOM specs for the company bank account opening balance (create date, masked display, change button rules, reason, closed period error, history empty state)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/companies-studio/company-treasury-tab/company-treasury-tab-opening.dom.spec.ts"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/accounting/components/companies-studio/company-treasury-tab/company-treasury-tab-opening.dom.spec.ts --min-tests 6 --require "opening_balance_date" --require "fiscal_period_closed" --require "bank_opening_balance" --require "getOpeningHistory"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/modules/accounting/components/companies-studio/company-treasury-tab/company-treasury-tab-opening.dom.spec.ts --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 3.3-c): company bank opening balance DOM specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly one new file: `frontend/src/app/modules/accounting/components/companies-studio/company-treasury-tab/company-treasury-tab-opening.dom.spec.ts`. Change no other file. Never change production code. If a test fails because of production code, keep the test, mark it `it.fails(...)` with a one-line comment, and say so in the report.
- No `it.skip`, `it.only`, `describe.skip`, `describe.only`; do not import `fs` or `path`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in the previous commit):
- `CompanyTreasuryTabComponent` (`company-treasury-tab.ts` and `.html` in the same folder). It uses `CompaniesStudioFacade`, which calls the injected `CompanyApiService`; so mock these methods on the API mock: `matchesCompanyUrl`, `getBankAccounts`, `createBankAccount`, `updateBankAccount`, `deleteBankAccount`, `setPrimaryBankAccount`, `setOpeningBalance(id, body)` and `getOpeningHistory(id)` (returns `of({ count: 0, results: [] })` by default).
- Permissions come from `CompanyStudioContextService.sectionLevels` (a signal). `null` means full access. To restrict, call `context.sectionLevels.set({ bank: 'read', bank_sheba: 'none', bank_opening_balance: 'none' })` (levels are `'none' | 'read' | 'write'`), then `fixture.changeDetectorRef.markForCheck(); fixture.detectChanges();`.
- Account JSON fields: `opening_balance` (string or `null` when masked), `opening_balance_date` (`'1405/01/01'` or `null`), `has_movements` (boolean).
- Card row text: element `[data-testid="opening-balance-text"]` shows `—` when the user has no `bank` read level or `opening_balance` is `null`; shows `ثبت نشده` when visible but `opening_balance_date` is `null`; otherwise contains `ریال`.
- Button `[data-testid="open-opening-balance"]` (aria-label `تغییر موجودی اولیه`) is shown only when `bank` is `write` and (`has_movements` is false or `bank_opening_balance` is `write`). The method `canChangeOpening(acc)` returns the same boolean.
- Create form: `saveBankAccount()` (async) with a valid sheba and an empty `newAccount.opening_balance_date` does not call `createBankAccount` and sets `createFieldErrors.opening_balance_date` to `تاریخ موجودی اولیه الزامی است.`; the template then renders `p#bank_opening_date_error`. With `newAccount.opening_balance_date = '1405/01/01'` it calls `createBankAccount` with a payload containing `opening_balance_date: '1405/01/01'` and `opening_balance: '0'` when the amount is empty. Use `component.onShebaInput('IR160120000000001234567890')` for a valid sheba.
- Modal: `openOpeningBalance(acc)` sets `component.openingAccount`, fills `component.openingForm` (`opening_balance`, `opening_balance_date`, `reason`) and calls `getOpeningHistory(acc.id)` when `bank` is readable. `saveOpeningBalance()` with `has_movements: true` and an empty `openingForm.reason` does not call `setOpeningBalance` and sets `openingErrors.reason`. A rejected `setOpeningBalance` with `{ status: 400, error: { opening_balance_date: ['دوره مالی بسته است.'], code: 'fiscal_period_closed' } }` sets `openingErrors.opening_balance_date` to that message, renders `p#opening_change_date_error` with it, and keeps the modal open (`openingAccount` not null). A successful call updates the account in `companyBankAccounts` and sets `openingAccount` to `null`.
- History empty state: with `getOpeningHistory` returning `{ count: 0, results: [] }`, the open modal renders `[data-testid="opening-history-empty"]` with the text `سابقه‌ای ثبت نشده است.`. The modal content is rendered by `app-modal` inside the component's own DOM (`fixture.nativeElement`).
- Read for patterns only (do not edit): `company-treasury-tab.dom.spec.ts` lines 1-70 (jsdom header, mocks, TestBed setup); copy that setup.

3. Task: write at least these 6 tests in the new spec:
- a) create: no `opening_balance_date` blocks the API call and renders `#bank_opening_date_error`; with the date, `createBankAccount` is called with `opening_balance_date`.
- b) masked: an account with `opening_balance: null, opening_balance_date: null` and `context.sectionLevels.set({ bank: 'none', bank_sheba: 'none', bank_opening_balance: 'none' })` renders `—` in `[data-testid="opening-balance-text"]`; a visible account with a null date renders `ثبت نشده`.
- c) button hidden when `bank` is `read`; with `bank: 'write'` and `has_movements: true` it is hidden unless `bank_opening_balance: 'write'`.
- d) reason required when `has_movements` is true (no `setOpeningBalance` call, `openingErrors.reason` set).
- e) the `fiscal_period_closed` 400 renders `#opening_change_date_error` and keeps the modal open.
- f) history empty state renders `سابقه‌ای ثبت نشده است.` and `getOpeningHistory` was called with the account id.

4. Tool policy: only reading the listed files, writing the one spec file, the test command below, `git add` of that file, `git commit`, `git status --short`. Test command, in `frontend`: `npx ng test --watch=false --include=src/app/modules/accounting/components/companies-studio/company-treasury-tab/company-treasury-tab-opening.dom.spec.ts`. If it fails, read the error, fix the spec (not production code), and rerun at most 5 times.

5. Before finishing: the spec passes; commit only that file with the message `test(release-v1 3.3-c): company bank opening balance DOM specs`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any `it.fails` with its reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 3.4-b: API scenario tests for company expense heads (lifecycle, petty cash, Excel export, usage_count, other company, seed-defaults)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_expense_heads_api_34.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_expense_heads_api_34.py --contains test_lifecycle_group_head_invoice_deactivate --contains test_petty_cash_expense_with_head_allocation_without --contains test_invoice_excel_export_contains_head_title --contains test_usage_count_only_for_writer --contains test_other_company_head_rejected_on_invoice --contains test_seed_defaults_idempotent
verify: set DB_TEST_NAME=test_agy_eh34b&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_expense_heads_api_34 --min-tests 6
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 3.4-b): expense heads API scenarios"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly one new file: `backend/modules/accounting/personnel/test_expense_heads_api_34.py`. Change no other file. If a test fails because of production code, do not change production code: keep the test, mark it with `@unittest.expectedFailure` and a one-line comment, and say so in the report.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.
- Never run `manage.py test` without app labels.

2. Context (already committed by Claude in the previous commit):
- Model `personnel.models.ExpenseHead`: `company`, `parent` (null for a group), `code` (digits, unique per company), `title`, `is_active`, `order`. A new `Company` automatically gets a default list (groups `10`, `20`, `90`; heads such as `1001`, `1002`, `9001`) through a post_save signal, so every company created in a test already has heads. Function `personnel.expense_heads.seed_default_expense_heads(company)` returns the number of rows created (0 when the company already has heads).
- API `/api/personnel/expense-heads/`: GET list needs `?company_id=<id>` (400 without it), `&active=1` returns only active rows; each row has `id`, `company`, `parent`, `parent_title`, `is_group`, `code`, `title`, `is_active`, `order`, and `usage_count` only when the caller has company section `expense_heads` at level `write` (superuser always). POST (body `company`, `parent`, `code`, `title`), PATCH `<id>/`, DELETE `<id>/`, POST `seed-defaults/?company_id=<id>` (201 with `{'created': n}` when it created rows, 200 with `{'created': 0}` otherwise).
- Invoice `/api/personnel/expense-invoices/` and petty cash `/api/personnel/petty-cash-transactions/` now take `expense_head` (id). Invoice and petty cash `transaction_type='expense'` need an active head (with a parent, parent active) of the section's company, otherwise 400 with key `expense_head`. Petty cash `allocation` / `refund` must not send `expense_head` (400). `category` is read-only; the server sets it to the head title. An invoice keeps an unchanged head even after that head is deactivated (PATCH of another field gives 200), but PATCH to a different inactive head gives 400. Invoice Excel export: GET `/api/personnel/expense-invoices/export-excel/` returns an xlsx whose rows contain the `category` text (the head title).
- Reuse fixtures, do not copy them: `from personnel.test_expense_heads_34 import HeadFixtures` and subclass it. Read `backend/modules/accounting/personnel/test_expense_heads_34.py` lines 1-48 only. `HeadFixtures.setUp` gives `self.company`, `self.other`, `self.sec` (section of `self.company`), `self.cp` (counterparty), `self.admin` (superuser), `self.api` (APIClient as admin with header `X-Company-ID` of `self.company`), `self.writer` (company section `expense_heads` write), `self.member` (plain member), `self.head` (head `1001` of `self.company`), `self.group` (its group), `self.other_head` (head `1001` of `self.other`); helpers `self.client_for(user)`, `self.invoice_body(**extra)`, `self.petty_body(**extra)`. Constants `HEADS`, `INVOICES`, `PETTY` can be imported from `personnel.test_expense_heads_34`.

3. Task: write one class `ExpenseHeadApiScenarioTests(HeadFixtures)` with exactly these test methods (names are checked):
- a) `test_lifecycle_group_head_invoice_deactivate`: as `self.writer` POST a group (`company`, `code` `'30'`, `title` `'گروه تست'`) gives 201; POST a head under it (`parent` = new group id, `code` `'3001'`) gives 201; as `self.admin` (`self.api`) POST an invoice with that head gives 201 and the invoice `category` equals the head title; as writer PATCH the head `{'is_active': False}` gives 200; PATCH the invoice `{'description': 'x'}` gives 200; create a second head `'3002'`, deactivate it, PATCH the invoice `{'expense_head': <3002 id>}` gives 400.
- b) `test_petty_cash_expense_with_head_allocation_without`: POST petty cash `transaction_type='expense'` with `expense_head=self.head.id` gives 201; POST `transaction_type='allocation'` without a head gives 201 and the stored `category` is `'شارژ تنخواه'`; POST `transaction_type='refund'` with `expense_head=self.head.id` gives 400.
- c) `test_invoice_excel_export_contains_head_title`: create an invoice with `self.head` via POST; GET the export with `self.api`; status 200; load `openpyxl.load_workbook(io.BytesIO(response.content))` and assert some cell value equals `self.head.title`.
- d) `test_usage_count_only_for_writer`: after one invoice with `self.head`, the writer's list row for `self.head` has `usage_count == 1`; the member's rows have no `usage_count` key.
- e) `test_other_company_head_rejected_on_invoice`: POST an invoice with `expense_head=self.other_head.id` gives 400 with key `expense_head`; also a group id (`self.group.id`) gives 400.
- f) `test_seed_defaults_idempotent`: as writer POST `seed-defaults/?company_id=<self.company.id>` gives 200 and `created == 0` (defaults already exist); the head count of `self.company` is unchanged.

4. Tool policy: only reading the listed file range, writing the new test file, the test command below, `git add` of the new file, `git commit`, `git status --short`. Test command, in `backend`: `$env:PYTHONUTF8='1'; .\venv\Scripts\python.exe manage.py test personnel.test_expense_heads_api_34 --keepdb --noinput`. If it fails, read the error, fix the test (not production code), and rerun at most 4 times.

5. Before finishing: all 6 tests pass (or are marked expectedFailure with a reason); commit only the new file with the message `test(release-v1 3.4-b): expense heads API scenarios`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any expectedFailure with its reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 3.4-c: DOM specs for the company expense heads tab and the expense head selector (tree, read level, delete 400, seed, grouping, payload, 400 field error)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/companies-studio/company-expense-heads-tab/company-expense-heads-tab.dom.spec.ts" --allow "frontend/src/app/modules/accounting/components/finance/employee/expense-head-selector.dom.spec.ts"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/accounting/components/companies-studio/company-expense-heads-tab/company-expense-heads-tab.dom.spec.ts --min-tests 4 --require "seedDefaultExpenseHeads" --require "deleteExpenseHead" --require "expense_heads"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/accounting/components/finance/employee/expense-head-selector.dom.spec.ts --min-tests 3 --require "buildExpenseHeadOptions" --require "expense_head" --require "expenseHeadError"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/modules/accounting/components/companies-studio/company-expense-heads-tab/company-expense-heads-tab.dom.spec.ts --include src/app/modules/accounting/components/finance/employee/expense-head-selector.dom.spec.ts --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 3.4-c): expense heads tab and selector DOM specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly two new files: `frontend/src/app/modules/accounting/components/companies-studio/company-expense-heads-tab/company-expense-heads-tab.dom.spec.ts` and `frontend/src/app/modules/accounting/components/finance/employee/expense-head-selector.dom.spec.ts`. Change no other file. Never change production code. If a test fails because of production code, keep the test, mark it `it.fails(...)` with a one-line comment, and say so in the report.
- No `it.skip`, `it.only`, `describe.skip`, `describe.only`; do not import `fs` or `path`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in the previous commit):
- Tab component `CompanyExpenseHeadsTabComponent` in `company-expense-heads-tab/company-expense-heads-tab.ts` and `.html` (read both). Input `companyId`. It injects `TreasuryOrgApiService` (mock it with `{ provide: TreasuryOrgApiService, useValue: mockApi }`; import from `../../../api/treasury-org-api.service`), `CompanyStudioContextService` (real), `WebSocketService` (optional; mock `{ notifications$: new Subject(), tabId: 't1' }`), `ToastService` (mock `success`, `error`, `warning`, `info`), `ConfirmDialogService` (mock `open: vi.fn().mockResolvedValue(true)`). Mock API methods: `getExpenseHeads(companyId)` returns `of(rows)`, `createExpenseHead`, `updateExpenseHead`, `deleteExpenseHead`, `seedDefaultExpenseHeads` (returns `of({ created: 10 })`).
- Rows are flat: a group has `parent: null`; a head has `parent: <group id>`. Example: `[{ id: 1, company: 7, parent: null, code: '10', title: 'گروه عملیاتی', is_active: true }, { id: 11, company: 7, parent: 1, code: '1001', title: 'تعمیرات', is_active: true }]`.
- Set the input with `fixture.componentRef.setInput('companyId', 7); fixture.detectChanges();` (ngOnChanges loads the list).
- Permissions: `context.sectionLevels.set({ expense_heads: 'read' })` hides all write buttons (text `سرفصل تازه`, `ویرایش`, `حذف`, `ساخت فهرست پیش‌فرض`); `null` (default) means full access. After changing levels call `fixture.changeDetectorRef.markForCheck(); fixture.detectChanges();`.
- `remove(head)` (async) confirms, then calls `deleteExpenseHead(id)`; on `throwError(() => ({ status: 400, error: { detail: 'این گروه زیرمجموعه دارد.' } }))` it calls `toast.error('این گروه زیرمجموعه دارد.')` and keeps the row in `component.heads`.
- Empty list (`of([])`) with write access renders a button with text `ساخت فهرست پیش‌فرض`; clicking it calls `seedDefaultExpenseHeads(7)`.
- Selector helper `expense-head-options.ts` in `frontend/src/app/modules/accounting/components/finance/` (read it): `buildExpenseHeadOptions(rows)` returns one group per active group that has active heads, `{ id, label: 'code — title', heads }`; inactive heads and empty groups are dropped. `expenseHeadErrorMessage(err)` returns `err.error.expense_head[0]` or `''`.
- Invoice form: `EmployeeInvoicesHubComponent` (`employee/employee-invoices/employee-invoices.ts`). Copy the setup of `employee/employee-invoices/employee-invoices-fiscal-closed.dom.spec.ts` lines 1-75 (component built with `new`, mock `getExpenseHeads` already shown there). `saveInvoice()` with `newInvoice.expense_head = null` (other fields valid) does not call `createExpenseInvoice` and sets `component.expenseHeadError` to `سرفصل هزینه الزامی است.`. With `expense_head: 11` it calls `createExpenseInvoice` with a payload containing `expense_head: 11` and without a `category` key. A rejected create with `{ status: 400, error: { expense_head: ['سرفصل انتخاب‌شده فعال نیست.'] } }` sets `component.expenseHeadError` to that message.
- Petty cash form: `EmployeePettyCashHubComponent` (`employee/employee-petty-cash/employee-petty-cash.ts`), built like `employee/employee-petty-cash/employee-petty-cash.spec.ts` lines 100-150. `saveExpense()` behaves the same way with `newExpense.expense_head` and `createPettyCashTransaction`.

3. Task:
- Tab spec, at least these 4 tests: a) tree render: the group title and the head title both appear in `fixture.nativeElement.textContent`; b) read level hides the write buttons listed above; c) delete 400 shows the server message via `toast.error` and the row stays; d) empty list shows `ساخت فهرست پیش‌فرض` and the click calls `seedDefaultExpenseHeads(7)`.
- Selector spec, at least these 3 tests: e) `buildExpenseHeadOptions` groups heads under their group, labels `'10 — گروه عملیاتی'`, and drops inactive heads and empty groups; f) invoice: missing head blocks the call and sets `expenseHeadError`; with a head the payload has `expense_head` and no `category`; g) petty cash: a 400 `expense_head` error sets `expenseHeadError`.

4. Tool policy: only reading the listed files, writing the two spec files, the test command below, `git add` of those files, `git commit`, `git status --short`. Test command, in `frontend`: `npx ng test --watch=false --include=src/app/modules/accounting/components/companies-studio/company-expense-heads-tab/company-expense-heads-tab.dom.spec.ts --include=src/app/modules/accounting/components/finance/employee/expense-head-selector.dom.spec.ts`. If it fails, read the error, fix the spec (not production code), and rerun at most 5 times.

5. Before finishing: both specs pass; commit only those two files with the message `test(release-v1 3.4-c): expense heads tab and selector DOM specs`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any `it.fails` with its reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 3.5-b: API scenario tests for the final accounting permissions (five roles x main actions in section A, no assignment in section B, counterparty manage scoped by company)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_permissions_api_35.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_permissions_api_35.py --contains test_role_matrix_in_section_a --contains test_no_assignment_in_section_b_denies_all --contains test_invoice_post_by_assignment --contains test_counterparty_full_view_by_role --contains test_counterparty_patch_by_role --contains test_counterparty_manage_in_other_company_is_not_enough
verify: set DB_TEST_NAME=test_agy_p35b&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_permissions_api_35 --min-tests 6
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 3.5-b): accounting permissions API scenarios"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly one new file: `backend/modules/accounting/personnel/test_permissions_api_35.py`. Change no other file. If a test fails because of production code, do not change production code: keep the test, mark it with `@unittest.expectedFailure` and a one-line comment, and say so in the report.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.
- Never run `manage.py test` without app labels.

2. Context (already committed by Claude in the previous commit):
- The accounting module now declares 21 section permissions. Default role bundles (role key -> codes) relevant here: `employee`: `perm_invoice_record`; `supervisor`: `perm_invoice_record`, `perm_invoice_approve`; `accountant`: `perm_invoice_record`, `perm_invoice_review`, `perm_counterparty_manage`; `manager`: `perm_invoice_record`, `perm_manager_payment_authorize`; `treasury`: `perm_invoice_record`, `perm_treasury_disburse_action`, `perm_counterparty_manage`. Every role except `employee` also has `perm_petty_cash_manage`.
- `accounts.scoped_permissions.can(user, code, section)` returns True only when the user has an active assignment in that section (or its project or company) whose role bundle contains the code. Call `accounts.scoped_permissions.clear_scoped_permission_cache(user)` after changing assignments.
- Helper `personnel.scoped_test_support.grant_section_perms(user, [], section=<section>, role=<role key>, exact=False)` creates an active assignment with that role in that section.
- Reuse fixtures, do not copy them: `from personnel.test_expense_heads_34 import HeadFixtures` and subclass it. Read `backend/modules/accounting/personnel/test_expense_heads_34.py` lines 1-48 only. `HeadFixtures.setUp` gives `self.company`, `self.other` (a second company), `self.sec` (section A of `self.company`), `self.cp` (counterparty of `self.company`), `self.admin` (superuser), `self.head` (expense head of `self.company`); helpers `self.user(name, {})` (user with access to `self.company`), `self.client_for(user)`, `self.invoice_body(**extra)`. Constant `INVOICES` (invoice list URL) can be imported from `personnel.test_expense_heads_34`.
- Section B: in `setUp` create `ProjectSection.objects.create(project=self.sec.project, code='P35-B', name='B')` (`from personnel.models import Project, ProjectSection`). A section of the other company: `Project.objects.create(company=self.other, code='P35-O', name='O')` and a `ProjectSection` on it with code `'P35-OS'`.
- Counterparty detail URL: `/api/personnel/counterparties/<self.cp.id>/`. GET returns key `bank_masked` (False means the caller sees full bank and national id data). PATCH `{'phone': '09120000000'}` with `format='json'`.
- Invoice create: POST `INVOICES` with `self.invoice_body(expense_head=self.head.id)` and `format='json'`; 201 on success.

3. Task: write one class `AccountingPermissionsApi35Tests(HeadFixtures)`. In `setUp`, after `super().setUp()`, create five users with `self.user('p35_<role>', {})` for the roles `employee`, `supervisor`, `accountant`, `manager`, `treasury`, and give each an assignment with its own role in section A (`self.sec`) via `grant_section_perms`. Store them in a dict `self.users`. Exactly these test methods (names are checked):
- a) `test_role_matrix_in_section_a`: for each of the five users and each code in `perm_invoice_record`, `perm_invoice_approve`, `perm_invoice_review`, `perm_manager_payment_authorize`, `perm_treasury_disburse_action`, `perm_counterparty_manage`, assert `can(user, code, self.sec)` equals the bundle table above (use `self.subTest(role=..., code=...)`).
- b) `test_no_assignment_in_section_b_denies_all`: for the same five users and six codes, `can(user, code, section_b)` is False.
- c) `test_invoice_post_by_assignment`: the employee user posts an invoice in section A and gets 201. A new user `p35_emp_b` with access to `self.company` and an `employee` assignment only in section B posts the same body (section A, another `invoice_number`) and gets a status in (400, 403); the invoice count does not change for that request.
- d) `test_counterparty_full_view_by_role`: GET the counterparty detail: accountant and treasury get `bank_masked` False; employee, supervisor and manager get `bank_masked` True.
- e) `test_counterparty_patch_by_role`: PATCH by the accountant gives 200; PATCH by the supervisor gives 403.
- f) `test_counterparty_manage_in_other_company_is_not_enough`: a new user `p35_acc_other` with `self.user('p35_acc_other', {})` (access to `self.company`, no assignment there) and an `accountant` assignment in the other company's section; GET gives 200 with `bank_masked` True and PATCH gives 403.

4. Tool policy: only reading the listed file range, writing the new test file, the test command below, `git add` of the new file, `git commit`, `git status --short`. Test command, in `backend`: `$env:PYTHONUTF8='1'; .\venv\Scripts\python.exe manage.py test personnel.test_permissions_api_35 --keepdb --noinput`. If it fails, read the error, fix the test (not production code), and rerun at most 4 times.

5. Before finishing: all 6 tests pass (or are marked expectedFailure with a reason); commit only the new file with the message `test(release-v1 3.5-b): accounting permissions API scenarios`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any expectedFailure with its reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 3.5-c: spec for the accounting menus of the five role bundles (persona resolution and visible menu items per role)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/nav-items-35.spec.ts"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/accounting/nav-items-35.spec.ts --min-tests 7 --require "filterRoleNavItems" --require "resolveAccountingRoleCodes" --require "perm_invoice_approve" --require "perm_counterparty_manage"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/modules/accounting/nav-items-35.spec.ts --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 3.5-c): accounting role menus spec"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly one new file: `frontend/src/app/modules/accounting/nav-items-35.spec.ts`. Change no other file. Never change production code. If a test fails because of production code, keep the test, mark it `it.fails(...)` with a one-line comment, and say so in the report.
- No `it.skip`, `it.only`, `describe.skip`, `describe.only`; do not import `fs` or `path`. This is a plain Vitest spec (no TestBed, no DOM needed).
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in the previous commit, read these three files fully):
- `frontend/src/app/modules/accounting/nav-items.ts`: exports `EMPLOYEE_NAV_ITEMS`, `SUPERVISOR_NAV_ITEMS`, `ACCOUNTANT_NAV_ITEMS`, `MANAGER_NAV_ITEMS`, `TREASURER_NAV_ITEMS`, the matching `*_ROLE_MARKERS` arrays, and `filterRoleNavItems(items, { isAdmin, userPerms, roleMarkers, routeAllowed })`.
- `frontend/src/app/modules/accounting/route-access.ts`: exports `ACCOUNTING_ROUTE_ACCESS`; its `pagePermissions` maps a page id to the list of codes that open it.
- `frontend/src/app/modules/accounting/personas.ts`: exports `resolveAccountingRoleCodes({ perms, userRoles })`.
- In the spec define this helper: `routeAllowed(perms) = (id) => { const list = ACCOUNTING_ROUTE_ACCESS.pagePermissions?.[id]; return !list || list.some(p => perms.includes(p)); }`, and `menuIds(items, markers, perms) = filterRoleNavItems(items, { isAdmin: false, userPerms: perms, roleMarkers: markers, routeAllowed: routeAllowed(perms) }).map(i => i.id)`.
- Role bundles (the permission codes each role gets by default):
  - employee: `view_sys_personnel_attendance`, `view_sys_fleet_attendance`, `perm_invoice_record`
  - supervisor: `view_sys_personnel_attendance`, `view_sys_fleet_attendance`, `perm_approve_personnel_supervisor`, `perm_approve_fleet_supervisor`, `perm_lock_work_period`, `perm_invoice_record`, `perm_invoice_approve`, `perm_petty_cash_manage`
  - accountant: `perm_approve_personnel_finance`, `perm_approve_fleet_finance`, `view_sys_payroll`, `view_sys_fleet_settlement`, `perm_invoice_record`, `perm_invoice_review`, `perm_petty_cash_manage`, `perm_counterparty_manage`
  - manager: `view_sys_personnel`, `perm_delete_personnel_nomovement`, `perm_delete_vehicle_nomovement`, `perm_approve_personnel_manager`, `perm_approve_fleet_manager`, `perm_lock_work_period`, `view_sys_payroll`, `view_sys_fleet_settlement`, `perm_manager_payment_authorize`, `perm_invoice_record`, `perm_petty_cash_manage`
  - treasurer: `perm_treasury_disburse_action`, `perm_invoice_record`, `perm_petty_cash_manage`, `perm_counterparty_manage`

3. Task — write these tests (one `it` each, use `toEqual` on arrays):
- a) employee bundle: `resolveAccountingRoleCodes({ perms, userRoles: [] })` equals `['operator']`; `menuIds(EMPLOYEE_NAV_ITEMS, EMPLOYEE_ROLE_MARKERS, perms)` equals `['employee-attendance', 'employee-fleet', 'employee-invoices', 'employee-petty-cash', 'employee-new-vehicle', 'employee-new-personnel']`.
- b) supervisor bundle: roles equal `['supervisor']`; supervisor menu equals `['supervisor-personnel', 'supervisor-fleet', 'supervisor-invoices', 'supervisor-petty-cash', 'supervisor-period-lock']`.
- c) accountant bundle: roles equal `['accountant']`; accountant menu equals `['accountant-personnel', 'accountant-payroll', 'accountant-fleet', 'accountant-invoices', 'accountant-petty-cash', 'accountant-diskettes', 'accountant-counterparties', 'base-settings']` (the item `profiles` is hidden).
- d) manager bundle: roles equal `['manager']`; manager menu equals `['manager-dashboard', 'manager-personnel', 'manager-fleet', 'manager-approvals', 'manager-budget', 'manager-reports', 'base-settings']`.
- e) treasurer bundle: roles equal `['treasury']`; treasurer menu equals `['treasurer-disbursements', 'treasurer-invoices', 'treasurer-bank-accounts', 'treasurer-cheques', 'treasurer-reconciliation']`.
- f) supervisor bundle without `perm_invoice_approve`: supervisor menu equals `['supervisor-personnel', 'supervisor-fleet', 'supervisor-period-lock']`.
- g) cross-role: each of these menus is empty (`[]`): employee bundle on the supervisor menu; accountant bundle on the manager menu; manager bundle on the treasurer menu; treasurer bundle on the accountant menu.
- h) none of the five removed codes `can_act_as_operator`, `can_act_as_workshop_supervisor`, `can_act_as_accountant`, `can_act_as_company_manager`, `view_sys_treasury` appears in any `*_NAV_ITEMS` item `permission`, in any `*_ROLE_MARKERS` array, or in any list of `ACCOUNTING_ROUTE_ACCESS.pagePermissions`, `guardAccessPermissions` or `loginPermissions`.

4. Tool policy: only reading the three listed files, writing the spec file, the test command below, `git add` of that file, `git commit`, `git status --short`. Test command, in `frontend`: `npx ng test --watch=false --include=src/app/modules/accounting/nav-items-35.spec.ts`. If it fails, read the error, fix the spec (not production code), and rerun at most 5 times.

5. Before finishing: the spec passes; commit only that file with the message `test(release-v1 3.5-c): accounting role menus spec`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any `it.fails` with its reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 3.6-b: core workflow tests for company-level documents and the step `required` hook

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/core/workflow/tests/test_company_level_36.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/core/workflow/tests/test_company_level_36.py --require "company_field" --require "not_required" --require "WorkflowSubstitute" --require "WorkflowThreshold" --require "ImproperlyConfigured" --forbid "skip(" --forbid "expectedFailure"
verify: set DB_TEST_NAME=test_agy_wf36b&& python scripts/automation/verify_tools.py django-tests --labels workflow.tests.test_company_level_36 --min-tests 8
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 3.6-b): company-level workflow tests"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly one new file: `backend/core/workflow/tests/test_company_level_36.py`. Change no other file. Never change production code. If a test fails because of production code, keep the test as written, stop, and describe the failure in the report.
- No `skip` and no `expectedFailure`. Use only the fake roles, permissions and spec helpers from `backend/core/workflow/tests/base.py` (no real module names, roles or permission codes).
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in the previous commit `feat(release-v1 3.6-b)`; read these ranges):
- `backend/core/workflow/tests/base.py` fully (140 lines): `WorkflowTestBase`, `make_spec`, `STEPS`, `self.user(name, role, section=None, **target)` where `target` may be `company=...` or `project=...` for a company-level or project-level assignment, `self.doc`, `self.recipients(task)`, companies `self.co` and `self.co2`, project `self.pr`, section `self.sec`.
- `backend/core/workflow/tests/test_engine.py:270-290` (the `sub(...)` helper creating a `WorkflowSubstitute`).
- `backend/core/workflow/registry.py:36-90` (`StepSpec.required`, `WorkflowSpec.section_field` and `company_field`) and `:103-175` (`validate_specs`).
- `backend/core/workflow/engine.py`: grep `def _load_scope`, `def _plan_skips`, `def submit`, `SKIP_NOT_REQUIRED`.
- New behaviour: a spec with `section_field=None, company_field='company'` takes the company id from `obj.company_id`; the instance gets `section=None` and `company_id` of that company. Recipients of a step are ONLY users with an ACTIVE company-level assignment (`SectionAssignment.company` set, no project, no section) whose role is the step role and who hold the step permission at company level; section-level and project-level assignments never receive it; the creator never receives it. `creator_rank` uses only company-level roles. Thresholds: only `WorkflowThreshold(company=<same company>)` applies. `StepSpec.required(obj)` (APPROVE steps only) returning False puts the step in `instance.skip_plan` with reason `'not_required'`, and the SUBMIT history row (`WorkflowStep.objects.get(instance=inst, action=WorkflowStep.SUBMIT).skipped`) contains `{'step': <key>, 'reason': 'not_required'}`.

3. Task — in the new file define:
- `CO_STEPS = (STEPS[0], STEPS[1], dataclasses.replace(STEPS[2], required=lambda o: getattr(o, 'need_boss', True)))` (steps `lead_ok` APPROVE role `wf_lead`, `review` REVIEW role `wf_reviewer`, `boss_ok` APPROVE role `wf_boss`).
- `class CompanyLevelTests(WorkflowTestBase)` whose `setUp` calls `super().setUp()` then `self.specs.append(make_spec(key='zz_co', steps=CO_STEPS, section_field=None, company_field='company'))`.
- helper `codoc(self, amount=Decimal('100'), company=None, **extra)`: `d = self.doc(amount); d.section_id = None; d.company_id = (company or self.co).pk`; then set each `extra` attribute on `d`; return `d`.
- Use `engine.submit('zz_co', doc, user)` and `engine.open_task('zz_co', doc.pk)` (import `from workflow import engine`).

Write these tests (one method each):
- a) `test_company_assignment_is_recipient`: `co_lead = self.user('co_lead', 'wf_lead', company=self.co)`; also `self.user('sec_lead', 'wf_lead')` (section level) and `self.user('pr_lead', 'wf_lead', project=self.pr)` (project level). Submit `codoc()` by `self.member`. Assert `inst.section_id is None`, `inst.company_id == self.co.pk`, the open task step_key is `'lead_ok'` and `self.recipients(task) == {co_lead.pk}`.
- b) `test_other_company_never_recipient`: only `x_lead = self.user('x_lead', 'wf_lead', company=self.co2)` holds `wf_lead` at company level (the base setUp section-level `self.lead` exists but must not count); submit `codoc()`; the `lead_ok` step has no recipient so it is skipped: assert the open task (if any) has a step_key other than `'lead_ok'`, and `WorkflowTaskRecipient.objects.filter(user_id=x_lead.pk).exists()` is False and `WorkflowTaskRecipient.objects.filter(user_id=self.lead.pk).exists()` is False.
- c) `test_substitute_of_company_principal`: `co_lead` as in a); `deputy = self.user('deputy', 'wf_member', company=self.co)`; create `WorkflowSubstitute(principal=co_lead, substitute=deputy, company=None, start_date=today - 1 day, end_date=today + 3 days)` like the `sub` helper; submit `codoc()`; assert `self.recipients(task) == {co_lead.pk, deputy.pk}` and the deputy recipient row has `on_behalf_of_id == co_lead.pk`.
- d) `test_creator_rank_company_level`: `creator = self.user('co_boss_creator', 'wf_boss', company=self.co)`; `self.user('co_lead', 'wf_lead', company=self.co)`; `self.user('co_rev', 'wf_reviewer', company=self.co)`; submit `codoc()` by `creator`; assert `inst.creator_rank == 40` and `inst.skip_plan.get('lead_ok') == 'creator_level'`. Then a second creator with `wf_boss` only at SECTION level (`self.user('sec_boss_creator', 'wf_boss')`) submits another `codoc()`: assert `inst2.creator_rank == 0` and `'lead_ok' not in inst2.skip_plan`.
- e) `test_company_threshold_only_same_company`: `self.user('co_lead', 'wf_lead', company=self.co)`; create `WorkflowThreshold(workflow_key='zz_co', step_key='lead_ok', company=self.co2, amount=Decimal('1000'))`; submit `codoc(Decimal('100'))`; assert `'lead_ok' not in inst.skip_plan`. Then create `WorkflowThreshold(workflow_key='zz_co', step_key='lead_ok', company=self.co, amount=Decimal('500'))` and submit a new `codoc(Decimal('100'))`: assert `inst2.skip_plan['lead_ok'] == 'threshold'`.
- f) `test_required_false_skips_with_reason`: `self.user('co_lead', 'wf_lead', company=self.co)`; submit `codoc(need_boss=False)`; assert `inst.skip_plan.get('boss_ok') == 'not_required'` and `{'step': 'boss_ok', 'reason': 'not_required'}` is in the SUBMIT history row `skipped`. Submit `codoc(need_boss=True)`: assert `'boss_ok' not in inst2.skip_plan`. Also assert `'not_required' in SKIP_REASON_TITLES` (`from workflow.serializers import SKIP_REASON_TITLES`).
- g) `test_section_document_unchanged`: the default base spec `WF` (from base.py) with `self.doc()` submitted by `self.member`; `co_only = self.user('co_only', 'wf_lead', company=self.co2)`; assert `inst.section_id == self.sec.pk`, the open task step is `'lead_ok'`, `self.lead.pk in self.recipients(task)` and `co_only.pk not in self.recipients(task)`.
- h) `test_validate_specs_rejects_bad_specs`: `from workflow.registry import validate_specs`; `validate_specs([make_spec(key='zz_bad1', steps=(dataclasses.replace(STEPS[1], required=lambda o: True),))])` raises `django.core.exceptions.ImproperlyConfigured` (required on a REVIEW step); `validate_specs([make_spec(key='zz_bad2', section_field=None, company_field=None)])` raises `ImproperlyConfigured`; `validate_specs([make_spec(key='zz_ok', section_field=None, company_field='company')])` returns a dict with key `'zz_ok'`.

4. Tool policy: only reading the listed files, writing the test file, the test command below, `git add` of that file, `git commit`, `git status --short`. Test command, in `backend`: `set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test workflow.tests.test_company_level_36 --keepdb` (always with the label; never run `manage.py test` without a label). If a test fails, read the error, fix the test (not production code), and rerun at most 5 times.

5. Before finishing: all 8 tests pass; commit only that file with the message `test(release-v1 3.6-b): company-level workflow tests`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 3.6-c: petty cash company-level workflow API tests

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_petty_cash_workflow_36.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_petty_cash_workflow_36.py --contains "WorkflowThreshold" --contains "return_for_fix" --contains "CompanyFiscalPeriod" --contains "request-charge" --contains "reject-line" --absent "skip(" --absent "expectedFailure"
verify: set DB_TEST_NAME=test_agy_pc36c&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_petty_cash_workflow_36 --min-tests 7
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 3.6-c): petty cash workflow API tests"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly one new file: `backend/modules/accounting/personnel/test_petty_cash_workflow_36.py`. Change no other file (never touch `scripts/automation/*`). Never change production code. If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- No `skip` and no `expectedFailure`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in commit `feat(release-v1 3.6-c)`; read these ranges only):
- `backend/modules/accounting/personnel/test_petty_cash_smoke_36c.py` fully (about 125 lines). COPY its imports, its `setUp`, and its helpers `user`, `call`, `act`, `step` into your new class (same companies `self.co`/`self.co2`, users `self.emp` custodian, `self.acc` accountant, `self.mgr` manager, `self.trs` treasurer, `self.outsider` in the other company, account `self.account` with `ceiling_amount=Decimal('1000000')`). Use different usernames prefix `pc36w_` and company codes `PW36`/`PW36X` to avoid clashes.
- `backend/modules/accounting/personnel/workflows.py:140-340` (petty cash specs: workflow keys `PETTY_CHARGE_WORKFLOW` and `PETTY_STATEMENT_WORKFLOW`; step keys `accountant_review`, `manager_ok`, `treasury_pay`; `_charge_needs_manager`, `_charges_in_flight`, `_release_statement_lines`).
- `backend/modules/accounting/personnel/views_domains/treasury_views.py:900-990` (expense create/update rules) and `:1340-1400` (statement create from `line_ids`).
- `backend/modules/accounting/personnel/test_fiscal_period_32.py:50-53` (how a `CompanyFiscalPeriod` row is created) and `backend/modules/accounting/personnel/test_fiscal_lock_api_32.py:56-74` (expense payload shape; helper `expense_head_id` from `personnel.scoped_test_support`).
- `backend/core/workflow/engine.py`: `def return_for_fix(user, task, reason, obj=None, *, revision=None)` and `def act(user, task, *, reason='', revision=None, obj=None)`. Model `WorkflowThreshold` in `backend/core/workflow/models.py` (grep `class WorkflowThreshold`; fields `workflow_key`, `step_key`, `company`, `amount`).

3. Task — `class PettyCashWorkflowTests(TestCase)` with these tests (one method each):
- a) `test_charges_in_flight_count_toward_ceiling`: custodian requests charge 600000 via `POST {TX}request-charge/` (201); accountant acts → step is `treasury_pay` (under ceiling). A second request of 600000 while the first is unpaid: after accountant acts, step is `manager_ok` (600000 in flight + 600000 > 1000000).
- b) `test_statement_under_company_threshold_skips_manager`: create `WorkflowThreshold(workflow_key=PETTY_STATEMENT_WORKFLOW, step_key='manager_ok', company=self.co, amount=Decimal('500000'))`; build two draft expense lines by ORM (copy the `PettyCashTransaction.objects.create(...)` call of the smoke test) of 100000 each; `POST ST {'line_ids': [...]}` (201); accountant acts → step `treasury_pay`. Then a second statement with one line of 900000 → after accountant acts, step `manager_ok`.
- c) `test_whole_statement_return_frees_open_lines_keeps_rejected`: statement with two lines; accountant rejects line 1 with a reason via `reject-line`; then `wf_engine.return_for_fix(self.acc, wf_engine.open_task(PETTY_STATEMENT_WORKFLOW, st_id), 'fix')`; refresh lines: line 2 has `statement_id is None` and `line_status == 'open'`; line 1 still has `line_status == 'rejected'` and `self.account.debt == line1.amount`. No `PettyCashTransaction` row was deleted (count unchanged).
- d) `test_custodian_records_expense_only_on_own_account`: a second employee `other = self.user('other', 'employee', ['perm_petty_cash_manage'])` posts an expense to `TX` with `account: self.account.pk` (payload shape like the fiscal test, without `section`, with `transaction_type: 'expense'`) → status 400 or 403 and no row created for `self.account` by `other`. The custodian `self.emp` posting the same payload on own account → 201 (if `expense_head` is required, read the 400 error and supply a valid head following `scoped_test_support`).
- e) `test_expense_in_closed_period_rejected`: create `CompanyFiscalPeriod(company=self.co, fiscal_year='1405', title='x', start_date='1405/01/01', end_date='1405/12/29', status='closed', is_active=False)`; custodian posts an expense dated `1405/08/01` → 400 and the error JSON mentions `transaction_date_shamsi`.
- f) `test_other_company_user_cannot_see_or_act_on_statement`: statement created by the custodian; `self.outsider` with header company `self.co2`: `GET {ST}` list does not contain it, `GET {ST}{id}/` is 404 or 403, `POST {ST}{id}/reject-line/` is 404 or 403 and the line stays `open`.
- g) `test_expense_optional_section_and_other_company_section_rejected`: expense without section and project → 201 (company-level). With a `section` of a `ProjectSection` belonging to `self.co2` (create `Project`/`ProjectSection` the way `personnel.scoped_test_support` or other personnel tests do — grep `ProjectSection.objects.create` in `backend/modules/accounting/personnel/test_*.py` and copy one) → 400.

4. Tool policy: only reading the listed files, grep in `backend/modules/accounting/personnel/`, writing the test file, the test command below, `git add` of that file, `git commit`, `git status --short`. Test command, in `backend`: `set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test personnel.test_petty_cash_workflow_36 --keepdb` (always with the label; never run `manage.py test` without a label). If a test fails, read the error, fix the test (not production code), and rerun at most 5 times.

5. Before finishing: all 7 tests pass; commit only that file with the message `test(release-v1 3.6-c): petty cash workflow API tests`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 3.6-d: petty cash frontend spec (charge request, statement builder, line reject, permissions, deep links)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/employee/employee-petty-cash/employee-petty-cash-36d.spec.ts"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-petty-cash/employee-petty-cash-36d.spec.ts --min-tests 7 --require "requestPettyCashCharge" --require "createPettyCashStatement" --require "rejectPettyCashStatementLine" --require "canEditCeiling" --require "isServerUnreachable"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include src/app/modules/accounting/components/finance/employee/employee-petty-cash/employee-petty-cash-36d.spec.ts --max-failed 0
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 3.6-d): petty cash frontend spec"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly one new file: `frontend/src/app/modules/accounting/components/finance/employee/employee-petty-cash/employee-petty-cash-36d.spec.ts`. Change no other file (never touch `scripts/automation/*`). Never change production code. If a test fails because of production code, keep the test, mark it `it.fails(...)` with a one-line comment, and say so in the report.
- No `it.skip`, `it.only`, `describe.skip`, `describe.only`; do not import `fs` or `path`. Plain Vitest spec with the jsdom header, no TestBed (same style as the existing spec).
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in commit `feat(release-v1 3.6-d)`; read these ranges only):
- `frontend/src/app/modules/accounting/components/finance/employee/employee-petty-cash/employee-petty-cash.spec.ts` lines 1-200: COPY its header, imports, sample data and the whole `beforeEach` (mocks `mockAuth`, `mockPersonnelApi`, `mockToast`, `mockCdr`, `mockRoute`, `mockRouter` and the `new EmployeePettyCashHubComponent(...)` call) into your new file. Read lines 200-355 only to see how existing tests are written; do not duplicate them.
- `frontend/src/app/modules/accounting/components/finance/employee/employee-petty-cash/employee-petty-cash.ts`: lines 240-262 (`hasPerm`, `errorText`), 252-254 (`canEditCeiling`, `canTreasuryPay`, `canReviewLines`), 337-360 (`saveCeiling`), 438-450 (`isOpenExpense`, `canModifyExpense`), 728-860 (`openChargeModal`, `submitCharge`, `resendCharge`, `toggleLine`, `toggleAllLines`, `createStatement`, `resendStatement`, `selectedTotal`), 858-1010 (`openDetail`, `loadDetail`, `canRejectLines`, `startRejectLine`, `confirmRejectLine`, `payDetail`), and 203-240 (`ngOnInit`, query params `charge` / `statement`).
- `frontend/src/app/modules/accounting/api/personnel-api.service.ts`: grep `PettyCash` for the exact method names (e.g. `requestPettyCashCharge`, `createPettyCashStatement`, `rejectPettyCashStatementLine`) and their arguments. Every API method your tests trigger must exist on `mockPersonnelApi` as `vi.fn()` returning `of(...)` or `throwError(...)`.
- `frontend/src/app/core/services/server-reachability.ts`: function `isServerUnreachable` (which HTTP statuses count as unreachable).

3. Task — `describe('EmployeePettyCashHubComponent 3.6-d', ...)` with these tests (one `it` each):
- a) charge request: set the charge amount the way `submitCharge` reads it (see lines 728-775), call `submitCharge()`; expect `requestPettyCashCharge` called once with the amount in the unit the component sends, and a success toast.
- b) charge request offline: `requestPettyCashCharge` returns `throwError(() => ({ status: 0 }))` (a status that `isServerUnreachable` treats as unreachable; import `isServerUnreachable` and assert it is true for that error first); call `submitCharge()`; expect an error toast and NO retry/queue call (no `createPettyCashTransaction` call).
- c) statement builder: transactions with two open draft expenses and one expense already in a statement; `openExpenses` contains only the two open ones; `toggleLine` both, `selectedTotal` equals their sum; `createStatement()` calls `createPettyCashStatement` with `line_ids` of exactly those two ids.
- d) `canModifyExpense` is false for an expense with `is_locked: true`, for one with `statement` set, and for one with status not `draft`; true for an open unlocked draft.
- e) ceiling permission: with auth permissions lacking `perm_manager_payment_authorize`, `canEditCeiling` is false and `saveCeiling()` calls no update API; with that permission it is true (follow how `hasPerm` reads permissions from `mockAuth`).
- f) line reject: open a statement detail (`openDetail('statement', id)` with the API mock returning a statement owned by another custodian and with lines), user has `perm_invoice_review`; `startRejectLine(line)` then `confirmRejectLine()` with an empty reason must NOT call `rejectPettyCashStatementLine`; with a reason it calls it with the statement id, line id and reason.
- g) deep link: `mockRoute.queryParams = of({ statement: '7' })` before `ngOnInit()` → the statement detail for id 7 is loaded (the statement get API called with 7); same for `{ charge: '9' }` opening the charge detail.

4. Tool policy: only reading the listed files, writing the spec file, the test command below, `git add` of that file, `git commit`, `git status --short`. Test command, in `frontend`: `npx ng test --watch=false --include=src/app/modules/accounting/components/finance/employee/employee-petty-cash/employee-petty-cash-36d.spec.ts`. If it fails, read the error, fix the spec (not production code), and rerun at most 5 times.

5. Before finishing: all tests pass (or are marked `it.fails` with a reason); commit only that file with the message `test(release-v1 3.6-d): petty cash frontend spec`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any `it.fails` with the reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 stage 3 close-out on the local app environment: backup, apply the stage-3 migrations, patched frontend build; the runner restarts Daphne and the GDrive worker and runs the health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: backend\venv\Scripts\python.exe -X utf8 backend\manage.py migrate --check
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
- Do not run `run_auto_backup`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `backend/backups/` or `frontend/dist/`.

2. Context: Release v1 stage 3 (steps 3.1 to 3.6) changed backend and frontend code. These ten migrations are unapplied on the app database: `contacts 0001_initial`, `personnel 0007_counterparty_party_expand`, `personnel 0008_counterparty_party_copy`, `personnel 0009_counterparty_party_contract`, `personnel 0010_fiscal_period_no_frozen`, `personnel 0011_company_bank_opening_balance`, `personnel 0012_expense_heads`, `personnel 0013_accounting_permissions_35`, `personnel 0014_petty_cash_company_level`, `workflow 0004_instance_section_optional`. They were reviewed for data loss. The app database holds test data only. Your terminal may be PowerShell; if so, set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order:
- a) Backup. In `backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app stage 3 close-out'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0. Do not continue without a successful backup.
- b) Migration list. `.\venv\Scripts\python.exe manage.py showmigrations --plan` and note every `[ ]` line.
- c) Migrate. `.\venv\Scripts\python.exe manage.py migrate --noinput`. If it fails, stop and report the last 40 lines of the error; do not try to fix it, and never fake or skip migrations.
- d) Check. `.\venv\Scripts\python.exe manage.py migrate --check` exits 0, and `.\venv\Scripts\python.exe manage.py check` prints no errors.
- e) Frontend build. In `frontend`, run `npx ng build --delete-output-path=false` in the foreground and wait for it to finish, then run `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.

4. Tool policy: only the commands above and `git status --short`. Run the build at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the backup filename and size, the `[ ]` migrations found in step b, the migrate result, the build result (errors and warnings count) and the patch script line. Write the report only after the build and the patch have finished. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 stage 3: bring the public app URL back (Express on port 4200 and the Cloudflare tunnel are not running)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Do not edit, create, stage or commit any file. Do not run `git` commands that change the working tree or history.
- Do not stop or restart Daphne (port 8000), the GDrive worker or PostgreSQL. Do not run `taskkill`. Do not rebuild the frontend; `frontend/dist/` is already built and patched.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`.

2. Context: after the stage-3 release, `http://127.0.0.1:8000/api/public/config/` returns 200, but nothing listens on port 4200 and no `cloudflared.exe` process runs, so `https://app.farsalish.ir/` returns 530 (Cloudflare cannot reach the origin).

3. Task, in this order:
- a) Check: `netstat -ano | findstr ":4200"` and `tasklist /FI "IMAGENAME eq cloudflared.exe"`. Start only what is missing.
- b) If port 4200 has no listener, open a Windows Terminal tab that keeps running after your turn (run in the project root; in PowerShell keep the quoting exactly):
  `wt.exe -w 0 new-tab -d "E:\comanager\frontend" --title "Frontend SSR (4200)" cmd /k "node server.js"`
- c) If no `cloudflared.exe` runs, open another tab:
  `wt.exe -w 0 new-tab -d "E:\comanager" --title "Cloudflare Tunnel" cmd /k "npx cloudflared tunnel run --protocol http2 --url http://localhost:4200 warehouse"`
- d) Wait about 20 seconds (use `timeout /t 20 /nobreak` or `Start-Sleep -Seconds 15` twice), then confirm port 4200 listens and `cloudflared.exe` runs. Then check `https://app.farsalish.ir/` and `https://app.farsalish.ir/api/public/config/` with a Python `urllib.request` call that sends a browser `User-Agent` header; both must return 200. If 530 persists after about one minute, report the last 20 lines visible in the tunnel tab is not possible, so instead report the tasklist and netstat output.

4. Tool policy: only the commands above and `git status --short`. Do not repeat a failing command unchanged.

5. Output and stop condition: a short English report with what was missing, what you started, and the two HTTP status codes. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.1-a: expense invoice lines, VAT, duplicate warning and internal number API tests

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_invoice_lines_41.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_invoice_lines_41.py --contains "duplicate_reason_required" --contains "duplicates/" --contains "vat_manual" --contains "IssuedNumber" --contains "HeadFixtures" --absent "skip(" --absent "expectedFailure"
verify: set DB_TEST_NAME=test_agy_inv41a&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_invoice_lines_41 --min-tests 9
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.1-a): invoice lines, VAT, duplicate and number API tests"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly one new file: `backend/modules/accounting/personnel/test_invoice_lines_41.py`. Change no other file (never touch `scripts/automation/*`). Never change production code. If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- No `skip` and no `expectedFailure`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in commit `feat(release-v1 4.1-a)`; read these only):
- `scratch/a2_smoke_test.py` fully (about 100 lines). It is a working throwaway test. COPY its imports, its base class `HeadFixtures` (imported from `personnel.test_expense_heads_34`, which also gives `INVOICES`, `self.api`, `self.company`, `self.sec`, `self.cp`, `self.head`) and its `body()` helper into your new class `InvoiceLines41Tests(HeadFixtures)`. Its numbers are proven: lines 2.5 x 1001 and 1 x 500, discount 101, VAT 10 percent gives subtotal 3003, vat_amount 290, amount 3192.
- `backend/modules/accounting/personnel/test_expense_heads_34.py`: the `HeadFixtures` class only (grep `class HeadFixtures`, read about 60 lines) to see which users, companies, heads and helpers exist (for a second company and a member without invoice permission, reuse what the smoke test does).
- `scratch/handoff_4_1_a2.md` sections "Files changed" (exact API names: endpoint `expense-invoices/duplicates/?counterparty=&invoice_number=&exclude=` with response keys `count`, `hidden_count`, `matches`; submit `POST {INVOICES}{id}/submit/` with optional `duplicate_reason`; 400 code `duplicate_reason_required`; series key `accounting.expense_invoice`; setting `accounting.vat_rate`).
- `backend/modules/accounting/personnel/invoice_services.py` fully (about 130 lines).

3. Task — `class InvoiceLines41Tests(HeadFixtures)` with these tests (one method each):
- a) `test_totals_computed_on_server_client_totals_ignored`: POST the smoke body plus `'subtotal': '1', 'amount': '1'`; 201; `subtotal` 3003, `vat_amount` 290, `amount` 3192, two lines with `line_amount` 2503 and 500.
- b) `test_discount_above_subtotal_rejected`: discount 999999 → 400 with key `discount_amount`.
- c) `test_line_count_limits`: `lines: []` → 400; 101 lines (each qty 1, unit_price 1, same head) → 400; 100 lines → 201.
- d) `test_line_head_of_other_company_or_group_rejected`: a line with a head of another company → 400 with key `lines`; a line with a group head (a head without parent, see `HeadFixtures`) → 400.
- e) `test_edit_replaces_lines_fully`: create with two lines; PATCH with `lines` of one line (qty 3, unit_price 100); response has exactly 1 line, `subtotal` 300; `ExpenseInvoiceLine.objects.filter(invoice_id=id).count() == 1`.
- f) `test_manual_vat_and_rate_snapshot`: create (vat 290, `vat_manual` False, `vat_rate` 10); PATCH `vat_amount` 300 → `vat_manual` True and `amount` 3202; PATCH `vat_amount` 999999 → 400. Then change the company VAT rate setting to 20 the way `invoice_services.company_vat_rate` reads it (`get_company_setting`; find the setter in `backend/core/settings_core/company_settings.py`, grep `def set_company_setting` or the model it reads); the already saved invoice in the DB still has `vat_rate` 10 (refresh_from_db).
- g) `test_duplicate_create_never_rejected_submit_needs_reason`: create invoice A with `invoice_number` "12-34" (201); create invoice B, same counterparty, `invoice_number` written with Persian digits and a dash (use the same string as the smoke body) and a different `invoice_date_shamsi` year `1404/05/01` (201, `possible_duplicate` True). `GET duplicates/?counterparty=<cp>&invoice_number=1234&exclude=<B>` → `count` 1. `POST submit/` on B without reason → 400 with `code == 'duplicate_reason_required'`; with `{'duplicate_reason': 'second copy'}` → 200; B `duplicate_reason == 'second copy'`; the latest `WorkflowStep` with action submit of B's instance has `'second copy'` in its `reason` (see `_record_submit_reason` in `views_domains/treasury_views.py`, grep it).
- h) `test_rejected_invoice_not_counted_and_hidden_details`: set invoice A `status='rejected'` by ORM update; duplicates for B's number → `count` 0. Then (status back to `draft`) a company member without invoice permission (copy how the smoke test builds it) gets `count` 1, `hidden_count` 1, `matches == []`.
- i) `test_number_at_first_submit_kept_and_voided_on_delete`: create; `number` is ''; submit → 200, response `number` not empty and `IssuedNumber` row exists; cancel or return as the smoke test does, submit again → same `number`; after the smoke test's path that brings it back to draft, DELETE → 204 and the `IssuedNumber` row still exists with its voided state (check the field the smoke test checks; never deleted).

4. Tool policy: only reading the listed files, grep in `backend/modules/accounting/personnel/` and `backend/core/settings_core/`, writing the test file, the test command below, `git add` of that file, `git commit`, `git status --short`. Test command, in `backend`: `set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test personnel.test_invoice_lines_41 --keepdb` (always with the label; never run `manage.py test` without a label). If a test fails, read the error, fix the test (not production code), and rerun at most 5 times.

5. Before finishing: all 9 tests pass; commit only that file with the message `test(release-v1 4.1-a): invoice lines, VAT, duplicate and number API tests`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.1-b: expense invoice instalment payment API tests

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_invoice_payments_41.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_invoice_payments_41.py --contains "creator_cannot_pay" --contains "payments_exist" --contains "void_after_full_payment" --contains "amount_exceeds_remaining" --contains "payment_required" --contains "assertNumQueries" --absent "skip(" --absent "expectedFailure"
verify: set DB_TEST_NAME=test_agy_inv41b&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_invoice_payments_41 --min-tests 10
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.1-b): invoice instalment payment API tests"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly one new file: `backend/modules/accounting/personnel/test_invoice_payments_41.py`. Change no other file (never touch `scripts/automation/*`). Never change production code. If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- No `skip` and no `expectedFailure`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in commit `feat(release-v1 4.1-b)`; read these only):
- `backend/modules/accounting/personnel/test_invoice_payments_smoke_41b.py` fully (about 145 lines). It is a working test. COPY its imports, its `setUp` and its helpers (`user`, `post`, `payable_invoice`, `pay`) into your new class `InvoicePayments41Tests(TestCase)`. Do not import from the smoke file; copy.
- `scratch/handoff_4_1_b.md` section "API" (exact endpoints, request fields, error codes and messages).
- `backend/modules/accounting/personnel/invoice_payments.py` fully (about 240 lines).
- For the delegate test: grep `def ` in `backend/core/workflow/engine.py` for the substitute/delegate model or helper, and grep `Substitut` in `backend/core/workflow/models.py` (read only the model class).
- For the closed fiscal period test: grep `def ensure_period_open` in `backend/modules/accounting/personnel/fiscal.py` and read it plus the model it reads (grep `class FiscalPeriod` in `backend/modules/accounting/personnel/`).

3. Task — `class InvoicePayments41Tests(TestCase)` with these tests (one method each):
- a) `test_two_instalments_partial_then_paid`: invoice 1000; pay 400 → 201, status `partially_paid`, `remaining` "600"; pay 600 → 201, status `paid`, `remaining` "0"; workflow instance of the invoice is no longer in progress (`wf_engine.instance_of(INVOICE_WORKFLOW, id)`).
- b) `test_amount_over_remaining_rejected`: pay 400, then pay 700 → 400 with `code == 'amount_exceeds_remaining'`; `InvoicePayment` count stays 1.
- c) `test_creator_cannot_pay_even_with_treasurer_perm`: give the invoice creator the treasurer permissions exactly as the smoke test gives them to the treasurer; POST payments → 403 with `code == 'creator_cannot_pay'`.
- d) `test_delegate_of_treasurer_can_pay`: create a valid-today substitute of the treasurer (model found in step 2); the substitute posts a payment → 201.
- e) `test_return_and_cancel_blocked_after_instalment`: pay 400; `POST request-revision/` (with a reason as the smoke test does) → 409 `code == 'payments_exist'`; `POST cancel/` → 409 same code.
- f) `test_void_with_reason_restores_remaining_and_void_after_full_blocked`: pay 400; void without reason → 400; void with reason → 200, `remaining` "1000", status `ready_to_pay`; pay 1000 → `paid`; void that last payment → 409 `code == 'void_after_full_payment'`.
- g) `test_closed_period_and_foreign_bank_accounts_rejected`: payment with `payment_date_shamsi` inside a closed fiscal period → 400 with key `payment_date_shamsi`; `company_bank_account` of another company → 400 with key `company_bank_account`; `party_bank_account` of another counterparty's party → 400 with key `party_bank_account`.
- h) `test_company_bank_account_has_movements_after_payment`: after one payment, `bank_account_has_movements(account)` (grep it in `backend/modules/accounting/personnel/company_bank.py`) is True.
- i) `test_generic_act_without_payment_does_not_close`: on a payable invoice with no payment, call `wf_engine.act(treasurer, wf_engine.open_task(INVOICE_WORKFLOW, id))` inside `assertRaises(WorkflowError)` (from `workflow.errors`) and check the error code is `payment_required`; invoice status stays `ready_to_pay`.
- j) `test_legacy_pay_pays_whole_remaining`: pay 300 via payments/, then `POST pay/` with `tracking_code` → 200, status `paid`, the second `InvoicePayment` has amount 700.
- k) `test_party_sheba_masked_without_sensitive_perm`: create a `PartyBankAccount` for the counterparty's party with a Sheba (copy fields from any existing test: grep `PartyBankAccount.objects.create` in `backend/modules/accounting/personnel/`), pay with `party_bank_account`; GET payments/ as a user without the sensitive-bank permission → `party_sheba_number` does not contain the full Sheba (starts with `*`).
- l) `test_outsider_gets_404`: a user of another company (copy how the smoke test builds users; give them a different company) → GET payments/ → 404, POST payments/ → 404, GET `/api/print/expense_invoice/{id}/pdf/` → 404.
- m) `test_list_query_count_constant`: create 30 invoices with 3 lines each (bulk via ORM like the smoke `payable_invoice` helper does, no workflow needed), GET the list with `?page=1` and record `len(connection.queries)` using `CaptureQueriesContext`; then create 30 more and assert with `assertNumQueries(<recorded number>)` that the same request uses the same number of queries.

4. Tool policy: only reading the listed files, grep in `backend/modules/accounting/personnel/` and `backend/core/workflow/`, writing the test file, the test command below, `git add` of that file, `git commit`, `git status --short`. Test command, in `backend`: `set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test personnel.test_invoice_payments_41 --keepdb` (always with the label; never run `manage.py test` without a label). If a test fails, read the error, fix the test (not production code), and rerun at most 5 times.

5. Before finishing: all 13 tests pass; commit only that file with the message `test(release-v1 4.1-b): invoice instalment payment API tests`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.1-c: invoice payment modal and lines form DOM specs, glossary

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-invoices/treasurer-invoices-payments.dom.spec.ts" --allow "frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-lines.dom.spec.ts" --allow "Documents/Release_v1/glossary.md"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-invoices/treasurer-invoices-payments.dom.spec.ts --min-tests 6 --require "TestBed" --require "addInvoicePayment" --require "voidInvoicePayment"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-lines.dom.spec.ts --min-tests 5 --require "TestBed" --require "submitExpenseInvoice"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-invoices/treasurer-invoices-payments.dom.spec.ts --absent "it.skip" --absent "describe.skip" --absent "it.todo"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-lines.dom.spec.ts --absent "it.skip" --absent "describe.skip" --absent "it.todo"
verify: python scripts/automation/verify_tools.py text-check --file Documents/Release_v1/glossary.md --contains "partially_paid" --contains "InvoicePayment" --contains "is_voided" --contains "vat_applicable" --contains "possible_duplicate"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/treasurer/treasurer-invoices/*.spec.ts" --include "src/app/modules/accounting/components/finance/employee/employee-invoices/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.1-c): invoice payment modal and lines form DOM specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly two new spec files and edit one doc file (paths below). Change no other file (never touch `scripts/automation/*`). Never change production code (`*.ts` that is not `*.spec.ts`, `*.html`). If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- No `it.skip`, `describe.skip`, `it.todo`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in commit `e9488532 feat(release-v1 4.1-c)`; read these only):
- TestBed pattern to COPY (imports, `initTestEnvironment`, `resetTestingModule`, `configureTestingModule` with `providers` of mocks, `createComponent`, `detectChanges`): `frontend/src/app/modules/accounting/components/personnel/manager-approvals/manager-approvals.dom.spec.ts` lines 1-150.
- Treasurer component: `frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-invoices/treasurer-invoices.ts` (constructor at line ~106; payment modal code lines ~266-575: `payInvoice`, `submitPayment`, `handlePayError`, `askVoid`, `onVoidConfirmed`, `needsCompanyAccount`) and its template `treasurer-invoices.html` (search for `pay-amount`, `pay-company-account`, `pay-tracking`, `app-workflow-reason-dialog`). Existing unit spec `treasurer-invoices.spec.ts` shows the mock shapes for `PersonnelApiService` (`getTreasuryCartable` etc.).
- Employee component: `frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices.ts` (form/lines/totals lines ~470-760, submit ~968-1020) and template `employee-invoices.html` lines ~400-570 (lines table, discount, VAT, duplicate warning `duplicateInfo`) and ~940-954 (duplicate reason dialog). Existing unit spec `employee-invoices.spec.ts` shows the mocks (`mockTreasuryOrgApi` with `getExpenseInvoicesPage`, `getExpenseInvoiceDuplicates`, `submitExpenseInvoice`).
- API shapes: `scratch/handoff_4_1_b.md` section "API" (payments list `{results, paid_amount, remaining}`, add payment result `{message, paid_amount, remaining, ...}`, error 400 field dict, 409 `{code, error}`).
- Services to mock by class token in `providers`: `PersonnelApiService`, `TreasuryOrgApiService`, `CompanyApiService`, `PrintService`, `ToastService`, `AuthService`, `StateService`, `ActivatedRoute`, `Router`, `ConfirmDialogService` (Grep the import paths in the two component files). `CompanyApiService.getBankAccounts` returns `of([{ id: 5, bank_name: 'Mellat', account_title: 'Main', is_primary: true, is_active: true }])`.

3. Task A — new file `frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-invoices/treasurer-invoices-payments.dom.spec.ts` (`// @vitest-environment jsdom` first line). The treasury cartable mock returns one invoice `{ id: 7, invoice_number: 'F-7', number: 'INV-1405-0007', amount: 1000000, paid_amount: '400000', remaining: '600000', status: 'partially_paid', counterparty: null }`. One `it` each:
- a) the row shows the label for `partially_paid` and a button whose text contains the payment label; clicking it opens the modal (`app-modal` content visible) and calls `getInvoicePayments(7)`; the amount input default equals the remaining 600000.
- b) the payments list renders one row per payment from `getInvoicePayments` (two payments, one with `is_voided: true` shown with class `line-through` on its amount cell).
- c) with method `cash` the company account select (`#pay-company-account`) is not rendered; with `transfer` it is rendered.
- d) submitting with an empty tracking code shows the field error element `#pay-tracking-err` and does not call `addInvoicePayment`.
- e) a valid submit calls `addInvoicePayment(7, body)` with `amount`, `payment_date_shamsi`, `tracking_code`, `method`, `company_bank_account: 5`; when the result has `remaining: '0'` the modal closes.
- f) a 400 response `{ amount: ['too much'] }` shows `#pay-amount-err` with that text; a 409 `{ code: 'void_after_full_payment', error: 'X' }` on void shows `X` in the reason dialog (`serverError`).
- g) clicking the void button of a payment opens the reason dialog; confirming with a reason calls `voidInvoicePayment(7, paymentId, reason)`.
- h) the component source has no `window.prompt` call for invoices: read nothing from disk; instead assert `vi.spyOn(window, 'prompt')` is never called during a) to g) (put the spy in `beforeEach`).

4. Task B — new file `frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices-lines.dom.spec.ts`. Open the new invoice modal through `component.openNewInvoiceModal()` then `fixture.detectChanges()`. One `it` each:
- a) the lines table renders one row; clicking the add-line button renders two rows; the remove button of row 2 removes it.
- b) setting two lines (quantity × unit price) updates the displayed subtotal and payable total text (Persian digits: compare with `component.formatNumber(value)`).
- c) turning the VAT checkbox on shows the VAT amount input; turning it off hides it.
- d) when `getExpenseInvoiceDuplicates` returns `{ count: 1, results: [...] }` after `onDuplicateKeyChange()` and `vi.advanceTimersByTime(500)` (fake timers), the duplicate warning block is rendered.
- e) `submitExpenseInvoice` returning 400 `{ code: 'duplicate_reason_required' }` opens `app-workflow-reason-dialog` (`open` true); confirming calls `submitExpenseInvoice(id, reason)`.
- f) `window.prompt` is never called (spy in `beforeEach`).

5. Task C — `Documents/Release_v1/glossary.md`: add five rows at the end of the existing table (before the closing `</div>`), same 4 columns as the rows above (term, simple definition, words to avoid, code name):
- «پرداخت ناقص» — invoice with some instalments paid and some amount remaining — `status='partially_paid'`.
- «قسط» — one payment toward an invoice, with date, method, bank account and tracking code — `InvoicePayment`.
- «ابطال قسط» — cancelling a wrong instalment with a reason; the amount returns to the remaining; not allowed after full payment — `is_voided` / `void_reason`.
- «مشمول مالیات» — invoice that carries value-added tax; the amount is suggested and can be changed by hand — `vat_applicable` / `vat_manual`.
- «شمارهٔ تکراری» — same supplier invoice number from the same counterparty already registered; submit needs a reason — `possible_duplicate` / `duplicate_reason`.
Write the definitions in simple Persian like the rows above.

6. Tool policy: only reading the listed files, Grep in `frontend/src/app/modules/accounting/` and `frontend/src/app/shared/`, writing the three files, the test command below, `git add` of those files, `git commit`, `git status --short`. Test command, in the repository root (it builds a temporary test config, so plain `ng test` is not used): `python scripts/automation/verify_tools.py ng-test-compare --base e9488532 --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/treasurer/treasurer-invoices/*.spec.ts" --include "src/app/modules/accounting/components/finance/employee/employee-invoices/*.spec.ts"`; the per-test log is `scratch/logs/runner/ngtest-head.log`. If a test fails, read the error, fix the test (not production code), and rerun at most 5 times.

7. Before finishing: all tests in both folders pass; commit only the three files with the message `test(release-v1 4.1-c): invoice payment modal and lines form DOM specs, glossary`; `git status --short` prints nothing.

8. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.
===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.2-b: petty cash scenario API tests

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_petty_cash_42.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_petty_cash_42.py --contains "opening_balance_locked" --contains "amount_exceeds_debt" --contains "payroll_not_available" --contains "offset_exceeds_charge" --contains "ceiling_exceeded_at_pay" --contains "period_locked" --contains "debt_open" --contains "reference_required" --contains "account_closed" --contains "petty_cash_statement" --absent "skip(" --absent "expectedFailure"
verify: set DB_TEST_NAME=test_agy_petty42b&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_petty_cash_42 --min-tests 8
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.2-b): petty cash scenario API tests"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly one new file: `backend/modules/accounting/personnel/test_petty_cash_42.py`. Change no other file (never touch `scripts/automation/*`). Never change production code. If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- No `skip` and no `expectedFailure`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in commits `feat(release-v1 4.2-b): petty cash B1` and `B2`; read these only):
- `backend/modules/accounting/personnel/test_petty_cash_smoke_36c.py` fully (about 340 lines). It is a working test. COPY its imports, the `setUp` and helpers of `PettyCashSmokeTests` (`user`, `call`, `act`, `step`), of `PettyCashSettlementSmoke42Tests` (`rejected_line`, `charge_at_pay` and its extra setUp lines) and of `PettyCashLifecycleSmoke42Tests` (`set_opening`, `draft_expense`, `expense_payload`) into your new class `PettyCash42Tests(TestCase)`. Do not import or subclass from the smoke file; copy.
- `scratch/handoff_4_2_b1.md` and `scratch/handoff_4_2_b2.md` (exact endpoints, request fields, error codes).
- Change after the handoffs: an old custodian whose account was closed and who has no active account gets 400 `account_closed` from `POST petty-cash-transactions/` without an `account` and from `request-charge` (no new account is auto-created). Deleting a charge that has a debt offset settlement returns 400 `has_settlements`.

3. Task — `class PettyCash42Tests(TestCase)` with these tests (one method each):
- a) `test_rejected_line_lowers_level_and_raises_debt`: set an opening balance of 500000 on the account; check `my-balance` `current_balance` includes it; make a rejected line of 100000 (helper `rejected_line`); `my-balance`: `current_balance` decreased by 100000 compared with before the rejection and `debt` == 100000, `rejected_total` == 100000.
- b) `test_opening_balance_locked_after_activity`: before any row the custodian-manager sets opening balance freely (200); after one row exists: a user without the manager permission PATCHes it → 403 `code == 'opening_balance_locked'`; the manager without `reason` → 400 `reason_required`; with `reason` → 200 and a `WorkflowAuditLog` row with action `petty_opening_balance_changed` exists.
- c) `test_cash_settlement_rules`: with debt 100000: the custodian POSTs a settlement → 403; the accountant POSTs cash 150000 → 400 `amount_exceeds_debt`; cash without `reference` → 400 `reference_required`; method `payroll` → 400 `payroll_not_available`; cash 100000 with reference → 201 status `done`; `my-balance` `debt` == 0 and `current_balance` unchanged by the settlement; void with reason → 200 and debt is 100000 again.
- d) `test_charge_offset_net_on_pay`: debt 100000; a charge of 300000 in flight (helper `charge_at_pay`); offset 400000 on it → 400 `offset_exceeds_charge`; offset 100000 → 201 `pending`; pay the charge (as the smoke test does) → settlement becomes `done`, `my-balance` `current_balance` rose by exactly 200000 and `debt` == 0.
- e) `test_ceiling_rechecked_at_pay`: copy the flow of the smoke test `test_ceiling_rechecked_at_pay` and also assert that after the 409 `ceiling_exceeded_at_pay` the charge status and `receipt_number` are unchanged.
- f) `test_reconciliation_period_lock`: reconciliation with counted cash lower than expected → 201, `difference` negative, `my-balance` `debt` equals the shortage; a second reconciliation with counted higher than expected → 201 and debt unchanged; POST an expense dated on/before the reconciled date → 400 `period_locked`; with a statement in flight a new reconciliation → 400 `work_in_flight`.
- g) `test_close_and_handover`: with debt > 0 close → 400 `debt_open`; after settling, close with fund level > 0 and no reference → 400 `reference_required`; on a second account handover to a new custodian → 201 and the sum of `petty_fund_level` (from `personnel.workflows`) of old and new accounts equals the old level before handover; PATCH the closed account → 400 `account_closed`; the old custodian POSTs an expense without account → 400 `account_closed`.
- h) `test_scope_print_and_masking`: a user of another company: GET `/api/personnel/petty-cash-settlements/` and `/api/personnel/petty-cash-reconciliations/` do not contain this company's rows; POST a settlement on this account → 404; GET `/api/print/petty_cash_statement/{statement_id}/pdf/` → 404. A plain company member without petty manage, treasurer or custodian role sees `sheba_number` masked (does not equal the stored value) in the account list, while the custodian sees the full value. Use a valid Sheba (grep `IR` in `backend/modules/accounting/personnel/test_company_bank_33.py` for one).

4. Tool policy: only reading the listed files, grep in `backend/modules/accounting/personnel/` and `backend/core/workflow/`, writing the test file, the test command below, `git add` of that file, `git commit`, `git status --short`. Test command, in `backend`: `set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test personnel.test_petty_cash_42 --keepdb` (always with the label; never run `manage.py test` without a label). If a test fails, read the error, fix the test (not production code), and rerun at most 5 times.

5. Before finishing: all 8 tests pass; commit only that file with the message `test(release-v1 4.2-b): petty cash scenario API tests`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.2-c: petty cash account manager DOM specs, glossary

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/accountant/accountant-petty-cash/petty-account-manager/petty-account-manager.dom.spec.ts" --allow "Documents/Release_v1/glossary.md"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-petty-cash/petty-account-manager/petty-account-manager.dom.spec.ts --min-tests 7 --require "TestBed" --require "createPettyCashAccount" --require "createPettyCashSettlement" --require "createPettyCashReconciliation" --require "closePettyCashAccount"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-petty-cash/petty-account-manager/petty-account-manager.dom.spec.ts --absent "it.skip" --absent "describe.skip" --absent "it.todo"
verify: python scripts/automation/verify_tools.py text-check --file Documents/Release_v1/glossary.md --contains "PettyCashDebtSettlement" --contains "PettyCashReconciliation" --contains "opening_balance" --contains "handover" --contains "net_amount"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/accountant/accountant-petty-cash/**/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.2-c): petty cash account manager DOM specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly one new spec file and edit one doc file (paths below). Change no other file (never touch `scripts/automation/*`). Never change production code (`*.ts` that is not `*.spec.ts`, `*.html`). If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- No `it.skip`, `describe.skip`, `it.todo`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in commits `7c82a9d1` and `27fd3612`; read these only):
- TestBed pattern to COPY (imports, `initTestEnvironment`, `resetTestingModule`, `configureTestingModule` with `providers` of mocks, `createComponent`, `detectChanges`): `frontend/src/app/modules/accounting/components/personnel/manager-approvals/manager-approvals.dom.spec.ts` lines 1-150.
- Component under test: `frontend/src/app/modules/accounting/components/finance/accountant/accountant-petty-cash/petty-account-manager/petty-account-manager.ts` (about 520 lines: injected services lines 70-76, state lines 78-125, permission getters `isManager` / `canManageAccounts` lines 125-131, `openCreate`, `openEdit`, `openSettle`, `openReconcile`, `openClose`, `saveAccount` ~324, `saveSettlement` ~367, `canVoid`, `openVoid`, `onVoidConfirmed`, `saveReconciliation` ~436, `saveClose` ~469, `saveHandover` ~492, `errorMessage`, the `ERROR_MESSAGES` map at the top of the file) and its template `petty-account-manager.html` (input ids start with `pam_`, e.g. `pam_opening_date`, `pam_reason`, `pam_card`, `pam_sheba`, `pam_settle_ref`, `pam_settle_charge`, `pam_rec_date`, `pam_close_ref`).
- Services to mock by class token in `providers`: `TreasuryOrgApiService` (`frontend/src/app/modules/accounting/api/treasury-org-api.service.ts`), `AuthService` (`user()` returns `{ id: 1, is_superuser: false }`, `userPermissions()` returns a permission array you choose per test), `ToastService`, `ActiveCompanyService` (`activeCompanyId: 3`). `NetworkStatusService.getInstance()` is a singleton: spy on it or make sure `isOnline` is true (set `component.isOnline = true` after create if needed).
- API mock returns: `getPettyCashAccounts` → `of([{ id: 11, company: 3, custodian: 5, custodian_name: 'Ali', ceiling_amount: 50000000, opening_balance: 0, debt: 2000000, is_closed: false }, { id: 12, company: 3, custodian: 6, custodian_name: 'Sara', ceiling_amount: 10000000, debt: 0, is_closed: true }])`; `getPettyCashBalance` → `of({ current_balance: 3000000, debt: 2000000, payroll_deduction_available: false, ceiling_amount: 50000000 })`; `getPettyCashSettlements` / `getPettyCashReconciliations` → `of([])`; `getPettyCashTransactions` → `of([])`. Error responses use `throwError(() => ({ status: 400, error: { code: 'X', error: 'msg' } }))`.

3. Task A — new file `frontend/src/app/modules/accounting/components/finance/accountant/accountant-petty-cash/petty-account-manager/petty-account-manager.dom.spec.ts` (`// @vitest-environment jsdom` first line). One `it` each:
- a) the list renders both accounts; the closed account shows the text «بسته‌شده» and has no settle/close buttons; the ceiling column text «سقف» is shown only when the user has `perm_manager_payment_authorize` (test both permission sets).
- b) account form: after `openEdit(account 11)`, setting an opening balance > 0 with an empty date and calling `saveAccount()` shows the date error in `modalError` and does not call `updatePettyCashAccount`; with a date it calls `updatePettyCashAccount(11, body)` where `body.opening_balance` is the number.
- c) account form: `updatePettyCashAccount` failing with 400 `{ code: 'reason_required' }` sets `modalError` to `ERROR_MESSAGES['reason_required']` (import nothing from the component file except the class; compare with a non-empty string and with the text the template renders).
- d) settlement: `openSettle(account 11)`; method `cash` with empty reference → `modalError` set and `createPettyCashSettlement` not called; with reference `R-1` and amount 1000000 → called with `{ account: 11, amount: 1000000, method: 'cash', reference: 'R-1', ... }`.
- e) settlement: when the balance has `payroll_deduction_available: false` the payroll method option is not rendered; when `true` it is rendered.
- f) reconciliation: `openReconcile(account 11)`; with date `1405/08/01` and counted 500000 `saveReconciliation()` calls `createPettyCashReconciliation({ account: 11, period_end_date: '1405/08/01', counted_cash: 500000, ... })`; a 400 `{ code: 'work_in_flight' }` shows the mapped Persian message in `modalError`.
- g) close: `openClose(account 11)` with fund level 3000000 and empty reference → `modalError` set, `closePettyCashAccount` not called; with reference → called with `(11, { reference: 'T-9', ... })`; a 400 `{ code: 'debt_open' }` shows the mapped message.
- h) void: `canVoid` is true for `{ status: 'pending', method: 'charge_offset' }` and for `{ status: 'done', method: 'cash' }`, false for `{ status: 'done', method: 'charge_offset' }` and `{ status: 'void' }`; `openVoid` then `onVoidConfirmed('wrong')` calls `voidPettyCashSettlement(id, 'wrong')`.
- Put `vi.spyOn(window, 'prompt')` in `beforeEach` and assert it is never called in `afterEach`.

4. Task B — `Documents/Release_v1/glossary.md`: add six rows at the end of the existing table (before the closing `</div>`), same 4 columns as the rows above (term, simple definition, words to avoid, code name):
- «تسویهٔ بدهی تنخواه» — paying back the custodian's debt to the company: cash deposit, deduction from the next charge, or deduction from salary — `PettyCashDebtSettlement`.
- «تطبیق دورهٔ تنخواه» — counting the custodian's real cash at a date and comparing it with the expected cash; a shortage becomes debt and older expense rows lock — `PettyCashReconciliation`.
- «موجودی اولیه تنخواه» — the amount already with the custodian when the account is defined; changing it after the first activity needs a manager and a reason — `opening_balance` / `opening_balance_date`.
- «تحویل تنخواه» — moving the remaining fund from the old custodian to a new one; the old account closes — `handover` / `handover_from` / `handover_to`.
- «خالص واریز شارژ» — charge amount minus the debt deducted from it; this is what the treasurer pays — `net_amount` / `offset_total`.
- «حساب بستهٔ تنخواه» — a petty cash account that was closed; it is read-only and never reopens — `is_closed` / `closed_at`.
Write the definitions in simple Persian like the rows above.

5. Tool policy: only reading the listed files, Grep in `frontend/src/app/modules/accounting/` and `frontend/src/app/shared/` and `frontend/src/app/core/`, writing the two files, the test command below, `git add` of those files, `git commit`, `git status --short`. Test command, in the repository root (it builds a temporary test config, so plain `ng test` is not used): `python scripts/automation/verify_tools.py ng-test-compare --base 27fd3612 --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/accountant/accountant-petty-cash/**/*.spec.ts"`; the per-test log is `scratch/logs/runner/ngtest-head.log`. If a test fails, read the error, fix the test (not production code), and rerun at most 5 times.

6. Before finishing: all tests in that folder pass; commit only the two files with the message `test(release-v1 4.2-c): petty cash account manager DOM specs, glossary`; `git status --short` prints nothing.

7. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 stage 4 mid-stage close-out on the local app environment: backup, apply the stage-4 migrations, patched frontend build; the runner restarts Daphne and the GDrive worker and runs the health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: backend\venv\Scripts\python.exe -X utf8 backend\manage.py migrate --check
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
- Do not run `run_auto_backup`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `backend/backups/` or `frontend/dist/`.
- Never roll back a migration (`migrate personnel 0014` or similar is forbidden).

2. Context: Release v1 stage 4 steps 4.1 (expense invoices) and 4.2 (petty cash) changed backend and frontend code. These three migrations are unapplied on the app database: `personnel 0015_invoice_lines_vat_number`, `personnel 0016_invoice_payments`, `personnel 0017_petty_cash_settlement`. They were reviewed for data loss and checked for name collisions. The app database holds test data only. Your terminal may be PowerShell; if so, set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order:
- a) Backup. In `backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app stage 4 mid'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0. Do not continue without a successful backup.
- b) Migration list. `.\venv\Scripts\python.exe manage.py showmigrations --plan` and note every `[ ]` line.
- c) Migrate. `.\venv\Scripts\python.exe manage.py migrate --noinput`. If it fails, stop and report the last 40 lines of the error; do not try to fix it, and never fake or skip migrations.
- d) Check. `.\venv\Scripts\python.exe manage.py migrate --check` exits 0, and `.\venv\Scripts\python.exe manage.py check` prints no errors.
- e) Frontend build. In `frontend`, run `npx ng build --delete-output-path=false` in the foreground and wait for it to finish, then run `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.

4. Tool policy: only the commands above and `git status --short`. Run the build at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the backup filename and size, the `[ ]` migrations found in step b, the migrate result (including the line `personnel 0015: N invoice line(s) created`), the build result (errors and warnings count) and the patch script line. Write the report only after the build and the patch have finished. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.3-b: personnel file scenario API tests

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_personnel_file_43.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_personnel_file_43.py --contains "missing_fields" --contains "wrong_step" --contains "action_blocked" --contains "personnel_open_workflows" --contains "batch-approve" --contains "has_pending_changes" --contains "personnel_profile" --contains "revision_required" --absent "skip(" --absent "expectedFailure"
verify: set DB_TEST_NAME=test_agy_personnel43b&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_personnel_file_43 --min-tests 8
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.3-b): personnel file scenario API tests"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly one new file: `backend/modules/accounting/personnel/test_personnel_file_43.py`. Change no other file (never touch `scripts/automation/*`). Never change production code. If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- No `skip` and no `expectedFailure`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in the `feat(release-v1 4.3-b...)` commits; read only these):
- `backend/modules/accounting/personnel/tests_personnel_cycle.py` lines 1-160. It is a working test. COPY its imports, its `setUp` (company, project, section, four users with permissions, `SectionAssignment` roles and `UserCompanyAccess`) and the complete `payload` dict of `test_complete_personnel_lifecycle_in_dalan` (including the accountant PATCH with `job_code` and `start_date` before approve-finance) into your new class `PersonnelFile43Tests(TestCase)`. Do not import or subclass from that file; copy. Use different usernames and a different company code (for example prefix `pf43_` and `PF43-CO`) so nothing collides.
- `backend/modules/accounting/personnel/test_personnel_sensitive_43.py` lines 26-62: a second, simpler fixture pattern (`grant_section_perms`, `call` with header `HTTP_X_COMPANY_ID`). Use its `call` style for requests.
- `scratch/handoff_4_3_b1.md` (endpoints, error codes, engine behaviour) and `scratch/handoff_4_3_b2.md` (masking, pagination).
- `backend/core/workflow/tests/test_api.py` lines 20-50: how the generic my-tasks API is called: `GET /api/workflow/tasks/` and `POST /api/workflow/tasks/<task_id>/action/` with `{"action": "act"}`.
- Engine models: `from workflow.models import WorkflowInstance, WorkflowTask` (open task of a profile: `WorkflowTask.objects.filter(instance__entity_kind='personnel_profile', instance__entity_id=<id>, is_open=True)`).

3. Task — `class PersonnelFile43Tests(TestCase)` with these tests (one method each):
- a) `test_full_flow_on_engine`: submit with a payload missing `father_name` and `address` → 400 and the response contains `missing_fields`; complete the profile; submit → 200 `pending_supervisor`; supervisor approve-supervisor → `pending_accountant`; accountant PATCH (job_code, start_date) then approve-finance → `pending_manager`; manager approve-manager → `approved` and `is_active` True; a `WorkflowInstance` with `entity_kind='personnel_profile'` and that entity id exists with status completed (`WorkflowInstance.COMPLETED`).
- b) `test_manager_cannot_skip_accountant`: profile at `pending_supervisor`: manager POSTs approve-manager → 400 with code `wrong_step`; after the supervisor approves, manager approve-manager → 400 `wrong_step`; the status stays `pending_accountant`.
- c) `test_accountant_gate_on_both_paths`: profile at `pending_accountant` with an empty `job_code` (do not PATCH it): accountant approve-finance → 400 `action_blocked`; the accountant's open task via `POST /api/workflow/tasks/<task_id>/action/` with `{"action": "act"}` → 400 and `code == 'action_blocked'`; then the accountant POSTs `request-revision` with a reason → 200 and the profile is `revision_required`; the operator submits again (after completing nothing else) → 200 `pending_supervisor` (starts again from the first step).
- d) `test_reject_and_self_approval`: supervisor POSTs `reject` without reason → 400 `reason_required`; with a reason → 200, profile `rejected` and the profile still exists (no purge). Separately: a profile created and submitted by the supervisor user cannot be approved by that same user (approve-supervisor returns 400 or 403, never 200).
- e) `test_change_request_applies_on_completion`: take a profile through to `approved` (reuse helper code from test a); the operator or accountant PATCHes `phone_number` on the approved profile (read `PersonnelChangeRequestViewSet` behaviour in `scratch/handoff_4_3_b1.md`: it creates a change request); profile `has_pending_changes` is True; approve the change request through its `approve-supervisor` / `approve-finance` / `approve-manager` actions under `/api/personnel/personnel-change-requests/<id>/` by the right users (a user who requested it cannot approve it; if the requester is the accountant use the supervisor and manager accordingly, as `tests_personnel_cycle.py` `test_approved_personnel_change_request_lifecycle` lines 293-362 does — read that test) → change request `approved`, profile `phone_number` changed, `has_pending_changes` False. A second change request rejected with a reason changes nothing on the profile.
- f) `test_batch_approve_per_row`: two profiles at `pending_supervisor` and one at `draft`; supervisor POSTs `/api/personnel/profiles/batch-approve/` with the three ids (read the request body field name in `hr_views.py`, search `batch-approve`) → 200; the response has one result per id; the two pending rows succeed, the draft row reports failure; the two profiles are now `pending_accountant`.
- g) `test_open_workflows_command_idempotent`: create a profile directly with `PersonnelProfile.objects.create(..., approval_status='pending_accountant')` (no engine instance); `call_command('personnel_open_workflows')` (from `django.core.management`, capture stdout with `io.StringIO`) → one open `WorkflowTask` at step `accountant_review` for that profile and its status is still `pending_accountant`; run the command a second time → still exactly one `WorkflowInstance` for that profile.
- h) `test_other_company_and_paging`: a user of another company (own company, project, section, `UserCompanyAccess`, role accountant with `perm_approve_personnel_finance`) GETs the profile detail → 404, POSTs approve-finance → 404, GETs `/api/print/personnel_profile/<id>/pdf/` → 404, and `GET /api/workflow/tasks/` does not contain that profile's task. List paging: `GET /api/personnel/profiles/` without `page` → a JSON list; with `page=1&page_size=1` → a dict with `count` and `results` of length 1.

4. Tool policy: only reading the listed files, grep in `backend/modules/accounting/personnel/` and `backend/core/workflow/`, writing the test file, the test command below, `git add` of that file, `git commit`, `git status --short`. Test command, in `backend`: `set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test personnel.test_personnel_file_43 --keepdb` (always with the label; never run `manage.py test` without a label). If a test fails, read the error, fix the test (not production code), and rerun at most 5 times.

5. Before finishing: all 8 tests pass; commit only that file with the message `test(release-v1 4.3-b): personnel file scenario API tests`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 2 — Release v1 step 4.3-c: personnel DOM specs (masking, paging, reason dialog)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/personnel/personnel-profiles/personnel-profiles-43c.dom.spec.ts" --allow "frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-new-profiles/supervisor-new-profiles-43c.dom.spec.ts"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/personnel/personnel-profiles/personnel-profiles-43c.dom.spec.ts --contains "getPersonnelProfilesPage" --contains "documents_count" --contains "isMaskedSensitive" --absent "it.skip" --absent "xit("
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-new-profiles/supervisor-new-profiles-43c.dom.spec.ts --contains "app-workflow-reason-dialog" --contains "prompt" --absent "it.skip" --absent "xit("
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/personnel/personnel-profiles/*.spec.ts" --include "src/app/modules/accounting/components/finance/supervisor/supervisor-new-profiles/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.3-c): personnel DOM specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly two new files: `frontend/src/app/modules/accounting/components/personnel/personnel-profiles/personnel-profiles-43c.dom.spec.ts` and `frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-new-profiles/supervisor-new-profiles-43c.dom.spec.ts`. Change no other file (never touch `scripts/automation/*`, never change production code). If a test fails because of production code, keep the assertion, stop, and describe the failure in the report.
- No `it.skip`, no `xit(`, no `fit(`.
- Run every command in the foreground and wait until it finishes.

2. Context (committed by Claude in the `feat(release-v1 4.3-c...)` and `fix(release-v1 4.3-c...)` commits; read only these):
- `frontend/src/app/modules/accounting/components/personnel/personnel-profiles/personnel-profiles.spec.ts`: COPY its TestBed setup, providers and API mocks (it already mocks `getPersonnelProfilesPage` with a paged reply `{count, next, previous, results}`).
- `frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-new-profiles/supervisor-new-profiles.spec.ts`: COPY its TestBed setup and mocks.
- `frontend/src/app/modules/accounting/models/personnel.model.ts`: functions `isMaskedValue`, `isMaskedSensitive`, `stripMaskedSensitive`, constant `PERSONNEL_SENSITIVE_FIELDS` (Grep them).
- In `personnel-profiles.ts` / `.html` Grep: `getPersonnelProfilesPage`, `isMasked`, `documents_count`, `maskedHint` or the hint text, the pager next/previous handlers, `isMaskedSensitive`.
- In `supervisor-new-profiles.ts` / `.html` Grep: `app-workflow-reason-dialog` and the vehicle reject handler that opens it.

3. Definitions: a masked value is a string containing `*` (example `******1234`). Only the fields in `PERSONNEL_SENSITIVE_FIELDS` are treated as masked when saving; a `*` in `address` or `notes` is real user data and must be kept.

4. Task:
- File A `personnel-profiles-43c.dom.spec.ts`, one `it` each:
  a) a profile row with `national_code: '******1234'` renders that text and the Persian hint text used by the component next to it (read the exact hint from the html);
  b) a profile with `documents_count: 3` and `documents: []` shows the documents count text with the number 3 in Persian digits (read the exact template);
  c) on load the component calls `getPersonnelProfilesPage` with `page: 1`; clicking the next-page button calls it again with `page: 2` (reply `count` larger than one page);
  d) `isMaskedSensitive('national_code', '***12')` is true, `isMaskedSensitive('address', 'a * b')` is false, and `stripMaskedSensitive({national_code: '***1', address: 'a * b'})` equals `{address: 'a * b'}`;
  e) saving an edited profile whose `national_code` is masked and whose `address` contains `*` sends a payload without `national_code` and with the address unchanged (spy on the update method the component calls).
- File B `supervisor-new-profiles-43c.dom.spec.ts`:
  f) `window.prompt` is never called: spy on it, open the vehicle reject flow, and assert the spy was not called and an `app-workflow-reason-dialog` element is present;
  g) confirming the reason dialog with a reason calls the vehicle reject API once with that reason;
  h) cancelling the dialog calls no API.

5. Tool policy: only reading the listed files, Grep in `frontend/src/app/modules/accounting/` and `frontend/src/app/shared/`, writing the two files, the test command below, `git add` of those two files, `git commit`, `git status --short`. Test command, in the repository root: `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --no-skip --max-failed 0 --include "src/app/modules/accounting/components/personnel/personnel-profiles/*.spec.ts" --include "src/app/modules/accounting/components/finance/supervisor/supervisor-new-profiles/*.spec.ts"`; per-test log `scratch/logs/runner/ngtest-head.log`. If a test fails, read the error, fix the test (not production code), rerun at most 5 times.

6. Verification: the test command passes with 0 failed.

7. Output: commit with message `test(release-v1 4.3-c): personnel DOM specs (masking, paging, reason dialog)`. Report in English: files, number of tests, result. Then stop.

===

[DONE] [ ] Session 2 of 2 — Release v1 step 4.3-c: UI review fixes on personnel cartables

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/accountant/accountant-personnel/accountant-personnel.html" --allow "frontend/src/app/modules/accounting/components/finance/accountant/accountant-new-profiles/accountant-new-profiles.html" --allow "frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-personnel/supervisor-personnel.html" --allow "frontend/src/app/modules/accounting/components/finance/manager/manager-personnel/manager-personnel.html"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-personnel/accountant-personnel.html --contains "aria-label" --absent "left-2.5"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/accountant/accountant-personnel/*.spec.ts" --include "src/app/modules/accounting/components/finance/accountant/accountant-new-profiles/*.spec.ts" --include "src/app/modules/accounting/components/finance/supervisor/supervisor-personnel/*.spec.ts" --include "src/app/modules/accounting/components/finance/manager/manager-personnel/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(release-v1 4.3-c): personnel cartable accessibility"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7 and 10 apply.
- Change only these four html files: `accountant-personnel.html`, `accountant-new-profiles.html` (under `frontend/src/app/modules/accounting/components/finance/accountant/`), `supervisor-personnel.html` (under `.../finance/supervisor/supervisor-personnel/`) and `manager-personnel.html` (under `.../finance/manager/manager-personnel/`). Never change `.ts` files, specs or `scripts/automation/*`.
- Never remove or rename an event binding, handler call, `*ngIf`/`@if` condition or `[title]` binding; only add attributes and change CSS classes.
- Run every command in the foreground and wait until it finishes.

2. Context: read `.claude/skills/design-system/SKILL.md` sections on tokens, icons and touch targets. Grep `copyField(` in the four files.

3. Task (one edit kind per item):
- a) Every icon-only button that calls `copyField(` gets `type="button"`, an `aria-label` with the same Persian text as its title (when the title is a binding, use `[attr.aria-label]` with the same expression; when there is no title, add `title` and `aria-label` «کپی» followed by the field name used in the call), and the classes `min-w-[40px] min-h-[40px] inline-flex items-center justify-center` (replace `min-h-[28px]` where present).
- b) Physical direction classes on those copy buttons and on the search-clear buttons: `mr-1` → `ms-1`, `ml-1` → `me-1`, `left-2.5` → `start-2.5`, `right-2.5` → `end-2.5`.
- c) In empty-state blocks (the «موردی یافت نشد» / empty list panels) of `accountant-personnel.html` and `accountant-new-profiles.html`: `bg-white` → `bg-surface`, `border-slate-200` → `border-line`, `text-slate-400` → `text-fg-muted`, and keep their `dark:` classes only if they are not already covered by the tokens (remove `dark:bg-slate-*`/`dark:border-slate-*` duplicates on those same elements).
- d) In `accountant-new-profiles.html` replace the `⚠️` emoji in the pending-finance badge with `<svg appIcon="alert-triangle" class="w-3.5 h-3.5" aria-hidden="true"></svg>`.
- e) The pager previous/next buttons in the four files get `focus-visible:ring-2 focus-visible:ring-indigo-500` if they lack it.

4. Tool policy: only reading the listed files and the skill, Grep in `frontend/src/app/modules/accounting/` and `frontend/src/app/shared/icons/`, editing the four files, the test command below, `python scripts/e2e/guardian_56_change_integrity.py --base HEAD~1 --head HEAD` after the commit, `git add` of those four files, `git commit`, `git status --short`. Test command, in the repository root: `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/accountant/accountant-personnel/*.spec.ts" --include "src/app/modules/accounting/components/finance/accountant/accountant-new-profiles/*.spec.ts" --include "src/app/modules/accounting/components/finance/supervisor/supervisor-personnel/*.spec.ts" --include "src/app/modules/accounting/components/finance/manager/manager-personnel/*.spec.ts"`. If a test fails because a selector changed, restore the original markup for that element rather than editing the spec.

5. Verification: the test command passes with 0 failed and guardian 56 ends with its success line.

6. Output: commit with message `fix(release-v1 4.3-c): personnel cartable accessibility and tokens`. Report in English: items done per file, test and guardian 56 result. Then stop.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.4-b: attendance period scenario API tests

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_attendance_44.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_attendance_44.py --contains "attendance_period_locked" --contains "action_blocked" --contains "wrong_step" --contains "attendance_open_workflows" --contains "READY_TO_PAY" --contains "REVISION_REQUIRED" --contains "override_reason" --absent "skip(" --absent "expectedFailure"
verify: set DB_TEST_NAME=test_agy_attendance44b&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_attendance_44 --min-tests 8
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.4-b): attendance period scenario API tests"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 6 and 10 apply.
- Create exactly one new file: `backend/modules/accounting/personnel/test_attendance_44.py`. Change no other file (never touch `scripts/automation/*`). Never change production code. If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- No `skip` and no `expectedFailure`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in commits `adbb5eaa` and `f9e0a2bb`; read only these):
- `scratch/handoff_4_4_b1.md` (period workflow on the engine: endpoints `periods/workflow-action/`, `periods/<id>/submit|approve|reject|lock|unlock/`, statuses, error codes, `attendance_open_workflows`).
- `scratch/handoff_4_4_b2.md` (write guard, lock code `attendance_period_locked`, override fields `is_override` + `override_reason`, scope rules, pagination).
- `backend/modules/accounting/personnel/test_attendance_44_engine.py` (whole file): working fixtures for a company, project, section, users with section permissions, a period and engine actions. COPY its imports and setUp pattern into your new class `Attendance44ScenarioTests(TestCase)`; do not import or subclass from it. Use different usernames and company codes (prefix `a44s_`, codes `A44S-...`).
- `backend/modules/accounting/personnel/test_attendance_44_scope_lock.py` lines 1-120: fixtures with `grant_section_perms`, `lock_period`, and calls to bulk-save, monthly grid and clear-day. Copy the request shapes you need.
- `backend/core/workflow/tests/test_api.py` lines 20-50: the my-tasks API (`GET /api/workflow/tasks/`, `POST /api/workflow/tasks/<task_id>/action/` with `{"action": "act"}`).
- Engine models: `from workflow.models import WorkflowInstance, WorkflowTask` (open task of a period: `WorkflowTask.objects.filter(instance__entity_kind='attendance_period', instance__entity_id=<id>, is_open=True)`).

3. Task — `class Attendance44ScenarioTests(TestCase)` with these tests (one method each):
- a) `test_full_flow_to_ready_to_pay`: two `PENDING_SUPERVISOR` attendance rows in the section period; the registrar submits the period → status `SUBMITTED`; the manager acts before the accountant → 400 with code `wrong_step`; supervisor approves → `SUBMITTED_SUPERVISOR` and both attendance rows are `APPROVED` with `AttendanceAuditLog` rows; accountant acts → `SUBMITTED_ACCOUNTANT`; manager acts → `READY_TO_PAY` with `locked_at` set; a `WorkflowInstance` with `entity_kind='attendance_period'` for that period is completed.
- b) `test_revision_row_blocks_supervisor`: one attendance row set to `REVISION_REQUIRED`; after submit (or, if submit itself is refused, assert that refusal) the supervisor approval returns 400 with code `action_blocked`; the period status does not advance.
- c) `test_return_for_fix_reopens_editing`: submitted period; the supervisor returns it with a reason → period `REVISION_REQUIRED`; a daily bulk-save on that month now succeeds (200); returning without a reason → 400.
- d) `test_no_self_approval`: a user holding both the attendance and the supervisor permission submits the period, then tries to approve it as supervisor → 400 or 403, never 200.
- e) `test_unlock_ready_to_pay`: take a period to `READY_TO_PAY` (reuse helper code from test a); unlock without a reason → 400; unlock by a user without `perm_lock_work_period` → 403 or 404; unlock with a reason by a holder of `perm_lock_work_period` in the section → period `OPEN`; a monthly grid save on that month then succeeds.
- f) `test_lock_on_write_paths_and_override`: submitted period; monthly grid save of a changed cell → 400 `attendance_period_locked`; the same grid save sending only an unchanged existing cell → 200; clear-day → 400 `attendance_period_locked`; single `PATCH /api/personnel/attendance/<id>/` → 400 `attendance_period_locked`; a superuser bulk-save with `is_override` true and no `override_reason` → 400; with `override_reason` → 200 and an `AttendanceAuditLog` row containing the reason.
- g) `test_open_workflows_command_idempotent`: create a sectioned period directly with status `SUBMITTED_SUPERVISOR` (no engine instance); `call_command('attendance_open_workflows')` (capture stdout with `io.StringIO`) → one open `WorkflowTask` at step `accountant_review` and the period status unchanged; run it again → still exactly one `WorkflowInstance`; also `call_command('attendance_open_workflows', '--dry-run')` on a fresh period creates nothing.
- h) `test_scope_and_offline_compat`: a user of another company gets 404 on the period detail and on `GET /api/personnel/attendance/<id>/`; `POST /api/personnel/periods/` with the other company's `section_id` → 404 and no period is created; an old-style single `POST /api/personnel/attendance/` without `section` (offline queue shape: personnel, date_shamsi, status, effective_hours) → 201; posting the same personnel, day and section twice leaves exactly one active (`is_deleted=False`) row; AGENTS §6: a row saved with status `LEAVE` has `effective_hours == 0` and `overtime_hours == 0` after a bulk-save.

4. Tool policy: only reading the listed files, grep in `backend/modules/accounting/personnel/` and `backend/core/workflow/`, writing the test file, the test command below, `git add` of that file, `git commit`, `git status --short`. Test command, in `backend`: `set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test personnel.test_attendance_44 --keepdb` (always with the label; never run `manage.py test` without a label). If a test fails, read the error, fix the test (not production code), and rerun at most 5 times.

5. Before finishing: all 8 tests pass; commit only that file with the message `test(release-v1 4.4-b): attendance period scenario API tests`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.
===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.4-c: attendance DOM specs (lock message, dirty cells, reason dialog)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/employee/employee-attendance/employee-attendance-44c.dom.spec.ts" --allow "frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-attendance/supervisor-attendance-44c.dom.spec.ts"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-attendance/employee-attendance-44c.dom.spec.ts --contains "ATTENDANCE_PERIOD_LOCKED_FA" --contains "attendance_period_locked" --contains "fiscal_period_closed" --contains "bulkSaveMonthlyGrid" --contains "periodWorkflowAction" --absent "it.skip" --absent "xit("
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-attendance/supervisor-attendance-44c.dom.spec.ts --contains "app-workflow-reason-dialog" --contains "postCartableAction" --contains "ATTENDANCE_PERIOD_LOCKED_FA" --absent "it.skip" --absent "xit("
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/employee/employee-attendance/*.spec.ts" --include "src/app/modules/accounting/components/finance/supervisor/supervisor-attendance/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.4-c): attendance DOM specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly two new files: `frontend/src/app/modules/accounting/components/finance/employee/employee-attendance/employee-attendance-44c.dom.spec.ts` and `frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-attendance/supervisor-attendance-44c.dom.spec.ts`. Change no other file (never touch `scripts/automation/*`, never change production code). If a test fails because of production code, keep the assertion, stop, and describe the failure in the report.
- No `it.skip`, no `xit(`, no `fit(`.
- Run every command in the foreground and wait until it finishes.

2. Context (committed by Claude in the `feat(release-v1 4.4-c...)` commit; read only these):
- `frontend/src/app/modules/accounting/attendance-period-error.ts` (whole file, 45 lines): `ATTENDANCE_PERIOD_LOCKED_FA`, `attendanceWriteErrorMessage`, `attendanceActionErrorMessage`. Import the constant from it in both specs; never retype the Persian text.
- `frontend/src/app/modules/accounting/components/finance/employee/employee-attendance/employee-attendance.spec.ts`: COPY its TestBed setup, providers and mocks (`mockPersonnelApi`, `mockToast`). In `employee-attendance.ts` Grep: `LOCKED_STATUSES`, `isPeriodLocked`, `periodLockedMessage`, `dirtyMonthlyCells`, `onMonthlyCellHoursChange`, `saveMonthlyGrid`, `submitPeriodForReview`, `NetworkStatusService`. In `employee-attendance.html` Grep `my-tasks`.
- `frontend/src/app/core/services/network-status.service.ts`: how `isOnline` is computed (to simulate offline in item e; restore the online state in `afterEach`).
- `frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-attendance/supervisor-attendance.spec.ts`: COPY its TestBed setup and mocks. In `supervisor-attendance.ts` Grep: `openRevisionModal`, `confirmRevision`, `revisionServerError`, `postCartableAction`. In `supervisor-attendance.html` Grep `app-workflow-reason-dialog`.

3. Definitions: a locked period is any `period_status` in `SUBMITTED`, `SUBMITTED_SUPERVISOR`, `SUBMITTED_ACCOUNTANT`, `READY_TO_PAY`, `PAID`, `LOCKED`, `FINALIZED`. A server lock error is an `HttpErrorResponse` with status 400 and body `{code: 'attendance_period_locked', error: 'x', detail: 'x'}`. A fiscal error has status 400 and body `{date_shamsi: ['MSG-FISCAL'], code: 'fiscal_period_closed'}`.

4. Task:
- File A `employee-attendance-44c.dom.spec.ts`, one `it` each:
  a) when the monthly grid response has `period_status: 'SUBMITTED_SUPERVISOR'` and `is_locked: false`, `component.isPeriodLocked` is true, the rendered monthly tab contains `ATTENDANCE_PERIOD_LOCKED_FA`, and an anchor whose `href` contains `my-tasks` and `attendance_period` is present;
  b) `saveMonthlyGrid` whose `bulkSaveMonthlyGrid` mock returns `throwError` with the server lock error calls `mockToast.show('error', ATTENDANCE_PERIOD_LOCKED_FA)`;
  c) the same with the fiscal error calls `mockToast.show('error', 'MSG-FISCAL')`;
  d) with two grid rows of 3 days each, after calling `onMonthlyCellHoursChange` on exactly one cell (personnel of row 1, day 2, set `effective_hours` to 8 first) `saveMonthlyGrid` sends `items` with length 1 for that personnel and day 2;
  e) offline: `submitPeriodForReview` does not call `periodWorkflowAction` and shows a warning toast; online with `selectedSectionId = 10` it calls `periodWorkflowAction` with an object containing `section_id: 10` and `action: 'submit'`.
- File B `supervisor-attendance-44c.dom.spec.ts`:
  f) `openRevisionModal(item)` then `fixture.detectChanges()`: an `app-workflow-reason-dialog` element is present and `component.showRevisionModal` is true; `confirmRevision('')` calls no `postCartableAction`;
  g) `confirmRevision('علت آزمایشی')` calls `postCartableAction` once with `'supervisor'` and an object containing `action: 'revision'`;
  h) when `postCartableAction` returns `throwError` with the server lock error, `component.revisionServerError` equals `ATTENDANCE_PERIOD_LOCKED_FA` and the dialog stays open.

5. Tool policy: only reading the listed files, Grep in `frontend/src/app/modules/accounting/`, `frontend/src/app/core/services/` and `frontend/src/app/shared/`, writing the two files, the test command below, `git add` of those two files, `git commit`, `git status --short`. Test command, in the repository root: `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/employee/employee-attendance/*.spec.ts" --include "src/app/modules/accounting/components/finance/supervisor/supervisor-attendance/*.spec.ts"`; per-test log `scratch/logs/runner/ngtest-head.log`. If a test fails, read the error, fix the test (not production code), rerun at most 5 times.

6. Verification: the test command passes with 0 failed.

7. Output: commit with message `test(release-v1 4.4-c): attendance DOM specs (lock message, dirty cells, reason dialog)`. Report in English: files, number of tests, result. Then stop.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.5-b: payroll scope and sensitive-data API tests

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_payroll_45_scope.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_payroll_45_scope.py --contains "attendance_not_approved" --contains "skipped_no_attendance" --contains "export-bank-excel" --contains "import-tax-excel" --contains "national_code" --contains "status_code, 404" --contains "status_code, 403" --absent "skip(" --absent "expectedFailure"
verify: set DB_TEST_NAME=test_agy_payroll45b&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_payroll_45_scope --min-tests 8
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.5-b): payroll scope and sensitive-data API tests"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 6 and 10 apply.
- Create exactly one new file: `backend/modules/accounting/personnel/test_payroll_45_scope.py`. Change no other file (never touch `scripts/automation/*`). Never change production code. If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- No `skip` and no `expectedFailure`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in commits `557a133a` and `01515e7a`; read only these):
- `scratch/handoff_4_5_b1.md` and `scratch/handoff_4_5_b2.md` (rules: section-period calculation, `attendance_not_approved`, `skipped_no_attendance`, `period_not_found`, wage-row visibility, `view_sys_payroll` on calculate/import/exports, 403/404 rules, masking, project + month exports, `X-Payroll-Unapproved-Periods`, bank excel only `READY_TO_PAY`, no create/destroy).
- `backend/modules/accounting/personnel/test_payroll_45_petty_exports.py` (whole file): working fixtures. COPY its `_Base` helper methods (`person`, `attend`, `calc`, `make_user`, `client_for`) and imports into your new file; you MAY subclass `_PayrollFixtureMixin` from `personnel.test_payroll_45_excel` (as that file does), but do not import from `test_payroll_45_petty_exports`. Use usernames with prefix `p45s_` and org codes `P45S...`.
- `backend/modules/accounting/personnel/test_payroll_45_excel.py` lines 84-140 (`make_org`, `make_settings`, `ready_period`, `day_rows`).
- API base: `/api/personnel/monthly-payroll/`; actions `calculate-period/` (POST), `import-tax-excel/` (POST), `export-dsk-zip/`, `export-tax-wh/`, `export-tax-wp/`, `export-bank-excel/`, `export-monthly-excel/` (GET).

3. Task — `class Payroll45ScopeTests(TestCase)` with these tests (one method each):
- a) `test_section_period_counts_only_own_section_attendance`: personnel P has APPROVED attendance in section A (period A, READY_TO_PAY) and also APPROVED rows in section B of the same company and month; calculating period A by a `view_sys_payroll` user (`{"period_id": A}`) gives P a row whose worked hours equal only section A rows (compare with a calculation where B rows do not exist, or assert the hours field equals the A total).
- b) `test_not_ready_period_400_and_skipped_list`: a section period with status `OPEN` → POST calculate-period 400 with `code == "attendance_not_approved"`; on a READY_TO_PAY period a personnel of that section with no APPROVED attendance has no `MonthlyPayrollRecord` and appears in the response `skipped_no_attendance` by `personnel_id`.
- c) `test_body_company_id_ignored`: POST calculate-period with `{"period_id": A, "company_id": <another company id>}` by an authorised user → 200 and records belong to period A's company only; the other company has no new `MonthlyWorkPeriod`.
- d) `test_employee_sees_only_own_row`: a plain employee (no permission codes) linked to personnel P via `PersonnelProfile.user` lists `?period_id=A` → only P's row; GET detail of another personnel's row → 404; DELETE of own row → 405.
- e) `test_other_company_404_everywhere`: a `view_sys_payroll` user of another company: list returns `[]`; detail of a row → 404; calculate-period with period A → 404; `export-tax-wh`, `export-tax-wp`, `export-dsk-zip`, `export-bank-excel` and `export-monthly-excel` with `period_id=A` → 404; `export-dsk-zip` with `project_id` + `year_month` of A's project → 404.
- f) `test_no_payroll_perm_403`: a user of the same company without `view_sys_payroll`: calculate-period, `import-tax-excel` (with `period_id`), and each of the five exports → 403.
- g) `test_import_tax_requires_period_id`: an authorised user posts `import-tax-excel/` without `period_id` → 400.
- h) `test_sensitive_fields_masked`: a plain employee sees their own `national_code` and `bank_account_number` unmasked; a user with `view_sys_payroll` but without the 4.3 sensitive bypass sees another personnel's `national_code` masked (not equal to the real value, ends with its last 4 digits), exactly as `test_own_rows_only_and_sensitive_masked_for_payroll_role` in the petty file does; the POST calculate-period response rows follow the same rule for that user.

4. Tool policy: only reading the listed files, grep in `backend/modules/accounting/personnel/`, writing the test file, the test command below, `git add` of that file, `git commit`, `git status --short`. Test command, in `backend`: `set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test personnel.test_payroll_45_scope --keepdb` (always with the label; never run `manage.py test` without a label). If a test fails, read the error, fix the test (not production code), and rerun at most 5 times.

5. Before finishing: all 8 tests pass; commit only that file with the message `test(release-v1 4.5-b): payroll scope and sensitive-data API tests`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.
===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.5-c: payroll workflow, lock and treasury API tests

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_payroll_45_workflow.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_payroll_45_workflow.py --contains "submit-workflow" --contains "payroll_locked" --contains "tracking_code_required" --contains "not_ready_to_pay" --contains "FAILED_SHEBA" --contains "payroll_open_workflows" --contains "status_code, 404" --absent "skip(" --absent "expectedFailure"
verify: set DB_TEST_NAME=test_agy_payroll45c&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_payroll_45_workflow --min-tests 8
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.5-c): payroll workflow, lock and treasury API tests"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 6 and 10 apply.
- Create exactly one new file: `backend/modules/accounting/personnel/test_payroll_45_workflow.py`. Change no other file (never touch `scripts/automation/*`). Never change production code. If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- No `skip` and no `expectedFailure`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude in commit `a33d03c5`; read only these):
- `scratch/handoff_4_5_c1.md` (whole file): payroll workflow `payroll_period` (steps `manager_ok` then `treasury_pay`; the accountant's submit replaces a review step), lock rules, treasury rules, command `payroll_open_workflows`.
- `backend/modules/accounting/personnel/workflows.py`: grep `PAYROLL_PERIOD_WORKFLOW` and read from that line to the end of the file.
- `backend/modules/accounting/personnel/treasury_engine.py` lines 55-215 and from `def execute_period_payment` to the end.
- `backend/modules/accounting/personnel/test_payroll_45_scope.py` (whole file): working fixtures. COPY its helper methods and imports into your new file; you MAY subclass `_PayrollFixtureMixin` from `personnel.test_payroll_45_excel` as that file does, but do not import from `test_payroll_45_scope`. Use usernames with prefix `p45w_` and org codes `P45W...`.
- `backend/modules/accounting/personnel/test_cartable_multitenant.py`: grep `cartable/treasury` to copy the exact treasury URLs (GET list, POST with `action`, `period_id`/`payroll_id`, `tracking_code`, and the `export-diskette/` GET) and how a treasury user gets `perm_treasury_disburse_action`.
- `backend/modules/accounting/personnel/test_attendance_44_scope_lock.py`: grep `payroll_exists` for the attendance unlock call.
- Engine API (`backend/core/workflow/engine.py`): `from workflow import engine`; `engine.open_task(key, period_id)`, `engine.instance_of(key, period_id)`, `engine.act(user, task, reason='')` (approve or pay), `engine.return_for_fix(user, task, 'reason')`. Errors are `workflow.errors.WorkflowError` with `.code`.
- API: `POST /api/personnel/monthly-payroll/submit-workflow/` with `{"period_id": id}`; `calculate-period/`, `import-tax-excel/`, `<id>/release-payment-hold/` (grep `release-payment-hold` in `views_domains/payroll_views.py` for the exact url), PATCH `/api/personnel/monthly-payroll/<id>/`.
- Users: an accountant with `view_sys_payroll`, a manager with `perm_manager_payment_authorize`, a treasurer with `perm_treasury_disburse_action`, all three assigned in the period's section (copy how the scope file gives permission codes). The manager and treasurer must be different users from the accountant.

3. Task — `class Payroll45WorkflowTests(TestCase)` with these tests (one method each):
- a) `test_full_flow_to_paid`: calculate a READY_TO_PAY section period (two personnel with valid sheba) → accountant POST `submit-workflow/` 200 and the open task step is `manager_ok` → `engine.act(manager, task)` → every row `payment_status == "READY_TO_PAY"` and open task step `treasury_pay` → treasurer POST treasury `disburse_period` with a tracking code → 200, period `status == "PAID"`, every row `PAID` with that tracking code, and `engine.instance_of(...)` status is completed.
- b) `test_manager_return_frees_recalculation`: after submit and manager approval is NOT done, `engine.return_for_fix(manager, task, "fix")` → rows `PENDING`, no open task, and calculate-period again → 200; a second `submit-workflow/` → 200.
- c) `test_treasury_cannot_pay_before_manager`: after submit only (task at `manager_ok`) treasurer POST `disburse_period` → 400 with `code == "not_ready_to_pay"`; the treasury GET list has no period with this id; period status unchanged.
- d) `test_pay_needs_tracking_code_and_pays_once`: at `treasury_pay`, `engine.act(treasurer, task)` without the treasury endpoint raises `WorkflowError` with code `tracking_code_required` and the period stays not PAID; then pay through the endpoint → 200; a second identical POST → status 400 (any code) and no row's `paid_at` changes.
- e) `test_failed_sheba_split_and_single_repay`: one of two personnel has an empty or invalid `sheba_number` → after payment that row is `FAILED_SHEBA` and the other is `PAID`, period `PAID`; POST `disburse_single_payroll` on the PAID row → 400 with `code == "not_failed_sheba"`; set a valid sheba (copy one used by a passing fixture) and POST `disburse_single_payroll` on the failed row → 200 and that row is `PAID`.
- f) `test_lock_after_manager_approval`: after manager approval: calculate-period, PATCH a row, `import-tax-excel` (with `period_id`) and `release-payment-hold` on a row → each 400 with `code == "payroll_locked"`; the attendance unlock of that period → 400 with code `payroll_exists`.
- g) `test_treasury_404s`: treasurer POST `disburse_period` with `period_id` 987654 → 404; a period of another company (a second org built with the helpers) → 404 for `disburse_period` and for `export-diskette/` GET; `disburse_single_payroll` with `payroll_id` 987654 → 404.
- h) `test_open_workflows_command_idempotent`: a READY_TO_PAY section period with calculated rows and no payroll instance; `call_command("payroll_open_workflows", "--dry-run")` creates no instance; `call_command("payroll_open_workflows")` twice → exactly one instance for that period and its open task step is `manager_ok`.

4. Tool policy: only reading the listed files, grep in `backend/modules/accounting/personnel/` and `backend/core/workflow/`, writing the test file, the test command below, `git add` of that file, `git commit`, `git status --short`. Test command, in `backend`: `set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test personnel.test_payroll_45_workflow --keepdb` (always with the label; never run `manage.py test` without a label). If a test fails, read the error, fix the test (not production code), and rerun at most 5 times.

5. Before finishing: all 8 tests pass; commit only that file with the message `test(release-v1 4.5-c): payroll workflow, lock and treasury API tests`; `git status --short` prints nothing.

6. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.5-d: payroll and treasury DOM specs (submit, lock, offline, tracking code, diskette warning)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/accountant/accountant-payroll/accountant-payroll-45d.dom.spec.ts" --allow "frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-disbursements/treasurer-disbursements-45d.dom.spec.ts"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-payroll/accountant-payroll-45d.dom.spec.ts --contains "PAYROLL_LOCKED_FA" --contains "submitPayrollWorkflow" --contains "attendance_not_approved" --contains "payroll_workflow_step" --contains "skipped_no_attendance" --absent "it.skip" --absent "xit("
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-disbursements/treasurer-disbursements-45d.dom.spec.ts --contains "TRACKING_CODE_REQUIRED_FA" --contains "petty_settlement_changed" --contains "disburseTreasury" --absent "it.skip" --absent "xit("
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/accountant/accountant-payroll/*.spec.ts" --include "src/app/modules/accounting/components/finance/treasurer/treasurer-disbursements/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.5-d): payroll and treasury DOM specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Create exactly two new files: `frontend/src/app/modules/accounting/components/finance/accountant/accountant-payroll/accountant-payroll-45d.dom.spec.ts` and `frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-disbursements/treasurer-disbursements-45d.dom.spec.ts`. Change no other file (never touch `scripts/automation/*`, never change production code). If a test fails because of production code, keep the assertion, stop, and describe the failure in the report.
- No `it.skip`, no `xit(`, no `fit(`.
- Run every command in the foreground and wait until it finishes.

2. Context (committed by Claude in the `feat(release-v1 4.5-d...)` commit; read only these):
- `frontend/src/app/modules/accounting/components/finance/accountant/payroll-period.ts` (first 30 lines): `PAYROLL_LOCKED_FA`, `PAYROLL_OFFLINE_FA`, `payrollActionErrorMessage`. Import the constants; never retype the Persian text.
- `frontend/src/app/modules/accounting/components/finance/accountant/accountant-payroll/accountant-payroll.spec.ts`: COPY its TestBed setup, providers and mocks. In `accountant-payroll.ts` Grep: `sectionMode`, `fetchSectionPayroll`, `workflowStep`, `workflowLocked`, `isPayrollFrozen`, `canSubmitWorkflow`, `calculateBatch`, `attendanceBlockedMessage`, `skippedNoAttendance`, `submitForManager`, `confirmDialog`, `NetworkStatusService`. In `accountant-payroll.html` Grep `my-tasks`, `workflowLink`, `skippedNoAttendance`.
- `frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-disbursements/treasurer-disbursements.spec.ts`: COPY its TestBed setup and mocks. In `treasurer-disbursements.ts` Grep: `TRACKING_CODE_REQUIRED_FA`, `TREASURY_OFFLINE_HINT_FA`, `treasuryErrorMessage`, `openPeriodBatchModal`, `submitBatchDisbursement`, `batchTrackingCodeError`, `batchServerError`, `openPayModal`, `confirmDisbursement`, `can_pay_single`.
- `frontend/src/app/core/services/network-status.service.ts`: how `isOnline` is computed (to simulate offline; restore the online state in `afterEach`).

3. Definitions: section mode means `component.mySections` has one section `{id: 10, name: 'S'}` and `component.selectedSectionId = 10`. A server error is an `HttpErrorResponse` with status 400 and body `{code: '<code>', error: 'MSG', detail: 'MSG'}`.

4. Task:
- File A `accountant-payroll-45d.dom.spec.ts`, one `it` each:
  a) section mode, `getWorkPeriods` mock returns `[{id: 5, section: 10, status: 'READY_TO_PAY', payroll_workflow_step: 'manager_ok'}]` and `getMonthlyPayrollRecords` returns one PENDING row: after the fetch, `component.currentPeriodId` is 5, `component.isPayrollFrozen` is true, `component.canSubmitWorkflow` is false, and the rendered page has an anchor whose `href` contains `my-tasks` and `payroll_period`;
  b) section mode, `calculatePeriodPayroll` returns `throwError` with code `attendance_not_approved`: the call payload contains `section_id: 10` and no `warehouse_id`; `component.attendanceBlockedMessage` is not empty;
  c) `calculatePeriodPayroll` returns `throwError` with code `payroll_locked`: `component.workflowLocked` is true and the error toast receives `PAYROLL_LOCKED_FA`;
  d) `calculatePeriodPayroll` success with `skipped_no_attendance: [{personnel_id: 7, full_name: 'نام آزمایشی'}]`: `component.skippedNoAttendance` has length 1 and after `fixture.detectChanges()` the page text contains `نام آزمایشی`;
  e) section mode with period 5 loaded, no workflow step and one PENDING row, confirm dialog mock resolving `true`: `await component.submitForManager()` calls `submitPayrollWorkflow(5)` once and afterwards `component.workflowLocked` is true; offline (restore in `afterEach`): `submitPayrollWorkflow` is not called and the error toast receives `PAYROLL_OFFLINE_FA`.
- File B `treasurer-disbursements-45d.dom.spec.ts`:
  f) `openPeriodBatchModal(period)` with an empty `batchTrackingCode`, then `submitBatchDisbursement()`: `disburseTreasury` is not called and `component.batchTrackingCodeError` equals `TRACKING_CODE_REQUIRED_FA`; after `fixture.detectChanges()` that text is rendered;
  g) with `batchTrackingCode = 'TRK-1'`, `disburseTreasury` returns `throwError` with code `petty_settlement_changed`: `component.batchServerError` contains `MSG` and the modal stays open; with success the payload has `action: 'disburse_period'` and `tracking_code: 'TRK-1'`;
  h) offline: `submitBatchDisbursement()` does not call `disburseTreasury` and `component.batchServerError` equals `TREASURY_OFFLINE_HINT_FA`.

5. Tool policy: only reading the listed files, Grep in `frontend/src/app/modules/accounting/`, `frontend/src/app/core/services/` and `frontend/src/app/shared/`, writing the two files, the test command below, `git add` of those two files, `git commit`, `git status --short`. Test command, in the repository root: `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/accountant/accountant-payroll/*.spec.ts" --include "src/app/modules/accounting/components/finance/treasurer/treasurer-disbursements/*.spec.ts"`; per-test log `scratch/logs/runner/ngtest-head.log`. If a test fails, read the error, fix the test (not production code), rerun at most 5 times.

6. Verification: the test command passes with 0 failed.

7. Output: commit with message `test(release-v1 4.5-d): payroll and treasury DOM specs (submit, lock, offline, tracking code)`. Report in English: files, number of tests, result. Then stop.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.6-b: rewrite supervisor attendance and period DOM spec on the 4.4-c component API

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-attendance-and-lock.dom.spec.ts"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-attendance-and-lock.dom.spec.ts --contains "selectedSectionId" --contains "fetchPeriods" --contains "confirmRevision(" --absent "currentPeriodSummary" --absent "lockAndSubmitPeriod" --absent "revisionReasonText" --absent "fetchPeriodData" --absent "it.skip" --absent "xit("
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/supervisor/supervisor-attendance-and-lock.dom.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.6-b): supervisor attendance and period DOM spec on the current API"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5 and 10 apply.
- Change exactly one existing file: `frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-attendance-and-lock.dom.spec.ts`. Change no other file (never touch `scripts/automation/*`, never change production code). If a test fails because of production code, keep the assertion, stop, and describe the failure in the report.
- No `it.skip`, no `xit(`, no `fit(`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (read only these):
- The spec file itself (whole file). Today it does not compile: it calls an old API that step 4.4-c removed (`currentPeriodSummary`, `lockAndSubmitPeriod`, `revisionReasonText`, `confirmRevision()` without argument, `selectedSection`, `fetchPeriodData`).
- `frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-attendance/supervisor-attendance.ts` and `.html` (whole files): the attendance hub. The revision modal is now `openRevision(item)` style plus `confirmRevision(reasonText: string)`, `revisionTargetItem`, `revisionServerError`; Grep `confirmRevision`, `revisionTargetItem`, `activeSubTab`, `postCartableAction`.
- `frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-period-lock/supervisor-period-lock.ts` and `.html` (whole files): the period hub. It no longer locks anything itself: it loads sections (`mySections`, `selectedSectionId`), lists `periods` from `fetchPeriods()` with `year_month` and `section_id`, shows `statusClass(status)` badges and links to the workflow (my-tasks). Locking and submitting a period happen in the workflow engine now.

3. Task: rewrite the spec so it compiles and passes against the current components. Keep the 14 numbered `it` blocks and their intent, mapped to the current behaviour:
- Items about attendance (1, 2, 7, 9, 10, 11, 12): keep them on the attendance hub with the current method and field names. Item 12: empty reason → `confirmRevision('')` sends nothing (no `postCartableAction` call); `confirmRevision('ساعات اضافه کار مغایرت دارد')` sends one call with `action: 'revision'` and the item `id`, and `window.prompt` is never called.
- Items about the period hub (3, 4, 5, 6, 8, 13, 14): set `selectedSectionId` (not `selectedSection`), call `fetchPeriods()` (not `fetchPeriodData()`), and assert what the hub shows today: the request carries `section_id` and `year_month`; `periods` holds the mocked rows; locked and open periods get different `statusClass` values and render different badges; the page has no lock button (the old lock action is gone) and shows the workflow link if the template has one; an error response sets `loadFailed`. Rename each `it` title so it says what it really checks (Persian titles are fine).
- Mock only the services the components inject (copy the existing TestBed setup; adjust mocks to the method names the components call today, Grep them in the two `.ts` files).
- If `fs`/`path` imports break compilation in the runner tsconfig, replace the template loading with the approach used by `frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-disbursements/treasurer-disbursements-45d.dom.spec.ts` (read its first 60 lines).

4. Tool policy: only reading the listed files, Grep in `frontend/src/app/modules/accounting/` and `frontend/src/app/core/services/`, writing the spec file, the test command below, `git add` of that file, `git commit`, `git status --short`. Test command, in the repository root: `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/supervisor/supervisor-attendance-and-lock.dom.spec.ts"`; per-test log `scratch/logs/runner/ngtest-head.log`. If a test fails, read the error, fix the test (not production code), rerun at most 5 times.

5. Verification: the test command passes with 0 failed and the file compiles.

6. Output: commit only that file with the message `test(release-v1 4.6-b): supervisor attendance and period DOM spec on the current API`; `git status --short` prints nothing. Report in English: number of tests, result, commit hash. Then stop.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.6-b: fleet scope and sensitive-data API tests

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_fleet_46_scope.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_fleet_46_scope.py --contains "bank-accounts" --contains "workflow-audit-logs" --contains "status_code, 404" --contains "status_code, 403" --contains "fleet-settlement" --absent "skip(" --absent "expectedFailure"
verify: set DB_TEST_NAME=test_agy_fleet46scope&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_fleet_46_scope --min-tests 8
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.6-b): fleet scope and sensitive-data API tests"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 6 and 10 apply.
- Create exactly one new file: `backend/modules/accounting/personnel/test_fleet_46_scope.py`. Change no other file (never touch `scripts/automation/*`). Never change production code. If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. If `git status` shows files you did not create, leave them alone and do not commit them.
- No `skip` and no `expectedFailure`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude; read only these):
- `backend/modules/accounting/personnel/test_fleet_46_vehicle_workflow.py` (whole file): working fixtures for companies, sections, users with section-scoped fleet permissions and vehicles. COPY its helper methods and imports into your new file; do not import from it. Use usernames with prefix `f46s_` and org codes `F46S...`.
- `backend/modules/accounting/personnel/test_fleet_46_period.py` (whole file): fixtures for trips, section periods, the settlement and treasury URLs.
- `backend/modules/accounting/personnel/fleet_lifecycle_services.py`: Grep `can_view_vehicle_sensitive` and read that function and `mask_vehicle_mapping`.
- `backend/modules/accounting/personnel/views_domains/fleet_views.py`: Grep `url_path=` to find the exact action URLs (`bank-accounts`, `export-excel`, `approve-supervisor`).
- `backend/modules/accounting/personnel/urls.py`: Grep `vehicle`, `workflow-audit-logs`, `fleet-settlement`, `cartable` for the exact routes.

3. Definitions: section A and section B belong to company 1; company 2 has its own section C. A masked value is `******` plus the last 4 characters. Full view = superuser, the vehicle's driver user, or a holder of `perm_approve_fleet_finance` / `perm_approve_fleet_manager` / `view_sys_fleet_settlement` / `perm_treasury_disburse_action` in the vehicle's section.

4. Task — `class Fleet46ScopeTests(TestCase)`, one method each:
- a) `test_supervisor_sees_masked_vehicle`: a supervisor (perm_approve_fleet_supervisor + view_sys_fleet_attendance in section A) GETs an approved vehicle of section A (with driver and owner national codes and a valid sheba): `driver_national_code`, `owner_national_code` and `sheba_number` are masked; the vehicle list returns the same masked values.
- b) `test_finance_in_section_sees_full`: a finance user (perm_approve_fleet_finance in section A) sees the full values for the section A vehicle; a finance user whose permission is only in section B sees them masked for the section A vehicle (or gets 404 if the vehicle is outside their list).
- c) `test_bank_accounts_masked_for_supervisor`: GET the vehicle's `bank-accounts` action as the supervisor → `sheba_number`, `account_number` masked; as the section A finance user → full.
- d) `test_audit_log_metadata_masked`: as the section A finance user PATCH the vehicle sheba while it is `pending_accountant` (or create the vehicle in `draft`, edit it as the creator, so an audit log with a diff exists); then GET `workflow-audit-logs` filtered by `content_type=vehicle` and `object_id` as the supervisor → no full national code or sheba appears anywhere in the JSON text; as superuser the full value appears.
- e) `test_masked_write_keeps_value`: the creator of a `draft` vehicle PATCHes `sheba_number` with the masked string → 200 (or 2xx) and the stored value is unchanged.
- f) `test_other_section_supervisor_gets_403`: a supervisor of section B calls the vehicle's `approve-supervisor` action on a section A vehicle at step `supervisor_ok` → 403 (or 404 if the vehicle is outside their list); the vehicle status is unchanged.
- g) `test_other_company_gets_404`: a user of company 2 GETs a company 1 vehicle → 404; GETs its `bank-accounts` → 404; the fleet settlement with the `period_id` of a company 1 section period → 404.
- h) `test_settlement_requires_permission_and_masks`: a user without `view_sys_fleet_settlement` → 403 on the fleet settlement endpoint; a user with `view_sys_fleet_settlement` but no full view of a vehicle sees its sheba masked in the settlement rows, while a full-view user sees it in full.

5. Tool policy: only reading the listed files, Grep in `backend/modules/accounting/personnel/` and `backend/core/workflow/`, writing the test file, the test command below, `git add` of that file, `git commit`, `git status --short`. Test command, in `backend`: `set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test personnel.test_fleet_46_scope --keepdb` (always with the label; never run `manage.py test` without a label). If a test fails, read the error, fix the test (not production code), and rerun at most 5 times.

6. Before finishing: all 8 tests pass; commit only that file with the message `test(release-v1 4.6-b): fleet scope and sensitive-data API tests`; `git status --short` shows no change of yours.

7. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.
===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.6-c: fleet monthly workflow scenario tests and vehicle form DOM spec

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_fleet_46_workflow.py" --allow "frontend/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle-46c.dom.spec.ts"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_fleet_46_workflow.py --contains "fleet-period-status" --contains "monthly-grid" --contains "action_blocked" --contains "treasury" --absent "skip(" --absent "expectedFailure"
verify: set DB_TEST_NAME=test_agy_fleet46wf&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_fleet_46_workflow --min-tests 6
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle-46c.dom.spec.ts --contains "action_blocked" --contains "******" --absent "it.skip" --absent "xit("
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle-46c.dom.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.6-c): fleet monthly workflow scenario tests and vehicle form DOM spec"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 6 and 10 apply.
- Create exactly two new files: `backend/modules/accounting/personnel/test_fleet_46_workflow.py` and `frontend/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle-46c.dom.spec.ts`. Change no other file (never touch `scripts/automation/*`). Never change production code. If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. If `git status` shows files you did not create, leave them alone and do not commit them.
- No `skip`, no `expectedFailure`, no `it.skip`, no `xit(`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude; read only these):
- `backend/modules/accounting/personnel/test_fleet_46_period.py` (whole file): working fixtures for companies, sections, users with section-scoped fleet permissions, vehicles, trips, section periods, the submit, status, settlement and treasury URLs, and how it advances the `fleet_period` workflow step by step. COPY its helper methods and imports into your new backend file; do not import from it. Use usernames with prefix `f46w_` and org codes `F46W...`.
- `backend/modules/accounting/personnel/workflows.py` lines 1505-1700 (the `fleet_period` workflow: steps `supervisor_ok`, `accountant_review` (sheba gate → `action_blocked`), `manager_ok`, `treasury_pay`; `is_fleet_locked`, `submit_fleet_period`).
- `backend/modules/accounting/personnel/views_domains/trip_views.py`: Grep `submit-fleet-period`, `fleet-period-status`, `monthly-grid`, `fleet_locked` and read those actions.
- `frontend/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle.dom.spec.ts` (whole file): the working TestBed setup (providers, mocks, fixture). COPY its setup into the new spec; do not import from it.
- `frontend/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle.ts`: Grep `isMaskedValue`, `fleetWorkflowErrorText`, `submitDraftVehicle`, `submitDraftToSupervisor`, `onShebaChange`, `onNationalCodeChange`, `onOwnerNationalCodeChange`, `delete (payload as any)` and read those ranges.
- `frontend/src/app/modules/accounting/components/finance/fleet-workflow-ui.ts` (whole file) and `frontend/src/app/modules/accounting/models/personnel.model.ts` (Grep `isMaskedValue`).

3. Definitions: a masked value is `******` plus the last 4 characters (for example `******1234`). `action_blocked` is a 400 response `{code: 'action_blocked', error: '...', missing_fields: [...]}`.

4. Task A — backend `class Fleet46WorkflowTests(TestCase)`, one method each:
- a) `test_status_endpoint_and_grid_follow_workflow`: with fleet trips in section A for a month, GET `fleet-period-status` (section_id, year_month) before submit → `fleet_locked` false and `fleet_approved` false; after submit → `fleet_locked` true, `fleet_workflow_step` is `supervisor_ok`; GET `monthly-grid` with the section → the same `fleet_locked`, `is_locked` true and every `days_meta[].is_editable` false.
- b) `test_accountant_blocked_without_sheba`: a rented vehicle without sheba has trips in the period; after the supervisor approves, the accountant's act returns 400 `action_blocked` and the step stays `accountant_review`.
- c) `test_full_chain_to_paid`: submit → supervisor → accountant → manager → treasury pays with a tracking code via the treasury cartable `disburse_fleet` with `period_id` → every rented trip of the period has `is_settled` true and company-owned vehicle trips are not paid.
- d) `test_treasury_list_only_after_manager`: before the manager approves, the treasury GET has no entry with that period id in `fleet_periods`; after the manager approves it does, with the right `trips_count` and `total_payable`.
- e) `test_second_pay_is_rejected`: paying the same period twice → the second call is a 4xx and no trip is settled twice (settled count unchanged).
- f) `test_manager_return_unlocks`: the manager returns the period with a reason → `fleet_locked` false and a trip write in the period succeeds again; resubmitting starts at `supervisor_ok`.

5. Task B — frontend `employee-new-vehicle-46c.dom.spec.ts`, describe `EmployeeNewVehicleHubComponent (Release v1 step 4.6-c)`, 3 cases:
- a) a masked `sheba_number` (`IR******1234` or `******1234`) loaded into the edit form gives no sheba validation error and the national-code validator gives no error for a masked national code.
- b) saving an edited existing vehicle whose `driver_national_code` and `sheba_number` are still masked calls the update API with a payload that does NOT contain those two keys.
- c) when submit returns 400 `{code:'action_blocked', missing_fields:['sheba_number','driver_name']}`, the toast message contains the Persian labels from `VEHICLE_FIELD_LABELS_FA` for both fields.

6. Tool policy: only reading the listed files, Grep in `backend/modules/accounting/personnel/`, `backend/core/workflow/` and `frontend/src/app/modules/accounting/`, writing the two files, the test commands below, `git add` of those two files, `git commit`, `git status --short`. Backend test command, in `backend`: `set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test personnel.test_fleet_46_workflow --keepdb` (always with the label; never run `manage.py test` without a label). Frontend test command, in the repository root: `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle-46c.dom.spec.ts"`; per-test log `scratch/logs/runner/ngtest-head.log`. If a test fails, read the error, fix the test (not production code), rerun at most 5 times each.

7. Before finishing: all 6 backend tests and 3 frontend cases pass; commit only the two files with the message `test(release-v1 4.6-c): fleet monthly workflow scenario tests and vehicle form DOM spec`; `git status --short` shows no change of yours.

8. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.
===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.7-b: accounting report scope tests and export header tests

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/modules/accounting/personnel/test_reports_47.py" --allow "backend/modules/accounting/personnel/test_exports_47_headers.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_reports_47.py --contains "unpaid-invoices" --contains "petty-cash" --contains "bank-payments" --contains "labor-cost" --contains "fleet-cost" --contains "debt_breakdown" --absent "skip(" --absent "expectedFailure"
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/test_exports_47_headers.py --contains "freeze_panes" --contains "A3" --contains "F3" --contains "export-monthly-excel" --contains "reports/" --absent "skip(" --absent "expectedFailure"
verify: set DB_TEST_NAME=test_agy_reports47&& python scripts/automation/verify_tools.py django-tests --labels personnel.test_reports_47 personnel.test_exports_47_headers --min-tests 14
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.7-b): accounting report scope tests and export header tests"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 6 and 10 apply.
- Create exactly two new files: `backend/modules/accounting/personnel/test_reports_47.py` and `backend/modules/accounting/personnel/test_exports_47_headers.py`. Change no other file (never touch `scripts/automation/*`). Never change production code. If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. If `git status` shows files you did not create, leave them alone and do not commit them.
- No `skip`, no `expectedFailure`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude; read only these):
- `backend/modules/accounting/personnel/test_reports_47_core.py` (whole file): working fixtures (`FiscalFixtures`, `make_invoice`, `member` with `grant_section_perms`), the reports URL prefix `/api/personnel/reports/` and how an xlsx response is opened with `openpyxl`. COPY its helpers into your files; do not import from it. Use usernames with prefix `r47_` and invoice numbers with prefix `R47T-`.
- `backend/modules/accounting/personnel/views_domains/report_views.py` (whole file): report keys, query parameters (`company_id`, `section_id`, `project_id`, `date_from`, `date_to`, `group_by`, `page`, `page_size`), 403/404/400 rules, masking of bank numbers (`FULL_BANK_PERMS`).
- `backend/modules/accounting/personnel/accounting_reports.py` (whole file): the output keys of each report.
- `backend/modules/accounting/personnel/models_domains/treasury_audit.py`: Grep `def debt_breakdown`, `def annotate_debt`, `class InvoicePayment`, `class PettyCashTransaction` and read those ranges.
- `backend/modules/accounting/personnel/test_petty_cash_42.py`, `test_invoice_payments_41.py`, `test_payroll_45_excel.py`, `test_fleet_46_period.py`, `test_phase5_excel_and_endpoints.py`: Grep their setUp and helper methods only, to copy how petty accounts/transactions, invoice payments, monthly payroll records, trips and existing Excel exports are created and called.
- Existing export endpoints (under `/api/personnel/`): `counterparties/export-excel/`, `expense-invoices/export-excel/`, `petty-cash-transactions/export-excel/`, `profiles/export-excel/`, `vehicles/export-excel/`, `attendance/export-monthly-excel/`, `trips/export-monthly-excel/`, `monthly-payroll/export-monthly-excel/`. Read the `@action` method of each (Grep `url_path='export-` in `backend/modules/accounting/personnel/views_domains/`) for its required query parameters.

3. Definitions: a masked value is `******` plus the last 4 characters (for example `******1234`). Header rule: row 1 holds Persian titles, row 2 holds latin keys (ASCII, snake_case), `ws.freeze_panes == 'A3'` (monthly attendance export: `'F3'`). Shamsi date: text matching `^1[34]\d\d/\d\d/\d\d` (no Gregorian `20xx-` date in a date column).

4. Task A — `test_reports_47.py`, `class Reports47Tests`, one method each:
- a) `test_expense_excludes_draft_and_rejected_and_rejected_petty_line`: draft and rejected invoices and a rejected petty expense line add nothing to `expense`; the total equals (amount − vat) of approved invoices plus approved petty expenses.
- b) `test_unpaid_remainder_and_age_after_partial_payment`: an approved invoice partly paid with an `InvoicePayment` shows remainder = amount − paid and the right age bucket in `unpaid-invoices`.
- c) `test_petty_debt_equals_debt_breakdown`: `petty-cash` debt of an account equals `debt_breakdown()` of that account.
- d) `test_no_report_perm_is_403`: a section member with invoice perms but without `perm_accounting_reports` gets 403 on every report key.
- e) `test_other_company_and_section_is_404`: `company_id` or `section_id` of another company → 404.
- f) `test_single_section_member_sees_only_own_section`: two sections with invoices; a member of section A sees only A's numbers.
- g) `test_labor_cost_needs_payroll_perm` and `test_fleet_cost_needs_fleet_perm`: 403 without `view_sys_payroll` / `view_sys_fleet_settlement`, 200 with it; the labor-cost response contains no person name or national code.
- h) `test_bank_numbers_masked_for_accountant`: in `bank-payments` an accountant (report perm only) sees masked sheba and account number; a user with `perm_treasury_disburse_action` at company level sees them in full.

5. Task B — `test_exports_47_headers.py`, `class Exports47HeaderTests`:
- a) one method per existing export endpoint listed in section 2 (8 methods): status 200, row 1 Persian, row 2 latin keys, freeze `A3` (attendance `F3`), every date cell Shamsi.
- b) `test_sensitive_columns_masked_without_perm`: personnel and vehicle exports for a user without the sensitive-field permission show sheba and national code masked.
- c) `test_report_exports_two_header_rows`: each of the six report `export-excel/` endpoints: row 1 Persian, row 2 latin, freeze `A3`; the bank-payments export masks sheba for an accountant exactly as the API does.

6. Tool policy: only reading the listed files, Grep in `backend/modules/accounting/personnel/` and `backend/core/`, writing the two files, the test command below, `git add` of those two files, `git commit`, `git status --short`. Test command, in `backend`: `set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test personnel.test_reports_47 personnel.test_exports_47_headers --keepdb` (always with labels; never run `manage.py test` without a label). If a test fails, read the error, fix the test (not production code), rerun at most 5 times.

7. Before finishing: all tests pass; commit only the two files with the message `test(release-v1 4.7-b): accounting report scope tests and export header tests`; `git status --short` shows no change of yours.

8. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.
===

[DONE] [ ] Session 1 of 1 — Release v1 step 4.7-c: accounting reports page and manager dashboard DOM specs

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/manager/manager-reports/manager-reports-47.dom.spec.ts" --allow "frontend/src/app/modules/accounting/components/finance/manager/manager-dashboard/manager-dashboard-47.dom.spec.ts"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/manager/manager-reports/manager-reports-47.dom.spec.ts --contains "getAccountingReport" --contains "exportAccountingReport" --contains "group_by" --contains "labor-cost" --contains "fleet-cost" --absent "it.skip" --absent "xit("
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/manager/manager-dashboard/manager-dashboard-47.dom.spec.ts --contains "dashboard-summary" --contains "personnel_count" --contains "WorkflowTasksService" --absent "it.skip" --absent "xit("
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/manager/manager-reports/manager-reports-47.dom.spec.ts" --include "src/app/modules/accounting/components/finance/manager/manager-dashboard/manager-dashboard-47.dom.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(release-v1 4.7-c): accounting reports page and manager dashboard DOM specs"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7 and 10 apply.
- Create exactly two new files: `frontend/src/app/modules/accounting/components/finance/manager/manager-reports/manager-reports-47.dom.spec.ts` and `frontend/src/app/modules/accounting/components/finance/manager/manager-dashboard/manager-dashboard-47.dom.spec.ts`. Change no other file (never touch `scripts/automation/*`). Never change production code. If a test fails because of production code, keep the assertion as written, stop, and describe the failure in the report.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. If `git status` shows files you did not create, leave them alone and do not commit them.
- No `skip`, no `expectedFailure`, no `it.skip`, no `xit(`.
- Run every command in the foreground and wait until it finishes. Never start a command in the background.

2. Context (committed by Claude; read only these):
- `frontend/src/app/modules/accounting/components/finance/manager/manager-reports/manager-reports.ts` and `.html` (whole files): the reports page. It injects `AuthService` (`hasPermission`), `PersonnelApiService` (`getAccountingReport(key, params)`, `exportAccountingReport(key, params)`, `getFinancialProjects`, `getProjectSections`), `CompanyApiService` (`getUserAvailable` returning `{companies: [...]}`), `NetworkStatusService` (`isOnline`, `state$`), `ToastService`. It imports `saveBlob` and `printWindow` from `frontend/src/app/core/platform/file-output.ts` (mock that module with `vi.mock`).
- `frontend/src/app/modules/accounting/components/finance/manager/manager-dashboard/manager-dashboard.ts` and `.html` (whole files): injects `PersonnelApiService`, `NetworkStatusService`, `Router`, `WorkflowTasksService` (uses `refresh()`, `loaded()`, `count()`, `isStale()`).
- `frontend/src/app/modules/accounting/models/accounting-reports.model.ts` (whole file): the response shapes.
- `frontend/src/app/modules/accounting/components/finance/accountant/accountant-payroll/accountant-payroll-45d.dom.spec.ts` lines 1-140: a working TestBed setup (jsdom header comment, `initTestEnvironment`, provider mocks, `NetworkStatusService` handling). COPY that setup style; do not import from it.

3. Definitions: the offline message is the component field `offlineMessage`; compare against `component.offlineMessage`, never retype the Persian text. A 400 error is `new HttpErrorResponse({ status: 400, error: { error: 'X400' } })`.

4. Task A — `manager-reports-47.dom.spec.ts`, describe `ManagerReportsComponent (Release v1 step 4.7-c)`, one `it` each:
- a) tabs by permission: with `hasPermission` returning false for everything, `component.tabs` ids are exactly `expense`, `unpaid-invoices`, `petty-cash`, `bank-payments`; with `view_sys_payroll` and `view_sys_fleet_settlement` true (new fixture), the ids also contain `labor-cost` and `fleet-cost`.
- b) filters to API params: set `component.companyId = 5`, `component.sectionId = 7`, `component.groupBy = 'section'`, date controls `1405/08/01` and `1405/08/30`, call `component.load()` → `getAccountingReport` last called with key `expense` and params containing `company_id: 5`, `section_id: 7`, `group_by: 'section'`, `date_from: '1405/08/01'`, `date_to: '1405/08/30'`.
- c) unpaid-invoices: `onTabChange('unpaid-invoices')` → params have `page: 1` and `page_size` and no `date_from`/`date_to`.
- d) offline: with the network offline before `detectChanges`, the rendered text contains `component.offlineMessage`, the Excel button (`button[aria-label]` whose aria-label contains the word for Excel used in the template — read it from the html) is disabled, and `getAccountingReport` was not called.
- e) Excel: online with a loaded expense result, calling `component.exportExcel()` calls `exportAccountingReport` with key `expense` and params without `page`, then the mocked `saveBlob` is called once.
- f) 400: `getAccountingReport` returns `throwError(() => new HttpErrorResponse({status: 400, error: {error: 'X400'}}))` → after `load()` and `detectChanges`, the page text contains `X400`.

5. Task B — `manager-dashboard-47.dom.spec.ts`, describe `ManagerDashboardComponent (Release v1 step 4.7-c)`, 3 cases:
- a) `getAccountingReport` is called with `dashboard-summary`; with two rows (`section_name` `SecA`/`SecB`, `month_expense`, `personnel_count`, `vehicle_count`), the rendered text contains `SecA` and `SecB`.
- b) no budget column: the rendered table header text does not contain the Persian words for budget or variance used by the old page (assert the template contains no `budget` binding: `fixture.nativeElement.innerHTML` does not contain `budget` and `variance`).
- c) my-tasks: a mock `WorkflowTasksService` with `loaded()` true and `count()` 3 → `refresh` was called and the rendered text contains the Persian digit 3 (`۳`); calling `component.goToMyTasks()` navigates to `/app/my-tasks`.

6. Tool policy: only reading the listed files, Grep in `frontend/src/app/modules/accounting/` and `frontend/src/app/core/`, writing the two files, the test command below, `git add` of those two files, `git commit`, `git status --short`. Test command, in the repository root: `python scripts/automation/verify_tools.py ng-test-compare --base HEAD --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/manager/manager-reports/manager-reports-47.dom.spec.ts" --include "src/app/modules/accounting/components/finance/manager/manager-dashboard/manager-dashboard-47.dom.spec.ts"`; per-test log `scratch/logs/runner/ngtest-head.log`. If a test fails, read the error, fix the test (not production code), rerun at most 5 times.

7. Before finishing: all 9 cases pass; commit only the two files with the message `test(release-v1 4.7-c): accounting reports page and manager dashboard DOM specs`; `git status --short` shows no change of yours.

8. Output and stop condition: a short English report: tests run and result, any test you could not make pass with the reason, the commit hash. End the turn after the report.

===

[DONE] [ ] Session 1 of 2 — Release v1 stage 4 final close-out on the local app environment: backup, migration 0019, the four open-workflow commands, a temporary QA scenario company, patched frontend build; the runner restarts Daphne and the GDrive worker and runs the health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: backend\venv\Scripts\python.exe -X utf8 backend\manage.py migrate --check
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py restart-worker
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session is a release only. Do not edit, create, stage or commit any tracked file. Do not run `git` commands that change the working tree or history.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`. The runner restarts Daphne and the GDrive worker itself after your turn.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`.
- Do not run `run_auto_backup`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `backend/backups/` or `frontend/dist/`.
- Never roll back a migration (`migrate personnel 0018` or similar is forbidden).
- Never print the content of `scratch/qa_scenario_credentials.txt` in your report; it holds test passwords.

2. Context: Release v1 stage 4 (steps 4.3 to 4.7: personnel file, attendance, payroll, fleet, accounting reports) changed backend and frontend code. One migration is unapplied on the app database: `personnel 0019_payroll_petty_cash_deduction` (two added columns with defaults; reviewed for data loss and name collisions). Four management commands open engine workflow instances for documents that were already in flight before the new workflow engine; each is idempotent, deletes nothing, and supports `--dry-run`. A temporary QA scenario company (`QA-SCN`, users `qa_scn_*`) is created for a login check that runs after this session; a later session deletes it. The app database holds test data only. Your terminal may be PowerShell; if so, set environment variables with `$env:PYTHONUTF8='1';` and `$env:WH_ALLOW_SCENARIO_SEED='1';`.

3. Task, in this order (all `manage.py` commands in `backend`, with `PYTHONUTF8=1`):
- a) Backup:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app stage 4 final'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0. Do not continue without a successful backup.
- b) Migration list: `.\venv\Scripts\python.exe manage.py showmigrations --plan` and note every `[ ]` line.
- c) Migrate: `.\venv\Scripts\python.exe manage.py migrate --noinput`. If it fails, stop and report the last 40 lines of the error; do not try to fix it, and never fake or skip migrations.
- d) Check: `.\venv\Scripts\python.exe manage.py migrate --check` exits 0, and `.\venv\Scripts\python.exe manage.py check` prints no errors.
- e) Open-workflow commands. For each of `personnel_open_workflows`, `attendance_open_workflows`, `fleet_open_workflows`, `payroll_open_workflows`, in this order: first run it with `--dry-run`, then without it, then once more without it. Note the summary line of each run. The third run of each command must open nothing new (idempotent). If a command fails, report its last 30 lines and continue with the next command.
- f) QA scenario company: with `WH_ALLOW_SCENARIO_SEED=1`, run `.\venv\Scripts\python.exe manage.py seed_scenario`. It writes the test users and passwords to `scratch/qa_scenario_credentials.txt` (outside git). Report only the number of lines in that file and the usernames (first column), never the passwords.
- g) Frontend build. In `frontend`, run `npx ng build --delete-output-path=false` in the foreground and wait for it to finish, then run `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.

4. Tool policy: only the commands above, `git status --short`, and reading the credentials file to count its lines. Run the build at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the backup filename and size, the `[ ]` migrations found in step b, the migrate result, the three summary lines of each open-workflow command, the QA usernames, the build result (errors and warnings count) and the patch script line. Write the report only after the build and the patch have finished. No commit. End the turn after the report.

===

[DONE] [ ] Session 2 of 2 — Release v1 stage 4 final close-out: web build with the two browser-check fixes, staging APK build and install on the emulator, Android smoke check of the manager dashboard and the accounting reports page with the QA scenario manager, then delete the QA scenario company

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py text-check --file scratch/logs/apk4f_install.txt --contains Success
verify: backend\venv\Scripts\python.exe -X utf8 scratch/heavy/check_4final.py
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- This is an operational task on the local test environment `app` (this Windows machine, test data only, no real users). Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`. Build only the STAGING APK (`ir.comanage.soft.test`); do not publish it.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running. The only exception is the emulator, which runs in its own Windows Terminal tab.
- Do not edit, create, stage or commit any tracked file. Write only under `scratch/logs/`. Never print the content of any file in `E:\warehouse-secrets\`.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill`; do not kill any `node` process.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `backend/backups/`, `backend/media/` or `frontend/dist/`.
- The test passwords are in `scratch/qa_scenario_credentials.txt` (one user per line, tab-separated: username, password, role, scope). Never print a password in your reply, in a log you write, or in a file name. Pass it only to `adb shell input text`.
- adb is `E:\Android\Sdk\platform-tools\adb.exe` (call it by full path).

2. Context:
- Session 1 released stage 4 on `app` (backup, migration 0019, open-workflow commands, web build) and created the QA scenario company `QA-SCN` with users `qa_scn_*`. After it, commit `0429a8d6` fixed two frontend defects found in a browser check (the accounting reports page and the manager dashboard crashed on open; the accountant could not open the reports page). The web build on `app` must be rebuilt to include that fix.
- The staging APK (app id `ir.comanage.soft.test`, activity `ir.comanage.soft.MainActivity`) talks to `https://app.farsalish.ir`. Emulator AVD `AndroidTest15`, screen 1080x2400. On the login page the username field centre is about (540, 1130), the password field about (540, 1338), the login button «ورود به سامانه» about (540, 1655).
- Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';` and `$env:WH_ALLOW_SCENARIO_SEED='1';`.

3. Task, in this order:
- a) Web build in `frontend`: `npx ng build --delete-output-path=false`, wait for it to finish, then `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.
- b) Copy `E:\warehouse-secrets\comanage\google-services.json` to `frontend\android\app\google-services.json` (it is git-ignored; confirm with `git status --short` that it does not appear). Then in `frontend`: `npm run build:mobile-test`, then in `frontend\android`: `.\gradlew.bat assembleStagingDirectRelease`.
- c) `adb devices`. If `emulator-5554` is not listed as `device`, start it with `wt.exe -w 0 new-tab --title "Android Emulator" cmd /k "E:\Android\Sdk\emulator\emulator.exe -avd AndroidTest15"` and repeat `adb shell getprop sys.boot_completed` (pause at most 15 seconds between tries, at most 12 tries) until it prints 1. Then from the repo root: `adb install -r "frontend\android\app\build\outputs\apk\stagingDirect\release\app-staging-direct-release.apk" > scratch\logs\apk4f_install.txt` and read that file; it must contain `Success`.
- d) Android smoke check with the user `qa_scn_manager` (its password is the second column of its line in `scratch/qa_scenario_credentials.txt`): `adb shell pm clear ir.comanage.soft.test`, then `adb shell am start -n ir.comanage.soft.test/ir.comanage.soft.MainActivity`, wait about 10 seconds, save `adb exec-out screencap -p > scratch/logs/android4f_login.png`. Tap the username field, `adb shell input text qa_scn_manager`; tap the password field, `adb shell input text <password>`; tap «ورود به سامانه»; wait about 10 seconds. If the app shows the launcher or asks to choose a system, choose the accounting one («مالی» / «حسابداری»). Open «داشبورد مدیریتی» (side menu; the menu button opens it), wait about 6 seconds, save `scratch/logs/android4f_dashboard.png`. Then open «گزارش‌های مدیریتی», wait about 6 seconds, save `scratch/logs/android4f_reports.png`. To find elements use `adb shell uiautomator dump /sdcard/ui.xml`, `adb pull /sdcard/ui.xml scratch/logs/ui.xml`, read the XML and tap the centre of the node `bounds`; if the XML has no web nodes, use screenshots and the coordinates above.
- e) Delete the QA scenario company, in `backend`: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_scenario --purge > ..\scratch\logs\purge4f.txt 2>&1`, then read that file. Do this even if step d failed.

4. Tool policy: only the commands above, `git status --short`, `Copy-Item`, `Get-Content`/`Select-String` for reading, and `adb` (devices, install, shell input, shell am, shell pm clear, shell getprop, shell uiautomator dump, pull, exec-out screencap). Each build at most twice, Gradle at most twice, at most 45 adb calls. If a step fails, read its output, change approach, and if it still fails report the exact error and continue with step e.

5. Before finishing: the three screenshots exist; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the web build result and the patch line, the APK path and size, the install result, what the dashboard and the reports page showed on Android (any error message, any horizontal scroll, which subtabs were visible), and the last line of `scratch/logs/purge4f.txt`. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 5-b: version sync tool test, what's new dialog and Live Update ready bar specs

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

===

[DONE] [ ] Session 1 of 2 — Release v1 step 5-c on the local app environment: backup, web build, staging APK 1.0.0 build and badging check, publish it on the app download path, FCM key yes/no; the runner restarts Daphne and runs the health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: backend\venv\Scripts\python.exe -X utf8 scratch/heavy/check_5c.py s1
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session is a release only. Do not edit, create, stage or commit any tracked file. Write only under `scratch/logs/`. Do not run `git` commands that change the working tree or history.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`. The runner restarts Daphne after your turn.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`. Build only the STAGING APK (`ir.comanage.soft.test`), never a prod APK.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `backend/backups/`, `backend/media/` or `frontend/dist/`.
- Never print the content of any file in `E:\warehouse-secrets\`, and never print the value of `FIREBASE_CREDENTIALS_FILE` or any key path.

2. Context: Release v1 step 5-c (commit `11506789`) added the management command `send_test_push`, a persistent-storage request at app start and a queue send when the Android app returns to the foreground. Step 5-b set the app version to `1.0.0` (`versionCode 10000`, one source: `frontend/package.json`). The previous staging APK on the emulator has `versionCode 2`. The APK download path on `app` is `/api/public/mobile-files/apk/<file>`; the command `publish_mobile_apk --apk <path> --version 1.0.0 --channel direct --env staging` copies the APK there as `CoManage-1.0.0-direct-test.apk` and prints the public path. Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order (all `manage.py` commands in `backend`, with `PYTHONUTF8=1`):
- a) Backup:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app step 5-c'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0.
- b) Web build in `frontend`: `npx ng build --delete-output-path=false`, wait for it to finish, then `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.
- c) Copy `E:\warehouse-secrets\comanage\google-services.json` to `frontend\android\app\google-services.json` (it is git-ignored; confirm with `git status --short` that it does not appear). Then in `frontend`: `npm run build:mobile-test`, then in `frontend\android`: `.\gradlew.bat assembleStagingDirectRelease`.
- d) Badging: `E:\Android\Sdk\build-tools\36.0.0\aapt.exe dump badging frontend\android\app\build\outputs\apk\stagingDirect\release\app-staging-direct-release.apk > scratch\logs\apk5c_badging.txt` (from the repo root; if `aapt.exe` is missing there, use `35.0.0`). Read the first line of that file: it must show package `ir.comanage.soft.test`, `versionCode='10000'` and `versionName='1.0.0'`.
- e) Publish, in `backend`: `.\venv\Scripts\python.exe manage.py publish_mobile_apk --apk ..\frontend\android\app\build\outputs\apk\stagingDirect\release\app-staging-direct-release.apk --version 1.0.0 --channel direct --env staging` and note the printed path.
- f) Download setting and FCM key, in `backend`: `.\venv\Scripts\python.exe manage.py shell -c "import os; from django.conf import settings; from settings_core.services import get_setting; f = getattr(settings, 'FIREBASE_CREDENTIALS_FILE', ''); print('FCM key set:', bool(f)); print('FCM key file exists:', bool(f) and os.path.isfile(f)); print('direct download url:', get_setting('app_download_url_direct'))"`. If `get_setting` does not exist, replace that part with `from settings_core.models import SystemSetting; print('direct download url:', SystemSetting.objects.filter(key='app_download_url_direct').values_list('value', flat=True).first())`. Do not change any setting.

4. Tool policy: only the commands above, `git status --short`, `Copy-Item`, and `Get-Content`/`Select-String` for reading files under `scratch/logs/`. The web build at most twice, Gradle at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `scratch/logs/apk5c_badging.txt` exists; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the backup filename and size, the web build result and the patch line, the APK path and size, the badging first line, the publish path, the two FCM yes/no lines and the direct download URL value. No commit. End the turn after the report.

===

[DONE] [ ] Session 2 of 2 (stopped on emulator start; rest moved to Session 3) — Release v1 step 5-c on the Android emulator: install the 1.0.0 staging APK over the old one, temporary QA company, version line in the user menu, test push and tap to my tasks, airplane-mode queue scenario, back button with a dialog open, then delete the QA company

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: backend\venv\Scripts\python.exe -X utf8 scratch/heavy/check_5c.py s2
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- This is an operational task on the local test environment `app` (this Windows machine, test data only, no real users). Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`. Do not build anything in this session.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running. The only exception is the emulator, which runs in its own Windows Terminal tab.
- Do not edit, create, stage or commit any tracked file. Write only under `scratch/logs/`. Never print the content of any file in `E:\warehouse-secrets\`.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill`; do not kill any `node` process.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `backend/backups/`, `backend/media/` or `frontend/dist/`.
- The test passwords are written by `seed_scenario` to `scratch/qa_scenario_credentials.txt` (one user per line, tab-separated: username, password, role, scope). Never print a password in your reply, in a log you write, or in a file name. Pass it only to `adb shell input text`.
- adb is `E:\Android\Sdk\platform-tools\adb.exe` (call it by full path).

2. Context:
- Session 1 built and published the staging APK `1.0.0` (`versionCode 10000`) at `frontend\android\app\build\outputs\apk\stagingDirect\release\app-staging-direct-release.apk`. The emulator may still have the old staging APK with `versionCode 2`; install with `-r` over it, never uninstall it first.
- The staging app (id `ir.comanage.soft.test`, activity `ir.comanage.soft.MainActivity`) talks to `https://app.farsalish.ir`. Emulator AVD `AndroidTest15`, screen 1080x2400. On the login page the username field centre is about (540, 1130), the password field about (540, 1338), the login button «ورود به سامانه» about (540, 1655).
- New in this step: the backend command `send_test_push --username <u>` creates an in-app notification titled «اعلان آزمایشی» through the normal path and sends an FCM push when the key is configured; tapping it opens «کارهای من» (`/app/my-tasks`). When the Android app returns to the foreground it sends the offline queue. The user menu shows a line «نسخهٔ ۱٫۰٫۰».
- Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';` and `$env:WH_ALLOW_SCENARIO_SEED='1';`.

3. Task, in this order (`manage.py` commands in `backend`, with `PYTHONUTF8=1`):
- a) QA company: `$env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_scenario`. Note only the usernames (first column of `scratch/qa_scenario_credentials.txt`). Use `qa_scn_manager` for steps c to e. For step f use the user whose role column names the employee (ثبت‌کننده / کارمند); if there is none, use `qa_scn_manager`.
- b) `adb devices`. If `emulator-5554` is not listed as `device`, start it with `wt.exe -w 0 new-tab --title "Android Emulator" cmd /k "E:\Android\Sdk\emulator\emulator.exe -avd AndroidTest15"` and repeat `adb shell getprop sys.boot_completed` (pause at most 15 seconds between tries, at most 12 tries) until it prints 1. Then from the repo root: `adb install -r "frontend\android\app\build\outputs\apk\stagingDirect\release\app-staging-direct-release.apk" > scratch\logs\apk5c_install.txt` and read that file; it must contain `Success`. Then `adb shell dumpsys package ir.comanage.soft.test` and note the `versionCode` and `versionName` lines.
- c) Login and version line: `adb shell pm clear ir.comanage.soft.test`, `adb shell pm grant ir.comanage.soft.test android.permission.POST_NOTIFICATIONS`, then `adb shell am start -n ir.comanage.soft.test/ir.comanage.soft.MainActivity`, wait about 10 seconds. Tap the username field, `adb shell input text qa_scn_manager`; tap the password field, `adb shell input text <password>`; tap «ورود به سامانه»; wait about 10 seconds. If the app asks to choose a system, choose the accounting one. If the app asks for notification permission, allow it. Open the user menu (the avatar/user button in the header) and save `adb exec-out screencap -p > scratch/logs/android5c_menu.png`; note whether the version line is visible. Close the menu (back button).
- d) Push: wait about 10 seconds so the app registers its device token, then in `backend`: `.\venv\Scripts\python.exe manage.py send_test_push --username qa_scn_manager > ..\scratch\logs\push5c_cmd.txt 2>&1` and read that file. Wait about 10 seconds, then from the repo root `adb shell dumpsys notification --noredact > scratch\logs\push5c_dumpsys.txt`. Open the notification shade with `adb shell cmd statusbar expand-notifications`, save `scratch/logs/android5c_push.png`, tap the notification of the app (find it with `uiautomator dump`), wait about 6 seconds, save `scratch/logs/android5c_mytasks.png`. If no push arrived (for example the command printed that the FCM key is not configured or the user has 0 devices), still save both screenshots (open «کارهای من» from the bell in the app instead) and report the reason.
- e) Back button with a dialog open: in the app open any dialog (for example the bell panel or a «جدید» form), press `adb shell input keyevent KEYCODE_BACK` once, wait 2 seconds and save `scratch/logs/android5c_backbutton.png`. Report whether the dialog closed and the app stayed open.
- f) Offline queue (log out and log in as the step-a employee user if it differs from the manager): `adb shell cmd connectivity airplane-mode enable`, wait 5 seconds. In the app register one petty cash expense («تنخواه» → new expense; fill only the required fields with small test values) and, if the user can, one invoice draft («فاکتور» → new; save as draft). While filling a field low on the form, save `scratch/logs/android5c_keyboard.png` once with the keyboard open and report whether the focused field stayed visible above the keyboard. Then close the app fully with `adb shell am force-stop ir.comanage.soft.test`, start it again with `am start`, wait about 10 seconds and save `scratch/logs/android5c_offline_queue.png` showing the queue badge or the pending items. Then `adb shell cmd connectivity airplane-mode disable`, wait about 20 seconds with the app in the foreground, and save `scratch/logs/android5c_after_sync.png`. Report how many items were pending before and after.
- g) Delete the QA company, in `backend`: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_scenario --purge > ..\scratch\logs\purge5c.txt 2>&1`, then read that file. Do this even if an earlier step failed. Make sure airplane mode is disabled at the end.

4. Tool policy: only the commands above, `git status --short`, `Get-Content`/`Select-String` for reading, and `adb` (devices, install, shell dumpsys, shell input, shell am, shell pm clear, shell pm grant, shell getprop, shell cmd connectivity, shell cmd statusbar, shell uiautomator dump, pull, exec-out screencap). At most 80 adb calls. To find elements use `adb shell uiautomator dump /sdcard/ui.xml`, `adb pull /sdcard/ui.xml scratch/logs/ui.xml`, read the XML and tap the centre of the node `bounds`; if the XML has no web nodes, use screenshots and the coordinates above. If a step fails, read its output, change approach, and if it still fails report the exact error and continue with the next step; always do step g.

5. Before finishing: the screenshots `android5c_menu.png`, `android5c_push.png`, `android5c_mytasks.png`, `android5c_backbutton.png`, `android5c_offline_queue.png`, `android5c_after_sync.png` exist; airplane mode is off; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the install result and the installed versionCode/versionName, whether the version line was visible, the content of `push5c_cmd.txt` (it holds no secrets), whether `push5c_dumpsys.txt` has a notification of `ir.comanage.soft.test`, whether tapping it opened my tasks, the back-button result, the keyboard result, the pending counts before and after reconnecting (and any error message), and the last line of `scratch/logs/purge5c.txt`. No commit. End the turn after the report.

===

[DONE] [ ] Session 3 — Release v1 step 5-c on the Android emulator (rest of session 2): my tasks from the bell, back button with a dialog open, airplane-mode queue scenario, keyboard check, then delete the QA company

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: backend\venv\Scripts\python.exe -X utf8 scratch/heavy/check_5c.py s3
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Operational task on the local test environment `app` (test data only). Never connect to `soft.farsalish.ir`. Do not build anything.
- The emulator is ALREADY RUNNING (started by Claude in its own Windows Terminal tab). Never start, stop or restart the emulator yourself; never run `emulator.exe`, `wt.exe`, `start`, `Start-Process` or `taskkill`. If `adb devices` does not list `emulator-5554` as `device`, run `adb wait-for-device` once, then `adb shell getprop sys.boot_completed`; if it still does not print 1, do step f only and report "emulator not available".
- Run every command in the foreground and wait until it finishes. Never use `Start-Sleep` or `sleep` longer than 15 seconds; to wait, use `adb shell sleep 10`.
- Do not edit, create, stage or commit any tracked file. Write only under `scratch/logs/`. Never print the content of any file in `E:\warehouse-secrets\`.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`.
- Do not run `migrate`, `makemigrations`, `flush`, any `manage.py test`, or delete files under `backend/backups/`, `backend/media/` or `frontend/dist/`.
- Test passwords are in `scratch/qa_scenario_credentials.txt` (tab-separated: username, password, role, scope). Never print a password; pass it only to `adb shell input text`.
- adb is `E:\Android\Sdk\platform-tools\adb.exe` (call it by full path).

2. Context:
- Session 2 installed the staging APK 1.0.0 (`ir.comanage.soft.test`, activity `ir.comanage.soft.MainActivity`), logged in as `qa_scn_manager`, saved `android5c_menu.png`, ran `send_test_push` and saved `android5c_push.png`. The push did not reach the emulator because this machine cannot reach Google's FCM servers (network); this is known and accepted, do not retry it. The QA company `QA-SCN` (users `qa_scn_*`) still exists.
- Screen 1080x2400. Login page: username field about (540, 1130), password about (540, 1338), button «ورود به سامانه» about (540, 1655).
- To find elements: `adb shell uiautomator dump /sdcard/ui.xml`, `adb pull /sdcard/ui.xml scratch/logs/ui.xml`, read the XML and tap the centre of the node `bounds`; if it has no web nodes, use screenshots (`adb exec-out screencap -p > scratch/logs/<name>.png`, then view it) and the coordinates above.
- Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';` and `$env:WH_ALLOW_SCENARIO_SEED='1';`.

3. Task, in this order:
- a) `adb devices`; `adb shell am start -n ir.comanage.soft.test/ir.comanage.soft.MainActivity`; `adb shell sleep 10`. If the login page shows, log in as `qa_scn_manager` (choose the accounting system if asked).
- b) My tasks: open the bell (notifications) in the app header, tap the notification titled «اعلان آزمایشی», `adb shell sleep 6`, save `scratch/logs/android5c_mytasks.png`. Report whether «کارهای من» opened.
- c) Back button: open any dialog (for example the bell panel or the user menu), `adb shell input keyevent KEYCODE_BACK` once, `adb shell sleep 2`, save `scratch/logs/android5c_backbutton.png`. Report whether the dialog closed and the app stayed open.
- d) Offline queue: log out and log in as the user whose role column names the employee (ثبت‌کننده / کارمند); if none, stay with `qa_scn_manager`. `adb shell cmd connectivity airplane-mode enable`, `adb shell sleep 5`. Register one petty cash expense («تنخواه» → new expense; only the required fields with small test values) and, if the user can, one invoice draft («فاکتور» → new; save as draft). While typing in a field low on the form, save `scratch/logs/android5c_keyboard.png` once and report whether the focused field stayed visible above the keyboard. Then `adb shell am force-stop ir.comanage.soft.test`, `am start` again, `adb shell sleep 10`, save `scratch/logs/android5c_offline_queue.png` (queue badge or pending items). Then `adb shell cmd connectivity airplane-mode disable`, keep the app in the foreground, `adb shell sleep 10` twice, save `scratch/logs/android5c_after_sync.png`. Report the pending counts before and after and any error message.
- e) Make sure airplane mode is disabled: `adb shell cmd connectivity airplane-mode disable`.
- f) Delete the QA company, in `backend`: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_scenario --purge > ..\scratch\logs\purge5c.txt 2>&1`, then read that file. ALWAYS do this step, even if earlier steps failed.

4. Tool policy: only the commands above, `git status --short`, `Get-Content`/`Select-String` for reading, and `adb` (devices, wait-for-device, shell input, shell am, shell sleep, shell getprop, shell cmd connectivity, shell uiautomator dump, pull, exec-out screencap). At most 70 adb calls. If a step fails twice, report the exact error and continue with the next step.

5. Before finishing: airplane mode is off; step f done; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report: my-tasks result, back-button result, keyboard result, pending counts before/after reconnecting (and any error), the last line of `scratch/logs/purge5c.txt`. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 5-d1 on the local app environment: backup, install pywebpush in the venv, create the VAPID key file (never overwrite, never print), add two web push lines to backend/.env if absent, apply notifications migration 0004; the runner restarts Daphne and the worker and checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: backend\venv\Scripts\python.exe -X utf8 scratch/heavy/check_5d1.py
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py restart-worker
verify: python scripts/automation/verify_tools.py release-check --backend-only
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session is a backend release only. Do not edit, create, stage or commit any tracked file. The only files you may write are `backend/.env` (append only, step d), the new key file in step c, and files under `scratch/logs/`. Do not run `git` commands that change the working tree or history.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`. The runner restarts Daphne and the worker after your turn.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`. Do not build the frontend or any APK.
- Do not run `run_auto_backup`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `backend/backups/`, `backend/media/` or `frontend/dist/`. Apply migrations only in step e, only after the backup of step a.
- Never print, display or copy the content of any file in `E:\warehouse-secrets\` or of `backend/.env`. Never run `Get-Content` or `type` on them. Test presence only with `Select-String -Quiet` or `Test-Path`.

2. Context: Release v1 step 5-d1 (latest commit on `main`) added standard Web Push (VAPID) to the backend: model `WebPushSubscription` with migration `notifications 0004_webpushsubscription` (one new table, additive), API under `/api/notifications/webpush/`, the new dependency `pywebpush==2.5.0` in `backend/requirements.txt`, and the command `generate_vapid_keys --out <file>` that creates a PEM private key, refuses to overwrite an existing file and prints only the public key. Settings read `WEBPUSH_VAPID_PRIVATE_KEY_FILE` and `WEBPUSH_VAPID_SUBJECT` from the environment or `backend/.env`. Without the key, web push is off and the bell still works. Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order (all `manage.py` commands in `backend`, with `PYTHONUTF8=1`):
- a) Backup:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app step 5-d1'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0.
- b) Dependencies: `.\venv\Scripts\python.exe -m pip install -r requirements.txt > ..\scratch\logs\pip5d1.txt 2>&1`, then read the last 5 lines of that file. pywebpush 2.5.0 may already be installed; report whether anything new was installed and any error.
- c) VAPID key: `Test-Path E:\warehouse-secrets\comanage\webpush_vapid.pem`. If it prints `False`, run `.\venv\Scripts\python.exe manage.py generate_vapid_keys --out E:\warehouse-secrets\comanage\webpush_vapid.pem` and keep only the line that starts with `Public key:` for the report. If it prints `True`, skip creation and never overwrite or delete the file.
- d) `backend/.env` (append only, never print it):
  - First, only if `(Get-Item .env).Length -gt 0` and `[IO.File]::ReadAllBytes('.env')[-1] -ne 10` is True, run `Add-Content -Path .env -Value '' -Encoding utf8` once so the next line does not join the last line (this reads bytes and prints nothing of the content).
  - `Select-String -Path .env -Pattern '^WEBPUSH_VAPID_PRIVATE_KEY_FILE=' -Quiet`. If it prints `False`, run `Add-Content -Path .env -Value 'WEBPUSH_VAPID_PRIVATE_KEY_FILE=E:\warehouse-secrets\comanage\webpush_vapid.pem' -Encoding utf8`.
  - `Select-String -Path .env -Pattern '^WEBPUSH_VAPID_SUBJECT=' -Quiet`. If it prints `False`, run `Add-Content -Path .env -Value 'WEBPUSH_VAPID_SUBJECT=mailto:admin@farsalish.ir' -Encoding utf8`.
  - Report which lines were added.
- e) Migrations: `.\venv\Scripts\python.exe manage.py showmigrations notifications`, then `.\venv\Scripts\python.exe manage.py migrate notifications > ..\scratch\logs\migrate5d1.txt 2>&1` and read that file. Only `notifications.0004_webpushsubscription` should be applied. If it lists any other migration to apply, or fails, stop and report the exact output.
- f) Check: `.\venv\Scripts\python.exe -X utf8 ..\scratch\heavy\check_5d1.py` (prints OK or FAIL with reasons; it prints no key and no path).

4. Tool policy: only the commands above, `git status --short`, `Test-Path`, `Select-String -Quiet`, `Add-Content` on `backend/.env`, and `Get-Content`/`Select-String` for reading files under `scratch/logs/`. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `scratch/heavy/check_5d1.py` printed OK; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the backup filename and size, the pip result, whether the key file was created or already existed (and the `Public key:` line if created), which `.env` lines were added, the migration output lines, and the check line. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Release v1 step 5-d2 on the local app environment: backup, web build with the ngsw patch (frontend only, no backend restart), check the standard PWA manifest and PNG icons on app.farsalish.ir

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py release-check --frontend-only
verify: backend\venv\Scripts\python.exe -X utf8 scratch/heavy/check_5d2.py
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session is a frontend release only. Do not edit, create, stage or commit any tracked file. Write only under `scratch/logs/`. Do not run `git` commands that change the working tree or history.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`. Do not build any APK.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, `npm ci`, `npm install`, any `manage.py test`, or any command that deletes files under `backend/backups/`, `backend/media/` or `frontend/dist/`.
- Never print the content of any file in `E:\warehouse-secrets\` or of `backend/.env`.

2. Context: Release v1 step 5-d2 (latest commits on `main`) changed only the frontend: a web push service and permission bar, a notification switch and install entry in the user menu, PNG and maskable icons, iOS touch icons and splash screens under `frontend/public/icons/`, and a new manifest (`id: "/"`). The backend is unchanged, so no restart is needed. `frontend/package.json` gained the devDependency `sharp` 0.32.6, which is already installed in `node_modules`; do not install anything. Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order:
- a) Backup, in `backend`:
  `$env:PYTHONUTF8='1'; .\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app step 5-d2'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0.
- b) Web build in `frontend`: `npx ng build --delete-output-path=false > ..\scratch\logs\build5d2.txt 2>&1`, wait for it to finish, then read the last 15 lines of that file. Stop and report if it shows an error. Then `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.
- c) Check, in the repository root: `backend\venv\Scripts\python.exe -X utf8 scratch\heavy\check_5d2.py` (prints OK or FAIL with reasons). If it prints FAIL only because Cloudflare still serves a cached file, wait with one `Start-Sleep -Seconds 15` and run it once more.

4. Tool policy: only the commands above, `git status --short`, and `Get-Content`/`Select-String` for reading files under `scratch/logs/`. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: the build finished without errors, the patch line was printed, `scratch/heavy/check_5d2.py` printed OK, and `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the backup filename and size, the last build line, the patch line and the check line. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 of 3 — Release v1 stage-5 heavy check on the local app environment: backup, web build with the ngsw patch, staging APK 1.0.0 rebuilt from the current main, badging check and install on the running emulator

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py release-check --frontend-only
verify: backend\venv\Scripts\python.exe -X utf8 scratch/heavy/check_5heavy.py s1
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session is a frontend release and an APK build only. Do not edit, create, stage or commit any tracked file. Write only under `scratch/logs/`. Do not run `git` commands that change the working tree or history.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`.
- The Android emulator is ALREADY RUNNING (started by Claude). Never start, stop or restart it; never run `emulator.exe`, `Start-Process` or `start`.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`. Build only the STAGING APK (`ir.comanage.soft.test`), never a prod APK.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, `npm ci`, `npm install`, any `manage.py test`, or any command that deletes files under `backend/backups/`, `backend/media/` or `frontend/dist/`.
- Never print the content of any file in `E:\warehouse-secrets\` or of `backend/.env`.
- adb is `E:\Android\Sdk\platform-tools\adb.exe` (call it by full path).

2. Context: Release v1 stage 5 (Android) is finished in code; this is its final heavy check. The staging APK on the emulator (`ir.comanage.soft.test`, version 1.0.0) was built before steps 5-d2 and 5-heavy, so it lacks the newest web code (Android back button closes the user menu and the bell panel; install and PWA update items hidden inside the native app). The app version stays `1.0.0` (`versionCode 10000`); installing with `-r` over the same version is allowed. Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order:
- a) Backup, in `backend`:
  `$env:PYTHONUTF8='1'; .\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app stage-5 heavy check'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0.
- b) Web build in `frontend`: `npx ng build --delete-output-path=false > ..\scratch\logs\build5h.txt 2>&1`, wait for it to finish, then read the last 15 lines of that file. Stop and report if it shows an error. Then `node tools/patch-ngsw-530.js`; it must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.
- c) Copy `E:\warehouse-secrets\comanage\google-services.json` to `frontend\android\app\google-services.json` (git-ignored; confirm with `git status --short` that it does not appear). Then in `frontend`: `npm run build:mobile-test > ..\scratch\logs\buildmobile5h.txt 2>&1`, then in `frontend\android`: `.\gradlew.bat assembleStagingDirectRelease > ..\..\scratch\logs\gradle5h.txt 2>&1`. Read the last 15 lines of each log; stop and report on an error.
- d) Badging, from the repo root: `E:\Android\Sdk\build-tools\36.0.0\aapt.exe dump badging frontend\android\app\build\outputs\apk\stagingDirect\release\app-staging-direct-release.apk > scratch\logs\apk5h_badging.txt` (if `aapt.exe` is missing there, use `35.0.0`). The first line must show package `ir.comanage.soft.test`, `versionCode='10000'` and `versionName='1.0.0'`.
- e) Install, from the repo root: `E:\Android\Sdk\platform-tools\adb.exe devices` (must list `emulator-5554 device`; if not, run `adb wait-for-device` once), then `E:\Android\Sdk\platform-tools\adb.exe install -r "frontend\android\app\build\outputs\apk\stagingDirect\release\app-staging-direct-release.apk" > scratch\logs\apk5h_install.txt 2>&1` and read that file; it must contain `Success`. Never uninstall the app.
- f) Check: `backend\venv\Scripts\python.exe -X utf8 scratch\heavy\check_5heavy.py s1` must print `problems: none`.

4. Tool policy: only the commands above, `git status --short`, `Copy-Item`, and `Get-Content`/`Select-String` for reading files under `scratch/logs/`. The web build at most twice, Gradle at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: the build finished without errors, the patch line was printed, `apk5h_badging.txt` and `apk5h_install.txt` exist, the check printed `problems: none`, and `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report with the backup filename and size, the last web build line, the patch line, the APK size, the badging first line, the install result and the check line. No commit. End the turn after the report.

===

[DONE] [ ] Session 2 of 3 — Release v1 stage-5 heavy check on the Android emulator (staging APK): temporary QA company, user menu items, Android back button closes the user menu and the bell panel, airplane-mode offline queue with a petty cash expense, then delete the QA data

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: backend\venv\Scripts\python.exe -X utf8 scratch/heavy/check_5heavy.py s2
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Operational task on the local test environment `app` (test data only). Never connect to `soft.farsalish.ir`. Do not build anything.
- The emulator is ALREADY RUNNING. Never start, stop or restart it; never run `emulator.exe`, `wt.exe`, `start`, `Start-Process` or `taskkill`. If `adb devices` does not list `emulator-5554` as `device`, run `adb wait-for-device` once, then `adb shell getprop sys.boot_completed`; if it still does not print 1, do step g only and report "emulator not available".
- Run every command in the foreground and wait until it finishes. Never use `Start-Sleep` or `sleep` longer than 15 seconds; to wait, use `adb shell sleep 10`.
- Do not edit, create, stage or commit any tracked file. Write only under `scratch/logs/`. Never print the content of any file in `E:\warehouse-secrets\`.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`.
- Do not run `migrate`, `makemigrations`, `flush`, any `manage.py test`, or delete files under `backend/backups/`, `backend/media/` or `frontend/dist/`.
- Test passwords are in `scratch/qa_scenario_credentials.txt` (tab-separated: username, password, role, scope). Never print a password; pass it only to `adb shell input text`.
- adb is `E:\Android\Sdk\platform-tools\adb.exe` (call it by full path).

2. Context:
- Session 1 installed the newest staging APK 1.0.0 (`ir.comanage.soft.test`, activity `ir.comanage.soft.MainActivity`); it talks to `https://app.farsalish.ir`. Screen 1080x2400. Login page: username field about (540, 1130), password about (540, 1338), button «ورود به سامانه» about (540, 1655).
- Expected in this APK: the user menu (avatar/user button in the header) shows the version line «نسخهٔ ۱٫۰٫۰» and must NOT show an install item («نصب برنامه روی دستگاه») or a PWA update item («به‌روزرسانی نسخه»). The Android back button first closes an open user menu or bell (notifications) panel, and only then leaves the page.
- Offline queue: a petty cash expense registered while offline is kept in the device queue (survives a force-stop) and is sent automatically when the network returns. The helper `scratch/heavy/qa5h.py` gives the employee a petty cash account (`setup`), counts the server rows of the QA company (`count`) and deletes the QA data before the purge (`cleanup`).
- To find elements: `adb shell uiautomator dump /sdcard/ui.xml`, `adb pull /sdcard/ui.xml scratch/logs/ui.xml`, read the XML (search the `text` and `content-desc` attributes for the Persian label) and tap the centre of that node's `bounds`. Dump again after each screen change; never guess coordinates for anything other than the login page.
- Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';` and `$env:WH_ALLOW_SCENARIO_SEED='1';`.

3. Task, in this order (`manage.py` and helper commands in `backend`):
- a) QA data: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_scenario`, then `.\venv\Scripts\python.exe -X utf8 ..\scratch\heavy\qa5h.py setup` (must print `setup OK`), then `.\venv\Scripts\python.exe -X utf8 ..\scratch\heavy\qa5h.py count > ..\scratch\logs\count5h_before.txt` and read it.
- b) Login: `adb shell pm clear ir.comanage.soft.test`, `adb shell am start -n ir.comanage.soft.test/ir.comanage.soft.MainActivity`, `adb shell sleep 10`. Log in as `qa_scn_employee` (choose the accounting system if asked; allow notifications if asked). If the «چه چیزی تازه است» dialog or the notification permission bar appears, close it.
- c) User menu: open the user menu, `adb shell sleep 2`, save `adb exec-out screencap -p > scratch/logs/android5h_menu.png`, dump the UI and report whether «نسخهٔ ۱٫۰٫۰» is present and whether any install or PWA update item is present. Then `adb shell input keyevent KEYCODE_BACK` once, `adb shell sleep 2`, save `scratch/logs/android5h_menu_back.png` and report whether the menu closed and the app stayed open on the same page.
- d) Bell panel: tap the bell (notifications) button in the header, `adb shell sleep 2`, `adb shell input keyevent KEYCODE_BACK` once, `adb shell sleep 2`, save `scratch/logs/android5h_bell_back.png` and report whether the panel closed and the app stayed open.
- e) Offline petty cash expense:
  1. Open the petty cash page from the app menu (label «تنخواه»; it may be under the menu button in the header or on the dashboard tiles). `adb shell sleep 5`, dump the UI.
  2. `adb shell cmd connectivity airplane-mode enable`, `adb shell sleep 5`.
  3. Tap the new expense button (label containing «هزینه» and «جدید» or «ثبت»), fill only the required fields with small test values (amount `150000`, a short Persian or Latin description such as `test5h`, any first option in each required select; keep the date as offered), save `scratch/logs/android5h_offline_form.png`, then tap the save/register button.
  4. `adb shell sleep 3`, dump the UI and note the queue/pending indicator (a badge or a row marked as pending/not sent) and any message.
  5. `adb shell am force-stop ir.comanage.soft.test`, `adb shell am start -n ir.comanage.soft.test/ir.comanage.soft.MainActivity`, `adb shell sleep 10`, open the petty cash page again, save `scratch/logs/android5h_offline_queue.png`, and note whether the expense is still shown as pending.
  6. `adb shell cmd connectivity airplane-mode disable`, keep the app in the foreground, `adb shell sleep 10` three times, save `scratch/logs/android5h_after_sync.png`.
  7. In `backend`: `.\venv\Scripts\python.exe -X utf8 ..\scratch\heavy\qa5h.py count > ..\scratch\logs\count5h_after.txt` and read it. Compare with `count5h_before.txt`: a new petty cash expense row means the queue was sent.
  If the page says the user has no petty cash account or the form cannot be saved, save the screenshot, report the exact message and continue with step f.
- f) Make sure airplane mode is off: `adb shell cmd connectivity airplane-mode disable`.
- g) Delete the QA data, in `backend`, ALWAYS (even if earlier steps failed): `.\venv\Scripts\python.exe -X utf8 ..\scratch\heavy\qa5h.py cleanup > ..\scratch\logs\cleanup5h_s2.txt 2>&1`, then `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_scenario --purge > ..\scratch\logs\purge5h_s2.txt 2>&1`, then read both files.

4. Tool policy: only the commands above, `git status --short`, `Get-Content`/`Select-String` for reading, and `adb` (devices, wait-for-device, shell input, shell am, shell pm clear, shell sleep, shell getprop, shell cmd connectivity, shell uiautomator dump, pull, exec-out screencap). At most 90 adb calls. If a step fails twice, report the exact error and continue with the next step.

5. Before finishing: airplane mode is off; step g done; the six screenshots exist; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report: version line yes/no, install item yes/no, PWA update item yes/no, back button result for the menu and for the bell panel, the offline steps (pending indicator before force-stop, after restart, after reconnect, any message), the rows lines of `count5h_before.txt` and `count5h_after.txt`, and the last lines of `cleanup5h_s2.txt` and `purge5h_s2.txt`. No commit. End the turn after the report.

===

[DONE] [ ] Session 3 of 3 — Release v1 stage-5 heavy check in Chrome on the Android emulator: open app.farsalish.ir, install the web app from the user menu, turn on web push notifications, send a test push, log out and confirm the web subscription is removed, then delete the QA data

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: backend\venv\Scripts\python.exe -X utf8 scratch/heavy/check_5heavy.py s3
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Operational task on the local test environment `app` (test data only). Never connect to `soft.farsalish.ir`. Do not build anything.
- The emulator is ALREADY RUNNING. Never start, stop or restart it; never run `emulator.exe`, `wt.exe`, `start`, `Start-Process` or `taskkill`. If `adb devices` does not list `emulator-5554` as `device`, run `adb wait-for-device` once; if it still is not available, do step g only and report "emulator not available".
- Run every command in the foreground and wait until it finishes. Never use `Start-Sleep` or `sleep` longer than 15 seconds; to wait, use `adb shell sleep 10`.
- Do not edit, create, stage or commit any tracked file. Write only under `scratch/logs/`. Never print the content of any file in `E:\warehouse-secrets\`.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`.
- Do not run `migrate`, `makemigrations`, `flush`, any `manage.py test`, or delete files under `backend/backups/`, `backend/media/` or `frontend/dist/`.
- Test passwords are in `scratch/qa_scenario_credentials.txt`. Never print a password; pass it only to `adb shell input text`.
- adb is `E:\Android\Sdk\platform-tools\adb.exe` (call it by full path). Chrome on the emulator is `com.android.chrome` (version 124).

2. Context:
- The web app on `https://app.farsalish.ir` is a standard PWA. Inside a browser, the user menu (avatar/user button in the header) has an install item «نصب برنامه روی دستگاه» and a switch «اعلان روی این دستگاه» (states «روشن» / «خاموش» / «مسدود»). Turning the switch on asks the browser for notification permission and registers a web push subscription on the server. Logging out removes the subscription of this device.
- The backend command `send_test_push --username <u>` creates an in-app notification and reports «Web push subscriptions: N» and «Web push accepted K of N». This machine may be unable to reach Google's push servers (known network limit); in that case report the printed line and do not retry more than once.
- To find elements: `adb shell uiautomator dump /sdcard/ui.xml`, `adb pull /sdcard/ui.xml scratch/logs/ui.xml`, read the XML and tap the centre of the node's `bounds`. Chrome dialogs (install, notification permission) are native nodes with text such as `Install`, `Allow`, `نصب`, `اجازه دادن`.
- Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';` and `$env:WH_ALLOW_SCENARIO_SEED='1';`.

3. Task, in this order (`manage.py` commands in `backend`):
- a) QA data: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_scenario`.
- b) Chrome: `adb shell am start -a android.intent.action.VIEW -d https://app.farsalish.ir/login com.android.chrome`, `adb shell sleep 10`. Dismiss any Chrome first-run screens (accept nothing beyond what is needed to reach the page; choose «No thanks» / «بدون حساب» for sign-in and sync). Log in as `qa_scn_manager` (choose the accounting system if asked). If the one-time notification bar appears, leave it for now.
- c) Install: open the user menu, save `adb exec-out screencap -p > scratch/logs/chrome5h_menu.png`, report which items are present (install item, notification switch and its state, version line). Tap «نصب برنامه روی دستگاه»; if Chrome shows an install dialog, tap Install, `adb shell sleep 5`, save `scratch/logs/chrome5h_install.png`, and report whether an app icon was added (`adb shell cmd shortcut get-shortcuts --user 0 com.android.chrome` or a launcher screenshot). If no dialog appears, report what happened.
- d) Notifications: in Chrome (or the installed web app if it opened), open the user menu and tap «اعلان روی این دستگاه»; allow the Chrome permission dialog. `adb shell sleep 5`, open the menu again and save `scratch/logs/chrome5h_push_on.png`; report the switch state.
- e) Test push, in `backend`: `.\venv\Scripts\python.exe manage.py send_test_push --username qa_scn_manager > ..\scratch\logs\push5h_cmd.txt 2>&1`, read it. `adb shell sleep 10`, then `adb shell dumpsys notification --noredact > scratch\logs\push5h_dumpsys.txt` and report whether a Chrome notification titled «اعلان آزمایشی» is listed. If it is, open the shade (`adb shell cmd statusbar expand-notifications`), tap it, `adb shell sleep 6`, save `scratch/logs/chrome5h_push_tap.png` and report which page opened.
- f) Logout: in the app open the user menu and log out (label «خروج»), `adb shell sleep 5`. Then in `backend`: `.\venv\Scripts\python.exe manage.py send_test_push --username qa_scn_manager > ..\scratch\logs\push5h_after_logout.txt 2>&1`, read it, and report the web push subscription count (expected 0).
- g) Delete the QA data, in `backend`, ALWAYS (even if earlier steps failed): `.\venv\Scripts\python.exe -X utf8 ..\scratch\heavy\qa5h.py cleanup > ..\scratch\logs\cleanup5h_s3.txt 2>&1`, then `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_scenario --purge > ..\scratch\logs\purge5h_s3.txt 2>&1`, then read both files. Then `adb shell am force-stop com.android.chrome`.

4. Tool policy: only the commands above, `git status --short`, `Get-Content`/`Select-String` for reading, and `adb` (devices, wait-for-device, shell input, shell am, shell sleep, shell cmd shortcut, shell cmd statusbar, shell dumpsys notification, shell uiautomator dump, pull, exec-out screencap). At most 80 adb calls. If a step fails twice, report the exact error and continue with the next step.

5. Before finishing: step g done; `chrome5h_menu.png`, `push5h_cmd.txt` and `push5h_after_logout.txt` exist; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report: menu items seen, install result, switch state after enabling, the «Web push» lines of `push5h_cmd.txt`, whether the Chrome notification appeared and which page its tap opened, the subscription count after logout, and the last lines of `cleanup5h_s3.txt` and `purge5h_s3.txt`. No commit. End the turn after the report.

===

[DONE] [ ] Session 4 — Release v1 stage-5 heavy check: Daphne restarted with the petty cash custodian fix (commit 885753a7), re-run only the airplane-mode petty cash queue scenario on the emulator, then delete the QA data

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py restart-backend
verify: backend\venv\Scripts\python.exe -X utf8 scratch/heavy/check_5heavy.py s4
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules: exactly the critical rules of Session 2 of 3 above (same file), unchanged. The runner already restarted Daphne before your turn; do not restart anything. Never edit `scripts/automation/verify_tools.py` or any other tracked file. If the expense still fails to send after reconnect, open the queue indicator, save `scratch/logs/android5h4_queue_error.png`, dump the UI, report the exact error text, and continue with steps f and g; do not investigate the server.

2. Context: in Session 2 the offline petty cash expense stayed in the device queue across a force-stop and was sent after reconnecting, but the server answered `POST 400: custodian: This field is required.` Commit `885753a7` fixed that on the server (the employee form does not send `custodian`; the server now uses the logged-in user). Same app, same emulator, same helper `scratch/heavy/qa5h.py`, same login coordinates and element-finding method as Session 2.

3. Task, in this order: do steps a, b, e, f and g of Session 2 of 3 exactly as written there, with these file names instead: `count5h_before.txt` -> `count5h4_before.txt`, `count5h_after.txt` -> `count5h4_after.txt`, `android5h_offline_form.png` -> `android5h4_offline_form.png`, `android5h_offline_queue.png` -> `android5h4_offline_queue.png`, `android5h_after_sync.png` -> `android5h4_after_sync.png`, `cleanup5h_s2.txt` -> `cleanup5h_s4.txt`, `purge5h_s2.txt` -> `purge5h_s4.txt`. Use the description `test5h4`. Skip steps c and d.

4. Tool policy: as in Session 2 of 3; at most 60 adb calls.

5. Before finishing: airplane mode is off; step g done; the three screenshots exist; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report: pending indicator before force-stop, after restart, after reconnect (and any message), the rows lines of `count5h4_before.txt` and `count5h4_after.txt` (a new `personnel.PettyCashTransaction` row is expected after), and the last lines of `cleanup5h_s4.txt` and `purge5h_s4.txt`. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 — Training videos v-a on the local app environment: seed the demo admin, run video 0 in fast test mode (desktop and mobile), record it in training mode, add narration, build the mp4 files, frames and index page, then purge the demo data

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -X utf8 scratch/check_v_a.py --base {base}
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
   - Work only in the repo `E:\comanager` on `main`. Never run `git stash`, `git reset`, `git restore`, `git checkout` or create branches.
   - You may edit ONLY files under `tests/playwright/scenarios/`, and only to fix how an element is found (locator, wait, timeout). Never change what the scenario checks, never edit app code (`frontend/`, `backend/`), helpers, tools, config, `scripts/` or `tasks.md`.
   - Never print, open or copy `scratch/video_demo_credentials.json`, `.env` or any password. Never touch `soft.farsalish.ir`.
   - Run every command in the foreground and wait for it to finish. PowerShell syntax.
   - Windows WMI hangs on this machine: never run `Get-Process`, `Stop-Process`, `Get-CimInstance`, `Get-WmiObject`, `tasklist` or `taskkill`; they never return. Never delete or recreate `tests\playwright\.venv` or `tests\playwright\.venv-tools` (the old `.venv` is locked and unused; `.venv-tools` is ready).
   - If a step fails twice after your fixes, write the exact error in your report and continue with the next step. Step g always runs.

2. Context: `tests/playwright/` holds Playwright training videos (plan `Documents/Training_Videos/plan_training_videos.md`). `VIDEO_MODE=test` is a fast check without video; `VIDEO_MODE=training` records a slow video with captions. `BASE_URL` defaults to `https://app.farsalish.ir`. Demo users come from `manage.py seed_video_demo` (passwords go to the credentials file, which the scenario reads by itself). Video 0 is `tests/playwright/scenarios/00-intro.spec.ts` and logs in as `demo_admin`. `node_modules` and `.venv` in `tests/playwright` may already exist.

3. Task, in this order:
   - a) In `tests\playwright`: if `node_modules\@playwright\test` is missing run `npm install --no-audit --no-fund`. The Python tools environment `.venv-tools` is already installed; do not touch it.
   - b) In `backend`: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_video_demo --purge > ..\scratch\logs\va_seed.txt 2>&1; .\venv\Scripts\python.exe manage.py seed_video_demo --admin >> ..\scratch\logs\va_seed.txt 2>&1`, then read the file (it must say the demo data was created).
   - c) In `tests\playwright`: `$env:VIDEO_MODE='test'; npx playwright test --project=desktop --reporter=list > ..\..\scratch\logs\va_test_desktop.txt 2>&1`, then the same with `--project=mobile` into `va_test_mobile.txt`. Both must end with `1 passed`. On failure read the log and `output\test-results\*\error-context.md`, fix only the locator in the scenario file, and run again (at most 3 attempts per profile).
   - d) In `tests\playwright`: `.\.venv-tools\Scripts\python.exe -X utf8 tools\make_audio.py > ..\..\scratch\logs\va_audio.txt 2>&1`, then read the file.
   - e) In `tests\playwright`: `$env:VIDEO_MODE='training'; npx playwright test --project=desktop --reporter=list > ..\..\scratch\logs\va_train_desktop.txt 2>&1`, then the same with `--project=mobile` into `va_train_mobile.txt`. Both must end with `1 passed`.
   - f) In `tests\playwright`: `.\.venv-tools\Scripts\python.exe -X utf8 tools\mux.py > ..\..\scratch\logs\va_mux.txt 2>&1`, then `.\.venv-tools\Scripts\python.exe -X utf8 tools\frames.py > ..\..\scratch\logs\va_frames.txt 2>&1`, then `.\.venv-tools\Scripts\python.exe -X utf8 tools\index.py > ..\..\scratch\logs\va_index.txt 2>&1`; read the three files.
   - g) ALWAYS, even if earlier steps failed, in `backend`: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_video_demo --purge > ..\scratch\logs\va_purge.txt 2>&1`, then read the file.
   - h) If you changed a scenario file, commit only that file with the subject `test(training-videos v-a): selector fixes for video 0`.

4. Tool policy: only the commands above, `git status --short`, `git add`/`git commit` for step h, and `Get-Content`/`Select-String`/`Get-ChildItem` for reading. No browser tools of your own.

5. Before finishing: step g done; `Documents\Training_Videos\videos\00-intro-desktop.mp4`, `00-intro-mobile.mp4` and `index.html` exist; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report: the last line of each `va_*.txt` log, any selector you changed and why, the size of both mp4 files. End the turn after the report.

===

[DONE] [ ] Session 1 — Training videos v-b on the local app environment: release the frontend (three label fixes), then for videos 1 and 2 seed demo data, run the fast test (desktop and mobile), add narration, record in training mode, build the mp4 files, frames and index page, then purge the demo data

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -X utf8 scratch/check_v_b.py --base {base}
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
   - Work only in the repo `E:\comanager` on `main`. Never run `git stash`, `git reset`, `git restore`, `git checkout` or create branches.
   - You may edit ONLY files under `tests/playwright/scenarios/`, and only to fix how an element is found (locator, wait, timeout). Never change what the scenario checks, never edit app code (`frontend/src`, `backend/`), helpers, tools, config, `scripts/` or `tasks.md`.
   - Never print, open or copy `scratch/video_demo_credentials.json`, `.env` or any password. Never touch `soft.farsalish.ir`.
   - Run every command in the foreground and wait for it to finish. PowerShell syntax.
   - Windows WMI hangs on this machine: never run `Get-Process`, `Stop-Process`, `Get-CimInstance`, `Get-WmiObject`, `tasklist` or `taskkill`; they never return. Never delete or recreate `tests\playwright\.venv` or `tests\playwright\.venv-tools`.
   - If a step fails twice after your fixes, write the exact error in your report and continue with the next step. Step h always runs.

2. Context: `tests/playwright/` holds Playwright training videos (plan `Documents/Training_Videos/plan_training_videos.md`). `VIDEO_MODE=test` is a fast check without video; `VIDEO_MODE=training` records a slow video with captions. `BASE_URL` defaults to `https://app.farsalish.ir`. Demo users come from `manage.py seed_video_demo` (passwords go to the credentials file; the scenarios read and update it by themselves). Video 1 is `scenarios/01-users-company.spec.ts` (needs seed `--admin`: it creates the company and users itself). Video 2 is `scenarios/02-accounting-setup.spec.ts` (needs seed `--base`). Every run of a video needs a fresh seed right before it. Both scenarios already passed in test mode against the local dev server; the frontend on `app` must first be rebuilt because three templates got accessible labels (change password, company code/name, counterparty form).

3. Task, in this order. SEED-ADMIN means, in `backend`: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_video_demo --purge >> ..\scratch\logs\vb_seed.txt 2>&1; .\venv\Scripts\python.exe manage.py seed_video_demo --admin >> ..\scratch\logs\vb_seed.txt 2>&1`. SEED-BASE is the same with `--base` instead of `--admin`.
   - a) Frontend release, in `frontend`: `npx ng build --delete-output-path=false > ..\scratch\logs\vb_build.txt 2>&1; node tools/patch-ngsw-530.js >> ..\scratch\logs\vb_build.txt 2>&1`. Read the end of the file (the build must finish without errors). Then `curl.exe -s -o NUL -w "%{http_code}" https://app.farsalish.ir/` must print 200. No backend restart is needed.
   - b) In `tests\playwright`: if `node_modules\@playwright\test` is missing run `npm install --no-audit --no-fund`.
   - c) Fast test, video 1: SEED-ADMIN, then in `tests\playwright`: `$env:VIDEO_MODE='test'; npx playwright test --project=desktop scenarios/01-users-company.spec.ts --reporter=list > ..\..\scratch\logs\vb_test_01_desktop.txt 2>&1`. Then SEED-ADMIN again and the same with `--project=mobile` into `vb_test_01_mobile.txt`. Each must end with `1 passed`. On failure read the log and `output\test-results\*\error-context.md` and the `test-failed-1.png`, fix only the locator in the scenario file, reseed and run again (at most 3 attempts per profile).
   - d) Fast test, video 2: the same as c) with SEED-BASE, `scenarios/02-accounting-setup.spec.ts`, logs `vb_test_02_desktop.txt` and `vb_test_02_mobile.txt`.
   - e) Narration, in `tests\playwright`: `.\.venv-tools\Scripts\python.exe -X utf8 tools\make_audio.py > ..\..\scratch\logs\vb_audio.txt 2>&1`, then read the file.
   - f) Training, video 1: SEED-ADMIN, then `$env:VIDEO_MODE='training'; npx playwright test --project=desktop scenarios/01-users-company.spec.ts --reporter=list > ..\..\scratch\logs\vb_train_01_desktop.txt 2>&1`; then SEED-ADMIN and the same with `--project=mobile` into `vb_train_01_mobile.txt`. Both must end with `1 passed`.
   - g) Training, video 2: the same as f) with SEED-BASE, `scenarios/02-accounting-setup.spec.ts`, logs `vb_train_02_desktop.txt` and `vb_train_02_mobile.txt`. Then, in `tests\playwright`: `.\.venv-tools\Scripts\python.exe -X utf8 tools\mux.py > ..\..\scratch\logs\vb_mux.txt 2>&1`, `.\.venv-tools\Scripts\python.exe -X utf8 tools\frames.py > ..\..\scratch\logs\vb_frames.txt 2>&1`, `.\.venv-tools\Scripts\python.exe -X utf8 tools\index.py > ..\..\scratch\logs\vb_index.txt 2>&1`; read the three files.
   - h) ALWAYS, even if earlier steps failed, in `backend`: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_video_demo --purge > ..\scratch\logs\vb_purge.txt 2>&1`, then read the file.
   - i) If you changed a scenario file, commit only the changed scenario files with the subject `test(training-videos v-b): selector fixes for videos 1 and 2`.

4. Tool policy: only the commands above, `git status --short`, `git add`/`git commit` for step i, and `Get-Content`/`Select-String`/`Get-ChildItem` for reading. No browser tools of your own.

5. Before finishing: step h done; `Documents\Training_Videos\videos\` has `01-users-company-desktop.mp4`, `01-users-company-mobile.mp4`, `02-accounting-setup-desktop.mp4`, `02-accounting-setup-mobile.mp4` and `index.html`; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report: the last line of each `vb_*.txt` log, any selector you changed and why, the size of the four mp4 files. End the turn after the report.

===

[DONE] [ ] Session 2 — Training videos v-b fix: release the backend and frontend fix for the forced first password change (fresh tokens), then re-record video 1 only (fast test, training, mp4, frames, index) and purge the demo data

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
require: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py release-check
verify: python -X utf8 scratch/check_v_b.py --base {base}
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules: exactly the critical rules of Session 1 (Training videos v-b) above, unchanged. The runner already restarted Daphne before your turn; do not restart anything. Step f always runs.

2. Context: after the first forced password change the app used to keep the old (now invalid) tokens, so the employee in video 1 saw the red toast «خطا در واکشی بخش‌های مجاز کارمند». The server now returns fresh tokens and the frontend stores them. The scenario helper now also fails the test on ANY red error toast that appears at any moment. Videos 0 and 2 stay as they are. SEED-ADMIN is defined in Session 1.

3. Task, in this order:
   - a) Frontend release, in `frontend`: `npx ng build --delete-output-path=false > ..\scratch\logs\vb_build.txt 2>&1; node tools/patch-ngsw-530.js >> ..\scratch\logs\vb_build.txt 2>&1`. Read the end of the file (no errors). Then `curl.exe -s -o NUL -w "%{http_code}" https://app.farsalish.ir/` and `curl.exe -s -o NUL -w "%{http_code}" https://app.farsalish.ir/api/public/config/` must both print 200.
   - b) Fast test, video 1: SEED-ADMIN, then in `tests\playwright`: `$env:VIDEO_MODE='test'; npx playwright test --project=desktop scenarios/01-users-company.spec.ts --reporter=list > ..\..\scratch\logs\vb_test_01_desktop.txt 2>&1`; then SEED-ADMIN and the same with `--project=mobile` into `vb_test_01_mobile.txt`. Each must end with `1 passed`. If a test fails with «red error toasts seen during the video», do NOT change the scenario: write the toast text in the report and continue with step f.
   - c) Narration, in `tests\playwright`: `.\.venv-tools\Scripts\python.exe -X utf8 tools\make_audio.py > ..\..\scratch\logs\vb_audio.txt 2>&1`.
   - d) Training, video 1: SEED-ADMIN, then `$env:VIDEO_MODE='training'; npx playwright test --project=desktop scenarios/01-users-company.spec.ts --reporter=list > ..\..\scratch\logs\vb_train_01_desktop.txt 2>&1`; then SEED-ADMIN and the same with `--project=mobile` into `vb_train_01_mobile.txt`. Both must end with `1 passed`.
   - e) In `tests\playwright`: `.\.venv-tools\Scripts\python.exe -X utf8 tools\mux.py --only 01-users-company > ..\..\scratch\logs\vb_mux.txt 2>&1`, `.\.venv-tools\Scripts\python.exe -X utf8 tools\frames.py --only 01-users-company > ..\..\scratch\logs\vb_frames.txt 2>&1`, `.\.venv-tools\Scripts\python.exe -X utf8 tools\index.py > ..\..\scratch\logs\vb_index.txt 2>&1`; read the three files.
   - f) ALWAYS, in `backend`: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_video_demo --purge > ..\scratch\logs\vb_purge.txt 2>&1`, then read the file.
   - g) If you changed a scenario file, commit only the changed scenario files with the subject `test(training-videos v-b): selector fixes for video 1 re-record`.

4. Tool policy: only the commands above, `git status --short`, `git add`/`git commit` for step g, and `Get-Content`/`Select-String`/`Get-ChildItem` for reading. No browser tools of your own.

5. Before finishing: step f done; `Documents\Training_Videos\videos\01-users-company-desktop.mp4` and `01-users-company-mobile.mp4` are newer than this session's start; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report: the last line of each `vb_*.txt` log written in this session, any selector you changed and why, the size of both video 1 mp4 files. End the turn after the report.

===

[DONE] [ ] Session 3 — Training videos v-b: Daphne and the GDrive worker are down after Session 2; the runner restarts them, then check that app answers

<!-- runner
require: python scripts/automation/verify_tools.py release-mark
require: python scripts/automation/verify_tools.py restart-backend
require: python scripts/automation/verify_tools.py restart-worker
verify: python scripts/automation/verify_tools.py release-check --backend-only
-->

1. Critical rules: exactly the critical rules of Session 1 (Training videos v-b) above, unchanged. The runner already restarted Daphne and the GDrive worker before your turn; do not restart, stop or build anything and do not edit any file.

2. Task: run `curl.exe -s -o NUL -w "%{http_code}" https://app.farsalish.ir/` and `curl.exe -s -o NUL -w "%{http_code}" https://app.farsalish.ir/api/public/config/`; both must print 200. If not, wait by running `python scripts/automation/verify_tools.py release-check --backend-only` once more and report its output.

3. Output and stop condition: a short English report with the two status codes. End the turn after the report.

===

[DONE] [ ] Session 1 — Training videos v-c on the local app environment: release the frontend (invoice fixes), then for videos 3-a, 3-b and 3-c seed demo data, run the fast test (desktop and mobile), add narration, record in training mode, build the mp4 files, frames and index page, then purge the demo data

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -X utf8 scratch/check_v_c.py --base {base}
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules: exactly the critical rules of Session 1 (Training videos v-b) above, unchanged. Step h always runs.

2. Context: same as Session 1 (Training videos v-b). Video 3-a is `scenarios/03a-invoice-record.spec.ts` (seed `--base`), video 3-b is `scenarios/03b-invoice-approvals.spec.ts` (seed `--base --with-invoice submitted`), video 3-c is `scenarios/03c-invoice-payment.spec.ts` (seed `--base --with-invoice approved`). Every run of a video needs a fresh seed right before it. All three already passed in test mode against the local dev server. The frontend on `app` must first be rebuilt (invoice form labels, supervisor return for revision, treasurer Excel export). No backend restart is needed.

3. Task, in this order. SEED(X) means, in `backend`: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_video_demo --purge >> ..\scratch\logs\vc_seed.txt 2>&1; .\venv\Scripts\python.exe manage.py seed_video_demo --base X >> ..\scratch\logs\vc_seed.txt 2>&1`, where X is empty for 3-a, `--with-invoice submitted` for 3-b and `--with-invoice approved` for 3-c.
   - a) Frontend release, in `frontend`: `npx ng build --delete-output-path=false > ..\scratch\logs\vc_build.txt 2>&1; node tools/patch-ngsw-530.js >> ..\scratch\logs\vc_build.txt 2>&1`. Read the end of the file (no errors). Then `curl.exe -s -o NUL -w "%{http_code}" https://app.farsalish.ir/` and `curl.exe -s -o NUL -w "%{http_code}" https://app.farsalish.ir/api/public/config/` must both print 200.
   - b) Fast test: for each video V in 03a, 03b, 03c and each profile P in desktop, mobile: SEED(X of V), then in `tests\playwright`: `$env:VIDEO_MODE='test'; npx playwright test --project=P scenarios/<file of V> --reporter=list > ..\..\scratch\logs\vc_test_V_P.txt 2>&1` (for example `vc_test_03a_desktop.txt`). Each must end with `1 passed`. On failure read the log, `output\test-results\*\error-context.md` and `test-failed-1.png`, fix only the locator in the scenario file, reseed and run again (at most 3 attempts per run). If a test fails with «red error toasts seen during the video», do NOT change the scenario: write the toast text in the report and skip that video in steps d and e.
   - c) Narration, in `tests\playwright`: `.\.venv-tools\Scripts\python.exe -X utf8 tools\make_audio.py > ..\..\scratch\logs\vc_audio.txt 2>&1`, then read the file.
   - d) Training: the same six runs as b) with `$env:VIDEO_MODE='training'` and logs `vc_train_V_P.txt`, each after its own SEED. All must end with `1 passed`.
   - e) In `tests\playwright`: `.\.venv-tools\Scripts\python.exe -X utf8 tools\mux.py > ..\..\scratch\logs\vc_mux.txt 2>&1`, `.\.venv-tools\Scripts\python.exe -X utf8 tools\frames.py > ..\..\scratch\logs\vc_frames.txt 2>&1`, `.\.venv-tools\Scripts\python.exe -X utf8 tools\index.py > ..\..\scratch\logs\vc_index.txt 2>&1`; read the three files.
   - f) (no step f)
   - g) (no step g)
   - h) ALWAYS, even if earlier steps failed, in `backend`: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_video_demo --purge > ..\scratch\logs\vc_purge.txt 2>&1`, then read the file.
   - i) If you changed a scenario file, commit only the changed scenario files with the subject `test(training-videos v-c): selector fixes for video 3`.

4. Tool policy: only the commands above, `git status --short`, `git add`/`git commit` for step i, and `Get-Content`/`Select-String`/`Get-ChildItem` for reading. No browser tools of your own.

5. Before finishing: step h done; `Documents\Training_Videos\videos\` has the desktop and mobile mp4 of `03a-invoice-record`, `03b-invoice-approvals` and `03c-invoice-payment`, and `index.html`; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report: the last line of each `vc_*.txt` log, any selector you changed and why, the size of the six mp4 files. End the turn after the report.

===

[DONE] [ ] Session 1 — Training videos v-d: the runner restarts Daphne (new petty-cash user-directory permission), then fast-test video 4-a (desktop and mobile) on app and purge the demo data

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
require: python scripts/automation/verify_tools.py release-mark
require: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py release-check --backend-only
verify: python -X utf8 scratch/check_v_d.py --base {base}
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules: exactly the critical rules of Session 1 (Training videos v-b) above, unchanged. The runner already restarted Daphne before your turn; do not restart or build anything. Step c always runs.

2. Context: same as Session 1 (Training videos v-b). Video 4-a is `scenarios/04a-petty-account-charge.spec.ts` (seed `--base`). It is a new draft: it has never passed end to end yet, so a failure is expected information, not your fault. Only fix a locator when the error clearly says an element was not found or a wait timed out and the screenshot shows the element under another name; otherwise just report. Every run needs a fresh seed right before it. SEED means, in `backend`: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_video_demo --purge >> ..\scratch\logs\vd_seed.txt 2>&1; .\venv\Scripts\python.exe manage.py seed_video_demo --base >> ..\scratch\logs\vd_seed.txt 2>&1`.

3. Task, in this order:
   - a) `curl.exe -s -o NUL -w "%{http_code}" https://app.farsalish.ir/api/public/config/` must print 200.
   - b) For each profile P in desktop, mobile: SEED, then in `tests\playwright`: `$env:VIDEO_MODE='test'; npx playwright test --project=P scenarios/04a-petty-account-charge.spec.ts --reporter=list > ..\..\scratch\logs\vd_test_04a_P.txt 2>&1`. At most 2 attempts per profile, each after its own SEED. If a test fails with «red error toasts seen during the video», do NOT change the scenario: write the toast text in the report.
   - c) ALWAYS, even if earlier steps failed, in `backend`: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_video_demo --purge > ..\scratch\logs\vd_purge.txt 2>&1`, then read the file.
   - d) If you changed a scenario file, commit only that file with the subject `test(training-videos v-d): selector fixes for video 4-a`.

4. Tool policy: only the commands above, `git status --short`, `git add`/`git commit` for step d, and `Get-Content`/`Select-String`/`Get-ChildItem` for reading. No browser tools of your own.

5. Before finishing: step c done; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report: the last 15 lines of each `vd_test_04a_*.txt` log, the first error line and the step of the scenario where it stopped, the content of `error-context.md` headings if a test failed, any selector you changed and why. End the turn after the report.

===

[DONE] [ ] Session 2 — Training videos v-d: fast-test video 4-a again (desktop and mobile) on app after the seed fix (demo accountant and manager now assigned at company level), then purge the demo data

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -X utf8 scratch/check_v_d.py --base {base}
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules: exactly the critical rules of Session 1 (Training videos v-b) above, unchanged. Do not restart, build or back up anything; never run `run_auto_backup` (it deletes old backups). Step c always runs.

2. Context: same as Session 1 (Training videos v-d) above, including the SEED definition. The previous run stopped at the save of the new petty account with the alert "you are not allowed"; the seed now gives the demo accountant a company-level assignment, so that save should pass. Only fix a locator when the error clearly says an element was not found or a wait timed out and the screenshot shows the element under another name; otherwise just report.

3. Task, in this order:
   - a) `curl.exe -s -o NUL -w "%{http_code}" https://app.farsalish.ir/api/public/config/` must print 200.
   - b) For each profile P in desktop, mobile: SEED, then in `tests\playwright`: `$env:VIDEO_MODE='test'; npx playwright test --project=P scenarios/04a-petty-account-charge.spec.ts --reporter=list > ..\..\scratch\logs\vd_test_04a_P.txt 2>&1`. At most 2 attempts per profile, each after its own SEED. If a test fails with red error toasts, do NOT change the scenario: write the toast text in the report.
   - c) ALWAYS, even if earlier steps failed, in `backend`: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_video_demo --purge > ..\scratch\logs\vd_purge.txt 2>&1`, then read the file.
   - d) If you changed a scenario file, commit only that file with the subject `test(training-videos v-d): selector fixes for video 4-a`.

4. Tool policy: only the commands above, `git status --short`, `git add`/`git commit` for step d, and `Get-Content`/`Select-String`/`Get-ChildItem` for reading. No browser tools of your own.

5. Before finishing: step c done; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report: the last 15 lines of each `vd_test_04a_*.txt` log, the first error line and the step of the scenario where it stopped, the alert text in `error-context.md` if a test failed, any selector you changed and why. End the turn after the report.

===

[DONE] [ ] Session 3 — Training videos v-d: release the frontend route fix (the treasurer may open the petty cash page from My Tasks to pay a charge), then fast-test video 4-a again (desktop and mobile) on app and purge the demo data

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python -X utf8 scratch/check_v_d.py --base {base}
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules: exactly the critical rules of Session 1 (Training videos v-b) above, unchanged. Do not restart the backend and do not back up anything; never run `run_auto_backup` (it deletes old backups). Step d always runs.

2. Context: same as Session 1 (Training videos v-d) above, including the SEED definition. Session 2 passed every step up to the treasurer: the treasurer clicked the document button of the charge card in My Tasks and was sent to the payroll page, because the petty cash page did not allow the treasurer permission. The route now allows it; the frontend must be rebuilt first. Only fix a locator when the error clearly says an element was not found or a wait timed out and the screenshot shows the element under another name; otherwise just report.

3. Task, in this order:
   - a) Frontend release, in `frontend`: `npx ng build --delete-output-path=false > ..\scratch\logs\vd_build.txt 2>&1; node tools/patch-ngsw-530.js >> ..\scratch\logs\vd_build.txt 2>&1`. Read the end of the file (no errors). Then `curl.exe -s -o NUL -w "%{http_code}" https://app.farsalish.ir/` and `curl.exe -s -o NUL -w "%{http_code}" https://app.farsalish.ir/api/public/config/` must both print 200.
   - b) For each profile P in desktop, mobile: SEED, then in `tests\playwright`: `$env:VIDEO_MODE='test'; npx playwright test --project=P scenarios/04a-petty-account-charge.spec.ts --reporter=list > ..\..\scratch\logs\vd_test_04a_P.txt 2>&1`. At most 2 attempts per profile, each after its own SEED. If a test fails with red error toasts, do NOT change the scenario: write the toast text in the report.
   - c) If you changed a scenario file, commit only that file with the subject `test(training-videos v-d): selector fixes for video 4-a`.
   - d) ALWAYS, even if earlier steps failed, in `backend`: `$env:PYTHONUTF8='1'; $env:WH_ALLOW_SCENARIO_SEED='1'; .\venv\Scripts\python.exe manage.py seed_video_demo --purge > ..\scratch\logs\vd_purge.txt 2>&1`, then read the file.

4. Tool policy: only the commands above, `git status --short`, `git add`/`git commit` for step c, and `Get-Content`/`Select-String`/`Get-ChildItem` for reading. No browser tools of your own.

5. Before finishing: step d done; `git status --short` shows nothing except runner files.

6. Output and stop condition: a short English report: the end of `vd_build.txt`, the last 15 lines of each `vd_test_04a_*.txt` log, the first error line and the step of the scenario where it stopped, the alert text in `error-context.md` if a test failed, any selector you changed and why. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Chat plan stage 5-b: server tests for the attachment allowlist, content sniffing, previews (image and PDF), failed previews and the backfill command

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "backend/integration_tests/communications/test_stage5b.py"
verify: python scripts/automation/verify_tools.py text-check --file backend/integration_tests/communications/test_stage5b.py --contains build_attachment_preview --contains captureOnCommitCallbacks --contains build_chat_previews --contains preview_status --contains page_count --contains thumb=1 --contains override_settings --count "12:def test_"
verify: set DB_TEST_NAME=test_agy_chat5b&& python scripts/automation/verify_tools.py django-tests --labels integration_tests.communications.test_stage5b --min-tests 12
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(chat 5-b): attachment allowlist"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`.
- Create exactly one new file: `backend/integration_tests/communications/test_stage5b.py`. Change no other file. Never edit production code, any other test, anything under `scripts/` or `Documents/`, `tasks.md` or `tasks_history.md`.
- Never run `manage.py test` without an app label (it would run root scripts against the real database).
- If a test fails because the production code behaves differently from this task, do not change production code and do not weaken the expectation silently: keep the test as written, mark it with `@unittest.expectedFailure`, and describe the difference in your report.
- Every test class that saves files runs under `@override_settings(MEDIA_ROOT=<a tempfile.mkdtemp() directory>)`, and that directory is removed with `shutil.rmtree(path, ignore_errors=True)` in `tearDownClass` (only that temporary directory).
- Test docstrings and comments are Persian, like the existing files. No push. Stage only your own file.

2. Context (read these; nothing else is needed):
- `backend/core/communications/previews.py` (whole file): `ALLOWED_EXTENSIONS`, `detect_content_type`, `validate_uploaded_file(file_obj)` returning `(ok, error, detected_content_type)`, `build_attachment_preview(attachment)` returning the final `preview_status`, `schedule_attachment_preview(attachment_id)` (runs the builder in `transaction.on_commit`, then calls `broadcast_message_updated_ws`).
- `backend/core/communications/models.py` classes `PreviewStatus` (`pending`, `ready`, `none`, `failed`) and `MessageAttachment` (fields `thumbnail`, `width`, `height`, `page_count`, `duration`, `preview_status`).
- `backend/core/communications/views.py` method `upload_attachment` (`POST /api/communications/messages/upload/`, multipart fields `file` and `message_id`; 400 with `error` for a refused file; 201 with the serialized attachment) and class `ChatAttachmentDownloadView` (query `thumb=1` serves the thumbnail; 403 for a non-member; 404 when there is no thumbnail). Take the exact download URL from `backend/core/communications/urls.py` (name `chat_attachment_download`) or use `django.urls.reverse('chat_attachment_download', args=[pk])`.
- `backend/core/communications/serializers.py` class `MessageAttachmentSerializer` (fields `width`, `height`, `page_count`, `duration`, `preview_status`, `thumbnail_url`).
- `backend/core/communications/management/commands/build_chat_previews.py` (dry-run by default; `--apply`, `--retry-failed`, `--limit`).
- Fixture: `backend/integration_tests/communications/base.py` class `BaseCommsTestCase` (users `admin`, `manager_wh1`, `staff_wh1`, `staff_wh2`, `unassigned_user`; `direct_conv` between `manager_wh1` and `staff_wh1`; `direct_message` sent by `manager_wh1`; `self.auth(user)`). Style reference: `backend/integration_tests/communications/test_attachments.py` lines 1–60.

3. Definitions:
- "Image bytes" = a PNG of 800x400 pixels built with Pillow (`Image.new('RGB', (800, 400), 'red').save(buf, 'PNG')`).
- "PDF bytes" = a two-page PDF built with reportlab (`from reportlab.pdfgen import canvas`; draw a string, call `showPage()` twice, then `save()`).
- "Corrupt bytes" = `b'\x89PNG\r\n\x1a\n' + b'GARBAGE' * 20`.
- "Upload" = `self.auth(self.manager_wh1)` then `self.client.post('/api/communications/messages/upload/', {'file': SimpleUploadedFile(name, data, content_type=<any>), 'message_id': str(self.direct_message.id)}, format='multipart')`, wrapped in `with self.captureOnCommitCallbacks(execute=True):` when the test needs the preview to be built.
- "Attachment row" = `MessageAttachment.objects.create(message=self.direct_message, file=SimpleUploadedFile(name, data), file_name=name, file_size=len(data))`.

4. Task — new file, one class based on `BaseCommsTestCase`, at least 12 tests (one `def test_` each):
- a) `test_image_upload_builds_webp_thumbnail_and_dimensions`: upload image bytes as `p.png` inside captureOnCommitCallbacks → 201; the row has `preview_status == 'ready'`, `width == 800`, `height == 400`, a thumbnail whose name ends with `.webp`; opening the thumbnail with Pillow gives a longest side of at most 320; `content_type == 'image/png'`.
- b) `test_pdf_upload_counts_pages_and_builds_thumbnail`: upload PDF bytes as `d.pdf` the same way → `preview_status == 'ready'`, `page_count == 2`, a thumbnail exists, `content_type == 'application/pdf'`.
- c) `test_corrupt_image_keeps_original_with_failed_status`: attachment row `bad.png` with corrupt bytes; `build_attachment_preview(row)` returns `'failed'`; after `refresh_from_db()` the row exists, `row.file.storage.exists(row.file.name)` is true, and there is no thumbnail.
- d) `test_text_file_gets_status_none`: attachment row `t.txt` with `b'hello'` → `build_attachment_preview` returns `'none'`, no thumbnail, the file still exists.
- e) `test_disallowed_extensions_rejected`: for each name in `x.svg`, `x.html`, `x.xhtml`, `x.hta`, `x.ps1`, `x.jar`, `x.lnk`, `x.svgz`, `x.exe`, `noext` (content `b'hello'`) the upload returns 400 with `error`, and no attachment row exists for `direct_message` afterwards.
- f) `test_mismatched_content_rejected`: these uploads return 400: `fake.png` with PDF bytes; `fake.pdf` with image bytes; `fake.docx` with `b'PK\x03\x04' + b'0' * 100`; `fake.xls` with `b'hello'`; `notes.txt` with `b'<html><script>alert(1)</script>'`.
- g) `test_stored_content_type_comes_from_content_not_browser`: upload image bytes as `p.png` with `content_type='text/html'` → 201 and the row's `content_type == 'image/png'`.
- h) `test_valid_office_and_text_files_accepted`: a real `.xlsx` built with `openpyxl.Workbook().save(buf)` and a `.csv` with `b'a,b\n1,2\n'` → each 201; the xlsx row has `content_type` equal to `ALLOWED_EXTENSIONS['.xlsx']`.
- i) `test_thumbnail_download_only_for_members`: after an image upload as in a), GET the download URL with query `thumb=1` as `staff_wh1` → 200 with `Content-Type` `image/webp`; as `staff_wh2` → 403; as `unassigned_user` → 403. The same GET for an attachment row without a thumbnail (a `t.txt` row) as `staff_wh1` → 404.
- j) `test_serializer_exposes_preview_fields`: after a PDF upload as in b), list the messages of `direct_conv` as `staff_wh1` (read `MessageViewSet.get_queryset` in `views.py` for the exact URL and query parameter, and how the list is paginated); the attachment object of `direct_message` has `page_count == 2`, `preview_status == 'ready'`, and `thumbnail_url` ending with `thumb=1`.
- k) `test_backfill_command_dry_run_changes_nothing`: two attachment rows (image bytes `a.png`, PDF bytes `b.pdf`) left at `pending`; `call_command('build_chat_previews', stdout=io.StringIO())` → both rows still `pending` and the output contains `2`.
- l) `test_backfill_command_apply_and_retry_failed`: rows `a.png` (image bytes) and `bad.png` (corrupt bytes), both `pending`; `call_command('build_chat_previews', '--apply', stdout=out)` → `a.png` is `ready`, `bad.png` is `failed` and its file still exists; a second `--apply` run leaves `bad.png` untouched (its `updated_at` is unchanged); `--apply --retry-failed` processes it again (its `updated_at` changes, it stays `failed`).

Out of scope: production code, other test files.

5. Tool policy:
- Reading files is unrestricted.
- From `backend`: `set DB_TEST_NAME=test_agy_chat5b&& set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test integration_tests.communications.test_stage5b --noinput` (at most 6 times). Always set `DB_TEST_NAME` exactly like this.
- If a command fails, read its output and change approach; do not repeat the same call unchanged.

6. Before finishing:
- The test command passes (or only your documented `expectedFailure` tests are marked).
- `git status --short` shows only your new file before the commit and nothing after it.

7. Output and stop condition:
- Commit with this message, without push:
test(chat 5-b): attachment allowlist, content sniffing, image/PDF previews, failed previews keep the original, thumbnail access, backfill command
- Short English report: the test names, the summary line of the test run, and any behaviour that differed from this task. End the turn after the commit and the report.

===

[DONE] [ ] Session 1 of 1 — Chat plan stage 5-c: attachment cards in the chat bubble (image thumbnail with real ratio, 2x2 image grid, PDF card, file-type cards), file-type icons, the media tab in the conversation info panel, and DOM specs

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/common/components/communications/chat-drawer/chat-drawer.component.html" "frontend/src/app/shared/icons/icon-registry.ts" "frontend/src/app/modules/common/components/communications/chat-drawer/chat-drawer-5c.dom.spec.ts" "frontend/src/app/shared/components/document-preview/document-preview-gallery.spec.ts"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/common/components/communications/chat-drawer/chat-drawer-5c.dom.spec.ts --min-tests 9 --require "att-card-pdf" --require "att-card-file" --require "att-grid" --require "picked-remove" --require "offline-multi-note" --require "media-tab"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/shared/components/document-preview/document-preview-gallery.spec.ts --min-tests 6 --require "openGallery" --require "gallery-next" --require "ArrowLeft" --require "preview-goto"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/common/components/communications/chat-drawer/*.spec.ts" --include "src/app/shared/components/document-preview/*.spec.ts" --include "src/app/modules/accounting/components/companies-studio/company-archive-section/*.spec.ts"
verify: python -X utf8 scripts/e2e/guardian_52_icon_registry.py
verify: python -X utf8 scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(chat 5-c): attachment cards"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7 and 10 apply. Read `.claude/skills/design-system/SKILL.md` once (semantic tokens `surface`/`fg`/`line`, `<svg appIcon="name">` only, no inline svg paths in templates, touch targets at least 40x40 px, Persian `title` and `aria-label` on every icon-only button, Persian digits).
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`.
- Change only these four files: `chat-drawer.component.html` (edit), `shared/icons/icon-registry.ts` (add entries only), and two NEW spec files `chat-drawer/chat-drawer-5c.dom.spec.ts` and `shared/components/document-preview/document-preview-gallery.spec.ts`. Never edit any `.ts` component or service, any existing spec, anything under `scripts/` or `Documents/`, `tasks.md` or `tasks_history.md`.
- All UI text is Persian. Spec descriptions may be English; comments in Persian or English.
- No push. Stage only your own files.

2. Context (read these; nothing else is needed):
- `frontend/src/app/modules/common/components/communications/chat-drawer/chat-drawer.component.ts`: read the exported types at the top (`AttachmentKind`, `PickedFile`, `MediaEntry`, `CHAT_ALLOWED_EXTENSIONS`, `CHAT_MAX_FILES`) and these public members (search their names): `attachmentPreview(att)` (blob URL of the server thumbnail, `null` while loading or while `preview_status === 'pending'`), `attachmentKind(att)` (`'image' | 'pdf' | 'word' | 'excel' | 'text' | 'file'`), `fileExt(name)`, `fileSizeFa(bytes)` (for example «۱٫۲ مگابایت»), `fileMetaFa(att)` (for example «۳ صفحه · ۱٫۲ مگابایت»), `openAttachment(msg, att)` (opens the lightbox gallery for images and PDFs, downloads other files), `downloadAttachment(att)`, `mediaImages()` and `mediaFiles()` (computed `MediaEntry[]` of the loaded messages), `addFiles(files)`, `pickedFiles()`, `removePicked(key)`, `isOnline()`, `sendMessage()`, `infoOpen`.
- `frontend/src/app/core/services/communication.service.ts` lines 19–40: `MessageAttachment` (`id, file_name, file_size, content_type, download_url, thumbnail_url, width, height, page_count, preview_status`).
- `chat-drawer.component.html`: the bubble block that starts at the comment `<!-- Attachment Preview -->` (about lines 268–290; it already calls `openAttachment(msg, att)`), the composer strip `data-testid="picked-strip"` (already done by the manager; do not change it), and the info panel `data-testid="info-panel"` (the members section starts at the comment `<!-- اعضا -->`; the mute/leave buttons start at the comment `<!-- صدا و ترک گروه -->`).
- `frontend/src/app/shared/components/document-preview/document-preview.component.ts` and `.html`: gallery API `openGallery(items, index)`, `next()`, `prev()`, `hasNext`, `hasPrev`, `isGallery`, `galleryIndex`, `current`, `requestGoToMessage()`, output `goToMessage`, `DocumentPreviewSource` fields `kind`, `subtitle`, `messageId`, `downloadName`, `load`; test ids `gallery-prev`, `gallery-next`, `preview-goto`, `preview-subtitle`, `preview-resolving`, `preview-resolve-failed`. Arrow keys: `ArrowLeft` = next, `ArrowRight` = previous (right-to-left).
- Spec style references: `chat-drawer/chat-drawer.component.dom.spec.ts` lines 1–115 (TestBed setup, mocked `CommunicationService`, `q()` helper; copy its setup into your new file) and `document-preview/document-preview.component.spec.ts` lines 1–60.
- `frontend/src/app/shared/icons/icon-registry.ts` (entry format, look at `'file-text'`).

3. Definitions:
- "Image attachment" = `content_type` starting with `image/`. "PDF attachment" = `attachmentKind(att) === 'pdf'`. "Other attachment" = every other kind.
- "Ratio box" = a wrapper whose `aspect-ratio` style is `width / height` when both are positive numbers (bind `[style.aspect-ratio]="att.width && att.height ? att.width + ' / ' + att.height : null"`), with `max-h-64` and full bubble width, so the bubble reserves space before the image loads.
- "Skeleton" = `<div class="animate-pulse bg-black/10 dark:bg-white/10 ...">` shown inside the ratio box while `attachmentPreview(att)` is `null`; when the preview exists show `<img [src]=... loading="lazy" class="w-full h-full object-cover">` (never `NgOptimizedImage`, these are blob URLs).

4. Task:
- a) Icons: add four entries to `icon-registry.ts`, lucide-style 24x24 stroke paths, names `file-pdf`, `file-word`, `file-excel`, `file-image` (a file outline with a small distinguishing mark; reuse the `file-text` outline path). Do not change existing entries.
- b) Bubble (replace the body of the `<!-- Attachment Preview -->` block; keep `*ngIf="msg.attachments && msg.attachments.length > 0"`):
  - Split the message's attachments into images and the rest (use template expressions with `attachmentKind`; you may not add `.ts` code).
  - One image: a full-width button `data-testid="att-image"` containing the ratio box with skeleton/img; click → `openAttachment(msg, att)`; `aria-label` and `title` «نمایش » + file name.
  - Two or more images: a `grid grid-cols-2 gap-1` wrapper `data-testid="att-grid"` showing at most 4 square tiles (`aspect-square`, each a button with `data-testid="att-image"`); when there are more than 4 images, the 4th tile shows a dark overlay with «+N» where N = images − 3, in Persian digits (`(n).toLocaleString('fa-IR')`), `data-testid="att-more"`; click on any tile → `openAttachment(msg, that att)`.
  - PDF: card `data-testid="att-card-pdf"`: on top the thumbnail (ratio box with skeleton/img when `att.thumbnail_url` or `preview_status === 'pending'`, otherwise a `file-pdf` icon block), below it the file name (truncate, `title`) and `fileMetaFa(att)`; the card body is a button → `openAttachment(msg, att)` with `aria-label` «نمایش » + name; a separate icon-only download button (`appIcon="action-download"`, 40x40, `aria-label`/`title` «دانلود » + name) → `downloadAttachment(att)`.
  - Other files: card `data-testid="att-card-file"` with a coloured icon (`file-word` blue, `file-excel` green, `file-text` slate for text, `hero-paper-clip` for the rest), the name, the extension uppercased in a small `dir="ltr"` badge, `fileSizeFa(att.file_size)`, and the download button as above; clicking the card → `downloadAttachment(att)`.
  - Keep the existing "pending file" block and the `upload-progress` block below it untouched.
- c) Info panel media tab: insert a new section between the members section and the comment `<!-- صدا و ترک گروه -->`, wrapper `data-testid="media-tab"`, heading «رسانه و فایل‌ها» (h4, same style as the members heading). Render two sub-sections one under the other: «عکس‌ها» as a `grid grid-cols-3 gap-1` of square thumbnail buttons (`data-testid="media-image"`, using `attachmentPreview(e.att)` with skeleton) and «فایل‌ها» as a list of rows (`data-testid="media-file"`, icon + name + `fileMetaFa(e.att)`); each opens `openAttachment(e.msg, e.att)`. Empty states: «عکسی در این گفتگو نیست» / «فایلی در این گفتگو نیست» (`data-testid="media-empty"`). Each sub-section has an h5 heading «عکس‌ها» / «فایل‌ها». Lists come only from loaded messages, add a small muted line «فقط پیام‌های بارگذاری‌شده».
- d) Spec `chat-drawer-5c.dom.spec.ts` (at least 9 tests), using the same TestBed setup as the existing DOM spec, a conversation opened with `activeTab` `'chat'`, and messages set through the component's `messages` signal:
  1. one image attachment with `width: 800, height: 400` renders `att-image` whose ratio box has `aspect-ratio` `800 / 400`, and a skeleton while `attachmentPreview` returns null (spy on it with `vi.spyOn(component, 'attachmentPreview').mockReturnValue(null)`);
  2. with the spy returning `'blob:x'` an `<img loading="lazy">` with that src is rendered;
  3. five images in one message render `att-grid` with exactly 4 `att-image` tiles and `att-more` text containing «+۲»;
  4. a PDF attachment with `page_count: 3, file_size: 1258291` renders `att-card-pdf` containing «۳ صفحه» and «مگابایت»;
  5. a `.docx` attachment renders `att-card-file` containing «DOCX» (case-insensitive check) and uses `appIcon` `file-word`;
  6. clicking `att-image` calls `openAttachment` with the message and the attachment (spy, `mockImplementation(() => {})`); clicking the PDF download button calls `downloadAttachment` and NOT `openAttachment`;
  7. `component.addFiles([png, pdf])` (Files named `a.png` type `image/png` and `b.pdf` type `application/pdf`; stub `URL.createObjectURL` with `vi.fn(() => 'blob:p')` and `URL.revokeObjectURL` with `vi.fn()`) shows `picked-strip` with two items; clicking the first `picked-remove` leaves one item;
  8. a file named `x.svg` passed to `addFiles` is refused (strip stays empty) and `ToastService.show` (spy) was called with `'error'`;
  9. with two picked files and `vi.spyOn(component, 'isOnline').mockReturnValue(false)`, `offline-multi-note` is visible; calling `component.sendMessage()` does NOT call the mocked service `sendMessage`, and `pickedFiles().length` is still 2;
  10. opening the info panel (`component.infoOpen.set(true)`, members signal empty) with one image and one PDF message shows `media-tab` with one `media-image` and one `media-file`; with no attachments both `media-empty` texts appear.
- e) Spec `document-preview-gallery.spec.ts` (at least 6 tests) on `DocumentPreviewComponent` (setup like the existing spec):
  1. `openGallery([a, b, c], 1)` with sources `{ title: 'a.png', url: '/media/a.png', kind: 'image' }` etc. shows `gallery-prev` and `gallery-next` enabled and `preview-subtitle` containing «۲ از ۳»;
  2. clicking `gallery-next` shows the third title and disables `gallery-next`;
  3. dispatching `new KeyboardEvent('keydown', { key: 'ArrowLeft' })` on `document` moves to the next item; `ArrowRight` moves back;
  4. a source with `url: ''` and `load: () => Promise.resolve('blob:z')` shows `preview-resolving` first, then (after `await fixture.whenStable()`) an `<img>` whose src is `blob:z`; a source whose `load` rejects shows `preview-resolve-failed`;
  5. a source with `messageId: '7'` shows `preview-goto`; clicking it emits `goToMessage` with that source and closes the lightbox;
  6. single `open({ title: 'x.png', url: '/media/x.png' })` shows no `gallery-prev`/`gallery-next` and no counter.

Out of scope: any `.ts` component/service change, the composer strip, the send path, offline queue, backend.

5. Tool policy:
- Reading files is unrestricted.
- From `frontend`: `npx ng test --watch=false --include=src/app/modules/common/components/communications/chat-drawer/chat-drawer-5c.dom.spec.ts --include=src/app/shared/components/document-preview/document-preview-gallery.spec.ts --include=src/app/modules/common/components/communications/chat-drawer/chat-drawer.component.dom.spec.ts --include=src/app/shared/components/document-preview/document-preview.component.spec.ts` (at most 6 times).
- From the repository root: `python -X utf8 scripts/e2e/guardian_52_icon_registry.py` and, after your commit, `python -X utf8 scripts/e2e/guardian_56_change_integrity.py --base HEAD~1 --head HEAD`.
- If a command fails, read its output and change approach; do not repeat the same call unchanged.

6. Before finishing:
- The test command passes with zero failures (existing specs included).
- `git status --short` shows only your four files before the commit and nothing after it.

7. Output and stop condition:
- Commit with this message, without push:
feat(chat 5-c): attachment cards, image grid, file-type icons, media tab, DOM specs
- Short English report: what you changed per file, the test summary line, and anything that differed from this task. End the turn after the commit and the report.

===

[DONE] [ ] Session 1 of 1 — Chat plan final step: specs for the persistent chat outbox (communication.service) and the logout warning (layout)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/core/services/communication.service.spec.ts" "frontend/src/app/modules/common/components/layout/layout.spec.ts"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/core/services/communication.service.spec.ts --require "vi.mock" --require "flushOutbox" --require "unsentOutboxCount" --require "discardOutboxForLogout" --require "restoreOutbox" --require "waiting_network"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/common/components/layout/layout.spec.ts --min-tests 3 --require "unsentOutboxCount" --require "discardOutboxForLogout"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/core/services/communication.service.spec.ts" --include "src/app/modules/common/components/layout/layout.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(chat 6): outbox"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`.
- Change only two files: `frontend/src/app/core/services/communication.service.spec.ts` and `frontend/src/app/modules/common/components/layout/layout.spec.ts`. Never edit any non-spec `.ts`, any html, anything under `scripts/` or `Documents/`, `tasks.md` or `tasks_history.md`.
- Existing tests in both files must keep passing unchanged. Spec descriptions in English.
- No push. Stage only your own two files.

2. Context (read these; nothing else is needed):
- `frontend/src/app/core/services/chat-outbox.ts` (whole file, about 100 lines): `ChatOutboxRow` (`tempId, userId, conversation, message, files, uploadedCount, autoRetry, createdAt`), `toOutboxFiles`, `fromOutboxFiles`, `putChatOutbox`, `updateChatOutbox`, `deleteChatOutbox`, `listChatOutbox(userId)`, `countChatOutbox(userId)`, `deleteChatOutboxForUser(userId)`.
- `frontend/src/app/core/services/communication.service.ts`: line 14 (the import from `./chat-outbox`), lines 1030–1190 (`outboxSync`, `outboxDelete`, `restoreOutbox`, `flushOutbox`, `unsentOutboxCount`, `discardOutboxForLogout`, `discardOutgoing`), lines 1470–1625 (the send-with-files path that calls `outboxSync`/`outboxDelete`, states `pending`, `failed`, `waiting_network`, flag `autoRetry`), and `getCurrentUserId()`.
- `frontend/src/app/core/services/communication.service.spec.ts`: lines 1–80 (TestBed setup, HttpTestingController), lines 585–620 (`withFakeSockets`), lines 920–1000 (`failUploadOnce` and the R3 tests). Reuse these helpers and the existing way the current user is set.
- `frontend/src/app/modules/common/components/layout/layout.ts` lines 1336–1400 (`logout()`: calls `commService.unsentOutboxCount()`, opens `confirmDialog.open(...)` when > 0, returns on cancel, then calls `commService.discardOutboxForLogout()` and the auth logout; read the exact calls there) and `layout.spec.ts` (whole file, 60 lines).

3. Definitions:
- "Outbox mock" = at the top of `communication.service.spec.ts`, `vi.mock('./chat-outbox', ...)` backed by an in-memory `Map<string, ChatOutboxRow>` (jsdom has no indexedDB). Keep `toOutboxFiles`/`fromOutboxFiles` real via `vi.importActual`; implement `putChatOutbox` (set, return true), `updateChatOutbox` (merge, return 1 or 0), `deleteChatOutbox`, `listChatOutbox` (filter by userId, sort by createdAt), `countChatOutbox`, `deleteChatOutboxForUser` as `vi.fn` wrappers over the Map. Clear the Map and the mock calls in `beforeEach`. Make sure the existing tests still pass with the mock in place.
- "Waiting row" = a row with `autoRetry: true` and a message whose status is `pending`.

4. Task — add one `describe('chat outbox (stage 6)', ...)` block in `communication.service.spec.ts` with these tests:
- a) send with one file: `putChatOutbox` is called before the upload/POST request is flushed, with the files and the current user id.
- b) the message POST and every file upload return 2xx → `deleteChatOutbox` called with that tempId; the Map no longer has the row.
- c) upload returns 503 → the row stays in the Map; the in-memory message is `pending` with `waiting_network` set (use the exact field name from the service).
- d) upload returns 400 with `{ detail: '...' }` → message status `failed`, row kept with `autoRetry: false`.
- e) `discardOutgoing(tempId)` → `deleteChatOutbox` called and the row is gone.
- f) restore: Map pre-filled with two rows of user 1 (one with `uploadedCount: 1` of 2 files) and one row of user 2; with user 1 logged in, after `restoreOutbox` (call it the way the service does, through `flushOutbox` or the public entry used on connect) only user 1's rows appear in `outgoingMessages`/`pendingFiles`, and `uploadedCount` is preserved; user 2's row is never shown and never deleted.
- g) flush order: three waiting rows of user 1 with createdAt t1 < t2 < t3; `flushOutbox()` sends them in that order (check the order of HTTP requests); when the second one gets 503, the third is not sent in that flush.
- h) `unsentOutboxCount()` returns the count of the current user's rows only.
- i) `discardOutboxForLogout()` deletes only the current user's rows (user 2's row stays in the Map).
- In `layout.spec.ts` add a `describe('logout with unsent chat messages', ...)` with three tests: spy `component.commService.unsentOutboxCount` and `discardOutboxForLogout`, the `ConfirmDialogService.open`, and the auth logout call used in `logout()`:
  - count 1 → confirm dialog opened once with a danger type;
  - cancel (open resolves false) → no discard, no auth logout;
  - confirm (open resolves true for every dialog) → discard called, then auth logout called (check the order).

5. Tool policy:
- Reading files is unrestricted.
- From `frontend`: `npx ng test --watch=false --include=src/app/core/services/communication.service.spec.ts --include=src/app/modules/common/components/layout/layout.spec.ts` (at most 8 times).
- If a command fails, read its output and change approach; do not repeat the same call unchanged.
- If a scenario cannot be tested exactly as written because the service behaves differently, test the real behaviour, never change non-spec code, and say so in the report.

6. Before finishing:
- The test command passes with zero failures (existing specs included).
- `git status --short` shows only your two files (plus the pre-existing `tests/playwright/tools/index.py`) before the commit and only that pre-existing file after it.

7. Output and stop condition:
- Commit with this message, without push:
test(chat 6): outbox persistence, restore, flush order and logout warning specs
- Short English report: what you tested per file, the test summary line, and anything that differed from this task. End the turn after the commit and the report.

===

[DONE] [ ] Session 1 of 1 — Chat voice messages: DOM specs for recording, sending, draft on switch and the player

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/common/components/communications/chat-drawer/chat-drawer-voice.dom.spec.ts"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/common/components/communications/chat-drawer/chat-drawer-voice.dom.spec.ts --min-tests 10 --require "record-start" --require "recording-bar" --require "record-cancel" --require "record-send" --require "att-audio" --require "audio-toggle" --require "stashComposerDraft" --require "getUserMedia"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/common/components/communications/chat-drawer/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(chat voice)"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`.
- Create exactly one NEW file: `frontend/src/app/modules/common/components/communications/chat-drawer/chat-drawer-voice.dom.spec.ts`. Never edit any other file (no component, service, template, existing spec, `scripts/`, `Documents/`, `tasks.md`, `tasks_history.md`).
- Spec descriptions in English. No push. Stage only your new file.

2. Context (read these; nothing else is needed):
- `chat-drawer.component.ts`: search `// ─── پیام صوتی (U9) ───` and read that whole section (about 200 lines: `recording`, `recordSeconds`, `canRecord()`, `pickRecordMime()`, `startRecording()`, `stopRecording(send)`, `onRecorderStopped()`, `buildVoiceFile()`, `takeRecordingNow()`, `durationFa()`, `toggleAudio(att)`, `isPlaying(att)`, `seekAudio()`); also `stashDraft()` just above it, `attachmentKind()`, `addFiles()`, `sendMessage()` and `ngOnDestroy()`.
- `chat-drawer.component.html`: the block with `data-testid="att-audio"` (bubble player) and the composer blocks `data-testid="recording-bar"`, `record-cancel`, `record-time`, `record-send`, `record-start`.
- Spec setup to copy: `chat-drawer-5c.dom.spec.ts` lines 1–120 (TestBed, mocked `CommunicationService` including `sendMessage`, `stashComposerDraft`, `takeComposerDraft`, and the `q()` helper). Open a conversation the same way that file does.

3. Definitions:
- "Fake recorder" = a class installed on `globalThis.MediaRecorder` in `beforeEach` (removed in `afterEach`): static `isTypeSupported(m)` returns true only for `'audio/webm;codecs=opus'`; constructor stores `stream` and `options`; `mimeType = 'audio/webm;codecs=opus'`; `start(timeslice)` records the call; `stop()` calls `this.onstop?.()` synchronously; a helper `emit(bytes: number)` calls `this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) })`. Keep the last instance in a variable.
- "Fake mic" = `Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) } })` where `track = { stop: vi.fn() }`.
- Use `vi.useFakeTimers()` only in tests that need the timer; advance with `vi.advanceTimersByTime`. Use `vi.setSystemTime` to control durations.

4. Task — tests:
- a) without `MediaRecorder` (jsdom default) `record-start` is absent and the send action button is shown.
- b) with fake recorder and mic, empty composer: `record-start` is shown; typing text hides it (send button back); a picked file also hides it.
- c) click `record-start` → `getUserMedia` called with `{ audio: true }`; `recording-bar` shown; the textarea `composer` is gone; recorder `start` called with 1000 and `audioBitsPerSecond` 32000.
- d) `getUserMedia` rejects → no `recording-bar`, an error toast (spy on the component's `ToastService.error` or check the mocked toast, as the 5c spec does).
- e) timer: after 75 seconds of fake time `record-time` shows `۱:۱۵`.
- f) send: emit 2000 bytes, advance 5 s, click `record-send` → `commService.sendMessage` called once with a files array of one `File` whose name matches `/^voice_\d{8}-\d{6}_5s\.webm$/` and type `audio/webm`; the mic track `stop` called; `recording-bar` gone.
- g) cancel: emit data, click `record-cancel` → `sendMessage` not called, track stopped, no picked files.
- h) shorter than 1 second (emit data, click `record-send` at once) → `sendMessage` not called (warning toast).
- i) switching away mid-recording: emit data, advance 3 s, then call `component.backToList()` (or select another conversation) → `stashComposerDraft` called with the conversation id and a files array whose last item is the voice `File` (name ends with `_3s.webm`); `sendMessage` not called; track stopped.
- j) size limit: set `component.maxUploadMb.set(1)`; emitting chunks totalling more than 0.95 MB while recording → `sendMessage` called once automatically.
- k) bubble: a message with attachment `{ id: 7, file_name: 'voice_x_65s.webm', content_type: 'audio/webm', duration: 65, download_url: '/api/communications/attachments/7/download/' }` renders `att-audio` (and not `att-card-file`), `audio-time` contains `۱:۰۵`; `attachmentKind` returns `'audio'` for content type `audio/ogg` and for name `a.m4a`.
- l) `durationFa`: 0 → `۰:۰۰`, 75 → `۱:۱۵`, 3725 → `۱:۰۲:۰۵`.

5. Tool policy:
- Reading files is unrestricted.
- From `frontend`: `npx ng test --watch=false --include=src/app/modules/common/components/communications/chat-drawer/chat-drawer-voice.dom.spec.ts` (at most 8 times), and once at the end `npx ng test --watch=false --include="src/app/modules/common/components/communications/chat-drawer/*.spec.ts"`.
- If a scenario behaves differently from this task, test the real behaviour, never change non-spec code, and say so in the report.

6. Before finishing:
- Both test commands pass with zero failures.
- `git status --short` shows only your new file (plus the pre-existing `tests/playwright/tools/index.py`) before the commit and only that pre-existing file after it.

7. Output and stop condition:
- Commit with this message, without push:
test(chat voice): recording, send, cancel, draft on switch, size limit and player DOM specs
- Short English report: tests per scenario, the test summary line, and anything that differed from this task. End the turn after the commit and the report.

===

[DONE] [ ] Session 1 of 1 — Chat voice messages release on the local app environment: backup, web build with the ngsw patch, staging APK 1.0.0 rebuild and badging check, publish it on the app download path; the runner restarts Daphne and runs the health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session is a release only. Do not edit, create, stage or commit any tracked file. Write only under `scratch/logs/`. Do not run `git` commands that change the working tree or history. The file `tests/playwright/tools/index.py` belongs to another session: never touch it.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`. The runner restarts Daphne after your turn.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`. Build only the STAGING APK (`ir.comanage.soft.test`), never a prod APK.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `backend/backups/`, `backend/media/` or `frontend/dist/`.
- Never print the content of any file in `E:\warehouse-secrets\`, and never print the value of `FIREBASE_CREDENTIALS_FILE` or any key path.

2. Context: commit `4918eaf3` added chat voice messages (recording in the chat drawer, a player in the bubble, Android `RECORD_AUDIO` permission), and `656f0ba0` added their DOM specs. Later commits `b2218326` and `268a84e9` changed workflow and petty cash backend code; they ship in the same release. The app version stays `1.0.0` (`versionCode 10000`); do not change any version. The command `publish_mobile_apk --apk <path> --version 1.0.0 --channel direct --env staging` overwrites `CoManage-1.0.0-direct-test.apk` on the download path `/api/public/mobile-files/apk/<file>` and prints the public path. Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order (all `manage.py` commands in `backend`, with `PYTHONUTF8=1`):
- a) Backup:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app chat voice'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0.
- b) Web build in `frontend`: `npx ng build --delete-output-path=false`, wait for it to finish, then `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.
- c) Copy `E:\warehouse-secrets\comanage\google-services.json` to `frontend\android\app\google-services.json` (it is git-ignored; confirm with `git status --short` that it does not appear). Then in `frontend`: `npm run build:mobile-test`, then in `frontend\android`: `.\gradlew.bat assembleStagingDirectRelease`.
- d) Badging: `E:\Android\Sdk\build-tools\36.0.0\aapt.exe dump badging frontend\android\app\build\outputs\apk\stagingDirect\release\app-staging-direct-release.apk > scratch\logs\apk_voice_badging.txt` (from the repo root; if `aapt.exe` is missing there, use `35.0.0`). Read the first line of that file: it must show package `ir.comanage.soft.test`, `versionCode='10000'` and `versionName='1.0.0'`. Also confirm with `Select-String -Path scratch\logs\apk_voice_badging.txt -Pattern RECORD_AUDIO` that the permission `android.permission.RECORD_AUDIO` is listed.
- e) Publish, in `backend`: `.\venv\Scripts\python.exe manage.py publish_mobile_apk --apk ..\frontend\android\app\build\outputs\apk\stagingDirect\release\app-staging-direct-release.apk --version 1.0.0 --channel direct --env staging` and note the printed path.

4. Tool policy: only the commands above, `git status --short`, `Copy-Item`, and `Get-Content`/`Select-String` for reading files under `scratch/logs/`. The web build at most twice, Gradle at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `scratch/logs/apk_voice_badging.txt` exists; `git status --short` shows nothing except runner files and `tests/playwright/tools/index.py`.

6. Output and stop condition: a short English report with the backup filename and size, the web build result and the patch line, the APK path and size, the badging first line, the RECORD_AUDIO line, and the publish path. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Chat voice review release on the local app environment: backup, web build with the ngsw patch, staging APK 1.0.0 rebuild and badging check, publish it on the app download path; the runner restarts Daphne and runs the health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session is a release only. Do not edit, create, stage or commit any tracked file. Write only under `scratch/logs/`. Do not run `git` commands that change the working tree or history. The file `tests/playwright/tools/index.py` belongs to another session: never touch it.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`. The runner restarts Daphne after your turn.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`. Build only the STAGING APK (`ir.comanage.soft.test`), never a prod APK.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `backend/backups/`, `backend/media/` or `frontend/dist/`.
- Never print the content of any file in `E:\warehouse-secrets\`, and never print the value of `FIREBASE_CREDENTIALS_FILE` or any key path.

2. Context: commit `fad1f16b` lets the user listen to a voice message before sending it (a new check button in the recording bar keeps the voice in the pre-send strip with a play button) and makes a voice in the conversation media panel play instead of download. The app version stays `1.0.0` (`versionCode 10000`); do not change any version. The command `publish_mobile_apk --apk <path> --version 1.0.0 --channel direct --env staging` overwrites `CoManage-1.0.0-direct-test.apk` on the download path `/api/public/mobile-files/apk/<file>` and prints the public path. Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order (all `manage.py` commands in `backend`, with `PYTHONUTF8=1`):
- a) Backup:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app chat voice review'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0.
- b) Web build in `frontend`: `npx ng build --delete-output-path=false`, wait for it to finish, then `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.
- c) Copy `E:\warehouse-secrets\comanage\google-services.json` to `frontend\android\app\google-services.json` (it is git-ignored; confirm with `git status --short` that it does not appear). Then in `frontend`: `npm run build:mobile-test`, then in `frontend\android`: `.\gradlew.bat assembleStagingDirectRelease`.
- d) Badging: `E:\Android\Sdk\build-tools\36.0.0\aapt.exe dump badging frontend\android\app\build\outputs\apk\stagingDirect\release\app-staging-direct-release.apk > scratch\logs\apk_voice2_badging.txt` (from the repo root; if `aapt.exe` is missing there, use `35.0.0`). Read the first line of that file: it must show package `ir.comanage.soft.test`, `versionCode='10000'` and `versionName='1.0.0'`. Also confirm with `Select-String -Path scratch\logs\apk_voice2_badging.txt -Pattern RECORD_AUDIO` that the permission `android.permission.RECORD_AUDIO` is listed.
- e) Publish, in `backend`: `.\venv\Scripts\python.exe manage.py publish_mobile_apk --apk ..\frontend\android\app\build\outputs\apk\stagingDirect\release\app-staging-direct-release.apk --version 1.0.0 --channel direct --env staging` and note the printed path.

4. Tool policy: only the commands above, `git status --short`, `Copy-Item`, and `Get-Content`/`Select-String` for reading files under `scratch/logs/`. The web build at most twice, Gradle at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `scratch/logs/apk_voice2_badging.txt` exists; `git status --short` shows nothing except runner files and `tests/playwright/tools/index.py`.

6. Output and stop condition: a short English report with the backup filename and size, the web build result and the patch line, the APK path and size, the badging first line, the RECORD_AUDIO line, and the publish path. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Backend restart on the local app environment for the APK no-store header (no build)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background.
- Do not edit, create, stage or commit any tracked file. Do not run `taskkill`, `wt.exe`, `migrate`, any build, or anything against `soft.farsalish.ir`.

2. Context: commit adds `Cache-Control: no-store` to the APK download view (`backend/core/settings_core/mobile_views.py`). The runner restarts Daphne after your turn; the release check also needs a fresh GDrive worker.

3. Task: from the repo root run `python scripts/automation/verify_tools.py restart-worker` and wait for it to print the new worker pids and a fresh heartbeat. Then run `git status --short`.

4. Output and stop condition: a short English report with the restart-worker output lines and the git status output. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Payment receipt release on the local app environment: backup, web build with the ngsw patch, staging APK 1.0.0 rebuild and badging check, publish it on the app download path; the runner restarts Daphne and runs the health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session is a release only. Do not edit, create, stage or commit any tracked file. Write only under `scratch/logs/`. Do not run `git` commands that change the working tree or history. The file `tests/playwright/tools/index.py` belongs to another session: never touch it.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`. The runner restarts Daphne after your turn.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`. Build only the STAGING APK (`ir.comanage.soft.test`), never a prod APK.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `backend/backups/`, `backend/media/` or `frontend/dist/`.
- Never print the content of any file in `E:\warehouse-secrets\`, and never print the value of `FIREBASE_CREDENTIALS_FILE` or any key path.

2. Context: commit `5399f19b` makes a payment receipt file required on every invoice instalment and every petty cash charge or statement payment (the pay forms get a required file input), and shows a read-only list of payment receipts in the invoice and petty cash details. There is no migration. The app version stays `1.0.0` (`versionCode 10000`); do not change any version. The command `publish_mobile_apk --apk <path> --version 1.0.0 --channel direct --env staging` overwrites `CoManage-1.0.0-direct-test.apk` on the download path `/api/public/mobile-files/apk/<file>` and prints the public path. Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order (all `manage.py` commands in `backend`, with `PYTHONUTF8=1`):
- a) Backup:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app payment receipt'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0.
- b) Check: `.\venv\Scripts\python.exe manage.py check`. It must end with `System check identified 1 issue (0 silenced).` (the known Redis hint) or `no issues`. Stop and report any error.
- c) Web build in `frontend`: `npx ng build --delete-output-path=false`, wait for it to finish, then `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.
- d) Copy `E:\warehouse-secrets\comanage\google-services.json` to `frontend\android\app\google-services.json` (it is git-ignored; confirm with `git status --short` that it does not appear). Then in `frontend`: `npm run build:mobile-test`, then in `frontend\android`: `.\gradlew.bat assembleStagingDirectRelease`.
- e) Badging: `E:\Android\Sdk\build-tools\36.0.0\aapt.exe dump badging frontend\android\app\build\outputs\apk\stagingDirect\release\app-staging-direct-release.apk > scratch\logs\apk_receipt_badging.txt` (from the repo root; if `aapt.exe` is missing there, use `35.0.0`). Read the first line of that file: it must show package `ir.comanage.soft.test`, `versionCode='10000'` and `versionName='1.0.0'`.
- f) Publish, in `backend`: `.\venv\Scripts\python.exe manage.py publish_mobile_apk --apk ..\frontend\android\app\build\outputs\apk\stagingDirect\release\app-staging-direct-release.apk --version 1.0.0 --channel direct --env staging` and note the printed path.
- g) Confirm the new web code is in the build: `Select-String -Path frontend\dist\*\browser\*.js -Pattern payment_receipt -List | Select-Object -First 1` must print at least one file (if the path pattern finds nothing, use `Get-ChildItem frontend\dist -Recurse -Filter *.js | Select-String -Pattern payment_receipt -List | Select-Object -First 1`).

4. Tool policy: only the commands above, `git status --short`, `Copy-Item`, and `Get-Content`/`Select-String`/`Get-ChildItem` for reading files under `scratch/logs/` and `frontend/dist/`. The web build at most twice, Gradle at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `scratch/logs/apk_receipt_badging.txt` exists; `git status --short` shows nothing except runner files and `tests/playwright/tools/index.py`.

6. Output and stop condition: a short English report with the backup filename and size, the check result, the web build result and the patch line, the APK path and size, the badging first line, the publish path, and the step g file name. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Chat access UI: messenger section in the user edit dialog and the company chat contact-scope card, with DOM specs

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/common/components/users/user-chat-policy/*" --allow "frontend/src/app/modules/common/components/users/users.html" --allow "frontend/src/app/modules/common/components/users/users.ts" --allow "frontend/src/app/modules/common/components/operations/companies/company-chat-scope-card/*" --allow "frontend/src/app/modules/common/components/operations/companies/companies.html" --allow "frontend/src/app/modules/common/components/operations/companies/companies.ts"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/common/components/users/user-chat-policy/user-chat-policy.dom.spec.ts --min-tests 8 --require "communications/policies/users/" --require "chat_allowed" --require "contact_scope" --require "chat-policy-scope" --require "chat-policy-toggle"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/common/components/operations/companies/company-chat-scope-card/company-chat-scope-card.dom.spec.ts --min-tests 5 --require "communications/policies/companies/" --require "contact_scope" --require "chat-scope-select"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/common/components/users/user-chat-policy/*.spec.ts" --include "src/app/modules/common/components/operations/companies/company-chat-scope-card/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(chat access ui)"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`.
- Create only these NEW files: `frontend/src/app/modules/common/components/users/user-chat-policy/user-chat-policy.ts`, `user-chat-policy.html`, `user-chat-policy.dom.spec.ts` (same folder), and `frontend/src/app/modules/common/components/operations/companies/company-chat-scope-card/company-chat-scope-card.ts`, `company-chat-scope-card.html`, `company-chat-scope-card.dom.spec.ts` (same folder).
- Edit only these existing files, and only as described in section 4: `users/users.html`, `users/users.ts`, `operations/companies/companies.html`, `operations/companies/companies.ts` (all under `frontend/src/app/modules/common/components/`). Never edit any other file (no service, no `core/`, no `shared/`, no layout, no chat drawer, no `scripts/`, `Documents/`, `tasks.md`, `tasks_history.md`, `backend/`).
- All user-facing text in Persian, exactly as given below. Spec descriptions in English. No push. Stage only the files listed above.
- Icons only as `<svg appIcon="name" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>` with `SvgIconDirective`, and only the names `message-square` and `users` (both exist in `frontend/src/app/shared/icons/icon-registry.ts`). Never write an inline svg path.

2. Context (read these; nothing else is needed):
- Style and structure to copy: `frontend/src/app/modules/common/components/operations/companies/company-settings-tab/company-settings-tab.component.ts` (whole file: `ApiService`, `firstValueFrom`, `loadSeq`, `ToastService` optional, `ChangeDetectorRef`), its `.html` (loading, error with retry button, section card) and its `company-settings-tab.dom.spec.ts` (TestBed setup and the mocked `ApiService`).
- `frontend/src/app/core/api/api.service.ts`: `get`/`put` add the `/api/` prefix and the trailing slash, so pass endpoints like `communications/policies/users/12`.
- `frontend/src/app/core/services/permission.service.ts` line 83: `isSuperuser` signal (the acting user).
- `frontend/src/app/shared/components/toggle-switch/toggle-switch.component.ts`: `<app-toggle-switch [checked] (checkedChange) title>`.
- `users/users.html` lines 1580–1625 (the security tab with the active and superuser toggles; the superuser block is `<div *ngIf="auth.user()?.is_superuser" ...>` and its closing `</div>` is followed by three more closing `</div>`s). `users/users.ts` line 63 (component `imports` array) and line 40 (ToggleSwitch import as an example of the relative import path). In `users.html` the edited user is `editingUser` (has `id`, `is_superuser`) and the acting user is `auth.user()`.
- `operations/companies/companies.html` lines 1240–1252 (the `settings` tab panel that renders `<app-company-settings-tab [companyId]="companyModal.data.id!" />`), and `operations/companies/companies.ts` line 57 (component `imports` array).

3. Definitions (server API, already built):
- User policy: `GET communications/policies/users/<id>` returns `{ user_id, chat_allowed: boolean, contact_scope: '' | 'section' | 'project' | 'company' | 'all', updated_by, updated_at }`. `PUT` on the same endpoint with body `{ chat_allowed, contact_scope }` returns the same shape. `''` means "follow the company". A 403 on GET means the acting user may not manage this user.
- Company policy: `GET communications/policies/companies/<id>` returns `{ company_id, contact_scope: 'section' | 'project' | 'company' | 'all', updated_by, updated_at }`; `PUT` body `{ contact_scope }`. A 403 on GET means the acting user may not manage this company.
- Only a superuser may send `all`; the server answers 403 otherwise. Error text from the server is in `err.error.detail`, or else the first value of `err.error` (a string or the first item of an array).
- Scope labels (exact Persian): `''` → «پیروی از شرکت», `section` → «بخش», `project` → «پروژه», `company` → «شرکت», `all` → «همهٔ شرکت‌ها».

4. Task:
- a) `UserChatPolicyComponent` (selector `app-user-chat-policy`, standalone, imports `CommonModule`, `FormsModule`, `SvgIconDirective`, `ToggleSwitchComponent`). Input `@Input({ required: true }) userId!: number`. On init, and when `userId` changes, GET the policy. States:
  - loading: a small pulse skeleton with `role="status"` and sr-only text «در حال بارگذاری تنظیمات پیام‌رسان…».
  - GET 403: render nothing at all (set a `hidden` flag; the template is empty).
  - other GET error: a rose alert with «دریافت تنظیمات پیام‌رسان ممکن نشد.» and a retry button (copy the settings tab retry button, label «تلاش دوباره»).
  - loaded: a card with a header row (`message-square` icon + title «پیام‌رسان») containing:
    - a row «دسترسی به پیام‌رسان» with helper text, when on: «کاربر می‌تواند گفتگو کند و پیام بفرستد»; when off: «پیام‌رسان برای این کاربر بسته است؛ گفتگوها و پیام‌هایش پاک نمی‌شوند». Control: `<app-toggle-switch data-testid="chat-policy-toggle" [checked]="chatAllowed" (checkedChange)="setAllowed($event)" title="دسترسی به پیام‌رسان" />`.
    - a `<select data-testid="chat-policy-scope" id="chat-policy-scope">` with `<label for="chat-policy-scope">حوزهٔ مخاطبان</label>`. Options in this order: `''`, `section`, `project`, `company`, and `all` only when the acting user is a superuser OR the saved value is `all`. When the saved value is `all` and the acting user is not a superuser, the select is `disabled` and a small helper text shows «فقط مدیر کل می‌تواند این حوزه را تغییر دهد». Helper text under the select: «کاربر فقط افراد داخل این حوزه را در فهرست مخاطبان می‌بیند. گفتگوهای موجود دست نمی‌خورند.»
  - Saving: each change PUTs immediately with the full body `{ chat_allowed, contact_scope }` (current values with the one changed field). While saving, the toggle and the select are disabled. On success apply the server response and call `toast.success('تنظیمات پیام‌رسان ذخیره شد')`. On error revert to the previous values and call `toast.error(<server text, or 'ذخیرهٔ تنظیمات پیام‌رسان ممکن نشد.'>)`.
  - Styling like the settings tab (white card, `border-slate-200`, `rounded-2xl`, `text-xs`), select at least 40px tall (`min-h-[40px]`), `dir="rtl"`, visible focus ring.
- b) In `users.html`, inside the security tab, right after the closing `</div>` of the superuser block and still inside the same container, add:
  `<app-user-chat-policy *ngIf="editingUser?.id && !editingUser.is_superuser && editingUser.id !== auth.user()?.id" [userId]="editingUser.id" />`
  (superuser targets cannot be blocked and nobody edits their own access). Add `UserChatPolicyComponent` to the `imports` array and import it in `users.ts`. No other change in these two files.
- c) `CompanyChatScopeCardComponent` (selector `app-company-chat-scope-card`, standalone, imports `CommonModule`, `FormsModule`, `SvgIconDirective`). Input `@Input({ required: true }) companyId!: number`. GET on init and on `companyId` change. Same loading / 403 hidden / error-with-retry states as (a), error text «دریافت حوزهٔ مخاطبان چت ممکن نشد.». Loaded: a card with header (`users` icon + title «حوزهٔ مخاطبان چت»), a `<select data-testid="chat-scope-select" id="chat-scope-select">` with `<label for="chat-scope-select">پیش‌فرض این شرکت</label>`, options `section`, `project`, `company`, and `all` only when the acting user is a superuser OR the saved value is `all` (then disabled for non-superusers, with the same helper text as in a). Helper text: «کاربرانی که «پیروی از شرکت» دارند فقط افراد این حوزه را در فهرست مخاطبان می‌بینند.» A change PUTs `{ contact_scope }` immediately; success toast «حوزهٔ مخاطبان چت ذخیره شد»; an error reverts and shows the server text or «ذخیرهٔ حوزهٔ مخاطبان چت ممکن نشد.».
- d) In `companies.html`, in the `settings` tab panel, inside the `@else` branch, put `<app-company-chat-scope-card [companyId]="companyModal.data.id!" />` directly above `<app-company-settings-tab ... />`. Add `CompanyChatScopeCardComponent` to the `imports` array and import it in `companies.ts`. No other change in these two files.
- e) `user-chat-policy.dom.spec.ts` (mock `ApiService` with `get`/`put` as `vi.fn()` returning `of(...)` or `throwError(() => ({ status, error }))`; mock `PermissionService` with an `isSuperuser` signal; mock `ToastService`), at least these tests:
  1. GET is called with `communications/policies/users/12` and the toggle reflects `chat_allowed`.
  2. switching the toggle off PUTs `{ chat_allowed: false, contact_scope: '' }` to the same endpoint and shows the success toast.
  3. choosing `section` PUTs `{ chat_allowed: true, contact_scope: 'section' }`; choosing `''` («پیروی از شرکت») PUTs `contact_scope: ''`.
  4. non-superuser actor: no option with value `all`; superuser actor: the option `all` exists.
  5. non-superuser actor and saved value `all`: the option exists and the select is disabled.
  6. PUT error: the values revert and the error toast receives the server `detail` text.
  7. GET 403: no card, no toggle and no select are rendered.
  8. GET 500: the error alert and the retry button are shown; clicking retry calls GET again.
- f) `company-chat-scope-card.dom.spec.ts`, at least: GET endpoint `communications/policies/companies/5` and the selected value; changing to `project` PUTs `{ contact_scope: 'project' }` with the success toast; `all` hidden for a non-superuser and shown for a superuser; GET 403 renders nothing; PUT error reverts with the error toast.

5. Tool policy:
- Reading files is unrestricted.
- From `frontend`: `npx ng test --watch=false --include=src/app/modules/common/components/users/user-chat-policy/user-chat-policy.dom.spec.ts --include=src/app/modules/common/components/operations/companies/company-chat-scope-card/company-chat-scope-card.dom.spec.ts` (at most 8 times). Once at the end, from the repository root: `python scripts/e2e/guardian_52_icon_registry.py` and `python scripts/e2e/guardian_56_change_integrity.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach. If the existing code differs from this task (line numbers, names), follow the real code and say so in the report.

6. Before finishing:
- The test command passes with zero failures; both guardians pass.
- `git status --short` shows only the files listed in section 1 (plus the pre-existing `tests/playwright/tools/index.py` and the runner files) before the commit, and only those pre-existing files after it.

7. Output and stop condition:
- Commit with this message, without push:
feat(chat access ui): messenger section in user edit and company chat contact-scope card; DOM specs
- Short English report: what you built, tests per scenario, the test summary line, guardian results, and anything that differed from this task. End the turn after the commit and the report.

===

[DONE] [ ] Session 1 of 1 — Chat access release on the local app environment: backup, check, web build with the ngsw patch; the runner restarts Daphne and runs the health checks (no APK)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session is a release only. Do not edit, create, stage or commit any tracked file. Write only under `scratch/logs/`. Do not run `git` commands that change the working tree or history. The file `tests/playwright/tools/index.py` belongs to another session: never touch it.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`. The runner restarts Daphne after your turn.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`. Do not build any APK and do not run Gradle.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `backend/backups/`, `backend/media/` or `frontend/dist/`.
- Never print the content of any file in `E:\warehouse-secrets\`.

2. Context: commits `418ec042`, `d3790fcd`, `07a92c54` and `76072f35` add per-user chat access and the chat contact scope (a messenger section in the user edit dialog, a chat contact-scope card in the company settings tab, and the chat button is hidden for a blocked user). Their migration `communications.0005_chat_access_policies` is ALREADY applied on this database; you only confirm it. Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order (all `manage.py` commands in `backend`, with `PYTHONUTF8=1`):
- a) Backup:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app chat access'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0.
- b) Check: `.\venv\Scripts\python.exe manage.py check`. It must end with `System check identified 1 issue (0 silenced).` (the known Redis hint) or `no issues`. Stop and report any error.
- c) Migrations: `.\venv\Scripts\python.exe manage.py showmigrations communications`. Every line must start with `[X]`, including `0005_chat_access_policies`. If any line starts with `[ ]`, stop and report it (do not run `migrate`).
- d) Web build in `frontend`: `npx ng build --delete-output-path=false`, wait for it to finish, then `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.
- e) Confirm the new web code is in the build: `Get-ChildItem frontend\dist -Recurse -Filter *.js | Select-String -Pattern 'communications/policies' -List | Select-Object -First 1` (from the repository root) must print at least one file.

4. Tool policy: only the commands above, `git status --short`, and `Get-Content`/`Select-String`/`Get-ChildItem` for reading files under `scratch/logs/` and `frontend/dist/`. The web build at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `git status --short` shows nothing except runner files and `tests/playwright/tools/index.py`.

6. Output and stop condition: a short English report with the backup filename and size, the check result, the showmigrations lines, the web build result and the patch line, and the step e file name. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Migration history sync and release on the local app environment: backup, replace the old migration rows with the new one-file-per-app set (`migrate --fake`, schema untouched), web build with the ngsw patch; the runner restarts Daphne and runs the health checks (no APK)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session is a release only. Do not edit, create, stage or commit any tracked file. Write only under `scratch/logs/`. Do not run `git` commands that change the working tree or history. The file `tests/playwright/tools/index.py` belongs to another session: never touch it.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`. The runner restarts Daphne after your turn.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir`. Do not run `deploy.ps1`. Do not build any APK and do not run Gradle.
- Do not run `run_auto_backup`, `makemigrations`, `flush`, any `manage.py test`, any `migrate` without `--fake`, or any command that deletes files under `backend/backups/`, `backend/media/` or `frontend/dist/`. Never drop or truncate a table and never run SQL by hand: the only database change allowed is the one done by the script in step c and the `migrate --fake` in step d.
- Never print the content of any file in `E:\warehouse-secrets\`.

2. Context: commit `9d1b5041` replaced the 57 old migration files with one initial migration per app (`accounts` has `0001_initial` and `0002_initial`). The database schema produced by the new set is identical to the old one (checked on two empty databases), so this database needs no schema change: only its `django_migrations` rows for the 13 project apps must be replaced. Commit `a6ec8f25` changed the app icons, so the web build is needed. Your terminal may be PowerShell; set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order (all `manage.py` commands in `backend`, with `PYTHONUTF8=1`):
- a) Backup:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app migration sync'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0.
- b) Check: `.\venv\Scripts\python.exe manage.py check`. It must end with `System check identified 1 issue (0 silenced).` (the known Redis hint) or `no issues`. Stop and report any error.
- c) Replace the old migration rows:
  `.\venv\Scripts\python.exe manage.py shell -c "exec(open('../scratch/sync_migration_history.py', encoding='utf-8').read())"`
  It must print a line starting with `SYNC: removed` or `SYNC: already synced`. If it prints `SYNC ABORTED` or fails, stop and report the full output (do not continue).
- d) Record the new set: `.\venv\Scripts\python.exe manage.py migrate --fake`. Every applied line must end with `FAKED`; no line may say `OK` without `FAKED`.
- e) Confirm: `.\venv\Scripts\python.exe manage.py showmigrations`. Every line must start with `[X]`. If any line starts with `[ ]`, stop and report it.
- f) Web build in `frontend`: `npx ng build --delete-output-path=false`, wait for it to finish, then `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.
- g) Confirm the new icon is in the build: `Get-Content frontend\dist\browser\icons\icon-512x512.svg -TotalCount 3` (or `frontend\dist\icons\icon-512x512.svg` if the first path does not exist) must show `iconGradient`.

4. Tool policy: only the commands above, `git status --short`, and `Get-Content`/`Select-String`/`Get-ChildItem` for reading files under `scratch/logs/` and `frontend/dist/`. The web build at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `git status --short` shows nothing except runner files and `tests/playwright/tools/index.py`.

6. Output and stop condition: a short English report with the backup filename and size, the check result, the SYNC line, the number of FAKED lines, whether every showmigrations line is `[X]`, the web build result and the patch line, and the step g output. No commit. End the turn after the report.

===

[DONE] [ ] Session 1 of 1 — Unified invoices menu, sub-step d: update Playwright scenarios 03b and 03c, their captions, the training-videos plan table and the manual test guide to the new «فاکتورها» menu item and the treasurer «تن‌خواه» item

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "tests/playwright/scenarios/03b-invoice-approvals.spec.ts" --allow "tests/playwright/scenarios/03b-invoice-approvals.captions.json" --allow "tests/playwright/scenarios/03c-invoice-payment.spec.ts" --allow "tests/playwright/scenarios/03c-invoice-payment.captions.json" --allow "Documents/Training_Videos/plan_training_videos.md" --allow "Documents/Release_v1/manual_test_guide.md"
verify: python scripts/automation/verify_tools.py text-check --file tests/playwright/scenarios/03b-invoice-approvals.spec.ts --absent /app/finance/supervisor-invoices --absent /app/finance/accountant-invoices --absent /app/finance/manager-approvals --contains /app/finance/employee-invoices --count "4:/app/finance/invoices?view=cartable" --regex-absent "\u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627\u06cc \u0647\u0632\u06cc\u0646\u0647"
verify: python scripts/automation/verify_tools.py text-check --file tests/playwright/scenarios/03c-invoice-payment.spec.ts --absent /app/finance/treasurer-invoices --count "1:/app/finance/invoices?view=cartable" --regex-absent "\u062a\u0633\u0648\u06cc\u0647 \u0641\u0627\u06a9\u062a\u0648\u0631"
verify: python scripts/automation/verify_tools.py text-check --file tests/playwright/scenarios/03b-invoice-approvals.captions.json --regex-absent "\u06a9\u0627\u0631\u062a\u0627\u0628\u0644 \u062a\u0627\u06cc\u06cc\u062f\u0627\u062a"
verify: python scripts/automation/verify_tools.py text-check --file tests/playwright/scenarios/03c-invoice-payment.captions.json --regex-absent "\u062a\u0633\u0648\u06cc\u0647 \u0641\u0627\u06a9\u062a\u0648\u0631"
verify: python scripts/automation/verify_tools.py text-check --file Documents/Release_v1/manual_test_guide.md --absent /app/finance/supervisor-invoices --absent /app/finance/accountant-invoices --absent /app/finance/treasurer-invoices --count "5:/app/finance/invoices)" --contains /app/finance/treasurer-petty-cash --contains /app/finance/employee-invoices
verify: node tests/playwright/node_modules/typescript/bin/tsc --noEmit -p tests/playwright
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "test(playwright): unified invoices menu"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only these six existing files, and only as described in section 4: `tests/playwright/scenarios/03b-invoice-approvals.spec.ts`, `tests/playwright/scenarios/03b-invoice-approvals.captions.json`, `tests/playwright/scenarios/03c-invoice-payment.spec.ts`, `tests/playwright/scenarios/03c-invoice-payment.captions.json`, `Documents/Training_Videos/plan_training_videos.md`, `Documents/Release_v1/manual_test_guide.md`. Create no file. Never edit `frontend/`, `backend/`, `scripts/`, `tasks.md`, `tasks_history.md`, any `03a-*` file or any other scenario.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- Do not run Playwright, do not record or render any video, do not generate audio, do not run `seed_video_demo`, and do not touch the database. This session edits text only.
- All user-facing text (captions, guide and plan cells) stays Persian, exactly as given below. Keep the JSON files valid (UTF-8, same keys, same indentation). Persian markdown files keep their `<div dir="rtl" align="right">` wrapper.

2. Context (read these; nothing else is needed):
- The app now has ONE menu item «فاکتورها» (route `/app/finance/invoices`) for supervisor, accountant, manager and treasurer, instead of the old items «تایید فاکتورها» (`supervisor-invoices`), «ممیزی فاکتورها» (`accountant-invoices`), the invoice tab of «کارتابل تاییدات» (`manager-approvals`) and «تسویه فاکتور و تن‌خواه» (`treasurer-invoices`). The old routes still redirect to `/app/finance/invoices?view=cartable`.
- The page has two top sub-tabs: the role cartable (default, `view=cartable`) and «فاکتورهای من» (`view=mine`). The cartable sub-tab label per role (`frontend/src/app/modules/accounting/components/finance/invoices-hub/invoices-hub.ts` lines 23–28): supervisor «تایید فاکتورها», accountant «ممیزی فاکتورها», manager «مجوز پرداخت فاکتورها», treasurer «پرداخت فاکتورها». Inside the cartable each role sees the same list and buttons as before. The manager cartable is a plain list (no inner invoice tab to click); its row buttons are «مجوز پرداخت», «بازنگری», «چاپ / PDF».
- The treasurer petty-cash refills moved to a separate menu item «تن‌خواه» (route `/app/finance/treasurer-petty-cash`). The treasurer invoice cartable shows only invoices ready for payment.
- A plain employee (`demo_employee`, `t_employee`) keeps the old employee menu item «ثبت فاکتور» (`/app/finance/employee-invoices`); nothing changes for employee steps. An employee who opens `/app/finance/invoices` directly sees only «فاکتورهای من» and no cartable.
- `tests/playwright/helpers/video.ts` lines 354–370: `tv.openMenu(label, fallbackPath)` clicks the sidebar button whose accessible name is exactly `label`, else goes to `fallbackPath`.
- `tests/playwright/scenarios/03b-invoice-approvals.spec.ts` lines 1–98 and `tests/playwright/scenarios/03c-invoice-payment.spec.ts` lines 52–57.
- `Documents/Training_Videos/plan_training_videos.md` lines 124–130 (the video table) and the progress log section «## ۷. گزارش پیشرفت» (it ends right before «## ۸.»).
- `Documents/Release_v1/manual_test_guide.md` lines 78–84.

3. Definitions:
- NEW_CALL = `await tv.openMenu('فاکتورها', '/app/finance/invoices?view=cartable');`

4. Task:
- a) `03b-invoice-approvals.spec.ts`:
  - Replace the supervisor calls at lines 31 and 67, the accountant call at line 77 and the manager call at line 87 with NEW_CALL (four times in total, same indentation).
  - Delete line 88 (the line that clicks `page.getByRole('tab', { name: /^(فاکتورهای هزینه|فاکتور)/ })`). Nothing else in the manager block changes.
  - Line 47 (employee, `'ثبت فاکتور'`, `/app/finance/employee-invoices`) stays exactly as it is.
  - In the header comment (lines 1–5) add one line after line 4: ` * Supervisor, accountant and manager open the unified «فاکتورها» menu item; its default sub-tab is the role cartable.`
- b) `03b-invoice-approvals.captions.json`, change only these three values (the text between the outer quotes below is the exact new JSON string value; the inner «» are part of the text):
  - `supervisor`: "سرپرست وارد می‌شود و از منو «فاکتورها» را باز می‌کند. زیرتب «تایید فاکتورها» کارتابل اوست و فاکتور کارمند اینجا منتظر اوست."
  - `accountant`: "حسابدار در «فاکتورها»، زیرتب «ممیزی فاکتورها»، ردیف‌ها، مالیات و مبلغ را بررسی می‌کند و «صدور سند» را می‌زند."
  - `manager`: "مدیر در «فاکتورها»، زیرتب «مجوز پرداخت فاکتورها»، «مجوز پرداخت» را می‌دهد."
- c) `03c-invoice-payment.spec.ts` line 55: replace with NEW_CALL. No other change.
- d) `03c-invoice-payment.captions.json`, change only `login` to: "با حساب خزانه‌دار وارد می‌شویم و از منو «فاکتورها» را باز می‌کنیم. زیرتب «پرداخت فاکتورها» فقط فاکتورهای آمادهٔ پرداخت را دارد؛ تن‌خواه در آیتم جدای «تن‌خواه» است."
- e) `plan_training_videos.md`, in the video table change only the fourth cell (the menu-pages cell) of three rows:
  - row ۳-ب, new cell: «فاکتورها» (زیرتب‌های «تایید فاکتورها»، «ممیزی فاکتورها» و «مجوز پرداخت فاکتورها»)، «ثبت فاکتور» (کارمند)، «کارهای من»
  - row ۳-ج, new cell: «فاکتورها» (زیرتب «پرداخت فاکتورها»)
  - row ۴-ب: in that cell replace the item «تسویه فاکتور و تن‌خواه» with «تن‌خواه» (خزانه‌دار); keep the other items of the cell.
  - At the end of the «## ۷. گزارش پیشرفت» section (as the last bullet before «## ۸.», keeping one blank line before «## ۸.»), add this bullet:
    `- ۳۱ اکتبر ۲۰۲۶، منوی یکپارچهٔ فاکتورها: سرپرست، حسابدار، مدیر و خزانه‌دار حالا یک آیتم «فاکتورها» دارند و تن‌خواه خزانه‌دار آیتم جدای «تن‌خواه» است. سناریوهای ``03b`` و ``03c`` و زیرنویس‌هایشان با منوی تازه به‌روز شدند (آزموده و ضبط نشدند). **مانده:** آزمون و ضبط دوبارهٔ فیلم‌های ۳-ب و ۳-ج.`
    (write `03b` and `03c` each in single backticks, as inline code.)
  - Do not change any other line (older log entries keep the old names on purpose).
- f) `manual_test_guide.md`, rows 1.10 to 1.16 (lines 78–84); columns are: step, page link, user, action, expected, empty result cell:
  - 1.10 (`t_employee`) stays as it is.
  - 1.11 (`t_supervisor`): page cell `[فاکتورها](https://app.farsalish.ir/app/finance/invoices)`; action: وارد شوید و از منو «فاکتورها» را باز کنید; expected: در منو فقط یک آیتم «فاکتورها» باشد؛ زیرتب «تایید فاکتورها» باز شود و فقط اسناد بخش الف بیاید (الان احتمالاً خالی است)؛ زیرتب «فاکتورهای من» هم باشد
  - 1.12 (`t_accountant`): page cell `[فاکتورها](https://app.farsalish.ir/app/finance/invoices)`; action: وارد شوید و از منو «فاکتورها» را باز کنید; expected: زیرتب «ممیزی فاکتورها» باز شود و زیرتب «فاکتورهای من» هم باشد
  - 1.13 (`t_manager`): page cell `[فاکتورها](https://app.farsalish.ir/app/finance/invoices)`; action: وارد شوید و از منو «فاکتورها» را باز کنید; expected: زیرتب «مجوز پرداخت فاکتورها» باز شود؛ در «کارتابل تاییدات» دیگر تب فاکتور نباشد
  - 1.14 (`t_treasury`): page cell `[فاکتورها](https://app.farsalish.ir/app/finance/invoices)`; action: وارد شوید، از منو «فاکتورها» و بعد [تن‌خواه](https://app.farsalish.ir/app/finance/treasurer-petty-cash) را باز کنید; expected: در «فاکتورها» زیرتب «پرداخت فاکتورها» باز شود و هیچ اثری از تن‌خواه در آن نباشد؛ شارژ تن‌خواه فقط در آیتم جدای «تن‌خواه» باشد
  - 1.15 stays as it is.
  - 1.16 (`t_employee`): page cell `[فاکتورها](https://app.farsalish.ir/app/finance/invoices)`; action: لینک را مستقیم باز کنید; expected: فقط زیرتب «فاکتورهای من» دیده شود و هیچ کارتابل تایید یا ممیزی باز نشود
  - Keep the column count and the empty last cell of each row. No other change in this file.

5. Tool policy:
- Reading files is unrestricted.
- Once at the end, from the repository root: `node tests/playwright/node_modules/typescript/bin/tsc --noEmit -p tests/playwright` (must exit 0) and `python -X utf8 -c "import json; [json.load(open(p, encoding='utf-8')) for p in ['tests/playwright/scenarios/03b-invoice-approvals.captions.json', 'tests/playwright/scenarios/03c-invoice-payment.captions.json']]; print('json ok')"`.
- If a command fails, read its output, do not repeat it unchanged, and change approach. If the existing file differs from this task (line numbers, text), follow the real file and say so in the report.

6. Before finishing:
- Both commands in section 5 pass.
- `git status --short` shows only the six files of section 1 (plus the pre-existing `tests/playwright/tools/index.py` and the runner files) before the commit, and only those pre-existing files after it.

7. Output and stop condition:
- Stage only the six files and commit with this message, without push:
test(playwright): unified invoices menu in scenarios 03b/03c, captions, video plan and manual guide
- Short English report: each file and what changed, the two command results, and anything that differed from this task. End the turn after the commit and the report.

===

[DONE] [ ] Session 1 of 1 — Overnight fixes O1: remove every reference-warehouse («انبار مرجع») control from the employee attendance page

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/employee/employee-attendance/*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-attendance/employee-attendance.html --absent select-wh --absent "of warehouses" --regex-absent "انبار مرجع" --regex-absent "شناور"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-attendance/employee-attendance.ts --absent loadWarehouses --absent "'wh'" --absent select-wh --absent isWarehouseMenuOpen
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/employee/employee-attendance/*.spec.ts"
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(attendance): remove reference warehouse"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only files inside `frontend/src/app/modules/accounting/components/finance/employee/employee-attendance/` (the `.html`, `.ts`, `.css` and the two `.spec.ts` files there). Create no file. Never edit `backend/`, `scripts/`, `tasks.md`, `tasks_history.md` or any other frontend file.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- Do not change any API service, any backend call signature or any request URL. Do not touch the database. All user-facing text stays Persian.

2. Context:
- Page `/app/finance/employee-attendance` is the daily/monthly attendance of personnel (accounting module). The product owner decided: the attendance page must have NO warehouse concept at all. Personnel rows must not show «انبار مرجع» and the page must not offer any warehouse picker.
- `employee-attendance.html` line 294: table header `<th ...>انبار مرجع</th>`. Lines 387–393: the per-row `<td>` with `<select [id]="'select-wh-' + idx" [(ngModel)]="row.warehouse_id" ...>` and options «🌐 شناور» + `*ngFor="let wh of warehouses"`. Lines ~431–434: the same select in the mobile card view (`'m-select-wh-' + idx`), probably with a small label/wrapper around it.
- Several `<td colspan="10" ...>` rows (loading, empty) in the same table count that column.
- `employee-attendance.ts`: line 75–78 fields `warehouses`, `selectedWarehouseId`, `isWarehouseMenuOpen`; line 233 calls `this.loadWarehouses()`; lines 267–276 `loadWarehouses()` using `this.scopeDirectory.getAll()`; line 1453 `onAttendanceGridKeydown(..., colType: 'status' | 'eff' | 'ot' | 'adv' | 'note' | 'wh', ...)` with `'wh'` branches at lines ~1502, ~1509, ~1540; lines ~1596–1603 set `isWarehouseMenuOpen = false`.
- `selectedWarehouseId` is passed as the first argument of many `personnelApi` calls (lines 423, 449, 651, 968, 1000, 1026, 1287) and appended to FormData / payloads (lines 882, 939, 945, 1089, 1329, 1355, 1370). Row objects keep `warehouse_id` from the server.

3. Task:
- a) Template: delete the «انبار مرجع» header cell, the desktop per-row warehouse `<td>` (with its comment), and the mobile-card warehouse select together with any label or wrapper that exists only for it. Decrease every `colspan` of that table by one (10 → 9). If you find any other warehouse picker or warehouse label in this template (for example a top warehouse dropdown using `isWarehouseMenuOpen` or `warehouses`), delete it too.
- b) TypeScript: delete `warehouses`, `isWarehouseMenuOpen`, `loadWarehouses()` and its call, every line that only sets `isWarehouseMenuOpen`, the `'wh'` member of the `colType` union and all `'wh'` keyboard branches (the note column becomes the last column for left/right/Tab navigation; keep the other columns working exactly as before). If `scopeDirectory` is then unused, remove its injection and import.
- c) Keep `selectedWarehouseId` as a private constant-like field always `null` ONLY if removing it would change an API call signature; otherwise pass `null` directly where it was passed. Never change what the server receives for rows except that the page no longer edits `warehouse_id`: rows keep sending the `warehouse_id` value they were loaded with (do not delete row fields). In payloads, `r.warehouse_id || this.selectedWarehouseId || null` becomes `r.warehouse_id ?? null`. Remove `if (this.selectedWarehouseId)` FormData appends and the `!this.selectedWarehouseId` part of the check at line ~1355 (keep the section check: the code must still stop when no section is selected).
- d) Specs: update the two spec files in this folder so they no longer reference the removed members, and add to `employee-attendance-44c.dom.spec.ts` one test named `has no reference warehouse column or picker` that renders the page and asserts: no element whose id starts with `select-wh-` or `m-select-wh-`, and the rendered text does not contain «انبار مرجع». Follow the existing setup pattern of that spec file exactly.

4. Tool policy:
- Reading files is unrestricted.
- From `frontend`: `npx ng test --watch=false --include=src/app/modules/accounting/components/finance/employee/employee-attendance/employee-attendance.spec.ts --include=src/app/modules/accounting/components/finance/employee/employee-attendance/employee-attendance-44c.dom.spec.ts` (at most 8 times). Once at the end, from the repository root: `python scripts/e2e/guardian_56_change_integrity.py --base HEAD~0 --head HEAD` is not needed; instead run `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach. If the real file differs from this task (line numbers, text), follow the real file and say so in the report.

5. Before finishing:
- The tests above pass (only failures that also fail on the base commit are acceptable; say which).
- `git status --short` shows only files of this folder (plus the pre-existing `tests/playwright/tools/index.py` and runner files) before the commit.

6. Output and stop condition:
- Stage only the changed files of this folder and commit with this message, without push:
fix(attendance): remove reference warehouse column and picker from employee attendance page
- Short English report: what was removed (file and lines), test results, anything that differed from this task. End the turn after the commit and the report.

===

[DONE] [ ] Session 1 of 1 — Overnight fixes O2: clean, well-structured invoice print (info box, weighted table, totals box, payments table)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow backend/core/reports/document_pdf.py --allow backend/modules/accounting/personnel/invoice_print.py --allow backend/core/reports/test_document_pdf_layout_o2.py
verify: python scripts/automation/verify_tools.py text-check --file backend/core/reports/document_pdf.py --contains "class DocTable" --contains info_pairs --contains totals --contains extra_tables --contains table_col_widths
verify: python scripts/automation/verify_tools.py text-check --file backend/modules/accounting/personnel/invoice_print.py --contains info_pairs --contains totals --contains extra_tables --absent "paragraphs=paragraphs + totals"
verify: python scripts/automation/verify_tools.py django-tests --labels reports personnel.test_invoice_payments_41 personnel.test_invoice_payments_smoke_41b
verify: backend\venv\Scripts\python.exe -X utf8 scratch\o2_render_sample.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(print): structured invoice print"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only `backend/core/reports/document_pdf.py` and `backend/modules/accounting/personnel/invoice_print.py`, and create only the new test file `backend/core/reports/test_document_pdf_layout_o2.py`. Never edit any other file (not `personnel_print.py`, not `petty_print.py`, not `document_views.py`, not `scratch/o2_render_sample.py`, not `tasks.md`, not `tasks_history.md`, not `frontend/`).
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- Do not touch the database, do not run migrations, do not run `manage.py test` without labels. All text printed on the document stays Persian.
- Every existing `PrintableDocument` user that does not pass the new fields must render exactly the same content as today (same title, paragraphs, main table, signers, QR, header box). New fields default to empty.

2. Context (read these; nothing else is needed):
- `backend/core/reports/document_pdf.py` (331 lines). `PrintableDocument` dataclass lines 50–63. Helpers: `_rtl_para(text, style, width)` lines 131–133 (wraps logical text and returns a ReportLab `Paragraph`), `_cell_text(value)` lines 136–145. `render_document_pdf(doc)` lines 221–331: page header drawn in `on_page` (lines 238–275, do not change it), styles lines 277–281, story: title + `paragraphs` (283–286), main table (288–303: every column has the same width `content_w / ncols`, grid `#94a3b8`, header `#e2e8f0`), signers (305–323), build (325–331). Columns are reversed so the first column is on the right (RTL).
- `backend/modules/accounting/personnel/invoice_print.py` lines 59–108 `printable_invoice`: today every header field, the totals and the payment instalments are dumped as plain `paragraphs` lines BEFORE the item table, which is why the print looks bad. `_money()` lines 12–14 formats with a Latin comma.
- Current look (rendered from a sample): equal column widths make the «شرح» column so narrow that every description wraps to five lines while «ردیف»/«تعداد»/«واحد» columns are mostly empty; totals and payments are loose text lines above the table; no visual hierarchy.
- The check script `scratch/o2_render_sample.py` (already present, do not edit) builds a sample document with the new fields if they exist (`info_pairs`, `totals`, `extra_tables` with `DocTable(title=, headers=, rows=)`), renders A4 and A5 to `scratch/o2_invoice_sample_*.pdf` and PNG pages, and fails if the A4 sample needs more than 2 pages. Look at the PNG files it writes (open them as images) to check your result.
- Existing tests: `backend/core/reports/test_document_pdf_27b.py` (see `make_doc` at the top for how a test document is built).

3. Definitions:
- "RTL order": the first item of any list is drawn at the right side.
- "numeric column": a column whose values are amounts; values are right-aligned so the units digits line up.
- Colours (print, light only): grid and box lines `#cbd5e1` 0.5pt; header and label shading `#f1f5f9`; zebra shading for even body rows `#f8fafc`; text default black; secondary labels `#475569`.

4. Task:
- a) In `document_pdf.py` add a dataclass `DocTable` (before `PrintableDocument`) with fields: `title: str = ''`, `headers: list = field(default_factory=list)`, `rows: list = field(default_factory=list)`, `col_widths: list = field(default_factory=list)` (relative weights, one per column; empty = equal), `center_cols: list = field(default_factory=list)` (column indexes, in the logical order of `headers`, whose cells are centred).
- b) Add to `PrintableDocument` (all defaulting to empty, keep existing fields and their order, add the new ones at the end): `info_pairs: list` (list of `(label, value)`), `totals: list` (list of `(label, value)` or `(label, value, emphasize: bool)`), `extra_tables: list` (list of `DocTable`), `table_col_widths: list` (weights for the main table), `table_center_cols: list` (indexes for the main table).
- c) Write one private helper `_doc_table(headers, rows, content_w, col_widths, center_cols, ...styles)` that builds the ReportLab `Table` used for BOTH the main table and every `extra_tables` entry: column widths from the weights scaled to `content_w` (equal when the list is empty or its length differs from the column count), RTL order (reverse each row exactly as today), `repeatRows=1`, header row bold and centred on `#f1f5f9`, body cells right-aligned except `center_cols` which are centred, zebra `#f8fafc` on even body rows, `GRID` 0.5pt `#cbd5e1`, `VALIGN MIDDLE`, top/bottom padding 3pt, left/right padding 4pt. Replace the current main-table code with a call to this helper, passing `doc.table_col_widths` and `doc.table_center_cols`. A document without weights therefore keeps equal widths.
- d) Story order in `render_document_pdf`: title → info box (only if `info_pairs`) → `paragraphs` → main table → totals box (only if `totals`) → each extra table (its `title` as a small bold right-aligned heading, then the table) → signers. Spacing between blocks 4mm (A4) / 3mm (A5).
- e) Info box: a table with 4 columns in RTL order label, value, label, value (two pairs per row; an odd last pair leaves the other half empty), full content width, column weights 1.1 : 1.9 : 1.1 : 1.9, label cells bold on `#f1f5f9` in colour `#475569`, value cells normal, box border and inner grid 0.5pt `#cbd5e1`, padding 4pt. Use `_cell_text` for values so `None`/`''` shows «—».
- f) Totals box: a 2-column table (label on the right, value on the left of it) with width 50% of `content_w`, placed at the LEFT side of the page (`hAlign='LEFT'`), label cells on `#f1f5f9`, value cells right-aligned, grid 0.5pt `#cbd5e1`. Rows whose third item is True are bold in both cells and get a slightly darker shading `#e2e8f0` on the whole row. Wrap the totals box in `KeepTogether` so it never splits across pages.
- g) Wrap the signers table together with its 8mm spacer in `KeepTogether` so the signature row is never split. Do not change how signer images are chosen.
- h) Invoice (`invoice_print.py` `printable_invoice`):
  - `_money`: use the Persian thousands separator «٬» (U+066C) instead of the Latin comma. Check in the PNG that the glyph renders (no empty box); if it does not render, keep the Latin comma and say so in the report.
  - `info_pairs` (in this order): («شمارهٔ داخلی», internal number or «—»), («شمارهٔ فاکتور فروشنده», vendor number or «—»), («تاریخ فاکتور», date), («طرف حساب», counterparty name or «—»), («پروژه / بخش», «project / section»), («وضعیت», status display). Digits through `fa_digits` exactly as today.
  - `paragraphs`: only «شرح: …» when `invoice.description` is set; otherwise empty.
  - Main table: same headers and rows as today; `table_col_widths=[0.6, 3.2, 1.7, 0.8, 0.9, 1.6, 1.8]`; `table_center_cols=[0, 3, 4]`.
  - `totals`: («جمع ردیف‌ها», subtotal), («تخفیف», discount) only when the discount is not zero, («مالیات بر ارزش افزوده», VAT) only when VAT is not zero, («مبلغ قابل پرداخت», amount, True), («پرداخت‌شده», paid), («مانده», remaining, True).
  - `extra_tables`: only when there are non-voided payments: one `DocTable(title='قسط‌های پرداخت', headers=['ردیف', 'تاریخ', 'مبلغ', 'روش', 'شمارهٔ پیگیری'], rows=..., col_widths=[0.6, 1.4, 2, 1.6, 2], center_cols=[0, 1])`, rows from the same sorted non-voided payments as today (`fa_digits` for the index, date and tracking code; `_money` for the amount; `get_method_display()`).
  - Remove the old `totals` list of strings and the `paragraphs=paragraphs + totals` argument.
- i) New test file `backend/core/reports/test_document_pdf_layout_o2.py` (Django `SimpleTestCase`, no database), following the import style of `test_document_pdf_27b.py`:
  - `test_old_style_document_still_renders`: a document with only title, paragraphs, table headers/rows renders A4 and A5 PDFs (bytes start with `%PDF`).
  - `test_structured_document_renders`: a document with `info_pairs` (3 pairs, odd count), `totals` with one emphasized row, one `extra_tables` entry, `table_col_widths` and `table_center_cols` renders A4 and A5 PDFs.
  - `test_doc_table_widths`: the helper from (c) with weights `[1, 3]` and `content_w=400` gives column widths summing to 400 with the wider column on the LEFT (index 0 after RTL reversal is the last logical column); a weights list of the wrong length gives equal widths. This test may call the private helper directly.

5. Tool policy:
- Reading files is unrestricted.
- From `backend`: `set PYTHONUTF8=1&& .\venv\Scripts\python.exe manage.py test reports personnel.test_invoice_payments_41 personnel.test_invoice_payments_smoke_41b --keepdb` (at most 6 times; never without labels).
- From the repository root: `backend\venv\Scripts\python.exe -X utf8 scratch\o2_render_sample.py` (as often as needed), then open `scratch/o2_invoice_sample_A4_p1.png` and `scratch/o2_invoice_sample_A5_p1.png` as images and check: description column wide enough that each sample description fits in at most 2 lines on A4; totals box at the left under the table with «مبلغ قابل پرداخت» and «مانده» bold; payments table under it with its title; info box at the top with two pairs per row; nothing overlaps the header box or the QR code at the bottom-left.
- If a command fails, read its output, do not repeat it unchanged, and change approach. If a real file differs from this task (line numbers, text), follow the real file and say so in the report.

6. Before finishing:
- The tests above pass (only failures that also fail before your change are acceptable; say which) and the sample script exits 0 with `A4 pages=1` or `A4 pages=2`.
- `git status --short` shows only the three files of section 1 (plus the pre-existing `tests/playwright/tools/index.py` and runner files) before the commit.

7. Output and stop condition:
- Stage only those three files and commit with this message, without push:
feat(print): structured invoice print (info box, weighted RTL table, totals box, payments table)
- Short English report: what changed per file, test results, sample page counts for A4 and A5, whether «٬» renders, and anything that differed from this task. End the turn after the commit and the report.

===

[DONE] Session 1 of 1 — Overnight fixes O3: the public document verify page shows the live invoice data (number, date, amount, status) or a deleted warning

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/common/components/document-verify/*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/document-verify/document-verify.html --contains "current()" --regex-contains "وضعیت" --contains appIcon
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/common/components/document-verify/*.spec.ts"
verify: python scripts/automation/verify_tools.py tests-kept --base {base} frontend/src/app/modules/common/components/document-verify/document-verify.dom.spec.ts
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(verify): live document data"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only the three files in `frontend/src/app/modules/common/components/document-verify/` (`document-verify.ts`, `document-verify.html`, `document-verify.dom.spec.ts`). Create no file. Never edit `backend/`, `scripts/`, `tasks.md`, `tasks_history.md` or any other frontend file.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- No new inline `<svg>` with paths: icons only as `<svg appIcon="name" ...></svg>` with names that already exist in `frontend/src/app/shared/icons/` (for example `check-circle`, `alert-circle`, `alert-triangle`, `loader`). Use semantic colour tokens (`text-fg`, `text-fg-muted`, `bg-surface`, `border-line`) as the existing template does. All user-facing text stays Persian.
- Do not delete or weaken any existing test. The existing test `never renders an amount` stays unchanged (a top-level `amount` field must still never be shown).

2. Context (read these; nothing else is needed):
- Page `/verify/:token` is public (no login). It is opened by scanning the QR code printed on a document. Component: `document-verify.ts` (76 lines; response interface lines 9–15; `isFull` getter lines 71–75) and `document-verify.html` (71 lines; `@case ('valid')` block lines 13–47).
- The backend `GET /api/public/verify/<token>/` response for a valid, non-confidential document now also has:
  - `live: boolean` — false when the document kind has no live data (then nothing below is present; show the page exactly as today).
  - `exists: boolean` (only when `live` is true) — false when the document was deleted from the system.
  - `current: { number: string, date: string, amount: string, status: string }` (only when `exists` is true) — the LIVE values from the database: internal number, Shamsi date like `1405/08/01`, payable amount in rials as a plain integer string like `3000`, and a Persian status label like «پرداخت‌شده».
- A confidential document still returns only `{ valid: true, number }` (no `live`).

3. Task:
- a) `document-verify.ts`: extend the response interface with `live?: boolean; exists?: boolean; current?: { number?: string; date?: string; amount?: string; status?: string };`. Add a `current` computed signal (or getter) returning `result()?.current ?? null` only when `result()?.live === true && result()?.exists === true`, a getter `isDeleted` (`live === true && exists === false`), and a method `formatAmount(value)` that returns `''` for empty or non-numeric input and otherwise `new Intl.NumberFormat('fa-IR').format(Number(value)) + ' ریال'`.
- b) `document-verify.html`, inside the `valid` case, after the existing `<dl>` (keep it unchanged):
  - When `isDeleted`: an amber notice box (`rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-3 text-sm font-bold flex items-start gap-2`) with `<svg appIcon="alert-triangle" class="w-5 h-5 shrink-0" ...></svg>` and the text «این سند چاپ معتبری دارد اما دیگر در سامانه وجود ندارد (حذف شده است).»
  - When `current()` is set: a section with a top border (`border-t border-line pt-3 mt-1`), a heading «وضعیت فعلی در سامانه» (`text-xs font-black text-fg-muted mb-2`) and a `<dl class="text-sm space-y-2">` in the same row style as the existing one (`flex justify-between gap-3`, `dt` muted and `shrink-0`, `dd` bold with `min-w-0 break-words`) for: «شماره» (`dir="ltr"`), «تاریخ», «مبلغ قابل پرداخت» (`formatAmount(...)`), «وضعیت» (the status shown as a pill: `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-indigo-50 text-indigo-700`). Each row only when its value is non-empty. If `current().number` is non-empty and differs from `result()?.number`, add under the list a muted small line (`text-xs text-fg-muted`) «شمارهٔ فعلی سند با شمارهٔ چاپ‌شده فرق دارد.»
- c) `document-verify.dom.spec.ts`: keep every existing test; add, following the same setup (flush on `httpMock.expectOne('/api/public/verify/abc%3Adef/')`, then `fixture.detectChanges()`):
  - `shows live current data`: flush `{ valid: true, number: '1405-9', title: 'فاکتور هزینه', date: '1405/08/01', company_name: 'C', live: true, exists: true, current: { number: '1405-9', date: '1405/08/02', amount: '3000', status: 'پرداخت‌شده' } }`; the text contains «وضعیت فعلی در سامانه», «پرداخت‌شده», `new Intl.NumberFormat('fa-IR').format(3000)` and «ریال», and does NOT contain «فرق دارد».
  - `warns when the number changed`: same but `current.number = '1405-10'`; text contains «فرق دارد».
  - `shows deleted warning`: flush `{ valid: true, number: '1', title: 'T', live: true, exists: false }`; text contains «حذف شده است» and not «وضعیت فعلی در سامانه».
  - `no live block when not live`: flush `{ valid: true, number: '1', title: 'T', live: false }`; text contains neither «وضعیت فعلی در سامانه» nor «حذف شده است».

4. Tool policy:
- Reading files is unrestricted.
- From `frontend`: `npx ng test --watch=false --include=src/app/modules/common/components/document-verify/document-verify.dom.spec.ts` (at most 8 times). Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach. If a real file differs from this task (line numbers, text), follow the real file and say so in the report.

5. Before finishing:
- The spec passes and guardian 52 passes.
- `git status --short` shows only the three files of this folder (plus the pre-existing `tests/playwright/tools/index.py` and runner files) before the commit.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
feat(verify): live document data on the public QR verify page (current number, date, amount, status; deleted warning)
- Short English report: what changed, test results, anything that differed from this task. End the turn after the commit and the report.

===

[DONE] Session 1 of 1 — Overnight fixes O7: quick «دانلود رسید» (payment receipt download) button on the five invoice list pages

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/invoice-receipt-button/*" --allow "frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-invoices/treasurer-invoices.*" --allow "frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices.*" --allow "frontend/src/app/modules/accounting/components/finance/accountant/accountant-invoices/accountant-invoices.*" --allow "frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-invoices/supervisor-invoices.*" --allow "frontend/src/app/modules/accounting/components/finance/manager/manager-invoices/manager-invoices.*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/invoice-receipt-button/invoice-receipt-button.ts --contains "expense_invoice" --regex-contains "دانلود رسید" --contains appIcon
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/invoice-receipt-button/*.spec.ts"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/modules/accounting/components/finance/treasurer/treasurer-invoices/*.spec.ts" --include "src/app/modules/accounting/components/finance/employee/employee-invoices/*.spec.ts" --include "src/app/modules/accounting/components/finance/accountant/accountant-invoices/*.spec.ts" --include "src/app/modules/accounting/components/finance/manager/manager-invoices/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(invoices): quick payment receipt download"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Create only the folder `frontend/src/app/modules/accounting/components/finance/invoice-receipt-button/` with two files: `invoice-receipt-button.ts` and `invoice-receipt-button.dom.spec.ts`. Edit only the five list pages named in section 2 (their `.html` and `.ts`). Never edit `backend/`, `scripts/`, `tasks.md`, `tasks_history.md`, shared components, or any other file.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- No new inline `<svg>` with paths: icons only as `<svg appIcon="name" ...></svg>` with names that already exist in `frontend/src/app/shared/icons/icon-registry.ts` (`download`, `loader` exist). Use semantic colour tokens (`text-fg`, `text-fg-muted`, `bg-surface`, `border-line`) for the button and menu. All user-facing text stays Persian.
- Do not delete or weaken any existing test.

2. Context (read these; nothing else is needed):
- When the treasurer pays an invoice, the payment receipt file is stored as a core attachment of the invoice with label `payment_receipt` (constant `PAYMENT_RECEIPT_LABEL` in `frontend/src/app/modules/accounting/payment-receipt.ts`; import it, do not repeat the string). The attachment kind for an expense invoice is `expense_invoice`.
- List endpoint: `this.api.get<ReceiptItem[]>('attachments', { kind: 'expense_invoice', id: invoiceId, label: PAYMENT_RECEIPT_LABEL })` (request URL `/api/attachments/?kind=expense_invoice&id=<id>&label=payment_receipt`). The server already checks access: users who may view the invoice get the list; others get 403. Do not add any access logic in the frontend.
- Download pattern to copy: `frontend/src/app/shared/components/attachments/attachments.component.ts` lines 1–34 (imports and the `AttachmentItem` interface — do not edit that file; declare a small local interface `ReceiptItem` with `id`, `original_name`, `created_at`, `download_url` in the new component), lines 94–147 (`load`, `apiPath`, `messageOf`) and lines 149–160 (`download`: `this.api.download(this.apiPath(item.download_url))` then `saveBlob(blob, item.original_name || 'attachment')` from `core/platform/file-output`). Toast: `ToastService` from `shared/components/toast/toast.component` injected with `{ optional: true }`, methods `info(msg)` and `error(msg)`.
- Existing paid-amount blocks (where the button goes), base `frontend/src/app/modules/accounting/components/finance/`:
  - `treasurer/treasurer-invoices/treasurer-invoices.html` lines 76–78: `<div *ngIf="item.paid_amount > 0" ...>پرداخت‌شده ... مانده ...</div>` inside the amount cell (row variable `item`).
  - `employee/employee-invoices/employee-invoices.html` mobile card lines 114–116 (`@if (inv.paid_amount && +inv.paid_amount > 0) { <p ...>پرداخت‌شده ...</p> }`) and desktop table lines 214–216 (`<div *ngIf="inv.paid_amount && +inv.paid_amount > 0" ...>`), row variable `inv`.
  - `accountant/accountant-invoices/accountant-invoices.html` line 130 (`<div *ngIf="item.paid_amount && +item.paid_amount > 0">...</div>`), row variable `item`.
  - `supervisor/supervisor-invoices/supervisor-invoices.html` line 131, same shape, row variable `item`.
  - `manager/manager-invoices/manager-invoices.html` line 42, same shape, row variable `inv`.

3. Task:
- a) New standalone component `InvoiceReceiptButtonComponent`, selector `app-invoice-receipt-button`, `ChangeDetectionStrategy.OnPush`, inline template, imports `CommonModule` and `SvgIconDirective`. Input `invoiceId` (number, required). State: `busy`, `items` (list), `menuOpen`.
  - Button: `type="button"`, classes `inline-flex items-center justify-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-bold text-fg hover:bg-slate-50 min-h-[40px] min-w-[40px]`, `title="دانلود رسید پرداخت"`, `aria-label="دانلود رسید پرداخت"`, `[disabled]="busy"`, `[attr.aria-busy]="busy"`, `[attr.aria-expanded]="menuOpen"`, `aria-haspopup="menu"`. Content: `<svg appIcon="download" class="w-4 h-4" aria-hidden="true"></svg>` (or `appIcon="loader"` with `animate-spin` while busy) plus `<span class="hidden md:inline">دانلود رسید</span>` (icon-only on mobile).
  - Click (call `event.stopPropagation()` so row click handlers do not fire): GET the list as in section 2. Result:
    - 0 items: `toast.info('رسیدی برای این فاکتور ثبت نشده است')`.
    - 1 item: download it directly.
    - 2 or more items: open a small menu (`role="menu"`, absolutely positioned under the button, `rounded-xl border border-line bg-surface shadow-lg p-1 z-20 min-w-[12rem]`; wrapper `relative inline-block`) with one `role="menuitem"` button per item showing `original_name` and the date (`new Date(created_at).toLocaleDateString('fa-IR')`); clicking an item downloads it and closes the menu; the `Escape` key and a click outside close it (`@HostListener('document:click', ['$event'])` closing when the target is outside the host element; `@HostListener('keydown.escape')`).
    - HTTP 403: `toast.info('رسیدی برای این فاکتور ثبت نشده است')` (reveal nothing more). Any other error: `toast.error(messageOf(err, 'دریافت رسید انجام نشد'))`.
    - Download error: `toast.error(messageOf(err, 'دانلود رسید انجام نشد'))`.
  - Always reset `busy` in `finally` and call `cdr.markForCheck()`. Ignore clicks while `busy`.
- b) In each of the five pages add `<app-invoice-receipt-button [invoiceId]="ROWVAR.id"></app-invoice-receipt-button>` directly after (as a sibling of) the paid-amount block listed in section 2, guarded by the same condition (`+ROWVAR.paid_amount > 0`), wrapped in its own `<div class="mt-1">` using `*ngIf` or `@if`, matching the style the file already uses at that spot. Employee page: both the mobile card and the desktop table. Import `InvoiceReceiptButtonComponent` in each page's `.ts` `imports` array (relative path `../../invoice-receipt-button/invoice-receipt-button`).
- c) `invoice-receipt-button.dom.spec.ts` (Vitest + jsdom; `TestBed` with `provideHttpClient()`, `provideHttpClientTesting()`, a mocked `ToastService` `{ info: vi.fn(), error: vi.fn() }`; mock `saveBlob` with `vi.mock('../../../../../core/platform/file-output', ...)` — check the exact relative path — or, if module mocking does not work, `vi.spyOn` the component's own download method). Use `HttpTestingController`; match the list request with a predicate `req.url.endsWith('attachments/') || req.url.endsWith('attachments')` plus `req.params.get('label') === 'payment_receipt'` (check how `ApiService.get` builds the URL and adapt). Cases:
  - `one receipt downloads directly`: flush one item; then exactly one download request for the item's `download_url` path is made (flush a `Blob`); no `[role="menu"]` rendered.
  - `several receipts open a menu`: flush two items; the rendered text contains both `original_name`s and `[role="menu"]` exists; clicking the second menu item makes a download request for it and closes the menu.
  - `no receipt shows info toast`: flush `[]`; `toast.info` called with «رسیدی برای این فاکتور ثبت نشده است».
  - `403 shows the same info toast`: flush with `{ status: 403, statusText: 'Forbidden' }`; `toast.info` called with the same text, `toast.error` not called.
  - `has Persian aria-label and download icon`: the button has `aria-label` «دانلود رسید پرداخت» and contains an `svg` with the `appIcon` attribute value `download`.

4. Tool policy:
- Reading files is unrestricted.
- From `frontend`: `npx ng test --watch=false --include=src/app/modules/accounting/components/finance/invoice-receipt-button/invoice-receipt-button.dom.spec.ts` (at most 8 times), and once at the end `npx ng test --watch=false --include=src/app/modules/accounting/components/finance/treasurer/treasurer-invoices/*.spec.ts --include=src/app/modules/accounting/components/finance/employee/employee-invoices/*.spec.ts --include=src/app/modules/accounting/components/finance/manager/manager-invoices/*.spec.ts --include=src/app/modules/accounting/components/finance/accountant/accountant-invoices/*.spec.ts` (a failure that also happens without your change is acceptable; say which). Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach. If a real file differs from this task (line numbers, text), follow the real file and say so in the report.

5. Before finishing:
- The new spec passes and guardian 52 passes.
- `git status --short` shows only the new folder and the ten page files (plus the pre-existing `tests/playwright/tools/index.py` and runner files) before the commit.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
feat(invoices): quick payment receipt download button on invoice lists
- Short English report: what changed per file, test results, anything that differed from this task. End the turn after the commit and the report.

===

[DONE] Session 1 of 1 — Overnight fixes O8-a: remove fake sample data from five finance pages (bank accounts shows the real company bank accounts read-only; cheques, reconciliation, budget, contracts show an honest empty state)

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-bank-accounts/*" --allow "frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-cheques/*" --allow "frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-reconciliation/*" --allow "frontend/src/app/modules/accounting/components/finance/manager/manager-budget/*" --allow "frontend/src/app/modules/accounting/components/finance/manager/manager-contracts/*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-bank-accounts/treasurer-bank-accounts.ts --contains getBankAccounts --absent "IR120120000000001234567890" --absent "current_balance" --absent "executeTransfer" --absent "setTimeout"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-bank-accounts/treasurer-bank-accounts.html --absent "totalLiquidity" --absent "openTransferModal" --absent "cashboxes"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-cheques/treasurer-cheques.ts --absent "toast.success" --absent "ChequeItem"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-reconciliation/treasurer-reconciliation.ts --absent "reconciledCount = 18" --absent "ReconciliationItem" --absent "toast.success"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/manager/manager-budget/manager-budget.ts --absent "SectionBudgetItem" --absent "toast.success"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/manager/manager-contracts/manager-contracts.ts --absent "PersonnelContractItem" --absent "FleetContractItem" --absent "toast.success"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-cheques/treasurer-cheques.html --contains archive --contains appIcon
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/treasurer/treasurer-bank-accounts/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(finance): remove fake sample data"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only files inside these five folders (base `frontend/src/app/modules/accounting/components/finance/`): `treasurer/treasurer-bank-accounts/`, `treasurer/treasurer-cheques/`, `treasurer/treasurer-reconciliation/`, `manager/manager-budget/`, `manager/manager-contracts/`. The only new file allowed is `treasurer/treasurer-bank-accounts/treasurer-bank-accounts.dom.spec.ts`. Never edit routes, menus, `module.ts`, `backend/`, `scripts/`, `tasks.md`, `tasks_history.md`, shared components or any other file.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- Keep each component's class name, `selector`, `templateUrl` and `styleUrl` unchanged (routes import the classes by name).
- No inline `<svg>` with paths: icons only as `<svg appIcon="name" ...></svg>` with names that exist in `frontend/src/app/shared/icons/icon-registry.ts` (use `archive`, `alert-circle`, `loader`). Use semantic colour tokens (`bg-surface`, `text-fg`, `text-fg-muted`, `border-line`). All user-facing text stays Persian.
- Do not delete or weaken any existing test (these five folders have no spec today).

2. Context:
- These five pages were built as visual mock-ups. They show invented data (hard-coded arrays of banks, cheques, budget lines, contracts, people's names, KPI numbers) and fake actions (methods that only change local arrays and then show a success toast, or a `setTimeout` "refresh/sync" toast). The user wants no fake data shown anywhere: either real server data or nothing.
- Only the bank accounts page has a real backend: `CompanyApiService` (`frontend/src/app/core/api/company-api.service.ts`, class at line 26) method `getBankAccounts(companyId?: number)` (lines 276–286) returns `Observable<CompanyBankAccount[] | { results: CompanyBankAccount[]; count: number }>`. Model `CompanyBankAccount` is in `frontend/src/app/core/models/company.model.ts` lines 135–153 (`id`, `company`, `company_name`, `bank_name`, `account_number`, `sheba_number`, `account_title`, `is_primary`, `is_active`, `opening_balance`, ...). The server already limits the list to the user's companies; do not add any access logic. Call it WITHOUT a company id. If the module is not installed it throws `Error('accounting-module-not-installed')` — treat it like any error.
- Bank page today: `treasurer-bank-accounts.ts` (211 lines: fake `bankAccounts` 88–122, fake `cashboxes` 124–143, transfer modal state 145–149, `totalLiquidity` 161–163, `switchSubTab` 165–169, transfer 171–197, `exportExcel` 199–201, fake `refreshData` 203–210) and `treasurer-bank-accounts.html` (169 lines: command center 4–41 with the liquidity badge 8–13, tab bar 16–22, export/refresh buttons 26–40; bank table 44–91; cashbox table 94–126; transfer modal 128–167).
- Other four pages: `treasurer/treasurer-cheques/treasurer-cheques.{ts,html}`, `treasurer/treasurer-reconciliation/treasurer-reconciliation.{ts,html}`, `manager/manager-budget/manager-budget.{ts,html}`, `manager/manager-contracts/manager-contracts.{ts,html}`. They have NO backend at all. Read each `.ts` fully before editing.

3. Task:
- a) Bank accounts (`treasurer-bank-accounts.ts` and `.html`):
  - Delete the fake arrays, the `ProjectCashboxItem` and `BankAccountItem` interfaces, the cashbox tab and sub-tab logic (`activeSubTab`, `tabs`, `switchSubTab`), the transfer modal (state, methods, template), `totalLiquidity`, `exportExcel` and the fake `refreshData`. Remove now-unused imports (`TabBarComponent`, `FormsModule`, `ReactiveFormsModule`, `ActivatedRoute`, `Router`, `Subscription`, `ProjectSection`, `PersonnelApiService`, `ACCOUNTING_ENTITY_ICONS` if unused) — keep `CommandCenterComponent`, `ActionButtonComponent` if still used.
  - New state: `accounts: CompanyBankAccount[] = []`, `isLoading = false`, `loadError = ''`. Inject `CompanyApiService` and `ChangeDetectorRef`. `load()`: set `isLoading = true`, `loadError = ''`; subscribe to `getBankAccounts()`; on success `accounts = Array.isArray(res) ? res : (res?.results ?? [])`; on error `loadError = 'دریافت حساب‌های بانکی انجام نشد.'`; always `isLoading = false` and `cdr.markForCheck()`. Call `load()` in `ngOnInit`. Keep a real `refreshData()` that just calls `load()`.
  - Template: keep `<app-command-center rowFrom="lg">`; in `cc-tabs` put a title `<h1 class="text-sm font-black text-fg">حساب‌های بانکی سازمان</h1>` plus a small muted count «{{ accounts.length }} حساب»; in `cc-actions` keep ONLY the refresh button (`appAction="refresh"`, `(click)="refreshData()"`, `[busy]="isLoading"` if `ActionButtonComponent` supports `busy` — it does in the old modal). Below it, one card (`bg-surface rounded-3xl border border-line shadow-sm overflow-hidden`):
    - loading: a row with `<svg appIcon="loader" class="w-5 h-5 animate-spin" aria-hidden="true"></svg>` and «در حال دریافت حساب‌ها…»;
    - error: `alert-circle` icon, the `loadError` text and a «تلاش دوباره» button calling `load()`;
    - empty (not loading, no error, 0 accounts): `archive` icon and «هنوز حساب بانکی برای شرکت ثبت نشده است.» plus muted line «حساب‌ها از بخش شرکت‌ها، زبانهٔ خزانه ثبت می‌شوند.»;
    - list: a read-only table (keep the old table classes, `text-right text-xs`, wrapper `overflow-x-auto`) with columns «ردیف», «شرکت» (`company_name`), «بانک» (`bank_name`), «عنوان حساب» (`account_title || '—'`), «شماره حساب» (`account_number || '—'`, `dir="ltr"`, `font-mono`), «شماره شبا» (`sheba_number`, `dir="ltr"`, `font-mono`), «وضعیت» (pill «فعال» emerald when `is_active` else pill «غیرفعال» slate; plus a small indigo pill «اصلی» when `is_primary`). No balances, no limits, no transfer, no export. Use `@for (acc of accounts; track acc.id; let i = $index)` or `*ngFor` with `trackBy` — match what the file already uses (`*ngFor`).
  - New spec `treasurer-bank-accounts.dom.spec.ts` (Vitest + jsdom, `TestBed` with the standalone component, `provideRouter([])` if needed, a mocked `CompanyApiService` `{ getBankAccounts: vi.fn() }` provided with `useValue`, mocked `AuthService`/`StateService`/`ToastService` only if the constructor still needs them — better: remove them from the constructor if unused). Cases:
    - `shows real accounts from the server`: `getBankAccounts` returns `of([{ id: 1, company: 1, company_name: 'شرکت الف', bank_name: 'بانک آزمون', sheba_number: 'IR000000000000000000000001', account_number: '123', account_title: 'جاری', is_primary: true, is_active: true }])`; text contains «بانک آزمون», «IR000000000000000000000001», «اصلی»; `getBankAccounts` called once with no argument.
    - `accepts a paginated response`: returns `of({ count: 1, results: [ ...same item ] })`; text contains «بانک آزمون».
    - `shows empty state`: returns `of([])`; text contains «هنوز حساب بانکی».
    - `shows error with retry`: returns `throwError(() => new Error('x'))`; text contains «دریافت حساب‌های بانکی انجام نشد»; clicking the «تلاش دوباره» button calls `getBankAccounts` a second time.
    - `no fake data`: with `of([])`, text contains none of «بانک ملت», «موجودی», «انتقال وجه», «صندوق».
- b) Cheques, reconciliation, budget, contracts — same treatment for each of the four:
  - `.ts`: delete every fake data array, every exported interface of fake rows, every fixed KPI number/getter, every filter/search/tab state that only filters the fake arrays, every method that only edits local fake state and/or shows a toast (approve, register, mark, export, refresh, sync, renew ...), modal state. Remove unused imports and constructor parameters. What remains is a minimal standalone component (`imports: [CommonModule, SvgIconDirective]` — import path for `SvgIconDirective` is `shared/icons/svg-icon.directive`, check the relative depth from other files in the same folder level, e.g. `../../../../../../shared/icons/svg-icon.directive`) with no `OnInit`/`OnDestroy` unless still needed. Keep class name, selector, `templateUrl`, `styleUrl`.
  - `.html`: replace the whole template with one page wrapper `<div class="min-h-screen bg-slate-50/50 p-3 md:p-6 space-y-4" dir="rtl">` holding: a header card (`bg-surface rounded-2xl border border-line p-4`) with the page title as `<h1 class="text-sm font-black text-fg">` (cheques «چک‌ها»، reconciliation «مغایرت‌گیری بانکی»، budget «بودجه و مراکز هزینه»، contracts «قراردادها» — if the old template had a clearer Persian title use it), then an empty-state card (`bg-surface rounded-3xl border border-line p-8 flex flex-col items-center text-center gap-2`) with `<svg appIcon="archive" class="w-10 h-10 text-fg-muted" aria-hidden="true"></svg>`, `<p class="text-sm font-bold text-fg">این بخش هنوز به داده‌های واقعی سامانه وصل نشده است.</p>` and `<p class="text-xs text-fg-muted">پس از راه‌اندازی، اطلاعات واقعی اینجا نمایش داده می‌شود.</p>`. No buttons, no tabs, no numbers.
  - `.css`: leave as is (or empty it if it only styled removed parts).

4. Tool policy:
- Reading files is unrestricted.
- From `frontend`: `npx ng test --watch=false --include=src/app/modules/accounting/components/finance/treasurer/treasurer-bank-accounts/treasurer-bank-accounts.dom.spec.ts` (at most 8 times). NOTE: an unrelated spec `personnel-approval-cycle.spec.ts` has a pre-existing compile error; if `ng test` fails to compile because of it, create a temporary tsconfig at `scratch/tsconfig.o8.json` that extends `../frontend/tsconfig.spec.json` with `"include": ["../frontend/src/**/*.d.ts", "../frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-bank-accounts/treasurer-bank-accounts.dom.spec.ts"]` and pass `--ts-config ../scratch/tsconfig.o8.json` (it is outside git scope; delete it before the commit). Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- From `frontend`, once at the end: `npx tsc -p tsconfig.app.json --noEmit` to make sure the five components compile (report any error that is not in these five folders as pre-existing, do not fix it).
- If a command fails, read its output, do not repeat it unchanged, and change approach. If a real file differs from this task (line numbers, text), follow the real file and say so in the report.

5. Before finishing:
- The new spec passes and guardian 52 passes; `tsc` shows no error in the five folders.
- `grep` the five `.ts` files: no `toast.success`, no `setTimeout`, no hard-coded Persian person or company names remain.
- `git status --short` shows only files of the five folders (plus the pre-existing `tests/playwright/tools/index.py` and runner files) before the commit.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
fix(finance): remove fake sample data from bank accounts, cheques, reconciliation, budget and contracts pages
- Short English report: what changed per page, test results, anything that differed from this task. End the turn after the commit and the report.

===

[DONE] Session 1 of 1 — Overnight fixes O4-a: accessibility, RTL and state fixes on the five invoice list pages

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/*" --allow "frontend/src/app/modules/accounting/components/finance/accountant/accountant-invoices/*" --allow "frontend/src/app/modules/accounting/components/finance/manager/manager-invoices/*" --allow "frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-invoices/*" --allow "frontend/src/app/modules/accounting/components/finance/invoice-receipt-button/*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices.html --contains "طرف‌حساب" --contains "aria-modal" --contains "sr-only" --absent "🔍" --absent "👤" --absent "🔒" --absent "👥" --absent "⬇️" --absent "⏳" --absent "min-h-[32px]" --absent "min-w-[32px]"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-invoices/accountant-invoices.html --contains "پاک‌سازی" --contains "انتخاب بخش" --absent "🔍" --absent "🧾" --absent "✅" --absent "🏦" --absent "✕" --absent "pr-9 pl-8"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-invoices/treasurer-invoices.html --contains "طرف‌حساب" --contains "انتخاب بخش" --contains "در حال بارگذاری فاکتورها" --contains "<bdi"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/manager/manager-invoices/manager-invoices.html --contains "طرف‌حساب" --contains "نمی‌باشد" --contains "در حال بارگذاری فاکتورها" --absent "text-right"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/invoice-receipt-button/invoice-receipt-button.ts --contains "items.length > 1 ? 'menu' : null"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/employee/employee-invoices/*.spec.ts" --include "src/app/modules/accounting/components/finance/treasurer/treasurer-invoices/*.spec.ts" --include "src/app/modules/accounting/components/finance/manager/manager-invoices/*.spec.ts" --include "src/app/modules/accounting/components/finance/invoice-receipt-button/*.spec.ts" --include "src/app/modules/accounting/components/finance/accountant/accountant-invoices/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(invoices): a11y, RTL and loading states on invoice list pages"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only files inside these five folders (base `frontend/src/app/modules/accounting/components/finance/`): `employee/employee-invoices/`, `accountant/accountant-invoices/`, `manager/manager-invoices/`, `treasurer/treasurer-invoices/`, `invoice-receipt-button/`. No new files except a temporary tsconfig (see Tool policy) that you delete before the commit. Never edit `backend/`, `scripts/`, `tasks.md`, `tasks_history.md`, shared components, routes or any other file.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- PERSIAN HALF-SPACES: Persian text contains the zero-width non-joiner character (ZWNJ, U+200C), e.g. in «طرف‌حساب», «پاک‌سازی», «نمی‌باشد», «حساب‌ها». Keep every ZWNJ exactly as it is. Never retype existing Persian text; edit only the attributes and tags around it. In new Persian text, write the half-space as U+200C (e.g. «در حال بارگذاری فاکتورها...» has none; «پرداخت‌شده» has one). The previous task lost every ZWNJ and had to be fixed by hand — the runner checks this.
- Icons only as `<svg appIcon="name" ...></svg>` with names that exist in `frontend/src/app/shared/icons/icon-registry.ts`. Confirmed names: `search`, `x`, `file-text`, `user`, `lock`, `users`, `download`, `loader`, `check-circle`, `credit-card`, `building`. No inline `<svg>` with `<path>`. Decorative icons get `aria-hidden="true"`.
- Do not change any behaviour, method name, input/output, or `(click)`/`(change)` handler. Do not delete or weaken any existing test. All user-facing text stays Persian.
- If a real file differs from this task (line numbers, text), follow the real file and say so in the report. Skip an item only if it does not exist in the file, and say so.

2. Context:
- A static accessibility/RTL audit of the invoice list pages found the items below (plan findings ی۱۱–ی۲۲ in `Documents/Overnight_Fixes_2026_11/plan_overnight_fixes.md`; do not edit the plan). The app is Persian right-to-left; Tailwind logical classes (`start-*`, `end-*`, `ps-*`, `pe-*`, `text-start`, `text-end`) must be used instead of physical `left/right`, `pl/pr`, `text-left/right` in the touched elements.
- Line numbers are approximate (from HEAD at task writing time).

3. Task:
- a) `employee/employee-invoices/employee-invoices.html`:
  - Search box (~lines 64–81): replace the `<span ...>🔍</span>` with `<svg appIcon="search" class="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>`; on the input replace `pr-8 pl-8` with `ps-9 pe-10` and change `type="text"` to `type="search"`; move the clear button from `start-0` to `end-0` and add `focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl`, and add `aria-hidden="true"` to its svg.
  - File attachment inputs (~lines 685–699): each `<input type="file" ... class="hidden">` → replace `hidden` with `sr-only peer`, and add `peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500` to the class of the wrapping `<label>` (if the input is not the first child of the label, put the input as the first child so `peer` works, keeping all attributes and handlers).
  - Remove-attachment button (~line 707–709): replace its size classes `min-w-[32px] min-h-[32px]` with `w-10 h-10 inline-flex items-center justify-center rounded-xl focus-visible:ring-2 focus-visible:ring-indigo-500`, replace the `✕` text with `<svg appIcon="x" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>`; keep (or add) `title="حذف پیوست"` and `aria-label="حذف پیوست"` if no aria-label exists.
  - Any other `min-h-[32px]` / `min-w-[32px]` in this file (~lines 419, 428) → `min-h-[40px]` / `min-w-[40px]`.
  - Emoji icons: line ~194 `👤` → `<svg appIcon="user" class="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>`; ~321 `🔒 قفل` → `lock` icon (same classes, `inline-block align-middle`) followed by the existing text «قفل»; ~772 `👥` → `users` icon (keep the size the emoji container had, e.g. `w-6 h-6`); ~849 `⬇️ دانلود فایل اصلی` → `download` icon + the existing text; ~893 `<div class="inline-block animate-spin text-2xl mb-2">⏳</div>` → `<svg appIcon="loader" class="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>`.
  - Section select (~lines 10–13): add `id="emp-inv-section"` and `aria-label="انتخاب بخش"` to the `<select>`; change the sibling `<span>` label text holder to `<label for="emp-inv-section" ...>` with the same classes and text.
  - «طرف‌حساب» label (~line 415): add `for="invoice_counterparty"` (the `app-search-select` there receives `inputId="invoice_counterparty"`; verify it, and if the id differs use the real one).
  - Amount column (~lines 159 and 212): `text-left` → `text-end`. Where an amount is followed by «تومان» in the same text node (~line 217), wrap the number interpolation in `<bdi>…</bdi>`.
  - Invoice number / tracking code in the mobile cards (~lines 102–103): wrap the interpolation in `<bdi dir="ltr">…</bdi>`.
  - The two hand-built modals that lack dialog semantics (~line 824 and ~line 866, the `fixed inset-0` overlays): on the inner panel add `role="dialog" aria-modal="true" aria-labelledby="<id>"` and give the modal's title element (`<h3>`/`<h4>`) that id (`emp-inv-modal-3-title`, `emp-inv-modal-4-title`); on the overlay add `(keydown.escape)="<the same close method its close button already calls>()"` and `tabindex="-1"`. Do the same `(keydown.escape)` for the two other modals (~lines 384, 764) only if they already have `role="dialog"`, using their existing close method.
- b) `accountant/accountant-invoices/accountant-invoices.html`:
  - Section select (~lines 10–13): same as a) with id `acc-inv-section`.
  - Search (~lines 58–73): same treatment as the employee search: `search` icon at `start-3`, input `ps-9 pe-10`, `type="search"`, keep its placeholder and add `aria-label="جستجوی فاکتور"` if missing; clear button → `class="absolute end-0 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl"` with the `x` icon (`w-3.5 h-3.5`, `aria-hidden="true"`) instead of `✕`; keep its title/aria-label «پاک‌سازی …» untouched.
  - `🧾` (~line 90) → `<svg appIcon="file-text" ...>` sized like the emoji container (e.g. `w-8 h-8`), `aria-hidden="true"`.
  - Status ternary (~line 158) contains `'✅ تسویه شده'` and `'🏦 آماده پرداخت'`: remove only the emoji and the following space from those two strings (keep the Persian words exactly), and before the interpolation add `<svg *ngIf="item.status === 'paid'" appIcon="check-circle" class="w-3.5 h-3.5 inline-block align-middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>` and the same with `credit-card` for `item.status === 'ready_to_pay'`.
  - Table (~line 99): `text-right` → `text-start`. Invoice number / tracking cells (~lines 116, 122): wrap the interpolation in `<bdi dir="ltr">…</bdi>`.
- c) `treasurer/treasurer-invoices/treasurer-invoices.html`:
  - Section select (~lines 10–13): same as a) with id `tr-inv-section`.
  - Refresh button (~line 35): add `[busy]="isLoading"` if it is an `appAction`/`ActionButtonComponent` button (the accountant page does the same at ~line 47).
  - Table body (~lines 47–112): after the `*ngFor` row add `<tr *ngIf="isLoading && invoices.length === 0"><td colspan="<number of columns>" class="p-10 text-center text-slate-400 text-xs" role="status">در حال بارگذاری فاکتورها...</td></tr>` and `<tr *ngIf="!isLoading && invoices.length === 0"><td colspan="<number of columns>" class="p-10 text-center text-slate-400 text-xs">فاکتوری برای پرداخت وجود ندارد.</td></tr>`. Count the real `<th>` columns for colspan. Use the real list property name of the `*ngFor` (read `treasurer-invoices.ts`; if it is not `invoices`, use the real name).
  - Sheba / invoice number / tracking code cells (~lines 83, 84, 108): wrap each interpolation in `<bdi dir="ltr">…</bdi>`.
- d) `manager/manager-invoices/manager-invoices.html`:
  - Table (~line 12): `text-right` → `text-start` (every `text-right` in this file → `text-start`).
  - Empty row (~line 62): change its `*ngIf` to `!isLoading && <list>.length === 0` (keep the existing text «… نمی‌باشد.» exactly), and add before it a loading row `<tr *ngIf="isLoading && <list>.length === 0"><td colspan="<same colspan>" class="p-10 text-center text-slate-400 text-xs" role="status">در حال بارگذاری فاکتورها...</td></tr>` (`<list>` = the real `*ngFor` list, e.g. `invoicesList`).
  - Invoice number cells (~lines 28, 48): wrap in `<bdi dir="ltr">…</bdi>`.
- e) `invoice-receipt-button/invoice-receipt-button.ts` (inline template ~lines 34–44): change `aria-haspopup` to `[attr.aria-haspopup]="items.length > 1 ? 'menu' : null"` and `aria-expanded` to `[attr.aria-expanded]="items.length > 1 ? menuOpen : null"` (use the real property names; if they differ, adapt and keep the text-check string `items.length > 1 ? 'menu' : null` exactly). If the existing DOM spec asserts `aria-haspopup` for a single-item case, keep the spec passing by asserting the new behaviour only if the old assertion contradicts it — and say so in the report.

4. Tool policy:
- Reading files is unrestricted.
- Specs: from `frontend`. An unrelated spec `personnel-approval-cycle.spec.ts` has a pre-existing compile error, so create a temporary `frontend/tsconfig.o4tmp.json` (INSIDE `frontend/`, not in `scratch/`):
  `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/modules/accounting/components/finance/employee/employee-invoices/*.spec.ts", "src/app/modules/accounting/components/finance/treasurer/treasurer-invoices/*.spec.ts", "src/app/modules/accounting/components/finance/manager/manager-invoices/*.spec.ts", "src/app/modules/accounting/components/finance/accountant/accountant-invoices/*.spec.ts", "src/app/modules/accounting/components/finance/invoice-receipt-button/*.spec.ts"], "exclude": [] }`
  and run `npx ng test --watch=false --ts-config tsconfig.o4tmp.json --include="src/app/modules/accounting/components/finance/**/*invoice*.spec.ts"` (at most 6 times; if the glob matches nothing, pass each folder's specs with separate `--include` flags). Delete `frontend/tsconfig.o4tmp.json` before the commit.
- Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py` and `python scripts/e2e/guardian_56_change_integrity.py --base HEAD~0 --head HEAD` is NOT needed (runner does it).
- If a command fails, read its output, do not repeat it unchanged, and change approach.

5. Before finishing:
- All specs in the five folders pass (same as before your change), guardian 52 passes.
- In the touched html files: no emoji listed above remains; every ZWNJ word that existed before still exists (spot-check «طرف‌حساب», «پاک‌سازی», «نمی‌باشد», «پرداخت‌شده» with a search).
- `git status --short` shows only files of the five folders (plus the pre-existing `tests/playwright/tools/index.py` and runner files) before the commit; `frontend/tsconfig.o4tmp.json` is deleted.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
fix(invoices): a11y, RTL and loading states on invoice list pages
- Short English report: what changed per file, test results, anything that differed from this task or was skipped. End the turn after the commit and the report.

===

[SKIP] Session 1 of 1 — Overnight fixes O4-b: accessibility, RTL and state fixes on employee attendance, fleet, new vehicle and petty cash pages

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/employee/employee-attendance/*" --allow "frontend/src/app/modules/accounting/components/finance/employee/employee-fleet/*" --allow "frontend/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/*" --allow "frontend/src/app/modules/accounting/components/finance/employee/employee-petty-cash/*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-attendance/employee-attendance.html --count "54:‌" --contains "ذخیره‌نشده" --contains "aria-modal" --contains "<bdi" --absent "⚠️" --absent "🔄" --absent "🔒" --absent "⭐" --absent "📥" --absent "🗑️" --absent "🔍" --absent "⚡" --absent "💰" --absent "🖨️" --absent "pr-7 pl-6"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-fleet/employee-fleet.html --count "17:‌" --contains "ذخیره‌نشده" --contains "aria-modal" --contains "<bdi" --absent "📅" --absent "✏️" --absent "🌐" --absent "🔍" --absent "🖨️" --absent "📥" --absent "📜" --absent "⚠️"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-new-vehicle/employee-new-vehicle.html --count "71:‌" --absent "pr-8 pl-8"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-petty-cash/employee-petty-cash.html --count "73:‌" --contains "طرف‌حساب" --absent "file:ml-2"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/employee/employee-attendance/*.spec.ts" --include "src/app/modules/accounting/components/finance/employee/employee-fleet/*.spec.ts" --include "src/app/modules/accounting/components/finance/employee/employee-new-vehicle/*.spec.ts" --include "src/app/modules/accounting/components/finance/employee/employee-petty-cash/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(employee): a11y, RTL and error states on attendance, fleet, vehicle and petty cash pages"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only files inside these four folders (base `frontend/src/app/modules/accounting/components/finance/employee/`): `employee-attendance/`, `employee-fleet/`, `employee-new-vehicle/`, `employee-petty-cash/`. No new files except a temporary tsconfig (see Tool policy) that you delete before the commit. Never edit `backend/`, `scripts/`, `tasks.md`, `tasks_history.md`, shared components, routes or any other file.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- PERSIAN HALF-SPACES: Persian text contains the zero-width non-joiner character (ZWNJ, U+200C), e.g. «ذخیره‌نشده», «نیمه‌وقت», «طرف‌حساب», «پیش‌نمایش». Keep every ZWNJ exactly as it is. Never retype existing Persian text; edit only the attributes, tags and emoji around it. The runner counts the ZWNJ characters per html file and fails if any is lost (attendance 54, fleet 17, new-vehicle 71, petty-cash 73 — at least these numbers). In new Persian text write a half-space as U+200C.
- Icons only as `<svg appIcon="name" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>` with names that exist in `frontend/src/app/shared/icons/icon-registry.ts` (open it and check each name before use). Suggested names: `alert-triangle`, `refresh-cw`, `lock`, `star`, `upload`, `download`, `trash-2`, `check`, `search`, `x`, `zap`, `dollar-sign`, `printer`, `calendar`, `edit`, `clipboard-paste`, `file-text`. If a suggested name is missing, pick the closest existing one. No inline `<svg>` with `<path>`. Decorative icons get `aria-hidden="true"`. The component must import `SvgIconDirective` (`shared/icons/svg-icon.directive`) if it does not already.
- Do not rename any method, input/output or field used by a spec. Do not delete or weaken any existing test. All user-facing text stays Persian.
- If a real file differs from this task (line numbers, text), follow the real file and say so in the report. Skip an item only if it does not exist in the file, and say so.

2. Context:
- A static accessibility/RTL audit of the employee pages found the items below (plan findings ی۲۳–ی۳۱ in `Documents/Overnight_Fixes_2026_11/plan_overnight_fixes.md`; do not edit the plan). The app is Persian right-to-left; Tailwind 3.4 logical classes (`start-*`, `end-*`, `ps-*`, `pe-*`, `ms-*`, `me-*`, `text-start`, `text-end`, `border-s`, `border-e`) must be used instead of physical ones in the touched elements.
- Line numbers are approximate (from HEAD at task writing time).
- The «انبار مرجع» column and the top warehouse picker were removed from the attendance page on purpose: do not restore them.
- Do NOT replace raw colour classes (`slate-*`, `bg-white`) with tokens in this task; that is a later task.

3. Task:
- a) Emoji used as icons (ی۲۳) in `employee-attendance/employee-attendance.html` (~lines 6, 11, 168, 213, 244, 250, 257, 260, 271, 516–522, 596, 649, 876, 960) and `employee-fleet/employee-fleet.html` (~lines 156, 185, 207, 210, 263, 356, 461, 492, 501, 522, 525, 583, 682, 719, 829): replace each emoji with the matching `appIcon` svg (⚠️ `alert-triangle`, 🔄 `refresh-cw`, 🔒 `lock`, ⭐ `star`, 📥 `upload` for excel import, 🗑️ `trash-2`, ✓ `check`, 🔍 `search`, ✕ `x`, ⚡ `zap`, 💰 `dollar-sign`, 🖨️ `printer`, 📅 `calendar`, ✏️ `edit`, 📋 `clipboard-paste`, 📜 `file-text`). Keep the Persian text next to it; put icon + text in an `inline-flex items-center gap-1` wrapper when the parent is not already flex. Inside `<option>` and `placeholder` attributes an svg is impossible: just remove the emoji and the following space (e.g. the 🌐 option, the fleet search placeholder). In `employee-attendance.ts` (~lines 338, 349) and `employee-fleet.ts` (~lines 505, 516) remove the leading `'⚠️ '` from toast message strings (the toast has its own icon). Check the specs first (`grep` the four folders' `*.spec.ts` for the emoji/strings you change) and, if a spec asserts an old string, keep the spec passing by updating only that expected string — say so in the report.
- b) Grid inputs and checkboxes without an accessible name (ی۲۴): attendance ~lines 20–30 (section select: `aria-label="بخش فعال"` if it has no `<label for>`), ~127 (date input: `aria-label="تاریخ"`), ~261 (search: `aria-label="جستجوی پرسنل"`), ~284 (select-all checkbox: `aria-label="انتخاب همه"`), row checkboxes (`[attr.aria-label]="'انتخاب ' + row.full_name"`), grid inputs ~317–464 (`[attr.aria-label]="'<column header text> ' + row.full_name"`, use the real column header Persian text and the real row variable), ~553 (month input: `aria-label="ماه"`); fleet grid inputs ~272–319, 381–413 (`[attr.aria-label]="'تعداد سفر ' + v.driver_name"` and the same pattern for the other columns, real variable names), ~519 search (`aria-label="جستجوی راننده یا پلاک"`). Modal form fields in attendance ~751–776, 800, 835–858, 891–908 and fleet ~638–658, 690: connect each visible `<label>` to its control with a `for`/`id` pair (ids prefixed `att-` / `flt-`), or add an `aria-label` equal to the visible label text where a pair is impossible.
- c) Hand-built modals (ی۲۵): attendance ~lines 741, 790, 822, 872, 954, 1087, 1115 and fleet ~624, 679, 713, 825 (`fixed inset-0` overlays). On the inner panel add `role="dialog" aria-modal="true" aria-labelledby="<id>"` and give the modal's title element that id (`att-modal-<n>-title`, `flt-modal-<n>-title`). In `employee-attendance.ts` extend `onGlobalEscape()` (~line 1786) so it also closes the print, excel-import and submit modals (use the real `is...ModalOpen` flags or their existing close methods), keeping the existing order. In `employee-fleet.ts` add `@HostListener('window:keydown.escape') onGlobalEscape(): void` that closes the open modal of highest z-order: `isFleetDayDetailModalOpen`, `isFleetExcelPasteModalOpen`, `isFleetPrintModalOpen` (via `closeFleetPrintModal()`), `isVehicleProfileModalOpen`, `isFleetAuditLogsModalOpen` — use each modal's existing close method where one exists (~lines 818, 905, 959, 1195), one per key press, then `return`.
- d) Day cells in the monthly grids (ی۲۶): attendance ~line 715 and the equivalent fleet monthly-grid cell: move the `(click)` from the `<td>` to a new `<button type="button" class="block w-full min-h-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded" [attr.aria-label]="<row name> + ' روز ' + <day>">` that wraps the cell content; keep the `<td>` classes/bindings except `(click)` and `cursor-pointer`.
- e) Error state (ی۲۷): in `employee-attendance.ts` and `employee-fleet.ts` add `loadError = '';` and, in the method that loads the main list shown in the table (the subscribe that fills the rows and sets `isLoading = false`), set `this.loadError = ''` on start/success and `this.loadError = 'دریافت اطلاعات انجام نشد.'` in its `error` callback (keep the existing error handling/toast). In each html, next to the existing empty row of that table (attendance ~308–312, fleet ~252/345), change the empty row's condition to also require `!loadError`, and add `<tr *ngIf="!isLoading && loadError"><td [attr.colspan]="<same colspan as the empty row>" role="alert" class="p-8 text-center text-xs font-bold text-rose-600">{{ loadError }} <button type="button" (click)="<the same reload method the refresh button calls>()" class="ms-2 min-h-10 px-3 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">تلاش دوباره</button></td></tr>` (use the real loading flag name; if the empty state is a `div` not a `tr`, add an equivalent `div`).
- f) Clear-search buttons (ی۲۸): attendance ~268–271, fleet ~210, 525: `<button type="button" title="پاک کردن جستجو" aria-label="پاک کردن جستجو" class="absolute end-0 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl">` with the `x` icon; the search icon at `start-3` (`absolute top-1/2 -translate-y-1/2 pointer-events-none`); input padding `ps-9 pe-10` instead of `pr-7 pl-6` / `pr-8 pl-8`. Keep the existing `(click)` handler.
- g) Icon-only buttons (ی۲۹): attendance ~140 (date-picker button) and fleet ~155, 263, 356 (📅 / ✏️ buttons): size `inline-flex items-center justify-center w-10 h-10 rounded-xl`, `aria-label` identical to the existing `title`, `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`. Also add those three `focus-visible:` classes to every other custom `<button>` in the attendance and fleet html that has no `focus-visible:` class and no `appAction` attribute.
- h) Physical RTL classes (ی۳۰) in the four html files: `mr-*`→`me-*`, `ml-*`→`ms-*`, `pr-*`→`pe-*`, `pl-*`→`ps-*`, `right-*`→`end-*`, `left-*`→`start-*`, `text-right`→`text-start`, `text-left`→`text-end`, `border-l`→`border-s`, `border-r`→`border-e`, `sticky right-0`/`right-10` → `sticky start-0`/`start-10`, `file:mr-0 file:ml-2` → `file:me-2` (petty-cash ~802). EXCEPTIONS (leave unchanged): elements with `dir="ltr"` (sheba, plate, numeric LTR inputs), anything inside a print sheet (`print:` blocks, attendance ~1005–1047, fleet print modal), and the symmetric `left-3 right-3` pair (attendance ~471). new-vehicle ~lines 119–133, 846, 971–981 have `pr-8 pl-8`, `absolute right-3/left-2.5`, `pr-6`, `text-left`, `border-r`, `pr-12`.
- i) Codes without `bdi` (ی۳۱): wrap these interpolations in `<bdi dir="ltr">…</bdi>`: national code cells (attendance ~707, 1034, 1043 — skip ones inside the print sheet), plate / phone / sheba cells in fleet (~270, 361, 589, 628, 697, 774, 863) and new-vehicle (~177, 434).

4. Tool policy:
- Reading files is unrestricted.
- Specs: from `frontend`. An unrelated spec has a pre-existing compile error, so create a temporary `frontend/tsconfig.o4tmp.json` (INSIDE `frontend/`, not in `scratch/`):
  `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/modules/accounting/components/finance/employee/employee-attendance/*.spec.ts", "src/app/modules/accounting/components/finance/employee/employee-fleet/*.spec.ts", "src/app/modules/accounting/components/finance/employee/employee-new-vehicle/*.spec.ts", "src/app/modules/accounting/components/finance/employee/employee-petty-cash/*.spec.ts"], "exclude": [] }`
  and run `npx ng test --watch=false --ts-config tsconfig.o4tmp.json --include="src/app/modules/accounting/components/finance/employee/employee-attendance/*.spec.ts" --include="src/app/modules/accounting/components/finance/employee/employee-fleet/*.spec.ts" --include="src/app/modules/accounting/components/finance/employee/employee-new-vehicle/*.spec.ts" --include="src/app/modules/accounting/components/finance/employee/employee-petty-cash/*.spec.ts"` (run it once BEFORE your changes to know the baseline, then after; at most 6 runs in total). Delete `frontend/tsconfig.o4tmp.json` before the commit.
- Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach.

5. Before finishing:
- All specs in the four folders pass (same as the baseline), guardian 52 passes.
- In the touched html files: no emoji listed above remains; the ZWNJ count of each html is not lower than the numbers in Critical rules (check with a small python one-liner, e.g. `python -c "import sys;print(open(sys.argv[1],encoding='utf-8').read().count('‌'))" <file>`).
- `git status --short` shows only files of the four folders (plus the pre-existing `tests/playwright/tools/index.py` and runner files) before the commit; `frontend/tsconfig.o4tmp.json` is deleted.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
fix(employee): a11y, RTL and error states on attendance, fleet, vehicle and petty cash pages
- Short English report: what changed per file, test results, anything that differed from this task or was skipped. End the turn after the commit and the report.

===

[DONE] Session 1 of 1 — Overnight fixes O4-b3: accessibility, RTL and error state on the employee attendance page template

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/employee/employee-attendance/*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-attendance/employee-attendance.html --count "54:‌" --contains "ذخیره‌نشده" --contains "aria-modal" --contains "<bdi" --contains "loadError" --contains "تلاش دوباره" --absent "⚠️" --absent "🔄" --absent "🔒" --absent "⭐" --absent "📥" --absent "🗑️" --absent "🔍" --absent "⚡" --absent "💰" --absent "🖨️" --absent "pr-7 pl-6"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/employee/employee-attendance/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(employee): a11y, RTL and error state on the attendance page"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only files inside `frontend/src/app/modules/accounting/components/finance/employee/employee-attendance/` (mainly `employee-attendance.html`; `employee-attendance.ts` only for item e if needed). No new files except the temporary tsconfig (see Tool policy), deleted before the commit. Never edit `backend/`, `scripts/`, `tasks.md`, `tasks_history.md`, shared components or any other file.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- Edit the html with small, targeted edits (one element at a time). Do NOT use global regex / sed replacements over the whole file: a previous run broke a `(click)` expression containing `>` that way. After editing, open the file once and check every `(click)="..."` you touched is still intact.
- PERSIAN HALF-SPACES: Persian text contains the zero-width non-joiner (ZWNJ, U+200C), e.g. «ذخیره‌نشده», «نیمه‌وقت». Keep every ZWNJ exactly. Never retype existing Persian text; edit only attributes, tags and emoji around it. The runner fails if the html has fewer than 54 ZWNJ. In new Persian text write a half-space as U+200C.
- Icons only as `<svg appIcon="name" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>` with names that exist in `frontend/src/app/shared/icons/icon-registry.ts` (check each name). Suggested: `alert-triangle`, `refresh-cw`, `lock`, `star`, `upload`, `trash-2`, `check`, `search`, `x`, `zap`, `dollar-sign`, `printer`, `calendar`. No inline `<svg>` with `<path>`. The component must import `SvgIconDirective` if it does not already.
- Do not rename any method, input/output or field used by a spec. Do not delete or weaken any test. All user-facing text stays Persian.
- If the real file differs from this task, follow the real file and say so in the report.

2. Context:
- Plan findings ی۲۳–ی۳۱ (`Documents/Overnight_Fixes_2026_11/plan_overnight_fixes.md`; do not edit the plan). The same fixes are already done in the sibling `employee-fleet/employee-fleet.html` — open it and copy its patterns (icons, clear-search button, error row, day-cell button, dialogs).
- `employee-attendance.ts` ALREADY has `loadError` (set in `loadAttendanceMatrix()`, loading flag `isAttendanceLoading`) and an extended `onGlobalEscape()`. Only the html part is missing.
- The page is Persian RIGHT-TO-LEFT. Physical → logical mapping in RTL: `right` = start, `left` = end. So: `mr-*`→`ms-*`, `ml-*`→`me-*`, `pr-*`→`ps-*`, `pl-*`→`pe-*`, `right-*`→`start-*`, `left-*`→`end-*`, `-right-*`→`-start-*`, `text-right`→`text-start`, `text-left`→`text-end`, `border-r`→`border-s`, `border-l`→`border-e`, `sticky right-0` → `sticky start-0`. (This keeps the look identical and makes it direction-safe.)
- The «انبار مرجع» column and the top warehouse picker were removed on purpose: do not restore them. Do NOT replace raw colours (`slate-*`, `bg-white`) with tokens.

3. Task (all in `employee-attendance.html`, line numbers approximate):
- a) Emoji used as icons (~lines 6, 11, 168, 213, 244, 250, 257, 260, 271, 516–522, 596, 649, 876, 960): replace each with the matching `appIcon` svg (⚠️ `alert-triangle`, 🔄 `refresh-cw`, 🔒 `lock`, ⭐ `star`, 📥 `upload`, 🗑️ `trash-2`, ✓ `check`, 🔍 `search`, ✕ `x`, ⚡ `zap`, 💰 `dollar-sign`, 🖨️ `printer`, 📅 `calendar`). Keep the Persian text; wrap icon + text in `inline-flex items-center gap-1` when the parent is not flex. In `<option>` / `placeholder` just remove the emoji and its space. If a spec asserts an old string, update only that expected string and say so.
- b) Accessible names: section select (`aria-label="بخش فعال"` if no `<label for>`), date input (`aria-label="تاریخ"`), search (`aria-label="جستجوی پرسنل"`), select-all checkbox (`aria-label="انتخاب همه"`), row checkboxes (`[attr.aria-label]="'انتخاب ' + (row.full_name || 'پرسنل')"` with the real row variable), grid inputs (`[attr.aria-label]="'<real column header> ' + (row.full_name || 'پرسنل')"`), month input (`aria-label="ماه"`). Modal fields (~751–776, 800, 835–858, 891–908): `for`/`id` pairs with ids prefixed `att-`.
- c) Modals (`fixed inset-0` overlays, ~741, 790, 822, 872, 954, 1087, 1115): on the inner panel add `role="dialog" aria-modal="true" aria-labelledby="att-modal-<n>-title"` and put that id on the modal's title element.
- d) Monthly-grid day cells (~715): move `(click)` from the `<td>` to a new `<button type="button" class="w-full min-h-10 flex items-center justify-center rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" [attr.aria-label]="(row.full_name || 'پرسنل') + ' روز ' + <day>">` wrapping the cell content (real variable names); keep the other `<td>` classes/bindings, drop `cursor-pointer` from the td.
- e) Error state: next to the empty row of the daily table (~308–312) change the empty row condition to also require `!loadError`, and add before it `<tr *ngIf="!isAttendanceLoading && loadError"><td [attr.colspan]="<same colspan as the empty row>" role="alert" class="p-8 text-center text-xs font-bold text-rose-600">{{ loadError }} <button type="button" (click)="loadAttendanceMatrix()" class="ms-2 min-h-10 px-3 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">تلاش دوباره</button></td></tr>` (if the page also has a mobile card list with its own empty `div`, add the same as a `div`, like `employee-fleet.html`). If the empty row uses `@if` syntax, use `@if` too.
- f) Clear-search button (~268–271): `<button type="button" title="پاک کردن جستجو" aria-label="پاک کردن جستجو" class="absolute end-0 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl">` with the `x` icon; search icon at `absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none`; input padding `ps-9 pe-10` instead of `pr-7 pl-6`. Keep the existing `(click)`.
- g) Icon-only date-picker button (~140): `inline-flex items-center justify-center w-10 h-10 rounded-xl`, `aria-label` equal to its `title` (add `title="انتخاب تاریخ تقویمی"` if missing), plus `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`. Add those three `focus-visible:` classes to every other custom `<button>` in the file that has no `focus-visible:` class and no `appAction` attribute (add them as a separate class token; never put them inside another attribute).
- h) Physical RTL classes: apply the mapping from Context to the whole html EXCEPT elements with `dir="ltr"`, the print sheet (`print:` blocks, ~1005–1047) and the symmetric `left-3 right-3` pair (~471).
- i) National code cells (~707; skip the print sheet): wrap the interpolation in `<bdi dir="ltr">…</bdi>`.

4. Tool policy:
- Reading files is unrestricted.
- Specs: create `frontend/tsconfig.o4tmp.json` (inside `frontend/`):
  `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/modules/accounting/components/finance/employee/employee-attendance/*.spec.ts"], "exclude": [] }`
  and from `frontend` run `npx ng test --watch=false --ts-config tsconfig.o4tmp.json --include="src/app/modules/accounting/components/finance/employee/employee-attendance/*.spec.ts"` once before and once after your changes (at most 5 runs). Delete the tsconfig before the commit.
- Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py` and `python scripts/e2e/guardian_56_change_integrity.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach. If the network fails, simply continue where you stopped.

5. Before finishing:
- Attendance specs pass, guardians 52 and 56 pass.
- No listed emoji remains in the html; ZWNJ count ≥ 54 (`python -c "import sys;print(open(sys.argv[1],encoding='utf-8').read().count('‌'))" <file>`).
- `git status --short` shows only files of `employee-attendance/` (plus the pre-existing `tests/playwright/tools/index.py`); the temp tsconfig is deleted.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
fix(employee): a11y, RTL and error state on the attendance page
- Short English report: what changed, test results, anything that differed or was skipped. End the turn after the commit and the report.

===

[DONE] Session 1 of 1 — Overnight fixes O4-b2: icons, touch targets, focus rings, RTL and bdi on the employee new personnel page

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/employee/employee-new-personnel/*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-new-personnel/employee-new-personnel.html --count "81:‌" --contains "<bdi" --contains "[appIcon]" --absent "👥" --absent "🚗" --absent "⚠️" --absent "💡" --absent "🔄" --absent "🔒" --absent "🛡️" --absent "💳" --absent "⭐" --absent "➕" --absent "📎" --absent "👁️" --absent "🗑️" --absent "🔍" --absent "⚡" --absent "dir-ltr" --absent "pr-8 pl-8"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-new-personnel/employee-new-personnel.ts --absent "return '📤'" --absent "return '📝'" --absent "return '⏳'" --absent "|| '🏦'"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/employee/employee-new-personnel/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(personnel): icons, touch targets, focus rings and RTL on new personnel page"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only files inside `frontend/src/app/modules/accounting/components/finance/employee/employee-new-personnel/`. No new files except a temporary tsconfig (see Tool policy) that you delete before the commit. Never edit `backend/`, `scripts/`, `tasks.md`, `tasks_history.md`, shared components, routes or any other file.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- PERSIAN HALF-SPACES: Persian text contains the zero-width non-joiner character (ZWNJ, U+200C), e.g. «پیش‌نمایش», «حساب‌ها». Keep every ZWNJ exactly as it is. Never retype existing Persian text; edit only the attributes, tags and emoji around it. The runner counts ZWNJ characters in `employee-new-personnel.html` and fails below 81. In new Persian text write a half-space as U+200C.
- Icons only as `<svg appIcon="name" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>` (or `[appIcon]="expr"` for dynamic names) with names that exist in `frontend/src/app/shared/icons/icon-registry.ts` — open it and check every name before use; if a suggested name is missing, pick the closest existing one. No inline `<svg>` with `<path>`. Decorative icons get `aria-hidden="true"`. The component must import `SvgIconDirective` if it does not already.
- Do not rename any method, input/output or field. Do not delete any test. All user-facing text stays Persian.
- Do NOT replace raw colour classes (`slate-*`, `bg-white`) with tokens in this task.
- If a real file differs from this task (line numbers, text), follow the real file and say so in the report. Skip an item only if it does not exist in the file, and say so.

2. Context:
- A static audit found plan findings ی۳۲–ی۳۳ (in `Documents/Overnight_Fixes_2026_11/plan_overnight_fixes.md`; do not edit the plan). The page uses about 60 emoji as icons, icon-only buttons of ~24px without `aria-label`, custom buttons without focus rings, physical left/right classes and codes without `bdi`. The app is Persian right-to-left; use Tailwind 3.4 logical classes.
- Line numbers are approximate.

3. Task:
- a) Emoji → icons in `employee-new-personnel.html` (examples ~lines 14, 22, 99, 133, 227, 252–268, 476, 591–655, 705–708, 777–780, 971–1019, 1197–1209, 1322–1370, 1479–1537): 👥 `users`, 🚗 `truck`, 👤 `user`, ⚠️ `alert-triangle`, 💡 `info`, 🔄 `refresh-cw`, 📋 (copy) `copy`, ✓ `check`, ✕ `x`, 🔒 `lock`, 🛡️ `shield-check`, 💳 and 🏦 `credit-card`, ⭐ `star`, ➕ `plus`, 📎 `hero-paper-clip`, 📄 `file-text`, 👁️ `eye`, 🗑️ `trash-2`, 🔍 `search`, ⚡ `zap`. Keep the Persian text next to it (use an `inline-flex items-center gap-1` wrapper when the parent is not flex). In `<option>` / `placeholder` / `title` attributes just remove the emoji and the following space.
- b) Icon mappers in `employee-new-personnel.ts`: change `getWorkflowActionIcon()` (~line 926) and `getStatusIcon()` (~line 2727) to return icon NAMES instead of glyphs: submit `send`; approve_supervisor/approve_accountant/approve_finance `check-circle`; approve_manager `star`; batch_approve `users`; revision/request_revision `undo`; reject/purge/delete/change_request_rejected `x-circle`; cancel_change_request/change_request_cancelled `slash`; auto_pass `zap`; reopen `rotate-ccw`; end_collaboration `pause`; create/change_request_created `file-pen`; default `circle` — and for getStatusIcon: draft `file-pen`; pending_* `clock`; manager_approved/approved `check`; revision_required `undo`; rejected `x`; default `circle`. (Check each in the registry; substitute the closest existing name.) Where the html renders them as text (`{{ getStatusIcon(...) }}` ~lines 1364, 1543, 1846 and `{{ getWorkflowActionIcon(...) }}` ~1878 — search for every usage), replace the text with `<svg [appIcon]="getStatusIcon(...)" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>` (same argument as before). Update the expected values in `employee-new-personnel-phase7.spec.ts` (~lines 191–194) and `employee-new-personnel.spec.ts` (~lines 519–520) to the new names — only those expected strings, nothing else. Line ~716 `shebaValidationResult.bank?.icon || '🏦'`: if `bank.icon` is an emoji/text from the server, keep showing it as text but change the fallback so that when it is empty an `credit-card` svg is shown instead (use `@if`/`*ngIf`), and remove the `'🏦'` literal from html and ts.
- c) Icon-only buttons (~lines 645, 705, 777, 850, 982, 1011, 1019, 1322, 1341, 1352, and any other `<button>` whose only content is an icon/emoji): `inline-flex items-center justify-center w-10 h-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`, `aria-label` identical to the existing `title` (add a Persian `title` + `aria-label` if both are missing, describing the action), svg icon inside. For the sheba / account copy buttons inside an input (~705, 777): place the button container at `end-1.5` and give the input `ps-3 pe-20` (keep `dir="ltr"` on the input).
- d) Focus rings: add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500` to every custom `<button>` in the html that has no `focus-visible:` class and no `appAction` attribute (e.g. the «تعیین به عنوان اصلی» button ~line 633).
- e) Clear-search button (~lines 1203–1209): `<button type="button" title="پاک کردن جستجو" aria-label="پاک کردن جستجو" class="absolute end-0 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl">` with the `x` icon (keep its `(click)`); the search icon `absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none`; input `ps-9 pe-10` instead of `pr-8 pl-8`.
- f) Physical classes: (RTL page: right = start, left = end) `mr-*`→`ms-*`, `ml-*`→`me-*`, `pr-*`→`ps-*`, `pl-*`→`pe-*`, `right-*`→`start-*`, `left-*`→`end-*`, `text-right`→`text-start`, `text-left`→`text-end`, `border-l`/`border-r` → `border-e`/`border-s`. Edit element by element, never with a global regex/sed over a file (a previous run broke a `(click)` expression containing `>`). EXCEPTIONS: elements with `dir="ltr"` keep `text-left`; anything inside a print template stays as is.
- g) `bdi`: wrap national code, phone, sheba (`formatShebaDisplay(...)`), account number and similar code interpolations (~lines 1315–1334, 1562–1590, 1713) in `<bdi dir="ltr">…</bdi>`; replace the non-existent class `dir-ltr` (~line 1334) by wrapping its content in `<bdi dir="ltr">` and removing the class.

4. Tool policy:
- Reading files is unrestricted.
- Specs: from `frontend`. An unrelated spec has a pre-existing compile error, so create a temporary `frontend/tsconfig.o4tmp.json` (INSIDE `frontend/`, not in `scratch/`):
  `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/modules/accounting/components/finance/employee/employee-new-personnel/*.spec.ts"], "exclude": [] }`
  and run `npx ng test --watch=false --ts-config tsconfig.o4tmp.json --include="src/app/modules/accounting/components/finance/employee/employee-new-personnel/*.spec.ts"` (once before your changes for the baseline, then after; at most 6 runs). Delete `frontend/tsconfig.o4tmp.json` before the commit.
- Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach.

5. Before finishing:
- All specs in the folder pass (same as the baseline), guardian 52 passes.
- No emoji listed above remains in the html; ZWNJ count of the html ≥ 81 (`python -c "import sys;print(open(sys.argv[1],encoding='utf-8').read().count('‌'))" <file>`).
- `git status --short` shows only files of the folder (plus `tests/playwright/tools/index.py` and runner files); `frontend/tsconfig.o4tmp.json` is deleted.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
fix(personnel): icons, touch targets, focus rings and RTL on new personnel page
- Short English report: what changed per file, test results, anything that differed from this task or was skipped. End the turn after the commit and the report.

===

[DONE] Session 1 of 2 — Overnight fixes O4-c1: accessibility, RTL and state fixes on accountant payroll, petty cash and new profiles pages

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/accountant/accountant-payroll/*" --allow "frontend/src/app/modules/accounting/components/finance/accountant/accountant-petty-cash/*" --allow "frontend/src/app/modules/accounting/components/finance/accountant/accountant-new-profiles/*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-payroll/accountant-payroll.html --count "38:‌" --contains "درون‌ریزی" --absent "💳" --absent "🔍"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-petty-cash/accountant-petty-cash.html --count "12:‌" --contains "<bdi" --absent "💰" --absent "💼" --absent "👔" --absent "🔍" --absent "pr-9 pl-8"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-new-profiles/accountant-new-profiles.html --count "34:‌" --contains "پرونده‌های" --contains "aria-labelledby" --absent "💼" --absent "🔄" --absent "🚚" --absent "🏦" --absent "👥" --absent "🔍"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-new-profiles/accountant-new-profiles.ts --contains "پیش‌نویس اولیه" --absent "💼" --absent "📝"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/accountant/accountant-payroll/*.spec.ts" --include "src/app/modules/accounting/components/finance/accountant/accountant-petty-cash/petty-account-manager/*.spec.ts" --include "src/app/modules/accounting/components/finance/accountant/accountant-new-profiles/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(accountant): a11y, RTL and error states on payroll, petty cash and new profiles pages"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only files inside these three folders (base `frontend/src/app/modules/accounting/components/finance/accountant/`): `accountant-payroll/`, `accountant-petty-cash/` (including its subfolders), `accountant-new-profiles/`. No new files except a temporary tsconfig (see Tool policy) that you delete before the commit. Never edit `backend/`, `scripts/`, `tasks.md`, `tasks_history.md`, shared components, routes or any other file.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- PERSIAN HALF-SPACES: Persian text contains the zero-width non-joiner character (ZWNJ, U+200C), e.g. «درون‌ریزی», «پرونده‌های», «پیش‌نویس». Keep every ZWNJ exactly as it is. Never retype existing Persian text; edit only the attributes, tags and emoji around it. The runner counts the ZWNJ characters per html file and fails if any is lost (payroll 38, petty-cash 12, new-profiles 34 — at least these numbers). In new Persian text write a half-space as U+200C.
- Icons only as `<svg appIcon="name" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>` with names that exist in `frontend/src/app/shared/icons/icon-registry.ts` (open it and check each name before use). Suggested names: `search`, `x`, `check`, `corner-up-right` or `rotate-ccw` (for ↩), `alert-triangle`, `zap`, `x-circle`, `check-circle`, `briefcase`, `user`, `users`, `refresh-cw`, `truck`, `landmark` or `building`, `credit-card`, `dollar-sign`, `wallet`. If a suggested name is missing, pick the closest existing one. No inline `<svg>` with `<path>`. Decorative icons get `aria-hidden="true"`. The component must import `SvgIconDirective` (`shared/icons/svg-icon.directive`) if it does not already.
- Do not rename any method, input/output or field used by a spec. Do not delete or weaken any existing test. All user-facing text stays Persian.
- If a real file differs from this task (line numbers, text), follow the real file and say so in the report. Skip an item only if it does not exist in the file, and say so.

2. Context:
- A static accessibility/RTL audit of the accountant pages found the items below (plan findings ی۳۵–ی۴۱ in `Documents/Overnight_Fixes_2026_11/plan_overnight_fixes.md`; do not edit the plan). The app is Persian right-to-left; Tailwind 3.4 logical classes (`start-*`, `end-*`, `ps-*`, `pe-*`, `ms-*`, `me-*`, `text-start`, `text-end`, `border-s`, `border-e`, `rounded-s-*`, `rounded-e-*`) must be used instead of physical ones in the touched elements.
- Line numbers are approximate. The payroll page is already good on dialogs (its modals ~452 and ~600 have `role="dialog"` and `onEscapeKey()`); use it as the model.
- Do NOT replace raw colour classes (`slate-*`, `bg-white`) with tokens in this task; that is a later task.

3. Task:
- a) Emoji used as icons (ی۳۵): `accountant-payroll.html` (~296 🔍, ~304 ✕, ~346 💳), `accountant-petty-cash.html` (all of ⚠ ✅ ✕ ❌ 👔 💰 💼 🔍, e.g. ~67, 73, 91, 130, 131), `accountant-new-profiles.html` (all of ↩ ⚠ ⚡ ✓ ✕ ❌ 🏦 👥 💼 🔄 🔍 🚚, e.g. ~37–41, 59, 604): replace each emoji with the matching `appIcon` svg. Keep the Persian text next to it; put icon + text in an `inline-flex items-center gap-1` wrapper when the parent is not already flex. Inside `<option>`, `placeholder`, `title` attributes and toast strings an svg is impossible: just remove the emoji and the following space. In `accountant-new-profiles.ts` (~lines 835–845) the status-label function returns strings like `'💼 در انتظار تایید حسابدار'`, `'✓ مصوب و فعال'`, `'↩️ نیازمند اصلاح'`, `'✕ رد شده'`, `'📝 پیش‌نویس اولیه'`: remove the emoji and the following space from each returned string (keep the Persian words exactly). Before that, `grep` the folders' `*.spec.ts` for these strings/emoji; if a spec asserts an old string, update only that expected string and say so in the report.
- b) Controls without an accessible name (ی۳۶): in the three html files, every `<input>`, `<select>` and `<textarea>` must have either a visible `<label>` connected by a `for`/`id` pair (ids prefixed `pay-`, `pc-`, `np-`) or an `aria-label` equal to the visible label text / the purpose in Persian (search fields: `aria-label="جستجو"` plus the placeholder meaning, e.g. `aria-label="جستجوی پرسنل"`). Checkboxes in table rows: `[attr.aria-label]="'انتخاب ' + <real row name expression>"`. Do not add `id` to elements inside `*ngFor` unless it is made unique with the row index.
- c) Dialogs in `accountant-new-profiles.html` (ی۳۷): the three overlays (~392 `isPersonnelModalOpen && editingPersonnel`, ~676 `isRejectModalOpen && rejectTarget`, ~726 `isDiffModalOpen`) already have `role="dialog" aria-modal="true"`; add `aria-labelledby="np-modal-<n>-title"` and give that id to each modal's title element. In `accountant-new-profiles.ts` add to the `@Component` a `host: { '(document:keydown.escape)': 'onGlobalEscape()' }` (or extend an existing `host` object / `@HostListener` if one exists) and an `onGlobalEscape(): void` that closes, one per key press, the open modal of highest z-order: diff, then reject, then personnel — using each modal's existing close method (find them in the ts; e.g. the methods bound to the modal's «انصراف»/close button), then `return`. Do not close a modal while a save flag for it is true (if such a flag exists, e.g. `isSaving`).
- d) Error state (ی۳۸) in `accountant-petty-cash` and `accountant-payroll`: petty-cash ts: add `loadError = '';` and in the method that loads the main list shown in the table set `this.loadError = ''` on start/success and `this.loadError = 'دریافت اطلاعات انجام نشد.'` in its `error` callback (keep the existing toast). In the html, make the existing empty state also require `!loadError` and add, next to it, an element with `role="alert"` showing `{{ loadError }}` and a `<button type="button" class="ms-2 min-h-10 px-3 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">تلاش دوباره</button>` calling the same reload method. Payroll ts ~lines 308 and 318 have empty `error: () => {}` handlers: replace each with a call to the component's existing toast/notification service showing a short Persian error (e.g. `'دریافت اطلاعات انجام نشد.'`) — use the same service/method the file already uses for other errors; if the file has none, leave these two handlers unchanged and say so.
- e) Icon-only buttons (ی۳۹): petty-cash clear-search button (~71) and the same in payroll and new-profiles search boxes: `<button type="button" title="پاک کردن جستجو" aria-label="پاک کردن جستجو" class="absolute end-0 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl">` with the `x` icon; the search icon at `start-3` (`absolute top-1/2 -translate-y-1/2 pointer-events-none`); input padding `ps-9 pe-10` instead of `pr-9 pl-8` etc. Keep the existing `(click)` handler. Every other icon-only `<button>` in the three html files: `aria-label` equal to its `title` (add a short Persian one if none), at least `min-w-10 min-h-10 inline-flex items-center justify-center`. Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500` to every custom `<button>` in the three html files that has no `focus-visible:` class and no `appAction` attribute.
- f) Physical RTL classes (ی۴۰) in the three html files and their css: (RTL page: right = start, left = end) `mr-*`→`ms-*`, `ml-*`→`me-*`, `pr-*`→`ps-*`, `pl-*`→`pe-*`, `right-*`→`start-*`, `left-*`→`end-*`, `text-right`→`text-start`, `text-left`→`text-end`, `border-l`→`border-e`, `border-r`→`border-s`, `rounded-l*`→`rounded-e*`, `rounded-r*`→`rounded-s*`; in css `margin-left`→`margin-inline-end` etc. Edit element by element, never with a global regex/sed over a file (a previous run broke a `(click)` expression containing `>`). EXCEPTIONS (leave unchanged): elements with `dir="ltr"` (sheba, account, numeric LTR inputs) and their children, print-only blocks (`print:` classes or a print sheet), and symmetric pairs (`left-3 right-3`, `inset-x-*`).
- g) Codes without `bdi` (ی۴۱): in petty-cash and new-profiles, wrap interpolations of national code, phone, sheba/IBAN (including the `IR` prefix), account number and card number in `<bdi dir="ltr">…</bdi>` (skip ones already inside `dir="ltr"` or `bdi`).

4. Tool policy:
- Reading files is unrestricted.
- Specs: from `frontend`. An unrelated spec has a pre-existing compile error, so create a temporary `frontend/tsconfig.o4tmp.json` (INSIDE `frontend/`, not in `scratch/`; if it already exists, overwrite it):
  `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/modules/accounting/components/finance/accountant/accountant-payroll/*.spec.ts", "src/app/modules/accounting/components/finance/accountant/accountant-petty-cash/petty-account-manager/*.spec.ts", "src/app/modules/accounting/components/finance/accountant/accountant-new-profiles/*.spec.ts"], "exclude": [] }`
  and run `npx ng test --watch=false --ts-config tsconfig.o4tmp.json --include="src/app/modules/accounting/components/finance/accountant/accountant-payroll/*.spec.ts" --include="src/app/modules/accounting/components/finance/accountant/accountant-petty-cash/petty-account-manager/*.spec.ts" --include="src/app/modules/accounting/components/finance/accountant/accountant-new-profiles/*.spec.ts"` (once BEFORE your changes for the baseline, then after; at most 6 runs in total). Delete `frontend/tsconfig.o4tmp.json` before the commit.
- Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach.

5. Before finishing:
- All specs in the three folders pass (same as the baseline), guardian 52 passes.
- In the touched html files: no emoji listed above remains; the ZWNJ count of each html is not lower than the numbers in Critical rules (check with `python -c "import sys;print(open(sys.argv[1],encoding='utf-8').read().count('‌'))" <file>`).
- `git status --short` shows only files of the three folders (plus the pre-existing `tests/playwright/tools/index.py` and runner files) before the commit; `frontend/tsconfig.o4tmp.json` is deleted.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
fix(accountant): a11y, RTL and error states on payroll, petty cash and new profiles pages
- Short English report: what changed per file, test results, anything that differed from this task or was skipped. End the turn after the commit and the report.

===

[DONE] Session 2 of 2 — Overnight fixes O4-c2: accessibility, RTL and state fixes on accountant personnel, fleet and diskettes pages

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/accountant/accountant-personnel/*" --allow "frontend/src/app/modules/accounting/components/finance/accountant/accountant-fleet/*" --allow "frontend/src/app/modules/accounting/components/finance/accountant/accountant-diskettes/*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-personnel/accountant-personnel.html --count "21:‌" --contains "صفحه‌بندی" --contains "aria-labelledby" --contains "<bdi" --contains "role=\"alert\""
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-fleet/accountant-fleet.html --count "33:‌" --contains "هم‌تیپ" --contains "<bdi" --contains "role=\"alert\"" --absent "pr-8 pl-6"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/accountant/accountant-diskettes/accountant-diskettes.html --count "23:‌" --contains "فایل‌های" --contains "role=\"alert\""
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/accountant/accountant-personnel/*.spec.ts" --include "src/app/modules/accounting/components/finance/accountant/accountant-fleet/*.spec.ts" --include "src/app/modules/accounting/components/finance/accountant/accountant-diskettes/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(accountant): a11y, RTL and error states on personnel, fleet and diskettes pages"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only files inside these three folders (base `frontend/src/app/modules/accounting/components/finance/accountant/`): `accountant-personnel/`, `accountant-fleet/`, `accountant-diskettes/`. No new files except a temporary tsconfig (see Tool policy) that you delete before the commit. Never edit `backend/`, `scripts/`, `tasks.md`, `tasks_history.md`, shared components, routes or any other file.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- PERSIAN HALF-SPACES: Persian text contains the zero-width non-joiner character (ZWNJ, U+200C), e.g. «صفحه‌بندی», «هم‌تیپ», «فایل‌های». Keep every ZWNJ exactly as it is. Never retype existing Persian text; edit only the attributes, tags and classes around it. The runner counts the ZWNJ characters per html file and fails if any is lost (personnel 21, fleet 33, diskettes 23 — at least these numbers). In new Persian text write a half-space as U+200C.
- Icons only as `<svg appIcon="name" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>` with names that exist in `frontend/src/app/shared/icons/icon-registry.ts`. No inline `<svg>` with `<path>`.
- Do not rename any method, input/output or field used by a spec. Do not delete or weaken any existing test. All user-facing text stays Persian.
- If a real file differs from this task (line numbers, text), follow the real file and say so in the report. Skip an item only if it does not exist in the file, and say so.

2. Context:
- Same audit as session 1 (plan findings ی۳۶–ی۴۱; do not edit the plan). These three pages have no emoji. The accountant fleet page already has one compliant dialog (the approval modal ~945 with `role="dialog" aria-modal="true" aria-labelledby="acc-fleet-approve-title"` and `onApprovalEscape()` in the `host` at ~line 47 of `accountant-fleet.ts`); use it as the model.
- Line numbers are approximate. Do NOT replace raw colour classes (`slate-*`, `bg-white`) with tokens.

3. Task:
- a) Controls without an accessible name (ی۳۶): in the three html files, every `<input>`, `<select>` and `<textarea>` must have either a visible `<label>` connected by a `for`/`id` pair (ids prefixed `ap-`, `af-`, `ad-`) or an `aria-label` equal to the visible label text / the purpose in Persian (e.g. personnel ~12, ~35, modal fields ~498–548). Checkboxes in table rows: `[attr.aria-label]="'انتخاب ' + <real row name expression>"`. Ids inside `*ngFor` must include the row index.
- b) Dialogs (ی۳۷): `accountant-personnel.html` overlays ~460 (`isPersonnelModalOpen`) and ~843 (`isDiffModalOpen`); `accountant-fleet.html` overlays ~585 (`isVehicleModalOpen && editingVehicle`), ~799 (`isRejectModalOpen`), ~843 (`isBatchApprovalModalOpen`), ~887 (`isDiffModalOpen`). On the inner panel (or the overlay, as the fleet approval modal does) add `role="dialog" aria-modal="true" aria-labelledby="<id>"` and give the modal's title element that id (`ap-modal-<n>-title`, `af-modal-<n>-title`). Escape: in `accountant-fleet.ts` extend `onApprovalEscape()` (~line 678) so that, when the approval modal is not open, it closes one other open modal per key press in this order: diff, batch approval, reject, vehicle — using each modal's existing close method (the method bound to its close/«انصراف» button), not while that modal's saving flag is true, then `return`. In `accountant-personnel.ts` add `host: { '(document:keydown.escape)': 'onGlobalEscape()' }` to the `@Component` (merge into an existing `host` if present) and `onGlobalEscape(): void` closing diff, then personnel modal, the same way. Backdrop divs with `(click)` that only close a modal get `aria-hidden="true"`.
- c) Error state (ی۳۸): in `accountant-fleet.ts` (main list loader ~line 161 `loadAllVehiclesPage`, which swallows errors other than 404), `accountant-personnel.ts` (main list loader ~383/429), `accountant-diskettes.ts` (~207): add `loadError = '';` if not present, set `this.loadError = ''` at the start/success of the main list fetch and `this.loadError = 'دریافت اطلاعات انجام نشد.'` in its error path (keep the existing 404 handling; a 404 that means «empty» is not an error). In each html, make the existing empty state of that main list also require `!loadError` and add, next to it, an element with `role="alert"` showing `{{ loadError }}` and a `<button type="button" class="ms-2 min-h-10 px-3 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">تلاش دوباره</button>` calling the same reload method. Empty `error: () => {}` handlers in these three ts files (fleet ~305, personnel ~260, 398, 404, diskettes ~161, 171): replace each with a call to the toast/notification service the file already uses, showing a short Persian error (e.g. `'دریافت اطلاعات انجام نشد.'`); if the file has none, leave them and say so.
- d) Icon-only buttons (ی۳۹): fleet copy buttons (~205 plate, ~223 sheba) and every other icon-only `<button>` in the three html files: `aria-label` equal to its `title` (add a short Persian one if none), `min-w-10 min-h-10 inline-flex items-center justify-center`. Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500` to every custom `<button>` in the three html files that has no `focus-visible:` class and no `appAction` attribute.
- e) Physical RTL classes (ی۴۰) in the three html files and their css: (RTL page: right = start, left = end) `mr-*`→`ms-*`, `ml-*`→`me-*`, `pr-*`→`ps-*`, `pl-*`→`pe-*`, `right-*`→`start-*`, `left-*`→`end-*`, `text-right`→`text-start`, `text-left`→`text-end`, `border-l`→`border-e`, `border-r`→`border-s`, `rounded-l*`→`rounded-e*`, `rounded-r*`→`rounded-s*` (fleet ~67 places, e.g. ~80 `pr-8 pl-6`, tables ~170, 430, 476, 538 `text-right`). Edit element by element, never with a global regex/sed over a file (a previous run broke a `(click)` expression containing `>`). EXCEPTIONS (leave unchanged): elements with `dir="ltr"` and their children, print-only blocks, symmetric pairs (`left-3 right-3`, `inset-x-*`).
- f) Codes without `bdi` (ی۴۱): fleet plate (~201, ~296), sheba with its `IR` prefix (~222, ~324); personnel phone (~113), sheba (~147, ~245); diskettes account/sheba/national code cells if any: wrap in `<bdi dir="ltr">…</bdi>` (skip ones already inside `dir="ltr"` or `bdi`).

4. Tool policy:
- Reading files is unrestricted.
- Specs: from `frontend`. Create a temporary `frontend/tsconfig.o4tmp.json` (INSIDE `frontend/`; overwrite if it exists):
  `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/modules/accounting/components/finance/accountant/accountant-personnel/*.spec.ts", "src/app/modules/accounting/components/finance/accountant/accountant-fleet/*.spec.ts", "src/app/modules/accounting/components/finance/accountant/accountant-diskettes/*.spec.ts"], "exclude": [] }`
  and run `npx ng test --watch=false --ts-config tsconfig.o4tmp.json --include="src/app/modules/accounting/components/finance/accountant/accountant-personnel/*.spec.ts" --include="src/app/modules/accounting/components/finance/accountant/accountant-fleet/*.spec.ts" --include="src/app/modules/accounting/components/finance/accountant/accountant-diskettes/*.spec.ts"` (once BEFORE your changes for the baseline, then after; at most 6 runs). Delete `frontend/tsconfig.o4tmp.json` before the commit.
- Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach.

5. Before finishing:
- All specs in the three folders pass (same as the baseline), guardian 52 passes.
- ZWNJ count of each html is not lower than the numbers in Critical rules.
- `git status --short` shows only files of the three folders (plus the pre-existing `tests/playwright/tools/index.py` and runner files) before the commit; `frontend/tsconfig.o4tmp.json` is deleted.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
fix(accountant): a11y, RTL and error states on personnel, fleet and diskettes pages
- Short English report: what changed per file, test results, anything that differed from this task or was skipped. End the turn after the commit and the report.

===

[DONE] Session 1 of 2 — Overnight fixes O4-d1: accessibility, RTL and error states on manager fleet and manager personnel pages

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/manager/manager-fleet/*" --allow "frontend/src/app/modules/accounting/components/finance/manager/manager-personnel/*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/manager/manager-fleet/manager-fleet.html --count "30:‌" --contains "aria-labelledby" --contains "<bdi" --contains "role=\"alert\"" --absent "pr-8 pl-6"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/manager/manager-personnel/manager-personnel.html --count "30:‌" --contains "پرونده‌های" --contains "<bdi" --contains "role=\"alert\"" --absent "🔍" --absent "📜" --absent "👑" --absent "📊" --absent "💡" --absent "⚠" --absent "pr-8 pl-6"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/manager/manager-fleet/*.spec.ts" --include "src/app/modules/accounting/components/finance/manager/manager-personnel/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(manager): a11y, RTL and error states on fleet and personnel pages"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only files inside these two folders (base `frontend/src/app/modules/accounting/components/finance/manager/`): `manager-fleet/`, `manager-personnel/`. No new files except a temporary tsconfig (see Tool policy) that you delete before the commit. Never edit `backend/`, `scripts/`, `tasks.md`, `tasks_history.md`, shared components, routes or any other file.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- PERSIAN HALF-SPACES: Persian text contains the zero-width non-joiner character (ZWNJ, U+200C), e.g. «پرونده‌های», «صفحه‌بندی», «فقط‌خواندنی». Keep every ZWNJ exactly as it is. Never retype existing Persian text; edit only the attributes, tags, classes and emoji around it. The runner counts the ZWNJ characters per html file and fails if any is lost (manager-fleet.html 30, manager-personnel.html 30 — at least these numbers). In new Persian text write a half-space as U+200C.
- Icons only as `<svg appIcon="name" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>` with names that exist in `frontend/src/app/shared/icons/icon-registry.ts`. Names to use: 🔍 `search`, ✕ `x`, 📜 `file-text`, 👑 `crown`, 📊 `bar-chart-2`, 💡 `info`, ⚠️ `alert-triangle`. No inline `<svg>` with `<path>`. The component must import `SvgIconDirective` (`shared/icons/svg-icon.directive`) if it does not already.
- Do not rename any method, input/output or field used by a spec. Do not delete or weaken any existing test. All user-facing text stays Persian.
- If a real file differs from this task (line numbers, text), follow the real file and say so in the report. Skip an item only if it does not exist in the file, and say so.

2. Context:
- A static accessibility/RTL audit of the manager pages found the items below (plan findings ی۴۲–ی۴۸ in `Documents/Overnight_Fixes_2026_11/plan_overnight_fixes.md`; do not edit the plan). The app is Persian right-to-left; Tailwind 3.4 logical classes (`start-*`, `end-*`, `ps-*`, `pe-*`, `ms-*`, `me-*`, `text-start`, `text-end`, `border-s`, `border-e`, `rounded-s-*`, `rounded-e-*`) must be used instead of physical ones.
- Line numbers are approximate. `manager-personnel.html` ~473 already has a compliant dialog (`role="dialog" aria-modal="true" aria-labelledby`); use it as the model.
- Do NOT replace raw colour classes (`slate-*`, `bg-white`) with tokens in this task.

3. Task:
- a) Emoji (ی۴۲) in `manager-personnel.html` (~40 🔍, ~41 ✕, ~151 📜, ~351 👑, ~361 📊, ~544 💡, ~567 ⚠️, and any other emoji in the two html/ts files except box-drawing `─` and `◀`): replace with the matching `appIcon` svg; keep the Persian text next to it in an `inline-flex items-center gap-1` wrapper when the parent is not flex. Inside `<option>`, `placeholder`, `title` and toast strings just remove the emoji and the following space. First grep the folders' `*.spec.ts` for any string you change; if a spec asserts it, update only that expected string and say so.
- b) Controls without an accessible name (ی۴۳): `manager-fleet.html` section select ~12 (`aria-label="بخش فعال"`), month select ~35 (`aria-label="ماه"`), search input ~44 (`aria-label="جستجو"`), radios ~499/504 (wrap them in a `role="radiogroup"` with `aria-label` equal to the question text shown above them, and give each radio an `aria-label` equal to its visible option text if it is not inside a `<label>`), textareas ~451, ~512, ~616 and input ~606 (`aria-label` equal to the visible label text near them). `manager-personnel.html` section select ~12 and search input ~34 the same way. Any other `<input>/<select>/<textarea>` in the two html files without a `<label for>`/`id` pair or `aria-label` gets an `aria-label` with its purpose in Persian. Ids inside `*ngFor` must include the row index.
- c) Dialogs (ی۴۴): `manager-fleet.html` overlays ~374, ~479, ~541, ~585, ~655 and `manager-personnel.html` overlays ~347, ~430, ~516: on the inner panel add `role="dialog" aria-modal="true" aria-labelledby="<id>"` and give the modal's title element that id (`mf-modal-<n>-title`, `mp-modal-<n>-title`). Backdrop divs whose `(click)` only closes a modal get `aria-hidden="true"`. Escape: in each ts add to the `@Component` `host: { '(document:keydown.escape)': 'onGlobalEscape()' }` (merge into an existing `host`/`@HostListener` if present) and `onGlobalEscape(): void` that closes, one per key press, the open modal shown last in the html (highest in the file order = last checked first), using each modal's existing close method (the one bound to its close/«انصراف» button), not while that modal's saving/submitting flag is true, then `return`. In personnel include the modal at ~473 too.
- d) Error state (ی۴۵): `manager-fleet.ts` loaders ~249 (sections), ~300 (vehicles), ~318 (settlement), ~331 (change requests) and `manager-personnel.ts` ~186, ~222, ~382, ~393: add `loadError = '';` and, for the MAIN list of each page (fleet: vehicles; personnel: the main personnel list loader), set `this.loadError = ''` at start/success and `this.loadError = 'دریافت اطلاعات انجام نشد.'` in its error callback; do not clear an already loaded list on error. In the html make that list's empty state also require `!loadError` and add next to it an element with `role="alert"` showing `{{ loadError }}` and a `<button type="button" class="ms-2 min-h-10 px-3 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">تلاش دوباره</button>` calling the same reload method. For the other loaders listed (and every `error: () => {}` in the two ts files) call the toast/notification service the file already uses with a short Persian error (e.g. `'دریافت اطلاعات انجام نشد.'`); if the file has none, inject nothing and say so. In `manager-fleet.ts` ~318/~331 also call `this.cdr.detectChanges()` after resetting state if the file uses `cdr` elsewhere. In `manager-fleet.html` make the empty states of the settlement and change-request tables also require `!isLoading`.
- e) Icon-only buttons (ی۴۶): the clear-search buttons in both pages: `<button type="button" title="پاک کردن جستجو" aria-label="پاک کردن جستجو" class="absolute end-0 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl">` with the `x` icon; search icon `absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none`; input padding `ps-8 pe-10` instead of `pr-8 pl-6`. Keep the existing `(click)`. Every other icon-only `<button>` in the two html files: `aria-label` equal to its `title` (add a short Persian one if none) and `min-w-10 min-h-10 inline-flex items-center justify-center`. Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500` to every custom `<button>` that has no `focus-visible:` class and no `appAction` attribute.
- f) Physical RTL classes (ی۴۷) in the two html files and their css: (RTL page: right = start, left = end) `mr-*`→`ms-*`, `ml-*`→`me-*`, `pr-*`→`ps-*`, `pl-*`→`pe-*`, `right-*`→`start-*`, `left-*`→`end-*`, `text-right`→`text-start`, `text-left`→`text-end`, `border-l`→`border-e`, `border-r`→`border-s`, `rounded-l*`→`rounded-e*`, `rounded-r*`→`rounded-s*`; css `margin-left`→`margin-inline-end` etc. Edit element by element, never with a global regex/sed over a file (a previous run broke a `(click)` expression containing `>`). EXCEPTIONS: elements with `dir="ltr"` and their children, print-only blocks, symmetric pairs (`left-3 right-3`, `inset-x-*`).
- g) Codes without `bdi` (ی۴۸): `manager-fleet.html` plate numbers (~109, ~206, ~256, ~331, ~545, ~590) and `manager-personnel.html` sheba (~110, ~292) and any national code/phone interpolation: wrap the interpolation in `<bdi dir="ltr">…</bdi>` (skip ones already inside a `bdi`).

4. Tool policy:
- Reading files is unrestricted.
- Specs: from `frontend`. Create a temporary `frontend/tsconfig.o4tmp.json` (INSIDE `frontend/`; overwrite if it exists):
  `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/modules/accounting/components/finance/manager/manager-fleet/*.spec.ts", "src/app/modules/accounting/components/finance/manager/manager-personnel/*.spec.ts"], "exclude": [] }`
  and run `npx ng test --watch=false --ts-config tsconfig.o4tmp.json --include="src/app/modules/accounting/components/finance/manager/manager-fleet/*.spec.ts" --include="src/app/modules/accounting/components/finance/manager/manager-personnel/*.spec.ts"` (once BEFORE your changes for the baseline, then after; at most 6 runs). Delete `frontend/tsconfig.o4tmp.json` before the commit.
- Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach.

5. Before finishing:
- All specs in the two folders pass (same as the baseline), guardian 52 passes.
- ZWNJ count of each html is not lower than the numbers in Critical rules (check with `python -c "import sys;print(open(sys.argv[1],encoding='utf-8').read().count('‌'))" <file>`).
- `git status --short` shows only files of the two folders (plus the pre-existing `tests/playwright/tools/index.py` and runner files) before the commit; `frontend/tsconfig.o4tmp.json` is deleted.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
fix(manager): a11y, RTL and error states on fleet and personnel pages
- Short English report: what changed per file, test results, anything that differed from this task or was skipped. End the turn after the commit and the report.

===

[DONE] Session 2 of 2 — Overnight fixes O4-d2: accessibility, RTL and icon fixes on counterparties and manager reports pages

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/counterparties/*" --allow "frontend/src/app/modules/accounting/components/finance/manager/manager-reports/*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/counterparties/counterparties.html --count "53:‌" --contains "<bdi" --contains "aria-labelledby" --absent "✏" --absent "🔍" --absent "ℹ" --absent "⚠"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/counterparties/counterparty-form/counterparty-form-fields.component.html --count "3:‌" --absent "🏦" --absent "✓"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/counterparties/counterparty-form/counterparty-form-fields.component.ts --count "2:‌" --absent "⛽" --absent "🏢" --absent "🔧" --absent "🚚"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/manager/manager-reports/manager-reports.html --count "14:‌" --contains "گروه‌بندی"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/counterparties/*.spec.ts" --include "src/app/modules/accounting/components/finance/manager/manager-reports/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(counterparties): a11y, RTL and icons on counterparties and manager reports pages"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only files inside these folders (base `frontend/src/app/modules/accounting/components/finance/`): `counterparties/` (including `counterparty-form/`) and `manager/manager-reports/`. No new files except a temporary tsconfig that you delete before the commit. Never edit `backend/`, `scripts/`, `tasks.md`, `tasks_history.md`, shared components, routes or any other file.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- PERSIAN HALF-SPACES: keep every ZWNJ (U+200C) exactly, e.g. «طرف‌حساب», «گروه‌بندی». Never retype existing Persian text. The runner fails if the ZWNJ count drops (counterparties.html 53, counterparty-form-fields.component.html 3, counterparty-form-fields.component.ts 2, manager-reports.html 14 — at least these). Also keep the ZWNJ count of `counterparties.ts` (49) and `manager-reports.ts` (20).
- Icons only as `<svg appIcon="name" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>` with names that exist in `frontend/src/app/shared/icons/icon-registry.ts`. Names to use: ✏️ `edit`, 🔍 `search`, ✕ `x`, ⚠️ `alert-triangle`, ℹ️ `info`, ✓ `check`, 🏦 `building`, ⛽ `droplet`, 🏗 `tool`, 🏢 `building`, 🔧 `tool`, 🚚 `truck`. No inline `<svg>` with `<path>`. Import `SvgIconDirective` (`shared/icons/svg-icon.directive`) in each component that renders one, if not already.
- Do not rename any method, input/output or field used by a spec. Do not delete or weaken any existing test. All user-facing text stays Persian.
- If a real file differs from this task, follow the real file and say so in the report. Skip an item only if it does not exist, and say so.

2. Context:
- Same audit as session 1 (plan findings ی۴۲–ی۴۸; do not edit the plan). Line numbers are approximate. Do NOT replace raw colour classes with tokens.

3. Task:
- a) Emoji (ی۴۲): `counterparties.html` ~50 ✏️, ~227 🔍 (inside the search `placeholder`: remove it from the placeholder and add a `search` svg overlay `absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none`), ~238 ✕, ~454 ⚠️/ℹ️ (confirm modal). `counterparty-form-fields.component.html` ~131 ✓, ~244 ✕, ~234 `bank?.icon || '🏦'`: render the `building` svg instead of the emoji fallback (keep showing `bank.icon` only if it is an image URL the file already renders as `<img>`; otherwise always the svg). `counterparty-form-fields.component.ts`: the counterparty-type option list has emoji (⛽ 🏗 🏢 🔧 🚚): replace each emoji value with an `iconName` field holding the matching registry name (rename the property only if no spec or other file reads it — grep first; if it is read elsewhere, keep the property name and just change its values to icon names) and render it in the html with `<svg [appIcon]="t.iconName" …>` (check how `SvgIconDirective` takes a bound name — open `shared/icons/svg-icon.directive.ts`). Emoji inside `<option>` text: just remove it.
- b) Accessible names (ی۴۳) in `counterparties.html`: status select ~201 `aria-label="فیلتر وضعیت"`, search ~223 `aria-label="جستجوی طرف‌حساب"` (write the half-space as U+200C), and any other control without `<label for>`/`aria-label`. In `manager-reports.html` the same check (most already have ids).
- c) Dialog (ی۴۴): `counterparties.html` confirm modal ~451: `role="alertdialog" aria-modal="true" aria-labelledby="cp-confirm-title"` on the panel and that id on its title. Escape: in `counterparties.ts` add a `host` `(document:keydown.escape)` handler (merge into an existing one if present) that closes the confirm modal via its existing cancel method when it is open and not busy; if the page has other overlays, close them too in reverse file order, one per key press, the same way.
- d) Error state (ی۴۵) in `manager-reports.ts` ~298/302/306: the filter lists (`companies`, `projects`, `sections`) silently become `[]` on error. Add `filtersError = false;`, set it `true` in those error callbacks (keep the `[]`), and in `manager-reports.html` under the filter row add `<p *ngIf="filtersError" role="alert" class="text-xs text-rose-600 mt-1">بارگذاری فهرست فیلترها انجام نشد.</p>` (use `@if` if the file uses the new control flow).
- e) Icon-only buttons (ی۴۶): the counterparties clear-search button ~238: `type="button" title="پاک کردن جستجو" aria-label="پاک کردن جستجو"`, `absolute end-0 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl`, `x` icon; input padding `ps-9 pe-10` instead of `pr-3 pl-8`. Every other icon-only `<button>` in the touched html files: `aria-label` equal to its `title` (add a short Persian one if none), `min-w-10 min-h-10 inline-flex items-center justify-center`. Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500` to every custom `<button>` without a `focus-visible:` class and without `appAction`.
- f) Physical RTL classes (ی۴۷) in `counterparties.html`, `counterparty-form-fields.component.html`, `manager-reports.html` and their css (same mapping as always: `mr→me`, `ml→ms`, `pr→pe`, `pl→ps`, `right→end`, `left→start`, `text-right→text-start`, `text-left→text-end`, `border-l/r→border-s/e`, `rounded-l/r→rounded-s/e`). Edit element by element, never with a global regex/sed over a file (a previous run broke a `(click)` expression containing `>`). EXCEPTIONS: `dir="ltr"` elements and their children, print-only blocks, symmetric pairs.
- g) Codes without `bdi` (ی۴۸) in `counterparties.html` ~286, 287, 291, 308, 403, 420, 424, 429 (national id, phone, sheba with its `IR` prefix, account number): wrap the interpolation in `<bdi dir="ltr">…</bdi>`; remove the non-existent class `dir-ltr` where you add the `bdi`.

4. Tool policy:
- Reading files is unrestricted.
- Specs: from `frontend`. Temporary `frontend/tsconfig.o4tmp.json` (INSIDE `frontend/`; overwrite if it exists):
  `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/modules/accounting/components/finance/counterparties/*.spec.ts", "src/app/modules/accounting/components/finance/manager/manager-reports/*.spec.ts"], "exclude": [] }`
  and run `npx ng test --watch=false --ts-config tsconfig.o4tmp.json --include="src/app/modules/accounting/components/finance/counterparties/*.spec.ts" --include="src/app/modules/accounting/components/finance/manager/manager-reports/*.spec.ts"` (once before your changes, then after; at most 6 runs). Delete `frontend/tsconfig.o4tmp.json` before the commit.
- Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach.

5. Before finishing:
- All specs in the two folders pass (same as the baseline), guardian 52 passes.
- ZWNJ counts not lower than in Critical rules.
- `git status --short` shows only files of the allowed folders (plus the pre-existing `tests/playwright/tools/index.py` and runner files) before the commit; `frontend/tsconfig.o4tmp.json` is deleted.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
fix(counterparties): a11y, RTL and icons on counterparties and manager reports pages
- Short English report: what changed per file, test results, anything that differed or was skipped. End the turn after the commit and the report.

===

[DONE] Session 1 of 2 — Overnight fixes O5-a1: search, error handling and fake buttons on supervisor new profiles, invoices, petty cash and attendance pages

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-new-profiles/*" --allow "frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-invoices/*" --allow "frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-petty-cash/*" --allow "frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-attendance/*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-new-profiles/supervisor-new-profiles.html --count "39:‌" --contains "persianDate" --absent "keyup.enter)=\"syncUrlParams()\""
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-new-profiles/supervisor-new-profiles.ts --count "24:‌" --absent "err.message"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-invoices/supervisor-invoices.html --count "16:‌" --absent "keyup.enter)=\"syncUrlParams()\"" --absent "importExcel"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-invoices/supervisor-invoices.ts --count "6:‌" --absent "err.message" --absent "importExcel"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-petty-cash/supervisor-petty-cash.html --count "14:‌" --absent "keyup.enter)=\"syncUrlParams()\"" --absent "importExcel"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-petty-cash/supervisor-petty-cash.ts --count "17:‌" --absent "err.message" --absent "importExcel"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-attendance/supervisor-attendance.html --count "13:‌" --absent "importExcel" --absent "exportExcel"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-attendance/supervisor-attendance.ts --count "7:‌" --absent "err.message"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/supervisor/supervisor-new-profiles/*.spec.ts" --include "src/app/modules/accounting/components/finance/supervisor/supervisor-invoices/*.spec.ts" --include "src/app/modules/accounting/components/finance/supervisor/supervisor-petty-cash/*.spec.ts" --include "src/app/modules/accounting/components/finance/supervisor/supervisor-attendance/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD --allow-removed importExcel,exportExcel
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(supervisor): working search, Persian errors and no fake excel buttons"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only files inside these four folders (base `frontend/src/app/modules/accounting/components/finance/supervisor/`): `supervisor-new-profiles/`, `supervisor-invoices/`, `supervisor-petty-cash/`, `supervisor-attendance/`. No new files except a temporary tsconfig (see Tool policy) that you delete before the commit. Never edit `backend/`, `scripts/`, `tasks.md`, `tasks_history.md`, shared files, API services, routes or any other file.
- In `supervisor-attendance.ts` change ONLY what item e) and item f) say. Do not touch `approveBatch`, `approveSingle` or any approve/return logic (another fix will change them later).
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- PERSIAN HALF-SPACES: Persian text contains the zero-width non-joiner character (ZWNJ, U+200C), e.g. «پرونده‌های», «فاکتورها», «تن‌خواه». Keep every ZWNJ exactly as it is. Never retype existing Persian text. The runner counts ZWNJ per file and fails if any is lost (see the numbers in the runner comment above; these are minimums). In new Persian text write a half-space as U+200C.
- Do not rename any method, input/output or field used by a spec. Do not delete or weaken any existing test, except that a spec test which only asserts the toast of a removed fake `importExcel`/`exportExcel` method may be removed (say so in the report). All user-facing text stays Persian.
- If a real file differs from this task (line numbers, text), follow the real file and say so in the report. Skip an item only if it does not exist in the file, and say so.

2. Context:
- A static logic audit found these items (plan findings ی۵۳, ی۵۴, ی۵۵, ی۵۶, ی۵۷, ی۵۸ in `Documents/Overnight_Fixes_2026_11/plan_overnight_fixes.md`; do not edit the plan). Line numbers are approximate.
- Shared error helper that already exists: `attendanceActionErrorMessage(err, fallback)` exported from `frontend/src/app/modules/accounting/attendance-period-error.ts`. It maps 403/404 and the server `error`/`detail` fields to Persian and never shows `err.message`. Import it with the correct relative path.
- Shared date pipe: `PersianDatePipe` (`name: 'persianDate'`) in `frontend/src/app/shared/pipes/persian-date.pipe.ts`; usage `{{ value | persianDate:'short-time' }}`. Add it to the component `imports` if missing.

3. Task:
- a) Search on Enter does nothing (ی۵۳). In `supervisor-new-profiles.html` ~66, `supervisor-invoices.html` ~64 and `supervisor-petty-cash.html` ~59 the search input has `(keyup.enter)="syncUrlParams()"`, which only changes the URL; the list is never fetched with the new search. In each ts add a method `onSearch(): void` that resets the current page to 1 (look at how the file stores the page, e.g. `this.pages`/`this.currentPage`, and reset the same way the tab-change method does), then calls `this.syncUrlParams()` and then the file's list fetch method (`fetchProfiles()` / `fetchInvoices()` / `fetchPettyCash()` — use the real names). Bind `(keyup.enter)="onSearch()"`. Make sure the fetch method sends `this.searchQuery` as the `search` param (it should already; if not, add it in the same way other params are sent). In `supervisor-new-profiles.ts` `clearSearch()` must also reset the page and call the fetch method (as the other two files already do).
- b) Silent errors (ی۵۴) in `supervisor-new-profiles.ts` ~273-317: the four loaders (profiles, vehicles, change requests, and any other in `fetchProfiles`/its siblings) have empty or missing error handlers and `isLoading` is cleared only by the first one. Add `loadError = '';`. In every error callback: set `this.loadError = 'دریافت اطلاعات انجام نشد.'` and show a toast with the toast service the file already uses (same message). Do not clear lists that were already loaded. Clear `isLoading` only when all requests of that load have finished (simplest: a local counter `let pending = N;` decremented in both `next` and `error`, or `forkJoin` + `finalize` if it is cleaner — your choice, keep the same requests). In the html show, above the tabs content, `<p *ngIf="loadError" role="alert" class="text-sm text-rose-700 my-2">{{ loadError }} <button type="button" class="ms-2 min-h-10 px-3 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" (click)="fetchProfiles()">تلاش دوباره</button></p>` (use the real fetch method name; use `@if` instead of `*ngIf` if the file uses the new control flow) and set `loadError = ''` at the start of each load.
- c) Fixed return reason (ی۵۵) in `supervisor-new-profiles.ts` ~383-391 `rejectVehicle()` sends a hard-coded reason and asks nothing. Change it to open the SAME reason dialog the file already uses for `rejectVehicleChange` (or for profile rejection), and send the reason the user typed. Disable the dialog's confirm button while the reason is empty or while saving. If the existing dialog is tied to one target type, add a small target-type field to it instead of duplicating the html.
- d) Gregorian dates (ی۵۶) in `supervisor-new-profiles.html` ~285 and ~379: `cr.created_at | date:'yyyy/MM/dd HH:mm'` → `cr.created_at | persianDate:'short-time'`. Check all four html files for any other Angular `| date` pipe on a date shown to the user and convert it the same way.
- e) Raw English error text (ی۵۷): in all four ts files replace every `err.error?.error || err.message || 'نامشخص'`-like expression (any expression that can show `err.message` or `error.message` from an HttpErrorResponse to the user) with `attendanceActionErrorMessage(err, '<the Persian fallback that the toast already uses, or «انجام نشد؛ دوباره تلاش کنید.»>')`. Keep the existing Persian prefix of each toast if it reads well, e.g. `'خطا در تایید: ' + attendanceActionErrorMessage(err, 'نامشخص')` is NOT allowed — use only the helper's result as the message, with the old prefix text as the fallback.
- f) Fake excel buttons (ی۵۸): these methods only show an info toast and do nothing real: `supervisor-invoices.ts` `importExcel()` ~329, `supervisor-petty-cash.ts` `importExcel()` ~290, `supervisor-attendance.ts` `exportExcel()` ~363 and `importExcel()` ~367. Remove each such method AND its button in the html (`supervisor-invoices.html` ~43, `supervisor-petty-cash.html` ~39, `supervisor-attendance.html` ~45 and ~52). Keep the real `exportExcel()` of invoices and petty cash (they download from the server). Before removing, open the method: if it does anything real (an HTTP call, a file download), keep it and say so. `supervisor-new-profiles.ts` `importExcel()` is real — keep it. If removing a button leaves an empty wrapper div, remove the wrapper too.
- g) Export scope (low): in `supervisor-invoices.ts` ~313-327 and `supervisor-petty-cash.ts` ~274-288 `exportExcel()` sends a `status` only for the pending tab. Also send `search: this.searchQuery` when it is not empty, and for the other tabs send the same status value the list fetch sends for that tab (read the fetch method; if the list fetch sends no status for a tab, send none).

4. Tool policy:
- Reading files is unrestricted.
- Specs: from `frontend`. Create a temporary `frontend/tsconfig.o4tmp.json` (INSIDE `frontend/`; overwrite if it exists):
  `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/modules/accounting/components/finance/supervisor/supervisor-new-profiles/*.spec.ts", "src/app/modules/accounting/components/finance/supervisor/supervisor-invoices/*.spec.ts", "src/app/modules/accounting/components/finance/supervisor/supervisor-petty-cash/*.spec.ts", "src/app/modules/accounting/components/finance/supervisor/supervisor-attendance/*.spec.ts"], "exclude": [] }`
  and run `npx ng test --watch=false --ts-config tsconfig.o4tmp.json --include="src/app/modules/accounting/components/finance/supervisor/supervisor-new-profiles/*.spec.ts" --include="src/app/modules/accounting/components/finance/supervisor/supervisor-invoices/*.spec.ts" --include="src/app/modules/accounting/components/finance/supervisor/supervisor-petty-cash/*.spec.ts" --include="src/app/modules/accounting/components/finance/supervisor/supervisor-attendance/*.spec.ts"` (once BEFORE your changes for the baseline, then after; at most 6 runs). If a folder has no spec file the include simply matches nothing. Delete `frontend/tsconfig.o4tmp.json` before the commit.
- Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach.

5. Before finishing:
- All specs in the four folders pass (same as the baseline), guardian 52 passes.
- ZWNJ count of each file is not lower than the numbers in the runner comment (check with `python -c "import sys;print(open(sys.argv[1],encoding='utf-8').read().count('‌'))" <file>`).
- `git status --short` shows only files of the four folders (plus the pre-existing `tests/playwright/tools/index.py` and runner files) before the commit; `frontend/tsconfig.o4tmp.json` is deleted.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
fix(supervisor): working search, Persian errors and no fake excel buttons
- Short English report: what changed per file, test results, anything that differed from this task or was skipped. End the turn after the commit and the report.

===

[DONE] Session 2 of 2 — Overnight fixes O5-a2: errors, dates, numbers and current period on supervisor fleet, period lock, treasurer disbursements and treasurer petty cash

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-fleet/*" --allow "frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-period-lock/*" --allow "frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-disbursements/*" --allow "frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-petty-cash/*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-fleet/supervisor-fleet.html --count "39:‌" --absent "(input)=\"fetchFleetData()\""
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-fleet/supervisor-fleet.ts --count "12:‌" --contains "debounceTime" --absent "err.message"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-period-lock/supervisor-period-lock.ts --count "5:‌" --absent "fiscalYear = '1405'" --contains "gregorianToJalali"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-disbursements/treasurer-disbursements.ts --count "37:‌" --absent "fiscalYear = '1405'" --absent "amount.toLocaleString()" --contains "gregorianToJalali"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-disbursements/treasurer-disbursements.html --count "42:‌" --absent "م.ر"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-petty-cash/treasurer-petty-cash.ts --count "12:‌" --absent "err.message"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/treasurer/treasurer-petty-cash/treasurer-petty-cash.html --count "13:‌"
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/modules/accounting/components/finance/supervisor/supervisor-fleet/*.spec.ts" --include "src/app/modules/accounting/components/finance/supervisor/supervisor-period-lock/*.spec.ts" --include "src/app/modules/accounting/components/finance/treasurer/treasurer-disbursements/*.spec.ts" --include "src/app/modules/accounting/components/finance/treasurer/treasurer-petty-cash/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "fix(treasury): Persian errors, Shamsi dates, current period and fleet search debounce"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only files inside these four folders (base `frontend/src/app/modules/accounting/components/finance/`): `supervisor/supervisor-fleet/`, `supervisor/supervisor-period-lock/`, `treasurer/treasurer-disbursements/`, `treasurer/treasurer-petty-cash/`. No new files except a temporary tsconfig that you delete before the commit. Never edit `backend/`, `scripts/`, `tasks.md`, `tasks_history.md`, shared files, API services, routes or any other file.
- Do NOT change approve/return/pay logic: in `supervisor-fleet.ts` leave `submitApproval`/`submitReject` (approve and return methods) as they are; in `treasurer-petty-cash.ts` leave `confirmRefill()` and the refill list mapping (~115-196) as they are except the error text of item c); in `treasurer-disbursements.ts` do not change `refreshData()`'s API call arguments or `currentPeriodId` logic, nor the payment methods. Another fix will change those later.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- PERSIAN HALF-SPACES: keep every ZWNJ (U+200C) exactly; never retype existing Persian text. The runner fails if the ZWNJ count of a file drops (numbers in the runner comment are minimums). In new Persian text write a half-space as U+200C.
- Do not rename any method, input/output or field used by a spec. Do not delete or weaken any existing test. All user-facing text stays Persian.
- If a real file differs from this task, follow the real file and say so in the report. Skip an item only if it does not exist, and say so.

2. Context:
- Same audit as session 1 (plan findings ی۵۴, ی۵۶, ی۵۷, ی۵۹, ی۶۰; do not edit the plan). Line numbers are approximate.
- Helpers that already exist: `attendanceActionErrorMessage(err, fallback)` in `frontend/src/app/modules/accounting/attendance-period-error.ts`; `treasuryErrorMessage(err, fallback)` exported from `treasurer-disbursements.ts` itself; `gregorianToJalali(gy, gm, gd)` returning `{ jy, jm, jd }` in `frontend/src/app/core/utils/date-utils.ts`; pipe `persianDate` (`PersianDatePipe`, `frontend/src/app/shared/pipes/persian-date.pipe.ts`).

3. Task:
- a) Fleet loading and search (ی۵۴) in `supervisor-fleet.ts` ~279-344 and `supervisor-fleet.html` ~36: `fetchFleetData()` fires 4 requests; errors on the first three silently empty the lists, and `isLoading` is cleared only by the fourth. Make every error callback show a toast via the toast service the file uses (`'دریافت اطلاعات ناوگان انجام نشد.'`) and not clear an already loaded list; clear `isLoading` only after all four finished (counter or `forkJoin`+`finalize`). Search: replace `(input)="fetchFleetData()"` with `(input)="onSearchInput()"`; in the ts add a `private searchInput$ = new Subject<void>();` piped with `debounceTime(300)` subscribed once in `ngOnInit` (unsubscribed in `ngOnDestroy` the same way the file cleans its other subscriptions) that calls `this.syncUrlParams()` if that method exists and then `this.fetchFleetData()`; `onSearchInput(): void { this.searchInput$.next(); }`. Also add `.catch(() => this.toast.<error method>('کپی انجام نشد.'))` to the clipboard `writeText` promise in `copyToClipboard` (~690) using the file's toast method name.
- b) Shamsi dates (ی۵۶) in `treasurer-disbursements.html` ~320: the payment date column shows raw `payment_date`, which for payroll rows is the ISO timestamp `paid_at`. Pipe the value through `persianDate:'short'` when it is not already a Shamsi string: simplest is in `treasurer-disbursements.ts` ~560 (inside the row mapping only — not the API call) map payroll rows' display date with the pipe's logic, or in the html use `{{ row.date_shamsi || (row.payment_date | persianDate:'short') }}` — read the row shape and pick what is correct; fleet rows already have Shamsi. In `supervisor-fleet.ts` ~678 the export filename uses `new Date().toISOString().slice(0,10)`: use the Jalali date from `gregorianToJalali` formatted `YYYY-MM-DD` instead.
- c) Raw English error text (ی۵۷): in `supervisor-fleet.ts`, `treasurer-petty-cash.ts` (~142, ~192) and `supervisor-period-lock.ts`, replace every expression that can show `err.message`/`error.message` of an HttpErrorResponse with `attendanceActionErrorMessage(err, '<existing Persian fallback/prefix text>')` (treasurer files may use `treasuryErrorMessage` instead — import it from `../treasurer-disbursements/treasurer-disbursements` only if that does not create a circular import; otherwise use `attendanceActionErrorMessage`). Use only the helper's result as the toast text.
- d) Numbers (ی۵۹) in `treasurer-disbursements.ts` ~474: `this.payingItem?.amount.toLocaleString()` → `new Intl.NumberFormat('fa-IR').format(Number(this.payingItem?.amount ?? 0))`. In `treasurer-disbursements.html` ~46 the abbreviation «م.ر» is unclear: write «میلیون ریال» and round the shown value with a component method or `| number:'1.0-0'` (check how the value is computed; if it is a division in the template, move it to a getter that uses `Math.round`).
- e) Fixed period (ی۶۰) in `supervisor-period-lock.ts` ~32-33 and `treasurer-disbursements.ts` ~122-123: `fiscalYear = '1405'` and `selectedMonth = 'تیر'` are fixed. Initialise them from today: `const t = new Date(); const j = gregorianToJalali(t.getFullYear(), t.getMonth() + 1, t.getDate());` `fiscalYear = String(j.jy)`, `selectedMonth` = the Persian month name at index `j.jm - 1` of the file's own month list (the keys of `monthMap` in period-lock, in their declared order; in disbursements use its month list/map the same way — read the file). Do it in the field initialisers or at the very start of `ngOnInit`, before the first load. If the route query params set year/month, they still win (keep that code). In `treasurer-disbursements.ts` ~204-224: if loading the sections fails, show a toast `'دریافت فهرست بخش‌ها انجام نشد.'` (half-space U+200C) and still call the data refresh like the success path does with no section (read the success path; if it needs a section, just set a `loadError` field and show it with `role="alert"` and a «تلاش دوباره» button calling the sections loader, same classes as in other pages: `ms-2 min-h-10 px-3 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500`).
- f) Live refresh compare (low): `supervisor-fleet.ts` ~201 `msg.section_id === this.selectedSectionId` → `Number(msg.section_id) === Number(this.selectedSectionId)`.

4. Tool policy:
- Reading files is unrestricted.
- Specs: from `frontend`. Temporary `frontend/tsconfig.o4tmp.json` (INSIDE `frontend/`; overwrite if it exists):
  `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/modules/accounting/components/finance/supervisor/supervisor-fleet/*.spec.ts", "src/app/modules/accounting/components/finance/supervisor/supervisor-period-lock/*.spec.ts", "src/app/modules/accounting/components/finance/treasurer/treasurer-disbursements/*.spec.ts", "src/app/modules/accounting/components/finance/treasurer/treasurer-petty-cash/*.spec.ts"], "exclude": [] }`
  and run `npx ng test --watch=false --ts-config tsconfig.o4tmp.json --include="src/app/modules/accounting/components/finance/supervisor/supervisor-fleet/*.spec.ts" --include="src/app/modules/accounting/components/finance/supervisor/supervisor-period-lock/*.spec.ts" --include="src/app/modules/accounting/components/finance/treasurer/treasurer-disbursements/*.spec.ts" --include="src/app/modules/accounting/components/finance/treasurer/treasurer-petty-cash/*.spec.ts"` (once before your changes, then after; at most 6 runs). A spec that asserts the old fixed year/month: update only that expected value to be computed the same way, and say so. Delete `frontend/tsconfig.o4tmp.json` before the commit.
- Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach.

5. Before finishing:
- All specs in the four folders pass (same as the baseline), guardian 52 passes.
- ZWNJ counts not lower than in the runner comment.
- `git status --short` shows only files of the allowed folders (plus the pre-existing `tests/playwright/tools/index.py` and runner files) before the commit; `frontend/tsconfig.o4tmp.json` is deleted.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
fix(treasury): Persian errors, Shamsi dates, current period and fleet search debounce
- Short English report: what changed per file, test results, anything that differed or was skipped. End the turn after the commit and the report.

===

[DONE] Session 1 of 1 — Overnight fixes O6: release the overnight fixes O1-O8 on the local app environment: backup, migration check, patched frontend build; the runner restarts Daphne and the GDrive worker and runs the health checks

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
require: python scripts/automation/verify_tools.py release-mark
verify: python scripts/automation/verify_tools.py restart-backend
verify: python scripts/automation/verify_tools.py restart-worker
verify: python scripts/automation/verify_tools.py release-check
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 8 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- This session is a release only. Do not edit, create, stage or commit any file. Do not run `git` commands that change the working tree or history.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch it.
- Do not stop or start Daphne, the GDrive worker, Express on port 4200, PostgreSQL or `cloudflared`; do not run `taskkill` or `wt.exe`. The runner restarts Daphne and the GDrive worker itself after your turn.
- Only the local `app` environment on this Windows machine is in scope. Never connect to or run anything against `soft.farsalish.ir` or `soft.comanage.ir`. Do not run `deploy.ps1`. Do not build an APK.
- Do not run `run_auto_backup`, `migrate`, `makemigrations`, `flush`, any `manage.py test`, or any command that deletes files under `backend/backups/` or `frontend/dist/`.

2. Context: the overnight stages O1 to O8 changed backend views (public invoice verification page, receipt download) and many frontend pages, and added no migration. Your terminal may be PowerShell; if so, set environment variables with `$env:PYTHONUTF8='1';`.

3. Task, in this order:
- a) Backup. In `backend`, with `PYTHONUTF8=1`, run:
  `.\venv\Scripts\python.exe manage.py shell -c "from accounts.backup_service import create_database_backup; m = create_database_backup(user=None, description='pre-release app overnight fixes O1-O8'); print(m['filename'], m['size'])"`
  Stop and report if it fails or prints a size of 0. Do not continue without a successful backup.
- b) Migration check. `.\venv\Scripts\python.exe manage.py showmigrations --plan` must show no `[ ]` line. If any `[ ]` line appears, stop and report it; do not migrate.
- c) Frontend build. In `frontend`, run `npx ng build --delete-output-path=false` in the foreground and wait for it to finish, then run `node tools/patch-ngsw-530.js`. The patch script must print that the patch was applied or was already applied. Do not use `npm run build`, and do not delete `dist`.

4. Tool policy: only the commands above and `git status --short`. Run the build at most twice. If a command fails, read its output, do not repeat it unchanged, and change approach. If a step cannot be completed, stop and report the exact error.

5. Before finishing: `git status --short` shows nothing except runner files and `tests/playwright/tools/index.py`.

6. Output and stop condition: a short English report with the backup filename and size, the `showmigrations` result, the build result (errors and warnings count) and the patch script line. Write the report only after the build and the patch have finished. No commit. End the turn after the report.

===

Session 1 of 4 — File share F1: shareBlob, shareUrl, canShareFiles and the share offer hook in the shared file output, plus the share icon

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/core/platform/file-output.ts" "frontend/src/app/core/platform/file-output.spec.ts" "frontend/src/app/shared/icons/icon-registry.ts"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/core/platform/file-output.ts --contains "export function canShareFiles" --contains "export async function shareBlob" --contains "export async function shareUrl" --contains "export function setFileShareOfferNotifier" --contains "export function setFileOutputInfoNotifier" --contains "offerShare" --contains "اشتراک‌گذاری" --absent "navigator.share({ url"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/icons/icon-registry.ts --contains "'share':" --count "10:‌"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/core/platform/file-output.spec.ts --count "30:it("
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/core/platform/file-output.spec.ts" --include "src/app/shared/icons/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(share): shareBlob, shareUrl and share offer hook in file output"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 7 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only these three files: `frontend/src/app/core/platform/file-output.ts`, `frontend/src/app/core/platform/file-output.spec.ts`, `frontend/src/app/shared/icons/icon-registry.ts`. No other file, no new file except the temporary tsconfig of the Tool policy, which you delete before the commit. Never edit `backend/`, `scripts/`, `Documents/`, `tasks.md` or `tasks_history.md`.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- Do not change the existing behaviour of `saveBlob`, `saveUrl` or `printWindow` on native (Capacitor) platforms. Do not rename or remove any existing export. Do not delete or weaken any existing test.
- Security: share only the file content. Never pass a server URL or any link to `navigator.share` or to the native share on web. Never put a token in a URL.
- PERSIAN HALF-SPACES: Persian text uses the zero-width non-joiner (ZWNJ, U+200C), e.g. «اشتراک‌گذاری». Copy the Persian strings of this task exactly, with their ZWNJ. Never retype existing Persian text.

2. Context:
- Plan `Documents/File_Share/plan_file_share.md`, sections `## ۳.` and `## ۴.` (read only, do not edit).
- `frontend/src/app/core/platform/file-output.ts` (whole file, about 225 lines): `fileOutputNativeBridge`, `setFileOutputErrorNotifier`, `notifyError`, `isCancelError`, `blobToBase64`, `saveBlob`, `saveUrl`, `printWindow`, `FileOutputService`.
- `frontend/src/app/core/platform/file-output.spec.ts` (whole file): how the native bridge is spied and how `Capacitor` is faked on `globalThis`.
- `frontend/src/app/shared/icons/icon-registry.ts`: the icon map; entries look like `'download': '<path .../>',` in alphabetical order.

3. Task:
- a) Icon. Add to the registry, in alphabetical position, the Lucide "share-2" icon under the name `share`:
  `'share': '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',`
  If a spec counts the registry entries, update that number in the spec only if the spec file is inside `frontend/src/app/shared/icons/` and say so; otherwise do not add the icon to any other list.
- b) Types and notifiers in `file-output.ts`:
  - `export interface SaveOptions { offerShare?: boolean; }` (default: offer is on).
  - `export interface ShareOffer { blob: Blob; filename: string; }`
  - `export type ShareResult = 'shared' | 'cancelled' | 'downloaded' | 'offered';`
  - `export function setFileShareOfferNotifier(fn: ((offer: ShareOffer) => void) | null): void` and `export function setFileOutputInfoNotifier(fn: ((message: string) => void) | null): void`, stored in module variables like the existing error notifier.
- c) MIME helper (not exported is fine): `toShareFile(blob, filename): File` returns `new File([blob], filename, { type })` where `type` is `blob.type` if not empty, else by file extension: pdf `application/pdf`, xlsx `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, xls `application/vnd.ms-excel`, csv `text/csv`, txt `text/plain`, json `application/json`, zip `application/zip`, png `image/png`, jpg/jpeg `image/jpeg`, webp `image/webp`, docx `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, otherwise `application/octet-stream`.
- d) `export function canShareFiles(): boolean`: on native return true. On web return true only when `navigator.share` and `navigator.canShare` are functions and `navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] })` is true; wrap in try/catch and return false on any error or when `navigator` is undefined.
- e) Native helper: move the existing write logic of `saveBlob` (Documents first, Data as fallback, path `CoManage/<filename>`) into a private `async function writeNativeFile(blob, filename): Promise<{ uri: string; usedFallback: boolean }>` and use it from `saveBlob` without changing what `saveBlob` does on native. All existing native tests must still pass unchanged.
- f) `saveBlob(blob, filename, options?: SaveOptions)`: native path unchanged. Web path: after the anchor click (keep the existing code), if `options?.offerShare !== false` and `canShareFiles()` and a share offer notifier is set, call it with `{ blob, filename }`. Add the same optional third parameter to `FileOutputService.saveBlob` and pass it through. `saveUrl` does not offer.
- g) `export async function shareBlob(blob: Blob, filename: string): Promise<ShareResult>`:
  - Native: `writeNativeFile`, then `fileOutputNativeBridge.share({ title: filename, url: uri })` → `'shared'`; a cancel error (`isCancelError`) → `'cancelled'`; any other error → `notifyError('اشتراک‌گذاری فایل انجام نشد. دوباره تلاش کنید.', err)` and rethrow.
  - Web, when `canShareFiles()` and `navigator.canShare({ files: [file] })` is true for `file = toShareFile(blob, filename)`: `await navigator.share({ files: [file], title: filename })` → `'shared'`. Error name `AbortError` → `'cancelled'` (no message). Error name `NotAllowedError` (the click gesture expired during a slow download): if a share offer notifier is set, call it with `{ blob, filename }` and return `'offered'`; if none is set, fall through to the download fallback below. Any other error → `notifyError` with the Persian message above and rethrow.
  - Web fallback (no file sharing, or this file type cannot be shared): `await saveBlob(blob, filename, { offerShare: false })`, then call the info notifier with `'مرورگر شما اشتراک‌گذاری این فایل را پشتیبانی نمی‌کند؛ فایل دانلود شد.'` and return `'downloaded'`.
- h) Auth headers: move the token lookup of `saveUrl` into a private `authHeaders(): Record<string, string>` and use it in `saveUrl` (same behaviour).
- i) `export async function shareUrl(url: string, filename?: string): Promise<ShareResult>`: resolve with `resolveServerUrl(url)`; for `data:` and `blob:` URLs fetch without headers, else `fetch(resolved, { headers: authHeaders() })`. If `!response.ok`, call `notifyError('اشتراک‌گذاری فایل انجام نشد. دوباره تلاش کنید.', err)` with the thrown error and throw. The file name is `filename` or the last path part of `url` without query, or `'file'`. Then `return shareBlob(blob, name)`.
- j) Add `canShareFiles()`, `shareBlob(blob, filename)` and `shareUrl(url, filename?)` methods to `FileOutputService` that call the functions.
- k) Tests in `file-output.spec.ts` (at least 10 new `it(` blocks; keep all old ones). Fake `navigator.share`/`navigator.canShare` with `vi.fn` via `Object.defineProperty(globalThis.navigator, ...)` with `configurable: true` and restore them in `afterEach`. Cover: canShareFiles true/false/throws on web and true on native; shareBlob web success passes a `File` with the right name and a MIME type from the extension when `blob.type` is empty; AbortError → 'cancelled' with no notifier call; NotAllowedError with an offer notifier → 'offered' and the notifier got the blob; NotAllowedError without notifier → download fallback; unsupported → 'downloaded' plus the info message; native shareBlob writes the file and calls the bridge share with the uri, and a cancel error → 'cancelled'; saveBlob on web calls the offer notifier when supported, not when `{ offerShare: false }`, and not on native; shareUrl sends the Authorization header for a server URL and no header for a `data:` URL, and rejects on a 404 response.

4. Tool policy:
- Reading files is unrestricted.
- Specs: from `frontend`. Create a temporary `frontend/tsconfig.f1tmp.json` (overwrite if it exists):
  `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/core/platform/file-output.spec.ts", "src/app/shared/icons/*.spec.ts"], "exclude": [] }`
  and run `npx ng test --watch=false --ts-config tsconfig.f1tmp.json --include="src/app/core/platform/file-output.spec.ts" --include="src/app/shared/icons/*.spec.ts"` once BEFORE your changes for the baseline, then after (at most 6 runs). Delete `frontend/tsconfig.f1tmp.json` before the commit.
- Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach.

5. Before finishing:
- All specs of the two patterns pass, guardian 52 passes.
- `git status --short` shows only the three files (plus the pre-existing `tests/playwright/tools/index.py` and runner files); the temporary tsconfig is deleted.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
feat(share): shareBlob, shareUrl and share offer hook in file output
- Short English report: what changed, test results, anything that differed from this task. End the turn after the commit and the report.

===

Session 2 of 4 — File share F2: the "file is ready, share it" bar shown after downloads, wired into the app shell

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
require: python scripts/automation/verify_tools.py text-check --file frontend/src/app/core/platform/file-output.ts --contains "export function setFileShareOfferNotifier" --contains "export async function shareBlob"
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/shared/components/share-offer-bar/*" "frontend/src/app/app.ts" "frontend/src/app/app.html"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/components/share-offer-bar/share-offer-bar.component.ts --contains "app-share-offer-bar" --contains "setFileShareOfferNotifier" --contains "shareBlob" --contains "اشتراک‌گذاری" --contains "aria-live" --contains "min-w-[40px]" --contains "<bdi>"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/app.html --contains "<app-share-offer-bar></app-share-offer-bar>"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/app.ts --contains "setFileOutputInfoNotifier" --contains "ShareOfferBarComponent" --count "1:‌"
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/shared/components/share-offer-bar/share-offer-bar.component.spec.ts --min-tests 6
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/shared/components/share-offer-bar/*.spec.ts" --include "src/app/app.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(share): share offer bar after downloads"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 7 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Create exactly two new files: `frontend/src/app/shared/components/share-offer-bar/share-offer-bar.component.ts` and `frontend/src/app/shared/components/share-offer-bar/share-offer-bar.component.spec.ts`. Edit only `frontend/src/app/app.ts` and `frontend/src/app/app.html` besides them. Do not edit `file-output.ts` (session 1 already finished it). Never edit `backend/`, `scripts/`, `Documents/`, `tasks.md` or `tasks_history.md`.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- No inline svg paths: icons only with `<svg appIcon="name" ...>` (guardian 52). All user-facing text is Persian; copy the Persian strings of this task exactly, with their ZWNJ (U+200C), e.g. «اشتراک‌گذاری».

2. Context:
- Plan `Documents/File_Share/plan_file_share.md`, sections `## ۳.` items 2, 5, 6 and 7 (read only).
- Pattern to copy (layout, classes, standalone component with inline template, signals, `pb-safe`, 40px buttons, icon-only on mobile and label from `sm`): `frontend/src/app/shared/components/webpush-bar/webpush-bar.component.ts` and its spec `webpush-bar.component.spec.ts`.
- API from session 1 in `frontend/src/app/core/platform/file-output.ts`: `setFileShareOfferNotifier`, `ShareOffer`, `shareBlob`, `setFileOutputInfoNotifier`.
- `frontend/src/app/app.ts` lines 1-45 (imports, `toast` injection, `setFileOutputErrorNotifier((m) => this.toast.error(m));` in the constructor) and `frontend/src/app/app.html` lines 1-10 (`<app-toast-container>`, `<app-update-bar>`, `<app-webpush-bar>`).
- Toast API: `ToastService.show(type: 'success' | 'error' | 'warning' | 'info', message: string, durationMs = 4000)` in `frontend/src/app/shared/components/toast/toast.component.ts`.

3. Task:
- a) `ShareOfferBarComponent`, selector `app-share-offer-bar`, standalone, `imports: [SvgIconDirective]`, inline template.
  - State: `offer = signal<ShareOffer | null>(null)`, `busy = signal(false)`, a hide timer.
  - In the constructor call `setFileShareOfferNotifier((o) => this.show(o))`; in `ngOnDestroy` call `setFileShareOfferNotifier(null)` and clear the timer.
  - `show(o)`: replaces any current offer (newest wins), restarts a 15000 ms timer that calls `close()`.
  - `close()`: sets `offer` to null (this drops the blob reference) and clears the timer.
  - `async onShare()`: if busy or no offer, return. Set busy, clear the timer, `await shareBlob(o.blob, o.filename)`, then `close()` unless the result is `'offered'` (a new offer was shown). Errors are already shown by file-output; catch them, keep the bar closed, and clear busy in `finally`.
  - Template, only when `offer()` is set: same outer section as the webpush bar but `z-[90]`, `role="region"`, `aria-live="polite"`, `aria-label="اشتراک‌گذاری فایل دانلودشده"`, `data-testid="share-offer-bar"`. Content: an icon tile with `appIcon="share"`; a text `<p class="flex-1 min-w-0 font-bold truncate"><bdi>{{ offer()!.filename }}</bdi> آماده است.</p>`; a primary button `data-testid="share-offer-share"`, `title="اشتراک‌گذاری"`, `aria-label="اشتراک‌گذاری"`, `[disabled]="busy()"`, icon `share` on mobile and label `اشتراک‌گذاری` from `sm`; a secondary button `data-testid="share-offer-close"`, `title="بستن"`, `aria-label="بستن"`, icon `x` on mobile and label `بستن` from `sm`. Use the same classes as the webpush bar buttons (they already have `min-w-[40px] min-h-[40px]` and focus rings).
- b) `app.html`: add `<app-share-offer-bar></app-share-offer-bar>` on the line after `<app-webpush-bar></app-webpush-bar>`.
- c) `app.ts`: import `ShareOfferBarComponent` and add it to the component `imports`; import `setFileOutputInfoNotifier` and in the constructor, right after the existing `setFileOutputErrorNotifier(...)` line, add `setFileOutputInfoNotifier((m) => this.toast.show('info', m));`.
- d) Spec `share-offer-bar.component.spec.ts` (at least 6 `it(` blocks, jsdom like the webpush spec; mock `shareBlob` with `vi.mock` of the file-output module path or spy on it; use fake timers for the timeout): hidden at start; the registered notifier shows the bar with the file name inside `<bdi>`; a second offer replaces the first; share click calls `shareBlob` with the blob and name and hides the bar; result `'offered'` does not hide a newly shown offer; close click hides it; the bar hides itself after 15000 ms; `ngOnDestroy` unregisters (calls `setFileShareOfferNotifier(null)`).

4. Tool policy:
- Reading files is unrestricted.
- Specs: from `frontend`. Create a temporary `frontend/tsconfig.f2tmp.json` (overwrite if it exists):
  `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/shared/components/share-offer-bar/*.spec.ts", "src/app/app.spec.ts"], "exclude": [] }`
  and run `npx ng test --watch=false --ts-config tsconfig.f2tmp.json --include="src/app/shared/components/share-offer-bar/*.spec.ts" --include="src/app/app.spec.ts"` once before your changes, then after (at most 6 runs). Delete `frontend/tsconfig.f2tmp.json` before the commit.
- Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach.

5. Before finishing:
- Both spec patterns pass (app.spec.ts as on the baseline), guardian 52 passes.
- `git status --short` shows only your four files (plus the pre-existing `tests/playwright/tools/index.py` and runner files); the temporary tsconfig is deleted.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
feat(share): share offer bar after downloads
- Short English report: what changed, test results, anything that differed from this task. End the turn after the commit and the report.

===

Session 3 of 4 — File share F3: share button in the shared attachments list, and no share offer for backup files

<!-- runner
parallel: share-b
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
require: python scripts/automation/verify_tools.py text-check --file frontend/src/app/core/platform/file-output.ts --contains "export function canShareFiles" --contains "offerShare"
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/shared/components/attachments/*" "frontend/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts" "frontend/src/app/core/services/offline-db.ts"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/components/attachments/attachments.component.html --contains "share(item)" --contains "اشتراک‌گذاری" --contains "min-h-[40px] min-w-[40px]" --count "3:‌"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/components/attachments/attachments.component.ts --contains "shareBlob" --contains "canShareFiles" --contains "اشتراک‌گذاری پیوست انجام نشد" --count "6:‌"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts --contains "offerShare: false" --count "24:‌"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/core/services/offline-db.ts --contains "offerShare: false" --count "131:‌"
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file frontend/src/app/shared/components/attachments/attachments.dom.spec.ts
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/components/attachments/attachments.dom.spec.ts --count "10:it("
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/shared/components/attachments/*.spec.ts" --include "src/app/modules/common/components/settings/tabs/settings-backup-tab/*.spec.ts" --include "src/app/core/services/offline-db.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(share): share button on attachments, no share offer for backups"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 7 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only: the files in `frontend/src/app/shared/components/attachments/` (component ts, html and `attachments.dom.spec.ts`), `frontend/src/app/modules/common/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts` and `frontend/src/app/core/services/offline-db.ts`. No new file except the temporary tsconfig of the Tool policy. Never edit `file-output.ts`, `backend/`, `scripts/`, `Documents/`, `tasks.md` or `tasks_history.md`.
- In `offline-db.ts` and `settings-backup-tab.ts` change exactly one call each (item b). Nothing else in those files.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- PERSIAN HALF-SPACES: keep every existing ZWNJ (U+200C); the runner counts them per file (minimums in the runner comment). Copy the Persian strings of this task exactly. No inline svg paths (guardian 52).

2. Context:
- Plan `Documents/File_Share/plan_file_share.md`, section `## ۳.` items 3, 4 and 5 (read only).
- `frontend/src/app/core/platform/file-output.ts` (from session 1): `canShareFiles()`, `shareBlob(blob, filename)`, `saveBlob(blob, filename, { offerShare: false })`.
- `frontend/src/app/shared/components/attachments/attachments.component.ts` around lines 150-165, method `download(item)`; `attachments.component.html` around lines 36-41, the download button (classes, icon, `title`, `aria-label`, `<span class="hidden sm:inline">`).
- `frontend/src/app/shared/components/attachments/attachments.dom.spec.ts` (whole file) for the test setup.
- `settings-backup-tab.ts` around line 303: `void saveBlob(blob, fileName);` (whole system backup file `.wbak`).
- `offline-db.ts` around line 1116 in `downloadLocalDatabaseSnapshotFile`: `await saveBlob(blob, fileName);` (local database snapshot).

3. Task:
- a) Attachments share button.
  - In the ts add `readonly canShare = canShareFiles();` and `async share(item: AttachmentItem): Promise<void>` that mirrors `download(item)` (same busy guard, same `this.api.download(this.apiPath(item.download_url))`), then `await shareBlob(blob, item.original_name || 'attachment')`; on error `this.toast?.error(this.messageOf(err, 'اشتراک‌گذاری پیوست انجام نشد'))`; `finally` clears busy and calls `markForCheck` like download.
  - In the html, right after the download button, add `@if (canShare) { ... }` with a button that copies the download button exactly (same classes, so it keeps `min-h-[40px] min-w-[40px]` and the focus ring) with `(click)="share(item)"`, `[disabled]="busy"`, `title="اشتراک‌گذاری"`, `aria-label="اشتراک‌گذاری"`, icon `appIcon="share"` and `<span class="hidden sm:inline">اشتراک‌گذاری</span>`.
- b) No share offer for backups: change `void saveBlob(blob, fileName);` in `settings-backup-tab.ts` to `void saveBlob(blob, fileName, { offerShare: false });` and `await saveBlob(blob, fileName);` in `offline-db.ts` `downloadLocalDatabaseSnapshotFile` to `await saveBlob(blob, fileName, { offerShare: false });`. If a spec of those files asserts the exact `saveBlob` arguments, it is outside your scope only if it is not in the allowed files; report it instead of editing it.
- c) Spec `attachments.dom.spec.ts`: add at least 3 `it(` blocks (keep all old ones): the share button is absent when `canShareFiles` returns false; present with `aria-label="اشتراک‌گذاری"` when true; clicking it downloads through the api and calls `shareBlob` with the blob and the original name; an api error shows the toast `اشتراک‌گذاری پیوست انجام نشد` (or the server detail). Mock `canShareFiles`/`shareBlob` with `vi.mock` of the file-output module path used by the component.

4. Tool policy:
- Reading files is unrestricted.
- Specs: from `frontend`. Create a temporary `frontend/tsconfig.f3tmp.json` (overwrite if it exists):
  `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/shared/components/attachments/*.spec.ts", "src/app/modules/common/components/settings/tabs/settings-backup-tab/*.spec.ts", "src/app/core/services/offline-db.spec.ts"], "exclude": [] }`
  and run `npx ng test --watch=false --ts-config tsconfig.f3tmp.json --include="src/app/shared/components/attachments/*.spec.ts" --include="src/app/modules/common/components/settings/tabs/settings-backup-tab/*.spec.ts" --include="src/app/core/services/offline-db.spec.ts"` once before your changes, then after (at most 6 runs). Delete `frontend/tsconfig.f3tmp.json` before the commit.
- Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach.

5. Before finishing:
- All three spec patterns pass as on the baseline, guardian 52 passes, ZWNJ counts are not lower than the runner numbers (check with `python -c "import sys;print(open(sys.argv[1],encoding='utf-8').read().count('‌'))" <file>`).
- `git status --short` shows only the allowed files (plus the pre-existing `tests/playwright/tools/index.py` and runner files); the temporary tsconfig is deleted.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
feat(share): share button on attachments, no share offer for backups
- Short English report: what changed, test results, anything that differed from this task. End the turn after the commit and the report.

===

Session 4 of 4 — File share F4: share buttons in the document preview toolbar and on chat attachments

<!-- runner
parallel: share-b
require: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
require: python scripts/automation/verify_tools.py text-check --file frontend/src/app/core/platform/file-output.ts --contains "export function canShareFiles" --contains "export async function shareUrl"
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/shared/components/document-preview/*" "frontend/src/app/modules/common/components/communications/chat-drawer/*"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/components/document-preview/document-preview.component.html --contains "shareCurrent()" --contains "اشتراک‌گذاری سند" --count "37:‌"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/components/document-preview/document-preview.component.ts --contains "shareUrl" --contains "canShareFiles" --contains "shareCurrent" --count "64:‌"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/communications/chat-drawer/chat-drawer.component.html --contains "shareAttachment(att)" --contains "اشتراک‌گذاری" --count "53:‌"
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/communications/chat-drawer/chat-drawer.component.ts --contains "shareAttachment" --contains "shareBlob" --contains "canShareFiles" --count "129:‌"
verify: python scripts/automation/verify_tools.py tests-kept --base {base} --file frontend/src/app/shared/components/document-preview/document-preview.component.spec.ts frontend/src/app/modules/common/components/communications/chat-drawer/chat-drawer.component.dom.spec.ts
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/components/document-preview/document-preview.component.spec.ts --count "17:it("
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/communications/chat-drawer/chat-drawer.component.dom.spec.ts --count "32:it("
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --no-skip --max-failed 0 --include "src/app/shared/components/document-preview/*.spec.ts" --include "src/app/modules/common/components/communications/chat-drawer/*.spec.ts"
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(share): share buttons in document preview and chat attachments"
verify: python scripts/automation/verify_tools.py clean-tree --allow tests/playwright/tools/index.py
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 7 and 10 apply.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Never run `git stash`, `git reset`, `git restore` or `git checkout`. No push.
- Edit only files inside `frontend/src/app/shared/components/document-preview/` and `frontend/src/app/modules/common/components/communications/chat-drawer/` (component ts/html and the two specs named below). No new file except the temporary tsconfig of the Tool policy. Never edit `file-output.ts`, `backend/`, `scripts/`, `Documents/`, `tasks.md` or `tasks_history.md`.
- Do not change any other behaviour of the chat drawer (sending, voice, offline queue, thumbnails, scrolling). Only add the share method and buttons.
- The file `tests/playwright/tools/index.py` belongs to another session: never touch, stage or commit it.
- PERSIAN HALF-SPACES: keep every existing ZWNJ (U+200C); the runner counts them per file (minimums in the runner comment). Copy the Persian strings of this task exactly. No inline svg paths (guardian 52).

2. Context:
- Plan `Documents/File_Share/plan_file_share.md`, section `## ۳.` items 3, 4 and 5 (read only).
- `frontend/src/app/core/platform/file-output.ts` (from session 1): `canShareFiles()`, `shareBlob(blob, filename)`, `shareUrl(url, filename?)`.
- `document-preview.component.ts` around lines 595-606: `downloadFile(url, filename)` and `downloadCurrent()` (uses `this.previewModal.fileUrl` and `this.current?.downloadName`). `document-preview.component.html` around lines 67-72: the download button in the toolbar (`[class]="toolButtonClass + ..."`, `<span class="sm:sr-only">`).
- `chat-drawer.component.ts` around lines 1462-1475: `downloadAttachment(att)`; `chat-drawer.component.html` around lines 370-430: three `(click)="downloadAttachment(att)"` places. Two of them are small download icon buttons (around 374 and 425, icon `action-download`); the one around 411 is the large file preview tile.
- Specs: `document-preview.component.spec.ts` and `chat-drawer.component.dom.spec.ts` (setup and existing download tests).

3. Task:
- a) Document preview.
  - ts: import `canShareFiles` and `shareUrl`; add `readonly canShare = canShareFiles();` and `shareCurrent(): void { if (this.previewModal.fileUrl) { void shareUrl(this.previewModal.fileUrl, this.current?.downloadName).catch(() => undefined); } }` (file-output already shows the error toast).
  - html: right after the download button add `<button *ngIf="canShare" type="button" (click)="shareCurrent()" [disabled]="!previewModal.fileUrl" aria-label="اشتراک‌گذاری سند" title="اشتراک‌گذاری سند" [class]="toolButtonClass + ' disabled:opacity-40 disabled:cursor-not-allowed'">` with `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" appIcon="share"></svg>` and `<span class="sm:sr-only">اشتراک‌گذاری</span>`. Use `@if` instead of `*ngIf` only if the surrounding toolbar uses `@if`.
- b) Chat attachments.
  - ts: import `canShareFiles` and `shareBlob`; add `public readonly canShare = canShareFiles();` and `public async shareAttachment(att: { download_url?: string; file_name?: string }): Promise<void>` that mirrors `downloadAttachment` (same "not ready" toast when there is no `download_url`, same api download), then `await shareBlob(blob, att.file_name || 'attachment')`; on error `this.toast.error('اشتراک‌گذاری فایل انجام نشد')`.
  - html: next to each of the two small download icon buttons (around 374 and 425, not the large tile around 411) add, inside `@if (canShare)` or `*ngIf="canShare"` (match the surrounding syntax), a button that copies that download button's classes and size, with `(click)="shareAttachment(att)"`, `[attr.aria-label]="'اشتراک‌گذاری ' + att.file_name"`, `[title]="'اشتراک‌گذاری ' + att.file_name"` and an icon `appIcon="share"` of the same size as the download icon. If the button classes give less than 40×40 px, keep them as the download button has them and say so in the report.
- c) Specs (keep all old tests): `document-preview.component.spec.ts` at least 2 new `it(`: share button hidden when `canShareFiles` is false; visible when true and its click calls `shareUrl` with the file url and download name. `chat-drawer.component.dom.spec.ts` at least 2 new `it(`: `shareAttachment` downloads through the api and calls `shareBlob` with the blob and the file name; without `download_url` it shows the "not ready" toast and does not call `shareBlob`. Mock file-output with `vi.mock` of the module path each component uses.

4. Tool policy:
- Reading files is unrestricted.
- Specs: from `frontend`. Create a temporary `frontend/tsconfig.f4tmp.json` (overwrite if it exists):
  `{ "extends": "./tsconfig.spec.json", "include": ["src/**/*.d.ts", "src/app/shared/components/document-preview/*.spec.ts", "src/app/modules/common/components/communications/chat-drawer/*.spec.ts"], "exclude": [] }`
  and run `npx ng test --watch=false --ts-config tsconfig.f4tmp.json --include="src/app/shared/components/document-preview/*.spec.ts" --include="src/app/modules/common/components/communications/chat-drawer/*.spec.ts"` once before your changes, then after (at most 6 runs). Delete `frontend/tsconfig.f4tmp.json` before the commit.
- Once at the end from the repository root: `python scripts/e2e/guardian_52_icon_registry.py`.
- If a command fails, read its output, do not repeat it unchanged, and change approach.

5. Before finishing:
- Both spec patterns pass as on the baseline, guardian 52 passes, ZWNJ counts are not lower than the runner numbers.
- `git status --short` shows only the allowed files (plus the pre-existing `tests/playwright/tools/index.py` and runner files); the temporary tsconfig is deleted.

6. Output and stop condition:
- Stage only those files and commit with this message, without push:
feat(share): share buttons in document preview and chat attachments
- Short English report: what changed, test results, anything that differed from this task. End the turn after the commit and the report.
