#!/usr/bin/env python
"""
ایجنت نگهبان ۳۹ — رندر تدریجی (Chunking) لیست کاربران بدون CDK (فاز ۳)
(Guardian 39 — Progressive Chunked Rendering of Users List)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۳, نگهبان ۳۹

معیارهای سخت‌گیرانه آزمون:
  ۱) وجود متغیرهای `pageSize` و `visibleCount` روی کامپوننت `Users`.
  ۲) وجود گتر `displayedUsers` جهت برش آرایه به میزان `visibleCount`.
  ۳) وجود متد `loadMoreUsers()` جهت افزایش تدریجی کارت‌های نمایش‌داده‌شده در DOM.
  ۴) استفاده از `displayedUsers` در حلقه `*ngFor` به جای کل آرایه در `users.html`.
  ۵) وجود دکمه/بخش کنترل «نمایش پرسنل بیشتر» در تمپلیت.
  ۶) عدم وابستگی به پکیج سنگین `@angular/cdk`.
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
USERS_HTML = FRONT_DIR / "src" / "app" / "modules" / "common" / "components" / "users" / "users.html"
PACKAGE_JSON = FRONT_DIR / "package.json"


def test_users_chunked_list():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۳۹: رندر تدریجی (Chunking) لیست کاربران (فاز ۳)")
    print("=" * 74)

    if not USERS_TS.exists() or not USERS_HTML.exists():
        print("❌ فایل‌های کامپوننت Users یافت نشدند.")
        return False

    ts_content = USERS_TS.read_text(encoding="utf-8")
    html_content = USERS_HTML.read_text(encoding="utf-8")

    # ۱. متغیرهای state
    assert "pageSize" in ts_content and "visibleCount" in ts_content, "متغیرهای pageSize یا visibleCount در users.ts یافت نشد."
    print("✅ بند ۱: متغیرهای کنترل تکه‌ها (pageSize, visibleCount) تایید شدند.")

    # ۲. گتر displayedUsers
    assert "get displayedUsers" in ts_content, "گتر displayedUsers در users.ts یافت نشد."
    assert ".slice(0, this.visibleCount)" in ts_content, "برش آرایه در displayedUsers به درستی انجام نشده است."
    print("✅ بند ۲: گتر displayedUsers با برش امن آرایه تایید شد.")

    # ۳. متد loadMoreUsers
    assert "loadMoreUsers()" in ts_content, "متد loadMoreUsers در users.ts یافت نشد."
    print("✅ بند ۳: متد افزایش تدریجی کارت‌ها (loadMoreUsers) تایید شد.")

    # ۴. استفاده در HTML
    assert "*ngFor=\"let u of displayedUsers" in html_content, "حلقه ngFor در تمپلیت باید روی displayedUsers پیمایش کند."
    print("✅ بند ۴: رندر DOM منحصراً محدود به displayedUsers است.")

    # ۵. دکمه لود بیشتر
    assert "loadMoreUsers()" in html_content and "نمایش پرسنل بیشتر" in html_content, "دکمه یا المان بارگذاری بیشتر در تمپلیت یافت نشد."
    print("✅ بند ۵: بخش تعاملی بارگذاری تدریجی در تمپلیت تایید شد.")

    # ۶. عدم تحمیل CDK
    pkg_content = PACKAGE_JSON.read_text(encoding="utf-8")
    assert "@angular/cdk" not in pkg_content, "پکیج @angular/cdk نباید بدون ضرورت به پروژه تحمیل شده باشد."
    print("✅ بند ۶: عدم وابستگی به @angular/cdk و حفظ سبکی باندل تایید شد.")

    print("\n🎉 ایجنت نگهبان ۳۹: تمامی آزمون‌های رندر تدریجی کاربران با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_users_chunked_list()
    sys.exit(0 if success else 1)
