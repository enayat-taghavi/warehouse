<div dir="rtl" align="right">

# چک‌لیست تسک‌های بهینه‌سازی عملکرد و سرعت سیستم (Performance Optimization Tasks)

- [x] **فاز اول: بهینه‌سازی دیتابیس و بک‌اند (Backend Optimization)** <!-- id: 0 -->
  - [x] پیاده‌سازی کش لایه سرویس برای تنظیمات سیستم در `warehouses/services.py` <!-- id: 1 -->
  - [x] بهینه‌سازی سریالایزرهای `CountTaskSerializer` و `DocTaskSerializer` در `inventory/serializers.py` <!-- id: 2 -->
  - [x] ارتقای پیش‌واکشی روابط دیتابیس (`select_related`) در `inventory/sync_views.py` <!-- id: 3 -->
- [x] **فاز دوم: بهینه‌سازی سرور توزیع و فرانت‌اند (Frontend & Distribution Server)** <!-- id: 4 -->
  - [x] نصب پکیج `compression` در پروژه فرانت‌اند <!-- id: 5 -->
  - [x] فعال‌سازی فشرده‌سازی خودکار و تنظیم هدرهای کش در `frontend/server.js` <!-- id: 6 -->
  - [x] مستندسازی دستورات اجرایی پایدار در `cmd.txt` <!-- id: 7 -->
- [x] **فاز سوم: تست، اعتبارسنجی و تأیید نهایی (Verification & Benchmark)** <!-- id: 8 -->
  - [x] تست و بنچمارک سرعت اندپوینت `sync/pull/` <!-- id: 9 -->
  - [x] تست اجرای بیلد فرانت‌اند و فشرده‌سازی فایل‌های باندل <!-- id: 10 -->
  - [x] اعتبارسنجی تست بروزرسانی عمیق در مرورگر <!-- id: 11 -->

</div>
