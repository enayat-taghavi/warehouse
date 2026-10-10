---
name: verification-before-completion
description: Verification before declaring completion. Use this before saying "done", "fixed", "passed" or "it works", before a commit or deploy, and before reporting a subagent's work. Invoke at most once per session; re-invoke only if it is no longer in context.
---

# Verification before declaring completion

**Core rule: no completion claim without fresh evidence.** Evidence means the output of a command you ran in this same turn; not a previous run and not a guess.

## The gate
1. **Identify:** which command proves this claim?
2. **Run:** run that command, fully and fresh.
3. **Read:** read the full output and the exit code, and count the failures.
4. **Match:** does the output actually confirm the claim?
5. **Only then** make the claim. If it did not confirm it, state the actual status along with its evidence.

## Claim → required evidence in this project
- **TypeScript is correct** → `npx tsc --noEmit -p tsconfig.app.json` in `warehouse-front` with exit code 0. "The edit was simple" is not enough.
- **Backend is healthy** → `./venv/Scripts/python.exe manage.py check` with no ERROR. The `communications.W001` warning (missing Redis) is normal with DEBUG off.
- **Migration is safe** → the `safe-migration` skill. Skimming the migration file is not enough.
- **Guardians pass** → `python scripts/e2e/guardian_all.py`, reporting the pass and fail counts. Running one guardian instead of all is not enough.
- **Tests pass** → actual test output with zero failures. "It should pass" is not enough.
- **Bug is fixed** → you reproduced the original symptom and now it no longer appears. "I changed the code" is not enough.
- **Deployed** → all four pieces of evidence together:
  - Build with exit code 0
  - ngsw patch success message
  - Port 8000 with a new PID
  - 200 response from `https://app.farsalish.ir/` and `https://app.farsalish.ir/api/public/config/`
- **A subagent did it** → look at `git diff` yourself. A subagent's "success" report is not enough.
- **A hook or setting works** → a live test: a pipe-test and one real run. Valid JSON is not enough.

## What I cannot verify; say so explicitly
- **Pages behind login** (dashboard, warehouses, counting): I do not log in with a password. Verify server-side or on the login page as far as possible. Then say what remained "unverified" and how the user can see it.
- **Django tests:** the test database is not available. If a test did not run, say "did not run", not "passed".
- **Phase 1 to 5 guardians:** always fail on the local `app` database, because they have no E2E data. Report them separately and do not hide them.

## Red flags
- "Should work", "probably" or "looks right", before running the command.
- Expressing satisfaction ("Great!", "Done") before seeing the output.
- Trusting a subagent's report or a previous run.
- Partial verification instead of full: one file instead of all, or one guardian instead of all.

---
Based on the principles of the verification-before-completion skill in [obra/superpowers](https://github.com/obra/superpowers) (MIT license); rewritten from scratch for this project.
