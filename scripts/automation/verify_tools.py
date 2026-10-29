#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
فرمان‌های راستی‌آزمایی این مخزن برای خط‌های verify:/require: در tasks.md (اجراکننده run_tasks.py).

  python scripts/automation/verify_tools.py clean-tree [--allow PATH ...]
  python scripts/automation/verify_tools.py commit-exists --base HASH --grep TEXT
  python scripts/automation/verify_tools.py diff-free --base HASH --pattern REGEX [--path PATH ...]
  python scripts/automation/verify_tools.py ng-test-compare --base HASH --include GLOB [...] [--exclude GLOB ...]
  python scripts/automation/verify_tools.py django-check [--modules all warehouse accounting]
  python scripts/automation/verify_tools.py migrations-unchanged
  python scripts/automation/verify_tools.py dist-free --dist PATH --pattern REGEX
  python scripts/automation/verify_tools.py django-tests --labels APP [...] [--known FILE] [--min-tests N]
  python scripts/automation/verify_tools.py module-names --base HASH --file PATH [...]
  python scripts/automation/verify_tools.py guardian29-max --max COUNTER=N [...] [--min COUNTER=N ...]
  python scripts/automation/verify_tools.py migrate-empty [--modules all warehouse accounting]
  python scripts/automation/verify_tools.py sample-module
  python scripts/automation/verify_tools.py release-mark
  python scripts/automation/verify_tools.py release-check [--frontend-only | --backend-only]
  python scripts/automation/verify_tools.py restart-backend

