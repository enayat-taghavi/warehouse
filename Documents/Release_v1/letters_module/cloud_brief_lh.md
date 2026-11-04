# Cloud brief — sub-step ل-ح: print / PDF, letterhead, stamp and letters settings

For a Claude Code **cloud** session. Backend first (part A), then a small frontend settings tab (part B). On `main`: the whole letters backend (ل-ب … ل-ه), list/compose/offline draft (ل-و) and letter view, referral tree and secretariat (ل-ز, merged with local review fixes).

## 1. Rules (override defaults)

- Read `CLAUDE.md` first. Parts about Windows paths, Antigravity, `app`/`soft`, Windows Terminal, scheduled chains and `localhost:4300` do not apply here; never touch `app` or `soft`.
- Work only on your session branch; never push to `main`. Commit after each green chunk and push (the user pays from a small balance: if credit or context runs low, push what you have and write the open items in the progress log). No `Co-Authored-By` trailer.
- **Budget:** read narrowly (Grep the symbol, then read its range). No subagents, no browser. Target ≤ ~90 tool calls. Part A first, then B; part C only if budget remains, else list it as open.
- **Core and shell stay untouched (ق1):** backend only in `backend/modules/letters/`, frontend only in `frontend/src/app/modules/letters/` through the manifest (`module.ts`). If `core/reports/document_pdf.py` lacks paragraph alignment or bold, print without it and note it in the log (ن۱۷): **do not change core**. `installed-modules.ts` only through `node tools/gen-installed-modules.js` (letters is opt-in: the committed default file must not change). `scripts/e2e/core_literal_allowlist.json` only if a guardian demands it, with a category and reason.
- **No migration.** **No data loss:** letters, issued numbers, signatures and attachments are never deleted; a new signed scan is added, never replaces an old attachment.
- UI: `.claude/skills/design-system/SKILL.md` (read once). Short Persian labels, `<svg appIcon>` only (guardian 52), semantic tokens, icon-only on mobile unless the row fits, targets ≥ 40×40 with Persian `title` + `aria-label`, no horizontal scroll at 360 px, four states (loading, empty, error, offline). Reuse shared pieces (`app-attachments`, `ConfirmDialogService`, existing studio-tab patterns).
- Final chat message in Persian, very short and simple: what was built, test results, open items, PR link.

## 2. Environment (Linux cloud)

- First: `bash scripts/cloud/setup_cloud_env.sh > /tmp/setup.log 2>&1; tail -n 5 /tmp/setup.log`. If it fails, report and stop. For guardian 29: `backend/venv/bin/pip install import-linter==2.3`.
- Backend: from `backend/` with `PYTHONUTF8=1 WH_MODULES=warehouse,accounting,letters`, `backend/venv/bin/python manage.py test letters reports` (app labels only, never unlabeled). Output to `/tmp/<name>.log`; bring in only `tail -n 30` plus FAIL/ERROR headers.
- Specs: `npx ng test --ts-config tsconfig.letters.spec.json --include 'src/app/modules/letters/**/*.spec.ts' --watch=false` from `frontend/`. Specs that touch the core queue runner stub `localStorage` (see `services/letters-offline.spec.ts`). Type check: `npx tsc -p tsconfig.app.json --noEmit`.

## 3. Task

Plan: `Documents/Release_v1/letters_module/plan_letters.md`. Grep the headings, then read only: «ن۱۲» (company settings), «ن۱۷» (print and PDF), «ن۹» (who may view/attach), «ل-ح» (files and tests), and the progress-log entries «ل-ز» and «ادغام ل-ز» (their open items are listed below too).

Patterns to copy (read only the hook functions, not whole files):
- Print: `backend/modules/accounting/personnel/invoice_print.py` (`printable:<kind>` → `PrintableDocument`), registered in `backend/modules/accounting/personnel/apps.py` around lines 100–110; contract in `backend/core/platform_core/registry.py` lines ~250–280 and `backend/core/reports/document_pdf.py` (dataclass fields only: `letterhead_image`, `paragraphs`, `extra_tables`, `info_pairs`, `signers`, page size).
- Verify: `backend/modules/accounting/personnel/invoice_verify.py` (`verify_summary:<kind>`); public page test pattern in `backend/core/reports/test_document_verify_o3.py`.
- Settings keys already exist: `backend/modules/letters/letters/settings_spec.py` (`letterhead_a4`, `letterhead_a5`, `secretariat_stamp`, `default_due_days`), registered via `contribute('company_settings', …)` in `letters/apps.py`.
- Studio tab: `CompanyStudioTab` in `frontend/src/app/core/modules/module-contract.ts` line ~59; example registration `frontend/src/app/modules/accounting/module.ts` around line 186 (`companies.studioTabs`) and component `modules/accounting/components/companies-studio/company-treasury-tab/`.

