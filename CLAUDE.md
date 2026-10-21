# Project rules and architecture

**Language:** always reply to the user in fluent Persian; English only for file names, paths, commands and code. Keep replies short. All user-facing UI text in the app stays Persian.

## Rules

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary — prefer editing existing files
- NEVER create documentation files unless explicitly requested
- NEVER save working files or tests to root — use `/src`, `/tests`, `/docs`, `/config`, `/scripts`
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- NEVER add a `Co-Authored-By` trailer to user commits
- Validate input at system boundaries
- NEVER discard uncommitted changes (`git restore`, `git reset --hard`, `git checkout -- <file>`) without the user's explicit approval; check `git status` first
- **"?" rule:** a prompt containing "?" or "؟" is investigatory: only explain or answer; change nothing, write no code, no plan. "??" or "؟؟" means an ultra-short, direct answer.
- **Direct vs. planned work:** clear fixes and well-defined changes (even multi-file) are done directly and completely in one turn. Large features, schema/architecture shifts or ambiguous requests get a formal plan first, executed only after the user's explicit typed approval (e.g. «تایید»، «شروع»).
- **Shared standards with Antigravity:** `.agents/AGENTS.md` holds domain standards that apply to me too (§3 exports, cartable concurrency, WebSocket, Shamsi dates, sensitive RBAC, `ng-persian-datepicker`; §6 payroll/fleet per the Excel blueprint; §7 grid ergonomics, sticky command center, subtabs, Sheba/bank). Read the relevant section before touching those areas.
- Persian markdown docs under `Documents/` wrap their content in `<div dir="rtl" align="right">…</div>`, like the existing plan docs.

## Permissions and working mode

- Permissions are **bypass**: `permissions.defaultMode` is `bypassPermissions` in the project `.claude/settings.local.json` and the global `~/.claude/settings.json` (`skipDangerousModePermissionPrompt: true`). Don't ask the user for extra approval for commands or edits.
- The only intentional exception: the deny on reading `.env` / `.env.*` in `.claude/settings.json`. It is quiet (no prompt) and prevents key leaks. Remove it only on the user's explicit request.
- Work only on `main` in the main folder `E:/warehouse project`. Never create a branch or worktree without the user's permission; even if the session opens inside a worktree, edit `main` via absolute paths.

## Repository layout (monorepo)

- `warehouse-backend/` — Django backend (with `venv/`).
  - `config/` — system settings and composition root (`settings.py`, `urls.py`, `asgi.py`, `wsgi.py`).
  - `backend_paths.py` — path discovery helper adding `core/` and `modules/*` to `sys.path`.
  - `core/` — platform core apps (`accounts`, `common`, `companies`, `communications`, `notifications`, `platform_core`, `reports`, `settings_core`).
  - `modules/warehouse/` — warehouse module apps (`warehouses`, `inventory`).
  - `modules/accounting/` — accounting module apps (`personnel`).
- `warehouse-front/` — Angular frontend (`src/app/`). Key services in `src/app/core/services/`.
- `scripts/` — guardian/test scripts (`scripts/e2e/`).
- `Documents/Modular_Middle_Path/` — modular architecture implementation plan.
- `pyproject.toml` — dev-only umbrella package `wh-suite` (`import-linter==2.3` as dev).

### Backend apps (Django)

- `config` — settings and system boot. `AUTH_USER_MODEL` is subject to the split; guardians sometimes use `auth.User`.
- `core/settings_core` — platform app split out of `warehouses`; model `SystemSetting` with `db_table='warehouses_systemsetting'`. Settings functions in `settings_core/services.py`; shim in `warehouses/services.py`; viewsets in `settings_core/views.py`. Key `installed_modules` in `/api/public/config/`.
- `modules/warehouse/warehouses` — warehouse core. `Warehouse.assigned_users` (M2M, `db_table='accounts_customuser_assigned_warehouses'`). `management/commands/setup_project.py`.
- `core/accounts` — users and accounting. `AuditLog.warehouse_id` is numeric (IntegerField) on the same column/index as before; `AUDIT_MODULES` registry in `accounts/models.py`.
- `modules/accounting/personnel` — accounting modules (attendance/fleet/payroll/treasury/projects/invoices), registered in `personnel/apps.py`.
- `core/communications` — chat.
- `core/reports` — report-builder engine (`reports/`: `engine.py`, `registry.py`, `views.py`, `pdf.py`).

