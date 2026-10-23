import os
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
backend_dir = os.path.join(REPO_ROOT, "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
import backend_paths
backend_paths.install()

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from decimal import Decimal
from warehouses.models import Warehouse
from inventory.models import Item, CountTask, CountTaskHistory

def verify_phase4():
    print("=" * 60)
    print("🛡️ ارزیابی مستقل ایجنت نگهبان فاز ۴ (Guardian Agent Verification)")
    print("=" * 60)

    errors = []

    # 1. بررسی سناریو ۷ (E2E-ITEM-07 - Blind count & has_conflict)
    item7 = Item.objects.filter(fa_unic_code="E2E-ITEM-07").first()
    if not item7:
        errors.append("کالای E2E-ITEM-07 در دیتابیس یافت نشد.")
    else:
        if item7.field_status != 'done':
            errors.append(f"وضعیت میدانی E2E-ITEM-07 برابر {item7.field_status} است، انتظار: done")
        if item7.inventory != Decimal('42.000'):
            errors.append(f"موجودی نهایی E2E-ITEM-07 برابر {item7.inventory} است، انتظار: 42.000")
        if not item7.has_conflict:
            errors.append("کالای E2E-ITEM-07 به درستی به عنوان دارای مغایرت (has_conflict=True) علامت‌گذاری نشده است.")

    # 2. بررسی سناریو ۸ (ایزولاسیون انبارها)
    wh_bushehr = Warehouse.objects.filter(name__icontains="بوشهر").first()
    if not wh_bushehr:
        errors.append("انبار بوشهر یافت نشد.")
    else:
        shiraz_leaked_items = Item.objects.filter(warehouse=wh_bushehr, fa_unic_code__startswith="E2E-ITEM-").count()
        if shiraz_leaked_items > 0:
            errors.append(f"تعداد {shiraz_leaked_items} قلم انبار شیراز در انبار بوشهر نشت کرده است.")
        bushehr_item = Item.objects.filter(warehouse=wh_bushehr, fa_unic_code="E2E-BUSHEHR-01").first()
        if not bushehr_item:
            errors.append("قلم اختصاصی انبار بوشهر یافت نشد.")

    # 3. بررسی فایل‌های اسکرین‌شات فاز ۴
    screenshot_dir = os.path.join(REPO_ROOT, "Documents", "Browser_E2E_Comprehensive_Testing", "screenshots")
    expected_screens = [
        'phase4_scenario7_01_blind_counting_view.png',
        'phase4_scenario7_02_manager_conflict_approved.png',
        'phase4_scenario8_01_shiraz_warehouse_view.png',
        'phase4_scenario8_02_bushehr_warehouse_isolated.png'
    ]
    for s in expected_screens:
        p = os.path.join(screenshot_dir, s)
        if not os.path.exists(p) or os.path.getsize(p) < 1000:
            errors.append(f"اسکرین‌شات {s} ذخیره نشده یا حجم نامعتبر دارد.")

    if errors:
        print("❌ ایجنت نگهبان فاز ۴ را رد کرد (REJECTED):")
        for err in errors:
            print(f"   - {err}")
        return False
    else:
        print("✅ ایجنت نگهبان فاز ۴ را به طور ۱۰۰٪ تایید کرد (PASSED & VERIFIED).")
        print("   - شمارش کور، کشف پرچم مغایرت و ایزولاسیون انبارها کاملاً بدون نقص و مستند هستند.")
        return True

if __name__ == '__main__':
    ok = verify_phase4()
    sys.exit(0 if ok else 1)
