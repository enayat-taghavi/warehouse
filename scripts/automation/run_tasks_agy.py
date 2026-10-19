#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
اجراکننده تسک‌ها در نشست‌های مستقل Antigravity از راه CLI رسمی (`agy`، حالت بدون رابط stream-json)
Task runner on top of the Antigravity CLI (`agy`, headless stream-json mode). Plan:
Documents/Antigravity_Parallel_Runner/implementation_plan_antigravity_parallel_runner.md

صف (پیش‌فرض):   python scripts/automation/run_tasks_agy.py [--tasks FILE] [--project DIR] [--model SLUG] [--agy PATH]
                              [--max-parallel N] [--worktree-root DIR]
                              [--resume CONVERSATION_ID --base HASH [--worktree DIR] [--nudge [FILE]]]
گفتگو:          python scripts/automation/run_tasks_agy.py ask (--new | --conversation ID) --message-file FILE
                              [--model SLUG] [--out FILE]

قالب tasks.md همان run_tasks.py است: تسک‌ها با خطی از === جدا می‌شوند و هر تسک می‌تواند دستورها را در یک
کامنت HTML داشته باشد که هرگز برای ایجنت فرستاده نمی‌شود:

    <!-- runner
    require: <فرمان>        پیش از شروع نشست؛ اگر کد ۰ نداد، صف می‌ایستد
    verify: <فرمان>         پس از پایان نشست؛ همه باید کد ۰ بدهند تا تسک [DONE] شود
    verify-merged: <فرمان>  مثل verify (در اجرای ترتیبی بلافاصله پس از verify؛ در گروه موازی پس از ادغام)
    model: <slug>           مدل همین تسک (پیش‌فرض --model؛ فهرست: agy models)
    parallel: <گروه>        اجرای هم‌زمان تسک‌های پیاپیِ هم‌گروه، هر کدام در git worktree جدا
    -->

{base} با hash کوتاه HEAD درست پیش از شروع تسک و {root} با مسیر کار (پروژه یا worktree) جای‌گذاری می‌شود.
اگر verify شکست بخورد، خروجی‌اش در همان نشست برای ایجنت فرستاده می‌شود (حداکثر MAX_FIX_ROUNDS بار) و بعد صف می‌ایستد.
اگر نوبت ایجنت با خطای سرویس، قطع فرایند یا بی‌حرکتی بریده شود، با `--conversation` ادامه داده می‌شود (حداکثر MAX_RESUMES).
برچسب [DONE] را فقط خود اجراکننده روی خط عنوان تسک می‌گذارد.

