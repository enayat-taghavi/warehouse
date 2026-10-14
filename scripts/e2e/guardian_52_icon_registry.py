#!/usr/bin/env python
"""
ایجنت نگهبان ۵۲ — یکپارچگی سامانهٔ آیکن مشترک (SvgIconDirective + icon-registry)
(Guardian 52 — Shared Icon Registry Integrity)

چرا: در این پروژه strictTemplates روشن نیست، پس نام آیکنِ اشتباه در قالب هنگام build
خطا نمی‌دهد و فقط یک svg خالی نمایش می‌دهد. این نگهبان همان را جبران می‌کند.

معیارها:
  ۱) هر مقدار رجیستری یک قطعهٔ SVG معتبر (XML سالم) است و نام‌ها kebab-case و یکتا هستند.
  ۲) هر appIcon="نام" ثابت در قالب‌ها (html و قالب درون‌خطی ts) در رجیستری وجود دارد.
  ۳) هر کامپوننتی که در قالبش appIcon دارد، SvgIconDirective را در imports خود دارد.
  ۴) هیچ svg آیکنی با محتوای ثابت به‌صورت درون‌خطی در قالب‌ها نمانده است؛ آیکن تازه
     باید در رجیستری اضافه شود (svg هایی که داخلشان کد Angular هست مستثنا هستند).
  ۵) هر svg دارای appIcon ویژگی viewBox و fill دارد. دایرکتیو فقط محتوای درونی را می‌سازد؛
     بی viewBox آیکن بریده و بی fill توپر سیاه رسم می‌شود (۶۳ مورد در بازبینی ناظر ۱۴۰۵/۰۷/۲۲).
"""

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
APP_DIR = REPO_ROOT / "warehouse-front" / "src" / "app"
REGISTRY = APP_DIR / "shared" / "icons" / "icon-registry.ts"
DIRECTIVE = APP_DIR / "shared" / "icons" / "svg-icon.directive.ts"
SEMANTIC = APP_DIR / "shared" / "icons" / "semantic-icons.ts"

SVG = re.compile(r'<svg\b((?:[^>"\']|"[^"]*"|\'[^\']*\')*)>(.*?)</svg>', re.S)
SVG_OPEN = re.compile(r'<svg\b((?:[^>"\']|"[^"]*"|\'[^\']*\')*)>', re.S)
HAS_VIEWBOX = re.compile(r'(?:^|\s)(?:viewBox|\[attr\.viewBox\])\s*=')
HAS_FILL = re.compile(r'(?:^|\s)(?:fill|\[attr\.fill\])\s*=')
NG_SYNTAX = re.compile(
    r'\{\{|\s\[[\w.@-]+\]\s*=|\s\([\w.-]+\)\s*=|\s\*ng\w*\s*=|@(if|for|switch|defer|else|case|default)\b'
    r'|\s#\w+[\s>/=]|\s(ngIf|ngFor|ngClass|ngStyle|ngSwitch)\b'
)
STATIC_ICON = re.compile(r'\sappIcon="([^"]*)"')
ANY_ICON = re.compile(r'\s\[?appIcon\]?=')


def templates():
    """(مسیر فایل، متن قالب، مسیر کامپوننت مالک) برای همهٔ قالب‌ها."""
    for html in sorted(APP_DIR.rglob("*.html")):
        owner = None
        for ts in html.parent.glob("*.ts"):
            if ts.name.endswith(".spec.ts"):
                continue
            if re.search(r"templateUrl\s*:\s*['\"]\./" + re.escape(html.name) + r"['\"]", ts.read_text(encoding="utf-8")):
                owner = ts
                break
        yield html, html.read_text(encoding="utf-8"), owner
    for ts in sorted(APP_DIR.rglob("*.ts")):
        if ts.name.endswith(".spec.ts"):
            continue
        text = ts.read_text(encoding="utf-8")
        m = re.search(r"template\s*:\s*`", text)
        if m:
            yield ts, text[m.end():text.find("`", m.end())], ts


def component_imports_directive(ts_path):
    text = ts_path.read_text(encoding="utf-8")
    comp = text.find("@Component(")
    cls = text.find("export class", comp)
    arr = re.compile(r"imports\s*:\s*\[([^\]]*)\]", re.S).search(text, comp, cls)
    return bool(re.search(r"import \{[^}]*\bSvgIconDirective\b[^}]*\} from '[^']*svg-icon\.directive'", text)) and \
        bool(arr and re.search(r"\bSvgIconDirective\b", arr.group(1)))


