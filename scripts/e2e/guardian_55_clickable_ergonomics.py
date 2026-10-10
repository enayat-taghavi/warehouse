#!/usr/bin/env python
"""
ایجنت نگهبان ۵۵ — ارگونومی عناصر کلیک‌پذیر و فرهنگ آیکون
(Guardian 55 — Clickable Ergonomics & Semantic Icon Dictionary)

چرا: نظارت خودکار بر پیشرفت طرح ارگونومی واکنش‌گرا و جلوگیری از بازگشت به الگوهای نامناسب:
  ۱) دکمه فقط‌آیکون بدون aria-label یا title
  ۲) عرض ثابت min-w-[...px] درون نوارهای تب
  ۳) دکمه‌های با کار شناخته‌شده (export, refresh, delete, approve, reject) بدون appAction یا آیکون مصوب
  ۴) استفاده از گونه‌های کنارگذاشتهٔ آیکون (۵۳ گونه فرهنگ آیکون)

به سبک نگهبان ۲۹، این نگهبان بر پایهٔ «خط مبنا» (baseline) کار می‌کند و فقط در صورت
افزایش تعداد نقض‌ها نسبت به خط مبنا شکست می‌خورد.
برای ثبت پیشرفت پس از هر گام:
  python scripts/e2e/guardian_55_clickable_ergonomics.py --update-baseline
"""

import json
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
APP_DIR = REPO_ROOT / "warehouse-front" / "src" / "app"
BASELINE_FILE = REPO_ROOT / "scripts" / "e2e" / "clickable_ergonomics_baseline.json"

# ۵۳ گونه کنارگذاشته آیکون (بخش‌های ۳-۱ و ۳-۲ طرح)
RETIRED_VARIANTS = {
    # کارها (بخش ۳-۱)
    'trash', 'trash-lucide', 'trash-2-lucide', 'trash-2-soft', 'trash-compact', 'hero-trash',
    'rotate-cw', 'rotate-cw-path', 'rotate-cw-legacy', 'refresh-cw-legacy', 'refresh-ccw', 'hero-refresh',
    'spinner-arc', 'spinner-quarter', 'spinner-wedge', 'loader', 'loader-arc', 'loader-6-rays',
    'edit-2', 'edit-3',
    'hero-plus', 'hero-plus-bold', 'plus-square',
    'download-arrow', 'hero-document-download',
    'hero-save',
    'undo-2', 'rotate-ccw-alt', 'rotate-ccw-lucide', 'rotate-ccw-lucide-alt',
    'check-path', 'hero-check-bold', 'hero-check-solid',
    'x-path', 'hero-x',
    'hero-paper-airplane',
    'copy-2', 'copy-alt',
    'eye-alt', 'eye-slash',
    'hero-search', 'hero-search-plain',
    'scan-square', 'scan-text',
    'settings-alt',
    'hero-chevron-left', 'hero-arrow-left',
    'chevron-down-path', 'hero-chevron-down', 'hero-chevron-up',
    # وضعیت‌ها (بخش ۳-۲)
    'clock-2', 'clock-lucide', 'hero-clock',
}

KNOWN_ACTIONS = {
    'export': ('export-excel', {'download'}),
    'import': ('import-excel', {'upload'}),
    'refresh': ('refresh', {'refresh-cw'}),
    'delete': ('delete', {'trash-2'}),
    'approve': ('approve', {'check-circle'}),
    'reject': ('reject', {'x-circle'}),
}


def scan_templates():
    """پیمایش قالب‌های html و قالب‌های درون‌خطی ts."""
    for html in sorted(APP_DIR.rglob("*.html")):
        yield html, html.read_text(encoding="utf-8")
    for ts in sorted(APP_DIR.rglob("*.ts")):
        if ts.name.endswith(".spec.ts"):
            continue
        text = ts.read_text(encoding="utf-8")
        m = re.search(r"template\s*:\s*`", text)
        if m:
            yield ts, text[m.end():text.find("`", m.end())]


def check_rule_1_unlabeled_icon_buttons(templates):
    """قاعده ۱: دکمه فقط‌آیکون بدون aria-label و بدون title."""
    violations = []
    btn_regex = re.compile(r'<button\b([^>]*)>(.*?)</button>', re.DOTALL | re.IGNORECASE)
    for path, text in templates:
        rel = path.relative_to(APP_DIR).as_posix()
        for m in btn_regex.finditer(text):
            attrs = m.group(1)
            content = m.group(2)
            if 'appAction' in attrs:
                continue
            # حذف تگ‌ها و بیان‌های انگولار
            no_tags = re.sub(r'<[^>]+>', '', content)
            no_tags = re.sub(r'\{\{[^}]*\}\}', '', no_tags).strip()
            if not no_tags:
                has_label = bool(re.search(r'\b(aria-label|\[aria-label\]|\[attr\.aria-label\]|title|\[title\]|\[attr\.title\])\b', attrs))
                if not has_label:
                    line_no = text[:m.start()].count('\n') + 1
                    violations.append({
                        'file': rel,
                        'line': line_no,
                    })
    return violations


