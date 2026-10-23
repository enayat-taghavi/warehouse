# چک‌لیست وظایف پیاده‌سازی: مرکز عملیات و زیرساخت سازمان (Enterprise Operations Hub)

<div dir="rtl" align="right">

## 🔹 فاز ۱: زیرساخت هسته ماژول، لایوت دارک، لانچر و سد امنیتی سوپریوزر
- [x] ساخت گارد امنیتی اختصاصی `OperationsGuard` در `frontend/src/app/core/guards/operations.guard.ts` <!-- id: 0 -->
- [x] توسعه `AppPersonaService` و `SessionTabService` جهت پشتیبانی از قلمرو `operations` و متدهای ناوبری <!-- id: 1 -->
- [x] طراحی لایوت اختصاصی اتاق عملیات `OperationsLayoutComponent` با تم تیره نئونی SOC Cockpit <!-- id: 2 -->
- [x] ارتقای پورتال لانچر `AppLauncherComponent` و افزودن کارت سوم اختصاصی مرکز عملیات برای مدیران ارشد <!-- id: 3 -->
- [x] به‌روزرسانی کامپوننت سوئیچر در هدر `AppRoleSwitcherComponent` جهت پشتیبانی از قلمرو عملیات <!-- id: 4 -->
- [x] پیاده‌سازی کامپوننت داشبورد اجرایی کلان `OperationsCockpitComponent` با ۵ کارت پایش وضعیت زنده <!-- id: 5 -->
- [x] پیکربندی اولیه مسیر روتینگ `/app/operations` در `app.routes.ts` <!-- id: 6 -->
- [x] نگارش و ادغام ایجنت نگهبان ۲۶ (`audit_guardian_26_operations_hub_and_infrastructure_cockpit`) <!-- id: 7 -->

## 🔹 فاز ۲: استقرار صفحات عمیق و اختصاصی ارکان پنج‌گانه مرکز عملیات
- [x] پیاده‌سازی کامپوننت مستقل اسنپ‌شات‌ها و بازیابی اضطراری `OperationsSnapshotsComponent` با تم سایبر دارک <!-- id: 8 -->
- [x] ایجاد جدول ۷ نسخه اخیر اسنپ‌شات سرور، نمایش هش SHA-256، دکمه کپی و مودال تایید دو مرحله‌ای `ROLLBACK_CONFIRM` <!-- id: 9 -->
- [x] پشتیبانی از استخراج و دانلود اسنپ‌شات پایگاه‌داده محلی مرورگر (IndexedDB JSON) <!-- id: 10 -->
- [x] پیاده‌سازی کامپوننت اختصاصی تله‌متری ناوگان تبلت‌ها و حل تداخل `OperationsSyncMonitorComponent` <!-- id: 11 -->
- [x] رصد زنده تبلت‌ها، شناسه‌های تب (`X-Client-Tab-Id`)، عمق صف آفلاین `syncQueue` و خطاهای تداخل ۴۰۹ <!-- id: 12 -->
- [x] پیاده‌سازی موتور و مودال داوری ادغام سه‌سویه (3-Way Merge) با استراتژی‌های پذیرش سرور، باز ارسال کلاینت و حذف <!-- id: 13 -->
- [x] پیاده‌سازی کامپوننت مرکز حاکمیت دسترسی‌ها و گاوصندوق مجوزهای حساس `OperationsRbacGovernanceComponent` <!-- id: 14 -->
- [x] تفکیک و قفل انحصاری ۶ مجوز فوق‌حساس (Rollback, Backup, Delete, Purge, Freeze, Reset) روی سوپریوزر و ممیزی ادعاهای توکن <!-- id: 15 -->
- [x] به‌روزرسانی روتینگ اصلی `app.routes.ts` و اتصال مستقیم صفحات اختصاصی ارکان پنج‌گانه <!-- id: 16 -->
- [x] نگارش و ادغام ایجنت سخت‌گیر نگهبان ۲۷ (`audit_guardian_27_operations_hub_phase2_specialized_pillars`) <!-- id: 17 -->
- [x] اجرای موفقیت‌آمیز سوئیت کامل ۲۷ ایجنت نگهبان با قبولی ۱۰۰٪ سبز (`Exit Code 0`) <!-- id: 18 -->
- [x] اجرای بیلد تمیز کلاینت فرانت‌اند (`npm run build`) بدون کوچک‌ترین خطا (`Exit Code 0`) <!-- id: 19 -->

</div>
