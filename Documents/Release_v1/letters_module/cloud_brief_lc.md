# Cloud brief — sub-step ل-ج: letters API, access and `can_view` (backend)

For a Claude Code **cloud** session. Backend only. ل-۰ (person-chosen step assignees) and ل-ب (module skeleton, models, migration, registry hooks under `backend/modules/letters/`) are already on `main`.

## 1. Rules (override defaults)

- Read `CLAUDE.md` first. Parts about Windows paths, Antigravity, `app`/`soft`, Windows Terminal, scheduled chains and `localhost:4300` do not apply here; never touch `app` or `soft`.
- Work only on your session branch; never push to `main`. Commit after each green chunk and push (the user pays from a small balance: if credit or context runs low, push what you have and write the open items in the progress log). No `Co-Authored-By` trailer.
- **Budget:** read narrowly (Grep the symbol, then read its range). No subagents, no browser, no frontend. Target ≤ ~80 tool calls.
- **Core stays untouched** (ق1): everything goes in `backend/modules/letters/`, wired through `contribute(...)` and `module.py`. The only allowed file outside the module is `scripts/e2e/core_literal_allowlist.json`, and only if a guardian demands it, with a category and reason.
- **No migration in this step.** If you find a model gap, stop and write it as an open item; do not add `0002`.
- **No data loss** (offline queue, ن۱۱): a queued write is never dropped. A version conflict answers 200 with `conflict` and keeps the incoming text as a `LetterDraftCopy`; nothing is ever hard-deleted (discard = `void`).
- Final chat message in Persian, very short and simple: what was built, test results, open items, PR link.

## 2. Environment (Linux cloud)

- First: `bash scripts/cloud/setup_cloud_env.sh > /tmp/setup.log 2>&1; tail -n 5 /tmp/setup.log`. If it fails, report and stop. If guardian 29 needs it, `backend/venv/bin/pip install import-linter==2.3` (the script does not install it yet; note it as an open item, don't edit the script).
- Python is `backend/venv/bin/python`. Run from `backend/` with `PYTHONUTF8=1` and **`WH_MODULES=warehouse,accounting,letters`** (letters is `opt_in`). Backend tests **only with app labels**, never an unlabeled `manage.py test`. Redirect output to `/tmp/<name>.log`; bring in only `tail -n 30` plus FAIL/ERROR headers.

## 3. Task

Plan: `Documents/Release_v1/letters_module/plan_letters.md`. Grep the headings, then read only: «ن۳» (lifecycle, which fields lock when), «ن۹» (permissions and who sees a letter — the whole section), «ن۱۰» (draft editing, edit lock, `revision`), «ن۱۱» (offline, server side only), «ن۱۳» (links, follow-up, reply-to), «ن۱۴» (block body validation), «ن۲» only the `project` paragraph, «ل-ج» (files, API, tests), section 7 answers (final), and the ل-ب progress-log entry (its open items are yours: `can_view:letters.letter`, same-company checks for `project`, `sender_party`, recipient `party` and `user`).

Build exactly what «ل-ج» lists: `backend/modules/letters/letters/{serializers.py, views.py, urls.py, permissions.py, access.py, parties.py, links.py, tests/test_api_lc.py, tests/test_access_lc.py}`, plus `url_includes` in `backend/modules/letters/module.py` and the new `contribute(...)` lines in `letters/apps.py`.

Patterns to copy (read only the named range):
- Registry semantics: `backend/core/platform_core/registry.py` lines ~160–240 (`can_view` / `can_attach` return True | False | None; None = no opinion; how audit, attachments and print use them).
- A real module's document hooks: `backend/modules/accounting/personnel/workflows.py` `can_view_invoice` / `can_attach_invoice` (~line 187–205) and their registration in `backend/modules/accounting/personnel/apps.py` ~lines 95–145.
- Company scope: `backend/core/companies/permissions.py` (56 lines, `requires_company_scope`), `backend/core/accounts/scope.py` `user_company_ids` (~line 63), and how accounting views check section permissions in the same company (Grep `codes_in_company` in `backend/modules/accounting/`; read one view that uses it).
- `url_includes` and `SUPERUSER_WRITE_FENCE`: `backend/modules/accounting/module.py` (Grep `url_includes`, line ~55) and `backend/core/accounts/superuser_fence.py` header.
- Audit: `backend/core/accounts/audit_utils.py` `log_audit_event` (line ~88).
- External parties: `backend/core/contacts/models.py` (51 lines) and the contacts service the plan names in ن۹/ل-ج; `parties.py` wraps it, it does not copy it.

Key acceptance points (from «ل-ج», all with tests):
- A user of another company gets 404 on every letter endpoint; lists only ever show letters `can_view` allows.
- Secretariat staff see a confidential/secret letter's register row but not its subject/body (ن۹ cover).
- Attachments and audit history of a letter the user may not see stay hidden (`can_view` / `can_attach` hooks registered).
- `project` from another company → 400; `GET /api/letters/projects/` counts only letters in the user's allowed queryset.
- Same-company checks for `sender_party`, recipient `party`/`user`, `follow_up_of`, `reply_to` and links.
- The same `client_temp_id` posted twice → one letter (200 with the existing one the second time).
- Stale `revision` on PATCH → 200 with `conflict`, server text unchanged, incoming text saved as `LetterDraftCopy`.
- Edit lock: `lock` / `unlock` / expiry per ن۱۰; only the lock holder can PATCH while locked.
- Superuser: read-only on `/api/letters/` (fence).
- Locked statuses (`Letter.LOCKED_STATUSES`) refuse edits to the locked fields.
- List endpoint has no N+1: `assertNumQueries` with 1 and with 5 letters gives the same count.

## 4. Checks before handoff

- From `backend/` (with `WH_MODULES=warehouse,accounting,letters`): `manage.py test letters attachments contacts`; `manage.py check` three times: default (no `WH_MODULES`), `WH_MODULES=accounting,letters`, and warehouse only (`WH_MODULES=warehouse`); `manage.py makemigrations --check --dry-run` (must report no changes).
- Guardians from the repo root with the backend venv python: `scripts/e2e/guardian_modularization.py` (29), `guardian_57_front_module_fence.py`, `guardian_58_scoped_has_perm.py`. Guardian 57 failing on `layout-modular.dom.spec.ts` (core → module import) is pre-existing on `main` and unrelated: say so, don't fix it.
- Self-review against `.claude/agents/tenant-scope-reviewer.md` and `.claude/agents/data-loss-reviewer.md` (read each checklist and apply it to your diff; no subagents). Fix every confirmed finding before the PR.
- Progress-log entry for ل-ج at the end of `plan_letters.md` (status, decisions, deviations, tests and results, open items, next action: ل-د).
- Open a PR to `main` titled `feat(letters): API, access rules and can_view (letters ل-ج)`.
