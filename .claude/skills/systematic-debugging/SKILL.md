---
name: systematic-debugging
description: Systematic debugging. Whenever you encounter an error, bug, unexpected behavior, a test or guardian failure, or a breakage report from the user, use this before proposing or applying any fix. Invoke at most once per session; re-invoke only if it is no longer in context.
---

# Systematic debugging

**Core rule: make no fix without finding the root cause.**
- Fixing the symptom instead of the cause is a failure.
- This rule holds even when there is a rush or the problem seems simple.

## Step zero: which layer is the error from?
Every request's path: browser (Service Worker and offline queue) → Cloudflare Tunnel → express on port 4200 → daphne on port 8000 → Postgres. All of these run on this same machine, i.e. the `app.farsalish.ir` test/staging environment (no real users; production is `soft.farsalish.ir`).
- **520 to 530, and 502 to 504:** the origin is unreachable and it is not a Django bug. Check these:
  - `netstat -ano | grep -E ":(8000|4200) .*LISTENING"`
  - `tasklist //FI "IMAGENAME eq cloudflared.exe"`
  - `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/public/config/`
- **500 from Django:** DEBUG is off and the error page shows no details. The traceback is saved in `backend/logs/django-errors.log`; read it with the Read tool. If it is not there, obtain it via "Safe reproduction" (below).
- **4xx:** read the full response body; the cause is usually validation, permissions, or company and warehouse scope.
- **Only in the browser or in offline mode:** check the Dexie queue, the Service Worker (`ngsw`) and the `isServerUnreachable()` logic.

## Phase 1: Investigate the cause
1. Read the error message and stack trace **in full** and note the file path and line number.
2. Reproduce the error consistently. If it is not consistent, gather evidence; do not guess.
3. Look at recent changes (`git log`, `git diff`), and at **the code that is actually running**:
   - Compare the daphne process start time with the file modification times; the code on disk is not the same as the code in memory.
   - Compare the build time of `frontend/dist/` with the frontend changes. The client may also be running a cached Service Worker version.
4. In a multi-layer system, gather evidence at each layer boundary to find exactly where it breaks.
5. Trace the bad data backward to its origin. Fix it there, not where the error appeared.

## Phase 2: Pattern
- Find a similar working example in this same codebase (a sibling service or view) and list the differences.
- Read the reference or pattern in full, without skimming.

## Phase 3: Hypothesis
- Write one specific hypothesis: "X is the cause, because Y".
- Run the smallest possible test and change only one variable at a time.
- If the hypothesis is rejected, form a new hypothesis and do not stack fixes on top of each other. If you do not know, say so explicitly.

## Phase 4: Fix
1. First build a test that shows the error: a unit test, a guardian in `scripts/e2e/`, or a reproduction script.
2. Only **one** fix for the root cause; no multiple simultaneous changes, no side "improvements".
3. Confirm with the `verification-before-completion` skill that the original symptom is gone.
4. If three fixes in a row fail, stop. The problem is probably in the architecture; raise it with the user.

## Safe reproduction
The local database is the `app` test/staging database; it has no real users, but its data is still never deleted.
- Any reproduction that writes to the database must run inside `transaction.atomic()` with `transaction.set_rollback(True)` (like guardian 43). Do not create any persistent test data.
- To get an endpoint's traceback, call it in `manage.py shell` with `rest_framework.test.APIClient` and `force_authenticate(user=...)`. Errors surface in that same shell. Send write requests inside a rollback transaction.
- A fix that opens a path to data deletion or loss must be raised with the user before it is applied.
- Search Persian text with the Grep tool, and do not read `.env`.

## Red flags: stop and return to Phase 1
- "I'll make a quick fix for now and investigate later."
- "Let me change X and see if it gets fixed."
- Several simultaneous changes, or a fix without reproducing the error.
- "It's probably due to …", without any evidence.
- Each fix creates a new problem somewhere else.

---
Based on the principles of the systematic-debugging skill in [obra/superpowers](https://github.com/obra/superpowers) (MIT license); rewritten from scratch for this project.
