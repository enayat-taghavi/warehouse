# گزارش جامع اصلاح و مدیریت هوشمند خطاهای حالت آفلاین (Graceful Offline Degradation)

<div dir="rtl" align="right">

تمام خطاهای نامطلوب، پیام‌های قرمز مزاحم و درخواست‌های ناموفق در زمان قطعی اتصال اینترنت در تب‌های **رهگیری تغییرات (Audit)**، **گزارش‌ساز پویا (Reports)** و **کارتابل‌های مدیر و سرپرست (Manager & Supervisor Review)** به‌طور کامل اصلاح و برطرف گردیدند.

---

## ۱. خلاصه تغییرات انجام‌شده (Changes Made)

| ردیف | فایل تغییر یافته | شرح اصلاحات |
| :---: | :--- | :--- |
| **۱** | [audit-api.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/api/audit-api.service.ts) | افزودن `SKIP_GLOBAL_ERROR_TOAST: true` به متدهای استعلام آمار (`getAuditStats` و `getLoginStats`) جهت جلوگیری از پرتاب خطای قرمز سرور در حالت آفلاین |
| **۲** | [audit.ts](file:///e:/warehouse%20project/frontend/src/app/components/audit/audit.ts) | محافظت از `loadStats` در برابر فراخوانی در زمان آفلاین و سرکوب توست‌های خطای ۵۰۳/شبکه در `loadAuditLogs` و `loadLoginLogs` |
| **۳** | [report-api.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/api/report-api.service.ts) | اعمال خودکار `SKIP_GLOBAL_ERROR_TOAST: true` روی کلیه درخواست‌های گزارش‌ساز پویا |
| **۴** | [report-store.ts](file:///e:/warehouse%20project/frontend/src/app/components/reports/report-store.ts) | کنترل وضعیت `isOffline()` در متدهای `loadEntities` و `refreshAll` جهت عدم ارسال ریکوئست ناموفق و جلوگیری از نمایش متن خطای سرور |
| **۵** | [manager-review.ts](file:///e:/warehouse%20project/frontend/src/app/components/manager-review/manager-review.ts) | بررسی وضعیت آنلاین بودن و جلوگیری از نمایش توست‌های خطای قرمز در متدهای `loadTasks`، `loadPoolTasks`، `loadDocTasks` و `loadDocPoolTasks` هنگام نبود کش |
| **۶** | [supervisor-dashboard.ts](file:///e:/warehouse%20project/frontend/src/app/components/supervisor/supervisor-dashboard/supervisor-dashboard.ts) | بررسی وضعیت آنلاین بودن و جلوگیری از نمایش توست‌های خطای قرمز در متدهای بارگذاری تسک‌های شمارش و اسناد مالی سرپرست در زمان آفلاین |

---

## ۲. نتایج اعتبارسنجی و تست (Validation Results)

- **کامپایل و بیلد فرانت‌اند:** دستور `npm run build` با موفقیت کامل و خروجی کد `0` بدون هیچ‌گونه خطای سینتکس یا تایپ‌اسکریپت اجرا شد.
- **رفتار آفلاین گزارش‌ساز:** بنر اختصاصی آفلاین در گزارش‌ساز بدون نمایش هیچ پاپ‌آپ خطای قرمزی نمایش داده می‌شود.
- **رفتار آفلاین رهگیری:** تب ممیزی در حالت آفلاین بدون توست خطای آمار باز شده و رکوردهای کش‌شده محلی با آرامش و ثبات کامل در دسترس کاربر هستند.
- **رفتار آفلاین کارتابل‌ها:** ورود به کارتابل مدیر و سرپرست در حالت آفلاین دیگر خطای قرمز "خطا در دریافت اطلاعات..." نشان نداده و صفحه پایدار می‌ماند.

---

> [!TIP]
> با این اصلاحات، سیستم فرانت‌اند رفتار کاملاً پایدار، مدرن و باوقاری در مواجهه با قطعی اتصال یا شبکه‌های کند (Lie-Fi) دارد.

</div>
