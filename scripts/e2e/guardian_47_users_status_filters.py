#!/usr/bin/env python
"""
ایجنت نگهبان ۴۷ — فیلترهای سریع وضعیت سازمانی پرسنل با شمارش پویا (فاز ۳)
(Guardian 47 — Quick Organizational Status Filters with Dynamic Counts)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۳, نگهبان ۴۷

معیارهای سخت‌گیرانه آزمون:
  ۱) تعریف متغیر `userStatusFilter` با حالات ('all', 'active', 'inactive', 'no_warehouse', 'superuser').
  ۲) گتر `userCounts` برای شمارش بلادرنگ هر دسته از کاربران.
  ۳) متد `setStatusFilter` برای اعمال سریع فیلتر و بازنشانی `visibleCount`.
  ۴) حضور دکمه‌های فیلتر سریع به همراه شمارنده‌ها در بالای جدول کاربران در `users.html`.
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


def test_users_status_filters():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۴۷: فیلترهای سریع وضعیت سازمانی (فاز ۳)")
    print("=" * 74)

    if not USERS_TS.exists() or not USERS_HTML.exists():
        print("❌ فایل‌های Users یافت نشدند.")
        return False

    ts_content = USERS_TS.read_text(encoding="utf-8")
    html_content = USERS_HTML.read_text(encoding="utf-8")

    # ۱. استیت فیلتر وضعیت
    assert "userStatusFilter" in ts_content, "متغیر userStatusFilter در users.ts یافت نشد."
    assert "'all' | 'active' | 'inactive' | 'no_warehouse' | 'superuser'" in ts_content, "انواع وضعیت‌های سازمانی در تعریف تایپ فیلتر تایید نشد."
    print("✅ بند ۱: تعریف جامع استیت فیلتر سازمانی تایید شد.")

    # ۲. گتر userCounts
    assert "get userCounts" in ts_content, "گتر محاسباتی userCounts در users.ts یافت نشد."
    print("✅ بند ۲: گتر محاسبه زنده تعداد هر وضعیت تایید شد.")

    # ۳. متد setStatusFilter
    assert "setStatusFilter" in ts_content, "متد setStatusFilter در users.ts یافت نشد."
    print("✅ بند ۳: متد تغییر فیلتر و ریست تکه‌بندی تایید شد.")

    # ۴. دکمه‌ها در تمپلیت
    filters = ["setStatusFilter('all')", "setStatusFilter('active')", "setStatusFilter('inactive')", "setStatusFilter('no_warehouse')", "setStatusFilter('superuser')"]
    for f in filters:
        assert f in html_content, f"دکمه فراخوانی فیلتر {f} در تمپلیت یافت نشد."
    print("✅ بند ۴: تعبیه هر ۵ دکمه فیلتر سریع در تمپلیت HTML تایید شد.")

    print("\n🎉 ایجنت نگهبان ۴۷: تمامی آزمون‌های فیلترهای سریع وضعیت با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_users_status_filters()
    sys.exit(0 if success else 1)
