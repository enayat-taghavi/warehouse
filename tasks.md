[DONE] Session 1 of 2 — Release v1 step 2.3-d: "my tasks" page, menu counter, superuser "unassigned" tab, shared workflow history, reason dialog, invoice page cancel and history

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/my-tasks/my-tasks.ts --contains WorkflowTasksService --contains getUnassignedTasks --contains queryParams --contains WorkflowReasonDialogComponent
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/components/workflow-history/workflow-history.component.ts --contains getHistory --contains WorkflowApiService --contains on_behalf_of --contains skipped
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/components/user-menu/user-menu.component.ts --contains WorkflowTasksService --contains /app/my-tasks
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/app.routes.ts --contains app/my-tasks
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/employee-invoices.html --contains app-workflow-history --contains expense_invoice
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/accounting/api/treasury-org-api.service.ts --contains cancelExpenseInvoice --contains getExpenseInvoice
verify: python scripts/automation/verify_tools.py glob-absent --root frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-invoices --glob *.ts --regex "window\.prompt"
verify: python scripts/automation/verify_tools.py glob-absent --root frontend/src/app/modules/accounting/components/finance/accountant/accountant-invoices --glob *.ts --regex "window\.prompt"
verify: python scripts/automation/verify_tools.py glob-absent --root frontend/src/app/modules/common/components/my-tasks --glob *.ts --regex "WorkflowApiService\)\.getMyTasks|getMyTasks\(|postTaskAction\("
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/common/components/my-tasks/my-tasks.dom.spec.ts --min-tests 8
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/shared/components/workflow-history/workflow-history.component.spec.ts --min-tests 4
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/shared/components/workflow-reason-dialog/workflow-reason-dialog.component.spec.ts --min-tests 3
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: cd frontend && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/modules/common/components/my-tasks/*.spec.ts" --include "src/app/shared/components/workflow-history/*.spec.ts" --include "src/app/shared/components/workflow-reason-dialog/*.spec.ts" --include "src/app/shared/components/user-menu/*.spec.ts" --include "src/app/modules/accounting/components/finance/employee/employee-invoices/*.spec.ts" --include "src/app/core/services/workflow-tasks.service.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(release-v1 2.3-d): my tasks page"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- `.agents/AGENTS.md` sections 3, 5, 7 and 10 apply. Read the skill `.claude/skills/design-system/SKILL.md` before writing any template.
- Run every command in the foreground and wait until it finishes. Never start a command in the background, and never end your turn while a command is still running.
- Change only the files allowed by the scope verify line. Never edit `frontend/src/app/core/` (the service and API you use are finished and committed), any backend file, anything under `scripts/` or `Documents/`.
- All user-facing text is Persian. Every icon is `<svg appIcon="name">` from the registry in `frontend/src/app/shared/icons/`; no new inline svg. Clickable elements: icon plus short label on desktop, icon only on mobile with `title` and `aria-label` in Persian, icon-only touch targets at least 40x40px.
- The page must not lose data: never clear or overwrite what `WorkflowTasksService` keeps; only read its signals.
- Do not push. Stage only your own files. Never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`.

2. Context (read these, nothing else of the plans):
- Plan `Documents/Release_v1/2.3_workflow/plan_2.3_workflow.md`: the table rows that start with `| ت۱۱ |`, `| ت۱۳ |`, `| ت۱۴ |` and `| ت۱۹ |`, and item 5 of the numbered list in section `## ۳. کارها`.
- Finished code to USE (do not copy, do not change):
  - `frontend/src/app/core/services/workflow-tasks.service.ts`: `WorkflowTasksService` with signals `tasks`, `count`, `isStale`, `loading`, `loaded`, `isEmpty`, `cachedAt`, `pendingTaskIds`, `notices`, methods `refresh()`, `act(task, action, reason)`, `dismissNotice(taskId)`, and `events$` (socket events). Read its doc comment.
  - `frontend/src/app/core/api/workflow-api.service.ts`: `WorkflowApiService` (`getUnassignedTasks`, `getHistory(kind, id)`, `cancelInstance`, and others).
  - `frontend/src/app/core/models/workflow.model.ts`: all types (`WorkflowTaskCard`, `WorkflowActionOutcome`, `WorkflowHistory`, `WorkflowTaskNotice`).
- Patterns to follow: `frontend/src/app/shared/components/cartable-card-base/`, `cartable-header/`, `tab-bar/`, `confirm-dialog/`, `action-button/`, `loading-skeleton/`, `toast/`; DOM spec style: `frontend/src/app/modules/common/components/operations/companies/companies.dom.spec.ts` and `frontend/src/app/shared/components/user-menu/user-menu.component.spec.ts`.
- Superuser check: `PermissionService.isSuperuser()` in `frontend/src/app/core/services/permission.service.ts`.

3. Definitions:
- "Card" = one `WorkflowTaskCard` shown with: workflow title, step title, summary (render the `summary` object's string/number values, and `amount` formatted with Persian digits and thousands separators plus `ریال`), company and section names, waiting time (`waiting_hours`: under 24 as «N ساعت», otherwise «N روز»), the label «به جانشینی از {on_behalf_of.name}» when `on_behalf_of` is set, and one button per entry of `actions`.
- Action labels by `step_kind` for `act`: `approve` → «تأیید», `review` → «بررسی», `execute` → «اجرا». `return` → «عودت برای اصلاح», `reject` → «رد قطعی».
- "Four page states": loading (skeleton while `loading()` and not `loaded()`), empty (`isEmpty()`), error/offline (`isStale()` true: a banner «نمایش از حافظهٔ دستگاه؛ آخرین به‌روزرسانی …» using `cachedAt`, cards still shown), and data.
- "Pending card": its `task_id` is in `pendingTaskIds()`: show the badge «در انتظار ارسال» and disable its buttons.

4. Task:
- a) New standalone `WorkflowReasonDialogComponent` in `frontend/src/app/shared/components/workflow-reason-dialog/` (`workflow-reason-dialog.component.ts` with inline or separate template). Inputs: `open`, `title`, `confirmLabel`, `serverError` (string). Outputs: `confirmed` (the trimmed reason), `cancelled`. A textarea is required: pressing confirm with an empty or whitespace-only reason shows the field error «نوشتن دلیل الزامی است» under the textarea (with `aria-invalid` and `aria-describedby`) and does not emit. `serverError` is shown under the field the same way. Esc and the cancel button emit `cancelled`. Mobile: full width at 360px. Spec `workflow-reason-dialog.component.spec.ts` with at least 3 tests.
- b) New standalone `WorkflowHistoryComponent` (selector `app-workflow-history`) in `frontend/src/app/shared/components/workflow-history/`. Inputs `kind` and `entityId`. Loads `WorkflowApiService.getHistory(kind, entityId)` on input change and again when `WorkflowTasksService.events$` emits an event with the same `entity_kind` and `entity_id`. Shows each instance (title, status, current step, created by, `submitted_at_shamsi`) and its steps as a vertical timeline: `actor_name`, «به جانشینی از …» when `on_behalf_of`, «(مدیر کل سامانه)» when `as_superuser`, `action_fa`, from/to step titles, `reason`, `at_shamsi`, and each `skipped` item as «مرحلهٔ ردشده: {step_title_fa} — {reason_fa}». A 404 shows «سابقه‌ای برای این سند ثبت نشده است»; other errors show a retry button. Output `cancelRequested` (instance id) only rendered as a «لغو» button when `can_cancel` is true. Spec with at least 4 tests (loaded timeline, skipped steps text, 404 text, cancel button shown only with `can_cancel`).
- c) New standalone page `MyTasksComponent` in `frontend/src/app/modules/common/components/my-tasks/` (`my-tasks.ts`, `my-tasks.html`, optional css). Route `{ path: 'app/my-tasks', component: MyTasksComponent, canActivate: [AuthGuard] }` in `frontend/src/app/app.routes.ts` next to `app/launcher`. Page:
  - Header «کارهای من» with the count, a refresh button calling `refresh()`.
  - Tabs with `app-tab-bar`: «کارهای من» always; «کارهای بی‌دریافت‌کننده» only when `PermissionService.isSuperuser()`, loaded with `WorkflowApiService.getUnassignedTasks()` (online only; its error shows a message and a retry button; on these cards the action buttons are hidden and only the open-document button is shown).
  - Filters: company (select built from the companies present in the cards) and workflow (select from `workflow_title_fa` of the cards), applied on the client. The active tab and filters live in the URL query params (`tab`, `company`, `workflow`) and are read back on load.
  - The four page states and the pending card rule from section 3.
  - Notices from `notices()` shown above the list as amber cards with the notice message and the card title if any, each with a dismiss button calling `dismissNotice`.
  - Open document button: `router.navigateByUrl(card.route)`; hidden when `route` is null.
  - `act` button: calls `act(card, 'act')` directly. `return` and `reject`: open the reason dialog from a); on confirm call `act(card, action, reason)`. Handle the outcome: `done` → success toast and close the dialog; `queued` → info toast «اقدام ذخیره شد و پس از اتصال ارسال می‌شود»; `already-done` → warning toast with `message`; `rejected` with code `reason_required` → keep the dialog open and pass `message` to `serverError`; other `rejected` → error toast with `message`.
  - Layout works at 360px width with no horizontal scroll.
  - DOM spec `my-tasks.dom.spec.ts` with a fake `WorkflowTasksService` (signals) and fake `WorkflowApiService`, at least 8 tests: the four states, the substitute label, pending card disabled, superuser tab visible only for superuser, reason dialog required before `act` is called with `return`.
- d) User menu (`frontend/src/app/shared/components/user-menu/`): add a menu button «کارهای من» (icon from the registry) above the launcher button, navigating to `/app/my-tasks`, with the count from `WorkflowTasksService.count()` as a small badge when greater than 0; also show the same count as a dot badge on the menu trigger. Add 2 tests to `user-menu.component.spec.ts` (provide a fake `WorkflowTasksService`).
- e) `frontend/src/app/modules/accounting/api/treasury-org-api.service.ts`: add `getExpenseInvoice(id)` (GET `expense-invoices/{id}`) and `cancelExpenseInvoice(id, reason)` (POST `expense-invoices/{id}/cancel/` with `{ reason }`), next to `submitExpenseInvoice`.
- f) Employee invoices page `frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/`:
  - Read the query param `invoice`. When present, load that invoice with `getExpenseInvoice` and show a detail panel (modal or side panel following the page's existing preview pattern) with its main fields and `<app-workflow-history kind="expense_invoice" [entityId]="id">`. Each invoice row also gets a «سابقه» button that opens the same panel.
  - When the history component emits `cancelRequested`, ask with `ConfirmDialogService` (type `danger`), then call `cancelExpenseInvoice`; on 409 show the server `detail` as a warning toast (it says cancel is not possible after another person acted); on success reload the list and the panel.
  - Add tests to `employee-invoices.spec.ts` for the `invoice` query param opening the panel and the cancel flow (2 tests at least).
- g) Supervisor and accountant invoice pages (`.../finance/supervisor/supervisor-invoices/supervisor-invoices.ts` around line 240, `.../finance/accountant/accountant-invoices/accountant-invoices.ts` around line 244): replace `window.prompt` with the reason dialog from a). The server error (400 `detail`) goes to `serverError` and the dialog stays open.

Out of scope: user substitute UI, company studio settings and glossary (session 2), petty cash pages, `manager-approvals`, any backend change.

5. Tool policy:
- Reading files is unrestricted.
- From the repo root you may run: `python scripts/e2e/guardian_52_icon_registry.py`, `python scripts/e2e/guardian_57_front_module_fence.py`, `python scripts/e2e/guardian_56_change_integrity.py --base f7af2210 --head HEAD`, and `python scripts/automation/verify_tools.py ng-test-compare --base f7af2210 --include <the spec globs of the ng-test-compare verify line>` (at most 4 times).
- From `frontend`: `npx ng build --output-path ../scratch/ng-build-check` (at most 3 times).
- If a command fails, read its output and change approach; do not repeat the same call unchanged.

6. Before finishing:
- The build, the three guardians and the ng-test-compare run pass.
- `git status --short` shows only files allowed by the scope verify line.

7. Output and stop condition:
- Commit with this message, without push:
feat(release-v1 2.3-d): my tasks page, menu counter, superuser unassigned tab, shared workflow history, reason dialog, invoice cancel and history
- Short English report: new and changed files with one line each, the summary lines of ng build and ng-test-compare, and anything left undone. End the turn after the commit and the report.

Session 2 of 2 — Release v1 step 2.3-d: temporary substitute UI (user menu and user dialog), workflow thresholds and reminder hours in the company studio, glossary entries

<!-- runner
require: python scripts/automation/verify_tools.py clean-tree
verify: python scripts/automation/verify_tools.py scope --base {base} --allow "frontend/src/app/shared/components/workflow-reason-dialog/*" "frontend/src/app/shared/components/workflow-history/*" "frontend/src/app/modules/common/components/my-tasks/*" frontend/src/app/app.routes.ts "frontend/src/app/shared/components/user-menu/*" "frontend/src/app/modules/accounting/components/finance/employee/employee-invoices/*" frontend/src/app/modules/accounting/api/treasury-org-api.service.ts "frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-invoices/*" "frontend/src/app/modules/accounting/components/finance/accountant/accountant-invoices/*" "frontend/src/app/shared/icons/*" "frontend/src/app/shared/components/workflow-substitutes/*" "frontend/src/app/modules/common/components/users/*" "frontend/src/app/modules/common/components/operations/companies/*" Documents/Release_v1/glossary.md
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/components/workflow-substitutes/workflow-substitutes.component.ts --contains getSubstitutes --contains createSubstitute --contains revokeSubstitute --contains NgPersianDatepickerModule
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/shared/components/user-menu/user-menu.component.html --contains app-workflow-substitutes
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/users/users.html --contains app-workflow-substitutes
verify: python scripts/automation/verify_tools.py text-check --file frontend/src/app/modules/common/components/operations/companies/company-workflow-tab/company-workflow-tab.component.ts --contains getThresholds --contains saveThreshold --contains deleteThreshold --contains saveCompanySettings --contains getDefinitions
verify: python scripts/automation/verify_tools.py text-check --file Documents/Release_v1/glossary.md --contains WorkflowSubstitute --contains WorkflowThreshold --contains reminder_hours --contains escalation_hours --contains on_behalf_of --contains skipped
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/shared/components/workflow-substitutes/workflow-substitutes.component.spec.ts --min-tests 5
verify: python scripts/automation/verify_tools.py spec-check --file frontend/src/app/modules/common/components/operations/companies/company-workflow-tab/company-workflow-tab.component.spec.ts --min-tests 5
verify: python scripts/e2e/guardian_52_icon_registry.py
verify: python scripts/e2e/guardian_56_change_integrity.py --base {base} --head HEAD
verify: python scripts/e2e/guardian_57_front_module_fence.py
verify: cd frontend && npx ng build --output-path ../scratch/ng-build-check
verify: python scripts/automation/verify_tools.py ng-test-compare --base {base} --include "src/app/shared/components/workflow-substitutes/*.spec.ts" --include "src/app/modules/common/components/operations/companies/**/*.spec.ts" --include "src/app/modules/common/components/users/*.spec.ts" --include "src/app/shared/components/user-menu/*.spec.ts"
verify: python scripts/automation/verify_tools.py commit-exists --base {base} --grep "feat(release-v1 2.3-d): temporary substitute UI"
verify: python scripts/automation/verify_tools.py clean-tree
-->

1. Critical rules:
- Same as session 1 (sections 3, 5, 7 and 10 of `.agents/AGENTS.md`, design-system skill, Persian text, shared icons, foreground commands, no push, stage only own files, never stage `tasks.md`, `tasks_history.md`, `run_tasks.py` or `run_tasks.bat`).
- Change only files allowed by the scope verify line. Never edit `frontend/src/app/core/`, any backend file, or anything under `scripts/`. Under `Documents/` edit only `Documents/Release_v1/glossary.md`.
- Session 1 files may be touched only in `user-menu`; leave the other session 1 files unchanged.
- Dates follow `.agents/AGENTS.md` section 3: the user picks Shamsi dates with `ng-persian-datepicker` (example: `frontend/src/app/modules/accounting/components/companies-studio/company-fiscal-periods-section/`), and the API receives Gregorian ISO `YYYY-MM-DD`.

2. Context:
- Plan `Documents/Release_v1/2.3_workflow/plan_2.3_workflow.md`: the table rows that start with `| ت۹ |`, `| ت۱۰ |` and `| ت۱۵ |`, item 5 and item 6 of the numbered list in section `## ۳. کارها`.
- Finished code to USE: `frontend/src/app/core/api/workflow-api.service.ts` (`getSubstitutes(principal)`, `createSubstitute`, `revokeSubstitute`, `getDefinitions`, `getThresholds`, `saveThreshold`, `deleteThreshold`, `getCompanySettings`, `saveCompanySettings`) and the types in `frontend/src/app/core/models/workflow.model.ts`. Server rules (reference only): `backend/core/workflow/views.py` classes `ThresholdListView`, `CompanySettingsView`, `SubstituteListView`, and `backend/core/workflow/substitutes.py` function `create_substitute`.
- Errors come as `{code, detail}` with a Persian `detail`; show `detail` next to the field or as a toast.
- Patterns: `frontend/src/app/modules/common/components/users/users.html` (inner tabs of the user dialog, `userModalInnerTab` in `users.ts` line 135), `frontend/src/app/modules/common/components/operations/companies/companies.ts` (studio tabs, `CORE_TAB_ORDER` line 604 and the tab list near line 820), `company-projects-tab/` (a core studio tab component to copy the structure from).

3. Definitions:
- "Substitute row" = one `WorkflowSubstitute`: substitute name, company name or «همهٔ شرکت‌ها», Shamsi start and end dates, state badge («فعال» when `is_current`, «آینده» when `is_active` and not current, «پایان‌یافته» or «لغوشده» otherwise), and a «لغو» button only when `can_revoke`.
- "Manager mode" = the component got a `principalId` input (the user dialog); otherwise it shows the current user's own rows.

4. Task:
- a) New standalone `WorkflowSubstitutesComponent` (selector `app-workflow-substitutes`) in `frontend/src/app/shared/components/workflow-substitutes/`. Input `principalId` (optional). Loads `getSubstitutes(principalId)`, lists substitute rows, and has a create form: substitute user (searchable select; get the user list from an existing API already used by the frontend for choosing users — find it in `frontend/src/app/core/api/user-api.service.ts` or `frontend/src/app/core/services/scope-directory*`; do not add a backend endpoint), optional company, start and end dates with `ng-persian-datepicker`. Client checks: substitute required, end date not before start date. Sends `createSubstitute({ substitute_id, start_date, end_date, principal_id, company_id })`. Server 400/403 `detail` is shown under the form. Revoke asks with `ConfirmDialogService` then calls `revokeSubstitute`. Loading, empty («جانشینی ثبت نشده است»), error with retry, and data states. Spec with at least 5 tests.
- b) User menu: a button «جانشین من» that opens a modal containing `<app-workflow-substitutes>` without `principalId`.
- c) User dialog in `users.html`/`users.ts`: new inner tab «جانشین» (id `substitute`) shown only when editing an existing user, containing `<app-workflow-substitutes [principalId]="editingUser.id">`. A 403 from the server shows the server message in the tab (the server decides who may manage whom).
- d) Company studio: new core tab component `CompanyWorkflowTabComponent` in `frontend/src/app/modules/common/components/operations/companies/company-workflow-tab/` (id `workflow`, label «گردش کار», short label «گردش»), registered in `companies.ts` like the `projects` tab, ordered after `access`. Content:
  - Reminder hours and escalation hours (number inputs) from `getCompanySettings(companyId)`, saved with `saveCompanySettings`; client check 1 ≤ reminder < escalation ≤ 720 with field errors; a note when `is_default` is true.
  - Thresholds table from `getThresholds(companyId)`: workflow, step, section or «کل شرکت», amount with thousands separators and «ریال», updated by and date, delete button (confirm first). Add form: workflow and step selects from `getDefinitions()` limited to steps whose `kind` is `approve` and workflows with `has_amount`, optional section (sections of the company already loaded by the studio, if available; otherwise company-wide only), amount (non-negative number). `saveThreshold` replaces an existing threshold of the same step and target.
  - A 403 from these endpoints shows «اجازهٔ ویرایش تنظیمات گردش کار این شرکت را ندارید» and hides the forms.
  - Spec with at least 5 tests.
- e) `Documents/Release_v1/glossary.md`: add rows in the existing table format (term | meaning | do not say | name in code) for: «گردش کار» (`WorkflowInstance`), «مرحله» (`step_key`), «کار» (`WorkflowTask`), «کارهای من» (`tasks/`), «تأیید» / «بررسی» / «اجرا» (`approve`/`review`/`execute`), «لغو» (`cancel`), «جانشین موقت» (`WorkflowSubstitute`), «به جانشینی از» (`on_behalf_of`), «مرحلهٔ ردشده» (`skipped`), «بدون تأیید دوم» (`no_second_approval`), «سقف مبلغ» (`WorkflowThreshold`), «یادآوری» (`reminder_hours`) and «خبر به بالاتر» (`escalation_hours`). Meanings come from the plan rows listed in section 2. Do not change existing rows.

Out of scope: backend, `core/`, session 1 files other than `user-menu`, petty cash.

5. Tool policy:
- Reading files is unrestricted.
- From the repo root: `python scripts/e2e/guardian_52_icon_registry.py`, `python scripts/e2e/guardian_57_front_module_fence.py`, and `python scripts/automation/verify_tools.py ng-test-compare --base HEAD~1 --include <the spec globs of the ng-test-compare verify line>` (at most 4 times).
- From `frontend`: `npx ng build --output-path ../scratch/ng-build-check` (at most 3 times).
- If a command fails, read its output and change approach; do not repeat the same call unchanged.

6. Before finishing:
- The build, guardians 52 and 57 and the ng-test-compare run pass.
- `git status --short` shows only files allowed by the scope verify line.

7. Output and stop condition:
- Commit with this message, without push:
feat(release-v1 2.3-d): temporary substitute UI in user menu and user dialog, workflow thresholds and reminder hours in the company studio, glossary entries
- Short English report: new and changed files with one line each, the summary lines of ng build and ng-test-compare, and anything left undone. End the turn after the commit and the report.
