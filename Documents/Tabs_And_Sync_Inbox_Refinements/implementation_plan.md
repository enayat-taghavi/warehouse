<div dir="rtl" align="right">

# طرح اجرایی بازآرایی تب‌ها، وضعیت تب تغذیه، رفع مشکل صندوق خطاها و یکپارچه‌سازی دکمه‌های اتصال (ویرایش ۲)

این طرح بر اساس بازخورد کاربر به‌روزرسانی شده است: ماژول و تب **«صدور فایل برای تغذیه»** به طور کامل از منوها، روت‌ها و تعاریف حذف می‌شود؛ اما تب **«مدیریت و تغذیه MT26/49»** در منو باقی می‌ماند و صفحه آن با طراحی مدرن و حرفه‌ای وضعیت **«در دست توسعه برای نسخه‌های آینده (Roadmap)»** را نمایش خواهد داد. همچنین کلیه دکمه‌های متصل تکراری در تب‌ها حذف شده و صندوق خطاهای همگام‌سازی در هدر نوار بالا کاملاً فعال و تعاملی خواهد شد.

---

## ۱. جدول تطبیق نیازمندی‌ها و وضعیت جدید

| شماره | عنوان مورد | تصمیم و نحوه پیاده‌سازی جدید |
| :--- | :--- | :--- |
| **۱** | **حذف تب «صدور فایل برای تغذیه»** | حذف کامل از سایدبار و نوار ناوبری سیستم و انبار (`layout.ts`)، پاکسازی روت آن از `app.routes.ts` و مجوزهای آن در گاردها |
| **۲** | **تب «مدیریت و تغذیه MT26/49»** | **باقی ماندن تب در سایدبار**؛ افزودن نشانگر وضعیت «به‌زودی» به همراه بازطراحی شیک صفحه `feeding.html` جهت نمایش حالت مدرن **«در دست توسعه برای فازهای آتی»** |
| **۳** | **حذف دکمه‌های «متصل» در تب‌ها** | پاکسازی تگ `<app-offline-pending-badge mode="header">` از هدر ۱۱ صفحه فرعی و باقی ماندن یک نشانگر واحد در نوار بالای سراسری (`layout.html`) |
| **۴** | **رفع باگ دکمه صندوق خطاهای همگام‌سازی** | پیاده‌سازی کامل توابع و متغیرهای پشت صحنه صندوق در `layout.ts` و اتصال مستقیم به `OfflineSyncService` جهت باز شدن، تلاش مجدد (Retry)، مشاهده داده و پاکسازی |
| **۵** | **تعاملی و واکنش‌گرا شدن خطای همگام‌سازی در منوی دکمه متصل** | کادر خطا در پاپ‌اور دکمه متصل کلیک‌پذیر شده و با کلیک کاربر، پاپ‌اور بسته و پنجره صندوق خطاهای همگام‌سازی در هدر باز می‌شود |

---

## ۲. جزئیات تغییرات به تفکیک فایل‌ها

### الف) نوار ناوبری و هدر سراسری (`layout`)

#### [MODIFY] [layout.ts](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.ts)
* حذف آیتم `{id:'export', label:'صدور فایل برای تغذیه', ...}` از آرایه‌های `SYSTEM_NAV_ITEMS` و `WAREHOUSE_NAV_ITEMS`.
* حفظ آیتم `{id:'feeding', label:'مدیریت و تغذیه MT26/49', ...}` با برچسب یا نشانگر اطلاع‌رسانی توسعه آینده.
* پیاده‌سازی متغیرها و متدهای مدیریت صندوق خطاها:
  * `isSyncErrorsOpen: boolean = false`
  * `syncErrors: SyncErrorEntry[] = []`
  * `syncErrorCount: number = 0`
  * `expandedErrorId: number | null = null`
  * `toggleSyncErrors()` و `closeSyncErrors()`
  * `loadSyncErrors()`
  * `dismissSyncError(id: number)` و `dismissAllSyncErrors()`
  * `retrySyncError(id: number)`
  * `formatSyncTime(timestamp: number)`
  * `toggleErrorPayload(id: number)` و `formatErrorPayload(body: any)`
  * `openSyncErrorsFromBadge()` جهت باز شدن صندوق هنگام کلیک روی خطا در پاپ‌اور دکمه متصل.