هر فرمان در موفقیت کد ۰ و در شکست کد ۱ می‌دهد و علت را چاپ می‌کند.
الگوهای ng-test-compare نسبت به frontend هستند (مثل src/app/shared/icons/*.spec.ts).
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import time
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONT_DIR = REPO_ROOT / "frontend"
RUNNER_FILES = ("tasks.md", "run_tasks.bat", "run_tasks.py", "tasks_history.md")
BASE_WORK_DIR = REPO_ROOT / "scratch" / "runner-base"
CACHE_DIR = REPO_ROOT / "scratch" / "runner-cache"
TSCONFIG_NAME = "tsconfig.runner.spec.json"
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
TSC_ERROR_RE = re.compile(r"^(?P<file>[^\s(][^(]*)\((?P<line>\d+),(?P<col>\d+)\): error (?P<code>TS\d+): (?P<msg>.*)$")
SUMMARY_RE = re.compile(r"^\s*Tests\s+(?:(?P<failed>\d+) failed)?\s*\|?\s*(?:(?P<passed>\d+) passed)?")


def git(*args) -> str:
    r = subprocess.run(["git", "-c", "core.quotepath=false", *args], cwd=REPO_ROOT, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout


# ---------------------------------------------------------------- simple checks

def cmd_clean_tree(args) -> int:
    allowed = set(RUNNER_FILES) | set(args.allow or [])
    bad = []
    for line in git("status", "--porcelain", "--untracked-files=all").splitlines():
        if not line.strip():
            continue
        path = line[3:].split(" -> ", 1)[-1].strip().strip('"')
        if line.startswith("??"):
            # فایل untracked پایتون یا هر فایل untracked زیر scripts/ می‌تواند ابزار بررسی را
            # سایه بزند (مثل argparse.py ساختگی نشست ۷ فاز ۳، ۱۶ اکتبر ۲۰۲۶)؛ پس تمیز نیست.
            if path.endswith(".py") or path.startswith("scripts/"):
                bad.append(line)
            continue
        if path not in allowed:
            bad.append(line)
    if bad:
        print("Uncommitted changes to tracked files (commit or revert them):")
        for line in bad:
            print(f"  {line}")
        return 1
    print("Working tree is clean (runner files ignored).")
    return 0


def cmd_scope(args) -> int:
    # همهٔ فایل‌های تغییرکرده از BASE تا HEAD باید با یکی از الگوهای glob مجاز بخوانند (fnmatch روی مسیر کامل).
    import fnmatch
    changed = [f for f in git("diff", "--name-only", args.base, "HEAD").split() if f]
    outside = sorted(f for f in changed if not any(fnmatch.fnmatch(f, pat) for pat in args.allow))
    print(f"changed ({len(changed)}): {changed[:60]}")
    if not changed:
        print("No file changed since base.")
        return 1
    if outside:
        print(f"Outside the allowed scope: {outside}")
        return 1
    if args.min_files and len(changed) < args.min_files:
        print(f"Only {len(changed)} files changed; expected at least {args.min_files}.")
        return 1
    print("All changed files are inside the allowed scope.")
    return 0


def cmd_tests_kept(args) -> int:
    # هیچ spec نباید تست کمتری از BASE داشته باشد (رد پاک کردن تست شکست‌خورده به‌جای اصلاحش).
    rx = re.compile(r"(?<![\w.])(?:it|test)\s*\(")
    bad = []
    for rel in args.file:
        rel = rel.replace("\\", "/")
        try:
            before = len(rx.findall(git("show", f"{args.base}:{rel}")))
        except RuntimeError:
            before = 0
        f = REPO_ROOT / rel
        after = len(rx.findall(f.read_text(encoding="utf-8"))) if f.is_file() else 0
        print(f"{rel}: {before} -> {after} tests")
        if after < before:
            bad.append(rel)
    if bad:
        print(f"Fewer tests than base in: {bad}")
        return 1
    return 0


def cmd_text_check(args) -> int:
    # متن یک فایل: رشته‌های لازم، رشته‌ها و الگوهای ممنوع، و کمینهٔ تکرار («N:TEXT»).
    f = REPO_ROOT / args.file
    if not f.is_file():
        print(f"missing file: {args.file}")
        return 1
    text = f.read_text(encoding="utf-8")
    problems = []
    for needle in args.contains or []:
        if needle not in text:
            problems.append(f"missing text: {needle}")
    for needle in args.absent or []:
        if needle in text:
            problems.append(f"forbidden text present: {needle}")
    for rx in args.regex_absent or []:
        m = re.search(rx, text)
        if m:
            line = text.count("\n", 0, m.start()) + 1
            problems.append(f"forbidden pattern {rx} at line {line}: {m.group(0)[:80]}")
    for spec in args.count or []:
        n, _, needle = spec.partition(":")
        found = text.count(needle)
        if found < int(n):
            problems.append(f"{needle} appears {found} times, need at least {n}")
    print(f"{args.file}: " + ("ok" if not problems else f"{len(problems)} problem(s)"))
    for pr in problems:
        print(f"  - {pr}")
    return 1 if problems else 0


def cmd_glob_absent(args) -> int:
    # هیچ فایلی زیر ROOT که با GLOB بخواند (جز استثناها و specها) الگو را ندارد.
    root = REPO_ROOT / args.root
    rx = re.compile(args.regex)
    allowed = {e.replace("\\", "/") for e in (args.allow or [])}
    hits = []
    for pattern in args.glob:
        for f in root.rglob(pattern):
            rel = f.relative_to(REPO_ROOT).as_posix()
            if rel in allowed or (args.skip_specs and rel.endswith(".spec.ts")):
                continue
            text = f.read_text(encoding="utf-8", errors="replace")
            for m in rx.finditer(text):
                hits.append(f"{rel}:{text.count(chr(10), 0, m.start()) + 1}: {m.group(0)[:80]}")
    if hits:
        print(f"Pattern {args.regex} still present ({len(hits)}):")
        for h in hits[:60]:
            print(f"  {h}")
        return 1
    print(f"Pattern {args.regex} absent under {args.root} ({', '.join(args.glob)}).")
    return 0


def cmd_commit_exists(args) -> int:
    subjects = git("log", f"{args.base}..HEAD", "--format=%s").splitlines()
    hits = [s for s in subjects if args.grep in s]
    if not hits:
        print(f"No commit after {args.base} has a subject containing: {args.grep}")
        print(f"Commits after {args.base}: {len(subjects)}")
        for s in subjects[:20]:
            print(f"  {s}")
        return 1
    print(f"Found: {hits[0]}")
    return 0


def cmd_diff_free(args) -> int:
    rx = re.compile(args.pattern)
    diff = git("diff", args.base, "-U0", "--", *(args.path or []))
    hits = [ln for ln in diff.splitlines()
            if ln and ln[0] in "+-" and not ln.startswith(("+++", "---")) and rx.search(ln)]
    if hits:
        print(f"{len(hits)} changed line(s) since {args.base} match /{args.pattern}/ (these must stay untouched):")
        for ln in hits[:30]:
            print(f"  {ln[:200]}")
        return 1
    print(f"No changed line since {args.base} matches /{args.pattern}/.")
    return 0


# ---------------------------------------------------------------- backend profiles and build output

BACKEND_DIR = REPO_ROOT / "backend"
BACKEND_PYTHON = BACKEND_DIR / "venv" / "Scripts" / "python.exe"


def run_manage(args: list, modules: str, extra_env: dict | None = None,
               backend: Path = BACKEND_DIR) -> tuple[int, str]:
    # modules خالی یعنی پروفایل کامل (WH_MODULES تنظیم نمی‌شود).
    env = dict(os.environ, PYTHONUTF8="1", **(extra_env or {}))
    env.pop("WH_MODULES", None)
    if modules:
        env["WH_MODULES"] = modules
    r = subprocess.run([str(BACKEND_PYTHON), "manage.py", *args], cwd=backend, env=env,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout + r.stderr).strip()


def tail(text: str, n: int = 30) -> str:
    return "\n".join(f"  {ln}" for ln in text.splitlines()[-n:])


def cmd_django_check(args) -> int:
    failed = 0
    for profile in args.modules:
        modules = "" if profile == "all" else profile
        code, out = run_manage(["check"], modules)
        print(f"[{profile}] manage.py check -> exit {code}")
        if code != 0:
            failed += 1
            print("\n".join(f"  {ln}" for ln in out.splitlines()[-30:]))
    return 1 if failed else 0


def cmd_migrations_unchanged(args) -> int:
    code, out = run_manage(["makemigrations", "--check", "--dry-run"], "")
    print("\n".join(out.splitlines()[-30:]))
    if code != 0:
        print("makemigrations --check found model changes without a migration (or failed).")
        return 1
    print("No model change needs a migration.")
    return 0


def cmd_dist_free(args) -> int:
    rx = re.compile(args.pattern)
    root = (REPO_ROOT / args.dist).resolve()
    if not (root / "index.html").is_file():
        print(f"No build output at {root} (index.html missing).")
        return 1
    hits = []
    for path in root.rglob("*"):
        if path.is_file() and path.suffix in (".js", ".html", ".json"):
            m = rx.search(path.read_text(encoding="utf-8", errors="replace"))
            if m:
                hits.append(f"{path.relative_to(root)}: {m.group(0)[:80]}")
    if hits:
        print(f"{len(hits)} file(s) in {args.dist} match /{args.pattern}/ (code of another module is in this build):")
        for h in hits[:30]:
            print(f"  {h}")
        return 1
    print(f"No file in {args.dist} matches /{args.pattern}/.")
    return 0


RELEASE_MARK = CACHE_DIR / "release_start.json"
RELEASE_URLS = ("https://app.farsalish.ir/", "https://app.farsalish.ir/api/public/config/")
DIST_BROWSER = FRONT_DIR / "dist" / "warehouse-app" / "browser"
NGSW_PATCH_MARK = "(res.status >= 520 && res.status <= 530)) && ignoreOfflineError"
RELEASE_PROBE = (
    "import json\n"
    "from accounts.backup_service import get_backup_dir\n"
    "from settings_core.models import SystemGoogleDriveConfig\n"
    "c = SystemGoogleDriveConfig.objects.filter(id=1).only('worker_heartbeat_at').first()\n"
    "hb = c.worker_heartbeat_at.timestamp() if c and c.worker_heartbeat_at else None\n"
    "print('PROBE=' + json.dumps({'dir': get_backup_dir(), 'hb': hb}))\n"
)


def cmd_release_mark(args) -> int:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    RELEASE_MARK.write_text(json.dumps({"start": time.time()}), encoding="utf-8")
    print(f"Release start recorded in {RELEASE_MARK}.")
    return 0


DAPHNE_TAB = ('wt.exe', '-w', '0', 'new-tab', '-d', str(REPO_ROOT / 'backend'), '--title', 'Backend Daphne',
              'cmd', '/k', r'.\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application')


def cmd_restart_backend(args) -> int:
    """daphne پورت ۸۰۰۰ را می‌بندد و در تب تازهٔ Windows Terminal بالا می‌آورد (از سمت runner، چون Antigravity نمی‌تواند تب باز کند)."""
    import psutil

    def is_daphne(p):
        try:
            name = p.name().lower()
            cl = " ".join(p.cmdline())
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return False
        # فقط پایتون و پوستهٔ cmd؛ WindowsTerminal.exe هم وقتی با تب daphne باز شده همین cmdline را دارد
        # و کشتن درخت آن همهٔ تب‌ها (runner، Express، تونل) را می‌بندد (۲۷ مهر ۱۴۰۵).
        if name not in ("python.exe", "pythonw.exe", "cmd.exe"):
            return False
        return "-m daphne" in cl and "-p 8000" in cl

    daphne_pids = set()
    roots = set()
    for p in psutil.process_iter():
        if is_daphne(p):
            daphne_pids.add(p.pid)
            top = p
            for parent in p.parents():
                if is_daphne(parent):
                    top = parent
                else:
                    break
            roots.add(top.pid)
    for pid in sorted(daphne_pids):
        try:
            psutil.Process(pid).kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    for pid in sorted(roots):
        # taskkill گاهی خودش گیر می‌کند (۷ آبان ۱۴۰۵)؛ کشتن با psutil بالا و پورت پایین کار اصلی را می‌کند.
        try:
            r = subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, text=True,
                               encoding="utf-8", errors="replace", timeout=30)
            print(f"taskkill {pid}: {(r.stdout or r.stderr).strip()[:200]}")
        except subprocess.TimeoutExpired:
            print(f"taskkill {pid}: timed out")
    for c in psutil.net_connections(kind="tcp"):
        if c.laddr and c.laddr.port == 8000 and c.pid:
            try:
                psutil.Process(c.pid).kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    deadline = time.time() + 20
    while time.time() < deadline and any(c.laddr and c.laddr.port == 8000 and c.status == psutil.CONN_LISTEN
                                         for c in psutil.net_connections(kind="tcp")):
        time.sleep(1)
    if any(c.laddr and c.laddr.port == 8000 and c.status == psutil.CONN_LISTEN
           for c in psutil.net_connections(kind="tcp")):
        print("Port 8000 still busy before starting Daphne.")
        return 1
    subprocess.run(list(DAPHNE_TAB))
    deadline = time.time() + 90
    while time.time() < deadline:
        if any(c.laddr and c.laddr.port == 8000 and c.status == psutil.CONN_LISTEN
               for c in psutil.net_connections(kind="tcp")):
            print("Daphne listens on port 8000 again.")
            return 0
        time.sleep(2)
    print("Daphne did not start listening on port 8000 within 90 s.")
    return 1


WORKER_TAB = ('wt.exe', '-w', '0', 'new-tab', '-d', str(REPO_ROOT / 'backend'), '--title', 'GDrive Sync Worker',
              'cmd', '/k', r'for /l %i in (1,0,2) do (.\venv\Scripts\python.exe -X utf8 manage.py '
              r'run_gdrive_sync_worker --interval 5 & timeout /t 10 /nobreak >nul)')


def cmd_restart_worker(args) -> int:
    """worker گوگل‌درایو را تازه می‌کند: پروسهٔ python آن را می‌بندد تا حلقهٔ تبش دوباره بالا بیاوردش، یا اگر نبود تبش را باز می‌کند."""
    import psutil

    def workers():
        found = []
        for p in psutil.process_iter(["pid", "name", "cmdline", "create_time"]):
            cl = " ".join(p.info["cmdline"] or [])
            if "run_gdrive_sync_worker" in cl and "python" in (p.info["name"] or "").lower():
                found.append(p)
        return found

    start = time.time()
    old = workers()
    for p in old:
        r = subprocess.run(["taskkill", "/PID", str(p.pid), "/F"], capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        print(f"taskkill {p.pid}: {(r.stdout or r.stderr).strip()[:200]}")
    if not old:
        print("No worker process; opening the GDrive Sync Worker tab.")
        subprocess.run(list(WORKER_TAB))
    deadline = time.time() + 60
    while time.time() < deadline and not any(p.info["create_time"] >= start for p in workers()):
        time.sleep(2)
    fresh = [p.pid for p in workers() if p.info["create_time"] >= start]
    if not fresh:
        print("No fresh worker process within 60 s.")
        return 1
    print(f"Fresh worker pid(s) {fresh}.")
    deadline = time.time() + 90
    while time.time() < deadline:
        code, out = run_manage(["shell", "-c", RELEASE_PROBE], "")
        m = re.search(r"^PROBE=(.*)$", out, re.M)
        hb = json.loads(m.group(1))["hb"] if code == 0 and m else None
        if hb and hb >= start:
            print("Worker heartbeat updated after the restart.")
            return 0
        time.sleep(5)
    print("Worker heartbeat was not updated within 90 s of the restart.")
    return 1


def cmd_release_check(args) -> int:
    """release روی app پس از release-mark: پشتیبان تازه، بیلد تازهٔ وصله‌شده، daphne و worker تازه، heartbeat و ۲۰۰."""
    import urllib.request
    import psutil

    if not RELEASE_MARK.is_file():
        print("No release mark; run release-mark before the session.")
        return 1
    start = json.loads(RELEASE_MARK.read_text(encoding="utf-8"))["start"]
    problems, ok = [], []

    code, out = run_manage(["shell", "-c", RELEASE_PROBE], "")
    m = re.search(r"^PROBE=(.*)$", out, re.M)
    if code != 0 or not m:
        problems.append("backend probe failed:\n" + tail(out, 15))
        probe = {"dir": None, "hb": None}
    else:
        probe = json.loads(m.group(1))

    if probe["dir"]:
        dumps = [p for p in Path(probe["dir"]).glob("*.dump") if p.stat().st_size > 0]
        fresh = [p for p in dumps if p.stat().st_mtime >= start]
        meta_ok = [p for p in fresh if (p.parent / f"{p.name}.meta.json").is_file()
                   or (p.parent / f"{p.stem}.meta.json").is_file()]
        if meta_ok:
            ok.append(f"backup {meta_ok[0].name} ({meta_ok[0].stat().st_size} bytes)")
        else:
            problems.append(f"no non-empty .dump with .meta.json created in {probe['dir']} after the release mark")

    for name in (() if args.backend_only else ("index.html", "ngsw.json", "ngsw-worker.js")):
        f = DIST_BROWSER / name
        if not f.is_file() or f.stat().st_mtime < start:
            problems.append(f"{f.relative_to(REPO_ROOT)} was not rebuilt after the release mark")
    worker = DIST_BROWSER / "ngsw-worker.js"
    if worker.is_file() and NGSW_PATCH_MARK not in worker.read_text(encoding="utf-8", errors="replace"):
        problems.append("ngsw-worker.js is not patched (run node tools/patch-ngsw-530.js)")

    # --frontend-only: فقط بیلد تازه لازم است؛ daphne و worker باید در حال اجرا باشند ولی لازم نیست تازه باشند.
    restart_needed = not args.frontend_only
    daphne = None
    for c in psutil.net_connections(kind="tcp"):
        if c.laddr and c.laddr.port == 8000 and c.status == psutil.CONN_LISTEN and c.pid:
            daphne = psutil.Process(c.pid)
            break
    if daphne is None:
        problems.append("nothing listens on port 8000")
    else:
        cmdline = " ".join(daphne.cmdline())
        if "daphne" not in cmdline:
            problems.append(f"port 8000 is not daphne: {cmdline[:150]}")
        elif restart_needed and daphne.create_time() < start:
            problems.append("daphne on port 8000 was started before the release mark (not restarted)")
        else:
            ok.append(f"daphne pid {daphne.pid}")

    workers = []
    for p in psutil.process_iter(["pid", "name", "cmdline", "create_time"]):
        cl = " ".join(p.info["cmdline"] or [])
        if "run_gdrive_sync_worker" in cl and "python" in (p.info["name"] or "").lower():
            workers.append(p)
    if not workers:
        problems.append("no GDrive sync worker python process is running")
    elif restart_needed and not args.backend_only and not any(p.info["create_time"] >= start for p in workers):
        problems.append("GDrive sync worker was not restarted after the release mark")
    else:
        ok.append(f"gdrive worker pid(s) {[p.pid for p in workers]}")
    if probe["hb"] is None or time.time() - probe["hb"] > 180:
        problems.append(f"worker heartbeat is not fresh (last: {probe['hb']})")

    for url in RELEASE_URLS:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "release-check"}),
                                        timeout=30) as r:
                status = r.status
        except urllib.error.HTTPError as e:
            status = e.code
        except Exception as e:
            status = f"error {e}"
        if status == 200:
            ok.append(f"200 {url}")
        else:
            problems.append(f"{url} -> {status}")

    for line in ok:
        print(f"OK  {line}")
    if problems:
        print("Release check failed:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("Release check passed.")
    return 0


TEST_FAIL_RE = re.compile(r"^(?:FAIL|ERROR): (\S+) \(([\w.]+)\)", re.M)
TEST_RAN_RE = re.compile(r"^Ran (\d+) tests? in", re.M)


def cmd_django_tests(args) -> int:
    # آزمون‌های بک‌اند با برچسب اپ؛ فقط شکست تازه (نبوده در فهرست شناخته‌شده) رد می‌شود.
    known = set()
    if args.known:
        for ln in (REPO_ROOT / args.known).read_text(encoding="utf-8").splitlines():
            ln = ln.split("#", 1)[0].strip()
            if ln:
                known.add(ln)
    code, out = run_manage(["test", *args.labels, "--noinput"], "", {"PYTHONIOENCODING": "utf-8"})
    log = REPO_ROOT / "scratch" / "logs" / "verify-django-tests.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(out, encoding="utf-8")
    m = TEST_RAN_RE.search(out)
    ran = int(m.group(1)) if m else 0
    # پایتون ۳.۱۱ به بعد نام متد را درون پرانتز هم می‌آورد: test_x (app.mod.Class.test_x)
    failed = {cls if cls.endswith(f".{name}") else f"{cls}.{name}" for name, cls in TEST_FAIL_RE.findall(out)}
    new = sorted(failed - known)
    print(f"Ran {ran} tests, exit {code}; failing {len(failed)}, known {len(failed & known)}, new {len(new)} (log: {log.relative_to(REPO_ROOT)})")
    if not m:
        print("The test run did not finish (no 'Ran N tests' line):")
        print(tail(out))
        return 1
    if ran < args.min_tests:
        print(f"Only {ran} tests ran; expected at least {args.min_tests}.")
        return 1
    if code != 0 and not failed:
        print("The run failed without a FAIL/ERROR entry:")
        print(tail(out))
        return 1
    if new:
        print("New failing tests:")
        for t in new[:40]:
            print(f"  {t}")
        return 1
    print("No new failing test.")
    return 0


def top_level_names(source: str, with_imports: bool = False) -> set:
    # نام‌هایی که در سطح بالای ماژول تعریف می‌شوند (def، class، انتساب)، از جمله درون if/try سطح بالا؛
    # نام‌های import‌شده فقط با with_imports.
    import ast
    names = set()

    def visit(stmts):
        for node in stmts:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                names.add(node.name)
            elif isinstance(node, (ast.Import, ast.ImportFrom)) and with_imports:
                for a in node.names:
                    if a.name != "*":
                        names.add(a.asname or a.name.split(".")[0])
            elif isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                for t in targets:
                    for n in ast.walk(t):
                        if isinstance(n, ast.Name):
                            names.add(n.id)
            elif isinstance(node, ast.If):
                visit(node.body)
                visit(node.orelse)
            elif isinstance(node, ast.Try):
                visit(node.body)
                for h in node.handlers:
                    visit(h.body)
                visit(node.orelse)
                visit(node.finalbody)
    visit(ast.parse(source).body)
    return names


def cmd_module_names(args) -> int:
    # Barrel باید هر نامی را که ماژول روی BASE داشت هنوز صادر کند (حتی نام‌های آغازشده با _).
    # نام‌های BASE ایستا از متن git خوانده می‌شوند؛ نام‌های HEAD با import واقعی در جنگو.
    expected = {}
    for rel in args.file:
        rel = rel.replace("\\", "/")
        path = Path(rel)
        module = f"{path.parent.name}.{path.stem}"
        try:
            src = git("show", f"{args.base}:{rel}")
        except RuntimeError as err:
            print(f"{rel} not found at {args.base}: {err}")
            return 1
        expected[module] = top_level_names(src, args.with_imports) - {"__doc__", "__all__"}
    # نام‌هایی هم که فایل‌های بک‌اند همین حالا از این ماژول‌ها import می‌کنند باید در دسترس باشند.
    import ast
    for py in BACKEND_DIR.rglob("*.py"):
        if "venv" in py.parts or "migrations" in py.parts:
            continue
        try:
            tree = ast.parse(py.read_text(encoding="utf-8", errors="replace"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom) or not node.module:
                continue
            target = node.module
            if node.level == 1:
                target = f"{py.parent.name}.{node.module}"
            if target in expected:
                expected[target] |= {a.name for a in node.names if a.name != "*"}
    script =("import json,importlib;mods=" + json.dumps(sorted(expected)) +
              ";print('MODULE-NAMES '+json.dumps({m:dir(importlib.import_module(m)) for m in mods}))")
    code, out = run_manage(["shell", "-c", script], "")
    line = next((ln for ln in out.splitlines() if ln.startswith("MODULE-NAMES ")), None)
    if code != 0 or not line:
        print(f"Importing the modules failed (exit {code}):")
        print(tail(out))
        return 1
    actual = json.loads(line[len("MODULE-NAMES "):])
    failed = 0
    for module, names in expected.items():
        missing = sorted(names - set(actual[module]))
        print(f"{module}: {len(names)} names at {args.base}, missing now: {len(missing)}")
        if missing:
            failed += 1
            print("  " + ", ".join(missing[:60]))
    return 1 if failed else 0


def cmd_guardian29_max(args) -> int:
    # تا وقتی خود نگهبان ۲۹ روی HEAD رد می‌شود، فقط «افزایش نیافتن» شمارنده‌ها سنجیده می‌شود.
    def parse(items) -> dict:
        out = {}
        for item in items or []:
            key, _, value = item.partition("=")
            out[key] = int(value)
        return out
    limits, floors = parse(args.max), parse(args.min)
    r = subprocess.run([sys.executable, str(REPO_ROOT / "scripts" / "e2e" / "guardian_modularization.py"), "--json"],
                       cwd=REPO_ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
                       env=dict(os.environ, PYTHONUTF8="1"))
    try:
        # نگهبان پس از JSON گزارش فارسی را هم چاپ می‌کند؛ فقط شیء اول خوانده می‌شود.
        counters = json.JSONDecoder().raw_decode(r.stdout.lstrip())[0]["counters"]
    except (ValueError, KeyError):
        print(f"guardian_modularization.py --json gave no counters (exit {r.returncode}):")
        print(tail(r.stdout + r.stderr))
        return 1
    bad = [f"{k} = {counters.get(k)} > {v}" for k, v in limits.items() if counters.get(k) is None or counters[k] > v]
    # --min نشان می‌دهد lint-imports واقعاً بسته‌ها را پیدا کرده است (شمار صفرِ ناشی از نیافتن بسته‌ها پذیرفته نمی‌شود).
    bad += [f"{k} = {counters.get(k)} < {v}" for k, v in floors.items() if counters.get(k) is None or counters[k] < v]
    print("Counters: " + ", ".join(f"{k}={counters.get(k)}" for k in {**limits, **floors}))
    if bad:
        print("Outside the allowed range:")
        for b in bad:
            print(f"  {b}")
        return 1
    print("Every counter is within its range.")
    return 0


VERIFY_PG = "wh-verify-pg"
VERIFY_PG_PORT = "55432"


def docker(*args, check: bool = True) -> subprocess.CompletedProcess:
    r = subprocess.run(["docker", *args], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check and r.returncode != 0:
        raise RuntimeError(f"docker {' '.join(args[:2])} failed: {(r.stdout + r.stderr).strip()[:300]}")
    return r


def cmd_migrate_empty(args) -> int:
    # یک postgres موقت جدا (نه پایگاه app روی 5432)؛ برای هر پروفایل یک پایگاه خالی و migrate کامل.
    docker("rm", "-f", VERIFY_PG, check=False)
    docker("run", "-d", "--rm", "--name", VERIFY_PG, "-e", "POSTGRES_USER=verify", "-e", "POSTGRES_PASSWORD=verify",
           "-p", f"127.0.0.1:{VERIFY_PG_PORT}:5432", "postgres:15-alpine")
    failed = 0
    try:
        for _ in range(60):
            if docker("exec", VERIFY_PG, "pg_isready", "-U", "verify", check=False).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("temporary postgres did not become ready in 60 s")
        for profile in args.modules:
            db = f"verify_{profile}"
            docker("exec", VERIFY_PG, "createdb", "-U", "verify", db)
            env = {"DB_NAME": db, "DB_USER": "verify", "DB_PASSWORD": "verify",
                   "DB_HOST": "127.0.0.1", "DB_PORT": VERIFY_PG_PORT}
            code, out = run_manage(["migrate", "--noinput"], "" if profile == "all" else profile, env)
            print(f"[{profile}] migrate on an empty database -> exit {code}")
            if code != 0:
                failed += 1
                print(tail(out))
    finally:
        docker("rm", "-f", VERIFY_PG, check=False)
    return 1 if failed else 0


SAMPLE_ALLOWED = ("backend/modules/sample/", "frontend/src/app/modules/sample/",
                  "frontend/src/app/modules/installed-modules.ts")


def cmd_sample_module(args) -> int:
    # قالب ماژول (گام ۵): ساخت ماژول sample در کپی HEAD، بدون تغییر هیچ فایل بیرون از پوشه‌های خودش.
    work = BASE_WORK_DIR / "sample-module"
    BASE_WORK_DIR.mkdir(parents=True, exist_ok=True)
    safe_remove_tree(work)
    problems = []
    try:
        work.mkdir()
        tar_path = BASE_WORK_DIR / "sample-module.tar"
        git("archive", "-o", str(tar_path), "HEAD")
        with tarfile.open(tar_path) as tf:
            tf.extractall(work, filter="data")
        tar_path.unlink()
        def snapshot() -> dict:
            return {p.relative_to(work).as_posix(): (p.stat().st_size, p.stat().st_mtime_ns)
                    for p in work.rglob("*") if p.is_file()}
        before = snapshot()
        r = subprocess.run([sys.executable, str(work / "scripts" / "new_module.py"), "--code", "sample",
                            "--title-fa", "ماژول نمونه", "--root", str(work)],
                           cwd=work, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            print(f"new_module.py failed (exit {r.returncode}):\n{tail(r.stdout + r.stderr)}")
            return 1
        after = snapshot()
        changed = [k for k in after if after[k] != before.get(k)]
        changed += [k for k in before if k not in after]
        outside = [k for k in changed if not k.startswith(SAMPLE_ALLOWED)]
        if outside:
            problems.append(f"new_module.py changed files outside the module folders: {outside[:10]}")
        if not any(k.startswith(SAMPLE_ALLOWED[0]) for k in changed) or not any(k.startswith(SAMPLE_ALLOWED[1]) for k in changed):
            problems.append("new_module.py did not create both the backend and the frontend module folder")
        for profile in ("sample", ""):
            code, out = run_manage(["check"], profile, backend=work / "backend")
            if code != 0:
                problems.append(f"manage.py check (WH_MODULES={profile or 'all'}) exit {code}:\n{tail(out)}")
        front = work / "frontend"
        mk = subprocess.run(["cmd", "/c", "mklink", "/J", str(front / "node_modules"), str(FRONT_DIR / "node_modules")],
                            capture_output=True, text=True)
        if mk.returncode != 0:
            raise RuntimeError(f"mklink failed: {mk.stdout.strip()} {mk.stderr.strip()}")
        b = subprocess.run("npm run build:modules", shell=True, cwd=front, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", env=dict(os.environ, WH_MODULES="sample"))
        if b.returncode != 0:
            problems.append(f"build:modules (WH_MODULES=sample) exit {b.returncode}:\n{tail(b.stdout + b.stderr)}")
        for guardian in ("guardian_modularization.py", "guardian_57_front_module_fence.py"):
            g = subprocess.run([sys.executable, str(work / "scripts" / "e2e" / guardian)], cwd=work,
                               capture_output=True, text=True, encoding="utf-8", errors="replace",
                               env=dict(os.environ, PYTHONUTF8="1"))
            if g.returncode != 0:
                problems.append(f"{guardian} exit {g.returncode}:\n{tail(g.stdout + g.stderr)}")
    finally:
        safe_remove_tree(work)
    if problems:
        print("Sample module check failed:")
        for p in problems:
            print(f"- {p}")
        return 1
    print("Sample module: created only inside its own folders; check, build:modules and guardians 29/57 pass.")
    return 0


# ---------------------------------------------------------------- safe removal (node_modules must never be touched)

def is_link(path) -> bool:
    try:
        st = os.lstat(path)
    except FileNotFoundError:
        return False
    return stat.S_ISLNK(st.st_mode) or bool(getattr(st, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT)


def links_inside(root: Path) -> list:
    found = []
    for dirpath, dirnames, filenames in os.walk(root, topdown=True, followlinks=False):
        for name in dirnames + filenames:
            p = os.path.join(dirpath, name)
            if is_link(p):
                found.append(p)
        # هرگز وارد junction یا symlink نشو
        dirnames[:] = [d for d in dirnames if not is_link(os.path.join(dirpath, d))]
    return found


def remove_junction(junction: Path):
    if not os.path.lexists(junction):
        return
    if not is_link(junction):
        raise RuntimeError(f"{junction} is a real folder, not a junction; refusing to touch it")
    subprocess.run(["cmd", "/c", "rmdir", str(junction)], capture_output=True)
    if os.path.lexists(junction):
        raise RuntimeError(f"could not remove junction {junction}")


def safe_remove_tree(root: Path):
    """پوشه موقت پایه را فقط زیر scratch/runner-base و فقط وقتی هیچ پیوندی درونش نمانده پاک می‌کند."""
    if not os.path.lexists(root):
        return
    if BASE_WORK_DIR.resolve() not in root.resolve().parents:
        raise RuntimeError(f"refusing to delete {root}: outside {BASE_WORK_DIR}")
    remove_junction(root / "frontend" / "node_modules")
    leftovers = links_inside(root)
    if leftovers:
        raise RuntimeError(f"refusing to delete {root}: links still inside: {leftovers[:5]}")
    shutil.rmtree(root)


def cleanup_stale_base_dirs():
    """باقی‌مانده اجرای کشته‌شده قبلی (مثلاً پس از سقف زمانی اجراکننده) را با همان احتیاط پاک می‌کند."""
    if not BASE_WORK_DIR.exists():
        return
    for entry in BASE_WORK_DIR.iterdir():
        if entry.is_dir() and not is_link(entry):
            print(f"Removing leftover base tree {entry}")
            safe_remove_tree(entry)
        elif entry.suffix == ".tar":
            entry.unlink()


# ---------------------------------------------------------------- ng test comparison

def expand_braces(pattern: str) -> list:
    m = re.search(r"\{([^{}]*)\}", pattern)
    if not m:
        return [pattern]
    out = []
    for option in m.group(1).split(","):
        out.extend(expand_braces(pattern[:m.start()] + option + pattern[m.end():]))
    return out


def npx() -> str:
    found = shutil.which("npx")
    if not found:
        raise RuntimeError("npx not found on PATH")
    return found


def write_tsconfig(front: Path, includes: list, excludes: list):
    config = {
        "extends": "./tsconfig.json",
        "compilerOptions": {"outDir": "./out-tsc/spec", "types": ["vitest/globals", "node"]},
        "include": ["src/**/*.d.ts", *includes],
        "exclude": excludes,
    }
    (front / TSCONFIG_NAME).write_text(json.dumps(config, indent=2), encoding="utf-8")


