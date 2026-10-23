import os
import sys
import re
import subprocess

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

FRONT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
SRC_DIR = os.path.join(FRONT_DIR, "src", "app")

def check_phase_1():
    print("🛡️ [Guardian Phase 1] بازرسی کامپوننت OfflinePendingBadgeComponent...")
    badge_file = os.path.join(SRC_DIR, "shared", "components", "offline-pending-badge", "offline-pending-badge.component.ts")
    if not os.path.exists(badge_file):
        return False, "فایل offline-pending-badge.component.ts یافت نشد."
    
    with open(badge_file, "r", encoding="utf-8") as f:
        content = f.read()

    required_keywords = [
        "@Input() mode: 'header' | 'inline'",
        "NetworkStatusService",
        "OfflineSyncService",
        "isPopoverOpen",
        "onManualSync",
        "forceSync",
        "onDocumentClick",
        "togglePopover",
        "rounded-full",
        "متصل"
    ]
    for kw in required_keywords:
        if kw not in content:
            return False, f"عبارت الزامی '{kw}' در کامپوننت یافت نشد."

    print("  ✅ فاز ۱: کلیه معیارهای کامپوننت نشانگر پویا و کپسولی تایید شدند.")
    return True, "Phase 1 Pass"

def resolve_component_path(*rel_parts):
    p = os.path.join(SRC_DIR, "components", *rel_parts)
    if os.path.exists(p):
        return p
    for sub in ["modules/common/components", "modules/warehouse/components", "modules/accounting/components"]:
        cand = os.path.join(SRC_DIR, sub.replace("/", os.sep), *rel_parts)
        if os.path.exists(cand):
            return cand
    return p

def check_phase_2():
    print("🛡️ [Guardian Phase 2] بازرسی هدر سراسری کل سیستم (Top Navbar)...")
    layout_ts = resolve_component_path("layout", "layout.ts")
    layout_html = resolve_component_path("layout", "layout.html")

    with open(layout_ts, "r", encoding="utf-8") as f:
        ts_content = f.read()
    with open(layout_html, "r", encoding="utf-8") as f:
        html_content = f.read()

    if "OfflinePendingBadgeComponent" not in ts_content:
        return False, "OfflinePendingBadgeComponent در layout.ts ایمپورت نشده است."

    if 'app-offline-pending-badge mode="header"' not in html_content and "app-offline-pending-badge [mode]=\"'header'\"" not in html_content:
        return False, "تگ <app-offline-pending-badge mode=\"header\"> در layout.html یافت نشد."

    print("  ✅ فاز ۲: هدر سراسری با موفقیت تایید شد.")
    return True, "Phase 2 Pass"

def check_phase_3():
    print("🛡️ [Guardian Phase 3] بازرسی هدرهای تب‌های عملیاتی پنج‌گانه بر اساس الگوی کارتابل مدیر...")
    operational_files = [
        resolve_component_path("counter", "counter-dashboard", "counter-dashboard.html"),
        resolve_component_path("supervisor", "supervisor-dashboard", "supervisor-dashboard.html"),
        resolve_component_path("manager-review", "manager-review.html"),
        resolve_component_path("count-tracking", "count-tracking.html"),
        resolve_component_path("customs", "customs.html"),
    ]

    for path in operational_files:
        filename = os.path.basename(path)
        if not os.path.exists(path):
            return False, f"فایل {filename} یافت نشد."
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        if 'mode="header"' not in content and '[mode]="\'header\'"' not in content:
            return False, f"در فایل {filename} نشانگر هدر با ویژگی mode=\"header\" یافت نشد."
        if "openExportModal" not in content and "خروجی اکسل" not in content:
            return False, f"در فایل {filename} دکمه خروجی اکسل یافت نشد."
        if "refreshCurrentTab" not in content and "loadTasks" not in content and "بروزرسانی" not in content:
            return False, f"در فایل {filename} دکمه بروزرسانی یافت نشد."

    print("  ✅ فاز ۳: کلیه تب‌های عملیاتی ۵ گانه با موفقیت تایید شدند.")
    return True, "Phase 3 Pass"

