<div dir="rtl" align="right">

# چک‌لیست تسک‌های پیاده‌سازی و نمایش پیشرفته حجم دیتابیس لاگ‌ها

---

### فاز ۱: بک‌اند (محاسبه حجم کل دیتابیس و تفکیک درصدی)
- [x] پیاده‌سازی توابع `get_db_total_storage_info` و `get_table_storage_info` با پشتیبانی از PostgreSQL و Fallback در [`backend/accounts/views.py`](file:///e:/warehouse%20project/backend/accounts/views.py) <!-- id: 1 -->
- [x] اضافه کردن ساختار کامل `storage` شامل `db_total_bytes`، `audit_percent` و `login_percent` به خروجی `AuditLogViewSet.stats` <!-- id: 2 -->
- [x] اضافه کردن ساختار کامل `storage` به خروجی `UserLoginLogViewSet.stats` <!-- id: 3 -->
- [x] **گیت اعتبارسنجی ۱: تست اندپوینت‌های stats بک‌اند** <!-- id: 4 -->

---

### فاز ۲: تایپ‌های فرانت‌اند و مقداردهی اولیه
- [x] به‌روزرسانی اینترفیس `LogStorageInfo` در [`frontend/src/app/core/models/audit-log.model.ts`](file:///e:/warehouse%20project/frontend/src/app/core/models/audit-log.model.ts) <!-- id: 5 -->
- [x] همگام‌سازی مقداردهی اولیه `auditStats` و `loginStats` در [`frontend/src/app/components/audit/audit.ts`](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.ts) <!-- id: 6 -->
- [x] **گیت اعتبارسنجی ۲: صحت اینترفیس‌ها** <!-- id: 7 -->

---

### فاز ۳: بازطراحی کارت شاخص در قالب فرانت‌اند
- [x] به‌روزرسانی کارت شاخص در تب ممیزی با عدد اصلی، نوار درصد پیشرفت و زیرنویس فارسی حجم کل دیتابیس در [`frontend/src/app/components/audit/audit.html`](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.html) <!-- id: 8 -->
- [x] به‌روزرسانی کارت شاخص در تب تاریخچه ورود با ساختار یکپارچه درصد و حجم کل <!-- id: 9 -->
- [x] **گیت اعتبارسنجی ۳: بازبینی بصری کارت** <!-- id: 10 -->

---

### فاز ۴: کامپایل، تست و DUAL-SAVE
- [x] اجرای `npm run build` فرانت‌اند و اطمینان از خروجی بدون خطا <!-- id: 11 -->
- [x] مستندسازی کامل نتایج در `walkthrough_audit_storage.md` و همگام‌سازی `Master_Log.md` <!-- id: 12 -->
- [x] **گیت نهایی پروژه (Final Sign-off)** <!-- id: 13 -->

</div>
