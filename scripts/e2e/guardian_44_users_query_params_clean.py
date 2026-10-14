#!/usr/bin/env python
"""
ایجنت نگهبان ۴۴ — پاک‌سازی تاریخچه مرورگر و عدم آلودگی QueryParams با مودال‌ها (فاز ۲)
(Guardian 44 — Browser History and QueryParams Hygiene in Users Component)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۲, نگهبان ۴۴

معیارهای سخت‌گیرانه آزمون:
  ۱) عدم انتشار وضعیت تب‌های داخلی مودال نقش‌ها (`permTab`) به `queryParams` مرورگر در `switchPermTab`.
  ۲) مدیریت `activePermTab` به صورت State محلی کامپوننت بدون آلوده کردن URL.
  ۳) عدم وابستگی مقداردهی اولیه `activePermTab` به پارامترهای آدرس در `ngOnInit`.
  ۴) تصحیح آدرس `deleteImpactUrl` در `deleteRole` و `deleteUser` جهت استفاده از `environment.apiUrl`.
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
FRONT_DIR = REPO_ROOT / "warehouse-front"
USERS_TS = FRONT_DIR / "src" / "app" / "modules" / "common" / "components" / "users" / "users.ts"


def test_users_query_params_clean():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۴۴: پاک‌سازی تاریخچه مرورگر و پارامترهای مودال (فاز ۲)")
    print("=" * 74)

    if not USERS_TS.exists():
        print(f"❌ فایل {USERS_TS} یافت نشد.")
        return False

    content = USERS_TS.read_text(encoding="utf-8")

    # ۱. بررسی متد switchPermTab
    match = re.search(r"switchPermTab\s*\([^)]*\)\s*\{([^}]+)\}", content)
    assert match, "متد switchPermTab در users.ts یافت نشد."
    body = match.group(1)

    assert "router.navigate" not in body, "متد switchPermTab نباید router.navigate را فراخوانی کند!"
    assert "permTab" not in body or "this.activePermTab = tab" in body, "متد switchPermTab باید فقط استیت محلی را تغییر دهد."
    print("✅ بند ۱: عدم پوش permTab به URL مرورگر در switchPermTab تایید شد.")

    # ۲. بررسی ngOnInit
    ng_match = re.search(r"ngOnInit\s*\([^)]*\)\s*\{([\s\S]*?)loadData\(\);", content)
    assert ng_match, "متد ngOnInit در users.ts یافت نشد."
    ng_body = ng_match.group(1)

    assert "params['permTab']" not in ng_body, "پارامتر permTab نباید از queryParams دریافت شود."
    print("✅ بند ۲: حذف آلودگی permTab از چرخه دریافت queryParams در ngOnInit تایید شد.")

    # ۳. بررسی deleteImpactUrl
    assert "environment.apiUrl" in content, "متغیر محیطی environment.apiUrl باید در فایل ایمپورت و استفاده شده باشد."
    assert "`/api/auth/roles/" not in content, "آدرس هاردکد /api/auth/roles/ نباید وجود داشته باشد."
    assert "`/api/auth/users/" not in content, "آدرس هاردکد /api/auth/users/ نباید وجود داشته باشد."
    assert "${environment.apiUrl}/auth/roles/" in content, "آدرس deleteImpactUrl برای نقش‌ها باید مبتنی بر environment.apiUrl باشد."
    assert "${environment.apiUrl}/auth/users/" in content, "آدرس deleteImpactUrl برای کاربران باید مبتنی بر environment.apiUrl باشد."
    print("✅ بند ۳: اتصال پویا و استاندارد deleteImpactUrl به environment.apiUrl تایید شد.")

    print("\n🎉 ایجنت نگهبان ۴۴: تمامی آزمون‌های پاک‌سازی آدرس و تاریخچه با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_users_query_params_clean()
    sys.exit(0 if success else 1)
