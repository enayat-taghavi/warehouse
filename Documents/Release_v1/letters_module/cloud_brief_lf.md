# Cloud brief — sub-step ل-و: frontend manifest, list, compose and offline draft

For a Claude Code **cloud** session. Frontend only. The backend of the letters module is complete on `main` (ل-ب … ل-ه, under `backend/modules/letters/`): drafts and edit API, access rules, signing, registration and numbering, referral tree, response deadline, circulars. This step builds the first frontend pages. Display of one letter, the referral tree UI and the secretariat register are ل-ز (next step), not this one.

## 1. Rules (override defaults)

- Read `CLAUDE.md` first. Parts about Windows paths, Antigravity, `app`/`soft`, Windows Terminal, scheduled chains and `localhost:4300` do not apply here; never touch `app` or `soft`.
- Work only on your session branch; never push to `main`. Commit after each green chunk and push (the user pays from a small balance: if credit or context runs low, push what you have and write the open items in the progress log). No `Co-Authored-By` trailer.
- **Budget:** read narrowly (Grep the symbol, then read its range). No subagents, no browser, no backend change. Target ≤ ~100 tool calls.
- **Core and shell stay untouched (ق1):** everything goes in `frontend/src/app/modules/letters/`, wired only through the module manifest (`module.ts`) and its extensions. The only files outside the module you may change: `frontend/src/app/modules/installed-modules.ts` **only** through `node tools/gen-installed-modules.js` (letters is `optIn`, so the committed default file must stay without it; check the diff), and `scripts/e2e/core_literal_allowlist.json` only if a guardian demands it, with a category and reason.
- **No data loss (hard rule):** a queued offline draft is removed only on explicit server acceptance (2xx) or explicit rejection (4xx); 5xx or unreachable means retry, never delete. A `200` with `conflict: true` keeps the user's text (the server stores a `LetterDraftCopy`) and shows «نسخهٔ ناهمگام». A `404` on PATCH (letter no longer visible) keeps the local row and tells the user (ل-ج open item). Use `isServerUnreachable()` from `core/services/server-reachability.ts`, never `status >= 500` or `status === 0`. Never clear a cache or a queue.
- UI text Persian and short (full text only in `title`/hint). Icons only `<svg appIcon="name">` from `shared/icons/` (no inline svg; guardian 52). Semantic tokens `surface`/`fg`/`line`. Responsive rules of `.claude/skills/design-system/SKILL.md` (read it once): icon-only on mobile unless the row fits, touch targets ≥ 40×40, Persian `title` and `aria-label`, no horizontal scroll at 360 px, four states (loading, empty, error, offline).
- Final chat message in Persian, very short and simple: what was built, test results, open items, PR link.

## 2. Environment (Linux cloud)

- First: `bash scripts/cloud/setup_cloud_env.sh > /tmp/setup.log 2>&1; tail -n 5 /tmp/setup.log` (it runs `npm ci` in `frontend/`). If it fails, report and stop. For guardian 29: `backend/venv/bin/pip install import-linter==2.3`.
- **Specs:** the full `ng test` does not compile (18 old spec files have type errors). Make a narrow tsconfig like `frontend/tsconfig.companies.spec.json` (extends `./tsconfig.json`, `types: ["vitest/globals", "node"]`, `include` = `src/**/*.d.ts` plus only your new spec files) and run `npx ng test --ts-config <that file> --watch=false` from `frontend/`. Keep that tsconfig outside the commit (`/tmp` or delete it before commit) unless you name it `frontend/tsconfig.letters.spec.json` and keep it on purpose. Redirect output to `/tmp/<name>.log`; bring in only `tail -n 30` plus FAIL headers.
- Type check: `npx tsc -p tsconfig.app.json --noEmit` from `frontend/`.

## 3. Task