def run_logged(cmd: list, cwd: Path, log_path: Path) -> str:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, FORCE_COLOR="0", NO_COLOR="1")
    with open(log_path, "wb") as out:
        subprocess.run(cmd, cwd=cwd, env=env, stdout=out, stderr=subprocess.STDOUT)
    return ANSI_RE.sub("", log_path.read_bytes().decode("utf-8", errors="replace"))


def type_errors(front: Path, log_path: Path) -> dict:
    """خطاهای نوع به تفکیک فایل (مسیر نسبت به frontend)."""
    output = run_logged([npx(), "tsc", "-p", TSCONFIG_NAME, "--noEmit", "--pretty", "false"], front, log_path)
    errors = {}
    for line in output.splitlines():
        m = TSC_ERROR_RE.match(line.strip())
        if m:
            file = m.group("file").replace("\\", "/")
            errors.setdefault(file, []).append(f"{m.group('code')} line {m.group('line')}: {m.group('msg')[:160]}")
    return errors


def run_ng_test(front: Path, includes: list, excludes: list, log_path: Path) -> dict:
    cmd = [npx(), "ng", "test", "--watch=false", "--ts-config", TSCONFIG_NAME]
    for p in includes:
        cmd += ["--include", p]
    for p in excludes:
        cmd += ["--exclude", p]
    output = run_logged(cmd, front, log_path)
    summary, failing = None, set()
    for line in output.splitlines():
        m = SUMMARY_RE.match(line)
        if m and (m.group("failed") or m.group("passed")):
            summary = {"failed": int(m.group("failed") or 0), "passed": int(m.group("passed") or 0)}
        stripped = line.strip()
        if stripped.startswith("FAIL") and "src/" in stripped:
            failing.add(re.sub(r"\s+\d+ms$", "", stripped[stripped.index("src/"):]))
    return {"summary": summary, "failing": sorted(failing), "log": str(log_path)}


