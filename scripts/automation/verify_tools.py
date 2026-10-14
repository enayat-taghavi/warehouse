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
  python scripts/automation/verify_tools.py guardian29-max --max COUNTER=N [...] [--min COUNTER=N ...]
  python scripts/automation/verify_tools.py migrate-empty [--modules all warehouse accounting]
  python scripts/automation/verify_tools.py sample-module

هر فرمان در موفقیت کد ۰ و در شکست کد ۱ می‌دهد و علت را چاپ می‌کند.
الگوهای ng-test-compare نسبت به warehouse-front هستند (مثل src/app/shared/icons/*.spec.ts).
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
FRONT_DIR = REPO_ROOT / "warehouse-front"
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
    for line in git("status", "--porcelain").splitlines():
        if not line.strip() or line.startswith("??"):
            continue
        path = line[3:].split(" -> ", 1)[-1].strip().strip('"')
        if path not in allowed:
            bad.append(line)
    if bad:
        print("Uncommitted changes to tracked files (commit or revert them):")
        for line in bad:
            print(f"  {line}")
        return 1
    print("Working tree is clean (runner files ignored).")
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

BACKEND_DIR = REPO_ROOT / "warehouse-backend"
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


SAMPLE_ALLOWED = ("warehouse-backend/modules/sample/", "warehouse-front/src/app/modules/sample/",
                  "warehouse-front/src/app/modules/installed-modules.ts")


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
            code, out = run_manage(["check"], profile, backend=work / "warehouse-backend")
            if code != 0:
                problems.append(f"manage.py check (WH_MODULES={profile or 'all'}) exit {code}:\n{tail(out)}")
        front = work / "warehouse-front"
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
    remove_junction(root / "warehouse-front" / "node_modules")
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
    """خطاهای نوع به تفکیک فایل (مسیر نسبت به warehouse-front)."""
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
        git("archive", "-o", str(tar_path), full_hash, "warehouse-front")
        with tarfile.open(tar_path) as tf:
            tf.extractall(work, filter="data")
        tar_path.unlink()
        front = work / "warehouse-front"
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
    """فایل‌های جابه‌جاشدهٔ warehouse-front از BASE تا HEAD (مسیر نسبت به warehouse-front)، تا نتیجهٔ پایه با مسیر تازه مقایسه شود."""
    out = git("-c", "diff.renameLimit=20000", "diff", "--name-status", "-M", full_hash, "HEAD", "--", "warehouse-front/src")
    renames = {}
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) == 3 and parts[0].startswith("R"):
            renames[parts[1].removeprefix("warehouse-front/")] = parts[2].removeprefix("warehouse-front/")
    return renames


def remap_path_prefix(name: str, renames: dict) -> str:
    # نام تست شکست‌خورده با مسیر spec شروع می‌شود («src/... > describe > it»).
    path, sep, rest = name.partition(" ")
    return renames.get(path, path) + sep + rest


def cmd_ng_test_compare(args) -> int:
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
        head = run_suite(FRONT_DIR, "head", includes, excludes,
                         {f for f in base_broken if f.endswith(".spec.ts")})
    finally:
        (FRONT_DIR / TSCONFIG_NAME).unlink(missing_ok=True)

    problems = []
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

    p = sub.add_parser("guardian29-max", help="guardian 29 counters (--json) are not above the given maximums")
    p.add_argument("--max", nargs="+", required=True, metavar="COUNTER=N")
    p.add_argument("--min", nargs="+", metavar="COUNTER=N")
    p.set_defaults(func=cmd_guardian29_max)

    p = sub.add_parser("migrate-empty", help="migrate on an empty database (temporary postgres container) per profile")
    p.add_argument("--modules", nargs="+", default=["all", "warehouse", "accounting"])
    p.set_defaults(func=cmd_migrate_empty)

    p = sub.add_parser("sample-module", help="new_module.py builds a sample module in a HEAD copy without touching the core")
    p.set_defaults(func=cmd_sample_module)

    p = sub.add_parser("ng-test-compare", help="ng test on HEAD has no new failure compared with BASE")
    p.add_argument("--base", required=True)
    p.add_argument("--include", action="append", required=True)
    p.add_argument("--exclude", action="append")
    p.set_defaults(func=cmd_ng_test_compare)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except RuntimeError as e:
        print(f"ERROR: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
