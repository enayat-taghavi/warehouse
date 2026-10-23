# راهنمای اجرایی بسته ۲: یکپارچگی داده، آفلاین PWA و گارد خروج (Offline & Data Integrity)

این سند راهنمای گام‌به‌گام پیاده‌سازی **بسته ۲** از طرح پایدارسازی صفحه تنظیمات سامانه است.

---

## 🎯 اهداف بسته ۲
- جلوگیری از ارسال اشتباه درخواست‌های سنگین بکاپ و تنظیمات به صف آفلاین با توکن `SKIP_OFFLINE` (ایرادات ۳-۱، ۳-۲، ۳-۳).
- پاکسازی خودکار کش‌های مشتق از سرور در `IndexedDB` پس از ریستور موفقیت‌آمیز دیتابیس (ایراد ۳-۴).
- مسدودسازی فرآیند بازیابی در صورت وجود رکوردهای معلق در `syncQueue` (جلوگیری از نابودی کار کاربر).
- رفع باگ اسپینر نامتناهی در خطای بکاپ و پاکسازی کش تنظیمات در زمان خروج (ایرادات ۳-۱، ۳-۵).
- مسدودسازی قطعی دکمه ذخیره در صورت شکست واکشی فیلدهای پویا جهت جلوگیری از حذف `dyn_*` (ایراد ۲-۱).
- نگه‌داری نقشه خام کلیدها برای جلوگیری از حذف فیلدهای سفارشی ذخیره‌شده (ایراد ۲-۲).
- پیاده‌سازی ذخیره‌سازی دلتا (`Sparse Update`) برای جلوگیری از همزمانی بازنویسی و شلوغی دیتابیس (ایرادات ۲-۵، ۲-۷).
- پیاده‌سازی گارد خروج `settingsLeaveGuard` برای پیشگیری از پرش ناخواسته تغییرات فرم (ایراد ۲-۶).

---

## 🛠️ گام‌های اجرایی و فایل‌های هدف

### گام ۱: اصلاحات آفلاین و PWA (فاز ۲)
1. در `frontend/src/app/services/settings.ts`:
   - افزودن توکن `SKIP_OFFLINE` و `SKIP_GLOBAL_ERROR_TOAST` به متدهای `saveGlobalSettings`، `downloadBackup` و `restoreBackup`:
     ```ts
     context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
     ```
   - متد `getGlobalSettings` بدون `SKIP_OFFLINE` باقی بماند تا کش SWR برای لود سریع حفظ شود.
2. در `frontend/src/app/core/services/offline-db.ts`:
   - ساخت متد `clearServerDerivedCaches(): Promise<void>` برای پاک کردن جداول `apiCache`، `countTasks`، `docTasks`، `items`، `dynamicFields` و `syncCursors`.
   - جداول `syncQueue`، `photoQueue` و `syncErrors` به هیچ عنوان پاک نشوند.
3. در `frontend/src/app/components/settings/settings.ts`:
   - در متد `openRestoreConfirm()`، ابتدا بررسی شود که آیا `OfflineSyncService.getInstance().getQueueEntries()` رکوردی دارد یا خیر. در صورت وجود رکورد pending، پیام هشدار نمایش داده شده و اجازه ریستور داده نشود تا ابتدا سینک انجام شود.
   - در `finalize()` درخواست دانلود بکاپ، فلگ `isBackupLoading = false` ست شود تا اسپینر هرگز گیر نکند.
   - پس از ریستور موفقیت‌آمیز، تابع `clearServerDerivedCaches()` فراخوانی شود.

### گام ۲: حفاظت داده‌ها و فرم کثیف (فاز ۳)
1. **مسدودسازی در خطای فیلدهای داینامیک (ایراد ۲-۱):**
   - افزودن متغیر `dynamicFieldsLoadFailed = false` در `settings.ts`.
   - در صورت خطای API فیلدهای داینامیک، این متغیر `true` شده، دکمه ذخیره غیرفعال گردد و یک بنر خطای قرمز با دکمه «تلاش مجدد» در بالای تب‌های فیلد نمایش داده شود.
2. **حفظ کلیدهای ناشناس (ایراد ۲-۲):**
   - نگه‌داری نقشه خام کلیدها در `rawFieldPermsCounter` و `rawFieldPermsDoc`.
   - در زمان ذخیره، کلیدهای تغییریافته روی نقشه خام مرج شوند تا کلیدهای موجود در دیتابیس پاک نشوند.
3. **ارسال دلتا و ذخیره‌سازی تنک (ایرادات ۲-۵ و ۲-۷):**
   - پس از دریافت تنظیمات، مقدار اولیه در `originalSettings = structuredClone(this.settings)` کپی شود.
   - در متد `saveGlobalSettings`، مقادیر تغییریافته با `originalSettings` مقایسه شده و فقط آبجکت دلتا به متد ذخیره ارسال شود.
4. **گارد خروج `settingsLeaveGuard` (ایراد ۲-۶):**
   - ساخت فایل `frontend/src/app/core/guards/settings-leave.guard.ts`.
   - بررسی `isDirty` کامپوننت و نمایش دیالوگ تأییدیه قبل از خروج از مسیر `/settings`.
   - ثبت گارد در `app.routes.ts`.

---

## 🧪 دستورهای راستی‌آزمایی و تست

```bash
# تست‌های واحد فرانت‌اند
cd "E:/warehouse project/frontend"
npx ng test --include="**/settings*.spec.ts" --watch=false --browsers=ChromeHeadless
```
