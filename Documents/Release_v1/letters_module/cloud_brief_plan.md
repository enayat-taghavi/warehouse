# Cloud brief — write the detailed plan for the company letters module (step 1)

This brief is for a Claude Code **cloud** session. It writes a plan document only. No code changes.

## 1. Rules (read first, they override defaults)

- Read `CLAUDE.md` (root) first. Its domain rules apply. The parts about Windows paths, Antigravity, `app`/`soft` releases, Windows Terminal, scheduled chains and `localhost:4300` do **not** apply in the cloud: you have none of those. Never touch `soft` or `app`.
- Reply and write the plan in **simple, fluent Persian**. English only for file names, paths, code and identifiers. Wrap the plan content in `<div dir="rtl" align="right">…</div>` like the other plan docs.
- **Deliverable:** only these files may change:
  - `Documents/Release_v1/letters_module/plan_letters.md` (new)
  - `Documents/Release_v1/release_v1_master_plan.md`: one short row or line in the progress table / section 5 pointing to the new plan. Nothing else in it.
- No code, no migrations, no installs, no test runs, no browser. Reading code is fine.
- **Budget (the user pays per token from a small balance):** read narrowly: Grep the headings first, then read only the needed ranges. No broad exploration and no subagents. Target ≤ ~60 tool calls in total.
- **Never lose work:** commit and push to your session branch after the first full draft and after each later round of edits. Open a PR to `main` titled `docs(letters): detailed plan for the letters module (step 1)` once the first draft is pushed. Never push to `main`. No `Co-Authored-By` trailer.
- If credit or context runs low, stop early: push what you have and write the open items at the end of the plan.

## 2. What to read (in this order, only these unless a gap forces more)

1. `Documents/Release_v1/letters_prerequisites/letters_core_requirements.md`: the whole file. Its section 1 holds the user's decisions; treat them as fixed.
2. `Documents/Release_v1/release_v1_master_plan.md`: the rules section (ق1–ق18; Grep `ق۱` … `ق۱۸`) and section 5 «بعد از نسخهٔ اول».
3. The core sub-plans the module stands on. Read only their «تصمیم‌ها» and «معیار پذیرش» sections:
   - `Documents/Release_v1/2.3_workflow/plan_2.3_workflow.md` and `plan_2.3f_referral.md` (workflow engine, referral tree track)
   - `Documents/Release_v1/2.6_attachments_settings/plan_2.6_attachments_settings.md` (attachments, `can_view`, `is_locked`, history)
   - `Documents/Release_v1/2.7_shared_ui/plan_2.7_shared_ui.md` (single-sheet print template, person/role picker, glossary)
   - `Documents/Release_v1/2.8_numbering/plan_2.8_numbering.md` (numbering series, issue with counter lock, void numbers)
   - `Documents/Release_v1/2.4_notifications/plan_2.4_notifications.md` (notifications)
   - `Documents/Release_v1/3.1_parties/plan_3.1_parties.md` (external parties, `core/contacts`)
4. `Documents/Release_v1/glossary.md`: use its terms; list new terms the module adds.
5. `.agents/AGENTS.md`: §3 (exports, cartable concurrency, WebSocket, Shamsi dates, sensitive RBAC) and §7 (grid ergonomics, sticky command center, subtabs).
6. Module shape, to copy the pattern (headers and registration only):
   - `backend/core/platform_core/module_catalog.py`, `backend/modules/showcase/module.py`, `backend/modules/accounting/module.py`
   - `frontend/src/app/modules/installed-modules.ts`, `frontend/src/app/core/modules/module-contract.ts`, `frontend/src/app/modules/showcase/`
   - How a module registers workflow / numbering / `can_view` hooks: Grep `contribute(` and the registry names in `backend/core/` (apps `workflow`, `numbering`, `attachments`, `contacts`, `notifications`).

## 3. What the plan must contain

Follow the layout of `plan_2.8_numbering.md`: «قانون‌های مرتبط», «وضع فعلی», «تصمیم‌ها», «کارها», «اجرا», «معیار پذیرش», «بیرون از این مرحله», «گزارش پیشرفت». Inside «تصمیم‌ها» / «کارها» cover:

- **Scope:** step 1 only: internal, outgoing, incoming (scan and register), minutes, circulars. Step 2 (public portal on the website) is out of scope; only note which hooks step 2 will need later (requirements doc section 4).
- **Module form:** a new installable module (backend `modules/letters/…` + frontend `modules/letters/…`). It changes nothing in core (ق1); module-specific behaviour goes only through registries and extensions. Respect guardians 29 and 57 (no cross-module refs, no module literals in core).
- **Data model:** letter, letter type, secretariat (one per company), recipients and CC, confidentiality level, «پیرو» / «بازگشت به», link to another document (invoice, contract) through the core registry, attachments, signed-scan attachment, drafts and group editing, response deadline and reminder. Company scope on every model.
- **Lifecycle:** the two phases from the requirements doc: phase 1 linear signing (number issued only at registration, never offline), phase 2 the open referral tree with paraph (from 2.3-و). After registration the body and the main attachments are locked (`is_locked`); corrections only through a new letter.
- **Numbering:** prefix + year + sequence per letter type and company (`۱۴۰۵/ص/۱۲۳`) on the 2.8 engine.
- **Signature:** per letter, electronic (signature and seal image on the PDF) or print-and-sign (scan attached).
- **Permissions and visibility:** module permissions in `module.py` (`PERMISSIONS`, `PERMISSION_CODENAMES`); who sees a letter (`can_view`: author, signers, recipients, CC, referral tree, secretariat, confidentiality); sensitive data rules (ق16).
- **Offline:** what works offline (drafts only) and what never does (number, register, sign). No data-loss path: queue records are deleted only on 2xx/4xx, never on 5xx.
- **UI pages:** list and filters, compose/edit, view with referral tree, secretariat register, print. Rich-text editor and the referral-tree view are built inside the module. Follow the `design-system` skill (`.claude/skills/design-system/`) and the mobile rules. Labels are short (e.g. «نامهٔ صادره», not long sentences).
- **Print/PDF:** on the 2.7 single-sheet template (letterhead, number/date box, signature, seal, QR).
- **Sub-steps:** split into sub-steps, each small enough for one cloud session and committed on its own. Example: الف) backend models + migrations + registries, ب) API + permissions + `can_view`, ج) workflow and referral, د) frontend list/compose/view, ه) print and secretariat. For each one list the exact files, the tests (backend tests by app label only, never an unlabeled `manage.py test`; Vitest DOM specs), the guardians to run (29, 52, 56, 57, 58) and the reviewers (`tenant-scope-reviewer` on every permission/scope step, `data-loss-reviewer` on migrations and offline).
- **Acceptance criteria** per sub-step.
- **Open questions:** business decisions not settled by the requirements doc go in a short numbered list for the user. Don't guess them. Put your recommended answer next to each.

## 4. Done means

- `plan_letters.md` is complete, pushed, and the PR to `main` is open.
- Final chat message in Persian, very short and simple: what the plan covers, the number of sub-steps, the open questions (one line each), and the PR link.
