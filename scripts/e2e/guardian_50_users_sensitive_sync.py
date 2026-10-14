#!/usr/bin/env python
"""
ایجنت نگهبان ۵۰ — یکنواخت‌سازی و انطباق کدهای دسترسی حساس با گاوصندوق عملیات (فاز ۱)
(Guardian 50 — Sensitive Permission Codenames Synchronization)

مرجع: Documents/Users_Operations_Audit/implementation_plan_operations_users.md §فاز ۱, نگهبان ۵۰

معیارهای سخت‌گیرانه آزمون:
  ۱) استخراج کدهای ۶ مجوز حساس از `operations-rbac-governance.ts`.
  ۲) راستی‌آزمایی وجود تک‌تک کدهای استخراج‌شده در `accounts.models.SENSITIVE_PERMISSION_CODENAMES`.
  ۳) عدم وجود کدهای ساختگی و نامعتبر قبلی (مانند perm_rollback_database, perm_backup_database و ...).
  ۴) استفاده از سرویس استاندارد `AccountsHttpService` به جای روت نامعتبر `/api/users/`.
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
BACKEND_DIR = REPO_ROOT / "warehouse-backend"
FRONT_DIR = REPO_ROOT / "warehouse-front"
GOVERNANCE_TS = FRONT_DIR / "src" / "app" / "components" / "operations" / "operations-rbac-governance" / "operations-rbac-governance.ts"


def test_sensitive_permissions_sync():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۵۰: انطباق کدهای دسترسی حساس با گاوصندوق عملیات (فاز ۱)")
    print("=" * 74)

    # ۱. بررسی فایل TypeScript کامپوننت حاکمیت
    if not GOVERNANCE_TS.exists():
        print(f"❌ فایل {GOVERNANCE_TS} یافت نشد.")
        return False

    ts_content = GOVERNANCE_TS.read_text(encoding="utf-8")

    # ۲. استخراج کدهای حساس از TS
    matches = re.findall(r"code:\s*['\"]([^'\"]+)['\"]", ts_content)
    if not matches:
        print("❌ هیچ کدی در sensitivePermissions در operations-rbac-governance.ts یافت نشد.")
        return False

    print(f"   - کدهای استخراج‌شده از کامپوننت حاکمیت: {matches}")
    assert len(matches) == 6, f"انتظار ۶ مجوز حساس ولی {len(matches)} مورد یافت شد."
    print("✅ بند ۱: هر ۶ مجوز حساس از کامپوننت استخراج شدند.")

    # ۳. بررسی وجود در SENSITIVE_PERMISSION_CODENAMES بک‌اند
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))
    import backend_paths
    backend_paths.install()

    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
    import django
    django.setup()

    from accounts.models import SENSITIVE_PERMISSION_CODENAMES

    for code in matches:
        if code not in SENSITIVE_PERMISSION_CODENAMES:
            print(f"❌ کد حساس «{code}» در SENSITIVE_PERMISSION_CODENAMES مدل بک‌اند یافت نشد!")
            return False
        print(f"   - تطابق کد «{code}»: ✅")

    print("✅ بند ۲: تمامی ۶ کد با SENSITIVE_PERMISSION_CODENAMES مدل دیتابیس انطباق کامل دارند.")

    # ۴. اطمینان از حذف کدهای موهومی قدیمی
    legacy_bogus_codes = [
        'perm_rollback_database',
        'perm_backup_database',
        'perm_hard_delete_records',
        'perm_purge_audit_logs',
        'perm_freeze_system'
    ]
    for bogus in legacy_bogus_codes:
        assert bogus not in ts_content, f"کد موهومی و فاقد بک‌اند «{bogus}» هنوز در فایل TS وجود دارد!"
    print("✅ بند ۳: هیچ‌یک از کدهای ساختگی قدیمی در فایل فرانت وجود ندارند.")

    # ۵. بررسی تصحیح روت نامعتبر /api/users/ به سرویس استاندارد
    assert "AccountsHttpService" in ts_content, "سرویس AccountsHttpService باید ایمپورت و استفاده شده باشد."
    assert "this.http.get<any[]>('/api/users/')" not in ts_content, "روت نامعتبر /api/users/ نباید استفاده شود."
    print("✅ بند ۴: استفاده از AccountsHttpService و رفع روت نامعتبر تایید شد.")

    print("\n🎉 ایجنت نگهبان ۵۰: تمامی آزمون‌های انطباق کدهای حساس با موفقیت پاس شدند.")
    return True


if __name__ == "__main__":
    success = test_sensitive_permissions_sync()
    sys.exit(0 if success else 1)