## Frontend architecture (Angular)

- Critical services in `src/app/core/services/`: `offline-db.ts`, `offline-sync.service.ts`, `server-reachability.ts`, `sync-pull.service.ts`, `network-status.service.ts`, `photo-upload-queue.service.ts`, `session-tab.service.ts`, `system-health.service.ts`, `import.service.ts`, `communication.service.ts`.
- Offline/PWA: Angular Service Worker plus the post-build patch `tools/patch-ngsw-530.js`, run by `npm run build` (plain `ng build` skips the patch — always `npm run build`).
- **UI design language:** the `design-system` skill is the reference. Foundations:
  - **Semantic color tokens:** `surface`, `fg` and `line` in `tailwind.config.js` and the `:root` of `styles.css`.
  - **Shared icon:** `<svg appIcon="name">` with `shared/icons/` (registry of 195 icons). New inline svg is forbidden; guardian 52 catches it.
  - **Local Vazirmatn font:** in `public/fonts/vazirmatn/` and the service worker prefetch group.
  - **`darkMode: 'selector'`:** dark mode no longer turns on automatically from the OS.
  - **`NgOptimizedImage`:** only for server images in a fixed-size box; never for `data:`/`blob:` or print templates.
  - **`@defer` for `chart.js`, `withViewTransitions` for page transitions, and global reduced motion.**
  - **Responsive clickable elements:** icon + short label on desktop; icon-only on mobile unless the whole row fits with no horizontal scroll or wrap; icon-only touch targets at least 40×40px; Persian `title` and `aria-label` (details in the skill).
- **"Browser test" / «تست مرورگر» / «تست دام»** from the user means fast component/DOM unit tests (`ng test`, Vitest + jsdom) by default; real-browser E2E only when explicitly asked («با مرورگر واقعی»، «E2E»). My own visual checks in the built-in browser are separate and still required.

## Hard rules and accepted decisions

- **No data may ever be lost.** Expired cache is never deleted; only `isStale` is reported. A sync-queue record is deleted only on explicit server acceptance (2xx) or explicit rejection (4xx); 5xx means retry, never delete. Raise any change that opens a data-loss path before applying it.
- **Behind Cloudflare Tunnel** (`app.farsalish.ir`): 520–530 mean the origin is unreachable, not a backend error. When debugging an operational error, first check whether it comes from Cloudflare or Django. HTTP status interpretation must use `isServerUnreachable()` from `core/services/server-reachability.ts`, not `status >= 500` or `status === 0`.
- **Deliberate user decisions (never report them as issues in audits):** the chat contacts list (`ChatContactsListView` in `communications/views.py`) intentionally returns all active users, not limited by warehouse; authenticated users have no global rate limit (only `AnonRateThrottle` and `ScopedRateThrottle` are active) so they don't get locked out behind the tunnel.
- **Never search Persian text with `grep` in Bash** — Windows Git Bash garbles UTF-8; use the Grep tool.
- **I can't see passwords or pages behind login** — final verification of anything behind the login page (dashboard, warehouses, counting) is the user's. Verify as far as possible with server-side simulation or on the login page, and say explicitly what remains unverified and how the user can test it.
- **The user runs nothing** (since 30 Sep 2026): no build, restart, git or install. Never prepare commands for the user to run.
- **Antigravity executes, Claude supervises** (since 15 Oct 2026, to save Claude tokens): all app code, reviewer-finding fixes and `app` releases go to Antigravity (Gemini 3.8 Flash (High)) as `tasks.md` tasks run by `run_tasks.py`. Claude writes plans, `tasks.md` with runner verify lines, progress logs and runner tooling, runs the queue, reviews diffs with the sonnet reviewers and decides; it never edits app code itself. Task text follows the memory `gemini-flash-prompting`.
  - Ask one short yes/no question only before work that directly affects production (next item) or opens a data-loss path.
  - Replies stay short and in Persian.