def check_rule_2_tab_min_widths(templates):
    """قاعده ۲: min-w-[...px] درون نوار تب."""
    violations = []
    elem_re = re.compile(r'<(\w+)\b([^>]*)>', re.DOTALL)
    for path, text in templates:
        rel = path.relative_to(APP_DIR).as_posix()
        for m in elem_re.finditer(text):
            tag, attrs = m.group(1), m.group(2)
            if re.search(r'min-w-\[\d+px\]', attrs):
                attrs_lower = attrs.lower()
                if any(k in attrs_lower for k in ('tab', 'role="tab"', 'subtab', 'currenttab', 'activetab')):
                    line_no = text[:m.start()].count('\n') + 1
                    violations.append({
                        'file': rel,
                        'line': line_no,
                        'tag': tag
                    })
    return violations


def check_rule_3_non_standard_actions(templates):
    """قاعده ۳: دکمه کاری شناخته‌شده بدون appAction یا آیکون مصوب."""
    violations = []
    btn_regex = re.compile(r'<button\b([^>]*)>(.*?)</button>', re.DOTALL | re.IGNORECASE)
    for path, text in templates:
        rel = path.relative_to(APP_DIR).as_posix()
        for m in btn_regex.finditer(text):
            attrs = m.group(1)
            content = m.group(2)
            if 'appAction' in attrs:
                continue
            click_m = re.search(r'\(click\)=["\']([^"\'(]+)', attrs)
            if not click_m:
                continue
            method = click_m.group(1).lower()
            for act_prefix, (canonical_action, valid_icons) in KNOWN_ACTIONS.items():
                if act_prefix in method:
                    icon_m = re.search(r'appIcon=["\']([^"\']+)["\']', content)
                    used_icon = icon_m.group(1) if icon_m else None
                    if used_icon not in valid_icons:
                        line_no = text[:m.start()].count('\n') + 1
                        violations.append({
                            'file': rel,
                            'line': line_no,
                            'method': click_m.group(1),
                            'icon': used_icon
                        })
                    break
    return violations


def check_rule_4_retired_icons(templates):
    """قاعده ۴: استفاده از گونه‌های کنارگذاشته آیکون."""
    violations = []
    for path, text in templates:
        rel = path.relative_to(APP_DIR).as_posix()
        for m in re.finditer(r'appIcon=["\']([^"\']+)["\']', text):
            name = m.group(1)
            if name in RETIRED_VARIANTS:
                line_no = text[:m.start()].count('\n') + 1
                violations.append({
                    'file': rel,
                    'line': line_no,
                    'icon': name
                })
    return violations


def run_guardian(update_baseline=False):
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۵۵: ارگونومی عناصر کلیک‌پذیر (Guardian 55 — Clickable Ergonomics)")
    print("=" * 74)

    templates_list = list(scan_templates())

    r1 = check_rule_1_unlabeled_icon_buttons(templates_list)
    r2 = check_rule_2_tab_min_widths(templates_list)
    r3 = check_rule_3_non_standard_actions(templates_list)
    r4 = check_rule_4_retired_icons(templates_list)

    current_counters = {
        "rule_1_unlabeled_icon_buttons": len(r1),
        "rule_2_tab_min_widths": len(r2),
        "rule_3_non_standard_actions": len(r3),
        "rule_4_retired_icons": len(r4),
    }

    if update_baseline or not BASELINE_FILE.exists():
        data = {
            "_readme": "snapshot مبنای ارگونومی عناصر کلیک‌پذیر (نگهبان ۵۵). برای به‌روزرسانی: python scripts/e2e/guardian_55_clickable_ergonomics.py --update-baseline",
            "counters": current_counters,
            "violations": {
                "rule_1_unlabeled_icon_buttons": r1[:30],
                "rule_2_tab_min_widths": r2,
                "rule_3_non_standard_actions": r3[:30],
                "rule_4_retired_icons": r4[:30],
            }
        }
        BASELINE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"📌 خط مبنا ذخیره شد: {current_counters}")
        return True

    baseline_data = json.loads(BASELINE_FILE.read_text(encoding="utf-8"))
    baseline_counters = baseline_data.get("counters", {})

    errors = []
    print("\n📊 وضعیت سنجه‌ها در مقایسه با خط مبنا:")
    rule_names = {
        "rule_1_unlabeled_icon_buttons": "قاعده ۱: دکمه‌های فقط‌آیکون بدون aria-label/title",
        "rule_2_tab_min_widths": "قاعده ۲: عرض ثابت min-w-[...px] درون نوارهای تب",
        "rule_3_non_standard_actions": "قاعده ۳: دکمه‌های اکشن بدون appAction/آیکون واحد",
        "rule_4_retired_icons": "قاعده ۴: استفاده از گونه‌های کنارگذاشتهٔ آیکون",
    }

    for key, label in rule_names.items():
        cur = current_counters.get(key, 0)
        base = baseline_counters.get(key, cur)
        diff = cur - base
        if diff > 0:
            print(f"❌ {label}: {cur} (افزایش: +{diff} نسبت به خط مبنا {base})")
            errors.append(f"{key}: +{diff}")
        elif diff < 0:
            print(f"✅ {label}: {cur} (پیشرفت: {diff} نسبت به خط مبنا {base})")
        else:
            print(f"✅ {label}: {cur} (برابر خط مبنا)")

    print("=" * 74)
    if errors:
        print(f"❌ نگهبان ۵۵ شکست خورد: افزایش در {', '.join(errors)}")
        return False

    print("🎉 نگهبان ۵۵: همه سنجه‌های ارگونومی کلیک‌پذیر در محدوده خط مبنا هستند.")
    return True


if __name__ == "__main__":
    should_update = "--update-baseline" in sys.argv
    success = run_guardian(update_baseline=should_update)
    sys.exit(0 if success else 1)
