#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
اجراکننده تسک‌ها در نشست‌های مستقل Antigravity از راه CLI رسمی (`agy`، حالت بدون رابط stream-json)
Task runner on top of the Antigravity CLI (`agy`, headless stream-json mode). Plan:
Documents/Antigravity_Parallel_Runner/implementation_plan_antigravity_parallel_runner.md

صف (پیش‌فرض):   python scripts/automation/run_tasks_agy.py [--tasks FILE] [--project DIR] [--model SLUG] [--agy PATH]
                              [--resume CONVERSATION_ID --base HASH [--nudge [FILE]]]
گفتگو:          python scripts/automation/run_tasks_agy.py ask (--new | --conversation ID) --message-file FILE
                              [--model SLUG] [--out FILE]

قالب tasks.md همان run_tasks.py است: تسک‌ها با خطی از === جدا می‌شوند و هر تسک می‌تواند دستورها را در یک
کامنت HTML داشته باشد که هرگز برای ایجنت فرستاده نمی‌شود:

    <!-- runner
    require: <فرمان>        پیش از شروع نشست؛ اگر کد ۰ نداد، صف می‌ایستد
    verify: <فرمان>         پس از پایان نشست؛ همه باید کد ۰ بدهند تا تسک [DONE] شود
    verify-merged: <فرمان>  مثل verify (در اجرای ترتیبی بلافاصله پس از verify؛ در گروه موازی پس از ادغام)
    model: <slug>           مدل همین تسک (پیش‌فرض --model؛ فهرست: agy models)
    parallel: <گروه>        اجرای هم‌زمان تسک‌های پیاپیِ هم‌گروه (هنوز پیاده‌سازی نشده؛ فعلاً ترتیبی)
    -->