def run_suite(front: Path, label: str, includes: list, excludes: list, skip_specs: set | None = None) -> dict:
    """
    tsc و سپس ng test. specهای کامپایل‌نشدنی کنار می‌روند تا بقیه اجرا شوند:
    روی پایه (skip_specs=None) specهای کامپایل‌نشدنی خود پایه؛ روی HEAD فقط همان‌هایی که روی پایه هم کامپایل نمی‌شدند.
    """
    logs = REPO_ROOT / "scratch" / "logs" / "runner"
    write_tsconfig(front, includes, excludes)
    errors = type_errors(front, logs / f"ngtest-{label}-tsc.log")
    if skip_specs is None:
        skip_specs = {f for f in errors if f.endswith(".spec.ts")}
    skip = sorted(skip_specs)
    write_tsconfig(front, includes, excludes + skip)
    result = run_ng_test(front, includes, excludes + skip, logs / f"ngtest-{label}.log")
    result["type_errors"] = errors
    result["skipped_specs"] = skip
    return result


def base_suite(full_hash: str, includes: list, excludes: list) -> dict:
    key = hashlib.sha1(json.dumps([full_hash, includes, excludes]).encode("utf-8")).hexdigest()[:12]
    cache_file = CACHE_DIR / f"{full_hash[:12]}-{key}.json"
    if cache_file.exists():
        print(f"Base results from cache: {cache_file.name}")
        return json.loads(cache_file.read_text(encoding="utf-8"))

    work = BASE_WORK_DIR / full_hash[:12]
    BASE_WORK_DIR.mkdir(parents=True, exist_ok=True)
    try:
        work.mkdir()
        tar_path = BASE_WORK_DIR / f"{full_hash[:12]}.tar"
        git("archive", "-o", str(tar_path), full_hash, "frontend")
        with tarfile.open(tar_path) as tf:
            tf.extractall(work, filter="data")
        tar_path.unlink()
        front = work / "frontend"
        r = subprocess.run(["cmd", "/c", "mklink", "/J", str(front / "node_modules"), str(FRONT_DIR / "node_modules")],
                           capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"mklink failed: {r.stdout.strip()} {r.stderr.strip()}")
        result = run_suite(front, "base", includes, excludes)
    finally:
        safe_remove_tree(work)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def front_renames(full_hash: str) -> dict:
    """فایل‌های جابه‌جاشدهٔ frontend از BASE تا HEAD (مسیر نسبت به frontend)، تا نتیجهٔ پایه با مسیر تازه مقایسه شود."""
    out = git("-c", "diff.renameLimit=20000", "diff", "--name-status", "-M", full_hash, "HEAD", "--", "frontend/src")
    renames = {}
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) == 3 and parts[0].startswith("R"):
            renames[parts[1].removeprefix("frontend/")] = parts[2].removeprefix("frontend/")
    return renames