Plan: `Documents/Release_v1/letters_module/plan_letters.md`. Grep the headings, then read only: «ن۱۱» (offline), «ن۱۴» (block editor), «ن۱۶» (pages), «ن۱۵» (glossary), «ل-و» (files and tests), section 7 answers, and in the progress log (section 8) the entries of ل-ج (API shape, conflict rules, open item on PATCH 404) and ل-ه (new endpoints; the live `document_changed` event now goes only to the personal channels of people who see the letter, plus the company channel for a registered company-wide circular).

Build exactly what «ل-و» lists: `frontend/src/app/modules/letters/{module.ts, nav-items.ts, letters.routes.ts, letters.models.ts}`, `services/{letters-api.service.ts, letters-offline.ts}`, `components/{letter-list/, letter-compose/, letter-editor/, party-picker/}` (each `.ts`, `.html`, `.spec.ts`).

Read only these ranges:
- Opt-in module pattern: `frontend/src/app/modules/showcase/{module.ts, nav-items.ts, showcase.routes.ts}` (whole files, short). Copy its shape: `optIn: true`, `scopeKind`, `permissionMarkers: ['view_letters_hub']`, `launcherTile`, `layoutNav`, `operations`, `users.permissionGroup`, `healthDashboard.panel`, `offlineSync` (own `dbName`, `queueUrlPatterns: ['/letters/']`, `activePathPatterns: ['/app/letters']`).
- Contract: `frontend/src/app/core/modules/module-contract.ts` `ExtensionMap` (~line 313) and `syncConfig` / `offlineSync` (~line 528–565).
- Offline queue: `frontend/src/app/core/services/offline-sync.service.ts` `enqueue` (~line 315), `getQueueEntries` (~379), `resolveConflict` (~456), `getCachedEntry` (~397). Reuse it; don't write a second queue.
- Backend manifest for names: `backend/modules/letters/module.py` (permission codes and labels; the front `users.permissionGroup.codenames` must match the backend module permissions, or `scripts/e2e/module_coupling_scan.py` fails).
- Backend API (read the views only for request/response shape you need): `backend/modules/letters/letters/urls.py`, `serializers.py` (block-text validation of ن۱۴: paragraph with alignment, list, table; max 200 blocks and 100 000 characters), `views.py` list/create/detail/lock/discard/parties/projects/link-kinds/circulars.
- Live event: Grep `document_changed` in `frontend/src/app/core/services/` and reuse the existing listener; don't add a channel.

Key acceptance points (from «ل-و», all with Vitest DOM specs):
- List filters live in the URL (query params), and the list re-reads on a `document_changed` event for `letters_letter`.
- Card layout at 360 px with no horizontal scroll.
- The editor pastes plain text only (no HTML from the clipboard).
- An offline draft goes into the queue; a 5xx (or unreachable) response does not remove it; 2xx removes it; 4xx moves it to the error list without losing the text.
- `conflict: true` shows «نسخهٔ ناهمگام» and keeps the local text.
- Register and sign buttons are disabled offline (actions are online-only).
- `tsc` clean.

## 4. Checks before handoff

- New specs green with the narrow tsconfig; `npx tsc -p tsconfig.app.json --noEmit` clean.
- Guardians from the repo root with the backend venv python: `scripts/e2e/guardian_52_icon_registry.py`, `guardian_55_clickable_ergonomics.py`, `guardian_56_change_integrity.py --base origin/main --head HEAD`, `guardian_57_front_module_fence.py`, `guardian_58_scoped_has_perm.py`, `guardian_modularization.py` (29).
- `node tools/gen-installed-modules.js` default output unchanged in the commit (letters is opt-in); `node tools/build-for-modules.js` not needed.
- Self-review against `.claude/agents/data-loss-reviewer.md` (offline queue) and `.claude/agents/ui-reviewer.md` (read each checklist and apply it to your diff; no subagents). Fix every confirmed finding before the PR.
- Progress-log entry for ل-و at the end of `plan_letters.md` (status, decisions, deviations, tests and results, open items, next action: ل-ز).
- Open a PR to `main` titled `feat(letters): frontend list, compose and offline draft (letters ل-و)`.
