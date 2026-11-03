# Cloud brief — sub-step ل-د: phase 1 signing, registration and numbering (backend)

For a Claude Code **cloud** session. Backend only. On `main` already: ل-۰ (workflow `StepSpec.assignees`, person-chosen signers), ل-ب (module skeleton, models, migration, registry hooks) and ل-ج (API, access rules, `can_view`/`can_attach`, edit lock, offline conflict copies) under `backend/modules/letters/`.

## 1. Rules (override defaults)

- Read `CLAUDE.md` first. Parts about Windows paths, Antigravity, `app`/`soft`, Windows Terminal, scheduled chains and `localhost:4300` do not apply here; never touch `app` or `soft`.
- Work only on your session branch; never push to `main`. Commit after each green chunk and push (the user pays from a small balance: if credit or context runs low, push what you have and write the open items in the progress log). No `Co-Authored-By` trailer.
- **Budget:** read narrowly (Grep the symbol, then read its range). No subagents, no browser, no frontend. Target ≤ ~80 tool calls.
- **Core stays untouched** (ق1): everything goes in `backend/modules/letters/`, wired through `contribute(...)`. The only allowed file outside the module is `scripts/e2e/core_literal_allowlist.json`, and only if a guardian demands it, with a category and reason.
- **Migration only if truly needed** (e.g. a field the workflow must store). If so: read `.claude/skills/safe-migration/SKILL.md` and apply it; additive only (`AddField` nullable or with default, `AddIndex`); no data migration, no `CASCADE`, no drop/rename. Prefer no migration.
- **No data loss:** a letter, an issued number and a `LetterDraftCopy` are never deleted; voiding keeps the number voided (`numbering.services.void`), never frees it.
- The entity kind constant is `LETTER_ENTITY = 'letters_letter'` (ل-ج renamed it from `letters.letter`; the plan text still shows the old name).
- Final chat message in Persian, very short and simple: what was built, test results, open items, PR link.

## 2. Environment (Linux cloud)

- First: `bash scripts/cloud/setup_cloud_env.sh > /tmp/setup.log 2>&1; tail -n 5 /tmp/setup.log`. If it fails, report and stop. For guardian 29: `backend/venv/bin/pip install import-linter==2.3` (the script does not install it yet; don't edit the script).
- Python is `backend/venv/bin/python`. Run from `backend/` with `PYTHONUTF8=1` and **`WH_MODULES=warehouse,accounting,letters`** (letters is `opt_in`). Backend tests **only with app labels**, never an unlabeled `manage.py test`. Redirect output to `/tmp/<name>.log`; bring in only `tail -n 30` plus FAIL/ERROR headers. `workflow` tests are slow (~10 min): run them once at the end.

## 3. Task

Plan: `Documents/Release_v1/letters_module/plan_letters.md`. Grep the headings, then read only: «ن۳» (lifecycle and void), «ن۴» (number only at registration), «ن۶» (phase 1 linear signing), «ل-د» (files, API, tests), section 7 answers (final; س۱ = «الف»), and the progress-log entries for ل-۰ (its «نکته برای ل-د»: `on_state_change(obj, 'sign')` fires again for each signer and must be idempotent; the module must pass `fixed_missing_action='wait'`) and ل-ج (open item: attachment tags after registration — only `signed_scan` and `after_register` may be added once a letter is locked; close it here if `can_attach` / `is_locked` allows, otherwise leave it as an open item for ل-ح).

Build exactly what «ل-د» lists: `backend/modules/letters/letters/{workflows.py, services/__init__.py, services/lifecycle.py, tests/test_signing_ld.py}` plus the new actions in `views.py` / `urls.py` and the `contribute('workflows', ...)` line(s) in `apps.py`.

Patterns to copy (read only the named range):
- Workflow contract: `backend/core/workflow/registry.py` `StepSpec` (~line 45) and `WorkflowSpec` (~line 77), including the `assignees` hook from ل-۰; `backend/core/workflow/engine.py` `submit` (~line 583) and `act` (~line 840) signatures only.
- A real module workflow: `backend/modules/accounting/personnel/workflows.py` `INVOICE_WORKFLOW_SPEC` (~line 114) and its hooks (`on_state_change`, `can_act`), registered in `backend/modules/accounting/personnel/apps.py` ~line 94.
- Numbering: `backend/core/numbering/services.py` `allocate` (~line 61, row-locked counter) and `void` (~line 97). Series keys come from `letters/numbering.py` `series_key_for(kind)`.
- ل-ج's own helpers to reuse, not duplicate: `letters/access.py` (`visible_letters`, `is_editor`, `has_company_perm`, `SECRETARIAT_PERM`), `letters/views.py` (`_visible_or_404`, `_audit`, `_detail`).

Key acceptance points (from «ل-د», all with tests):
- The number is issued only at registration, inside the same transaction; a rollback gives the number back; two concurrent registrations never get the same number.
- After registration the text, recipients and main attachment are locked (`Letter.LOCKED_STATUSES`).
- Void keeps the number voided and needs a reason; only the secretariat (or the author for a draft) may void.
- Electronic signing without a signature image → 400. Wet signing follows ن۶.
- A substitute (`allow_substitute`) never sees a confidential letter's text.
- «Return» (عودت) makes the letter editable again and starts a new signing round.
- Incoming: `received` → `registered`; outgoing: `registered` → `sent`; archive per ن۳.
- «Sign» and «return» also work from the core «my tasks» API (س۱ = الف).
- Every action is audited with `log_audit_event` (no subject in `target_repr`), and 404 for anyone who cannot see the letter.

## 4. Checks before handoff

- From `backend/` (with `WH_MODULES=warehouse,accounting,letters`): `manage.py test letters workflow numbering`; `manage.py check` three times: default (no `WH_MODULES`), `WH_MODULES=accounting,letters`, and `WH_MODULES=warehouse`; `manage.py makemigrations --check --dry-run`.
- Guardians from the repo root with the backend venv python: `scripts/e2e/guardian_modularization.py` (29), `guardian_57_front_module_fence.py`, `guardian_58_scoped_has_perm.py`.
- Self-review against `.claude/agents/tenant-scope-reviewer.md` and `.claude/agents/data-loss-reviewer.md` (read each checklist and apply it to your diff; no subagents). Fix every confirmed finding before the PR.
- Progress-log entry for ل-د at the end of `plan_letters.md` (status, decisions, deviations, tests and results, open items, next action: ل-ه).
- Open a PR to `main` titled `feat(letters): signing, registration and numbering (letters ل-د)`.