* اشتراک در `OfflineSyncService.errorCount$` و `OfflineSyncService.rejected$` جهت بروزرسانی همزمان تعداد خطاها.

#### [MODIFY] [layout.html](file:///e:/warehouse%20project/frontend/src/app/components/layout/layout.html)
* اتصال رویداد خروجی `(openSyncInbox)="openSyncErrorsFromBadge()"` روی تگ `<app-offline-pending-badge>` سراسری.

---

### ب) بازطراحی صفحه تغذیه اطلاعات (`feeding`)

#### [MODIFY] [feeding.html](file:///e:/warehouse%20project/frontend/src/app/components/feeding/feeding.html)
* حذف نشانگر اضافه `<app-offline-pending-badge mode="header" />`.
* بازطراحی محتوای صفحه به یک کارت شیک و مدرن با تم سازمانی و جذاب (شامل آیکون متحرک، تگ «در دست توسعه - نسخه آینده»، توضیحات شفاف درباره ماژول‌های اتصال خودکار MT26 و MT49، زمان‌بندی انتشار و دکمه بازگشت به داشبورد) تا کاربر هنگام ورود کاملاً مطلع شود این بخش در حال آماده‌سازی است.

---

### ج) کامپوننت وضعیت اتصال و آفلاین (`offline-pending-badge`)

#### [MODIFY] [offline-pending-badge.component.ts](file:///e:/warehouse%20project/frontend/src/app/shared/components/offline-pending-badge/offline-pending-badge.component.ts)
* افزودن رویداد خروجی `@Output() openSyncInbox = new EventEmitter<void>()`.
* تبدیل کادر نمایش خطا در پاپ‌اور به یک دکمه/کارت تعاملی با افکت Hover و رویداد کلیک جهت فراخوانی `openSyncInbox`.

---

### د) پاکسازی روت‌ها و گاردهای ماژول صدور فایل

#### [MODIFY] [app.routes.ts](file:///e:/warehouse%20project/frontend/src/app/app.routes.ts)
* حذف روت `{ path: 'export', component: Placeholders }`.

#### [MODIFY] [auth.guard.ts](file:///e:/warehouse%20project/frontend/src/app/core/auth/auth.guard.ts)
* حذف مپینگ مجوز `export` از جدول قوانین دسترسی.

---

### هـ) پاکسازی نشانگرهای تکراری «متصل» از هدر صفحات

حذف تگ‌های `<app-offline-pending-badge mode="header" />` از صفحات زیر:
1. `src/app/components/dashboard/dashboard.html`
2. `src/app/components/users/users.html`
3. `src/app/components/projects/projects.html`
4. `src/app/components/settings/settings.html`
5. `src/app/components/docs/docs.html`
6. `src/app/components/dispatch/dispatch.html`
7. `src/app/components/customs/customs.html`
8. `src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.html`
9. `src/app/components/manager-review/manager-review.html`
10. `src/app/components/counter/counter-dashboard/counter-dashboard.html`
11. `src/app/components/count-tracking/count-tracking.html`

---

## ۳. برنامه راستی‌آزمایی (Verification Plan)

### تست‌های دستی و بصری
1. **بررسی سایدبار:** بررسی حذف کامل «صدور فایل برای تغذیه» و باقی ماندن «مدیریت و تغذیه MT26/49».
2. **ورود به صفحه تغذیه (`/feeding`):** مشاهده ظاهر مدرن و شفاف صفحه وضعیت «در دست توسعه برای نسخه‌های آینده».
3. **بررسی هدر صفحات:** اطمینان از پاکسازی دکمه‌های متصل داخل صفحات و وجود تنها یک نشانگر در نوار بالای Layout.
4. **تست عملکرد دکمه صندوق خطاهای همگام‌سازی:** کلیک روی آیکون صندوق/زنگوله و تست باز/بسته شدن، تلاش مجدد و پاکسازی خطاها.
5. **تست ارتباط منوی دکمه متصل با صندوق خطا:** کلیک روی خطای همگام‌سازی در منوی پاپ‌اور و اطمینان از باز شدن خودکار صندوق.
6. **بررسی عدم وجود خطای بیلد:** اجرای فرآیند کامپایل تایپ‌اسکریپت و آنگولار بدون خطا.

</div>
