"""
نگهبان هوک‌های مشترک (Claude Code و Antigravity) برای این مخزن.

پشتیبانی هم‌زمان از:
  - Claude Code (.claude/settings.json): رویدادهای Bash، Write، Edit؛ و روی هر PostToolUse
    نگهبان اندازهٔ context (check_context)
  - Antigravity (.agents/hooks.json): رویدادهای run_command، write_to_file، replace_file_content

قالب خروجی هر ابزار جداست:
  - Claude Code فقط JSON معتبر طرح خودش را می‌پذیرد (hookSpecificOutput) و در هر
    اجرا حداکثر یک JSON؛ «اجازه» یعنی بدون خروجی. مقدارهای decision=allow/deny در
    طرح Claude Code نامعتبرند و باعث نادیده‌گرفتن کل خروجی می‌شدند.
  - Antigravity همان قالب قبلی ({"decision": "allow" | "deny", ...}) را می‌گیرد.
"""
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PERSIAN = re.compile(r'[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]')
GREP_COMMAND = re.compile(r'(?:^|[\s;|&(])(?:grep|egrep|fgrep|rg|findstr)(?:\s|$)')
MIGRATE_COMMAND = re.compile(
    r'(?:^|[\s;|&(])(?:"?[.\w\\/:-]*manage\.py"?|django-admin(?:\.py)?)\s+(?:--[\w-]+=?[^\s]*\s+)*migrate\b'
)
# تفسیر دستی وضعیت HTTP؛ جای آن باید isServerUnreachable() باشد.
STATUS_CHECK = re.compile(r'status\s*(?:===?|!==?|>=?|<=?)\s*(?:0|5\d\d)\b')

# قاعده‌های ظاهری قالب‌های فرانت (فقط هشدار)
IMG_TAG = re.compile(r'<img\b(?:[^>"\']|"[^"]*"|\'[^\']*\')*>', re.S)
IMG_ALT = re.compile(r'[\s\[](?:attr\.)?alt\]?\s*=')
STYLE_ATTR = re.compile(r'\sstyle\s*=\s*(["\'])(.*?)\1', re.S)
HARDCODED_COLOR = re.compile(
    r'(?:^|;)\s*(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?'
    r'|outline(?:-color)?|fill|stroke)\s*:[^;]*?(?:#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()',
    re.I,
)
CLASS_ATTR = re.compile(r'\sclass\s*=\s*"([^"]*)"')
OUTLINE_NONE = re.compile(r'(?:^|\s)(?:[\w-]+:)*outline-none(?=\s|$)')
FOCUS_REPLACEMENT = re.compile(
    r'(?:^|\s)(?:[\w-]+:)*(?:focus|focus-visible|focus-within):(?:ring|outline(?!-none)|border|shadow|bg|underline|text|decoration)'
)

# نگهبان اندازهٔ context (فقط Claude Code): هشدار برای تحویل کار به جلسهٔ تازه
CONTEXT_WARN_FIRST = 200_000
CONTEXT_WARN_STEP = 100_000
TRANSCRIPT_TAIL_BYTES = 2 * 1024 * 1024
CONTEXT_STATE_DIR = ROOT / '.claude' / 'tmp' / 'context-watch'

CONTRACT = 'claude'   # 'claude' یا 'antigravity'؛ در main تعیین می‌شود
WARNINGS = []


def deny(reason):
    if CONTRACT == 'antigravity':
        payload = {
            'decision': 'deny',
            'reason': reason,
            'hookSpecificOutput': {
                'hookEventName': 'PreToolUse',
                'permissionDecision': 'deny',
                'permissionDecisionReason': reason,
            }
        }
    else:
        payload = {
            'hookSpecificOutput': {
                'hookEventName': 'PreToolUse',
                'permissionDecision': 'deny',
                'permissionDecisionReason': reason,
            }
        }
    print(json.dumps(payload, ensure_ascii=True))
    sys.exit(0)


def allow():
    # Claude Code: نبودِ خروجی یعنی اجازه.
    if CONTRACT == 'antigravity':
        print(json.dumps({
            'decision': 'allow'
        }, ensure_ascii=True))


def warn(context):
    if CONTRACT == 'antigravity':
        print(json.dumps({
            'hookSpecificOutput': {
                'hookEventName': 'PostToolUse',
                'additionalContext': context,
            }
        }, ensure_ascii=True))
    else:
        WARNINGS.append(context)


def flush_warnings():
    """Claude Code: همهٔ هشدارها در یک JSON (دو JSON پشت‌سرهم نامعتبر است)."""
    if WARNINGS:
        print(json.dumps({
            'hookSpecificOutput': {
                'hookEventName': 'PostToolUse',
                'additionalContext': '\n'.join(WARNINGS),
            }
        }, ensure_ascii=True))


