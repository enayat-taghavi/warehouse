#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
سیستم اجرای سری و خودکار تسک‌ها در نشست‌های مستقل Antigravity
Warehouse Project - Automated Antigravity Task Runner
"""

import os
import sys
import time
import json
import uuid
import re
import sqlite3
import shutil
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
    print("❌ خطای ماژول‌های پایتون: لطفاً بسته‌های requests و psutil را نصب کنید:")
    print("   pip install requests psutil")
    sys.exit(1)

PROJECT_DIR = Path(__file__).resolve().parent
TASKS_FILE = PROJECT_DIR / "tasks.md"
HISTORY_FILE = PROJECT_DIR / "tasks_history.md"
GEMINI_DIR = Path(os.path.expanduser("~")) / ".gemini" / "antigravity-ide"
BRAIN_BASE_DIR = GEMINI_DIR / "brain"
CONVERSATIONS_DIR = GEMINI_DIR / "conversations"
STABILITY_SECONDS = 180  # ثانیه‌های سکوت برای اطمینان از پایان نوبت پردازشگر (۳ دقیقه، تا فکر طولانی مدل پایان شمرده نشود)

# مدل همه نشست‌ها: Gemini 3.8 Flash (High).
# شناسه داخلی آن (MODEL_PLACEHOLDER_M...) با به‌روزرسانی Antigravity ممکن است عوض شود؛
# پس در شروع اجرا از روی modelId پیدا می‌شود و FALLBACK_MODEL_ENUM فقط وقتی به کار می‌رود که فهرست مدل‌ها خوانده نشود.
MODEL_ID = "gemini-3.8-flash-high"
MODEL_LABEL = "Gemini 3.8 Flash (High)"
FALLBACK_MODEL_ENUM = "MODEL_PLACEHOLDER_M318"


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
                            url = f"http://127.0.0.1:{p}/exa.language_server_pb.LanguageServerService/GetCascadeModelConfigs"
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


def load_tasks(tasks_path: Path) -> list[str]:
    """خواندن و تفکیک تسک‌ها از فایل tasks.md با جداکننده ==="""
    if not tasks_path.exists():
        raise FileNotFoundError(f"فایل تسک‌ها در مسیر {tasks_path} یافت نشد.")

    content = tasks_path.read_text(encoding="utf-8")

    # تفکیک بخش‌ها با جداکننده سه مساوی یا بیشتر در یک خط مجزا
    raw_blocks = re.split(r"(?m)^\s*={3,}\s*$", content)
    clean_tasks = []

    for block in raw_blocks:
        text = block.strip()
        if not text:
            continue

        # حذف کامنت‌های HTML برای ارزیابی محتوای متنی
        text_content = re.sub(r"<!--[\s\S]*?-->", "", text).strip()
        if not text_content:
            continue

        # نادیده گرفتن بلوک‌هایی که صرفاً تیتر سربرگ هستند
        lines = [ln.strip() for ln in text_content.splitlines() if ln.strip()]
        if len(lines) == 1 and lines[0].startswith("# "):
            continue

        # بررسی علامت انجام یا غیرفعال در خط اول
        first_line = lines[0] if lines else ""
        if (
            first_line.startswith("[x]")
            or first_line.startswith("[DONE]")
            or first_line.startswith("[SKIP]")
            or text.startswith("<!-- DISABLED -->")
        ):
            print(f"⏩ تسک نادیده گرفته شد (انجام‌شده/غیرفعال): {first_line[:60]}...")
            continue

        clean_tasks.append(text_content)

    return clean_tasks


def resolve_model_enum(ls_info: dict) -> str | None:
    """
    یافتن شناسه داخلی مدل MODEL_ID در فهرست مدل‌های Antigravity (GetUserStatus).
    خروجی None یعنی فهرست خوانده شد ولی این مدل در آن نیست.
    """
    url = f"http://127.0.0.1:{ls_info['port']}/exa.language_server_pb.LanguageServerService/GetUserStatus"
    try:
        r = requests.post(
            url,
            headers={"x-codeium-csrf-token": ls_info["csrf_token"], "Content-Type": "application/json"},
            json={},
            timeout=5,
        )
        r.raise_for_status()
        configs = r.json().get("userStatus", {}).get("cascadeModelConfigData", {}).get("clientModelConfigs", [])
    except Exception as e:
        print(f"⚠️ فهرست مدل‌های Antigravity خوانده نشد ({e})؛ شناسه پشتیبان {FALLBACK_MODEL_ENUM} به کار می‌رود.")
        return FALLBACK_MODEL_ENUM

    for cfg in configs:
        if cfg.get("modelId") == MODEL_ID:
            return (cfg.get("modelOrAlias") or {}).get("model") or None
    return None


def start_cascade_conversation(ls_info: dict, task_text: str, model_enum: str) -> str:
    """
    آغاز نشست جدید مستقل در Antigravity و ارسال متن تسک از طریق API رسمی ConnectRPC
    """
    cascade_id = str(uuid.uuid4())
    headers = {
        "Content-Type": "application/json",
        "x-codeium-csrf-token": ls_info["csrf_token"],
    }
    base_url = f"http://127.0.0.1:{ls_info['port']}/exa.language_server_pb.LanguageServerService"

    # تبدیل مسیر پروژه به فرمت URI استاندارد
    proj_path_str = str(PROJECT_DIR).replace("\\", "/")
    workspace_uri = f"file:///{proj_path_str}" if not proj_path_str.startswith("/") else f"file://{proj_path_str}"

    # ۱. گام نخست: راه‌اندازی شجره نشست (StartCascade)
    start_payload = {
        "cascadeId": cascade_id,
        "source": "CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT",
        "workspaceUris": [workspace_uri],
        "requestedModel": model_enum,
    }

    r_start = requests.post(f"{base_url}/StartCascade", headers=headers, json=start_payload, timeout=8)
    if r_start.status_code != 200:
        raise RuntimeError(f"خطا در ایجاد نشست ({r_start.status_code}): {r_start.text}")

    # ۲. گام دوم: ارسال پرامپت دستور به همراه پیکربندی مجری (SendUserCascadeMessage)
    send_payload = {
        "cascadeId": cascade_id,
        "items": [{"text": task_text}],
        "cascadeConfig": {
            "plannerConfig": {
                "requestedModel": {"model": model_enum},
                "planModel": model_enum,
            }
        },
    }

    r_send = requests.post(f"{base_url}/SendUserCascadeMessage", headers=headers, json=send_payload, timeout=8)
    if r_send.status_code != 200:
        raise RuntimeError(f"خطا در ارسال دستور به نشست ({r_send.status_code}): {r_send.text}")

    return cascade_id


def monitor_conversation(conversation_id: str, timeout_seconds: int | None = None) -> tuple[bool, int, str]:
    """
    رهگیری و گزارش زنده پیشرفت تسک در نشست تا اتمام کامل آن
    بی‌سقف زمانی (پیش‌فرض): تا پایان واقعی نشست صبر می‌کند تا نشست بعدی هم‌زمان با آن روی کد کار نکند.
    خروجی: (موفقیت، تعداد گام‌ها، متن خلاصه نهایی)
    """
    transcript_file = BRAIN_BASE_DIR / conversation_id / ".system_generated" / "logs" / "transcript.jsonl"
    db_file = CONVERSATIONS_DIR / f"{conversation_id}.db"

    # انتظار برای ساخته شدن فایل ترانسکریپت یا پایگاه‌داده نشست
    wait_start = time.time()
    while not transcript_file.exists() and time.time() - wait_start < 25:
        time.sleep(0.5)

    seen_lines = 0
    last_mod_time = time.time()
    last_step_type = ""
    last_step_status = ""
    last_has_tools = False
    last_content = ""
    total_steps = 0
    start_monitor_time = time.time()

    print(f"👁️ در حال رهگیری زنده نشست (شناسه: {conversation_id})...")

    while timeout_seconds is None or time.time() - start_monitor_time < timeout_seconds:
        time.sleep(1.2)

        if transcript_file.exists():
            try:
                with open(transcript_file, "r", encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()
            except Exception:
                lines = []

            if len(lines) > seen_lines:
                last_mod_time = time.time()
                for line_idx in range(seen_lines, len(lines)):
                    raw_line = lines[line_idx].strip()
                    if not raw_line:
                        continue
                    try:
                        step = json.loads(raw_line)
                        step_idx = step.get("step_index", line_idx)
                        step_type = step.get("type", "")
                        step_status = step.get("status", "")
                        tool_calls = step.get("tool_calls") or []
                        content = step.get("content") or ""

                        last_step_type = step_type
                        last_step_status = step_status
                        last_has_tools = bool(tool_calls)
                        if content and step_type == "PLANNER_RESPONSE":
                            last_content = content
                        total_steps = max(total_steps, step_idx + 1)

                        # نمایش اعلان گام‌ها در ترمینال
                        if tool_calls:
                            tool_desc = []
                            for tc in tool_calls:
                                name = tc.get("name", "tool")
                                args = tc.get("args") or {}
                                summary = args.get("toolSummary") or args.get("toolAction") or name
                                tool_desc.append(str(summary).strip('"'))
                            print(f"   ⚙️ [گام {step_idx}] در حال اجرای: {', '.join(tool_desc)}")
                        elif step_type == "RUN_COMMAND" and step_status == "DONE":
                            print(f"   ✅ [گام {step_idx}] اجرای دستور در ترمینال پایان یافت.")
                        elif step_type == "VIEW_FILE" and step_status == "DONE":
                            print(f"   🔍 [گام {step_idx}] بررسی محتوای فایل.")
                        elif step_type in ("REPLACE_FILE_CONTENT", "WRITE_TO_FILE") and step_status == "DONE":
                            print(f"   ✏️ [گام {step_idx}] ویرایش فایل.")
                        elif step_type == "PLANNER_RESPONSE" and step_status == "DONE" and not tool_calls:
                            # نمایش پاسخ متنی ایجنت
                            preview_text = re.sub(r"<[^>]+>", "", content).strip()
                            clean_preview = preview_text.splitlines()[0] if preview_text else "پاسخ دریافت شد."
                            print(f"   💬 [پاسخ ایجنت]: {clean_preview[:100]}")

                    except Exception:
                        pass

                seen_lines = len(lines)

            # بررسی اتمام نوبت
            seconds_since_mod = time.time() - last_mod_time
            if (
                last_step_type in ("PLANNER_RESPONSE", "CHECKPOINT")
                and last_step_status == "DONE"
                and not last_has_tools
                and seconds_since_mod >= STABILITY_SECONDS
            ):
                print(f"🏁 نشست با موفقیت به کار خود پایان داد ({total_steps} گام).")
                return True, total_steps, last_content

        # اگر فایل ترانسکریپت هنوز نبود، بررسی پایگاه‌داده
        elif db_file.exists():
            try:
                conn = sqlite3.connect(f"file:{db_file}?mode=ro", uri=True)
                cur = conn.cursor()
                rows = cur.execute("SELECT idx, step_type, status FROM steps ORDER BY idx DESC LIMIT 1").fetchall()
                conn.close()
                if rows:
                    total_steps = rows[0][0] + 1
                    if rows[0][2] == 3 and (time.time() - last_mod_time >= STABILITY_SECONDS):
                        return True, total_steps, "تسک در پایگاه‌داده نشست پایان یافت."
            except Exception:
                pass

    return False, total_steps, "زمان مجاز اجرای نشست به پایان رسید (Timeout)."


def append_history(
    task_num: int,
    total_tasks: int,
    task_text: str,
    conv_id: str,
    success: bool,
    steps: int,
    elapsed_sec: int,
    summary: str,
):
    """ثبت خلاصه نشست در فایل تاریخچه tasks_history.md"""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    status_icon = "✅ موفق" if success else "❌ ناموفق / ناقص"
    minutes = elapsed_sec // 60
    seconds = elapsed_sec % 60
    duration_str = f"{minutes} دقیقه و {seconds} ثانیه" if minutes > 0 else f"{seconds} ثانیه"

    clean_summary = summary.strip().replace("\r\n", "\n")
    if len(clean_summary) > 700:
        clean_summary = clean_summary[:700] + "..."

    entry = f"""
