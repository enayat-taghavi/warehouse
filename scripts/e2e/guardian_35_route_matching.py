#!/usr/bin/env python
"""
ایجنت نگهبان ۳۵ — تطابق دقیق روت‌ها و ریدایرکت‌های Legacy فرانت‌اند (فاز ۶)
(Guardian 35 — Route Matching, Lazy Loading, and Legacy Redirect Parity)

مرجع: Documents/Modular_Split_Warehouse_Accounting/implementation_plan_modular_split.md §۶, §۷

معیار آزمون:
  ۱) راستی‌آزمایی بارگذاری تنبل (Lazy Loading) در `app.routes.ts`:
     مسیرهای `/app/warehouse` و `/app/finance` باید از `loadChildren` استفاده کنند
     نه کامپوننت‌های Eager.
  ۲) حفظ بی‌کم‌وکاست تمامی ۳۵+ ریدایرکت قدیمی (Legacy Redirects):
     هر مسیر قدیمی مانند `dashboard`, `projects`, `dispatch`, `docs`, `counter`,
     `supervisor`, `manager-review`, `count-tracking`, `reports`, `customs`,
     `attendance`, `finance-cartable`, `treasury-cartable`, `manager-approvals`,
     `profiles`, `projects-and-sections` و ... باید دقیقاً به مقصد ماژولار خود ریدایرکت شود.
  ۳) عدم وجود ایمپورت‌های ۴۰ گانه کامپوننت‌های انبار و پرسنل در سطر‌های بالای `app.routes.ts`.
  ۴) راستی‌آزمایی جدول تصمیم‌گیری هوشمند در ریدایرکت ریشه ('app' و '') بر اساس مجوزها.
"""

import os
import sys
import re
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
APP_ROUTES_TS = REPO_ROOT / "warehouse-front" / "src" / "app" / "app.routes.ts"

# لیست مورد انتظار ۳۵ ریدایرکت legacy مطابق سند طرح
EXPECTED_LEGACY_REDIRECTS = {
    "dashboard": "app/warehouse/dashboard",
    "projects": "app/warehouse/projects",
    "dispatch": "app/warehouse/dispatch",
    "docs": "app/warehouse/docs",
    "users": "app/warehouse/users",
    "settings": "app/warehouse/settings",
    "wh-settings": "app/warehouse/wh-settings",
    "audit": "app/warehouse/audit",
    "feeding": "app/warehouse/feeding",
    "counter": "app/warehouse/counter",
    "supervisor": "app/warehouse/supervisor",
    "manager-review": "app/warehouse/manager-review",
    "count-tracking": "app/warehouse/count-tracking",
    "reports": "app/warehouse/reports",
    "customs": "app/warehouse/customs",
    "tasks": "app/warehouse/tasks",
    "labels": "app/warehouse/labels",
    "approvals": "app/warehouse/approvals",
    "doc_approvals": "app/warehouse/doc_approvals",
    "feed_approvals": "app/warehouse/feed_approvals",
    # صفحه‌های بازنشسته (طرح منوی نقش‌ها و راهبر تشکیلات) مستقیم به هاب جانشین می‌روند
    "finance-cartable": "app/finance/accountant-payroll",
    "attendance": "app/finance/employee-attendance",
    "fleet": "app/finance/employee-fleet",
    "fleet-attendance": "app/finance/employee-fleet",
    "employee-portal": "app/finance/employee-attendance",
    "manager-approvals": "app/finance/manager-approvals",
    "treasury-cartable": "app/finance/treasurer-disbursements",
    "treasury": "app/finance/treasurer-disbursements",
    "profiles": "app/finance/profiles",
    "personnel-profiles": "app/finance/personnel-profiles",
    "base-settings": "app/finance/base-settings",
    "projects-and-sections": "app/finance/projects-and-sections",
    "personnel": "app/finance/accountant-payroll",
    "payroll": "app/finance/accountant-payroll",
    "fleet-settlement": "app/finance/treasurer-disbursements",
    "finance-audit": "app/finance/audit",
    "operations": "app/operations/cockpit",
    "cockpit": "app/operations/cockpit",
}


