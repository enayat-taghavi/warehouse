# برنامه جامع اصلاح و مدیریت هوشمند خطاهای حالت آفلاین (Graceful Offline Handling)

<div dir="rtl" align="right">

این برنامه جهت برطرف‌سازی خطاهای آزاردهنده و قرمز در زمان قطعی اتصال اینترنت و پیاده‌سازی تجربه کاربری آرام و پایدار (Graceful Degradation) در بخش‌های **گزارش‌ساز (Reports)**، **رهگیری تغییرات (Audit)** و **کارتابل مدیر (Manager Review)** تدوین شده است.

---

## ۱. تحلیل و ریشه‌یابی مشکلات (Root Cause Analysis)

1. **تب گزارش‌ساز (Reports):**
   - سرویس `ReportApiService` با `SKIP_OFFLINE: true` طراحی شده اما فلگ `SKIP_GLOBAL_ERROR_TOAST` را روی کانتکست درخواست‌های اولیه (`getEntities`, `getTemplates`, `getFields`) ست نکرده بود؛ در نتیجه اینترسپتور سراسری خطا (`errorInterceptor`) خطای شبکه را به شکل یک توست قرمز مزاحم نمایش می‌داد.
2. **تب رهگیری تغییرات (Audit):**
   - متدهای دریافت آمار (`getAuditStats` و `getLoginStats`) برای دقت و عملکرد لحظه‌ای از کش عبور داده نمی‌شوند (`SKIP_OFFLINE: true`)، اما چون فاقد `SKIP_GLOBAL_ERROR_TOAST: true` بودند، در زمان آفلاین توست قرمز خطا روی صفحه می‌انداختند.
   - هندلرهای محلی خطا در لود لاگ‌ها در صورت آفلاین بودن نباید توست خطای عمومی سرور نمایش دهند.
3. **کارتابل مدیر (Manager Review):**
   - در صورت آفلاین بودن و خالی بودن کش اولیه (یا انبار جدید)، کامپوننت مستقیماً در بلوک `error` دستور `this.toast.error('خطا در دریافت اطلاعات کارتابل مدیر')` را فراخوانی می‌کرد بدون اینکه بررسی کند خطای پیش‌آمده ناشی از قطعی اینترنت / نبود کش آفلاین است.

---

## ۲. تغییرات پیشنهادی (Proposed Changes)

### الف) سرویس و کامپوننت رهگیری تغییرات (Audit Trail)
#### [MODIFY] [audit-api.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/api/audit-api.service.ts)
- افزودن توکن `SKIP_GLOBAL_ERROR_TOAST: true` به کانتکست متدهای `getAuditStats` و `getLoginStats` تا در حالت آفلاین هیچ توست قرمزی توسط اینترسپتور پرتاب نشود.

#### [MODIFY] [audit.ts](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.ts)
- بررسی وضعیت اتصال در متدهای `loadAuditLogs` و `loadLoginLogs`؛ در صورت آفلاین بودن از نمایش توست خطای قرمز عمومی سرور خودداری شده و صفحه در آرامش وضعیت داده‌های محلی را نمایش دهد.

---

### ب) سرویس و استور گزارش‌ساز پویا (Report Builder)
#### [MODIFY] [report-api.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/api/report-api.service.ts)
- تنظیم سراسری `SKIP_GLOBAL_ERROR_TOAST: true` در متد سازنده کانتکست `ctx()` برای تمامی درخواست‌های گزارش‌ساز، تا هیچ درخواست شکست‌خورده‌ای در حالت آفلاین منجر به خطای پاپ‌آپ قرمز نشود.

#### [MODIFY] [report-store.ts](file:///e:/warehouse%20project/frontend/src/app/components/reports/report-store.ts)
- کنترل وضعیت `isOffline()` قبل از تلاش برای لود مجدد موجودیت‌ها و قالب‌ها در زمان آفلاین و جلوگیری از ست کردن پیام خطای سرور در `store.error`، تا بنر آفلاین موجود در قالب صفحه به تنهایی و بدون تداخل کار کند.

---

### ج) کارتابل مدیر و سرپرست (Manager Review & Supervisor)
#### [MODIFY] [manager-review.ts](file:///e:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.ts)
- بررسی وضعیت `NetworkStatusService.getInstance().isOnline` و کدهای خطای ۵۰۳/آفلاین در متدهای `loadTasks`، `loadPoolTasks`، `loadDocTasks` و `loadDocPoolTasks`.
- جلوگیری از نمایش `this.toast.error(...)` زمانی که کاربر آفلاین است و کش در دستگاه وجود ندارد.

#### [MODIFY] [manager-review.html](file:///e:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.html)
- اطمینان از نمایش پیام راهنمای شفاف در وضعیت خالی (Empty State) جدول زمانی که کاربر آفلاین است و رکوردی در کش محلی وجود ندارد.

---

## ۳. برنامه اعتبارسنجی و تست (Verification Plan)

### تست‌های دستی و بررسی سناریوهای آفلاین:
1. **تست تب رهگیری (Audit):**
   - قطع اتصال شبکه (Offline Mode در DevTools یا شبیه‌سازی قطعی).
   - ورود به تب رهگیری تغییرات: اطمینان از عدم نمایش توست خطای قرمز «ارتباط با سرور برقرار نشد...» و نمایش صحیح کارت‌های آمار و داده‌های محلی کش‌شده.
2. **تست تب گزارش‌ساز (Reports):**
   - ورود به صفحه گزارش‌ساز در حالت آفلاین.
   - اطمینان از نمایش تمیز بنر آفلاین زرد/خاکستری بدون هیچ‌گونه توست خطای قرمز سرور.
3. **تست کارتابل مدیر (Manager Review):**
   - ورود به کارتابل مدیر در حالت آفلاین با یک انبار انتخاب‌نشده یا پس از پاکسازی کش.
   - اطمینان از عدم نمایش توست قرمز «خطا در دریافت اطلاعات کارتابل مدیر» و نمایش وضعیت خالی با پیام راهنمای مناسب.
4. **تست بازگشت به حالت آنلاین (Reconnection):**
   - برقراری مجدد اتصال اینترنت و بررسی لود خودکار و بدون نقص تمامی داده‌ها.

</div>