گروه موازی: فقط وقتی هم‌زمان اجرا می‌شود که هر تسک خط `verify: ... scope --allow <globها>` داشته باشد و دامنه‌ها
هم‌پوشانی نداشته باشند؛ وگرنه ترتیبی روی پروژه. هر تسک در `<worktree-root>/<run-id>/task-NN` روی شاخهٔ
`runner/<run-id>/task-NN` از HEAD لحظهٔ شروع گروه کار می‌کند (node_modules و venv با junction، .env کپی).
کار فقط با همهٔ تغییرها کامیت‌شده پذیرفته می‌شود. پس از پایان همه، تسک‌های سالم به ترتیب فایل با cherry-pick روی
پروژه ادغام و [DONE] می‌شوند و worktreeشان حذف می‌شود؛ سپس verify-merged روی پروژه. worktree تسک ناموفق یا
ادغام‌نشده می‌ماند و با `--resume ID --base HASH --worktree DIR` در همان‌جا ادامه می‌یابد. runner هرگز reset،
checkout --، stash یا حذف بازگشتی نمی‌کند؛ ادغامی که با تغییر کامیت‌نشدهٔ پروژه هم‌پوشانی دارد انجام نمی‌شود.
تعداد هم‌زمان: حداکثر --max-parallel، به شرط RAM آزاد (RAM_RESERVE_MB + RAM_PER_AGENT_MB برای هر ایجنت تازه)؛
خطای سهمیه/نرخ سقف را موقتاً پایین می‌آورد. فرمان‌های سنگین (HEAVY_COMMAND_RE) یکی‌یکی اجرا می‌شوند.
"""

import argparse
import json
import os
import queue
import re
import shlex
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

# اطمینان از پشتیبانی کامل از UTF-8 در کنسول ویندوز
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_DIR = SCRIPT_DIR.parent.parent
PROJECT_DIR = REPO_DIR
LOG_DIR = PROJECT_DIR / "scratch" / "logs" / "runner"
STATUS_FILE = LOG_DIR / "status.json"
WORKTREE_ROOT = REPO_DIR.parent / "warehouse-worktrees"
RUN_ID = ""

DEFAULT_MODEL = "gemini-3.8-flash-high"
# بدون هیچ رویدادی از agy تا این مدت یعنی نوبت گیر کرده؛ فرایند کشته و در همان چت ادامه داده می‌شود
STALL_TIMEOUT_SECONDS = 20 * 60
MAX_RESUMES = 3
RESUME_DELAY_SECONDS = 20
MAX_FIX_ROUNDS = 2
COMMAND_TIMEOUT_SECONDS = 30 * 60
FEEDBACK_TAIL_LINES = 40
FEEDBACK_MAX_CHARS = 6000
CLOSE_WAIT_SECONDS = 60

# اجرای موازی (اندازه‌گیری spike: هر ایجنت حدود ۴۵۰MB از RAM آزاد کم می‌کند)
DEFAULT_MAX_PARALLEL = 10
RAM_RESERVE_MB = 1500
RAM_PER_AGENT_MB = 550
LAUNCH_STAGGER_SECONDS = 20
THROTTLE_COOLDOWN_SECONDS = 5 * 60
QUOTA_ERROR_RE = re.compile(r"quota|rate.?limit|resource.?exhausted|too many requests|\b429\b", re.IGNORECASE)
# فرمان‌های require/verify سنگین با یک قفل سراسری یکی‌یکی اجرا می‌شوند
HEAVY_COMMAND_RE = re.compile(r"\bng\s+(build|test)\b|ng-test-compare|gradlew|guardian|manage\.py\s+(migrate|test)\b|"
                              r"\bnpm\s+(ci|install|i|run\s+build)\b", re.IGNORECASE)
# پوشه‌های ignore‌شده‌ای که در worktree با junction به پروژه وصل یا کپی می‌شوند
WORKTREE_LINKS = ("warehouse-front/node_modules", "warehouse-backend/venv")
WORKTREE_COPIES = ("warehouse-backend/.env",)

RESUME_MESSAGE = ("[RUNNER] Your previous turn ended because of a service error or a lost process, not because of "
                  "your work. Run `git status` to see what is already done, finish the task, commit, and end your turn.")

RUNNER_BLOCK_RE = re.compile(r"<!--\s*runner\b([\s\S]*?)-->", re.IGNORECASE)
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
DONE_PREFIXES = ("[x]", "[DONE]", "[SKIP]")

_io_lock = threading.RLock()
_heavy_lock = threading.Lock()
_tls = threading.local()
_log_stream = sys.stdout
_log_file = None
_queue_mode = False
_engines: list = []


def configure(project_dir: Path, worktree_root: Path | None = None):
    global PROJECT_DIR, LOG_DIR, STATUS_FILE, WORKTREE_ROOT
    PROJECT_DIR = project_dir
    LOG_DIR = project_dir / "scratch" / "logs" / "runner"
    STATUS_FILE = LOG_DIR / "status.json"
    WORKTREE_ROOT = worktree_root or project_dir.parent / "warehouse-worktrees"


def log(message: str = ""):
    # در اجرای موازی هر رشته پیشوند تسک خودش را دارد
    message = getattr(_tls, "prefix", "") + message
    with _io_lock:
        _log_stream.write(message + "\n")
        _log_stream.flush()
        if _log_file:
            _log_file.write(f"{datetime.now():%H:%M:%S} {message}\n")
            _log_file.flush()


def open_run_log():
    global _log_file
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    if _log_file:
        _log_file.close()
    _log_file = open(LOG_DIR / f"run-agy-{datetime.now():%Y%m%d-%H%M%S}.log", "a", encoding="utf-8")


def write_status(state: str, **extra):
    with _io_lock:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        data = {"state": state, "updated": datetime.now().isoformat(timespec="seconds"), "engine": "agy", **extra}
        STATUS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def stop_queue(reason: str, **extra) -> bool:
    log(f"QUEUE STOPPED: {reason}")
    write_status("stopped", reason=reason, **extra)
    return False


# ---------------------------------------------------------------- tasks file

@dataclass
class Task:
    title: str
    text: str
    requires: list = field(default_factory=list)
    verifies: list = field(default_factory=list)
    merged: list = field(default_factory=list)
    model: str = ""
    group: str = ""


def parse_directives(block: str) -> dict:
    found = {"require": [], "verify": [], "verify-merged": [], "model": "", "parallel": ""}
    for body in RUNNER_BLOCK_RE.findall(block):
        for raw in body.splitlines():
            key, sep, value = raw.strip().partition(":")
            key, value = key.strip().lower(), value.strip()
            if not sep or not value or key not in found:
                continue
            if isinstance(found[key], list):
                found[key].append(value)
            else:
                found[key] = value
    return found


def load_tasks(tasks_path: Path) -> list[Task]:
    """خواندن و تفکیک تسک‌ها با جداکننده ===؛ دستورهای runner پیش از حذف کامنت‌ها خوانده می‌شوند."""
    if not tasks_path.exists():
        raise FileNotFoundError(f"tasks file not found: {tasks_path}")

    content = tasks_path.read_text(encoding="utf-8")
    tasks = []
    for block in re.split(r"(?m)^\s*={3,}\s*$", content):
        block = block.strip()
        if not block:
            continue
        d = parse_directives(block)
        text = re.sub(r"<!--[\s\S]*?-->", "", block).strip()
        if not text:
            continue
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        if len(lines) == 1 and lines[0].startswith("# "):
            continue
        title = lines[0]
        if title.startswith(DONE_PREFIXES) or block.startswith("<!-- DISABLED -->"):
            log(f"Skipped (done/disabled): {title[:80]}")
            continue
        tasks.append(Task(title=title, text=text, requires=d["require"], verifies=d["verify"],
                          merged=d["verify-merged"], model=d["model"], group=d["parallel"]))
    return tasks


def task_scope(task: Task) -> list[str]:
    """الگوهای glob خطوط `verify: ... scope ... --allow <الگوها>`؛ فهرست خالی یعنی دامنهٔ فایل تسک معلوم نیست."""
    globs = []
    for cmd in task.verifies:
        try:
            parts = shlex.split(cmd)
        except ValueError:
            parts = cmd.split()
        if "scope" not in parts or "--allow" not in parts:
            continue
        for value in parts[parts.index("--allow") + 1:]:
            if value.startswith("--"):
                break
            globs.append(value.replace("\\", "/"))
    return globs


def glob_prefix(pattern: str) -> str:
    m = re.search(r"[*?\[]", pattern)
    return pattern[: m.start()] if m else pattern


def scopes_overlap(a: list, b: list) -> bool:
    # محافظه‌کارانه: دو الگو هم‌پوشان‌اند اگر بخش ثابت پیش از اولین wildcard یکی پیشوند دیگری باشد
    # (fnmatch در verify_tools.py `*` را روی / هم تطبیق می‌دهد، پس فقط پیشوند ثابت قابل اتکاست).
    for x in a:
        for y in b:
            px, py = glob_prefix(x), glob_prefix(y)
            if px.startswith(py) or py.startswith(px):
                return True
    return False


def group_blocker(tasks: list) -> str:
    """دلیل اجرای ترتیبی گروه، یا '' اگر اجرای موازی امن است."""
    scopes = []
    for t in tasks:
        s = task_scope(t)
        if not s:
            return f"task '{t.title[:60]}' has no `verify: ... scope --allow` line"
        scopes.append(s)
    for i in range(len(scopes)):
        for j in range(i + 1, len(scopes)):
            if scopes_overlap(scopes[i], scopes[j]):
                return f"scopes of '{tasks[i].title[:50]}' and '{tasks[j].title[:50]}' overlap"
    return ""


def mark_task_done(tasks_path: Path, title: str) -> bool:
    """فقط خط عنوان همان تسک را با [DONE] پیشوند می‌دهد؛ بقیه فایل و پایان خط‌ها دست نمی‌خورد."""
    with _io_lock:
        lines = tasks_path.read_bytes().decode("utf-8").splitlines(keepends=True)
        for i, line in enumerate(lines):
            body = line.rstrip("\r\n")
            if body.strip() == title:
                indent = body[: len(body) - len(body.lstrip())]
                lines[i] = f"{indent}[DONE] {body.strip()}{line[len(body):]}"
                # جایگزینی اتمی: فایل نیمه‌نوشته هرگز دیده نمی‌شود (فایل کامیت‌نشده و ویرایش هم‌زمان دیگران)
                tmp = tasks_path.with_name(f".{tasks_path.name}.runner-tmp")
                tmp.write_bytes("".join(lines).encode("utf-8"))
                try:
                    os.replace(tmp, tasks_path)
                except OSError:
                    tasks_path.write_bytes(tmp.read_bytes())
                    tmp.unlink(missing_ok=True)
                return True
    return False


def history_path(tasks_path: Path) -> Path:
    return tasks_path.with_name(f"{tasks_path.stem}_history.md")


def append_history(path: Path, task_no: int, total: int, task: Task, conv_id: str, status: str,
                   steps: int, tokens: int, elapsed_sec: int, reply: str, checks: list):
    minutes, seconds = divmod(elapsed_sec, 60)
    reply = reply.strip().replace("\r\n", "\n")
    if len(reply) > 700:
        reply = reply[:700] + "..."
    checks_text = "\n".join(checks) if checks else "  - (none)"
    entry = f"""
### Task {task_no} of {total} — {datetime.now():%Y-%m-%d %H:%M:%S}
- **Status:** {status}
- **Conversation:** `{conv_id}`
- **Steps:** {steps}
- **Tokens:** {tokens}
- **Duration:** {minutes}m {seconds}s
- **Checks:**
{checks_text}
- **Task:**
```
{task.text}
```
- **Agent's last reply:**
{reply}

