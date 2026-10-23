<div dir="rtl" align="right">

# گزارش جامع پیاده‌سازی و ارتقای کارتابل رهگیری، محاسبه حجم، پاکسازی و بازگردانی به تاریخ مشخص
## (Audit Enhancement, Storage Sizing, Range Purge & Point-in-Time Rollback Engine)

> **تاریخ گزارش:** ۲۰ آگوست ۲۰۲۶  
> **وضعیت اجرا:** ۱۰۰٪ تکمیل شده و اعتبارسنجی‌شده در تمامی لایه‌ها (Back-end & Front-end Passed)  
> **استاندارد مستندسازی:** Claude Opus 4.6 / DUAL-SAVE Workflow  

---

## ۱. اهداف و دستاوردهای کلیدی طرح (Key Achievements)

در پاسخ به نیازهای اعلام‌شده کاربر جهت ارتقا و تکمیل کارتابل ممیزی و رهگیری سیستم، موارد زیر به طور کامل و ساختاریافته پیاده‌سازی و راه‌اندازی شدند:

1. **اصلاح و رفع کلیه باگ‌های هسته بازگردانی (Rollback Engine Core Fixes):**
   - پیاده‌سازی متد `normalize_for_comparison` جهت یکسان‌سازی انواع داده (Decimal, Float, DateTime, Boolean) و از بین رفتن کامل هشدارهای کاذب تداخل (False Conflicts).
   - پیاده‌سازی متد `coerce_field_value` جهت تبدیل ایمن مقادیر رشته‌ای دیکشنری‌های JSON به انواع واقعی فیلدهای مدل‌های جنگو (Foreign Keys, Dates, Decimals, Integers).
   - فعال‌سازی پرچم ایزولاسیون `_is_rollback_operation = True` جهت پیشگیری از فعال شدن حلقه‌های بی‌نهایت در سیگنال‌های ثبت لاگ ممیزی.

2. **محاسبه و نمایش حجم واقعی ذخیره‌سازی دیتابیس (Storage Sizing Infrastructure):**
   - استعلام مستقیم حجم فیزیکی جداول پایگاه‌داده PostgreSQL با استفاده از تابع بهینه `pg_total_relation_size('accounts_auditlog')` و `pg_total_relation_size('accounts_userloginlog')`.
   - فرمت‌بندی هوشمند بایت‌ها به واحدهای خوانای انسانی (B, KB, MB, GB).
   - افزودن کارت اختصاصی KPI حجم داده‌ها در بالای تب‌های ممیزی و ورود کاربران همراه با میانگین حجم هر رکورد.

3. **پاکسازی پیشرفته بازه‌ای داده‌ها با تایید امنیتی ۲ مرحله‌ای (Range Purge with 2-Step Confirmation):**
   - بازطراحی اکشن `purge` در بک‌اند با پشتیبانی از فیلتر بازه زمانی (`from_date` و `to_date`)، فیلتر انبار و فیلتر ماژول.
   - پشتیبانی از حالت پیش‌نمایش بدون حذف (`dry_run=True`) جهت آگاهی کاربر از تعداد دقیق رکوردهای مشمول حذف پیش از اجرا.
   - اعمال تاییدیه امنیتی متنی سخت‌گیرانه (`PURGE_AUDIT_LOGS_CONFIRM`).
   - ثبت خودکار لاگ بحرانی در سیستم پس از انجام هر عملیات پاکسازی.

4. **موتور بازگردانی هوشمند به تاریخ مشخص (Audit-based Point-in-Time Rollback Engine):**
   - پیاده‌سازی متدهای پیش‌نمایش (`preview_point_in_time_rollback`) و اجرای اتمیک (`execute_point_in_time_rollback`).
   - معکوس‌سازی زنجیره‌ای کلیه رویدادهای ثبت‌شده از تاریخ انتخابی تا زمان حال به ترتیب معکوس زمانی (`-created_at`).
   - تضمین یکپارچگی داده‌ها با اجرای کلیه مراحل در تراکنش اتمیک دیتابیس (`transaction.atomic()`).
   - ارائه تفکیک تغییرات به ازای هر مدل و رکورد و هشدار تداخلات همزمان.

5. **بازطراحی بصری پیش‌نمایش تفاوت‌ها با هایلایت کلمه‌ای (Word-by-Word Visual Diff):**
   - پیاده‌سازی تابع `computeWordDiff` در فرانت‌اند جهت تجزیه و مقایسه واژگان.
   - هایلایت کلمات حذف‌شده در مقدار زنده کنونی با رنگ قرمز و خط‌خورده (`line-through bg-rose-200 text-rose-950 font-bold`).
   - هایلایت کلمات جدید و بازگردانی‌شده در مقدار هدف با رنگ سبز زمردی درخشان و پررنگ (`bg-emerald-200 text-emerald-950 font-black`).
   - فوکوس بالا و درک فوق‌العاده سریع چشمی تغییرات بدون نیاز به خواندن کل متن.

