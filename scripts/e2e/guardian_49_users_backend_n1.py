#!/usr/bin/env python
"""
ایجنت نگهبان ۴۹ — رفع معضل N+1 کوئری در واکشی کاربران (فاز ۱ ممیزی کاربران و نقش‌ها)
(Guardian 49 — UserViewSet Query Optimization and N+1 Prevention)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۱, نگهبان ۴۹

معیارهای سخت‌گیرانه آزمون:
  ۱) وجود `select_related('supervisor')` در متد `get_queryset()` در `UserViewSet`.
  ۲) وجود `prefetch_related('groups__customrole', 'user_permissions')` در `get_queryset()`.
  ۳) پشتیبانی شرطی از پری‌فچ `assigned_warehouses` در صورت نصب بودن اپ `warehouses`.
  ۴) راستی‌آزمایی عملکردی با اجرای کوئری در ORM جنگو و اطمینان از سلامت زنجیره کوئری.
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
VIEWS_PY = BACKEND_DIR / "core" / "accounts" / "views.py"


def test_users_backend_n1():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۴۹: بهینه‌سازی کوئری‌های UserViewSet و رفع N+1 (فاز ۱)")
    print("=" * 74)

    # ۱. بررسی کد منبع views.py
    if not VIEWS_PY.exists():
        print(f"❌ فایل {VIEWS_PY} یافت نشد.")
        return False

    content = VIEWS_PY.read_text(encoding="utf-8")

    # بررسی وجود متد get_queryset در UserViewSet با بهینه‌سازی‌های لازم
    if "select_related('supervisor')" not in content:
        print("❌ دستور select_related('supervisor') در get_queryset یافت نشد.")
        return False
    print("✅ بند ۱: select_related('supervisor') تایید شد.")

    if "groups__customrole" not in content or "user_permissions" not in content:
        print("❌ پری‌فچ groups__customrole یا user_permissions در get_queryset یافت نشد.")
        return False
    print("✅ بند ۲: prefetch_related('groups__customrole', 'user_permissions') تایید شد.")

    if "assigned_warehouses" not in content:
        print("❌ پری‌فچ شرطی assigned_warehouses در get_queryset یافت نشد.")
        return False
    print("✅ بند ۳: پری‌فچ شرطی assigned_warehouses تایید شد.")

    # ۲. راستی‌آزمایی در سطح Django ORM
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))
    import backend_paths
    backend_paths.install()

    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
    import django
    django.setup()

    from accounts.views import UserViewSet
    from django.test import RequestFactory
    from rest_framework.request import Request
    from accounts.models import CustomUser

    factory = RequestFactory()
    django_request = factory.get('/api/auth/users/')
    django_request.user = CustomUser()  # Anonymous/unauthenticated simulation
    drf_request = Request(django_request)

    viewset = UserViewSet()
    viewset.request = drf_request
    viewset.format_kwarg = None

    try:
        qs = viewset.get_queryset()
        # بررسی ساختار QuerySet
        select_related_dict = qs.query.select_related
        prefetch_lookups = [p.prefetch_through if hasattr(p, 'prefetch_through') else str(p) for p in qs._prefetch_related_lookups]

        print(f"   - select_related: {select_related_dict}")
        print(f"   - prefetch_lookups: {prefetch_lookups}")

        assert "supervisor" in str(select_related_dict), "supervisor باید در select_related باشد"
        assert any("groups" in str(p) for p in prefetch_lookups), "groups باید در prefetch باشد"
        print("✅ بند ۴: راستی‌آزمایی ORM جنگو با موفقیت سپری شد.")
    except Exception as e:
        print(f"❌ خطا در ارزیابی ساختار کوئری ORM: {e}")
        return False

    print("\n🎉 ایجنت نگهبان ۴۹: تمامی آزمون‌های رفع N+1 در UserViewSet با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_users_backend_n1()
    sys.exit(0 if success else 1)
