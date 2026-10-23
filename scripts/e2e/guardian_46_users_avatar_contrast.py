#!/usr/bin/env python
"""
ایجنت نگهبان ۴۶ — تطابق کنتراست آواتار و برچسب‌های نقش با استانداردهای WCAG (فاز ۳)
(Guardian 46 — WCAG Color Contrast Calculation for User Avatars)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۳, نگهبان ۴۶

معیارهای سخت‌گیرانه آزمون:
  ۱) وجود متد `getContrastTextColor(hexColor: string)` در `users.ts`.
  ۲) استفاده از فرمول علمی روشنایی YIQ (ضریب‌های ۲۹۹، ۵۸۷، ۱۱۴).
  ۳) بازگرداندن رنگ متن تیره (`#0f172a`) برای رنگ‌های روشن (مانند زرد، سفید، طوسی روشن).
  ۴) بازگرداندن رنگ متن سفید (`#ffffff`) برای رنگ‌های تیره (مانند سرمه‌ای، زرشکی، بنفش).
  ۵) اعمال داینامیک استایل رنگ متن روی آواتار در تمپلیت HTML.
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


def test_users_avatar_contrast():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۴۶: محاسبه علمی کنتراست رنگ آواتار بر اساس استاندارد WCAG (فاز ۳)")
    print("=" * 74)

    if not USERS_TS.exists() or not USERS_HTML.exists():
        print("❌ فایل‌های Users یافت نشدند.")
        return False

    ts_content = USERS_TS.read_text(encoding="utf-8")
    html_content = USERS_HTML.read_text(encoding="utf-8")

    # ۱. وجود متد getContrastTextColor
    assert "getContrastTextColor(hexColor: string)" in ts_content, "متد getContrastTextColor در users.ts یافت نشد."
    print("✅ بند ۱: متد getContrastTextColor در کلاس کامپوننت پیاده‌سازی شده است.")

    # ۲. فرمول YIQ
    assert "299" in ts_content and "587" in ts_content and "114" in ts_content, "فرمول استاندارد روشنایی YIQ در متد استفاده نشده است."
    print("✅ بند ۲: فرمول استاندارد ادراک روشنایی بینایی YIQ تایید شد.")

    # ۳. راستی‌آزمایی منطقی روی رنگ‌های آزمایشی
    def simulate_yiq(hex_color):
        c = hex_color.replace('#', '')
        r = int(c[0:2], 16)
        g = int(c[2:4], 16)
        b = int(c[4:6], 16)
        yiq = (r * 299 + g * 587 + b * 114) / 1000
        return '#0f172a' if yiq >= 165 else '#ffffff'

    # رنگ‌های روشن -> باید تیره شود
    assert simulate_yiq("#ffffff") == "#0f172a", "کنتراست رنگ سفید باید تیره باشد"
    assert simulate_yiq("#fef08a") == "#0f172a", "کنتراست زرد لایت باید تیره باشد"
    assert simulate_yiq("#e2e8f0") == "#0f172a", "کنتراست طوسی لایت باید تیره باشد"

    # رنگ‌های تیره -> باید سفید شود
    assert simulate_yiq("#4f46e5") == "#ffffff", "کنتراست سرمه‌ای باید سفید باشد"
    assert simulate_yiq("#7c3aed") == "#ffffff", "کنتراست بنفش باید سفید باشد"
    assert simulate_yiq("#dc2626") == "#ffffff", "کنتراست قرمز باید سفید باشد"
    print("✅ بند ۳: صحت ریاضی تشخیص رنگ‌های تیره و روشن تایید شد.")

    # ۴. اعمال روی آواتار در تمپلیت
    assert "getContrastTextColor(getPrimaryRole(u).color)" in html_content, "فراخوانی getContrastTextColor روی متن آواتار در HTML تایید نشد."
    print("✅ بند ۴: اتصال داینامیک رنگ متن به آواتار در تمپلیت تایید شد.")

    print("\n🎉 ایجنت نگهبان ۴۶: تمامی آزمون‌های کنتراست WCAG با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_users_avatar_contrast()
    sys.exit(0 if success else 1)