---

## ۲. فایل‌های تغییریافته و ایجادشده (Modified & Created Files)

### الف. لایه بک‌اند (Django Backend)
- [`backend/accounts/rollback_service.py`](file:///e:/warehouse%20project/backend/accounts/rollback_service.py):
  - اضافه شدن توابع `normalize_for_comparison` و `coerce_field_value`.
  - اضافه شدن متدهای `preview_point_in_time_rollback` و `execute_point_in_time_rollback`.
  - تنظیم متغیر ایزولاسیون سیگنال‌ها `_is_rollback_operation = True`.
- [`backend/accounts/views.py`](file:///e:/warehouse%20project/backend/accounts/views.py):
  - اضافه شدن توابع کمکی `get_table_storage_info` و `format_bytes_to_human`.
  - ارتقای متد `stats` جهت بازگرداندن آبجکت `storage`.
  - بازطراحی اکشن `purge` با پشتیبانی از `from_date`, `to_date`, `dry_run` و تاییدیه امنیتی.
  - اضافه شدن اکشن‌های `preview_point_in_time_rollback` و `execute_point_in_time_rollback`.

### ب. لایه فرانت‌اند (Angular Frontend)
- [`frontend/src/app/core/models/audit-log.model.ts`](file:///e:/warehouse%20project/frontend/src/app/core/models/audit-log.model.ts):
  - تعریف اینترفیس‌های `AuditStorageStats`، `PurgeRequest`، `PurgePreviewResponse`، `PointInTimeRollbackPreview`، `PointInTimeRollbackRecordItem`، `PointInTimeRollbackRequest` و `PointInTimeRollbackResult`.
- [`frontend/src/app/core/api/audit-api.service.ts`](file:///e:/warehouse%20project/frontend/src/app/core/api/audit-api.service.ts):
  - اضافه شدن متدهای `getPurgePreview`، `purgeLogs`، `previewPointInTimeRollback` و `executePointInTimeRollback`.
- [`frontend/src/app/components/audit/audit.ts`](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.ts):
  - پیاده‌سازی متد `computeWordDiff` برای استخراج توکن‌های تفاوت کلمه‌ای.
  - مدیریت استیت و متدهای مدال‌های پاکسازی لاگ‌ها و بازگردانی به تاریخ مشخص.
- [`frontend/src/app/components/audit/audit.html`](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.html):
  - اضافه شدن کارت KPI حجم مصرفی دیتابیس در تب ممیزی و نشست‌ها.
  - اضافه شدن دکمه‌های مدیریتی «پاکسازی لاگ‌ها» و «بازگردانی به تاریخ مشخص» در هدر صفحه.
  - بازطراحی پیش‌نمایش Revert Modal با هایلایت کلمه‌ای تفاوت‌ها.
  - پیاده‌سازی مدال پیشرفته پاکسازی لاگ‌ها با شمارش زنده رکوردهای مشمول و تاییدیه متنی.
  - پیاده‌سازی مدال Point-in-Time Rollback با انتخاب تاریخ/زمان، جدول تفکیکی رکوردها و تایید اتمیک.

---

## ۳. نتایج اعتبارسنجی و تست‌های اتوماسیون (Verification & Test Results)

| ردیف | مرحله / گیت | نوع آزمون | نتیجه |
| :--- | :--- | :--- | :--- |
| ۱ | **Gate 1** | آزمون نرمال‌سازی مقادیر و کستینگ فیلدهای مدل در `rollback_service` | **موفق (Passed)** |
| ۲ | **Gate 2** | آزمون استعلام حجم فیزیکی PostgreSQL و پیش‌نمایش `dry_run` پاکسازی | **موفق (Passed)** |
| ۳ | **Gate 3** | آزمون شبیه‌سازی زنجیره‌ای Point-in-Time Rollback در بک‌اند | **موفق (Passed)** |
| ۴ | **Gate 4** | آزمون تایپ‌های TypeScript و سرویس‌های API در فرانت‌اند | **موفق (Passed)** |
| ۵ | **Gate 5** | بیلد کامل و بدون خطای پروژه Angular (`ng build` با کد خروجی ۰) | **موفق (Passed)** |
| ۶ | **Gate 6** | آزمون یکپارچگی جامع سرتاسری (E2E Integration Tests) | **موفق (Passed)** |

</div>