def check_new_root_file(file_path):
    if not file_path:
        return
    path = Path(file_path)
    if not path.is_absolute():
        path = ROOT / path
    path = path.resolve()
    if path.parent == ROOT and not path.exists() and path.name != '.gitattributes':
        deny(
            f'ساختن فایل تازه در ریشهٔ مخزن ممنوع است ({path.name}). '
            'طبق استانداردهای مخزن، آن را در scripts/، docs/، config/ یا scratch/ بساز.'
        )


def check_persian_grep(command):
    if not command:
        return
    if GREP_COMMAND.search(command) and PERSIAN.search(command):
        deny(
            'جستجوی متن فارسی با grep در Bash ممنوع است: Git Bash ویندوز UTF-8 را '
            'مخدوش می‌کند و نتیجهٔ غلط می‌دهد. از ابزار Grep استفاده کن.'
        )


def check_migrate_backup(command):
    if not command:
        return
    if not MIGRATE_COMMAND.search(command):
        return
    if '--plan' in command or '--help' in command or '-h' in command:
        return

    override_dir = os.environ.get('TEST_GUARD_BACKUP_DIR')
    backup_dir = Path(override_dir) if override_dir else (ROOT / 'warehouse-backend' / 'backups' / 'db')
    max_age_seconds = 15 * 60  # ۱۵ دقیقه
    now = time.time()
    has_fresh_backup = False

    if backup_dir.is_dir():
        for f in backup_dir.iterdir():
            if f.is_file() and f.name.endswith('.dump') and f.stat().st_size > 0:
                meta = backup_dir / f"{f.name}.meta.json"
                if not meta.is_file():
                    meta = backup_dir / f"{f.stem}.meta.json"
                if meta.is_file():
                    age = now - f.stat().st_mtime
                    if 0 <= age <= max_age_seconds:
                        has_fresh_backup = True
                        break

    if not has_fresh_backup:
        deny(
            'اجرای manage.py migrate روی دیتابیس عملیاتی بدون پشتیبان تازه ممنوع است.\n'
            'طبق اسکیل safe-migration، باید یک فایل .dump غیرخالی با .meta.json در '
            'warehouse-backend/backups/db/ با عمر کمتر از ۱۵ دقیقه وجود داشته باشد.\n'
            'دستور ساخت پشتیبان:\n'
            'PYTHONUTF8=1 ./venv/Scripts/python.exe manage.py shell -c '
            '"from accounts.backup_service import create_database_backup; '
            'm = create_database_backup(user=None, description=\'pre-migrate\'); print(m[\'filename\'], m[\'size\'])"'
        )


def check_status_checks(file_path, text):
    if not file_path:
        return
    path = file_path.replace('\\', '/')
    if (
        '/warehouse-front/src/' not in path
        or not path.endswith('.ts')
        or path.endswith('.spec.ts')
        or path.endswith('/server-reachability.ts')
    ):
        return
    text = text or ''
    hits = sorted({m.group(0) for m in STATUS_CHECK.finditer(text)})
    if hits:
        warn(
            f'هشدار: در {path.rsplit("/", 1)[-1]} شرط دستی وضعیت HTTP نوشته شد: {", ".join(hits)}. '
            'اگر این شرط «در دسترس نبودن سرور» را تشخیص می‌دهد، باید '
            'isServerUnreachable() از core/services/server-reachability.ts به کار رود. '
            'اگر قبلاً قطعی سرور جدا شده (مثل error.interceptor.ts) این هشدار را نادیده بگیر.'
        )


def check_ui_template(file_path, text):
    """قاعده‌های دسترس‌پذیری و توکن رنگ برای متن تازهٔ قالب‌های فرانت (فقط هشدار)."""
    if not file_path:
        return
    path = file_path.replace('\\', '/')
    if (
        '/warehouse-front/src/' not in path
        or not (path.endswith('.html') or path.endswith('.ts'))
        or path.endswith('.spec.ts')
        or path.endswith('/icon-registry.ts')
    ):
        return
    text = text or ''
    name = path.rsplit('/', 1)[-1]
    no_alt = [m.group(0) for m in IMG_TAG.finditer(text) if not IMG_ALT.search(m.group(0))]
    if no_alt:
        warn(
            f'هشدار دسترس‌پذیری: در {name} تگ <img> بدون alt نوشته شد ({len(no_alt)} مورد). '
            'برای تصویر معنادار alt توصیفی فارسی و برای تصویر تزئینی alt="" بگذار (WCAG 1.1.1).'
        )
    colored = [m.group(2).strip() for m in STYLE_ATTR.finditer(text) if HARDCODED_COLOR.search(m.group(2))]
    if colored:
        warn(
            f'هشدار رنگ: در {name} رنگ ثابت داخل style نوشته شد: {" | ".join(colored[:3])}. '
            'به‌جای آن کلاس Tailwind یا توکن معنایی (bg-surface / text-fg / border-line) به کار ببر.'
        )
    no_focus = [c for c in CLASS_ATTR.findall(text) if OUTLINE_NONE.search(c) and not FOCUS_REPLACEMENT.search(c)]
    if no_focus:
        warn(
            f'هشدار دسترس‌پذیری: در {name} کلاس outline-none بدون نشانگر جایگزین فوکوس آمده '
            f'({len(no_focus)} مورد). برای کاربر صفحه‌کلید یک نشانگر مثل focus-visible:ring-2 بگذار (WCAG 2.4.7).'
        )


