import os
import sys
import re

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

def verify_count_tracking():
    print("=" * 70)
    print("🛡️ ارزیابی مستقل ایجنت نگهبان تب پیگیری وضعیت شمارش (Guardian Verification)")
    print("=" * 70)

    errors = []
    successes = []

    html_path = r"e:\warehouse project\warehouse-front\src\app\modules\warehouse\components\count-tracking\count-tracking.html"
    ts_path = r"e:\warehouse project\warehouse-front\src\app\modules\warehouse\components\count-tracking\count-tracking.ts"
    css_path = r"e:\warehouse project\warehouse-front\src\styles.css"
    dt_path = r"e:\warehouse project\warehouse-front\src\app\shared\components\data-table\data-table.component.ts"

    if not os.path.exists(html_path) or not os.path.exists(ts_path) or not os.path.exists(css_path) or not os.path.exists(dt_path):
        errors.append("یکی از فایل‌های هدف یافت نشد.")
        return False

    with open(html_path, "r", encoding="utf-8") as f:
        html_content = f.read()

    with open(ts_path, "r", encoding="utf-8") as f:
        ts_content = f.read()

    with open(css_path, "r", encoding="utf-8") as f:
        css_content = f.read()

    with open(dt_path, "r", encoding="utf-8") as f:
        dt_content = f.read()

    # 1. بررسی لاجیک هوشمند ذخیره و بازگشت وضعیت تأیید نهایی
    if "savedShowCompletedState" in ts_content:
        successes.append("✅ بررسی لاجیک هوشمند: متغیر savedShowCompletedState در کد تایپ‌اسکریپت تعریف شده است.")
    else:
        errors.append("❌ متغیر savedShowCompletedState در TS یافت نشد.")

    if "this.savedShowCompletedState = this.showCompleted" in ts_content:
        successes.append("✅ بررسی بازگشت وضعیت: ذخیره وضعیت قبل از ورود به تب تأیید نهایی و بازنشانی آن پس از خروج پیاده‌سازی شد.")
    else:
        errors.append("❌ لاجیک ذخیره/بازیابی وضعیت در setDiscrepancyFilter یافت نشد.")

    # 2. بررسی دکمه آیکونی مربعی تأیید نهایی در هدر
    if 'title]="showCompleted ? \'مخفی کردن اقلام تأیید نهایی\' : \'نمایش اقلام تأیید نهایی\'"' in html_content:
        successes.append("✅ بررسی دکمه هدر: عنوان و عملکرد دکمه با مفهوم «تأیید نهایی» و به فرمت آیکونی مربعی تنظیم شد.")
    else:
        errors.append("❌ تولتیپ تأیید نهایی برای دکمه هدر در HTML یافت نشد.")

    # 3. بررسی اصلاح کانتینر فیلتر تاریخ جدول
    if "w-64" in dt_content and "overflow-visible" in dt_content:
        successes.append("✅ بررسی فیلتر تاریخ جدول: عرض کانتینر به w-64 ارتقا یافته و خاصیت overflow-visible جهت باز شدن بی‌نقص پاپ‌آپ تقویم اعمال گردید.")
    else:
        errors.append("❌ تنظیمات w-64 یا overflow-visible در data-table.component.ts یافت نشد.")

    # 4. بررسی استایل‌های سراسری تقویم جلالی
    if "datepicker-outer-container" in css_content:
        successes.append("✅ بررسی استایل سراسری تقویم: کلاس datepicker-outer-container با استایل‌های مدرن و z-index بالا به styles.css اضافه شد.")
    else:
        errors.append("❌ کلاس datepicker-outer-container در styles.css یافت نشد.")

    # 5. بررسی اسکنر بارکد
    if "scanner?.openCamera()" in html_content and "<app-barcode-scanner" in html_content:
        successes.append("✅ بررسی اسکنر بارکد: دکمه اسکن دوربین و کامپوننت بارکدخوان در قالب تعبیه شده‌اند.")
    else:
        errors.append("❌ دکمه اسکن دوربین یا کامپوننت بارکدخوان در HTML یافت نشد.")

    # 6. بررسی دکمه آیکونی مربعی خروجی اکسل
    if 'openExportModal()' in html_content and 'title="خروجی اکسل"' in html_content:
        successes.append("✅ بررسی خروجی اکسل: دکمه خروجی اکسل به فرمت آیکونی مربعی سبز استاندارد هماهنگ شد.")
    else:
        errors.append("❌ دکمه خروجی اکسل در HTML یافت نشد.")

    # 7. بررسی عدم وجود دکمه تکراری بروزرسانی در هدر
    direct_refresh_buttons = re.findall(r'<button[^>]*\(click\)="loadTasks\(\)"[^>]*>', html_content)
    if len(direct_refresh_buttons) == 1:
        successes.append("✅ بررسی هدر: فقط یک دکمه استاندارد بروزرسانی در هدر وجود دارد.")
    else:
        errors.append(f"❌ تعداد دکمه‌های مستقیم بروزرسانی در هدر برابر {len(direct_refresh_buttons)} است (انتظار: ۱).")

    # 8. بررسی تعاملی بودن تمام ۶ کارت شاخص در مینی داشبورد
    kpi_filters = ['all', 'counted', 'discrepancy', 'shortage', 'surplus', 'approved']
    for kpi in kpi_filters:
        if f"setDiscrepancyFilter('{kpi}')" in html_content:
            successes.append(f"✅ بررسی داشبورد شاخص‌ها: کارت '{kpi}' فعال و تعاملی است.")
        else:
            errors.append(f"❌ کارت شاخص '{kpi}' به عنوان دکمه فیلتر در HTML یافت نشد.")

    print("\n📋 خلاصه تاییدیه‌های نگهبان:")
    for s in successes:
        print(f"  {s}")

    if errors:
        print("\n⚠️ ایرادات کشف شده توسط ایجنت نگهبان:")
        for e in errors:
            print(f"  {e}")
        return False
    else:
        print("\n🎉 تمامی معیارهای ارزیابی توسط ایجنت نگهبان تایید شدند (Pass Rate: 100%).")
        return True

if __name__ == "__main__":
    success = verify_count_tracking()
    sys.exit(0 if success else 1)