def test_icon_registry():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۵۲: یکپارچگی سامانهٔ آیکن مشترک (SvgIconDirective + رجیستری)")
    print("=" * 74)
    errors = []

    if not REGISTRY.exists() or not DIRECTIVE.exists():
        print("❌ فایل رجیستری یا دایرکتیو آیکن یافت نشد.")
        return False

    entries = re.findall(r"^  '([^']+)': '(.*)',$", REGISTRY.read_text(encoding="utf-8"), re.M)
    names = [n for n, _ in entries]
    icons = dict(entries)
    bad_names = [n for n in names if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", n)]
    dupes = sorted({n for n in names if names.count(n) > 1})
    invalid = []
    for n, markup in entries:
        try:
            ET.fromstring('<svg xmlns="http://www.w3.org/2000/svg">' + markup + "</svg>")
        except ET.ParseError:
            invalid.append(n)
    if bad_names or dupes or invalid or not entries:
        errors.append("رجیستری")
        print(f"❌ بند ۱: نام نامعتبر {bad_names} | تکراری {dupes} | SVG نامعتبر {invalid}")
    else:
        print(f"✅ بند ۱: {len(entries)} آیکن در رجیستری؛ همه SVG معتبر با نام یکتا.")

    action_icons = {}
    status_icons = {}
    if SEMANTIC.exists():
        sem_txt = SEMANTIC.read_text(encoding="utf-8")
        act_m = re.search(r"export const ACTION_ICONS = \{([^}]+)\}", sem_txt)
        if act_m:
            action_icons = dict(re.findall(r"'([^']+)':\s*'([^']+)'", act_m.group(1)))
        stat_m = re.search(r"export const STATUS_ICONS = \{([^}]+)\}", sem_txt)
        if stat_m:
            status_icons = dict(re.findall(r"'([^']+)':\s*'([^']+)'", stat_m.group(1)))

    unknown, missing_import, inline_left, no_frame = [], [], [], []
    used = 0
    for path, text, owner in templates():
        rel = path.relative_to(APP_DIR).as_posix()
        for name in STATIC_ICON.findall(text):
            used += 1
            if name in icons:
                pass
            elif name.startswith("action-") and name[7:] in action_icons and action_icons[name[7:]] in icons:
                pass
            elif name.startswith("status-") and name[7:] in status_icons and status_icons[name[7:]] in icons:
                pass
            else:
                unknown.append(f"{rel}: {name}")
        if ANY_ICON.search(text) and (owner is None or not component_imports_directive(owner)):
            missing_import.append(rel)
        for m in SVG.finditer(text):
            inner = m.group(2)
            if inner.strip() and "appIcon" not in m.group(1) and not NG_SYNTAX.search(inner):
                inline_left.append(f"{rel}:{text[:m.start()].count(chr(10)) + 1}")
        for m in SVG_OPEN.finditer(text):
            attrs = m.group(1)
            if ANY_ICON.search(attrs) and not (HAS_VIEWBOX.search(attrs) and HAS_FILL.search(attrs)):
                no_frame.append(f"{rel}:{text[:m.start()].count(chr(10)) + 1}")

    if unknown:
        errors.append("نام ناشناخته")
        print(f"❌ بند ۲: نام آیکن ناشناخته در قالب‌ها: {unknown[:10]}")
    else:
        print(f"✅ بند ۲: همهٔ {used} استفادهٔ ثابت appIcon نام معتبر رجیستری دارند.")

    if missing_import:
        errors.append("import")
        print(f"❌ بند ۳: کامپوننت بدون SvgIconDirective در imports: {missing_import[:10]}")
    else:
        print("✅ بند ۳: همهٔ کامپوننت‌های دارای appIcon، SvgIconDirective را import کرده‌اند.")

    if inline_left:
        errors.append("svg درون‌خطی")
        print(f"❌ بند ۴: svg آیکن درون‌خطی باقی مانده ({len(inline_left)}): {inline_left[:10]}")
    else:
        print("✅ بند ۴: هیچ svg آیکن ثابت درون‌خطی در قالب‌ها نمانده است.")

    if no_frame:
        errors.append("viewBox/fill")
        print(f"❌ بند ۵: svg دارای appIcon بی viewBox یا fill ({len(no_frame)}): {no_frame[:10]}")
    else:
        print("✅ بند ۵: همهٔ svgهای دارای appIcon ویژگی viewBox و fill دارند.")

    print("=" * 74)
    if errors:
        print(f"❌ نگهبان ۵۲ شکست خورد: {', '.join(errors)}")
        return False
    print("🎉 نگهبان ۵۲: سامانهٔ آیکن مشترک سالم است.")
    return True


if __name__ == "__main__":
    sys.exit(0 if test_icon_registry() else 1)