def last_context_tokens(transcript_path):
    """اندازهٔ context آخرین پاسخ assistant جلسهٔ اصلی، از انتهای transcript."""
    with open(transcript_path, 'rb') as f:
        f.seek(0, 2)
        f.seek(max(0, f.tell() - TRANSCRIPT_TAIL_BYTES))
        tail = f.read()
    for line in reversed(tail.splitlines()):
        if b'"usage"' not in line or b'"assistant"' not in line:
            continue
        try:
            entry = json.loads(line)
        except ValueError:
            continue  # خط اول ممکن است با seek بریده شده باشد
        if entry.get('type') != 'assistant' or entry.get('isSidechain'):
            continue
        usage = (entry.get('message') or {}).get('usage') or {}
        total = sum(usage.get(k) or 0 for k in (
            'input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'))
        if total:  # پیام‌های synthetic مصرف صفر دارند
            return total
    return 0


def check_context(event):
    """با گذشتن context از ۲۰۰ هزار و سپس هر ۱۰۰ هزار بیشتر، یک‌بار هشدار تحویل بده."""
    if event.get('agent_id'):
        return  # ساب‌ایجنت؛ تحویل فقط کار جلسهٔ اصلی است
    transcript = event.get('transcript_path')
    session = re.sub(r'[^\w-]', '', str(event.get('session_id') or ''))
    if not transcript or not session:
        return
    ctx = last_context_tokens(transcript)
    level = 0 if ctx < CONTEXT_WARN_FIRST else 1 + (ctx - CONTEXT_WARN_FIRST) // CONTEXT_WARN_STEP
    state = CONTEXT_STATE_DIR / session
    try:
        warned = int(state.read_text())
    except (OSError, ValueError):
        warned = 0
    if level == warned:
        return
    # افت سطح (پس از compact) فقط حالت را ریست می‌کند
    state.parent.mkdir(parents=True, exist_ok=True)
    state.write_text(str(level))
    if level > warned:
        warn(
            f'[context-watch] Context ~{ctx // 1000}K tokens. Finish the current sub-task, '
            'then hand off (CLAUDE.md -> Token economy). Subagents: ignore.'
        )


def main():
    global CONTRACT
    raw_input = sys.stdin.buffer.read().decode('utf-8').strip()
    if not raw_input:
        allow()
        return

    event = json.loads(raw_input)

    # 1. Antigravity Tool Call Contract
    if 'toolCall' in event:
        CONTRACT = 'antigravity'
        tool_call = event['toolCall']
        tool_name = tool_call.get('name', '')
        args = tool_call.get('args', {}) or {}

        if tool_name == 'run_command':
            check_persian_grep(args.get('CommandLine', ''))
            check_migrate_backup(args.get('CommandLine', ''))
        elif tool_name == 'write_to_file':
            check_new_root_file(args.get('TargetFile', ''))
            check_status_checks(args.get('TargetFile', ''), args.get('CodeContent', ''))
            check_ui_template(args.get('TargetFile', ''), args.get('CodeContent', ''))
        elif tool_name in ('replace_file_content', 'multi_replace_file_content'):
            replacement = args.get('ReplacementContent', '')
            if not replacement and 'ReplacementChunks' in args:
                chunks = args.get('ReplacementChunks') or []
                replacement = ' '.join(c.get('ReplacementContent', '') for c in chunks)
            check_status_checks(args.get('TargetFile', ''), replacement)
            check_ui_template(args.get('TargetFile', ''), replacement)

        allow()
        return

    # 2. Claude Code Contract
    tool = event.get('tool_name')
    tool_input = event.get('tool_input') or {}
    hook_event = event.get('hook_event_name')

    if hook_event == 'PostToolUse':
        if tool in ('Edit', 'Write'):
            file_path = tool_input.get('file_path') or ''
            text = tool_input.get('new_string') or tool_input.get('content') or ''
            check_status_checks(file_path, text)
            check_ui_template(file_path, text)
        try:
            check_context(event)
        except Exception:
            pass  # خطای نگهبان context نباید هشدارهای دیگر را از بین ببرد
        flush_warnings()
    elif tool == 'Write':
        check_new_root_file(tool_input.get('file_path') or '')
    elif tool == 'Bash':
        check_persian_grep(tool_input.get('command') or '')
        check_migrate_backup(tool_input.get('command') or '')

    allow()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        allow()
    sys.exit(0)
