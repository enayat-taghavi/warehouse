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
