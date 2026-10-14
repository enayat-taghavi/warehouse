#!/usr/bin/env python
"""
ایجنت نگهبان ۴۱ — اعتبارسنجی الگوریتمی و چک‌سام کد ملی در UserSerializer (فاز ۱)
(Guardian 41 — National Code Checksum and Format Validation in UserSerializer)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۱, نگهبان ۴۱

معیارهای سخت‌گیرانه آزمون:
  ۱) وجود متد `validate_national_code` روی کلاس `UserSerializer`.
  ۲) پذیرش کد ملی‌های معتبر استاندارد (مانند ۴۲۵۱۲۴۷۴۴۲) و بازگرداندن ۱۰ رقم تمیز.
  ۳) نرمال‌سازی ارقام فارسی و عربی به ارقام استاندارد انگلیسی.
  ۴) رد کدهای ملی با طول نامعتبر (کمتر یا بیشتر از ۱۰ رقم).
  ۵) رد کدهای با ارقام کاملاً تکراری (مانند ۱۱۱۱۱۱۱۱۱۱).
  ۶) رد کدهای نامعتبر بر اساس الگوریتم مانده تقسیم بر ۱۱ (چک‌سام معتبر ایران).
  ۷) بازگرداندن `None` برای ورودی خالی یا `None` بدون خطا (فیلد اختیاری است).
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
BACKEND_DIR = REPO_ROOT / "warehouse-backend"


def test_national_code_checksum():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۴۱: اعتبارسنجی الگوریتمی چک‌سام کد ملی (فاز ۱)")
    print("=" * 74)

    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))
    import backend_paths
    backend_paths.install()

    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
    import django
    django.setup()

    from accounts.serializers import UserSerializer
    from rest_framework.exceptions import ValidationError

    serializer = UserSerializer()

    # ۱. بررسی وجود متد
    assert hasattr(serializer, 'validate_national_code'), "متد validate_national_code در UserSerializer یافت نشد."
    print("✅ بند ۱: متد validate_national_code روی UserSerializer موجود است.")

    # ۲. کد ملی معتبر انگلیسی
    valid_code_en = "4251247442"
    result = serializer.validate_national_code(valid_code_en)
    assert result == "4251247442", f"انتظار '4251247442' ولی دریافت شد: {result}"
    print(f"✅ بند ۲: کد ملی معتبر ({valid_code_en}) با موفقیت تایید شد.")

    # ۳. نرمال‌سازی ارقام فارسی
    valid_code_fa = "۴۲۵۱۲۴۷۴۴۲"
    result_fa = serializer.validate_national_code(valid_code_fa)
    assert result_fa == "4251247442", f"انتظار تبدیل ارقام فارسی به '4251247442' ولی دریافت شد: {result_fa}"
    print(f"✅ بند ۳: نرمال‌سازی ارقام فارسی ({valid_code_fa} -> {result_fa}) تایید شد.")

    # ۴. رد طول نامعتبر
    invalid_lengths = ["12345", "1234567890123"]
    for code in invalid_lengths:
        try:
            serializer.validate_national_code(code)
            print(f"❌ خطای امنیتی: کد با طول نامعتبر {code} رد نشد!")
            return False
        except ValidationError:
            pass
    print("✅ بند ۴: کدهای با طول نامعتبر با موفقیت رد شدند.")

    # ۵. رد ارقام کاملاً تکراری
    identical_codes = ["1111111111", "2222222222", "9999999999", "۰۰۰۰۰۰۰۰۰۰"]
    for code in identical_codes:
        try:
            serializer.validate_national_code(code)
            print(f"❌ خطای امنیتی: کد با ارقام تکراری {code} رد نشد!")
            return False
        except ValidationError:
            pass
    print("✅ بند ۵: کدهای با ارقام تکراری با موفقیت مسدود شدند.")

    # ۶. رد کدهای نامعتبر طبق الگوریتم چک‌سام
    invalid_checksums = ["1234567890", "0010000009", "1112223334"]
    for code in invalid_checksums:
        try:
            serializer.validate_national_code(code)
            print(f"❌ خطای امنیتی: کد با چک‌سام نادرست {code} رد نشد!")
            return False
        except ValidationError:
            pass
    print("✅ بند ۶: کدهای نامعتبر بر اساس الگوریتم تقسیم بر ۱۱ به درستی رد شدند.")

    # ۷. رفتار ورودی خالی و None
    assert serializer.validate_national_code(None) is None, "مقدار None باید None برگرداند."
    assert serializer.validate_national_code("") is None, "رشته خالی باید None برگرداند."
    assert serializer.validate_national_code("   ") is None, "رشته فضاهای خالی باید None برگرداند."
    print("✅ بند ۷: رفتار اختیاری بودن فیلد (None/Empty) بدون خطا تایید شد.")

    print("\n🎉 ایجنت نگهبان ۴۱: تمامی آزمون‌های اعتبارسنجی کد ملی با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_national_code_checksum()
    sys.exit(0 if success else 1)
