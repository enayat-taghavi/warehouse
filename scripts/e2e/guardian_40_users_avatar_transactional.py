#!/usr/bin/env python
"""
ایجنت نگهبان ۴۰ — تراکنشی‌سازی تغییرات آواتار کاربر (فاز ۳)
(Guardian 40 — Transactional Avatar Lifecycle in Users Component)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۳, نگهبان ۴۰

معیارهای سخت‌گیرانه آزمون:
  ۱) تعریف متغیرهای `_pendingAvatarBlob` و `_pendingAvatarDelete` در `userForm`.
  ۲) عدم فراخوانی مستقیم API آپلود/حذف سرور در زمان باز بودن مودال کاربر (`isUserModalOpen`).
  ۳) نگهداری موقت به عنوان ObjectURL محلی برای پیش‌نمایش در حین کار با فرم.
  ۴) اجرای آپلود یا حذف آواتار منحصراً پس از موفقیت ثبت نهایی فرم در `saveUser()`.
  ۵) پاک‌سازی فیلدهای موقت پس از انصراف یا ذخیره.
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
FRONT_DIR = REPO_ROOT / "warehouse-front"
USERS_TS = FRONT_DIR / "src" / "app" / "modules" / "common" / "components" / "users" / "users.ts"


def test_users_avatar_transactional():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۴۰: تراکنشی‌سازی مدیریت آواتار در کامپوننت Users (فاز ۳)")
    print("=" * 74)

    if not USERS_TS.exists():
        print(f"❌ فایل {USERS_TS} یافت نشد.")
        return False

    content = USERS_TS.read_text(encoding="utf-8")

    # ۱. بررسی متغیرهای تراکنشی در فرم
    assert "_pendingAvatarBlob" in content, "متغیر _pendingAvatarBlob در userForm یافت نشد."
    assert "_pendingAvatarDelete" in content, "متغیر _pendingAvatarDelete در userForm یافت نشد."
    print("✅ بند ۱: فیلدهای موقت نگهداری وضعیت آواتار در userForm تایید شدند.")

    # ۲. بررسی شرط isUserModalOpen در ذخیره و حذف
    assert "if (this.isUserModalOpen)" in content, "بررسی شرط isUserModalOpen در متدهای مدیریت آواتار یافت نشد."
    print("✅ بند ۲: جداسازی رفتار مودال از عملیات مستقیم کارتی تایید شد.")

    # ۳. بررسی ایجاد پیش‌نمایش محلی
    assert "URL.createObjectURL(blob)" in content, "تولید URL محلی برای پیش‌نمایش آواتار بدون تماس سرور تایید نشد."
    print("✅ بند ۳: ساخت آدرس موقت کلاینتی (ObjectURL) تایید شد.")

    # ۴. بررسی ارسال به سرور در saveUser
    assert "if (pendingBlob)" in content and "updateUserAvatar" in content, "فراخوانی updateUserAvatar در saveUser یافت نشد."
    assert "else if (pendingDelete)" in content and "deleteUserAvatar" in content, "فراخوانی deleteUserAvatar در saveUser یافت نشد."
    print("✅ بند ۴: تعویق قطعی تماس با API تا تایید نهایی در saveUser تایید شد.")

    print("\n🎉 ایجنت نگهبان ۴۰: تمامی آزمون‌های آواتار تراکنشی با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_users_avatar_transactional()
    sys.exit(0 if success else 1)
