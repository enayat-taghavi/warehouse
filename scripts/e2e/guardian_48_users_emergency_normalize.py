#!/usr/bin/env python
"""
ایجنت نگهبان ۴۸ — نرمال‌سازی ارقام فارسی در تماس اضطراری و فیلدهای کاربر (فاز ۳)
(Guardian 48 — Persian Digits Normalization for Emergency Contact and National Code)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۳, نگهبان ۴۸

معیارهای سخت‌گیرانه آزمون:
  ۱) استفاده از `normalizeDigits` روی فیلد `emergency_contact` در `saveUser()`.
  ۲) استفاده از `normalizeDigits` روی `national_code` در `saveUser()`.
  ۳) فراخوانی `validateNationalCode` پیش از ارسال فرم و مسدودسازی ارقام نامعتبر.
  ۴) انتساب مقادیر پاکسازی‌شده به فیلدهای `payload`.
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


def test_users_emergency_normalize():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۴۸: نرمال‌سازی ارقام فارسی و اعتبارسنجی ورودی‌های کاربر (فاز ۳)")
    print("=" * 74)

    if not USERS_TS.exists():
        print(f"❌ فایل {USERS_TS} یافت نشد.")
        return False

    content = USERS_TS.read_text(encoding="utf-8")

    # ۱. نرمال‌سازی تماس اضطراری
    assert "let emergency = normalizeDigits(this.userForm.emergency_contact);" in content, "نرمال‌سازی ارقام تماس اضطراری یافت نشد."
    print("✅ بند ۱: نرمال‌سازی ارقام فارسی تماس اضطراری تایید شد.")

    # ۲. نرمال‌سازی کد ملی
    assert "let nid = normalizeDigits(this.userForm.national_code);" in content, "نرمال‌سازی ارقام کد ملی یافت نشد."
    print("✅ بند ۲: پاک‌سازی ارقام فارسی کد ملی تایید شد.")

    # ۳. اعتبارسنجی چک‌سام
    assert "this.validateNationalCode(nid)" in content, "اعتبارسنجی چک‌سام کد ملی در فرانت پیش از ارسال تایید نشد."
    print("✅ بند ۳: اعتبارسنجی کد ملی با الگوریتم استاندارد پیش از ارسال تایید شد.")

    # ۴. انتساب به payload
    assert "payload.emergency_contact = emergency" in content, "انتساب مقدار نرمال‌شده تماس اضطراری به payload یافت نشد."
    assert "payload.national_code = nid" in content, "انتساب مقدار نرمال‌شده کد ملی به payload یافت نشد."
    print("✅ بند ۴: ارسال مقادیر استاندارد و پاکسازی‌شده در پی‌لود تایید شد.")

    print("\n🎉 ایجنت نگهبان ۴۸: تمامی آزمون‌های نرمال‌سازی و اعتبارسنجی با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_users_emergency_normalize()
    sys.exit(0 if success else 1)
