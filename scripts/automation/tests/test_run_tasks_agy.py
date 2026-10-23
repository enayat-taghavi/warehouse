#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
آزمون خودکار run_tasks_agy.py با agy ساختگی (fake_agy.py) روی مخزن‌های git موقتی؛ مخزن اصلی دست نمی‌خورد.
اجرا:  python -X utf8 scripts/automation/tests/test_run_tasks_agy.py [-v] [-k NAME]
"""

import io
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import run_tasks_agy as R  # noqa: E402

FAKE = HERE / "fake_agy.cmd"
PY = sys.executable
PATCHED = {"STALL_TIMEOUT_SECONDS": 6, "RESUME_DELAY_SECONDS": 0, "LAUNCH_STAGGER_SECONDS": 0,
           "RAM_RESERVE_MB": 0, "RAM_PER_AGENT_MB": 0}


def git(cwd: Path, *args) -> str:
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8",
                          check=True).stdout.strip()


def write(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def py(code: str) -> str:
    return f'"{PY}" -c "{code}"'


def put(path: str, text: str) -> str:
    return py(f"import pathlib; p=pathlib.Path('{path}'); p.parent.mkdir(parents=True, exist_ok=True); "
              f"p.write_text('{text}')")


def commit(message: str, path: str) -> str:
    return f'git add {path} && git commit -qm "{message}"'


def exists_check(path: str) -> str:
    return py(f"import os,sys; sys.exit(0 if os.path.exists('{path}') else 1)")


def content_check(path: str, text: str) -> str:
    return py(f"import sys; sys.exit(0 if open('{path}').read().strip()=='{text}' else 1)")


def task(title: str, *, group="", scope="", verify=(), merged=(), run=(), fix=(), main=(), resume=(),
         first="", sleep=0) -> str:
    lines = [title, "", "<!-- runner"]
    if group:
        lines.append(f"parallel: {group}")
    if scope:
        lines.append(f'verify: "{PY}" scripts/automation/verify_tools.py scope --base {{base}} --allow {scope}')
    lines += [f"verify: {v}" for v in verify] + [f"verify-merged: {v}" for v in merged] + ["-->", ""]
    lines += [f"FAKE-RUN: {c}" for c in run] + [f"FAKE-FIX: {c}" for c in fix]
    lines += [f"FAKE-MAIN: {c}" for c in main] + [f"FAKE-ON-RESUME: {c}" for c in resume]
    if first:
        lines.append(f"FAKE-FIRST: {first}")
    if sleep:
        lines.append(f"FAKE-SLEEP: {sleep}")
    return "\n".join(lines) + "\n"


def _force_remove(func, path, _exc):
    os.chmod(path, stat.S_IWRITE)
    func(path)


class RunnerCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="agyrun-"))
        self.repo, self.state, self.wt_root = self.tmp / "repo", self.tmp / "state", self.tmp / "wt"
        self.repo.mkdir()
        self.state.mkdir()
        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "config", "user.email", "runner-test@example.invalid")
        git(self.repo, "config", "user.name", "runner test")
        git(self.repo, "config", "core.autocrlf", "false")
        write(self.repo / ".gitignore", "scratch/\nnode_modules/\nvenv/\n.env\n")
        write(self.repo / "a" / "x.txt", "one\n")
        write(self.repo / "b" / ".keep", "")
        write(self.repo / "notes.txt", "base\n")
        write(self.repo / "frontend" / ".keep", "")
        write(self.repo / "backend" / ".keep", "")
        write(self.repo / "tasks.md", "# Queue\n")
        tools = self.repo / "scripts" / "automation"
        tools.mkdir(parents=True)
        shutil.copy2(HERE.parent / "verify_tools.py", tools / "verify_tools.py")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "base")
        # پوشه‌های ignore‌شده‌ای که runner در worktree با junction یا کپی می‌سازد
        write(self.repo / "frontend" / "node_modules" / "marker.txt", "front deps\n")
        write(self.repo / "backend" / "venv" / "marker.txt", "backend venv\n")
        write(self.repo / "backend" / ".env", "SECRET=test\n")

        os.environ.update(FAKE_AGY_STATE=str(self.state), FAKE_AGY_PYTHON=PY, FAKE_AGY_MAIN=str(self.repo))
        self.saved = {k: getattr(R, k) for k in PATCHED}
        for k, v in PATCHED.items():
            setattr(R, k, v)
        self.out = io.StringIO()
        R._log_stream = self.out
        R._throttle = R.Throttle()

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(R, k, v)
        if R._log_file:
            R._log_file.close()
            R._log_file = None
        R._log_stream = sys.stdout
        if os.environ.get("KEEP_TMP"):
            print(f"kept {self.tmp}")
            return
        # worktreeها junction دارند؛ اول خود junctionها (هرگز محتوای مقصد)
        for wt in self.wt_root.glob("*/*"):
            R.remove_links(wt)
        shutil.rmtree(self.tmp, onexc=_force_remove)

    # ------------------------------------------------------------ helpers

    def queue(self, *blocks: str, commit_tasks=True):
        write(self.repo / "tasks.md", "# Queue\n\n===\n" + "\n===\n".join(blocks))
        if commit_tasks:
            git(self.repo, "add", "tasks.md")
            git(self.repo, "commit", "-qm", "queue")

    def runq(self, *extra) -> int:
        return R.main(["--tasks", str(self.repo / "tasks.md"), "--project", str(self.repo), "--agy", str(FAKE),
                       "--worktree-root", str(self.wt_root), *extra])

    def log(self) -> str:
        return self.out.getvalue()

    def turns(self) -> list[dict]:
        path = self.state / "turns.jsonl"
        return [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines()] if path.exists() else []

    def tasks_text(self) -> str:
        return (self.repo / "tasks.md").read_text(encoding="utf-8")

    def status(self) -> dict:
        return json.loads((self.repo / "scratch" / "logs" / "runner" / "status.json").read_text(encoding="utf-8"))

    def assert_clean_shared_dirs(self):
        self.assertEqual((self.repo / "frontend" / "node_modules" / "marker.txt").read_text(), "front deps\n")
        self.assertEqual((self.repo / "backend" / "venv" / "marker.txt").read_text(), "backend venv\n")

    # ------------------------------------------------------------ unit

    def test_scope_parsing_and_overlap(self):
        t = R.Task("t", "t", verifies=['python scripts/automation/verify_tools.py scope --base {base} --allow '
                                       'frontend/src/app/a/* frontend/x.ts --min-files 1'])
        self.assertEqual(R.task_scope(t), ["frontend/src/app/a/*", "frontend/x.ts"])
        self.assertFalse(R.scopes_overlap(["front/a/*"], ["front/b/*"]))
        self.assertTrue(R.scopes_overlap(["front/a*"], ["front/ab/x.ts"]))
        self.assertTrue(R.scopes_overlap(["front/*"], ["front/b/c.ts"]))
        self.assertIn("no `verify", R.group_blocker([t, R.Task("u", "u")]))

    def test_throttle_lowers_and_recovers(self):
        th = R.Throttle()
        th.active = 4
        th.note("connection forcibly closed")
        self.assertEqual(th.limit(10), 10)
        th.note("RESOURCE_EXHAUSTED: quota exceeded")
        self.assertEqual(th.limit(10), 3)
        th.until = 0
        self.assertEqual(th.limit(10), 4)

    def test_heavy_commands_run_one_at_a_time(self):
        cmd = py("import time; time.sleep(1.5)") + " && echo ng build"
        logs = self.tmp / "logs"
        threads = [threading.Thread(target=R.run_command, args=(cmd, logs / f"h{i}.log", self.tmp)) for i in range(2)]
        started = time.time()
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertGreaterEqual(time.time() - started, 3.0)

    def test_leftover_link_keeps_worktree(self):
        R.configure(self.repo, self.wt_root)
        path, branch = self.wt_root / "run" / "task-01", "runner/run/task-01"
        self.assertEqual(R.create_worktree(path, branch, git(self.repo, "rev-parse", "HEAD")), "")
        self.assertTrue(R.is_link(path / "frontend" / "node_modules"))
        (path / "scratch").mkdir()
        R.make_link(self.repo / "b", path / "scratch" / "leftover")
        R.remove_worktree(path, branch)
        self.assertTrue(path.exists())
        self.assertTrue((self.repo / "b" / ".keep").exists())
        self.assert_clean_shared_dirs()
        subprocess.run(["cmd", "/c", "rmdir", str(path / "scratch" / "leftover")], check=True)
        R.remove_worktree(path, branch)
        self.assertFalse(path.exists())
        self.assertEqual(git(self.repo, "branch", "--list", "runner/*"), "")
        self.assert_clean_shared_dirs()

    # ------------------------------------------------------------ sequential (step 1 behaviour)

    def test_sequential_task_runs_in_project(self):
        self.queue(task("Seq task", verify=[content_check("a/x.txt", "two")],
                        run=[put("a/x.txt", "two"), commit("seq: a", "a")]))
        self.assertEqual(self.runq(), 0, self.log())
        self.assertIn("[DONE] Seq task", self.tasks_text())
        self.assertEqual(Path(self.turns()[0]["cwd"]).resolve(), self.repo.resolve())
        self.assertFalse(self.wt_root.exists())

    # ------------------------------------------------------------ parallel

    def test_parallel_group_runs_concurrently_and_merges(self):
        write(self.repo / "notes.txt", "uncommitted user work\n")
        self.queue(
            task("Task A", group="g", scope="a/*", sleep=3,
                 verify=[exists_check("frontend/node_modules/marker.txt"),
                         exists_check("backend/venv/marker.txt"), exists_check("backend/.env")],
                 merged=[exists_check("b/y.txt")],
                 run=[put("a/x.txt", "A"), commit("task a", "a")]),
            task("Task B", group="g", scope="b/*", sleep=3,
                 run=[put("b/y.txt", "B"), commit("task b", "b")]),
            commit_tasks=False)
        self.assertEqual(self.runq(), 0, self.log())
        text = self.tasks_text()
        self.assertIn("[DONE] Task A", text)
        self.assertIn("[DONE] Task B", text)
        self.assertEqual((self.repo / "a" / "x.txt").read_text(), "A")
        self.assertEqual((self.repo / "b" / "y.txt").read_text(), "B")
        self.assertEqual(git(self.repo, "log", "-3", "--format=%s").splitlines()[:2], ["task b", "task a"])
        self.assertEqual((self.repo / "notes.txt").read_text(), "uncommitted user work\n")
        t1, t2 = self.turns()
        self.assertLess(max(t1["start"], t2["start"]), min(t1["end"], t2["end"]), "agents did not overlap")
        for t in (t1, t2):
            self.assertNotEqual(Path(t["cwd"]).resolve(), self.repo.resolve())
        self.assertEqual(list(self.wt_root.glob("*/*")), [])
        self.assertEqual(git(self.repo, "branch", "--list", "runner/*"), "")
        self.assert_clean_shared_dirs()
        self.assertEqual(self.status()["state"], "finished")

    def test_fix_round_and_uncommitted_work_in_worktree(self):
        self.queue(
            task("Task A", group="g", scope="a/*", verify=[content_check("a/x.txt", "good")],
                 run=[put("a/x.txt", "bad"), commit("a bad", "a")], fix=[put("a/x.txt", "good"), commit("a fix", "a")]),
            task("Task B", group="g", scope="b/*", verify=[exists_check("b/y.txt")],
                 run=[put("b/y.txt", "B"), commit("b", "b/y.txt"), put("b/z.txt", "left uncommitted")],
                 fix=[commit("b commit", "b")]))
        self.assertEqual(self.runq(), 0, self.log())
        self.assertIn("the worktree has uncommitted changes", self.log())
        self.assertEqual([t["kind"] for t in self.turns()].count("fix"), 2)
        self.assertEqual((self.repo / "a" / "x.txt").read_text(), "good")
        self.assertTrue((self.repo / "b" / "y.txt").exists())
        self.assertTrue((self.repo / "b" / "z.txt").exists())
        self.assertEqual(git(self.repo, "status", "--porcelain", "--untracked-files=no"), "M tasks.md")

    def test_error_and_stall_are_resumed_in_worktree(self):
        self.queue(
            task("Task A", group="g", scope="a/*", first="error-before",
                 resume=[put("a/x.txt", "A"), commit("a", "a")]),
            task("Task B", group="g", scope="b/*", first="stall",
                 resume=[put("b/y.txt", "B"), commit("b", "b")]))
        self.assertEqual(self.runq(), 0, self.log())
        self.assertIn("STALLED", self.log())
        # نوبت بی‌حرکت هرگز تمام نمی‌شود، پس فقط سه نوبت ثبت می‌شود
        self.assertEqual(sorted(t["kind"] for t in self.turns()), ["first", "resume", "resume"])
        self.assertTrue((self.repo / "b" / "y.txt").exists())

    def test_overlapping_scopes_run_sequentially(self):
        self.queue(
            task("Task A", group="g", scope="a/*", run=[put("a/x.txt", "A"), commit("a", "a")]),
            task("Task B", group="g", scope="a/sub/*", run=[put("a/sub/y.txt", "B"), commit("b", "a/sub")]))
        self.assertEqual(self.runq(), 0, self.log())
        self.assertIn("runs sequentially: scopes of", self.log())
        for t in self.turns():
            self.assertEqual(Path(t["cwd"]).resolve(), self.repo.resolve())

    def test_merge_conflict_aborts_and_keeps_worktree(self):
        write(self.repo / "notes.txt", "uncommitted user work\n")
        self.queue(
            task("Task A", group="g", scope="a/*", run=[put("a/x.txt", "A"), commit("a", "a")],
                 main=[put("a/x.txt", "main"), "git add a/x.txt", 'git commit -qm "main edit"']),
            task("Task B", group="g", scope="b/*", run=[put("b/y.txt", "B"), commit("b", "b")]),
            commit_tasks=False)
        self.assertEqual(self.runq(), 1, self.log())
        self.assertIn("cherry-pick aborted", self.status()["reason"])
        self.assertNotIn("[DONE] Task A", self.tasks_text())
        self.assertIn("[DONE] Task B", self.tasks_text())
        self.assertEqual((self.repo / "a" / "x.txt").read_text(), "main")
        self.assertEqual((self.repo / "notes.txt").read_text(), "uncommitted user work\n")
        self.assertNotEqual(subprocess.run(["git", "rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD"],
                                           cwd=self.repo, capture_output=True).returncode, 0)
        kept = list(self.wt_root.glob("*/task-01"))
        self.assertEqual(len(kept), 1)
        self.assertEqual((kept[0] / "a" / "x.txt").read_text(), "A")
        self.assert_clean_shared_dirs()

    def test_dirty_project_file_blocks_merge(self):
        self.queue(
            task("Task A", group="g", scope="a/*", run=[put("a/x.txt", "A"), commit("a", "a")]),
            task("Task B", group="g", scope="b/*", run=[put("b/y.txt", "B"), commit("b", "b")]))
        write(self.repo / "a" / "x.txt", "user edit, not committed\n")
        self.assertEqual(self.runq(), 1, self.log())
        self.assertIn("uncommitted changes in files this task changed", self.status()["reason"])
        self.assertEqual((self.repo / "a" / "x.txt").read_text(), "user edit, not committed\n")
        self.assertIn("[DONE] Task B", self.tasks_text())

    def test_rename_of_dirty_file_blocks_merge_before_any_pick(self):
        # یافتهٔ بازبین: diff خالص مسیر قدیم rename را نشان نمی‌داد و cherry-pick نیمه‌کاره می‌ماند
        write(self.repo / "b" / "old.txt", "old\n")
        git(self.repo, "add", "b/old.txt")
        git(self.repo, "commit", "-qm", "old file")
        self.queue(
            task("Task A", group="g", scope="a/* b/*",
                 run=[put("a/x.txt", "A"), commit("a", "a"), 'git mv b/old.txt b/new.txt && git commit -qm "mv"']),
            task("Task C", group="g", scope="c/*", run=[put("c/z.txt", "C"), commit("c", "c")]))
        write(self.repo / "b" / "old.txt", "user edit\n")
        self.assertEqual(self.runq(), 1, self.log())
        self.assertIn("uncommitted changes in files this task changed", self.status()["reason"])
        self.assertEqual((self.repo / "a" / "x.txt").read_text(), "one\n")
        self.assertEqual((self.repo / "b" / "old.txt").read_text(), "user edit\n")
        self.assertFalse(R.cherry_pick_in_progress())
        self.assertIn("[DONE] Task C", self.tasks_text())

    def test_failed_task_keeps_worktree_then_resume_merges_it(self):
        self.queue(
            task("Task A", group="g", scope="a/*", verify=[content_check("a/x.txt", "good")],
                 run=[put("a/x.txt", "bad"), commit("a bad", "a")],
                 resume=[put("a/x.txt", "good"), commit("a good", "a")]),
            task("Task B", group="g", scope="b/*", run=[put("b/y.txt", "B"), commit("b", "b")]))
        self.assertEqual(self.runq(), 1, self.log())
        st = self.status()
        self.assertIn("verify still failing", st["reason"])
        self.assertIn("--worktree", st["reason"])
        self.assertIn("[DONE] Task B", self.tasks_text())
        self.assertNotIn("[DONE] Task A", self.tasks_text())
        wt = next(self.wt_root.glob("*/task-01"))
        conv = next(t["conv"] for t in self.turns() if Path(t["cwd"]).resolve() == wt.resolve())
        base = st["reason"].split("--base ")[1].split()[0]

        self.out.truncate(0)
        self.assertEqual(self.runq("--resume", conv, "--base", base, "--worktree", str(wt), "--nudge"), 0, self.log())
        self.assertIn("[DONE] Task A", self.tasks_text())
        self.assertEqual((self.repo / "a" / "x.txt").read_text(), "good")
        self.assertFalse(wt.exists())
        self.assert_clean_shared_dirs()


if __name__ == "__main__":
    unittest.main()
