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
