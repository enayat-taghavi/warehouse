"""
نگهبان هوک‌های مشترک (Claude Code و Antigravity) برای این مخزن.

پشتیبانی هم‌زمان از:
  - Claude Code (.claude/settings.json): رویدادهای Bash، Write، Edit
  - Antigravity (.agents/hooks.json): رویدادهای run_command، write_to_file، replace_file_content
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


def deny(reason):
    print(json.dumps({
        'decision': 'deny',
        'reason': reason,
        'hookSpecificOutput': {
            'hookEventName': 'PreToolUse',
            'permissionDecision': 'deny',
            'permissionDecisionReason': reason,
        }
    }, ensure_ascii=True))
    sys.exit(0)


def allow():
    print(json.dumps({
        'decision': 'allow'
    }, ensure_ascii=True))


def warn(context):
    print(json.dumps({
        'hookSpecificOutput': {
            'hookEventName': 'PostToolUse',
            'additionalContext': context,
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


def main():
    raw_input = sys.stdin.buffer.read().decode('utf-8').strip()
    if not raw_input:
        allow()
        return

    event = json.loads(raw_input)

    # 1. Antigravity Tool Call Contract
    if 'toolCall' in event:
        tool_call = event['toolCall']
        tool_name = tool_call.get('name', '')
        args = tool_call.get('args', {}) or {}

        if tool_name == 'run_command':
            check_persian_grep(args.get('CommandLine', ''))
        elif tool_name == 'write_to_file':
            check_new_root_file(args.get('TargetFile', ''))
            check_status_checks(args.get('TargetFile', ''), args.get('CodeContent', ''))
        elif tool_name in ('replace_file_content', 'multi_replace_file_content'):
            replacement = args.get('ReplacementContent', '')
            if not replacement and 'ReplacementChunks' in args:
                chunks = args.get('ReplacementChunks') or []
                replacement = ' '.join(c.get('ReplacementContent', '') for c in chunks)
            check_status_checks(args.get('TargetFile', ''), replacement)

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