{base} با hash کوتاه HEAD درست پیش از شروع تسک و {root} با مسیر پروژه جای‌گذاری می‌شود.
اگر verify شکست بخورد، خروجی‌اش در همان نشست برای ایجنت فرستاده می‌شود (حداکثر MAX_FIX_ROUNDS بار) و بعد صف می‌ایستد.
اگر نوبت ایجنت با خطای سرویس، قطع فرایند یا بی‌حرکتی بریده شود، با `--conversation` ادامه داده می‌شود (حداکثر MAX_RESUMES).
برچسب [DONE] را فقط خود اجراکننده روی خط عنوان تسک می‌گذارد.
"""

import argparse
import json
import os
import queue
import re
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

RESUME_MESSAGE = ("[RUNNER] Your previous turn ended because of a service error or a lost process, not because of "
                  "your work. Run `git status` to see what is already done, finish the task, commit, and end your turn.")

RUNNER_BLOCK_RE = re.compile(r"<!--\s*runner\b([\s\S]*?)-->", re.IGNORECASE)
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
DONE_PREFIXES = ("[x]", "[DONE]", "[SKIP]")

_io_lock = threading.RLock()
_log_stream = sys.stdout
_log_file = None
_queue_mode = False
_engines: list = []


def configure(project_dir: Path):
    global PROJECT_DIR, LOG_DIR, STATUS_FILE
    PROJECT_DIR = project_dir
    LOG_DIR = project_dir / "scratch" / "logs" / "runner"
    STATUS_FILE = LOG_DIR / "status.json"


def log(message: str = ""):
    with _io_lock:
        _log_stream.write(message + "\n")
        _log_stream.flush()
        if _log_file:
            _log_file.write(f"{datetime.now():%H:%M:%S} {message}\n")
            _log_file.flush()


def open_run_log():
    global _log_file
    LOG_DIR.mkdir(parents=True, exist_ok=True)
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


def mark_task_done(tasks_path: Path, title: str) -> bool:
    """فقط خط عنوان همان تسک را با [DONE] پیشوند می‌دهد؛ بقیه فایل و پایان خط‌ها دست نمی‌خورد."""
    with _io_lock:
        lines = tasks_path.read_bytes().decode("utf-8").splitlines(keepends=True)
        for i, line in enumerate(lines):
            body = line.rstrip("\r\n")
            if body.strip() == title:
                indent = body[: len(body) - len(body.lstrip())]
                lines[i] = f"{indent}[DONE] {body.strip()}{line[len(body):]}"
                tasks_path.write_bytes("".join(lines).encode("utf-8"))
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
    output = log_path.read_bytes().decode("utf-8", errors="replace")
    if timed_out:
        output += f"\n[runner] command killed after {COMMAND_TIMEOUT_SECONDS // 60} minutes\n"
    return rc, output


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
                                      stderr=err, text=True, encoding="utf-8", errors="replace", bufsize=1)
        err.close()
        _engines.append(self)
        q, proc = self._queue, self._proc

        def reader():
            for line in proc.stdout:
                q.put(line)
            q.put(None)
        threading.Thread(target=reader, daemon=True).start()
        log(f"  [{self.tag}] agy started (pid {proc.pid}, model {self.model}"
            f"{', conversation ' + self.conversation_id if self.conversation_id else ''})")

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
            log(f"  [{self.tag}] step {idx}: {short_params(info['name'], info.get('parameters'))}{failed}")

    def _on_result(self, r: dict, started: float) -> TurnResult:
        if r.get("conversation_id"):
            self.conversation_id = r["conversation_id"]
        total = int((r.get("usage") or {}).get("total_tokens") or 0)
        self.tokens_total += total - self._prev_tokens if total >= self._prev_tokens else total
        self._prev_tokens = total
        res = TurnResult(r.get("status") or "UNKNOWN", r.get("response") or "", r.get("error") or "")
        log(f"  [{self.tag}] turn {res.status} in {int(time.time() - started)}s "
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

def run_one_task(agy: str, model: str, tasks_path: Path, history: Path, task_no: int, total: int,
                 task: Task, resume: tuple | None = None) -> bool:
    """resume=(شناسه چت، hash پایه، پیام ادامه): تسکِ صفِ ایستاده در همان چت ادامه می‌یابد؛ require رد می‌شود.
    بی پیام ادامه، فرض بر این است که نوبت ایجنت تمام شده و مستقیم verify اجرا می‌شود."""
    log("=" * 70)
    log(f"[Task {task_no}/{total}] {task.title[:100]}")
    log("=" * 70)
    write_status("running", task=task_no, total=total, title=task.title)
    started = time.time()
    checks: list = []
    workdir = PROJECT_DIR
    engine = AgyEngine(agy, task.model or model, workdir, f"task{task_no:02d}", resume[0] if resume else "")
    state = {"reply": ""}

    def record(status: str):
        append_history(history, task_no, total, task, engine.conversation_id or "-", status, engine.steps_total,
                       engine.tokens_total, int(time.time() - started), state["reply"], checks)

    def conv_extra() -> dict:
        return {"conversation": engine.conversation_id} if engine.conversation_id else {}

    try:
        if resume:
            _, base, nudge = resume
            log(f"Resuming conversation {engine.conversation_id} with base commit {base}.")
            first = nudge
        else:
            if task.requires:
                log(f"Running {len(task.requires)} require command(s)...")
                failures = run_checks("require", task.requires, git_head(workdir), task_no, 0, workdir)
                checks.append(checks_summary("require", task.requires, failures))
                if failures:
                    record("STOPPED (require failed)")
                    return stop_queue(f"task {task_no}: require failed: {failures[0]['cmd']}")
            base = git_head(workdir)
            first = task.text
        if base:
            log(f"Base commit: {base}")

        verifies = task.verifies + task.merged
        gates = {"count": 0, "passed": False}

        def gate() -> bool:
            if not verifies:
                return False
            gates["count"] += 1
            log("The agent turn did not end cleanly; running verify to see whether the work is already complete...")
            failures = run_checks("verify", verifies, base, task_no, f"g{gates['count']}", workdir)
            checks.append(checks_summary(f"verify gate {gates['count']}", verifies, failures))
            gates["passed"] = not failures
            return gates["passed"]

        res = agent_turn(engine, first, gate) if first else TurnResult("SUCCESS")
        write_status("running", task=task_no, total=total, title=task.title, **conv_extra())
        fix_round = 0
        while True:
            state["reply"] = res.response or state["reply"]
            if res.status != "SUCCESS":
                record(f"STOPPED ({res.status})")
                return stop_queue(f"task {task_no}: agent turn ended with {res.status}: {res.error[:200]}; "
                                  f"conversation {engine.conversation_id or '-'}", **conv_extra())
            if not verifies:
                break
            if gates["passed"]:
                gates["passed"] = False
                state["note"] = f" ({res.error})" if res.error else ""
                break
            log(f"Running {len(verifies)} verify command(s), round {fix_round}...")
            failures = run_checks("verify", verifies, base, task_no, fix_round, workdir)
            checks.append(checks_summary(f"verify round {fix_round}", verifies, failures))
            if not failures:
                break
            if fix_round >= MAX_FIX_ROUNDS:
                record("FAILED (verify still failing)")
                return stop_queue(f"task {task_no}: verify still failing after {MAX_FIX_ROUNDS} fix round(s)",
                                  **conv_extra())
            fix_round += 1
            log(f"Sending {len(failures)} failure(s) back to the agent (fix round {fix_round}/{MAX_FIX_ROUNDS})...")
            res = agent_turn(engine, feedback_message(failures, fix_round), gate)
    finally:
        engine.close()

    if mark_task_done(tasks_path, task.title):
        log("Marked [DONE] in the tasks file.")
    else:
        log("WARNING: title line not found in the tasks file; [DONE] not written.")
    record("DONE" + state.get("note", ""))
    log(f"[Task {task_no}] DONE in {int(time.time() - started) // 60} min.")
    return True


def run_queue(tasks_path: Path, agy: str, model: str, resume: tuple | None = None) -> bool:
    global _queue_mode
    _queue_mode = True
    open_run_log()
    log("=" * 70)
    log("Antigravity task runner (agy engine)")
    log(f"Project: {PROJECT_DIR}")
    log(f"Tasks:   {tasks_path}")
    log(f"agy:     {agy} (version {agy_version(agy)})")
    log("=" * 70)
    write_status("running", tasks=str(tasks_path))

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
    if any(t.group for t in tasks):
        log("NOTE: `parallel:` groups are not implemented yet; every task runs sequentially.")
    for t in tasks:
        if t.model and slugs is not None and t.model not in slugs:
            return stop_queue(f"task model {t.model} is not in `agy models`: {t.title[:80]}")

    total = len(tasks)
    log(f"{total} pending task(s). Stall limit: {STALL_TIMEOUT_SECONDS // 60} min. Fix rounds: {MAX_FIX_ROUNDS}.")
    history = history_path(tasks_path)
    for task_no, task in enumerate(tasks, start=1):
        if not run_one_task(agy, model, tasks_path, history, task_no, total, task,
                            resume if task_no == 1 else None):
            return False
        if task_no < total:
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

    configure(Path(args.project).resolve())
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
    nudge = ""
    if args.nudge is not None:
        nudge = no_question_marks(RESUME_MESSAGE)
        if args.nudge:
            nudge = no_question_marks(Path(args.nudge).read_text(encoding="utf-8").strip())
            if not nudge:
                parser.error(f"--nudge file is empty: {args.nudge}")
    resume = (args.resume, args.base, nudge) if args.resume else None
    return 0 if run_queue(Path(args.tasks).resolve(), agy, args.model, resume) else 1


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
