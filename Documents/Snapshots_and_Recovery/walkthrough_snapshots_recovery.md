# گزارش جامع پیاده‌سازی و اعتبارسنجی: مرکز اسنپ‌شات‌های سرور، بازیابی سریع اضطراری و پشتیبان‌گیری محلی IndexedDB

<div dir="rtl" align="right">

## ۱. مرور کلی و دستاوردها (Executive Summary)

سامانه **«مرکز جامع اسنپ‌شات‌های سرور، بازیابی سریع در بحران (Disaster Recovery & Quick Rollback) و پشتیبان‌گیری محلی از پایگاه‌داده مرورگر (IndexedDB Snapshot)»** به صورت کاملاً یکپارچه و منطبق بر استانداردهای سازمانی و سد دفاعی تفکیک وظایف (SoD) پیاده‌سازی شد.

این سیستم قابلیت‌های حیاتی زیر را در اختیار سازمان قرار می‌دهد:
1. **اسنپ‌شات‌های سرور با چرخش خودکار (Server Snapshots & 7-Version Retention):** ذخیره‌سازی نسخه‌های کامل پایگاه‌داده به همراه ساختار متادیتای غنی هجری شمسی و هش SHA-256 و پاکسازی خودکار نسخه‌های فراتر از ۷ نسخه اخیر.
2. **بازیابی سریع و ایمن در بحران (Zero-Data-Loss Quick Rollback):** بازگردانی سرور به هر یک از ۷ اسنپ‌شات بدون نیاز به دانلود/آپلود فایل، همراه با تهیه اسنپ‌شات اضطراری پیش از بازگشت (`emergency_before_rollback_...`) جهت تضمین عدم اتلاف داده.
3. **پشتیبان‌گیری محلی از دیتابیس تبلت و مرورگر (Local IndexedDB Snapshot):** استخراج ساختاریافته کلیه جداول Dexie (اسناد، صف آفلاین، لاگ‌ها، تسک‌ها) به فرمت JSON با تاریخ و ساعت شمسی.
4. **رصد زنده در داشبورد سلامت سیستم (Health Dashboard Integration):** نمایش بنر وضعیت تاب‌آوری و آخرین اسنپ‌شات در داشبورد سلامت با امکان ناوبری مستقیم به تنظیمات پشتیبان‌گیری.

---

## ۲. تغییرات کلیدی در اجزای سیستم (Implemented Changes)

