# طرح ارتقای پایداری و رفع آسیب‌پذیری‌های خروجی اکسل و پی‌دی‌اف در گزارش‌ساز (Report Builder Export Robustness)

<div dir="rtl" align="right">

این طرح برای رفع آسیب‌پذیری‌های شناسایی‌شده در سیستم خروجی تب گزارش‌ساز، یکپارچه‌سازی سطوح دسترسی کاربران و اعمال اعتبارسنجی‌های پیشگیرانه در فرانت‌اند و بک‌اند تدوین شده است.

---

## بررسی کاربر و موارد نیازمند تایید (User Review Required)

> [!IMPORTANT]
> **تغییر در مجوز خروجی گزارش‌ساز:**
> مجوز درخواست خروجی Excel/PDF در بک‌اند از `view_sys_export` (که مربوط به تب صدور فایل تغذیه MT است) به `view_sys_reports` (مجوز رسمی دسترسی به گزارش‌ساز) تغییر داده می‌شود تا تمام کاربران مجاز بتوانند از گزارش‌های خود خروجی بگیرند.

---

## تغییرات پیشنهادی به تفکیک لایه‌ها (Proposed Changes)

### ۱. لایه بک‌اند (Backend)

#### [MODIFY] [views.py](file:///e:/warehouse%20project/backend/reports/views.py)
- در کلاس `ExportReportView`، مجوز `require_menu_access('view_sys_export')` حذف شده و تنها مجوز دسترسی به گزارش‌ساز (`ReportsMenuAccess`) اعمال می‌شود.

#### [MODIFY] [engine.py](file:///e:/warehouse%20project/backend/reports/engine.py)
- اصلاح مرتب‌سازی `order_by` در حالت `_has_many_join` با `distinct()`: استفاده مستقیم از `'id'` به جای `'pk'` در هنگام انتخاب مقادیر متمایز جهت تطابق ۱۰۰٪ با استاندارد SQL پایگاه‌داده PostgreSQL و جلوگیری از خطای `ProgrammingError`.

---

### ۲. لایه فرانت‌اند (Frontend)

#### [MODIFY] [report-api.service.ts](file:///e:/warehouse%20project/frontend/src/app/core/api/report-api.service.ts)
- افزودن پرچم `SKIP_GLOBAL_ERROR_TOAST` به درخواست `export` در کانتکست HTTP تا اینترسپتور خطای سراسری پاسخ‌های باینری (Blob) را تخریب نکند و پیام خطا با متن دقیق سرور در خود کامپوننت پارس و به کاربر نمایش داده شود.

#### [MODIFY] [reports.ts](file:///e:/warehouse%20project/frontend/src/app/components/reports/reports.ts)
- اضافه کردن متد اعتبارسنجی مشترک برای شروط فیلتر، شروط `HAVING` و تداخل نام مستعار (`Alias Conflict`) در متد `exportReport` قبل از ارسال درخواست خروجی به سرور، تا در صورت وجود شروط ناقص در فرم، توست هشدار مناسب به کاربر نمایش داده شده و درخواست نامعتبر ارسال نشود.

---

## برنامه اعتبارسنجی و تست (Verification Plan)

### تست‌های خودکار (Automated Tests)
- اجرای سوئیت تست‌های گزارش‌ساز بک‌اند:
  ```powershell
  .\venv\Scripts\python manage.py test reports
  ```

### تست دستی و عملکردی (Manual Verification)
1. ساخت گزارش با فیلترهای مختلف در مرورگر و خروجی گرفتن اکسل و پی‌دی‌اف.
2. تست سناریوی شرط نیمه‌کاره/ناقص و مشاهده توست هشدار پیشگیرانه فرانت‌اند.
3. بررسی دانلود خروجی با کاربر غیرسوپریوزر دارای دسترسی گزارش‌ساز.

</div>
