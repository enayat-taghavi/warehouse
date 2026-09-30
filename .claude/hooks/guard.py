"""
نگهبان هوک‌های مشترک (Claude Code و Antigravity) برای این مخزن.

پشتیبانی هم‌زمان از:
  - Claude Code (.claude/settings.json): رویدادهای Bash، Write، Edit
  - Antigravity (.agents/hooks.json): رویدادهای run_command، write_to_file، replace_file_content

قالب خروجی هر ابزار جداست:
  - Claude Code فقط JSON معتبر طرح خودش را می‌پذیرد (hookSpecificOutput) و در هر
    اجرا حداکثر یک JSON؛ «اجازه» یعنی بدون خروجی. مقدارهای decision=allow/deny در
    طرح Claude Code نامعتبرند و باعث نادیده‌گرفتن کل خروجی می‌شدند.
  - Antigravity همان قالب قبلی ({"decision": "allow" | "deny", ...}) را می‌گیرد.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PERSIAN = re.compile(r'[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]')
GREP_COMMAND = re.compile(r'(?:^|[\s;|&(])(?:grep|egrep|fgrep|rg|findstr)(?:\s|$)')
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
    if path.parent == ROOT and not path.exists():
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
            flush_warnings()
    elif tool == 'Write':
        check_new_root_file(tool_input.get('file_path') or '')
    elif tool == 'Bash':
        check_persian_grep(tool_input.get('command') or '')

    allow()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        allow()
    sys.exit(0)
