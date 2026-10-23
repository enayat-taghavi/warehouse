<div dir="rtl" align="right">

# گزارش جامع پایان عملیات اصلاح به‌روزرسانی‌های زنده، وب‌سوکت و عملیات آفلاین در رهگیری شمارش (Count Tracking Live Updates & Offline Fixes)

این سند گزارش نهایی اصلاحات فنی اعمال‌شده روی کامپوننت پیگیری وضعیت شمارش ([count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts)) و قالب آن ([count-tracking.html](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html)) را ارائه می‌نماید.

---

## ۱. جدول خلاصه تغییرات و نتایج (Changes Summary)

| بخش اصلاح‌شده | مشکل قبلی | راهکار پیاده‌سازی‌شده | وضعیت |
| :--- | :--- | :--- | :---: |
| **وب‌سوکت (`wsSub`)** | ریفرش کل ۱۰۰۰ تسک، پرتاب به صفحه ۱ و پاک‌شدن رکوردهای انتخابی با هر سیگنال | به‌روزرسانی نقطه‌ای (`updateTaskInPlace`) در حافظه، حفظ اکید `currentPage` و `selectedTaskIds` + دیبانس ۶۰۰ms | ✅ انجام شد |
| **استریم SWR (`swrSub`)** | تداخل داده با سایر نقش‌ها و عدم محاسبه مقادیر مغایرت و آمارها | تفکیک دقیق URL نقش رهگیری + عبور از خط لوله پیش‌پردازش استاندارد (`preprocessTasks`) | ✅ انجام شد |
| **عملیات گروهی (`bulkApprove` & `bulkCancel`)** | عدم بازتاب در UI هنگام آفلاین و پیام‌های خطای سردرگم‌کننده | اعمال خوش‌بینانه فوری (Optimistic Update)، اختصاص بج صف و پیام استاندارد ذخیره در صف آفلاین | ✅ انجام شد |
| **قالب جدول (`HTML Template`)** | عدم تمایز تسک‌های در انتظار ارسال آفلاین | تعبیه بج بصری زرد رنگ «صف» در ستون وضعیت برای رکوردهای `_offlinePending` | ✅ انجام شد |

---

## ۲. جزئیات تغییرات فنی پیاده‌سازی‌شده (Technical Implementations)

### الف) استانداردسازی پیش‌پردازش داده‌ها (`preprocessTasks`)
* متد `preprocessTask(t)` ایجاد شد تا فیلدهای سنگین محاسباتی نظیر `_discrepancy` (مغایرت)، `_computed_manager_name` (نام مدیر) و مدت‌زمان مراحل به شکل متمرکز و یکنواخت برای هر تسک محاسبه شود.
* متد `loadTasks(showLoading, preserveState)` بازنویسی شد تا در صورت به‌روزرسانی‌های پس‌زمینه (`preserveState = true`)، شماره صفحه کاربر و رکوردهای انتخاب‌شده حفظ شوند.

### ب) به‌روزرسانی موضعی و کنترل وب‌سوکت (`In-Place Task Update & Debounce`)
* متد `updateTaskInPlace(taskData)` پیاده‌سازی شد؛ در صورت ارسال آبجکت تسک توسط وب‌سوکت، رکورد مربوطه مستقیماً در آرایه محلی آپدیت شده و افکت هایلایت نوری (`status-updated-flash`) فعال می‌شود.
* یک استریم `wsTaskUpdateSubject` با اپراتور `debounceTime(600)` اضافه شد تا از هجوم درخواست‌های همزمان جلوگیری کند.

### ج) فیلتر دقیق استریم داده‌های زنده SWR
* شرط تطبیق URL استریم SWR از حالت عمومی به بررسی دقیق پارامترهای نقش رهگیری (`as_role=tracking`) ارتقا یافت تا از تداخل داده با کارتابل‌های سرپرست یا انبارگردان جلوگیری گردد.

### د) اعمال خوش‌بینانه و پشتیبانی آفلاین در عملیات گروهی
* توابع `bulkApproveGreenTasks`، `cancelAllocation` و `cancelSingleAllocation` اکنون بلافاصله وضعیت رکوردهای انتخاب‌شده را در جدول تغییر داده، پرچم `_offlinePending = true` تنظیم کرده و آمار مینی‌داشبورد را بازشماری می‌کنند.
* در صورت قطع بودن شبکه، پیام توست روشن و شفاف (`... در صف ارسال آفلاین قرار گرفت`) به مدیر نمایش داده می‌شود.

---

## ۳. نتایج اعتبارسنجی و بیلد پروژه (Verification & Build Results)

> [!TIP]
> **تست کامپایل فرانت‌اند (`npm run build`):**
> بیلد با موفقیت کامل و بدون هیچ‌گونه خطای تایپ یا تمپلیت به پایان رسید:
> ```text
> Application bundle generation complete. [30.081 seconds]
> Output location: dist/warehouse-app
> [patch-ngsw-530] ✔ ngsw-worker.js وصله شد: جلوگیری از غیرفعال شدن کش در هنگام قطعی کلودفلر.
> ```

---

## ۴. فایل‌های تغییریافته (Modified Files)
* [count-tracking.ts](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.ts)
* [count-tracking.html](file:///e:/warehouse%20project/frontend/src/app/components/count-tracking/count-tracking.html)
* [task_count_tracking_live_offline_fixes.md](file:///e:/warehouse%20project/Documents/CountTracking_Live_Offline_Fixes/task_count_tracking_live_offline_fixes.md)
* [task.md](file:///e:/warehouse%20project/Documents/task.md)
* [implementation_plan.md](file:///e:/warehouse%20project/Documents/implementation_plan.md)

</div>