def remap_path_prefix(name: str, renames: dict) -> str:
    # نام تست شکست‌خورده با مسیر spec شروع می‌شود («src/... > describe > it»).
    path, sep, rest = name.partition(" ")
    return renames.get(path, path) + sep + rest


SPEC_FORBIDDEN = (
    (re.compile(r"\b(?:it|describe|test)\s*\.\s*(?:skip|only|todo)\b"), "skip/only/todo"),
    (re.compile(r"\bx(?:it|describe)\s*\("), "xit/xdescribe"),
    (re.compile(r"""from\s+['"](?:node:)?(?:fs|path)['"]"""), "fs/path import"),
    (re.compile(r"\b__dirname\b"), "__dirname"),
)


def cmd_spec_check(args) -> int:
    """فایل spec فرانت: وجود، حداقل تعداد تست، رشته‌های لازم و نبود skip/only و import فایل‌سیستم."""
    f = REPO_ROOT / args.file
    if not f.is_file():
        print(f"missing spec file: {args.file}")
        return 1
    text = f.read_text(encoding="utf-8")
    problems = []
    tests = len(re.findall(r"(?<![\w.])(?:it|test)\s*\(", text))
    if tests < args.min_tests:
        problems.append(f"{tests} tests, need at least {args.min_tests}")
    for needle in args.require or []:
        if needle not in text:
            problems.append(f"missing required text: {needle}")
    for rx, label in SPEC_FORBIDDEN:
        if rx.search(text):
            problems.append(f"forbidden: {label}")
    print(f"{args.file}: {tests} tests")
    for p in problems:
        print(f"  - {p}")
    return 1 if problems else 0


