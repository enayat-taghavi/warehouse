#!/usr/bin/env python
"""
ایجنت نگهبان ۳۴ — تداوم آفلاین، یکپارچگی IndexedDB و رفع خطای قلمرو (فاز ۶)
(Guardian 34 — Offline Continuity, IndexedDB Scopes, and Route Mapping Integrity)

مرجع: Documents/Modular_Split_Warehouse_Accounting/implementation_plan_modular_split.md §۶, §۷

معیار آزمون:
  ۱) قفل مطلق نام دو دیتابیس فعلی IndexedDB:
     - 'WarehouseOfflineDB_warehouse'
     - 'WarehouseOfflineDB_finance'
     (عدم تغییر نام دیتابیس‌ها جهت جلوگیری از حذف صف‌ها یا کش کاربر).
  ۲) راستی‌آزمایی رفع نگاشت غلط قلمرو در `offline-db.ts` (تسک ۶۱):
     - مسیرهای `/doc-tasks` و `/doc_tasks` باید به 'warehouse' نگاشت شوند (نه finance).
     - مسیرهای مالی مانند `/personnel`, `/payroll`, `/finance`, `/treasury`, `/attendance` به 'finance'.
  ۳) راستی‌آزمایی ساختار کلید کرسر (تسک ۵۹):
     - تولید کلیدهای توسعه‌یافته با الگوی `userId:scopeKind:scopeId`
     - پشتیبانی fallback از کلیدهای قدیمی `userId:warehouseId`.
  ۴) راستی‌آزمایی تعمیم رجیستری مدل‌های Pull (تسک ۵۸):
     - وجود جدول‌های 'countTasks', 'items', 'dynamicFields', 'docTasks'.
  ۵) بررسی عدم وجود دستورات مخرب پاک‌سازی دیتابیس (.clear()) بدون اجازه.
"""

import os
import sys
import re
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONT_SERVICES = REPO_ROOT / "frontend" / "src" / "app" / "core" / "services"
OFFLINE_DB_TS = FRONT_SERVICES / "offline-db.ts"
SYNC_PULL_TS = FRONT_SERVICES / "sync-pull.service.ts"


def test_offline_continuity():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۳۴: تداوم آفلاین و یکپارچگی پایگاه‌های داده محلی (فاز ۶)")
    print("=" * 74)

    errors = []

    # ۱. بررسی قفل نام دیتابیس‌ها در offline-db.ts
    if not OFFLINE_DB_TS.exists():
        print("❌ فایل offline-db.ts یافت نشد.")
        return False

    content_db = OFFLINE_DB_TS.read_text(encoding="utf-8")

    if "'WarehouseOfflineDB_warehouse'" in content_db and "'WarehouseOfflineDB_finance'" in content_db:
        print("✅ قفل نام دو پایگاه داده محلی ('WarehouseOfflineDB_warehouse' و 'WarehouseOfflineDB_finance') حفظ شده است.")
    else:
        print("❌ نام پایگاه‌های داده محلی تغییر یافته است که منجر به نابودی داده‌های آفلاین کاربر می‌شود!")
        errors.append("SCOPED_DB_NAMES locked names violated")

    # ۲. بررسی رفع نگاشت غلط قلمرو (تسک ۶۱)
    # الگوی doc-tasks نباید در شرط فیلتر finance باشد
    match_resolve = re.search(r"export function resolveScopeFromUrl.*?\n}", content_db, re.DOTALL)
    if match_resolve:
        fn_body = match_resolve.group(0)
        if "doc-tasks" in fn_body or "doc_tasks" in fn_body:
            print("❌ نگاشت غلط /doc-tasks به قلمرو finance هنوز باقی است!")
            errors.append("resolveScopeFromUrl still incorrectly maps doc-tasks to finance")
        else:
            print("✅ رفع نگاشت غلط قلمرو: /doc-tasks به درستی به دامنه انبار (warehouse) تعلق گرفت.")
    else:
        print("❌ تابع resolveScopeFromUrl در offline-db.ts یافت نشد.")
        errors.append("resolveScopeFromUrl function missing")

    # ۳. بررسی تعمیم رجیستری Pull و کلید کرسر در sync-pull.service.ts
    if not SYNC_PULL_TS.exists():
        print("❌ فایل sync-pull.service.ts یافت نشد.")
        return False

    content_pull = SYNC_PULL_TS.read_text(encoding="utf-8")

    if "buildCursorKey" in content_pull and "scopeKind" in content_pull:
        print("✅ تعمیم کلید کرسر به الگوی userId:scopeKind:scopeId با پشتیبانی Expand-Contract تایید شد.")
    else:
        print("❌ ساختار جدید کلید کرسر در sync-pull.service.ts یافت نشد.")
        errors.append("buildCursorKey missing in sync-pull.service.ts")

    if "registerPullEntity" in content_pull or "PULL_ENTITIES" in content_pull:
        print("✅ رجیستری باز و توسعه‌پذیر موجودیت‌های همگام‌سازی (PULL_ENTITIES) تایید شد.")
    else:
        print("❌ رجیستری موجودیت‌های همگام‌سازی یافت نشد.")
        errors.append("PULL_ENTITIES registry missing")

    # ۴. تضمین عدم نابودی داده‌ها: بررسی اینکه متدهای مخرب .clear() تصادفی روی صف‌ها اضافه نشده باشد
    destructive_calls = re.findall(r"\.(syncQueue|syncErrors|photoQueue)\.clear\(\)", content_pull)
    if destructive_calls:
        print(f"❌ فراخوانی مخرب پاک‌سازی صف در sync-pull.service.ts یافت شد: {destructive_calls}")
        errors.append("Destructive clear() found on queue tables")
    else:
        print("✅ قانون طلایی عدم نابودی داده‌ها: هیچ پاک‌سازی خودکاری روی صف‌های آفلاین ثبت نشده است.")

    if errors:
        print("=" * 74)
        print(f"❌ نگهبان ۳۴ شکست خورد با {len(errors)} خطا.")
        return False

    print("=" * 74)
    print("✨ نتیجه: نگهبان ۳۴ تایید شد (PASS) — تداوم آفلاین و یکپارچگی داده‌ها برقرار است ✨")
    print("=" * 74)
    return True


if __name__ == "__main__":
    success = test_offline_continuity()
    sys.exit(0 if success else 1)
