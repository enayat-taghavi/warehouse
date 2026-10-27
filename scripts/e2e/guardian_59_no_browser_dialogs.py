#!/usr/bin/env python
"""
ایجنت نگهبان ۵۹ — بی confirm()/alert()/prompt() مرورگر در فرانت (طرح ۲.۷، ۲.۷-د)
(Guardian 59 — no native browser dialogs in frontend code)

مرجع: Documents/Release_v1/2.7_shared_ui/plan_2.7_shared_ui.md (ص۱۰، ردیف ۲.۷-د)

دیالوگ‌های بومی مرورگر (confirm، alert، prompt) راست‌به‌چپ نیستند، با زبان طراحی نمی‌خوانند و در اندروید
(WebView) رفتار ناهمسان دارند. جایگزین: ConfirmDialogService (shared/components/confirm-dialog) برای تایید
و ToastService برای پیام خطا.

  شمرده می‌شود (فایل‌های .ts زیر frontend/src/app، بی *.spec.ts):
    - فراخوانی آزاد confirm( / alert( / prompt(
    - window. / globalThis. / self. پیش از همین نام‌ها
  شمرده نمی‌شود: متد هم‌نام روی شیء (this.confirm()، dialog.confirm())، تعریف متد (confirm(): void {)،
  فراخوانی در قالب (click)="confirm()" (قالب Angular به window دسترسی ندارد) و خطوط توضیح.
  prompt(): فقط شمار دقیق PROMPT_ALLOWLIST مجاز است (بدهی تا دیالوگ مشترک «علت»).

گزینه‌ها:
  python scripts/e2e/guardian_59_no_browser_dialogs.py              # بررسی
  python scripts/e2e/guardian_59_no_browser_dialogs.py --self-test  # آزمون تشخیص روی نمونهٔ ساختگی
"""

import argparse
import pathlib
import re
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parents[2]
APP = ROOT / 'frontend' / 'src' / 'app'

NAMES = r'(?:confirm|alert|prompt)'
GLOBAL_CALL = re.compile(r'\b(?:window|globalThis|self)\s*\.\s*' + NAMES + r'\s*\(')
BARE_CALL = re.compile(r'(?<![.\w$])' + NAMES + r'\s*\(')

# prompt() بدهی شناخته‌شده است (دیالوگ «علت» هنوز جایگزین مشترک ندارد): فقط همین شمار در همین فایل‌ها.
# افزایش یا فایل تازه شکست است؛ کاهش هم شکست است تا فهرست کهنه نماند (عدد را پایین بیاورید یا ردیف را بردارید).
PROMPT_ALLOWLIST = {
    'frontend/src/app/modules/accounting/components/finance/supervisor/supervisor-new-profiles/supervisor-new-profiles.ts': 2,
}
PROMPT_ONLY = re.compile(r'(?:\b(?:window|globalThis|self)\s*\.\s*|(?<![.\w$]))prompt\s*\(')
CONFIRM_OR_ALERT = re.compile(r'(?<![.\w$])(?:confirm|alert)\s*\(')

DEFINITION = re.compile(
    r'^\s*(?:(?:public|private|protected|static|async|override|readonly)\s+)*' + NAMES + r'\s*\([^)]*\)\s*(?::[^={]+)?\{?\s*$'
)


def scan_text(text):
    """فهرست (شمارهٔ خط، خط) برای هر فراخوانی دیالوگ بومی."""
    hits = []
    in_block_comment = False
    for no, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if in_block_comment:
            if '*/' in stripped:
                in_block_comment = False
            continue
        if stripped.startswith('/*'):
            in_block_comment = '*/' not in stripped
            continue
        if stripped.startswith('//') or stripped.startswith('*'):
            continue
        code = line.split('//', 1)[0] if '://' not in line else line
        if GLOBAL_CALL.search(code):
            hits.append((no, stripped))
            continue
        if DEFINITION.match(code):
            continue
        for m in BARE_CALL.finditer(code):
            before = code[:m.start()].rstrip()
            if before.endswith('"') or before.endswith("'") or before.endswith('function'):
                continue  # قالب (click)="confirm()" یا تعریف تابع
            hits.append((no, stripped))
            break
    return hits


def scan_tree():
    problems = []
    prompts = {}
    for path in sorted(APP.rglob('*.ts')):
        if path.name.endswith('.spec.ts'):
            continue
        rel = path.relative_to(ROOT).as_posix()
        for no, line in scan_text(path.read_text(encoding='utf-8')):
            entry = f'{rel}:{no}: {line[:120]}'
            if PROMPT_ONLY.search(line) and not CONFIRM_OR_ALERT.search(line):
                prompts.setdefault(rel, []).append(entry)
            else:
                problems.append(entry)
    for rel, entries in sorted(prompts.items()):
        if len(entries) > PROMPT_ALLOWLIST.get(rel, 0):
            problems.extend(entries)
    for rel, allowed in sorted(PROMPT_ALLOWLIST.items()):
        found = len(prompts.get(rel, []))
        if found < allowed:
            problems.append(f'{rel}: فهرست مجاز prompt کهنه است ({allowed} در فهرست، {found} در کد) — عدد را به‌روز کنید')
    return problems


def self_test():
    sample = '\n'.join([
        "if (!confirm('x')) return;",            # 1 hit
        "const ok = window.confirm(msg);",       # 2 hit
        "alert('bad');",                         # 3 hit
        "this.confirm();",                       # 4 no
        "  public confirm(): void {",            # 5 no
        "  private async confirm(t: string, m: string): Promise<boolean> {",  # 6 no
        '  (click)="confirm()"',                 # 7 no
        "// confirm() in a comment",             # 8 no
        " * alert() in a doc comment",           # 9 no
        "dialog.alert('x');",                    # 10 no
        "globalThis.prompt('x');",               # 11 hit
    ])
    got = [no for no, _ in scan_text(sample)]
    want = [1, 2, 3, 11]
    if got != want:
        print(f'SELF-TEST FAIL: got {got}, want {want}')
        return 1
    print('SELF-TEST OK')
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    problems = scan_tree()
    if problems:
        print(f'نگهبان ۵۹: {len(problems)} فراخوانی دیالوگ بومی مرورگر پیدا شد (جایگزین: ConfirmDialogService / ToastService):')
        for p in problems:
            print('  - ' + p)
        return 1
    print('نگهبان ۵۹: هیچ confirm()/alert() مرورگر در فرانت نیست و prompt() فقط در فهرست مجاز است. ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
