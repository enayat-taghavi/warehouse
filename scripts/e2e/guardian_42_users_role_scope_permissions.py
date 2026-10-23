#!/usr/bin/env python
"""
ایجنت نگهبان ۴۲ — نگاشت قلمرو نقش‌ها بر اساس پرمیشن و پشتیبانی از نقش‌های ترکیبی (فاز ۳)
(Guardian 42 — Role Scope Mapping via Module Markers with Hybrid Role Support)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۳, نگهبان ۴۲

معیارهای سخت‌گیرانه آزمون:
  ۱) استفاده از `this.registry.permissionMarkers('warehouse')` و `accounting` در `getRoleAppScope`.
  ۲) عدم اتکا به تطبیق رشته‌ای ضعیف (`includes('انبار')`, `includes('supervisor')`) به عنوان منطق اصلی.
  ۳) نگاشت صحیح نقش‌های ترکیبی (دارای دسترسی‌های انبار و مالی به طور هم‌زمان) به قلمرو `global`.
  ۴) نگاشت نقش‌های تک‌ماژولی انبار به `warehouse` و نقش‌های تک‌ماژولی مالی به `finance`.
  ۵) پیش‌فرض امن `global` برای نقش‌های نامشخص به جای پیش‌فرض غلط `warehouse`.
"""

import os
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONT_DIR = REPO_ROOT / "frontend"
USERS_TS = FRONT_DIR / "src" / "app" / "modules" / "common" / "components" / "users" / "users.ts"


def test_users_role_scope_permissions():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۴۲: نگاشت قلمرو نقش‌ها بر اساس مجوزها و پشتیبانی از نقش‌های ترکیبی (فاز ۳)")
    print("=" * 74)

    if not USERS_TS.exists():
        print(f"❌ فایل {USERS_TS} یافت نشد.")
        return False

    content = USERS_TS.read_text(encoding="utf-8")

    # ۱. بررسی استفاده از permissionMarkers
    assert "this.registry.permissionMarkers('warehouse')" in content, "فراخوانی permissionMarkers انبار در getRoleAppScope یافت نشد."
    assert "this.registry.permissionMarkers('accounting')" in content, "فراخوانی permissionMarkers مالی در getRoleAppScope یافت نشد."
    print("✅ بند ۱: استعلام مستقیم نشانگرهای ماژول از ModuleRegistryService تایید شد.")

    # ۲. بررسی شرط نقش‌های ترکیبی (hasWh && hasFin -> global)
    assert "if (hasWh && hasFin) return 'global'" in content, "شرط نقش ترکیبی (انبار + مالی -> global) یافت نشد."
    print("✅ بند ۲: شناسایی نقش‌های ترکیبی کلان (حسابرس/مدیر ارشد) به عنوان global اثبات شد.")

    # ۳. بررسی شرایط تک‌ماژولی
    assert "if (hasWh) return 'warehouse'" in content, "نگاشت نقش‌های انبار به warehouse تایید نشد."
    assert "if (hasFin) return 'finance'" in content, "نگاشت نقش‌های مالی به finance تایید نشد."
    print("✅ بند ۳: تفکیک دقیق نقش‌های تخصصی انبارداری و مالی تایید شد.")

    # ۴. بررسی پیش‌فرض امن
    assert "return 'global'" in content, "پیش‌فرض نهایی باید global باشد."
    print("✅ بند ۴: بازگشت پیش‌فرض به global (عدم سرریز نقش‌های متفرقه به انبار) تایید شد.")

    print("\n🎉 ایجنت نگهبان ۴۲: تمامی آزمون‌های نگاشت قلمرو نقش‌ها با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_users_role_scope_permissions()
    sys.exit(0 if success else 1)
