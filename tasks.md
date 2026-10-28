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