### تسک {task_num} از {total_tasks} — {now_str}
- **وضعیت:** {status_icon}
- **شناسه نشست (Conversation ID):** `{conv_id}`
- **تعداد گام‌ها:** {steps} گام
- **مدت زمان اجرا:** {duration_str}
- **دستور تسک:**
```
{task_text}
```
- **خلاصه نتیجه نشست:**
{clean_summary}

---
"""
    try:
        if not HISTORY_FILE.exists():
            HISTORY_FILE.write_text("# تاریخچه اجرای تسک‌های خودکار Antigravity\n", encoding="utf-8")
        with open(HISTORY_FILE, "a", encoding="utf-8") as f:
            f.write(entry)
    except Exception as e:
        print(f"⚠️ خطا در ذخیره تاریخچه: {e}")


def run_tasks_sequence():
    """حلقه اصلی اجرای سری تسک‌ها"""
    print("=" * 70)
    print("🤖 شروع سیستم اجرای سری تسک‌های خودکار Antigravity")
    print(f"📂 ریشه پروژه: {PROJECT_DIR}")
    print(f"📄 فایل تسک‌ها: {TASKS_FILE}")
    print("=" * 70)

    # ۱. شناسایی خودکار سرویس فعال Antigravity
    print("🔍 در حال شناسایی سرور زبانی فعال Antigravity...")
    ls_info = discover_language_server()
    if not ls_info:
        print("❌ سرور زبانی فعال Antigravity یافت نشد!")
        print("💡 لطفاً ابتدا نرم‌افزار Antigravity IDE را باز کنید و سپس این اسکریپت را اجرا نمایید.")
        return

    print(f"🔧 اتصال برقرار شد: PID={ls_info['pid']} | Port={ls_info['port']}")

    # مدل نشست‌ها؛ اگر در فهرست Antigravity نبود، به‌جای اجرا با مدل دیگر متوقف می‌شویم
    model_enum = resolve_model_enum(ls_info)
    if not model_enum:
        print(f"❌ مدل {MODEL_LABEL} ({MODEL_ID}) در فهرست مدل‌های Antigravity یافت نشد؛ اجرا متوقف شد.")
        return
    print(f"🧠 مدل نشست‌ها: {MODEL_LABEL} ({model_enum}) | بدون سقف زمانی")

    # ۲. بارگذاری تسک‌ها
    try:
        tasks = load_tasks(TASKS_FILE)
    except Exception as e:
        print(f"❌ خطا در خواندن فایل تسک‌ها: {e}")
        return

    if not tasks:
        print("⚠️ هیچ تسک آماده‌ای در فایل tasks.md یافت نشد.")
        print("لطفاً تسک‌های مورد نظر را با جداکننده === در فایل tasks.md بنویسید.")
        return

    total_tasks = len(tasks)
    print(f"📋 تعداد {total_tasks} تسک در صف اجرا شناسایی شد.\n")

    # ۳. اجرای ترتیبی و مستقل تک‌تک تسک‌ها
    for idx, task_content in enumerate(tasks, start=1):
        task_preview = task_content.splitlines()[0] if task_content.splitlines() else "تسک"
        print("=" * 70)
        print(f"🚀 [تسک {idx}/{total_tasks}] شروع اجرای تسک:")
        print(f"   عنوان: {task_preview[:80]}")
        print("=" * 70)

        start_time = time.time()

        try:
            print("📤 در حال راه‌اندازی نشست اختصاصی در Antigravity...")
            conv_id = start_cascade_conversation(ls_info, task_content, model_enum)
            print(f"🆔 شناسه نشست ثبت شد: {conv_id}")
        except Exception as e:
            print(f"❌ خطا در ارسال دستور به Antigravity: {e}")
            append_history(idx, total_tasks, task_content, "error", False, 0, 0, str(e))
            continue

        # پایش آنلاین تا اتمام کامل تسک
        success, steps, final_summary = monitor_conversation(conv_id)
        elapsed = int(time.time() - start_time)
        minutes = elapsed // 60
        seconds = elapsed % 60
        duration_fmt = f"{minutes} دقیقه و {seconds} ثانیه" if minutes > 0 else f"{seconds} ثانیه"

        # چاپ نتیجه تسک
        print("-" * 70)
        if success:
            print(f"✅ [تسک {idx}/{total_tasks}] با موفقیت پایان یافت!")
        else:
            print(f"⚠️ [تسک {idx}/{total_tasks}] با خطا یا اتمام مهلت مواجه شد.")
        print(f"🆔 شناسه نشست: {conv_id}")
        print(f"⏱️ مدت زمان: {duration_fmt} | تعداد گام‌ها: {steps}")
        print("-" * 70)

        # ذخیره در تاریخچه
        append_history(idx, total_tasks, task_content, conv_id, success, steps, elapsed, final_summary)

        # وقفه کوتاه بین نشست‌ها برای ثبات حافظه
        if idx < total_tasks:
            print("⏳ ۴ ثانیه انتظار پیش از شروع تسک بعدی...")
            time.sleep(4)

    print("\n" + "=" * 70)
    print("🎉 تمام تسک‌های صف با موفقیت اجرا و ثبت شدند!")
    print(f"📑 گزارش کامل نشست‌ها در فایل {HISTORY_FILE.name} ذخیره شد.")
    print("=" * 70)


if __name__ == "__main__":
    try:
        run_tasks_sequence()
    except KeyboardInterrupt:
        print("\n\n🛑 اجرای تسک‌ها توسط کاربر متوقف شد.")
    except Exception as err:
        print(f"\n❌ خطای پیش‌بینی‌نشده: {err}")