- **Environment roles (`app` vs `soft`):**
  - **`app.farsalish.ir` (This Windows machine):** Local test and staging environment behind Cloudflare Tunnel (`cloudflared`). Daphne listens on port 8000, Express on port 4200 serves `warehouse-front/dist/`, PostgreSQL on port 5432 holds test/staging data. There are NO real users here. Building frontend or restarting services on this machine is for personal testing and does not require yes/no prompts.
  - **No real users anywhere yet (user, 21 Oct 2026):** the whole project, `soft` included, is still in its testing phase; never describe current data as real users' data. The safety rules below stay in force so the code is ready for the day real users arrive.
  - **`soft.farsalish.ir` (Production Server):** Dedicated Ubuntu server for the live application; it will host real users later (none yet). Direct DNS (no Cloudflare), TLS via Let's Encrypt / Nginx. Real user data must NEVER be lost or deleted during updates, and no test data from `app` may ever be transferred to `soft`. Any operation directly affecting `soft` or opening data-loss paths requires explicit approval.
  - Alongside the stack, an `ng serve` on `localhost:4300` serves the working tree live. Use it for safe visual review (config `attach-frontend-dev-4300` in `.claude/launch.json`). 4200 is local test.

## Token economy (never at the expense of quality)

Cost = context size × number of calls. Keep context small; never cut the model, reasoning, tests or reviews.

