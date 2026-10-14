import os
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

backend_dir = r"e:\warehouse project\warehouse-backend"
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
import backend_paths
backend_paths.install()

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from decimal import Decimal
from inventory.models import Item, CountTask, CountTaskHistory

def verify_phase3():
    print("=" * 60)
    print("🛡️ ارزیابی مستقل ایجنت نگهبان فاز ۳ (Guardian Agent Verification)")
    print("=" * 60)

    errors = []

    # 1. بررسی سناریو ۵ (E2E-ITEM-05 - Public Pool Claiming)
    item5 = Item.objects.filter(fa_unic_code="E2E-ITEM-05").first()
    if not item5:
        errors.append("کالای E2E-ITEM-05 در دیتابیس یافت نشد.")
    else:
        if item5.field_status != 'done':
            errors.append(f"وضعیت میدانی E2E-ITEM-05 برابر {item5.field_status} است، انتظار: done")
        if item5.inventory != Decimal('50.000'):
            errors.append(f"موجودی نهایی E2E-ITEM-05 برابر {item5.inventory} است، انتظار: 50.000")

    task5 = CountTask.objects.filter(item=item5).order_by('-id').first()
    if not task5:
        errors.append("تسک شمارش برای E2E-ITEM-05 یافت نشد.")
    else:
        if not task5.counter or task5.counter.username != 'counter_e2e':
            errors.append(f"شمارشگر تسک ۵ به درستی ثبت نشده است: {task5.counter}")
        if not task5.supervisor or task5.supervisor.username != 'supervisor_e2e':
            errors.append(f"سرپرست تسک ۵ به درستی ثبت نشده است: {task5.supervisor}")
        if task5.status != 'FINAL_APPROVED':
            errors.append(f"وضعیت تسک E2E-ITEM-05 برابر {task5.status} است، انتظار: FINAL_APPROVED")

    # 2. بررسی سناریو ۶ (E2E-ITEM-06 - Unassign & Release)
    item6 = Item.objects.filter(fa_unic_code="E2E-ITEM-06").first()
    if not item6:
        errors.append("کالای E2E-ITEM-06 در دیتابیس یافت نشد.")
    else:
        if item6.field_status != 'waiting':
            errors.append(f"کالای E2E-ITEM-06 پس از لغو تخصیص در وضعیت {item6.field_status} است، انتظار: waiting")
        if item6.field_assignee is not None and item6.field_assignee != '':
            errors.append(f"انتساب میدانی E2E-ITEM-06 پاک نشده است: {item6.field_assignee}")

    # 3. بررسی فایل‌های اسکرین‌شات فاز ۳
    screenshot_dir = r"e:\warehouse project\Documents\Browser_E2E_Comprehensive_Testing\screenshots"
    expected_screens = [
        'phase3_scenario5_01_dispatch_public_pool.png',
        'phase3_scenario5_02_counter_claimed.png',
        'phase3_scenario5_03_supervisor_claimed.png',
        'phase3_scenario5_04_manager_final_approved.png',
        'phase3_scenario6_01_redispatch_warning.png',
        'phase3_scenario6_02_unassigned_released.png'
    ]
    for s in expected_screens:
        p = os.path.join(screenshot_dir, s)
        if not os.path.exists(p) or os.path.getsize(p) < 1000:
            errors.append(f"اسکرین‌شات {s} ذخیره نشده یا حجم نامعتبر دارد.")

    if errors:
        print("❌ ایجنت نگهبان فاز ۳ را رد کرد (REJECTED):")
        for err in errors:
            print(f"   - {err}")
        return False
    else:
        print("✅ ایجنت نگهبان فاز ۳ را به طور ۱۰۰٪ تایید کرد (PASSED & VERIFIED).")
        print("   - استخرهای عمومی، تصاحب وظایف و آزادسازی لغو تخصیص کاملاً معتبر و بدون خطا هستند.")
        return True

if __name__ == '__main__':
    ok = verify_phase3()
    sys.exit(0 if ok else 1)