NG_TEST_LOCK = CACHE_DIR / "ng-test.lock"


def acquire_ng_test_lock(timeout: float = 1800) -> bool:
    """دو اجرای هم‌زمان ng-test-compare فایل tsconfig.runner.spec.json درخت کاری را از زیر هم می‌کشند؛ اجرای دوم صبر می‌کند."""
    import psutil
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    deadline = time.time() + timeout
    announced = False
    while time.time() < deadline:
        try:
            fd = os.open(str(NG_TEST_LOCK), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            return True
        except FileExistsError:
            try:
                holder = int(NG_TEST_LOCK.read_text().strip() or 0)
            except (OSError, ValueError):
                holder = 0
            if not holder or not psutil.pid_exists(holder):
                NG_TEST_LOCK.unlink(missing_ok=True)
                continue
            if not announced:
                print(f"Another ng-test-compare (pid {holder}) is running; waiting for it to finish.")
                announced = True
            time.sleep(5)
    print("Timed out waiting for the ng-test lock.")
    return False


def cmd_ng_test_compare(args) -> int:
    if not acquire_ng_test_lock():
        return 1
    try:
        return _ng_test_compare(args)
    finally:
        NG_TEST_LOCK.unlink(missing_ok=True)


def _ng_test_compare(args) -> int:
    cleanup_stale_base_dirs()
    full_hash = git("rev-parse", args.base).strip()
    includes = [p for pattern in args.include for p in expand_braces(pattern)]
    excludes = [p for pattern in (args.exclude or []) for p in expand_braces(pattern)]

    base = base_suite(full_hash, includes, excludes)
    renames = front_renames(full_hash)
    if renames:
        print(f"{len(renames)} frontend file(s) moved since base; base results are compared under their new paths.")
        base = dict(base,
                    type_errors={renames.get(f, f): e for f, e in base["type_errors"].items()},
                    failing=[remap_path_prefix(n, renames) for n in base["failing"]],
                    skipped_specs=[renames.get(f, f) for f in base["skipped_specs"]])
    base_broken = set(base["type_errors"])
    try:
        no_skip = getattr(args, "no_skip", False)
        head = run_suite(FRONT_DIR, "head", includes, excludes,
                         set() if no_skip else {f for f in base_broken if f.endswith(".spec.ts")})
    finally:
        (FRONT_DIR / TSCONFIG_NAME).unlink(missing_ok=True)

    problems = []
    if no_skip:
        new_type_errors = dict(head["type_errors"])
    else:
        new_type_errors = {f: e for f, e in head["type_errors"].items() if f not in base_broken}
    for file, errs in new_type_errors.items():
        problems.append(f"new type errors in {file}: " + "; ".join(errs[:3]))

    if head["summary"] is None and base["summary"] is not None:
        problems.append(f"tests did not run on HEAD (see {head['log']})")
    new_failures = sorted(set(head["failing"]) - set(base["failing"]))
    for name in new_failures:
        problems.append(f"new failing test: {name}")
    if (not new_failures and head["summary"] and base["summary"]
            and not head["failing"] and head["summary"]["failed"] > base["summary"]["failed"]):
        problems.append(f"more failing tests than base: {head['summary']['failed']} > {base['summary']['failed']}")
    max_failed = getattr(args, "max_failed", None)
    if max_failed is not None and head["summary"] and head["summary"]["failed"] > max_failed:
        problems.append(f"failing tests on HEAD: {head['summary']['failed']} > allowed {max_failed}")

    if head["summary"] is None and base["summary"] is None:
        print("WARNING: tests could not run on base or on HEAD; nothing to compare.")
    print(f"Base {args.base}: {base['summary']}  skipped specs (do not compile on base): {base['skipped_specs']}")
    print(f"HEAD:  {head['summary']}  log: {head['log']}")
    if head["failing"]:
        print(f"Failing on HEAD ({len(head['failing'])}; pre-existing ones also fail on base):")
        for name in head["failing"]:
            print(f"  {'NEW ' if name in new_failures else 'old '}{name[:180]}")
    if problems:
        print("Regression against base:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("No regression against base.")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Verification commands for run_tasks.py")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("clean-tree", help="no uncommitted tracked changes except runner files")
    p.add_argument("--allow", nargs="*", help="extra paths to ignore")
    p.set_defaults(func=cmd_clean_tree)

    p = sub.add_parser("scope", help="every file changed since BASE matches one of the allowed glob patterns")
    p.add_argument("--base", required=True)
    p.add_argument("--allow", action="extend", nargs="+", required=True)
    p.add_argument("--min-files", type=int, default=0)
    p.set_defaults(func=cmd_scope)
    p = sub.add_parser("tests-kept", help="no listed spec has fewer it()/test() calls than at BASE")
    p.add_argument("--base", required=True)
    p.add_argument("--file", nargs="+", required=True)
    p.set_defaults(func=cmd_tests_kept)
    p = sub.add_parser("text-check", help="a file contains required texts, lacks forbidden texts/patterns, minimum counts")
    p.add_argument("--file", required=True)
    p.add_argument("--contains", "--require", action="append", dest="contains")
    p.add_argument("--absent", "--forbid", action="append", dest="absent")
    p.add_argument("--regex-absent", action="append")
    p.add_argument("--count", action="append", help="N:TEXT, TEXT must appear at least N times")
    p.set_defaults(func=cmd_text_check)
    p = sub.add_parser("glob-absent", help="no file under ROOT matching GLOB contains REGEX (except --allow)")
    p.add_argument("--root", required=True)
    p.add_argument("--glob", nargs="+", required=True)
    p.add_argument("--regex", required=True)
    p.add_argument("--allow", nargs="*")
    p.add_argument("--skip-specs", action="store_true")
    p.set_defaults(func=cmd_glob_absent)
    p = sub.add_parser("commit-exists", help="a commit after BASE has a subject containing TEXT")
    p.add_argument("--base", required=True)
    p.add_argument("--grep", required=True)
    p.set_defaults(func=cmd_commit_exists)

    p = sub.add_parser("diff-free", help="no changed line since BASE matches the pattern")
    p.add_argument("--base", required=True)
    p.add_argument("--pattern", required=True)
    p.add_argument("--path", nargs="*")
    p.set_defaults(func=cmd_diff_free)

    p = sub.add_parser("django-check", help="manage.py check passes for each module profile")
    p.add_argument("--modules", nargs="+", default=["all", "warehouse", "accounting"],
                   help="WH_MODULES values to check; 'all' means every module (default: all warehouse accounting)")
    p.set_defaults(func=cmd_django_check)

    p = sub.add_parser("migrations-unchanged", help="makemigrations --check --dry-run finds nothing (full profile)")
    p.set_defaults(func=cmd_migrations_unchanged)

    p = sub.add_parser("dist-free", help="no .js/.html/.json file in a build output matches the pattern")
    p.add_argument("--dist", required=True, help="build output folder relative to the repository root")
    p.add_argument("--pattern", required=True)
    p.set_defaults(func=cmd_dist_free)

    p = sub.add_parser("django-tests", help="manage.py test LABELS has no failing test outside the known list")
    p.add_argument("--labels", nargs="+", required=True)
    p.add_argument("--known", help="repo-relative file: one known failing test per line (app.module.Class.test_name)")
    p.add_argument("--min-tests", type=int, default=1)
    p.set_defaults(func=cmd_django_tests)

    p = sub.add_parser("module-names", help="each backend module still exposes every top-level name it had at BASE")
    p.add_argument("--base", required=True)
    p.add_argument("--file", nargs="+", required=True, help="repo-relative .py path(s), e.g. backend/modules/accounting/personnel/views.py")
    p.add_argument("--with-imports", action="store_true", help="also require the names the module imported at BASE")
    p.set_defaults(func=cmd_module_names)

    p = sub.add_parser("guardian29-max", help="guardian 29 counters (--json) are not above the given maximums")
    p.add_argument("--max", nargs="+", required=True, metavar="COUNTER=N")
    p.add_argument("--min", nargs="+", metavar="COUNTER=N")
    p.set_defaults(func=cmd_guardian29_max)

    p = sub.add_parser("migrate-empty", help="migrate on an empty database (temporary postgres container) per profile")
    p.add_argument("--modules", nargs="+", default=["all", "warehouse", "accounting"])
    p.set_defaults(func=cmd_migrate_empty)

    p = sub.add_parser("release-mark", help="record the start time of an app release (require: line)")
    p.set_defaults(func=cmd_release_mark)

    p = sub.add_parser("release-check", help="app release after release-mark: backup, patched build, restarts, heartbeat, 200")
    p.add_argument("--frontend-only", action="store_true",
                   help="daphne and the worker must run but need not be restarted after the mark")
    p.add_argument("--backend-only", action="store_true",
                   help="no frontend build expected; daphne restarted after the mark; the worker must run")
    p.set_defaults(func=cmd_release_check)

    p = sub.add_parser("restart-backend", help="restart daphne on port 8000 in a new Windows Terminal tab")
    p.set_defaults(func=cmd_restart_backend)

    p = sub.add_parser("restart-worker", help="restart the GDrive sync worker (or open its tab) and wait for a fresh heartbeat")
    p.set_defaults(func=cmd_restart_worker)

    p = sub.add_parser("sample-module", help="new_module.py builds a sample module in a HEAD copy without touching the core")
    p.set_defaults(func=cmd_sample_module)

    p = sub.add_parser("spec-check", help="a front spec exists, has enough tests, contains required text, no skip/only/fs")
    p.add_argument("--file", required=True)
    p.add_argument("--min-tests", type=int, default=1)
    p.add_argument("--require", action="append")
    p.set_defaults(func=cmd_spec_check)

    p = sub.add_parser("ng-test-compare", help="ng test on HEAD has no new failure compared with BASE")
    p.add_argument("--base", required=True)
    p.add_argument("--include", action="append", required=True)
    p.add_argument("--exclude", action="append")
    p.add_argument("--no-skip", action="store_true",
                   help="do not skip specs that failed to compile on base; any type error on HEAD fails")
    p.add_argument("--max-failed", type=int, help="fail if HEAD has more failing tests than this")
    p.set_defaults(func=cmd_ng_test_compare)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except RuntimeError as e:
        print(f"ERROR: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