### الف) لایه بک‌اند و سرویس‌های بازیابی (Django Backend)
* **[accounts/backup_service.py](file:///e:/warehouse%20project/backend/accounts/backup_service.py):**
  - تابع `format_shamsi`: تبدیل زمان میلادی به تاریخ و زمان دقیق شمسی (`YYYY/MM/DD HH:MM:SS`).
  - تابع `rotate_snapshots`: مدیریت چرخش و نگهداری حداکثر ۷ نسخه اخیر و حذف نسخه‌های مازاد با متادیتای مربوطه.
  - تابع `create_server_snapshot`: تهیه اسنپ‌شات دیتابیس، ثبت هش امنیتی SHA-256 و ذخیره فایل متادیتای `.meta.json`.
  - تابع `get_snapshot_list` و `get_snapshot_summary`: ارائه اطلاعات تحلیلی و لیست نسخه‌ها.
  - تابع `quick_rollback_snapshot`: اعتبارسنجی فایل، ثبت اسنپ‌شات اضطراری قبل از بازگردانی، اجرای بازگشت و ثبت ردپا در `AuditLog`.
* **[config/views_backup.py](file:///e:/warehouse%20project/backend/config/views_backup.py):**
  - پیاده‌سازی کلاس‌های ویو `SnapshotListView`, `SnapshotCreateView`, `SnapshotRollbackView`, `SnapshotSummaryView` با سدهای دسترسی `CanManageDatabaseBackup` و `CanRestoreDatabase`.
* **[config/urls.py](file:///e:/warehouse%20project/backend/config/urls.py):**
  - ثبت اندپوینت‌های REST `/api/backup/snapshots/`، `/create/`، `/rollback/` و `/summary/`.

### ب) لایه فرانت‌اند و کلاینت آفلاین (Angular 19 & Dexie)
* **[offline-db.ts](file:///e:/warehouse%20project/frontend/src/app/core/services/offline-db.ts):**
  - متدهای `exportLocalDatabaseSnapshot()` و `downloadLocalDatabaseSnapshotFile()` جهت تخلیه امن و کامل دیتابیس لوکال بدون تداخل با تراکنش‌های باز.
* **[settings.ts](file:///e:/warehouse%20project/frontend/src/app/services/settings.ts):**
  - تعریف اینترفیس‌های `ServerSnapshot`, `SnapshotSummary` و متدهای ارتباط با اندپوینت‌های بک‌اند.
* **[settings-backup-tab.ts](file:///e:/warehouse%20project/frontend/src/app/components/settings/tabs/settings-backup-tab/settings-backup-tab.ts) & [HTML](file:///e:/warehouse%20project/frontend/src/app/components/settings/tabs/settings-backup-tab/settings-backup-tab.html):**
  - کارت مدرن اسنپ‌شات‌های سرور با جدول ۷ نسخه اخیر، بج‌های وضعیت و حجم دیتابیس.
  - مودال تایید دو مرحله‌ای بازگشت اضطراری با لزوم درج عبارت صریح `ROLLBACK_CONFIRM`.
  - گارد اعتبارسنجی صف آفلاین تبلت (`syncQueue`) پیش از بازگردانی.
  - بخش اختصاصی دانلود اسنپ‌شات دیتابیس محلی مرورگر با متادیتای تفکیک‌شده.
* **[health-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/health-dashboard/health-dashboard.ts):**
  - بنر پایش اسنپ‌شات سرور و هشدار زمان آخرین بک‌آپ با دکمه ناوبری سریع به تنظیمات پشتیبان‌گیری.

---

## ۳. نتایج ارزیابی و تضمین کیفیت (Quality Assurance & Verification)

| ردیف | مولفه ارزیابی | ابزار / اسکریپت تست | وضعیت | نتیجه |
| :---: | :--- | :--- | :---: | :--- |
| ۱ | **ایجنت نگهبان ۲۵ (سرویس‌های اسنپ‌شات و IndexedDB)** | `phase_guardian_approval.py` | 🟢 PASS | ایجاد اسنپ‌شات، چرخش ۷ نسخه، اعتبارسنجی SoD و تاییدیه صریح تایید شد |
| ۲ | **سوئیت کامل ۲۵ نگهبان سازمان** | `phase_guardian_approval.py` | 🟢 PASS | تمامی ۲۵ ایجنت نگهبان به صورت ۱۰۰٪ سبز پاس شدند |
| ۳ | **بررسی سلامت کانفیگ دیتابیس جنگو** | `python manage.py check` | 🟢 PASS | خطای سیستمی صفر (`System check identified no issues`) |
| ۴ | **کامپایل نهایی فرانت‌اند انگولار** | `npm run build` | 🟢 PASS | بیلد موفقیت‌آمیز کلاینت با کد خروجی ۰ |

---

## ۴. استانداردهای امنیتی رعایت‌شده (Security & Resilience Standards)

1. **تفکیک وظایف و کنترل دسترسی (SoD Protection):** فقط کاربران دارای مجوز صریح بازیابی مجاز به صدور فرمان Rollback هستند؛ کاربران عادی خطای 403 دریافت می‌کنند.
2. **محافظت از تغییرات تبلت‌های آفلاین (Zero-Data-Loss offline check):** اگر در صف همگام‌سازی تبلت داده‌های ارسال‌نشده وجود داشته باشد، سیستم بازگشت سریع را مسدود و هشدار شفاف صادر می‌کند.
3. **متادیتای هجری شمسی و لاگ ممیزی کامل (Audit Trail):** تمامی عملیات‌ها به انضمام تاریخ شمسی، شناسه کاربر، نام فایل و نتیجه در جدول امنیتی `AuditLog` مستندسازی می‌شوند.

</div>
