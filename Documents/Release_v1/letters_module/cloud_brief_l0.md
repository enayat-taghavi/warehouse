# Cloud brief — sub-step ل-۰: person-chosen signers in the core workflow engine

For a Claude Code **cloud** session. Small, generic core change that the letters module needs (user approved option «الف», question س۱ of the plan).

## 1. Rules (override defaults)

- Read `CLAUDE.md` first. Parts about Windows paths, Antigravity, `app`/`soft`, Windows Terminal, scheduled chains and `localhost:4300` do not apply here; never touch `app` or `soft`.
- Work only on your session branch; never push to `main`. Commit after each green chunk and push (the user pays from a small balance: if credit or context runs low, push what you have and write the open items in the progress log). No `Co-Authored-By` trailer.
- **Budget:** read narrowly (Grep the symbol, then read its range). No subagents, no browser, no frontend. Target ≤ ~60 tool calls.
- Final chat message in Persian, very short and simple: what changed, test results, open items, PR link.

## 2. Environment (Linux cloud)

- First: `bash scripts/cloud/setup_cloud_env.sh > /tmp/setup.log 2>&1; tail -n 5 /tmp/setup.log` (installs postgres, backend venv, frontend deps; idempotent). If it fails, report and stop.
- Python is `backend/venv/bin/python` (not `venv/Scripts/python.exe`). Run from `backend/` with `PYTHONUTF8=1`.
- Backend tests **only with app labels**, never an unlabeled `manage.py test` (it runs root scripts against the database). Redirect output to `/tmp/<name>.log` and bring in only `tail -n 30` plus FAIL/ERROR headers.

## 3. Task

Plan: `Documents/Release_v1/letters_module/plan_letters.md` — read only «ن۶» (Grep `### ن۶`) and «ل-۰» (Grep `### ل-۰`). Background on the referral track: `Documents/Release_v1/2.3_workflow/plan_2.3f_referral.md`, «تصمیم‌ها» only.

Add an optional per-step hook `assignees(obj) -> list[user_id]` to `StepSpec`, so a module can declare a step whose recipients are specific people chosen on the document (the letter's signers in order), instead of role holders. Generic: core must not name the letters module.

Files and where to look (3 Nov 2026 line numbers):
- `backend/core/workflow/registry.py` (232 lines): `class StepSpec` at 45, `_validate_step` at 134.
- `backend/core/workflow/engine.py` (1213 lines): `_compute_recipients` 239, `_open_task` 305, `_enter_step` 319, `_advance` 339, `_authorize` 602, `can_act` 899, `task_grants_view` 922. Tasks already carry `target_user` (from 2.3-و); reuse it, no migration.
- `backend/core/workflow/recompute.py` (251) and `recipients.py` (316): role-change recompute must not drop or reassign a person-chosen task.
- New test: `backend/core/workflow/tests/test_assignees_letters0.py` (use `tests/base.py` helpers; look at `test_referral_23f.py` for the target-user pattern).

Behaviour to cover with tests:
1. A step with `assignees` opens a task for the listed user (`target_user`); only that user (or an allowed substitute when the spec allows substitutes) may act.
2. Several signers in order: a repeated approval step per signer, advancing in order; «عودت برای اصلاح» returns to the start as today.
3. A role change of the assignee does not remove the task; a user who left the company (inactive membership) leaves the task without a recipient, with the existing wait/no-recipient reason.
4. Confirm by reading `_advance` that a spec's `on_state_change` runs inside the same transaction as the final approval (the letters module will issue the number there). Write the finding in the progress log; change nothing if it already holds.
5. All existing workflows behave exactly as before.

## 4. Checks before handoff

- `PYTHONUTF8=1 backend/venv/bin/python manage.py test workflow personnel` (from `backend/`) all green; `manage.py check`.
- Guardians: `python scripts/e2e/guardian_modularization.py` (29), `guardian_57_*.py`, `guardian_58_*.py` (from repo root, with the backend venv python). Failures that also fail on `main` are pre-existing: say so.
- Self-review against `.claude/agents/tenant-scope-reviewer.md` (read its checklist and apply it to your diff; no subagent).
- Add a note to `Documents/Release_v1/2.3_workflow/plan_2.3f_referral.md` progress log, and a progress-log entry for ل-۰ at the end of `plan_letters.md` (status, decisions, tests and results, open items, next action: ل-ب).
- Open a PR to `main` titled `feat(workflow): person-chosen step assignees (letters ل-۰)`.
