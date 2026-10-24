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
