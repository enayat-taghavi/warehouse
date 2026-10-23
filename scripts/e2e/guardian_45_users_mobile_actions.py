#!/usr/bin/env python
"""
ایجنت نگهبان ۴۵ — دسترس‌پذیری لمسی اکشن‌ها و کنترل عمق درخت نقش‌ها در موبایل (فاز ۳)
(Guardian 45 — Mobile Touch Accessibility and Clamp Indentation for Role Tree)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۳, نگهبان ۴۵

معیارهای سخت‌گیرانه آزمون:
  ۱) وجود متد `getRoleDepthMargin(depth)` برای مهار تورفتگی درخت در موبایل با فرمول clamp.
  ۲) استفاده از `getRoleDepthMargin(depth)` روی گره‌های درختی در `users.html`.
  ۳) عدم وابستگی دکمه‌های اکشن نقش به رویداد لمس‌ناپذیر Hover در موبایل (`opacity-90 sm:opacity-0`).
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


def test_users_mobile_actions():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۴۵: دسترس‌پذیری لمسی و مهار عمق درخت در موبایل (فاز ۳)")
    print("=" * 74)

    if not USERS_TS.exists() or not USERS_HTML.exists():
        print("❌ فایل‌های Users یافت نشدند.")
        return False

    ts_content = USERS_TS.read_text(encoding="utf-8")
    html_content = USERS_HTML.read_text(encoding="utf-8")

    # ۱. متد getRoleDepthMargin
    assert "getRoleDepthMargin(depth: number)" in ts_content, "متد getRoleDepthMargin در users.ts یافت نشد."
    assert "clamp(" in ts_content, "فرمول منعطف clamp برای کنترل عمق درختی یافت نشد."
    print("✅ بند ۱: متد getRoleDepthMargin با فرمول ریسپانسیو clamp تایید شد.")

    # ۲. اعمال در HTML
    assert "getRoleDepthMargin(depth)" in html_content, "اتصال getRoleDepthMargin در تمپلیت درخت نقش‌ها تایید نشد."
    print("✅ بند ۲: اعمال حاشیه دینامیک درخت روی گره‌ها تایید شد.")

    # ۳. دسترس‌پذیری لمسی بدون Hover
    assert "opacity-90 sm:opacity-0" in html_content, "کلاس‌های نمایان بودن دکمه‌های اکشن در نمایشگر لمسی موبایل تایید نشد."
    print("✅ بند ۳: نمایش دسترس‌پذیر دکمه‌های ویرایش/حذف در صفحات لمسی تایید شد.")

    print("\n🎉 ایجنت نگهبان ۴۵: تمامی آزمون‌های ارگونومی موبایل با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_users_mobile_actions()
    sys.exit(0 if success else 1)