- **One plan step per session.** Long plan docs: Grep the headings, then read only the current step, the defect entries it references, and the progress log.
- **Handoff** at the end of each step, or when the context-watch hook warns: finish the current sub-task; at step end run the relevant reviewers once on the step's diff and fix confirmed findings; commit; append a handoff note to the plan's progress log (a «گزارش پیشرفت» section at the end of the plan, in the plan's language: status per sub-step, decisions and deviations, tests/reviews run and results, open issues, exact next action); then reply in Persian with the one-line message the user should send in a new session. Prefer handoff over `/compact`.
- **Reading code:** Grep first, then Read only the needed range plus what it depends on (imports, class header). Read a whole file only when the task needs the whole file. Don't re-read unchanged files.
- **Broad searches** (unknown location, many files): one `Explore` subagent with `model: "sonnet"`, asked for file:line pointers and short excerpts. For a known file or symbol, Grep+Read directly (a spawn costs ~25K tokens up front). Never edit from a subagent summary; read the target lines yourself. Code is written only in the main session.
- **Plan mode:** read known files directly; at most one Explore agent; a Plan agent only when the change spans backend and frontend or more than 5 files.
- **Command output:** redirect tests and builds to `scratch/logs/<name>.log`; bring into context only the summary (`tail -n 30`) and the FAIL/ERROR headers; open the log by range when diagnosing.
- **Reviewers** (`data-loss-reviewer`, `tenant-scope-reviewer`, `ui-reviewer`): once per step on that step's diff, before commit; not after every edit.
- **Skills:** invoke each at most once per session; re-invoke only if it is no longer in context.
- **Browser:** prefer `read_page`/`get_page_text`; screenshots only as final visual proof. If browser tools are off and a UI check is needed, ask the user to turn them on; never skip the check.

## Modular split

Plan: warehouse counting and accounting as two independently installable modules. Reference: `Documents/Modular_Split_Warehouse_Accounting/implementation_plan_modular_split.md`; checklist `task_modular_split.md`; per-phase walkthrough `walkthrough_phaseN.md`.

- **Phase 0:** fence C1–C4 in `.importlinter`, dev umbrella `wh-suite`, guardian 29 (`scripts/e2e/guardian_modularization.py`), baseline `modularization_baseline.json`.
- **Phase 1:** app `settings_core`; `SystemSetting` moved (zero data migration); `warehouse_id` column numeric; CASCADE behavior via a `post_delete` signal in `warehouses/signals.py`.
- **Phase 2:** cut the core → warehouse edges (expand-contract, zero data migration): M2M `assigned_warehouses` moved to `warehouses`; `AuditLog.warehouse_id` numeric; `AUDIT_MODULES` registry; `setup_project.py` moved to `warehouses/management/commands/`. Migrations were squashed on 9 Sep 2026 (commit `4247d0c`), so old numbers like `accounts/0035` no longer exist.
- **Phase 3 onward** are done: `INSTALLED_APPS` is built from the `platform_core/module_catalog.py` registry, and the `WH_MODULES` variable builds a single-module profile.
- **Deep modularization (`Documents/Deep_Modularization_Phase4/`) closed on 21 Oct 2026.** Module names left in the backend core and in the front shell (`core/`, `shared/`, `modules/common/`, ts and html) are only data, protocol, offline-DB-lock or dev-tooling literals. Each one is listed in `scripts/e2e/core_literal_allowlist.json` with a category and a reason.
  - Guardians 29 and 57 fail on any literal not in the list and on any stale entry.
  - Guardian 57 also requires zero module route paths (`/app/<module prefix>`) in the shell and composition root, and zero literals naming another module inside a module (`cross_module_literals`).
  - Guardian 29 requires zero imports or `apps.get_model`/`is_installed` of another module's app inside a module (`cross_module_app_refs`). Cross-module behaviour goes through the platform registry (`contribute`/`contributions`, `resolve_entity`, e.g. `file_sync_sources`/`file_sync_sinks`).
  - Step 7 (21 Oct 2026): module permissions are declared in `modules/<m>/module.py` (`PERMISSIONS`, `PERMISSION_CODENAMES`) and created create-only in `post_migrate` (`accounts/module_permissions.py`); core reads them via contributions (`audit_view_perms`, `user_directory_perms`, `key_role_permissions`, `org_structure_write_perms`, `sensitive_field_bypass_perms`). The front shell reads `users.permissionGroup`/`shortPermissionNames`/`assignmentScope`, `scopeDirectory` (`ScopeDirectoryService`), `healthDashboard.panel` and `operations.queueLabelFa`. `scripts/e2e/module_coupling_scan.py` (inside guardians 29/57) fails on module permission codes in core/shell, cross-module permission codes (modules name another module's permission only through permission aliases: backend `contribute('permission_aliases:<capability>', code)` + `permission_alias()`/`has_permission_alias()`, frontend `permissionAliases` extension + `permissionAlias()` tokens; only `phase_guardian_approval.py` is allowlisted), locked offline DB refs and front/back permission-group mismatch.
  - Opt-in modules (`opt_in=True` / `optIn: true`, e.g. `modules/showcase`) install only when named in `WH_MODULES` / `--modules`; the default profile and committed `installed-modules.ts` exclude them.
  - New module-specific behaviour goes through module extensions, never core branches:
    - `syncConfig` hooks: `purgeBeforeDeepUpdate`, `purgeOnAccessRevoked`, `legacyCursorKey`, `targetLabelFa`.
    - `userMenu.deepSync`, `launcherTile.switcher` and `offlineSync.sensitiveConflicts`.

## Commands and tools

- `lint-imports` needs `PYTHONUTF8=1` (Persian in config files). Its exit is intentionally report-only with code 1; the real gate is guardian 29, which compares the violation count with the baseline and fails only on an *increase*.
- Guardians: `python scripts/e2e/guardian_all.py` runs them all: phases 1–5, guardian 29 (`guardian_modularization.py`) and every auto-discovered `guardian_NN_*.py`. Guardian 32 was removed in commit `2f9855b`. Guardian 56 (`guardian_56_change_integrity.py`) checks template changes (lost handler calls, unbalanced tags, icon-less `mobile="icon"` tabs, bad `.ts` icon names, events that are neither a component output nor a native DOM event); in supervisor reviews run it with `--base <last reviewed commit> --head HEAD` first. Phase 1–5 guardians need E2E data (e.g. `E2E-ITEM-01`) and fail on the local `app` database (it has no E2E data); never seed test data into it (or into `soft`) to make them pass.
- Tests: `./venv/Scripts/python.exe manage.py test ...`. The postgres test database is not available; if a test didn't run, report it explicitly.
- Check: `./venv/Scripts/python.exe manage.py check`.
- **Frontend tests (`ng test`)**, status as of 30 Sep 2026, identical on HEAD and before the UI changes:
  - 18 spec files have TypeScript errors (missing Node types for `fs`/`path`/`__dirname`, and stale model fields). Because the builder type-checks every spec, the whole suite fails to compile.
  - To run the rest: a temporary tsconfig that extends `tsconfig.spec.json` and excludes those 18 files, passed with `--ts-config` plus the same `--exclude`s. Result: 357 pass, 19 fail (the failures are pre-existing).
  - To measure a change's effect, run the same on HEAD (`git archive` into `scratch/` with a junction to `node_modules`) and compare. Remove the junction only with `cmd /c rmdir`, never `rm -rf`.
- Backend secrets (`DJANGO_SECRET_KEY`, `DJANGO_DEBUG`) live in `warehouse-backend/.env`, outside git; `settings.py` reads it and system environment variables override it. Don't read it.
- Backend errors at ERROR level and above (Django and project apps) go to `warehouse-backend/logs/django-errors.log`. The folder is outside git; the file is created on the first error.
- Code searches skip the tracked chat archives `chat_history_data.json` and `chat_history_dashboard.html` (listed in `.gitignore`); pass the path explicitly to search them.
- **Release on this machine** (`app`, no real users: no yes/no needed; releases to `soft` follow `deploy.ps1` and need explicit approval):
  1. Back up with `create_database_backup` from `accounts/backup_service.py`. Don't run `run_auto_backup`: it deletes old backups.
  2. Frontend build in `warehouse-front`: `npx ng build --delete-output-path=false && node tools/patch-ngsw-530.js`. The flag keeps files that are being served from being deleted mid-build.
  3. Backend restart: close the daphne process on port 8000 and its venv launcher with `taskkill`. Then relaunch it in a Windows Terminal tab so it doesn't depend on the Claude session:
     `MSYS_NO_PATHCONV=1 wt.exe -w 0 new-tab -d "E:\warehouse project\warehouse-backend" --title "Backend Daphne" cmd /k ".\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application"`
  4. GDrive sync worker (D9): launch in an auto-restarting tab (to restart during release, simply `taskkill` the python worker process):
     `MSYS_NO_PATHCONV=1 wt.exe -w 0 new-tab -d "E:\warehouse project\warehouse-backend" --title "GDrive Sync Worker" cmd /k "for /l %i in (1,0,2) do (.\venv\Scripts\python.exe -X utf8 manage.py run_gdrive_sync_worker --interval 5 & timeout /t 10 /nobreak >nul)"`
  5. Verify: `https://app.farsalish.ir/` and `https://app.farsalish.ir/api/public/config/` must return 200, and worker heartbeat is fresh.
- Claude Code automation:
  - **Hooks** in `.claude/settings.json` run `.claude/hooks/guard.py`; Antigravity calls the same script from `.agents/hooks.json`.
    - The two tools take different output formats: Claude Code accepts only `hookSpecificOutput`, and at most one JSON per run.
    - On every `PostToolUse` it also runs the context watchdog: one warning when context passes 350K tokens, then one per additional 100K (state in `.claude/tmp/context-watch/`).
    - Test: `python scripts/test_guard_hooks.py`.
  - **Subagents** in `.claude/agents/`: `data-loss-reviewer`, `tenant-scope-reviewer` and `ui-reviewer` (all `model: sonnet` to save tokens).
  - **Skills** in `.claude/skills/`: `safe-migration`, `systematic-debugging`, `verification-before-completion` and `design-system`.
  - **Plugins** (project scope): `frontend-design` (Anthropic). `modern-web-guidance` is off to save tokens (1 Oct 2026).
  - **MCP**: `context7` and `angular-cli` (with `--read-only`).
