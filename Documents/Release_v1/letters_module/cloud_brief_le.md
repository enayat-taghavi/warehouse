# Cloud brief — sub-step ل-ه: phase 2 referral, response deadline and circulars (backend)

For a Claude Code **cloud** session. Backend only. On `main` already, under `backend/modules/letters/`: ل-ب (models, registry hooks), ل-ج (API, access rules `visible_letters` / `can_view`, edit lock, offline conflict copies) and ل-د (signing workflow `letters.sign`, registration and numbering, send/archive/void, migration `0002_letter_sent`).

## 1. Rules (override defaults)

- Read `CLAUDE.md` first. Parts about Windows paths, Antigravity, `app`/`soft`, Windows Terminal, scheduled chains and `localhost:4300` do not apply here; never touch `app` or `soft`.
- Work only on your session branch; never push to `main`. Commit after each green chunk and push (the user pays from a small balance: if credit or context runs low, push what you have and write the open items in the progress log). No `Co-Authored-By` trailer.
- **Budget:** read narrowly (Grep the symbol, then read its range). No subagents, no browser, no frontend. Target ≤ ~80 tool calls.
- **Core stays untouched** (ق1), except the one `engine.submit` keyword in section 3 («Fix carried over»): everything else goes in `backend/modules/letters/`, wired through `contribute(...)`. The core engine already has referral: use it, don't re-implement it. The only allowed file outside the module is `scripts/e2e/core_literal_allowlist.json`, and only if a guardian demands it, with a category and reason.
- **Prefer no migration.** If one is truly needed: read `.claude/skills/safe-migration/SKILL.md`; additive only (nullable / default fields, indexes); no data migration, no `CASCADE`, no drop/rename.
- **No data loss:** letters, referral tasks, issued numbers and `LetterDraftCopy` rows are never deleted.
- Entity kind constant: `LETTER_ENTITY = 'letters_letter'` (the plan text still shows the old `letters.letter`).
- Final chat message in Persian, very short and simple: what was built, test results, open items, PR link.

## 2. Environment (Linux cloud)

