<div dir="rtl" align="right">

# طرح اصلاح باگ‌های PWA و سیستم آفلاین

بازبینی انجام شده بسیار دقیق و کاملاً درست است! ایراداتی که مطرح شده‌اند (به ویژه بحث دوانگاره شدن سرویس، خطای ایندکس IndexedDB و نشت امنیتی پسورد) بسیار حیاتی هستند و پایداری سیستم را به شدت تهدید می‌کنند. 

بر اساس موارد مطرح شده، طرح اصلاحی زیر را برای رفع تمام باگ‌ها آماده کرده‌ام.

---

## Proposed Changes

### ۱. اصلاح دوگانگی `OfflineSyncService` (باگ ۱)

#### [MODIFY] [app.config.ts](file:///e:/warehouse%20project/frontend/src/app/app.config.ts)
- در `provideAppInitializer`، به جای `new OfflineSyncService()` از `OfflineSyncService.getInstance()` استفاده می‌شود تا کل اپلیکیشن از یک نمونه (Singleton) استفاده کند و UI به درستی وضعیت همگام‌سازی را نمایش دهد.

### ۲. اصلاح ایندکس Boolean در IndexedDB (باگ ۲)

#### [MODIFY] [offline-db.ts](file:///e:/warehouse%20project/frontend/src/app/core/services/offline-db.ts)
- نوع فیلد `dismissed` در `SyncErrorEntry` از `boolean` به `number` تغییر می‌کند (0 برای false و 1 برای true).

#### [MODIFY] [offline-sync.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/services/offline-sync.service.ts)
- در زمان ثبت خطا: `dismissed: 0`.
- در زمان پاک کردن خطا: `dismissed: 1`.
- کوئری گرفتن خطاها با `.where('dismissed').equals(0)` به درستی کار خواهد کرد.

### ۳ و ۴. جلوگیری از ذخیره پسورد و مدیریت خطای ۴۰۱ (باگ ۳ و ۴)

#### [MODIFY] [offline.interceptor.ts](file:///e:/warehouse%20project/frontend/src/app/core/interceptors/offline.interceptor.ts)
- **باگ ۳:** در ابتدای اینترسپتور، بررسی می‌کنیم که اگر درخواست مربوط به احراز هویت بود (`/api/auth/` یا `login`/`refresh`)، **به هیچ وجه** وارد مدار آفلاین نشود و مستقیماً به سرور برود. (همچنین از `SKIP_OFFLINE` استفاده صحیح‌تری می‌کنیم).
- **باگ ۵:** در تابع `handleOfflineGet`، زمانی که کش موجود نیست، به جای برگرداندن پاسخ موفق با کد ۵۰۳، `throwError(() => new HttpErrorResponse({ status: 503, ... }))` برمی‌گردانیم تا فرم‌ها و لیست‌ها داده نامعتبر را به جای لیست اشتباه نگیرند.

#### [MODIFY] [offline-sync.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/services/offline-sync.service.ts)
- **باگ ۴:** در متد `sendEntry`، اگر پاسخ `401 Unauthorized` بود، آن را به عنوان یک خطای موقت (قابل Retry) در نظر می‌گیریم تا از صف حذف نشود و داده از بین نرود. (فقط در صورت رسیدن به MAX_RETRIES به صندوق خطا می‌رود).

### ۵. مشکلات متوسط (باگ ۶، ۷ و ۸)

#### [MODIFY] [offline-sync.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/services/offline-sync.service.ts)
- **باگ ۶ (گیر کردن در `sending`):** در متد `initialize` کدی اضافه می‌کنیم که تمامی رکوردهای دارای استاتوس `sending` را به `pending` تغییر دهد تا اگر مرورگر ناگهان بسته شد، داده‌ها گیر نکنند.
- **جزئیات:** فراخوانی `cleanExpiredCache()` در تابع `initialize`.

#### [MODIFY] [offline.interceptor.ts](file:///e:/warehouse%20project/frontend/src/app/core/interceptors/offline.interceptor.ts)
- **باگ ۷ (حذف آفلاین):** در منطق `mergeWithQueue`، رکوردهایی که متد `DELETE` دارند را پیدا کرده و از لیست کش شده فیلتر/حذف می‌کنیم.

#### [MODIFY] [ngsw-config.json](file:///e:/warehouse%20project/frontend/ngsw-config.json)
- **باگ ۸ (تداخل کش):** بخش `dataGroups` را که API را توسط Service Worker کش می‌کرد به طور کامل حذف می‌کنیم تا تنها منبع حقیقت برای داده‌ها، دیتابیس `IndexedDB` باشد و از تداخل با مکانیسم `Lie-Fi` جلوگیری شود.

---

## Verification Plan

### Automated Tests
1. `npx ng build --configuration development` و `production`
2. اجرای سرورها و تونل

### Manual Verification
همان مراحل ذکر شده در گزارش را گام‌به‌گام دستی تست می‌کنم:
1. ذخیره یک داده در حالت آفلاین و چک کردن آپدیت شدن بنرها در هدر.
2. بستن تب در حین ارسال (وضعیت sending) و باز کردن مجدد آن برای تست بازگشت به pending.
3. چک کردن حذف رکوردهای دارای `DELETE` از لیست آفلاین.
4. تست Login در حالت آفلاین برای دیدن خطای قطع ارتباط (عدم ایجاد رکورد در IndexedDB).
5. تولید عمدی خطای 400 برای مشاهده مقدار گرفتن زنگوله و نمایش صندوق خطاها.

</div>
