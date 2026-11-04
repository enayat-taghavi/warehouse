# Cloud brief — sub-step ل-ز: letter view, referral tree and secretariat (frontend)

For a Claude Code **cloud** session. Mostly frontend, plus two small additive backend changes (section 3.B). On `main`: the whole letters backend (ل-ب … ل-ه) and the first frontend pages of ل-و (`frontend/src/app/modules/letters/`: manifest, list, compose, block editor, party picker, offline draft queue, `tsconfig.letters.spec.json`).

## 1. Rules (override defaults)

- Read `CLAUDE.md` first. Parts about Windows paths, Antigravity, `app`/`soft`, Windows Terminal, scheduled chains and `localhost:4300` do not apply here; never touch `app` or `soft`.
- Work only on your session branch; never push to `main`. Commit after each green chunk and push (the user pays from a small balance: if credit or context runs low, push what you have and write the open items in the progress log). No `Co-Authored-By` trailer.
- **Budget:** read narrowly (Grep the symbol, then read its range). No subagents, no browser. Target ≤ ~100 tool calls. Do part A first, then B; part C only if budget remains, else list it as open.
- **Core and shell stay untouched (ق1):** frontend work only in `frontend/src/app/modules/letters/` through the manifest; backend only in `backend/modules/letters/`. `installed-modules.ts` only through `node tools/gen-installed-modules.js` (letters is opt-in: the committed default file must not change). `scripts/e2e/core_literal_allowlist.json` only if a guardian demands it, with a category and reason.
- **No migration.** **No data loss:** never clear a queue, cache or error inbox; 5xx/unreachable = keep; use `isServerUnreachable()`; reuse `services/letters-offline.ts`, never a second queue. Letters, referral tasks, issued numbers and `LetterDraftCopy` rows are never deleted.
- UI: `.claude/skills/design-system/SKILL.md` (read once). Short Persian labels, `<svg appIcon>` only (guardian 52), semantic tokens, icon-only on mobile unless the row fits, targets ≥ 40×40 with Persian `title` + `aria-label`, no horizontal scroll at 360 px, four states. Reuse shared pieces: `app-person-role-picker`, `app-status-badge`, `app-offline-pending-badge`, `PersianDatePipe`, `ConfirmDialogService`, `ng-persian-datepicker` (see `.agents/AGENTS.md` §3 for Shamsi dates and exports).
- Final chat message in Persian, very short and simple: what was built, test results, open items, PR link.

## 2. Environment (Linux cloud)

