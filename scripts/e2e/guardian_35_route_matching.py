#!/usr/bin/env python
"""
ایجنت نگهبان ۳۵ — تطابق دقیق روت‌ها، بارگذاری تنبل و ریدایرکت‌های Legacy فرانت‌اند (فاز ۶)
(Guardian 35 — Route Matching, Lazy Loading, and Legacy Redirect Parity)

مرجع: Documents/Modular_Split_Warehouse_Accounting/implementation_plan_modular_split.md §۶, §۷
و Documents/Deep_Modularization_Phase3/modular_architecture_phase3_plan.md

معیار آزمون:
  ۱) راستی‌آزمایی بارگذاری تنبل (Lazy Loading) ماژولار در `app.routes.ts`:
     مسیرهای ماژولار از `INSTALLED_MODULES` با `loadChildren: m.routes` و گارد `canMatch`
     (شامل بررسی `isModuleInstalled`) ساخته شوند.
  ۲) عدم وجود ایمپورت‌های مشتاق (Eager) کامپوننت‌های ماژولار انبار و پرسنل در `app.routes.ts`.
  ۳) حفظ بی‌کم‌وکاست تمامی ۳۸ ریدایرکت قدیمی (Legacy Redirects) مطابق جدول `EXPECTED_LEGACY_REDIRECTS`.
  ۴) راستی‌آزمایی جدول تصمیم‌گیری هوشمند در ریدایرکت ریشه ('app' و '') بر اساس رجیستری ماژول‌ها و مجوزها.
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

# لیست مورد انتظار ۳۸ ریدایرکت legacy مطابق سند طرح
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


def check_lazy_module_routes(content):
    """بررسی ایمپورت INSTALLED_MODULES، ساخت مسیرها با loadChildren: m.routes و canMatch با isModuleInstalled."""
    errors = []
    if not re.search(r"import\s*\{[^}]*INSTALLED_MODULES[^}]*\}\s*from\s*['\"][^'\"]*installed-modules['\"]", content):
        errors.append("ایمپورت INSTALLED_MODULES از installed-modules در app.routes.ts یافت نشد.")

    if not re.search(r"INSTALLED_MODULES.*?loadChildren:\s*m\.routes", content, re.DOTALL):
        errors.append("تعریف پویای مسیرهای ماژولار با loadChildren: m.routes بر پایه INSTALLED_MODULES یافت نشد.")

    if not re.search(r"canMatch:\s*\[.*?isModuleInstalled\(", content, re.DOTALL):
        errors.append("گارد canMatch با بررسی رجیستری (isModuleInstalled) برای مسیرهای ماژولار یافت نشد.")

    return errors


def check_eager_component_imports(content):
    """راستی‌آزمایی حذف ایمپورت‌های مشتاق (Eager) کامپوننت‌های زیرمجموعه در app.routes.ts."""
    errors = []
    eager_components = [
        "CounterDashboard", "SupervisorDashboard", "ManagerReview",
        "AccountantPayrollHubComponent", "EmployeeAttendanceHubComponent", "ManagerApprovals",
        "WhSettings", "Feeding", "Customs", "CountTracking"
    ]
    found_eagers = [comp for comp in eager_components if f"import {{ {comp} }}" in content or f"import {{{comp}}}" in content]
    if found_eagers:
        errors.append(f"کامپوننت‌های زیر هنوز به صورت مشتاق (Eager) در app.routes.ts ایمپورت شده‌اند: {found_eagers}")
    return errors


def check_legacy_redirects(content):
    """راستی‌آزمایی تک‌تک ریدایرکت‌های Legacy."""
    errors = []
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
        errors.append(f"ریدایرکت‌های گم‌شده: {missing_redirects}")
    if mismatched_redirects:
        errors.append(f"ریدایرکت‌های دارای مقصد اشتباه: {mismatched_redirects}")
    return errors


def check_root_route_decision(content):
    """بررسی استفاده از moduleRegistry و permissionMarkers در تصمیم‌گیری ریشه."""
    errors = []
    if "ModuleRegistryService" not in content or "permissionMarkers" not in content:
        errors.append("استفاده از رجیستری ماژول‌ها (ModuleRegistryService) و permissionMarkers در تصمیم‌گیری روت ریشه یافت نشد.")
    return errors


def run_self_test():
    """اجرای خودآزمایی نگهبان ۳۵ روی فیکسچرهای متنی در حافظه."""
    print("=" * 74)
    print("🧪 اجرای خودآزمایی نگهبان ۳۵ (--self-test)...")
    print("=" * 74)

    redirect_lines = "\n".join([f"  {{ path: '{src}', redirectTo: '{dest}', pathMatch: 'full' }}," for src, dest in EXPECTED_LEGACY_REDIRECTS.items()])
    good_content = f"""
import {{ Routes }} from '@angular/router';
import {{ INSTALLED_MODULES }} from './modules/installed-modules';
import {{ ModuleRegistryService }} from './core/modules/module-registry.service';

const dynamicModuleRoutes: Routes = INSTALLED_MODULES.filter(m => typeof m.routes === 'function').map(m => ({{
  path: m.routePrefix,
  canMatch: [() => {{
    const reg = inject(ModuleRegistryService);
    return reg.isModuleInstalled(m.code);
  }}],
  loadChildren: m.routes!
}}));

