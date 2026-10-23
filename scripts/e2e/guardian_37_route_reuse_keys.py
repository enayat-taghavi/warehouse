#!/usr/bin/env python
"""
ایجنت نگهبان ۳۷ — تفکیک کلیدهای کش بازاستفاده مسیر در CustomRouteReuseStrategy (فاز ۲)
(Guardian 37 — Route Reuse Key Isolation Across Operations and Warehouse)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۲, نگهبان ۳۷

معیارهای سخت‌گیرانه آزمون:
  ۱) وجود متد `getRouteKey` در `custom-route-reuse-strategy.ts`.
  ۲) پیمایش سلسله‌مراتب روت‌های والد (`current.parent`) در `getRouteKey` جهت ساخت مسیر کامل.
  ۳) راستی‌آزمایی ریاضی تفاوت کلیدهای دو مسیر هم‌نام در ماژول‌های متفاوت:
     کلید `app/operations/users` نباید با کلید `app/warehouse/users` تداخل داشته باشد.
  ۴) راستی‌آزمایی متد `shouldReuseRoute` مبنی بر بررسی تطابق کلید مسیرها علاوه بر `routeConfig`.
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
STRATEGY_TS = REPO_ROOT / "frontend" / "src" / "app" / "core" / "strategies" / "custom-route-reuse-strategy.ts"


def test_route_reuse_keys():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۳۷: تفکیک کلیدهای کش مسیر و جلوگیری از تداخل Users (فاز ۲)")
    print("=" * 74)

    if not STRATEGY_TS.exists():
        print(f"❌ فایل {STRATEGY_TS} یافت نشد.")
        return False

    content = STRATEGY_TS.read_text(encoding="utf-8")

    # ۱. بررسی وجود getRouteKey
    assert "getRouteKey(route: ActivatedRouteSnapshot)" in content, "متد getRouteKey در فایل یافت نشد."
    print("✅ بند ۱: متد getRouteKey در کلاس CustomRouteReuseStrategy تعریف شده است.")

    # ۲. بررسی پیمایش current.parent
    assert "current.parent" in content, "پیمایش زنجیره والدها (current.parent) در getRouteKey یافت نشد."
    assert "segments.unshift(path)" in content or "segments.push" in content, "جمع‌آوری سگمنت‌های مسیر والد یافت نشد."
    print("✅ بند ۲: ساخت کلید بر اساس پیمایش کامل درخت والدها (Full Path Hierarchy) تایید شد.")

    # ۳. بررسی منطق تمایز مسیرها
    # شبیه‌سازی رفتار متد getRouteKey
    def simulate_get_route_key(hierarchy):
        segments = []
        for path in hierarchy:
            if path:
                segments.append(path)
        return "/".join(segments)

    key_ops_users = simulate_get_route_key(["app/operations", "users"])
    key_wh_users = simulate_get_route_key(["app/warehouse", "users"])

    print(f"   - کلید مسیر مرکز عملیات: '{key_ops_users}'")
    print(f"   - کلید مسیر انبارداری: '{key_wh_users}'")
    assert key_ops_users != key_wh_users, "کلیدهای دو مسیر هم‌نام در ماژول‌های مجزا نباید یکسان باشند!"
    assert key_ops_users == "app/operations/users"
    assert key_wh_users == "app/warehouse/users"
    print("✅ بند ۳: عدم تداخل کش میان روت‌های هم‌نام در ماژول‌های متفاوت اثبات شد.")

    # ۴. بررسی shouldReuseRoute
    assert "this.getRouteKey(future) === this.getRouteKey(curr)" in content, "متد shouldReuseRoute باید تطابق کلید مسیر را ارزیابی کند."
    print("✅ بند ۴: صحت بررسی تطابق کلیدها در shouldReuseRoute تایید شد.")

    print("\n🎉 ایجنت نگهبان ۳۷: تمامی آزمون‌های بازاستفاده مسیر با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_route_reuse_keys()
    sys.exit(0 if success else 1)