- First: `bash scripts/cloud/setup_cloud_env.sh > /tmp/setup.log 2>&1; tail -n 5 /tmp/setup.log`. If it fails, report and stop. For guardian 29: `backend/venv/bin/pip install import-linter==2.3`.
- Specs: `npx ng test --ts-config tsconfig.letters.spec.json --include 'src/app/modules/letters/**/*.spec.ts' --watch=false` from `frontend/` (add your new spec paths to that tsconfig's `include` if needed). The core queue runner reads `localStorage`: specs that call it stub it (see `services/letters-offline.spec.ts`). Type check: `npx tsc -p tsconfig.app.json --noEmit`.
- Backend (part B): from `backend/` with `PYTHONUTF8=1 WH_MODULES=warehouse,accounting,letters`, `backend/venv/bin/python manage.py test letters` (app labels only, never unlabeled). Output to `/tmp/<name>.log`; bring in only `tail -n 30` plus FAIL/ERROR headers.

## 3. Task

Plan: `Documents/Release_v1/letters_module/plan_letters.md`. Grep the headings, then read only: «ن۶» and «ن۷» (signing and referral on the page), «ن۱۶» (view, secretariat, register and Excel, live), «ل-ز» (files and tests), section 7 answers, and the progress-log entries of ل-ه, «ادغام ل-ه», ل-و and «ادغام ل-و» (their open items are listed below too).

### A. Plan scope of ل-ز

Build what «ل-ز» lists: `components/{letter-view/, referral-tree/, refer-dialog/, secretariat/, register-incoming/}` with specs, plus routes in `letters.routes.ts` and calls in `services/letters-api.service.ts`.
- Letter view: body render of the ن۱۴ blocks, signers and status, actions only when the server allows them (sign, return, register, send, archive, unarchive, void, refer). Sign and return go through `POST /api/letters/<id>/sign|return/`; actions are online-only (disabled offline).
- Show the server's conflict copies (`draft_copies` in the detail payload) with «نسخهٔ ناهمگام» and a way to copy the text back into the editor (ل-و open item: a queued save's `conflict: true` doesn't reach the page, so the view is where the user finds it).
- Referral tree: `GET /api/letters/<id>/referrals/` (nested, collapsible on mobile), `POST /api/letters/<id>/refer/` with `app-person-role-picker` (refer / inform, instruction, due date with `ng-persian-datepicker`), done and seen through the existing core task actions (Grep how «کارهای من» completes a referral task: `/api/workflow/tasks/<id>/...`).
- Secretariat: `GET /api/letters/register/?company=` register with voided rows shown, Excel export the way other modules do it (`.agents/AGENTS.md` §3), incoming registration with scan upload (`register-incoming`). The secretariat gets no live event for letters it isn't involved in (ل-ه merge note): re-read the register on window focus and on `document_changed`.
- Live: re-read on `document_changed` for `letters_letter`; ignore the event from the own tab (`client_tab_id`; see how ل-و's list does it).
- Circulars: list `GET /api/letters/circulars/?company=&unread=1` with read/unread, audience editor `GET/PUT /api/letters/<id>/audience/` in the compose page for kind `circular` (only with `perm_letters_circular`), viewers `GET /api/letters/<id>/viewers/` for the author/secretariat.

### B. Small additive backend changes (`backend/modules/letters/letters/`, with tests)

- Detail and list payloads: recipient users with their display name (today the UI shows «کاربر N»). Read the serializer, add a read-only field; no N+1 (`select_related`/`prefetch_related`).
- List API filters ل-و had to fake: `mine` (author or co-author), `to_me` (I'm a user recipient, or in my referral tree), `date_from`/`date_to` (registered date), `party` (external party id). Map the list tabs «کارتابل/فرستاده‌ها» to them in `letter-list` instead of the status-only mapping. Keep every filter inside `visible_letters` (never widen visibility).
- Replay safety (ل-و open item): a queued POST that the server answers `duplicate: true` doesn't apply the newer body. Make `POST /api/letters/` with an existing `client_temp_id` of the same author apply the body as a PATCH would (same revision rules: a stale revision makes a `LetterDraftCopy` conflict copy and returns `conflict: true`), so a replayed create never drops text. Test it.

### C. Only if budget remains (else list as open items)

- Missing compose fields: response due date (`ng-persian-datepicker`), co-authors, attachments (core attachments API), follow-up / reply-to and document links (`/api/letters/link-kinds/`), edit lock (`lock/`, `unlock/`).
- Low UI items from the ل-و review: `faDate()` in `letter-list.ts` → `PersianDatePipe`; hand-made status pills and «در صف» badges → `app-status-badge` / `app-offline-pending-badge`; on deep links like `?kind=incoming` the filter `<select>`s may show the first option (bind after options render); the list search box filters only on Enter/blur.

## 4. Checks before handoff

- Specs green; `tsc` clean; `manage.py test letters` green; `manage.py check` default and with `WH_MODULES=accounting,letters`; `makemigrations --check --dry-run` no changes.
- Guardians from the repo root with the backend venv python: `guardian_52_icon_registry.py`, `guardian_56_change_integrity.py --base origin/main --head HEAD`, `guardian_57_front_module_fence.py`, `guardian_58_scoped_has_perm.py`, `guardian_modularization.py` (29). Guardian 55 already fails on `main` without letters; just make sure letters files add no new 55 violations.
- `node tools/gen-installed-modules.js` leaves the committed file unchanged.
- Self-review against `.claude/agents/ui-reviewer.md`, `.claude/agents/tenant-scope-reviewer.md` (part B) and `.claude/agents/data-loss-reviewer.md` (if you touch the offline draft). Fix every confirmed finding before the PR.
- Progress-log entry for ل-ز at the end of `plan_letters.md` (status, decisions, deviations, tests and results, open items, next action: ل-ح).
- Open a PR to `main` titled `feat(letters): letter view, referral tree and secretariat (letters ل-ز)`.
