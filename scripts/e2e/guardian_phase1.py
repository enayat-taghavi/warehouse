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

def verify_phase1():
    print("=" * 60)
    print("🛡️ ارزیابی مستقل ایجنت نگهبان فاز ۱ (Guardian Agent Verification)")
    print("=" * 60)

    errors = []

    # 1. بررسی سناریو ۱ (E2E-ITEM-01)
    item1 = Item.objects.filter(fa_unic_code="E2E-ITEM-01").first()
    if not item1:
        errors.append("کالای E2E-ITEM-01 در دیتابیس یافت نشد.")
    else:
        if item1.field_status != 'done':
            errors.append(f"وضعیت میدانی E2E-ITEM-01 برابر {item1.field_status} است، انتظار: done")
        if item1.inventory != Decimal('50.000'):
            errors.append(f"موجودی نهایی E2E-ITEM-01 برابر {item1.inventory} است، انتظار: 50.000")
        if item1.has_conflict:
            errors.append("کالای E2E-ITEM-01 به اشتباه دارای مغایرت علامت‌گذاری شده است.")

    task1 = CountTask.objects.filter(item=item1).order_by('-id').first()
    if not task1:
        errors.append("تسک شمارش برای E2E-ITEM-01 یافت نشد.")
    else:
        if task1.status != 'FINAL_APPROVED':
            errors.append(f"وضعیت تسک E2E-ITEM-01 برابر {task1.status} است، انتظار: FINAL_APPROVED")
        h_types1 = list(CountTaskHistory.objects.filter(task=task1).values_list('action_type', flat=True))
        if 'FINAL_APPROVED' not in h_types1:
            errors.append(f"تاریخچه تایید نهایی برای تسک ۱ ثبت نشده است: {h_types1}")

    # 2. بررسی سناریو ۲ (E2E-ITEM-02)
    item2 = Item.objects.filter(fa_unic_code="E2E-ITEM-02").first()
    if not item2:
        errors.append("کالای E2E-ITEM-02 در دیتابیس یافت نشد.")
    else:
        if item2.field_status != 'done':
            errors.append(f"وضعیت میدانی E2E-ITEM-02 برابر {item2.field_status} است، انتظار: done")
        if item2.inventory != Decimal('50.000'):
            errors.append(f"موجودی نهایی E2E-ITEM-02 برابر {item2.inventory} است، انتظار: 50.000")

    task2 = CountTask.objects.filter(item=item2).order_by('-id').first()
    if not task2:
        errors.append("تسک شمارش برای E2E-ITEM-02 یافت نشد.")
    else:
        if task2.status != 'FINAL_APPROVED':
            errors.append(f"وضعیت تسک E2E-ITEM-02 برابر {task2.status} است، انتظار: FINAL_APPROVED")
        histories2 = CountTaskHistory.objects.filter(task=task2)
        h_types2 = list(histories2.values_list('action_type', flat=True))
        if 'SUPERVISOR_REJECTED' not in h_types2:
            errors.append(f"تاریخچه رد سرپرست در سناریو ۲ ثبت نشده است: {h_types2}")
        
        rej_hist = histories2.filter(action_type='SUPERVISOR_REJECTED').first()
        if not rej_hist or 'بازشماری' not in (rej_hist.note or ''):
            errors.append(f"یادداشت علت رد سرپرست در تاریخچه ثبت نشده یا ناقص است: {rej_hist.note if rej_hist else None}")

    # 3. بررسی فایل‌های اسکرین‌شات
    screenshot_dir = os.path.join(REPO_ROOT, "Documents", "Browser_E2E_Comprehensive_Testing", "screenshots")
    expected_screens = [
        'phase1_scenario1_01_dispatch.png',
        'phase1_scenario1_02_counter_submitted.png',
        'phase1_scenario1_03_supervisor_approved.png',
        'phase1_scenario1_04_manager_final_approved.png',
        'phase1_scenario2_01_supervisor_rejected.png',
        'phase1_scenario2_02_counter_recount_tab.png',
        'phase1_scenario2_03_counter_recounted.png',
        'phase1_scenario2_04_manager_final_approved.png'
    ]
    for s in expected_screens:
        p = os.path.join(screenshot_dir, s)
        if not os.path.exists(p) or os.path.getsize(p) < 1000:
            errors.append(f"اسکرین‌شات {s} ذخیره نشده یا حجم نامعتبر دارد.")

    if errors:
        print("❌ ایجنت نگهبان فاز ۱ را رد کرد (REJECTED):")
        for err in errors:
            print(f"   - {err}")
        return False
    else:
        print("✅ ایجنت نگهبان فاز ۱ را به طور ۱۰۰٪ تایید کرد (PASSED & VERIFIED).")
        print("   - تمامی انتقال‌های وضعیت، لاگ‌های تاریخچه، مقادیر اعشاری و اسکرین‌شات‌ها کاملاً معتبر هستند.")
        return True

if __name__ == '__main__':
    ok = verify_phase1()
    sys.exit(0 if ok else 1)
