#!/usr/bin/env python
"""
ایجنت نگهبان ۵۱ — حذف فیلدهای موهومی و ساختگی انقضای حساب کاربری (فاز ۳)
(Guardian 51 — Removal of Phantom Expiry Date Controls from User Form)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۳, نگهبان ۵۱

معیارهای سخت‌گیرانه آزمون:
  ۱) حذف کامل چک‌باکس و فیلد `isDefaultExpiry` از `users.ts` و `users.html`.
  ۲) حذف کامل فیلد `expiryDays` از `userForm` در `users.ts` و `users.html`.
  ۳) حذف فیلد `expiry_date` از `userForm` در `users.ts`.
  ۴) عدم وجود متن‌های «انقضای پیش‌فرض (۳ ماهه)» یا «یا اعتبار به روز» در تمپلیت HTML.
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


def test_users_expiry_cleanup():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۵۱: پاک‌سازی فیلدهای موهومی انقضای حساب کاربری (فاز ۳)")
    print("=" * 74)

    if not USERS_TS.exists() or not USERS_HTML.exists():
        print("❌ فایل‌های Users یافت نشدند.")
        return False

    ts_content = USERS_TS.read_text(encoding="utf-8")
    html_content = USERS_HTML.read_text(encoding="utf-8")

    # ۱. عدم وجود isDefaultExpiry
    assert "isDefaultExpiry" not in ts_content, "متغیر موهومی isDefaultExpiry هنوز در users.ts وجود دارد!"
    assert "isDefaultExpiry" not in html_content, "فیلد موهومی isDefaultExpiry هنوز در users.html وجود دارد!"
    print("✅ بند ۱: حذف کامل چک‌باکس موهومی isDefaultExpiry تایید شد.")

    # ۲. عدم وجود expiryDays
    assert "expiryDays" not in ts_content, "فیلد ساختگی expiryDays هنوز در users.ts وجود دارد!"
    assert "expiryDays" not in html_content, "فیلد ساختگی expiryDays هنوز در users.html وجود دارد!"
    print("✅ بند ۲: حذف کامل فیلد ساختگی expiryDays تایید شد.")

    # ۳. عدم وجود expiry_date
    assert "expiry_date" not in ts_content, "فیلد موهومی expiry_date هنوز در userForm وجود دارد!"
    print("✅ بند ۳: حذف فیلد موهومی expiry_date از شیء فرم تایید شد.")

    # ۴. عدم وجود متن‌های فارسی مرتبط در تمپلیت
    assert "انقضای پیش‌فرض" not in html_content, "متن انقضای پیش‌فرض هنوز در تمپلیت وجود دارد!"
    assert "یا اعتبار به روز" not in html_content, "متن اعتبار به روز هنوز در تمپلیت وجود دارد!"
    print("✅ بند ۴: پاک‌سازی قطعی متون و اینپوت‌های ساختگی از رابط کاربری تایید شد.")

    print("\n🎉 ایجنت نگهبان ۵۱: تمامی آزمون‌های پاک‌سازی فیلد انقضا با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_users_expiry_cleanup()
    sys.exit(0 if success else 1)
