#!/usr/bin/env python
"""
اسکریپت خط فرمانی مستقل شبیه‌ساز تست فشار همروندی و مقاومت در برابر بن‌بست دیتابیس
(High-Concurrency Stress & Deadlock Resistance CLI Suite)

نحوه اجرا:
python accounts/concurrency_stress_test.py
python accounts/concurrency_stress_test.py --concurrency 50 --scenario combined
"""

import os
import sys
import argparse

# تنظیم کانتکست پروژه جنگو
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import backend_paths
backend_paths.install()
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

try:
    import django
    django.setup()
except Exception as e:
    print(f"Error initializing Django: {e}")
    sys.exit(1)

from accounts.concurrency_stress_service import ConcurrencyStressService


def main():
    parser = argparse.ArgumentParser(description="سوئیت تست فشار همروندی و مقاومت در برابر بن‌بست دیتابیس")
    parser.add_argument('--concurrency', '-c', type=int, default=30, choices=[20, 30, 50, 100], help="تعداد تراکنش‌های همزمان (پیش‌فرض: ۳۰)")
    parser.add_argument('--scenario', '-s', type=str, default='combined', choices=['combined', 'treasury', 'warehouse'], help="نوع سناریو (combined, treasury, warehouse)")

    args = parser.parse_args()

    print("=" * 65)
    print("🚀 آغاز سوئیت تست فشار همروندی و پایش مقاومت در برابر بن‌بست")
    print(f"🔹 تعداد تراکنش‌های همزمان: {args.concurrency}")
    print(f"🔹 سناریوی عملیاتی: {args.scenario}")
    print("=" * 65)

    res = ConcurrencyStressService.run_stress_test(
        user=None,
        concurrency_level=args.concurrency,
        scenario=args.scenario
    )

    print("\n📊 نتایج آزمون همروندی:")
    print(f"  • وضعیت کلی: {'✅ پاس شد (PASSED)' if res['status'] == 'passed' else '❌ ناموفق (FAILED)'}")
    print(f"  • شاخص Zero Deadlock (عدم بن‌بست): {'✅ تضمین ۱۰۰٪ بدون بن‌بست' if res['deadlock_free'] else '❌ بن‌بست رخ داد'}")
    print(f"  • کل تراکنش‌های موازی اجراشده: {res['total_transactions']}")
    print(f"  • تراکنش‌های موفق: {res['successful_transactions']}")
    print(f"  • تعداد خطای بن‌بست: {res['deadlock_count']}")
    print(f"  • ممانعت از پرداخت تکراری (Double-Spend Guard): {'✅ تایید شد' if res['double_spend_prevented'] else '❌ خطا'}")
    print(f"  • تمامیت موجودی کالا (Inventory Integrity): {'✅ تایید شد' if res['inventory_integrity_verified'] else '❌ خطا'}")
    print(f"  • میانگین زمان پاسخ: {res['latency']['avg_ms']} میلی‌ثانیه")
    print(f"  • حداکثر زمان پاسخ: {res['latency']['max_ms']} میلی‌ثانیه")
    print(f"  • زمان پاسخ صدک ۹۵ (p95): {res['latency']['p95_ms']} میلی‌ثانیه")
    print(f"  • کل مدت زمان تست: {res['duration_seconds']} ثانیه")
    print("=" * 65)

    if res['status'] == 'passed':
        print("🏆 تبریک! سیستم تحت بالاترین بار همروندی بدون بن‌بست و با حفظ ۱۰۰٪ تمامیت داده‌ها عمل کرد.")
        sys.exit(0)
    else:
        print("⚠️ هشدار! خطاهایی در زمان تست فشار رخ داد.")
        sys.exit(1)


if __name__ == '__main__':
    main()
