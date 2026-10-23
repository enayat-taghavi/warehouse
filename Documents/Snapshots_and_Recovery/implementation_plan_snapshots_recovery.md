<div dir="rtl" align="right">

# طرح پیاده‌سازی: مرکز جامع اسنپ‌شات‌های سرور، بازیابی سریع (Quick Rollback) و پشتیبان‌گیری محلی IndexedDB

این سند فنی طرح پیاده‌سازی و یکپارچه‌سازی سامانه اسنپ‌شات‌های سریع، بازیابی اضطراری در سرور و خروجی پایگاه‌داده محلی مرورگر را بر اساس تصمیمات اتخاذشده در مصاحبه Grill-Me تدوین می‌نماید.

---

## ۱. مرور نیازمندی‌ها و تصمیمات نهایی (User Review & Interview Decisions)

> [!NOTE]
> کلیه نیازمندی‌ها بر اساس ۴ تصمیم مصاحبه Grill-Me طراحی شده‌اند:
> ۱. **سیاست زمان‌بندی و چرخش:** اسنپ‌شات خودکار شبانه در سرور (ساعت ۲۴:۰۰) با نگهداری ۷ نسخه اخیر روزانه + امکان ثبت اسنپ‌شات دستی توسط مدیر ارشد با یک کلیک.
> ۲. **محل استقرار در رابط کاربری:** ادغام یکپارچه در تب «پشتیبان‌گیری و بازیابی» منوی تنظیمات (`/settings?tab=backup`) + نمایش ویجت وضعیت آخرین اسنپ‌شات در داشبورد سلامت سیستم.
> ۳. **تدابیر ایمنی و بازگشت اضطراری (Zero-Data-Loss Rollback):** ثبت اسنپ‌شات اضطراری از وضعیت فعلی دقیقاً قبل از اعمال بازگشت + اعتبارسنجی صف آفلاین تبلت (`syncQueue`) + مودال تایید با کلمه امنیتی و ثبت کامل در لاگ ممیزی (`AuditLog`).
> ۴. **پشتیبان‌گیری از پایگاه‌داده محلی مرورگر (IndexedDB Snapshot):** دانلود خروجی کامل و ساختاریافته JSON شامل تمامی جداول محلی Dexie (صف ارسال، کش اسناد و لاگ‌ها) با نام‌گذاری تاریخ و ساعت هجری شمسی.

---

## ۲. معماری فنی و تغییرات فایل‌ها (Proposed Architecture & File Changes)

| ردیف | لایه | فایل | نوع تغییر | شرح وظیفه |
| :---: | :---: | :--- | :---: | :--- |
| ۱ | Backend | `accounts/backup_service.py` | [MODIFY] | افزودن متدهای چرخش ۷ نسخه، ساخت اسنپ‌شات سروری، و آمار تجمیعی اسنپ‌شات‌ها |
| ۲ | Backend | `config/views_backup.py` | [MODIFY] | ایجاد اندپوینت‌های REST: لیست اسنپ‌شات‌ها، ایجاد دستی، بازگشت سریع با اسنپ‌شات اضطراری، و خلاصه سلامت |
| ۳ | Backend | `config/urls.py` | [MODIFY] | ثبت مسیرهای جدید URL در روت API بک‌اند |
| ۴ | Frontend | `frontend/src/app/services/settings.ts` | [MODIFY] | افزودن متدهای فراخوانی API اسنپ‌شات‌ها و بازگردانی سریع |
| ۵ | Frontend | `frontend/src/app/core/services/offline-db.ts` | [MODIFY] | متد استخراج ساختاریافته JSON از تمام جداول محلی Dexie با فیلتر داده‌های حساس |
| ۶ | Frontend | `frontend/src/app/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts` | [MODIFY] | منطق تعاملی، بارگذاری لیست اسنپ‌شات‌ها، ایجاد دستی، بازگشت سریع و دانلود بک‌آپ IndexedDB |
| ۷ | Frontend | `frontend/src/app/components/settings/tabs/settings-backup-tab/settings-backup-tab.html` | [MODIFY] | طراحی کارت بصری مدرن اسنپ‌شات‌ها، جدول ۷ نسخه اخیر با تاریخ شمسی و دکمه‌های عملیاتی |
| ۸ | Frontend | `frontend/src/app/components/health-dashboard/health-dashboard.ts` | [MODIFY] | افزودن ویجت زنده وضعیت آخرین اسنپ‌شات سرور با پیوند سریع به تب تنظیمات |
| ۹ | Testing | `personnel/phase_guardian_approval.py` | [MODIFY] | پیاده‌سازی ایجنت نگهبان ۲۵ (`audit_guardian_25_snapshots_disaster_recovery_and_indexeddb`) |

---

## ۳. جزئیات گام‌به‌گام پیاده‌سازی (Step-by-Step Implementation)

