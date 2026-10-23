#!/usr/bin/env python
"""
ایجنت نگهبان ۴۳ — پشتیبانی از کلمه عبور اولیه در UserSerializer بک‌اند (فاز ۱)
(Guardian 43 — Password Field in UserSerializer with Security Checks)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۱, نگهبان ۴۳

معیارهای سخت‌گیرانه آزمون:
  ۱) وجود فیلد `password` در تعریف `UserSerializer`.
  ۲) فیلد `password` باید الزماً `write_only=True` باشد (عدم افشای کلمه عبور در GET).
  ۳) وجود `'password'` در لیست `Meta.fields`.
  ۴) راستی‌آزمایی عدم وجود کلید `password` در خروجی سریالایزر (`to_representation`).
  ۵) دریافت `password` در `validated_data` در صورت ارسال در بدنه درخواست.
  ۶) تنظیم هش پسورد با `set_password` در صورت ارسال کلمه عبور اختصاصی.
  ۷) تنظیم کلمه عبور پیش‌فرض `123456` در صورت عدم ارسال پسورد.
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
BACKEND_DIR = REPO_ROOT / "backend"


def test_users_password_initial():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۴۳: پشتیبانی از کلمه عبور در UserSerializer (فاز ۱)")
    print("=" * 74)

    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))
    import backend_paths
    backend_paths.install()

    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
    import django
    django.setup()

    from accounts.serializers import UserSerializer
    from accounts.models import CustomUser

    serializer = UserSerializer()

    # ۱. وجود فیلد password در فیلدهای سریالایزر
    assert 'password' in serializer.fields, "فیلد password در فیلدهای UserSerializer یافت نشد."
    print("✅ بند ۱: فیلد password در UserSerializer تعریف شده است.")

    # ۲. خاصیت write_only
    pwd_field = serializer.fields['password']
    assert pwd_field.write_only is True, "فیلد password باید الزماً write_only=True باشد."
    print("✅ بند ۲: ویژگی write_only=True برای فیلد password تایید شد.")

    # ۳. وجود در Meta.fields
    assert 'password' in UserSerializer.Meta.fields, "فیلد password باید در Meta.fields قید شود."
    print("✅ بند ۳: فیلد password در Meta.fields درج شده است.")

    # ۴. عدم افشای پسورد در خواندن (Representation)
    dummy_user = CustomUser(id=9999, username="test_guard_sec", first_name="تست", last_name="نگهبان")
    dummy_user.set_password("MySuperSecret123")
    rep = serializer.to_representation(dummy_user)
    assert 'password' not in rep, "کلمه عبور نباید در خروجی سریالایزر (GET) افشا شود!"
    print("✅ بند ۴: عدم افشای کلمه عبور در خروجی سریالایزر (GET) اثبات شد.")

    # ۵. دیسریالایزیشن با پسورد
    data_with_pwd = {
        'username': 'guard_test_new',
        'first_name': 'رضا',
        'last_name': 'احمدی',
        'phone_number': '09121112233',
        'password': 'CustomPassword@2026'
    }
    ser_in = UserSerializer(data=data_with_pwd)
    assert ser_in.is_valid(), f"اعتبارسنجی شکست خورد: {ser_in.errors}"
    assert 'password' in ser_in.validated_data, "فیلد password باید در validated_data موجود باشد."
    assert ser_in.validated_data['password'] == 'CustomPassword@2026'
    print("✅ بند ۵: کلمه عبور اختصاصی با موفقیت در validated_data دریافت شد.")

    # ۶. راستی‌آزمایی رفتار ایجاد در دیتابیس با پسورد اختصاصی
    # به جای ذخیره دائمی، رفتار متد create را با یک شی موقت بررسی می‌کنیم
    try:
        from django.db import transaction
        with transaction.atomic():
            created_user = ser_in.save()
            assert created_user.check_password('CustomPassword@2026'), "رمز عبور ایجادشده با CustomPassword@2026 مطابقت ندارد!"
            print("✅ بند ۶: اعمال موفقیت‌آمیز هش رمز عبور اختصاصی با check_password تایید شد.")
            transaction.set_rollback(True)
    except Exception as e:
        print(f"❌ خطا در ایجاد کاربر با رمز اختصاصی: {e}")
        return False

    # ۷. راستی‌آزمایی رفتار کلمه عبور پیش‌فرض 123456
    data_without_pwd = {
        'username': 'guard_test_default',
        'first_name': 'سارا',
        'last_name': 'کریمی',
        'phone_number': '09123334455'
    }
    ser_default = UserSerializer(data=data_without_pwd)
    assert ser_default.is_valid(), f"اعتبارسنجی پیش‌فرض شکست خورد: {ser_default.errors}"
    try:
        from django.db import transaction
        with transaction.atomic():
            default_user = ser_default.save()
            assert default_user.check_password('123456'), "در صورت عدم ارسال رمز، رمز پیش‌فرض باید 123456 باشد."
            assert default_user.requires_password_change is True, "کاربر با رمز پیش‌فرض باید requires_password_change=True باشد."
            print("✅ بند ۷: اعمال رمز پیش‌فرض ۱۲۳۴۵۶ و قفل requires_password_change تایید شد.")
            transaction.set_rollback(True)
    except Exception as e:
        print(f"❌ خطا در ایجاد کاربر با رمز پیش‌فرض: {e}")
        return False

    print("\n🎉 ایجنت نگهبان ۴۳: تمامی آزمون‌های کلمه عبور با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_users_password_initial()
    sys.exit(0 if success else 1)