def test_route_matching():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۳۵: تطابق مسیرها، بارگذاری تنبل و ریدایرکت‌های Legacy (فاز ۶)")
    print("=" * 74)

    errors = []

    if not APP_ROUTES_TS.exists():
        print(f"❌ فایل {APP_ROUTES_TS} یافت نشد.")
        return False

    content = APP_ROUTES_TS.read_text(encoding="utf-8")

    # ۱. راستی‌آزمایی loadChildren برای ماژول‌ها
    has_wh_lazy = bool(re.search(r"path:\s*'app/warehouse'.*?loadChildren:\s*\(\)\s*=>\s*import\(", content, re.DOTALL))
    has_fin_lazy = bool(re.search(r"path:\s*'app/finance'.*?loadChildren:\s*\(\)\s*=>\s*import\(", content, re.DOTALL))

    if has_wh_lazy and has_fin_lazy:
        print("✅ بارگذاری تنبل (loadChildren) برای هر دو ماژول انبارداری و مالی با موفقیت پیاده‌سازی شده است.")
    else:
        print(f"❌ بارگذاری تنبل یافت نشد! (warehouse: {has_wh_lazy}, finance: {has_fin_lazy})")
        errors.append("loadChildren not found for warehouse or finance in app.routes.ts")

    # ۲. راستی‌آزمایی حذف ایمپورت‌های مشتاق (Eager) کامپوننت‌های زیرمجموعه
    eager_components = [
        "CounterDashboard", "SupervisorDashboard", "ManagerReview",
        "AccountantPayrollHubComponent", "EmployeeAttendanceHubComponent", "ManagerApprovals",
        "WhSettings", "Feeding", "Customs", "CountTracking"
    ]
    found_eagers = [comp for comp in eager_components if f"import {{ {comp} }}" in content or f"import {{{comp}}}" in content]
    if found_eagers:
        print(f"❌ کامپوننت‌های زیر هنوز به صورت مشتاق (Eager) در app.routes.ts ایمپورت شده‌اند: {found_eagers}")
        errors.append(f"Eager imports still present: {found_eagers}")
    else:
        print("✅ کامپوننت‌های انبار و مالی از روت ریشه خارج شده و تنها در ماژول‌های تنبل خود لود می‌شوند.")

    # ۳. راستی‌آزمایی تک‌تک ریدایرکت‌های Legacy
    redirect_matches = re.findall(r"\{\s*path:\s*'([^']+)',\s*redirectTo:\s*'([^']+)'", content)
    redirect_dict = dict(redirect_matches)

    missing_redirects = []
    mismatched_redirects = []

    for src, expected_dest in EXPECTED_LEGACY_REDIRECTS.items():
        if src not in redirect_dict:
            missing_redirects.append(src)
        elif redirect_dict[src] != expected_dest:
            mismatched_redirects.append((src, redirect_dict[src], expected_dest))

    if missing_redirects:
        print(f"❌ ریدایرکت‌های گم‌شده: {missing_redirects}")
        errors.append(f"Missing legacy redirects: {missing_redirects}")
    elif mismatched_redirects:
        print(f"❌ ریدایرکت‌های دارای مقصد اشتباه: {mismatched_redirects}")
        errors.append(f"Mismatched redirects: {mismatched_redirects}")
    else:
        print(f"✅ تمام {len(EXPECTED_LEGACY_REDIRECTS)} ریدایرکت Legacy به صورت ۱۰۰٪ دقیق و سالم حفظ شده‌اند.")

    # ۴. بررسی استفاده از moduleRegistry برای تصمیم‌گیری دسترسی ریشه
    if "ModuleRegistryService" in content and "permissionMarkers" in content:
        print("✅ تصمیم‌گیری هدایت هوشمند ریشه بر پایه رجیستری ماژول‌ها و مجوزهای فعال تنظیم شده است.")
    else:
        print("❌ استفاده از رجیستری ماژول‌ها در تصمیم‌گیری روت ریشه یافت نشد.")
        errors.append("ModuleRegistryService not integrated in root route decision")

    if errors:
        print("=" * 74)
        print(f"❌ نگهبان ۳۵ شکست خورد با {len(errors)} خطا.")
        return False

    print("=" * 74)
    print("✨ نتیجه: نگهبان ۳۵ تایید شد (PASS) — تطابق روت‌ها و ریدایرکت‌ها کامل است ✨")
    print("=" * 74)
    return True


if __name__ == "__main__":
    success = test_route_matching()
    sys.exit(0 if success else 1)
