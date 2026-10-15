#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
اجراکننده عمومی و ترتیبی تسک‌ها در نشست‌های مستقل Antigravity
Generic sequential Antigravity task runner.

صف (پیش‌فرض):   python run_tasks.py [--tasks FILE] [--resume CONVERSATION_ID --base HASH [--nudge [FILE]]]
گفتگو:          python run_tasks.py ask (--new | --conversation ID) --message-file FILE [--model ID] [--out FILE]

تسک‌ها با خطی از === جدا می‌شوند. هر تسک می‌تواند دستورهای اجراکننده را در یک کامنت HTML داشته باشد
که هرگز برای ایجنت فرستاده نمی‌شود:

    <!-- runner
    require: <فرمان>   پیش از شروع نشست؛ اگر کد ۰ نداد، صف می‌ایستد
    verify: <فرمان>    پس از پایان نشست؛ همه باید کد ۰ بدهند تا تسک [DONE] شود
    -->

{base} در فرمان‌ها با hash کوتاه HEAD درست پیش از شروع تسک جای‌گذاری می‌شود.
اگر verify شکست خورد، خروجی‌اش در همان نشست برای ایجنت فرستاده می‌شود (حداکثر MAX_FIX_ROUNDS بار) و بعد صف می‌ایستد.
اگر خطای سرویس مدل یا راه‌اندازی دوباره سرور زبانی Antigravity نوبت ایجنت را برید، پیام ادامه در همان نشست فرستاده می‌شود.
برچسب [DONE] را فقط خود اجراکننده روی خط عنوان تسک می‌گذارد.
"""

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
import uuid
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

try:
    import psutil
    import requests
except ImportError:
    print("Missing Python packages. Install them with: pip install requests psutil")
    sys.exit(1)

PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_TASKS_FILE = PROJECT_DIR / "tasks.md"
GEMINI_DIR = Path(os.path.expanduser("~")) / ".gemini" / "antigravity-ide"
BRAIN_BASE_DIR = GEMINI_DIR / "brain"
CONVERSATIONS_DIR = GEMINI_DIR / "conversations"
LOG_DIR = PROJECT_DIR / "scratch" / "logs" / "runner"
STATUS_FILE = LOG_DIR / "status.json"

# پایان نوبت ایجنت: آخرین گام ایجنت پاسخ بی‌ابزار DONE و دارای متن باشد، هیچ گامی در پایگاه‌داده نشست در حال اجرا
# نباشد و این مقدار ثانیه گام تازه‌ای نیاید.
STABILITY_SECONDS = 20
CHAT_STABILITY_SECONDS = 60
# سکوتی که نشست را گیرکرده نشان می‌دهد. فرمان‌ها در پس‌زمینه اجرا می‌شوند و ایجنت وضعیتشان را مرتب می‌پرسد؛
# بیشترین سکوت ایجنت در گام‌های ۷ تا ۹ حدود ۹۰ ثانیه بود.
STALL_TIMEOUT_SECONDS = 20 * 60
# گام‌هایی که سیستم Antigravity می‌نویسد، نه ایجنت (فشرده‌سازی، پیام سیستم). گاهی پس از پاسخ نهایی هم می‌آیند،
# پس وضعیت «آخرین گام ایجنت» را عوض نمی‌کنند تا پایان نشست گم نشود.
SYSTEM_STEP_TYPES = {"CHECKPOINT", "SYSTEM_MESSAGE", "EPHEMERAL_MESSAGE"}
# وضعیت‌های پایانی گام در جدول steps پایگاه‌داده نشست؛ هر وضعیت دیگر یعنی گام (مثلاً فرمان پس‌زمینه) هنوز تمام نشده.
# در آزمون زنده ۱۴۰۵/۰۷/۲۱ دیده شد: ۲ = فرمان یا ویرایش در حال اجرا (فرمان پس‌زمینه ۶۰ ثانیه‌ای تا پایانش ۲ ماند)،
# ۸ = پاسخ ایجنت در حال تولید.
DB_FINISHED_STATUSES = (3, 6, 7)

# خطای سرویس مدل (مثلاً قطع اتصال به Google): Antigravity گاهی خودش دوباره تلاش می‌کند و گاهی با یک پاسخ خالی
# رها می‌کند (چت توافق ۱۴۰۵/۰۷/۲۱: سه خطا پشت هم و پاسخ نهایی ساخته نشد). اگر پس از این مقدار سکوت آخرین گام ایجنت
# خطا یا پاسخ خالی بود، نوبت با خطا تمام شده است و اجراکننده با RESUME_MESSAGE آن را در همان چت از سر می‌گیرد.
ERROR_QUIET_SECONDS = 90
RESUME_MESSAGE = ("[RUNNER] Your previous turn stopped because of a model service error, not because of your work. "
                  "Continue exactly where you stopped, finish the same task or answer, and end your turn.")

# راه‌اندازی دوباره سرور زبانی (نشست ۱۳ صف ارگونومی، ۱۴۰۵/۰۷/۲۱): سرور تازه چند ثانیه تا چند دقیقه بعد پاسخ‌گو می‌شود،
# نوبت ایجنت وسط کار (پس از یک گام ابزار) بریده می‌ماند و فرمان‌های پس‌زمینه متوقف می‌شوند و پایانشان هرگز نمی‌آید.
# Antigravity خودش ادامه نداد؛ اگر تا RESTART_QUIET_SECONDS پس از وصل شدن دوباره ایجنت گامی ننوشت، نوبت بریده است
# و اجراکننده با RESTART_RESUME_MESSAGE آن را در همان چت از سر می‌گیرد.
LS_RESTART_WAIT_SECONDS = 5 * 60
LS_RESTART_POLL_SECONDS = 5
RESTART_QUIET_SECONDS = 60
RESTART_RESUME_MESSAGE = (
    "[RUNNER] Antigravity restarted its language server and cut your previous turn, not because of your work. "
    "Your edits so far are still in the working tree, but background commands you started were stopped. "
    "Check git status, re-read the files you were editing, re-run any command whose result you still need, "
    "continue exactly where you stopped, finish the same task or answer, and end your turn.")
# سقف پیام‌های ادامه در یک تسک یا گفتگو (خطای سرویس و راه‌اندازی دوباره با هم).
MAX_RESUMES = 3

MAX_FIX_ROUNDS = 2
COMMAND_TIMEOUT_SECONDS = 30 * 60
FEEDBACK_TAIL_LINES = 40
FEEDBACK_MAX_CHARS = 6000

# مدل همه نشست‌ها: Gemini 3.8 Flash (High).
# شناسه داخلی آن (MODEL_PLACEHOLDER_M...) با به‌روزرسانی Antigravity ممکن است عوض شود؛
# پس در شروع اجرا از روی modelId پیدا می‌شود و FALLBACK_MODEL_ENUM فقط وقتی به کار می‌رود که فهرست مدل‌ها خوانده نشود.
MODEL_ID = "gemini-3.8-flash-high"
MODEL_LABEL = "Gemini 3.8 Flash (High)"
FALLBACK_MODEL_ENUM = "MODEL_PLACEHOLDER_M318"

# فرمان پس‌زمینه: Antigravity به ایجنت می‌گوید فرمان را راه بینداز و نوبت را ببند؛ پایان فرمان بعداً با
# SYSTEM_MESSAGE «Task id "…" finished» یا گام GENERIC «Task: … Status: …» می‌آید. تا آن موقع نوبت تمام نیست.
# (نشست ۵ صف ارگونومی همین‌جا ۱۲ دقیقه زودتر «پایان‌یافته» شمرده شد و نشست ۶ هم‌زمان با آن شروع شد.)
# فرمانی که ایجنت لغو می‌کند با GENERIC «Task "X" cancelled.» تمام می‌شود، نه با «finished»
# (نشست ۶ صف، ۱۴۰۵/۰۷/۲۱: vitest لغوشده صف را ۲۰ دقیقه نگه داشت و ایستاند).
BACKGROUND_START_RE = re.compile(r"running as a background task with task id:\s*(\S+)")
# تایمری که ایجنت برای بیدار شدن خودش می‌گذارد («Task Description: Timer: 20s, Prompt: …») فرمان در حال اجرا نیست؛
# پایانش فقط با SYSTEM_MESSAGE «sender=<task id>» می‌آید (نشست ۶ صف، ۱۴۰۵/۰۷/۲۱: سه تایمر زده‌شده صف را نگه داشتند).
BACKGROUND_TIMER_RE = re.compile(r"Task Description:\s*Timer\b", re.IGNORECASE)
BACKGROUND_FINISHED_RE = re.compile(
    r'Task (?:id )?"([^"]+)" (?:finished|completed|cancell?ed|killed|failed|terminated|stopped)', re.IGNORECASE)
BACKGROUND_STATUS_RE = re.compile(r"Task:\s*(\S+)\s+Status:\s*(\w+)")

LS_SERVICE = "exa.language_server_pb.LanguageServerService"
RUNNER_BLOCK_RE = re.compile(r"<!--\s*runner\b([\s\S]*?)-->", re.IGNORECASE)
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
DONE_PREFIXES = ("[x]", "[DONE]", "[SKIP]")

_log_stream = sys.stdout
_log_file = None
_queue_mode = False


def log(message: str = ""):
    _log_stream.write(message + "\n")
    _log_stream.flush()
    if _log_file:
        _log_file.write(f"{datetime.now():%H:%M:%S} {message}\n")
        _log_file.flush()


def write_status(state: str, **extra):
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    data = {"state": state, "updated": datetime.now().isoformat(timespec="seconds"), **extra}
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


def parse_directives(block: str) -> tuple[list, list]:
    requires, verifies = [], []
    for body in RUNNER_BLOCK_RE.findall(block):
        for raw in body.splitlines():
            key, sep, value = raw.strip().partition(":")
            if not sep or not value.strip():
                continue
            key = key.strip().lower()
            if key == "require":
                requires.append(value.strip())
            elif key == "verify":
                verifies.append(value.strip())
    return requires, verifies


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
        requires, verifies = parse_directives(block)
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
        tasks.append(Task(title=title, text=text, requires=requires, verifies=verifies))
    return tasks


def mark_task_done(tasks_path: Path, title: str) -> bool:
    """فقط خط عنوان همان تسک را با [DONE] پیشوند می‌دهد؛ بقیه فایل و پایان خط‌ها دست نمی‌خورد."""
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
                   steps: int, elapsed_sec: int, reply: str, checks: list):
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
        if not path.exists():
            path.write_text("# Antigravity task runner history\n", encoding="utf-8")
        with open(path, "a", encoding="utf-8") as f:
            f.write(entry)
    except Exception as e:
        log(f"WARNING: could not write history: {e}")


# ---------------------------------------------------------------- git and commands

def git(*args) -> str | None:
    try:
        r = subprocess.run(["git", *args], cwd=PROJECT_DIR, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=60)
    except Exception:
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def git_head() -> str:
    return git("rev-parse", "--short", "HEAD") or ""


def git_snapshot() -> tuple:
    return git("rev-parse", "HEAD"), git("status", "--porcelain")


def kill_tree(pid: int):
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
    else:
        try:
            os.kill(pid, 9)
        except OSError:
            pass


def run_command(cmd: str, log_path: Path) -> tuple[int, str]:
    """اجرای فرمان در ریشه پروژه با سقف زمانی؛ خروجی کامل در log_path می‌ماند."""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    timed_out = False
    with open(log_path, "wb") as out:
        out.write(f"$ {cmd}\n\n".encode("utf-8"))
        out.flush()
        proc = subprocess.Popen(cmd, shell=True, cwd=PROJECT_DIR, env=env, stdout=out, stderr=subprocess.STDOUT)
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


def run_checks(kind: str, commands: list, base: str, task_no: int, round_no: int) -> list[dict]:
    failures = []
    for n, template in enumerate(commands, 1):
        cmd = template.replace("{base}", base)
        log_path = LOG_DIR / f"task{task_no:02d}-r{round_no}-{kind}{n}.log"
        log(f"  {kind} {n}/{len(commands)}: {cmd}")
        started = time.time()
        rc, output = run_command(cmd, log_path)
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
    # قانون «?» در .agents/AGENTS.md پیام دارای علامت سؤال را پرسشی می‌کند؛ پیام اصلاحی نباید پرسشی خوانده شود.
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


# ---------------------------------------------------------------- Antigravity language server

def discover_language_server() -> dict | None:
    """
    شناسایی خودکار سرور زبانی فعال Antigravity (PID، توکن امنیتی CSRF و پورت ConnectRPC)
    """
    for proc in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            name = (proc.info["name"] or "").lower()
            if "language_server" in name:
                cmdline = " ".join(proc.info["cmdline"] or [])
                m = re.search(r"--csrf_token\s+([a-f0-9-]+)", cmdline)
                if m:
                    csrf = m.group(1)
                    ports = []
                    try:
                        for conn in proc.net_connections(kind="inet"):
                            if conn.status == "LISTEN" and conn.laddr.ip in ("127.0.0.1", "0.0.0.0"):
                                ports.append(conn.laddr.port)
                    except Exception:
                        pass

                    # بررسی پورت پاسخ‌گو به پروتکل ConnectRPC
                    for p in ports:
                        try:
                            url = f"http://127.0.0.1:{p}/{LS_SERVICE}/GetCascadeModelConfigs"
                            r = requests.post(
                                url,
                                headers={"x-codeium-csrf-token": csrf, "Content-Type": "application/json"},
                                json={},
                                timeout=1.5,
                            )
                            if r.status_code == 200:
                                return {
                                    "pid": proc.info["pid"],
                                    "csrf_token": csrf,
                                    "port": p,
                                }
                        except Exception:
                            continue
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return None


def wait_for_language_server(timeout: float) -> dict | None:
    """پس از ایستادن سرور زبانی، تا timeout ثانیه منتظر سرور تازه می‌ماند؛ None یعنی برنگشت."""
    deadline = time.time() + timeout
    while True:
        time.sleep(LS_RESTART_POLL_SECONDS)
        ls_info = discover_language_server()
        if ls_info or time.time() >= deadline:
            return ls_info


def ls_post(ls_info: dict, method: str, payload: dict, timeout: float = 8):
    return requests.post(
        f"http://127.0.0.1:{ls_info['port']}/{LS_SERVICE}/{method}",
        headers={"x-codeium-csrf-token": ls_info["csrf_token"], "Content-Type": "application/json"},
        json=payload,
        timeout=timeout,
    )


def resolve_model_enum(ls_info: dict, model_id: str) -> str | None:
    """
    یافتن شناسه داخلی مدل model_id در فهرست مدل‌های Antigravity (GetUserStatus).
    خروجی None یعنی فهرست خوانده شد ولی این مدل در آن نیست.
    """
    try:
        r = ls_post(ls_info, "GetUserStatus", {}, timeout=5)
        r.raise_for_status()
        configs = r.json().get("userStatus", {}).get("cascadeModelConfigData", {}).get("clientModelConfigs", [])
    except Exception as e:
        if model_id != MODEL_ID:
            log(f"Could not read Antigravity's model list ({e}).")
            return None
        log(f"Could not read Antigravity's model list ({e}); using fallback id {FALLBACK_MODEL_ENUM}.")
        return FALLBACK_MODEL_ENUM

    for cfg in configs:
        if cfg.get("modelId") == model_id:
            return (cfg.get("modelOrAlias") or {}).get("model") or None
    return None


def send_message(ls_info: dict, cascade_id: str, text: str, model_enum: str):
    payload = {
        "cascadeId": cascade_id,
        "items": [{"text": text}],
        "cascadeConfig": {
            "plannerConfig": {
                "requestedModel": {"model": model_enum},
                "planModel": model_enum,
                # از به‌روزرسانی ۲.۲۳.۱ (۱۵ اکتبر ۲۰۲۶) فرمان‌ها در ترمینال IDE در وضعیت RUNNING گیر می‌کنند؛
                # اجرای مستقیم با خود language server (Go) درست کار می‌کند.
                "toolConfig": {"runCommand": {"forceGoTerminalExecution": True,
                                              "enableIdeTerminalExecution": False}},
            }
        },
    }
    r = ls_post(ls_info, "SendUserCascadeMessage", payload)
    if r.status_code != 200:
        raise RuntimeError(f"SendUserCascadeMessage failed ({r.status_code}): {r.text[:300]}")


def start_conversation(ls_info: dict, text: str, model_enum: str) -> str:
    """آغاز نشست تازه و مستقل در Antigravity و فرستادن نخستین پیام از طریق ConnectRPC"""
    cascade_id = str(uuid.uuid4())
    proj_path_str = str(PROJECT_DIR).replace("\\", "/")
    workspace_uri = f"file:///{proj_path_str}" if not proj_path_str.startswith("/") else f"file://{proj_path_str}"
    r = ls_post(ls_info, "StartCascade", {
        "cascadeId": cascade_id,
        "source": "CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT",
        "workspaceUris": [workspace_uri],
        "requestedModel": model_enum,
    })
    if r.status_code != 200:
        raise RuntimeError(f"StartCascade failed ({r.status_code}): {r.text[:300]}")
    send_message(ls_info, cascade_id, text, model_enum)
    return cascade_id


# ---------------------------------------------------------------- conversation monitoring

def transcript_path(conv_id: str) -> Path:
    return BRAIN_BASE_DIR / conv_id / ".system_generated" / "logs" / "transcript.jsonl"


def db_path(conv_id: str) -> Path:
    return CONVERSATIONS_DIR / f"{conv_id}.db"


def read_steps(conv_id: str) -> list[dict]:
    try:
        text = transcript_path(conv_id).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    steps = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            step = json.loads(line)
        except ValueError:
            continue
        if isinstance(step.get("step_index"), int):
            steps.append(step)
    return steps


def db_query(conv_id: str, sql: str) -> list | None:
    path = db_path(conv_id)
    if not path.exists():
        return None
    try:
        con = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True, timeout=2)
        try:
            return con.execute(sql).fetchall()
        finally:
            con.close()
    except sqlite3.Error:
        return None


def unfinished_db_steps(conv_id: str) -> list | None:
    """گام‌هایی که در پایگاه‌داده نشست هنوز وضعیت پایانی ندارند (مثلاً فرمان پس‌زمینه)؛ None یعنی خوانده نشد."""
    statuses = ",".join(str(s) for s in DB_FINISHED_STATUSES)
    return db_query(conv_id, f"SELECT idx, step_type, status FROM steps WHERE status NOT IN ({statuses})")


def _protobuf_strings(data: bytes) -> list[str]:
    """همه رشته‌های UTF-8 درون یک پیام protobuf، بی‌نیاز به schema (پیام‌های تودرتو هم پیمایش می‌شوند)."""
    def varint(i):
        shift = value = 0
        while True:
            byte = data[i]
            i += 1
            value |= (byte & 0x7F) << shift
            shift += 7
            if byte < 0x80:
                return value, i

    found, stack = [], [(0, len(data))]
    while stack:
        i, end = stack.pop()
        try:
            while i < end:
                key, i = varint(i)
                wire = key & 7
                if wire == 0:
                    _, i = varint(i)
                elif wire == 1:
                    i += 8
                elif wire == 5:
                    i += 4
                elif wire == 2:
                    size, i = varint(i)
                    if i + size > end:
                        break
                    chunk = data[i:i + size]
                    try:
                        found.append(chunk.decode("utf-8"))
                    except UnicodeDecodeError:
                        pass
                    stack.append((i, i + size))
                    i += size
                else:
                    break
        except IndexError:
            continue
    return found


def full_step_text(conv_id: str, idx: int, partial: str) -> str:
    """ترانسکریپت متن بلند را از میان می‌بُرد («<truncated N bytes>»)؛ متن کامل از step_payload پایگاه‌داده خوانده می‌شود."""
    if "<truncated" not in partial:
        return partial
    rows = db_query(conv_id, f"SELECT step_payload FROM steps WHERE idx = {int(idx)}")
    head = partial.split("<truncated", 1)[0].strip()[:60]
    if not rows or not rows[0][0] or not head:
        return partial
    full = max((s for s in _protobuf_strings(rows[0][0]) if s.strip().startswith(head)), key=len, default="")
    return full if len(full) > len(head) and "<truncated" not in full else partial


def last_step_index(conv_id: str) -> int:
    idx = max((s["step_index"] for s in read_steps(conv_id)), default=-1)
    rows = db_query(conv_id, "SELECT MAX(idx) FROM steps")
    if rows and rows[0][0] is not None:
        idx = max(idx, rows[0][0])
    return idx


def report_step(idx: int, step_type: str, status: str, tool_calls: list, content: str):
    if tool_calls:
        names = []
        for tc in tool_calls:
            args = tc.get("args") or {}
            names.append(str(args.get("toolSummary") or args.get("toolAction") or tc.get("name", "tool")).strip('"'))
        log(f"  [#{idx}] running: {', '.join(names)}")
    elif step_type == "PLANNER_RESPONSE" and status == "DONE":
        text = re.sub(r"<[^>]+>", "", content).strip()
        log(f"  [#{idx}] agent: {(text.splitlines()[0] if text else '(empty reply)')[:120]}")
    elif step_type == "RUN_COMMAND" and status == "DONE":
        log(f"  [#{idx}] command finished")
    elif step_type == "VIEW_FILE" and status == "DONE":
        log(f"  [#{idx}] viewed a file")
    elif step_type in ("REPLACE_FILE_CONTENT", "WRITE_TO_FILE", "CODE_ACTION") and status == "DONE":
        log(f"  [#{idx}] edited a file")
    elif step_type == "ERROR_MESSAGE":
        log(f"  [#{idx}] error: {content.strip().splitlines()[-1][:120] if content.strip() else ''}")
    elif step_type == "CHECKPOINT":
        log(f"  [#{idx}] context compacted")


def monitor_conversation(ls_info: dict, conv_id: str, after_index: int = -1,
                         stability: int | None = None) -> tuple[bool, int, str, str, str]:
    """
    رهگیری زنده نشست تا پایان نوبت ایجنت. فقط گام‌هایی با step_index بزرگ‌تر از after_index شمرده می‌شوند،
    پس پس از پیام اصلاحی، پاسخ قبلی ایجنت پایان حساب نمی‌شود.
    خروجی: (پایان‌یافته، تعداد گام‌ها، آخرین پاسخ ایجنت، علت رها کردن، پیام ادامه)
    پایان‌نیافته یعنی رهگیری رها شد (خطای سرویس، راه‌اندازی دوباره یا از دست رفتن سرور زبانی، گیر کردن)
    و نشست شاید هنوز در حال اجراست. پیام ادامه ناتهی یعنی نوبت بریده شد و با فرستادن همین پیام در همان چت
    از سر گرفته می‌شود.
    پاسخ خالی پایان نوبت نیست؛ Antigravity پس از خطای سرویس پاسخ خالی می‌نویسد.
    """
    if stability is None:
        stability = STABILITY_SECONDS
    path = transcript_path(conv_id)
    ls_proc = None
    if ls_info and ls_info.get("pid"):
        try:
            ls_proc = psutil.Process(ls_info["pid"])
        except Exception:
            pass

    wait_start = time.time()
    while not path.exists() and time.time() - wait_start < 25:
        time.sleep(0.5)

    max_idx = after_index
    last_change = time.time()
    last_type, last_status, last_tools, last_text, last_reply, last_error = "", "", False, False, "", ""
    last_reply_idx = -1
    background = set()
    # max_idx هنگام وصل شدن به سرور زبانیِ دوباره راه‌افتاده؛ None یعنی راه‌اندازی دوباره‌ای نبوده
    # یا ایجنت پس از آن خودش گام تازه نوشته است.
    restart_idx, restart_background = None, False
    signature = None
    waiting_logged = False
    db_warning_logged = False

    log(f"Watching conversation {conv_id} (steps after #{after_index})...")

    while True:
        time.sleep(1.2)

        try:
            st = path.stat()
            new_signature = (st.st_size, st.st_mtime_ns)
        except OSError:
            new_signature = None

        if new_signature and new_signature != signature:
            signature = new_signature
            for step in read_steps(conv_id):
                idx = step["step_index"]
                if idx <= max_idx:
                    continue
                max_idx = idx
                last_change = time.time()
                waiting_logged = False
                step_type = step.get("type", "")
                step_status = step.get("status", "")
                tool_calls = step.get("tool_calls") or []
                content = step.get("content") or ""
                report_step(idx, step_type, step_status, tool_calls, content)
                if not BACKGROUND_TIMER_RE.search(content):
                    background.update(BACKGROUND_START_RE.findall(content))
                for task_id in BACKGROUND_FINISHED_RE.findall(content):
                    background.discard(task_id)
                    log(f"  [#{idx}] background command ended")
                for task_id, task_status in BACKGROUND_STATUS_RE.findall(content):
                    if task_status.upper() != "RUNNING":
                        background.discard(task_id)
                if step_type in SYSTEM_STEP_TYPES:
                    continue
                restart_idx = None
                last_type, last_status, last_tools = step_type, step_status, bool(tool_calls)
                last_text = bool(content.strip())
                if step_type == "PLANNER_RESPONSE" and content:
                    last_reply, last_reply_idx = content, idx
                if step_type == "ERROR_MESSAGE":
                    last_error = content.strip().splitlines()[-1][:200] if content.strip() else "unknown error"
                elif step_type == "PLANNER_RESPONSE" and (last_text or last_tools):
                    last_error = ""

        # پایش سلامت پروسه سرور زبانی (تشخیص ریستارت یا کرش)؛ پس از خواندن گام‌ها، تا گام‌های نوشته‌شده پیش از
        # ایستادن آن، کار ایجنت پس از راه‌اندازی دوباره شمرده نشوند.
        if ls_proc and not ls_proc.is_running():
            log(f"Language server PID={ls_info.get('pid')} stopped or restarted; "
                f"waiting up to {LS_RESTART_WAIT_SECONDS // 60} min for it to come back...")
            new_ls = wait_for_language_server(LS_RESTART_WAIT_SECONDS)
            if not new_ls:
                return False, max_idx + 1, last_reply, "the Antigravity language server stopped", ""
            log(f"Reconnected to language server PID={new_ls['pid']} port={new_ls['port']}.")
            ls_info.clear()
            ls_info.update(new_ls)
            try:
                ls_proc = psutil.Process(new_ls["pid"])
            except Exception:
                ls_proc = None
            restart_idx, restart_background = max_idx, bool(background)
            background.clear()
            last_change = time.time()
            waiting_logged = False
            continue

        quiet = time.time() - last_change
        replied = last_type == "PLANNER_RESPONSE" and last_status == "DONE" and not last_tools and last_text
        # نوبتی که با خطای سرویس یا پاسخ خالی تمام شد؛ Antigravity گاهی تا چند ثانیه بعد خودش دوباره تلاش می‌کند.
        dead = last_type == "ERROR_MESSAGE" or (
            last_type == "PLANNER_RESPONSE" and last_status == "DONE" and not last_tools and not last_text)
        # نوبتی که راه‌اندازی دوباره برید: پاسخ نهایی ندارد، یا پاسخش منتظر فرمان پس‌زمینه‌ای است که متوقف شد.
        if restart_idx is not None and (restart_background or not replied):
            if quiet >= RESTART_QUIET_SECONDS:
                reason = "the Antigravity language server restarted and cut the agent's turn"
                log(f"{reason}.")
                return False, max_idx + 1, last_reply, reason, RESTART_RESUME_MESSAGE
        elif (replied and quiet >= stability) or (dead and quiet >= ERROR_QUIET_SECONDS):
            unfinished = unfinished_db_steps(conv_id)
            if unfinished is None and not db_warning_logged:
                log("WARNING: conversation database not readable; database running-step check skipped.")
                db_warning_logged = True
            if not unfinished and not background:
                last_reply = full_step_text(conv_id, last_reply_idx, last_reply)
                if dead:
                    reason = f"agent turn ended with a model service error ({last_error or 'empty reply'})"
                    log(f"{reason}.")
                    return False, max_idx + 1, last_reply, reason, RESUME_MESSAGE
                log(f"Agent turn finished ({max_idx + 1} steps).")
                return True, max_idx + 1, last_reply, "", ""
            if not waiting_logged:
                log(f"Agent turn ended but {len(background)} background command(s) and "
                    f"{len(unfinished or [])} step(s) are still running; waiting...")
                waiting_logged = True

        if quiet >= STALL_TIMEOUT_SECONDS:
            return False, max_idx + 1, last_reply, f"no new step for {STALL_TIMEOUT_SECONDS // 60} minutes", ""


# ---------------------------------------------------------------- queue

def open_run_log():
    global _log_file
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    _log_file = open(LOG_DIR / f"run-{datetime.now():%Y%m%d-%H%M%S}.log", "a", encoding="utf-8")


def run_one_task(ls_info: dict, model_enum: str, tasks_path: Path, history: Path,
                 task_no: int, total: int, task: Task, resume: tuple | None = None) -> bool:
    """resume=(شناسه چت، hash پایه، پیام ادامه): تسکِ صفِ ایستاده در همان چت ادامه می‌یابد؛ require و ساخت چت
    رد می‌شوند. بی پیام ادامه، ترانسکریپت از آغاز بازخوانده می‌شود، پس اگر نوبت ایجنت تمام شده، مستقیم سراغ verify
    می‌رود. با پیام ادامه (نوبت بریده‌ای که اجراکننده هنگامش در کار نبود)، نخست همان پیام در چت فرستاده می‌شود."""
    log("=" * 70)
    log(f"[Task {task_no}/{total}] {task.title[:100]}")
    log("=" * 70)
    write_status("running", task=task_no, total=total, title=task.title)
    started = time.time()
    checks = []

    def record(status: str, conv_id: str, steps: int, reply: str):
        append_history(history, task_no, total, task, conv_id, status, steps,
                       int(time.time() - started), reply, checks)
    record.checks = checks

    if resume:
        conv_id, base, nudge = resume
        log(f"Resuming conversation {conv_id} with base commit {base}.")
        write_status("running", task=task_no, total=total, title=task.title, conversation=conv_id)
        return continue_task(ls_info, model_enum, tasks_path, task_no, task, conv_id, base, record, started, nudge)

    if task.requires:
        log(f"Running {len(task.requires)} require command(s)...")
        failures = run_checks("require", task.requires, git_head(), task_no, 0)
        checks.append(checks_summary("require", task.requires, failures))
        if failures:
            record("STOPPED (require failed)", "-", 0, "")
            return stop_queue(f"task {task_no}: require failed: {failures[0]['cmd']}")

    base = git_head()
    if base:
        log(f"Base commit: {base}")
    try:
        conv_id = start_conversation(ls_info, task.text, model_enum)
    except Exception as e:
        record("STOPPED (could not start conversation)", "-", 0, str(e))
        return stop_queue(f"task {task_no}: could not start a conversation: {e}")
    log(f"Conversation: {conv_id}")
    write_status("running", task=task_no, total=total, title=task.title, conversation=conv_id)

    return continue_task(ls_info, model_enum, tasks_path, task_no, task, conv_id, base, record, started)


def continue_task(ls_info: dict, model_enum: str, tasks_path: Path, task_no: int, task: Task,
                  conv_id: str, base: str, record, started: float, nudge: str = "") -> bool:
    """پایش نوبت ایجنت، از سرگیری نوبت بریده، verify، دورهای اصلاح و گذاشتن [DONE]."""
    checks = record.checks
    after_index, fix_round, resumes = -1, 0, 0
    if nudge:
        after_index = last_step_index(conv_id)
        log("Sending the continue message to the resumed conversation...")
        try:
            send_message(ls_info, conv_id, nudge, model_enum)
        except Exception as e:
            record("STOPPED (could not send continue message)", conv_id, 0, "")
            return stop_queue(f"task {task_no}: could not send the continue message: {e}", conversation=conv_id)
    while True:
        finished, steps, reply, reason, resume_message = monitor_conversation(ls_info, conv_id, after_index)
        if resume_message and resumes < MAX_RESUMES:
            resumes += 1
            after_index = last_step_index(conv_id)
            log(f"Asking the agent to continue ({reason}; {resumes}/{MAX_RESUMES})...")
            try:
                send_message(ls_info, conv_id, resume_message, model_enum)
            except Exception as e:
                record("STOPPED (could not send resume request)", conv_id, steps, reply)
                return stop_queue(f"task {task_no}: could not send the resume request: {e}", conversation=conv_id)
            continue
        if not finished:
            record(f"STOPPED ({reason})", conv_id, steps, reply)
            return stop_queue(f"task {task_no}: {reason}; the conversation may still be running in Antigravity",
                              conversation=conv_id)
        if not task.verifies:
            break

        log(f"Running {len(task.verifies)} verify command(s), round {fix_round}...")
        failures = run_checks("verify", task.verifies, base, task_no, fix_round)
        checks.append(checks_summary(f"verify round {fix_round}", task.verifies, failures))
        if not failures:
            break
        if fix_round >= MAX_FIX_ROUNDS:
            record("FAILED (verify still failing)", conv_id, steps, reply)
            return stop_queue(f"task {task_no}: verify still failing after {MAX_FIX_ROUNDS} fix round(s)",
                              conversation=conv_id)

        fix_round += 1
        after_index = last_step_index(conv_id)
        log(f"Sending {len(failures)} failure(s) back to the agent (fix round {fix_round}/{MAX_FIX_ROUNDS})...")
        try:
            send_message(ls_info, conv_id, feedback_message(failures, fix_round), model_enum)
        except Exception as e:
            record("STOPPED (could not send fix request)", conv_id, steps, reply)
            return stop_queue(f"task {task_no}: could not send the fix request: {e}", conversation=conv_id)

    if mark_task_done(tasks_path, task.title):
        log("Marked [DONE] in the tasks file.")
    else:
        log("WARNING: title line not found in the tasks file; [DONE] not written.")
    record("DONE", conv_id, steps, reply)
    log(f"[Task {task_no}] DONE in {int(time.time() - started) // 60} min.")
    return True


def run_queue(tasks_path: Path, resume: tuple | None = None):
    global _queue_mode
    _queue_mode = True
    open_run_log()
    log("=" * 70)
    log("Antigravity task runner")
    log(f"Project: {PROJECT_DIR}")
    log(f"Tasks:   {tasks_path}")
    log("=" * 70)
    write_status("running", tasks=str(tasks_path))

    ls_info = discover_language_server()
    if not ls_info:
        return stop_queue("Antigravity language server not found; open Antigravity and run again")
    log(f"Language server: PID={ls_info['pid']} port={ls_info['port']}")

    model_enum = resolve_model_enum(ls_info, MODEL_ID)
    if not model_enum:
        return stop_queue(f"model {MODEL_LABEL} ({MODEL_ID}) is not in Antigravity's model list")
    log(f"Model: {MODEL_LABEL} ({model_enum})")
    log(f"Turn end: agent reply, no running step, {STABILITY_SECONDS}s quiet. "
        f"Stall limit: {STALL_TIMEOUT_SECONDS // 60} min. Fix rounds: {MAX_FIX_ROUNDS}.")

    try:
        tasks = load_tasks(tasks_path)
    except Exception as e:
        return stop_queue(f"cannot read the tasks file: {e}")
    if not tasks:
        log("No pending tasks.")
        write_status("finished", done=0)
        return True

    total = len(tasks)
    log(f"{total} pending task(s).")
    history = history_path(tasks_path)
    for task_no, task in enumerate(tasks, start=1):
        if not run_one_task(ls_info, model_enum, tasks_path, history, task_no, total, task,
                            resume if task_no == 1 else None):
            return False
        if task_no < total:
            time.sleep(4)

    log("=" * 70)
    log(f"All {total} task(s) done. History: {history}")
    write_status("finished", done=total)
    return True


# ---------------------------------------------------------------- dialogue

def run_ask(args) -> int:
    global _log_stream
    _log_stream = sys.stderr
    message = Path(args.message_file).read_text(encoding="utf-8").strip()
    if not message:
        log("The message file is empty.")
        return 2

    ls_info = discover_language_server()
    if not ls_info:
        log("Antigravity language server not found; open Antigravity first.")
        return 2
    model_enum = resolve_model_enum(ls_info, args.model)
    if not model_enum:
        log(f"Model {args.model} is not in Antigravity's model list.")
        return 2

    before = git_snapshot()
    if args.new:
        conv_id = start_conversation(ls_info, message, model_enum)
        after_index = -1
    else:
        conv_id = args.conversation
        after_index = last_step_index(conv_id)
        send_message(ls_info, conv_id, message, model_enum)
    log(f"Conversation: {conv_id}")

    resumes = 0
    while True:
        finished, steps, reply, reason, resume_message = monitor_conversation(ls_info, conv_id, after_index,
                                                                              CHAT_STABILITY_SECONDS)
        if not resume_message or resumes >= MAX_RESUMES:
            break
        resumes += 1
        after_index = last_step_index(conv_id)
        log(f"Asking the agent to continue ({reason}; {resumes}/{MAX_RESUMES})...")
        send_message(ls_info, conv_id, resume_message, model_enum)
    changed = git_snapshot() != before

    header = [f"CONVERSATION: {conv_id}", f"STATUS: {'finished' if finished else 'gave up: ' + reason}"]
    if changed:
        header.append("WARNING: the repository changed during this conversation (HEAD or git status differ).")
    output = "\n".join(header) + "\n\n" + reply.strip() + "\n"
    sys.stdout.write(output)
    sys.stdout.flush()
    if args.out:
        Path(args.out).write_text(output, encoding="utf-8")
    return 0 if finished and not changed else 1


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Sequential Antigravity task runner")
    parser.add_argument("--tasks", default=str(DEFAULT_TASKS_FILE), help="tasks file (default: tasks.md)")
    parser.add_argument("--resume", metavar="CONVERSATION_ID",
                        help="continue the first pending task in this conversation (skips require; checks the turn, then verifies)")
    parser.add_argument("--base", help="base commit of the resumed task (required with --resume)")
    parser.add_argument("--nudge", nargs="?", const="", metavar="FILE",
                        help="with --resume: first send a continue message to the conversation, for a turn cut while "
                             "the runner was not watching (default: the language-server restart message; "
                             "FILE: a UTF-8 file with the message)")
    sub = parser.add_subparsers(dest="command")
    ask = sub.add_parser("ask", help="send one message to an Antigravity conversation and print the reply")
    target = ask.add_mutually_exclusive_group(required=True)
    target.add_argument("--new", action="store_true", help="start a new conversation")
    target.add_argument("--conversation", help="continue this conversation id")
    ask.add_argument("--message-file", required=True, help="UTF-8 file with the message")
    ask.add_argument("--model", default=MODEL_ID, help=f"Antigravity model id (default: {MODEL_ID})")
    ask.add_argument("--out", help="also write the reply to this file")
    args = parser.parse_args(argv)

    if args.command == "ask":
        return run_ask(args)
    if args.resume and not args.base:
        parser.error("--resume needs --base (the commit the task started from)")
    if args.nudge is not None and not args.resume:
        parser.error("--nudge works only with --resume")
    nudge = ""
    if args.nudge is not None:
        nudge = RESTART_RESUME_MESSAGE
        if args.nudge:
            nudge = no_question_marks(Path(args.nudge).read_text(encoding="utf-8").strip())
            if not nudge:
                parser.error(f"--nudge file is empty: {args.nudge}")
    resume = (args.resume, args.base, nudge) if args.resume else None
    return 0 if run_queue(Path(args.tasks).resolve(), resume) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        log("\nInterrupted by user.")
        if _queue_mode:
            write_status("stopped", reason="interrupted by user")
        sys.exit(130)
    except Exception as err:
        log(f"\nUnexpected error: {err!r}")
        if _queue_mode:
            write_status("stopped", reason=f"unexpected error: {err!r}")
        sys.exit(1)