---
"""
    try:
        with _io_lock:
            if not path.exists():
                path.write_text("# Antigravity task runner history\n", encoding="utf-8")
            with open(path, "a", encoding="utf-8") as f:
                f.write(entry)
    except Exception as e:
        log(f"WARNING: could not write history: {e}")


# ---------------------------------------------------------------- git and commands

def git(*args, cwd: Path | None = None) -> str | None:
    try:
        r = subprocess.run(["git", *args], cwd=cwd or PROJECT_DIR, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=60)
    except Exception:
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def git_run(*args, cwd: Path | None = None, timeout: int = 300) -> tuple[int, str]:
    """git با کد خروج؛ خروجی بدون strip (برای -z و porcelain)، و در شکست همراه stderr."""
    try:
        r = subprocess.run(["git", "-c", "core.quotepath=false", *args], cwd=cwd or PROJECT_DIR, capture_output=True,
                           text=True, encoding="utf-8", errors="replace", timeout=timeout)
    except Exception as e:
        return -1, f"{e!r}"
    return r.returncode, r.stdout if r.returncode == 0 else (r.stdout + r.stderr)


def git_head(cwd: Path | None = None) -> str:
    return git("rev-parse", "--short", "HEAD", cwd=cwd) or ""


def git_snapshot(cwd: Path | None = None) -> tuple:
    return git("rev-parse", "HEAD", cwd=cwd), git("status", "--porcelain", cwd=cwd)


def kill_tree(pid: int):
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
    else:
        try:
            os.kill(pid, 9)
        except OSError:
            pass


def run_command(cmd: str, log_path: Path, cwd: Path) -> tuple[int, str]:
    """اجرای فرمان در مسیر کار با سقف زمانی؛ خروجی کامل در log_path می‌ماند."""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    timed_out = False
    heavy = bool(HEAVY_COMMAND_RE.search(cmd))
    if heavy and not _heavy_lock.acquire(blocking=False):
        log("    waiting for the heavy-command lock...")
        _heavy_lock.acquire()
    try:
        rc, timed_out = _run_logged(cmd, log_path, cwd, env)
    finally:
        if heavy:
            _heavy_lock.release()
    output = log_path.read_bytes().decode("utf-8", errors="replace")
    if timed_out:
        output += f"\n[runner] command killed after {COMMAND_TIMEOUT_SECONDS // 60} minutes\n"
    return rc, output


def _run_logged(cmd: str, log_path: Path, cwd: Path, env: dict) -> tuple[int, bool]:
    timed_out = False
    with open(log_path, "wb") as out:
        out.write(f"$ {cmd}\n\n".encode("utf-8"))
        out.flush()
        proc = subprocess.Popen(cmd, shell=True, cwd=cwd, env=env, stdout=out, stderr=subprocess.STDOUT)
        try:
            rc = proc.wait(timeout=COMMAND_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            kill_tree(proc.pid)
            proc.wait()
            rc, timed_out = -1, True
        except KeyboardInterrupt:
            kill_tree(proc.pid)
            raise
    return rc, timed_out


def run_checks(kind: str, commands: list, base: str, task_no: int, round_no: int | str, cwd: Path) -> list[dict]:
    failures = []
    for n, template in enumerate(commands, 1):
        cmd = template.replace("{base}", base).replace("{root}", str(cwd))
        log_path = LOG_DIR / f"task{task_no:02d}-r{round_no}-{kind}{n}.log"
        log(f"  {kind} {n}/{len(commands)}: {cmd}")
        started = time.time()
        rc, output = run_command(cmd, log_path, cwd)
        verdict = "OK" if rc == 0 else f"FAILED (exit {rc})"
        log(f"    -> {verdict} in {int(time.time() - started)}s; log: {log_path}")
        if rc != 0:
            failures.append({"cmd": cmd, "rc": rc, "output": output, "log": str(log_path)})
    return failures


def checks_summary(label: str, commands: list, failures: list) -> str:
    line = f"  - {label}: {len(commands) - len(failures)}/{len(commands)} passed"
    for f in failures:
        line += f"\n    - FAILED (exit {f['rc']}): `{f['cmd']}`"
    return line


def no_question_marks(text: str) -> str:
    # قانون «?» در .agents/AGENTS.md پیام دارای علامت سؤال را پرسشی می‌کند؛ پیام‌های runner نباید پرسشی خوانده شوند.
    return text.replace("?", " ").replace("؟", " ")


def feedback_message(failures: list, round_no: int) -> str:
    parts = [
        f"[RUNNER] Verification failed after your last turn (fix round {round_no} of {MAX_FIX_ROUNDS}).",
        "Fix the causes within the original task scope, commit the fix, and end your turn.",
        "You may re-run a failed command to confirm your fix; the runner re-runs all checks afterwards.",
    ]
    budget = FEEDBACK_MAX_CHARS
    for f in failures:
        lines = [ln for ln in ANSI_RE.sub("", f["output"]).splitlines() if ln.strip()]
        tail = "\n".join(lines[-FEEDBACK_TAIL_LINES:])
        block = f"\nFAILED (exit {f['rc']}): {f['cmd']}\nFull log: {f['log']}\n```\n{tail}\n```"
        if len(block) > budget:
            block = block[:budget] + "\n...(truncated)"
        parts.append(block)
        budget -= len(block)
        if budget <= 0:
            break
    return no_question_marks("\n".join(parts))


# ---------------------------------------------------------------- agy engine

@dataclass
class TurnResult:
    status: str
    response: str = ""
    error: str = ""


def find_agy(explicit: str | None) -> str | None:
    candidates = [explicit, os.environ.get("AGY_EXE"), shutil.which("agy"),
                  str(Path(os.environ.get("LOCALAPPDATA", "")) / "agy" / "bin" / "agy.exe")]
    for c in candidates:
        if c and Path(c).exists():
            return str(c)
    return None


def agy_version(agy: str) -> str:
    try:
        r = subprocess.run([agy, "--version"], capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=30)
        return r.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def agy_models(agy: str) -> list[str] | None:
    """فهرست slug مدل‌ها از `agy models`؛ None یعنی خوانده نشد."""
    try:
        r = subprocess.run([agy, "models"], capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=60)
    except Exception:
        return None
    slugs = [ln.split("\t")[0].strip() for ln in r.stdout.splitlines() if "\t" in ln]
    return slugs or None


def agent_env() -> dict:
    """محیط agy: هوک‌ها با cmd و python و فرمان‌های shell با PowerShell اجرا می‌شوند و agy فقط PATH را می‌گردد
    (آزمون زندهٔ ۲۸ مهر از Bash: PATH بی System32 → `exec: "cmd"/"powershell": executable file not found`
    و ایجنت به‌جای تسک سرگرم اشکال محیط شد)."""
    env = dict(os.environ)
    parts = [p for p in env.get("PATH", "").split(os.pathsep) if p]
    known = {p.lower().rstrip("\\/") for p in parts}
    extra = [str(Path(sys.executable).parent)]
    if sys.platform == "win32":
        root = os.environ.get("SystemRoot", r"C:\Windows")
        system32 = os.path.join(root, "System32")
        extra += [system32, root, os.path.join(system32, "Wbem"), os.path.join(system32, "WindowsPowerShell", "v1.0")]
    env["PATH"] = os.pathsep.join(parts + [p for p in extra if p.lower().rstrip("\\/") not in known])
    return env


def missing_agent_tools() -> list[str]:
    """ابزارهایی که agy و هوک‌ها لازم دارند و در PATH ایجنت پیدا نمی‌شوند. با مجوز خودکار، ایجنتِ محیط خراب
    خودش «تعمیر» می‌کند (آزمون زنده: ساخت powershell.cmd در پوشه‌های PATH کاربر)؛ پس صف پیش از شروع می‌ایستد."""
    path = agent_env()["PATH"]
    need = ["git", "python"] + (["cmd", "powershell"] if sys.platform == "win32" else [])
    return [name for name in need if not shutil.which(name, path=path)]


def short_params(name: str, params) -> str:
    if isinstance(params, dict):
        for key in ("CommandLine", "TargetFile", "AbsolutePath", "Path"):
            if params.get(key):
                return f"{name} {str(params[key])[:110]}"
    return f"{name} {json.dumps(params, ensure_ascii=False)[:110]}"


class AgyEngine:
    """یک فرایند `agy` در حالت stream-json برای چند نوبت پیاپی در یک چت؛ پایان نوبت = رویداد result."""

    def __init__(self, agy: str, model: str, workdir: Path, tag: str, conversation_id: str = ""):
        self.agy, self.model, self.workdir, self.tag = agy, model, workdir, tag
        self.conversation_id = conversation_id
        self.steps_total = 0
        self.tokens_total = 0
        self._proc = None
        self._queue: queue.Queue = queue.Queue()
        self._raw = None
        self._err_path = LOG_DIR / f"agy-{tag}.err"
        self._steps_seen: set = set()
        self._prev_tokens = 0

    def _spawn(self):
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        args = [self.agy, "--input-format", "stream-json", "--output-format", "stream-json",
                "--model", self.model, "--dangerously-skip-permissions", "--disable-slash-commands",
                "--print-timeout", "0"]
        if self.conversation_id:
            args += ["--conversation", self.conversation_id]
        self._raw = open(LOG_DIR / f"agy-{self.tag}.ndjson", "a", encoding="utf-8")
        err = open(self._err_path, "ab")
        self._queue = queue.Queue()
        self._prev_tokens = 0
        self._proc = subprocess.Popen(args, cwd=self.workdir, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                      stderr=err, text=True, encoding="utf-8", errors="replace", bufsize=1,
                                      env=agent_env())
        err.close()
        _engines.append(self)
        q, proc = self._queue, self._proc

        def reader():
            try:
                for line in proc.stdout:
                    q.put(line)
            except (OSError, ValueError):
                pass
            q.put(None)
        threading.Thread(target=reader, daemon=True).start()
        self._say(f"agy started (pid {proc.pid}, model {self.model}"
                  f"{', conversation ' + self.conversation_id if self.conversation_id else ''})")

    def _say(self, message: str):
        # در اجرای موازی پیشوند رشته همان تسک را نشان می‌دهد
        log(f"  {message}" if getattr(_tls, "prefix", "") else f"  [{self.tag}] {message}")

    def alive(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def _stderr_tail(self) -> str:
        try:
            data = self._err_path.read_bytes().decode("utf-8", errors="replace").strip().splitlines()
        except OSError:
            return ""
        return " | ".join(data[-3:])[:400]

    def send(self, text: str) -> TurnResult:
        if not self.alive():
            self._spawn()
        started = time.time()
        line = json.dumps({"event": "user", "message": {"content": text}})
        try:
            self._proc.stdin.write(line + "\n")
            self._proc.stdin.flush()
        except OSError as e:
            return TurnResult("PROCESS_ENDED", error=f"could not write to agy: {e}; {self._stderr_tail()}")

        while True:
            try:
                raw = self._queue.get(timeout=STALL_TIMEOUT_SECONDS)
            except queue.Empty:
                kill_tree(self._proc.pid)
                return TurnResult("STALLED", error=f"no event from agy for {STALL_TIMEOUT_SECONDS // 60} minutes")
            if raw is None:
                code = self._proc.wait()
                return TurnResult("PROCESS_ENDED", error=f"agy exited with code {code} before the turn ended; "
                                                         f"{self._stderr_tail()}")
            self._raw.write(raw)
            self._raw.flush()
            try:
                event = json.loads(raw)
            except ValueError:
                continue
            kind = event.get("event")
            if event.get("conversation_id") and not self.conversation_id:
                self.conversation_id = event["conversation_id"]
            if kind == "step_update":
                self._on_step(event.get("step_update") or {})
            elif kind == "result":
                return self._on_result(event.get("result") or event, started)

    def _on_step(self, su: dict):
        idx = su.get("step_index")
        if idx is not None and idx not in self._steps_seen:
            self._steps_seen.add(idx)
            self.steps_total += 1
        info = su.get("tool_info") or {}
        if su.get("step_type") == "tool" and su.get("state") == "DONE" and info.get("name"):
            failed = f" ERROR: {(info.get('error') or {}).get('message', '')[:100]}" if info.get("error") else ""
            self._say(f"step {idx}: {short_params(info['name'], info.get('parameters'))}{failed}")

    def _on_result(self, r: dict, started: float) -> TurnResult:
        if r.get("conversation_id"):
            self.conversation_id = r["conversation_id"]
        total = int((r.get("usage") or {}).get("total_tokens") or 0)
        self.tokens_total += total - self._prev_tokens if total >= self._prev_tokens else total
        self._prev_tokens = total
        res = TurnResult(r.get("status") or "UNKNOWN", r.get("response") or "", r.get("error") or "")
        self._say(f"turn {res.status} in {int(time.time() - started)}s "
                  f"(steps {self.steps_total}, tokens {self.tokens_total})"
                  f"{': ' + res.error[:160] if res.error else ''}")
        return res

    def close(self):
        if self._proc is None:
            return
        try:
            self._proc.stdin.close()
        except OSError:
            pass
        try:
            self._proc.wait(timeout=CLOSE_WAIT_SECONDS)
        except subprocess.TimeoutExpired:
            kill_tree(self._proc.pid)
            self._proc.wait()
        try:
            self._proc.stdout.close()
        except OSError:
            pass
        if self._raw:
            self._raw.close()
            self._raw = None
        if self in _engines:
            _engines.remove(self)


ASK_RESUME_MESSAGE = ("[RUNNER] Your previous turn ended because of a service error or a lost process, not because of "
                      "your work. Do not change any files; finish your answer to the last message and end your turn.")


def agent_turn(engine: AgyEngine, text: str, gate=None, resume_message: str = RESUME_MESSAGE) -> TurnResult:
    """یک نوبت ایجنت؛ نوبت ناموفق (خطای سرویس، قطع فرایند، بی‌حرکتی) در همان چت ادامه داده می‌شود.
    gate: تابعی که پس از هر نوبت ناموفق و پیش از ادامه صدا زده می‌شود؛ اگر True بدهد (verify گذشته) کار پذیرفته می‌شود،
    چون خطای شبکه گاهی پس از تمام شدن کار و هنگام نوشتن پاسخ پایانی رخ می‌دهد."""
    res = engine.send(text)
    resumes = 0
    while res.status != "SUCCESS":
        _throttle.note(res.error)
        if gate and gate():
            log(f"Verify passed although the turn ended with {res.status}; accepting the work.")
            return TurnResult("SUCCESS", res.response, f"accepted after {res.status}")
        if resumes >= MAX_RESUMES or not engine.conversation_id:
            break
        resumes += 1
        delay = RESUME_DELAY_SECONDS * resumes
        log(f"Turn ended with {res.status} ({res.error[:160]}); resuming the conversation in {delay}s "
            f"({resumes}/{MAX_RESUMES})...")
        engine.close()
        time.sleep(delay)
        res = engine.send(no_question_marks(resume_message))
    return res


# ---------------------------------------------------------------- queue

@dataclass
class TaskRun:
    """وضعیت اجرای یک تسک (در پروژه یا در worktree)."""
    no: int
    total: int
    task: Task
    workdir: Path
    branch: str = ""
    base: str = ""
    ok: bool = False
    status: str = ""
    reason: str = ""
    note: str = ""
    conversation: str = ""
    steps: int = 0
    tokens: int = 0
    reply: str = ""
    checks: list = field(default_factory=list)
    started: float = field(default_factory=time.time)

    @property
    def tag(self) -> str:
        return f"task{self.no:02d}"

    def conv_extra(self) -> dict:
        return {"conversation": self.conversation} if self.conversation else {}


def record(history: Path, run: TaskRun, status: str):
    append_history(history, run.no, run.total, run.task, run.conversation or "-", status, run.steps, run.tokens,
                   int(time.time() - run.started), run.reply, run.checks)


def finish_task(tasks_path: Path, history: Path, run: TaskRun, status: str):
    if mark_task_done(tasks_path, run.task.title):
        log("Marked [DONE] in the tasks file.")
    else:
        log("WARNING: title line not found in the tasks file; [DONE] not written.")
    record(history, run, status)
    log(f"[Task {run.no}] DONE in {int(time.time() - run.started) // 60} min.")


def uncommitted_failure(workdir: Path) -> list[dict]:
    # در worktree فقط کامیت‌ها ادغام می‌شوند؛ تغییر کامیت‌نشده با حذف worktree از دست می‌رفت
    rc, out = git_run("status", "--porcelain", "--untracked-files=all", cwd=workdir)
    if rc == 0 and not out.strip():
        return []
    text = (f"git status failed: {out.strip()[-300:]}" if rc else
            "Your working copy has uncommitted changes. The runner merges only commits, so commit these files "
            "(or delete them if they are not part of the task):\n" + out.rstrip())
    return [{"cmd": "git status --porcelain --untracked-files=all", "rc": rc or 1, "output": text, "log": "-"}]


def work_on_task(agy: str, model: str, run: TaskRun, verifies: list, resume: tuple | None = None,
                 on_update=None, isolated: bool = False):
    """require، نوبت ایجنت، verify و دورهای اصلاح در run.workdir؛ نتیجه در run.ok/status/reason.
    [DONE]، history و توقف صف با فراخواننده است.
    resume=(شناسه چت، hash پایه، پیام ادامه): ادامهٔ همان چت؛ require رد می‌شود و بی پیام ادامه مستقیم verify اجرا می‌شود.
    isolated: مسیر کار worktree است؛ کار فقط با درخت تمیز (همه‌چیز کامیت‌شده) پذیرفته می‌شود."""
    task, workdir = run.task, run.workdir
    engine = AgyEngine(agy, task.model or model, workdir, run.tag, resume[0] if resume else "")
    notify = on_update or (lambda r: None)

    def sync():
        run.conversation = engine.conversation_id or run.conversation
        run.steps, run.tokens = engine.steps_total, engine.tokens_total

    def verify(label: str, round_no) -> list:
        failures = run_checks("verify", verifies, run.base, run.no, round_no, workdir) if verifies else []
        if verifies:
            run.checks.append(checks_summary(label, verifies, failures))
        if isolated and not failures:
            failures = uncommitted_failure(workdir)
            if failures:
                log("    -> the worktree has uncommitted changes")
                run.checks.append(f"  - {label}: uncommitted changes in the worktree")
        return failures

    def fail(status: str, reason: str):
        run.ok, run.status, run.reason = False, status, reason

    try:
        if resume:
            _, run.base, first = resume
            log(f"Resuming conversation {engine.conversation_id} with base commit {run.base} in {workdir}.")
        else:
            if task.requires:
                log(f"Running {len(task.requires)} require command(s)...")
                failures = run_checks("require", task.requires, git_head(workdir), run.no, 0, workdir)
                run.checks.append(checks_summary("require", task.requires, failures))
                if failures:
                    return fail("STOPPED (require failed)", f"task {run.no}: require failed: {failures[0]['cmd']}")
            run.base = git_head(workdir)
            first = task.text
        if run.base:
            log(f"Base commit: {run.base}")

        must_check = bool(verifies) or isolated
        gates = {"count": 0, "passed": False}

        def gate() -> bool:
            if not must_check:
                return False
            gates["count"] += 1
            log("The agent turn did not end cleanly; running verify to see whether the work is already complete...")
            gates["passed"] = not verify(f"verify gate {gates['count']}", f"g{gates['count']}")
            return gates["passed"]

        res = agent_turn(engine, first, gate) if first else TurnResult("SUCCESS")
        sync()
        notify(run)
        fix_round = 0
        while True:
            run.reply = res.response or run.reply
            if res.status != "SUCCESS":
                return fail(f"STOPPED ({res.status})", f"task {run.no}: agent turn ended with {res.status}: "
                                                       f"{res.error[:200]}; conversation {run.conversation or '-'}")
            if not must_check:
                break
            if gates["passed"]:
                gates["passed"] = False
                run.note = f" ({res.error})" if res.error else ""
                break
            log(f"Running {len(verifies)} verify command(s), round {fix_round}...")
            failures = verify(f"verify round {fix_round}", fix_round)
            if not failures:
                break
            if fix_round >= MAX_FIX_ROUNDS:
                return fail("FAILED (verify still failing)",
                            f"task {run.no}: verify still failing after {MAX_FIX_ROUNDS} fix round(s)")
            fix_round += 1
            log(f"Sending {len(failures)} failure(s) back to the agent (fix round {fix_round}/{MAX_FIX_ROUNDS})...")
            res = agent_turn(engine, feedback_message(failures, fix_round), gate)
            sync()
            notify(run)
        run.ok = True
    finally:
        engine.close()
        sync()


def run_one_task(agy: str, model: str, tasks_path: Path, history: Path, run: TaskRun,
                 resume: tuple | None = None) -> bool:
    """اجرای ترتیبی روی خود پروژه (رفتار گام ۱)."""
    log("=" * 70)
    log(f"[Task {run.no}/{run.total}] {run.task.title[:100]}")
    log("=" * 70)

    def update(r: TaskRun):
        write_status("running", task=r.no, total=r.total, title=r.task.title, **r.conv_extra())

    update(run)
    work_on_task(agy, model, run, run.task.verifies + run.task.merged, resume, update)
    if not run.ok:
        record(history, run, run.status)
        return stop_queue(run.reason, **run.conv_extra())
    finish_task(tasks_path, history, run, "DONE" + run.note)
    return True


# ---------------------------------------------------------------- parallel groups

class Throttle:
    """سقف پویای هم‌زمانی: خطای سهمیه/نرخ سقف را تا یکی کمتر از تعداد در حال اجرا پایین می‌آورد
    (تسک در حال اجرا کشته نمی‌شود) و پس از هر THROTTLE_COOLDOWN_SECONDS بی‌خطا یک پله برمی‌گرداند."""

    def __init__(self):
        self.cap = None
        self.until = 0.0
        self.active = 0
        self._lock = threading.Lock()

    def note(self, error: str):
        if not QUOTA_ERROR_RE.search(error or ""):
            return
        with self._lock:
            self.cap = max(1, self.active - 1)
            self.until = time.time() + THROTTLE_COOLDOWN_SECONDS
            cap = self.cap
        log(f"Quota or rate error from agy; parallel limit lowered to {cap} for "
            f"{THROTTLE_COOLDOWN_SECONDS // 60} min.")

    def limit(self, maximum: int) -> int:
        with self._lock:
            if self.cap is not None and time.time() >= self.until:
                self.cap += 1
                self.until = time.time() + THROTTLE_COOLDOWN_SECONDS
                if self.cap >= maximum:
                    self.cap = None
            return maximum if self.cap is None else min(maximum, self.cap)


_throttle = Throttle()


def available_mb() -> int | None:
    try:
        import psutil
        return int(psutil.virtual_memory().available / 2 ** 20)
    except Exception:
        pass
    if sys.platform == "win32":
        import ctypes

        class MemoryStatus(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong)] + [
                (n, ctypes.c_ulonglong) for n in ("total", "avail", "page_total", "page_avail", "virt_total",
                                                  "virt_avail", "ext_avail")]
        s = MemoryStatus()
        s.dwLength = ctypes.sizeof(s)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(s)):
            return int(s.avail / 2 ** 20)
    return None


def is_link(path: Path) -> bool:
    return os.path.isjunction(path) or os.path.islink(path)


def make_link(src: Path, dst: Path):
    if sys.platform == "win32":
        import _winapi
        _winapi.CreateJunction(str(src), str(dst))
    else:
        os.symlink(src, dst, target_is_directory=True)


def remove_links(path: Path) -> bool:
    """فقط خود junctionها حذف می‌شوند (rmdir بدون /s؛ هرگز حذف بازگشتی). False یعنی هنوز junction مانده است."""
    ok = True
    for rel in WORKTREE_LINKS:
        p = path / rel
        if is_link(p):
            if sys.platform == "win32":
                subprocess.run(["cmd", "/c", "rmdir", str(p)], capture_output=True)
            else:
                os.unlink(p)
        if is_link(p):
            ok = False
    return ok


def create_worktree(path: Path, branch: str, base: str) -> str:
    """worktree تازه روی شاخهٔ تازه از base، با junction پوشه‌های سنگین ignore‌شده و کپی .env. خروجی: خطا یا ''."""
    path.parent.mkdir(parents=True, exist_ok=True)
    rc, out = git_run("worktree", "add", "-b", branch, str(path), base)
    if rc:
        return f"git worktree add failed: {out.strip()[-300:]}"
    for rel in WORKTREE_LINKS:
        src, dst = PROJECT_DIR / rel, path / rel
        if src.is_dir() and dst.parent.is_dir() and not dst.exists():
            try:
                make_link(src, dst)
            except OSError as e:
                return f"cannot link {rel}: {e}"
    for rel in WORKTREE_COPIES:
        src, dst = PROJECT_DIR / rel, path / rel
        if src.is_file() and dst.parent.is_dir() and not dst.exists():
            shutil.copy2(src, dst)
    return ""


def remove_worktree(path: Path, branch: str):
    """فقط برای worktree بی‌کار یا ادغام‌شده: اول junctionها، سپس `git worktree remove` بدون --force
    (اگر فایل کامیت‌نشده یا untracked داشته باشد git نمی‌پذیرد و worktree می‌ماند)، سپس حذف شاخه.
    اگر شاخه کامیتی دارد که معادلش روی پروژه نیست، هیچ چیز حذف نمی‌شود."""
    if branch and git("rev-parse", "-q", "--verify", branch) and unmerged_commits(branch):
        log(f"WARNING: {branch} has commits that are not in the project; kept {path} and the branch.")
        return
    if not path.exists():
        git_run("worktree", "prune")
    elif not remove_links(path):
        log(f"WARNING: a junction in {path} could not be removed; the worktree is kept.")
        return
    else:
        rc, out = git_run("worktree", "remove", str(path))
        if rc:
            log(f"WARNING: git worktree remove failed; kept {path}: {out.strip()[-200:]}")
            return
    if branch:
        git_run("branch", "-D", branch)
    try:
        path.parent.rmdir()
    except OSError:
        pass


def dirty_paths(cwd: Path | None = None) -> set | None:
    """مسیر فایل‌های کامیت‌نشده (تغییر، staged، untracked)؛ None یعنی git status شکست خورد."""
    rc, out = git_run("status", "--porcelain", "-z", "--untracked-files=all", cwd=cwd)
    if rc:
        return None
    paths, items, i = set(), out.split("\0"), 0
    while i < len(items):
        item = items[i]
        i += 1
        if len(item) < 4:
            continue
        paths.add(item[3:])
        if item[0] in "RC" and i < len(items):
            paths.add(items[i])
            i += 1
    return paths


def cherry_pick_in_progress() -> bool:
    if git_run("rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD")[0] == 0:
        return True
    rc, out = git_run("rev-parse", "--git-path", "sequencer")
    return rc == 0 and (PROJECT_DIR / out.strip()).exists()


def unmerged_commits(branch: str) -> list[str]:
    """کامیت‌های شاخه که معادلشان (patch-id) روی HEAD پروژه نیست؛ در خطای git شاخه ادغام‌نشده فرض می‌شود."""
    rc, out = git_run("cherry", "HEAD", branch)
    if rc:
        return ["(git cherry failed)"]
    return [ln[2:] for ln in out.splitlines() if ln.startswith("+")]


def merge_run(run: TaskRun, base_full: str) -> str:
    """کامیت‌های base..branch را با cherry-pick روی شاخهٔ جاری پروژه می‌گذارد. خروجی: خطا یا ''.
    هرگز reset، checkout --، stash یا دور ریختن تغییر کامیت‌نشده؛ در تداخل فقط `cherry-pick --abort`."""
    rc, out = git_run("rev-list", "--reverse", f"{base_full}..{run.branch}")
    if rc:
        return f"git rev-list failed: {out.strip()[-200:]}"
    commits = out.split()
    if not commits:
        log(f"Task {run.no}: no commits on {run.branch}; nothing to merge.")
        return ""
    if cherry_pick_in_progress():
        return "a cherry-pick is already in progress in the project; finish or abort it by hand"
    # مسیرهای هر کامیت جدا و بی تشخیص rename: مسیر قدیم rename و ویرایشِ برگشت‌خورده هم دیده شود
    changed = set()
    for c in commits:
        rc, out = git_run("diff-tree", "-r", "--root", "--no-commit-id", "--no-renames", "--name-only", "-z", c)
        if rc:
            return f"git diff-tree failed: {out.strip()[-200:]}"
        changed |= {p for p in out.split("\0") if p}
    dirty = dirty_paths()
    if dirty is None:
        return "git status failed in the project"
    overlap = sorted(changed & dirty)
    if overlap:
        return f"the project has uncommitted changes in files this task changed: {overlap[:10]}"
    if git_run("diff", "--cached", "--quiet")[0] != 0:
        return "the project has staged changes; the runner does not cherry-pick onto a staged index"
    rc, out = git_run("cherry-pick", *commits)
    if rc:
        note = ""
        # شکست وسط دنباله (مثلاً «local changes would be overwritten») CHERRY_PICK_HEAD نمی‌سازد ولی sequencer می‌ماند
        if cherry_pick_in_progress():
            arc, aout = git_run("cherry-pick", "--abort")
            note = " (cherry-pick aborted)" if arc == 0 else \
                f" (cherry-pick --abort FAILED, resolve by hand: {aout.strip()[-200:]})"
        return f"git cherry-pick failed{note}: {out.strip()[-400:]}"
    log(f"Task {run.no}: merged {len(commits)} commit(s) from {run.branch}.")
    return ""


def resume_hint(run: TaskRun, base: str) -> str:
    if not run.conversation:
        return f"worktree kept: {run.workdir}"
    return (f"continue with: run_tasks_agy.bat --resume {run.conversation} --base {base} "
            f"--worktree \"{run.workdir}\" (first pending task only)")


def run_merged_checks(runs: list, base: str) -> str:
    commands = list(dict.fromkeys(c for r in runs for c in r.task.merged))
    if not commands:
        return ""
    log(f"Running {len(commands)} verify-merged command(s) in the project...")
    failures = run_checks("verify-merged", commands, base, runs[0].no, "m", PROJECT_DIR)
    return f"verify-merged failed: {failures[0]['cmd']}" if failures else ""


def can_launch(active: int, max_parallel: int, last_launch: float, waits: dict) -> bool:
    if active == 0:
        return True
    if active >= _throttle.limit(max_parallel) or time.time() - last_launch < LAUNCH_STAGGER_SECONDS:
        return False
    free = available_mb()
    if free is None or free - RAM_RESERVE_MB >= RAM_PER_AGENT_MB:
        return True
    if time.time() - waits.get("ram", 0) > 60:
        waits["ram"] = time.time()
        log(f"Waiting for free RAM ({free} MB free; need {RAM_RESERVE_MB + RAM_PER_AGENT_MB} MB) before the next agent.")
    return False


def run_group(agy: str, model: str, tasks_path: Path, history: Path, runs: list, max_parallel: int) -> bool:
    """تسک‌های یک گروه موازی، هر کدام در worktree خودش؛ سپس ادغام تسک‌های سالم به ترتیب فایل."""
    name = runs[0].task.group
    log("=" * 70)
    log(f"[Parallel group '{name}'] tasks {', '.join(str(r.no) for r in runs)} of {runs[0].total} "
        f"(max {max_parallel} at once)")
    log("=" * 70)
    head_ref = git("rev-parse", "--abbrev-ref", "HEAD")
    base_full = git("rev-parse", "HEAD")
    if not base_full or not head_ref or head_ref == "HEAD":
        return stop_queue(f"group {name}: the project HEAD is not on a branch")
    base = git_head()
    dirty = dirty_paths()
    if dirty:
        log(f"WARNING: the project has {len(dirty)} uncommitted file(s); the worktrees start from {base} "
            f"and do not see them.")

    group_root = WORKTREE_ROOT / RUN_ID
    for run in runs:
        run.workdir = group_root / f"task-{run.no:02d}"
        run.branch = f"runner/{RUN_ID}/task-{run.no:02d}"
        err = create_worktree(run.workdir, run.branch, base_full)
        if err:
            for r in runs[: runs.index(run) + 1]:
                remove_worktree(r.workdir, r.branch)
            return stop_queue(f"group {name}: task {run.no}: {err}")
        log(f"  task {run.no}: worktree {run.workdir} (branch {run.branch})")

    states = {r.no: "waiting" for r in runs}

    def publish(_=None):
        write_status("running", task=runs[0].no, total=runs[0].total, title=f"parallel group {name}", group=name,
                     base=base, parallel=[{"task": r.no, "title": r.task.title, "state": states[r.no],
                                           "conversation": r.conversation, "workdir": str(r.workdir)} for r in runs])

    def worker(run: TaskRun):
        _tls.prefix = f"[{run.tag}] "
        log(f"[Task {run.no}/{run.total}] {run.task.title[:100]}")
        run.started = time.time()
        states[run.no] = "running"
        publish()
        try:
            work_on_task(agy, model, run, run.task.verifies, None, publish, isolated=True)
        except Exception as e:
            run.ok, run.status, run.reason = False, "STOPPED (runner error)", f"task {run.no}: runner error {e!r}"
        states[run.no] = "verified" if run.ok else "failed"
        publish()
        log("verified; waiting for the group to finish." if run.ok else f"FAILED: {run.reason}")

    pending, active, last_launch, waits = list(runs), [], 0.0, {}
    while pending or active:
        active = [t for t in active if t.is_alive()]
        _throttle.active = len(active)
        if pending and any(s == "failed" for s in states.values()):
            log(f"A task of the group failed; {len(pending)} task(s) not started (they stay pending).")
            for r in pending:
                states[r.no] = "not started"
            pending = []
            publish()
        if pending and can_launch(len(active), max_parallel, last_launch, waits):
            t = threading.Thread(target=worker, args=(pending.pop(0),), daemon=True)
            t.start()
            active.append(t)
            last_launch = time.time()
            continue
        time.sleep(1)
    _throttle.active = 0

    log(f"[Parallel group '{name}'] all agents finished; merging in file order...")
    problems, merged = [], []
    branch_ok = git("rev-parse", "--abbrev-ref", "HEAD") == head_ref
    if not branch_ok:
        problems.append(f"the project branch changed from {head_ref} during the group; nothing merged")
    for run in runs:
        if states[run.no] == "not started":
            remove_worktree(run.workdir, run.branch)
            continue
        if states[run.no] != "verified" or not branch_ok:
            record(history, run, run.status or "VERIFIED, NOT MERGED")
            problems.append(f"{run.reason or f'task {run.no}: not merged'}; {resume_hint(run, base)}")
            continue
        err = merge_run(run, base_full)
        if err:
            states[run.no] = "merge failed"
            record(history, run, "VERIFIED, NOT MERGED")
            problems.append(f"task {run.no}: merge failed: {err}; worktree kept: {run.workdir}")
            continue
        states[run.no] = "merged"
        finish_task(tasks_path, history, run, f"DONE (parallel group {name}{run.note})")
        remove_worktree(run.workdir, run.branch)
        merged.append(run)
    publish()
    if merged:
        err = run_merged_checks(merged, base)
        if err:
            problems.append(err)
    if problems:
        return stop_queue(f"group {name}: " + " | ".join(problems), group=name)
    log(f"[Parallel group '{name}'] {len(merged)} task(s) merged.")
    return True


def run_worktree_resume(agy: str, model: str, tasks_path: Path, history: Path, run: TaskRun, resume: tuple) -> bool:
    """ادامهٔ تسکِ گروه موازیِ ایستاده در worktree خودش؛ سپس ادغام روی پروژه مثل گروه."""
    log("=" * 70)
    log(f"[Task {run.no}/{run.total}] {run.task.title[:100]} (resumed in {run.workdir})")
    log("=" * 70)
    branch = git("rev-parse", "--abbrev-ref", "HEAD", cwd=run.workdir)
    base_full = git("rev-parse", resume[1])
    if not branch or not branch.startswith("runner/") or not base_full:
        return stop_queue(f"task {run.no}: {run.workdir} is not a runner worktree on a runner/ branch, "
                          f"or base {resume[1]} is unknown")
    if not run.workdir.resolve().is_relative_to(WORKTREE_ROOT.resolve()):
        return stop_queue(f"task {run.no}: {run.workdir} is not under the worktree root {WORKTREE_ROOT}")
    if git_run("merge-base", "--is-ancestor", base_full, branch)[0] != 0:
        return stop_queue(f"task {run.no}: base {resume[1]} is not an ancestor of {branch}; pass the group's base "
                          f"commit from the stop reason")
    run.branch = branch

    def update(r: TaskRun):
        write_status("running", task=r.no, total=r.total, title=r.task.title, workdir=str(r.workdir), **r.conv_extra())

    update(run)
    work_on_task(agy, model, run, run.task.verifies, resume, update, isolated=True)
    if not run.ok:
        record(history, run, run.status)
        return stop_queue(run.reason, **run.conv_extra())
    err = merge_run(run, base_full)
    if err:
        record(history, run, "VERIFIED, NOT MERGED")
        return stop_queue(f"task {run.no}: merge failed: {err}; worktree kept: {run.workdir}", **run.conv_extra())
    finish_task(tasks_path, history, run, f"DONE (resumed in worktree{run.note})")
    remove_worktree(run.workdir, run.branch)
    err = run_merged_checks([run], resume[1])
    return stop_queue(f"task {run.no}: {err}") if err else True


def plan_segments(runs: list, resume: tuple | None) -> list[list]:
    """تسک‌های پیاپیِ هم‌گروه یک بخش می‌شوند؛ تسکِ ادامه‌یافته همیشه جدا اجرا می‌شود."""
    segments: list[list] = []
    for run in runs:
        prev = segments[-1] if segments else None
        if (run.task.group and prev and prev[0].task.group == run.task.group
                and not (resume and prev[0].no == 1)):
            prev.append(run)
        else:
            segments.append([run])
    return segments


def run_queue(tasks_path: Path, agy: str, model: str, resume: tuple | None = None,
              max_parallel: int = DEFAULT_MAX_PARALLEL, resume_worktree: Path | None = None) -> bool:
    global _queue_mode, RUN_ID
    _queue_mode = True
    RUN_ID = f"{datetime.now():%Y%m%d-%H%M%S}"
    open_run_log()
    log("=" * 70)
    log("Antigravity task runner (agy engine)")
    log(f"Project: {PROJECT_DIR}")
    log(f"Tasks:   {tasks_path}")
    log(f"agy:     {agy} (version {agy_version(agy)})")
    log("=" * 70)
    write_status("running", tasks=str(tasks_path))
    missing = missing_agent_tools()
    if missing:
        return stop_queue(f"not found on the agent PATH: {', '.join(missing)}")

    slugs = agy_models(agy)
    if slugs is not None and model not in slugs:
        return stop_queue(f"model {model} is not in `agy models`")
    log(f"Model: {model}")

    try:
        tasks = load_tasks(tasks_path)
    except Exception as e:
        return stop_queue(f"cannot read the tasks file: {e}")
    if not tasks:
        log("No pending tasks.")
        write_status("finished", done=0)
        return True
    for t in tasks:
        if t.model and slugs is not None and t.model not in slugs:
            return stop_queue(f"task model {t.model} is not in `agy models`: {t.title[:80]}")

    total = len(tasks)
    log(f"{total} pending task(s). Stall limit: {STALL_TIMEOUT_SECONDS // 60} min. Fix rounds: {MAX_FIX_ROUNDS}. "
        f"Max parallel: {max_parallel}.")
    history = history_path(tasks_path)
    runs = [TaskRun(no, total, t, PROJECT_DIR) for no, t in enumerate(tasks, start=1)]
    plan = []
    for seg in plan_segments(runs, resume):
        if len(seg) > 1:
            why = "--max-parallel is below 2" if max_parallel < 2 else group_blocker([r.task for r in seg])
            if why:
                log(f"NOTE: group '{seg[0].task.group}' runs sequentially: {why}.")
                plan += [[r] for r in seg]
                continue
            log(f"Group '{seg[0].task.group}': tasks {', '.join(str(r.no) for r in seg)} run in parallel worktrees "
                f"under {WORKTREE_ROOT / RUN_ID}.")
        plan.append(seg)

    for seg in plan:
        if len(seg) > 1:
            ok = run_group(agy, model, tasks_path, history, seg, max_parallel)
        elif resume and seg[0].no == 1 and resume_worktree:
            seg[0].workdir = resume_worktree
            ok = run_worktree_resume(agy, model, tasks_path, history, seg[0], resume)
        else:
            seg[0].started = time.time()
            ok = run_one_task(agy, model, tasks_path, history, seg[0], resume if seg[0].no == 1 else None)
        if not ok:
            return False
        if seg[-1].no < total:
            time.sleep(4)

    log("=" * 70)
    log(f"All {total} task(s) done. History: {history}")
    write_status("finished", done=total)
    return True


# ---------------------------------------------------------------- dialogue

def run_ask(args, agy: str) -> int:
    global _log_stream
    _log_stream = sys.stderr
    message = Path(args.message_file).read_text(encoding="utf-8").strip()
    if not message:
        log("The message file is empty.")
        return 2
    missing = missing_agent_tools()
    if missing:
        log(f"Not found on the agent PATH: {', '.join(missing)}.")
        return 2
    slugs = agy_models(agy)
    if slugs is not None and args.model not in slugs:
        log(f"Model {args.model} is not in `agy models`.")
        return 2

    before = git_snapshot()
    engine = AgyEngine(agy, args.model, PROJECT_DIR, "ask", args.conversation or "")
    try:
        res = agent_turn(engine, message, resume_message=ASK_RESUME_MESSAGE)
    finally:
        engine.close()
    changed = git_snapshot() != before
    finished = res.status == "SUCCESS"

    header = [f"CONVERSATION: {engine.conversation_id or '-'}",
              f"STATUS: {'finished' if finished else 'gave up: ' + res.status + ' ' + res.error[:200]}"]
    if changed:
        header.append("WARNING: the repository changed during this conversation (HEAD or git status differ).")
    output = "\n".join(header) + "\n\n" + res.response.strip() + "\n"
    sys.stdout.write(output)
    sys.stdout.flush()
    if args.out:
        Path(args.out).write_text(output, encoding="utf-8")
    return 0 if finished and not changed else 1


def cleanup_engines():
    for engine in list(_engines):
        try:
            if engine.alive():
                kill_tree(engine._proc.pid)
            engine.close()
        except Exception:
            pass


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Antigravity task runner on the agy CLI")
    parser.add_argument("--tasks", default=str(REPO_DIR / "tasks.md"), help="tasks file (default: tasks.md in the repo root)")
    parser.add_argument("--project", default=str(REPO_DIR), help="project directory: agent cwd, git and checks "
                                                                 "(default: the repo root)")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"model slug from `agy models` (default: {DEFAULT_MODEL})")
    parser.add_argument("--agy", help="path of the agy executable (default: AGY_EXE, PATH, %%LOCALAPPDATA%%\\agy\\bin)")
    parser.add_argument("--resume", metavar="CONVERSATION_ID",
                        help="continue the first pending task in this conversation (skips require; verifies directly "
                             "unless --nudge sends a message first)")
    parser.add_argument("--base", help="base commit of the resumed task (required with --resume)")
    parser.add_argument("--worktree", metavar="DIR",
                        help="with --resume: the task's worktree from a stopped parallel group; the task continues "
                             "there and is merged into the project afterwards")
    parser.add_argument("--max-parallel", type=int, default=DEFAULT_MAX_PARALLEL,
                        help=f"upper limit of agents running at once in a `parallel:` group "
                             f"(default: {DEFAULT_MAX_PARALLEL}; free RAM lowers it)")
    parser.add_argument("--worktree-root", help="folder for the parallel worktrees "
                                                "(default: warehouse-worktrees next to the project)")
    parser.add_argument("--nudge", nargs="?", const="", metavar="FILE",
                        help="with --resume: first send a continue message (default text, or FILE: a UTF-8 file)")
    sub = parser.add_subparsers(dest="command")
    ask = sub.add_parser("ask", help="send one message to an agy conversation and print the reply")
    target = ask.add_mutually_exclusive_group(required=True)
    target.add_argument("--new", action="store_true", help="start a new conversation")
    target.add_argument("--conversation", help="continue this conversation id")
    ask.add_argument("--message-file", required=True, help="UTF-8 file with the message")
    ask.add_argument("--model", default=DEFAULT_MODEL, help=f"model slug (default: {DEFAULT_MODEL})")
    ask.add_argument("--out", help="also write the reply to this file")
    args = parser.parse_args(argv)

    configure(Path(args.project).resolve(), Path(args.worktree_root).resolve() if args.worktree_root else None)
    agy = find_agy(args.agy)
    if not agy:
        print("agy executable not found; install Antigravity or pass --agy PATH.", file=sys.stderr)
        return 2

    if args.command == "ask":
        return run_ask(args, agy)
    if args.resume and not args.base:
        parser.error("--resume needs --base (the commit the task started from)")
    if args.nudge is not None and not args.resume:
        parser.error("--nudge works only with --resume")
    if args.worktree and not args.resume:
        parser.error("--worktree works only with --resume")
    if args.worktree and not Path(args.worktree).is_dir():
        parser.error(f"--worktree folder not found: {args.worktree}")
    nudge = ""
    if args.nudge is not None:
        nudge = no_question_marks(RESUME_MESSAGE)
        if args.nudge:
            nudge = no_question_marks(Path(args.nudge).read_text(encoding="utf-8").strip())
            if not nudge:
                parser.error(f"--nudge file is empty: {args.nudge}")
    resume = (args.resume, args.base, nudge) if args.resume else None
    worktree = Path(args.worktree).resolve() if args.worktree else None
    return 0 if run_queue(Path(args.tasks).resolve(), agy, args.model, resume, max(1, args.max_parallel),
                          worktree) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        cleanup_engines()
        log("\nInterrupted by user.")
        if _queue_mode:
            write_status("stopped", reason="interrupted by user")
        sys.exit(130)
    except Exception as err:
        cleanup_engines()
        log(f"\nUnexpected error: {err!r}")
        if _queue_mode:
            write_status("stopped", reason=f"unexpected error: {err!r}")
        sys.exit(1)