export const routes: Routes = [
  ...dynamicModuleRoutes,
{redirect_lines}
  {{
    path: '',
    redirectTo: () => {{
      const reg = inject(ModuleRegistryService);
      const whMarkers = reg.permissionMarkers('warehouse');
      return 'app/launcher';
    }}
  }}
];
"""

    # ۱. فیکسچر معتبر
    if check_lazy_module_routes(good_content):
        print("❌ خودآزمایی شکست خورد: فیکسچر خوب در بررسی روت‌های ماژولار خطا داد.")
        return False
    if check_eager_component_imports(good_content):
        print("❌ خودآزمایی شکست خورد: فیکسچر خوب در بررسی ایمپورت مشتاق خطا داد.")
        return False
    if check_legacy_redirects(good_content):
        print("❌ خودآزمایی شکست خورد: فیکسچر خوب در بررسی ریدایرکت‌ها خطا داد.")
        return False
    if check_root_route_decision(good_content):
        print("❌ خودآزمایی شکست خورد: فیکسچر خوب در بررسی هدایت هوشمند ریشه خطا داد.")
        return False

    # ۲. فیکسچرهای معیوب روت‌های ماژولار
    bad_no_import = good_content.replace("import { INSTALLED_MODULES }", "// no import")
    bad_no_load_children = good_content.replace("loadChildren: m.routes!", "// no load children")
    bad_no_can_match = good_content.replace("reg.isModuleInstalled", "reg.otherFunc")
    if (
        not check_lazy_module_routes(bad_no_import)
        or not check_lazy_module_routes(bad_no_load_children)
        or not check_lazy_module_routes(bad_no_can_match)
    ):
        print("❌ خودآزمایی شکست خورد: فیکسچر بد روت‌های ماژولار تشخیص داده نشد.")
        return False

    # ۳. فیکسچر معیوب ایمپورت مشتاق
    bad_eager = good_content + "\nimport { CounterDashboard } from './counter';\n"
    if not check_eager_component_imports(bad_eager):
        print("❌ خودآزمایی شکست خورد: فیکسچر بد ایمپورت مشتاق تشخیص داده نشد.")
        return False

    # ۴. فیکسچر معیوب ریدایرکت‌ها
    bad_redirect_missing = good_content.replace("{ path: 'dashboard', redirectTo: 'app/warehouse/dashboard', pathMatch: 'full' },", "")
    bad_redirect_mismatch = good_content.replace(
        "{ path: 'dashboard', redirectTo: 'app/warehouse/dashboard', pathMatch: 'full' },",
        "{ path: 'dashboard', redirectTo: 'wrong/dest', pathMatch: 'full' },"
    )
    if not check_legacy_redirects(bad_redirect_missing) or not check_legacy_redirects(bad_redirect_mismatch):
        print("❌ خودآزمایی شکست خورد: فیکسچر بد ریدایرکت‌های قدیمی تشخیص داده نشد.")
        return False

    # ۵. فیکسچر معیوب تصمیم‌گیری ریشه
    bad_root = good_content.replace("permissionMarkers", "otherMarkers")
    if not check_root_route_decision(bad_root):
        print("❌ خودآزمایی شکست خورد: فیکسچر بد تصمیم‌گیری ریشه تشخیص داده نشد.")
        return False

    print("✅ تمام سناریوهای خودآزمایی نگهبان ۳۵ (پاس فیکسچر سالم و رد ۵ فیکسچر معیوب) با موفقیت اعتبارسنجی شدند.")
    return True


def test_route_matching():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۳۵: تطابق مسیرها، بارگذاری تنبل و ریدایرکت‌های Legacy (فاز ۶)")
    print("=" * 74)

    errors = []

    if not APP_ROUTES_TS.exists():
        print(f"❌ فایل {APP_ROUTES_TS} یافت نشد.")
        return False

    content = APP_ROUTES_TS.read_text(encoding="utf-8")

    # ۱. راستی‌آزمایی بارگذاری تنبل بر پایه INSTALLED_MODULES
    lazy_errors = check_lazy_module_routes(content)
    if lazy_errors:
        for err in lazy_errors:
            print(f"❌ {err}")
            errors.append(err)
    else:
        print("✅ بارگذاری تنبل (loadChildren: m.routes) و گارد canMatch با isModuleInstalled بر پایه INSTALLED_MODULES پیاده‌سازی شده است.")

    # ۲. راستی‌آزمایی حذف ایمپورت‌های مشتاق (Eager) کامپوننت‌های زیرمجموعه
    eager_errors = check_eager_component_imports(content)
    if eager_errors:
        for err in eager_errors:
            print(f"❌ {err}")
            errors.append(err)
    else:
        print("✅ کامپوننت‌های انبار و مالی از روت ریشه خارج شده و تنها در ماژول‌های تنبل خود لود می‌شوند.")

    # ۳. راستی‌آزمایی تک‌تک ریدایرکت‌های Legacy
    redirect_errors = check_legacy_redirects(content)
    if redirect_errors:
        for err in redirect_errors:
            print(f"❌ {err}")
            errors.append(err)
    else:
        print(f"✅ تمام {len(EXPECTED_LEGACY_REDIRECTS)} ریدایرکت Legacy به صورت ۱۰۰٪ دقیق و سالم حفظ شده‌اند.")

    # ۴. بررسی استفاده از moduleRegistry برای تصمیم‌گیری دسترسی ریشه
    root_errors = check_root_route_decision(content)
    if root_errors:
        for err in root_errors:
            print(f"❌ {err}")
            errors.append(err)
    else:
        print("✅ تصمیم‌گیری هدایت هوشمند ریشه بر پایه رجیستری ماژول‌ها و مجوزهای فعال تنظیم شده است.")

    if errors:
        print("=" * 74)
        print(f"❌ نگهبان ۳۵ شکست خورد با {len(errors)} خطا.")
        return False

    print("=" * 74)
    print("✨ نتیجه: نگهبان ۳۵ تایید شد (PASS) — تطابق روت‌ها و ریدایرکت‌ها کامل است ✨")
    print("=" * 74)
    return True


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        success = run_self_test()
    else:
        success = test_route_matching()
    sys.exit(0 if success else 1)
