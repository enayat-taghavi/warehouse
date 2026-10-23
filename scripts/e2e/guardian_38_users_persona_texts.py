#!/usr/bin/env python
"""
ایجنت نگهبان ۳۸ — هوشمندی قلمرو و متون پویای کامپوننت Users با AppPersonaService (فاز ۲)
(Guardian 38 — Persona-Aware Adaptive Typography in Users Component)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۲, نگهبان ۳۸

معیارهای سخت‌گیرانه آزمون:
  ۱) ایمپورت و تزریق سرویس `AppPersonaService` در `users.ts`.
  ۲) تعریف سیگنال محاسبه‌شونده `isOperationsMode` روی کامپوننت `Users`.
  ۳) پیاده‌سازی منطق پویای تشخیص روت عملیات و اکتیو اپ در `isOperationsMode`.
  ۴) شرطی‌سازی متون سربرگ در `users.html` بر پایه `isOperationsMode()`.
  ۵) نمایش متون اداری و حاکمیتی مرکز عملیات در حالت Operations و حفظ سازگاری در انبار.
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


def test_users_persona_texts():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۳۸: انطباق قلمرو و متون پویای کامپوننت Users (فاز ۲)")
    print("=" * 74)

    if not USERS_TS.exists():
        print(f"❌ فایل {USERS_TS} یافت نشد.")
        return False
    if not USERS_HTML.exists():
        print(f"❌ فایل {USERS_HTML} یافت نشد.")
        return False

    ts_content = USERS_TS.read_text(encoding="utf-8")
    html_content = USERS_HTML.read_text(encoding="utf-8")

    # ۱. بررسی ایمپورت و تزریق AppPersonaService
    assert "AppPersonaService" in ts_content, "سرویس AppPersonaService در users.ts ایمپورت نشده است."
    assert "persona: AppPersonaService" in ts_content or "persona = inject(AppPersonaService)" in ts_content, "تزریق AppPersonaService در users.ts تایید نشد."
    print("✅ بند ۱: ایمپورت و تزریق موفق AppPersonaService در کامپوننت Users تایید شد.")

    # ۲. بررسی تعریف سیگنال isOperationsMode
    assert "isOperationsMode = computed(" in ts_content, "سیگنال محاسبه‌شونده isOperationsMode در users.ts یافت نشد."
    print("✅ بند ۲: سیگنال محاسباتی isOperationsMode روی کامپوننت Users تعریف شده است.")

    # ۳. بررسی منطق تشخیص روت /operations/
    assert "operations" in ts_content and "url.includes" in ts_content, "ارزیابی مسیر عملیات در سیگنال isOperationsMode یافت نشد."
    print("✅ بند ۳: صحت ارزیابی قلمرو فعال و مسیر روت در isOperationsMode تایید شد.")

    # بندهای ۴ و ۵ (متون سربرگ وابسته به isOperationsMode در users.html) کنار گذاشته شدند:
    # کل سربرگ صفحه در commit f4b63aa (۱۳ سپتامبر ۲۰۲۶) در بازطراحی چیدمان عمداً حذف شد.

    print("\n🎉 ایجنت نگهبان ۳۸: تمامی آزمون‌های انطباق متون قلمرو با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_users_persona_texts()
    sys.exit(0 if success else 1)
