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
from inventory.models import Item, CountTask, CountTaskHistory

def verify_phase2():
    print("=" * 60)
    print("🛡️ ارزیابی مستقل ایجنت نگهبان فاز ۲ (Guardian Agent Verification)")
    print("=" * 60)

    errors = []

    # 1. بررسی سناریو ۳ (E2E-ITEM-03 - skip_supervisor)
    item3 = Item.objects.filter(fa_unic_code="E2E-ITEM-03").first()
    if not item3:
        errors.append("کالای E2E-ITEM-03 در دیتابیس یافت نشد.")
    else:
        if item3.field_status != 'done':
            errors.append(f"وضعیت میدانی E2E-ITEM-03 برابر {item3.field_status} است، انتظار: done")
        if item3.inventory != Decimal('50.000'):
            errors.append(f"موجودی نهایی E2E-ITEM-03 برابر {item3.inventory} است، انتظار: 50.000")

    task3 = CountTask.objects.filter(item=item3).order_by('-id').first()
    if not task3:
        errors.append("تسک شمارش برای E2E-ITEM-03 یافت نشد.")
    else:
        if not task3.skip_supervisor:
            errors.append("پرچم skip_supervisor در تسک ۳ فعال نیست.")
        if task3.status != 'FINAL_APPROVED':
            errors.append(f"وضعیت تسک E2E-ITEM-03 برابر {task3.status} است، انتظار: FINAL_APPROVED")
        
        histories3 = CountTaskHistory.objects.filter(task=task3)
        h_types3 = list(histories3.values_list('action_type', flat=True))
        if 'FINAL_APPROVED' not in h_types3:
            errors.append(f"تاریخچه تایید نهایی تسک ۳ ثبت نشده است: {h_types3}")

    # 2. بررسی سناریو ۴ (E2E-ITEM-04 - manager reject to supervisor)
    item4 = Item.objects.filter(fa_unic_code="E2E-ITEM-04").first()
    if not item4:
        errors.append("کالای E2E-ITEM-04 در دیتابیس یافت نشد.")
    else:
        if item4.field_status != 'done':
            errors.append(f"وضعیت میدانی E2E-ITEM-04 برابر {item4.field_status} است، انتظار: done")

    task4 = CountTask.objects.filter(item=item4).order_by('-id').first()
    if not task4:
        errors.append("تسک شمارش برای E2E-ITEM-04 یافت نشد.")
    else:
        if task4.status != 'FINAL_APPROVED':
            errors.append(f"وضعیت تسک E2E-ITEM-04 برابر {task4.status} است، انتظار: FINAL_APPROVED")
        
        histories4 = CountTaskHistory.objects.filter(task=task4)
        h_types4 = list(histories4.values_list('action_type', flat=True))
        if 'MANAGER_REJECTED' not in h_types4:
            errors.append(f"تاریخچه رد مدیر در سناریو ۴ ثبت نشده است: {h_types4}")

    # 3. بررسی فایل‌های اسکرین‌شات فاز ۲
    screenshot_dir = os.path.join(REPO_ROOT, "Documents", "Browser_E2E_Comprehensive_Testing", "screenshots")
    expected_screens = [
        'phase2_scenario3_01_dispatch_skip_sup.png',
        'phase2_scenario3_02_counter_submitted_direct.png',
        'phase2_scenario3_03_manager_rejected.png',
        'phase2_scenario3_04_counter_resubmitted.png',
        'phase2_scenario3_05_manager_final_approved.png',
        'phase2_scenario4_01_manager_rejected_to_sup.png',
        'phase2_scenario4_02_supervisor_cartable_mgr_rejected.png',
        'phase2_scenario4_03_manager_final_approved.png'
    ]
    for s in expected_screens:
        p = os.path.join(screenshot_dir, s)
        if not os.path.exists(p) or os.path.getsize(p) < 1000:
            errors.append(f"اسکرین‌شات {s} ذخیره نشده یا حجم نامعتبر دارد.")

    if errors:
        print("❌ ایجنت نگهبان فاز ۲ را رد کرد (REJECTED):")
        for err in errors:
            print(f"   - {err}")
        return False
    else:
        print("✅ ایجنت نگهبان فاز ۲ را به طور ۱۰۰٪ تایید کرد (PASSED & VERIFIED).")
        print("   - مسیرهای هوشمند رد مدیر و دور زدن سرپرست کاملاً بدون نقص و مستند هستند.")
        return True

if __name__ == '__main__':
    ok = verify_phase2()
    sys.exit(0 if ok else 1)