### گام اول: بک‌اند (Django REST Framework & PostgreSQL)
1. **متد `create_server_snapshot(user, description)` در `accounts/backup_service.py`:**
   - ساخت فایل دامپ فشرده باینری با نام استاندارد `snapshot_YYYYMMDD_HHMMSS.dump`.
   - ذخیره فایل متادیتا شامل هش SHA-256، تاریخ شمسی، نام کاربر و حجم فایل.
   - اجرای خودکار الگوریتم چرخش و پاکسازی فایل‌های مازاد بر ۷ نسخه قدیمی.
   - ثبت رویداد با سطح `warning` در جدول `AuditLog`.
2. **متد `quick_rollback_snapshot(filename, user, confirm_text)`:**
   - احراز دقیق `confirm_text == 'ROLLBACK_CONFIRM'`.
   - بررسی مجوز دسترسی مدیر ارشد (`CanRestoreDatabase`).
   - ایجاد یک اسنپ‌شات ایمنی فوری (`emergency_before_rollback_...`) قبل از دست زدن به دیتابیس.
   - قطع کانکشن‌های فعال دیتابیس و اجرای `pg_restore`.
   - ثبت رویداد بحرانی در `AuditLog`.
3. **ویوهای REST در `config/views_backup.py`:**
   - `GET /api/backup/snapshots/`: بازگرداندن ۷ اسنپ‌شات اخیر با فیلدهای تاریخ شمسی، حجم و وضعیت سلامت.
   - `POST /api/backup/snapshots/create/`: ساخت اسنپ‌شات دستی در سرور.
   - `POST /api/backup/snapshots/rollback/`: بازگردانی سریع سروری.
   - `GET /api/backup/snapshots/summary/`: آمار خلاصه جهت نمایش در داشبورد سلامت.

### گام دوم: فرانت‌اند (Angular 19 & Dexie Offline DB)
1. **اکسپورت کامل پایگاه داده محلی مرورگر در `offline-db.ts`:**
   - ایجاد متد `exportLocalDatabaseSnapshot()`:
     - خواندن تمام جداول محلی شامل `syncQueue`, `conflictDrafts`, `appMetadata`, `productsCache`, ...
     - فرمت‌بندی به صورت فایل JSON کم‌حجم با متادیتای نسخه، کلاینت تب و زمان هجری شمسی.
     - دانلود خودکار فایل در مرورگر با نام `indexeddb_snapshot_1405-06-14_HH-MM.json`.
2. **رابط کاربری تب پشتیبان‌گیری در تنظیمات (`settings-backup-tab`):**
   - افزودن بخش بالایی با طراحی مدرن کارت متریال شامل:
     - نوار وضعیت و شمارنده اسنپ‌شات‌ها (مثلاً `۴ از ۷ نسخه مجاز`).
     - دکمه بنفش شیک «+ ایجاد اسنپ‌شات لحظه‌ای در سرور».
     - دکمه لاجوردی «دانلود نسخه پشتیبان تبلت (IndexedDB)».
     - جدول ۷ نسخه اخیر با ستون‌های: نام فایل، تاریخ و ساعت شمسی، حجم فایل، ایجادکننده، وضعیت هش SHA-256، و دکمه قرمز عملیات «بازگشت سریع».
   - مودال تایید بازگشت سریع با بررسی صف آفلاین تبلت و ورود عبارت `ROLLBACK_CONFIRM`.
3. **ویجت داشبورد سلامت (`health-dashboard.ts`):**
   - نمایش کارت پایش پشتیبان‌گیری در ماتریس سلامت با نمایش فاصله زمانی تا آخرین اسنپ‌شات و دکمه پیوند به تنظیمات.

---

## ۴. طرح اعتبارسنجی و آزمون (Verification & Testing Plan)

### الف) آزمون‌های خودکار نگهبان ۲۵ (Automated Guardian Agent 25)
- فراخوانی مستقیم متد ایجاد اسنپ‌شات و تایید ایجاد فایل و متادیتا.
- بررسی الگوریتم چرخش ۷ نسخه.
- اعتبارسنجی هش SHA-256 فایل‌های اسنپ‌شات.
- آزمون ممانعت از بازگشت در صورت عدم تطابق متن تاییدیه `ROLLBACK_CONFIRM`.
- آزمون سد دسترسی کاربر غیرمجاز (403 Forbidden).
- ثبت رویداد در `AuditLog`.
- اجرای کامل هر ۲۵ ایجنت نگهبان در `phase_guardian_approval.py` با نتیجه ۱۰۰٪ PASS.

### ب) اعتبارسنجی بیلد فرانت‌اند
- اجرای `npm run build` در `frontend` و تایید Exit Code 0 بدون خطای تایپ یا تمپلیت.

</div>