def check_phase_4():
    print("🛡️ [Guardian Phase 4] بازرسی تب‌های مدیریتی (پروژه‌ها، کاربران، دیسپچ و تغذیه)...")
    management_views = [
        ("Projects", "projects/projects.ts", "projects/projects.html"),
        ("Users", "users/users.ts", "users/users.html"),
        ("Dispatch", "dispatch/dispatch.ts", "dispatch/dispatch.html"),
        ("Feeding", "feeding/feeding.ts", "feeding/feeding.html"),
    ]

    for name, ts_rel, html_rel in management_views:
        ts_path = resolve_component_path(ts_rel)
        html_path = resolve_component_path(html_rel)

        if not os.path.exists(ts_path) or not os.path.exists(html_path):
            return False, f"فایل‌های مربوط به {name} یافت نشدند."

        with open(ts_path, "r", encoding="utf-8") as f:
            if "OfflinePendingBadgeComponent" not in f.read():
                return False, f"OfflinePendingBadgeComponent در {ts_rel} ایمپورت نشده است."

        with open(html_path, "r", encoding="utf-8") as f:
            h = f.read()
            if 'app-offline-pending-badge mode="header"' not in h and "app-offline-pending-badge [mode]=\"'header'\"" not in h:
                return False, f"نشانگر وضعیت در {html_rel} تعبیه نشده است."

    print("  ✅ فاز ۴: تب‌های مدیریتی و لاجستیک با موفقیت تایید شدند.")
    return True, "Phase 4 Pass"

def check_phase_5():
    print("🛡️ [Guardian Phase 5] بازرسی تب‌های مانیتورینگ، اسناد، ممیزی، گزارشات و تنظیمات...")
    views = [
        ("Dashboard", "dashboard/dashboard.ts", "dashboard/dashboard.html"),
        ("Docs", "docs/docs.ts", "docs/docs.html"),
        ("Audit", "audit/audit.ts", "audit/audit.html"),
        ("Reports", "reports/reports.ts", "reports/reports.html"),
        ("Settings", "settings/settings.ts", "settings/settings.html"),
    ]

    for name, ts_rel, html_rel in views:
        ts_path = resolve_component_path(ts_rel)
        html_path = resolve_component_path(html_rel)

        if not os.path.exists(ts_path) or not os.path.exists(html_path):
            return False, f"فایل‌های مربوط به {name} یافت نشدند."

        with open(ts_path, "r", encoding="utf-8") as f:
            if "OfflinePendingBadgeComponent" not in f.read():
                return False, f"OfflinePendingBadgeComponent در {ts_rel} ایمپورت نشده است."

        with open(html_path, "r", encoding="utf-8") as f:
            h = f.read()
            if 'app-offline-pending-badge mode="header"' not in h and "app-offline-pending-badge [mode]=\"'header'\"" not in h:
                return False, f"نشانگر وضعیت در {html_rel} تعبیه نشده است."

    print("  ✅ فاز ۵: تب‌های مانیتورینگ، اسناد، ممیزی و گزارشات با موفقیت تایید شدند.")
    return True, "Phase 5 Pass"

def main():
    phase = sys.argv[1] if len(sys.argv) > 1 else "all"
    print(f"🛡️ شروع ارزیابی ایجنت نگهبان مستقل (Phase: {phase})...\n")

    if phase in ("1", "all"):
        ok, msg = check_phase_1()
        if not ok:
            print(f"❌ خطای نگهبان در فاز ۱: {msg}")
            sys.exit(1)

    if phase in ("2", "all"):
        ok, msg = check_phase_2()
        if not ok:
            print(f"❌ خطای نگهبان در فاز ۲: {msg}")
            sys.exit(1)

    if phase in ("3", "all"):
        ok, msg = check_phase_3()
        if not ok:
            print(f"❌ خطای نگهبان در فاز ۳: {msg}")
            sys.exit(1)

    if phase in ("4", "all"):
        ok, msg = check_phase_4()
        if not ok:
            print(f"❌ خطای نگهبان در فاز ۴: {msg}")
            sys.exit(1)

    if phase in ("5", "all"):
        ok, msg = check_phase_5()
        if not ok:
            print(f"❌ خطای نگهبان در فاز ۵: {msg}")
            sys.exit(1)

    print("\n🎉 تمامی معیارهای ارزیابی ایجنت نگهبان با موفقیت ۱۰۰٪ تایید شدند.")

if __name__ == "__main__":
    main()