- First: `bash scripts/cloud/setup_cloud_env.sh > /tmp/setup.log 2>&1; tail -n 5 /tmp/setup.log`. If it fails, report and stop. For guardian 29: `backend/venv/bin/pip install import-linter==2.3` (don't edit the script).
- Python is `backend/venv/bin/python`. Run from `backend/` with `PYTHONUTF8=1` and **`WH_MODULES=warehouse,accounting,letters`** (letters is `opt_in`). Backend tests **only with app labels**, never an unlabeled `manage.py test`. Redirect output to `/tmp/<name>.log`; bring in only `tail -n 30` plus FAIL/ERROR headers. `workflow` tests are slow (~10 min): run them once at the end.

## 3. Task

Plan: `Documents/Release_v1/letters_module/plan_letters.md`. Grep the headings, then read only: «ن۷» (referral tree), «ن۸» (response deadline and reminders), «ن۱۸» (circulars), the last bullet of «ن۱۶» (live event), «ن۹» only the paragraph on who sees a letter through referral, «ل-ه» (files, tests), section 7 answers (final; س۴ = circular audience), and the progress-log entries for ل-ج and ل-د (their open items: archive/void do not close open referrals yet; internal letters and minutes are not yet auto-referred after registration).

Build exactly what «ل-ه» lists: `backend/modules/letters/letters/{referral.py, circulars.py, tests/test_referral_le.py}` plus the new endpoints in `views.py` / `urls.py` and the `contribute(...)` lines in `apps.py`.

Core referral API to use (read only these ranges):
- `backend/core/workflow/engine.py`: `can_refer:<entity_kind>` hook check (~line 1005–1020), `refer(user, instance_or_id, targets, *, kind, instruction='', due_at=None, parent_task=None)` (~line 1038, read its docstring), `open_for_referral(workflow_key, obj, user)` (~line 1171) and `referral_grants_view(user, kind, entity_id)` (~line 1198).
- `backend/core/workflow/registry.py` ~line 85–95 (`referral_only` workflow spec).
- `backend/core/workflow/serializers.py` `referral_node` (~line 124) for the tree payload; `backend/core/workflow/views.py` ~line 264 (why `open_for_referral` has no core API: the module calls it under its own permission).
- Core tests that show usage: `backend/core/workflow/tests/test_referral_23f.py` (`refer` helper ~line 32, `open_for_referral` test ~line 277).
- «Who saw it»: `backend/core/attachments/services.py` `record_entity_view` (~line 98) — find the matching read side there; ل-ج already records views of confidential letters.
- Reuse ل-ج/ل-د helpers, never duplicate: `letters/access.py` (`visible_letters`, `can_view_letter`, `has_company_perm`, `SECRETARIAT_PERM`), `letters/views.py` (`_visible_or_404`, `_audit`), `letters/services/lifecycle.py` (registration hook point for auto-referral).

Key acceptance points (from «ل-ه», all with tests):
- The secretariat gives the root referral (`can_refer:letters_letter`); others refer only inside their own branch per ن۷.
- `can_view_letter` adds referral: a user outside the referral tree does not see the letter; a referral recipient still sees it after their task is closed (`referral_grants_view`).
- Internal letters and minutes are referred to their recipients automatically after registration, in the registration transaction and idempotent.
- The default response deadline comes from the letter (`response_due_at`, else the company setting `default_due_days`); reminders follow ن۸ using the core scheduler, not a new one.
- A circular is visible to its audience (company or section, `CircularAudience`) and to nobody else; it creates no task in «my tasks» (decision in progress log of ل-الف).
- No referral to a user of another company, or to an inactive member.
- Archive and void close the letter's open referral tasks (ل-د open item) without deleting them.
- Live event at the end of ن۱۶ through the existing realtime path (Grep how another module emits one; don't add a new channel).
- Superuser never refers (core already refuses; keep a test).
- **Fix carried over from the ل-د review (required):** on the *first* submit of a confidential or secret letter, `engine.submit` creates the instance with `allow_substitute=True`, opens the first sign task and queues the `RECEIVED` event (`core/workflow/engine.py` ~350–361, `events.py` ~58–73) before `lifecycle.submit_for_signing` calls `set_allow_substitute(False)`. So a signer's substitute gets one notification revealing that a confidential letter exists and who signs it. Fix: add an optional keyword `allow_substitute=None` to `engine.submit` (~line 583) that, when not None, is set on the instance before the first step opens; pass `allow_substitute=not letter.is_confidential` from `submit_for_signing` and drop the after-the-fact `set_allow_substitute` call there. This small core change is the one allowed exception to ق1 in this step. Test: a signer with an active `WorkflowSubstitute` row → the substitute gets no notification row and no task for a confidential letter, on first submit and on re-submit after return.

## 4. Checks before handoff

- From `backend/` (with `WH_MODULES=warehouse,accounting,letters`): `manage.py test letters workflow`; `manage.py check` three times: default (no `WH_MODULES`), `WH_MODULES=accounting,letters`, and `WH_MODULES=warehouse`; `manage.py makemigrations --check --dry-run`.
- Guardians from the repo root with the backend venv python: `scripts/e2e/guardian_modularization.py` (29), `guardian_57_front_module_fence.py`, `guardian_58_scoped_has_perm.py`.
- Self-review against `.claude/agents/tenant-scope-reviewer.md` and `.claude/agents/data-loss-reviewer.md` (read each checklist and apply it to your diff; no subagents). Fix every confirmed finding before the PR.
- Progress-log entry for ل-ه at the end of `plan_letters.md` (status, decisions, deviations, tests and results, open items, next action: ل-و).
- Open a PR to `main` titled `feat(letters): referral, response deadline and circulars (letters ل-ه)`.
