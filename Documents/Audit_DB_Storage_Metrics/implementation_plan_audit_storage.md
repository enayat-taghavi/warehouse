<div dir="rtl" align="right">

# طرح پیاده‌سازی محاسبه و نمایش حجم کل پایگاه‌داده و تفکیک لاگ‌ها (Database Storage Breakdown & Metrics Plan)

این طرح بر اساس مصوبات جلسه طراحی متقابل (`/grill-me`) جهت محاسبه دقیق حجم فیزیکی دیسک پایگاه‌داده PostgreSQL و نمایش شفاف نسبت حجم لاگ‌ها به حجم کل دیتابیس تدوین شده است.

---

## ۱. تصمیمات نهایی اتخاذشده در جلسه طراحی (Design Decisions)

1. **روش محاسبه حجم در بک‌اند:**
   - استعلام مستقیم حجم کل پایگاه‌داده با کوئری بومی پستگرس: `SELECT pg_database_size(current_database())`.
   - استعلام مستقیم حجم جدول لاگ‌های ممیزی: `SELECT pg_total_relation_size('accounts_auditlog')`.
   - استعلام مستقیم حجم جدول تاریخچه لاگین: `SELECT pg_total_relation_size('accounts_userloginlog')`.
   - محاسبه دقیق درصد اشغال از کل پایگاه‌داده (`percentage = (table_size / db_total_size) * 100`).
   - تعبیه مکانیزم Fallback برای محیط‌های توسعه و تست در صورت عدم دسترسی به توابع سیستمی دیتابیس.

2. **طراحی بصری در فرانت‌اند:**
   - نمایش حجم لاگ با قلم درشت و ارقام شفاف (مثال: `۲.۴ MB`).
   - اضافه شدن یک نوار پیشرفت ظریف (Progress Bar) که درصد پر بودن لاگ از کل دیتابیس را نمایش می‌دهد.
   - زیرنویس فارسی با فرمت استاندارد: `۵.۲٪ از کل پایگاه‌داده (۴۵.۸ MB)`.

3. **همسان‌سازی اندپوینت‌ها:**
   - هر دو اندپوینت `AuditLogViewSet.stats` و `UserLoginLogViewSet.stats` ساختار کامل متادیتای حجم (`LogStorageInfo`) را ارسال خواهند کرد.

---

## ۲. تغییرات پیشنهادی در فایل‌های پروژه (Proposed File Changes)

### الف. لایه بک‌اند (Backend)

#### [MODIFY] [`backend/accounts/views.py`](file:///e:/warehouse%20project/backend/accounts/views.py)
- ایجاد تابع کمکی `get_db_total_storage_info()` جهت استعلام حجم کل دیتابیس جاری.
- ارتقای تابع `get_table_storage_info()` برای جدول‌های ممیزی و لاگین.
- غنی‌سازی متد `stats` در `AuditLogViewSet` با فیلدهای `db_total_bytes`، `db_total_formatted`، `audit_percent`، `login_percent` و `total_logs_percent`.
- اضافه کردن متادیتای `storage` به متد `stats` در `UserLoginLogViewSet`.

---

### ب. لایه فرانت‌اند (Frontend)

#### [MODIFY] [`frontend/src/app/core/models/audit-log.model.ts`](file:///e:/warehouse%20project/frontend/src/app/core/models/audit-log.model.ts)
- به‌روزرسانی اینترفیس `LogStorageInfo` جهت پوشش فیلدهای جدید درصد و حجم کل دیتابیس.

#### [MODIFY] [`frontend/src/app/components/audit/audit.ts`](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.ts)
- همسان‌سازی آبجکت مقداردهی اولیه `storage` در `auditStats` و `loginStats`.

#### [MODIFY] [`frontend/src/app/components/audit/audit.html`](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.html)
- ارتقای کارت چهارم در تب تغییرات داده‌ها (`audit`) با رقم حجم، نوار پیشرفت درصد و زیرنویس حجم کل دیتابیس.
- ارتقای کارت چهارم در تب تاریخچه ورود (`login`) با ساختار متناسب و درصد اشغال لاگین از کل دیتابیس.

---

## ۳. برنامه اعتبارسنجی و تست (Verification Plan)

### آزمون‌های خودکار و کامپایل:
1. کامپایل کامل برنامه فرانت‌اند با `npm run build` و اطمینان از سلامت تایپ‌ها.
2. اجرای تست یونیت اندپوینت‌های آمار در بک‌اند.

### تست دستی در مرورگر:
1. مشاهده تب «تغییرات داده‌ها» و بررسی نمایش صحیح حجم، نوار درصد و حجم کل دیتابیس.
2. سوئیچ به تب «تاریخچه ورود و نشست‌ها» و بررسی بارگذاری صحیح کارت حجم لاگین.
3. فیلتر کردن بر اساس انبار و اطمینان از واکنش صحیح کارت‌ها.

</div>