### A. Backend (`backend/modules/letters/letters/printing.py`, `verify.py` or inside `printing.py`, `tests/test_print_lh.py`)

- `printable:letters.letter` (`fn(user, entity_id)`): returns `None` (→ 404) when `can_view_letter` is false. Letterhead image from the company setting for the letter's page size (A4/A5; read how the letter stores page size, default A4); number, registered date (Shamsi), attachment count; `paragraphs` / `extra_tables` from the ن۱۴ blocks (paragraph, numbered/bulleted list, simple table; bold/alignment only if the core supports it); recipients and CC in `info_pairs`; `signers` from `LetterSigner` with `signed=True` **only** for a signer who actually signed; core verify QR.
- Electronic signing: the signer's signature/stamp images come from the core (user `Attachment`), the secretariat stamp from `secretariat_stamp` after registration. Live signing (`sign_method` = live): empty boxes, then «بارگذاری نسخهٔ امضاشده» uploads a `signed_scan` attachment.
- Close the open ل-ج/ل-د item: after registration only the labels `signed_scan` and `after_register` may be attached (`can_attach_letter` cannot see the label: find where the core attachments API passes the label/`is_locked` and enforce it in the module; if the core gives no hook, enforce it in a letters endpoint and note it).
- `verify_summary:letters.letter` (`fn(entity_id)`): only letter kind, number, date and company name; for confidential/secret only «معتبر» and the number; voided letter reported as voided; missing letter `{'exists': False}`.
- Settings write is `perm_letters_settings` through the existing company-settings API (check it already enforces the module permission; if not, note it — do not change core).
- Tests: PDF builds in A4 and A5 with letterhead; an unsigned signer's image never appears; confidential verify shows only the number; no-access user gets 404 on the print endpoint; other-company user gets 404; attachment label rule after registration.

### B. Frontend (`frontend/src/app/modules/letters/components/letters-settings-tab/` with spec)

- Studio tab «تنظیمات نامه» registered in letters `module.ts` via `companies.studioTabs` (`requiresSavedCompany: true`, permission section matching letters settings): letterhead A4 and A5 and secretariat stamp as image uploads (`app-attachments` or the pattern the treasury/governance tab uses), default due days (number, 0 = no deadline), link to «شماره‌گذاری اسناد». Save only online; offline shows the offline state, nothing is lost.
- Letter view (`components/letter-view/`): «چاپ / PDF» action (opens the core document PDF endpoint for `letters.letter`, A4/A5 choice if the letter allows) and, for live signing, «بارگذاری نسخهٔ امضاشده» (upload with label `signed_scan`). Both only when the server's `actions` list allows them (add the action names to the backend `actions` field).
- DOM spec for the settings tab (four states, save disabled offline) and for the two new view actions.

### C. Only if budget remains (else list as open items)

- Open items carried from ل-ز: spec for `refer-dialog`; circular audience editor in compose (`audience`, `setAudience` already in `letters-api.service.ts`); list UI filters for date range and external party (API ready); compose fields response due date, co-authors, attachments, follow-up/reply-to, document links, edit lock; `faDate()` in `letter-list.ts` → `PersianDatePipe`; hand-made pills → `app-status-badge` / `app-offline-pending-badge`; deep-link `<select>` binding; search only on Enter/blur; drop the redundant second PATCH after a `duplicate` create reply.
- Substitute (delegate) support in the referral tree: `can_close` / `can_refer` in `_referral_tree` (`letters/views.py`) are false for a valid substitute (server still authorizes correctly). Fix only through a public read-only helper if the core already has one; do not change core.
- Secretariat register paging (today the whole register, capped at 500 rows, is fetched).
- Secretariat sending of a confidential outgoing letter it cannot view (ل-د open item): propose a limited secretariat view for send only; implement only if small and covered by tests.

## 4. Checks before handoff

- `manage.py test letters reports` green; `manage.py check` default and with `WH_MODULES=accounting,letters`; `makemigrations --check --dry-run` no changes; specs green; `tsc` clean.
- Guardians from the repo root with the backend venv python: `guardian_52_icon_registry.py`, `guardian_56_change_integrity.py --base origin/main --head HEAD`, `guardian_57_front_module_fence.py`, `guardian_58_scoped_has_perm.py`, `guardian_modularization.py` (29). Guardian 55 already fails on `main` without letters; make sure letters files add no new 55 violations.
- `node tools/gen-installed-modules.js` leaves the committed file unchanged.
- Self-review against `.claude/agents/tenant-scope-reviewer.md` (part A) and `.claude/agents/ui-reviewer.md` (part B). Fix every confirmed finding before the PR.
- Progress-log entry for ل-ح at the end of `plan_letters.md` (status, decisions, deviations, tests and results, open items, next action: ل-ط heavy end check in a separate local chat).
- Open a PR to `main` titled `feat(letters): print, letterhead, stamp and settings (letters ل-ح)`.
